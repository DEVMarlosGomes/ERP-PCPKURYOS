'use strict';
/* Registro retrospectivo de retrabalho (16/11/2026): serviço real e regras do banco no emulador.
     npx firebase-tools emulators:exec --project demo-registro-retrabalho --only database \
       --config firebase.registro-retrabalho-test.json "node run_registro_retrabalho_emulator_test.js"
   - quem lê registros_retrabalho (Qualidade por role/função/módulo, ADM, PCP, Logística) e quem não lê;
   - ninguém grava registros_retrabalho nem os pedidos de idempotência pelo navegador;
   - Qualidade por FUNÇÃO (multi-função) cria pela callable; a RNC e a OP não mudam. */
const assert = require('assert/strict');
const path = require('path');
const reqFn = require('module').createRequire(path.resolve(__dirname, 'functions', 'x.js'));
const {initializeApp} = reqFn('firebase-admin/app');
const {getDatabase} = reqFn('firebase-admin/database');
const S = require('./functions/registro_retrabalho.js');
const FIX = require('./run_registro_retrabalho_fixture.json');
const PORTA = '9078';
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:' + PORTA) throw new Error('Teste exige emulador local ' + PORTA + '.');
const URL = `http://127.0.0.1:${PORTA}?ns=demo-registro-retrabalho-default-rtdb`;
const raiz = initializeApp({projectId: 'demo-registro-retrabalho', databaseURL: URL}, 'raiz');
const apps = {};
const como = (uid) => getDatabase(apps[uid] || (apps[uid] = initializeApp({projectId: 'demo-registro-retrabalho', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid)));
const negado = (p, msg) => assert.rejects(p, /permission[ _]denied/i, msg);
let n = 0;
const passo = (m) => { n++; console.log('  ok  ' + m); };

(async () => {
  const db = getDatabase(raiz);
  await db.ref().set({
    usuarios: {
      rob: {nome: 'Qualidade', role: 'qualidade', funcoes: {qualidade: true}},
      yas: {nome: 'Multi', role: 'comercial', funcoes: {comercial: true, qualidade: true}},
      mod: {nome: 'Módulo', role: 'production', modulos: {qualidade: true}},
      adm: {nome: 'ADM', role: 'admin'},
      pcp: {nome: 'PCP', role: 'pcp'},
      log: {nome: 'Logística', role: 'logistica'},
      prod: {nome: 'Produção', role: 'production'},
      off: {nome: 'Desligada', role: 'qualidade', desativado: true},
    },
    ops: FIX.ops, conferencias_pa: FIX.conferencias_pa, nao_conformidades: FIX.nao_conformidades,
  });
  const svc = S.criarServico({db});
  const r = await svc.executar('yas', {acao: 'CRIAR', requestId: 'c1', dados: {rncNumero: 'RNC-2026-011', opKeyOrigem: '26302-01', qtdOrigem: 3470,
    destinos: [{opKey: '26302-01', qtd: 1460}, {opKey: '26264-14', qtd: 1965}]}});
  assert.equal(r.id, 'RR-26302-01-1');
  passo('Qualidade por função cria pela callable (serviço real no emulador)');

  for (const uid of ['rob', 'yas', 'mod', 'adm', 'pcp', 'log']) assert.equal((await como(uid).ref('registros_retrabalho/' + r.id + '/status').get()).val(), 'EM_PREENCHIMENTO', uid + ' lê');
  await negado(como('prod').ref('registros_retrabalho').get(), 'produção não lê');
  await negado(como('off').ref('registros_retrabalho').get(), 'desativado não lê');
  passo('leem: Qualidade (role, função, módulo), ADM, PCP, Logística; produção e desativado não');

  for (const uid of ['rob', 'yas', 'adm', 'pcp']) {
    await negado(como(uid).ref('registros_retrabalho/' + r.id + '/status').set('ENCERRADO'), uid + ' não grava status');
    await negado(como(uid).ref('registros_retrabalho/novo').set({status: 'EM_PREENCHIMENTO'}), uid + ' não cria');
    await negado(como(uid).ref('registros_retrabalho/' + r.id).remove(), uid + ' não apaga');
  }
  await negado(como('rob').ref('registros_retrabalho_pedidos/rob/x').set('y'));
  await negado(como('rob').ref('registros_retrabalho_pedidos/rob').get());
  passo('ninguém grava, cria ou apaga registros_retrabalho nem lê/grava os pedidos pelo navegador');

  assert.deepEqual((await db.ref('ops').get()).val(), FIX.ops, 'OPs intactas');
  assert.deepEqual((await db.ref('nao_conformidades').get()).val(), FIX.nao_conformidades, 'RNCs intactas');
  assert.deepEqual((await db.ref('conferencias_pa').get()).val(), FIX.conferencias_pa, 'conferências intactas');
  passo('OPs, RNCs e conferências intactas depois da criação');
  console.log('run_registro_retrabalho_emulator_test: ' + n + ' passos OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
