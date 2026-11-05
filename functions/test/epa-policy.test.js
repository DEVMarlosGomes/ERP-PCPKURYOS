"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {INDUSTRIAL_APPROVAL_POLICY: policy} = require("../epa-policy");
const R = require("../epa-revisions");
const {fixture} = require("./fixtures/epa");
const time = "2026-11-03T15:00:00.000Z";
const actor = (uid, roles) => ({uid, active: true, roles});

test("política confirmada exige as duas aprovações em qualquer ordem", () => {
  for (const roles of [["qualidade", "engenharia_produto"], ["engenharia_produto", "qualidade"]]) {
    const {spec} = fixture(), editor = actor("pd", ["pd"]);
    const draft = R.submit(R.prepare(null, spec, editor, time), spec, editor, time);
    const first = R.approve(draft, spec, actor("a", [roles[0]]), policy, time);
    assert.equal(first.status, "EM_VALIDACAO");
    const final = R.approve(first, spec, actor("b", [roles[1]]), policy, time);
    assert.equal(final.status, "APROVADA");
    assert.equal(final.approvals.length, 2);
    assert.equal(final.authorizedForProduction, undefined);
  }
});
test("administrador sem os papéis requeridos não substitui os aprovadores", () => {
  const {spec} = fixture(), editor = actor("pd", ["pd"]);
  const draft = R.submit(R.prepare(null, spec, editor, time), spec, editor, time);
  assert.throws(() => R.approve(draft, spec, actor("admin", ["admin"]), policy, time), {code: "permission-denied"});
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.requiredRoles), true);
});
