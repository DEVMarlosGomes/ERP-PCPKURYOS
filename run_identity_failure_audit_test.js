"use strict";

// Regressões de falha/compensação, com fixtures em memória, sem Firebase real.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {criarServicoIdentidade} = require('./functions/identidade_acesso');
const fixtures = fs.readFileSync('run_identity_access_test.js','utf8').split('const fixed =')[0];
const {fakeDb,fakeAuth} = vm.runInNewContext(fixtures + '\n;({fakeDb,fakeAuth})', {require,console});
const time = new Date('2026-11-03T15:00:00Z');
const admin = {nome:'Synthetic Admin',email:'admin@example.test',role:'admin'};
const operator = {nome:'Synthetic Operator',email:'operator@example.test',role:'production'};
function scenario(accounts = {adm:{email:admin.email},op:{email:operator.email}}) {
  const db = fakeDb({usuarios:{adm:admin,op:operator}});
  const auth = fakeAuth(accounts);
  const service = criarServicoIdentidade({db,auth,now:()=>time,uuid:()=> 'synthetic-version'});
  const call = data => service.executar({auth:{uid:'adm',token:{auth_time:time.getTime()/1000}},data});
  return {db,auth,call};
}
(async()=>{
  {
    const {db,auth,call} = scenario();
    auth.revokeRefreshTokens = async()=>{throw new Error('synthetic revoke failure');};
    await assert.rejects(call({acao:'modulos',uid:'op',modulos:{cadastros:true}}), /synthetic revoke failure/);
    assert.equal(db.state.usuarios.op.modulos,undefined);
    assert.ok(Object.values(db.state.auditoria_acessos).some(x=>x.status==='REQUER_CONFERENCIA'));
    console.log('OK: falha de revogação compensa módulos e deixa journal durável.');
  }
  {
    const {db,auth,call} = scenario();
    const original = db.ref;
    db.ref = path => {
      const ref = original(path);
      if (/^auditoria_acessos\/p/.test(String(path))) ref.set = async()=>{throw new Error('synthetic audit failure');};
      return ref;
    };
    await assert.rejects(call({acao:'atualizar',uid:'op',nome:'Changed',email:'changed@example.test',tenant_id:'kuryos'}), /synthetic audit failure/);
    assert.equal(db.state.usuarios.op.email,operator.email);
    assert.equal(auth.users.op.email,operator.email);
    console.log('OK: falha de auditoria compensa Auth/perfil e preserva journal.');
  }
  {
    const {db,call} = scenario({adm:{email:admin.email}});
    await assert.rejects(call({acao:'criar',nome:operator.nome,email:operator.email,funcoes:['production']}),e=>e.code==='already-exists');
    assert.equal(Object.values(db.state.usuarios).filter(u=>u.email===operator.email).length,1);
    console.log('OK: servidor bloqueia criação duplicada de perfil órfão.');
  }
  {
    const {db,auth,call} = scenario({adm:{email:admin.email}});
    assert.equal((await call({acao:'diagnosticar',uid:'op'})).vinculo,'SEM_LOGIN');
    const result = await call({acao:'regularizar_login',uid:'op',confirmacao_email:operator.email,requestId:'synthetic_request_0001'});
    assert.equal(result.uid,'op');
    assert.equal(auth.users.op.email,operator.email);
    assert.equal(db.state.usuarios.op.role,'production');
    assert.equal(Object.keys(db.state.usuarios).length,2);
    const repeated = await call({acao:'regularizar_login',uid:'op',confirmacao_email:operator.email,requestId:'synthetic_request_0001'});
    assert.equal(repeated.uid,'op');
    assert.equal(auth.calls.filter(x=>x[0]==='createUser').length,1);
    await assert.rejects(call({acao:'excluir',uid:'op',confirmacao_email:operator.email,requestId:'synthetic_request_0001'}),e=>e.code==='failed-precondition');
    console.log('OK: regularização explícita preserva UID/acessos e retry não duplica efeito.');
  }
  {
    const {db,call} = scenario({adm:{email:admin.email},other:{uid:'other',email:operator.email}});
    assert.equal((await call({acao:'diagnosticar',uid:'op'})).vinculo,'CONFLITO_EMAIL');
    await assert.rejects(call({acao:'regularizar_login',uid:'op',confirmacao_email:operator.email}),e=>e.code==='already-exists');
    assert.equal(Object.keys(db.state.usuarios).length,2);
    console.log('OK: conflito de UID/e-mail bloqueia fusão automática.');
  }
  {
    const {auth,call} = scenario();
    const create=auth.createUser;
    let release;
    const gate=new Promise(resolve=>{release=resolve;});
    auth.createUser=async data=>{await gate;return create(data);};
    const payload={acao:'criar',nome:'Novo',email:'novo@example.test',funcoes:['production'],requestId:'synthetic_concurrent_001'};
    const first=call(payload);
    // Esperar a operação chegar ao Auth sem deixar janela de duplicação.
    await new Promise(resolve=>setTimeout(resolve,20));
    await assert.rejects(call(payload),e=>['failed-precondition','resource-exhausted'].includes(e.code));
    release();
    await first;
    assert.equal(auth.calls.filter(x=>x[0]==='createUser').length,1);
    assert.equal((await call(payload)).ok,true);
    console.log('OK: operação concorrente/retry com mesmo ID executa apenas uma vez.');
  }
  console.log('identity failure regressions: OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
