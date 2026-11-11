'use strict';
/* E-mails automáticos pelo Resend (11/11/2026): escolha do provedor pela configuração,
   corpo da requisição (anexo PDF, cópia, resposta), erro do provedor sem vazar a chave,
   e a ligação no servidor (avisos pelo Resend; rascunho de cotação só no Graph). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const E = require('./functions/email_envio');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

(async () => {
  // ── Provedor ──────────────────────────────────────────────────────────────
  eq(E.provedorEmail({}), 'GRAPH', 'sem chave: continua no Outlook (Graph)');
  eq(E.provedorEmail({RESEND_API_KEY: '<CHAVE_RESEND_re_...>'}), 'GRAPH', 'modelo do .env não conta como chave');
  eq(E.provedorEmail({RESEND_API_KEY: 'pendente'}), 'GRAPH', '"pendente" não conta como chave');
  eq(E.provedorEmail({RESEND_API_KEY: ' re_abc123 '}), 'RESEND');
  const cfg = E.configResend({RESEND_API_KEY: 're_abc123', RESEND_FROM: 'Kuryos ERP <nao-responder@kuryoserp.com.br>', RESEND_REPLY_TO: 'financeiro@kuryos.com.br'});
  eq([cfg.chave, cfg.responderPara], ['re_abc123', 'financeiro@kuryos.com.br']);

  // ── Corpo da requisição ───────────────────────────────────────────────────
  const pdf = Buffer.from('%PDF-1.4 teste');
  let m = E.montarResend(cfg, ['fin@k.com', 'dir@k.com'], 'Faturamento da carga', '<b>oi</b>', {html: true, cc: ['dir@k.com', 'ger@k.com'], anexos: [{nome: 'carga.pdf', tipo: 'application/pdf', conteudo: pdf}]});
  eq(m.from, 'Kuryos ERP <nao-responder@kuryoserp.com.br>');
  eq([m.to, m.cc, m.reply_to], [['fin@k.com', 'dir@k.com'], ['ger@k.com'], ['financeiro@kuryos.com.br']], 'cópia sem repetir quem já está no para');
  eq([m.html, m.text], ['<b>oi</b>', undefined], 'HTML quando pedido');
  eq(m.attachments, [{filename: 'carga.pdf', content: pdf.toString('base64'), content_type: 'application/pdf'}], 'PDF em base64');
  m = E.montarResend(cfg, 'a@k.com; b@k.com', 'Resumo', 'texto puro', {});
  eq([m.to, m.text, m.html, m.cc, m.attachments], [['a@k.com', 'b@k.com'], 'texto puro', undefined, undefined, undefined], 'texto simples; lista aceita ";"');
  assert.throws(() => E.montarResend({chave: 'x', de: ''}, ['a@k.com'], 's', 'c'), /RESEND_FROM/); n++;
  assert.throws(() => E.montarResend(cfg, Array.from({length: 51}, (_, i) => i + '@k.com'), 's', 'c'), /máximo 50/); n++;

  // ── Envio (fetch simulado) ────────────────────────────────────────────────
  const chamadas = [];
  const fetchOk = async (url, init) => { chamadas.push({url, init}); return {ok: true, status: 200, text: async () => '{"id":"email_123"}'}; };
  const r = await E.enviarResend(cfg, ['fin@k.com'], 'Assunto', 'corpo', {html: true}, fetchOk);
  eq(r, {ok: true, id: 'email_123'});
  eq(chamadas[0].url, 'https://api.resend.com/emails');
  eq(chamadas[0].init.headers.Authorization, 'Bearer re_abc123');
  eq(JSON.parse(chamadas[0].init.body).subject, 'Assunto');
  const fetchErro = async () => ({ok: false, status: 403, text: async () => '{"statusCode":403,"message":"The kuryoserp.com.br domain is not verified.","name":"validation_error"}'});
  await assert.rejects(E.enviarResend(cfg, ['fin@k.com'], 's', 'c', {}, fetchErro), (e) => /Resend \(403\): The kuryoserp\.com\.br domain is not verified/.test(e.message) && !/re_abc123/.test(e.message)); n++;
  const fetchTexto = async () => ({ok: false, status: 500, text: async () => 'Bad Gateway'});
  await assert.rejects(E.enviarResend(cfg, ['fin@k.com'], 's', 'c', {}, fetchTexto), /Resend \(500\): Bad Gateway/); n++;

  // ── Ligação no servidor ───────────────────────────────────────────────────
  const idx = fs.readFileSync('functions/index.js', 'utf8');
  const chamadasGraph = (idx.match(/sendMailViaGraph\(/g) || []).length;
  eq(chamadasGraph, 2, 'sendMailViaGraph só na definição e como alternativa (sem chave do Resend)');
  ok((idx.match(/enviarEmailSistema\(/g) || []).length >= 13, 'avisos passam pela função que escolhe o provedor');
  ok(/async function enviarEmailSistema[\s\S]{0,200}EmailEnvio\.configResend\(process\.env\)[\s\S]{0,120}return sendMailViaGraph/.test(idx), 'sem chave, cai no Graph');
  const rascunho = idx.slice(idx.indexOf('exports.criarRascunhoCotacao'), idx.indexOf('exports.criarRascunhoCotacao') + 6000);
  ok(/graph\.microsoft\.com\/v1\.0\/users\/[\s\S]*\/messages/.test(rascunho) && !/enviarEmailSistema|EmailEnvio/.test(rascunho), 'rascunho de cotação continua só no Outlook (Graph)');
  const compose = fs.readFileSync('compose.production.yml', 'utf8');
  ok(['RESEND_API_KEY', 'RESEND_FROM', 'RESEND_REPLY_TO'].every((v) => compose.includes(v + ': ${' + v + ':-}')), 'compose repassa as variáveis ao servidor');
  const exemplo = fs.readFileSync('.env.production.example', 'utf8');
  ok(/^RESEND_API_KEY=<CHAVE_RESEND_re_\.\.\.>$/m.test(exemplo) && /^RESEND_FROM="Kuryos ERP <nao-responder@kuryoserp\.com\.br>"$/m.test(exemplo), 'modelo do .env documentado (sem chave real)');
  console.log('e-mail pelo Resend: ' + n + ' asserções OK');
})().catch((e) => { console.error(e); process.exit(1); });
