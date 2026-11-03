"use strict";
// Provas de comportamento PREEXISTENTE. Passar este arquivo confirma uma
// lacuna; não significa que o portão industrial já esteja protegido.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const Op = require("../emissao_op");
function scenario() {
  return {base: {config: {emitirOp: {bloquearSemSaldo: true}}, produtos: {P: {sku: "P"}},
    formulas: {P__v1: {status: "RASCUNHO", itens: {a: {mpCodigo: "MP", percentualMM: 100}}}},
    bom: {P__v1: {status: "RASCUNHO", itens: {}}}, materiais: {MP: {mpCodigo: "MP"}},
    estoque: {MP: {saldoAtual: 10, saldoEmpenhado: 0}}, ops: {}},
    input: {alertKey: "demo", op: {sku: "P", qtdPlanejada: 100, validade: "2027-11-01", formulaVersao: "v1", bomVersao: "v1",
      materiaisConsumo: {f_a: {mpCodigo: "MP", quantidade: 1, percentual: 100, origem: "formula"}}}}};
}
const actor = {uid: "pcp-demo", name: "PCP sintético", role: "pcp"};
const when = new Date("2026-11-03T15:00:00Z");
test("AUD-EPA-02: prepare atual aceita OP sem EPA e com fórmula/BOM em rascunho", () => {
  const {base, input} = scenario();
  const result = Op.prepare(base, input, actor, when);
  assert.ok(result.lote); assert.equal(result.op.epaId, undefined);
});
test("AUD-EPA-03: prepare atual aceita quantidade positiva enviada sem recalcular consumo", () => {
  const {base, input} = scenario(); input.op.materiaisConsumo.f_a.quantidade = 0.001;
  const result = Op.prepare(base, input, actor, when);
  assert.equal(result.op.materiaisConsumo.f_a.quantidade, 0.001);
  assert.equal(base.estoque.MP.saldoEmpenhado, 0.001);
});
test("AUD-EPA-03: identificação de material pode divergir da fórmula sob a mesma chave", () => {
  const {base, input} = scenario();
  base.materiais.OUTRA = {mpCodigo: "OUTRA"}; base.estoque.OUTRA = {saldoAtual: 10};
  input.op.materiaisConsumo.f_a.mpCodigo = "OUTRA";
  const result = Op.prepare(base, input, actor, when);
  assert.equal(result.op.materiaisConsumo.f_a.mpCodigo, "OUTRA");
});
