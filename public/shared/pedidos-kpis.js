(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PedidosKpis = api;
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  function ops(lista, statusDoPedido) {
    var itens = Array.isArray(lista) ? lista : [];
    var contar = function(status) {
      return itens.filter(function(item) { return statusDoPedido(item) === status; }).length;
    };
    return {
      total: itens.length,
      andamento: contar('andamento'),
      concluido: contar('concluido'),
      encerrado: contar('encerrado')
    };
  }

  function comerciais(linhas) {
    var itens = Array.isArray(linhas) ? linhas : [];
    return {
      total: itens.length,
      aberto: itens.filter(function(item) { return item.categoria === 'aberto' && item.produzido <= 0; }).length,
      parcial: itens.filter(function(item) { return item.categoria === 'aberto' && item.produzido > 0; }).length,
      completo: itens.filter(function(item) { return item.categoria === 'completo'; }).length
    };
  }

  return { ops: ops, comerciais: comerciais };
});
