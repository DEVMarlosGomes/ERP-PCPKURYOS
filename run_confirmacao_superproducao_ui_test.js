'use strict';
/* Confirmação de OP com superprodução grosseira abre RNC na hora (13/11/2026).
   Caso real: OP 26302/01 (Rose Absolut), 690 planejadas, 3.470 apontadas --
   granel do Sunrise envasado como Rose. Foi confirmada com aviso e sem RNC.
   Tela real (ops.html), Firebase simulado (harness de run_encerradas_ops_ui_test).
   Rodar: PLAYWRIGHT_MODULE=<node_modules/playwright> node run_confirmacao_superproducao_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function dados() {
  const op = (lote, extra) => Object.assign({lote: lote, sku: 'PRF-BIOF-0006', produto: 'BODY SPLASH ROSE ABSOLUT', cliente: 'BIOFLORA',
    skuPedidoKey: 'PED-0001__PRF-BIOF-0006', linha: 'Linha 2', dataEmissao: '2026-10-29T12:51:23Z'}, extra);
  return {
    usuarios: {u1: {nome: 'Adlai', email: 'g@kuryos.com', role: 'pcp'}},
    config: {linhas: ['Linha 2']},
    ops: {
      '26302-01': op('26302/01', {status: 'Aguardando Confirmação', qtdPlanejada: 690, produzidoLinha: 3470, produzido: 3470}),
      '26303-02': op('26303/02', {status: 'Aguardando Confirmação', qtdPlanejada: 1200, produzidoLinha: 1362, produzido: 1362})
    },
    pedidos: {'PED-0001__PRF-BIOF-0006': {id: 'PED-0001', sku: 'PRF-BIOF-0006', produto: 'ROSE', cliente: 'BIOFLORA', parentPedidoId: 'PED-0001', qtdTotal: 5500, produzido: 4832}},
    pedidos_comerciais: {}, estoque_lotes: {}, conferencias_pa: {}, nao_conformidades: {}, material_processo: {},
    expedicoes_comerciais: {}, solicitacoes_descarte: {}, devolucoes_cliente: {}, produtos: {}, enderecos_estoque: {}, paradas_historico: {}
  };
}

async function abrir(browser, pagina) {
  const page = await browser.newPage({viewport: {width: 1600, height: 1100}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(({data}) => {
    const db = data;
    window.__db = db;
    window.__iniciado = false;
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const gravar = (p, v) => {
      const ks = partes(p); let o = db;
      ks.slice(0, -1).forEach(k => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
      if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = structuredClone(v);
    };
    let seq = 0;
    const exige = q => { if (!window.__iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (" + q + ')'); };
    window.firebase = {
      initializeApp(cfg) { if (!cfg || !cfg.databaseURL) throw new Error('sem databaseURL'); window.__iniciado = true; },
      auth() {
        exige('auth');
        return {currentUser: {uid: 'u1', email: 'g@kuryos.com'},
          onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'g@kuryos.com', displayName: 'Gustavo'}), 0); },
          signOut() { return Promise.resolve(); }};
      },
      database() {
        exige('database');
        const ref = (path, filtro) => {
          const valor = () => {
            let v = ler(path);
            if (filtro && v && typeof v === 'object') v = Object.fromEntries(Object.entries(v).filter(([k]) => k >= filtro));
            return v === undefined ? null : structuredClone(v);
          };
          const snap = () => { const v = valor(); return {val: () => v, exists: () => v !== null, key: partes(path).pop(), forEach(cb) { Object.entries(v || {}).forEach(([k, x]) => cb({key: k, val: () => x})); }}; };
          return {path, key: partes(path).pop(),
            once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); },
            on(ev, cb) { setTimeout(() => cb(snap()), 0); return cb; },
            off() {}, child(c) { return ref(path + '/' + c); },
            orderByChild() { return this; }, orderByKey() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
            startAt(k) { return ref(path, k); },
            push() { seq++; return ref(path + '/-T' + seq); },
            set(v) { gravar(path, v); return Promise.resolve(); },
            update(obj) { Object.entries(obj).forEach(([k, v]) => gravar(path + '/' + k, v)); return Promise.resolve(); },
            remove() { gravar(path, null); return Promise.resolve(); },
            transaction(fn) { const r = fn(valor()); if (r !== undefined) gravar(path, r); return Promise.resolve({committed: r !== undefined, snapshot: snap()}); }};
        };
        return {ref: (p) => ref(p || '')};
      }
    };
  }, {data: dados()});
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'tr.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file),
      contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://tr.test/' + pagina);
  await page.waitForSelector('.kt-sidebar', {timeout: 8000});
  return {page, errors};
}


(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const {page, errors} = await abrir(browser, 'ops.html');
    await page.waitForFunction(() => /26302\/01/.test(document.getElementById('ops-tbody').innerText), null, {timeout: 8000});
    await page.waitForFunction(() => window.currentUser && window.currentUser.role === 'pcp');
    await page.locator('#ops-tbody tr', {hasText: '26302/01'}).locator('.btn-confirm-op').click();
    await page.waitForFunction(() => window.__db.nao_conformidades && window.__db.nao_conformidades['RNC-SP-26302-01'], null, {timeout: 8000});
    const r = await page.evaluate(() => window.__db.nao_conformidades['RNC-SP-26302-01']);
    assert.equal(r.status, 'ABERTA');
    assert.equal(r.automatica, true);
    assert.equal(r.categoria, 'CONSISTENCIA');
    assert.equal(r.tipoInconsistencia, 'SUPERPRODUCAO');
    assert.equal(r.qtdEnvolvida, 2780);
    assert.equal(r.opLote, '26302/01');
    assert.equal(r.abertaPor, 'Adlai');
    assert.match(r.descricao, /apontado 3\.470 un\. para 690 planejadas \(503%\)/);
    assert.equal(await page.evaluate(() => window.__db.ops['26302-01'].status), 'Concluído', 'confirmar continua permitido (decisão do usuário)');
    await page.waitForFunction(() => /Inconsistência de dados: RNC-SP-26302-01/.test(document.body.innerText), null, {timeout: 5000});

    // 114% é rotina (excedente de granel): confirma sem RNC.
    await page.locator('#ops-tbody tr', {hasText: '26303/02'}).locator('.btn-confirm-op').click();
    await page.waitForFunction(() => window.__db.ops['26303-02'].status === 'Concluído');
    await page.waitForTimeout(400);
    assert.deepEqual(Object.keys(await page.evaluate(() => window.__db.nao_conformidades)), ['RNC-SP-26302-01']);
    assert.deepEqual(errors, []);
    console.log('OK confirmação de OP: 503% do planejado abre RNC-SP na hora; 114% confirma sem RNC.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
