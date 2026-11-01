#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {planMerge, verifyPreconditions, createBatches, createRevertEntries, getAtPath, hash, TRIGGER_SENSITIVE_ROOTS} = require("./core");

function parseArgs(argv) {
  const result = {mode: "simulate", project: "erpkuryos", outDir: path.join("scratch", "firebase-merge"), batchSize: 400};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (["simulate", "apply", "revert"].includes(arg)) result.mode = arg;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (["triggersDisabledAck"].includes(key)) result[key] = true;
      else result[key] = argv[++i];
    }
  }
  result.batchSize = Number(result.batchSize) || 400;
  return result;
}

function fail(message) { console.error(`ERRO: ${message}`); process.exitCode = 1; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, {flag: "wx"}); }
function runFirebase(args, stdio = "inherit") {
  const executable = process.platform === "win32" ? process.execPath : "firebase";
  const prefix = process.platform === "win32" ? [path.join(process.env.APPDATA || "", "npm", "node_modules", "firebase-tools", "lib", "bin", "firebase.js")] : [];
  return spawnSync(executable, prefix.concat(args), {stdio});
}

function downloadCurrent(project) {
  const file = path.join(os.tmpdir(), `firebase-merge-live-${process.pid}-${Date.now()}.json`);
  const run = runFirebase(["database:get", "/", "--project", project, "--output", file]);
  if (run.status !== 0) throw new Error("não foi possível obter fotografia atual do Firebase");
  return {file, data: readJson(file)};
}

function updateFirebase(project, data, workDir, label) {
  const file = path.join(workDir, `${label}.json`);
  fs.writeFileSync(file, `${JSON.stringify(data)}\n`);
  const run = runFirebase(["database:update", "/", file, "--project", project, "--force", "--disable-triggers"]);
  if (run.status !== 0) throw new Error(`falha ao aplicar ${label}`);
}

function humanReport(plan, sourceFile, currentFile) {
  const c = plan.counts;
  return [
    `Execução: ${plan.runId}`,
    `Modo: SIMULAÇÃO (nenhuma escrita)`,
    `Fonte: ${path.basename(sourceFile)} (${plan.sourceHash})`,
    `Atual: ${path.basename(currentFile)} (${plan.currentHash})`,
    `Registros novos: ${c.newRecords}`,
    `Registros complementados: ${c.complementedRecords}`,
    `Registros idênticos: ${c.identicalRecords}`,
    `Registros conflitantes: ${c.conflictingRecords}`,
    `Registros sobrescritos pela fonte autorizada: ${c.overwrittenRecords}`,
    `Registros rejeitados: ${c.rejectedRecords}`,
    `Campos a incluir: ${c.fieldAdditions}`,
    `Campos conflitantes preservados: ${c.fieldConflicts}`,
    `Campos sobrescritos pela fonte autorizada: ${c.fieldOverwrites}`,
    `Referências importadas com pendência: ${(plan.referenceWarnings || []).length}`,
    `Valores rejeitados: ${c.rejectedValues}`,
    `Raízes excluídas: ${plan.excluded.map((x) => x.root).join(", ") || "nenhuma"}`,
    `Raízes com trigger no plano: ${plan.triggerSensitiveRoots.filter((x) => x.plannedFields).map((x) => `${x.root}(${x.plannedFields})`).join(", ") || "nenhuma"}`,
  ].join("\n") + "\n";
}

function simulate(args) {
  if (!args.source) return fail("informe --source");
  const currentFile = args.current || downloadCurrent(args.project).file;
  const source = readJson(args.source);
  const current = readJson(currentFile);
  const plan = planMerge(source, current, {
    conflictPolicy: args.conflictPolicy || "preserve",
    invalidReferencePolicy: args.invalidReferencePolicy || "reject",
  });
  const dir = path.resolve(args.outDir, plan.runId);
  fs.mkdirSync(dir, {recursive: true});
  const planFile = path.join(dir, "plan.json");
  if (fs.existsSync(planFile)) fs.rmSync(planFile);
  writeJson(planFile, plan);
  fs.writeFileSync(path.join(dir, "report.txt"), humanReport(plan, args.source, currentFile));
  console.log(humanReport(plan, args.source, currentFile));
  console.log(`Plano estruturado: ${planFile}`);
}

function apply(args) {
  if (!args.plan || !args.confirmRun) return fail("informe --plan e --confirm-run");
  const plan = readJson(args.plan);
  if (args.confirmRun !== plan.runId) return fail("--confirm-run não corresponde ao plano");
  const sensitive = plan.triggerSensitiveRoots.filter((x) => x.plannedFields > 0 && TRIGGER_SENSITIVE_ROOTS.has(x.root));
  if (sensitive.length && !args.triggersDisabledAck) return fail(`plano toca gatilhos (${sensitive.map((x) => x.root).join(", ")}); desative-os e use --triggers-disabled-ack`);
  const workDir = path.dirname(path.resolve(args.plan));
  const checkpointFile = path.join(workDir, "checkpoint.json");
  const checkpoint = fs.existsSync(checkpointFile) ? readJson(checkpointFile) : {runId: plan.runId, completedBatches: 0, appliedPaths: []};
  const live = downloadCurrent(args.project).data;
  const remainingBeforeReconcile = plan.changes.filter((entry) => !checkpoint.appliedPaths.includes(entry.path));
  const alreadyPresent = remainingBeforeReconcile.filter((entry) => hash(getAtPath(live, entry.path)) === entry.afterHash);
  checkpoint.appliedPaths.push(...alreadyPresent.map((entry) => entry.path));
  const remaining = remainingBeforeReconcile.filter((entry) => !alreadyPresent.includes(entry));
  if (alreadyPresent.length) fs.writeFileSync(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
  const concurrent = verifyPreconditions(plan, live, remaining);
  if (concurrent.length) return fail(`${concurrent.length} mudanças concorrentes detectadas; gere nova simulação`);
  if (!fs.existsSync(path.join(workDir, "backup.json"))) writeJson(path.join(workDir, "backup.json"), {runId: plan.runId, entries: plan.changes.map(({path: p, beforeExists, before, beforeHash}) => ({path: p, beforeExists, before, beforeHash}))});
  const batches = createBatches(remaining, args.batchSize);
  for (let index = 0; index < batches.length; index++) {
    updateFirebase(args.project, batches[index], workDir, `apply-${checkpoint.completedBatches + 1}`);
    checkpoint.completedBatches++;
    checkpoint.appliedPaths.push(...Object.keys(batches[index]).map((p) => `/${p}`));
    fs.writeFileSync(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
  }
  const provenance = {runId: plan.runId, toolVersion: plan.toolVersion, sourceHash: plan.sourceHash, appliedAt: new Date().toISOString(), fields: checkpoint.appliedPaths.length, status: "APPLIED"};
  updateFirebase(args.project, {[`importacoes_dados/${plan.runId}`]: provenance}, workDir, "provenance");
  console.log(`Aplicação concluída: ${checkpoint.appliedPaths.length} campos; checkpoint ${checkpointFile}`);
}

function revert(args) {
  if (!args.plan || !args.confirmRun) return fail("informe --plan e --confirm-run");
  const plan = readJson(args.plan);
  if (args.confirmRun !== plan.runId) return fail("--confirm-run não corresponde ao plano");
  const workDir = path.dirname(path.resolve(args.plan));
  const checkpoint = readJson(path.join(workDir, "checkpoint.json"));
  const live = downloadCurrent(args.project).data;
  const revertPlan = createRevertEntries(plan, checkpoint.appliedPaths, live);
  if (revertPlan.changedAfter.length) return fail(`${revertPlan.changedAfter.length} campos mudaram após a importação; reversão recusada`);
  const batches = createBatches(revertPlan.entries, args.batchSize);
  for (let i = 0; i < batches.length; i++) updateFirebase(args.project, batches[i], workDir, `revert-${i + 1}`);
  updateFirebase(args.project, {[`importacoes_dados/${plan.runId}/status`]: "REVERTED", [`importacoes_dados/${plan.runId}/revertedAt`]: new Date().toISOString()}, workDir, "revert-provenance");
  console.log(`Reversão concluída: ${revertPlan.entries.length} campos`);
}

const args = parseArgs(process.argv.slice(2));
try {
  if (args.mode === "simulate") simulate(args);
  else if (args.mode === "apply") apply(args);
  else revert(args);
} catch (error) { fail(error.message); }
