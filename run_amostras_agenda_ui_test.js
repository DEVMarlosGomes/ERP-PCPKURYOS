'use strict';
/* Amostras de MP na agenda da Logística, tela real (19/11/2026): a amostra solicitada aparece no
   calendário com 🧪 na previsão de chegada e a Logística dá baixa ali (callable amostraMp, RECEBER).
   Mesmo harness de run_calendario_logistica_ui_test.js. Datas relativas a hoje. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const hoje = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
const somar = (d, k) => new Date(Date.parse(d + 'T12:00:00Z') + k * 86400000).toISOString().slice(0, 10);
// Mesmo mês de hoje, para o chip estar na grade do mês.
const previsao = somar(hoje, 1).slice(0, 7) === hoje.slice(0, 7) ? somar(hoje, 1) : hoje;

function dados(perfil) {
  return {
    usuarios: {u1: perfil},
    config: {}, fornecedores: {}, materiais: {}, enderecos_estoque: {}, estoque_lotes: {}, clientes: {}, pedidos_compra: {}, agendamentos_expedicao: {},
    amostras_mp: {
      am4: {codigo: 'AM-0004', status: 'SOLICITADA', tipo: 'NOVA', materialNovo: {nome: 'ghk cu'}, fornecedor: {key: 'wm257', nome: 'TC QUIMICA'},
        quantidade: {valor: 20, unidade: 'g'}, previsaoChegada: previsao, solicitante: {nome: 'yasmim.fantini'}, motivo: 'DESENVOLVIMENTO'},
      am9: {codigo: 'AM-0009', status: 'CANCELADA', tipo: 'NOVA', materialNovo: {nome: 'cancelada'}, previsaoChegada: previsao},
    }
  };
}

async function abrir(browser, perfil) {
  const page = await browser.newPage({viewport: {width: 1500, height: 1100}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(({data}) => {
    const db = data; window.__db = db; window.__iniciado = false; window.__chamadas = [];
    try { localStorage.removeItem('logistica-calendario'); } catch (e) {}
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const snapDe = (path) => { const v = ler(path); const c = v === undefined ? null : structuredClone(v); return {val: () => c, exists: () => c !== null, key: partes(path).pop()}; };
    const exige = (q) => { if (!window.__iniciado) throw new Error('sem app (' + q + ')'); };
    const callable = (nome) => (payload) => { window.__chamadas.push({nome, payload}); return Promise.resolve({data: {ok: true}}); };
    window.firebase = {
      initializeApp(cfg) { if (!cfg || !cfg.databaseURL) throw new Error('sem databaseURL'); window.__iniciado = true; },
      auth() { exige('auth'); return {currentUser: {uid: 'u1', email: 'g@kuryos.com'}, onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'g@kuryos.com'}), 0); }, signOut() { return Promise.resolve(); }}; },
      functions() { return {httpsCallable: callable}; },
      app() { return {functions: () => ({httpsCallable: callable})}; },
      storage() { return {ref: () => ({})}; },
      database() {
        exige('database');
        const ref = (path) => ({path, key: partes(path).pop(),
          once(ev, cb) { const s = snapDe(path); if (cb) cb(s); return Promise.resolve(s); },
          on(ev, cb) { setTimeout(() => cb(path === '.info/connected' ? {val: () => true} : snapDe(path)), 0); return cb; }, off() {},
          child(c) { return ref(path + '/' + c); }, orderByChild() { return this; }, orderByKey() { return this; }, equalTo() { return this; }, startAt() { return this; }, limitToLast() { return this; },
          push() { return ref(path + '/-N' + Math.random().toString(36).slice(2, 8)); },
          set() { return Promise.resolve(); }, update() { return Promise.resolve(); }, remove() { return Promise.resolve(); },
          transaction() { return Promise.resolve({committed: true, snapshot: snapDe(path)}); }});
        return {ref: (p) => ref(p || '')};
      }
    };
  }, {data: dados(perfil)});
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'cal.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://cal.test/logistica.html?tab=calendario');
  await page.waitForFunction(() => window.currentUser && window.currentUser.nome, null, {timeout: 10000});
  await page.waitForFunction(() => document.querySelector('#calGrade [data-ev="am:am4"]'), null, {timeout: 10000});
  return {page, errors};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    // Logística: vê a amostra e dá baixa.
    let {page, errors} = await abrir(browser, {nome: 'Ana Logística', email: 'l@kuryos.com', role: 'logistica'});
    const chip = page.locator('#calGrade [data-ev="am:am4"]').first();
    // O sistema de ícones troca o emoji 🧪 por SVG: confere a classe e o ícone.
    assert.match(await chip.getAttribute('class'), /entrada amostra sit-AGENDADO/);
    assert.match(await chip.innerText(), /TC QUIMICA/);
    assert.ok(await chip.locator('svg, .kuryos-inline-icon').count() >= 1, 'ícone da amostra');
    assert.match(await chip.getAttribute('title'), /Amostra de MP: TC QUIMICA · Amostra · ghk cu \(nova\) · 20 g/);
    assert.equal(await page.locator('#calGrade [data-ev="am:am9"]').count(), 0, 'cancelada fora');
    await chip.click();
    const det = await page.locator('#calDetalhe').innerText();
    assert.match(det, /entra sem Pedido de Compra/);
    assert.match(det, /AM-0004[\s\S]*ghk cu[\s\S]*20 g[\s\S]*yasmim\.fantini/);
    assert.equal(await page.locator('#calDetalhe a[href="cadastros.html?tab=amostras"]').count(), 1);
    await page.click('#calDetalhe [data-baixa]');
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__chamadas.length), 0, 'sem forma de entrega não chama');
    await page.selectOption('#calAmForma', 'CORREIO');
    await page.click('#calDetalhe [data-baixa]');
    await page.waitForFunction(() => window.__chamadas.length === 1);
    const ch = await page.evaluate(() => window.__chamadas[0]);
    assert.equal(ch.nome, 'amostraMp');
    assert.equal(ch.payload.acao, 'RECEBER');
    assert.equal(ch.payload.id, 'am4');
    assert.deepEqual(ch.payload.dados, {data: hoje, forma: 'CORREIO'});
    assert.ok(ch.payload.requestId);
    assert.equal(await page.locator('#calDetalhe[open]').count(), 0, 'fecha depois da baixa');
    assert.deepEqual(errors, [], 'erros: ' + errors.join(' | '));
    await page.close();

    // PCP (sem papel de logística): vê, mas não dá baixa.
    ({page, errors} = await abrir(browser, {nome: 'Planejador', email: 'p@kuryos.com', role: 'pcp'}));
    await page.locator('#calGrade [data-ev="am:am4"]').first().click();
    assert.equal(await page.locator('#calDetalhe [data-baixa]').count(), 0);
    assert.deepEqual(errors, [], 'erros: ' + errors.join(' | '));
    console.log('OK amostras na agenda (tela): 🧪 na previsão, detalhe, baixa pela callable amostraMp para a Logística, só leitura para os outros.');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
