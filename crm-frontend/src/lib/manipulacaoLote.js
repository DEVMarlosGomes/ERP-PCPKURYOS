/* Manipulação em Lote de amostras do mesmo projeto (P&D, 04/11/2026).
 * Spec: docs/superpowers/specs/2026-11-04-pd-manipulacao-lote-design.md (D-01…D-12).
 *
 * A química marca 2 a 20 variações do mesmo projeto e abre uma matriz: amostras nas colunas,
 * ingredientes nas linhas. A fórmula de uma serve de ponto de partida (clonar), cada uma muda a
 * fragrância e outros ingredientes (D-02, três níveis), o 100 % de cada coluna aparece na hora e
 * sai uma ordem do lote: pré-mistura opcional por fase (só comuns com o mesmo %) + adições por
 * amostra. Gramas em inteiros (centigramas) para que a ordem do lote seja exatamente a soma das
 * ordens individuais (D-06: a pesagem comum é a soma dos arredondados, nunca o contrário).
 *
 * Funções puras: nada aqui lê ou grava no banco; datas e ids entram por parâmetro.
 * O servidor (functions/manipulacao_lote.js) tem cópia de ordemDoLote/assinatura/conciliação;
 * o contrato em manipulacaoLote.contrato.test.js cai se as duas divergirem. */

import { fechamentoFormula } from "./fechamentoFormula";

export const MIN_MEMBROS = 2;
export const MAX_MEMBROS = 20; // D-01 (Marlos, P1): 20, não 12
export const STATUS_PD_ELEGIVEIS = ["OPEN", "IN_PROGRESS"];
// gerando_ordem: o servidor travou o lote para montar a ordem (segundos); conta como aberto.
export const STATUS_LOTE_ABERTO = ["rascunho", "gerando_ordem", "ordem_gerada"];
export const MIN_MOTIVO = 5;
export const MIN_MOTIVO_DEPOIS_DA_ORDEM = 10;
export const MINIMO_PESAVEL_PADRAO_G = 0.05;
export const NIVEL = { FRAGRANCIA: 1, COMUM: 2, CRITICO: 3 };

export const ROTULO_STATUS_PD = {
  OPEN: "Aberto", IN_PROGRESS: "Em Desenvolvimento", IN_TESTS: "Em Testes", WAITING_APPROVAL: "Aguardando Aprovação",
  APPROVED: "Aprovada", COMPLETED: "Concluída", REJECTED: "Reprovada", CANCELLED: "Cancelada",
};
export const ROTULO_STATUS_LOTE = { rascunho: "Rascunho", gerando_ordem: "Gerando a ordem", ordem_gerada: "Ordem gerada", manipulado: "Manipulado", cancelado: "Cancelado" };

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) => semAcento(s).trim().toLowerCase().replace(/\s+/g, " ");
const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
export const pct4 = (v) => Math.round(num(v) * 1e4);
const cg = (g) => Math.round(num(g) * 100);
const deCg = (c) => c / 100;
export const fmtG = (g) => Number(g).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const fmtPct = (p) => Number(p).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const ordemFase = (a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "pt-BR", { numeric: true }));

/* Gramas de um ingrediente: Q (g) × c (%) / 100, meio para cima em 0,01 g, sem ponto flutuante. */
export function gramasCg(quantidadeG, percentual) {
  const n = cg(quantidadeG) * pct4(percentual); // centigramas × 10⁶
  return Math.floor((2 * n + 1e6) / 2e6);
}
export const gramas = (quantidadeG, percentual) => deCg(gramasCg(quantidadeG, percentual));

/* ── Fragrância, nível da mudança (D-02 + auditoria A1) ─────────────────────────
 * Fragrância é o que o cadastro ou a fórmula de origem dizem: material MPES ou função
 * "fragrância" no item de origem. Nome/INCI ("óleo essencial…", "Aroma…") só sugerem na tela.
 * Crítico (materiais/{key}/criticoPd) vence a fragrância. Quem grava (rota e servidor) recalcula
 * os dois com classificarIngredientes — nunca confia no que a tela mandou. */
const SUGESTAO_FRAGRANCIA = /fragr|parfum|perfum|essenc|aroma/i;
export function ehFragrancia(ing) {
  const i = ing || {};
  if (i.ehFragrancia === true) return true;
  if (String(i.tipo_material || "").toUpperCase() === "MPES") return true;
  if (/^MPES\b/i.test(String(i.codigo || i.material_code || ""))) return true;
  return [i.funcao, i.function].some((v) => /fragr/i.test(semAcento(v)));
}
export const sugereFragrancia = (ing) => !ehFragrancia(ing) && [ing?.nome, ing?.ingredient_name, ing?.inci].some((v) => SUGESTAO_FRAGRANCIA.test(semAcento(v)));
export const nivelDaMudanca = (ing) => (ing?.critico ? NIVEL.CRITICO : ehFragrancia(ing) ? NIVEL.FRAGRANCIA : NIVEL.COMUM);

/* Classificação com fonte confiável: materiais = Map(id → materiais/{id}); itensOrigem = itens das
 * fórmulas de origem (antes de cada membro e matriz). Sem material, só a função de origem vale. */
export function classificarIngredientes(ingredientes, { materiais = new Map(), itensOrigem = [] } = {}) {
  // Auditoria LM-15: crítico também pelo nome do material marcado — tirar o id do ingrediente não o descaracteriza.
  const criticosPorNome = new Set([...materiais.values()].filter((m) => m?.criticoPd === true).map((m) => norm(m.mpNome || m.nome)).filter(Boolean));
  const funcaoDe = new Map();
  for (const it of itensOrigem || []) {
    const c = chaveMaterialFase(itemParaIngrediente(it));
    if (/fragr/i.test(semAcento(it.function || it.funcao)) || !funcaoDe.has(c)) funcaoDe.set(c, it.function || it.funcao || "");
  }
  return Object.fromEntries(Object.entries(ingredientes || {}).map(([k, x]) => {
    const mat = materiais.get(x?.master_material_id) || materiais.get(x?.catalog_id) || null;
    const funcaoOrigem = funcaoDe.get(chaveMaterialFase(x || {})) || "";
    const frag = String(mat?.tipo || "").toUpperCase() === "MPES" || /^MPES\b/i.test(String(mat?.mpCodigo || "")) || /fragr/i.test(semAcento(funcaoOrigem));
    return [k, { ...x, ehFragrancia: frag, critico: mat?.criticoPd === true || criticosPorNome.has(norm(x?.nome)) }];
  }));
}

/* D-10: ADM e P&D. Mais restrito que effectiveRoles (que dá papéis de P&D ao PCP): a mesma lista
 * da regra de erp/$tenant/pd_manipulacao_lotes em database.rules.json. */
export const PAPEIS_LOTE = ["admin", "pd", "lider_pd", "formulador", "engenharia_produto"];
export function podeManipularLote(perfil) {
  if (!perfil || perfil.desativado === true) return false;
  if (PAPEIS_LOTE.includes(String(perfil.role || "").toLowerCase())) return true;
  if (PAPEIS_LOTE.some((p) => perfil.funcoes?.[p] === true)) return true;
  return perfil.modulos?.pd === true;
}

/* ── Elegibilidade (D-01) ───────────────────────────────────────────────────── */
const decisaoDoCliente = (v) => {
  const r = norm(v?.resultado_cliente || v?.resultado || "");
  const s = norm(v?.status || "");
  if (["aprovada", "aprovado"].includes(r) || ["aprovada", "aprovado"].includes(s)) return "aprovada";
  if (["reprovada", "reprovado"].includes(r) || ["reprovada", "reprovado"].includes(s)) return "reprovada";
  return "";
};
const cancelada = (v) => ["cancelada", "cancelado"].includes(norm(v?.status)) || ["cancelada", "cancelado"].includes(norm(v?.resultado_cliente));
const aguardandoCliente = (v) => {
  const s = norm(v?.status).replace(/ /g, "_");
  return ["enviada", "amostra_enviada", "em_avaliacao", "em_avaliacao_cliente"].includes(s) || s.startsWith("aguardando_retorno");
};

export function motivoInelegivel({ request, variacao, lotesAbertos = [], loteAtualId = null }) {
  if (!request) return "Sem solicitação no P&D — abra a solicitação desta variação pelo CRM.";
  const status = request.status;
  if (!status) return "Solicitação sem etapa registrada — abra-a no P&D para corrigir antes de pôr no lote.";
  if (!STATUS_PD_ELEGIVEIS.includes(status)) return `Está em ${ROTULO_STATUS_PD[status] || status}; só entram amostras Abertas ou Em Desenvolvimento.`;
  if (cancelada(variacao)) return "Variação cancelada no CRM.";
  const decisao = decisaoDoCliente(variacao);
  if (decisao) return `O cliente já decidiu (${decisao}) — a amostra não volta para a bancada pelo lote.`;
  // Auditoria A4: enviada e aguardando o retorno do cliente não entra (o cliente avalia a versão que recebeu).
  if (aguardandoCliente(variacao)) return "Amostra enviada ao cliente, aguardando retorno — registre o retorno antes de pôr no lote.";
  const outro = (lotesAbertos || []).find((l) => l?.id !== loteAtualId && STATUS_LOTE_ABERTO.includes(l?.status || "rascunho")
    && l?.membros?.[request.id] && l.membros[request.id].status_membro !== "removido");
  if (outro) return `Já está no lote ${outro.codigo} — conclua ou tire a amostra de lá.`;
  return "";
}

export function validarSelecao(selecionadas) {
  const l = selecionadas || [];
  if (l.length < MIN_MEMBROS) return `Selecione pelo menos ${MIN_MEMBROS} amostras.`;
  if (l.length > MAX_MEMBROS) return `Selecione no máximo ${MAX_MEMBROS} amostras por lote — acima disso, monte dois lotes.`;
  const fora = l.filter((a) => !a.elegivel);
  if (fora.length) return fora.map((a) => `${a.codigo || a.request_id}: ${a.motivo}`).join(" ");
  return "";
}

/* ── Matriz (D-04) ──────────────────────────────────────────────────────────── */
const quando = (f) => String(f?.updated_at || f?.created_at || "");
export function matrizPadrao(candidatas) {
  const comItens = (candidatas || []).filter((c) => c?.formula && (c.itens || []).length)
    .map((c) => ({ ...c, fecha: fechamentoFormula(c.itens).ok }))
    .sort((a, b) => quando(b.formula).localeCompare(quando(a.formula)) || num(b.formula.version) - num(a.formula.version));
  const escolhida = comItens.find((c) => c.fecha) || comItens[0];
  if (!escolhida) return null;
  return { tipo: "amostra", request_id: escolhida.request_id, ref_id: escolhida.formula.id, versao: num(escolhida.formula.version) || 1, fecha: escolhida.fecha };
}

export function itemParaIngrediente(it, criticos) {
  const mmid = it.master_material_id || it.catalog_id || "";
  const ing = {
    nome: String(it.ingredient_name || it.nome || "").trim(), codigo: it.material_code || it.codigo || "",
    catalog_id: it.catalog_id || "", master_material_id: it.master_material_id || "", inci: it.inci || "",
    fase: String(it.phase ?? it.fase ?? "").trim(), funcao: it.function || it.funcao || "",
    price_per_kg: num(it.price_per_kg), price_usd: it.price_usd ?? null, price_currency: it.price_currency || null,
    unit: it.unit || null, fornecedor: it.supplier_names || it.fornecedor || "", mp_nova: it.mp_nova || null,
  };
  ing.ehFragrancia = ehFragrancia({ ...ing, function: it.function });
  ing.critico = Boolean(criticos && mmid && (criticos.has?.(mmid) || criticos.has?.(it.master_material_id)));
  return ing;
}
export const chaveMaterialFase = (ing) => `${ing.master_material_id || ing.catalog_id || norm(ing.nome)}|${norm(ing.fase)}`;
const proximaChave = (n) => `i${String(n).padStart(2, "0")}`;

export function montarMatriz({ matrizItens = [], membros = [], criticos = null }) {
  const ingredientes = {};
  const porChave = new Map();
  const chaveDe = (it) => {
    const ing = itemParaIngrediente(it, criticos);
    const c = chaveMaterialFase(ing);
    if (!porChave.has(c)) { const k = proximaChave(porChave.size + 1); porChave.set(c, k); ingredientes[k] = ing; }
    return porChave.get(c);
  };
  const coluna = (itens) => {
    const col = {};
    for (const it of itens || []) {
      const k = chaveDe(it);
      const p = num(it.percentage ?? it.percentual);
      if (p > 0) col[k] = (pct4(col[k] || 0) + pct4(p)) / 1e4;
    }
    return col;
  };
  const matrizCelulas = coluna(matrizItens);
  const celulas = {};
  for (const m of membros) celulas[m.request_id] = (m.itens || []).length ? coluna(m.itens) : { ...matrizCelulas };
  return { ingredientes, celulas, matrizCelulas };
}

export function clonar(celulas, { de, para = [], ingKey = null, matrizCelulas = {} }) {
  const origem = de === "matriz" ? matrizCelulas : (celulas || {})[de] || {};
  const out = { ...(celulas || {}) };
  for (const p of para) {
    if (p === de) continue;
    if (ingKey) {
      const col = { ...(out[p] || {}) };
      if (num(origem[ingKey]) > 0) col[ingKey] = origem[ingKey]; else delete col[ingKey];
      out[p] = col;
    } else out[p] = { ...origem };
  }
  return out;
}

/* ── Diferenças, motivo e aprovação (D-02) ──────────────────────────────────── */
const chavesOrdenadas = (ingredientes) => Object.keys(ingredientes || {}).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

export function diferencas({ ingredientes, celulas, matrizCelulas = {} }) {
  const out = {};
  for (const [r, col] of Object.entries(celulas || {})) {
    out[r] = chavesOrdenadas(ingredientes)
      .filter((k) => pct4(col?.[k]) !== pct4(matrizCelulas[k]))
      .map((k) => ({ ingKey: k, nome: ingredientes[k].nome, de: num(matrizCelulas[k]), para: num(col?.[k]), nivel: nivelDaMudanca(ingredientes[k]) }));
  }
  return out;
}

/* Fórmula de origem de uma amostra (a vigente quando entrou no lote) vista nas chaves do lote, por material
 * + fase. `fora` = itens de origem que não têm linha no lote (rascunho mexido por fora). */
export function celulasDaOrigem(ingredientes, itens) {
  const porChave = new Map(Object.entries(ingredientes || {}).map(([k, ing]) => [chaveMaterialFase(ing || {}), k]));
  const celulas = {};
  const fora = [];
  for (const it of itens || []) {
    const p = num(it?.percentage ?? it?.percentual);
    if (!(p > 0)) continue;
    const ing = itemParaIngrediente(it);
    const k = porChave.get(chaveMaterialFase(ing));
    if (k) celulas[k] = (pct4(celulas[k] || 0) + pct4(p)) / 1e4;
    else fora.push(ing.nome);
  }
  return { celulas, fora };
}

/* Auditoria LM-15: crítico é comparado com a matriz E com a fórmula anterior da própria amostra
 * (origem[r]) — clonar a matriz não pode mudar um conservante sem aprovação. daAmostra = só difere da origem. */
export function diferencasDoLote({ ingredientes, celulas, matrizCelulas = {}, origem = {} }) {
  const d = diferencas({ ingredientes, celulas, matrizCelulas });
  for (const [r, col] of Object.entries(celulas || {})) {
    const o = origem?.[r];
    if (!o) continue;
    const ja = new Set((d[r] || []).map((x) => x.ingKey));
    for (const k of chavesOrdenadas(ingredientes)) {
      if (ja.has(k) || nivelDaMudanca(ingredientes[k]) !== NIVEL.CRITICO || pct4(col?.[k]) === pct4(o[k])) continue;
      (d[r] ||= []).push({ ingKey: k, nome: ingredientes[k].nome, de: num(o[k]), para: num(col?.[k]), nivel: NIVEL.CRITICO, daAmostra: true });
    }
  }
  return d;
}

/* Decisão do Marlos (05/11/2026): o lote NÃO pede comentário de alteração. Quem alterou cada célula é
 * registrado sozinho no salvamento (motivos/{r}/{k}: valor, por, em — o nome do nó ficou por compatibilidade).
 * D-1: a única pendência que sobra é o ingrediente CRÍTICO que muda a fórmula ANTERIOR da própria amostra —
 * precisa de "Aprovar" de um ADM/RT que não seja quem alterou. Amostra sem fórmula anterior (primeira
 * formulação) não tem o que aprovar: o crítico só aparece com o selo. */
export function mudancasCriticasDaOrigem({ ingredientes, celulas, origem = {} }) {
  const out = {};
  for (const [r, col] of Object.entries(celulas || {})) {
    const o = origem?.[r];
    if (!o) continue; // sem fórmula anterior
    const l = chavesOrdenadas(ingredientes)
      .filter((k) => nivelDaMudanca(ingredientes[k]) === NIVEL.CRITICO && pct4(col?.[k]) !== pct4(o[k]))
      .map((k) => ({ ingKey: k, nome: ingredientes[k].nome, de: num(o[k]), para: num(col?.[k]), nivel: NIVEL.CRITICO, daAmostra: true }));
    if (l.length) out[r] = l;
  }
  return out;
}

export function pendencias({ ingredientes, celulas, motivos = {}, aprovacoes = {}, membros, origem = {} }) {
  const d = mudancasCriticasDaOrigem({ ingredientes, celulas, origem });
  const out = [];
  for (const r of membros || Object.keys(celulas || {})) {
    for (const x of d[r] || []) {
      const quem = motivos?.[r]?.[x.ingKey];
      const base = { request_id: r, ingKey: x.ingKey, nome: x.nome, nivel: x.nivel, tipo: "aprovacao" };
      const ap = aprovacoes?.[r]?.[x.ingKey];
      if (!ap) out.push({ ...base, motivo: `${x.nome} é crítico e muda a fórmula anterior desta amostra (${fmtPct(x.de)} → ${fmtPct(x.para)} %): falta a aprovação ("Aprovar") de um ADM ou RT que não seja quem alterou.` });
      else if (pct4(ap.valor) !== pct4(x.para)) out.push({ ...base, motivo: `${x.nome}: o valor mudou depois da aprovação — peça de novo.` });
      // A aprovação vale para o material + fase aprovados, não para a linha (trocar o material invalida).
      else if (ap.chave !== chaveMaterialFase(ingredientes[x.ingKey] || {})) out.push({ ...base, motivo: `${x.nome}: o material mudou depois da aprovação — peça de novo.` });
      // O carimbo tem que ser do valor e do material ATUAIS (senão "quem alterou" é de outra mudança) e o aprovador, outra pessoa.
      else if (!quem?.por || pct4(quem.valor) !== pct4(x.para) || quem.chave !== chaveMaterialFase(ingredientes[x.ingKey] || {}) || ap.por === quem.por) out.push({ ...base, motivo: `${x.nome}: a aprovação precisa ser de outra pessoa que não quem alterou (salve antes de pedir a aprovação).` });
    }
  }
  return out;
}

// Só soma linhas que existem no lote (auditoria LM-15: chave fantasma não fecha 100 %).
export function fechamentoPorMembro(celulas, membros, ingredientes = null) {
  const out = {};
  for (const r of membros || Object.keys(celulas || {})) {
    const col = Object.entries(celulas?.[r] || {}).filter(([k]) => !ingredientes || Object.prototype.hasOwnProperty.call(ingredientes, k));
    out[r] = fechamentoFormula(col.map(([, p]) => ({ percentage: p })));
  }
  return out;
}

/* ── Quantidade (D-06) ──────────────────────────────────────────────────────── */
export function quantidadeEmGramas(m) {
  const r2 = (x) => Math.round(x * 100) / 100;
  if (num(m?.quantidade_g) > 0) return r2(num(m.quantidade_g));
  const q = num(m?.quantidade_pedido);
  if (!(q > 0)) return null;
  const u = norm(m?.unidade_pedido || "g");
  if (u === "g") return r2(q);
  if (num(m?.densidade) > 0) return r2(q * num(m.densidade));
  return null;
}

/* ── Ordem do lote (D-05/D-06) ──────────────────────────────────────────────── */
export function ordemIndividual({ ingredientes, celulas, membro }) {
  const q = quantidadeEmGramas(membro);
  if (q == null) return [];
  const col = celulas?.[membro.request_id] || {};
  return chavesOrdenadas(ingredientes).filter((k) => num(col[k]) > 0)
    .map((k) => ({ ingKey: k, nome: ingredientes[k].nome, fase: String(ingredientes[k].fase || "").trim(), pct: num(col[k]), teorico_g: gramas(q, col[k]) }));
}

const moda = (valores) => {
  const cont = new Map();
  for (const v of valores) cont.set(v, (cont.get(v) || 0) + 1);
  return [...cont.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
};

export function ordemDoLote({ ingredientes, celulas, membros, preMistura = {}, perdaPct = 0, minimoPesavelG = MINIMO_PESAVEL_PADRAO_G }) {
  const avisos = [];
  const sem_quantidade = [];
  const ativos = [];
  for (const m of membros || []) {
    if (quantidadeEmGramas(m) == null) { sem_quantidade.push(m.request_id); avisos.push(`${m.codigo_amostra || m.request_id}: informe a quantidade em g (ou a densidade, se o pedido é em ml) — fica fora da ordem.`); }
    else ativos.push(m);
  }
  const codigo = (r) => ativos.find((m) => m.request_id === r)?.codigo_amostra || r;
  const individuais = new Map(ativos.map((m) => [m.request_id, ordemIndividual({ ingredientes, celulas, membro: m })]));
  const gDe = (r, k) => individuais.get(r).find((l) => l.ingKey === k);
  const keys = chavesOrdenadas(ingredientes);
  const fases = [...new Set(keys.filter((k) => ativos.some((m) => num(celulas?.[m.request_id]?.[k]) > 0)).map((k) => String(ingredientes[k].fase || "").trim()))].sort(ordemFase);
  const p = Math.max(0, num(perdaPct));
  const pre_misturas = {};
  const naPreMistura = new Set();
  fases.forEach((fase) => {
    if (!fase || !preMistura?.[fase] || ativos.length < 2) return;
    const daFase = keys.filter((k) => String(ingredientes[k].fase || "").trim() === fase && ativos.some((m) => num(celulas?.[m.request_id]?.[k]) > 0));
    const comuns = [];
    for (const k of daFase) {
      const valores = ativos.map((m) => pct4(celulas?.[m.request_id]?.[k]));
      if (valores.every((v) => v > 0 && v === valores[0])) { comuns.push(k); continue; }
      const ausentes = ativos.filter((m, i) => valores[i] === 0).map((m) => m.codigo_amostra || m.request_id);
      const presentes = valores.filter((v) => v > 0);
      const mais = moda(presentes);
      const diferentes = ativos.filter((m, i) => valores[i] > 0 && valores[i] !== mais).map((m) => m.codigo_amostra || m.request_id);
      const partes = [ausentes.length ? `ausente em ${ausentes.join(", ")}` : "", diferentes.length ? `% diferente em ${diferentes.join(", ")}` : ""].filter(Boolean);
      avisos.push(`Fase ${fase} · ${ingredientes[k].nome}: pesar separado: ${partes.join("; ")}.`);
    }
    if (!comuns.length) { avisos.push(`Fase ${fase}: nenhum ingrediente comum com o mesmo % — pré-mistura não se aplica.`); return; }
    const linhas = comuns.map((k) => {
      const por = {};
      let baseCg = 0;
      for (const m of ativos) { const c = cg(gDe(m.request_id, k).teorico_g); por[m.request_id] = deCg(c); baseCg += c; }
      // Auditoria B1: excesso sempre para cima, para nenhuma linha ficar sem a sua parte do excesso.
      const pesadoCg = p > 0 ? Math.ceil(baseCg * (100 + p) / 100 - 1e-9) : baseCg;
      naPreMistura.add(k);
      return { ingKey: k, nome: ingredientes[k].nome, fase, pct: num(celulas[ativos[0].request_id][k]), por_membro: por, base_g: deCg(baseCg), teorico_g: deCg(pesadoCg) };
    });
    const porcoes = {};
    for (const m of ativos) porcoes[m.request_id] = deCg(linhas.reduce((s, l) => s + cg(l.por_membro[m.request_id]), 0));
    pre_misturas[fase] = { fase, linhas, porcoes, excesso_pct: p,
      total_base_g: deCg(linhas.reduce((s, l) => s + cg(l.base_g), 0)), total_pesado_g: deCg(linhas.reduce((s, l) => s + cg(l.teorico_g), 0)) };
  });
  const adicoes = {};
  const passos = {};
  for (const m of ativos) {
    const r = m.request_id;
    adicoes[r] = individuais.get(r).filter((l) => !naPreMistura.has(l.ingKey)).sort((a, b) => ordemFase(a.fase, b.fase));
    passos[r] = [];
    for (const fase of fases) {
      if (pre_misturas[fase]) passos[r].push({ tipo: "porcao", fase, g: pre_misturas[fase].porcoes[r] });
      const ad = adicoes[r].filter((l) => l.fase === fase);
      if (ad.length) passos[r].push({ tipo: "adicao", fase, linhas: ad });
    }
  }
  // Linhas de pesagem (ids estáveis para a pesagem e a conferência no servidor).
  const linhas_pesagem = {};
  fases.forEach((fase, i) => (pre_misturas[fase]?.linhas || []).forEach((l) => {
    linhas_pesagem[`pm${i}_${l.ingKey}`] = { tipo: "pre_mistura", fase, ingKey: l.ingKey, nome: l.nome, teorico_g: l.teorico_g };
  }));
  for (const m of ativos) for (const l of adicoes[m.request_id]) {
    linhas_pesagem[`ad_${m.request_id}_${l.ingKey}`] = { tipo: "adicao", fase: l.fase, ingKey: l.ingKey, nome: l.nome, request_id: m.request_id, codigo_amostra: codigo(m.request_id), teorico_g: l.teorico_g };
  }
  const minimo = num(minimoPesavelG) || MINIMO_PESAVEL_PADRAO_G;
  for (const l of Object.values(linhas_pesagem)) {
    if (l.teorico_g > 0 && l.teorico_g < minimo) {
      avisos.push(`${l.codigo_amostra ? `${l.codigo_amostra}: ` : `Pré-mistura fase ${l.fase}: `}${l.nome} ${fmtG(l.teorico_g)} g abaixo do mínimo pesável (${fmtG(minimo)} g) — pré-dilua a 10 % e pese ${fmtG(Math.round(l.teorico_g * 1000) / 100)} g da diluição.`);
    }
  }
  // Reconciliação: cada linha do lote (parte na pré-mistura ou adição) = ordem individual.
  const difs = [];
  for (const m of ativos) for (const l of individuais.get(m.request_id)) {
    const pm = Object.values(pre_misturas).flatMap((x) => x.linhas).find((x) => x.ingKey === l.ingKey);
    const noLote = pm ? pm.por_membro[m.request_id] : adicoes[m.request_id].find((x) => x.ingKey === l.ingKey)?.teorico_g;
    if (noLote == null || Math.abs(cg(noLote) - cg(l.teorico_g)) > 1) difs.push({ request_id: m.request_id, ingKey: l.ingKey, individual: l.teorico_g, lote: noLote ?? null });
  }
  const total = deCg(Object.values(linhas_pesagem).reduce((s, l) => s + cg(l.teorico_g), 0));
  return { fases, pre_misturas, adicoes, passos, linhas_pesagem, avisos, sem_quantidade, total_teorico_g: total,
    reconciliacao: { ok: !difs.length, diferencas: difs } };
}

/* ── Assinatura de versão, conciliação de massa, Kickoff ───────────────────── */
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i += 1) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}
/* Texto canônico de uma versão: material (id do cadastro ou código), nome, fase e % (4 casas),
 * ordenado (auditoria M2: trocar o material com o mesmo nome muda a assinatura). O cliente usa
 * cyrb53 para detectar edição fora do lote; o servidor assina a ordem com SHA-256 do mesmo texto. */
export function textoCanonicoItens(itens) {
  return (itens || []).filter((i) => pct4(i?.percentage ?? i?.pct) > 0)
    .map((i) => `${norm(i.master_material_id || i.catalog_id || i.material_code || i.codigo || "")}|${norm(i.ingredient_name ?? i.nome)}|${norm(i.phase ?? i.fase)}|${pct4(i.percentage ?? i.pct)}`)
    .sort().join(";");
}
export const assinaturaItens = (itens) => cyrb53(textoCanonicoItens(itens));
export const itensDaColuna = (ingredientes, col) => chavesOrdenadas(ingredientes).filter((k) => num(col?.[k]) > 0)
  .map((k) => ({ ingredient_name: ingredientes[k].nome, phase: ingredientes[k].fase || "", percentage: num(col[k]),
    master_material_id: ingredientes[k].master_material_id || "", catalog_id: ingredientes[k].catalog_id || "", material_code: ingredientes[k].codigo || "" }));

/* Conciliação de massa (§5): pesado = entregue + retenção + descarte + perda, dentro de
 * max(0,05 g × n; 0,5 %). Auditoria M3: a perda declarada tem teto (excesso previsto do lote,
 * nunca menos que a tolerância); acima disso a sobra é descarte, com motivo. */
export function conciliacaoMassa({ pesadoG, entregue = {}, retencao = {}, descarteG = 0, perdaDeclaradaG = 0, n = 1, perdaPct = 0 }) {
  const destinosCg = Object.values(entregue).reduce((s, g) => s + cg(g), 0) + Object.values(retencao).reduce((s, r) => s + cg(r?.g), 0) + cg(descarteG) + cg(perdaDeclaradaG);
  const pesadoCg = cg(pesadoG);
  const toleranciaCg = Math.max(5 * Math.max(1, num(n)), Math.round(pesadoCg * 0.005));
  const perdaMaxCg = Math.max(toleranciaCg, Math.ceil(pesadoCg * Math.max(0, num(perdaPct)) / 100));
  const residuoCg = pesadoCg - destinosCg;
  const perdaOk = cg(perdaDeclaradaG) <= perdaMaxCg;
  return { pesado_g: deCg(pesadoCg), destinos_g: deCg(destinosCg), residuo_g: deCg(residuoCg), tolerancia_g: deCg(toleranciaCg),
    perda_max_g: deCg(perdaMaxCg), perda_ok: perdaOk, ok: perdaOk && Math.abs(residuoCg) <= toleranciaCg };
}

/* Pesagem por linha (auditoria M4): desvio aceito sem motivo até max(0,01 g; 1 % do teórico). */
export function toleranciaPesagem(teoricoG) {
  return deCg(Math.max(1, Math.round(cg(teoricoG) * 0.01)));
}
export function desvioPesagem(teoricoG, realG) {
  const d = deCg(cg(realG) - cg(teoricoG));
  return { desvio_g: d, tolerancia_g: toleranciaPesagem(teoricoG), dentro: Math.abs(cg(d)) <= cg(toleranciaPesagem(teoricoG)) };
}

/* Kickoff "o que varia" (auditoria M8): composição gravada pelo servidor ao gerar a ordem (versão
 * travada). Só vale a composição da versão que o cliente aprovou (aprovacao_cliente.formula_aprovada,
 * quando registrada); compara por material + fase (chave), não por nome. */
export function composicaoValida(variacao) {
  const lm = variacao?.lote_manipulacao;
  if (!Array.isArray(lm?.composicao) || lm.removido_em) return null;
  const aprovada = variacao?.aprovacao_cliente?.formula_aprovada?.id;
  if (aprovada && lm.formula_id && aprovada !== lm.formula_id) return null;
  return lm.composicao;
}
export function oQueVaria(variacoesAprovadas) {
  const lista = (variacoesAprovadas || []).map(composicaoValida).filter(Boolean);
  if (lista.length < 2) return [];
  const chave = (c) => c.chave || norm(c.nome);
  const nomes = new Map();
  lista.forEach((comp) => comp.forEach((c) => { if (!nomes.has(chave(c))) nomes.set(chave(c), c.nome); }));
  const out = new Set();
  for (const [k, nome] of nomes) {
    const valores = lista.map((comp) => pct4(comp.find((c) => chave(c) === k)?.pct));
    if (valores.some((v) => v !== valores[0])) out.add(nome);
  }
  return [...out].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/* ── Plano do salvamento: um update() com caminhos planos (§6 da spec) ───────
 * Auditoria A4: salvar grava só o RASCUNHO no nó do lote (e Aberto → Em Desenvolvimento). As
 * versões de pd_formulas nascem no servidor ao gerar a ordem, já travadas — antes disso nada no
 * P&D (vigente, ficha, BOM, SKU) enxerga o rascunho. */
export function limpo(v) {
  if (Array.isArray(v)) return v.map(limpo);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, limpo(x)]));
  return v;
}
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));

function assinaturaRascunho(r, membrosAtivos, quantidades) {
  return canon({
    ingredientes: r.ingredientes || {}, celulas: Object.fromEntries(membrosAtivos.map((m) => [m, r.celulas?.[m] || {}])),
    pre_mistura: r.pre_mistura || {}, perda_pct: num(r.perda_pct), minimo: num(r.minimo_pesavel_g),
    q: Object.fromEntries(membrosAtivos.map((m) => [m, [num(quantidades?.[m]?.quantidade_g), num(quantidades?.[m]?.densidade)]])),
  });
}

// Auditoria B3: cada salvamento leva o de→para de cada célula que mudou.
export function mudancasDoRascunho(lote, rascunho, membros) {
  const out = [];
  for (const r of membros) {
    const antes = lote.celulas?.[r] || {};
    const depois = rascunho.celulas?.[r] || {};
    for (const k of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
      if (pct4(antes[k]) !== pct4(depois[k])) out.push({ r, k, nome: rascunho.ingredientes?.[k]?.nome || lote.ingredientes?.[k]?.nome || k, de: num(antes[k]), para: num(depois[k]) });
    }
  }
  return out;
}

export function planoSalvarLote({ tenantPath, lote, rascunho, contexto, agora, autor, novoId }) {
  const L = `${tenantPath}/pd_manipulacao_lotes/${lote.id}`;
  const T = tenantPath;
  const ativos = Object.entries(lote.membros || {}).filter(([, m]) => m.status_membro !== "removido").map(([r]) => r);
  const ing = rascunho.ingredientes || {};
  const quantidades = rascunho.quantidades || {};
  const celulas = Object.fromEntries(ativos.map((r) => [r, rascunho.celulas?.[r] || {}]));
  const difs = diferencasDoLote({ ingredientes: ing, celulas, matrizCelulas: lote.matriz?.celulas || {}, origem: contexto.origem || {} });
  const resumo = { semMudanca: false, passaramEmDesenvolvimento: [], mudancas: [] };
  const gravado = { ingredientes: lote.ingredientes, celulas: lote.celulas, motivos: lote.motivos, pre_mistura: lote.pre_mistura, perda_pct: lote.perda_pct, minimo_pesavel_g: lote.minimo_pesavel_g };
  const qGravadas = Object.fromEntries(ativos.map((r) => [r, { quantidade_g: lote.membros[r].quantidade_g, densidade: lote.membros[r].densidade }]));
  // Duplo clique / reenvio com o mesmo conteúdo: nada a gravar (nem revisão).
  if (assinaturaRascunho(rascunho, ativos, quantidades) === assinaturaRascunho(gravado, ativos, qGravadas)) return { updates: {}, resumo: { ...resumo, semMudanca: true } };

  const u = {};
  const motivos = {};
  for (const r of ativos) {
    const req = contexto.requests.get(r);
    if (req && req.status === "OPEN") {
      u[`${T}/pd_requests/${r}/status`] = "IN_PROGRESS";
      u[`${T}/pd_requests/${r}/updated_at`] = agora;
      const hid = novoId();
      u[`${T}/pd_request_status_history/${hid}`] = { id: hid, request_id: r, pd_request_id: r, from_status: "OPEN", to_status: "IN_PROGRESS",
        comment: `Desenvolvimento iniciado pela manipulação em lote ${lote.codigo}`, changed_by: autor.uid, changed_by_name: autor.nome, created_at: agora, user_id: autor.uid };
      resumo.passaramEmDesenvolvimento.push(r);
    }
    // Registro automático da alteração (05/11: sem comentário): quem/quando/valor de cada célula que difere
    // da matriz ou da fórmula anterior. O carimbo só muda quando o valor muda — assim "quem alterou" é
    // sempre a última pessoa que mexeu naquele número (base do "aprovar" de crítico da D-1).
    const dr = (difs[r] || []).filter((x) => x.nivel >= NIVEL.COMUM);
    for (const x of dr) {
      const ant = lote.motivos?.[r]?.[x.ingKey];
      const texto = String(rascunho.motivos?.[r]?.[x.ingKey]?.texto ?? ant?.texto ?? "").trim();
      motivos[r] = motivos[r] || {};
      const chave = chaveMaterialFase(ing[x.ingKey] || {});
      motivos[r][x.ingKey] = ant && ant.por && pct4(ant.valor) === pct4(x.para) && ant.chave === chave ? { ...ant, texto }
        : { texto, nivel: x.nivel, valor: x.para, chave, por: autor.uid, por_nome: autor.nome, em: agora };
    }
    const q = quantidades[r] || {};
    const Lm = `${L}/membros/${r}`;
    u[`${Lm}/quantidade_g`] = num(q.quantidade_g) > 0 ? num(q.quantidade_g) : null;
    u[`${Lm}/densidade`] = num(q.densidade) > 0 ? num(q.densidade) : null;
    const daBase = dr.filter((x) => !x.daAmostra); // fora da base = difere da matriz
    u[`${Lm}/fora_da_base`] = daBase.some((x) => x.nivel === NIVEL.CRITICO);
    u[`${Lm}/diferencas`] = daBase.length ? daBase.map((x) => x.nome) : null;
  }
  resumo.mudancas = mudancasDoRascunho(lote, rascunho, ativos);
  u[`${L}/ingredientes`] = limpo(ing);
  u[`${L}/celulas`] = Object.fromEntries(Object.entries(celulas).filter(([, c]) => Object.keys(c).length));
  u[`${L}/motivos`] = motivos;
  u[`${L}/pre_mistura`] = Object.fromEntries(Object.entries(rascunho.pre_mistura || {}).filter(([f, v]) => f && v === true));
  u[`${L}/perda_pct`] = Math.max(0, num(rascunho.perda_pct));
  u[`${L}/minimo_pesavel_g`] = num(rascunho.minimo_pesavel_g) > 0 ? num(rascunho.minimo_pesavel_g) : MINIMO_PESAVEL_PADRAO_G;
  u[`${L}/revisao`] = num(lote.revisao) + 1;
  u[`${L}/atualizado_em`] = agora;
  u[`${L}/atualizado_por`] = autor.uid;
  u[`${L}/atualizado_por_nome`] = autor.nome;
  u[`${L}/eventos/${novoId()}`] = limpo({ tipo: "salvo", por: autor.uid, por_nome: autor.nome, em: agora,
    detalhe: `${ativos.length} amostra(s); ${resumo.mudancas.length} célula(s) alterada(s).`,
    mudancas: resumo.mudancas.slice(0, 300).map((x) => `${lote.membros[x.r]?.codigo_amostra || x.r} · ${x.nome}: ${fmtPct(x.de)} → ${fmtPct(x.para)} %`) });
  return { updates: u, resumo };
}
