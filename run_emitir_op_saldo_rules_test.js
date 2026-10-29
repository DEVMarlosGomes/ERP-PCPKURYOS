'use strict';
/* OP-01 (reunião 28/10): regras do banco da trava de saldo na emissão de OP, no emulador real:
   firebase emulators:exec --project demo-emitirop --only database --config firebase.retrabalhos-test.json "node run_emitir_op_saldo_rules_test.js"
   (--project igual ao projectId daqui; sem isso o emulador não aplica database.rules.json ao namespace.)
   - config/emitirOp/bloquearSemSaldo: só o ADM liga/desliga (PCP e módulo config não);
   - ops/{op}/liberacaoSemSaldo: só o ADM, em nome próprio e com motivo;
   - quem emite OP (PCP, módulo emitir_op) segue emitindo sem liberação;
   - regravar a OP inteira com a liberação que já estava (apontamento) continua valendo. */
const assert = require('assert/strict');
const admin = require('./functions/node_modules/firebase-admin');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9023') throw new Error('Teste exige emulador local 9023.');
const URL = 'http://127.0.0.1:9023?ns=demo-emitirop-default-rtdb';
const raiz = admin.initializeApp({projectId: 'demo-emitirop', databaseURL: URL}, 'raiz');
const como = (uid) => admin.initializeApp({projectId: 'demo-emitirop', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid).database();
const negado = (p) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i);

(async () => {
  await raiz.database().ref().set({
    usuarios: {
      adm: {role: 'admin'},
      pcp: {role: 'pcp'},
      cfg: {role: 'gestor', modulos: {config: true}},
      emi: {role: 'gestor', modulos: {emitir_op: true}},
      prod: {role: 'production'}
    },
    config: {linhas: ['Linha 1']},
    ops: {}
  });
  const adm = como('adm'), pcp = como('pcp'), cfg = como('cfg'), emi = como('emi'), prod = como('prod');
  let n = 0;
  const passo = (m) => { n++; console.log('  ok  ' + m); };

  // Chave: só o ADM.
  await negado(pcp.ref('config/emitirOp').update({bloquearSemSaldo: false, alteradoPor: 'PCP'}));
  await negado(cfg.ref('config/emitirOp/bloquearSemSaldo').set(true));
  passo('PCP e módulo config não mexem na trava');
  await adm.ref('config/emitirOp').update({bloquearSemSaldo: true, alteradoPor: 'ADM', alteradoEm: '2026-10-29T10:00:00Z'});
  await negado(adm.ref('config/emitirOp/bloquearSemSaldo').set('sim'));
  passo('ADM liga a trava (booleano)');
  // O resto de config/ continua como era para PCP e módulo config.
  await pcp.ref('config/linhas').set(['Linha 1', 'Linha 2']);
  await cfg.ref('config/linhas').set(['Linha 1']);
  passo('demais chaves de config/ seguem abertas para PCP e módulo config');

  // OP sem liberação: quem emite segue emitindo.
  const op = {lote: '26302/01', sku: 'MRARBS04', status: 'Não Iniciado', qtdPlanejada: 1000};
  await pcp.ref('ops/26302-01').set(op);
  await emi.ref('ops/26302-02').set(Object.assign({}, op, {lote: '26302/02'}));
  passo('PCP e módulo emitir_op emitem OP sem liberação');

  // Liberação: só o ADM, em nome próprio, com motivo.
  const lib = {motivo: 'Material chega amanhã cedo, NF 123', por: 'ADM', porUid: 'adm', em: '2026-10-29T10:05:00Z', faltas: [{mpCodigo: 'EP-1', necessario: 1000, saldo: 200, unidade: 'un'}]};
  await negado(pcp.ref('ops/26302-03').set(Object.assign({}, op, {lote: '26302/03', liberacaoSemSaldo: Object.assign({}, lib, {porUid: 'pcp'})})));
  await negado(emi.ref('ops/26302-01/liberacaoSemSaldo').set(Object.assign({}, lib, {porUid: 'emi'})));
  passo('PCP/módulo emitir_op não gravam liberação nem em nome próprio');
  await negado(adm.ref('ops/26302-03').set(Object.assign({}, op, {liberacaoSemSaldo: Object.assign({}, lib, {porUid: 'pcp'})})));
  await negado(adm.ref('ops/26302-03').set(Object.assign({}, op, {liberacaoSemSaldo: Object.assign({}, lib, {motivo: 'curto'})})));
  passo('ADM não libera em nome de outro nem sem motivo');
  await adm.ref('ops/26302-03').set(Object.assign({}, op, {lote: '26302/03', liberacaoSemSaldo: lib}));
  const salvo = (await raiz.database().ref('ops/26302-03/liberacaoSemSaldo/motivo').once('value')).val();
  assert.equal(salvo, lib.motivo);
  passo('ADM emite com liberação e motivo gravados na OP');

  // Apontamento regrava a OP com a liberação de antes: continua valendo.
  const atual = (await raiz.database().ref('ops/26302-03').once('value')).val();
  await prod.ref('ops/26302-03').set(Object.assign({}, atual, {produzidoLinha: 50}));
  await prod.ref('ops/26302-03/produzidoLinha').set(60);
  await negado(prod.ref('ops/26302-03/liberacaoSemSaldo/motivo').set('trocado pelo apontamento'));
  passo('apontamento regrava a OP sem tocar a liberação; trocar o motivo é barrado');

  console.log(`run_emitir_op_saldo_rules_test: OK (${n} passos)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
