"use strict";

const assert = require("node:assert/strict");
const {
  emailValido,
  tenantValido,
  modulosValidos,
  garantirAdminRestante,
  alterarUsuariosAtomicamente,
  criarServicoIdentidade,
} = require("./functions/identidade_acesso");

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const firebaseValue = (value) => {
  if (Array.isArray(value)) return value.map(firebaseValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== null && child !== undefined)
    .map(([key, child]) => [key, firebaseValue(child)]));
};

function getAt(root, path) {
  return String(path || "").split("/").filter(Boolean).reduce((value, key) => value && value[key], root);
}

function setAt(root, path, value) {
  const parts = String(path || "").split("/").filter(Boolean);
  if (!parts.length) throw new Error("set na raiz não usado neste teste");
  let cursor = root;
  parts.slice(0, -1).forEach((key) => { cursor[key] ||= {}; cursor = cursor[key]; });
  const key = parts[parts.length - 1];
  if (value === null || value === undefined) delete cursor[key];
  else cursor[key] = firebaseValue(clone(value));
}

function fakeDb(seed) {
  const state = clone(seed);
  let sequence = 0;
  function ref(path = "") {
    return {
      once: async () => ({val: () => clone(getAt(state, path))}),
      set: async (value) => setAt(state, path, value),
      remove: async () => setAt(state, path, null),
      update: async (updates) => {
        for (const [key, value] of Object.entries(updates)) {
          const full = [path, key].filter(Boolean).join("/");
          setAt(state, full, value);
        }
      },
      transaction: async (updater) => {
        const current = clone(getAt(state, path));
        const next = updater(current);
        if (next === undefined) return {committed: false, snapshot: {val: () => current}};
        setAt(state, path, next);
        return {committed: true, snapshot: {val: () => clone(next)}};
      },
      push: () => ({key: `p${++sequence}`}),
    };
  }
  return {state, ref};
}

function fakeAuth(seed) {
  const users = clone(seed);
  const calls = [];
  let sequence = 0;
  return {
    users,
    calls,
    createUser: async (data) => {
      calls.push(["createUser", clone(data)]);
      assert.equal("password" in data, false, "administrador nunca define ou recebe senha");
      if (Object.values(users).some((user) => user.email === data.email)) throw Object.assign(new Error("e-mail existe"), {code: "auth/email-already-exists"});
      const uid = `u${++sequence}`;
      users[uid] = {uid, ...clone(data)};
      return clone(users[uid]);
    },
    getUser: async (uid) => {
      if (!users[uid]) throw Object.assign(new Error("não encontrado"), {code: "auth/user-not-found"});
      return clone(users[uid]);
    },
    updateUser: async (uid, data) => {
      calls.push(["updateUser", uid, clone(data)]);
      if (!users[uid]) throw Object.assign(new Error("não encontrado"), {code: "auth/user-not-found"});
      users[uid] = {...users[uid], ...clone(data)};
      return clone(users[uid]);
    },
    deleteUser: async (uid) => { calls.push(["deleteUser", uid]); delete users[uid]; },
    revokeRefreshTokens: async (uid) => { calls.push(["revokeRefreshTokens", uid]); },
  };
}

const fixed = new Date("2026-11-02T18:00:00.000Z");
let ids = 0;

(async () => {
  assert.equal(emailValido(" ADM@Kuryos.com.br "), "adm@kuryos.com.br");
  assert.equal(tenantValido(" KURYOS "), "kuryos");
  assert.throws(() => tenantValido("Kuryos Brasil"), /Tenant inválido/);
  assert.throws(() => modulosValidos({superadmin: true}), /Módulo desconhecido/);
  assert.throws(() => garantirAdminRestante({adm: {role: "admin"}}, "adm", {role: "pcp"}), /sem nenhum administrador/);

  const db = fakeDb({usuarios: {
    adm: {nome: "Admin", email: "adm@kuryos.com.br", role: "admin", funcoes: {admin: true}, tenant_id: "kuryos"},
    adm2: {nome: "Admin 2", email: "adm2@kuryos.com.br", role: "admin", funcoes: {admin: true}, tenant_id: "kuryos"},
    operador: {nome: "Operador", email: "op@kuryos.com.br", role: "production", funcoes: {production: true}, tenant_id: "kuryos"},
  }});
  const auth = fakeAuth({
    adm: {uid: "adm", email: "adm@kuryos.com.br", displayName: "Admin", disabled: false, emailVerified: true},
    adm2: {uid: "adm2", email: "adm2@kuryos.com.br", displayName: "Admin 2", disabled: false, emailVerified: true},
    operador: {uid: "operador", email: "op@kuryos.com.br", displayName: "Operador", disabled: false, emailVerified: true},
  });
  const service = criarServicoIdentidade({db, auth, now: () => fixed, uuid: () => `id-${++ids}`});
  const call = (uid, data) => service.executar({auth: {uid, token: {email: auth.users[uid] && auth.users[uid].email}}, data});

  await assert.rejects(call("operador", {acao: "criar"}), (error) => error.code === "permission-denied");

  const created = await call("adm", {
    acao: "criar", nome: "  Maria   da Silva ", email: "MARIA@KURYOS.COM.BR",
    funcoes: ["qualidade"], modulos: null, tenant_id: "kuryos",
  });
  assert.equal(created.ok, true);
  assert.equal(db.state.usuarios[created.uid].nome, "Maria da Silva");
  assert.equal(db.state.usuarios_publico[created.uid].role, "qualidade");
  assert.equal(auth.users[created.uid].email, "maria@kuryos.com.br");

  await call("adm", {acao: "atualizar", uid: created.uid, nome: "Maria Souza", email: "maria.souza@kuryos.com.br", tenant_id: "kuryos"});
  assert.equal(auth.users[created.uid].email, "maria.souza@kuryos.com.br");
  assert.equal(auth.users[created.uid].emailVerified, false);

  await assert.rejects(call("adm", {acao: "desativar", uid: "adm"}), (error) => error.code === "failed-precondition");
  await call("adm", {acao: "desativar", uid: created.uid});
  assert.equal(db.state.usuarios[created.uid].desativado, true);
  assert.equal(auth.users[created.uid].disabled, true);
  assert.ok(auth.calls.some((call) => call[0] === "revokeRefreshTokens" && call[1] === created.uid));

  await call("adm", {acao: "funcoes", uid: created.uid, funcoes: ["qualidade", "pd"], modulos: {qualidade: true, pd: true}, modulosDasFuncoes: true, tenant_id: "kuryos"});
  assert.notEqual(db.state.usuarios[created.uid].desativado, true);
  assert.equal(auth.users[created.uid].disabled, false);
  assert.equal(db.state.usuarios[created.uid].role, "pd");

  await call("adm", {acao: "revogar_sessoes", uid: created.uid});
  await call("adm", {acao: "solicitar_reset", uid: created.uid});

  // Revogar todas as funções mantém a conta como pendente, sem tenant/módulos.
  await call("adm", {acao: "funcoes", uid: "operador", funcoes: [], tenant_id: "kuryos"});
  assert.equal(db.state.usuarios.operador.role, "pending");
  assert.equal(db.state.usuarios.operador.tenant_id, undefined);
  await assert.rejects(
    call("adm", {acao: "modulos", uid: "operador", modulos: {cadastros: true}}),
    (error) => error.code === "failed-precondition"
  );

  await assert.rejects(call("adm", {acao: "excluir", uid: created.uid, confirmacao_email: "errado@kuryos.com.br"}), (error) => error.code === "failed-precondition");
  await call("adm", {acao: "excluir", uid: created.uid, confirmacao_email: "maria.souza@kuryos.com.br"});
  assert.equal(db.state.usuarios[created.uid], undefined);
  assert.equal(auth.users[created.uid], undefined);
  assert.equal(Object.values(db.state.usuarios_removidos[created.uid])[0].status, "CONCLUIDO");

  // Uma conta administrativa desativada perde o Auth e não conta como ADM ativo.
  await call("adm", {acao: "desativar", uid: "adm2"});
  assert.equal(auth.users.adm2.disabled, true);
  await assert.rejects(call("adm", {acao: "desativar", uid: "adm2"}), (error) => error.code === "failed-precondition");
  assert.equal(db.state.usuarios.adm2.funcoes_antes_desativar.admin, true);
  assert.ok(Object.keys(db.state.auditoria_acessos).length >= 8, "ações administrativas auditadas");

  // A guarda é transacional: depois que A retira o acesso de B, uma operação
  // concorrente/stale de B não consegue retirar o último administrador A.
  const guardDb = fakeDb({usuarios: {
    a: {role: "admin", funcoes: {admin: true}},
    b: {role: "admin", funcoes: {admin: true}},
  }});
  await alterarUsuariosAtomicamente(guardDb, "a", "b", (u) => ({...u, role: "pcp", funcoes: {pcp: true}}));
  await assert.rejects(
    alterarUsuariosAtomicamente(guardDb, "b", "a", (u) => ({...u, role: "pcp", funcoes: {pcp: true}})),
    (error) => error.code === "permission-denied"
  );
  assert.equal(guardDb.state.usuarios.a.role, "admin");

  console.log("run_identity_access_test: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
