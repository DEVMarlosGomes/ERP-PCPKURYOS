import assert from 'node:assert/strict';

const port = process.argv[2] || '9224';
const base = 'http://127.0.0.1.nip.io:5000';
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('127.0.0.1.nip.io:5000'));
if (!page) throw new Error('Aba autenticada do PCP não encontrada.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let seq = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
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
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await value(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const snapshot = await value(`({ path: location.pathname, ready: document.readyState, text: document.body?.innerText?.slice(0, 500), root: document.querySelector('#root')?.innerHTML?.slice(0, 240) })`);
  throw new Error(`Timeout: ${expression}\n${JSON.stringify(snapshot)}`);
}
async function viewport(size) {
  await call('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
}
async function navigate(path, ready) {
  await call('Page.navigate', { url: `${base}${path}?theme-drawer-test=${Date.now()}` });
  await waitFor(`Boolean(document.readyState === 'complete' && document.querySelector('#unified-navbar') && (${ready}))`);
  await waitFor(`Boolean(document.querySelector('script[src*="crm-pd-shell-bridge"]') && document.documentElement.dataset.effectiveTheme)`);
}

await call('Page.enable');
await call('Runtime.enable');
await viewport({ width: 1280, height: 720, mobile: false });
await navigate('/crm1.html', `document.querySelector('[data-testid="crm1-kanban"]')`);

const originalTheme = await value(`localStorage.getItem('kuryos-theme')`);
await value(`(() => { localStorage.removeItem('kuryos-theme'); applyKuryosTheme('auto'); document.querySelector('#kt-theme-toggle').click(); return true; })()`);
await waitFor(`localStorage.getItem('kuryos-theme') === 'light' && !document.documentElement.classList.contains('dark')`);
const light = await value(`({ stored: localStorage.getItem('kuryos-theme'), effective: document.documentElement.dataset.effectiveTheme, dark: document.documentElement.classList.contains('dark'), token: getComputedStyle(document.documentElement).getPropertyValue('--background').trim() })`);
assert.equal(light.stored, 'light');
assert.equal(light.effective, 'light');
assert.equal(light.dark, false);

await value(`document.querySelector('#kt-theme-toggle').click()`);
await waitFor(`localStorage.getItem('kuryos-theme') === 'dark' && document.documentElement.classList.contains('dark')`);
const dark = await value(`({ stored: localStorage.getItem('kuryos-theme'), effective: document.documentElement.dataset.effectiveTheme, dark: document.documentElement.classList.contains('dark'), token: getComputedStyle(document.documentElement).getPropertyValue('--background').trim() })`);
assert.equal(dark.stored, 'dark');
assert.equal(dark.effective, 'dark');
assert.equal(dark.dark, true);
assert.notEqual(light.token, dark.token, 'tokens React não mudaram com o tema');

await navigate('/pd.html', `document.querySelector('#root')?.children.length`);
await waitFor(`document.documentElement.classList.contains('dark') && document.documentElement.dataset.effectiveTheme === 'dark'`);
const pdDark = await value(`({ effective: document.documentElement.dataset.effectiveTheme, dark: document.documentElement.classList.contains('dark'), token: getComputedStyle(document.documentElement).getPropertyValue('--background').trim() })`);
await value(`applyKuryosTheme('light')`);
await waitFor(`!document.documentElement.classList.contains('dark') && document.documentElement.dataset.effectiveTheme === 'light'`);
const pdLight = await value(`({ effective: document.documentElement.dataset.effectiveTheme, dark: document.documentElement.classList.contains('dark'), token: getComputedStyle(document.documentElement).getPropertyValue('--background').trim() })`);
assert.equal(pdDark.dark, true);
assert.equal(pdLight.dark, false);
assert.notEqual(pdDark.token, pdLight.token, 'tokens do P&D não mudaram com o tema');

await value(`(() => { const saved = ${JSON.stringify(originalTheme)}; if (saved) localStorage.setItem('kuryos-theme', saved); else localStorage.removeItem('kuryos-theme'); applyKuryosTheme(saved || 'auto'); return true; })()`);

const sizes = [
  { name: 'notebook', width: 1280, height: 720, mobile: false },
  { name: 'notebook-baixo', width: 1536, height: 661, mobile: false, lowHeight: true },
  { name: 'tablet-compacto', width: 600, height: 800, mobile: false, compact: true },
  { name: 'celular', width: 390, height: 844, mobile: true, compact: true },
];
const routes = [
  { name: 'crm1', path: '/crm1.html', ready: `document.querySelector('[data-testid="crm1-kanban"]')`, card: `[data-testid="crm1-kanban"] .kanban-column .cursor-pointer` },
  { name: 'crm3', path: '/crm3.html', ready: `document.querySelector('[data-testid="crm3-kanban"]')`, card: `[data-testid="crm3-kanban"] .kanban-column .cursor-pointer` },
];
const drawers = [];

for (const size of sizes) {
  await viewport(size);
  for (const route of routes) {
    await navigate(route.path, route.ready);
    const clicked = await value(`(() => { const card = document.querySelector('${route.card}'); if (!card) return false; card.click(); return true; })()`);
    assert.equal(clicked, true, `${route.name}: nenhum card disponível para abrir drawer`);
    await waitFor(`Boolean(document.querySelector('body > [role="dialog"][class*="inset-y-0"]'))`);
    await new Promise((resolve) => setTimeout(resolve, 800));
    const result = await value(`(() => {
      const drawer = document.querySelector('body > [role="dialog"][class*="inset-y-0"]');
      const sidebar = document.querySelector('#unified-navbar');
      const rect = drawer.getBoundingClientRect();
      const grids = [...drawer.querySelectorAll('[class*="grid-cols-"]')].map((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
      const tablists = [...drawer.querySelectorAll('[role="tablist"]')].map((tabs) => ({
        width: tabs.clientWidth,
        scrollWidth: tabs.scrollWidth,
        overflowX: getComputedStyle(tabs).overflowX
      }));
      const offenders = [...drawer.querySelectorAll('*')]
        .filter((element) => element.scrollWidth > element.clientWidth + 1 || element.getBoundingClientRect().right > rect.right + 1)
        .slice(0, 12)
        .map((element) => ({ tag: element.tagName, role: element.getAttribute('role'), className: String(element.className).slice(0, 180), width: element.clientWidth, scrollWidth: element.scrollWidth, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, overflowX: getComputedStyle(element).overflowX }));
      return {
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height,
        state: drawer.dataset.state, transform: getComputedStyle(drawer).transform,
        animationName: getComputedStyle(drawer).animationName, className: drawer.className,
        scrollOverflow: drawer.scrollWidth - drawer.clientWidth,
        globalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        z: Number(getComputedStyle(drawer).zIndex), sidebarZ: Number(getComputedStyle(sidebar).zIndex),
        topbarHeight: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--k-shell-topbar-h')) || 0,
        grids, tablists, offenders
      };
    })()`);
    assert.ok(result.left >= -1 && result.right <= size.width + 1, `${size.name}/${route.name}: drawer saiu horizontalmente`);
    assert.ok(result.top >= -1 && result.bottom <= size.height + 1, `${size.name}/${route.name}: drawer saiu verticalmente`);
    assert.ok(result.scrollOverflow <= 1, `${size.name}/${route.name}: conteúdo alargou o drawer`);
    assert.ok(result.globalOverflow <= 1, `${size.name}/${route.name}: overflow global`);
    assert.ok(result.z > result.sidebarZ, `${size.name}/${route.name}: drawer ficou atrás da sidebar`);
    assert.ok(result.tablists.every((tabs) => tabs.overflowX === 'auto' || tabs.overflowX === 'scroll'), `${size.name}/${route.name}: abas não têm rolagem local`);
    if (size.compact) {
      assert.ok(Math.abs(result.width - size.width) <= 1, `${route.name}: drawer móvel não ocupou a tela`);
      assert.ok(result.grids.every((columns) => columns === 1), `${route.name}: grid do drawer não empilhou`);
    } else {
      const verticalGap = size.lowHeight ? 8 : 16;
      assert.ok(Math.abs(result.top - (result.topbarHeight + verticalGap)) <= 1, `${size.name}/${route.name}: margem superior inconsistente`);
      assert.ok(Math.abs(result.bottom - (size.height - verticalGap)) <= 1, `${size.name}/${route.name}: margem inferior inconsistente`);
    }
    drawers.push({ viewport: size.name, route: route.name, ...result });
  }
}

await Promise.race([call('Emulation.clearDeviceMetricsOverride'), new Promise((resolve) => setTimeout(resolve, 2000))]);
socket.close();
console.log('OK: tema claro/escuro do shell sincronizado com React e drawers laterais responsivos.');
console.log(JSON.stringify({ crm: { light, dark }, pd: { light: pdLight, dark: pdDark }, drawers }, null, 2));
