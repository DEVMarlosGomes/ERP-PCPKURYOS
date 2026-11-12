'use strict';
/* Amostras de MP (11/11/2026): aba real em cadastros.html no Chrome, Firebase simulado (harness de
   run_nome_material_versao_test.js). A callable amostraMp roda no Node com o serviço REAL
   (functions/amostras_mp.js) sobre uma cópia do estado da página; o resultado volta para a página.
     PLAYWRIGHT_MODULE=<caminho do playwright> node run_amostras_mp_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const A = require('./functions/amostras_mp.js');

function bancoFalso(inicial) {
  const raiz = JSON.parse(JSON.stringify(inicial || {}));
  const partes = (p) => String(p || '').split('/').filter(Boolean);
  const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), raiz);
  const gravar = (p, v) => {
    const ks = partes(p); let o = raiz;
    ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
  };
  let seq = 0;
  const snap = (p) => { const v = ler(p); return {val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))), exists: () => v != null}; };
  const ref = (p) => ({
    key: partes(p).pop() || null,
    once: async () => snap(p), set: async (v) => gravar(p, v),
    update: async (obj) => Object.entries(obj).forEach(([k, v]) => gravar((p ? p + '/' : '') + k, v)),
    push: () => ref((p ? p + '/' : '') + '-a' + Date.now().toString(36) + String(++seq).padStart(4, '0')),
    transaction: async (fn) => { const r = fn(snap(p).val()); if (r !== undefined) gravar(p, r); return {committed: r !== undefined, snapshot: snap(p)}; },
  });
  return {ref, raiz};
}

async function abrir(browser, estado, pagina) {
  const page = await browser.newPage({viewport: {width: 1500, height: 1100}});
  const errors = [];
  page.__chamadas = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.exposeFunction('__amostraMpNode', async (data, est) => {
    page.__chamadas++;
    const db = bancoFalso(est);
    try {
      const r = await A.criarServico({db}).executar('u1', data);
      return {r, amostras_mp: db.raiz.amostras_mp || null, contador: ((db.raiz.config || {}).contadores || {}).amostrasMp || null};
    } catch (e) { return {erro: {code: e.code, message: e.message}}; }
  });
  await page.addInitScript((data) => {
    const db = data;
    window.__db = db;
    let iniciado = false;
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const ouvintes = [];
    const notificar = (bruto) => {
      const p = partes(bruto).join('/');
      ouvintes.forEach((o) => { const a = partes(o.path).join('/'); if (!a || p === a || p.indexOf(a + '/') === 0 || a.indexOf(p + '/') === 0) o.avisar(); });
    };
    const gravar = (p, v) => {
      const ks = partes(p); let o = db;
      ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
      if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = structuredClone(v);
      notificar(p);
    };
    window.__gravar = gravar;
    let seq = 0;
    window.firebase = {
      initializeApp(cfg) { if (!cfg || !cfg.databaseURL) throw new Error('sem databaseURL'); iniciado = true; },
      app() { return {}; },
      auth() {
        if (!iniciado) throw new Error('sem app');
        return {currentUser: {uid: 'u1', email: 'g@kuryos.com'},
          onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'g@kuryos.com', displayName: 'Gustavo'}), 0); },
          signOut() { return Promise.resolve(); }};
      },
      functions() {
        return {httpsCallable(nome) {
          return async (data) => {
            if (nome !== 'amostraMp') throw new Error('callable inesperada ' + nome);
            const est = {usuarios: db.usuarios, materiais: db.materiais, fornecedores: db.fornecedores, amostras_mp: db.amostras_mp,
              amostras_mp_pedidos: db.amostras_mp_pedidos, config: db.config};
            const res = await window.__amostraMpNode(data, JSON.parse(JSON.stringify(est)));
            if (res.erro) throw Object.assign(new Error(res.erro.message), {code: 'functions/' + res.erro.code});
            gravar('amostras_mp', res.amostras_mp);
            if (res.contador) gravar('config/contadores/amostrasMp', res.contador);
            return {data: res.r};
          };
        }};
      },
      database() {
        if (!iniciado) throw new Error('sem app');
        const ref = (path) => {
          const valor = () => { const v = ler(path); return v === undefined ? null : structuredClone(v); };
          const snap = () => { const v = valor(); return {val: () => v, exists: () => v !== null, key: partes(path).pop(),
            forEach(cb) { Object.entries(v || {}).forEach(([k, x]) => cb({key: k, val: () => x})); }}; };
          return {path, key: partes(path).pop(),
            once(ev, cb) { const sn = snap(); if (cb) cb(sn); return Promise.resolve(sn); },
            get() { return Promise.resolve(snap()); },
            on(ev, cb) { const avisar = () => cb(snap()); ouvintes.push({path, avisar}); setTimeout(avisar, 0); return cb; },
            off() {}, child(c) { return ref(path + '/' + c); },
            orderByChild() { return this; }, orderByKey() { return this; }, equalTo() { return this; }, limitToLast() { return this; }, startAt() { return this; },
            push(v) { seq++; const filho = ref(path + '/-N' + seq); if (v === undefined) return filho; gravar(filho.path, v); const pr = Promise.resolve(filho); pr.key = filho.key; return pr; },
            set(v) { gravar(path, v); return Promise.resolve(); },
            update(obj) { Object.entries(obj).forEach(([k, v]) => gravar(path + '/' + k, v)); return Promise.resolve(); },
            remove() { gravar(path, null); return Promise.resolve(); },
            transaction(fn) { const r = fn(valor()); if (r !== undefined) gravar(path, r); return Promise.resolve({committed: r !== undefined, snapshot: snap()}); }};
        };
        return {ref: (p) => ref(p || '')};
      }
    };
    window.firebase.database.ServerValue = {TIMESTAMP: {'.sv': 'timestamp'}};
  }, estado);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'cad.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://cad.test/' + pagina);
  await page.waitForFunction(() => window.currentUser && window.currentUser.nome, null, {timeout: 12000});
  await page.waitForSelector('#tableBody-amo', {state: 'attached', timeout: 8000});
  return {page, errors};
}

const HOJE = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
const amostra = (extra) => Object.assign({codigo: 'AM-0007', tipo: 'NOVA', materialNovo: {nome: 'Pigmento Rosa X', descricao: 'para batom'},
  fornecedor: {key: 'f1', nome: 'Lunagreen'}, custoKg: 120, custoAmostra: 0, quantidade: {valor: 200, unidade: 'g'}, motivo: 'DESENVOLVIMENTO',
  previsaoChegada: '2026-11-01', observacoes: '', status: 'SOLICITADA', solicitante: {uid: 'x', nome: 'Paula P&D', em: '2026-10-30T12:00:00Z'},
  historico: {h1: {acao: 'CRIAR', de: null, para: 'SOLICITADA', por: {uid: 'x', nome: 'Paula P&D'}, em: '2026-10-30T12:00:00Z'}}}, extra);
function estado(perfil, amostras) {
  return {
    usuarios: {u1: perfil}, clientes: {}, solicitacoes_cadastro_material: {}, categorias: {}, estoque: {}, ops: {}, produtos: {}, formulas: {}, bom: {}, especificacoes: {},
    config: {tiposEnsaio: [], contadores: {amostrasMp: 7}},
    materiais: {'MPGR-00127': {mpCodigo: 'MPGR-00127', mpNome: 'ALCOOL ETILICO 96°G/L', tipo: 'MPGR', ativo: true, fornecedores: {f1: {statusHomologacao: 'aguardando_homologacao'}}}},
    fornecedores: {f1: {razaoSocial: 'Lunagreen Ltda', nomeFantasia: 'Lunagreen', ativo: true}},
    amostras_mp: amostras || {},
  };
}
const PD = {nome: 'Paula P&D', email: 'p@k.com', role: 'pd'};
const LOG = {nome: 'Lia Logística', email: 'l@k.com', role: 'logistica'};
const YAS = {nome: 'Yasmim', email: 'y@k.com', role: 'comercial', modulos: {pd: true, cadastros: true}};
const abasVisiveis = (page) => page.$$eval('#mainTabs .main-tab', (bs) => bs.filter((b) => b.offsetParent !== null).map((b) => b.getAttribute('data-maintab')));
const ativa = (page) => page.$eval('#mainTabs .main-tab.active', (b) => b.getAttribute('data-maintab'));

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (m) => { n++; console.log('  ok  ' + m); };
  try {
    // 1. P&D: só Amostras e Fornecedores; cria NOVA; cadastra fornecedor pelo link e ele entra na lista.
    let {page, errors} = await abrir(browser, estado(PD), 'cadastros.html');
    await page.waitForFunction(() => document.querySelector('#mainTabs .main-tab.active').getAttribute('data-maintab') === 'amostras');
    assert.deepEqual((await abasVisiveis(page)).sort(), ['amostras', 'fornecedores']);
    await page.click('#btnNova-amo');
    await page.selectOption('#amTipo', 'NOVA');
    await page.fill('#amNome', 'Pigmento Rosa X');
    await page.click('#amNovoForn');
    await page.waitForSelector('#modalFornecedor-forn.open');
    await page.fill('#fnRazaoSocial-forn', 'Pigmentos Brasil Ltda');
    await page.click('#modalFornecedorSave-forn');
    await page.waitForFunction(() => [...document.querySelectorAll('#amFornecedor option')].some((o) => /PIGMENTOS BRASIL/i.test(o.textContent) && o.selected), null, {timeout: 5000});
    await page.fill('#amCustoKg', '120,50');
    await page.fill('#amCustoAmostra', '0');
    await page.fill('#amQtd', '200');
    await page.selectOption('#amUnidade', 'g');
    await page.selectOption('#amMotivo', 'DESENVOLVIMENTO');
    await page.fill('#amPrevisao', '2026-12-01');
    await page.click('#amSalvar');
    await page.waitForFunction(() => /AM-0008/.test(document.getElementById('tableBody-amo').innerText), null, {timeout: 5000});
    const criada = Object.values(await page.evaluate(() => window.__db.amostras_mp)).find((a) => a.codigo === 'AM-0008');
    assert.equal(criada.status, 'SOLICITADA');
    assert.equal(criada.custoKg, 120.5);
    assert.match(criada.fornecedor.nome, /PIGMENTOS BRASIL/i, "fornecedor criado pelo link (o Cadastros grava em maiúsculas)");
    assert.deepEqual(errors, []);
    await page.close();
    ok('P&D vê só Amostras de MP e Fornecedores; cria fornecedor pelo link e a amostra AM-0008');

    // 2. Logística: ?tab=materiais cai em Amostras; "A receber" com atrasada destacada; dá baixa.
    ({page, errors} = await abrir(browser, estado(LOG, {a1: amostra(), a2: amostra({codigo: 'AM-0009', previsaoChegada: '2099-01-01'})}), 'cadastros.html?tab=materiais'));
    await page.waitForFunction(() => document.querySelector('#mainTabs .main-tab.active').getAttribute('data-maintab') === 'amostras');
    assert.deepEqual(await abasVisiveis(page), ['amostras']);
    assert.equal(await page.$eval('#visao-amo', (s) => s.value), 'receber');
    await page.waitForSelector('#tableBody-amo tr[data-id="a1"].atrasada');
    assert.equal(await page.locator('#tableBody-amo tr[data-id="a2"].atrasada').count(), 0);
    assert.equal(await page.locator('#btnNova-amo:visible').count(), 0, 'logística não cria');
    await page.click('#tableBody-amo .btn-abrir-amo[data-id="a1"]');
    await page.waitForSelector('#modalBgDet-amo.open');
    assert.equal(await page.$eval('#amRecData', (i) => i.value), HOJE);
    await page.selectOption('#amRecForma', 'MOTOBOY');
    await page.click('#modalBgDet-amo [data-acao="RECEBER"]');
    await page.waitForFunction(() => window.__db.amostras_mp.a1.status === 'RECEBIDA');
    assert.equal(await page.evaluate(() => window.__db.amostras_mp.a1.recebimento.forma), 'MOTOBOY');
    assert.equal(await page.locator('#modalBgDet-amo [data-acao="HOMOLOGAR"]').count(), 0, 'logística não homologa');
    assert.deepEqual(errors, []);
    await page.close();
    ok('logística: cai em Amostras, vê "A receber" com a atrasada em destaque e dá baixa (motoboy)');

    // 3. P&D: reprovar sem parecer não chama o servidor; homologar; Cadastrar MP vai para a fila.
    const recebida = amostra({status: 'RECEBIDA', recebimento: {data: '2026-11-10', forma: 'CORREIO', por: {uid: 'l', nome: 'Lia Logística'}, em: '2026-11-10T13:00:00Z'},
      historico: {h1: amostra().historico.h1, h2: {acao: 'RECEBER', de: 'SOLICITADA', para: 'RECEBIDA', por: {uid: 'l', nome: 'Lia Logística'}, em: '2026-11-10T13:00:00Z'}}});
    ({page, errors} = await abrir(browser, estado(PD, {a1: recebida}), 'cadastros.html'));
    await page.selectOption('#visao-amo', 'homologar');
    await page.click('#tableBody-amo .btn-abrir-amo[data-id="a1"]');
    await page.waitForSelector('#modalBgDet-amo.open');
    const chamadasAntes = page.__chamadas;
    await page.click('#modalBgDet-amo [data-acao="REPROVAR"]');
    await page.waitForFunction(() => /parecer/i.test(document.getElementById('amDetErro').textContent));
    assert.equal(page.__chamadas, chamadasAntes, 'reprovar sem parecer não chama o servidor');
    await page.fill('#amParecer', 'Cor ficou boa');
    await page.click('#modalBgDet-amo [data-acao="HOMOLOGAR"]');
    await page.waitForFunction(() => window.__db.amostras_mp.a1.status === 'HOMOLOGADA');
    const hist = await page.locator('#amHistorico').innerText();
    assert.match(hist, /Solicitada[\s\S]*Recebida[\s\S]*Homologada/);
    assert.match(hist, /Lia Logística/);
    await page.click('#amCadastrarMp');
    await page.waitForFunction(() => !!(window.__db.solicitacoes_cadastro_material || {}).NOME__PIGMENTO_ROSA_X);
    const fila = await page.evaluate(() => window.__db.solicitacoes_cadastro_material.NOME__PIGMENTO_ROSA_X);
    assert.equal(fila.status, 'PENDENTE_CADASTRO');
    assert.equal(fila.campos.preco_brl_kg, 120);
    assert.equal(fila.campos.fornecedor, 'Lunagreen');
    assert.equal(fila.origem.amostra, 'AM-0007');
    assert.equal(await page.$eval('#modalBg-mat', (m) => m.classList.contains('open')), false, 'sem Cadastros não abre o modal de material');
    assert.deepEqual(errors, []);
    await page.close();
    ok('P&D: reprovar exige parecer na tela; homologa; histórico com nomes; Cadastrar MP manda para a fila');

    // 4. Yasmim (P&D + Cadastros): todas as abas; Cadastrar MP abre o Novo Material preenchido; link do material.
    const homologada = Object.assign(amostra({status: 'HOMOLOGADA', parecer: {decisao: 'HOMOLOGADA', texto: '', por: {uid: 'x', nome: 'Paula'}, em: '2026-11-11T10:00:00Z'}}));
    const forn = amostra({codigo: 'AM-0010', tipo: 'CADASTRADA', materialNovo: null, material: {codigo: 'MPGR-00127', nome: 'ALCOOL ETILICO 96°G/L'},
      motivo: 'HOMOLOGAR_FORNECEDOR', status: 'HOMOLOGADA', parecer: {decisao: 'HOMOLOGADA', texto: '', por: {uid: 'x', nome: 'Paula'}, em: '2026-11-11T10:00:00Z'}});
    ({page, errors} = await abrir(browser, estado(YAS, {a1: homologada, a3: forn}), 'cadastros.html?tab=amostras'));
    const abas = await abasVisiveis(page);
    for (const t of ['materiais', 'produtos', 'formulas', 'clientes', 'fornecedores', 'servicos', 'amostras']) assert.ok(abas.includes(t), 'Yasmim vê ' + t);
    await page.click('#tableBody-amo .btn-abrir-amo[data-id="a1"]');
    await page.click('#amCadastrarMp');
    await page.waitForSelector('#modalBg-mat.open', {timeout: 5000});
    assert.equal(await page.$eval('#fNome-mat', (i) => i.value), 'PIGMENTO ROSA X');
    assert.match(await page.$eval('#fEspecificacoes', (i) => i.value), /AM-0007/);
    await page.click('#modalClose-mat').catch(() => page.evaluate(() => document.getElementById('modalBg-mat').classList.remove('open')));
    await page.click('#mainTabs .main-tab[data-maintab="amostras"]');
    await page.click('#tableBody-amo .btn-abrir-amo[data-id="a3"]');
    await page.waitForSelector('#amAbrirMaterial');
    assert.deepEqual(await page.evaluate(() => window.__db.materiais['MPGR-00127'].fornecedores), {f1: {statusHomologacao: 'aguardando_homologacao'}}, 'nada muda sozinho');
    assert.deepEqual(errors, []);
    await page.close();
    ok('Yasmim: todas as abas; Cadastrar MP abre o Novo Material preenchido; link para o material do fornecedor homologado');

    // 5. P&D sem Cadastros não vê o link do material.
    ({page, errors} = await abrir(browser, estado(PD, {a3: forn}), 'cadastros.html'));
    await page.click('#tableBody-amo .btn-abrir-amo[data-id="a3"]');
    await page.waitForSelector('#modalBgDet-amo.open');
    assert.equal(await page.locator('#amAbrirMaterial').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
    ok('P&D sem Cadastros não vê o link para abrir o material');

    console.log('run_amostras_mp_ui_test: ' + n + ' cenários OK');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
