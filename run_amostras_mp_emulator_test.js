'use strict';
/* Amostras de MP (11/11/2026): serviço real (functions/amostras_mp.js) e regras do banco no emulador.
     firebase emulators:exec --project demo-amostras --only database --config firebase.amostras-test.json "node run_amostras_mp_emulator_test.js"
   - quem lê amostras_mp (P&D, logística, Cadastros, PCP) e quem não lê (produção);
   - ninguém grava amostras_mp pelo navegador, nem os pedidos (idempotência);
   - duas baixas ao mesmo tempo: uma vence, a outra recebe "já foi recebida" (transação no nó);
   - P&D cria fornecedor novo (com a entrada de histórico) mas não edita fornecedor existente. */
const assert = require('assert/strict');
const path = require('path');
const reqFn = require('module').createRequire(path.resolve(__dirname, 'functions', 'x.js'));
const {initializeApp} = reqFn('firebase-admin/app');
const {getDatabase} = reqFn('firebase-admin/database');
const AmostrasMp = require('./functions/amostras_mp.js');
const PORTA = process.env.AMOSTRAS_PORTA || '9077';
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:' + PORTA) throw new Error('Teste exige emulador local ' + PORTA + '.');
const URL = `http://127.0.0.1:${PORTA}?ns=demo-amostras-default-rtdb`;
const raiz = initializeApp({projectId: 'demo-amostras', databaseURL: URL}, 'raiz');
const apps = {};
const como = (uid) => getDatabase(apps[uid] || (apps[uid] = initializeApp({projectId: 'demo-amostras', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid)));
const negado = (p, msg) => assert.rejects(p, /permission[ _]denied/i, msg);
let n = 0;
const passo = (m) => { n++; console.log('  ok  ' + m); };

(async () => {
  const db = getDatabase(raiz);
  await db.ref().set({
    usuarios: {
      pd: {nome: 'Paula P&D', role: 'pd'},
      yas: {nome: 'Yasmim', role: 'comercial', modulos: {pd: true, cadastros: true}},
      log: {nome: 'Lia Logística', role: 'logistica'},
      log2: {nome: 'Leo Logística', role: 'logistica'},
      cad: {nome: 'Carla Cadastros', role: 'comercial', modulos: {cadastros: true}},
      pcp: {nome: 'Pedro PCP', role: 'pcp'},
      prod: {nome: 'Caio Produção', role: 'production'},
    },
    materiais: {'MPGR-00127': {mpCodigo: 'MPGR-00127', mpNome: 'ALCOOL ETILICO 96°G/L', chaveDuplicidade: 'ALCOOL ETILICO 96 G L'}},
    materiais_chave: {'ALCOOL ETILICO 96 G L': 'MPGR-00127'},
    fornecedores: {f1: {razaoSocial: 'Lunagreen Ltda', nomeFantasia: 'Lunagreen'}},
  });
  const svc = AmostrasMp.criarServico({db});
  const dados = {tipo: 'NOVA', materialNovo: {nome: 'Pigmento Rosa X'}, fornecedorKey: 'f1', custoKg: 120, custoAmostra: 0,
    quantidade: {valor: 200, unidade: 'g'}, motivo: 'DESENVOLVIMENTO', previsaoChegada: '2026-11-15'};

  // 1. Serviço real cria; quem lê e quem não lê.
  const r = await svc.executar('pd', {acao: 'CRIAR', requestId: 'c1', dados});
  assert.equal(r.codigo, 'AM-0001');
  for (const uid of ['pd', 'yas', 'log', 'cad', 'pcp']) assert.equal((await como(uid).ref('amostras_mp/' + r.id + '/status').get()).val(), 'SOLICITADA', uid + ' lê');
  await negado(como('prod').ref('amostras_mp').get(), 'produção não lê');
  passo('serviço real cria; P&D, Yasmim (módulo), logística, Cadastros e PCP leem; produção não');

  // 2. Navegador não grava amostras nem pedidos.
  for (const uid of ['pd', 'log', 'cad', 'pcp']) {
    await negado(como(uid).ref('amostras_mp/' + r.id + '/status').set('HOMOLOGADA'), uid + ' não grava status');
    await negado(como(uid).ref('amostras_mp/novo').set({status: 'SOLICITADA'}), uid + ' não cria amostra');
  }
  await negado(como('pd').ref('amostras_mp_pedidos/pd/x').set('y'));
  await negado(como('pd').ref('amostras_mp_pedidos/pd').get());
  passo('ninguém grava amostras_mp nem amostras_mp_pedidos pelo navegador');

  // 3. Duas baixas simultâneas: só uma vence.
  const baixa = (uid, req) => svc.executar(uid, {acao: 'RECEBER', id: r.id, requestId: req, dados: {data: '2026-11-14', forma: 'MOTOBOY'}});
  const res = await Promise.allSettled([baixa('log', 'b1'), baixa('log2', 'b2')]);
  assert.equal(res.filter((x) => x.status === 'fulfilled').length, 1, JSON.stringify(res.map((x) => x.status)));
  const perdeu = res.find((x) => x.status === 'rejected');
  assert.equal(perdeu.reason.code, 'failed-precondition');
  assert.match(perdeu.reason.message, /já foi recebida/);
  const hist = Object.values((await db.ref('amostras_mp/' + r.id + '/historico').get()).val());
  assert.deepEqual(hist.map((e) => e.acao), ['CRIAR', 'RECEBER'], 'uma baixa só no histórico');
  passo('duas baixas ao mesmo tempo: uma grava, a outra recebe "já foi recebida"');

  // 4. Fornecedor: P&D cria novo (com histórico) mas não edita existente; Cadastros edita.
  const novo = {
    'fornecedores/fNovo/razaoSocial': 'Pigmentos Brasil Ltda', 'fornecedores/fNovo/ativo': true, 'fornecedores/fNovo/matrizKey': null,
    'historico_fornecedores/fNovo/h1': {acao: 'CRIADO', campo: '_criado', alteradoEm: '2026-11-11T12:00:00Z', alteradoPor: 'Paula P&D'},
  };
  await como('pd').ref().update(novo);
  assert.equal((await db.ref('fornecedores/fNovo/razaoSocial').get()).val(), 'Pigmentos Brasil Ltda');
  await negado(como('pd').ref().update({'fornecedores/f1/razaoSocial': 'Outro nome'}), 'P&D não edita existente');
  await negado(como('pd').ref().update({'historico_fornecedores/f1/h9': {acao: 'EDICAO'}}), 'P&D não escreve histórico de existente');
  await negado(como('log').ref().update({'fornecedores/fLog/razaoSocial': 'X'}), 'logística não cria fornecedor');
  await como('cad').ref().update({'fornecedores/f1/razaoSocial': 'Lunagreen Cosméticos Ltda'});
  passo('P&D cria fornecedor novo com histórico; não edita existente; logística não cria; Cadastros edita');

  console.log('run_amostras_mp_emulator_test: ' + n + ' passos OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
