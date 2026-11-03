'use strict';
// Somente leitura: confere o conjunto completo de regras publicado no projeto atual.
const fs=require('node:fs'),assert=require('node:assert/strict');
const req=require('node:module').createRequire(require('node:path').resolve('functions/package.json'));
const {GoogleAuth}=req('google-auth-library');
const keyPath=process.env.GOOGLE_APPLICATION_CREDENTIALS;
if(!keyPath)throw Error('Informe GOOGLE_APPLICATION_CREDENTIALS; credencial não é exibida.');
assert.equal(JSON.parse(fs.readFileSync(keyPath,'utf8')).project_id,'erpkuryos');
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
(async()=>{
  const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/firebase.database','https://www.googleapis.com/auth/userinfo.email']});
  const client=await auth.getClient();
  const {data}=await client.request({url:'https://erpkuryos-default-rtdb.firebaseio.com/.settings/rules.json',method:'GET'});
  const local=JSON.parse(fs.readFileSync('database.rules.json','utf8').replace(/^\s*\/\/.*$/gm,''));
  assert.deepEqual(ordered(data),ordered(local),'Regras publicadas diferentes da fonte');
  console.log('erpkuryos: regras publicadas integralmente iguais à fonte, leitura sem alteração de dados OK');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
