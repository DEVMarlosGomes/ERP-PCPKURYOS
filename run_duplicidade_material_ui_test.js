'use strict';
/* UI (CAD-01): MP nova do P&D que já existe no Cadastros vira VÍNCULO, não cadastro
   repetido; cadastro manual com mesmo tipo + nome é recusado. Tela real de Cadastros
   com Firebase simulado em memória (mesmo harness de run_espelho_cadastro_ui_test.js). */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function dados() {
  return {
    usuarios: {u1: {nome: 'Gustavo', email: 'g@kuryos.com', role: 'admin'}},
    clientes: {}, fornecedores: {},
    materiais: {
      'MPGR-00008': {mpCodigo: 'MPGR-00008', mpNome: 'GLICERINA', tipo: 'MPGR', inci: 'GLYCERIN', unidade: 'kg', ativo: true}
    },
    solicitacoes_cadastro_material: {
      F1__I1: {status: 'PENDENTE_CADASTRO', tipo: 'MPGR', nome: 'Glicerina', ingrediente: 'Glicerina', inci: 'Glycerin', fornecedor: '',
        campos: {inci: 'Glycerin', funcao: 'umectante', fornecedor: '', preco_brl_kg: 9.8, preco_usd_kg: null},
        origem: {formulaId: 'F1', itemId: 'I1', projetoNumero: '2026-031', projeto: 'Abelhinha', amostra: '2026-031-A1-a'},
        criadoEm: '2026-10-22T10:00:00Z', criadoPor: 'Yasmim'}
    },
    produtos: {}, formulas: {}, bom: {}, especificacoes: {}, categorias: {}, config: {}, estoque: {}
  };
}

async function abrir(browser, estadoInicial, pagina) {
  const page = await browser.newPage({viewport: {width: 1500, height: 1100}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
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

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const {page, errors} = await abrir(browser, dados(), 'cadastros.html?tab=materiais');

    // Na fila já aparece que a MP nova existe.
    await page.waitForSelector('#solicitacoesCadastro-mat .btn-cadastrar-solic-mat');
    assert.match(await page.locator('#solicitacoesCadastro-mat').innerText(), /já existe MPGR-00008/);

    // Abrir a tarefa: aviso com Vincular; vincular fecha a tarefa sem criar material.
    await page.click('#solicitacoesCadastro-mat .btn-cadastrar-solic-mat');
    await page.waitForSelector('#dupMat-box .btn-vincular-mat');
    assert.match(await page.locator('#dupMat-box').innerText(), /Já existe material com este nome/);
    assert.equal(await page.inputValue('#fFuncaoFormula-mat'), 'UMECTANTE', 'AMO-04: função veio do P&D (campo em maiúsculas)');
    await page.click('#dupMat-box .btn-vincular-mat');
    await page.waitForFunction(() => window.__db.solicitacoes_cadastro_material.F1__I1.status === 'VINCULADO');
    const db1 = await page.evaluate(() => window.__db);
    assert.deepEqual(
      (({status, materialKey, mpCodigo, vinculadoPor}) => ({status, materialKey, mpCodigo, vinculadoPor}))(db1.solicitacoes_cadastro_material.F1__I1),
      {status: 'VINCULADO', materialKey: 'MPGR-00008', mpCodigo: 'MPGR-00008', vinculadoPor: 'Gustavo'});
    assert.deepEqual(Object.keys(db1.materiais), ['MPGR-00008'], 'nenhum material novo');
    await page.waitForFunction(() => !document.querySelector('#solicitacoesCadastro-mat .btn-cadastrar-solic-mat'));

    // Cadastro manual com o mesmo tipo + nome (outra caixa/acento): recusado.
    await page.click('#btnNovo-mat');
    await page.selectOption('#fTipo', 'MPGR');
    await page.fill('#fNome-mat', 'glicerina');
    await page.dispatchEvent('#fNome-mat', 'input');
    await page.waitForFunction(() => /Já existe material com este nome/.test(document.getElementById('dupMat-box').innerText));
    assert.equal(await page.locator('#dupMat-box .btn-vincular-mat').count(), 0, 'sem tarefa do P&D não há Vincular');
    await page.click('#modalSaveBtn-mat');
    await page.waitForFunction(() => /Já existe MPGR-00008/.test(document.getElementById('alertBox').innerText));
    assert.deepEqual(Object.keys(await page.evaluate(() => window.__db.materiais)), ['MPGR-00008'], 'duplicata não foi gravada');

    // Nome parecido só avisa e deixa cadastrar.
    await page.fill('#fNome-mat', 'Glicerina vegetal USP');
    await page.dispatchEvent('#fNome-mat', 'input');
    await page.waitForFunction(() => /Parecido/.test(document.getElementById('dupMat-box').innerText));
    // ...e o material novo nasce reservando a chave tipo+nome no índice (regra do banco), no mesmo update.
    await page.click('#modalSaveBtn-mat');
    await page.waitForFunction(() => Object.keys(window.__db.materiais).length === 2);
    const db2 = await page.evaluate(() => window.__db);
    const novoKey = Object.keys(db2.materiais).find((k) => k !== 'MPGR-00008');
    assert.equal(db2.materiais[novoKey].chaveDuplicidade, 'GLICERINA VEGETAL USP');
    assert.equal(db2.materiais_chave['GLICERINA VEGETAL USP'], novoKey);

    assert.deepEqual(errors, [], 'erros na tela: ' + errors.join(' | '));
    console.log('run_duplicidade_material_ui_test: OK');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
