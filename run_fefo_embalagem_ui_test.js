'use strict';
/* FEFO-01 (reunião 28/10), tela de verdade: separacao_materiais.html.
   - dois lotes da mesma tampa com validades diferentes: o indicado é o que vence primeiro;
   - seguir o FEFO confirma sem motivo;
   - tirar do lote que vence depois (ou de "+ Usar outro lote") pede motivo, com a frase da pesagem;
   - com motivo, a OP guarda separacaoConcluida/foraFefo (motivo, indicado, usado);
   - lote de outro cliente não aparece como opção.
   Firebase simulado que registra cada escrita (mesmo desenho do run_separacao_consolidada_ui_test.js).
   Prints em scripts/artifacts/fin-op/. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ART = path.join(__dirname, 'scripts', 'artifacts', 'fin-op');
fs.mkdirSync(ART, {recursive: true});

const lote = (k, saldo, end, extra) => Object.assign({itemTipo: 'material', itemCodigo: 'TP-1', itemNome: 'TAMPA 24/410', unidade: 'un', saldoLote: saldo, status: 'LIBERADO',
  enderecoKey: end, enderecoCodigo: end, loteInterno: 'L-' + k}, extra || {});
function dados() {
  return {
    'usuarios/u1': {nome: 'Separador', email: 's@kuryos.com', role: 'logistica'},
    config: {},
    produtos: {MRARBS05: {clienteKey: 'MRAR'}},
    ops: {a: {lote: '26302/01', sku: 'MRARBS05', produto: 'BODY SPLASH ROSA', cliente: 'MISS ROSE', status: 'Programado',
      materiaisConsumo: {m1: {mpCodigo: 'TP-1', mpNome: 'TAMPA 24/410', unidade: 'un', quantidade: 500, origem: 'bom'}}}},
    enderecos_estoque: {
      'GAL-1': {codigo: 'GAL-1', area: 'GALPAO', ativo: true, rua: 1, nivel: 1, predio: 1},
      'GAL-2': {codigo: 'GAL-2', area: 'GALPAO', ativo: true, rua: 1, nivel: 1, predio: 2},
      'GAL-3': {codigo: 'GAL-3', area: 'GALPAO', ativo: true, rua: 1, nivel: 1, predio: 3},
      'FAB-1': {codigo: 'FAB-1', area: 'FABRICA', ativo: true, rua: 9, nivel: 1, predio: 1}
    },
    estoque_lotes: {'TP-1': {
      A: lote('A', 600, 'GAL-1', {dataValidade: '2027-12-31', dataRecebimento: '2026-08-01'}),
      B: lote('B', 400, 'GAL-2', {dataValidade: '2027-03-31', dataRecebimento: '2026-09-01'}),   // chegou depois, vence antes
      D: lote('D', 900, 'GAL-3', {dataValidade: '2028-06-30', dataRecebimento: '2026-09-10'}),
      P: lote('P', 999, 'GAL-3', {dataValidade: '2026-12-31', propriedade: {tipo: 'CLIENTE', clienteKey: 'PROP'}})  // de outro cliente
    }}
  };
}

async function abrir(browser, viewport, tema) {
  const context = await browser.newContext({viewport: viewport || {width: 1400, height: 1000}, timezoneId: 'America/Sao_Paulo'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(({data, tema}) => {
    try { localStorage.setItem('kuryos-theme', tema || 'light'); } catch (e) { /* sem storage: tema automático */ }
    window.__writes = [];
    const callable = () => () => Promise.resolve({data: {}});
    window.firebase = {
      apps: [],
      initializeApp() {},
      auth() {
        return {onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 's@kuryos.com', displayName: 'Separador'}), 0); },
          signOut() { return Promise.resolve(); }, currentUser: {uid: 'u1', email: 's@kuryos.com'}};
      },
      functions() { return {httpsCallable: callable}; },
      database() {
        const valor = (p) => {
          if (p in data) return data[p];
          const partes = String(p || '').split('/');
          for (let i = partes.length - 1; i > 0; i--) {
            const base = partes.slice(0, i).join('/');
            if (base in data) return partes.slice(i).reduce((o, k) => (o == null ? undefined : o[k]), data[base]);
          }
          return undefined;
        };
        const ref = (p) => {
          const snap = {val: () => (valor(p) === undefined ? null : structuredClone(valor(p))), exists: () => valor(p) !== undefined, key: String(p).split('/').pop()};
          return {path: p, key: 'k' + Math.random().toString(36).slice(2, 8),
            once(ev, cb) { if (cb) cb(snap); return Promise.resolve(snap); },
            on(ev, cb) { setTimeout(() => cb(snap), 0); return cb; }, off() {},
            child(c) { return ref(p + '/' + c); },
            push(v) { const caminho = p + '/k' + Math.random().toString(36).slice(2, 8); if (v !== undefined) window.__writes.push({op: 'push', path: p, v}); return Object.assign(ref(caminho), {then: (a, b) => Promise.resolve(ref(caminho)).then(a, b)}); },
            orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
            set(v) { window.__writes.push({op: 'set', path: p, v}); return Promise.resolve(); },
            update(v) { window.__writes.push({op: 'update', path: p || '/', v}); return Promise.resolve(); },
            remove() { return Promise.resolve(); },
            transaction(fn) {
              const antes = valor(p) === undefined ? null : structuredClone(valor(p));
              const v = fn(antes);
              window.__writes.push({op: 'transaction', path: p, v: v === undefined ? null : structuredClone(v)});
              return Promise.resolve({committed: v !== undefined, snapshot: {val: () => v, exists: () => v != null}});
            }};
        };
        return {ref, ServerValue: {TIMESTAMP: 0}};
      }
    };
  }, {data: dados(), tema});
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'sep.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = path.join(__dirname, 'public', url.pathname.slice(1));
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
  await page.goto('https://sep.test/separacao_materiais.html');
  await page.waitForFunction(() => window.FefoEmbalagem && document.querySelector('#opBody tr[data-op-key]'), null, {timeout: 8000});
  await page.click('#opBody tr[data-op-key="a"]');
  await page.waitForSelector('#sepMateriaisBody tr[data-lote-key]');
  await page.selectOption('#sepDestino', 'FAB-1');
  return {page, errors, context};
}
const linha = (page, loteKey) => page.locator('#sepMateriaisBody tr[data-lote-key="' + loteKey + '"]');
const conclusao = (page) => page.evaluate(() => (window.__writes.filter((w) => /separacaoConcluida$/.test(w.path)).pop() || {}).v || null);

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  try {
    // ── 1. Indica o que vence primeiro; seguir o FEFO não pede motivo ─────
    let {page, errors, context} = await abrir(browser);
    const ordem = await page.locator('#sepMateriaisBody tr[data-lote-key]').evaluateAll((trs) => trs.map((t) => t.getAttribute('data-lote-key')));
    ok(JSON.stringify(ordem) === JSON.stringify(['B', 'A']), 'dois lotes da tampa com validades diferentes: indica primeiro o B (vence 31/03/2027), depois o A');
    ok(/FEFO/.test(await linha(page, 'B').innerText()) && await linha(page, 'B').locator('.sep-qtd').inputValue() === '400' && await linha(page, 'A').locator('.sep-qtd').inputValue() === '100',
      'B inteiro (400) com o selo FEFO, resto (100) do A');
    const opcoes = await page.locator('.sep-outro-sel option').evaluateAll((os) => os.map((o) => o.value));
    ok(opcoes.includes('D') && !opcoes.includes('P'), '"+ Usar outro lote" oferece o D; o lote de outro cliente (P) não aparece');
    ok(!(await page.locator('tr[data-mp-fora="TP-1"]').isVisible()), 'seguindo o FEFO, sem pedido de motivo');
    await page.screenshot({path: path.join(ART, 'fefo01-indicado-desktop-claro.png'), fullPage: true});
    await page.click('#btnConfirmarSeparacao');
    await page.waitForFunction(() => window.__writes.some((w) => /separacaoConcluida$/.test(w.path)));
    const c1 = await conclusao(page);
    ok(c1 && !c1.foraFefo && c1.itens['TP-1'] === 500, 'confirmou no FEFO: 500 separados, sem registro de fora do FEFO');
    ok(!errors.length, 'sem erro de JS (FEFO seguido): ' + errors.join(' | '));
    await context.close();

    // ── 2. Tirar só do A (vence depois): pede motivo ──────────────────────
    ({page, errors, context} = await abrir(browser));
    await linha(page, 'B').locator('.sep-qtd').fill('0');
    await linha(page, 'A').locator('.sep-qtd').fill('500');
    await page.waitForSelector('tr[data-mp-fora="TP-1"]', {state: 'visible'});
    ok(/o FEFO indica L-B \(400\), L-A \(100\)/.test(await page.locator('tr[data-mp-fora="TP-1"]').innerText()), 'fora do FEFO: a tela diz o que o FEFO indicava');
    await page.click('#btnConfirmarSeparacao');
    await page.waitForFunction(() => /informe o motivo/.test(document.getElementById('alertBox').textContent));
    ok(!(await conclusao(page)) && !(await page.evaluate(() => window.__writes.some((w) => w.op === 'transaction'))), 'sem motivo: recusa e não move nada');
    await page.fill('.sep-motivo[data-mp="TP-1"]', 'Lote B está atrás de paletes, sem empilhadeira');
    await page.screenshot({path: path.join(ART, 'fefo01-fora-motivo-desktop-claro.png'), fullPage: true});
    await page.click('#btnConfirmarSeparacao');
    await page.waitForFunction(() => window.__writes.some((w) => /separacaoConcluida$/.test(w.path)));
    const c2 = await conclusao(page);
    ok(c2.foraFefo && c2.foraFefo['TP-1'].motivoForaFefo === 'Lote B está atrás de paletes, sem empilhadeira', 'com motivo: separa e grava o motivo na OP');
    ok(JSON.stringify(c2.foraFefo['TP-1'].indicado.map((x) => [x.loteKey, x.qtd])) === '[["B",400],["A",100]]' &&
      JSON.stringify(c2.foraFefo['TP-1'].usado) === '[{"loteKey":"A","qtd":500}]', 'registro guarda o indicado (B 400, A 100) e o usado (A 500)');
    ok(!errors.length, 'sem erro de JS (fora do FEFO): ' + errors.join(' | '));
    await context.close();

    // ── 3. "+ Usar outro lote" ────────────────────────────────────────────
    ({page, errors, context} = await abrir(browser));
    await page.selectOption('.sep-outro-sel[data-mp="TP-1"]', 'D');
    await page.waitForSelector('#sepMateriaisBody tr[data-lote-key="D"]');
    await linha(page, 'A').locator('.sep-qtd').fill('0');
    await linha(page, 'D').locator('.sep-qtd').fill('100');
    await page.waitForSelector('tr[data-mp-fora="TP-1"]', {state: 'visible'});
    ok(/outro lote/.test(await linha(page, 'D').innerText()), 'lote escolhido entra como "outro lote"');
    await page.fill('.sep-motivo[data-mp="TP-1"]', 'Cliente pediu a tampa do lote D');
    await page.click('#btnConfirmarSeparacao');
    await page.waitForFunction(() => window.__writes.some((w) => /separacaoConcluida$/.test(w.path)));
    const c3 = await conclusao(page);
    ok(JSON.stringify(c3.foraFefo['TP-1'].usado) === '[{"loteKey":"B","qtd":400},{"loteKey":"D","qtd":100}]', 'outro lote com motivo: usado B 400 + D 100');
    ok(!errors.length, 'sem erro de JS (outro lote): ' + errors.join(' | '));
    await context.close();

    // ── 4. Prints: escuro e 390 px ────────────────────────────────────────
    for (const [vp, tema, nome] of [[{width: 1400, height: 1000}, 'dark', 'desktop-escuro'], [{width: 390, height: 844}, 'light', '390-claro'], [{width: 390, height: 844}, 'dark', '390-escuro']]) {
      ({page, errors, context} = await abrir(browser, vp, tema));
      await linha(page, 'B').locator('.sep-qtd').fill('0');
      await linha(page, 'A').locator('.sep-qtd').fill('500');
      await page.waitForSelector('tr[data-mp-fora="TP-1"]', {state: 'visible'});
      await page.locator('#painelSeparacao').scrollIntoViewIfNeeded();
      await page.screenshot({path: path.join(ART, 'fefo01-fora-motivo-' + nome + '.png'), fullPage: true});
      const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      console.log('     ' + nome + ': largura da página ' + w[0] + ' / janela ' + w[1]);
      ok(!errors.length, nome + ': sem erro de JS: ' + errors.join(' | '));
      await context.close();
    }
    console.log(`OK FEFO da embalagem (tela): ${n} verificações; prints em scripts/artifacts/fin-op/`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
