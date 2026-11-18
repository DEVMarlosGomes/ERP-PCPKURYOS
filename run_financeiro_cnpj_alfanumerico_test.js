'use strict';
/* B0 do prompt mestre (17/11/2026): CNPJ alfanumérico no Financeiro.
   A partir de jul/2026 a Receita emite CNPJ com letras (12 posições [0-9A-Z] + 2 DVs numéricos).
   O Financeiro usava soDigitos e jogava as letras fora: dois fornecedores diferentes podiam casar.
   Prova: normalização, DV oficial, XML, casamento com o fornecedor, chave de parceiro e relatórios,
   e que nenhum CNPJ/CPF numérico muda de chave (a base medida em 17/11 só tem numéricos e "ISENTO").
   Rodar com BASE_DIR=<pasta com fornecedores.json, clientes.json, fin_titulos.json> para medir a base real. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('./public/shared/financeiro');
const Fsrv = require('./functions/financeiro');
const R = require('./public/shared/financeiro-relatorios');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');

eq(fs.readFileSync('public/shared/financeiro.js', 'utf8'), fs.readFileSync('functions/financeiro.js', 'utf8'), 'motor do Financeiro igual em public/ e functions/');
ok(typeof Fsrv.normCnpj === 'function', 'servidor exporta normCnpj');

// 1. Normalização
eq(F.normCnpj('12.ABC.345/01DE-35'), '12ABC34501DE35', 'exemplo oficial da Receita: tira pontuação, mantém letras');
eq(F.normCnpj('12.abc.345/01de-35'), '12ABC34501DE35', 'letras minúsculas viram maiúsculas');
eq(F.normCnpj('00.767.554/0001-19'), '00767554000119', 'CNPJ numérico: igual ao de antes');
eq(F.normCnpj('123.456.789-09'), '12345678909', 'CPF: igual ao de antes');
eq(F.normCnpj('ISENTO'), '', '"ISENTO" continua vazio (como no soDigitos)');
eq(F.normCnpj('CNPJ 00767554000119'), '00767554000119', 'texto em volta: cai no soDigitos');
eq(F.normCnpj(null), '', 'nulo');

// 2. Dígito verificador (valores ASCII − 48)
ok(F.cnpjValido('12.ABC.345/01DE-35'), 'DV do exemplo oficial confere');
ok(!F.cnpjValido('12.ABC.345/01DE-36'), 'DV errado é recusado');
ok(F.cnpjValido('00.767.554/0001-19'), 'CNPJ numérico da Kuryos confere');
ok(!F.cnpjValido('11111111111111'), 'sequência repetida é recusada');
ok(!F.cnpjValido('12ABC34501DE3'), 'tamanho errado é recusado');

// 3. Chave de acesso com CNPJ alfanumérico do emitente
const CH_NUM = '35261112345678000190550010000012341123456789';
const CH_ALFA = '352611' + '12ABC34501DE35' + '550010000012341123456789';
eq(F.normChaveNfe(CH_NUM), CH_NUM, 'chave numérica');
eq(F.normChaveNfe(CH_ALFA.toLowerCase()), CH_ALFA, 'chave com letras no CNPJ do emitente');
eq(F.normChaveNfe('X' + CH_NUM.slice(1)), '', 'letra fora da posição do CNPJ: inválida');

function xml(chave, cnpj) {
  return `<nfeProc><NFe><infNFe Id="NFe${chave}" versao="4.00"><ide><mod>55</mod><serie>1</serie><nNF>1234</nNF><dhEmi>2026-11-08T10:00:00-03:00</dhEmi><tpNF>1</tpNF></ide>` +
    `<emit><CNPJ>${cnpj}</CNPJ><xNome>FORNECEDOR NOVO</xNome></emit><dest><CNPJ>00767554000119</CNPJ></dest>` +
    `<det nItem="1"><prod><cProd>A</cProd><xProd>FRASCO</xProd><CFOP>5101</CFOP><uCom>UN</uCom><qCom>10</qCom><vProd>100.00</vProd></prod></det>` +
    `<total><ICMSTot><vProd>100.00</vProd><vNF>100.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
}
const lido = F.lerXmlNfe(xml(CH_ALFA, '12ABC34501DE35'));
ok(lido.ok, 'XML de emitente com CNPJ alfanumérico é lido');
eq(lido.nota.chave, CH_ALFA, 'chave com letras preservada');
eq(lido.nota.emitente.cnpj, '12ABC34501DE35', 'CNPJ do emitente com as letras (antes virava "1234501 35")');
eq(lido.nota.destinatarioCnpj, '00767554000119', 'destinatário numérico');
const lidoNum = F.lerXmlNfe(xml(CH_NUM, '12345678000190'));
eq(lidoNum.nota.emitente.cnpj, '12345678000190', 'XML numérico: igual ao de antes');

// 4. Casamento com o fornecedor: dois CNPJs que só diferem nas letras NÃO casam
const base = {
  fornecedores: { fA: { cnpj: '12.ABC.345/01DE-35', razaoSocial: 'A' }, fB: { cnpj: '12.XYZ.345/01DE-35', razaoSocial: 'B' } },
  pedidos_compra: {}, fin: {}
};
eq(F.casarNotaEntrada(lido.nota, base).tipo, 'SEM_PEDIDO', 'acha o fornecedor pelo CNPJ alfanumérico');
eq(F.casarNotaEntrada(lido.nota, base).fornecedorKey, 'fA', 'e é o fornecedor certo');
ok(soDigitos('12.ABC.345/01DE-35') === soDigitos('12.XYZ.345/01DE-35'), 'prova do defeito antigo: só dígitos, os dois eram iguais');

// 5. Chave de parceiro (adiantamento, relatórios)
ok(F.chaveParceiro({ cnpj: '12.ABC.345/01DE-35' }) !== F.chaveParceiro({ cnpj: '12.XYZ.345/01DE-35' }), 'parceiros alfanuméricos distintos têm chaves distintas');
eq(F.chaveParceiro({ cnpj: '00.767.554/0001-19', nome: 'x' }), 'D00767554000119', 'chave numérica igual à de antes');
eq(F.chaveParceiro({ cnpj: 'ISENTO', nome: 'Fulano' }), 'NFULANO', '"ISENTO" continua caindo no nome');

// 6. Relatório "em aberto" agrupa pelo CNPJ alfanumérico e mostra a máscara
const fin = { titulos: {
  t1: { tipo: 'PAGAR', valorCentavos: 1000, emissao: '2026-11-01', vencimento: '2026-12-01', parceiro: { nome: 'Fornecedor A', cnpj: '12ABC34501DE35' }, parcelas: [{ n: 1, de: 1, vencimento: '2026-12-01', valorCentavos: 1000 }] },
  t2: { tipo: 'PAGAR', valorCentavos: 500, emissao: '2026-11-01', vencimento: '2026-12-01', parceiro: { nome: 'Fornecedor B', cnpj: '12XYZ34501DE35' }, parcelas: [{ n: 1, de: 1, vencimento: '2026-12-01', valorCentavos: 500 }] }
} };
const rel = R.relEmAberto(fin, { tipo: 'PAGAR', hoje: '2026-11-17' });
const docs = rel.linhas.map((l) => l.cnpj).filter(Boolean).sort();
eq(docs, ['12.ABC.345/01DE-35', '12.XYZ.345/01DE-35'], 'relatório separa os dois e mascara com as letras');

// 7. Base real (opcional): nenhum CNPJ/CPF gravado muda de chave
const dir = process.env.BASE_DIR;
if (dir) {
  const J = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8') || 'null') || {};
  let tot = 0, mud = 0;
  [['fornecedores.json', (x) => x && x.cnpj], ['clientes.json', (x) => x && x.cnpj], ['fin_titulos.json', (x) => x && x.parceiro && x.parceiro.cnpj]].forEach(([f, get]) => {
    const o = J(f);
    Object.keys(o).forEach((k) => { const c = get(o[k]); if (c == null || c === '') return; tot++; if (F.normCnpj(c) !== soDigitos(c)) mud++; });
  });
  ok(tot > 0, 'base lida: ' + tot + ' documentos');
  eq(mud, 0, 'base real: nenhum CNPJ/CPF muda de chave com normCnpj');
}

console.log(`financeiro B0 (CNPJ alfanumérico): ${n} asserções OK${dir ? ' (com a base real)' : ''}`);
