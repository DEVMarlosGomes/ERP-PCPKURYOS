'use strict';
/* Espelho do faturamento da Expedição (11/11/2026), tela de verdade: financeiro.html,
   aba "Faturamento (Expedição)". Base montada pelo fluxo REAL do servidor
   (conferência de PA -> agenda -> solicitação), Firebase simulado em memória.
     PLAYWRIGHT_MODULE=<caminho do playwright-core> node run_espelho_faturamento_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {prepararFinalizacao} = require('./functions/conferencia_pa');
const {prepararAgenda} = require('./functions/agenda_expedicao');
const {prepararFaturamento} = require('./functions/faturamento_carga');

const clone = (x) => JSON.parse(JSON.stringify(x));
const agora = '2026-09-17T13:00:00.000Z';
function aplicar(base, updates) {
  for (const [p, value] of Object.entries(updates)) {
    const partes = p.split('/'); let no = base;
    for (const k of partes.slice(0, -1)) no = no[k] || (no[k] = {});
    no[partes.at(-1)] = clone(value);
  }
  return base;
}
// Duas cargas do mesmo lote: ag1 solicitada (P1, 295 un), ag2 só agendada (P2, 240 un).
function banco() {
  const op = {status: 'Concluído', sku: 'PA001', lote: '26254/01', produto: 'Creme Hidratante', cliente: 'Cliente A', produzidoLinha: 535, skuPedidoKey: 'PED-001__PA001',
    dataEmissao: '2026-09-10T10:00:00.000Z', dataFimReal: '2026-09-15T18:30:00.000Z', validade: '2028-09-10T10:00:00.000Z'};
  const conf = {qtdApontada: 535, contagens: {c1: {total: 535, contadoEm: agora, paletes: {
    p1: {numero: 1, caixasFechadas: 12, unidadesPorCaixa: 24, unidadesCaixaParcial: 7, qtdUnidades: 295, enderecoKey: 'A1'},
    p2: {numero: 2, caixasFechadas: 10, unidadesPorCaixa: 24, unidadesCaixaParcial: 0, qtdUnidades: 240, enderecoKey: 'A1'}}}}};
  const b = {usuarios: {u1: {nome: 'Larissa', email: 'fin@kuryos.com', role: 'gestor', modulos: {financeiro: true}}}, ops: {op1: op}, conferencias_pa: {op1: conf},
    enderecos_estoque: {A1: {codigo: 'PA-A1', ativo: true}}, estoque_lotes: {},
    produtos: {PA001: {sku: 'PA001', descricao: 'Creme Hidratante', kgCaixa: 8, codCliente: 'CLI-7788'}},
    pedidos: {'PED-001__PA001': {id: 'PED-001', parentPedidoId: 'PED-001', sku: 'PA001', cliente: 'Cliente A', produzido: 535}},
    pedidos_comerciais: {'PED-001': {numeroFormatado: 'PED-001', clienteKey: 'c1', cliente: 'Cliente A', status: 'LIBERADO_PCP', numeroPedidoCliente: '34',
      frete: {tipo: 'FOB', enderecoEntrega: 'Rua A, 100'}, itens: [{sku: 'PA001', qtd: 600, valorUnitario: 2.7, expedido: 0}]}},
    clientes: {c1: {nome: 'Cliente A'}}, fin: {contas_bancarias: {}, titulos: {}, baixas: {}, movimentos: {}, parametros: {}}, ctl: {fechamentos: {}}};
  aplicar(b, prepararFinalizacao({opKey: 'op1', op, conf, enderecos: b.enderecos_estoque, lotesItem: {}, autor: 'Conferente', agora}).updates);
  for (const k of ['pa_op1_p1', 'pa_op1_p2']) Object.assign(b.estoque_lotes.PA001[k], {status: 'LIBERADO_EXPEDICAO', qualidade: {decisao: 'LIBERADO_EXPEDICAO', inspecionadoPor: 'CQ', em: agora}});
  const ref = (k) => ({itemKey: 'PA001', loteKey: k, quantidade: b.estoque_lotes.PA001[k].saldoLote, enderecoKey: 'A1', skuPedidoKey: 'PED-001__PA001'});
  const ag1 = prepararAgenda(b, {agendaKey: 'ag1', revisao: 0, dataAgendada: '2026-09-18', tipo: 'COLETA', transportadora: 'Transp X', paletes: [ref('pa_op1_p1')]}, 'Logística', 'u1', agora);
  b.agendamentos_expedicao = {ag1};
  b.agendamentos_expedicao.ag1 = prepararFaturamento(b, {agendaKey: 'ag1', revisao: 1, acao: 'SOLICITAR', solicitacaoId: 's1', observacoes: 'Coleta 8h'}, 'Logística', 'u1', agora).agenda;
  b.agendamentos_expedicao.ag2 = prepararAgenda(b, {agendaKey: 'ag2', revisao: 0, dataAgendada: '2026-09-19', tipo: 'COLETA', transportadora: 'Transp Y', paletes: [ref('pa_op1_p2')]}, 'Logística', 'u1', agora);
  return b;
}

async function abrir(browser) {
  const page = await browser.newPage({viewport: {width: 1400, height: 950}, acceptDownloads: true});
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.addInitScript(({data}) => {
    const db = data;
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => (String(p).replace(/^\//, '') === '.info/connected' ? true : partes(p).reduce((x, k) => (x == null ? undefined : x[k]), db));
    window.firebase = {
      initializeApp() {},
      auth() { return {currentUser: {uid: 'u1', email: 'fin@kuryos.com'}, onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'fin@kuryos.com'}), 0); }, signOut() { return Promise.resolve(); }}; },
      functions() { return {httpsCallable() { return () => Promise.reject(new Error('sem callable neste teste')); }}; },
      database() {
        const ref = (p) => {
          const snap = () => { const v = ler(p); const c = v === undefined ? null : structuredClone(v); return {val: () => c, exists: () => c !== null, key: partes(p).pop()}; };
          return {path: p, key: partes(p).pop(), child(c) { return ref(p + '/' + c); },
            once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); },
            on(ev, cb) { setTimeout(() => cb(snap()), 0); return cb; }, off() {},
            orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
            set() { return Promise.reject(new Error('o espelho não grava')); }, update() { return Promise.reject(new Error('o espelho não grava')); },
            remove() { return Promise.reject(new Error('o espelho não grava')); }, push() { return ref(p + '/-x'); }};
        };
        return {ref: (x) => ref(x || '')};
      },
    };
  }, {data: banco()});
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
    await page.click('.aba[data-aba="faturamento"]');
    await page.waitForSelector('#fFat');
    if (process.env.SHOT) await page.screenshot({path: process.env.SHOT, fullPage: true});
    const cards = page.locator('#conteudo > .card').filter({has: page.locator('table')});
    ok(await cards.count() === 2, 'a faturar: as duas cargas sem NF');
    const cab = await cards.nth(0).locator('thead').innerText();
    ok(['Descrição do SKU', 'Lote', 'Fabricação', 'Validade', 'Caixas fechadas', 'Unid. avulsas', 'Total unid.', 'Valor por caixa', 'Valor unitário'].every((c) => cab.includes(c)), 'colunas pedidas');
    const t1 = await cards.nth(0).innerText();
    ok(/Cliente A · 18\/09\/2026/.test(t1) && /Aguardando NF/.test(t1) && /Solicitado em 17\/09\/2026 por Logística/.test(t1) && /Coleta 8h/.test(t1), 'carga solicitada: cliente, data, etapa, quem pediu e observação');
    const linha = await cards.nth(0).locator('tbody tr').first().innerText();
    ok(/Creme Hidratante/.test(linha) && /Interno: PA001/.test(linha) && /Externo: CLI-7788/.test(linha), 'descrição com código interno e externo');
    ok(/26254\/01/.test(linha) && /15\/09\/2026/.test(linha) && /10\/09\/2028/.test(linha), 'lote, fabricação e validade');
    const nums = linha.replace(/\s+/g, ' ');
    ok(/\b12 de 24 un 7 295\b/.test(nums), 'caixas fechadas 12 (de 24), avulsas 7, total 295: ' + nums);
    ok(/R\$ 64,80 R\$ 2,70 R\$ 796,50/.test(nums), 'valor por caixa 64,80, unitário 2,70, total 796,50');
    const t2 = await cards.nth(1).innerText();
    ok(/ainda não solicitado/.test(t2) && /\b10 de 24 un 0 240\b/.test(t2.replace(/\s+/g, ' ')), 'carga só agendada: quantidades, sem preço');

    // Busca e filtro (mesma régua da Expedição).
    await page.fill('#qTit', 'transp y');
    await page.waitForFunction(() => document.querySelectorAll('#conteudo > .card table').length === 1);
    ok(/19\/09\/2026/.test(await page.locator('#conteudo').innerText()), 'busca pela transportadora');
    await page.fill('#qTit', '');
    await page.waitForFunction(() => document.querySelectorAll('#conteudo > .card table').length === 2);
    await page.selectOption('#fFat', 'FATURADA');
    ok(/Nenhuma carga neste filtro/.test(await page.locator('#conteudo').innerText()), 'nenhuma faturada ainda');
    await page.selectOption('#fFat', 'faturamento');

    // CSV.
    const [down] = await Promise.all([page.waitForEvent('download'), page.click('#fatCsv')]);
    ok(/^faturamento-expedicao-\d{4}-\d{2}-\d{2}\.csv$/.test(down.suggestedFilename()), 'arquivo ' + down.suggestedFilename());
    const csv = fs.readFileSync(await down.path(), 'utf8');
    const ls = csv.replace(/^﻿/, '').trim().split('\r\n');
    ok(ls.length === 3 && ls[1].includes(';PA001;CLI-7788;Creme Hidratante;26254/01;15/09/2026;10/09/2028;12;7;295;64,8;2,7;796,5'), 'CSV com as duas cargas e os mesmos valores da tela');
    ok(!erros.length, 'sem erro de JS: ' + erros.join(' | '));
  } finally { await browser.close(); }
  console.log('OK espelho do faturamento (tela): ' + n + ' verificações');
})().catch((e) => { console.error(e); process.exit(1); });
