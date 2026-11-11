'use strict';
/* Devolver OP à produção (functions/devolucao_producao.js, 10/11/2026). */
const assert = require('assert');
const D = require('./functions/devolucao_producao');

const agora = '2026-11-10T18:00:00.000Z';
const ctx = {linhas: ['Linha 1', 'Linha 2', 'Linha 3'], autor: 'PCP Teste', uid: 'u1', agora};
const JUST = 'Fechamento lançado por engano na Rotulagem 01; a OP continua e volta à Linha 1 amanhã cedo.';
const base = () => ({
  lote: '26309/04', status: 'Aguardando Confirmação', qtdPlanejada: 5700, produzidoLinha: 0, produzidoRotulagem: 5700,
  linha: '', emFila: {em: 'x'}, abertaDesdeRot: null,
  confirmacaoEtapas: {rotulagem: {status: 'AGUARDANDO', quantidade: 5700, fechadoEm: '2026-11-10T17:55:00.000Z', local: 'Rotulagem 01'}},
  apontamentosAplicados: {a1: {quantidade: 5362}, a2: {quantidade: 338}}
});
const dados = (x) => Object.assign({requestId: 'dev_abcdefghijkl', etapa: 'rotulagem', linha: 'Linha 1', data: '2026-11-11', hora: '07:00', duracaoHoras: 8, justificativa: JUST}, x);

// 1. Caso da 26309/04: volta, sai a etapa pendente, programa na Linha 1 amanhã 07:00 (Brasília).
{
  const op = base();
  const r = D.prepararDevolucao(op, dados(), ctx);
  assert.equal(r.patch.status, 'Programado', 'nada envasado: volta a Programado');
  assert.equal(r.patch.linha, 'Linha 1');
  assert.equal(r.patch.dataInicioPlanejada, '2026-11-11T10:00:00.000Z');
  assert.equal(r.patch.dataFimPlanejada, '2026-11-11T18:00:00.000Z');
  assert.equal(r.patch['confirmacaoEtapas/rotulagem'], null);
  assert.equal(r.patch.emFila, null);
  const h = r.patch['historicoAlteracoes/dev_abcdefghijkl'];
  assert.equal(h.justificativa, JUST);
  assert.equal(h.de.status, 'Aguardando Confirmação');
  assert.equal(h.de.confirmacaoEtapa.quantidade, 5700, 'guarda a etapa removida');
  assert.equal(h.por, 'PCP Teste');
  D.aplicarPatch(op, r.patch);
  assert.equal(op.status, 'Programado');
  assert.ok(!op.confirmacaoEtapas.rotulagem && !('emFila' in op));
  assert.equal(op.produzidoRotulagem, 5700, 'não mexe no produzido');
  assert.deepEqual(op.apontamentosAplicados, base().apontamentosAplicados, 'não mexe nos apontamentos aplicados');
  // 2. Idempotente: mesmo requestId não aplica de novo.
  const r2 = D.prepararDevolucao(op, dados(), ctx);
  assert.equal(r2.repetida, true);
}

// 3. Com envase já apontado volta a "Em Produção"; ≥95% avisa que o próximo apontamento devolve ao PCP.
{
  const op = Object.assign(base(), {produzidoLinha: 5600, confirmacaoEtapas: {envase: {status: 'CONFIRMADO', quantidade: 5600}}});
  const r = D.prepararDevolucao(op, dados({etapa: 'envase'}), ctx);
  assert.equal(r.patch.status, 'Em Produção');
  assert.match(r.aviso, /95%/);
  const op2 = Object.assign(base(), {produzidoLinha: 1000, status: 'Em Produção', confirmacaoEtapas: {envase: {status: 'AGUARDANDO', quantidade: 1000}}});
  assert.equal(D.prepararDevolucao(op2, dados({etapa: 'envase'}), ctx).aviso, '');
}

// 4. Travas.
const erro = (op, d, re) => assert.throws(() => D.prepararDevolucao(op, dados(d), ctx), re);
erro(base(), {justificativa: 'curta demais'}, /pelo menos 60/);
erro(base(), {justificativa: ' '.repeat(10) + 'x'.repeat(59) + ' '.repeat(10)}, /pelo menos 60/);
erro(base(), {linha: 'Rotulagem 01'}, /linha de envase/);
erro(base(), {etapa: 'posto'}, /etapa/);
erro(base(), {requestId: 'x'}, /Identificador/);
erro(Object.assign(base(), {status: 'Cancelado'}), {}, /cancelada/);
erro(Object.assign(base(), {abertaDesde: agora, abertaLinha: 'Linha 2'}), {}, /aberta na Linha 2/);
erro(Object.assign(base(), {status: 'Em Produção', confirmacaoEtapas: {}}), {}, /não há o que devolver/);
erro(base(), {data: '2026-11-09'}, /já passou/);
erro(base(), {duracaoHoras: 0}, /Duração/);
erro(base(), {hora: '7h'}, /hora/);
erro(null, {}, /não encontrada/);

// 4b. Concluída por engano (26309/04 real: envase confirmado 4.608 un, status Concluído) também volta.
{
  const op = Object.assign(base(), {status: 'Concluído', produzidoLinha: 4608, confirmadoPor: 'PCP', confirmadoEm: '2026-11-10T19:00:00.000Z',
    statusManualOverride: true, confirmacaoEtapas: {envase: {status: 'CONFIRMADO', quantidade: 4608}}});
  const r = D.prepararDevolucao(op, dados({etapa: 'envase'}), ctx);
  assert.equal(r.patch.status, 'Em Produção');
  assert.equal(r.patch.confirmadoPor, null);
  assert.equal(r.patch.confirmadoEm, null);
  assert.equal(r.patch.statusManualOverride, null);
  assert.match(r.aviso, /estava concluída/);
  const h = r.patch['historicoAlteracoes/dev_abcdefghijkl'];
  assert.equal(h.de.status, 'Concluído');
  assert.equal(h.de.confirmadoEm, '2026-11-10T19:00:00.000Z');
  assert.equal(h.de.statusManualOverride, true);
  D.aplicarPatch(op, r.patch);
  assert.ok(!('confirmadoEm' in op) && !('statusManualOverride' in op) && !op.confirmacaoEtapas.envase);
  // Concluída sem etapa pendente também volta (a conclusão pode ter vindo pelo seletor de status).
  const semEtapa = Object.assign(base(), {status: 'Concluído', confirmacaoEtapas: {}});
  assert.equal(D.prepararDevolucao(semEtapa, dados({etapa: 'rotulagem'}), ctx).patch.status, 'Programado');
}

// 5. config/linhas como objeto (RTDB devolve array ou mapa).
assert.equal(D.prepararDevolucao(base(), dados(), Object.assign({}, ctx, {linhas: {0: 'Linha 1'}})).patch.linha, 'Linha 1');

// 6. Ligação: a callable delega a ação sem passar pela transação na raiz.
const fonte = require('fs').readFileSync(require('path').join(__dirname, 'functions/index.js'), 'utf8');
assert.match(fonte, /acao === 'DEVOLVER_PRODUCAO'\) return devolverOpProducao\(request\.data, uid\)/);
const corpo = fonte.slice(fonte.indexOf('async function devolverOpProducao'), fonte.indexOf('exports.rearranjarLinhas'));
assert.ok(corpo.includes("db.ref('ops/' + opKey).transaction") && !corpo.includes('transacaoRaiz'), 'transação só no nó da OP');
assert.ok(corpo.includes('if (!op) return op;'), 'transação não aborta no null do cache');

// 7. Tela: botão e modal no Controle de OPs, com mínimo de 60 e chamada à callable.
const ops = require('fs').readFileSync(require('path').join(__dirname, 'public/ops.html'), 'utf8');
assert.ok(ops.includes('firebase-functions-compat.js'), 'ops.html carrega o SDK de functions');
assert.equal((ops.match(/data-devolver-producao=/g) || []).length, 3, 'botão nas linhas de etapa, aguardando e ativa');
assert.ok(ops.includes("const MIN_JUST_DEVOLUCAO = 60;") && ops.includes("httpsCallable('rearranjarLinhas')") && ops.includes("acao: 'DEVOLVER_PRODUCAO'"));

console.log('OK devolução à produção: caso 26309/04, status de volta, etapa removida com histórico, idempotência, aviso de 95%, travas, ligação servidor/tela.');
