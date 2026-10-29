'use strict';
/* Tela Início (MENU-03, porte do Gustavo): o que espera pela pessoa (cartões) e
   as áreas dela (atalhos), a partir do mesmo registro do menu
   (shared/navegacao.js). Firebase simulado; registra quais nós a tela ouve
   para provar que quem não vê um cartão não lê os dados dele. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const dados = () => ({
  usuarios: {
    log: {nome: 'Lia Logística', email: 'l@k.com', role: 'logistica'},
    qua: {nome: 'Quito Qualidade', email: 'q@k.com', role: 'qualidade'},
    rot: {nome: 'Rafa Rótulos', email: 'r@k.com', role: 'rotulagem'},
    com: {nome: 'Cida Comercial', email: 'c@k.com', role: 'comercial'}
  },
  agendamentos_expedicao: {a1: {status: 'AGENDADA'}, a2: {status: 'AGENDADA'}, a3: {status: 'EXPEDIDO_PARCIAL'}},
  nao_conformidades: {n1: {status: 'ABERTA'}},
  pedidos_compra: {p1: {status: 'ENVIADO', dataPrevistaEntrega: '2000-01-01'}},
  ops: {'9-1': {status: 'Concluído', lote: '9/01', produto: 'Z', qtdPlanejada: 10, produzidoLinha: 10}}
});

async function abrir(browser, uid, viewport, tema) {
  const ctx = await browser.newContext({viewport: viewport || {width: 1400, height: 1000}, colorScheme: tema || 'light'});
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(({d, uid, tema}) => {
    try { localStorage.setItem('kuryos-theme', tema || 'light'); localStorage.setItem('kuryos.sidebar.collapsed', '0'); } catch (e) {}
    window.__lidos = [];
    const ler = (p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), d);
    const email = d.usuarios[uid].email;
    window.firebase = {initializeApp() {}, app() { return {}; },
      auth() { return {currentUser: {uid, email}, onAuthStateChanged(cb) { setTimeout(() => cb({uid, email}), 0); return () => {}; }, signOut() { return Promise.resolve(); }}; },
      database() {
        const ref = (p) => {
          const snap = () => { const v = ler(p); return {val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))), exists: () => v !== undefined, forEach() {}}; };
          return {once(ev, cb) { const s = snap(); if (typeof cb === 'function') cb(s); return Promise.resolve(s); },
            on(ev, cb) { window.__lidos.push(p); setTimeout(() => cb(snap()), 0); return cb; }, off() {}, child(c) { return ref(p + '/' + c); },
            set() { return Promise.resolve(); }, update() { return Promise.resolve(); }, push() { return Promise.resolve(); }, transaction() { return Promise.resolve({}); }};
        };
        return {ref: (p) => ref(p || '')};
      }};
  }, {d: dados(), uid, tema});
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'app.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
  await page.goto('https://app.test/inicio.html');
  await page.waitForSelector('#unified-navbar');
  await page.waitForSelector('#areas .area, #areas .vazio');
  return {ctx, page, erros};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    // Logística: cartões das cargas, áreas Armazém e Expedição, nada de PCP; Início ativo no menu.
    let {ctx, page, erros} = await abrir(browser, 'log');
    await page.waitForSelector('#pend .cartao');
    assert.match(await page.locator('#ola').innerText(), /^(Bom dia|Boa tarde|Boa noite), Lia$/);
    assert.equal(await page.locator('#chipPapel').innerText(), 'LOGÍSTICA');
    const cart = await page.locator('#pend .cartao').allInnerTexts();
    assert.equal(cart.length, 2, cart.join(' | '));
    assert.match(cart.join('|'), /2\s+Cargas a faturar/); assert.match(cart.join('|'), /1\s+Cargas para carregar/);
    assert.equal(await page.locator('#pend .cartao').first().getAttribute('href'), 'faturamento');
    assert.match(await page.locator('#resumo').innerText(), /3\s+itens esperam por você/);
    const areas = await page.locator('#areas .area h3').allInnerTexts();
    assert.ok(areas.includes('Armazém') && areas.includes('Expedição') && !areas.includes('PCP') && !areas.includes('Compras'), areas.join(','));
    assert.equal(await page.locator('#areas a[href="estoque?tab=posicoes"]').count(), 1, 'atalho com URL limpa e a aba');
    assert.deepEqual(await page.$$eval('#unified-navbar .kt-nav-top .kt-nav-link.active', (as) => as.map((a) => a.getAttribute('href') + '|' + a.getAttribute('aria-current'))), ['inicio|page'], 'Início marcado no topo do menu');
    let lidos = await page.evaluate(() => [...new Set(window.__lidos)].sort());
    assert.deepEqual(lidos, ['agendamentos_expedicao', 'devolucoes_cliente', 'ops', 'solicitacoes_descarte'], 'logística lê só o que os seus cartões usam: ' + lidos);
    // Celular: sem rolagem horizontal e alvos de toque de 44 px.
    await page.setViewportSize({width: 390, height: 844});
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'sem rolagem horizontal no celular');
    const alt = await page.$$eval('#areas a, #pend .cartao', (els) => els.map((x) => x.getBoundingClientRect().height));
    assert.ok(alt.every((h) => h >= 44), 'alvos de toque >= 44 px: ' + alt.filter((h) => h < 44));
    assert.deepEqual(erros, []);
    await ctx.close();

    // Qualidade: só a RNC; não lê ops, cargas nem compras.
    ({ctx, page, erros} = await abrir(browser, 'qua', null, 'dark'));
    await page.waitForSelector('#pend .cartao');
    const q = await page.locator('#pend .cartao').allInnerTexts();
    assert.equal(q.length, 1);
    assert.match(q[0], /1\s+Não conformidades abertas/);
    assert.equal(await page.locator('#pend .cartao').first().getAttribute('href'), 'qualidade?tab=rnc');
    lidos = await page.evaluate(() => [...new Set(window.__lidos)].sort());
    assert.deepEqual(lidos, ['nao_conformidades'], 'quem não vê o cartão não lê os dados dele: ' + lidos);
    assert.deepEqual(erros, []);
    await ctx.close();

    // Rotulagem: tem o cartão da fila, mas nada na fila: "Tudo em dia".
    ({ctx, page, erros} = await abrir(browser, 'rot'));
    await page.waitForFunction(() => /Tudo em dia/.test(document.querySelector('#resumo').innerText));
    assert.match(await page.locator('#pend').innerText(), /Nada esperando por você/);
    assert.ok((await page.locator('#areas .area h3').allInnerTexts()).includes('Operação'));
    assert.deepEqual(erros, []);
    await ctx.close();

    // Comercial: nenhum cartão aqui -> seção e resumo escondidos, nenhum nó lido; áreas do CRM.
    ({ctx, page, erros} = await abrir(browser, 'com'));
    assert.equal(await page.locator('#secPend').isVisible(), false);
    assert.equal(await page.locator('#resumo').isVisible(), false);
    lidos = await page.evaluate(() => [...new Set(window.__lidos)]);
    assert.deepEqual(lidos, [], 'sem cartão, sem leitura');
    const areasCom = await page.locator('#areas .area h3').allInnerTexts();
    assert.deepEqual(areasCom, ['Comercial', 'P&D', 'Ajuda']);
    assert.ok((await page.locator('#areas').innerText()).includes('CRM 1 · Clientes'));
    assert.deepEqual(erros, []);
    await ctx.close();
  } finally { await browser.close(); }
  console.log('OK Início: cartões por perfil (cargas, RNC, filas), leitura só das fontes dos cartões visíveis, áreas do registro, Início ativo no menu, celular sem rolagem e com toque de 44 px.');
})().catch((e) => { console.error(e); process.exit(1); });
