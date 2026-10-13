// Exercita a sincronização de apresentação usando o código real do shell.
// Não inicializa Firebase, não modifica permissões e não grava dados.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('public/shared/kuryos-enterprise-shell.js', 'utf8');
function declaration(name, next) {
  return source.slice(source.indexOf(`  function ${name}(`), source.indexOf(`  function ${next}(`));
}
function classes(initial = []) {
  const values = new Set(initial);
  return { contains: name => values.has(name), remove: name => values.delete(name),
    toggle(name, enabled) { enabled ? values.add(name) : values.delete(name); } };
}
const cap = { textContent: 'Comercial', setAttribute() {} };
const group = { classList: classes(['fechado']), querySelector(selector) {
  return selector === '.kt-nav-link.active' ? links.find(link => link.classList.contains('active'))
    : selector === '.kt-nav-cap' ? cap : cap;
} };
const links = ['crm1', 'crm2', 'crm3', 'pd'].map((name, index) => ({
  textContent: ['CRM 1 · Clientes', 'CRM 2 · Projetos', 'CRM 3 · Amostras', 'P&D'][index],
  classList: classes(), attributes: {}, closest: () => group,
  setAttribute(name, value) { this.attributes[name] = value; },
  removeAttribute(name) { delete this.attributes[name]; }
}));
const navigation = links.map((element, index) => ({ element, href: ['crm1.html', 'crm2.html', 'crm3.html', 'pd.html'][index] }));
const title = { textContent: '' }, breadcrumbs = { textContent: '' };
const events = [];
const context = vm.createContext({ URL, navigation, lastRoute: '', location: { pathname: '/crm1.html' },
  document: { baseURI: 'http://localhost:5000/', querySelector(selector) {
    return selector === '.kuryos-topbar-title' ? title : breadcrumbs;
  } },
  window: { __PCP_EMBEDDED__: true, dispatchEvent: event => events.push(event.type) },
  CustomEvent: class { constructor(type) { this.type = type; } }
});
vm.runInContext(declaration('text', 'activeContext') + declaration('activeContext', 'collectNavigation') + declaration('syncRoute', 'setupSidebar'), context);
const sidebar = { querySelector: () => links.find(link => link.classList.contains('active')), querySelectorAll: () => [group] };
const cases = ['/crm1.html', '/crm/clients/cliente', '/crm/projects', '/crm/projects/projeto', '/crm/samples', '/pd', '/pd/solicitacao', '/pd/formulas'];
for (const path of cases) {
  context.location.pathname = path;
  context.syncRoute(sidebar);
  const index = path.includes('projects') ? 1 : path.includes('samples') ? 2 : path.startsWith('/pd') ? 3 : 0;
  assert.equal(links.filter(link => link.classList.contains('active')).length, 1);
  assert.equal(links[index].attributes['aria-current'], 'page');
  assert.equal(title.textContent, links[index].textContent);
  assert.equal(breadcrumbs.textContent, 'Comercial');
  assert.equal(group.classList.contains('fechado'), false);
  const count = events.length;
  context.syncRoute(sidebar);
  assert.equal(events.length, count, 'rota inalterada não deve provocar novas mutações');
}
context.location.pathname = '/administracao-nao-autorizada';
context.syncRoute(sidebar);
assert.equal(events.length, cases.length, 'não inventar destino fora da navegação autorizada');
context.window.__PCP_EMBEDDED__ = false;
context.location.pathname = '/crm/projects';
context.syncRoute(sidebar);
assert.equal(events.length, cases.length, 'não interferir nas páginas legadas');
console.log('Aprovado: 8 rotas CRM/P&D, aria-current, título/contexto, ausência de loop e restrição aos destinos autorizados.');
