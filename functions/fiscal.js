/* Fiscal — funções PURAS (PROMPT_FISCAL.md). Cópia byte a byte em functions/fiscal.js.
 *
 * O documento fiscal (XML autorizado) é a fonte; o livro é DERIVADO dos documentos
 * e das regras de entrada. Nada aqui grava: o servidor (functions/fiscal_servidor.js)
 * recebe os `updates` prontos. Centavos inteiros; valor ausente nunca vira zero
 * (vira inconsistência); CNPJ alfanumérico aceito em tudo (normCnpj).
 *
 *   Leitura ........... lerXml (NF-e 4.00, CT-e 4.00, eventos, inutilização)
 *   Escrituração ...... sugerirRegra, regraDoItem, escriturar
 *   Livro / apuração .. livro, apurarIcms, apurarIpi, receitaPorCfop, valorCobrado
 *   Arquivos .......... gerarEfd (EFD ICMS/IPI), gerarSintegra (Conv. 57/95), livroCsv
 *   Inventário ........ montarInventario (Bloco H / registro 74, com material de terceiro)
 *   Conferências ...... conferenciaTerceiros, cruzamentos (Faturamento, Financeiro, Compras)
 *
 * Critérios que são DECISÃO (conferir com o contador e no PVA) estão marcados "Critério:".
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fiscal = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var VERSAO = 'fiscal-v1-20261118';
  // Versão do leiaute da EFD por ano do período (tabela, não espalhar pelo código).
  // 2026: leiaute 020 (NT 2025.001); 2027: 021 (NT 2026.001). Conferir no Guia vigente.
  var LEIAUTE_EFD = { 2024: '018', 2025: '019', 2026: '020', 2027: '021' };
  var CNPJ_KURYOS = '00767554000119';

  /* ── 0. Utilitários ───────────────────────────────────────────────────── */
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function dataOk(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  function compOk(c) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(c || '')); }
  function ultimoDia(mes) { return mes + '-' + String(new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate()); }
  function somarMes(c, k) { var a = +c.slice(0, 4), m = +c.slice(5, 7) + k; while (m < 1) { m += 12; a--; } while (m > 12) { m -= 12; a++; } return a + '-' + (m < 10 ? '0' : '') + m; }
  function soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  // As quatro funções abaixo são as mesmas do Financeiro (B0, shared/financeiro.js).
  function normCnpj(v) {
    var s = String(v == null ? '' : v).toUpperCase().replace(/[.\-\/\s]/g, '');
    return /^[0-9A-Z]{12}\d{2}$/.test(s) && /[A-Z]/.test(s) ? s : soDigitos(v);
  }
  function dvMod11(s, pesos) {
    var t = 0;
    for (var i = 0; i < s.length; i++) t += (s.charCodeAt(i) - 48) * pesos[i];
    var r = t % 11;
    return r < 2 ? 0 : 11 - r;
  }
  function cnpjValido(v) {
    var c = normCnpj(v);
    if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
    var d1 = dvMod11(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    var d2 = dvMod11(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return c.slice(12) === String(d1) + String(d2);
  }
  function normChaveNfe(v) { var s = String(v == null ? '' : v).toUpperCase().replace(/[^0-9A-Z]/g, ''); return /^\d{6}[0-9A-Z]{12}\d{26}$/.test(s) ? s : ''; }
  function cpfValido(v) {
    var c = soDigitos(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    function dv(n) { var t = 0; for (var i = 0; i < n; i++) t += +c[i] * (n + 1 - i); var r = (t * 10) % 11; return r === 10 ? 0 : r; }
    return dv(9) === +c[9] && dv(10) === +c[10];
  }
  // DV da chave de acesso (módulo 11, pesos 2..9 da direita; letras valem ASCII − 48).
  function chaveDvOk(ch) {
    var c = normChaveNfe(ch) || (/^\d{44}$/.test(String(ch || '')) ? String(ch) : '');
    if (!c) return false;
    var t = 0, p = 2;
    for (var i = 42; i >= 0; i--) { t += (c.charCodeAt(i) - 48) * p; p = p === 9 ? 2 : p + 1; }
    var r = t % 11, dv = r < 2 ? 0 : 11 - r;
    return dv === +c[43];
  }
  function decCentavos(s) {
    var t = String(s == null ? '' : s).trim();
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    var neg = t.charAt(0) === '-'; if (neg) t = t.slice(1);
    var p = t.split('.'), dec = (p[1] || '') + '000';
    var c = Number(p[0]) * 100 + Number(dec.slice(0, 2)) + (Number(dec.charAt(2)) >= 5 ? 1 : 0);
    return neg ? -c : c;
  }
  function c0(s) { var v = decCentavos(s); return v == null ? 0 : v; }
  function decNum(s, casas) { var t = String(s == null ? '' : s).trim(); if (!/^-?\d+(\.\d+)?$/.test(t)) return null; var f = Math.pow(10, casas == null ? 4 : casas); return Math.round(Number(t) * f) / f; }
  function xmlTexto(v) {
    return String(v).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
  }
  function tagRe(nome) { return new RegExp('<(?:[A-Za-z_][\\w.-]*:)?' + nome + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?' + nome + '>', 'g'); }
  function tagXml(xml, nome) { var m = tagRe(nome).exec(xml || ''); return m ? m[1] : null; }
  function tagsXml(xml, nome) { var re = tagRe(nome), out = [], m; while ((m = re.exec(xml || ''))) out.push(m[1]); return out; }
  function valXml(xml, nome) { var v = tagXml(xml, nome); return v == null ? null : xmlTexto(v); }
  function atrXml(xml, tag, atr) { var m = new RegExp('<(?:[A-Za-z_][\\w.-]*:)?' + tag + '\\b[^>]*\\b' + atr + '="([^"]*)"').exec(xml || ''); return m ? m[1] : null; }
  // Primeiro filho de um grupo (ex.: ICMS00 dentro de ICMS).
  function primeiroFilho(xml) { var m = /<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)(?:\s[^>]*)?>/.exec(xml || ''); return m ? m[1] : null; }
  function txt(v, n) { return String(v == null ? '' : v).slice(0, n || 200); }
  function semZeros(v) { var d = soDigitos(v); return d ? d.replace(/^0+(?=\d)/, '') : ''; }

  /* ── 1. Leitura de XML ────────────────────────────────────────────────── */
  function endereco(g) {
    return { lgr: txt(valXml(g, 'xLgr'), 60), nro: txt(valXml(g, 'nro'), 10), cpl: txt(valXml(g, 'xCpl'), 60), bairro: txt(valXml(g, 'xBairro'), 60),
      codMun: soDigitos(valXml(g, 'cMun')) || null, mun: txt(valXml(g, 'xMun'), 60), uf: txt(valXml(g, 'UF'), 2) || null,
      cep: soDigitos(valXml(g, 'CEP')) || null, codPais: soDigitos(valXml(g, 'cPais')) || null, fone: soDigitos(valXml(g, 'fone')) || null };
  }
  function pessoa(g, ender) {
    if (!g) return null;
    var e = endereco(tagXml(g, ender) || '');
    return Object.assign({ cnpj: normCnpj(valXml(g, 'CNPJ')) || null, cpf: soDigitos(valXml(g, 'CPF')) || null, idEstrangeiro: valXml(g, 'idEstrangeiro') || null,
      ie: (valXml(g, 'IE') || '').toUpperCase().replace(/[^0-9A-Z]/g, '') || null, nome: txt(valXml(g, 'xNome'), 100),
      fantasia: txt(valXml(g, 'xFant'), 60) || null, crt: valXml(g, 'CRT') || null, email: txt(valXml(g, 'email'), 60) || null }, e);
  }
  function lerIcms(imp) {
    var g = tagXml(imp, 'ICMS'); if (g == null) return null;
    var nome = primeiroFilho(g), x = nome ? (tagXml(g, nome) || '') : '';
    var r = { grupo: nome, orig: valXml(x, 'orig'), cst: valXml(x, 'CST'), csosn: valXml(x, 'CSOSN'), modBC: valXml(x, 'modBC'),
      vBC: c0(valXml(x, 'vBC')), pICMS: decNum(valXml(x, 'pICMS')) || 0, vICMS: c0(valXml(x, 'vICMS')), pRedBC: decNum(valXml(x, 'pRedBC')) || 0,
      vBCST: c0(valXml(x, 'vBCST')), pICMSST: decNum(valXml(x, 'pICMSST')) || 0, vICMSST: c0(valXml(x, 'vICMSST')),
      vFCP: c0(valXml(x, 'vFCP')), vFCPST: c0(valXml(x, 'vFCPST')), vFCPSTRet: c0(valXml(x, 'vFCPSTRet')),
      vICMSDeson: c0(valXml(x, 'vICMSDeson')), vCredICMSSN: c0(valXml(x, 'vCredICMSSN')), pCredSN: decNum(valXml(x, 'pCredSN')) || 0 };
    return r;
  }
  function lerIpi(imp) {
    var g = tagXml(imp, 'IPI'); if (g == null) return null;
    var t = tagXml(g, 'IPITrib'), nt = tagXml(g, 'IPINT'), x = t || nt || '';
    return { cEnq: valXml(g, 'cEnq') || null, cst: valXml(x, 'CST'), vBC: c0(valXml(x, 'vBC')), pIPI: decNum(valXml(x, 'pIPI')) || 0, vIPI: c0(valXml(x, 'vIPI')) };
  }
  function lerPisCofins(imp, tag) {
    var g = tagXml(imp, tag); if (g == null) return null;
    var nome = primeiroFilho(g), x = nome ? (tagXml(g, nome) || '') : '';
    var p = tag === 'PIS' ? 'PIS' : 'COFINS';
    return { cst: valXml(x, 'CST'), vBC: c0(valXml(x, 'vBC')), aliq: decNum(valXml(x, 'p' + p)) || 0, valor: c0(valXml(x, 'v' + p)) };
  }
  // Reforma tributária (IBS/CBS/IS): guardado para quando vier, nunca misturado ao ICMS.
  function lerIbsCbs(imp) {
    var g = tagXml(imp, 'IBSCBS'); if (g == null) return null;
    return { cst: valXml(g, 'CST'), cClassTrib: valXml(g, 'cClassTrib'), vBC: c0(valXml(g, 'vBC')),
      vIBS: c0(valXml(g, 'vIBS')) || (c0(valXml(tagXml(g, 'gIBSUF') || '', 'vIBSUF')) + c0(valXml(tagXml(g, 'gIBSMun') || '', 'vIBSMun'))),
      vCBS: c0(valXml(tagXml(g, 'gCBS') || '', 'vCBS')) };
  }
  function situacaoDoStatus(cStat) {
    var s = String(cStat || '');
    if (s === '100' || s === '150') return '00';
    if (s === '101' || s === '151' || s === '135' || s === '155') return '02';
    if (s === '110' || s === '301' || s === '302' || s === '303') return '04';
    return null;
  }

  function lerNfeCompleta(texto) {
    var x = String(texto || '');
    var inf = tagXml(x, 'infNFe');
    if (!inf) return { ok: false, motivo: 'Não é o XML de uma NF-e (falta o grupo infNFe).' };
    var idAtr = atrXml(x, 'infNFe', 'Id') || '';
    var chave = normChaveNfe(idAtr.replace(/^NFe/i, '') || valXml(x, 'chNFe'));
    if (!chave) return { ok: false, motivo: 'Chave de acesso (44 posições) não encontrada.' };
    var ide = tagXml(inf, 'ide') || '', tot = tagXml(tagXml(inf, 'total') || '', 'ICMSTot') || '';
    var modelo = valXml(ide, 'mod');
    if (modelo !== '55' && modelo !== '65') return { ok: false, motivo: 'Modelo ' + modelo + ': só NF-e (55) e NFC-e (65).' };
    var emissao = String(valXml(ide, 'dhEmi') || valXml(ide, 'dEmi') || '').slice(0, 10);
    if (!dataOk(emissao)) return { ok: false, motivo: 'Data de emissão inválida.' };
    var saiEnt = String(valXml(ide, 'dhSaiEnt') || valXml(ide, 'dSaiEnt') || '').slice(0, 10);
    var numero = semZeros(valXml(ide, 'nNF'));
    if (!numero) return { ok: false, motivo: 'Número da nota (nNF) ausente.' };
    var vNF = decCentavos(valXml(tot, 'vNF'));
    if (vNF == null) return { ok: false, motivo: 'Valor total da nota (vNF) ausente.' };
    var prot = tagXml(x, 'infProt') || '';
    var cStat = valXml(prot, 'cStat');
    var itens = tagsXml(inf, 'det').map(function(d, i) {
      var p = tagXml(d, 'prod') || '', imp = tagXml(d, 'imposto') || '';
      return {
        n: i + 1, cProd: txt(valXml(p, 'cProd'), 60), cEAN: valXml(p, 'cEAN') || null, xProd: txt(valXml(p, 'xProd'), 120),
        ncm: soDigitos(valXml(p, 'NCM')) || null, cest: soDigitos(valXml(p, 'CEST')) || null, exTipi: valXml(p, 'EXTIPI') || null,
        cfop: soDigitos(valXml(p, 'CFOP')) || null, uCom: txt(valXml(p, 'uCom'), 6).toUpperCase() || null, qCom: decNum(valXml(p, 'qCom'), 4),
        vUnCom: decNum(valXml(p, 'vUnCom'), 10), uTrib: txt(valXml(p, 'uTrib'), 6).toUpperCase() || null, qTrib: decNum(valXml(p, 'qTrib'), 4),
        vProd: decCentavos(valXml(p, 'vProd')), vDesc: c0(valXml(p, 'vDesc')), vFrete: c0(valXml(p, 'vFrete')), vSeg: c0(valXml(p, 'vSeg')),
        vOutro: c0(valXml(p, 'vOutro')), indTot: valXml(p, 'indTot') || '1', xPed: valXml(p, 'xPed') || null,
        icms: lerIcms(imp), ipi: lerIpi(imp), pis: lerPisCofins(imp, 'PIS'), cofins: lerPisCofins(imp, 'COFINS'), ibsCbs: lerIbsCbs(imp),
        vIPIDevol: c0(valXml(tagXml(d, 'impostoDevol') || '', 'vIPIDevol')), infAdProd: txt(valXml(d, 'infAdProd'), 200) || null
      };
    });
    var cobr = tagXml(inf, 'cobr') || '', fat = tagXml(cobr, 'fat') || '';
    var detPag = tagsXml(tagXml(inf, 'pag') || '', 'detPag');
    var ibsTot = tagXml(tagXml(inf, 'total') || '', 'IBSCBSTot') || '';
    var doc = {
      tipo: 'NFE', chave: chave, modelo: modelo, serie: semZeros(valXml(ide, 'serie')) || '0', numero: numero,
      emissao: emissao, saidaEntrada: dataOk(saiEnt) ? saiEnt : null, tpNF: valXml(ide, 'tpNF'), finNFe: valXml(ide, 'finNFe') || '1',
      natOp: txt(valXml(ide, 'natOp'), 60), idDest: valXml(ide, 'idDest') || null, tpEmis: valXml(ide, 'tpEmis') || '1',
      emitente: pessoa(tagXml(inf, 'emit'), 'enderEmit'), destinatario: pessoa(tagXml(inf, 'dest'), 'enderDest'),
      modFrete: valXml(tagXml(inf, 'transp') || '', 'modFrete'),
      indPag: (detPag.length ? valXml(detPag[0], 'indPag') : null) || valXml(ide, 'indPag') || null,
      totais: { vBC: c0(valXml(tot, 'vBC')), vICMS: c0(valXml(tot, 'vICMS')), vICMSDeson: c0(valXml(tot, 'vICMSDeson')), vFCP: c0(valXml(tot, 'vFCP')),
        vBCST: c0(valXml(tot, 'vBCST')), vST: c0(valXml(tot, 'vST')), vFCPST: c0(valXml(tot, 'vFCPST')), vProd: c0(valXml(tot, 'vProd')),
        vFrete: c0(valXml(tot, 'vFrete')), vSeg: c0(valXml(tot, 'vSeg')), vDesc: c0(valXml(tot, 'vDesc')), vII: c0(valXml(tot, 'vII')),
        vIPI: c0(valXml(tot, 'vIPI')), vIPIDevol: c0(valXml(tot, 'vIPIDevol')), vPIS: c0(valXml(tot, 'vPIS')), vCOFINS: c0(valXml(tot, 'vCOFINS')),
        vOutro: c0(valXml(tot, 'vOutro')), vNF: vNF,
        vIBS: c0(valXml(tagXml(ibsTot, 'gIBS') || '', 'vIBS')), vCBS: c0(valXml(tagXml(ibsTot, 'gCBS') || '', 'vCBS')) },
      fatura: fat ? { nFat: valXml(fat, 'nFat') || null, vOrig: decCentavos(valXml(fat, 'vOrig')), vDesc: c0(valXml(fat, 'vDesc')), vLiq: decCentavos(valXml(fat, 'vLiq')) } : null,
      duplicatas: tagsXml(cobr, 'dup').map(function(d) { return { numero: valXml(d, 'nDup') || null, vencimento: String(valXml(d, 'dVenc') || '').slice(0, 10), valorCentavos: c0(valXml(d, 'vDup')) }; }),
      refNFe: tagsXml(tagXml(ide, 'NFref') || '', 'refNFe').map(xmlTexto),
      infCpl: txt(valXml(tagXml(inf, 'infAdic') || '', 'infCpl'), 500) || null,
      protocolo: cStat ? { cStat: cStat, nProt: valXml(prot, 'nProt') || null, dhRecbto: valXml(prot, 'dhRecbto') || null } : null,
      situacao: situacaoDoStatus(cStat) || (cStat ? null : 'SEM_PROTOCOLO'),
      itens: itens, eventos: {}
    };
    var avisos = [];
    if (!chaveDvOk(chave)) avisos.push('Dígito verificador da chave não confere.');
    if (!doc.protocolo) avisos.push('XML sem protocolo de autorização (nfeProc): confira se a nota foi autorizada.');
    else if (!doc.situacao) avisos.push('Status ' + cStat + ' do protocolo não é de nota autorizada.');
    var somaItens = itens.reduce(function(s, it) { return s + (it.indTot === '0' ? 0 : num(it.vProd)); }, 0);
    if (somaItens !== doc.totais.vProd) avisos.push('Soma dos itens (R$ ' + (somaItens / 100).toFixed(2) + ') ≠ total dos produtos (R$ ' + (doc.totais.vProd / 100).toFixed(2) + ').');
    return { ok: true, doc: doc, avisos: avisos };
  }

  function lerCte(texto) {
    var x = String(texto || ''), inf = tagXml(x, 'infCte');
    if (!inf) return { ok: false, motivo: 'Não é o XML de um CT-e (falta infCte).' };
    var idAtr = atrXml(x, 'infCte', 'Id') || '';
    var chave = normChaveNfe(idAtr.replace(/^CTe/i, '') || valXml(x, 'chCTe'));
    if (!chave) return { ok: false, motivo: 'Chave do CT-e não encontrada.' };
    var ide = tagXml(inf, 'ide') || '', vPrest = tagXml(inf, 'vPrest') || '', imp = tagXml(inf, 'imp') || '';
    var emissao = String(valXml(ide, 'dhEmi') || '').slice(0, 10);
    if (!dataOk(emissao)) return { ok: false, motivo: 'Data de emissão do CT-e inválida.' };
    var toma3 = tagXml(ide, 'toma3'), toma4 = tagXml(ide, 'toma4');
    var toma = valXml(toma3 || toma4 || '', 'toma');
    var papeis = { '0': 'rem', '1': 'exped', '2': 'receb', '3': 'dest' };
    var grupos = { rem: pessoa(tagXml(inf, 'rem'), 'enderReme'), exped: pessoa(tagXml(inf, 'exped'), 'enderExped'), receb: pessoa(tagXml(inf, 'receb'), 'enderReceb'), dest: pessoa(tagXml(inf, 'dest'), 'enderDest') };
    var tomador = toma === '4' ? pessoa(toma4, 'enderToma') : grupos[papeis[toma]] || null;
    var g = tagXml(imp, 'ICMS') || '', nome = primeiroFilho(g), ic = nome ? (tagXml(g, nome) || '') : '';
    var prot = tagXml(x, 'infProt') || '', cStat = valXml(prot, 'cStat');
    var cst = valXml(ic, 'CST') || (nome === 'ICMSSN' ? '90' : null);
    var doc = {
      tipo: 'CTE', chave: chave, modelo: valXml(ide, 'mod') || '57', serie: semZeros(valXml(ide, 'serie')) || '0', numero: semZeros(valXml(ide, 'nCT')),
      emissao: emissao, cfop: soDigitos(valXml(ide, 'CFOP')), tpCTe: valXml(ide, 'tpCTe') || '0', toma: toma,
      codMunIni: soDigitos(valXml(ide, 'cMunIni')) || null, codMunFim: soDigitos(valXml(ide, 'cMunFim')) || null,
      emitente: pessoa(tagXml(inf, 'emit'), 'enderEmit'), tomador: tomador, remetente: grupos.rem, destinatario: grupos.dest,
      totais: { vTPrest: c0(valXml(vPrest, 'vTPrest')), vRec: c0(valXml(vPrest, 'vRec')), vBC: c0(valXml(ic, 'vBC')), pICMS: decNum(valXml(ic, 'pICMS')) || 0,
        vICMS: c0(valXml(ic, 'vICMS')), pRedBC: decNum(valXml(ic, 'pRedBC')) || 0, cst: cst },
      protocolo: cStat ? { cStat: cStat, nProt: valXml(prot, 'nProt') || null } : null,
      situacao: situacaoDoStatus(cStat) || (cStat ? null : 'SEM_PROTOCOLO'), eventos: {}
    };
    var avisos = [];
    if (!doc.protocolo) avisos.push('CT-e sem protocolo de autorização.');
    return { ok: true, doc: doc, avisos: avisos };
  }

  // Evento (cancelamento 110111, carta de correção 110110…) de NF-e ou CT-e.
  function lerEvento(texto) {
    var x = String(texto || ''), inf = tagXml(x, 'infEvento');
    if (!inf) return { ok: false, motivo: 'Não é um evento (falta infEvento).' };
    var chave = normChaveNfe(valXml(inf, 'chNFe') || valXml(inf, 'chCTe'));
    var tp = valXml(inf, 'tpEvento'), det = tagXml(inf, 'detEvento') || '';
    var ret = tagXml(x, 'retEvento') || '', cStat = valXml(tagXml(ret, 'infEvento') || ret, 'cStat');
    if (!chave || !tp) return { ok: false, motivo: 'Evento sem chave ou tipo.' };
    return { ok: true, evento: { chave: chave, tpEvento: tp, nSeq: valXml(inf, 'nSeqEvento') || '1', dhEvento: valXml(inf, 'dhEvento') || null,
      descricao: txt(valXml(det, 'descEvento'), 60), justificativa: txt(valXml(det, 'xJust'), 255) || null, correcao: txt(valXml(det, 'xCorrecao'), 1000) || null,
      nProt: valXml(det, 'nProt') || null, cStat: cStat || null, registrado: !cStat || cStat === '135' || cStat === '136' || cStat === '155' } };
  }
  function lerInutilizacao(texto) {
    var x = String(texto || ''), inf = tagXml(x, 'infInut');
    if (!inf) return { ok: false, motivo: 'Não é uma inutilização.' };
    var ret = tagXml(x, 'retInutNFe') || '', cStat = valXml(tagXml(ret, 'infInut') || '', 'cStat');
    var o = { cnpj: normCnpj(valXml(inf, 'CNPJ')), modelo: valXml(inf, 'mod') || '55', serie: semZeros(valXml(inf, 'serie')) || '0',
      ini: +semZeros(valXml(inf, 'nNFIni')), fim: +semZeros(valXml(inf, 'nNFFin')), ano: valXml(inf, 'ano'), justificativa: txt(valXml(inf, 'xJust'), 255),
      cStat: cStat || null, data: String(valXml(tagXml(ret, 'infInut') || '', 'dhRecbto') || '').slice(0, 10) || null };
    if (!(o.ini > 0) || o.fim < o.ini || o.fim - o.ini > 999) return { ok: false, motivo: 'Faixa de numeração inválida na inutilização.' };
    o.chave = 'INU' + o.cnpj + o.modelo + ('000' + o.serie).slice(-3) + ('000000000' + o.ini).slice(-9) + ('000000000' + o.fim).slice(-9);
    return { ok: true, inut: o };
  }
  // Detecta o tipo pelo conteúdo e lê.
  function lerXml(texto) {
    var x = String(texto || '');
    if (/<(?:\w+:)?infEvento\b/.test(x)) { var ev = lerEvento(x); return ev.ok ? { ok: true, tipo: 'EVENTO', evento: ev.evento } : ev; }
    if (/<(?:\w+:)?infInut\b/.test(x)) { var iu = lerInutilizacao(x); return iu.ok ? { ok: true, tipo: 'INUT', inut: iu.inut } : iu; }
    if (/<(?:\w+:)?infCte\b/.test(x)) { var ct = lerCte(x); return ct.ok ? { ok: true, tipo: 'CTE', doc: ct.doc, avisos: ct.avisos } : ct; }
    if (/<(?:\w+:)?infNFe\b/.test(x)) { var nf = lerNfeCompleta(x); return nf.ok ? { ok: true, tipo: 'NFE', doc: nf.doc, avisos: nf.avisos } : nf; }
    if (/<(?:\w+:)?NF3e\b|infNF3e/.test(x)) return { ok: false, motivo: 'NF3e (energia, modelo 66): ainda não lida aqui (pergunta P4 do PROMPT_FISCAL.md).' };
    return { ok: false, motivo: 'Arquivo não reconhecido como NF-e, CT-e, evento ou inutilização.' };
  }

  /* Posição do documento em relação à empresa: emissão própria ou de terceiros,
     entrada ou saída, e quem é o participante (0150). CT-e só entra no livro
     quando a empresa é a TOMADORA do serviço. */
  function relativo(doc, cnpjEmpresa) {
    var me = normCnpj(cnpjEmpresa || CNPJ_KURYOS);
    var d = Object.assign({}, doc);
    if (doc.tipo === 'CTE') {
      var tomaCnpj = doc.tomador && (doc.tomador.cnpj || doc.tomador.cpf);
      if (normCnpj(doc.emitente && doc.emitente.cnpj) === me) return Object.assign(d, { ok: false, motivo: 'CT-e emitido pela própria empresa: fora do escopo (a empresa não presta transporte).' });
      if (normCnpj(tomaCnpj) !== me) return Object.assign(d, { ok: false, motivo: 'CT-e em que a empresa não é a tomadora: não se escritura (Guia, D100 é do tomador).' });
      return Object.assign(d, { ok: true, indEmit: '1', indOper: '0', participante: doc.emitente });
    }
    var emit = normCnpj(doc.emitente && doc.emitente.cnpj), dest = normCnpj(doc.destinatario && (doc.destinatario.cnpj || doc.destinatario.cpf));
    if (emit === me) return Object.assign(d, { ok: true, indEmit: '0', indOper: doc.tpNF === '0' ? '0' : '1', participante: doc.destinatario });
    if (dest === me) return Object.assign(d, { ok: true, indEmit: '1', indOper: '0', participante: doc.emitente });
    return Object.assign(d, { ok: false, motivo: 'A nota não é da empresa (CNPJ ' + me + ' não é emitente nem destinatário).' });
  }
  // Mês do livro: entrada pela data de entrada; saída (e emissão própria) pela emissão.
  function dataEscrituracao(doc) {
    if (!doc) return null;
    if (doc.tipo === 'INUT') return doc.data || (doc.ano ? '20' + doc.ano + '-01-01' : null);
    if (doc.indOper === '0' && doc.indEmit === '1') return doc.dataEntradaInformada || doc.saidaEntrada || doc.emissao;
    return doc.emissao;
  }
  function mesDoDocumento(doc) { var d = dataEscrituracao(doc); return d ? d.slice(0, 7) : null; }

  /* ── 2. Regras de entrada (o "CFOP 1.101-A gera livro" do WebMais) ─────── */
  // CFOP de quem vendeu → CFOP de entrada da empresa industrial, pelo uso do item.
  // Critério: tipo do item 07 = uso e consumo, 08 = ativo; o resto é insumo de produção.
  var CFOP_ESPECIAL = {
    '5901': '1901', '5924': '1924', '5902': '1902', '5903': '1903', '5124': '1124', '5125': '1125',
    '5915': '1915', '5916': '1916', '5910': '1910', '5911': '1911', '5949': '1949', '5920': '1920', '5921': '1921',
    '5201': '1201', '5202': '1202', '5410': '1410', '5411': '1411', '5151': '1151', '5152': '1152', '5552': '1552', '5557': '1557',
    '5352': '1352', '5353': '1352', '5351': '1352', '5932': '1352', '5357': '1352', '5360': '1352'
  };
  var CFOP_ENCOMENDA_ENTRADA = { '1901': 1, '2901': 1, '1924': 1, '2924': 1 };
  var CFOP_SIMBOLICO_SAIDA = { '5902': 1, '6902': 1, '5903': 1, '6903': 1, '5925': 1, '6925': 1 };
  var CFOP_INDUSTRIALIZACAO = { '5124': 1, '6124': 1, '5125': 1, '6125': 1 };
  function sugerirRegra(cfopOrigem, tipoItem, regime) {
    var c = soDigitos(cfopOrigem);
    if (!/^[567]\d{3}$/.test(c)) return null;
    var pre = { '5': '1', '6': '2', '7': '3' }[c[0]], fim = c.slice(1);
    var base = CFOP_ESPECIAL['5' + fim], ti = String(tipoItem || '');
    var entrada;
    if (base) entrada = pre + base.slice(1);
    else if (/^40[1-5]$/.test(fim)) entrada = pre + (ti === '07' ? '407' : ti === '08' ? '406' : '401');
    else if (ti === '07') entrada = pre + '556';
    else if (ti === '08') entrada = pre + '551';
    else if (ti === '00') entrada = pre + '102';
    else entrada = pre + '101';
    if (c[0] === '7') entrada = '3' + entrada.slice(1);
    var encomenda = !!CFOP_ENCOMENDA_ENTRADA[entrada];
    var semCredito = encomenda || /^[123](556|551|407|406|910|911|949|915|916|920|921|902|903)$/.test(entrada) || regime === 'SIMPLES';
    var transporte = /^[123]352$/.test(entrada);
    return { cfopOrigem: c, cfopEntrada: entrada, geraLivro: true, creditaICMS: !semCredito, creditaIPI: !semCredito && /^[123](101|401|124|125)$/.test(entrada),
      tipoItem: transporte ? '09' : (ti || '01'), propriedade: encomenda ? 'CLIENTE' : 'PROPRIA', sugerida: true };
  }
  /* Regra que vale para o item: a mais específica entre as cadastradas
     (fornecedor > NCM > CST > só CFOP). Sem regra → null (inconsistência). */
  function regraDoItem(regras, cfopOrigem, ctx) {
    var c = soDigitos(cfopOrigem), x = ctx || {}, melhor = null, pts = -1;
    Object.keys(regras || {}).forEach(function(id) {
      var r = regras[id]; if (!r || r.ativo === false || soDigitos(r.cfopOrigem) !== c) return;
      if (r.fornecedor && normCnpj(r.fornecedor) !== normCnpj(x.fornecedor)) return;
      if (r.ncm && String(r.ncm) !== String(x.ncm || '')) return;
      if (r.cst && String(r.cst) !== String(x.cst || '')) return;
      var p = (r.fornecedor ? 4 : 0) + (r.ncm ? 2 : 0) + (r.cst ? 1 : 0);
      if (p > pts) { pts = p; melhor = Object.assign({ id: id }, r); }
    });
    return melhor;
  }
  var TIPOS_ITEM = { '00': 'Mercadoria para revenda', '01': 'Matéria-prima', '02': 'Embalagem', '03': 'Produto em processo', '04': 'Produto acabado',
    '05': 'Subproduto', '06': 'Produto intermediário', '07': 'Material de uso e consumo', '08': 'Ativo imobilizado', '09': 'Serviços', '10': 'Outros insumos', '99': 'Outras' };
  function validarRegra(d) {
    var x = d || {}, o = soDigitos(x.cfopOrigem), e = soDigitos(x.cfopEntrada);
    if (!/^[567]\d{3}$/.test(o)) return { ok: false, motivo: 'CFOP do fornecedor deve começar com 5, 6 ou 7 (4 dígitos).' };
    if (!/^[123]\d{3}$/.test(e)) return { ok: false, motivo: 'CFOP de entrada deve começar com 1, 2 ou 3 (4 dígitos).' };
    if ({ '5': '1', '6': '2', '7': '3' }[o[0]] !== e[0]) return { ok: false, motivo: 'CFOP ' + o + ' é ' + (o[0] === '5' ? 'interno' : o[0] === '6' ? 'interestadual' : 'do exterior') + ': a entrada começa com ' + { '5': '1', '6': '2', '7': '3' }[o[0]] + '.' };
    if (x.tipoItem && !TIPOS_ITEM[x.tipoItem]) return { ok: false, motivo: 'Tipo do item inválido.' };
    if (x.ncm && !/^\d{8}$/.test(String(x.ncm))) return { ok: false, motivo: 'NCM com 8 dígitos.' };
    if (x.cst && !/^\d{2,3}$/.test(String(x.cst))) return { ok: false, motivo: 'CST com 2 ou 3 dígitos.' };
    if (x.fornecedor && !(cnpjValido(x.fornecedor) || cpfValido(x.fornecedor))) return { ok: false, motivo: 'CNPJ/CPF do fornecedor inválido.' };
    var variante = String(x.variante || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
    var id = o + (variante ? '-' + variante : '') + (x.fornecedor ? '-F' + normCnpj(x.fornecedor) : '') + (x.ncm ? '-N' + x.ncm : '') + (x.cst ? '-C' + x.cst : '');
    return { ok: true, id: id, registro: { cfopOrigem: o, cfopEntrada: e, variante: variante || null, geraLivro: x.geraLivro !== false, creditaICMS: !!x.creditaICMS, creditaIPI: !!x.creditaIPI,
      tipoItem: x.tipoItem || '01', propriedade: x.propriedade === 'CLIENTE' ? 'CLIENTE' : 'PROPRIA', fornecedor: x.fornecedor ? normCnpj(x.fornecedor) : null,
      ncm: x.ncm || null, cst: x.cst || null, ativo: x.ativo !== false, observacao: txt(x.observacao, 200) || null } };
  }
  function validarItem(d) {
    var x = d || {}, cod = String(x.codigo || '').trim();
    if (!cod || cod.length > 60 || /[|]/.test(cod)) return { ok: false, motivo: 'Código do item: até 60 caracteres, sem "|".' };
    if (!String(x.descr || '').trim()) return { ok: false, motivo: 'Descrição obrigatória.' };
    if (!/^[A-Z0-9]{1,6}$/i.test(String(x.un || ''))) return { ok: false, motivo: 'Unidade de inventário: até 6 letras/números.' };
    if (!TIPOS_ITEM[x.tipoItem]) return { ok: false, motivo: 'Tipo do item (0200) inválido.' };
    if (x.ncm && !/^\d{8}$/.test(String(x.ncm))) return { ok: false, motivo: 'NCM com 8 dígitos.' };
    var conv = {};
    Object.keys(x.conversoes || {}).forEach(function(u) { var f = Number(String(x.conversoes[u]).replace(',', '.')); if (/^[A-Z0-9]{1,6}$/i.test(u) && f > 0) conv[u.toUpperCase()] = Math.round(f * 1e6) / 1e6; });
    return { ok: true, id: cod.replace(/[.#$\[\]\/]/g, '_'), registro: { codigo: cod, descr: txt(x.descr, 120), un: String(x.un).toUpperCase(), tipoItem: x.tipoItem,
      ncm: x.ncm || null, cest: x.cest || null, codBarra: x.codBarra || null, exIpi: x.exIpi || null, aliqIcms: x.aliqIcms != null && x.aliqIcms !== '' ? num(x.aliqIcms) : null,
      material: x.material || null, conversoes: conv } };
  }
  function chaveDePara(cnpj, cProd) { return normCnpj(cnpj) + '/' + String(cProd || '').replace(/[.#$\[\]\/]/g, '_').slice(0, 60); }
  // O banco guarda aninhado (fis/de_para_itens/{cnpj}/{código}); aceita também a chave plana.
  function buscarDePara(dePara, cnpj, cProd) {
    var d = dePara || {}, k = chaveDePara(cnpj, cProd), p = k.split('/');
    return d[k] || (d[p[0]] || {})[p[1]] || null;
  }
  function validarDePara(d) {
    var x = d || {};
    if (!normCnpj(x.fornecedor)) return { ok: false, motivo: 'CNPJ do fornecedor.' };
    if (!String(x.cProd || '').trim()) return { ok: false, motivo: 'Código do produto do fornecedor.' };
    if (!String(x.item || '').trim()) return { ok: false, motivo: 'Item interno (0200).' };
    var f = Number(String(x.fator == null || x.fator === '' ? 1 : x.fator).replace(',', '.'));
    if (!(f > 0)) return { ok: false, motivo: 'Fator de conversão maior que zero.' };
    return { ok: true, caminho: chaveDePara(x.fornecedor, x.cProd), registro: { item: String(x.item).trim(), fator: Math.round(f * 1e6) / 1e6, unidadeFornecedor: x.unidadeFornecedor || null } };
  }
  function validarEstabelecimento(d) {
    var x = d || {};
    if (!cnpjValido(x.cnpj)) return { ok: false, motivo: 'CNPJ do estabelecimento inválido.' };
    if (!/^[A-Z]{2}$/.test(String(x.uf || '').toUpperCase())) return { ok: false, motivo: 'UF.' };
    if (x.codMun && !/^\d{7}$/.test(String(x.codMun))) return { ok: false, motivo: 'Código IBGE do município com 7 dígitos.' };
    if (x.regime && x.regime !== 'NORMAL' && x.regime !== 'SIMPLES') return { ok: false, motivo: 'Regime: NORMAL ou SIMPLES.' };
    if (x.perfil && !/^[ABC]$/.test(x.perfil)) return { ok: false, motivo: 'Perfil A, B ou C.' };
    var ct = x.contabilista || {};
    if (ct.cpf && !cpfValido(ct.cpf)) return { ok: false, motivo: 'CPF do contabilista inválido.' };
    if (ct.cnpj && !cnpjValido(ct.cnpj)) return { ok: false, motivo: 'CNPJ do escritório inválido.' };
    var limpa = function(v, n) { var s = String(v == null ? '' : v).trim(); return s ? s.slice(0, n || 100) : null; };
    return { ok: true, registro: {
      cnpj: normCnpj(x.cnpj), ie: limpa(String(x.ie || '').replace(/[^0-9A-Z]/gi, ''), 14), im: limpa(x.im, 20), nome: limpa(x.nome, 100), fantasia: limpa(x.fantasia, 60),
      cep: limpa(soDigitos(x.cep), 8), endereco: limpa(x.endereco, 60), numero: limpa(x.numero, 10), complemento: limpa(x.complemento, 60), bairro: limpa(x.bairro, 60),
      fone: limpa(soDigitos(x.fone), 11), email: limpa(x.email, 60), codMun: limpa(x.codMun, 7), municipio: limpa(x.municipio, 60), uf: String(x.uf).toUpperCase(),
      cnae: limpa(soDigitos(x.cnae), 7), perfil: x.perfil || 'A', indAtiv: '0', regime: x.regime || null, contribuinteIpi: x.contribuinteIpi !== false,
      codReceitaIcms: limpa(x.codReceitaIcms, 20), diaVencimentoIcms: x.diaVencimentoIcms ? Math.max(1, Math.min(31, Math.round(num(x.diaVencimentoIcms)))) : null,
      contaContabilEstoque: limpa(x.contaContabilEstoque, 60), contato: limpa(x.contato, 28),
      contabilista: { nome: limpa(ct.nome, 100), cpf: limpa(soDigitos(ct.cpf), 11), crc: limpa(ct.crc, 15), cnpj: ct.cnpj ? normCnpj(ct.cnpj) : null, cep: limpa(soDigitos(ct.cep), 8),
        endereco: limpa(ct.endereco, 60), numero: limpa(ct.numero, 10), complemento: limpa(ct.complemento, 60), bairro: limpa(ct.bairro, 60), fone: limpa(soDigitos(ct.fone), 11),
        email: limpa(ct.email, 60), codMun: limpa(ct.codMun, 7) } } };
  }

  /* ── 3. Escrituração de um documento ──────────────────────────────────── */
  // CST de ICMS em 3 dígitos (origem + tributação). Simples Nacional (CSOSN) → x90.
  // Critério: entrada sem crédito escritura como x90 com base e imposto zerados.
  function cstIcms(icms) {
    if (!icms) return null;
    var o = String(icms.orig == null ? '0' : icms.orig);
    if (icms.cst) return o + ('0' + icms.cst).slice(-2);
    if (icms.csosn) return o + '90';
    return null;
  }
  function chaveItem(cnpjForn, cProd) { var k = 'F' + normCnpj(cnpjForn).slice(0, 8) + '-' + String(cProd || ''); return k.slice(0, 60); }
  function codPart(p) { if (!p) return null; return normCnpj(p.cnpj) || soDigitos(p.cpf) || (p.idEstrangeiro ? 'EX' + String(p.idEstrangeiro).slice(0, 20) : null); }
  function ehEntradaCfop(c) { return /^[123]/.test(String(c || '')); }
  function inc(lista, imp, grupo, id, msg) { lista.push({ impeditivo: !!imp, grupo: grupo, identificador: id || '', descricao: msg }); }

  /* ctx: {estab, regras, itens, dePara, opcoes:{c170Propria}}
     Devolve {ok, escriturado, motivoFora, c100, itens(C170), c190, d100, d190, participante, inconsistencias} */
  function escriturar(docBruto, ctx) {
    var x = ctx || {}, est = x.estab || {}, regime = est.regime || 'NORMAL', incs = [];
    var doc = docBruto.indOper ? docBruto : relativo(docBruto, est.cnpj);
    var idDoc = (doc.tipo === 'CTE' ? 'CT-e ' : 'NF ') + (doc.numero || '') + (doc.serie && doc.serie !== '0' ? '/' + doc.serie : '') + ' ' + ((doc.participante || doc.emitente || {}).nome || '');
    if (doc.ok === false) return { ok: true, escriturado: false, motivoFora: doc.motivo, inconsistencias: [] };
    var propria = doc.indEmit === '0';
    var sit = doc.situacao;
    if (doc.tipo !== 'INUT' && (sit === 'SEM_PROTOCOLO' || !sit)) inc(incs, true, 'Documento', idDoc, 'Sem protocolo de autorização válido: importe o XML autorizado (nfeProc/cteProc).');
    if (!propria && sit === '02') return { ok: true, escriturado: false, motivoFora: 'Nota de terceiro cancelada: não se escritura.', inconsistencias: [] };
    var res = { ok: true, escriturado: true, doc: doc, indOper: doc.indOper, indEmit: doc.indEmit, participante: doc.participante || null, itens: [], c190: [], inconsistencias: incs };
    if (sit === '02' || sit === '04' || sit === '05') { res.cancelado = true; return res; }

    if (doc.tipo === 'CTE') {
      var r = regraDoItem(x.regras, doc.cfop, { fornecedor: doc.emitente && doc.emitente.cnpj, cst: doc.totais.cst });
      if (!r) { inc(incs, true, 'CT-e', idDoc, 'CFOP ' + doc.cfop + ' sem regra de entrada (gera livro?). Cadastre em Regras de entrada.'); return res; }
      if (!r.geraLivro) return { ok: true, escriturado: false, motivoFora: 'Regra ' + r.id + ' não gera livro.', inconsistencias: incs };
      var cred = r.creditaICMS && regime !== 'SIMPLES';
      res.d190 = [{ cst: '0' + ('0' + (doc.totais.cst || '90')).slice(-2), cfop: r.cfopEntrada, aliq: cred ? doc.totais.pICMS : 0, vOpr: doc.totais.vTPrest,
        vBC: cred ? doc.totais.vBC : 0, vICMS: cred ? doc.totais.vICMS : 0, vRedBC: 0 }];
      return res;
    }

    var itensCad = x.itens || {}, dePara = x.dePara || {}, todasFora = true, algumaFora = false;
    var cnpjForn = doc.emitente && doc.emitente.cnpj;
    (doc.itens || []).forEach(function(it) {
      var r = null, cfopLivro = it.cfop, cst = cstIcms(it.icms), credIcms = true, credIpi = true, propriedade = 'PROPRIA', tipoItem = null, codItem, fator = 1, un = it.uCom;
      if (!propria && doc.indOper === '0') {
        r = regraDoItem(x.regras, it.cfop, { fornecedor: cnpjForn, ncm: it.ncm, cst: it.icms && (it.icms.cst || it.icms.csosn) });
        if (!r) { inc(incs, true, 'Nota de entrada', idDoc, 'Item ' + it.n + ': CFOP ' + it.cfop + ' sem regra de entrada (gera livro?). Todas as CFOPs dos itens devem estar definidas para gerar livro.'); todasFora = false; return; }
        if (!r.geraLivro) { algumaFora = true; return; }
        todasFora = false;
        cfopLivro = r.cfopEntrada; credIcms = r.creditaICMS && regime !== 'SIMPLES'; credIpi = r.creditaIPI && regime !== 'SIMPLES' && est.contribuinteIpi !== false;
        propriedade = r.propriedade || 'PROPRIA'; tipoItem = r.tipoItem || null;
        var dp = buscarDePara(dePara, cnpjForn, it.cProd);
        if (dp && dp.item) { codItem = dp.item; fator = num(dp.fator) || 1; }
        else codItem = chaveItem(cnpjForn, it.cProd);
      } else {
        todasFora = false;
        codItem = String(it.cProd || '').slice(0, 60);
        credIpi = est.contribuinteIpi !== false;
        // Sem cadastro em Itens fiscais, o tipo sai do CFOP (aviso para conferir): o que se vende ou
        // industrializa é produto acabado; o retorno simbólico é insumo do cliente.
        var cl = classeSaida(it.cfop);
        tipoItem = cl === 'VENDA' || cl === 'INDUSTRIALIZACAO' ? '04' : cl === 'SIMBOLICO' ? '01' : null;
      }
      if (!it.cfop) inc(incs, true, 'Documento', idDoc, 'Item ' + it.n + ' sem CFOP.');
      if (it.vProd == null) inc(incs, true, 'Documento', idDoc, 'Item ' + it.n + ' sem valor (vProd).');
      if (!cst) inc(incs, true, 'Documento', idDoc, 'Item ' + it.n + ' sem CST/CSOSN de ICMS.');
      var ic = it.icms || {}, ip = it.ipi || {};
      var vIcms = ic.vICMS || 0, vBC = ic.vBC || 0, aliq = ic.pICMS || 0;
      // Crédito do Simples (vCredICMSSN) só quando a regra credita.
      if (!ic.cst && ic.csosn) { vIcms = ic.vCredICMSSN || 0; aliq = ic.pCredSN || 0; vBC = vIcms ? Math.round(vIcms * 100 / (aliq || 1)) : 0; }
      if (!propria && doc.indOper === '0' && !credIcms) { cst = (cst || '090').slice(0, 1) + '90'; vIcms = 0; vBC = 0; aliq = 0; }
      if (!vIcms) { aliq = vBC ? aliq : 0; }
      var vIpiDoc = ip.vIPI || 0, vIpi = credIpi ? vIpiDoc : 0;
      var vOpr = num(it.vProd) + it.vFrete + it.vSeg + it.vOutro - it.vDesc + (ic.vICMSST || 0) + (ic.vFCPST || 0) + vIpiDoc + (it.vIPIDevol || 0) - (ic.vICMSDeson && doc.totais.vICMSDeson ? ic.vICMSDeson : 0);
      var cstIpi = ip.cst || null;
      if (!propria && doc.indOper === '0') cstIpi = credIpi && vIpiDoc ? '00' : '49';
      else if (!cstIpi) cstIpi = doc.indOper === '1' ? '53' : '49';
      res.itens.push({ n: it.n, codItem: codItem, descr: it.xProd, ncm: it.ncm, cest: it.cest, codBarra: it.cEAN && !/SEM GTIN/i.test(it.cEAN) ? it.cEAN : null,
        qtd: it.qCom != null ? Math.round(it.qCom * fator * 1e5) / 1e5 : null, un: un, vItem: num(it.vProd), vDesc: it.vDesc, cst: cst, cfop: cfopLivro, cfopOrigem: it.cfop,
        vBC: vBC, aliq: aliq, vICMS: vIcms, vBCST: ic.vBCST || 0, aliqST: ic.pICMSST || 0, vST: ic.vICMSST || 0, vFCP: ic.vFCP || 0, vFCPST: ic.vFCPST || 0,
        cstIpi: cstIpi, cEnq: ip.cEnq || null, vBCIpi: vIpi ? ip.vBC : 0, aliqIpi: vIpi ? ip.pIPI : 0, vIPI: vIpi, vIPIDoc: vIpiDoc, vOpr: vOpr,
        propriedade: propriedade, tipoItem: tipoItem, tipoAssumido: propria && !!tipoItem, regra: r ? r.id : null, regraSugerida: !!(r && r.sugerida), pRedBC: ic.pRedBC || 0,
        vRedBC: ic.pRedBC && vBC ? Math.round(vBC * 100 / (100 - ic.pRedBC)) - vBC : 0, autoItem: !propria && !buscarDePara(dePara, cnpjForn, it.cProd) });
      if (!propria && doc.indOper === '0' && !buscarDePara(dePara, cnpjForn, it.cProd))
        res.semDePara = (res.semDePara || 0) + 1;
    });
    if (!propria && doc.indOper === '0' && algumaFora && !todasFora && res.itens.length) inc(incs, true, 'Nota de entrada', idDoc, 'Itens com regras que geram e que não geram livro na mesma nota: defina todas as CFOPs do mesmo jeito.');
    if (!res.itens.length && !incs.some(function(i) { return i.impeditivo; })) return { ok: true, escriturado: false, motivoFora: 'Nenhum item gera livro (regra de entrada).', inconsistencias: incs };
    // C190 por CST × CFOP × alíquota.
    var g = {};
    res.itens.forEach(function(i) {
      var k = i.cst + '|' + i.cfop + '|' + (i.aliq || 0);
      var a = g[k] = g[k] || { cst: i.cst, cfop: i.cfop, aliq: i.aliq || 0, vOpr: 0, vBC: 0, vICMS: 0, vBCST: 0, vST: 0, vRedBC: 0, vIPI: 0, vFCP: 0, vFCPST: 0 };
      a.vOpr += i.vOpr; a.vBC += i.vBC; a.vICMS += i.vICMS; a.vBCST += i.vBCST; a.vST += i.vST; a.vRedBC += i.vRedBC; a.vIPI += i.vIPI; a.vFCP += i.vFCP; a.vFCPST += i.vFCPST;
    });
    res.c190 = Object.keys(g).sort().map(function(k) { return g[k]; });
    var somaOpr = res.c190.reduce(function(s, a) { return s + a.vOpr; }, 0);
    var vDoc = doc.totais.vNF;
    if (somaOpr !== vDoc) {
      if (Math.abs(somaOpr - vDoc) <= 2 && res.c190.length) { res.c190[res.c190.length - 1].vOpr += vDoc - somaOpr; }
      else if (!algumaFora) inc(incs, true, 'Documento', idDoc, 'Soma do valor da operação por CFOP (R$ ' + (somaOpr / 100).toFixed(2) + ') ≠ valor da nota (R$ ' + (vDoc / 100).toFixed(2) + ').');
    }
    res.totais = {
      vDoc: vDoc, vDesc: doc.totais.vDesc, vMerc: doc.totais.vProd, vFrete: doc.totais.vFrete, vSeg: doc.totais.vSeg, vOutro: doc.totais.vOutro,
      vBC: res.c190.reduce(function(s, a) { return s + a.vBC; }, 0), vICMS: res.c190.reduce(function(s, a) { return s + a.vICMS; }, 0),
      vBCST: res.c190.reduce(function(s, a) { return s + a.vBCST; }, 0), vST: res.c190.reduce(function(s, a) { return s + a.vST; }, 0),
      vIPI: res.c190.reduce(function(s, a) { return s + a.vIPI; }, 0), vPIS: doc.totais.vPIS, vCOFINS: doc.totais.vCOFINS
    };
    res.c170 = !propria || !!(x.opcoes && x.opcoes.c170Propria);
    return res;
  }

  /* ── 4. Livro do mês ──────────────────────────────────────────────────── */
  // docs = fis/documentos; devolve as linhas do livro, os totais por CFOP e a receita.
  function livro(docs, mes, ctx) {
    var x = ctx || {}, est = x.estab || {}, linhas = [], fora = [], incs = [];
    Object.keys(docs || {}).sort().forEach(function(k) {
      var d = docs[k]; if (!d) return;
      if (d.tipo === 'INUT') {
        if (mesDoDocumento(d) !== mes) return;
        for (var nn = d.ini; nn <= d.fim; nn++) linhas.push({ chave: k + '#' + nn, inut: true, modelo: d.modelo, serie: d.serie, numero: String(nn), indOper: '1', indEmit: '0', situacao: '05', data: d.data, cancelado: true, c190: [], itens: [] });
        return;
      }
      var dr = d.indOper ? d : relativo(d, est.cnpj);
      if (mesDoDocumento(dr) !== mes) return;
      var e = escriturar(dr, x);
      e.inconsistencias.forEach(function(i) { incs.push(i); });
      if (!e.escriturado) { fora.push({ chave: k, numero: d.numero, participante: ((dr.participante || dr.emitente) || {}).nome, motivo: e.motivoFora }); return; }
      linhas.push(Object.assign({ chave: k, tipo: d.tipo, modelo: d.modelo, serie: d.serie, numero: d.numero, data: dataEscrituracao(dr), emissao: d.emissao, situacao: d.situacao }, e));
    });
    var porCfop = {};
    linhas.forEach(function(l) {
      (l.c190 || l.d190 || []).forEach(function(a) {
        var p = porCfop[a.cfop] = porCfop[a.cfop] || { cfop: a.cfop, vOpr: 0, vBC: 0, vICMS: 0, vST: 0, vIPI: 0, documentos: 0 };
        p.vOpr += a.vOpr; p.vBC += a.vBC; p.vICMS += a.vICMS; p.vST += a.vST || 0; p.vIPI += a.vIPI || 0; p.documentos++;
      });
    });
    return { mes: mes, linhas: linhas, fora: fora, porCfop: porCfop, inconsistencias: incs,
      entradas: linhas.filter(function(l) { return l.indOper === '0'; }), saidas: linhas.filter(function(l) { return l.indOper === '1'; }),
      receita: receitaPorCfop(linhas) };
  }
  /* Receita para a Controladoria (industrialização por encomenda, D3 do prompt mestre):
     5124/5125 = industrialização (é receita); 5101/5102… = venda; 5902/5903 = retorno
     simbólico (NUNCA receita); outras saídas (remessa, amostra, devolução de compra) fora. */
  function classeSaida(cfop) {
    var c = String(cfop || '');
    if (CFOP_INDUSTRIALIZACAO[c]) return 'INDUSTRIALIZACAO';
    if (CFOP_SIMBOLICO_SAIDA[c]) return 'SIMBOLICO';
    if (/^[567]1(0[1-9]|1\d|2[0-3])$/.test(c) || /^[567]40[1-5]$/.test(c)) return 'VENDA';
    return 'OUTRAS';
  }
  function receitaPorCfop(linhas) {
    var r = { vendaCentavos: 0, industrializacaoCentavos: 0, simbolicoCentavos: 0, outrasCentavos: 0, porCfop: {} };
    (linhas || []).forEach(function(l) {
      if (l.indOper !== '1' || l.cancelado) return;
      (l.c190 || []).forEach(function(a) {
        var cl = classeSaida(a.cfop), k = { VENDA: 'vendaCentavos', INDUSTRIALIZACAO: 'industrializacaoCentavos', SIMBOLICO: 'simbolicoCentavos', OUTRAS: 'outrasCentavos' }[cl];
        r[k] += a.vOpr; r.porCfop[a.cfop] = (r.porCfop[a.cfop] || 0) + a.vOpr;
      });
    });
    r.receitaCentavos = r.vendaCentavos + r.industrializacaoCentavos;
    return r;
  }
  /* Valor cobrado de uma NF de saída (B1): a fatura do XML quando há; senão, a soma das
     operações que são receita (venda + industrialização). Retorno simbólico nunca entra. */
  function valorCobrado(doc) {
    if (!doc || doc.tipo !== 'NFE') return null;
    var temSimb = (doc.itens || []).some(function(i) { return CFOP_SIMBOLICO_SAIDA[i.cfop]; });
    var dups = (doc.duplicatas || []).reduce(function(s, d) { return s + num(d.valorCentavos); }, 0);
    var receita = (doc.itens || []).reduce(function(s, i) {
      var cl = classeSaida(i.cfop); if (cl !== 'VENDA' && cl !== 'INDUSTRIALIZACAO') return s;
      var ic = i.icms || {}, ip = i.ipi || {};
      return s + num(i.vProd) + i.vFrete + i.vSeg + i.vOutro - i.vDesc + (ic.vICMSST || 0) + (ic.vFCPST || 0) + (ip.vIPI || 0);
    }, 0);
    var fonte, valor;
    if (doc.fatura && doc.fatura.vLiq != null) { valor = doc.fatura.vLiq; fonte = 'FATURA'; }
    else if (dups > 0) { valor = dups; fonte = 'DUPLICATAS'; }
    else if (temSimb) { valor = receita; fonte = 'ITENS_RECEITA'; }
    else { valor = doc.totais.vNF; fonte = 'VNF'; }
    return { valorCentavos: valor, fonte: fonte, temRetornoSimbolico: temSimb, receitaItensCentavos: receita, vNF: doc.totais.vNF };
  }

  /* ── 5. Apuração ──────────────────────────────────────────────────────── */
  // Ajuste E111: COD_AJ_APUR de 8 posições (UF + 0 + utilização + seq). A 4ª posição diz para onde vai.
  function apurarIcms(lv, o) {
    var x = o || {}, deb = 0, cred = 0, aj = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }, incs = [];
    lv.linhas.forEach(function(l) {
      if (l.cancelado) return;
      (l.c190 || []).concat(l.d190 || []).forEach(function(a) { if (ehEntradaCfop(a.cfop)) cred += a.vICMS; else deb += a.vICMS; });
    });
    var ajustes = (x.ajustes || []).filter(function(a) { return a && /^[A-Z]{2}\d{6}$/.test(a.codigo); });
    (x.ajustes || []).forEach(function(a) { if (a && !/^[A-Z]{2}\d{6}$/.test(a.codigo)) inc(incs, true, 'Apuração', a.codigo || '', 'Código de ajuste E111 inválido (8 posições, ex.: SP000207).'); });
    ajustes.forEach(function(a) { var u = a.codigo.charAt(3); if (aj[u] != null) aj[u] += Math.round(num(a.valorCentavos)); else inc(incs, true, 'Apuração', a.codigo, 'Utilização ' + u + ' do código não existe (0 a 5).'); });
    var sldAnt = Math.round(num(x.saldoCredorAnterior));
    var lado1 = deb + aj['0'] + aj['1'], lado2 = cred + aj['2'] + aj['3'] + sldAnt;
    var apurado = Math.max(0, lado1 - lado2), transp = Math.max(0, lado2 - lado1);
    if (aj['4'] > apurado) inc(incs, true, 'Apuração', '', 'Deduções (R$ ' + (aj['4'] / 100).toFixed(2) + ') maiores que o saldo apurado.');
    var recolher = Math.max(0, apurado - aj['4']);
    return { ok: !incs.some(function(i) { return i.impeditivo; }), inconsistencias: incs, ajustes: ajustes,
      e110: { VL_TOT_DEBITOS: deb, VL_AJ_DEBITOS: 0, VL_TOT_AJ_DEBITOS: aj['0'], VL_ESTORNOS_CRED: aj['1'], VL_TOT_CREDITOS: cred, VL_AJ_CREDITOS: 0,
        VL_TOT_AJ_CREDITOS: aj['2'], VL_ESTORNOS_DEB: aj['3'], VL_SLD_CREDOR_ANT: sldAnt, VL_SLD_APURADO: apurado, VL_TOT_DED: aj['4'],
        VL_ICMS_RECOLHER: recolher, VL_SLD_CREDOR_TRANSPORTAR: transp, DEB_ESP: aj['5'] } };
  }
  function apurarIpi(lv, o) {
    var x = o || {}, e510 = {};
    lv.linhas.forEach(function(l) {
      if (l.cancelado || l.tipo === 'CTE') return;
      (l.itens || []).forEach(function(i) {
        var k = i.cfop + '|' + i.cstIpi, a = e510[k] = e510[k] || { cfop: i.cfop, cstIpi: i.cstIpi, vCont: 0, vBC: 0, vIPI: 0 };
        a.vCont += i.vOpr; a.vBC += i.vBCIpi || 0; a.vIPI += i.vIPI || 0;
      });
    });
    var linhas = Object.keys(e510).sort().map(function(k) { return e510[k]; });
    var deb = 0, cred = 0;
    linhas.forEach(function(a) { if (ehEntradaCfop(a.cfop)) cred += a.vIPI; else deb += a.vIPI; });
    var ant = Math.round(num(x.saldoCredorAnterior)), od = Math.round(num(x.outrosDebitos)), oc = Math.round(num(x.outrosCreditos));
    return { e510: linhas, e520: { VL_SD_ANT_IPI: ant, VL_DEB_IPI: deb, VL_CRED_IPI: cred, VL_OD_IPI: od, VL_OC_IPI: oc,
      VL_SC_IPI: Math.max(0, cred + ant + oc - deb - od), VL_SD_IPI: Math.max(0, deb + od - cred - ant - oc) } };
  }

  /* ── 6. Formatação SPED ───────────────────────────────────────────────── */
  function fVal(c) { if (c == null || !isFinite(c)) return ''; var neg = c < 0, a = Math.abs(Math.round(c)); return (neg ? '-' : '') + Math.floor(a / 100) + ',' + ('0' + (a % 100)).slice(-2); }
  function fNum(v, casas) { if (v == null || !isFinite(v)) return ''; return Number(v).toFixed(casas).replace('.', ','); }
  function fData(iso) { var s = String(iso || '').slice(0, 10); return dataOk(s) ? s.slice(8, 10) + s.slice(5, 7) + s.slice(0, 4) : ''; }
  function limpaCampo(v) { return String(v == null ? '' : v).replace(/[|\r\n]+/g, ' ').trim(); }
  function linhaSped(campos) { return '|' + campos.map(limpaCampo).join('|') + '|'; }
  // ISO-8859-1: o que não existe nele vira "?" (o arquivo é baixado em Latin-1 pela tela).
  function latin1(t) { return String(t).replace(/[^\x00-\xFF]/g, function(ch) { var n = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ''; return /^[\x00-\xFF]+$/.test(n) ? n : '?'; }); }
  var INDICADORES_1010 = ['IND_EXP', 'IND_CCRF', 'IND_COMB', 'IND_USINA', 'IND_VA', 'IND_EE', 'IND_CART', 'IND_FORM', 'IND_AER', 'IND_GIAF1', 'IND_GIAF3', 'IND_GIAF4', 'IND_REST_RESSARC_COMPL_ICMS'];

  /* Inconsistências do estabelecimento e do contabilista (as mesmas do WebMais). */
  function inconsistenciasCadastro(est) {
    var incs = [], e = est || {}, ct = e.contabilista || {};
    if (!e.cnpj || !cnpjValido(e.cnpj)) inc(incs, true, 'Estabelecimento', '', 'CNPJ do estabelecimento não informado ou inválido.');
    if (!e.ie) inc(incs, true, 'Estabelecimento', '', 'Inscrição estadual não informada.');
    if (!e.codMun) inc(incs, true, 'Estabelecimento', '', 'Código IBGE do município não informado.');
    if (!e.uf) inc(incs, true, 'Estabelecimento', '', 'UF não informada.');
    if (!e.nome) inc(incs, true, 'Estabelecimento', '', 'Razão social não informada.');
    if (!e.cnae) inc(incs, false, 'Estabelecimento', '', 'CNAE não informado.');
    if (!e.regime) inc(incs, true, 'Estabelecimento', '', 'Regime tributário (NORMAL ou SIMPLES) ainda não definido: decisão do Marlos com o contador.');
    if (!ct.nome) inc(incs, true, 'Contabilista', '', 'Nome do contabilista não informado.');
    if (!ct.cpf) inc(incs, true, 'Contabilista', '', 'CPF do contabilista não informado.');
    else if (!cpfValido(ct.cpf)) inc(incs, true, 'Contabilista', '', 'CPF do contabilista inválido.');
    if (!ct.crc) inc(incs, true, 'Contabilista', '', 'CRC do contabilista não informado.');
    if (!ct.codMun) inc(incs, true, 'Contabilista', '', 'Código IBGE do município do contabilista não informado.');
    if (!ct.email) inc(incs, false, 'Contabilista', '', 'E-mail do contabilista não informado.');
    return incs;
  }

  /* EFD ICMS/IPI. d = {estab, docs, mes, regras, itens, dePara, ajustes, apuracaoAnterior, inventario, codFin, opcoes, cruzamento}
     opcoes: {gerarInventario, c170Propria}. Nada sai com inconsistência impeditiva. */
  function gerarEfd(d) {
    var o = d || {}, est = o.estab || {}, mes = o.mes, op = o.opcoes || {}, incs = [];
    if (!compOk(mes)) return { ok: false, inconsistencias: [{ impeditivo: true, grupo: 'Período', identificador: '', descricao: 'Período inválido.' }], texto: '' };
    var ver = LEIAUTE_EFD[+mes.slice(0, 4)];
    if (!ver) inc(incs, true, 'Leiaute', mes, 'Sem versão de leiaute cadastrada para ' + mes.slice(0, 4) + ' (tabela LEIAUTE_EFD).');
    inconsistenciasCadastro(est).forEach(function(i) { incs.push(i); });
    if (est.regime === 'SIMPLES') inc(incs, false, 'Estabelecimento', '', 'Regime Simples Nacional: em SP a EFD não é obrigatória; o arquivo sai só se o contador pedir.');
    var ctx = { estab: est, regras: o.regras, itens: o.itens, dePara: o.dePara, opcoes: { c170Propria: !!op.c170Propria } };
    var lv = livro(o.docs, mes, ctx);
    lv.inconsistencias.forEach(function(i) { incs.push(i); });
    (o.cruzamento || []).forEach(function(i) { incs.push(i); });
    var ap = apurarIcms(lv, { ajustes: o.ajustes, saldoCredorAnterior: (o.apuracaoAnterior || {}).saldoCredorTransportar });
    ap.inconsistencias.forEach(function(i) { incs.push(i); });
    var api = apurarIpi(lv, { saldoCredorAnterior: (o.apuracaoAnterior || {}).saldoCredorIpi });
    var inv = null;
    var exigeInv = mes.slice(5, 7) === '02';
    if (op.gerarInventario || exigeInv) {
      inv = o.inventario || null;
      if (!inv || !inv.itens) inc(incs, exigeInv, 'Inventário', mes, exigeInv ? 'A EFD de fevereiro exige o inventário de 31/12 (Bloco H): gere-o na aba Inventário.' : 'Marcado "gerar inventário", mas não há inventário gerado.');
      else (inv.inconsistencias || []).forEach(function(i) { incs.push(i); });
    }
    if (est.regime === 'NORMAL' && ap.e110.VL_ICMS_RECOLHER + ap.e110.DEB_ESP > 0 && (!est.codReceitaIcms || !est.diaVencimentoIcms))
      inc(incs, true, 'Apuração', '', 'ICMS a recolher: informe o código de receita e o dia de vencimento (E116) no Estabelecimento.');
    var itensCad = o.itens || {};
    // Cadastros usados (0150, 0190, 0200, 0220): só o que aparece no período.
    var parts = {}, unids = {}, prods = {};
    function usarUn(u) { if (u) unids[String(u).toUpperCase().slice(0, 6)] = 1; }
    lv.linhas.forEach(function(l) {
      if (l.cancelado) return;
      var p = l.participante, cp = codPart(p);
      if (cp) { parts[cp] = p; l.codPart = cp; }
      else if (!l.inut) inc(incs, true, 'Participante', l.numero, 'Documento sem CNPJ/CPF do participante.');
      if (p && !p.codMun && (!p.codPais || p.codPais === '1058')) inc(incs, true, 'Participante', (p.nome || cp || ''), 'Participante sem código de município (IBGE).');
      if (!l.c170) return;
      (l.itens || []).forEach(function(i) {
        var cad = itensCad[String(i.codItem).replace(/[.#$\[\]\/]/g, '_')];
        var pr = prods[i.codItem] = prods[i.codItem] || { codigo: i.codItem, descr: cad ? cad.descr : i.descr, un: cad ? cad.un : i.un, tipoItem: cad ? cad.tipoItem : i.tipoItem,
          ncm: cad ? cad.ncm || i.ncm : i.ncm, cest: cad ? cad.cest || i.cest : i.cest, codBarra: cad ? cad.codBarra : i.codBarra, exIpi: cad ? cad.exIpi : null, conv: {}, auto: !cad && !i.tipoAssumido, assumido: !cad && i.tipoAssumido };
        if (i.un && pr.un && String(i.un).toUpperCase() !== String(pr.un).toUpperCase()) pr.conv[String(i.un).toUpperCase()] = cad && cad.conversoes ? cad.conversoes[String(i.un).toUpperCase()] : null;
        usarUn(i.un); usarUn(pr.un);
      });
    });
    if (inv && inv.itens) inv.itens.forEach(function(i) {
      var cad = itensCad[String(i.codItem).replace(/[.#$\[\]\/]/g, '_')] || {};
      prods[i.codItem] = prods[i.codItem] || { codigo: i.codItem, descr: cad.descr || i.descr, un: cad.un || i.un, tipoItem: cad.tipoItem || i.tipoItem, ncm: cad.ncm || i.ncm, cest: cad.cest, codBarra: cad.codBarra, conv: {}, auto: !cad.descr };
      usarUn(i.un); usarUn(prods[i.codItem].un);
      if (i.indProp !== '0' && i.codPart) parts[i.codPart] = parts[i.codPart] || i.participante || { nome: i.codPart, cnpj: i.codPart };
    });
    Object.keys(prods).forEach(function(k) {
      var p = prods[k];
      if (!p.tipoItem) inc(incs, true, 'Item', k, 'Item sem tipo (0200 TIPO_ITEM): defina na regra de entrada ou em Itens fiscais.');
      if (!p.ncm && /^(0[0-6]|10)$/.test(p.tipoItem || '')) inc(incs, true, 'Item', k, 'Item sem NCM.');
      if (!p.un) inc(incs, true, 'Item', k, 'Item sem unidade.');
      Object.keys(p.conv).forEach(function(u) { if (!(p.conv[u] > 0)) inc(incs, true, 'Item', k, 'Unidade ' + u + ' da nota ≠ unidade de inventário ' + p.un + ': informe o fator de conversão (0220) em Itens fiscais.'); });
      if (p.auto) inc(incs, false, 'Item', k, 'Item do fornecedor sem de-para: usado o código do fornecedor (' + k + ').');
      if (p.assumido) inc(incs, false, 'Item', k, 'Item próprio sem cadastro em Itens fiscais: tipo ' + p.tipoItem + ' (' + TIPOS_ITEM[p.tipoItem] + ') assumido pelo CFOP.');
    });
    var impeditivas = incs.filter(function(i) { return i.impeditivo; });
    incs.forEach(function(i, n) { i.seq = ('00000' + (n + 1)).slice(-6); });
    if (impeditivas.length) return { ok: false, inconsistencias: incs, texto: '', livro: lv, apuracao: ap, apuracaoIpi: api };

    var L = [], cont = {}, ordem = [];
    // Ordem de aparição guardada à parte: objeto JS põe chave numérica ("1001", "9001") na frente.
    function add(campos) { L.push(linhaSped(campos)); if (!cont[campos[0]]) ordem.push(campos[0]); cont[campos[0]] = (cont[campos[0]] || 0) + 1; }
    var dIni = mes + '-01', dFim = ultimoDia(mes), ct = est.contabilista || {};
    // Bloco 0
    add(['0000', ver, o.codFin === 1 ? '1' : '0', fData(dIni), fData(dFim), est.nome, /^[0-9A-Z]{14}$/.test(est.cnpj) ? est.cnpj : '', '', est.uf, est.ie, est.codMun, est.im || '', '', est.perfil || 'A', '0']);
    var ini0 = L.length - 1;
    add(['0001', '0']);
    add(['0002', '00']);
    add(['0005', est.fantasia || est.nome, est.cep || '', est.endereco || '', est.numero || '', est.complemento || '', est.bairro || '', est.fone || '', '', est.email || '']);
    add(['0100', ct.nome, ct.cpf, ct.crc, ct.cnpj || '', ct.cep || '', ct.endereco || '', ct.numero || '', ct.complemento || '', ct.bairro || '', ct.fone || '', '', ct.email || '', ct.codMun]);
    Object.keys(parts).sort().forEach(function(cp) {
      var p = parts[cp], ehCnpj = /^[0-9A-Z]{14}$/.test(cp) && !p.cpf;
      add(['0150', cp, txt(p.nome, 100), p.codPais ? ('0000' + p.codPais).slice(-5) : '01058', ehCnpj ? cp : '', p.cpf || (!ehCnpj && /^\d{11}$/.test(cp) ? cp : ''), p.ie && p.ie !== 'ISENTO' ? p.ie : '', p.codMun || '', '', txt(p.lgr, 60), txt(p.nro, 10), txt(p.cpl, 60), txt(p.bairro, 60)]);
    });
    var DESCR_UN = { UN: 'UNIDADE', KG: 'QUILOGRAMA', G: 'GRAMA', L: 'LITRO', ML: 'MILILITRO', CX: 'CAIXA', PC: 'PECA', PCT: 'PACOTE', M: 'METRO', M2: 'METRO QUADRADO', M3: 'METRO CUBICO', MIL: 'MILHEIRO', RL: 'ROLO', FD: 'FARDO', GL: 'GALAO', TB: 'TAMBOR', BB: 'BOMBONA', SC: 'SACO', KIT: 'KIT', PAR: 'PAR', DZ: 'DUZIA', T: 'TONELADA', FR: 'FRASCO', LT: 'LATA', BD: 'BALDE', UND: 'UNIDADE', UNID: 'UNIDADE' };
    Object.keys(unids).sort().forEach(function(u) { add(['0190', u, DESCR_UN[u] || u]); });
    Object.keys(prods).sort().forEach(function(k) {
      var p = prods[k];
      add(['0200', k, txt(p.descr, 120), p.codBarra || '', '', String(p.un || '').toUpperCase(), p.tipoItem, p.ncm || '', p.exIpi || '', p.ncm && p.tipoItem !== '09' ? p.ncm.slice(0, 2) : '', '', '', p.cest || '']);
      Object.keys(p.conv).sort().forEach(function(u) { add(['0220', u, fNum(p.conv[u], 6), '']); });
    });
    add(['0990', String(L.length - ini0 + 1)]);
    // Bloco B (só DF)
    add(['B001', '1']); add(['B990', '2']);
    // Bloco C
    var docsC = lv.linhas.filter(function(l) { return l.tipo !== 'CTE'; }).sort(function(a, b) { return String(a.data).localeCompare(String(b.data)) || String(a.numero).localeCompare(String(b.numero)); });
    var iniC = L.length;
    add(['C001', docsC.length ? '0' : '1']);
    docsC.forEach(function(l) {
      var serie = l.serie === '0' ? '' : l.serie;
      if (l.cancelado) { add(['C100', l.indOper, l.indEmit, '', l.modelo || '55', l.situacao, serie, l.numero, l.inut ? '' : String(l.chave).split('#')[0], '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']); return; }
      var t = l.totais, dd = l.doc || {};
      var indPgto = dd.indPag === '0' || dd.indPag === '1' ? dd.indPag : ((dd.duplicatas || []).length ? '1' : '2');
      var indFrt = /^[012349]$/.test(dd.modFrete || '') ? dd.modFrete : '9';
      add(['C100', l.indOper, l.indEmit, l.codPart, l.modelo || '55', l.situacao === '00' ? '00' : l.situacao, serie, l.numero, l.chave, fData(dd.emissao), fData(l.indEmit === '1' && l.indOper === '0' ? l.data : (dd.saidaEntrada || dd.emissao)),
        fVal(t.vDoc), indPgto, fVal(t.vDesc), fVal(0), fVal(t.vMerc), indFrt, fVal(t.vFrete), fVal(t.vSeg), fVal(t.vOutro), fVal(t.vBC), fVal(t.vICMS), fVal(t.vBCST), fVal(t.vST), fVal(t.vIPI), fVal(t.vPIS), fVal(t.vCOFINS), '', '']);
      if (l.c170) (l.itens || []).forEach(function(i) {
        add(['C170', String(i.n), i.codItem, '', fNum(i.qtd == null ? 0 : i.qtd, 5), String(i.un || '').toUpperCase(), fVal(i.vItem), fVal(i.vDesc), '0', i.cst, i.cfop, '',
          fVal(i.vBC), fNum(i.aliq, 2), fVal(i.vICMS), fVal(i.vBCST), fNum(i.aliqST, 2), fVal(i.vST), i.vIPI ? '0' : '', i.cstIpi || '', i.vIPI ? (i.cEnq || '999') : '', fVal(i.vBCIpi), fNum(i.aliqIpi, 2), fVal(i.vIPI),
          '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      });
      l.c190.forEach(function(a) {
        add(['C190', a.cst, a.cfop, fNum(a.aliq, 2), fVal(a.vOpr), fVal(a.vBC), fVal(a.vICMS), fVal(a.vBCST), fVal(a.vST), fVal(a.vRedBC), fVal(a.vIPI), '']);
        if (a.vFCP || a.vFCPST) add(['C191', fVal(a.vFCP), fVal(a.vFCPST), fVal(0)]);
      });
    });
    add(['C990', String(L.length - iniC + 1)]);
    // Bloco D
    var docsD = lv.linhas.filter(function(l) { return l.tipo === 'CTE'; });
    var iniD = L.length;
    add(['D001', docsD.length ? '0' : '1']);
    docsD.forEach(function(l) {
      var dd = l.doc, a = (l.d190 || [])[0] || null;
      var indFrt = dd.toma === '0' ? '0' : dd.toma === '3' ? '1' : '2';
      if (l.cancelado) { add(['D100', '0', '1', '', dd.modelo || '57', l.situacao, dd.serie === '0' ? '' : dd.serie, '', dd.numero, l.chave, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']); return; }
      add(['D100', '0', '1', l.codPart, dd.modelo || '57', l.situacao, dd.serie === '0' ? '' : dd.serie, '', dd.numero, l.chave, fData(dd.emissao), fData(l.data), dd.tpCTe || '0', '',
        fVal(dd.totais.vTPrest), fVal(0), indFrt, fVal(dd.totais.vTPrest), fVal(a ? a.vBC : 0), fVal(a ? a.vICMS : 0), fVal(0), '', '', dd.codMunIni || '', dd.codMunFim || '']);
      (l.d190 || []).forEach(function(z) { add(['D190', z.cst, z.cfop, fNum(z.aliq, 2), fVal(z.vOpr), fVal(z.vBC), fVal(z.vICMS), fVal(z.vRedBC), '']); });
    });
    add(['D990', String(L.length - iniD + 1)]);
    // Bloco E
    var iniE = L.length, e = ap.e110;
    add(['E001', '0']);
    add(['E100', fData(dIni), fData(dFim)]);
    add(['E110', fVal(e.VL_TOT_DEBITOS), fVal(e.VL_AJ_DEBITOS), fVal(e.VL_TOT_AJ_DEBITOS), fVal(e.VL_ESTORNOS_CRED), fVal(e.VL_TOT_CREDITOS), fVal(e.VL_AJ_CREDITOS),
      fVal(e.VL_TOT_AJ_CREDITOS), fVal(e.VL_ESTORNOS_DEB), fVal(e.VL_SLD_CREDOR_ANT), fVal(e.VL_SLD_APURADO), fVal(e.VL_TOT_DED), fVal(e.VL_ICMS_RECOLHER), fVal(e.VL_SLD_CREDOR_TRANSPORTAR), fVal(e.DEB_ESP)]);
    ap.ajustes.forEach(function(a) { add(['E111', a.codigo, txt(a.descricao, 200), fVal(Math.round(num(a.valorCentavos)))]); });
    var aRec = e.VL_ICMS_RECOLHER + e.DEB_ESP;
    if (aRec > 0) {
      var prox = somarMes(mes, 1), dia = Math.min(est.diaVencimentoIcms || 20, +ultimoDia(prox).slice(8, 10));
      add(['E116', '000', fVal(aRec), fData(prox + '-' + ('0' + dia).slice(-2)), est.codReceitaIcms || '', '', '', '', '', mes.slice(5, 7) + mes.slice(0, 4)]);
    }
    if (est.contribuinteIpi !== false) {
      add(['E500', '0', fData(dIni), fData(dFim)]);
      api.e510.forEach(function(a) { add(['E510', a.cfop, a.cstIpi, fVal(a.vCont), fVal(a.vBC), fVal(a.vIPI)]); });
      var q = api.e520;
      add(['E520', fVal(q.VL_SD_ANT_IPI), fVal(q.VL_DEB_IPI), fVal(q.VL_CRED_IPI), fVal(q.VL_OD_IPI), fVal(q.VL_OC_IPI), fVal(q.VL_SC_IPI), fVal(q.VL_SD_IPI)]);
    }
    add(['E990', String(L.length - iniE + 1)]);
    // Bloco G (CIAP: fase posterior)
    add(['G001', '1']); add(['G990', '2']);
    // Bloco H
    var iniH = L.length;
    if (inv && inv.itens && inv.itens.length) {
      add(['H001', '0']);
      add(['H005', fData(inv.data), fVal(inv.totalCentavos), inv.motivo || '01']);
      inv.itens.forEach(function(i) { add(['H010', i.codItem, String(i.un || '').toUpperCase(), fNum(i.qtd, 3), fNum(i.vUnit, 6), fVal(i.vItem), i.indProp, i.indProp === '0' ? '' : (i.codPart || ''), '', i.codCta || est.contaContabilEstoque || '', fVal(i.vItem)]); });
    } else add(['H001', '1']);
    add(['H990', String(L.length - iniH + 1)]);
    // Bloco K (só se exigido: Ajuste SINIEF 25/2022)
    add(['K001', '1']); add(['K990', '2']);
    // Bloco 1
    add(['1001', '0']);
    add(['1010'].concat(INDICADORES_1010.map(function() { return 'N'; })));
    add(['1990', '3']);
    // Bloco 9
    var ini9 = L.length;
    add(['9001', '0']);
    var regs = ordem.slice();
    var n9900 = regs.length + 3; // + 9900, 9990, 9999
    regs.forEach(function(r) { L.push(linhaSped(['9900', r, String(cont[r])])); });
    L.push(linhaSped(['9900', '9900', String(n9900)]));
    L.push(linhaSped(['9900', '9990', '1']));
    L.push(linhaSped(['9900', '9999', '1']));
    var lin9 = (L.length - ini9) + 2;
    L.push(linhaSped(['9990', String(lin9)]));
    L.push(linhaSped(['9999', String(L.length + 1)]));
    cont['9900'] = n9900; cont['9990'] = 1; cont['9999'] = 1; ordem.push('9900', '9990', '9999');
    var texto = latin1(L.join('\r\n') + '\r\n');
    var totais = {}; ordem.forEach(function(r) { totais[r] = cont[r]; });
    return { ok: true, texto: texto, inconsistencias: incs, totaisPorRegistro: totais, ordemRegistros: ordem, qtdLinhas: L.length, versaoLeiaute: ver, livro: lv, apuracao: ap, apuracaoIpi: api,
      resumo: { c100: docsC.length, d100: docsD.length, porSituacao: docsC.reduce(function(s, l) { s[l.situacao] = (s[l.situacao] || 0) + 1; return s; }, {}),
        vlDoc: docsC.reduce(function(s, l) { return s + (l.totais ? l.totais.vDoc : 0); }, 0), vlIcms: docsC.reduce(function(s, l) { return s + (l.totais ? l.totais.vICMS : 0); }, 0),
        vlIpi: docsC.reduce(function(s, l) { return s + (l.totais ? l.totais.vIPI : 0); }, 0) } };
  }

  /* ── 7. SINTEGRA (Convênio ICMS 57/95, 126 posições) ─────────────────── */
  function pN(v, n) { var s = String(Math.max(0, Math.round(Math.abs(num(v))))); return s.length > n ? s.slice(-n) : ('0'.repeat(n) + s).slice(-n); }
  function pX(v, n) { var s = latin1(String(v == null ? '' : v)).replace(/[\r\n]/g, ' ').toUpperCase(); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }
  function pD(iso) { return String(iso || '').slice(0, 10).replace(/-/g, '') || '00000000'; }
  // Código do produto no SINTEGRA tem 14 posições: código maior vira um hash estável (mesmo no 54, 74 e 75).
  function codSintegra(c) { var s = String(c || ''); if (s.length <= 14) return s; var h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return ('S' + (h >>> 0).toString(36).toUpperCase() + s.length.toString(36).toUpperCase()).slice(0, 14); }
  function gerarSintegra(d) {
    var o = d || {}, est = o.estab || {}, mes = o.mes, incs = [];
    if (!compOk(mes)) return { ok: false, inconsistencias: [{ impeditivo: true, grupo: 'Período', identificador: '', descricao: 'Período inválido.' }], texto: '' };
    inconsistenciasCadastro(est).filter(function(i) { return i.grupo === 'Estabelecimento'; }).forEach(function(i) { incs.push(i); });
    if (est.regime === 'NORMAL') inc(incs, false, 'Estabelecimento', '', 'Em SP, quem entrega a EFD está dispensado do SINTEGRA (Portaria CAT 32/96, art. 1º-A): gere só se o fisco pedir.');
    var ctx = { estab: est, regras: o.regras, itens: o.itens, dePara: o.dePara, opcoes: { c170Propria: true } };
    var lv = livro(o.docs, mes, ctx);
    lv.inconsistencias.forEach(function(i) { incs.push(i); });
    var inv = o.opcoes && o.opcoes.gerarInventario ? o.inventario : null;
    if (o.opcoes && o.opcoes.gerarInventario && (!inv || !inv.itens)) inc(incs, true, 'Inventário', mes, 'Marcado "gerar inventário", mas não há inventário gerado.');
    incs.forEach(function(i, n) { i.seq = ('00000' + (n + 1)).slice(-6); });
    if (incs.some(function(i) { return i.impeditivo; })) return { ok: false, inconsistencias: incs, texto: '' };
    var L = [], cont = {}, itensCad = o.itens || {}, prods = {};
    function add(tipo, s) { if (s.length !== 126) throw new Error('SINTEGRA ' + tipo + ' com ' + s.length + ' posições'); L.push(s); cont[tipo] = (cont[tipo] || 0) + 1; }
    var ie = function(p) { var v = p && p.ie; return v && v !== 'ISENTO' ? v : 'ISENTO'; };
    add('10', '10' + pX(normCnpj(est.cnpj), 14) + pX(est.ie, 14) + pX(est.nome, 35) + pX(est.municipio, 30) + pX(est.uf, 2) + pN(0, 10) + pD(mes + '-01') + pD(ultimoDia(mes)) + '3' + '3' + String((o.finalidade || 1)));
    add('11', '11' + pX(est.endereco, 34) + pN(est.numero, 5) + pX(est.complemento, 22) + pX(est.bairro, 15) + pN(est.cep, 8) + pX(est.contato || (est.contabilista || {}).nome, 28) + pN(est.fone, 12));
    var docsN = lv.linhas.filter(function(l) { return l.tipo !== 'CTE'; });
    docsN.forEach(function(l) {
      var p = l.participante || {}, cnpj = /^[0-9A-Z]{14}$/.test(normCnpj(p.cnpj)) ? normCnpj(p.cnpj) : pN(p.cpf, 14);
      var data = l.indOper === '0' && l.indEmit === '1' ? l.data : (l.emissao || l.data);
      var serie = pX(l.serie === '0' ? '' : l.serie, 3), numero = pN(l.numero, 6), emit = l.indEmit === '0' ? 'P' : 'T';
      if (l.cancelado) {
        add('50', '50' + pX(l.inut ? est.cnpj : cnpj, 14) + pX(l.inut ? est.ie : ie(p), 14) + pD(data) + pX(l.inut ? est.uf : p.uf, 2) + pN(l.modelo || 55, 2) + serie + numero + pN(0, 4) + emit + pN(0, 13) + pN(0, 13) + pN(0, 13) + pN(0, 13) + pN(0, 13) + pN(0, 4) + (l.situacao === '05' ? '4' : l.situacao === '04' ? '2' : 'S'));
        return;
      }
      l.c190.forEach(function(a) {
        var cst2 = String(a.cst).slice(1), isenta = 0, outras = 0;
        if (a.vICMS) outras = Math.max(0, a.vOpr - a.vBC);
        else if (/^(30|40|41)$/.test(cst2)) isenta = a.vOpr;
        else outras = a.vOpr;
        add('50', '50' + pX(cnpj, 14) + pX(ie(p), 14) + pD(data) + pX(p.uf, 2) + pN(l.modelo || 55, 2) + serie + numero + pN(a.cfop, 4) + emit + pN(a.vOpr, 13) + pN(a.vBC, 13) + pN(a.vICMS, 13) + pN(isenta, 13) + pN(outras, 13) + pN(Math.round(a.aliq * 100), 4) + 'N');
      });
      var porCfopIpi = {};
      (l.itens || []).forEach(function(i) { var z = porCfopIpi[i.cfop] = porCfopIpi[i.cfop] || { v: 0, ipi: 0, isenta: 0, outras: 0 }; z.v += i.vOpr; z.ipi += i.vIPI; if (!i.vIPI) z.outras += i.vOpr; });
      if (est.contribuinteIpi !== false) Object.keys(porCfopIpi).sort().forEach(function(c) { var z = porCfopIpi[c]; add('51', '51' + pX(cnpj, 14) + pX(ie(p), 14) + pD(data) + pX(p.uf, 2) + serie + numero + pN(c, 4) + pN(z.v, 13) + pN(z.ipi, 13) + pN(z.isenta, 13) + pN(z.outras, 13) + pX('', 20) + 'N'); });
      l.c190.forEach(function(a) { if (a.vST) add('53', '53' + pX(cnpj, 14) + pX(ie(p), 14) + pD(data) + pX(p.uf, 2) + pN(l.modelo || 55, 2) + serie + numero + pN(a.cfop, 4) + emit + pN(a.vBCST, 13) + pN(a.vST, 13) + pN(0, 13) + 'N' + ' ' + pX('', 29)); });
      (l.itens || []).forEach(function(i) {
        var cs = codSintegra(i.codItem);
        var cad = itensCad[String(i.codItem).replace(/[.#$\[\]\/]/g, '_')] || {};
        prods[cs] = prods[cs] || { ncm: cad.ncm || i.ncm, descr: cad.descr || i.descr, un: cad.un || i.un, aliqIcms: i.aliq, aliqIpi: i.aliqIpi, pRedBC: i.pRedBC };
        add('54', '54' + pX(cnpj, 14) + pN(l.modelo || 55, 2) + serie + numero + pN(i.cfop, 4) + pX(i.cst, 3) + pN(i.n, 3) + pX(cs, 14) + pN(Math.round((i.qtd || 0) * 1000), 11) + pN(i.vItem, 12) + pN(i.vDesc, 12) + pN(i.vBC, 12) + pN(i.vBCST, 12) + pN(i.vIPI, 12) + pN(Math.round(i.aliq * 100), 4));
      });
      var dd = l.doc || {}, t = dd.totais || {};
      [['991', t.vFrete], ['992', t.vSeg], ['999', t.vOutro]].forEach(function(z) {
        if (z[1]) add('54', '54' + pX(cnpj, 14) + pN(l.modelo || 55, 2) + serie + numero + pN(l.c190[0] ? l.c190[0].cfop : 0, 4) + pX('', 3) + z[0] + pX('', 14) + pN(0, 11) + pN(0, 12) + pN(z[1], 12) + pN(0, 12) + pN(0, 12) + pN(0, 12) + pN(0, 4));
      });
    });
    lv.linhas.filter(function(l) { return l.tipo === 'CTE'; }).forEach(function(l) {
      var p = l.participante || {}, dd = l.doc, a = (l.d190 || [])[0] || { cfop: 0, vBC: 0, vICMS: 0, aliq: 0 };
      var outras = Math.max(0, dd.totais.vTPrest - a.vBC);
      add('70', '70' + pX(normCnpj(p.cnpj), 14) + pX(ie(p), 14) + pD(dd.emissao) + pX(p.uf, 2) + pN(dd.modelo || 57, 2) + pX(dd.serie === '0' ? '' : dd.serie, 1) + pX('', 2) + pN(dd.numero, 6) + pN(a.cfop, 4) + pN(dd.totais.vTPrest, 13) + pN(a.vBC, 14) + pN(a.vICMS, 14) + pN(0, 14) + pN(outras, 14) + (dd.toma === '3' ? '2' : '1') + (l.cancelado ? 'S' : 'N'));
    });
    if (inv && inv.itens) inv.itens.forEach(function(i) {
      var cs = codSintegra(i.codItem), cad = itensCad[String(i.codItem).replace(/[.#$\[\]\/]/g, '_')] || {};
      prods[cs] = prods[cs] || { ncm: cad.ncm || i.ncm, descr: cad.descr || i.descr, un: cad.un || i.un, aliqIcms: cad.aliqIcms || 0, aliqIpi: 0, pRedBC: 0 };
      var posse = i.indProp === '0' ? '1' : i.indProp === '1' ? '2' : '3';
      var dono = posse === '1' ? { cnpj: '', ie: '', uf: '' } : (i.participante || { cnpj: i.codPart });
      add('74', '74' + pD(inv.data) + pX(cs, 14) + pN(Math.round(i.qtd * 1000), 13) + pN(i.vItem, 13) + posse + (posse === '1' ? pN(0, 14) : pX(normCnpj(dono.cnpj), 14)) + pX(posse === '1' ? '' : (dono.ie || 'ISENTO'), 14) + pX(posse === '1' ? est.uf : dono.uf, 2) + pX('', 45));
    });
    Object.keys(prods).sort().forEach(function(cs) {
      var p = prods[cs];
      add('75', '75' + pD(mes + '-01') + pD(ultimoDia(mes)) + pX(cs, 14) + pX(p.ncm, 8) + pX(p.descr, 53) + pX(p.un, 6) + pN(Math.round((p.aliqIpi || 0) * 100), 5) + pN(Math.round((p.aliqIcms || 0) * 100), 4) + pN(Math.round((p.pRedBC || 0) * 100), 5) + pN(0, 13));
    });
    // 90: totalizadores por tipo (50 a 88) + "99" com o total de linhas do arquivo.
    var tipos = Object.keys(cont).filter(function(t) { return t !== '10' && t !== '11'; }).sort();
    var pares = tipos.map(function(t) { return t + pN(cont[t], 8); });
    var n90 = Math.ceil((pares.length + 1) / 9) || 1;
    var total = L.length + n90;
    pares.push('99' + pN(total, 8));
    for (var i = 0; i < n90; i++) {
      var pp = pares.slice(i * 9, i * 9 + 9).join('');
      var s = '90' + pX(est.cnpj, 14) + pX(est.ie, 14) + pp + ' '.repeat(95 - pp.length) + String(n90);
      add('90', s);
    }
    return { ok: true, texto: L.join('\r\n') + '\r\n', inconsistencias: incs, totaisPorRegistro: cont, qtdLinhas: L.length, livro: lv };
  }

  /* ── 8. Inventário (Bloco H / registro 74) ────────────────────────────── */
  /* Retrato do estoque numa data: material próprio (IND_PROP 0) a custo (Custos);
     material de cliente (IND_PROP 2, de terceiro em poder da empresa) pelo valor da
     NF de remessa 1901/1924 (média ponderada por cliente × item). Quantidade ausente,
     negativa ou sem preço é inconsistência, nunca zero.
     e = {data, estoque, materiais, precos (custos_precos), clientes, docs, dePara, itens, estab} */
  function montarInventario(e) {
    var x = e || {}, incs = [], itens = [], est = x.estab || {};
    if (!dataOk(x.data)) return { ok: false, inconsistencias: [{ impeditivo: true, grupo: 'Inventário', identificador: '', descricao: 'Data do inventário inválida.' }] };
    var materiais = x.materiais || {}, precos = x.precos || {}, clientes = x.clientes || {};
    // Valor da remessa por cliente × material (NF 1901/1924 com de-para para o material).
    var itemParaMaterial = {}, materialParaItem = {};
    Object.keys(x.itens || {}).forEach(function(k) { var it = x.itens[k]; if (it && it.material) { itemParaMaterial[it.codigo || k] = it.material; materialParaItem[it.material] = materialParaItem[it.material] || it; } });
    var remessa = {};
    Object.keys(x.docs || {}).forEach(function(k) {
      var d = x.docs[k]; if (!d || d.tipo !== 'NFE' || d.situacao !== '00') return;
      var cnpjCli = normCnpj(d.emitente && d.emitente.cnpj);
      (d.itens || []).forEach(function(it) {
        if (!/^[56]9(01|24)$/.test(it.cfop || '')) return;
        var dp = buscarDePara(x.dePara, cnpjCli, it.cProd);
        var mat = dp && itemParaMaterial[dp.item];
        if (!mat || !(it.qCom > 0)) return;
        var kk = cnpjCli + '|' + mat, r = remessa[kk] = remessa[kk] || { q: 0, v: 0 };
        r.q += it.qCom * (num(dp.fator) || 1); r.v += num(it.vProd);
      });
    });
    var cliPorKey = {};
    Object.keys(clientes).forEach(function(k) { cliPorKey[k] = clientes[k]; });
    var total = 0;
    Object.keys(x.estoque || {}).sort().forEach(function(mk) {
      // O item fiscal ligado ao material (Itens fiscais) dá o código do 0200/H010 e o NCM.
      var s = x.estoque[mk] || {}, m = materiais[mk] || {}, itf = materialParaItem[mk] || null, cod = itf ? itf.codigo : (m.mpCodigo || mk);
      var totalFis = num(s.saldoAtual), partes = 0;
      Object.keys(s.porCliente || {}).forEach(function(ck) {
        var q = num((s.porCliente[ck] || {}).saldoAtual); if (!q) return;
        partes += q;
        var cli = cliPorKey[ck] || {}, cnpj = normCnpj(cli.cnpj);
        if (q < 0) { inc(incs, true, 'Inventário', cod, 'Saldo negativo do cliente ' + (cli.nome || ck) + ' (' + q + ').'); return; }
        if (!cnpj) inc(incs, true, 'Inventário', cod, 'Cliente ' + (cli.nome || ck) + ' sem CNPJ no cadastro (COD_PART do H010).');
        var r = remessa[cnpj + '|' + mk];
        if (!r || !(r.q > 0)) { inc(incs, true, 'Inventário', cod, 'Material do cliente ' + (cli.nome || ck) + ' sem NF de remessa (1901/1924) com de-para: valor do item não medido.'); return; }
        var vu = r.v / 100 / r.q, vi = Math.round(vu * q * 100);
        itens.push({ codItem: cod, descr: (itf && itf.descr) || m.nome || m.descricao || cod, un: String((itf && itf.un) || m.unidade || '').toUpperCase(), ncm: itf ? itf.ncm : null, qtd: q, vUnit: Math.round(vu * 1e6) / 1e6, vItem: vi, indProp: '2', codPart: cnpj,
          participante: { cnpj: cnpj, nome: cli.nome || ck, ie: cli.ie || null, uf: cli.uf || null }, material: mk, tipoItem: tipoDoMaterial(m) });
        total += vi;
      });
      var proprio = Math.round((totalFis - partes) * 1e4) / 1e4;
      if (!proprio) return;
      if (proprio < 0) { inc(incs, true, 'Inventário', cod, 'Saldo próprio negativo (' + proprio + '): o estoque ainda não serve para o inventário (Dia D).'); return; }
      var p = precos[mk];
      if (!p || !(num(p.valor) > 0)) { inc(incs, true, 'Inventário', cod, 'Material sem preço em Custos: valor do inventário não medido (nunca zero).'); return; }
      if (p.unidade && m.unidade && String(p.unidade).toUpperCase() !== String(m.unidade).toUpperCase()) inc(incs, true, 'Inventário', cod, 'Preço em ' + p.unidade + ' e estoque em ' + m.unidade + ': converta antes.');
      var vi2 = Math.round(num(p.valor) * proprio * 100);
      itens.push({ codItem: cod, descr: (itf && itf.descr) || m.nome || m.descricao || cod, un: String((itf && itf.un) || m.unidade || '').toUpperCase(), ncm: itf ? itf.ncm : null, qtd: proprio, vUnit: Math.round(num(p.valor) * 1e6) / 1e6, vItem: vi2, indProp: '0', codPart: null, material: mk, tipoItem: tipoDoMaterial(m), fontePreco: p.fonte || null });
      total += vi2;
    });
    if (!itens.length) inc(incs, true, 'Inventário', x.data, 'Nenhum item com saldo: o estoque ainda não tem saldo de abertura (Dia D).');
    if (!est.contaContabilEstoque) inc(incs, false, 'Inventário', '', 'Conta contábil do estoque (H010 COD_CTA) não informada no Estabelecimento.');
    itens.forEach(function(i) {
      if (!i.un) inc(incs, true, 'Inventário', i.codItem, 'Material sem unidade no cadastro.');
      if (!i.ncm) inc(incs, true, 'Inventário', i.codItem, 'Material sem item fiscal com NCM: ligue-o em Itens fiscais (campo Material).');
    });
    return { ok: !incs.some(function(i) { return i.impeditivo; }), data: x.data, motivo: '01', itens: itens, totalCentavos: total, inconsistencias: incs, versaoMotor: VERSAO };
  }
  function tipoDoMaterial(m) {
    var t = String((m && m.tipo) || '').toUpperCase();
    return { MPGR: '01', MPES: '01', EP: '02', ES: '02', ET: '02', MU: '07', MN: '07', PA: '04', SKU: '04', GRANEL: '03' }[t] || '10';
  }

  /* ── 9. Conferências ──────────────────────────────────────────────────── */
  // §15.6: saldo físico de terceiro × Σ entradas 1901/1924 − Σ saídas 5902/5903 do cliente (aviso).
  function conferenciaTerceiros(docs, estoque, clientes, dePara, itens) {
    var mov = {}, incs = [], itemParaMaterial = {};
    Object.keys(itens || {}).forEach(function(k) { var it = itens[k]; if (it && it.material) itemParaMaterial[it.codigo || k] = it.material; });
    var cliPorCnpj = {};
    Object.keys(clientes || {}).forEach(function(k) { var c = normCnpj((clientes[k] || {}).cnpj); if (c) cliPorCnpj[c] = k; });
    Object.keys(docs || {}).forEach(function(k) {
      var d = docs[k]; if (!d || d.tipo !== 'NFE' || d.situacao !== '00') return;
      var emit = normCnpj(d.emitente && d.emitente.cnpj), dest = normCnpj(d.destinatario && d.destinatario.cnpj);
      (d.itens || []).forEach(function(it) {
        var ent = /^[56]9(01|24)$/.test(it.cfop || ''), sai = /^[56]90[23]$/.test(it.cfop || '');
        if (!ent && !sai) return;
        var cli = ent ? emit : dest, dp = ent ? buscarDePara(dePara, emit, it.cProd) : null;
        var mat = ent ? (dp && itemParaMaterial[dp.item]) : itemParaMaterial[it.cProd];
        if (!mat || !cliPorCnpj[cli]) return;
        var kk = cliPorCnpj[cli] + '|' + mat;
        mov[kk] = (mov[kk] || 0) + (ent ? 1 : -1) * num(it.qCom) * (dp ? num(dp.fator) || 1 : 1);
      });
    });
    var linhas = [];
    Object.keys(mov).forEach(function(kk) {
      var p = kk.split('|'), fis = num((((estoque || {})[p[1]] || {}).porCliente || {})[p[0]] && estoque[p[1]].porCliente[p[0]].saldoAtual);
      var dif = Math.round((fis - mov[kk]) * 1e4) / 1e4;
      linhas.push({ cliente: p[0], material: p[1], fiscal: mov[kk], fisico: fis, diferenca: dif });
      if (dif) inc(incs, false, 'Material de terceiro', ((clientes[p[0]] || {}).nome || p[0]) + ' × ' + p[1], 'Saldo físico ' + fis + ' ≠ notas (entradas − retornos) ' + mov[kk] + '.');
    });
    return { linhas: linhas, inconsistencias: incs };
  }
  /* Cruzamento com os outros módulos (só leitura): NF registrada no Faturamento sem XML
     no Fiscal (impeditivo: falta a saída no SPED), nota do Financeiro sem documento fiscal
     e recebimento de Compras sem XML (avisos). */
  function cruzamentos(b, mes) {
    var x = b || {}, docs = x.docs || {}, incs = [], porChave = {}, porForn = {};
    Object.keys(docs).forEach(function(k) {
      var d = docs[k]; if (!d || !d.chave) return; porChave[d.chave] = d;
      if (d.tipo === 'NFE') porForn[normCnpj(d.emitente && d.emitente.cnpj) + '|' + d.numero] = d;
    });
    Object.keys(x.agendamentos_expedicao || {}).forEach(function(a) {
      var nfs = (((x.agendamentos_expedicao[a] || {}).faturamento) || {}).nfs || {};
      Object.keys(nfs).forEach(function(k) {
        var n = nfs[k] || {}, dt = String(n.emitidaEm || '').slice(0, 7);
        if (dt !== mes) return;
        var ch = normChaveNfe(n.chaveNfe);
        if (!ch) inc(incs, false, 'Faturamento', 'NF ' + (n.numero || k), 'NF registrada sem chave de acesso válida: não dá para conferir com o XML.');
        else if (!porChave[ch]) inc(incs, true, 'Faturamento', 'NF ' + semZeros(ch.slice(25, 34)), 'NF de saída registrada no Faturamento sem XML no Fiscal: importe o XML exportado do emissor.');
        else if (porChave[ch].totais && n.valor != null && Math.round(num(n.valor) * 100) !== porChave[ch].totais.vNF)
          inc(incs, false, 'Faturamento', 'NF ' + semZeros(ch.slice(25, 34)), 'Valor digitado no Faturamento (R$ ' + num(n.valor).toFixed(2) + ') ≠ XML (R$ ' + (porChave[ch].totais.vNF / 100).toFixed(2) + ').');
      });
    });
    Object.keys(x.notas_entrada || {}).forEach(function(k) {
      var n = x.notas_entrada[k] || {};
      if (String(n.emissao || '').slice(0, 7) === mes && !porChave[n.chave]) inc(incs, false, 'Financeiro', 'NF ' + n.numero, 'Nota do Financeiro sem documento fiscal.');
    });
    var forns = x.fornecedores || {};
    Object.keys(x.pedidos_compra || {}).forEach(function(pk) {
      var pc = x.pedidos_compra[pk] || {}, cnpj = normCnpj((forns[pc.fornecedorKey] || {}).cnpj);
      Object.keys(pc.recebimentos || {}).forEach(function(rk) {
        var r = pc.recebimentos[rk] || {};
        if (r.status === 'CANCELADO' || String(r.dataRecebimento || r.data || r.criadoEm || '').slice(0, 7) !== mes) return;
        var nums = (String(r.notaFiscal || '').match(/\d+/g) || []).map(semZeros);
        if (!nums.length) return;
        if (!nums.some(function(nn) { return porForn[cnpj + '|' + nn]; })) inc(incs, false, 'Compras', 'PC ' + (pc.numeroFormatado || pc.numero || pk) + ' NF ' + nums.join('/'), 'Recebimento sem XML da nota no Fiscal.');
      });
    });
    return incs;
  }

  /* ── 10. Livro em CSV (conferência e Domínio) ────────────────────────── */
  function livroCsv(lv) {
    var cab = 'Livro;Data;Modelo;Série;Número;Chave;Participante;CNPJ/CPF;Situação;CFOP;CST;Alíquota;Valor contábil;Base ICMS;ICMS;Base ST;ICMS ST;IPI';
    var v = function(c) { return (num(c) / 100).toFixed(2).replace('.', ','); };
    var linhas = [cab];
    lv.linhas.forEach(function(l) {
      var p = l.participante || {};
      var grupos = l.cancelado ? [{ cfop: '', cst: '', aliq: 0, vOpr: 0, vBC: 0, vICMS: 0, vBCST: 0, vST: 0, vIPI: 0 }] : (l.c190 || l.d190 || []);
      grupos.forEach(function(a) {
        linhas.push([l.indOper === '0' ? 'Entradas' : 'Saídas', String(l.data || '').split('-').reverse().join('/'), l.modelo, l.serie, l.numero, String(l.chave).split('#')[0],
          '"' + String(p.nome || '').replace(/"/g, '""') + '"', normCnpj(p.cnpj) || p.cpf || '', l.situacao, a.cfop, a.cst, String(a.aliq || 0).replace('.', ','),
          v(a.vOpr), v(a.vBC), v(a.vICMS), v(a.vBCST), v(a.vST), v(a.vIPI)].join(';'));
      });
    });
    return linhas.join('\r\n') + '\r\n';
  }

  return {
    VERSAO: VERSAO, LEIAUTE_EFD: LEIAUTE_EFD, CNPJ_KURYOS: CNPJ_KURYOS, TIPOS_ITEM: TIPOS_ITEM, INDICADORES_1010: INDICADORES_1010,
    CFOP_SIMBOLICO_SAIDA: CFOP_SIMBOLICO_SAIDA, CFOP_INDUSTRIALIZACAO: CFOP_INDUSTRIALIZACAO, CFOP_ENCOMENDA_ENTRADA: CFOP_ENCOMENDA_ENTRADA,
    normCnpj: normCnpj, cnpjValido: cnpjValido, cpfValido: cpfValido, normChaveNfe: normChaveNfe, chaveDvOk: chaveDvOk, decCentavos: decCentavos,
    lerXml: lerXml, lerNfeCompleta: lerNfeCompleta, lerCte: lerCte, lerEvento: lerEvento, lerInutilizacao: lerInutilizacao,
    relativo: relativo, dataEscrituracao: dataEscrituracao, mesDoDocumento: mesDoDocumento,
    sugerirRegra: sugerirRegra, regraDoItem: regraDoItem, validarRegra: validarRegra, validarItem: validarItem, validarDePara: validarDePara,
    validarEstabelecimento: validarEstabelecimento, chaveDePara: chaveDePara, buscarDePara: buscarDePara, chaveItem: chaveItem, cstIcms: cstIcms,
    escriturar: escriturar, livro: livro, classeSaida: classeSaida, receitaPorCfop: receitaPorCfop, valorCobrado: valorCobrado,
    apurarIcms: apurarIcms, apurarIpi: apurarIpi, inconsistenciasCadastro: inconsistenciasCadastro,
    gerarEfd: gerarEfd, gerarSintegra: gerarSintegra, codSintegra: codSintegra, montarInventario: montarInventario, tipoDoMaterial: tipoDoMaterial,
    conferenciaTerceiros: conferenciaTerceiros, cruzamentos: cruzamentos, livroCsv: livroCsv, latin1: latin1, fVal: fVal, linhaSped: linhaSped
  };
});
