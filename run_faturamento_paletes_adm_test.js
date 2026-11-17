// Remontar/desmembrar palete da carga no Faturamento (só ADM, 17/11/2026).
// node run_faturamento_paletes_adm_test.js
'use strict';
const assert = require('assert');
const F = require('./public/shared/faturamento-paletes-adm.js');
let n = 0;
function t(nome, fn) { fn(); n++; console.log('ok -', nome); }

const carga = {status: 'AGENDADO', paletes: [
  {itemKey: 'SKU1', loteKey: 'pa_1_p1', quantidade: 600, enderecoKey: 'E1', skuPedidoKey: 'PED1', identificadorPalete: 'PA-1-P1'},
  {itemKey: 'SKU2', loteKey: 'pa_2_p1', quantidade: 300, enderecoKey: 'E2', skuPedidoKey: 'PED2', identificadorPalete: 'PA-2-P1'}
]};

t('ADM por role ou por função', function() {
  assert.strictEqual(F.ehAdmin({role: 'admin'}), true);
  assert.strictEqual(F.ehAdmin({role: 'logistica', funcoes: {admin: true}}), true);
  assert.strictEqual(F.ehAdmin({role: 'logistica', modulos: {expedicao: true}}), false);
  assert.strictEqual(F.ehAdmin(null), false);
});

t('desmembrar: original com saldo novo e os filhos entram com o pedido do original', function() {
  const lotes = {SKU1: {pa_1_p1: {saldoLote: 400, enderecoKey: 'E1'}, pa_1_p2: {saldoLote: 200, enderecoKey: 'E1'}}, SKU2: {pa_2_p1: {saldoLote: 300, enderecoKey: 'E2'}}};
  const r = F.paletesDepois(carga, lotes, [{itemKey: 'SKU1', loteKey: 'pa_1_p2', modeloRef: 'SKU1/pa_1_p1'}]);
  assert.strictEqual(r.erro, null);
  assert.deepStrictEqual(r.paletes, [
    {itemKey: 'SKU1', loteKey: 'pa_1_p1', quantidade: 400, enderecoKey: 'E1', skuPedidoKey: 'PED1'},
    {itemKey: 'SKU2', loteKey: 'pa_2_p1', quantidade: 300, enderecoKey: 'E2', skuPedidoKey: 'PED2'},
    {itemKey: 'SKU1', loteKey: 'pa_1_p2', quantidade: 200, enderecoKey: 'E1', skuPedidoKey: 'PED1'}
  ]);
  const total = r.paletes.reduce((s, p) => s + p.quantidade, 0);
  assert.strictEqual(total, 900, 'total da carga não muda');
});

t('remontar tudo para fora: palete zerado sai da carga', function() {
  const lotes = {SKU1: {pa_1_p1: {saldoLote: 0, enderecoKey: 'E1'}}, SKU2: {pa_2_p1: {saldoLote: 300, enderecoKey: 'E2'}}};
  const r = F.paletesDepois(carga, lotes, []);
  assert.deepStrictEqual(r.paletes.map(p => p.loteKey), ['pa_2_p1']);
  assert.deepStrictEqual(r.removidos, ['PA-1-P1']);
});

t('carga sem palete nenhum é recusada antes do servidor', function() {
  const r = F.paletesDepois({paletes: [carga.paletes[0]]}, {SKU1: {pa_1_p1: {saldoLote: 0}}}, []);
  assert.ok(r.erro && /sem paletes/.test(r.erro));
});

t('destino já na carga não duplica', function() {
  const lotes = {SKU1: {pa_1_p1: {saldoLote: 600, enderecoKey: 'E1'}}, SKU2: {pa_2_p1: {saldoLote: 300, enderecoKey: 'E2'}}};
  const r = F.paletesDepois(carga, lotes, [{itemKey: 'SKU2', loteKey: 'pa_2_p1', modeloRef: 'SKU1/pa_1_p1'}]);
  assert.strictEqual(r.paletes.length, 2);
  assert.strictEqual(r.paletes[1].skuPedidoKey, 'PED2', 'mantém o vínculo de quem já estava');
});

t('divergências: carga × estoque', function() {
  assert.deepStrictEqual(F.divergencias(carga, {SKU1: {pa_1_p1: {saldoLote: 600, enderecoKey: 'E1'}}, SKU2: {pa_2_p1: {saldoLote: 300, enderecoKey: 'E2'}}}), []);
  assert.deepStrictEqual(F.divergencias(carga, {SKU1: {pa_1_p1: {saldoLote: 400, enderecoKey: 'E1'}}, SKU2: {pa_2_p1: {saldoLote: 300, enderecoKey: 'E2'}}}),
    [{palete: 'PA-1-P1', naCarga: 600, noEstoque: 400}]);
});

t('outra carga ativa trava; esta carga e carga encerrada não', function() {
  const agendas = {A: carga, B: {status: 'AGENDADO', paletes: [{itemKey: 'SKU9', loteKey: 'x', quantidade: 10}]}, C: {status: 'CANCELADO', paletes: [{itemKey: 'SKU8', loteKey: 'y', quantidade: 10}]}};
  assert.strictEqual(F.emOutraCarga(agendas, 'A', 'SKU1', 'pa_1_p1'), false);
  assert.strictEqual(F.emOutraCarga(agendas, 'A', 'SKU9', 'x'), true);
  assert.strictEqual(F.emOutraCarga(agendas, 'A', 'SKU8', 'y'), false);
});

console.log(n + ' testes OK');
