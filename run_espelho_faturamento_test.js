'use strict';
/* Espelho do faturamento da Expedição no Financeiro (11/11/2026).
     node run_espelho_faturamento_test.js
   Liga o fluxo REAL do servidor (conferência de PA -> agenda -> solicitação de
   faturamento) ao espelho (public/shared/espelho-faturamento.js): o que a
   Expedição manda ao Financeiro tem de virar, palete a palete, código interno e
   externo, lote, fabricação, validade, caixas fechadas, avulsas, total, valor
   por caixa e unitário. */
const assert = require('node:assert/strict');
const {prepararFinalizacao} = require('./functions/conferencia_pa');
const {prepararAgenda} = require('./functions/agenda_expedicao');
const {prepararFaturamento} = require('./functions/faturamento_carga');
const CargasPA = require('./public/shared/cargas-pa.js');
const E = require('./public/shared/espelho-faturamento.js');

const clone = (x) => JSON.parse(JSON.stringify(x));
const agora = '2026-09-17T13:00:00.000Z';
let n = 0;
const ok = (m) => { n++; console.log('  ok  ' + m); };
function aplicar(base, updates) {
  for (const [path, value] of Object.entries(updates)) {
    const partes = path.split('/'); let no = base;
    for (const p of partes.slice(0, -1)) no = no[p] || (no[p] = {});
    no[partes.at(-1)] = clone(value);
  }
  return base;
}

// P1 = 12 cx × 24 + parcial 7 (295 un); P2 = 10 cx × 24 (240 un). Preço 2,70/un.
function fixture() {
  const op = {status: 'Concluído', sku: 'PA001', lote: '26254/01', produto: 'Creme', cliente: 'Cliente A', produzidoLinha: 535, skuPedidoKey: 'PED-001__PA001',
    dataEmissao: '2026-09-10T10:00:00.000Z', dataFimReal: '2026-09-15T18:30:00.000Z', validade: '2028-09-10T10:00:00.000Z'};
  const conf = {qtdApontada: 535, contagens: {c1: {total: 535, contadoEm: agora, paletes: {
    p1: {numero: 1, caixasFechadas: 12, unidadesPorCaixa: 24, unidadesCaixaParcial: 7, qtdUnidades: 295, enderecoKey: 'A1'},
    p2: {numero: 2, caixasFechadas: 10, unidadesPorCaixa: 24, unidadesCaixaParcial: 0, qtdUnidades: 240, enderecoKey: 'A1'}}}}};
  const base = {usuarios: {u1: {role: 'logistica', nome: 'Logística'}}, ops: {op1: op}, conferencias_pa: {op1: conf},
    enderecos_estoque: {A1: {codigo: 'PA-A1', ativo: true}}, estoque_lotes: {},
    produtos: {PA001: {sku: 'PA001', descricao: 'Creme', kgCaixa: 8, codCliente: 'CLI-7788'}},
    pedidos: {'PED-001__PA001': {id: 'PED-001', parentPedidoId: 'PED-001', sku: 'PA001', cliente: 'Cliente A', produzido: 535}},
    pedidos_comerciais: {'PED-001': {numeroFormatado: 'PED-001', clienteKey: 'c1', cliente: 'Cliente A', status: 'LIBERADO_PCP', numeroPedidoCliente: '34',
      frete: {tipo: 'FOB', enderecoEntrega: 'Rua A, 100'}, itens: [{sku: 'PA001', qtd: 600, valorUnitario: 2.7, expedido: 0}]}},
    clientes: {c1: {nome: 'Cliente A'}}};
  aplicar(base, prepararFinalizacao({opKey: 'op1', op, conf, enderecos: base.enderecos_estoque, lotesItem: {}, autor: 'Conferente', agora}).updates);
  for (const k of ['pa_op1_p1', 'pa_op1_p2']) {
    const p = base.estoque_lotes.PA001[k];
    p.status = 'LIBERADO_EXPEDICAO'; p.qualidade = {decisao: 'LIBERADO_EXPEDICAO', inspecionadoPor: 'CQ', em: agora};
  }
  return base;
}
const ref = (b, k, qtd) => ({itemKey: 'PA001', loteKey: k, quantidade: qtd == null ? b.estoque_lotes.PA001[k].saldoLote : qtd, enderecoKey: 'A1', skuPedidoKey: 'PED-001__PA001'});

// ── 1. Carga só agendada: espelho monta da agenda, sem preço
const b = fixture();
const agenda = prepararAgenda(b, {agendaKey: 'ag1', revisao: 0, dataAgendada: '2026-09-18', tipo: 'COLETA', transportadora: 'Transp X',
  paletes: [ref(b, 'pa_op1_p1'), ref(b, 'pa_op1_p2')]}, 'Logística', 'u1', agora);
b.agendamentos_expedicao = {ag1: agenda};
const antes = E.linhas(agenda, b);
assert.equal(antes.length, 2);
assert.equal(antes[0].origem, 'AGENDA');
assert.equal(antes[0].valorUnitario, null, 'sem preço antes de solicitar (nunca zero)');
assert.equal(antes[0].valorCaixa, null);
assert.equal(antes[0].caixasFechadas, 12);
assert.equal(antes[0].unidadesAvulsas, 7);
assert.equal(antes[0].totalUnidades, 295);
assert.equal(antes[0].codExterno, 'CLI-7788');
assert.equal(antes[0].fabricacao, '2026-09-15', 'fabricação = fim real da OP');
assert.equal(antes[0].validade, '2028-09-10', 'validade da OP quando o lote de PA não tem');
ok('carga só agendada: linhas dos paletes, códigos, fabricação e validade; preço vazio, não zero');

// ── 2. Solicitada: espelho usa o retrato que o servidor mandou ao Financeiro
const sol = prepararFaturamento(b, {agendaKey: 'ag1', revisao: 1, acao: 'SOLICITAR', solicitacaoId: 's1', observacoes: 'Coleta 8h'}, 'Logística', 'u1', agora);
b.agendamentos_expedicao.ag1 = sol.agenda;
const ls = E.linhas(sol.agenda, b);
assert.equal(ls[0].origem, 'SOLICITACAO');
assert.deepEqual(
  {sku: ls[0].sku, codExterno: ls[0].codExterno, descricao: ls[0].descricao, lote: ls[0].lote, fabricacao: ls[0].fabricacao, validade: ls[0].validade,
    caixasFechadas: ls[0].caixasFechadas, unidadesAvulsas: ls[0].unidadesAvulsas, totalUnidades: ls[0].totalUnidades,
    valorCaixa: ls[0].valorCaixa, valorUnitario: ls[0].valorUnitario, valorTotal: ls[0].valorTotal},
  {sku: 'PA001', codExterno: 'CLI-7788', descricao: 'Creme', lote: '26254/01', fabricacao: '2026-09-15', validade: '2028-09-10',
    caixasFechadas: 12, unidadesAvulsas: 7, totalUnidades: 295, valorCaixa: 64.8, valorUnitario: 2.7, valorTotal: 796.5});
assert.equal(ls[1].caixasFechadas, 10);
assert.equal(ls[1].unidadesAvulsas, 0);
const t = E.totais(ls);
assert.deepEqual([t.caixasFechadas, t.unidadesAvulsas, t.totalUnidades, t.valorTotal, t.semPreco], [22, 7, 535, 1444.5, 0]);
assert.equal(t.valorTotal, sol.solicitacao.totalValor, 'total do espelho = total que a Expedição mandou');
ok('carga solicitada: valor por caixa = unitário × caixa (2,70 × 24 = 64,80); totais batem com a solicitação');

// ── 3. Mesma régua da Expedição: aparece em "a faturar" e sai quando há NF
assert.deepEqual(CargasPA.listar(b.agendamentos_expedicao, 'faturamento', '').map((a) => a._key), ['ag1']);
const fat = prepararFaturamento(b, {agendaKey: 'ag1', revisao: 2, acao: 'REGISTRAR_NF', nf: {numero: '1500', serie: '1', valor: 1444.5, emitidaEm: '2026-09-17'}}, 'Financeiro', 'u1', agora);
b.agendamentos_expedicao.ag1 = fat.agenda;
assert.deepEqual(CargasPA.listar(b.agendamentos_expedicao, 'faturamento', '').map((a) => a._key), []);
assert.deepEqual(CargasPA.listar(b.agendamentos_expedicao, 'FATURADA', '').map((a) => a._key), ['ag1']);
assert.equal(E.linhas(fat.agenda, b)[0].valorUnitario, 2.7, 'depois da NF continua o retrato solicitado');
ok('filtros iguais aos da Expedição: a faturar → faturada com NF');

// ── 4. Palete desmembrado (lote novo com parte do saldo, mesmo múltiplo): caixas e
// avulsas saem das unidades desta carga, não das caixas registradas no lote de origem.
const b2 = fixture();
const l2 = E.linhas({paletes: [ref(b2, 'pa_op1_p1', 100)]}, b2)[0];
assert.deepEqual([l2.caixasFechadas, l2.unidadesAvulsas, l2.totalUnidades], [4, 4, 100], '100 un = 4 cx de 24 + 4 avulsas');
ok('palete desmembrado: 100 un viram 4 caixas fechadas + 4 avulsas');

// ── 5. O que falta aparece como falta (nunca inventado)
const b3 = fixture();
delete b3.produtos.PA001.codCliente;
delete b3.ops.op1.dataFimReal; delete b3.ops.op1.dataEmissao; delete b3.ops.op1.validade;
b3.pedidos_comerciais['PED-001'].itens[0].valorUnitario = 0;
const ag3 = prepararAgenda(b3, {agendaKey: 'ag3', revisao: 0, dataAgendada: '2026-09-18', tipo: 'COLETA', transportadora: 'T',
  paletes: [ref(b3, 'pa_op1_p2')]}, 'Logística', 'u1', agora);
b3.agendamentos_expedicao = {ag3: ag3};
const s3 = prepararFaturamento(b3, {agendaKey: 'ag3', revisao: 1, acao: 'SOLICITAR', solicitacaoId: 's3'}, 'Logística', 'u1', agora);
const l3 = E.linhas(s3.agenda, b3);
const t3 = E.totais(l3);
assert.equal(l3[0].valorUnitario, null);
assert.equal(l3[0].valorCaixa, null);
assert.equal(l3[0].codExterno, '');
assert.equal(l3[0].fabricacao, '');
assert.equal(l3[0].validade, '');
assert.deepEqual([t3.semPreco, t3.semCodExterno, t3.semFabricacao, t3.semValidade], [1, 1, 1, 1]);
const op4 = {dataEmissao: '2026-09-10T10:00:00.000Z'};
assert.equal(E.linhas({paletes: [{itemKey: 'X', loteKey: 'L', quantidade: 5}]}, {estoque_lotes: {X: {L: {opKey: 'o'}}}, ops: {o: op4}})[0].fabricacao, '2026-09-10', 'sem fim real, vale a emissão');
ok('sem preço, código externo, fabricação ou validade: fica vazio e é contado como falta');

// ── 6. CSV para Excel
const csv = E.csv([{cliente: 'Cliente A', dataAgendada: '2026-09-18', linhas: ls}]);
const linhasCsv = csv.replace(/^﻿/, '').split('\r\n');
assert.equal(linhasCsv[0], 'Cliente;Data agendada;Pedido;Palete;Código interno;Código externo;Descrição;Lote;Fabricação;Validade;Caixas fechadas;Unidades avulsas;Total de unidades;Valor por caixa;Valor unitário;Valor total');
assert.ok(linhasCsv[1].includes(';PA001;CLI-7788;Creme;26254/01;15/09/2026;10/09/2028;12;7;295;64,8;2,7;796,5'), linhasCsv[1]);
assert.equal(linhasCsv.length, 3);
ok('CSV com BOM, ";" e vírgula decimal, datas dd/mm/aaaa');

console.log('OK run_espelho_faturamento_test: ' + n + ' grupos.');
