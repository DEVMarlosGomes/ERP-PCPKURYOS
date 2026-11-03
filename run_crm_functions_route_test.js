'use strict';
// SDK modular real do CRM, transporte totalmente interceptado, sem login.
const assert=require('node:assert/strict'),path=require('node:path');
const req=require('node:module').createRequire(path.resolve('crm-frontend/package.json'));
(async()=>{
  const originalFetch=global.fetch,calls=[];
  global.fetch=async(url,options)=>{calls.push({url:String(url),method:options.method});return{status:200,json:async()=>({result:{ok:true}})};};
  const {initializeApp,deleteApp}=req('firebase/app');
  const {getFunctions,httpsCallable}=req('firebase/functions');
  const app=initializeApp({projectId:'demo-crm-route',apiKey:'demo-only',appId:'demo-only'},'crm-route');
  try{
    const result=await httpsCallable(getFunctions(app,'https://kuryoserp.com.br/api'),'liberarEtapaPd')({requestId:'synthetic',novoStatus:'IN_TESTS'});
    assert.equal(result.data.ok,true);
    assert.equal(calls[0].url,'https://kuryoserp.com.br/api/liberarEtapaPd');
    assert.equal(calls[0].method,'POST');
    console.log('SDK modular CRM: /api/liberarEtapaPd preservado, sem rede/conta real OK');
  }finally{global.fetch=originalFetch;await deleteApp(app);}
})().catch(e=>{console.error(e);process.exitCode=1;});
