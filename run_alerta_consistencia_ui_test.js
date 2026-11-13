'use strict';
/* Alerta vermelho de inconsistência + RNC automática (13/11/2026), tela de
   verdade no Chrome: pedidos.html com utils.js e auth_check.js reais e um
   Firebase simulado. Prova a LIGAÇÃO, não só o motor (lição do CLAUDE.md):
   - auth_check carrega o alerta só para ADM/PCP/Logística;
   - a varredura da tela abre a RNC-CS da OP conferida e descasada (caso real
     26282/03) por transação que só cria, e o modal vermelho aparece;
   - "Aguardando conferência" (caso real Sunrise 26264/14) é laranja, não
     "Diferença";
   - "Ciente" vale só nesta sessão; o selo fica até a RNC ser concluída;
   - texto da RNC é escapado.
   Rodar: PLAYWRIGHT_MODULE=<node_modules/playwright> node run_alerta_consistencia_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function dados(role, modulos) {
  return {
    'usuarios/u1': Object.assign({nome: 'Adlai', email: 'a@kuryos.com', role}, modulos ? {modulos} : {}),
    pedidos: {
      'PED-0001__PRF-BIOF-0004': {id: 'PED-0001', produto: 'SUNRISE MUSE 200ML', qtdTotal: 5500, produzido: 4758, parentPedidoId: 'PED-0001', linha: 'Linha 1'},
      '30__MRARBS12': {id: '30', produto: 'FLOR DAURA 200ML', qtdTotal: 3360, produzido: 4308, parentPedidoId: '30', linha: 'Linha 2'}
    },
    pedidos_comerciais: {
      'PED-0001': {cliente: 'BIOFLORA', dataPedido: '2026-09-20', total_qtd: 5500, itens: [{sku: 'PRF-BIOF-0004', descricao: 'SUNRISE MUSE 200ML', qtd: 5500}]},
      '30': {cliente: 'MR', dataPedido: '2026-10-01', total_qtd: 3360, itens: [{sku: 'MRARBS12', descricao: 'FLOR DAURA 200ML', qtd: 3360}]}
    },
    ops: {
      '26264-13': {skuPedidoKey: 'PED-0001__PRF-BIOF-0004', lote: '26264/13', produzido: 2796, qtdPlanejada: 2750, status: 'Concluído', dataEmissao: '2026-09-21T18:29:53Z'},
      '26264-14': {skuPedidoKey: 'PED-0001__PRF-BIOF-0004', lote: '26264/14', produzido: 1962, qtdPlanejada: 2750, status: 'Concluído', dataEmissao: '2026-09-21T18:30:27Z', confirmadoEm: '2026-11-12T11:53:31Z'},
      '26282-03': {skuPedidoKey: '30__MRARBS12', lote: '26282/03', sku: 'MRARBS12', produto: 'BODY SPLASH FLOR DAURA <img src=x onerror=window.__xss=1>',
        produzido: 4308, qtdPlanejada: 3360, status: 'Concluído', dataEmissao: '2026-10-09T00:00:00Z', confirmadoEm: '2026-10-28T19:27:09Z'}
    },
    expedicoes_comerciais: {e1: {status: 'EXPEDIDO', itens: {a: {qtd: 1792, opKey: '26282-03', opLote: '26282/03'}}}},
    estoque_lotes: {'PRF-BIOF-0004': {a: {itemTipo: 'produto', saldoLote: 2796, opKey: '26264-13', opLote: '26264/13'}}},
    conferencias_pa: {
      '26264-13': {finalizadoEm: '2026-10-01T15:10:31Z', conciliacao: {motivo: 'RECONTAGEM_CONFERE_OP'}},
      '26282-03': {finalizadoEm: '2026-10-16T10:16:09Z', qtdApontada: 1792, qtdPaletizada: 1792, conciliacao: {motivo: 'RECONTAGEM_CONFERE_OP'}}
    },
    solicitacoes_descarte: {}, devolucoes_cliente: {},
    nao_conformidades: {
      'RNC-PA-26315-02': {numero: 'RNC-PA-26315-02', status: 'ABERTA', automatica: true, conferenciaOpKey: '26315-02', opLote: '26315/02',
        descricao: 'Divergência entre produção apontada e PA recebido pela Logística.', qtdEnvolvida: 12, abertaEm: '2026-11-13T10:00:00Z'},
      'RNC-PA-26264-06': {numero: 'RNC-PA-26264-06', status: 'CONCLUIDA', automatica: true, conferenciaOpKey: '26264-06'},
      'RNC-2026-031': {numero: 'RNC-2026-031', status: 'ABERTA', origem: 'RECEBIMENTO'}
    }
  };
}

async function abrir(ctx, role, modulos) {
  const page = await ctx.newPage({viewport: {width: 1500, height: 1000}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({data}) => {
    window.__iniciado = false;
    window.__transacoes = [];
    const exige = q => { if (!window.__iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (" + q + ')'); };
    const ouvintes = {};
    const avisar = path => (ouvintes[path] || []).forEach(cb => setTimeout(() => cb({val: () => structuredClone(data[path] || null)}), 0));
    window.firebase = {
      initializeApp(cfg) { if (!cfg || !cfg.databaseURL) throw new Error('sem databaseURL'); window.__iniciado = true; },
      auth() {
        exige('auth');
        return {onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'a@kuryos.com', displayName: 'Adlai'}), 0); },
          signOut() { return Promise.resolve(); }};
      },
      database() {
        exige('database');
        return {ref(path) {
          const snap = () => {
            const v = path in data ? structuredClone(data[path]) : null;
            return {val: () => v, exists: () => v !== null,
              forEach(fn) { Object.keys(v || {}).forEach(k => fn({key: k, val: () => v[k]})); }};
          };
          return {path,
            once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); },
            on(ev, cb) { (ouvintes[path] = ouvintes[path] || []).push(cb); setTimeout(() => cb(snap()), 0); return cb; },
            off() {}, child() { return this; }, orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
            set() { return Promise.resolve(); }, update(o) { (window.__updates = window.__updates || []).push(o); return Promise.resolve(); },
            remove() { return Promise.resolve(); },
            // Igual ao SDK: primeira passada com o cache (null), depois com o servidor.
            transaction(fn) {
              const m = /^nao_conformidades\/(.+)$/.exec(path);
              if (!m) return Promise.reject(new Error('transação inesperada em ' + path));
              const atual = (data.nao_conformidades || {})[m[1]];
              let v = fn(null);
              if (atual !== undefined) v = fn(structuredClone(atual));
              window.__transacoes.push(m[1]);
              if (v === undefined) return Promise.resolve({committed: false});
              data.nao_conformidades = Object.assign({}, data.nao_conformidades, {[m[1]]: v});
              avisar('nao_conformidades');
              return Promise.resolve({committed: true});
            }};
        }};
      }
    };
  }, {data: dados(role, modulos)});
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'ped.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file),
      contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://ped.test/pedidos.html');
  await page.waitForSelector('.kt-sidebar', {timeout: 8000});
  return {page, errors};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    // ── PCP: varredura abre a RNC, modal vermelho, selo ─────────────────
    const ctx = await browser.newContext();
    let {page, errors} = await abrir(ctx, 'pcp');
    await page.waitForSelector('.ac-fundo', {timeout: 8000});
    await page.waitForFunction(() => /RNC-CS-26282-03/.test((document.querySelector('.ac-fundo') || {}).innerText || ''), null, {timeout: 8000});
    const modal = await page.locator('.ac-fundo').innerText();
    assert.match(modal, /Inconsistência de dados — 2 RNCs sem solução \(2 abertas\)/);
    assert.match(modal, /RNC-CS-26282-03 — Apontamento não bate com estoque \+ expedição/);
    assert.match(modal, /apontado 4\.308 un\..*expedido 1\.792 \+ em estoque 0 = 1\.792/s);
    assert.match(modal, /Faltam 2\.516 un\. sem destino registrado/);
    assert.match(modal, /RNC-PA-26315-02 — Contagem da Logística diferente do apontamento/);
    assert.doesNotMatch(modal, /RNC-PA-26264-06|RNC-2026-031/, 'concluída e RNC manual de recebimento não entram');
    assert.match(modal, /Não expeça o lote envolvido/);
    assert.equal(await page.evaluate(() => window.__xss), undefined, 'descrição da RNC é escapada');
    assert.match(modal, /<img src=x/, 'o texto aparece literal');
    assert.equal(await page.locator('.ac-fundo a[href="qualidade.html?tab=rnc&rnc=RNC-CS-26282-03"]').count(), 1, 'PCP abre a Qualidade: link direto da RNC');
    const trans = await page.evaluate(() => window.__transacoes);
    assert.deepEqual(trans, ['RNC-CS-26282-03'], 'só a OP conferida e descasada abre RNC; Sunrise aguardando conferência não');

    // Sunrise: laranja "Aguardando conferência", nunca "Diferença".
    // O modal cobre a tela: fecha antes de mexer nos filtros.
    await page.click('[data-ac-ciente]');
    await page.selectOption('#filterStatus', '');
    const sunrise = page.locator('#tableBody tr', {hasText: 'SUNRISE MUSE'});
    assert.equal(await sunrise.locator('.badge-orange', {hasText: 'Aguardando conferência'}).count(), 1);
    assert.match(await sunrise.innerText(), /aguardando conferência: 1\.962/);
    assert.doesNotMatch(await sunrise.innerText(), /Diferença/);
    const flor = page.locator('#tableBody tr', {hasText: 'FLOR DAURA'});
    assert.equal(await flor.locator('.badge-red', {hasText: 'Diferença -2.516'}).count(), 1);
    await page.selectOption('#filterConferencia', 'AGUARDANDO_CONFERENCIA');
    assert.equal(await page.locator('#tableBody tr').count(), 1);
    await page.selectOption('#filterConferencia', '');

    // Ciente fechou; o selo fica.
    assert.equal(await page.locator('.ac-fundo').count(), 0);
    assert.match(await page.locator('.ac-selo').innerText(), /2 inconsistências de dados/);
    await page.click('.ac-selo');
    assert.equal(await page.locator('.ac-fundo').count(), 1, 'o selo reabre o alerta');
    await page.click('[data-ac-ciente]');
    assert.deepEqual(errors, []);
    await page.close();

    // Mesma sessão (aba nova do mesmo contexto): não reabre sozinho, selo segue.
    // sessionStorage é por aba: o "Ciente" de uma aba não vale na outra -- e é
    // o que se quer: cada entrada no sistema mostra de novo.
    ({page, errors} = await abrir(ctx, 'pcp'));
    await page.waitForSelector('.ac-selo', {timeout: 8000});
    await page.waitForSelector('.ac-fundo', {timeout: 8000});
    await page.click('[data-ac-ciente]');
    await page.reload();
    await page.waitForSelector('.ac-selo', {timeout: 8000});
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.ac-fundo').count(), 0, 'depois do Ciente, recarregar a mesma aba não reabre o modal');
    assert.deepEqual(errors, []);
    await ctx.close();

    // ── Logística vê o alerta, mas não grava RNC ────────────────────────
    const ctxLog = await browser.newContext();
    ({page, errors} = await abrir(ctxLog, 'logistica', {pedidos: true, logistica: true}));
    await page.waitForSelector('.ac-fundo', {timeout: 8000});
    await page.waitForTimeout(600);
    assert.match(await page.locator('.ac-fundo').innerText(), /RNC-PA-26315-02/, 'Expedição/Logística vê o alerta');
    assert.equal(await page.evaluate(() => window.__transacoes.length), 0, 'logística não tenta gravar RNC (a regra do banco não deixa)');
    assert.equal(await page.locator('.ac-fundo a[href^="qualidade.html"]').count(), 0, 'sem módulo Qualidade: sem link que daria acesso negado');
    assert.deepEqual(errors, []);
    await ctxLog.close();

    // ── Produção não vê nada nem baixa o script ─────────────────────────
    const ctxProd = await browser.newContext();
    const pedidos = [];
    ctxProd.on('request', r => { if (/alerta-consistencia/.test(r.url())) pedidos.push(r.url()); });
    ({page, errors} = await abrir(ctxProd, 'production', {pedidos: true}));
    await page.waitForSelector('#tableBody tr', {timeout: 8000});
    await page.waitForTimeout(800);
    assert.equal(await page.locator('.ac-fundo, .ac-selo').count(), 0);
    assert.deepEqual(pedidos, [], 'quem não vê o alerta não baixa o script');
    assert.equal(await page.evaluate(() => window.__transacoes.length), 0);
    assert.deepEqual(errors, []);
    await ctxProd.close();

    console.log('OK alerta de consistência: varredura abre RNC-CS, modal vermelho escapado, Ciente por sessão, selo, aguardando conferência laranja, logística só lê.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
