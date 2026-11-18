'use strict';
/* A3 do prompt mestre (Q7 do Marlos, 17/11/2026): a janela liberada de Controladoria › Bloqueio de
   período vale no SERVIDOR de cada movimento. Prova de ligação: cada callable de movimento começa
   pela trava do seu módulo, e o helper (extraído do index.js, com banco simulado) recusa data fora
   da janela com a mensagem do bloqueio e deixa passar quando o movimento não tem janela. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };

const idx = fs.readFileSync('functions/index.js', 'utf8');
function corpo(nome) { const i = idx.indexOf('exports.' + nome + ' = '); assert.ok(i >= 0, 'callable ' + nome); return idx.slice(i, i + 2000); }
const LIGACOES = {
  NF_ENTRADA: ['registrarRecebimento', 'cancelarRecebimento', 'registrarDevolucaoRecebimento'],
  NF_SAIDA: ['faturamentoCargaPA'],
  ESTOQUE: ['alterarTitularidadeEstoque', 'confirmarExpedicaoPA', 'finalizarConferenciaPA', 'receberDevolucaoCliente'],
  PRODUCAO: ['manipulacaoLoteServidor', 'apontarRetrabalho'],
};
Object.entries(LIGACOES).forEach(([mod, nomes]) => nomes.forEach((nome) => ok(new RegExp('await exigirPeriodoLiberado\\("' + mod + '"').test(corpo(nome)), nome + ' respeita o bloqueio de ' + mod)));
ok(/acao === "REGISTRAR_NF"\) await exigirPeriodoLiberado\("NF_SAIDA", dataDoMovimento\(\(request\.data \|\| \{\}\)\.nf, \["emitidaEm"\]\)\)/.test(corpo('faturamentoCargaPA')), 'Faturamento: trava só no registro da NF, pela data de emissão');
ok(/dataDoMovimento\(request\.data, \["data", "dataRecebimento"\]\)/.test(corpo('registrarRecebimento')), 'Recebimento: pela data do recebimento');
// Fiscal e Financeiro já respeitam pelos próprios servidores.
ok(/periodoLiberado\(\(base\.ctl \|\| \{\}\)\.bloqueio_periodo, "FISCAL"/.test(fs.readFileSync('functions/fiscal_servidor.js', 'utf8')), 'Fiscal respeita o módulo FISCAL');
ok(/periodoLiberado\(\(base\.ctl \|\| \{\}\)\.bloqueio_periodo, "FINANCEIRO"/.test(fs.readFileSync('functions/financeiro_servidor.js', 'utf8')), 'Financeiro respeita o módulo FINANCEIRO');

// Helper extraído do index.js, com o banco simulado.
const ini = idx.indexOf('function hojeSP()'), fim = idx.indexOf('\n}\n', idx.indexOf('async function exigirPeriodoLiberado')) + 3;
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
function montar(cfg) {
  const db = {ref: () => ({get: async () => ({val: () => cfg})})};
  return new Function('db', 'HttpsError', 'require', idx.slice(ini, fim) + '; return {hojeSP, dataDoMovimento, exigirPeriodoLiberado};')(db, HttpsError, (m) => require(m.replace('./', './functions/')));
}
(async () => {
  const cfg = {modulos: {NF_ENTRADA: {de: '2026-11-01', ate: '2050-12-31'}}};
  const h = montar(cfg);
  await assert.rejects(() => h.exigirPeriodoLiberado('NF_ENTRADA', '2026-10-31'), (e) => e.code === 'failed-precondition' && /N\.F\. Entrada: período bloqueado/.test(e.message)); n++;
  await h.exigirPeriodoLiberado('NF_ENTRADA', '2026-11-18'); n++;
  await h.exigirPeriodoLiberado('ESTOQUE', '1999-01-01'); n++;
  await montar(null).exigirPeriodoLiberado('NF_SAIDA', '1999-01-01'); n++;
  ok(h.dataDoMovimento({data: '2026-11-05T10:00'}, ['data']) === '2026-11-05', 'data do movimento informada');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(h.dataDoMovimento({}, ['data'])), 'sem data: hoje (São Paulo)');
  console.log(`OK bloqueio de período nos movimentos: ${n} verificações — NF de entrada, NF de saída, estoque e produção recusam fora da janela no servidor.`);
})().catch((e) => { console.error(e); process.exit(1); });
