'use strict';
/* Histórico do cadastro vivo (10/11/2026): regras de historico_{materiais|produtos|fornecedores} no emulador real.
     firebase emulators:exec --project demo-histcad --only database --config firebase.histcad-test.json "node run_historico_cadastro_rules_test.js"
   - quem grava o cadastro inclui entradas (Compras também no fornecedor) no mesmo update da gravação;
   - ninguém altera nem apaga entrada já gravada (nem o ADM pelo navegador);
   - quem não grava o cadastro não inclui. */
const assert = require('assert/strict');
const path = require('path');
const reqFn = require('module').createRequire(path.resolve(process.env.FUNCTIONS_DIR || (__dirname + '/functions'), 'x.js'));
const {initializeApp} = reqFn('firebase-admin/app');
const {getDatabase, ServerValue} = reqFn('firebase-admin/database');
const PORTA = process.env.HISTCAD_PORTA || '9074';
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:' + PORTA) throw new Error('Teste exige emulador local ' + PORTA + '.');
const URL = `http://127.0.0.1:${PORTA}?ns=demo-histcad-default-rtdb`;
const raiz = initializeApp({projectId: 'demo-histcad', databaseURL: URL}, 'raiz');
const apps = {};
const como = (uid) => getDatabase(apps[uid] || (apps[uid] = initializeApp({projectId: 'demo-histcad', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid)));
const negado = (p, msg) => assert.rejects(p, /permission[ _]denied/i, msg);
let n = 0;
const passo = (m) => { n++; console.log('  ok  ' + m); };
const entrada = (uid, campo) => ({campo, valorAnterior: 'a', valorNovo: 'b', alteradoPor: uid, alteradoPorUid: uid, alteradoEm: '2026-11-10T20:00:00.000Z',
  em_ms: ServerValue.TIMESTAMP, grupo: 'g-' + uid, justificativa: 'Justificativa de teste', acao: 'EDICAO'});

(async () => {
  await getDatabase(raiz).ref().set({
    usuarios: {
      pcp: {role: 'pcp'}, cad: {role: 'production', modulos: {cadastros: true}}, compras: {role: 'production', modulos: {compras: true}},
      adm: {role: 'admin'}, prod: {role: 'production'}, off: {role: 'pcp', desativado: true}
    },
    materiais: {M1: {mpCodigo: 'M1', mpNome: 'A', tipo: 'MPGR'}},
    produtos: {P1: {sku: 'P1', descricao: 'A'}},
    fornecedores: {F1: {razaoSocial: 'A'}},
    historico_materiais: {M1: {velha: entrada('pcp', 'mpNome')}},
    historico_produtos: {P1: {velha: entrada('pcp', 'descricao')}},
    historico_fornecedores: {F1: {velha: entrada('pcp', 'razaoSocial')}}
  });

  // 1. Quem grava o cadastro inclui a entrada no mesmo update da gravação.
  await como('cad').ref().update({'produtos/P1/descricao': 'B', 'historico_produtos/P1/e1': entrada('cad', 'descricao')});
  await como('pcp').ref().update({'fornecedores/F1/razaoSocial': 'B', 'historico_fornecedores/F1/e1': entrada('pcp', 'razaoSocial')});
  await como('compras').ref().update({'fornecedores/F1/cidade': 'X', 'historico_fornecedores/F1/e2': entrada('compras', 'cidade')});
  await como('cad').ref('historico_materiais/M1/e1').set(entrada('cad', 'mpNome'));
  passo('Cadastros/PCP incluem em produtos e fornecedores; Compras inclui em fornecedores; material também');

  // 2. Só inclusão: alterar ou apagar entrada já gravada é recusado, inclusive para o ADM.
  for (const no of ['historico_materiais/M1', 'historico_produtos/P1', 'historico_fornecedores/F1']) {
    await negado(como('adm').ref(no + '/velha/justificativa').set('reescrita'), no + ': alterar campo');
    await negado(como('adm').ref(no + '/velha').set(entrada('adm', 'x')), no + ': sobrescrever');
    await negado(como('adm').ref(no + '/velha').remove(), no + ': apagar');
    await negado(como('pcp').ref(no).remove(), no + ': apagar o histórico inteiro');
  }
  passo('entradas gravadas não se alteram nem se apagam (ADM e PCP)');

  // 3. Quem não grava o cadastro não inclui; perfil desativado também não.
  await negado(como('prod').ref('historico_produtos/P1/e9').set(entrada('prod', 'x')));
  await negado(como('compras').ref('historico_produtos/P1/e9').set(entrada('compras', 'x')), 'Compras não grava produto');
  await negado(como('compras').ref('historico_materiais/M1/e9').set(entrada('compras', 'x')));
  await negado(como('off').ref('historico_fornecedores/F1/e9').set(entrada('off', 'x')));
  passo('sem permissão no cadastro não inclui; desativado não inclui');

  const final = (await getDatabase(raiz).ref('historico_fornecedores/F1').get()).val();
  assert.deepEqual(Object.keys(final).sort(), ['e1', 'e2', 'velha']);
  assert.equal(final.velha.justificativa, 'Justificativa de teste');
  console.log('OK regras do histórico do cadastro: ' + n + ' passos (inclusão por quem grava, nada se altera/apaga, sem permissão recusado).');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
