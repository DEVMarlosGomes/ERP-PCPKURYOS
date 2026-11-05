/* Rotas da Manipulação em Lote no adaptador do CRM/P&D (spec 2026-11-04, §5–§7).
 *
 * Carga única por rota (nenhum all()/related() por amostra) e o salvamento num update()
 * multi-caminho com caminhos planos (lib/manipulacaoLote.planoSalvarLote). A regra do banco
 * (erp/$tenant/pd_manipulacao_lotes) exige revisao = gravada + 1: duas químicas salvando a
 * mesma revisão → a segunda é recusada inteira. Ordem, pesagens, manipulação e aprovação de
 * crítico vão à callable do servidor (functions/manipulacao_lote.js), que grava o que a regra
 * proíbe ao cliente. Ações em lote usam a rota real de status, uma amostra por vez (D-07). */
import { get, ref, runTransaction, update } from "firebase/database";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";
import { chamarServidor } from "@/lib/servidor";
import { fechamentoFormula } from "@/lib/fechamentoFormula";
import { validarMpNova } from "@/lib/fichaTecnica";
import { baseVigente, planoDaBase } from "@/lib/formulacaoBase";
import * as M from "@/lib/manipulacaoLote";

export const COLECAO_LOTES = "pd_manipulacao_lotes";
const ACOES_SERVIDOR = {
  "gerar-ordem": "gerar_ordem", pesagens: "registrar_pesagens", conferir: "conferir_pesagem",
  "registrar-manipulacao": "registrar_manipulacao", "aprovar-critico": "aprovar_critico", "corrigir-pesagem": "corrigir_pesagem",
};
const STATUS_DEPOIS_DE_TESTES = ["IN_TESTS", "WAITING_APPROVAL", "APPROVED", "COMPLETED"];
export const NAO_TRATADA = Symbol("manipulacao-lote-nao-tratada");

const indexar = (lista) => new Map((lista || []).map((x) => [x.id, x]));
const agrupar = (lista, campo) => {
  const m = new Map();
  for (const x of lista || []) { const k = x?.[campo]; if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
};
const vigentePorDev = (formulas) => {
  const m = new Map();
  for (const f of formulas || []) { const a = m.get(f.development_id); if (!a || Number(f.version || 0) > Number(a.version || 0)) m.set(f.development_id, f); }
  return m;
};
const ativosDe = (lote) => Object.entries(lote?.membros || {}).filter(([, m]) => m?.status_membro !== "removido").map(([r]) => r);
const mensagemDe = (e) => e?.response?.data?.detail?.message || (typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "") || e?.message || String(e);

export function createManipulacaoLoteRouter(h) {
  const { all, one, apiError, now, newId } = h;
  const P = (t, c) => `erp/${t}/${c}`;
  const uid = () => firebaseAuth.currentUser?.uid || "";
  const exigirPapel = (perfil) => {
    if (!M.podeManipularLote(perfil)) throw apiError(403, "A manipulação em lote é do P&D (química) e do ADM. Seu perfil só consulta.");
  };
  const exigirRevisao = (lote, revisao) => {
    if (Number(revisao) !== Number(lote.revisao)) throw apiError(409, "O lote mudou desde que você abriu (outra pessoa salvou). Recarregue para ver a versão atual — nada foi gravado.");
  };
  async function gravar(updates) {
    try { await update(ref(firebaseDb), updates); } catch (e) {
      if (/permission/i.test(String(e?.message || e))) throw apiError(409, "O banco recusou a gravação: o lote mudou ao mesmo tempo (outra pessoa salvou) ou seu acesso mudou. Nada foi gravado — recarregue.");
      throw e;
    }
  }
  // Reserva de número por transação (nunca max+1 solto): max(contador, maior já gravado) + 1.
  async function reservar(path, minimo = 0) {
    const r = await runTransaction(ref(firebaseDb, path), (cur) => Math.max(Number(cur) || 0, Number(minimo) || 0) + 1);
    const v = Number(r?.snapshot?.val());
    if (!r?.committed || !Number.isFinite(v)) throw apiError(409, `Não foi possível reservar o próximo número em ${path}. Nada foi gravado — tente de novo.`);
    return v;
  }
  async function lerLote(t, id) {
    const l = await one(t, COLECAO_LOTES, id);
    if (!l) throw apiError(404, "Lote de manipulação não encontrado.");
    return l;
  }
  const evento = (tipo, detalhe, perfil) => ({ tipo, por: uid(), por_nome: h.pdUserName(perfil), em: now(), detalhe: detalhe || "" });
  const cabecalhoLote = (t, l, perfil) => {
    const L = `${P(t, COLECAO_LOTES)}/${l.id}`;
    return { L, base: { [`${L}/revisao`]: Number(l.revisao || 0) + 1, [`${L}/atualizado_em`]: now(), [`${L}/atualizado_por`]: uid(), [`${L}/atualizado_por_nome`]: h.pdUserName(perfil) } };
  };

  /* Painel: variações do projeto com elegibilidade (D-01), lotes do projeto e matriz padrão (D-04). */
  async function carregarProjeto(t, proj) {
    const [samples, requests, devs, formulas, itens, lotes, bases] = await Promise.all([
      all(t, "crm_samples"), all(t, "pd_requests"), all(t, "pd_developments"), all(t, "pd_formulas"),
      all(t, "pd_formula_items"), all(t, COLECAO_LOTES), all(t, "pd_formulacoes_base")]);
    const reqs = indexar(requests);
    const devPorReq = new Map(devs.map((d) => [d.request_id || d.pd_request_id, d]));
    const vig = vigentePorDev(formulas);
    const ipf = agrupar(itens, "formula_id");
    const abertos = lotes.filter((l) => M.STATUS_LOTE_ABERTO.includes(l.status));
    const linhas = [];
    for (const s of samples.filter((x) => x.projeto_id === proj)) {
      (s.variacoes || []).forEach((v, idx) => {
        if (!v) return;
        const req = reqs.get(v.pd_request_id) || requests.find((r) => r.crm_sample_id === s.id && r.crm_variacao_id === v.id) || null;
        const dev = req ? devPorReq.get(req.id) || null : null;
        const f = dev ? vig.get(dev.id) || null : null;
        const its = f ? ipf.get(f.id) || [] : [];
        let motivo = M.motivoInelegivel({ request: req, variacao: v, lotesAbertos: abertos });
        if (!motivo && !dev) motivo = "Solicitação sem desenvolvimento — abra-a uma vez no P&D para iniciar.";
        linhas.push({
          request_id: req?.id || null, sample_id: s.id, variacao_id: v.id, variacao_idx: idx, development_id: dev?.id || null,
          codigo: v.codigo || req?.internal_code || "", produto: s.nome_produto || s.produto || req?.title || "", status_pd: req?.status || null,
          elegivel: !motivo, motivo, formula: f ? { id: f.id, version: Number(f.version) || 1, locked: Boolean(f.locked), updated_at: f.updated_at || f.created_at || "" } : null,
          fechamento: its.length ? fechamentoFormula(its) : null, n_itens: its.length,
          quantidade_pedido: Number(s.quantidade_por_variacao) || null, unidade_pedido: s.unidade_quantidade || "g", _itens: its,
        });
      });
    }
    return { linhas, lotesProj: lotes.filter((l) => l.projeto_id === proj), bases: bases.filter((b) => b.projeto_id === proj), formulas, ipf };
  }
  const resumoLote = (l) => ({ id: l.id, codigo: l.codigo, status: l.status, membros: ativosDe(l).length, atualizado_em: l.atualizado_em || l.criado_em || "" });
  const semItens = ({ _itens, ...x }) => x;

  async function elegiveis(t, proj) {
    const c = await carregarProjeto(t, proj);
    const mp = M.matrizPadrao(c.linhas.filter((l) => l.elegivel).map((l) => ({ request_id: l.request_id, formula: l.formula, itens: l._itens })));
    const b = baseVigente(c.bases);
    return { amostras: c.linhas.map(semItens), lotes: c.lotesProj.map(resumoLote).sort((a, x) => String(x.atualizado_em).localeCompare(String(a.atualizado_em))),
      matriz_padrao: mp, base_projeto: b ? { id: b.id, versao: Number(b.versao) || 1, n_itens: (b.itens || []).length } : null,
      limite: { min: M.MIN_MEMBROS, max: M.MAX_MEMBROS } };
  }

  async function criar(t, data, perfil) {
    exigirPapel(perfil);
    const proj = data?.projeto_id;
    if (!proj) throw apiError(400, "Informe o projeto.");
    const ids = [...new Set(data?.request_ids || [])];
    const c = await carregarProjeto(t, proj);
    const sel = ids.map((r) => c.linhas.find((l) => l.request_id === r) || { request_id: r, codigo: r, elegivel: false, motivo: "não pertence a este projeto ou não existe." });
    const erro = M.validarSelecao(sel);
    if (erro) throw apiError(422, erro);
    const projeto = await one(t, "crm_projects", proj);
    if (!projeto) throw apiError(404, "Projeto não encontrado.");
    const numero = await h.ensureNumeroProjeto(t, projeto);
    let matriz;
    let matrizItens = [];
    let perda = 0;
    if (data?.matriz?.tipo === "base_projeto") {
      const b = baseVigente(c.bases);
      if (!b) throw apiError(422, "Este projeto ainda não tem base — escolha a fórmula de uma das amostras como matriz.");
      matriz = { tipo: "base_projeto", ref_id: b.id, versao: Number(b.versao) || 1, codigo: `Base v${Number(b.versao) || 1}` };
      matrizItens = (b.itens || []).map((i) => ({ ingredient_name: i.nome, material_code: i.codigo, inci: i.inci, percentage: i.percentual, phase: "" }));
    } else {
      const escolhida = data?.matriz?.ref_id ? sel.find((l) => l.formula?.id === data.matriz.ref_id) : null;
      const pad = escolhida ? { tipo: "amostra", request_id: escolhida.request_id, ref_id: escolhida.formula.id, versao: escolhida.formula.version }
        : M.matrizPadrao(sel.map((l) => ({ request_id: l.request_id, formula: l.formula, itens: l._itens })));
      if (pad) {
        const { fecha, ...resto } = pad;
        matriz = { ...resto, codigo: sel.find((l) => l.request_id === pad.request_id)?.codigo || "" };
        matrizItens = c.ipf.get(pad.ref_id) || [];
        perda = Number(c.formulas.find((f) => f.id === pad.ref_id)?.indice_perdas || 0);
      } else matriz = { tipo: "vazia", ref_id: null, versao: null, codigo: "" };
    }
    const materiais = new Map((await h.masterAll("materiais")).map((m) => [m.id, m]));
    const mm = M.montarMatriz({ matrizItens, membros: sel.map((l) => ({ request_id: l.request_id, itens: l._itens })) });
    mm.ingredientes = M.classificarIngredientes(mm.ingredientes, { materiais, itensOrigem: [...matrizItens, ...sel.flatMap((l) => l._itens)] });
    const seq = await reservar(P(t, `sequences/manipulacao_lote_${proj}`));
    const lid = newId();
    const agora = now();
    const membros = Object.fromEntries(sel.map((l) => [l.request_id, {
      request_id: l.request_id, development_id: l.development_id, sample_id: l.sample_id, variacao_id: l.variacao_id, codigo_amostra: l.codigo,
      unidade_pedido: l.unidade_pedido, quantidade_pedido: l.quantidade_pedido, quantidade_g: String(l.unidade_pedido || "g").toLowerCase() === "g" && l.quantidade_pedido ? l.quantidade_pedido : undefined,
      formula_id_antes: l.formula?.id || null, versao_antes: l.formula?.version || null,
      assinatura_antes: l._itens.length ? M.assinaturaItens(l._itens) : null, status_membro: "ativo",
    }]));
    const lote = M.limpo({
      id: lid, tenant_id: t, codigo: `LM-${numero}-${seq}`, projeto_id: proj, projeto_numero: numero, projeto_nome: projeto.nome_projeto || "",
      status: "rascunho", revisao: 1, matriz: { ...matriz, celulas: mm.matrizCelulas }, membros, ingredientes: mm.ingredientes, celulas: mm.celulas,
      perda_pct: perda, minimo_pesavel_g: M.MINIMO_PESAVEL_PADRAO_G,
      criado_em: agora, criado_por: uid(), criado_por_nome: h.pdUserName(perfil), atualizado_em: agora, atualizado_por: uid(),
      eventos: { [newId()]: evento("criado", `${sel.length} amostra(s); matriz ${matriz.codigo || matriz.tipo}`, perfil) },
    });
    await gravar({ [`${P(t, COLECAO_LOTES)}/${lid}`]: lote });
    await h.auditCard(t, "pd_lote_criado", "pd_manipulacao_lote", lid, null, { codigo: lote.codigo, membros: ids }, perfil).catch(() => {});
    return lote;
  }

  async function detalhe(t, id, perfil) {
    const l = await lerLote(t, id);
    const comVersoes = Object.values(l.membros || {}).some((m) => m?.formula_id_lote);
    const [requests, formulas, cfg, itens] = await Promise.all([all(t, "pd_requests"), all(t, "pd_formulas"), get(ref(firebaseDb, "config/pdLote")),
      comVersoes ? all(t, "pd_formula_items") : []]);
    const reqs = indexar(requests);
    const vig = vigentePorDev(formulas);
    const estado = {};
    for (const [r, m] of Object.entries(l.membros || {})) {
      const v = vig.get(m.development_id);
      estado[r] = { status_pd: reqs.get(r)?.status || null, versao_vigente: v ? Number(v.version) || 1 : null, formula_vigente_id: v?.id || null,
        fora_do_lote: Boolean(m.formula_id_lote && v && v.id !== m.formula_id_lote) };
    }
    return { lote: l, estado, conferencia_segundo_usuario: cfg.val()?.conferenciaSegundoUsuario !== false, pode_editar: M.podeManipularLote(perfil), eu: uid(),
      custos: custosDoLote(l, itens) };
  }

  async function salvar(t, id, data, perfil) {
    exigirPapel(perfil);
    const l = await lerLote(t, id);
    if (l.status !== "rascunho") throw apiError(409, `O lote ${l.codigo} está "${M.ROTULO_STATUS_LOTE[l.status] || l.status}": a matriz só muda em rascunho. Para mudar depois da ordem, cancele o lote (com motivo) e monte outro.`);
    exigirRevisao(l, data?.revisao);
    for (const k of Object.keys(data?.ingredientes || {})) if (!/^i\d{2,3}$/.test(k)) throw apiError(400, `Chave de ingrediente inválida: ${k}.`);
    const [requests, formulas, itens, samples, materiais] = await Promise.all([
      all(t, "pd_requests"), all(t, "pd_formulas"), all(t, "pd_formula_items"), all(t, "crm_samples"), h.masterAll("materiais")]);
    const reqs = indexar(requests);
    const ipf = agrupar(itens, "formula_id");
    const vig = vigentePorDev(formulas);
    const sm = indexar(samples);
    const ativos = ativosDe(l);
    for (const r of ativos) {
      const m = l.membros[r];
      const variacao = (sm.get(m.sample_id)?.variacoes || []).find((v) => v?.id === m.variacao_id) || {};
      const motivo = M.motivoInelegivel({ request: reqs.get(r), variacao, lotesAbertos: [] });
      if (motivo) throw apiError(409, `${m.codigo_amostra}: ${motivo} Tire a amostra do lote para salvar as outras.`);
      const v = vig.get(m.development_id);
      if ((v?.id || null) !== (m.formula_id_antes || null)) throw apiError(409, `${m.codigo_amostra}: a fórmula mudou desde que o lote foi montado (agora v${v?.version}). Tire a amostra do lote e inclua de novo.`);
      if (m.formula_id_antes && M.assinaturaItens(ipf.get(m.formula_id_antes) || []) !== m.assinatura_antes) {
        throw apiError(409, `${m.codigo_amostra}: a fórmula v${m.versao_antes} foi editada fora do lote (aba Manipulação). Tire a amostra do lote e inclua de novo — nada foi gravado.`);
      }
    }
    // A1: crítico e fragrância das fontes (Cadastros + fórmulas de origem), nunca do que a tela mandou.
    const origem = [l.matriz?.ref_id, ...ativos.map((r) => l.membros[r].formula_id_antes)].filter(Boolean).flatMap((fid) => ipf.get(fid) || []);
    const ingredientes = M.classificarIngredientes(data?.ingredientes || {}, { materiais: new Map(materiais.map((m) => [m.id, m])), itensOrigem: origem });
    for (const [k, x] of Object.entries(ingredientes)) {
      const erroMp = x?.mp_nova ? validarMpNova(x.mp_nova) : null;
      if (erroMp) throw apiError(422, `${x.nome || k}: ${erroMp}`);
    }
    const plano = M.planoSalvarLote({ tenantPath: `erp/${t}`, lote: l, rascunho: { ...data, ingredientes }, contexto: { requests: reqs },
      agora: now(), autor: { uid: uid(), nome: h.pdUserName(perfil) }, novoId: newId });
    const motivos = plano.updates[`${P(t, COLECAO_LOTES)}/${id}/motivos`] || l.motivos || {};
    const pendencias = M.pendencias({ ingredientes, celulas: data?.celulas || {}, matrizCelulas: l.matriz?.celulas || {}, motivos, aprovacoes: l.aprovacoes_criticas || {}, membros: ativos });
    const fechamento = M.fechamentoPorMembro(data?.celulas || {}, ativos);
    if (plano.resumo.semMudanca) return { sem_mudanca: true, lote: l, pendencias, fechamento };
    await gravar(plano.updates);
    const avisos = [];
    for (const r of plano.resumo.passaramEmDesenvolvimento) { // um por vez (variações irmãs)
      try { await h.pdSyncRequestStatus(t, reqs.get(r), "IN_PROGRESS"); } catch (e) {
        console.error("[Manipulação em lote] sincronia com o CRM falhou:", e);
        avisos.push(`${l.membros[r].codigo_amostra}: status salvo, mas o CRM não foi atualizado agora (${mensagemDe(e)}); ele se acerta ao abrir o quadro.`);
      }
    }
    await h.auditCard(t, "pd_lote_salvo", "pd_manipulacao_lote", id, { revisao: l.revisao }, { revisao: Number(l.revisao) + 1, celulas_alteradas: plano.resumo.mudancas.length }, perfil).catch(() => {});
    return { lote: await one(t, COLECAO_LOTES, id), pendencias, fechamento, avisos };
  }

  async function remover(t, id, r, data, perfil) {
    exigirPapel(perfil);
    const l = await lerLote(t, id);
    const m = l.membros?.[r];
    if (!m) throw apiError(404, "Esta amostra não está no lote.");
    if (m.status_membro === "removido") return l;
    if (["cancelado", "manipulado"].includes(l.status)) throw apiError(409, `Lote ${M.ROTULO_STATUS_LOTE[l.status]}: não se tira amostra dele.`);
    exigirRevisao(l, data?.revisao);
    const motivo = String(data?.motivo || "").trim();
    if (l.status === "ordem_gerada" && motivo.length < M.MIN_MOTIVO_DEPOIS_DA_ORDEM) throw apiError(422, `Depois da ordem, tirar uma amostra exige motivo (mín. ${M.MIN_MOTIVO_DEPOIS_DA_ORDEM} letras).`);
    const { L, base } = cabecalhoLote(t, l, perfil);
    const texto = motivo || "Retirada antes da ordem";
    const u = { ...base, [`${L}/membros/${r}/status_membro`]: "removido", [`${L}/membros/${r}/removido_motivo`]: texto,
      [`${L}/membros/${r}/removido_por`]: uid(), [`${L}/membros/${r}/removido_por_nome`]: h.pdUserName(perfil), [`${L}/membros/${r}/removido_em`]: now(),
      [`${L}/eventos/${newId()}`]: evento("membro_removido", `${m.codigo_amostra}: ${texto}`, perfil) };
    const amostra = m.sample_id ? await one(t, "crm_samples", m.sample_id) : null;
    const idx = (amostra?.variacoes || []).findIndex((v) => v?.id === m.variacao_id);
    if (idx >= 0 && amostra.variacoes[idx]?.lote_manipulacao?.lote_id === id) u[`${P(t, "crm_samples")}/${m.sample_id}/variacoes/${idx}/lote_manipulacao/removido_em`] = now();
    await gravar(u);
    return one(t, COLECAO_LOTES, id);
  }

  async function cancelar(t, id, data, perfil) {
    exigirPapel(perfil);
    const l = await lerLote(t, id);
    if (l.status === "cancelado") return l;
    if (l.status === "manipulado") throw apiError(409, "Lote já manipulado não se cancela: as amostras existem. Cada uma segue (ou é descartada) pelo próprio fluxo.");
    exigirRevisao(l, data?.revisao);
    const motivo = String(data?.motivo || "").trim();
    const min = l.status === "ordem_gerada" ? M.MIN_MOTIVO_DEPOIS_DA_ORDEM : M.MIN_MOTIVO;
    if (motivo.length < min) throw apiError(422, `Informe o motivo do cancelamento (mín. ${min} letras).`);
    const { L, base } = cabecalhoLote(t, l, perfil);
    await gravar({ ...base, [`${L}/status`]: "cancelado", [`${L}/cancelamento`]: { motivo, por: uid(), por_nome: h.pdUserName(perfil), em: now() },
      [`${L}/eventos/${newId()}`]: evento("cancelado", motivo, perfil) });
    return one(t, COLECAO_LOTES, id);
  }

  async function baseProjeto(t, id, data, perfil) {
    exigirPapel(perfil);
    const l = await lerLote(t, id);
    if (l.status === "cancelado") throw apiError(409, "Lote cancelado não gera base.");
    const ativos = ativosDe(l);
    const col = data?.request_id || l.matriz?.request_id || ativos[0];
    const m = l.membros?.[col];
    const celulas = l.celulas?.[col];
    if (!m || !celulas) throw apiError(422, "Escolha uma amostra do lote para virar a base.");
    const itens = Object.keys(l.ingredientes || {}).filter((k) => Number(celulas[k]) > 0 && !M.ehFragrancia(l.ingredientes[k]))
      .map((k) => ({ nome: l.ingredientes[k].nome, codigo: l.ingredientes[k].codigo || "", inci: l.ingredientes[k].inci || "", percentual: Number(celulas[k]) }));
    const bases = await h.related(t, "pd_formulacoes_base", "projeto_id", l.projeto_id);
    const plano = planoDaBase(bases, itens);
    if (plano.acao === "nenhuma") throw apiError(422, "A amostra escolhida não tem ingrediente fora da fragrância.");
    if (plano.acao === "reusar") return { acao: "reusar", base: plano.base };
    exigirRevisao(l, data?.revisao);
    const versao = await reservar(P(t, `sequences/formulacao_base_${l.projeto_id}`), Math.max(0, ...bases.map((b) => Number(b.versao) || 0)));
    const bid = newId();
    const base = { id: bid, tenant_id: t, projeto_id: l.projeto_id, versao, itens: plano.itens,
      origem: { lote_id: id, lote_codigo: l.codigo, amostra: m.codigo_amostra, request_id: col, development_id: m.development_id || null },
      criado_por: uid(), criado_por_nome: h.pdUserName(perfil), criado_em: now() };
    const { L, base: cab } = cabecalhoLote(t, l, perfil);
    await gravar({ ...cab, [`${P(t, "pd_formulacoes_base")}/${bid}`]: base,
      [`${L}/eventos/${newId()}`]: evento("base_projeto", `Base do projeto v${versao} criada a partir de ${m.codigo_amostra}.`, perfil) });
    return { acao: "criar", base };
  }

  async function acoes(t, id, data, perfil) {
    exigirPapel(perfil);
    const l = await lerLote(t, id);
    const ativos = ativosDe(l);
    const acao = data?.acao;
    const resultados = [];
    const cod = (r) => l.membros[r]?.codigo_amostra || r;
    if (["em_testes", "liberacao", "estabilidade"].includes(acao) && l.status !== "manipulado") throw apiError(409, "Registre a manipulação do lote antes das ações em lote.");
    if (acao === "em_testes" || acao === "liberacao") {
      // D-07: uma amostra por vez, nunca em paralelo (pdSyncRequestStatus regrava as variações irmãs).
      for (const r of ativos) {
        const req = await one(t, "pd_requests", r);
        const st = req?.status || "OPEN";
        if (acao === "em_testes" && STATUS_DEPOIS_DE_TESTES.includes(st)) { resultados.push({ request_id: r, codigo: cod(r), ok: true, mensagem: `já está em ${M.ROTULO_STATUS_PD[st]}` }); continue; }
        try {
          if (acao === "em_testes") await h.call("PUT", `/pd/requests/${encodeURIComponent(r)}/status`, { new_status: "IN_TESTS", comment: `Manipulação em lote ${l.codigo}` });
          else await h.call("POST", `/pd/requests/${encodeURIComponent(r)}/liberacao-antecipada`, { motivo: data?.motivo });
          resultados.push({ request_id: r, codigo: cod(r), ok: true, mensagem: acao === "em_testes" ? "Em Testes" : "liberação pedida à diretoria" });
        } catch (e) {
          resultados.push({ request_id: r, codigo: cod(r), ok: false, mensagem: mensagemDe(e) });
        }
      }
    } else if (acao === "estabilidade") {
      const [estudos, requests] = await Promise.all([all(t, "pd_stability_studies"), all(t, "pd_requests")]);
      const reqs = indexar(requests);
      const inicio = data?.inicio || now();
      const u = {};
      for (const r of ativos) {
        if (estudos.some((e) => e.request_id === r || e.pd_card_id === r)) { resultados.push({ request_id: r, codigo: cod(r), ok: true, mensagem: "já tinha estudo" }); continue; }
        const eid = newId();
        u[`${P(t, "pd_stability_studies")}/${eid}`] = { ...h.novoEstudoEstabilidade(reqs.get(r) || { id: r }, inicio), id: eid, tenant_id: t, lote_manipulacao_id: id, lote_codigo: l.codigo, created_at: inicio };
        resultados.push({ request_id: r, codigo: cod(r), ok: true, mensagem: "estudo criado" });
      }
      if (Object.keys(u).length) await gravar(u);
    } else throw apiError(400, "Ação inválida: use em_testes, liberacao ou estabilidade.");
    // Registro no histórico do lote (só inclusão). Falha aqui não desfaz o que foi feito por amostra.
    try {
      const atual = await one(t, COLECAO_LOTES, id);
      const { L, base } = cabecalhoLote(t, atual, perfil);
      await gravar({ ...base, [`${L}/eventos/${newId()}`]: evento(`acao_${acao}`, resultados.map((x) => `${x.codigo}: ${x.ok ? "ok" : "falhou"} (${x.mensagem})`).join("; "), perfil) });
    } catch (e) { console.error("[Manipulação em lote] evento não registrado:", e); }
    return { resultados };
  }

  async function ocorrencia(t, id, data, perfil) {
    exigirPapel(perfil);
    const l = await lerLote(t, id);
    const texto = String(data?.texto || "").trim();
    if (texto.length < M.MIN_MOTIVO_DEPOIS_DA_ORDEM) throw apiError(422, `Descreva a ocorrência (mín. ${M.MIN_MOTIVO_DEPOIS_DA_ORDEM} letras).`);
    exigirRevisao(l, data?.revisao);
    const { L, base } = cabecalhoLote(t, l, perfil);
    await gravar({ ...base, [`${L}/eventos/${newId()}`]: evento("ocorrencia", texto, perfil) });
    return one(t, COLECAO_LOTES, id);
  }

  async function servidor(t, id, rota, data, perfil) {
    if (rota !== "aprovar-critico") exigirPapel(perfil); // quem aprova crítico (RT/ADM) o servidor decide
    const res = await chamarServidor("manipulacaoLoteServidor", { ...(data || {}), acao: ACOES_SERVIDOR[rota], loteId: id, tenant: t });
    return { ...(res || {}), lote: await one(t, COLECAO_LOTES, id) };
  }

  async function config(t, data, perfil, metodo) {
    if (metodo === "PUT") {
      if (!h.isAdmin(perfil)) throw apiError(403, "Ligar ou desligar a conferência da pesagem é do ADM.");
      const ligada = data?.conferencia_segundo_usuario !== false;
      await update(ref(firebaseDb), { "config/pdLote/conferenciaSegundoUsuario": ligada ? null : false });
      return { conferencia_segundo_usuario: ligada };
    }
    return { conferencia_segundo_usuario: (await get(ref(firebaseDb, "config/pdLote/conferenciaSegundoUsuario"))).val() !== false };
  }

  async function route({ method, path, data, profile, tenant }) {
    let m;
    if ((m = path.match(/^\/pd\/projetos\/([^/]+)\/amostras-elegiveis$/)) && method === "GET") return elegiveis(tenant, decodeURIComponent(m[1]));
    if (path === "/pd/manipulacao-lotes" && method === "POST") return criar(tenant, data, profile);
    if (path === "/pd/manipulacao-lotes-config" && ["GET", "PUT"].includes(method)) return config(tenant, data, profile, method);
    if ((m = path.match(/^\/pd\/manipulacao-lotes\/([^/]+)$/))) {
      if (method === "GET") return detalhe(tenant, m[1], profile);
      if (method === "PUT") return salvar(tenant, m[1], data, profile);
    }
    if ((m = path.match(/^\/pd\/manipulacao-lotes\/([^/]+)\/(gerar-ordem|pesagens|corrigir-pesagem|conferir|registrar-manipulacao|aprovar-critico)$/)) && method === "POST") return servidor(tenant, m[1], m[2], data, profile);
    if ((m = path.match(/^\/pd\/manipulacao-lotes\/([^/]+)\/ocorrencia$/)) && method === "POST") return ocorrencia(tenant, m[1], data, profile);
    if ((m = path.match(/^\/pd\/manipulacao-lotes\/([^/]+)\/acoes$/)) && method === "POST") return acoes(tenant, m[1], data, profile);
    if ((m = path.match(/^\/pd\/manipulacao-lotes\/([^/]+)\/membros\/([^/]+)\/remover$/)) && method === "POST") return remover(tenant, m[1], decodeURIComponent(m[2]), data, profile);
    if ((m = path.match(/^\/pd\/manipulacao-lotes\/([^/]+)\/cancelar$/)) && method === "POST") return cancelar(tenant, m[1], data, profile);
    if ((m = path.match(/^\/pd\/manipulacao-lotes\/([^/]+)\/base-projeto$/)) && method === "POST") return baseProjeto(tenant, m[1], data, profile);
    return NAO_TRATADA;
  }
  return { route };
}

/* LM-11: custo P&D de cada amostra e do lote, pela versão travada (o servidor grava cost_brl em cada item
 * com a mesma conta do pdItemCosts: % × R$/kg). R$/kg da fórmula = soma; da amostra = × quantidade em g. */
export function custosDoLote(lote, itens) {
  const porFormula = agrupar(itens, "formula_id");
  const por_amostra = {};
  let total = 0;
  for (const r of ativosDe(lote)) {
    const fid = lote.membros[r]?.formula_id_lote;
    if (!fid) continue;
    const brlKg = (porFormula.get(fid) || []).reduce((s, i) => s + (Number(i.cost_brl) || 0), 0);
    const brlAmostra = brlKg * (Number(lote.membros[r].quantidade_g) || 0) / 1000;
    por_amostra[r] = { brl_kg: Math.round(brlKg * 100) / 100, brl_amostra: Math.round(brlAmostra * 100) / 100 };
    total += brlAmostra;
  }
  return Object.keys(por_amostra).length ? { por_amostra, total_brl: Math.round(total * 100) / 100 } : null;
}

/* LM-05: o que a exclusão faz com os lotes. Puro (recebe lotes lidos, devolve caminhos planos).
 * Histórico = lote com ordem gerada (o servidor criou as versões travadas e a ordem de pesagem),
 * mesmo que a amostra tenha saído do lote depois ou o lote tenha sido cancelado. */
export const temOrdem = (l) => Boolean(l?.ordem) || ["ordem_gerada", "manipulado"].includes(l?.status);
export function historicoDeLote(lotes, requestId) {
  return (lotes || []).filter((l) => l?.membros?.[requestId] && (temOrdem(l) || l.membros[requestId].formula_id_lote));
}
export function planoRemocaoDosLotes({ tenant, lotes, requestId, motivo, autor, agora, novoId }) {
  const u = {};
  for (const l of lotes || []) {
    const m = l?.membros?.[requestId];
    if (!m || m.status_membro === "removido" || !M.STATUS_LOTE_ABERTO.includes(l.status)) continue;
    const L = `erp/${tenant}/${COLECAO_LOTES}/${l.id}`;
    Object.assign(u, { [`${L}/revisao`]: Number(l.revisao || 0) + 1, [`${L}/atualizado_em`]: agora, [`${L}/membros/${requestId}/status_membro`]: "removido",
      [`${L}/membros/${requestId}/removido_motivo`]: motivo, [`${L}/membros/${requestId}/removido_por`]: autor.uid, [`${L}/membros/${requestId}/removido_em`]: agora,
      [`${L}/eventos/${novoId()}`]: { tipo: "membro_removido", por: autor.uid, por_nome: autor.nome, em: agora, detalhe: `${m.codigo_amostra || requestId}: ${motivo}` } });
  }
  return u;
}
export function planoCancelarLotes({ tenant, lotes, motivo, autor, agora, novoId }) {
  const u = {};
  for (const l of lotes || []) {
    if (!M.STATUS_LOTE_ABERTO.includes(l?.status)) continue;
    const L = `erp/${tenant}/${COLECAO_LOTES}/${l.id}`;
    Object.assign(u, { [`${L}/revisao`]: Number(l.revisao || 0) + 1, [`${L}/atualizado_em`]: agora, [`${L}/status`]: "cancelado",
      [`${L}/cancelamento`]: { motivo, por: autor.uid, por_nome: autor.nome, em: agora },
      [`${L}/eventos/${novoId()}`]: { tipo: "cancelado", por: autor.uid, por_nome: autor.nome, em: agora, detalhe: motivo } });
  }
  return u;
}
