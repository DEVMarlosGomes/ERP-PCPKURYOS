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

  function chartTheme() {
    if (!window.Chart) return;
    var dark = document.documentElement.classList.contains('dark') || document.documentElement.dataset.effectiveTheme === 'dark';
    var text = dark ? '#b5c4bb' : '#64736a';
    var grid = dark ? 'rgba(154,171,161,.14)' : 'rgba(64,105,82,.12)';
    Chart.defaults.color = text;
    Chart.defaults.borderColor = grid;
    Chart.defaults.animation = { duration: 720, easing: 'easeOutQuart' };
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
    Chart.defaults.plugins.legend.labels.boxWidth = 7;
    Chart.defaults.plugins.legend.labels.boxHeight = 7;
    Object.values(Chart.instances || {}).forEach(function (chart) {
      if (chart.options.plugins && chart.options.plugins.legend) {
        chart.options.plugins.legend.labels = chart.options.plugins.legend.labels || {};
        chart.options.plugins.legend.labels.color = text;
      }
      Object.values(chart.options.scales || {}).forEach(function (scale) {
        scale.ticks = scale.ticks || {};
        scale.grid = scale.grid || {};
        scale.ticks.color = text;
        scale.grid.color = grid;
      });
      chart.update('none');
    });
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
