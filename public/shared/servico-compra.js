/* Linha de SERVIÇO na compra (16/11/2026).

   Pedido do usuário: Manutenção pede orçamento de conserto, assistência
   técnica ou calibração externa pelo próprio ativo. Serviço não é material:
   não tem SKU, não entra no estoque e não passa pelo recebimento físico da
   Logística -- o servidor recusa item sem SKU interno
   (functions/recebimento.js:validarEPrepararLinhas), e é certo que recuse.

   O caminho do serviço:
     SC (linha tipoItem SERVICO, descrição livre) -> cotação -> PC
     -> Compras ATESTA que foi prestado (qtdRecebida = qtd, com quem/quando)
   O status do PC é recalculado pela MESMA regra do servidor
   (statusPedidoApos), copiada aqui e travada por teste contra a original
   (run_servico_compra_test.js). Lançamento financeiro do serviço segue pelo
   Financeiro (NF de entrada / título), como qualquer despesa sem recebimento. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ServicoCompra = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var UNIDADE = 'SV';
  function txt(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : NaN; }

  function ehServico(it) { return !!it && it.tipoItem === 'SERVICO'; }
  function nomeItem(it) {
    it = it || {};
    return ehServico(it) ? (txt(it.descricao) || txt(it.materialNome)) : (txt(it.materialNome) || txt(it.materialCodigo));
  }

  // Linha pronta para a SC. Devolve {erro} quando não dá.
  function linhaServico(f) {
    f = f || {};
    var descricao = txt(f.descricao).slice(0, 300), qtd = num(f.qtd);
    if (descricao.length < 5) return {erro: 'Descreva o serviço (o que fazer e em qual equipamento).'};
    if (!(qtd > 0)) return {erro: 'Informe a quantidade do serviço (1 para um serviço só).'};
    return {tipoItem: 'SERVICO', descricao: descricao, materialCodigo: '', materialNome: descricao, qtd: qtd,
      unidade: txt(f.unidade) || UNIDADE, obs: txt(f.obs).slice(0, 300)};
  }

  function entradas(pc) { return Object.keys((pc && pc.itens) || {}).map(function(k) { return [k, pc.itens[k]]; }); }
  function itensFisicos(pc) { return entradas(pc).filter(function(e) { return !ehServico(e[1]); }); }
  function soServico(pc) { var e = entradas(pc); return e.length > 0 && e.every(function(x) { return ehServico(x[1]); }); }
  function pendente(it) { return (num(it.qtdRecebida) || 0) < (num(it.qtd) || 0) - 0.0001; }
  function servicosPendentes(pc) { return entradas(pc).filter(function(e) { return ehServico(e[1]) && pendente(e[1]); }); }

  // Cópia de functions/recebimento.js:statusPedidoApos (teste compara as duas).
  function statusApos(itens, deltas, statusAtual) {
    var algum = false, completo = true;
    Object.keys(itens || {}).forEach(function(k) {
      var it = itens[k] || {};
      var recebido = Math.max(0, (num(it.qtdRecebida) || 0) + (num((deltas || {})[k]) || 0));
      if (recebido > 0.0001) algum = true;
      if (recebido < (num(it.qtd) || 0) - 0.0001) completo = false;
    });
    if (statusAtual === 'CANCELADO') return 'CANCELADO';
    return completo ? 'RECEBIDO_TOTAL' : (algum ? 'RECEBIDO_PARCIAL' : 'ENVIADO');
  }

  /* Atestar que o serviço foi prestado: caminhos planos para um update só.
     o = {por, agora, obs}. */
  function atestar(pcKey, pc, itemKey, o) {
    o = o || {};
    var it = ((pc && pc.itens) || {})[itemKey];
    if (!it) return {erro: 'A linha não pertence a este Pedido de Compra.'};
    if (!ehServico(it)) return {erro: 'Atestar é só para linha de serviço; material passa pelo recebimento da Logística.'};
    if (pc.status === 'CANCELADO') return {erro: 'O Pedido de Compra está cancelado.'};
    if (pc.status === 'ABERTO' || !pc.status) return {erro: 'O Pedido de Compra ainda não foi enviado ao fornecedor.'};
    if (!pendente(it)) return {erro: 'Este serviço já foi atestado.'};
    var qtd = num(it.qtd) || 0, delta = {};
    delta[itemKey] = qtd - (num(it.qtdRecebida) || 0);
    var base = 'pedidos_compra/' + pcKey;
    var u = {};
    u[base + '/itens/' + itemKey + '/qtdRecebida'] = qtd;
    u[base + '/itens/' + itemKey + '/atestado'] = {por: o.por || null, em: o.agora || null, obs: txt(o.obs) || null};
    u[base + '/status'] = statusApos(pc.itens, delta, pc.status);
    return {updates: u};
  }

  return {UNIDADE: UNIDADE, ehServico: ehServico, nomeItem: nomeItem, linhaServico: linhaServico,
    itensFisicos: itensFisicos, soServico: soServico, servicosPendentes: servicosPendentes,
    statusApos: statusApos, atestar: atestar};
});
