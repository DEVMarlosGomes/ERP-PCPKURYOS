"use strict";
/* Dashboard de Análise: produção de envase por DIA DO APONTAMENTO (13/11/2026).
   Relato: 09–11/11 deu 33.118 un. e a tela mostrava 36 mil e pouco. Medido com a
   tela real e os dados de produção: 38.510 contra 33.070 pela data do apontamento.
   Três causas, reproduzidas aqui com as funções da própria página:
   1. o dia vinha do INÍCIO do período apontado (fechamento de 12/11 que começou
      às 20h de 11/11 caía em 11/11; o de 09/11 iniciado em 06/11 sumia);
   2. a data era convertida para UTC (apontamento depois das 21h pulava de dia);
   3. apontamento "sem data" (importação antiga) passava em qualquer período.
   A regra passa a ser a mesma do Dashboard Diário e do placar da TV. */
process.env.TZ = "America/Sao_Paulo";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("public/dashboard_analise.html", "utf8");
function trecho(de, ate) {
  const i = html.indexOf(de), f = html.indexOf(ate, i + de.length);
  assert.ok(i >= 0 && f > i, "trecho não encontrado: " + de);
  return html.slice(i, f);
}
const contexto = {
  RAW: {producao: [], pedidos: [], configLive: {linhas: ["Linha 1", "Linha 2"], rotulagem: ["Rotulagem 01"], postosTrabalho: ["Celofane"]}},
  filters: {dateFrom: "", dateTo: "", cliente: [], categoria: [], subcategoria: [], viscosidade: [], linha: [], search: ""},
  normalizeSearch: (s) => String(s || "").toLowerCase(),
};
vm.createContext(contexto);
vm.runInContext(
  trecho("function _weekStart(", "\nfunction preprocessRawData") + "\n" +
  "function preprocessRawData() {\n" + trecho("RAW.producao.forEach(p => {", "\nRAW.pedidos.forEach") + "\n}\n" +
  trecho("function isLinhaDeProducaoAnalise(", "\nfunction filterProducao") + "\n" +
  trecho("function filterProducao(", "\n}\n") + "\n}\n" +
  "this.pre = preprocessRawData; this.filtrar = filterProducao;", contexto);

const P = (dia, dt, u, lin) => ({dia, dt, u, h: 1, lin: lin || "Linha 1", cli: "X", cat: "C", sub: "S", visc: "L", sku: "", desc: "", lot: ""});
contexto.RAW.producao = [
  P("2026-11-09", "2026-11-06T19:02:29.303Z", 1820),   // fechamento de 09/11 que começou em 06/11
  P("2026-11-10", "2026-11-10T22:30:00", 500),          // depois das 21h: em UTC já é 11/11
  P("2026-11-11", "2026-11-11T15:05:06.583Z", 936),
  P("2026-11-12", "2026-11-11T20:04:41.752Z", 2064),   // fechamento de 12/11 que começou em 11/11
  P("sem-data", "sem-dataT08:00:00", 4752, "Linha 2"),  // importação antiga sem data
  P("2026-11-10", "2026-11-10T10:00:00", 999, "Rotulagem 01"),
];
contexto.pre();
const soma = (de, ate) => { contexto.filters.dateFrom = de; contexto.filters.dateTo = ate; return contexto.filtrar().reduce((s, p) => s + p.u, 0); };

assert.equal(soma("2026-11-09", "2026-11-09"), 1820, "fechamento conta no dia do apontamento, não no início do período");
assert.equal(soma("2026-11-10", "2026-11-10"), 500, "22h30 de 10/11 é 10/11 (nada de UTC); rotulagem fora");
assert.equal(soma("2026-11-11", "2026-11-11"), 936, "o fechamento de 12/11 não entra em 11/11");
assert.equal(soma("2026-11-12", "2026-11-12"), 2064);
assert.equal(soma("2026-11-09", "2026-11-11"), 1820 + 500 + 936, "período: só o que foi apontado nele; sem data fica de fora");
assert.equal(soma("", ""), 1820 + 500 + 936 + 2064 + 4752, "sem filtro de data ('Tudo'): o histórico sem data continua contando");
const mes = contexto.RAW.producao.find((p) => p.dia === "2026-11-12");
assert.equal(mes._ym, "2026-11", "agrupamento por mês segue o dia do apontamento");
assert.ok(fs.readFileSync("public/dashboard_analise.html", "utf8").includes("dia: date,"), "o registro leva o dia do apontamento");

console.log("run_dashboard_analise_dia_test: 8 verificações OK");
