'use strict';
/* Manutenção › Ativos abre Solicitação de Compra (16/11/2026), no emulador real:
   firebase emulators:exec --only database --project demo-ativos --config firebase.retrabalhos-test.json "node run_ativos_compras_rules_test.js"
   Quem tem só o módulo manutencao CRIA a SC do ativo (PENDENTE, origem.tipo
   ATIVO) e numera; não aprova, não edita, não apaga, não abre SC de outra
   origem. Compras continua com o fluxo inteiro. */
const assert = require('assert/strict');
// firebase-admin 14: só a API modular.
const reqFunctions = require('node:module').createRequire(require('node:path').join(__dirname, 'functions/package.json'));
const {initializeApp} = reqFunctions('firebase-admin/app');
const {getDatabase} = reqFunctions('firebase-admin/database');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9023') throw new Error('Teste exige emulador local 9023.');
const URL = 'http://127.0.0.1:9023?ns=demo-ativos-default-rtdb';
const raiz = {database: () => getDatabase(initializeApp({projectId: 'demo-ativos', databaseURL: URL}, 'raiz'))};
const como = (uid) => getDatabase(initializeApp({projectId: 'demo-ativos', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid));
const negado = (p) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i);

const sc = (extra) => Object.assign({numero: 5, numeroFormatado: 'SC-0005', status: 'PENDENTE', criadoEm: '2026-11-16T10:00:00Z',
  itens: {i1: {tipoItem: 'SERVICO', descricao: 'Revisão da envasadora', materialCodigo: '', qtd: 1, unidade: 'SV'}},
  origemModulo: 'MANUTENCAO', origem: {tipo: 'ATIVO', ativoId: 'a1', ativoCodigo: 'EV-01'}}, extra || {});

(async () => {
  await raiz.database().ref().set({
    usuarios: {
      man: {role: 'production', modulos: {manutencao: true}},
      cmp: {role: 'gestor', modulos: {compras: true}},
      op: {role: 'production', modulos: {apontamento: true}}
    },
    config: {contadores: {solicitacaoCompra: 4}},
    solicitacoes_compra: {velha: sc({status: 'APROVADA'})}
  });
  const man = como('man'), cmp = como('cmp'), op = como('op');

  // Manutenção numera e cria a SC do ativo, igual à tela (nextSequential + set).
  const r = await man.ref('config/contadores/solicitacaoCompra').transaction((c) => (c || 0) + 1);
  assert.equal(r.committed, true);
  await man.ref('solicitacoes_compra/nova').set(sc());
  // ...mas só cria: não aprova, não edita, não apaga.
  await negado(man.ref('solicitacoes_compra/nova/status').set('APROVADA'));
  await negado(man.ref('solicitacoes_compra/nova').set(sc({justificativa: 'mudei'})));
  await negado(man.ref('solicitacoes_compra/nova').remove());
  await negado(man.ref('solicitacoes_compra/velha').set(sc()));
  // ...e só SC do ativo, só pendente.
  await negado(man.ref('solicitacoes_compra/x1').set(sc({origem: {tipo: 'CRM_COTACAO'}})));
  await negado(man.ref('solicitacoes_compra/x2').set(sc({origem: null})));
  await negado(man.ref('solicitacoes_compra/x3').set(sc({status: 'APROVADA'})));
  // Quem não tem o módulo não cria nem numera.
  await negado(op.ref('solicitacoes_compra/x4').set(sc()));
  await negado(op.ref('config/contadores/solicitacaoCompra').transaction((c) => (c || 0) + 1));
  // Compras segue com o fluxo: aprova a SC que a Manutenção abriu.
  await cmp.ref('solicitacoes_compra/nova/status').set('APROVADA');
  console.log('run_ativos_compras_rules_test: OK (Manutenção só cria SC PENDENTE do ativo; Compras aprova)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
