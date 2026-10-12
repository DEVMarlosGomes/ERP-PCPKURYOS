const port = process.argv[2] || '9224';
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('127.0.0.1.nip.io:5000'));
if (!page) throw new Error('Aba autenticada nao encontrada.');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let id = 0;
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
    const callId = ++id;
    pending.set(callId, { resolve, reject });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
}
const result = await call('Runtime.evaluate', {
  expression: `(async () => {
    const root = {};
    for (const name of ['clientes', 'produtos', 'materiais', 'estoque', 'fornecedores', 'custos_precos', 'solicitacoes_compra', 'pedidos_compra', 'erp/kuryos/crm_clients', 'erp/kuryos/pd_catalog']) {
      const value = (await firebase.database().ref(name).once('value')).val() || {};
      const entries = Object.entries(value);
      root[name] = { count: entries.length, samples: entries.slice(0, 3).map(([key, item]) => ({ key, item })) };
    }
    const materials = (await firebase.database().ref('materiais').once('value')).val() || {};
    root.materialTypes = Object.values(materials).reduce((acc, item) => {
      const type = item.tipo || 'SEM_TIPO';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    return root;
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
socket.close();
if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
console.log(JSON.stringify(result.result.value, null, 2));
