import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const port = process.argv[2] || '9224';
const base = 'http://127.0.0.1.nip.io:5000';
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('127.0.0.1.nip.io:5000'));
if (!page) throw new Error('Aba autenticada do PCP não encontrada.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let id = 0;
const pending = new Map();
const runtimeErrors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') {
    const description = message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Exceção JavaScript';
    if (!description.includes('permission_denied at /')) runtimeErrors.push(description);
  }
  if (!message.id || !pending.has(message.id)) return;
  const item = pending.get(message.id);
  pending.delete(message.id);
  message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
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
  throw new Error(`Timeout: ${expression}`);
}
async function viewport(width, height, mobile = false) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
}
async function navigate(path) {
  const errorsBefore = runtimeErrors.length;
  await call('Page.navigate', { url: `${base}${path}?dashboard-showcase-test=${Date.now()}` });
  await waitFor(`document.readyState === 'complete' && Boolean(document.querySelector('#unified-navbar'))`);
  await waitFor(`document.body.classList.contains('dashboard-showcase') && Boolean(document.querySelector('link[href*="dashboard-showcase.css"]'))`);
  await new Promise((resolve) => setTimeout(resolve, 800));
  const result = await value(`(() => {
    const workspace = document.querySelector('.container,.main');
    const style = getComputedStyle(document.body);
    const rect = workspace.getBoundingClientRect();
    return {
      path: location.pathname,
      cards: document.querySelectorAll('.card,.metric,.kpi').length,
      revealed: document.querySelectorAll('.dash-reveal').length,
      charts: document.querySelectorAll('canvas').length,
      css: [...document.styleSheets].some((sheet) => String(sheet.href || '').includes('dashboard-showcase.css')),
      shell: style.backgroundImage,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      workspace: { left: rect.left, right: rect.right, width: rect.width },
      theme: document.documentElement.dataset.effectiveTheme,
    };
  })()`);
  result.runtimeErrors = runtimeErrors.slice(errorsBefore);
  return result;
}

await call('Runtime.enable');
await call('Page.enable');
await call('Network.enable');
await call('Network.setCacheDisabled', { cacheDisabled: true });
await mkdir('scripts/artifacts/dashboard-showcase', { recursive: true });

const results = [];
await viewport(1440, 900);
await value(`localStorage.setItem('kuryos-theme', 'light')`);
for (const path of ['/dashboard.html', '/dashboard_analise.html']) {
  const result = await navigate(path);
  assert.ok(result.css, `${path}: CSS não carregou`);
  assert.ok(result.cards > 0 && result.revealed > 0, `${path}: cartões não receberam animação`);
  assert.ok(result.shell.includes('gradient'), `${path}: palco verde não aplicado`);
  assert.ok(result.overflow <= 1, `${path}: overflow horizontal no desktop`);
  assert.deepEqual(result.runtimeErrors, [], `${path}: exceção JavaScript`);
  results.push({ viewport: 'desktop', ...result });
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`scripts/artifacts/dashboard-showcase/${path.includes('analise') ? 'geral' : 'diario'}-light.png`, Buffer.from(shot.data, 'base64'));
}

await value(`localStorage.setItem('kuryos-theme', 'dark')`);
const dark = await navigate('/dashboard.html');
assert.equal(dark.theme, 'dark', 'Tema escuro não sincronizado');
assert.deepEqual(dark.runtimeErrors, [], 'Dashboard Diário escuro: exceção JavaScript');
const darkShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile('scripts/artifacts/dashboard-showcase/diario-dark.png', Buffer.from(darkShot.data, 'base64'));

await viewport(390, 844, true);
for (const path of ['/dashboard.html', '/dashboard_analise.html']) {
  const result = await navigate(path);
  assert.ok(result.overflow <= 1, `${path}: overflow horizontal no celular`);
  assert.ok(result.workspace.left >= -1 && result.workspace.right <= 391, `${path}: workspace fora da viewport móvel ${JSON.stringify(result.workspace)}`);
  assert.deepEqual(result.runtimeErrors, [], `${path} móvel: exceção JavaScript`);
  results.push({ viewport: 'mobile', ...result });
  const mobileShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`scripts/artifacts/dashboard-showcase/${path.includes('analise') ? 'geral' : 'diario'}-mobile.png`, Buffer.from(mobileShot.data, 'base64'));
}

await value(`localStorage.removeItem('kuryos-theme'); if (typeof applyKuryosTheme === 'function') applyKuryosTheme('auto')`);
await call('Emulation.clearDeviceMetricsOverride');
socket.close();
console.log(`OK: ${results.length} cenários dos dashboards, claro/escuro, animações e responsividade.`);
console.log(JSON.stringify(results, null, 2));
