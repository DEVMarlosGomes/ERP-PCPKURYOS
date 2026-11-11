'use strict';
/* Financeiro F8 (10/11/2026): relatórios. Cada relatório bate com a fonte (carteira,
   aging, saldo dos bancos, fluxo, DFC) e o CSV, lido de volta, tem os mesmos totais.
   docs/financeiro-fase0-lacunas.md. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const F = require('./functions/financeiro');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const HOJE = '2026-11-10';

function fin() {
  return {
    contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-10-01'},
      cx: {nome: 'Caixa', tipo: 'CAIXA', saldoInicialCentavos: 0, dataSaldoInicial: '2026-10-01'}},
    titulos: {
      P1: {tipo: 'PAGAR', valorCentavos: 30001, condicao: '30/60/90', baseVencimento: '2026-10-01', emissao: '2026-10-01', natureza: 'EMBALAGEM', documento: 'NF 10', parceiro: {nome: 'Embalagens SA', cnpj: '01234567000190'}, origem: {tipo: 'MANUAL'}},
      P2: {tipo: 'PAGAR', valorCentavos: 5000, vencimentoFixo: '2026-08-15', emissao: '2026-08-01', natureza: 'FRETE', documento: 'CT 7; urgente', parceiro: {nome: '=Transp'}, origem: {tipo: 'MANUAL'}},
      P3: {tipo: 'PAGAR', valorCentavos: 7000, emissao: '2026-11-01', natureza: 'OUTROS', documento: 'S/N', parceiro: {nome: 'Sem Prazo'}, origem: {tipo: 'MANUAL'}},
      R1: {tipo: 'RECEBER', valorCentavos: 50000, vencimentoFixo: '2026-11-30', emissao: '2026-11-01', natureza: 'RECEITA_VENDA', documento: 'NF 501', parceiro: {nome: 'Cliente "Bom"'}, origem: {tipo: 'MANUAL'}}
    },
    baixas: {
      B1: {tipo: 'BAIXA', titulo: 'P1', tituloTipo: 'PAGAR', natureza: 'EMBALAGEM', data: '2026-10-31', conta: 'itau', valorCentavos: 10000, jurosCentavos: 150, multaCentavos: 50, descontoCentavos: 0, liquidoCentavos: 10200},
      B2: {tipo: 'BAIXA', titulo: 'R1', tituloTipo: 'RECEBER', natureza: 'RECEITA_VENDA', data: '2026-11-05', conta: 'itau', valorCentavos: 20000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 500, liquidoCentavos: 19500},
      B2_estorno: {tipo: 'ESTORNO', estorna: 'B2', titulo: 'R1', tituloTipo: 'RECEBER', natureza: 'RECEITA_VENDA', data: '2026-11-06', conta: 'itau', valorCentavos: 20000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 500, liquidoCentavos: 19500}
    },
    movimentos: {M1: {tipoRegistro: 'MOVIMENTO', tipo: 'TRANSFERENCIA', conta: 'itau', destino: 'cx', data: '2026-11-02', valorCentavos: 3000}},
    parametros: {}
  };
}
// Lê o CSV de volta: tira o BOM, separa por ";" respeitando aspas, converte "1234,56".
function lerCsv(txt) {
  ok(txt.charCodeAt(0) === 0xFEFF, 'CSV começa com o BOM (acentos certos no Excel)');
  const linhas = txt.slice(1).split('\r\n').filter(Boolean).map((l) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ';') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out;
  });
  return {cab: linhas[0], corpo: linhas.slice(1, -1), total: linhas[linhas.length - 1]};
}
const cent = (s) => s === '' ? 0 : Math.round(Number(String(s).replace(',', '.')) * 100);
function confereCsv(rel, nome) {
  const c = lerCsv(F.relatorioCsv(rel));
  eq(c.cab, rel.colunas.map((x) => x.rotulo), nome + ': cabeçalho');
  eq(c.corpo.length, rel.linhas.length, nome + ': uma linha por linha da tela');
  rel.colunas.forEach((col, i) => {
    if (col.tipo !== 'valor' || col.semTotal) return;
    const soma = c.corpo.reduce((s, l) => s + cent(l[i]), 0);
    eq([cent(c.total[i]), soma], [rel.totais[col.chave], rel.totais[col.chave]], nome + ': total de "' + col.rotulo + '" = soma das linhas = tela');
  });
  return c;
}

const f = fin();
// ── Títulos ────────────────────────────────────────────────────────────────
let r = F.relTitulos(f, {tipo: 'PAGAR', hoje: HOJE});
const abertoCart = F.carteira(f).filter((s) => s.titulo.tipo === 'PAGAR').reduce((s, x) => s + x.saldoCentavos, 0);
eq(r.totais.aberto, abertoCart, 'em aberto do relatório = saldo da carteira');
eq(r.linhas.map((l) => [l.documento, l.parcela, l.situacao]), [['CT 7; urgente', '1/1', 'Vencida'], ['NF 10', '1/3', 'Quitada'], ['NF 10', '2/3', 'A vencer'], ['NF 10', '3/3', 'A vencer'], ['S/N', '1/1', 'Sem vencimento']], 'uma linha por parcela; sem vencimento no fim');
eq(r.linhas.find((l) => l.parcela === '1/3').cnpj, '01.234.567/0001-90', 'CNPJ com máscara (Excel não come o zero)');
let c = confereCsv(r, 'a pagar');
ok(c.corpo.some((l) => l.includes("'=Transp")), 'texto que vira fórmula leva apóstrofo');
ok(c.corpo.some((l) => l.includes('CT 7; urgente')), 'campo com ";" vai entre aspas e volta inteiro');
eq(F.relTitulos(f, {tipo: 'PAGAR', situacao: 'ABERTOS', hoje: HOJE}).linhas.length, 4, 'em aberto: sem a parcela quitada');
eq(F.relTitulos(f, {tipo: 'PAGAR', situacao: 'QUITADOS', hoje: HOJE}).linhas.map((l) => l.parcela), ['1/3']);
eq(F.relTitulos(f, {tipo: 'PAGAR', de: '2026-11-01', ate: '2026-11-30', hoje: HOJE}).linhas.map((l) => l.vencimento), ['2026-11-30'], 'por vencimento no mês');
eq(F.relTitulos(f, {tipo: 'PAGAR', data: 'EMISSAO', de: '2026-11-01', ate: '2026-11-30', hoje: HOJE}).linhas.map((l) => l.documento), ['S/N'], 'por emissão');
eq(F.relTitulos(f, {tipo: 'PAGAR', natureza: 'FRETE', hoje: HOJE}).linhas.length, 1);
eq(F.relTitulos(f, {tipo: 'PAGAR', parceiro: 'embal', hoje: HOJE}).linhas.length, 3, 'parceiro sem diferença de caixa');
r = F.relTitulos(f, {tipo: 'RECEBER', hoje: HOJE});
eq(r.totais.aberto, 50000, 'recebimento estornado volta a ficar em aberto');
c = confereCsv(r, 'a receber');
ok(c.corpo[0].includes('Cliente "Bom"'), 'aspas no texto preservadas');

// ── Baixas ─────────────────────────────────────────────────────────────────
r = F.relBaixas(f, {de: '2026-10-01', ate: '2026-11-30'});
eq(r.linhas.map((l) => [l.operacao, l.liquido]), [['pagamento', 10200], ['recebimento', 19500], ['Estorno de recebimento', -19500]]);
eq([r.totais.principal, r.totais.jurosMulta, r.totais.desconto, r.totais.liquido], [10000, 200, 0, 10200], 'estorno anula nos totais');
confereCsv(r, 'baixas');
eq(F.relBaixas(f, {de: '2026-11-01', ate: '2026-11-30', conta: 'cx'}).linhas.length, 0, 'filtro de conta');

// ── Aging ──────────────────────────────────────────────────────────────────
r = F.relAging(f, {tipo: 'PAGAR', hoje: HOJE});
const ag = F.aging({fin: f}, HOJE).PAGAR;
eq(['A_VENCER', 'D1_30', 'D31_60', 'D61_90', 'D90', 'SEM_VENCIMENTO'].map((k) => r.totais[k]), ['A_VENCER', 'D1_30', 'D31_60', 'D61_90', 'D90', 'SEM_VENCIMENTO'].map((k) => ag[k]), 'aging do relatório = aging do painel');
eq(r.linhas.find((l) => l.documento === 'CT 7; urgente').D61_90, 5000, 'vencido em 15/08: 87 dias');
confereCsv(r, 'aging');

// ── Extrato ────────────────────────────────────────────────────────────────
r = F.relExtrato(f, {conta: 'itau', de: '2026-11-01', ate: '2026-11-30'});
eq(r.totais.saldo, F.saldosBancarios(f, '2026-11-30').itau.saldoCentavos, 'saldo final do extrato = saldo do banco');
eq(r.linhas[0].historico, 'Saldo anterior');
eq(r.linhas[0].saldo, F.saldosBancarios(f, '2026-10-31').itau.saldoCentavos, 'saldo anterior = saldo do dia anterior');
c = confereCsv(r, 'extrato');
ok(!F.relExtrato(f, {conta: 'nada'}).linhas.length && F.relExtrato(f, {conta: 'nada'}).erro, 'conta inexistente explica');

// ── Fluxo e DFC ────────────────────────────────────────────────────────────
r = F.relFluxo({fin: f}, {granularidade: 'MES', hoje: HOJE});
const fl = F.fluxoCaixa({fin: f}, HOJE, {granularidade: 'MES'});
eq(r.linhas.map((l) => l.saldoProjetado), fl.colunas.map((x) => x.passada ? null : x.saldoProjetadoCentavos), 'fluxo do relatório = aba');
confereCsv(r, 'fluxo');
r = F.relDfc(f, {de: '2026-10', ate: '2026-11'});
const d = F.dfc(f, '2026-10', '2026-11');
eq(r.linhas.find((l) => l.linha === 'Saldo final')['2026-11'], d.colunas[1].saldoFinalCentavos);
eq(r.linhas.find((l) => l.linha === 'Diferença contra os bancos')['2026-11'], 0, 'DFC fecha no relatório');
const dc = lerCsv(F.relatorioCsv(r));
eq(dc.cab, ['', '10/2026', '11/2026'], 'DFC: meses como colunas');
ok(F.relDfc(f, {de: '2026-12', ate: '2026-10'}).erro, 'período inválido explica');

// ── Formatos ───────────────────────────────────────────────────────────────
eq([F.valorCsv(123456), F.valorCsv(-5), F.valorCsv(0), F.valorCsv(null), F.dataCsv('2026-11-10'), F.dataCsv('')], ['1234,56', '-0,05', '0,00', '', '10/11/2026', '']);
eq(fs.readFileSync('public/shared/financeiro.js', 'utf8'), fs.readFileSync('functions/financeiro.js', 'utf8'), 'motor idêntico');
console.log('financeiro F8 (relatórios): ' + n + ' asserções OK');
