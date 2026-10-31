'use strict';
/* CRM/P&D (React em crm-app.html) dentro do shell do PCP com o menu novo
   (MENU-04, 29/10/2026). O React troca de tela por pushState; o menu precisa
   acompanhar: item ativo, aria-current, bloco aberto, título da barra de cima
   e da aba, nas rotas /crm1, /crm2, /crm3, /pd, /kickoffs, /contratos e nas
   rotas internas (/crm/clients, /kickoff/:id, /pd/formulas...).
   O pacote do React fica de fora (devolvido vazio): o que se testa aqui é a
   ligação crm-app.html -> auth_check.js -> registro de telas -> shell -> ponte. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

async function abrir(browser, rota, viewport) {
  const page = await browser.newPage({viewport: viewport || {width: 1440, height: 900}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    try { localStorage.setItem('kuryos.sidebar.collapsed', '0'); } catch (e) {}
    const db = {usuarios: {adm: {nome: 'Ana Admin', email: 'adm@kuryos.com', role: 'admin'}}};
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const ref = (path) => {
      const snap = () => { const v = ler(path); return {val: () => (v === undefined ? null : v), exists: () => v !== undefined}; };
      return {once(ev, cb) { const s = snap(); if (typeof cb === 'function') cb(s); return Promise.resolve(s); }, on() {}, off() {},
        set() { return Promise.resolve(); }, update() { return Promise.resolve(); }, child(c) { return ref(path + '/' + c); }};
    };
    window.firebase = {apps: [{}], initializeApp() {}, app() { return {}; },
      auth() { return {currentUser: {uid: 'adm', email: 'adm@kuryos.com'}, onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'adm', email: 'adm@kuryos.com'}), 0); return () => {}; }}; },
      database() { return {ref: (p) => ref(p || '')}; }};
    // crm-app.html chama initializeApp de novo: mantém este falso.
    Object.defineProperty(window, 'firebase', {value: window.firebase, writable: false});
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'app.test' || url.pathname.startsWith('/static/crm/')) return route.fulfill({body: '', contentType: 'text/javascript'});
    let file = 'public' + url.pathname;
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = 'public/crm-app.html';
    return route.fulfill({body: fs.readFileSync(file),
      contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
  await page.goto('https://app.test' + rota);
  await page.waitForSelector('.kuryos-enterprise-topbar .kuryos-topbar-title', {state: 'attached', timeout: 10000});
  await page.waitForFunction(() => {
    const esperado = window.KuryosCrmMenu && window.KuryosCrmMenu.linkDaRota(location.pathname);
    const ativo = document.querySelector('#unified-navbar .kt-nav-link.active');
    return esperado ? ativo && ativo.getAttribute('href') === esperado && document.title !== 'CRM e P&D · Kuryos PCP' : true;
  });
  return {page, errors};
}

const estado = (page) => page.evaluate(() => ({
  ativos: [...document.querySelectorAll('#unified-navbar .kt-nav-link.active')].map((a) => a.getAttribute('href')),
  current: [...document.querySelectorAll('#unified-navbar [aria-current="page"]')].map((a) => a.getAttribute('href')),
  aberto: [...document.querySelectorAll('#unified-navbar .kt-nav-group.tem-ativo')].map((g) => g.getAttribute('data-grupo')),
  titulo: document.querySelector('.kuryos-topbar-title').textContent,
  trilha: document.querySelector('.kuryos-breadcrumbs span:last-child').textContent,
  aba: document.title
}));

async function navegar(page, rota) {
  await page.evaluate((r) => { history.pushState(null, '', r); document.getElementById('root').appendChild(document.createElement('div')); }, rota);
  // Sob carga paralela, um timeout fixo de 120 ms podia ler o menu antes do
  // requestAnimationFrame da ponte e acusar CRM 1 na rota do CRM 2.
  await page.waitForFunction(() => {
    const esperado = window.KuryosCrmMenu.linkDaRota(location.pathname);
    const ativo = document.querySelector('#unified-navbar .kt-nav-link.active');
    return esperado ? ativo && ativo.getAttribute('href') === esperado : !ativo;
  });
  return estado(page);
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const esperado = {
      '/crm1': ['crm1', 'CRM 1 · Clientes', 'Comercial'],
      '/crm2': ['crm2', 'CRM 2 · Projetos', 'Comercial'],
      '/crm3': ['crm3', 'CRM 3 · Amostras', 'Comercial'],
      '/pd': ['pd', 'P&D', 'P&D'],
      '/kickoffs': ['kickoffs', 'Kickoffs', 'Comercial'],
      '/contratos': ['contratos', 'Contratos CGI', 'Comercial']
    };
    // Carga direta em cada rota.
    for (const rota of Object.keys(esperado)) {
      const {page, errors} = await abrir(browser, rota);
      const e = await estado(page);
      const [href, titulo, bloco] = esperado[rota];
      assert.deepEqual(e.ativos, [href], rota + ': item ativo');
      assert.deepEqual(e.current, [href], rota + ': aria-current');
      assert.deepEqual(e.aberto, [bloco], rota + ': bloco aberto');
      assert.equal(e.titulo, titulo, rota + ': título da barra');
      assert.equal(e.trilha, bloco, rota + ': trilha');
      assert.equal(e.aba, titulo + ' · Kuryos PCP', rota + ': título da aba');
      assert.deepEqual(errors, [], rota + ': erros');
      await page.close();
    }

    // Navegação dentro do React (pushState), inclusive rotas internas.
    const {page, errors} = await abrir(browser, '/crm/clients');
    let e = await estado(page);
    assert.deepEqual(e.ativos, ['crm1'], 'rota interna /crm/clients é o CRM 1');
    e = await navegar(page, '/crm/projects');
    assert.deepEqual([e.ativos, e.current, e.titulo], [['crm2'], ['crm2'], 'CRM 2 · Projetos']);
    e = await navegar(page, '/kickoff/-Nabc123');
    assert.deepEqual([e.ativos, e.titulo, e.aberto], [['kickoffs'], 'Kickoffs', ['Comercial']], 'um Kickoff aberto marca Kickoffs');
    e = await navegar(page, '/pd/formulas');
    assert.deepEqual([e.ativos, e.titulo, e.aberto, e.trilha], [['pd'], 'P&D', ['P&D'], 'P&D']);
    e = await navegar(page, '/contratos');
    assert.deepEqual([e.ativos, e.current], [['contratos'], ['contratos']]);
    e = await navegar(page, '/crm/orcamentos');
    assert.deepEqual([e.ativos, e.current], [[], []], 'rota sem link no menu não deixa item marcado por engano');
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('#unified-navbar .kt-nav-link.active')?.getAttribute('href') === 'contratos');
    e = await estado(page);
    assert.deepEqual(e.ativos, ['contratos'], 'voltar do navegador acompanha');
    assert.deepEqual(errors, []);
    await page.close();

    // Celular: a gaveta mostra o mesmo item ativo.
    const cel = await abrir(browser, '/crm3', {width: 390, height: 844});
    await cel.page.click('#kt-hamburger');
    assert.equal(await cel.page.locator('#unified-navbar .kt-nav-link.active').isVisible(), true);
    assert.equal(await cel.page.locator('#unified-navbar .kt-nav-link.active').innerText(), 'CRM 3 · Amostras');
    assert.deepEqual(cel.errors, []);
    console.log('OK CRM no shell: item ativo, aria-current, bloco aberto e títulos certos em /crm1, /crm2, /crm3, /pd, /kickoffs, /contratos, nas rotas internas, no pushState e no voltar; gaveta no celular.');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
