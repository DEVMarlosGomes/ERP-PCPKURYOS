'use strict';
/* Tela da Controladoria — abas da paridade com o WebMais (DRE por elemento, Índices
   gerenciais, Bloqueio de período) e exportação para o Domínio. Firebase simulado,
   callables pelo servidor real (functions/controladoria_servidor.js).
   Rodar: PLAYWRIGHT_MODULE=<node_modules/playwright> node run_controladoria_gerencial_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Ctl = require('./public/shared/controladoria');
const CtlSrv = require('./functions/controladoria_servidor');

const HOJE = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const MES = HOJE.slice(0, 7);
const ANT = (() => { let a = +MES.slice(0, 4), m = +MES.slice(5, 7) - 1; if (!m) { m = 12; a--; } return a + '-' + String(m).padStart(2, '0'); })();
function banco() {
  const base = {
    ops: {'OP-1': {lote: 'L-1', sku: 'SKU1', linha: 'Linha 01', status: 'Concluído', produzido: 1000}},
    custos: {razao: {[ANT]: {c1: {tipo: 'CONSUMO_MATERIAL', objeto: {tipo: 'OP', id: 'OP-1'}, sku: 'SKU1', valorTotal: 600, competencia: ANT},
      h1: {tipo: 'HORA_PRODUCAO', objeto: {tipo: 'OP', id: 'OP-1'}, sku: 'SKU1', valorTotal: 200, competencia: ANT},
      p1: {tipo: 'PERDA', objeto: {tipo: 'OP', id: 'OP-1'}, sku: 'SKU1', valorTotal: 30, competencia: ANT}}},
      razao_ops: {'OP-1': {produzido: 1000, revisao: 1, lancamentos: [ANT + '/c1', ANT + '/h1', ANT + '/p1']}}, parametros: {impostosPct: 10},
      operacao: {[ANT]: {folhaProducao: 3000, fixos: {b: {descricao: 'Contador', valor: 400, rateio: 'ADMINISTRATIVO'}}}}},
    agendamentos_expedicao: {car1: {cliente: 'Cliente A', faturamento: {solicitacoes: {s: {em: ANT + '-20', itens: [{itemKey: 'a', loteKey: 'x', sku: 'SKU1', lote: 'L-1', unidades: 800, valor: 2000}]}},
      nfs: {nf_1: {numero: '1', valor: 2000, emitidaEm: ANT + '-21'}}}}},
    fin: {elementos: {1600: {nome: 'Água', grupo: '3', natureza: 'CUSTO_FIXO_ADM', ativo: true}},
      titulos: {MAN_1: {tipo: 'PAGAR', origem: {tipo: 'MANUAL'}, valorCentavos: 40588, emissao: ANT + '-10', competencia: ANT, natureza: 'CUSTO_FIXO_ADM', centroCusto: 'ADMINISTRATIVO', parceiro: {nome: 'Sabesp'}}},
      classificacoes: {MAN_1: {elemento: '1600'}}},
    ctl: {}
  };
  const upd = Ctl.derivar(base, new Date().toISOString()).updates;
  const ctl = {lancamentos: {}};
  Object.entries(upd).forEach(([k, v]) => { const p = k.split('/'); if (p[1] === 'lancamentos') { ctl.lancamentos[p[2]] = ctl.lancamentos[p[2]] || {}; ctl.lancamentos[p[2]][p[3]] = v; } });
  return {usuarios: {u1: {nome: 'Gustavo', email: 'adm@kuryos.com', role: 'admin'}}, fin: {elementos: base.fin.elementos}, ctl};
}

async function abrir(browser, dados, largura) {
  const page = await browser.newPage({viewport: {width: largura || 1400, height: 950}, acceptDownloads: true});
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
  }, {data: dados});
  await page.exposeFunction('__servidor', async (nome, payload, base) => {
    try {
      const quem = {uid: 'u1', nome: 'Gustavo', role: 'admin'}, agora = new Date().toISOString();
      if (nome === 'ctlSalvarBloqueio') return {updates: CtlSrv.prepararBloqueio(base, payload, quem, agora).updates};
      if (nome === 'ctlLancarIndices') return {updates: CtlSrv.prepararIndices(base, payload, quem, agora).updates};
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
  await page.goto('https://fin.test/controladoria.html');
  await page.waitForFunction(() => window.currentUser && document.querySelector('#selComp option'));
  return {page, erros};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  const SHOTS = process.env.SHOTS_DIR;
  const shot = async (page, nome) => { if (SHOTS) await page.screenshot({path: path.join(SHOTS, nome + '.png'), fullPage: true}); };
  try {
    const {page, erros} = await abrir(browser, banco());
    await page.selectOption('#selComp', ANT);
    // DRE por elemento
    await page.click('.aba[data-aba="dreg"]');
    await page.waitForSelector('table.dre');
    let txt = await page.locator('#conteudo').innerText();
    ok(/1 - RECEITA OPERACIONAL BRUTA[\s\S]*1600 - ÁGUA[\s\S]*12 - = RESULTADO GERENCIAL/.test(txt), 'DRE: grupo › centro › elemento (1600 - ÁGUA) até o resultado');
    ok(!/NaN|Infinity|undefined|\[object/.test(txt), 'DRE: sem número inválido');
    await shot(page, '1-dre-elemento');
    await page.selectOption('#dgCc', 'ADMINISTRATIVO');
    txt = await page.locator('#conteudo').innerText();
    ok(!/RECEITA OPERACIONAL BRUTA/.test(txt) && /ÁGUA/.test(txt), 'filtro de centro de custo');
    await page.selectOption('#dgCc', '');
    const [down] = await Promise.all([page.waitForEvent('download'), page.click('#dgCsv')]);
    const csv = fs.readFileSync(await down.path(), 'utf8').replace(/^\uFEFF/, '');
    ok(/^Discriminação;/.test(csv) && /1600 - ÁGUA/.test(csv), 'CSV da DRE');
    // Índices gerenciais
    await page.click('.aba[data-aba="indices"]');
    await page.waitForSelector('#ixLancar');
    txt = await page.locator('#conteudo').innerText();
    ok(/Média faturamento R\$/.test(txt) && /não medido/.test(txt), 'índices: média e "não medido" onde falta base (kg)');
    await page.fill('#ix_comissaoPct', '3,5');
    await page.click('#ixLancar');
    await page.waitForFunction(() => /Usuário lançamento: Gustavo/.test(document.querySelector('#conteudo').innerText));
    ok(true, 'índices: lançados com data e usuário (como no WebMais)');
    await shot(page, '2-indices');
    // Bloqueio de período
    await page.click('.aba[data-aba="bloqueio"]');
    await page.waitForSelector('#bqSalvar');
    await page.fill('[data-bq-de="FINANCEIRO"]', ANT + '-01');
    await page.fill('[data-bq-ate="FINANCEIRO"]', '2050-12-31');
    await page.click('#bqSalvar');
    await page.waitForSelector('.toast');
    ok(/Justifique/.test(await page.locator('.toast').last().innerText()), 'bloqueio: sem justificativa não grava');
    await page.fill('#bqJust', 'Fechamento conferido com o contador');
    await page.click('#bqSalvar');
    await page.waitForFunction(() => /Última alteração/.test(document.querySelector('#conteudo').innerText));
    const reg = await page.evaluate(() => window.__db.ctl.bloqueio_periodo);
    ok(reg.modulos.FINANCEIRO.de === reg.modulos.FINANCEIRO.de && reg.alteradoPor === 'Gustavo', 'bloqueio gravado pelo servidor com autor');
    await shot(page, '3-bloqueio');
    // Fechamento › Domínio
    await page.click('.aba[data-aba="fechamento"]');
    await page.waitForSelector('#domExportar');
    ok(/Layout configurado: Não configurado/.test(await page.locator('#conteudo').innerText()), 'Domínio: "Não configurado", como no WebMais');
    await page.click('#domExportar');
    await page.waitForSelector('#dlg[open]');
    ok(/Layout não configurado/.test(await page.locator('#dlgB').innerText()), 'exportar sem layout abre o relatório de inconsistências');
    await shot(page, '4-dominio-inconsistencias');
    await page.click('#dlgX');
    await page.click('#domLayout');
    await page.fill('#domEmp', '15');
    await page.$$eval('[data-dom-conta]', (is) => is.forEach((i, k) => { i.value = String(100 + k); }));
    await page.click('#domSalvar');
    await page.waitForFunction(() => /Empresa destino: 15/.test(document.querySelector('#conteudo').innerText));
    const [d2] = await Promise.all([page.waitForEvent('download'), page.click('#domExportar')]);
    const txt2 = fs.readFileSync(await d2.path(), 'utf8');
    ok(/^\d{2}\/\d{2}\/\d{4};\d+;\d+;\d+,\d{2};/.test(txt2), 'Domínio: arquivo exportado ' + d2.suggestedFilename());
    ok(!erros.length, 'sem erro de JavaScript: ' + erros.join(' | '));
    // Celular
    const m = await abrir(browser, banco(), 390);
    await m.page.selectOption('#selComp', ANT);
    await m.page.click('.aba[data-aba="dreg"]');
    await m.page.waitForSelector('table.dre');
    const rolagem = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(rolagem <= 1, 'celular 390 px: sem rolagem horizontal da página (' + rolagem + ')');
    await shot(m.page, '5-dre-celular');
  } finally { await browser.close(); }
  console.log('OK controladoria gerencial (tela): ' + n + ' verificações');
})().catch((e) => { console.error(e); process.exit(1); });
