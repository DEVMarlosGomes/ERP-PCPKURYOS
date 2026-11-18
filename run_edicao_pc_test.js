'use strict';
/* Edição de PC com justificativa (shared/edicao-pc.js, 18/11/2026). */
const assert = require('node:assert/strict');
const E = require('./public/shared/edicao-pc.js');

const pc = (extra) => Object.assign({
  status: 'ENVIADO', condicaoPagamento: '28 DDL', prazoEntregaDiasUteis: 10,
  itens: {
    a: {materialCodigo: 'MP-1', unidade: 'kg', qtd: 100, qtdCotada: 100, precoUnit: 10, qtdRecebida: 0},
    b: {materialCodigo: 'ET-1', unidade: 'rolo', qtd: 3, qtdCotada: 35, unidadeCotada: 'kg', precoUnit: 5, qtdRecebida: 0},
  },
}, extra || {});

// Quem e quando.
assert.equal(E.avaliarEdicao(pc(), 'pcp').pode, false, 'só ADM');
['ABERTO', 'ENVIADO', 'RECEBIDO_PARCIAL'].forEach((s) => assert.equal(E.avaliarEdicao(pc({status: s}), 'admin').pode, true, s));
['RECEBIDO_TOTAL', 'CANCELADO'].forEach((s) => assert.equal(E.avaliarEdicao(pc({status: s}), 'admin').pode, false, s));

// Justificativa obrigatória.
assert.ok(E.validarJustificativa('curta'));
assert.equal(E.validarJustificativa('Fornecedor reajustou o preço'), null);

// Saldo a receber segue a quantidade nova; item intocado fica igual.
assert.equal(E.qtdAReceberApos(pc().itens.a, {qtdCotada: 120, unidadeDiferente: false, qtdEmUnidadeEstoque: null}), 120);
assert.equal(E.qtdAReceberApos(pc().itens.a, {qtdCotada: 100, unidadeDiferente: false}), 100);
assert.equal(E.qtdAReceberApos(pc().itens.b, {qtdCotada: 35, unidadeDiferente: true, qtdEmUnidadeEstoque: 3}), 3, 'lote mínimo: qtd não mexe');
assert.equal(E.qtdAReceberApos(pc().itens.b, {qtdCotada: 47, unidadeDiferente: true, qtdEmUnidadeEstoque: 4.0286}), 4.0286, 'convertido para a unidade de estoque');

// Não desce abaixo do recebido.
const parcial = pc({status: 'RECEBIDO_PARCIAL'}); parcial.itens.a.qtdRecebida = 60;
assert.ok(E.conferirRecebido(parcial, {a: {qtd: 50}}));
assert.equal(E.conferirRecebido(parcial, {a: {qtd: 60}}), null);

// Revisão: de → para só do que mudou; sem mudança, recusa.
const mud = {'itens/a/precoUnit': 12, 'itens/a/qtdCotada': 100, condicaoPagamento: '28 DDL', prazoEntregaDiasUteis: 15, editadoEm: 'x'};
const r = E.montarRevisao(pc({revisao: 1}), mud, {papel: 'admin', justificativa: 'Reajuste confirmado por e-mail', autor: 'Ana', agora: '2026-11-18T10:00:00Z'});
assert.equal(r.revisao.numero, 2);
assert.deepEqual(r.revisao.alteracoes.map((a) => a.campo).sort(), ['itens/a/precoUnit', 'prazoEntregaDiasUteis']);
assert.equal(r.revisao.alteracoes.find((a) => a.campo === 'itens/a/precoUnit').antes, 10);
assert.equal(r.revisao.statusNoMomento, 'ENVIADO');
assert.ok(E.montarRevisao(pc(), {condicaoPagamento: '28 DDL'}, {papel: 'admin', justificativa: 'nada mudou aqui'}).erro);
assert.ok(!E.montarRevisao(pc(), {condicaoPagamento: '28 DDL'}, {papel: 'admin', justificativa: 'só a rota mudou', rotaAlterada: true}).erro);
assert.ok(E.montarRevisao(pc(), mud, {papel: 'admin', justificativa: 'x'}).erro, 'sem justificativa não grava');

// Histórico: mais recente primeiro.
const h = E.revisoes({edicoes: {k1: {numero: 1}, k2: {numero: 2}}});
assert.deepEqual(h.map((x) => x.numero), [2, 1]);

console.log('edicao-pc: ok');
