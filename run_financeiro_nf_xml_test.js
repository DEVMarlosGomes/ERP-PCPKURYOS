'use strict';
/* Financeiro F5 (10/11/2026): NF de entrada por XML. Motor (leitura do XML, casamento
   com o recebimento, parcelas pelas duplicatas, pendências) e servidor (importação,
   repetição, vínculo, um título por nota). docs/financeiro-fase0-lacunas.md. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const F = require('./functions/financeiro');
const FS = require('./functions/financeiro_servidor');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const AG = '2026-11-10T12:00:00.000Z';
const adm = {uid: 'u-adm', nome: 'ADM', role: 'admin'};
const CHAVE = '35261112345678000190550010000012341123456789';

function xml(o) {
  const x = Object.assign({chave: CHAVE, nNF: '000001234', serie: '001', cnpj: '12.345.678/0001-90', vNF: '1500.50', dups: [['001', '2026-12-10', '750.25'], ['002', '2027-01-09', '750.25']], mod: '55'}, o || {});
  const dup = x.dups.map(([nn, v, val]) => `<dup><nDup>${nn}</nDup><dVenc>${v}</dVenc><vDup>${val}</vDup></dup>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<infNFe Id="NFe${x.chave}" versao="4.00"><ide><cUF>35</cUF><natOp>VENDA</natOp><mod>${x.mod}</mod><serie>${x.serie}</serie><nNF>${x.nNF}</nNF>` +
    `<dhEmi>2026-11-08T10:15:00-03:00</dhEmi><tpNF>1</tpNF><idDest>1</idDest></ide>` +
    `<emit><CNPJ>${x.cnpj.replace(/\D/g, '')}</CNPJ><xNome>EMBALAGENS &amp; CIA LTDA</xNome><xFant>EMBACIA</xFant></emit>` +
    `<dest><CNPJ>99888777000166</CNPJ><xNome>KURYOS</xNome></dest>` +
    `<det nItem="1"><prod><cProd>FR-200</cProd><xProd>FRASCO PET 200ML</xProd><CFOP>5101</CFOP><uCom>UN</uCom><qCom>1000.0000</qCom><vProd>1400.50</vProd></prod></det>` +
    `<det nItem="2"><prod><cProd>TP-24</cProd><xProd>TAMPA 24/410</xProd><CFOP>5101</CFOP><uCom>UN</uCom><qCom>1000.0000</qCom><vProd>100.00</vProd></prod></det>` +
    `<total><ICMSTot><vProd>1500.50</vProd><vFrete>0.00</vFrete><vDesc>0.00</vDesc><vNF>${x.vNF}</vNF></ICMSTot></total>` +
    (x.dups.length ? `<cobr><fat><nFat>1234</nFat><vOrig>${x.vNF}</vOrig><vLiq>${x.vNF}</vLiq></fat>${dup}</cobr>` : '') +
    `</infNFe></NFe><protNFe versao="4.00"><infProt><chNFe>${x.chave}</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>`;
}
function base(extra) {
  return Object.assign({
    fornecedores: {f1: {razaoSocial: 'EMBALAGENS & CIA LTDA', cnpj: '12.345.678/0001-90'}, f2: {razaoSocial: 'OUTRA', cnpj: '11.111.111/0001-11'}},
    pedidos_compra: {pc1: {numeroFormatado: 'PC-0010', fornecedorKey: 'f1', recebimentos: {r1: {notaFiscal: '1234', data: '2026-11-09', status: 'ATIVO'}}}},
    fin: {titulos: {REC_pc1_r1: {tipo: 'PAGAR', valorCentavos: 150050, emissao: '2026-11-09', condicao: '28', baseVencimento: '2026-11-09', origem: {tipo: 'RECEBIMENTO'}, parceiro: {nome: 'EMBALAGENS'}}},
      baixas: {}, notas_entrada: {}, contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 0, dataSaldoInicial: '2026-10-01'}}},
    ctl: {fechamentos: {}}
  }, extra || {});
}

// ── 1. Leitura do XML ──────────────────────────────────────────────────────
const r = F.lerXmlNfe(xml());
ok(r.ok, 'XML válido');
eq([r.nota.chave, r.nota.numero, r.nota.serie, r.nota.emissao], [CHAVE, '1234', '1', '2026-11-08'], 'chave, número e série sem zeros, data');
eq([r.nota.emitente.cnpj, r.nota.emitente.nome], ['12345678000190', 'EMBALAGENS & CIA LTDA'], 'emitente com entidade XML decodificada');
eq(r.nota.valorTotalCentavos, 150050, 'vNF em centavos, sem ponto flutuante');
eq(r.nota.duplicatas.map((d) => [d.vencimento, d.valorCentavos]), [['2026-12-10', 75025], ['2027-01-09', 75025]]);
eq([r.nota.itens.length, r.nota.itens[0].codigo, r.nota.itens[0].quantidade], [2, 'FR-200', 1000]);
eq(r.avisos, [], 'duplicatas fecham a nota: sem aviso');
eq(F.decCentavos('0.1'), 10); eq(F.decCentavos('1234.565'), 123457); eq(F.decCentavos('abc'), null);
ok(!F.lerXmlNfe('<html></html>').ok, 'não é NF-e');
ok(/modelo 55/.test(F.lerXmlNfe(xml({mod: '65'})).motivo), 'NFC-e recusada');
ok(/Chave/.test(F.lerXmlNfe(xml({chave: '123'})).motivo), 'chave inválida');
const semDup = F.lerXmlNfe(xml({dups: []}));
ok(semDup.ok && /sem duplicatas/.test(semDup.avisos[0]), 'sem duplicatas avisa');
const dupRuim = F.lerXmlNfe(xml({dups: [['001', '10/12/2026', '1500.50']]}));
ok(dupRuim.ok && dupRuim.nota.duplicatas.length === 0 && /inválido/.test(dupRuim.avisos[0]), 'duplicata inválida não é usada');
const dupMenor = F.lerXmlNfe(xml({dups: [['001', '2026-12-10', '1400.00']]}));
ok(/somam R\$ 1400.00 e a nota R\$ 1500.50/.test(dupMenor.avisos[0]), 'duplicatas ≠ nota avisa');

// ── 2. Casamento com o recebimento ─────────────────────────────────────────
const nota = r.nota;
eq(F.casarNotaEntrada(nota, base()).tipo, 'VINCULADA');
eq(F.casarNotaEntrada(nota, base()).titulo, 'REC_pc1_r1');
const bZeros = base(); bZeros.pedidos_compra.pc1.recebimentos.r1.notaFiscal = 'NF 0001234';
eq(F.casarNotaEntrada(nota, bZeros).tipo, 'VINCULADA', 'número com zeros e texto no recebimento');
const bCanc = base(); bCanc.pedidos_compra.pc1.recebimentos.r1.status = 'CANCELADO';
eq(F.casarNotaEntrada(nota, bCanc).tipo, 'SEM_RECEBIMENTO', 'recebimento cancelado não casa');
const bAmb = base(); bAmb.pedidos_compra.pc2 = {fornecedorKey: 'f1', recebimentos: {r9: {notaFiscal: '1234', status: 'ATIVO'}}};
eq(F.casarNotaEntrada(nota, bAmb).tipo, 'AMBIGUA', 'dois recebimentos: não escolhe');
const bSemPc = base({pedidos_compra: {}});
eq(F.casarNotaEntrada(nota, bSemPc).tipo, 'SEM_PEDIDO');
eq(F.casarNotaEntrada(Object.assign({}, nota, {emitente: {cnpj: '99999999000199'}}), base()).tipo, 'FORNECEDOR_NAO_CADASTRADO');
const bSemTit = base(); bSemTit.fin.titulos = {};
eq(F.casarNotaEntrada(nota, bSemTit).tipo, 'RECEBIMENTO_SEM_TITULO', 'material do cliente / sem preço');

// ── 3. Parcelas pelas duplicatas ───────────────────────────────────────────
const fin = base().fin;
fin.notas_entrada[CHAVE] = Object.assign({}, nota, {titulo: 'REC_pc1_r1'});
let s = F.carteira(fin)[0];
eq([s.fonteParcelas, s.parcelas.map((p) => [p.vencimento, p.valorCentavos])], ['NF_XML', [['2026-12-10', 75025], ['2027-01-09', 75025]]], 'duplicatas no lugar do "28" do PC');
eq(s.nota.chave, CHAVE);
eq(F.parcelasDaNota({duplicatas: [{vencimento: '2026-12-01', valorCentavos: 100}, {vencimento: '2026-11-01', valorCentavos: 200}]}, 1000).map((p) => [p.vencimento, p.valorCentavos]),
  [['2026-11-01', 667], ['2026-12-01', 333]], 'ordem por vencimento; valor do título na proporção; o último fecha o centavo');
const finFixo = JSON.parse(JSON.stringify(fin)); finFixo.titulos.REC_pc1_r1.vencimentoFixo = '2026-11-30';
eq(F.carteira(finFixo)[0].fonteParcelas, 'VENCIMENTO_FIXO', 'vencimento fixo do título vence a nota');
eq(F.pendenciasNotas(Object.assign(base(), {fin})), [], 'nota e título iguais: nada pendente');
const finDiv = JSON.parse(JSON.stringify(fin)); finDiv.titulos.REC_pc1_r1.valorCentavos = 140000;
const div = F.pendenciasNotas(Object.assign(base(), {fin: finDiv}));
eq([div.length, div[0].tipo, div[0].valorCentavos], [1, 'NF_DIVERGENTE', 10050], 'diferença vira complemento com o valor da diferença');
const s2 = F.carteira(finDiv)[0];
eq(s2.parcelas.reduce((a, p) => a + p.valorCentavos, 0), 140000, 'título não muda de valor por causa da nota');

// ── 4. Pendências de notas soltas ──────────────────────────────────────────
const bSolta = base({pedidos_compra: {}}); bSolta.fin.notas_entrada[CHAVE] = Object.assign({}, nota, {titulo: null});
eq(F.pendenciasNotas(bSolta).map((p) => p.tipo), ['NF_SEM_PEDIDO']);
eq(F.complementos(bSolta).filter((c) => c.tipo === 'NF_SEM_PEDIDO').length, 1, 'aparece em Complementos');
bSolta.fin.titulos.MAN_x = {tipo: 'PAGAR', valorCentavos: 150050, emissao: '2026-11-08', notaChave: CHAVE, parceiro: {nome: 'E'}, origem: {tipo: 'MANUAL'}};
eq(F.pendenciasNotas(bSolta), [], 'título manual da nota resolve a pendência');
eq(F.carteira(bSolta.fin).filter((x) => x.id === 'MAN_x')[0].fonteParcelas, 'NF_XML', 'título manual da nota usa as duplicatas');
eq(F.validarTituloManual({tipo: 'PAGAR', parceiro: 'E', valor: '10', emissao: '2026-11-08', notaChave: CHAVE}, 'MANUAL').titulo.notaChave, CHAVE);
eq(F.validarTituloManual({tipo: 'PAGAR', parceiro: 'E', valor: '10', emissao: '2026-11-08', notaChave: 'x'}, 'MANUAL').titulo.notaChave, null);

// ── 5. Servidor ────────────────────────────────────────────────────────────
let u = FS.prepararNotasEntrada(base(), {xmls: [{nome: 'nf1234.xml', texto: xml()}]}, adm, AG);
eq([u.importadas, u.vinculadas, u.erros], [1, 1, []]);
eq(u.updates[`fin/notas_entrada/${CHAVE}`].titulo, 'REC_pc1_r1', 'nota nova grava com o vínculo dentro (sem caminho pai + filho)');
ok(!Object.keys(u.updates).some((k) => k.startsWith(`fin/notas_entrada/${CHAVE}/`)), 'nenhum caminho filho junto do pai');
const bJa = base(); bJa.fin.notas_entrada[CHAVE] = Object.assign({}, nota, {titulo: 'REC_pc1_r1'});
u = FS.prepararNotasEntrada(bJa, {xmls: [{nome: 'de novo.xml', texto: xml()}]}, adm, AG);
eq([u.importadas, u.repetidas.length, Object.keys(u.updates).length], [0, 1, 0], 'mesma chave não entra duas vezes');
u = FS.prepararNotasEntrada(base(), {xmls: [{nome: 'a.xml', texto: xml()}, {nome: 'b.xml', texto: xml()}]}, adm, AG);
eq([u.importadas, u.repetidas.length], [1, 1], 'repetida no mesmo envio');
assert.throws(() => FS.prepararNotasEntrada(base(), {xmls: [{nome: 'x.xml', texto: '<html/>'}]}, adm, AG), /x\.xml: Não é o XML/); n++;
u = FS.prepararNotasEntrada(base(), {xmls: [{nome: 'x.xml', texto: '<html/>'}, {nome: 'ok.xml', texto: xml()}]}, adm, AG);
eq([u.importadas, u.erros.length], [1, 1], 'um arquivo ruim não derruba os bons');
// Nota que chegou antes do recebimento: vincula quando o título nasce.
const bAntes = base(); bAntes.fin.titulos = {}; bAntes.fin.notas_entrada[CHAVE] = Object.assign({}, nota, {titulo: null});
bAntes.pedidos_compra.pc1.itens = {i1: {}};
bAntes.pedidos_compra.pc1.recebimentos.r1.itensRecebidos = {l1: {itemKey: 'i1', materialCodigo: 'EP-1', loteKey: 'L1', qtdRecebida: 1000}};
bAntes.estoque_lotes = {'EP-1': {L1: {custoFonte: 'PAGO', custoUnitario: 1.5005}}};
eq(FS.prepararNotasEntrada(bAntes, {xmls: []}, adm, AG).vinculadas, 0, 'sem título ainda');
const d = FS.prepararDerivacao(bAntes, AG);
eq(d.updates[`fin/notas_entrada/${CHAVE}/titulo`], 'REC_pc1_r1', 'a derivação que cria o título já vincula a nota');
eq(d.notasVinculadas, 1);
// Um título por nota.
const bMan = base({pedidos_compra: {}}); bMan.fin.notas_entrada[CHAVE] = Object.assign({}, nota, {titulo: null});
const linha = {tipo: 'PAGAR', parceiro: 'EMBALAGENS', valor: '1500,50', emissao: '2026-11-08', notaChave: CHAVE};
u = FS.prepararTitulos(bMan, {origem: 'MANUAL', titulos: [linha]}, adm, AG);
eq(u.criados, 1);
const novo = Object.values(u.updates)[0]; bMan.fin.titulos.MAN_1 = novo;
assert.throws(() => FS.prepararTitulos(bMan, {origem: 'MANUAL', titulos: [Object.assign({}, linha, {valor: '1500,51'})]}, adm, AG), /já tem título/); n++;
// A baixa enxerga as parcelas da nota (situacaoDe passa a nota).
eq(FS.situacaoDe(Object.assign(base(), {fin}), 'REC_pc1_r1').fonteParcelas, 'NF_XML');

// ── 6. Cópias e ligação ────────────────────────────────────────────────────
eq(fs.readFileSync('public/shared/financeiro.js', 'utf8'), fs.readFileSync('functions/financeiro.js', 'utf8'), 'motor idêntico na tela e no servidor');
const idx = fs.readFileSync('functions/index.js', 'utf8');
ok(/exports\.finImportarNfEntrada = onCall[\s\S]{0,200}filaFinanceiro\(async/.test(idx), 'callable na fila do financeiro');
ok(/"fin\/notas_entrada"/.test(idx) && /notas_entrada: v\["fin\/notas_entrada"\]/.test(idx), 'servidor escuta fin/notas_entrada');
ok(/data-aba="notas"/.test(fs.readFileSync('public/financeiro.html', 'utf8')), 'aba na tela');
console.log('financeiro F5 (NF de entrada por XML): ' + n + ' asserções OK');
