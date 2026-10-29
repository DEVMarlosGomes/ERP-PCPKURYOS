/* FEFO da embalagem na separação (FEFO-01, reunião 28/10/2026).
 *
 * A manipulação já indica o lote de MP pelo FEFO e só aceita outro lote com
 * motivo (shared/manipulacao.js: validarParcela, "fora do FEFO"). Aqui a mesma
 * regra para a embalagem (EP/ES/ET/MU, itens do BOM) na Separação de Materiais:
 *  - o lote indicado é o primeiro a vencer (sugerirAlocacaoFefo, shared/utils.js:
 *    material do próprio cliente antes do geral, validade, recebimento);
 *  - o separador pode pegar de outro lote, mas aí precisa dizer por quê;
 *  - lote de cliente só serve à OP desse cliente: com outro cliente (ou sem
 *    cliente) ele nem aparece como opção -- e a escolha é recusada mesmo com motivo.
 *
 * "Fora do FEFO" é medido pelo que foi separado, não pelo que foi sugerido: para
 * a quantidade total que o separador pegou, o FEFO teria tirado X do lote A e Y
 * do B; se ele tirou diferente, é fora do FEFO. Pegar menos (separação parcial)
 * na ordem do FEFO não pede motivo.
 *
 * `sugerir` é sugerirAlocacaoFefo, injetada (vive em utils.js, que não é módulo):
 * a ordem do FEFO continua num lugar só. Funções puras. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FefoEmbalagem = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var TOL = 0.001;
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function arred(v) { return Math.round(v * 1000) / 1000; }

  /* Todos os lotes que a OP pode usar, na ordem do FEFO, com o saldo de cada um. */
  function lotesElegiveis(itemCodigo, lotesDoItem, bloqueados, clienteKey, sugerir) {
    var total = Object.keys(lotesDoItem || {}).reduce(function(s, k) { return s + Math.max(0, num((lotesDoItem[k] || {}).saldoLote)); }, 0);
    if (!(total > 0)) return [];
    return sugerir(itemCodigo, total, lotesDoItem, bloqueados || {}, {clienteKey: clienteKey || null}).alocacoes.map(function(a, i) {
      var l = lotesDoItem[a.loteKey] || {};
      return {ordem: i + 1, loteKey: a.loteKey, loteInterno: l.loteInterno || null, enderecoKey: a.enderecoKey, enderecoCodigo: a.enderecoCodigo,
        dataValidade: a.dataValidade, saldo: a.qtdSugerida, doCliente: a.doCliente || null};
    });
  }

  /* escolhas: [{loteKey, qtd}] (o que o separador vai tirar de cada lote).
     -> {total, fefo: [{loteKey, qtd}], foraFefo, divergencias, erros} */
  function avaliarEscolha(ctx) {
    var c = ctx || {};
    var elegiveis = lotesElegiveis(c.itemCodigo, c.lotesDoItem, c.bloqueados, c.clienteKey, c.sugerir);
    var porLote = {}, erros = [];
    elegiveis.forEach(function(e) { porLote[e.loteKey] = e; });
    var escolhido = {};
    (c.escolhas || []).forEach(function(x) {
      var q = num(x && x.qtd);
      if (!x || !x.loteKey || !(q > 0)) return;
      escolhido[x.loteKey] = arred((escolhido[x.loteKey] || 0) + q);
    });
    Object.keys(escolhido).forEach(function(k) {
      var e = porLote[k];
      if (!e) erros.push('O lote ' + k + ' não pode ser usado nesta OP (de outro cliente, bloqueado, em quarentena ou sem saldo).');
      else if (escolhido[k] > e.saldo + TOL) erros.push('O lote ' + (e.loteInterno || k) + ' tem só ' + e.saldo + ' de saldo.');
    });
    var total = arred(Object.keys(escolhido).reduce(function(s, k) { return s + escolhido[k]; }, 0));
    // O que o FEFO tiraria de cada lote para esse mesmo total.
    var resta = total, fefo = [];
    elegiveis.forEach(function(e) {
      if (resta <= TOL) return;
      var q = arred(Math.min(e.saldo, resta));
      fefo.push({loteKey: e.loteKey, loteInterno: e.loteInterno, dataValidade: e.dataValidade, qtd: q});
      resta = arred(resta - q);
    });
    var fefoPorLote = {};
    fefo.forEach(function(f) { fefoPorLote[f.loteKey] = f.qtd; });
    var divergencias = [];
    Object.keys(Object.assign({}, escolhido, fefoPorLote)).forEach(function(k) {
      var a = escolhido[k] || 0, b = fefoPorLote[k] || 0;
      if (Math.abs(a - b) > TOL) divergencias.push({loteKey: k, loteInterno: (porLote[k] || {}).loteInterno || null, escolhido: a, fefo: b});
    });
    return {total: total, fefo: fefo, foraFefo: divergencias.length > 0, divergencias: divergencias, erros: erros, elegiveis: elegiveis};
  }

  /* Mesmo padrão da pesagem: fora do FEFO só passa com motivo; lote inválido nunca. */
  function validarSeparacao(avaliacao, motivo) {
    var a = avaliacao || {};
    if (a.erros && a.erros.length) return {ok: false, erro: a.erros.join(' ')};
    if (a.foraFefo && !String(motivo == null ? '' : motivo).trim()) {
      var ind = (a.fefo || []).map(function(f) { return (f.loteInterno || f.loteKey) + ' (' + f.qtd + ')'; }).join(', ');
      return {ok: false, erro: 'O FEFO indica ' + (ind || 'outro lote') + '. Para usar outro lote, informe o motivo.'};
    }
    return {ok: true};
  }

  /* Registro gravado na OP quando a separação saiu do FEFO. */
  function registroForaFefo(avaliacao, motivo, escolhas) {
    return {
      motivoForaFefo: String(motivo || '').trim().slice(0, 300),
      indicado: (avaliacao.fefo || []).map(function(f) { return {loteKey: f.loteKey, qtd: f.qtd, dataValidade: f.dataValidade || null}; }),
      usado: (escolhas || []).filter(function(x) { return num(x.qtd) > 0; }).map(function(x) { return {loteKey: x.loteKey, qtd: arred(num(x.qtd))}; })
    };
  }

  return {lotesElegiveis: lotesElegiveis, avaliarEscolha: avaliarEscolha, validarSeparacao: validarSeparacao, registroForaFefo: registroForaFefo};
});
