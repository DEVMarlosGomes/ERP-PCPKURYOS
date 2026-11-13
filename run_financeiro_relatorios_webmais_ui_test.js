'use strict';
/* Financeiro — relatórios do WebMais (12/11/2026), tela de verdade no Chrome:
   seletor agrupado (Caixas e bancos / A pagar / A receber), cada relatório novo abre
   sem erro e sem NaN, os filtros próprios mudam o resultado, o CSV baixado tem o
   total da tela e o título manual grava o centro de custo. Firebase simulado em memória.
   Rodar: PLAYWRIGHT_MODULE=<node_modules/playwright> node run_financeiro_relatorios_webmais_ui_test.js */
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
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: MES}, cx: {nome: 'Caixa', tipo: 'CAIXA', saldoInicialCentavos: 0, dataSaldoInicial: MES}},
      titulos: {
        P1: {tipo: 'PAGAR', valorCentavos: 40000, condicao: '0/30', baseVencimento: MES, emissao: MES, natureza: 'MATERIA_PRIMA', porNatureza: {MATERIA_PRIMA: 30000, EMBALAGEM: 10000},
          documento: 'NF 10', parceiro: {nome: 'Química SA', cnpj: '01234567000190'}, origem: {tipo: 'RECEBIMENTO'}, criadoPor: 'servidor'},
        P2: {tipo: 'PAGAR', valorCentavos: 12000, vencimentoFixo: dia(MES, 20), emissao: MES, natureza: 'FRETE', documento: 'CT 3', parceiro: {nome: 'Transportes X'},
          origem: {tipo: 'MANUAL'}, centroCusto: 'LOGISTICA', criadoPor: 'Ana'},
        R1: {tipo: 'RECEBER', valorCentavos: 50000, vencimentoFixo: dia(HOJE, 40), emissao: MES, natureza: 'RECEITA_VENDA', documento: 'NF 501', parceiro: {nome: 'Marca Bela', cnpj: '11222333000144'}, origem: {tipo: 'MANUAL'}}
      },
      baixas: {B1: {tipo: 'BAIXA', titulo: 'P1', tituloTipo: 'PAGAR', natureza: 'MATERIA_PRIMA', data: MES, conta: 'itau', valorCentavos: 20000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 20000}},
      movimentos: {M1: {tipoRegistro: 'MOVIMENTO', tipo: 'TRANSFERENCIA', conta: 'itau', destino: 'cx', data: MES, valorCentavos: 3000, criadoPor: 'Ana', criadoEm: MES + 'T09:00:00Z'},
        M2: {tipoRegistro: 'MOVIMENTO', tipo: 'TARIFA', conta: 'itau', data: MES, valorCentavos: 890, criadoPor: 'Ana', criadoEm: MES + 'T10:00:00Z'}},
      parametros: {}
    },
    ctl: {fechamentos: {}, centros_custo: {LAB: {nome: 'Laboratório P&D', tipo: 'APOIO'}}}
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
    await page.click('.aba[data-aba="relatorios"]');
    await page.waitForSelector('#relTabela');
    const grupos = await page.$$eval('#relTipo optgroup', (gs) => gs.map((g) => g.label + ':' + g.children.length));
    ok(JSON.stringify(grupos) === JSON.stringify(['Caixas e bancos:9', 'A pagar:11', 'A receber:11']), 'seletor agrupado como no WebMais: ' + grupos.join(', '));
    const tabela = () => page.locator('#relTabela').innerText();
    const sel = async (v) => { await page.selectOption('#relTipo', v); await page.waitForSelector('#relTabela, .alerta.warn'); };

    // Todos os relatórios abrem: sem NaN, sem "undefined", sem erro de JS.
    const todos = await page.$$eval('#relTipo option', (os) => os.map((o) => o.value));
    for (const v of todos) {
      await sel(v);
      const txt = await page.locator('#conteudo').innerText();
      ok(!/NaN|Infinity|undefined|\[object/.test(txt), v + ': sem número inválido');
    }

    // Espelho de caixa diário: dia com movimento; saldo final por conta.
    await sel('espelho');
    await page.fill('#relData', MES); await page.dispatchEvent('#relData', 'change');
    await page.selectOption('#relConta', ''); // a conta escolhida no Extrato continua valendo: volta para todas
    let txt = await tabela();
    ok(/Itaú[\s\S]*Saldo anterior[\s\S]*Transferência[\s\S]*Saldo final do dia[\s\S]*Caixa\tSaldo anterior[\s\S]*Saldo final do dia/.test(txt),'espelho: cada conta com saldo anterior, lançamentos e saldo final');
    ok(/R\$\s*791,10/.test(await page.locator('[data-rel-total]').innerText()), 'espelho: total = saldos finais (Itaú 761,10 + Caixa 30,00)');
    const [down] = await Promise.all([page.waitForEvent('download'), page.click('#relCsv')]);
    ok(/^espelho-de-caixa-diario-/.test(down.suggestedFilename()), 'CSV do espelho: ' + down.suggestedFilename());
    const linhas = fs.readFileSync(await down.path(), 'utf8').slice(1).trim().split('\r\n').map((l) => l.split(';'));
    const tot = linhas[linhas.length - 1], corpo = linhas.slice(1, -1);
    ok(cent(tot[3]) === corpo.reduce((s, l) => s + cent(l[3]), 0), 'CSV: total das saídas = soma das linhas');

    // Lançamento bancário: filtro por tipo.
    await sel('movimentos');
    ok(/Transferência[\s\S]*Tarifa bancária/.test(await tabela()), 'lançamentos bancários');
    await page.selectOption('#relTipoMov', 'TARIFA');
    txt = await tabela();
    ok(/Tarifa bancária/.test(txt) && !/Transferência/.test(txt), 'filtro por tipo de lançamento');

    // Gastos por centro: centro da Controladoria e "sem centro", natureza rateada.
    await sel('gastos');
    txt = await tabela();
    ok(/Logística[\s\S]*Frete[\s\S]*CT 3/.test(txt) && /Sem centro de custo[\s\S]*Embalagem[\s\S]*Matéria-prima/.test(txt), 'gastos: centro → natureza → título; recebimento dividido');
    ok(await page.$('#relCC option[value="LAB"]') !== null, 'centro cadastrado na Controladoria aparece no filtro');
    await page.selectOption('#relCC', 'LOGISTICA');
    txt = await tabela();
    ok(/CT 3/.test(txt) && !/NF 10/.test(txt), 'filtro por centro de custo');

    // Principais fornecedores com categoria (matéria-prima).
    await sel('ranking_pagar');
    await page.selectOption('#relNat', 'MATERIA_PRIMA');
    txt = await tabela();
    ok(/Química SA[\s\S]*R\$\s*300,00/.test(txt) && !/Transportes X/.test(txt), 'ranking por categoria: só a parte de matéria-prima');

    // Clientes em aberto, conta corrente e antecipação.
    await sel('aberto_receber');
    ok(/Marca Bela[\s\S]*11\.222\.333\/0001-44[\s\S]*R\$\s*500,00/.test(await tabela()), 'clientes em aberto com CNPJ e posição');
    await sel('conta_receber');
    ok(/Digite o nome ou o CNPJ/.test(await page.locator('#conteudo').innerText()), 'conta corrente pede o cliente');
    await page.fill('#relParc', 'bela'); await page.dispatchEvent('#relParc', 'change');
    ok(/Saldo anterior[\s\S]*NF 501/.test(await tabela()), 'conta corrente do cliente');
    await sel('antecipacao');
    ok(/Informe a taxa/.test(await page.locator('#conteudo').innerText()), 'antecipação pede a taxa');
    await page.fill('#relTaxa', '3'); await page.dispatchEvent('#relTaxa', 'change');
    txt = await tabela();
    if (process.env.DEBUG_UI) console.log(JSON.stringify(txt));
    ok(/NF 501[\s\S]*40[\s\S]*R\$\s*500,00[\s\S]*R\$\s*20,00[\s\S]*R\$\s*480,00/.test(txt), 'antecipação: 40 dias a 3% = deságio 20,00');

    // Título manual com centro de custo.
    await page.click('.aba[data-aba="pagar"]');
    await page.click('[data-manual="PAGAR"]');
    await page.fill('#mParc', 'Laboratório Externo'); await page.fill('#mDoc', 'NF 77'); await page.fill('#mValor', '150,00');
    await page.fill('#mVenc', dia(HOJE, 10));
    await page.selectOption('#mCC', 'LAB');
    await page.click('#mOk');
    await page.waitForFunction(() => Object.values(window.__db.fin.titulos).some((t) => t.documento === 'NF 77'));
    const cc = await page.evaluate(() => Object.values(window.__db.fin.titulos).find((t) => t.documento === 'NF 77').centroCusto);
    ok(cc === 'LAB', 'título manual grava o centro de custo (' + cc + ')');
    await page.click('.aba[data-aba="relatorios"]');
    await sel('gastos');
    await page.selectOption('#relCC', 'LAB');
    await page.selectOption('#relNat', ''); // a natureza do ranking continua valendo: volta para todas
    ok(/Laboratório P&D[\s\S]*NF 77/.test(await tabela()), 'o lançamento aparece nos gastos do centro');
    await page.screenshot({path: path.join(__dirname, 'scripts', 'artifacts', 'fin-op', 'relatorios-webmais.png'), fullPage: true});
    ok(!erros.length, 'sem erro de JS: ' + erros.join(' | '));
  } finally { await browser.close(); }
  console.log('OK financeiro relatórios WebMais (tela): ' + n + ' verificações');
})().catch((e) => { console.error(e); process.exit(1); });
