'use strict';
/* Regras da Auditoria do sistema (PORT-05), no emulador real:
   firebase emulators:exec --project demo-auditoria --only database --config <config com a porta> "node run_auditoria_rules_test.js"
   - qualquer logado acrescenta evento em nome próprio (porUid == auth.uid), uma vez;
   - ninguém altera nem apaga um evento, nem o admin;
   - só o admin lê. */
const assert = require('assert/strict');
const admin = require('./functions/node_modules/firebase-admin');
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '';
if (!/^127\.0\.0\.1:\d+$/.test(HOST)) throw new Error('Teste exige o emulador local (FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:<porta>).');
const URL = 'http://' + HOST + '?ns=demo-auditoria-default-rtdb';
const raiz = admin.initializeApp({projectId: 'demo-auditoria', databaseURL: URL}, 'raiz');
const apps = {};
const como = (uid) => (apps[uid] || (apps[uid] = admin.initializeApp({projectId: 'demo-auditoria', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid))).database();
const negado = (p) => assert.rejects(p, /permission[ _]denied/i);

(async () => {
  await raiz.database().ref().set({usuarios: {adm: {role: 'admin'}, op: {role: 'production'}}});
  const op = como('op'), adm = como('adm');
  const geral = {metodo: 'update', caminho: 'ops/26000-01', em: '2026-10-30T10:00:00Z', porUid: 'op', pagina: 'form.html'};
  await op.ref('auditoria_geral/2026-10-30/e1').set(geral);
  await negado(op.ref('auditoria_geral/2026-10-30/e2').set(Object.assign({}, geral, {porUid: 'adm'})));
  await negado(op.ref('auditoria_geral/2026-10-30/e1').set(Object.assign({}, geral, {metodo: 'set'})));
  await negado(adm.ref('auditoria_geral/2026-10-30/e1').remove());
  await negado(op.ref('auditoria_geral/2026-10-30/e3').set({metodo: 'set', em: 'x', porUid: 'op'}));
  await op.ref('eventos_auditoria/2026-10-30/v1').set({acao: 'ALOCOU_OP', em: '2026-10-30T10:00:00Z', porUid: 'op'});
  await negado(op.ref('eventos_auditoria/2026-10-30/v1').remove());
  await negado(op.ref('auditoria_geral').once('value'));
  await negado(op.ref('eventos_auditoria').once('value'));
  assert.equal((await adm.ref('auditoria_geral/2026-10-30/e1/caminho').once('value')).val(), 'ops/26000-01');
  assert.equal((await adm.ref('eventos_auditoria/2026-10-30/v1/acao').once('value')).val(), 'ALOCOU_OP');
  console.log('OK regras da auditoria: acréscimo em nome próprio, imutável, só o admin lê.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
