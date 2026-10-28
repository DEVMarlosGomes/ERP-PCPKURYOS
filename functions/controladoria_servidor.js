// Controladoria no servidor (PROMPT_CONTROLADORIA.md). Lançamentos e fechamentos
// só nascem AQUI; a regra do banco recusa escrita direta da tela.
// Mesmo desenho de custos_resultado.js: recebe a base lida, devolve o update por
// caminhos planos (run_controladoria_servidor_test.js).
"use strict";
const Ctl = require("./controladoria");

const VERSAO = "controladoria-servidor-v1-20261028";

// Quem vê a Controladoria: ADM, ou quem o ADM marcou com o módulo Controladoria.
function ehControladoria(perfil) {
  return !!perfil && (perfil.role === "admin" || !!(perfil.modulos && perfil.modulos.controladoria === true));
}
function falhar(msg, code) { throw Object.assign(new Error(msg), {code: code || "failed-precondition"}); }
function fechado(base, comp) { const f = ((base.ctl || {}).fechamentos || {})[comp]; return !!(f && f.status === "FECHADO"); }

function prepararDerivacao(base, agora) { return Ctl.derivar(base, agora); }

/* Lançamento manual de ajuste: documento balanceado, histórico obrigatório, mês aberto. */
function prepararAjuste(base, dados, quem, agora) {
  const d = dados || {};
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(String(d.chave || ""))) falhar("Identificador do ajuste inválido.", "invalid-argument");
  const v = Ctl.validarAjuste(d, Ctl.planoDeContas(base.ctl));
  if (!v.ok) falhar(v.motivo);
  if (fechado(base, v.doc.competencia)) falhar(`O mês ${v.doc.competencia} está fechado: lance o ajuste no mês aberto, citando o período.`);
  const caminho = `ctl/lancamentos/${v.doc.competencia}/AJ_${d.chave}`;
  if (((base.ctl || {}).lancamentos || {})[v.doc.competencia] && base.ctl.lancamentos[v.doc.competencia]["AJ_" + d.chave]) return {updates: {}, repetido: true};
  return {updates: {[caminho]: Object.assign({}, v.doc, {criadoEm: agora, criadoPor: quem.nome, criadoPorUid: quem.uid, versaoMotor: VERSAO})}};
}

/* Estorno de um ajuste manual (os derivados se estornam sozinhos quando o fato muda). */
function prepararEstornoAjuste(base, dados, quem, agora) {
  const d = dados || {};
  const [comp, key] = String(d.doc || "").split("/");
  const doc = (((base.ctl || {}).lancamentos || {})[comp] || {})[key];
  if (!doc || !doc.origem || doc.origem.tipo !== "AJUSTE") falhar("Só ajuste manual se estorna por aqui.");
  if (String(d.motivo || "").trim().length < 10) falhar("Explique o motivo do estorno (mínimo 10 caracteres).", "invalid-argument");
  const jaEstornado = Object.values(base.ctl.lancamentos || {}).some((m) => Object.values(m || {}).some((x) => x && x.estornaDoc === d.doc));
  if (jaEstornado) falhar("Este ajuste já foi estornado.");
  let alvo = String(agora).slice(0, 7);
  if (fechado(base, alvo)) falhar(`O mês ${alvo} está fechado.`);
  return {updates: {[`ctl/lancamentos/${alvo}/${key}_est`]: {data: String(agora).slice(0, 10), competencia: alvo, historico: "Estorno de ajuste: " + String(d.motivo).trim().slice(0, 250),
    origem: doc.origem, estornaDoc: d.doc, partidas: Ctl.inverter(doc.partidas), totalCentavos: doc.totalCentavos, criadoEm: agora, criadoPor: quem.nome, criadoPorUid: quem.uid, versaoMotor: VERSAO}}};
}

function prepararFechamento(base, dados, quem, agora) {
  const d = dados || {};
  if (!/^\d{4}-\d{2}$/.test(String(d.competencia || ""))) falhar("Competência no formato AAAA-MM.", "invalid-argument");
  if (d.forcar && quem.role !== "admin") falhar("Só o ADM fecha com pendências.", "permission-denied");
  const r = Ctl.prepararFechamento(base, d.competencia, {agora, por: quem.nome, forcar: d.forcar === true, justificativa: d.justificativa});
  if (!r.ok) falhar(r.motivo);
  return r;
}

/* Reabertura: só o ADM, com justificativa, e fica registrada (o fechamento anterior não some). */
function prepararReabertura(base, dados, quem, agora) {
  const d = dados || {};
  if (quem.role !== "admin") falhar("Só o ADM reabre um mês.", "permission-denied");
  const comp = String(d.competencia || "");
  if (!fechado(base, comp)) falhar(`${comp} não está fechado.`);
  const just = String(d.justificativa || "").trim();
  if (just.length < 10) falhar("Justifique a reabertura (mínimo 10 caracteres).", "invalid-argument");
  const k = "r" + agora.replace(/[^0-9]/g, "").slice(0, 14);
  return {updates: {[`ctl/fechamentos/${comp}/status`]: "REABERTO", [`ctl/fechamentos/${comp}/reaberturas/${k}`]: {em: agora, por: quem.nome, justificativa: just.slice(0, 500)}}};
}

/* Painel da tela: checklist e reconciliação do mês anterior e do corrente. */
function prepararPainel(base, agora) {
  const atual = String(agora).slice(0, 7);
  const [a, m] = atual.split("-").map(Number);
  const anterior = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  const updates = {};
  [anterior, atual].forEach((comp) => {
    const ck = Ctl.checklist(base, comp, agora);
    const rec = Ctl.reconciliacao(base, comp).map((c) => Object.assign({}, c, {itens: (c.itens || []).slice(0, 50)}));
    const tx = ((base.custos || {}).taxas || {})[comp];
    // Ociosidade (memória da DRE) vem das taxas congeladas do Custos, que a tela não lê.
    const ociosidade = tx ? {custoCentavos: tx.custoOciosidadeMes != null ? Math.round(Number(tx.custoOciosidadeMes) * 100) : null,
      ocupacaoPct: tx.ocupacaoPct != null ? Number(tx.ocupacaoPct) : null} : null;
    updates[`ctl/painel/${comp}`] = {checklist: ck.itens, ok: ck.ok, reconciliacao: rec, ociosidade, atualizadoEm: agora};
  });
  return {updates};
}

module.exports = {VERSAO, ehControladoria, prepararDerivacao, prepararPainel, prepararAjuste, prepararEstornoAjuste, prepararFechamento, prepararReabertura};
