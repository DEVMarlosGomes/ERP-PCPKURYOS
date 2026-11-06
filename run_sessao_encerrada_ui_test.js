'use strict';
/* Aviso de sessão encerrada (auth_check.js, 06/11/2026).
   Carrega só o bloco "Sessão encerrada pelo administrador" com um Firebase
   simulado e confere: login anterior à revogação mostra o aviso; login
   posterior não mostra; revogação que chega com a tela aberta mostra na hora;
   "Entrar de novo" sai e vai para o login.
   node run_sessao_encerrada_ui_test.js  (PLAYWRIGHT_MODULE aponta outro playwright) */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const fonte = fs.readFileSync(__dirname + '/public/auth_check.js', 'utf8');
const inicio = fonte.indexOf('// --- Sessão encerrada pelo administrador');
assert.ok(inicio > 0, 'bloco do aviso existe no auth_check.js');
const bloco = fonte.slice(inicio);

// Firebase mínimo: um usuário, o nó security_sessions e signOut.
const stub = `
window.__estado = {revokedAfter: null, authTime: 1000, saiu: false, ouvintes: []};
window.firebase = {
  apps: [{}],
  auth: function() { return {
    onAuthStateChanged: function(cb) { setTimeout(function() { cb({uid: 'tom', getIdTokenResult: function() {
      return Promise.resolve({claims: {auth_time: window.__estado.authTime}}); }}); }, 0); return function() {}; },
    signOut: function() { window.__estado.saiu = true; return Promise.resolve(); }
  }; },
  database: function() { return {ref: function(p) {
    window.__estado.caminho = p;
    return {on: function(ev, fn) { window.__estado.ouvintes.push(fn); fn({val: function() { return window.__estado.revokedAfter; }}); },
      off: function() {}};
  }}; }
};
window.__revogar = function(seg) { window.__estado.revokedAfter = seg;
  window.__estado.ouvintes.forEach(function(fn) { fn({val: function() { return seg; }}); }); };`;

async function abrir(browser, revokedAfter, authTime) {
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.route('**/*', (r) => r.request().url().endsWith('/login.html')
    ? r.fulfill({contentType: 'text/html', body: '<p>login</p>'})
    : r.fulfill({contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><p>pesagem</p><script>' + stub +
      'window.__estado.revokedAfter=' + JSON.stringify(revokedAfter) + ';window.__estado.authTime=' + authTime + ';</script>' +
      '<script>' + bloco + '</script></body></html>'}));
  await page.goto('http://kuryos.test/manipulacao.html');
  await page.waitForTimeout(150);
  return {page, erros};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    // 1. Entrou antes da revogação (auth_time 1000 <= 2000): aviso aparece.
    let {page, erros} = await abrir(browser, 2000, 1000);
    await page.waitForSelector('#kuryosSessaoEncerrada', {timeout: 2000});
    assert.match(await page.locator('#kuryosSessaoEncerrada').innerText(), /Sua sessão foi encerrada[\s\S]*não será salvo/);
    assert.equal(await page.evaluate(() => window.__estado.caminho), 'security_sessions/tom/revokedAfter');
    await page.click('#kuryosSessaoEntrar');
    await page.waitForURL('**/login.html', {timeout: 2000});
    assert.deepEqual(erros, []);
    await page.close();

    // 2. Entrou depois da revogação (3000 > 2000): sem aviso.
    ({page, erros} = await abrir(browser, 2000, 3000));
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#kuryosSessaoEncerrada').count(), 0, 'login novo não vê aviso');
    // 3. Revogação chega com a tela aberta (5000 >= 3000): aviso na hora, uma vez só.
    await page.evaluate(() => window.__revogar(5000));
    await page.waitForSelector('#kuryosSessaoEncerrada', {timeout: 2000});
    await page.evaluate(() => window.__revogar(6000));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#kuryosSessaoEncerrada').count(), 1, 'aviso não duplica');
    assert.deepEqual(erros, []);
    await page.close();

    // 4. Sem marca de revogação: nada acontece.
    ({page, erros} = await abrir(browser, null, 1000));
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#kuryosSessaoEncerrada').count(), 0);
    assert.deepEqual(erros, []);
    await page.close();
  } finally { await browser.close(); }
  console.log('OK sessão encerrada: login anterior à revogação avisa e leva ao login; login posterior e sem marca não avisam; revogação com a tela aberta avisa uma vez.');
})().catch((e) => { console.error(e); process.exit(1); });
