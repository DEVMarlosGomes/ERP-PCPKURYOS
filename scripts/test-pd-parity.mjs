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
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
});
function call(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++sequence;
    pending.set(id, resolve);
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
await call('Page.navigate', { url: `http://127.0.0.1.nip.io:5000/pd.html?parity=${Date.now()}` });
await waitFor(`Boolean(document.body && document.body.innerText.includes('Pipeline P&D') && globalThis.__KURYOS_PD_API__)`);

const result = await evaluate(`(async () => {
  const api = globalThis.__KURYOS_PD_API__;
  const out = [];
  let req;
  const created = {};
  const assert = (condition, message) => { if (!condition) throw new Error(message); out.push(message); };
  try {
    req = (await api.post('/pd/requests/internal-research', {
      project_name: 'TESTE-CODEX-PD-' + Date.now(),
      objectives: 'Validacao ponta a ponta', description: 'Registro temporario', references: 'Teste automatizado', priority: 'Normal'
    })).data;
    assert(req.status === 'IN_PROGRESS' && req.pd_card_id, 'pesquisa interna e card vinculados');

    let full = (await api.get('/pd/requests/' + req.id + '/full')).data;
    const devId = full.development.id;
    assert(full.history.length === 2 && full.development.status === 'active', 'overview e historico inicial');

    const formula = (await api.post('/pd/developments/' + devId + '/formulas', { name: 'Formula teste', volume: 100, volume_unit: 'mL', cotacao_usd: 6 })).data;
    const itemA = (await api.post('/pd/formulas/' + formula.id + '/items', { ingredient_name: 'Base', percentage: 70, price_per_kg: 10, price_currency: 'BRL', phase: 'A' })).data;
    await api.post('/pd/formulas/' + formula.id + '/items', { ingredient_name: 'Ativo', percentage: 30, price_per_kg: 20, price_currency: 'BRL', phase: 'B' });
    assert(itemA.cost_brl === 7, 'manipulacao calcula custos');
    const phase = (await api.post('/pd/formulas/' + formula.id + '/phases', { name: 'Fase A', order: 0, instructions: 'Misturar' })).data;
    await api.put('/pd/formulas/' + formula.id + '/phases/reorder', { phase_ids: [phase.id] });
    assert((await api.get('/pd/formulas/' + formula.id + '/phases')).data.length === 1, 'fases da manipulacao');

    await api.put('/pd/requests/' + req.id + '/status', { new_status: 'IN_TESTS', comment: 'Formula registrada' });
    let locked = false;
    try { await api.put('/pd/formula-items/' + itemA.id, { percentage: 60 }); } catch (error) { locked = error.response?.status === 409; }
    assert(locked, 'formula bloqueada ao entrar em testes');
    const version2 = (await api.post('/pd/formulas/' + formula.id + '/new-version', { justification: 'Ajuste tecnico validado para a segunda versao' })).data;
    assert(version2.version === 2 && version2.items.length === 2, 'versionamento integral da formula');

    const test = (await api.post('/pd/developments/' + devId + '/tests', { type: 'sensorial', status: 'PASSED', dados: { aspecto: 'conforme' } })).data;
    await api.put('/pd/tests/' + test.id, { status: 'PASSED' });
    await api.put('/pd/developments/' + devId + '/lab-results', { sensorial: { aspecto: 'Homogeneo', cor: 'Incolor', odor: 'Caracteristico' }, ph: { valor_medido: 6.2 } });
    const study = (await api.get('/pd/requests/' + req.id + '/stability-study')).data;
    await api.post('/pd/stability/studies/' + study.study.id + '/readings', { condition_code: study.constants.conditions[0].code, day_offset: 2, parameters: { aspecto: 'conforme' } });
    assert((await api.get('/pd/requests/' + req.id + '/stability-study')).data.readings.length === 1, 'testes e estabilidade D48');

    const sample = (await api.post('/pd/developments/' + devId + '/samples', { code: 'AM-001', sent_to_client: false })).data;
    await api.put('/pd/samples/' + sample.id, { sent_to_client: true, client_approved: true });
    const batch = (await api.post('/pd/developments/' + devId + '/sample-batches', { nome: 'Lote rapido', formula_base_id: version2.id, volume_base_ml: 15, base_total_volume_ml: 60, variantes: [{ nome: 'Variante 1', overrides: [] }, { nome: 'Variante 2', overrides: [] }] })).data;
    assert(batch.capacidade_maxima_derivacoes === 4 && batch.capacidade_restante_derivacoes === 2, 'lote de amostras e capacidade');

    const pendingItem = (await api.post('/pd/requests/' + req.id + '/pending', { tipo: 'fragrancia', descricao: 'Fragrancia teste', data_prevista: '2099-01-01' })).data;
    await api.put('/pd/pending/' + pendingItem.id, { status: 'recebido' });
    const updates = (await api.get('/pd/requests/' + req.id + '/updates')).data;
    assert(updates.some((u) => u.tipo === 'pendencia_criada') && updates.some((u) => u.tipo === 'pendencia_resolvida'), 'atualizacoes e pendencias sincronizadas');

    await api.put('/pd/requests/' + req.id + '/ficha-tecnica-ui', { aspecto: { especificacao: 'Homogeneo', resultado: 'Conforme' }, cor: { especificacao: 'Incolor', resultado: 'Conforme' } });
    assert((await api.get('/pd/requests/' + req.id + '/ficha-tecnica-ui')).data.formula_items.length === 2, 'ficha tecnica integrada');

    await api.put('/pd/developments/' + devId + '/cost-versions/v1', { ingredient_cost_manual: 1, notes: 'Conferido' });
    await api.post('/pd/developments/' + devId + '/cost-versions/v1/submit');
    await api.put('/pd/developments/' + devId + '/cost-versions/v2', { packaging_cost: 2, labor_cost: 3, overhead_cost: 1, other_cost: 0 });
    const costs = (await api.post('/pd/developments/' + devId + '/cost-versions/v2/finalize')).data;
    assert(costs.v2.status === 'finalizado' && costs.total_final > 0, 'custos P&D e comercial');

    const doc1 = (await api.post('/pd/requests/' + req.id + '/live-documents/ficha_tecnica/generate', { reason: 'Primeira versao', changed_fields: ['formula'] })).data;
    await api.post('/pd/requests/' + req.id + '/live-documents/ficha_tecnica/generate', { reason: 'Segunda versao', changed_fields: ['formula'] });
    const diff = (await api.get('/pd/document-versions/' + doc1.id + '/diff')).data;
    assert(diff.current.version_code === 'FT-001' && Array.isArray(diff.approval_tasks), 'documentos vivos, diff e aprovacao');
    await api.put('/workflow/tasks/' + diff.approval_tasks[0].id + '/decision', { decision: 'approved', comment: 'Documento conferido' });
    const approvedDoc = (await api.get('/pd/document-versions/' + doc1.id)).data;
    assert(approvedDoc.status === 'aprovado' && approvedDoc.active_for_operation, 'workflow aprova documento vigente');

    const attachment = (await api.post('/pd/developments/' + devId + '/documents', { name: 'Laudo teste', url: 'data:text/plain,teste' })).data;
    assert((await api.get('/pd/developments/' + devId + '/documents')).data.some((d) => d.id === attachment.id), 'documentos anexos');

    const bank = (await api.get('/pd/formulas/bank', { params: { q: req.project_name } })).data;
    assert(bank.some((f) => f.id === version2.id && f.project_name === req.project_name && f.item_count === 2), 'banco de formulas com contexto e filtros');

    created.catalog = (await api.post('/pd/catalog', { nome: 'TESTE CATALOGO CODEX', inci: 'Test Ingredient', categoria: 'ativo', preco_rs_kg: 10, unidade: 'kg' })).data;
    await api.put('/pd/catalog/' + created.catalog.id, { preco_rs_kg: 12 });
    assert((await api.get('/pd/catalog/' + created.catalog.id + '/price-history')).data.length === 1, 'banco de custos e historico de preco');

    created.stock = (await api.post('/pd/stock', { nome: 'TESTE ESTOQUE CODEX', categoria: 'mp', quantidade_atual: 10, quantidade_minima: 3, unidade_medida: 'kg' })).data;
    await api.post('/pd/stock/' + created.stock.id + '/movements', { tipo: 'saida', quantidade: 2, motivo: 'Teste' });
    await api.post('/pd/stock/' + created.stock.id + '/movements', { tipo: 'ajuste', quantidade: 5, motivo: 'Inventario' });
    const stockFiltered = (await api.get('/pd/stock', { params: { categoria: 'mp', q: 'TESTE ESTOQUE CODEX' } })).data;
    assert(stockFiltered[0]?.quantidade_atual === 5 && (await api.get('/pd/stock/' + created.stock.id + '/movements')).data.length === 3, 'estoque lab, movimentacoes e ajuste absoluto');

    created.supplier = (await api.post('/pd/homologacao/fornecedores', { razao_social: 'TESTE FORNECEDOR CODEX', categoria: 'MP' })).data;
    await api.post('/pd/homologacao/fornecedores/' + created.supplier.id + '/homologar', { aprovado: true, parecer: 'Aprovado no teste' });
    created.mp = (await api.post('/pd/homologacao/mps', { nome: 'TESTE MP CODEX', tipo_mp: 'FORMULACAO', fornecedor_id: created.supplier.id, fornecedor_nome: created.supplier.razao_social })).data;
    await api.post('/pd/homologacao/mps/' + created.mp.id + '/homologar', { aprovado: true, parecer: 'Aprovada no teste' });
    const dashboard = (await api.get('/pd/homologacao/dashboard')).data;
    assert(dashboard.fornecedores.por_status.homologado >= 1 && dashboard.mps.por_status.homologada >= 1, 'homologacoes, filtros e indicadores');

    const metrics = (await api.get('/pd/metrics')).data;
    assert(Number.isFinite(metrics.total) && metrics.by_priority && metrics.by_status, 'relatorios e metricas');

    await api.put('/pd/requests/' + req.id + '/status', { new_status: 'WAITING_APPROVAL', comment: 'Estabilidade concluida' });
    await api.post('/pd/developments/' + devId + '/approval', { approved_by_internal: true, approved_by_client: true });
    await api.put('/pd/requests/' + req.id + '/status', { new_status: 'APPROVED', comment: 'Aprovacao concluida' });
    await api.put('/pd/requests/' + req.id + '/status', { new_status: 'COMPLETED', comment: 'Processo concluido' });
    full = (await api.get('/pd/requests/' + req.id + '/full')).data;
    assert(full.request.status === 'COMPLETED' && full.development.status === 'completed', 'todas as etapas ate conclusao');
    return { ok: true, assertions: out, requestId: req.id };
  } finally {
    if (req?.id) await api.delete('/pd/requests/' + req.id);
    if (created.mp?.id) await api.delete('/pd/homologacao/mps/' + created.mp.id);
    if (created.supplier?.id) await api.delete('/pd/homologacao/fornecedores/' + created.supplier.id);
    if (created.stock?.id) await api.delete('/pd/stock/' + created.stock.id);
    if (created.catalog?.id) await api.delete('/pd/catalog/' + created.catalog.id);
  }
})().catch((error) => ({ ok: false, message: error.message, status: error.response?.status, detail: error.response?.data?.detail, stack: error.stack }))`, true);

const residueCount = await evaluate(`(async () => {
  const api = globalThis.__KURYOS_PD_API__;
  const collections = await Promise.all([
    api.get('/pd/requests'), api.get('/pd/catalog', { params: { q: 'TESTE CATALOGO CODEX' } }),
    api.get('/pd/stock', { params: { q: 'TESTE ESTOQUE CODEX' } }),
    api.get('/pd/homologacao/fornecedores', { params: { search: 'TESTE FORNECEDOR CODEX' } }),
    api.get('/pd/homologacao/mps', { params: { search: 'TESTE MP CODEX' } })
  ]);
  return collections.flatMap((entry) => entry.data || []).filter((item) => String(item.project_name || item.nome || item.razao_social || '').includes('TESTE') && String(item.project_name || item.nome || item.razao_social || '').includes('CODEX')).length;
})()`, true);

socket.close();
if (!result?.ok) throw new Error(JSON.stringify(result));
if (residueCount) throw new Error(`O teste deixou ${residueCount} registro(s) temporario(s).`);
console.log(`OK: paridade P&D validada em ${result.assertions.length} fluxos; registro temporario removido.`);
for (const assertion of result.assertions) console.log(`- ${assertion}`);
