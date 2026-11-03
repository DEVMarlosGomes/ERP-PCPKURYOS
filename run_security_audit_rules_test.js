"use strict";
// Provas de exposição: somente em namespace demo, nunca em produção.
const assert = require("node:assert/strict");
const {createRequire} = require("node:module");
const path = require("node:path");
const req = createRequire(path.resolve("functions/package.json"));
const {initializeApp, getApps, deleteApp} = req("firebase-admin/app");
const {getDatabase} = req("firebase-admin/database");
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== "127.0.0.1:9023") throw Error("Exige emulador local 9023");
function db(name, uid, authTime = 200) {
  return getDatabase(initializeApp({projectId:"demo-security", databaseURL:"http://127.0.0.1:9023?ns=demo-security-default-rtdb",
    ...(uid ? {databaseAuthVariableOverride:{uid,token:{auth_time:authTime}}} : {})}, name));
}
(async()=>{
  const root=db("audit-root"), pending=db("audit-pending","pending"), operator=db("audit-operator","operator");
  const sales=db("audit-sales","sales"), revoked=db("audit-revoked","sales",50), admin=db("audit-admin","admin");
  await root.ref().set({usuarios:{pending:{role:"pending"},operator:{role:"production",tenant_id:"kuryos"},sales:{role:"comercial",tenant_id:"kuryos"},admin:{role:"admin"}},
    formulas:{f:{conteudo:"SINTETICO"}},erp:{kuryos:{crm_clients:{fixture:{nome:"SINTETICO"}},audit_log:{fixture:{acao:"SINTETICA"}}}}});
  const denied = /permission.denied/i;
  await assert.rejects(pending.ref("formulas/f/conteudo").get(),denied);
  console.log("PROTEGIDO: pending não lê fórmula");
  await assert.rejects(operator.ref("erp/kuryos/crm_clients/fixture/nome").set("ALTERACAO_SINTETICA"),denied);
  console.log("PROTEGIDO: production sem módulo não altera CRM");
  await assert.rejects(operator.ref("erp/kuryos/audit_log/fixture").remove(),denied);
  await assert.rejects(sales.ref("erp/kuryos/audit_log/fixture").remove(),denied);
  await assert.rejects(admin.ref("erp/kuryos/audit_log/fixture").remove(),denied);
  await assert.rejects(sales.ref("erp/kuryos").remove(),denied);
  console.log("PROTEGIDO: auditoria e tenant não podem ser apagados pelo cliente");
  await sales.ref("erp/kuryos/crm_clients/fixture/nome").set("COMERCIAL_AUTORIZADO");
  await root.ref("security_sessions/sales").set({revokedAfter:100});
  await assert.rejects(revoked.ref("erp/kuryos/crm_clients/fixture").get(),denied);
  assert.ok((await sales.ref("erp/kuryos/crm_clients/fixture").get()).exists());
  console.log("PROTEGIDO: sessão antiga negada, login posterior preservado");
  await assert.rejects(operator.ref("erp/outro/crm_clients/fixture").set({nome:"TESTE"}),/permission.denied/i);
  console.log("CONTROLE: escrita em outro tenant negada");
  await root.ref().remove();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await Promise.all(getApps().map(deleteApp));});
