import assert from 'node:assert/strict';
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
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

async function viewport(width, height, mobile = false) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
}

async function navigate(path, theme) {
  console.error(`Validando ${theme}: ${path}`);
  const before = runtimeErrors.length;
  await value(`localStorage.setItem('kuryos-theme', ${JSON.stringify(theme)}); localStorage.setItem('kuryos.sidebar.collapsed', '0')`);
  await call('Page.navigate', { url: `${baseUrl}${path}${path.includes('?') ? '&' : '?'}repo-visual-test=${Date.now()}` });
  await waitFor(`document.readyState === 'complete'`);
  await waitFor(`Boolean(document.querySelector('#unified-navbar')) && Boolean([...document.styleSheets].some((sheet) => String(sheet.href || '').includes('kuryos-repo-visual.css')))`);
  await waitFor(`document.body.dataset.kuryosUi === 'reference' && document.documentElement.getAttribute('data-kuryos-enterprise-shell') === 'ready'`);
  const expectedText = path.startsWith('/pd.html') ? 'Pipeline P&D'
    : path.startsWith('/crm1.html') ? 'Pipeline Comercial'
      : path.startsWith('/dashboard_executivo.html') ? 'Visão executiva 360°'
        : null;
  if (expectedText) await waitFor(`document.body.innerText.includes(${JSON.stringify(expectedText)})`);
  if (path.startsWith('/pd.html') || path.startsWith('/crm1.html')) await waitFor(`Boolean(document.querySelector('#root h1'))`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const result = await value(`(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const sidebar = document.querySelector('#unified-navbar');
    const sidebarStyle = getComputedStyle(sidebar);
    const topbar = document.querySelector('.kuryos-enterprise-topbar');
    const heading = document.querySelector('h1, h2, .kt-h1');
    const active = document.querySelector('.kt-nav-link.active');
    return {
      path: location.pathname,
      theme: document.documentElement.dataset.theme,
      stylesheet: [...document.styleSheets].some((sheet) => String(sheet.href || '').includes('kuryos-repo-visual.css')),
      radius: root.getPropertyValue('--k-radius-md').trim(),
      bodyFont: body.fontFamily,
      headingFont: heading ? getComputedStyle(heading).fontFamily : '',
      background: body.backgroundColor,
      sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
      sidebarPosition: sidebarStyle.position,
      sidebarRight: Math.round(sidebar.getBoundingClientRect().right),
      topbarDisplay: topbar ? getComputedStyle(topbar).display : null,
      activeRadius: active ? getComputedStyle(active).borderRadius : null,
      groupIcons: document.querySelectorAll('.kt-cap-icon svg').length,
      footerInViewport: document.querySelector('.kt-sidebar-foot').getBoundingClientRect().bottom <= innerHeight + 1,
      navigationScrolls: getComputedStyle(document.querySelector('.kuryos-sidebar-nav')).overflowY === 'auto',
      legacyColorsValid: !document.body.hasAttribute('data-kuryos-operational') || ['--card','--primary','--muted','--border'].every(name => CSS.supports('color', getComputedStyle(document.body).getPropertyValue(name).trim())),
      reactColorsValid: !document.getElementById('root') || ['--card','--primary','--accent','--border'].every(name => CSS.supports('color', 'hsl(' + getComputedStyle(document.body).getPropertyValue(name).trim() + ')')),
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      denied: document.body.innerText.includes('Acesso Negado')
    };
  })()`);
  result.errors = runtimeErrors.slice(before);
  return result;
}

async function screenshot(name) {
  await call('Page.bringToFront');
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`scripts/artifacts/repo-visual/${name}.png`, Buffer.from(shot.data, 'base64'));
}

await call('Runtime.enable');
await call('Page.enable');
await call('Network.enable');
await call('Network.setCacheDisabled', { cacheDisabled: true });
await mkdir('scripts/artifacts/repo-visual', { recursive: true });

const routes = ['/dashboard_executivo.html?periodo=30', '/cadastros.html', '/compras.html', '/crm1.html', '/pd.html'];
const desktopResults = [];
await viewport(1440, 900);
for (const theme of ['light', 'dark']) {
  for (const path of routes) {
    const result = await navigate(path, theme);
    assert.equal(result.stylesheet, true, `${path}: camada visual ausente`);
    assert.equal(result.radius, '8px', `${path}: raio visual divergente`);
    assert.match(result.bodyFont, /Manrope/i, `${path}: fonte de corpo divergente`);
    assert.match(result.headingFont, /Outfit/i, `${path}: fonte de titulo divergente`);
    assert.equal(result.sidebarWidth, 280, `${path}: sidebar expandida divergente`);
    assert.equal(result.topbarDisplay, 'none', `${path}: topbar desktop deveria estar oculta`);
    assert.ok(result.groupIcons > 0, `${path}: grupos sem icones`);
    assert.ok(result.footerInViewport && result.navigationScrolls, `${path}: usuário/tema inacessíveis`);
    assert.ok(result.legacyColorsValid, `${path}: tokens React invadiram cores operacionais`);
    assert.ok(result.reactColorsValid, `${path}: tokens legados invadiram cores React`);
    assert.ok(result.overflow <= 1, `${path}: overflow global de ${result.overflow}px`);
    assert.equal(result.errors.length, 0, `${path}: erros de runtime: ${result.errors.join('\n')}`);
    desktopResults.push(result);
    if (path === '/cadastros.html' || path === '/crm1.html') await screenshot(`${path.slice(1,-5)}-${theme}`);
  }
  await navigate('/dashboard_executivo.html?periodo=30', theme);
  await screenshot(`dashboard-${theme}`);
}

// Os controles devem funcionar sem depender de haver uma topbar desktop visível.
await navigate('/cadastros.html', 'light');
await value(`document.querySelector('.kuryos-sidebar-collapse').click()`);
await waitFor(`document.body.classList.contains('kuryos-sidebar-collapsed') && Math.round(document.querySelector('#unified-navbar').getBoundingClientRect().width) === 76`);
const collapsed = await value(`({ width: Math.round(document.querySelector('#unified-navbar').getBoundingClientRect().width), padding: parseFloat(getComputedStyle(document.body).paddingLeft), themeAvailable: document.querySelector('#kt-theme-toggle').getClientRects().length > 0, brand: getComputedStyle(document.querySelector('.kuryos-brand-mark')).display })`);
assert.equal(collapsed.padding, 76, 'recolhido: recuo não acompanha navegação');
assert.ok(collapsed.themeAvailable && ['inline-flex', 'flex'].includes(collapsed.brand), `recolhido: marca/tema indisponíveis: ${JSON.stringify(collapsed)}`);
await value(`document.querySelector('#unified-navbar').dispatchEvent(new MouseEvent('mouseenter'))`);
await waitFor(`Math.round(document.querySelector('#unified-navbar').getBoundingClientRect().width) === 280`);
assert.equal(await value(`parseFloat(getComputedStyle(document.body).paddingLeft)`), 76, 'hover: conteúdo foi deslocado');
await value(`document.querySelector('#unified-navbar').dispatchEvent(new MouseEvent('mouseleave'))`);
await value(`document.querySelector('.kuryos-sidebar-search-launch').click()`);
await waitFor(`!document.querySelector('.kuryos-command-search').hidden`);
await value(`(() => { const input = document.querySelector('.kuryos-global-search input'); input.value = 'Compras'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const search = await value(`({ count: document.querySelectorAll('.kuryos-search-result').length, focus: document.activeElement === document.querySelector('.kuryos-global-search input'), width: document.querySelector('.kuryos-command-search').getBoundingClientRect().width })`);
assert.ok(search.count > 0 && search.focus && search.width <= 560, 'busca desktop não abriu/findou módulos');
await value(`document.querySelector('.kuryos-global-search input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
assert.equal(await value(`document.querySelector('.kuryos-command-search').hidden`), true, 'Esc não fecha busca');

// Impressão não deve conter o shell nem deixar o recuo da sidebar.
await value(`applyKuryosTheme('dark')`);
await call('Emulation.setEmulatedMedia', { media: 'print' });
assert.equal(await value(`getComputedStyle(document.querySelector('#unified-navbar')).display`), 'none');
assert.equal(await value(`parseFloat(getComputedStyle(document.body).paddingLeft)`), 0);
assert.equal(await value(`getComputedStyle(document.querySelector('[data-ui="surface"]')).backgroundColor`), 'rgb(255, 255, 255)', 'impressão escura: painel não virou papel');
await call('Emulation.setEmulatedMedia', { media: '' });

await navigate('/descarte.html', 'light');
assert.equal(await value(`Boolean(document.querySelector('header[data-ui="page-header"] h1'))`), true, 'cabeçalho de Descarte removido pelo shell');

await viewport(390, 844, true);
const mobile = await navigate('/dashboard_executivo.html?periodo=30', 'light');
assert.notEqual(mobile.topbarDisplay, 'none', 'mobile: topbar deveria estar visivel');
assert.ok(mobile.sidebarRight <= 1, `mobile: sidebar deveria iniciar recolhida (${mobile.sidebarRight}px)`);
assert.ok(mobile.overflow <= 1, `mobile: overflow global de ${mobile.overflow}px`);
assert.equal(mobile.errors.length, 0, `mobile: erros de runtime: ${mobile.errors.join('\n')}`);
await screenshot('dashboard-mobile');

await value(`document.querySelector('#kt-hamburger').click()`);
await waitFor(`document.querySelector('#unified-navbar').getBoundingClientRect().left >= -1`);
const mobileMenu = await value(`({ expanded: document.querySelector('#kt-hamburger').getAttribute('aria-expanded'), width: document.querySelector('#unified-navbar').getBoundingClientRect().width, footer: document.querySelector('.kt-sidebar-foot').getBoundingClientRect().bottom, minTouch: Math.min(...[...document.querySelectorAll('.kt-nav-cap,.kt-nav-link')].filter(e => e.getClientRects().length > 0).map(e => e.getBoundingClientRect().height)) })`);
assert.equal(mobileMenu.expanded, 'true');
assert.ok(mobileMenu.width <= 390 && mobileMenu.footer <= 845 && mobileMenu.minTouch >= 44, 'menu mobile não é acessível');
await value(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
assert.equal(await value(`document.querySelector('#kt-hamburger').getAttribute('aria-expanded')`), 'false');

await call('Emulation.clearDeviceMetricsOverride');
await value(`localStorage.removeItem('kuryos.sidebar.collapsed')`);
socket.close();
console.log(JSON.stringify({ desktop: desktopResults, collapsed, search, mobile, mobileMenu }, null, 2));
await writeFile('scripts/artifacts/repo-visual/report.json', JSON.stringify({ desktop: desktopResults, collapsed, search, mobile, mobileMenu }, null, 2));
