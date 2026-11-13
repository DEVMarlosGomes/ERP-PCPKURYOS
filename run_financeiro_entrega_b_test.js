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

// ── Task 2: renegociação, cancelamento e status ────────────────────────────
function base2() {
  const f = base();
  Object.assign(f.titulos, {
    P3: {tipo: 'PAGAR', valorCentavos: 5000, vencimentoFixo: '2026-11-20', emissao: '2026-11-03', natureza: 'EMBALAGEM', documento: 'NF 3', centroCusto: 'ROTULAGEM',
      parceiro: {tipo: 'FORNECEDOR', nome: 'QUIMICA S/A', cnpj: '01234567000190'}, origem: {tipo: 'MANUAL'}},
    P2: {tipo: 'PAGAR', valorCentavos: 10000, vencimentoFixo: '2026-11-20', emissao: '2026-11-03', natureza: 'MATERIA_PRIMA', documento: 'NF 2',
      parceiro: {tipo: 'FORNECEDOR', nome: 'Química SA', cnpj: '01234567000190'}, origem: {tipo: 'RECEBIMENTO', ref: 'PC1/R1'}},
    P4: {tipo: 'PAGAR', valorCentavos: 7000, vencimentoFixo: '2026-11-20', emissao: '2026-11-03', natureza: 'OUTROS', documento: 'NF 4',
      parceiro: {tipo: 'FORNECEDOR', nome: 'Química SA', cnpj: '01234567000190'}, origem: {tipo: 'MANUAL'}},
    P5: {tipo: 'PAGAR', valorCentavos: 4000, vencimentoFixo: '2026-11-20', emissao: '2026-11-03', natureza: 'OUTROS', documento: 'NF 5',
      parceiro: {tipo: 'FORNECEDOR', nome: 'Outro Ltda', cnpj: '11111111000111'}, origem: {tipo: 'MANUAL'}},
    RNF: {tipo: 'RECEBER', valorCentavos: 40000, vencimentoFixo: '2026-11-25', emissao: '2026-11-02', natureza: 'RECEITA_VENDA', documento: 'NF 900',
      parceiro: {tipo: 'CLIENTE', nome: 'Marca Bela'}, origem: {tipo: 'NF_SAIDA', ref: 'A1/N1'}}
  });
  f.baixas = {B1: {tipo: 'BAIXA', titulo: 'P1', tituloTipo: 'PAGAR', data: '2026-11-05', conta: 'itau', valorCentavos: 10000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 10000}};
  f.lotes_pagamento = {L1: {status: 'AGUARDANDO', titulos: {P4: 7000}, conta: 'itau'}};
  return f;
}
function aplicar(fin, m, no, id) {
  const g = clone(fin);
  g.abatimentos = Object.assign({}, g.abatimentos, m.abatimentos);
  if (m.titulo) g.titulos[m.registro.novoTitulo] = m.titulo;
  if (m.registro) { g[no] = Object.assign({}, g[no], {[id]: m.registro}); }
  return g;
}
let g = base2();
eq(F.emLoteAguardando(g), {P4: 'L1'});
let r = F.montarRenegociacao(g, {titulos: ['P1', 'P3'], data: D, condicao: '30/60', acrescimoCentavos: 1000, motivo: 'pedido do fornecedor'}, 'abc123');
ok(r.ok, 'renegociação válida: ' + r.motivo);
eq([r.registro.novoTitulo, r.registro.valorNovoCentavos, r.registro.titulos, r.registro.status], ['RNG_abc123', 26000, {P1: 20000, P3: 5000}, 'ATIVA'], 'novo = saldo (200 + 50) + acréscimo 10');
eq([r.titulo.origem.tipo, r.titulo.origem.ref, r.titulo.origem.titulos, r.titulo.valorCentavos, r.titulo.natureza, r.titulo.centroCusto], ['RENEGOCIACAO', 'fin/renegociacoes/RN_abc123', ['P1', 'P3'], 26000, 'MATERIA_PRIMA', null], 'título novo: natureza e centro do maior saldo');
eq(r.titulo.porNatureza, {MATERIA_PRIMA: 20000, EMBALAGEM: 5000}, 'porNatureza pelos saldos');
eq(Object.keys(r.abatimentos).sort(), ['RN_abc123_P1', 'RN_abc123_P3']);
eq(r.abatimentos.RN_abc123_P1, {titulo: 'P1', motivo: 'RENEGOCIACAO', valorCentavos: 20000, data: D, ref: 'fin/renegociacoes/RN_abc123'});
g = aplicar(g, r, 'renegociacoes', 'RN_abc123');
eq([sit(g, 'P1').status, sit(g, 'P1').saldoCentavos, sit(g, 'P3').status], ['RENEGOCIADO', 0, 'RENEGOCIADO'], 'originais renegociados (P1 parcialmente pago)');
const novo = sit(g, 'RNG_abc123');
eq([novo.saldoCentavos, novo.parcelas.length, novo.parcelas.map((p) => p.vencimento)], [26000, 2, ['2026-12-10', '2027-01-09']], 'título novo com as parcelas da condição');
// Recusas.
const r0 = base2();
[[{titulos: [], data: D, condicao: '30', motivo: 'xxxxx'}, 'nenhum título'], [{titulos: ['P1', 'R1'], data: D, condicao: '30', motivo: 'xxxxx'}, 'tipos diferentes'],
  [{titulos: ['P1', 'P5'], data: D, condicao: '30', motivo: 'xxxxx'}, 'parceiros diferentes'], [{titulos: ['P1', 'P4'], data: D, condicao: '30', motivo: 'xxxxx'}, 'título em lote aguardando'],
  [{titulos: ['P1', 'P1'], data: D, condicao: '30', motivo: 'xxxxx'}, 'título repetido'], [{titulos: ['P1'], data: D, motivo: 'xxxxx'}, 'sem condição e sem vencimento'],
  [{titulos: ['P1'], data: D, condicao: 'quando der', motivo: 'xxxxx'}, 'condição ilegível'], [{titulos: ['P1'], data: D, condicao: '30', descontoCentavos: 20000, motivo: 'xxxxx'}, 'desconto ≥ saldo'],
  [{titulos: ['P1'], data: D, condicao: '30', acrescimoCentavos: -1, motivo: 'xxxxx'}, 'acréscimo negativo'], [{titulos: ['P1'], data: D, condicao: '30', motivo: 'x'}, 'motivo curto'],
  [{titulos: ['NAO'], data: D, condicao: '30', motivo: 'xxxxx'}, 'título inexistente']]
  .forEach(([x, m]) => ok(!F.montarRenegociacao(r0, x, 'k1').ok, 'renegociação recusa: ' + m));
ok(!F.montarRenegociacao(g, {titulos: ['P1'], data: D, condicao: '30', motivo: 'xxxxx'}, 'k2').ok, 'título já renegociado (sem saldo): recusado');
ok(F.montarRenegociacao(r0, {titulos: ['P1'], data: D, vencimento: '2026-12-15', descontoCentavos: 500, motivo: 'acordo à vista'}, 'k3').ok, 'vencimento único com desconto');
// Desfazer.
let u = F.montarDesfazerRenegociacao(g, 'RN_abc123', {data: '2026-11-11', motivo: 'lançada errada'});
ok(u.ok, 'desfazer: ' + u.motivo);
eq(u.status, 'DESFEITA');
eq(u.abatimentos['RN_abc123_desf_P1'].valorCentavos, -20000, 'original recebe abatimento negativo');
eq(u.abatimentos['RN_abc123_desf_novo'].valorCentavos, 26000);
let gd = clone(g); gd.abatimentos = Object.assign({}, gd.abatimentos, u.abatimentos); gd.renegociacoes.RN_abc123.status = 'DESFEITA';
eq([sit(gd, 'P1').saldoCentavos, sit(gd, 'P1').status, sit(gd, 'P3').saldoCentavos, sit(gd, 'RNG_abc123').saldoCentavos, sit(gd, 'RNG_abc123').status], [20000, 'PARCIAL', 5000, 0, 'ABATIDO'], 'desfazer devolve o saldo de antes');
ok(!F.montarDesfazerRenegociacao(gd, 'RN_abc123', {data: D, motivo: 'de novo sim'}).ok, 'desfazer duas vezes: recusado');
const gPago = comBaixa(g, 'B9', {tipo: 'BAIXA', titulo: 'RNG_abc123', tituloTipo: 'PAGAR', data: D, conta: 'itau', valorCentavos: 100, liquidoCentavos: 100});
ok(!F.montarDesfazerRenegociacao(gPago, 'RN_abc123', {data: D, motivo: 'lançada errada'}).ok, 'título novo com baixa: não desfaz');
ok(!F.montarDesfazerRenegociacao(g, 'RN_abc123', {data: D, motivo: 'x'}).ok, 'desfazer exige motivo');

// Cancelamento.
let c = base2();
ok(F.podeCancelar(sit(c, 'R1'), 'INCOBRAVEL').ok);
ok(!F.podeCancelar(sit(c, 'P2'), 'ENGANO').ok, 'a pagar de recebimento: cancela em Compras');
ok(!F.podeCancelar(sit(c, 'P1'), 'INCOBRAVEL').ok, 'incobrável só a receber');
ok(!F.podeCancelar(sit(c, 'RNF'), 'ENGANO').ok, 'engano em título de NF de saída: cancela a nota no Faturamento');
ok(F.podeCancelar(sit(c, 'RNF'), 'INCOBRAVEL').ok, 'NF de saída incobrável: pode');
ok(F.podeCancelar(sit(c, 'P1'), 'ENGANO').ok, 'a pagar manual por engano: pode');
const gRen = aplicar(c, F.montarRenegociacao(c, {titulos: ['R1'], data: D, condicao: '30', motivo: 'acordo'}, 'rr1'), 'renegociacoes', 'RN_rr1');
ok(!F.podeCancelar(sit(gRen, 'RNG_rr1'), 'ENGANO').ok, 'título de renegociação não se cancela por engano: desfaz-se a renegociação');
r = F.montarCancelamento(c, {titulos: ['R1', 'RNF'], data: D, motivo: 'INCOBRAVEL', justificativa: 'cliente fechou as portas'}, 'cn1');
ok(r.ok, 'cancelamento em lote: ' + r.motivo);
eq([r.registro.tipo, r.registro.titulos, r.registro.motivo, r.registro.status], ['RECEBER', {R1: 50000, RNF: 40000}, 'INCOBRAVEL', 'ATIVO']);
eq(r.abatimentos.CN_cn1_R1, {titulo: 'R1', motivo: 'CANCELAMENTO', tipoCancelamento: 'INCOBRAVEL', valorCentavos: 50000, data: D, ref: 'fin/cancelamentos/CN_cn1'});
c = aplicar(c, r, 'cancelamentos', 'CN_cn1');
eq([sit(c, 'R1').status, sit(c, 'RNF').status, sit(c, 'R1').saldoCentavos], ['CANCELADO', 'CANCELADO', 0]);
[[{titulos: ['P1'], data: D, motivo: 'ENGANO', justificativa: 'curta'}, 'justificativa curta'], [{titulos: ['P1'], data: D, motivo: 'X', justificativa: 'lançado em duplicidade'}, 'motivo inválido'],
  [{titulos: ['P4'], data: D, motivo: 'ENGANO', justificativa: 'lançado em duplicidade'}, 'título em lote aguardando'], [{titulos: ['P1', 'R1'], data: D, motivo: 'ENGANO', justificativa: 'lançado em duplicidade'}, 'tipos misturados'],
  [{titulos: [], data: D, motivo: 'ENGANO', justificativa: 'lançado em duplicidade'}, 'nenhum título'], [{titulos: ['P2'], data: D, motivo: 'ENGANO', justificativa: 'lançado em duplicidade'}, 'a pagar de recebimento']]
  .forEach(([x, m]) => ok(!F.montarCancelamento(base2(), x, 'cn9').ok, 'cancelamento recusa: ' + m));
ok(!F.montarCancelamento(c, {titulos: ['R1'], data: D, motivo: 'INCOBRAVEL', justificativa: 'cliente fechou as portas'}, 'cn2').ok, 'já cancelado (sem saldo): recusado');
u = F.montarDesfazerCancelamento(c, 'CN_cn1', {data: '2026-11-11', motivo: 'cliente pagou'});
ok(u.ok && u.status === 'DESFEITO', 'desfazer cancelamento: ' + u.motivo);
let cd = clone(c); cd.abatimentos = Object.assign({}, cd.abatimentos, u.abatimentos); cd.cancelamentos.CN_cn1.status = 'DESFEITO';
eq([sit(cd, 'R1').saldoCentavos, sit(cd, 'R1').status, sit(cd, 'RNF').saldoCentavos], [50000, 'ABERTO', 40000], 'desfazer devolve o saldo');
ok(!F.montarDesfazerCancelamento(cd, 'CN_cn1', {data: D, motivo: 'de novo sim'}).ok, 'desfazer duas vezes: recusado');
ok(!F.montarDesfazerCancelamento(c, 'NAO', {data: D, motivo: 'cliente pagou'}).ok, 'cancelamento inexistente');
// Revisão final: renegociar título bloqueado criaria um título novo SEM o bloqueio (burla o bloqueio).
const gBl = base2(); gBl.bloqueios = {P1: {motivo: 'nota com divergência', ativo: true}};
ok(!F.montarRenegociacao(gBl, {titulos: ['P1'], data: D, condicao: '30', motivo: 'acordo'}, 'bl1').ok, 'título a pagar bloqueado não se renegocia');
ok(/bloquead/i.test(F.montarRenegociacao(gBl, {titulos: ['P1'], data: D, condicao: '30', motivo: 'acordo'}, 'bl1').motivo), 'diz que está bloqueado');
ok(F.montarCancelamento(gBl, {titulos: ['P1'], data: D, motivo: 'ENGANO', justificativa: 'lançado em duplicidade'}, 'bl2').ok, 'bloqueado pode ser cancelado (cancelar não paga)');
// Desfazer renegociação cujo título novo está num lote aguardando: recusa clara.
const gLt = aplicar(base2(), F.montarRenegociacao(base2(), {titulos: ['P3'], data: D, condicao: '30', motivo: 'acordo'}, 'lt1'), 'renegociacoes', 'RN_lt1');
gLt.lotes_pagamento.L2 = {status: 'AGUARDANDO', titulos: {RNG_lt1: 5000}};
ok(/lote/.test(F.montarDesfazerRenegociacao(gLt, 'RN_lt1', {data: D, motivo: 'lançada errada'}).motivo || ''), 'título novo em lote aguardando: não desfaz');

// Devolução segue "Abatido" (status antigo intacto).
const gDev = clone(base()); gDev.abatimentos = {A: {titulo: 'P1', motivo: 'DEVOLUCAO', valorCentavos: 30000, data: D}};
eq(sit(gDev, 'P1').status, 'ABATIDO');


eq(fs.readFileSync('public/shared/financeiro.js', 'utf8'), fs.readFileSync('functions/financeiro.js', 'utf8'), 'motor idêntico');
console.log('financeiro Entrega B (motor): ' + n + ' asserções OK');
