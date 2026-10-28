// Financeiro no servidor (PROMPT_FINANCEIRO.md). Títulos, abatimentos e baixas
// só nascem AQUI: a tela chama callable e a regra do banco recusa escrita direta.
//
// Mesmo desenho de custos_resultado.js: cada função recebe a base já lida e
// devolve o update por CAMINHOS PLANOS -- testável sem banco
// (run_financeiro_servidor_test.js). O index.js só lê, chama e grava.
"use strict";
const F = require("./financeiro");

const VERSAO = "financeiro-servidor-v1-20261028";

function san(k) { return String(k == null ? "" : k).replace(/[.#$/[\]]/g, "_"); }
function falhar(msg, code) { throw Object.assign(new Error(msg), {code: code || "failed-precondition"}); }

// Quem opera o Financeiro: ADM, ou quem o ADM marcou com o módulo Financeiro.
function ehFinanceiro(perfil) {
  return !!perfil && (perfil.role === "admin" || !!(perfil.modulos && perfil.modulos.financeiro === true));
}

/* Derivação agendada: títulos e abatimentos novos dos fatos (append-only). */
function prepararDerivacao(base, agora) {
  const d = F.derivar(base);
  const updates = {};
  Object.entries(d.titulos).forEach(([id, t]) => { updates[`fin/titulos/${id}`] = Object.assign({}, t, {criadoEm: agora, criadoPor: "servidor"}); });
  Object.entries(d.abatimentos).forEach(([id, a]) => { updates[`fin/abatimentos/${id}`] = Object.assign({}, a, {criadoEm: agora, criadoPor: "servidor"}); });
  return {updates, titulos: Object.keys(d.titulos).length, abatimentos: Object.keys(d.abatimentos).length};
}

function situacaoDe(base, tituloId) {
  const fin = base.fin || {};
  const t = (fin.titulos || {})[tituloId];
  if (!t) return null;
  const s = F.situacao(tituloId, t, F.movimentosPorTitulo(fin)[tituloId], (fin.condicoes || {})[tituloId]);
  const b = (fin.bloqueios || {})[tituloId];
  s.bloqueio = b && b.ativo !== false ? b : null;
  return s;
}

/* Baixa de um título (pagamento ou recebimento). `chave` vem da tela (uuid) e
   torna o clique duplo inofensivo. Opcional: `extrato {conta, fitid}` concilia junto. */
function prepararBaixa(base, dados, quem, agora) {
  const d = dados || {};
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(String(d.chave || ""))) falhar("Identificador da baixa inválido.", "invalid-argument");
  const id = "BX_" + d.chave;
  const fin = base.fin || {};
  if ((fin.baixas || {})[id]) return {updates: {}, id, repetida: true};
  const v = F.validarBaixa(situacaoDe(base, d.titulo), d, fin.contas_bancarias);
  if (!v.ok) falhar(v.motivo);
  if (fechado(base, v.registro.data)) falhar(`O mês ${v.registro.data.slice(0, 7)} está fechado na Controladoria: lance a baixa com data no mês aberto.`);
  const updates = {[`fin/baixas/${id}`]: Object.assign({}, v.registro, {historico: String(d.historico || "").slice(0, 300) || null, criadoEm: agora, criadoPor: quem.nome, criadoPorUid: quem.uid, versao: VERSAO})};
  if (d.extrato && d.extrato.fitid) {
    const ck = san(d.extrato.conta) + "_" + san(d.extrato.fitid);
    if ((fin.conciliacoes || {})[ck]) falhar("Esta linha do extrato já foi conciliada.");
    updates[`fin/conciliacoes/${ck}`] = {conta: d.extrato.conta, fitid: d.extrato.fitid, baixa: id, em: agora, por: quem.nome};
  }
  return {updates, id, repetida: false};
}

function prepararEstorno(base, dados, quem, agora) {
  const d = dados || {};
  const motivo = String(d.motivo || "").trim();
  if (motivo.length < 5) falhar("Explique o motivo do estorno.", "invalid-argument");
  const fin = base.fin || {};
  const v = F.validarEstorno(fin.baixas, d.baixa);
  if (!v.ok) falhar(v.motivo);
  const data = String(d.data || agora).slice(0, 10);
  if (fechado(base, data)) falhar(`O mês ${data.slice(0, 7)} está fechado: estorne com data no mês aberto.`);
  const reg = Object.assign({}, v.registro, {data, motivo, criadoEm: agora, criadoPor: quem.nome, criadoPorUid: quem.uid, versao: VERSAO});
  delete reg.historico;
  const updates = {[`fin/baixas/${d.baixa}_estorno`]: reg};
  // A conciliação da baixa estornada é desfeita (a linha do extrato volta a ficar livre).
  Object.entries(fin.conciliacoes || {}).forEach(([k, c]) => { if (c && c.baixa === d.baixa) updates[`fin/conciliacoes/${k}`] = null; });
  return {updates};
}

/* Títulos manuais ou importados de planilha (saldo de abertura). */
function prepararTitulos(base, dados, quem, agora) {
  const d = dados || {};
  const origem = d.origem === "IMPORTACAO" ? "IMPORTACAO" : "MANUAL";
  const linhas = Array.isArray(d.titulos) ? d.titulos.slice(0, 500) : [];
  if (!linhas.length) falhar("Nenhum título para lançar.", "invalid-argument");
  const existentes = (base.fin || {}).titulos || {};
  const updates = {}, erros = [];
  let criados = 0, repetidos = 0;
  linhas.forEach((l, i) => {
    const v = F.validarTituloManual(l, origem);
    if (!v.ok) { erros.push(`Linha ${i + 1}: ${v.motivo}`); return; }
    if (fechado(base, v.titulo.emissao) && origem === "MANUAL") { erros.push(`Linha ${i + 1}: mês ${v.titulo.competencia} fechado.`); return; }
    const id = F.chaveManual(v.titulo);
    if (existentes[id] || updates[`fin/titulos/${id}`]) { repetidos++; return; }
    updates[`fin/titulos/${id}`] = Object.assign({}, v.titulo, {criadoEm: agora, criadoPor: quem.nome, criadoPorUid: quem.uid});
    criados++;
  });
  if (erros.length && !d.ignorarErros) falhar(erros.slice(0, 8).join(" "));
  return {updates, criados, repetidos, erros};
}

/* Lote de pagamento (borderô): aprovar gera uma baixa por título; recusar só marca. */
function prepararDecisaoLote(base, dados, quem, agora) {
  const d = dados || {};
  const fin = base.fin || {};
  const lote = (fin.lotes_pagamento || {})[d.lote];
  if (d.acao === "RECUSAR") {
    if (!lote || lote.status !== "AGUARDANDO") falhar("Lote não está aguardando.");
    return {updates: {[`fin/lotes_pagamento/${d.lote}/status`]: "RECUSADO", [`fin/lotes_pagamento/${d.lote}/decididoPor`]: quem.nome,
      [`fin/lotes_pagamento/${d.lote}/decididoEm`]: agora, [`fin/lotes_pagamento/${d.lote}/motivo`]: String(d.motivo || "").slice(0, 300) || null}};
  }
  const ok = F.validarAprovacaoLote(lote, quem.uid);
  if (!ok.ok) falhar(ok.motivo);
  const data = String(lote.dataPagamento || agora).slice(0, 10);
  if (fechado(base, data)) falhar(`O mês ${data.slice(0, 7)} está fechado.`);
  const updates = {};
  Object.entries(lote.titulos).forEach(([tid, valor]) => {
    const v = F.validarBaixa(situacaoDe(base, tid), {valorCentavos: Number(valor), data, conta: lote.conta}, fin.contas_bancarias);
    if (!v.ok) falhar(`Título ${tid}: ${v.motivo}`);
    updates[`fin/baixas/BX_LOTE_${san(d.lote)}_${san(tid)}`] = Object.assign({}, v.registro, {loteKey: d.lote, criadoEm: agora, criadoPor: quem.nome, criadoPorUid: quem.uid, versao: VERSAO});
  });
  updates[`fin/lotes_pagamento/${d.lote}/status`] = "APROVADO";
  updates[`fin/lotes_pagamento/${d.lote}/decididoPor`] = quem.nome;
  updates[`fin/lotes_pagamento/${d.lote}/decididoPorUid`] = quem.uid;
  updates[`fin/lotes_pagamento/${d.lote}/decididoEm`] = agora;
  return {updates, baixas: Object.keys(lote.titulos).length};
}

// Mês fechado na Controladoria não recebe movimento financeiro com data nele.
function fechado(base, dataISO) {
  const f = ((base.ctl || {}).fechamentos || {})[String(dataISO || "").slice(0, 7)];
  return !!(f && f.status === "FECHADO");
}

module.exports = {VERSAO, ehFinanceiro, prepararDerivacao, prepararBaixa, prepararEstorno, prepararTitulos, prepararDecisaoLote, situacaoDe, fechado};
