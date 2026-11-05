"use strict";
// Identidades e números exclusivamente sintéticos. Não usar como cadastro GS1.
function code(body) {
  const sum = body.split("").reverse().reduce((s, d, i) => s + Number(d) * (i % 2 ? 1 : 3), 0);
  return body + ((10 - sum % 10) % 10);
}
function fixture() {
  const sources = Object.fromEntries(["projeto", "cliente", "kickoff", "bom", "formula", "amostra"].map(k => [k, {id: "DEMO-" + k, revision: "v1", approved: true}]));
  const variants = Array.from({length: 8}, (_, i) => ({sku: "DEMO/" + String.fromCharCode(65 + i), name: "Variante demonstrativa " + (i + 1), formulaId: sources.formula.id, formulaRevision: "v1", formulaTotal: 100,
    gtin: code(String(i + 1).padStart(12, "0")), masterGtin: code(String(i + 1).padStart(13, "0")), unitsPerMaster: 48, regulatory: {applicable: false, justification: "Fixture sintética, não é produto comercial."}}));
  const spec = {sources, customer: {name: "CLIENTE FICTÍCIO — DEMONSTRAÇÃO", taxId: "DEMO-NÃO-FISCAL", brand: "Marca de demonstração"},
    product: {name: "Produto sintético para ensaio documental", category: "DEMO", physicalForm: "Creme demonstrativo", amount: 200, unit: "mL", ncm: "DEMO-NÃO-FISCAL", cest: {applicable: false, justification: "Sem operação fiscal."}},
    variants, components: [{applicable: true, materialCode: "DEMO-EP", description: "Frasco de demonstração", specification: "Especificação fictícia para teste de legibilidade; não usar para compra.", revision: "v1", owner: "KURYOS", quantity: 1, unit: "un", validated: true, skus: variants.map(v => v.sku)}],
    fill: {declared: 200, maximum: 201, unit: "mL"}, marking: {applicable: false, justification: "Somente prévia sintética, sem gravação industrial."}, assets: []};
  const occurrence = {opId: "DEMO-OP-1", orderId: "DEMO-PEDIDO-1", customerId: sources.cliente.id, variants: variants.map(v => ({sku: v.sku, lot: "DEMO-LOTE-1", manufacturedAt: "2026-11-03", expiresAt: "2027-11-03", quantity: 96, unit: "un", masterWeightKg: 12}))};
  return {spec, occurrence};
}
module.exports = {fixture};
