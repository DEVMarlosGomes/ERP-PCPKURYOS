/* Saldo de insumo na emissão de OP (OP-01 e OP-02, reunião 28/10/2026, D-03).
 *
 * Chave config/emitirOp/bloquearSemSaldo, DESLIGADA por padrão: até o Dia D o
 * saldo não serve para decidir (CLAUDE.md), então desligada tudo continua como
 * era -- o saldo é só referência. Ligada, a OP não sai se algum insumo com
 * controle de estoque tiver saldo do DONO CERTO menor que o consumo; o ADM
 * libera com motivo, que fica gravado na OP (ops/{lote}/liberacaoSemSaldo).
 *
 * Saldo do dono certo (estoque tem dono, shared/propriedade-estoque.js):
 *  - Kuryos (geral)  = total − partes dos clientes;
 *  - cliente c       = porCliente/{c}.
 * O que a OP pode usar segue a regra de consumo do sistema (aplicarMovimentoAgregado,
 * loteUtilizavelPor): material da Kuryos serve a qualquer OP; material do cliente
 * só às OPs DELE. Logo:
 *  - OP de produto do cliente c -> geral + porCliente/{c} (= total − partes dos OUTROS clientes);
 *  - OP sem cliente            -> só o geral.
 * O cliente da OP sai do SKU (clienteKeyDoSku), nunca do nome.
 * Material sem controle de estoque (controlaEstoque === false, ex.: água) fica fora.
 * Função pura. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./propriedade-estoque'));
  else root.SaldoEmissaoOp = factory(root.PropriedadeEstoque);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Prop) {
  'use strict';

  var MOTIVO_MINIMO = 10;
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function arred(v) { return Math.round(v * 1000) / 1000; }
  // Mesma chave de shared/utils.js:sanitizeKey (o nó estoque/ e materiais/ usam ela).
  function chave(codigo) { return String(codigo || '').trim().replace(/[./[\]#$]/g, '-').replace(/\s+/g, '_'); }

  function material(codigo, materiais) {
    var ms = materiais || {}, m = ms[chave(codigo)];
    if (m && m.mpCodigo === codigo) return m;
    var k = Object.keys(ms).filter(function(x) { return ms[x] && ms[x].mpCodigo === codigo; })[0];
    return k ? ms[k] : m || null;
  }
  // Igual a materialSemControleEstoque (shared/utils.js).
  function semControle(codigo, materiais) {
    var m = codigo ? material(codigo, materiais) : null;
    return !!(m && m.controlaEstoque === false);
  }
  // Igual a saldoEstoqueDoMaterial da tela: chave do código, ou o registro que aponta o código.
  function registroEstoque(codigo, estoque) {
    var es = estoque || {};
    if (es[chave(codigo)]) return es[chave(codigo)];
    var k = Object.keys(es).filter(function(x) { var e = es[x]; return e && (e.materialCodigo === codigo || e.mpCodigo === codigo); })[0];
    return k ? es[k] : null;
  }

  /* Saldo que uma OP do cliente `clienteKey` (null = sem cliente) pode usar. */
  function saldoParaOp(estoqueItem, clienteKey) {
    if (!estoqueItem || !isFinite(parseFloat(estoqueItem.saldoAtual))) {
      return {registrado: false, total: 0, geral: 0, parteCliente: 0, disponivel: 0, unidade: (estoqueItem && estoqueItem.unidade) || ''};
    }
    var d = Prop.saldoPorDono(estoqueItem);
    var parte = clienteKey ? num(d.porCliente[clienteKey]) : 0;
    return {registrado: true, total: d.total, geral: d.geral, parteCliente: arred(parte), disponivel: arred(d.geral + parte), unidade: estoqueItem.unidade || ''};
  }

  /* itens: [{mpCodigo, mpNome, quantidade, unidade}] (materiaisConsumo da OP).
     Soma o consumo do mesmo material (pode aparecer na fórmula e no BOM) e
     compara com o saldo do dono certo. Devolve as faltas, na ordem dos itens. */
  function verificarSaldoEmissao(ctx) {
    var c = ctx || {}, porCodigo = {}, ordem = [];
    (c.itens || []).forEach(function(it) {
      if (!it || !it.mpCodigo || semControle(it.mpCodigo, c.materiais)) return;
      if (!porCodigo[it.mpCodigo]) { porCodigo[it.mpCodigo] = {mpCodigo: it.mpCodigo, mpNome: it.mpNome || '', unidade: it.unidade || '', necessario: 0}; ordem.push(it.mpCodigo); }
      porCodigo[it.mpCodigo].necessario += num(it.quantidade);
    });
    var faltas = [];
    ordem.forEach(function(cod) {
      var x = porCodigo[cod], s = saldoParaOp(registroEstoque(cod, c.estoque), c.clienteKey || null);
      x.necessario = arred(x.necessario);
      if (s.disponivel < x.necessario) {
        faltas.push({mpCodigo: cod, mpNome: x.mpNome, unidade: x.unidade || s.unidade, necessario: x.necessario, saldo: s.disponivel,
          registrado: s.registrado, geral: s.geral, parteCliente: s.parteCliente});
      }
    });
    return {ok: !faltas.length, faltas: faltas, conferidos: ordem.length};
  }

  function fmt(n) { return Number(n).toLocaleString('pt-BR', {maximumFractionDigits: 3}); }
  /* "Sem saldo para emitir a OP: EP-1 — FRASCO: necessário 1.000 un, saldo 200 un; ..." */
  function mensagemFaltas(faltas) {
    return 'Sem saldo de insumo para emitir a OP: ' + (faltas || []).map(function(f) {
      return f.mpCodigo + (f.mpNome ? ' — ' + f.mpNome : '') + ': necessário ' + fmt(f.necessario) + ' ' + f.unidade +
        ', saldo ' + fmt(f.saldo) + ' ' + f.unidade + (f.registrado ? '' : ' (sem registro de estoque)');
    }).join('; ') + '.';
  }

  /* Decisão da emissão.
     ctx: {bloquear (a chave), verificacao (verificarSaldoEmissao), ehAdm, motivo (liberação do ADM)}
     -> {pode, faltas, mensagem, liberacao?}  Chave desligada: sempre pode (como hoje). */
  function decidirEmissao(ctx) {
    var c = ctx || {}, v = c.verificacao || {ok: true, faltas: []};
    if (c.bloquear !== true || v.ok) return {pode: true, faltas: v.faltas || [], mensagem: ''};
    var msg = mensagemFaltas(v.faltas);
    if (!c.ehAdm) return {pode: false, faltas: v.faltas, mensagem: msg + ' Reponha o estoque, substitua o insumo, ou peça a um administrador para liberar a emissão com motivo.'};
    if (c.motivo == null) return {pode: false, precisaMotivo: true, faltas: v.faltas, mensagem: msg};
    var m = validarMotivo(c.motivo);
    if (!m.ok) return {pode: false, precisaMotivo: true, faltas: v.faltas, mensagem: m.motivo};
    return {pode: true, faltas: v.faltas, mensagem: '', liberacao: {motivo: m.texto, faltas: v.faltas}};
  }
  function validarMotivo(txt) {
    var t = String(txt == null ? '' : txt).trim();
    if (t.length < MOTIVO_MINIMO) return {ok: false, motivo: 'Explique o motivo da liberação (mínimo ' + MOTIVO_MINIMO + ' caracteres): ele fica gravado na OP.'};
    return {ok: true, texto: t.slice(0, 500)};
  }

  return {MOTIVO_MINIMO: MOTIVO_MINIMO, semControle: semControle, registroEstoque: registroEstoque, saldoParaOp: saldoParaOp,
    verificarSaldoEmissao: verificarSaldoEmissao, mensagemFaltas: mensagemFaltas, decidirEmissao: decidirEmissao, validarMotivo: validarMotivo};
});
