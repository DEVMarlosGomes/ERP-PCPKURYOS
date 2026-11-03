"use strict";
const assert=require("node:assert/strict");
const path=require("node:path");
const req=require("node:module").createRequire(path.resolve("functions/package.json"));
process.env.GCLOUD_PROJECT="demo-security-api";
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:"demo-security-api",databaseURL:"https://demo-security-api.firebaseio.com"});
const fns=require("./functions/index");
const db=req("firebase-admin/database").getDatabase();
const original=db.ref;
const rows={};
db.ref=p=>({get:async()=>({val:()=>({nome:"Autor real",role:p.endsWith('/denied')?"production":"comercial",tenant_id:"kuryos"})}),
  push:()=>({key:"synthetic",set:async data=>{rows[p]=data;}})});
(async()=>{
 const call=(uid,tenant)=>fns.registrarAuditoriaCrm.run({auth:{uid},data:{tenant_id:tenant,action:"fixture",entity_type:"client",entity_id:"fixture",user_id:"FORGED",user_name:"FORGED"}});
 await assert.rejects(call("denied","kuryos"),/Sem acesso/);
 await assert.rejects(call("allowed","outro"),/Empresa inválida/);
 await call("allowed","kuryos");
 assert.equal(rows['erp/kuryos/audit_log'].user_id,"allowed");
 assert.equal(rows['erp/kuryos/audit_log'].user_name,"Autor real");
 assert.equal(rows['erp/kuryos/audit_log'].origem,"client_reported");
 console.log("security-audit-endpoint: perfil, tenant e autor confiável OK");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{db.ref=original;});
