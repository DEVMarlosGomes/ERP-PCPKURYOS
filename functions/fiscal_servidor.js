// Fiscal no servidor (PROMPT_FISCAL.md). Documentos, XML, apuração, arquivos e fechamento
// só nascem AQUI: a regra do banco recusa escrita da tela em fis/ e fis_xml/.
//
// Mesmo desenho do Financeiro e da Controladoria: cada função recebe a base já lida e
// devolve o update por CAMINHOS PLANOS -- testável sem banco (run_fiscal_servidor_test.js).
// O index.js só lê, chama e grava. Compressão e hash chegam por `util` (zlib/crypto do Node).
"use strict";
const Fis = require("./fiscal");
const Ger = require("./controladoria-gerencial");

const VERSAO = "fiscal-servidor-v1-20261118";
const MAX_ARQUIVOS = 60, MAX_BYTES = 2000000;

function falhar(msg, code) { throw Object.assign(new Error(msg), {code: code || "failed-precondition"}); }
function san(k) { return String(k == null ? "" : k).replace(/[.#$/[\]]/g, "_"); }
function carimbo(agora) { return agora.replace(/[^0-9]/g, "").slice(0, 17); }
function fis(base) { return base.fis || {}; }
function estab(base) { return Object.assign({cnpj: Fis.CNPJ_KURYOS}, fis(base).estabelecimento || {}); }

// Quem opera o Fiscal: ADM ou módulo Fiscal. A importação de XML também é do Financeiro
// (Q8, 17/11/2026: um upload só, no Fiscal, e o Financeiro usa a mesma nota).
function ehFiscal(perfil) { return !!perfil && (perfil.role === "admin" || !!(perfil.modulos && perfil.modulos.fiscal === true)); }
function podeImportar(perfil) { return ehFiscal(perfil) || (!!perfil && !!(perfil.modulos && perfil.modulos.financeiro === true)); }

function mesFechado(base, mes) { const f = (fis(base).fechamentos || {})[mes]; return !!(f && f.status === "FECHADO"); }
function checarPeriodo(base, data, oQue) {
  const mes = String(data || "").slice(0, 7);
  if (mesFechado(base, mes)) falhar(`${oQue}: o mês fiscal ${mes} está fechado. Reabra (ADM) para mexer nele.`);
  const lib = Ger.periodoLiberado((base.ctl || {}).bloqueio_periodo, "FISCAL", String(data || "").slice(0, 10));
  if (!lib.ok) falhar(`${oQue}: ${lib.motivo}`);
}

/* Importação de XML (NF-e, CT-e, eventos, inutilização). O servidor relê cada arquivo
   (não confia na prévia da tela). Idempotente pela chave + hash: o mesmo XML de novo é
   "repetido"; outro conteúdo com a mesma chave é recusado (XML é imutável), salvo quando
   o anterior não tinha protocolo e o novo tem. Devolve também os XMLs de NF-e de entrada
   de terceiros, que o Financeiro grava como nota resumida (fin/notas_entrada). */
function prepararImportacao(base, dados, quem, agora, util) {
  const d = dados || {};
  const arquivos = Array.isArray(d.arquivos) ? d.arquivos.slice(0, MAX_ARQUIVOS) : [];
  if (!arquivos.length) falhar("Nenhum arquivo.", "invalid-argument");
  const est = estab(base), docs = fis(base).documentos || {}, pend = fis(base).eventos_pendentes || {};
  // Caminho pai e filho no MESMO update o RTDB recusa: o que nasce neste lote (documento ou
  // evento pendente) muda em memória e é gravado inteiro no fim.
  const updates = {}, novos = {}, pendLote = {}, resultados = [], xmlsEntrada = [];
  function situacaoComEventos(doc, eventos) {
    let s = doc.situacao;
    Object.values(eventos || {}).forEach((e) => { if (e && e.tpEvento === "110111" && e.registrado) s = "02"; });
    return s;
  }
  arquivos.forEach((a, i) => {
    const nome = String((a && a.nome) || `arquivo ${i + 1}`).slice(0, 120);
    const texto = String((a && a.texto) || "");
    const r0 = {arquivo: nome};
    try {
      if (!texto.trim()) falhar("arquivo vazio.");
      if (texto.length > MAX_BYTES) falhar("arquivo grande demais para um XML fiscal.");
      const r = Fis.lerXml(texto);
      if (!r.ok) falhar(r.motivo);
      const hash = util.sha256(texto);
      if (r.tipo === "EVENTO") {
        const ev = r.evento, k = ev.chave, kEv = san(ev.tpEvento + "_" + ev.nSeq);
        const doc = novos[k] || docs[k];
        const reg = Object.assign({}, ev, {importadoEm: agora, importadoPor: quem.nome, hashXml: hash});
        if (!doc) {
          pendLote[k] = Object.assign(pendLote[k] || {}, {[kEv]: reg});
          updates[`fis_xml/EV_${k}_${kEv}`] = {gz: util.gzip(texto), bytes: texto.length, sha256: hash, tipo: "EVENTO"};
          resultados.push(Object.assign(r0, {ok: true, tipo: "EVENTO", chave: k, pendente: true, texto: `Evento ${ev.tpEvento} guardado: a nota ainda não foi importada.`}));
          return;
        }
        if (((doc.eventos || {})[kEv] || {}).hashXml === hash) { resultados.push(Object.assign(r0, {ok: true, repetido: true, tipo: "EVENTO", chave: k})); return; }
        checarPeriodo(base, Fis.dataEscrituracao(doc), "Evento");
        updates[`fis_xml/EV_${k}_${kEv}`] = {gz: util.gzip(texto), bytes: texto.length, sha256: hash, tipo: "EVENTO"};
        const cancela = ev.tpEvento === "110111" && ev.registrado && doc.situacao !== "02";
        if (novos[k]) {
          novos[k].eventos = Object.assign({}, novos[k].eventos || {}, {[kEv]: reg});
          if (cancela) { novos[k].situacao = "02"; novos[k].canceladoEm = ev.dhEvento || agora; }
        } else {
          updates[`fis/documentos/${k}/eventos/${kEv}`] = reg;
          if (cancela) { updates[`fis/documentos/${k}/situacao`] = "02"; updates[`fis/documentos/${k}/canceladoEm`] = ev.dhEvento || agora; }
        }
        resultados.push(Object.assign(r0, {ok: true, tipo: "EVENTO", chave: k, texto: ev.tpEvento === "110111" ? "Cancelamento aplicado." : "Evento " + ev.descricao + " guardado."}));
        return;
      }
      if (r.tipo === "INUT") {
        const u = r.inut;
        if (Fis.normCnpj(u.cnpj) !== Fis.normCnpj(est.cnpj)) falhar("inutilização de outro CNPJ.");
        if (docs[u.chave] || novos[u.chave]) { resultados.push(Object.assign(r0, {ok: true, repetido: true, tipo: "INUT", chave: u.chave})); return; }
        checarPeriodo(base, u.data, "Inutilização");
        const reg = Object.assign({tipo: "INUT"}, u, {importadoEm: agora, importadoPor: quem.nome, importadoPorUid: quem.uid, hashXml: hash, arquivo: nome, versaoMotor: Fis.VERSAO});
        novos[u.chave] = reg;
        updates[`fis/documentos/${u.chave}`] = reg;
        updates[`fis_xml/${u.chave}`] = {gz: util.gzip(texto), bytes: texto.length, sha256: hash, tipo: "INUT"};
        resultados.push(Object.assign(r0, {ok: true, tipo: "INUT", chave: u.chave, texto: `Inutilização ${u.ini}–${u.fim} série ${u.serie}.`}));
        return;
      }
      const rel = Fis.relativo(r.doc, est.cnpj);
      if (!rel.ok) falhar(rel.motivo);
      const k = rel.chave, ant = novos[k] || docs[k];
      if (ant) {
        if (ant.hashXml === hash) { resultados.push(Object.assign(r0, {ok: true, repetido: true, tipo: r.tipo, chave: k, numero: rel.numero})); return; }
        if (!(ant.situacao === "SEM_PROTOCOLO" && rel.situacao && rel.situacao !== "SEM_PROTOCOLO")) falhar(`a chave ${k} já foi importada com outro conteúdo: XML é imutável (correção é evento ou nota nova).`);
      }
      checarPeriodo(base, Fis.dataEscrituracao(rel), "Documento");
      const doc = Object.assign({}, rel);
      delete doc.ok; delete doc.motivo;
      const eventos = Object.assign({}, (ant && ant.eventos) || {}, pend[k] || {}, pendLote[k] || {});
      delete pendLote[k];
      doc.eventos = eventos;
      doc.situacao = situacaoComEventos(doc, eventos);
      if (doc.situacao === "02") { const c = Object.values(eventos).find((e) => e && e.tpEvento === "110111"); doc.canceladoEm = (c && c.dhEvento) || agora; }
      Object.assign(doc, {avisos: r.avisos || [], arquivo: nome, origem: d.origem === "FINANCEIRO" ? "FIN_F5" : "UPLOAD", hashXml: hash,
        importadoEm: agora, importadoPor: quem.nome, importadoPorUid: quem.uid, versaoMotor: Fis.VERSAO});
      novos[k] = doc;
      updates[`fis/documentos/${k}`] = doc;
      updates[`fis_xml/${k}`] = {gz: util.gzip(texto), bytes: texto.length, sha256: hash, tipo: r.tipo};
      if (pend[k]) updates[`fis/eventos_pendentes/${k}`] = null;
      if (r.tipo === "NFE" && doc.modelo === "55" && doc.indEmit === "1" && doc.indOper === "0") xmlsEntrada.push({nome, texto});
      resultados.push(Object.assign(r0, {ok: true, tipo: r.tipo, chave: k, numero: doc.numero, participante: (doc.participante || {}).nome || "",
        indOper: doc.indOper, indEmit: doc.indEmit, situacao: doc.situacao, avisos: doc.avisos}));
    } catch (e) {
      if (!e || !e.code) throw e;
      resultados.push(Object.assign(r0, {ok: false, motivo: e.message}));
    }
  });
  Object.keys(pendLote).forEach((k) => Object.keys(pendLote[k]).forEach((e) => { updates[`fis/eventos_pendentes/${k}/${e}`] = pendLote[k][e]; }));
  if (!resultados.some((x) => x.ok)) falhar(resultados.map((x) => `${x.arquivo}: ${x.motivo}`).slice(0, 5).join(" "), "invalid-argument");
  return {updates, resultados, xmlsEntrada};
}

/* Cadastros do Fiscal: estabelecimento/contabilista, regras de entrada, itens (0200/0220),
   de-para do fornecedor e a data de entrada de uma nota. Tudo pelo servidor, com histórico. */
function prepararCadastro(base, dados, quem, agora) {
  const d = dados || {}, k = carimbo(agora), updates = {};
  if (d.tipo === "ESTABELECIMENTO") {
    const v = Fis.validarEstabelecimento(d.dados);
    if (!v.ok) falhar(v.motivo, "invalid-argument");
    if ((fis(base).estabelecimento || {}).regime && v.registro.regime !== fis(base).estabelecimento.regime && quem.role !== "admin") falhar("Só o ADM muda o regime tributário.", "permission-denied");
    Object.keys(v.registro).forEach((c) => { if (c !== "contabilista") updates[`fis/estabelecimento/${c}`] = v.registro[c]; });
    Object.keys(v.registro.contabilista).forEach((c) => { updates[`fis/estabelecimento/contabilista/${c}`] = v.registro.contabilista[c]; });
    updates["fis/estabelecimento/alteradoEm"] = agora; updates["fis/estabelecimento/alteradoPor"] = quem.nome;
    updates[`fis/historico/estabelecimento/${k}`] = {antes: fis(base).estabelecimento || null, por: quem.nome, em: agora};
    return {updates};
  }
  if (d.tipo === "REGRA") {
    const v = Fis.validarRegra(d.dados);
    if (!v.ok) falhar(v.motivo, "invalid-argument");
    const ant = (fis(base).regras_entrada || {})[v.id];
    updates[`fis/regras_entrada/${v.id}`] = Object.assign({}, v.registro, {alteradoEm: agora, alteradoPor: quem.nome});
    if (ant) updates[`fis/historico/regras_entrada/${v.id}/${k}`] = Object.assign({}, ant, {substituidaEm: agora, substituidaPor: quem.nome});
    return {updates, id: v.id};
  }
  if (d.tipo === "REGRAS_SUGERIDAS") {
    // Aplicação em lote: para cada CFOP de fornecedor sem regra no mês, a sugestão automática.
    const mes = String(d.mes || "");
    const docs = fis(base).documentos || {}, regras = fis(base).regras_entrada || {}, est = estab(base), feitas = [];
    Object.values(docs).forEach((doc) => {
      if (!doc || doc.indEmit !== "1" || doc.indOper !== "0" || (mes && Fis.mesDoDocumento(doc) !== mes)) return;
      const cfops = doc.tipo === "CTE" ? [{cfop: doc.cfop, tipoItem: "09"}] : (doc.itens || []).map((it) => ({cfop: it.cfop, tipoItem: (d.tipoItemPorCfop || {})[it.cfop]}));
      cfops.forEach((c) => {
        if (!c.cfop || Fis.regraDoItem(regras, c.cfop, {}) || feitas.indexOf(c.cfop) >= 0) return;
        const s = Fis.sugerirRegra(c.cfop, c.tipoItem, est.regime);
        if (!s) return;
        const v = Fis.validarRegra(s);
        if (!v.ok) return;
        regras[v.id] = v.registro; feitas.push(c.cfop);
        updates[`fis/regras_entrada/${v.id}`] = Object.assign({}, v.registro, {sugerida: true, alteradoEm: agora, alteradoPor: quem.nome});
      });
    });
    return {updates, criadas: feitas};
  }
  if (d.tipo === "REGRA_ATIVO") {
    const id = san(d.id), r = (fis(base).regras_entrada || {})[id];
    if (!r) falhar("Regra não existe.", "not-found");
    updates[`fis/regras_entrada/${id}/ativo`] = !!d.ativo;
    updates[`fis/regras_entrada/${id}/alteradoEm`] = agora; updates[`fis/regras_entrada/${id}/alteradoPor`] = quem.nome;
    updates[`fis/historico/regras_entrada/${id}/${k}`] = Object.assign({}, r, {substituidaEm: agora, substituidaPor: quem.nome});
    return {updates};
  }
  if (d.tipo === "ITEM") {
    const v = Fis.validarItem(d.dados);
    if (!v.ok) falhar(v.motivo, "invalid-argument");
    const ant = (fis(base).itens || {})[v.id];
    updates[`fis/itens/${v.id}`] = Object.assign({}, v.registro, {alteradoEm: agora, alteradoPor: quem.nome});
    if (ant) updates[`fis/historico/itens/${v.id}/${k}`] = ant;
    return {updates, id: v.id};
  }
  if (d.tipo === "DEPARA") {
    const v = Fis.validarDePara(d.dados);
    if (!v.ok) falhar(v.motivo, "invalid-argument");
    if (!(fis(base).itens || {})[san(v.registro.item)]) falhar("O item interno " + v.registro.item + " não está em Itens fiscais: cadastre antes.", "invalid-argument");
    updates[`fis/de_para_itens/${v.caminho}`] = Object.assign({}, v.registro, {alteradoEm: agora, alteradoPor: quem.nome});
    return {updates};
  }
  if (d.tipo === "DATA_ENTRADA") {
    const k2 = san(d.chave), doc = (fis(base).documentos || {})[k2];
    if (!doc) falhar("Documento não existe.", "not-found");
    if (!(doc.indEmit === "1" && doc.indOper === "0")) falhar("Só nota de entrada de terceiro tem data de entrada.", "invalid-argument");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.data || "")) || d.data < doc.emissao) falhar("Data de entrada inválida (não pode ser antes da emissão).", "invalid-argument");
    checarPeriodo(base, Fis.dataEscrituracao(doc), "Data de entrada");
    checarPeriodo(base, d.data, "Data de entrada");
    updates[`fis/documentos/${k2}/dataEntradaInformada`] = d.data;
    updates[`fis/documentos/${k2}/dataEntradaPor`] = quem.nome;
    return {updates};
  }
  falhar("Tipo de cadastro desconhecido.", "invalid-argument");
}

function mesAnterior(mes) { let a = +mes.slice(0, 4), m = +mes.slice(5, 7) - 1; if (!m) { m = 12; a--; } return a + "-" + String(m).padStart(2, "0"); }
function ctxBase(base) {
  const f = fis(base);
  return {estab: estab(base), docs: f.documentos || {}, regras: f.regras_entrada || {}, itens: f.itens || {}, dePara: f.de_para_itens || {}};
}
// Saldo credor anterior: o transportado da apuração do mês anterior; no primeiro mês, o informado.
function saldosAnteriores(base, mes) {
  const ap = fis(base).apuracao || {}, ant = ap[mesAnterior(mes)], atual = ap[mes] || {};
  if (ant && ant.e110) return {saldoCredorTransportar: ant.e110.VL_SLD_CREDOR_TRANSPORTAR || 0, saldoCredorIpi: (ant.e520 || {}).VL_SC_IPI || 0, fonte: "APURACAO_ANTERIOR"};
  return {saldoCredorTransportar: Math.round(Number(atual.saldoCredorAnteriorInformado) || 0), saldoCredorIpi: Math.round(Number(atual.saldoCredorIpiInformado) || 0), fonte: "INFORMADO"};
}

/* Apuração do mês: ajustes E111 informados (código da tabela 5.1.1 de SP) e, no primeiro
   mês, o saldo credor anterior. O cálculo é refeito a cada geração; aqui se guarda o retrato. */
function prepararApuracao(base, dados, quem, agora) {
  const d = dados || {}, mes = String(d.mes || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) falhar("Mês inválido.", "invalid-argument");
  checarPeriodo(base, mes + "-01", "Apuração");
  const ajustes = (Array.isArray(d.ajustes) ? d.ajustes : []).slice(0, 50).map((a) => ({codigo: String(a.codigo || "").toUpperCase().trim(), descricao: String(a.descricao || "").slice(0, 200), valorCentavos: Math.round(Number(a.valorCentavos) || 0)}));
  const bad = ajustes.find((a) => !/^[A-Z]{2}\d{6}$/.test(a.codigo) || !(a.valorCentavos > 0));
  if (bad) falhar("Ajuste inválido: código de 8 posições (ex.: SP000207) e valor maior que zero.", "invalid-argument");
  const c = ctxBase(base);
  const updates = {};
  if (d.saldoCredorAnteriorInformado != null) updates[`fis/apuracao/${mes}/saldoCredorAnteriorInformado`] = Math.max(0, Math.round(Number(d.saldoCredorAnteriorInformado) || 0));
  if (d.saldoCredorIpiInformado != null) updates[`fis/apuracao/${mes}/saldoCredorIpiInformado`] = Math.max(0, Math.round(Number(d.saldoCredorIpiInformado) || 0));
  const base2 = JSON.parse(JSON.stringify(base)); base2.fis = base2.fis || {}; base2.fis.apuracao = base2.fis.apuracao || {};
  base2.fis.apuracao[mes] = Object.assign({}, base2.fis.apuracao[mes] || {}, {saldoCredorAnteriorInformado: updates[`fis/apuracao/${mes}/saldoCredorAnteriorInformado`], saldoCredorIpiInformado: updates[`fis/apuracao/${mes}/saldoCredorIpiInformado`]});
  const sa = saldosAnteriores(base2, mes);
  const lv = Fis.livro(c.docs, mes, c);
  const ap = Fis.apurarIcms(lv, {ajustes, saldoCredorAnterior: sa.saldoCredorTransportar});
  if (!ap.ok) falhar(ap.inconsistencias.map((i) => i.descricao).join(" "), "invalid-argument");
  const api = Fis.apurarIpi(lv, {saldoCredorAnterior: sa.saldoCredorIpi});
  Object.assign(updates, {[`fis/apuracao/${mes}/ajustes`]: ajustes, [`fis/apuracao/${mes}/e110`]: ap.e110, [`fis/apuracao/${mes}/e520`]: api.e520,
    [`fis/apuracao/${mes}/fonteSaldoAnterior`]: sa.fonte, [`fis/apuracao/${mes}/calculadoEm`]: agora, [`fis/apuracao/${mes}/calculadoPor`]: quem.nome,
    [`fis/apuracao/${mes}/versaoMotor`]: Fis.VERSAO});
  return {updates, e110: ap.e110, e520: api.e520};
}

function inventarioDoMes(base, mes, gerar) {
  const invs = fis(base).inventarios || {};
  // Fevereiro leva o inventário de 31/12 do ano anterior; com "gerar inventário" marcado, o mais recente até o fim do mês.
  if (mes.slice(5, 7) === "02") { const k = (+mes.slice(0, 4) - 1) + "-12-31"; if (invs[k]) return invs[k]; }
  if (!gerar && mes.slice(5, 7) !== "02") return null;
  const fim = mes + "-31", ks = Object.keys(invs).filter((k) => k <= fim).sort();
  return ks.length ? invs[ks[ks.length - 1]] : null;
}

/* EFD ICMS/IPI. Mês fechado: devolve o arquivo guardado (não regera). Retificador (codFin 1)
   exige o original transmitido. Com inconsistência impeditiva nada é gravado. */
function prepararEfd(base, dados, quem, agora, util) {
  const d = dados || {}, mes = String(d.mes || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) falhar("Mês inválido.", "invalid-argument");
  const arqs = (fis(base).arquivos || {})[mes] || {};
  const efds = Object.keys(arqs).filter((k) => arqs[k] && arqs[k].tipo === "EFD").sort();
  if (mesFechado(base, mes)) {
    const f = fis(base).fechamentos[mes];
    return {ok: true, jaFechado: true, arquivo: f.arquivo, meta: arqs[f.arquivo] || null, updates: {}};
  }
  const codFin = d.codFin === 1 || d.codFin === "1" ? 1 : 0;
  const transmitido = efds.filter((k) => arqs[k].transmitidoEm);
  if (codFin === 1 && !transmitido.length) falhar("Arquivo substituto (retificador) só depois de registrar a transmissão do original.");
  if (codFin === 0 && transmitido.length) falhar("O original de " + mes + " já foi transmitido: gere o arquivo substituto (retificador).");
  const c = ctxBase(base), ap = (fis(base).apuracao || {})[mes] || {};
  const r = Fis.gerarEfd({estab: c.estab, docs: c.docs, mes, regras: c.regras, itens: c.itens, dePara: c.dePara, ajustes: ap.ajustes || [],
    apuracaoAnterior: saldosAnteriores(base, mes), inventario: inventarioDoMes(base, mes, !!d.gerarInventario), codFin,
    opcoes: {gerarInventario: !!d.gerarInventario, c170Propria: !!d.c170Propria},
    cruzamento: Fis.cruzamentos({docs: c.docs, agendamentos_expedicao: base.agendamentos_expedicao, notas_entrada: (base.fin || {}).notas_entrada,
      pedidos_compra: base.pedidos_compra, fornecedores: base.fornecedores}, mes)});
  if (!r.ok) return {ok: false, inconsistencias: r.inconsistencias, updates: {}};
  const id = "EFD_" + mes.replace("-", "") + "_" + carimbo(agora);
  const meta = {tipo: "EFD", codFin, versaoLeiaute: r.versaoLeiaute, geradoEm: agora, geradoPor: quem.nome, geradoPorUid: quem.uid, hash: util.sha256(r.texto),
    qtdLinhas: r.qtdLinhas, totaisPorRegistro: r.totaisPorRegistro, resumo: r.resumo, e110: r.apuracao.e110, e520: r.apuracaoIpi.e520,
    opcoes: {gerarInventario: !!d.gerarInventario, c170Propria: !!d.c170Propria}, avisos: r.inconsistencias.length, versaoMotor: Fis.VERSAO};
  return {ok: true, id, texto: r.texto, inconsistencias: r.inconsistencias, updates: {[`fis/arquivos/${mes}/${id}`]: meta, [`fis_arquivos/${id}`]: {gz: util.gzip(r.texto), tipo: "EFD", mes}}};
}

function prepararSintegra(base, dados, quem, agora, util) {
  const d = dados || {}, mes = String(d.mes || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) falhar("Mês inválido.", "invalid-argument");
  const fin = {"1": 1, "2": 2, "3": 3, "5": 5}[String(d.finalidade || 1)] || 1;
  const c = ctxBase(base);
  let inv = null;
  if (d.gerarInventario) { const invs = fis(base).inventarios || {}; inv = invs[String(d.dataSaldo || "")] || null; }
  const r = Fis.gerarSintegra({estab: c.estab, docs: c.docs, mes, regras: c.regras, itens: c.itens, dePara: c.dePara, finalidade: fin,
    inventario: inv, opcoes: {gerarInventario: !!d.gerarInventario}});
  if (!r.ok) return {ok: false, inconsistencias: r.inconsistencias, updates: {}};
  const id = "SINTEGRA_" + mes.replace("-", "") + "_" + carimbo(agora);
  return {ok: true, id, texto: r.texto, inconsistencias: r.inconsistencias, updates: {
    [`fis/arquivos/${mes}/${id}`]: {tipo: "SINTEGRA", finalidade: fin, geradoEm: agora, geradoPor: quem.nome, hash: util.sha256(r.texto), qtdLinhas: r.qtdLinhas, totaisPorRegistro: r.totaisPorRegistro, versaoMotor: Fis.VERSAO},
    [`fis_arquivos/${id}`]: {gz: util.gzip(r.texto), tipo: "SINTEGRA", mes}}};
}

/* Inventário: retrato do estoque numa data (com as inconsistências para a tela mostrar). */
function prepararInventario(base, dados, quem, agora) {
  const d = dados || {}, data = String(d.data || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) falhar("Data inválida.", "invalid-argument");
  if (mesFechado(base, data.slice(0, 7))) falhar("Mês fiscal fechado.");
  const c = ctxBase(base);
  const inv = Fis.montarInventario({data, estoque: base.estoque, materiais: base.materiais, precos: base.custos_precos, clientes: base.clientes,
    docs: c.docs, dePara: c.dePara, itens: c.itens, estab: c.estab});
  if (!inv.itens) falhar(inv.inconsistencias.map((i) => i.descricao).join(" "), "invalid-argument");
  const reg = Object.assign({}, inv, {geradoEm: agora, geradoPor: quem.nome});
  delete reg.ok;
  return {updates: {[`fis/inventarios/${data}`]: reg}, ok: inv.ok, inconsistencias: inv.inconsistencias, total: inv.totalCentavos, itens: inv.itens.length};
}

/* Fechamento do mês fiscal: exige um EFD gerado do mês; guarda qual é o arquivo e a apuração. */
function prepararFechamento(base, dados, quem, agora) {
  const mes = String((dados || {}).mes || "");
  if (mesFechado(base, mes)) falhar("O mês já está fechado.");
  const arqs = (fis(base).arquivos || {})[mes] || {};
  const efds = Object.keys(arqs).filter((k) => arqs[k] && arqs[k].tipo === "EFD").sort();
  if (!efds.length) falhar("Gere o SPED Fiscal do mês antes de fechar: o fechamento guarda o arquivo.");
  const id = efds[efds.length - 1];
  return {updates: {[`fis/fechamentos/${mes}`]: {status: "FECHADO", arquivo: id, e110: arqs[id].e110 || null, fechadoEm: agora, fechadoPor: quem.nome, fechadoPorUid: quem.uid}}};
}
function prepararReabertura(base, dados, quem, agora) {
  const d = dados || {}, mes = String(d.mes || ""), j = String(d.justificativa || "").trim();
  if (quem.role !== "admin") falhar("Só o ADM reabre mês fiscal.", "permission-denied");
  if (!mesFechado(base, mes)) falhar("O mês não está fechado.");
  if (j.length < 10) falhar("Justifique a reabertura (mínimo 10 caracteres).", "invalid-argument");
  const f = fis(base).fechamentos[mes];
  return {updates: {[`fis/fechamentos/${mes}/status`]: "REABERTO", [`fis/fechamentos/${mes}/reabertoEm`]: agora, [`fis/fechamentos/${mes}/reabertoPor`]: quem.nome,
    [`fis/fechamentos/${mes}/justificativa`]: j, [`fis/historico/fechamentos/${mes}/${carimbo(agora)}`]: f}};
}
/* Transmissão: quem transmite é o contador, no PVA. Aqui só se registra o recibo; depois
   disso o arquivo não se sobrescreve (o próximo do mês é o substituto). */
function prepararTransmissao(base, dados, quem, agora) {
  const d = dados || {}, mes = String(d.mes || ""), id = san(d.arquivo);
  const a = ((fis(base).arquivos || {})[mes] || {})[id];
  if (!a) falhar("Arquivo não encontrado.", "not-found");
  if (a.transmitidoEm) falhar("A transmissão deste arquivo já foi registrada.");
  const rec = String(d.recibo || "").trim();
  if (rec.length < 6) falhar("Informe o número do recibo de entrega.", "invalid-argument");
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(d.data || "")) ? d.data : agora.slice(0, 10);
  return {updates: {[`fis/arquivos/${mes}/${id}/transmitidoEm`]: data, [`fis/arquivos/${mes}/${id}/recibo`]: rec.slice(0, 60), [`fis/arquivos/${mes}/${id}/transmissaoRegistradaPor`]: quem.nome}};
}

module.exports = {VERSAO, ehFiscal, podeImportar, mesFechado, prepararImportacao, prepararCadastro, prepararApuracao, prepararEfd, prepararSintegra,
  prepararInventario, prepararFechamento, prepararReabertura, prepararTransmissao, saldosAnteriores, inventarioDoMes, mesAnterior};
