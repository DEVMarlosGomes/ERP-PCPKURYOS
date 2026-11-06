'use strict';
/* Regras do rascunho do laudo (27/10), no emulador real:
   firebase emulators:exec --project demo-mp --only database --config firebase.retrabalhos-test.json "node run_rascunho_cq_rules_test.js"
   - Qualidade (papel ou módulo), PCP e admin gravam e apagam; os demais não;
   - perfil desativado ou pendente não grava (06/11);
   - todos os logados leem; registro sem tipo/dados/atualizadoEm, tipo estranho ou grande demais é recusado. */
const assert = require('assert/strict');
// API modular: firebase-admin 14 não tem mais app.database().
const reqFn = require('module').createRequire(require('path').resolve(process.env.FUNCTIONS_DIR || (__dirname + '/functions'), 'x.js'));
const {initializeApp, deleteApp} = reqFn('firebase-admin/app');
const {getDatabase} = reqFn('firebase-admin/database');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9023') throw new Error('Teste exige emulador local 9023.');
const URL = 'http://127.0.0.1:9023?ns=demo-mp-default-rtdb';
const raiz = initializeApp({projectId: 'demo-mp', databaseURL: URL}, 'raiz');
const apps = {};
const como = (uid) => getDatabase(apps[uid] || (apps[uid] = initializeApp({projectId: 'demo-mp', databaseURL: URL, databaseAuthVariableOverride: {uid: uid}}, uid)));
const negado = (p) => assert.rejects(p, /permission[ _]denied/i);
const reg = (extra) => Object.assign({tipo: 'LAUDO', dados: '{"campos":{}}', atualizadoEm: '2026-10-27T14:00:00Z', por: 'Ana'}, extra || {});
const N = 'qualidade_rascunhos/';

(async () => {
  await getDatabase(raiz).ref().set({usuarios: {
    cq: {role: 'qualidade'}, mod: {role: 'production', modulos: {qualidade: true}}, pcp: {role: 'pcp'},
    adm: {role: 'admin'}, op: {role: 'production', modulos: {apontamento: true}}, log: {role: 'logistica'},
    off: {role: 'qualidade', desativado: true}, pend: {role: 'pending', modulos: {qualidade: true}}
  }});
  await como('cq').ref(N + 'pa_26280-01').set(reg());
  await como('mod').ref(N + 'granel_26300-01').set(reg({tipo: 'GRANEL'}));
  await como('pcp').ref(N + 'lote_A__L1').set(reg());
  await como('adm').ref(N + 'lote_A__L1').set(reg({por: 'Admin'}));
  await negado(como('op').ref(N + 'pa_26280-01').set(reg()));
  await negado(como('log').ref(N + 'pa_26280-01').remove());
  await negado(como('off').ref(N + 'pa_26280-01').set(reg()));
  await negado(como('pend').ref(N + 'pa_26280-01').set(reg()));
  assert.equal((await como('log').ref(N + 'pa_26280-01/por').get()).val(), 'Ana', 'todos leem');
  await negado(como('cq').ref(N + 'x').set({tipo: 'LAUDO', dados: '{}'}));
  await negado(como('cq').ref(N + 'x').set(reg({tipo: 'OUTRO'})));
  await negado(como('cq').ref(N + 'x').set(reg({dados: {campos: {}}})));
  await negado(como('cq').ref(N + 'x').set(reg({dados: 'a'.repeat(200001)})));
  await como('cq').ref(N + 'pa_26280-01').remove();
  assert.equal((await como('cq').ref(N + 'pa_26280-01').get()).exists(), false, 'Qualidade apaga ao decidir');
  console.log('OK regras do rascunho do laudo: Qualidade/PCP/admin gravam e apagam, demais não; todos leem; formato validado.');
  await Promise.all(Object.values(apps).concat([raiz]).map((a) => deleteApp(a)));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
