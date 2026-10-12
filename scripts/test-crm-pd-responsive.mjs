import assert from 'node:assert/strict';

const tabs = await (await fetch('http://127.0.0.1:9224/json')).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('127.0.0.1.nip.io:5000'));
if (!page) throw new Error('Aba autenticada do PCP não encontrada.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const item = pending.get(message.id); pending.delete(message.id);
  message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function value(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}
async function waitFor(expression, timeout = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await value(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const context = await value(`({ url: location.href, text: document.body?.innerText?.slice(0, 500) || '' })`);
  throw new Error(`Timeout aguardando ${expression}: ${JSON.stringify(context)}`);
}
async function setViewport(size) {
  await call('Emulation.setDeviceMetricsOverride', {
    width: size.width,
    height: size.height,
    deviceScaleFactor: 1,
    mobile: size.mobile,
  });
}
async function navigate(route, expected) {
  const separator = route.includes('?') ? '&' : '?';
  await call('Page.navigate', { url: `http://127.0.0.1.nip.io:5000${route}${separator}responsive-test=${Date.now()}` });
  await waitFor(`document.readyState === 'complete' && Boolean(document.querySelector('#unified-navbar')) && Boolean(document.querySelector('#root')?.children.length)`);
  await waitFor(`document.body.innerText.includes(${JSON.stringify(expected)})`);
  await waitFor(`Boolean(document.querySelector('link[href*="crm-pd-responsive.css"]'))`);
}

await call('Runtime.enable');
await call('Page.enable');
await call('Network.enable');
await call('Network.setCacheDisabled', { cacheDisabled: true });
await call('Network.setBypassServiceWorker', { bypass: true });

const sizes = [
  { name: 'desktop', width: 1280, height: 720, mobile: false },
  { name: 'tablet', width: 820, height: 1180, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];
const routes = [
  ['/crm1.html', 'Pipeline Comercial'],
  ['/crm2.html', 'Pipeline de Projetos'],
  ['/crm3.html', 'Pipeline de Amostras'],
  ['/pd.html', 'Pipeline P&D'],
  ['/pd/formulas', 'Banco de Fórmulas'],
  ['/pd/homologacao', 'Homologações'],
  ['/pd/catalog', 'Banco de Custos'],
  ['/pd/estoque', 'Estoque'],
  ['/pd/relatorios', 'Relatórios'],
];

let routeAssertions = 0;
for (const size of sizes) {
  await setViewport(size);
  for (const [route, expected] of routes) {
    await navigate(route, expected);
    const layout = await value(`(() => {
      const root = document.querySelector('#root').getBoundingClientRect();
      const main = document.querySelector('[data-app-main="true"]')?.getBoundingClientRect();
      const nav = document.querySelector('.page-enter > .flex.items-center.gap-1.mb-5.border-b')?.getBoundingClientRect();
      const filters = [...document.querySelectorAll('[data-testid$="-bar"] > .flex > *')].map((el) => {
        const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width };
      });
      return {
        innerWidth,
        innerHeight,
        htmlScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        root: { left: root.left, right: root.right, top: root.top, bottom: root.bottom, width: root.width, height: root.height },
        main: main && { left: main.left, right: main.right, top: main.top, bottom: main.bottom, width: main.width, height: main.height },
        nav: nav && { left: nav.left, right: nav.right, width: nav.width },
        filters,
      };
    })()`);
    assert.ok(layout.htmlScrollWidth <= size.width + 1, `${size.name} ${route}: html tem overflow horizontal`);
    assert.ok(layout.bodyScrollWidth <= size.width + 1, `${size.name} ${route}: body tem overflow horizontal`);
    assert.ok(layout.root.left >= -1 && layout.root.right <= size.width + 1, `${size.name} ${route}: root saiu da viewport`);
    assert.ok(layout.root.bottom <= size.height + 1, `${size.name} ${route}: root ultrapassou a altura útil`);
    if (layout.main) {
      assert.ok(layout.main.left >= -1 && layout.main.right <= size.width + 1, `${size.name} ${route}: main saiu da viewport`);
      assert.ok(layout.main.bottom <= size.height + 1, `${size.name} ${route}: main ultrapassou a altura útil`);
    }
    if (layout.nav) assert.ok(layout.nav.left >= -1 && layout.nav.right <= size.width + 1, `${size.name} ${route}: subnav saiu da viewport`);
    if (size.name === 'mobile') {
      layout.filters.forEach((filter, index) => {
        assert.ok(filter.left >= -1 && filter.right <= size.width + 1, `${route}: filtro móvel ${index + 1} saiu da viewport`);
      });
    }
    routeAssertions += 1;
  }
}

async function assertDialog(route, expected, openExpression, size) {
  await setViewport(size);
  await navigate(route, expected);
  await waitFor(openExpression.replace('.click()', ''));
  const opened = await value(openExpression);
  assert.notEqual(opened, false, `${route}: ação não abriu o modal`);
  await waitFor(`Boolean(document.querySelector('[role="dialog"]'))`);
  const result = await value(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const wrapper = dialog.parentElement;
    const sidebar = document.querySelector('#unified-navbar');
    const r = dialog.getBoundingClientRect();
    return {
      dialog: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
      wrapperZ: Number(getComputedStyle(wrapper).zIndex) || 0,
      sidebarZ: Number(getComputedStyle(sidebar).zIndex) || 0,
      css: Boolean(document.querySelector('link[href*="crm-pd-responsive.css"]')),
    };
  })()`);
  assert.ok(result.css, `${route}: CSS responsivo ausente`);
  assert.ok(result.wrapperZ > result.sidebarZ, `${route}: modal ainda fica atrás da sidebar`);
  assert.ok(result.dialog.left >= -1 && result.dialog.right <= size.width + 1, `${route}: modal saiu horizontalmente da viewport`);
  assert.ok(result.dialog.top >= -1 && result.dialog.bottom <= size.height + 1, `${route}: modal saiu verticalmente da viewport`);

  const hasCombobox = await value(`Boolean(document.querySelector('[role="dialog"] [role="combobox"]'))`);
  if (hasCombobox) {
    await value(`document.querySelector('[role="dialog"] [role="combobox"]').click()`);
    await waitFor(`Boolean(document.querySelector('[data-radix-popper-content-wrapper]'))`);
    const popper = await value(`(() => { const el = document.querySelector('[data-radix-popper-content-wrapper]'); const r = el.getBoundingClientRect(); return { z: Number(getComputedStyle(el).zIndex) || 0, left: r.left, right: r.right }; })()`);
    assert.ok(popper.z > result.sidebarZ, `${route}: select ainda fica atrás da sidebar`);
    assert.ok(popper.left >= -1 && popper.right <= size.width + 1, `${route}: select saiu da viewport`);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  }
}

for (const size of [sizes[0], sizes[2]]) {
  await assertDialog('/crm1.html', 'Pipeline Comercial', `(() => { const el = document.querySelector('[data-testid="new-client-btn"]'); if (!el) return false; el.click(); return true; })()`, size);
  await assertDialog('/crm2.html', 'Pipeline de Projetos', `(() => { const el = [...document.querySelectorAll('button')].find((item) => item.innerText.includes('Pedido Direto')); if (!el) return false; el.click(); return true; })()`, size);
  await assertDialog('/pd.html', 'Pipeline P&D', `(() => { const el = [...document.querySelectorAll('button')].find((item) => item.textContent.trim().includes('Nova Pesquisa Interna') && !item.disabled); if (!el) return false; el.click(); return true; })()`, size);
}

await setViewport(sizes[0]);
await navigate('/crm/clients', 'Pipeline Comercial');
const nestedLinks = await value(`(() => ({
  pd: [...document.querySelectorAll('#unified-navbar a')].find((el) => el.textContent.trim() === 'P&D')?.href,
  crm2: [...document.querySelectorAll('#unified-navbar a')].find((el) => el.textContent.includes('CRM 2'))?.href,
  logo: document.querySelector('#unified-navbar .kt-brand-logo')?.src,
}))()`);
assert.equal(new URL(nestedLinks.pd).pathname, '/pd.html', 'P&D relativo dentro de /crm/clients');
assert.equal(new URL(nestedLinks.crm2).pathname, '/crm2.html', 'CRM 2 relativo dentro de /crm/clients');
assert.equal(new URL(nestedLinks.logo).pathname, '/kuryos-logo.svg', 'Logo relativo dentro de /crm/clients');

await navigate('/crm/pd.html', 'Pipeline P&D');
assert.equal(await value(`location.pathname`), '/pd.html', 'URL legada /crm/pd.html não foi recuperada');

await call('Emulation.clearDeviceMetricsOverride');
socket.close();
console.log(`OK: ${routeAssertions} layouts (9 rotas × 3 viewports), 6 modais/popovers e links aninhados do CRM/P&D.`);
