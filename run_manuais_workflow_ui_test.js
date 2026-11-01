'use strict';
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function abrir(browser, viewport) {
  const page = await browser.newPage({viewport});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'app.test') return route.fulfill({status: 204, body: ''});
    const rel = decodeURIComponent(url.pathname.slice(1) || 'manuais.html');
    const arquivo = path.join(__dirname, 'public', rel);
    if (!fs.existsSync(arquivo) || !fs.statSync(arquivo).isFile()) return route.fulfill({status: 404, body: ''});
    const type = rel.endsWith('.html') ? 'text/html' : rel.endsWith('.css') ? 'text/css' : rel.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript';
    return route.fulfill({body: fs.readFileSync(arquivo), contentType: type});
  });
  await page.goto('https://app.test/manuais.html');
  await page.waitForSelector('[data-help-ready="true"]');
  return {page, errors};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    let {page, errors} = await abrir(browser, {width: 1440, height: 1000});
    assert.ok(await page.locator('[data-help-card]').count() >= 14, 'cartões de todos os setores');
    await page.fill('#workflow-search', 'pesagem');
    const visiveisBusca = await page.locator('[data-help-card]:visible').allTextContents();
    assert.ok(visiveisBusca.length >= 1 && visiveisBusca.some((x) => /Manipulação/i.test(x)), 'busca encontra pesagem na Manipulação');
    await page.fill('#workflow-search', '');
    await page.click('[data-help-filter="apoio"]');
    const areas = await page.locator('[data-help-card]:visible').evaluateAll((els) => els.map((e) => e.dataset.helpGroup));
    assert.ok(areas.length >= 4 && areas.every((x) => x === 'apoio'), 'filtro Apoio não vaza setores do fluxo');
    await page.click('[data-theme-toggle]');
    assert.equal(await page.locator('html').getAttribute('data-manual-theme'), 'dark', 'alternância explícita para tema escuro');
    assert.deepEqual(errors, []);
    await page.close();

    ({page, errors} = await abrir(browser, {width: 390, height: 844}));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'sem overflow horizontal em 390 px');
    const alvos = await page.locator('button, input, a.workflow-link').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().height));
    assert.ok(alvos.every((h) => h >= 40), 'controles precisam ser tocáveis: ' + alvos.filter((h) => h < 40));
    await page.fill('#workflow-search', 'texto que não existe');
    assert.equal(await page.locator('#help-empty').isVisible(), true, 'busca vazia explica que não encontrou');
    if (process.env.MANUAIS_SCREENSHOT) await page.screenshot({path: process.env.MANUAIS_SCREENSHOT, fullPage: true});
    assert.deepEqual(errors, []);
    console.log('OK UI Central de Ajuda: busca, filtro, tema, estado vazio e 390 px sem overflow.');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
