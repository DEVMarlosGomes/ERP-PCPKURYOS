const debugPort = process.argv[2] || '9224';
const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('127.0.0.1.nip.io:5000'));
if (!page) throw new Error('Aba autenticada do PCP não encontrada.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const item = pending.get(message.id);
  pending.delete(message.id);
  message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}
async function waitFor(expression, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timeout aguardando ${expression}`);
}

const sizes = [
  { name: 'desktop', width: 1280, height: 720, mobile: false },
  { name: 'tablet', width: 820, height: 1180, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];
const routes = ['/crm1.html', '/crm2.html', '/crm3.html', '/pd.html', '/pd/formulas', '/pd/homologacao', '/pd/catalog', '/pd/estoque', '/pd/relatorios'];

await call('Runtime.enable');
await call('Page.enable');
const results = [];
for (const size of sizes) {
  await call('Emulation.setDeviceMetricsOverride', {
    width: size.width,
    height: size.height,
    deviceScaleFactor: 1,
    mobile: size.mobile,
  });
  for (const route of routes) {
    await call('Page.navigate', { url: `http://127.0.0.1.nip.io:5000${route}?responsive-test=${Date.now()}` });
    await waitFor(`document.readyState === 'complete' && Boolean(document.querySelector('#unified-navbar')) && Boolean(document.querySelector('#root')?.children.length)`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const layout = await evaluate(`(() => {
      const rect = (el) => { const r = el && el.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) } : null; };
      const vw = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll('body *')].filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const intentionalScroller = el.closest('.kanban-board, [data-testid$="-table-wrap"], [data-radix-popper-content-wrapper]');
        return !el.closest('#unified-navbar') && !intentionalScroller && r.width > 0 && style.position !== 'fixed' && (r.left < -2 || r.right > vw + 2);
      }).slice(0, 4).map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 180),
        testid: el.getAttribute('data-testid'),
        rect: rect(el),
      }));
      const main = document.querySelector('[data-app-main="true"]');
      return {
        viewport: { width: vw, height: document.documentElement.clientHeight },
        html: { scrollWidth: document.documentElement.scrollWidth, rect: rect(document.documentElement) },
        body: { scrollWidth: document.body.scrollWidth, rect: rect(document.body), paddingLeft: getComputedStyle(document.body).paddingLeft, paddingTop: getComputedStyle(document.body).paddingTop },
        root: rect(document.querySelector('#root')),
        appMain: rect(main),
        appMainClass: String(main?.className || ''),
        overflowX: document.documentElement.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1,
        offenders,
      };
    })()`);
    results.push({ size: size.name, route, ...layout });
  }
}
await call('Emulation.clearDeviceMetricsOverride');
socket.close();
console.log(JSON.stringify(results, null, 2));
