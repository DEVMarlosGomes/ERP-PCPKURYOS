'use strict';
// Somente leitura: não cria Auth, não altera senha e não concede acesso.
const fs=require('node:fs'),path=require('node:path');
const req=require('node:module').createRequire(path.resolve(__dirname,'../../functions/package.json'));
const {initializeApp,cert,deleteApp}=req('firebase-admin/app');
const {getAuth}=req('firebase-admin/auth'),{getDatabase}=req('firebase-admin/database');
(async()=>{
  const key=JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));
  if(key.project_id!=='erpkuryos')throw Error('Projeto inesperado');
  const app=initializeApp({credential:cert(key),databaseURL:'https://erpkuryos-default-rtdb.firebaseio.com'},'access-read-only');
  try {
    const profiles=(await getDatabase(app).ref('usuarios').get()).val()||{};
    const auth=[];let token;
    do {const p=await getAuth(app).listUsers(1000,token);auth.push(...p.users.map(u=>({uid:u.uid,email:u.email,disabled:u.disabled})));token=p.pageToken;} while(token);
    const norm=v=>String(v||'').trim().toLowerCase(),counts={profiles:0,withEmail:0,linked:0,withoutLogin:0,emailConflict:0,emailMismatch:0,pending:0,disabled:0};
    const seen=new Set();let duplicateEmails=0,conflictsWithoutCanonicalProfile=0;
    for(const [uid,p]of Object.entries(profiles)) {
      counts.profiles++;if(p.role==='pending')counts.pending++;if(p.desativado)counts.disabled++;
      if(!norm(p.email))continue;counts.withEmail++;
      if(seen.has(norm(p.email)))duplicateEmails++;seen.add(norm(p.email));
      const a=auth.find(u=>u.uid===uid);
      if(a){counts[norm(a.email)===norm(p.email)?'linked':'emailMismatch']++;}
      else {
        const existing=auth.find(u=>norm(u.email)===norm(p.email));
        counts[existing?'emailConflict':'withoutLogin']++;
        if(existing&&!profiles[existing.uid])conflictsWithoutCanonicalProfile++;
      }
    }
    const journals=Object.values((await getDatabase(app).ref('auditoria_acessos').get()).val()||{});
    const locks=Object.keys((await getDatabase(app).ref('identidade_locks').get()).val()||{}).length;
    console.log(JSON.stringify({...counts,authAccounts:auth.length,duplicateEmails,conflictsWithoutCanonicalProfile,activeLocks:locks,operationsRequiringReview:journals.filter(j=>j.status==='REQUER_CONFERENCIA').length}));
  } finally {await deleteApp(app);}
})().catch(()=>{console.error('Falha na leitura de acessos; nenhum dado alterado.');process.exitCode=1;});
