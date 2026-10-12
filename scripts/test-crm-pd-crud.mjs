import fs from 'node:fs';
import path from 'node:path';

const marker = `TESTE-CODEX-${Date.now()}`;
const tabs = await (await fetch('http://127.0.0.1:9224/json')).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('127.0.0.1.nip.io:5000'));
if (!page) throw new Error('Aba autenticada do PCP não encontrada.');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const item = pending.get(message.id); pending.delete(message.id);
  message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
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

const tokenCandidates = [
  path.join(process.env.USERPROFILE, '.config', 'configstore', 'firebase-tools.json'),
  path.join(process.env.APPDATA, 'configstore', 'firebase-tools.json'),
];
const tokenFile = tokenCandidates.find((candidate) => fs.existsSync(candidate));
if (!tokenFile) throw new Error('Configuração local do Firebase CLI não encontrada.');
const firebaseConfig = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
const accessToken = firebaseConfig.tokens?.access_token;
if (!accessToken) throw new Error('Token local do Firebase CLI não encontrado.');
const rootUrl = 'https://erpkuryos-default-rtdb.firebaseio.com/erp/kuryos/crm_clients';
const headers = { Authorization: `Bearer ${accessToken}` };
let createdId = null;

try {
  await call('Page.navigate', { url: 'http://127.0.0.1.nip.io:5000/crm1.html' });
  await waitFor(`document.readyState === 'complete'`);
  await waitFor(`Boolean(document.querySelector('[data-testid="new-client-btn"]'))`);
  await value(`document.querySelector('[data-testid="new-client-btn"]').click()`);
  await waitFor(`Boolean([...document.querySelectorAll('[role="dialog"]')].find(el => el.textContent.includes('Novo Cliente')))`);
  const filled = await value(`(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(el => el.textContent.includes('Novo Cliente'));
    const input = dialog && dialog.querySelector('input');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(marker)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!filled) throw new Error('Campo Empresa não encontrado.');
  await waitFor(`Boolean([...document.querySelectorAll('[role="dialog"] button')].find(el => el.textContent.includes('Criar Cliente') && !el.disabled))`);
  await value(`[...document.querySelectorAll('[role="dialog"] button')].find(el => el.textContent.includes('Criar Cliente') && !el.disabled).click()`);
  await waitFor(`!document.querySelector('[role="dialog"]') && document.body.innerText.includes(${JSON.stringify(marker)})`, 20000);

  const response = await fetch(`${rootUrl}.json`, { headers });
  if (!response.ok) throw new Error(`Leitura RTDB falhou: ${response.status}`);
  const clients = await response.json() || {};
  const found = Object.entries(clients).find(([, client]) => client?.nome_empresa === marker);
  if (!found) throw new Error('Cliente criado pela tela não apareceu no Firebase.');
  [createdId] = found;
  if (found[1].stage !== 'prospeccao') throw new Error(`Etapa inicial incorreta: ${found[1].stage}`);
  console.log(JSON.stringify({ created: true, id: createdId, nome_empresa: marker, stage: found[1].stage }));
} finally {
  if (createdId) {
    const removed = await fetch(`${rootUrl}/${encodeURIComponent(createdId)}.json`, { method: 'DELETE', headers });
    if (!removed.ok) throw new Error(`Limpeza do registro de teste falhou: ${removed.status}`);
    const check = await fetch(`${rootUrl}/${encodeURIComponent(createdId)}.json`, { headers });
    if ((await check.json()) !== null) throw new Error('Registro de teste ainda existe após a limpeza.');
    console.log(JSON.stringify({ cleanup: true, id: createdId }));
  }
  socket.close();
}
