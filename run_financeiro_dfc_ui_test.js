'use strict';
/* Financeiro F7, tela de verdade: aba "Fluxo de caixa" por dia/semana/mês com filtro de
   conta e natureza, e o DFC (método direto) com a conferência contra os bancos; atividade
   de cada natureza em Cadastros. Firebase simulado em memória. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const FS = require('./functions/financeiro_servidor');

const HOJE = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const MES = HOJE.slice(0, 8) + '01';
const mesAnt = (() => { const y = Number(MES.slice(0, 4)), m = Number(MES.slice(5, 7)) - 2; const d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 10); })();
const dia = (base, n) => { const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function banco() {
  return {
    usuarios: {u1: {nome: 'Gustavo', email: 'adm@kuryos.com', role: 'admin'}},
    fin: {
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: mesAnt},
        cx: {nome: 'Caixa', tipo: 'CAIXA', saldoInicialCentavos: 0, dataSaldoInicial: mesAnt}},
      titulos: {T2: {tipo: 'RECEBER', valorCentavos: 20000, vencimentoFixo: dia(HOJE, 10), emissao: mesAnt, natureza: 'RECEITA_VENDA', parceiro: {nome: 'Cliente'}, documento: 'NF 9', origem: {tipo: 'MANUAL'}}},
      baixas: {B1: {tipo: 'BAIXA', titulo: 'T0', tituloTipo: 'RECEBER', natureza: 'RECEITA_VENDA', data: dia(mesAnt, 4), conta: 'itau', valorCentavos: 30000, jurosCentavos: 500, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 30500}},
      movimentos: {M1: {tipoRegistro: 'MOVIMENTO', tipo: 'TRANSFERENCIA', conta: 'itau', destino: 'cx', data: dia(mesAnt, 6), valorCentavos: 10000, historico: 'Suprimento'},
        M2: {tipoRegistro: 'MOVIMENTO', tipo: 'TARIFA', conta: 'itau', data: dia(mesAnt, 7), valorCentavos: 900}},
      parametros: {}
    },
    ctl: {fechamentos: {}},
  };
}

async function abrir(browser) {
  const page = await browser.newPage({viewport: {width: 1400, height: 950}});
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

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  try {
    const {page, erros} = await abrir(browser);
    await page.click('.aba[data-aba="fluxo"]');
    await page.waitForSelector('#flG');
    ok(await page.inputValue('#flG') === 'SEMANA', 'abre por semana, como antes');
    await page.selectOption('#flG', 'MES');
    const tab = () => page.locator('#conteudo .card').first().innerText();
    let t = await tab();
    ok(/Mês[\s\S]*realizado/.test(t) && /Entradas \(títulos\)[\s\S]*R\$\s*305,00/.test(t), 'por mês: realizado do mês passado (baixa de 300,00 + 5,00 de juros)');
    ok(/Saídas \(títulos\)[\s\S]*R\$\s*-9,00/.test(t), 'tarifa no realizado; transferência não aparece no consolidado');
    await page.selectOption('#flG', 'DIA');
    ok((await page.locator('#conteudo .card').first().locator('thead th').count()) === 38, 'por dia: 7 para trás + 30 para frente');
    await page.selectOption('#flG', 'MES');
    await page.selectOption('#flConta', 'cx');
    t = await tab();
    ok(/só o realizado aparece/.test(t) && /Entradas[\s\S]*R\$\s*100,00/.test(t), 'conta do caixa: só realizado, com a transferência recebida');
    await page.selectOption('#flConta', '');
    await page.selectOption('#flNat', 'RECEITA_VENDA');
    t = await tab();
    ok(/não há saldo projetado/.test(t) && !/Saldo projetado/.test(t), 'natureza: sem saldo projetado, com aviso');
    await page.selectOption('#flNat', '');

    // DFC
    const dfc = await page.locator('#conteudo .card').last().innerText();
    ok(/Demonstrativo de fluxo de caixa/.test(dfc) && /Atividades operacionais/.test(dfc), 'DFC com a atividade operacional');
    ok(/Receita de vendas[\s\S]*300,00/.test(dfc) && /Resultado financeiro[\s\S]*-4,00/.test(dfc), 'principal na natureza; juros 5 − tarifa 9 = −4 no resultado financeiro');
    ok(/Conferência com os bancos[\s\S]*confere/.test(dfc) && !/dif\./.test(dfc), 'confere com os bancos em todos os meses');
    ok(!/Transfer/i.test(await page.locator('#conteudo .card').last().locator('table').innerText()), 'transferência não entra no DFC');
    await page.screenshot({path: path.join(__dirname, 'scripts', 'artifacts', 'fin-op', 'f7-fluxo-dfc.png'), fullPage: true});

    // Cadastros: resultado financeiro como financiamento -> nova atividade no DFC.
    await page.click('.aba[data-aba="cadastros"]');
    await page.selectOption('select[data-dfc-nat="RESULTADO_FINANCEIRO"]', 'FINANCIAMENTO');
    await page.waitForFunction(() => ((window.__db.fin.parametros || {}).dfcAtividades || {}).RESULTADO_FINANCEIRO === 'FINANCIAMENTO');
    await page.click('.aba[data-aba="fluxo"]');
    const dfc2 = await page.locator('#conteudo .card').last().innerText();
    ok(/Atividades de financiamento[\s\S]*Resultado financeiro/.test(dfc2) && /confere/.test(dfc2), 'atividade configurada move a linha e segue conferindo');
    ok(!erros.length, 'sem erro de JS: ' + erros.join(' | '));
  } finally { await browser.close(); }
  console.log('OK financeiro F7 (tela): ' + n + ' verificações');
})().catch((e) => { console.error(e); process.exit(1); });
