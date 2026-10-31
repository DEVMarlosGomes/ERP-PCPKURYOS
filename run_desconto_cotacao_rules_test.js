'use strict';
/* COT-01 / D-10: o desconto máximo também é garantido no RTDB, não apenas
   pelo adaptador executado no navegador. */
const assert = require('node:assert/strict');
const path = require('node:path');
const admin = require(path.join(path.resolve(process.env.FUNCTIONS_NODE_MODULES || './functions/node_modules'), 'firebase-admin'));

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!/^127\.0\.0\.1:\d+$/.test(host || '')) throw new Error('Teste exige o emulador local.');
const url = 'http://' + host + '?ns=demo-desconto-default-rtdb';
const root = admin.initializeApp({projectId: 'demo-desconto', databaseURL: url}, 'root');
const como = (uid) => admin.initializeApp({projectId: 'demo-desconto', databaseURL: url,
  databaseAuthVariableOverride: {uid}}, uid).database();
const negado = (p) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i);

(async () => {
  await root.database().ref().set({
    usuarios: {
      com: {role: 'comercial', tenant_id: 'kuryos'},
      adm: {role: 'admin', tenant_id: 'kuryos'}
    },
    servicos: {ENVASE: {descontoPct: 10}}
  });
  const com = como('com');
  const adm = como('adm');
  const linha = (pct, motivo) => ({servico_id: 'ENVASE', nome: 'Envase', desconto_pct: pct,
    ...(motivo ? {desconto_motivo: motivo} : {})});
  const ref = (db, id) => db.ref('erp/kuryos/crm_propostas/' + id + '/composicao/servicos/0');

  await ref(com, 'P1').set(linha(0));
  await ref(com, 'P2').set(linha(10));
  await negado(ref(com, 'P3').set(linha(10.01)));
  await negado(ref(com, 'P4').set(linha(15, 'urgência aprovada')));
  await negado(ref(adm, 'P5').set(linha(15, 'curto')));
  await ref(adm, 'P6').set(linha(15, 'Condição comercial excepcional aprovada'));
  await negado(ref(com, 'P7').set({servico_id: 'INEXISTENTE', desconto_pct: 1}));
  await negado(ref(com, 'P8').set(linha(-1)));

  console.log('run_desconto_cotacao_rules_test: 8 casos OK');
  await Promise.all(admin.apps.map((app) => app.delete()));
})().catch((err) => { console.error(err); process.exitCode = 1; });
