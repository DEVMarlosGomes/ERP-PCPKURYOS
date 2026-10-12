(function () {
  'use strict';
  // Pontes apenas de apresentação: não registra listeners de dados nem muda controles.
  function markPage() {
    if (!document.body) return;
    var path = location.pathname;
    var page = path.split('/').filter(Boolean).pop() || 'index';
    if (/^\/pd(?:\/|$)/.test(path)) page = 'pd';
    if (/^\/crm(?:\/|$)/.test(path)) page = 'crm';
    document.body.dataset.kuryosPage = page.replace(/\.html$/, '');
    document.body.dataset.kuryosUi = 'reference';
  }
  window.KuryosUI = Object.freeze({ version: '20261012-1', refresh: markPage });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markPage, { once: true });
  markPage();
  window.addEventListener('popstate', markPage);
})();
