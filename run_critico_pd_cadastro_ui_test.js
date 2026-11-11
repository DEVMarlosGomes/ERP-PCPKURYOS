'use strict';
/* UI (manipulação em lote, D-02/A2): a marca "Crítico no P&D" (materiais/{key}/criticoPd) só o ADM
   muda. O Cadastros regrava o material inteiro ao salvar; quem não é ADM leva a marca gravada
   (sem isso a edição de um PCP apagava a marca — e a regra do banco recusaria a gravação).
   Tela real de Cadastros com Firebase simulado (harness de run_duplicidade_material_ui_test.js). */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function dados(role) {
  return {
    usuarios: {u1: {nome: role === 'admin' ? 'Gustavo' : 'Planejador', email: 'g@kuryos.com', role}},
    clientes: {}, fornecedores: {}, solicitacoes_cadastro_material: {},
    materiais: {
      'MPGR-00001': {mpCodigo: 'MPGR-00001', mpNome: 'FENOXIETANOL', tipo: 'MPGR', unidade: 'kg', ativo: true, chaveDuplicidade: 'FENOXIETANOL', criticoPd: true},
      'MPGR-00002': {mpCodigo: 'MPGR-00002', mpNome: 'GLICERINA', tipo: 'MPGR', unidade: 'kg', ativo: true, chaveDuplicidade: 'GLICERINA'},
    },
    materiais_chave: {FENOXIETANOL: 'MPGR-00001', GLICERINA: 'MPGR-00002'},
    produtos: {}, formulas: {}, bom: {}, especificacoes: {}, categorias: {}, config: {}, estoque: {}
  };
}

async function abrir(browser, estadoInicial, pagina) {
  const page = await browser.newPage({viewport: {width: 1500, height: 1100}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript((data) => {
    const db = data;
    window.__db = db;
    let iniciado = false;
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const ouvintes = [];
    const notificar = (bruto) => {
      const p = partes(bruto).join('/');
      ouvintes.forEach((o) => {
        const alvo = partes(o.path).join('/');
        if (!alvo || p === alvo || p.indexOf(alvo + '/') === 0 || alvo.indexOf(p + '/') === 0) o.avisar();
      });
    };
    const gravar = (p, v) => {
      const ks = partes(p); let o = db;
      ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
      if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = structuredClone(v);
      notificar(p);
    };
    let seq = 0;
    window.firebase = {
      initializeApp(cfg) { if (!cfg || !cfg.databaseURL) throw new Error('sem databaseURL'); iniciado = true; },
      auth() {
        if (!iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (auth)");
        return {currentUser: {uid: 'u1', email: 'g@kuryos.com'},
          onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'g@kuryos.com', displayName: 'Gustavo'}), 0); },
          signOut() { return Promise.resolve(); }};
      },
      database() {
        if (!iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (database)");
        const ref = (path) => {
          const valor = () => { const v = ler(path); return v === undefined ? null : structuredClone(v); };
          const snap = () => { const v = valor(); return {val: () => v, exists: () => v !== null, key: partes(path).pop(),
            forEach(cb) { Object.entries(v || {}).forEach(([k, x]) => cb({key: k, val: () => x})); }}; };
          return {path, key: partes(path).pop(),
            once(ev, cb) { const sn = snap(); if (cb) cb(sn); return Promise.resolve(sn); },
            on(ev, cb) { const avisar = () => cb(snap()); ouvintes.push({path, avisar}); setTimeout(avisar, 0); return cb; },
            off() {}, child(c) { return ref(path + '/' + c); },
            orderByChild() { return this; }, orderByKey() { return this; }, equalTo() { return this; }, limitToLast() { return this; }, startAt() { return this; },
            push(v) {
              seq++;
              const filho = ref(path + '/-N' + seq);
              if (v === undefined) return filho;
              gravar(filho.path, v);
              const pr = Promise.resolve(filho); pr.key = filho.key; return pr;
            },
            set(v) { gravar(path, v); return Promise.resolve(); },
            update(obj) { Object.entries(obj).forEach(([k, v]) => gravar(path + '/' + k, v)); return Promise.resolve(); },
            remove() { gravar(path, null); return Promise.resolve(); },
            transaction(fn) { const r = fn(valor()); if (r !== undefined) gravar(path, r); return Promise.resolve({committed: r !== undefined, snapshot: snap()}); }};
        };
        return {ref: (p) => ref(p || '')};
      }
    };
  }, estadoInicial || dados());
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'cad.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file),
      contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://cad.test/' + (pagina || 'cadastros.html?tab=clientes'));
  try {
    await page.waitForFunction(() => window.currentUser && window.currentUser.nome, null, {timeout: 12000});
  } catch (e) {
    console.log('DBG url', page.url(), 'erros', errors, await page.evaluate(() => [document.title, typeof window.currentUser, document.body.innerText.slice(0, 200)]));
    throw e;
  }
  return {page, errors};
}

async function salvarMaterial(page, key, mexer) {
  await page.click(`.btn-edit-mat[data-key="${key}"]`);
  await page.waitForSelector('#modalBg-mat.open, #modalBg-mat.show, #modalBg-mat[style*="flex"], #modalBg-mat[style*="block"]', {timeout: 8000}).catch(() => {});
  await page.waitForFunction(() => document.getElementById('modalTitle-mat').textContent === 'Editar Material');
  const antes = {marcado: await page.isChecked('#fCriticoPd-mat'), travado: await page.isDisabled('#fCriticoPd-mat')};
  if (mexer) await mexer(page);
  await page.evaluate(() => { window.__salvou = false; });
  // Desde 10/11/2026 editar exige justificativa quando algo muda (histórico do cadastro vivo).
  await page.fill('#hcJust-mat', 'Ajuste de teste da marca de crítico');
  await page.click('#modalSaveBtn-mat');
  await page.waitForFunction(() => /Material salvo/.test(document.getElementById('alertBox').innerText));
  await page.evaluate(() => { document.getElementById('alertBox').innerText = ''; });
  return {antes, gravado: await page.evaluate((k) => window.__db.materiais[k], key)};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    // PCP: a caixa aparece travada; salvar mantém a marca; forçar a caixa pelo DOM não muda nada.
    let {page, errors} = await abrir(browser, dados('pcp'), 'cadastros.html?tab=materiais');
    await page.waitForSelector('.btn-edit-mat[data-key="MPGR-00001"]');
    let r = await salvarMaterial(page, 'MPGR-00001', (p) => p.fill('#fMarcaModelo-mat', 'Lote 2026'));
    assert.deepEqual(r.antes, {marcado: true, travado: true});
    assert.equal(r.gravado.criticoPd, true, 'edição do PCP apagou a marca');
    assert.equal(r.gravado.marcaModelo, 'LOTE 2026'); // o Cadastros grava em maiúsculas
    r = await salvarMaterial(page, 'MPGR-00002', (p) => p.evaluate(() => { const c = document.getElementById('fCriticoPd-mat'); c.disabled = false; c.checked = true; }));
    assert.deepEqual(r.antes, {marcado: false, travado: true});
    assert.equal(r.gravado.criticoPd, undefined, 'PCP marcou crítico');
    r = await salvarMaterial(page, 'MPGR-00001', (p) => p.evaluate(() => { const c = document.getElementById('fCriticoPd-mat'); c.disabled = false; c.checked = false; }));
    assert.equal(r.gravado.criticoPd, true, 'PCP desmarcou crítico');
    assert.deepEqual(errors, [], 'erros na tela (PCP): ' + errors.join(' | '));
    await page.close();

    // ADM: marca e desmarca.
    ({page, errors} = await abrir(browser, dados('admin'), 'cadastros.html?tab=materiais'));
    await page.waitForSelector('.btn-edit-mat[data-key="MPGR-00002"]');
    r = await salvarMaterial(page, 'MPGR-00002', (p) => p.check('#fCriticoPd-mat'));
    assert.deepEqual(r.antes, {marcado: false, travado: false});
    assert.equal(r.gravado.criticoPd, true);
    r = await salvarMaterial(page, 'MPGR-00001', (p) => p.uncheck('#fCriticoPd-mat'));
    assert.equal(r.gravado.criticoPd, undefined);
    assert.deepEqual(errors, [], 'erros na tela (ADM): ' + errors.join(' | '));
    console.log('run_critico_pd_cadastro_ui_test: OK (PCP preserva e não muda a marca; ADM marca e desmarca)');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
