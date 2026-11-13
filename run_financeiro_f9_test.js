'use strict';
/* Financeiro F9 (12/11/2026, reconstruída a partir do mapeamento do WebMais): elementos de
   custo, classificação com rateio entre centros e forma de pagamento, liquidação por filtro,
   DFC por grupo › subgrupo › elemento e fluxo aberto por tipo de conta. Motor puro.
   Spec: docs/superpowers/specs/2026-11-12-financeiro-f9-design.md */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const F = require('./functions/financeiro');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const HOJE = '2026-11-12', D = '2026-11-10';
const clone = (x) => JSON.parse(JSON.stringify(x));
function fin() {
  return {
    contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-11-01'}},
    titulos: {
      P1: {tipo: 'PAGAR', valorCentavos: 30000, vencimentoFixo: '2026-11-13', emissao: '2026-11-02', natureza: 'OUTROS', documento: 'NF 1', parceiro: {nome: 'Química SA'}, origem: {tipo: 'MANUAL'}, centroCusto: 'ADMINISTRATIVO'},
      P2: {tipo: 'PAGAR', valorCentavos: 40000, condicao: '30/60', baseVencimento: '2026-10-14', emissao: '2026-10-14', natureza: 'MATERIA_PRIMA', porNatureza: {MATERIA_PRIMA: 30000, EMBALAGEM: 10000},
        documento: 'NF 2', parceiro: {nome: 'Embalagens SA'}, origem: {tipo: 'RECEBIMENTO', ref: 'PC/R'}},
      P3: {tipo: 'PAGAR', valorCentavos: 5000, vencimentoFixo: '2026-11-01', emissao: '2026-10-01', natureza: 'FRETE', documento: 'CT 9', parceiro: {nome: 'Transp'}, origem: {tipo: 'MANUAL'}},
      PB: {tipo: 'PAGAR', valorCentavos: 7000, vencimentoFixo: '2026-11-12', emissao: '2026-11-01', natureza: 'OUTROS', documento: 'NF B', parceiro: {nome: 'Bloq'}, origem: {tipo: 'MANUAL'}},
      R1: {tipo: 'RECEBER', valorCentavos: 50000, vencimentoFixo: '2026-11-13', emissao: '2026-11-02', natureza: 'RECEITA_VENDA', documento: 'NF 501', parceiro: {nome: 'Marca Bela'}, origem: {tipo: 'MANUAL'}}
    },
    bloqueios: {PB: {motivo: 'divergência', ativo: true}},
    baixas: {}, movimentos: {}, adiantamentos: {}, parametros: {}, elementos: {}, classificacoes: {}
  };
}

// ── Plano de elementos ─────────────────────────────────────────────────────
const E = F.elementos(fin());
eq(Object.keys(F.ELEMENTOS_PADRAO).length, 27, 'plano padrão com 27 elementos');
['408', '004', '1101', '1103', '2113'].forEach((c) => ok(F.ELEMENTOS_PADRAO[c], 'código do vídeo presente: ' + c));
eq([E['408'].nome, E['2113'].nome, E['004'].natureza], ['A definir', 'Aluguel', 'ADIANTAMENTOS']);
Object.keys(F.ELEMENTOS_PADRAO).forEach((c) => {
  const x = F.ELEMENTOS_PADRAO[c];
  ok(F.GRUPOS_ELEMENTO[x.grupo] && x.subgrupo && (F.NATUREZAS.indexOf(x.natureza) >= 0 || ['RESULTADO_FINANCEIRO', 'ADIANTAMENTOS'].indexOf(x.natureza) >= 0), 'elemento ' + c + ' com grupo, subgrupo e natureza');
});
F.NATUREZAS.concat(['RESULTADO_FINANCEIRO', 'ADIANTAMENTOS']).forEach((nat) => ok(E[F.elementoDaNatureza(nat)], 'natureza ' + nat + ' tem elemento padrão'));
let v = F.validarElemento({codigo: '2120', nome: 'Seguro predial', grupo: '3', subgrupo: 'Administrativas', natureza: 'CUSTO_FIXO_ADM'}, fin());
ok(v.ok, 'elemento novo: ' + v.motivo);
eq(v.registro, {codigo: '2120', nome: 'Seguro predial', grupo: '3', subgrupo: 'Administrativas', natureza: 'CUSTO_FIXO_ADM', ativo: true});
[[{codigo: 'a/b', nome: 'X', grupo: '3', subgrupo: 'S', natureza: 'OUTROS'}, 'código'], [{codigo: '9', nome: '', grupo: '3', subgrupo: 'S', natureza: 'OUTROS'}, 'nome'],
  [{codigo: '9', nome: 'X', grupo: '7', subgrupo: 'S', natureza: 'OUTROS'}, 'grupo'], [{codigo: '9', nome: 'X', grupo: '3', subgrupo: 'S', natureza: 'NADA'}, 'natureza']]
  .forEach(([x, m]) => ok(!F.validarElemento(x, fin()).ok, 'elemento recusa ' + m));
const f2 = fin(); f2.elementos = {'2113': {codigo: '2113', nome: 'Aluguel do galpão', grupo: '3', subgrupo: 'Administrativas', natureza: 'CUSTO_FIXO_ADM', ativo: true}, '2120': v.registro};
eq([F.elementos(f2)['2113'].nome, F.elementos(f2)['2120'].nome, Object.keys(F.elementos(f2)).length], ['Aluguel do galpão', 'Seguro predial', 28], 'cadastro renomeia e acrescenta');

// ── Classificação e partes do título ───────────────────────────────────────
let f = fin();
const sit = (fx, id) => F.carteira(fx).find((s) => s.id === id);
v = F.validarClassificacao(sit(f, 'P1'), {elemento: '2113', formaPagamento: 'PIX', rateio: [{centro: 'ADMINISTRATIVO', percentual: 70}, {centro: 'PRODUCAO', percentual: 30}]}, f);
ok(v.ok, 'classificação: ' + v.motivo);
f.classificacoes.P1 = v.registro;
eq(F.partesDoTitulo(f, 'P1', 30000), [{elemento: '2113', natureza: 'CUSTO_FIXO_ADM', centro: 'ADMINISTRATIVO', valorCentavos: 21000}, {elemento: '2113', natureza: 'CUSTO_FIXO_ADM', centro: 'PRODUCAO', valorCentavos: 9000}], 'rateio 70/30');
eq(F.partesDoTitulo(f, 'P1', 10001).reduce((s, x) => s + x.valorCentavos, 0), 10001, 'rateio fecha o centavo');
eq(F.partesDoTitulo(f, 'P1', -10000).map((x) => x.valorCentavos), [-7000, -3000], 'estorno rateia com sinal');
eq(F.partesDoTitulo(f, 'P2', 40000), [{elemento: '202', natureza: 'EMBALAGEM', centro: null, valorCentavos: 10000}, {elemento: '201', natureza: 'MATERIA_PRIMA', centro: null, valorCentavos: 30000}], 'sem classificação: elemento padrão por natureza');
eq(F.classificacaoEfetiva(f, 'P1').formaPagamento, 'PIX');
eq(F.classificacaoEfetiva(f, 'P3').fonte, 'NATUREZA');
[[{elemento: 'NADA'}, 'elemento inexistente'], [{elemento: '101'}, 'elemento de receita em título a pagar'], [{elemento: '2113', formaPagamento: 'ESCAMBO'}, 'forma inválida'],
  [{elemento: '2113', rateio: [{centro: 'ADMINISTRATIVO', percentual: 60}]}, 'rateio não soma 100'], [{elemento: '2113', rateio: [{centro: 'a/b', percentual: 100}]}, 'centro inválido'],
  [{elemento: '004'}, 'adiantamento não é elemento de título'], [{elemento: '2113', rateio: [{centro: 'X', percentual: 50}, {centro: 'X', percentual: 50}]}, 'centro repetido']]
  .forEach(([x, m]) => ok(!F.validarClassificacao(sit(f, 'P1'), x, f).ok, 'classificação recusa: ' + m));
const fIn = fin(); fIn.elementos = {'2113': Object.assign({}, F.ELEMENTOS_PADRAO['2113'], {codigo: '2113', ativo: false})};
ok(!F.validarClassificacao(sit(fIn, 'P1'), {elemento: '2113'}, fIn).ok, 'elemento inativo recusado');
ok(F.validarClassificacao(sit(f, 'R1'), {elemento: '101'}, f).ok, 'receita em título a receber');
// Título manual com elemento e forma.
const tm = F.validarTituloManual({tipo: 'PAGAR', parceiro: 'X', valor: '10,00', emissao: HOJE, vencimento: '2026-12-01', natureza: 'CUSTO_FIXO_ADM', elemento: '2113', formaPagamento: 'BOLETO'}, 'MANUAL');
eq([tm.titulo.elemento, tm.titulo.formaPagamento], ['2113', 'BOLETO']);
ok(!F.validarTituloManual({tipo: 'PAGAR', parceiro: 'X', valor: '10,00', emissao: HOJE, vencimento: '2026-12-01', formaPagamento: 'ESCAMBO'}, 'MANUAL').ok, 'forma inválida no título manual');
const fM = fin(); fM.titulos.M = Object.assign({}, tm.titulo);
eq(F.partesDoTitulo(fM, 'M', 1000)[0].elemento, '2113', 'título manual usa o elemento informado');

// ── Liquidação por filtro ──────────────────────────────────────────────────
f = fin();
let ls = F.parcelasParaLiquidar(f, {tipo: 'PAGAR', de: HOJE, ate: F.addDias(HOJE, 1), hoje: HOJE});
eq(ls.map((l) => [l.titulo, l.vencimento, l.abertoCentavos, l.bloqueado]), [['PB', '2026-11-12', 7000, true], ['P2', '2026-11-13', 20000, false], ['P1', '2026-11-13', 30000, false]], 'hoje e amanhã (P2: 1ª parcela 30 dias de 14/10)');
ls = F.parcelasParaLiquidar(f, {tipo: 'PAGAR', ate: F.addDias(HOJE, -1), hoje: HOJE});
eq(ls.map((l) => [l.titulo, l.n, l.dias]), [['P3', 1, 11]], 'vencidos, com os dias de atraso');
eq(F.parcelasParaLiquidar(f, {tipo: 'PAGAR', q: 'embal', hoje: HOJE}).map((l) => l.titulo + '/' + l.n), ['P2/1', 'P2/2'], 'filtro por fornecedor');
eq(F.parcelasParaLiquidar(f, {tipo: 'PAGAR', elemento: '204', hoje: HOJE}).map((l) => l.titulo), ['P3'], 'filtro por elemento');
eq(F.parcelasParaLiquidar(f, {tipo: 'RECEBER', hoje: HOJE}).length, 1);
let lq = F.montarLiquidacao(f, {itens: [{titulo: 'P1', valorCentavos: 30000}, {titulo: 'P2', valorCentavos: 20000}, {titulo: 'P2', valorCentavos: 20000}], data: HOJE, conta: 'itau'});
ok(lq.ok, 'liquidação: ' + lq.motivo);
eq(lq.baixas.map((b) => [b.titulo, b.registro.valorCentavos, b.registro.conta, b.registro.data]), [['P1', 30000, 'itau', HOJE], ['P2', 40000, 'itau', HOJE]], 'uma baixa por título (parcelas somadas)');
eq(lq.totalCentavos, 70000);
ok(!F.montarLiquidacao(f, {itens: [{titulo: 'PB', valorCentavos: 7000}], data: HOJE, conta: 'itau'}).ok, 'título bloqueado fica de fora');
ok(!F.montarLiquidacao(f, {itens: [{titulo: 'P1', valorCentavos: 30001}], data: HOJE, conta: 'itau'}).ok, 'passa do saldo');
ok(!F.montarLiquidacao(f, {itens: [], data: HOJE, conta: 'itau'}).ok, 'nada marcado');
ok(!F.montarLiquidacao(f, {itens: [{titulo: 'P1', valorCentavos: 100}, {titulo: 'R1', valorCentavos: 100}], data: HOJE, conta: 'itau'}).ok, 'não mistura pagar e receber');
ok(!F.montarLiquidacao(f, {itens: [{titulo: 'P1', valorCentavos: 100}], data: HOJE, conta: 'nada'}).ok, 'conta inexistente');
const fCx = fin(); fCx.contas_bancarias.cx = {nome: 'Caixa', tipo: 'CAIXA', saldoInicialCentavos: 100, dataSaldoInicial: '2026-11-01'};
ok(!F.montarLiquidacao(fCx, {itens: [{titulo: 'P1', valorCentavos: 30000}], data: HOJE, conta: 'cx'}).ok, 'caixa físico não fica negativo');

// ── DFC por elemento e fluxo por grupo ─────────────────────────────────────
f = fin(); f.classificacoes.P1 = {elemento: '2113', rateio: [{centro: 'ADMINISTRATIVO', percentual: 100}]};
lq.baixas.forEach((b, i) => { f.baixas['L' + i] = b.registro; });
f.baixas.J = {tipo: 'BAIXA', titulo: 'P3', tituloTipo: 'PAGAR', data: HOJE, conta: 'itau', valorCentavos: 5000, jurosCentavos: 150, multaCentavos: 50, descontoCentavos: 0, liquidoCentavos: 5200};
f.baixas.R = {tipo: 'BAIXA', titulo: 'R1', tituloTipo: 'RECEBER', data: HOJE, conta: 'itau', valorCentavos: 50000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 400, liquidoCentavos: 49600};
f.movimentos.T = {tipoRegistro: 'MOVIMENTO', tipo: 'TARIFA', conta: 'itau', data: HOJE, valorCentavos: 890};
f.adiantamentos.A = {tipoRegistro: 'ADIANTAMENTO', tipo: 'PAGAR', parceiro: {nome: 'X'}, conta: 'itau', data: HOJE, valorCentavos: 1000};
const dEl = F.dfcElementos(f, '2026-11', '2026-11'), dAt = F.dfc(f, '2026-11', '2026-11');
ok(dEl.ok, 'DFC por elemento');
eq(dEl.colunas[0].variacaoCentavos, dAt.colunas[0].variacaoCentavos, 'mesma variação do DFC por atividade');
ok(dEl.colunas[0].confere, 'fecha com os bancos');
const el = (cod) => { let x = null; dEl.grupos.forEach((g) => g.subgrupos.forEach((s) => s.elementos.forEach((e) => { if (e.elemento === cod) x = e.meses['2026-11']; }))); return x; };
eq([el('2113'), el('201'), el('202'), el('204'), el('101'), el('401'), el('402'), el('403'), el('004')], [-30000, -30000, -10000, -5000, 50000, -200, -890, -400, -1000], 'cada fluxo no seu elemento');
eq(dEl.grupos.map((g) => g.grupo), ['1', '2', '3', '4'], 'grupos em ordem');
const fl = F.fluxoCaixa({fin: f}, HOJE, {granularidade: 'SEMANA', porGrupo: true});
ok(Array.isArray(fl.porGrupo) && fl.porGrupo.length, 'fluxo aberto por grupo');
fl.colunas.forEach((c, i) => {
  const soma = fl.porGrupo.reduce((s, g) => s + g.valores[i], 0);
  eq(soma, c.passada ? c.entradas - c.saidas : c.entradas - c.saidas, 'semana ' + c.inicio + ': grupos somam entradas − saídas (títulos)');
});
eq(F.fluxoCaixa({fin: f}, HOJE, {granularidade: 'SEMANA'}).porGrupo, undefined, 'sem a opção, nada muda');


// ── Relatórios com elemento (F9) ───────────────────────────────────────────
{
  const R = require('./public/shared/financeiro-relatorios');
  const g = fin();
  g.titulos.P1.criadoPor = 'Ana';
  g.classificacoes.P1 = {elemento: '2113', formaPagamento: 'PIX', rateio: [{centro: 'ADMINISTRATIVO', percentual: 70}, {centro: 'PRODUCAO', percentual: 30}]};
  let r = R.relGastosCentroCusto(g, {de: '2026-10-01', ate: '2026-11-30', agrupar: 'ELEMENTO'});
  ok(!r.erro, 'gastos por elemento');
  eq(r.linhas.filter((l) => !l.destaque).map((l) => [l.elemento, l.centro, l.valor]),
    [['201 Matéria-prima', 'Sem centro de custo', 30000], ['202 Embalagem', 'Sem centro de custo', 10000], ['204 Frete sobre compras', 'Sem centro de custo', 5000],
      ['2113 Aluguel', 'Administrativo', 21000], ['2113 Aluguel', 'Produção (geral)', 9000], ['408 A definir', 'Sem centro de custo', 7000]], 'elemento › centro, com o rateio');
  eq(r.totais.valor, 82000, 'total = títulos a pagar emitidos');
  eq(R.relGastosCentroCusto(g, {de: '2026-10-01', ate: '2026-11-30', elemento: '2113'}).totais.valor, 30000, 'filtro por elemento');
  eq(R.relGastosCentroCusto(g, {de: '2026-10-01', ate: '2026-11-30', centroCusto: 'PRODUCAO'}).totais.valor, 9000, 'centro do rateio filtra a parte');
  r = R.relLancamentoDespesas(g, {de: '2026-10-01', ate: '2026-11-30', situacao: 'TODOS'});
  const l1 = r.linhas.find((l) => l.documento === 'NF 1');
  eq([l1.elemento, l1.forma, l1.centro], ['2113 Aluguel', 'PIX', 'Administrativo 70% · Produção (geral) 30%'], 'despesas: elemento, forma e rateio');
  eq(R.relLancamentoDespesas(g, {de: '2026-10-01', ate: '2026-11-30', situacao: 'TODOS', elemento: '2113'}).linhas.length, 1, 'filtro por elemento');
  eq(R.relLancamentoDespesas(g, {de: '2026-10-01', ate: '2026-11-30', situacao: 'TODOS', formaPagamento: 'PIX'}).linhas.length, 1, 'filtro por forma');
  const gd = fin(); gd.baixas.B = {tipo: 'BAIXA', titulo: 'P1', tituloTipo: 'PAGAR', data: '2026-11-05', conta: 'itau', valorCentavos: 30000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, liquidoCentavos: 30000};
  r = F.relDfc(gd, {de: '2026-11', ate: '2026-11', abertura: 'ELEMENTO'});
  ok(!r.erro && r.linhas.some((l) => /408 A definir/.test(l.linha) && l['2026-11'] === -30000), 'DFC (relatório) aberto por elemento');
  ok(r.linhas.find((l) => l.linha === 'Diferença contra os bancos')['2026-11'] === 0, 'DFC por elemento fecha no relatório');
}

// Base vazia.
ok(F.dfcElementos({}, '2026-11', '2026-11').ok, 'DFC por elemento sem dados');
eq(F.parcelasParaLiquidar({}, {tipo: 'PAGAR', hoje: HOJE}), []);
eq(fs.readFileSync('public/shared/financeiro.js', 'utf8'), fs.readFileSync('functions/financeiro.js', 'utf8'), 'motor idêntico');
console.log('financeiro F9 (motor): ' + n + ' asserções OK');
