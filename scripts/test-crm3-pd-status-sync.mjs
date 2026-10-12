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
  if (message.id && pending.has(message.id)) {
    const item = pending.get(message.id);
    pending.delete(message.id);
    message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression, awaitPromise = false) {
  const value = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
  return value.result?.value;
}
async function waitFor(expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timeout aguardando: ${expression}`);
}

await call('Runtime.enable');
await call('Page.enable');
await call('Network.setCacheDisabled', { cacheDisabled: true });
await call('Page.navigate', { url: `http://127.0.0.1.nip.io:5000/pd.html?status-sync=${Date.now()}` });
await waitFor(`Boolean(globalThis.__KURYOS_PD_API__ && document.body.innerText.includes('Pipeline P&D'))`);

const result = await evaluate(`(async () => {
  const api = globalThis.__KURYOS_PD_API__;
  let sample;
  let requestId;
  try {
    const projects = (await api.get('/crm/projects')).data || [];
    if (!projects.length) throw new Error('Nenhum projeto CRM disponivel para o teste.');
    const created = (await api.post('/crm/samples/batch/v2', {
      projeto_id: projects[0].id,
      samples: [{
        nome_produto: 'TESTE-SYNC-CODEX-' + Date.now(),
        variacoes: [{ descricao_aplicacao: 'Validacao espelho CRM3 P&D' }]
      }]
    })).data;
    sample = created.samples[0];
    const variation = sample.variacoes[0];
    requestId = variation.pd_request_id;

    await api.put('/crm/pd/cards/' + variation.pd_card_id + '/move', {
      status: 'em_desenvolvimento',
      observacao: 'Teste automatico de sincronizacao'
    });
    let request = (await api.get('/pd/requests/' + requestId)).data;
    let crmSample = (await api.get('/crm/samples/' + sample.id)).data;
    let crmVariation = crmSample.variacoes.find((item) => item.id === variation.id);
    if (request.status !== 'IN_PROGRESS' || crmVariation.status_pd_raw !== 'em_desenvolvimento') {
      throw new Error('Movimento P&D nao foi refletido no CRM3.');
    }

    await api.put('/pd/requests/' + requestId, { status: 'IN_TESTS' });
    const cards = (await api.get('/crm/pd/cards')).data;
    const card = cards.find((item) => item.id === variation.pd_card_id);
    crmSample = (await api.get('/crm/samples/' + sample.id)).data;
    crmVariation = crmSample.variacoes.find((item) => item.id === variation.id);
    if (card?.status_pd !== 'em_testes' || crmVariation.status_pd_raw !== 'em_testes') {
      throw new Error('Status principal nao foi refletido nos dois kanbans.');
    }
    return { ok: true, cardStatus: card.status_pd, crmStatus: crmVariation.status_pd_raw };
  } finally {
    if (requestId) await api.delete('/pd/requests/' + requestId);
    if (sample?.id) await api.delete('/crm/samples/' + sample.id);
  }
})().catch((error) => ({ ok: false, message: error.message, detail: error.response?.data?.detail }))`, true);

socket.close();
if (!result?.ok) throw new Error(JSON.stringify(result));
console.log(`OK: movimento do P&D e status principal sincronizados no CRM3 (${result.cardStatus}).`);
