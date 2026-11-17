'use strict';
/* Botão "Abrir retrabalho" da Qualidade na tela de Retrabalhos (16/11/2026).

   Pedido do usuário: "Criar botão de retrabalho para Qualidade". Antes, a
   OP de retrabalho só abria pelo ♻️ do Controle de OPs, tela que a
   Qualidade não usa. A regra de ops/$opKey já deixava a Qualidade criar OP
   nova com tipoOrdem RETRABALHO; faltava a tela.

   O teste garante:
   - a Qualidade vê o botão, busca a OP de origem e abre o retrabalho;
   - a OP gravada é a mesma do ♻️ (lote + RT, sem pedido e sem BOM);
   - OP cancelada e OP que já é retrabalho não aparecem na busca;
   - validação e "já existe" aparecem no modal, sem gravar nada.

   Tela real com utils.js, retrabalho-op.js e auth_check.js reais; Firebase
   simulado com transaction, para conferir o que seria gravado. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function base() {
  return {
    usuarios: {u1: {nome: 'Roberta Ramos', email: 'qualidade@kuryos.com', role: 'qualidade'}},
    config: {linhas: ['Linha 1', 'Linha 2'], rotulagem: ['Rotuladora 1'], postosTrabalho: ['Bancada A']},
    ops: {
      '26302-01': {lote: '26302/01', sku: 'PRF-BIOF-0006', produto: 'BODY SPLASH ROSE ABSOLUT', cliente: 'BIOFLORA',
        status: 'Concluído', qtdPlanejada: 690, produzidoLinha: 3470, produzido: 3470,
        skuPedidoKey: 'PED1__PRF-BIOF-0006', dataEmissao: '2026-10-29T10:00:00.000Z',
        materiaisConsumo: {a: {mpCodigo: 'EP-01', quantidade: 690, origem: 'bom'}}},
      '26300-02': {lote: '26300/02', produto: 'BRUMA MATTE CANCELADA', cliente: 'MISS RÔSE',
        status: 'Cancelado', dataEmissao: '2026-10-30T10:00:00.000Z'},
      '26216-04': {lote: '26216/04', produto: 'PERFUME TAWUS 30ML', cliente: 'DAPOP',
        status: 'Concluído', produzidoLinha: 867, produzido: 867, dataEmissao: '2026-09-01T10:00:00.000Z'},
      '26216-04-RT1': {lote: '26216/04-RT1', tipoOrdem: 'RETRABALHO', retrabalhoDe: '26216/04',
        produto: 'PERFUME TAWUS 30ML', status: 'Não Iniciado', dataEmissao: '2026-09-22T10:00:00.000Z'},
    },
    retrabalhos: {},
  };
}

async function abrir(browser, data, papel) {
  const page = await browser.newPage({viewport: {width: 1400, height: 1000}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(({data, role}) => {
    const db = data;
    db.usuarios.u1.role = role;
    window.__db = db;
    window.__gravacoes = [];
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const ouvintes = [];
    const gravar = (p, v) => {
      const ks = partes(p);
      let o = db;
      ks.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; });
      o[ks[ks.length - 1]] = v;
      window.__gravacoes.push({path: p, valor: structuredClone(v)});
      ouvintes.forEach((f) => f());
    };
    window.firebase = {
      initializeApp() {},
      auth() {
        return {currentUser: {uid: 'u1', email: 'qualidade@kuryos.com'},
          onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'qualidade@kuryos.com', displayName: 'Roberta'}), 0); },
          signOut() { return Promise.resolve(); }};
      },
      functions() { return {httpsCallable(nome) { return (payload) => { (window.__chamadas = window.__chamadas || []).push({nome, payload}); return Promise.resolve({data: {}}); }; }}; },
      database() {
        const ref = (path) => {
          const valor = () => { const v = ler(path); return v === undefined ? null : structuredClone(v); };
          const snap = () => { const v = valor(); return {val: () => v, exists: () => v !== null, key: partes(path).pop()}; };
          return {path, key: partes(path).pop(),
            once(ev, cb) { const sn = snap(); if (cb) cb(sn); return Promise.resolve(sn); },
            on(ev, cb) { setTimeout(() => cb(snap()), 0); ouvintes.push(() => cb(snap())); return cb; },
            off() {}, child(c) { return ref(path + '/' + c); },
            // Como o SDK: o callback recebe o valor atual; undefined aborta.
            transaction(fn) {
              const novo = fn(valor());
              if (novo === undefined) return Promise.resolve({committed: false, snapshot: snap()});
              gravar(path, novo);
              return Promise.resolve({committed: true, snapshot: snap()});
            }};
        };
        return {ref: (p) => ref(p || '')};
      },
    };
  }, {data, role: papel});
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'rt.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file),
      contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://rt.test/retrabalhos.html');
  await page.waitForSelector('.rt-card', {timeout: 8000});
  return {page, errors};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const {page, errors} = await abrir(browser, base(), 'qualidade');

    // ── 1. A Qualidade vê o botão ──────────────────────────────────────
    await page.waitForSelector('#rtAbrirNovo', {state: 'visible', timeout: 5000});
    await page.click('#rtAbrirNovo');
    await page.waitForSelector('#rtNovoBg.open');
    assert.equal(await page.locator('#rtNovoConfirmar').isDisabled(), true, 'sem OP escolhida não confirma');

    // ── 2. Busca: sem cancelada e sem retrabalho ───────────────────────
    const lista = await page.locator('#rtNovoCandidatas').innerText();
    assert.match(lista, /26302\/01/);
    assert.match(lista, /26216\/04/);
    assert.doesNotMatch(lista, /CANCELADA/, 'OP cancelada não aparece');
    assert.doesNotMatch(lista, /RT1/, 'OP que já é retrabalho não aparece');
    await page.fill('#rtNovoBusca', 'biof-0006');
    assert.equal(await page.locator('.rt-busca-item').count(), 1, 'busca por SKU');
    if (process.env.RT_SCREENSHOT) await page.screenshot({path: process.env.RT_SCREENSHOT});
    await page.click('.rt-busca-item[data-op="26302-01"]');

    // ── 3. Formulário: mesmo do ♻️ ────────────────────────────────────
    const info = await page.locator('#rtNovoInfo').innerText();
    assert.match(info, /BODY SPLASH ROSE ABSOLUT/);
    assert.match(info, /A nova OP será 26302\/01-RT1/);
    assert.equal(await page.inputValue('#rtNovoQtd'), '3470', 'sugere o produzido');
    assert.deepEqual(await page.locator('#rtNovoDestinoNome option').allInnerTexts(), ['Linha 1', 'Linha 2']);
    await page.selectOption('#rtNovoDestinoTipo', 'posto');
    assert.deepEqual(await page.locator('#rtNovoDestinoNome option').allInnerTexts(), ['Bancada A'], 'postos da config');

    // Sem motivo: erro no modal, nada gravado.
    await page.click('#rtNovoConfirmar');
    assert.match(await page.locator('#rtNovoErro').innerText(), /motivo/i);
    assert.equal((await page.evaluate(() => window.__gravacoes)).length, 0);

    await page.fill('#rtNovoMotivo', 'Granel do Sunrise envasado como Rose; segregar e reclassificar.');
    await page.fill('#rtNovoQtd', '3470');
    if (process.env.RT_SCREENSHOT2) await page.screenshot({path: process.env.RT_SCREENSHOT2});
    await page.click('#rtNovoConfirmar');
    await page.waitForFunction(() => window.__gravacoes.length > 0);
    const [g] = await page.evaluate(() => window.__gravacoes);
    assert.equal(g.valor.lote, '26302/01-RT1');
    assert.equal(g.valor.tipoOrdem, 'RETRABALHO', 'a regra só deixa a Qualidade criar com este tipo');
    assert.equal(g.valor.retrabalhoDe, '26302/01');
    assert.equal(g.valor.retrabalhoDeOpKey, '26302-01');
    assert.equal(g.valor.skuPedidoKey, '', 'não credita pedido');
    assert.deepEqual(g.valor.materiaisConsumo, {}, 'não baixa BOM');
    assert.equal(g.valor.linha, 'Bancada A');
    assert.equal(g.valor.retrabalhoDestino, 'posto');
    assert.equal(g.valor.qtdPlanejada, 3470);
    assert.equal(g.valor.emitidoPor, 'Roberta Ramos');
    assert.ok(g.path.startsWith('ops/'), 'grava em ops/');
    await page.waitForSelector('#rtNovoBg', {state: 'hidden'});
    // A OP original não foi tocada.
    const orig = await page.evaluate(() => window.__db.ops['26302-01']);
    assert.equal(orig.produzido, 3470);
    assert.equal(orig.skuPedidoKey, 'PED1__PRF-BIOF-0006');
    // A nova OP aparece na lista da própria tela.
    await page.waitForFunction(() => /26302\/01-RT1/.test(document.getElementById('rtOpsLista').innerText));

    // ── 4. Já existe: não grava por cima ──────────────────────────────
    await page.click('#rtAbrirNovo');
    await page.fill('#rtNovoBusca', '26302');
    await page.click('.rt-busca-item[data-op="26302-01"]');
    assert.match(await page.locator('#rtNovoInfo').innerText(), /26302\/01-RT2/, 'segundo retrabalho vira RT2');
    await page.evaluate(() => { window.__db.ops['26302-01-RT2'] = {lote: '26302/01-RT2', tipoOrdem: 'RETRABALHO'}; });
    await page.fill('#rtNovoMotivo', 'Outro motivo');
    await page.click('#rtNovoConfirmar');
    await page.waitForFunction(() => /já existe/.test(document.getElementById('rtNovoErro').innerText));
    assert.equal((await page.evaluate(() => window.__gravacoes)).length, 1, 'nada gravado por cima');

    // ── 5. Encerrar o retrabalho (16/11/2026: "como eu faço para concluir?")
    await page.click('#rtNovoCancelar');
    const cartao = page.locator('.rt-card', {hasText: '26302/01-RT1'});
    await cartao.locator('[data-rt-acao="encerrar"]').click();
    await page.waitForSelector('#rtEncBg.open');
    assert.match(await page.locator('#rtEncInfo').innerText(), /Retrabalho de 26302\/01/);
    // Sem preencher: a validação do motor aparece, nada é enviado.
    await page.click('#rtEncConfirmar');
    assert.match(await page.locator('#rtEncErro').innerText(), /quem executou/);
    assert.equal(await page.evaluate(() => (window.__chamadas || []).length), 0, 'nada enviado');
    await page.fill('#encInicio', '2026-11-14T08:00');
    assert.equal(await page.locator('#rtEncErro').isVisible(), false, 'mexeu no formulário: o erro velho sai');
    await page.fill('#encFim', '2026-11-14T17:30');
    await page.fill('#encExecutores', 'Equipe Linha 1');
    await page.fill('#encQtd', '3470');
    await page.fill('#encAprov', '3425');
    await page.fill('#encReprov', '45');
    assert.match(await page.locator('#encFecha').innerText(), /Fecha: 3\.425 aprovadas \+ 45 reprovadas = 3\.470/);
    assert.equal(await page.locator('#encDestinoBox').isVisible(), true, 'com reprovadas, pede o destino');
    await page.selectOption('#encDestino', 'DESCARTE');
    await page.fill('#encPerdas [data-perda="material"]', 'VÁLVULA');
    await page.fill('#encPerdas [data-perda="quantidade"]', '120');
    await page.click('#encMaisPerda');
    assert.equal(await page.locator('#encPerdas .enc-perda').count(), 2);
    await page.fill('#encInspecao', 'Análise sensorial 100%');
    await page.selectOption('#encDecisao', 'LIBERADO_COM_RESTRICAO');
    assert.equal(await page.locator('#encRestricaoBox').isVisible(), true);
    await page.fill('#encRestricao', 'Confirmar granel antes do despacho');
    await page.fill('#encAnalise', 'Segregação sensorial; Sunrise reenvasado no frasco certo.');
    await page.fill('#encRnc', 'RNC-2026-011');
    if (process.env.RT_SCREENSHOT3) await page.screenshot({path: process.env.RT_SCREENSHOT3, fullPage: true});
    await page.click('#rtEncConfirmar');
    await page.waitForFunction(() => (window.__chamadas || []).some((c) => c.payload && c.payload.acao === 'encerrar_op'));
    const enc = (await page.evaluate(() => window.__chamadas)).find((c) => c.payload.acao === 'encerrar_op');
    assert.equal(enc.nome, 'apontarRetrabalho', 'mesma callable do retrabalho, sem função nova no servidor');
    assert.equal(enc.payload.opKey, '26302-01-RT1');
    assert.match(enc.payload.operacaoId, /^rto_/);
    assert.equal(enc.payload.dados.qtdAprovada, '3425');
    assert.equal(enc.payload.dados.destinoReprovadas, 'DESCARTE');
    assert.equal(enc.payload.dados.perdas[0].material, 'VÁLVULA');
    assert.equal(enc.payload.dados.rncVinculada, 'RNC-2026-011');
    await page.waitForSelector('#rtEncBg', {state: 'hidden'});
    // O servidor grava; a lista mostra o resultado e tira o botão.
    await page.evaluate(() => firebase.database().ref('ops/26302-01-RT1').transaction((op) => Object.assign({}, op, {status: 'Concluído',
      retrabalhoEncerramento: {decisao: 'LIBERADO_COM_RESTRICAO', qtdRetrabalhada: 3470, qtdAprovada: 3425, qtdReprovada: 45, destinoReprovadas: 'DESCARTE',
        perdas: [{material: 'VÁLVULA', quantidade: 120}], encerradoPor: 'Roberta Ramos', encerradoEm: '2026-11-16T18:00:00.000Z', rncVinculada: 'RNC-2026-011'}})));
    await page.evaluate(() => { filtroAtual = ''; render(); });
    await page.waitForFunction(() => /Liberado com restrição/.test(document.getElementById('rtOpsLista').innerText));
    const fim = await page.locator('.rt-card', {hasText: '26302/01-RT1'}).innerText();
    assert.match(fim, /3\.425 aprovadas, 45 reprovadas \(Descarte\)/);
    assert.equal(await page.locator('.rt-card', {hasText: '26302/01-RT1'}).locator('[data-rt-acao="encerrar"]').count(), 0, 'encerrada: sem botão de encerrar');
    assert.equal(await page.locator('.rt-card', {hasText: '26302/01-RT1'}).locator('[data-rt-acao="ficha"]').count(), 1, 'a ficha continua disponível');

    assert.deepEqual(errors, [], 'sem erro de JavaScript na tela');
    await page.close();
    console.log('run_retrabalhos_abrir_ui_test: OK — a Qualidade abre o retrabalho pela própria tela, sem pedido e sem BOM.');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
