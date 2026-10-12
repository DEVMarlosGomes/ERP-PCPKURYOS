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
async function value(expression, awaitPromise = false) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function waitFor(expression, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await value(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timeout aguardando: ${expression}`);
}

await call('Runtime.enable');
await call('Page.enable');
await call('Network.setCacheDisabled', { cacheDisabled: true });
await call('Page.navigate', { url: `http://127.0.0.1.nip.io:5000/pd.html?master-integration=${Date.now()}` });
await waitFor(`Boolean(globalThis.__KURYOS_PD_API__ && document.body.innerText.includes('Pipeline P&D'))`);

const result = await value(`(async () => {
  const api = globalThis.__KURYOS_PD_API__;
  const out = [];
  let request;
  let purchase;
  const assert = (condition, message) => { if (!condition) throw new Error(message); out.push(message); };
  try {
    const clients = (await api.get('/crm/clients')).data;
    const afee = clients.find((item) => item.cadastro_cliente_id === 'AFEE');
    assert(clients.length >= 59 && afee?.nome_empresa === 'AFEER OF ARABIAN', 'clientes mestres disponiveis no CRM');

    const products = (await api.get('/crm/skus')).data;
    assert(products.length >= 300 && products.some((item) => item.codigo === 'AMABBS01'), 'produtos ativos do cadastro disponiveis no CRM e no P&D');

    const catalog = (await api.get('/pd/catalog')).data;
    const primaryPackage = catalog.find((item) => item.master_material_id === 'EP-00001');
    const rawMaterial = catalog.find((item) => item.tipo_material === 'MPGR');
    assert(catalog.length >= 650 && primaryPackage?.categoria === 'embalagem' && rawMaterial?.categoria === 'mp', 'materiais ativos, embalagens e materias-primas disponiveis no P&D');
    assert(Array.isArray(primaryPackage.fornecedores) && primaryPackage.fornecedores.length > 0, 'fornecedores do cadastro preservados no P&D');
    const purchaseItems = (await api.get('/compras/itens', { params: { limit: 1000 } })).data.itens;
    assert(purchaseItems.some((item) => item.master_material_id === primaryPackage.master_material_id), 'cadastro mestre compartilhado entre P&D e Compras');

    request = (await api.post('/pd/requests/internal-research', {
      project_name: 'TESTE-INTEGRACAO-COMPRAS-' + Date.now(),
      objectives: 'Validar integracao P&D Compras',
      description: 'Registro temporario',
      priority: 'Normal'
    })).data;
    const full = (await api.get('/pd/requests/' + request.id + '/full')).data;
    const formula = (await api.post('/pd/developments/' + full.development.id + '/formulas', {
      name: 'Formula de integracao mestre', volume: 100, volume_unit: 'mL'
    })).data;
    const formulaItem = (await api.post('/pd/formulas/' + formula.id + '/items', {
      catalog_id: primaryPackage.master_material_id, percentage: 100
    })).data;
    assert(formulaItem.master_material_id === primaryPackage.master_material_id && formulaItem.material_code === primaryPackage.codigo_interno && formulaItem.ingredient_name === primaryPackage.nome, 'formula P&D preserva identidade e fornecedor do material mestre');
    purchase = (await api.post('/pd/requests/' + request.id + '/purchase-requests', {
      development_id: full.development.id,
      justificativa: 'Teste automatico da integracao entre P&D e Compras',
      items: [{ material_id: primaryPackage.master_material_id, quantidade: 12, unidade: primaryPackage.unidade_compra, observacao: 'Fixture temporario' }]
    })).data;
    const raw = (await firebase.database().ref('solicitacoes_compra/' + purchase.id).once('value')).val();
    const purchaseItem = Object.values(raw?.itens || {})[0];
    assert(raw?.origemModulo === 'PD' && raw?.pdRequestId === request.id && purchaseItem?.materialCodigo === 'EP-00001', 'necessidade do P&D criada na fila nativa de Compras');
    const history = (await api.get('/pd/requests/' + request.id + '/purchase-requests')).data;
    assert(history.some((item) => item.id === purchase.id && item.status === 'PENDENTE'), 'retorno de status de Compras visivel no P&D');
    await api.delete('/pd/requests/' + request.id + '/purchase-requests/' + purchase.id);
    purchase = null;
    return { ok: true, assertions: out, requestId: request.id };
  } finally {
    if (purchase?.id && request?.id) await api.delete('/pd/requests/' + request.id + '/purchase-requests/' + purchase.id);
    if (request?.id) await api.delete('/pd/requests/' + request.id);
  }
})().catch((error) => ({ ok: false, message: error.message, detail: error.response?.data?.detail, stack: error.stack }))`, true);

const residue = await value(`(async () => {
  const root = (await firebase.database().ref('solicitacoes_compra').once('value')).val() || {};
  return Object.values(root).filter((item) => String(item.justificativa || '').includes('Teste automatico da integracao entre P&D e Compras')).length;
})()`, true);

if (!result?.ok) {
  socket.close();
  throw new Error(JSON.stringify(result));
}
if (residue) {
  socket.close();
  throw new Error(`O teste deixou ${residue} solicitacao(oes) de compra temporaria(s).`);
}

const abelinhaId = await value(`(async () => {
  const requests = (await globalThis.__KURYOS_PD_API__.get('/pd/requests')).data || [];
  return requests.find((item) => /abelinha/i.test(item.title || item.project_name || ''))?.id || null;
})()`, true);
if (abelinhaId) {
  await call('Page.navigate', { url: 'http://127.0.0.1.nip.io:5000/pd/' + encodeURIComponent(abelinhaId) });
  await waitFor(`document.readyState === 'complete' && Boolean(globalThis.__KURYOS_PD_API__)`);
  try {
    await waitFor(`Boolean(document.getElementById('kuryos-pd-purchase-action'))`, 10000);
  } catch (error) {
    const diagnostic = await value(`({ path: location.pathname, script: Boolean(document.querySelector('script[src*="crm-pd-master-integration"]')), integration: Boolean(globalThis.__KURYOS_MASTER_INTEGRATION__), integrationError: globalThis.__KURYOS_MASTER_INTEGRATION_ERROR__ || null, api: Boolean(globalThis.__KURYOS_PD_API__), button: Boolean(document.getElementById('kuryos-pd-purchase-action')) })`);
    throw new Error(error.message + ' ' + JSON.stringify(diagnostic));
  }
  const actionState = await value(`({ path: location.pathname, script: Boolean(document.querySelector('script[src*="crm-pd-master-integration"]')), integration: Boolean(globalThis.__KURYOS_MASTER_INTEGRATION__), error: globalThis.__KURYOS_MASTER_INTEGRATION_ERROR__ || null, api: Boolean(globalThis.__KURYOS_PD_API__), button: Boolean(document.getElementById('kuryos-pd-purchase-action')), body: document.body.innerText.slice(0, 120) })`);
  if (!actionState.button) throw new Error('Acao de Compras ausente: ' + JSON.stringify(actionState));
  const ui = await value(`(() => {
    const button = document.getElementById('kuryos-pd-purchase-action');
    button.click();
    return true;
  })()`);
  if (!ui) throw new Error('Acao de Compras nao abriu no detalhe P&D.');
  await waitFor(`Boolean(document.querySelector('.kuryos-integration-dialog .kuryos-material-rows'))`);
  const dialog = await value(`({
    title: document.querySelector('.kuryos-integration-dialog h2')?.textContent,
    options: document.querySelectorAll('#kuryos-master-materials option').length,
    hasReason: Boolean(document.querySelector('.kuryos-purchase-reason'))
  })`);
  if (dialog.title !== 'Enviar necessidade para Compras' || dialog.options < 650 || !dialog.hasReason) throw new Error('Dialogo de integracao incompleto: ' + JSON.stringify(dialog));
  await value(`document.querySelector('.kuryos-integration-overlay')?.remove()`);
}

socket.close();
console.log(`OK: integracao mestre validada em ${result.assertions.length} fluxos; fixture de Compras removido e UI aprovada.`);
for (const assertion of result.assertions) console.log(`- ${assertion}`);
