'use strict';
/* OP-01 e OP-02 (reunião 28/10), telas de verdade:
   - chave config/emitirOp/bloquearSemSaldo DESLIGADA: emite como hoje, mesmo faltando insumo;
   - LIGADA: o PCP é barrado com item, necessário e saldo; o ADM libera com motivo gravado na OP;
   - material de cliente: o saldo de um cliente não serve à OP de outro (dono pelo SKU);
   - "Substituir material" mostra o saldo de cada opção, com o aviso do Dia D quando desligada;
   - Ajustes / Config: só o ADM liga a chave.
   Firebase simulado em memória (mesmo desenho do run_fluxo_ponta_a_ponta_test.js).
   Prints em scripts/artifacts/fin-op/. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ART = path.join(__dirname, 'scripts', 'artifacts', 'fin-op');
fs.mkdirSync(ART, {recursive: true});

function banco(o) {
  const opt = o || {};
  return {
    usuarios: {u1: {nome: 'Gustavo', email: 'adm@kuryos.com', role: 'admin', modulos: opt.modulos || null}},
    config: Object.assign({linhas: ['Linha 1'], planejamento: {diasSemana: [1, 2, 3, 4, 5], feriados: {}}}, opt.chave == null ? {} : {emitirOp: {bloquearSemSaldo: opt.chave}}),
    clientes: {MISSROSE: {nome: 'MISS RÔSE'}, OUTRO: {nome: 'OUTRO CLIENTE'}},
    produtos: {
      MRARBS04: {sku: 'MRARBS04', descricao: 'BODY SPLASH NÉCTAR', cliente: 'MISS RÔSE', clienteKey: 'MISSROSE', densidadeGranel: 1, prazoValidadeMeses: 36,
        unCx: 24, kgCaixa: 5.2, volume: 200, unidadeVolume: 'ml', overfillPct: 0, perdaProcessoPct: 0, ean13: '7899999000012'},
    },
    materiais: {
      'MPGR-001': {mpCodigo: 'MPGR-001', mpNome: 'ÁGUA DEIONIZADA', tipo: 'MPGR', unidade: 'kg', controlaEstoque: false},
      'MPGR-002': {mpCodigo: 'MPGR-002', mpNome: 'FRAGRÂNCIA NÉCTAR', tipo: 'MPGR', unidade: 'kg'},
      'EP-00106': {mpCodigo: 'EP-00106', mpNome: 'FRASCO 200ML', tipo: 'EP', unidade: 'un'},
      'EP-00200': {mpCodigo: 'EP-00200', mpNome: 'TAMPA 24/410', tipo: 'EP', unidade: 'un'},
      'EP-00201': {mpCodigo: 'EP-00201', mpNome: 'TAMPA 24/410 PRETA', tipo: 'EP', unidade: 'un'},
      'EP-00202': {mpCodigo: 'EP-00202', mpNome: 'TAMPA 24/410 BRANCA', tipo: 'EP', unidade: 'un'},
    },
    formulas: {MRARBS04__v1: {codProduto: 'MRARBS04', versao: 'v1', status: 'APROVADA', somaPercentual: 100,
      itens: {i1: {mpCodigo: 'MPGR-001', mpNome: 'ÁGUA', fase: 'A', ordemAdicao: 1, percentualMM: 90},
        i2: {mpCodigo: 'MPGR-002', mpNome: 'FRAGRÂNCIA', fase: 'B', ordemAdicao: 2, percentualMM: 10}}}},
    bom: {MRARBS04__v1: {codProduto: 'MRARBS04', versao: 'v1', status: 'APROVADA',
      itens: {b1: {materialCodigo: 'EP-00106', materialNome: 'FRASCO 200ML', qtdPorPeca: 1, posicao: 1},
        b2: {materialCodigo: 'EP-00200', materialNome: 'TAMPA 24/410', qtdPorPeca: 1, posicao: 2}}}},
    especificacoes: {MRARBS04__v1: {codProduto: 'MRARBS04', versao: 'v1', status: 'APROVADA', itens: {e1: {ensaio: 'ASPECTO', especificacaoTexto: 'LÍQUIDO'}}}},
    estoque: opt.estoque || {
      'MPGR-002': {saldoAtual: 500, unidade: 'kg'},
      // 1.500 frascos: 1.200 da MISS RÔSE (cliente do SKU) e 300 da Kuryos.
      'EP-00106': {saldoAtual: 1500, unidade: 'un', porCliente: {MISSROSE: {saldoAtual: 1200}}},
      'EP-00200': {saldoAtual: 200, unidade: 'un'},
      'EP-00201': {saldoAtual: 5000, unidade: 'un', porCliente: {OUTRO: {saldoAtual: 5000}}},
      'EP-00202': {saldoAtual: 3000, unidade: 'un'},
    },
    pedidos: {}, alocacoes_planejamento: {}, ops: {}, pendencias_setor: {},
  };
}

async function abrirTela(browser, pagina, dados, papel, viewport, tema) {
  const page = await browser.newPage({viewport: viewport || {width: 1400, height: 1000}});
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(({data, papel, tema}) => {
    try { localStorage.setItem('kuryos-theme', tema || 'light'); } catch (e) { /* sem storage: tema automático */ }
    const db = data;
    db.usuarios.u1.role = papel;
    window.__db = db;
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => (String(p).replace(/^\//, '') === '.info/connected' ? true : partes(p).reduce((x, k) => (x == null ? undefined : x[k]), db));
    const gravar = (p, v) => {
      const ks = partes(p); let x = db;
      ks.slice(0, -1).forEach((k) => { if (x[k] == null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; });
      if (v === null || v === undefined) delete x[ks[ks.length - 1]]; else x[ks[ks.length - 1]] = structuredClone(v);
    };
    let seq = 0;
    window.firebase = {
      apps: [], // admin.html confere firebase.apps antes de inicializar
      initializeApp() {},
      auth() { return {currentUser: {uid: 'u1', email: 'adm@kuryos.com'}, onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'adm@kuryos.com', displayName: 'Gustavo'}), 0); }, signOut() { return Promise.resolve(); }}; },
      functions() { return {httpsCallable() { return () => Promise.resolve({data: {ok: true}}); }}; },
      storage() { return {ref() { return {getDownloadURL: () => Promise.resolve('')}; }}; },
      database() {
        const ref = (p) => {
          const valor = () => { const v = ler(p); return v === undefined ? null : structuredClone(v); };
          const snap = () => { const v = valor(); return {val: () => v, exists: () => v !== null, key: partes(p).pop(), forEach(cb) { Object.entries(v || {}).forEach(([k, x]) => cb({key: k, val: () => x})); }}; };
          return {path: p, key: partes(p).pop(), child(c) { return ref(p + '/' + c); },
            once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); },
            on(ev, cb) { setTimeout(() => cb(snap()), 0); return cb; }, off() {},
            orderByChild() { return this; }, orderByKey() { return this; }, equalTo() { return this; }, limitToLast() { return this; }, startAt() { return this; },
            push(v) { seq++; const f = ref(p + '/-F' + seq); if (v === undefined) return f; gravar(f.path, v); const pr = Promise.resolve(f); pr.key = f.key; return pr; },
            set(v) { gravar(p, v); return Promise.resolve(); },
            update(o) { Object.entries(o).forEach(([k, v]) => gravar(p + '/' + k, v)); return Promise.resolve(); },
            remove() { gravar(p, null); return Promise.resolve(); },
            transaction(fn) { const r = fn(valor()); if (r !== undefined) gravar(p, r); return Promise.resolve({committed: r !== undefined, snapshot: snap()}); }};
        };
        return {ref: (x) => ref(x || '')};
      },
    };
  }, {data: dados, papel, tema});
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'op.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = path.join(__dirname, 'public', url.pathname.slice(1));
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
  await page.goto('https://op.test/' + pagina);
  await page.waitForFunction(() => window.currentUser && window.currentUser.role);
  return {page, erros};
}

// Produto + 1.000 peças até o card de emissão.
async function dimensionar(page) {
  await page.fill('#fProdutoBusca', 'MRARBS04');
  await page.locator('#produtoResultados').getByText('MRARBS04', {exact: false}).first().click();
  await page.waitForSelector('#cardDimensionamento', {state: 'visible', timeout: 6000});
  await page.check('input[name=modoQtd][value=pecas]');
  await page.fill('#fPecasDesejadas', '1000');
  await page.locator('#fPecasDesejadas').dispatchEvent('change');
  await page.waitForSelector('#cardEmissao', {state: 'visible', timeout: 6000});
}
const ops = (page) => page.evaluate(() => Object.values(window.__db.ops || {}));

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  const semErro = (erros, onde) => ok(!erros.length, onde + ': sem erro de JS no console' + (erros.length ? ' — ' + erros.join(' | ') : ''));
  try {
    // ── 1. Chave desligada (padrão): emite como hoje, mesmo faltando tampa ──
    let {page, erros} = await abrirTela(browser, 'emitir_op.html', banco({chave: null}), 'pcp');
    await dimensionar(page);
    ok(/Dia D/.test(await page.locator('#hintSaldoEmissao').innerText()), 'desligada: a tabela avisa que o saldo não é confiável (Dia D)');
    const linhaFrasco = await page.locator('#materiaisBody tr', {hasText: 'EP-00106'}).innerText();
    ok(/1\.500 un/.test(linhaFrasco), 'coluna Estoque: frasco 1.500 un (geral 300 + 1.200 da MISS RÔSE, cliente do SKU)');
    // OP-02: modal Substituir com o saldo de cada opção.
    await page.locator('#materiaisBody tr', {hasText: 'EP-00200'}).locator('.subst-btn').click();
    await page.waitForSelector('#substModalBg.open');
    const optPreta = await page.locator('#substLista .subst-opt[data-codigo="EP-00201"]').innerText();
    const optBranca = await page.locator('#substLista .subst-opt[data-codigo="EP-00202"]').innerText();
    const optAtual = await page.locator('#substLista .subst-opt[data-codigo="EP-00200"]').innerText();
    ok(/Saldo: 0 un/.test(optPreta), 'Substituir: tampa preta mostra 0 un (os 5.000 são de OUTRO cliente)');
    ok(/Saldo: 3\.000 un/.test(optBranca), 'Substituir: tampa branca mostra 3.000 un');
    ok(/Saldo: 200 un/.test(optAtual), 'Substituir: a atual mostra 200 un');
    ok(await page.locator('[data-testid="subst-aviso-dia-d"]').count() === 1, 'Substituir com a chave desligada: aviso "saldo ainda não confiável (Dia D)"');
    await page.screenshot({path: path.join(ART, 'op02-substituir-saldo-desktop-claro.png')});
    await page.click('#substModalCancelBtn');
    await page.click('#btnEmitir');
    await page.waitForFunction(() => Object.keys(window.__db.ops || {}).length > 0, null, {timeout: 8000});
    const op1 = (await ops(page))[0];
    ok(op1 && !op1.liberacaoSemSaldo, 'desligada: OP emitida mesmo com tampa faltando, sem liberação');
    semErro(erros, 'chave desligada');
    await page.close();

    // ── 2. Chave ligada, PCP: barrado com item/necessário/saldo ───────────
    ({page, erros} = await abrirTela(browser, 'emitir_op.html', banco({chave: true}), 'pcp'));
    await dimensionar(page);
    ok(/LIGADA/.test(await page.locator('#hintSaldoEmissao').innerText()), 'ligada: a tabela diz que a trava está ligada');
    await page.click('#btnEmitir');
    await page.waitForSelector('[data-testid="saldo-bloqueio"]', {state: 'visible'});
    const bloq = await page.locator('[data-testid="saldo-bloqueio"]').innerText();
    ok(/EP-00200[\s\S]*1\.000 un[\s\S]*200 un/.test(bloq), 'ligada, PCP: lista a tampa — necessário 1.000 un, saldo 200 un');
    ok(!/EP-00106/.test(bloq) && !/MPGR-001/.test(bloq), 'frasco do cliente do SKU conta; água sem controle de estoque fica fora');
    ok(await page.locator('#motivoLiberacaoSaldo').count() === 0 && /administrador/.test(bloq), 'PCP não tem campo de liberação: pede ao administrador');
    ok((await ops(page)).length === 0, 'ligada, PCP: nenhuma OP gravada');
    await page.locator('[data-testid="saldo-bloqueio"]').scrollIntoViewIfNeeded();
    await page.screenshot({path: path.join(ART, 'op01-bloqueio-pcp-desktop-claro.png'), fullPage: true});
    semErro(erros, 'ligada PCP');
    await page.close();

    // ── 3. Chave ligada, ADM: libera com motivo gravado na OP ─────────────
    ({page, erros} = await abrirTela(browser, 'emitir_op.html', banco({chave: true}), 'admin'));
    await dimensionar(page);
    await page.click('#btnEmitir');
    await page.waitForSelector('#motivoLiberacaoSaldo');
    await page.fill('#motivoLiberacaoSaldo', 'curto');
    await page.click('#btnLiberarEmitir');
    await page.waitForFunction(() => /mínimo 10/.test(document.getElementById('saldoBloqueio').innerText));
    ok((await ops(page)).length === 0, 'ADM com motivo curto: recusa, nada gravado');
    await page.fill('#motivoLiberacaoSaldo', 'Tampa chega amanhã cedo, NF 4521');
    await page.screenshot({path: path.join(ART, 'op01-liberacao-adm-desktop-claro.png'), fullPage: true});
    await page.click('#btnLiberarEmitir');
    await page.waitForFunction(() => Object.keys(window.__db.ops || {}).length > 0, null, {timeout: 8000});
    const op3 = (await ops(page))[0];
    ok(op3.liberacaoSemSaldo && op3.liberacaoSemSaldo.motivo === 'Tampa chega amanhã cedo, NF 4521' && op3.liberacaoSemSaldo.porUid === 'u1',
      'ADM: OP emitida com motivo, quem (uid) e quando gravados');
    ok(JSON.stringify(op3.liberacaoSemSaldo.faltas) === JSON.stringify([{mpCodigo: 'EP-00200', necessario: 1000, saldo: 200, unidade: 'un'}]), 'a OP guarda o que faltava');
    semErro(erros, 'ligada ADM');
    await page.close();

    // ── 4. Material de cliente: o frasco é de OUTRO cliente -> barra ───────
    const estoqueOutro = {
      'MPGR-002': {saldoAtual: 500, unidade: 'kg'},
      'EP-00106': {saldoAtual: 1500, unidade: 'un', porCliente: {OUTRO: {saldoAtual: 1200}}},
      'EP-00200': {saldoAtual: 2000, unidade: 'un'},
    };
    ({page, erros} = await abrirTela(browser, 'emitir_op.html', banco({chave: true, estoque: estoqueOutro}), 'pcp'));
    await dimensionar(page);
    await page.click('#btnEmitir');
    await page.waitForSelector('[data-testid="saldo-bloqueio"]', {state: 'visible'});
    const bloq4 = await page.locator('[data-testid="saldo-bloqueio"]').innerText();
    ok(/EP-00106[\s\S]*1\.000 un[\s\S]*300 un/.test(bloq4), 'frasco de OUTRO cliente não serve: saldo 300 un (só o geral)');
    ok((await ops(page)).length === 0, 'material de outro cliente: OP não sai');
    semErro(erros, 'material de outro cliente');
    await page.close();
    // Mesmo estoque, mas os 1.200 são da MISS RÔSE (cliente do SKU): sai.
    const estoqueDono = JSON.parse(JSON.stringify(estoqueOutro));
    estoqueDono['EP-00106'].porCliente = {MISSROSE: {saldoAtual: 1200}};
    ({page, erros} = await abrirTela(browser, 'emitir_op.html', banco({chave: true, estoque: estoqueDono}), 'pcp'));
    await dimensionar(page);
    await page.click('#btnEmitir');
    await page.waitForFunction(() => Object.keys(window.__db.ops || {}).length > 0, null, {timeout: 8000});
    ok(!(await ops(page))[0].liberacaoSemSaldo, 'frasco do próprio cliente do SKU: OP sai sem liberação');
    semErro(erros, 'material do cliente do SKU');
    await page.close();

    // ── 5. Ajustes / Config: só o ADM liga a chave ─────────────────────────
    ({page, erros} = await abrirTela(browser, 'admin.html', banco({chave: null}), 'admin'));
    await page.waitForSelector('#iBloquearSemSaldo');
    ok(!(await page.isChecked('#iBloquearSemSaldo')), 'Ajustes: chave nasce desligada');
    await page.check('#iBloquearSemSaldo');
    await page.waitForFunction(() => ((window.__db.config || {}).emitirOp || {}).bloquearSemSaldo === true);
    ok(true, 'Ajustes: ADM liga a chave (config/emitirOp/bloquearSemSaldo = true)');
    await page.locator('#iBloquearSemSaldo').scrollIntoViewIfNeeded();
    await page.screenshot({path: path.join(ART, 'op01-ajustes-chave-desktop-claro.png')});
    semErro(erros.filter((e) => !/turno|planejamento/i.test(e)), 'Ajustes (ADM)');
    await page.close();
    ({page, erros} = await abrirTela(browser, 'admin.html', banco({chave: null, modulos: {config: true}}), 'gestor'));
    await page.waitForSelector('#iBloquearSemSaldo');
    await page.waitForFunction(() => document.getElementById('iBloquearSemSaldo').disabled);
    ok(true, 'Ajustes: quem não é ADM vê a chave desabilitada');
    await page.close();

    // ── 6. Prints: escuro e 390 px, sem rolagem horizontal ─────────────────
    for (const [vp, tema, nome] of [[{width: 1400, height: 1000}, 'dark', 'desktop-escuro'], [{width: 390, height: 844}, 'light', '390-claro'], [{width: 390, height: 844}, 'dark', '390-escuro']]) {
      ({page, erros} = await abrirTela(browser, 'emitir_op.html', banco({chave: null}), 'pcp', vp, tema));
      await dimensionar(page);
      await page.locator('#materiaisBody tr', {hasText: 'EP-00200'}).locator('.subst-btn').click();
      await page.waitForSelector('#substModalBg.open');
      await page.screenshot({path: path.join(ART, 'op02-substituir-saldo-' + nome + '.png')});
      await page.click('#substModalCancelBtn');
      await page.evaluate(() => { configEmitirOp = {bloquearSemSaldo: true}; renderMateriaisTable(); });
      await page.click('#btnEmitir');
      await page.waitForSelector('[data-testid="saldo-bloqueio"]', {state: 'visible'});
      await page.locator('[data-testid="saldo-bloqueio"]').scrollIntoViewIfNeeded();
      await page.screenshot({path: path.join(ART, 'op01-bloqueio-pcp-' + nome + '.png')});
      const largura = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      console.log('     ' + nome + ': largura da página ' + largura[0] + ' / janela ' + largura[1]);
      ok(largura[0] <= largura[1] + 1, nome + ': página sem rolagem horizontal');
      ok(await page.evaluate(() => {
        const wrap = document.querySelector('#cardMateriais .table-scroll');
        return window.innerWidth > 600 || (wrap.scrollWidth > wrap.clientWidth && wrap.getBoundingClientRect().right <= window.innerWidth + 1);
      }), nome + ': tabela larga rola dentro do cartão, sem alargar a página');
      ok(await page.evaluate(() => document.getElementById('saldoBloqueio').scrollWidth <= document.getElementById('saldoBloqueio').clientWidth + 1), nome + ': o quadro de saldo cabe na largura');
      semErro(erros, nome);
      await page.close();
    }
    console.log(`OK emitir OP com saldo (tela): ${n} verificações; prints em scripts/artifacts/fin-op/`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
