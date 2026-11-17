'use strict';
/* Relatório de Análise de PA: logos no cabeçalho e "Encaminhar ao cliente" (17/11/2026).
   Tela de verdade (qualidade.html, utils.js, auth_check.js), Firebase simulado e com estado,
   html2canvas/jsPDF reais (cdnjs) e o logo do cliente servido por outro domínio com CORS,
   como o Storage. Confere: prévia com logo Kuryos à esquerda e do cliente à direita, tamanho,
   botão só com laudo concluído, e-mails do cadastro + extra, PDF de verdade na callable.
     PLAYWRIGHT_MODULE=<.../node_modules/playwright> node run_laudo_email_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const os = require('node:os');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');

const pal = (n, extra) => Object.assign({
  itemTipo: 'produto', itemCodigo: 'SKU1', itemNome: 'BODY SPLASH X', unidade: 'un', opKey: '26280-01', opLote: '26280/01', loteOrigem: '26280/01',
  paleteNumero: n, identificadorPalete: 'PA-26280-01-P' + n, caixasFechadas: n === 1 ? 61 : 30, unidadesCaixaParcial: 0,
  saldoLote: n === 1 ? 1464 : 720, status: 'QUARENTENA', origemTipo: 'conferencia_pa', enderecoCodigo: 'A-0' + n, criadoEm: '2026-10-10T10:00:00Z'
}, extra || {});

// PNG 40x20 vermelho (logo do cliente de mentira).
const PNG = (() => {
  const w = 40, h = 20, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = 200; raw[i + 1] = 30; raw[i + 2] = 30; }
  const tabela = [];
  for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tabela[k] = c >>> 0; }
  const crc = (b) => { let r = 0xffffffff; for (const x of b) r = tabela[(r ^ x) & 0xff] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (tipo, dados) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
    const td = Buffer.concat([Buffer.from(tipo), dados]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1600, height: 1100}});
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    page.on('dialog', (d) => d.accept());
    const laudo = {decisao: 'LIBERADO_EXPEDICAO', inspecionadoEm: '2026-11-13T12:00:00Z', dataInspecao: '2026-11-13', laudoLote: '26280-01',
      ck7: {pesagem: {pesos: [179, 178, 180, 181, 182, 180, 180, 182], media: 180.25, unidade: 'g', nominal: 178}, itens: {}}};
    const dados = {
      usuarios: {u1: {nome: 'Ana Qualidade', email: 'q@kuryos.com', role: 'qualidade'}},
      config: {responsaveisCq: [{nome: 'Gustavo Callegaro', registro: 'CRQ 1'}]},
      produtos: {p1: {sku: 'SKU1', descricao: 'BODY SPLASH X', clienteKey: 'BIOF', cliente: 'BIOFLORA'}},
      clientes: {BIOF: {nome: 'BIOFLORA', logoEtiquetaUrl: 'https://storage.test/logo-bioflora.png', logoLaudoTamanho: 120, contatosVersao: 1, contatos: {
        a: {nome: 'Ana Técnica', email: 'ana@bioflora.com.br', areas: ['TECNICO'], principais: ['TECNICO']},
        b: {nome: 'Bruno', email: 'fin@bioflora.com.br', areas: ['FINANCEIRO'], principais: ['FINANCEIRO']}}}},
      estoque_lotes: {SKU1: {
        pa_1: pal(1, {status: 'LIBERADO_EXPEDICAO', qualidade: laudo}),
        pa_2: pal(2, {status: 'LIBERADO_EXPEDICAO', qualidade: laudo}),
        r_1: pal(1, {opKey: '26281-01', opLote: '26281/01', loteOrigem: '26281/01', status: 'RETIDO', qualidade: Object.assign({}, laudo, {decisao: 'RETIDO'})})}},
      laudos_envios: {SKU1: {pa_1: {antigo: {status: 'ENVIADO', em: '2026-11-14T10:00:00Z', para: ['velho@bioflora.com.br'], por: 'Ana Qualidade'}}}},
      ops: {'26280-01': {lote: '26280/01', sku: 'SKU1', produto: 'BODY SPLASH X', cliente: 'BIOFLORA', clienteKey: 'BIOF'}}
    };
    await page.addInitScript((inicial) => {
      const db = JSON.parse(JSON.stringify(inicial));
      window.__db = db; window.__iniciado = false; window.__updates = []; window.__chamadas = [];
      const exige = (q) => { if (!window.__iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (" + q + ')'); };
      const get = (p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), db);
      const set = (p, v) => {
        const ks = p.split('/').filter(Boolean); let o = db;
        ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
        if (v == null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
      };
      const ouvintes = [];
      const avisa = () => ouvintes.forEach((o) => setTimeout(() => o.cb({val: () => { const v = get(o.p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, exists: () => get(o.p) !== undefined}), 0));
      let seq = 0;
      window.firebase = {
        initializeApp() { window.__iniciado = true; },
        auth() { exige('auth'); return {currentUser: {uid: 'u1', email: 'q@kuryos.com', displayName: 'Ana Qualidade'},
          onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'q@kuryos.com', displayName: 'Ana Qualidade'}), 0); }, signOut() { return Promise.resolve(); }}; },
        functions() { return {httpsCallable(nome) { return (d) => { window.__chamadas.push({nome, d}); return Promise.resolve({data: {ok: true, status: 'ENVIADO'}}); }; }}; },
        storage() { return {ref() { return {put: () => Promise.resolve(), getDownloadURL: () => Promise.resolve('')}; }}; },
        database() {
          exige('database');
          return {ref(p) {
            p = p || '';
            const snap = () => ({val: () => { const v = p ? get(p) : db; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, exists: () => get(p) !== undefined, forEach() {}});
            return {path: p,
              once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); },
              on(ev, cb) { ouvintes.push({p, cb}); setTimeout(() => cb(snap()), 0); return cb; }, off() {}, child(c) { return this; },
              orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
              set(v) { set(p, v); avisa(); return Promise.resolve(); },
              update(u) { window.__updates.push(Object.keys(u)); Object.keys(u).forEach((k) => set((p ? p + '/' : '') + k, u[k])); avisa(); return Promise.resolve(); },
              remove() { set(p, null); avisa(); return Promise.resolve(); },
              push(v) { const k = 'k' + (++seq); const r = Object.assign(Promise.resolve(), {key: k}); if (v !== undefined) set(p + '/' + k, v); return r; },
              transaction(fn) {
                const atual = get(p) === undefined ? null : JSON.parse(JSON.stringify(get(p)));
                const r = fn(atual);
                if (r === undefined) return Promise.resolve({committed: false, snapshot: snap()});
                set(p, r); avisa(); return Promise.resolve({committed: true, snapshot: snap()});
              }};
          }};
        }
      };
    }, dados);
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cdnjs.cloudflare.com') return route.continue();
      if (url.hostname === 'storage.test') return route.fulfill({body: PNG, contentType: 'image/png', headers: {'Access-Control-Allow-Origin': '*'}});
      if (url.hostname !== 'q.test') return route.fulfill({body: '', contentType: 'text/javascript'});
      const file = 'public/' + url.pathname.slice(1);
      if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
      const tipo = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript';
      return route.fulfill({body: fs.readFileSync(file), contentType: tipo});
    });
    await page.goto('https://q.test/qualidade.html?tab=fila&tipo=pa');
    await page.waitForFunction(() => typeof abrirEmissaoLaudo === 'function' && document.readyState === 'complete', null, {timeout: 8000});
    await page.waitForTimeout(500);

    // Laudo RETIDO: emite, mas não encaminha.
    await page.evaluate(() => abrirEmissaoLaudo('SKU1', 'r_1'));
    await page.waitForSelector('#modalEmitirBg.open', {timeout: 5000});
    assert.equal(await page.locator('#qEmitEncaminhar').isVisible(), false, 'retido não tem Encaminhar');
    await page.click('#qEmitCancelar');

    // Laudo concluído: prévia com os dois logos e o tamanho salvo no cliente.
    await page.evaluate(() => abrirEmissaoLaudo('SKU1', 'pa_1'));
    await page.waitForSelector('#modalEmitirBg.open', {timeout: 5000});
    await page.waitForSelector('#qEmitLogoPrev img.laudo-logo-cliente', {timeout: 5000});
    const prev = await page.evaluate(() => {
      const box = document.querySelector('#qEmitLogoPrev .laudo-topo').getBoundingClientRect();
      const k = document.querySelector('#qEmitLogoPrev .laudo-logo-kuryos'), c = document.querySelector('#qEmitLogoPrev .laudo-logo-cliente');
      return {kSrc: k.getAttribute('src'), kEsq: k.getBoundingClientRect().left - box.left, cDir: box.right - c.getBoundingClientRect().right,
        kAlt: k.getBoundingClientRect().height, estilo: c.getAttribute('style'),
        tam: document.getElementById('qEmitLogoTamValor').textContent, enc: !!document.getElementById('qEmitEncaminhar').offsetParent};
    });
    assert.equal(prev.kSrc, 'kuryos-logo.svg');
    assert.ok(prev.kEsq < 20 && prev.cDir < 20 && prev.kAlt > 20, 'Kuryos à esquerda, cliente à direita: ' + JSON.stringify(prev));
    assert.match(prev.estilo, /max-height:16\.8mm/);
    assert.equal(prev.tam, '120%');
    assert.ok(prev.enc, 'Encaminhar visível com o laudo concluído');
    await page.click('#qEmitLogoMais');
    assert.equal(await page.locator('#qEmitLogoTamValor').innerText(), '125%');
    await page.uncheck('#qEmitLogoCli');
    assert.equal(await page.locator('#qEmitLogoPrev img.laudo-logo-cliente').count(), 0);
    await page.check('#qEmitLogoCli');

    // Impressão: o documento leva os dois logos, no tamanho escolhido.
    await page.evaluate(() => { window.imprimirComNome = function(n) { window.__impresso = n; }; });
    await page.click('#qEmitImprimir');
    await page.waitForFunction(() => window.__impresso, null, {timeout: 5000});
    const impresso = await page.evaluate(() => document.getElementById('laudoPrintArea').innerHTML);
    assert.match(impresso, /laudo-logo-kuryos/);
    assert.match(impresso, /laudo-logo-cliente[^>]*max-height:17\.5mm/);

    // Encaminhar: contatos do cadastro (Técnico marcado, Financeiro não), histórico, extra.
    await page.evaluate(() => abrirEmissaoLaudo('SKU1', 'pa_1'));
    await page.waitForSelector('#qEmitLogoPrev img.laudo-logo-cliente', {timeout: 5000});
    await page.click('#qEmitEncaminhar');
    await page.waitForSelector('#qEnvioBox', {state: 'visible', timeout: 5000});
    assert.equal(await page.locator('#modalEmitirTitle').innerText(), 'Encaminhar laudo ao cliente');
    assert.equal(await page.locator('#qEmitImprimir').isVisible(), false);
    const marcas = await page.$$eval('#qEnvioContatos [data-envio-contato]', (cs) => cs.map((c) => [c.closest('label').querySelector('b').textContent, c.checked]));
    assert.deepEqual(marcas, [['ana@bioflora.com.br', true], ['fin@bioflora.com.br', false]]);
    await page.waitForFunction(() => /velho@bioflora/.test(document.getElementById('qEnvioHistorico').innerText), null, {timeout: 5000});
    await page.fill('#qEnvioExtras', 'quebrado@');
    await page.click('#qEnvioEnviar');
    await page.waitForTimeout(300);
    assert.equal((await page.evaluate(() => window.__chamadas)).length, 0, 'e-mail inválido não chama o servidor');
    await page.fill('#qEnvioExtras', 'Compras@Bioflora.com.br');
    await page.fill('#qEnvioMensagem', 'Lote liberado.');
    await page.click('#qEnvioEnviar');
    await page.waitForFunction(() => window.__chamadas.length === 1, null, {timeout: 30000});
    const ch = await page.evaluate(() => window.__chamadas[0]);
    assert.equal(ch.nome, 'laudoEmailCliente');
    assert.deepEqual(ch.d.para, ['ana@bioflora.com.br', 'compras@bioflora.com.br']);
    assert.equal(ch.d.itemKey, 'SKU1'); assert.equal(ch.d.loteKey, 'pa_1');
    assert.equal(ch.d.logoTamanho, 120);
    assert.equal(ch.d.mensagem, 'Lote liberado.');
    assert.equal(ch.d.nomeArquivo, 'Relatório de análise - BODY SPLASH X - 26280.01');
    assert.match(ch.d.requestId, /^le_[a-z0-9_]{8,}$/);
    const pdf = Buffer.from(ch.d.pdfBase64, 'base64');
    assert.equal(pdf.slice(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 20000 && pdf.length < 6 * 1024 * 1024, 'PDF com conteúdo: ' + pdf.length + ' bytes');
    const folhas = (pdf.toString('latin1').match(/\/Type \/Page[^s]/g) || []).length;
    assert.ok(folhas >= 1 && folhas <= 3, 'folhas: ' + folhas);
    fs.writeFileSync(process.env.LAUDO_PDF_SAIDA || os.tmpdir() + '/laudo_email_ui.pdf', pdf);
    await page.waitForFunction(() => !document.getElementById('modalEmitirBg').classList.contains('open'), null, {timeout: 5000});
    assert.deepEqual(erros, [], 'sem erro de página: ' + erros.join(' | '));
    console.log('  PDF: ' + pdf.length + ' bytes, ' + folhas + ' folha(s)');
  } finally { await browser.close(); }
  console.log('OK Laudo de PA: logos no cabeçalho, Encaminhar só com laudo concluído, e-mails do cadastro + extra, PDF real na callable.');
})().catch((e) => { console.error(e); process.exit(1); });
