'use strict';
/* 08/11/2026 — KPIs que faltavam nos painéis de análise:
   - Executivo: "Expedido no período" (expedicoes_comerciais, pela data da SAÍDA, não pela importação)
     e a carteira comercial dizendo quantos pedidos têm valor;
   - Setorial › Produção: "Perdas registradas" sai de perdas/ (antes N/D com 86 registros no banco).
   Roda os scripts reais num vm com DOM e Firebase simulados. */
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');

const hoje = new Date();
const diasAtras = (n) => new Date(hoje.getTime() - n * 86400000).toISOString();
const DB = {
  pedidos: {}, ops: {}, pedidos_compra: {}, estoque_lotes: {}, nao_conformidades: {}, agendamentos_expedicao: {},
  erp: { kuryos: { crm_projects: {}, pd_requests: {} } },
  pedidos_comerciais: {
    A: { cliente: 'X', dataPedido: diasAtras(3), totalValor: 1000 },
    B: { cliente: 'Y', dataPedido: diasAtras(4) },
    C: { cliente: 'Z', dataPedido: diasAtras(5), status: 'CANCELADO', totalValor: 9 },
  },
  expedicoes_comerciais: {
    E1: { status: 'Expedido (legado)', data: diasAtras(2).slice(0, 10), criadoEm: diasAtras(1), totalUnidades: 500, itens: { i: { qtd: 500 } } },
    E2: { status: 'Expedido', data: diasAtras(90).slice(0, 10), criadoEm: diasAtras(1), totalUnidades: 7000 }, // importada ontem, saiu há 90 dias
    E3: { status: 'Expedido', data: diasAtras(5).slice(0, 10), itens: { a: { qtd: 30 }, b: { qtd: 20 } } },     // sem totalUnidades
  },
  paradas_historico: { p1: { duracao: 10 } },
  perdas: {
    grupo1: { x1: { data: '2026-07-15', perdas: [{ quantidade: 7, tipo: 'Rótulos' }, { quantidade: 3, tipo: 'Frascos' }] } },
    x2: { data: '2026-08-01', perdas: [{ quantidade: 5, tipo: 'Tampas' }] },
  },
};
const ler = (p) => String(p).split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), DB);

function ambiente(url) {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, innerHTML: '', textContent: '', dataset: {}, classList: { toggle() {} }, setAttribute() {}, addEventListener() {}, querySelectorAll: () => [], getContext: () => ({}) });
  const ctx = {
    console, Intl, Date, Promise, Number, String, Object, Array, Math, Set, URL, URLSearchParams,
    setTimeout, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    location: { href: url, search: new URL(url).search },
    history: { replaceState() {} },
    document: { readyState: 'complete', documentElement: {}, getElementById: el, querySelectorAll: () => [], addEventListener() {} },
    Chart: function () { return { destroy() {} }; }, MutationObserver: function () { return { observe() {} }; },
    firebase: { database: () => ({ ref: (p) => ({ once: () => Promise.resolve({ val: () => ler(p) }) }) }) },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return { ctx, els };
}
const espera = () => new Promise((r) => setTimeout(r, 30));

(async () => {
  // Executivo
  const ex = ambiente('https://x/dashboard_executivo.html');
  vm.runInContext(fs.readFileSync('public/shared/executive-dashboard.js', 'utf8'), ex.ctx);
  const pronto = () => ex.els['executive-kpis'] && /Expedido no período/.test(ex.els['executive-kpis'].innerHTML) && !/>Carregando</.test(ex.els['executive-kpis'].innerHTML);
  for (let i = 0; i < 20 && !pronto(); i++) await espera();
  const kpis = ex.els['executive-kpis'].innerHTML;
  const exp = /Expedido no período[\s\S]*?executive-kpi-value">([^<]+)<\/div><div class="executive-kpi-meta">([^<]+)</.exec(kpis);
  assert.ok(exp, 'KPI de expedição presente');
  assert.equal(exp[1], '550 un', 'E1 (500) + E3 (30+20); E2 saiu há 90 dias e fica fora dos 30 dias');
  assert.match(exp[2], /^2 cargas/);
  assert.match(exp[2], new RegExp('última saída registrada: ' + diasAtras(2).slice(0, 10).split('-').reverse().join('/')), 'mostra a última saída (em produção parou em 11/09)');
  const cart = /Carteira comercial registrada[\s\S]*?executive-kpi-meta">([^<]+)</.exec(kpis);
  assert.match(cart[1], /^1 de 2 pedidos com valor/, 'cancelado fica fora; B não tem valor');
  console.log('  ok  Executivo: expedição pela data da saída e cobertura da carteira');

  // Setorial › Produção
  const se = ambiente('https://x/dashboard_setorial.html?area=producao');
  vm.runInContext(fs.readFileSync('public/shared/sector-dashboard.js', 'utf8'), se.ctx);
  for (let i = 0; i < 5 && !/Perdas registradas/.test(se.els['sector-kpis'] && se.els['sector-kpis'].innerHTML); i++) await espera();
  const sk = se.els['sector-kpis'].innerHTML;
  const perda = /Perdas registradas<\/div><div class="sector-kpi-value">([^<]+)<\/div><div class="sector-kpi-detail">([^<]+)</.exec(sk);
  assert.ok(perda, 'KPI de perdas presente');
  assert.equal(perda[1], '15 un', '7+3 (aninhado) + 5 (um nível)');
  assert.match(perda[2], /2 apontamentos.*2026-07-15/);
  console.log('  ok  Setorial: perdas de perdas/ (um e dois níveis)');
  console.log('run_dashboards_kpis_faltantes_test: OK');
})().catch((e) => { console.error(e); process.exit(1); });
