/* Busca, filtros e tema da Central de Ajuda. Funciona sem login/Firebase. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ManuaisWorkflow = factory();
})(typeof window !== 'undefined' ? window : this, function() {
  'use strict';
  var ambiente = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  function normalizar(valor) { return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  function combina(texto, grupo, busca, filtro) { var termo = normalizar(busca); return (filtro === 'todos' || filtro === grupo) && (!termo || normalizar(texto).indexOf(termo) >= 0); }
  function iniciar(doc) {
    doc = doc || document;
    var busca = doc.getElementById('workflow-search');
    var botoes = Array.prototype.slice.call(doc.querySelectorAll('[data-help-filter]'));
    var cartoes = Array.prototype.slice.call(doc.querySelectorAll('[data-help-card]'));
    var contador = doc.getElementById('help-count'), vazio = doc.getElementById('help-empty'), filtro = 'todos';
    function render() {
      var visiveis = 0, termo = busca ? busca.value : '';
      cartoes.forEach(function(card) { var mostrar = combina(card.textContent, card.getAttribute('data-help-group'), termo, filtro); card.hidden = !mostrar; if (mostrar) visiveis++; });
      if (contador) contador.textContent = visiveis + (visiveis === 1 ? ' setor encontrado' : ' setores encontrados');
      if (vazio) vazio.hidden = visiveis !== 0;
      return visiveis;
    }
    if (busca) busca.addEventListener('input', render);
    botoes.forEach(function(botao) { botao.addEventListener('click', function() { filtro = botao.getAttribute('data-help-filter') || 'todos'; botoes.forEach(function(outro) { outro.setAttribute('aria-pressed', String(outro === botao)); }); render(); }); });
    var html = doc.documentElement, toggle = doc.querySelector('[data-theme-toggle]'), salvo = null;
    try { salvo = ambiente.localStorage && ambiente.localStorage.getItem('kuryos.manual.theme'); } catch (e) {}
    var tema = salvo === 'dark' || salvo === 'light' ? salvo : (ambiente.matchMedia && ambiente.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    html.setAttribute('data-manual-theme', tema);
    if (toggle) toggle.addEventListener('click', function() { tema = html.getAttribute('data-manual-theme') === 'dark' ? 'light' : 'dark'; html.setAttribute('data-manual-theme', tema); try { if (ambiente.localStorage) ambiente.localStorage.setItem('kuryos.manual.theme', tema); } catch (e) {} });
    render(); doc.body.setAttribute('data-help-ready', 'true'); return {render: render};
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { iniciar(document); }); else iniciar(document); }
  return {normalizar: normalizar, combina: combina, iniciar: iniciar};
});
