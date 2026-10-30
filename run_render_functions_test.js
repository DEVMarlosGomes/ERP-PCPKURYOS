'use strict';
/* Servidor das functions no Render (functions/render-server.js), sem rede nem Firebase:
   node run_render_functions_test.js
   Usa o pacote real firebase-functions (v2) para criar funções sintéticas e confere:
   - protocolo callable: {data} -> {result}; HttpsError -> {error:{status,message}};
     token inválido -> 401 UNAUTHENTICATED; token válido chega como request.auth;
   - onRequest com req.get/req.body/res.status().json();
   - gatilhos do banco: estado inicial é linha de base (não dispara), created só em
     criação, written em alteração/remoção, com params e before/after corretos;
   - agenda "every N minutes";
   - classificação das 21 funções reais do functions/index.js. */
const assert = require('assert/strict');
const path = require('path');
const fnsDir = path.join(__dirname, 'functions');
const req = require('module').createRequire(path.join(fnsDir, 'package.json'));
const { onCall, onRequest, HttpsError } = req('firebase-functions/v2/https');
const { onValueCreated, onValueWritten } = req('firebase-functions/v2/database');
const { onSchedule } = req('firebase-functions/v2/scheduler');
const server = require('./functions/render-server.js');

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-test';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({ projectId: 'demo-test', databaseURL: 'https://demo-test-default-rtdb.firebaseio.com' });

const quiet = { info() {}, warn() {}, error() {} };
const results = [];
async function check(name, fn) { try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e.stack || e.message]); } }

// Banco falso: ref(path).on('value') + emissão manual de novos estados.
function fakeDb() {
  const listeners = new Map();
  const snap = (value, base) => ({
    val: () => (value === undefined ? null : JSON.parse(JSON.stringify(value))),
    exists: () => value !== undefined && value !== null,
    key: String(base).split('/').pop(),
    child: (rel) => snap(String(rel).split('/').reduce((o, k) => (o == null ? undefined : o[k]), value), base + '/' + rel),
  });
  return {
    ref: (p) => ({ key: String(p).split('/').pop(), on: (_ev, cb) => { listeners.set(p, cb); }, off: () => listeners.delete(p) }),
    emit: (p, value) => listeners.get(p)(snap(value, p)),
  };
}

(async () => {
  const seen = [];
  const fns = {
    eco: onCall((request) => ({ recebido: request.data, uid: request.auth ? request.auth.uid : null })),
    falha: onCall(() => { throw new HttpsError('failed-precondition', 'Lote já conferido.'); }),
    quebra: onCall(() => { throw new Error('bug interno'); }),
    api: onRequest((r, s) => {
      if (r.method !== 'POST') return s.status(405).json({ ok: false });
      s.status(201).json({ ok: true, chave: r.get('x-api-key'), body: r.body });
    }),
    criado: onValueCreated({ ref: '/pedidos_comerciais/{id}/versoes/{versao}', instance: 'x-default-rtdb' }, (e) => { seen.push(['criado', e.params, e.data.val()]); }),
    alterado: onValueWritten({ ref: '/ops/{opKey}/status', instance: 'x-default-rtdb' }, (e) => { seen.push(['alterado', e.params, e.data.before.val(), e.data.after.val(), typeof e.id]); }),
    agenda: onSchedule({ schedule: 'every 2 minutes' }, () => { seen.push(['agenda']); }),
  };
  const admin = { auth: () => ({ verifyIdToken: async (t) => { if (t !== 'token-bom') throw new Error('inválido'); return { uid: 'u-ana', email: 'ana@kuryos' }; } }) };
  const srv = server.createServer({ fns, admin, corsOrigins: ['https://pcp.vercel.app'], log: quiet });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (name, body, headers = {}) => fetch(`${base}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

  await check('callable devolve {result} e recebe o usuário do token', async () => {
    const r = await post('eco', { data: { lote: 'L1' } }, { Authorization: 'Bearer token-bom' });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { result: { recebido: { lote: 'L1' }, uid: 'u-ana' } });
  });
  await check('callable sem token roda sem auth (a função decide)', async () => {
    assert.deepEqual((await (await post('eco', { data: 1 })).json()).result, { recebido: 1, uid: null });
  });
  await check('token inválido -> 401 UNAUTHENTICATED', async () => {
    const r = await post('eco', { data: {} }, { Authorization: 'Bearer falso' });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error.status, 'UNAUTHENTICATED');
  });
  await check('HttpsError chega ao SDK com status e mensagem', async () => {
    const r = await post('falha', { data: {} });
    assert.equal(r.status, 400);
    assert.deepEqual((await r.json()).error, { status: 'FAILED_PRECONDITION', message: 'Lote já conferido.' });
  });
  await check('erro inesperado vira INTERNAL sem vazar detalhe', async () => {
    const r = await post('quebra', { data: {} });
    assert.equal(r.status, 500);
    assert.deepEqual((await r.json()).error, { status: 'INTERNAL', message: 'INTERNAL' });
  });
  await check('corpo sem "data" -> 400 INVALID_ARGUMENT', async () => {
    assert.equal((await post('eco', { x: 1 })).status, 400);
  });
  await check('CORS só para a origem do site', async () => {
    const ok = await fetch(`${base}/eco`, { method: 'OPTIONS', headers: { Origin: 'https://pcp.vercel.app' } });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://pcp.vercel.app');
    const outra = await fetch(`${base}/eco`, { method: 'OPTIONS', headers: { Origin: 'https://malicioso.example' } });
    assert.equal(outra.headers.get('access-control-allow-origin'), null);
  });
  await check('onRequest com req.get/req.body/res.status().json()', async () => {
    const r = await post('api', { pedido: 7 }, { 'X-API-Key': 'k1' });
    assert.equal(r.status, 201);
    assert.deepEqual(await r.json(), { ok: true, chave: 'k1', body: { pedido: 7 } });
  });
  await check('função inexistente ou de gatilho não é exposta por HTTP', async () => {
    assert.equal((await post('naoExiste', { data: {} })).status, 404);
    assert.equal((await post('alterado', { data: {} })).status, 404);
  });
  await check('health para o pinger', async () => {
    const r = await fetch(`${base}/health`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ok, true);
  });

  await check('gatilhos: linha de base não dispara; created/written disparam com params', async () => {
    const db = fakeDb();
    const t = server.startTriggers({ fns, db, log: quiet });
    db.emit('pedidos_comerciais', { P1: { versoes: { v1: { a: 1 } } } });
    db.emit('ops', { OP1: { status: 'Em Produção' } });
    await t.drain();
    assert.deepEqual(seen, [], 'estado ao ligar não dispara nada');
    db.emit('pedidos_comerciais', { P1: { versoes: { v1: { a: 1 }, v2: { a: 2 } } }, P2: { cliente: 'x' } });
    db.emit('ops', { OP1: { status: 'Concluído' }, OP2: { status: 'Aberta', lote: '1' } });
    await t.drain();
    db.emit('ops', { OP1: { status: 'Concluído', produzido: 10 }, OP2: { status: 'Aberta', lote: '2' } });
    await t.drain();
    db.emit('ops', { OP2: { status: 'Aberta', lote: '2' } });
    await t.drain();
    t.stop();
    assert.deepEqual(seen, [
      ['criado', { id: 'P1', versao: 'v2' }, { a: 2 }],
      ['alterado', { opKey: 'OP1' }, 'Em Produção', 'Concluído', 'string'],
      ['alterado', { opKey: 'OP2' }, null, 'Aberta', 'string'],
      ['alterado', { opKey: 'OP1' }, 'Concluído', null, 'string'],
    ]);
    seen.length = 0;
  });

  await check('agenda "every 2 minutes" roda o handler', async () => {
    let tick;
    let ms;
    let inicio = 0;
    server.startSchedules({ fns, log: quiet, setIntervalFn: (f, m) => { tick = f; ms = m; return 0; }, setTimeoutFn: () => { inicio += 1; } });
    assert.equal(ms, 120000);
    assert.equal(inicio, 0, 'agenda curta não roda ao ligar');
    await tick();
    assert.deepEqual(seen, [['agenda']]);
  });

  await check('agenda longa (dólar a cada 15 min) roda também 30 s depois de ligar', async () => {
    const longa = Object.assign(async () => {}, { __endpoint: { scheduleTrigger: { schedule: 'every 15 minutes' } }, run: async () => {} });
    const agendados = [];
    server.startSchedules({ fns: { longa }, log: quiet, setIntervalFn: () => 0, setTimeoutFn: (f, m) => { agendados.push(m); } });
    assert.deepEqual(agendados, [30000]);
  });

  await check('as 36 funções reais são reconhecidas (24 ações — liberarEtapaPd desde 22/10; alterarTitularidadeEstoque desde 30/10 (PORT-04); congelarTabelaPontos, fecharMesResultado e recalcularPlacar desde 26/10; 4 do Financeiro e 4 da Controladoria desde 28/10 —, 2 APIs, 6 gatilhos, 4 agendas — calcularResultado desde 26/10, derivarGestaoFinanceira desde 28/10)', async () => {
    const real = require('./functions/index.js');
    const count = {};
    for (const f of Object.values(real)) { const k = server.kindOf(f); count[k] = (count[k] || 0) + 1; }
    assert.deepEqual(count, { callable: 24, request: 2, event: 6, schedule: 4 });
    assert.equal(server.kindOf(real.alterarTitularidadeEstoque), 'callable');
  });

  srv.close();
  for (const [s, n, m] of results) console.log(`  ${s === 'ok' ? 'ok  ' : 'FAIL'} ${n}${m ? `\n        ${m}` : ''}`);
  const failed = results.filter((r) => r[0] !== 'ok').length;
  console.log(`${results.length - failed}/${results.length} passaram`);
  process.exit(failed ? 1 : 0);
})();
