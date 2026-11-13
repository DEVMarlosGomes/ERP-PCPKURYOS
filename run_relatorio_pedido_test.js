'use strict';
/* Relatório de Pedido (2026-09-25): shared/relatorio-pedido.js sobre a
   ConciliacaoPedidos REAL. Itens do pedido pelo número exato, lotes por item,
   expedido/estoque iguais aos da conciliação, perdas por tipo (lançadas no
   apontamento vencem o Excel antigo; OP reemitida "-v2" herda a perda lançada
   no número do papel), linha "sem OP", CSV. */
const assert = require('node:assert/strict');
const C = require('./public/shared/conciliacao-pedidos.js');
const R = require('./public/shared/relatorio-pedido.js');
let n = 0;
function t(nome, fn) { fn(); n++; console.log('ok -', nome); }

const {base} = require('./run_relatorio_pedido_fixture.js');
const b = base();
const conc = C.calcular(b);
const rel = R.montar('0008', b, conc);

t('lista: um registro por número exato, cabeçalho comercial, mais recente em cima', () => {
  const l = R.listarPedidos(b.pedidos, b.pedidos_comerciais);
  assert.deepEqual(l.map((p) => p.id), ['0008', '05', '8'], '"8" e "0008" não se misturam');
  const p8 = l[0];
  assert.equal(p8.itens, 3);
  assert.equal(p8.abertos, 1, 'concluído e encerrado não contam como em aberto');
  assert.equal(p8.numeroCliente, 'PO-77');
});

t('itens do pedido e totais de produção', () => {
  assert.equal(rel.cliente, 'MISS ROSE');
  assert.deepEqual(rel.itens.map((i) => i.sku), ['MRARBS06', 'MRARBS07', 'MRARBS08']);
  const [a, bb, c] = rel.itens;
  assert.equal(a.aProduzir, 1000);
  assert.equal(a.atendidoPct, 90);
  assert.equal(bb.aProduzir, 0, 'produziu a mais: nada a produzir');
  assert.equal(c.aProduzir, 0, 'item encerrado não tem saldo a produzir');
  assert.equal(rel.totais.qtdPedido, 18000);
  assert.equal(rel.totais.produzido, 16700);
  assert.equal(rel.totais.aProduzir, 1000);
});

t('lotes por item: OP cancelada fora, produzido/expedido/estoque por lote', () => {
  const a = rel.itens[0];
  assert.deepEqual(a.lotes.map((l) => l.lote), ['26146/01', '26147/01']);
  const [l1, l2] = a.lotes;
  assert.equal(l1.expedido, 4800, 'carga cancelada não conta');
  assert.equal(l1.estoque, 200);
  assert.equal(l2.estoque, 3000);
  assert.equal(l1.linha, 'Linha 02');
  assert.equal(rel.totais.lotes, 4);
});

t('expedido e estoque do item são os da conciliação (mesma conta da tela de Pedidos)', () => {
  rel.itens.forEach((it) => {
    const r = conc.porPedido[it.key];
    assert.equal(it.expedido, r.expedido.total);
    assert.equal(it.estoque, r.estoque.total);
    assert.equal(it.situacao, r.situacao);
  });
  const mar = rel.itens[1];
  assert.equal(mar.expedido, 4900, 'devolução recebida estorna o expedido');
  assert.equal(mar.motivos.DEVOLVIDO, -100);
  assert.equal(rel.totais.expedido, 4800 + 4900 + 2500);
});

/* Perdas por COMPONENTE (pedido de 12/11/2026): o apontamento lança item a
   item (frasco 100 un, válvula 67 un), e o % de cada um é sobre o que foi
   separado para a OP -- ou, sem separação registrada, sobre o empenho
   (materiaisConsumo). Antes somava frasco + rótulo + válvula e dividia pelo
   produzido: PED-0007 mostrava 99,8% num lote com 21,6% de frasco e 23,9% de
   rótulo. */
const comp = (lista, chave) => lista.find((c) => c.chave === chave);

t('perdas: % de cada componente sobre o empenho da OP, nunca soma de tipos', () => {
  const l1 = rel.itens[0].lotes[0];
  const frasco = comp(l1.componentes, 'EP-1'), rotulo = comp(l1.componentes, 'ES-1'), valvula = comp(l1.componentes, 'EP-2');
  assert.deepEqual([frasco.perdido, frasco.base, frasco.baseOrigem, frasco.pct], [24, 5000, 'EMPENHO', 0.48], 'apontamento sem código liga ao único FRASCO da OP');
  assert.equal(frasco.tipo, 'Frascos');
  assert.equal(frasco.nome, 'FRASCO PET 120ML');
  assert.deepEqual([rotulo.perdido, rotulo.pct], [5, 0.1]);
  assert.deepEqual([valvula.perdido, valvula.pct], [2, 0.04], '"Outro: Válvula" liga à válvula da OP');
  assert.equal(l1.componentes.length, 3, 'material da fórmula sem perda não aparece');
  assert.ok(!('perdaPct' in l1), 'não existe mais % somando componentes');
  assert.deepEqual(rel.itens[0].lotes[1].componentes, []);
});

t('perdas: a base prefere o separado; sem separação do material, o empenho', () => {
  const b2 = base();
  b2.perdas['26147-01'] = {e: {lote: '26147/01', perdas: [
    {tipo: 'Frascos', quantidade: 6, materialCodigo: 'EP-1', materialNome: 'FRASCO PET 120ML', unidade: 'un', etapa: 'envase'},
    {tipo: 'Tampas/Válvulas', quantidade: 10, materialCodigo: 'EP-2', unidade: 'un'},
    {tipo: 'Produto envasado (un)', quantidade: 40, unidade: 'un', produto: true},
    {tipo: 'Bulk (kg)', quantidade: 1.5, unidade: 'kg', produto: true}]}};
  const l2 = R.montar('0008', b2, C.calcular(b2)).itens[0].lotes[1];
  assert.deepEqual([comp(l2.componentes, 'EP-1').base, comp(l2.componentes, 'EP-1').baseOrigem, comp(l2.componentes, 'EP-1').pct], [5200, 'SEPARADO', 0.12]);
  assert.deepEqual([comp(l2.componentes, 'EP-2').base, comp(l2.componentes, 'EP-2').baseOrigem], [5000, 'EMPENHO'], 'válvula não separada usa o empenho');
  assert.deepEqual(l2.perdasProduto, {'Produto envasado (un)': 40, 'Bulk (kg)': 1.5}, 'perda de produto fica fora dos componentes');
  assert.equal(l2.componentes.length, 2);
});

t('perdas do item: soma perdido e base de TODOS os lotes do item, componente a componente', () => {
  const it = rel.itens[0];
  const frasco = comp(it.componentes, 'EP-1');
  assert.deepEqual([frasco.perdido, frasco.base, frasco.baseOrigem, frasco.pct], [24, 10200, 'MISTA', 0.24], 'lote sem perda também entra na base');
  assert.deepEqual([comp(it.componentes, 'ES-1').base, comp(it.componentes, 'ES-1').pct], [10100, 0.05]);
  assert.deepEqual([comp(it.componentes, 'EP-2').base, comp(it.componentes, 'EP-2').baseOrigem], [10000, 'EMPENHO']);
});

t('perdas sem base: Excel antigo e OP sem empenho mostram a quantidade, sem %', () => {
  const sol = rel.itens[2];
  assert.deepEqual(sol.componentes.map((c) => [c.chave, c.tipo, c.perdido, c.base, c.pct]),
    [['TIPO:Rótulos', 'Rótulos', 12, null, null], ['TIPO:Cartuchos', 'Cartuchos', 3, null, null]]);
  assert.deepEqual(rel.itens[1].componentes.map((c) => [c.chave, c.perdido]), [['TIPO:Cartuchos', 16]], 'OP -v2 herda a perda do número do papel');
  const feb = R.montar('05', b, conc);
  const [orig, v2] = feb.itens[0].lotes;
  assert.deepEqual(orig.componentes.map((c) => [c.chave, c.perdido]), [['TIPO:Frascos', 9]]);
  assert.deepEqual(v2.componentes, [], 'lote original existe como OP: a perda não é duplicada na -v2');
});

t('perdas: tipo ambíguo, material fora da OP e lote sem empenho não inventam %', () => {
  const b3 = base();
  b3.ops['26146-01'].materiaisConsumo.b4 = {mpCodigo: 'EP-7', mpNome: 'FRASCO VIDRO 120ML', origem: 'bom', quantidade: 5000};
  b3.perdas['26146-01'] = {a: {lote: '26146/01', perdas: [{tipo: 'Frascos', quantidade: 20}, {tipo: 'Rótulos', quantidade: 3, materialCodigo: 'ES-9'}]}};
  b3.ops['26147-01'] = Object.assign({}, b3.ops['26147-01'], {materiaisConsumo: null, separacaoConcluida: null});
  b3.perdas['26147-01'] = {e: {lote: '26147/01', perdas: [{tipo: 'Rótulos', quantidade: 7, materialCodigo: 'ES-1'}]}};
  const it = R.montar('0008', b3, C.calcular(b3)).itens[0];
  const l1 = it.lotes[0];
  assert.deepEqual([comp(l1.componentes, 'TIPO:Frascos').perdido, comp(l1.componentes, 'TIPO:Frascos').pct], [20, null], 'dois frascos na OP: não escolhe um');
  assert.deepEqual([comp(l1.componentes, 'ES-9').base, comp(l1.componentes, 'ES-9').pct], [null, null], 'material que a OP não empenhou');
  const rot = comp(it.componentes, 'ES-1');
  assert.deepEqual([rot.perdido, rot.base, rot.pct, rot.baseIncompleta], [7, 5000, null, true], 'perda num lote sem empenho: % do item ficaria inflado');
});

t('perdas do pedido: componentes agregados de todos os itens', () => {
  const tot = rel.totais.componentes;
  assert.deepEqual(tot.map((c) => c.chave), ['EP-1', 'ES-1', 'TIPO:Rótulos', 'EP-2', 'TIPO:Cartuchos'], 'ordem: tipo, identificado antes, código');
  assert.deepEqual([comp(tot, 'EP-1').perdido, comp(tot, 'EP-1').pct], [24, 0.24]);
  assert.equal(comp(tot, 'TIPO:Cartuchos').perdido, 19);
});

t('produção e saída sem OP aparecem numa linha própria', () => {
  const c = rel.itens[2];
  assert.equal(c.semOp.produzido, 0);
  assert.equal(c.semOp.expedido, 2500, 'saída do legado sem OP');
  assert.equal(rel.itens[0].semOp.produzido, 1000, '9000 no pedido, 8000 nas OPs');
});

t('CSV: uma linha por lote e componente, com base e % de cada um', () => {
  const linhas = R.csv(rel).split('\r\n');
  assert.match(linhas[0], /;Lote;Status OP;Linha;Planejado;Produzido lote;Expedido lote;Em estoque lote;Componente;Código;Perdido;Base;Origem da base;% perda$/);
  assert.equal(linhas.length, 1 + 3 + 1 + 1 + 2, 'cabeçalho; 26146/01 com 3 componentes; 26147/01 sem perda; -v2 com 1; 26100/01 com 2');
  assert.match(linhas[1], /^0008;MISS ROSE;MRARBS06;BODY SPLASH CEU;10000;9000;1000;4800;3200;26146\/01;Concluído;Linha 02;5000;5000;4800;200;Frascos — FRASCO PET 120ML;EP-1;24;5000;Empenho;0,48$/);
  assert.match(linhas[4], /;26147\/01;Produção Parcial;Linha 02;5000;3000;0;3000;;;;;;$/);
  assert.equal(R.montar('nao-existe', b, conc), null);
});

console.log(`\n${n} testes ok`);
