'use strict';
/* Financeiro F7 (10/11/2026): fluxo de caixa por dia/semana/mês com filtro de conta e
   natureza, e DFC pelo método direto que fecha com os bancos. docs/financeiro-fase0-lacunas.md. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const F = require('./functions/financeiro');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

function fin() {
  return {
    contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-09-01'},
      cx: {nome: 'Caixa', tipo: 'CAIXA', saldoInicialCentavos: 5000, dataSaldoInicial: '2026-10-15'}},
    titulos: {
      T1: {tipo: 'PAGAR', valorCentavos: 5000, vencimentoFixo: '2026-12-01', emissao: '2026-10-01', natureza: 'EMBALAGEM', parceiro: {nome: 'F'}, origem: {tipo: 'MANUAL'}},
      T2: {tipo: 'RECEBER', valorCentavos: 20000, vencimentoFixo: '2026-11-20', emissao: '2026-10-01', natureza: 'RECEITA_VENDA', parceiro: {nome: 'C'}, origem: {tipo: 'MANUAL'}}
    },
    baixas: {
      B1: {tipo: 'BAIXA', titulo: 'T0', tituloTipo: 'RECEBER', natureza: 'RECEITA_VENDA', data: '2026-10-05', conta: 'itau', valorCentavos: 30000, jurosCentavos: 500, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 30500},
      B2: {tipo: 'BAIXA', titulo: 'T9', tituloTipo: 'PAGAR', natureza: 'EMBALAGEM', data: '2026-10-08', conta: 'itau', valorCentavos: 10000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 300, liquidoCentavos: 9700},
      B2_estorno: {tipo: 'ESTORNO', estorna: 'B2', titulo: 'T9', tituloTipo: 'PAGAR', natureza: 'EMBALAGEM', data: '2026-10-09', conta: 'itau', valorCentavos: 10000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 300, liquidoCentavos: 9700},
      B3: {tipo: 'BAIXA', titulo: 'T8', tituloTipo: 'PAGAR', natureza: 'EMPRESTIMO', data: '2026-11-04', conta: 'itau', valorCentavos: 4000, liquidoCentavos: 4000}
    },
    movimentos: {
      M1: {tipoRegistro: 'MOVIMENTO', tipo: 'TRANSFERENCIA', conta: 'itau', destino: 'cx', data: '2026-10-20', valorCentavos: 10000},
      M2: {tipoRegistro: 'MOVIMENTO', tipo: 'TARIFA', conta: 'itau', data: '2026-11-03', valorCentavos: 900},
      M3: {tipoRegistro: 'MOVIMENTO', tipo: 'RENDIMENTO', conta: 'itau', data: '2026-10-31', valorCentavos: 250}
    },
    parametros: {}
  };
}

// ── 1. DFC ─────────────────────────────────────────────────────────────────
let d = F.dfc(fin(), '2026-09', '2026-11');
eq(d.meses, ['2026-09', '2026-10', '2026-11']);
ok(d.colunas.every((c) => c.confere), 'saldo final fecha com os bancos em todos os meses: ' + JSON.stringify(d.colunas.map((c) => c.diferencaCentavos)));
eq(d.colunas.map((c) => [c.saldoInicialCentavos, c.aberturaContasCentavos, c.variacaoCentavos, c.saldoFinalCentavos]),
  [[0, 100000, 0, 100000], [100000, 5000, 30750, 135750], [135750, 0, -4900, 130850]], 'abertura de conta não é fluxo; transferência não entra');
const linha = (atv, nat) => d.grupos.find((g) => g.atividade === atv).linhas.find((l) => l.natureza === nat);
eq(linha('OPERACIONAL', 'RECEITA_VENDA').meses['2026-10'], 30000, 'principal na natureza do título');
eq(linha('OPERACIONAL', 'RESULTADO_FINANCEIRO').meses, {'2026-09': 0, '2026-10': 750, '2026-11': -900}, 'juros 500 + rendimento 250; tarifa 900');
eq(linha('OPERACIONAL', 'EMBALAGEM').meses['2026-10'], 0, 'baixa estornada se anula (com o desconto)');
eq(linha('NAO_CLASSIFICADO', 'EMPRESTIMO').meses['2026-11'], -4000, 'natureza sem atividade não some');
ok(d.naoClassificado, 'avisa que há não classificado');
// Atividade configurada.
const f2 = fin(); f2.parametros.dfcAtividades = {EMPRESTIMO: 'FINANCIAMENTO', RESULTADO_FINANCEIRO: 'FINANCIAMENTO'};
d = F.dfc(f2, '2026-11', '2026-11');
eq(d.grupos.map((g) => g.atividade), ['FINANCIAMENTO'], 'novembro só tem financiamento');
eq(d.grupos[0].totais['2026-11'], -4900);
ok(!d.naoClassificado && d.colunas[0].confere);
eq(F.atividadeDe('XYZ', {dfcAtividades: {XYZ: 'INVALIDA'}}), 'NAO_CLASSIFICADO', 'atividade inválida não é aceita');
ok(!F.dfc(fin(), '2026-11', '2026-09').ok, 'período invertido recusado');

// ── 2. Fluxo por período ───────────────────────────────────────────────────
const base = {fin: fin()};
let fl = F.fluxoCaixa(base, '2026-11-10', {granularidade: 'MES'});
eq(fl.colunas.map((c) => c.inicio).slice(0, 4), ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01'], 'meses');
eq(fl.colunas.length, 9, '3 realizados + 6 projetados');
const out = fl.colunas.find((c) => c.inicio === '2026-10-01');
eq([out.entradas, out.saidas], [30750, 0], 'outubro: baixa + juros + rendimento; estorno anula; transferência não entra');
const nov = fl.colunas.find((c) => c.inicio === '2026-11-01'), dez = fl.colunas.find((c) => c.inicio === '2026-12-01');
eq([nov.entradas, dez.saidas], [20000, 5000], 'projetado pelas parcelas abertas');
eq(fl.saldoAtualCentavos, F.saldosBancarios(base.fin, '2026-11-10').itau.saldoCentavos + F.saldosBancarios(base.fin, '2026-11-10').cx.saldoCentavos);
eq(nov.saldoProjetadoCentavos, fl.saldoAtualCentavos + 20000, 'saldo projetado');
fl = F.fluxoCaixa(base, '2026-11-10', {granularidade: 'DIA'});
eq([fl.colunas.length, fl.colunas[7].inicio, fl.colunas[0].inicio], [37, '2026-11-10', '2026-11-03'], '7 dias para trás e 30 para frente');
eq(fl.colunas[0].saidas, 900, 'tarifa no dia');
fl = F.fluxoCaixa(base, '2026-11-10', {granularidade: 'SEMANA'});
eq(fl.colunas[4].inicio, '2026-11-09', 'semana começa na segunda');
// Conta: só realizado, com as pernas da transferência.
fl = F.fluxoCaixa(base, '2026-11-10', {granularidade: 'MES', conta: 'cx'});
ok(!fl.projetado && /só o realizado/.test(fl.avisos[0]), 'com conta: sem projetado e avisa');
eq(fl.colunas.find((c) => c.inicio === '2026-10-01').entradas, 10000, 'caixa recebeu a transferência');
eq(fl.saldoAtualCentavos, 15000, 'saldo do caixa: 5.000 de abertura + 10.000');
// Natureza: sem saldo projetado.
fl = F.fluxoCaixa(base, '2026-11-10', {granularidade: 'MES', natureza: 'RECEITA_VENDA'});
eq(fl.colunas.find((c) => c.inicio === '2026-10-01').entradas, 30000, 'só o principal da venda');
ok(fl.colunas.every((c) => c.saldoProjetadoCentavos == null || c.passada), 'sem saldo projetado com natureza');
// O fluxo de 13 semanas (painel) passa a contar tarifa/rendimento no realizado.
const sem = F.fluxoDeCaixa(base, '2026-11-10', 13);
eq(sem.semanas.find((c) => c.semana === '2026-11-02').saidas, 4900, 'painel: tarifa (900) entra no realizado junto com o pagamento (4.000)');
eq(sem.semanas.find((c) => c.semana === '2026-10-19').entradas + sem.semanas.find((c) => c.semana === '2026-10-19').saidas, 0, 'transferência não aparece no consolidado');

// ── 3. Reconciliação de Bancos na Controladoria ────────────────────────────
const Ctl = require('./functions/controladoria');
const fb = fin(); fb.baixas = {}; // saldo inicial + movimentos (baixa de título sem título não lança)
const docs = Ctl.documentosEsperados({fin: fb});
const ctl = {lancamentos: {}};
Object.entries(docs).forEach(([k, d]) => { (ctl.lancamentos[d.competencia] = ctl.lancamentos[d.competencia] || {})[k] = d; });
let rec = Ctl.reconciliacao({fin: fb, ctl}, '2026-11').find((c) => c.conta === 'BANCOS');
ok(rec && rec.razaoCentavos === rec.financeiroCentavos && rec.diferencaCentavos === 0, 'razão de Bancos = saldo das contas no fim do mês');
delete ctl.lancamentos['2026-11'];
rec = Ctl.reconciliacao({fin: fb, ctl}, '2026-11').find((c) => c.conta === 'BANCOS');
eq(rec.diferencaCentavos, 900, 'tarifa de novembro sem lançamento: a diferença aparece');
eq(Ctl.reconciliacao({fin: {}, ctl}, '2026-11').some((c) => c.conta === 'BANCOS'), false, 'sem conta cadastrada, não confere bancos');
eq(fs.readFileSync('public/shared/controladoria.js', 'utf8'), fs.readFileSync('functions/controladoria.js', 'utf8'), 'controladoria idêntica');

eq(fs.readFileSync('public/shared/financeiro.js', 'utf8'), fs.readFileSync('functions/financeiro.js', 'utf8'), 'motor idêntico');
console.log('financeiro F7 (fluxo por período e DFC): ' + n + ' asserções OK');
