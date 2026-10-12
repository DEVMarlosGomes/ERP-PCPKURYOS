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
const errors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
    const text = (message.params.args || []).map((arg) => arg.value || arg.description || '').join(' ');
    if (text.includes('/static/js/')) errors.push(text);
  }
});

function call(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++sequence;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  return result.result?.value;
}

async function waitFor(expression, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timeout aguardando: ${expression}`);
}

await call('Runtime.enable');
await call('Page.enable');
await call('Network.enable');
await call('Network.setCacheDisabled', { cacheDisabled: true });
await call('Page.navigate', { url: 'http://127.0.0.1.nip.io:5000/pd.html' });
await waitFor(`document.body.innerText.includes('Pipeline P&D')`);
await waitFor(`document.body.innerText.includes('abelinha')`);

const pipeline = await evaluate(`(() => {
  const columns = [...document.querySelectorAll('.kanban-column')];
  const text = columns.map((el) => el.innerText).join('\\n');
  const sampleColumn = columns.find((el) => el.innerText.includes('abelinha'));
  return {
    hasVariationCode: text.includes('0001-A'),
    hasProduct: text.includes('abelinha'),
    hasClient: text.includes('teste'),
    hasBrokenCode: text.split('\\n').some((line) => line.trim() === '?'),
    isInDevelopment: sampleColumn?.innerText.includes('Em Desenvolvimento') || false,
  };
})()`);

if (!pipeline.hasVariationCode || !pipeline.hasProduct || !pipeline.hasClient || pipeline.hasBrokenCode || !pipeline.isInDevelopment) {
  throw new Error(`Card CRM3 incompleto no P&D: ${JSON.stringify(pipeline)}`);
}

const clicked = await evaluate(`(() => {
  const card = [...document.querySelectorAll('.kanban-column .bg-card')]
    .find((el) => el.innerText.includes('abelinha'));
  if (!card) return false;
  card.click();
  return true;
})()`);
if (!clicked) throw new Error('Card abelinha não encontrado para abrir o detalhe.');

await waitFor(`location.pathname.startsWith('/pd/') && document.body.innerText.includes('BRIEFING DO PROJETO')`);
const detail = await evaluate(`({
  hasOverviewError: document.body.innerText.includes('Não foi possível carregar esta seção'),
  hasProduct: document.body.innerText.includes('abelinha'),
  hasClient: document.body.innerText.includes('teste'),
  hasBriefing: document.body.innerText.includes('BRIEFING DO PROJETO · CRM'),
})`);

await call('Page.navigate', { url: 'http://127.0.0.1.nip.io:5000/crm/samples' });
await waitFor(`document.body.innerText.includes('Pipeline de Amostras')`);
await waitFor(`document.body.innerText.includes('abelinha')`);
const crmMirror = await evaluate(`(() => {
  const columns = [...document.querySelectorAll('.kanban-column')];
  const sampleColumn = columns.find((el) => el.innerText.includes('abelinha'));
  return {
    hasVariationCode: sampleColumn?.innerText.includes('0001-A') || false,
    isInDevelopment: sampleColumn?.innerText.includes('Em Desenvolvimento') || false,
  };
})()`);

socket.close();
if (detail.hasOverviewError || !detail.hasProduct || !detail.hasClient || !detail.hasBriefing || !crmMirror.hasVariationCode || !crmMirror.isInDevelopment || errors.length) {
  throw new Error(`Detalhe P&D inválido: ${JSON.stringify({ detail, errors })}`);
}
console.log('OK: CRM3 ↔ P&D preserva os dados e mantém a amostra em Em Desenvolvimento nos dois kanbans.');
