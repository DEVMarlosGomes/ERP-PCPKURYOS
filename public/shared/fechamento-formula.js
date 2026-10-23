/* Fechamento de 100% da fórmula — cópia do PCP/servidor (AMO-03 + INF-04, 22/10/2026).
 *
 * A mesma regra de crm-frontend/src/lib/fechamentoFormula.js (o CRM confere na tela; o
 * servidor confere de novo em functions/index.js:liberarEtapaPd antes de liberar "Em Testes"
 * ou "Aguardando Aprovação"). functions/fechamento-formula.js é cópia byte a byte deste
 * arquivo; os testes (Vitest e run_fechamento_formula_test.js) falham se divergirem.
 * Soma em inteiros (% × 10⁶). Sem q.s.p.: o sistema nunca completa a diferença (Q16).
 * Funções puras, sem DOM nem banco. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FechamentoFormula = factory();
})(typeof self !== 'undefined' ? self : this, function() {
  var TOLERANCIA_FORMULA = 0.001;
  var CODIGO = 'FORMULA_NAO_FECHA_100';
  var ESCALA = 1e6;

  function escalado(v) {
    var n = Number(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) ? Math.round(n * ESCALA) : 0;
  }
  function fechamentoFormula(itens) {
    var total = (itens || []).reduce(function(s, it) { return s + escalado(it && it.percentage); }, 0);
    var diferenca = total - 100 * ESCALA;
    return { soma: total / ESCALA, diferenca: diferenca / ESCALA, ok: Math.abs(diferenca) <= Math.round(TOLERANCIA_FORMULA * ESCALA) };
  }
  function fmt(n) { return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 4 }); }
  function textoFechamento(r) {
    if (r.ok) return 'Fecha 100% (' + fmt(r.soma) + '%).';
    return r.diferenca < 0 ? 'Soma ' + fmt(r.soma) + '% — falta ' + fmt(-r.diferenca) + '%.' : 'Soma ' + fmt(r.soma) + '% — excede ' + fmt(r.diferenca) + '%.';
  }
  function itensDaVariante(itensBase, overrides) {
    var porBase = {};
    (overrides || []).forEach(function(o) { if (o && o.ingredient_name_base) porBase[o.ingredient_name_base] = o; });
    return (itensBase || []).map(function(it) {
      var ov = porBase[it.ingredient_name];
      if (!ov) return it;
      var copia = {}; Object.keys(it).forEach(function(k) { copia[k] = it[k]; });
      copia.ingredient_name = ov.ingredient_name || it.ingredient_name; copia.percentage = ov.percentage; copia.substituido = true;
      return copia;
    });
  }
  function pendenciasDoLote(lote, itensBase) {
    return ((lote && lote.variantes) || []).map(function(v, i) {
      var r = fechamentoFormula(itensDaVariante(itensBase, v.overrides));
      return { lote: (lote && lote.nome) || '', variante: v.nome || ('Variante ' + (i + 1)), soma: r.soma, diferenca: r.diferenca, ok: r.ok };
    }).filter(function(p) { return !p.ok; });
  }
  function linhasNaoFecha(formula, pendencias) {
    var linhas = [];
    if (formula && !formula.ok) linhas.push(('Fórmula ' + (formula.nome || '') + ': ' + textoFechamento(formula)).replace('  ', ' '));
    (pendencias || []).forEach(function(p) { linhas.push('Lote ' + p.lote + ' · ' + p.variante + ': ' + textoFechamento(p)); });
    return linhas;
  }

  /* Confere o desenvolvimento inteiro como o adaptador do CRM: fórmula vigente (maior versão)
     e cada variante dos lotes ativos. Fórmula sem itens fica com a regra RN-PD-02 da etapa.
     formulas/itens/lotes = listas já filtradas pelo desenvolvimento. */
  function conferirDesenvolvimento(formulas, itens, lotes) {
    var itensDe = function(fid) { return (itens || []).filter(function(i) { return i.formula_id === fid; }); };
    var vigente = (formulas || []).slice().sort(function(a, b) { return Number(b.version || 0) - Number(a.version || 0); })[0];
    var itensVigente = vigente ? itensDe(vigente.id) : [];
    var fechamento = null;
    if (itensVigente.length) { fechamento = fechamentoFormula(itensVigente); fechamento.nome = 'v' + (vigente.version || 1); }
    var pendencias = [];
    (lotes || []).forEach(function(lote) {
      if (!lote.formula_base_id || (lote.status_base && lote.status_base !== 'ativa')) return;
      pendencias = pendencias.concat(pendenciasDoLote(lote, itensDe(lote.formula_base_id)));
    });
    var ok = (!fechamento || fechamento.ok) && !pendencias.length;
    return { ok: ok, codigo: ok ? null : CODIGO, formula: fechamento && !fechamento.ok ? fechamento : null, pendencias: pendencias,
      linhas: ok ? [] : linhasNaoFecha(fechamento, pendencias), vigente: vigente || null };
  }

  return { TOLERANCIA_FORMULA: TOLERANCIA_FORMULA, CODIGO: CODIGO, fechamentoFormula: fechamentoFormula, textoFechamento: textoFechamento,
    itensDaVariante: itensDaVariante, pendenciasDoLote: pendenciasDoLote, linhasNaoFecha: linhasNaoFecha, conferirDesenvolvimento: conferirDesenvolvimento };
});
