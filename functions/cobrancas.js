"use strict";
/* Cobranças internas (11/11/2026).

   Pedido do usuário: "uma aba de cobranças internas para notificar os usuários
   das demandas e que siga por e-mail também".

   Uma cobrança é uma demanda que uma pessoa (quem cobra) entrega a uma ou mais
   pessoas (quem é cobrado), com prazo opcional. O aviso chega de dois jeitos:
   - no sistema: contador no menu lateral e a tela cobrancas.html;
   - por e-mail: no MESMO pedido que grava (callable `cobrancaInterna`).

   Por que o e-mail sai na própria callable e não num gatilho: os gatilhos e as
   agendas da VPS estão desligados (DISABLE_TRIGGERS/DISABLE_SCHEDULE, ver
   CORRECOES_VIRADA_ACESSOS_20261103.md). Um gatilho aqui nasceria morto, como
   os outros e-mails automáticos estão hoje. Falha no envio não desfaz a
   cobrança: fica registrada em cobrancas/{id}/emails e a tela oferece reenviar.

   Dados:
     cobrancas/{id}            documento (só o servidor grava; lê quem participa e o ADM)
     cobrancas_caixa/{uid}/{id} índice por pessoa (o menu e a lista leem só o seu)

   Ciclo: ABERTA → RESPONDIDA (cobrado respondeu) → CONCLUIDA; qualquer lado
   conclui; quem cobrou reabre ou cancela (com motivo) e pode cobrar de novo
   (intervalo mínimo, para não virar spam). */

const STATUS = {ABERTA: "ABERTA", RESPONDIDA: "RESPONDIDA", CONCLUIDA: "CONCLUIDA", CANCELADA: "CANCELADA"};
const ROTULO_STATUS = {ABERTA: "Aberta", RESPONDIDA: "Respondida", CONCLUIDA: "Concluída", CANCELADA: "Cancelada"};
const PRIORIDADES = {normal: "Normal", alta: "Alta", urgente: "Urgente"};
const LIMITES = {titulo: 120, texto: 2000, destinatarios: 20, recobrarMinutos: 30};
const URL_BASE = "https://kuryoserp.com.br/";

function erro(code, message) { return Object.assign(new Error(message), {code}); }
function texto(v, max) { return String(v == null ? "" : v).replace(/\r\n/g, "\n").trim().slice(0, max); }
function nomeDe(u, uid) { return (u && (u.nome || u.email)) || uid; }
function ativo(u) { return !!u && !!u.role && u.role !== "pending" && u.role !== "tv" && u.desativado !== true; }
function emailValido(e) { return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()); }
function participantes(c) { return [c.de && c.de.uid].concat(Object.keys(c.para || {})).filter(Boolean); }
function participa(c, uid) { return participantes(c).indexOf(uid) !== -1; }
function eAdmin(u) { return !!u && (u.role === "admin" || !!(u.funcoes && u.funcoes.admin === true)); }

// Link interno opcional (a tela de origem da demanda): só caminho relativo do
// próprio sistema, nunca URL externa nem javascript:.
function linkInterno(v) {
  const s = texto(v, 300);
  if (!s) return "";
  if (!/^[a-z0-9_-]+\.html(\?[A-Za-z0-9_\-=&%.]*)?$/.test(s)) throw erro("invalid-argument", "Link da tela inválido (use o endereço de uma tela do sistema, ex.: ops.html).");
  return s;
}
function prazoValido(v) {
  const s = texto(v, 10);
  if (!s) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + "T12:00:00Z"))) throw erro("invalid-argument", "Prazo inválido.");
  return s;
}

/* Valida o pedido de criação contra os perfis do banco (não confia no nome que
   o navegador mandou). Recusa: sem título, sem destinatário, cobrar a si mesmo,
   destinatário inexistente/inativo. */
function validarCriacao(dados, usuarios, autorUid) {
  const d = dados || {};
  const titulo = texto(d.titulo, LIMITES.titulo);
  if (titulo.length < 3) throw erro("invalid-argument", "Escreva o que está sendo cobrado (título com pelo menos 3 letras).");
  const descricao = texto(d.descricao, LIMITES.texto);
  const prioridade = Object.prototype.hasOwnProperty.call(PRIORIDADES, d.prioridade) ? d.prioridade : "normal";
  const lista = Array.isArray(d.para) ? d.para.map(String) : [];
  const unicos = lista.filter((u, i) => /^[A-Za-z0-9_-]{1,128}$/.test(u) && lista.indexOf(u) === i && u !== autorUid);
  if (!unicos.length) throw erro("invalid-argument", lista.indexOf(autorUid) !== -1 ? "Você não pode cobrar a si mesmo." : "Escolha quem vai receber a cobrança.");
  if (unicos.length > LIMITES.destinatarios) throw erro("invalid-argument", "No máximo " + LIMITES.destinatarios + " pessoas por cobrança.");
  const para = {};
  unicos.forEach((uid) => {
    const u = (usuarios || {})[uid];
    if (!ativo(u)) throw erro("failed-precondition", "Um dos destinatários não está ativo no sistema. Atualize a lista e tente de novo.");
    para[uid] = {nome: nomeDe(u, uid)};
  });
  return {titulo, descricao, prioridade, prazo: prazoValido(d.prazo), link: linkInterno(d.link), para};
}

function novoEvento(tipo, uid, nome, agora, extra) {
  return Object.assign({tipo, uid, nome, em: agora}, extra || {});
}

function criar(dados, usuarios, autorUid, agora) {
  const v = validarCriacao(dados, usuarios, autorUid);
  const autor = (usuarios || {})[autorUid];
  const c = Object.assign(v, {
    de: {uid: autorUid, nome: nomeDe(autor, autorUid)},
    status: STATUS.ABERTA, criadaEm: agora, atualizadaEm: agora, ultimaCobrancaEm: agora, vezesCobrada: 1,
  });
  const evento = novoEvento("CRIADA", autorUid, c.de.nome, agora);
  return {cobranca: c, evento, notificar: Object.keys(c.para)};
}

/* Aplica uma ação a uma cobrança existente. Devolve a cobrança nova, o evento
   do histórico e quem recebe aviso (todos os participantes menos quem agiu,
   ou só os cobrados quando quem cobrou insiste/reabre/cancela). */
function aplicarAcao(atual, acao, ator, dados, agora) {
  const c = JSON.parse(JSON.stringify(atual || {}));
  if (!c.de || !c.para) throw erro("not-found", "Cobrança não encontrada.");
  const uid = ator.uid;
  const souAutor = c.de.uid === uid;
  const souCobrado = Object.prototype.hasOwnProperty.call(c.para, uid);
  const admin = eAdmin(ator.perfil);
  if (!souAutor && !souCobrado && !admin) throw erro("permission-denied", "Você não participa desta cobrança.");
  const encerrada = c.status === STATUS.CONCLUIDA || c.status === STATUS.CANCELADA;
  const msg = texto((dados || {}).texto, LIMITES.texto);
  const nome = nomeDe(ator.perfil, uid);
  const cobrados = Object.keys(c.para);
  const outros = participantes(c).filter((u) => u !== uid);
  let evento;
  let notificar;
  if (acao === "RESPONDER") {
    if (!souAutor && !souCobrado) throw erro("permission-denied", "Só quem participa da cobrança responde.");
    if (encerrada) throw erro("failed-precondition", "Esta cobrança já foi encerrada. Reabra para continuar a conversa.");
    if (!msg) throw erro("invalid-argument", "Escreva a resposta.");
    if (souCobrado && c.status === STATUS.ABERTA) c.status = STATUS.RESPONDIDA;
    evento = novoEvento("RESPOSTA", uid, nome, agora, {texto: msg});
    notificar = outros;
  } else if (acao === "CONCLUIR") {
    if (!souAutor && !souCobrado) throw erro("permission-denied", "Só quem participa da cobrança a conclui.");
    if (encerrada) throw erro("failed-precondition", "Esta cobrança já foi encerrada.");
    c.status = STATUS.CONCLUIDA;
    c.concluidaEm = agora;
    c.concluidaPor = {uid, nome};
    evento = novoEvento("CONCLUIDA", uid, nome, agora, msg ? {texto: msg} : null);
    notificar = outros;
  } else if (acao === "COBRAR_NOVAMENTE") {
    if (!souAutor) throw erro("permission-denied", "Só quem abriu a cobrança cobra de novo.");
    if (encerrada) throw erro("failed-precondition", "Esta cobrança já foi encerrada.");
    const ultima = Date.parse(c.ultimaCobrancaEm || c.criadaEm || 0);
    const faltam = Math.ceil((ultima + LIMITES.recobrarMinutos * 60000 - Date.parse(agora)) / 60000);
    if (faltam > 0) throw erro("failed-precondition", "Você cobrou há pouco. Aguarde " + faltam + " min para cobrar de novo.");
    c.ultimaCobrancaEm = agora;
    c.vezesCobrada = (Number(c.vezesCobrada) || 1) + 1;
    c.status = STATUS.ABERTA;
    evento = novoEvento("COBRADA_NOVAMENTE", uid, nome, agora, msg ? {texto: msg} : null);
    notificar = cobrados;
  } else if (acao === "REABRIR") {
    if (!souAutor && !admin) throw erro("permission-denied", "Só quem abriu a cobrança a reabre.");
    if (c.status !== STATUS.CONCLUIDA) throw erro("failed-precondition", "Só uma cobrança concluída pode ser reaberta.");
    if (!msg) throw erro("invalid-argument", "Diga por que está reabrindo.");
    c.status = STATUS.ABERTA;
    delete c.concluidaEm;
    delete c.concluidaPor;
    c.ultimaCobrancaEm = agora;
    evento = novoEvento("REABERTA", uid, nome, agora, {texto: msg});
    notificar = cobrados.filter((u) => u !== uid);
  } else if (acao === "CANCELAR") {
    if (!souAutor && !admin) throw erro("permission-denied", "Só quem abriu a cobrança a cancela.");
    if (encerrada) throw erro("failed-precondition", "Esta cobrança já foi encerrada.");
    if (msg.length < 5) throw erro("invalid-argument", "Diga o motivo do cancelamento.");
    c.status = STATUS.CANCELADA;
    c.canceladaEm = agora;
    evento = novoEvento("CANCELADA", uid, nome, agora, {texto: msg});
    notificar = cobrados.filter((u) => u !== uid);
  } else {
    throw erro("invalid-argument", "Ação desconhecida.");
  }
  c.atualizadaEm = agora;
  return {cobranca: c, evento, notificar};
}

/* O que cada pessoa vê na própria caixa. `aguardaVoce` alimenta o contador do
   menu: para quem foi cobrado, a cobrança aberta; para quem cobrou, a que foi
   respondida (espera a sua conferência). */
function itemCaixa(c, uid) {
  const recebida = Object.prototype.hasOwnProperty.call(c.para || {}, uid);
  const papel = recebida ? "recebida" : "enviada";
  const aguarda = recebida ? c.status === STATUS.ABERTA : c.status === STATUS.RESPONDIDA;
  return {
    papel, status: c.status, titulo: c.titulo, prioridade: c.prioridade || "normal", prazo: c.prazo || "",
    deNome: (c.de && c.de.nome) || "", paraNomes: Object.keys(c.para || {}).map((u) => c.para[u].nome).join(", "),
    atualizadaEm: c.atualizadaEm, aguardaVoce: aguarda,
  };
}
/* Caminhos planos (nunca objeto aninhado no update -- ver CLAUDE.md) da caixa
   de todos os participantes. `naoLida` marca quem recebeu aviso agora. */
function caminhosCaixa(id, c, avisados) {
  const out = {};
  participantes(c).forEach((uid) => {
    const item = itemCaixa(c, uid);
    Object.keys(item).forEach((k) => { out["cobrancas_caixa/" + uid + "/" + id + "/" + k] = item[k]; });
    if ((avisados || []).indexOf(uid) !== -1) out["cobrancas_caixa/" + uid + "/" + id + "/naoLida"] = true;
  });
  return out;
}

/* E-mail de cada ação. Mesmo leiaute dos outros avisos (op_encerrada.js). */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[ch]));
}
function dataBr(iso) {
  if (!iso) return "sem prazo";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return d + "/" + m + "/" + a;
}
const CHAMADA = {
  CRIADA: (c) => c.de.nome + " cobrou você",
  RESPOSTA: (c, e) => e.nome + " respondeu",
  CONCLUIDA: (c, e) => e.nome + " concluiu",
  COBRADA_NOVAMENTE: (c) => c.de.nome + " cobrou de novo",
  REABERTA: (c, e) => e.nome + " reabriu",
  CANCELADA: (c, e) => e.nome + " cancelou",
};
function montarEmail(id, c, evento, baseUrl) {
  const url = (baseUrl || URL_BASE) + "cobrancas.html?id=" + encodeURIComponent(id);
  const chamada = (CHAMADA[evento.tipo] || CHAMADA.CRIADA)(c, evento);
  const urgente = c.prioridade === "urgente" ? "[URGENTE] " : c.prioridade === "alta" ? "[Alta] " : "";
  const assunto = urgente + "Cobrança: " + c.titulo + " — " + chamada;
  const linha = (rotulo, valor) => valor ? "<tr><td style=\"padding:4px 12px 4px 0;color:#667085\">" + rotulo + "</td><td style=\"padding:4px 0\">" + valor + "</td></tr>" : "";
  const corpo = "<div style=\"font-family:Segoe UI,Arial,sans-serif;color:#182230;max-width:620px\">" +
    "<p style=\"font-size:15px;margin:0 0 12px\"><b>" + esc(chamada) + "</b></p>" +
    "<h2 style=\"font-size:18px;margin:0 0 10px;color:#0a1c69\">" + esc(c.titulo) + "</h2>" +
    (evento.texto ? "<blockquote style=\"margin:0 0 14px;padding:10px 14px;background:#f2f4f7;border-left:3px solid #0a1c69;white-space:pre-wrap\">" + esc(evento.texto) + "</blockquote>" : "") +
    (evento.tipo === "CRIADA" && c.descricao ? "<p style=\"white-space:pre-wrap;margin:0 0 14px\">" + esc(c.descricao) + "</p>" : "") +
    "<table style=\"font-size:14px;border-collapse:collapse;margin-bottom:16px\">" +
    linha("Quem cobra", esc(c.de.nome)) +
    linha("Para", esc(Object.keys(c.para).map((u) => c.para[u].nome).join(", "))) +
    linha("Prazo", esc(dataBr(c.prazo))) +
    linha("Prioridade", esc(PRIORIDADES[c.prioridade] || "Normal")) +
    linha("Situação", esc(ROTULO_STATUS[c.status] || c.status)) +
    "</table>" +
    "<a href=\"" + esc(url) + "\" style=\"background:#0a1c69;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600\">Abrir a cobrança</a>" +
    "<p style=\"font-size:12px;color:#667085;margin-top:18px\">Responda pelo sistema (não por este e-mail): a conversa fica registrada na cobrança.</p></div>";
  return {assunto, corpo};
}

/* Endereços de quem vai ser avisado: o e-mail do perfil (usuarios/{uid}/email).
   Quem não tem e-mail válido ou está inativo entra em `semEmail` (a tela mostra). */
function enderecos(uids, usuarios) {
  const para = [];
  const semEmail = [];
  (uids || []).forEach((uid) => {
    const u = (usuarios || {})[uid];
    if (ativo(u) && emailValido(u.email)) { const e = u.email.trim().toLowerCase(); if (para.indexOf(e) === -1) para.push(e); }
    else semEmail.push(nomeDe(u, uid));
  });
  return {para, semEmail};
}

/* Serviço usado pela callable. Dependências injetadas para o teste no emulador:
     db: firebase-admin Database; enviarEmail(to[], assunto, html) -> Promise;
     agora(): ISO; baseUrl opcional. */
function criarServico({db, enviarEmail, agora = () => new Date().toISOString(), baseUrl}) {
  async function avisar(id, c, evento, eventoId, uids, usuarios) {
    const dest = enderecos(uids, usuarios);
    const ref = db.ref("cobrancas/" + id + "/emails/" + eventoId);
    if (!dest.para.length) {
      const sem = {status: "SEM_EMAIL", em: agora(), semEmail: dest.semEmail, uids: uids || []};
      await ref.set(sem);
      return sem;
    }
    try {
      const email = montarEmail(id, c, evento, baseUrl);
      await enviarEmail(dest.para, email.assunto, email.corpo);
      const ok = {status: "ENVIADO", em: agora(), para: dest.para, semEmail: dest.semEmail, uids: uids || []};
      await ref.set(ok);
      return ok;
    } catch (e) {
      const falha = {status: "ERRO", em: agora(), erro: String((e && e.message) || e).slice(0, 300), semEmail: dest.semEmail, uids: uids || []};
      await ref.set(falha).catch(() => null);
      return falha;
    }
  }

  async function executar(uid, dados) {
    const acao = String((dados || {}).acao || "");
    const usuarios = (await db.ref("usuarios").once("value")).val() || {};
    const perfil = usuarios[uid];
    if (!ativo(perfil)) throw erro("permission-denied", "Seu acesso não está ativo.");
    const quando = agora();

    if (acao === "CRIAR") {
      const plano = criar(dados, usuarios, uid, quando);
      const id = db.ref("cobrancas").push().key;
      const eventoId = db.ref("cobrancas/" + id + "/eventos").push().key;
      const c = plano.cobranca;
      const updates = caminhosCaixa(id, c, plano.notificar);
      Object.keys(c).forEach((k) => { updates["cobrancas/" + id + "/" + k] = c[k]; });
      updates["cobrancas/" + id + "/eventos/" + eventoId] = plano.evento;
      await db.ref().update(updates);
      const email = await avisar(id, c, plano.evento, eventoId, plano.notificar, usuarios);
      return {ok: true, id, status: c.status, email};
    }

    const id = String((dados || {}).id || "");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw erro("invalid-argument", "Cobrança inválida.");
    const ref = db.ref("cobrancas/" + id);

    if (acao === "REENVIAR_EMAIL") {
      const eventoId = String((dados || {}).eventoId || "");
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(eventoId)) throw erro("invalid-argument", "Aviso inválido.");
      const c = (await ref.once("value")).val();
      if (!c || !c.de) throw erro("not-found", "Cobrança não encontrada.");
      if (!participa(c, uid) && !eAdmin(perfil)) throw erro("permission-denied", "Você não participa desta cobrança.");
      const evento = (c.eventos || {})[eventoId];
      const anterior = (c.emails || {})[eventoId];
      if (!evento || !anterior) throw erro("not-found", "Aviso não encontrado.");
      if (anterior.status === "ENVIADO") throw erro("failed-precondition", "Este aviso já foi enviado por e-mail.");
      delete c.eventos;
      delete c.emails;
      const email = await avisar(id, c, evento, eventoId, anterior.uids || [], usuarios);
      return {ok: true, id, status: c.status, email};
    }

    // Transação só no nó da cobrança (pequeno): duas pessoas agindo ao mesmo
    // tempo não se sobrescrevem. Callback com null = cache vazio: devolve null
    // para o SDK buscar o servidor (nunca `return;`, ver CLAUDE.md).
    let plano = null;
    let falha = null;
    const eventoId = ref.child("eventos").push().key;
    const resultado = await ref.transaction((atual) => {
      plano = null;
      falha = null;
      if (!atual) return atual;
      try {
        const base = Object.assign({}, atual);
        delete base.eventos;
        delete base.emails;
        plano = aplicarAcao(base, acao, {uid, perfil}, dados, quando);
        const novo = Object.assign({}, atual, plano.cobranca);
        ["concluidaEm", "concluidaPor"].forEach((k) => { if (!(k in plano.cobranca)) delete novo[k]; });
        novo.eventos = Object.assign({}, atual.eventos || {}, {[eventoId]: plano.evento});
        return novo;
      } catch (e) { falha = e; return; }
    });
    if (falha) throw falha;
    if (!resultado.snapshot.exists() || !plano) throw erro("not-found", "Cobrança não encontrada.");
    if (!resultado.committed) throw erro("aborted", "A cobrança mudou. Recarregue e tente de novo.");
    const c = plano.cobranca;
    await db.ref().update(caminhosCaixa(id, c, plano.notificar));
    const email = plano.notificar.length ? await avisar(id, c, plano.evento, eventoId, plano.notificar, usuarios) : null;
    return {ok: true, id, status: c.status, email};
  }

  return {executar};
}

module.exports = {
  STATUS, ROTULO_STATUS, PRIORIDADES, LIMITES, URL_BASE,
  validarCriacao, criar, aplicarAcao, itemCaixa, caminhosCaixa, montarEmail, enderecos, criarServico,
};
