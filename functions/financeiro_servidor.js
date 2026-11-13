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
  // Título recém-derivado já conta para o vínculo das notas que esperavam o recebimento.
  const fin = Object.assign({}, base.fin || {}, {titulos: Object.assign({}, (base.fin || {}).titulos || {}, d.titulos)});
  const v = vincularNotas(Object.assign({}, base, {fin}), agora);
  Object.assign(updates, v.updates);
  return {updates, titulos: Object.keys(d.titulos).length, abatimentos: Object.keys(d.abatimentos).length, notasVinculadas: v.vinculadas};
}

function situacaoDe(base, tituloId) {
  const fin = base.fin || {};
  const t = (fin.titulos || {})[tituloId];
  if (!t) return null;
  const s = F.situacao(tituloId, t, F.movimentosPorTitulo(fin)[tituloId], (fin.condicoes || {})[tituloId], F.notasPorTitulo(fin)[tituloId]);
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
  const neg = F.caixaNegativo(fin, v.registro);
  if (neg) falhar(neg);
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
    // Nota de entrada (F5): só um título por nota, seja o do recebimento ou um manual.
    if (v.titulo.notaChave) {
      const nota = ((base.fin || {}).notas_entrada || {})[v.titulo.notaChave];
      const comTitulo = Object.values(F.notasPorTitulo(base.fin || {})).some((n) => n && n.chave === v.titulo.notaChave);
      if (!nota) { erros.push(`Linha ${i + 1}: nota de entrada não encontrada.`); return; }
      if (comTitulo || Object.values(updates).some((u) => u && u.notaChave === v.titulo.notaChave)) { erros.push(`Linha ${i + 1}: a NF ${nota.numero} já tem título.`); return; }
    }
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
  let totalLote = 0;
  Object.entries(lote.titulos).forEach(([tid, valor]) => {
    const v = F.validarBaixa(situacaoDe(base, tid), {valorCentavos: Number(valor), data, conta: lote.conta}, fin.contas_bancarias);
    if (!v.ok) falhar(`Título ${tid}: ${v.motivo}`);
    totalLote += Math.round(Number(v.registro.liquidoCentavos) || 0);
    updates[`fin/baixas/BX_LOTE_${san(d.lote)}_${san(tid)}`] = Object.assign({}, v.registro, {loteKey: d.lote, criadoEm: agora, criadoPor: quem.nome, criadoPorUid: quem.uid, versao: VERSAO});
  });
  const negLote = F.caixaNegativo(fin, {conta: lote.conta, tituloTipo: "PAGAR", liquidoCentavos: totalLote});
  if (negLote) falhar(negLote);
  updates[`fin/lotes_pagamento/${d.lote}/status`] = "APROVADO";
  updates[`fin/lotes_pagamento/${d.lote}/decididoPor`] = quem.nome;
  updates[`fin/lotes_pagamento/${d.lote}/decididoPorUid`] = quem.uid;
  updates[`fin/lotes_pagamento/${d.lote}/decididoEm`] = agora;
  return {updates, baixas: Object.keys(lote.titulos).length};
}

/* NF de entrada por XML (F5). O servidor relê cada XML (não confia na prévia da tela),
   grava a nota em fin/notas_entrada/{chave} -- a chave de 44 dígitos não deixa a mesma
   nota entrar duas vezes -- e vincula ao título do recebimento quando casa. Nenhum
   outro módulo é alterado: o XML não dá entrada no estoque. */
const MAX_XMLS = 50, MAX_XML_BYTES = 1500000;
function prepararNotasEntrada(base, dados, quem, agora) {
  const d = dados || {};
  const xmls = Array.isArray(d.xmls) ? d.xmls.slice(0, MAX_XMLS) : [];
  const fin = base.fin || {}, existentes = fin.notas_entrada || {};
  const updates = {}, novas = {}, erros = [], repetidas = [];
  xmls.forEach((x, i) => {
    const nome = String((x && x.nome) || `arquivo ${i + 1}`).slice(0, 120);
    const texto = String((x && x.texto) || "");
    if (texto.length > MAX_XML_BYTES) { erros.push(`${nome}: arquivo grande demais para um XML de NF-e.`); return; }
    const r = F.lerXmlNfe(texto);
    if (!r.ok) { erros.push(`${nome}: ${r.motivo}`); return; }
    const k = r.nota.chave;
    if (existentes[k] || novas[k]) { repetidas.push(`${nome} (NF ${r.nota.numero})`); return; }
    novas[k] = Object.assign({}, r.nota, {avisos: r.avisos, arquivo: nome, titulo: null, importadoEm: agora,
      importadoPor: quem.nome, importadoPorUid: quem.uid, versao: VERSAO});
  });
  if (xmls.length && !Object.keys(novas).length && !repetidas.length) falhar(erros.slice(0, 5).join(" ") || "Nenhum XML válido.", "invalid-argument");
  const base2 = Object.assign({}, base, {fin: Object.assign({}, fin, {notas_entrada: Object.assign({}, existentes, novas)})});
  const v = vincularNotas(base2, agora);
  // Nota nova vai inteira (com o vínculo dentro); nota antiga recebe só o caminho do vínculo.
  Object.entries(v.updates).forEach(([caminho, valor]) => {
    const k = caminho.split("/")[2];
    if (novas[k]) novas[k][caminho.split("/")[3]] = valor; else updates[caminho] = valor;
  });
  Object.entries(novas).forEach(([k, n]) => { updates[`fin/notas_entrada/${k}`] = n; });
  return {updates, importadas: Object.keys(novas).length, repetidas, erros, vinculadas: v.vinculadas};
}
// Vincula as notas ainda soltas ao título do recebimento correspondente. Um título, uma nota.
function vincularNotas(base, agora) {
  const fin = base.fin || {}, notas = fin.notas_entrada || {}, updates = {};
  const ocupados = new Set(Object.keys(F.notasPorTitulo(fin)));
  let vinculadas = 0;
  Object.entries(notas).forEach(([k, n]) => {
    if (!n || n.titulo) return;
    const c = F.casarNotaEntrada(n, base);
    if (c.tipo !== "VINCULADA" || ocupados.has(c.titulo)) return;
    ocupados.add(c.titulo);
    updates[`fin/notas_entrada/${k}/titulo`] = c.titulo;
    updates[`fin/notas_entrada/${k}/vinculadaEm`] = agora;
    vinculadas++;
  });
  return {updates, vinculadas};
}

/* Caixas e bancos (F6): tarifa, IOF, juros, rendimento e transferência. `chave` vem
   da tela (clique duplo não duplica); `extrato {conta, fitid}` concilia a linha do OFX. */
function prepararMovimento(base, dados, quem, agora) {
  const d = dados || {};
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(String(d.chave || ""))) falhar("Identificador do movimento inválido.", "invalid-argument");
  const id = "MV_" + d.chave;
  const fin = base.fin || {};
  if ((fin.movimentos || {})[id]) return {updates: {}, id, repetido: true};
  const v = F.validarMovimento(d, fin);
  if (!v.ok) falhar(v.motivo);
  if (fechado(base, v.registro.data)) falhar(`O mês ${v.registro.data.slice(0, 7)} está fechado na Controladoria: lance com data no mês aberto.`);
  const updates = {[`fin/movimentos/${id}`]: Object.assign({}, v.registro, {criadoEm: agora, criadoPor: quem.nome, criadoPorUid: quem.uid, versao: VERSAO})};
  if (d.extrato && d.extrato.fitid) {
    const ck = san(d.extrato.conta) + "_" + san(d.extrato.fitid);
    if ((fin.conciliacoes || {})[ck]) falhar("Esta linha do extrato já foi conciliada.");
    updates[`fin/conciliacoes/${ck}`] = {conta: d.extrato.conta, fitid: d.extrato.fitid, movimento: id, em: agora, por: quem.nome};
  }
  return {updates, id, repetido: false};
}
function prepararEstornoMovimento(base, dados, quem, agora) {
  const d = dados || {};
  const motivo = String(d.motivo || "").trim();
  if (motivo.length < 5) falhar("Explique o motivo do estorno.", "invalid-argument");
  const fin = base.fin || {};
  const v = F.validarEstornoMovimento(fin.movimentos, d.movimento);
  if (!v.ok) falhar(v.motivo);
  const data = String(d.data || agora).slice(0, 10);
  if (fechado(base, data)) falhar(`O mês ${data.slice(0, 7)} está fechado: estorne com data no mês aberto.`);
  const reg = Object.assign({}, v.registro, {data, motivo, criadoEm: agora, criadoPor: quem.nome, criadoPorUid: quem.uid, versao: VERSAO});
  const neg = F.caixaNegativo(fin, reg);
  if (neg) falhar(neg);
  const updates = {[`fin/movimentos/${d.movimento}_estorno`]: reg};
  Object.entries(fin.conciliacoes || {}).forEach(([k, c]) => { if (c && c.movimento === d.movimento) updates[`fin/conciliacoes/${k}`] = null; });
  return {updates};
}

/* Entrega B (12/11/2026): adiantamento, compensação, renegociação e cancelamento em lote.
   docs/superpowers/specs/2026-11-12-financeiro-entrega-b-design.md. Mesmo padrão: chave da
   tela (clique duplo não duplica), validação no motor, mês fechado recusa, caminhos planos. */
function chaveDe(d, rotulo) {
  const c = String((d || {}).chave || "");
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(c)) falhar(`Identificador ${rotulo} inválido.`, "invalid-argument");
  return c;
}
function autoria(quem, agora) { return {criadoEm: agora, criadoPor: quem.nome, criadoPorUid: quem.uid, versao: VERSAO}; }
function exigirAberto(base, data) {
  if (fechado(base, data)) falhar(`O mês ${String(data).slice(0, 7)} está fechado na Controladoria: use uma data no mês aberto.`);
}
function motivoDe(d, rotulo) {
  const m = String((d || {}).motivo || "").trim();
  if (m.length < 5) falhar(`Explique o motivo ${rotulo}.`, "invalid-argument");
  return m.slice(0, 300);
}

function prepararAdiantamento(base, dados, quem, agora) {
  const d = dados || {}, id = "AD_" + chaveDe(d, "do adiantamento"), fin = base.fin || {};
  if ((fin.adiantamentos || {})[id]) return {updates: {}, id, repetido: true};
  const v = F.validarAdiantamento(d, fin);
  if (!v.ok) falhar(v.motivo);
  exigirAberto(base, v.registro.data);
  return {updates: {[`fin/adiantamentos/${id}`]: Object.assign({}, v.registro, autoria(quem, agora))}, id, repetido: false};
}
function prepararEstornoAdiantamento(base, dados, quem, agora) {
  const d = dados || {}, motivo = motivoDe(d, "do estorno"), fin = base.fin || {};
  const v = F.validarEstornoAdiantamento(fin, d.adiantamento);
  if (!v.ok) falhar(v.motivo);
  const data = String(d.data || agora).slice(0, 10);
  exigirAberto(base, data);
  const reg = Object.assign({}, v.registro, {data, motivo}, autoria(quem, agora));
  const neg = F.caixaNegativo(fin, reg);
  if (neg) falhar(neg);
  return {updates: {[`fin/adiantamentos/${d.adiantamento}_estorno`]: reg}};
}
function prepararCompensacao(base, dados, quem, agora) {
  const d = dados || {}, id = "CP_" + chaveDe(d, "da compensação"), fin = base.fin || {};
  if ((fin.baixas || {})[id]) return {updates: {}, id, repetido: true};
  const v = F.validarCompensacao(situacaoDe(base, d.titulo), F.saldosAdiantamentos(fin)[d.adiantamento], d);
  if (!v.ok) falhar(v.motivo);
  exigirAberto(base, v.registro.data);
  const reg = Object.assign({}, v.registro, {historico: String(d.historico || "").slice(0, 300) || null}, autoria(quem, agora));
  return {updates: {[`fin/baixas/${id}`]: reg}, id, repetido: false};
}
function prepararRenegociacao(base, dados, quem, agora) {
  const d = dados || {}, chave = chaveDe(d, "da renegociação"), id = "RN_" + chave, fin = base.fin || {};
  if ((fin.renegociacoes || {})[id]) return {updates: {}, id, repetido: true};
  const m = F.montarRenegociacao(fin, d, chave);
  if (!m.ok) falhar(m.motivo);
  exigirAberto(base, m.registro.data);
  const a = autoria(quem, agora);
  const updates = {[`fin/renegociacoes/${id}`]: Object.assign({}, m.registro, a), [`fin/titulos/${m.registro.novoTitulo}`]: Object.assign({}, m.titulo, a)};
  Object.entries(m.abatimentos).forEach(([k, x]) => { updates[`fin/abatimentos/${k}`] = Object.assign({}, x, a); });
  return {updates, id, novoTitulo: m.registro.novoTitulo, repetido: false};
}
function prepararDesfazerRenegociacao(base, dados, quem, agora) {
  const d = dados || {}, motivo = motivoDe(d, "para desfazer"), data = String(d.data || agora).slice(0, 10);
  const m = F.montarDesfazerRenegociacao(base.fin || {}, d.renegociacao, {data, motivo});
  if (!m.ok) falhar(m.motivo);
  exigirAberto(base, data);
  const a = autoria(quem, agora), p = `fin/renegociacoes/${d.renegociacao}`;
  const updates = {[`${p}/status`]: m.status, [`${p}/desfeitaEm`]: agora, [`${p}/desfeitaPor`]: quem.nome, [`${p}/desfeitaPorUid`]: quem.uid, [`${p}/motivoDesfazer`]: m.motivoDesfazer};
  Object.entries(m.abatimentos).forEach(([k, x]) => { updates[`fin/abatimentos/${k}`] = Object.assign({}, x, a); });
  return {updates};
}
function prepararCancelamento(base, dados, quem, agora) {
  const d = dados || {}, chave = chaveDe(d, "do cancelamento"), id = "CN_" + chave, fin = base.fin || {};
  if ((fin.cancelamentos || {})[id]) return {updates: {}, id, repetido: true};
  const m = F.montarCancelamento(fin, d, chave);
  if (!m.ok) falhar(m.motivo);
  exigirAberto(base, m.registro.data);
  const a = autoria(quem, agora);
  const updates = {[`fin/cancelamentos/${id}`]: Object.assign({}, m.registro, a)};
  Object.entries(m.abatimentos).forEach(([k, x]) => { updates[`fin/abatimentos/${k}`] = Object.assign({}, x, a); });
  return {updates, id, titulos: Object.keys(m.registro.titulos).length, repetido: false};
}
function prepararDesfazerCancelamento(base, dados, quem, agora) {
  const d = dados || {}, motivo = motivoDe(d, "para desfazer"), data = String(d.data || agora).slice(0, 10);
  const m = F.montarDesfazerCancelamento(base.fin || {}, d.cancelamento, {data, motivo});
  if (!m.ok) falhar(m.motivo);
  exigirAberto(base, data);
  const a = autoria(quem, agora), p = `fin/cancelamentos/${d.cancelamento}`;
  const updates = {[`${p}/status`]: m.status, [`${p}/desfeitoEm`]: agora, [`${p}/desfeitoPor`]: quem.nome, [`${p}/desfeitoPorUid`]: quem.uid, [`${p}/motivoDesfazer`]: m.motivoDesfazer};
  Object.entries(m.abatimentos).forEach(([k, x]) => { updates[`fin/abatimentos/${k}`] = Object.assign({}, x, a); });
  return {updates};
}

// Mês fechado na Controladoria não recebe movimento financeiro com data nele.
function fechado(base, dataISO) {
  const f = ((base.ctl || {}).fechamentos || {})[String(dataISO || "").slice(0, 7)];
  return !!(f && f.status === "FECHADO");
}

module.exports = {VERSAO, ehFinanceiro, prepararDerivacao, prepararBaixa, prepararEstorno, prepararTitulos, prepararDecisaoLote, situacaoDe, fechado,
  prepararNotasEntrada, vincularNotas, prepararMovimento, prepararEstornoMovimento,
  prepararAdiantamento, prepararEstornoAdiantamento, prepararCompensacao, prepararRenegociacao, prepararDesfazerRenegociacao,
  prepararCancelamento, prepararDesfazerCancelamento};
