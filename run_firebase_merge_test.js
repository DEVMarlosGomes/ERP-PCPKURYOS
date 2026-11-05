"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {planMerge, verifyPreconditions, createBatches, createRevertEntries} = require("./scripts/firebase-merge/core");

const excludedRoots = new Map();
const base = {produtos: {SKU1: {sku: "SKU1", descricao: "Produto"}}, materiais: {MP1: {mpCodigo: "MP1", nome: "Material"}}};
function plan(extraSource, extraCurrent = {}) { return planMerge({...base, ...extraSource}, {...base, ...extraCurrent}, {excludedRoots}); }

test("inclui registro novo sem alterar o identificador", () => {
  const result = plan({clientes: {C1: {nome: "Cliente"}}}, {clientes: {}});
  assert.equal(result.counts.newRecords, 1);
  assert.ok(result.changes.some((x) => x.path === "/clientes/C1/nome"));
});

test("ignora registro idêntico", () => {
  const result = plan({clientes: {C1: {ativo: false, limite: 0}}}, {clientes: {C1: {ativo: false, limite: 0}}});
  assert.equal(result.changes.filter((x) => x.root === "clientes").length, 0);
  assert.ok(result.records.some((x) => x.root === "clientes" && x.status === "identical"));
});

test("complementa campo ausente e preserva zero/false", () => {
  const result = plan({clientes: {C1: {nome: "A", limite: 0, ativo: false}}}, {clientes: {C1: {nome: "A"}}});
  const values = result.changes.filter((x) => x.root === "clientes").map((x) => x.after);
  assert.ok(values.includes(false));
  assert.ok(values.includes(0));
});

test("preserva conflito para decisão", () => {
  const result = plan({clientes: {C1: {nome: "Origem"}}}, {clientes: {C1: {nome: "Atual"}}});
  assert.equal(result.conflicts.find((x) => x.path === "/clientes/C1/nome").before, "Atual");
  assert.equal(result.changes.filter((x) => x.root === "clientes").length, 0);
});

test("bloqueia referência inválida", () => {
  const result = plan({formulas: {F1: {codProduto: "INEXISTENTE", versao: 1}}});
  assert.ok(result.rejected.some((x) => x.path === "/formulas/F1"));
  assert.equal(result.changes.filter((x) => x.root === "formulas").length, 0);
});

test("segunda execução é idempotente", () => {
  const first = plan({clientes: {C1: {nome: "Cliente", ativo: true}}}, {clientes: {}});
  const second = plan({clientes: {C1: {nome: "Cliente", ativo: true}}}, {clientes: {C1: {nome: "Cliente", ativo: true}}});
  assert.ok(first.changes.length > second.changes.length);
  assert.equal(second.changes.filter((x) => x.root === "clientes").length, 0);
});

test("retoma em lotes sem repetir caminhos concluídos", () => {
  const result = plan({clientes: {C1: {a: 1, b: 2, c: 3}}}, {clientes: {}});
  const entries = result.changes.filter((x) => x.root === "clientes");
  const batches = createBatches(entries, 1);
  const completed = new Set(Object.keys(batches[0]).map((p) => `/${p}`));
  const remaining = entries.filter((x) => !completed.has(x.path));
  assert.equal(batches.length, 3);
  assert.equal(remaining.length, 2);
});

test("detecta alteração concorrente", () => {
  const result = plan({clientes: {C1: {nome: "Cliente"}}}, {clientes: {}});
  assert.equal(verifyPreconditions(result, {clientes: {C1: {nome: "Outro"}}}, result.changes.filter((x) => x.root === "clientes")).length, 1);
});

test("reversão é limitada e recusa mudança posterior", () => {
  const result = plan({clientes: {C1: {nome: "Cliente"}}}, {clientes: {}});
  const entry = result.changes.find((x) => x.root === "clientes");
  const clean = createRevertEntries(result, [entry.path], {clientes: {C1: {nome: "Cliente"}}});
  assert.equal(clean.entries[0].after, null);
  const changed = createRevertEntries(result, [entry.path], {clientes: {C1: {nome: "Editado depois"}}});
  assert.equal(changed.changedAfter.length, 1);
});

test("não importa estados de efeito operacional", () => {
  const result = planMerge({notificacoes_op_encerrada: {OP1: {E1: {status: "ENVIADO"}}}}, {}, {});
  assert.equal(result.changes.length, 0);
  assert.equal(result.excluded[0].root, "notificacoes_op_encerrada");
});

test("rejeita divergência estrutural sem substituir nó escalar", () => {
  const result = plan({clientes: {C1: {nome: "Cliente"}}}, {clientes: {C1: "legado"}});
  assert.ok(result.rejected.some((x) => x.reason.includes("tipo estrutural")));
  assert.equal(result.changes.filter((x) => x.root === "clientes").length, 0);
});

test("null da fonte nunca vira exclusão", () => {
  const result = plan({clientes: {C1: {nome: null}}}, {clientes: {C1: {nome: "Preservado"}}});
  assert.ok(result.rejected.some((x) => x.path === "/clientes/C1/nome"));
  assert.equal(result.changes.filter((x) => x.root === "clientes").length, 0);
});

test("fonte autorizada sobrescreve divergência sem duplicar registro", () => {
  const result = planMerge({...base, clientes: {C1: {nome: "Mais atual"}}}, {...base, clientes: {C1: {nome: "Antigo"}}}, {excludedRoots, conflictPolicy: "source"});
  const overwrite = result.changes.find((x) => x.path === "/clientes/C1/nome");
  assert.equal(overwrite.action, "overwrite");
  assert.equal(overwrite.after, "Mais atual");
  assert.equal(result.counts.overwrittenRecords, 1);
});

test("referência órfã é importada e gera uma única pendência determinística", () => {
  const source = {...base, formulas: {F1: {codProduto: "SKU-ORFAO", versao: 1}}};
  const first = planMerge(source, base, {excludedRoots, invalidReferencePolicy: "flag"});
  assert.equal(first.referenceWarnings.length, 1);
  assert.ok(first.changes.some((x) => x.path === "/formulas/F1/codProduto"));
  const pending = first.changes.filter((x) => x.root === "pendencias_setor");
  assert.ok(pending.length > 0);
  const current = JSON.parse(JSON.stringify(base));
  for (const entry of first.changes) {
    const parts = entry.path.slice(1).split("/");
    let cursor = current;
    for (let i = 0; i < parts.length - 1; i++) cursor = cursor[parts[i]] || (cursor[parts[i]] = {});
    cursor[parts[parts.length - 1]] = entry.after;
  }
  const second = planMerge(source, current, {excludedRoots, invalidReferencePolicy: "flag"});
  assert.equal(second.changes.length, 0);
});

test("preserva metadados técnicos de e-mail para não repetir efeitos", () => {
  const source = {...base, pedidos_comerciais: {P1: {status: "APROVADO", versoes: {v2: {email: {status: "ERRO", em: "antes"}}}}}};
  const current = {...base, pedidos_comerciais: {P1: {status: "RASCUNHO", versoes: {v2: {email: {status: "ENVIADO", em: "depois"}}}}}};
  const result = planMerge(source, current, {excludedRoots, conflictPolicy: "source"});
  assert.ok(result.changes.some((x) => x.path === "/pedidos_comerciais/P1/status"));
  assert.equal(result.changes.some((x) => x.path.includes("/email/")), false);
});

test("aceita SKU antigo quando sku_historico aponta para produto atual", () => {
  const source = {...base, sku_historico: {ANTIGO: "SKU1"}, formulas: {F1: {codProduto: "ANTIGO", versao: 1}}};
  const result = planMerge(source, base, {excludedRoots, invalidReferencePolicy: "flag"});
  assert.equal(result.referenceWarnings.length, 0);
  assert.ok(result.changes.some((x) => x.path === "/formulas/F1/codProduto"));
});

test("valida especificacao tipo MATERIAL no catalogo de materiais", () => {
  const source = {...base, especificacoes: {"MP1__v1": {codProduto: "MP1", tipoItem: "MATERIAL", versao: "v1"}}};
  const result = planMerge(source, base, {excludedRoots, invalidReferencePolicy: "flag"});
  assert.equal(result.referenceWarnings.length, 0);
  assert.ok(result.changes.some((x) => x.path === "/especificacoes/MP1__v1/codProduto"));
});
