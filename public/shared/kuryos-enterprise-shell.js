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

  function text(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
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

    var collapsed = false;
    try { collapsed = localStorage.getItem('kuryos.sidebar.collapsed') === '1'; } catch (error) {}
    document.body.classList.toggle('kuryos-sidebar-collapsed', collapsed);
    var collapse = tools.querySelector('.kuryos-sidebar-collapse');
    collapse.setAttribute('aria-pressed', String(collapsed));
    collapse.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
    collapse.title = collapsed ? 'Expandir menu' : 'Recolher menu';
    collapse.addEventListener('click', function () {
      collapsed = document.body.classList.contains('kuryos-sidebar-collapsed');
      document.body.classList.toggle('kuryos-sidebar-collapsed', !collapsed);
      collapsed = !collapsed;
      collapse.setAttribute('aria-pressed', String(collapsed));
      collapse.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
      collapse.title = collapsed ? 'Expandir menu' : 'Recolher menu';
      try { localStorage.setItem('kuryos.sidebar.collapsed', collapsed ? '1' : '0'); } catch (error) {}
    });

    sidebar.querySelectorAll('.kt-nav-link').forEach(function (link) {
      var label = text(link.textContent);
      link.title = label;
      var span = document.createElement('span');
      span.textContent = label;
      Array.from(link.childNodes).forEach(function (node) { if (node.nodeType === Node.TEXT_NODE) node.remove(); });
      if (!link.querySelector('span')) link.appendChild(span);
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
      var links = Array.from(sidebar.querySelectorAll('.kt-nav-link:not([hidden])'));
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
    var bar = document.createElement('div');
    bar.className = 'kuryos-enterprise-topbar';
    bar.setAttribute('role', 'banner');
    bar.innerHTML = '<div class="kuryos-topbar-context"><div class="kuryos-breadcrumbs"><span>Kuryos ERP</span>' + icon.chevron + '<span>' + context.group + '</span></div><div class="kuryos-topbar-title">' + context.page + '</div></div>' +
      '<div class="kuryos-global-search">' + icon.search + '<input type="search" aria-label="Busca global de módulos" placeholder="Buscar no sistema" autocomplete="off"><span class="kuryos-search-key">Ctrl K</span><div class="kuryos-search-results" role="listbox"></div></div>' +
      '<div class="kuryos-topbar-actions"><span class="kuryos-sector-pill" title="Contexto atual">' + context.group + '</span><button type="button" class="kuryos-topbar-icon kuryos-topbar-search-toggle" aria-label="Abrir busca">' + icon.search + '</button><a class="kuryos-topbar-icon kuryos-attention-link" href="dashboard_executivo.html#atencao" aria-label="Central de atenção" title="Central de atenção">' + icon.bell + '</a></div>';
    var insertion = document.getElementById('kt-hamburger') || sidebar;
    insertion.insertAdjacentElement('afterend', bar);

    syncAppViewport();
    window.addEventListener('resize', syncAppViewport, { passive: true });

    var search = bar.querySelector('.kuryos-global-search');
    var input = search.querySelector('input');
    var results = search.querySelector('.kuryos-search-results');
    function render() {
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
        search.classList.remove('open'); input.blur();
      }
    });
    document.addEventListener('click', function (event) { if (!search.contains(event.target)) search.classList.remove('open'); });
    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); bar.classList.add('search-open'); input.focus(); render();
      }
    });
    bar.querySelector('.kuryos-topbar-search-toggle').addEventListener('click', function () {
      bar.classList.toggle('search-open');
      if (bar.classList.contains('search-open')) { input.focus(); render(); }
    });
  }

  function build() {
    var sidebar = document.getElementById('unified-navbar');
    if (!sidebar) return;
    if (built) { syncAppViewport(); return; }
    built = true;
    setupSidebar(sidebar);
    setupTopbar(sidebar);
    document.documentElement.setAttribute('data-kuryos-enterprise-shell', 'ready');
  }

  new MutationObserver(build).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });
  build();
})();
