'use strict';

const STATUS = ['NOVO', 'NA_FILA', 'EM_ANDAMENTO', 'VALIDAR', 'CONCLUIDO'];
const STATUS_FINAIS = ['CONCLUIDO', 'RECUSADO', 'DUPLICADO'];
const PRIORIDADES = ['P0', 'P1', 'P2', 'P3'];
const TIPOS = ['ERRO', 'MELHORIA', 'DUVIDA'];
const IMPACTOS = ['BAIXO', 'MEDIO', 'ALTO', 'CRITICO'];
const MIME_IMAGEM = ['image/png', 'image/jpeg', 'image/webp'];
const LIMITE_ANEXO = 10 * 1024 * 1024;
const LIMITE_ANEXOS = 3;
const URL_BASE = 'https://kuryoserp.com.br/chamados.html';

function erro(code, message, details) {
  return Object.assign(new Error(message), {code, details});
}
function texto(v, max) {
  const t = String(v == null ? '' : v).trim();
  return max ? t.slice(0, max) : t;
}
function mapaVerdadeiro(v) {
  return Object.keys(v || {}).some((k) => v[k] === true);
}
function ativo(perfil) {
  return !!perfil && !perfil.desativado && !perfil.bloqueado && !['pending', 'tv'].includes(perfil.role);
}
function eAdmin(perfil) {
  return !!perfil && (perfil.role === 'admin' || (perfil.funcoes || {}).admin === true);
}
function nome(perfil, uid) {
  return texto(perfil && perfil.nome, 120) || texto(perfil && perfil.email, 160) || uid;
}
function requestIdValido(v) {
  return /^[A-Za-z0-9_-]{12,100}$/.test(String(v || ''));
}
function idValido(v) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(String(v || ''));
}
function prioridadeDoImpacto(impacto) {
  return impacto === 'CRITICO' ? 'P0' : impacto === 'ALTO' ? 'P1' : impacto === 'MEDIO' ? 'P2' : 'P3';
}
function validarCriacao(dados) {
  const tipo = texto(dados && dados.tipo, 20).toUpperCase();
  const impacto = texto(dados && dados.impacto, 20).toUpperCase();
  const titulo = texto(dados && dados.titulo, 140);
  const descricao = texto(dados && dados.descricao, 5000);
  if (!TIPOS.includes(tipo)) throw erro('invalid-argument', 'Escolha o tipo do chamado.');
  if (!IMPACTOS.includes(impacto)) throw erro('invalid-argument', 'Escolha o impacto do problema.');
  if (titulo.length < 6) throw erro('invalid-argument', 'Resuma o chamado em pelo menos 6 caracteres.');
  if (descricao.length < 12) throw erro('invalid-argument', 'Descreva o que aconteceu e o que você esperava.');
  const contextoEntrada = dados && dados.contexto || {};
  const contexto = {
    pagina: texto(contextoEntrada.pagina, 120),
    url: texto(contextoEntrada.url, 500),
    navegador: texto(contextoEntrada.navegador, 300),
    viewport: texto(contextoEntrada.viewport, 40),
  };
  return {tipo, impacto, titulo, descricao, contexto};
}
function caminhoPermitido(uid, chamadoId, caminho) {
  const prefixo = `chamados/${uid}/${chamadoId}/`;
  const c = texto(caminho, 500);
  return c.startsWith(prefixo) && /^[A-Za-z0-9._-]{1,140}$/.test(c.slice(prefixo.length));
}
async function validarAnexos(uid, chamadoId, anexos, obterAnexo) {
  const lista = Array.isArray(anexos) ? anexos : [];
  if (lista.length > LIMITE_ANEXOS) throw erro('invalid-argument', 'Envie no máximo 3 prints.');
  const vistos = new Set();
  const saida = [];
  for (let i = 0; i < lista.length; i++) {
    const caminho = texto(lista[i] && lista[i].caminho, 500);
    if (!caminhoPermitido(uid, chamadoId, caminho) || vistos.has(caminho)) {
      throw erro('invalid-argument', 'Um dos prints não pertence a este chamado.');
    }
    vistos.add(caminho);
    let meta;
    try { meta = await obterAnexo(caminho); }
    catch (_) { throw erro('failed-precondition', 'Um dos prints ainda não terminou de enviar. Tente novamente.'); }
    const bytes = Number(meta && meta.size || 0);
    const contentType = texto(meta && meta.contentType, 100).toLowerCase();
    if (!(bytes > 0) || bytes > LIMITE_ANEXO || !MIME_IMAGEM.includes(contentType)) {
      throw erro('invalid-argument', 'Print inválido. Use PNG, JPG ou WebP com até 10 MB.');
    }
    saida.push({
      caminho,
      nomeOriginal: texto(meta.originalName || (lista[i] && lista[i].nomeOriginal), 160) || `print-${i + 1}`,
      bytes,
      contentType,
      ordem: i,
    });
  }
  return saida;
}
function aguardaVoce(c) { return c.aguardandoRespostaDe === 'AUTOR' && !STATUS_FINAIS.includes(c.status); }
function aguardaAdm(c) { return c.aguardandoRespostaDe === 'ADMIN' && !STATUS_FINAIS.includes(c.status); }
// Caixa do autor: lista e contador do menu ("aguarda você"), lida só pelo próprio (regra do banco).
function resumo(id, c) {
  return {
    id,
    codigo: c.codigo,
    titulo: c.titulo,
    tipo: c.tipo,
    impacto: c.impacto,
    prioridade: c.prioridade,
    status: c.status,
    autor: c.autor,
    responsavel: c.responsavel || null,
    aguardandoRespostaDe: c.aguardandoRespostaDe || null,
    criadaEm: c.criadaEm,
    atualizadaEm: c.atualizadaEm,
    anexosQuantidade: Object.keys(c.anexos || {}).length,
    ordem: typeof c.ordem === 'number' ? c.ordem : null,
    aguardaVoce: aguardaVoce(c),
  };
}
// Fila do ADM: o contador do menu do administrador ("aguarda ADM"), lida só por ADM.
function resumoFila(id, c) {
  return {codigo: c.codigo, titulo: c.titulo, status: c.status, prioridade: c.prioridade, aguardaAdm: aguardaAdm(c), atualizadaEm: c.atualizadaEm};
}
function evento(tipo, pessoa, quando, textoEvento, extras) {
  return Object.assign({tipo, uid: pessoa.uid, nome: pessoa.nome, em: quando}, textoEvento ? {texto: textoEvento} : {}, extras || {});
}
function escaparHtml(v) {
  return texto(v).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}
function destinatariosAdmin(usuarios) {
  return Object.keys(usuarios || {}).filter((uid) => ativo(usuarios[uid]) && eAdmin(usuarios[uid]) && /@/.test(usuarios[uid].email || ''))
    .map((uid) => usuarios[uid].email.trim().toLowerCase()).filter((v, i, a) => a.indexOf(v) === i);
}
function montarEmail(c, acao, autorNome) {
  const assunto = `[${c.codigo}] ${acao}: ${c.titulo}`;
  const corpo = `<p><b>${escaparHtml(c.codigo)} · ${escaparHtml(c.titulo)}</b></p>` +
    `<p>${escaparHtml(autorNome)} ${escaparHtml(acao.toLowerCase())} este chamado.</p>` +
    `<p>Status: <b>${escaparHtml(c.status)}</b> · Prioridade: <b>${escaparHtml(c.prioridade)}</b></p>` +
    `<p><a href="${URL_BASE}?id=${encodeURIComponent(c.id || '')}">Abrir chamado no Kuryos ERP</a></p>`;
  return {assunto, corpo};
}

function criarServico(deps) {
  const db = deps.db;
  const obterAnexo = deps.obterAnexo || (async () => { throw new Error('Storage indisponível'); });
  const enviarEmail = deps.enviarEmail || (async () => false);
  const agora = deps.agora || (() => new Date().toISOString());
  // Versão publicada na hora do chamado (o deploy da VPS define APP_VERSION com o commit).
  const versao = deps.versao || null;

  async function contexto(uid) {
    const [perfilSnap, usuariosSnap] = await Promise.all([
      db.ref(`usuarios/${uid}`).once('value'),
      db.ref('usuarios').once('value'),
    ]);
    const perfil = perfilSnap.val();
    if (!ativo(perfil)) throw erro('permission-denied', 'Seu acesso não está ativo.');
    return {perfil, usuarios: usuariosSnap.val() || {}, pessoa: {uid, nome: nome(perfil, uid)}};
  }
  async function avisar(c, acao, ator, usuarios, destinos) {
    const opcoes = destinos || {};
    const emails = opcoes.admins ? destinatariosAdmin(usuarios) : [];
    const autorEmail = usuarios[c.autor.uid] && usuarios[c.autor.uid].email;
    if (opcoes.autor && /@/.test(autorEmail || '')) emails.push(autorEmail.trim().toLowerCase());
    const unicos = emails.filter((v, i, a) => a.indexOf(v) === i);
    if (!unicos.length) return {status: 'SEM_DESTINATARIOS'};
    const mail = montarEmail(c, acao, ator);
    try {
      await enviarEmail(unicos, mail.assunto, mail.corpo);
      return {status: 'ENVIADO'};
    } catch (e) {
      return {status: 'ERRO', erro: texto(e && e.message, 300)};
    }
  }
  async function reservar(uid, dados, ctx) {
    if (!requestIdValido(dados.requestId)) throw erro('invalid-argument', 'Identificador de envio inválido. Reabra o formulário.');
    const ref = db.ref(`chamados_pedidos/${uid}/${dados.requestId}`);
    const quando = agora();
    let idNovo = db.ref('chamados').push().key;
    const tx = await ref.transaction((atual) => atual || {id: idNovo, criadaEm: quando, autorNome: ctx.pessoa.nome});
    const r = tx.snapshot.val();
    return {ok: true, id: r.id, requestId: dados.requestId, finalizado: !!r.finalizado};
  }
  async function criar(uid, dados, ctx) {
    if (!requestIdValido(dados.requestId)) throw erro('invalid-argument', 'Identificador de envio inválido. Reabra o formulário.');
    const pedidoRef = db.ref(`chamados_pedidos/${uid}/${dados.requestId}`);
    const pedido = (await pedidoRef.once('value')).val();
    if (!pedido || !idValido(pedido.id)) throw erro('failed-precondition', 'Reserve o chamado antes de enviar os prints.');
    if (pedido.finalizado) return {ok: true, id: pedido.id, codigo: pedido.codigo, repetida: true};
    const campos = validarCriacao(dados);
    campos.contexto.versao = versao;
    const anexos = await validarAnexos(uid, pedido.id, dados.anexos, obterAnexo);
    const contadorRef = db.ref('config/contadores/chamados');
    const txContador = await contadorRef.transaction((v) => Math.max(0, Number(v) || 0) + 1);
    if (!txContador.committed) throw erro('aborted', 'Não foi possível numerar o chamado. Tente novamente.');
    const numero = Number(txContador.snapshot.val());
    const codigo = 'CH-' + String(numero).padStart(5, '0');
    const quando = agora();
    const eventoId = db.ref(`chamados/${pedido.id}/historico`).push().key;
    const anexosMap = {};
    anexos.forEach((a, i) => { anexosMap['anexo_' + (i + 1)] = Object.assign({}, a, {enviadoEm: quando, enviadoPor: ctx.pessoa}); });
    const chamado = Object.assign({}, campos, {
      id: pedido.id,
      codigo,
      prioridade: prioridadeDoImpacto(campos.impacto),
      status: 'NOVO',
      autor: ctx.pessoa,
      criadaEm: quando,
      atualizadaEm: quando,
      // Todo cartão nasce posicionado. Assim, arrastar antes/depois de outro
      // cartão mantém a ordem exata mesmo antes da primeira triagem.
      ordem: Date.parse(quando) || 1,
      aguardandoRespostaDe: 'ADMIN',
      anexos: anexosMap,
      historico: {[eventoId]: evento('CRIADO', ctx.pessoa, quando, '', {status: 'NOVO'})},
      versao: 1,
    });
    const updates = {};
    updates[`chamados/${pedido.id}`] = chamado;
    updates[`chamados_caixa/${uid}/${pedido.id}`] = resumo(pedido.id, chamado);
    updates[`chamados_fila_adm/${pedido.id}`] = resumoFila(pedido.id, chamado);
    updates[`chamados_pedidos/${uid}/${dados.requestId}/finalizado`] = true;
    updates[`chamados_pedidos/${uid}/${dados.requestId}/codigo`] = codigo;
    updates[`chamados_pedidos/${uid}/${dados.requestId}/finalizadoEm`] = quando;
    await db.ref().update(updates);
    const email = await avisar(chamado, 'Novo chamado', ctx.pessoa.nome, ctx.usuarios, {admins: true});
    await db.ref(`chamados/${pedido.id}/emailUltimo`).set(Object.assign({em: agora()}, email));
    return {ok: true, id: pedido.id, codigo, status: 'NOVO', email};
  }
  async function listar(uid, dados, ctx) {
    const quadro = String(dados.visao || '').toUpperCase() === 'QUADRO';
    if (quadro && !eAdmin(ctx.perfil)) throw erro('permission-denied', 'Somente administradores acessam o quadro.');
    const todos = (await db.ref('chamados').once('value')).val() || {};
    const itens = Object.keys(todos).filter((id) => todos[id] && (quadro || todos[id].autor && todos[id].autor.uid === uid))
      .map((id) => resumo(id, todos[id])).sort((a, b) => String(b.atualizadaEm).localeCompare(String(a.atualizadaEm)));
    return {ok: true, admin: eAdmin(ctx.perfil), itens};
  }
  async function detalhe(uid, dados, ctx) {
    if (!idValido(dados.id)) throw erro('invalid-argument', 'Chamado inválido.');
    const c = (await db.ref(`chamados/${dados.id}`).once('value')).val();
    if (!c) throw erro('not-found', 'Chamado não encontrado.');
    if (!eAdmin(ctx.perfil) && (!c.autor || c.autor.uid !== uid)) throw erro('permission-denied', 'Você não pode abrir este chamado.');
    return {ok: true, admin: eAdmin(ctx.perfil), chamado: Object.assign({id: dados.id}, c)};
  }
  async function alterar(uid, dados, ctx) {
    if (!idValido(dados.id)) throw erro('invalid-argument', 'Chamado inválido.');
    const acao = texto(dados.acao, 40).toUpperCase();
    const ref = db.ref(`chamados/${dados.id}`);
    const eventoId = ref.child('historico').push().key;
    const quando = agora();
    let salvo = null;
    let falha = null;
    let tipoEventoSalvo = null;
    let mudouStatus = false;
    let duplicadoOriginal = null;
    if (acao === 'DUPLICADO') {
      if (!eAdmin(ctx.perfil)) throw erro('permission-denied', 'Somente administradores marcam duplicidade.');
      const codigo = texto(dados.duplicadoDe, 40).toUpperCase();
      if (!/^CH-\d{3,}$/.test(codigo)) throw erro('invalid-argument', 'Informe o código do chamado original.');
      const todos = (await db.ref('chamados').once('value')).val() || {};
      const originalId = Object.keys(todos).find((id) => id !== dados.id && todos[id] && todos[id].codigo === codigo);
      if (!originalId) throw erro('failed-precondition', 'O chamado original não existe ou é este mesmo chamado.');
      duplicadoOriginal = {id: originalId, codigo};
    }
    const tx = await ref.transaction((atual) => {
      salvo = null; falha = null; tipoEventoSalvo = null; mudouStatus = false;
      if (!atual) return atual;
      try {
        const autor = atual.autor && atual.autor.uid === uid;
        const admin = eAdmin(ctx.perfil);
        if (!admin && !autor) throw erro('permission-denied', 'Você não participa deste chamado.');
        if (STATUS_FINAIS.includes(atual.status)) throw erro('failed-precondition', 'Este chamado já está encerrado.');
        const novo = Object.assign({}, atual);
        novo.historico = Object.assign({}, atual.historico || {});
        let ev;
        if (acao === 'COMENTAR') {
          const comentario = texto(dados.texto, 2000);
          if (comentario.length < 2) throw erro('invalid-argument', 'Escreva o comentário.');
          if (STATUS_FINAIS.includes(atual.status)) throw erro('failed-precondition', 'Este chamado está encerrado.');
          novo.aguardandoRespostaDe = admin ? 'AUTOR' : 'ADMIN';
          ev = evento('COMENTARIO', ctx.pessoa, quando, comentario);
        } else if (acao === 'MOVER') {
          if (!admin) throw erro('permission-denied', 'Somente administradores movem o chamado.');
          const status = texto(dados.status, 30).toUpperCase();
          if (!STATUS.includes(status)) throw erro('invalid-argument', 'Coluna inválida.');
          // A posição na coluna é a ordem de trabalho: o quadro manda um número entre os vizinhos.
          const ordem = dados.ordem == null || dados.ordem === '' ? null : Number(dados.ordem);
          if (ordem != null && (!Number.isFinite(ordem) || Math.abs(ordem) > Number.MAX_SAFE_INTEGER)) throw erro('invalid-argument', 'Posição inválida.');
          if (status === atual.status && ordem == null) throw erro('invalid-argument', 'O chamado já está nesta coluna.');
          if (ordem != null) novo.ordem = ordem;
          novo.status = status;
          novo.aguardandoRespostaDe = status === 'VALIDAR' ? 'AUTOR' : status === 'CONCLUIDO' ? null : 'ADMIN';
          mudouStatus = status !== atual.status;
          ev = mudouStatus
            ? evento('STATUS', ctx.pessoa, quando, texto(dados.texto, 500), {de: atual.status, para: status})
            : evento('ORDEM', ctx.pessoa, quando, '', {status, ordem: novo.ordem});
        } else if (acao === 'TRIAR') {
          if (!admin) throw erro('permission-denied', 'Somente administradores fazem a triagem.');
          const prioridade = texto(dados.prioridade, 10).toUpperCase();
          if (!PRIORIDADES.includes(prioridade)) throw erro('invalid-argument', 'Prioridade inválida.');
          novo.prioridade = prioridade;
          novo.responsavel = texto(dados.responsavel, 120) || null;
          ev = evento('TRIAGEM', ctx.pessoa, quando, texto(dados.texto, 500), {prioridade, responsavel: novo.responsavel});
        } else if (acao === 'CONFIRMAR') {
          if (!autor || atual.status !== 'VALIDAR') throw erro('failed-precondition', 'O chamado não está aguardando sua validação.');
          novo.status = 'CONCLUIDO'; novo.aguardandoRespostaDe = null;
          mudouStatus = true;
          ev = evento('CONFIRMADO', ctx.pessoa, quando, texto(dados.texto, 500));
        } else if (acao === 'REABRIR') {
          if (!autor || atual.status !== 'VALIDAR') throw erro('failed-precondition', 'O chamado não está aguardando sua validação.');
          const motivo = texto(dados.texto, 1000);
          if (motivo.length < 5) throw erro('invalid-argument', 'Explique o que ainda precisa ser corrigido.');
          novo.status = 'EM_ANDAMENTO'; novo.aguardandoRespostaDe = 'ADMIN';
          mudouStatus = true;
          ev = evento('REABERTO', ctx.pessoa, quando, motivo);
        } else if (acao === 'RECUSAR') {
          if (!admin) throw erro('permission-denied', 'Somente administradores recusam chamados.');
          const motivo = texto(dados.texto, 1000);
          if (motivo.length < 5) throw erro('invalid-argument', 'Informe o motivo da recusa.');
          novo.status = 'RECUSADO'; novo.aguardandoRespostaDe = null;
          mudouStatus = true;
          ev = evento('RECUSADO', ctx.pessoa, quando, motivo);
        } else if (acao === 'DUPLICADO') {
          if (!admin) throw erro('permission-denied', 'Somente administradores marcam duplicidade.');
          novo.status = 'DUPLICADO'; novo.duplicadoDe = duplicadoOriginal.codigo; novo.duplicadoId = duplicadoOriginal.id; novo.aguardandoRespostaDe = null;
          mudouStatus = true;
          ev = evento('DUPLICADO', ctx.pessoa, quando, texto(dados.texto, 500), {duplicadoDe: duplicadoOriginal.codigo, duplicadoId: duplicadoOriginal.id});
        } else {
          throw erro('invalid-argument', 'Ação desconhecida.');
        }
        novo.atualizadaEm = quando;
        novo.versao = (Number(atual.versao) || 0) + 1;
        novo.historico[eventoId] = ev;
        tipoEventoSalvo = ev.tipo;
        salvo = novo;
        return novo;
      } catch (e) { falha = e; return; }
    });
    if (falha) throw falha;
    if (!tx.snapshot.exists()) throw erro('not-found', 'Chamado não encontrado.');
    if (!tx.committed || !salvo) throw erro('aborted', 'O chamado mudou. Recarregue e tente novamente.');
    await db.ref().update({[`chamados_caixa/${salvo.autor.uid}/${dados.id}`]: resumo(dados.id, salvo), [`chamados_fila_adm/${dados.id}`]: resumoFila(dados.id, salvo)});
    salvo.id = dados.id;
    const autorAgiu = ctx.pessoa.uid === salvo.autor.uid;
    const deveAvisar = tipoEventoSalvo !== 'ORDEM' && tipoEventoSalvo !== 'TRIAGEM';
    const email = deveAvisar
      ? await avisar(salvo, acao === 'COMENTAR' ? 'Novo comentário' : 'Chamado atualizado', ctx.pessoa.nome, ctx.usuarios, autorAgiu ? {admins: true} : {autor: mudouStatus || acao === 'COMENTAR'})
      : {status: 'NAO_APLICAVEL'};
    if (deveAvisar) await ref.child('emailUltimo').set(Object.assign({em: agora()}, email));
    return {ok: true, id: dados.id, status: salvo.status, email};
  }
  async function executar(uid, dados) {
    const ctx = await contexto(uid);
    const acao = texto(dados && dados.acao, 40).toUpperCase();
    if (acao === 'RESERVAR') return reservar(uid, dados, ctx);
    if (acao === 'CRIAR') return criar(uid, dados, ctx);
    if (acao === 'LISTAR') return listar(uid, dados, ctx);
    if (acao === 'DETALHE') return detalhe(uid, dados, ctx);
    return alterar(uid, dados || {}, ctx);
  }
  return {executar};
}

module.exports = {
  STATUS, STATUS_FINAIS, PRIORIDADES, TIPOS, IMPACTOS, MIME_IMAGEM, LIMITE_ANEXO, LIMITE_ANEXOS,
  ativo, eAdmin, prioridadeDoImpacto, validarCriacao, caminhoPermitido, validarAnexos, resumo, resumoFila, aguardaVoce, aguardaAdm, montarEmail, criarServico,
};
