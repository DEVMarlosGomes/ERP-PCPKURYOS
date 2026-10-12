const tabs = await (await fetch('http://127.0.0.1:9224/json')).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('127.0.0.1.nip.io:5000'));
if (!page) throw new Error('Aba autenticada do PCP não encontrada.');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const item = pending.get(message.id); pending.delete(message.id);
  message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const next = ++id; pending.set(next, { resolve, reject });
    socket.send(JSON.stringify({ id: next, method, params }));
  });
}
async function value(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}
async function waitFor(expression, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await value(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timeout aguardando ${expression}`);
}
async function inspect(width, height, mobile) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await call('Page.navigate', { url: `http://127.0.0.1.nip.io:5000/crm1.html?responsive-test=${Date.now()}` });
  await waitFor(`Boolean(document.querySelector('[data-testid="new-client-btn"]'))`);
  await value(`document.querySelector('[data-testid="new-client-btn"]').click()`);
  await waitFor(`Boolean(document.querySelector('[role="dialog"]'))`);
  return value(`(() => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
    const dialog = document.querySelector('[role="dialog"]');
    const chain = [];
    for (let el = dialog; el; el = el.parentElement) chain.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || ''), rect: rect(el), position: getComputedStyle(el).position, overflow: getComputedStyle(el).overflow, zIndex: getComputedStyle(el).zIndex });
    return { viewport: { width: innerWidth, height: innerHeight }, body: rect(document.body), styles: [...document.styleSheets].map((sheet) => sheet.href || 'inline'), responsiveLink: Boolean(document.querySelector('link[href*="crm-pd-responsive.css"]')), chain };
  })()`);
}
const results = [];
results.push({ size: 'desktop', ...(await inspect(1280, 720, false)) });
await value(`document.querySelector('[role="dialog"] button')?.click()`);
results.push({ size: 'mobile', ...(await inspect(390, 844, true)) });
await call('Emulation.clearDeviceMetricsOverride');
socket.close();
console.log(JSON.stringify(results, null, 2));
