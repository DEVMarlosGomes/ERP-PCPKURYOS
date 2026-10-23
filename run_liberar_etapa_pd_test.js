'use strict';
/* INF-04 + AMO-03 de ponta a ponta no emulador: a função real liberarEtapaPd (functions/index.js)
   recusa a fórmula/variante fora de 100%, libera quando fecha, e a regra do banco aceita a gravação
   do status só com essa liberação.
   firebase emulators:exec --project demo-liberar --only database --config firebase.retrabalhos-test.json "node run_liberar_etapa_pd_test.js" */
const assert = require('assert/strict');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9023') throw new Error('Teste exige emulador local 9023.');
process.env.GCLOUD_PROJECT = 'demo-liberar';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-liberar', databaseURL: 'http://127.0.0.1:9023?ns=demo-liberar-default-rtdb' });
const admin = require('./functions/node_modules/firebase-admin');
const fns = require('./functions/index.js'); // inicializa o app padrão (servidor) neste emulador
const raiz = admin.database();
const URL = 'http://127.0.0.1:9023?ns=demo-liberar-default-rtdb';
const pd = admin.initializeApp({ projectId: 'demo-liberar', databaseURL: URL, databaseAuthVariableOverride: { uid: 'pd' } }, 'pd').database();
const T = 'erp/kuryos';
const chamar = (uid, data) => fns.liberarEtapaPd.run({ auth: { uid }, data });

(async () => {
  await raiz.ref().set({
    usuarios: { pd: { role: 'pd', tenant_id: 'kuryos', name: 'Yasmim' }, semtenant: { role: 'pd' } },
    erp: { kuryos: {
      pd_requests: { R1: { id: 'R1', status: 'IN_PROGRESS', assigned_to_name: 'Yasmim' }, R2: { id: 'R2', status: 'APPROVED' } },
      pd_developments: { D1: { id: 'D1', request_id: 'R1' } },
      pd_formulas: { F1: { id: 'F1', development_id: 'D1', version: 1 } },
      pd_formula_items: {
        I1: { id: 'I1', formula_id: 'F1', ingredient_name: 'Álcool', percentage: 80 },
        I2: { id: 'I2', formula_id: 'F1', ingredient_name: 'Água', percentage: 19 },
        I3: { id: 'I3', formula_id: 'F1', ingredient_name: 'Fragrância A', percentage: 0.5 },
      },
      pd_sample_batches: { L1: { id: 'L1', development_id: 'D1', nome: 'Lote Out', formula_base_id: 'F1', status_base: 'ativa',
        variantes: [{ nome: 'Rosa', overrides: [{ ingredient_name_base: 'Fragrância A', ingredient_name: 'Fragrância B', percentage: 1.5 }] }] } },
    } },
  });

  // Sem tenant não libera.
  await assert.rejects(chamar('semtenant', { requestId: 'R1', novoStatus: 'IN_TESTS' }), (e) => e.code === 'permission-denied');
  // Fórmula com 99,5%: recusa com as linhas (o popup da tela usa estas).
  await assert.rejects(chamar('pd', { requestId: 'R1', novoStatus: 'IN_TESTS' }), (e) => {
    assert.equal(e.code, 'failed-precondition');
    assert.equal(e.details.codigo, 'FORMULA_NAO_FECHA_100');
    // A variante do lote (fragrância a 1,5% no lugar dos 0,5%) também não fecha: as duas aparecem.
    assert.deepEqual(e.details.linhas, ['Fórmula v1: Soma 99,5% — falta 0,5%.', 'Lote Lote Out · Rosa: Soma 100,5% — excede 0,5%.']);
    assert.equal(e.details.responsavel, 'Yasmim');
    return true;
  });
  assert.equal((await raiz.ref(T + '/pd_liberacoes_status/R1').get()).val(), null, 'recusado não libera');
  // A Química completa a fórmula: agora a variante (base + fragrância a 1,5%) passa a exceder 1%.
  await raiz.ref(T + '/pd_formula_items/I3/percentage').set(1);
  await assert.rejects(chamar('pd', { requestId: 'R1', novoStatus: 'IN_TESTS' }), (e) => {
    assert.deepEqual(e.details.linhas, ['Lote Lote Out · Rosa: Soma 100,5% — excede 0,5%.']);
    return true;
  });
  await raiz.ref(T + '/pd_sample_batches/L1/variantes/0/overrides/0/percentage').set(1);
  assert.deepEqual(await chamar('pd', { requestId: 'R1', novoStatus: 'IN_TESTS' }), { ok: true });
  const lib = (await raiz.ref(T + '/pd_liberacoes_status/R1').get()).val();
  assert.equal(lib.status, 'IN_TESTS');
  assert.ok(lib.ate > Date.now());
  // Com a liberação, a gravação do cliente passa na regra; sem, não.
  await pd.ref(T + '/pd_requests/R1/status').set('IN_TESTS');
  await assert.rejects(pd.ref(T + '/pd_requests/R1/status').set('WAITING_APPROVAL'), /PERMISSION_DENIED|permission_denied/i);
  // Retrocesso do ADM de Aprovado para Aguardando: libera sem refazer a conta; de outro status, não.
  assert.deepEqual(await chamar('pd', { requestId: 'R2', novoStatus: 'WAITING_APPROVAL', voltar: true }), { ok: true });
  await assert.rejects(chamar('pd', { requestId: 'R1', novoStatus: 'WAITING_APPROVAL', voltar: true }), (e) => e.code === 'failed-precondition');

  console.log('run_liberar_etapa_pd_test: OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
