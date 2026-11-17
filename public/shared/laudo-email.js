/* ══════════════════════════════════════════════════════════════════════
   DESTINATÁRIOS DO LAUDO AO CLIENTE (17/11/2026)

   Quem recebe o Relatório de Análise de PA: os contatos do cadastro do
   cliente que têm e-mail (Cadastros › Clientes › Contatos). Vêm marcados os
   de Técnico/Desenvolvimento, Comercial e Compras -- quem costuma pedir o
   laudo; Financeiro e Logística aparecem, desmarcados. Sem nenhum desses, vêm
   todos marcados. A pessoa pode acrescentar outros e-mails à mão.

   Funções puras (sem DOM, sem Firebase): testadas em run_laudo_email_test.js.
   ══════════════════════════════════════════════════════════════════════ */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./contatos-cliente.js'));
  else root.LaudoEmail = factory(root.ContatosCliente);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(ContatosCliente) {
  'use strict';

  var EMAIL_OK = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
  var MAX_DEST = 15;
  var AREAS_LAUDO = ['TECNICO', 'COMERCIAL', 'COMPRAS'];
  var CONCLUIDAS = {LIBERADO_EXPEDICAO: 'APROVADO', LIBERADO: 'APROVADO', APROVADO_CONCESSAO: 'APROVADO', REPROVADO: 'REPROVADO'};

  function emailValido(e) { return EMAIL_OK.test(String(e || '').trim()); }

  /* [{email, nome, rotulo, marcado}] sem e-mail repetido. */
  function contatosDoCliente(cliente) {
    var lista = ContatosCliente ? ContatosCliente.lista(cliente || {}) : [];
    var vistos = {};
    var out = [];
    lista.forEach(function(p) {
      var email = String(p.email || '').trim().toLowerCase();
      if (!emailValido(email) || vistos[email]) return;
      vistos[email] = true;
      var areas = p.areas || [];
      out.push({email: email, nome: p.nome || '', rotulo: ContatosCliente.rotulo(p),
        marcado: areas.some(function(a) { return AREAS_LAUDO.indexOf(a) >= 0; })});
    });
    if (out.length && !out.some(function(c) { return c.marcado; })) out.forEach(function(c) { c.marcado = true; });
    return out;
  }

  /* Texto digitado ("a@x.com; b@y.com") -> {validos, invalidos}. */
  function separarEmails(texto) {
    var validos = [], invalidos = [];
    String(texto || '').split(/[;,\s]+/).map(function(x) { return x.trim().toLowerCase(); }).filter(Boolean).forEach(function(e) {
      if (!emailValido(e)) { if (invalidos.indexOf(e) < 0) invalidos.push(e); }
      else if (validos.indexOf(e) < 0) validos.push(e);
    });
    return {validos: validos, invalidos: invalidos};
  }

  /* Junta marcados do cadastro + extras. Devolve {para, erro}. */
  function destinatarios(marcados, extrasTexto) {
    var ex = separarEmails(extrasTexto);
    if (ex.invalidos.length) return {para: [], erro: 'Confira o e-mail: ' + ex.invalidos.join(', ')};
    var para = [];
    (marcados || []).concat(ex.validos).forEach(function(e) {
      e = String(e || '').trim().toLowerCase();
      if (e && para.indexOf(e) < 0) para.push(e);
    });
    if (!para.length) return {para: [], erro: 'Escolha ao menos um destinatário.'};
    if (para.length > MAX_DEST) return {para: [], erro: 'No máximo ' + MAX_DEST + ' destinatários por envio.'};
    return {para: para, erro: null};
  }

  function conclusao(decisao) { return CONCLUIDAS[decisao] || null; }

  /* Envios anteriores (laudos_envios/{item}/{lote}) do mais novo ao mais velho. */
  function historico(envios) {
    return Object.keys(envios || {}).map(function(k) { return Object.assign({id: k}, envios[k]); })
      .filter(function(e) { return e && e.em; })
      .sort(function(a, b) { return a.em < b.em ? 1 : a.em > b.em ? -1 : 0; });
  }

  return {contatosDoCliente: contatosDoCliente, separarEmails: separarEmails, destinatarios: destinatarios,
    conclusao: conclusao, historico: historico, emailValido: emailValido, MAX_DEST: MAX_DEST};
});
