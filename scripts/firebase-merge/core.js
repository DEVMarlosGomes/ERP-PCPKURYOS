"use strict";

const crypto = require("node:crypto");

const TOOL_VERSION = "1.2.0";
const EXCLUDED_ROOTS = new Map([
  ["config", "configuração e segredos operacionais não são dados mestres"],
  ["usuarios", "perfil não equivale ao Firebase Authentication; revisão humana obrigatória"],
  ["usuarios_publico", "índice derivado de usuários"],
  ["usuarios_removidos", "histórico de acesso preservado, nunca mesclado automaticamente"],
  ["rh_colaboradores_publico", "índice público derivado"],
  ["email_notifications_state", "estado técnico de deduplicação"],
  ["emails_diretoria", "fila/estado de envio"],
  ["notificacoes_comercial", "efeito operacional já processado"],
  ["notificacoes_op_encerrada", "marca idempotente de trigger"],
  ["notificacoes_pesagem", "marca idempotente de trigger"],
  ["alertas_pendentes", "fila operacional derivada"],
  ["materiais_chave", "índice derivado de materiais"],
]);

const TRIGGER_SENSITIVE_ROOTS = new Map([
  ["agendamentos_expedicao", "criação de solicitação de faturamento pode enviar e-mail"],
  ["turnosEncerrados", "criação de turno encerrado pode enviar relatório"],
  ["ops", "mudanças de status/manipulação podem enviar notificações"],
  ["pedidos_comerciais", "criação/versão pode enviar e-mail à diretoria"],
]);

function stableStringify(value) {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function hash(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function hasOwn(object, key) {
  return object != null && Object.prototype.hasOwnProperty.call(object, key);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getAtPath(root, path) {
  if (!path || path === "/") return root;
  let cursor = root;
  for (const segment of path.replace(/^\//, "").split("/")) {
    if (!isObject(cursor) && !Array.isArray(cursor)) return undefined;
    if (!hasOwn(cursor, segment)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function collectLeaves(source, target, basePath, output, rejects) {
  if (source === null) {
    rejects.push({path: basePath, reason: "valor null da fonte poderia excluir dado"});
    return;
  }
  if (isObject(source)) {
    for (const key of Object.keys(source).sort()) {
      collectLeaves(source[key], isObject(target) || Array.isArray(target) ? target[key] : undefined, `${basePath}/${key}`, output, rejects);
    }
    return;
  }
  if (target === undefined) {
    output.push({path: basePath, action: "add", beforeExists: false, before: undefined, beforeHash: hash(undefined), after: source, afterHash: hash(source)});
  } else if (stableStringify(source) === stableStringify(target)) {
    output.push({path: basePath, action: "identical", beforeExists: true, before: target, beforeHash: hash(target), after: source, afterHash: hash(source)});
  } else {
    output.push({path: basePath, action: "conflict", beforeExists: true, before: target, beforeHash: hash(target), after: source, afterHash: hash(source)});
  }
}

function addCatalog(catalog, root, fields) {
  for (const [key, record] of Object.entries(root || {})) {
    catalog.add(String(key));
    if (!isObject(record)) continue;
    for (const field of fields) if (record[field] !== undefined && record[field] !== null) catalog.add(String(record[field]));
  }
}

function buildCatalogs(source, current) {
  const products = new Set();
  const materials = new Set();
  for (const db of [source, current]) {
    addCatalog(products, db.produtos, ["sku", "codProduto", "codigo"]);
    addCatalog(materials, db.materiais, ["mpCodigo", "materialCodigo", "codigo"]);
  }
  return {products, materials};
}

function validateRecord(root, id, record, catalogs) {
  const errors = [];
  if (!isObject(record)) return errors;
  const requireRef = (value, catalog, field, entity) => {
    if (value !== undefined && value !== null && value !== "" && !catalog.has(String(value))) {
      errors.push(`${field} referencia ${entity} inexistente`);
    }
  };
  if (["formulas", "especificacoes", "bom"].includes(root)) requireRef(record.codProduto, catalogs.products, "codProduto", "produto");
  if (["ops", "pedidos"].includes(root)) requireRef(record.sku, catalogs.products, "sku", "produto");
  if (root === "estoque") requireRef(record.materialCodigo || id, catalogs.materials, "materialCodigo", "material");
  if (root === "lotes_internos") requireRef(record.materialKey, catalogs.materials, "materialKey", "material");
  return errors;
}

function planMerge(source, current, options = {}) {
  const excludedRoots = options.excludedRoots || EXCLUDED_ROOTS;
  const conflictPolicy = options.conflictPolicy || "preserve";
  const invalidReferencePolicy = options.invalidReferencePolicy || "reject";
  if (!["preserve", "source"].includes(conflictPolicy)) throw new Error(`política de conflito inválida: ${conflictPolicy}`);
  if (!["reject", "flag"].includes(invalidReferencePolicy)) throw new Error(`política de referência inválida: ${invalidReferencePolicy}`);
  const roots = (options.roots || Object.keys(source)).filter((root) => hasOwn(source, root)).sort();
  const catalogs = buildCatalogs(source, current);
  const changes = [];
  const conflicts = [];
  const identical = [];
  const rejected = [];
  const referenceWarnings = [];
  const excluded = [];
  const records = [];

  for (const root of roots) {
    if (excludedRoots.has(root)) {
      excluded.push({root, reason: excludedRoots.get(root), count: isObject(source[root]) ? Object.keys(source[root]).length : 1});
      continue;
    }
    if (!isObject(source[root])) {
      rejected.push({path: `/${root}`, reason: "raiz não é um mapa de registros"});
      continue;
    }
    for (const id of Object.keys(source[root]).sort()) {
      const sourceRecord = source[root][id];
      const currentRecord = isObject(current[root]) ? current[root][id] : undefined;
      if (currentRecord !== undefined && isObject(sourceRecord) !== isObject(currentRecord)) {
        rejected.push({path: `/${root}/${id}`, reason: "tipo estrutural diverge entre origem e destino"});
        records.push({root, id, status: "rejected"});
        continue;
      }
      const validationErrors = validateRecord(root, id, sourceRecord, catalogs);
      if (validationErrors.length) {
        if (invalidReferencePolicy === "reject") {
          rejected.push({path: `/${root}/${id}`, reason: validationErrors.join("; ")});
          records.push({root, id, status: "rejected"});
          continue;
        }
        referenceWarnings.push({root, recordId: id, path: `/${root}/${id}`, reason: validationErrors.join("; "), record: sourceRecord});
      }
      const leaves = [];
      const leafRejects = [];
      collectLeaves(sourceRecord, currentRecord, `/${root}/${id}`, leaves, leafRejects);
      rejected.push(...leafRejects);
      const adds = leaves.filter((entry) => entry.action === "add");
      const diffs = leaves.filter((entry) => entry.action === "conflict");
      const same = leaves.filter((entry) => entry.action === "identical");
      changes.push(...adds.map((entry) => ({...entry, root, recordId: id, sourcePath: entry.path})));
      if (conflictPolicy === "source") changes.push(...diffs.map((entry) => ({...entry, action: "overwrite", root, recordId: id, sourcePath: entry.path})));
      conflicts.push(...diffs.map((entry) => ({...entry, root, recordId: id, sourcePath: entry.path})));
      identical.push(...same.map((entry) => ({path: entry.path, root, recordId: id})));
      const status = currentRecord === undefined && adds.length ? "new" : diffs.length ? (conflictPolicy === "source" ? "overwrite" : "conflict") : adds.length ? "complement" : "identical";
      records.push({root, id, status, additions: adds.length, conflicts: diffs.length, identical: same.length});
    }
  }

  for (const warning of referenceWarnings) {
    const pendingId = `importacao_json_${hash({root: warning.root, id: warning.recordId, reason: warning.reason}).slice(0, 20)}`;
    const currentPending = getAtPath(current, `/pendencias_setor/${pendingId}`);
    if (currentPending && currentPending.status === "RESOLVIDA") continue;
    const missingValue = warning.record.codProduto || warning.record.sku || "";
    const pending = {
      status: "ABERTA", setor: "CADASTROS", tipo: "REFERENCIA_IMPORTACAO", origem: "IMPORTACAO_JSON",
      colecao: warning.root, registroKey: warning.recordId, campo: warning.record.codProduto ? "codProduto" : "sku",
      valorAusente: String(missingValue), rotulo: "Referência importada para regularização",
      texto: `${warning.root}/${warning.recordId}: ${warning.reason}. Vincule o cadastro correto sem excluir o histórico.`,
      onde: "Cadastros › Produtos", obrigatorio: false, criadoEm: "2026-11-01T00:00:00.000-03:00",
      criadoPor: "Importação JSON 01/11/2026", ultimoAvisoEm: "2026-11-01T00:00:00.000-03:00",
      ultimoAvisoPor: "Importação JSON 01/11/2026", avisos: 1,
    };
    const leaves = [];
    const leafRejects = [];
    collectLeaves(pending, currentPending, `/pendencias_setor/${pendingId}`, leaves, leafRejects);
    changes.push(...leaves.filter((entry) => entry.action === "add").map((entry) => ({...entry, root: "pendencias_setor", recordId: pendingId, sourcePath: warning.path})));
    conflicts.push(...leaves.filter((entry) => entry.action === "conflict").map((entry) => ({...entry, root: "pendencias_setor", recordId: pendingId, sourcePath: warning.path})));
  }

  const sourceHash = hash(source);
  const currentHash = hash(current);
  const runId = `merge-${hash({tool: TOOL_VERSION, sourceHash, currentHash, roots, conflictPolicy, invalidReferencePolicy}).slice(0, 16)}`;
  const counts = {
    roots: roots.length,
    newRecords: records.filter((r) => r.status === "new").length,
    complementedRecords: records.filter((r) => r.status === "complement").length,
    identicalRecords: records.filter((r) => r.status === "identical").length,
    conflictingRecords: records.filter((r) => r.status === "conflict").length,
    overwrittenRecords: records.filter((r) => r.status === "overwrite").length,
    rejectedRecords: records.filter((r) => r.status === "rejected").length,
    fieldAdditions: changes.filter((entry) => entry.action === "add").length,
    fieldConflicts: conflicts.length,
    fieldOverwrites: changes.filter((entry) => entry.action === "overwrite").length,
    identicalFields: identical.length,
    rejectedValues: rejected.length,
  };
  return {toolVersion: TOOL_VERSION, runId, sourceHash, currentHash, policies: {conflictPolicy, invalidReferencePolicy}, counts, changes, conflicts, rejected, referenceWarnings: referenceWarnings.map(({record, ...warning}) => warning), excluded, records, triggerSensitiveRoots: [...TRIGGER_SENSITIVE_ROOTS.entries()].map(([root, reason]) => ({root, reason, plannedFields: changes.filter((c) => c.root === root).length}))};
}

function verifyPreconditions(plan, live, entries = plan.changes) {
  const concurrent = [];
  for (const entry of entries) {
    const liveValue = getAtPath(live, entry.path);
    if (hash(liveValue) !== entry.beforeHash) concurrent.push({path: entry.path, expectedHash: entry.beforeHash, actualHash: hash(liveValue)});
  }
  return concurrent;
}

function createBatches(entries, maxPaths = 400, maxBytes = 4_000_000) {
  const batches = [];
  let batch = {};
  let size = 2;
  let paths = 0;
  for (const entry of entries) {
    const relativePath = entry.path.replace(/^\//, "");
    const addition = Buffer.byteLength(JSON.stringify(relativePath)) + Buffer.byteLength(JSON.stringify(entry.after)) + 2;
    if (paths && (paths >= maxPaths || size + addition > maxBytes)) {
      batches.push(batch); batch = {}; size = 2; paths = 0;
    }
    batch[relativePath] = entry.after;
    size += addition;
    paths++;
  }
  if (paths) batches.push(batch);
  return batches;
}

function createRevertEntries(plan, appliedPaths, live) {
  const entries = [];
  const changedAfter = [];
  const applied = new Set(appliedPaths);
  for (const entry of plan.changes) {
    if (!applied.has(entry.path)) continue;
    const liveValue = getAtPath(live, entry.path);
    if (hash(liveValue) !== entry.afterHash) {
      changedAfter.push({path: entry.path, expectedHash: entry.afterHash, actualHash: hash(liveValue)});
      continue;
    }
    entries.push({...entry, after: entry.beforeExists ? entry.before : null});
  }
  return {entries, changedAfter};
}

module.exports = {TOOL_VERSION, EXCLUDED_ROOTS, TRIGGER_SENSITIVE_ROOTS, stableStringify, hash, getAtPath, planMerge, verifyPreconditions, createBatches, createRevertEntries};
