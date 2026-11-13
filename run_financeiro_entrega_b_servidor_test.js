'use strict';
/* Financeiro — Entrega B no servidor (12/11/2026): cada preparar* devolve só caminhos
   planos em fin/, chave repetida não regrava, mês fechado recusa, e o index.js lê e
   liga tudo (a lição do CLAUDE.md: testar a ligação, não só a unidade). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const S = require('./functions/financeiro_servidor');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const recusa = (fn, re, m) => { assert.throws(fn, re, m); n++; };
const quem = {uid: 'u1', nome: 'Ana'}, AGORA = '2026-11-12T13:00:00.000Z', D = '2026-11-12';
const clone = (x) => JSON.parse(JSON.stringify(x));
function aplicar(base, updates) {
  const b = clone(base);
  Object.entries(updates).forEach(([k, v]) => {
    const p = k.split('/'); let x = b;
    p.slice(0, -1).forEach((c) => { x[c] = x[c] || {}; x = x[c]; });
    if (v === null) delete x[p[p.length - 1]]; else x[p[p.length - 1]] = clone(v);
  });
  return b;
}
const planos = (u) => Object.entries(u).every(([k, v]) => k.startsWith('fin/') && k.split('/').length >= 3 && (v === null || typeof v !== 'object' || !Object.values(v).some((x) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 0)));
function base() {
  return {
    fin: {
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-11-01'}},
      titulos: {
        P1: {tipo: 'PAGAR', valorCentavos: 30000, vencimentoFixo: '2026-11-30', emissao: '2026-11-02', natureza: 'OUTROS', documento: 'NF 1', parceiro: {nome: 'Química SA', cnpj: '01234567000190'}, origem: {tipo: 'MANUAL'}},
        P2: {tipo: 'PAGAR', valorCentavos: 10000, vencimentoFixo: '2026-11-30', emissao: '2026-11-02', natureza: 'OUTROS', documento: 'NF 2', parceiro: {nome: 'Química SA', cnpj: '01234567000190'}, origem: {tipo: 'MANUAL'}},
        R1: {tipo: 'RECEBER', valorCentavos: 50000, vencimentoFixo: '2026-11-25', emissao: '2026-11-02', natureza: 'RECEITA_VENDA', documento: 'NF 501', parceiro: {nome: 'Marca Bela'}, origem: {tipo: 'MANUAL'}}
      },
      baixas: {}, abatimentos: {}, adiantamentos: {}, renegociacoes: {}, cancelamentos: {}, lotes_pagamento: {}
    },
    ctl: {fechamentos: {'2026-10': {status: 'FECHADO'}}}
  };
}

// ── Adiantamento ───────────────────────────────────────────────────────────
let b = base();
let r = S.prepararAdiantamento(b, {chave: 'ad000001', tipo: 'PAGAR', parceiro: 'Química SA', cnpj: '01234567000190', conta: 'itau', data: D, valorCentavos: 20000}, quem, AGORA);
eq(Object.keys(r.updates), ['fin/adiantamentos/AD_ad000001']);
ok(planos(r.updates), 'caminhos planos');
eq([r.updates['fin/adiantamentos/AD_ad000001'].criadoPor, r.updates['fin/adiantamentos/AD_ad000001'].criadoPorUid], ['Ana', 'u1']);
b = aplicar(b, r.updates);
eq(S.prepararAdiantamento(b, {chave: 'ad000001', tipo: 'PAGAR', parceiro: 'Química SA', conta: 'itau', data: D, valorCentavos: 20000}, quem, AGORA).repetido, true, 'clique duplo não duplica');
recusa(() => S.prepararAdiantamento(b, {chave: 'x', tipo: 'PAGAR', parceiro: 'A', conta: 'itau', data: D, valorCentavos: 1}, quem, AGORA), /Identificador/, 'chave inválida');
recusa(() => S.prepararAdiantamento(b, {chave: 'ad000002', tipo: 'PAGAR', parceiro: 'A', conta: 'itau', data: '2026-10-20', valorCentavos: 1}, quem, AGORA), /fechado/, 'mês fechado');

// ── Compensação ────────────────────────────────────────────────────────────
r = S.prepararCompensacao(b, {chave: 'cp000001', adiantamento: 'AD_ad000001', titulo: 'P1', valorCentavos: 15000, data: D}, quem, AGORA);
eq(Object.keys(r.updates), ['fin/baixas/CP_cp000001']);
eq([r.updates['fin/baixas/CP_cp000001'].forma, r.updates['fin/baixas/CP_cp000001'].conta], ['ADIANTAMENTO', null]);
b = aplicar(b, r.updates);
eq(S.prepararCompensacao(b, {chave: 'cp000001', adiantamento: 'AD_ad000001', titulo: 'P1', valorCentavos: 15000, data: D}, quem, AGORA).repetido, true);
recusa(() => S.prepararCompensacao(b, {chave: 'cp000002', adiantamento: 'AD_ad000001', titulo: 'P1', valorCentavos: 6000, data: D}, quem, AGORA), /disponível/, 'passa do saldo do adiantamento');
recusa(() => S.prepararEstornoAdiantamento(b, {adiantamento: 'AD_ad000001', motivo: 'lançado errado', data: D}, quem, AGORA), /compensação/, 'com compensação não estorna');
// Estorno da compensação (callable de estorno de baixa que já existe) libera o adiantamento.
b = aplicar(b, S.prepararEstorno(b, {baixa: 'CP_cp000001', motivo: 'compensei errado', data: D}, quem, AGORA).updates);
r = S.prepararEstornoAdiantamento(b, {adiantamento: 'AD_ad000001', motivo: 'lançado errado', data: D}, quem, AGORA);
eq(Object.keys(r.updates), ['fin/adiantamentos/AD_ad000001_estorno']);
eq([r.updates['fin/adiantamentos/AD_ad000001_estorno'].tipoRegistro, r.updates['fin/adiantamentos/AD_ad000001_estorno'].motivo], ['ESTORNO', 'lançado errado']);
recusa(() => S.prepararEstornoAdiantamento(b, {adiantamento: 'AD_ad000001', motivo: 'x', data: D}, quem, AGORA), /motivo/, 'estorno exige motivo');

// ── Renegociação ───────────────────────────────────────────────────────────
b = base();
r = S.prepararRenegociacao(b, {chave: 'rn000001', titulos: ['P1', 'P2'], data: D, condicao: '30/60', acrescimoCentavos: 500, motivo: 'acordo com o fornecedor'}, quem, AGORA);
eq(Object.keys(r.updates).sort(), ['fin/abatimentos/RN_rn000001_P1', 'fin/abatimentos/RN_rn000001_P2', 'fin/renegociacoes/RN_rn000001', 'fin/titulos/RNG_rn000001'], 'registro, título novo e abatimentos no mesmo update');
ok(planos(r.updates));
eq(r.updates['fin/titulos/RNG_rn000001'].criadoPor, 'Ana');
b = aplicar(b, r.updates);
eq(S.prepararRenegociacao(b, {chave: 'rn000001', titulos: ['P1'], data: D, condicao: '30', motivo: 'xxxxxx'}, quem, AGORA).repetido, true);
recusa(() => S.prepararRenegociacao(base(), {chave: 'rn000009', titulos: ['P1'], data: '2026-10-05', condicao: '30', motivo: 'xxxxxx'}, quem, AGORA), /fechado/, 'mês fechado');
const comLote = base(); comLote.fin.lotes_pagamento = {L1: {status: 'AGUARDANDO', titulos: {P1: 30000}}};
recusa(() => S.prepararRenegociacao(comLote, {chave: 'rn000003', titulos: ['P1'], data: D, condicao: '30', motivo: 'xxxxxx'}, quem, AGORA), /lote/, 'título em lote aguardando');
r = S.prepararDesfazerRenegociacao(b, {renegociacao: 'RN_rn000001', motivo: 'lançada errada', data: D}, quem, AGORA);
eq(r.updates['fin/renegociacoes/RN_rn000001/status'], 'DESFEITA');
eq([r.updates['fin/renegociacoes/RN_rn000001/desfeitaPor'], r.updates['fin/renegociacoes/RN_rn000001/motivoDesfazer']], ['Ana', 'lançada errada']);
ok(r.updates['fin/abatimentos/RN_rn000001_desf_P1'].valorCentavos === -30000, 'abatimento negativo no original');
ok(planos(r.updates));
b = aplicar(b, r.updates);
recusa(() => S.prepararDesfazerRenegociacao(b, {renegociacao: 'RN_rn000001', motivo: 'lançada errada', data: D}, quem, AGORA), /desfeita/, 'desfazer duas vezes');

// ── Cancelamento ───────────────────────────────────────────────────────────
b = base();
r = S.prepararCancelamento(b, {chave: 'cn000001', titulos: ['R1'], data: D, motivo: 'INCOBRAVEL', justificativa: 'cliente fechou as portas'}, quem, AGORA);
eq(Object.keys(r.updates).sort(), ['fin/abatimentos/CN_cn000001_R1', 'fin/cancelamentos/CN_cn000001']);
eq(r.updates['fin/cancelamentos/CN_cn000001'].criadoPor, 'Ana');
b = aplicar(b, r.updates);
eq(S.prepararCancelamento(b, {chave: 'cn000001', titulos: ['R1'], data: D, motivo: 'INCOBRAVEL', justificativa: 'cliente fechou as portas'}, quem, AGORA).repetido, true);
r = S.prepararDesfazerCancelamento(b, {cancelamento: 'CN_cn000001', motivo: 'cliente pagou', data: D}, quem, AGORA);
eq(r.updates['fin/cancelamentos/CN_cn000001/status'], 'DESFEITO');
b = aplicar(b, r.updates);
eq(S.situacaoDe(b, 'R1').saldoCentavos, 50000, 'desfeito: saldo de volta');

// Lote aprovado depois que um título foi cancelado: falha com mensagem clara.
b = base();
b.fin.lotes_pagamento = {L1: {status: 'AGUARDANDO', titulos: {P1: 30000}, conta: 'itau', dataPagamento: D, criadoPorUid: 'outro'}};
const semLote = clone(b); semLote.fin.lotes_pagamento = {};
b = aplicar(b, S.prepararCancelamento(semLote, {chave: 'cn000002', titulos: ['P1'], data: D, motivo: 'ENGANO', justificativa: 'lançado em duplicidade'}, quem, AGORA).updates);
recusa(() => S.prepararDecisaoLote(b, {lote: 'L1', acao: 'APROVAR'}, quem, AGORA), /P1.*saldo/, 'aprovar lote com título cancelado: recusa clara');

// ── Ligação no index.js ────────────────────────────────────────────────────
const idx = fs.readFileSync('functions/index.js', 'utf8');
['fin/adiantamentos', 'fin/renegociacoes', 'fin/cancelamentos'].forEach((c) => {
  ok(new RegExp('CAMINHOS_FIN = \\[[^\\]]*"' + c + '"').test(idx), c + ' está em CAMINHOS_FIN');
  ok(idx.includes(c.split('/')[1] + ': v["' + c + '"]'), c + ' entra no objeto fin da base');
});
['finAdiantamento', 'finCompensarAdiantamento', 'finRenegociar', 'finCancelarTitulos'].forEach((c) => ok(new RegExp('exports\\.' + c + ' = onCall\\([^\\n]*chamadaFin\\(').test(idx), 'callable ' + c + ' passa por chamadaFin'));
ok(/function chamadaFin\(preparar\) \{[\s\S]{0,120}exigirFinanceiro\(request\)[\s\S]{0,80}filaFinanceiro\(/.test(idx), 'chamadaFin exige o módulo Financeiro e roda na fila');
console.log('financeiro Entrega B (servidor): ' + n + ' verificações OK');
