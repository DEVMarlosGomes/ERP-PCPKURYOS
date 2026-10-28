'use strict';
/* Testes do motor da Controladoria (public/shared/controladoria.js) — PROMPT_CONTROLADORIA.md. */
const assert = require('node:assert/strict');
const Ctl = require('./public/shared/controladoria');

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const eq = (a, b, m) => { n++; assert.equal(a, b, m); };

// ── 1. Documento balanceado ───────────────────────────────────────────────
ok(Ctl.documentoBalanceado([{ conta: 'BANCOS', debitoCentavos: 100, creditoCentavos: 0 }, { conta: 'CLIENTES', debitoCentavos: 0, creditoCentavos: 100 }]).ok, 'débito = crédito');
ok(!Ctl.documentoBalanceado([{ conta: 'BANCOS', debitoCentavos: 100, creditoCentavos: 0 }, { conta: 'CLIENTES', debitoCentavos: 0, creditoCentavos: 99 }]).ok, 'desbalanceado é recusado');
ok(!Ctl.documentoBalanceado([{ conta: 'XPTO', debitoCentavos: 1, creditoCentavos: 0 }, { conta: 'BANCOS', debitoCentavos: 0, creditoCentavos: 1 }]).ok, 'conta fora do plano é recusada');
ok(!Ctl.documentoBalanceado([{ conta: 'BANCOS', debitoCentavos: 1.5, creditoCentavos: 0 }, { conta: 'CLIENTES', debitoCentavos: 0, creditoCentavos: 1.5 }]).ok, 'só centavo inteiro');
eq(Object.keys(Ctl.planoDeContas({ plano_contas: { BANCOS: { nome: 'Bancos conta movimento', contaReferencial: '1.01.01.02.00' } } })).length, Object.keys(Ctl.PLANO_PADRAO).length, 'plano editável não perde contas');
eq(Ctl.planoDeContas({ plano_contas: { BANCOS: { tipo: 'RECEITA' } } }).BANCOS.tipo, 'ATIVO', 'o tipo da conta não se edita (protege a DRE)');

// ── 2. Base de exemplo: produção, venda, operação, financeiro ─────────────
const base = {
  ops: { 'OP-1': { lote: 'L-1', sku: 'SKU1', linha: 'Linha 01', status: 'Concluído', produzido: 1000, dataFimReal: '2026-09-10T15:00:00' },
    'OP-2': { lote: 'L-2', sku: 'SKU2', linha: 'Linha 2', status: 'Concluído', produzido: 500, dataFimReal: '2026-09-12T15:00:00' } },
  custos: {
    razao: { '2026-09': {
      e1: { tipo: 'ENTRADA_MATERIAL', natureza: 'EMBALAGEM', valorTotal: 1000, origemId: 'pc/i1' },
      e2: { tipo: 'ENTRADA_MATERIAL', natureza: 'USO_E_CONSUMO', valorTotal: 50 },
      c1: { tipo: 'CONSUMO_MATERIAL', objeto: { tipo: 'OP', id: 'OP-1' }, sku: 'SKU1', valorTotal: 600, competencia: '2026-09' },
      h1: { tipo: 'HORA_PRODUCAO', objeto: { tipo: 'OP', id: 'OP-1' }, sku: 'SKU1', valorTotal: 200, competencia: '2026-09' },
      p1: { tipo: 'PERDA', objeto: { tipo: 'OP', id: 'OP-1' }, sku: 'SKU1', valorTotal: 30, competencia: '2026-09' },
      x1: { tipo: 'ESTORNO', estornaId: '2026-09/e2' } } },
    razao_ops: { 'OP-1': { produzido: 1000, revisao: 1, lancamentos: ['2026-09/c1', '2026-09/h1', '2026-09/p1'], lp: 500 } },
    fichas: { '2026-09': { SKU2: { custoVariavel: 0.9 } } },
    taxas: { '2026-09': { custoOciosidadeMes: 12000, ocupacaoPct: 40 } },
    parametros: { impostosPct: 10 },
    operacao: { '2026-09': { folhaProducao: 3000, fixos: { a: { descricao: 'Aluguel', valor: 1000, rateio: 'PRODUCAO' }, b: { descricao: 'Contador', valor: 400, rateio: 'ADMINISTRATIVO' } } } }
  },
  agendamentos_expedicao: { car1: { cliente: 'Cliente A', clienteKey: 'c1', faturamento: {
    solicitacoes: { s: { em: '2026-09-20', itens: [{ itemKey: 'a', loteKey: 'x', sku: 'SKU1', lote: 'L-1', unidades: 800, valor: 1600, pedidoId: 'pv1' },
      { itemKey: 'b', loteKey: 'y', sku: 'SKU2', lote: 'L-2', unidades: 400, valor: 400, pedidoId: 'pv1' }, { itemKey: 'c', loteKey: 'z', sku: 'SKU3', lote: 'L-9', unidades: 100, valor: 0 }] } },
    nfs: { nf_1: { numero: '1', valor: 2000, emitidaEm: '2026-09-21' } } } } },
  resultado: { fechamentos: { '2026-09': { bonus: 300, bonusValendo: true, fechadoEm: '2026-10-02T10:00:00Z' } } },
  fin: {
    contas_bancarias: { itau: { nome: 'Itaú', saldoInicialCentavos: 500000, dataSaldoInicial: '2026-09-01' } },
    titulos: { IMP_1: { tipo: 'PAGAR', origem: { tipo: 'IMPORTACAO' }, valorCentavos: 70000, emissao: '2026-08-20', competencia: '2026-08', natureza: 'EMBALAGEM', parceiro: { tipo: 'FORNECEDOR', nome: 'Velho' } },
      REC_1: { tipo: 'PAGAR', origem: { tipo: 'RECEBIMENTO', ref: 'pcX/r1' }, valorCentavos: 100000, emissao: '2026-09-05', natureza: 'EMBALAGEM', parceiro: { nome: 'Forn' } } },
    baixas: { b1: { tipo: 'BAIXA', titulo: 'REC_1', tituloTipo: 'PAGAR', valorCentavos: 40000, jurosCentavos: 100, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 40100, data: '2026-09-25', conta: 'itau' },
      b2: { tipo: 'BAIXA', titulo: 'REC_1', tituloTipo: 'PAGAR', valorCentavos: 1000, liquidoCentavos: 1000, data: '2026-09-26', conta: 'itau' },
      b2_estorno: { tipo: 'ESTORNO', estorna: 'b2', titulo: 'REC_1', tituloTipo: 'PAGAR', valorCentavos: 1000, liquidoCentavos: 1000, data: '2026-09-27', conta: 'itau' } }
  },
  pedidos_compra: { pcX: { recebimentos: { r1: { itensRecebidos: { L1: { materialCodigo: 'EP-1', loteKey: 'AK1' } } } } } },
  estoque_lotes: { 'EP-1': { AK1: { custoFonte: 'PAGO', custoUnitario: 1 } } },
  ctl: {}
};
const esp = Ctl.documentosEsperados(base);
const docs = Object.values(esp);
ok(docs.every((d) => Ctl.documentoBalanceado(d.partidas).ok), 'todo documento derivado fecha débito = crédito');
const p = (o) => esp[o].partidas.map((x) => x.conta + (x.debitoCentavos ? '+' + x.debitoCentavos : '-' + x.creditoCentavos)).join(' ');
eq(p('RZ_2026-09_e1'), 'ESTOQUE_MATERIAIS+100000 FORNECEDORES-100000', 'entrada de material');
eq(p('RZ_2026-09_x1'), 'ESTOQUE_USO_CONSUMO-5000 FORNECEDORES+5000', 'estorno no razão de custos inverte a entrada original');
eq(esp['RZ_2026-09_c1'].partidas[0].cc, 'LINHA_1', 'consumo vai para o centro de custo da linha da OP');
eq(p('RZ_2026-09_h1'), 'PEP+20000 MOD_APLICADA-20000', 'hora apontada: PEP contra MOD aplicada');
eq(p('RZ_2026-09_p1'), 'PERDAS+3000 ESTOQUE_MATERIAIS-3000', 'perda vai para o resultado, não para o PA');
eq(p('OPPA_OP-1'), 'ESTOQUE_PA+80000 PEP-80000', 'OP concluída: consumo + hora viram PA');
// NF: receita, dedução estimada, CPV real (OP-1), padrão (ficha de SKU2) e pendente (SKU3).
const nf = esp.NF_car1_nf_1;
eq(nf.partidas.filter((x) => x.conta === 'RECEITA_BRUTA')[0].creditoCentavos, 200000, 'receita = valor da nota');
eq(nf.partidas.filter((x) => x.conta === 'DEDUCOES')[0].debitoCentavos, 20000, 'dedução = 10% estimado');
const cpv = nf.partidas.filter((x) => x.conta === 'CPV');
eq(cpv[0].debitoCentavos, 64000, 'CPV real: 800 un × R$ 0,80 (custo de PA da OP)');
eq(cpv[0].fonte, 'REAL', 'CPV real marcado');
eq(cpv[1].debitoCentavos, 36000, 'CPV padrão: 400 × R$ 0,90 da ficha congelada');
eq(cpv[1].fonte, 'PADRAO', 'CPV padrão marcado');
eq(nf.analitico.cobertura.pendente, 100, 'SKU sem OP e sem ficha: CPV pendente, nunca zero');
eq(p('OPER_2026-09_FIXO_b'), 'DESP_ADM+40000 CONTAS_PAGAR-40000', 'fixo administrativo vai para despesa, não para custo');
eq(p('PLR_2026-09'), 'PLR+30000 PLR_PAGAR-30000', 'PLR do bônus valendo');
eq(p('BANCO_itau'), 'BANCOS+500000 SALDOS_ABERTURA-500000', 'saldo inicial do banco');
eq(p('TIT_IMP_1'), 'SALDOS_ABERTURA+70000 FORNECEDORES-70000', 'título importado = saldo de abertura');
ok(!esp.TIT_REC_1, 'título de recebimento não lança de novo (a entrada já veio do razão de custos)');
eq(p('BX_b1'), 'FORNECEDORES+40000 DESP_FIN+100 BANCOS-40100', 'pagamento com juros');
eq(p('BX_b2_estorno'), 'FORNECEDORES-1000 BANCOS+1000', 'estorno da baixa inverte o pagamento');

// ── 3. Derivação: append-only, revisão e mês fechado ─────────────────────
const AG = '2026-10-05T10:00:00.000Z';
const d1 = Ctl.derivar(base, AG);
eq(d1.novos, docs.length, 'primeira passada lança todos os fatos');
// Simula o banco depois da gravação.
function aplicar(b, updates) {
  const c = JSON.parse(JSON.stringify(b));
  Object.entries(updates).forEach(([k, v]) => {
    const parts = k.split('/'); let o = c;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
    if (v === null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = v;
  });
  return c;
}
let b2 = aplicar(base, d1.updates);
const d2 = Ctl.derivar(b2, AG);
eq(Object.keys(d2.updates).length, 0, 'derivar de novo não lança nada');
// A folha foi corrigida no Custos: estorno do documento antigo + revisão 2.
b2.custos.operacao['2026-09'].folhaProducao = 3500;
const d3 = Ctl.derivar(b2, AG);
ok(d3.updates['ctl/lancamentos/2026-10/OPER_2026-09_FOLHA_r1_est'] && d3.updates['ctl/lancamentos/2026-09/OPER_2026-09_FOLHA_r2'], 'fato mudou: estorna (no mês corrente) e relança (na competência)');
b2 = aplicar(b2, d3.updates);
// Fixo removido da operação: o documento é estornado.
delete b2.custos.operacao['2026-09'].fixos.b;
const d4 = Ctl.derivar(b2, AG);
ok(d4.updates['ctl/lancamentos/2026-10/OPER_2026-09_FIXO_b_r1_est'] && d4.updates['ctl/derivados/OPER_2026-09_FIXO_b/estornado'] === true, 'fato que deixou de existir é estornado');
b2 = aplicar(b2, d4.updates);
// Mês fechado: o lançamento novo de setembro vai para outubro, citando a competência original.
b2.ctl.fechamentos = { '2026-09': { status: 'FECHADO' } };
b2.custos.operacao['2026-09'].fixos.c = { descricao: 'Energia', valor: 200, rateio: 'PRODUCAO' };
const d5 = Ctl.derivar(b2, AG);
const desloc = d5.updates['ctl/lancamentos/2026-10/OPER_2026-09_FIXO_c_r1'];
ok(desloc && desloc.competenciaOriginal === '2026-09', 'período fechado é imutável: o fato tardio entra no mês aberto');

// ── 4. DRE, CO-PA, balancete, reconciliação ───────────────────────────────
const b3 = aplicar(base, d1.updates);
const dre = Ctl.dre(b3.ctl, '2026-09', { taxas: base.custos.taxas });
const L = Object.fromEntries(dre.linhas.map((l) => [l.chave, l.valor]));
eq(L.RECEITA_BRUTA, 200000, 'DRE: receita bruta');
eq(L.RECEITA_LIQUIDA, 180000, 'DRE: receita líquida');
eq(L.MARGEM, 180000 - 64000 - 36000 - 3000, 'DRE: margem de contribuição = RL − CPV − perdas');
eq(L.CUSTO_FIXO_PRODUCAO, -(300000 + 100000 - 20000), 'DRE: folha + CIF − MOD aplicada = não absorvido');
eq(L.RESULTADO_FINANCEIRO, -100, 'DRE: juros pagos');
eq(dre.ociosidade.custoCentavos, 1200000, 'ociosidade das taxas congeladas, como memória');
ok(Math.abs(dre.coberturaCpv.pctPendente - 100 / 1300 * 100) < 0.01, 'cobertura do CPV em % das unidades vendidas');
const cp = Ctl.coPa(b3.ctl, '2026-09', 'cliente');
eq(cp[0].unidadesSemCpv, 100, 'CO-PA mostra as unidades sem CPV');
eq(cp[0].margem, null, 'cliente com CPV pendente: margem null, não inventada');
const sku1 = Ctl.coPa(b3.ctl, '2026-09', 'sku').find((x) => x.chave === 'SKU1');
eq(sku1.margem, 160000 - 16000 - 64000, 'CO-PA por SKU: receita − dedução − CPV');
eq(sku1.lpRealizado, 40000, 'ao lado, o LP realizado da OP (R$ 0,50/un × 800)');
const bal = Object.fromEntries(Ctl.balancete(b3.ctl, '2026-09').map((x) => [x.chave, x.saldoCentavos]));
eq(bal.PEP, 0, 'PEP zera quando a OP vira PA');
eq(bal.ESTOQUE_PA, 80000 - 64000 - 36000, 'PA: entrou o custo da OP, saiu o CPV (o padrão sem OP deixa o PA negativo e aparece aqui)');
const totais = Ctl.balancete(b3.ctl, '2026-09').reduce((s, x) => s + x.debitoCentavos - x.creditoCentavos, 0);
eq(totais, 0, 'balancete fecha (Σ débitos = Σ créditos)');
const rec = Ctl.reconciliacao(b3, '2026-09');
const forn = rec.find((x) => x.conta === 'FORNECEDORES');
eq(forn.financeiroCentavos, 70000 + 60000, 'Financeiro: saldo dos títulos a pagar a fornecedores');
eq(forn.razaoCentavos, 100000 + 70000 - 40000, 'razão: entradas + abertura − pagamentos (o estorno de uso e consumo sai na conta)');

// ── 5. Fechamento, ajuste e export ────────────────────────────────────────
const ck = Ctl.checklist(b3, '2026-09', AG);
ok(ck.itens.some((i) => i.chave === 'OPS' && !i.ok), 'checklist: OP-2 concluída sem custo lançado');
ok(ck.itens.some((i) => i.chave === 'CPV' && !i.ok), 'checklist: NF com CPV pendente');
ok(!Ctl.prepararFechamento(b3, '2026-09', { agora: AG }).ok, 'pendências bloqueiam o fechamento');
ok(!Ctl.prepararFechamento(b3, '2026-09', { agora: AG, forcar: true, justificativa: 'curta' }).ok, 'forçar exige justificativa');
const fc = Ctl.prepararFechamento(b3, '2026-09', { agora: AG, forcar: true, justificativa: 'Fechamento do piloto com CPV pendente documentado', por: 'ADM' });
ok(fc.ok && fc.updates['ctl/fechamentos/2026-09/status'] === 'FECHADO' && fc.updates['ctl/fechamentos/2026-09/forcado'] === true, 'fechamento forçado fica registrado');
ok(!Ctl.prepararFechamento(b3, '2026-10', { agora: AG, forcar: true, justificativa: 'mês corrente não fecha nunca' }).ok, 'mês corrente não fecha');
ok(!Ctl.validarAjuste({ data: '2026-10-01', historico: 'Reclassificação de despesa', partidas: [{ conta: 'DESP_ADM', debitoCentavos: 100 }, { conta: 'DESP_COM', creditoCentavos: 90 }] }).ok, 'ajuste desbalanceado é recusado');
ok(!Ctl.validarAjuste({ data: '2026-10-01', historico: 'curto', partidas: [{ conta: 'DESP_ADM', debitoCentavos: 100 }, { conta: 'DESP_COM', creditoCentavos: 100 }] }).ok, 'ajuste sem histórico é recusado');
ok(Ctl.validarAjuste({ data: '2026-10-01', historico: 'Reclassificação de despesa comercial', partidas: [{ conta: 'DESP_COM', debitoCentavos: 100 }, { conta: 'DESP_ADM', creditoCentavos: 100 }] }).ok, 'ajuste balanceado com histórico');
const csv = Ctl.exportarContador(b3.ctl, '2026-09').split('\r\n');
ok(csv[0].startsWith('data;documento;conta;codigo;conta_referencial') && csv.length > 20, 'export ao contador com conta referencial');
b3.ctl.orcamento = { 2026: { DESP_ADM: { ADMINISTRATIVO: { '09': 50000 } } } };
const oxr = Ctl.orcamentoXReal(b3.ctl, '2026').find((l) => l.conta === 'DESP_ADM' && l.cc === 'ADMINISTRATIVO');
eq(oxr.variacao, 40000 - 50000, 'orçamento × real por conta e centro');

console.log(`OK controladoria: ${n} asserções — documento balanceado, razão de custos/OP/NF/operação/PLR/bancos/títulos/baixas → lançamentos, CPV real/padrão/pendente, derivação append-only com revisão e mês fechado, DRE com absorção e ociosidade, CO-PA ao lado do LP, balancete, reconciliação com o Financeiro, checklist, fechamento forçado só com justificativa, ajuste e export.`);
