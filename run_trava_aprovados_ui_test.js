'use strict';
/* Trava do aprovado (08/11/2026) na tela real de Cadastros com Firebase simulado (harness de run_critico_pd_cadastro_ui_test.js):
   versão APROVADA só muda por quem tem o módulo alterar_aprovados, com justificativa e histórico.
   Desde 10/11/2026 "Nova versão a partir desta" é de todos que editam Cadastros: a aprovada não muda,
   a nova nasce rascunho, e "Finalizar edição" grava o que mudou + justificativa (DiffVersao). */
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
    // PCP sem o módulo: aprovada travada, mas cria nova versão a partir dela (10/11/2026).
    let {page, errors} = await abrirProduto(browser, PCP);
    assert.equal(await page.locator('#formulaBody-form .f-pct').count(), 0, 'aprovada não mostra campos para o PCP');
    assert.match(await page.locator('#formulasAcoes-form').innerText(), /Travada/);
    assert.equal(await page.locator('#formulasAcoes-form .alt-ini').count(), 0);
    assert.equal(await page.locator('#formulasAcoes-form .fv-toggle-revisado').count(), 0, 'Revisado não é clicável na aprovada');
    assert.match(await page.locator('#versaoAcoes-form').innerText(), /Nova versão a partir desta/);
    await page.click('#versaoAcoes-form button:has-text("Nova versão a partir desta")');
    await page.waitForFunction(() => Boolean(window.__db.formulas.FBBS0004__v2));
    let v = await page.evaluate(() => window.__db);
    assert.equal(v.formulas.FBBS0004__v2.status, 'RASCUNHO');
    assert.equal(v.formulas.FBBS0004__v2.itens.i1.percentualMM, 74, 'itens copiados com as mesmas chaves');
    assert.equal(v.formulas.FBBS0004__v2.motivoNovaVersao.origem, 'v1');
    assert.equal(v.formulas.FBBS0004__v2.motivoNovaVersao.por, 'Planejador');
    assert.deepEqual(Object.values(v.formulas.FBBS0004__v2.historicoAlteracoes).map((x) => x.descricao), ['Criada a partir da v1']);
    assert.ok(v.bom.FBBS0004__v2 && v.especificacoes.FBBS0004__v2, 'BOM e especificação da v2');
    assert.equal(v.formulas.FBBS0004__v1.status, 'APROVADA');
    assert.equal(v.formulas.FBBS0004__v1.historicoAlteracoes, undefined, 'a v1 aprovada não é tocada');
    // Edita a v2: fica pendente, trava a aprovação, e "Finalizar edição" grava o que mudou.
    await page.waitForSelector('#formulaBody-form tr[data-item="i1"] .f-pct');
    await page.fill('#formulaBody-form tr[data-item="i1"] .f-pct', '70');
    await page.press('#formulaBody-form tr[data-item="i1"] .f-pct', 'Tab');
    await page.waitForFunction(() => /Finalizar edição \(1\)/.test(document.getElementById('versaoAcoes-form').innerText));
    assert.match(await page.locator('#formulasAcoes-form').innerText(), /1 alteração a finalizar/);
    assert.match(await page.locator('#formulasAcoes-form .ac-btn').getAttribute('title'), /Finalize a edição/);
    page.__resposta = 'Ajuste de álcool depois do teste de estabilidade';
    await page.click('#versaoAcoes-form button:has-text("Finalizar edição")');
    await page.waitForFunction(() => Object.keys(window.__db.formulas.FBBS0004__v2.historicoAlteracoes).length === 2);
    v = await page.evaluate(() => window.__db.formulas.FBBS0004__v2);
    const ed = Object.values(v.historicoAlteracoes).find((x) => x.acao === 'EDICAO');
    assert.equal(ed.justificativa, 'Ajuste de álcool depois do teste de estabilidade');
    assert.equal(ed.por, 'Planejador');
    assert.deepEqual(ed.em_ms, {'.sv': 'timestamp'}, 'horário do servidor');
    assert.deepEqual(ed.mudancas, ['MPGR-00127 — ÁLCOOL 96°GL: % m/m 74 → 70']);
    assert.equal(v.baseEdicao.itens.i1.percentualMM, 70, 'base avança: nada mais pendente');
    await page.waitForFunction(() => !/Finalizar edição/.test(document.getElementById('versaoAcoes-form').innerText));
    assert.doesNotMatch(await page.locator('#versaoAcoes-form').innerText(), /Excluir versão/, 'edição registrada: a versão não se apaga');
    assert.match(await page.locator('#formulasAcoes-form').innerText(), /Histórico de alterações \(2\)/);
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
    // Concluir: o resumo do que mudou desde a abertura entra no histórico.
    await page.click('#formulasAcoes-form .alt-fim');
    await page.waitForFunction(() => document.querySelectorAll('#formulaBody-form .f-pct').length === 0);
    f = await page.evaluate(() => window.__db.formulas.FBBS0004__v1);
    const resumo = Object.values(f.historicoAlteracoes).find((x) => x.acao === 'RESUMO_ALTERACAO');
    assert.deepEqual(resumo.mudancas, ['MPGR-00127 — ÁLCOOL 96°GL: % m/m 74 → 73,5']);
    assert.equal(resumo.justificativa, 'Ajuste de álcool pedido pelo P&D após teste de estabilidade');
    assert.match(await page.locator('#formulasAcoes-form').innerText(), /Histórico de alterações \(2\)/);

    assert.deepEqual(errors, [], 'erros (Yasmim): ' + errors.join(' | '));
    await page.close();
  } finally { await browser.close(); }
  console.log('OK trava do aprovado na tela: aprovada travada sem o módulo; nova versão a partir dela para todos, com edição pendente até finalizar (justificativa + o que mudou no histórico); com o módulo, alteração justificada, histórico com data/autor/o quê e resumo ao concluir, segue APROVADA.');
})().catch((e) => { console.error(e); process.exit(1); });
