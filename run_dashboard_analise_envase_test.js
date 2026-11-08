"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("public/dashboard_analise.html", "utf8");
assert.match(html, /db\.ref\('config'\)\.once\('value'/, "a análise precisa carregar o mesmo cadastro de linhas do Diário");
assert.match(html, /if \(!isLinhaDeProducaoAnalise\(p\.lin\)\) return false;/, "todo KPI de produção deve excluir Rotulagem e postos");

const inicio = html.indexOf("function isLinhaDeProducaoAnalise");
const fim = html.indexOf("function filterProducao", inicio);
assert.ok(inicio >= 0 && fim > inicio, "classificador de Envase não encontrado");

const contexto = {
  RAW: {
    configLive: {
      linhas: ["Linha 1", "Linha 2", "Linha 3"],
      rotulagem: ["Rotulagem 01", "Rotulagem 02"],
      postosTrabalho: ["Celofane"],
    },
  },
};
vm.createContext(contexto);
vm.runInContext(`${html.slice(inicio, fim)}; this.classificar = isLinhaDeProducaoAnalise;`, contexto);

assert.equal(contexto.classificar("Linha 1"), true);
assert.equal(contexto.classificar("Rotulagem 01"), false);
assert.equal(contexto.classificar("Celofane"), false);
assert.equal(contexto.classificar("Linha extraordinária"), true, "fallback do Diário deve ser preservado");

const registros0311 = [
  ["Linha 3", 0], ["Rotulagem 01", 5012], ["Linha 2", 1112],
  ["Linha 1", 2256], ["Rotulagem 02", 1344], ["Linha 2", 1362],
  ["Rotulagem 01", 4250], ["Rotulagem 02", 834], ["Celofane", 795],
  ["Linha 1", 4073],
];
const totalAnterior = registros0311.reduce((soma, [, qtd]) => soma + qtd, 0);
const totalEnvase = registros0311
  .filter(([linha]) => contexto.classificar(linha))
  .reduce((soma, [, qtd]) => soma + qtd, 0);

assert.equal(totalAnterior, 21038, "reproduz a contagem inflada observada no Dashboard Análise");
assert.equal(totalEnvase, 8803, "a análise deve parear com o Dashboard Diário em 03/11");
assert.equal(totalAnterior - totalEnvase, 12235, "Rotulagem e Celofane explicam integralmente a diferença");

console.log("run_dashboard_analise_envase_test: 10 verificações OK");
