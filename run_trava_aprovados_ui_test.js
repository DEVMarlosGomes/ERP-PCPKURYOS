'use strict';
/* Trava do aprovado (08/11/2026) na tela real de Cadastros com Firebase simulado (harness de run_critico_pd_cadastro_ui_test.js):
   versão APROVADA só muda por quem tem o módulo alterar_aprovados, com justificativa e histórico; nova versão de produto aprovado também. */
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


function dados(perfil) {
  const aprovada = (extra) => Object.assign({codProduto: 'FBBS0004', versao: 'v1', status: 'APROVADA', dataAprovacao: '2026-10-06T19:31:02Z'}, extra);
  return {
    usuarios: {u1: perfil},
    clientes: {}, fornecedores: {}, solicitacoes_cadastro_material: {}, categorias: {}, config: {}, estoque: {}, ops: {},
    materiais: {
      'MPGR-00127': {mpCodigo: 'MPGR-00127', mpNome: 'ÁLCOOL 96°GL', tipo: 'MPGR', unidade: 'kg', ativo: true},
      'MPGR-00132': {mpCodigo: 'MPGR-00132', mpNome: 'ÁGUA', tipo: 'MPGR', unidade: 'kg', ativo: true},
    },
    produtos: {FBBS0004: {sku: 'FBBS0004', descricao: 'BODY SPLASH OUD NIGHT 200ML', ativo: true}},
    formulas: {FBBS0004__v1: aprovada({revisado: true, somaPercentual: 100, aprovadoPD: {nome: 'Yasmim'}, aprovadoQualidade: {nome: 'Yasmim'},
      itens: {i1: {mpCodigo: 'MPGR-00127', mpNome: 'ÁLCOOL 96°GL', fase: 'A', ordemAdicao: 1, percentualMM: 74}, i2: {mpCodigo: 'MPGR-00132', mpNome: 'ÁGUA', fase: 'A', ordemAdicao: 2, percentualMM: 26}}})},
    bom: {FBBS0004__v1: aprovada({aprovadoPCP: {nome: 'Adlai'}, aprovadoComercial: {nome: 'Adlai'}, itens: {}})},
    especificacoes: {FBBS0004__v1: aprovada({aprovadoPD: {nome: 'Yasmim'}, aprovadoQualidade: {nome: 'Roberta'}, itens: {}})},
  };
}
const PCP = {nome: 'Planejador', email: 'p@kuryos.com', role: 'pcp', modulos: {cadastros: true}};
const YASMIM = {nome: 'Yasmim Fantini', email: 'y@kuryos.com', role: 'comercial', modulos: {cadastros: true, pd: true, qualidade: true, alterar_aprovados: true}};

async function abrirProduto(browser, perfil) {
  const r = await abrir(browser, dados(perfil), 'cadastros.html?tab=formulas&produto=FBBS0004');
  await r.page.waitForSelector('#formulasAcoes-form .badge-aprovada', {timeout: 10000});
  return r;
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    // PCP sem o módulo: tudo travado, sem "Alterar aprovada", sem nova versão.
    let {page, errors} = await abrirProduto(browser, PCP);
    assert.equal(await page.locator('#formulaBody-form .f-pct').count(), 0, 'aprovada não mostra campos para o PCP');
    assert.match(await page.locator('#formulasAcoes-form').innerText(), /Travada/);
    assert.equal(await page.locator('#formulasAcoes-form .alt-ini').count(), 0);
    assert.equal(await page.locator('#formulasAcoes-form .fv-toggle-revisado').count(), 0, 'Revisado não é clicável na aprovada');
    assert.doesNotMatch(await page.locator('#versaoAcoes-form').innerText(), /Nova versão a partir desta/);
    await page.click('#btnNovaVersao-form');
    await page.waitForFunction(() => /Alterar aprovados/.test(document.getElementById('alertBox').innerText));
    assert.equal(await page.evaluate(() => Boolean(window.__db.formulas.FBBS0004__v2)), false, 'PCP criou v2 de produto aprovado');
    assert.deepEqual(errors, [], 'erros (PCP): ' + errors.join(' | '));
    await page.close();

    // Yasmim (módulo): abre com justificativa, altera, histórico grava e segue APROVADA.
    ({page, errors} = await abrirProduto(browser, YASMIM));
    assert.equal(await page.locator('#formulasAcoes-form .alt-ini').count(), 1);
    page.__resposta = 'curta';
    await page.click('#formulasAcoes-form .alt-ini');
    await page.waitForFunction(() => /pelo menos 10 letras/.test(document.getElementById('alertBox').innerText));
    assert.equal(await page.locator('#formulaBody-form .f-pct').count(), 0, 'justificativa curta não abre');
    page.__resposta = 'Ajuste de álcool pedido pelo P&D após teste de estabilidade';
    await page.click('#formulasAcoes-form .alt-ini');
    await page.waitForSelector('#formulaBody-form .f-pct');
    assert.match(await page.locator('#formulasAcoes-form').innerText(), /Alterando/);
    await page.fill('#formulaBody-form tr[data-item="i1"] .f-pct', '73.5');
    await page.press('#formulaBody-form tr[data-item="i1"] .f-pct', 'Tab'); // um change só, como o usuário
    await page.waitForFunction(() => Object.keys(window.__db.formulas.FBBS0004__v1.historicoAlteracoes || {}).length === 1);
    let f = await page.evaluate(() => window.__db.formulas.FBBS0004__v1);
    assert.equal(f.status, 'APROVADA');
    assert.equal(f.itens.i1.percentualMM, 73.5);
    assert.equal(f.somaPercentual, 99.5, 'soma recalculada no mesmo update');
    const h = Object.values(f.historicoAlteracoes)[0];
    assert.equal(h.justificativa, 'Ajuste de álcool pedido pelo P&D após teste de estabilidade');
    assert.equal(h.por, 'Yasmim Fantini');
    assert.match(h.descricao, /MPGR-00127.*73,5%.*antes MPGR-00127 74%/);
    assert.deepEqual(f.ultimaAlteracao.em_ms, {'.sv': 'timestamp'}, 'horário do servidor');
    assert.equal(f.ultimaAlteracao.id, Object.keys(f.historicoAlteracoes)[0]);
    await page.click('#formulasAcoes-form .alt-fim');
    await page.waitForFunction(() => document.querySelectorAll('#formulaBody-form .f-pct').length === 0);
    assert.match(await page.locator('#formulasAcoes-form').innerText(), /Histórico de alterações \(1\)/);

    // Nova versão de produto aprovado: pede justificativa e marca o histórico da aprovada.
    page.__resposta = 'Nova versão para a troca do fornecedor do álcool';
    await page.click('#btnNovaVersao-form');
    await page.waitForFunction(() => Boolean(window.__db.formulas.FBBS0004__v2));
    f = await page.evaluate(() => window.__db.formulas);
    assert.equal(f.FBBS0004__v2.motivoNovaVersao.justificativa, 'Nova versão para a troca do fornecedor do álcool');
    assert.equal(f.FBBS0004__v2.status, 'RASCUNHO');
    const hs = Object.values(f.FBBS0004__v1.historicoAlteracoes).map((x) => x.acao).sort();
    assert.deepEqual(hs, ['ALTERAR_APROVADA', 'NOVA_VERSAO']);
    assert.equal(f.FBBS0004__v1.status, 'APROVADA');
    assert.deepEqual(errors, [], 'erros (Yasmim): ' + errors.join(' | '));
    await page.close();
  } finally { await browser.close(); }
  console.log('OK trava do aprovado na tela: PCP sem o módulo não altera nem cria versão; com o módulo, justificativa obrigatória, histórico com data/autor/o quê, soma no mesmo update, segue APROVADA; nova versão também justificada.');
})().catch((e) => { console.error(e); process.exit(1); });
