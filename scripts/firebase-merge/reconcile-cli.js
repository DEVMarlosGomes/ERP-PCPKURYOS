#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {buildReconciliationPlan} = require("./reference-reconciliation");

function parseArgs(argv) {
  const args = {outDir: path.join("scratch", "reconciliacao-46")};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    args[key] = argv[++i];
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function report(plan, officialFile, currentFile) {
  const c = plan.counts;
  const byMethod = plan.decisions.reduce((acc, decision) => {
    acc[decision.method] = (acc[decision.method] || 0) + 1;
    return acc;
  }, {});
  return [
    `Execucao: ${plan.runId}`,
    "Modo: SIMULACAO (nenhuma escrita)",
    `Fonte oficial: ${officialFile}`,
    `Corte oficial: ${plan.officialCutoff}`,
    `Fotografia destino: ${currentFile}`,
    `Pendencias abertas: ${c.pendingOpen}`,
    `Pendencias com decisao segura: ${c.pendingResolved}`,
    `Pendencias sem decisao: ${c.unresolved}`,
    `Referencias de produto: ${c.productReferences}`,
    `Placeholders historicos: ${c.placeholderReferences}`,
    `Especificacoes de material: ${c.materialReferences}`,
    `Aliases distintos: ${c.aliasesTouched}`,
    `Registros historicos reescritos: ${c.historicalRecordsRewritten}`,
    `Campos planejados: ${c.fieldsPlanned}`,
    `Metodos: ${Object.entries(byMethod).sort().map(([key, value]) => `${key}=${value}`).join(", ")}`,
  ].join("\n") + "\n";
}

const args = parseArgs(process.argv.slice(2));
if (!args.official || !args.current) {
  console.error("ERRO: informe --official e --current");
  process.exit(1);
}

try {
  const official = readJson(args.official);
  const current = readJson(args.current);
  const plan = buildReconciliationPlan(official, current, {resolvedAt: args.resolvedAt, resolvedBy: args.resolvedBy});
  const runDir = path.resolve(args.outDir, plan.runId);
  fs.mkdirSync(runDir, {recursive: true});
  const planFile = path.join(runDir, "plan.json");
  const reportFile = path.join(runDir, "report.txt");
  if (fs.existsSync(planFile) || fs.existsSync(reportFile)) throw new Error(`artefato ja existe: ${runDir}`);
  fs.writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`, {flag: "wx"});
  fs.writeFileSync(reportFile, report(plan, args.official, args.current), {flag: "wx"});
  process.stdout.write(report(plan, args.official, args.current));
  console.log(`Plano estruturado: ${planFile}`);
} catch (error) {
  console.error(`ERRO: ${error.message}`);
  process.exitCode = 1;
}
