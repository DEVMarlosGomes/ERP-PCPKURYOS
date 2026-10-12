/* Sincroniza o shell PCP com o tema do React incorporado sem alterar o bundle. */
(function () {
  'use strict';
  if (!window.__PCP_EMBEDDED__) return;

  var root = document.documentElement;
  var syncing = false;

  function effectiveTheme() {
    var declared = root.dataset.effectiveTheme || root.getAttribute('data-theme');
    if (declared === 'light' || declared === 'dark') return declared;
    try {
      var saved = localStorage.getItem('kuryos-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (error) {}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function syncTheme() {
    if (syncing) return;
    syncing = true;
    var theme = effectiveTheme();
    var shouldBeDark = theme === 'dark';
    if (root.classList.contains('dark') !== shouldBeDark) root.classList.toggle('dark', shouldBeDark);
    root.dataset.effectiveTheme = theme;
    try {
      if (localStorage.getItem('theme') !== theme) localStorage.setItem('theme', theme);
    } catch (error) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = shouldBeDark ? '#000000' : '#f5f5f7';
    queueMicrotask(function () { syncing = false; });
  }

  new MutationObserver(syncTheme).observe(root, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-effective-theme']
  });
  document.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('#kt-theme-toggle')) requestAnimationFrame(syncTheme);
  });
  window.addEventListener('storage', function (event) {
    if (event.key === 'kuryos-theme' || event.key === 'theme') syncTheme();
  });
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
  }
  syncTheme();
  document.addEventListener('DOMContentLoaded', syncTheme, { once: true });
})();
