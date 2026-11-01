"use strict";

const Prop = require("./propriedade_estoque");

function key(value) {
  return String(value || "").trim().replace(/[./[\]#$]/g, "-").replace(/\s+/g, "_").slice(0, 60);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function materialByCode(materials, code) {
  const direct = (materials || {})[key(code)];
  if (direct && direct.mpCodigo === code) return direct;
  return Object.values(materials || {}).find(item => item && item.mpCodigo === code) || direct || null;
}

function stockByCode(stock, code) {
  return (stock || {})[key(code)] || Object.values(stock || {}).find(item => item && (item.materialCodigo === code || item.mpCodigo === code)) || null;
}

function availableForOrder(stockItem, customerKey) {
  if (!stockItem || !Number.isFinite(Number(stockItem.saldoAtual))) return {registered: false, available: 0};
  const owner = Prop.saldoPorDono(stockItem);
  const customer = customerKey ? number(owner.porCliente[customerKey]) : 0;
  const committed = Math.max(0, number(stockItem.saldoEmpenhado));
  return {registered: true, available: Math.round(Math.max(0, owner.geral + customer - committed) * 1000) / 1000};
}

function versionRecord(records, productKey, version) {
  const expected = String(productKey) + "__" + String(version || "");
  const direct = (records || {})[expected];
  if (direct) return direct;
  const foundKey = Object.keys(records || {}).find(candidate => candidate.toLowerCase() === expected.toLowerCase());
  return foundKey ? records[foundKey] : null;
}

function validateMaterials(base, order, productKey) {
  const items = Object.values(order.materiaisConsumo || {});
  if (!items.length) throw Object.assign(new Error("A OP não contém materiais de fórmula/BOM."), {code: "invalid-argument"});
  const formulaItems = items.filter(item => item && item.origem === "formula");
  if (formulaItems.length) {
    const total = formulaItems.reduce((sum, item) => sum + number(item.percentual), 0);
    if (Math.abs(total - 100) >= 0.0005) throw Object.assign(new Error("A fórmula da OP precisa fechar em 100%."), {code: "failed-precondition"});
  }
  for (const item of items) {
    if (!item || !item.mpCodigo || !(number(item.quantidade) > 0) || !["formula", "bom"].includes(item.origem)) {
      throw Object.assign(new Error("A OP contém material inválido ou sem quantidade positiva."), {code: "invalid-argument"});
    }
    if (!materialByCode(base.materiais, item.mpCodigo)) {
      throw Object.assign(new Error("Material não cadastrado: " + item.mpCodigo + "."), {code: "failed-precondition"});
    }
  }
  const formula = versionRecord(base.formulas, productKey, order.formulaVersao);
  const bom = versionRecord(base.bom, productKey, order.bomVersao || order.formulaVersao) || {itens: {}};
  if (!formula) throw Object.assign(new Error("A versão da fórmula informada não existe mais."), {code: "failed-precondition"});
  const submittedKeys = new Set(Object.keys(order.materiaisConsumo || {}));
  const missingFormula = Object.keys(formula.itens || {}).find(itemKey => !submittedKeys.has("f_" + itemKey));
  const missingBom = Object.keys(bom.itens || {}).find(itemKey => !submittedKeys.has("b_" + itemKey));
  if (missingFormula || missingBom) throw Object.assign(new Error("A lista de consumo não corresponde à fórmula/BOM cadastrada."), {code: "failed-precondition"});
  return items;
}

function shortages(base, order, customerKey, productKey) {
  const needed = {};
  for (const item of validateMaterials(base, order, productKey)) {
    const material = materialByCode(base.materiais, item.mpCodigo);
    if (material && material.controlaEstoque === false) continue;
    const code = item.mpCodigo;
    needed[code] = (needed[code] || 0) + number(item.quantidade);
  }
  return Object.entries(needed).map(([code, quantity]) => {
    const balance = availableForOrder(stockByCode(base.estoque, code), customerKey);
    return {mpCodigo: code, necessario: Math.round(quantity * 1000) / 1000, saldo: balance.available, registrado: balance.registered};
  }).filter(item => item.saldo < item.necessario);
}

function dayPrefix(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(now);
  const read = type => Number(parts.find(part => part.type === type).value);
  const year = read("year"), month = read("month"), dayOfMonth = read("day");
  const ordinal = Math.floor((Date.UTC(year, month - 1, dayOfMonth) - Date.UTC(year, 0, 1)) / 86400000) + 1;
  return String(year % 100).padStart(2, "0") + String(ordinal).padStart(3, "0");
}

function prepare(base, input, identity, now) {
  if (!base || !input || !input.op) throw Object.assign(new Error("Dados da OP ausentes."), {code: "invalid-argument"});
  const op = JSON.parse(JSON.stringify(input.op));
  if (!op.sku || !(number(op.qtdPlanejada) > 0) || !op.validade) throw Object.assign(new Error("SKU, quantidade e validade são obrigatórios."), {code: "invalid-argument"});
  const product = (base.produtos || {})[key(op.sku)] || Object.values(base.produtos || {}).find(item => item && item.sku === op.sku);
  if (!product) throw Object.assign(new Error("SKU não cadastrado."), {code: "failed-precondition"});
  const customerKey = Prop.clienteKeyDoSku(op.sku, base.produtos || {}, {}, product.cliente) || null;
  const productKey = Object.keys(base.produtos || {}).find(candidate => base.produtos[candidate] === product) || key(op.sku);
  const missing = shortages(base, op, customerKey, productKey);
  const lock = !!((((base.config || {}).emitirOp || {}).bloquearSemSaldo));
  const reason = String(input.motivoLiberacao || "").trim();
  if (lock && missing.length && identity.role !== "admin") throw Object.assign(new Error("Sem saldo para emitir a OP."), {code: "failed-precondition", details: {faltas: missing}});
  if (lock && missing.length && reason.length < 10) throw Object.assign(new Error("Informe um motivo de liberação com pelo menos 10 caracteres."), {code: "failed-precondition", details: {faltas: missing, precisaMotivo: true}});

  const prefix = dayPrefix(now);
  const counters = (((base.config || (base.config = {})).contadores || (base.config.contadores = {})).lotesPorDia || (base.config.contadores.lotesPorDia = {}));
  let sequence = number(counters[prefix]);
  let lote;
  do { sequence += 1; lote = prefix + "/" + String(sequence).padStart(2, "0"); } while ((base.ops || {})[key(lote)]);
  counters[prefix] = sequence;

  op.lote = lote;
  op.dataEmissao = now.toISOString();
  op.emitidoPor = identity.name;
  op.emitidoPorUid = identity.uid;
  op.emissaoServidor = {porUid: identity.uid, em: now.toISOString(), versao: 1};
  op.liberacaoSemSaldo = missing.length ? {motivo: reason.slice(0, 500), por: identity.name, porUid: identity.uid, em: now.toISOString(), faltas: missing} : null;
  base.ops = base.ops || {};
  base.ops[key(lote)] = op;

  const grouped = {};
  for (const item of Object.values(op.materiaisConsumo || {})) {
    const material = materialByCode(base.materiais, item.mpCodigo);
    if (material && material.controlaEstoque === false) continue;
    grouped[item.mpCodigo] = (grouped[item.mpCodigo] || 0) + number(item.quantidade);
  }
  base.estoque = base.estoque || {};
  for (const [code, quantity] of Object.entries(grouped)) {
    const stockKey = key(code);
    const item = base.estoque[stockKey] || (base.estoque[stockKey] = {saldoAtual: 0, materialCodigo: code});
    item.saldoEmpenhado = Math.round((number(item.saldoEmpenhado) + quantity) * 1000) / 1000;
    item.empenhos = item.empenhos || {};
    item.empenhos[key(lote)] = {lote, sku: op.sku, qtdEmpenhada: Math.round(quantity * 1000) / 1000, criadoEm: now.toISOString(), atualizadoEm: now.toISOString()};
  }
  base.alertas_pendentes = base.alertas_pendentes || {};
  base.alertas_pendentes[input.alertKey] = {tipo: "op_emitida", timestamp: now.toISOString(), lote, sku: op.sku, produto: op.produto || product.descricao || "", cliente: op.cliente || product.cliente || "", qtdPlanejada: op.qtdPlanejada, pedidoComercialId: op.skuPedidoKey || "", emitidoPor: identity.name};
  return {lote, op, faltas: missing};
}

module.exports = {key, availableForOrder, shortages, dayPrefix, prepare};
