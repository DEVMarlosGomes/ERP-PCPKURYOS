'use strict';
/* F9 na Controladoria (12/11/2026): o título manual classificado lança na conta da natureza
   do elemento, rateado por centro; reclassificar estorna o lançamento antigo e lança o novo;
   o cancelamento por engano desfaz exatamente o que foi lançado. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Ctl = require('./public/shared/controladoria');
const F = require('./public/shared/financeiro');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const AGORA = '2026-11-12T12:00:00.000Z';
const clone = (x) => JSON.parse(JSON.stringify(x));
function aplicar(obj, updates) {
  const b = clone(obj);
  Object.entries(updates).forEach(([k, v]) => { const p = k.split('/'); let x = b; p.slice(0, -1).forEach((c) => { if (x[c] == null || typeof x[c] !== 'object') x[c] = {}; x = x[c]; }); if (v === null) delete x[p[p.length - 1]]; else x[p[p.length - 1]] = clone(v); });
  return b;
}
const P = (d) => d.partidas.map((x) => [x.conta, x.cc || null, x.debitoCentavos, x.creditoCentavos]);
const base = {fin: {titulos: {
  M1: {tipo: 'PAGAR', valorCentavos: 10000, vencimentoFixo: '2026-11-30', emissao: '2026-11-02', competencia: '2026-11', natureza: 'OUTROS', centroCusto: 'ADMINISTRATIVO', documento: 'NF 1', parceiro: {nome: 'X'}, origem: {tipo: 'MANUAL'}},
  M2: {tipo: 'PAGAR', valorCentavos: 5000, vencimentoFixo: '2026-11-30', emissao: '2026-11-02', competencia: '2026-11', natureza: 'OUTROS', elemento: '206', documento: 'NF 2', parceiro: {nome: 'Y'}, origem: {tipo: 'MANUAL'}}
}, classificacoes: {}, baixas: {}, abatimentos: {}}, ctl: {fechamentos: {}}};

let esp = Ctl.documentosEsperados(base);
eq(P(esp.TIT_M1), [['DESP_ADM', 'ADMINISTRATIVO', 10000, 0], ['FORNECEDORES', null, 0, 10000]], 'sem classificação: como antes');
eq(P(esp.TIT_M2), [['CIF', null, 5000, 0], ['FORNECEDORES', null, 0, 5000]], 'elemento do título manual (206 manutenção) muda a conta para custo fixo de produção');
const b1 = clone(base); b1.fin.classificacoes.M1 = {elemento: '2113', rateio: [{centro: 'ADMINISTRATIVO', percentual: 70}, {centro: 'PRODUCAO', percentual: 30}]};
esp = Ctl.documentosEsperados(b1);
eq(P(esp.TIT_M1), [['DESP_ADM', 'ADMINISTRATIVO', 7000, 0], ['DESP_ADM', 'PRODUCAO', 3000, 0], ['FORNECEDORES', null, 0, 10000]], 'classificado: rateio por centro');
// Reclassificar: o lançamento antigo é estornado e o novo entra.
let r = Ctl.derivar(base, AGORA), b = aplicar(base, r.updates);
b.fin.classificacoes = clone(b1.fin.classificacoes);
r = Ctl.derivar(b, AGORA);
ok(r.estornados === 1 && r.novos === 1, 'reclassificar: estorna 1 e lança 1 (' + r.estornados + '/' + r.novos + ')');
// Cancelamento por engano desfaz o que foi lançado (mesma conta e mesmo rateio).
const b2 = clone(b1);
const cn = F.montarCancelamento(b2.fin, {titulos: ['M1'], data: '2026-11-10', motivo: 'ENGANO', justificativa: 'lançado em duplicidade'}, 'c1');
b2.fin.cancelamentos = {CN_c1: cn.registro}; b2.fin.abatimentos = cn.abatimentos;
eq(P(Ctl.documentosEsperados(b2).CAN_CN_c1_M1), [['FORNECEDORES', null, 10000, 0], ['DESP_ADM', 'ADMINISTRATIVO', 0, 7000], ['DESP_ADM', 'PRODUCAO', 0, 3000]], 'cancelamento espelha o rateio');
Object.values(Ctl.documentosEsperados(b2)).forEach((d) => ok(Ctl.documentoBalanceado(d.partidas).ok, 'balanceado'));
eq(fs.readFileSync('public/shared/controladoria.js', 'utf8'), fs.readFileSync('functions/controladoria.js', 'utf8'), 'cópias idênticas');
console.log('financeiro F9 (controladoria): ' + n + ' verificações OK');
