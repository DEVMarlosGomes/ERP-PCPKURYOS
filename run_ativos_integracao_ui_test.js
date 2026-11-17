'use strict';
/* Manutenção › Ativos ligada a Cadastros e Compras (16/11/2026), tela real
   (ativos.html + ativos-tela.js + auth_check.js) com Firebase simulado:
   - fabricante em texto livre sugere o fornecedor do cadastro pela marca;
     assistência técnica escolhida da lista; salvar grava chave e nome e não
     apaga as peças;
   - peça só MN/MU; liga ao equipamento;
   - Solicitar compra: peça + serviço viram SC PENDENTE com origem no ativo,
     numerada pelo contador de SC; o andamento (cotação/PC) volta para o ativo.
   Rodar: PLAYWRIGHT_MODULE=<node_modules/playwright> node run_ativos_integracao_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function dados() {
  return {
    usuarios: {u1: {nome: 'Carlos Manutenção', email: 'c@kuryos.com', role: 'production', modulos: {manutencao: true}}},
    config: {linhas: ['Linha 1'], contadores: {solicitacaoCompra: 41}},
    ativos: {
      a1: {codigo: 'CD-01', nome: 'Codificadora jato de tinta', tipo: 'CODIFICADORA', area: 'ENVASE', linha: 'Linha 1', situacao: 'OPERACIONAL',
        fabricante: 'VIDEOJET', pecas: {'MU-00005': {materialCodigo: 'MU-00005', materialNome: 'SOLVENTE DE LIMPEZA', unidade: 'L', qtdReferencia: 1}}},
      a2: {codigo: 'EV-01', nome: 'Envasadora pistão', tipo: 'ENVASADORA', area: 'ENVASE', situacao: 'OPERACIONAL', fabricante: 'N/I'}
    },
    fornecedores: {
      f1: {nomeFantasia: 'VIDEOJET', razaoSocial: 'VIDEOJET DO BRASIL LTDA', cnpj: '11.111.111/0001-11'},
      f2: {nomeFantasia: 'Refrigeração Sul', razaoSocial: 'RS SERVICOS', cnpj: '22.222.222/0001-22'},
      f3: {nomeFantasia: 'AZ EMBALAGENS'}
    },
    materiais: {
      'MN-00001': {mpCodigo: 'MN-00001', mpNome: 'BICO DE IMPRESSÃO 60 MICRA', tipo: 'MN', unidade: 'un'},
      'MU-00005': {mpCodigo: 'MU-00005', mpNome: 'SOLVENTE DE LIMPEZA', tipo: 'MU', unidade: 'L'},
      'EP-00183': {mpCodigo: 'EP-00183', mpNome: 'FRASCO 200ML', tipo: 'EP', unidade: 'un'}
    },
    solicitacoes_compra: {
      s0: {numero: 40, numeroFormatado: 'SC-0040', status: 'CONSOLIDADA', criadoEm: '2026-11-01T10:00:00Z',
        origem: {tipo: 'ATIVO', ativoId: 'a1', ativoCodigo: 'CD-01'}, itens: {i: {materialCodigo: 'MU-00005', materialNome: 'SOLVENTE DE LIMPEZA', qtd: 2, unidade: 'L'}}}
    },
    processos_cotacao: {c1: {numeroFormatado: 'COT-0044', status: 'CONCLUIDO', solicitacoesOrigem: {s0: {}}}},
    pedidos_compra: {p1: {numeroFormatado: 'PC-0090', status: 'ENVIADO', fornecedorNome: 'VIDEOJET', dataPrevistaEntrega: '2026-11-20',
      itens: {x: {materialCodigo: 'MU-00005', qtd: 2, origemSolicitacaoKey: 's0'}}}}
  };
}

async function abrir(browser) {
  const page = await browser.newPage({viewport: {width: 1400, height: 1000}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(({data}) => {
    const db = data; window.__db = db; window.__iniciado = false;
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const ouvintes = [];
    const avisar = () => ouvintes.forEach(([p, cb]) => setTimeout(() => cb(snap(p)), 0));
    const gravar = (p, v) => {
      const ks = partes(p); let o = db;
      ks.slice(0, -1).forEach(k => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
      if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = structuredClone(v);
    };
    // Igual ao RTDB: campo null some ao gravar.
    const podar = (v) => { if (v && typeof v === 'object') { Object.keys(v).forEach(k => { if (v[k] === null) delete v[k]; else podar(v[k]); }); } return v; };
    const snap = (p) => { const v = ler(p); const c = v === undefined ? null : structuredClone(v); return {val: () => c, exists: () => c !== null, key: partes(p).pop(), forEach(cb) { Object.keys(c || {}).forEach(k => cb({key: k, val: () => c[k]})); }}; };
    let seq = 0;
    const exige = q => { if (!window.__iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (" + q + ')'); };
    window.firebase = {
      initializeApp(cfg) { if (!cfg || !cfg.databaseURL) throw new Error('sem databaseURL'); window.__iniciado = true; },
      auth() {
        exige('auth');
        return {currentUser: {uid: 'u1', email: 'c@kuryos.com'}, onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'c@kuryos.com', displayName: 'Carlos'}), 0); }, signOut() { return Promise.resolve(); }};
      },
      database() {
        exige('database');
        const ref = (path) => ({path, key: partes(path).pop(),
          once(ev, cb) { const s = snap(path); if (cb) cb(s); return Promise.resolve(s); },
          on(ev, cb) { ouvintes.push([path, cb]); setTimeout(() => cb(snap(path)), 0); return cb; },
          off() {}, child(c) { return ref(path + '/' + c); }, orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
          push() { seq++; return ref(path + '/-T' + String(seq).padStart(3, '0')); },
          set(v) { gravar(path, podar(structuredClone(v))); avisar(); return Promise.resolve(); },
          update(obj) { Object.entries(obj).forEach(([k, v]) => gravar(path ? path + '/' + k : k, v)); avisar(); return Promise.resolve(); },
          remove() { gravar(path, null); avisar(); return Promise.resolve(); },
          transaction(fn) { const r = fn(ler(path) === undefined ? null : structuredClone(ler(path))); if (r !== undefined) gravar(path, r); avisar(); return Promise.resolve({committed: r !== undefined, snapshot: snap(path)}); }});
        return {ref: (p) => ref(p || '')};
      }
    };
  }, {data: dados()});
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'atv.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://atv.test/ativos.html');
  await page.waitForSelector('#lista table', {timeout: 8000});
  return {page, errors};
}

const linha = (page, cod) => page.locator('#lista tr', {hasText: cod});
// Como a pessoa faz: digita e clica na opção da lista suspensa do sistema
// (shared/lista-suspensa.js converte todo <input list>).
async function escolher(page, sel, digitar, opcao) {
  await page.fill(sel, digitar);
  const op = page.locator('.kt-ac-list.open [role="option"]', {hasText: opcao}).first();
  await op.waitFor({timeout: 5000});
  await op.click();
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const {page, errors} = await abrir(browser);
    await page.waitForFunction(() => document.querySelectorAll('#dlFornecedores option').length === 3);
    // Selos na lista: peça ligada; SC consolidada não conta como "em compra".
    assert.match(await linha(page, 'CD-01').innerText(), /Peças e compras\s+1 peça/);

    // ── 1. Fornecedores do ativo ──
    await linha(page, 'CD-01').locator('[data-editar]').click();
    await page.waitForSelector('#aFabSug [data-sug]');
    assert.match(await page.locator('#aFabSug').innerText(), /Parece com: VIDEOJET/);
    await page.click('#aFabSug [data-sug="f1"]');
    assert.match(await page.inputValue('#aFabForn'), /^VIDEOJET · 11\.111\.111\/0001-11/);
    await escolher(page, '#aAssForn', 'refrigeracao', 'Refrigeração Sul');
    assert.match(await page.inputValue('#aAssForn'), /^Refrigeração Sul · 22\.222/);
    await page.click('#aSalvar');
    await page.waitForFunction(() => window.__db.ativos.a1.fornecedorAssistenciaKey === 'f2');
    const a1 = await page.evaluate(() => window.__db.ativos.a1);
    assert.equal(a1.fornecedorFabricanteKey, 'f1');
    assert.equal(a1.fornecedorFabricanteNome, 'VIDEOJET');
    assert.equal(a1.fornecedorAssistenciaNome, 'Refrigeração Sul');
    assert.ok(a1.pecas && a1.pecas['MU-00005'], 'salvar o cadastro não apaga as peças');
    assert.match(await linha(page, 'CD-01').innerText(), /Assistência: Refrigeração Sul/);
    // Fornecedor digitado e não escolhido da lista é recusado.
    await linha(page, 'EV-01').locator('[data-editar]').click();
    assert.doesNotMatch(await page.locator('#aFabSug').innerText(), /Parece com/, 'N/I não sugere ninguém');
    await page.fill('#aAssForn', 'qualquer coisa');
    await page.click('#aSalvar');
    assert.match(await page.locator('#aErros').innerText(), /Escolha o fornecedor na lista/);
    await page.click('#aCancelar');

    // ── 2. Peças ──
    await linha(page, 'CD-01').locator('[data-pecas]').click();
    await page.waitForSelector('#pcCompras table');
    const modal = await page.locator('.md').innerText();
    assert.match(modal, /Fabricante: VIDEOJET · Assistência técnica: Refrigeração Sul/);
    assert.match(modal, /SC-0040[\s\S]*Pedido de Compra emitido[\s\S]*COT-0044[\s\S]*PC-0090 VIDEOJET[\s\S]*previsto 20\/11\/2026/);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#dlPecas option')].some(o => /EP-00183/.test(o.value))), false, 'a lista só oferece MN/MU');
    await page.fill('#pcMat', 'EP-00183 — FRASCO 200ML');
    await page.keyboard.press('Tab');   // sair do campo fecha a lista suspensa
    await page.click('#pcAdd');
    assert.match(await page.locator('#pcErro').innerText(), /EP-00183 é EP\. Peça de equipamento é MN/);
    await escolher(page, '#pcMat', 'bico', 'BICO DE IMPRESSÃO');
    await page.fill('#pcQtd', '2');
    await page.fill('#pcObs', 'cabeçote');
    await page.click('#pcAdd');
    await page.waitForFunction(() => window.__db.ativos.a1.pecas['MN-00001']);
    assert.deepEqual(await page.evaluate(() => window.__db.ativos.a1.pecas['MN-00001']),
      {materialCodigo: 'MN-00001', materialNome: 'BICO DE IMPRESSÃO 60 MICRA', unidade: 'un', qtdReferencia: 2, obs: 'cabeçote'});

    // ── 3. Solicitar compra (peça + serviço) ──
    await page.waitForSelector('#pcSolicitar');
    await page.click('#pcSolicitar');
    await page.locator('#scLinhas label', {hasText: 'MN-00001'}).locator('input').check();
    await page.click('#scAddServ');
    await page.locator('#scLinhas input[data-c="descricao"]').fill('Revisão do cabeçote pela assistência técnica');
    await page.fill('#scJust', 'curto');
    await page.click('#scEnviar');
    assert.match(await page.locator('#scErro').innerText(), /mínimo 10/);
    await page.fill('#scJust', 'Falha de impressão no lote, cabeçote entupido');
    await page.click('#scEnviar');
    await page.waitForFunction(() => Object.keys(window.__db.solicitacoes_compra).length === 2);
    const nova = await page.evaluate(() => Object.entries(window.__db.solicitacoes_compra).find(([k]) => k !== 's0')[1]);
    assert.equal(nova.numeroFormatado, 'SC-0042', 'numerada pelo contador de SC (41 → 42)');
    assert.equal(nova.status, 'PENDENTE');
    assert.equal(nova.origem.tipo, 'ATIVO');
    assert.equal(nova.origem.ativoId, 'a1');
    assert.equal(nova.origem.fornecedorAssistenciaKey, 'f2');
    assert.match(nova.justificativa, /^Manutenção CD-01 — Codificadora jato de tinta: Falha de impressão/);
    const itens = Object.values(nova.itens);
    assert.deepEqual(itens.map(i => i.tipoItem || 'PECA').sort(), ['PECA', 'SERVICO']);
    assert.equal(itens.find(i => i.materialCodigo === 'MN-00001').qtd, 2, 'quantidade de referência vem preenchida');
    assert.equal(itens.find(i => i.tipoItem === 'SERVICO').unidade, 'SV');
    assert.equal(itens.some(i => i.materialCodigo === 'MU-00005'), false, 'peça não marcada não vai');
    // Voltou ao modal com a SC nova no topo e o selo "em compra" na lista.
    await page.waitForFunction(() => /SC-0042[\s\S]*Aguardando aprovação de Compras/.test((document.querySelector('#pcCompras') || {}).innerText || ''));
    await page.click('#pcFechar');
    assert.match(await linha(page, 'CD-01').innerText(), /1 em compra/);
    assert.deepEqual(errors, []);
    console.log('OK Ativos × Cadastros/Compras: fornecedor pela marca, assistência da lista, peça MN, SC do ativo com peça + serviço numerada, andamento SC→cotação→PC.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
