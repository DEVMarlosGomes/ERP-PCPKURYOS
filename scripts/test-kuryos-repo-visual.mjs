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

async function viewport(width, height, mobile = false) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
}

async function navigate(path, theme) {
  const before = runtimeErrors.length;
  await value(`localStorage.setItem('kuryos-theme', ${JSON.stringify(theme)}); localStorage.removeItem('kuryos.sidebar.collapsed')`);
  await call('Page.navigate', { url: `${baseUrl}${path}${path.includes('?') ? '&' : '?'}repo-visual-test=${Date.now()}` });
  await waitFor(`document.readyState === 'complete'`);
  await waitFor(`Boolean(document.querySelector('#unified-navbar')) && Boolean([...document.styleSheets].some((sheet) => String(sheet.href || '').includes('kuryos-repo-visual.css')))`);
  const expectedText = path.startsWith('/pd.html') ? 'Pipeline P&D'
    : path.startsWith('/crm1.html') ? 'Pipeline Comercial'
      : path.startsWith('/dashboard_executivo.html') ? 'Visão executiva 360°'
        : null;
  if (expectedText) await waitFor(`document.body.innerText.includes(${JSON.stringify(expectedText)})`);
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
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      denied: document.body.innerText.includes('Acesso Negado')
    };
  })()`);
  result.errors = runtimeErrors.slice(before);
  return result;
}

async function screenshot(name) {
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
    if (result.headingFont) assert.match(result.headingFont, /Outfit/i, `${path}: fonte de titulo divergente`);
    assert.equal(result.sidebarWidth, 280, `${path}: sidebar expandida divergente`);
    assert.equal(result.topbarDisplay, 'none', `${path}: topbar desktop deveria estar oculta`);
    assert.ok(result.groupIcons > 0, `${path}: grupos sem icones`);
    assert.ok(result.overflow <= 1, `${path}: overflow global de ${result.overflow}px`);
    assert.equal(result.errors.length, 0, `${path}: erros de runtime: ${result.errors.join('\n')}`);
    desktopResults.push(result);
  }
  await navigate('/dashboard_executivo.html?periodo=30', theme);
  await screenshot(`dashboard-${theme}`);
}

await viewport(390, 844, true);
const mobile = await navigate('/dashboard_executivo.html?periodo=30', 'light');
assert.notEqual(mobile.topbarDisplay, 'none', 'mobile: topbar deveria estar visivel');
assert.ok(mobile.sidebarRight <= 1, `mobile: sidebar deveria iniciar recolhida (${mobile.sidebarRight}px)`);
assert.ok(mobile.overflow <= 1, `mobile: overflow global de ${mobile.overflow}px`);
assert.equal(mobile.errors.length, 0, `mobile: erros de runtime: ${mobile.errors.join('\n')}`);
await screenshot('dashboard-mobile');

await call('Emulation.clearDeviceMetricsOverride');
socket.close();
console.log(JSON.stringify({ desktop: desktopResults, mobile }, null, 2));
