const debugPort = process.argv[2] || '9224';
const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('127.0.0.1.nip.io:5000'));
if (!page) throw new Error('Aba do PCP não encontrada no navegador de teste.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
const browserErrors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    browserErrors.push(message.params?.exceptionDetails?.text || 'Exceção JavaScript');
  }
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
    browserErrors.push(message.params.entry.text);
  }
});

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function waitFor(expression, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true });
    if (result.result?.value) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timeout aguardando: ${expression}`);
}

await call('Runtime.enable');
await call('Page.enable');
await call('Log.enable');

const scenarios = [
  ['/crm1.html', 'Pipeline Comercial'],
  ['/crm2.html', 'Pipeline de Projetos'],
  ['/crm3.html', 'Pipeline de Amostras'],
  ['/pd.html', 'Pipeline P&D'],
  ['/pd/formulas', 'Banco de Fórmulas'],
  ['/pd/homologacao', 'Homologações'],
  ['/pd/catalog', 'Banco de Custos'],
  ['/pd/estoque', 'Estoque'],
  ['/pd/relatorios', 'Relatórios'],
];

const results = [];
for (const [path, expected] of scenarios) {
  const errorsBefore = browserErrors.length;
  await call('Page.navigate', { url: `http://127.0.0.1.nip.io:5000${path}` });
  await waitFor(`document.readyState === 'complete'`);
  await waitFor(`document.body && document.body.innerText.includes(${JSON.stringify(expected)})`);
  await waitFor(`Boolean(document.querySelector('#unified-navbar'))`);
  const evaluated = await call('Runtime.evaluate', {
    expression: `({
      url: location.pathname,
      title: document.title,
      expected: document.body.innerText.includes(${JSON.stringify(expected)}),
      sidebar: Boolean(document.querySelector('#unified-navbar')),
      externalTopNav: Boolean(document.querySelector('[data-testid="top-nav"]')),
      reactRoot: Boolean(document.querySelector('#root')?.children.length),
      denied: document.body.innerText.includes('Acesso Negado')
    })`,
    returnByValue: true,
  });
  const value = evaluated.result?.value || {};
  value.consoleErrors = browserErrors.slice(errorsBefore);
  results.push(value);
}

const interactionResults = [];
async function navigate(path, expected) {
  await call('Page.navigate', { url: `http://127.0.0.1.nip.io:5000${path}` });
  await waitFor(`document.readyState === 'complete'`);
  await waitFor(`document.body.innerText.includes(${JSON.stringify(expected)})`);
  await waitFor(`Boolean(document.querySelector('#unified-navbar'))`);
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  return result.result?.value;
}
async function escape() {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
}

await navigate('/crm1.html', 'Pipeline Comercial');
await evaluate(`document.querySelector('[data-testid="crm1-view-list"]').click()`);
await waitFor(`document.querySelector('[data-testid="crm1-view-list"]').getAttribute('aria-selected') === 'true'`);
await evaluate(`document.querySelector('[data-testid="crm1-view-kanban"]').click()`);
await waitFor(`document.querySelector('[data-testid="crm1-view-kanban"]').getAttribute('aria-selected') === 'true'`);
interactionResults.push({ action: 'CRM 1 alterna Lista/Kanban', ok: true });

await evaluate(`document.querySelector('[data-testid="new-client-btn"]').click()`);
await waitFor(`Boolean([...document.querySelectorAll('[role="dialog"]')].find(el => el.innerText.includes('Novo Cliente')))`);
interactionResults.push({ action: 'CRM 1 abre cadastro de cliente', ok: true });
await escape();

await navigate('/crm2.html', 'Pipeline de Projetos');
await evaluate(`[...document.querySelectorAll('button')].find(el => el.innerText.includes('Pedido Direto')).click()`);
await waitFor(`Boolean([...document.querySelectorAll('[role="dialog"]')].find(el => el.innerText.includes('Pedido Direto')))`);
interactionResults.push({ action: 'CRM 2 abre Pedido Direto', ok: true });
await escape();

await navigate('/pd.html', 'Pipeline P&D');
await waitFor(`[...document.querySelectorAll('button')].some(el => el.textContent.includes('Nova Pesquisa Interna'))`);
const pdClick = await evaluate(`(() => { const buttons = [...document.querySelectorAll('button')].filter(el => el.textContent.includes('Pesquisa')); const button = buttons.find(el => el.textContent.trim().includes('Nova Pesquisa Interna') && !el.disabled); if (!button) return { clicked: false, buttons: buttons.map(el => ({ text: el.textContent, disabled: el.disabled, visible: Boolean(el.offsetWidth || el.offsetHeight) })) }; button.click(); return { clicked: true, text: button.textContent }; })()`);
if (!pdClick?.clicked) throw new Error(`Botão de Pesquisa Interna não clicado: ${JSON.stringify(pdClick)}`);
await waitFor(`Boolean(document.querySelector('[role="dialog"][data-state="open"]'))`);
interactionResults.push({ action: 'P&D abre Pesquisa Interna', ok: true });
await escape();

socket.close();
console.log(JSON.stringify(results, null, 2));
console.log(JSON.stringify(interactionResults, null, 2));
const failed = results.filter((item) => !item.expected || !item.sidebar || item.externalTopNav || !item.reactRoot || item.denied || item.consoleErrors.length);
if (failed.length) {
  console.error(`Falharam ${failed.length} de ${results.length} cenários.`);
  process.exit(1);
}
console.log(`OK: ${results.length} cenários autenticados e ${interactionResults.length} interações no navegador.`);
