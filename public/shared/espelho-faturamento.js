/* ══════════════════════════════════════════════════════════════════════
   ESPELHO DO FATURAMENTO — o que o Financeiro precisa para emitir a NF
   (11/11/2026)

   Pedido do usuário: no Financeiro, "como se fosse espelho do faturamento da
   expedição", por item: descrição do SKU com código interno e externo, lote,
   fabricação, validade, caixas fechadas, unidades avulsas (caixa parcial),
   total de unidades, valor por caixa e valor unitário.

   Só LÊ (agendamentos_expedicao, estoque_lotes, produtos, ops):
   - carga com faturamento solicitado: usa a solicitação mais recente
     (functions/faturamento_carga.js, itensDaCarga) -- é o que a Expedição
     mandou ao Financeiro, inclusive o preço;
   - carga ainda não solicitada: monta dos paletes da agenda, sem preço
     (o preço só é fixado quando a Expedição solicita).
   Completa o que o retrato não tem: código externo (produto.codCliente),
   fabricação (fim real da OP, senão a emissão -- mesma regra do laudo de PA) e
   validade (lote, senão a da OP, que é a da etiqueta da caixa).

   Caixas fechadas e avulsas saem das UNIDADES DESTA CARGA e do múltiplo da
   caixa: palete desmembrado leva só parte das caixas do lote. Sem múltiplo,
   vale o que o lote registrou. Valor ausente fica null (nunca zero).
   Funções PURAS, sem DOM nem Firebase.
   ══════════════════════════════════════════════════════════════════════ */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EspelhoFaturamento = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function txt(v) { return v == null ? '' : String(v).trim(); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function data(v) {
    var s = txt(v), br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (br) return br[3] + '-' + br[2] + '-' + br[1];
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
  }
  function produtoDoSku(produtos, sku) {
    produtos = produtos || {};
    if (!sku) return {};
    if (produtos[sku]) return produtos[sku];
    var k = Object.keys(produtos).find(function(x) { return (produtos[x] || {}).sku === sku; });
    return k ? produtos[k] : {};
  }
  function ultimaSolicitacao(a) {
    var s = (a && a.faturamento && a.faturamento.solicitacoes) || {};
    var lista = Object.keys(s).map(function(k) { return s[k]; }).filter(Boolean)
      .sort(function(x, y) { return String(x.em || '').localeCompare(String(y.em || '')); });
    return lista[lista.length - 1] || null;
  }

  /* Uma linha por palete da carga. base = {estoque_lotes, produtos, ops}. */
  function linhas(agenda, base) {
    base = base || {};
    var sol = ultimaSolicitacao(agenda);
    var origem = sol ? 'SOLICITACAO' : 'AGENDA';
    var fonte = sol ? (sol.itens || []) : ((agenda && agenda.paletes) || []);
    return fonte.map(function(it) {
      it = it || {};
      var lote = ((base.estoque_lotes || {})[it.itemKey] || {})[it.loteKey] || {};
      var op = (base.ops || {})[lote.opKey] || {};
      var sku = txt(it.sku || lote.itemCodigo || op.sku);
      var prod = produtoDoSku(base.produtos, sku);
      var unidades = n(sol ? it.unidades : it.quantidade);
      var upc = n(it.unidadesPorCaixa) || n(lote.unidadesPorCaixa) || n(op.unidadesPorCaixa) || n(prod.unidadesPorCaixa);
      var caixas, avulsas;
      if (upc > 0) { caixas = Math.floor(unidades / upc); avulsas = unidades - caixas * upc; }
      else { caixas = n(sol ? it.caixas : lote.caixasFechadas); avulsas = n(sol ? it.caixaParcial : lote.unidadesCaixaParcial); }
      var preco = sol && n(it.precoUnitario) > 0 ? n(it.precoUnitario) : null;
      return {
        identificadorPalete: txt(it.identificadorPalete || lote.identificadorPalete),
        sku: sku,
        descricao: txt(it.descricao || lote.itemNome || prod.descricao || op.produto),
        codExterno: txt(prod.codCliente || op.codCliente),
        lote: txt(it.lote || lote.opLote || lote.loteOrigem || op.lote),
        fabricacao: data(lote.dataFabricacao || lote.fabricadoEm || op.dataFimReal || op.dataEmissao),
        validade: data(it.validade || lote.dataValidade || lote.validade || op.validade),
        unidadesPorCaixa: upc || null,
        caixasFechadas: caixas,
        unidadesAvulsas: avulsas,
        totalUnidades: unidades,
        valorUnitario: preco,
        valorCaixa: preco != null && upc > 0 ? r2(preco * upc) : null,
        valorTotal: preco != null ? r2(preco * unidades) : null,
        pedidoNumero: txt(it.pedidoNumero || it.pedidoId),
        origem: origem
      };
    });
  }

  function totais(ls) {
    var t = {caixasFechadas: 0, unidadesAvulsas: 0, totalUnidades: 0, valorTotal: 0, semPreco: 0, semCodExterno: 0, semFabricacao: 0, semValidade: 0};
    (ls || []).forEach(function(l) {
      t.caixasFechadas += l.caixasFechadas; t.unidadesAvulsas += l.unidadesAvulsas; t.totalUnidades += l.totalUnidades;
      if (l.valorTotal == null) t.semPreco++; else t.valorTotal += l.valorTotal;
      if (!l.codExterno) t.semCodExterno++;
      if (!l.fabricacao) t.semFabricacao++;
      if (!l.validade) t.semValidade++;
    });
    t.valorTotal = r2(t.valorTotal);
    return t;
  }

  /* CSV (Excel pt-BR: ';' e vírgula decimal) de uma ou mais cargas. */
  var COLUNAS = [['cliente', 'Cliente'], ['carga', 'Data agendada'], ['pedidoNumero', 'Pedido'], ['identificadorPalete', 'Palete'],
    ['sku', 'Código interno'], ['codExterno', 'Código externo'], ['descricao', 'Descrição'], ['lote', 'Lote'], ['fabricacao', 'Fabricação'],
    ['validade', 'Validade'], ['caixasFechadas', 'Caixas fechadas'], ['unidadesAvulsas', 'Unidades avulsas'], ['totalUnidades', 'Total de unidades'],
    ['valorCaixa', 'Valor por caixa'], ['valorUnitario', 'Valor unitário'], ['valorTotal', 'Valor total']];
  function csv(cargas) {
    var cel = function(v) {
      if (v == null) return '';
      if (typeof v === 'number') return String(v).replace('.', ',');
      var s = String(v);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = s.split('-').reverse().join('/');
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var out = [COLUNAS.map(function(c) { return c[1]; }).join(';')];
    (cargas || []).forEach(function(c) {
      (c.linhas || []).forEach(function(l) {
        var row = Object.assign({cliente: c.cliente || '', carga: c.dataAgendada || ''}, l);
        out.push(COLUNAS.map(function(col) { return cel(row[col[0]]); }).join(';'));
      });
    });
    return '﻿' + out.join('\r\n');
  }

  return {linhas: linhas, totais: totais, csv: csv, ultimaSolicitacao: ultimaSolicitacao};
});
