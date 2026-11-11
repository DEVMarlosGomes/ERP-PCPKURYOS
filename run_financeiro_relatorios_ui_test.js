'use strict';
/* Financeiro F8, tela de verdade: aba "Relatórios". Prévia com filtros, CSV baixado de
   verdade (BOM, ";", vírgula decimal, dd/mm/aaaa) com o mesmo total da tela, e a versão
   de impressão. Firebase simulado em memória. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const FS = require('./functions/financeiro_servidor');

const HOJE = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const MES = HOJE.slice(0, 8) + '01';
const dia = (base, n) => { const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function banco() {
  return {
    usuarios: {u1: {nome: 'Gustavo', email: 'adm@kuryos.com', role: 'admin'}},
    fin: {
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: MES}},
      titulos: {
        P1: {tipo: 'PAGAR', valorCentavos: 30001, condicao: '0/30/60', baseVencimento: MES, emissao: MES, natureza: 'EMBALAGEM', documento: 'NF 10', parceiro: {nome: 'Embalagens SA', cnpj: '01234567000190'}, origem: {tipo: 'MANUAL'}},
        P2: {tipo: 'PAGAR', valorCentavos: 4550, vencimentoFixo: dia(MES, 20), emissao: MES, natureza: 'FRETE', documento: 'CT 7', parceiro: {nome: 'Transportes; Ltda'}, origem: {tipo: 'MANUAL'}}
      },
      baixas: {B1: {tipo: 'BAIXA', titulo: 'P1', tituloTipo: 'PAGAR', natureza: 'EMBALAGEM', data: MES, conta: 'itau', valorCentavos: 10000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 10000}},
      movimentos: {}, parametros: {}
    },
    ctl: {fechamentos: {}},
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
      const quem = {uid: 'u1', nome: 'Gustavo'}, agora = new Date().toISOString(); // hora real: ordena os lançamentos do mesmo dia
      if (nome === 'finMovimentar') { const r = FS.prepararMovimento(base, payload, quem, agora); return {updates: r.updates, data: {id: r.id, repetido: r.repetido}}; }
      if (nome === 'finEstornarMovimento') { const r = FS.prepararEstornoMovimento(base, payload, quem, agora); return {updates: r.updates, data: {}}; }
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

const cent = (s) => s === '' ? 0 : Math.round(Number(String(s).replace(',', '.')) * 100);
(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  try {
    const {page, erros} = await abrir(browser);
    await page.click('.aba[data-aba="relatorios"]');
    await page.waitForSelector('#relTabela');
    ok(await page.inputValue('#relTipo') === 'pagar', 'abre em Contas a pagar');
    await page.selectOption('#relSit', 'TODOS');
    // A prévia abre no mês atual; o período cobre as três parcelas (0/30/60 dias).
    await page.fill('#relDe', MES); await page.dispatchEvent('#relDe', 'change');
    await page.fill('#relAte', dia(MES, 90)); await page.dispatchEvent('#relAte', 'change');
    let txt = await page.locator('#relTabela').innerText();
    ok(/NF 10[\s\S]*1\/3[\s\S]*Quitada/.test(txt) && /CT 7[\s\S]*Transportes; Ltda/.test(txt), 'parcelas e títulos na prévia');
    ok(/01\.234\.567\/0001-90/.test(txt), 'CNPJ com máscara');
    const totalTela = await page.locator('[data-rel-total]').innerText();
    ok(/Total[\s\S]*R\$\s*345,51[\s\S]*R\$\s*245,51/.test(totalTela), 'total da tela: valor 345,51 e em aberto 245,51');

    // CSV baixado de verdade.
    const [down] = await Promise.all([page.waitForEvent('download'), page.click('#relCsv')]);
    ok(/^contas-a-pagar-\d{4}-\d{2}-\d{2}\.csv$/.test(down.suggestedFilename()), 'nome do arquivo: ' + down.suggestedFilename());
    const csv = fs.readFileSync(await down.path(), 'utf8');
    ok(csv.charCodeAt(0) === 0xFEFF, 'CSV com BOM');
    const linhas = csv.slice(1).trim().split('\r\n');
    ok(linhas[0].startsWith('Vencimento;Documento;Parcela;Fornecedor;CNPJ'), 'cabeçalho com ";"');
    ok(linhas.some((l) => l.includes('"Transportes; Ltda"')), 'texto com ";" entre aspas');
    const tot = linhas[linhas.length - 1].split(';');
    ok(tot[0] === 'Total' && cent(tot[7]) === 34551 && cent(tot[8]) === 24551, 'total do CSV = total da tela (345,51 / 245,51)');
    ok(/\d{2}\/\d{2}\/\d{4};NF 10/.test(csv), 'data dd/mm/aaaa');

    // Outros relatórios.
    await page.selectOption('#relTipo', 'baixas');
    ok(/pagamento[\s\S]*NF 10[\s\S]*Itaú/.test(await page.locator('#relTabela').innerText()), 'baixas do período');
    await page.selectOption('#relTipo', 'extrato');
    ok(/Saldo anterior[\s\S]*Pagamento NF 10/.test(await page.locator('#relTabela').innerText()) && /R\$\s*900,00/.test(await page.locator('[data-rel-total]').innerText()), 'extrato com saldo final 900,00');
    await page.selectOption('#relTipo', 'aging_pagar');
    ok(/A vencer[\s\S]*Vencido 1–30/.test(await page.locator('#relTabela').innerText()), 'aging');
    await page.selectOption('#relTipo', 'dfc');
    ok(/Saldo final[\s\S]*Diferença contra os bancos/.test(await page.locator('#relTabela').innerText()), 'DFC');
    await page.selectOption('#relTipo', 'fluxo');
    await page.selectOption('#relG', 'MES');
    ok(/Mês de/.test(await page.locator('#relTabela').innerText()), 'fluxo por mês');

    // Impressão: abre uma página só com o relatório.
    await page.evaluate(() => { window.__impresso = null; window.open = () => { const doc = {html: '', open() {}, write(h) { this.html += h; }, close() { window.__impresso = this.html; }}; return {document: doc, focus() {}, print() { window.__imprimiu = true; }}; }; });
    await page.selectOption('#relTipo', 'pagar');
    await page.click('#relImprimir');
    await page.waitForFunction(() => window.__imprimiu === true);
    const html = await page.evaluate(() => window.__impresso);
    ok(/<title>Contas a pagar<\/title>/.test(html) && /Kuryos · Contas a pagar/.test(html) && /emitido em/.test(html) && /A4 landscape/.test(html), 'versão de impressão com título, filtro, emissor e A4 paisagem');
    ok(/data-rel-total/.test(html), 'impressão traz o total');
    await page.screenshot({path: path.join(__dirname, 'scripts', 'artifacts', 'fin-op', 'f8-relatorios.png'), fullPage: true});
    ok(!erros.length, 'sem erro de JS: ' + erros.join(' | '));
  } finally { await browser.close(); }
  console.log('OK financeiro F8 (tela): ' + n + ' verificações');
})().catch((e) => { console.error(e); process.exit(1); });
