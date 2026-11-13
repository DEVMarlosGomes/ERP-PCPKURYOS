'use strict';
/* Financeiro F9 no servidor (12/11/2026): classificação, cadastro de elemento e liquidação
   por filtro. Caminhos planos em fin/, chave repetida não regrava, mês fechado recusa, e o
   index.js lê e liga tudo. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const S = require('./functions/financeiro_servidor');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const recusa = (fn, re, m) => { assert.throws(fn, re, m); n++; };
const quem = {uid: 'u1', nome: 'Ana'}, AGORA = '2026-11-12T13:00:00.000Z', D = '2026-11-12';
function base() {
  return {
    fin: {
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-11-01'}},
      titulos: {
        P1: {tipo: 'PAGAR', valorCentavos: 30000, vencimentoFixo: '2026-11-13', emissao: '2026-11-02', natureza: 'OUTROS', documento: 'NF 1', parceiro: {nome: 'Química SA'}, origem: {tipo: 'MANUAL'}},
        P2: {tipo: 'PAGAR', valorCentavos: 10000, vencimentoFixo: '2026-11-13', emissao: '2026-11-02', natureza: 'OUTROS', documento: 'NF 2', parceiro: {nome: 'Química SA'}, origem: {tipo: 'MANUAL'}}
      },
      baixas: {}, abatimentos: {}, elementos: {}, classificacoes: {}
    },
    ctl: {fechamentos: {'2026-10': {status: 'FECHADO'}}}
  };
}

// Classificação.
let r = S.prepararClassificacao(base(), {titulo: 'P1', elemento: '2113', formaPagamento: 'PIX', rateio: [{centro: 'ADMINISTRATIVO', percentual: 100}]}, quem, AGORA);
eq(Object.keys(r.updates), ['fin/classificacoes/P1']);
eq([r.updates['fin/classificacoes/P1'].elemento, r.updates['fin/classificacoes/P1'].por, r.updates['fin/classificacoes/P1'].porUid], ['2113', 'Ana', 'u1']);
recusa(() => S.prepararClassificacao(base(), {titulo: 'P1', elemento: 'NADA'}, quem, AGORA), /Elemento/, 'elemento inexistente');
recusa(() => S.prepararClassificacao(base(), {titulo: 'NAO', elemento: '2113'}, quem, AGORA), /Título/, 'título inexistente');

// Cadastro de elemento.
r = S.prepararElemento(base(), {codigo: '2120', nome: 'Seguro predial', grupo: '3', subgrupo: 'Administrativas', natureza: 'CUSTO_FIXO_ADM'}, quem, AGORA);
eq(Object.keys(r.updates), ['fin/elementos/2120']);
eq([r.updates['fin/elementos/2120'].nome, r.updates['fin/elementos/2120'].alteradoPor], ['Seguro predial', 'Ana']);
recusa(() => S.prepararElemento(base(), {codigo: '9', nome: '', grupo: '3', natureza: 'OUTROS'}, quem, AGORA), /nome/, 'elemento sem nome');

// Liquidação.
r = S.prepararLiquidacao(base(), {chave: 'lq000001', itens: [{titulo: 'P1', valorCentavos: 30000}, {titulo: 'P2', valorCentavos: 10000}], data: D, conta: 'itau'}, quem, AGORA);
eq(Object.keys(r.updates).sort(), ['fin/baixas/BX_LQ_lq000001_P1', 'fin/baixas/BX_LQ_lq000001_P2']);
eq([r.updates['fin/baixas/BX_LQ_lq000001_P1'].liquidacao, r.updates['fin/baixas/BX_LQ_lq000001_P1'].criadoPor, r.baixas, r.totalCentavos], ['lq000001', 'Ana', 2, 40000]);
const b2 = base(); Object.assign(b2.fin.baixas, {BX_LQ_lq000001_P1: r.updates['fin/baixas/BX_LQ_lq000001_P1']});
eq(S.prepararLiquidacao(b2, {chave: 'lq000001', itens: [{titulo: 'P1', valorCentavos: 30000}], data: D, conta: 'itau'}, quem, AGORA).repetido, true, 'clique duplo não duplica');
recusa(() => S.prepararLiquidacao(base(), {chave: 'lq000002', itens: [{titulo: 'P1', valorCentavos: 30000}], data: '2026-10-30', conta: 'itau'}, quem, AGORA), /fechado/, 'mês fechado');
recusa(() => S.prepararLiquidacao(base(), {chave: 'x', itens: [], data: D, conta: 'itau'}, quem, AGORA), /Identificador/, 'chave inválida');

// Ligação no index.js.
const idx = fs.readFileSync('functions/index.js', 'utf8');
['fin/elementos', 'fin/classificacoes'].forEach((c) => {
  ok(new RegExp('CAMINHOS_FIN = \\[[^\\]]*"' + c + '"').test(idx), c + ' está em CAMINHOS_FIN');
  ok(idx.includes(c.split('/')[1] + ': v["' + c + '"]'), c + ' entra no objeto fin da base');
});
['finClassificar', 'finCadastrarElemento', 'finLiquidar'].forEach((c) => ok(new RegExp('exports\\.' + c + ' = onCall\\([^\\n]*chamadaFin\\(').test(idx), 'callable ' + c));
console.log('financeiro F9 (servidor): ' + n + ' verificações OK');
