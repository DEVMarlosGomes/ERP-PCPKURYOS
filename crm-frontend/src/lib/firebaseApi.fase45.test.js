// Reunião 28/10/2026 — Fases 4 e 5 (Kickoff, BOM, cotação, orçamento, SKU) no adaptador Firebase.
import assert from "node:assert/strict";
import { memory, expectStatus as fails } from "@/test/memoryFirebase";
import { pendenciasQuestionario } from "@/lib/kickoffPendencias";

vi.mock("firebase/database", () => import("@/test/memoryFirebase").then((m) => m.databaseModule));
vi.mock("firebase/storage", () => import("@/test/memoryFirebase").then((m) => m.storageModule));
vi.mock("@/lib/firebase", () => import("@/test/memoryFirebase").then((m) => m.firebaseModule));
vi.mock("@/lib/justificationPrompt", async (orig) => ({ ...(await orig()), askJustification: async () => null }));

const T = "erp/kuryos";
const APROVACAO = { quem_nome: "Maria (cliente)", canal: "whatsapp", aprovado_em: "2024-01-10T15:00:00.000Z" };
const SEED = {
  usuarios: {
    adm: { role: "admin", name: "Ana ADM", tenant_id: "kuryos" },
    com: { role: "gestor", name: "Carla Comercial", tenant_id: "kuryos", modulos: { comercial: true } },
    pd: { role: "lider_pd", name: "Paulo P&D", tenant_id: "kuryos" },
    cq: { role: "qualidade", name: "Quésia CQ", tenant_id: "kuryos" },
    eng: { role: "engenharia_produto", name: "Edu Engenharia", tenant_id: "kuryos" },
  },
  config: { categoriasProduto: [{ codigo: "PRF", nome: "Perfumaria", ativo: true }, { codigo: "CAB", nome: "Cabelo", ativo: true }], contadores: { pedido_comercial: 41 } },
  materiais: { MP0001: { mpCodigo: "MP0001", mpNome: "Álcool Etílico", tipo: "MPGR", ativo: true } },
};

let api;
const db = (p) => memory.read(p);
const as = (uid) => memory.setUser(uid);

beforeAll(async () => {
  memory.reset(SEED);
  api = (await import("@/lib/firebaseApi")).default;
});
afterAll(() => memory.restore());

/* Projeto completo no CRM até o Kickoff (amostra aprovada + fórmula registrada). */
async function projetoNoKickoff(nome, { briefing = {}, amostra = {}, variacao = {} } = {}) {
  as("com");
  const client = (await api.post("/crm/clients", { nome_empresa: `${nome} Cosméticos`, tem_anvisa: "sim", contato_principal: { nome: "Lia", email: "lia@x.com" } })).data;
  const project = (await api.post("/crm/projects/batch", { cliente_id: client.id, projects: [{ nome_projeto: nome }] })).data.projects[0];
  await api.put(`/crm/projects/${project.id}`, { categoria: "perfumaria", responsavel_comercial: "Carla", volume_estimado_pedido: 3000, tipo_servico: "desenvolvimento_completo",
    ideia_conceito: "Splash", posicionamento: "premium", prazo_desejado_amostra: "2026-11-10", ...briefing });
  const sample = (await api.post("/crm/samples/batch/v2", { projeto_id: project.id, samples: [{ nome_produto: `${nome} Splash`, ...amostra,
    variacoes: [{ descricao_aplicacao: "Cítrico", ...variacao }] }] })).data.samples[0];
  const variation = sample.variacoes[0];
  for (const stage of ["amostra_solicitada", "amostra_em_desenvolvimento", "amostra_enviada"]) await api.put(`/crm/projects/${project.id}/move`, { stage });
  await api.post(`/crm/samples/${sample.id}/variacoes/${variation.id}/resultado-cliente`, { resultado: "aprovada", aprovacao_cliente: APROVACAO });
  const devId = Object.values(db(`${T}/pd_developments`)).find((d) => d.request_id === variation.pd_request_id).id;
  const F = `F_${project.id}`;
  memory.write(`${T}/pd_formulas/${F}`, { id: F, development_id: devId, version: 1, name: `${nome} v1`, created_by_name: "Paulo P&D" });
  memory.write(`${T}/pd_formula_items/I_${project.id}`, { id: `I_${project.id}`, formula_id: F, ingredient_name: "Álcool Etílico", percentage: 100 });
  memory.write(`${T}/pd_approvals/A_${project.id}`, { id: `A_${project.id}`, development_id: devId, approved_by_client: true });
  const moved = (await api.put(`/crm/projects/${project.id}/move`, { stage: "kickoff" })).data;
  const kickoff = (await api.get(`/kickoff/${moved.kickoff_criado.kickoff_id}`)).data;
  return { client, project, sample, variation, kickoff };
}

describe("Fase 4 — Kickoff e BOM", () => {
  test("KO-10: projeto completo no CRM abre o Kickoff com o Bloco 0 sem pendência, tudo com selo de origem", async () => {
    const { kickoff } = await projetoNoKickoff("Aurora", { amostra: { textura_esperada: "Creme leve", parametro_variacao: "volume" },
      variacao: { volume: "120", unidade_volume: "ml" } });
    const b0 = kickoff.questionario_composicao.bloco0;
    assert.deepEqual(pendenciasQuestionario(kickoff.questionario_composicao).status.bloco0.campos_pendentes, []);
    assert.deepEqual([b0.cliente, b0.nome_produto, b0.categoria, b0.forma_fisica, b0.volume_gramatura, b0.numero_skus_variacoes, b0.modelo_servico, b0.registro_notificacao_anvisa],
      ["Aurora Cosméticos", "Aurora", "PRF", "creme_gel", "120 ml", "1", "industrializacao_com_desenvolvimento", "existe"]);
    const origem = kickoff.questionario_composicao.origem.bloco0;
    assert.equal(origem.forma_fisica.fonte, "Amostra");
    assert.equal(origem.volume_gramatura.fonte, "Amostra");
    assert.equal(origem.modelo_servico.fonte, "Projeto (CRM)");
  });
});
