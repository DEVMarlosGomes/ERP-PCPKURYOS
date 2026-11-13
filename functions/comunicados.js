"use strict";
/* Comunicados do sistema por e-mail (13/11/2026). Primeiro: boas-vindas ao Kuryos ERP.

   Pedido do Marlos: "dispare uma mensagem de boas vindas para cada email, formalize
   boas vindas ao novo KuryosERP". O envio é do SERVIDOR (as credenciais do Resend ou do
   Outlook ficam só na VPS) e só o ADM dispara, depois de ver a prévia.

   - Um e-mail POR PESSOA (ninguém vê o endereço do outro).
   - Cada envio fica em comunicados/{id}/envios/{uid} (ENVIADO ou ERRO, com o motivo).
     Mandar de novo só manda para quem ainda não recebeu: nunca duplica.
   - Falha de uma pessoa não para as outras.
   - Trava comunicados/{id}/emAndamento: dois cliques (ou dois ADMs) não disparam juntos;
     trava esquecida há mais de 15 minutos não bloqueia.
   - Destinatários: perfis ativos (não pendente, não TV, não desativado) com e-mail válido,
     sem repetir endereço. Quem ficou sem e-mail aparece na prévia. */

const ID_BOAS_VINDAS = "boas-vindas-kuryos-erp";
const URL_BASE = "https://kuryoserp.com.br/";
const TRAVA_MINUTOS = 15;
// Domínios esperados: o da empresa e provedores comuns. Outro domínio vem desmarcado na prévia,
// com aviso: pode ser conta de teste ou digitação (ex.: kuryos.com sem .br) e o e-mail iria
// para quem não deveria.
const DOMINIOS_ESPERADOS = ["kuryos.com.br", "gmail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "yahoo.com.br", "icloud.com", "uol.com.br", "bol.com.br", "terra.com.br"];
function dominioIncomum(email) { return DOMINIOS_ESPERADOS.indexOf(String(email).split("@")[1] || "") < 0; }

function erro(code, message) { return Object.assign(new Error(message), {code}); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[c])); }
function ativo(u) { return !!u && !!u.role && u.role !== "pending" && u.role !== "tv" && u.desativado !== true; }
function emailValido(e) { return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()); }
function eAdmin(u) { return !!u && u.desativado !== true && (u.role === "admin" || !!(u.funcoes && u.funcoes.admin === true)); }
function nomeDe(u, uid) { return (u && (u.nome || u.email)) || uid; }
function primeiroNome(n) { return String(n || "").trim().split(/\s+/)[0] || ""; }
function pausa(ms) { return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve(); }

/* O texto do comunicado. pessoa: {nome, email}. */
function montarBoasVindas(pessoa, baseUrl) {
  const url = baseUrl || URL_BASE, nome = primeiroNome(pessoa && pessoa.nome);
  const p = (t) => "<p style=\"margin:0 0 14px;line-height:1.55\">" + t + "</p>";
  const item = (t) => "<li style=\"margin:0 0 6px\">" + t + "</li>";
  const assunto = "Boas-vindas ao Kuryos ERP";
  const corpo = "<div style=\"font-family:Segoe UI,Arial,sans-serif;color:#182230;max-width:620px;font-size:15px\">" +
    "<h1 style=\"font-size:21px;margin:0 0 16px;color:#0a1c69\">Boas-vindas ao Kuryos ERP</h1>" +
    p((nome ? "Olá, " + esc(nome) + "." : "Olá.")) +
    p("A partir de agora, a rotina da Kuryos passa a ser registrada no <b>Kuryos ERP</b>, o sistema de gestão da empresa. " +
      "Pedidos, planejamento e ordens de produção, estoque, compras, qualidade, expedição e financeiro ficam no mesmo lugar, " +
      "com as informações de cada setor ligadas às dos outros.") +
    p("<b>Como acessar</b>") +
    "<ul style=\"margin:0 0 14px;padding-left:20px;line-height:1.5\">" +
    item("Endereço: <a href=\"" + esc(url) + "\" style=\"color:#0a1c69\">" + esc(url.replace(/^https?:\/\//, "").replace(/\/$/, "")) + "</a>") +
    item("Usuário: <b>" + esc(String((pessoa && pessoa.email) || "").trim().toLowerCase()) + "</b>") +
    item("Se ainda não tem senha ou não se lembra dela, use <b>Esqueci minha senha</b> na tela de entrada.") +
    "</ul>" +
    p("<b>O que muda no dia a dia</b>") +
    "<ul style=\"margin:0 0 14px;padding-left:20px;line-height:1.5\">" +
    item("Cada pessoa vê as telas da sua função, organizadas no menu lateral.") +
    item("Avisos e <b>cobranças internas</b> chegam no próprio sistema e por este e-mail. Responda pelo sistema: a conversa fica registrada.") +
    item("O que for lançado no sistema passa a ser a informação oficial da empresa.") +
    "</ul>" +
    p("Em caso de dúvida ou dificuldade de acesso, fale com o administrador do sistema.") +
    p("Bom trabalho!<br><b>Kuryos</b>") +
    "<a href=\"" + esc(url) + "\" style=\"background:#0a1c69;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600\">Acessar o Kuryos ERP</a>" +
    "<p style=\"font-size:12px;color:#667085;margin-top:20px\">Mensagem enviada pelo Kuryos ERP. Não é preciso responder a este e-mail.</p></div>";
  return {assunto, corpo};
}

/* Quem recebe: [{uid, nome, email}] por ordem de e-mail; semEmail: nomes. */
function destinatarios(usuarios) {
  const para = [], vistos = {}, semEmail = [];
  Object.keys(usuarios || {}).forEach((uid) => {
    const u = usuarios[uid];
    if (!ativo(u)) return;
    if (!emailValido(u.email)) { semEmail.push(nomeDe(u, uid)); return; }
    const e = u.email.trim().toLowerCase();
    if (vistos[e]) return;
    vistos[e] = true;
    para.push({uid, nome: nomeDe(u, uid), email: e});
  });
  para.sort((a, b) => a.email.localeCompare(b.email));
  return {para, semEmail};
}

/* db: firebase-admin Database; enviarEmail(to[], assunto, html) -> Promise;
   provedor() -> "RESEND" | "GRAPH"; pausaMs: intervalo entre envios (limite do provedor). */
function criarServico({db, enviarEmail, provedor, agora = () => new Date().toISOString(), baseUrl, pausaMs = 600}) {
  const base = "comunicados/" + ID_BOAS_VINDAS;
  async function contexto(uid) {
    const usuarios = (await db.ref("usuarios").once("value")).val() || {};
    const quem = usuarios[uid];
    if (!eAdmin(quem)) throw erro("permission-denied", "Só o administrador envia comunicados.");
    const envios = (await db.ref(base + "/envios").once("value")).val() || {};
    return {usuarios, quem, envios, dest: destinatarios(usuarios)};
  }
  async function previa(uid) {
    const c = await contexto(uid);
    const pendentes = c.dest.para.filter((p) => !(c.envios[p.uid] && c.envios[p.uid].status === "ENVIADO"));
    const amostra = montarBoasVindas({nome: c.quem.nome, email: c.quem.email}, baseUrl);
    return {provedor: provedor ? provedor() : null, total: c.dest.para.length, pendentes: pendentes.length,
      destinatarios: c.dest.para.map((p) => ({uid: p.uid, nome: p.nome, email: p.email, alerta: dominioIncomum(p.email), situacao: (c.envios[p.uid] || {}).status || "PENDENTE", erro: (c.envios[p.uid] || {}).erro || null})),
      semEmail: c.dest.semEmail, assunto: amostra.assunto, amostra: amostra.corpo};
  }
  async function enviar(uid, excluir) {
    const c = await contexto(uid), quando = agora(), fora = {};
    (Array.isArray(excluir) ? excluir : []).slice(0, 500).forEach((k) => { fora[String(k)] = true; });
    const trava = await db.ref(base + "/emAndamento").transaction((atual) => {
      if (atual && atual.desde && (Date.parse(quando) - Date.parse(atual.desde)) < TRAVA_MINUTOS * 60000) return undefined;
      return {desde: quando, por: nomeDe(c.quem, uid)};
    });
    if (!trava.committed) throw erro("failed-precondition", "Já há um envio deste comunicado em andamento. Aguarde alguns minutos.");
    let enviados = 0, erros = 0, jaEnviados = 0, excluidos = 0;
    try {
      for (const p of c.dest.para) {
        if (c.envios[p.uid] && c.envios[p.uid].status === "ENVIADO") { jaEnviados++; continue; }
        if (fora[p.uid]) { excluidos++; continue; }
        const m = montarBoasVindas(p, baseUrl);
        try {
          await enviarEmail([p.email], m.assunto, m.corpo);
          await db.ref(base + "/envios/" + p.uid).set({status: "ENVIADO", email: p.email, nome: p.nome, em: agora(), provedor: provedor ? provedor() : null});
          enviados++;
        } catch (e) {
          await db.ref(base + "/envios/" + p.uid).set({status: "ERRO", email: p.email, nome: p.nome, em: agora(), erro: String((e && e.message) || e).slice(0, 300)});
          erros++;
        }
        await pausa(pausaMs);
      }
      await db.ref(base + "/ultimoEnvio").set({em: agora(), por: nomeDe(c.quem, uid), porUid: uid, enviados, erros, jaEnviados, excluidos, semEmail: c.dest.semEmail.length});
    } finally {
      await db.ref(base + "/emAndamento").set(null);
    }
    return {ok: true, enviados, erros, jaEnviados, excluidos, semEmail: c.dest.semEmail};
  }
  return {
    async executar(uid, dados) {
      const acao = (dados || {}).acao;
      if (acao === "PREVIA") return previa(uid);
      if (acao === "ENVIAR") return enviar(uid, (dados || {}).excluir);
      throw erro("invalid-argument", "Ação desconhecida.");
    },
  };
}

module.exports = {ID_BOAS_VINDAS, URL_BASE, montarBoasVindas, destinatarios, criarServico};
