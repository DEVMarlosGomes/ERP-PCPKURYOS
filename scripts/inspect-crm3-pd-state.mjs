const port = process.argv[2] || '9224';
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('127.0.0.1.nip.io:5000'));
if (!page) throw new Error('Aba autenticada não encontrada.');
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
async function value(expression, awaitPromise = false) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
await call('Runtime.enable');
await call('Page.enable');
await call('Page.navigate', { url: `http://127.0.0.1.nip.io:5000/pd.html?inspect-sync=${Date.now()}` });
for (let tries = 0; tries < 100; tries += 1) {
  if (await value(`document.readyState === 'complete' && typeof firebase !== 'undefined' && firebase.apps.length > 0`)) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const state = await value(`(async () => {
  const root = (await firebase.database().ref('erp/kuryos').once('value')).val() || {};
  for (const [tenant, data] of [['kuryos', root]]) {
    const cards = Object.values(data.pd_cards || {});
    const card = cards.find((item) => /abelinha/i.test(String(item.produto || item.nome_produto || item.titulo || '')));
    if (!card) continue;
    const request = (data.pd_requests || {})[card.pd_request_id] || null;
    const development = Object.values(data.pd_developments || {}).find((item) => item.id === card.development_id || item.request_id === card.pd_request_id) || null;
    const sample = (data.crm_samples || {})[card.amostra_id] || null;
    const variation = (sample?.variacoes || []).find((item) => item.id === card.amostra_variacao_id) || null;
    const activity = {};
    for (const collection of ['pd_formulas','pd_formula_items','pd_tests','pd_samples','pd_sample_batches','pd_updates','pd_pending_items','pd_ficha_tecnica']) {
      activity[collection] = Object.values(data[collection] || {}).filter((item) =>
        item.development_id === development?.id || item.request_id === request?.id || item.pd_request_id === request?.id
      ).map((item) => ({ id: item.id, status: item.status, created_at: item.created_at, updated_at: item.updated_at }));
    }
    return { tenant, card, request, development, variation, activity };
  }
  return null;
})()`, true);
socket.close();
console.log(JSON.stringify(state, null, 2));
