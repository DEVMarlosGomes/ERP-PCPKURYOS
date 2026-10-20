/* Aspecto do ERP (erpkuryos.web.app) no PCP -- comportamento que acompanha
   shared/kuryos-erp-ref.css. Carregado em todas as telas pelo auth_check.js.
   A navegação segue na barra lateral inteligente do PCP (o menu no topo do
   ERP foi testado e recusado pelo usuário em 20/10/2026).
   - Ícone da seção antes do título da página, como no ERP.
   - Gráficos: acabamento do ERP no Chart.js (fontes, grade, tooltip, barras
     arredondadas, rosca fina, área com degradê), seguindo o tema claro/escuro.
   Não lê nem grava dados. */
(function () {
  'use strict';

  function css(nome) { return getComputedStyle(document.documentElement).getPropertyValue(nome).trim(); }

  /* ── Ícone antes do título ────────────────────────────────────────────── */
  function iconeDoTitulo() {
    var h1 = document.querySelector('[data-ui="page-header"] h1, .executive-hero h1, .sector-head h1, body.dashboard-showcase .top-row h1');
    // Título que já traz ícone próprio (ex.: Controle de OPs) fica como está.
    // O emoji pode ainda não ter virado SVG (o sistema de ícones roda em paralelo).
    if (!h1 || h1.querySelector('.kr-page-icon, svg, img') || /^\s*[^\p{L}\p{N}\s]/u.test(h1.textContent)) return;
    var ativo = document.querySelector('#unified-navbar .kt-nav-link.active svg');
    if (!ativo) return;
    var span = document.createElement('span');
    span.className = 'kr-page-icon';
    span.setAttribute('aria-hidden', 'true');
    span.appendChild(ativo.cloneNode(true));
    h1.insertBefore(span, h1.firstChild);
  }

  /* ── Gráficos ─────────────────────────────────────────────────────────── */
  function comAlfa(cor, alfa) {
    // Aceita #rgb/#rrggbb e rgb()/rgba(); qualquer outra coisa volta como está.
    if (typeof cor !== 'string') return cor;
    var m = cor.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      var h = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + alfa + ')';
    }
    m = cor.match(/^rgba?\(([^,]+),([^,]+),([^,)]+)/i);
    if (m) return 'rgba(' + m[1].trim() + ',' + m[2].trim() + ',' + m[3].trim() + ',' + alfa + ')';
    // hsl(224 91% 66%) ou hsl(224, 91%, 66%) -- formato dos tokens --chart-*.
    m = cor.match(/^hsla?\(([^)]+)\)$/i);
    if (m) return 'hsl(' + m[1].split('/')[0].replace(/,/g, ' ').trim() + ' / ' + alfa + ')';
    return cor;
  }
  var BRANCOS = { '#fff': 1, '#ffffff': 1, 'white': 1 };
  // Cinzas-claros fixos de grade (Tailwind slate/gray 100-200): no escuro viravam
  // um tracejado quase branco. Passam a seguir o token de borda.
  var GRADES_CLARAS = { '#f1f5f9': 1, '#e2e8f0': 1, '#f3f4f6': 1, '#e5e7eb': 1, '#eee': 1, '#eeeeee': 1, '#f0f0f0': 1 };

  function aplicarPadroes() {
    var C = window.Chart;
    var d = C.defaults;
    var texto2 = css('--k-text-2') || '#646b78';
    var borda = css('--k-border') || '#dfe3ea';
    var superficie = css('--k-surface') || '#ffffff';
    d.font.family = css('--k-ui-font-body') || 'Manrope, sans-serif';
    d.font.size = 12;
    d.color = texto2;
    d.borderColor = borda;
    var leg = d.plugins.legend.labels;
    leg.usePointStyle = true; leg.pointStyle = 'circle'; leg.boxWidth = 8; leg.boxHeight = 8; leg.padding = 16;
    leg.font = { family: d.font.family, size: 12, weight: '500' };
    var tip = d.plugins.tooltip;
    tip.backgroundColor = css('--k-bg-elevated') || '#ffffff';
    tip.titleColor = css('--k-text') || '#0e1320';
    tip.bodyColor = texto2;
    tip.borderColor = borda;
    tip.borderWidth = 1;
    tip.padding = 12;
    tip.cornerRadius = 8;
    tip.boxPadding = 4;
    tip.usePointStyle = true;
    tip.titleFont = { family: css('--k-ui-font-heading') || 'Outfit, sans-serif', size: 13, weight: '600' };
    tip.bodyFont = { family: d.font.family, size: 12 };
    d.elements.bar.borderRadius = 6;
    d.elements.line.tension = 0.35;
    d.elements.line.borderWidth = 2.5;
    d.elements.point.radius = 0;
    d.elements.point.hoverRadius = 5;
    d.elements.point.hitRadius = 12;
    d.elements.arc.borderWidth = 2;
    d.elements.arc.borderColor = superficie;
    // Cada ajuste isolado: nó ausente numa versão do Chart.js não pode anular os
    // outros (antes, num try só, o eixo de categorias derrubava o resto).
    function ramo(o, k) { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; return o[k]; }
    function ajuste(fn) { try { fn(); } catch (e) { /* segue com os demais */ } }
    ajuste(function () { ramo(d.datasets, 'bar').maxBarThickness = 40; });
    ajuste(function () { ramo(d.datasets, 'doughnut').cutout = '72%'; });
    ajuste(function () {
      ramo(d.scale, 'grid').color = borda;
      var b = ramo(d.scale, 'border'); b.display = false; b.dash = [3, 4];
      ramo(d.scale, 'ticks').padding = 8;
    });
    ajuste(function () { ramo(ramo(d.scales, 'category'), 'grid').display = false; });
    // Escala radial (polar/radar): número sem caixa branca, grade no token.
    ajuste(function () {
      var r = ramo(d.scales, 'radialLinear');
      ramo(r, 'ticks').backdropColor = 'transparent';
      ramo(r, 'grid').color = borda;
      ramo(r, 'angleLines').color = borda;
    });
  }

  // Área com degradê nas linhas preenchidas e grade só no eixo de valores.
  var acabamento = {
    id: 'kuryosErpRef',
    // Rosca/pizza com borda branca fixa vira a cor da superfície: no escuro o
    // branco riscava cada fatia.
    beforeInit: function (chart) {
      var tipoGrafico = chart.config.type;
      (chart.data.datasets || []).forEach(function (ds) {
        var tipo = ds.type || tipoGrafico;
        if ((tipo === 'doughnut' || tipo === 'pie' || tipo === 'polarArea') && typeof ds.borderColor === 'string' && BRANCOS[ds.borderColor.toLowerCase()]) {
          ds.borderColor = function () { return css('--k-surface') || '#ffffff'; };
        }
      });
      var escalas = (chart.config.options && chart.config.options.scales) || {};
      Object.keys(escalas).forEach(function (k) {
        var grid = escalas[k] && escalas[k].grid;
        if (grid && typeof grid.color === 'string' && GRADES_CLARAS[grid.color.toLowerCase()]) {
          grid.color = function () { return css('--k-border') || '#dfe3ea'; };
        }
      });
    },
    beforeUpdate: function (chart) {
      (chart.data.datasets || []).forEach(function (ds) {
        var tipo = ds.type || chart.config.type;
        if (tipo === 'line' && ds.fill && typeof ds.backgroundColor === 'string' && !ds.__krGrad) {
          var base = ds.borderColor || ds.backgroundColor;
          ds.__krBase = base;
          ds.__krGrad = true;
          ds.backgroundColor = function (ctx) {
            var a = ctx.chart.chartArea;
            if (!a) return comAlfa(base, 0.15);
            var g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
            g.addColorStop(0, comAlfa(base, 0.28));
            g.addColorStop(1, comAlfa(base, 0));
            return g;
          };
        }
      });
    }
  };

  function temaGraficos() {
    var C = window.Chart;
    if (!C || !C.defaults || C.__krTema) return !!(C && C.__krTema);
    C.__krTema = true;
    aplicarPadroes();
    try { C.register(acabamento); } catch (e) {}
    atualizarGraficos();
    // Troca de tema: refaz as cores a partir dos tokens.
    new MutationObserver(function () { aplicarPadroes(); atualizarGraficos(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return true;
  }
  function atualizarGraficos() {
    var C = window.Chart;
    if (!C || !C.instances) return;
    Object.keys(C.instances).forEach(function (k) { try { C.instances[k].update('none'); } catch (e) {} });
  }

  /* ── Ligação ──────────────────────────────────────────────────────────── */
  function verificar() {
    var nav = document.getElementById('unified-navbar');
    if (nav) iconeDoTitulo();
  }
  new MutationObserver(verificar).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', verificar, { once: true });
  verificar();

  // O Chart.js chega depois deste script em várias telas: espera por ele.
  if (!temaGraficos()) {
    var tentativas = 0;
    var t = setInterval(function () { if (temaGraficos() || ++tentativas > 300) clearInterval(t); }, 50);
  }
})();
