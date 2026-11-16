'use strict';
/* A3 (auditoria "trânsito da informação", 13/11/2026): criar OP só pelo servidor.
   A escrita ampla ficava no nível de `ops`, onde `data` é o nó inteiro e sempre existe em
   produção -- a condição "a OP já existe" era sempre verdadeira e 17 OPs de 03 a 05/11
   nasceram sem passar por emitirOpServidor. Este teste roda com o nó POVOADO, a situação real.
   firebase emulators:exec --project demo-opscriacao --only database --config firebase.retrabalhos-test.json "node run_ops_regra_criacao_rules_test.js"
   (--project igual ao projectId daqui; sem isso o emulador não aplica database.rules.json.) */
const assert = require('assert/strict');
const path = require('path');
const m = (s) => require(path.join(__dirname, 'functions/node_modules/firebase-admin/lib', s));
const {initializeApp} = m('app');
const {getDatabase} = m('database');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9023') throw new Error('Teste exige emulador local 9023.');
const URL = 'http://127.0.0.1:9023?ns=demo-opscriacao-default-rtdb';
const raiz = getDatabase(initializeApp({projectId: 'demo-opscriacao', databaseURL: URL}, 'raiz'));
const como = (uid) => getDatabase(initializeApp({projectId: 'demo-opscriacao', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid));
const negado = (p) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i);

(async () => {
  const opBase = {lote: '26300/01', sku: 'MRARBS04', produto: 'BODY SPLASH', status: 'Não Iniciado', qtdPlanejada: 1000};
  await raiz.ref().set({
    usuarios: {
      adm: {role: 'admin'}, pcp: {role: 'pcp'}, prod: {role: 'production'}, rot: {role: 'rotulagem'},
      emi: {role: 'gestor', modulos: {emitir_op: true}}, apo: {role: 'gestor', modulos: {apontamento: true}},
      qua: {role: 'qualidade'}, com: {role: 'comercial'}
    },
    // Nó povoado: é aqui que a regra antiga deixava passar tudo.
    ops: {'26300-01': opBase, '26300-02': Object.assign({}, opBase, {lote: '26300/02'})}
  });
  const db = (u) => como(u);
  let n = 0;
  const passo = (t) => { n++; console.log('  ok  ' + t); };
  const nova = (lote) => Object.assign({}, opBase, {lote: lote});

  // 1) OP normal não nasce pelo navegador, para ninguém.
  for (const u of ['pcp', 'emi', 'prod', 'rot', 'apo', 'adm']) {
    await negado(db(u).ref('ops/26399-01').set(nova('26399/01')));
  }
  await negado(db('pcp').ref().update({'ops/26399-01': nova('26399/01')}));
  await negado(db('pcp').ref('ops/26399-01').transaction((x) => (x === null ? nova('26399/01') : undefined)));
  assert.equal((await raiz.ref('ops/26399-01').once('value')).exists(), false);
  passo('criar OP normal pelo navegador é barrado (set, update na raiz, transaction; inclusive ADM)');

  // 2) Campo solto em OP inexistente também não: virava uma "OP fantasma" de um campo só.
  await negado(db('prod').ref('ops/26399-09/produzidoLinha').set(50));
  await negado(db('prod').ref().update({'ops/26399-09/status': 'Em Produção'}));
  passo('campo avulso em OP que não existe é barrado');

  // 3) Quem já trabalhava na OP segue trabalhando nela.
  await db('prod').ref('ops/26300-01/produzidoLinha').set(120);
  await db('rot').ref('ops/26300-01/produzidoRotulagem').set(30);
  await db('apo').ref().update({'ops/26300-01/status': 'Em Produção', 'ops/26300-02/dataInicioPlanejada': '2026-11-17T08:00:00'});
  await db('prod').ref('ops/26300-02').transaction((op) => (op ? Object.assign(op, {produzidoLinha: 10}) : op));
  await db('pcp').ref('ops/26300-02/status').set('Aguardando Confirmação');
  const op1 = (await raiz.ref('ops/26300-01').once('value')).val();
  assert.equal(op1.produzidoLinha, 120); assert.equal(op1.status, 'Em Produção');
  passo('apontamento, rotulagem, planejamento e PCP seguem gravando em OP existente');

  // 4) Retrabalho continua nascendo pela tela: PCP (tela de OPs) e Qualidade (inspeção total).
  const rt = (lote) => Object.assign(nova(lote), {tipoOrdem: 'RETRABALHO', retrabalhoDeOpKey: '26300-01'});
  await db('pcp').ref('ops/26300-01-RT1').transaction((x) => (x === null ? rt('26300/01-RT1') : undefined));
  await db('qua').ref().update({'ops/26300-01-RT2': rt('26300/01-RT2'), 'ops/26300-01/qualidadePA': {decisao: 'LIBERADO_EXPEDICAO'}});
  await negado(db('qua').ref('ops/26399-02').set(nova('26399/02')));
  await negado(db('com').ref('ops/26300-01-RT3').set(rt('26300/01-RT3')));
  passo('retrabalho nasce pela tela (PCP e Qualidade); Qualidade não cria OP normal; Comercial nada');

  // 5) Perfil sem acesso a OP não escreve em OP existente.
  await negado(db('com').ref('ops/26300-01/status').set('Cancelado'));
  passo('perfil sem módulo de OP não altera OP existente');

  // 6) O servidor (Admin SDK) cria normalmente -- é o caminho oficial (emitirOpServidor).
  await raiz.ref('ops/26399-01').set(nova('26399/01'));
  assert.equal((await raiz.ref('ops/26399-01/lote').once('value')).val(), '26399/01');
  passo('servidor cria a OP');

  console.log('run_ops_regra_criacao_rules_test: OK (' + n + ' passos)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
