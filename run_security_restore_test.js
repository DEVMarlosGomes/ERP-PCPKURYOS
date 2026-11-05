"use strict";
// Restaura exclusivamente no namespace demo local. Nunca usa URL do manifesto.
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib"),crypto=require("node:crypto");
if(process.env.FIREBASE_DATABASE_EMULATOR_HOST!=="127.0.0.1:9023")throw Error("Exige emulador local 9023");
const dir=path.resolve(process.argv[2]||"scratch/security-backups/security-before-20261103-v2");
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=v=>crypto.createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
const url="http://127.0.0.1:9023/.json?ns=demo-security-default-rtdb";
async function request(method,body) {
 const r=await fetch(url,{method,headers:{Authorization:"Bearer owner","Content-Type":"application/json"},
   body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error(`Emulador HTTP ${r.status}`);
 return r.json();
}
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,"manifest.json")));
 const raw=zlib.gunzipSync(fs.readFileSync(path.join(dir,"rtdb.json.gz")));
 if(raw.length!==manifest.rtdb.uncompressedBytes)throw Error("Tamanho inconsistente");
 const original=JSON.parse(raw);
 const users=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir,"auth-users.json.gz"))));
 if(users.length!==manifest.auth.count)throw Error("Contagem Auth inconsistente");
 await request("PUT",original);
 const restored=await request("GET");
 if(digest(original)!==digest(restored))throw Error("Dados restaurados diferem");
 console.log(JSON.stringify({restore:"OK",bytes:raw.length,rootNodes:Object.keys(restored).length,authExport:users.length,sha256:digest(restored)}));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{await request("DELETE");});
