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
function eGestor(perfil) {
  return !!perfil && (eAdmin(perfil) || perfil.role === 'gestor' || (perfil.funcoes || {}).gestor === true);
}
function setorDoPerfil(perfil) {
  return (texto(perfil && (perfil.setor || perfil.departamento || perfil.role), 60) || 'NAO_INFORMADO').toUpperCase();
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
function roadmapIdValido(v) {
  return /^[a-f0-9]{10}$/i.test(String(v || ''));
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
  const erroEntrada = contextoEntrada.erroJavaScript;
  if (erroEntrada && texto(erroEntrada.mensagem, 500)) {
    contexto.erroJavaScript = {
      mensagem: texto(erroEntrada.mensagem, 500),
      arquivo: texto(erroEntrada.arquivo, 500),
      linha: Math.max(0, Math.min(9999999, Number(erroEntrada.linha) || 0)),
      coluna: Math.max(0, Math.min(9999999, Number(erroEntrada.coluna) || 0)),
      pilha: texto(erroEntrada.pilha, 2000),
      em: texto(erroEntrada.em, 40),
      pagina: texto(erroEntrada.pagina, 120),
    };
  }
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
    responsavelUid: c.responsavelUid || null,
    aguardandoRespostaDe: c.aguardandoRespostaDe || null,
    criadaEm: c.criadaEm,
    atualizadaEm: c.atualizadaEm,
    anexosQuantidade: Object.keys(c.anexos || {}).length,
    ordem: typeof c.ordem === 'number' ? c.ordem : null,
    roadmapId: c.roadmapId || null,
    setor: c.setor || c.autor && c.autor.setor || 'NAO_INFORMADO',
    metricas: c.metricas || null,
    aguardaVoce: aguardaVoce(c),
  };
}
// Fila do ADM: o contador do menu do administrador ("aguarda ADM"), lida só por ADM.
function resumoFila(id, c) {
  return Object.assign(resumo(id, c), {aguardaAdm: aguardaAdm(c)});
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
function responsaveisAdmin(usuarios) {
  return Object.keys(usuarios || {}).filter((uid) => ativo(usuarios[uid]) && eAdmin(usuarios[uid])).map((uid) => ({
    uid,
    nome: nome(usuarios[uid], uid),
    setor: setorDoPerfil(usuarios[uid]),
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.uid.localeCompare(b.uid));
}
function montarEmail(c, acao, autorNome) {
  const assunto = `[${c.codigo}] ${acao}: ${c.titulo}`;
  const corpo = `<p><b>${escaparHtml(c.codigo)} · ${escaparHtml(c.titulo)}</b></p>` +
    `<p>${escaparHtml(autorNome)} ${escaparHtml(acao.toLowerCase())} este chamado.</p>` +
    `<p>Status: <b>${escaparHtml(c.status)}</b> · Prioridade: <b>${escaparHtml(c.prioridade)}</b></p>` +
    `<p><a href="${URL_BASE}?id=${encodeURIComponent(c.id || '')}">Abrir chamado no Kuryos ERP</a></p>`;
  return {assunto, corpo};
}

function intervaloMs(inicio, fim) {
  const a = Date.parse(inicio || ''), b = Date.parse(fim || '');
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a : null;
}
function marcosDoChamado(c, usuarios) {
  const metricas = c.metricas || {};
  let primeiraRespostaEm = metricas.primeiraRespostaEm || null;
  let concluidoEm = metricas.concluidoEm || null;
  const eventos = Object.keys(c.historico || {}).map((id) => c.historico[id]).filter(Boolean)
    .sort((a, b) => String(a.em || '').localeCompare(String(b.em || '')));
  if (!primeiraRespostaEm) {
    const resposta = eventos.find((ev) => ev.uid !== (c.autor && c.autor.uid) && eAdmin((usuarios || {})[ev.uid]) && ['COMENTARIO', 'STATUS', 'RECUSADO', 'DUPLICADO'].includes(ev.tipo));
    primeiraRespostaEm = resposta && resposta.em || null;
  }
  if (!concluidoEm) {
    const fim = eventos.find((ev) => ['CONFIRMADO', 'RECUSADO', 'DUPLICADO'].includes(ev.tipo));
    concluidoEm = fim && fim.em || (STATUS_FINAIS.includes(c.status) ? c.atualizadaEm || null : null);
  }
  return {
    primeiraRespostaEm,
    tempoPrimeiraRespostaMs: intervaloMs(c.criadaEm, primeiraRespostaEm),
    concluidoEm,
    tempoConclusaoMs: intervaloMs(c.criadaEm, concluidoEm),
  };
}
function media(valores) {
  const validos = valores.filter((v) => Number.isFinite(v) && v >= 0);
  return validos.length ? Math.round(validos.reduce((a, b) => a + b, 0) / validos.length) : null;
}
function calcularMetricas(todos, usuarios) {
  const grupos = new Map();
  Object.keys(todos || {}).map((id) => todos[id]).filter(Boolean).forEach((c) => {
    const setor = texto(c.setor || c.autor && c.autor.setor, 60).toUpperCase() || 'NAO_INFORMADO';
    const tipo = TIPOS.includes(c.tipo) ? c.tipo : 'NAO_INFORMADO';
    const chave = setor + '|' + tipo;
    const g = grupos.get(chave) || {setor, tipo, total: 0, abertos: 0, concluidos: 0, respondidos: 0, primeira: [], conclusao: []};
    const marcos = marcosDoChamado(c, usuarios);
    g.total++;
    if (STATUS_FINAIS.includes(c.status)) g.concluidos++; else g.abertos++;
    if (marcos.tempoPrimeiraRespostaMs != null) { g.respondidos++; g.primeira.push(marcos.tempoPrimeiraRespostaMs); }
    if (marcos.tempoConclusaoMs != null) g.conclusao.push(marcos.tempoConclusaoMs);
    grupos.set(chave, g);
  });
  function fechar(g) {
    return {setor: g.setor, tipo: g.tipo, total: g.total, abertos: g.abertos, concluidos: g.concluidos, respondidos: g.respondidos, mediaPrimeiraRespostaMs: media(g.primeira), mediaConclusaoMs: media(g.conclusao)};
  }
  const linhas = Array.from(grupos.values()).map(fechar).sort((a, b) => a.setor.localeCompare(b.setor, 'pt-BR') || a.tipo.localeCompare(b.tipo, 'pt-BR'));
  const acumulado = Array.from(grupos.values()).reduce((g, item) => {
    g.total += item.total; g.abertos += item.abertos; g.concluidos += item.concluidos; g.respondidos += item.respondidos;
    g.primeira.push(...item.primeira); g.conclusao.push(...item.conclusao); return g;
  }, {setor: 'TODOS', tipo: 'TODOS', total: 0, abertos: 0, concluidos: 0, respondidos: 0, primeira: [], conclusao: []});
  return {geral: fechar(acumulado), grupos: linhas};
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
    return {perfil, usuarios: usuariosSnap.val() || {}, pessoa: {uid, nome: nome(perfil, uid), setor: setorDoPerfil(perfil)}};
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
      setor: ctx.pessoa.setor,
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
    const visao = String(dados.visao || '').toUpperCase();
    const quadro = visao === 'QUADRO';
    const gestao = visao === 'GESTAO';
    if (quadro && !eAdmin(ctx.perfil)) throw erro('permission-denied', 'Somente administradores acessam o quadro.');
    if (gestao && !eGestor(ctx.perfil)) throw erro('permission-denied', 'Somente gestores acessam esta visão.');
    const caminhoIndice = quadro || gestao ? 'chamados_fila_adm' : `chamados_caixa/${uid}`;
    const leituras = [db.ref(caminhoIndice).once('value')];
    if (eAdmin(ctx.perfil) && quadro) leituras.push(db.ref('chamados_roadmap').once('value'));
    const snaps = await Promise.all(leituras);
    let todos = snaps[0].val() || {};
    // Registros antigos da fila tinham só os campos do contador. Hidratamos
    // cada item legado uma única vez, sem voltar a ler o nó inteiro de chamados.
    if (quadro || gestao) {
      const legados = Object.keys(todos).filter((id) => todos[id] && (!todos[id].id || !todos[id].tipo || !todos[id].autor));
      if (legados.length) {
        const completos = await Promise.all(legados.map((id) => db.ref(`chamados/${id}`).once('value')));
        const updates = {};
        legados.forEach((id, i) => {
          const completo = completos[i].val();
          if (!completo) return;
          const item = resumoFila(id, completo);
          item.metricas = Object.assign({}, completo.metricas || {}, marcosDoChamado(completo, ctx.usuarios));
          todos[id] = item;
          updates[`chamados_fila_adm/${id}`] = item;
          if (completo.autor && completo.autor.uid) updates[`chamados_caixa/${completo.autor.uid}/${id}`] = resumo(id, completo);
        });
        if (Object.keys(updates).length) await db.ref().update(updates);
      }
    }
    const itens = Object.keys(todos).filter((id) => todos[id]).map((id) => Object.assign({id}, todos[id]))
      .sort((a, b) => String(b.atualizadaEm || '').localeCompare(String(a.atualizadaEm || '')));
    return {
      ok: true,
      admin: eAdmin(ctx.perfil),
      gestor: eGestor(ctx.perfil),
      itens,
      metricas: gestao ? calcularMetricas(todos, ctx.usuarios) : null,
      roadmapEstado: snaps[1] ? snaps[1].val() || {} : {},
      responsaveis: eAdmin(ctx.perfil) ? responsaveisAdmin(ctx.usuarios) : [],
    };
  }
  async function detalhe(uid, dados, ctx) {
    if (!idValido(dados.id)) throw erro('invalid-argument', 'Chamado inválido.');
    const c = (await db.ref(`chamados/${dados.id}`).once('value')).val();
    if (!c) throw erro('not-found', 'Chamado não encontrado.');
    if (!eAdmin(ctx.perfil) && !eGestor(ctx.perfil) && (!c.autor || c.autor.uid !== uid)) throw erro('permission-denied', 'Você não pode abrir este chamado.');
    return {ok: true, admin: eAdmin(ctx.perfil), gestor: eGestor(ctx.perfil), chamado: Object.assign({id: dados.id}, c)};
  }
  async function sincronizarRoadmap(dados, ctx) {
    if (!eAdmin(ctx.perfil)) throw erro('permission-denied', 'Somente administradores sincronizam o Roadmap.');
    const entrada = Array.isArray(dados.itens) ? dados.itens : [];
    if (!entrada.length || entrada.length > 500) throw erro('invalid-argument', 'Lista do Roadmap inválida.');
    const ids = new Set();
    const itensRoadmap = entrada.map((item, indice) => {
      const id = texto(item && item.id, 20).toLowerCase();
      if (!roadmapIdValido(id) || ids.has(id)) throw erro('invalid-argument', 'O Roadmap contém um item inválido ou repetido.');
      ids.add(id);
      return {id, feito: item && item.feito === true, indice};
    });
    const quando = agora();
    const ref = db.ref('chamados_roadmap');
    const tx = await ref.transaction((atual) => {
      const novo = Object.assign({}, atual || {});
      itensRoadmap.forEach((item) => {
        const existente = Object.assign({}, novo[item.id] || {});
        if (!novo[item.id]) {
          existente.criadaEm = quando;
          existente.ordem = Date.parse(quando) + item.indice;
          existente.status = item.feito ? 'CONCLUIDO' : 'NA_FILA';
        }
        existente.fonteConcluida = item.feito;
        if (item.feito) existente.status = 'CONCLUIDO';
        existente.atualizadaEm = existente.atualizadaEm || quando;
        novo[item.id] = existente;
      });
      return novo;
    });
    if (!tx.committed) throw erro('aborted', 'O Roadmap mudou. Recarregue e tente novamente.');
    return {ok: true, roadmapEstado: tx.snapshot.val() || {}};
  }
  async function moverRoadmap(dados, ctx) {
    if (!eAdmin(ctx.perfil)) throw erro('permission-denied', 'Somente administradores movem o Roadmap.');
    const id = texto(dados.id, 20).toLowerCase();
    const status = texto(dados.status, 30).toUpperCase();
    const ordem = dados.ordem == null || dados.ordem === '' ? null : Number(dados.ordem);
    if (!roadmapIdValido(id)) throw erro('invalid-argument', 'Item do Roadmap inválido.');
    if (!STATUS.includes(status)) throw erro('invalid-argument', 'Coluna inválida.');
    if (ordem != null && (!Number.isFinite(ordem) || Math.abs(ordem) > Number.MAX_SAFE_INTEGER)) throw erro('invalid-argument', 'Posição inválida.');
    const ref = db.ref(`chamados_roadmap/${id}`);
    const eventoId = ref.child('historico').push().key;
    const quando = agora();
    let falha = null;
    const tx = await ref.transaction((atual) => {
      falha = null;
      try {
        if (!atual) throw erro('failed-precondition', 'Sincronize o Roadmap antes de mover este item.');
        if (atual.fonteConcluida && status !== 'CONCLUIDO') throw erro('failed-precondition', 'Este item já está concluído na fonte do Roadmap.');
        if (status === atual.status && ordem == null) throw erro('invalid-argument', 'O item já está nesta coluna.');
        const novo = Object.assign({}, atual, {status, atualizadaEm: quando, alteradoPor: ctx.pessoa});
        if (ordem != null) novo.ordem = ordem;
        novo.historico = Object.assign({}, atual.historico || {}, {[eventoId]: evento(status === atual.status ? 'ORDEM' : 'STATUS', ctx.pessoa, quando, '', status === atual.status ? {status, ordem: novo.ordem} : {de: atual.status, para: status})});
        return novo;
      } catch (e) { falha = e; return; }
    });
    if (falha) throw falha;
    if (!tx.committed) throw erro('aborted', 'O item mudou. Recarregue e tente novamente.');
    return {ok: true, id, status, roadmap: tx.snapshot.val()};
  }
  async function vincularRoadmap(dados, ctx) {
    if (!eAdmin(ctx.perfil)) throw erro('permission-denied', 'Somente administradores vinculam chamados ao Roadmap.');
    if (!idValido(dados.id)) throw erro('invalid-argument', 'Chamado inválido.');
    const roadmapId = texto(dados.roadmapId, 20).toLowerCase();
    if (roadmapId && !roadmapIdValido(roadmapId)) throw erro('invalid-argument', 'Item do Roadmap inválido.');
    const chamadoRef = db.ref(`chamados/${dados.id}`);
    if (roadmapId && !(await db.ref(`chamados_roadmap/${roadmapId}`).once('value')).exists()) throw erro('failed-precondition', 'Sincronize o Roadmap antes de fazer o vínculo.');
    const quando = agora();
    const eventoId = chamadoRef.child('historico').push().key;
    let anterior = '', atualizado = null, falha = null, mudou = false;
    const tx = await chamadoRef.transaction((chamado) => {
      atualizado = null; falha = null; mudou = false;
      try {
        if (!chamado) throw erro('not-found', 'Chamado não encontrado.');
        anterior = chamado.roadmapId || '';
        if (anterior === roadmapId) { atualizado = chamado; return chamado; }
        mudou = true;
        atualizado = Object.assign({}, chamado, {
          roadmapId: roadmapId || null,
          atualizadaEm: quando,
          versao: (Number(chamado.versao) || 0) + 1,
          historico: Object.assign({}, chamado.historico || {}, {[eventoId]: evento('ROADMAP', ctx.pessoa, quando, '', {de: anterior || null, para: roadmapId || null})}),
        });
        return atualizado;
      } catch (e) { falha = e; return; }
    });
    if (falha) throw falha;
    if (!tx.committed || !atualizado) throw erro('aborted', 'O chamado mudou. Recarregue e tente novamente.');
    const updates = {
      [`chamados_caixa/${atualizado.autor.uid}/${dados.id}`]: resumo(dados.id, atualizado),
      [`chamados_fila_adm/${dados.id}`]: resumoFila(dados.id, atualizado),
    };
    if (anterior) updates[`chamados_roadmap/${anterior}/chamados/${dados.id}`] = null;
    if (roadmapId) {
      updates[`chamados_roadmap/${roadmapId}/chamados/${dados.id}`] = {codigo: atualizado.codigo, titulo: atualizado.titulo, status: atualizado.status};
      updates[`chamados_roadmap/${roadmapId}/atualizadaEm`] = quando;
    }
    await db.ref().update(updates);
    return {ok: true, id: dados.id, roadmapId: roadmapId || null, repetida: !mudou};
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
          const responsavelUid = texto(dados.responsavelUid, 128);
          const perfilResponsavel = responsavelUid ? ctx.usuarios[responsavelUid] : null;
          if (responsavelUid && (!ativo(perfilResponsavel) || !eAdmin(perfilResponsavel))) {
            throw erro('invalid-argument', 'Escolha um administrador ativo como responsável.');
          }
          novo.prioridade = prioridade;
          novo.responsavelUid = responsavelUid || null;
          novo.responsavel = perfilResponsavel ? nome(perfilResponsavel, responsavelUid) : null;
          ev = evento('TRIAGEM', ctx.pessoa, quando, texto(dados.texto, 500), {prioridade, responsavel: novo.responsavel, responsavelUid: novo.responsavelUid});
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
        novo.metricas = Object.assign({}, atual.metricas || {});
        const respostaDoAdmin = admin && ['COMENTARIO', 'STATUS', 'RECUSADO', 'DUPLICADO'].includes(ev.tipo) && ev.tipo !== 'ORDEM';
        if (respostaDoAdmin && !novo.metricas.primeiraRespostaEm) {
          novo.metricas.primeiraRespostaEm = quando;
          novo.metricas.tempoPrimeiraRespostaMs = intervaloMs(atual.criadaEm, quando);
        }
        if (STATUS_FINAIS.includes(novo.status) && !novo.metricas.concluidoEm) {
          novo.metricas.concluidoEm = quando;
          novo.metricas.tempoConclusaoMs = intervaloMs(atual.criadaEm, quando);
        }
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
    const indices = {[`chamados_caixa/${salvo.autor.uid}/${dados.id}`]: resumo(dados.id, salvo), [`chamados_fila_adm/${dados.id}`]: resumoFila(dados.id, salvo)};
    if (salvo.roadmapId) indices[`chamados_roadmap/${salvo.roadmapId}/chamados/${dados.id}/status`] = salvo.status;
    await db.ref().update(indices);
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
    if (acao === 'ROADMAP_SINCRONIZAR') return sincronizarRoadmap(dados, ctx);
    if (acao === 'ROADMAP_MOVER') return moverRoadmap(dados, ctx);
    if (acao === 'ROADMAP_VINCULAR') return vincularRoadmap(dados, ctx);
    return alterar(uid, dados || {}, ctx);
  }
  return {executar};
}

module.exports = {
  STATUS, STATUS_FINAIS, PRIORIDADES, TIPOS, IMPACTOS, MIME_IMAGEM, LIMITE_ANEXO, LIMITE_ANEXOS,
  ativo, eAdmin, eGestor, setorDoPerfil, roadmapIdValido, prioridadeDoImpacto, validarCriacao, caminhoPermitido, validarAnexos, resumo, resumoFila, aguardaVoce, aguardaAdm, montarEmail, marcosDoChamado, calcularMetricas, responsaveisAdmin, criarServico,
};
