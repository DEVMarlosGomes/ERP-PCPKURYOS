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

  async function executarInterno(request) {
    const {users, actor, data} = await contexto(request);
    const acao = String(data.acao || "");
    const targetUid = String(data.uid || "");

    if (acao === "criar") {
      const nome = texto(data.nome, "o nome", 120);
      const email = emailValido(data.email);
      if (Object.values(users).some(u => String(u.email || '').trim().toLowerCase() === email)) {
        throw falha('already-exists', 'Este e-mail já tem perfil. Use Editar e verificar vínculo de login; não crie um segundo usuário.');
      }
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

    async function contaExistente() {
      try { return await auth.getUser(targetUid); } catch (error) {
        if (!CODIGOS_AUTH_SEM_USUARIO.has(codigoAuth(error))) throw error;
        throw falha('failed-precondition', 'O perfil existe, mas não há login neste UID. Use Verificar vínculo de login e regularize a conta.', {semLogin:true});
      }
    }

    if (acao === 'diagnosticar') {
      let account;
      try { account = await auth.getUser(targetUid); } catch (error) {
        if (!CODIGOS_AUTH_SEM_USUARIO.has(codigoAuth(error))) throw error;
      }
      if (account) return {ok:true, vinculo: String(account.email || '').toLowerCase() === String(before.email || '').toLowerCase() ? 'OK' : 'EMAIL_DIVERGENTE', desativadoAuth:account.disabled === true};
      let porEmail;
      try { porEmail = await auth.getUserByEmail(emailValido(before.email)); } catch (error) {
        if (!CODIGOS_AUTH_SEM_USUARIO.has(codigoAuth(error))) throw error;
      }
      return {ok:true, vinculo:porEmail ? 'CONFLITO_EMAIL' : 'SEM_LOGIN'};
    }

    if (acao === 'regularizar_login') {
      garantirOutroUsuario(actor.uid, targetUid, 'regularizar');
      const email = emailValido(before.email);
      if (emailValido(data.confirmacao_email) !== email) throw falha('failed-precondition','Confirme o e-mail do perfil para regularizar o login.');
      if (Object.entries(users).some(([uid,u]) => uid !== targetUid && String(u.email || '').trim().toLowerCase() === email)) {
        throw falha('failed-precondition','Há outro perfil com este e-mail. Resolva o conflito de identidade antes de regularizar.');
      }
      try {
        await auth.getUser(targetUid);
        throw falha('already-exists','Este UID já tem login. Atualize a conferência do vínculo.');
      } catch (error) { if (!CODIGOS_AUTH_SEM_USUARIO.has(codigoAuth(error))) throw error; }
      try {
        await auth.getUserByEmail(email);
        throw falha('already-exists','O e-mail está vinculado a outro UID. Não será feita fusão automática.');
      } catch (error) { if (!CODIGOS_AUTH_SEM_USUARIO.has(codigoAuth(error))) throw error; }
      // Primeiro nasce bloqueada: falha de persistência nunca libera login
      // sem registro. O UID e os acessos históricos não são substituídos.
      await auth.createUser({uid:targetUid,email,displayName:texto(before.nome || email,'o nome',120),disabled:true,emailVerified:false});
      try {
        await db.ref(`usuarios/${targetUid}`).update({login_regularizado_em:now().toISOString(),login_regularizado_por:actor.uid});
        await auditar(actor,'REGULARIZAR_LOGIN',targetUid,before,before);
        await auth.updateUser(targetUid,{disabled:before.desativado === true});
      } catch (error) {
        await auth.deleteUser(targetUid).catch(() => {});
        throw error;
      }
      return {ok:true,uid:targetUid,email,enviarRedefinicao:true};
    }

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
      try {
        if (before.email !== email || before.tenant_id !== tenant) await revogar(targetUid);
        await auditar(actor, "ATUALIZAR_USUARIO", targetUid, before, after, {email_alterado: before.email !== email});
      } catch (error) {
        const restored = await restaurarPerfilSeAtual(db,targetUid,after.identidade_versao,before).catch(() => false);
        if (restored) {
          await auth.updateUser(targetUid,{displayName:authBefore.displayName || undefined,email:authBefore.email,emailVerified:authBefore.emailVerified}).catch(() => {});
          await db.ref(`usuarios_publico/${targetUid}`).set({nome:before.nome || before.email || targetUid,role:before.role || 'pending'}).catch(() => {});
        }
        throw error;
      }
      return {ok: true, email};
    }

    if (acao === "funcoes") {
      garantirOutroUsuario(actor.uid, targetUid, "alterar os acessos de");
      await contaExistente();
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
      await contaExistente();
      const version = uuid();
      const after = {...before, modulos: data.padrao === true ? null : modulosValidos(data.modulos), modulosDasFuncoes: data.modulosDasFuncoes === true ? true : null,
        atualizado_em: now().toISOString(), atualizado_por: actor.uid, identidade_versao: version};
      await db.ref(`usuarios/${targetUid}`).set(after);
      try { await revogar(targetUid); } catch (error) {
        await restaurarPerfilSeAtual(db,targetUid,version,before).catch(() => false);
        throw error;
      }
      await auditar(actor, "ALTERAR_MODULOS", targetUid, before, after);
      return {ok: true};
    }

    if (acao === "desativar") {
      garantirOutroUsuario(actor.uid, targetUid, "desativar");
      await contaExistente();
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
      await contaExistente();
      await revogar(targetUid);
      await auditar(actor, "REVOGAR_SESSOES", targetUid, before, before);
      return {ok: true};
    }

    if (acao === "solicitar_reset") {
      const account = await contaExistente();
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

  // Journal durável antes de qualquer efeito e trava por identidade. Não há
  // transação distribuída entre Auth e RTDB: resultado parcial é explícito,
  // rastreável e não é repetido silenciosamente com o mesmo requestId.
  async function executar(request) {
    const {actor,data} = await contexto(request);
    if (data.acao === 'diagnosticar') return executarInterno(request);
    const requestId = data.requestId;
    if (requestId !== undefined && !/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) throw falha('invalid-argument','Identificador de operação inválido.');
    const operationId = requestId ? crypto.createHash('sha256').update(actor.uid + ':' + requestId).digest('hex') : crypto.randomUUID();
    const journal = db.ref(`auditoria_acessos/op_${operationId}`);
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({...data,requestId:undefined})).digest('hex');
    const claim = await journal.transaction(current => current || {status:'PREPARADO',fingerprint,por_uid:actor.uid,acao:data.acao || '',alvo_uid:data.uid || null,em:now().toISOString()});
    const previous = claim.snapshot.val();
    // Sem requestId não há reutilização. A marca durável impede repetir
    // operações concluídas e uma trava separada serializa a identidade.
    if (previous.fingerprint !== fingerprint) throw falha('failed-precondition','Este identificador já pertence a outra operação.');
    if (previous.status === 'CONCLUIDO') return previous.resultado;
    if (previous.status !== 'PREPARADO') throw falha('failed-precondition','Operação já recebida. Confira o resultado antes de repetir.',{operacaoId:operationId,resultadoParcial:true});
    const owner = crypto.randomUUID();
    const lockKey = crypto.createHash('sha256').update(data.uid || 'email:' + String(data.email || '').trim().toLowerCase()).digest('hex');
    const lock = db.ref(`identidade_locks/${lockKey}`);
    const acquired = await lock.transaction(current => current ? undefined : {owner,operationId,em:now().toISOString()});
    if (!acquired.committed) throw falha('resource-exhausted','Já existe uma operação para esta identidade. Aguarde ou solicite conferência administrativa.');
    try {
      const running = await journal.transaction(current => {
        if (!current) return current; // cache frio: deixar consultar o servidor
        return current.status === 'PREPARADO' ? {...current,status:'EM_ANDAMENTO',owner} : undefined;
      });
      if (!running.committed || running.snapshot.val()?.owner !== owner) throw falha('failed-precondition','Operação já iniciada. Confira o resultado antes de repetir.');
      const result = await executarInterno(request);
      await journal.update({status:'CONCLUIDO',resultado:result,concluido_em:now().toISOString()});
      return result;
    } catch (error) {
      await journal.update({status:'REQUER_CONFERENCIA',codigo:String(error.code || 'internal'),falhou_em:now().toISOString()}).catch(() => {});
      // Mesmo com erro, pode ter ocorrido revogação ou efeito em outro serviço.
      error.details = {...error.details,operacaoId:operationId,resultadoParcial:true};
      throw error;
    } finally {
      await lock.transaction(current => {
        if (!current) return current; // cache frio não pode abortar a liberação
        return current.owner === owner ? null : undefined;
      }).catch(() => {});
    }
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
