'use strict';
/* Cliente novo direto pelo cadastro é só do ADM (13/10/2026), no emulador real:
   firebase emulators:exec --only database --config firebase.retrabalhos-test.json "node run_clientes_criacao_rules_test.js"
   - ADM cria cliente no cadastro mestre;
   - PCP e quem tem o módulo Cadastros continuam editando cliente existente,
     mas não criam cliente novo;
   - cliente que nasce do funil do CRM (com origemCrmClienteId) pode ser
     gravado pelo comercial -- é o caminho CGI assinado -> SKU;
   - sem papel nenhum, nada. */
const assert = require('assert/strict');
const admin = require('./functions/node_modules/firebase-admin');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9023') throw new Error('Teste exige emulador local 9023.');
const URL = 'http://127.0.0.1:9023?ns=demo-clientes-default-rtdb';
const raiz = admin.initializeApp({projectId: 'demo-clientes', databaseURL: URL}, 'raiz');
const como = (uid) => admin.initializeApp({projectId: 'demo-clientes', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid).database();
const negado = (p) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i);

(async () => {
  await raiz.database().ref().set({
    usuarios: {
      adm: {role: 'admin'},
      pcp: {role: 'pcp'},
      cad: {role: 'gestor', modulos: {cadastros: true}},
      vend: {role: 'vendedor'},
      nada: {role: 'gestor'}
    },
    clientes: {MISS: {nome: 'MISS ROSE', codigo: 'MISS'}}
  });
  const adm = como('adm'), pcp = como('pcp'), cad = como('cad'), vend = como('vend'), nada = como('nada');

  await adm.ref('clientes/NOVO').set({nome: 'Cliente Direto', codigo: 'NOVO'});
  await negado(pcp.ref('clientes/PCP1').set({nome: 'PCP tentando criar'}));
  await negado(cad.ref('clientes/CAD1').set({nome: 'Cadastros tentando criar'}));
  await negado(vend.ref('clientes/V1').set({nome: 'Vendedor direto'}));

  await pcp.ref('clientes/MISS').update({cidade: 'São Paulo'});
  await cad.ref('clientes/MISS').update({uf: 'SP'});
  await negado(vend.ref('clientes/MISS').update({uf: 'RJ'}));
  await negado(nada.ref('clientes/MISS').update({uf: 'RJ'}));

  await vend.ref('clientes/LUMI').set({nome: 'Lumi', codigo: 'LUMI', origemCrmClienteId: 'crm-123'});
  await negado(nada.ref('clientes/X2').set({nome: 'X', origemCrmClienteId: 'crm-9'}));

  const final = (await raiz.database().ref('clientes').once('value')).val();
  assert.deepEqual(Object.keys(final).sort(), ['LUMI', 'MISS', 'NOVO']);
  assert.equal(final.MISS.cidade, 'São Paulo');
  console.log('OK clientes: só ADM cria direto; PCP/Cadastros editam; funil do CRM grava com origem.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
