'use strict';
/* Financeiro — Entrega B (12/11/2026), tela de verdade no Chrome: adiantamento com
   compensação, renegociação de dois títulos com prévia, cancelamento em lote (engano
   bloqueado em NF de saída, incobrável liberado) e desfazer. Callables simuladas com os
   mesmos preparar* do servidor. Rodar: PLAYWRIGHT_MODULE=<node_modules/playwright> node run_financeiro_entrega_b_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const FS = require('./functions/financeiro_servidor');

const HOJE = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const MES = HOJE.slice(0, 8) + '01';
const dia = (base, n) => { const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function banco() {
  const t = (tipo, valor, doc, parc, extra) => Object.assign({tipo, valorCentavos: valor, vencimentoFixo: dia(HOJE, 20), emissao: MES, documento: doc, parceiro: parc, origem: {tipo: 'MANUAL'}, natureza: tipo === 'PAGAR' ? 'OUTROS' : 'RECEITA_VENDA'}, extra);
  const q = {nome: 'Química SA', cnpj: '01234567000190'};
  return {
    usuarios: {u1: {nome: 'Gustavo', email: 'adm@kuryos.com', role: 'admin'}},
    fin: {
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: MES}},
      titulos: {P1: t('PAGAR', 20000, 'NF 1', q), P2: t('PAGAR', 10000, 'NF 2', q),
        R1: t('RECEBER', 50000, 'NF 501', {nome: 'Marca Bela'}), RNF: t('RECEBER', 40000, 'NF 900', {nome: 'Marca Bela'}, {origem: {tipo: 'NF_SAIDA', ref: 'A/N'}})},
      baixas: {}, movimentos: {}, parametros: {}
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
      const ac = (a, b) => (payload.acao === 'ESTORNAR' || payload.acao === 'DESFAZER' ? b : a);
      const fn = {finAdiantamento: ac(FS.prepararAdiantamento, FS.prepararEstornoAdiantamento), finCompensarAdiantamento: FS.prepararCompensacao,
        finRenegociar: ac(FS.prepararRenegociacao, FS.prepararDesfazerRenegociacao), finCancelarTitulos: ac(FS.prepararCancelamento, FS.prepararDesfazerCancelamento),
        finEstornarBaixa: FS.prepararEstorno}[nome];
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


const cent = (s) => s === '' ? 0 : Math.round(Number(String(s).replace(/\./g, '').replace(',', '.')) * 100);
(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  try {
    const {page, erros} = await abrir(browser);
    page.on('dialog', (dlg) => dlg.accept(dlg.type() === 'prompt' ? 'conferido com o financeiro' : undefined));
    const titulos = () => page.evaluate(() => window.__db.fin.titulos);
    const statusDe = async (doc) => (await page.locator('tr', {has: page.locator('a[data-det]', {hasText: new RegExp('^' + doc + '$')})}).first().innerText());

    // ── Adiantamento a fornecedor ──
    await page.click('.aba[data-aba="pagar"]');
    await page.click('[data-adiant="PAGAR"]');
    await page.fill('#adParc', 'Química SA'); await page.dispatchEvent('#adParc', 'change');
    ok(await page.inputValue('#adCnpj') === '01234567000190', 'fornecedor conhecido: CNPJ preenchido pelo nome');
    await page.fill('#adValor', '200,00'); await page.fill('#adDoc', 'PIX 1');
    await page.click('#adOk');
    await page.waitForFunction(() => Object.keys(window.__db.fin.adiantamentos || {}).length === 1);
    await page.waitForSelector('#cardAdiant');
    ok(/Adiantamentos a fornecedores · disponível R\$\s*200,00/.test(await page.locator('#cardAdiant').innerText()), 'card de adiantamentos com o disponível');

    // ── Compensar no título ──
    await page.click('a[data-det="P1"]');
    await page.waitForSelector('[data-comp-ad]');
    await page.click('[data-comp-ad]');
    ok(await page.inputValue('#cpValor') === '200,00', 'sugere o menor entre o disponível e o saldo');
    await page.fill('#cpValor', '150,00');
    await page.click('#cpOk');
    await page.waitForFunction(() => Object.values(window.__db.fin.baixas || {}).some((b) => b.forma === 'ADIANTAMENTO'));
    ok(/disponível R\$\s*50,00/.test(await page.locator('#cardAdiant').innerText()), 'compensação consome o adiantamento');
    await page.click('a[data-det="P1"]');
    ok(/compensação de adiantamento/.test(await page.locator('#dlgB').innerText()), 'baixa aparece como compensação no detalhe');
    await page.click('#dlgX');

    // ── Renegociar dois títulos ──
    await page.check('[data-tsel="P1"]');
    await page.check('[data-tsel="P2"]');
    ok(/2 selecionado\(s\) · R\$\s*150,00/.test(await page.locator('#barraSel').innerText()), 'barra soma os saldos selecionados (P1 já tem 150 compensados)');
    await page.click('[data-reneg="PAGAR"]');
    await page.fill('#rnAcr', '10,00'); await page.dispatchEvent('#rnAcr', 'input');
    await page.fill('#rnNParc', '2'); await page.dispatchEvent('#rnNParc', 'input');
    ok(await page.inputValue('#rnCond') === '30/60', 'parcelas montam a condição');
    ok(/Título novo: R\$\s*160,00[\s\S]*1\/2[\s\S]*2\/2/.test(await page.locator('#rnPrev').innerText()), 'prévia: 150 + 10 em 2 parcelas');
    await page.fill('#rnMotivo', 'acordo com o fornecedor');
    await page.click('#rnOk');
    await page.waitForFunction(() => Object.values(window.__db.fin.titulos).some((t) => t.origem && t.origem.tipo === 'RENEGOCIACAO'));
    await page.selectOption('#fFiltro', 'todos');
    ok(/Renegociado/.test(await statusDe('NF 1')) && /Renegociado/.test(await statusDe('NF 2')), 'originais aparecem como Renegociado');
    ok(/Reneg\. NF 1, NF 2[\s\S]*R\$\s*160,00/.test(await page.locator('table').first().innerText()), 'título novo na lista');
    const rng = Object.entries(await titulos()).find(([, t]) => t.origem && t.origem.tipo === 'RENEGOCIACAO')[0];
    await page.click('a[data-det="' + rng + '"]');
    await page.click('[data-desf-rn]');
    await page.waitForFunction(() => Object.values(window.__db.fin.renegociacoes).every((r) => r.status === 'DESFEITA'));
    ok(!/Renegociado/.test(await statusDe('NF 2')), 'desfazer: NF 2 volta a aberto');

    // ── Cancelar a receber em lote ──
    await page.click('.aba[data-aba="receber"]');
    await page.check('[data-tsel="R1"]'); await page.check('[data-tsel="RNF"]');
    await page.click('[data-cancel="RECEBER"]');
    ok(/não[\s\S]*Faturamento/.test(await page.locator('#cnLista').innerText()) && await page.isDisabled('#cnOk'), 'engano em NF de saída bloqueado, com o motivo');
    await page.selectOption('#cnMotivo', 'INCOBRAVEL');
    ok(!(await page.isDisabled('#cnOk')), 'incobrável libera');
    await page.fill('#cnJust', 'cliente fechou as portas');
    await page.click('#cnOk');
    await page.waitForFunction(() => Object.keys(window.__db.fin.cancelamentos || {}).length === 1);
    await page.selectOption('#fFiltro', 'todos');
    ok(/Cancelado/.test(await statusDe('NF 501')) && /Cancelado/.test(await statusDe('NF 900')), 'os dois aparecem como Cancelado');
    await page.click('a[data-det="R1"]');
    await page.click('[data-desf-cn]');
    await page.waitForFunction(() => Object.values(window.__db.fin.cancelamentos).every((c) => c.status === 'DESFEITO'));
    ok(!/Cancelado/.test(await statusDe('NF 501')), 'desfazer cancelamento');

    // ── Relatórios ──
    await page.click('.aba[data-aba="relatorios"]');
    await page.selectOption('#relTipo', 'adiantamentos_pagar');
    ok(/Química SA[\s\S]*R\$\s*200,00[\s\S]*R\$\s*150,00[\s\S]*R\$\s*50,00/.test(await page.locator('#relTabela').innerText()), 'relatório de adiantamentos');
    await page.selectOption('#relTipo', 'gastos');
    ok(await page.$('#relSemAd') !== null, 'gastos com a opção "não exibir adiantamentos"');
    await page.screenshot({path: path.join(__dirname, 'scripts', 'artifacts', 'fin-op', 'entrega-b.png'), fullPage: true});
    ok(!erros.length, 'sem erro de JS: ' + erros.join(' | '));
  } finally { await browser.close(); }
  console.log('OK financeiro Entrega B (tela): ' + n + ' verificações');
})().catch((e) => { console.error(e); process.exit(1); });
