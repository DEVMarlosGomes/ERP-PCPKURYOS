'use strict';
/* Manter aprovação da versão anterior (19/11/2026, shared/aprovacao-herdada.js) na tela real de
   Cadastros com Firebase simulado (harness de run_trava_aprovados_ui_test.js). Caso PRF-BIOF-0008 v2. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

async function abrir(browser, estadoInicial, pagina) {
  const page = await browser.newPage({viewport: {width: 1500, height: 1100}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { (page.__dialogos = page.__dialogos || []).push(d.message()); d.accept(page.__resposta == null ? undefined : page.__resposta); });
  await page.addInitScript((data) => {
    const db = data;
    window.__db = db;
    let iniciado = false;
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const ouvintes = [];
    const notificar = (bruto) => {
      const p = partes(bruto).join('/');
      ouvintes.forEach((o) => {
        const alvo = partes(o.path).join('/');
        if (!alvo || p === alvo || p.indexOf(alvo + '/') === 0 || alvo.indexOf(p + '/') === 0) o.avisar();
      });
    };
    const gravar = (p, v) => {
      const ks = partes(p); let o = db;
      ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
      if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = structuredClone(v);
      notificar(p);
    };
    let seq = 0;
    window.firebase = {
      initializeApp(cfg) { if (!cfg || !cfg.databaseURL) throw new Error('sem databaseURL'); iniciado = true; },
      auth() {
        if (!iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (auth)");
        return {currentUser: {uid: 'u1', email: 'g@kuryos.com'},
          onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'g@kuryos.com', displayName: 'Gustavo'}), 0); },
          signOut() { return Promise.resolve(); }};
      },
      database() {
        if (!iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (database)");
        const ref = (path) => {
          const valor = () => { const v = ler(path); return v === undefined ? null : structuredClone(v); };
          const snap = () => { const v = valor(); return {val: () => v, exists: () => v !== null, key: partes(path).pop(),
            forEach(cb) { Object.entries(v || {}).forEach(([k, x]) => cb({key: k, val: () => x})); }}; };
          return {path, key: partes(path).pop(),
            once(ev, cb) { const sn = snap(); if (cb) cb(sn); return Promise.resolve(sn); },
            on(ev, cb) { const avisar = () => cb(snap()); ouvintes.push({path, avisar}); setTimeout(avisar, 0); return cb; },
            off() {}, child(c) { return ref(path + '/' + c); },
            orderByChild() { return this; }, orderByKey() { return this; }, equalTo() { return this; }, limitToLast() { return this; }, startAt() { return this; },
            push(v) {
              seq++;
              const filho = ref(path + '/-N' + seq);
              if (v === undefined) return filho;
              gravar(filho.path, v);
              const pr = Promise.resolve(filho); pr.key = filho.key; return pr;
            },
            set(v) { gravar(path, v); return Promise.resolve(); },
            update(obj) { Object.entries(obj).forEach(([k, v]) => gravar(path + '/' + k, v)); return Promise.resolve(); },
            remove() { gravar(path, null); return Promise.resolve(); },
            transaction(fn) { const r = fn(valor()); if (r !== undefined) gravar(path, r); return Promise.resolve({committed: r !== undefined, snapshot: snap()}); }};
        };
        return {ref: (p) => ref(p || '')};
      }
    };
    window.firebase.database.ServerValue = {TIMESTAMP: {'.sv': 'timestamp'}};
  }, estadoInicial || dados());
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'cad.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file),
      contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://cad.test/' + (pagina || 'cadastros.html?tab=clientes'));
  try {
    await page.waitForFunction(() => window.currentUser && window.currentUser.nome, null, {timeout: 12000});
  } catch (e) {
    console.log('DBG url', page.url(), 'erros', errors, await page.evaluate(() => [document.title, typeof window.currentUser, document.body.innerText.slice(0, 200)]));
    throw e;
  }
  return {page, errors};
}



function dados(perfil, bomV2) {
  const ap = (versao, extra) => Object.assign({codProduto: 'PRF-BIOF-0008', versao, status: 'APROVADA', dataAprovacao: '2026-11-03T14:42:50Z'}, extra);
  const itensBom = {b1: {materialCodigo: 'EP-00012', materialNome: 'TAMPA PRETA 24/410', qtdPorPeca: 1, posicao: 1},
    b2: {materialCodigo: 'EP-00013', materialNome: 'TAMPA DOURADA 24/410', qtdPorPeca: 0.166667, posicao: 2}};
  const itensF = {i1: {mpCodigo: 'MPGR-00127', mpNome: 'ÁLCOOL 96°GL', fase: 'A', ordemAdicao: 1, percentualMM: 74}, i2: {mpCodigo: 'MPGR-00132', mpNome: 'ÁGUA', fase: 'A', ordemAdicao: 2, percentualMM: 26}};
  const espec = {e1: {ensaio: 'pH', especificacaoTexto: '5,0 A 6,0', minimo: '5', maximo: '6', metodo: 'POTENCIOMETRO', critico: true}};
  return {
    usuarios: {u1: perfil},
    clientes: {}, fornecedores: {}, solicitacoes_cadastro_material: {}, categorias: {}, estoque: {}, ops: {},
    config: {tiposEnsaio: [{nome: 'pH', ativo: true}]},
    materiais: {
      'MPGR-00127': {mpCodigo: 'MPGR-00127', mpNome: 'ÁLCOOL 96°GL', tipo: 'MPGR', unidade: 'kg', ativo: true},
      'MPGR-00132': {mpCodigo: 'MPGR-00132', mpNome: 'ÁGUA', tipo: 'MPGR', unidade: 'kg', ativo: true},
      'EP-00012': {mpCodigo: 'EP-00012', mpNome: 'TAMPA PRETA 24/410', tipo: 'EP', unidade: 'un', ativo: true},
      'EP-00013': {mpCodigo: 'EP-00013', mpNome: 'TAMPA DOURADA 24/410', tipo: 'EP', unidade: 'un', ativo: true},
    },
    produtos: {'PRF-BIOF-0008': {sku: 'PRF-BIOF-0008', descricao: 'BODY SPLASH B.BALM GLOW AURORA 200ML', ativo: true}},
    formulas: {
      'PRF-BIOF-0008__v1': ap('v1', {revisado: true, somaPercentual: 100, aprovadoPD: {nome: 'Adlai'}, aprovadoQualidade: {nome: 'Yasmim'}, itens: itensF}),
      'PRF-BIOF-0008__v2': ap('v2', {revisado: true, somaPercentual: 100, aprovadoPD: {nome: 'Adlai'}, aprovadoQualidade: {nome: 'Yasmim'}, itens: itensF}),
    },
    bom: {
      'PRF-BIOF-0008__v1': ap('v1', {aprovadoPCP: {nome: 'Adlai'}, aprovadoComercial: {nome: 'Adlai'}, itens: itensBom}),
      'PRF-BIOF-0008__v2': {codProduto: 'PRF-BIOF-0008', versao: 'v2', status: 'RASCUNHO', itens: bomV2 || JSON.parse(JSON.stringify(itensBom)),
        baseEdicao: {itens: bomV2 || JSON.parse(JSON.stringify(itensBom))}},
    },
    especificacoes: {
      'PRF-BIOF-0008__v1': ap('v1', {aprovadoPD: {nome: 'Adlai'}, aprovadoQualidade: {nome: 'Roberta'}, itens: espec}),
      'PRF-BIOF-0008__v2': ap('v2', {aprovadoPD: {nome: 'Adlai'}, aprovadoQualidade: {nome: 'Roberta'}, itens: espec}),
    },
  };
}
const PCP = {nome: 'Planejador', email: 'p@kuryos.com', role: 'pcp', modulos: {cadastros: true}};

async function abrirV2(browser, estado) {
  const r = await abrir(browser, estado, 'cadastros.html?tab=formulas&produto=PRF-BIOF-0008');
  await r.page.waitForSelector('#formulasAcoes-form .badge-aprovada', {timeout: 10000});
  const v2 = r.page.locator('#versoesChips-form button, .versao-chip, [data-versao="v2"]').filter({hasText: 'v2'}).first();
  if (await v2.count()) await v2.click();
  await r.page.waitForFunction(() => /RASCUNHO/.test((document.getElementById('bomAcoes-form') || {}).textContent || ''), null, {timeout: 8000});
  return r;
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    // BOM da v2 idêntico (só a ordem e o nome de exibição diferem): botão de 1 clique.
    let {page, errors} = await abrirV2(browser, dados(PCP));
    assert.match(await page.locator('#versaoUsoOp-form').innerText(), /falta aprovar BOM/);
    await page.locator('button, .tab, [role=tab]').filter({hasText: /^\s*BOM/}).first().click();
    const btn = page.locator('#bomAcoes-form .ac-herdar');
    assert.equal(await btn.count(), 1, 'botão aparece');
    assert.match(await btn.innerText(), /Manter aprovação da v1/);
    await btn.click();
    await page.waitForFunction(() => window.__db.bom['PRF-BIOF-0008__v2'].status === 'APROVADA');
    const b = await page.evaluate(() => window.__db.bom['PRF-BIOF-0008__v2']);
    assert.equal(b.aprovacaoHerdada.daVersao, 'v1');
    assert.equal(b.aprovacaoHerdada.por, 'Planejador');
    assert.equal(b.aprovadoPCP.herdadaDe, 'v1');
    assert.equal(b.aprovadoComercial.herdadaDe, 'v1');
    assert.ok(Object.values(b.historicoAlteracoes || {}).some((h) => h.acao === 'APROVACAO_MANTIDA' && /v1/.test(h.descricao)));
    assert.ok((page.__dialogos || []).some((d) => /idêntico ao da v1/.test(d)), 'pede confirmação');
    await page.waitForFunction(() => /Esta é a versão que a Emissão de OP usa/.test(document.getElementById('versaoUsoOp-form').textContent));
    assert.match(await page.locator('#bomAcoes-form').innerText(), /Aprovação mantida da v1/);
    assert.deepEqual(errors, []);
    await page.close();

    // BOM da v2 com quantidade diferente: sem o botão, só a aprovação normal.
    const dif = {b1: {materialCodigo: 'EP-00012', materialNome: 'TAMPA PRETA 24/410', qtdPorPeca: 2, posicao: 1},
      b2: {materialCodigo: 'EP-00013', materialNome: 'TAMPA DOURADA 24/410', qtdPorPeca: 0.166667, posicao: 2}};
    ({page, errors} = await abrirV2(browser, dados(PCP, dif)));
    assert.equal(await page.locator('#bomAcoes-form .ac-herdar').count(), 0, 'BOM mudou: sem atalho');
    assert.ok(await page.locator('#bomAcoes-form .ac-btn').count(), 'aprovação normal segue');
    assert.deepEqual(errors, []);
    console.log('OK manter aprovação (tela): BOM idêntico aprova em 1 clique com histórico e a v2 vira a da OP; BOM diferente não tem atalho.');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
