'use strict';
/* Servidor do Financeiro e da Controladoria (functions/*_servidor.js): as regras
   que só o servidor garante -- idempotência, mês fechado, segregação, ADM. */
const assert = require('node:assert/strict');
const FS = require('./functions/financeiro_servidor');
const CS = require('./functions/controladoria_servidor');

let n = 0;
function caso(nome, fn) { fn(); n++; console.log('  ok  ' + nome); }
const recusa = (fn, re) => assert.throws(fn, (e) => re.test(e.message));
const AG = '2026-10-28T12:00:00.000Z';
const adm = { uid: 'u-adm', nome: 'ADM', role: 'admin' }, fin2 = { uid: 'u-fin', nome: 'Financeiro 2', role: 'pcp' };

function base() {
  return {
    fin: {
      contas_bancarias: { itau: { nome: 'Itaú', saldoInicialCentavos: 0, dataSaldoInicial: '2026-10-01' } },
      titulos: { T1: { tipo: 'PAGAR', valorCentavos: 10000, vencimentoFixo: '2026-11-01', emissao: '2026-10-01', natureza: 'EMBALAGEM', parceiro: { nome: 'F' }, origem: { tipo: 'MANUAL' } },
        T2: { tipo: 'PAGAR', valorCentavos: 5000, vencimentoFixo: '2026-11-01', emissao: '2026-10-01', natureza: 'OUTROS', parceiro: { nome: 'G' }, origem: { tipo: 'MANUAL' } } },
      baixas: {}, conciliacoes: {},
      lotes_pagamento: { L1: { status: 'AGUARDANDO', criadoPorUid: 'u-fin', conta: 'itau', dataPagamento: '2026-10-28', titulos: { T1: 10000, T2: 5000 } } }
    },
    ctl: { fechamentos: { '2026-09': { status: 'FECHADO' } } }
  };
}

caso('baixa nasce no servidor com chave da tela (clique duplo não duplica)', () => {
  const b = base();
  const r = FS.prepararBaixa(b, { chave: 'abc123', titulo: 'T1', valorCentavos: 4000, data: '2026-10-28', conta: 'itau' }, adm, AG);
  assert.equal(r.updates['fin/baixas/BX_abc123'].liquidoCentavos, 4000);
  b.fin.baixas.BX_abc123 = r.updates['fin/baixas/BX_abc123'];
  assert.equal(FS.prepararBaixa(b, { chave: 'abc123', titulo: 'T1', valorCentavos: 4000, data: '2026-10-28', conta: 'itau' }, adm, AG).repetida, true);
});
caso('baixa com data em mês fechado na Controladoria é recusada', () => {
  recusa(() => FS.prepararBaixa(base(), { chave: 'abc124', titulo: 'T1', valorCentavos: 100, data: '2026-09-30', conta: 'itau' }, adm, AG), /fechado/);
});
caso('baixa concilia a linha do extrato e não concilia duas vezes', () => {
  const b = base();
  const r = FS.prepararBaixa(b, { chave: 'abc125', titulo: 'T1', valorCentavos: 100, data: '2026-10-28', conta: 'itau', extrato: { conta: 'itau', fitid: 'F1' } }, adm, AG);
  assert.equal(r.updates['fin/conciliacoes/itau_F1'].baixa, 'BX_abc125');
  b.fin.conciliacoes.itau_F1 = r.updates['fin/conciliacoes/itau_F1'];
  recusa(() => FS.prepararBaixa(b, { chave: 'abc126', titulo: 'T1', valorCentavos: 100, data: '2026-10-28', conta: 'itau', extrato: { conta: 'itau', fitid: 'F1' } }, adm, AG), /já foi conciliada/);
});
caso('estorno exige motivo, desfaz a conciliação e não se repete', () => {
  const b = base();
  b.fin.baixas.BX_1 = { tipo: 'BAIXA', titulo: 'T1', tituloTipo: 'PAGAR', valorCentavos: 100, liquidoCentavos: 100, data: '2026-10-20', conta: 'itau' };
  b.fin.conciliacoes.itau_F1 = { baixa: 'BX_1' };
  recusa(() => FS.prepararEstorno(b, { baixa: 'BX_1', motivo: '' }, adm, AG), /motivo/);
  const r = FS.prepararEstorno(b, { baixa: 'BX_1', motivo: 'paguei o título errado' }, adm, AG);
  assert.equal(r.updates['fin/baixas/BX_1_estorno'].tipo, 'ESTORNO');
  assert.equal(r.updates['fin/conciliacoes/itau_F1'], null);
  b.fin.baixas.BX_1_estorno = r.updates['fin/baixas/BX_1_estorno'];
  recusa(() => FS.prepararEstorno(b, { baixa: 'BX_1', motivo: 'de novo, por engano' }, adm, AG), /já foi estornada/);
});
caso('lote: quem montou não aprova; outra pessoa aprova e gera uma baixa por título', () => {
  recusa(() => FS.prepararDecisaoLote(base(), { lote: 'L1', acao: 'APROVAR' }, fin2, AG), /outra pessoa/);
  const r = FS.prepararDecisaoLote(base(), { lote: 'L1', acao: 'APROVAR' }, adm, AG);
  assert.equal(r.baixas, 2);
  assert.equal(r.updates['fin/lotes_pagamento/L1/status'], 'APROVADO');
  assert.equal(r.updates['fin/baixas/BX_LOTE_L1_T2'].valorCentavos, 5000);
});
caso('lote com título acima do saldo falha inteiro (nada gravado pela metade)', () => {
  const b = base(); b.fin.lotes_pagamento.L1.titulos.T2 = 999999;
  recusa(() => FS.prepararDecisaoLote(b, { lote: 'L1', acao: 'APROVAR' }, adm, AG), /passa do saldo/);
});
caso('títulos manuais: erro recusa o lote; importação repetida não duplica', () => {
  recusa(() => FS.prepararTitulos(base(), { titulos: [{ tipo: 'PAGAR', parceiro: '', emissao: '2026-10-01', valor: '10' }] }, adm, AG), /fornecedor/);
  const linha = { tipo: 'PAGAR', parceiro: 'Forn X', emissao: '2026-08-01', vencimento: '2026-08-30', valor: '100,00', natureza: 'EMBALAGEM' };
  const b = base();
  const r1 = FS.prepararTitulos(b, { origem: 'IMPORTACAO', titulos: [linha] }, adm, AG);
  assert.equal(r1.criados, 1);
  Object.entries(r1.updates).forEach(([k, v]) => { b.fin.titulos[k.split('/')[2]] = v; });
  assert.equal(FS.prepararTitulos(b, { origem: 'IMPORTACAO', titulos: [linha] }, adm, AG).repetidos, 1);
});
caso('título manual em mês fechado é recusado; importação de abertura não', () => {
  const linha = { tipo: 'PAGAR', parceiro: 'Forn X', emissao: '2026-09-10', valor: '10', natureza: 'OUTROS' };
  recusa(() => FS.prepararTitulos(base(), { titulos: [linha] }, adm, AG), /fechado/);
  assert.equal(FS.prepararTitulos(base(), { origem: 'IMPORTACAO', titulos: [linha] }, adm, AG).criados, 1);
});
caso('FIN-01: "2x 30/60" aceito com o mesmo resultado do cliente; condição inválida e mês fechado recusados', () => {
  const F = require('./functions/financeiro');
  const linha = { tipo: 'RECEBER', parceiro: 'Cliente A', documento: 'NF 7', emissao: '2026-10-10', valor: '100,00', condicao: '2x 30/60', natureza: 'RECEITA_VENDA' };
  const r = FS.prepararTitulos(base(), { titulos: [linha] }, adm, AG);
  assert.equal(r.criados, 1);
  const [k, t] = Object.entries(r.updates)[0];
  assert.equal(t.condicao, '30/60', 'formato gravado não muda: string canônica');
  assert.equal(k, 'fin/titulos/' + F.chaveManual(F.validarTituloManual(linha, 'MANUAL').titulo), 'mesma chave que o cliente calcula');
  assert.deepEqual(F.situacao('x', t, null, null).parcelas.map((p) => [p.n, p.de, p.vencimento, p.valorCentavos]),
    F.previaParcelas(linha).parcelas.map((p) => [p.n, p.de, p.vencimento, p.valorCentavos]), 'parcelas gravadas = prévia da tela');
  recusa(() => FS.prepararTitulos(base(), { titulos: [Object.assign({}, linha, { condicao: '2x 30/60/90' })] }, adm, AG), /3 prazos para 2 parcelas/);
  recusa(() => FS.prepararTitulos(base(), { titulos: [Object.assign({}, linha, { emissao: '2026-09-10' })] }, adm, AG), /fechado/);
});
caso('acesso: Financeiro = ADM ou módulo financeiro; Controladoria = ADM ou módulo controladoria', () => {
  assert.equal(FS.ehFinanceiro({ role: 'pcp' }), false);
  assert.equal(FS.ehFinanceiro({ role: 'pcp', modulos: { financeiro: true } }), true);
  assert.equal(CS.ehControladoria({ role: 'pcp', modulos: { custos: true } }), false);
  assert.equal(CS.ehControladoria({ role: 'admin' }), true);
});
caso('ajuste manual: mês fechado recusado, chave repetida não duplica', () => {
  const aj = { chave: 'aj0001', data: '2026-09-15', historico: 'Reclassificação de despesa comercial', partidas: [{ conta: 'DESP_COM', debitoCentavos: 100 }, { conta: 'DESP_ADM', creditoCentavos: 100 }] };
  recusa(() => CS.prepararAjuste(base(), aj, adm, AG), /fechado/);
  const b = base(); const ok = Object.assign({}, aj, { data: '2026-10-15' });
  const r = CS.prepararAjuste(b, ok, adm, AG);
  assert.ok(r.updates['ctl/lancamentos/2026-10/AJ_aj0001']);
  b.ctl.lancamentos = { '2026-10': { AJ_aj0001: r.updates['ctl/lancamentos/2026-10/AJ_aj0001'] } };
  assert.equal(CS.prepararAjuste(b, ok, adm, AG).repetido, true);
  const e = CS.prepararEstornoAjuste(b, { doc: '2026-10/AJ_aj0001', motivo: 'lançado na conta errada' }, adm, AG);
  assert.equal(e.updates['ctl/lancamentos/2026-10/AJ_aj0001_est'].partidas[0].creditoCentavos, 100);
});
caso('fechar com pendência só o ADM; reabrir só o ADM com justificativa', () => {
  recusa(() => CS.prepararFechamento(base(), { competencia: '2026-08', forcar: true, justificativa: 'qualquer coisa longa' }, fin2, AG), /Só o ADM/);
  recusa(() => CS.prepararReabertura(base(), { competencia: '2026-09', justificativa: 'corrigir o CPV de setembro' }, fin2, AG), /Só o ADM/);
  recusa(() => CS.prepararReabertura(base(), { competencia: '2026-09', justificativa: 'curta' }, adm, AG), /Justifique/);
  const r = CS.prepararReabertura(base(), { competencia: '2026-09', justificativa: 'corrigir o CPV de setembro' }, adm, AG);
  assert.equal(r.updates['ctl/fechamentos/2026-09/status'], 'REABERTO');
});

console.log(`OK gestão servidor: ${n} casos`);
