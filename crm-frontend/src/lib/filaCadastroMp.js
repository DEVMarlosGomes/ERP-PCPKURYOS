/* Fila de cadastro das MPs novas do P&D (PLANO_PD_CRM_AJUSTES.md, Fase 4).
 *
 * Cliente aprovou a amostra → cada MP nova (não cadastrada) da fórmula aprovada
 * vira tarefa em solicitacoes_cadastro_material/ (raiz do banco, lida pelo
 * Cadastros do PCP). Chave fixa por fórmula+item: aprovar de novo não duplica;
 * retrabalho gera versão nova, com itens novos, e as tarefas novas.
 * AMO-04 (22/10/2026): leva também os campos do material da linha (INCI até US$, ver
 * ingredienteCampos.js) em `campos`; inci/fornecedor na raiz continuam para o legado.
 * Funções puras: nada aqui lê ou grava no banco. */

import { camposMaterialDoItem } from "./ingredienteCampos";

export const chaveSolicitacaoMp = (formulaId, itemId) => `${formulaId}__${itemId}`;

/* ── PD-03 (reunião 28/10/2026, D-08): a solicitação nasce AO SALVAR o ingrediente ──────────
 * Chave fixa pelo nome normalizado (o mesmo de materiais_chave, shared/duplicidade-material.js):
 * salvar de novo, outra fórmula ou outra amostra com a mesma MP caem na MESMA solicitação, que
 * guarda em `origens` cada item (fórmula__item) que a usa. Status PENDENTE_CADASTRO com a marca
 * "amostra em desenvolvimento". Sem nenhuma origem ativa (item removido, MP trocada, versão
 * substituída, amostra descartada) a pendente vira CANCELADO — nunca é apagada. */

export const STATUS_PENDENTE = "PENDENTE_CADASTRO";
export const STATUS_CANCELADO = "CANCELADO";
export const MARCA_EM_DESENVOLVIMENTO = "amostra em desenvolvimento";
export const MARCA_APROVADA = "aprovada pelo cliente";

// Igual a DuplicidadeMaterial.normalizar (contrato em filaCadastroMp.contrato.test.js).
export function normalizarNomeMp(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/[^A-Z0-9%]+/g, " ").trim();
}

// Chave do banco: sem espaço ("GLICERINA BI DESTILADA" → "NOME__GLICERINA_BI_DESTILADA").
export function chaveSolicitacaoPorNome(nome) {
  const n = normalizarNomeMp(nome);
  return n ? `NOME__${n.replace(/ /g, "_")}` : "";
}

/* Tipo pelo contexto: fragrância/essência/parfum → MPES; o resto MPGR. Trocável num chip. */
const FRAGRANCIA = /fragr|parfum|perfum|essenc|aroma|fragance/i;
export function tipoMpNovaPeloContexto(item) {
  const i = item || {};
  return [i.ingredient_name, i.inci, i.function, i.funcao].some((v) => FRAGRANCIA.test(String(v || ""))) ? "MPES" : "MPGR";
}

export const chaveOrigemDoItem = (formulaId, itemId) => chaveSolicitacaoMp(formulaId, itemId);

export function origemDoItem({ request, formula, item, projeto }) {
  const r = request || {};
  return {
    pdRequestId: r.id || null,
    formulaId: formula?.id || item?.formula_id || null,
    formulaVersao: Number(formula?.version) || 1,
    itemId: item?.id || null,
    projetoId: projeto?.id || r.crm_project_id || r.linked_projeto_id || null,
    projetoNumero: projeto?.numero_projeto || "",
    projeto: projeto?.nome_projeto || r.project_name || "",
    amostra: r.internal_code || "",
    cliente: r.client_name || projeto?.cliente_nome || "",
  };
}

const ativas = (origens, exceto) => Object.entries(origens || {}).filter(([k, o]) => k !== exceto && o && o.ativa !== false);
const base = (chave) => `solicitacoes_cadastro_material/${chave}`;

/* Registrar (ao salvar o item com MP nova). existente = solicitação já gravada nessa chave (ou null).
 * Devolve { chave, updates } com caminhos planos a partir da raiz do banco. */
export function registrarMpNova({ existente, item, formula, request, projeto, agora, autor }) {
  const mp = item?.mp_nova;
  const chave = chaveSolicitacaoPorNome(mp?.nome);
  if (!chave || !item?.id || !(formula?.id || item.formula_id)) return { chave: "", updates: {} };
  const origem = origemDoItem({ request, formula, item, projeto });
  const k = chaveOrigemDoItem(origem.formulaId, item.id);
  const entrada = { ...origem, ativa: true, registradaEm: agora };
  const b = base(chave);
  if (!existente) {
    return { chave, updates: { [b]: {
      status: STATUS_PENDENTE,
      amostra_em_desenvolvimento: true,
      marca: MARCA_EM_DESENVOLVIMENTO,
      chave_nome: normalizarNomeMp(mp.nome),
      tipo: mp.tipo === "MPES" ? "MPES" : "MPGR",
      nome: String(mp.nome || "").trim(),
      ingrediente: item.ingredient_name || "",
      inci: item.inci || "",
      fornecedor: item.fornecedor || "",
      campos: camposMaterialDoItem(item),
      origem,
      origens: { [k]: entrada },
      nasceu_em: "salvar_ingrediente",
      criadoEm: agora,
      criadoPor: autor || "",
    } } };
  }
  const updates = { [`${b}/origens/${k}`]: entrada };
  if (existente.status === STATUS_CANCELADO) {
    Object.assign(updates, { [`${b}/status`]: STATUS_PENDENTE, [`${b}/reabertaEm`]: agora, [`${b}/amostra_em_desenvolvimento`]: true,
      [`${b}/marca`]: MARCA_EM_DESENVOLVIMENTO, [`${b}/origem`]: origem });
  }
  if (existente.status === STATUS_PENDENTE || existente.status === STATUS_CANCELADO) {
    // Enquanto ninguém cadastrou, o que o P&D digitou por último (tipo, INCI, fornecedor, preço) vale.
    updates[`${b}/tipo`] = mp.tipo === "MPES" ? "MPES" : "MPGR";
    if (item.inci) updates[`${b}/inci`] = item.inci;
    if (item.fornecedor) updates[`${b}/fornecedor`] = item.fornecedor;
    updates[`${b}/campos`] = camposMaterialDoItem(item);
  }
  return { chave, updates };
}

/* Retirar a origem (item removido, MP desmarcada/trocada, versão substituída, amostra descartada).
 * Sem outra origem ativa, a pendente vira CANCELADO (não apaga). Cadastrada/vinculada só registra. */
export function retirarOrigem({ existente, chave, chaveOrigem, agora, motivo }) {
  if (!existente || !chave || !chaveOrigem) return {};
  const b = base(chave);
  const updates = {};
  if (existente.origens?.[chaveOrigem]) {
    updates[`${b}/origens/${chaveOrigem}/ativa`] = false;
    updates[`${b}/origens/${chaveOrigem}/retiradaEm`] = agora;
    updates[`${b}/origens/${chaveOrigem}/motivo`] = motivo || "";
  }
  if (existente.status === STATUS_PENDENTE && !ativas(existente.origens, chaveOrigem).length) {
    Object.assign(updates, { [`${b}/status`]: STATUS_CANCELADO, [`${b}/canceladoEm`]: agora,
      [`${b}/motivoCancelamento`]: motivo || "MP retirada da amostra", [`${b}/amostra_em_desenvolvimento`]: false });
  }
  return updates;
}

/* Cliente aprovou: a solicitação deixa de ser "em desenvolvimento" e passa a "aprovada pelo cliente";
 * cancelada volta a pendente. */
export function marcarAprovada({ existente, chave, origem, chaveOrigem, agora }) {
  const b = base(chave);
  const updates = { [`${b}/amostra_em_desenvolvimento`]: false, [`${b}/marca`]: MARCA_APROVADA, [`${b}/aprovadaPeloClienteEm`]: agora,
    [`${b}/origem`]: origem, [`${b}/origens/${chaveOrigem}`]: { ...origem, ativa: true, registradaEm: existente?.origens?.[chaveOrigem]?.registradaEm || agora } };
  if (existente?.status === STATUS_CANCELADO) Object.assign(updates, { [`${b}/status`]: STATUS_PENDENTE, [`${b}/reabertaEm`]: agora });
  return updates;
}

const clonar = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function definir(obj, partes, valor) {
  let o = obj;
  for (let i = 0; i < partes.length - 1; i += 1) {
    if (!o[partes[i]] || typeof o[partes[i]] !== "object") o[partes[i]] = {};
    o = o[partes[i]];
  }
  o[partes[partes.length - 1]] = valor;
}

/* Um update multi-caminho do RTDB não aceita um caminho e um descendente dele juntos:
 * o descendente entra dentro do valor do ancestral. */
export function compactarUpdates(updates) {
  const out = {};
  const caminhos = Object.keys(updates).sort((a, b) => a.split("/").length - b.split("/").length);
  for (const p of caminhos) {
    const ancestral = Object.keys(out).find((q) => p.startsWith(`${q}/`));
    if (!ancestral) { out[p] = updates[p]; continue; }
    const valor = out[ancestral] && typeof out[ancestral] === "object" ? clonar(out[ancestral]) : {};
    definir(valor, p.slice(ancestral.length + 1).split("/"), updates[p]);
    out[ancestral] = valor;
  }
  return out;
}

/* Plano completo da fila para uma mudança: registra (itens salvos/copiados com MP nova), marca
 * aprovadas (retorno do cliente) e retira origens (item removido, MP trocada, versão substituída,
 * amostra descartada), nessa ordem, sobre o estado lido do banco (existentes = { chave: registro|null }).
 * Cada passo enxerga o anterior: copiar a MP para a v2 e retirar a v1 deixa a solicitação ativa.
 * registrar/aprovar: [{ item, formula, request, projeto }]; retirar: [{ chave, chaveOrigem, motivo }]. */
export function planoDaFila({ existentes = {}, registrar = [], aprovar = [], retirar = [], agora, autor }) {
  const estado = {};
  const updates = {};
  const pegar = (chave) => {
    if (!(chave in estado)) estado[chave] = existentes[chave] ? clonar(existentes[chave]) : null;
    return estado[chave];
  };
  const aplicar = (u) => {
    for (const [p, v] of Object.entries(u || {})) {
      updates[p] = v;
      const partes = p.split("/").slice(1); // tira "solicitacoes_cadastro_material"
      if (partes.length === 1) estado[partes[0]] = clonar(v);
      else { if (!estado[partes[0]]) estado[partes[0]] = {}; definir(estado[partes[0]], partes.slice(1), clonar(v)); }
    }
  };
  for (const r of registrar) {
    const chave = chaveSolicitacaoPorNome(r.item?.mp_nova?.nome);
    if (!chave) continue;
    aplicar(registrarMpNova({ ...r, existente: pegar(chave), agora, autor }).updates);
  }
  for (const r of aprovar) {
    const chave = chaveSolicitacaoPorNome(r.item?.mp_nova?.nome);
    if (!chave || !r.item?.id) continue;
    if (!pegar(chave)) aplicar({ ...registrarMpNova({ ...r, existente: null, agora, autor }).updates });
    const origem = origemDoItem(r);
    aplicar(marcarAprovada({ existente: pegar(chave), chave, origem, chaveOrigem: chaveOrigemDoItem(origem.formulaId, r.item.id), agora }));
  }
  for (const r of retirar) {
    if (!r.chave) continue;
    aplicar(retirarOrigem({ existente: pegar(r.chave), chave: r.chave, chaveOrigem: r.chaveOrigem, agora, motivo: r.motivo }));
  }
  return compactarUpdates(updates);
}

// Item que deixa de usar a MP nova → entrada de `retirar` do plano.
export const retiradaDoItem = (item, motivo) => (item?.mp_nova && item.id
  ? { chave: chaveSolicitacaoPorNome(item.mp_nova.nome), chaveOrigem: chaveOrigemDoItem(item.formula_id, item.id), motivo }
  : null);

/* Solicitação desta amostra (P&D) — o nome pode ser compartilhado com outras amostras. */
export const daSolicitacaoPd = (s, requestId) => Boolean(requestId) && (s?.origem?.pdRequestId === requestId
  || Object.values(s?.origens || {}).some((o) => o?.pdRequestId === requestId));

export function solicitacoesDeMpsNovas({ request, formula, itens, projeto, agora, autor }) {
  const r = request || {};
  const out = {};
  for (const item of itens || []) {
    if (!item?.mp_nova || !item.id || !formula?.id) continue;
    out[chaveSolicitacaoMp(formula.id, item.id)] = {
      status: "PENDENTE_CADASTRO",
      tipo: item.mp_nova.tipo === "MPES" ? "MPES" : "MPGR",
      nome: String(item.mp_nova.nome || item.ingredient_name || "").trim(),
      ingrediente: item.ingredient_name || "",
      inci: item.inci || "",
      fornecedor: item.fornecedor || "",
      campos: camposMaterialDoItem(item),
      origem: {
        pdRequestId: r.id || null,
        formulaId: formula.id,
        formulaVersao: Number(formula.version) || 1,
        itemId: item.id,
        projetoId: projeto?.id || r.crm_project_id || r.linked_projeto_id || null,
        projetoNumero: projeto?.numero_projeto || "",
        projeto: projeto?.nome_projeto || r.project_name || "",
        amostra: r.internal_code || "",
        cliente: r.client_name || projeto?.cliente_nome || "",
      },
      criadoEm: agora,
      criadoPor: autor || "",
    };
  }
  return out;
}
