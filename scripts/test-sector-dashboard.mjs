const debugPort = process.argv[2] || '9224';
const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('127.0.0.1.nip.io:5000'));
if (!page) throw new Error('Aba autenticada do PCP nao encontrada.');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0; const pending = new Map(); const errors = [];
socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); } if (message.method === 'Runtime.exceptionThrown') { const detail = message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Erro JS'; if (!detail.includes('permission_denied at /')) errors.push(detail); } });
function call(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
async function value(expression) { const result = await call('Runtime.evaluate', { expression, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result?.value; }
async function waitFor(expression, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await value(expression)) return; await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error(`Timeout aguardando: ${expression}`); }

await call('Runtime.enable'); await call('Page.enable'); await call('Network.enable'); await call('Network.setCacheDisabled', { cacheDisabled: true });
await call('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
await call('Page.navigate', { url: `http://127.0.0.1.nip.io:5000/dashboard_setorial.html?sector-test=${Date.now()}` });
await waitFor(`document.documentElement?.getAttribute('data-kuryos-enterprise-shell') === 'ready' && document.getElementById('sector-state')?.textContent === 'Fontes atualizadas'`);
const areas = await value(`[...document.querySelectorAll('.sector-tab')].map((button) => button.dataset.sector)`);
if (areas.length !== 9) throw new Error(`Esperadas 9 areas, recebidas ${areas.length}.`);
const results = [];
for (const area of areas) {
  const result = await value(`(() => { const button = document.querySelector('.sector-tab[data-sector="${area}"]'); button.click(); return { area: '${area}', kpis: document.querySelectorAll('.sector-kpi').length, methods: document.querySelectorAll('.sector-method').length, unavailable: document.querySelectorAll('.sector-kpi[data-available="false"]').length, title: document.getElementById('sector-title').textContent, urlArea: new URLSearchParams(location.search).get('area'), overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth }; })()`);
  if (result.kpis !== 8 || result.methods < 3 || result.urlArea !== area || result.overflow > 2) throw new Error(`Painel setorial invalido: ${JSON.stringify(result)}`);
  results.push(result);
}
await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await call('Page.navigate', { url: `http://127.0.0.1.nip.io:5000/dashboard_setorial.html?area=qualidade&mobile=${Date.now()}` });
await waitFor(`document.getElementById('sector-state')?.textContent === 'Fontes atualizadas'`);
const mobile = await value(`({ overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth, columns: getComputedStyle(document.querySelector('.sector-kpis')).gridTemplateColumns.split(' ').length, active: document.querySelector('.sector-tab.active')?.dataset.sector })`);
if (mobile.overflow > 2 || mobile.columns !== 1 || mobile.active !== 'qualidade') throw new Error(`Painel setorial mobile invalido: ${JSON.stringify(mobile)}`);
await call('Emulation.clearDeviceMetricsOverride'); socket.close();
if (errors.length) throw new Error(`Erros de runtime: ${JSON.stringify(errors)}`);
console.log(`OK: ${results.length} dashboards setoriais com KPIs reais/indisponiveis, URL sincronizada e mobile validado.`);
console.log(JSON.stringify({ results, mobile }, null, 2));
