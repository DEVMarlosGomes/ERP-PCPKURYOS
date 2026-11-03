"use strict";
// Reducer puro: a integração futura deve persistir o retorno em transação e
// obter actor/policy/currentSources no servidor. Não exportado por index.js.
const Epa = require("./epa");
const copy = value => JSON.parse(JSON.stringify(value));
function fail(code, message, details) { throw Object.assign(new Error(message), {code, details}); }
function authorize(actor, roles) {
  if (!actor?.uid || actor.active !== true) fail("permission-denied", "Perfil ativo obrigatório.");
  if (!roles.some(r => actor.roles?.includes(r))) fail("permission-denied", "Ação não autorizada para este perfil.");
}
function fresh(record, spec) {
  if (record.sourceHash !== Epa.digest(spec)) fail("aborted", "As fontes mudaram; atualize e revalide o rascunho.");
}
function event(record, action, actor, time, reason = "") {
  record.history.push({action, uid: actor.uid, at: time, revision: record.revision, reason});
}
function prepare(previous, spec, actor, time, reason = "") {
  authorize(actor, ["pd", "qualidade", "engenharia_produto", "admin"]);
  if (previous && previous.status !== "RASCUNHO") fail("failed-precondition", "Use revisão; não sobrescreva documento em validação ou aprovado.");
  const record = previous ? copy(previous) : {revision: 1, status: "RASCUNHO", preparedBy: actor.uid, history: [], approvals: []};
  record.sourceHash = Epa.digest(spec);
  record.snapshot = Epa.snapshot(spec);
  record.preparedBy = actor.uid;
  record.approvals = [];
  record.readiness = Epa.validate(spec);
  event(record, "PREPARAR", actor, time, reason);
  return record;
}
function submit(record, currentSpec, actor, time) {
  authorize(actor, ["pd", "qualidade", "engenharia_produto", "admin"]);
  if (record.status !== "RASCUNHO") fail("failed-precondition", "Somente rascunhos podem entrar em validação.");
  fresh(record, currentSpec);
  const result = Epa.validate(currentSpec);
  if (!result.ready) fail("failed-precondition", "Resolva as pendências nas fontes.", result.pending);
  const next = copy(record); next.status = "EM_VALIDACAO";
  event(next, "ENVIAR_VALIDACAO", actor, time);
  return next;
}
function approve(record, currentSpec, actor, policy, time) {
  if (!policy?.confirmed || !Array.isArray(policy.requiredRoles) || !policy.requiredRoles.length || policy.requiredRoles.some(r => !["qualidade", "engenharia_produto", "comercial", "admin"].includes(r))) fail("failed-precondition", "Política industrial de aprovação não confirmada.");
  authorize(actor, policy.requiredRoles);
  if (actor.uid === record.preparedBy) fail("permission-denied", "Elaborador não pode aprovar a própria revisão.");
  if (record.status !== "EM_VALIDACAO") fail("failed-precondition", "Revisão não está em validação.");
  fresh(record, currentSpec);
  const policyHash = Epa.digest(policy);
  if (record.policyHash && record.policyHash !== policyHash) fail("aborted", "Política de aprovação mudou; abra nova revisão.");
  if (record.approvals.some(a => a.uid === actor.uid)) return copy(record);
  // Uma identidade assina somente um papel por revisão. Sem aprovação automática
  // de todos os papéis quando um administrador acumula funções.
  const role = policy.requiredRoles.find(r => actor.roles.includes(r) && !record.approvals.some(a => a.role === r));
  if (!role) fail("failed-precondition", "Seu papel já foi conferido nesta revisão.");
  const next = copy(record);
  next.policyHash = policyHash;
  next.approvals.push({uid: actor.uid, role, at: time, revision: next.revision, sourceHash: next.sourceHash});
  next.status = policy.requiredRoles.every(r => next.approvals.some(a => a.role === r)) ? "APROVADA" : "EM_VALIDACAO";
  event(next, "APROVAR", actor, time);
  return next;
}
function revise(record, currentSpec, actor, time, reason) {
  authorize(actor, ["pd", "qualidade", "engenharia_produto", "admin"]);
  if (!String(reason || "").trim()) fail("invalid-argument", "Justificativa de revisão obrigatória.");
  if (!["APROVADA", "EM_VALIDACAO"].includes(record.status)) fail("failed-precondition", "Revisão anterior precisa estar aprovada ou em validação.");
  const next = prepare(null, currentSpec, actor, time, reason);
  next.revision = record.revision + 1;
  next.previousHash = Epa.digest(record);
  next.history[0].revision = next.revision;
  return next;
}
module.exports = {prepare, submit, approve, revise};
