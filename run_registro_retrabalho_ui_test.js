'use strict';
/* Registro retrospectivo de retrabalho (16/11/2026): aba real "Registros de retrabalho" de qualidade.html
   no Chrome, Firebase simulado. A callable registroRetrabalho roda no Node com o serviço REAL
   (functions/registro_retrabalho.js) sobre uma cópia do estado da página (base real do caso 26302/01).
     PLAYWRIGHT_MODULE=<caminho do playwright> node run_registro_retrabalho_ui_test.js */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const S = require('./functions/registro_retrabalho.js');
const FIX = JSON.parse(fs.readFileSync('run_registro_retrabalho_fixture.json', 'utf8'));
delete FIX._origem;

function bancoFalso(inicial) {
  const raiz = JSON.parse(JSON.stringify(inicial || {}));
  const partes = (p) => String(p || '').split('/').filter(Boolean);
  const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), raiz);
  const gravar = (p, v) => {
    const ks = partes(p); let o = raiz;
    ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
  };
  let seq = 0;
  const snap = (p) => { const v = ler(p); return {val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))), exists: () => v != null}; };
  const ref = (p) => ({
    key: partes(p).pop() || null,
    once: async () => snap(p), set: async (v) => gravar(p, v),
    push: () => ref((p ? p + '/' : '') + '-h' + Date.now().toString(36) + String(++seq).padStart(4, '0')),
    transaction: async (fn) => { const r = fn(snap(p).val()); if (r !== undefined) gravar(p, r); return {committed: r !== undefined, snapshot: snap(p)}; },
  });
  return {ref, raiz};
}

async function abrir(browser, estado, uid, viewport) {
  const page = await browser.newPage({viewport: viewport || {width: 1500, height: 1100}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.__respostas = [];
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? (page.__respostas.shift() || '') : undefined));
  await page.exposeFunction('__registroNode', async (data, est) => {
    const db = bancoFalso(est);
    try {
      const r = await S.criarServico({db}).executar(uid, data);
      return {r, registros: db.raiz.registros_retrabalho || null, pedidos: db.raiz.registros_retrabalho_pedidos || null};
    } catch (e) { return {erro: {code: e.code, message: e.message}}; }
  });
  await page.addInitScript(([data, uidPagina]) => {
    const db = data;
    window.__db = db;
    // Impressão: guarda o que foi para a folha em vez de abrir o diálogo do sistema.
    window.__impressoes = [];
    window.print = () => { const a = document.getElementById('laudoPrintArea'); window.__impressoes.push({titulo: document.title, html: a ? a.innerHTML : ''}); };
    let iniciado = false;
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const ouvintes = [];
    const notificar = (bruto) => {
      const p = partes(bruto).join('/');
      ouvintes.forEach((o) => { const a = partes(o.path).join('/'); if (!a || p === a || p.indexOf(a + '/') === 0 || a.indexOf(p + '/') === 0) setTimeout(o.avisar, 0); });
    };
    const gravar = (p, v) => {
      const ks = partes(p); let o = db;
      ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
      if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = structuredClone(v);
      notificar(p);
    };
    let seq = 0;
    const user = {uid: uidPagina, email: uidPagina + '@kuryos.com', displayName: db.usuarios[uidPagina].nome};
    window.firebase = {
      initializeApp(cfg) { iniciado = true; },
      app() { return {}; },
      auth() {
        if (!iniciado) throw new Error('sem app');
        return {currentUser: user, onAuthStateChanged(cb) { setTimeout(() => cb(user), 0); }, signOut() { return Promise.resolve(); }};
      },
      storage() { return {ref() { return {put: () => Promise.resolve(), getDownloadURL: () => Promise.resolve('')}; }}; },
      functions() {
        return {httpsCallable(nome) {
          return async (data) => {
            if (nome !== 'registroRetrabalho') throw new Error('callable inesperada ' + nome);
            const res = await window.__registroNode(data, JSON.parse(JSON.stringify(db)));
            if (res.erro) throw Object.assign(new Error(res.erro.message), {code: 'functions/' + res.erro.code});
            gravar('registros_retrabalho', res.registros);
            gravar('registros_retrabalho_pedidos', res.pedidos);
            return {data: res.r};
          };
        }};
      },
      database() {
        if (!iniciado) throw new Error('sem app');
        const ref = (path) => {
          const valor = () => { const v = ler(path); return v === undefined ? null : structuredClone(v); };
          const snap = () => { const v = valor(); return {val: () => v, exists: () => v !== null, key: partes(path).pop(),
            forEach(cb) { Object.entries(v || {}).forEach(([k, x]) => cb({key: k, val: () => x})); }}; };
          return {path, key: partes(path).pop(),
            once(ev, cb) { const sn = snap(); if (cb) cb(sn); return Promise.resolve(sn); },
            get() { return Promise.resolve(snap()); },
            on(ev, cb) { const avisar = () => cb(snap()); ouvintes.push({path, avisar}); setTimeout(avisar, 0); return cb; },
            off() {}, child(c) { return ref(path + '/' + c); },
            orderByChild() { return this; }, orderByKey() { return this; }, equalTo() { return this; }, limitToLast() { return this; }, startAt() { return this; },
            push(v) { seq++; const filho = ref(path + '/-N' + seq); if (v === undefined) return filho; gravar(filho.path, v); const pr = Promise.resolve(filho); pr.key = filho.key; return pr; },
            set(v) { gravar(path, v); return Promise.resolve(); },
            update(obj) { Object.entries(obj).forEach(([k, v]) => gravar(path + '/' + k, v)); return Promise.resolve(); },
            remove() { gravar(path, null); return Promise.resolve(); },
            transaction(fn) { const r = fn(valor()); if (r !== undefined) gravar(path, r); return Promise.resolve({committed: r !== undefined, snapshot: snap()}); }};
        };
        return {ref: (p) => ref(p || '')};
      }
    };
    window.firebase.database.ServerValue = {TIMESTAMP: {'.sv': 'timestamp'}};
  }, [estado, uid]);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'q.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://q.test/qualidade.html?tab=registros');
  await page.waitForFunction(() => window.currentUser && window.currentUser.nome, null, {timeout: 12000});
  await page.waitForSelector('#tab-registros.active', {timeout: 8000});
  return {page, errors};
}

const ESTADO = Object.assign(JSON.parse(JSON.stringify(FIX)), {
  usuarios: {
    rob: {nome: 'Roberta Q', email: 'rob@kuryos.com', role: 'qualidade', funcoes: {qualidade: true}},
    pcp: {nome: 'Pedro PCP', email: 'pcp@kuryos.com', role: 'pcp'},
  },
});

(async () => {
  const browser = await chromium.launch({headless: true, channel: process.env.PW_CHANNEL || 'chrome'});
  let n = 0;
  const ok = (m) => { n++; console.log('  ok  ' + m); };
  try {
    const {page, errors} = await abrir(browser, ESTADO, 'rob');
    const texto = (sel) => page.locator(sel).innerText();

    // 1. Aba abre vazia; Qualidade vê "+ Novo registro".
    await page.waitForFunction(() => /Nenhum registro/.test(document.getElementById('rrLista').innerText));
    assert.equal(await page.locator('#rrNovo').isVisible(), true);
    ok('aba Registros de retrabalho abre vazia e a Qualidade vê "+ Novo registro"');

    // 2. Abrir o caso 26302/01 pelo modal (com validação e Esc).
    await page.click('#rrNovo');
    await page.click('#rrNovoSalvar');
    assert.match(await texto('#rrNovoErro'), /Escolha a RNC do caso..*lote de origem.*unidades de origem/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#rrNovoBg.open').count(), 0, 'Esc fecha a janela');
    await page.click('#rrNovo');
    assert.equal((await texto('#rrNovoErro')).trim(), '', 'erro limpo ao reabrir');
    await page.selectOption('#rrNovoRnc', 'RNC-2026-011');
    await page.fill('#rrNovoOrigem', '26302/01');
    await page.locator('#rrNovoOrigem').dispatchEvent('change');
    await page.waitForFunction(() => /apontado 3\.470/.test(document.getElementById('rrNovoInfo').textContent));
    assert.equal(await page.inputValue('#rrNovoQtd'), '3470', 'origem vem preenchida com o apontado');
    await page.fill('#rrNovoDestinos .rr-dest-lote', '26302/01');
    await page.fill('#rrNovoDestinos .rr-dest-qtd', '1460');
    await page.click('#rrNovoAddDest');
    await page.locator('#rrNovoDestinos .rr-dest-lote').nth(1).fill('26264/14');
    await page.locator('#rrNovoDestinos .rr-dest-qtd').nth(1).fill('1965');
    await page.fill('#rrNovoRel', 'RNC-PA-26264-14');
    await page.fill('#rrNovoData', '2026-10-30');
    await page.fill('#rrNovoDesc', 'Granel do Sunrise Muse envasado como Rose Absolut.');
    await page.click('#rrNovoSalvar');
    await page.waitForFunction(() => /RR-26302-01-1/.test(document.getElementById('rrLista').innerText));
    await page.waitForSelector('#rrBal');
    assert.match(await texto('#rrDetalhe'), /Registro retrospectivo/);
    assert.match(await texto('#rrDetalhe'), /Não altera/i);
    assert.match(await texto('#rrBal'), /Diferença 45/);
    assert.match(await texto('#rrBal'), /declare o destino/);
    assert.match(await texto('#rrBal'), /26302\/01: informado 1\.460 un\., a Conferência de PA contou 3\.470/);
    assert.match(await texto('#rrPend'), /Balanço não fecha/);
    assert.match(await texto('#rrDetalhe'), /26266\/14 E 26302\/01/, 'lote como escrito na RNC aparece');
    ok('abre RR-26302-01-1 com RNC-2026-011; balanço mostra 45 un. sem destino e o aviso do palete conferido com 3.470');

    // 3. Preencher etapas e perda: balanço fecha ao vivo, antes de salvar.
    const etapa = async (i, ent, sai, per) => {
      const e = page.locator('.rr-etapa').nth(i);
      await e.locator('.rr-e-recurso').fill('Linha 1');
      await e.locator('.rr-e-inicio').fill('2026-11-10T08:00');
      await e.locator('.rr-e-resp').fill('Equipe de produção');
      await e.locator('.rr-e-proc').fill('Procedimento da etapa ' + (i + 1));
      await e.locator('.rr-e-ent').fill(String(ent));
      await e.locator('.rr-e-sai').fill(String(sai));
      await e.locator('.rr-e-per').fill(String(per));
    };
    await etapa(0, 3470, 3470, 0);
    await etapa(1, 2010, 1965, 45);
    await etapa(2, 1965, 1965, 0);
    const mat = page.locator('.rr-etapa').nth(1).locator('.rr-mat').first();
    await mat.locator('.rr-mat-cod').fill('EP-00182');
    await mat.locator('.rr-mat-nome').fill('Válvula');
    await mat.locator('.rr-mat-desc').fill('2010');
    await page.selectOption('#rrPerdas .rr-perda-motivo', 'PERDA_DESENVASE');
    await page.fill('#rrPerdas .rr-perda-qtd', '45');
    await page.click('#rrAddPerda');
    await page.locator('#rrPerdas .rr-perda-qtd').nth(1).fill('10');
    await page.waitForFunction(() => /Diferença -10/.test(document.getElementById('rrBal').innerText));
    await page.locator('#rrPerdas .rr-perda .rr-del').nth(1).click();
    assert.equal(await page.locator('#rrPerdas .rr-perda').count(), 1, '✕ remove a linha de perda');
    await page.waitForFunction(() => /fecha/.test(document.getElementById('rrBal').innerText) && /Diferença 0/.test(document.getElementById('rrBal').innerText));
    assert.equal(await page.locator('.rr-etapa-bal .badge-green').count(), 3, 'as 3 etapas fecham');
    assert.equal((await texto('#rrPend')).trim(), '');
    ok('com 45 un. de perda no desenvase e as 3 etapas preenchidas, o balanço fecha ao vivo antes de salvar');

    // 4. Salvar e enviar para decisão.
    await page.click('#rrEnviar');
    await page.waitForFunction(() => /Aguardando decisão/i.test(document.getElementById('rrDetalhe').innerText));
    const reg = await page.evaluate(() => window.__db.registros_retrabalho['RR-26302-01-1']);
    assert.equal(reg.status, 'AGUARDANDO_DECISAO');
    assert.equal(reg.perdas.p01.qtd, 45);
    assert.equal(reg.etapas.e2.qtdSaida, 1965);
    assert.equal(reg.etapas.e2.materiais.m01.descartado, 2010);
    assert.equal(reg.etapas.e1.preenchidoPor, 'Roberta Q');
    assert.equal(await page.locator('.rr-e-recurso').first().isDisabled(), true, 'aguardando decisão não edita');
    ok('Enviar salva e manda para decisão: perdas, etapas e materiais gravados pela callable; campos travados');

    // 4b. Devolver ao preenchimento em janela própria (motivo obrigatório) e reenviar.
    await page.click('#rrReabrir');
    await page.waitForSelector('#rrDecisaoBg.open');
    assert.equal(await page.locator('#rrDecMotivoBox').isVisible(), true);
    assert.equal(await page.locator('#rrDecAnaliseBox').isVisible(), false);
    await page.click('#rrDecConfirmar');
    assert.match(await texto('#rrDecErro'), /Diga por que/);
    await page.fill('#rrDecMotivo', 'conferir válvulas descartadas');
    await page.click('#rrDecConfirmar');
    await page.waitForFunction(() => !document.querySelector('#rrDecisaoBg.open') && document.getElementById('rrEnviar'));
    await page.click('#rrEnviar');
    await page.waitForSelector('#rrEncerrar');
    ok('Devolver abre janela própria, exige motivo, volta ao preenchimento; reenvio funciona');

    // 5. Encerrar em janela própria: análise obrigatória.
    await page.click('#rrEncerrar');
    await page.waitForSelector('#rrDecisaoBg.open');
    assert.ok((await texto('#rrDecResumo')).includes('Origem 3.470 = destinos 3.425 + perdas 45'));
    assert.match(await texto('#rrDecResumo'), /não libera nem bloqueia lote, palete ou estoque/);
    await page.click('#rrDecConfirmar');
    assert.match(await texto('#rrDecErro'), /análise da Qualidade/);
    await page.fill('#rrDecAnalise', 'Retrabalho conforme RNC-2026-011.');
    await page.fill('#rrDecConclusao', '1.460 Rose e 1.965 Sunrise Muse.');
    await page.click('#rrDecConfirmar');
    await page.waitForFunction(() => /Encerrado/i.test(document.getElementById('rrDetalhe').innerText) && /Decisão da Qualidade/i.test(document.getElementById('rrDetalhe').innerText));
    assert.equal(await page.locator('#rrEncerrar').count(), 0);
    const hist = await page.evaluate(() => Object.values(window.__db.registros_retrabalho['RR-26302-01-1'].historico).map((h) => h.acao));
    assert.deepEqual(hist.sort(), ['CRIAR', 'ENCERRAR', 'ENVIAR', 'ENVIAR', 'REABRIR', 'SALVAR', 'SALVAR'].sort());
    ok('Encerrar abre janela com o balanço, exige análise e grava; histórico completo (criar, salvar, enviar, devolver, encerrar)');

    // 5b. Lista: indicadores, filtro e busca.
    await page.selectOption('#rrFiltroStatus', '');
    assert.equal(await texto('#rrKpiEncerrado'), '1');
    assert.equal(await texto('#rrKpiPreench'), '0');
    await page.selectOption('#rrFiltroStatus', 'ABERTOS');
    await page.waitForFunction(() => /Nenhum registro com esse filtro/.test(document.getElementById('rrLista').innerText));
    await page.selectOption('#rrFiltroStatus', '');
    await page.fill('#rrBusca', 'sunrise');
    await page.waitForFunction(() => /RR-26302-01-1/.test(document.getElementById('rrLista').innerText));
    await page.fill('#rrBusca', 'nada-disso');
    await page.waitForFunction(() => /Nenhum registro com esse filtro/.test(document.getElementById('rrLista').innerText));
    await page.fill('#rrBusca', '');
    ok('indicadores, filtro de situação e busca da lista');

    // 5c. Relatório completo: FOR-QUA-0001 + anexo do registro.
    await page.click('#rrImprimir');
    let imp = await page.evaluate(() => window.__impressoes[window.__impressoes.length - 1]);
    assert.match(imp.titulo, /FOR-QUA-0001/);
    assert.match(imp.html, /RELATÓRIO DE NÃO CONFORMIDADE/);
    assert.match(imp.html, /REGISTRO DE RETRABALHO RR-26302-01-1/);
    ['BALANÇO DE QUANTIDADES', 'ETAPA 2 — RETRABALHO', 'DECISÃO DA QUALIDADE', 'HISTÓRICO DO REGISTRO', 'Retrabalho conforme RNC-2026-011.', 'EP-00182', 'Perda no desenvase']
      .forEach((t) => assert.ok(imp.html.includes(t), 'relatório traz ' + t));
    assert.doesNotMatch(imp.html, /PROVISÓRIO|NÃO FECHADO/);
    ok('"Relatório da RNC + anexo" emite o FOR-QUA-0001 com o registro completo (balanço, etapas, materiais, decisão, histórico)');

    // 5d. Vínculo na RNC (só leitura) e volta ao registro.
    await page.click('#rrVerRnc');
    await page.waitForSelector('#tab-rnc.active');
    await page.waitForFunction(() => /Registros de retrabalho vinculados/i.test(document.getElementById('rncBody').innerText));
    assert.equal(await page.locator('#rncBody .badge[title="Há registro de retrabalho vinculado"]').count(), 1, 'selo de retrabalho na linha da RNC');
    assert.match(await texto('#rncBody'), /RR-26302-01-1/);
    assert.match(await texto('#rncBody'), /balanço fecha/i);
    assert.match(await texto('#rncBody'), /Só consulta/);
    await page.click('#rncBody [data-rnc-doc][data-doc="rnc"]');
    imp = await page.evaluate(() => window.__impressoes[window.__impressoes.length - 1]);
    assert.match(imp.html, /REGISTRO DE RETRABALHO RR-26302-01-1/, 'o relatório emitido pela própria RNC também leva o anexo');
    await page.click('#rncBody [data-rr-abrir="RR-26302-01-1"]');
    await page.waitForSelector('#tab-registros.active');
    await page.waitForSelector('#rrBal');
    ok('RNC mostra selo e bloco do registro vinculado; relatório da RNC leva o anexo; "Abrir registro" volta ao detalhe');

    // 6. Nada operacional mudou na página.
    const db = await page.evaluate(() => ({ops: window.__db.ops, conferencias_pa: window.__db.conferencias_pa, estoque_lotes: window.__db.estoque_lotes,
      pedidos: window.__db.pedidos, nao_conformidades: window.__db.nao_conformidades}));
    assert.deepEqual(db, {ops: FIX.ops, conferencias_pa: FIX.conferencias_pa, estoque_lotes: FIX.estoque_lotes, pedidos: FIX.pedidos, nao_conformidades: FIX.nao_conformidades});
    assert.deepEqual(errors, []);
    ok('OPs, conferências, estoque, pedido e RNCs intactos; nenhum erro na página');
    const estadoFinal = await page.evaluate(() => window.__db);
    await page.close();

    // 7. PCP vê, não edita.
    const v = await abrir(browser, Object.assign({}, estadoFinal, {usuarios: ESTADO.usuarios}), 'pcp');
    await v.page.waitForFunction(() => /Nenhum registro com esse filtro/.test(document.getElementById('rrLista').innerText));
    await v.page.selectOption('#rrFiltroStatus', '');
    await v.page.waitForFunction(() => /RR-26302-01-1/.test(document.getElementById('rrLista').innerText));
    assert.equal(await v.page.locator('#rrNovo').isVisible(), false);
    await v.page.click('#rrLista .rr-linha');
    await v.page.waitForSelector('#rrBal');
    assert.equal(await v.page.locator('#rrSalvar, #rrEnviar, #rrEncerrar, #rrReabrir').count(), 0);
    assert.deepEqual(v.errors, []);
    ok('PCP vê a lista e o detalhe, sem "+ Novo registro" e sem botões de ação');
    await v.page.close();

    // 8. Celular: a aba não cria rolagem horizontal.
    const m = await abrir(browser, Object.assign({}, estadoFinal, {usuarios: ESTADO.usuarios}), 'rob', {width: 390, height: 844});
    await m.page.selectOption('#rrFiltroStatus', '');
    await m.page.waitForFunction(() => /RR-26302-01-1/.test(document.getElementById('rrLista').innerText));
    await m.page.click('#rrLista .rr-linha');
    await m.page.waitForSelector('#rrBal');
    const larg = await m.page.evaluate(() => {
      const p = document.getElementById('tab-registros').getBoundingClientRect();
      return {painel: Math.round(p.right), tela: window.innerWidth};
    });
    assert.ok(larg.painel <= larg.tela + 1, 'painel cabe na tela: ' + JSON.stringify(larg));
    ok('no celular (390 px) o painel cabe na largura da tela');
    await m.page.close();
  } finally {
    await browser.close();
  }
  console.log('run_registro_retrabalho_ui_test: ' + n + ' cenários OK');
})().catch((e) => { console.error(e); process.exit(1); });
