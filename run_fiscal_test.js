'use strict';
/* Fiscal — motor (public/shared/fiscal.js): leitura de XML, regras de entrada, escrituração,
   livro, apuração, EFD ICMS/IPI, SINTEGRA, inventário e industrialização por encomenda.
   XMLs em test-fixtures/fiscal-xml.js (leiaute oficial, dados fictícios: a base ainda não
   tem XML real — medido em 17/11/2026). A validação de verdade é o PVA (PROMPT_FISCAL.md §12). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Fis = require('./public/shared/fiscal');
const X = require('./test-fixtures/fiscal-xml');

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

eq(fs.readFileSync('public/shared/fiscal.js', 'utf8'), fs.readFileSync('functions/fiscal.js', 'utf8'), 'motor fiscal igual em public/ e functions/');
// As funções de CNPJ são as mesmas do Financeiro (B0).
const Fin = require('./public/shared/financeiro');
['12.ABC.345/01DE-35', '00.767.554/0001-19', 'ISENTO', '123.456.789-09'].forEach((c) => eq(Fis.normCnpj(c), Fin.normCnpj(c), 'normCnpj igual ao Financeiro: ' + c));

const ESTAB = { cnpj: X.KURYOS.cnpj, ie: X.KURYOS.ie, nome: X.KURYOS.nome, uf: 'SP', codMun: '3550308', municipio: 'SAO PAULO', cnae: '2063100', regime: 'NORMAL', perfil: 'A',
  contribuinteIpi: true, codReceitaIcms: '046-2', diaVencimentoIcms: 20, cep: '08270000', endereco: 'RUA LAGOA TAI GRANDE', numero: '1130', bairro: 'VILA CARMOZINA', contaContabilEstoque: '1.1.4.01',
  contabilista: { nome: 'CONTADOR TESTE', cpf: '52998224725', crc: 'SP123456O8', codMun: '3550308', email: 'c@x.com' } };
const M = X.mesDeTeste();

// ── 1. Leitura ─────────────────────────────────────────────────────────────
const lido = Fis.lerXml(M.compraMp.xml);
ok(lido.ok && lido.tipo === 'NFE', 'NF-e lida');
const d1 = lido.doc;
eq(d1.chave, M.compraMp.chave, 'chave');
ok(Fis.chaveDvOk(d1.chave), 'DV da chave confere');
ok(!Fis.chaveDvOk(d1.chave.slice(0, 43) + ((+d1.chave[43] + 1) % 10)), 'DV errado é detectado');
eq(d1.numero, '376202', 'número sem zeros');
eq(d1.situacao, '00', 'protocolo 100 → regular');
eq(d1.emitente.ie, X.FORN_SP.ie, 'IE do emitente vem do XML');
eq(d1.emitente.codMun, '3550308', 'código IBGE do município vem do XML');
eq(d1.itens[0].ncm, '39233000', 'NCM do item');
eq(d1.itens[0].icms.cst, '00', 'CST');
eq(d1.itens[0].icms.vICMS, 153000, 'ICMS do item em centavos');
eq(d1.itens[0].ipi.vIPI, 42500, 'IPI do item');
eq(d1.totais.vNF, M.compraMp.vNF, 'vNF');
eq(d1.totais.vFrete, 15000, 'frete');
eq(Fis.lerXml(M.simples.xml).doc.itens[0].icms.csosn, '101', 'Simples: CSOSN');
eq(Fis.lerXml(M.simples.xml).doc.itens[0].icms.vCredICMSSN, 5000, 'Simples: crédito do SN');
const semProt = Fis.lerXml(X.nfe({ emit: X.FORN_SP, dest: X.KURYOS, n: 1, data: '2026-11-03', cStat: null, itens: [{ cProd: 'A', xProd: 'A', ncm: '39233000', cfop: '5101', un: 'UN', q: 1, vUn: 1 }] }).xml);
eq(semProt.doc.situacao, 'SEM_PROTOCOLO', 'XML sem nfeProc fica marcado');
ok(semProt.avisos.some((a) => /protocolo/.test(a)), 'e avisa');
const ev = Fis.lerXml(M.cancelamento);
ok(ev.ok && ev.tipo === 'EVENTO' && ev.evento.tpEvento === '110111' && ev.evento.registrado, 'evento de cancelamento');
const cce = Fis.lerXml(M.cce);
eq(cce.evento.tpEvento, '110110', 'carta de correção');
const inu = Fis.lerXml(M.inut);
ok(inu.ok && inu.inut.ini === 473 && inu.inut.fim === 474, 'inutilização 473–474');
const ct = Fis.lerXml(M.frete.xml);
ok(ct.ok && ct.tipo === 'CTE', 'CT-e lido');
eq(ct.doc.totais.vICMS, 1800, 'ICMS do CT-e');
eq(ct.doc.toma, '3', 'tomador = destinatário');
ok(!Fis.lerXml('<x/>').ok, 'arquivo qualquer é recusado');
ok(/NF3e/.test(Fis.lerXml('<NF3e><infNF3e/></NF3e>').motivo), 'NF3e (energia) recusada com o motivo (P4)');
// CNPJ alfanumérico do fornecedor
const ALFA = { cnpj: '12ABC34501DE35', ie: '110042490114', nome: 'FORNECEDOR ALFA', uf: 'SP', cMun: '3550308', xMun: 'SAO PAULO', lgr: 'R', nro: '1', bairro: 'B', cep: '01000000' };
const alfa = X.nfe({ emit: ALFA, dest: X.KURYOS, n: 77, data: '2026-11-08', itens: [{ cProd: 'Z', xProd: 'Z', ncm: '39233000', cfop: '5101', un: 'UN', q: 1, vUn: 10 }] });
const la = Fis.lerXml(alfa.xml);
ok(la.ok && la.doc.emitente.cnpj === '12ABC34501DE35' && /12ABC34501DE35/.test(la.doc.chave), 'CNPJ alfanumérico no emitente e na chave');
ok(Fis.chaveDvOk(la.doc.chave), 'DV da chave alfanumérica (ASCII − 48)');

// ── 2. Relativo à empresa ─────────────────────────────────────────────────
const r1 = Fis.relativo(d1, ESTAB.cnpj);
ok(r1.ok && r1.indEmit === '1' && r1.indOper === '0', 'compra: terceiros, entrada');
eq(r1.participante.cnpj, X.FORN_SP.cnpj, 'participante = emitente');
const rs = Fis.relativo(Fis.lerXml(M.venda.xml).doc, ESTAB.cnpj);
ok(rs.indEmit === '0' && rs.indOper === '1' && rs.participante.cnpj === X.CLIENTE.cnpj, 'venda: própria, saída, participante = cliente');
ok(!Fis.relativo(d1, '11111111000191').ok, 'nota de outra empresa é recusada');
const naoTomador = X.cte({ emit: X.TRANSP, rem: X.KURYOS, dest: X.CLIENTE, n: 5, data: '2026-11-10', valor: 1000, toma: '3' });
ok(/não é a tomadora/.test(Fis.relativo(Fis.lerXml(naoTomador.xml).doc, ESTAB.cnpj).motivo), 'CT-e em que a Kuryos não é tomadora não se escritura');

// ── 3. Regras de entrada ──────────────────────────────────────────────────
const sug = (c, t, reg) => Fis.sugerirRegra(c, t, reg || 'NORMAL');
eq(sug('5101', '01').cfopEntrada, '1101', '5101 → 1101 (compra para industrialização)');
ok(sug('5101', '01').creditaICMS && sug('5101', '01').creditaIPI, '1101 credita ICMS e IPI');
eq(sug('6101', '01').cfopEntrada, '2101', '6101 → 2101');
eq(sug('5102', '07').cfopEntrada, '1556', 'uso e consumo → 1556');
ok(!sug('5102', '07').creditaICMS, '1556 sem crédito');
eq(sug('6102', '08').cfopEntrada, '2551', 'ativo → 2551');
eq(sug('5901').cfopEntrada, '1901', '5901 → 1901 (encomenda)');
ok(!sug('5901').creditaICMS && sug('5901').propriedade === 'CLIENTE', '1901: sem crédito, material do cliente');
eq(sug('5924').cfopEntrada, '1924', '5924 → 1924 (conta e ordem)');
eq(sug('6924').cfopEntrada, '2924', '6924 → 2924');
eq(sug('5124').cfopEntrada, '1124', '5124 → 1124');
eq(sug('5902').cfopEntrada, '1902', '5902 → 1902');
eq(sug('5353').cfopEntrada, '1352', 'frete (CT-e 5353) → 1352');
eq(sug('5405', '01').cfopEntrada, '1401', 'ST → 1401');
ok(!sug('5101', '01', 'SIMPLES').creditaICMS, 'Simples Nacional: sem crédito');
eq(sug('1101'), null, 'CFOP de entrada não gera sugestão');
const vr = Fis.validarRegra(sug('5101', '01'));
ok(vr.ok && vr.id === '5101', 'regra válida, id = CFOP');
ok(!Fis.validarRegra({ cfopOrigem: '5101', cfopEntrada: '2101' }).ok, 'interno → entrada interestadual recusada');
ok(Fis.validarRegra(Object.assign({}, sug('5101', '01'), { variante: 'a' })).id === '5101-A', 'variante "1.101-A" do WebMais');
const regrasEsp = { '5101': { cfopOrigem: '5101', cfopEntrada: '1101', geraLivro: true }, '5101-F': { cfopOrigem: '5101', cfopEntrada: '1556', geraLivro: true, fornecedor: X.FORN_SP.cnpj } };
eq(Fis.regraDoItem(regrasEsp, '5101', { fornecedor: X.FORN_SP.cnpj }).cfopEntrada, '1556', 'regra do fornecedor vence a geral');
eq(Fis.regraDoItem(regrasEsp, '5101', { fornecedor: X.FORN_PR.cnpj }).cfopEntrada, '1101', 'outro fornecedor: regra geral');
eq(Fis.regraDoItem(regrasEsp, '5949', {}), null, 'sem regra → null');

// ── 4. Montagem do mês ────────────────────────────────────────────────────
function montarDocs(mes) {
  const docs = {};
  Object.keys(mes).forEach((k) => {
    const v = mes[k], r = Fis.lerXml(typeof v === 'string' ? v : v.xml);
    if (r.tipo === 'EVENTO') { const d = docs[r.evento.chave]; if (d && r.evento.tpEvento === '110111') d.situacao = '02'; return; }
    if (r.tipo === 'INUT') { docs[r.inut.chave] = Object.assign({ tipo: 'INUT' }, r.inut); return; }
    docs[r.doc.chave] = Fis.relativo(r.doc, ESTAB.cnpj);
  });
  return docs;
}
const docs = montarDocs(M);
const REGRAS = {};
[['5101', '01'], ['6101', '01'], ['5102', '07'], ['5901', '01'], ['5353', '09']].forEach(([c, t]) => { const v = Fis.validarRegra(sug(c, t)); REGRAS[v.id] = v.registro; });

// Sem regra: a mesma mensagem do WebMais, e o arquivo não sai.
const semRegra = Fis.gerarEfd({ estab: ESTAB, docs, mes: '2026-11', regras: {}, itens: {}, dePara: {} });
ok(!semRegra.ok && semRegra.texto === '', 'sem regra de entrada nada sai pela metade');
ok(semRegra.inconsistencias.some((i) => i.impeditivo && /Todas as CFOPs dos itens devem estar definidas para gerar livro/.test(i.descricao)), 'inconsistência igual à do WebMais (CFOP sem "gera livro")');
// Contabilista sem CPF/CRC: as duas primeiras inconsistências do WebMais.
const semCont = Fis.gerarEfd({ estab: Object.assign({}, ESTAB, { contabilista: { nome: 'X', codMun: '3550308' } }), docs, mes: '2026-11', regras: REGRAS });
ok(semCont.inconsistencias.some((i) => i.descricao === 'CPF do contabilista não informado.') && semCont.inconsistencias.some((i) => i.descricao === 'CRC do contabilista não informado.'), 'contabilista sem CPF/CRC (como no WebMais)');
ok(semCont.inconsistencias.every((i) => /^\d{6}$/.test(i.seq) && 'grupo' in i && 'identificador' in i), 'colunas Seq/Grupo/Identificador/Descrição');
const semRegime = Fis.gerarEfd({ estab: Object.assign({}, ESTAB, { regime: null }), docs, mes: '2026-11', regras: REGRAS });
ok(semRegime.inconsistencias.some((i) => i.impeditivo && /Regime tributário/.test(i.descricao)), 'regime não decidido é impeditivo (D1: parâmetro, nunca suposição)');

// ── 5. EFD completa ───────────────────────────────────────────────────────
const efd = Fis.gerarEfd({ estab: ESTAB, docs, mes: '2026-11', regras: REGRAS, itens: {}, dePara: {}, ajustes: [{ codigo: 'SP020799', descricao: 'Outros créditos', valorCentavos: 10000 }] });
ok(efd.ok, 'EFD gerada: ' + efd.inconsistencias.filter((i) => i.impeditivo).map((i) => i.descricao).join(' | '));
const T = efd.texto, linhas = T.split('\r\n').filter(Boolean);
ok(T.endsWith('\r\n') && !/[^\r]\n/.test(T), 'CRLF em todas as linhas');
ok(linhas.every((l) => /^\|[0-9A-Z]{4}\|.*\|$/.test(l)), 'toda linha começa e termina com "|"');
ok(!/[^\x00-\xFF]/.test(T), 'só caracteres ISO-8859-1');
const R = (reg) => linhas.filter((l) => l.startsWith('|' + reg + '|')).map((l) => l.split('|').slice(1, -1));
eq(R('0000')[0][1], '020', 'leiaute 020 em 2026');
eq(R('0000')[0][3] + '-' + R('0000')[0][4], '01112026-30112026', 'período');
eq(R('0000')[0][14], '0', 'IND_ATIV industrial');
eq(R('0100')[0].slice(1, 4), ['CONTADOR TESTE', '52998224725', 'SP123456O8'], '0100 contabilista');
eq(R('0150').length, 5, 'só os 5 participantes usados');
ok(R('0200').every((r) => r.length === 13), '0200 com 13 campos');
ok(R('C100').every((r) => r.length === 29), 'C100 com 29 campos');
ok(R('C170').every((r) => r.length === 38), 'C170 com 38 campos');
ok(R('C190').every((r) => r.length === 12), 'C190 com 12 campos');
ok(R('D100').every((r) => r.length === 25), 'D100 com 25 campos');
ok(R('E110')[0].length === 15, 'E110 com 15 campos');
eq(R('1010')[0].length, 14, '1010 com os 13 indicadores');
// Bloco 9 confere com o arquivo
const cont = {};
linhas.forEach((l) => { const r = l.split('|')[1]; cont[r] = (cont[r] || 0) + 1; });
R('9900').forEach(([, reg, q]) => eq(+q, cont[reg], '9900 de ' + reg + ' = linhas reais'));
eq(R('9900').length, Object.keys(cont).length, 'um 9900 por registro presente');
eq(+R('9999')[0][1], linhas.length, '9999 = total de linhas');
['0', 'B', 'C', 'D', 'E', 'G', 'H', 'K', '1', '9'].forEach((b) => {
  const fim = b === '9' ? '9990' : b + '990';
  eq(+R(fim)[0][1], linhas.filter((l) => l[1] === b).length, fim + ' = linhas do bloco ' + b);
});
eq(R('9900').slice(0, 3).map((r) => r[1]), ['0000', '0001', '0002'], '9900 na ordem em que os registros aparecem');
// Documentos
const c100 = R('C100');
eq(c100.length, 10, '7 notas + 1 cancelada + 2 inutilizadas');
const canc = c100.find((r) => r[7] === '472');
eq([canc[5], canc[3], canc[9]], ['02', '', ''], 'cancelada: COD_SIT 02, sem participante nem valores');
eq(c100.filter((r) => r[5] === '05').map((r) => r[7]), ['473', '474'], 'inutilizadas: COD_SIT 05, uma linha por número');
// Σ C190 VL_OPR = VL_DOC de cada C100 (regra do PVA)
const blocoC = linhas.filter((l) => l.startsWith('|C1'));
let atual = null; const soma = {};
blocoC.forEach((l) => { const c = l.split('|'); if (c[1] === 'C100') { atual = c; soma[c[9] || c[8]] = 0; } if (c[1] === 'C190') soma[atual[9]] += Math.round(+c[5].replace(',', '.') * 100); });
c100.filter((r) => r[5] === '00').forEach((r) => eq(soma[r[8]], Math.round(+r[11].replace(',', '.') * 100), 'Σ C190 VL_OPR = VL_DOC da NF ' + r[7]));
// Entradas: CFOP de entrada pela regra, crédito conforme a regra
const compra = efd.livro.linhas.find((l) => l.numero === '376202');
eq(compra.c190.map((a) => a.cfop), ['1101'], 'compra 5101 escriturada como 1101');
eq(compra.totais.vICMS, 189000, 'crédito de ICMS da compra');
eq(compra.totais.vIPI, 52500, 'crédito de IPI (industrial)');
const uso = efd.livro.linhas.find((l) => l.numero === '366615');
eq([uso.c190[0].cfop, uso.c190[0].cst, uso.c190[0].vICMS], ['1556', '090', 0], 'uso e consumo: 1556, CST x90, sem crédito');
const sn = efd.livro.linhas.find((l) => l.numero === '1199');
eq(sn.totais.vICMS, 5000, 'Simples: crédito pelo vCredICMSSN');
const rem = efd.livro.linhas.find((l) => l.numero === '35200');
eq([rem.c190[0].cfop, rem.c190[0].vICMS], ['1901', 0], 'remessa do cliente: 1901 sem crédito');
ok(rem.itens.every((i) => i.propriedade === 'CLIENTE'), 'e o item é do cliente (estoque de terceiro)');
// Saída própria: sem C170 (exceção 2 do Guia), C190 por CFOP
ok(!R('C170').some((r) => r[2] === 'SKU-MC-100'), 'NF-e própria sem C170 por padrão');
const comC170 = Fis.gerarEfd({ estab: ESTAB, docs, mes: '2026-11', regras: REGRAS, opcoes: { c170Propria: true } });
ok(comC170.texto.split('\r\n').some((l) => l.startsWith('|C170|1|SKU-MC-100|')), '"Gerar C170 de emissão própria" marcado: C170 sai');
// Apuração
const e110 = efd.apuracao.e110;
eq(e110.VL_TOT_DEBITOS, 288000 + 117000, 'débitos = ICMS das saídas (5124 + 5101)');
eq(e110.VL_TOT_CREDITOS, 189000 + 57000 + 5000 + 1800, 'créditos = compras + Simples + frete');
eq(e110.VL_TOT_AJ_CREDITOS, 10000, 'E111 "2" = outros créditos');
eq(e110.VL_ICMS_RECOLHER, 405000 - 252800 - 10000, 'a recolher');
eq(R('E116')[0].slice(1, 5), ['000', '1422,00', '20122026', '046-2'], 'E116 com vencimento e código de receita');
eq(R('E111')[0][1], 'SP020799', 'E111 sai');
ok(R('E520')[0][3] === '525,00' && R('E520')[0][2] === '1925,00', 'E520: crédito e débito de IPI');
// Saldo credor
const credor = Fis.apurarIcms({ linhas: [{ c190: [{ cfop: '1101', vICMS: 1000 }] }] }, { saldoCredorAnterior: 500 });
eq([credor.e110.VL_SLD_APURADO, credor.e110.VL_SLD_CREDOR_TRANSPORTAR], [0, 1500], 'saldo credor transportado');
ok(!Fis.apurarIcms({ linhas: [] }, { ajustes: [{ codigo: 'SP040001', valorCentavos: 100 }] }).ok, 'dedução maior que o apurado é impeditiva');

// ── 6. Industrialização por encomenda (D3) ────────────────────────────────
const rec = efd.livro.receita;
eq(rec.industrializacaoCentavos, 1760000, 'receita de industrialização = 5124 (+IPI)');
eq(rec.simbolicoCentavos, 1350000, 'retorno simbólico 5902 separado');
eq(rec.receitaCentavos, 1760000 + 682500, 'receita = 5124 + vendas; 5902 NUNCA');
const enc = Fis.lerXml(M.saidaEncomenda.xml).doc;
const vc = Fis.valorCobrado(enc);
eq([vc.valorCentavos, vc.fonte, vc.temRetornoSimbolico], [1760000, 'FATURA', true], 'recebível = fatura do XML, não o vNF');
ok(vc.vNF === 3110000, 'o vNF (com o simbólico) é maior');
const encSemFat = X.nfe({ emit: X.KURYOS, dest: X.CLIENTE, n: 480, serie: 2, data: '2026-11-20', itens: [{ cProd: 'S', xProd: 'S', ncm: '33030020', cfop: '5124', un: 'UN', q: 100, vUn: 2, icms: { tipo: '00', aliq: 18 } }, { cProd: 'R', xProd: 'R', ncm: '33029019', cfop: '5902', un: 'KG', q: 1, vUn: 500, icms: { tipo: '50' } }] });
eq(Fis.valorCobrado(Fis.lerXml(encSemFat.xml).doc).valorCentavos, 20000, 'sem fatura: só os itens que são receita');
eq(Fis.classeSaida('6124'), 'INDUSTRIALIZACAO', '6124 é industrialização');
eq(Fis.classeSaida('5903'), 'SIMBOLICO', '5903 é simbólico');
eq(Fis.classeSaida('5949'), 'OUTRAS', 'remessa genérica fora da receita');

// ── 7. De-para e itens ────────────────────────────────────────────────────
const itens = { 'FR-200ML': { codigo: 'FR-200ML', descr: 'FRASCO 200ML', un: 'UN', tipoItem: '02', ncm: '39233000', material: 'EP-0001', conversoes: {} } };
const dePara = { [Fis.chaveDePara(X.FORN_SP.cnpj, 'FR-200')]: { item: 'FR-200ML', fator: 1 } };
const efd2 = Fis.gerarEfd({ estab: ESTAB, docs, mes: '2026-11', regras: REGRAS, itens, dePara });
ok(efd2.texto.includes('|C170|1|FR-200ML|'), 'de-para: C170 com o código interno');
ok(efd2.texto.includes('|0200|FR-200ML|FRASCO 200ML||'), '0200 do cadastro');
ok(!efd2.inconsistencias.some((i) => i.identificador === 'FR-200ML'), 'item com de-para não gera aviso');
ok(efd2.inconsistencias.some((i) => !i.impeditivo && /sem de-para/.test(i.descricao)), 'item sem de-para: aviso, não impeditivo');
const itensCx = { 'FR-200ML': Object.assign({}, itens['FR-200ML'], { un: 'CX' }) };
const efd3 = Fis.gerarEfd({ estab: ESTAB, docs, mes: '2026-11', regras: REGRAS, itens: itensCx, dePara });
ok(!efd3.ok && efd3.inconsistencias.some((i) => /fator de conversão \(0220\)/.test(i.descricao)), 'unidade diferente sem 0220: impeditivo');
const efd4 = Fis.gerarEfd({ estab: ESTAB, docs, mes: '2026-11', regras: REGRAS, itens: { 'FR-200ML': Object.assign({}, itensCx['FR-200ML'], { conversoes: { UN: 0.001 } }) }, dePara });
ok(efd4.ok && efd4.texto.includes('|0220|UN|0,001000||'), '0220 com o fator');
ok(Fis.validarItem({ codigo: 'X', descr: 'X', un: 'UN', tipoItem: '01', ncm: '123' }).ok === false, 'NCM inválido recusado');
ok(Fis.validarDePara({ fornecedor: X.FORN_SP.cnpj, cProd: 'A', item: 'B', fator: 0 }).ok === false, 'fator zero recusado');

// ── 8. Inventário e fevereiro ─────────────────────────────────────────────
const fev = Fis.gerarEfd({ estab: ESTAB, docs: {}, mes: '2027-02', regras: REGRAS });
ok(!fev.ok && fev.inconsistencias.some((i) => i.impeditivo && /fevereiro exige o inventário/.test(i.descricao)), 'EFD de fevereiro sem inventário: impeditivo');
eq(Fis.LEIAUTE_EFD[2027], '021', 'leiaute 021 em 2027');
const materiais = { 'EP-0001': { mpCodigo: 'EP-0001', nome: 'FRASCO 200ML', unidade: 'UN', tipo: 'EP' }, 'MC-ESS': { mpCodigo: 'MC-ESS', nome: 'ESSENCIA MARCA', unidade: 'KG', tipo: 'MPES' } };
const clientes = { c1: { nome: 'MARCA COSMETICOS', cnpj: X.CLIENTE.cnpj, uf: 'SP', ie: X.CLIENTE.ie } };
const itensInv = { 'MC-ESS': { codigo: 'MC-ESS', descr: 'ESSENCIA', un: 'KG', tipoItem: '01', ncm: '33029019', material: 'MC-ESS' } };
// Aninhado, como o servidor grava (fis/de_para_itens/{cnpj}/{código}).
const dpInv = { [X.CLIENTE.cnpj]: { 'MC-ESS-01': { item: 'MC-ESS', fator: 1 } } };
const itensTodos = Object.assign({}, itens, itensInv);
const inv = Fis.montarInventario({ data: '2026-12-31', estab: ESTAB, materiais, clientes, docs, dePara: dpInv, itens: itensTodos,
  estoque: { 'EP-0001': { saldoAtual: 1000 }, 'MC-ESS': { saldoAtual: 20, porCliente: { c1: { saldoAtual: 20 } } } }, precos: { 'EP-0001': { valor: 0.85, unidade: 'UN', fonte: 'PAGO' } } });
ok(inv.ok, 'inventário montado: ' + inv.inconsistencias.map((i) => i.descricao).join(' | '));
const prop = inv.itens.find((i) => i.indProp === '0'), terc = inv.itens.find((i) => i.indProp === '2');
eq([prop.codItem, prop.qtd, prop.vItem], ['FR-200ML', 1000, 85000], 'próprio: código do item fiscal ligado ao material, quantidade × custo');
eq([terc.qtd, terc.vItem, terc.codPart], [20, 240000, X.CLIENTE.cnpj], 'do cliente: IND_PROP 2, valor da NF de remessa (120/kg), COD_PART do cliente');
const invSemPreco = Fis.montarInventario({ data: '2026-12-31', estab: ESTAB, materiais, clientes, itens: itensTodos, estoque: { 'EP-0001': { saldoAtual: 10 } }, precos: {} });
const invSemNcm = Fis.montarInventario({ data: '2026-12-31', estab: ESTAB, materiais, estoque: { 'EP-0001': { saldoAtual: 10 } }, precos: { 'EP-0001': { valor: 1 } } });
ok(!invSemNcm.ok && invSemNcm.inconsistencias.some((i) => /sem item fiscal com NCM/.test(i.descricao)), 'material sem item fiscal (NCM): impeditivo');
ok(!invSemPreco.ok && invSemPreco.inconsistencias.some((i) => /sem preço/.test(i.descricao)), 'sem preço: impeditivo, nunca zero');
const invNeg = Fis.montarInventario({ data: '2026-12-31', estab: ESTAB, materiais, estoque: { 'EP-0001': { saldoAtual: -5 } }, precos: { 'EP-0001': { valor: 1 } } });
ok(!invNeg.ok && invNeg.inconsistencias.some((i) => /negativo/.test(i.descricao)), 'saldo negativo: impeditivo (Dia D)');
const efdInv = Fis.gerarEfd({ estab: ESTAB, docs, mes: '2026-12', regras: REGRAS, itens: itensTodos, inventario: inv, opcoes: { gerarInventario: true } });
const h010 = efdInv.texto.split('\r\n').filter((l) => l.startsWith('|H010|'));
eq(h010.length, 2, 'H010 dos dois itens');
ok(h010.some((l) => l.startsWith('|H010|MC-ESS|KG|20,000|120,000000|2400,00|2|' + X.CLIENTE.cnpj + '|')), 'H010 do material de terceiro: IND_PROP 2 + COD_PART');
ok(efdInv.texto.includes('|0150|' + X.CLIENTE.cnpj + '|'), 'cliente do inventário vai para o 0150');
ok(efdInv.texto.includes('|H005|31122026|3250,00|01|'), 'H005 com o total');

// ── 9. SINTEGRA ───────────────────────────────────────────────────────────
const sin = Fis.gerarSintegra({ estab: ESTAB, docs, mes: '2026-11', regras: REGRAS, itens: itensTodos, inventario: inv, opcoes: { gerarInventario: true } });
ok(sin.ok, 'SINTEGRA gerado');
const sl = sin.texto.split('\r\n').filter(Boolean);
ok(sl.every((l) => l.length === 126), 'todas as linhas com 126 posições');
eq(sl[0].slice(0, 2) + sl[1].slice(0, 2), '1011', '10 e 11 no começo');
ok(sl.some((l) => l.startsWith('74') && l[50] === '3'), '74 do material do cliente com posse 3');
ok(sl.some((l) => l.startsWith('74') && l[50] === '1'), '74 do próprio com posse 1');
ok(sl.some((l) => l.startsWith('70')), 'CT-e no registro 70');
ok(sl.some((l) => l.startsWith('50') && l.slice(45, 51) === '000472' && l[125] === 'S'), 'cancelada: situação S');
const r90 = sl.filter((l) => l.startsWith('90'));
const tot = {}; sl.forEach((l) => { tot[l.slice(0, 2)] = (tot[l.slice(0, 2)] || 0) + 1; });
r90.forEach((l) => { const s = l.slice(30, 125); for (let i = 0; i + 10 <= s.length; i += 10) { const t = s.slice(i, i + 2), q = +s.slice(i + 2, i + 10); if (!t.trim()) break; eq(q, t === '99' ? sl.length : tot[t], '90: total do tipo ' + t); } });
eq(+r90[r90.length - 1][125], r90.length, 'última posição do 90 = número de registros 90');
ok(Fis.codSintegra('F11222333-FR-200').length <= 14 && Fis.codSintegra('F11222333-FR-200') === Fis.codSintegra('F11222333-FR-200'), 'código > 14 vira código estável de 14');
ok(sin.inconsistencias.some((i) => !i.impeditivo && /dispensado do SINTEGRA/.test(i.descricao)), 'aviso da dispensa em SP');

// ── 10. Conferências ──────────────────────────────────────────────────────
const conf = Fis.conferenciaTerceiros(docs, { 'MC-ESS': { porCliente: { c1: { saldoAtual: 10 } } } }, clientes, dpInv, itensInv);
eq(conf.linhas[0].fiscal, 50, 'notas: 50 kg entraram (1901)');
ok(conf.inconsistencias.some((i) => !i.impeditivo && /≠ notas/.test(i.descricao)), 'físico 10 × notas 50: aviso com cliente e item');
const cz = Fis.cruzamentos({ docs, agendamentos_expedicao: { a: { faturamento: { nfs: {
  n1: { numero: '470', chaveNfe: M.saidaEncomenda.chave, emitidaEm: '2026-11-20', valor: 31100 },
  n2: { numero: '999', chaveNfe: X.chave(35, '2611', X.KURYOS.cnpj, '55', 2, 999), emitidaEm: '2026-11-21', valor: 10 },
  n3: { numero: '352610007675540001195500200000', chaveNfe: 'lixo', emitidaEm: '2026-11-21', valor: 1 } } } } } }, '2026-11');
ok(cz.some((i) => i.impeditivo && /NF 999/.test(i.identificador) && /sem XML no Fiscal/.test(i.descricao)), 'NF do Faturamento sem XML: impeditivo (falta a saída no SPED)');
ok(cz.some((i) => !i.impeditivo && /sem chave de acesso válida/.test(i.descricao)), 'NF digitada sem chave válida: aviso');
ok(!cz.some((i) => /NF 470/.test(i.identificador)), 'NF com XML e valor igual: nada');

// ── 11. CSV do livro ──────────────────────────────────────────────────────
const csv = Fis.livroCsv(efd.livro);
ok(/^Livro;Data;/.test(csv) && csv.includes('Entradas;') && csv.includes('Saídas;'), 'livro em CSV com entradas e saídas');

console.log(`OK fiscal (motor): ${n} asserções — leitura NF-e/CT-e/eventos/inutilização, CNPJ alfanumérico, regras de entrada, escrituração, apuração E110/E520, EFD (Bloco 9 conferido), SINTEGRA 126 posições, inventário com terceiros, encomenda (5124 × 5902), conferências.`);
