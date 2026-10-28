'use strict';
/* Testes do motor do Financeiro (public/shared/financeiro.js) — PROMPT_FINANCEIRO.md. */
const assert = require('node:assert/strict');
const F = require('./public/shared/financeiro');

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const eq = (a, b, m) => { n++; assert.equal(a, b, m); };
const deq = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

// ── 1. Condição de pagamento: os formatos reais da base (28/10) ───────────
const dias = (c) => { const r = F.lerCondicao(c); return r.ok ? r.partes.map((p) => p.dias + ':' + Math.round(p.pct * 100) / 100 + ':' + p.tipo).join(' ') : 'X'; };
eq(dias('28'), '28:100:PRAZO', '"28" (PC)');
eq(dias('28/42'), '28:50:PRAZO 42:50:PRAZO', '"28/42" (cotação)');
eq(dias('0'), '0:100:A_VISTA', '"0" é à vista');
eq(dias('30 DIAS'), '30:100:PRAZO', '"30 DIAS"');
eq(dias('15/30/45/60'), '15:25:PRAZO 30:25:PRAZO 45:25:PRAZO 60:25:PRAZO', '4 parcelas iguais');
eq(dias('20% A VISTA, 30/45'), '0:20:A_VISTA 30:40:PRAZO 45:40:PRAZO', '% fixa a fatia, o resto se divide');
eq(dias('20 % Sinal / 10 / 30'), '0:20:SINAL 10:40:PRAZO 30:40:PRAZO', 'sinal com espaço antes do %');
eq(dias('90% pedido/10% entrega'), '0:90:SINAL 0:10:ENTREGA', 'pedido = sinal');
ok(F.lerCondicao('20% sinal / 10 / 30').avisos.length === 1, 'sinal leva aviso (pode ter sido pago antes da nota)');
eq(dias('ST a vista, restante 30 / 45 / 60'), 'X', 'o que não se entende não é adivinhado');
eq(F.lerCondicao('').motivo, 'sem condição de pagamento', 'vazio tem motivo');
eq(dias('60% / 50%'), 'X', 'percentuais acima de 100%');
eq(dias('30% / 30%'), 'X', 'percentuais que não fecham 100%');

// ── 2. Parcelas: centavo nunca some ───────────────────────────────────────
const p3 = F.parcelas('30/60/90', '2026-10-01', 10000);
deq(p3.parcelas.map((p) => p.valorCentavos), [3333, 3333, 3334], 'última absorve o arredondamento');
deq(p3.parcelas.map((p) => p.vencimento), ['2026-10-31', '2026-11-30', '2026-12-30'], 'vencimento = base + dias');
ok(!F.parcelas('30', '', 100).ok, 'sem data base: sem parcela');
eq(F.centavos('1.234,56'), 123456, 'valor BR');
eq(F.centavos('1234.56'), 123456, 'valor com ponto decimal');
eq(F.centavos(12.345), 1235, 'número arredonda ao centavo');
eq(F.centavos(''), null, 'vazio é null, não zero');

// ── 3. Recebimentos -> títulos a pagar ────────────────────────────────────
const pcs = {
  pcK: { numeroFormatado: 'PC-0001', fornecedorKey: 'f1', fornecedorNome: 'Forn Um', condicaoPagamento: '28', prazoPagamentoParcelas: [28, 42], status: 'RECEBIDO_TOTAL',
    itens: { i1: { materialCodigo: 'EP-1', precoUnit: 2, qtd: 100, unidade: 'un' }, i2: { materialCodigo: 'MPGR-1', precoUnit: 10, qtd: 5, unidade: 'kg' } },
    recebimentos: { r1: { data: '2026-10-01', notaFiscal: '123', status: 'ATIVO',
      itensRecebidos: { L001: { itemKey: 'i1', materialCodigo: 'EP-1', loteKey: 'AK1', qtdRecebidaAgora: 100 }, L002: { itemKey: 'i2', materialCodigo: 'MPGR-1', loteKey: 'AK2', qtdRecebidaAgora: 5 } },
      devolucoes: { d1: { linhaKey: 'L001', quantidade: 10, em: '2026-10-05T10:00:00Z' } } } } },
  pcCli: { numeroFormatado: 'PC-0002', fornecedorKey: 'f1', propriedade: { tipo: 'CLIENTE', clienteKey: 'c1' }, status: 'RECEBIDO_TOTAL',
    itens: { i1: { materialCodigo: 'EP-9', qtd: 10, vinculo: { clienteKey: 'c1', pedidos: ['1'] } } },
    recebimentos: { r1: { data: '2026-10-02', status: 'ATIVO', itensRecebidos: { L001: { itemKey: 'i1', materialCodigo: 'EP-9', loteKey: 'AK3', qtdRecebidaAgora: 10 } } } } },
  pcSem: { numeroFormatado: 'PC-0003', fornecedorKey: 'f2', status: 'RECEBIDO_TOTAL', itens: { i1: { materialCodigo: 'MPES-1', qtd: 5 } },
    recebimentos: { r1: { data: '2026-10-03', notaFiscal: '9', status: 'ATIVO', itensRecebidos: { L001: { itemKey: 'i1', materialCodigo: 'MPES-1', loteKey: 'AK4', qtdRecebidaAgora: 5 } } } } },
  pcCanc: { numeroFormatado: 'PC-0004', fornecedorKey: 'f2', origemProcessoCotacaoKey: 'cot1', status: 'ENVIADO', itens: { i1: { materialCodigo: 'EP-2', precoUnit: 1, qtd: 50 } },
    recebimentos: { r1: { data: '2026-10-04', status: 'CANCELADO', itensRecebidos: { L001: { itemKey: 'i1', materialCodigo: 'EP-2', loteKey: 'AK5', qtdRecebidaAgora: 50 } } } } }
};
const base = { pedidos_compra: pcs, fornecedores: { f1: { razaoSocial: 'FORNECEDOR UM LTDA', cnpj: '1' } },
  processos_cotacao: { cot1: { fornecedorVencedorConvidadoKey: 'x', fornecedoresConvidados: { x: { condicaoPagamento: '30' } } } },
  estoque_lotes: { 'EP-1': { AK1: { custoFonte: 'PAGO', custoUnitario: 2.5 } }, 'EP-9': { AK3: { custoFonte: 'CLIENTE', custoUnitario: 0 } } }, fin: {} };
const r = F.derivarRecebimentos(base);
const t1 = r.titulos.REC_pcK_r1;
eq(t1.valorCentavos, 100 * 250 + 5 * 1000, 'custo do LOTE quando gravado (2,50), senão o do PC (10,00)');
deq(t1.porNatureza, { EMBALAGEM: 25000, MATERIA_PRIMA: 5000 }, 'valor por natureza (contrato com a Controladoria)');
eq(t1.condicao, '28/42', 'condição do PC pelas parcelas');
eq(t1.parceiro.nome, 'FORNECEDOR UM LTDA', 'parceiro do cadastro');
ok(!r.titulos.REC_pcCli_r1, 'material do cliente não gera conta a pagar');
ok(!F.derivarRecebimentos(Object.assign({}, base, { estoque_lotes: {} })).titulos.REC_pcCli_r1, 'dono vem do PC mesmo sem o lote (recebimento antigo)');
ok(!r.titulos.REC_pcSem_r1 && r.complementos.some((c) => c.id === 'REC_pcSem_r1' && c.tipo === 'SEM_VALOR'), 'sem preço: complemento, nunca título de zero');
eq(r.abatimentos.REC_pcK_r1_dev_d1.valorCentavos, 10 * 250, 'devolução abate a parte devolvida ao custo da entrada');
eq(r.titulos.REC_pcCanc_r1.condicao, '30', 'sem condição no PC: a da proposta vencedora da cotação');
eq(r.abatimentos.REC_pcCanc_r1_cancel.valorCentavos, 5000, 'cancelamento abate o título inteiro');
// Derivar de novo com o que já existe não cria nada (append-only, chave determinística).
const d1 = F.derivar(base);
const d2 = F.derivar(Object.assign({}, base, { fin: { titulos: d1.titulos, abatimentos: d1.abatimentos } }));
eq(Object.keys(d2.titulos).length + Object.keys(d2.abatimentos).length, 0, 'derivar duas vezes não duplica');

// ── 4. NF de saída -> título a receber ────────────────────────────────────
const agendas = { a1: { cliente: 'Cliente A', clienteKey: 'c1', faturamento: {
  solicitacoes: { s1: { em: '2026-10-10', totalValor: 2000, itens: [{ itemKey: 'p1', loteKey: 'l1', sku: 'SKU1', lote: 'L-1', unidades: 100, valor: 1500, pedidoId: 'pv1' }, { itemKey: 'p2', loteKey: 'l2', sku: 'SKU2', lote: 'L-2', unidades: 50, valor: 500, pedidoId: 'pv1' }] } },
  nfs: { nf_1: { numero: '1', valor: 1000, emitidaEm: '2026-10-11', paletes: ['p1/l1', 'p2/l2'] }, nf_2: { numero: '2', valor: 0, emitidaEm: '2026-10-11' } } } } };
const bNf = { agendamentos_expedicao: agendas, pedidos_comerciais: { pv1: { prazoPagamento: '30/60', totalValor: 5000 } }, clientes: { c1: { razaoSocial: 'CLIENTE A SA', condicaoPagamento: '15' } } };
const rn = F.derivarNfs(bNf);
const tn = rn.titulos.NF_a1_nf_1;
eq(tn.valorCentavos, 100000, 'título = valor da nota');
eq(tn.condicao, '30/60', 'condição do pedido comercial antes da do cliente');
eq(tn.itens.length, 2, 'itens da nota pelos paletes');
ok(rn.complementos.some((c) => c.tipo === 'SEM_VALOR' && c.id === 'NF_a1_nf_2'), 'NF sem valor: complemento');
ok(rn.complementos.some((c) => c.tipo === 'DIFERENCA_FISCAL' && c.valorCentavos === 100000), 'pedido R$ 2.000 × nota R$ 1.000: diferença fiscal aparece, não some');

// ── 5. Recorrentes da operação do mês e PLR ───────────────────────────────
const bOp = { custos: { operacao: { '2026-09': { folhaProducao: 60000, fixos: { a: { descricao: 'Aluguel', valor: 25000, rateio: 'PRODUCAO' }, b: { descricao: 'Contabilidade', valor: 3000, rateio: 'ADMINISTRATIVO' } } } } },
  resultado: { fechamentos: { '2026-09': { bonus: 5000, bonusValendo: true, fechadoEm: '2026-10-02T10:00:00Z' }, '2026-08': { bonus: 4000, bonusValendo: false } } }, fin: {} };
const ro = F.derivarRecorrentes(bOp);
eq(ro.titulos['OPER_2026-09_FOLHA'].valorCentavos, 6000000, 'folha da produção');
eq(ro.titulos['OPER_2026-09_FOLHA'].vencimentoFixo, '2026-10-05', 'folha vence no 5º dia do mês seguinte (padrão)');
eq(ro.titulos['OPER_2026-09_FIXO_b'].natureza, 'CUSTO_FIXO_ADM', 'fixo administrativo');
ok(ro.titulos['PLR_2026-09'] && !ro.titulos['PLR_2026-08'], 'PLR só quando o bônus está valendo');
// Folha corrigida depois: o título não muda; nasce ajuste (a mais) ou abatimento (a menos).
const bOp2 = JSON.parse(JSON.stringify(bOp)); bOp2.fin = { titulos: ro.titulos }; bOp2.custos.operacao['2026-09'].folhaProducao = 62000;
const ro2 = F.derivarRecorrentes(bOp2);
eq(ro2.titulos['OPER_2026-09_FOLHA_aj_6200000'].valorCentavos, 200000, 'folha a mais: título de ajuste pela diferença');
const bOp3 = JSON.parse(JSON.stringify(bOp)); bOp3.fin = { titulos: ro.titulos }; bOp3.custos.operacao['2026-09'].folhaProducao = 59000;
eq(F.derivarRecorrentes(bOp3).abatimentos['OPER_2026-09_FOLHA_aj_5900000'].valorCentavos, 100000, 'folha a menos: abatimento');

// ── 6. Situação: parcelas, baixa parcial, estorno ─────────────────────────
const tit = { tipo: 'PAGAR', valorCentavos: 10000, condicao: '30/60', baseVencimento: '2026-10-01', natureza: 'EMBALAGEM', parceiro: { nome: 'X' } };
let s = F.situacao('T1', tit, null, null);
eq(s.status, 'ABERTO', 'sem baixa: aberto');
deq(s.abertas.map((p) => p.abertoCentavos), [5000, 5000], 'duas parcelas abertas');
const fin1 = { titulos: { T1: tit }, baixas: { b1: { tipo: 'BAIXA', titulo: 'T1', tituloTipo: 'PAGAR', valorCentavos: 6000, liquidoCentavos: 6000, data: '2026-10-31', conta: 'itau' } } };
s = F.situacao('T1', tit, F.movimentosPorTitulo(fin1).T1, null);
eq(s.status, 'PARCIAL', 'baixa parcial');
deq(s.abertas.map((p) => [p.n, p.abertoCentavos]), [[2, 4000]], 'a baixa quita a parcela mais antiga primeiro');
fin1.baixas.b1_estorno = Object.assign({}, fin1.baixas.b1, { tipo: 'ESTORNO', estorna: 'b1' });
eq(F.situacao('T1', tit, F.movimentosPorTitulo(fin1).T1, null).saldoCentavos, 10000, 'estorno devolve o saldo');
const semCond = F.situacao('T2', Object.assign({}, tit, { condicao: null }), null, null);
ok(semCond.semVencimento && !semCond.abertas.length, 'sem condição: sem vencimento (vai para complementos)');
eq(F.situacao('T2', Object.assign({}, tit, { condicao: null }), null, { condicao: '10' }).abertas[0].vencimento, '2026-10-11', 'condição informada no Financeiro completa o título');

// ── 7. Validações de baixa, estorno e lote ────────────────────────────────
const contas = { itau: { nome: 'Itaú' } };
const sit = F.situacao('T1', tit, null, null);
ok(!F.validarBaixa(sit, { valorCentavos: 20000, data: '2026-10-31', conta: 'itau' }, contas).ok, 'baixa acima do saldo é recusada');
ok(!F.validarBaixa(sit, { valorCentavos: 100, data: '2026-10-31', conta: 'bb' }, contas).ok, 'conta inexistente');
ok(!F.validarBaixa(Object.assign({}, sit, { bloqueio: { motivo: 'nota com defeito' } }), { valorCentavos: 100, data: '2026-10-31', conta: 'itau' }, contas).ok, 'título bloqueado não se paga');
const vb = F.validarBaixa(sit, { valorCentavos: 5000, jurosCentavos: 50, descontoCentavos: 10, data: '2026-10-31', conta: 'itau' }, contas);
eq(vb.registro.liquidoCentavos, 5040, 'líquido = principal + juros + multa − desconto');
ok(!F.validarEstorno(fin1.baixas, 'b1').ok, 'baixa já estornada não se estorna de novo');
ok(!F.validarAprovacaoLote({ status: 'AGUARDANDO', criadoPorUid: 'u1', titulos: { T1: 100 } }, 'u1').ok, 'quem montou o lote não aprova');
ok(F.validarAprovacaoLote({ status: 'AGUARDANDO', criadoPorUid: 'u1', titulos: { T1: 100 } }, 'u2').ok, 'outra pessoa aprova');

// ── 8. Títulos manuais e planilha de abertura ─────────────────────────────
const pl = F.lerPlanilhaTitulos('tipo;parceiro;cnpj;documento;emissao;vencimento;valor;natureza\nPAGAR;Fornecedor Z;123;NF 9;01/10/2026;31/10/2026;1.234,56;EMBALAGEM\nRECEBER;;;;01/10/2026;;10;\nXX;A;;;01/10/2026;;10;');
eq(pl.titulos.length, 1, 'uma linha válida');
eq(pl.titulos[0].valorCentavos, 123456, 'valor BR na planilha');
eq(pl.titulos[0].vencimentoFixo, '2026-10-31', 'vencimento informado');
eq(pl.erros.length, 2, 'linhas inválidas com motivo');
eq(F.chaveManual(pl.titulos[0]), F.chaveManual(Object.assign({}, pl.titulos[0])), 'a mesma linha tem a mesma chave (importar de novo não duplica)');
ok(!F.validarTituloManual({ tipo: 'PAGAR', parceiro: 'A', emissao: '2026-10-01', valor: '10', natureza: 'QUALQUER' }).ok, 'natureza fora da lista');

// ── 9. Bancos, fluxo de caixa, aging, prazos ──────────────────────────────
const finF = { contas_bancarias: { itau: { nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-10-01' } },
  titulos: { P1: { tipo: 'PAGAR', valorCentavos: 30000, vencimentoFixo: '2026-10-20', emissao: '2026-10-01', natureza: 'OUTROS', parceiro: {} },
    P2: { tipo: 'PAGAR', valorCentavos: 20000, vencimentoFixo: '2026-11-10', emissao: '2026-10-01', natureza: 'OUTROS', parceiro: {} },
    R1: { tipo: 'RECEBER', valorCentavos: 50000, vencimentoFixo: '2026-11-05', emissao: '2026-10-01', natureza: 'RECEITA_VENDA', parceiro: {} },
    S1: { tipo: 'PAGAR', valorCentavos: 7000, condicao: null, emissao: '2026-10-01', natureza: 'OUTROS', parceiro: {} } },
  baixas: { b: { tipo: 'BAIXA', titulo: 'R1', tituloTipo: 'RECEBER', valorCentavos: 10000, liquidoCentavos: 10000, data: '2026-10-15', conta: 'itau' } } };
eq(F.saldosBancarios(finF, '2026-10-28').itau.saldoCentavos, 110000, 'saldo = inicial + recebido');
const fl = F.fluxoDeCaixa({ fin: finF, pedidos_compra: {}, pedidos_comerciais: {} }, '2026-10-28', 4);
eq(fl.atrasado.saidas, 30000, 'vencido e aberto entra como atrasado');
eq(fl.semData.saidas, 7000, 'sem vencimento: balde próprio, nunca na semana zero');
eq(fl.saldoAtualCentavos, 110000, 'saldo inicial do fluxo');
const sem = fl.semanas.filter((c) => !c.passada);
eq(sem[sem.length - 1].saldoProjetadoCentavos, 110000 - 30000 + 40000 - 20000, 'saldo projetado acumula entradas e saídas');
const ag = F.aging({ fin: finF }, '2026-10-28');
eq(ag.PAGAR.D1_30, 30000, 'aging: 8 dias vencido');
eq(ag.PAGAR.SEM_VENCIMENTO, 7000, 'aging: sem vencimento separado');
eq(ag.RECEBER.A_VENCER, 40000, 'aging: a receber a vencer');
eq(F.prazosMedios(finF, '2026-10-28').pmr, 14, 'PMR ponderado: emissão 01/10, baixa 15/10');
eq(F.prazosMedios({}, '2026-10-28').pmp, null, 'sem baixa: PMP null, não zero');

// ── 10. Compromissos (expectativa, nunca título) ──────────────────────────
const cp = F.compromissos({ pedidos_compra: { k: { status: 'ENVIADO', numeroFormatado: 'PC-9', fornecedorKey: 'f', condicaoPagamento: '30', dataPrevistaEntrega: '2026-11-01',
  itens: { a: { materialCodigo: 'EP-1', precoUnit: 2, qtd: 100, qtdRecebida: 40 } } } }, pedidos_comerciais: { pv: { cliente: 'C', totalValor: 300 } }, agendamentos_expedicao: {} });
eq(cp.find((c) => c.id === 'PC_k').valorCentavos, 12000, 'compromisso = o que falta receber × preço');
eq(cp.find((c) => c.id === 'PC_k').parcelas[0].vencimento, '2026-12-01', 'compromisso vence pela condição a partir da entrega prevista');
ok(cp.find((c) => c.id === 'PV_pv').semData, 'carteira comercial sem data de faturamento: sem data');

// ── 11. Conciliação OFX ───────────────────────────────────────────────────
const ofx = 'OFXHEADER:100\n<OFX><BANKACCTFROM><ACCTID>12345</BANKACCTFROM><BANKTRANLIST>\n<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261015120000[-3:BRT]<TRNAMT>100.00<FITID>A1<MEMO>TED CLIENTE A\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261020<TRNAMT>-300,00<FITID>A2<NAME>PAGTO FORN\n</BANKTRANLIST></OFX>';
const ex = F.lerOfx(ofx);
eq(ex.linhas.length, 2, 'duas transações');
eq(ex.linhas[1].valorCentavos, -30000, 'débito negativo, vírgula decimal');
eq(ex.conta, '12345', 'conta do arquivo');
eq(F.sugerirConciliacao(ex.linhas[0], { fin: finF }, 'itau').candidatos[0].baixa, 'b', 'crédito casa com a baixa de mesmo valor e data');
eq(F.sugerirConciliacao(ex.linhas[1], { fin: finF }, 'itau').candidatos[0].titulo, 'P1', 'débito sem baixa sugere o título aberto de mesmo valor');
eq(F.lerOfx('lixo').erro.length > 0, true, 'arquivo inválido: erro, não lista vazia silenciosa');

console.log(`OK financeiro: ${n} asserções — condição de pagamento (formatos reais), parcelas sem perder centavo, recebimento → a pagar (custo do lote, natureza, material do cliente fora, sem preço → complemento, devolução e cancelamento → abatimento), NF → a receber (diferença fiscal visível), recorrentes com ajuste, baixa/estorno/lote com segregação, planilha de abertura, fluxo, aging, prazos médios, compromissos e OFX.`);
