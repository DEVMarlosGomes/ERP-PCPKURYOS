'use strict';
/* Trilha B do prompt mestre (17/11/2026): o que faltava do Financeiro do WebMais.
   B3 liquidação (CB-06/07): filtros de emissão, tipo de cobrança e valor; juros, multa e desconto por
      linha; data de crédito e representante no lado a receber.
   B4 rateio com vários elementos (CP-06): linhas elemento × centro × valor; 3 elementos em 2 centros
      lançam 6 partidas que somam o título; quem tem um elemento só não muda (hash igual).
   B5 DFC (CR-03): filtro de conta, "exibir descontos" e previsto (memorando, fora do saldo).
   B6 fluxo dia a dia (CC-02): período livre de/até.
   B7 gastos (CR-08, listagem resumida) e despesas (PR-03, agrupamento, periodicidade, responsável).
   B8 lotes de pagamento por período (CB-05/CC-04). */
const assert = require('node:assert/strict');
const F = require('./functions/financeiro');
const R = require('./public/shared/financeiro-relatorios');
const Ctl = require('./functions/controladoria');
const FS = require('./functions/financeiro_servidor');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const HOJE = '2026-11-18';
function fin() {
  return {
    contas_bancarias: { itau: { nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-10-01' }, bb: { nome: 'BB', saldoInicialCentavos: 50000, dataSaldoInicial: '2026-10-01' } },
    titulos: {
      P1: { tipo: 'PAGAR', valorCentavos: 30000, vencimentoFixo: '2026-11-20', emissao: '2026-11-02', natureza: 'OUTROS', documento: 'NF 1', parceiro: { nome: 'Química SA' }, origem: { tipo: 'MANUAL' }, centroCusto: 'ADMINISTRATIVO', criadoPor: 'Ana' },
      P2: { tipo: 'PAGAR', valorCentavos: 90000, vencimentoFixo: '2026-11-25', emissao: '2026-10-10', natureza: 'CUSTO_FIXO_ADM', documento: 'NF 2', parceiro: { nome: 'Serviços SA' }, origem: { tipo: 'MANUAL' }, criadoPor: 'Bruno' },
      P3: { tipo: 'PAGAR', valorCentavos: 5000, vencimentoFixo: '2026-11-21', emissao: '2026-11-05', natureza: 'FRETE', documento: 'CT 9', parceiro: { nome: 'Transp' }, origem: { tipo: 'MANUAL' }, criadoPor: 'Ana' },
      R1: { tipo: 'RECEBER', valorCentavos: 50000, vencimentoFixo: '2026-11-20', emissao: '2026-11-02', natureza: 'RECEITA_VENDA', documento: 'NF 501', parceiro: { nome: 'Marca Bela' }, origem: { tipo: 'MANUAL' } }
    },
    classificacoes: { P1: { elemento: '301', formaPagamento: 'BOLETO' }, P3: { elemento: '204', formaPagamento: 'PIX' } },
    baixas: {
      b1: { titulo: 'P1', tituloTipo: 'PAGAR', tipo: 'BAIXA', valorCentavos: 1000, descontoCentavos: 200, jurosCentavos: 0, multaCentavos: 0, liquidoCentavos: 800, conta: 'itau', data: '2026-10-15', natureza: 'OUTROS' },
      b2: { titulo: 'R1', tituloTipo: 'RECEBER', tipo: 'BAIXA', valorCentavos: 1000, descontoCentavos: 50, jurosCentavos: 0, multaCentavos: 0, liquidoCentavos: 950, conta: 'bb', data: '2026-10-20', natureza: 'RECEITA_VENDA' }
    },
    movimentos: { m1: { tipo: 'TRANSFERENCIA', valorCentavos: 10000, conta: 'itau', destino: 'bb', data: '2026-10-25' } },
    adiantamentos: {}, parametros: {}, elementos: {},
    lotes_pagamento: {
      L1: { titulos: { P1: 30000 }, conta: 'itau', dataPagamento: '2026-11-20', criadoEm: '2026-11-18T10:00:00Z', criadoPor: 'Ana', status: 'AGUARDANDO' },
      L2: { titulos: { P3: 5000, P2: 1000 }, conta: 'bb', dataPagamento: '2026-10-31', criadoEm: '2026-10-30T10:00:00Z', criadoPor: 'Ana', status: 'RECUSADO', motivo: 'sem saldo', decididoPor: 'Gu', decididoEm: '2026-10-30T12:00:00Z' }
    }
  };
}

// ── B6: fluxo dia a dia com período livre ─────────────────────────────────
const fl = F.fluxoCaixa({ fin: fin() }, HOJE, { granularidade: 'DIA', de: '2026-11-10', ate: '2026-11-30' });
eq([fl.colunas.length, fl.colunas[0].inicio, fl.colunas[fl.colunas.length - 1].inicio], [21, '2026-11-10', '2026-11-30'], 'B6: de/até escolhidos, um dia por coluna');
ok(fl.colunas.filter((c) => c.passada).length === 8 && !fl.colunas.find((c) => c.inicio === HOJE).passada, 'B6: antes de hoje é realizado; de hoje em diante, projetado');
eq(fl.colunas.find((c) => c.inicio === '2026-11-20').saidas, 29000, 'B6: o vencimento do dia 20 (aberto, depois da baixa parcial) cai na coluna do dia 20');
ok(F.fluxoCaixa({ fin: fin() }, HOJE, { granularidade: 'DIA' }).colunas.length === F.fluxoCaixa({ fin: fin() }, HOJE, { granularidade: 'DIA', de: '2026-12-01', ate: '2026-11-01' }).colunas.length, 'B6: período inválido cai na janela padrão');

// ── B8: lotes por período ─────────────────────────────────────────────────
let rl = R.relLotes(fin(), { de: '2026-10-01', ate: '2026-11-30' });
eq([rl.linhas.length, rl.totais.valor], [2, 36000], 'B8: lotes do período com o total');
rl = R.relLotes(fin(), { de: '2026-11-01', ate: '2026-11-30', data: 'PAGAMENTO' });
eq(rl.linhas.map((l) => l.status), ['Aguardando aprovação'], 'B8: pela data de pagamento');
eq(R.relLotes(fin(), { de: '2026-10-01', ate: '2026-11-30', status: 'RECUSADO' }).linhas.map((l) => [l.motivo, l.titulos]), [['sem saldo', 2]], 'B8: filtro de situação, motivo e nº de títulos');
ok(/360,00/.test(F.relatorioCsv(R.relLotes(fin(), { de: '2026-10-01', ate: '2026-11-30' }))), 'B8: CSV do relatório traz o total');

// ── B4: rateio com vários elementos ───────────────────────────────────────
const f4 = fin(), sitP2 = F.carteira(f4).find((s) => s.id === 'P2');
const linhas = [{ elemento: '301', centro: 'ADMINISTRATIVO', valorCentavos: 20000 }, { elemento: '301', centro: 'COMERCIAL', valorCentavos: 10000 },
  { elemento: '302', centro: 'ADMINISTRATIVO', valorCentavos: 25000 }, { elemento: '302', centro: 'COMERCIAL', valorCentavos: 5000 },
  { elemento: '2113', centro: 'ADMINISTRATIVO', valorCentavos: 18000 }, { elemento: '2113', centro: 'COMERCIAL', valorCentavos: 12000 }];
let vc = F.validarClassificacao(sitP2, { linhas, formaPagamento: 'TED' }, f4);
ok(vc.ok && vc.registro.linhas.length === 6, 'B4: 3 elementos em 2 centros aceitos');
ok(!F.validarClassificacao(sitP2, { linhas: linhas.slice(1) }, f4).ok, 'B4: linhas que não somam o título são recusadas');
ok(/duas vezes/.test(F.validarClassificacao(sitP2, { linhas: linhas.concat([linhas[0]]).map((l, i) => i === 6 ? l : l) }, f4).motivo || ''), 'B4: elemento × centro repetido recusado');
ok(/receita/.test(F.validarClassificacao(sitP2, { linhas: [{ elemento: '101', centro: 'ADMINISTRATIVO', valorCentavos: 90000 }] }, f4).motivo), 'B4: elemento de receita não classifica título a pagar');
const um = F.validarClassificacao(sitP2, { linhas: [{ elemento: '301', centro: 'ADMINISTRATIVO', valorCentavos: 90000 }] }, f4);
eq(um.registro, F.validarClassificacao(sitP2, { elemento: '301', rateio: [{ centro: 'ADMINISTRATIVO', percentual: 100 }] }, f4).registro, 'B4: uma linha só grava no formato de antes (hash igual)');
f4.classificacoes.P2 = vc.registro;
const partes = F.partesDoTitulo(f4, 'P2', 90000);
eq([partes.length, partes.reduce((s, p) => s + p.valorCentavos, 0)], [6, 90000], 'B4: 6 partes que somam o título');
const parcial = F.partesDoTitulo(f4, 'P2', 1001);
eq(parcial.reduce((s, p) => s + p.valorCentavos, 0), 1001, 'B4: baixa parcial reparte sem perder centavo');
// Controladoria: o título manual lança 6 partidas de despesa
const docs = Ctl.documentosEsperados({ fin: f4, ctl: {} });
const docP2 = Object.values(docs).find((d) => d.origem && d.origem.tipo === 'TITULO' && /P2/.test(JSON.stringify(d.origem)));
const desp = docP2.partidas.filter((p) => p.debitoCentavos > 0);
eq([desp.length, desp.reduce((s, p) => s + p.debitoCentavos, 0)], [6, 90000], 'B4: Controladoria lança 6 partidas que somam o título');
ok(desp.some((p) => p.elemento === '2113' && p.cc === 'COMERCIAL' && p.debitoCentavos === 12000), 'B4: cada partida com elemento e centro');
const docsAntes = Ctl.documentosEsperados({ fin: fin(), ctl: {} }), f4b = fin(); f4b.classificacoes.P2 = um.registro;
const docsUm = Ctl.documentosEsperados({ fin: f4b, ctl: {} }), f4c = fin(); f4c.classificacoes.P2 = F.validarClassificacao(sitP2, { elemento: '301', rateio: [{ centro: 'ADMINISTRATIVO', percentual: 100 }] }, f4).registro;
eq(Object.keys(docsUm).map((k) => docsUm[k].hash), Object.keys(Ctl.documentosEsperados({ fin: f4c, ctl: {} })).map((k) => docsUm[k].hash), 'B4: um elemento só, pelo caminho novo ou pelo antigo, dá o mesmo hash');
ok(Object.keys(docsAntes).filter((k) => !/P2/.test(k)).every((k) => docsUm[k] && docsUm[k].hash === docsAntes[k].hash), 'B4: os outros títulos não re-derivam');
// Servidor aceita e grava as linhas
const srv = FS.prepararClassificacao({ fin: fin() }, { titulo: 'P2', linhas, formaPagamento: 'TED' }, { uid: 'u', nome: 'Ana' }, '2026-11-18T10:00:00Z');
eq(srv.updates['fin/classificacoes/P2'].linhas.length, 6, 'B4: servidor grava a classificação com as linhas');

// ── B5: DFC com conta, descontos e previsto ───────────────────────────────
const d0 = F.dfc(fin(), '2026-10', '2026-11');
ok(!d0.grupos.some((g) => g.linhas.some((l) => l.natureza === 'TRANSFERENCIA')), 'B5: sem conta, transferência fica fora (interna)');
const dI = F.dfc(fin(), '2026-10', '2026-11', { conta: 'itau' });
const tr = dI.grupos.reduce((a, g) => a.concat(g.linhas), []).find((l) => l.natureza === 'TRANSFERENCIA');
eq(tr.meses['2026-10'], -10000, 'B5: com a conta Itaú, a transferência que saiu dela aparece');
ok(dI.colunas.every((c) => c.confere), 'B5: saldo só da conta escolhida, e confere com o banco');
eq(dI.colunas[0].saldoInicialCentavos, 0, 'B5: a conta abriu em outubro (saldo de abertura, não fluxo)');
const dD = F.dfc(fin(), '2026-10', '2026-11', { exibirDescontos: true });
eq([dD.memorandos[0].meses['2026-10'], dD.memorandos[1].meses['2026-10']], [200, 50], 'B5: descontos obtidos e concedidos em memorando');
eq(dD.colunas.map((c) => c.variacaoCentavos), d0.colunas.map((c) => c.variacaoCentavos), 'B5: memorando não mexe na variação do caixa');
const basePrev = { fin: fin(), pedidos_compra: { pc1: { status: 'APROVADO', numero: 'PC-1', itens: { a: { quantidade: 10, precoUnitario: 100, valorTotal: 1000 } }, condicaoPagamento: '30', dataPrevistaEntrega: '2026-10-25', fornecedor: 'X' } } };
const dP = F.dfc(fin(), '2026-10', '2026-12', { base: basePrev });
ok(dP.memorandos.some((m) => m.chave === 'PREV_COMPRAS') && dP.memorandos.some((m) => m.chave === 'PREV_VENDAS'), 'B5: previsto de pedidos de venda e ordens de compra em memorando');
const rd = F.relDfc(fin(), { de: '2026-10', ate: '2026-11', conta: 'itau', exibirDescontos: true });
ok(/conta Itaú/.test(rd.titulo) && rd.linhas.some((l) => /Memorando — Descontos obtidos/.test(l.linha)), 'B5: relatório com a conta no título e os memorandos');

// ── B3: liquidação ────────────────────────────────────────────────────────
const lq = (o) => F.parcelasParaLiquidar(fin(), Object.assign({ tipo: 'PAGAR', hoje: HOJE }, o)).map((l) => l.titulo);
eq(lq({ emissaoDe: '2026-11-01' }).sort(), ['P1', 'P3'], 'B3: emissão de');
eq(lq({ emissaoAte: '2026-10-31' }), ['P2'], 'B3: emissão até');
eq(lq({ forma: 'PIX' }), ['P3'], 'B3: tipo de cobrança');
eq(lq({ valorDe: 10000, valorAte: 50000 }), ['P1'], 'B3: valor de/até da parcela');
const ml = F.montarLiquidacao(fin(), { itens: [{ titulo: 'P1', valorCentavos: 29000, jurosCentavos: 300, multaCentavos: 100, descontoCentavos: 0 }, { titulo: 'P3', valorCentavos: 5000, descontoCentavos: 500 }], data: HOJE, conta: 'itau' });
ok(ml.ok, 'B3: liquidação com acréscimos por linha: ' + (ml.motivo || ''));
eq(ml.baixas.map((b) => [b.titulo, b.registro.jurosCentavos, b.registro.multaCentavos, b.registro.descontoCentavos, b.registro.liquidoCentavos]), [['P1', 300, 100, 0, 29400], ['P3', 0, 0, 500, 4500]], 'B3: juros, multa e desconto por linha no líquido');
ok(!F.montarLiquidacao(fin(), { itens: [{ titulo: 'P1', valorCentavos: 1000, jurosCentavos: -1 }], data: HOJE, conta: 'itau' }).ok, 'B3: acréscimo negativo recusado');
const mr = F.montarLiquidacao(fin(), { itens: [{ titulo: 'R1', valorCentavos: 49000 }], data: HOJE, conta: 'bb', dataCredito: '2026-11-19', representante: 'João Rep' });
eq([mr.baixas[0].registro.dataCredito, mr.baixas[0].registro.representante], ['2026-11-19', 'João Rep'], 'B3: data de crédito e representante no lado a receber');
ok(!F.montarLiquidacao(fin(), { itens: [{ titulo: 'R1', valorCentavos: 1000 }], data: HOJE, conta: 'bb', dataCredito: '2026-11-01' }).ok, 'B3: crédito antes da movimentação recusado');
const sl = FS.prepararLiquidacao({ fin: fin(), ctl: {} }, { chave: 'liquida-teste-1', itens: [{ titulo: 'R1', valorCentavos: 1000 }], data: HOJE, conta: 'bb', dataCredito: '2026-11-20', representante: 'João' }, { uid: 'u', nome: 'Ana' }, '2026-11-18T10:00:00Z');
ok(Object.values(sl.updates).some((b) => b && b.dataCredito === '2026-11-20' && b.representante === 'João'), 'B3: o servidor grava data de crédito e representante');

// ── B7: gastos resumidos e despesas agrupadas ─────────────────────────────
const g1 = R.relGastosCentroCusto(fin(), { de: '2026-10-01', ate: '2026-11-30' }), g2 = R.relGastosCentroCusto(fin(), { de: '2026-10-01', ate: '2026-11-30', resumido: true });
eq(g2.totais.valor, g1.totais.valor, 'B7: resumida soma o mesmo que a analítica');
ok(g2.linhas.every((l) => !/^NF |^CT /.test(l.documento || '')) && g2.linhas.length < g1.linhas.length, 'B7: resumida sem os documentos');
const dsp = R.relLancamentoDespesas(fin(), { de: '2026-10-01', ate: '2026-11-30', agrupar: 'RESPONSAVEL', periodicidade: 'MES' });
const subt = dsp.linhas.filter((l) => l.destaque);
eq(subt.map((l) => l.documento), ['Subtotal 10/2026 · Bruno', 'Subtotal 11/2026 · Ana'], 'B7: subtotal por mês e responsável');
eq(subt.map((l) => l.subtotal), [90000, 35000], 'B7: valores dos subtotais');
eq(dsp.totais.valor, 125000, 'B7: o total continua a soma das linhas (subtotal em coluna própria)');
ok(!('subtotal' in dsp.totais), 'B7: subtotal não entra no total');

console.log(`financeiro trilha B (WebMais): ${n} asserções OK — B3 liquidação, B4 rateio multi-elemento, B5 DFC, B6 fluxo de/até, B7 gastos e despesas, B8 lotes.`);
