/* Último preço de compra e preço sugerido (COM-04, PROMPT_ENGENHARIA_PACOTE_20261021.md).
 *
 * Fonte única: o Compras (compras.html) e a cotação do CRM (crm-frontend/src/lib/ultimoPreco.js,
 * com teste de contrato contra este arquivo) usam a mesma conta.
 * - Último preço = o item do Pedido de Compra mais recente (data de emissão, senão de criação)
 *   com preço; pedido cancelado não é referência.
 * - Sugestão, nesta ordem e sempre com a origem: último PC → última cotação aprovada → preço da
 *   fórmula do P&D (trilha ESTIMADO_PD → COTADO → PAGO). Sem nada = SEM PREÇO, nunca zero.
 * Funções puras. */
(function (root) {
  'use strict';

  function numero(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function ultimoPrecoDoMaterial(pedidosCompra, materialCodigo) {
    if (!materialCodigo) return null;
    var achado = null;
    Object.keys(pedidosCompra || {}).forEach(function (pcKey) {
      var pc = pedidosCompra[pcKey];
      if (!pc || pc.status === 'CANCELADO') return;
      Object.keys(pc.itens || {}).forEach(function (k) {
        var it = pc.itens[k] || {};
        var preco = numero(it.precoUnit);
        if (it.materialCodigo !== materialCodigo || preco === null || preco <= 0) return;
        var data = pc.dataEmissao || pc.dataCriacao || '';
        if (!achado || data > achado.data) {
          achado = { precoUnit: preco, fornecedorNome: pc.fornecedorNome || '', data: data, pcNumero: pc.numeroFormatado || pc.numero || '' };
        }
      });
    });
    return achado;
  }

  // fontes = { ultimoPc: {precoUnit, fornecedorNome, data, pcNumero}, cotacaoAprovada: {preco, moeda, numero, em}, formula: {preco, moeda} }
  function sugestaoDePreco(fontes) {
    var f = fontes || {};
    var pc = f.ultimoPc;
    if (pc && numero(pc.precoUnit) > 0) {
      return { preco: numero(pc.precoUnit), moeda: 'BRL', fonte: 'ultimo_pc',
        detalhe: ['último PC', pc.pcNumero, pc.fornecedorNome, String(pc.data || '').slice(0, 10)].filter(Boolean).join(' · ') };
    }
    var cot = f.cotacaoAprovada;
    if (cot && numero(cot.preco) > 0) {
      return { preco: numero(cot.preco), moeda: cot.moeda === 'USD' ? 'USD' : 'BRL', fonte: 'cotacao_aprovada',
        detalhe: ['cotação aprovada', cot.numero, String(cot.em || '').slice(0, 10)].filter(Boolean).join(' · ') };
    }
    var form = f.formula;
    if (form && numero(form.preco) > 0) {
      return { preco: numero(form.preco), moeda: form.moeda === 'USD' ? 'USD' : 'BRL', fonte: 'formula_pd', detalhe: 'estimado na fórmula do P&D' };
    }
    return { preco: null, moeda: 'BRL', fonte: null, detalhe: 'SEM PREÇO' };
  }

  var api = { ultimoPrecoDoMaterial: ultimoPrecoDoMaterial, sugestaoDePreco: sugestaoDePreco };
  root.UltimoPreco = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
