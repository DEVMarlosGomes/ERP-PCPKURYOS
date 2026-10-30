(function () {
  'use strict';

  var icon = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6"/><path d="M20 4v16"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
    panel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/></svg>'
  };
  var built = false;
  var navigation = [];
  var lastRoute = '';

  function text(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function cleanPath(value) { return String(value || '').replace(/\.html$/, ''); }
  function norm(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function currentTitle() {
    var heading = document.querySelector('main h1, .container h1, .main h1, #root h1, body > h1');
    return text(heading && heading.textContent) || text(document.title).replace(/\s*[·|-]\s*Kuryos.*$/i, '') || 'Kuryos ERP';
  }
  function activeContext(sidebar) {
    var active = sidebar.querySelector('.kt-nav-link.active');
    var group = active && active.closest('.kt-nav-group');
    return {
      group: text(group && group.querySelector('.kt-cap-txt') && group.querySelector('.kt-cap-txt').textContent) || 'Sistema',
      page: text(active && active.textContent) || currentTitle()
    };
  }
  function collectNavigation(sidebar) {
    navigation = Array.from(sidebar.querySelectorAll('.kt-nav-link')).map(function (link) {
      var group = link.closest('.kt-nav-group');
      return {
        href: link.getAttribute('href'),
        label: text(link.textContent),
        group: text(group && group.querySelector('.kt-cap-txt') && group.querySelector('.kt-cap-txt').textContent),
        icon: (link.querySelector('svg') || {}).outerHTML || icon.panel,
        element: link
      };
    }).filter(function (item) { return item.href && item.label; });
  }

  function syncRoute(sidebar) {
    if (!window.__PCP_EMBEDDED__ || lastRoute === location.pathname) return;
    lastRoute = location.pathname;
    var path = cleanPath(lastRoute);
    if (/^\/crm\/clients(?:\/|$)/.test(path)) path = '/crm1';
    else if (/^\/crm\/projects(?:\/|$)/.test(path)) path = '/crm2';
    else if (/^\/crm\/samples(?:\/|$)/.test(path)) path = '/crm3';
    else if (/^\/pd(?:\/|$)/.test(path)) path = '/pd';
    var match = navigation.find(function (item) { return cleanPath(new URL(item.href, document.baseURI).pathname) === path; });
    if (!match) return;
    navigation.forEach(function (item) {
      var active = item === match;
      item.element.classList.toggle('active', active);
      if (active) item.element.setAttribute('aria-current', 'page');
      else item.element.removeAttribute('aria-current');
    });
    sidebar.querySelectorAll('.kt-nav-group').forEach(function (group) {
      var active = Boolean(group.querySelector('.kt-nav-link.active'));
      group.classList.toggle('tem-ativo', active);
      if (active) { group.classList.remove('fechado'); group.querySelector('.kt-nav-cap').setAttribute('aria-expanded', 'true'); }
    });
    var context = activeContext(sidebar);
    var title = document.querySelector('.kuryos-topbar-title');
    if (title) title.textContent = context.page;
    var breadcrumbs = document.querySelector('.kuryos-breadcrumbs span:last-child');
    if (breadcrumbs) breadcrumbs.textContent = context.group;
    window.dispatchEvent(new CustomEvent('kuryos-location-change'));
  }

  function setupSidebar(sidebar) {
    if (sidebar.querySelector('.kuryos-sidebar-tools')) return;
    var brand = sidebar.querySelector('.kt-brand');
    var tools = document.createElement('div');
    tools.className = 'kuryos-sidebar-tools';
    tools.innerHTML = '<label class="kuryos-module-search">' + icon.search + '<span class="sr-only">Pesquisar módulos</span><input type="search" placeholder="Buscar módulos" autocomplete="off"></label>' +
      '<button type="button" class="kuryos-sidebar-collapse" aria-label="Recolher menu" aria-pressed="false" title="Recolher menu">' + icon.collapse + '</button>';
    brand.insertAdjacentElement('afterend', tools);
    var empty = document.createElement('p');
    empty.className = 'kuryos-module-empty';
    empty.textContent = 'Nenhum módulo autorizado corresponde à busca.';
    tools.insertAdjacentElement('afterend', empty);

    var collapsed = !/\/dashboard(?:_ex|_an|_se|\.html|\/?$)/.test(location.pathname);
    try {
      var preference = localStorage.getItem('kuryos.sidebar.collapsed');
      if (preference === '0' || preference === '1') collapsed = preference === '1';
    } catch (error) {}
    document.body.classList.toggle('kuryos-sidebar-collapsed', collapsed);
    var collapse = tools.querySelector('.kuryos-sidebar-collapse');
    collapse.setAttribute('aria-pressed', String(collapsed));
    collapse.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
    collapse.title = collapsed ? 'Expandir menu' : 'Recolher menu';
    collapse.addEventListener('click', function () {
      collapsed = document.body.classList.contains('kuryos-sidebar-collapsed');
      document.body.classList.toggle('kuryos-sidebar-collapsed', !collapsed);
      collapsed = !collapsed;
      document.body.classList.remove('kuryos-sidebar-preview');
      collapse.setAttribute('aria-pressed', String(collapsed));
      collapse.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
      collapse.title = collapsed ? 'Expandir menu' : 'Recolher menu';
      try { localStorage.setItem('kuryos.sidebar.collapsed', collapsed ? '1' : '0'); } catch (error) {}
    });

    // Hover e foco expandem a navegação sem mover a página nem gravar preferência.
    function preview(open) {
      document.body.classList.toggle('kuryos-sidebar-preview', open && document.body.classList.contains('kuryos-sidebar-collapsed') && innerWidth > 980);
    }
    sidebar.addEventListener('mouseenter', function () { preview(true); });
    sidebar.addEventListener('mouseleave', function () { preview(sidebar.contains(document.activeElement) && document.activeElement !== collapse); });
    sidebar.addEventListener('focusin', function (event) { if (event.target !== collapse) preview(true); });
    sidebar.addEventListener('focusout', function (event) { if (!sidebar.contains(event.relatedTarget)) preview(false); });
    window.addEventListener('resize', function () { if (innerWidth <= 980) preview(false); }, { passive: true });
    sidebar.querySelectorAll('.kt-nav-cap').forEach(function (cap) {
      cap.title = text(cap.querySelector('.kt-cap-txt')?.textContent);
    });

    sidebar.querySelectorAll('.kt-nav-link').forEach(function (link) {
      var label = text(link.textContent);
      link.title = label;
      var span = document.createElement('span');
      span.textContent = label;
      if (!link.querySelector('span')) {
        Array.from(link.childNodes).forEach(function (node) { if (node.nodeType === Node.TEXT_NODE) node.remove(); });
        link.appendChild(span);
      }
      if (link.classList.contains('active')) link.setAttribute('aria-current', 'page');
    });
    collectNavigation(sidebar);

    tools.querySelector('input').addEventListener('input', function (event) {
      var query = norm(event.target.value);
      var visible = 0;
      sidebar.querySelectorAll('.kt-nav-group').forEach(function (group) {
        var groupVisible = 0;
        group.querySelectorAll('.kt-nav-link').forEach(function (link) {
          var show = !query || norm(link.textContent).includes(query) || norm(group.dataset.grupo).includes(query);
          link.hidden = !show;
          if (show) { visible++; groupVisible++; }
        });
        group.hidden = groupVisible === 0;
        if (query && groupVisible) group.classList.remove('fechado');
      });
      empty.classList.toggle('visible', visible === 0);
    });

    sidebar.addEventListener('keydown', function (event) {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      var links = Array.from(sidebar.querySelectorAll('.kt-nav-cap,.kt-nav-link:not([hidden])')).filter(function (link) { return link.getClientRects().length && !link.closest('[hidden]'); });
      var index = links.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      links[(index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
    });
  }

  function resultHtml(items) {
    if (!items.length) return '<div class="kuryos-search-empty">Nenhum módulo autorizado encontrado.</div>';
    return items.slice(0, 12).map(function (item, index) {
      return '<a class="kuryos-search-result' + (index === 0 ? ' active' : '') + '" href="' + item.href + '">' + item.icon + '<span>' + item.label + '</span><small>' + item.group + '</small></a>';
    }).join('');
  }

  function syncAppViewport() {
    var appRoot = document.getElementById('root');
    var appMain = document.querySelector('[data-app-main="true"]');
    // Só as telas React (CRM/P&D) têm altura fixada aqui. Nas demais, medir a
    // barra forçava o navegador a recalcular o layout da página inteira.
    if (!appRoot && !appMain) return;
    var topbar = document.querySelector('.kuryos-enterprise-topbar');
    var availableHeight = Math.max(320, window.innerHeight - (topbar ? topbar.getBoundingClientRect().height : 68)) + 'px';
    if (appRoot) {
      appRoot.style.setProperty('transition', 'none', 'important');
      appRoot.style.setProperty('min-height', availableHeight, 'important');
      appRoot.style.setProperty('height', availableHeight, 'important');
      appRoot.style.setProperty('max-height', availableHeight, 'important');
    }
    if (appMain) {
      appMain.style.setProperty('transition', 'none', 'important');
      appMain.style.setProperty('height', availableHeight, 'important');
      appMain.style.setProperty('max-height', availableHeight, 'important');
    }
  }

  function setupTopbar(sidebar) {
    if (document.querySelector('.kuryos-enterprise-topbar')) return;
    var context = activeContext(sidebar);
    var attentionAllowed = navigation.some(function (item) { return cleanPath(new URL(item.href, document.baseURI).pathname) === '/dashboard_executivo'; });
    var bar = document.createElement('div');
    bar.className = 'kuryos-enterprise-topbar';
    bar.setAttribute('role', 'banner');
    bar.innerHTML = '<div class="kuryos-topbar-context"><div class="kuryos-breadcrumbs"><span>Kuryos ERP</span>' + icon.chevron + '<span>' + context.group + '</span></div><div class="kuryos-topbar-title">' + context.page + '</div></div>' +
      '<div class="kuryos-global-search">' + icon.search + '<input type="search" aria-label="Busca global de módulos" placeholder="Buscar no sistema" autocomplete="off"><span class="kuryos-search-key">Ctrl K</span><div class="kuryos-search-results" role="listbox"></div></div>' +
      '<div class="kuryos-topbar-actions"><span class="kuryos-sector-pill" title="Contexto atual">' + context.group + '</span><button type="button" class="kuryos-topbar-icon kuryos-topbar-search-toggle" aria-label="Abrir busca">' + icon.search + '</button>' +
      (attentionAllowed ? '<a class="kuryos-topbar-icon kuryos-attention-link" href="dashboard_executivo#atencao" aria-label="Central de atenção" title="Central de atenção">' + icon.bell + '</a>' : '') + '</div>';
    var insertion = document.getElementById('kt-hamburger') || sidebar;
    insertion.insertAdjacentElement('afterend', bar);

    syncAppViewport();
    window.addEventListener('resize', syncAppViewport, { passive: true });

    var search = bar.querySelector('.kuryos-global-search');
    var input = search.querySelector('input');
    var results = search.querySelector('.kuryos-search-results');
    results.setAttribute('role', 'navigation');
    results.setAttribute('aria-label', 'Resultados da busca de módulos');
    var command = document.createElement('div');
    command.className = 'kuryos-command-search';
    command.hidden = true;
    command.setAttribute('aria-label', 'Buscar módulos autorizados');
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'kuryos-command-close';
    close.textContent = 'Fechar · Esc';
    command.appendChild(close);
    document.body.appendChild(command);
    var trigger = null;
    function openSearch() {
      trigger = document.activeElement;
      if (innerWidth > 980) {
        command.hidden = false;
        command.setAttribute('role', 'dialog');
        command.insertBefore(search, close);
      } else {
        command.hidden = true;
        command.removeAttribute('role');
        if (search.parentElement !== bar) bar.insertBefore(search, bar.querySelector('.kuryos-topbar-actions'));
        bar.classList.add('search-open');
      }
      input.focus();
      render();
    }
    function closeSearch(restoreFocus) {
      search.classList.remove('open');
      command.hidden = true;
      command.removeAttribute('role');
      bar.classList.remove('search-open');
      if (restoreFocus && trigger && trigger.isConnected) trigger.focus();
    }
    close.addEventListener('click', function () { closeSearch(true); });
    var launch = document.createElement('button');
    launch.type = 'button';
    launch.className = 'kuryos-sidebar-search-launch';
    launch.innerHTML = icon.search + '<span>Buscar</span><small>Ctrl K</small>';
    launch.setAttribute('aria-label', 'Buscar módulos — Ctrl K');
    launch.title = 'Buscar módulos — Ctrl K';
    sidebar.querySelector('.kt-sidebar-foot').insertAdjacentElement('beforebegin', launch);
    launch.addEventListener('click', openSearch);
    function render() {
      if (innerWidth > 980) {
        command.hidden = false;
        command.setAttribute('role', 'dialog');
        if (search.parentElement !== command) command.insertBefore(search, close);
      }
      var query = norm(input.value);
      var items = query ? navigation.filter(function (item) { return norm(item.label + ' ' + item.group).includes(query); }) : navigation;
      results.innerHTML = resultHtml(items);
      search.classList.add('open');
    }
    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (event) {
      var items = Array.from(results.querySelectorAll('.kuryos-search-result'));
      var active = results.querySelector('.active');
      var index = Math.max(0, items.indexOf(active));
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (active) active.classList.remove('active');
        index = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        if (items[index]) { items[index].classList.add('active'); items[index].scrollIntoView({ block: 'nearest' }); }
      } else if (event.key === 'Enter' && active) {
        location.href = active.href;
      } else if (event.key === 'Escape') {
        closeSearch(true);
      }
    });
    document.addEventListener('click', function (event) { if (!search.contains(event.target) && !launch.contains(event.target) && !event.target.closest('.kuryos-topbar-search-toggle')) closeSearch(false); });
    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); openSearch();
      }
    });
    bar.querySelector('.kuryos-topbar-search-toggle').addEventListener('click', function () {
      if (bar.classList.contains('search-open')) closeSearch(true);
      else openSearch();
    });
  }

  // build roda a cada mudança do DOM (MutationObserver abaixo). Depois de
  // montado, as sincronizações vão para o próximo quadro, uma vez só: antes
  // rodavam a cada mudança e, com tabelas grandes (Cadastros: 939 linhas +
  // troca de emoji por ícone), somavam ~8 s de CPU travada medindo layout.
  var syncAgendado = false;
  function build() {
    var sidebar = document.getElementById('unified-navbar');
    if (!sidebar) return;
    if (built) {
      if (syncAgendado) return;
      syncAgendado = true;
      requestAnimationFrame(function () { syncAgendado = false; syncRoute(sidebar); syncAppViewport(); });
      return;
    }
    built = true;
    setupSidebar(sidebar);
    setupTopbar(sidebar);
    syncRoute(sidebar);
    document.documentElement.setAttribute('data-kuryos-enterprise-shell', 'ready');
  }

  new MutationObserver(build).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });
  build();
})();
