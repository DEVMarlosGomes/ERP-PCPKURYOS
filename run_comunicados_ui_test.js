'use strict';
/* Comunicado de boas-vindas (13/11/2026), tela de verdade no Chrome: Usuários › cartão do
   comunicado (só ADM) → prévia (provedor, destinatários, texto) → domínio incomum vem
   desmarcado → envio só para os marcados, um e-mail por pessoa. A callable é simulada com
   o MESMO serviço do servidor (functions/comunicados.js) sobre um banco em memória.
   Rodar: PLAYWRIGHT_MODULE=<node_modules/playwright> node run_comunicados_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const C = require('./functions/comunicados');

const USUARIOS = {
  u1: {role: 'admin', nome: 'Gustavo', email: 'gustavo@kuryos.com.br'},
  a1: {role: 'pcp', nome: 'Ana Souza', email: 'ana@kuryos.com.br'},
  a2: {role: 'producao', nome: 'Bruno', email: 'bruno@gmail.com'},
  tst: {role: 'pcp', nome: 'Conta de teste', email: 'guilherme@nexus.com'},
  ina: {role: 'pcp', nome: 'Eva', email: 'eva@kuryos.com.br', desativado: true}
};
// Banco do servidor (em memória) para o serviço real.
function bancoServidor(dados) {
  const db = JSON.parse(JSON.stringify(dados));
  const partes = (p) => String(p).split('/').filter(Boolean);
  const ler = (p) => partes(p).reduce((x, k) => (x == null ? undefined : x[k]), db);
  const gravar = (p, v) => { const ks = partes(p); let x = db; ks.slice(0, -1).forEach((k) => { if (x[k] == null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; }); if (v == null) delete x[ks[ks.length - 1]]; else x[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v)); };
  return {ref: (p) => ({
    once: async () => ({val: () => { const v = ler(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }}),
    set: async (v) => gravar(p, v),
    transaction: async (fn) => { const a = ler(p); const nv = fn(a === undefined ? null : JSON.parse(JSON.stringify(a))); if (nv === undefined) return {committed: false}; gravar(p, nv); return {committed: true}; },
  })};
}
const emails = [];
const svc = C.criarServico({db: bancoServidor({usuarios: USUARIOS, comunicados: {}}), provedor: () => 'RESEND', pausaMs: 0,
  enviarEmail: async (para) => { emails.push(para); return true; }});

async function prepararPagina(page) {
  await page.addInitScript(({data}) => {
    const db = data; window.__emails = [];
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => (String(p).replace(/^\//, '') === '.info/connected' ? true : partes(p).reduce((x, k) => (x == null ? undefined : x[k]), db));
    window.firebase = {
      initializeApp() {}, app() { return {}; },
      auth() { return {currentUser: {uid: 'u1', email: 'gustavo@kuryos.com.br'}, onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'gustavo@kuryos.com.br', getIdToken: () => Promise.resolve('t')}), 0); return () => {}; }, signOut() { return Promise.resolve(); }}; },
      functions() {
        return {httpsCallable(nome) {
          return (payload) => window.__servidor(nome, payload).then((r) => {
            if (r.erro) return Promise.reject(new Error(r.erro));
            (r.emails || []).forEach((e) => window.__emails.push(e));
            return {data: r.data};
          });
        }};
      },
      database() {
        const ref = (p) => {
          const snap = () => { const v = ler(p); const c = v === undefined ? null : JSON.parse(JSON.stringify(v)); return {val: () => c, exists: () => c !== null, key: partes(p).pop(), forEach(fn) { Object.keys(c || {}).forEach((k) => fn({key: k, val: () => c[k]})); }}; };
          return {path: p, key: partes(p).pop(), child(c) { return ref(p + '/' + c); }, once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); },
            on(ev, cb) { setTimeout(() => cb(snap()), 0); return cb; }, off() {}, orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
            set() { return Promise.resolve(); }, update() { return Promise.resolve(); }, remove() { return Promise.resolve(); }, push() { return ref(p + '/x'); }};
        };
        return {ref: (x) => ref(x || '')};
      },
    };
  }, {data: {usuarios: USUARIOS}});
  await page.exposeFunction('__servidor', async (nome, payload) => {
    if (nome !== 'comunicadoSistema') return {erro: 'callable não simulada: ' + nome};
    try { const antes = emails.length; const data = await svc.executar('u1', payload || {}); return {data, emails: emails.slice(antes).map((e) => e)}; } catch (e) { return {erro: e.message}; }
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'fin.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = path.join(__dirname, 'public', url.pathname.slice(1));
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  try {
    const page = await browser.newPage({viewport: {width: 1300, height: 900}});
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    page.on('dialog', (d) => d.accept());
    await prepararPagina(page);
    await page.goto('https://fin.test/usuarios.html');
    await page.waitForSelector('#cardComunicado', {state: 'visible'});
    ok(true, 'cartão do comunicado aparece para o ADM');
    await page.click('#btnComPrevia');
    await page.waitForSelector('#comAmostra');
    const txt = await page.locator('#comResultado').innerText();
    ok(/Resend/.test(txt) && /4 destinatário/.test(txt), 'prévia com provedor e destinatários');
    ok(/domínio incomum/.test(txt), 'aviso de domínio incomum');
    ok(!(await page.isChecked('[data-com-uid="tst"]')) && await page.isChecked('[data-com-uid="a1"]'), 'domínio incomum desmarcado; os outros marcados');
    ok(/Enviar para 3 pessoa/.test(await page.innerText('#btnComEnviar')), 'botão conta só os marcados');
    const amostra = await page.evaluate(() => document.getElementById('comAmostra').srcdoc);
    ok(/Boas-vindas ao Kuryos ERP/.test(amostra) && /Gustavo/.test(amostra), 'prévia do e-mail com o nome de quem vê');
    const titulo = await page.frameLocator('#comAmostra').locator('h1').innerText({timeout: 5000});
    ok(/Boas-vindas ao Kuryos ERP/.test(titulo), 'o e-mail aparece desenhado dentro da prévia');
    await page.click('#btnComEnviar');
    await page.waitForFunction(() => /Todos já receberam|Marque quem recebe/.test(document.getElementById('btnComEnviar').textContent));
    const enviados = await page.evaluate(() => window.__emails.map((e) => e[0]));
    ok(JSON.stringify(enviados.sort()) === JSON.stringify(['ana@kuryos.com.br', 'bruno@gmail.com', 'gustavo@kuryos.com.br']), 'enviou um por pessoa, sem a conta desmarcada: ' + enviados.join(', '));
    ok(/Marque quem recebe/.test(await page.innerText('#btnComEnviar')), 'depois do envio só resta a conta desmarcada');
    ok(/enviado/.test(await page.locator('#comResultado').innerText()), 'lista mostra quem já recebeu');
    await page.screenshot({path: path.join(__dirname, 'scripts', 'artifacts', 'fin-op', 'comunicado-boas-vindas.png'), fullPage: true});
    ok(!erros.length, 'sem erro de JS: ' + erros.join(' | '));
  } finally { await browser.close(); }
  console.log('OK comunicado de boas-vindas (tela): ' + n + ' verificações');
})().catch((e) => { console.error(e); process.exit(1); });
