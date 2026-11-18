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
assert.equal(E.avaliarEdicao(pc(), 'pcp').pode, false, 'papel em texto: só admin');
// Setor de Compras (18/11: "além do adm quem é do setor também pode").
assert.equal(E.avaliarEdicao(pc(), {admin: false, compras: true}).pode, true, 'setor de Compras edita');
assert.equal(E.avaliarEdicao(pc(), {admin: true, compras: false}).pode, true, 'ADM edita');
assert.equal(E.avaliarEdicao(pc(), {admin: false, compras: false}).pode, false, 'fora do setor não edita');
assert.ok(!E.montarRevisao(pc(), {prazoEntregaDiasUteis: 20}, {acesso: {compras: true}, justificativa: 'Fornecedor pediu mais prazo'}).erro);
assert.ok(E.montarRevisao(pc(), {prazoEntregaDiasUteis: 20}, {acesso: {}, justificativa: 'Fornecedor pediu mais prazo'}).erro);
// Qualquer status (18/11: "edições devem ser para qualquer pedido").
['ABERTO', 'ENVIADO', 'RECEBIDO_PARCIAL', 'RECEBIDO_TOTAL', 'CANCELADO'].forEach((s) => assert.equal(E.avaliarEdicao(pc({status: s}), 'admin').pode, true, s));
assert.equal(E.avaliarEdicao(pc({status: 'CANCELADO'}), {compras: true}).pode, true, 'setor também em qualquer status');

// Status depois da edição: recebido total com quantidade maior reabre; parcial baixado ao recebido fecha; cancelado fica.
const total = pc({status: 'RECEBIDO_TOTAL'}); total.itens.a.qtdRecebida = 100; total.itens.b.qtdRecebida = 3;
const reaberto = E.montarRevisao(total, {'itens/a/qtd': 150, 'itens/a/qtdCotada': 150}, {papel: 'admin', justificativa: 'Fornecedor vai mandar mais 50 kg'});
assert.equal(reaberto.revisao.statusApos, 'RECEBIDO_PARCIAL');
assert.deepEqual(reaberto.revisao.alteracoes.find((a) => a.campo === 'status'), {campo: 'status', rotulo: 'Status', item: null, antes: 'RECEBIDO_TOTAL', depois: 'RECEBIDO_PARCIAL'});
const soPreco = E.montarRevisao(total, {'itens/a/precoUnit': 11}, {papel: 'admin', justificativa: 'Preço corrigido pela NF'});
assert.equal(soPreco.revisao.statusApos, 'RECEBIDO_TOTAL');
assert.ok(!soPreco.revisao.alteracoes.some((a) => a.campo === 'status'));
const par = pc({status: 'RECEBIDO_PARCIAL'}); par.itens.a.qtdRecebida = 60; par.itens.b.qtdRecebida = 3;
assert.equal(E.montarRevisao(par, {'itens/a/qtd': 60, 'itens/a/qtdCotada': 60}, {papel: 'admin', justificativa: 'Restante não vem mais'}).revisao.statusApos, 'RECEBIDO_TOTAL');
assert.equal(E.montarRevisao(pc({status: 'CANCELADO'}), {'itens/a/precoUnit': 9}, {papel: 'admin', justificativa: 'Corrige o preço do registro'}).revisao.statusApos, 'CANCELADO');
assert.equal(E.montarRevisao(pc(), {'itens/a/qtd': 200, 'itens/a/qtdCotada': 200}, {papel: 'admin', justificativa: 'Aumento combinado'}).revisao.statusApos, 'ENVIADO');
// aplicarMudancas não muda o original e apaga com null.
const orig = pc(); const dep = E.aplicarMudancas(orig, {'frete/valor': 30, prazoEntregaDiasUteis: null});
assert.equal(dep.frete.valor, 30); assert.equal('prazoEntregaDiasUteis' in dep, false); assert.equal(orig.prazoEntregaDiasUteis, 10);

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

// ── Cancelar e adicionar material (18/11): cancelado fica no pedido como histórico ──
{
  const base = pc({status: 'RECEBIDO_PARCIAL'});
  base.itens.a.qtdRecebida = 40; // 40 de 100 kg
  // Cancelar: saldo zera pelo qtd (= recebido); cotada proporcional; quantidades antes guardadas.
  const mc = E.mudancasCancelarItem(base.itens.a, {motivo: 'Fornecedor sem estoque', autor: 'Ana', agora: '2026-11-18T12:00:00Z'});
  assert.equal(mc.cancelado, true);
  assert.equal(mc.qtd, 40);
  assert.equal(mc.qtdCotada, 40);
  assert.equal(mc.qtdEmUnidadeEstoque, 40);
  assert.deepEqual([mc.cancelamento.qtdAntes, mc.cancelamento.qtdRecebida, mc.cancelamento.motivo], [100, 40, 'Fornecedor sem estoque']);
  const b = E.mudancasCancelarItem(base.itens.b, {}); // 0 recebido, cotado em kg
  assert.deepEqual([b.qtd, b.qtdCotada, b.qtdEmUnidadeEstoque], [0, 0, 0]);
  // Quem pode cancelar.
  assert.equal(E.avaliarCancelarItem(base, 'a'), null);
  const cheio = pc(); cheio.itens.a.qtdRecebida = 100;
  assert.match(E.avaliarCancelarItem(cheio, 'a'), /recebido por inteiro/);
  assert.match(E.avaliarCancelarItem(pc({status: 'CANCELADO'}), 'a'), /cancelado/);
  assert.ok(E.validarMotivoItem('abc'));
  assert.equal(E.validarMotivoItem('Fornecedor descontinuou'), null);

  // Revisão: uma linha "Material cancelado", sem repetir a queda de quantidade; status recalculado.
  const rel = {};
  Object.keys(mc).forEach((c) => { rel['itens/a/' + c] = mc[c]; });
  base.itens.b.qtdRecebida = 3; // b já completo -> com a cancelado, pedido fecha
  const r = E.montarRevisao(base, rel, {acesso: {compras: true}, justificativa: 'Fornecedor não tem o restante'});
  assert.ok(!r.erro, r.erro);
  const linhasA = r.revisao.alteracoes.filter((x) => x.item === 'MP-1');
  assert.equal(linhasA.length, 1);
  assert.equal(linhasA[0].rotulo, 'Material cancelado');
  assert.match(linhasA[0].depois, /fica o recebido: 40 kg/);
  assert.match(linhasA[0].depois, /Fornecedor sem estoque/);
  assert.equal(r.revisao.statusApos, 'RECEBIDO_TOTAL');
  const depois = E.aplicarMudancas(base, rel);
  assert.ok(depois.itens.a, 'item cancelado continua no pedido');
  assert.equal(E.saldoItem(depois.itens.a), 0);

  // Tudo cancelado sem nada recebido = cancelar o pedido: recusado.
  const env = pc();
  const tudo = {};
  ['a', 'b'].forEach((k) => { const m = E.mudancasCancelarItem(env.itens[k], {motivo: 'x x x x x'}); Object.keys(m).forEach((c) => { tudo['itens/' + k + '/' + c] = m[c]; }); });
  assert.match(E.montarRevisao(env, tudo, {papel: 'admin', justificativa: 'Cancelando tudo de uma vez'}).erro, /cancelar o pedido inteiro/);

  // Adicionar: item no formato do PC direto, saldo pela unidade de estoque, vínculo do pedido.
  const comVinc = pc(); comVinc.itens.a.vinculo = {geral: true};
  assert.deepEqual(E.vinculoSugerido(comVinc), {geral: true});
  const novo = E.novoItem({materialCodigo: 'MP-9', materialNome: 'Óleo', unidade: 'kg', qtdCotada: 25, precoUnit: 8,
    vinculo: {geral: true}, autor: 'Ana', agora: '2026-11-18T12:00:00Z', revisao: 3});
  assert.deepEqual([novo.qtd, novo.qtdRecebida, novo.adicionado.revisao, novo.origemSolicitacaoKey], [25, 0, 3, null]);
  const conv = E.novoItem({materialCodigo: 'ET-9', unidade: 'rolo', qtdCotada: 35, unidadeCotada: 'kg', unidadeDiferente: true, qtdEmUnidadeEstoque: 3});
  assert.equal(conv.qtd, 3, 'saldo na unidade de estoque');
  const ra = E.montarRevisao(comVinc, {'itens/n1': novo}, {papel: 'admin', justificativa: 'Faltou o óleo no pedido'});
  assert.ok(!ra.erro, ra.erro);
  assert.equal(ra.revisao.alteracoes[0].rotulo, 'Material adicionado');
  assert.equal(ra.revisao.alteracoes[0].item, 'MP-9');
  // Duplicado, sem material, sem quantidade e em pedido cancelado: recusados.
  assert.match(E.montarRevisao(comVinc, {'itens/n1': E.novoItem({materialCodigo: 'MP-1', qtdCotada: 5})}, {papel: 'admin', justificativa: 'duplicando material'}).erro, /já está no pedido/);
  assert.match(E.conferirItens(comVinc, {'itens/n1': E.novoItem({qtdCotada: 5})}), /Escolha o material/);
  assert.match(E.conferirItens(comVinc, {'itens/n1': E.novoItem({materialCodigo: 'MP-9', qtdCotada: 0})}), /quantidade/);
  assert.match(E.conferirItens(pc({status: 'CANCELADO'}), {'itens/n1': novo}), /cancelado/);
  // Material cancelado pode voltar como linha nova (não é duplicado).
  const relC = {}; Object.keys(mc).forEach((c) => { relC['itens/a/' + c] = mc[c]; });
  const comCanc = E.aplicarMudancas(pc(), relC);
  assert.equal(E.conferirItens(comCanc, {'itens/n2': E.novoItem({materialCodigo: 'MP-1', qtdCotada: 10})}), null);
  // RECEBIDO_TOTAL + material novo reabre o pedido.
  const tot = pc({status: 'RECEBIDO_TOTAL'}); tot.itens.a.qtdRecebida = 100; tot.itens.b.qtdRecebida = 3;
  assert.equal(E.montarRevisao(tot, {'itens/n1': novo}, {papel: 'admin', justificativa: 'Complemento do pedido'}).revisao.statusApos, 'RECEBIDO_PARCIAL');
}
console.log('edicao-pc (cancelar/adicionar material): ok');
