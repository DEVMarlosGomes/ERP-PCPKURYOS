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

// Questionário inteiro respondido (o Bloco 0 já veio do CRM).
function questionarioCompleto(kickoff, extra = (q) => q) {
  const q = structuredClone(kickoff.questionario_composicao);
  Object.assign(q.bloco0, { forma_fisica: q.bloco0.forma_fisica || "liquido", volume_gramatura: q.bloco0.volume_gramatura || "200 ml", displays_ou_unidades_por_caixa_master: "24" });
  Object.assign(q.bloco1, { formula: "desenvolvida_kuryos", cliente_fornece: ["nada"], tem_cor: "nao", tem_brilho_mica_glitter: "nao", viscosidade: "fluida", densidade: "0,85", compra_fragrancia_por: "kuryos" });
  for (const section of ["bloco2", "bloco3", "bloco4"]) q[section].componentes = q[section].componentes.map((row) => ({ ...row, aplicavel: "nao", ...(row.id === "rotulo" ? { gravacao: "nao" } : {}) }));
  q.bloco2.componentes[0] = { ...q.bloco2.componentes[0], aplicavel: "sim", definido: "sim", fornecido_por: "kuryos", especificacao_fornecedor_codigo: "Frasco PET 200 mL" };
  Object.assign(q.bloco5, { especificacoes_cq_componentes: "Padrão", testes_aprovacoes_obrigatorios: "Estabilidade", amostra_referencia_fornecida_cliente: "sim", amostra_referencia_descricao: "Frasco de referência na Qualidade" });
  q.bloco6 = { equipamentos: ["Envasadora volumétrica 4 bicos"], pessoas: [{ funcao: "Operador de envase", quantidade: "2" }], producao_por_minuto: "25", unidades_por_hora: "1500" };
  Object.assign(q.fechamento, { data_prevista_inicio_producao: "2026-12-01", volume_primeiro_lote: "3000", responsavel_kuryos: "Carla", responsavel_cliente: "Lia" });
  for (const campo of Object.keys(q.origem?.bloco0 || {})) q.origem.bloco0[campo] = { ...q.origem.bloco0[campo], sobrescrito: false };
  return extra(q);
}

async function aprovarKickoff(kickoff) {
  for (const [uid, etapa] of [["pd", "lider_pd"], ["cq", "cq"], ["eng", "eng_produto"], ["com", "comercial"], ["adm", "direcao"]]) {
    as(uid);
    kickoff = (await api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa, decisao: "aprovado" })).data;
  }
  return kickoff;
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

  test("KO-12/KO-13: pendência trava a aprovação; aprovado, un/h vai para o prodHoraRef só do SKU vazio", async () => {
    const { kickoff, sample, variation } = await projetoNoKickoff("Brisa");
    // SKUs já existentes do projeto: um sem capacidade, outro com a do PCP.
    memory.write("produtos/PRF-BRIS-0001", { sku: "PRF-BRIS-0001", descricao: "Brisa A", ativo: true });
    memory.write("produtos/PRF-BRIS-0002", { sku: "PRF-BRIS-0002", descricao: "Brisa B", ativo: true, prodHoraRef: 1200 });
    memory.write(`${T}/crm_samples/${sample.id}/variacoes`, [{ ...variation, sku_id: "PRF-BRIS-0001" }, { id: "V2", codigo: "x", sku_id: "PRF-BRIS-0002" }]);
    as("com");
    // Aplicável e não definido: pendência, a aprovação trava.
    const pendente = (await api.put(`/kickoff/${kickoff.id}/questionario-composicao`, { questionario: questionarioCompleto(kickoff, (q) => {
      q.bloco3.componentes[1] = { ...q.bloco3.componentes[1], aplicavel: "sim", definido: "nao" };
      return q;
    }) })).data;
    assert.equal(pendente.status, "em_preenchimento");
    assert.ok(pendente.blocos_status.bloco3.campos_pendentes.some((c) => /definido_pendente/.test(c)));
    as("pd");
    await fails(api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "lider_pd", decisao: "aprovado" }), 400, /Questionario incompleto/);
    as("com");
    const pronto = (await api.put(`/kickoff/${kickoff.id}/questionario-composicao`, { questionario: questionarioCompleto(kickoff) })).data;
    assert.equal(pronto.status, "aguardando_aprovacao");
    assert.equal(pronto.blocos_estado.bloco6.dono, "eng_produto");
    const aprovado = await aprovarKickoff(pronto);
    assert.equal(aprovado.status, "aprovado");
    assert.equal(aprovado.blocos_estado.bloco6.estado, "congelado");
    assert.equal(db("produtos/PRF-BRIS-0001/prodHoraRef"), 1500, "SKU sem capacidade recebe o un/h do Kickoff");
    assert.equal(db("produtos/PRF-BRIS-0002/prodHoraRef"), 1200, "referência do PCP não é sobrescrita");
    assert.deepEqual(aprovado.prod_hora_ref_gravado, [{ sku: "PRF-BRIS-0001", prod_hora_ref: 1500 }]);
  });
});
