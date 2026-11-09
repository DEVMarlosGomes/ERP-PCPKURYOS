'use strict';
/* Card do cliente (CRM) -> Cadastros (08/11/2026): regra de clientes/$clienteKey no emulador real.
     firebase emulators:exec --project demo-trava --only database --config firebase.trava-test.json "node run_cliente_card_rules_test.js"
   - comercial atualiza cliente existente SÓ com carimbo do card (origem crm_card, uid próprio, horário do servidor, linha no histórico);
   - sem carimbo, com horário antigo, em nome de outro, mudando código/matriz/fornecedor/ativo ou apagando: recusado;
   - PCP/Cadastros/ADM seguem como antes; comercial ainda cria cliente novo só com origemCrmClienteId. */
const assert = require('assert/strict');
const path = require('path');
const reqFn = require('module').createRequire(path.resolve(process.env.FUNCTIONS_DIR || (__dirname + '/functions'), 'x.js'));
const {initializeApp, deleteApp} = reqFn('firebase-admin/app');
const {getDatabase, ServerValue} = reqFn('firebase-admin/database');
const PORTA = process.env.TRAVA_PORTA || '9073';
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:' + PORTA) throw new Error('Teste exige emulador local ' + PORTA + '.');
const URL = `http://127.0.0.1:${PORTA}?ns=demo-trava-default-rtdb`;
const raiz = initializeApp({projectId: 'demo-trava', databaseURL: URL}, 'raiz');
const apps = {};
const como = (uid) => getDatabase(apps[uid] || (apps[uid] = initializeApp({projectId: 'demo-trava', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid)));
const negado = (p, msg) => assert.rejects(p, /permission[ _]denied/i, msg);
let n = 0;
const passo = (m) => { n++; console.log('  ok  ' + m); };
const B = 'clientes/MISS';
function carimbo(uid, id, emMs, origem) {
  return {
    [`${B}/ultimaAlteracao`]: {id, origem: origem || 'crm_card', por: uid, porUid: uid, em: '2026-11-08T12:00:00Z', em_ms: emMs === undefined ? ServerValue.TIMESTAMP : emMs},
    [`${B}/historicoAlteracoes/${id}`]: {em_ms: ServerValue.TIMESTAMP, por: uid, porUid: uid, origem: 'crm_card', campos: ['Cidade']},
  };
}

(async () => {
  await getDatabase(raiz).ref().set({
    usuarios: {
      vend: {role: 'vendedor'}, com: {role: 'production', modulos: {comercial: true}}, pcp: {role: 'pcp'}, outro: {role: 'production'},
    },
    clientes: {MISS: {nome: 'Miss Rose', codigo: 'MISS', ativo: true, cidade: 'São Paulo', matrizKey: null, contatosVersao: 1, contatos: {c1: {nome: 'Cirilo', areas: ['COMERCIAL'], principais: ['COMERCIAL']}}}},
  });
  const vend = como('vend');

  await vend.ref().update({[`${B}/cidade`]: 'Campinas', [`${B}/contatos/c2`]: {nome: 'Bia', areas: ['COMERCIAL'], principais: []}, ...carimbo('vend', 'h1')});
  await como('com').ref().update({[`${B}/site`]: 'missrose.com', ...carimbo('com', 'h2')});
  const c = (await getDatabase(raiz).ref(B).get()).val();
  assert.equal(c.cidade, 'Campinas');
  assert.equal(c.contatos.c2.nome, 'Bia');
  assert.equal(c.historicoAlteracoes.h1.porUid, 'vend');
  passo('comercial (papel ou módulo) atualiza cliente existente com o carimbo do card');

  await negado(vend.ref(`${B}/cidade`).set('Santos'), 'sem carimbo');
  await negado(vend.ref().update({[`${B}/cidade`]: 'Santos', ...carimbo('vend', 'h3', 1000)}), 'horário antigo');
  await negado(vend.ref().update({[`${B}/cidade`]: 'Santos', ...carimbo('vend', 'h4', undefined, 'cadastros')}), 'origem que não é o card');
  const alheio = carimbo('pcp', 'h5');
  await negado(vend.ref().update({[`${B}/cidade`]: 'Santos', ...alheio}), 'em nome de outra pessoa');
  const semHist = carimbo('vend', 'h6'); delete semHist[`${B}/historicoAlteracoes/h6`];
  await negado(vend.ref().update({[`${B}/cidade`]: 'Santos', ...semHist}), 'sem linha no histórico');
  passo('sem carimbo, horário antigo, origem errada, em nome de outro ou sem histórico: recusado');

  await negado(vend.ref().update({[`${B}/codigo`]: 'MISS2', ...carimbo('vend', 'h7')}), 'código');
  await negado(vend.ref().update({[`${B}/ativo`]: false, ...carimbo('vend', 'h8')}), 'ativo');
  await negado(vend.ref().update({[`${B}/fornecedorVinculadoKey`]: 'F1', ...carimbo('vend', 'h9')}), 'fornecedor');
  await negado(vend.ref(B).remove(), 'apagar');
  await negado(como('outro').ref().update({[`${B}/cidade`]: 'Santos', ...carimbo('outro', 'h10')}), 'papel sem comercial');
  passo('card não muda código/ativo/fornecedor, não apaga; papel sem comercial não grava');

  await como('pcp').ref(`${B}/cidade`).set('Jundiaí');
  await negado(vend.ref('clientes/NOVO').set({nome: 'Novo', codigo: 'NOVO'}), 'comercial cria só com origemCrmClienteId');
  await vend.ref('clientes/NOVO').set({nome: 'Novo', codigo: 'NOVO', origemCrmClienteId: 'card1'});
  passo('PCP segue editando sem carimbo; criação pelo comercial continua exigindo origemCrmClienteId');

  console.log(`run_cliente_card_rules_test: OK (${n} passos)`);
  await Promise.all(Object.values(apps).concat([raiz]).map((a) => deleteApp(a)));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
