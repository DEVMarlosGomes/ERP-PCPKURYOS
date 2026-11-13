'use strict';
/* Financeiro — relatórios do WebMais (12/11/2026, Entrega A). Cada relatório:
   (1) fecha com a fonte (saldo dos bancos, carteira, aging, prazos do Painel);
   (2) o CSV, lido de volta, tem os mesmos totais da tela;
   (3) base vazia não dá NaN nem total falso, e o vazio explica. */
const assert = require('node:assert/strict');
const F = require('./public/shared/financeiro');
const R = require('./public/shared/financeiro-relatorios');
const Ctl = require('./functions/controladoria');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const HOJE = '2026-11-12';

function fin() {
  return {
    contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-10-01'},
      cx: {nome: 'Caixa', tipo: 'CAIXA', saldoInicialCentavos: 0, dataSaldoInicial: '2026-10-01'},
      novo: {nome: 'Banco novo', saldoInicialCentavos: 7700, dataSaldoInicial: '2026-11-03'}},
    titulos: {
      // Recebimento com MP e embalagem: a natureza "principal" é MP, mas 1/4 é embalagem.
      P1: {tipo: 'PAGAR', valorCentavos: 40000, condicao: '30/60', baseVencimento: '2026-10-01', emissao: '2026-10-01', natureza: 'MATERIA_PRIMA',
        porNatureza: {MATERIA_PRIMA: 30000, EMBALAGEM: 10000}, documento: 'NF 10', parceiro: {nome: 'Química SA', cnpj: '01234567000190'}, origem: {tipo: 'RECEBIMENTO'}, criadoPor: 'servidor'},
      // Mesmo CNPJ, nome escrito diferente: é o mesmo fornecedor.
      P2: {tipo: 'PAGAR', valorCentavos: 5000, vencimentoFixo: '2026-08-15', emissao: '2026-08-01', natureza: 'MATERIA_PRIMA', documento: 'NF 7',
        parceiro: {nome: 'QUIMICA S/A', cnpj: '01.234.567/0001-90'}, origem: {tipo: 'MANUAL'}, centroCusto: 'PRODUCAO', criadoPor: 'Ana'},
      P3: {tipo: 'PAGAR', valorCentavos: 7000, emissao: '2026-11-01', natureza: 'USO_E_CONSUMO', documento: 'S/N', parceiro: {nome: 'Sem Prazo'}, origem: {tipo: 'MANUAL'}, centroCusto: 'ADMINISTRATIVO', criadoPor: 'Bruno'},
      P4: {tipo: 'PAGAR', valorCentavos: 12000, vencimentoFixo: '2026-11-20', emissao: '2026-11-02', natureza: 'FRETE', documento: 'CT 3', parceiro: {nome: 'Transportes X'}, origem: {tipo: 'MANUAL'}, centroCusto: 'LOGISTICA', criadoPor: 'Ana'},
      R1: {tipo: 'RECEBER', valorCentavos: 50000, condicao: '30/60', baseVencimento: '2026-10-15', emissao: '2026-10-15', natureza: 'RECEITA_VENDA', documento: 'NF 501', parceiro: {nome: 'Marca Bela', cnpj: '11222333000144'}, origem: {tipo: 'MANUAL'}},
      R2: {tipo: 'RECEBER', valorCentavos: 20000, vencimentoFixo: '2026-12-20', emissao: '2026-11-05', natureza: 'RECEITA_VENDA', documento: 'NF 502', parceiro: {nome: 'Outra Marca'}, origem: {tipo: 'MANUAL'}},
      R3: {tipo: 'RECEBER', valorCentavos: 9000, vencimentoFixo: '2026-11-25', emissao: '2026-11-01', natureza: 'RECEITA_VENDA', documento: 'NF 503', parceiro: {nome: 'Marca Bela', cnpj: '11222333000144'}, origem: {tipo: 'MANUAL'}}
    },
    baixas: {
      B1: {tipo: 'BAIXA', titulo: 'P1', tituloTipo: 'PAGAR', natureza: 'MATERIA_PRIMA', data: '2026-10-31', conta: 'itau', valorCentavos: 20000, jurosCentavos: 150, multaCentavos: 50, descontoCentavos: 0, liquidoCentavos: 20200, criadoEm: '2026-10-31T10:00:00Z'},
      B2: {tipo: 'BAIXA', titulo: 'R1', tituloTipo: 'RECEBER', natureza: 'RECEITA_VENDA', data: '2026-11-14', conta: 'itau', valorCentavos: 25000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 500, liquidoCentavos: 24500},
      B3: {tipo: 'BAIXA', titulo: 'P2', tituloTipo: 'PAGAR', natureza: 'MATERIA_PRIMA', data: '2026-11-03', conta: 'itau', valorCentavos: 5000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 5000},
      B3_est: {tipo: 'ESTORNO', estorna: 'B3', titulo: 'P2', tituloTipo: 'PAGAR', natureza: 'MATERIA_PRIMA', data: '2026-11-04', conta: 'itau', valorCentavos: 5000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 5000},
      B4: {tipo: 'BAIXA', titulo: 'R3', tituloTipo: 'RECEBER', natureza: 'RECEITA_VENDA', data: '2026-11-03', conta: 'cx', valorCentavos: 4000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 4000}
    },
    abatimentos: {A1: {titulo: 'R2', motivo: 'DEVOLUCAO', valorCentavos: 2000, data: '2026-11-08'}},
    movimentos: {
      M1: {tipoRegistro: 'MOVIMENTO', tipo: 'TRANSFERENCIA', conta: 'itau', destino: 'cx', data: '2026-11-03', valorCentavos: 3000, criadoPor: 'Ana', criadoEm: '2026-11-03T09:00:00Z'},
      M2: {tipoRegistro: 'MOVIMENTO', tipo: 'TARIFA', conta: 'itau', data: '2026-11-03', valorCentavos: 890, historico: 'Pacote', criadoPor: 'Bruno', criadoEm: '2026-11-03T11:00:00Z'},
      M2_est: {tipoRegistro: 'ESTORNO', estorna: 'M2', tipo: 'TARIFA', conta: 'itau', data: '2026-11-05', valorCentavos: 890, criadoPor: 'Bruno', criadoEm: '2026-11-05T11:00:00Z'}
    },
    parametros: {}
  };
}
function lerCsv(txt) {
  ok(txt.charCodeAt(0) === 0xFEFF, 'CSV começa com o BOM');
  const linhas = txt.slice(1).split('\r\n').filter(Boolean).map((l) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ';') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out;
  });
  const temTotal = linhas.length > 1 && linhas[linhas.length - 1][0] === 'Total';
  return {cab: linhas[0], corpo: linhas.slice(1, temTotal ? -1 : undefined), total: temTotal ? linhas[linhas.length - 1] : null};
}
const cent = (s) => s === '' ? 0 : Math.round(Number(String(s).replace(',', '.')) * 100);
// Nenhum número inválido em nenhuma célula; CSV com o mesmo total da tela.
function confere(rel, nome) {
  ok(!rel.erro, nome + ': sem erro (' + rel.erro + ')');
  rel.linhas.forEach((l) => rel.colunas.forEach((c) => {
    const v = l[c.chave];
    if (c.tipo === 'valor') ok(v == null || (Number.isInteger(v)), nome + ': ' + c.chave + ' em centavos inteiros (' + v + ')');
    else ok(!/NaN|Infinity|undefined/.test(String(v == null ? '' : v)), nome + ': ' + c.chave + ' sem NaN');
  }));
  const c = lerCsv(F.relatorioCsv(rel));
  eq(c.cab, rel.colunas.map((x) => x.rotulo), nome + ': cabeçalho');
  eq(c.corpo.length, rel.linhas.length, nome + ': uma linha do CSV por linha da tela');
  rel.colunas.forEach((col, i) => {
    if (col.tipo !== 'valor' || col.semTotal) return;
    const soma = c.corpo.reduce((s, l) => s + cent(l[i]), 0);
    eq([cent(c.total[i]), soma], [rel.totais[col.chave], rel.totais[col.chave]], nome + ': total de "' + col.rotulo + '" = soma das linhas = tela');
  });
  return rel;
}
const linha = (rel, campo, valor) => rel.linhas.find((l) => l[campo] === valor);
const f = fin();
let r;

// ── Centros de custo: a lista padrão é a mesma da Controladoria ─────────────
eq(Object.keys(R.CENTROS_PADRAO).sort(), Object.keys(Ctl.CENTROS_PADRAO).sort(), 'centros padrão = Controladoria');
Object.keys(R.CENTROS_PADRAO).forEach((k) => eq(R.CENTROS_PADRAO[k], Ctl.CENTROS_PADRAO[k].nome, 'nome do centro ' + k));
eq(R.centros({LAB: {nome: 'Laboratório'}}).LAB, 'Laboratório', 'centro cadastrado na Controladoria entra na lista');

// ── Centro de custo no título manual (validado no motor que o servidor usa) ──
const tm = {tipo: 'PAGAR', parceiro: 'X', valor: '10,00', emissao: '2026-11-12', vencimento: '2026-12-01'};
eq(F.validarTituloManual(Object.assign({centroCusto: 'LOGISTICA'}, tm), 'MANUAL').titulo.centroCusto, 'LOGISTICA', 'centro gravado no título');
eq(F.validarTituloManual(tm, 'MANUAL').titulo.centroCusto, null, 'sem centro: null, nunca string vazia');
ok(!F.validarTituloManual(Object.assign({centroCusto: 'a/b'}, tm), 'MANUAL').ok, 'centro com caractere de caminho é recusado');
ok(!F.validarTituloManual(Object.assign({centroCusto: 'X'.repeat(41)}, tm), 'MANUAL').ok, 'centro longo demais é recusado');

// ── Rateio por natureza: centavos inteiros, soma exata ──────────────────────
eq(R.ratear(10001, {porNatureza: {A: 1, B: 1, C: 1}}).map((x) => x.valor), [3334, 3334, 3333], 'rateio: a última absorve o arredondamento');
eq(R.ratear(-10000, f.titulos.P1).reduce((s, x) => s + x.valor, 0), -10000, 'rateio de estorno também fecha');
eq(R.ratear(500, {natureza: 'FRETE'}), [{natureza: 'FRETE', valor: 500}], 'sem porNatureza: a natureza do título');

// ── Espelho de caixa diário ────────────────────────────────────────────────
r = confere(R.relEspelhoDiario(f, {data: '2026-11-03'}), 'espelho');
const sb3 = F.saldosBancarios(f, '2026-11-03');
eq(r.totais.saldo, Object.keys(sb3).reduce((s, k) => s + sb3[k].saldoCentavos, 0), 'espelho: soma dos saldos finais = saldo dos bancos no dia');
eq(r.linhas.filter((l) => l.historico === 'Saldo final do dia').map((l) => l.saldo), ['itau', 'cx', 'novo'].map((k) => sb3[k].saldoCentavos), 'espelho: saldo final por conta');
ok(linha(r, 'historico', 'Saldo inicial (abertura da conta)') && linha(r, 'historico', 'Saldo inicial (abertura da conta)').entrada == null, 'abertura da conta aparece, mas não como entrada');
eq(r.totais.saida, 3000 + 890 + 5000, 'espelho: saídas do dia (transferência, tarifa, pagamento)');
r = confere(R.relEspelhoDiario(f, {data: '2026-11-10', conta: 'cx'}), 'espelho sem movimento');
ok(linha(r, 'historico', 'Sem movimento no dia'), 'dia sem movimento diz isso');
ok(R.relEspelhoDiario(f, {data: ''}).erro && R.relEspelhoDiario(f, {data: '2026-11-03', conta: 'xx'}).erro, 'data ou conta inválida explica');

// ── Saldo das contas ───────────────────────────────────────────────────────
r = confere(R.relSaldosContas(f, {de: '2026-11-01', ate: '2026-11-30'}), 'saldos');
const sb30 = F.saldosBancarios(f, '2026-11-30'), sb31 = F.saldosBancarios(f, '2026-10-31');
r.linhas.forEach((l) => eq(l.anterior + l.abertura + l.entradas - l.saidas, l.final, 'saldos: anterior + abertura + entradas − saídas = final (' + l.conta + ')'));
eq(r.linhas.map((l) => l.final), ['itau', 'cx', 'novo'].map((k) => sb30[k].saldoCentavos), 'saldos: final = saldo do banco');
eq(r.linhas.map((l) => l.anterior), ['itau', 'cx', 'novo'].map((k) => sb31[k].saldoCentavos), 'saldos: anterior = saldo do dia anterior');
eq(linha(r, 'conta', 'Banco novo').abertura, 7700, 'conta aberta no período: abertura separada da entrada');
ok(R.relSaldosContas(f, {de: '2026-11-30', ate: '2026-11-01'}).erro, 'período invertido explica');

// ── Lançamentos bancários ──────────────────────────────────────────────────
r = confere(R.relMovimentos(f, {de: '2026-11-01', ate: '2026-11-30'}), 'movimentos');
eq(r.linhas.map((l) => l.tipo), ['Transferência', 'Tarifa bancária', 'Estorno: Tarifa bancária'], 'movimentos em ordem');
eq(r.totais.valor, 3000, 'tarifa estornada se anula: sobra a transferência');
eq(R.relMovimentos(f, {de: '2026-11-01', ate: '2026-11-30', destino: 'cx'}).linhas.length, 1, 'filtro por conta destino');
eq(R.relMovimentos(f, {de: '2026-11-01', ate: '2026-11-30', tipo: 'TARIFA'}).totais.valor, 0, 'filtro por tipo');
eq(R.relMovimentos(f, {de: '2026-11-01', ate: '2026-11-30', conta: 'cx'}).linhas.length, 0, 'filtro por conta de origem');

// ── Realizado × previsto ───────────────────────────────────────────────────
r = confere(R.relRealizadoPrevisto(f, {de: '2026-10-01', ate: '2026-12-31', granularidade: 'MES'}), 'realizado x previsto');
eq(r.linhas.map((l) => l.periodo), ['2026-10-01', '2026-11-01', '2026-12-01']);
const nov = linha(r, 'periodo', '2026-11-01');
// Nov: P1 parcela 1 vence 31/10 (out); parcela 2 30/11 = 20000; P4 20/11 = 12000. R1 p1 14/11 = 25000; R3 25/11 = 9000.
eq([nov.prevS, nov.realS], [32000, 0], 'nov: previsto a pagar e pagamento estornado (5000 − 5000)');
eq([nov.prevE, nov.realE, nov.difE], [34000, 29000, -5000], 'nov: a receber previsto × realizado');
eq(linha(r, 'periodo', '2026-10-01').realS, 20000, 'out: principal pago (juros e multa à parte)');
ok(r.avisos.some((a) => /sem vencimento|não ter vencimento/.test(a)), 'título sem vencimento: aviso, não some calado');
r = R.relRealizadoPrevisto(f, {de: '2020-01-01', ate: '2026-12-31', granularidade: 'DIA'});
ok(r.erro, 'período longo demais por dia explica');

// ── Gastos por centro de custo ─────────────────────────────────────────────
r = confere(R.relGastosCentroCusto(f, {de: '2026-08-01', ate: '2026-11-30'}), 'gastos');
eq(r.totais.valor, 40000 + 5000 + 7000 + 12000, 'gastos lançados = títulos a pagar emitidos no período');
eq(r.linhas.filter((l) => l.documento === 'NF 10').map((l) => [l.natureza, l.valor]), [['Embalagem', 10000], ['Matéria-prima', 30000]], 'recebimento dividido por natureza');
eq(r.linhas[r.linhas.length - 1].centro, R.SEM_CC, '"Sem centro de custo" por último');
ok(r.linhas.filter((l) => l.destaque).every((l) => l.valor == null), 'subtotal nunca na coluna que se soma');
eq(linha(r, 'documento', 'Total do centro Logística').subtotal, 12000, 'subtotal do centro');
eq(R.relGastosCentroCusto(f, {de: '2026-08-01', ate: '2026-11-30', natureza: 'MATERIA_PRIMA'}).totais.valor, 35000, 'filtro de elemento (matéria-prima) pega a parte do recebimento');
eq(R.relGastosCentroCusto(f, {de: '2026-08-01', ate: '2026-11-30', centroCusto: '_SEM'}).totais.valor, 40000, 'filtro: só sem centro');
r = confere(R.relGastosCentroCusto(f, {de: '2026-10-01', ate: '2026-11-30', dataBase: 'PAGAMENTO'}), 'gastos pagos');
eq(r.totais.valor, 20000, 'gastos pagos: pagamento estornado não conta');
ok(r.avisos.some((a) => /dividido/.test(a)), 'rateio avisado');

// ── Lançamento de despesas ─────────────────────────────────────────────────
r = confere(R.relLancamentoDespesas(f, {de: '2026-08-01', ate: '2026-11-30', situacao: 'TODOS'}), 'despesas');
eq(r.linhas.length, 4);
eq(R.relLancamentoDespesas(f, {de: '2026-08-01', ate: '2026-11-30', situacao: 'TODOS', usuario: 'ana'}).linhas.map((l) => l.documento), ['NF 7', 'CT 3'], 'filtro por usuário');
eq(R.relLancamentoDespesas(f, {de: '2026-08-01', ate: '2026-11-30', situacao: 'TODOS', centroCusto: 'LOGISTICA'}).linhas[0].centro, 'Logística', 'filtro por centro, com o nome');
eq(R.relLancamentoDespesas(f, {de: '2026-08-01', ate: '2026-11-30', situacao: 'TODOS', natureza: 'EMBALAGEM'}).linhas.map((l) => l.documento), ['NF 10'], 'natureza secundária do recebimento também filtra');
eq(R.relLancamentoDespesas(f, {de: '2026-08-01', ate: '2026-11-30', situacao: 'ABERTOS'}).linhas.length, 4, 'pagamento estornado: P2 volta a aberto');
eq(linha(R.relLancamentoDespesas(f, {de: '2026-08-01', ate: '2026-11-30'}), 'documento', 'S/N').situacao, 'Sem vencimento');

// ── Em aberto por parceiro ─────────────────────────────────────────────────
['PAGAR', 'RECEBER'].forEach((tipo) => {
  r = confere(R.relEmAberto(f, {tipo, hoje: HOJE}), 'em aberto ' + tipo);
  const ag = F.aging({fin: f}, HOJE)[tipo];
  eq(r.totais.total, Object.values(ag).reduce((s, v) => s + v, 0), 'em aberto ' + tipo + ' = aging do painel');
  ['A_VENCER', 'D1_30', 'D31_60', 'D61_90', 'D90', 'SEM_VENCIMENTO'].forEach((k) => eq(r.totais[k], ag[k], 'faixa ' + k + ' ' + tipo));
});
r = R.relEmAberto(f, {tipo: 'PAGAR', hoje: HOJE});
eq(r.linhas.filter((l) => /QU[IÍ]MICA/i.test(l.parceiro)).length, 1, 'mesmo CNPJ com nome diferente: uma linha só');
const qui = r.linhas.find((l) => /QU[IÍ]MICA/i.test(l.parceiro));
eq([qui.titulos, qui.maiorAtraso, qui.vencido], ['2', '89 d', 5000], 'posição: títulos, maior atraso e vencido (1ª parcela de P1 já paga)');
eq(R.relEmAberto(f, {tipo: 'RECEBER', hoje: HOJE, parceiro: '11.222.333'}).linhas.length, 1, 'busca por CNPJ com máscara');

// ── Principais fornecedores / clientes ─────────────────────────────────────
r = confere(R.relRanking(f, {tipo: 'PAGAR', de: '2026-01-01', ate: '2026-12-31'}), 'ranking');
eq(r.linhas[0].parceiro, 'Química SA', 'maior fornecedor primeiro');
eq([r.linhas[0].valor, r.linhas[0].documentos, r.linhas[0].classe], [45000, '2', 'A'], 'mesmo CNPJ soma');
eq(r.totais.valor, 64000);
eq(R.relRanking(f, {tipo: 'PAGAR', de: '2026-01-01', ate: '2026-12-31', top: 1}).totais.valor, 64000, 'top 1 + demais: total igual');
eq(R.relRanking(f, {tipo: 'PAGAR', de: '2026-01-01', ate: '2026-12-31', top: 1}).linhas[1].parceiro, 'Demais (2)');
eq(R.relRanking(f, {tipo: 'PAGAR', de: '2026-01-01', ate: '2026-12-31', natureza: 'MATERIA_PRIMA'}).totais.valor, 35000, 'categoria matéria-prima');
eq(confere(R.relRanking(f, {tipo: 'RECEBER', de: '2026-01-01', ate: '2026-12-31', dataBase: 'PAGAMENTO'}), 'ranking recebido').totais.valor, 29000, 'ranking recebido');

// ── Evolução de pagamento ──────────────────────────────────────────────────
r = confere(R.relEvolucao(f, {tipo: 'PAGAR', de: '2026-10-01', ate: '2026-11-30'}), 'evolução');
eq(r.colunas.map((c) => c.rotulo), ['Fornecedor', '10/2026', '11/2026', 'Total']);
eq([r.totais['2026-10'], r.totais['2026-11'], r.totais.total], [20000, 0, 20000], 'evolução: estorno abate no mês');
r = confere(R.relEvolucao(f, {tipo: 'PAGAR', de: '2026-10-01', ate: '2026-11-30', agrupar: 'NATUREZA'}), 'evolução por natureza');
eq(r.linhas.map((l) => [l.grupo, l.total]), [['Matéria-prima', 15000], ['Embalagem', 5000]], 'evolução por natureza com rateio');
ok(R.relEvolucao(f, {tipo: 'PAGAR', de: '2020-01-01', ate: '2026-11-30'}).erro, 'mais de 36 meses explica');

// ── Composição de vencimentos ──────────────────────────────────────────────
['PAGAR', 'RECEBER'].forEach((tipo) => {
  r = confere(R.relComposicaoVencimentos(f, {tipo, hoje: HOJE, meses: 3}), 'composição ' + tipo);
  eq(r.totais.valor, F.carteira(f).filter((s) => s.titulo.tipo === tipo).reduce((s, x) => s + x.saldoCentavos, 0), 'composição ' + tipo + ' = saldo em aberto');
});
r = R.relComposicaoVencimentos(f, {tipo: 'RECEBER', hoje: HOJE, meses: 3});
eq(r.linhas.map((l) => l.valor), [0, 5000, 43000, 0, 0, 0], 'receber: nov (R3 − baixa), dez (R1 p2 + R2 − abatimento)');

// ── Conta corrente e conciliação ───────────────────────────────────────────
r = confere(R.relContaCorrente(f, {tipo: 'RECEBER', parceiro: 'marca bela', de: '2026-11-01', ate: '2026-12-31'}), 'conta corrente');
const saldoBela = F.carteira(f).filter((s) => /Marca Bela/.test(s.titulo.parceiro.nome)).reduce((s, x) => s + x.saldoCentavos, 0);
eq(r.totais.saldo, saldoBela, 'conta corrente: saldo final = carteira do cliente');
eq(r.linhas[0].saldo, 50000, 'saldo anterior: título de outubro');
eq([r.totais.debito, r.totais.credito], [9000, 29000], 'débito = faturado, crédito = recebido');
eq(r.totais.debito - r.totais.credito + r.linhas[0].saldo, r.totais.saldo, 'anterior + débitos − créditos = saldo');
r = confere(R.relContaCorrente(f, {tipo: 'PAGAR', parceiro: '01234567', de: '2026-11-01', ate: '2026-11-30'}), 'conta corrente fornecedor');
eq([r.totais.debito, r.totais.credito], [5000, 5000], 'pagamento e estorno do fornecedor');
ok(R.relContaCorrente(f, {tipo: 'RECEBER', de: '2026-11-01', ate: '2026-11-30'}).erro, 'sem parceiro: pede o nome');
['PAGAR', 'RECEBER'].forEach((tipo) => {
  r = confere(R.relConciliacaoParceiros(f, {tipo, de: '2026-11-01', ate: '2099-12-31'}), 'conciliação ' + tipo);
  r.linhas.forEach((l) => eq(l.anterior + l.emitido - l.baixado - l.abatido, l.final, 'conciliação: fecha (' + l.parceiro + ')'));
  eq(r.totais.final, F.carteira(f).filter((s) => s.titulo.tipo === tipo).reduce((s, x) => s + x.saldoCentavos, 0), 'conciliação ' + tipo + ' = carteira');
});

// ── Antecipação ────────────────────────────────────────────────────────────
r = confere(R.relAntecipacao(f, {data: HOJE, taxaMensal: '3'}), 'antecipação');
const r2 = linha(r, 'documento', 'NF 502');
eq([r2.dias, r2.valor, r2.desagio, r2.liquido], ['38', 18000, 684, 17316], 'deságio = 18000 × 3% × 38 ÷ 30');
eq(r.totais.valor - r.totais.desagio, r.totais.liquido);
ok(!linha(r, 'documento', 'NF 501') || linha(r, 'documento', 'NF 501').vencimento > HOJE, 'parcela vencida fica de fora');
ok(R.relAntecipacao(f, {data: HOJE, taxaMensal: ''}).erro && R.relAntecipacao(f, {data: HOJE, taxaMensal: 25}).erro, 'taxa ausente ou absurda explica');

// ── Prazos médios ──────────────────────────────────────────────────────────
r = confere(R.relPrazosMedios(f, {tipo: 'RECEBER', de: F.addDias(HOJE, -90), ate: '2099-12-31'}), 'PMR');
const pm = F.prazosMedios(f, HOJE);
eq(r.linhas[0].prazo, pm.pmr + ' d', 'PMR geral = Painel (mesma janela de 90 dias)');
r = confere(R.relPrazosMedios(f, {tipo: 'PAGAR', de: F.addDias(HOJE, -90), ate: '2099-12-31'}), 'PMP');
eq(r.linhas[0].prazo, pm.pmp + ' d', 'PMP geral = Painel; baixa estornada fica fora');
eq([r.linhas[0].concedido, r.linhas[0].atraso], ['45 d', '-15 d'], 'prazo concedido (30/60) e pagamento adiantado');
eq(r.totais.valor, r.totais.valorGeral, 'soma por parceiro = geral');

// ── Entrega B nos relatórios: adiantamento, renegociação, cancelamento ──────
{
  const g = JSON.parse(JSON.stringify(f));
  g.adiantamentos = {AD_1: F.validarAdiantamento({tipo: 'PAGAR', parceiro: 'Química SA', cnpj: '01234567000190', conta: 'itau', data: '2026-11-05', valorCentavos: 9000, documento: 'AD 9'}, g).registro,
    AD_2: F.validarAdiantamento({tipo: 'RECEBER', parceiro: 'Outra Marca', conta: 'itau', data: '2026-11-05', valorCentavos: 3000}, g).registro};
  const sP4 = F.carteira(g).find((s) => s.id === 'P4');
  g.baixas.CP_1 = F.validarCompensacao(F.carteira(g).find((s) => s.id === 'P1'), F.saldosAdiantamentos(g).AD_1, {data: '2026-11-06', valorCentavos: 4000}).registro;
  const rn = F.montarRenegociacao(g, {titulos: ['P4'], data: '2026-11-07', condicao: '30', acrescimoCentavos: 500, motivo: 'acordo com a transportadora'}, 'rn1');
  ok(rn.ok, 'renegociação para o relatório: ' + rn.motivo);
  g.renegociacoes = {RN_rn1: rn.registro}; g.titulos.RNG_rn1 = rn.titulo; g.abatimentos = Object.assign({}, g.abatimentos, rn.abatimentos);
  g.baixas.B_RNG = {tipo: 'BAIXA', titulo: 'RNG_rn1', tituloTipo: 'PAGAR', natureza: 'FRETE', data: '2026-11-20', conta: 'itau', valorCentavos: 2000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 2000};
  const cn = F.montarCancelamento(g, {titulos: ['R2'], data: '2026-11-08', motivo: 'INCOBRAVEL', justificativa: 'cliente fechou as portas'}, 'cn1');
  g.cancelamentos = {CN_cn1: cn.registro}; g.abatimentos = Object.assign({}, g.abatimentos, cn.abatimentos);

  // Gasto por emissão não conta a renegociação duas vezes; por pagamento, a baixa dela conta.
  r = confere(R.relGastosCentroCusto(g, {de: '2026-08-01', ate: '2026-11-30'}), 'gastos com renegociação');
  eq(r.totais.valor, 64000, 'emissão: só os originais (o título novo não soma de novo)');
  ok(!linha(r, 'documento', rn.titulo.documento), 'título de renegociação fora da base por emissão');
  r = confere(R.relGastosCentroCusto(g, {de: '2026-11-01', ate: '2026-11-30', dataBase: 'PAGAMENTO'}), 'gastos pagos com renegociação');
  eq(r.totais.valor, 4000 + 2000, 'pagamento: compensação (4000) + baixa do renegociado (2000); a baixa estornada se anula');
  eq(R.relGastosCentroCusto(g, {de: '2026-11-01', ate: '2026-11-30', dataBase: 'PAGAMENTO', semAdiantamentos: true}).totais.valor, 2000, 'não exibir adiantamentos: some a compensação');
  eq(R.relRanking(g, {tipo: 'PAGAR', de: '2026-01-01', ate: '2026-12-31'}).totais.valor, 64000, 'ranking por emissão sem dupla contagem');
  r = R.relLancamentoDespesas(g, {de: '2026-08-01', ate: '2026-11-30', situacao: 'TODOS'});
  eq(r.linhas.length, 4, 'lançamento de despesas sem o título de renegociação');
  ok(r.avisos.some((a) => /renegocia/.test(a)), 'avisa que a renegociação ficou de fora');
  eq(linha(r, 'documento', 'CT 3').situacao, 'Renegociado', 'situação do original');

  // Previsto não conta renegociado nem cancelado; o título novo prevê.
  r = R.relRealizadoPrevisto(g, {de: '2026-11-01', ate: '2026-12-31', granularidade: 'MES'});
  eq(linha(r, 'periodo', '2026-11-01').prevS, 20000, 'nov: só a 2ª parcela de P1 (P4 renegociado sai do previsto)');
  eq(linha(r, 'periodo', '2026-12-01').prevS, sP4.saldoCentavos + 500, 'dez: o título renegociado (30 dias)');
  eq(linha(r, 'periodo', '2026-11-01').prevE, 25000 + 9000, 'R2 cancelado não está previsto');

  // Em aberto mostra o adiantamento disponível do parceiro.
  r = confere(R.relEmAberto(g, {tipo: 'PAGAR', hoje: HOJE}), 'em aberto com adiantamento');
  eq(r.linhas.find((l) => /QU[IÍ]MICA/i.test(l.parceiro)).adiantamento, 5000, 'adiantamento disponível (9000 − 4000)');
  eq(r.totais.adiantamento, 5000);
  r = confere(R.relEmAberto(g, {tipo: 'RECEBER', hoje: HOJE}), 'clientes em aberto com adiantamento');
  eq(r.linhas.find((l) => l.parceiro === 'Outra Marca').adiantamento, 3000, 'cliente com adiantamento aparece');

  // Relatório de adiantamentos.
  r = confere(R.relAdiantamentos(g, {tipo: 'PAGAR'}), 'adiantamentos');
  eq(r.linhas.map((l) => [l.parceiro, l.valor, l.compensado, l.saldo, l.situacao]), [['Química SA', 9000, 4000, 5000, 'Em aberto']]);
  eq(r.totais.saldo, Object.values(F.saldosAdiantamentos(g)).filter((a) => a.tipo === 'PAGAR').reduce((s, a) => s + a.saldoCentavos, 0), 'total = saldo do motor');
  eq(confere(R.relAdiantamentos(g, {tipo: 'RECEBER'}), 'adiantamentos de clientes').totais.saldo, 3000);
  eq(R.relAdiantamentos(g, {tipo: 'PAGAR', parceiro: 'nada'}).linhas.length, 0, 'filtro de parceiro');
}

// ── Base vazia: estado de estreia ──────────────────────────────────────────
const P = {de: '2026-11-01', ate: '2026-11-30', data: HOJE, hoje: HOJE, parceiro: 'x', taxaMensal: 2};
[['relAdiantamentos'], ['relSaldosContas'], ['relMovimentos'], ['relRealizadoPrevisto'], ['relGastosCentroCusto'], ['relLancamentoDespesas'], ['relEmAberto'],
  ['relRanking'], ['relEvolucao'], ['relComposicaoVencimentos'], ['relContaCorrente'], ['relConciliacaoParceiros'], ['relAntecipacao'], ['relPrazosMedios']]
  .forEach(([fn]) => {
    [{}, null].forEach((base) => {
      const rv = R[fn](base, P);
      ok(!rv.erro, fn + ' vazio: sem erro');
      const csv = F.relatorioCsv(rv);
      ok(!/NaN|Infinity|undefined/.test(csv), fn + ' vazio: CSV sem número inválido');
      Object.values(rv.totais).forEach((v) => eq(v, 0, fn + ' vazio: total zero'));
    });
  });
ok(R.relEspelhoDiario({}, {data: HOJE}).erro, 'espelho sem conta explica');
console.log('financeiro relatórios WebMais: ' + n + ' asserções OK');
