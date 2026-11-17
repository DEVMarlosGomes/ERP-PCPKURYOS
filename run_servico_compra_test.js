'use strict';
/* Linha de SERVIÇO na compra (16/11/2026) -- shared/servico-compra.js.
   Orçamento de conserto, assistência técnica ou calibração externa não é
   material: não tem SKU, não entra no estoque e não passa pelo recebimento
   físico da Logística (o servidor recusa item sem SKU interno). Compras atesta
   que o serviço foi prestado, e o status do PC segue a MESMA regra do
   servidor (functions/recebimento.js:statusPedidoApos). */
const assert = require('node:assert/strict');
const S = require('./public/shared/servico-compra.js');
const {statusPedidoApos} = require('./functions/recebimento.js');
let n = 0; const ok = (nome, fn) => { fn(); n++; console.log('ok -', nome); };

const pc = (itens, status) => ({numeroFormatado: 'PC-0090', status: status || 'ENVIADO', itens});
const peca = {materialCodigo: 'MN-00001', materialNome: 'ROLAMENTO 6204', qtd: 2, unidade: 'un', qtdRecebida: 0};
const serv = {tipoItem: 'SERVICO', descricao: 'Revisão da envasadora EV-01', materialCodigo: '', materialNome: 'Revisão da envasadora EV-01', qtd: 1, unidade: 'SV', qtdRecebida: 0};

ok('ehServico / nome do item', () => {
  assert.equal(S.ehServico(serv), true);
  assert.equal(S.ehServico(peca), false);
  assert.equal(S.ehServico(null), false);
  assert.equal(S.nomeItem(serv), 'Revisão da envasadora EV-01');
  assert.equal(S.nomeItem({tipoItem: 'SERVICO', descricao: 'Calibração'}), 'Calibração');
  assert.equal(S.nomeItem(peca), 'ROLAMENTO 6204');
});

ok('linhaServico: descrição obrigatória, quantidade > 0', () => {
  assert.deepEqual(S.linhaServico({descricao: '  Conserto do motor  ', qtd: '1'}),
    {tipoItem: 'SERVICO', descricao: 'Conserto do motor', materialCodigo: '', materialNome: 'Conserto do motor', qtd: 1, unidade: 'SV', obs: ''});
  assert.match(S.linhaServico({descricao: 'abc', qtd: 1}).erro, /Descreva o serviço/);
  assert.match(S.linhaServico({descricao: 'Conserto do motor', qtd: 0}).erro, /quantidade/);
});

ok('itens físicos: Logística só recebe o que é material', () => {
  const p = pc({a: peca, b: serv});
  assert.deepEqual(S.itensFisicos(p).map(([k]) => k), ['a']);
  assert.equal(S.soServico(p), false);
  assert.equal(S.soServico(pc({b: serv})), true, 'PC só de serviço não vai para a fila da Logística');
  assert.equal(S.soServico(pc({})), false);
  assert.deepEqual(S.servicosPendentes(p).map(([k]) => k), ['b']);
});

ok('atestar serviço: marca recebido e recalcula o status pela regra do servidor', () => {
  const p = pc({a: peca, b: serv});
  const r = S.atestar('pc1', p, 'b', {por: 'Ana', agora: '2026-11-16T10:00:00Z', obs: 'NF 123 do prestador'});
  assert.equal(r.updates['pedidos_compra/pc1/itens/b/qtdRecebida'], 1);
  assert.deepEqual(r.updates['pedidos_compra/pc1/itens/b/atestado'], {por: 'Ana', em: '2026-11-16T10:00:00Z', obs: 'NF 123 do prestador'});
  // Peça ainda não chegou: parcial, igual ao servidor.
  assert.equal(r.updates['pedidos_compra/pc1/status'], 'RECEBIDO_PARCIAL');
  assert.equal(r.updates['pedidos_compra/pc1/status'], statusPedidoApos(p.itens, {b: 1}, p.status).status);
  // Só serviço: atestar fecha o PC.
  const so = S.atestar('pc2', pc({b: serv}), 'b', {por: 'Ana', agora: 'x'});
  assert.equal(so.updates['pedidos_compra/pc2/status'], 'RECEBIDO_TOTAL');
  // Peça já recebida: atestar o serviço fecha.
  const tudo = S.atestar('pc3', pc({a: Object.assign({}, peca, {qtdRecebida: 2}), b: serv}, 'RECEBIDO_PARCIAL'), 'b', {por: 'Ana', agora: 'x'});
  assert.equal(tudo.updates['pedidos_compra/pc3/status'], 'RECEBIDO_TOTAL');
});

ok('atestar: recusas', () => {
  assert.match(S.atestar('pc1', pc({a: peca}), 'a', {por: 'x', agora: 'y'}).erro, /só para linha de serviço/);
  assert.match(S.atestar('pc1', pc({b: Object.assign({}, serv, {qtdRecebida: 1})}), 'b', {por: 'x', agora: 'y'}).erro, /já foi atestado/);
  assert.match(S.atestar('pc1', pc({b: serv}, 'CANCELADO'), 'b', {por: 'x', agora: 'y'}).erro, /cancelado/);
  assert.match(S.atestar('pc1', pc({b: serv}, 'ABERTO'), 'b', {por: 'x', agora: 'y'}).erro, /enviado ao fornecedor/);
  assert.match(S.atestar('pc1', pc({}), 'z', {por: 'x', agora: 'y'}).erro, /não pertence/);
});

console.log(n + ' testes ok');
