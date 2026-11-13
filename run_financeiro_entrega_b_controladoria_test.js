'use strict';
/* Entrega B na Controladoria (12/11/2026): adiantamento, compensação, renegociação e
   cancelamento viram lançamentos balanceados; a reconciliação (Fornecedores, Clientes,
   Bancos e as duas contas de adiantamento) fecha em zero; desfazer estorna sozinho. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Ctl = require('./public/shared/controladoria');
const F = require('./public/shared/financeiro');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const D = '2026-11-10', AGORA = '2026-11-12T12:00:00.000Z';
const clone = (x) => JSON.parse(JSON.stringify(x));
function aplicar(obj, updates) {
  const b = clone(obj);
  Object.entries(updates).forEach(([k, v]) => {
    const p = k.split('/'); let x = b;
    p.slice(0, -1).forEach((c) => { if (x[c] == null || typeof x[c] !== 'object') x[c] = {}; x = x[c]; });
    if (v === null) delete x[p[p.length - 1]]; else x[p[p.length - 1]] = clone(v);
  });
  return b;
}
const tit = (tipo, valor, extra) => Object.assign({tipo, valorCentavos: valor, vencimentoFixo: '2026-11-30', emissao: '2026-11-02', competencia: '2026-11', origem: {tipo: 'MANUAL'}}, extra);
function base() {
  return {
    fin: {
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-11-01'}},
      titulos: {
        P1: tit('PAGAR', 30000, {natureza: 'OUTROS', centroCusto: 'ADMINISTRATIVO', documento: 'NF 1', parceiro: {nome: 'Química SA', cnpj: '01234567000190'}}),
        P2: tit('PAGAR', 10000, {natureza: 'CUSTO_FIXO_ADM', documento: 'NF 2', parceiro: {nome: 'Química SA', cnpj: '01234567000190'}}),
        P3: tit('PAGAR', 6000, {natureza: 'OUTROS', documento: 'NF 3', parceiro: {nome: 'Serviços X'}}),
        R1: tit('RECEBER', 50000, {natureza: 'RECEITA_VENDA', documento: 'NF 501', parceiro: {nome: 'Marca Bela'}}),
        R2: tit('RECEBER', 20000, {natureza: 'RECEITA_VENDA', documento: 'NF 502', parceiro: {nome: 'Calote Ltda'}}),
        R3: tit('RECEBER', 15000, {natureza: 'OUTRAS_RECEITAS', documento: 'S/N', parceiro: {nome: 'Abertura'}, origem: {tipo: 'IMPORTACAO'}})
      },
      baixas: {}, abatimentos: {}, adiantamentos: {}, renegociacoes: {}, cancelamentos: {}, parametros: {}
    },
    ctl: {fechamentos: {}}
  };
}
// Roda a derivação da Controladoria como o servidor (append-only).
function derivar(b) { const r = Ctl.derivar(b, AGORA); return {b: aplicar(b, r.updates), r}; }
function reconcilia(b) { return Ctl.reconciliacao(b, '2026-11').reduce((m, c) => (m[c.conta] = c, m), {}); }
function confereZero(b, rot) {
  const rec = reconcilia(b);
  ['FORNECEDORES', 'CLIENTES', 'BANCOS', 'ADIANT_FORNECEDORES', 'ADIANT_CLIENTES'].forEach((k) => {
    ok(rec[k], rot + ': linha ' + k + ' na reconciliação');
    eq(rec[k].diferencaCentavos, 0, rot + ': ' + k + ' razão ' + rec[k].razaoCentavos + ' × financeiro ' + rec[k].financeiroCentavos);
  });
}

// Contas novas.
eq([Ctl.PLANO_PADRAO.ADIANT_FORNECEDORES.codigo, Ctl.PLANO_PADRAO.ADIANT_FORNECEDORES.tipo], ['1.1.4', 'ATIVO']);
eq([Ctl.PLANO_PADRAO.ADIANT_CLIENTES.codigo, Ctl.PLANO_PADRAO.ADIANT_CLIENTES.tipo], ['2.1.6', 'PASSIVO']);
eq([Ctl.PLANO_PADRAO.PERDAS_CLIENTES.codigo, Ctl.PLANO_PADRAO.PERDAS_CLIENTES.tipo, Ctl.PLANO_PADRAO.PERDAS_CLIENTES.grupoDre], ['5.1.4', 'DESPESA', 'DESPESAS_COMERCIAIS']);

// Cenário completo.
let b = base(), f = b.fin;
let v = F.validarAdiantamento({tipo: 'PAGAR', parceiro: 'Química SA', cnpj: '01234567000190', conta: 'itau', data: D, valorCentavos: 20000}, f);
f.adiantamentos.AD_1 = v.registro;
v = F.validarAdiantamento({tipo: 'RECEBER', parceiro: 'Marca Bela', conta: 'itau', data: D, valorCentavos: 8000}, f);
f.adiantamentos.AD_2 = v.registro;
v = F.validarCompensacao(F.carteira(f).find((s) => s.id === 'P1'), F.saldosAdiantamentos(f).AD_1, {data: D, valorCentavos: 15000});
f.baixas.CP_1 = v.registro;
v = F.validarCompensacao(F.carteira(f).find((s) => s.id === 'R1'), F.saldosAdiantamentos(f).AD_2, {data: D, valorCentavos: 5000});
f.baixas.CP_2 = v.registro;
let m = F.montarRenegociacao(f, {titulos: ['P2'], data: D, condicao: '30', acrescimoCentavos: 700, motivo: 'acordo'}, 'rn1');
f.renegociacoes.RN_rn1 = m.registro; f.titulos.RNG_rn1 = m.titulo; Object.assign(f.abatimentos, m.abatimentos);
m = F.montarRenegociacao(f, {titulos: ['R1'], data: D, vencimento: '2026-12-20', descontoCentavos: 1000, motivo: 'acordo com desconto'}, 'rn2');
f.renegociacoes.RN_rn2 = m.registro; f.titulos.RNG_rn2 = m.titulo; Object.assign(f.abatimentos, m.abatimentos);
m = F.montarCancelamento(f, {titulos: ['R2'], data: D, motivo: 'INCOBRAVEL', justificativa: 'cliente fechou as portas'}, 'cn1');
f.cancelamentos.CN_cn1 = m.registro; Object.assign(f.abatimentos, m.abatimentos);
m = F.montarCancelamento(f, {titulos: ['R3'], data: D, motivo: 'ENGANO', justificativa: 'saldo de abertura em duplicidade'}, 'cn2');
f.cancelamentos.CN_cn2 = m.registro; Object.assign(f.abatimentos, m.abatimentos);
m = F.montarCancelamento(f, {titulos: ['P3'], data: D, motivo: 'ENGANO', justificativa: 'serviço lançado em duplicidade'}, 'cn3');
f.cancelamentos.CN_cn3 = m.registro; Object.assign(f.abatimentos, m.abatimentos);
// Pagamento parcial do título renegociado (passivo herdado do original).
f.baixas.B_RNG = {tipo: 'BAIXA', titulo: 'RNG_rn1', tituloTipo: 'PAGAR', data: D, conta: 'itau', valorCentavos: 3000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 3000};

const esp = Ctl.documentosEsperados(b);
Object.keys(esp).forEach((k) => ok(Ctl.documentoBalanceado(esp[k].partidas).ok, 'documento balanceado: ' + k));
const p = (doc) => esp[doc].partidas.map((x) => [x.conta, x.debitoCentavos, x.creditoCentavos]);
eq(p('ADT_AD_1'), [['ADIANT_FORNECEDORES', 20000, 0], ['BANCOS', 0, 20000]], 'adiantamento a fornecedor');
eq(p('ADT_AD_2'), [['BANCOS', 8000, 0], ['ADIANT_CLIENTES', 0, 8000]], 'adiantamento de cliente');
eq(p('BX_CP_1'), [['FORNECEDORES', 15000, 0], ['ADIANT_FORNECEDORES', 0, 15000]], 'compensação a pagar');
eq(p('BX_CP_2'), [['ADIANT_CLIENTES', 5000, 0], ['CLIENTES', 0, 5000]], 'compensação a receber');
// P2 é custo fixo adm de título manual: passivo FORNECEDORES (passivoDoTitulo de MANUAL). Só o acréscimo mexe no resultado.
eq(p('RNG_RN_rn1'), [['DESP_FIN', 700, 0], ['FORNECEDORES', 0, 700]], 'renegociação a pagar: principal só troca de título; acréscimo é despesa financeira');
eq(p('RNG_RN_rn2'), [['DESP_FIN', 1000, 0], ['CLIENTES', 0, 1000]], 'renegociação a receber com desconto');
eq(p('CAN_CN_cn1_R2'), [['PERDAS_CLIENTES', 20000, 0], ['CLIENTES', 0, 20000]], 'incobrável: perda com clientes');
eq(p('CAN_CN_cn2_R3'), [['SALDOS_ABERTURA', 15000, 0], ['CLIENTES', 0, 15000]], 'engano em saldo de abertura');
eq(p('CAN_CN_cn3_P3'), [['FORNECEDORES', 6000, 0], ['DESP_ADM', 0, 6000]], 'engano em a pagar manual desfaz a despesa');
eq(esp.BX_B_RNG.partidas.map((x) => x.conta), ['FORNECEDORES', 'BANCOS'], 'baixa do título renegociado liquida o passivo herdado');

let r = derivar(b); b = r.b;
confereZero(b, 'depois de tudo');
const dre = Ctl.dre(b.ctl, '2026-11', {});
const linha = (k) => dre.linhas.find((l) => l.chave === k).valor;
eq(linha('DESPESAS_COMERCIAIS'), -20000, 'perda com clientes nas despesas comerciais');
eq(linha('RESULTADO_FINANCEIRO'), -1700, 'acréscimo (−7) e desconto concedido (−10) no financeiro');

// Desfazer: o fato deixa de valer e a Controladoria estorna sozinha.
const u1 = F.montarDesfazerCancelamento(b.fin, 'CN_cn1', {data: D, motivo: 'cliente pagou'});
b.fin.cancelamentos.CN_cn1.status = 'DESFEITO'; Object.assign(b.fin.abatimentos, u1.abatimentos);
delete b.fin.baixas.B_RNG;
const u2 = F.montarDesfazerRenegociacao(b.fin, 'RN_rn1', {data: D, motivo: 'lançada errada'});
b.fin.renegociacoes.RN_rn1.status = 'DESFEITA'; Object.assign(b.fin.abatimentos, u2.abatimentos);
const u3 = F.validarEstornoAdiantamento(b.fin, 'AD_2');
ok(!u3.ok, 'adiantamento de cliente com compensação não estorna');
r = derivar(b); b = r.b;
ok(r.r.estornados >= 3, 'desfazer estorna os lançamentos (' + r.r.estornados + ')');
confereZero(b, 'depois de desfazer');
ok(Ctl.dre(b.ctl, '2026-11', {}).linhas.find((l) => l.chave === 'DESPESAS_COMERCIAIS').valor === 0, 'perda estornada (−0 da DRE conta como zero)');
// Estorno do adiantamento a fornecedor depois de estornar a compensação.
b.fin.baixas.CP_1_estorno = F.validarEstorno(b.fin.baixas, 'CP_1').registro;
b.fin.adiantamentos.AD_1_estorno = Object.assign({}, F.validarEstornoAdiantamento(b.fin, 'AD_1').registro, {data: D});
r = derivar(b); b = r.b;
confereZero(b, 'depois do estorno do adiantamento');
eq(reconcilia(b).ADIANT_FORNECEDORES.razaoCentavos, 0, 'adiantamento estornado zera a conta');

// Base sem nada novo: nada muda.
ok(Object.keys(Ctl.documentosEsperados({fin: {}})).length === 0, 'base vazia, sem documento');
eq(fs.readFileSync('public/shared/controladoria.js', 'utf8'), fs.readFileSync('functions/controladoria.js', 'utf8'), 'controladoria idêntica nas duas cópias');
console.log('financeiro Entrega B (controladoria): ' + n + ' verificações OK');
