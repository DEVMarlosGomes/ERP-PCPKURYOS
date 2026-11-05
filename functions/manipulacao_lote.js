"use strict";
/* Manipulação em lote do P&D — o que só o servidor grava (spec 2026-11-04 §7; D-03, D-11, D-12).
 *
 * Callable manipulacaoLoteServidor({tenant, loteId, acao, ...}):
 *   gerar_ordem           versão nova JÁ TRAVADA de pd_formulas por amostra + ordem do lote (pré-mistura
 *                         por fase + adições por amostra), montada dos itens dessas versões, num update()
 *   registrar_pesagens    pesagem por linha da ordem; desvio acima de max(0,01 g; 1 %) exige motivo
 *   corrigir_pesagem      registro novo que aponta o anterior (estorno) — nunca sobrescreve
 *   conferir_pesagem      segundo usuário (≠ quem pesou); ligado por padrão (config/pdLote)
 *   registrar_manipulacao assinaturas SHA-256 reconferidas + conciliação de massa → lote "manipulado"
 *   aprovar_critico       ADM ou módulo aprovar_critico_pd, pessoa diferente da autora do motivo
 *
 * As regras puras são as do editor do lote (manipulacao_lote_motor.js, gerado do motor do CRM).
 * Perfil, tenant e papel vêm do uid — nunca do que a tela mandou. Ordem: o lote é travado por
 * transação ("gerando_ordem", revisão +1), as versões são reservadas por transação e tudo
 * (versões, itens, fases, ordem, CRM, fila de MP nova) entra num único update() multi-caminho; se
 * a gravação falhar o lote volta a rascunho com o erro no histórico. Pesagem, conferência,
 * aprovação e registro só mudam o nó do lote, cada um numa transação nesse nó. */
const crypto = require("crypto");
const M = require("./manipulacao_lote_motor");
const Cambio = require("./cambio");

const COLECAO = "pd_manipulacao_lotes";
const GERANDO_VALIDADE_MS = 2 * 60 * 1000;

const sha256 = (t) => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");
const lista = (o) => Object.entries(o || {}).map(([id, v]) => Object.assign({}, v || {}, {id: (v && v.id) || id}));
const falha = (code, message, details) => Object.assign(new Error(message), {code, details: details || undefined});
const num = (v) => { const n = Number(String(v == null ? "" : v).replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const texto = (v) => String(v == null ? "" : v).trim();
const fmt = (n) => Number(n).toLocaleString("pt-BR", {maximumFractionDigits: 4});
const ativosDe = (lote) => Object.keys(lote.membros || {}).filter((r) => lote.membros[r] && lote.membros[r].status_membro !== "removido");
const codigoDe = (lote, r) => (lote.membros && lote.membros[r] && lote.membros[r].codigo_amostra) || r;
const rotuloStatus = (s) => M.ROTULO_STATUS_LOTE[s] || s || "sem status";
const chaves = (o) => Object.keys(o || {}).sort((a, b) => a.localeCompare(b, "en", {numeric: true}));

// O RTDB não guarda undefined (e null num objeto novo é só ausência): tira os dois.
function semVazios(v) {
  if (Array.isArray(v)) return v.map(semVazios);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== null).map(([k, x]) => [k, semVazios(x)]));
  }
  return v;
}

/* Quem chama: perfil ativo, tenant do perfil (o pedido só pode repetir o mesmo). */
function identidade(user, uid, tenantPedido) {
  if (!user || !user.role || user.role === "pending" || user.desativado === true) throw falha("permission-denied", "Seu perfil está inativo ou pendente.");
  const tenant = user.tenant_id || (user.role === "admin" ? "kuryos" : "");
  if (!tenant || (tenantPedido && tenantPedido !== tenant)) throw falha("permission-denied", "Seu usuário não tem acesso a este tenant.");
  return {
    uid, tenant, nome: user.nome || user.name || user.email || uid,
    podeLote: M.podeManipularLote(user),
    podeAprovarCritico: user.role === "admin" || Boolean(user.modulos && user.modulos.aprovar_critico_pd === true),
  };
}

/* Cotação da fórmula (a mesma do CRM: fixada → do dia → gravada → padrão). */
const taxaDaFormula = (formula, cambio) => Cambio.cotacaoDaFormula(formula || {}, cambio).taxa;

/* Custo do item pela mesma conta do CRM (firebaseApi.pdItemCosts). */
function custosDoItem(pct, ing, taxa) {
  const bruto = ing.price_usd;
  const usd = bruto === null || bruto === undefined || bruto === "" || !Number.isFinite(Number(bruto)) ? null : Number(bruto);
  const precoKg = usd == null ? num(ing.price_per_kg) : usd * taxa;
  return {cost_brl: Number((pct / 100 * precoKg).toFixed(6)), cost_kg_usd: usd == null ? 0 : usd, cost_brl_via_cambio: usd == null ? null : Number(precoKg.toFixed(4))};
}

/* Contexto do tenant já lido (coleções planas como objetos do banco). */
function contexto(raw) {
  const agrupar = (itens) => {
    const m = new Map();
    for (const it of itens) { if (!m.has(it.formula_id)) m.set(it.formula_id, []); m.get(it.formula_id).push(it); }
    return m;
  };
  const formulas = lista(raw.pd_formulas);
  const vigente = new Map();
  for (const f of formulas) {
    const a = vigente.get(f.development_id);
    if (!a || num(f.version) > num(a.version)) vigente.set(f.development_id, f);
  }
  return {
    requests: new Map(lista(raw.pd_requests).map((x) => [x.id, x])),
    devs: new Map(lista(raw.pd_developments).map((x) => [x.id, x])),
    formulas: new Map(formulas.map((f) => [f.id, f])), formulasLista: formulas, vigente,
    itensPorFormula: agrupar(lista(raw.pd_formula_items)), fasesPorFormula: agrupar(lista(raw.pd_formula_phases)),
    samples: new Map(lista(raw.crm_samples).map((x) => [x.id, x])),
    materiais: new Map(lista(raw.materiais).map((x) => [x.id, x])),
    lotes: lista(raw.lotes), cambio: raw.cambio || null, fila: raw.fila || {},
    conferencia: raw.conferencia !== false,
  };
}

const variacaoDe = (ctx, m) => {
  const s = ctx.samples.get(m.sample_id);
  const vs = (s && s.variacoes) || [];
  const idx = Array.isArray(vs) ? vs.findIndex((v) => v && v.id === m.variacao_id) : -1;
  return {idx, variacao: idx >= 0 ? vs[idx] : {}};
};

function itensDeOrigem(lote, ctx) {
  const ids = [lote.matriz && lote.matriz.tipo === "amostra" ? lote.matriz.ref_id : null,
    ...ativosDe(lote).map((r) => lote.membros[r].formula_id_antes)].filter(Boolean);
  return ids.flatMap((fid) => ctx.itensPorFormula.get(fid) || []);
}

/* Tudo o que precisa valer para a ordem sair (§7): status, elegibilidade, fórmula de antes intacta,
 * gramas, níveis pelas fontes, motivos/aprovações, 100 % por membro. Devolve a ordem montada. */
function conferirOrdem(lote, ctx) {
  const problemas = [];
  const ativos = ativosDe(lote);
  if (ativos.length < M.MIN_MEMBROS) problemas.push(`O lote precisa de pelo menos ${M.MIN_MEMBROS} amostras ativas.`);
  if (ativos.length > M.MAX_MEMBROS) problemas.push(`No máximo ${M.MAX_MEMBROS} amostras por lote.`);
  for (const r of ativos) {
    const m = lote.membros[r];
    const cod = codigoDe(lote, r);
    const motivo = M.motivoInelegivel({request: ctx.requests.get(r), variacao: variacaoDe(ctx, m).variacao, lotesAbertos: ctx.lotes, loteAtualId: lote.id});
    if (motivo) problemas.push(`${cod}: ${motivo}`);
    if (!m.development_id || !ctx.devs.has(m.development_id)) problemas.push(`${cod}: solicitação sem desenvolvimento no P&D.`);
    const v = ctx.vigente.get(m.development_id);
    if (((v && v.id) || null) !== (m.formula_id_antes || null)) {
      problemas.push(`${cod}: a fórmula mudou desde que o lote foi montado (agora v${v ? v.version : "—"}). Tire a amostra do lote e inclua de novo.`);
    } else if (m.formula_id_antes && M.assinaturaItens(ctx.itensPorFormula.get(m.formula_id_antes) || []) !== m.assinatura_antes) {
      problemas.push(`${cod}: a fórmula v${m.versao_antes} foi editada fora do lote. Tire a amostra do lote e inclua de novo.`);
    }
    if (M.quantidadeEmGramas(m) == null) problemas.push(`${cod}: informe a quantidade em g (ou a densidade, se o pedido é em ml).`);
  }
  const itensOrigem = itensDeOrigem(lote, ctx);
  const ingredientes = M.classificarIngredientes(lote.ingredientes || {}, {materiais: ctx.materiais, itensOrigem});
  const matrizCelulas = (lote.matriz && lote.matriz.celulas) || {};
  for (const p of M.pendencias({ingredientes, celulas: lote.celulas || {}, matrizCelulas, motivos: lote.motivos || {}, aprovacoes: lote.aprovacoes_criticas || {}, membros: ativos})) {
    problemas.push(`${codigoDe(lote, p.request_id)}: ${p.motivo}`);
  }
  const fech = M.fechamentoPorMembro(lote.celulas || {}, ativos);
  for (const r of ativos) if (!fech[r].ok) problemas.push(`${codigoDe(lote, r)}: a soma dá ${fmt(fech[r].soma)} % — a fórmula precisa fechar 100 %.`);
  const membros = ativos.map((r) => Object.assign({}, lote.membros[r], {request_id: r}));
  const ordem = M.ordemDoLote({ingredientes, celulas: lote.celulas || {}, membros, preMistura: lote.pre_mistura || {}, perdaPct: lote.perda_pct, minimoPesavelG: lote.minimo_pesavel_g});
  if (!ordem.reconciliacao.ok) problemas.push("A ordem do lote não bate com as ordens individuais — nada foi gravado; avise o suporte.");
  return {problemas, ativos, ingredientes, ordem, itensOrigem, matrizCelulas};
}

// Solicitação de MP nova que já cobre este ingrediente: a que tem como origem o item de mesma
// chave (material+fase) numa fórmula de origem do lote (PD-03: nunca duplica a solicitação).
function solicitacaoDaMpNova(ing, itensOrigem, fila) {
  const k = M.chaveMaterialFase(ing);
  const fontes = itensOrigem.filter((it) => it.mp_nova && M.chaveMaterialFase(M.itemParaIngrediente(it)) === k);
  for (const it of fontes) {
    const achada = Object.entries(fila || {}).find(([, s]) => s && s.origens && s.origens[`${it.formula_id}__${it.id}`]);
    if (achada) return achada[0];
  }
  return null;
}

const SEM_COPIA = new Set(["id", "tenant_id", "version", "development_id", "status", "locked", "locked_at", "locked_by", "locked_by_name", "locked_motivo",
  "created_at", "created_by", "created_by_name", "updated_at", "parent_formula_id", "origem_lote", "items"]);

/* Caminhos planos da ordem: versões travadas + itens + fases + current_version + ordem + CRM + fila. */
function montarOrdem({lote, ctx, conf, versoes, novoId, autor, agora, tenant, revisao}) {
  const T = `erp/${tenant}`;
  const L = `${T}/${COLECAO}/${lote.id}`;
  const u = {};
  const assinaturas = {};
  const versoesOrdem = {};
  const avisos = [...conf.ordem.avisos];
  const difs = M.diferencas({ingredientes: conf.ingredientes, celulas: lote.celulas || {}, matrizCelulas: conf.matrizCelulas});
  const matrizF = lote.matriz && lote.matriz.ref_id ? ctx.formulas.get(lote.matriz.ref_id) : null;
  const origemLote = semVazios({lote_id: lote.id, codigo: lote.codigo, matriz: {tipo: lote.matriz && lote.matriz.tipo, ref_id: lote.matriz && lote.matriz.ref_id, versao: lote.matriz && lote.matriz.versao}});
  for (const r of conf.ativos) {
    const m = lote.membros[r];
    const cod = codigoDe(lote, r);
    const antes = m.formula_id_antes ? ctx.formulas.get(m.formula_id_antes) : null;
    const base = antes || matrizF || {};
    const fid = novoId();
    const versao = versoes[r];
    const taxa = taxaDaFormula(base, ctx.cambio);
    const meta = Object.fromEntries(Object.entries(base).filter(([k]) => !SEM_COPIA.has(k)));
    u[`${T}/pd_formulas/${fid}`] = semVazios(Object.assign(meta, {
      id: fid, tenant_id: tenant, development_id: m.development_id, version: versao, status: "DRAFT",
      indice_perdas: num(lote.perda_pct), locked: true, locked_motivo: "ordem_lote", locked_at: agora, locked_by: autor.uid, locked_by_name: autor.nome,
      parent_formula_id: m.formula_id_antes || null, origem_lote: origemLote,
      created_at: agora, created_by: autor.uid, created_by_name: autor.nome, updated_at: agora,
    }));
    const itens = [];
    const composicao = [];
    for (const k of chaves(conf.ingredientes)) {
      const pct = num(lote.celulas && lote.celulas[r] && lote.celulas[r][k]);
      if (!(pct > 0)) continue;
      const ing = conf.ingredientes[k];
      const item = semVazios(Object.assign({
        id: `${fid}_${k}`, tenant_id: tenant, formula_id: fid, ingredient_name: ing.nome, material_code: ing.codigo || undefined,
        catalog_id: ing.catalog_id || undefined, master_material_id: ing.master_material_id || undefined, inci: ing.inci || undefined,
        phase: ing.fase || "", function: ing.funcao || undefined, percentage: pct, price_per_kg: num(ing.price_per_kg),
        price_usd: ing.price_usd, price_currency: ing.price_currency || undefined, unit: ing.unit || undefined,
        supplier_names: ing.fornecedor || undefined, mp_nova: ing.mp_nova || undefined, lote_ing_key: k,
        created_at: agora, updated_at: agora, created_by: autor.uid,
      }, custosDoItem(pct, ing, taxa)));
      u[`${T}/pd_formula_items/${item.id}`] = item;
      itens.push(item);
      composicao.push({chave: M.chaveMaterialFase(ing), nome: ing.nome, pct});
      if (ing.mp_nova) {
        const sol = solicitacaoDaMpNova(ing, conf.itensOrigem, ctx.fila);
        const req = ctx.requests.get(r) || {};
        if (sol) {
          u[`solicitacoes_cadastro_material/${sol}/origens/${fid}__${item.id}`] = semVazios({pdRequestId: r, formulaId: fid, formulaVersao: versao, itemId: item.id,
            projetoId: lote.projeto_id, projetoNumero: lote.projeto_numero || "", projeto: lote.projeto_nome || "", amostra: req.internal_code || cod,
            cliente: req.client_name || "", origemLote: lote.codigo, ativa: true, registradaEm: agora});
        } else {
          avisos.push(`${cod}: ${ing.nome} é MP nova sem solicitação na fila do Cadastros — registre-a pela fórmula de origem.`);
        }
      }
    }
    for (const ph of ctx.fasesPorFormula.get(base.id) || []) {
      const pid = `${fid}_${ph.id}`;
      u[`${T}/pd_formula_phases/${pid}`] = semVazios(Object.assign({}, ph, {id: pid, tenant_id: tenant, formula_id: fid, created_at: agora, updated_at: agora}));
    }
    u[`${T}/pd_developments/${m.development_id}/current_version`] = versao;
    u[`${T}/pd_developments/${m.development_id}/updated_at`] = agora;
    assinaturas[r] = sha256(M.textoCanonicoItens(itens));
    versoesOrdem[r] = {formula_id: fid, versao};
    u[`${L}/membros/${r}/formula_id_lote`] = fid;
    u[`${L}/membros/${r}/versao_lote`] = versao;
    u[`${L}/membros/${r}/assinatura_lote`] = M.assinaturaItens(itens);
    const dr = (difs[r] || []).filter((x) => x.nivel >= M.NIVEL.COMUM);
    const foraDaBase = dr.some((x) => x.nivel === M.NIVEL.CRITICO);
    u[`${L}/membros/${r}/fora_da_base`] = foraDaBase;
    u[`${L}/membros/${r}/diferencas`] = dr.length ? dr.map((x) => x.nome) : null;
    const {idx} = variacaoDe(ctx, m);
    if (idx >= 0) {
      u[`${T}/crm_samples/${m.sample_id}/variacoes/${idx}/lote_manipulacao`] = semVazios({lote_id: lote.id, codigo: lote.codigo, formula_id: fid, versao,
        fora_da_base: foraDaBase, diferencas: dr.map((x) => x.nome), composicao, em: agora});
    } else {
      avisos.push(`${cod}: variação não encontrada no CRM — a composição não aparece lá.`);
    }
  }
  const o = conf.ordem;
  u[`${L}/ordem`] = semVazios({
    gerada_em: agora, gerada_por: autor.uid, gerada_por_nome: autor.nome, assinaturas, versoes: versoesOrdem,
    fases: o.fases, pre_misturas: o.fases.filter((f) => o.pre_misturas[f]).map((f) => o.pre_misturas[f]), adicoes: o.adicoes, passos: o.passos,
    linhas_pesagem: o.linhas_pesagem, avisos, total_teorico_g: o.total_teorico_g, n_amostras: conf.ativos.length, conferencia_segundo_usuario: ctx.conferencia,
  });
  u[`${L}/ingredientes`] = semVazios(conf.ingredientes);
  u[`${L}/status`] = "ordem_gerada";
  u[`${L}/gerando`] = null;
  u[`${L}/revisao`] = revisao + 1;
  u[`${L}/atualizado_em`] = agora;
  u[`${L}/atualizado_por`] = autor.uid;
  u[`${L}/atualizado_por_nome`] = autor.nome;
  u[`${L}/eventos/${novoId()}`] = {tipo: "ordem_gerada", por: autor.uid, por_nome: autor.nome, em: agora,
    detalhe: `${conf.ativos.length} amostra(s); ${Object.keys(o.linhas_pesagem).length} linha(s) de pesagem; ${fmt(o.total_teorico_g)} g no total.`};
  return {updates: u, versoes: versoesOrdem, avisos};
}

/* ── Pesagem, correção, conferência (D-11) ─────────────────────────────────── */
const rotuloLinha = (l) => (l.tipo === "pre_mistura" ? `Pré-mistura fase ${l.fase} · ${l.nome}` : `${l.codigo_amostra || l.request_id} · ${l.nome}`);

function registroDePesagem(linha, x, autor, agora) {
  const real = num(x && x.real_g);
  if (!(real > 0)) throw falha("invalid-argument", `${rotuloLinha(linha)}: informe o peso real (g).`);
  const d = M.desvioPesagem(linha.teorico_g, real);
  const motivo = texto(x.motivo_desvio);
  if (!d.dentro && motivo.length < M.MIN_MOTIVO) {
    throw falha("failed-precondition", `${rotuloLinha(linha)}: desvio de ${fmt(d.desvio_g)} g passa da tolerância (${fmt(d.tolerancia_g)} g) — escreva o motivo (mín. ${M.MIN_MOTIVO} letras).`);
  }
  const loteMp = texto(x.lote_mp);
  return semVazios({real_g: Math.round(real * 100) / 100, desvio_g: d.desvio_g, tolerancia_g: d.tolerancia_g, motivo_desvio: d.dentro ? undefined : motivo,
    lote_mp: loteMp || "nao_informado", lote_mp_informado: Boolean(loteMp), pesou: autor.uid, pesou_nome: autor.nome, em: agora});
}

function exigirOrdemAberta(lote) {
  if (lote.status !== "ordem_gerada") throw falha("failed-precondition", `Pesagem e conferência são feitas com a ordem gerada (o lote está "${rotuloStatus(lote.status)}").`);
  return lote.ordem || {};
}
const linhaDaOrdem = (ordem, linhaId) => {
  const l = ordem.linhas_pesagem && ordem.linhas_pesagem[linhaId];
  if (!l) throw falha("invalid-argument", `A linha ${linhaId} não é desta ordem.`);
  return l;
};
function carimbar(lote, autor, agora, novoId, tipo, detalhe) {
  lote.revisao = num(lote.revisao) + 1;
  lote.atualizado_em = agora;
  lote.atualizado_por = autor.uid;
  lote.atualizado_por_nome = autor.nome;
  lote.eventos = Object.assign({}, lote.eventos, {[novoId()]: {tipo, por: autor.uid, por_nome: autor.nome, em: agora, detalhe}});
  return lote;
}

function aplicarPesagens(lote, data, autor, agora, novoId) {
  const ordem = exigirOrdemAberta(lote);
  const entradas = Object.entries((data && data.linhas) || {});
  if (!entradas.length) throw falha("invalid-argument", "Informe ao menos uma linha pesada.");
  lote.pesagens = lote.pesagens || {};
  for (const [linhaId, x] of entradas) {
    const linha = linhaDaOrdem(ordem, linhaId);
    if (lote.pesagens[linhaId] && lote.pesagens[linhaId].atual) throw falha("failed-precondition", `${rotuloLinha(linha)}: já foi pesada — para mudar, use Corrigir (o registro anterior fica).`);
    lote.pesagens[linhaId] = {teorico_g: linha.teorico_g, atual: "r1", registros: {r1: registroDePesagem(linha, x, autor, agora)}};
  }
  return {lote: carimbar(lote, autor, agora, novoId, "pesagem", `${entradas.length} linha(s) pesada(s).`), resultado: {linhas: entradas.map(([k]) => k)}};
}

function aplicarCorrecao(lote, data, autor, agora, novoId) {
  const ordem = exigirOrdemAberta(lote);
  const linhaId = texto(data && data.linhaId);
  const linha = linhaDaOrdem(ordem, linhaId);
  const p = lote.pesagens && lote.pesagens[linhaId];
  if (!p || !p.atual) throw falha("failed-precondition", `${rotuloLinha(linha)}: ainda não foi pesada — registre a pesagem.`);
  const motivo = texto(data.motivo);
  if (motivo.length < M.MIN_MOTIVO_DEPOIS_DA_ORDEM) throw falha("invalid-argument", `Explique a correção (mín. ${M.MIN_MOTIVO_DEPOIS_DA_ORDEM} letras).`);
  const n = Object.keys(p.registros || {}).length + 1;
  const novo = Object.assign(registroDePesagem(linha, data, autor, agora), {corrige: p.atual, motivo_correcao: motivo});
  p.registros = Object.assign({}, p.registros, {[`r${n}`]: novo});
  p.atual = `r${n}`;
  return {lote: carimbar(lote, autor, agora, novoId, "pesagem_corrigida", `${rotuloLinha(linha)}: ${motivo}`), resultado: {linha: linhaId, registro: `r${n}`}};
}

function aplicarConferencia(lote, data, autor, agora, novoId) {
  const ordem = exigirOrdemAberta(lote);
  const ids = Array.isArray(data && data.linhas) ? data.linhas : Object.keys((data && data.linhas) || {});
  if (!ids.length) throw falha("invalid-argument", "Escolha as linhas a conferir.");
  const conferidas = [];
  for (const linhaId of ids) {
    const linha = linhaDaOrdem(ordem, linhaId);
    const p = lote.pesagens && lote.pesagens[linhaId];
    const reg = p && p.atual && p.registros && p.registros[p.atual];
    if (!reg) throw falha("failed-precondition", `${rotuloLinha(linha)}: ainda não foi pesada.`);
    if (reg.conferiu) continue;
    if (reg.pesou === autor.uid) throw falha("failed-precondition", `${rotuloLinha(linha)}: a conferência é de outra pessoa (você pesou esta linha).`);
    Object.assign(reg, {conferiu: autor.uid, conferiu_nome: autor.nome, conferido_em: agora});
    conferidas.push(linhaId);
  }
  if (!conferidas.length) return {lote: undefined, resultado: {linhas: []}};
  return {lote: carimbar(lote, autor, agora, novoId, "conferencia", `${conferidas.length} linha(s) conferida(s).`), resultado: {linhas: conferidas}};
}

/* Registrar a manipulação (§7): toda linha com registro atual (e conferido, se ligado; linhas de amostra
 * retirada depois da ordem ficam de fora), assinatura de cada versão = a da ordem, massa conciliada. */
function aplicarManipulacao(lote, data, autor, agora, novoId, assinaturasAtuais) {
  const ordem = exigirOrdemAberta(lote);
  const ativos = ativosDe(lote);
  const conferencia = ordem.conferencia_segundo_usuario !== false;
  const faltam = [];
  let pesadoCg = 0;
  for (const [linhaId, l] of Object.entries(ordem.linhas_pesagem || {})) {
    if (l.request_id && !ativos.includes(l.request_id)) continue;
    const p = lote.pesagens && lote.pesagens[linhaId];
    const reg = p && p.atual && p.registros && p.registros[p.atual];
    if (!reg) { faltam.push(`${rotuloLinha(l)}: sem pesagem`); continue; }
    if (conferencia && !reg.conferiu) faltam.push(`${rotuloLinha(l)}: sem conferência`);
    pesadoCg += Math.round(num(reg.real_g) * 100);
  }
  if (faltam.length) throw falha("failed-precondition", `Falta antes de registrar: ${faltam.slice(0, 8).join("; ")}${faltam.length > 8 ? ` (+${faltam.length - 8})` : ""}.`, {faltam});
  for (const r of ativos) {
    if (!ordem.assinaturas || !ordem.assinaturas[r]) throw falha("failed-precondition", `${codigoDe(lote, r)}: sem versão na ordem.`);
    if (assinaturasAtuais[r] !== ordem.assinaturas[r]) {
      throw falha("failed-precondition", `${codigoDe(lote, r)}: a versão do lote foi alterada depois da ordem — nada foi registrado. Cancele o lote e monte outro.`);
    }
  }
  const d = data || {};
  const entregue = Object.fromEntries(Object.entries(d.entregue || {}).filter(([r]) => ativos.includes(r)).map(([r, g]) => [r, Math.max(0, num(g))]));
  const retencao = Object.fromEntries(Object.entries(d.retencao || {}).filter(([r]) => ativos.includes(r))
    .map(([r, x]) => [r, semVazios({g: Math.max(0, num(x && x.g)), local: texto(x && x.local) || undefined, prazo: texto(x && x.prazo) || undefined})]));
  const descarte = {g: Math.max(0, num(d.descarte && d.descarte.g)), motivo: texto(d.descarte && d.descarte.motivo)};
  if (descarte.g > 0 && descarte.motivo.length < M.MIN_MOTIVO) throw falha("invalid-argument", `Descarte de ${fmt(descarte.g)} g precisa de motivo (mín. ${M.MIN_MOTIVO} letras).`);
  const perda = Math.max(0, num(d.perda_declarada_g));
  const c = M.conciliacaoMassa({pesadoG: pesadoCg / 100, entregue, retencao, descarteG: descarte.g, perdaDeclaradaG: perda, n: ativos.length, perdaPct: lote.perda_pct});
  if (!c.perda_ok) throw falha("failed-precondition", `A perda declarada (${fmt(perda)} g) passa do teto do lote (${fmt(c.perda_max_g)} g) — o que sobrou além disso é descarte, com motivo.`, {conciliacao: c});
  if (!c.ok) {
    throw falha("failed-precondition", `A massa não fecha: pesado ${fmt(c.pesado_g)} g, destinos ${fmt(c.destinos_g)} g, diferença ${fmt(c.residuo_g)} g (tolerância ${fmt(c.tolerancia_g)} g).`, {conciliacao: c});
  }
  lote.manipulacao = semVazios({em: agora, por: autor.uid, por_nome: autor.nome, observacao: texto(d.observacao) || undefined, entregue, retencao,
    descarte: descarte.g > 0 ? descarte : undefined, perda_declarada_g: perda, conciliacao: c});
  lote.status = "manipulado";
  return {lote: carimbar(lote, autor, agora, novoId, "manipulado", `Pesado ${fmt(c.pesado_g)} g; destinos ${fmt(c.destinos_g)} g; ${ativos.length} amostra(s).`), resultado: {conciliacao: c}};
}

/* Crítico (D-02/A2): ADM ou aprovar_critico_pd, outra pessoa que não a autora do motivo; grava o valor
 * atual (mudar a célula depois invalida a aprovação). */
function aplicarAprovacao(lote, data, autor, agora, novoId, materiais, itensOrigemDe) {
  if (lote.status !== "rascunho") throw falha("failed-precondition", `Aprovação de crítico é no rascunho (o lote está "${rotuloStatus(lote.status)}").`);
  const r = texto(data && data.requestId);
  const k = texto(data && data.ingKey);
  if (!ativosDe(lote).includes(r)) throw falha("invalid-argument", "Esta amostra não está ativa no lote.");
  const ingredientes = M.classificarIngredientes(lote.ingredientes || {}, {materiais, itensOrigem: itensOrigemDe(lote)});
  const ing = ingredientes[k];
  if (!ing) throw falha("invalid-argument", "Ingrediente não encontrado no lote.");
  if (!ing.critico) throw falha("failed-precondition", `${ing.nome} não é crítico no Cadastro — não precisa de aprovação.`);
  const valor = num(lote.celulas && lote.celulas[r] && lote.celulas[r][k]);
  const matriz = num(lote.matriz && lote.matriz.celulas && lote.matriz.celulas[k]);
  if (M.pct4(valor) === M.pct4(matriz)) throw falha("failed-precondition", `${ing.nome} está igual à matriz nesta amostra — nada a aprovar.`);
  const mot = lote.motivos && lote.motivos[r] && lote.motivos[r][k];
  if (!mot || texto(mot.texto).length < M.MIN_MOTIVO) throw falha("failed-precondition", `Falta o motivo da mudança de ${ing.nome} — quem formulou escreve antes da aprovação.`);
  if (mot.por === autor.uid) throw falha("failed-precondition", "A aprovação de crítico precisa ser de outra pessoa (você escreveu o motivo).");
  lote.aprovacoes_criticas = lote.aprovacoes_criticas || {};
  lote.aprovacoes_criticas[r] = Object.assign({}, lote.aprovacoes_criticas[r], {[k]: {valor, por: autor.uid, por_nome: autor.nome, em: agora}});
  return {lote: carimbar(lote, autor, agora, novoId, "critico_aprovado", `${codigoDe(lote, r)} · ${ing.nome}: ${fmt(matriz)} → ${fmt(valor)} % aprovado.`), resultado: {request_id: r, ingKey: k, valor}};
}

/* ── Serviço (E/S) ─────────────────────────────────────────────────────────── */
function criarServico({db, relogio = () => new Date()}) {
  const novoId = () => db.ref().push().key;
  const ler = async (caminho) => (await db.ref(caminho).get()).val();

  // Transação no nó do lote. Primeiro o SDK chama com o cache (null sem listener): devolver o
  // próprio null faz o servidor responder com o valor real e o corpo roda de novo.
  async function mutarLote(L, corpo) {
    let erro = null;
    let resultado = null;
    const r = await db.ref(L).transaction((atual) => {
      erro = null;
      resultado = null;
      if (!atual) return atual;
      try {
        const out = corpo(JSON.parse(JSON.stringify(atual)));
        resultado = out.resultado;
        return out.lote;
      } catch (e) { erro = e; return; }
    }, undefined, false);
    if (erro) throw erro;
    if (!r.snapshot.exists()) throw falha("not-found", "Lote de manipulação não encontrado.");
    return resultado;
  }

  async function lerTenant(tenant) {
    const T = `erp/${tenant}`;
    const nos = ["pd_requests", "pd_developments", "pd_formulas", "pd_formula_items", "pd_formula_phases", "crm_samples", COLECAO];
    const [valores, materiais, cambio, fila, conferencia] = await Promise.all([
      Promise.all(nos.map((n) => ler(`${T}/${n}`))), ler("materiais"), ler("config/cambio"), ler("solicitacoes_cadastro_material"), ler("config/pdLote/conferenciaSegundoUsuario"),
    ]);
    const raw = Object.fromEntries(nos.map((n, i) => [n, valores[i]]));
    return {lotesRaw: raw[COLECAO] || {}, ctx: contexto(Object.assign(raw, {lotes: raw[COLECAO], materiais, cambio, fila, conferencia}))};
  }

  async function devolverAoRascunho(L, token, autor, mensagem) {
    const agora = relogio().toISOString();
    await db.ref(L).transaction((atual) => {
      if (!atual) return atual;
      if (atual.status !== "gerando_ordem" || !atual.gerando || atual.gerando.token !== token) return;
      return carimbar(Object.assign({}, atual, {status: "rascunho", gerando: null}), autor, agora, novoId, "erro_ordem", `A ordem não foi gerada: ${mensagem}`);
    }, undefined, false).catch((e) => console.error("[manipulacaoLote] não voltou a rascunho:", e));
  }

  async function reservarVersao(tenant, devId, maiorGravada) {
    const r = await db.ref(`erp/${tenant}/sequences/pd_formula_version_${devId}`).transaction((cur) => Math.max(num(cur), num(maiorGravada)) + 1, undefined, false);
    const v = num(r.snapshot.val());
    if (!r.committed || !(v > 0)) throw falha("aborted", "Não foi possível reservar o número da versão. Tente de novo.");
    return v;
  }

  async function gerarOrdem(quem, loteId, data) {
    const L = `erp/${quem.tenant}/${COLECAO}/${loteId}`;
    const {lotesRaw, ctx} = await lerTenant(quem.tenant);
    const lido = lotesRaw[loteId];
    if (!lido) throw falha("not-found", "Lote de manipulação não encontrado.");
    const lote = Object.assign({}, lido, {id: loteId});
    const expirado = lote.status === "gerando_ordem" && Date.now() - num(lote.gerando && lote.gerando.desde_ms) > GERANDO_VALIDADE_MS;
    if (lote.status !== "rascunho" && !expirado) throw falha("failed-precondition", `A ordem sai de um rascunho (o lote está "${rotuloStatus(lote.status)}").`);
    if (num(data.revisao) !== num(lote.revisao)) throw falha("aborted", "O lote mudou desde que você abriu (outra pessoa salvou). Recarregue — nada foi gravado.");
    const antes = conferirOrdem(lote, ctx);
    if (antes.problemas.length) throw falha("failed-precondition", `A ordem não pode sair: ${antes.problemas.join(" ")}`, {problemas: antes.problemas});

    // Trava: rascunho (na revisão lida) → gerando_ordem. A tela não grava mais nada até o fim.
    const token = crypto.randomUUID();
    let recusa = null;
    const claim = await db.ref(L).transaction((atual) => {
      recusa = null;
      if (!atual) return atual;
      const venceu = atual.status === "gerando_ordem" && Date.now() - num(atual.gerando && atual.gerando.desde_ms) > GERANDO_VALIDADE_MS;
      if (atual.status !== "rascunho" && !venceu) { recusa = `O lote está "${rotuloStatus(atual.status)}".`; return; }
      if (num(atual.revisao) !== num(data.revisao)) { recusa = "O lote mudou desde que você abriu (outra pessoa salvou). Recarregue — nada foi gravado."; return; }
      return Object.assign({}, atual, {status: "gerando_ordem", revisao: num(atual.revisao) + 1, gerando: {token, por: quem.uid, desde_ms: Date.now()}});
    }, undefined, false);
    if (recusa) throw falha("aborted", recusa);
    const travado = claim.snapshot.val();
    if (!claim.committed || !travado || !travado.gerando || travado.gerando.token !== token) throw falha("aborted", "Outra pessoa está gerando a ordem deste lote.");

    try {
      const loteT = Object.assign({}, travado, {id: loteId});
      const conf = conferirOrdem(loteT, ctx);
      if (conf.problemas.length) throw falha("failed-precondition", `A ordem não pode sair: ${conf.problemas.join(" ")}`, {problemas: conf.problemas});
      const versoes = {};
      for (const r of conf.ativos) {
        const dev = loteT.membros[r].development_id;
        const maior = Math.max(0, ...ctx.formulasLista.filter((f) => f.development_id === dev).map((f) => num(f.version)));
        versoes[r] = await reservarVersao(quem.tenant, dev, maior);
      }
      const plano = montarOrdem({lote: loteT, ctx, conf, versoes, novoId, autor: quem, agora: relogio().toISOString(), tenant: quem.tenant, revisao: num(travado.revisao)});
      await db.ref().update(plano.updates);
      return {ok: true, codigo: lote.codigo, versoes: plano.versoes, avisos: plano.avisos};
    } catch (e) {
      await devolverAoRascunho(L, token, quem, e.message || String(e));
      throw e;
    }
  }

  async function assinaturasDasVersoes(tenant, lote) {
    const versoes = (lote.ordem && lote.ordem.versoes) || {};
    const itens = lista(await ler(`erp/${tenant}/pd_formula_items`));
    const porFormula = new Map();
    for (const it of itens) { if (!porFormula.has(it.formula_id)) porFormula.set(it.formula_id, []); porFormula.get(it.formula_id).push(it); }
    return Object.fromEntries(Object.entries(versoes).map(([r, v]) => [r, sha256(M.textoCanonicoItens(porFormula.get(v.formula_id) || []))]));
  }

  async function executar(request) {
    if (!request || !request.auth) throw falha("unauthenticated", "Faça login.");
    const uid = request.auth.uid;
    const data = request.data || {};
    const quem = identidade(await ler(`usuarios/${uid}`), uid, data.tenant);
    const acao = data.acao;
    if (acao !== "aprovar_critico" && !quem.podeLote) throw falha("permission-denied", "A manipulação em lote é do P&D (química) e do ADM. Seu perfil só consulta.");
    if (acao === "aprovar_critico" && !quem.podeAprovarCritico) throw falha("permission-denied", "Aprovar ingrediente crítico é do ADM ou de quem tem o módulo \"Aprovar crítico P&D\".");
    const loteId = texto(data.loteId);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(loteId)) throw falha("invalid-argument", "Lote inválido.");
    const L = `erp/${quem.tenant}/${COLECAO}/${loteId}`;
    const agora = relogio().toISOString();
    switch (acao) {
      case "gerar_ordem": return gerarOrdem(quem, loteId, data);
      case "registrar_pesagens": return {ok: true, ...(await mutarLote(L, (l) => aplicarPesagens(l, data, quem, agora, novoId)))};
      case "corrigir_pesagem": return {ok: true, ...(await mutarLote(L, (l) => aplicarCorrecao(l, data, quem, agora, novoId)))};
      case "conferir_pesagem": return {ok: true, ...(await mutarLote(L, (l) => aplicarConferencia(l, data, quem, agora, novoId)))};
      case "registrar_manipulacao": {
        const atual = await ler(L);
        if (!atual) throw falha("not-found", "Lote de manipulação não encontrado.");
        const assinaturas = await assinaturasDasVersoes(quem.tenant, atual);
        return {ok: true, ...(await mutarLote(L, (l) => aplicarManipulacao(l, data, quem, agora, novoId, assinaturas)))};
      }
      case "aprovar_critico": {
        const T = `erp/${quem.tenant}`;
        const [materiais, itens, lotes] = await Promise.all([ler("materiais"), ler(`${T}/pd_formula_items`), ler(`${T}/${COLECAO}`)]);
        const ctx = contexto({materiais, pd_formula_items: itens, lotes});
        return {ok: true, ...(await mutarLote(L, (l) => aplicarAprovacao(l, data, quem, agora, novoId, ctx.materiais, (x) => itensDeOrigem(x, ctx))))};
      }
      default: throw falha("invalid-argument", "Ação inválida na manipulação em lote.");
    }
  }

  return {executar};
}

/* liberarEtapaPd (§7, D-07/A5): membro ativo de lote com a ordem gerada ainda não foi manipulado — não
 * vai a Em Testes; membro de lote com ordem tem a assinatura da versão reconferida. Devolve o motivo da
 * recusa ou "". */
function bloqueioDeEtapa({lotes, itens, requestId, novoStatus}) {
  const porFormula = new Map();
  for (const it of lista(itens)) { if (!porFormula.has(it.formula_id)) porFormula.set(it.formula_id, []); porFormula.get(it.formula_id).push(it); }
  for (const l of lista(lotes)) {
    const m = l.membros && l.membros[requestId];
    if (!m || m.status_membro === "removido") continue;
    if (novoStatus === "IN_TESTS" && ["gerando_ordem", "ordem_gerada"].includes(l.status)) {
      return `A amostra está no lote ${l.codigo || l.id}, com a ordem gerada: registre a manipulação do lote antes de ir para Em Testes.`;
    }
    const v = l.ordem && l.ordem.versoes && l.ordem.versoes[requestId];
    const esperado = l.ordem && l.ordem.assinaturas && l.ordem.assinaturas[requestId];
    if (v && esperado && sha256(M.textoCanonicoItens(porFormula.get(v.formula_id) || [])) !== esperado) {
      return `A versão v${v.versao} do lote ${l.codigo || l.id} foi alterada depois da ordem — a etapa não é liberada.`;
    }
  }
  return "";
}

module.exports = {
  COLECAO, criarServico, bloqueioDeEtapa,
  // puras, para os testes
  identidade, contexto, conferirOrdem, montarOrdem, aplicarPesagens, aplicarCorrecao, aplicarConferencia, aplicarManipulacao, aplicarAprovacao,
  taxaDaFormula, custosDoItem, solicitacaoDaMpNova, sha256,
};
