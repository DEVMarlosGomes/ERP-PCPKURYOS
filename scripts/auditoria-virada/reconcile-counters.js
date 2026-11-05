'use strict';
// Somente eleva três contadores; nunca renumera nem reimporta documentos.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const req=require('node:module').createRequire(path.resolve(__dirname,'../../functions/package.json'));
const {initializeApp,cert,deleteApp}=req('firebase-admin/app');
const {getDatabase}=req('firebase-admin/database');
const pairs=[['pedidoCompra','pedidos_compra'],['solicitacaoCompra','solicitacoes_compra'],['processoCotacao','processos_cotacao']];
function floor(records) {
  let max=0;
  for(const [key,doc] of Object.entries(records || {})) for(const value of [doc.numero,doc.numeroFormatado,key]) {
    const match=/^(?:SC-|PC-|COT-)?(\d+)$/.exec(String(value));
    if(!match)continue;
    const n=Number(match[1]);
    if(!Number.isSafeInteger(n)||n<0)throw Error('Numeração histórica inválida.');
    max=Math.max(max,n);
  }
  return max;
}
async function run() {
  const args=process.argv.slice(2),apply=args.includes('--apply');
  const project=args[args.indexOf('--project')+1];
  if(apply&&(!args.includes('--project')||project!=='erpkuryos'))throw Error('--apply exige --project erpkuryos explícito.');
  if(!process.env.GOOGLE_APPLICATION_CREDENTIALS)throw Error('Defina GOOGLE_APPLICATION_CREDENTIALS fora do repositório.');
  const account=JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));
  if(account.project_id!=='erpkuryos')throw Error('Conta de serviço não pertence ao erpkuryos.');
  const app=initializeApp({credential:cert(account),projectId:'erpkuryos',databaseURL:'https://erpkuryos-default-rtdb.firebaseio.com'},'counter-reconcile');
  try {
    const db=getDatabase(app),plan=[];
    for(const [counter,collection]of pairs) {
      const [c,r]=await Promise.all([db.ref('config/contadores/'+counter).get(),db.ref(collection).get()]);
      const current=c.val();
      if(current!==null&&(!Number.isSafeInteger(current)||current<0))throw Error('Contador inválido: '+counter);
      const minimum=floor(r.val());
      plan.push({counter,collection,before:current,minimum,target:Math.max(current || 0,minimum),collectionHash:crypto.createHash('sha256').update(JSON.stringify(r.val())).digest('hex')});
    }
    console.log(JSON.stringify({mode:apply?'APPLY':'DRY_RUN',project:'erpkuryos',plan},null,2));
    if(!apply)return;
    const dir=path.resolve(__dirname,'../../scratch/virada-20261103');
    fs.mkdirSync(dir,{recursive:true});
    const backup=path.join(dir,'counter-reconcile-'+Date.now()+'.json');
    fs.writeFileSync(backup,JSON.stringify({project:'erpkuryos',em:new Date().toISOString(),plan},null,2),{mode:0o600,flag:'wx'});
    const results=[];
    for(const p of plan) {
      const result=await db.ref('config/contadores/'+p.counter).transaction(cur=>{
        if(cur!==null&&(!Number.isSafeInteger(cur)||cur<0))throw Error('Contador mudou para valor inválido.');
        return Math.max(cur || 0,p.target);
      });
      if(!result.committed)throw Error('Transação não confirmada: '+p.counter);
      const after=result.snapshot.val();
      if(after<p.minimum)throw Error('Pós-condição falhou: '+p.counter);
      results.push({counter:p.counter,after});
    }
    fs.writeFileSync(backup+'.result.json',JSON.stringify({em:new Date().toISOString(),results},null,2),{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({ok:true,backup:path.basename(backup),results}));
  } finally {await deleteApp(app);}
}
module.exports={floor};
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
