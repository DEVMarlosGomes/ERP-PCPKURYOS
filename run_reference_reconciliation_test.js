"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {buildReconciliationPlan, resolveAlias} = require("./scripts/firebase-merge/reference-reconciliation");

function fixture() {
  const official = {
    produtos: {
      "PEL-SEUN-0002": {descricao: "AGUA DE BELEZA 50ML"},
      "IMEDIATT-LISS-PASSO-2": {descricao: "IMEDIATT LISS PASSO 2"},
    },
    materiais: {"MPGR-00008": {codigo: "MPGR-00008"}},
    sku_historico: {"AGBE-SEUN-0001": "PEL-SEUN-0002"},
  };
  const current = JSON.parse(JSON.stringify(official));
  current.ops = {OP1: {sku: "-", produto: "IMEDIATT LISS PASSO 2"}};
  current.especificacoes = {"MPGR-00008__v1": {codProduto: "MPGR-00008", tipoItem: "MATERIAL"}};
  current.formulas = {"AGBE-SEUN-0001__v1": {codProduto: "AGBE-SEUN-0001"}};
  current.pendencias_setor = {
    P1: {status: "ABERTA", tipo: "REFERENCIA_IMPORTACAO", colecao: "ops", registroKey: "OP1", campo: "sku", valorAusente: "-"},
    P2: {status: "ABERTA", tipo: "REFERENCIA_IMPORTACAO", colecao: "especificacoes", registroKey: "MPGR-00008__v1", campo: "codProduto", valorAusente: "MPGR-00008"},
    P3: {status: "ABERTA", tipo: "REFERENCIA_IMPORTACAO", colecao: "formulas", registroKey: "AGBE-SEUN-0001__v1", campo: "codProduto", valorAusente: "AGBE-SEUN-0001"},
  };
  return {official, current};
}

test("resolve cadeia de alias ate o produto terminal", () => {
  assert.equal(resolveAlias("A", {sku_historico: {A: "B", B: "C"}}), "C");
});

test("classifica produto, material e placeholder sem reescrever historico", () => {
  const {official, current} = fixture();
  const plan = buildReconciliationPlan(official, current, {resolvedAt: "2026-11-02T20:00:00.000Z"});
  assert.equal(plan.counts.pendingOpen, 3);
  assert.equal(plan.counts.pendingResolved, 3);
  assert.equal(plan.counts.materialReferences, 1);
  assert.equal(plan.counts.placeholderReferences, 1);
  assert.equal(plan.counts.productReferences, 1);
  assert.equal(plan.counts.historicalRecordsRewritten, 0);
  assert.equal(plan.changes.some((entry) => entry.path.startsWith("/ops/")), false);
  assert.ok(plan.changes.some((entry) => entry.path === "/pendencias_setor/P1/produtoKeyResolvido" && entry.after === "IMEDIATT-LISS-PASSO-2"));
  assert.ok(plan.changes.some((entry) => entry.path === "/pendencias_setor/P2/materialKeyResolvido" && entry.after === "MPGR-00008"));
});

test("nao cria alias global para placeholder '-'", () => {
  const {official, current} = fixture();
  const plan = buildReconciliationPlan(official, current, {resolvedAt: "2026-11-02T20:00:00.000Z"});
  assert.equal(plan.changes.some((entry) => entry.path === "/sku_historico/-"), false);
});

test("falha fechado quando existe pendencia sem evidencia", () => {
  const {official, current} = fixture();
  current.pedidos = {X: {sku: "SEM-EVIDENCIA", produto: "Produto"}};
  current.pendencias_setor.P4 = {status: "ABERTA", tipo: "REFERENCIA_IMPORTACAO", colecao: "pedidos", registroKey: "X", campo: "sku", valorAusente: "SEM-EVIDENCIA"};
  assert.throws(() => buildReconciliationPlan(official, current), /sem decisao segura/);
});

test("segunda execucao nao reabre pendencia resolvida", () => {
  const {official, current} = fixture();
  Object.values(current.pendencias_setor).forEach((pending) => { pending.status = "RESOLVIDA"; });
  const plan = buildReconciliationPlan(official, current, {resolvedAt: "2026-11-02T20:00:00.000Z"});
  assert.equal(plan.counts.pendingOpen, 0);
  assert.equal(plan.changes.length, 0);
});
