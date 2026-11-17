'use strict';
/* PC Direto para um equipamento (17/11/2026): lista de ativos no PC Direto para
   pesquisar o equipamento e encaminhar o que ele precisa. Mesmo harness de
   run_pc_direto_ui_test.js. Confere: busca na lista de ativos (sem inativo),
   painel com peças cadastradas e fornecedor do ativo, "+ todas" sem duplicar,
   vínculo de uso e consumo automático, origem.tipo ATIVO gravada no PC, selo 🔧,
   ficha do ativo enxerga o PC direto, e PC sem equipamento continua sem origem.
     PLAYWRIGHT_MODULE=<.../node_modules/playwright> node run_pc_direto_ativo_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function dados() {
  return {
    'usuarios/u1': {nome: 'Gustavo', email: 'g@kuryos.com', role: 'admin'},
    config: {},
    ativos: {
      a1: {codigo: 'EV-01', nome: 'Envasadora Body Splash', tipo: 'ENVASADORA', area: 'ENVASE', linha: 'Linha 1', situacao: 'OPERACIONAL',
        fabricante: 'CYCLOP', fornecedorAssistenciaKey: 'f2', fornecedorFabricanteKey: 'f1',
        pecas: {MN_00001: {materialCodigo: 'MN-00001', materialNome: 'Bico dosador', unidade: 'un', qtdReferencia: 4},
                MN_00002: {materialCodigo: 'MN-00002', materialNome: 'Mangueira silicone', unidade: 'm'},
                MN_00099: {materialCodigo: 'MN-00099', materialNome: 'Peça descadastrada'}}},
      a2: {codigo: 'RT-09', nome: 'Reator antigo', tipo: 'REATOR', area: 'MANIPULACAO', situacao: 'INATIVO'}
    },
    materiais: {
      'MN-00001': {mpCodigo: 'MN-00001', mpNome: 'Bico dosador', tipo: 'MN', unidade: 'un'},
      'MN-00002': {mpCodigo: 'MN-00002', mpNome: 'Mangueira silicone', tipo: 'MN', unidade: 'm'},
      'EP-00036': {mpCodigo: 'EP-00036', mpNome: 'Frasco', tipo: 'EP', unidade: 'un'}
    },
    fornecedores: {
      f1: {nomeFantasia: 'LOMAR PACK', cnpj: '33.321.531/0001-35', cep: '07041-030', logradouro: 'Avenida Carlos Ferreira Endres',
        numero: '952', bairro: 'Vila Endres', cidade: 'Guarulhos', uf: 'SP', contatoNome: 'Ana', contatoTelefone: '11 99999-0000'},
      f2: {nomeFantasia: 'TEC ASSISTENCIA', cnpj: '11.222.333/0001-81', cep: '01310-100', logradouro: 'Avenida Paulista', numero: '1',
        bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP', contatoNome: 'Rui', contatoTelefone: '11 98888-0000'}
    },
    pedidos_compra: {}
  };
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1500, height: 1200}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.addInitScript(({data}) => {
      window.__writes = [];
      window.__iniciado = false;
      const exige = q => { if (!window.__iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (" + q + ')'); };
      window.fetch = () => new Promise(r => setTimeout(() => r({ok: true, status: 200, json: () => Promise.resolve({erro: true})}), 30));
      window.firebase = {
        initializeApp(cfg) { if (!cfg || !cfg.databaseURL) throw new Error('sem databaseURL'); window.__iniciado = true; },
        auth() {
          exige('auth');
          return {onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'g@kuryos.com', displayName: 'Gustavo'}), 0); },
            signOut() { return Promise.resolve(); }, currentUser: {email: 'g@kuryos.com'}};
        },
        functions() { return {httpsCallable: () => () => Promise.resolve({data: {}})}; },
        app() { return {functions: () => ({httpsCallable: () => () => Promise.resolve({data: {}})})}; },
        database() {
          exige('database');
          const ref = path => {
            const snap = {val: () => (path in data ? structuredClone(data[path]) : null), exists: () => path in data, key: String(path).split('/').pop()};
            return {path, key: 'k' + Math.random().toString(36).slice(2, 8),
              once(ev, cb) { if (cb) cb(snap); return Promise.resolve(snap); },
              on(ev, cb) { setTimeout(() => cb(snap), 0); return cb; }, off() {},
              child(p) { return ref(path + '/' + p); }, push() { return ref(path + '/k' + Math.random().toString(36).slice(2, 8)); },
              orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
              set(v) { window.__writes.push({op: 'set', path, v}); return Promise.resolve(); },
              update(v) { window.__writes.push({op: 'update', path, v}); return Promise.resolve(); },
              remove() { return Promise.resolve(); },
              transaction(fn) { const v = fn(null); return Promise.resolve({committed: true, snapshot: {val: () => v}}); }};
          };
          return {ref, ServerValue: {TIMESTAMP: 0}};
        }
      };
    }, {data: dados()});
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'cmp.test') return route.fulfill({body: '', contentType: 'text/javascript'});
      const file = 'public/' + url.pathname.slice(1);
      if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
      return route.fulfill({body: fs.readFileSync(file),
        contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
    });
    await page.goto('https://cmp.test/compras.html');
    await page.waitForSelector('.kt-sidebar', {timeout: 8000});
    await page.waitForFunction(() => window.currentUser && window.currentUser.role === 'admin', null, {timeout: 8000});
    await page.waitForFunction(() => Object.keys(allAtivosCompras).length === 2 && Object.keys(allFornecedores).length === 2, null, {timeout: 8000});

    await page.click('.tab[data-tab="pedidos"]');
    await page.click('#btnPcDireto');
    await page.waitForSelector('#pcdAtivo');
    assert.match(await page.locator('#pcdAtivoPainel').innerText(), /Escolha o equipamento/);

    // Lista de ativos: o inativo não aparece; busca pela linha acha o equipamento.
    const itens = await page.evaluate(() => pcdAtivoItems().map((i) => i.label));
    assert.deepEqual(itens, ['EV-01 — Envasadora Body Splash — Envasadora · Envase · Linha 1']);
    await page.fill('#pcdAtivo', 'linha 1');
    await page.waitForSelector('.kt-ac-list.open', {timeout: 4000});
    await page.locator('.kt-ac-list.open').getByText('EV-01', {exact: false}).first().click();
    await page.waitForFunction(() => document.getElementById('pcdAtivoKey').value === 'a1', null, {timeout: 4000});
    const painel = await page.locator('#pcdAtivoPainel').innerText();
    assert.match(painel, /EV-01 — Envasadora Body Splash/);
    assert.match(painel, /Usar TEC ASSISTENCIA \(assistência técnica\)/);
    assert.match(painel, /Usar LOMAR PACK \(fabricante\)/);
    assert.match(painel, /MN-00001 Bico dosador/);
    assert.doesNotMatch(painel, /MN-00099/, 'peça fora do cadastro não é oferecida');

    // Vínculo: Kuryos, uso e consumo, já preenchido.
    const vinc = await page.evaluate(() => lerVinculoEditor(document.querySelector('#pcdVinculo .vinc-editor')));
    assert.equal(vinc.geral, true);

    // Fornecedor do ativo com um clique; peças: uma, depois "todas" sem duplicar.
    await page.click('[data-pcd-forn="f2"]');
    assert.equal(await page.inputValue('#pcdFornecedorKey'), 'f2');
    assert.equal(await page.inputValue('#pcdFornecedor'), 'TEC ASSISTENCIA');
    await page.click('[data-pcd-peca="MN-00001"]');
    let b = await page.evaluate(() => pcdItensBuilder.map((i) => [i.materialCodigo, i.qtd]));
    assert.deepEqual(b, [['MN-00001', 4]], 'peça ocupa a linha vazia, com a qtd de referência');
    assert.equal(await page.isDisabled('[data-pcd-peca="MN-00001"]'), true);
    await page.click('#pcdPecasTodas');
    b = await page.evaluate(() => pcdItensBuilder.map((i) => [i.materialCodigo, i.qtd]));
    assert.deepEqual(b, [['MN-00001', 4], ['MN-00002', 1]]);
    assert.equal(await page.locator('#pcdPecasTodas').count(), 0);

    // Grava: origem do ativo no PC, itens e o resto do PC direto como sempre.
    await page.selectOption('#pcdMotivo', 'COMPRA_DIRETA');
    await page.click('.rota-atalho[data-local="pcdDestino"][data-chave="FABRICA"]');
    await page.check('#pcdRotaConfirmada');
    await page.click('#modalPcdSave');
    await page.waitForFunction(() => window.__writes.some((w) => String(w.path).startsWith('pedidos_compra/') && w.op === 'set'), null, {timeout: 6000});
    const pc = (await page.evaluate(() => window.__writes)).find((w) => String(w.path).startsWith('pedidos_compra/') && w.op === 'set').v;
    assert.deepEqual(pc.origem, {tipo: 'ATIVO', ativoId: 'a1', ativoCodigo: 'EV-01', ativoNome: 'Envasadora Body Splash',
      fornecedorAssistenciaKey: 'f2', fornecedorFabricanteKey: 'f1'});
    assert.equal(pc.fornecedorKey, 'f2');
    assert.equal(pc.origemDireta, true);
    assert.equal(pc.status, 'ENVIADO');
    assert.deepEqual(Object.values(pc.itens).map((i) => [i.materialCodigo, i.qtd, i.vinculo.geral]), [['MN-00001', 4, true], ['MN-00002', 1, true]]);
    await page.waitForFunction(() => !document.getElementById('modalPcDireto').classList.contains('open'), null, {timeout: 4000});

    // Selo 🔧 na lista de PCs e a ficha do ativo enxerga o PC direto.
    assert.match(await page.evaluate((v) => origemAtivoHtml(v), pc), /🔧 EV-01 — Envasadora Body Splash/);
    const fichas = await page.evaluate((v) => Ativos.comprasDoAtivo('a1', {}, {}, {novo: v}), pc);
    assert.equal(fichas.length, 1);
    assert.equal(fichas[0].direto, true);
    assert.equal(fichas[0].pcs[0].numero, pc.numeroFormatado);

    // Reabrir: equipamento limpo; PC sem equipamento grava origem null.
    await page.click('#btnPcDireto');
    await page.waitForSelector('#pcdAtivo');
    assert.equal(await page.inputValue('#pcdAtivo'), '');
    assert.equal(await page.inputValue('#pcdAtivoKey'), '');
    await page.evaluate(() => {
      document.getElementById('pcdFornecedorKey').value = 'f1';
      document.getElementById('pcdFornecedor').value = 'LOMAR PACK';
      document.getElementById('pcdMotivo').value = 'COMPRA_DIRETA';
      pcdItensBuilder = [{materialCodigo: 'EP-00036', qtd: 100, precoUnit: 1}];
      window.lerVinculoEditor = () => ({geral: true, pedidos: []});
      PropriedadeEstoque.vinculoAceito = () => true;
      RotasPC.preencherEditor('pcdOrigem', RotasPC.origemFornecedor(allFornecedores.f1, 'f1', 'LOMAR PACK'));
      window.__writes = [];
    });
    await page.click('.rota-atalho[data-local="pcdDestino"][data-chave="FABRICA"]');
    await page.check('#pcdRotaConfirmada');
    await page.click('#modalPcdSave');
    await page.waitForFunction(() => window.__writes.some((w) => String(w.path).startsWith('pedidos_compra/') && w.op === 'set'), null, {timeout: 6000});
    const pc2 = (await page.evaluate(() => window.__writes)).find((w) => String(w.path).startsWith('pedidos_compra/') && w.op === 'set').v;
    assert.equal(pc2.origem, null);
    assert.deepEqual(errors, []);
    console.log('run_pc_direto_ativo_ui_test: OK (busca de ativos, peças e fornecedor do equipamento, origem ATIVO no PC direto)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
