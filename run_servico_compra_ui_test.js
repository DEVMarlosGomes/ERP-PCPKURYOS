'use strict';
/* Compra aberta pelo ativo, com linha de SERVIÇO (16/11/2026), telas reais:
   - Compras › Solicitações: origem 🔧 EV-01 e "Serviço" visíveis; "+ Serviço"
     grava a linha sem material;
   - Compras › Pedidos: "Atestar serviço" grava qtdRecebida, quem/quando e o
     status pela regra do servidor;
   - Logística › A Receber: PC só de serviço não entra na fila; PC misto
     mostra só a peça.
   Harness de run_pc_direto_ui_test.js (dados por caminho, gravações em __writes).
   Rodar: PLAYWRIGHT_MODULE=<node_modules/playwright> node run_servico_compra_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const origem = {tipo: 'ATIVO', ativoId: 'a2', ativoCodigo: 'EV-01', ativoNome: 'Envasadora pistão'};
const serv = {tipoItem: 'SERVICO', descricao: 'Revisão do pistão dosador', materialCodigo: '', materialNome: 'Revisão do pistão dosador', qtd: 1, unidade: 'SV', qtdRecebida: 0};
const peca = {materialCodigo: 'MN-00001', materialNome: 'ROLAMENTO 6204', qtd: 2, unidade: 'un', qtdRecebida: 0, vinculo: {geral: true}};
function dados(role) {
  return {
    'usuarios/u1': {nome: 'Ana Compras', email: 'a@kuryos.com', role},
    config: {}, fornecedores: {f2: {nomeFantasia: 'Refrigeração Sul'}},
    materiais: {'MN-00001': {mpCodigo: 'MN-00001', mpNome: 'ROLAMENTO 6204', tipo: 'MN', unidade: 'un'}},
    solicitacoes_compra: {s1: {numeroFormatado: 'SC-0042', status: 'PENDENTE', criadoEm: '2026-11-16T10:00:00Z', solicitante: 'Carlos',
      justificativa: 'Manutenção EV-01 — Envasadora pistão: vazamento', origemModulo: 'MANUTENCAO', origem, itens: {i1: serv, i2: peca}}},
    pedidos_compra: {
      pS: {numeroFormatado: 'PC-0091', status: 'ENVIADO', fornecedorNome: 'Refrigeração Sul', dataCriacao: '2026-11-16T11:00:00Z', itens: {x: Object.assign({}, serv, {vinculo: {geral: true}})}},
      pM: {numeroFormatado: 'PC-0092', status: 'ENVIADO', fornecedorNome: 'Rolamentos SP', dataCriacao: '2026-11-16T11:05:00Z', itens: {x: Object.assign({}, serv, {vinculo: {geral: true}}), y: peca}}
    }
  };
}

async function abrir(browser, pagina, role) {
  const page = await browser.newPage({viewport: {width: 1500, height: 1100}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.type() === 'prompt' ? d.accept('NF 321 do prestador') : d.accept());
  await page.addInitScript(({data}) => {
    window.__writes = []; window.__iniciado = false;
    const exige = q => { if (!window.__iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (" + q + ')'); };
    window.firebase = {
      initializeApp(cfg) { if (!cfg || !cfg.databaseURL) throw new Error('sem databaseURL'); window.__iniciado = true; },
      auth() { exige('auth'); return {onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'a@kuryos.com', displayName: 'Ana'}), 0); }, signOut() { return Promise.resolve(); }, currentUser: {email: 'a@kuryos.com'}}; },
      functions() { return {httpsCallable: () => () => Promise.resolve({data: {}})}; },
      app() { return {functions: () => ({httpsCallable: () => () => Promise.resolve({data: {}})})}; },
      database() {
        exige('database');
        const ref = path => {
          const v = () => (path in data ? structuredClone(data[path]) : null);
          const snap = {val: v, exists: () => path in data, key: String(path).split('/').pop(), forEach(cb) { Object.keys(v() || {}).forEach(k => cb({key: k, val: () => v()[k]})); }};
          return {path, key: 'k' + Math.random().toString(36).slice(2, 8),
            once(ev, cb) { if (cb) cb(snap); return Promise.resolve(snap); },
            on(ev, cb) { setTimeout(() => cb(snap), 0); return cb; }, off() {},
            child(p) { return ref(path + '/' + p); }, push() { return ref(path + '/k' + Math.random().toString(36).slice(2, 8)); },
            orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; }, startAt() { return this; }, orderByKey() { return this; },
            set(x) { window.__writes.push({op: 'set', path, v: x}); return Promise.resolve(); },
            update(x) { window.__writes.push({op: 'update', path, v: x}); return Promise.resolve(); },
            remove() { return Promise.resolve(); },
            transaction(fn) { const r = fn(path === 'config/contadores/solicitacaoCompra' ? 42 : null); return Promise.resolve({committed: true, snapshot: {val: () => r}}); }};
        };
        return {ref, ServerValue: {TIMESTAMP: 0}};
      }
    };
  }, {data: dados(role)});
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'cmp.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://cmp.test/' + pagina);
  await page.waitForSelector('.kt-sidebar', {timeout: 8000}).catch(e => { console.log('ERROS DA PÁGINA:', errors); throw e; });
  await page.waitForFunction(() => window.currentUser, null, {timeout: 8000});
  return {page, errors};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    // ── Compras › Solicitações ──
    let {page, errors} = await abrir(browser, 'compras.html', 'admin');
    await page.waitForFunction(() => /SC-0042/.test(document.body.innerText));
    const sc = await page.locator('tr', {hasText: 'SC-0042'}).innerText();
    assert.match(sc, /EV-01 — Envasadora pistão/, 'Compras vê de qual equipamento veio (o 🔧 vira ícone do sistema)');
    assert.match(sc, /Serviço\s+Revisão do pistão dosador \(1 SV\)/);
    assert.match(sc, /sem estoque — Compras atesta no PC/);
    assert.match(sc, /MN-00001 — ROLAMENTO 6204/);
    // "+ Serviço" na SC feita em Compras.
    await page.evaluate(() => openModalSolicitacao());
    await page.click('#btnAddScServico');
    await page.locator('#scItensBuilder .sci-desc').last().fill('Calibração externa da balança BL-01');
    await page.fill('#scJustificativa', 'Calibração anual vencendo');
    await page.click('#modalScSave');
    await page.waitForFunction(() => window.__writes.some(w => w.op === 'update' && Object.keys(w.v).some(k => k.startsWith('solicitacoes_compra/'))), null, {timeout: 8000});
    const gravada = await page.evaluate(() => { const w = window.__writes.find(x => x.op === 'update' && Object.keys(x.v).some(k => k.startsWith('solicitacoes_compra/'))); return Object.values(w.v)[0]; });
    const itens = Object.values(gravada.itens);
    assert.equal(itens.length, 1, 'a linha de material em branco não vai');
    assert.deepEqual(itens[0], {tipoItem: 'SERVICO', descricao: 'Calibração externa da balança BL-01', materialCodigo: '',
      materialNome: 'Calibração externa da balança BL-01', qtd: 1, unidade: 'SV', obs: ''});

    // ── Compras › Pedidos: atestar serviço ──
    await page.click('.tab[data-tab="pedidos"]');
    const misto = page.locator('tr', {hasText: 'PC-0092'});
    await misto.waitFor();
    assert.match(await misto.innerText(), /Serviço: Revisão do pistão dosador/);
    await misto.locator('.pc-atestar').click();
    await page.waitForFunction(() => window.__writes.some(w => w.op === 'update' && w.v['pedidos_compra/pM/status']));
    const u = await page.evaluate(() => window.__writes.find(w => w.op === 'update' && w.v['pedidos_compra/pM/status']).v);
    assert.equal(u['pedidos_compra/pM/itens/x/qtdRecebida'], 1);
    assert.equal(u['pedidos_compra/pM/itens/x/atestado'].por, 'Ana Compras');
    assert.equal(u['pedidos_compra/pM/itens/x/atestado'].obs, 'NF 321 do prestador');
    assert.equal(u['pedidos_compra/pM/status'], 'RECEBIDO_PARCIAL', 'a peça ainda não chegou');
    assert.equal(u['pedidos_compra/pM/itens/y/qtdRecebida'], undefined, 'atestar não mexe na peça');
    assert.deepEqual(errors, []);
    await page.close();

    // ── Logística › A Receber ──
    ({page, errors} = await abrir(browser, 'logistica.html', 'admin'));
    await page.waitForFunction(() => /PC-0092/.test((document.getElementById('receberList') || {}).innerText || ''), null, {timeout: 8000});
    const fila = await page.locator('#receberList').innerText();
    assert.doesNotMatch(fila, /PC-0091/, 'PC só de serviço não tem o que receber na doca');
    assert.match(fila, /ROLAMENTO 6204|MN-00001/);
    assert.doesNotMatch(fila, /Revisão do pistão/, 'linha de serviço não aparece para receber');
    assert.deepEqual(errors, []);
    console.log('OK serviço na compra: origem do ativo e Serviço em Compras, + Serviço na SC, atestado com status do servidor, Logística só recebe peça.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
