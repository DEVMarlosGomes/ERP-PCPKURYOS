"use strict";

const crypto = require("node:crypto");

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "AIzaSyBvASzcbKyv3uW7NBzDFDyLsKls3An3UUs";

function falha(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function normalizarUsuario(value) {
  const usuario = String(value == null ? "" : value).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(usuario)) {
    throw falha("invalid-argument", "O usuário deve ter de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.");
  }
  return usuario;
}

function chaveUsuario(usuario) {
  return crypto.createHash("sha256").update(normalizarUsuario(usuario)).digest("hex");
}

function sugerirUsuario(email, usados = new Set()) {
  const local = String(email || "").trim().toLowerCase().split("@")[0]
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, ".").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .slice(0, 32);
  let base = local.length >= 3 ? local : `user.${local || "erp"}`;
  base = base.slice(0, 32);
  let candidate = base;
  let suffix = 2;
  while (usados.has(candidate)) {
    const tail = `-${suffix++}`;
    candidate = base.slice(0, 32 - tail.length) + tail;
  }
  return normalizarUsuario(candidate);
}

async function reservarUsuario(db, usuario, uid) {
  const normalizado = normalizarUsuario(usuario);
  const ref = db.ref(`login_usuarios/${chaveUsuario(normalizado)}`);
  const result = await ref.transaction((current) => {
    if (current && current.uid !== uid) return;
    return {uid, usuario: normalizado};
  });
  if (!result.committed) throw falha("already-exists", "Este nome de usuário já está em uso.");
  return normalizado;
}

async function liberarUsuario(db, usuario, uid) {
  if (!usuario) return;
  const ref = db.ref(`login_usuarios/${chaveUsuario(usuario)}`);
  await ref.transaction((current) => current && current.uid === uid ? null : undefined);
}

function criarServicoLogin({db, auth, now = () => new Date(), fetchImpl = globalThis.fetch, apiKey = FIREBASE_WEB_API_KEY}) {
  if (!db || !auth || typeof fetchImpl !== "function") throw new Error("db, auth e fetch são obrigatórios");

  async function autenticar(data) {
    const identificador = String(data && data.identificador || "").trim();
    const senha = data && data.senha;
    if (!identificador || typeof senha !== "string" || senha.length < 1 || senha.length > 128) {
      throw falha("invalid-argument", "Informe usuário ou e-mail e senha.");
    }

    let account;
    let metodo;
    try {
      if (identificador.includes("@")) {
        metodo = "email";
        account = await auth.getUserByEmail(identificador.toLowerCase());
      } else {
        metodo = "usuario";
        const usuario = normalizarUsuario(identificador);
        const entry = (await db.ref(`login_usuarios/${chaveUsuario(usuario)}`).get()).val();
        if (!entry || entry.usuario !== usuario || !entry.uid) throw falha("unauthenticated", "Credenciais inválidas.");
        account = await auth.getUser(entry.uid);
      }
    } catch (error) {
      if (error && error.code === "invalid-argument") throw error;
      throw falha("unauthenticated", "Credenciais inválidas.");
    }

    const profile = (await db.ref(`usuarios/${account.uid}`).get()).val();
    if (!profile || profile.desativado === true || profile.role === "pending" || account.disabled === true || !account.email ||
        String(profile.email || "").toLowerCase() !== String(account.email).toLowerCase()) {
      throw falha("unauthenticated", "Credenciais inválidas.");
    }

    let response;
    try {
      response = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email: account.email, password: senha, returnSecureToken: true}),
      });
    } catch (_) {
      throw falha("unavailable", "Não foi possível validar o acesso. Tente novamente.");
    }
    let signed = {};
    try { signed = await response.json(); } catch (_) {}
    if (!response.ok || signed.localId !== account.uid) throw falha("unauthenticated", "Credenciais inválidas.");

    const em = now().toISOString();
    await db.ref(`usuarios/${account.uid}`).update({ultimo_login_em: em, ultimo_login_metodo: metodo});
    const token = await auth.createCustomToken(account.uid);
    return {ok: true, token, exigirTrocaSenha: profile.exigir_troca_senha === true};
  }

  async function minhaConta(request) {
    if (!request || !request.auth || !request.auth.uid) throw falha("unauthenticated", "Faça login.");
    const uid = request.auth.uid;
    const profileRef = db.ref(`usuarios/${uid}`);
    const profile = (await profileRef.get()).val();
    if (!profile || profile.desativado === true || profile.role === "pending") throw falha("permission-denied", "Conta inativa.");
    const action = String(request.data && request.data.acao || "");
    const authTime = Number(request.auth.token && request.auth.token.auth_time);
    const age = now().getTime() / 1000 - authTime;
    if (!Number.isFinite(authTime) || age < -120 || age > 900) {
      throw falha("failed-precondition", "Confirme sua senha atual novamente.", {requiresRecentLogin: true});
    }
    const actor = {uid, nome: profile.nome || null};
    const auditRef = db.ref("auditoria_acessos").push();

    if (action === "registrar_troca_senha") {
      const em = now().toISOString();
      await profileRef.update({senha_definida_em: em, senha_definida_por: uid, exigir_troca_senha: null});
      await auditRef.set({acao: "ALTERAR_PROPRIA_SENHA", alvo_uid: uid, por_uid: uid, por_nome: actor.nome, em, em_ms: now().getTime()});
      return {ok: true};
    }
    if (action === "encerrar_sessoes") {
      const epoch = Math.floor(now().getTime() / 1000);
      await db.ref(`security_sessions/${uid}`).set({revokedAfter: epoch});
      await auth.revokeRefreshTokens(uid);
      await auditRef.set({acao: "ENCERRAR_PROPRIAS_SESSOES", alvo_uid: uid, por_uid: uid, por_nome: actor.nome, em: now().toISOString(), em_ms: now().getTime()});
      return {ok: true};
    }
    throw falha("invalid-argument", "Ação de conta desconhecida.");
  }

  return {autenticar, minhaConta};
}

module.exports = {
  normalizarUsuario,
  chaveUsuario,
  sugerirUsuario,
  reservarUsuario,
  liberarUsuario,
  criarServicoLogin,
};

