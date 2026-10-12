import { mkdir, writeFile } from 'node:fs/promises';

const debugPort = process.argv[2] || '9224';
const baseUrl = 'http://127.0.0.1.nip.io:5000';
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
const errors = [];
const publicDocuments = new Set([
  '/login.html', '/manuais.html', '/manual_admin.html', '/manual_apontamento.html',
  '/manual_cadastros.html', '/manual_comercial.html', '/manual_compras.html',
  '/manual_estoque.html', '/manual_logistica.html', '/manual_pcp.html',
  '/manual_qualidade.html', '/manual_referencia.html'
]);
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const description = message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Excecao JavaScript';
    if (!description.includes('permission_denied at /')) errors.push(description);
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function value(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function waitFor(expression, timeout = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await value(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timeout aguardando: ${expression}`);
}
async function navigate(path) {
  const before = errors.length;
  await call('Page.navigate', { url: `${baseUrl}${path}${path.includes('?') ? '&' : '?'}apple-test=${Date.now()}` });
  await waitFor(`document.readyState === 'complete'`);
  await waitFor(`Boolean([...document.styleSheets].some((sheet) => String(sheet.href || '').includes('kuryos-apple-system.css')))`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const result = await value(`(() => {
    const emoji = /(\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E|\\p{Emoji_Modifier})?)*|[✓✔✕✖★⬇↻])/gu;
    const forbidden = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('script,style,noscript,textarea,input,select,option,code,pre,svg,[contenteditable="true"],[data-allow-emoji]')) continue;
      if (emoji.test(node.nodeValue || '')) forbidden.push((node.nodeValue || '').trim().slice(0, 80));
      emoji.lastIndex = 0;
    }
    const sidebar = document.querySelector('#unified-navbar');
    return {
      path: location.pathname,
      title: document.title,
      designSystem: [...document.styleSheets].some((sheet) => String(sheet.href || '').includes('kuryos-apple-system.css')),
      iconSystem: typeof window.KuryosIcons === 'object',
      inlineIcons: document.querySelectorAll('.kuryos-inline-icon').length,
      emojis: forbidden.slice(0, 5),
      sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null,
      denied: document.body.innerText.includes('Acesso Negado'),
      font: getComputedStyle(document.body).fontFamily,
      background: getComputedStyle(document.body).backgroundColor,
    };
  })()`);
  result.errors = errors.slice(before);
  if (!result.designSystem || !result.iconSystem || result.emojis.length || result.errors.length) {
    throw new Error(`Falha visual em ${path}: ${JSON.stringify(result)}`);
  }
  return result;
}

await call('Runtime.enable');
await call('Page.enable');
await call('Network.enable');
await call('Network.setCacheDisabled', { cacheDisabled: true });
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

await navigate('/dashboard.html');
await waitFor(`Boolean(document.querySelector('#unified-navbar'))`);
const links = await value(`[...new Set([...document.querySelectorAll('#unified-navbar a[href]')].map((a) => new URL(a.href).pathname).filter((path) => path.endsWith('.html')))]`);
const fixed = [
  '/crm1.html', '/crm2.html', '/crm3.html', '/pd.html', '/pd/formulas', '/pd/homologacao',
  '/pd/catalog', '/pd/estoque', '/pd/relatorios', ...publicDocuments
];
const routes = [...new Set([...links, ...fixed])];

await value(`localStorage.setItem('kuryos-theme', 'light')`);
await navigate('/dashboard.html');
let theme = await value(`({ saved: localStorage.getItem('kuryos-theme'), attr: document.documentElement.getAttribute('data-theme'), dark: document.documentElement.classList.contains('dark') })`);
if (theme.saved !== 'light' || theme.attr !== 'light' || theme.dark) throw new Error(`Tema claro nao aplicado: ${JSON.stringify(theme)}`);

await mkdir('scripts/artifacts', { recursive: true });
let shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile('scripts/artifacts/kuryos-apple-light.png', Buffer.from(shot.data, 'base64'));

await waitFor(`Boolean(document.querySelector('#kt-theme-toggle'))`);
await value(`document.querySelector('#kt-theme-toggle').click()`);
await waitFor(`localStorage.getItem('kuryos-theme') === 'dark' && document.documentElement.classList.contains('dark')`);
theme = await value(`({ saved: localStorage.getItem('kuryos-theme'), attr: document.documentElement.getAttribute('data-theme'), dark: document.documentElement.classList.contains('dark') })`);
if (theme.saved !== 'dark' || theme.attr !== 'dark' || !theme.dark) throw new Error(`Tema escuro nao aplicado: ${JSON.stringify(theme)}`);
shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile('scripts/artifacts/kuryos-apple-dark.png', Buffer.from(shot.data, 'base64'));

const results = [];
for (const route of routes) {
  process.stdout.write(`Validando ${route}... `);
  results.push(await navigate(route));
  console.log('OK');
}
await value(`localStorage.removeItem('kuryos-theme'); if (typeof applyKuryosTheme === 'function') applyKuryosTheme('auto')`);
await call('Emulation.clearDeviceMetricsOverride');
socket.close();

console.log(`OK: design system Apple em ${results.length} rotas, temas claro/escuro e zero emojis visiveis.`);
console.log(JSON.stringify({ routes: results.map((item) => item.path), screenshots: ['scripts/artifacts/kuryos-apple-light.png', 'scripts/artifacts/kuryos-apple-dark.png'] }, null, 2));
