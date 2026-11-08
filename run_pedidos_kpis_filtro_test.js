"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Kpis = require("./public/shared/pedidos-kpis.js");

const status = (pedido) => pedido.status;
const todos = [
  { id: "A", status: "andamento", linha: "Linha 1" },
  { id: "B", status: "andamento", linha: "Linha 2" },
  { id: "C", status: "concluido", linha: "Linha 1" },
  { id: "D", status: "encerrado", linha: "Linha 3" },
];

assert.deepEqual(Kpis.ops(todos, status), { total: 4, andamento: 2, concluido: 1, encerrado: 1 });
assert.deepEqual(Kpis.ops(todos.filter((p) => p.linha === "Linha 1"), status), {
  total: 2, andamento: 1, concluido: 1, encerrado: 0,
});
assert.deepEqual(Kpis.ops(todos.filter((p) => p.id === "B"), status), {
  total: 1, andamento: 1, concluido: 0, encerrado: 0,
});

const comerciais = [
  { id: "1", categoria: "aberto", produzido: 0 },
  { id: "2", categoria: "aberto", produzido: 40 },
  { id: "3", categoria: "completo", produzido: 100 },
];
assert.deepEqual(Kpis.comerciais(comerciais), { total: 3, aberto: 1, parcial: 1, completo: 1 });
assert.deepEqual(Kpis.comerciais(comerciais.filter((p) => p.categoria === "aberto")), {
  total: 2, aberto: 1, parcial: 1, completo: 0,
});
assert.deepEqual(Kpis.comerciais(comerciais.filter((p) => p.id === "2")), {
  total: 1, aberto: 0, parcial: 1, completo: 0,
});

const tela = fs.readFileSync("public/pedidos.html", "utf8");
assert.match(tela, /PedidosKpis\.ops\(list, pedidoStatus\)/, "KPIs de OP usam a lista já filtrada");
assert.match(tela, /PedidosKpis\.comerciais\(rows\)/, "KPIs comerciais usam as linhas já filtradas");
assert.doesNotMatch(tela, /Stats from ALL pedidos/, "a regressão de consolidado global não pode voltar");

console.log("run_pedidos_kpis_filtro_test: 9 verificações OK");
