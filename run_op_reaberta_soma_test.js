'use strict';
/* OP devolvida à produção continua somando e só sai pelo Finalizar OP
   (18/11/2026, caso 26321/05: 4.752 de 3.600 envasadas, encerrada por engano;
   devolvida, o próximo apontamento a mandava de novo ao PCP).
   node run_op_reaberta_soma_test.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const D = require('./functions/devolucao_producao');
const ctxUtils = {console, window: {}, document: undefined};
ctxUtils.window = ctxUtils;
vm.createContext(ctxUtils);
vm.runInContext(fs.readFileSync('public/shared/utils.js', 'utf8'), ctxUtils);
const computeOpStatus = ctxUtils.computeOpStatus;
let n = 0; const ok = (m) => { n++; console.log('  ok  ' + m); };

// 1. A devolução grava a trava de fechamento manual e o aviso novo.
const op = {lote: '26321/05', status: 'Aguardando Confirmação', qtdPlanejada: 3600, produzidoLinha: 4752,
  confirmacaoEtapas: {envase: {status: 'AGUARDANDO', quantidade: 4752, fechadoEm: '2026-11-18T12:11:34.595Z', local: 'Linha 1'}}};
const r = D.prepararDevolucao(op, {requestId: 'dev_abcdefghijkl', etapa: 'envase', linha: 'Linha 1', data: '2026-11-19', hora: '07:00',
  duracaoHoras: 8, justificativa: 'Encerrado errado, solicitação do PCP para continuar a produção.'},
  {linhas: ['Linha 1', 'Linha 2'], autor: 'PCP', uid: 'u1', agora: '2026-11-18T13:13:30.622Z'});
assert.equal(r.patch.status, 'Em Produção');
assert.equal(r.patch.fechamentoSoManual, true);
assert.match(r.aviso, /só volta ao PCP quando o operador clicar em Finalizar OP/);
ok('devolução grava fechamentoSoManual e avisa que os apontamentos somam');

// 2. Com a trava, apontamento acima de 95% NÃO devolve ao PCP; sem ela, devolve (regra de sempre).
const reaberta = Object.assign({}, op, D.aplicarPatch ? {} : {}, {status: 'Em Produção', fechamentoSoManual: true, confirmacaoEtapas: null});
reaberta.produzidoLinha = 4752 + 600;   // novas 600 un. somam
assert.equal(computeOpStatus(reaberta), 'Em Produção');
assert.equal(computeOpStatus(Object.assign({}, reaberta, {fechamentoSoManual: undefined})), 'Aguardando Confirmação');
assert.equal(computeOpStatus(Object.assign({}, reaberta, {status: 'Aguardando Confirmação'})), 'Aguardando Confirmação', 'Finalizar continua levando ao PCP');
assert.equal(computeOpStatus(Object.assign({}, reaberta, {status: 'Concluído'})), 'Concluído');
ok('trava: 5.352 de 3.600 continua Em Produção; Finalizar e Concluído seguem valendo');

// 3. A tela de Finalizar OP soma (ligação, não só a unidade).
const form = fs.readFileSync('public/form.html', 'utf8');
assert.match(form, /opReab && opReab\.fechamentoSoManual/);
assert.match(form, /this\.dataset\.opReaberta === '1' && qtdTotal\) \{\s*apontado = parseInt\(this\.dataset\.opJaProduzido/);
assert.match(form, /qtdTotal = apontado \+ qtdTotal;/);
ok('Finalizar OP de OP retomada: digitado = só as novas; total = já produzido + novas');

console.log('run_op_reaberta_soma_test: ' + n + ' OK');
