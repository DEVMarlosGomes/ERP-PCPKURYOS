'use strict';
/* Ligação do Fiscal com o Financeiro e a Controladoria (prompt mestre, D3/Q8):
   B1 — o título a receber da NF de encomenda é o valor cobrado (fatura do XML), nunca o vNF com
        o retorno simbólico; NF cancelada no XML não vira título; divergência vira complemento.
   A2 — a receita da NF com XML é 5124/5125 + vendas, com a industrialização em folha própria;
        5902/5903 nunca é receita; NF cancelada no XML é estornada.
   B2 — um upload só: finImportarNfEntrada passa pelo Fiscal.
   E prova que, SEM XML, nenhum título nem lançamento existente muda (hash igual). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const F = require('./functions/financeiro');
const Ctl = require('./functions/controladoria');
const Ger = require('./functions/controladoria-gerencial');
const FisSrv = require('./functions/fiscal_servidor');
const X = require('./test-fixtures/fiscal-xml');

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m); };
const util = { gzip: (t) => zlib.gzipSync(Buffer.from(t)).toString('base64'), sha256: (t) => crypto.createHash('sha256').update(t).digest('hex') };
const M = X.mesDeTeste();
function aplicar(b, updates) {
  const c = JSON.parse(JSON.stringify(b));
  Object.entries(updates).forEach(([k, v]) => { const p = k.split('/'); let o = c; for (let i = 0; i < p.length - 1; i++) o = o[p[i]] = o[p[i]] || {}; if (v === null) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = v; });
  return c;
}
// Faturamento registrou a NF 470 (encomenda) DIGITANDO o vNF inteiro, com o simbólico — o erro que B1 evita.
const base0 = {
  clientes: { c1: { nome: 'MARCA COSMETICOS', cnpj: X.CLIENTE.cnpj } },
  agendamentos_expedicao: { car1: { cliente: 'MARCA COSMETICOS', clienteKey: 'c1', faturamento: {
    solicitacoes: { s: { em: '2026-11-19', itens: [{ itemKey: 'a', loteKey: 'x', sku: 'SKU-MC-100', lote: 'L1', unidades: 5000, valor: 17600 }] } },
    nfs: { n470: { numero: '470', serie: '2', valor: 31100, emitidaEm: '2026-11-20', chaveNfe: M.saidaEncomenda.chave },
      n472: { numero: '472', serie: '2', valor: 65, emitidaEm: '2026-11-22', chaveNfe: M.vendaCancelada.chave } } } } },
  fin: {}, ctl: {}, custos: {}
};
// Sem XML: comportamento de hoje.
const semXml = F.derivar(base0);
eq(semXml.titulos.NF_car1_n470.valorCentavos, 3110000, 'sem XML: o título é o valor digitado (comportamento atual)');
eq(semXml.titulos.NF_car1_n470.valorFonte, 'DIGITADO', 'e diz que é digitado');
const docsSem = Ctl.documentosEsperados(Object.assign({ ctl: {} }, base0));
const docsSemFisVazio = Ctl.documentosEsperados(Object.assign({ ctl: {}, fis: { documentos: {} } }, base0));
eq(Object.keys(docsSem).map((k) => docsSem[k].hash), Object.keys(docsSemFisVazio).map((k) => docsSemFisVazio[k].hash), 'sem XML no Fiscal, nenhum lançamento muda de hash');

// Importa os XMLs no Fiscal (servidor real).
const imp = FisSrv.prepararImportacao({ fis: {}, ctl: {} }, { arquivos: ['saidaEncomenda', 'vendaCancelada', 'cancelamento'].map((k) => ({ nome: k, texto: typeof M[k] === 'string' ? M[k] : M[k].xml })) }, { uid: 'u', nome: 'F' }, '2026-11-25T10:00:00.000Z', util);
const comFis = aplicar(base0, imp.updates);
const docEnc = comFis.fis.documentos[M.saidaEncomenda.chave];
eq([docEnc.valorCobrado.valorCentavos, docEnc.valorCobrado.fonte], [1760000, 'FATURA'], 'servidor grava o valor cobrado no documento');
eq([docEnc.receita.industrializacaoCentavos, docEnc.receita.simbolicoCentavos], [1760000, 1350000], 'e a receita por classe');

// B1: título pelo valor cobrado; cancelada não vira título.
const d1 = F.derivar(comFis);
eq(d1.titulos.NF_car1_n470.valorCentavos, 1760000, 'B1: título = valor cobrado (fatura do XML), não o vNF com o simbólico');
eq(d1.titulos.NF_car1_n470.valorFonte, 'XML_FATURA', 'e diz de onde veio');
ok(d1.complementosDerivacao.some((c) => c.tipo === 'NF_VALOR_XML' && /retorno simbólico/.test(c.texto)), 'divergência digitado × XML vira complemento');
ok(!d1.titulos.NF_car1_n472, 'NF cancelada no XML não vira título');
ok(d1.complementosDerivacao.some((c) => c.tipo === 'NF_CANCELADA_XML'), 'e aparece como complemento para tirar do Faturamento');
// Título que já existia (derivado antes do XML) não muda: append-only.
const jaTinha = aplicar(comFis, { 'fin/titulos/NF_car1_n470': semXml.titulos.NF_car1_n470 });
ok(!F.derivar(jaTinha).titulos.NF_car1_n470, 'título já existente não é recriado (append-only); a diferença fica no complemento');

// A2: receita da Controladoria.
const esp = Ctl.documentosEsperados(Object.assign({}, comFis, { ctl: {} }));
const docNf = Object.values(esp).find((d) => d.origem && d.origem.tipo === 'NF_SAIDA' && /470/.test(d.historico));
const rec = docNf.partidas.filter((p) => p.conta === 'RECEITA_BRUTA');
eq(rec.reduce((s, p) => s + p.creditoCentavos, 0), 1760000, 'A2: receita bruta = 5124 + IPI (o simbólico de R$ 13.500 fica fora)');
eq(rec.map((p) => p.elemento), ['RECEITA_INDUSTRIALIZACAO'], 'industrialização em folha própria da receita');
eq(docNf.partidas.find((p) => p.conta === 'CLIENTES').debitoCentavos, 1760000, 'clientes = o mesmo valor do título (reconcilia com o Financeiro)');
eq(docNf.analitico.receitaFiscal.simbolicoCentavos, 1350000, 'analítico guarda o simbólico e o digitado');
ok(!Object.values(esp).some((d) => d.origem && d.origem.tipo === 'NF_SAIDA' && /472/.test(d.historico)), 'NF cancelada no XML: sem receita (o derivado antigo é estornado)');
// DRE por elemento mostra a linha da industrialização
const d = Ctl.derivar(Object.assign({}, comFis, { ctl: {} }), '2026-11-25T10:00:00.000Z');
const ctl = aplicar({}, d.updates).ctl;
const dre = Ger.dreGerencial(ctl, { de: '2026-11', ate: '2026-11' });
ok(dre.linhas.some((l) => /INDUSTRIALIZAÇÃO POR ENCOMENDA 5124\/5125/.test(l.rotulo) && l.total === 1760000), 'DRE por elemento: linha "Industrialização por encomenda 5124/5125"');

// B2: o Financeiro passa pelo Fiscal (ligação no index.js).
const idx = fs.readFileSync('functions/index.js', 'utf8');
const fin = idx.slice(idx.indexOf('exports.finImportarNfEntrada'), idx.indexOf('exports.finDecidirLote'));
ok(/importarXmlUnificado\(xmls, quem, "FINANCEIRO"\)/.test(fin), 'finImportarNfEntrada usa o upload único do Fiscal');
ok(/FinanceiroSrv\.prepararNotasEntrada\(await baseGestao\(false\), \{xmls: x\.xmlsEntrada\}/.test(idx), 'o upload do Fiscal grava a nota do Financeiro no mesmo update');
ok(/"fis\/documentos"\];/.test(idx) && /fis: \{documentos: v\["fis\/documentos"\]\}/.test(idx), 'a base do Financeiro/Controladoria lê fis/documentos');
['fisImportarXml', 'fisSalvarCadastro', 'fisSalvarApuracao', 'fisGerarEfd', 'fisGerarSintegra', 'fisGerarInventario', 'fisFecharMes', 'fisReabrirMes', 'fisRegistrarTransmissao', 'fisBaixarArquivo', 'fisXmlsDoPeriodo']
  .forEach((c) => ok(new RegExp('exports\\.' + c + ' = onCall\\(').test(idx), 'callable ' + c));
// Regras: a tela não escreve em fis/, fis_xml nem fis_arquivos; XML só o servidor lê.
const regras = JSON.parse(fs.readFileSync('database.rules.json', 'utf8').replace(/^\s*\/\/.*$/mg, '')).rules;
ok(regras.fis['.write'] === false && /modulos'\)\.child\('fiscal'\)/.test(regras.fis['.read']), 'fis/: lê ADM ou módulo Fiscal; ninguém grava pela tela');
ok(regras.fis_xml['.read'] === false && regras.fis_xml['.write'] === false && regras.fis_arquivos['.read'] === false, 'fis_xml e fis_arquivos: só o servidor');

console.log(`OK fiscal (integração): ${n} verificações — B1 título pelo valor cobrado, A2 receita 5124 × 5902, B2 upload único, sem XML nada muda, regras.`);
