"use strict";

// Diagnóstico: SDK real da tela, navegador isolado, todas as chamadas do ERP
// interceptadas. Não faz login nem grava em Firebase/produção.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const html = fs.readFileSync('public/usuarios.html', 'utf8');
  const auth = fs.readFileSync('public/auth_check.js', 'utf8');
  const urls = [...html.matchAll(/src="(https:\/\/www\.gstatic\.com\/firebasejs\/[^\"]+firebase-(?:app|functions)-compat\.js)"/g)].map(m => m[1]);
  assert.equal(urls.length, 2);
  const scripts = await Promise.all(urls.map(async url => {
    const res = await fetch(url);
    assert.equal(res.status, 200);
    return res.text();
  }));
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const page = await browser.newPage();
    const requests = [];
    await page.route('**/*', route => {
      const req = route.request();
      if (req.method() === 'POST') {
        requests.push(req.url());
        return route.fulfill({contentType:'application/json', body:JSON.stringify({result:{ok:true}})});
      }
      return route.fulfill({contentType:'text/html', body:'<!doctype html><title>Isolated route audit</title>'});
    });
    await page.goto('https://kuryoserp.com.br/usuarios');
    for (const content of scripts) await page.addScriptTag({content});
    await page.evaluate(() => firebase.initializeApp({projectId:'demo-crud-route', apiKey:'demo-only', appId:'demo-only'}));
    await page.evaluate(auth.slice(0, auth.indexOf('// --- Leituras únicas')));
    await page.evaluate(() => firebase.functions().httpsCallable('gerenciarUsuario')({acao:'funcoes',uid:'synthetic-only',funcoes:['production']}));
    assert.equal(requests.length, 1);
    const observed = requests[0];
    const expected = 'https://kuryoserp.com.br/api/gerenciarUsuario';
    assert.equal(observed, expected, 'adaptação compartilhada preserva /api no SDK da tela');
    await page.evaluate(() => firebase.functions().httpsCallableFromURL('https://kuryoserp.com.br/api/gerenciarUsuario')({acao:'funcoes',uid:'synthetic-only',funcoes:['production']}));
    assert.equal(requests[1], expected, 'controle com URL explícita preserva /api no SDK real');
    console.log(JSON.stringify({sdk:urls[0].split('/')[4],observed,expected,status:'ROUTE_REGRESSION_OK'}));
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
