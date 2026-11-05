// LM-02/05/10/11/12 — rotas da Manipulação em Lote no adaptador (memória; regras reais no emulador).
// O que é do servidor (versões travadas, ordem, pesagens, lote_manipulacao no CRM, fila de MP nova)
// fica em functions/manipulacao_lote.js e tem teste próprio; aqui só se confere que a rota o chama.
import { memory, expectStatus } from "@/test/memoryFirebase";
import { chamarServidor, liberarEtapaPd } from "@/lib/servidor";

const leituras = [];
vi.mock("firebase/database", () => import("@/test/memoryFirebase").then((m) => ({
  ...m.databaseModule, get: (r) => { leituras.push(r.path); return m.databaseModule.get(r); },
})));
vi.mock("firebase/storage", () => import("@/test/memoryFirebase").then((m) => m.storageModule));
vi.mock("@/lib/firebase", () => import("@/test/memoryFirebase").then((m) => m.firebaseModule));
vi.mock("@/lib/justificationPrompt", async (orig) => ({ ...(await orig()), askJustification: async () => null }));

const T = "erp/kuryos";
const it = (id, f, nome, pct, extra = {}) => ({ [id]: { id, formula_id: f, ingredient_name: nome, percentage: pct, phase: "A", master_material_id: nome.toUpperCase(), ...extra } });
const SEED = {
  usuarios: {
    pd: { role: "pd", nome: "Yasmim P&D", tenant_id: "kuryos" }, pd2: { role: "formulador", nome: "Carla", tenant_id: "kuryos" },
    adm: { role: "admin", nome: "ADM", tenant_id: "kuryos" }, com: { role: "comercial", nome: "Vendas", tenant_id: "kuryos" },
    pcp: { role: "pcp", nome: "PCP", tenant_id: "kuryos" },
  },
  materiais: { FENOXIETANOL: { mpNome: "Fenoxietanol", criticoPd: true } },
  materiais_chave: { FENOXIETANOL: "FENOXIETANOL" },
  solicitacoes_cadastro_material: { NOME__EXTRATO_NOVO: { status: "PENDENTE_CADASTRO", nome: "Extrato Novo", origens: { "F2__i2c": { pdRequestId: "R2", formulaId: "F2", itemId: "i2c", ativa: true } } } },
  erp: { kuryos: {
    crm_projects: { P1: { id: "P1", numero_projeto: "2026-031", nome_projeto: "Linha Corporal" } },
    crm_samples: {
      S1: { id: "S1", projeto_id: "P1", nome_produto: "Manteiga 150 mL", quantidade_por_variacao: 50, unidade_quantidade: "g",
        variacoes: [{ id: "v1", codigo: "2026-1003-a", pd_request_id: "R1", status: "solicitada" }, { id: "v2", codigo: "2026-1003-b", pd_request_id: "R2", status: "em_desenvolvimento" }] },
      S2: { id: "S2", projeto_id: "P1", nome_produto: "Manteiga 150 mL", quantidade_por_variacao: 100, unidade_quantidade: "ml",
        variacoes: [{ id: "v3", codigo: "2026-1003-c", pd_request_id: "R3" }] },
      S3: { id: "S3", projeto_id: "P1", variacoes: [{ id: "v4", codigo: "2026-1003-d", pd_request_id: "R4" }, { id: "v5", codigo: "2026-1003-e", pd_request_id: "R5", resultado_cliente: "aprovada" }] },
    },
    pd_requests: {
      R1: { id: "R1", status: "OPEN", internal_code: "2026-1003-a", crm_project_id: "P1", crm_sample_id: "S1", crm_variacao_id: "v1" },
      R2: { id: "R2", status: "IN_PROGRESS", internal_code: "2026-1003-b", crm_project_id: "P1", crm_sample_id: "S1", crm_variacao_id: "v2" },
      R3: { id: "R3", status: "OPEN", internal_code: "2026-1003-c", crm_project_id: "P1", crm_sample_id: "S2", crm_variacao_id: "v3" },
      R4: { id: "R4", status: "IN_TESTS", internal_code: "2026-1003-d", crm_project_id: "P1", crm_sample_id: "S3", crm_variacao_id: "v4" },
      R5: { id: "R5", status: "IN_PROGRESS", internal_code: "2026-1003-e", crm_project_id: "P1", crm_sample_id: "S3", crm_variacao_id: "v5" },
    },
    pd_developments: { D1: { id: "D1", request_id: "R1" }, D2: { id: "D2", request_id: "R2" }, D3: { id: "D3", request_id: "R3" }, D4: { id: "D4", request_id: "R4" }, D5: { id: "D5", request_id: "R5" } },
    pd_formulas: {
      F1: { id: "F1", development_id: "D1", version: 1, updated_at: "2026-11-01T10:00:00Z", volume: 50, indice_perdas: 2 },
      F2: { id: "F2", development_id: "D2", version: 2, locked: true, updated_at: "2026-11-03T10:00:00Z", volume: 50, indice_perdas: 3, name: "Base manteiga" },
    },
    pd_formula_items: {
      ...it("i1a", "F1", "Água", 90), ...it("i1b", "F1", "Fragrância Rosa", 10, { function: "fragrância" }),
      ...it("i2a", "F2", "Água", 78), ...it("i2b", "F2", "Fenoxietanol", 1), ...it("i2c", "F2", "Extrato", 1, { mp_nova: { nome: "Extrato Novo", tipo: "MPGR" } }),
      ...it("i2d", "F2", "Fragrância Lavanda", 20, { function: "fragrância" }),
    },
    pd_formula_phases: { PH2: { id: "PH2", formula_id: "F2", titulo: "Fase A", ordem: 0 } },
    pd_cards: {
      C1: { id: "C1", pd_request_id: "R1", amostra_id: "S1", amostra_variacao_id: "v1" },
      C2: { id: "C2", pd_request_id: "R2", amostra_id: "S1", amostra_variacao_id: "v2" },
      C3: { id: "C3", pd_request_id: "R3", amostra_id: "S2", amostra_variacao_id: "v3" },
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
const lote = (id) => memory.read(`${T}/pd_manipulacao_lotes/${id}`);
const lerContando = async (fn) => { leituras.length = 0; const r = await fn(); return { r, n: leituras.filter((p) => !p.startsWith("usuarios/") && p !== "config/cambio").length }; };
const chave = (l, nome) => Object.keys(l.ingredientes).find((x) => l.ingredientes[x].nome === nome);

let L;
describe("painel e criação", () => {
  test("elegíveis: motivo para quem não entra, matriz padrão, poucas leituras", async () => {
    const { r: { data }, n } = await lerContando(() => api.get("/pd/projetos/P1/amostras-elegiveis"));
    const por = Object.fromEntries(data.amostras.map((a) => [a.request_id, a]));
    expect(por.R1.elegivel && por.R2.elegivel && por.R3.elegivel).toBe(true);
    expect(por.R4).toMatchObject({ elegivel: false, motivo: expect.stringMatching(/Em Testes/) });
    expect(por.R5).toMatchObject({ elegivel: false, motivo: expect.stringMatching(/cliente já decidiu/) });
    expect(data.matriz_padrao).toMatchObject({ request_id: "R2", ref_id: "F2" });
    expect(data.limite).toEqual({ min: 2, max: 20 });
    expect(n).toBeLessThanOrEqual(8);
  });
  test("comercial e PCP não criam (D-10); menos de 2 é recusado", async () => {
    memory.setUser("com");
    await expectStatus(api.post("/pd/manipulacao-lotes", { projeto_id: "P1", request_ids: ["R1", "R2"] }), 403);
    memory.setUser("pcp");
    await expectStatus(api.post("/pd/manipulacao-lotes", { projeto_id: "P1", request_ids: ["R1", "R2"] }), 403);
    memory.setUser("pd");
    await expectStatus(api.post("/pd/manipulacao-lotes", { projeto_id: "P1", request_ids: ["R1"] }), 422, /pelo menos 2/);
    await expectStatus(api.post("/pd/manipulacao-lotes", { projeto_id: "P1", request_ids: ["R1", "R4"] }), 422, /Em Testes/);
  });
  test("cria o rascunho: código LM, matriz padrão, coluna própria ou da matriz, quantidade em g", async () => {
    const { data } = await api.post("/pd/manipulacao-lotes", { projeto_id: "P1", request_ids: ["R1", "R2", "R3"] });
    L = data.id;
    const l = lote(L);
    expect(l).toMatchObject({ codigo: "LM-2026-031-1", status: "rascunho", revisao: 1, projeto_id: "P1", matriz: { tipo: "amostra", ref_id: "F2", versao: 2, codigo: "2026-1003-b" } });
    expect(l.membros.R1).toMatchObject({ formula_id_antes: "F1", versao_antes: 1, quantidade_g: 50, codigo_amostra: "2026-1003-a", status_membro: "ativo" });
    expect(l.membros.R3).toMatchObject({ formula_id_antes: null, unidade_pedido: "ml", quantidade_pedido: 100 });
    expect(l.membros.R3.quantidade_g).toBeUndefined();
    expect(l.celulas.R1[chave(l, "Fragrância Rosa")]).toBe(10);
    expect(l.celulas.R3).toEqual(l.matriz.celulas);
    expect(l.ingredientes[chave(l, "Fenoxietanol")].critico).toBe(true);
    expect(l.ingredientes[chave(l, "Fragrância Lavanda")].ehFragrancia).toBe(true);
    expect(Object.values(l.eventos)[0]).toMatchObject({ tipo: "criado", por: "pd" });
    expect(memory.read(`${T}/pd_requests/R1/status`)).toBe("OPEN"); // criar não muda status
    await expectStatus(api.post("/pd/manipulacao-lotes", { projeto_id: "P1", request_ids: ["R1", "R2"] }), 422, /LM-2026-031-1/);
  });
  test("detalhe: estado de cada membro e conferência ligada por padrão", async () => {
    const { data } = await api.get(`/pd/manipulacao-lotes/${L}`);
    expect(data.estado.R2).toMatchObject({ status_pd: "IN_PROGRESS", versao_vigente: 2, formula_vigente_id: "F2" });
    expect(data).toMatchObject({ conferencia_segundo_usuario: true, pode_editar: true, eu: "pd" });
  });
});

describe("salvar (um update, só o rascunho — D-03/A4)", () => {
  const rascunhoDe = (l, mut) => {
    const r = { revisao: l.revisao, ingredientes: l.ingredientes, celulas: JSON.parse(JSON.stringify(l.celulas)), motivos: JSON.parse(JSON.stringify(l.motivos || {})),
      pre_mistura: { A: true }, perda_pct: 3, quantidades: { R1: { quantidade_g: 50 }, R2: { quantidade_g: 50 }, R3: { quantidade_g: 90 } } };
    mut?.(r, (nome) => chave(l, nome));
    return r;
  };
  test("primeiro salvamento: rascunho gravado, Aberto→Em Desenvolvimento, nenhuma versão nem fila de MP mexida", async () => {
    const l = lote(L);
    const formulasAntes = Object.keys(memory.read(`${T}/pd_formulas`));
    const corpo = rascunhoDe(l, (r, k) => {
      // R1 passa a seguir a matriz (Clonar matriz) com a fragrância dela.
      r.celulas.R1 = { ...l.matriz.celulas, [k("Fragrância Rosa")]: 20 };
      delete r.celulas.R1[k("Fragrância Lavanda")];
      r.celulas.R3 = { ...r.celulas.R3, [k("Água")]: 77.5, [k("Fragrância Lavanda")]: 20.5 };
      // R1 não tinha o conservante da matriz: entra com motivo e espera a aprovação (auditoria LM-15).
      r.motivos = { R3: { [k("Água")]: { texto: "compensar fragrância" } }, R1: { [k("Fenoxietanol")]: { texto: "entra o conservante da base" } } };
    });
    const { r: { data }, n } = await lerContando(() => api.put(`/pd/manipulacao-lotes/${L}`, corpo));
    expect(n).toBeLessThanOrEqual(16); // carga única + sincronia do CRM das 2 que saíram de Aberto
    const g = lote(L);
    expect(g.revisao).toBe(2);
    expect(data.pendencias.map((p) => `${p.request_id}:${p.nome}:${p.tipo}`)).toEqual(["R1:Fenoxietanol:aprovacao"]);
    expect(data.pendencias[0].motivo).toMatch(/fórmula anterior desta amostra/);
    expect(data.fechamento.R1.ok && data.fechamento.R3.ok).toBe(true);
    expect(Object.keys(memory.read(`${T}/pd_formulas`))).toEqual(formulasAntes); // a versão nasce na ordem, no servidor
    expect(memory.read(`${T}/pd_formulas/F2`)).toMatchObject({ version: 2, locked: true });
    expect(g.membros.R1.formula_id_lote).toBeUndefined();
    expect(memory.read(`${T}/pd_requests/R1/status`)).toBe("IN_PROGRESS");
    expect(memory.read(`${T}/pd_requests/R3/status`)).toBe("IN_PROGRESS");
    expect(Object.values(memory.read(`${T}/pd_request_status_history`)).filter((h) => h.to_status === "IN_PROGRESS").map((h) => h.request_id).sort()).toEqual(["R1", "R3"]);
    const s1 = memory.read(`${T}/crm_samples/S1`);
    expect(s1.variacoes.map((v) => v.codigo)).toEqual(["2026-1003-a", "2026-1003-b"]); // irmãs intactas
    expect(s1.variacoes[0].lote_manipulacao).toBeUndefined();
    expect(Object.keys(memory.read("solicitacoes_cadastro_material/NOME__EXTRATO_NOVO/origens"))).toEqual(["F2__i2c"]);
    expect(g.motivos.R3[chave(g, "Água")]).toMatchObject({ texto: "compensar fragrância", por: "pd", por_nome: "Yasmim P&D", valor: 77.5, nivel: 2 });
    expect(g.membros.R3).toMatchObject({ quantidade_g: 90, diferencas: ["Água"], fora_da_base: false });
    expect(g.pre_mistura).toEqual({ A: true });
    const salvo = Object.values(g.eventos).find((e) => e.tipo === "salvo");
    expect(salvo.mudancas.some((m) => /2026-1003-c · Água/.test(m))).toBe(true);
  });
  test("revisão velha → 409; mesmo conteúdo → sem mudança e sem revisão nova", async () => {
    const l = lote(L);
    await expectStatus(api.put(`/pd/manipulacao-lotes/${L}`, { ...rascunhoDe(l), revisao: 1 }), 409, /mudou/);
    const corpo = { revisao: l.revisao, ingredientes: l.ingredientes, celulas: l.celulas, motivos: l.motivos, pre_mistura: l.pre_mistura, perda_pct: l.perda_pct, minimo_pesavel_g: l.minimo_pesavel_g,
      quantidades: Object.fromEntries(Object.entries(l.membros).map(([r, m]) => [r, { quantidade_g: m.quantidade_g, densidade: m.densidade }])) };
    const { data } = await api.put(`/pd/manipulacao-lotes/${L}`, corpo);
    expect(data.sem_mudanca).toBe(true);
    expect(lote(L).revisao).toBe(l.revisao);
  });
  test("crítico: só aprovação pendente (sem comentário), amostra fora da base; fórmula editada fora do lote → 409", async () => {
    const l = lote(L);
    const corpo = rascunhoDe(l, (r, k) => {
      r.celulas.R2 = { ...r.celulas.R2, [k("Fenoxietanol")]: 0.8, [k("Água")]: 78.2 };
      r.motivos.R2 = { [k("Água")]: { texto: "ajuste do conservante" } };
    });
    const { data } = await api.put(`/pd/manipulacao-lotes/${L}`, corpo);
    expect(data.pendencias.map((p) => `${p.request_id}:${p.nome}:${p.tipo}`)).toEqual(["R1:Fenoxietanol:aprovacao", "R2:Fenoxietanol:aprovacao"]);
    expect(lote(L).motivos.R2[chave(l, "Fenoxietanol")]).toMatchObject({ por: expect.any(String), valor: 0.8 }); // quem alterou, sozinho
    expect(lote(L).membros.R2.fora_da_base).toBe(true);
    memory.write(`${T}/pd_formula_items/i1a/percentage`, 89);
    await expectStatus(api.put(`/pd/manipulacao-lotes/${L}`, { ...corpo, perda_pct: 4, revisao: lote(L).revisao }), 409, /2026-1003-a.*editada fora do lote/);
    memory.write(`${T}/pd_formula_items/i1a/percentage`, 90);
  });
  test("MP nova criada no lote: nome já cadastrado → 409 com vínculo; nova e usada → fila do Cadastros com a origem do lote", async () => {
    const l = lote(L);
    const k = (nome) => chave(l, nome);
    const comMp = (mp) => rascunhoDe(l, (r) => {
      r.ingredientes = { ...l.ingredientes, i09: { nome: mp.nome, fase: "A", mp_nova: mp } };
      r.celulas.R3 = { ...r.celulas.R3, [k("Água")]: 77, i09: 0.5 };
      r.motivos.R3 = { ...(r.motivos.R3 || {}), i09: { texto: "ativo novo do briefing" } };
    });
    const e = await expectStatus(api.put(`/pd/manipulacao-lotes/${L}`, comMp({ nome: "Fenoxietanol", tipo: "MPGR" })), 409);
    expect(e.response.data.detail).toMatchObject({ code: "MP_JA_CADASTRADA", materialKey: "FENOXIETANOL" });
    await api.put(`/pd/manipulacao-lotes/${L}`, comMp({ nome: "Óleo de Pracaxi", tipo: "MPGR" }));
    const fila = memory.read("solicitacoes_cadastro_material");
    const sol = Object.values(fila).find((s) => s.nome === "Óleo de Pracaxi");
    expect(sol).toMatchObject({ status: "PENDENTE_CADASTRO", tipo: "MPGR" });
    expect(Object.keys(sol.origens)).toEqual([`lote_${L}__i09`]);
    expect(lote(L).ingredientes.i09.mp_nova).toEqual({ nome: "Óleo de Pracaxi", tipo: "MPGR" });
    // volta ao estado anterior (sem a MP nova nas células) para os próximos passos
    await api.put(`/pd/manipulacao-lotes/${L}`, rascunhoDe(lote(L), (r) => { r.celulas.R3 = { ...l.celulas.R3 }; r.motivos.R3 = l.motivos.R3; }));
  });
  test("chave de ingrediente forjada e papel sem P&D são recusados", async () => {
    const l = lote(L);
    await expectStatus(api.put(`/pd/manipulacao-lotes/${L}`, { ...rascunhoDe(l), ingredientes: { ...l.ingredientes, "../ordem": { nome: "x" } } }), 400, /inválida/);
    memory.setUser("pcp");
    await expectStatus(api.put(`/pd/manipulacao-lotes/${L}`, rascunhoDe(l)), 403);
    memory.setUser("pd");
  });
});

describe("servidor, remover, cancelar, base, ações", () => {
  test("gerar ordem, pesagem e aprovação de crítico vão à callable do servidor", async () => {
    vi.mocked(chamarServidor).mockClear();
    await api.post(`/pd/manipulacao-lotes/${L}/gerar-ordem`, { revisao: lote(L).revisao });
    expect(chamarServidor).toHaveBeenCalledWith("manipulacaoLoteServidor", expect.objectContaining({ acao: "gerar_ordem", loteId: L, tenant: "kuryos" }));
    await api.post(`/pd/manipulacao-lotes/${L}/pesagens`, { linhas: { x: { real_g: 1 } } });
    expect(chamarServidor).toHaveBeenLastCalledWith("manipulacaoLoteServidor", expect.objectContaining({ acao: "registrar_pesagens" }));
    memory.setUser("com"); // quem aprova crítico o servidor decide pelo perfil (A2)
    await api.post(`/pd/manipulacao-lotes/${L}/aprovar-critico`, { requestId: "R2", ingKey: "i02" });
    expect(chamarServidor).toHaveBeenLastCalledWith("manipulacaoLoteServidor", expect.objectContaining({ acao: "aprovar_critico", requestId: "R2" }));
    memory.setUser("pd");
  });
  test("tornar a matriz a nova base: cria v1 sem fragrância; igual reaproveita", async () => {
    const { data } = await api.post(`/pd/manipulacao-lotes/${L}/base-projeto`, { request_id: "R2", revisao: lote(L).revisao });
    expect(data).toMatchObject({ acao: "criar", base: { projeto_id: "P1", versao: 1, origem: { lote_id: L, amostra: "2026-1003-b" } } });
    expect(data.base.itens.map((i) => i.nome)).not.toContain("Fragrância Lavanda");
    const v1 = JSON.stringify(memory.read(`${T}/pd_formulacoes_base`));
    const again = await api.post(`/pd/manipulacao-lotes/${L}/base-projeto`, { request_id: "R2", revisao: lote(L).revisao });
    expect(again.data.acao).toBe("reusar");
    expect(JSON.stringify(memory.read(`${T}/pd_formulacoes_base`))).toBe(v1);
  });
  test("remover membro: depois da ordem só com motivo ≥ 10; nada apagado", async () => {
    memory.write(`${T}/pd_manipulacao_lotes/${L}/status`, "ordem_gerada");
    await expectStatus(api.post(`/pd/manipulacao-lotes/${L}/membros/R3/remover`, { motivo: "curto", revisao: lote(L).revisao }), 422, /10/);
    await api.post(`/pd/manipulacao-lotes/${L}/membros/R3/remover`, { motivo: "Cliente desistiu desta variação", revisao: lote(L).revisao });
    expect(lote(L).membros.R3).toMatchObject({ status_membro: "removido", removido_por: "pd", removido_motivo: "Cliente desistiu desta variação" });
    expect(lote(L).celulas.R3).toBeTruthy();
  });
  test("ações em lote só com lote manipulado; Em Testes uma por vez pela rota real; irmãs do CRM 3 sem perda", async () => {
    await expectStatus(api.post(`/pd/manipulacao-lotes/${L}/acoes`, { acao: "em_testes" }), 409, /manipulação/);
    memory.write(`${T}/pd_manipulacao_lotes/${L}/status`, "manipulado");
    vi.mocked(liberarEtapaPd).mockClear();
    const { data } = await api.post(`/pd/manipulacao-lotes/${L}/acoes`, { acao: "em_testes" });
    expect(data.resultados.map((x) => [x.request_id, x.ok])).toEqual([["R1", true], ["R2", true]]);
    expect(liberarEtapaPd).toHaveBeenCalledTimes(2);
    const s1 = memory.read(`${T}/crm_samples/S1`);
    expect(s1.variacoes.map((v) => v.codigo)).toEqual(["2026-1003-a", "2026-1003-b"]);
    expect(s1.variacoes.map((v) => v.status_pd_raw)).toEqual(["em_testes", "em_testes"]);
    const again = await api.post(`/pd/manipulacao-lotes/${L}/acoes`, { acao: "em_testes" });
    expect(again.data.resultados.every((x) => x.ok && /já está/.test(x.mensagem))).toBe(true);
    expect(Object.values(lote(L).eventos).filter((e) => e.tipo === "acao_em_testes")).toHaveLength(2);
  });
  test("estabilidade em lote: um estudo por amostra, mesma data, sem duplicar", async () => {
    const { data } = await api.post(`/pd/manipulacao-lotes/${L}/acoes`, { acao: "estabilidade", inicio: "2026-11-04T09:00:00.000Z" });
    const estudos = Object.values(memory.read(`${T}/pd_stability_studies`));
    expect(estudos.map((e) => e.request_id).sort()).toEqual(["R1", "R2"]);
    expect(new Set(estudos.map((e) => e.started_at))).toEqual(new Set(["2026-11-04T09:00:00.000Z"]));
    expect(estudos[0]).toMatchObject({ lote_manipulacao_id: L, lote_codigo: "LM-2026-031-1", status: "ativo" });
    expect(estudos[0].conditions.length).toBeGreaterThan(0);
    expect(data.resultados.every((x) => x.ok)).toBe(true);
    await api.post(`/pd/manipulacao-lotes/${L}/acoes`, { acao: "estabilidade" });
    expect(Object.values(memory.read(`${T}/pd_stability_studies`))).toHaveLength(2);
  });
  test("ocorrência no lote manipulado: só inclusão, com texto mínimo", async () => {
    await expectStatus(api.post(`/pd/manipulacao-lotes/${L}/ocorrencia`, { texto: "curto", revisao: lote(L).revisao }), 422);
    await api.post(`/pd/manipulacao-lotes/${L}/ocorrencia`, { texto: "Frasco da R2 trincou na estufa", revisao: lote(L).revisao });
    expect(Object.values(lote(L).eventos).some((e) => e.tipo === "ocorrencia" && /trincou/.test(e.detalhe))).toBe(true);
  });
  test("cancelar: manipulado não cancela; rascunho cancela com motivo e libera as amostras", async () => {
    await expectStatus(api.post(`/pd/manipulacao-lotes/${L}/cancelar`, { motivo: "Erro na montagem do lote", revisao: lote(L).revisao }), 409, /manipulado/);
    memory.write(`${T}/pd_manipulacao_lotes/LY`, { id: "LY", codigo: "LM-2026-031-8", projeto_id: "P1", status: "rascunho", revisao: 2, membros: { R3: { request_id: "R3", status_membro: "ativo" } } });
    let el = (await api.get("/pd/projetos/P1/amostras-elegiveis")).data.amostras.find((a) => a.request_id === "R3");
    expect(el.motivo).toMatch(/LM-2026-031-8/);
    await expectStatus(api.post("/pd/manipulacao-lotes/LY/cancelar", { motivo: "x", revisao: 2 }), 422);
    await api.post("/pd/manipulacao-lotes/LY/cancelar", { motivo: "Montado por engano", revisao: 2 });
    expect(lote("LY")).toMatchObject({ status: "cancelado", revisao: 3, cancelamento: { motivo: "Montado por engano", por: "pd" }, membros: { R3: { status_membro: "ativo" } } });
    el = (await api.get("/pd/projetos/P1/amostras-elegiveis")).data.amostras.find((a) => a.request_id === "R3");
    expect(el.elegivel).toBe(true);
  });
  test("config da conferência por segundo usuário: só o ADM", async () => {
    await expectStatus(api.put("/pd/manipulacao-lotes-config", { conferencia_segundo_usuario: false }), 403);
    memory.setUser("adm");
    await api.put("/pd/manipulacao-lotes-config", { conferencia_segundo_usuario: false });
    expect(memory.read("config/pdLote/conferenciaSegundoUsuario")).toBe(false);
    expect((await api.get("/pd/manipulacao-lotes-config")).data.conferencia_segundo_usuario).toBe(false);
    await api.put("/pd/manipulacao-lotes-config", { conferencia_segundo_usuario: true });
    expect(memory.read("config/pdLote/conferenciaSegundoUsuario")).toBeUndefined();
    memory.setUser("pd");
  });
});

describe("integrações (LM-11)", () => {
  test("custo P&D por amostra e do lote, pela versão travada", async () => {
    memory.write(`${T}/pd_manipulacao_lotes/${L}/membros/R1/formula_id_lote`, "V1");
    memory.write(`${T}/pd_manipulacao_lotes/${L}/membros/R2/formula_id_lote`, "V2");
    memory.write(`${T}/pd_formula_items/V1_i01`, { id: "V1_i01", formula_id: "V1", percentage: 90, cost_brl: 1.8 });
    memory.write(`${T}/pd_formula_items/V1_i02`, { id: "V1_i02", formula_id: "V1", percentage: 10, cost_brl: 12 });
    memory.write(`${T}/pd_formula_items/V2_i01`, { id: "V2_i01", formula_id: "V2", percentage: 100, cost_brl: 20 });
    const { data } = await api.get(`/pd/manipulacao-lotes/${L}`);
    expect(data.custos).toEqual({ por_amostra: { R1: { brl_kg: 13.8, brl_amostra: 0.69 }, R2: { brl_kg: 20, brl_amostra: 1 } }, total_brl: 1.69 });
  });
  test("aprovação do cliente guarda a versão da fórmula que ele avaliou (A4)", async () => {
    memory.setUser("adm");
    await api.post("/crm/samples/S1/variacoes/v1/resultado-cliente", { resultado: "aprovada", // relógio do teste: 13/10/2026
      aprovacao_cliente: { quem_nome: "Maria (cliente)", canal: "whatsapp", aprovado_em: "2026-10-12T15:00:00.000Z" } });
    expect(memory.read(`${T}/crm_samples/S1/variacoes/0/aprovacao_cliente/formula_aprovada`)).toEqual({ id: "F1", versao: 1 });
    expect(memory.read(`${T}/crm_samples/S1/variacoes/1/codigo`)).toBe("2026-1003-b");
    memory.setUser("pd");
  });
});

describe("exclusão e versão travada (LM-05, A5)", () => {
  test("fase de versão do lote não muda, não some e não ganha outra; a de Em Testes segue editável", async () => {
    memory.write(`${T}/pd_formulas/FV`, { id: "FV", development_id: "D2", version: 9, locked: true, origem_lote: { lote_id: L, codigo: "LM-2026-031-1" } });
    memory.write(`${T}/pd_formula_phases/PHV`, { id: "PHV", formula_id: "FV", titulo: "Fase A", ordem: 0 });
    await expectStatus(api.put("/pd/formula-phases/PHV", { titulo: "Fase B" }), 409, /ordem do lote LM-2026-031-1/);
    await expectStatus(api.delete("/pd/formula-phases/PHV"), 409, /travada/);
    await expectStatus(api.post("/pd/formulas/FV/phases", { titulo: "Nova" }), 409, /travada/);
    await expectStatus(api.put("/pd/formulas/FV/phases/reorder", { phase_ids: ["PHV"] }), 409, /travada/);
    expect(memory.read(`${T}/pd_formula_phases/PHV/titulo`)).toBe("Fase A");
    await api.put("/pd/formula-phases/PH2", { titulo: "Fase A — modo de preparo revisado" }); // F2 travada por Em Testes: como antes
    expect(memory.read(`${T}/pd_formula_phases/PH2/titulo`)).toBe("Fase A — modo de preparo revisado");
  });
  test("solicitação de lote com ordem vira cancelada (com motivo e evento no lote), não é apagada", async () => {
    memory.setUser("adm");
    const rev = lote(L).revisao;
    const { data } = await api.delete("/pd/requests/R2");
    expect(data).toMatchObject({ deleted: false, cancelled: true });
    expect(memory.read(`${T}/pd_requests/R2`)).toMatchObject({ status: "CANCELLED", cancelado_motivo: expect.stringMatching(/LM-2026-031-1/) });
    expect(memory.read(`${T}/pd_formulas/F2`)).toBeTruthy();
    expect(lote(L).revisao).toBe(rev + 1);
    expect(Object.values(lote(L).eventos).some((e) => e.tipo === "solicitacao_cancelada")).toBe(true);
  });
  test("cascata da amostra não engole erro: falha visível, amostra e solicitação ficam inteiras", async () => {
    memory.denied.add(`${T}/pd_tests`);
    await expect(api.delete("/crm/samples/S3")).rejects.toThrow(/não foi excluída.*2026-1003-d/);
    memory.denied.clear();
    expect(memory.read(`${T}/crm_samples/S3`)).toBeTruthy();
    expect(memory.read(`${T}/pd_requests/R4`)).toBeTruthy();
    expect(memory.read(`${T}/pd_developments/D4`)).toBeTruthy();
  });
  test("amostra excluída sai do lote em rascunho (marcada) e a cascata segue", async () => {
    memory.write(`${T}/pd_manipulacao_lotes/LX`, { id: "LX", codigo: "LM-2026-031-9", projeto_id: "P1", status: "rascunho", revisao: 4, membros: { R4: { request_id: "R4", codigo_amostra: "2026-1003-d", status_membro: "ativo" } } });
    await api.delete("/crm/samples/S3");
    expect(memory.read(`${T}/crm_samples/S3`)).toBeUndefined();
    expect(memory.read(`${T}/pd_requests/R4`)).toBeUndefined();
    expect(lote("LX")).toMatchObject({ status: "rascunho", revisao: 5, membros: { R4: { status_membro: "removido", removido_motivo: expect.stringMatching(/excluída/) } } });
  });
  test("projeto com lote de ordem gerada não é excluído (409, nada some)", async () => {
    await expectStatus(api.delete("/crm/projects/P1?cascade=true"), 409, /LM-2026-031-1/);
    expect(memory.read(`${T}/crm_projects/P1`)).toBeTruthy();
    expect(memory.read(`${T}/pd_requests/R1`)).toBeTruthy();
    expect(lote("LX").status).toBe("rascunho");
  });
  test("projeto só com lote em rascunho: o lote é cancelado com motivo e a cascata segue", async () => {
    memory.write(`${T}/crm_projects/P9`, { id: "P9", numero_projeto: "2026-040", nome_projeto: "Teste" });
    memory.write(`${T}/crm_samples/S9`, { id: "S9", projeto_id: "P9", variacoes: [{ id: "v9", codigo: "2026-2000-a", pd_request_id: "R9" }] });
    memory.write(`${T}/pd_requests/R9`, { id: "R9", status: "OPEN", crm_sample_id: "S9", crm_variacao_id: "v9" });
    memory.write(`${T}/pd_manipulacao_lotes/LZ`, { id: "LZ", codigo: "LM-2026-040-1", projeto_id: "P9", status: "rascunho", revisao: 1, membros: { R9: { request_id: "R9", status_membro: "ativo" } } });
    await api.delete("/crm/projects/P9?cascade=true");
    expect(memory.read(`${T}/crm_projects/P9`)).toBeUndefined();
    expect(memory.read(`${T}/pd_requests/R9`)).toBeUndefined();
    expect(lote("LZ")).toMatchObject({ status: "cancelado", revisao: 2, cancelamento: { motivo: expect.stringMatching(/projeto excluído/i), por: "adm" } });
  });
});
