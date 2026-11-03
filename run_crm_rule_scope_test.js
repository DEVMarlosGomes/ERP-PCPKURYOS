'use strict';
// Evita divergência entre a autorização de coleções genéricas e explícitas.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const rules=JSON.parse(fs.readFileSync('database.rules.json','utf8').replace(/^\s*\/\/.*$/gm,''));
const tenant=rules.rules.erp.$tenant;
const expected=tenant.$collection['.write'].replace(" && $collection != 'audit_log' && $collection != 'pd_liberacoes_status'",'');
assert.notEqual(expected,tenant.$collection['.write']);
for(const key of ['pd_requests','sku_por_orcamento','crm_samples','crm_propostas']) assert.equal(tenant[key]['.write'],expected,key);
assert.equal(tenant['.write'],false);
assert.equal(tenant.pd_liberacoes_status['.validate'],false);
assert.equal(tenant.audit_log?.['.write'],undefined);
assert.match(tenant.$collection['.write'],/\$collection != 'audit_log'/);
assert.match(expected,/security_sessions/);
assert.match(expected,/tenant_id/);
assert.match(expected,/desativado/);
console.log('CRM regras: quatro coleções com política equivalente; tenant/auditoria/tickets protegidos OK');
