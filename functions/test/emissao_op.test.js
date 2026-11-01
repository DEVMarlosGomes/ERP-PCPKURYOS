"use strict";

const assert = require("node:assert/strict");
const {test} = require("node:test");
const Emissao = require("../emissao_op");

function base() {
  return {
    config: {emitirOp: {bloquearSemSaldo: true}, contadores: {lotesPorDia: {}}},
    usuarios: {u1: {role: "pcp"}},
    produtos: {SKU1: {sku: "SKU1", descricao: "Produto"}},
    formulas: {SKU1__v1: {codProduto: "SKU1", versao: "v1", itens: {i1: {mpCodigo: "MP1", percentualMM: 100}}}},
    bom: {SKU1__v1: {versao: "v1", itens: {}}},
    materiais: {MP1: {mpCodigo: "MP1", unidade: "kg"}},
    estoque: {MP1: {materialCodigo: "MP1", saldoAtual: 10, saldoEmpenhado: 7}},
    ops: {}
  };
}

function input() {
  return {alertKey: "a1", op: {sku: "SKU1", produto: "Produto", qtdPlanejada: 100, validade: "2027-01-01T00:00:00.000Z", formulaVersao: "v1", bomVersao: "v1", materiaisConsumo: {f_i1: {mpCodigo: "MP1", quantidade: 4, unidade: "kg", origem: "formula", percentual: 100}}}};
}

test("saldo disponível desconta empenhos anteriores", () => {
  assert.deepEqual(Emissao.availableForOrder({saldoAtual: 10, saldoEmpenhado: 7}, null), {registered: true, available: 3});
});

test("PCP não emite quando saldo disponível é insuficiente", () => {
  assert.throws(() => Emissao.prepare(base(), input(), {uid: "u1", name: "PCP", role: "pcp"}, new Date("2026-11-01T12:00:00-03:00")), /Sem saldo/);
});

test("administrador libera com motivo e empenha na mesma alteração", () => {
  const db = base();
  const data = input();
  data.motivoLiberacao = "Compra chega antes da separação";
  const result = Emissao.prepare(db, data, {uid: "adm", name: "Admin", role: "admin"}, new Date("2026-11-01T12:00:00-03:00"));
  assert.equal(result.op.emissaoServidor.versao, 1);
  assert.equal(db.estoque.MP1.saldoEmpenhado, 11);
  assert.equal(db.ops[Emissao.key(result.lote)].liberacaoSemSaldo.porUid, "adm");
});

test("numeração pula lote já existente", () => {
  const db = base();
  db.config.emitirOp.bloquearSemSaldo = false;
  db.config.contadores.lotesPorDia["26305"] = 1;
  db.ops["26305-02"] = {lote: "26305/02"};
  const result = Emissao.prepare(db, input(), {uid: "u1", name: "PCP", role: "pcp"}, new Date("2026-11-01T12:00:00-03:00"));
  assert.equal(result.lote, "26305/03");
});

test("rejeita consumo que omite item cadastrado da fórmula", () => {
  const data = input();
  data.op.materiaisConsumo = {f_outro: {mpCodigo: "MP1", quantidade: 4, origem: "formula", percentual: 100}};
  assert.throws(() => Emissao.prepare(base(), data, {uid: "u1", name: "PCP", role: "pcp"}, new Date("2026-11-01T12:00:00-03:00")), /não corresponde/);
});
