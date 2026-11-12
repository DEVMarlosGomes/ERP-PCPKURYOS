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
      // 12/11: com as origens (amostra e % na fórmula) que o P&D grava desde então.
      UVA: Object.assign(tarefa('2', 'MPES', 'Fragrância Uva C02704-00062', {inci: '', fornecedor: 'phyto', preco_usd_kg: 38}), {origens: {
        F2__I2: {amostra: '2026-041-A1-b', projetoNumero: '2026-041', cliente: 'Vivai Cosmeticos', percentual: 4.2, ativa: true},
        L1__I2: {amostra: '2026-041-A1-b', origemLote: 'LM-2026-041-1', ativa: true},
        F9__I2: {amostra: '2026-041-A1-z', percentual: 9, ativa: false}}}),
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

    // 0. A fila é uma tabela, uma MP por linha (12/11: era uma faixa em linha, cada MP numa coluna estreita),
    //    e já mostra INCI, fornecedor (casado com o cadastro), preço, uso na amostra e o SKU sugerido.
    const linhas = page.locator('#solicitacoesCadastro-mat tbody tr');
    assert.equal(await linhas.count(), 4);
    const y = [];
    for (let i = 0; i < 4; i++) y.push((await linhas.nth(i).boundingBox()).y);
    assert.ok(y[1] > y[0] && y[2] > y[1] && y[3] > y[2], 'uma MP embaixo da outra: ' + y.join(','));
    const linha = async (nome) => (await linhas.filter({hasText: nome}).innerText()).replace(/\s+/g, ' ');
    assert.match(await linha('Extrato Glicólico Urucum'), /Bixa Orellana Seed Extract Lunagreen → LUNAGREEN BIOATIVOS R\$ 200\/kg .*não exige/);
    assert.match(await linha('Óleo de Urucum'), /não informado no P&D Hope não cadastrado em Fornecedores/);
    assert.match(await linha('Semente de Uva'), /TC mais de um cadastro: escolher ao cadastrar/);
    const uva = await linha('Fragrância Uva');
    assert.match(uva, /US\$ 38\/kg/);
    assert.match(uva, /4,2% · 2026-041-A1-b/, 'quanto usou na amostra');
    assert.doesNotMatch(uva, /A1-z/, 'origem retirada não aparece');
    assert.equal((uva.match(/2026-041-A1-b/g) || []).length, 1, 'mesma amostra pela fórmula e pelo lote: uma vez');
    assert.match(uva, /C02704-00062 do nome, conferir/, 'SKU de aprovação sugerido do nome');

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

    // 2. Fragrância: fornecedor único, "phyto" casa com PHYTOATTIVE. O SKU de aprovação já vem do nome
    //    (12/11: antes vinha vazio e o salvar parava, com o aviso escondido atrás do modal).
    await abrirTarefa(page, 'UVA');
    assert.equal(await page.inputValue('#fuFornecedorKey-mat'), 'phy');
    assert.equal(await page.inputValue('#fSkuAprovacao-mat'), 'C02704-00062');
    assert.match(await page.locator('#skuEntradaStatus-mat').innerText(), /preenchido a partir do nome — confira/);
    db = await salvarNovo(page, 1);
    m = materialPorNome(db, 'FRAGRANCIA UVA C02704-00062');
    assert.ok(m && m.fornecedores && m.fornecedores.phy, 'fragrância gravou o fornecedor: ' + JSON.stringify(m && m.fornecedores));
    assert.equal(m.skusEntrada.aprovacao.codigo, 'C02704-00062');
    assert.equal(m.fornecedores.phy.codigoFornecedor, 'C02704-00062', 'Compras lê o SKU vigente como código do fornecedor');
    assert.equal(db.solicitacoes_cadastro_material.UVA.status, 'CADASTRADO');

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

    // 6. Fragrância digitada à mão (as do Adlai, 11/11): o código da amostra no nome vira o SKU de aprovação.
    await page.selectOption('#fTipo', 'MPES');
    await page.fill('#fNome-mat', "J'ADORE - FAV374566 - GLAM");
    assert.equal(await page.inputValue('#fSkuAprovacao-mat'), 'FAV374566');
    await page.fill('#fNome-mat', 'LOVE SPELL - FAV374574 - ENERGY');
    assert.equal(await page.inputValue('#fSkuAprovacao-mat'), 'FAV374574', 'acompanha o nome enquanto ninguém digitou no campo');
    await page.fill('#fSkuAprovacao-mat', 'FAV999');
    await page.fill('#fNome-mat', 'LOVE SPELL - FAV374574 - ENERGY X');
    assert.equal(await page.inputValue('#fSkuAprovacao-mat'), 'FAV999', 'o que foi digitado no campo não é trocado');
    // Sem SKU, o erro aparece DENTRO do modal e leva ao campo; nada é gravado.
    await page.fill('#fSkuAprovacao-mat', '');
    await page.fill('#fNome-mat', 'ESSENCIA SEM CODIGO');
    await page.click('#modalSaveBtn-mat');
    const avisoModal = page.locator('#modalBg-mat .modal-footer .modal-aviso');
    await avisoModal.waitFor();
    assert.match(await avisoModal.innerText(), /informe primeiro o SKU de aprovação/);
    assert.ok(await page.evaluate(() => document.getElementById('fSkuAprovacao-mat').classList.contains('campo-erro')), 'campo marcado');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'fSkuAprovacao-mat');
    assert.equal(Object.keys((await page.evaluate(() => window.__db)).materiais).length, 2, 'nada gravado');
    await page.fill('#fSkuAprovacao-mat', 'AB1234');
    assert.equal(await page.evaluate(() => document.getElementById('fSkuAprovacao-mat').classList.contains('campo-erro')), false);
    await page.click('#modalCancelBtn-mat');

    assert.deepEqual(errors, [], 'erros na tela: ' + errors.join(' | '));
    console.log('run_fornecedor_pd_cadastro_ui_test: OK');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
