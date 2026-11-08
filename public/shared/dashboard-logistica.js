(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DashboardLogistica = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function n(v) { return Number(v) || 0; }
  function data(v) {
    var s = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  function diasEntre(inicio, fim) {
    if (!inicio) return 0;
    var a = new Date(inicio + 'T00:00:00Z');
    var b = new Date((fim || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');
    return Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())
      ? Math.max(0, Math.floor((b - a) / 86400000)) : 0;
  }
  function caixasDoItem(i) {
    var origem = i.paleteOrigem || {};
    var fechadas = n(i.caixasFechadas != null ? i.caixasFechadas : origem.caixasFechadas);
    var parcial = n(i.unidadesCaixaParcial != null ? i.unidadesCaixaParcial : origem.unidadesCaixaParcial);
    return fechadas + (parcial > 0 ? 1 : 0);
  }
  function pesoDoItem(i) {
    var peso = n(i.pesoTotalKg);
    if (peso) return peso;
    return n(i.pesoPorCaixaKg) * n(i.caixasFechadas || (i.paleteOrigem || {}).caixasFechadas);
  }
  function achatarExpedicoes(cargas) {
    var out = [];
    Object.keys(cargas || {}).forEach(function(cargaKey) {
      var carga = cargas[cargaKey] || {};
      Object.keys(carga.itens || {}).forEach(function(itemKey) {
        var i = carga.itens[itemKey] || {};
        var dtExp = data(carga.data) || data(carga.criadoEm);
        var dtFab = data(i.dataFabricacao);
        out.push({
          nf: carga.nf || carga.numero || cargaKey,
          status: '2) Expedido', cli: carga.cliente || i.cliente || '',
          sku: i.sku || i.itemCodigo || '', lot: i.opLote || i.loteOrigem || '',
          dt_fab: dtFab, cx: caixasDoItem(i),
          mult: n(i.unidadesPorCaixa || (i.paleteOrigem || {}).unidadesPorCaixa),
          u: n(i.qtd), kg_cx: n(i.pesoPorCaixaKg), carga: pesoDoItem(i),
          dt_stk: data(i.dataEstoque || i.criadoEm),
          dias_stk: diasEntre(data(i.dataEstoque || i.criadoEm) || dtFab, dtExp),
          dt_exp: dtExp, transp: carga.transportadora || '',
          motor: carga.motorista || '', placa: carga.placa || ''
        });
      });
    });
    return out;
  }
  function achatarEstoque(estoqueLotes, produtos, hoje) {
    var out = [];
    Object.keys(estoqueLotes || {}).forEach(function(itemKey) {
      Object.keys(estoqueLotes[itemKey] || {}).forEach(function(loteKey) {
        var lote = estoqueLotes[itemKey][loteKey] || {};
        var saldo = n(lote.saldoLote);
        if (lote.itemTipo !== 'produto' || saldo <= 0 || lote.expedicaoId) return;
        var produto = (produtos || {})[lote.itemCodigo] || (produtos || {})[itemKey] || {};
        var mult = n(lote.unidadesPorCaixa || produto.unCx);
        var fechadas = Math.floor(saldo / (mult || 1));
        var parcial = mult ? saldo % mult : 0;
        var cx = fechadas + (parcial > 0 ? 1 : 0);
        var dtStk = data(lote.criadoEm || lote.atualizadoEm);
        var kgCx = n(produto.kgCaixa);
        var peso = kgCx ? (fechadas * kgCx + (parcial && mult ? kgCx * parcial / mult : 0)) : 0;
        out.push({
          nf: lote.identificadorPalete || loteKey,
          status: '1) Em estoque', cli: lote.cliente || produto.cliente || '',
          sku: lote.itemCodigo || produto.sku || itemKey, lot: lote.opLote || lote.loteOrigem || '',
          dt_fab: data(lote.dataFabricacao), cx: cx, mult: mult, u: saldo,
          kg_cx: kgCx, carga: peso, dt_stk: dtStk,
          dias_stk: diasEntre(dtStk, hoje), dt_exp: null,
          transp: '', motor: '', placa: ''
        });
      });
    });
    return out;
  }
  function montar(cargas, estoqueLotes, produtos, hoje) {
    return achatarExpedicoes(cargas).concat(achatarEstoque(estoqueLotes, produtos, hoje));
  }
  return { achatarExpedicoes: achatarExpedicoes, achatarEstoque: achatarEstoque, montar: montar };
});
