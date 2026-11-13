'use strict';
/* Relatório de Pedido, tela de verdade (2026-09-25): relatorio_pedido.html com
   Firebase simulado.
   - abre direto pelo link ?pedido=; seletor lista por número exato;
   - cabeçalho com totais; tabela por item; clique abre os lotes;
   - perdas por tipo no item e no lote; CSV baixa com uma linha por lote;
   - impressão mostra todos os lotes; menu tem o link para PCP e Comercial;
   - celular sem rolagem horizontal da página. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {base} = require('./run_relatorio_pedido_fixture.js');

function dados(role) {
  return Object.assign({'usuarios/u1': {nome: 'PCP', email: 'p@kuryos.com', role: role || 'pcp'}, config: {}}, base());
}

async function abrir(browser, viewport, url, role) {
  const context = await browser.newContext({viewport: viewport || {width: 1400, height: 1000}, timezoneId: 'America/Sao_Paulo'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(({data}) => {
    window.__writes = [];
    window.__iniciado = false;
    const exige = (q) => { if (!window.__iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (" + q + ')'); };
    const callable = () => () => Promise.resolve({data: {}});
    window.firebase = {
      initializeApp(cfg) { if (!cfg || !cfg.databaseURL) throw new Error('sem databaseURL'); window.__iniciado = true; },
      auth() {
        exige('auth');
        return {onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'p@kuryos.com', displayName: 'PCP'}), 0); },
          signOut() { return Promise.resolve(); }, currentUser: {email: 'p@kuryos.com'}};
      },
      functions() { return {httpsCallable: callable}; },
      app() { return {functions: () => ({httpsCallable: callable})}; },
      database() {
        exige('database');
        const valor = (path) => {
          if (path in data) return data[path];
          const partes = String(path || '').split('/');
          for (let i = partes.length - 1; i > 0; i--) {
            const base = partes.slice(0, i).join('/');
            if (base in data) return partes.slice(i).reduce((o, k) => (o == null ? undefined : o[k]), data[base]);
          }
          return undefined;
        };
        const ref = (path) => {
          const snap = {val: () => (valor(path) === undefined ? null : structuredClone(valor(path))), exists: () => valor(path) !== undefined, key: String(path).split('/').pop()};
          return {path, key: 'k' + Math.random().toString(36).slice(2, 8),
            once(ev, cb) { if (cb) cb(snap); return Promise.resolve(snap); },
            on(ev, cb) { setTimeout(() => cb(snap), 0); return cb; }, off() {},
            child(p) { return ref(path + '/' + p); },
            push(v) { const caminho = path + '/k' + Math.random().toString(36).slice(2, 8); if (v !== undefined) window.__writes.push({op: 'push', path, v}); return Object.assign(ref(caminho), {then: (a, b) => Promise.resolve(ref(caminho)).then(a, b)}); },
            orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
            set(v) { window.__writes.push({op: 'set', path, v}); return Promise.resolve(); },
            update(v) { window.__writes.push({op: 'update', path: path || '/', v}); return Promise.resolve(); },
            remove() { return Promise.resolve(); },
            transaction(fn) {
              const antes = valor(path) === undefined ? null : structuredClone(valor(path));
              const v = fn(antes);
              window.__writes.push({op: 'transaction', path, v: v === undefined ? null : structuredClone(v)});
              return Promise.resolve({committed: v !== undefined, snapshot: {val: () => v, exists: () => v != null}});
            }};
        };
        return {ref, ServerValue: {TIMESTAMP: 0}};
      }
    };
  }, {data: dados(role)});
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'rel.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file),
      contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://rel.test/' + (url || 'relatorio_pedido.html'));
  await page.waitForFunction(() => window.RelatorioPedido && document.getElementById('sTxt').textContent === 'Atualizado', null, {timeout: 8000});
  return {page, errors, context};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'}).catch(() => chromium.launch({headless: true, channel: 'msedge'}));
  let n = 0;
  const ok = (nome) => { n++; console.log('ok -', nome); };
  {
    const {page: p, errors, context} = await abrir(browser, null, 'relatorio_pedido.html?pedido=0008');
    assert.equal(await p.inputValue('#selPedido'), '0008');
    // Documento: logo da Kuryos, e o título da aba vira o nome do PDF salvo.
    assert.equal(await p.title(), 'Relatório do Pedido - 0008 - MISS ROSE');
    assert.equal(await p.locator('.doc .doc-logo[src="kuryos-logo.svg"]').count(), 1, 'logo no cabeçalho do documento');
    const cab = await p.locator('.doc .ident').innerText() + '\n' + await p.locator('.doc .meta').innerText();
    assert.match(cab, /Pedido 0008[\s\S]*MISS ROSE/);
    assert.match(cab, /Nº do pedido do cliente\s+PO-77/);
    const resumo = await p.locator('.doc .resumo').innerText();
    assert.match(resumo, /Pedido\s+18\.000/);
    assert.match(resumo, /Produzido\s+16\.700\s+92,8% do pedido/);
    assert.match(resumo, /Expedido\s+12\.200/);
    assert.match(resumo, /Em estoque\s+3\.200/);
    ok('link direto abre o pedido com logo, título do PDF e totais');

    const itens = await p.locator('tr.item').allInnerTexts();
    assert.equal(itens.length, 3);
    assert.match(itens[0], /MRARBS06[\s\S]*Produção Parcial[\s\S]*10\.000[\s\S]*9\.000[\s\S]*90%[\s\S]*1\.000[\s\S]*4\.800[\s\S]*3\.200[\s\S]*2/);
    assert.match(itens[1], /MRARBS07[\s\S]*Devolvido \(estorno\): -100/);
    assert.match(itens[2], /MRARBS08[\s\S]*Encerrado/);
    assert.match(await p.locator('tr.total').innerText(), /Total do pedido[\s\S]*18\.000[\s\S]*16\.700/);
    ok('um item por linha: pedido, produzido, a produzir, expedido, estoque, lotes');

    // Perdas (12/11/2026): cada componente com a sua base e o seu %; nunca a
    // soma de frasco + rótulo + válvula sobre o produzido.
    const blocos = await p.locator('.perdas-item').allInnerTexts();
    assert.equal(blocos.length, 3);
    assert.match(blocos[0], /MRARBS06[\s\S]*Frascos\s+FRASCO PET 120ML[\s\S]*26146\/01: 24 de 5\.000 \(0,48%\)[\s\S]*EP-1\s+10\.200\s+Separado \+ empenho\s+24 un\s+0,24%/);
    assert.match(blocos[0], /Rótulos[\s\S]*ES-1\s+10\.100[\s\S]*5 un\s+0,05%/);
    assert.match(blocos[0], /Tampas\/Válvulas[\s\S]*EP-2\s+10\.000\s+Empenho\s+2 un\s+0,02%/);
    assert.match(blocos[2], /MRARBS08[\s\S]*Rótulos[\s\S]*sem base\s+12\s+—[\s\S]*Cartuchos[\s\S]*sem base\s+3\s+—/, 'Excel antigo: quantidade, sem %');
    assert.doesNotMatch(await p.locator('.doc').innerText(), /s\/ produzido/, 'nenhum % de perda sobre o produzido');
    ok('perdas por componente: base (separado/empenho), perdido e % de cada um, com o detalhe por lote');

    assert.equal(await p.locator('tr[data-lotes="0"]').isVisible(), false);
    await p.click('tr.item[data-i="0"]');
    const lotes = await p.locator('tr[data-lotes="0"]').innerText();
    assert.match(lotes, /26146\/01[\s\S]*Concluído[\s\S]*Linha 02[\s\S]*10\/09\/2026[\s\S]*5\.000[\s\S]*5\.000[\s\S]*4\.800[\s\S]*200/);
    assert.match(lotes, /26147\/01[\s\S]*3\.000/);
    assert.doesNotMatch(lotes, /26148\/01/, 'OP cancelada fora');
    assert.match(lotes, /Sem OP identificada[\s\S]*1\.000/);
    // Documento fica fora do cabeçalho congelado (tabela-fixa.js respeita
    // data-kt-sem-fixa): rolagem interna cortava a última linha das tabelas.
    assert.equal(await p.locator('.doc [data-kt-fixa-rolagem]').count(), 0);
    ok('clique no item abre os lotes, sem rolagem interna cortando linhas');

    const [download] = await Promise.all([p.waitForEvent('download'), p.click('#btnCsv')]);
    assert.equal(download.suggestedFilename(), 'relatorio-pedido-0008.csv');
    const csv = fs.readFileSync(await download.path(), 'utf8');
    assert.equal(csv.charCodeAt(0), 0xfeff, 'BOM para o Excel abrir acentos');
    assert.equal(csv.trim().split('\r\n').length, 1 + 3 + 1 + 1 + 2);
    assert.match(csv, /26146\/01;Concluído;Linha 02;5000;5000;4800;200;Frascos — FRASCO PET 120ML;EP-1;24;5000;Empenho;0,48/);
    ok('CSV baixa com uma linha por lote e componente');

    await p.emulateMedia({media: 'print'});
    assert.equal(await p.locator('tr[data-lotes="1"]').isVisible(), true, 'impressão abre todos os lotes');
    assert.equal(await p.locator('.toolbar').isVisible(), false);
    assert.equal(await p.locator('.header').isVisible(), false, 'cabeçalho da tela (e o ícone dele) não vai para o papel');
    assert.equal(await p.locator('.doc-cab').isVisible(), true, 'documento tem cabeçalho próprio com o logo');
    assert.equal(await p.locator('.doc th').first().evaluate((e) => getComputedStyle(e).textTransform), 'none', 'cabeçalho de tabela em caixa de frase também no papel');
    await p.emulateMedia({media: 'screen'});
    ok('impressão sai com todos os lotes, logo, sem a barra de busca');

    await p.fill('#busca', 'febella');
    assert.deepEqual(await p.locator('#selPedido option').allInnerTexts(), ['Selecione o pedido (1)...', '05 · FEBELLA · 30/04/2026 · 1 item · 1 em aberto']);
    await p.selectOption('#selPedido', '05');
    assert.match(page_url(p), /\?pedido=05$/);
    assert.match(await p.locator('#relatorio').innerText(), /Pedido 05[\s\S]*FEBELLA/);
    assert.equal(await p.title(), 'Relatório do Pedido - 05 - FEBELLA');
    ok('busca e troca de pedido (link e título atualizados)');

    assert.equal(await p.locator('a[href="relatorio_pedido"]').count(), 1, 'PCP: um link só no menu');
    assert.deepEqual(errors, []);
    await context.close();
  }
  {
    const {page: p, errors, context} = await abrir(browser, {width: 375, height: 812}, 'relatorio_pedido.html?pedido=0008', 'pcp');
    await p.click('tr.item[data-i="0"]');
    const largura = await p.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(largura <= 376, 'scrollWidth ' + largura);
    ok('celular sem rolagem horizontal da página');
    assert.deepEqual(errors, []);
    await context.close();
  }
  await browser.close();
  console.log(`\n${n} testes ok`);
})().catch((e) => { console.error(e); process.exit(1); });

function page_url(p) { return p.url(); }
