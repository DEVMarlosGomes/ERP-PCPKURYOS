"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const Epa = require("../epa");
const {fixture} = require("./fixtures/epa");
const pending = (spec, occurrence) => Epa.validate(spec, occurrence).pending.map(p => p.codigo);

test("oito variantes coerentes e sem mutação da fonte", () => {
  const {spec, occurrence} = fixture(), before = JSON.stringify(spec);
  assert.equal(Epa.validate(spec, occurrence).ready, true);
  assert.equal(Epa.snapshot(spec, occurrence).variants.length, 8);
  assert.equal(JSON.stringify(spec), before);
});
test("ausência e false explícito são estados distintos", () => {
  const {spec} = fixture();
  assert.equal(Epa.validate(spec).ready, true);
  spec.marking = {applicable: true, value: ""};
  assert.ok(pending(spec).includes("CAMPO_OBRIGATORIO"));
  spec.marking = {};
  assert.ok(pending(spec).includes("APLICABILIDADE_AUSENTE"));
});
test("pendência estruturada identifica responsável, origem e correção", () => {
  const {spec} = fixture(); spec.customer.name = "";
  const p = Epa.validate(spec).pending.find(p => p.campo === "customer.name");
  assert.equal(p.entidadeOrigem, "DEMO-cliente"); assert.equal(p.versaoOrigem, "v1");
  assert.equal(p.responsavel, "Comercial"); assert.equal(p.caminhoCorrecao.entidade, "cliente");
});
for (const total of [99.9, 100.1, NaN, Infinity, "100", 0]) test("fórmula inválida " + total, () => {
  const {spec} = fixture(); spec.variants[0].formulaTotal = total;
  assert.ok(pending(spec).includes("FORMULA_NAO_FECHA_100"));
});
test("tolerância é estrita e explícita", () => {
  const {spec} = fixture(); spec.variants[0].formulaTotal = 99.9999;
  assert.equal(Epa.validate(spec).ready, true);
  spec.variants[0].formulaTotal = 99.999;
  assert.ok(pending(spec).includes("FORMULA_NAO_FECHA_100"));
});
test("MPES de aprovação não vale como material final", () => {
  const {spec} = fixture(); Object.assign(spec.components[0], {type: "MPES", approvalSupplierCode: "APROV-1"});
  assert.ok(pending(spec).includes("MPES_SEM_CODIGO_FINAL"));
  spec.components[0].finalSupplierCode = "FINAL-1";
  assert.equal(Epa.validate(spec).ready, true);
});
test("material provisório bloqueado mesmo com código", () => {
  const {spec} = fixture(); spec.components[0].provisional = true;
  assert.ok(pending(spec).includes("MATERIAL_PROVISORIO"));
});
test("origem não aprovada, desatualizada e revisão divergente bloqueiam", () => {
  const {spec} = fixture(); spec.sources.formula.approved = false;
  assert.ok(pending(spec).includes("ORIGEM_NAO_APROVADA"));
  spec.sources.formula.approved = true; spec.sources.bom.outdated = true;
  assert.ok(pending(spec).includes("ORIGEM_NAO_APROVADA"));
  spec.variants[0].formulaRevision = "v2";
  assert.ok(pending(spec).includes("FORMULA_DIVERGENTE"));
});
test("zeros iniciais mantidos, código numérico e dígito incorreto recusados", () => {
  const {spec} = fixture(), v = spec.variants[0];
  assert.equal(Epa.gtin(v.gtin, 13), true); assert.ok(v.gtin.startsWith("0"));
  assert.equal(Epa.gtin(Number(v.gtin), 13), false);
  v.masterGtin = v.masterGtin.slice(0, -1) + ((Number(v.masterGtin.at(-1)) + 1) % 10);
  assert.ok(pending(spec).includes("GTIN_INVALIDO"));
});
test("SKU H nunca herda F: duplicação e aplicação desconhecida bloqueadas", () => {
  const {spec, occurrence} = fixture(); occurrence.variants[7].sku = occurrence.variants[5].sku;
  assert.ok(pending(spec, occurrence).includes("VARIANTE_OP_INVALIDA"));
  spec.components[0].skus = ["OUTRA-VARIANTE"];
  assert.ok(pending(spec).includes("APLICACAO_INVALIDA"));
  assert.ok(pending(spec).includes("SKU_SEM_COMPONENTES"));
});
test("placeholder lote, validade impossível e peso zero não validam ocorrência", () => {
  const {spec, occurrence} = fixture(); Object.assign(occurrence.variants[0], {lot: "0000", expiresAt: "2027-02-30", masterWeightKg: 0});
  const codes = pending(spec, occurrence);
  for (const c of ["CAMPO_OBRIGATORIO", "DATAS_INVALIDAS", "PESO_MASTER_AUSENTE"]) assert.ok(codes.includes(c));
});
test("quantidade da caixa parcial não é arredondada silenciosamente", () => {
  const {spec, occurrence} = fixture(); occurrence.variants[0].quantity = 97;
  assert.ok(pending(spec, occurrence).includes("CAIXA_PARCIAL"));
  occurrence.variants[0].partialMasterApproved = true;
  assert.equal(Epa.validate(spec, occurrence).ready, true);
  assert.equal(occurrence.variants[0].quantity, 97);
});
test("OP de outro cliente não é aceita", () => {
  const {spec, occurrence} = fixture(); occurrence.customerId = "OUTRO";
  assert.ok(pending(spec, occurrence).includes("TITULAR_DIVERGENTE"));
});
test("sem conversão presumida mL/g no enchimento", () => {
  const {spec} = fixture(); spec.fill.unit = "g";
  assert.ok(pending(spec).includes("ENCHIMENTO_INVALIDO"));
});
test("ativo exige hash/versão/aprovação e variantes explícitas", () => {
  const {spec} = fixture(); spec.assets = [{id: "imagem", url: "https://mutavel/imagem.png"}];
  assert.ok(pending(spec).includes("ATIVO_NAO_VERSIONADO"));
});
test("snapshot exclui composição, custos, contatos e equipamentos em todas as origens", () => {
  const {spec, occurrence} = fixture();
  spec.formula = {secret: "SEGREDO"}; spec.sources.formula.payload = "SEGREDO";
  spec.customer.email = "SEGREDO"; spec.product.margin = "SEGREDO";
  spec.components[0].cost = "SEGREDO"; spec.equipment = "SEGREDO"; occurrence.price = "SEGREDO";
  const s = Epa.snapshot(spec, occurrence);
  assert.equal(JSON.stringify(s).includes("SEGREDO"), false);
  spec.variants[7].name = "Alterado";
  assert.equal(s.variants[7].name, "Variante demonstrativa 8");
});
test("digest ignora ordem das chaves mas detecta alteração técnica", () => {
  assert.equal(Epa.digest({a: 1, b: 2}), Epa.digest({b: 2, a: 1}));
  assert.notEqual(Epa.digest({a: 1}), Epa.digest({a: 2}));
});
