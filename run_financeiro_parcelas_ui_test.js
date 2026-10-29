'use strict';
/* FIN-01 (reunião 28/10), tela de verdade: título manual com "Nº de parcelas",
   "1º vencimento (dias)" e "intervalo" que montam a condição, prévia das
   parcelas antes de lançar e a coluna "Parcelas" nas listas A pagar/A receber.
   Firebase simulado em memória; o callable finLancarTitulos roda o servidor
   real (functions/financeiro_servidor.js). Prints em scripts/artifacts/fin-op/. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const FS = require('./functions/financeiro_servidor');

const ART = path.join(__dirname, 'scripts', 'artifacts', 'fin-op');
fs.mkdirSync(ART, {recursive: true});

function banco() {
  return {
    usuarios: {u1: {nome: 'Gustavo', email: 'adm@kuryos.com', role: 'admin'}},
    config: {},
    fin: {
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-10-01'}},
      titulos: {
        R1: {tipo: 'RECEBER', valorCentavos: 100000, condicao: '30/60', baseVencimento: '2026-10-01', emissao: '2026-10-01', natureza: 'RECEITA_VENDA',
          documento: 'NF 501', parceiro: {nome: 'Cliente Exemplo'}, origem: {tipo: 'MANUAL'}},
        P1: {tipo: 'PAGAR', valorCentavos: 30000, condicao: '30/60/90', baseVencimento: '2026-10-01', emissao: '2026-10-01', natureza: 'EMBALAGEM',
          documento: 'NF 77', parceiro: {nome: 'Fornecedor Exemplo'}, origem: {tipo: 'MANUAL'}},
      },
      baixas: {B1: {tipo: 'BAIXA', titulo: 'R1', tituloTipo: 'RECEBER', valorCentavos: 50000, liquidoCentavos: 50000, data: '2026-10-31', conta: 'itau'}},
    },
    ctl: {fechamentos: {'2026-09': {status: 'FECHADO'}}},
  };
}

async function abrir(browser, viewport, tema) {
  const page = await browser.newPage({viewport});
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.addInitScript(({data, tema}) => {
    try { localStorage.setItem('kuryos-theme', tema); } catch (e) { /* sem storage: tema automático */ }
    const db = data;
    window.__db = db; window.__chamadas = [];
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => (String(p).replace(/^\//, '') === '.info/connected' ? true : partes(p).reduce((x, k) => (x == null ? undefined : x[k]), db));
    const gravar = (p, v) => {
      const ks = partes(p); let x = db;
      ks.slice(0, -1).forEach((k) => { if (x[k] == null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; });
      if (v === null || v === undefined) delete x[ks[ks.length - 1]]; else x[ks[ks.length - 1]] = structuredClone(v);
    };
    const ouvintes = [];
    const avisar = () => ouvintes.forEach((o) => o());
    window.firebase = {
      initializeApp() {},
      auth() { return {currentUser: {uid: 'u1', email: 'adm@kuryos.com'}, onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'adm@kuryos.com'}), 0); }, signOut() { return Promise.resolve(); }}; },
      functions() {
        return {httpsCallable(nome) {
          return (payload) => {
            window.__chamadas.push({nome, payload});
            return window.__servidor(nome, structuredClone(payload), structuredClone(db)).then((r) => {
              if (r.erro) return Promise.reject(new Error(r.erro));
              Object.entries(r.updates || {}).forEach(([k, v]) => gravar(k, v));
              avisar();
              return {data: r.data};
            });
          };
        }};
      },
      database() {
        const ref = (p) => {
          const snap = () => { const v = ler(p); const c = v === undefined ? null : structuredClone(v); return {val: () => c, exists: () => c !== null, key: partes(p).pop()}; };
          return {path: p, key: partes(p).pop(), child(c) { return ref(p + '/' + c); },
            once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); },
            on(ev, cb) { const f = () => cb(snap()); ouvintes.push(f); setTimeout(f, 0); return cb; }, off() {},
            orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
            set(v) { gravar(p, v); avisar(); return Promise.resolve(); },
            update(o) { Object.entries(o).forEach(([k, v]) => gravar(p + '/' + k, v)); avisar(); return Promise.resolve(); },
            remove() { gravar(p, null); avisar(); return Promise.resolve(); },
            push() { const k = '-F' + Math.random().toString(36).slice(2, 8); return ref(p + '/' + k); }};
        };
        return {ref: (x) => ref(x || '')};
      },
    };
  }, {data: banco(), tema});
  await page.exposeFunction('__servidor', async (nome, payload, base) => {
    try {
      if (nome !== 'finLancarTitulos') return {erro: 'callable não simulado: ' + nome};
      const r = FS.prepararTitulos(base, payload, {uid: 'u1', nome: 'Gustavo'}, '2026-10-29T12:00:00.000Z');
      return {updates: r.updates, data: {criados: r.criados, repetidos: r.repetidos, erros: r.erros}};
    } catch (e) { return {erro: e.message}; }
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'fin.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = path.join(__dirname, 'public', url.pathname.slice(1));
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
  await page.goto('https://fin.test/financeiro.html');
  await page.waitForFunction(() => window.currentUser && document.querySelector('.kpis'));
  return {page, erros};
}

async function semRolagemHorizontal(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  try {
    // ── Desktop claro: o fluxo inteiro ────────────────────────────────────
    let {page, erros} = await abrir(browser, {width: 1400, height: 950}, 'light');
    await page.click('.aba[data-aba="receber"]');
    await page.waitForSelector('table tbody tr td a[data-det="R1"]');
    const linhaR1 = await page.locator('tr', {has: page.locator('a[data-det="R1"]')}).innerText();
    ok(/1\/2 recebida/.test(linhaR1), 'A receber: coluna Parcelas mostra "1/2 recebida"');
    await page.click('.aba[data-aba="pagar"]');
    const linhaP1 = await page.locator('tr', {has: page.locator('a[data-det="P1"]')}).innerText();
    ok(/0\/3 pagas/.test(linhaP1), 'A pagar: coluna Parcelas mostra "0/3 pagas"');
    ok(await page.locator('th', {hasText: 'Parcelas'}).count() === 1, 'cabeçalho "Parcelas" na lista');
    await page.screenshot({path: path.join(ART, 'fin01-lista-pagar-desktop-claro.png'), fullPage: true});

    await page.click('button[data-manual="PAGAR"]');
    await page.waitForSelector('#mNParc');
    await page.fill('#mParc', 'Fornecedor Parcelado');
    await page.fill('#mDoc', 'NF 900');
    await page.fill('#mValor', '100,00');
    await page.fill('#mEmi', '2026-10-01');
    await page.fill('#mNParc', '3');
    ok(await page.inputValue('#mCond') === '30/60/90', 'Nº de parcelas 3 + 1º vencimento 30 + intervalo 30 monta "30/60/90"');
    const prev = await page.locator('#mPrev').innerText();
    ok(/1\/3[\s\S]*31\/10\/2026[\s\S]*33,33/.test(prev) && /3\/3[\s\S]*30\/12\/2026[\s\S]*33,34/.test(prev), 'prévia: 33,33 + 33,33 + 33,34 com os vencimentos');
    await page.fill('#mCond', '2x 30/60/90');
    ok(/3 prazos para 2 parcelas/.test(await page.locator('#mPrev').innerText()), 'condição digitada inválida: mensagem clara na prévia');
    await page.fill('#mCond', '2x 30/60');
    ok(/2\/2[\s\S]*30\/11\/2026[\s\S]*50,00/.test(await page.locator('#mPrev').innerText()), 'escrita "2x 30/60" aceita na prévia');
    await page.screenshot({path: path.join(ART, 'fin01-modal-previa-desktop-claro.png')});
    await page.click('#mOk');
    await page.waitForFunction(() => Object.values(window.__db.fin.titulos).some((t) => t.documento === 'NF 900'));
    const novo = await page.evaluate(() => Object.values(window.__db.fin.titulos).find((t) => t.documento === 'NF 900'));
    ok(novo.condicao === '30/60' && novo.valorCentavos === 10000, 'servidor grava UM título com a condição canônica "30/60"');
    const linhaNova = await page.locator('tr', {hasText: 'NF 900'}).innerText();
    ok(/0\/2 pagas/.test(linhaNova), 'o título lançado aparece com "0/2 pagas"');

    // Mês fechado continua recusando.
    await page.click('button[data-manual="PAGAR"]');
    await page.fill('#mParc', 'Fornecedor Setembro'); await page.fill('#mValor', '10'); await page.fill('#mEmi', '2026-09-10'); await page.fill('#mNParc', '2');
    await page.click('#mOk');
    await page.waitForSelector('.toast');
    ok(/fechado/.test(await page.locator('.toast').last().innerText()), 'mês fechado: o servidor recusa e a tela mostra o motivo');
    // travar() (já existia) mostra o toast e repassa a recusa: ela chega aqui como
    // promessa rejeitada. Só essa recusa esperada é descontada.
    const inesperados = erros.filter((m) => !/mês 2026-09 fechado/.test(m));
    ok(!inesperados.length, 'sem erro de JS no console (desktop claro): ' + inesperados.join(' | '));
    await page.close();

    // ── Desktop escuro, 390 px claro e escuro: prints e sem rolagem lateral ──
    for (const [vp, tema, nome] of [[{width: 1400, height: 950}, 'dark', 'desktop-escuro'], [{width: 390, height: 844}, 'light', '390-claro'], [{width: 390, height: 844}, 'dark', '390-escuro']]) {
      ({page, erros} = await abrir(browser, vp, tema));
      await page.click('.aba[data-aba="pagar"]');
      await page.waitForSelector('a[data-det="P1"]');
      await page.screenshot({path: path.join(ART, 'fin01-lista-pagar-' + nome + '.png'), fullPage: true});
      await page.click('button[data-manual="PAGAR"]');
      await page.fill('#mValor', '100,00'); await page.fill('#mEmi', '2026-10-01'); await page.fill('#mNParc', '3');
      await page.locator('#mPrev').scrollIntoViewIfNeeded();
      await page.screenshot({path: path.join(ART, 'fin01-modal-previa-' + nome + '.png')});
      ok(await semRolagemHorizontal(page), nome + ': página sem rolagem horizontal');
      ok(!erros.length, nome + ': sem erro de JS no console: ' + erros.join(' | '));
      await page.close();
    }
    console.log(`OK financeiro parcelas (tela): ${n} verificações; prints em scripts/artifacts/fin-op/`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
