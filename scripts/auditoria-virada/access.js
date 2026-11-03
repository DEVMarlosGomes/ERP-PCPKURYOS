"use strict";
// Consulta Auth apenas no projeto de destino. Não migra identidades/senhas.
const fs = require("node:fs/promises"), path = require("node:path");
const req = require("node:module").createRequire(path.resolve(__dirname,"../../functions/package.json"));
const {initializeApp,cert,deleteApp}=req("firebase-admin/app"), {getAuth}=req("firebase-admin/auth");
const out=path.resolve(__dirname,"../../scratch/virada-20261103");
const email=v=>String(v||"").trim().toLowerCase();
const active=u=>u && u.desativado!==true && u.role && u.role!=="pending";
async function main(){
  const key=JSON.parse(await fs.readFile(process.argv[2],"utf8"));
  if(key.project_id!=="erpkuryos")throw Error("Projeto inesperado");
  const app=initializeApp({credential:cert(key)},"virada-auth-readonly");
  try{
    const users=[];let token;
    do{const page=await getAuth(app).listUsers(1000,token);users.push(...page.users.map(u=>({uid:u.uid,email:u.email||"",disabled:u.disabled})));token=page.pageToken;}while(token);
    const source=JSON.parse(await fs.readFile(path.join(out,"reference-live.json"),"utf8"));
    const target=JSON.parse(await fs.readFile(path.join(out,"target-live.json"),"utf8"));
    const details=Object.entries(source.usuarios||{}).filter(([,u])=>active(u)).map(([uid,u])=>{
      const candidates=Object.entries(target.usuarios||{}).filter(([,t])=>email(t.email) && email(t.email)===email(u.email));
      const identities=users.filter(t=>email(t.email) && email(t.email)===email(u.email));
      return {sourceUid:uid,email:u.email||"",targetProfiles:candidates.map(([key,p])=>({uid:key,active:!!active(p),role:p.role||null})),targetAuth:identities.map(t=>({uid:t.uid,disabled:t.disabled})),ready:identities.some(t=>!t.disabled&&candidates.some(([id,p])=>id===t.uid&&active(p)))};
    });
    const summary={targetAuthCount:users.length,targetAuthEnabled:users.filter(u=>!u.disabled).length,sourceProfiles:Object.keys(source.usuarios||{}).length,sourceActiveProfiles:details.length,sourceActiveWithTargetLoginAndProfile:details.filter(d=>d.ready).length,sourceActiveMissingTargetLoginOrProfile:details.filter(d=>!d.ready).length,targetProfiles:Object.keys(target.usuarios||{}).length,targetProfilesWithoutAuth:Object.keys(target.usuarios||{}).filter(uid=>!users.some(u=>u.uid===uid)).length};
    await fs.writeFile(path.join(out,"access-private.json"),JSON.stringify({summary,details,users},null,2),{mode:0o600,flag:"wx"});
    console.log(JSON.stringify(summary));
  }finally{await deleteApp(app);}
}
main().catch(()=>{console.error("Falha na conferência de acessos; nenhum usuário alterado.");process.exitCode=1;});
