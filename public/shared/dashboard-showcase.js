(function () {
  'use strict';

  var revealSelector = '.card,.metric,.kpi,.meta-card,.andon-db-card,.meta-stack-item';
  var scheduled = false;

  function reveal(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches(revealSelector)) root.classList.add('dash-reveal');
    root.querySelectorAll(revealSelector).forEach(function (element) {
      if (!element.classList.contains('dash-reveal')) element.classList.add('dash-reveal');
    });
  }

  // Cores, grade, legenda e tooltip dos gráficos vêm do tema global
  // (shared/kuryos-erp-ref.js), que lê os tokens e refaz tudo ao trocar o tema.
  // Aqui sobra só o ritmo da animação. Antes esta função rodava a cada mudança
  // do DOM, regravava chart.options.*.labels/ticks/grid sobre eles mesmos (o
  // que estoura a pilha nos proxies do Chart.js 4: "Maximum call stack size
  // exceeded") e trocava o objeto de Chart.defaults.animation inteiro ("this._fn
  // is not a function" ao destruir um gráfico animando). Também pintava texto e
  // grade de verde, sobra de um tema antigo.
  var animacaoAjustada = false;
  function chartTheme() {
    if (!window.Chart || animacaoAjustada) return;
    animacaoAjustada = true;
    Object.assign(Chart.defaults.animation, { duration: 720, easing: 'easeOutQuart' });
  }

  function setupMobileFilters() {
    var filterbar = document.querySelector('.filterbar');
    if (!filterbar || filterbar.querySelector('.dash-filter-toggle')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'dash-filter-toggle';
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg><span>Filtros e período</span><svg class="dash-filter-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
    button.addEventListener('click', function () {
      var open = filterbar.classList.toggle('filter-open');
      button.setAttribute('aria-expanded', String(open));
    });
    filterbar.insertBefore(button, filterbar.firstChild);
  }

  function start() {
    document.body.classList.add('dashboard-showcase');
    setupMobileFilters();
    reveal(document.body);
    chartTheme();
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === Node.ELEMENT_NODE) reveal(node);
        });
      });
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(function () { scheduled = false; chartTheme(); });
      }
    }).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(chartTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-effective-theme'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
