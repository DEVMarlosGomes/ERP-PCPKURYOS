'use strict';
/* Testes da Controladoria gerencial (public/shared/controladoria-gerencial.js):
   paridade com a Controladoria do WebMais — bloqueio de período por módulo, DRE no
   layout grupo › centro › elemento, índices gerenciais e exportação para o Domínio.
   Também cobre a ligação: callables do servidor, trava no Financeiro e no ajuste. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Ctl = require('./public/shared/controladoria');
const Ger = require('./public/shared/controladoria-gerencial');
const CtlSrv = require('./functions/controladoria_servidor');
const FinSrv = require('./functions/financeiro_servidor');

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const eq = (a, b, m) => { n++; assert.equal(a, b, m); };
const de = (a, b, m) => { n++; assert.deepEqual(a, b, m); };
function lanca(fn, re, m) { n++; assert.throws(fn, re, m); }

// ── 0. Cópia byte a byte no servidor ──────────────────────────────────────
eq(fs.readFileSync('public/shared/controladoria-gerencial.js', 'utf8'), fs.readFileSync('functions/controladoria-gerencial.js', 'utf8'), 'motor gerencial igual em public/ e functions/');
eq(fs.readFileSync('public/shared/controladoria.js', 'utf8'), fs.readFileSync('functions/controladoria.js', 'utf8'), 'motor da controladoria igual em public/ e functions/');

// ── 1. Bloqueio/Liberação de Período ─────────────────────────────────────
eq(Ger.MODULOS_BLOQUEIO.map((m) => m.nome).join('|'), 'N.F. Entrada|N.F. Saída|Movto Estoque|Movto Financ.|Movto Prod.|Movto Contábil|Movto Fiscal', 'mesmos 7 módulos da tela do WebMais');
const JUST = 'Fechamento de outubro conferido com o contador';
let v = Ger.validarBloqueio({ modulos: { FINANCEIRO: { de: '2026-11-01', ate: '2050-12-31' }, NF_ENTRADA: { de: '2010-08-04', ate: '2030-12-31' } }, justificativa: JUST });
ok(v.ok, 'janela válida');
de(Object.keys(v.modulos).sort(), ['FINANCEIRO', 'NF_ENTRADA'], 'só os módulos informados entram');
ok(!Ger.validarBloqueio({ modulos: { FINANCEIRO: { de: '2026-12-01', ate: '2026-11-01' } }, justificativa: JUST }).ok, 'início depois do fim é recusado');
ok(!Ger.validarBloqueio({ modulos: { FINANCEIRO: { de: '2026-02-30', ate: '2026-11-01' } }, justificativa: JUST }).ok, 'data inexistente é recusada');
ok(!Ger.validarBloqueio({ modulos: { FINANCEIRO: { de: '2026-11-01' } }, justificativa: JUST }).ok, 'janela pela metade é recusada');
ok(!Ger.validarBloqueio({ modulos: {}, justificativa: 'curta' }).ok, 'sem justificativa não grava');
const cfg = { modulos: v.modulos };
ok(Ger.periodoLiberado(cfg, 'FINANCEIRO', '2026-11-17').ok, 'data dentro da janela passa');
ok(!Ger.periodoLiberado(cfg, 'FINANCEIRO', '2026-10-31').ok, 'data antes da janela é bloqueada');
ok(/Movto Financ\..*01\/11\/2026/.test(Ger.periodoLiberado(cfg, 'FINANCEIRO', '2026-10-31').motivo), 'o motivo diz o módulo e a janela');
ok(Ger.periodoLiberado(cfg, 'CONTABIL', '1999-01-01').ok, 'módulo sem janela continua liberado');
ok(Ger.periodoLiberado(null, 'FINANCEIRO', '2026-01-01').ok, 'sem configuração nada muda (comportamento de hoje)');

// ── 2. Base: lançamentos reais da derivação ──────────────────────────────
const base = {
  ops: { 'OP-1': { lote: 'L-1', sku: 'SKU1', linha: 'Linha 01', status: 'Concluído', produzido: 1000, dataFimReal: '2026-09-10T15:00:00' } },
  custos: {
    razao: { '2026-09': {
      e1: { tipo: 'ENTRADA_MATERIAL', natureza: 'EMBALAGEM', valorTotal: 1000 },
      c1: { tipo: 'CONSUMO_MATERIAL', objeto: { tipo: 'OP', id: 'OP-1' }, sku: 'SKU1', valorTotal: 600, competencia: '2026-09' },
      h1: { tipo: 'HORA_PRODUCAO', objeto: { tipo: 'OP', id: 'OP-1' }, sku: 'SKU1', valorTotal: 200, competencia: '2026-09' },
      p1: { tipo: 'PERDA', objeto: { tipo: 'OP', id: 'OP-1' }, sku: 'SKU1', valorTotal: 30, competencia: '2026-09' } } },
    razao_ops: { 'OP-1': { produzido: 1000, revisao: 1, lancamentos: ['2026-09/c1', '2026-09/h1', '2026-09/p1'], lp: 500 } },
    parametros: { impostosPct: 10 },
    operacao: { '2026-09': { folhaProducao: 3000, fixos: { a: { descricao: 'Aluguel', valor: 1000, rateio: 'PRODUCAO' }, b: { descricao: 'Contador', valor: 400, rateio: 'ADMINISTRATIVO' } } } }
  },
  agendamentos_expedicao: { car1: { cliente: 'Cliente A', clienteKey: 'c1', faturamento: {
    solicitacoes: { s: { em: '2026-09-20', itens: [{ itemKey: 'a', loteKey: 'x', sku: 'SKU1', lote: 'L-1', unidades: 800, valor: 2000, pedidoId: 'pv1' }] } },
    nfs: { nf_1: { numero: '1', valor: 2000, emitidaEm: '2026-09-21' } } } } },
  fin: {
    contas_bancarias: { itau: { nome: 'Itaú', saldoInicialCentavos: 500000, dataSaldoInicial: '2026-09-01' } },
    elementos: { 1600: { nome: 'Água', grupo: '3', subgrupo: 'Administrativas', natureza: 'CUSTO_FIXO_ADM', ativo: true } },
    titulos: { MAN_1: { tipo: 'PAGAR', origem: { tipo: 'MANUAL' }, valorCentavos: 40588, emissao: '2026-09-10', competencia: '2026-09', natureza: 'CUSTO_FIXO_ADM', centroCusto: 'ADMINISTRATIVO', parceiro: { nome: 'Sabesp' } } },
    classificacoes: { MAN_1: { elemento: '1600' } },
    movimentos: { m1: { tipo: 'TARIFA', valorCentavos: 1500, data: '2026-09-15', conta: 'itau', historico: 'Tarifa' } }
  },
  ctl: {}
};
const AG = '2026-10-05T10:00:00.000Z';
function aplicar(b, updates) {
  const c = JSON.parse(JSON.stringify(b));
  Object.entries(updates).forEach(([k, val]) => {
    const parts = k.split('/'); let o = c;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
    if (val === null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = val;
  });
  return c;
}
const b1 = aplicar(base, Ctl.derivar(base, AG).updates);
const ctl = b1.ctl;
const titDoc = Ctl.docsDe(ctl, (d) => d.origem && d.origem.tipo === 'TITULO')[0];
eq(titDoc.partidas.find((p) => p.conta === 'DESP_ADM').elemento, '1600', 'título classificado leva o elemento na partida (para a DRE abrir por elemento)');

// ── 3. DRE gerencial (layout WebMais) ─────────────────────────────────────
const r = Ger.dreGerencial(ctl, { de: '2026-09', ate: '2026-09', elementos: base.fin.elementos });
ok(r.ok, 'DRE gera');
const L = (cod) => r.linhas.find((l) => l.codigo === cod);
const ref = Ctl.dre(ctl, '2026-09', {});
const R = {}; ref.linhas.forEach((l) => { R[l.chave] = l.valor; });
eq(L('1').total, 200000, 'receita bruta = nota');
eq(L('3').total, 200000 - 20000, 'receita líquida = bruta − deduções');
eq(L('7').total, R.MARGEM, 'margem de contribuição bate com a DRE existente (sem despesas variáveis no exemplo)');
eq(L('12').total, L('10').total + L('11').total, 'cascata: 12 = 10 + 11');
eq(L('12').total, R.RESULTADO, 'resultado do período = resultado do mês da DRE existente (mesmos lançamentos, outra arrumação)');
eq(L('11').total, R.RESULTADO_FINANCEIRO, 'resultado financeiro igual');
eq(L('10').total, L('7').total + L('8').total + L('9').total, 'cascata: 10 = 7 + 8 + 9');
ok(L('4').total < 0 && L('9').total < 0, 'custo e despesa saem negativos, como no WebMais');
const agua = r.linhas.find((l) => l.tipo === 'ELEMENTO' && l.chave === '1600');
ok(agua && /1600 - ÁGUA/.test(agua.rotulo), 'linha do elemento com código e nome (11.1.003 - 1600 - AGUA no WebMais)');
eq(agua.total, -40588, 'valor do elemento');
const ccAdm = r.linhas.find((l) => l.tipo === 'CENTRO' && l.cc === 'ADMINISTRATIVO' && l.codigo.indexOf('9.') === 0);
ok(ccAdm && /ADMINISTRATIVO/.test(ccAdm.rotulo), 'nível 2 = centro de custo');
ok(!r.linhas.some((l) => l.codigo === '6'), 'grupo zerado some');
ok(Ger.dreGerencial(ctl, { de: '2026-09', ate: '2026-09', mostrarZerado: true }).linhas.some((l) => l.codigo === '6'), '"mostrar zerado" mantém o grupo');
const soAdm = Ger.dreGerencial(ctl, { de: '2026-09', ate: '2026-09', cc: 'ADMINISTRATIVO' });
ok(!soAdm.linhas.some((l) => l.codigo === '1'), 'filtro de centro tira o que é de outro centro');
eq(soAdm.linhas.find((l) => l.codigo === '9').total, -40588 - 40000, 'centro administrativo: água + contador');
const tri = Ger.dreGerencial(ctl, { de: '2026-07', ate: '2026-12', periodicidade: 'TRIMESTRAL' });
eq(tri.colunas.length, 2, 'trimestral: 6 meses viram 2 colunas');
eq(tri.linhas.find((l) => l.codigo === '1').valores['2026-07'], 200000, 'setembro cai no 1º trimestre da janela');
eq(Ger.colunasDe('2026-11', '2026-11', 'MENSAL')[0].rotulo, 'Nov-2026', 'rótulo da coluna como no WebMais');
ok(!Ger.dreGerencial(ctl, { de: '2026-10', ate: '2026-09' }).ok, 'período invertido é recusado');
const vazioDre = Ger.dreGerencial({}, { de: '2026-11', ate: '2026-11' });
ok(vazioDre.ok && vazioDre.documentos === 0 && vazioDre.linhas.every((l) => Number.isFinite(l.total)), 'banco vazio: sem NaN');

// ── 4. Índices gerenciais ────────────────────────────────────────────────
const ix = Ger.calcularIndices(ctl, '2026-09', { meses: 1 });
ok(ix.ok, 'índices calculam');
eq(ix.mediaFaturamentoCentavos, 200000, 'média de faturamento (1 mês)');
eq(ix.mediaDespesaFixaCentavos, 40000 + 40588, 'despesa fixa = administrativo (contador + água)');
eq(ix.indiceDespesaFixa, Math.round(((40000 + 40588) / 200000) * 1e6) / 1e6, 'índice despesa fixa = média ÷ faturamento');
eq(ix.indiceFinanceiraFixa, 0.0075, 'tarifa bancária = financeira fixa');
eq(ix.perdaMateriaPrimaPct, Math.round((3000 / 63000) * 1e8) / 1e6, '% perda = perda ÷ saída de materiais');
const ix12 = Ger.calcularIndices(ctl, '2026-09', {});
eq(ix12.meses, 12, 'padrão: 12 meses');
eq(ix12.mediaFaturamentoCentavos, Math.round(200000 / 12), 'média divide pelos 12 meses');
const ixVazio = Ger.calcularIndices({}, '2026-11', {});
ok(ixVazio.indiceDespesaFixa === null && ixVazio.perdaMateriaPrimaPct === null && ixVazio.motivos.indices, 'sem receita: índice é "não medido" (null), nunca 0');
const vi = Ger.validarIndices({ comissaoPct: '3,5', simplesPct: 6, mediaFaturamentoKg: 1000 }, ix);
ok(vi.ok, 'percentuais informados valem');
eq(vi.registro.informados.comissaoPct, 3.5, 'vírgula decimal aceita');
eq(vi.registro.indiceDespesaFixaKg, Math.round(((40000 + 40588) / 100 / 1000) * 1e6) / 1e6, 'índice por kg com o kg informado');
ok(!Ger.validarIndices({ fretePct: 150 }, ix).ok, '% acima de 100 recusado');
ok(!Ger.validarIndices({ fretePct: -1 }, ix).ok, 'negativo recusado');

// ── 5. Exportação para o Domínio ─────────────────────────────────────────
const pares = Ger.paresDoDocumento([{ conta: 'A', debitoCentavos: 100, creditoCentavos: 0 }, { conta: 'B', debitoCentavos: 50, creditoCentavos: 0 }, { conta: 'C', debitoCentavos: 0, creditoCentavos: 120 }, { conta: 'D', debitoCentavos: 0, creditoCentavos: 30 }]);
eq(pares.reduce((s, p) => s + p.valorCentavos, 0), 150, 'decomposição em pares não perde centavo');
de(pares.map((p) => p.debito + '>' + p.credito + ':' + p.valorCentavos), ['A>C:100', 'B>C:20', 'B>D:30'], 'pares na ordem');
const semLayout = Ger.exportarDominio(ctl, '2026-09-01', '2026-09-30', {});
ok(!semLayout.ok && semLayout.inconsistencias.some((i) => /Layout não configurado/.test(i.descricao)), 'sem layout: inconsistência, como "Não Configurado" no WebMais');
ok(semLayout.texto === '', 'com inconsistência nada é exportado pela metade');
const nada = Ger.exportarDominio(ctl, '2026-11-01', '2026-11-30', { codigoEmpresa: '1' });
ok(nada.inconsistencias.some((i) => i.descricao === 'Sem movimentação de lançamentos contábeis para exportar.'), 'mesma mensagem do WebMais para período vazio');
const todas = {}; Object.keys(Ctl.PLANO_PADRAO).forEach((k, i) => { todas[k] = String(100 + i); });
const exp = Ger.exportarDominio(ctl, '2026-09-01', '2026-09-30', { codigoEmpresa: '15', historicoPadrao: '1', contas: todas });
ok(exp.ok, 'com layout completo exporta');
const totalDocs = Ctl.docsDe(ctl, (d) => String(d.data).slice(0, 7) === '2026-09').reduce((s, d) => s + d.totalCentavos, 0);
const totalLinhas = exp.linhas.reduce((s, l) => s + Math.round(Number(l.split(';')[3].replace(',', '.')) * 100), 0);
eq(totalLinhas, totalDocs, 'Σ linhas exportadas = Σ documentos do período');
ok(exp.linhas.every((l) => /^\d{2}\/\d{2}\/\d{4};\d+;\d+;\d+,\d{2};1;/.test(l)), 'formato Data;Débito;Crédito;Valor;Histórico;Complemento');
const falta = Object.assign({}, todas); delete falta.DESP_ADM;
ok(Ger.exportarDominio(ctl, '2026-09-01', '2026-09-30', { codigoEmpresa: '15', contas: falta }).inconsistencias.some((i) => /5\.1\.1/.test(i.identificador)), 'conta sem código Domínio aparece no relatório de inconsistências');

// ── 6. Ligação: servidor, Financeiro e ajuste respeitam o bloqueio ────────
const adm = { uid: 'u1', nome: 'Gustavo', role: 'admin' }, ctlUser = { uid: 'u2', nome: 'Ctl', role: 'pcp' };
const AGORA = '2026-11-17T20:00:00.000Z';
lanca(() => CtlSrv.prepararBloqueio({}, { modulos: {}, justificativa: JUST }, ctlUser, AGORA), /Só o ADM/, 'só o ADM altera o bloqueio');
const pb = CtlSrv.prepararBloqueio({}, { modulos: { FINANCEIRO: { de: '2026-11-01', ate: '2050-12-31' }, CONTABIL: { de: '2026-11-01', ate: '2050-12-31' } }, justificativa: JUST }, adm, AGORA);
eq(pb.updates['ctl/bloqueio_periodo/alteradoPor'], 'Gustavo', 'quem alterou fica gravado');
ok(Object.keys(pb.updates).some((k) => k.indexOf('ctl/bloqueio_periodo_historico/') === 0), 'cada alteração vai para o histórico');
const comBloqueio = aplicar(b1, pb.updates);
lanca(() => FinSrv.fechado(comBloqueio, '2026-10-20'), /Movto Financ\..*período bloqueado/, 'Financeiro recusa movimento fora da janela');
eq(FinSrv.fechado(comBloqueio, '2026-11-20'), false, 'dentro da janela o Financeiro segue');
eq(FinSrv.fechado(b1, '2026-10-20'), false, 'sem bloqueio configurado nada muda no Financeiro');
const aj = { chave: 'ajuste_teste_1', data: '2026-10-10', competencia: '2026-10', historico: 'Ajuste de teste do bloqueio', partidas: [{ conta: 'DESP_ADM', debitoCentavos: 100, creditoCentavos: 0 }, { conta: 'CONTAS_PAGAR', debitoCentavos: 0, creditoCentavos: 100 }] };
lanca(() => CtlSrv.prepararAjuste(comBloqueio, aj, adm, AGORA), /Movto Contábil.*período bloqueado/, 'ajuste manual fora da janela contábil é recusado');
ok(Object.keys(CtlSrv.prepararAjuste(comBloqueio, Object.assign({}, aj, { data: '2026-11-10', competencia: '2026-11' }), adm, AGORA).updates).length === 1, 'ajuste dentro da janela passa');
const pi = CtlSrv.prepararIndices(b1, { competencia: '2026-09', meses: 1, informados: { comissaoPct: 2 } }, ctlUser, AGORA);
eq(pi.updates['ctl/indices/2026-09'].mediaFaturamentoCentavos, 200000, 'servidor recalcula os índices pelo razão');
eq(pi.updates['ctl/indices/2026-09'].lancadoPor, 'Ctl', 'usuário do lançamento gravado (como no WebMais)');
const b3 = aplicar(b1, pi.updates);
ok(Object.keys(CtlSrv.prepararIndices(b3, { competencia: '2026-09', meses: 1, informados: {} }, ctlUser, AGORA).updates).some((k) => k.indexOf('ctl/indices_historico/2026-09/') === 0), 'relançar guarda o retrato anterior');

// ── 7. A4: DRE "Orçado" e "Realizado × Orçado" (Informação do WebMais) ────
const ctlOrc = Object.assign({}, ctl, { orcamento: { 2026: { RECEITA_BRUTA: { COMERCIAL: { '09': 250000 } }, DESP_ADM: { ADMINISTRATIVO: { '09': 50000 }, _: { '09': 1000 } } } } });
const so = Ger.dreGerencial(ctlOrc, { de: '2026-09', ate: '2026-09', informacao: 'ORCADO' });
eq(so.informacao, 'ORCADO', 'informação orçado');
eq(so.linhas.find((l) => l.codigo === '1').total, 250000, 'orçado: receita positiva');
eq(so.linhas.find((l) => l.codigo === '9').total, -51000, 'orçado: despesa negativa (sinal do WebMais), com o centro "_" como sem centro');
eq(so.linhas.find((l) => l.codigo === '12').total, 250000 - 51000, 'orçado: cascata até o resultado');
const cmp = Ger.dreGerencial(ctlOrc, { de: '2026-09', ate: '2026-09', informacao: 'COMPARATIVO', elementos: base.fin.elementos });
const oxr = Ctl.orcamentoXReal(ctlOrc, '2026');
const lRec = cmp.linhas.find((l) => l.tipo === 'CONTA' && l.chave === 'RECEITA_BRUTA');
const xRec = oxr.find((l) => l.conta === 'RECEITA_BRUTA' && l.cc === 'COMERCIAL');
de([lRec.total, lRec.totalOrcado], [xRec.real, xRec.orcado], 'comparativo: receita realizada e orçada iguais às da aba Orçamento × real');
eq(lRec.variacao, xRec.variacao, 'variação igual à da aba Orçamento × real');
const lAdm = cmp.linhas.find((l) => l.tipo === 'CONTA' && l.chave === 'DESP_ADM' && l.codigo.indexOf('9.') === 0);
const xAdm = oxr.find((l) => l.conta === 'DESP_ADM' && l.cc === 'ADMINISTRATIVO');
de([-lAdm.total, -lAdm.totalOrcado], [xAdm.real, xAdm.orcado], 'despesa: mesmos valores (sinal invertido, como o WebMais imprime)');
ok(!cmp.linhas.some((l) => l.tipo === 'ELEMENTO'), 'elemento não tem orçado: o comparativo fica no nível conta × centro');
const lCpv = cmp.linhas.find((l) => l.tipo === 'CONTA' && l.chave === 'CPV');
ok(lCpv && lCpv.total < 0 && lCpv.totalOrcado === 0 && lCpv.variacaoPct === null, 'conta sem orçado: orçado 0 e variação % "não medida" (null), nunca infinita');
eq(cmp.linhas.find((l) => l.codigo === '12').total, Ger.dreGerencial(ctlOrc, { de: '2026-09', ate: '2026-09' }).linhas.find((l) => l.codigo === '12').total, 'o realizado do comparativo é o mesmo da DRE realizada');

console.log(`OK controladoria gerencial: ${n} asserções — bloqueio de período por módulo (Financeiro e ajuste respeitam), DRE grupo › centro › elemento com periodicidade/filtro/zerados, índices gerenciais com "não medido", export Domínio com inconsistências.`);
