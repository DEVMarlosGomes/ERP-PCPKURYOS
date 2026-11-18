'use strict';
/* Formulário FOR-QUA-0001 completo na RNC (qualidade.html, 18/11/2026):
   botão "📝 Formulário x/13", todas as seções preenchíveis, sugestão do
   sistema na contenção, validação (Sim em expedição pede observação),
   gravação na RNC, encerramento já preenchido e relatório impresso com os
   campos. Tela real; Firebase simulado (harness de run_rnc_itens_ui_test.js). */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function dados() {
  return {
    usuarios: {u1: {nome: 'Roberta Ramos', email: 'q@kuryos.com', role: 'qualidade'}},
    fornecedores: {F1: {nomeFantasia: 'SOROPACK EMBALAGENS', ativo: true}},
    produtos: {},
    materiais: {'EP-00077': {mpCodigo: 'EP-00077', mpNome: 'FRASCO 24/410 S/RECRAV SP120-1A 120ML', tipo: 'EP', ativo: true}},
    estoque_lotes: {'EP-00077': {L1: {itemTipo: 'material', itemCodigo: 'EP-00077', status: 'QUARENTENA', saldoLote: 5000, unidade: 'un',
      loteOrigem: 'NF-8812', criadoEm: '2026-11-17T10:00:00.000Z'}}},
    ops: {},
    nao_conformidades: {'RNC-2026-013': {numero: 'RNC-2026-013', status: 'EM_ANALISE', classificacao: 'MENOR', origem: 'RECEBIMENTO',
      descricao: 'frasco não possui headspace', abertaEm: '2026-11-17T12:00:00.000Z', abertaPor: 'Roberta Ramos', emAnalisePor: 'Roberta Ramos',
      itemTipo: 'material', itemCodigo: 'EP-00077', itemNome: 'FRASCO 24/410 S/RECRAV SP120-1A 120ML', loteKey: 'L1', loteOrigem: 'NF-8812',
      fornecedorKey: 'F1', fornecedorNome: 'SOROPACK EMBALAGENS'}}
  };
}
async function abrir(browser, caminho) {
  const page = await browser.newPage({viewport: {width: 1600, height: 1100}});
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript((inicial) => {
    const db = JSON.parse(JSON.stringify(inicial));
    window.__db = db; window.__iniciado = false; window.print = () => { window.__impresso = true; };
    const exige = (q) => { if (!window.__iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (" + q + ')'); };
    const get = (p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const set = (p, v) => {
      const ks = p.split('/').filter(Boolean); let o = db;
      ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
      if (v == null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
    };
    const ouvintes = [];
    const avisa = () => ouvintes.forEach((o) => setTimeout(() => o.cb({val: () => { const v = get(o.p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, exists: () => get(o.p) !== undefined}), 0));
    window.firebase = {
      initializeApp() { window.__iniciado = true; },
      auth() { exige('auth'); return {currentUser: {uid: 'u1', email: 'q@kuryos.com', displayName: 'Roberta Ramos'},
        onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'q@kuryos.com', displayName: 'Roberta Ramos'}), 0); }, signOut() { return Promise.resolve(); }}; },
      storage() { return {ref() { return {put: () => Promise.resolve(), getDownloadURL: () => Promise.resolve('')}; }}; },
      database() {
        exige('database');
        return {ref(p) {
          p = p || '';
          const snap = () => ({val: () => { const v = p ? get(p) : db; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, exists: () => get(p) !== undefined, forEach() {}});
          return {path: p,
            once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); },
            on(ev, cb) { ouvintes.push({p, cb}); setTimeout(() => cb(snap()), 0); return cb; }, off() {}, child() { return this; },
            orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
            set(v) { set(p, v); avisa(); return Promise.resolve(); },
            update(u) { Object.keys(u).forEach((k) => set((p ? p + '/' : '') + k, u[k])); avisa(); return Promise.resolve(); },
            remove() { set(p, null); avisa(); return Promise.resolve(); },
            push() { return Object.assign(Promise.resolve(), {key: 'k1'}); },
            transaction(fn) { const r = fn(get(p) === undefined ? null : JSON.parse(JSON.stringify(get(p)))); if (r !== undefined) { set(p, r); avisa(); }
              return Promise.resolve({committed: r !== undefined, snapshot: snap()}); }};
        }};
      }
    };
  }, dados());
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'q.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  });
  await page.goto('https://q.test/' + caminho);
  return {page, erros};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0; const ok = (m) => { n++; console.log('  ok  ' + m); };
  try {
    const {page, erros} = await abrir(browser, 'qualidade.html?tab=rnc');
    const btn = page.locator('.rnc-formulario[data-rnc="RNC-2026-013"]');
    await btn.waitFor({timeout: 10000});
    assert.match(await btn.innerText(), /Formulário 0\/13/);
    await btn.click();
    assert.match(await page.locator('#modalRncTitle').innerText(), /FOR-QUA-0001 — RNC-2026-013/);
    // Lote em quarentena: o sistema sugere "Sim" para lote e materiais bloqueados.
    assert.equal(await page.inputValue('#rncFQ_loteBloqueado'), 'SIM');
    assert.equal(await page.inputValue('#rncFQ_materiaisBloqueados'), 'SIM');
    assert.match(await page.locator('[data-pergunta="loteBloqueado"]').innerText(), /Sugerido pelo sistema/);
    assert.equal(await page.inputValue('#rncFQ_equipesAvisadas'), '', 'sem resposta, nunca "Não"');
    assert.equal(await page.locator('[data-pergunta="outrosBloqueados"]').isVisible(), false, 'só aparece com outros impactados = Sim');
    assert.equal(await page.inputValue('#rncFRespContencao'), 'Roberta Ramos');
    ok('botão 0/13; sugestão do sistema na contenção; pergunta dependente escondida');

    await page.fill('#rncFProcedimento', 'POP-QUA-005');
    await page.fill('#rncFEvidencia', '120 g de água enchem até o gargalo');
    await page.fill('#rncFAcaoImediata', 'Lote segregado');
    await page.fill('#rncFPrazoContencao', '2026-11-18');
    await page.selectOption('#rncFQ_outrosImpactados', 'SIM');
    assert.equal(await page.locator('[data-pergunta="outrosBloqueados"]').isVisible(), true);
    await page.selectOption('#rncFQ_outrosBloqueados', 'SIM');
    await page.selectOption('#rncFQ_houveExpedicao', 'NAO');
    await page.selectOption('#rncFQ_equipesAvisadas', 'SIM');
    await page.selectOption('#rncFMetodo', 'OUTRO');
    assert.equal(await page.locator('#rncFMetodoOutroBox').isVisible(), true);
    await page.fill('#rncFMetodoOutro', 'Teste de enchimento');
    await page.fill('#rncFCausa', 'Molde sem headspace');
    await page.fill('#rncFPlano', 'Homologar frasco 130 ml');
    await page.fill('#rncFRespAcao', 'Compras');
    await page.fill('#rncFPrazoAcao', '2026-12-01');
    await page.selectOption('#rncFProb', 'Baixa'); await page.selectOption('#rncFImpacto', 'Médio'); await page.selectOption('#rncFResidual', 'Aceitável');
    await page.fill('#rncFAprovado', 'Gustavo');
    // Sem observação: "Sim" em outros impactados é recusado e nada grava.
    await page.click('#rncBtnSalvar');
    await page.waitForFunction(() => /liste quais/.test(document.body.innerText));
    assert.equal(await page.evaluate(() => !!window.__db.nao_conformidades['RNC-2026-013'].formulario), false);
    ok('"Sim" em outros lotes sem observação é recusado sem gravar');

    await page.fill('#rncFObsContencao', 'Lote NF-8813 do mesmo pedido');
    await page.click('#rncBtnSalvar');
    await page.waitForFunction(() => !!window.__db.nao_conformidades['RNC-2026-013'].formulario);
    const r = await page.evaluate(() => window.__db.nao_conformidades['RNC-2026-013']);
    assert.equal(r.status, 'EM_ANALISE');
    assert.deepEqual(r.formulario.contencao, {loteBloqueado: true, materiaisBloqueados: true, outrosImpactados: true, outrosBloqueados: true, houveExpedicao: false, equipesAvisadas: true});
    assert.equal(r.formulario.metodo, 'Teste de enchimento');
    assert.deepEqual(r.formulario.risco, {probabilidade: 'Baixa', impacto: 'Médio', residual: 'Aceitável'});
    assert.equal(r.causaRaiz, 'Molde sem headspace'); assert.equal(r.acaoCorretiva, 'Homologar frasco 130 ml'); assert.equal(r.acaoImediata, 'Lote segregado');
    assert.equal(r.formulario.atualizadoPor, 'Roberta Ramos');
    ok('salva todas as seções na RNC, sem mudar o status');

    await page.waitForFunction(() => /Formulário 1[0-2]\/13/.test(document.querySelector('.rnc-formulario').innerText));
    // Encerrar já abre com causa e plano preenchidos.
    await page.click('.rnc-encerrar[data-rnc="RNC-2026-013"]');
    assert.equal(await page.inputValue('#rncCausaRaiz'), 'Molde sem headspace');
    assert.equal(await page.inputValue('#rncAcaoCorretiva'), 'Homologar frasco 130 ml');
    assert.equal(await page.inputValue('#rncPrazo'), '2026-12-01');
    await page.click('#modalRncCancel');
    ok('selo do botão sobe; Encerrar já vem com causa, plano e prazo');

    // Relatório FOR-QUA-0001 com os campos.
    await page.click('.rnc-expandir[data-rnc="RNC-2026-013"]');
    await page.click('[data-rnc-doc="RNC-2026-013"][data-doc="rnc"]');
    const doc = await page.locator('#laudoPrintArea').innerText();
    for (const t of ['POP-QUA-005', '120 g de água', 'Lote NF-8813', 'Teste de enchimento', 'Molde sem headspace', 'Homologar frasco 130 ml', 'Gustavo', '18/11/2026']) assert.ok(doc.includes(t), 'relatório traz ' + t);
    assert.match(await page.locator('.rnc-campo', {hasText: 'Método de análise'}).first().innerText(), /Teste de enchimento/);
    ok('relatório impresso e detalhe da RNC trazem o que foi preenchido');

    // Celular: o formulário cabe.
    await page.setViewportSize({width: 390, height: 844});
    await page.click('.rnc-formulario[data-rnc="RNC-2026-013"]');
    assert.equal(await page.inputValue('#rncFQ_houveExpedicao'), 'NAO', 'reabre com o que foi gravado');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#rncCamposFormulario *')].every((x) => x.getBoundingClientRect().right <= innerWidth + 1)), true, 'nada passa da largura');
    assert.deepEqual(erros, [], 'sem erro de página: ' + erros.join(' | '));
    ok('reabre com os valores; cabe no celular; sem erro de página');
    console.log('run_rnc_formulario_ui_test: ' + n + ' OK');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
