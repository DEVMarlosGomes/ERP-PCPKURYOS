"use strict";
// Provas de exposição: somente em namespace demo, nunca em produção.
const assert = require("node:assert/strict");
const {createRequire} = require("node:module");
const path = require("node:path");
const req = createRequire(path.resolve("functions/package.json"));
const {initializeApp, getApps, deleteApp} = req("firebase-admin/app");
const {getDatabase} = req("firebase-admin/database");
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== "127.0.0.1:9023") throw Error("Exige emulador local 9023");
function db(name, uid) {
  return getDatabase(initializeApp({projectId:"demo-security", databaseURL:"http://127.0.0.1:9023?ns=demo-security-default-rtdb",
    ...(uid ? {databaseAuthVariableOverride:{uid}} : {})}, name));
}
(async()=>{
  const root=db("audit-root"), pending=db("audit-pending","pending"), operator=db("audit-operator","operator");
  await root.ref().set({usuarios:{pending:{role:"pending"},operator:{role:"production",tenant_id:"kuryos"}},
    formulas:{f:{conteudo:"SINTETICO"}},erp:{kuryos:{crm_clients:{fixture:{nome:"SINTETICO"}},audit_log:{fixture:{acao:"SINTETICA"}}}}});
  assert.equal((await pending.ref("formulas/f/conteudo").get()).val(),"SINTETICO");
  console.log("CONFIRMADO: perfil pending lê fórmula sem módulo");
  await operator.ref("erp/kuryos/crm_clients/fixture/nome").set("ALTERACAO_SINTETICA");
  console.log("CONFIRMADO: production sem módulo comercial altera CRM no tenant");
  await operator.ref("erp/kuryos/audit_log/fixture").remove();
  console.log("CONFIRMADO: mesmo operador apaga trilha audit_log do CRM");
  await assert.rejects(operator.ref("erp/outro/crm_clients/fixture").set({nome:"TESTE"}),/permission.denied/i);
  console.log("CONTROLE: escrita em outro tenant negada");
  await root.ref().remove();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await Promise.all(getApps().map(deleteApp));});
