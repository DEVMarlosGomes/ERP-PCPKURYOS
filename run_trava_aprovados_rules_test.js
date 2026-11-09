'use strict';
/* Trava do aprovado (08/11/2026): regras de formulas/bom/especificacoes no emulador real.
     firebase emulators:exec --project demo-trava --only database --config firebase.trava-test.json "node run_trava_aprovados_rules_test.js"
   - rascunho e criação seguem com as permissões de antes (PCP/Qualidade/Cadastros);
   - versão APROVADA: só quem tem modulos/alterar_aprovados, com ultimaAlteracao (horário do servidor,
     < 2 min, justificativa >= 10, uid próprio) e a linha de historicoAlteracoes no mesmo update;
   - ninguém apaga versão aprovada pelo navegador; o ADM sem o módulo também não altera. */
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

const aprovada = (extra) => Object.assign({codProduto: 'MRARHD03', versao: 'v1', status: 'APROVADA', itens: {imp5: {mpCodigo: '', percentualMM: 0.1}}}, extra || {});
function alteracao(uid, id, justificativa, emMs) {
  return {
    [`ultimaAlteracao`]: {id, porUid: uid, por: uid, em_ms: emMs === undefined ? ServerValue.TIMESTAMP : emMs, justificativa},
    [`historicoAlteracoes/${id}`]: {em_ms: ServerValue.TIMESTAMP, porUid: uid, acao: 'ALTERAR_ITEM_APROVADO', justificativa},
  };
}
const prefixar = (base, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`${base}/${k}`, v]));

(async () => {
  await getDatabase(raiz).ref().set({
    usuarios: {
      pcp: {role: 'pcp'}, cq: {role: 'qualidade'}, cad: {role: 'production', modulos: {cadastros: true}},
      adm: {role: 'admin'},
      adlai: {role: 'pcp', modulos: {alterar_aprovados: true}},
      yasmim: {role: 'comercial', modulos: {pd: true, qualidade: true, alterar_aprovados: true}},
      gustavo: {role: 'admin', modulos: {alterar_aprovados: true}},
      off: {role: 'pcp', desativado: true, modulos: {alterar_aprovados: true}},
    },
    formulas: {MRARHD03__v1: aprovada(), FBBS0004__v1: aprovada({codProduto: 'FBBS0004'}), RASC__v1: {codProduto: 'RASC', versao: 'v1', status: 'RASCUNHO', itens: {}}},
    bom: {MRARHD03__v1: aprovada({itens: {b1: {materialCodigo: 'EM-1', qtdPorPeca: 1}}})},
    especificacoes: {MRARHD03__v1: aprovada({itens: {e1: {ensaio: 'pH', minimo: '5'}}})},
  });
  const pcp = como('pcp'), adlai = como('adlai'), yasmim = como('yasmim'), gustavo = como('gustavo');

  // 1. Rascunho e criação: como antes.
  await pcp.ref('formulas/RASC__v1/itens/x').set({mpCodigo: 'MPGR-1', percentualMM: 100});
  await pcp.ref('formulas/RASC__v2').set({codProduto: 'RASC', versao: 'v2', status: 'RASCUNHO', itens: {}});
  await pcp.ref().update({'formulas/RASC__v1/status': 'APROVADA', 'formulas/RASC__v1/aprovadoPD': {nome: 'P'}});
  await como('cq').ref('especificacoes/NOVA__v1').set({codProduto: 'NOVA', versao: 'v1', status: 'RASCUNHO', itens: {}});
  passo('rascunho: PCP edita, cria versão e aprova; Qualidade cria especificação');

  // 2. Aprovada: quem não tem o módulo não mexe (nem o ADM, nem o "Revisado").
  await negado(pcp.ref('formulas/MRARHD03__v1/itens/imp5/mpCodigo').set('MPGR-00129'));
  await negado(pcp.ref('formulas/MRARHD03__v1/revisado').set(false));
  await negado(como('cad').ref('bom/MRARHD03__v1/itens/b1/qtdPorPeca').set(2));
  await negado(como('cq').ref('especificacoes/MRARHD03__v1/itens/e1/minimo').set('4'));
  await negado(como('adm').ref().update(prefixar('formulas/MRARHD03__v1', Object.assign({'itens/imp5/mpCodigo': 'MPGR-00129'}, alteracao('adm', 'h0', 'ADM sem o módulo tentando')))));
  await negado(pcp.ref('formulas/RASC__v1/itens/x/percentualMM').set(99), 'RASC__v1 foi aprovada no passo 1');
  passo('aprovada: PCP, Cadastros, Qualidade e ADM sem o módulo não alteram (nem o Revisado)');

  // 3. Com o módulo: só com justificativa, horário do servidor e histórico no mesmo update.
  const base = 'formulas/MRARHD03__v1';
  await negado(adlai.ref(`${base}/itens/imp5/mpCodigo`).set('MPGR-00129'), 'sem justificativa');
  await negado(adlai.ref().update(prefixar(base, Object.assign({'itens/imp5/mpCodigo': 'MPGR-00129'}, alteracao('adlai', 'h1', 'curta')))), 'justificativa curta');
  const semHist = alteracao('adlai', 'h2', 'Linha sem material: é o ALCALIN cadastrado');
  delete semHist['historicoAlteracoes/h2'];
  await negado(adlai.ref().update(prefixar(base, Object.assign({'itens/imp5/mpCodigo': 'MPGR-00129'}, semHist))), 'sem histórico');
  await negado(adlai.ref().update(prefixar(base, Object.assign({'itens/imp5/mpCodigo': 'MPGR-00129'}, alteracao('adlai', 'h3', 'Linha sem material: é o ALCALIN cadastrado', 1000)))), 'horário antigo');
  await negado(adlai.ref().update(prefixar(base, Object.assign({'itens/imp5/mpCodigo': 'MPGR-00129'}, alteracao('yasmim', 'h4', 'Assinando em nome de outra pessoa')))), 'uid de outra pessoa');
  await adlai.ref().update(prefixar(base, Object.assign({'itens/imp5/mpCodigo': 'MPGR-00129', 'itens/imp5/mpNome': 'ALCALIN'}, alteracao('adlai', 'h5', 'Linha sem material: é o ALCALIN cadastrado'))));
  const f = (await getDatabase(raiz).ref(base).get()).val();
  assert.equal(f.status, 'APROVADA');
  assert.equal(f.itens.imp5.mpCodigo, 'MPGR-00129');
  assert.equal(f.historicoAlteracoes.h5.porUid, 'adlai');
  assert.equal(typeof f.historicoAlteracoes.h5.em_ms, 'number');
  passo('com o módulo: sem justificativa, curta, sem histórico, horário antigo ou em nome de outro → recusado; completo → grava e segue APROVADA');

  // Os três (Yasmim sem papel de PCP, Gustavo admin) e BOM/Especificação também.
  await yasmim.ref().update(prefixar('especificacoes/MRARHD03__v1', Object.assign({'itens/e1/minimo': '4,5'}, alteracao('yasmim', 'h6', 'Faixa de pH revisada pelo P&D'))));
  await gustavo.ref().update(prefixar('bom/MRARHD03__v1', Object.assign({'itens/b1/qtdPorPeca': 2}, alteracao('gustavo', 'h7', 'Duas tampas por peça, conferido na linha'))));
  passo('Yasmim altera a Especificação e Gustavo o BOM aprovados, cada um com justificativa');

  // 4. Ninguém apaga aprovada pelo navegador; perfil desativado com o módulo não grava.
  await negado(adlai.ref('formulas/FBBS0004__v1').remove(), 'apagar aprovada');
  await negado(gustavo.ref('especificacoes/MRARHD03__v1').remove());
  await negado(como('off').ref().update(prefixar('formulas/FBBS0004__v1', Object.assign({'itens/imp5/percentualMM': 0.2}, alteracao('off', 'h8', 'Conta desativada tentando alterar')))));
  passo('ninguém apaga versão aprovada; perfil desativado com o módulo não grava');

  console.log(`run_trava_aprovados_rules_test: OK (${n} passos)`);
  await Promise.all(Object.values(apps).concat([raiz]).map((a) => deleteApp(a)));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
