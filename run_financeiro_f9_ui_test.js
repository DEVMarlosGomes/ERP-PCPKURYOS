'use strict';
/* Financeiro F9 (12/11/2026), tela de verdade no Chrome: liquidação por filtro (atalhos,
   marcar todas, pagar, movimento do dia), Classificar (elemento, rateio, forma), título
   manual com elemento e forma, plano de elementos, fluxo por tipo de conta, DFC por
   elemento e relatórios com elemento. Callables simuladas com os mesmos preparar* do servidor.
   Rodar: PLAYWRIGHT_MODULE=<node_modules/playwright> node run_financeiro_f9_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const FS = require('./functions/financeiro_servidor');

const HOJE = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const MES = HOJE.slice(0, 8) + '01';
const dia = (base, n) => { const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function banco() {
  const t = (valor, doc, venc, extra) => Object.assign({tipo: 'PAGAR', valorCentavos: valor, vencimentoFixo: venc, emissao: dia(HOJE, -20), documento: doc, parceiro: {nome: 'Fornecedor ' + doc}, origem: {tipo: 'MANUAL'}, natureza: 'OUTROS'}, extra);
  return {
    usuarios: {u1: {nome: 'Gustavo', email: 'adm@kuryos.com', role: 'admin'}},
    fin: {
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 500000, dataSaldoInicial: dia(HOJE, -40)}},
      titulos: {P1: t(30000, 'NF 1', HOJE), P2: t(10000, 'NF 2', dia(HOJE, 1)), P3: t(20000, 'NF 3', dia(HOJE, 10)), PV: t(5000, 'CT 9', dia(HOJE, -3), {natureza: 'FRETE'}),
        PB: t(7000, 'NF B', HOJE)},
      bloqueios: {PB: {motivo: 'divergência', ativo: true}},
      baixas: {B0: {tipo: 'BAIXA', titulo: 'P3', tituloTipo: 'PAGAR', data: dia(HOJE, -2), conta: 'itau', valorCentavos: 1000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 1000}},
      movimentos: {}, parametros: {}
    },
    ctl: {fechamentos: {}}
  };
}

async function abrir(browser) {
  const page = await browser.newPage({viewport: {width: 1400, height: 950}, acceptDownloads: true});
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.addInitScript(({data}) => {
    const db = data;
    window.__db = db; window.__chamadas = [];
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => (String(p).replace(/^\//, '') === '.info/connected' ? true : partes(p).reduce((x, k) => (x == null ? undefined : x[k]), db));
    const gravar = (p, v) => {
      const ks = partes(p); let x = db;
      ks.slice(0, -1).forEach((k) => { if (x[k] == null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; });
      if (v === null || v === undefined) delete x[ks[ks.length - 1]]; else x[ks[ks.length - 1]] = structuredClone(v);
    };
    const ouvintes = [];
    const avisar = () => ouvintes.forEach((o) => o());
    window.firebase = {
      initializeApp() {},
      auth() { return {currentUser: {uid: 'u1', email: 'adm@kuryos.com'}, onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'adm@kuryos.com'}), 0); }, signOut() { return Promise.resolve(); }}; },
      functions() {
        return {httpsCallable(nome) {
          return (payload) => {
            window.__chamadas.push({nome, payload});
            return window.__servidor(nome, structuredClone(payload), structuredClone(db)).then((r) => {
              if (r.erro) return Promise.reject(new Error(r.erro));
              Object.entries(r.updates || {}).forEach(([k, v]) => gravar(k, v));
              avisar();
              return {data: r.data};
            });
          };
        }};
      },
      database() {
        const ref = (p) => {
          const snap = () => { const v = ler(p); const c = v === undefined ? null : structuredClone(v); return {val: () => c, exists: () => c !== null, key: partes(p).pop()}; };
          return {path: p, key: partes(p).pop(), child(c) { return ref(p + '/' + c); },
            once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); },
            on(ev, cb) { const f = () => cb(snap()); ouvintes.push(f); setTimeout(f, 0); return cb; }, off() {},
            orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
            set(v) { gravar(p, v); avisar(); return Promise.resolve(); },
            update(o) { Object.entries(o).forEach(([k, v]) => gravar(p + '/' + k, v)); avisar(); return Promise.resolve(); },
            remove() { gravar(p, null); avisar(); return Promise.resolve(); },
            push() { const k = '-F' + Math.random().toString(36).slice(2, 8); return ref(p + '/' + k); }};
        };
        return {ref: (x) => ref(x || '')};
      },
    };
  }, {data: banco()});
  await page.exposeFunction('__servidor', async (nome, payload, base) => {
    try {
      const quem = {uid: 'u1', nome: 'Gustavo'}, agora = new Date().toISOString();
      const fn = {finLiquidar: FS.prepararLiquidacao, finClassificar: FS.prepararClassificacao, finCadastrarElemento: FS.prepararElemento}[nome];
      if (fn) { const r = fn(base, payload, quem, agora); return {updates: r.updates, data: {id: r.id || null}}; }
      if (nome === 'finLancarTitulos') { const r = FS.prepararTitulos(base, payload, quem, agora); return {updates: r.updates, data: {criados: r.criados, repetidos: r.repetidos, erros: r.erros}}; }
      return {erro: 'callable não simulado: ' + nome};
    } catch (e) { return {erro: e.message}; }
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'fin.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = path.join(__dirname, 'public', url.pathname.slice(1));
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
  await page.goto('https://fin.test/financeiro.html');
  await page.waitForFunction(() => window.currentUser && document.querySelector('.kpis'));
  return {page, erros};
}


(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  try {
    const {page, erros} = await abrir(browser);
    // ── Liquidação: hoje e amanhã, marcar, pagar, movimento do dia ──
    await page.click('.aba[data-aba="liquidacao"]');
    await page.waitForSelector('#lqTabela');
    let txt = await page.locator('#lqTabela').innerText();
    ok(/NF 1/.test(txt) && /NF 2/.test(txt) && !/NF 3/.test(txt), 'abre em "hoje e amanhã" (NF 3 vence depois)');
    ok(/bloq\./.test(txt), 'título bloqueado aparece, mas sem marcar');
    await page.click('[data-lq-atalho="VENCIDOS"]');
    ok(/CT 9/.test(await page.locator('#lqTabela').innerText()), 'atalho vencidos');
    await page.click('[data-lq-atalho="HOJE"]');
    await page.check('#lqTodos');
    ok(/2 marcada\(s\) · R\$\s*400,00/.test(await page.locator('#lqResumo').innerText()), 'marcar todas soma as parcelas liberadas');
    await page.click('#lqOk');
    await page.waitForFunction(() => Object.keys(window.__db.fin.baixas || {}).filter((k) => k.indexOf('BX_LQ_') === 0).length === 2);
    await page.waitForSelector('#lqMovTabela');
    ok(/NF 1[\s\S]*NF 2/.test(await page.locator('#lqMovTabela').innerText()) && /R\$\s*400,00/.test(await page.locator('#lqMovimento [data-rel-total]').innerText()), 'movimento do dia mostra o que foi pago');
    ok(!/NF 1/.test(await page.locator('#lqTabela').innerText()), 'pago sai da lista');

    // ── Classificar título: elemento, rateio e forma ──
    await page.click('.aba[data-aba="pagar"]');
    await page.selectOption('#fFiltro', 'todos');
    await page.click('a[data-det="P3"]');
    await page.click('[data-classif="P3"]');
    await page.selectOption('#clEl', '2113');
    await page.selectOption('#clForma', 'PIX');
    await page.selectOption('#clCC0', 'ADMINISTRATIVO'); await page.fill('#clPc0', '60');
    await page.selectOption('#clCC1', 'PRODUCAO'); await page.fill('#clPc1', '30');
    await page.click('#clOk');
    ok(/90/.test(await page.locator('.toast').innerText()), 'rateio que não soma 100 é recusado na tela');
    await page.fill('#clPc1', '40');
    await page.click('#clOk');
    await page.waitForFunction(() => (window.__db.fin.classificacoes || {}).P3);
    await page.click('a[data-det="P3"]');
    txt = await page.locator('#dlgB').innerText();
    ok(/2113 Aluguel/.test(txt) && /Administrativo 60%[\s\S]*Produção \(geral\) 40%/.test(txt) && /PIX/.test(txt), 'detalhe mostra elemento, rateio e forma');
    await page.click('#dlgX');

    // ── Título manual com elemento e forma ──
    await page.click('[data-manual="PAGAR"]');
    await page.fill('#mParc', 'Contabilidade Y'); await page.fill('#mDoc', 'NF 80'); await page.fill('#mValor', '90,00'); await page.fill('#mVenc', dia(HOJE, 5));
    await page.selectOption('#mEl', '304'); await page.selectOption('#mForma', 'BOLETO');
    await page.click('#mOk');
    await page.waitForFunction(() => Object.values(window.__db.fin.titulos).some((t) => t.documento === 'NF 80'));
    const t80 = await page.evaluate(() => Object.values(window.__db.fin.titulos).find((t) => t.documento === 'NF 80'));
    ok(t80.elemento === '304' && t80.formaPagamento === 'BOLETO', 'título manual grava elemento e forma');

    // ── Plano de elementos ──
    await page.click('.aba[data-aba="cadastros"]');
    await page.waitForSelector('#cardElementos');
    ok(/2113[\s\S]*Aluguel/.test(await page.locator('#cardElementos').innerText()), 'plano de elementos listado');
    await page.click('[data-el-edit="2113"]');
    ok(await page.inputValue('#elNome') === 'Aluguel', 'editar carrega o elemento');
    await page.fill('#elNome', 'Aluguel do galpão');
    await page.click('#elOk');
    await page.waitForFunction(() => ((window.__db.fin.elementos || {})['2113'] || {}).nome === 'Aluguel do galpão');
    ok(true, 'elemento renomeado pelo servidor');

    // ── Fluxo por tipo de conta e DFC por elemento ──
    await page.click('.aba[data-aba="fluxo"]');
    await page.check('#flGrupo');
    ok(/Aberto por tipo de conta[\s\S]*Despesas operacionais/.test(await page.locator('#conteudo').innerText()), 'fluxo aberto por tipo de conta');
    await page.selectOption('#dfcAb', 'ELEMENTO');
    await page.waitForSelector('#dfcElTabela');
    ok(/Custos de produção|Despesas operacionais/.test(await page.locator('#dfcElTabela').innerText()) && /Diferença contra os bancos/.test(await page.locator('#dfcElTabela').innerText()), 'DFC por grupo › subgrupo › elemento');

    // ── Relatórios com elemento ──
    await page.click('.aba[data-aba="relatorios"]');
    await page.selectOption('#relTipo', 'gastos');
    await page.selectOption('#relAgG', 'ELEMENTO');
    await page.fill('#relDe', dia(MES, -60)); await page.dispatchEvent('#relDe', 'change');
    ok(/2113 Aluguel do galpão[\s\S]*Administrativo[\s\S]*Produção/.test(await page.locator('#relTabela').innerText()), 'gastos por elemento › centro com o rateio');
    await page.selectOption('#relTipo', 'despesas');
    await page.selectOption('#relSit', 'TODOS');
    await page.selectOption('#relForma', 'BOLETO');
    txt = await page.locator('#relTabela').innerText();
    ok(/NF 80/.test(txt) && !/CT 9/.test(txt), 'despesas filtradas por forma de pagamento');
    await page.screenshot({path: path.join(__dirname, 'scripts', 'artifacts', 'fin-op', 'f9.png'), fullPage: true});
    ok(!erros.length, 'sem erro de JS: ' + erros.join(' | '));
  } finally { await browser.close(); }
  console.log('OK financeiro F9 (tela): ' + n + ' verificações');
})().catch((e) => { console.error(e); process.exit(1); });
