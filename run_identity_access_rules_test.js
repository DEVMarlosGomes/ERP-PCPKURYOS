"use strict";

// Execute com:
// firebase emulators:exec --project demo-identidade --only database
//   --config firebase.retrabalhos-test.json "node run_identity_access_rules_test.js"
const assert = require("node:assert/strict");
const path = require("node:path");
const {createRequire} = require("node:module");
const requireFunctions = createRequire(path.resolve(__dirname, "functions/package.json"));
const {initializeApp, getApps, deleteApp} = requireFunctions("firebase-admin/app");
const {getDatabase} = requireFunctions("firebase-admin/database");
const PERMISSION_DENIED = /PERMISSION_DENIED|permission_denied|Permission denied/i;

if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== "127.0.0.1:9023") {
  throw new Error("Teste exige o emulador RTDB em 127.0.0.1:9023.");
}

const databaseURL = "http://127.0.0.1:9023?ns=demo-identidade-default-rtdb";
const make = (name, uid) => {
  const options = {projectId: "demo-identidade", databaseURL};
  if (uid) options.databaseAuthVariableOverride = {uid};
  return getDatabase(initializeApp(options, name));
};

const root = make("identity-root", null);
const adm = make("identity-adm", "adm");
const rh = make("identity-rh", "rh");
const alice = make("identity-alice", "alice");
const newbie = make("identity-newbie", "newbie");

(async () => {
  await root.ref().set({
    usuarios: {
      adm: {nome: "Admin", email: "adm@kuryos.com.br", role: "admin"},
      rh: {nome: "RH", email: "rh@kuryos.com.br", role: "rh"},
      alice: {nome: "Alice", email: "alice@kuryos.com.br", role: "production"},
      bob: {nome: "Bob", email: "bob@kuryos.com.br", role: "pcp"},
    },
    usuarios_publico: {
      alice: {nome: "Alice", role: "production"},
      bob: {nome: "Bob", role: "pcp"},
    },
    usuarios_removidos: {old: {a: {status: "CONCLUIDO"}}},
    auditoria_acessos: {a: {acao: "CRIAR_USUARIO"}},
  });

  assert.equal((await alice.ref("usuarios/alice").get()).val().email, "alice@kuryos.com.br");
  await assert.rejects(alice.ref("usuarios/bob").get(), PERMISSION_DENIED);
  assert.equal((await adm.ref("usuarios/bob").get()).val().role, "pcp");
  assert.equal((await rh.ref("usuarios/bob").get()).val().role, "pcp");

  await assert.rejects(alice.ref("usuarios/alice/nome").set("Outro"), PERMISSION_DENIED);
  await assert.rejects(adm.ref("usuarios/bob/role").set("admin"), PERMISSION_DENIED);

  await newbie.ref("usuarios/newbie").set({nome: "Novo", email: "novo@kuryos.com.br", role: "pending"});
  await assert.rejects(root.ref("usuarios/newbie").remove().then(() => newbie.ref("usuarios/newbie").set({nome: "Novo", email: "novo@kuryos.com.br", role: "admin"})), PERMISSION_DENIED);

  await alice.ref("usuarios_publico/alice").set({nome: "Alice A.", role: "production"});
  await assert.rejects(alice.ref("usuarios_publico/alice").set({nome: "Alice", role: "admin"}), PERMISSION_DENIED);
  await assert.rejects(adm.ref("usuarios_publico/bob").set({nome: "B", role: "pcp"}), PERMISSION_DENIED);

  assert.ok((await adm.ref("auditoria_acessos").get()).exists());
  assert.ok((await adm.ref("usuarios_removidos").get()).exists());
  await assert.rejects(alice.ref("auditoria_acessos").get(), PERMISSION_DENIED);
  await assert.rejects(adm.ref("auditoria_acessos/x").set({acao: "FALSA"}), PERMISSION_DENIED);
  await assert.rejects(adm.ref('identidade_locks/falso').set({owner:'browser'}),PERMISSION_DENIED);
  await assert.rejects(alice.ref('identidade_locks').get(),PERMISSION_DENIED);

  console.log("run_identity_access_rules_test: OK");
  await Promise.all(getApps().map(deleteApp));
})().catch(async (error) => {
  console.error(error);
  await Promise.all(getApps().map(deleteApp));
  process.exitCode = 1;
});
