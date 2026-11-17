"use strict";
/* Relatório de Análise de PA por e-mail ao cliente (17/11/2026, pedido do Marlos).

   Callable `laudoEmailCliente`. Depois de concluído o laudo do lote (decisão gravada em
   estoque_lotes/{item}/{lote}/qualidade), a Qualidade encaminha o PDF ao cliente: a tela
   mostra os e-mails do cadastro, deixa acrescentar outros e manda o PDF gerado no navegador
   a partir do MESMO HTML da impressão (shared/laudo-cq.js + shared/laudo-pdf.js).

   O servidor:
   - confere perfil ativo com Qualidade ou ADM (role, funcoes ou modulos, como o registro de
     retrabalho: o caso Yasmin mostrou que olhar só o role trava quem é multi-função);
   - confere que o lote é de PA e que o laudo está CONCLUÍDO (aprovado ou reprovado; retido
     ou sem decisão não sai);
   - confere o anexo (é PDF, até 6 MB) e os destinatários (formato, no máximo 15);
   - reserva o envio em laudos_envios/{item}/{lote}/{requestId} (repetir o clique não manda
     duas vezes) e grava o resultado ali: ENVIADO ou ERRO, para quem, por quem, quando;
   - guarda no cliente o tamanho do logo usado (clientes/{k}/logoLaudoTamanho), para o
     próximo laudo sair igual -- a Qualidade não tem escrita no cadastro de clientes.

   Só GRAVA em laudos_envios/ e clientes/{k}/logoLaudoTamanho. Laudo, lote e estoque são
   apenas lidos (run_laudo_email_test.js confere os caminhos). */

const NO = "laudos_envios";
const CHAVE_OK = /^[^.#$/\[\]]{1,120}$/;
const REQ_OK = /^[A-Za-z0-9_-]{8,80}$/;
const EMAIL_OK = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const MAX_DEST = 15;
const MAX_PDF = 6 * 1024 * 1024;
const LOGO_MIN = 50, LOGO_MAX = 200;
const CONCLUIDAS = {LIBERADO_EXPEDICAO: "APROVADO", LIBERADO: "APROVADO", APROVADO_CONCESSAO: "APROVADO", REPROVADO: "REPROVADO"};

function erro(code, message) { return Object.assign(new Error(message), {code}); }
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function chave(v, rotulo) {
  const s = String(v == null ? "" : v);
  if (!CHAVE_OK.test(s) || s.trim() !== s) throw erro("invalid-argument", rotulo + " inválido.");
  return s;
}

function perfil(u) {
  const ativo = !!u && !!u.role && u.role !== "pending" && u.role !== "tv" && u.desativado !== true;
  const f = (u && u.funcoes) || {}, m = (u && u.modulos) || {};
  const admin = ativo && (u.role === "admin" || f.admin === true);
  const qualidade = ativo && (u.role === "qualidade" || f.qualidade === true || m.qualidade === true);
  return {ativo, pode: admin || qualidade};
}

/* Lista de destinatários: aceita array ou texto separado por vírgula/; ; minúsculas, sem
   repetição. E-mail malformado recusa o envio inteiro (melhor que mandar para metade). */
function destinatarios(v) {
  const brutos = (Array.isArray(v) ? v : String(v || "").split(/[;,\s]+/)).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);
  const vistos = [];
  brutos.forEach((e) => {
    if (!EMAIL_OK.test(e) || e.length > 200) throw erro("invalid-argument", "E-mail inválido: " + e.slice(0, 80));
    if (vistos.indexOf(e) < 0) vistos.push(e);
  });
  if (!vistos.length) throw erro("invalid-argument", "Informe ao menos um e-mail.");
  if (vistos.length > MAX_DEST) throw erro("invalid-argument", "No máximo " + MAX_DEST + " destinatários por envio.");
  return vistos;
}

function pdfDoBase64(b64) {
  const s = String(b64 || "").replace(/^data:application\/pdf;base64,/, "");
  if (!s || !/^[A-Za-z0-9+/=\s]+$/.test(s)) throw erro("invalid-argument", "Anexo inválido.");
  const buf = Buffer.from(s, "base64");
  if (buf.length < 100 || buf.slice(0, 5).toString("latin1") !== "%PDF-") throw erro("invalid-argument", "O anexo não é um PDF.");
  if (buf.length > MAX_PDF) throw erro("invalid-argument", "PDF maior que 6 MB.");
  return buf;
}

function nomeArquivo(v, lote) {
  const base = String(v || "").replace(/[\\/:*?"<>|\r\n]/g, "-").replace(/\s+/g, " ").trim().slice(0, 150) ||
    ("Relatório de análise - " + String(lote || "").replace(/\//g, "."));
  return /\.pdf$/i.test(base) ? base : base + ".pdf";
}

function logoTamanho(v) {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  if (!isFinite(n)) return null;
  return Math.min(LOGO_MAX, Math.max(LOGO_MIN, n));
}

/* Texto do e-mail (puro, testável). */
function montarEmail(d) {
  const lote = d.lote || "";
  const assunto = "Relatório de Análise – " + (d.produto || "Produto acabado") + " – Lote " + lote;
  const corpo =
    "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.5\">" +
    "<p>Prezados" + (d.cliente ? " da " + esc(d.cliente) : "") + ",</p>" +
    "<p>Segue em anexo o <b>Relatório de Análise – Produto Acabado</b> do lote abaixo:</p>" +
    "<table style=\"border-collapse:collapse;font-size:14px\">" +
    "<tr><td style=\"padding:2px 12px 2px 0;color:#6b7280\">Produto</td><td><b>" + esc(d.produto) + "</b></td></tr>" +
    (d.codigo ? "<tr><td style=\"padding:2px 12px 2px 0;color:#6b7280\">Código</td><td>" + esc(d.codigo) + "</td></tr>" : "") +
    "<tr><td style=\"padding:2px 12px 2px 0;color:#6b7280\">Lote</td><td><b>" + esc(lote) + "</b></td></tr>" +
    (d.conclusao ? "<tr><td style=\"padding:2px 12px 2px 0;color:#6b7280\">Conclusão</td><td><b>Produto " + esc(d.conclusao) + "</b></td></tr>" : "") +
    "</table>" +
    (d.mensagem ? "<p style=\"white-space:pre-wrap\">" + esc(d.mensagem) + "</p>" : "") +
    "<p>Em caso de dúvida, responda a este e-mail.</p>" +
    "<p>Atenciosamente,<br>Laboratório de Controle de Qualidade<br><b>Kuryos</b></p>" +
    "</div>";
  return {assunto, corpo};
}

function criarServico({db, enviarEmail, agora = () => new Date().toISOString()}) {
  const ler = async (p) => (await db.ref(p).once("value")).val();

  async function clienteKeyDoProduto(itemCodigo) {
    const produtos = (await ler("produtos")) || {};
    const alvo = String(itemCodigo || "").trim().toUpperCase();
    const k = Object.keys(produtos).find((x) => String((produtos[x] || {}).sku || "").trim().toUpperCase() === alvo);
    return k ? (produtos[k] || {}).clienteKey || null : null;
  }

  async function executar(uid, d) {
    d = d || {};
    const u = await ler("usuarios/" + uid);
    const p = perfil(u);
    if (!p.ativo || !p.pode) throw erro("permission-denied", "Só a Qualidade ou o ADM encaminham o laudo ao cliente.");

    const itemKey = chave(d.itemKey, "Item");
    const loteKey = chave(d.loteKey, "Lote");
    const requestId = String(d.requestId || "");
    if (!REQ_OK.test(requestId)) throw erro("invalid-argument", "Pedido inválido.");
    const para = destinatarios(d.para);
    const pdf = pdfDoBase64(d.pdfBase64);

    const lote = await ler("estoque_lotes/" + itemKey + "/" + loteKey);
    if (!lote) throw erro("not-found", "Lote não encontrado.");
    if (lote.itemTipo !== "produto") throw erro("failed-precondition", "Só o relatório de produto acabado é encaminhado ao cliente.");
    const q = lote.qualidade || {};
    const conclusao = CONCLUIDAS[q.decisao];
    if (!conclusao) throw erro("failed-precondition", "Conclua o laudo (aprovar ou reprovar) antes de encaminhar ao cliente.");

    const ref = db.ref(NO + "/" + itemKey + "/" + loteKey + "/" + requestId);
    const reserva = await ref.transaction((atual) => {
      if (atual) return; // já enviado ou enviando: não repete
      return {status: "ENVIANDO", em: agora(), porUid: uid};
    });
    if (!reserva.committed) {
      const atual = reserva.snapshot && reserva.snapshot.val();
      return {ok: true, repetido: true, status: atual && atual.status || null};
    }

    const produto = lote.itemNome || itemKey;
    const loteTexto = lote.loteOrigem || loteKey;
    const email = montarEmail({produto, codigo: lote.itemCodigo || "", lote: loteTexto, conclusao,
      cliente: String(d.clienteNome || "").slice(0, 120), mensagem: String(d.mensagem || "").slice(0, 2000)});
    const arquivo = nomeArquivo(d.nomeArquivo, loteTexto);
    const autor = (u && u.nome) || uid;
    const base = {porUid: uid, por: autor, para, assunto: email.assunto, arquivo, bytes: pdf.length,
      decisao: q.decisao, lote: loteTexto, produto};
    try {
      await enviarEmail(para, email.assunto, email.corpo, {html: true, anexos: [{nome: arquivo, tipo: "application/pdf", conteudo: pdf}]});
    } catch (e) {
      await ref.set(Object.assign({}, base, {status: "ERRO", em: agora(), erro: String(e && e.message || e).slice(0, 400)})).catch(() => null);
      throw erro("internal", "Falha no envio do e-mail: " + String(e && e.message || e).slice(0, 200));
    }
    const ok = Object.assign({}, base, {status: "ENVIADO", em: agora()});
    await ref.set(ok);

    // Tamanho do logo do cliente: best-effort (o e-mail já saiu).
    const tam = logoTamanho(d.logoTamanho);
    if (tam != null) {
      try {
        const cliKey = await clienteKeyDoProduto(lote.itemCodigo || d.itemCodigo || itemKey);
        if (cliKey && CHAVE_OK.test(cliKey) && (await ler("clientes/" + cliKey + "/nome")) != null) {
          await db.ref("clientes/" + cliKey + "/logoLaudoTamanho").set(tam === 100 ? null : tam);
        }
      } catch (e) { /* não desfaz o envio */ }
    }
    return {ok: true, status: "ENVIADO", para, em: ok.em};
  }

  return {executar};
}

module.exports = {criarServico, destinatarios, pdfDoBase64, montarEmail, nomeArquivo, logoTamanho, perfil, NO, MAX_DEST};
