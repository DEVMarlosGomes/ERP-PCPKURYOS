'use strict';
/* Itens e fornecedores do formulário de RNC (public/shared/rnc-itens.js).
   Com a cópia local da base (scratch/full-post-sku-20261106.json), confere
   também contra os dados reais. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const R = require('./public/shared/rnc-itens.js');
let n = 0;

const fornecedores = {
  '-Fa': {nomeFantasia: 'COLORMIX', razaoSocial: 'COLORMIX INDUSTRIA LTDA', ativo: true},
  '-Fb': {razaoSocial: 'TC QUIMICA LTDA', ativo: true},
  '-Fc': {nomeFantasia: 'ANTIGO', ativo: false},
  '-Fd': {nome: 'LEGADO'}
};
const produtos = {
  AMABBS01: {sku: 'AMABBS01', descricao: 'BODY MIST TESOURO DO OASIS 250ML', cliente: 'AMEERATI', clienteKey: 'AMEE', ean13: '7891234567890', ativo: 'Ativo'},
  'KUBPBA01-2': {sku: 'KUBPBA01 - 2', descricao: 'CREME KUBE', cliente: 'KUBE', ativo: 'Inativo'}
};
const materiais = {
  'EP-00001': {mpCodigo: 'EP-00001', mpNome: 'VALVULA SPRAY R.24/410 PRETA', ativo: true, fornecedores: {'-Fa': {nomeComercial: 'VÁLVULA BRUMA MATTE'}, '-Zz': {}}},
  'MPGR-010': {mpCodigo: 'MPGR-010', mpNome: 'ÁLCOOL DE CEREAIS', ativo: false, fornecedores: {'-Fa': {}, '-Fb': {}}}
};

// Nome do fornecedor: nenhum cadastro tem `nome`; antes a lista mostrava a chave.
assert.equal(R.nomeFornecedor(fornecedores['-Fa'], '-Fa'), 'COLORMIX'); n++;
assert.equal(R.nomeFornecedor(fornecedores['-Fb'], '-Fb'), 'TC QUIMICA LTDA'); n++;
assert.equal(R.nomeFornecedor(fornecedores['-Fd'], '-Fd'), 'LEGADO'); n++;
assert.equal(R.nomeFornecedor(undefined, '-X'), '-X'); n++;
assert.deepEqual(R.listaFornecedores(fornecedores).map((f) => f.nome), ['COLORMIX', 'LEGADO', 'TC QUIMICA LTDA'], 'inativo fora, ordem por nome'); n++;
assert.ok(R.listaFornecedores(fornecedores, '-Fc').some((f) => f.key === '-Fc'), 'inativo já escolhido continua na lista'); n++;

const cat = R.catalogoItens(produtos, materiais);
assert.equal(cat.length, 4); n++;
const cod = (texto) => R.buscarItens(cat, texto).map((i) => i.codigo);
assert.deepEqual(cod('amabbs01'), ['AMABBS01'], 'SKU sem diferença de caixa'); n++;
assert.deepEqual(cod('body mist oasis'), ['AMABBS01'], 'palavras soltas do nome'); n++;
assert.deepEqual(cod('ameerati'), ['AMABBS01'], 'pelo cliente'); n++;
assert.deepEqual(cod('7891234567890'), ['AMABBS01'], 'pelo EAN'); n++;
assert.deepEqual(cod('alcool'), ['MPGR-010'], 'sem acento'); n++;
assert.deepEqual(cod('bruma matte'), ['EP-00001'], 'pelo nome comercial do fornecedor'); n++;
assert.deepEqual(cod(''), []); n++;
assert.equal(R.buscarItens(cat, 'a').slice(-1)[0].inativo, true, 'inativos por último'); n++;

// Resolver: código, chave ou o rótulo escolhido na lista.
assert.equal(R.resolverItem(cat, 'ep-00001').key, 'EP-00001'); n++;
assert.equal(R.resolverItem(cat, R.rotuloItem(R.resolverItem(cat, 'AMABBS01'))).key, 'AMABBS01'); n++;
assert.equal(R.resolverItem(cat, 'KUBPBA01 - 2').key, 'KUBPBA01-2', 'SKU com espaço resolve para a chave'); n++;
assert.equal(R.resolverItem(cat, 'body mist'), null, 'texto solto não é item'); n++;
assert.equal(R.rotuloItem(R.resolverItem(cat, 'AMABBS01')), 'AMABBS01 — BODY MIST TESOURO DO OASIS 250ML'); n++;
const prod = R.resolverItem(cat, 'AMABBS01');
assert.deepEqual([prod.tipo, prod.cliente, prod.clienteKey], ['produto', 'AMEERATI', 'AMEE']); n++;

// Fornecedores do item: só os que existem no cadastro.
assert.deepEqual(R.fornecedoresDoItem(R.resolverItem(cat, 'EP-00001'), fornecedores), [{key: '-Fa', nome: 'COLORMIX'}]); n++;
assert.equal(R.fornecedoresDoItem(R.resolverItem(cat, 'MPGR-010'), fornecedores).length, 2); n++;
assert.deepEqual(R.fornecedoresDoItem(prod, fornecedores), []); n++;
assert.deepEqual(R.fornecedoresDoItem(null, fornecedores), []); n++;

// Base real, quando a cópia local existe.
const arq = 'scratch/full-post-sku-20261106.json';
if (fs.existsSync(arq)) {
  const d = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const real = R.catalogoItens(d.produtos, d.materiais);
  assert.equal(real.length, Object.keys(d.produtos).length + Object.keys(d.materiais).length); n++;
  const lista = R.listaFornecedores(d.fornecedores);
  assert.ok(lista.length > 400 && lista.every((f) => f.nome && f.nome !== f.key), 'todo fornecedor ativo tem nome legível'); n++;
  assert.equal(R.resolverItem(real, 'amabbs01').key, 'AMABBS01'); n++;
  assert.equal(R.buscarItens(real, 'tesouro oasis')[0].codigo.indexOf('AMAB'), 0); n++;
  const ep = R.resolverItem(real, 'EP-00001');
  assert.ok(R.fornecedoresDoItem(ep, d.fornecedores).length >= 1, 'material real traz fornecedor do cadastro'); n++;
  const t0 = Date.now(); for (let i = 0; i < 50; i++) R.buscarItens(real, 'body splash');
  assert.ok(Date.now() - t0 < 1000, 'busca rápida o bastante para cada tecla'); n++;
}
console.log('rnc-itens: ' + n + ' asserções OK');
