'use strict';
/* Financeiro — Entrega B (12/11/2026): adiantamento a fornecedor e de cliente com
   compensação; renegociação; cancelamento em lote. Motor puro.
   Spec: docs/superpowers/specs/2026-11-12-financeiro-entrega-b-design.md */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const F = require('./functions/financeiro');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const D = '2026-11-10';
const clone = (x) => JSON.parse(JSON.stringify(x));

function base() {
  return {
    contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-11-01'},
      cx: {nome: 'Caixa', tipo: 'CAIXA', saldoInicialCentavos: 1000, dataSaldoInicial: '2026-11-01'}},
    titulos: {
      P1: {tipo: 'PAGAR', valorCentavos: 30000, vencimentoFixo: '2026-11-30', emissao: '2026-11-02', natureza: 'MATERIA_PRIMA', documento: 'NF 1',
        parceiro: {tipo: 'FORNECEDOR', nome: 'Química SA', cnpj: '01234567000190'}, origem: {tipo: 'MANUAL'}},
      R1: {tipo: 'RECEBER', valorCentavos: 50000, vencimentoFixo: '2026-11-25', emissao: '2026-11-02', natureza: 'RECEITA_VENDA', documento: 'NF 501',
        parceiro: {tipo: 'CLIENTE', nome: 'Marca Bela'}, origem: {tipo: 'MANUAL'}}
    },
    baixas: {}, movimentos: {}, adiantamentos: {}, parametros: {}
  };
}
// Aplica o registro como o servidor faria (só para o teste).
function comAdiantamento(fin, id, reg) { const f = clone(fin); f.adiantamentos = Object.assign({}, f.adiantamentos, {[id]: reg}); return f; }
function comBaixa(fin, id, reg) { const f = clone(fin); f.baixas = Object.assign({}, f.baixas, {[id]: reg}); return f; }
const sit = (fin, id) => F.carteira(fin).find((s) => s.id === id);

// ── Adiantamento a fornecedor ──────────────────────────────────────────────
let f = base();
let v = F.validarAdiantamento({tipo: 'PAGAR', parceiro: 'Química SA', cnpj: '01.234.567/0001-90', conta: 'itau', data: D, valorCentavos: 20000, documento: 'AD 1'}, f);
ok(v.ok, 'adiantamento válido: ' + v.motivo);
eq([v.registro.tipoRegistro, v.registro.tipo, v.registro.parceiro.tipo, v.registro.conta, v.registro.valorCentavos], ['ADIANTAMENTO', 'PAGAR', 'FORNECEDOR', 'itau', 20000]);
f = comAdiantamento(f, 'AD_1', v.registro);
eq(F.saldosBancarios(f, '2026-11-30').itau.saldoCentavos, 80000, 'adiantamento a fornecedor sai do banco');
const ex = F.extratoConta(f, 'itau', '2026-11-01', '2026-11-30');
const linhaAd = ex.linhas.find((l) => l.tipo === 'ADIANTAMENTO');
ok(linhaAd && linhaAd.valorCentavos === -20000 && /Adiantamento a Química SA/.test(linhaAd.historico), 'extrato mostra o adiantamento');
let d = F.dfc(f, '2026-11', '2026-11');
ok(d.ok && d.colunas[0].confere, 'DFC fecha com o banco (dif ' + d.colunas[0].diferencaCentavos + ')');
ok(d.grupos.some((g) => g.linhas.some((l) => l.natureza === 'ADIANTAMENTOS' && l.meses['2026-11'] === -20000)), 'DFC tem a linha de adiantamentos');
eq(F.atividadeDe('ADIANTAMENTOS', {}), 'OPERACIONAL');
let sa = F.saldosAdiantamentos(f);
eq([sa.AD_1.valorCentavos, sa.AD_1.compensadoCentavos, sa.AD_1.saldoCentavos, sa.AD_1.estornado], [20000, 0, 20000, false]);

// Recusas do adiantamento.
[[{tipo: 'X', parceiro: 'A', conta: 'itau', data: D, valorCentavos: 1}, 'tipo'], [{tipo: 'PAGAR', parceiro: '', conta: 'itau', data: D, valorCentavos: 1}, 'parceiro'],
  [{tipo: 'PAGAR', parceiro: 'A', conta: 'nada', data: D, valorCentavos: 1}, 'conta'], [{tipo: 'PAGAR', parceiro: 'A', conta: 'itau', data: '10/11', valorCentavos: 1}, 'data'],
  [{tipo: 'PAGAR', parceiro: 'A', conta: 'itau', data: D, valorCentavos: 0}, 'valor']]
  .forEach(([x, m]) => ok(!F.validarAdiantamento(x, f).ok, 'adiantamento recusa ' + m));
ok(!F.validarAdiantamento({tipo: 'PAGAR', parceiro: 'A', conta: 'cx', data: D, valorCentavos: 5000}, f).ok, 'adiantamento pelo caixa físico não deixa o caixa negativo');
ok(F.validarAdiantamento({tipo: 'RECEBER', parceiro: 'A', conta: 'cx', data: D, valorCentavos: 5000}, f).ok, 'adiantamento de cliente entra no caixa');

// ── Compensação ────────────────────────────────────────────────────────────
v = F.validarCompensacao(sit(f, 'P1'), sa.AD_1, {data: D, valorCentavos: 15000});
ok(v.ok, 'compensação válida: ' + v.motivo);
eq([v.registro.tipo, v.registro.forma, v.registro.adiantamento, v.registro.conta, v.registro.liquidoCentavos, v.registro.tituloTipo], ['BAIXA', 'ADIANTAMENTO', 'AD_1', null, 15000, 'PAGAR']);
f = comBaixa(f, 'CP_1', v.registro);
eq(sit(f, 'P1').saldoCentavos, 15000, 'compensação abate o título');
eq(F.saldosAdiantamentos(f).AD_1.saldoCentavos, 5000, 'compensação consome o adiantamento');
eq(F.saldosBancarios(f, '2026-11-30').itau.saldoCentavos, 80000, 'compensação não mexe no banco');
ok(F.dfc(f, '2026-11', '2026-11').colunas[0].confere, 'DFC continua fechando');
sa = F.saldosAdiantamentos(f);
ok(!F.validarCompensacao(sit(f, 'P1'), sa.AD_1, {data: D, valorCentavos: 6000}).ok, 'compensar mais que o saldo do adiantamento: recusado');
const outroCnpj = Object.assign({}, sa.AD_1, {parceiro: {tipo: 'FORNECEDOR', nome: 'Química SA', cnpj: '99999999000199'}});
ok(!F.validarCompensacao(sit(f, 'P1'), outroCnpj, {data: D, valorCentavos: 100}).ok, 'mesmo nome, CNPJ diferente: recusado');
ok(!F.validarCompensacao(sit(f, 'R1'), sa.AD_1, {data: D, valorCentavos: 100}).ok, 'adiantamento a fornecedor não compensa título a receber');
const grande = Object.assign({}, sa.AD_1, {saldoCentavos: 999999});
ok(!F.validarCompensacao(sit(f, 'P1'), grande, {data: D, valorCentavos: 20000}).ok, 'compensar mais que o saldo do título: recusado');
const bloq = Object.assign({}, sit(f, 'P1'), {bloqueio: {motivo: 'divergência'}});
ok(!F.validarCompensacao(bloq, sa.AD_1, {data: D, valorCentavos: 100}).ok, 'título bloqueado: recusado');
ok(!F.validarCompensacao(sit(f, 'P1'), Object.assign({}, sa.AD_1, {estornado: true}), {data: D, valorCentavos: 100}).ok, 'adiantamento estornado: recusado');

// Estornar a compensação devolve o saldo do adiantamento.
const est = F.validarEstorno(f.baixas, 'CP_1');
ok(est.ok, 'compensação se estorna pelo estorno de baixa');
const fEst = comBaixa(f, 'CP_1_estorno', est.registro);
eq(F.saldosAdiantamentos(fEst).AD_1.saldoCentavos, 20000, 'estorno da compensação libera o adiantamento');
eq(sit(fEst, 'P1').saldoCentavos, 30000);

// Estorno do adiantamento: só sem compensação.
ok(!F.validarEstornoAdiantamento(f, 'AD_1').ok, 'adiantamento com compensação ativa não se estorna');
v = F.validarEstornoAdiantamento(fEst, 'AD_1');
ok(v.ok, 'sem compensação ativa, estorna: ' + v.motivo);
eq([v.registro.tipoRegistro, v.registro.estorna], ['ESTORNO', 'AD_1']);
const fEst2 = comAdiantamento(fEst, 'AD_1_estorno', Object.assign({}, v.registro, {data: '2026-11-12'}));
eq(F.saldosBancarios(fEst2, '2026-11-30').itau.saldoCentavos, 100000, 'estorno devolve ao banco');
eq(F.saldosAdiantamentos(fEst2).AD_1.estornado, true);
eq(F.saldosAdiantamentos(fEst2).AD_1.saldoCentavos, 0, 'estornado não tem saldo');
ok(!F.validarEstornoAdiantamento(fEst2, 'AD_1').ok, 'estornar duas vezes: recusado');
ok(F.dfc(fEst2, '2026-11', '2026-11').colunas[0].confere, 'DFC fecha com o estorno');
eq(F.extratoConta(fEst2, 'itau', '2026-11-01', '2026-11-30').linhas.filter((l) => l.tipo === 'ESTORNO_ADIANTAMENTO').length, 1, 'estorno no extrato');

// Adiantamento de cliente.
f = base();
v = F.validarAdiantamento({tipo: 'RECEBER', parceiro: 'Marca Bela', conta: 'itau', data: D, valorCentavos: 10000}, f);
f = comAdiantamento(f, 'AD_2', v.registro);
eq(F.saldosBancarios(f, '2026-11-30').itau.saldoCentavos, 110000, 'adiantamento de cliente entra no banco');
v = F.validarCompensacao(sit(f, 'R1'), F.saldosAdiantamentos(f).AD_2, {data: D, valorCentavos: 10000});
ok(v.ok && v.registro.tituloTipo === 'RECEBER', 'compensa título a receber');
f = comBaixa(f, 'CP_2', v.registro);
eq([sit(f, 'R1').saldoCentavos, F.saldosAdiantamentos(f).AD_2.saldoCentavos], [40000, 0]);
eq(F.chaveParceiro({nome: ' marca bela '}), F.chaveParceiro({nome: 'MARCA BELA'}), 'sem CNPJ, chave pelo nome');
eq(F.chaveParceiro({nome: 'X', cnpj: '01.234.567/0001-90'}), 'D01234567000190');

// Base vazia.
eq(F.saldosAdiantamentos({}), {});
eq(F.saldosAdiantamentos(null), {});

// @@TASK2@@

eq(fs.readFileSync('public/shared/financeiro.js', 'utf8'), fs.readFileSync('functions/financeiro.js', 'utf8'), 'motor idêntico');
console.log('financeiro Entrega B (motor): ' + n + ' asserções OK');
