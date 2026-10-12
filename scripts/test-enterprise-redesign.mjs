import { mkdir, writeFile } from 'node:fs/promises';

const debugPort = process.argv[2] || '9224';
const baseUrl = 'http://127.0.0.1.nip.io:5000';
const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('127.0.0.1.nip.io:5000'));
if (!page) throw new Error('Aba autenticada do PCP nao encontrada.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let sequence = 0;
const pending = new Map();
const runtimeErrors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const item = pending.get(message.id);
    pending.delete(message.id);
    message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const description = message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Erro JS';
    if (!description.includes('permission_denied at /')) runtimeErrors.push(description);
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function value(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function waitFor(expression, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await value(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timeout aguardando: ${expression}`);
}
async function navigate(path) {
  const before = runtimeErrors.length;
  await call('Page.navigate', { url: `${baseUrl}${path}${path.includes('?') ? '&' : '?'}enterprise-test=${Date.now()}` });
  await waitFor(`document.readyState === 'complete'`);
  await waitFor(`document.documentElement.getAttribute('data-kuryos-enterprise-shell') === 'ready'`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const result = await value(`(() => ({
    path: location.pathname,
    shell: Boolean(document.querySelector('.kuryos-enterprise-topbar')),
    sidebar: Boolean(document.querySelector('#unified-navbar')),
    search: Boolean(document.querySelector('.kuryos-global-search input')),
    collapse: Boolean(document.querySelector('.kuryos-sidebar-collapse')),
    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    errors: []
  }))()`);
  result.errors = runtimeErrors.slice(before);
  if (!result.shell || !result.sidebar || !result.search || result.errors.length) throw new Error(`Shell invalido em ${path}: ${JSON.stringify(result)}`);
  return result;
}

await call('Runtime.enable');
await call('Page.enable');
await call('Network.enable');
await call('Network.setCacheDisabled', { cacheDisabled: true });
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await value(`localStorage.setItem('kuryos-theme', 'light'); localStorage.removeItem('kuryos.sidebar.collapsed')`);

await navigate('/dashboard_executivo.html?periodo=30');
try {
  await waitFor(`document.querySelectorAll('.executive-kpi').length === 10 && Boolean(document.getElementById('executive-live')?.textContent.includes('Atualizado'))`);
} catch (error) {
  const diagnostic = await value(`({ path: location.pathname, title: document.title, kpis: document.querySelectorAll('.executive-kpi').length, live: document.getElementById('executive-live')?.textContent || null, denied: document.body.innerText.includes('Acesso Negado'), body: document.body.innerText.slice(0, 220) })`);
  throw new Error(error.message + ' ' + JSON.stringify(diagnostic));
}
const dashboard = await value(`(() => ({
  kpis: document.querySelectorAll('.executive-kpi').length,
  unavailable: document.querySelectorAll('.executive-kpi.unavailable').length,
  flow: document.querySelectorAll('.executive-flow-step').length,
  attention: document.querySelectorAll('.executive-attention').length,
  charts: Object.keys(Chart.instances || {}).length,
  officialBrand: getComputedStyle(document.documentElement).getPropertyValue('--k-brand-900').trim(),
  overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
  fakeText: /EBITDA|Lucro líquido/i.test(document.querySelector('#executive-kpis').innerText),
  notes: document.querySelectorAll('.executive-note').length
}))()`);
if (dashboard.kpis !== 10 || dashboard.flow !== 9 || dashboard.charts < 4 || dashboard.officialBrand.toLowerCase() !== '#0a1c69' || dashboard.overflow > 2 || dashboard.fakeText || dashboard.notes !== 3) {
  throw new Error(`Dashboard executivo incompleto: ${JSON.stringify(dashboard)}`);
}
await mkdir('scripts/artifacts/enterprise-redesign', { recursive: true });
let screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile('scripts/artifacts/enterprise-redesign/executive-desktop-light.png', Buffer.from(screenshot.data, 'base64'));

await value(`document.querySelector('.kuryos-sidebar-collapse').click()`);
await waitFor(`document.body.classList.contains('kuryos-sidebar-collapsed') && localStorage.getItem('kuryos.sidebar.collapsed') === '1'`);
const collapsed = await value(`({ bodyPadding: getComputedStyle(document.body).paddingLeft, sidebarWidth: Math.round(document.querySelector('#unified-navbar').getBoundingClientRect().width) })`);
if (collapsed.sidebarWidth > 90) throw new Error(`Sidebar nao recolheu: ${JSON.stringify(collapsed)}`);

await value(`(() => { const input = document.querySelector('.kuryos-global-search input'); input.focus(); input.value = 'Compras'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await waitFor(`document.querySelectorAll('.kuryos-search-result').length > 0`);
const search = await value(`({ results: document.querySelectorAll('.kuryos-search-result').length, visible: document.querySelector('.kuryos-global-search').classList.contains('open') })`);
if (!search.visible || !search.results) throw new Error(`Busca global nao funcional: ${JSON.stringify(search)}`);

for (const route of ['/dashboard.html', '/cadastros.html', '/compras.html', '/crm1.html', '/pd.html']) await navigate(route);

await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await navigate('/dashboard_executivo.html?periodo=90');
await waitFor(`document.querySelectorAll('.executive-kpi').length === 10 && Boolean(document.getElementById('executive-live')?.textContent.includes('Atualizado'))`);
const mobile = await value(`(() => {
  const topbar = document.querySelector('.kuryos-enterprise-topbar').getBoundingClientRect();
  return {
    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    topbarLeft: topbar.left, topbarRight: topbar.right,
    kpiColumns: getComputedStyle(document.querySelector('.executive-kpis')).gridTemplateColumns.split(' ').length,
    sidebarOffscreen: document.querySelector('#unified-navbar').getBoundingClientRect().right <= 1
  };
})()`);
if (mobile.overflow > 2 || mobile.topbarLeft < -1 || mobile.topbarRight > 391 || mobile.kpiColumns !== 1 || !mobile.sidebarOffscreen) throw new Error(`Layout mobile invalido: ${JSON.stringify(mobile)}`);

await value(`localStorage.setItem('kuryos-theme', 'dark'); if (typeof applyKuryosTheme === 'function') applyKuryosTheme('dark')`);
await waitFor(`document.documentElement.classList.contains('dark')`);
const dark = await value(`({ theme: document.documentElement.dataset.theme, dark: document.documentElement.classList.contains('dark'), surface: getComputedStyle(document.querySelector('.executive-kpi')).backgroundColor })`);
if (!dark.dark) throw new Error(`Tema escuro nao aplicado: ${JSON.stringify(dark)}`);
screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile('scripts/artifacts/enterprise-redesign/executive-mobile-dark.png', Buffer.from(screenshot.data, 'base64'));

await value(`localStorage.removeItem('kuryos.sidebar.collapsed'); localStorage.removeItem('kuryos-theme'); if (typeof applyKuryosTheme === 'function') applyKuryosTheme('auto')`);
await call('Emulation.clearDeviceMetricsOverride');
socket.close();
console.log('OK: shell enterprise, busca global, sidebar recolhivel, Dashboard Executivo real, temas e responsividade validados.');
console.log(JSON.stringify({ dashboard, collapsed, search, mobile, dark }, null, 2));
