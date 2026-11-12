'use strict';
/* Conferência de PA presa (relato de 12/11/2026, Vicenzo): três OPs que
   nenhuma tela conseguia finalizar. Tela real do Estoque, Firebase simulado
   com a forma dos dados de produção.

   - 26251/08: PA já entrou pela regularização da planilha (lote legado,
     EXPEDIDO). O servidor sempre recusaria; não pode aparecer na fila.
   - 26265/01: apontamento corrigido de 581 para 570 depois das contagens
     222, 222 e 570. A conciliação avisa a correção, oferece nova contagem
     física, e a finalização manda ao servidor o apontamento que a tela mostrou. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function palete(cx, parcial) {
  return {p1: {numero: 1, caixasFechadas: cx, unidadesPorCaixa: 12, unidadesCaixaParcial: parcial, qtdUnidades: cx * 12 + parcial, enderecoKey: 'DOC-1-1-1'}};
}

function dados() {
  return {
    'usuarios/u1': {nome: 'vicenzo callegaro', email: 'v@kuryos.com', role: 'logistica'},
    enderecos_estoque: {'DOC-1-1-1': {area: 'DOCA', codigo: 'DOC-1.1.1', rua: 1, predio: 1, nivel: 1, ativo: true}},
    ops: {
      '26265-01': {lote: '26265/01', sku: 'PRF-AFEE-0008', produto: 'PERFUME', status: 'Concluído', produzidoLinha: 570, produzido: 570, dataFimReal: '2026-09-23T15:00:00.000Z'},
      '26251-08': {lote: '26251/08', sku: 'GLMKAM02', produto: 'ÁGUA MICELAR', status: 'Concluído', produzidoLinha: 2880, produzido: 2880, dataFimReal: '2026-09-11T15:00:00.000Z'}
    },
    conferencias_pa: {
      '26265-01': {opKey: '26265-01', sku: 'PRF-AFEE-0008', qtdApontada: 581, status: 'AGUARDANDO_CONCILIACAO', contagens: {
        a: {total: 222, contadoEm: '2026-09-23T15:41:35.457Z', contadoPor: 'Diego Costa', paletes: palete(18, 6)},
        b: {total: 222, contadoEm: '2026-09-23T15:43:09.840Z', contadoPor: 'Diego Costa', paletes: palete(18, 6)},
        c: {total: 570, contadoEm: '2026-09-23T15:51:42.879Z', contadoPor: 'Diego Costa', paletes: palete(47, 6)}}},
      '26251-08': {opKey: '26251-08', sku: 'GLMKAM02', qtdApontada: 2880, status: 'PRONTO_CONCILIADO', contagens: {
        a: {total: 2880, contadoEm: '2026-09-24T14:18:18.043Z', contadoPor: 'vicenzo callegaro', paletes: {p1: {numero: 1, caixasFechadas: 120, unidadesPorCaixa: 24, unidadesCaixaParcial: 0, qtdUnidades: 2880, enderecoKey: 'DOC-1-1-1'}}}}}
    },
    estoque_lotes: {
      GLMKAM02: {LEG_1: {itemTipo: 'produto', itemCodigo: 'GLMKAM02', opKey: '26251-08', origemTipo: 'legado_planilha', status: 'EXPEDIDO', saldoLote: 0, enderecoKey: 'HISTORICO'}}
    }
  };
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1500, height: 1100}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.addInitScript(({data}) => {
      window.__calls = [];
      window.__iniciado = false;
      const exige = q => { if (!window.__iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (" + q + ')'); };
      const get = path => { if (path in data) return data[path]; const partes = path.split('/'); let n = data[partes[0]]; for (const p of partes.slice(1)) n = n == null ? undefined : n[p]; return n === undefined ? null : n; };
      const set = (path, v) => { const ks = path.split('/'); let o = data; ks.slice(0, -1).forEach(k => { if (o[k] == null) o[k] = {}; o = o[k]; }); o[ks[ks.length - 1]] = structuredClone(v); };
      const callable = nome => payload => { window.__calls.push({nome, payload}); return Promise.resolve({data: {ok: true, diferenca: 0}}); };
      window.firebase = {
        initializeApp(cfg) { if (!cfg || !cfg.databaseURL) throw new Error('sem databaseURL'); window.__iniciado = true; },
        auth() { exige('auth'); return {onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'v@kuryos.com', displayName: 'vicenzo'}), 0); }, signOut() { return Promise.resolve(); }, currentUser: {email: 'v@kuryos.com'}}; },
        functions() { return {httpsCallable: callable, httpsCallableFromURL: callable}; },
        app() { return {functions: () => ({httpsCallable: callable, httpsCallableFromURL: callable})}; },
        database() {
          exige('database');
          let seq = 0;
          const ref = path => {
            const snap = () => ({val: () => structuredClone(get(path)), exists: () => get(path) != null, key: String(path).split('/').pop()});
            return {path, key: String(path).split('/').pop(),
              once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); },
              on(ev, cb) { setTimeout(() => cb(snap()), 0); return cb; }, off() {},
              child(p) { return ref(path + '/' + p); },
              push() { seq++; return ref(path + '/-ZZ' + seq); },
              orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; }, startAt() { return this; }, endAt() { return this; },
              set(v) { set(path, v); return Promise.resolve(); }, update() { return Promise.resolve(); }, remove() { return Promise.resolve(); },
              transaction(fn) { const v = fn(structuredClone(get(path))); if (v !== undefined) set(path, v); return Promise.resolve({committed: v !== undefined, snapshot: {val: () => structuredClone(v), exists: () => v != null}}); }};
          };
          return {ref, ServerValue: {TIMESTAMP: 0}};
        }
      };
    }, {data: dados()});
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'pa.test') return route.fulfill({body: '', contentType: 'text/javascript'});
      const file = 'public/' + url.pathname.slice(1);
      if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
      return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
    });
    await page.goto('https://pa.test/estoque.html');
    await page.waitForSelector('.kt-sidebar', {timeout: 8000});
    await page.click('.tab[data-tab="conferenciapa"]');
    await page.waitForSelector('[data-cpa-op="26265-01"]', {timeout: 8000});

    // 1. OP com PA já regularizado pela planilha não fica na fila
    const fila = await page.textContent('#cpaFilaBody');
    assert.doesNotMatch(fila, /26251\/08/, 'OP já expedida pela regularização continua na fila');
    assert.equal(await page.locator('[data-cpa-op]').count(), 1);

    // 2. Conciliação avisa a correção do apontamento e oferece nova contagem
    await page.click('[data-cpa-op="26265-01"]');
    await page.waitForSelector('#cpaRecontar');
    const modal = await page.evaluate(() => document.getElementById('cpaResolver').parentNode.parentNode.innerText);
    assert.match(modal, /Apontado: 570 un\.[\s\S]*Consenso físico: 222 un\.[\s\S]*Diferença: -348 un\./);
    assert.match(modal, /corrigido de 581 para 570 un\./, 'Não avisa que o apontamento mudou');

    // 3. Nova contagem (4ª) = 570 forma consenso com a 3ª e finaliza sem divergência
    await page.click('#cpaRecontar');
    await page.waitForSelector('#cpaSalvar');
    assert.match(await page.textContent('#cpaSalvar'), /Registrar 4ª contagem/);
    await page.evaluate(() => {
      const l = document.querySelector('.cpa-palete');
      l.querySelector('.cpa-caixas').value = 47; l.querySelector('.cpa-multiplo').value = 12; l.querySelector('.cpa-parcial').value = 6;
      l.querySelector('.cpa-total').value = 570; l.querySelector('.cpa-endereco').value = 'DOC-1-1-1';
    });
    await page.click('#cpaSalvar');
    await page.waitForFunction(() => window.__calls.length > 0, null, {timeout: 5000});
    const calls = await page.evaluate(() => window.__calls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].nome, 'finalizarConferenciaPA');
    assert.equal(calls[0].payload.opKey, '26265-01');
    assert.equal(calls[0].payload.qtdApontadaVista, 570, 'Não mandou o apontamento que a tela mostrou');
    assert.equal(calls[0].payload.conciliacao, null, 'Consenso igual ao apontamento não exige conciliação');

    assert.deepEqual(errors, []);
    console.log('OK Conferência de PA presa: OP já regularizada sai da fila; conciliação avisa apontamento corrigido; nova contagem forma consenso e finaliza com o apontamento visto.');
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
