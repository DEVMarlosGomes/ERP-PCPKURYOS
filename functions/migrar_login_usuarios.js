"use strict";

// Backfill conservador do identificador de login. Não cria contas Auth, não
// define senha e não resolve UID conflitante. Sem --apply é somente leitura.
const fs = require("node:fs");
const path = require("node:path");
const {initializeApp, getApps} = require("firebase-admin/app");
const {getDatabase} = require("firebase-admin/database");
const {getAuth} = require("firebase-admin/auth");
const {normalizarUsuario, chaveUsuario, sugerirUsuario, reservarUsuario, liberarUsuario} = require("./login_personalizado");

async function listarAuth(auth) {
  const result=[]; let token;
  do { const page=await auth.listUsers(1000,token); result.push(...page.users); token=page.pageToken; } while(token);
  return result;
}

function backupPath() {
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  return path.join("/backups",`login-usuarios-${stamp}.json`);
}

async function main() {
  if(!getApps().length) initializeApp({projectId:process.env.GCLOUD_PROJECT||"erpkuryos",databaseURL:process.env.FIREBASE_DATABASE_URL||"https://erpkuryos-default-rtdb.firebaseio.com"});
  const db=getDatabase(),auth=getAuth();
  const [usersSnap,indexSnap,accounts]=await Promise.all([db.ref("usuarios").get(),db.ref("login_usuarios").get(),listarAuth(auth)]);
  const users=usersSnap.val()||{},index=indexSnap.val()||{};
  const authByUid=new Map(accounts.map(a=>[a.uid,a]));
  const authByEmail=new Map(accounts.filter(a=>a.email).map(a=>[a.email.toLowerCase(),a]));
  const used=new Set(); const plan=[]; const blocked=[];
  for(const [uid,profile] of Object.entries(users).sort((a,b)=>String(a[1].email||a[0]).localeCompare(String(b[1].email||b[0])))) {
    let usuario;
    try { usuario=profile.usuario ? normalizarUsuario(profile.usuario) : sugerirUsuario(profile.email,used); }
    catch(error){blocked.push({uid,email:profile.email||null,motivo:"EMAIL_OU_USUARIO_INVALIDO"});continue;}
    if(used.has(usuario)){blocked.push({uid,email:profile.email||null,usuario,motivo:"USUARIO_DUPLICADO"});continue;}
    used.add(usuario);
    const account=authByUid.get(uid),email=String(profile.email||"").toLowerCase(),byEmail=authByEmail.get(email);
    const vinculo=!account?(byEmail?"UID_DIVERGENTE":"SEM_AUTH"):(String(account.email||"").toLowerCase()===email?"OK":"EMAIL_DIVERGENTE");
    if(vinculo!=="OK") blocked.push({uid,email:profile.email||null,usuario,motivo:vinculo,uidAuth:byEmail&&byEmail.uid||null});
    const entry=index[chaveUsuario(usuario)];
    if(!profile.usuario||!entry||entry.uid!==uid||entry.usuario!==usuario) plan.push({uid,usuario,usuarioAnterior:profile.usuario||null,vinculo});
  }
  const report={ok:true,modo:process.argv.includes("--apply")?"apply":"dry-run",perfis:Object.keys(users).length,contasAuth:accounts.length,alteracoes:plan.length,bloqueios:blocked.length,plan,blocked};
  if(!process.argv.includes("--apply")){console.log(JSON.stringify(report,null,2));return;}
  const target=backupPath();
  if(!fs.existsSync("/backups"))throw new Error("Diretório /backups não montado; aplicação recusada sem backup.");
  const backup={format:1,createdAt:new Date().toISOString(),project:process.env.GCLOUD_PROJECT||"erpkuryos",usuarios:Object.fromEntries(Object.entries(users).map(([uid,p])=>[uid,{usuario:p.usuario||null}])),login_usuarios:index,auth:accounts.map(a=>({uid:a.uid,email:a.email||null,disabled:a.disabled===true}))};
  fs.writeFileSync(target,JSON.stringify(backup),{encoding:"utf8",mode:0o600,flag:"wx"});
  let applied=0;
  for(const item of plan){
    await reservarUsuario(db,item.usuario,item.uid);
    try{await db.ref(`usuarios/${item.uid}/usuario`).set(item.usuario);applied++;}
    catch(error){await liberarUsuario(db,item.usuario,item.uid).catch(()=>{});throw error;}
  }
  console.log(JSON.stringify({...report,applied,backup:target},null,2));
}

main().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;});
