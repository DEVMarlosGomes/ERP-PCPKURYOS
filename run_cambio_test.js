'use strict';
/* Dólar ao vivo + spread (PLANO_PD_CRM_AJUSTES.md, Fase 5).
   1. Regras puras de public/shared/cambio.js e a cópia idêntica do servidor.
   2. A função agendada real (functions/index.js → atualizarCambio) com fetch e
      banco simulados: fonte principal, reserva, e falha nas duas. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./public/shared/cambio.js');

assert.equal(fs.readFileSync('public/shared/cambio.js', 'utf8'), fs.readFileSync('functions/cambio.js', 'utf8'), 'functions/cambio.js precisa ser cópia idêntica');

// leitura das fontes (formatos reais das APIs)
const AWESOME = { USDBRL: { code: 'USD', codein: 'BRL', bid: '5.4312', ask: '5.4342', create_date: '2026-10-15 14:59:58' } };
assert.deepEqual(C.deAwesome(AWESOME), { compra: 5.4312, venda: 5.4342, fonte: 'AwesomeAPI (dólar comercial)', cotadoEm: '2026-10-15 14:59:58' });
assert.equal(C.deAwesome({ status: 429 }), null);
assert.deepEqual(C.deErApi({ result: 'success', time_last_update_utc: 'Wed, 15 Oct 2026 00:02:31 +0000', rates: { BRL: 5.44 } }),
  { compra: 5.44, venda: 5.44, fonte: 'ExchangeRate-API (reserva)', cotadoEm: 'Wed, 15 Oct 2026 00:02:31 +0000' });
assert.equal(C.deErApi({ result: 'error' }), null);
// Banco Central (PTAX intradiário), formato real da API Olinda
const BCB = { value: [{ cotacaoCompra: 5.0515, cotacaoVenda: 5.0521, dataHoraCotacao: '2026-10-15 13:05:33.305854', tipoBoletim: 'Fechamento' }] };
assert.deepEqual(C.deBcbPtax(BCB), { compra: 5.0515, venda: 5.0521, fonte: 'Banco Central (PTAX fechamento)', cotadoEm: '2026-10-15 13:05:33' });
assert.equal(C.deBcbPtax({ value: [] }), null);
const urlBcb = C.urlBcbPtax('2026-10-15T18:00:00Z');
assert.match(urlBcb, /olinda.bcb.gov.br/);
assert.match(urlBcb, /dataInicial='10-08-2026'&@dataFinalCotacao='10-15-2026'/, 'janela de 7 dias (fim de semana/feriado)');

// taxa efetiva com spread do ADM
const cambio = { usd_brl: { compra: 5.4312, venda: 5.4342, fonte: 'AwesomeAPI', atualizadoEm: '2026-10-15T15:00:00Z' }, spread_pct: 3 };
assert.equal(C.taxaEfetiva(cambio), 5.5972);
assert.equal(C.taxaEfetiva({ usd_brl: { venda: 5 } }), 5);
assert.equal(C.taxaEfetiva({}), null);
assert.deepEqual(C.validarSpread('2,5'), { spread: 2.5 });
assert.match(C.validarSpread(-1).erro, /entre 0 e 20/);
assert.match(C.validarSpread('abc').erro, /entre 0 e 20/);

// cotação velha: mais de 1 h sem atualizar
assert.equal(C.situacao(cambio, '2026-10-15T15:20:00Z').velho, false);
assert.equal(C.situacao(cambio, '2026-10-15T16:30:00Z').velho, true);
assert.equal(C.situacao({}, '2026-10-15T15:00:00Z').disponivel, false);

// fórmula: fixada > ao vivo > gravada > padrão
assert.deepEqual(C.cotacaoDaFormula({ cotacao_usd: 6, cotacao_usd_fixa: true }, cambio), { taxa: 6, origem: 'fixa' });
assert.deepEqual(C.cotacaoDaFormula({ cotacao_usd: 6 }, cambio), { taxa: 5.5972, origem: 'ao_vivo' });
assert.deepEqual(C.cotacaoDaFormula({ cotacao_usd: 5.9 }, {}), { taxa: 5.9, origem: 'gravada' });
assert.deepEqual(C.cotacaoDaFormula({}, null), { taxa: 6, origem: 'padrao' });

// cotação enviada congela o câmbio
const congelado = C.congelar(cambio, '2026-10-15T15:05:00Z');
assert.deepEqual(congelado, { taxa: 5.5972, venda: 5.4342, spread_pct: 3, fonte: 'AwesomeAPI', cotadoEm: '', congeladoEm: '2026-10-15T15:05:00Z' });
const depois = { ...cambio, usd_brl: { ...cambio.usd_brl, venda: 6.1 } };
assert.deepEqual(C.taxaDaCotacao({ cambio_congelado: congelado }, depois), { taxa: 5.5972, origem: 'congelada', em: '2026-10-15T15:05:00Z' });
assert.equal(C.taxaDaCotacao({}, depois).origem, 'ao_vivo');
assert.equal(C.congelar({}, 'x'), null);

// função agendada real, com firebase-admin e fetch simulados
(async () => {
  const gravado = [];
  const fakeDb = { ref: (p) => ({ update: async (v) => { gravado.push([p, v]); }, once: async () => ({ val: () => null }) }) };
  // firebase-admin falso só para o carregamento de functions/index.js (sem conexão real).
  const Module = require('node:module');
  const carregar = Module._load;
  Module._load = function(pedido, pai, principal) {
    if (pedido === 'firebase-admin') return { initializeApp: () => ({}), database: Object.assign(() => fakeDb, { ServerValue: { TIMESTAMP: {} } }) };
    return carregar.call(this, pedido, pai, principal);
  };
  let fns;
  try { fns = require('./functions/index.js'); } finally { Module._load = carregar; }
  const roda = () => fns.atualizarCambio.run({ scheduleTime: new Date().toISOString() });
  const fetchOriginal = global.fetch;
  try {
    global.fetch = async (url) => ({ ok: true, json: async () => (url.includes('awesomeapi') ? AWESOME : {}) });
    await roda();
    assert.equal(gravado.at(-1)[0], 'config/cambio');
    assert.equal(gravado.at(-1)[1].usd_brl.venda, 5.4342);
    assert.equal(gravado.at(-1)[1].erro, null);
    assert.equal(gravado.at(-1)[1].aviso, null);

    // AwesomeAPI 429 (o que o Render recebe): cai no Banco Central, ainda intradiário
    global.fetch = async (url) => (url.includes('awesomeapi') ? { ok: false, status: 429, json: async () => ({}) }
      : url.includes('bcb.gov.br') ? { ok: true, json: async () => BCB } : { ok: true, json: async () => ({ result: 'success', rates: { BRL: 5.44 } }) });
    await roda();
    assert.equal(gravado.at(-1)[1].usd_brl.fonte, 'Banco Central (PTAX fechamento)');
    assert.match(gravado.at(-1)[1].aviso, /awesomeapi.*HTTP 429/, 'motivo da falha da principal fica registrado');

    // AwesomeAPI e BCB fora: reserva diária
    global.fetch = async (url) => (url.includes('er-api') ? { ok: true, json: async () => ({ result: 'success', rates: { BRL: 5.44 } }) } : { ok: false, status: 503, json: async () => ({}) });
    await roda();
    assert.equal(gravado.at(-1)[1].usd_brl.fonte, 'ExchangeRate-API (reserva)');

    global.fetch = async () => { throw new Error('sem rede'); };
    await roda();
    assert.equal(gravado.at(-1)[1].usd_brl, undefined, 'falha nas duas mantém a última cotação');
    assert.match(gravado.at(-1)[1].erro, /awesomeapi.*sem rede.*bcb.gov.br.*sem rede.*er-api.*sem rede/);
  } finally { global.fetch = fetchOriginal; }
  console.log('run_cambio_test: OK');
})().catch((e) => { console.error(e); process.exit(1); });
