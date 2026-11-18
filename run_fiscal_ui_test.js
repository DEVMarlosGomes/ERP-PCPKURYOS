'use strict';
/* Tela do Fiscal (public/fiscal.html) no Chrome: upload de XML e ZIP, prévia, importação
   (com a nota do Financeiro no mesmo upload, Q8), regras sugeridas, livros com a receita da
   encomenda, relatório de inconsistências do SPED, estabelecimento, SPED/SINTEGRA baixados em
   Latin-1, apuração, fechamento, pacote do Domínio e celular de 390 px.
   Firebase simulado; as callables rodam o servidor real (functions/fiscal_servidor.js).
   Rodar: PLAYWRIGHT_MODULE=<node_modules/playwright> node run_fiscal_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const FisSrv = require('./functions/fiscal_servidor');
const FinSrv = require('./functions/financeiro_servidor');
const Fis = require('./functions/fiscal');
const X = require('./test-fixtures/fiscal-xml');

const util = {gzip: (t) => zlib.gzipSync(Buffer.from(t, 'utf8')).toString('base64'), gunzip: (b) => zlib.gunzipSync(Buffer.from(b, 'base64')).toString('utf8'),
  sha256: (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex')};
const M = X.mesDeTeste();
const arquivo = (k) => ({name: k + '.xml', mimeType: 'text/xml', buffer: Buffer.from(typeof M[k] === 'string' ? M[k] : M[k].xml, 'utf8')});

// ZIP sem compressão (STORE): basta para provar a leitura de ZIP na tela.
function crc32(buf) { let c, crc = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {
  const partes = [], central = []; let off = 0;
  files.forEach(({nome, dados}) => {
    const n = Buffer.from(nome), crc = crc32(dados), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(dados.length, 18); h.writeUInt32LE(dados.length, 22); h.writeUInt16LE(n.length, 26);
    partes.push(h, n, dados);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(dados.length, 20); c.writeUInt32LE(dados.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, n); off += 30 + n.length + dados.length;
  });
  const cd = Buffer.concat(central), fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(files.length, 8); fim.writeUInt16LE(files.length, 10); fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(off, 16);
  return Buffer.concat(partes.concat([cd, fim]));
}

async function abrir(browser, dados, largura) {
  const page = await browser.newPage({viewport: {width: largura || 1400, height: 950}, acceptDownloads: true});
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? (/Data/.test(d.message()) ? '2026-12-10' : 'REC123456789') : undefined));
  await page.addInitScript(({data}) => {
    const db = data;
    window.__db = db;
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
          return (payload) => window.__servidor(nome, structuredClone(payload), structuredClone(db)).then((r) => {
            if (r.erro) return Promise.reject(new Error(r.erro));
            Object.entries(r.updates || {}).forEach(([k, v]) => gravar(k, v));
            avisar();
            return {data: r.data};
          });
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
  let relogio = 0;
  await page.exposeFunction('__servidor', async (nome, payload, base) => {
    try {
      const quem = {uid: 'u1', nome: 'Gustavo', role: 'admin', perfil: {role: 'admin'}};
      const agora = new Date(Date.UTC(2026, 10, 30, 12, 0, relogio++)).toISOString();
      if (nome === 'fisImportarXml') {
        const x = FisSrv.prepararImportacao(base, payload, quem, agora, util);
        const updates = Object.assign({}, x.updates);
        if (x.xmlsEntrada.length) Object.assign(updates, FinSrv.prepararNotasEntrada(Object.assign({}, base, {fin: base.fin || {}}), {xmls: x.xmlsEntrada}, quem, agora).updates);
        return {updates, data: {ok: true, resultados: x.resultados}};
      }
      const simples = {fisSalvarCadastro: FisSrv.prepararCadastro, fisSalvarApuracao: FisSrv.prepararApuracao, fisGerarSintegra: FisSrv.prepararSintegra, fisGerarInventario: FisSrv.prepararInventario,
        fisFecharMes: FisSrv.prepararFechamento, fisReabrirMes: FisSrv.prepararReabertura, fisRegistrarTransmissao: FisSrv.prepararTransmissao}[nome];
      if (simples) { const x = simples(base, payload, quem, agora, util); const d = Object.assign({}, x); delete d.updates; return {updates: x.updates, data: d}; }
      if (nome === 'fisGerarEfd') {
        const x = FisSrv.prepararEfd(base, payload, quem, agora, util);
        if (x.jaFechado) return {updates: {}, data: {ok: true, jaFechado: true, id: x.arquivo, texto: util.gunzip(base.fis_arquivos[x.arquivo].gz)}};
        return {updates: x.updates, data: {ok: x.ok, id: x.id, texto: x.texto || '', inconsistencias: x.inconsistencias || []}};
      }
      if (nome === 'fisBaixarArquivo') { const c = base.fis_arquivos[payload.id]; return {data: {ok: true, id: payload.id, texto: util.gunzip(c.gz), tipo: c.tipo}}; }
      if (nome === 'fisXmlsDoPeriodo') {
        const docs = base.fis.documentos || {};
        const arqs = Object.keys(docs).filter((k) => Fis.mesDoDocumento(docs[k]) === payload.mes && base.fis_xml[k]).map((k) => ({nome: k + '.xml', pasta: docs[k].indOper === '1' ? 'saidas' : 'entradas', texto: util.gunzip(base.fis_xml[k].gz)}));
        return {data: {ok: true, arquivos: arqs}};
      }
      return {erro: 'callable não simulado: ' + nome};
    } catch (e) { return {erro: e.message}; }
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cdnjs.cloudflare.com' && /jszip/.test(url.pathname)) return route.continue();
    if (url.hostname !== 'fis.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = path.join(__dirname, 'public', url.pathname.slice(1));
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
  await page.goto('https://fis.test/fiscal.html');
  await page.waitForFunction(() => window.currentUser && document.querySelector('#selMes option'));
  return {page, erros};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  const SHOTS = process.env.SHOTS_DIR;
  const shot = async (page, nome) => { if (SHOTS) await page.screenshot({path: path.join(SHOTS, nome + '.png'), fullPage: true}); };
  const texto = (page) => page.locator('#conteudo').innerText();
  const baixar = async (page, sel) => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]); return {nome: d.suggestedFilename(), buf: fs.readFileSync(await d.path())}; };
  try {
    const banco = {usuarios: {u1: {nome: 'Gustavo', email: 'adm@kuryos.com', role: 'admin'}}, fis: {}, fin: {}, fis_xml: {}, fis_arquivos: {}};
    const {page, erros} = await abrir(browser, banco);
    ok(/Regime tributário ainda não definido/.test(await texto(page)), 'sem regime: a tela avisa (D1)');
    // Upload: XMLs soltos + um ZIP com dois
    const zip = zipStore([{nome: 'lote/venda.xml', dados: Buffer.from(M.venda.xml)}, {nome: 'lote/cancel.xml', dados: Buffer.from(M.cancelamento)}]);
    const soltos = ['compraMp', 'compraPr', 'usoConsumo', 'simples', 'remessaCliente', 'saidaEncomenda', 'vendaCancelada', 'cce', 'inut', 'frete'].map(arquivo);
    await page.setInputFiles('#xmlArquivos', soltos.concat([{name: 'lote.zip', mimeType: 'application/zip', buffer: zip}]));
    await page.waitForSelector('#xmlImportar');
    let t = await texto(page);
    ok((t.match(/novo/g) || []).length >= 12, 'prévia: 12 arquivos novos, incluindo os 2 de dentro do ZIP');
    await shot(page, '1-previa');
    await page.click('#xmlImportar');
    await page.waitForFunction(() => !document.querySelector('#xmlImportar') && Object.keys((window.__db.fis || {}).documentos || {}).length >= 10);
    const db1 = await page.evaluate(() => window.__db);
    ok(Object.keys(db1.fis.documentos).length === 10, 'importados 10 documentos (9 + inutilização)');
    ok(db1.fis.documentos[M.vendaCancelada.chave].situacao === '02', 'cancelamento aplicado');
    ok(Object.keys((db1.fin || {}).notas_entrada || {}).length === 5, 'as 5 NF-e de entrada viraram nota do Financeiro no mesmo upload (Q8)');
    await page.selectOption('#selMes', '2026-11');
    t = await texto(page);
    ok(/Documentos de nov\/26/.test(t) && /MARCA COSMETICOS/.test(t), 'lista do mês com os participantes');
    ok(!/NaN|undefined|\[object/.test(t), 'documentos: sem número inválido');
    // Detalhe
    await page.click('tr[data-doc="' + M.saidaEncomenda.chave + '"]');
    await page.waitForSelector('#dlg[open]');
    ok(/Valor cobrado R\$ 17\.600,00/.test(await page.locator('#dlgB').innerText()), 'detalhe da NF de encomenda: valor cobrado pela fatura');
    await page.click('#dlgX');
    // Regras sugeridas
    await page.click('.aba[data-aba="regras"]');
    await page.waitForSelector('#regSugerir');
    await page.selectOption('[data-sug-tipo="5102"]', '07');
    await page.click('#regSugerir');
    await page.waitForFunction(() => Object.keys((window.__db.fis || {}).regras_entrada || {}).length >= 5);
    const regras = await page.evaluate(() => window.__db.fis.regras_entrada);
    ok(regras['5102'].cfopEntrada === '1556' && regras['5901'].propriedade === 'CLIENTE', 'regras sugeridas: 5102 uso e consumo → 1556, 5901 → material do cliente');
    // Livros
    await page.click('.aba[data-aba="livros"]');
    await page.waitForSelector('#lvCsv');
    t = await texto(page);
    ok(/Industrialização 5124\/5125\s*R\$ 17\.600,00/.test(t) && /Retorno simbólico 5902\/5903\s*R\$ 13\.500,00/.test(t), 'livros: industrialização e retorno simbólico separados');
    const csv = await baixar(page, '#lvCsv');
    ok(/^﻿?Livro;Data;/.test(csv.buf.toString('utf8')), 'CSV do livro');
    await shot(page, '2-livros');
    // SPED sem estabelecimento: relatório de inconsistências
    await page.click('.aba[data-aba="sped"]');
    await page.waitForSelector('#spExportar');
    await page.click('#spExportar');
    await page.waitForSelector('#dlg[open]');
    t = await page.locator('#dlgB').innerText();
    ok(/RELATÓRIO DE INCONSISTÊNCIAS SPED FISCAL/.test(await page.locator('#dlgT').innerText()) && /CPF do contabilista não informado/.test(t) && /CRC do contabilista não informado/.test(t), 'SPED sem contabilista: o mesmo relatório do WebMais');
    await shot(page, '3-inconsistencias');
    await page.click('#dlgX');
    // Estabelecimento
    await page.click('.aba[data-aba="estab"]');
    await page.waitForSelector('#esSalvar');
    const preencher = {esCnpj: X.KURYOS.cnpj, esIe: X.KURYOS.ie, esNome: X.KURYOS.nome, esEnd: 'RUA LAGOA TAI GRANDE', esNum: '1130', esBairro: 'VILA CARMOZINA', esCep: '08270000', esMun: 'SAO PAULO', esCodMun: '3550308', esUf: 'SP', esCnae: '2063100',
      esCodRec: '046-2', esDiaVenc: '20', esConta: '1.1.4.01', ctNome: 'CONTADOR TESTE', ctCpf: '52998224725', ctCrc: 'SP123456O8', ctEmail: 'c@x.com', ctCodMun: '3550308'};
    for (const [id, v] of Object.entries(preencher)) await page.fill('#' + id, v);
    await page.selectOption('#esRegime', 'NORMAL');
    await page.click('#esSalvar');
    await page.waitForFunction(() => ((window.__db.fis || {}).estabelecimento || {}).regime === 'NORMAL');
    ok(true, 'estabelecimento e contabilista salvos pelo servidor (regime pelo ADM)');
    // Apuração com ajuste
    await page.click('.aba[data-aba="apuracao"]');
    await page.waitForSelector('#apSalvar');
    await page.fill('#ajCod', 'SP020799'); await page.fill('#ajDesc', 'Outros créditos'); await page.fill('#ajVal', '100,00');
    await page.click('#ajAdd');
    await page.click('#apSalvar');
    await page.waitForFunction(() => (((window.__db.fis || {}).apuracao || {})['2026-11'] || {}).e110);
    t = await texto(page);
    ok(/ICMS a recolher\s*R\$ 1\.422,00/.test(t), 'apuração: a recolher com o ajuste E111 (R$ 1.422,00)');
    // SPED gerado e baixado em Latin-1
    await page.click('.aba[data-aba="sped"]');
    await page.waitForSelector('#spExportar');
    const efd = await baixar(page, '#spExportar');
    ok(efd.nome === 'SPED_EFD_00767554000119_202611.txt', 'arquivo ' + efd.nome);
    const efdTxt = efd.buf.toString('latin1');
    ok(/^\|0000\|020\|0\|01112026\|30112026\|/.test(efdTxt) && efdTxt.includes('|E116|000|1422,00|'), 'EFD com 0000, apuração e E116');
    ok(!efd.buf.includes(Buffer.from([0xC3])), 'arquivo em ISO-8859-1 (sem bytes de UTF-8)');
    if (await page.locator('#dlg[open]').count()) { ok(/Avisos do SPED Fiscal/.test(await page.locator('#dlgT').innerText()), 'o arquivo sai e os avisos aparecem (item sem de-para)'); await page.click('#dlgX'); }
    await page.waitForSelector('[data-transm]');
    ok(/Arquivos gerados/.test(await texto(page)), 'histórico de arquivos do mês');
    await page.click('[data-transm]');
    await page.waitForFunction(() => Object.values(((window.__db.fis || {}).arquivos || {})['2026-11'] || {}).some((a) => a.recibo));
    ok(/recibo REC123456789/.test(await texto(page)), 'transmissão registrada com o recibo');
    // SINTEGRA
    await page.click('.aba[data-aba="sintegra"]');
    await page.waitForSelector('#snGerar');
    const sin = await baixar(page, '#snGerar');
    ok(sin.buf.toString('latin1').split('\r\n').filter(Boolean).every((l) => l.length === 126), 'SINTEGRA baixado, 126 posições por linha');
    // Domínio
    await page.click('.aba[data-aba="dominio"]');
    await page.waitForSelector('#dmExportar');
    const dom = await baixar(page, '#dmExportar');
    ok(dom.nome === 'dominio_fiscal_202611.zip' && dom.buf.readUInt32LE(0) === 0x04034b50 && dom.buf.includes(Buffer.from('xml/saidas/')) && dom.buf.includes(Buffer.from('SPED_EFD_')), 'pacote do Domínio: ZIP com XMLs, EFD e livro');
    // Fechamento
    await page.click('.aba[data-aba="apuracao"]');
    await page.waitForSelector('#fmFechar');
    await page.click('#fmFechar');
    await page.waitForFunction(() => (((window.__db.fis || {}).fechamentos || {})['2026-11'] || {}).status === 'FECHADO');
    ok(/está fechado/.test(await texto(page)), 'mês fechado: a tela avisa');
    ok(await page.locator('#fmReabrir').count() === 1, 'ADM vê "Reabrir"');
    ok(!erros.length, 'sem erro de JavaScript: ' + erros.join(' | '));
    await shot(page, '4-apuracao-fechada');
    // Celular
    const m = await abrir(browser, await page.evaluate(() => window.__db), 390);
    await m.page.selectOption('#selMes', '2026-11');
    for (const aba of ['docs', 'livros', 'sped', 'estab']) {
      await m.page.click('.aba[data-aba="' + aba + '"]');
      const rol = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(rol <= 1, 'celular 390 px, aba ' + aba + ': sem rolagem horizontal da página (' + rol + ')');
    }
    await shot(m.page, '5-celular');
  } finally { await browser.close(); }
  console.log('OK fiscal (tela): ' + n + ' verificações');
})().catch((e) => { console.error(e); process.exit(1); });
