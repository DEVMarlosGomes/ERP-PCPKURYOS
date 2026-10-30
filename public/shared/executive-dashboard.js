(function () {
  'use strict';

  var charts = {};
  var state = { data: {}, unavailable: {}, period: '30' };
  // Só os nós que a tela de fato usa (20/10/2026). Antes baixava também
  // expedicoes_comerciais (1,26 MB, quase todo histórico legado), paradas,
  // solicitações, estoque e quatro nós do CRM/P&D que nenhum cálculo lia:
  // ~1,9 MB a mais a cada abertura da primeira tela do ADM.
  var paths = {
    orders: 'pedidos', commercial: 'pedidos_comerciais', ops: 'ops',
    purchases: 'pedidos_compra', lots: 'estoque_lotes', quality: 'nao_conformidades',
    schedules: 'agendamentos_expedicao', projects: 'erp/kuryos/crm_projects', pd: 'erp/kuryos/pd_requests'
  };
  var svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>';

  function rows(value) { return Array.isArray(value) ? value.filter(Boolean) : Object.values(value || {}).filter(Boolean); }
  function number(value) { var parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
  function status(row) { return normalize(row && (row.status || row.situacao || row.stage || row.status_pd)); }
  function done(row) { return /CONCLUID|FINALIZ|RECEBIDO_TOTAL|EXPEDID|APROVAD/.test(status(row)); }
  function canceled(row) { return /CANCELAD/.test(status(row)); }
  function formatInt(value) { return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(number(value)); }
  function formatCurrency(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(number(value)); }
  function parseDate(value) { if (!value) return null; var date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
  function rowDate(row) {
    return parseDate(row && (row.dataFimReal || row.dataConclusao || row.dataEmissao || row.dataCriacao || row.criadoEm || row.created_at || row.updated_at || row.dataPedido));
  }
  function inPeriod(row) {
    if (state.period === 'all') return true;
    var date = rowDate(row);
    if (!date) return false;
    return date >= new Date(Date.now() - number(state.period) * 86400000);
  }
  function groupBy(list, getter) {
    return list.reduce(function (acc, item) { var key = getter(item) || 'Sem status'; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  }
  function sum(list, getter) { return list.reduce(function (total, item) { return total + number(getter(item)); }, 0); }
  function dateLabel() { return state.period === 'all' ? 'histórico completo' : 'últimos ' + state.period + ' dias'; }
  function read(path) {
    return firebase.database().ref(path).once('value').then(function (snapshot) { return snapshot.val() || {}; });
  }
  function load() {
    document.getElementById('executive-live').textContent = 'Atualizando fontes';
    return Promise.all(Object.keys(paths).map(function (key) {
      return read(paths[key]).then(function (value) { state.data[key] = value; delete state.unavailable[key]; })
        .catch(function (error) { state.data[key] = {}; state.unavailable[key] = error && (error.code || error.message) || 'indisponível'; });
    })).then(function () {
      render();
      document.getElementById('executive-live').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }).catch(function () {
      document.getElementById('executive-live').textContent = 'Falha ao atualizar';
    });
  }

  function kpi(label, value, meta, href, tone, unavailable) {
    var tag = href ? 'a' : 'article';
    return '<' + tag + (href ? ' href="' + href + '"' : '') + ' class="executive-kpi' + (unavailable ? ' unavailable' : '') + '" data-tone="' + (tone || 'brand') + '">' +
      '<div class="executive-kpi-label"><span>' + label + '</span>' + svg + '</div><div class="executive-kpi-value">' + value + '</div><div class="executive-kpi-meta">' + meta + '</div></' + tag + '>';
  }
  function renderKpis() {
    var orders = rows(state.data.orders), activeOrders = orders.filter(function (row) { return !done(row) && !canceled(row); });
    var commercial = rows(state.data.commercial).filter(function (row) { return !canceled(row) && inPeriod(row); });
    var opsPeriod = rows(state.data.ops).filter(function (row) { return !canceled(row) && done(row) && inPeriod(row); });
    var activeOps = rows(state.data.ops).filter(function (row) { return !done(row) && !canceled(row); });
    var purchases = rows(state.data.purchases).filter(function (row) { return !done(row) && !canceled(row); });
    var pd = rows(state.data.pd).filter(function (row) { return !done(row) && !canceled(row); });
    var lots = lotRows(state.data.lots), quarantine = lots.filter(function (row) { return status(row) === 'QUARENTENA'; });
    var planned = sum(opsPeriod, function (row) { return row.qtdPlanejada; }), produced = sum(opsPeriod, function (row) { return row.produzido; });
    var adherence = planned > 0 ? Math.round(produced / planned * 100) + '%' : 'N/D';
    var cards = [
      kpi('Pedidos em carteira', formatInt(activeOrders.length), 'Fonte: pedidos/ · estado atual', 'pedidos.html', activeOrders.length > 70 ? 'warning' : 'brand'),
      kpi('Carteira comercial registrada', formatCurrency(sum(commercial, function (row) { return row.totalValor; })), 'Fonte: pedidos_comerciais/ · ' + dateLabel(), 'gestao_comercial.html', 'brand'),
      kpi('Aderência das OPs concluídas', adherence, planned ? formatInt(produced) + ' de ' + formatInt(planned) + ' un · ' + dateLabel() : 'Sem OP concluída com quantidade no período', 'dashboard_analise.html?tab=planejamento', adherence === 'N/D' ? 'warning' : 'success', adherence === 'N/D'),
      kpi('OPs em execução ou fila', formatInt(activeOps.length), 'Fonte: ops/ · exclui concluídas e canceladas', 'ops.html', activeOps.length > 35 ? 'warning' : 'brand'),
      kpi('Pedidos de compra abertos', formatInt(purchases.length), 'Enviados e recebidos parcialmente', 'compras.html', purchases.length ? 'warning' : 'success'),
      kpi('Projetos P&D ativos', formatInt(pd.length), 'Fonte: erp/kuryos/pd_requests', 'pd.html', 'brand'),
      kpi('Lotes em quarentena', state.unavailable.lots ? 'Sem acesso' : formatInt(quarantine.length), state.unavailable.lots ? 'A fonte não está autorizada para este perfil' : 'Fonte: estoque_lotes/ · decisão da Qualidade', 'qualidade.html?tab=fila', quarantine.length ? 'warning' : 'success', !!state.unavailable.lots),
      kpi('Entregas OTIF', 'N/D', 'Datas prometida e efetiva não estão completas na mesma fonte', '', 'warning', true),
      kpi('Estoque crítico', 'N/D', 'Saldo não confiável até o inventário físico Dia D', 'consulta_estoque.html', 'warning', true),
      kpi('Faturamento realizado', 'N/D', 'Não existe razão financeira transacional confiável no sistema', '', 'warning', true)
    ];
    document.getElementById('executive-kpis').innerHTML = cards.join('');
  }

  function lotRows(value) {
    var output = [];
    Object.values(value || {}).forEach(function (group) {
      if (!group || typeof group !== 'object') return;
      if (group.status || group.loteInterno || group.saldoLote != null) output.push(group);
      else Object.values(group).forEach(function (lot) { if (lot && typeof lot === 'object') output.push(lot); });
    });
    return output;
  }
  // Paleta dos tokens do tema (a mesma --chart-1..5 do ERP), lida a cada desenho
  // para acompanhar claro/escuro. O navy puro some no fundo escuro, por isso a
  // cor principal dos gráficos é o pervinca da marca.
  function token(name, fallback) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
  function chartColor(n) { var v = token('--chart-' + n, ''); return v ? 'hsl(' + v + ')' : ['#6485f2', '#1fa874', '#17a2e0', '#f0a020', '#e5486e'][n - 1]; }
  function palette(count) {
    var colors = [chartColor(1), chartColor(2), chartColor(3), chartColor(4), chartColor(5), token('--k-purple', '#8557ce'), token('--k-brand-300', '#acbcd4'), token('--k-brand-700', '#28458f')];
    return Array.from({ length: count }, function (_, index) { return colors[index % colors.length]; });
  }
  function chart(id, config) {
    if (!window.Chart) { document.getElementById(id).parentElement.innerHTML = '<div class="executive-empty">Biblioteca de gráficos indisponível.</div>'; return; }
    if (charts[id]) charts[id].destroy();
    // Fontes, grade, tooltip e legenda vêm do tema global (shared/kuryos-erp-ref.js).
    config.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 480 } }, config.options || {});
    charts[id] = new Chart(document.getElementById(id), config);
  }
  function renderCharts() {
    var orders = rows(state.data.orders).filter(function (row) { return !canceled(row); });
    var orderGroups = groupBy(orders, function (row) { return row.status || 'Sem status'; });
    chart('executive-orders-chart', { type: 'doughnut', data: { labels: Object.keys(orderGroups), datasets: [{ data: Object.values(orderGroups), backgroundColor: palette(Object.keys(orderGroups).length) }] }, options: { plugins: { legend: { position: 'bottom' } } } });

    var purchases = rows(state.data.purchases).filter(function (row) { return !canceled(row); });
    var purchaseGroups = groupBy(purchases, function (row) { return String(row.status || 'Sem status').replaceAll('_', ' '); });
    chart('executive-purchases-chart', { type: 'doughnut', data: { labels: Object.keys(purchaseGroups), datasets: [{ data: Object.values(purchaseGroups), backgroundColor: palette(Object.keys(purchaseGroups).length) }] }, options: { plugins: { legend: { position: 'bottom' } } } });

    var ops = rows(state.data.ops).filter(function (row) { return !canceled(row) && done(row) && inPeriod(row); });
    var monthly = {};
    ops.forEach(function (row) { var date = rowDate(row); if (!date) return; var key = date.toISOString().slice(0, 7); monthly[key] = monthly[key] || { planned: 0, produced: 0 }; monthly[key].planned += number(row.qtdPlanejada); monthly[key].produced += number(row.produzido); });
    var labels = Object.keys(monthly).sort();
    if (labels.length > 12) labels = labels.slice(-12);
    chart('executive-production-chart', { type: 'bar', data: { labels: labels.map(monthLabel), datasets: [{ label: 'Planejado', data: labels.map(function (key) { return monthly[key].planned; }), backgroundColor: token('--k-brand-300', '#acbcd4') }, { label: 'Realizado', data: labels.map(function (key) { return monthly[key].produced; }), backgroundColor: chartColor(1) }] }, options: { scales: { y: { beginAtZero: true } } } });
    chart('executive-trend-chart', { type: 'line', data: { labels: labels.map(monthLabel), datasets: [{ label: 'Unidades produzidas', data: labels.map(function (key) { return monthly[key].produced; }), borderColor: chartColor(1), backgroundColor: chartColor(1), fill: true }] }, options: { scales: { y: { beginAtZero: true } } } });
  }
  function monthLabel(key) { var parts = key.split('-'); return new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }); }

  function flowStep(index, name, value, detail, href, stateName) {
    var tag = href ? 'a' : 'article';
    return '<' + tag + (href ? ' href="' + href + '"' : '') + ' class="executive-flow-step" data-state="' + (stateName || 'ok') + '"><div class="executive-flow-index">ETAPA ' + String(index).padStart(2, '0') + '</div><div class="executive-flow-name">' + name + '</div><div class="executive-flow-value">' + value + '</div><div class="executive-flow-detail">' + detail + '</div></' + tag + '>';
  }
  function renderFlow() {
    var activeOrders = rows(state.data.orders).filter(function (row) { return !done(row) && !canceled(row); });
    var activePd = rows(state.data.pd).filter(function (row) { return !done(row) && !canceled(row); });
    var activeOps = rows(state.data.ops).filter(function (row) { return !done(row) && !canceled(row); });
    var purchaseOpen = rows(state.data.purchases).filter(function (row) { return !done(row) && !canceled(row); });
    var quarantine = lotRows(state.data.lots).filter(function (row) { return status(row) === 'QUARENTENA'; });
    var schedules = rows(state.data.schedules).filter(function (row) { return !done(row) && !canceled(row); });
    document.getElementById('executive-flow').innerHTML = [
      flowStep(1, 'Comercial', formatInt(rows(state.data.projects).length), 'projetos CRM', 'crm2.html', 'ok'),
      flowStep(2, 'P&D', formatInt(activePd.length), 'desenvolvimentos ativos', 'pd.html', activePd.length ? 'attention' : 'ok'),
      flowStep(3, 'PCP', formatInt(activeOrders.length), 'pedidos em carteira', 'planejamento.html', activeOrders.length > 70 ? 'attention' : 'ok'),
      flowStep(4, 'Compras', formatInt(purchaseOpen.length), 'pedidos abertos', 'compras.html', purchaseOpen.length ? 'attention' : 'ok'),
      flowStep(5, 'Produção', formatInt(activeOps.length), 'OPs em fila/execução', 'ops.html', activeOps.length > 35 ? 'attention' : 'ok'),
      flowStep(6, 'Qualidade', state.unavailable.lots ? 'N/D' : formatInt(quarantine.length), state.unavailable.lots ? 'fonte sem acesso' : 'lotes em quarentena', 'qualidade.html?tab=fila', quarantine.length ? 'attention' : 'ok'),
      flowStep(7, 'Estoque', 'N/D', 'inventário Dia D pendente', 'consulta_estoque.html', 'unavailable'),
      flowStep(8, 'Expedição', formatInt(schedules.length), 'agendas abertas', 'cargas.html', schedules.length ? 'attention' : 'ok'),
      flowStep(9, 'Faturamento', 'N/D', 'sem razão financeira', 'faturamento.html', 'unavailable')
    ].join('');
  }

  function attention(label, detail, count, href, level) {
    return '<a class="executive-attention" data-level="' + level + '" href="' + href + '"><span class="executive-attention-dot"></span><span><strong>' + label + '</strong><small>' + detail + '</small></span><span class="executive-attention-count">' + formatInt(count) + '</span></a>';
  }
  function renderAttention() {
    var orders = rows(state.data.orders), ops = rows(state.data.ops), purchases = rows(state.data.purchases), lots = lotRows(state.data.lots), rncs = rows(state.data.quality);
    var partialOrders = orders.filter(function (row) { return status(row).includes('PRODUCAO PARCIAL'); }).length;
    var unstarted = orders.filter(function (row) { return status(row).includes('NAO INICIADO'); }).length;
    var partialOps = ops.filter(function (row) { return status(row).includes('PRODUCAO PARCIAL'); }).length;
    var waitingConfirmation = ops.filter(function (row) { return status(row).includes('AGUARDANDO CONFIRMACAO'); }).length;
    var latePurchases = purchases.filter(function (row) { var date = parseDate(row.dataPrevistaEntrega); return date && date < new Date() && !done(row) && !canceled(row); }).length;
    var quarantine = lots.filter(function (row) { return status(row) === 'QUARENTENA'; }).length;
    var rejected = lots.filter(function (row) { return status(row) === 'REPROVADO'; }).length;
    var openRncs = rncs.filter(function (row) { return !done(row) && !canceled(row); }).length;
    var items = [];
    if (latePurchases) items.push(attention('Compras com entrega prevista vencida', 'Critério: data prevista anterior a hoje e pedido ainda aberto.', latePurchases, 'compras.html', 'danger'));
    if (rejected) items.push(attention('Lotes reprovados pela Qualidade', 'Material fisicamente presente, porém indisponível para consumo.', rejected, 'qualidade.html?tab=fila', 'danger'));
    if (openRncs) items.push(attention('Não conformidades abertas', 'Ocorrências sem decisão final registrada.', openRncs, 'qualidade.html?tab=rnc', 'danger'));
    if (partialOrders) items.push(attention('Pedidos com produção parcial', 'Backlog já iniciado que ainda requer conclusão.', partialOrders, 'pedidos.html', 'warning'));
    if (unstarted) items.push(attention('Pedidos ainda não iniciados', 'Sem classificar atraso porque nem todos possuem data confiável.', unstarted, 'planejamento.html', 'warning'));
    if (partialOps) items.push(attention('OPs em produção parcial', 'Ordens com apontamento, mas quantidade planejada não concluída.', partialOps, 'ops.html', 'warning'));
    if (waitingConfirmation) items.push(attention('OPs aguardando confirmação', 'Ordens que dependem de validação do PCP.', waitingConfirmation, 'ops.html', 'warning'));
    if (quarantine) items.push(attention('Lotes aguardando Qualidade', 'Quarentena bloqueia consumo ou expedição.', quarantine, 'qualidade.html?tab=fila', 'warning'));
    document.getElementById('executive-attention').innerHTML = items.length ? items.join('') : '<div class="executive-empty">Nenhuma pendência foi identificada nas fontes disponíveis.</div>';
    document.getElementById('executive-data-notes').innerHTML = [
      '<div class="executive-note"><strong>Estoque sem decisão automática</strong><p>Somente 95 de 939 materiais têm saldo e o inventário Dia D ainda não foi concluído.</p></div>',
      '<div class="executive-note"><strong>Prazo não inferido</strong><p>Pedidos sem data permanecem como backlog; não são classificados artificialmente como no prazo ou atrasados.</p></div>',
      '<div class="executive-note"><strong>Financeiro indisponível</strong><p>Não há razão transacional suficiente para faturamento, margem, lucro ou EBITDA confiáveis.</p></div>'
    ].join('');
  }

  function render() { renderKpis(); renderCharts(); renderFlow(); renderAttention(); }
  function init() {
    var query = new URLSearchParams(location.search);
    state.period = ['30', '90', '365', 'all'].includes(query.get('periodo')) ? query.get('periodo') : '30';
    var period = document.getElementById('executive-period');
    period.value = state.period;
    period.addEventListener('change', function () {
      state.period = period.value;
      var url = new URL(location.href); url.searchParams.set('periodo', state.period); history.replaceState(null, '', url);
      render();
    });
    new MutationObserver(function () { if (Object.keys(state.data).length) renderCharts(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
