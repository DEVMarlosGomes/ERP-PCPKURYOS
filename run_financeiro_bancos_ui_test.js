'use strict';
/* Financeiro F6, tela de verdade: aba "Caixas e bancos". Saldo por conta com o tipo,
   transferência banco -> caixa, tarifa, caixa que não fica negativo, extrato com saldo
   acumulado e estorno; tipo da conta em Cadastros. Servidor real
   (prepararMovimento / prepararEstornoMovimento); Firebase simulado em memória. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const FS = require('./functions/financeiro_servidor');

const HOJE = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const MES = HOJE.slice(0, 8) + '01';
function banco() {
  return {
    usuarios: {u1: {nome: 'Gustavo', email: 'adm@kuryos.com', role: 'admin'}},
    fin: {
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: MES},
        cx: {nome: 'Caixa', tipo: 'CAIXA', saldoInicialCentavos: 0, dataSaldoInicial: MES}},
      titulos: {}, baixas: {}, movimentos: {}
    },
    ctl: {fechamentos: {}},
  };
}

async function abrir(browser) {
  const page = await browser.newPage({viewport: {width: 1400, height: 950}});
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.addInitScript(({data}) => {
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
  }, {data: banco()});
  await page.exposeFunction('__servidor', async (nome, payload, base) => {
    try {
      const quem = {uid: 'u1', nome: 'Gustavo'}, agora = new Date().toISOString(); // hora real: ordena os lançamentos do mesmo dia
      if (nome === 'finMovimentar') { const r = FS.prepararMovimento(base, payload, quem, agora); return {updates: r.updates, data: {id: r.id, repetido: r.repetido}}; }
      if (nome === 'finEstornarMovimento') { const r = FS.prepararEstornoMovimento(base, payload, quem, agora); return {updates: r.updates, data: {}}; }
      return {erro: 'callable não simulado: ' + nome};
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

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  try {
    const {page, erros} = await abrir(browser);
    const toasts = [];
    await page.exposeFunction('__toast', (t) => toasts.push(t));
    await page.evaluate(() => { new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((x) => { if (x.classList && x.classList.contains('toast')) window.__toast(x.textContent); }))).observe(document.body, {childList: true}); });
    await page.click('.aba[data-aba="bancos"]');
    await page.waitForSelector('#extConta');
    const topo = await page.locator('.kpis').innerText();
    ok(/Itaú[\s\S]*R\$\s*1\.000,00[\s\S]*Banco/.test(topo) && /Caixa[\s\S]*R\$\s*0,00[\s\S]*Caixa · não fica negativo/.test(topo), 'saldo por conta com o tipo');

    // Tarifa no caixa vazio: recusada com a explicação.
    await page.click('button[data-mov="1"]');
    await page.selectOption('#mvConta', 'cx');
    await page.fill('#mvValor', '10,00');
    await page.click('#mvOk');
    await page.waitForFunction(() => document.querySelector('.toast'));
    ok(toasts.some((t) => /caixa Caixa ficaria negativo \(saldo R\$ 0,00\)/.test(t)), 'caixa negativo recusado e explicado');
    await page.click('#dlgX');

    // Suprimento: transferência do banco para o caixa.
    await page.click('button[data-transf="1"]');
    await page.selectOption('#trOrigem', 'itau');
    await page.selectOption('#trDestino', 'cx');
    await page.fill('#trValor', '200,00');
    await page.fill('#trHist', 'Suprimento');
    await page.click('#trOk');
    await page.waitForFunction(() => Object.keys(window.__db.fin.movimentos || {}).length === 1);
    // Tarifa no banco.
    await page.click('button[data-mov="1"]');
    await page.selectOption('#mvConta', 'itau');
    await page.selectOption('#mvTipo', 'TARIFA');
    await page.fill('#mvValor', '15,90');
    await page.fill('#mvHist', 'Tarifa pacote');
    await page.click('#mvOk');
    await page.waitForFunction(() => Object.keys(window.__db.fin.movimentos || {}).length === 2);
    const topo2 = await page.locator('.kpis').innerText();
    ok(/Itaú[\s\S]*R\$\s*784,10/.test(topo2) && /Caixa[\s\S]*R\$\s*200,00/.test(topo2), 'saldos: 1.000 − 200 − 15,90 e caixa 200');

    // Extrato do Itaú com saldo acumulado.
    const ext = await page.locator('#conteudo .card').last().innerText();
    ok(/Saldo inicial[\s\S]*1\.000,00[\s\S]*Transferência para Caixa · Suprimento[\s\S]*800,00[\s\S]*Tarifa bancária · Tarifa pacote[\s\S]*784,10/.test(ext), 'extrato com histórico e saldo linha a linha');
    ok(/Total do período[\s\S]*215,90[\s\S]*784,10/.test(ext), 'total do período fecha');
    await page.selectOption('#extConta', 'cx');
    ok(/Transferência de Itaú · Suprimento[\s\S]*200,00/.test(await page.locator('#conteudo .card').last().innerText()), 'o outro lado da transferência no extrato do caixa');
    await page.selectOption('#extConta', 'itau');

    // Estorno da tarifa.
    page.once('dialog', (d) => d.accept('tarifa devolvida pelo banco'));
    await page.locator('button[data-estornar-mov]').last().click();
    await page.waitForFunction(() => Object.keys(window.__db.fin.movimentos || {}).length === 3);
    const ext2 = await page.locator('#conteudo .card').last().innerText();
    ok(/Estorno: Tarifa bancária[\s\S]*estorno[\s\S]*800,00/.test(ext2), 'estorno aparece e o saldo volta a 800,00');
    ok(await page.locator('button[data-estornar-mov]').count() === 1, 'estornado não oferece estornar de novo (só a transferência)');
    await page.screenshot({path: path.join(__dirname, 'scripts', 'artifacts', 'fin-op', 'f6-caixas-bancos.png'), fullPage: true});

    // Cadastros: tipo da conta.
    await page.click('.aba[data-aba="cadastros"]');
    await page.selectOption('select[data-tipo-conta="itau"]', 'APLICACAO');
    await page.waitForFunction(() => window.__db.fin.contas_bancarias.itau.tipo === 'APLICACAO');
    ok(true, 'tipo da conta muda em Cadastros');
    ok(await page.locator('#cbTipo').count() === 1, 'conta nova escolhe o tipo');
    // A recusa do caixa negativo também cai no console (promessa rejeitada depois do aviso): é esperada.
    const inesperados = erros.filter((m) => !/ficaria negativo/.test(m));
    ok(!inesperados.length, 'sem erro de JS inesperado: ' + inesperados.join(' | '));
  } finally { await browser.close(); }
  console.log('OK financeiro F6 (tela): ' + n + ' verificações');
})().catch((e) => { console.error(e); process.exit(1); });
