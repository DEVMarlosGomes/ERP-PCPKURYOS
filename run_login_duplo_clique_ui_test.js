'use strict';
/* Login com duplo clique (PORT-10, porte do Gustavo 6d63a68): o segundo clique
   durante o envio não dispara um segundo login; o botão volta a funcionar depois
   de um erro. E o login não oferece cadastro (só o ADM cria contas). Firebase simulado. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1200, height: 900}});
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await page.addInitScript(() => {
      window.__chamadas = {criar: 0, entrar: 0};
      const lento = (v, falha) => new Promise((ok, nao) => setTimeout(() => (falha ? nao(falha) : ok(v)), 400));
      const auth = {
        currentUser: null,
        onAuthStateChanged() { return () => {}; },
        signOut() { return Promise.resolve(); },
        createUserWithEmailAndPassword() { window.__chamadas.criar++; return lento({user: {uid: 'novo'}}); },
        signInWithEmailAndPassword() { window.__chamadas.entrar++; return lento(null, {code: 'auth/invalid-credential', message: 'x'}); },
        sendPasswordResetEmail() { return Promise.resolve(); },
        useDeviceLanguage() {}, verifyPasswordResetCode() { return Promise.resolve(''); }
      };
      const ref = () => ({set() { return Promise.resolve(); }, once() { return Promise.resolve({val: () => null}); }, on() {}, off() {}});
      window.firebase = {apps: [], initializeApp() {}, app() { return {}; }, auth: Object.assign(() => auth, {}), database() { return {ref}; }};
    });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'app.test') return route.fulfill({body: '', contentType: 'text/javascript'});
      const file = 'public' + url.pathname;
      if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
      return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
    });
    await page.goto('https://app.test/login.html');

    // Cadastro público foi retirado (11fcdc6): só o ADM cria contas em Usuários.
    // A tela de login não pode oferecer formulário nem chamada de cadastro.
    assert.equal(await page.locator('#form-register, #reg-email, #btn-register').count(), 0, 'login sem formulário de cadastro');
    assert.equal(await page.evaluate(() => window.__chamadas.criar), 0, 'nenhuma conta criada pela tela de login');

    // Login com erro: duplo clique -> um envio; o botão volta depois do erro.
    await page.fill('#login-email', 'x@kuryos.com');
    await page.fill('#login-password', 'errada');
    await page.evaluate(() => { const f = document.getElementById('form-login'); f.requestSubmit(); f.requestSubmit(); });
    await page.waitForFunction(() => /incorretos/.test(document.getElementById('feedback').innerText));
    assert.equal(await page.evaluate(() => window.__chamadas.entrar), 1);
    assert.equal(await page.locator('#btn-login').isDisabled(), false, 'botão liberado depois do erro');
    assert.equal(await page.locator('#btn-login').innerText(), 'Entrar no Sistema');
    assert.deepEqual(erros, []);
    console.log('OK Login: sem cadastro público; duplo clique não dispara dois logins; o botão volta depois do erro.');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
