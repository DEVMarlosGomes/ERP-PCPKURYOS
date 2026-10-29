'use strict';
/* Menu lateral em sanfona (29/09): "os menus ficaram muito grandes;
   condensados e abrir caso a caso", e o sistema é muito usado no celular.
   - PCP (menu grande): só o bloco da tela atual aberto; os outros fechados com
     o número de links; abrir um fecha o anterior; a escolha é lembrada;
   - quem tem menu curto vê tudo aberto, sem sanfona;
   - celular: gaveta, alvos de toque de 44 px, sem rolagem horizontal. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function dados() {
  return {
    usuarios: {
      pcp: {nome: 'Carla PCP', email: 'pcp@kuryos.com', role: 'pcp'},
      rot: {nome: 'Rafa Rótulos', email: 'rot@kuryos.com', role: 'gestor', modulos: {rotulagem: true}},
      log: {nome: 'Lia Logística', email: 'log@kuryos.com', role: 'logistica'}
    },
    config: {
      linhas: ['Linha 1', 'Linha 2'], rotulagem: ['Rotuladora 1'],
      turnos: ['A'], turnoHorarios: {A: '07:00'}, turnoHorariosFim: {A: '17:00'},
      turnoPausas: {A: {inicio: '12:00', fim: '13:00'}},
      planejamento: {diasSemana: [1, 2, 3, 4, 5], feriados: {}}
    },
    produtos: {
      p1: {sku: 'BS01', descricao: 'BODY SPLASH 200ML', prodHoraRef: 500},
      p2: {sku: 'CR02', descricao: 'CREME 100G', prodHoraRef: 250}
    },
    ops: {
      '26300-01': {lote: '26300/01', sku: 'BS01', produto: 'BODY SPLASH 200ML', cliente: 'MISS RÔSE', status: 'Programado',
        qtdPlanejada: 1000, dataEmissao: '2026-09-20', linha: 'Linha 1', formulaVersao: 'F1__v1',
        materiaisConsumo: {a: {origem: 'bom', mpCodigo: 'ES-1', mpNome: 'ROTULO BS 200ML'}, b: {origem: 'bom', mpCodigo: 'EP-1', mpNome: 'FRASCO 200ML'}}},
      '26300-02': {lote: '26300/02', sku: 'CR02', produto: 'CREME 100G', cliente: 'TAWUS', status: 'Programado',
        qtdPlanejada: 500, dataEmissao: '2026-09-21', linha: 'Linha 1', separacaoConcluida: true,
        materiaisConsumo: {a: {origem: 'bom', mpCodigo: 'EP-2', mpNome: 'POTE 100G'}}},
      '26300-03': {lote: '26300/03', sku: 'BS01', produto: 'BODY SPLASH 200ML', cliente: 'MISS RÔSE', status: 'Em Produção',
        qtdPlanejada: 2000, produzidoLinha: 1500, abertaDesde: '2026-09-29T07:00:00', abertaLinha: 'Linha 1', separacaoConcluida: true, skuPedidoKey: 'PED5__BS01',
        produzidoRotulagem: 1400, abertaDesdeRot: '2026-09-29T07:10:00', abertaRotulagem: 'Rotuladora 1',
        materiaisConsumo: {a: {origem: 'bom', mpCodigo: 'ES-1', mpNome: 'ROTULO BS 200ML'}}},
      '26300-04': {lote: '26300/04', sku: 'CR02', produto: 'CREME 100G', cliente: 'TAWUS', status: 'Programado',
        qtdPlanejada: 500, dataEmissao: '2026-09-28', skuPedidoKey: 'PED7__CR02', separacaoConcluida: true},
      '26300-09': {lote: '26300/09', sku: 'BS01', status: 'Concluído', qtdPlanejada: 10}
    },
    // Pedido da 26300/03: faltam 500 e a grade não reserva mais nada.
    pedidos: {'PED5__BS01': {id: 'PED5', produto: 'BODY SPLASH 200ML', sku: 'BS01', qtdTotal: 2000, produzido: 1500, mediaPorHora: 500}},
    // Grade de Quantidades: PED7 planejado na Linha 2 às 13h-15h; o pedido da
    // 26300/03 (rodando) estava planejado para acabar às 08:00.
    programacao: {
      '2026-09-29': {
        '07_00': {env1: {pedidoKey: 'PED5__BS01', mediaPorHora: 500}},
        '13_00': {env2: {pedidoKey: 'PED7__CR02', mediaPorHora: 250}},
        '14_00': {env2: {pedidoKey: 'PED7__CR02', mediaPorHora: 250}}
      }
    }
  };
}

async function abrir(browser, uid, pagina, viewport) {
  const page = await browser.newPage({viewport: viewport || {width: 1400, height: 1000}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.clock.install({time: new Date('2026-09-29T08:00:00')});
  await page.addInitScript(({data, uid}) => {
    const db = data;
    window.__db = db;
    // Menu fixado aberto (280 px): a sanfona é do menu aberto; o trilho de 76 px só mostra os ícones.
    try { localStorage.setItem('kuryos.sidebar.collapsed', '0'); } catch (e) {}
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const ouvintes = [];
    const avisar = () => setTimeout(() => ouvintes.forEach((o) => o()), 0);
    const gravar = (p, v) => {
      const ks = partes(p); let o = db;
      ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
      if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = structuredClone(v);
    };
    window.__updates = [];
    const exige = () => { if (!window.__iniciado) throw new Error("No Firebase App '[DEFAULT]'"); };
    const email = db.usuarios[uid].email;
    window.firebase = {
      initializeApp() { window.__iniciado = true; },
      auth() {
        exige();
        return {currentUser: {uid, email}, onAuthStateChanged(cb) { setTimeout(() => cb({uid, email}), 0); }, signOut() { return Promise.resolve(); }};
      },
      database() {
        exige();
        const ref = (path) => {
          const valor = () => { const v = ler(path); return v === undefined ? null : structuredClone(v); };
          const snap = () => { const v = valor(); return {val: () => v, exists: () => v !== null, key: partes(path).pop(),
            forEach(cb) { Object.entries(v || {}).forEach(([k, x]) => cb({key: k, val: () => x})); }}; };
          return {path, key: partes(path).pop(),
            once(ev, cb) { const sn = snap(); if (cb) cb(sn); return Promise.resolve(sn); },
            on(ev, cb) { const f = () => cb(snap()); ouvintes.push(f); setTimeout(f, 0); return cb; },
            off() {}, child(c) { return ref(path + '/' + c); },
            orderByChild() { return this; }, orderByKey() { return this; }, equalTo() { return this; }, limitToLast() { return this; }, startAt() { return this; }, endAt() { return this; },
            push(v) { const k = '-Q' + Math.random().toString(36).slice(2); if (v !== undefined) { gravar(path + '/' + k, v); avisar(); } const r = ref(path + '/' + k); const pr = Promise.resolve(r); pr.key = k; return v === undefined ? r : pr; },
            set(v) { gravar(path, v); avisar(); return Promise.resolve(); },
            update(obj) { window.__updates.push(obj); Object.entries(obj).forEach(([k, v]) => gravar(path + '/' + k, v)); avisar(); return Promise.resolve(); },
            remove() { gravar(path, null); avisar(); return Promise.resolve(); },
            transaction(fn) { const r = fn(valor()); if (r !== undefined) { gravar(path, r); avisar(); } return Promise.resolve({committed: r !== undefined, snapshot: snap()}); }};
        };
        return {ref: (p) => ref(p || '')};
      }
    };
  }, {data: dados(), uid});
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'app.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file),
      contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
  await page.goto('https://app.test/' + pagina);
  await page.waitForFunction(() => window.currentUser && window.currentUser.role, null, {timeout: 8000});
  return {page, errors};
}


const estado = (page) => page.$$eval('.kt-nav-group', (gs) => gs.map((g) => [g.getAttribute('data-grupo'), !g.classList.contains('fechado')]));

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    // ── PCP no computador ──
    let {page, errors} = await abrir(browser, 'pcp', 'proximas_ordens.html?setor=envase');
    await page.waitForSelector('.kt-nav-group');
    let e = await estado(page);
    const abertos = e.filter(([, a]) => a).map(([n]) => n);
    const fixos = await page.$$eval('.kt-nav-group.fixo', (gs) => gs.map((g) => g.getAttribute('data-grupo')));
    assert.ok(fixos.length >= 1, 'bloco de um link só fica sempre aberto');
    assert.deepEqual(abertos.filter((n) => fixos.indexOf(n) < 0), ['Operação'], 'fora os de um link, só o bloco da tela atual aberto');
    assert.ok(e.length >= 6, 'PCP tem vários blocos');
    const capQualidade = page.locator('.kt-nav-group[data-grupo="Qualidade"] .kt-nav-cap');
    assert.match(await capQualidade.innerText(), /QUALIDADE\s*\d+/i, 'fechado mostra quantos links tem');
    assert.equal(await page.locator('.kt-nav-group[data-grupo="Qualidade"] .kt-nav-link').first().isVisible(), false);
    assert.equal(await capQualidade.getAttribute('aria-expanded'), 'false');
    // Abrir Qualidade; depois Armazém fecha a Qualidade (a da tela atual segue aberta).
    await capQualidade.click();
    assert.equal(await page.locator('.kt-nav-group[data-grupo="Qualidade"] .kt-nav-link').first().isVisible(), true);
    await page.locator('.kt-nav-group[data-grupo="Armazém"] .kt-nav-cap').click();
    e = await estado(page);
    assert.deepEqual(e.filter(([n, a]) => a && fixos.indexOf(n) < 0).map(([n]) => n).sort(), ['Armazém', 'Operação']);
    // O bloco da tela atual não fecha.
    await page.locator('.kt-nav-group[data-grupo="Operação"] .kt-nav-cap').click();
    assert.equal(await page.locator('.kt-nav-group[data-grupo="Operação"]').evaluate((g) => g.classList.contains('fechado')), false);
    // Lembrado na volta.
    await page.reload();
    await page.waitForSelector('.kt-nav-group');
    e = await estado(page);
    assert.deepEqual(e.filter(([n, a]) => a && fixos.indexOf(n) < 0).map(([n]) => n).sort(), ['Armazém', 'Operação'], 'lembra o último aberto');
    // Identidade (MENU-02): marca em cartão com o nome do sistema, cor por bloco,
    // subtítulos em caixa alta, trilho na cor do bloco, um único item ativo.
    assert.equal((await page.locator('.kt-brand-sub').innerText()).toUpperCase(), 'SISTEMA DE PRODUÇÃO');
    const vis = await page.evaluate(() => {
      const g = document.querySelector('.kt-nav-group[data-grupo="Armazém"]');
      const sub = g.querySelector('.kt-nav-sub');
      return {tom: g.getAttribute('data-tom'), subs: [...g.querySelectorAll('.kt-nav-sub')].map((s) => s.textContent),
        caixa: getComputedStyle(sub).textTransform, trilho: getComputedStyle(g.querySelector('.kt-nav-body')).borderLeftStyle,
        brandBg: getComputedStyle(document.querySelector('.kt-brand')).backgroundImage,
        ativos: [...document.querySelectorAll('.kt-nav-link.active')].map((a) => a.getAttribute('href') + '|' + a.getAttribute('aria-current')),
        tons: [...document.querySelectorAll('.kt-nav-group')].map((x) => x.getAttribute('data-grupo') + ':' + x.getAttribute('data-tom'))};
    });
    assert.equal(vis.tom, 's3', 'Armazém no verde do chão de fábrica');
    assert.deepEqual(vis.subs, ['Estoque', 'Fluxo']);
    assert.equal(vis.caixa, 'uppercase');
    assert.equal(vis.trilho, 'solid', 'trilho vertical no bloco aberto');
    assert.match(vis.brandBg, /gradient/, 'marca em cartão azul-marinho');
    assert.deepEqual(vis.ativos, ['proximas_ordens?setor=envase|page'], 'um item ativo, com aria-current');
    assert.ok(vis.tons.includes('Ajuda:neutro') && vis.tons.includes('Compras:s2') && vis.tons.includes('PCP:s1'), vis.tons.join(' '));
    // Ctrl/Cmd+K continua abrindo a busca de telas, com os links do menu novo.
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.kuryos-command-search:not([hidden]) .kuryos-search-result');
    await page.keyboard.type('separa');
    assert.match(await page.locator('.kuryos-search-results').innerText(), /Próximas Separações/);
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    await page.close();

    // ── Menu curto: tudo aberto, sem sanfona ──
    ({page, errors} = await abrir(browser, 'rot', 'proximas_ordens.html'));
    await page.waitForSelector('.kt-sidebar.kt-sanfona-off');
    e = await estado(page);
    assert.ok(e.every(([, a]) => a), 'tudo aberto');
    assert.deepEqual(errors, []);
    await page.close();

    // ── Celular (375 px) ──
    ({page, errors} = await abrir(browser, 'pcp', 'proximas_ordens.html?setor=envase', {width: 375, height: 800}));
    await page.waitForSelector('#kt-hamburger');
    assert.equal(await page.locator('.kt-sidebar').evaluate((s) => s.getBoundingClientRect().right <= 0), true, 'gaveta fechada fora da tela');
    await page.click('#kt-hamburger');
    await page.waitForFunction(() => document.querySelector('.kt-sidebar').getBoundingClientRect().left >= 0);
    const larg = await page.locator('.kt-sidebar').evaluate((s) => s.getBoundingClientRect().width);
    assert.ok(larg <= 375 * 0.86 + 1, 'gaveta cabe na tela com sobra para fechar');
    const logo = await page.locator('.kt-brand-logo').boundingBox(), botao = await page.locator('#kt-hamburger').boundingBox();
    assert.ok(logo.x >= botao.x + botao.width, 'o botão do menu não cobre a logo');
    const alturas = await page.$$eval('.kt-nav-group:not(.fechado) .kt-nav-link, .kt-nav-cap', (els) => els.map((x) => x.getBoundingClientRect().height));
    assert.ok(alturas.every((h) => h >= 44), 'alvos de toque >= 44 px: ' + alturas.filter((h) => h < 44).join(','));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'sem rolagem horizontal');
    if (process.env.MENU_SCREENSHOT) await page.screenshot({path: process.env.MENU_SCREENSHOT});
    assert.deepEqual(errors, []);
    console.log('OK Menu em sanfona: bloco atual aberto, outros fechados com contador, um de cada vez, lembrado; menu curto sem sanfona; celular com gaveta e toque de 44 px.');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
