'use strict';
/* Chamados (helpdesk) no Chrome, de ponta a ponta, com o servidor REAL (functions/chamados.js) atrás
   de um Firebase simulado:
   1. usuário abre chamado com prints (escolher arquivo e colar com Ctrl+V), recusa o 4º print;
   2. ADM vê o contador do menu, arrasta o cartão para "Na fila", faz a triagem (Urgente) e move para Validar;
   3. autor vê "aguarda você" no menu, confirma a solução e o contador some;
   4. celular de 390 px sem rolagem horizontal e nenhum erro de JavaScript.
   Rodar: PLAYWRIGHT_MODULE=<node_modules/playwright> node run_chamados_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const S = require('./functions/chamados');

// ── Banco simulado do lado do servidor (mesmo molde do run_chamados_test) ──
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const partes = (p) => String(p || '').split('/').filter(Boolean);
const ler = (root, p) => partes(p).reduce((v, k) => (v == null ? undefined : v[k]), root);
function gravar(root, p, value) { const ps = partes(p); let no = root; ps.slice(0, -1).forEach((k) => { if (!no[k] || typeof no[k] !== 'object') no[k] = {}; no = no[k]; }); if (value === null) delete no[ps[ps.length - 1]]; else no[ps[ps.length - 1]] = clone(value); }
class Snap { constructor(v) { this.v = clone(v); } val() { return clone(this.v); } exists() { return this.v != null; } }
class Ref {
  constructor(db, p) { this.db = db; this.path = p || ''; }
  child(p) { return new Ref(this.db, [this.path, p].filter(Boolean).join('/')); }
  push() { return new Ref(this.db, [this.path, 'k' + (++this.db.seq)].filter(Boolean).join('/')); }
  get key() { return partes(this.path).slice(-1)[0] || null; }
  once() { return Promise.resolve(new Snap(ler(this.db.data, this.path))); }
  set(v) { gravar(this.db.data, this.path, v); return Promise.resolve(); }
  update(u) { Object.keys(u).forEach((p) => gravar(this.db.data, this.path ? this.path + '/' + p : p, u[p])); return Promise.resolve(); }
  transaction(fn) { const atual = clone(ler(this.db.data, this.path)); const novo = fn(atual === undefined ? null : atual); if (novo === undefined) return Promise.resolve({committed: false, snapshot: new Snap(atual)}); gravar(this.db.data, this.path, novo); return Promise.resolve({committed: true, snapshot: new Snap(novo)}); }
}
const USUARIOS = {u1: {nome: 'Yasmin', email: 'yasmin@kuryos.com.br', role: 'pd'}, adm: {nome: 'Gustavo', email: 'adm@kuryos.com.br', role: 'admin'}};
const dbSrv = {data: {usuarios: clone(USUARIOS)}, seq: 0, ref(p) { return new Ref(this, p); }};
const uploads = {};
const emails = [];
const servico = S.criarServico({
  db: dbSrv,
  obterAnexo: async (caminho) => { const u = uploads[caminho]; if (!u) throw new Error('não enviado'); return u; },
  enviarEmail: async (para, assunto) => { emails.push({para, assunto}); return true; },
  versao: '65038e6c0ffee',
});
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function abrir(browser, uid, url, largura) {
  const page = await browser.newPage({viewport: {width: largura || 1366, height: 900}});
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_FILE|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Resolvido conferindo a tela.' : undefined));
  const espelho = {usuarios: clone(USUARIOS), chamados_caixa: clone(ler(dbSrv.data, 'chamados_caixa') || {}), chamados_fila_adm: clone(ler(dbSrv.data, 'chamados_fila_adm') || {})};
  await page.addInitScript(({uid, data}) => {
    const db = data; window.__db = db;
    const pt = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => pt(p).reduce((x, k) => (x == null ? undefined : x[k]), db);
    const ouvintes = [];
    window.__sincronizar = (no) => { Object.assign(db, no); ouvintes.forEach((f) => f()); };
    window.firebase = {
      initializeApp() {},
      auth() { return {currentUser: {uid, email: uid + '@kuryos.com.br'}, onAuthStateChanged(cb) { setTimeout(() => cb({uid, email: uid + '@kuryos.com.br'}), 0); }, signOut() { return Promise.resolve(); }}; },
      functions() { return {httpsCallable(nome) { return (payload) => window.__servidor(uid, nome, payload).then((r) => { if (r.espelho) window.__sincronizar(r.espelho); if (r.erro) { const e = new Error(r.erro); e.code = r.code; throw e; } return {data: r.data}; }); }}; },
      storage() {
        return {ref(caminho) {
          return {
            put(arquivo, meta) {
              const ouv = {};
              const tarefa = {on(ev, prog, falha, fim) { arquivo.arrayBuffer().then((b) => window.__upload(caminho, {size: b.byteLength, contentType: meta.contentType, originalName: (meta.customMetadata || {}).originalName}))
                .then(() => { prog({bytesTransferred: arquivo.size, totalBytes: arquivo.size}); fim(); }, falha); }};
              return tarefa;
            },
            getDownloadURL() { return Promise.resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='); }
          };
        }};
      },
      database() {
        const ref = (p) => {
          const snap = () => { const v = ler(p); const c = v === undefined ? null : structuredClone(v); return {val: () => c, exists: () => c !== null}; };
          return {child(c) { return ref(p + '/' + c); }, once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); }, get() { return Promise.resolve(snap()); },
            on(ev, cb) { const f = () => cb(snap()); ouvintes.push(f); setTimeout(f, 0); return cb; }, off() {},
            orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; }, set() { return Promise.resolve(); }, update() { return Promise.resolve(); }};
        };
        return {ref: (x) => ref(x || '')};
      },
    };
  }, {uid, data: espelho});
  await page.exposeFunction('__upload', (caminho, meta) => { uploads[caminho] = meta; });
  await page.exposeFunction('__servidor', async (quem, nome, payload) => {
    const espelhar = () => ({chamados_caixa: clone(ler(dbSrv.data, 'chamados_caixa') || {}), chamados_fila_adm: clone(ler(dbSrv.data, 'chamados_fila_adm') || {})});
    if (nome !== 'chamadoSistema') return {erro: 'callable desconhecida ' + nome};
    try { return {data: await servico.executar(quem, payload || {}), espelho: espelhar()}; } catch (e) { return {erro: e.message, code: e.code, espelho: espelhar()}; }
  });
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== 'ch.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const f = path.join(__dirname, 'public', u.pathname.slice(1));
    if (!fs.existsSync(f)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(f), contentType: f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
  await page.goto('https://ch.test/' + url);
  await page.waitForFunction(() => window.currentUser && document.getElementById('mensagem').hidden &&
    (document.querySelector('#quadro .ch-column') || document.querySelector('#lista .ch-row') || /Nenhum chamado/.test(document.getElementById('lista').innerText)));
  return {page, erros};
}
const contador = (page) => page.evaluate(() => { const e = document.getElementById('kt-cham-n'); return e && !e.hidden ? e.textContent : ''; });

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  const SHOTS = process.env.SHOTS_DIR;
  const shot = async (page, nome) => { if (SHOTS) await page.screenshot({path: path.join(SHOTS, nome + '.png'), fullPage: true}); };
  const todosErros = [];
  try {
    // ── 1. Usuário abre o chamado ─────────────────────────────────────────
    let {page, erros} = await abrir(browser, 'u1', 'chamados.html');
    todosErros.push(erros);
    ok(await page.locator('#unified-navbar a[href*="chamados"]').count() >= 1, 'menu tem "Chamados" no topo, ao lado de Cobranças');
    ok(/Nenhum chamado encontrado/.test(await page.locator('#lista').innerText()), 'lista vazia para quem nunca abriu');
    await page.click('#btnNovo');
    await page.selectOption('#novoTipo', 'ERRO');
    await page.selectOption('#novoImpacto', 'ALTO');
    await page.fill('#novoTitulo', 'Não consigo confirmar a amostra de MP');
    await page.fill('#novoDescricao', 'Ao confirmar a amostra, o botão carrega e nada acontece. Esperava ver a amostra como recebida.');
    await page.setInputFiles('#arquivoInput', [{name: 'tela1.png', mimeType: 'image/png', buffer: PNG}, {name: 'tela2.webp', mimeType: 'image/webp', buffer: PNG}]);
    ok(await page.locator('#anexoContador').innerText() === '2/3', 'dois prints escolhidos, com prévia');
    await page.evaluate((b64) => {
      const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const dt = new DataTransfer(); dt.items.add(new File([arr], 'colado.png', {type: 'image/png'}));
      document.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt}));
    }, PNG.toString('base64'));
    ok(await page.locator('#anexoContador').innerText() === '3/3', 'terceiro print colado com Ctrl+V');
    await page.setInputFiles('#arquivoInput', [{name: 'quarto.png', mimeType: 'image/png', buffer: PNG}]);
    ok(/no máximo 3 prints/.test(await page.locator('#novoErro').innerText()), 'quarto print recusado');
    await shot(page, '1-novo-chamado');
    await page.click('#btnEnviar');
    await page.waitForFunction(() => /CH-00001/.test(document.getElementById('lista').innerText));
    const id = Object.keys(dbSrv.data.chamados)[0], ch = dbSrv.data.chamados[id];
    ok(ch.codigo === 'CH-00001' && Object.keys(ch.anexos).length === 3, 'chamado CH-00001 criado com os 3 prints');
    ok(ch.contexto.versao === '65038e6c0ffee' && /\d+x\d+/.test(ch.contexto.viewport), 'contexto automático: versão publicada e tamanho da tela');
    ok(emails.length === 1 && emails[0].para.includes('adm@kuryos.com.br'), 'ADM avisado por e-mail');
    ok(await contador(page) === '', 'nada espera pelo autor: contador escondido');
    await page.close();

    // ── 2. ADM tria no quadro ─────────────────────────────────────────────
    ({page, erros} = await abrir(browser, 'adm', 'chamados.html?visao=QUADRO'));
    todosErros.push(erros);
    await page.waitForSelector('.ch-column[data-status="NOVO"] .ch-card');
    ok(await contador(page) === '1', 'contador do ADM: 1 chamado aguardando');
    ok(await page.locator('.ch-tab[data-visao="QUADRO"]').getAttribute('aria-selected') === 'true', 'aberto pelo Roadmap, a aba Quadro fica marcada');
    ok(!(await page.locator('#lista').isVisible()), 'no quadro, a lista (e o "Carregando") fica escondida');
    await page.dragAndDrop('.ch-column[data-status="NOVO"] .ch-card', '.ch-column[data-status="NA_FILA"]');
    await page.waitForSelector('.ch-column[data-status="NA_FILA"] .ch-card');
    ok(dbSrv.data.chamados[id].status === 'NA_FILA' && typeof dbSrv.data.chamados[id].ordem === 'number', 'arrastado para "Na fila", com a posição gravada');
    await shot(page, '2-quadro');
    await page.click('.ch-column[data-status="NA_FILA"] .ch-card');
    await page.waitForSelector('#dtTriar');
    const det = await page.locator('#detalheDialog').innerText();
    ok(/Versão\s*65038e6/.test(det) && /Prints anexados/.test(det), 'detalhe mostra versão e prints');
    await page.selectOption('#dtPrioridade', 'P0');
    await page.fill('#dtResponsavel', 'Equipe ERP');
    await page.click('#dtTriar');
    await page.waitForFunction(() => /Urgente/.test(document.getElementById('detalheDialog').innerText));
    ok(dbSrv.data.chamados[id].prioridade === 'P0', 'triagem: Urgente');
    await page.click('[data-mover="VALIDAR"]');
    await page.waitForFunction((cid) => true, id);
    await page.waitForFunction(() => /Validar/.test(document.getElementById('detalheDialog').innerText) && !/Movendo/.test(document.getElementById('mensagem').innerText));
    ok(dbSrv.data.chamados[id].status === 'VALIDAR', 'movido para Validar');
    await page.close();

    // ── 3. Autor confirma ─────────────────────────────────────────────────
    ({page, erros} = await abrir(browser, 'u1', 'chamados.html'));
    todosErros.push(erros);
    ok(await contador(page) === '1', 'autor vê "1 aguarda você" no menu');
    ok(/Aguarda você/.test(await page.locator('#lista').innerText()), 'lista diz que aguarda o autor');
    await page.click('.ch-row');
    await page.waitForSelector('#dtConfirmar');
    await page.click('#dtConfirmar');
    await page.waitForFunction(() => /Concluído/.test(document.getElementById('lista').innerText));
    ok(dbSrv.data.chamados[id].status === 'CONCLUIDO', 'solução confirmada pelo autor');
    await page.waitForFunction(() => { const e = document.getElementById('kt-cham-n'); return e && e.hidden; });
    ok(true, 'contador some depois de confirmar');
    const hist = Object.values(dbSrv.data.chamados[id].historico).map((h) => h.tipo);
    ok(['CRIADO', 'STATUS', 'TRIAGEM', 'CONFIRMADO'].every((t) => hist.includes(t)), 'histórico: criado, movido, triado e confirmado');
    await page.close();

    // ── 4. Celular ────────────────────────────────────────────────────────
    ({page, erros} = await abrir(browser, 'u1', 'chamados.html', 390));
    todosErros.push(erros);
    let rol = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(rol <= 1, 'celular 390 px, lista: sem rolagem horizontal da página (' + rol + ')');
    await page.click('#btnNovo');
    rol = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(rol <= 1, 'celular 390 px, formulário: sem rolagem horizontal (' + rol + ')');
    await shot(page, '3-celular');
    await page.close();
    const errs = [].concat(...todosErros);
    ok(!errs.length, 'sem erro de JavaScript: ' + errs.join(' | '));
  } finally { await browser.close(); }
  console.log('OK chamados (tela): ' + n + ' verificações');
})().catch((e) => { console.error(e); process.exit(1); });
