'use strict';
/* functions/transacao_raiz.js no RTDB emulado (09/11/2026).
   Prova o defeito e a correção com um banco acima de 16 MB (produção tinha 29,7 MB):
   1. db.ref().transaction(...) na raiz não grava (era o 500 da Montar carga);
   2. transacaoRaiz grava só os caminhos que mudaram e preserva o resto;
   3. desistência (callback devolve undefined) não grava nada;
   4. 6 operações simultâneas no mesmo contador não se perdem (fila no processo);
   5. erro no callback não trava a fila.
   Rodar: firebase emulators:exec --project demo-raiz --only database --config firebase.trava-test.json
          "set FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9073&& node run_transacao_raiz_emulator_test.js" */
const path = require('node:path');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(path.resolve('functions/package.json'));
const {initializeApp, deleteApp} = req('firebase-admin/app');
const {getDatabase} = req('firebase-admin/database');
const {transacaoRaiz} = require('./functions/transacao_raiz');

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!host) throw new Error('Exige FIREBASE_DATABASE_EMULATOR_HOST (emulador RTDB local).');
const app = initializeApp({projectId: 'demo-raiz', databaseURL: 'http://' + host + '?ns=demo-raiz-default-rtdb'}, 'raiz');
const db = getDatabase(app);

function lastro(mb) {
  const out = {}; const bloco = 'x'.repeat(1000);
  for (let i = 0; i < mb * 1024; i++) out['r' + i] = {texto: bloco, i};
  return out;
}

(async () => {
  await db.ref().set(null);
  // Grava o lastro em partes (cada set < 16 MB) até o banco passar de 16 MB.
  for (let p = 0; p < 4; p++) await db.ref('auditoria_geral/p' + p).set(lastro(5));
  await db.ref('agendamentos_expedicao/antiga').set({status: 'CANCELADO', revisao: 2});
  await db.ref('config/contadores/n').set(0);
  await db.ref('usuarios/u1').set({role: 'logistica'});

  // 1. Transação na raiz com banco > 16 MB (conexão própria: o SDK insiste nela e
  // bloquearia as transações seguintes na mesma conexão).
  const appAntigo = initializeApp({projectId: 'demo-raiz', databaseURL: 'http://' + host + '?ns=demo-raiz-default-rtdb'}, 'antigo');
  const dbAntigo = getDatabase(appAntigo);
  let falhou = null;
  await dbAntigo.ref().once('value');
  try {
    const r = await dbAntigo.ref().transaction((base) => {
      if (!base) return base;
      base.agendamentos_expedicao.nova = {status: 'AGENDADO', revisao: 1};
      return base;
    }, undefined, false);
    if (!r.committed) falhou = new Error('não gravou');
  } catch (e) { falhou = e; }
  await deleteApp(appAntigo).catch(() => null);
  console.log('transação na raiz com ~20 MB:', falhou ? 'FALHOU (' + String(falhou.message).slice(0, 120) + ')' : 'gravou');
  assert.ok(falhou, 'a transação na raiz deveria falhar acima de 16 MB (é o defeito de produção)');
  assert.equal((await db.ref('agendamentos_expedicao/nova').get()).val(), null);

  // 2. Correção: grava só o que mudou.
  const r2 = await transacaoRaiz(db, (base) => {
    if (base.usuarios.u1.role !== 'logistica') return;
    base.agendamentos_expedicao.nova = {status: 'AGENDADO', revisao: 1, paletes: [{itemKey: 'A', loteKey: 'l1'}]};
    base.config.contadores.n = 1;
    delete base.agendamentos_expedicao.antiga.revisao;
    return base;
  });
  assert.deepEqual([r2.committed, r2.caminhos], [true, 3]);
  assert.deepEqual((await db.ref('agendamentos_expedicao').get()).val(),
    {antiga: {status: 'CANCELADO'}, nova: {status: 'AGENDADO', revisao: 1, paletes: [{itemKey: 'A', loteKey: 'l1'}]}});
  assert.equal((await db.ref('auditoria_geral/p3/r10/i').get()).val(), 10, 'o resto do banco ficou intacto');

  // 3. Desistência.
  const r3 = await transacaoRaiz(db, (base) => { base.config.contadores.n = 999; return undefined; });
  assert.equal(r3.committed, false);
  assert.equal((await db.ref('config/contadores/n').get()).val(), 1);

  // 4. Concorrência: 6 incrementos simultâneos, nenhum perdido.
  await Promise.all(Array.from({length: 6}, () => transacaoRaiz(db, (base) => { base.config.contadores.n += 1; return base; })));
  assert.equal((await db.ref('config/contadores/n').get()).val(), 7);

  // 5. Erro no callback não trava a fila.
  await assert.rejects(() => transacaoRaiz(db, () => { throw new Error('regra recusou'); }), /regra recusou/);
  const r5 = await transacaoRaiz(db, (base) => { base.config.contadores.n += 1; return base; });
  assert.equal(r5.committed, true);
  assert.equal((await db.ref('config/contadores/n').get()).val(), 8);

  console.log('OK transacaoRaiz: raiz > 16 MB recusada no modo antigo; novo grava só caminhos, desiste, serializa 6 concorrentes e segue após erro.');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => deleteApp(app));
