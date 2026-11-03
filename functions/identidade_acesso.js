"use strict";

const crypto = require("node:crypto");

const FUNCOES_VALIDAS = [
  "admin", "pcp", "comercial", "pd", "qualidade", "logistica",
  "production", "rotulagem", "rh", "gestor", "tv",
];

const MODULOS_VALIDOS = new Set([
  "analytics", "apontamento", "manipulacao", "rotulagem", "conferencia_pesagem",
  "planejamento", "emitir_op", "comercial", "pd", "pedidos", "cadastros",
  "compras", "logistica", "qualidade", "config", "usuarios", "rh",
  "rh_dashboard", "custos", "placar", "financeiro", "controladoria",
  "manutencao", "auditoria5s", "feedback", "rh_feedback", "rh_temporarios",
  "backlog", "painel", "titularidade", "auditoria",
]);

const CODIGOS_AUTH_SEM_USUARIO = new Set(["auth/user-not-found", "user-not-found"]);

function falha(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function texto(value, campo, max) {
  const result = String(value == null ? "" : value).trim().replace(/\s+/g, " ");
  if (!result) throw falha("invalid-argument", `Informe ${campo}.`);
  if (result.length > max) throw falha("invalid-argument", `${campo} deve ter no máximo ${max} caracteres.`);
  return result;
}

function emailValido(value) {
  const email = texto(value, "o e-mail", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw falha("invalid-argument", "Informe um e-mail válido.");
  return email;
}

function tenantValido(value) {
  const tenant = String(value == null ? "" : value).trim().toLowerCase();
  if (!tenant) return null;
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(tenant)) {
    throw falha("invalid-argument", "Tenant inválido. Use letras minúsculas, números, hífen ou sublinhado.");
  }
  return tenant;
}

function funcoesValidas(value, obrigatorias = false) {
  const source = Array.isArray(value) ? value : Object.keys(value && typeof value === "object" ? value : {}).filter((key) => value[key] === true);
  const unique = [...new Set(source.map((item) => String(item)))];
  const invalidas = unique.filter((item) => !FUNCOES_VALIDAS.includes(item));
  if (invalidas.length) throw falha("invalid-argument", `Função desconhecida: ${invalidas[0]}.`);
  unique.sort((a, b) => FUNCOES_VALIDAS.indexOf(a) - FUNCOES_VALIDAS.indexOf(b));
  if (obrigatorias && !unique.length) throw falha("invalid-argument", "Marque pelo menos uma função.");
  return unique;
}

function mapaFuncoes(funcoes) {
  if (!funcoes.length) return null;
  return Object.fromEntries(funcoes.map((funcao) => [funcao, true]));
}

function modulosValidos(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw falha("invalid-argument", "Módulos inválidos.");
  const result = {};
  for (const [key, enabled] of Object.entries(value)) {
    if (!MODULOS_VALIDOS.has(key)) throw falha("invalid-argument", `Módulo desconhecido: ${key}.`);
    if (enabled !== true && enabled !== false) throw falha("invalid-argument", `Valor inválido para o módulo ${key}.`);
    result[key] = enabled;
  }
  return result;
}

function perfilDeAcesso(data, anterior = {}, obrigatorias = true) {
  const funcoes = funcoesValidas(data.funcoes, obrigatorias);
  if (!funcoes.length) {
    return {role: "pending", funcoes: null, modulos: null, modulosDasFuncoes: null, tenant_id: null};
  }
  const role = funcoes[0];
  const perfil = {
    role,
    funcoes: mapaFuncoes(funcoes),
    modulos: data.modulosDasFuncoes === true || data.modulos != null ? modulosValidos(data.modulos) : null,
    modulosDasFuncoes: data.modulosDasFuncoes === true ? true : null,
  };
  const tenant = tenantValido(data.tenant_id !== undefined ? data.tenant_id : anterior.tenant_id);
  perfil.tenant_id = tenant;
  return perfil;
}

function ehAdminAtivo(profile) {
  return !!profile && profile.desativado !== true && (profile.role === "admin" || (profile.funcoes && profile.funcoes.admin === true));
}

function garantirAdmin(profile) {
  if (!ehAdminAtivo(profile)) throw falha("permission-denied", "Apenas administradores podem gerenciar identidades e acessos.");
}

function garantirOutroUsuario(actorUid, targetUid, action) {
  if (actorUid === targetUid) throw falha("failed-precondition", `Você não pode ${action} a própria conta.`);
}

function garantirAdminRestante(users, targetUid, nextProfile) {
  const copy = {...users, [targetUid]: nextProfile};
  if (nextProfile == null) delete copy[targetUid];
  if (!Object.values(copy).some(ehAdminAtivo)) {
    throw falha("failed-precondition", "A operação deixaria o ERP sem nenhum administrador ativo.");
  }
}

function resumoPerfil(profile) {
  if (!profile) return null;
  return {
    nome: profile.nome || null,
    email: profile.email || null,
    role: profile.role || null,
    funcoes: profile.funcoes || null,
    modulos: profile.modulos || null,
    modulosDasFuncoes: profile.modulosDasFuncoes === true,
    tenant_id: profile.tenant_id || null,
    desativado: profile.desativado === true,
  };
}

async function lerUsuarios(db) {
  return (await db.ref("usuarios").once("value")).val() || {};
}

// Funções, desativação e exclusão podem retirar um administrador. A decisão
// precisa acontecer dentro da mesma transação que altera `usuarios`: duas
// requisições concorrentes, cada uma baseada numa leitura antiga, não podem
// desativar uma à outra e deixar o ERP sem administrador.
async function alterarUsuariosAtomicamente(db, actorUid, targetUid, transformar) {
  let motivo = null;
  let before = null;
  let after = null;
  const result = await db.ref("usuarios").transaction((current) => {
    motivo = null;
    before = null;
    after = null;
    // O SDK pode chamar primeiro com cache local null; devolver o próprio null
    // permite a nova rodada com o valor do servidor (não abortar com undefined).
    if (!current) return current;
    if (typeof current !== "object") {
      motivo = falha("permission-denied", "Não foi possível confirmar o administrador ativo.");
      return;
    }
    try {
      garantirAdmin(current[actorUid]);
      const atual = current[targetUid];
      if (!atual) throw falha("not-found", "Usuário não encontrado.");
      const proximo = transformar(atual, current);
      garantirAdminRestante(current, targetUid, proximo);
      const atualizado = {...current};
      if (proximo == null) delete atualizado[targetUid];
      else atualizado[targetUid] = proximo;
      before = atual;
      after = proximo;
      return atualizado;
    } catch (error) {
      motivo = error;
      return;
    }
  });
  if (!result || result.committed !== true) {
    throw motivo || falha("failed-precondition", "O cadastro mudou durante a operação. Atualize a lista e tente novamente.");
  }
  return {before, after};
}

async function restaurarPerfilSeAtual(db, targetUid, expectedVersion, before) {
  let restaurado = false;
  await db.ref(`usuarios/${targetUid}`).transaction((current) => {
    if (!current) return current;
    if (current.identidade_versao !== expectedVersion) return;
    restaurado = true;
    return before;
  });
  return restaurado;
}

function codigoAuth(error) {
  return String(error && error.code || "").replace(/^auth\//, "auth/");
}

function criarServicoIdentidade({db, auth, now = () => new Date(), uuid = () => crypto.randomUUID()}) {
  if (!db || !auth) throw new Error("db e auth são obrigatórios");

  async function revogar(uid) {
    // Publicado antes de invalidar refresh tokens: regras RTDB recusam o ID token antigo.
    await db.ref(`security_sessions/${uid}`).set({revokedAfter: Math.floor(now().getTime() / 1000)});
    await auth.revokeRefreshTokens(uid);
  }

  async function auditar(actor, action, targetUid, before, after, extra = {}) {
    const key = db.ref("auditoria_acessos").push().key;
    const date = now();
    await db.ref(`auditoria_acessos/${key}`).set({
      acao: action,
      alvo_uid: targetUid,
      por_uid: actor.uid,
      por_nome: actor.nome || actor.email || actor.uid,
      em: date.toISOString(),
      em_ms: date.getTime(),
      antes: resumoPerfil(before),
      depois: resumoPerfil(after),
      ...extra,
    });
  }

  async function contexto(request) {
    if (!request || !request.auth || !request.auth.uid) throw falha("unauthenticated", "Faça login para gerenciar usuários.");
    const users = await lerUsuarios(db);
    const actorProfile = users[request.auth.uid];
    garantirAdmin(actorProfile);
    const authTime = Number(request.auth.token && request.auth.token.auth_time);
    const age = now().getTime() / 1000 - authTime;
    if (!Number.isFinite(authTime) || age < -120 || age > 900) {
      throw falha("failed-precondition", "Entre novamente para confirmar sua identidade antes de administrar contas.", {requiresRecentLogin:true});
    }
    return {
      users,
      actor: {uid: request.auth.uid, nome: actorProfile.nome, email: request.auth.token && request.auth.token.email},
      data: request.data || {},
    };
  }

  async function executar(request) {
    const {users, actor, data} = await contexto(request);
    const acao = String(data.acao || "");
    const targetUid = String(data.uid || "");

    if (acao === "criar") {
      const nome = texto(data.nome, "o nome", 120);
      const email = emailValido(data.email);
      const acesso = perfilDeAcesso(data);
      const date = now().toISOString();
      let created;
      let profilePersisted = false;
      try {
        created = await auth.createUser({email, displayName: nome, disabled: false, emailVerified: false});
        const profile = {
          nome, email, ...acesso,
          created_at: date,
          criado_por: actor.uid,
          criado_por_nome: actor.nome || null,
          identidade_versao: uuid(),
        };
        await db.ref().update({
          [`usuarios/${created.uid}`]: profile,
          [`usuarios_publico/${created.uid}`]: {nome, role: profile.role},
        });
        profilePersisted = true;
        await auditar(actor, "CRIAR_USUARIO", created.uid, null, profile);
        return {ok: true, uid: created.uid, email, enviarRedefinicao: true};
      } catch (error) {
        if (profilePersisted && created && created.uid) {
          await db.ref().update({
            [`usuarios/${created.uid}`]: null,
            [`usuarios_publico/${created.uid}`]: null,
          }).catch(() => {});
        }
        if (created && created.uid) await auth.deleteUser(created.uid).catch(() => {});
        throw error;
      }
    }

    if (!targetUid) throw falha("invalid-argument", "Usuário não informado.");
    const before = users[targetUid];
    if (!before) throw falha("not-found", "Usuário não encontrado.");

    if (acao === "atualizar") {
      const nome = texto(data.nome, "o nome", 120);
      const email = emailValido(data.email);
      const tenant = tenantValido(data.tenant_id);
      let authBefore;
      try { authBefore = await auth.getUser(targetUid); } catch (error) {
        if (!CODIGOS_AUTH_SEM_USUARIO.has(codigoAuth(error))) throw error;
        throw falha("failed-precondition", "O perfil existe no banco, mas a conta de login não existe.");
      }
      await auth.updateUser(targetUid, {displayName: nome, email, emailVerified: authBefore.email === email ? authBefore.emailVerified : false});
      const after = {...before, nome, email, tenant_id: tenant, atualizado_em: now().toISOString(), atualizado_por: actor.uid, identidade_versao: uuid()};
      try {
        await db.ref().update({
          [`usuarios/${targetUid}`]: after,
          [`usuarios_publico/${targetUid}`]: {nome, role: after.role},
        });
      } catch (error) {
        await auth.updateUser(targetUid, {displayName: authBefore.displayName || undefined, email: authBefore.email, emailVerified: authBefore.emailVerified}).catch(() => {});
        throw error;
      }
      if (before.email !== email || before.tenant_id !== tenant) await revogar(targetUid);
      await auditar(actor, "ATUALIZAR_USUARIO", targetUid, before, after, {email_alterado: before.email !== email});
      return {ok: true, email};
    }

    if (acao === "funcoes") {
      garantirOutroUsuario(actor.uid, targetUid, "alterar os acessos de");
      const version = uuid();
      const alteracao = await alterarUsuariosAtomicamente(db, actor.uid, targetUid, (atual) => {
        const acesso = perfilDeAcesso(data, atual, atual.desativado === true);
        return {...atual, ...acesso, desativado: null, desativado_em: null, desativado_por: null, funcoes_antes_desativar: null,
          reativado_em: atual.desativado ? now().toISOString() : atual.reativado_em || null,
          atualizado_em: now().toISOString(), atualizado_por: actor.uid, identidade_versao: version};
      });
      const beforeAtomic = alteracao.before;
      const after = alteracao.after;
      try {
        if (beforeAtomic.desativado) await auth.updateUser(targetUid, {disabled: false});
        await db.ref(`usuarios_publico/${targetUid}`).set({nome: after.nome || after.email || targetUid, role: after.role});
        await revogar(targetUid);
      } catch (error) {
        const restaurado = await restaurarPerfilSeAtual(db, targetUid, version, beforeAtomic).catch(() => false);
        if (restaurado) {
          await db.ref(`usuarios_publico/${targetUid}`).set({nome: beforeAtomic.nome || beforeAtomic.email || targetUid, role: beforeAtomic.role || "pending"}).catch(() => {});
          if (beforeAtomic.desativado) await auth.updateUser(targetUid, {disabled: true}).catch(() => {});
        }
        throw error;
      }
      await auditar(actor, beforeAtomic.desativado ? "REATIVAR_USUARIO" : "ALTERAR_FUNCOES", targetUid, beforeAtomic, after);
      return {ok: true};
    }

    if (acao === "modulos") {
      garantirOutroUsuario(actor.uid, targetUid, "alterar os módulos de");
      if (before.desativado === true || before.role === "pending") {
        throw falha("failed-precondition", "Defina uma função ativa antes de alterar os módulos.");
      }
      const after = {...before, modulos: data.padrao === true ? null : modulosValidos(data.modulos), modulosDasFuncoes: data.modulosDasFuncoes === true ? true : null,
        atualizado_em: now().toISOString(), atualizado_por: actor.uid, identidade_versao: uuid()};
      await db.ref(`usuarios/${targetUid}`).set(after);
      await revogar(targetUid);
      await auditar(actor, "ALTERAR_MODULOS", targetUid, before, after);
      return {ok: true};
    }

    if (acao === "desativar") {
      garantirOutroUsuario(actor.uid, targetUid, "desativar");
      const version = uuid();
      const alteracao = await alterarUsuariosAtomicamente(db, actor.uid, targetUid, (atual) => {
        if (atual.desativado === true) throw falha("failed-precondition", "O usuário já está desativado.");
        const funcoesAnteriores = atual.funcoes
          ? funcoesValidas(atual.funcoes)
          : (FUNCOES_VALIDAS.includes(atual.role) ? [atual.role] : []);
        return {...atual, role: "pending", funcoes: null, modulos: null, modulosDasFuncoes: null, tenant_id: null,
          desativado: true, desativado_em: now().toISOString(), desativado_por: actor.uid,
          funcoes_antes_desativar: mapaFuncoes(funcoesAnteriores), identidade_versao: version};
      });
      const beforeAtomic = alteracao.before;
      const after = alteracao.after;
      try {
        await auth.updateUser(targetUid, {disabled: true});
        await revogar(targetUid);
        await db.ref(`usuarios_publico/${targetUid}`).set({nome: after.nome || after.email || targetUid, role: "pending"});
      } catch (error) {
        const restaurado = await restaurarPerfilSeAtual(db, targetUid, version, beforeAtomic).catch(() => false);
        if (restaurado) {
          await db.ref(`usuarios_publico/${targetUid}`).set({nome: beforeAtomic.nome || beforeAtomic.email || targetUid, role: beforeAtomic.role || "pending"}).catch(() => {});
          await auth.updateUser(targetUid, {disabled: beforeAtomic.desativado === true}).catch(() => {});
        }
        throw error;
      }
      await auditar(actor, "DESATIVAR_USUARIO", targetUid, beforeAtomic, after);
      return {ok: true};
    }

    if (acao === "revogar_sessoes") {
      garantirOutroUsuario(actor.uid, targetUid, "encerrar as sessões de");
      await revogar(targetUid);
      await auditar(actor, "REVOGAR_SESSOES", targetUid, before, before);
      return {ok: true};
    }

    if (acao === "solicitar_reset") {
      const account = await auth.getUser(targetUid);
      if (!account.email) throw falha("failed-precondition", "A conta não tem e-mail para recuperação.");
      await auditar(actor, "SOLICITAR_REDEFINICAO_SENHA", targetUid, before, before);
      return {ok: true, email: account.email};
    }

    if (acao === "excluir") {
      garantirOutroUsuario(actor.uid, targetUid, "excluir");
      const confirmacao = emailValido(data.confirmacao_email);
      if (confirmacao !== String(before.email || "").toLowerCase()) throw falha("failed-precondition", "A confirmação não corresponde ao e-mail do usuário.");
      const archiveId = uuid();
      const prepared = {perfil: before, status: "PREPARADO", preparado_em: now().toISOString(), preparado_por: actor.uid};
      await db.ref(`usuarios_removidos/${targetUid}/${archiveId}`).set(prepared);
      let alteracao;
      try {
        alteracao = await alterarUsuariosAtomicamente(db, actor.uid, targetUid, (atual) => {
          if (confirmacao !== String(atual.email || "").toLowerCase()) {
            throw falha("failed-precondition", "O e-mail mudou durante a confirmação. Atualize a lista e tente novamente.");
          }
          return null;
        });
      } catch (error) {
        await db.ref(`usuarios_removidos/${targetUid}/${archiveId}`).update({
          status: "CANCELADO", cancelado_em: now().toISOString(), motivo: error.code || "erro",
        }).catch(() => {});
        throw error;
      }
      const beforeAtomic = alteracao.before;
      try {
        await db.ref(`usuarios_publico/${targetUid}`).remove();
        await auth.deleteUser(targetUid);
      } catch (error) {
        if (!CODIGOS_AUTH_SEM_USUARIO.has(codigoAuth(error))) {
          await db.ref().update({
            [`usuarios/${targetUid}`]: beforeAtomic,
            [`usuarios_publico/${targetUid}`]: {nome: beforeAtomic.nome || beforeAtomic.email || targetUid, role: beforeAtomic.role || "pending"},
          }).catch(() => {});
          await db.ref(`usuarios_removidos/${targetUid}/${archiveId}`).update({
            status: "REVERTIDO", revertido_em: now().toISOString(), motivo: error.code || "erro",
          }).catch(() => {});
          throw error;
        }
      }
      await db.ref(`usuarios_removidos/${targetUid}/${archiveId}`).update({status: "CONCLUIDO", concluido_em: now().toISOString()});
      await auditar(actor, "EXCLUIR_USUARIO", targetUid, beforeAtomic, null, {arquivo: archiveId});
      return {ok: true};
    }

    throw falha("invalid-argument", "Ação de identidade desconhecida.");
  }

  return {executar};
}

module.exports = {
  FUNCOES_VALIDAS,
  MODULOS_VALIDOS,
  emailValido,
  tenantValido,
  funcoesValidas,
  modulosValidos,
  perfilDeAcesso,
  ehAdminAtivo,
  garantirAdminRestante,
  alterarUsuariosAtomicamente,
  criarServicoIdentidade,
};
