"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const {compare} = require("../../scripts/auditoria-virada/compare");
test("negação não vira ausência de dados", () => {
  const r=compare({}, {ops:{a:{}}}, [{root:"ops",read:false,status:401}]);
  assert.equal(r.rows[0].status,"NAO_VERIFICADO");assert.equal(r.details.length,0);
});
test("registros ausentes, exclusivos e conflitantes nos dois sentidos", () => {
  const a={ops:{x:{n:1},y:{n:2},z:{n:3}}},b={ops:{x:{n:1},y:{n:4},w:{n:5}}};
  const r=compare(a,b,[{root:"ops",read:true}],a).rows[0];
  assert.equal(r.identical,1);assert.equal(r.changed,1);assert.equal(r.onlyReference,1);assert.equal(r.onlyTarget,1);
});
test("campo extra no destino não é sobrescrita da fonte", () => {
  const r=compare({p:{a:{v:1}}},{p:{a:{v:1,audit:2}}},[{root:"p",read:true}]).rows[0];
  assert.equal(r.changed,1);assert.equal(r.targetContainsSource,1);
});
test("fotografia antiga não é confundida com a atual", () => {
  const r=compare({p:{a:{v:2},b:{v:3}}},{p:{a:{v:1}}},[{root:"p",read:true}],{p:{a:{v:1}}}).rows[0];
  assert.equal(r.referenceNewSinceExport,1);assert.equal(r.referenceChangedSinceExport,1);
});
