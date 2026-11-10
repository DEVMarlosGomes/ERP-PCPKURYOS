'use strict';
/* Financeiro F5.0 (10/11/2026): baixa, estorno, títulos e lote rodam um de cada vez.
   Reproduz o padrão do servidor (lê a base do cache, prepara, grava com atraso de rede)
   com duas baixas simultâneas de R$ 70 num título de R$ 100: sem fila as duas passam
   (pagou R$ 140), com a fila a segunda é recusada pelo saldo. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const FS = require('./functions/financeiro_servidor');
const {criarFila} = require('./functions/transacao_raiz');

const AG = '2026-10-28T12:00:00.000Z';
const adm = {uid: 'u-adm', nome: 'ADM', role: 'admin'};
let n = 0;

function banco() {
  return {
    fin: {
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 0, dataSaldoInicial: '2026-10-01'}},
      titulos: {T1: {tipo: 'PAGAR', valorCentavos: 10000, vencimentoFixo: '2026-11-01', emissao: '2026-10-01', natureza: 'EMBALAGEM', parceiro: {nome: 'F'}, origem: {tipo: 'MANUAL'}}},
      baixas: {}, conciliacoes: {}
    },
    ctl: {fechamentos: {}}
  };
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// Igual ao finBaixar: lê a base (cache), prepara, grava (com latência), aplica no cache.
async function baixar(db, chave, valor) {
  const base = JSON.parse(JSON.stringify(db));
  await espera(5); // leitura/validação
  const r = FS.prepararBaixa(base, {chave, titulo: 'T1', valorCentavos: valor, data: '2026-10-28', conta: 'itau'}, adm, AG);
  await espera(20); // update no servidor
  Object.keys(r.updates).forEach((k) => { const [, , id] = k.split('/'); db.fin.baixas[id] = r.updates[k]; });
  return r;
}
const totalPago = (db) => Object.values(db.fin.baixas).reduce((s, b) => s + (b.valorCentavos || 0), 0);

(async () => {
  // 1. Sem fila: o defeito.
  const semFila = banco();
  const r1 = await Promise.allSettled([baixar(semFila, 'abc201', 7000), baixar(semFila, 'abc202', 7000)]);
  assert.deepEqual(r1.map((x) => x.status), ['fulfilled', 'fulfilled']);
  assert.equal(totalPago(semFila), 14000, 'sem fila: R$ 140 pagos num título de R$ 100'); n++;

  // 2. Com a fila do servidor: a segunda lê o saldo já com a primeira.
  const comFila = banco(), emFila = criarFila();
  const r2 = await Promise.allSettled([emFila(() => baixar(comFila, 'abc203', 7000)), emFila(() => baixar(comFila, 'abc204', 7000))]);
  assert.equal(r2[0].status, 'fulfilled');
  assert.equal(r2[1].status, 'rejected');
  assert.match(r2[1].reason.message, /passa do saldo do título/); n++;
  assert.equal(totalPago(comFila), 7000, 'com fila: só R$ 70'); n++;

  // 3. Erro de uma operação não trava a fila; filas diferentes não se esperam.
  const ordem = [];
  const f = criarFila(), outra = criarFila();
  const p1 = f(async () => { await espera(30); ordem.push('f1'); throw new Error('falhou'); }).catch(() => ordem.push('f1-erro'));
  const p2 = f(async () => { ordem.push('f2'); });
  const p3 = outra(async () => { ordem.push('outra'); });
  await Promise.all([p1, p2, p3]);
  assert.deepEqual(ordem, ['outra', 'f1', 'f1-erro', 'f2']); n++;

  // 4. As quatro callables do financeiro passam pela fila.
  const idx = fs.readFileSync('functions/index.js', 'utf8');
  for (const nome of ['finBaixar', 'finEstornarBaixa', 'finLancarTitulos', 'finDecidirLote']) {
    const ini = idx.indexOf('exports.' + nome + ' ');
    const corpo = idx.slice(ini, idx.indexOf('\n}));', ini));
    assert.ok(ini > 0 && /await filaFinanceiro\(async \(\) => \{[\s\S]*baseGestao\(false\)[\s\S]*db\.ref\(\)\.update/.test(corpo), nome + ' lê e grava dentro da fila');
    n++;
  }
  console.log('financeiro F5.0 (fila): ' + n + ' asserções OK');
})().catch((e) => { console.error(e); process.exit(1); });
