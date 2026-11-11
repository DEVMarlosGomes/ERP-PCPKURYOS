'use strict';
// PLAYWRIGHT_MODULE pode apontar para a instalação compartilhada do host.
/* UI da expedição em três telas (29/09):
   - Montar carga: seleção real, bloqueio de CQ, palete que muda sai da seleção;
   - Acompanhamento: saldo que muda com o carregamento aberto é avisado;
     falha de rede na confirmação da saída é recuperada após recarregar, com a
     MESMA chave de idempotência (o servidor não duplica a saída). */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {fixture} = require('./run_expedicao_test');
const {prepararAgenda} = require('./functions/agenda_expedicao');
const {prepararFaturamento} = require('./functions/faturamento_carga');
const agora = '2026-09-11T18:00:00Z';
(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1360, height: 1000}}), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const data = fixture();
    data.estoque_lotes.PA001.bloqueado = {...data.estoque_lotes.PA001.pa_op1_p1, identificadorPalete: 'PA-BLOQUEADO', status: 'QUARENTENA'};
    await page.addInitScript((data) => {
      window.fixtureExp = window.fixtureExp || data; window.callsExp = JSON.parse(sessionStorage.getItem('__calls') || '[]'); window.listenersExp = {};
      window.firebase = {initializeApp() {}, database() { return {ref(path) { return {path}; }}; }, functions() { return {httpsCallable(name) { return async (payload) => {
        window.callsExp.push({name, payload}); sessionStorage.setItem('__calls', JSON.stringify(window.callsExp));
        if (window.callsExp.length === 1) throw Object.assign(new Error('Conexão interrompida'), {code: 'functions/unavailable'});
        return {data: {numero: 'EXP-TESTE'}};
      }; }}; }};
      window.kuryosDatabaseURL = (x) => x; window.kuryosConnectEmulatorsIfLocal = () => {};
      window.escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
      window.dbOnValue = (ref, cb) => { (window.listenersExp[ref.path] ||= []).push(cb); cb({val: () => structuredClone(window.fixtureExp[ref.path] || {})}); };
      window.emitir = (no) => (window.listenersExp[no] || []).forEach((cb) => cb({val: () => structuredClone(window.fixtureExp[no])}));
    }, data);
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'expedicao.test') return route.fulfill({body: '', contentType: 'text/javascript'});
      const name = url.pathname.slice(1);
      if (name === 'auth_check.js' || name === 'shared/utils.js') return route.fulfill({body: '', contentType: 'text/javascript'});
      const file = 'public/' + name;
      if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
      return route.fulfill({body: fs.readFileSync(file), contentType: name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'text/javascript'});
    });

    // ── Montar carga ────────────────────────────────────────────────────
    await page.goto('https://expedicao.test/expedicao.html');
    assert.match(await page.locator('#contagem').innerText(), /2 paletes em estoque.*1 liberados/);
    assert.equal(await page.locator('[data-palete]').count(), 2);
    assert.equal(await page.locator('[data-palete]:disabled').count(), 1, 'palete em quarentena não é selecionável');
    await page.locator('[data-palete="PA001/pa_op1_p1"]').check();
    assert.match(await page.locator('#selecaoResumo').innerText(), /295 un/);
    assert.match(await page.locator('#resumo').innerText(), /PED-001/);
    assert.equal(await page.locator('#agendar').isDisabled(), false);
    await page.evaluate(() => { fixtureExp.estoque_lotes.PA001.pa_op1_p1.saldoLote = 290; emitir('estoque_lotes'); });
    assert.equal(await page.locator('[data-palete]:checked').count(), 0);
    assert.match(await page.locator('#resultado').innerText(), /retirado/);
    await page.evaluate(() => { fixtureExp.estoque_lotes.PA001.pa_op1_p1.saldoLote = 295; emitir('estoque_lotes'); });

    // Link antigo "expedicao.html?agenda=K" leva ao Acompanhamento.
    const agenda = prepararAgenda(data, {agendaKey: 'agendaTeste01', revisao: 0, tipo: 'ENTREGA', dataAgendada: '2026-09-11',
      paletes: [{itemKey: 'PA001', loteKey: 'pa_op1_p1', quantidade: 295, enderecoKey: data.estoque_lotes.PA001.pa_op1_p1.enderecoKey,
        skuPedidoKey: Object.values(data.ops)[0].skuPedidoKey || data.estoque_lotes.PA001.pa_op1_p1.skuPedidoKey}]}, 'Log', 'u1', agora);
    data.agendamentos_expedicao = {agendaTeste01: agenda};
    const fat = prepararFaturamento(data, {agendaKey: 'agendaTeste01', revisao: agenda.revisao, acao: 'REGISTRAR_NF', nf: {numero: '900', valor: 10}}, 'Fin', 'u2', agora);
    data.agendamentos_expedicao.agendaTeste01 = fat.agenda;
    await page.evaluate((ags) => { fixtureExp.agendamentos_expedicao = ags; sessionStorage.setItem('__fixture', '1'); }, data.agendamentos_expedicao);
    await page.addInitScript((ags) => { window.fixtureExp.agendamentos_expedicao = ags; }, data.agendamentos_expedicao);
    await page.goto('https://expedicao.test/expedicao.html?agenda=agendaTeste01');
    await page.waitForURL(/cargas\.html\?carga=agendaTeste01/);

    // ── Acompanhamento: carregar e confirmar ────────────────────────────
    const card = page.locator('[data-carga="agendaTeste01"]');
    await card.waitFor();
    assert.match(await card.innerText(), /Pronta para carregar[\s\S]*NF\s*900/);
    await card.locator('[data-acao="CARREGAR"]').click();
    await page.waitForSelector('[data-painel="CARREGAR"]');
    // Saldo muda com o painel aberto: o palete sai e a confirmação avisa.
    await page.evaluate(() => { fixtureExp.estoque_lotes.PA001.pa_op1_p1.saldoLote = 290; emitir('estoque_lotes'); });
    await page.waitForFunction(() => /saldo mudou/.test(document.querySelector('[data-painel]').innerText));
    await page.evaluate(() => { fixtureExp.estoque_lotes.PA001.pa_op1_p1.saldoLote = 295; emitir('estoque_lotes'); });
    await page.waitForFunction(() => !/saldo mudou/.test(document.querySelector('[data-painel]').innerText));
    page.on('dialog', (d) => d.accept());
    await page.locator('#confirmarSaida').click();
    await page.waitForFunction(() => document.getElementById('confirmarSaida').textContent.includes('repetir'));
    assert.match(await page.locator('[data-painel]').innerText(), /Conexão interrompida[\s\S]*Verificar \/ repetir/);
    // Recarregar não perde a operação: o painel reabre com a mesma tentativa.
    await page.reload();
    await page.waitForFunction(() => document.getElementById('confirmarSaida') && document.getElementById('confirmarSaida').textContent.includes('repetir'));
    assert.match(await page.locator('#resultado').innerText(), /confirmação de saída pendente/);
    await page.locator('#confirmarSaida').click();
    await page.waitForFunction(() => document.getElementById('resultado').textContent.includes('Saída confirmada'));
    const calls = await page.evaluate(() => callsExp);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].payload.idempotencyKey, calls[1].payload.idempotencyKey, 'mesma operação: o servidor não duplica');
    assert.equal(calls[1].name, 'confirmarExpedicaoPA');
    assert.equal(calls[1].payload.agendaKey, 'agendaTeste01');
    assert.equal(calls[1].payload.paletes[0].quantidade, 295);
    assert.equal(calls[1].payload.nf, '', 'NF vem da carga, não é redigitada');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('cargasPA-tentativa')), null);

    // ── Tentativa de saída órfã não trava as outras cargas (11/11) ───────
    // Carga A pronta + tentativa guardada; carga B também pronta.
    const cargaB = JSON.parse(JSON.stringify(data.agendamentos_expedicao.agendaTeste01));
    cargaB.cliente = 'Cliente B'; cargaB.paletes = [];
    const cargas2 = {agendaTeste01: data.agendamentos_expedicao.agendaTeste01, agendaB: cargaB};
    const tentativaA = {idempotencyKey: 'tentativa-orfa-0001', agendaKey: 'agendaTeste01', agendaRevisao: cargas2.agendaTeste01.revisao,
      data: '2026-09-11', tipo: 'ENTREGA', paletes: [], criadaEm: new Date().toISOString()};
    await page.addInitScript((ags) => { window.fixtureExp.agendamentos_expedicao = ags; }, cargas2);
    await page.evaluate((t) => sessionStorage.setItem('cargasPA-tentativa', JSON.stringify(t)), tentativaA);
    await page.goto('https://expedicao.test/cargas.html');
    await page.waitForSelector('[data-carga="agendaB"] [data-acao="CARREGAR"]');
    // A ainda pronta: mexer na B continua bloqueado, e a mensagem diz QUAL carga e como resolver.
    await page.locator('[data-carga="agendaB"] [data-acao="CARREGAR"]').click();
    const bloqueio = await page.locator('#resultado').innerText();
    assert.match(bloqueio, /sem resposta na carga[\s\S]*PED-001[\s\S]*O que fazer/, 'o bloqueio aponta a carga pendente');
    assert.equal(await page.locator('#abrirPendente').count(), 1);
    assert.equal(await page.locator('#descartarPendente').count(), 1);
    assert.equal(await page.locator('[data-carga="agendaB"] [data-painel]').count(), 0, 'B segue bloqueada enquanto A está pronta');
    // A é cancelada/expedida em outra aba: a tentativa some sozinha e a B abre.
    await page.evaluate(() => { fixtureExp.agendamentos_expedicao.agendaTeste01.status = 'EXPEDIDO'; emitir('agendamentos_expedicao'); });
    await page.waitForFunction(() => sessionStorage.getItem('cargasPA-tentativa') === null);
    assert.match(await page.locator('#resultado').innerText(), /foi descartada[\s\S]*não pode mais ser carregada/);
    assert.equal(await page.locator('[data-painel]').count(), 0, 'o painel da carga encerrada fecha');
    await page.locator('[data-carga="agendaB"] [data-acao="CARREGAR"]').click();
    await page.waitForSelector('[data-carga="agendaB"] [data-painel="CARREGAR"]');
    // Carga da tentativa não existe mais: limpa já na abertura da tela.
    await page.evaluate((t) => sessionStorage.setItem('cargasPA-tentativa', JSON.stringify(Object.assign(t, {agendaKey: 'apagada'}))), tentativaA);
    await page.reload();
    await page.waitForSelector('[data-carga="agendaB"] [data-acao="CARREGAR"]');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('cargasPA-tentativa')), null, 'tentativa de carga inexistente é apagada');
    // Descartar pelo botão do aviso libera as cargas sem chamar o servidor.
    await page.evaluate(() => { fixtureExp.agendamentos_expedicao.agendaTeste01.status = 'AGENDADO'; });
    await page.addInitScript(() => { window.fixtureExp.agendamentos_expedicao.agendaTeste01.status = 'AGENDADO'; });
    await page.evaluate((t) => sessionStorage.setItem('cargasPA-tentativa', JSON.stringify(Object.assign(t, {agendaKey: 'agendaTeste01'}))), tentativaA);
    await page.reload();
    await page.waitForSelector('[data-carga="agendaTeste01"] [data-painel="CARREGAR"]');
    await page.locator('#descartarTentativa').click();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('cargasPA-tentativa')), null);
    assert.match(await page.locator('#resultado').innerText(), /Tentativa descartada/);
    assert.equal((await page.evaluate(() => callsExp)).length, 2, 'descartar não chama o servidor');

    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Tela deve caber no celular');
    assert.deepEqual(errors, []);
    console.log('OK UI Expedição: seleção real, bloqueio CQ, palete alterado sai da seleção, link antigo leva ao Acompanhamento, saldo alterado avisado, falha de rede recuperada após reload com a mesma chave, celular.');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
