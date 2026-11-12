'use strict';
/* Nome do material na versão APROVADA de Fórmula/BOM (11/11/2026).
   A emissão da OP mostra o nome ATUAL do cadastro de Materiais (nomeMaterialAtual em emitir_op.html);
   o item da versão guarda o nome de quando entrou nela. Com o mesmo código e nomes diferentes, "os itens
   da OP estão divergentes do cadastro" (ET-00071: BOM "MASTER 406X306X184MM", cadastro "371X280X197MM").
   A versão aprovada passa a mostrar o nome atual e, quando difere, o gravado embaixo.
   Parte 1: função pura (shared/nome-material-versao.js). Parte 2: tela real de Cadastros no Chrome com
   Firebase simulado (harness de run_trava_aprovados_ui_test.js) — a ligação, não só a unidade. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const NMV = require('./public/shared/nome-material-versao.js');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Parte 1: função pura ----------
assert.equal(NMV.mesmoNome('ÁLCOOL 96°GL', 'alcool 96 gl'), true, 'caixa, acento, espaço e pontuação não contam');
assert.equal(NMV.mesmoNome('FRASCO FEBELLA  SP120 120ML', 'FRASCO FEBELLA SP120 120ML'), true, 'espaço duplo não conta');
assert.equal(NMV.mesmoNome('ÁLCOOL 96°GL', 'ALCOOL ETILICO 96°G/L'), false);

const caixaAtual = {mpCodigo: 'ET-00071', mpNome: 'CAIXA DE EMBARQUE 48 UNID. 371X280X197MM BODY SPLASH FEBELLA 200ML'};
const h1 = NMV.html('ET-00071', 'CAIXA DE EMBARQUE MASTER 48 UNID. 406X306X184MM FEBELLA BODY SPLASH 200ML', caixaAtual, esc);
assert.ok(h1.startsWith('ET-00071 — CAIXA DE EMBARQUE 48 UNID. 371X280X197MM BODY SPLASH FEBELLA 200ML'), 'nome atual do cadastro na frente: ' + h1);
assert.match(h1, /Nome gravado nesta versão: CAIXA DE EMBARQUE MASTER 48 UNID\. 406X306X184MM/, 'nome gravado aparece quando difere');

const h2 = NMV.html('EP-00197', 'FRASCO FEBELLA  SP120 120ML', {mpNome: 'FRASCO FEBELLA SP120 120ML'}, esc);
assert.equal(h2, 'EP-00197 — FRASCO FEBELLA SP120 120ML', 'mesmo nome: sem segunda linha');

const h3 = NMV.html('EP-99999', 'ITEM QUE SAIU DO CADASTRO', null, esc);
assert.equal(h3, 'EP-99999 — ITEM QUE SAIU DO CADASTRO', 'fora do cadastro: mostra o gravado, como a OP');

const h4 = NMV.html('EP-1', 'A <b>&', {mpNome: 'B "x" <i>'}, esc);
assert.ok(!/<b>|<i>/.test(h4) && /&lt;b&gt;&amp;/.test(h4) && /B &quot;x&quot; &lt;i&gt;/.test(h4), 'escapa os dois nomes: ' + h4);

assert.equal(NMV.html('EP-1', '', {mpNome: 'TAMPA'}, esc), 'EP-1 — TAMPA', 'sem nome gravado: só o atual');
assert.equal(NMV.html('', 'TEXTO DO IMPORT', null, esc), ' — TEXTO DO IMPORT', 'item pendente do import sem código');
console.log('OK parte 1: nome atual na frente, gravado embaixo só quando difere, escapado, fora do cadastro como a OP.');

// ---------- Parte 2: tela real ----------
let chromium;
try { chromium = require(process.env.PLAYWRIGHT_MODULE || 'playwright').chromium; } catch (e) {
  console.log('PULADO parte 2 (tela): defina PLAYWRIGHT_MODULE para rodar no Chrome.');
  process.exit(0);
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
    window.firebase.database.ServerValue = {TIMESTAMP: {'.sv': 'timestamp'}};
  }, estadoInicial);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'cad.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file),
      contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://cad.test/' + pagina);
  await page.waitForFunction(() => window.currentUser && window.currentUser.nome, null, {timeout: 12000});
  return {page, errors};
}

function dados() {
  const aprovada = (extra) => Object.assign({codProduto: 'FBBS0006', versao: 'v2', status: 'APROVADA', dataAprovacao: '2026-10-19T14:04:07Z'}, extra);
  return {
    usuarios: {u1: {nome: 'Planejador', email: 'p@kuryos.com', role: 'pcp', modulos: {cadastros: true}}},
    clientes: {}, fornecedores: {}, solicitacoes_cadastro_material: {}, categorias: {}, estoque: {}, ops: {},
    config: {tiposEnsaio: [{nome: 'pH', ativo: true}]},
    materiais: {
      'MPGR-00127': {mpCodigo: 'MPGR-00127', mpNome: 'ALCOOL ETILICO 96°G/L', tipo: 'MPGR', unidade: 'kg', ativo: true},
      'MPGR-00132': {mpCodigo: 'MPGR-00132', mpNome: 'ÁGUA', tipo: 'MPGR', unidade: 'kg', ativo: true},
      'EP-00195': {mpCodigo: 'EP-00195', mpNome: 'FRASCO 24/410 S/RECRAVE BODY SPLASH LINHA ARABE FEBELLA SP205 200ML', tipo: 'EP', unidade: 'un', ativo: true},
      'ET-00071': {mpCodigo: 'ET-00071', mpNome: 'CAIXA DE EMBARQUE 48 UNID. 371X280X197MM BODY SPLASH FEBELLA 200ML', tipo: 'ET', unidade: 'un', ativo: true},
    },
    produtos: {FBBS0006: {sku: 'FBBS0006', descricao: 'BODY SPLASH ROUGE OUT 200ML', ativo: true, clienteKey: 'FEBELLABEAUTY'}},
    formulas: {FBBS0006__v2: aprovada({revisado: true, somaPercentual: 100, aprovadoPD: {nome: 'Yasmim'}, aprovadoQualidade: {nome: 'Yasmim'},
      itens: {i1: {mpCodigo: 'MPGR-00127', mpNome: 'ÁLCOOL 96°GL', fase: 'A', ordemAdicao: 1, percentualMM: 70},
        i2: {mpCodigo: 'MPGR-00132', mpNome: 'AGUA', fase: 'A', ordemAdicao: 2, percentualMM: 30}}})},
    bom: {FBBS0006__v2: aprovada({aprovadoPCP: {nome: 'Adlai'}, aprovadoComercial: {nome: 'Adlai'},
      itens: {b1: {materialCodigo: 'EP-00195', materialNome: 'FRASCO 24/410 S.RECRAV BODY SPLASH LINHA ARABE FEBELLA SP205 200ML', qtdPorPeca: 1, posicao: 1},
        b2: {materialCodigo: 'ET-00071', materialNome: 'CAIXA DE EMBARQUE MASTER 48 UNID. 406X306X184MM FEBELLA BODY SPLASH 200ML', pecasPorUnidade: 48, qtdPorPeca: 0.020833, posicao: 2},
        b3: {materialCodigo: 'ES-09999', materialNome: 'ROTULO QUE NAO ESTA NO CADASTRO', qtdPorPeca: 1, posicao: 3}}})},
    especificacoes: {FBBS0006__v2: aprovada({aprovadoPD: {nome: 'Yasmim'}, aprovadoQualidade: {nome: 'Roberta'},
      itens: {e1: {ensaio: 'pH', especificacaoTexto: '5,0 A 6,0', minimo: '5', maximo: '6', metodo: 'POTENCIOMETRO'}}})},
  };
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const {page, errors} = await abrir(browser, dados(), 'cadastros.html?tab=formulas&produto=FBBS0006');
    await page.waitForSelector('#formulasAcoes-form .badge-aprovada', {timeout: 10000});
    const formula = await page.locator('#formulaBody-form').innerText();
    const bom = await page.locator('#bomBody-form').innerText();

    assert.match(formula, /MPGR-00127 — ALCOOL ETILICO 96°G\/L/, 'fórmula aprovada mostra o nome atual do cadastro:\n' + formula);
    assert.match(formula, /Nome gravado nesta versão: ÁLCOOL 96°GL/, 'e o nome gravado embaixo');
    assert.match(formula, /MPGR-00132 — ÁGUA/, 'AGUA x ÁGUA é o mesmo nome');
    assert.equal((formula.match(/Nome gravado nesta versão/g) || []).length, 1, 'só o item que mudou de nome tem segunda linha');

    assert.match(bom, /ET-00071 — CAIXA DE EMBARQUE 48 UNID\. 371X280X197MM BODY SPLASH FEBELLA 200ML/, 'BOM aprovado mostra o nome atual (o mesmo da OP):\n' + bom);
    assert.match(bom, /Nome gravado nesta versão: CAIXA DE EMBARQUE MASTER 48 UNID\. 406X306X184MM/);
    assert.match(bom, /EP-00195 — FRASCO 24\/410 S\/RECRAVE BODY SPLASH LINHA ARABE FEBELLA SP205 200ML/);
    assert.match(bom, /ES-09999 — ROTULO QUE NAO ESTA NO CADASTRO/, 'fora do cadastro mostra o gravado');
    assert.match(bom, /1 a cada 48 peças/, 'quantidade da linha continua igual');

    // 12/11/2026: o cabeçalho da versão diz se é ela que vai para a OP (PRF-BIOF-0008: v2 com BOM em rascunho).
    assert.match(await page.locator('#versaoUsoOp-form').innerText(), /Esta é a versão que a Emissão de OP usa/);
    await page.evaluate(() => firebase.database().ref('bom/FBBS0006__v2/status').set('RASCUNHO'));
    await page.waitForFunction(() => /ainda não vai para a OP: falta aprovar BOM\. Nenhuma versão/.test(document.getElementById('versaoUsoOp-form').innerText), null, {timeout: 5000});
    await page.evaluate(() => firebase.database().ref('bom/FBBS0006__v2/status').set('APROVADA'));
    await page.waitForFunction(() => /Esta é a versão que a Emissão de OP usa/.test(document.getElementById('versaoUsoOp-form').innerText), null, {timeout: 5000});

    // Cadastro muda com a versão aberta: a aprovada acompanha sem reabrir o produto.
    await page.evaluate(() => firebase.database().ref('materiais/ET-00071/mpNome').set('CAIXA DE EMBARQUE 48 UNID. 371X280X197MM FEBELLA 200ML REV2'));
    await page.waitForFunction(() => /FEBELLA 200ML REV2/.test(document.getElementById('bomBody-form').innerText), null, {timeout: 5000});

    assert.deepEqual(errors, [], 'sem erro de JavaScript na tela');
    console.log('OK parte 2: Fórmula e BOM aprovados em Cadastros mostram o nome atual do cadastro (igual à emissão da OP), o gravado embaixo quando difere, e acompanham mudança no cadastro.');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
