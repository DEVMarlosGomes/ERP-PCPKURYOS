"use strict";

const {hash, getAtPath} = require("./core");

const TOOL_VERSION = "reference-reconciliation-1.0.0";
const OFFICIAL_CUTOFF = "2026-10-30T23:59:59-03:00";
const DEFAULT_AUTHOR = "Reconciliacao tecnica Kuryos 02/11/2026";

// Decisoes de negocio comprovadas no snapshot oficial. O destino e sempre o
// produto terminal do sku_historico, nunca um cadastro novo ou duplicado.
const REFERENCE_DECISIONS = Object.freeze({
  "AGBE-SEUN-0001": {target: "PEL-SEUN-0002", method: "alias_oficial", evidence: "sku_historico e skusAnteriores oficiais"},
  "AGUA-DE-BELEZA-100ML": {target: "PEL-SEUN-0002", method: "alias_oficial", evidence: "sku_historico e skusAnteriores oficiais"},
  "AGU-SEUN-0001": {target: "PEL-SEUN-0002", method: "descricao_e_alias", evidence: "pedido AGUA DE BELEZA 100ML e alias oficial AGUA-DE-BELEZA-100ML"},
  "BSP-SEUN-0001": {target: "BSPL-SEUN-0002", method: "alias_oficial_terminal", evidence: "cadeia oficial BSP-SEUN-0001 -> BSPL-SEUN-0001 -> BSPL-SEUN-0002"},
  "PRF-FEBELLABEAUTY-0001": {target: "PRF-FEBELLABEAUTY-0010", method: "alias_oficial_terminal", evidence: "cadeia oficial PRF-FEBELLABEAUTY-0001 -> FBBS0005 -> PRF-FEBELLABEAUTY-0010"},
  "bbpf0004": {target: "BBPF0004", method: "normalizacao_caixa", evidence: "mesmo codigo sem diferenca de maiusculas e descricao PERFUME CAPILAR ZAHRA"},
  "IMEDIATT LISS PASSO 1": {target: "IMEDIATT-LISS-PASSO-1", method: "descricao_exata", evidence: "descricao oficial normalizada"},
  "IMEDIATT LISS PASSO 2": {target: "IMEDIATT-LISS-PASSO-2", method: "descricao_exata", evidence: "descricao oficial normalizada"},
  "SRM-SEUN-0002": {target: "FIRMADOR-200ML", method: "descricao_exata", evidence: "pedido e produto oficial FIRMADOR 200ML"},
  "DPHSBS02": {target: "DPHNBS02", method: "correcao_codigo_legado", evidence: "familia DAPOP HONEY, produto e especificacao oficial DPHNBS02 aprovados em 30/10"},
  "FEBS0003": {target: "FBBS0003", method: "correcao_codigo_legado", evidence: "sequencia FEBELLA e produto oficial BODY SPLASH AMBER BLOOM 200ML"},
  "FEBS0004": {target: "FBBS0004", method: "correcao_codigo_legado", evidence: "expedicao oficial liga FEBS0004 a BODY SPLASH OUD NIGHT 200ML"},
  "FEBS0005": {target: "PRF-FEBELLABEAUTY-0010", method: "correcao_e_alias_terminal", evidence: "expedicao oficial liga FEBS0005 a FBBS0005, alias atual PRF-FEBELLABEAUTY-0010"},
  "MRARBS010": {target: "MRARBS10", method: "correcao_zero_legado", evidence: "mesma familia, formula/BOM e produto oficial BODY SPLASH AMBAR REAL 200ML"},
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return String(value == null ? "" : value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function resolveAlias(value, db) {
  let current = String(value || "");
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    const next = db && db.sku_historico && db.sku_historico[current];
    if (!next) break;
    current = String(next);
  }
  return current;
}

function rootOf(path) {
  return path.replace(/^\//, "").split("/")[0] || "";
}

function recordIdOf(path) {
  return path.replace(/^\//, "").split("/")[1] || "";
}

function makeEntry(current, path, after, reason) {
  const before = getAtPath(current, path);
  if (hash(before) === hash(after)) return null;
  return {
    path,
    action: before === undefined ? "add" : "overwrite",
    beforeExists: before !== undefined,
    before,
    beforeHash: hash(before),
    after,
    afterHash: hash(after),
    root: rootOf(path),
    recordId: recordIdOf(path),
    reason,
  };
}

function productExists(db, key) {
  return !!(db && isObject(db.produtos) && isObject(db.produtos[key]));
}

function verifyDecision(value, decision, official, pending, record) {
  if (!productExists(official, decision.target)) return `produto destino ${decision.target} nao existe na fonte oficial`;
  const directOfficial = official.sku_historico && official.sku_historico[value];
  if (decision.method.indexOf("alias_oficial") >= 0 && resolveAlias(value, official) !== decision.target) {
    return `cadeia oficial de ${value} nao termina em ${decision.target}`;
  }
  if (decision.method === "normalizacao_caixa" && value.toUpperCase() !== decision.target.toUpperCase()) {
    return `normalizacao de caixa nao confere para ${value}`;
  }
  if (decision.method === "descricao_exata") {
    const targetDescription = official.produtos[decision.target].descricao || decision.target;
    const candidates = [record && record[pending.campo], record && record.produto, record && record.descricao]
      .filter((item) => item != null && String(item).trim() !== "-");
    if (!candidates.some((item) => normalizeText(item) === normalizeText(targetDescription))) {
      return `descricao de ${value} nao confere com ${decision.target}`;
    }
  }
  if (value === "AGU-SEUN-0001") {
    const aliasTarget = resolveAlias("AGUA-DE-BELEZA-100ML", official);
    if (aliasTarget !== decision.target || normalizeText(record && record.produto) !== normalizeText("AGUA DE BELEZA 100ML")) {
      return "evidencia de AGUA DE BELEZA 100ML nao confere";
    }
  }
  if (value === "SRM-SEUN-0002" && normalizeText(record && record.produto) !== normalizeText(official.produtos[decision.target].descricao)) {
    return "descricao FIRMADOR 200ML nao confere";
  }
  if (value === "FEBS0004" || value === "FEBS0005") {
    const found = Object.values(official.expedicoes_comerciais || {}).some((expedition) =>
      Object.values((expedition && expedition.itens) || {}).some((item) => item && (item.sku === value || item.itemCodigo === value))
    );
    if (!found) return `expedicao oficial nao comprova ${value}`;
  }
  if (value === "DPHSBS02" && !official.especificacoes?.["DPHNBS02__v1"]?.aprovadoQualidade) {
    return "especificacao oficial DPHNBS02 nao estava aprovada no corte";
  }
  if (directOfficial && resolveAlias(value, official) !== decision.target && decision.method.includes("alias")) {
    return `alias oficial de ${value} diverge do destino`;
  }
  if (!pending || !record) return `registro da pendencia ${value} nao existe`;
  return null;
}

function classifyPending(id, pending, official, current) {
  const record = current[pending.colecao] && current[pending.colecao][pending.registroKey];
  if (!record) return {id, pending, error: "registro historico nao existe no destino"};
  const value = String(pending.valorAusente || record[pending.campo] || "").trim();

  if (pending.colecao === "especificacoes" && record.tipoItem === "MATERIAL") {
    if (!official.materiais || !official.materiais[value]) return {id, pending, record, value, error: `material ${value} nao existe na fonte oficial`};
    return {id, pending, record, value, kind: "material", target: value, method: "material_oficial", evidence: "especificacao tipoItem=MATERIAL e codigo existente em materiais"};
  }

  if (value === "-" && pending.colecao === "ops") {
    const matches = Object.entries(official.produtos || {}).filter(([, product]) => normalizeText(product && product.descricao) === normalizeText(record.produto));
    if (matches.length !== 1) return {id, pending, record, value, error: `placeholder sem produto unico pela descricao (${matches.length} candidatos)`};
    return {id, pending, record, value, kind: "placeholder", target: matches[0][0], method: "descricao_exata_placeholder", evidence: `descricao oficial unica: ${record.produto}`};
  }

  const decision = REFERENCE_DECISIONS[value];
  if (!decision) return {id, pending, record, value, error: "sem decisao comprovada"};
  const error = verifyDecision(value, decision, official, pending, record);
  if (error) return {id, pending, record, value, error};
  return {id, pending, record, value, kind: "product", ...decision};
}

function buildReconciliationPlan(official, current, options = {}) {
  const resolvedAt = options.resolvedAt || new Date().toISOString();
  const resolvedBy = options.resolvedBy || DEFAULT_AUTHOR;
  const pendingEntries = Object.entries(current.pendencias_setor || {})
    .filter(([, pending]) => pending && pending.status === "ABERTA" && pending.tipo === "REFERENCIA_IMPORTACAO")
    .sort(([a], [b]) => a.localeCompare(b));
  const decisions = pendingEntries.map(([id, pending]) => classifyPending(id, pending, official, current));
  const unresolved = decisions.filter((decision) => decision.error);
  if (options.strict !== false && unresolved.length) {
    throw new Error(`${unresolved.length} pendencia(s) sem decisao segura: ${unresolved.map((item) => `${item.id} (${item.error})`).join("; ")}`);
  }

  const changesByPath = new Map();
  function add(path, after, reason) {
    const entry = makeEntry(current, path, after, reason);
    if (!entry) return;
    const existing = changesByPath.get(path);
    if (existing && hash(existing.after) !== hash(after)) throw new Error(`decisoes conflitantes para ${path}`);
    changesByPath.set(path, entry);
  }

  for (const decision of decisions.filter((item) => !item.error)) {
    const base = `/pendencias_setor/${decision.id}`;
    const entityField = decision.kind === "material" ? "materialKeyResolvido" : "produtoKeyResolvido";
    add(`${base}/status`, "RESOLVIDA", "baixa da revisao oficial");
    add(`${base}/resolvidaEm`, resolvedAt, "trilha de auditoria");
    add(`${base}/resolvidaPor`, resolvedBy, "trilha de auditoria");
    add(`${base}/resolvidaComo`, `${decision.method}: ${decision.value || decision.pending.valorAusente} -> ${decision.target}`, "decisao de reconciliacao");
    add(`${base}/${entityField}`, decision.target, "vinculo canonico sem reescrever historico");
    add(`${base}/valorOriginalPreservado`, decision.value || decision.pending.valorAusente || "", "prova de nao alteracao do historico");
    add(`${base}/evidenciaRegularizacao`, {
      fonte: "prod-kuryos",
      corte: OFFICIAL_CUTOFF,
      metodo: decision.method,
      detalhe: decision.evidence,
    }, "evidencia da decisao");

    // O placeholder '-' nao pode virar alias global: ele nao identifica um
    // produto. A pendencia guarda o produto resolvido e o OP original fica
    // intacto. Os demais codigos sao aliases univocos e seguros.
    if (decision.kind === "product" && decision.value !== "-") {
      add(`/sku_historico/${decision.value}`, decision.target, "alias oficial achatado para o produto terminal");
      add(`/produtos/${decision.target}/skusAnteriores/${decision.value}`, true, "preservar alias em futuras renomeacoes");
    }
  }

  const changes = [...changesByPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  const sourceHash = hash(official);
  const currentHash = hash(current);
  const decisionHash = hash(decisions.map(({record, pending, ...item}) => item));
  const runId = `reconcile-${hash({tool: TOOL_VERSION, sourceHash, currentHash, decisionHash, resolvedAt}).slice(0, 16)}`;
  const roots = [...new Set(changes.map((entry) => entry.root))].sort();
  return {
    toolVersion: TOOL_VERSION,
    runId,
    sourceHash,
    currentHash,
    officialCutoff: OFFICIAL_CUTOFF,
    resolvedAt,
    resolvedBy,
    counts: {
      pendingOpen: pendingEntries.length,
      pendingResolved: decisions.filter((item) => !item.error).length,
      unresolved: unresolved.length,
      productReferences: decisions.filter((item) => item.kind === "product").length,
      placeholderReferences: decisions.filter((item) => item.kind === "placeholder").length,
      materialReferences: decisions.filter((item) => item.kind === "material").length,
      aliasesTouched: new Set(decisions.filter((item) => item.kind === "product").map((item) => item.value)).size,
      historicalRecordsRewritten: 0,
      fieldsPlanned: changes.length,
    },
    decisions: decisions.map(({record, pending, ...item}) => ({...item, colecao: pending.colecao, registroKey: pending.registroKey, campo: pending.campo})),
    unresolved: unresolved.map(({record, pending, ...item}) => ({...item, colecao: pending.colecao, registroKey: pending.registroKey})),
    changes,
    conflicts: [],
    rejected: [],
    triggerSensitiveRoots: roots.map((root) => ({root, reason: "reconciliacao de cadastro", plannedFields: changes.filter((entry) => entry.root === root).length})),
  };
}

module.exports = {
  TOOL_VERSION,
  OFFICIAL_CUTOFF,
  DEFAULT_AUTHOR,
  REFERENCE_DECISIONS,
  normalizeText,
  resolveAlias,
  classifyPending,
  buildReconciliationPlan,
};
