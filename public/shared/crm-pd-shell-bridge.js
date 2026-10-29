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

  /* ── Item ativo do menu nas rotas do React (MENU-04, 29/10/2026) ─────────
     O React troca de tela sem recarregar (pushState), e várias rotas dele não
     têm o nome do link do menu: /crm/clients é o CRM 1, /kickoff/:id é um
     Kickoff, /pd/formulas é o P&D. O menu (auth_check.js) só conhece o nome
     do arquivo na carga. Aqui cada rota aponta para o link do registro
     (shared/navegacao.js) e o item ativo, o aria-current, o bloco aberto, o
     título da barra de cima e o da aba seguem a rota. Rota sem link no menu
     (ex.: /crm/orcamentos) não deixa nenhum item marcado por engano. */
  var ROTAS = [
    [/^\/(crm1|crm\/clients)(\/|$)/, 'crm1'],
    [/^\/(crm2|crm\/projects)(\/|$)/, 'crm2'],
    [/^\/(crm3|crm\/samples)(\/|$)/, 'crm3'],
    [/^\/(crm-admin|crm\/admin)(\/|$)/, 'crm-admin'],
    [/^\/(kickoffs|kickoff)(\/|$)/, 'kickoffs'],
    [/^\/contratos(\/|$)/, 'contratos'],
    [/^\/pd(\/|$)/, 'pd']
  ];
  function linkDaRota(pathname) {
    var p = String(pathname || '').replace(/\.html$/, '');
    for (var i = 0; i < ROTAS.length; i++) { if (ROTAS[i][0].test(p)) return ROTAS[i][1]; }
    return null;
  }
  function texto(el) { return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  var tituloOriginal = document.title;

  function sincronizarMenu() {
    var menu = document.getElementById('unified-navbar');
    if (!menu) return;
    var alvo = linkDaRota(location.pathname);
    var ativo = null;
    menu.querySelectorAll('.kt-nav-link').forEach(function (a) {
      var on = !!alvo && a.getAttribute('href') === alvo;
      a.classList.toggle('active', on);
      if (on) { a.setAttribute('aria-current', 'page'); ativo = a; } else a.removeAttribute('aria-current');
    });
    menu.querySelectorAll('.kt-nav-group').forEach(function (g) {
      var tem = !!ativo && g.contains(ativo);
      g.classList.toggle('tem-ativo', tem);
      if (tem) {
        g.classList.remove('fechado');
        var cap = g.querySelector('.kt-nav-cap');
        if (cap) cap.setAttribute('aria-expanded', 'true');
      }
    });
    var grupo = ativo && ativo.closest('.kt-nav-group');
    var pagina = texto(ativo);
    var bloco = texto(grupo && grupo.querySelector('.kt-cap-txt'));
    var titulo = document.querySelector('.kuryos-topbar-title');
    if (titulo && pagina) titulo.textContent = pagina;
    var trilha = document.querySelector('.kuryos-breadcrumbs span:last-child');
    if (trilha && bloco) trilha.textContent = bloco;
    var pilula = document.querySelector('.kuryos-sector-pill');
    if (pilula && bloco) pilula.textContent = bloco;
    document.title = pagina ? pagina + ' · Kuryos PCP' : tituloOriginal;
  }
  var agendado = false;
  function agendar() {
    if (agendado) return;
    agendado = true;
    (window.requestAnimationFrame || setTimeout)(function () { agendado = false; sincronizarMenu(); });
  }
  ['pushState', 'replaceState'].forEach(function (nome) {
    var original = history[nome];
    if (typeof original !== 'function') return;
    history[nome] = function () { var r = original.apply(this, arguments); agendar(); return r; };
  });
  window.addEventListener('popstate', agendar);
  window.addEventListener('kuryos-location-change', agendar);
  // O menu e a barra de cima entram como filhos diretos do <body> (auth_check
  // e shell): observa só esse nível, nunca a árvore do React.
  function observarBody() {
    new MutationObserver(agendar).observe(document.body, { childList: true });
    agendar();
  }
  if (document.body) observarBody();
  else document.addEventListener('DOMContentLoaded', observarBody, { once: true });
  window.KuryosCrmMenu = { linkDaRota: linkDaRota, sincronizar: sincronizarMenu };
})();
