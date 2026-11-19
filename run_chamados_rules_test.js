'use strict';
/* Regras do banco dos Chamados (helpdesk, 18/11/2026), no emulador real:
   firebase emulators:exec --project demo-chamados --only database --config firebase.fase8b-test.json "node run_chamados_rules_test.js"
   - chamado, histórico, anexos e pedidos de envio: ninguém lê nem grava pelo navegador (nem o ADM);
   - a caixa (lista + contador do menu) só o dono lê; ninguém grava;
   - a fila do quadro (contador do ADM) só o ADM lê; ninguém grava;
   - perfil desativado não lê nem a própria caixa. */
const assert = require('assert/strict');
const admin = require(require.resolve('firebase-admin', {paths: [__dirname + '/functions']}));
const {getDatabase} = require(require.resolve('firebase-admin/database', {paths: [__dirname + '/functions']}));
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!/^127\.0\.0\.1:\d+$/.test(HOST || '')) throw new Error('Teste exige emulador local (FIREBASE_DATABASE_EMULATOR_HOST).');
const URL = 'http://' + HOST + '?ns=demo-chamados-default-rtdb';
const raiz = admin.initializeApp({projectId: 'demo-chamados', databaseURL: URL}, 'raiz');
const apps = {};
const como = (uid) => getDatabase(apps[uid] || (apps[uid] = admin.initializeApp({projectId: 'demo-chamados', databaseURL: URL, databaseAuthVariableOverride: {uid: uid}}, uid)));
const negado = (p) => assert.rejects(p, /permission[ _]denied/i);
let n = 0;
const passo = async (p, msg) => { await p; n++; console.log('  ok  ' + msg); };

(async () => {
  await getDatabase(raiz).ref().set({
    usuarios: {adm: {role: 'admin'}, adm2: {role: 'pcp', funcoes: {admin: true}}, u1: {role: 'pd'}, u2: {role: 'pcp'}, off: {role: 'pcp', desativado: true}},
    chamados: {c1: {codigo: 'CH-00001', titulo: 'Teste', autor: {uid: 'u1'}, status: 'NOVO'}},
    chamados_pedidos: {u1: {r1: {id: 'c1'}}},
    chamados_caixa: {u1: {c1: {codigo: 'CH-00001', aguardaVoce: false}}, off: {c9: {codigo: 'CH-00009'}}},
    chamados_fila_adm: {c1: {codigo: 'CH-00001', aguardaAdm: true}}
  });
  // Leitura
  await passo(negado(como('u1').ref('chamados/c1').get()), 'autor não lê o chamado direto (só pela callable)');
  await passo(negado(como('adm').ref('chamados').get()), 'nem o ADM lê o nó de chamados');
  await passo(negado(como('u1').ref('chamados_pedidos/u1').get()), 'pedidos de envio: só o servidor');
  assert.equal((await como('u1').ref('chamados_caixa/u1/c1/codigo').get()).val(), 'CH-00001'); n++; console.log('  ok  dono lê a própria caixa');
  await passo(negado(como('u2').ref('chamados_caixa/u1').get()), 'outro usuário não lê a caixa alheia');
  await passo(negado(como('off').ref('chamados_caixa/off').get()), 'perfil desativado não lê nem a própria caixa');
  assert.equal((await como('adm').ref('chamados_fila_adm/c1/aguardaAdm').get()).val(), true); n++; console.log('  ok  ADM lê a fila do quadro');
  assert.equal((await como('adm2').ref('chamados_fila_adm/c1/codigo').get()).val(), 'CH-00001'); n++; console.log('  ok  função admin também lê a fila');
  await passo(negado(como('u1').ref('chamados_fila_adm').get()), 'quem não é ADM não lê a fila');
  // Escrita: tudo pelo servidor
  await passo(negado(como('u1').ref('chamados/c2').set({titulo: 'forjado', autor: {uid: 'u1'}})), 'navegador não cria chamado');
  await passo(negado(como('adm').ref('chamados/c1/status').set('CONCLUIDO')), 'nem o ADM muda status pelo navegador');
  await passo(negado(como('u1').ref('chamados/c1/historico/h1').set({tipo: 'COMENTARIO'})), 'histórico não se escreve pelo navegador');
  await passo(negado(como('u1').ref('chamados_caixa/u1/c1/aguardaVoce').set(true)), 'dono não mexe na própria caixa');
  await passo(negado(como('adm').ref('chamados_fila_adm/c1').remove()), 'ADM não apaga a fila');
  await passo(negado(como('u1').ref('chamados_pedidos/u1/r2').set({id: 'x'})), 'pedido de envio não se cria pelo navegador');
  console.log(`OK regras dos Chamados: ${n} verificações — tudo pela callable; a caixa só o dono lê; a fila só o ADM lê.`);
  await Promise.all(Object.values(apps).concat([raiz]).map((a) => a.delete()));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
