'use strict';
/* Manter aprovação da versão anterior quando BOM/Especificação não mudou
   (shared/aprovacao-herdada.js, 19/11/2026). Caso real: PRF-BIOF-0008 v2, BOM
   copiado igual da v1 em RASCUNHO travava a versão nova na Emissão de OP. */
const assert = require('node:assert/strict');
const H = require('./public/shared/aprovacao-herdada.js');

const item = (cod, q, extra) => Object.assign({materialCodigo: cod, materialNome: 'Nome ' + cod, posicao: 1, qtdPorPeca: q}, extra || {});
const bom = {
  'P1__v1': {codProduto: 'P1', versao: 'v1', status: 'APROVADA', itens: {a: item('EP-1', 1), b: item('ET-1', '0.166667')}},
  'P1__v2': {codProduto: 'P1', versao: 'v2', status: 'RASCUNHO', itens: {x: item('ET-1', 0.166667, {posicao: 2, materialNome: 'Outro nome'}), y: item('EP-1', 1)}},
};

// Idêntico por conteúdo: chave, ordem, nome de exibição e número em texto não importam.
assert.deepEqual(H.versaoAprovadaIgual('bom', 'P1', 'v2', bom), {versao: 'v1', chave: 'P1__v1'});

// Qualquer diferença real derruba: quantidade, material, regra de peças, item a mais.
const mut = (fn) => { const c = JSON.parse(JSON.stringify(bom)); fn(c); return c; };
assert.equal(H.versaoAprovadaIgual('bom', 'P1', 'v2', mut((c) => { c['P1__v2'].itens.y.qtdPorPeca = 2; })), null, 'quantidade');
assert.equal(H.versaoAprovadaIgual('bom', 'P1', 'v2', mut((c) => { c['P1__v2'].itens.y.materialCodigo = 'EP-2'; })), null, 'material');
assert.equal(H.versaoAprovadaIgual('bom', 'P1', 'v2', mut((c) => { c['P1__v2'].itens.y.pecasPorUnidade = 60; })), null, 'campo novo');
assert.equal(H.versaoAprovadaIgual('bom', 'P1', 'v2', mut((c) => { c['P1__v2'].itens.z = item('EP-9', 1); })), null, 'item a mais');
assert.equal(H.versaoAprovadaIgual('bom', 'P1', 'v2', mut((c) => { delete c['P1__v2'].itens.y; })), null, 'item a menos');

// Só a última aprovada anterior conta; anterior em rascunho não serve; vazio não herda.
const tres = mut((c) => {
  c['P1__v2'].status = 'APROVADA';
  c['P1__v2'].itens.y.qtdPorPeca = 2; // v2 aprovada diferente
  c['P1__v3'] = {versao: 'v3', status: 'RASCUNHO', itens: JSON.parse(JSON.stringify(bom['P1__v1'].itens))}; // igual à v1, não à v2
});
assert.equal(H.versaoAprovadaIgual('bom', 'P1', 'v3', tres), null, 'igual só a uma aprovada mais antiga: revisão');
const tresOk = mut((c) => { c['P1__v2'].status = 'APROVADA'; c['P1__v3'] = {versao: 'v3', status: 'RASCUNHO', itens: JSON.parse(JSON.stringify(c['P1__v2'].itens))}; });
assert.equal(H.versaoAprovadaIgual('bom', 'P1', 'v3', tresOk).versao, 'v2');
assert.equal(H.versaoAprovadaIgual('bom', 'P1', 'v2', mut((c) => { c['P1__v1'].status = 'RASCUNHO'; })), null, 'anterior não aprovada');
assert.equal(H.versaoAprovadaIgual('bom', 'P1', 'v2', mut((c) => { c['P1__v2'].itens = {}; })), null, 'sem itens');
assert.equal(H.versaoAprovadaIgual('bom', 'P1', 'v2', mut((c) => { c['P1__v2'].status = 'APROVADA'; })), null, 'já aprovada');
assert.equal(H.versaoAprovadaIgual('bom', 'P1', 'v1', bom), null, 'sem anterior');
assert.equal(H.versaoAprovadaIgual('formulas', 'P1', 'v2', bom), null, 'fórmula fica de fora');
// Outro produto com prefixo parecido não conta.
assert.equal(H.versaoAprovadaIgual('bom', 'P1', 'v2', mut((c) => { c['P10__v1'] = c['P1__v1']; delete c['P1__v1']; })), null);

// Especificação: mesmo princípio (ensaio, faixa, método, crítico).
const espec = {
  'P1__v1': {status: 'APROVADA', itens: {e1: {ensaio: 'pH', minimo: 5, maximo: 7, metodo: 'M1', critico: true}}},
  'P1__v2': {status: 'RASCUNHO', itens: {k: {ensaio: 'pH', minimo: '5', maximo: '7', metodo: 'M1', critico: true}}},
};
assert.equal(H.versaoAprovadaIgual('especificacoes', 'P1', 'v2', espec).versao, 'v1');
espec['P1__v2'].itens.k.maximo = 7.5;
assert.equal(H.versaoAprovadaIgual('especificacoes', 'P1', 'v2', espec), null);

// O que grava: as duas etapas com o mesmo carimbo marcado herdadaDe, status, data e o registro da herança.
const u = H.mudancas({campo1: 'aprovadoPCP', campo2: 'aprovadoComercial'}, {versao: 'v1', chave: 'P1__v1'}, {nome: 'Adlai', uid: 'u1', agora: '2026-11-19T10:00:00Z'});
assert.equal(u.status, 'APROVADA');
assert.equal(u.dataAprovacao, '2026-11-19T10:00:00Z');
assert.deepEqual(u.aprovadoPCP, {nome: 'Adlai', uid: 'u1', em: '2026-11-19T10:00:00Z', herdadaDe: 'v1'});
assert.deepEqual(u.aprovadoComercial, u.aprovadoPCP);
assert.deepEqual(u.aprovacaoHerdada, {daVersao: 'v1', daChave: 'P1__v1', por: 'Adlai', porUid: 'u1', em: '2026-11-19T10:00:00Z'});

console.log('OK aprovação mantida: idêntico por conteúdo, qualquer diferença derruba, só a última aprovada, BOM e Especificação.');
