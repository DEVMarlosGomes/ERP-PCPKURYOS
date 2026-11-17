'use strict';
/* Faturamento › Remontar / desmembrar (ADM), de ponta a ponta (17/11/2026):
   tela e módulos reais no Chrome, Firebase simulado em memória. O que a tela
   manda para salvarAgendamentoExpedicaoPA é conferido pelo SERVIDOR real
   (functions/agenda_expedicao.js) contra o estoque depois da operação --
   o teste da ligação, não só da unidade. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {prepararFinalizacao} = require('./functions/conferencia_pa');
const {prepararAgenda} = require('./functions/agenda_expedicao');

const clone = (x) => JSON.parse(JSON.stringify(x));
const agora = '2026-11-17T13:00:00.000Z';
function aplicar(bs, updates) { for (const [path, value] of Object.entries(updates)) { const ps = path.split('/'); let x = bs; for (const q of ps.slice(0, -1)) x = x[q] || (x[q] = {}); x[ps.at(-1)] = clone(value); } return bs; }
function fixture() {
  const op = {status: 'Concluído', sku: 'PA001', lote: '26254/01', produto: 'Creme', cliente: 'Cliente A', produzidoLinha: 535, skuPedidoKey: 'PED-001__PA001', dataFimReal: agora};
  const conf = {qtdApontada: 535, contagens: {c1: {total: 535, contadoEm: agora, paletes: {
    p1: {numero: 1, caixasFechadas: 12, unidadesPorCaixa: 24, unidadesCaixaParcial: 7, qtdUnidades: 295, enderecoKey: 'A1'},
    p2: {numero: 2, caixasFechadas: 10, unidadesPorCaixa: 24, unidadesCaixaParcial: 0, qtdUnidades: 240, enderecoKey: 'A1'}}}}};
  const bs = {usuarios: {}, ops: {op1: op}, conferencias_pa: {op1: conf},
    enderecos_estoque: {A1: {codigo: 'PA-A1', ativo: true}}, estoque_lotes: {}, produtos: {PA001: {sku: 'PA001', descricao: 'Creme', kgCaixa: 8}},
    pedidos: {'PED-001__PA001': {id: 'PED-001', parentPedidoId: 'PED-001', sku: 'PA001', cliente: 'Cliente A', produzido: 535}},
    pedidos_comerciais: {'PED-001': {numeroFormatado: 'PED-001', clienteKey: 'c1', cliente: 'Cliente A', status: 'LIBERADO_PCP',
      frete: {tipo: 'FOB', enderecoEntrega: 'Rua A, 100'}, itens: [{sku: 'PA001', qtd: 800, valorUnitario: 2.7, expedido: 0}]}},
    clientes: {c1: {nome: 'Cliente A'}}};
  aplicar(bs, prepararFinalizacao({opKey: 'op1', op, conf, enderecos: bs.enderecos_estoque, lotesItem: {}, autor: 'Conferente', agora}).updates);
  for (const k of ['pa_op1_p1', 'pa_op1_p2']) { const l = bs.estoque_lotes.PA001[k]; l.status = 'LIBERADO_EXPEDICAO'; l.qualidade = {decisao: 'LIBERADO_EXPEDICAO', inspecionadoPor: 'CQ', em: agora}; }
  const ref = (k) => ({itemKey: 'PA001', loteKey: k, quantidade: bs.estoque_lotes.PA001[k].saldoLote, enderecoKey: 'A1', skuPedidoKey: 'PED-001__PA001'});
  const ag = prepararAgenda(bs, {agendaKey: 'ag1', revisao: 0, dataAgendada: '2026-11-18', tipo: 'COLETA', paletes: [ref('pa_op1_p1'), ref('pa_op1_p2')]}, 'Logística', 'u1', agora);
  bs.agendamentos_expedicao = {ag1: ag};
  return bs;
}
// O servidor real decide sobre o que a tela mandou.
function servidor(dados, chamada) {
  const bs = clone(dados);
  return prepararAgenda(bs, chamada, 'ADM', 'u1', agora);
}

async function abrir(browser, usuario) {
  const page = await browser.newPage({viewport: {width: 1400, height: 1000}}), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([data, usuario]) => {
    window.__data = data; window.__chamadas = []; const ouvintes = [];
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), window.__data);
    const copia = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
    const avisar = (path) => { const raiz = partes(path)[0]; ouvintes.forEach((o) => { if (o.path === raiz) o.cb({val: () => copia(window.__data[raiz]) || {}}); }); };
    const gravar = (p, v) => {
      const ks = partes(p); let o = window.__data;
      ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
      if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = copia(v);
    };
    let seq = 0;
    const ref = (path) => ({path, key: partes(path).pop(),
      once: async () => ({val: () => copia(ler(path))}),
      push: () => ({key: 'k' + (++seq)}),
      transaction: async (fn) => {
        const atual = copia(ler(path)); const novo = fn(atual);
        if (novo === undefined) return {committed: false, snapshot: {val: () => atual}};
        if (novo !== null) { gravar(path, novo); avisar(path); }
        return {committed: novo !== null, snapshot: {val: () => novo}};
      },
      update: async (u) => { Object.keys(u).forEach((k) => gravar((path ? path + '/' : '') + k, u[k])); Object.keys(u).forEach((k) => avisar(k)); }
    });
    window.firebase = {initializeApp() {}, database() { return {ref}; },
      functions() { return {httpsCallable(nome) { return async (dados) => { window.__chamadas.push({nome, dados: copia(dados)}); return {data: {}}; }; }}; }};
    window.kuryosDatabaseURL = (x) => x; window.kuryosConnectEmulatorsIfLocal = () => {};
    window.escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    window.dbOnValue = (r, cb) => { ouvintes.push({path: r.path, cb}); cb({val: () => copia(window.__data[r.path]) || {}}); };
    window.currentUser = usuario;
  }, [fixture(), usuario]);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'fat.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const name = url.pathname.slice(1);
    if (name === 'auth_check.js' || name === 'shared/utils.js') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + name;
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://fat.test/faturamento.html');
  await page.waitForSelector('[data-carga="ag1"]');
  return {page, errors};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0; const ok = (m) => { n++; console.log('  ok  ' + m); };
  try {
    // ── 1. Só ADM vê o botão ───────────────────────────────────────────
    {
      const {page, errors} = await abrir(browser, {nome: 'Logística', role: 'logistica'});
      assert.equal(await page.locator('[data-adm-paletes]').count(), 0);
      assert.deepEqual(errors, []);
      await page.close();
      ok('logística não vê Remontar / desmembrar (ADM)');
    }

    // ── 2. Desmembrar palete da carga: estoque e carga juntos ──────────
    {
      const {page, errors} = await abrir(browser, {nome: 'Gustavo ADM', role: 'admin'});
      assert.equal(await page.locator('[data-adm-paletes="ag1"]').count(), 1);
      assert.equal(await page.locator('[data-adm-sincronizar]').count(), 0, 'carga e estoque batem: sem aviso');
      await page.click('[data-adm-paletes="ag1"]');
      await page.click('[data-dm="PA001/pa_op1_p2"]');
      await page.fill('[data-i="0"][data-campo="caixas"]', '6');
      await page.fill('[data-i="1"][data-campo="caixas"]', '4');
      assert.match(await page.locator('#admDmMsg').innerText(), /Confere: 10 caixas em 2 paletes/);
      await page.click('#admDmOk');
      await page.waitForFunction(() => window.__chamadas.length === 1);
      const dados = await page.evaluate(() => window.__data);
      const ch = (await page.evaluate(() => window.__chamadas))[0];
      assert.equal(ch.nome, 'salvarAgendamentoExpedicaoPA');
      assert.equal(ch.dados.editarPaletes, true);
      assert.deepEqual(ch.dados.paletes.map((p) => p.quantidade), [295, 144, 96], 'P1 inteiro, P2 com 6 cx e o filho com 4 cx');
      const novaAg = servidor(dados, ch.dados);
      assert.equal(novaAg.paletes.reduce((s, p) => s + p.quantidade, 0), 535, 'total da carga preservado');
      assert.equal(novaAg.historico['r' + novaAg.revisao].acao, 'EDITAR_PALETES');
      assert.match(novaAg.historico['r' + novaAg.revisao].motivo, /Desmembramento no faturamento/);
      assert.match(await page.locator('#resultado').innerText(), /desmembrado em 2.*todos seguem na carga/);
      assert.deepEqual(errors, []);
      await page.close();
      ok('desmembrar: estoque dividido e a carga aceita pelo servidor com os dois paletes (535 un)');
    }

    // ── 3. Remontar: caixas para palete novo FORA da carga ──────────────
    {
      const {page, errors} = await abrir(browser, {nome: 'Gustavo ADM', role: 'logistica', funcoes: {admin: true}});
      await page.click('[data-adm-paletes="ag1"]');
      await page.click('[data-rm="PA001/pa_op1_p1"]');
      await page.fill('#admRmCaixas', '2');
      assert.match(await page.locator('#admRmMsg').innerText(), /Move 48 un .*fica fora da carga/);
      await page.click('#admRmOk');
      await page.waitForFunction(() => window.__chamadas.length === 1);
      const dados = await page.evaluate(() => window.__data);
      const ch = (await page.evaluate(() => window.__chamadas))[0];
      assert.deepEqual(ch.dados.paletes.map((p) => p.loteKey + ':' + p.quantidade), ['pa_op1_p1:247', 'pa_op1_p2:240']);
      const novaAg = servidor(dados, ch.dados);
      assert.equal(novaAg.paletes.reduce((s, p) => s + p.quantidade, 0), 487, 'as 48 un tiradas saíram da carga');
      const novos = Object.values(dados.estoque_lotes.PA001).filter((l) => l.remontagem && l.remontagem.deLoteKey === 'pa_op1_p1');
      assert.equal(novos.length, 1); assert.equal(novos[0].saldoLote, 48);
      assert.deepEqual(errors, []);
      await page.close();
      ok('remontar fora da carga: carga perde as 48 un, palete novo fica no estoque (servidor aceita)');
    }

    // ── 4. Remontar mantendo na carga + aviso de carga descasada ───────
    {
      const {page, errors} = await abrir(browser, {nome: 'Gustavo ADM', role: 'admin'});
      await page.click('[data-adm-paletes="ag1"]');
      await page.click('[data-rm="PA001/pa_op1_p1"]');
      await page.fill('#admRmCaixas', '3');
      await page.check('#admRmFica');
      assert.match(await page.locator('#admRmMsg').innerText(), /O destino entra nesta carga/);
      await page.click('#admRmOk');
      await page.waitForFunction(() => window.__chamadas.length === 1);
      const dados = await page.evaluate(() => window.__data);
      const ch = (await page.evaluate(() => window.__chamadas))[0];
      assert.equal(ch.dados.paletes.length, 3);
      const novaAg = servidor(dados, ch.dados);
      assert.equal(novaAg.paletes.reduce((s, p) => s + p.quantidade, 0), 535, 'total preservado com o palete novo na carga');
      // A chamada falsa não atualizou a carga: o card avisa e oferece atualizar.
      await page.waitForSelector('[data-adm-sincronizar="ag1"]');
      await page.click('[data-adm-sincronizar="ag1"]');
      await page.waitForFunction(() => window.__chamadas.length === 2);
      const ch2 = (await page.evaluate(() => window.__chamadas))[1];
      assert.equal(ch2.dados.paletes.length, 2, 'atualizar só reflete o estoque; não inventa palete');
      servidor(dados, ch2.dados);
      // Celular: o modal cabe.
      await page.setViewportSize({width: 390, height: 844});
      await page.click('[data-adm-paletes="ag1"]');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'página sem rolagem lateral');
      assert.equal(await page.evaluate(() => document.querySelector('.rm-caixa').getBoundingClientRect().right <= innerWidth), true, 'modal cabe');
      assert.deepEqual(errors, []);
      await page.close();
      ok('remontar mantendo na carga (servidor aceita 3 paletes) + "Atualizar a carga ao estoque" + celular');
    }
    console.log('run_faturamento_paletes_adm_ui_test: ' + n + ' OK');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
