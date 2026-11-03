"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const R = require("../epa-revisions");
const {fixture} = require("./fixtures/epa");
const editor = {uid: "preparador", active: true, roles: ["pd"]};
const quality = {uid: "conferente", active: true, roles: ["qualidade"]};
const policy = {confirmed: true, requiredRoles: ["qualidade"]};
const time = "2026-11-03T15:00:00.000Z";
test("preparação/validação/aprovação separadas, sem autorização de OP", () => {
  const {spec} = fixture();
  const draft = R.prepare(null, spec, editor, time);
  const submitted = R.submit(draft, spec, editor, time);
  const approved = R.approve(submitted, spec, quality, policy, time);
  assert.equal(draft.status, "RASCUNHO"); assert.equal(submitted.status, "EM_VALIDACAO");
  assert.equal(approved.status, "APROVADA"); assert.equal(approved.artifact, undefined);
  assert.equal(approved.authorizedForProduction, undefined);
  assert.equal(approved.history.length, 3);
});
test("rascunho permite pendências mas não valida", () => {
  const {spec} = fixture(); spec.customer.name = "";
  const draft = R.prepare(null, spec, editor, time);
  assert.equal(draft.readiness.ready, false);
  assert.throws(() => R.submit(draft, spec, editor, time), /pendências/);
});
test("perfil inativo ou produção não prepara nem aprova", () => {
  const {spec} = fixture();
  for (const actor of [{...editor, active: false}, {...editor, roles: ["production"]}]) assert.throws(() => R.prepare(null, spec, actor, time), {code: "permission-denied"});
});
test("autoaprovação recusada mesmo quando elaborador é administrador", () => {
  const {spec} = fixture(), admin = {...editor, roles: ["admin", "qualidade"]};
  const d = R.submit(R.prepare(null, spec, admin, time), spec, admin, time);
  assert.throws(() => R.approve(d, spec, admin, policy, time), /própria/);
});
test("sem política confirmada não aprova", () => {
  const {spec} = fixture(), d = R.submit(R.prepare(null, spec, editor, time), spec, editor, time);
  assert.throws(() => R.approve(d, spec, quality, {}, time), /não confirmada/);
});
test("alteração de origem entre validação e aprovação aborta", () => {
  const {spec} = fixture(), d = R.submit(R.prepare(null, spec, editor, time), spec, editor, time);
  spec.variants[0].name = "Outra revisão";
  assert.throws(() => R.approve(d, spec, quality, policy, time), {code: "aborted"});
});
test("aprovação final não sobrescreve registro anterior; revisão limpa assinaturas", () => {
  const {spec} = fixture(), d = R.submit(R.prepare(null, spec, editor, time), spec, editor, time);
  const approved = R.approve(d, spec, quality, policy, time), before = JSON.stringify(approved);
  assert.throws(() => R.prepare(approved, spec, editor, time), /não sobrescreva/);
  assert.throws(() => R.revise(approved, spec, editor, time, ""), /Justificativa/);
  const next = R.revise(approved, spec, editor, time, "Alteração de embalagem");
  assert.equal(next.revision, 2); assert.equal(next.status, "RASCUNHO"); assert.deepEqual(next.approvals, []);
  assert.equal(JSON.stringify(approved), before);
});
test("cada papel requer decisão de identidade distinta; retry não duplica assinatura", () => {
  const {spec} = fixture(), d = R.submit(R.prepare(null, spec, editor, time), spec, editor, time);
  const p = {confirmed: true, requiredRoles: ["qualidade", "engenharia_produto"]};
  const multi = {...quality, roles: ["qualidade", "engenharia_produto"]};
  const first = R.approve(d, spec, multi, p, time);
  assert.equal(first.status, "EM_VALIDACAO"); assert.equal(first.approvals.length, 1);
  assert.deepEqual(R.approve(first, spec, multi, p, time), first);
  const second = R.approve(first, spec, {uid: "engenharia", active: true, roles: ["engenharia_produto"]}, p, time);
  assert.equal(second.status, "APROVADA");
});
test("mudança da política após primeira assinatura exige revisão", () => {
  const {spec} = fixture(), d = R.submit(R.prepare(null, spec, editor, time), spec, editor, time);
  const p = {confirmed: true, requiredRoles: ["qualidade", "engenharia_produto"]};
  const first = R.approve(d, spec, quality, p, time);
  assert.throws(() => R.approve(first, spec, {...quality, uid: "outro"}, policy, time), /Política de aprovação mudou/);
});
