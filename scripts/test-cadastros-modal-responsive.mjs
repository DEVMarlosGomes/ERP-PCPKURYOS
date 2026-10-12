import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

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
  throw new Error(`Timeout: ${expression}`);
}

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: `${base}/cadastros.html?modal-responsive=${Date.now()}` });
await waitFor(`document.readyState === 'complete' && document.querySelector('#unified-navbar') && document.querySelector('#btnNovo-mat')`);

const cases = [
  { name: 'material', tab: 'materiais', button: '#btnNovo-mat', overlay: '#modalBg-mat', close: '#modalClose-mat' },
  { name: 'produto', tab: 'produtos', button: '#btnNovo-prod', overlay: '#modalBg-prod', close: '#modalClose-prod' },
  { name: 'cliente', tab: 'clientes', button: '#btnNovo-cli', overlay: '#modalBg-cli', close: '#modalClose-cli' },
  { name: 'fornecedor', tab: 'fornecedores', button: '#btnNovoFornecedor-forn', overlay: '#modalFornecedor-forn', close: '#modalFornecedorClose-forn' },
];
const sizes = [
  { name: 'notebook', width: 1280, height: 720, mobile: false },
  { name: 'tablet', width: 820, height: 1024, mobile: false },
  { name: 'celular', width: 390, height: 844, mobile: true },
];
const results = [];
const artifactDir = new URL('./artifacts/cadastros-modal/', import.meta.url);
await mkdir(artifactDir, { recursive: true });

for (const size of sizes) {
  await call('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
  for (const item of cases) {
    await value(`(() => {
      document.querySelector('button[data-maintab="${item.tab}"]').click();
      document.querySelector('${item.button}').click();
      return true;
    })()`);
    await waitFor(`document.querySelector('${item.overlay}').classList.contains('open')`);
    const layout = await value(`(() => {
      const overlay = document.querySelector('${item.overlay}');
      const modal = overlay.querySelector('.modal');
      const header = modal.querySelector('.modal-header').getBoundingClientRect();
      const body = modal.querySelector('.modal-body');
      const footer = modal.querySelector('.modal-footer').getBoundingClientRect();
      const box = modal.getBoundingClientRect();
      const overlayBox = overlay.getBoundingClientRect();
      const grid = modal.querySelector('.form-grid');
      return {
        box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
        overlay: { left: overlayBox.left, top: overlayBox.top, right: overlayBox.right, bottom: overlayBox.bottom },
        header: { top: header.top, bottom: header.bottom },
        footer: { top: footer.top, bottom: footer.bottom },
        bodyScrollable: body.scrollHeight > body.clientHeight,
        columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        z: Number(getComputedStyle(overlay).zIndex),
        topbarZ: Number(getComputedStyle(document.querySelector('.kuryos-enterprise-topbar')).zIndex),
        globalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        role: modal.getAttribute('role'),
        ariaModal: modal.getAttribute('aria-modal')
      };
    })()`);
    assert.ok(layout.box.left >= -1 && layout.box.right <= size.width + 1, `${size.name}/${item.name}: modal saiu na horizontal`);
    assert.ok(layout.box.top >= -1 && layout.box.bottom <= size.height + 1, `${size.name}/${item.name}: modal saiu na vertical`);
    assert.ok(layout.header.top >= -1 && layout.footer.bottom <= size.height + 1, `${size.name}/${item.name}: cabeçalho ou rodapé ficou inacessível`);
    assert.ok(layout.z > layout.topbarZ, `${size.name}/${item.name}: modal ficou atrás da topbar`);
    assert.ok(layout.globalOverflow <= 1, `${size.name}/${item.name}: criou overflow global`);
    assert.equal(layout.role, 'dialog');
    assert.equal(layout.ariaModal, 'true');
    if (size.width <= 760) assert.equal(layout.columns, 1, `${size.name}/${item.name}: formulário não empilhou`);
    if (item.name === 'material' && (size.name === 'notebook' || size.name === 'celular')) {
      const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
      await writeFile(new URL(`material-${size.name}.png`, artifactDir), Buffer.from(shot.data, 'base64'));
    }
    results.push({ viewport: size.name, modal: item.name, ...layout });
    await value(`document.querySelector('${item.close}').click()`);
  }
}

await Promise.race([
  call('Emulation.clearDeviceMetricsOverride'),
  new Promise((resolve) => setTimeout(resolve, 2000)),
]);
socket.close();
console.log(`OK: ${results.length} cenários de modais de Cadastros responsivos.`);
console.log(JSON.stringify(results, null, 2));
