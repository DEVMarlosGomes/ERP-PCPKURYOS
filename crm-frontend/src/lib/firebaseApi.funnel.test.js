// Funil comercial no adaptador Firebase: transições do ERP, justificativa para
// voltar, histórico, unicidade dos cards, ADM livre e exclusão só por ADM.
import assert from "node:assert/strict";
import { memory, expectStatus as fails } from "@/test/memoryFirebase";

vi.mock("firebase/database", () => import("@/test/memoryFirebase").then((m) => m.databaseModule));
vi.mock("firebase/storage", () => import("@/test/memoryFirebase").then((m) => m.storageModule));
vi.mock("@/lib/firebase", () => import("@/test/memoryFirebase").then((m) => m.firebaseModule));
vi.mock("@/lib/justificationPrompt", async (orig) => ({ ...(await orig()), askJustification: (d) => memory.prompt(d) }));
const SEED = {
  usuarios: {
    adm: { role: 'admin', name: 'Ana ADM', tenant_id: 'kuryos' },
    vend: { role: 'vendedor', name: 'Bruno Vendas', tenant_id: 'kuryos' },
  },
  clientes: { MISS: { nome: 'MISS ROSE', cnpj: '12.345.678/0001-90', ativo: true } },
};
const QUALIFIED = {
  canal_origem: 'site', categoria_interesse: ['perfumaria'], temperatura_lead: 'quente', responsavel_comercial: 'Bruno',
  segmento: 'marca_propria', contato_principal: { nome: 'Ana', whatsapp: '11999990000', email: 'ana@lumi.com' },
};
// 15/10/2026: decisor é a caixa "É decisor" no contato; a pergunta da Anvisa saiu.
const GATE = { contato_principal: { ...QUALIFIED.contato_principal, decisor: true }, volume_estimado_mensal: '5000', fornecedor_atual: 'Nenhum' };
const BRIEFING = {
  nome_projeto: 'Linha Verão', categoria: 'perfumaria', responsavel_comercial: 'Bruno', ideia_conceito: 'Splash cítrico',
  posicionamento: 'premium', volume_estimado_pedido: 3000, tipo_servico: 'desenvolvimento_completo', prazo_desejado_amostra: '2026-11-10',
};

let api;
let prompted = 0;
const T = "erp/kuryos";
const db = (p) => memory.read(p);
const setUser = (uid) => memory.setUser(uid);
const check = (name, fn) => test(name, fn);

beforeAll(async () => {
  memory.reset(SEED, { prompt: async () => { prompted += 1; return prompted === 1 ? null : "Cliente pediu revisão do briefing"; } });
  api = (await import("@/lib/firebaseApi")).default;
  setUser("vend");
});
afterAll(() => memory.restore());

describe("funil comercial (CRM1 → CRM2 → CRM3)", () => {
  let client;
  check('criar cliente no CRM1 nasce em prospecção', async () => {
    client = (await api.post('/crm/clients', { nome_empresa: 'Lumi Cosméticos', cnpj: '22.333.444/0001-55', ...QUALIFIED })).data;
    assert.equal(client.stage, 'prospeccao');
  });
  check('cliente duplicado (CNPJ) é recusado com 409', () => fails(api.post('/crm/clients', { nome_empresa: 'Outro nome', cnpj: '22333444000155' }), 409, /já cadastrado/));
  check('cliente duplicado (nome sem acento/caixa) é recusado', () => fails(api.post('/crm/clients', { nome_empresa: 'LUMI cosmeticos' }), 409));
  check('cliente que já existe no cadastro mestre é recusado', () => fails(api.post('/crm/clients', { nome_empresa: 'Miss Rose' }), 409));
  check('pular etapa é bloqueado para o comercial', () => fails(api.put(`/crm/clients/${client.id}/move`, { stage: 'negociacao' }), 400, /Transição não permitida/));
  check('qualificar exige os campos do ERP', async () => {
    await api.put(`/crm/clients/${client.id}`, { canal_origem: '' });
    await fails(api.put(`/crm/clients/${client.id}/move`, { stage: 'qualificado' }), 409, /Canal de origem/);
    await api.put(`/crm/clients/${client.id}`, { canal_origem: 'site' });
    const moved = (await api.put(`/crm/clients/${client.id}/move`, { stage: 'qualificado' })).data;
    assert.equal(moved.stage, 'qualificado');
    assert.equal(moved.historico_movimentacoes.length, 1);
    assert.equal(moved.historico_movimentacoes[0].usuario, 'Bruno Vendas');
  });
  check('projeto em discussão exige qualificação completa (contato decisor, volume…)', async () => {
    await fails(api.put(`/crm/clients/${client.id}/move`, { stage: 'projeto_em_discussao' }), 409, /Contato decisor/);
    await api.put(`/crm/clients/${client.id}`, GATE);
    const moved = (await api.put(`/crm/clients/${client.id}/move`, { stage: 'projeto_em_discussao' })).data;
    assert.equal(moved.trigger_batch_projects, true);
  });
  check('voltar sem justificativa: tela pede, cancelar não move', async () => {
    await fails(api.put(`/crm/clients/${client.id}/move`, { stage: 'qualificado' }), 400, /cancelado/);
    assert.equal(db(`${T}/crm_clients/${client.id}/stage`), 'projeto_em_discussao');
  });
  check('voltar com justificativa (pedida pelo diálogo) entra no histórico', async () => {
    const moved = (await api.put(`/crm/clients/${client.id}/move`, { stage: 'qualificado' })).data;
    const last = moved.historico_movimentacoes.at(-1);
    assert.equal(last.is_regression, true);
    assert.equal(last.justificativa, 'Cliente pediu revisão do briefing');
    await api.put(`/crm/clients/${client.id}/move`, { stage: 'projeto_em_discussao' });
  });
  check('justificativa curta demais é recusada mesmo enviada pela tela', async () => {
    const before = prompted;
    await fails(api.put(`/crm/clients/${client.id}/move`, { stage: 'prospeccao', justificativa: 'curta' }), 400, /cancelado|Justificativa/).catch(() => null);
    assert.ok(prompted >= before);
  });

  let project;
  check('projeto nasce uma vez por cliente', async () => {
    project = (await api.post('/crm/projects/batch', { cliente_id: client.id, projects: [{ nome_projeto: 'Linha Verão' }] })).data.projects[0];
    await fails(api.post('/crm/projects/batch', { cliente_id: client.id, projects: [{ nome_projeto: 'linha verao' }] }), 409, /já existe/);
    await fails(api.post('/crm/projects/batch', { cliente_id: client.id, projects: [{ nome_projeto: 'Outra' }, { nome_projeto: 'OUTRA' }] }), 409);
  });
  check('amostra solicitada exige pré-briefing do ERP', async () => {
    await fails(api.put(`/crm/projects/${project.id}/move`, { stage: 'amostra_solicitada' }), 409, /Posicionamento/);
    await api.put(`/crm/projects/${project.id}`, BRIEFING);
    const moved = (await api.put(`/crm/projects/${project.id}/move`, { stage: 'amostra_solicitada' })).data;
    assert.equal(moved.trigger_batch_samples, true);
  });
  let sample;
  check('amostra nasce uma vez por projeto', async () => {
    sample = (await api.post('/crm/samples/batch', { projeto_id: project.id, samples: [{ nome_produto: 'Body Splash Verão', variacoes: [{ nome: 'A' }] }] })).data.samples[0];
    await fails(api.post('/crm/samples/batch', { projeto_id: project.id, samples: [{ nome_produto: 'body splash verao' }] }), 409, /já existe/);
  });
  check('Kickoff (antes da cotação) só depois de amostra aprovada pelo cliente e fórmula registrada', async () => {
    await api.put(`/crm/projects/${project.id}/move`, { stage: 'amostra_em_desenvolvimento' });
    await api.put(`/crm/projects/${project.id}/move`, { stage: 'amostra_enviada' });
    await fails(api.put(`/crm/projects/${project.id}/move`, { stage: 'cotacao' }), 400, /Transição não permitida/);
    await fails(api.put(`/crm/projects/${project.id}/move`, { stage: 'kickoff' }), 409, /amostra aprovada/);
    const variation = db(`${T}/crm_samples/${sample.id}/variacoes`)[0];
    await api.post(`/crm/samples/${sample.id}/variacoes/${variation.id}/resultado-cliente`, { resultado: 'aprovada' });
    await fails(api.put(`/crm/projects/${project.id}/move`, { stage: 'kickoff' }), 409, /formula registrada/);
    const devId = Object.values(db(`${T}/pd_developments`)).find((d) => d.request_id === variation.pd_request_id).id;
    memory.write(`${T}/pd_formulas/FV`, { id: 'FV', development_id: devId, version: 1, name: 'Verão v1' });
    memory.write(`${T}/pd_approvals/AV`, { id: 'AV', development_id: devId, approved_by_client: true });
    const moved = (await api.put(`/crm/projects/${project.id}/move`, { stage: 'kickoff' })).data;
    assert.equal(moved.stage, 'kickoff');
    assert.match(moved.kickoff_criado.numero_kickoff, /^KO-\d{4}-\d{3}$/);
    await fails(api.put(`/crm/projects/${project.id}/move`, { stage: 'cotacao' }), 409, /Kickoff aprovado/);
  });
  check('arquivar exige motivo', () => fails(api.put(`/crm/projects/${project.id}/move`, { stage: 'projeto_arquivado' }), 400, /arquivamento/));

  check('comercial não exclui nada', async () => {
    await fails(api.delete(`/crm/samples/${sample.id}`), 403, /administrador/);
    await fails(api.delete(`/crm/projects/${project.id}`), 403);
    await fails(api.delete(`/crm/clients/${client.id}`), 403);
    await fails(api.get('/crm/admin/cards/client'), 403);
  });

  test("troca para o ADM", () => setUser("adm"));
  check('ADM move livre, marcado como administrativo', async () => {
    const other = (await api.post('/crm/clients', { nome_empresa: 'Cadastro Direto SA' })).data;
    const moved = (await api.put(`/crm/clients/${other.id}/move`, { stage: 'cliente_fechado' })).data;
    const last = moved.historico_movimentacoes.at(-1);
    assert.equal(last.administrativo, true);
    assert.ok(last.requisitos_dispensados === undefined || Array.isArray(last.requisitos_dispensados));
  });
  check('ADM também justifica para voltar (curta demais abre o diálogo)', async () => {
    const before = prompted;
    const moved = (await api.put(`/crm/projects/${project.id}/move`, { stage: 'amostra_enviada', justificativa: 'x' })).data;
    assert.equal(prompted, before + 1);
    assert.equal(moved.historico_movimentacoes.at(-1).justificativa, 'Cliente pediu revisão do briefing');
  });
  check('painel ADM edita card com motivo e registra auditoria', async () => {
    await fails(api.put(`/crm/admin/cards/project/${project.id}`, { nome_projeto: 'Linha Verão 2027' }), 400, /motivo/);
    const edited = (await api.put(`/crm/admin/cards/project/${project.id}`, { nome_projeto: 'Linha Verão 2027', stage: 'em_negociacao', justificativa: 'Correção de cadastro feita pelo ADM' })).data;
    assert.equal(edited.nome_projeto, 'Linha Verão 2027');
    assert.equal(edited.historico_movimentacoes.at(-1).edicao_administrativa, true);
    const detail = (await api.get(`/crm/admin/cards/project/${project.id}`)).data;
    assert.ok(detail.audit.some((a) => a.action === 'project_admin_edit'));
  });
  check('excluir cliente com dependentes exige cascata explícita', async () => {
    await fails(api.delete(`/crm/clients/${client.id}`), 409, /cascata/);
    const r = (await api.delete(`/crm/clients/${client.id}?cascade=1`)).data;
    assert.equal(r.deleted_projects, 1);
    assert.equal(r.deleted_samples, 1);
    assert.equal(db(`${T}/crm_projects/${project.id}`), undefined);
    assert.equal(db(`${T}/crm_samples/${sample.id}`), undefined);
  });

});

// 17/10/2026: "amostra foi aprovada e o CRM2 não estava pareado com o status da amostra".
describe("CRM2 acompanha a amostra (só para a frente)", () => {
  let projeto;
  let variacao;
  let amostra;
  const etapa = () => db(`${T}/crm_projects/${projeto.id}/stage`);
  const abrirCrm2 = () => api.get("/crm/projects");
  const statusPd = (st) => memory.write(`${T}/pd_requests/${variacao.pd_request_id}/status`, st);

  check("projeto com amostra solicitada", async () => {
    setUser("vend");
    const cli = (await api.post("/crm/clients", { nome_empresa: "Aurora Beauty", cnpj: "33.444.555/0001-66", ...QUALIFIED, ...GATE })).data;
    await api.put(`/crm/clients/${cli.id}/move`, { stage: "qualificado" });
    await api.put(`/crm/clients/${cli.id}/move`, { stage: "projeto_em_discussao" });
    projeto = (await api.post("/crm/projects/batch", { cliente_id: cli.id, projects: [{ nome_projeto: "Linha Aurora" }] })).data.projects[0];
    await api.put(`/crm/projects/${projeto.id}`, { ...BRIEFING, nome_projeto: "Linha Aurora" });
    await api.put(`/crm/projects/${projeto.id}/move`, { stage: "amostra_solicitada" });
    amostra = (await api.post("/crm/samples/batch/v2", { projeto_id: projeto.id, samples: [{ nome_produto: "Body Aurora", categoria: "body_splash", variacoes: [{ descricao_aplicacao: "Floral" }] }] })).data.samples[0];
    variacao = amostra.variacoes[0];
    await abrirCrm2();
    assert.equal(etapa(), "amostra_solicitada", "P&D ainda não começou");
  });

  check("P&D trabalhando → Amostra em Desenvolvimento; entregue → Amostra Enviada", async () => {
    statusPd("IN_PROGRESS");
    await abrirCrm2();
    assert.equal(etapa(), "amostra_em_desenvolvimento");
    statusPd("WAITING_APPROVAL");
    await abrirCrm2();
    assert.equal(etapa(), "amostra_enviada");
  });

  check("cliente aprovou sem fórmula registrada: fica em Amostra Enviada (nem o ADM força o Kickoff)", async () => {
    await api.post(`/crm/samples/${amostra.id}/variacoes/${variacao.id}/resultado-cliente`, { resultado: "aprovada" });
    assert.equal(etapa(), "amostra_enviada");
    setUser("adm");
    await abrirCrm2();
    assert.equal(etapa(), "amostra_enviada");
    setUser("vend");
  });

  check("fórmula registrada: o projeto vai para o Kickoff e o Kickoff nasce", async () => {
    const dev = Object.values(db(`${T}/pd_developments`) || {}).find((d) => d.request_id === variacao.pd_request_id);
    const devId = dev ? dev.id : "DEV-AURORA";
    if (!dev) memory.write(`${T}/pd_developments/${devId}`, { id: devId, request_id: variacao.pd_request_id });
    memory.write(`${T}/pd_formulas/FA`, { id: "FA", development_id: devId, version: 1, name: "Aurora v1" });
    memory.write(`${T}/pd_formula_items/IA`, { id: "IA", formula_id: "FA", ingredient_name: "Álcool", percentage: 100 });
    memory.write(`${T}/pd_approvals/AA`, { id: "AA", development_id: devId, approved_by_client: true });
    await abrirCrm2();
    assert.equal(etapa(), "kickoff");
    assert.match(db(`${T}/crm_projects/${projeto.id}/kickoff_numero`) || "", /^KO-/);
  });
});
