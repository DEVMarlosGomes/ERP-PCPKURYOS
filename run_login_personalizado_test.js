"use strict";

const assert = require("node:assert/strict");
const {criarServicoLogin, normalizarUsuario, chaveUsuario, sugerirUsuario} = require("./functions/login_personalizado");

const clone = (v) => v == null ? v : JSON.parse(JSON.stringify(v));
function getAt(root, path) { return String(path || "").split("/").filter(Boolean).reduce((v, k) => v && v[k], root); }
function setAt(root, path, value) {
  const parts = String(path).split("/").filter(Boolean); let cursor = root;
  parts.slice(0, -1).forEach((key) => { cursor[key] ||= {}; cursor = cursor[key]; });
  if (value == null) delete cursor[parts.at(-1)]; else cursor[parts.at(-1)] = clone(value);
}
function fakeDb(seed) {
  const state = clone(seed); let seq = 0;
  return {state, ref(path = "") { return {
    get: async () => ({val: () => clone(getAt(state, path))}),
    set: async (value) => setAt(state, path, value),
    update: async (updates) => { for (const [k,v] of Object.entries(updates)) setAt(state, [path,k].filter(Boolean).join("/"), v); },
    transaction: async (fn) => { const current=clone(getAt(state,path)); const next=fn(current); if(next===undefined)return {committed:false,snapshot:{val:()=>current}}; setAt(state,path,next); return {committed:true,snapshot:{val:()=>clone(next)}}; },
    push: () => ({key:`a${++seq}`, set:async(value)=>setAt(state,`auditoria_acessos/a${seq}`,value)}),
  }; }};
}

(async () => {
  assert.equal(normalizarUsuario("  Maria.Silva "), "maria.silva");
  assert.throws(() => normalizarUsuario("ab"), /3 a 32/);
  assert.equal(sugerirUsuario("maria.silva@example.test", new Set(["maria.silva"])), "maria.silva-2");
  const username = "maria.silva", uid = "u1", fixed = new Date("2026-11-06T12:00:00Z");
  const db = fakeDb({
    usuarios:{u1:{nome:"Maria",email:"maria@example.test",usuario:username,role:"pcp",exigir_troca_senha:true}},
    login_usuarios:{[chaveUsuario(username)]:{uid,usuario:username}},
  });
  const calls=[];
  const auth={
    getUser:async(id)=>{if(id!==uid)throw Object.assign(Error("missing"),{code:"auth/user-not-found"});return {uid,email:"maria@example.test",disabled:false};},
    getUserByEmail:async(email)=>{if(email!=="maria@example.test")throw Object.assign(Error("missing"),{code:"auth/user-not-found"});return {uid,email,disabled:false};},
    createCustomToken:async(id)=>`token-${id}`,
    revokeRefreshTokens:async(id)=>calls.push(["revoke",id]),
  };
  const fetchImpl=async(url,opts)=>{const body=JSON.parse(opts.body);calls.push(["password",body.email,body.password]);return {ok:body.password==="Correta9!",json:async()=>body.password==="Correta9!"?{localId:uid}:{error:{message:"INVALID_LOGIN_CREDENTIALS"}}};};
  const service=criarServicoLogin({db,auth,now:()=>fixed,fetchImpl,apiKey:"public-test-key"});
  const byUser=await service.autenticar({identificador:username,senha:"Correta9!"});
  const byEmail=await service.autenticar({identificador:"MARIA@EXAMPLE.TEST",senha:"Correta9!"});
  assert.equal(byUser.token,"token-u1"); assert.equal(byEmail.token,"token-u1");
  assert.equal(db.state.usuarios.u1.ultimo_login_metodo,"email");
  await assert.rejects(service.autenticar({identificador:username,senha:"Errada9!"}),e=>e.code==="unauthenticated"&&e.message==="Credenciais inválidas.");
  await assert.rejects(service.autenticar({identificador:"inexistente",senha:"Errada9!"}),e=>e.code==="unauthenticated"&&e.message==="Credenciais inválidas.");
  assert.ok(!JSON.stringify(db.state).includes("Correta9!"));
  const request={auth:{uid,token:{auth_time:fixed.getTime()/1000}},data:{acao:"registrar_troca_senha"}};
  await service.minhaConta(request);
  assert.equal(db.state.usuarios.u1.exigir_troca_senha,undefined);
  assert.equal(db.state.usuarios.u1.senha_definida_em,fixed.toISOString());
  await service.minhaConta({...request,data:{acao:"encerrar_sessoes"}});
  assert.deepEqual(calls.at(-1),["revoke",uid]);
  assert.ok(db.state.security_sessions.u1.revokedAfter);
  console.log("Login personalizado: usuário/e-mail no mesmo UID, erro genérico, segredo ausente, troca própria e revogação OK");
})().catch((error)=>{console.error(error);process.exitCode=1;});

