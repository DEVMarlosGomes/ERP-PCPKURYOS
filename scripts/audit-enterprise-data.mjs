const debugPort = process.argv[2] || '9224';
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

const paths = [
  'pedidos', 'pedidos_comerciais', 'ops', 'programacao', 'alocacoes_planejamento',
  'apontamentos', 'paradas_historico', 'solicitacoes_compra', 'pedidos_compra',
  'materiais', 'estoque', 'estoque_lotes', 'qualidade_analises', 'qualidade_rnc',
  'cargas', 'agendamentos_expedicao', 'erp/kuryos/crm_clients', 'erp/kuryos/crm_projects',
  'erp/kuryos/crm_samples', 'erp/kuryos/pd_requests', 'erp/kuryos/pd_developments',
  'erp/kuryos/pd_tests', 'erp/kuryos/pd_approvals'
];
const result = await call('Runtime.evaluate', {
  expression: `(async () => {
    const paths = ${JSON.stringify(paths)};
    const report = {};
    for (const path of paths) {
      let value;
      try {
        value = (await firebase.database().ref(path).once('value')).val() || {};
      } catch (error) {
        report[path] = { unavailable: true, reason: error && (error.code || error.message) || 'erro de leitura' };
        continue;
      }
      const rows = Array.isArray(value) ? value.filter(Boolean) : Object.values(value);
      const sample = rows.find((row) => row && typeof row === 'object') || null;
      const statuses = {};
      rows.forEach((row) => {
        const status = row && (row.status || row.situacao || row.status_pd || row.etapa);
        if (status != null && status !== '') statuses[String(status)] = (statuses[String(status)] || 0) + 1;
      });
      report[path] = {
        count: rows.length,
        fields: sample ? Object.keys(sample).sort() : [],
        statuses
      };
    }
    return report;
  })()`,
  awaitPromise: true,
  returnByValue: true
});
socket.close();
if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
console.log(JSON.stringify(result.result.value, null, 2));
