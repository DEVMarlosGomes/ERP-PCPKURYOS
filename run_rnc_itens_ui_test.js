'use strict';
/* Formulário de nova RNC (qualidade.html, 10/11/2026): o item se busca por
   código, SKU, nome, EAN ou cliente; o fornecedor aparece pelo nome (não pela
   chave) e o do cadastro do material já vem sugerido; a RNC grava código,
   nome, cliente e fornecedor do cadastro. Firebase simulado (mesmo harness de
   run_filtro_qualidade_ui_test.js). */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function dados() {
  return {
    usuarios: {u1: {nome: 'Ana Qualidade', email: 'q@kuryos.com', role: 'qualidade'}},
    fornecedores: {
      '-P-uGz4b0g5iycZj9j0_': {nomeFantasia: 'COLORMIX', razaoSocial: 'COLORMIX INDUSTRIA LTDA', ativo: true},
      '-P-uHFokL0wJsZZkBciM': {razaoSocial: 'TC QUIMICA LTDA', ativo: true},
      '-P-uHVs309gbcihQ7Na2': {nomeFantasia: 'VIDROS SUL', ativo: true}
    },
    produtos: {AMABBS01: {sku: 'AMABBS01', descricao: 'BODY MIST TESOURO DO OASIS 250ML', cliente: 'AMEERATI', clienteKey: 'AMEE', ativo: 'Ativo'}},
    materiais: {
      'EP-00001': {mpCodigo: 'EP-00001', mpNome: 'VALVULA SPRAY R.24/410 PRETA', tipo: 'EP', ativo: true,
        fornecedores: {'-P-uGz4b0g5iycZj9j0_': {nomeComercial: 'VÁLVULA BRUMA MATTE'}}}
    },
    estoque_lotes: {'EP-00001': {L1: {itemTipo: 'material', itemCodigo: 'EP-00001', status: 'QUARENTENA', saldoLote: 500, unidade: 'un',
      loteOrigem: 'F-123', criadoEm: '2026-11-01T10:00:00.000Z'}}},
    nao_conformidades: {}
  };
}
async function abrir(browser, caminho) {
  const page = await browser.newPage({viewport: {width: 1600, height: 1100}});
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript((inicial) => {
    const db = JSON.parse(JSON.stringify(inicial));
    window.__db = db; window.__iniciado = false;
    const exige = (q) => { if (!window.__iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (" + q + ')'); };
    const get = (p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const set = (p, v) => {
      const ks = p.split('/').filter(Boolean); let o = db;
      ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
      if (v == null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
    };
    const ouvintes = [];
    const avisa = () => ouvintes.forEach((o) => setTimeout(() => o.cb({val: () => { const v = get(o.p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, exists: () => get(o.p) !== undefined}), 0));
    window.firebase = {
      initializeApp() { window.__iniciado = true; },
      auth() { exige('auth'); return {currentUser: {uid: 'u1', email: 'q@kuryos.com', displayName: 'Ana Qualidade'},
        onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'q@kuryos.com', displayName: 'Ana Qualidade'}), 0); }, signOut() { return Promise.resolve(); }}; },
      storage() { return {ref() { return {put: () => Promise.resolve(), getDownloadURL: () => Promise.resolve('')}; }}; },
      database() {
        exige('database');
        return {ref(p) {
          p = p || '';
          const snap = () => ({val: () => { const v = p ? get(p) : db; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, exists: () => get(p) !== undefined, forEach() {}});
          return {path: p,
            once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); },
            on(ev, cb) { ouvintes.push({p, cb}); setTimeout(() => cb(snap()), 0); return cb; }, off() {}, child() { return this; },
            orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
            set(v) { set(p, v); avisa(); return Promise.resolve(); },
            update(u) { Object.keys(u).forEach((k) => set((p ? p + '/' : '') + k, u[k])); avisa(); return Promise.resolve(); },
            remove() { set(p, null); avisa(); return Promise.resolve(); },
            push() { return Object.assign(Promise.resolve(), {key: 'k1'}); },
            transaction(fn) { const r = fn(get(p) === undefined ? null : JSON.parse(JSON.stringify(get(p)))); if (r !== undefined) { set(p, r); avisa(); }
              return Promise.resolve({committed: r !== undefined, snapshot: snap()}); }};
        }};
      }
    };
  }, dados());
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'q.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://q.test/' + caminho);
  return {page, erros};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const {page, erros} = await abrir(browser, 'qualidade.html?tab=rnc');
    await page.waitForFunction(() => document.querySelectorAll('#rncFornecedor option').length > 3, null, {timeout: 8000});
    await page.click('#btnNovaRnc');

    // Fornecedores pelo nome, nunca pela chave interna.
    const nomes = await page.locator('#rncFornecedor option').allInnerTexts();
    assert.deepEqual(nomes, ['— não se aplica —', 'COLORMIX', 'TC QUIMICA LTDA', 'VIDROS SUL']);

    // Produto por palavras do nome: lista, escolha com o teclado.
    await page.fill('#rncItemCodigo', 'tesouro oasis');
    await page.waitForSelector('#rncItemSug:not([hidden]) button');
    assert.match(await page.locator('#rncItemSug').innerText(), /AMABBS01[\s\S]*AMEERATI/);
    await page.press('#rncItemCodigo', 'ArrowDown');
    await page.press('#rncItemCodigo', 'Enter');
    assert.equal(await page.inputValue('#rncItemCodigo'), 'AMABBS01 — BODY MIST TESOURO DO OASIS 250ML');
    assert.match(await page.locator('#rncItemHint').innerText(), /Produto AMABBS01.*AMEERATI/);
    assert.equal(await page.locator('#rncItemSug').isHidden(), true);

    // Material pelo código em minúsculas, escolha com o mouse: lote e fornecedor do cadastro.
    await page.fill('#rncItemCodigo', 'ep-0000');
    await page.waitForSelector('#rncItemSug button');
    await page.click('#rncItemSug button >> nth=0');
    assert.match(await page.locator('#rncItemHint').innerText(), /Material EP-00001/);
    assert.match(await page.locator('#rncLote').innerText(), /F-123/);
    assert.equal(await page.inputValue('#rncFornecedor'), '-P-uGz4b0g5iycZj9j0_', 'único fornecedor do material vem marcado');
    assert.deepEqual(await page.locator('#rncFornecedor optgroup').evaluateAll((g) => g.map((x) => x.label)), ['Fornecedores deste item', 'Todos os fornecedores']);

    // Abre a RNC: grava código, nome e fornecedor legíveis.
    await page.selectOption('#rncLote', 'L1');
    await page.fill('#rncDescricao', 'Válvula sem mola');
    await page.click('#rncBtnSalvar');
    await page.waitForFunction(() => Object.keys(window.__db.nao_conformidades || {}).length === 1, null, {timeout: 8000});
    const r = await page.evaluate(() => Object.values(window.__db.nao_conformidades)[0]);
    assert.equal(r.itemCodigo, 'EP-00001');
    assert.equal(r.itemNome, 'VALVULA SPRAY R.24/410 PRETA');
    assert.equal(r.itemTipo, 'material');
    assert.equal(r.loteKey, 'L1');
    assert.equal(r.fornecedorKey, '-P-uGz4b0g5iycZj9j0_');
    assert.equal(r.fornecedorNome, 'COLORMIX');

    // Produto sem lote: cliente vem do cadastro do SKU.
    await page.click('#btnNovaRnc');
    assert.equal(await page.inputValue('#rncItemCodigo'), '');
    assert.equal(await page.inputValue('#rncFornecedor'), '', 'formulário novo começa sem fornecedor');
    await page.fill('#rncItemCodigo', 'AMABBS01');
    await page.press('#rncItemCodigo', 'Enter');
    await page.selectOption('#rncFornecedor', '-P-uHFokL0wJsZZkBciM');
    await page.fill('#rncDescricao', 'Vazamento no cliente');
    await page.click('#rncBtnSalvar');
    await page.waitForFunction(() => Object.keys(window.__db.nao_conformidades || {}).length === 2, null, {timeout: 8000});
    const r2 = await page.evaluate(() => Object.values(window.__db.nao_conformidades).find((x) => x.itemCodigo === 'AMABBS01'));
    assert.deepEqual([r2.itemTipo, r2.itemNome, r2.cliente, r2.fornecedorNome], ['produto', 'BODY MIST TESOURO DO OASIS 250ML', 'AMEERATI', 'TC QUIMICA LTDA']);

    // Texto que não é item avisa; nada no cadastro mostra a mensagem.
    await page.click('#btnNovaRnc');
    await page.fill('#rncItemCodigo', 'xyzw');
    await page.waitForSelector('#rncItemSug .sug-vazio');
    assert.match(await page.locator('#rncItemHint').innerText(), /Escolha um item da lista/);
    await page.press('#rncItemCodigo', 'Escape');
    assert.equal(await page.locator('#rncItemSug').isHidden(), true);
    assert.equal(await page.locator('#modalRncBg.open').count(), 1, 'Esc fecha só a lista, não o formulário');
    if (process.env.RNC_SHOT) {
      await page.fill('#rncItemCodigo', 'body');
      await page.screenshot({path: process.env.RNC_SHOT});
    }
    assert.deepEqual(erros, [], 'sem erro de página: ' + erros.join(' | '));
  } finally { await browser.close(); }
  console.log('OK RNC: busca de item (SKU, nome, cliente, código), fornecedores pelo nome e sugeridos pelo material, gravação legível.');
})().catch((e) => { console.error(e); process.exit(1); });
