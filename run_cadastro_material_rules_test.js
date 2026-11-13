'use strict';

// Cadastro de material novo: quem tem o módulo Cadastros precisa reservar o
// código e concluir o update atômico (material + índice + histórico), sem ganhar
// permissão para o restante de config/.
const assert = require('node:assert/strict');
const path = require('node:path');
const reqFunctions = require('node:module').createRequire(path.join(__dirname, 'functions/package.json'));
const {initializeApp, getApps, deleteApp} = reqFunctions('firebase-admin/app');
const {getDatabase} = reqFunctions('firebase-admin/database');

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!/^127\.0\.0\.1:\d+$/.test(host || '')) throw new Error('Teste exige o emulador local.');
const projectId = 'demo-cadastro-material';
const databaseURL = `http://${host}?ns=${projectId}-default-rtdb`;

const app = (name, uid) => initializeApp({
  projectId,
  databaseURL,
  ...(uid ? {databaseAuthVariableOverride: {uid, token: {auth_time: 100}}} : {}),
}, name);
const raizApp = app('cad-mat-raiz');
const raiz = getDatabase(raizApp);
const como = (uid) => getDatabase(app(`cad-mat-${uid}`, uid));
const negar = (promessa, mensagem) => assert.rejects(promessa, /PERMISSION_DENIED|permission_denied/i, mensagem);

(async () => {
  await raiz.ref().set({
    usuarios: {
      cad: {role: 'comercial', modulos: {cadastros: true}},
      pd: {role: 'comercial', funcoes: {pd: true}, modulos: {pd: true, amostras_mp: true}, modulosDasFuncoes: true},
    },
    config: {contadores: {materiais: {MPGR: 150}}},
  });

  const cad = como('cad');
  const pd = como('pd');

  const reservado = await cad.ref('config/contadores/materiais/MPGR').transaction((atual) => Number(atual || 0) + 1);
  assert.equal(reservado.committed, true);
  assert.equal(reservado.snapshot.val(), 151, 'Cadastros reserva o próximo código');

  const material = {
    mpCodigo: 'MPGR-00151', mpNome: 'Ureia cosmética', tipo: 'MPGR',
    unidade: 'KG', ativo: true, chaveDuplicidade: 'UREIA COSMETICA',
  };
  await cad.ref().update({
    'materiais/MPGR-00151': material,
    'materiais_chave/UREIA COSMETICA': 'MPGR-00151',
    'historico_materiais/MPGR-00151/criacao': {acao: 'CRIADO', porUid: 'cad'},
  });
  assert.equal((await raiz.ref('materiais/MPGR-00151/mpNome').get()).val(), 'Ureia cosmética');

  await negar(pd.ref('config/contadores/materiais/MPGR').set(152), 'P&D sem Cadastros não numera material');
  await negar(cad.ref('config/contadores/materiais/MPGR').set(150), 'contador não retrocede');
  await negar(cad.ref('config/contadores/materiais/MPGR').remove(), 'contador não é apagado');
  await negar(cad.ref('config/emitirOp/bloquearSemSaldo').set(false), 'Cadastros não ganhou o restante de Config');

  console.log('run_cadastro_material_rules_test: OK');
})().finally(async () => {
  await Promise.all(getApps().map((a) => deleteApp(a)));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
