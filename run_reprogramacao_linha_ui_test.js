'use strict';
/* PLAN-01 (reunião 28/10), tela de verdade: planejamento.html › Planejamento de OPs.
   - OP terminou antes: aviso "N bloco(s) podem ser movido(s)" e, em "Ver simulação",
     "N bloco(s) serão movido(s)" com era/passa a -- NADA gravado antes de Aplicar;
   - Aplicar grava só caminhos planos (ops/{op}/dataInicioPlanejada|dataFimPlanejada)
     + o registro em ajustes_planejamento/{hoje}; depois disso o aviso some;
   - OP atrasada: as programadas empurram (com virada de dia).
   Firebase simulado com listeners vivos (como run_proximas_ordens_ui_test.js),
   relógio fixo e fuso de Brasília. Prints em scripts/artifacts/fin-op/. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ART = path.join(__dirname, 'scripts', 'artifacts', 'fin-op');
fs.mkdirSync(ART, {recursive: true});
const L = (s) => new Date(s.replace(' ', 'T') + ':00-03:00').toISOString();

function dados(cenario) {
  const base = {
    usuarios: {pcp: {nome: 'Carla PCP', email: 'pcp@kuryos.com', role: 'pcp'}},
    config: {
      linhas: ['Linha 1', 'Linha 2'], turnos: ['A'], turnoHorarios: {A: '07:00'}, turnoHorariosFim: {A: '17:00'}, turnoHorariosFimSexta: {A: '16:00'},
      turnoPausas: {A: {inicio: '12:00', fim: '13:00'}}, setupPadraoPorLinha: {'Linha 1': 30}, congelamento: {diasFixos: 0},
      planejamento: {diasSemana: [1, 2, 3, 4, 5], feriados: {'2026-11-02': true}}
    },
    produtos: {p1: {sku: 'BS01', descricao: 'BODY SPLASH 200ML', prodHoraRef: 500}},
    pedidos: {}, programacao: {}, alocacoes_planejamento: {}, ajustes_planejamento: {},
    ops: {
      B: {lote: '26300/02', sku: 'BS01', produto: 'BODY SPLASH B', status: 'Não Iniciado', linha: 'Linha 1', qtdPlanejada: 1000,
        dataInicioPlanejada: L('2026-10-27 11:00'), dataFimPlanejada: L('2026-10-27 14:00')},
      C: {lote: '26300/03', sku: 'BS01', produto: 'BODY SPLASH C', status: 'Não Iniciado', linha: 'Linha 1', qtdPlanejada: 600,
        dataInicioPlanejada: L('2026-10-27 14:00'), dataFimPlanejada: L('2026-10-27 16:00')}
    }
  };
  base.ops.A = cenario === 'atrasou'
    ? {lote: '26300/01', sku: 'BS01', produto: 'BODY SPLASH A', status: 'Em Produção', linha: 'Linha 1', abertaLinha: 'Linha 1', qtdPlanejada: 2000, produzidoLinha: 1700,
      abertaDesde: L('2026-10-27 07:00'), dataInicioReal: L('2026-10-27 07:02'), dataInicioPlanejada: L('2026-10-27 07:00'), dataFimPlanejada: L('2026-10-27 11:00')}
    : {lote: '26300/01', sku: 'BS01', produto: 'BODY SPLASH A', status: 'Aguardando Confirmação', linha: 'Linha 1', qtdPlanejada: 2000, produzidoLinha: 2000,
      dataInicioReal: L('2026-10-27 07:00'), dataFimReal: L('2026-10-27 09:00'), dataInicioPlanejada: L('2026-10-27 07:00'), dataFimPlanejada: L('2026-10-27 11:00'),
      confirmacaoEtapas: {envase: {status: 'AGUARDANDO', fechadoEm: L('2026-10-27 09:00')}}};
  return base;
}

async function abrir(browser, cenario, agora, viewport, tema) {
  const context = await browser.newContext({viewport: viewport || {width: 1400, height: 1000}, timezoneId: 'America/Sao_Paulo'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.clock.install({time: new Date(L(agora))});
  await page.addInitScript(({data, tema}) => {
    try { localStorage.setItem('kuryos-theme', tema || 'light'); } catch (e) { /* sem storage: tema automático */ }
    const db = data;
    window.__db = db;
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
    window.firebase = {
      apps: [],
      initializeApp() {},
      auth() { return {currentUser: {uid: 'pcp', email: 'pcp@kuryos.com'}, onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'pcp', email: 'pcp@kuryos.com'}), 0); }, signOut() { return Promise.resolve(); }}; },
      functions() { return {httpsCallable() { return () => Promise.resolve({data: {}}); }}; },
      database() {
        const ref = (p) => {
          const valor = () => { const v = ler(p); return v === undefined ? null : structuredClone(v); };
          const snap = () => { const v = valor(); return {val: () => v, exists: () => v !== null, key: partes(p).pop(), forEach(cb) { Object.entries(v || {}).forEach(([k, x]) => cb({key: k, val: () => x})); }}; };
          return {path: p, key: partes(p).pop(),
            once(ev, cb) { const sn = snap(); if (cb) cb(sn); return Promise.resolve(sn); },
            on(ev, cb) { const f = () => cb(snap()); ouvintes.push(f); setTimeout(f, 0); return cb; }, off() {}, child(c) { return ref(p + '/' + c); },
            orderByChild() { return this; }, orderByKey() { return this; }, equalTo() { return this; }, limitToLast() { return this; }, startAt() { return this; }, endAt() { return this; },
            push(v) { const k = '-Q' + Math.random().toString(36).slice(2); if (v !== undefined) { gravar(p + '/' + k, v); avisar(); } const r = ref(p + '/' + k); const pr = Promise.resolve(r); pr.key = k; return v === undefined ? r : pr; },
            set(v) { gravar(p, v); avisar(); return Promise.resolve(); },
            update(obj) { window.__updates.push({path: p, obj: structuredClone(obj)}); Object.entries(obj).forEach(([k, v]) => gravar(p + '/' + k, v)); avisar(); return Promise.resolve(); },
            remove() { gravar(p, null); avisar(); return Promise.resolve(); },
            transaction(fn) { const r = fn(valor()); if (r !== undefined) { gravar(p, r); avisar(); } return Promise.resolve({committed: r !== undefined, snapshot: snap()}); }};
        };
        return {ref: (x) => ref(x || '')};
      }
    };
  }, {data: dados(cenario), tema});
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'app.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = path.join(__dirname, 'public', url.pathname.slice(1));
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
  await page.goto('https://app.test/planejamento.html');
  await page.waitForFunction(() => window.currentUser && window.ReprogramacaoLinha, null, {timeout: 10000});
  await page.click('.top-tab[data-tab="ops"]');
  await page.waitForSelector('#reprogBanner', {state: 'visible', timeout: 10000});
  return {page, errors, context};
}
const updatesOps = (page) => page.evaluate(() => window.__updates.filter((u) => Object.keys(u.obj).some((k) => /^ops\//.test(k))));

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  try {
    // ── 1. Antecipou: simula, só grava no Aplicar ─────────────────────────
    let {page, errors, context} = await abrir(browser, 'antecipou', '2026-10-27 09:10');
    const aviso = await page.locator('#reprogBanner').innerText();
    ok(/2 bloco\(s\) podem ser movido\(s\)/.test(aviso) && /26300\/01 terminou 120 min antes/.test(aviso), 'aviso: 2 blocos podem ser movidos, OP 26300/01 terminou 120 min antes');
    await page.click('#reprogVerBtn');
    await page.waitForSelector('#reprogModal.open');
    const corpo = await page.locator('#reprogModalBody').innerText();
    ok(/2 bloco\(s\) serão movido\(s\)/.test(corpo), 'simulação: "2 bloco(s) serão movido(s)"');
    ok(/26300\/02[\s\S]*puxa[\s\S]*27\/10 11:00[\s\S]*27\/10 09:30/.test(corpo) && /26300\/03[\s\S]*puxa[\s\S]*27\/10 14:00[\s\S]*27\/10 13:00/.test(corpo),
      'B passa de 11:00 para 09:30 (setup de 30 min), C de 14:00 para 13:00 (depois da pausa)');
    ok((await updatesOps(page)).length === 0, 'nada gravado antes de Aplicar');
    await page.screenshot({path: path.join(ART, 'plan01-simulacao-desktop-claro.png')});
    await page.click('#reprogModalAplicarBtn');
    await page.waitForFunction(() => window.__updates.some((u) => Object.keys(u.obj).some((k) => /^ops\//.test(k))));
    const u = (await updatesOps(page))[0];
    const chaves = Object.keys(u.obj).sort();
    ok(u.path === '' && chaves.filter((k) => /^ops\//.test(k)).join(',') === 'ops/B/dataFimPlanejada,ops/B/dataInicioPlanejada,ops/C/dataFimPlanejada,ops/C/dataInicioPlanejada',
      'Aplicar: update na raiz só com caminhos planos das duas datas de B e C');
    ok(chaves.some((k) => /^ajustes_planejamento\/2026-10-27\/reprog_/.test(k)) && chaves.length === 5, '+ um registro em ajustes_planejamento/2026-10-27');
    ok(u.obj['ops/B/dataInicioPlanejada'] === L('2026-10-27 09:30') && u.obj['ops/C/dataInicioPlanejada'] === L('2026-10-27 13:00'), 'valores gravados = os da simulação');
    await page.waitForSelector('#reprogBanner', {state: 'hidden'});
    ok(true, 'depois de aplicar, não há mais o que mover: o aviso some');
    ok(!errors.length, 'sem erro de JS (antecipou): ' + errors.join(' | '));
    await context.close();

    // ── 2. Atrasou: empurra, C vira o dia ─────────────────────────────────
    ({page, errors, context} = await abrir(browser, 'atrasou', '2026-10-27 11:40'));
    ok(/26300\/01 atrasou 40 min/.test(await page.locator('#reprogBanner').innerText()), 'aviso: OP 26300/01 atrasou 40 min');
    await page.click('#reprogVerBtn');
    await page.waitForSelector('#reprogModal.open');
    const corpo2 = await page.locator('#reprogModalBody').innerText();
    ok(/2 bloco\(s\) serão movido\(s\)/.test(corpo2) && /empurra[\s\S]*27\/10 13:15/.test(corpo2) && /27\/10 15:45[\s\S]*até 28\/10 07:45/.test(corpo2),
      'B empurra para 13:15; C para 15:45 e termina no dia seguinte 07:45');
    await page.click('#reprogModalCancelBtn');
    ok((await updatesOps(page)).length === 0, 'Cancelar não grava nada');
    ok(!errors.length, 'sem erro de JS (atrasou): ' + errors.join(' | '));
    await context.close();

    // ── 3. Prints: escuro e 390 px ────────────────────────────────────────
    for (const [vp, tema, nome] of [[{width: 1400, height: 1000}, 'dark', 'desktop-escuro'], [{width: 390, height: 844}, 'light', '390-claro'], [{width: 390, height: 844}, 'dark', '390-escuro']]) {
      ({page, errors, context} = await abrir(browser, 'atrasou', '2026-10-27 11:40', vp, tema));
      await page.locator('#reprogBanner').scrollIntoViewIfNeeded();
      await page.screenshot({path: path.join(ART, 'plan01-aviso-' + nome + '.png')});
      await page.click('#reprogVerBtn');
      await page.waitForSelector('#reprogModal.open');
      await page.screenshot({path: path.join(ART, 'plan01-simulacao-' + nome + '.png')});
      const caber = await page.evaluate(() => { const m = document.querySelector('#reprogModal .modal'); return m.getBoundingClientRect().right <= window.innerWidth + 1; });
      ok(caber, nome + ': o quadro da simulação cabe na largura');
      ok(!errors.length, nome + ': sem erro de JS: ' + errors.join(' | '));
      await context.close();
    }
    console.log(`OK reprogramação pelo realizado (tela): ${n} verificações; prints em scripts/artifacts/fin-op/`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
