// Fluxo comercial ponta a ponta no adaptador Firebase (ordem de 15/10/2026,
// PLANO_PD_CRM_AJUSTES.md Fase 2): cliente → projeto numerado → amostra aprovada →
// Kickoff (questionário + P&D → CQ → Engenharia → Direção) → cotação → orçamento
// (CRM2) → decisão → CGI → assinatura → SKU em produtos/ → pedido liberado no PCP
// (pedidos_comerciais/ + pedidos/).
import assert from "node:assert/strict";
import { memory, expectStatus as fails } from "@/test/memoryFirebase";

vi.mock("firebase/database", () => import("@/test/memoryFirebase").then((m) => m.databaseModule));
vi.mock("firebase/storage", () => import("@/test/memoryFirebase").then((m) => m.storageModule));
vi.mock("@/lib/firebase", () => import("@/test/memoryFirebase").then((m) => m.firebaseModule));
vi.mock("@/lib/justificationPrompt", async (orig) => ({ ...(await orig()), askJustification: async () => null }));

const T = "erp/kuryos";
// COM-02: retorno do cliente e decisão do orçamento exigem quem, canal e data/hora.
const APROVACAO = { quem_nome: "Maria (cliente)", canal: "whatsapp", aprovado_em: "2024-01-10T15:00:00.000Z" };
const SEED = {
  usuarios: {
    adm: { role: "admin", name: "Ana ADM", tenant_id: "kuryos" },
    com: { role: "gestor", name: "Carla Comercial", tenant_id: "kuryos", modulos: { comercial: true } },
    com2: { role: "vendedor", name: "Vera Vendas", tenant_id: "kuryos" },
    pd: { role: "lider_pd", name: "Paulo P&D", tenant_id: "kuryos" },
    cq: { role: "qualidade", name: "Quésia CQ", tenant_id: "kuryos" },
    eng: { role: "engenharia_produto", name: "Edu Engenharia", tenant_id: "kuryos" },
    prod: { role: "production", name: "Pedro Produção", tenant_id: "kuryos" },
  },
  config: {
    categoriasProduto: [
      { codigo: "PRF", nome: "Perfumaria", ativo: true },
      { codigo: "CAB", nome: "Cabelo", ativo: true },
    ],
    contadores: { pedido_comercial: 41 },
  },
  clientes: { MISS: { nome: "MISS ROSE", codigo: "MISS", cnpj: "12.345.678/0001-90", ativo: true } },
  // Formato real do cadastro mestre (materiais/{key}: mpCodigo, mpNome).
  materiais: {
    MP0001: { mpCodigo: "MP0001", mpNome: "Álcool Etílico", tipo: "MP", ativo: true },
    EP0001: { mpCodigo: "EP0001", mpNome: "Frasco PET 200 mL", tipo: "EP", ativo: true },
  },
};
const QUALIFIED = {
  canal_origem: "site", categoria_interesse: ["perfumaria"], temperatura_lead: "quente", responsavel_comercial: "Carla",
  segmento: "marca_propria", contato_principal: { nome: "Lia", whatsapp: "11999990000", email: "lia@lumi.com" },
  decisores: [{ nome: "Lia", cargo: "socio" }], tem_anvisa: "sim", volume_estimado_mensal: "5000", fornecedor_atual: "Nenhum",
};
const BRIEFING = {
  categoria: "perfumaria", responsavel_comercial: "Carla", ideia_conceito: "Splash cítrico", posicionamento: "premium",
  volume_estimado_pedido: 3000, tipo_servico: "desenvolvimento_completo", prazo_desejado_amostra: "2026-11-10",
};

let api;
const db = (p) => memory.read(p);
const as = (uid) => memory.setUser(uid);

beforeAll(async () => {
  memory.reset(SEED);
  api = (await import("@/lib/firebaseApi")).default;
});
afterAll(async () => {
  // DUMP_SEED=arquivo.json grava o banco final (base para demonstração visual das telas).
  if (process.env.DUMP_SEED) (await import("node:fs")).writeFileSync(process.env.DUMP_SEED, JSON.stringify(memory.root));
  memory.restore();
});

// Preenche o questionário de composição inteiro (todos os blocos obrigatórios).
function questionarioCompleto(kickoff) {
  const q = structuredClone(kickoff.questionario_composicao);
  Object.assign(q.bloco0, { forma_fisica: "liquido", volume_gramatura: "200", numero_skus_variacoes: "1", modelo_servico: "full_service_marca_propria", displays_ou_unidades_por_caixa_master: "24" });
  Object.assign(q.bloco1, { formula: "desenvolvida_kuryos", cliente_fornece: ["nada"], tem_cor: "nao", tem_brilho_mica_glitter: "nao", viscosidade: "fluida", densidade: "0,85", compra_fragrancia_por: "kuryos" });
  for (const section of ["bloco2", "bloco3", "bloco4"]) {
    q[section].componentes = q[section].componentes.map((row) => ({ ...row, aplicavel: "nao" }));
  }
  q.bloco2.componentes[0] = { ...q.bloco2.componentes[0], aplicavel: "sim", definido: "sim", fornecido_por: "kuryos", especificacao_fornecedor_codigo: "Frasco PET 200 mL" };
  // KO-03: "Sim" exige o complemento (sem ele o Kickoff fica pendente).
  Object.assign(q.bloco5, { especificacoes_cq_componentes: "Padrão Kuryos", testes_aprovacoes_obrigatorios: "Estabilidade 90 dias", amostra_referencia_fornecida_cliente: "sim",
    amostra_referencia_descricao: "Frasco de referência entregue pela Lumi, guardado na Qualidade" });
  Object.assign(q.fechamento, { data_prevista_inicio_producao: "2026-12-01", volume_primeiro_lote: "3000", responsavel_kuryos: "Carla", responsavel_cliente: "Lia" });
  return q;
}

describe("fluxo comercial completo até a emissão de OP", () => {
  let client;
  let project;
  let sample;
  let variation;
  let kickoff;
  let contrato;

  test("CRM1: cliente prospectado e qualificado", async () => {
    as("com");
    client = (await api.post("/crm/clients", { nome_empresa: "Lumi Cosméticos", cnpj: "22.333.444/0001-55", ...QUALIFIED })).data;
    await api.put(`/crm/clients/${client.id}/move`, { stage: "qualificado" });
    const moved = (await api.put(`/crm/clients/${client.id}/move`, { stage: "projeto_em_discussao" })).data;
    assert.equal(moved.stage, "projeto_em_discussao");
  });

  test("CRM2: projeto numerado → amostra solicitada → amostra numerada dentro do projeto e gerada no P&D", async () => {
    project = (await api.post("/crm/projects/batch", { cliente_id: client.id, projects: [{ nome_projeto: "Linha Verão" }] })).data.projects[0];
    assert.equal(project.numero_projeto, "2026-001");
    // D-2 (RFC-001): o Kickoff já nasce em rascunho com o projeto, esperando o P&D; KO-01: título com o nome.
    const rascunho = Object.values(db(`${T}/kickoffs`) || {}).find((k) => k.projeto_id === project.id);
    assert.equal(rascunho.status, "em_preenchimento");
    assert.equal(rascunho.formula_id, null);
    const aberto = (await api.get(`/kickoff/${rascunho.id}`)).data;
    assert.equal(aberto.titulo, "KO-2026-001 — Linha Verão");
    assert.equal(aberto.blocos_estado.bloco1.aguardando, "pd");
    await api.put(`/crm/projects/${project.id}`, BRIEFING);
    await api.put(`/crm/projects/${project.id}/move`, { stage: "amostra_solicitada" });
    sample = (await api.post("/crm/samples/batch/v2", { projeto_id: project.id, samples: [{ nome_produto: "Body Splash Verão", categoria: "body_splash", variacoes: [{ descricao_aplicacao: "Cítrico" }] }] })).data.samples[0];
    variation = sample.variacoes[0];
    assert.equal(sample.numero_amostra, "2026-001-A1");
    assert.equal(variation.codigo, "2026-001-A1-a");
    assert.ok(variation.pd_request_id, "a variação deve abrir solicitação no P&D");
    await api.put(`/crm/projects/${project.id}/move`, { stage: "amostra_em_desenvolvimento" });
    await api.put(`/crm/projects/${project.id}/move`, { stage: "amostra_enviada" });
  });

  test("amostra enviada não pula para a cotação: passa pelo Kickoff", async () => {
    await fails(api.put(`/crm/projects/${project.id}/move`, { stage: "cotacao" }), 400, /Transição não permitida/);
  });

  test("Kickoff exige amostra aprovada pelo cliente e fórmula registrada; nasce com o número do projeto", async () => {
    await fails(api.put(`/crm/projects/${project.id}/move`, { stage: "kickoff" }), 409, /amostra aprovada/);
    await api.post(`/crm/samples/${sample.id}/variacoes/${variation.id}/resultado-cliente`, { resultado: "aprovada", aprovacao_cliente: APROVACAO });
    await fails(api.put(`/crm/projects/${project.id}/move`, { stage: "kickoff" }), 409, /formula registrada/);
    assert.equal(db(`${T}/crm_projects/${project.id}/stage`), "amostra_enviada");
    const devId = Object.values(db(`${T}/pd_developments`)).find((d) => d.request_id === variation.pd_request_id).id;
    memory.write(`${T}/pd_formulas/F1`, { id: "F1", development_id: devId, version: 1, name: "BS Verão v1", created_by_name: "Paulo P&D" });
    memory.write(`${T}/pd_formula_items/I1`, { id: "I1", formula_id: "F1", ingredient_name: "Álcool Etílico", percentage: 80 });
    memory.write(`${T}/pd_formula_items/I2`, { id: "I2", formula_id: "F1", ingredient_name: "Fragrância Cítrica", percentage: 20 });
    // Fórmula registrada = aprovada pelo cliente (aprovação do químico saiu na Fase 1).
    memory.write(`${T}/pd_approvals/A1`, { id: "A1", development_id: devId, approved_by_client: true });
    const moved = (await api.put(`/crm/projects/${project.id}/move`, { stage: "kickoff" })).data;
    assert.equal(moved.stage, "kickoff");
    assert.equal(moved.kickoff_criado.numero_kickoff, "KO-2026-001");
    kickoff = (await api.get(`/kickoff/${moved.kickoff_criado.kickoff_id}`)).data;
    assert.equal(kickoff.formula_id, "F1");
    assert.equal(kickoff.questionario_composicao.bloco0.cliente, "Lumi Cosméticos");
    assert.equal(kickoff.questionario_composicao.fechamento.volume_primeiro_lote, "3000", "volume vem do briefing do projeto");
    assert.equal(db(`${T}/crm_projects/${project.id}/kickoff_numero`), "KO-2026-001");
  });

  test("necessidade de material sai do BOM do Kickoff (questionário vazio, BOM vazio)", async () => {
    const before = (await api.get(`/crm/projects/${project.id}/material-requirements`)).data;
    assert.deepEqual(before, {}, "questionário ainda sem embalagens: BOM vazio");
  });

  test("CGI só nasce de Kickoff aprovado", async () => {
    await fails(api.post("/contratos/gerar", { kickoff_id: kickoff.id }), 400, /Kickoff aprovado/);
  });

  test("cotação exige Kickoff aprovado", async () => {
    await fails(api.put(`/crm/projects/${project.id}/move`, { stage: "cotacao" }), 409, /Kickoff aprovado/);
  });

  test("Kickoff: aprovação só com questionário completo e na ordem P&D → CQ → Engenharia → Comercial → Direção", async () => {
    await fails(api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "lider_pd", decisao: "aprovado" }), 403);
    as("pd");
    await fails(api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "lider_pd", decisao: "aprovado" }), 400, /Questionario incompleto/);
    as("com");
    // KO-03: "Sim" sem o complemento deixa pendente; "Não" não pende.
    const semDescricao = questionarioCompleto(kickoff);
    semDescricao.bloco5.amostra_referencia_descricao = "";
    const pendente = (await api.put(`/kickoff/${kickoff.id}/questionario-composicao`, { questionario: semDescricao })).data;
    assert.equal(pendente.status, "em_preenchimento");
    assert.deepEqual(pendente.blocos_status.bloco5.campos_pendentes, ["amostra_referencia_descricao"]);
    const filled = (await api.put(`/kickoff/${kickoff.id}/questionario-composicao`, { questionario: questionarioCompleto(kickoff) })).data;
    assert.equal(filled.status, "aguardando_aprovacao");
    assert.equal(filled.progress.percentual, 100);
    assert.ok(filled.bom.some((line) => line.tipo === "mp_formula" && line.descricao === "Álcool Etílico"));
    assert.ok(filled.bom.some((line) => line.tipo === "embalagem_primaria" && /Frasco PET 200 mL/.test(line.descricao)));
    assert.deepEqual(filled.bom.filter((line) => ["tampa", "rotulo", "emb_secundaria", "emb_terciaria"].includes(line.tipo)), [],
      "componente marcado como não aplicável não vira linha de BOM");
    // RFC-001: o dono valida o bloco pronto antes da etapa dele; alterar depois invalida (com registro).
    as("eng");
    await fails(api.post(`/kickoff/${kickoff.id}/blocos/bloco1/validar`), 403, /Lider P&D/);
    as("pd");
    const validado = (await api.post(`/kickoff/${kickoff.id}/blocos/bloco1/validar`)).data;
    assert.equal(validado.blocos_estado.bloco1.estado, "validado");
    assert.equal(validado.blocos_estado.bloco2.estado, "pronto");
    as("com");
    const q2 = questionarioCompleto(kickoff);
    q2.bloco1.viscosidade = "média";
    const alterado = (await api.put(`/kickoff/${kickoff.id}/questionario-composicao`, { questionario: q2 })).data;
    assert.equal(alterado.blocos_estado.bloco1.estado, "pronto", "bloco validado que muda perde a validação");
    assert.ok(alterado.log_auditoria.some((l) => l.campo === "bloco.bloco1" && /validar de novo/.test(l.valor_novo)));
    await api.put(`/kickoff/${kickoff.id}/questionario-composicao`, { questionario: questionarioCompleto(kickoff) });
    as("cq");
    await fails(api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "cq", decisao: "aprovado" }), 409, /Nao e permitido pular etapas/);
    as("pd");
    await fails(api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "lider_pd", decisao: "reprovado" }), 400, /Justificativa/);
    await api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "lider_pd", decisao: "aprovado" });
    as("cq");
    await api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "cq", decisao: "aprovado" });
    as("eng");
    await api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "eng_produto", decisao: "aprovado" });
    // KO-07: etapa Comercial, só pelo responsável comercial do cliente (outro comercial: 403).
    await fails(api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "direcao", decisao: "aprovado" }), 403, /administrador/);
    as("adm");
    await fails(api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "direcao", decisao: "aprovado" }), 409, /Etapa atual de aprovacao: Comercial/);
    memory.write(`${T}/crm_clients/${kickoff.cliente_id}/responsavel_comercial`, "com");
    as("com2");
    await fails(api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "comercial", decisao: "aprovado" }), 403, /responsável comercial do cliente/);
    as("com");
    await api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "comercial", decisao: "aprovado" });
    as("eng");
    await fails(api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "direcao", decisao: "aprovado" }), 403, /administrador/);
    as("adm");
    const approved = (await api.post(`/kickoff/${kickoff.id}/aprovacao`, { etapa: "direcao", decisao: "aprovado" })).data;
    assert.equal(approved.status, "aprovado");
    // RFC-001: Kickoff aprovado congela os blocos; cada etapa validou os seus.
    assert.ok(Object.values(approved.blocos_estado).every((b) => b.estado === "congelado"));
    assert.equal(approved.blocos_estado.bloco1.validado_por_nome, "Paulo P&D");
    assert.equal(approved.blocos_estado.bloco0.validado_por_nome, "Carla Comercial");
    const reqs = (await api.get(`/crm/projects/${project.id}/material-requirements`)).data;
    const alcool = reqs.materiais.find((m) => m.descricao === "Álcool Etílico");
    assert.equal(alcool.qtd_necessaria, 480, "80% × 200 mL × 3.000 un = 480 L");
    assert.equal(alcool.codigo_material, "MP0001");
    assert.equal(reqs.materiais.find((m) => m.descricao === "Fragrância Cítrica").pendente_info, true);
    assert.equal(approved.documentos_gerados[0]?.tipo, "epa", "aprovação final gera o EPA do P&D");
    const epa = Object.values(db(`${T}/pd_document_versions`)).find((d) => d.doc_type === "epa");
    assert.equal(epa.version_code, "EPA-001");
    assert.equal(epa.status, "em_revisao");
    assert.ok(approved.cadastro_bom.pendentes > 0, "itens do BOM sem cadastro ficam na fila");
    assert.ok(approved.aprovacoes.at(-1).requisitos_dispensados?.[0].includes("BOM"), "dispensa da Direção fica registrada");
    assert.equal(approved.bom.find((l) => l.descricao === "Álcool Etílico").cadastro_status, "cadastrado");
    kickoff = approved;
  });

  test("Kickoff aprovado libera a cotação", async () => {
    as("com");
    const moved = (await api.put(`/crm/projects/${project.id}/move`, { stage: "cotacao" })).data;
    assert.equal(moved.stage, "cotacao");
    assert.equal(db(`${T}/crm_clients/${client.id}/stage`), "negociacao", "cotação espelha o cliente em negociação");
    // Caso JOHN (17/10/2026): CGI antes do orçamento gerava pedido sem quantidade nem preço.
    await fails(api.post("/contratos/gerar", { kickoff_id: kickoff.id }), 409, /orçamento aprovado/);
  });

  test("cotação nasce do BOM do Kickoff e da tabela de serviços; SEM PREÇO bloqueia o envio", async () => {
    // Tabela de serviços do Cadastros (PCP) e preço das MPs na fórmula do P&D.
    memory.write("servicos/s1", { codigo: "SRV-002", nome: "Envase líquido", unidade: "un", preco: 0.3, descontoPct: 10, setupLote: 150, minimoPedido: 0, ativo: true });
    memory.write("servicos/s2", { codigo: "SRV-005", nome: "Rotulagem", unidade: "un", preco: null, ativo: true });
    memory.write("servicos/s3", { codigo: "SRV-009", nome: "Inativo", unidade: "un", preco: 1, ativo: false });
    memory.write(`${T}/pd_formula_items/I1/price_per_kg`, 9.5);
    memory.write(`${T}/pd_formula_items/I2/price_usd`, 40);
    // Sem dólar real a cotação não converte US$ (SEM CÂMBIO; o R$ 6,00 padrão das fórmulas não vale aqui).
    const semDolar = (await api.get(`/crm/projects/${project.id}/cotacao-base`)).data;
    await fails(api.post(`/crm/projects/${project.id}/proposta`, { status: "enviado", composicao: { qtd_pedido: 3000, kg_por_unidade: 0.2, lotes: 1,
      insumos: semDolar.insumos.filter((l) => l.moeda === "USD"), servicos: [] } }), 422, /Fragrância Cítrica \(SEM CÂMBIO\)/);
    memory.write("config/cambio", { usd_brl: { venda: 6, compra: 6, fonte: "teste", atualizadoEm: new Date().toISOString() }, spread_pct: 0 });
    const base =(await api.get(`/crm/projects/${project.id}/cotacao-base`)).data;
    assert.equal(base.numero_kickoff, "KO-2026-001");
    assert.equal(base.qtd_pedido, 3000);
    assert.equal(base.kg_por_unidade, 0.2);
    assert.deepEqual(base.servicos.map((sv) => sv.nome), ["Envase líquido", "Rotulagem"], "serviço inativo não aparece");
    const preco = Object.fromEntries(base.insumos.map((l) => [l.descricao, [l.preco, l.moeda]]));
    assert.deepEqual(preco["Álcool Etílico"], [9.5, "BRL"]);
    assert.deepEqual(preco["Fragrância Cítrica"], [40, "USD"]);
    const frasco = base.insumos.find((l) => l.tipo === "embalagem_primaria");
    assert.equal(frasco.preco, null, "embalagem sem preço no cadastro nasce SEM PREÇO");

    const { linhaDeServico } = await import("@/lib/cotacao");
    const composicao = { kickoff_id: base.kickoff_id, numero_kickoff: base.numero_kickoff, qtd_pedido: 3000, kg_por_unidade: 0.2, lotes: 1,
      insumos: base.insumos, servicos: base.servicos.map(linhaDeServico) };
    await fails(api.post(`/crm/projects/${project.id}/proposta`, { composicao, status: "enviado" }), 422, /Frasco PET 200 mL.*\(SEM PREÇO\); Rotulagem \(SEM PREÇO\)/);
    assert.equal(Object.values(db(`${T}/crm_propostas`) || {}).length, 0, "envio recusado não grava nada");

    // Rascunho salva com pendência; o comercial completa o frasco e tira a rotulagem.
    await api.post(`/crm/projects/${project.id}/proposta`, { composicao, status: "rascunho" });
    composicao.insumos = composicao.insumos.map((l) => (l.bom_id === frasco.bom_id ? { ...l, preco: 1.2 } : l));
    composicao.servicos = composicao.servicos.filter((l) => l.nome !== "Rotulagem");
    await api.post(`/crm/projects/${project.id}/proposta`, { composicao, status: "rascunho" });
    const salvo = Object.values(db(`${T}/crm_propostas`))[0].composicao.resumo;
    // MPs: 0,16 × 9,50 + 0,04 × 40 × 6,00 (dólar do dia no teste) + frasco 1,20 = 12,32
    // Envase: 3.000 × 0,27 (10% de desconto) + 150 de setup = 960 → 0,32/un
    assert.equal(salvo.insumos_por_un, 12.32);
    assert.equal(salvo.servicos_por_un, 0.32);
    assert.equal(salvo.preco_un, 12.64);
    assert.equal(salvo.pendencias, 0);
  });

  test("orçamento: aprovação exige amostra aprovada também pelo P&D", async () => {
    const status = (await api.get(`/crm/projects/${project.id}/amostras-status`)).data;
    assert.equal(status.total, 1);
    assert.equal(status.pode_confirmar, false, "sem aprovação do P&D não confirma");
    await api.post(`/crm/projects/${project.id}/proposta`, {
      tipo_produto: "Body Splash Verão", items_pedido: [{ item: "Body Splash Verão — Cítrico", qtd: 3000, valor_unitario: 12.5, valor_total: 37500 }],
      condicoes_pagamento: "28 dias", status: "enviado",
    });
    await api.put(`/crm/projects/${project.id}/move`, { stage: "orcamento_completo" });
    // COM-02: sem quem aprovou, canal e data/hora a decisão não é registrada.
    await fails(api.post(`/crm/projects/${project.id}/proposta/decisao`, { decisao: "aprovado" }), 422, /quem aprovou/);
    await fails(api.post(`/crm/projects/${project.id}/proposta/decisao`, { decisao: "aprovado", aprovacao_cliente: APROVACAO }), 409, /aprovada pelo P&D e pelo Comercial/);
  });

  test("decisão aprovada: pedido fechado com o Kickoff já aprovado e pedido AGUARDANDO_CGI no Comercial do PCP", async () => {
    const samples = db(`${T}/crm_samples`);
    samples[sample.id].variacoes[0].status_pd_raw = "APPROVED";
    memory.write(`${T}/crm_samples/${sample.id}`, samples[sample.id]);
    assert.equal((await api.get(`/crm/projects/${project.id}/amostras-status`)).data.pode_confirmar, true);
    // Rascunho de pedido que já existia vazio (caso JOHN) é preenchido pelo orçamento aprovado.
    memory.write("config/contadores/pedido_comercial", 42);
    memory.write("pedidos_comerciais/PED-0042", { numeroFormatado: "PED-0042", status: "AGUARDANDO_CGI", origem: "orcamento_aprovado",
      origemCrm: { projetoId: project.id }, itens: [{ descricao: "Body Splash Verão", qtd: 0, valorUnitario: 0, sku: "", produtoKey: "" }], historico: [] });
    const result = (await api.post(`/crm/projects/${project.id}/proposta/decisao`, { decisao: "aprovado", aprovacao_cliente: APROVACAO })).data;
    assert.equal(result.project.stage, "pedido_aprovado");
    assert.equal(result.kickoff.id, kickoff.id, "o pedido usa o Kickoff aprovado antes da cotação, não abre outro");
    assert.equal(result.kickoff.numero_kickoff, "KO-2026-001");
    assert.equal(result.order.id, "PED-0042", "usa o mesmo contador do Comercial do PCP");
    const pedido = db("pedidos_comerciais/PED-0042");
    assert.equal(pedido.status, "AGUARDANDO_CGI");
    assert.equal(pedido.itens[0].qtd, 3000);
    assert.equal(db("pedidos"), undefined, "nada vai para a emissão de OP antes do CGI");
    assert.equal(db(`${T}/crm_clients/${client.id}/stage`), "cliente_fechado");
  });

  test("CGI gerado com as 29 cláusulas e reaproveitado na segunda chamada", async () => {
    as("com");
    contrato = (await api.post("/contratos/gerar", { kickoff_id: kickoff.id, contratante: { representante_nome: "Lia Souza" } })).data;
    assert.equal(contrato.numero_contrato, "CGI-2026-0001");
    assert.equal(contrato.documento.clausulas.length, 29);
    assert.match(contrato.documento.clausulas[2].texto, /3\.000 unidades, com volume mensal estimado de 5\.000/);
    // Preço e pagamento do orçamento aprovado (no master saíam R$ 0,00 / a_definir).
    assert.match(contrato.documento.clausulas[3].texto, /R\$\s12,50 por unidade, totalizando R\$\s37\.500,00/);
    assert.match(contrato.documento.clausulas[3].texto, /<b>28 dias<\/b>/);
    assert.equal(contrato.status, "gerado");
    const again = (await api.post("/contratos/gerar", { kickoff_id: kickoff.id })).data;
    assert.equal(again.id, contrato.id);
    assert.equal(again.reutilizado, true);
    const html = await (await api.get(`/contratos/${contrato.id}/pdf`)).data.text();
    assert.match(html, /CONTRATO GERAL DE INDUSTRIALIZACAO/);
    assert.match(html, /Lia Souza/);
    assert.equal((await api.get("/contratos")).data.count, 1);
  });

  test("assinatura do CGI: SKU no cadastro mestre, cliente mestre criado e pedido liberado ao PCP", async () => {
    const signed = (await api.post(`/contratos/${contrato.id}/assinar`, { observacoes: "Assinado" })).data;
    assert.deepEqual(signed.sku_bloqueios, []);
    assert.equal(signed.pedido_liberado_para_emissao, true);
    assert.equal(signed.numero_pedido, "PED-0042");
    const code = signed.skus_gerados[0].sku.codigo_interno;
    assert.equal(code, "PRF-LUMI-0001", "categoria do PCP + código do cliente + sequência");
    const produto = db(`produtos/${code}`);
    assert.equal(produto.sku, code);
    assert.equal(produto.cliente, "Lumi Cosméticos");
    assert.equal(produto.clienteKey, "LUMI");
    assert.equal(produto.categoria, "Perfumaria");
    assert.equal(produto.unCx, 24);
    // 17/10/2026: o que a Emissão de OP precisa e o Kickoff já sabe (volume 200 mL, densidade 0,85).
    assert.equal(produto.volume, 200);
    assert.equal(produto.unidadeVolume, "ml");
    assert.equal(produto.densidadeGranel, 0.85);
    assert.equal(produto.prazoValidadeMeses, undefined, "validade não preenchida no Kickoff não é inventada");
    assert.equal(produto.origemCrm.cgiNumero, "CGI-2026-0001");
    const master = db("clientes/LUMI");
    assert.equal(master.origemCrmClienteId, client.id, "cliente novo nasce com a origem do CRM (regra do banco)");
    // 17/10/2026: contato do CRM vai junto (o pedido do PCP oferece esse contato).
    assert.deepEqual(master.contatos.crm_principal, { nome: "Lia", email: "lia@lumi.com", telefone: "11999990000", areas: ["COMERCIAL"], principais: ["COMERCIAL"], outraArea: "", observacoes: "Do CRM" });
    assert.equal(master.contatoComNome, "Lia");
    assert.equal(db(`${T}/crm_clients/${client.id}/cadastro_cliente_id`), "LUMI");
    assert.equal(db(`${T}/crm_samples/${sample.id}/variacoes`)[0].sku_id, code);

    const pedido = db("pedidos_comerciais/PED-0042");
    assert.equal(pedido.status, "LIBERADO_PCP");
    assert.equal(pedido.clienteKey, "LUMI");
    assert.equal(pedido.itens[0].sku, code);
    assert.equal(pedido.cgi.numero, "CGI-2026-0001");
    // Mesmo formato que comercial.html → salvarPedido grava e a emissão de OP lê.
    const linha = db(`pedidos/PED-0042__${code}`);
    assert.deepEqual(Object.keys(linha).sort(), ["cliente", "dataEntrega", "dataPedido", "frete", "id", "parentPedidoId", "pedidoComercialStatus",
      "priority", "produto", "produzido", "qtdTotal", "sku", "valorUnitario"].filter((k) => linha[k] !== undefined).sort());
    assert.equal(linha.qtdTotal, 3000);
    assert.equal(linha.produzido, 0);
    assert.equal(linha.pedidoComercialStatus, "LIBERADO_PCP");
    assert.equal(db("notificacoes_comercial/PED-0042").tipo, "PEDIDO_LIBERADO_PCP");
  });

  test("assinatura cria no PCP a v1 em rascunho de Fórmula, BOM e Especificação da SKU", async () => {
    const formula = db("formulas/PRF-LUMI-0001__v1");
    assert.equal(formula.codProduto, "PRF-LUMI-0001");
    assert.equal(formula.status, "RASCUNHO");
    assert.equal(formula.somaPercentual, 100);
    const itens = Object.values(formula.itens);
    assert.deepEqual(itens.map((i) => [i.mpCodigo, i.percentualMM, Boolean(i.pendente)]), [["MP0001", 80, false], ["", 20, true]]);
    assert.equal(itens[1].textoOriginalGeradorOPs, "Fragrância Cítrica", "material fora do cadastro vira pendência de revisão no Cadastros");
    const bom = Object.values(db("bom/PRF-LUMI-0001__v1").itens);
    assert.deepEqual(bom.map((i) => [i.materialCodigo, i.qtdPorPeca, Boolean(i.pendente)]), [["EP0001", 1, false]]);
    assert.equal(db("especificacoes/PRF-LUMI-0001__v1").status, "RASCUNHO");
    assert.equal(db("formulas/PRF-LUMI-0001__v1").origemCrm.cgiNumero, "CGI-2026-0001");
  });

  test("reprocessar a assinatura é idempotente (não duplica SKU nem pedido)", async () => {
    const again = (await api.post(`/contratos/${contrato.id}/assinar`, {})).data;
    assert.equal(again.skus_gerados[0].sku.codigo_interno, "PRF-LUMI-0001");
    assert.equal(Object.keys(db("produtos")).length, 1);
    assert.equal(db("config/contadores/sku/PRF_LUMI"), 1);
    assert.equal(Object.keys(db("pedidos")).length, 1);
    assert.equal(again.skus_gerados[0].sku.estrutura_pcp.criada, false, "não recria a v1");
    assert.equal(Object.keys(db("formulas")).length, 1);
    assert.equal((await api.get("/orders")).data.find((o) => o.id === "PED-0042").status, "confirmado");
  });

  test("Kickoff aprovado: editar exige justificativa e gera nova versão, a anterior fica no histórico", async () => {
    await fails(api.put(`/kickoff/${kickoff.id}/questionario-composicao`, { questionario: { bloco1: { viscosidade: "gel" } } }), 400, /justificativa é obrigatória/);
    assert.equal(db(`${T}/kickoffs/${kickoff.id}/status`), "aprovado", "sem justificativa nada muda");
    const motivo = "Cliente pediu viscosidade de gel após o teste de mercado";
    const edited = (await api.put(`/kickoff/${kickoff.id}/questionario-composicao`, { questionario: { bloco1: { viscosidade: "gel" } }, justificativa: motivo })).data;
    assert.equal(edited.versao, "v2");
    assert.notEqual(edited.id, kickoff.id);
    assert.equal(db(`${T}/kickoffs/${kickoff.id}/status`), "substituida");
    assert.equal(edited.log_auditoria.find((l) => l.campo === "versao").motivo, motivo);
    assert.equal((await api.get(`/kickoff/${kickoff.id}/historico`)).data.length, 2);
  });

  test("produção não opera o comercial", async () => {
    as("prod");
    await fails(api.post(`/crm/projects/${project.id}/proposta`, {}), 403);
    await fails(api.post(`/contratos/${contrato.id}/assinar`, {}), 403);
  });
});

describe("numeração por projeto", () => {
  test("cada projeto tem seu número; amostras e variações continuam dentro dele", async () => {
    as("adm");
    const c = (await api.post("/crm/clients", { nome_empresa: "Numera Cosméticos" })).data;
    const [p1, p2] = (await api.post("/crm/projects/batch", { cliente_id: c.id, projects: [{ nome_projeto: "Linha A" }, { nome_projeto: "Linha B" }] })).data.projects;
    assert.notEqual(p1.numero_projeto, p2.numero_projeto);
    const seq = (n) => Number(n.split("-")[1]);
    assert.equal(seq(p2.numero_projeto), seq(p1.numero_projeto) + 1);
    const [a1, a2] = (await api.post("/crm/samples/batch/v2", { projeto_id: p2.id, samples: [{ nome_produto: "Sérum", variacoes: [{}, {}] }, { nome_produto: "Tônico" }] })).data.samples;
    assert.equal(a1.numero_amostra, `${p2.numero_projeto}-A1`);
    assert.deepEqual(a1.variacoes.map((v) => v.codigo), [`${p2.numero_projeto}-A1-a`, `${p2.numero_projeto}-A1-b`]);
    assert.equal(a2.numero_amostra, `${p2.numero_projeto}-A2`);
    await api.post(`/crm/samples/${a1.id}/variacoes`, { variacoes: [{ descricao_aplicacao: "Floral" }] });
    assert.equal(db(`${T}/crm_samples/${a1.id}/variacoes`)[2].codigo, `${p2.numero_projeto}-A1-c`);
    const a3 = (await api.post("/crm/samples/batch/v2", { projeto_id: p2.id, samples: [{ nome_produto: "Máscara" }] })).data.samples[0];
    assert.equal(a3.numero_amostra, `${p2.numero_projeto}-A3`, "lote seguinte continua a contagem do projeto");
  });

  test("projeto antigo sem número ganha o próximo do ano ao receber amostra", async () => {
    as("adm");
    const c = (await api.post("/crm/clients", { nome_empresa: "Legado Beauty" })).data;
    memory.write(`${T}/crm_projects/LEG`, { id: "LEG", nome_projeto: "Antigo", cliente_id: c.id, stage: "amostra_solicitada", created_at: "2026-07-01T00:00:00Z" });
    const s = (await api.post("/crm/samples/batch/v2", { projeto_id: "LEG", samples: [{ nome_produto: "Hidratante" }] })).data.samples[0];
    const numero = db(`${T}/crm_projects/LEG/numero_projeto`);
    assert.match(numero, /^2026-\d{3}$/);
    assert.equal(s.numero_amostra, `${numero}-A1`);
  });
});

describe("caminhos de exceção", () => {
  test("orçamento reprovado arquiva o projeto e marca o cliente como perdido", async () => {
    as("com");
    const c = (await api.post("/crm/clients", { nome_empresa: "Beta Cosméticos", ...QUALIFIED })).data;
    const p = (await api.post("/crm/projects/batch", { cliente_id: c.id, projects: [{ nome_projeto: "Shampoo" }] })).data.projects[0];
    await fails(api.post(`/crm/projects/${p.id}/proposta/decisao`, { decisao: "reprovado", motivo: "Preço", aprovacao_cliente: APROVACAO }), 409, /Salve o orçamento/);
    await api.post(`/crm/projects/${p.id}/proposta`, { tipo_produto: "Shampoo" });
    await fails(api.post(`/crm/projects/${p.id}/proposta/decisao`, { decisao: "reprovado" }), 422, /Motivo/);
    const r = (await api.post(`/crm/projects/${p.id}/proposta/decisao`, { decisao: "reprovado", motivo: "Preço acima do mercado", aprovacao_cliente: APROVACAO })).data;
    assert.equal(r.project.stage, "projeto_arquivado");
    assert.equal(r.project.motivo_arquivamento, "Preço acima do mercado");
    assert.equal(db(`${T}/crm_clients/${c.id}/stage`), "cliente_perdido");
  });

  test("ADM fecha pedido sem fórmula registrada: Kickoff abre com a dispensa registrada", async () => {
    as("adm");
    const c = (await api.post("/crm/clients", { nome_empresa: "Cadastro Direto SA" })).data;
    const p = (await api.post("/crm/projects/batch", { cliente_id: c.id, projects: [{ nome_projeto: "Linha Direta" }] })).data.projects[0];
    const moved = (await api.put(`/crm/projects/${p.id}/move`, { stage: "pedido_aprovado" })).data;
    assert.ok(moved.kickoff_criado?.numero_kickoff);
    assert.ok(moved.movement.administrativo);
    assert.ok(moved.movement.requisitos_dispensados.includes("Fórmula registrada no Banco P&D"));
    const k = (await api.get(`/kickoff/${moved.kickoff_criado.kickoff_id}`)).data;
    assert.equal(k.formula_id, null);
    assert.deepEqual(k.requisitos_dispensados, ["Fórmula registrada no Banco P&D"]);
  });

  test("comercial não fecha pedido no CRM2 sem fórmula registrada", async () => {
    as("adm");
    const c = (await api.post("/crm/clients", { nome_empresa: "Gama Beauty" })).data;
    const p = (await api.post("/crm/projects/batch", { cliente_id: c.id, projects: [{ nome_projeto: "Gama" }] })).data.projects[0];
    memory.write(`${T}/crm_projects/${p.id}/stage`, "em_negociacao");
    as("com");
    await fails(api.put(`/crm/projects/${p.id}/move`, { stage: "pedido_aprovado" }), 409, /formula registrada/);
    assert.equal(db(`${T}/crm_projects/${p.id}/stage`), "em_negociacao");
  });

  test("assinatura sem quantidade no orçamento bloqueia a liberação e explica", async () => {
    as("adm");
    const c = (await api.post("/crm/clients", { nome_empresa: "Delta Cosmética", cnpj: "33.444.555/0001-66" })).data;
    const p = (await api.post("/crm/projects/batch", { cliente_id: c.id, projects: [{ nome_projeto: "Delta Splash" }] })).data.projects[0];
    await api.put(`/crm/projects/${p.id}`, { categoria: "perfumaria" });
    const s = (await api.post("/crm/samples/batch/v2", { projeto_id: p.id, samples: [{ nome_produto: "Delta Splash", variacoes: [{ descricao_aplicacao: "Floral" }] }] })).data.samples[0];
    await api.post(`/crm/samples/${s.id}/variacoes/${s.variacoes[0].id}/resultado-cliente`, { resultado: "aprovada", aprovacao_cliente: APROVACAO });
    await api.post(`/crm/projects/${p.id}/proposta`, { items_pedido: [{ item: "Delta Splash Floral", qtd: null }] });
    const k = (await api.put(`/crm/projects/${p.id}/move`, { stage: "pedido_aprovado" })).data.kickoff_criado;
    memory.write(`${T}/kickoffs/${k.kickoff_id}/status`, "aprovado");
    const cg = (await api.post("/contratos/gerar", { kickoff_id: k.kickoff_id })).data;
    const signed = (await api.post(`/contratos/${cg.id}/assinar`, {})).data;
    assert.equal(signed.pedido_liberado_para_emissao, false);
    assert.match(signed.sku_bloqueios.join(" "), /Informe a quantidade no orçamento/);
    const sku = signed.skus_gerados[0].sku.codigo_interno;
    assert.equal(sku, "PRF-DELT-0001");
    const pedido = Object.values(db("pedidos_comerciais")).find((x) => x.origemCrm?.projetoId === p.id);
    assert.equal(pedido.status, "AGUARDANDO_CGI");
    assert.match(pedido.bloqueioEmissao, /quantidade/);
    // Corrige a quantidade no orçamento e reprocessa pela tela de Contratos.
    await api.patch(`/crm/projects/${p.id}/proposta`, { items_pedido: [{ item: "Delta Splash Floral", qtd: 500, valor_unitario: 9 }] });
    const retry = (await api.post(`/contratos/${cg.id}/assinar`, {})).data;
    assert.equal(retry.pedido_liberado_para_emissao, true);
    assert.equal(db(`pedidos/${pedido.numeroFormatado}__${sku}`).qtdTotal, 500);
  });

  test("categoria sem código ativo no PCP bloqueia a SKU com motivo", async () => {
    as("adm");
    const c = (await api.post("/crm/clients", { nome_empresa: "Ômega" })).data;
    const p = (await api.post("/crm/projects/batch", { cliente_id: c.id, projects: [{ nome_projeto: "Ômega Maquiagem" }] })).data.projects[0];
    await api.put(`/crm/projects/${p.id}`, { categoria: "maquiagem" });
    const s = (await api.post("/crm/samples/batch/v2", { projeto_id: p.id, samples: [{ nome_produto: "Batom", variacoes: [{ descricao_aplicacao: "Rosa" }] }] })).data.samples[0];
    await api.post(`/crm/samples/${s.id}/variacoes/${s.variacoes[0].id}/resultado-cliente`, { resultado: "aprovada", aprovacao_cliente: APROVACAO });
    const k = (await api.put(`/crm/projects/${p.id}/move`, { stage: "pedido_aprovado" })).data.kickoff_criado;
    memory.write(`${T}/kickoffs/${k.kickoff_id}/status`, "aprovado");
    const cg = (await api.post("/contratos/gerar", { kickoff_id: k.kickoff_id })).data;
    const signed = (await api.post(`/contratos/${cg.id}/assinar`, {})).data;
    assert.equal(signed.pedido_liberado_para_emissao, false);
    assert.match(signed.sku_bloqueios[0], /Categoria 'maquiagem' não possui código ativo/);
  });

  test("Pedido Direto: cliente e SKU já cadastrados pulam o funil e vão direto ao PCP", async () => {
    as("com");
    const lumi = Object.values(db(`${T}/crm_clients`)).find((c) => c.cadastro_cliente_id === "LUMI");
    await fails(api.post("/orders/direct", { cliente_id: lumi.id, sku_id: "PRF-LUMI-0001", qtd: 0, valor_unitario: 10 }), 400, /quantidade positiva/);
    const order = (await api.post("/orders/direct", { cliente_id: lumi.id, sku_id: "PRF-LUMI-0001", qtd: 1200, valor_unitario: 12.5, prazo_entrega: "2026-12-20" })).data;
    assert.match(order.numero_pedido, /^PED-\d{4}$/);
    const pedido = db(`pedidos_comerciais/${order.id}`);
    assert.equal(pedido.status, "LIBERADO_PCP");
    assert.equal(pedido.clienteKey, "LUMI");
    const linha = db(`pedidos/${order.id}__PRF-LUMI-0001`);
    assert.equal(linha.qtdTotal, 1200);
    assert.equal(linha.dataEntrega, "2026-12-20");
    const novo = (await api.post("/crm/clients", { nome_empresa: "Sem Cadastro Mestre Ltda" })).data;
    await fails(api.post("/orders/direct", { cliente_id: novo.id, sku_id: "PRF-LUMI-0001", qtd: 10, valor_unitario: 1 }), 409, /cadastro mestre/);
  });

  test("lista de responsáveis usa o índice público quando usuarios/ é negado", async () => {
    as("com");
    memory.write("usuarios_publico", { com: { nome: "Carla Comercial", role: "gestor" }, pd: { nome: "Paulo P&D", role: "lider_pd" } });
    memory.denied.add("usuarios");
    const list = (await api.get("/crm/users-list")).data;
    memory.denied.delete("usuarios");
    assert.deepEqual(list.map((u) => [u.id, u.name, u.role]), [["com", "Carla Comercial", "gestor"], ["pd", "Paulo P&D", "lider_pd"]]);
  });

  test("espelho P&D -> CRM3 grava uma vez e ignora vínculo com amostra inexistente", async () => {
    as("adm");
    memory.write(`${T}/pd_cards/orfao`, { id: "orfao", pd_request_id: Object.keys(db(`${T}/pd_requests`))[0], amostra_id: "nao-existe", amostra_variacao_id: "x", status_pd: "?" });
    await api.get("/crm/samples");
    const original = memory.write.bind(memory);
    let writes = 0;
    memory.write = (path, value) => { writes += 1; return original(path, value); };
    try {
      await api.get("/crm/samples");
      await api.get("/crm/samples");
    } finally { memory.write = original; }
    assert.equal(writes, 0, "segunda listagem não regrava nada");
  });

  test("tela de SKU do ERP só consulta; saldo não é exibido antes do Dia D", async () => {
    await fails(api.put("/crm/skus/PRF-LUMI-0001", { nome: "x" }), 409, /Cadastros > Produtos/);
    await fails(api.get("/crm/skus/PRF-LUMI-0001/saldo"), 409, /Dia D/);
  });
});
