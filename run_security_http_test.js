"use strict";
const assert=require("node:assert/strict");
const {createServer}=require("./functions/render-server");
(async()=>{
  let checked=false;
  const f=Object.assign(async()=>{}, {__endpoint:{callableTrigger:{}},run:async()=>({ok:true})});
  const s=createServer({fns:{test:f},rateLimit:2,admin:{auth:()=>({verifyIdToken:async(t,revoked)=>{checked=revoked;if(t==='revoked')throw Error('revoked');return{uid:'fixture'};}})}});
  await new Promise(r=>s.listen(0,'127.0.0.1',r));
  try {
    const url=`http://127.0.0.1:${s.address().port}`;
    assert.equal((await fetch(url+'/%ZZ')).status,400);
    const call=t=>fetch(url+'/test',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:'{"data":{}}'});
    assert.equal((await call('revoked')).status,401);
    assert.equal((await call('valid')).status,200);
    assert.equal(checked,true);
    assert.equal((await call('valid')).status,429);
    assert.equal((await fetch(url+'/health')).status,200);
    console.log('security-http: URI inválida, revogação, rate limit e saúde OK');
  } finally {await new Promise(r=>s.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
