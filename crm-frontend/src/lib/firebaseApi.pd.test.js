// P&D no adaptador Firebase (PLANO_PD_CRM_AJUSTES.md, Fase 1): finalizar a
// manipulação registra a fórmula e faz a amostra da versão nascer sozinha;
// fórmula registrada passa a depender só da aprovação do cliente.
import { memory } from "@/test/memoryFirebase";

vi.mock("firebase/database", () => import("@/test/memoryFirebase").then((m) => m.databaseModule));
vi.mock("firebase/storage", () => import("@/test/memoryFirebase").then((m) => m.storageModule));
vi.mock("@/lib/firebase", () => import("@/test/memoryFirebase").then((m) => m.firebaseModule));
vi.mock("@/lib/justificationPrompt", async (orig) => ({ ...(await orig()), askJustification: async () => null }));

const T = "erp/kuryos";
// COM-02: retorno do cliente e decisão do orçamento exigem quem, canal e data/hora.
const APROVACAO = { quem_nome: "Maria (cliente)", canal: "whatsapp", aprovado_em: "2024-01-10T15:00:00.000Z" };
const SEED = {
  usuarios: { pd: { role: "pd", name: "Yasmim P&D", tenant_id: "kuryos" } },
  erp: { kuryos: {
    pd_requests: { R1: { id: "R1", status: "IN_PROGRESS", title: "Manteiga de Banho", client_name: "Lumi" } },
    pd_developments: { D1: { id: "D1", request_id: "R1" } },
    pd_formulas: { F1: { id: "F1", development_id: "D1", version: 1, name: "Manteiga", volume: 60, volume_unit: "g", cotacao_usd: 5 } },
    pd_formula_items: {
      I1: { id: "I1", formula_id: "F1", ingredient_name: "Manteiga de Quinoa", percentage: 40.5, price_per_kg: 100 },
      I2: { id: "I2", formula_id: "F1", ingredient_name: "Cetiol LC", percentage: 59.5, price_usd: 10 },
    },
  } },
};

let api;
beforeAll(async () => {
  memory.reset(SEED);
  memory.setUser("pd");
  api = (await import("@/lib/firebaseApi")).default;
});
afterAll(() => memory.restore());

const amostras = () => Object.values(memory.read(`${T}/pd_samples`) || {});

test("finalizar a manipulação registra a fórmula e cria a amostra V1", async () => {
  await api.put("/pd/requests/R1/status", { new_status: "IN_TESTS" });
  expect(memory.read(`${T}/pd_formulas/F1/locked`)).toBe(true);
  const lista = amostras();
  expect(lista).toHaveLength(1);
  expect(lista[0]).toMatchObject({ development_id: "D1", formula_version: 1, sent_to_client: false, origem: "manipulacao_finalizada" });
});

test("voltar e finalizar de novo não duplica a V1", async () => {
  await api.put("/pd/requests/R1/status", { new_status: "IN_PROGRESS", is_backward: true, comment: "Ajuste de viscosidade pedido" });
  await api.put("/pd/requests/R1/status", { new_status: "IN_TESTS" });
  expect(amostras()).toHaveLength(1);
});

test("custo da fórmula em g conta 60 g como 0,06 kg e o US$ pela cotação", async () => {
  const { data } = await api.get("/pd/formulas/bank");
  const f = data.find((x) => x.id === "F1");
  // 40,5% × R$100 + 59,5% × (US$10 × 5) = 40,5 + 29,75 = R$70,25/kg
  expect(f.total_cost_per_kg).toBeCloseTo(70.25);
  expect(f.custo_unitario).toBeCloseTo(70.25 * 0.06, 2);
});

describe("cards do P&D seguem o retorno do cliente no CRM3", () => {
  beforeAll(() => {
    memory.write(`${T}/crm_samples/S1`, { id: "S1", projeto_id: "P1", nome_produto: "Body Splash", variacoes: [
      { id: "VA", codigo: "2026-1004-a", status: "aprovada" },
      { id: "VB", codigo: "2026-1004-b", status: "retrabalho" },
      { id: "VC", codigo: "2026-1004-c", status: "enviada" },
    ] });
    memory.write(`${T}/crm_projects/P1`, { id: "P1", nome_projeto: "Linha Superior", cliente_nome: "Febella Beauty" });
    for (const [rid, vid] of [["RA", "VA"], ["RB", "VB"], ["RC", "VC"]]) {
      memory.write(`${T}/pd_requests/${rid}`, { id: rid, status: "WAITING_APPROVAL", title: "Body Splash", crm_sample_id: "S1", crm_variacao_id: vid, crm_project_id: "P1" });
      memory.write(`${T}/pd_developments/D${rid}`, { id: `D${rid}`, request_id: rid });
    }
    memory.write(`${T}/pd_cards/CA`, { id: "CA", pd_request_id: "RA", amostra_id: "S1", amostra_variacao_id: "VA", status_pd: "aguardando_aprovacao", status: "WAITING_APPROVAL" });
    memory.write(`${T}/pd_cards/CB`, { id: "CB", pd_request_id: "RB", amostra_id: "S1", amostra_variacao_id: "VB", status_pd: "aguardando_aprovacao", status: "WAITING_APPROVAL" });
    memory.write(`${T}/pd_cards/ORFAO`, { id: "ORFAO", pd_request_id: "NAO_EXISTE", status_pd: "em_desenvolvimento" });
  });

  test("abrir o quadro aplica o retorno do cliente, cria card faltante e esconde órfão", async () => {
    const { data } = await api.get("/crm/pd/cards");
    expect(memory.read(`${T}/pd_requests/RA/status`)).toBe("APPROVED");
    expect(memory.read(`${T}/pd_requests/RB/status`)).toBe("REJECTED");
    expect(memory.read(`${T}/pd_requests/RC/status`)).toBe("WAITING_APPROVAL");
    const aprovacao = Object.values(memory.read(`${T}/pd_approvals`) || {}).find((a) => a.development_id === "DRA");
    expect(aprovacao.approved_by_client).toBe(true);
    const historico = Object.values(memory.read(`${T}/pd_request_status_history`) || {}).filter((h) => h.request_id === "RA");
    expect(historico.at(-1)).toMatchObject({ from_status: "WAITING_APPROVAL", to_status: "APPROVED", changed_by_name: "Retorno do cliente (CRM3)" });
    const porId = Object.fromEntries(data.map((c) => [c.id, c]));
    expect(porId.CA.status_pd).toBe("aprovado");
    expect(porId.CB.status_pd).toBe("retrabalho_interno");
    expect(porId["card-RC"]).toMatchObject({ pd_request_id: "RC", status_pd: "aguardando_aprovacao", cliente: "Febella Beauty", numero_completo: "2026-1004-c" });
    expect(porId.ORFAO).toBeUndefined();
    expect(memory.read(`${T}/pd_cards/ORFAO`)).toBeTruthy();
  });

  test("abrir de novo não repete nada", async () => {
    const antes = Object.keys(memory.read(`${T}/pd_request_status_history`) || {}).length;
    await api.get("/crm/pd/cards");
    expect(Object.keys(memory.read(`${T}/pd_request_status_history`) || {}).length).toBe(antes);
  });

  test("status comercial da variação no CRM3 segue o P&D; aprovada pelo cliente não é tocada", async () => {
    const vars = () => Object.fromEntries((memory.read(`${T}/crm_samples/S1/variacoes`) || []).map((v) => [v.id, v]));
    expect(vars().VA.status).toBe("aprovada");
    expect(vars().VB.status).toBe("retrabalho");
    // Variação divergente (como 2026-1003-h na base em 26/10): P&D entregou, CRM3 parado em elaboração.
    const lista = memory.read(`${T}/crm_samples/S1/variacoes`);
    lista[2] = { ...lista[2], status: "em_elaboracao" };
    memory.write(`${T}/crm_samples/S1/variacoes`, lista);
    await api.get("/crm/samples");
    expect(vars().VC).toMatchObject({ status: "enviada", status_pd_raw: "aguardando_aprovacao" });
    expect(vars().VC.historico_status.at(-1)).toMatchObject({ de: "em_elaboracao", para: "enviada", sincronizado_pd: true });
    const tamanho = vars().VC.historico_status.length;
    await api.get("/crm/samples");
    expect(vars().VC.historico_status).toHaveLength(tamanho);
  });

  test("amostra refeita depois do retrabalho espera o NOVO retorno do cliente (o retrabalho antigo não vale)", async () => {
    // RB voltou para Retrabalho; o P&D refaz e reenvia (Em Testes → Aguardando Aprovação).
    await api.put("/pd/requests/RB/status", { new_status: "IN_PROGRESS" });
    memory.write(`${T}/pd_requests/RB/status`, "IN_TESTS");
    memory.write(`${T}/pd_stability_studies/EB`, { id: "EB", request_id: "RB" });
    memory.write(`${T}/pd_stability_readings/LB`, { id: "LB", study_id: "EB", condition_code: "ambient", day_offset: 2 });
    await api.put("/pd/requests/RB/status", { new_status: "WAITING_APPROVAL" });
    // A variação no CRM3 acompanha o reenvio (26/10): retrabalho → enviada, com histórico.
    const vb = (memory.read(`${T}/crm_samples/S1/variacoes`) || []).find((v) => v.id === "VB");
    expect(vb.status).toBe("enviada");
    expect(vb.historico_status.at(-1)).toMatchObject({ para: "enviada", sincronizado_pd: true, label_pd: "Aguardando Aprovação" });
    await api.get("/crm/pd/cards");
    expect(memory.read(`${T}/pd_requests/RB/status`)).toBe("WAITING_APPROVAL");
    // O cliente responde de novo no CRM3: agora vale.
    await new Promise((r) => setTimeout(r, 5));
    await api.post("/crm/samples/S1/variacoes/VB/resultado-cliente", { resultado: "aprovada", aprovacao_cliente: APROVACAO });
    await api.get("/crm/pd/cards");
    expect(memory.read(`${T}/pd_requests/RB/status`)).toBe("APPROVED");
  });

  test("COM-02: retorno sem quem/canal/data é recusado; com registro fica na variação e na linha do tempo do projeto", async () => {
    await expect(api.post("/crm/samples/S1/variacoes/VB/resultado-cliente", { resultado: "aprovada" }))
      .rejects.toMatchObject({ response: { status: 422 } });
    await expect(api.post("/crm/samples/S1/variacoes/VB/resultado-cliente", { resultado: "aprovada", aprovacao_cliente: { ...APROVACAO, aprovado_em: "2099-01-01T00:00:00Z" } }))
      .rejects.toThrow(/futuro/);
    const variacao = (memory.read(`${T}/crm_samples/S1/variacoes`) || []).find((v) => v.id === "VB");
    expect(variacao.aprovacao_cliente).toMatchObject({ quem_nome: "Maria (cliente)", canal: "whatsapp", registrado_por_nome: "Yasmim P&D" });
    const historico = memory.read(`${T}/crm_projects/P1/historico_movimentacoes`) || [];
    const ultimo = Object.values(historico).filter((h) => h.tipo === "aprovacao_cliente").pop();
    expect(ultimo.texto).toMatch(/aprovada por Maria \(cliente\) via WhatsApp em 10\/01\/2024, 12:00 — registrado por Yasmim P&D/);
  });
});

describe("P&D não mexe enquanto a amostra está com o cliente (Fase 2.1)", () => {
  beforeAll(() => {
    memory.write("usuarios/adm", { role: "admin", name: "Ana ADM", tenant_id: "kuryos" });
    memory.write(`${T}/pd_requests/RL`, { id: "RL", status: "WAITING_APPROVAL", title: "Sérum" });
    memory.write(`${T}/pd_developments/DL`, { id: "DL", request_id: "RL" });
    memory.write(`${T}/pd_formulas/FL`, { id: "FL", development_id: "DL", version: 1, name: "Sérum v1" });
    memory.write(`${T}/pd_formula_items/IL`, { id: "IL", formula_id: "FL", ingredient_name: "Água", percentage: 100 });
    memory.write(`${T}/pd_samples/SL`, { id: "SL", development_id: "DL", formula_version: 1, sent_to_client: true });
  });
  const travado = (p) => p.then(() => { throw new Error("deveria travar"); }, (err) => {
    expect(err.response.status).toBe(423);
    expect(String(err.response.data.detail)).toMatch(/com o cliente/);
  });

  test("com o cliente: manipulação, nova versão, novo lote e nova amostra travados", async () => {
    memory.setUser("pd");
    await travado(api.post("/pd/formulas/FL/items", { ingredient_name: "Glicerina", percentage: 2 }));
    await travado(api.put("/pd/formula-items/IL", { percentage: 98 }));
    await travado(api.post("/pd/formulas/FL/new-version", { justification: "Ajuste antes do retorno" }));
    await travado(api.post("/pd/developments/DL/samples", { formula_version: 1 }));
    await travado(api.post("/pd/developments/DL/sample-batches", { formula_base_id: "FL", nome: "Lote" }));
    expect(memory.read(`${T}/pd_formula_items/IL/percentage`)).toBe(100);
  });

  test("registrar o retorno do cliente na amostra continua livre", async () => {
    memory.setUser("pd");
    await api.put("/pd/samples/SL", { feedback: "Cliente pediu mais fragrância" });
    expect(memory.read(`${T}/pd_samples/SL/feedback`)).toBe("Cliente pediu mais fragrância");
  });

  test("retrabalho destrava a bancada", async () => {
    memory.write(`${T}/pd_requests/RL/status`, "REJECTED");
    memory.setUser("pd");
    await api.post("/pd/formulas/FL/items", { ingredient_name: "Glicerina", percentage: 2 });
    expect(Object.values(memory.read(`${T}/pd_formula_items`)).some((i) => i.formula_id === "FL" && i.ingredient_name === "Glicerina")).toBe(true);
  });

  test("ADM passa mesmo com a amostra com o cliente", async () => {
    memory.write(`${T}/pd_requests/RL/status`, "WAITING_APPROVAL");
    memory.setUser("adm");
    await api.put("/pd/formula-items/IL", { percentage: 97 });
    expect(memory.read(`${T}/pd_formula_items/IL/percentage`)).toBe(97);
    memory.setUser("pd");
  });
});

describe("manipulação no modelo das fichas (Fase 3)", () => {
  beforeAll(() => {
    memory.write(`${T}/pd_requests/RM`, { id: "RM", status: "IN_PROGRESS", commercial_name: "Manteiga de Banho", internal_code: "2026-031-A1-a", client_name: "Lumi" });
    memory.write(`${T}/pd_developments/DM`, { id: "DM", request_id: "RM" });
    memory.write(`${T}/pd_formulas/FM`, { id: "FM", development_id: "DM", version: 1, name: "Manteiga v1", volume: 60, volume_unit: "g", cotacao_usd: 5 });
    memory.write(`${T}/pd_formula_phases/PA`, { id: "PA", formula_id: "FM", nome_fase: "A", temperatura: "75 °C", order: 0, etapas: ["Pesar na ordem descrita", "Aquecer a Fase A a 75 °C e homogeneizar"] });
    memory.setUser("pd");
  });
  const logs = () => Object.values(memory.read(`${T}/pd_mp_novas_log`) || {}).filter((l) => l.development_id === "DM");

  test("MP nova exige nome e tipo; incluída fica no histórico com a versão", async () => {
    await expect(api.post("/pd/formulas/FM/items", { ingredient_name: "Fragrância Shower Butter", percentage: 4, phase: "D", mp_nova: { nome: "", tipo: "MPES" } }))
      .rejects.toMatchObject({ response: { status: 422 } });
    const { data } = await api.post("/pd/formulas/FM/items", { ingredient_name: "Fragrância Shower Butter", inci: "Parfum", fornecedor: "Scentec", percentage: 4, phase: "D", mp_nova: { nome: "Fragrância Shower Butter I", tipo: "MPES" } });
    await api.post("/pd/formulas/FM/items", { ingredient_name: "Cetiol LC", inci: "Coco-Caprylate/Caprate", fornecedor: "Basf", percentage: 96, phase: "A" });
    expect(memory.read(`${T}/pd_formula_items/${data.id}`)).toMatchObject({ phase: "D", inci: "Parfum", mp_nova: { tipo: "MPES" } });
    expect(logs()).toEqual([expect.objectContaining({ acao: "incluida", nome: "Fragrância Shower Butter I", tipo: "MPES", formula_version: 1, request_id: "RM" })]);
  });

  test("retrabalho: nova versão leva ingredientes e passo a passo; trocar a MP nova registra a antiga", async () => {
    memory.write(`${T}/pd_formulas/FM/locked`, true);
    const { data: v2 } = await api.post("/pd/formulas/FM/new-version", { justification: "Cliente pediu fragrância mais suave" });
    const fasesV2 = Object.values(memory.read(`${T}/pd_formula_phases`)).filter((p) => p.formula_id === v2.id);
    expect(fasesV2.map((p) => [p.nome_fase, p.etapas.length])).toEqual([["A", 2]]);
    const nova = v2.items.find((i) => i.mp_nova);
    await api.put(`/pd/formula-items/${nova.id}`, { mp_nova: { nome: "Fragrância Shower Butter II", tipo: "MPES" } });
    const ultimo = logs().find((l) => l.acao === "substituida");
    expect(ultimo).toMatchObject({ de: "Fragrância Shower Butter I", nome: "Fragrância Shower Butter II", formula_version: 2 });
    expect(logs().some((l) => l.acao === "incluida" && l.formula_version === 1)).toBe(true);
    const { data: hist } = await api.get("/pd/developments/DM/mp-novas");
    expect(hist.length).toBe(2);
  });

  test("cliente aprovou: MP nova da versão aprovada vira tarefa no Cadastros, sem duplicar (Fase 4)", async () => {
    memory.write(`${T}/crm_projects/PM`, { id: "PM", numero_projeto: "2026-031", nome_projeto: "Linha Banho", cliente_nome: "Lumi" });
    memory.write(`${T}/pd_requests/RM/crm_project_id`, "PM");
    await api.post("/pd/developments/DM/approval", { approved_by_client: true, notes: "Cliente aprovou a v2" });
    const fila = memory.read("solicitacoes_cadastro_material") || {};
    const tarefas = Object.values(fila);
    expect(tarefas).toHaveLength(1);
    expect(tarefas[0]).toMatchObject({
      status: "PENDENTE_CADASTRO", tipo: "MPES", nome: "Fragrância Shower Butter II",
      origem: { pdRequestId: "RM", formulaVersao: 2, projetoNumero: "2026-031", amostra: "2026-031-A1-a", cliente: "Lumi" },
    });
    await api.post("/pd/developments/DM/approval", { approved_by_client: true });
    expect(Object.keys(memory.read("solicitacoes_cadastro_material"))).toHaveLength(1);
    const { data: vista } = await api.get("/pd/developments/DM/mp-novas-fila");
    expect(vista.map((x) => x.nome)).toEqual(["Fragrância Shower Butter II"]);
  });

  test("fila que falhou é tentada de novo ao abrir o quadro do P&D", async () => {
    memory.write("solicitacoes_cadastro_material", null);
    memory.write(`${T}/pd_requests/RM/fila_mp_nova_falhou_em`, "2026-10-16T09:00:00Z");
    await api.get("/crm/pd/cards");
    expect(Object.values(memory.read("solicitacoes_cadastro_material") || {}).map((t) => t.nome)).toEqual(["Fragrância Shower Butter II"]);
    expect(memory.read(`${T}/pd_requests/RM/fila_mp_nova_falhou_em`)).toBeFalsy();
  });

  test("ficha técnica: 2.2 recebe as fases da Manipulação e o documento sai no modelo das fichas", async () => {
    const { data: ui } = await api.get("/pd/requests/RM/ficha-tecnica-ui");
    expect(ui.formula_phases.map((p) => p.nome_fase)).toEqual(["A"]);
    const { data: blob } = await api.get("/pd/requests/RM/ficha-tecnica");
    const html = await blob.text();
    expect(blob.type).toMatch(/text\/html/);
    expect(html).toMatch(/Manteiga de Banho/);
    expect(html).toMatch(/FASE A/);
    expect(html).toMatch(/Coco-Caprylate\/Caprate/);
    expect(html).toMatch(/Aquecer a Fase A a 75 °C/);
    expect(html).toMatch(/Custo R\$\/kg/);
  });
});

describe("dólar ao vivo + spread (Fase 5)", () => {
  beforeAll(async () => {
    memory.write("config/cambio", { usd_brl: { compra: 5.07, venda: 5.08, fonte: "AwesomeAPI (dólar comercial)", atualizadoEm: new Date().toISOString() }, spread_pct: 0 });
    memory.write(`${T}/pd_requests/RC5`, { id: "RC5", status: "IN_PROGRESS", title: "Dólar" });
    memory.write(`${T}/pd_developments/DC5`, { id: "DC5", request_id: "RC5" });
    memory.write(`${T}/pd_formulas/FC5`, { id: "FC5", development_id: "DC5", version: 1, name: "Ao vivo", volume: 1, volume_unit: "kg", cotacao_usd: 6 });
    memory.write(`${T}/pd_formulas/FX5`, { id: "FX5", development_id: "DC5", version: 2, name: "Fixada", volume: 1, volume_unit: "kg", cotacao_usd: 6, cotacao_usd_fixa: true });
    memory.write(`${T}/pd_formula_items/IC5`, { id: "IC5", formula_id: "FC5", ingredient_name: "Fragrância", percentage: 100, price_usd: 10 });
    memory.write(`${T}/pd_formula_items/IX5`, { id: "IX5", formula_id: "FX5", ingredient_name: "Fragrância", percentage: 100, price_usd: 10 });
    memory.setUser("adm");
    await api.get("/config/cambio");
  });
  afterAll(() => memory.setUser("pd"));
  const doBanco = async () => Object.fromEntries((await api.get("/pd/formulas/bank")).data.filter((f) => f.development_id === "DC5").map((f) => [f.id, f]));

  test("fórmula acompanha o dólar; a fixada fica com a cotação dela", async () => {
    const f = await doBanco();
    expect(f.FC5).toMatchObject({ cotacao_usd: 5.08, cotacao_usd_origem: "ao_vivo", cotacao_usd_gravada: 6 });
    expect(f.FC5.total_cost_per_kg).toBeCloseTo(50.8);
    expect(f.FX5).toMatchObject({ cotacao_usd: 6, cotacao_usd_origem: "fixa" });
    expect(f.FX5.total_cost_per_kg).toBeCloseTo(60);
  });

  test("spread do ADM entra na taxa; fora da faixa é recusado; quem não é ADM não muda", async () => {
    const { data } = await api.put("/config/cambio/spread", { spread: "2,5" });
    expect(data).toMatchObject({ spread: 2.5, taxa: 5.207 });
    expect((await doBanco()).FC5.cotacao_usd).toBe(5.207);
    await expect(api.put("/config/cambio/spread", { spread: 50 })).rejects.toMatchObject({ response: { status: 422 } });
    memory.setUser("pd");
    await expect(api.put("/config/cambio/spread", { spread: 1 })).rejects.toMatchObject({ response: { status: 403 } });
    memory.setUser("adm");
  });

  test("COM-01: envio não congela; cada etapa grava a taxa (número + texto) no histórico do cliente; aprovado fica com a taxa da aprovação", async () => {
    memory.write(`${T}/crm_clients/CL5`, { id: "CL5", nome_empresa: "Cliente Dólar", historico_movimentacoes: [{ de: "prospeccao", para: "qualificado", usuario: "x", data: "2026-01-01" }] });
    memory.write(`${T}/crm_projects/PC5`, { id: "PC5", nome_projeto: "Cotação dólar", numero_projeto: "2026-055", stage: "cotacao", cliente_id: "CL5" });
    await api.post("/crm/projects/PC5/proposta", { tipo_produto: "Splash", status: "rascunho" });
    const proposta = () => Object.values(memory.read(`${T}/crm_propostas`)).find((p) => p.projeto_id === "PC5");
    const historico = () => Object.values(memory.read(`${T}/crm_clients/CL5/historico_movimentacoes`) || {});
    await api.patch("/crm/projects/PC5/proposta", { status: "enviado" });
    expect(proposta().cambio_congelado).toBeUndefined();
    const envio = historico().find((h) => h.tipo === "cambio" && h.etapa === "envio");
    expect(envio).toMatchObject({ taxa: 5.207, venda: 5.08, spread_pct: 2.5, projeto_id: "PC5" });
    expect(envio.texto).toMatch(/Enviado ao cliente Projeto 2026-055 — US\$ 1,00 = R\$ 5,2070/);
    expect(historico()[0].para).toBe("qualificado"); // o que já existia continua lá
    // Reenviar não duplica o registro de envio; o dólar muda e a proposta aberta acompanha.
    memory.write("config/cambio/usd_brl/venda", 5.9);
    await api.patch("/crm/projects/PC5/proposta", { status: "enviado", observacoes_proposta: "reenvio" });
    expect(historico().filter((h) => h.etapa === "envio")).toHaveLength(1);
    // Aprovação: a taxa do momento fica no orçamento e no histórico; depois o dólar pode mudar.
    await api.patch("/crm/projects/PC5/proposta", { negociacao_status: "aprovado", aprovacao_cliente: APROVACAO });
    expect(proposta().cambio_da_etapa).toMatchObject({ etapa: "orcamento_aprovado", taxa: 6.0475 });
    expect(historico().filter((h) => h.etapa === "orcamento_aprovado")).toHaveLength(1);
    expect(Object.values(memory.read(`${T}/cambio_log`) || {}).map((l) => l.etapa)).toEqual(["envio", "orcamento_aprovado"]);
    const { taxaDaCotacao } = await import("@/lib/cambio");
    expect(taxaDaCotacao(proposta(), { usd_brl: { venda: 7 }, spread_pct: 0 })).toMatchObject({ taxa: 6.0475, origem: "aprovacao" });
  });
});

describe("estabilidade em sequência (Fase 6)", () => {
  const TODOS = { appearance: "Conforme", color: "Conforme", odor: "Conforme", ph: "6,5", viscosity: "N/A", density: "0,98", spreadability: "Boa", separation: "Não", precipitation: "Não", microbiology: "N/A", package_compatibility: "Conforme", mass_variation: "0%" };
  let estudo;
  const leitura = (dia, parametros = TODOS, cond = "ambient") => api.post(`/pd/stability/studies/${estudo}/readings`, { condition_code: cond, day_offset: dia, parameters: parametros });
  const recusa = (p, re) => p.then(() => { throw new Error("deveria recusar"); }, (err) => { expect(err.response.status).toBe(422); expect(String(err.response.data.detail)).toMatch(re); });

  beforeAll(async () => {
    memory.setUser("pd");
    memory.write(`${T}/pd_requests/RS6`, { id: "RS6", status: "IN_TESTS", title: "Estabilidade" });
    estudo = (await api.get("/pd/requests/RS6/stability-study")).data.study.id;
  });

  test("D24h só 24 h depois do início; fora de ordem e incompleta são recusadas", async () => {
    await recusa(leitura(1), /D24h libera em 24 h \(24 h do início do estudo\)/);
    memory.write(`${T}/pd_stability_studies/${estudo}/started_at`, new Date(Date.now() - 25 * 3600e3).toISOString());
    await recusa(leitura(2), /um checkpoint por vez: o próximo é o D24h/);
    await recusa(leitura(1, { appearance: "Conforme" }), /incompleta.*Cor.*Variação de massa/);
    const { data } = await leitura(1);
    expect(Date.parse(data.reading.reading_at)).toBeGreaterThan(Date.now() - 60e3);
  });

  test("D48h espera 24 h depois do D24h; outra condição tem sequência própria", async () => {
    await recusa(leitura(2), /D48h libera em 2[34] h \(24 h depois do D24h\)/);
    await expect(leitura(1)).rejects.toMatchObject({ response: { status: 409 } });
    memory.write(`${T}/pd_stability_studies/${estudo}/started_at`, new Date(Date.now() - 25 * 3600e3).toISOString());
    await leitura(1, TODOS, "oven_45");
  });

  test("ADM lança antes do prazo (atraso de lançamento), mas nunca fora de ordem", async () => {
    memory.setUser("adm");
    await leitura(2);
    await recusa(leitura(30), /o próximo é o D7/);
    memory.setUser("pd");
  });
});

test("fórmula registrada só com a aprovação do cliente", async () => {
  memory.write(`${T}/pd_approvals/A1`, { id: "A1", development_id: "D1", approved_by_client: true, approved_by_internal: false });
  const { data } = await api.get("/pd/formulas/bank");
  expect(data.find((x) => x.id === "F1").is_registered).toBe(true);
});

describe("PD-02: rotas de materiais com o filtro do P&D", () => {
  beforeAll(() => {
    memory.write("materiais", {
      m1: { mpCodigo: "MPGR-00008", mpNome: "GLICERINA", tipo: "MPGR" },
      m2: { mpCodigo: "MPES-00010", mpNome: "FRAGRANCIA FLORAL", tipo: "MPES" },
      m3: { mpCodigo: "EP-00001", mpNome: "FRASCO PET 120ML", tipo: "EP" },
      m4: { mpCodigo: "ES-00004", mpNome: "CAIXA DISPLAY FRASCO", tipo: "ES" },
      m5: { mpCodigo: "ET-00012", mpNome: "ETIQUETA FRASCO", tipo: "ET" },
      m6: { mpCodigo: "MPGR-00099", mpNome: "INATIVA", tipo: "MPGR", ativo: false },
    });
  });
  const codigos = (lista) => lista.map((m) => m.codigo_interno).filter((c) => /^(MP|E)/.test(c)).sort();

  test("/pd/catalog com tipo_material=MPES,MPGR traz só MP; buscar 'frasco' não traz nada", async () => {
    const { data } = await api.get("/pd/catalog", { params: { tipo_material: "MPES,MPGR" } });
    expect(codigos(data)).toEqual(["MPES-00010", "MPGR-00008"]);
    const { data: frasco } = await api.get("/pd/catalog", { params: { tipo_material: "MPES,MPGR", q: "frasco" } });
    expect(frasco).toEqual([]);
  });

  test("/cadastros/materiais com tipo2=MP (P&D) filtra; sem filtro (Kickoff, Banco de Custos) segue com as embalagens", async () => {
    const { data: pd } = await api.get("/cadastros/materiais", { params: { tipo2: "MP" } });
    expect(codigos(pd)).toEqual(["MPES-00010", "MPGR-00008"]);
    const { data: kickoff } = await api.get("/cadastros/materiais");
    expect(codigos(kickoff)).toEqual(["EP-00001", "ES-00004", "ET-00012", "MPES-00010", "MPGR-00008"]);
    const { data: banco } = await api.get("/pd/catalog", { params: { q: "frasco" } });
    expect(codigos(banco)).toEqual(["EP-00001", "ES-00004", "ET-00012"]);
  });
});
