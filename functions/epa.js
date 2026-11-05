"use strict";

// Núcleo local da EPA. Não é uma rota pública nem uma autorização de execução.
// O futuro adaptador deve carregar fontes/perfil/política no servidor, nunca do formulário.
const crypto = require("node:crypto");
const FORMULA_TOLERANCE = 0.0005; // mesma precisão da emissão de OP atual
const text = value => typeof value === "string" ? value.trim() : "";
const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
const absent = value => value == null || value === "" ||
  (typeof value === "string" && /^(?:0+(?:[.,]0+)?(?:kg|g|ml|l)?|0+\/0+|a definir|pendente|xxx+|n\/a)$/i.test(value.trim()));
const clone = value => JSON.parse(JSON.stringify(value));
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
function digest(value) { return crypto.createHash("sha256").update(canonical(value)).digest("hex"); }
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function gtin(value, length) {
  if (typeof value !== "string" || !new RegExp("^\\d{" + length + "}$").test(value)) return false;
  const digits = value.slice(0, -1).split("").reverse();
  return (10 - digits.reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 3 : 1), 0) % 10) % 10 === Number(value.at(-1));
}
function validate(spec = {}, occurrence = null) {
  const pending = [];
  const add = (codigo, campo, mensagem, origem = "especificacao", responsavel = "Qualidade") => pending.push({
    codigo, severidade: "BLOQUEANTE", campo, entidadeOrigem: spec.sources?.[origem]?.id || origem,
    versaoOrigem: spec.sources?.[origem]?.revision ?? null, responsavel, mensagem,
    caminhoCorrecao: {entidade: origem, id: spec.sources?.[origem]?.id || null, campo}
  });
  const required = (value, path, origin, owner) => { if (absent(value)) add("CAMPO_OBRIGATORIO", path, "Preencha na origem: " + path, origin, owner); };
  for (const origin of ["projeto", "cliente", "kickoff", "bom", "formula", "amostra"]) {
    if (!text(spec.sources?.[origin]?.id) || absent(spec.sources?.[origin]?.revision)) add("ORIGEM_SEM_VERSAO", "sources." + origin, "Origem e revisão rastreáveis são obrigatórias.", origin);
  }
  for (const field of ["name", "taxId", "brand"]) required(spec.customer?.[field], "customer." + field, "cliente", "Comercial");
  for (const field of ["name", "category", "physicalForm", "unit", "ncm"]) required(spec.product?.[field], "product." + field, "projeto", "Cadastros");
  if (!positive(spec.product?.amount) || !["mL", "L", "g", "kg"].includes(spec.product?.unit)) add("VOLUME_INVALIDO", "product.amount", "Declare quantidade positiva e unidade explícita, sem presumir densidade.", "projeto");
  for (const origin of ["kickoff", "bom", "formula", "amostra"]) {
    if (spec.sources?.[origin]?.approved !== true || spec.sources?.[origin]?.outdated === true) add("ORIGEM_NAO_APROVADA", "sources." + origin, "Origem precisa estar aprovada e vigente.", origin);
  }
  // CEST não aplicável não é o mesmo que CEST ausente.
  conditional(spec.product?.cest, "product.cest", "projeto");
  function conditional(field, path, origin) {
    if (field?.applicable === false) required(field.justification, path + ".justification", origin);
    else if (field?.applicable === true) required(field.value, path + ".value", origin);
    else add("APLICABILIDADE_AUSENTE", path, "Responda aplicável ou não aplicável.", origin);
  }
  const variants = Array.isArray(spec.variants) ? spec.variants : [];
  if (!variants.length) add("VARIANTES_AUSENTES", "variants", "Relacione os SKUs da especificação.", "projeto");
  const skus = new Set();
  for (const [i, variant] of variants.entries()) {
    const path = "variants." + i;
    for (const field of ["sku", "name", "formulaId", "formulaRevision"]) required(variant[field], path + "." + field, "projeto");
    if (skus.has(variant.sku)) add("SKU_DUPLICADO", path + ".sku", "SKU repetido na grade.", "projeto");
    skus.add(variant.sku);
    conditional(variant.regulatory, path + ".regulatory", "projeto");
    for (const [field, length] of [["gtin", 13], ["masterGtin", 14]]) {
      if (!gtin(variant[field], length)) add("GTIN_INVALIDO", path + "." + field, "Código deve ser texto com dígito verificador válido; não gerar código comercial.", "projeto");
    }
    if (!Number.isSafeInteger(variant.unitsPerMaster) || variant.unitsPerMaster <= 0) add("MASTER_INVALIDA", path + ".unitsPerMaster", "Defina unidades inteiras por caixa.", "bom");
    if (!positive(variant.formulaTotal) || Math.abs(variant.formulaTotal - 100) >= FORMULA_TOLERANCE) add("FORMULA_NAO_FECHA_100", path + ".formulaTotal", "Fórmula deve fechar 100%, tolerância estrita de 0,0005 ponto percentual.", "formula", "P&D");
    if (!text(variant.formulaId) || variant.formulaId !== spec.sources?.formula?.id || variant.formulaRevision !== spec.sources?.formula?.revision) add("FORMULA_DIVERGENTE", path, "A variante deve corresponder à revisão aprovada informada na origem.", "formula", "P&D");
  }
  const components = Array.isArray(spec.components) ? spec.components : [];
  if (!components.length) add("COMPONENTES_AUSENTES", "components", "Defina componentes e aplicabilidade.", "bom", "Engenharia de Produto");
  components.forEach((c, i) => {
    const path = "components." + i;
    if (c.applicable === false) { required(c.justification, path + ".justification", "bom"); return; }
    if (c.applicable !== true) add("APLICABILIDADE_AUSENTE", path, "Defina aplicabilidade do componente.", "bom");
    for (const field of ["materialCode", "description", "specification", "revision"]) required(c[field], path + "." + field, "bom", "Cadastros");
    if (c.validated !== true || c.provisional === true) add("MATERIAL_PROVISORIO", path, "Material precisa de validação industrial.", "bom", "Cadastros");
    if (c.type === "MPES" && !text(c.finalSupplierCode)) add("MPES_SEM_CODIGO_FINAL", path, "Código de aprovação não substitui código final da fragrância.", "bom", "Cadastros");
    if (!["KURYOS", "CLIENTE"].includes(c.owner) || !positive(c.quantity) || !text(c.unit)) add("COMPONENTE_INVALIDO", path, "Defina titular, quantidade e unidade.", "bom");
    if (!Array.isArray(c.skus) || !c.skus.length || c.skus.some(s => !skus.has(s))) add("APLICACAO_INVALIDA", path + ".skus", "Relacione explicitamente variantes existentes.", "bom");
  });
  for (const sku of skus) if (!components.some(c => c.applicable === true && c.skus?.includes(sku))) add("SKU_SEM_COMPONENTES", "components", "Variante sem componente aplicável: " + sku, "bom");
  if (!positive(spec.fill?.declared) || !positive(spec.fill?.maximum) || spec.fill.maximum < spec.fill.declared || spec.fill?.unit !== spec.product?.unit || spec.fill?.declared !== spec.product?.amount) add("ENCHIMENTO_INVALIDO", "fill", "Limites devem corresponder ao conteúdo declarado, com unidade idêntica.", "kickoff");
  conditional(spec.marking, "marking", "kickoff");
  for (const [i, asset] of (Array.isArray(spec.assets) ? spec.assets : []).entries()) {
    if (!/^[a-f0-9]{64}$/.test(asset.sha256 || "") || !text(asset.version) || !text(asset.id) || asset.approved !== true || !Array.isArray(asset.skus) || !asset.skus.length || asset.skus.some(s => !skus.has(s))) add("ATIVO_NAO_VERSIONADO", "assets." + i, "Arte/imagem deve ter versão, hash, aprovação e variantes explícitas.", "kickoff");
  }
  if (occurrence) {
    for (const field of ["opId", "orderId", "customerId"]) required(occurrence[field], "occurrence." + field, "op", "PCP");
    if (occurrence.customerId !== spec.sources?.cliente?.id) add("TITULAR_DIVERGENTE", "occurrence.customerId", "OP e especificação pertencem a clientes distintos.", "op", "PCP");
    const lines = Array.isArray(occurrence.variants) ? occurrence.variants : [];
    if (!lines.length) add("OCORRENCIA_SEM_VARIANTES", "occurrence.variants", "Defina variantes e quantidades desta OP.", "op", "PCP");
    const seen = new Set();
    lines.forEach((line, i) => {
      const path = "occurrence.variants." + i;
      const variant = variants.find(v => v.sku === line.sku);
      if (!variant || seen.has(line.sku)) add("VARIANTE_OP_INVALIDA", path, "SKU desconhecido ou duplicado na OP.", "op", "PCP");
      seen.add(line.sku);
      required(line.lot, path + ".lot", "op", "PCP");
      if (!date(line.manufacturedAt) || !date(line.expiresAt) || line.expiresAt <= line.manufacturedAt) add("DATAS_INVALIDAS", path, "Datas válidas e validade posterior à fabricação são obrigatórias.", "op");
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.unit !== "un") add("QUANTIDADE_OP_INVALIDA", path, "Declare unidades inteiras e positivas da variante.", "op", "PCP");
      if (variant && line.quantity % variant.unitsPerMaster !== 0 && line.partialMasterApproved !== true) add("CAIXA_PARCIAL", path, "Caixa parcial precisa de decisão explícita na origem.", "op", "PCP");
      if (!positive(line.masterWeightKg)) add("PESO_MASTER_AUSENTE", path, "Peso real da caixa obrigatório; 0KG do modelo não é dado real.", "op");
    });
  }
  return {ready: pending.length === 0, pending};
}

// Snapshot de chão de fábrica por lista permitida. Composição/custos/equipamentos
// não atravessam a fronteira mesmo se vierem presentes no objeto de origem.
function snapshot(spec, occurrence = null) {
  const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] !== undefined).map(k => [k, clone(obj[k])]));
  return {schemaVersion: 1, templateVersion: "epa-preview-1", sources: Object.fromEntries(Object.entries(spec.sources || {}).filter(([k]) => ["projeto", "cliente", "kickoff", "bom", "formula", "amostra"].includes(k)).map(([k, v]) => [k, pick(v, ["id", "revision"])])),
    customer: pick(spec.customer, ["name", "taxId", "brand"]), product: pick(spec.product, ["name", "category", "physicalForm", "amount", "unit", "ncm", "cest"]),
    fill: pick(spec.fill, ["declared", "maximum", "unit"]), marking: pick(spec.marking, ["applicable", "value", "justification"]),
    variants: (spec.variants || []).map(v => pick(v, ["sku", "name", "formulaId", "formulaRevision", "gtin", "masterGtin", "unitsPerMaster", "regulatory"])),
    components: (spec.components || []).map(c => pick(c, ["materialCode", "description", "specification", "revision", "owner", "quantity", "unit", "skus", "applicable", "justification"])),
    assets: (spec.assets || []).map(a => pick(a, ["id", "sha256", "version", "skus"])),
    occurrence: occurrence ? {...pick(occurrence, ["opId", "orderId", "customerId"]), variants: (occurrence.variants || []).map(v => pick(v, ["sku", "lot", "manufacturedAt", "expiresAt", "quantity", "unit", "masterWeightKg", "partialMasterApproved"]))} : null};
}

module.exports = {FORMULA_TOLERANCE, validate, snapshot, digest, gtin, date};
