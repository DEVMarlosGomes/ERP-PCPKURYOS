(function () {
  'use strict';

  var knownPdRoutes = new Set(['formulas', 'homologacao', 'catalog', 'estoque', 'relatorios']);
  var icon = {
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 8H6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg>'
  };

  function requestIdFromPath() {
    var parts = location.pathname.split('/').filter(Boolean);
    return parts.length === 2 && parts[0] === 'pd' && !knownPdRoutes.has(parts[1]) ? decodeURIComponent(parts[1]) : null;
  }

  function api() { return globalThis.__KURYOS_PD_API__; }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }
  function norm(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function materialLabel(item) { return (item.codigo_interno || item.id) + ' — ' + (item.nome || item.descricao || ''); }

  // 17/10/2026: o botão saiu da tela (era flutuante sobre todas as abas) e foi para a aba
  // Custos P&D, que chama __KURYOS_MASTER_INTEGRATION__.openDialog. Aqui só remove o antigo.
  function ensureAction() {
    var current = document.getElementById('kuryos-pd-purchase-action');
    if (current) current.remove();
  }
  globalThis.__KURYOS_MASTER_INTEGRATION__ = { ensureAction: ensureAction, openDialog: openDialog };

  async function loadContext(requestId) {
    var values = await Promise.all([
      api().get('/pd/requests/' + requestId + '/full'),
      api().get('/pd/catalog'),
      api().get('/pd/requests/' + requestId + '/purchase-requests')
    ]);
    return { full: values[0].data, catalog: values[1].data || [], requests: values[2].data || [] };
  }

  function suggestedRows(context) {
    var formulas = (context.full.formulas || []).slice().sort(function (a, b) { return Number(b.version || 0) - Number(a.version || 0); });
    var items = formulas[0] ? formulas[0].items || [] : [];
    var byId = new Map();
    var byName = new Map();
    context.catalog.forEach(function (item) {
      [item.id, item.master_material_id, item.codigo_interno].filter(Boolean).forEach(function (id) { byId.set(id, item); });
      byName.set(norm(item.nome || item.descricao), item);
    });
    var rows = items.map(function (item) {
      var material = byId.get(item.catalog_id || item.material_id || item.master_material_id) || byName.get(norm(item.ingredient_name || item.nome));
      return {
        material: material || null,
        quantidade: '',
        unidade: (material && (material.unidade_compra || material.unidade)) || 'kg',
        observacao: item.ingredient_name ? 'Fórmula: ' + item.ingredient_name + (item.percentage ? ' (' + item.percentage + '%)' : '') : '',
        formulaItemId: item.id || ''
      };
    }).filter(function (row) { return row.material; });
    return rows.length ? rows : [{ material: null, quantidade: '', unidade: 'kg', observacao: '', formulaItemId: '' }];
  }

  function requestHistoryHtml(requests) {
    if (!requests.length) return '<p class="kuryos-integration-note">Nenhuma solicitação enviada por este desenvolvimento.</p>';
    return '<div class="kuryos-purchase-history">' + requests.map(function (item) {
      var count = Object.keys(item.itens || {}).length;
      return '<div class="kuryos-purchase-card"><div><strong>' + esc(item.numeroFormatado || item.numero || item.id) + '</strong><span>' + count + ' item(ns) · ' + esc(item.justificativa || '') + '</span></div><span class="kuryos-status-pill">' + esc(item.status || 'PENDENTE') + '</span></div>';
    }).join('') + '</div>';
  }

  function rowHtml(row, catalog) {
    var value = row.material ? materialLabel(row.material) : '';
    return '<div class="kuryos-material-row" data-formula-item-id="' + esc(row.formulaItemId) + '">' +
      '<input class="kuryos-material-input" list="kuryos-master-materials" placeholder="Busque código ou material" value="' + esc(value) + '">' +
      '<input class="kuryos-material-qty" type="number" min="0.001" step="0.001" placeholder="Quantidade" value="' + esc(row.quantidade) + '">' +
      '<input class="kuryos-material-unit" placeholder="Unidade" value="' + esc(row.unidade) + '">' +
      '<input class="kuryos-material-note" placeholder="Observação" value="' + esc(row.observacao) + '">' +
      '<button class="kuryos-icon-button kuryos-remove-material" type="button" aria-label="Remover material">' + icon.trash + '</button>' +
    '</div>';
  }

  async function openDialog(requestId) {
    if (document.querySelector('.kuryos-integration-overlay')) return;
    var overlay = document.createElement('div');
    overlay.className = 'kuryos-integration-overlay';
    overlay.innerHTML = '<section class="kuryos-integration-dialog" role="dialog" aria-modal="true" aria-label="Enviar necessidade para Compras"><div class="kuryos-integration-loading">Carregando dados integrados…</div></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) overlay.remove(); });
    try {
      var context = await loadContext(requestId);
      var rows = suggestedRows(context);
      var dialog = overlay.querySelector('.kuryos-integration-dialog');
      dialog.innerHTML =
        '<header class="kuryos-integration-head"><div><h2>Enviar necessidade para Compras</h2><p>' + esc(context.full.request.title || context.full.request.project_name || 'Desenvolvimento P&D') + ' · materiais do cadastro mestre</p></div><button class="kuryos-icon-button kuryos-close-integration" type="button" aria-label="Fechar">' + icon.close + '</button></header>' +
        '<div class="kuryos-integration-body"><section class="kuryos-integration-section"><h3>Materiais necessários</h3><p class="kuryos-integration-note">Selecione materiais cadastrados e informe a quantidade para orçamento. O saldo não é usado para sugerir compra enquanto o inventário físico não estiver concluído.</p><datalist id="kuryos-master-materials">' + context.catalog.filter(function (item) { return item.master_material_id; }).map(function (item) { return '<option value="' + esc(materialLabel(item)) + '"></option>'; }).join('') + '</datalist><div class="kuryos-material-rows">' + rows.map(function (row) { return rowHtml(row, context.catalog); }).join('') + '</div><button class="kuryos-secondary-button kuryos-add-material" type="button">Adicionar material</button></section><section class="kuryos-integration-section"><h3>Justificativa para Compras</h3><textarea class="kuryos-purchase-reason" placeholder="Explique a necessidade, prazo ou especificação relevante">Necessidade para desenvolvimento de ' + esc(context.full.request.title || context.full.request.project_name || '') + '</textarea></section><section class="kuryos-integration-section"><h3>Solicitações anteriores</h3>' + requestHistoryHtml(context.requests) + '</section></div>' +
        '<footer class="kuryos-integration-foot"><button class="kuryos-secondary-button kuryos-close-integration" type="button">Cancelar</button><button class="kuryos-primary-button kuryos-submit-purchase" type="button">Criar solicitação em Compras</button></footer>';

      dialog.querySelectorAll('.kuryos-close-integration').forEach(function (button) { button.addEventListener('click', function () { overlay.remove(); }); });
      dialog.querySelector('.kuryos-add-material').addEventListener('click', function () {
        dialog.querySelector('.kuryos-material-rows').insertAdjacentHTML('beforeend', rowHtml({ material: null, quantidade: '', unidade: 'kg', observacao: '', formulaItemId: '' }, context.catalog));
      });
      dialog.querySelector('.kuryos-material-rows').addEventListener('click', function (event) {
        var button = event.target.closest('.kuryos-remove-material');
        if (button) button.closest('.kuryos-material-row').remove();
      });
      dialog.querySelector('.kuryos-submit-purchase').addEventListener('click', async function (event) {
        var submit = event.currentTarget;
        var byCode = new Map();
        context.catalog.forEach(function (item) { [item.id, item.master_material_id, item.codigo_interno].filter(Boolean).forEach(function (key) { byCode.set(String(key), item); }); });
        var items = Array.from(dialog.querySelectorAll('.kuryos-material-row')).map(function (row) {
          var raw = row.querySelector('.kuryos-material-input').value.trim();
          var code = raw.split(' — ')[0].trim();
          var material = byCode.get(code);
          return material ? {
            material_id: material.master_material_id || material.id,
            quantidade: Number(row.querySelector('.kuryos-material-qty').value),
            unidade: row.querySelector('.kuryos-material-unit').value.trim(),
            observacao: row.querySelector('.kuryos-material-note').value.trim(),
            formula_item_id: row.dataset.formulaItemId || null
          } : null;
        }).filter(function (item) { return item && item.quantidade > 0; });
        if (!items.length) {
          alert('Selecione ao menos um material cadastrado e informe a quantidade.');
          return;
        }
        submit.disabled = true;
        submit.textContent = 'Enviando…';
        try {
          var response = await api().post('/pd/requests/' + requestId + '/purchase-requests', {
            development_id: context.full.development && context.full.development.id,
            justificativa: dialog.querySelector('.kuryos-purchase-reason').value.trim(),
            items: items
          });
          overlay.remove();
          alert(response.data.numeroFormatado + ' criada em Compras com sucesso.');
        } catch (error) {
          alert((error.response && error.response.data && error.response.data.detail) || error.message || 'Não foi possível enviar para Compras.');
          submit.disabled = false;
          submit.textContent = 'Criar solicitação em Compras';
        }
      });
    } catch (error) {
      overlay.querySelector('.kuryos-integration-dialog').innerHTML = '<div class="kuryos-integration-loading">Não foi possível carregar a integração com Compras.<br><button class="kuryos-secondary-button" type="button">Fechar</button></div>';
      overlay.querySelector('button').addEventListener('click', function () { overlay.remove(); });
    }
  }

  function schedule() {
    try { ensureAction(); }
    catch (error) { globalThis.__KURYOS_MASTER_INTEGRATION_ERROR__ = error && (error.stack || error.message) || String(error); }
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  document.addEventListener('click', function () { setTimeout(schedule, 0); });
  setInterval(schedule, 1000);
  schedule();
})();
