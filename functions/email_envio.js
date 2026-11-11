"use strict";
/* Envio dos e-mails automáticos do sistema (11/11/2026).
 *
 * Avisos (faturamento com PDF, OP encerrada, pesagem, resumos, alertas) saem pelo
 * RESEND quando RESEND_API_KEY está configurada; sem ela, continuam pelo Microsoft
 * Graph (Outlook da Kuryos), como antes. A virada é só preencher a chave na VPS.
 * O RASCUNHO de cotação de Compras NÃO passa por aqui: ele é criado dentro do
 * Outlook (Graph) para alguém revisar e mandar -- o Resend só envia.
 *
 * Variáveis (VPS, /opt/kuryos/config/.env.production):
 *   RESEND_API_KEY   chave da conta Resend (re_...)
 *   RESEND_FROM      remetente num domínio verificado no Resend,
 *                    ex.: "Kuryos ERP <nao-responder@kuryoserp.com.br>"
 *   RESEND_REPLY_TO  opcional: para onde vão as respostas (caixa real) */

const RESEND_URL = "https://api.resend.com/emails";
const MAX_DESTINATARIOS = 50; // limite do Resend por envio (to + cc)

function configResend(env) {
  const e = env || process.env;
  const chave = String(e.RESEND_API_KEY || "").trim();
  if (!chave || /^<.*>$/.test(chave) || chave === "pendente") return null;
  return {chave, de: String(e.RESEND_FROM || "").trim(), responderPara: String(e.RESEND_REPLY_TO || "").trim()};
}
function provedorEmail(env) { return configResend(env) ? "RESEND" : "GRAPH"; }
function lista(v) { return (Array.isArray(v) ? v : String(v || "").split(/[;,]/)).map((x) => String(x || "").trim()).filter(Boolean); }

/* Corpo da requisição ao Resend (puro, testável). Mesma assinatura do envio antigo:
   (para, assunto, corpo, {html, cc, anexos: [{nome, tipo, conteudo: Buffer}]}). */
function montarResend(cfg, para, assunto, corpo, opts) {
  const o = opts || {};
  if (!cfg.de) throw new Error("RESEND_FROM não configurado: informe o remetente (domínio verificado no Resend).");
  const to = lista(para), cc = lista(o.cc).filter((x) => to.indexOf(x) < 0);
  if (to.length + cc.length > MAX_DESTINATARIOS) throw new Error("Destinatários demais para um envio (máximo " + MAX_DESTINATARIOS + ").");
  const msg = {from: cfg.de, to, subject: String(assunto || "").slice(0, 900)};
  if (cc.length) msg.cc = cc;
  if (cfg.responderPara) msg.reply_to = lista(cfg.responderPara);
  if (o.html) msg.html = String(corpo || ""); else msg.text = String(corpo || "");
  const anexos = (o.anexos || []).map((a) => ({filename: a.nome, content: Buffer.isBuffer(a.conteudo) ? a.conteudo.toString("base64") : String(a.conteudo || ""),
    ...(a.tipo ? {content_type: a.tipo} : {})}));
  if (anexos.length) msg.attachments = anexos;
  return msg;
}

/* Envia pelo Resend. Devolve {ok, id}. Erro do provedor vira exceção com o motivo
   que o Resend devolveu (sem a chave). */
async function enviarResend(cfg, para, assunto, corpo, opts, fetchImpl) {
  const f = fetchImpl || globalThis.fetch;
  const corpoReq = montarResend(cfg, para, assunto, corpo, opts);
  const resp = await f(RESEND_URL, {
    method: "POST",
    headers: {"Authorization": "Bearer " + cfg.chave, "Content-Type": "application/json"},
    body: JSON.stringify(corpoReq),
  });
  const texto = await resp.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch (e) { json = null; }
  if (!resp.ok) {
    const motivo = (json && (json.message || json.error || json.name)) || texto || ("HTTP " + resp.status);
    throw new Error("Falha ao enviar e-mail via Resend (" + resp.status + "): " + String(motivo).slice(0, 300));
  }
  return {ok: true, id: json && json.id || null};
}

module.exports = {configResend, provedorEmail, montarResend, enviarResend, RESEND_URL, MAX_DESTINATARIOS};
