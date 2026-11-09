'use strict';
/* UI (09/11/2026): MP nova do P&D chega ao Cadastros com INCI e FORNECEDOR.
   Antes, na MP Geral o fornecedor ia para o bloco oculto de fornecedor único e o
   material nascia sem fornecedor; nomes livres do P&D ("Lunagreen") não casavam com o
   cadastro ("LUNAGREEN BIOATIVOS"). Casos reais da Vivai (projeto 2026-041).
   Mesmo harness de run_duplicidade_material_ui_test.js (Firebase simulado em memória). */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function tarefa(id, tipo, nome, campos) {
  return {status: 'PENDENTE_CADASTRO', tipo, nome, ingrediente: nome, inci: campos.inci || '', fornecedor: campos.fornecedor || '',
    campos: Object.assign({funcao: ''}, campos), amostra_em_desenvolvimento: true, marca: 'amostra em desenvolvimento',
    origem: {formulaId: 'F' + id, itemId: 'I' + id, projetoNumero: '2026-041', projeto: 'Linha Complementar Maquiagem', cliente: 'Vivai Cosmeticos'},
    criadoEm: '2026-11-06T13:49:46Z', criadoPor: 'yasmim.fantini'};
}
function dados() {
  return {
    usuarios: {u1: {nome: 'Gustavo', email: 'g@kuryos.com', role: 'admin'}},
    clientes: {},
    fornecedores: {
      lun: {razaoSocial: 'LUNAGREEN BIOATIVOS', ativo: true},
      phy: {nomeFantasia: 'PHYTOATTIVE', razaoSocial: 'PHYTOATTIVE COMERCIAL LTDA', tipo: 'mp'},
      tcq: {nomeFantasia: 'TC QUIMICA', razaoSocial: 'TAVARES CHEMICAL LTDA', tipo: 'mp'},
      tce: {nomeFantasia: 'TC EMBALAGENS', tipo: 'embalagem'},
      tcm: {nomeFantasia: 'TC MATERIAS PRIMAS', tipo: 'mp'},
      shp: {nomeFantasia: 'SHOPEE MARKETPLACE', tipo: 'servicos'}
    },
    materiais: {},
    solicitacoes_cadastro_material: {
      URU: tarefa('1', 'MPGR', 'Extrato Glicólico Urucum', {inci: 'Bixa Orellana Seed Extract', fornecedor: 'Lunagreen', preco_brl_kg: 200}),
      UVA: tarefa('2', 'MPES', 'Fragrância Uva C02704-00062', {inci: '', fornecedor: 'phyto', preco_usd_kg: 38}),
      OLE: tarefa('3', 'MPGR', 'Óleo de Urucum', {inci: '', fornecedor: 'Hope', preco_brl_kg: 200}),
      SEM: tarefa('4', 'MPGR', 'Extrato Glicólico Semente de Uva', {inci: 'Vitis Vinifera Fruit Extract', fornecedor: 'TC', preco_brl_kg: 200})
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

async function abrirTarefa(page, id) {
  await page.click('#solicitacoesCadastro-mat .btn-cadastrar-solic-mat[data-solic="' + id + '"]');
  await page.waitForFunction(() => document.getElementById('modalBg-mat').classList.contains('open'));
}
async function salvarNovo(page, antes) {
  await page.click('#modalSaveBtn-mat');
  await page.waitForFunction((n) => Object.keys(window.__db.materiais || {}).length === n + 1, antes);
  const db = await page.evaluate(() => window.__db);
  return db;
}
function materialPorNome(db, nome) { return Object.values(db.materiais).find((m) => m.mpNome === nome); }

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const {page, errors} = await abrir(browser, dados(), 'cadastros.html?tab=materiais');
    await page.waitForSelector('#solicitacoesCadastro-mat .btn-cadastrar-solic-mat');

    // 0. A fila já mostra INCI e fornecedor (casado com o cadastro) sem abrir a tarefa.
    const fila = await page.locator('#solicitacoesCadastro-mat').innerText();
    assert.match(fila, /INCI: Bixa Orellana Seed Extract · Fornecedor: Lunagreen → LUNAGREEN BIOATIVOS/);
    assert.match(fila, /INCI: não informado no P&D · Fornecedor: Hope \(não cadastrado\)/);
    assert.match(fila, /Fornecedor: TC \(mais de um cadastro: escolher\)/);

    // 1. MP Geral com fornecedor cadastrado por outro nome: entra na lista de homologados, com o custo do P&D.
    await abrirTarefa(page, 'URU');
    assert.equal(await page.inputValue('#fInci-mat'), 'BIXA ORELLANA SEED EXTRACT', 'INCI veio do P&D');
    assert.match(await page.locator('#fornecedoresHomologadosBody-mat').innerText(), /LUNAGREEN BIOATIVOS/);
    assert.match(await page.locator('#avisoFornecedorPd-mat').innerText(), /Lunagreen → LUNAGREEN BIOATIVOS/);
    let db = await salvarNovo(page, 0);
    let m = materialPorNome(db, 'EXTRATO GLICOLICO URUCUM');
    assert.ok(m, 'material criado');
    assert.equal(m.inci, 'BIXA ORELLANA SEED EXTRACT');
    assert.deepEqual(m.fornecedores, {lun: {nomeComercial: '', codigoFornecedor: '', statusHomologacao: 'aguardando_homologacao', custoReferencia: 200}});
    assert.equal(db.solicitacoes_cadastro_material.URU.status, 'CADASTRADO');

    // 2. Fragrância: fornecedor único, "phyto" casa com PHYTOATTIVE.
    await abrirTarefa(page, 'UVA');
    assert.equal(await page.inputValue('#fuFornecedorKey-mat'), 'phy');
    await page.fill('#fSkuAprovacao-mat', 'C02704-00062');
    db = await salvarNovo(page, 1);
    m = materialPorNome(db, 'FRAGRANCIA UVA C02704-00062');
    assert.ok(m && m.fornecedores && m.fornecedores.phy, 'fragrância gravou o fornecedor: ' + JSON.stringify(m && m.fornecedores));

    // 3. Fornecedor que não existe ("Hope"; SHOPEE não conta): avisa, deixa o nome para buscar, não inventa vínculo.
    await abrirTarefa(page, 'OLE');
    assert.match(await page.locator('#avisoFornecedorPd-mat').innerText(), /Hope.*não está cadastrado/);
    assert.equal(await page.inputValue('#fhFornecedor-mat'), 'HOPE');
    assert.equal(await page.inputValue('#fhCustoRef-mat'), '200');
    assert.match(await page.locator('#fornecedoresHomologadosBody-mat').innerText(), /Nenhum fornecedor homologado/);
    await page.click('#modalCancelBtn-mat');

    // 4. Nome ambíguo ("TC": TC QUIMICA e TC MATERIAS PRIMAS; TC EMBALAGENS fica fora por ser embalagem): pede escolha.
    await abrirTarefa(page, 'SEM');
    const aviso = await page.locator('#avisoFornecedorPd-mat').innerText();
    assert.match(aviso, /mais de um cadastro/);
    assert.match(aviso, /TC QUIMICA/); assert.match(aviso, /TC MATERIAS PRIMAS/); assert.doesNotMatch(aviso, /TC EMBALAGENS/);
    assert.equal(await page.inputValue('#fInci-mat'), 'VITIS VINIFERA FRUIT EXTRACT');
    await page.click('#modalCancelBtn-mat');

    // 5. Material aberto à mão depois não herda o aviso.
    await page.click('#btnNovo-mat');
    assert.equal(await page.locator('#avisoFornecedorPd-mat').isVisible(), false, 'aviso não fica pendurado no cadastro manual');

    assert.deepEqual(errors, [], 'erros na tela: ' + errors.join(' | '));
    console.log('run_fornecedor_pd_cadastro_ui_test: OK');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
