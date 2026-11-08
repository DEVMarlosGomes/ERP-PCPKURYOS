const assert = require('assert');
const logistica = require('./public/shared/dashboard-logistica');

const cargas = {
  C1: { numero: 'EXP-1', data: '2026-11-03', cliente: 'Cliente A', transportadora: 'T', itens: {
    I1: { sku: 'SKU1', opLote: '26001/01', qtd: 125, caixasFechadas: 2,
      unidadesCaixaParcial: 25, unidadesPorCaixa: 50, pesoPorCaixaKg: 10,
      dataFabricacao: '2026-11-01' }
  } }
};
const estoque = {
  SKU1: {
    L1: { itemTipo: 'produto', itemCodigo: 'SKU1', saldoLote: 120, unidadesPorCaixa: 50,
      cliente: 'Cliente A', opLote: '26002/01', criadoEm: '2026-11-05T10:00:00Z' },
    L2: { itemTipo: 'produto', itemCodigo: 'SKU1', saldoLote: 0 },
    L3: { itemTipo: 'produto', itemCodigo: 'SKU1', saldoLote: 50, expedicaoId: 'C1' }
  },
  MP1: { L4: { itemTipo: 'material', saldoLote: 99 } }
};
const linhas = logistica.montar(cargas, estoque, { SKU1: { kgCaixa: 10, unCx: 50 } }, '2026-11-08');
assert.equal(linhas.length, 2, 'deve trazer uma saída e somente o lote disponível de PA');
assert.equal(linhas[0].nf, 'EXP-1');
assert.equal(linhas[0].status, '2) Expedido');
assert.equal(linhas[0].cx, 3);
assert.equal(linhas[0].dias_stk, 2);
assert.equal(linhas[1].status, '1) Em estoque');
assert.equal(linhas[1].cx, 3, '120 unidades em caixas de 50 = 2 fechadas + 1 parcial');
assert.equal(linhas[1].carga, 24, 'peso deve considerar proporcionalmente a caixa parcial');
assert.equal(linhas[1].dias_stk, 3);
console.log('dashboard-logistica: 9 verificações aprovadas');
