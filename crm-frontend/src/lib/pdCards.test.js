import { bloqueioPdComCliente, rotaDeBancada, cardParaSolicitacao, cardsVisiveis, idCardDaSolicitacao, statusPeloRetornoDoCliente } from "./pdCards";

describe("retorno do cliente no CRM3 atualiza o P&D", () => {
  test("esperando o cliente: aprovou → Aprovado; retrabalho/reprovou → Retrabalho", () => {
    expect(statusPeloRetornoDoCliente("WAITING_APPROVAL", "aprovada")).toBe("APPROVED");
    expect(statusPeloRetornoDoCliente("WAITING_APPROVAL", "retrabalho")).toBe("REJECTED");
    // reenvio depois do retrabalho: só vale retorno registrado depois do envio
    const reenvio = { aguardandoDesde: "2026-10-16T10:00:00Z" };
    expect(statusPeloRetornoDoCliente("WAITING_APPROVAL", "retrabalho", { ...reenvio, resultadoEm: "2026-10-14T09:00:00Z" })).toBeNull();
    expect(statusPeloRetornoDoCliente("WAITING_APPROVAL", "aprovada", reenvio)).toBeNull();
    expect(statusPeloRetornoDoCliente("WAITING_APPROVAL", "aprovada", { ...reenvio, resultadoEm: "2026-10-17T08:00:00Z" })).toBe("APPROVED");
    expect(statusPeloRetornoDoCliente("WAITING_APPROVAL", "reprovada")).toBe("REJECTED");
    expect(statusPeloRetornoDoCliente("WAITING_APPROVAL", "enviada")).toBeNull();
  });
  test("fora da espera do cliente o retorno não mexe no P&D", () => {
    expect(statusPeloRetornoDoCliente("IN_PROGRESS", "aprovada")).toBeNull();
    expect(statusPeloRetornoDoCliente("APPROVED", "retrabalho")).toBeNull();
    expect(statusPeloRetornoDoCliente(undefined, "aprovada")).toBeNull();
  });
});

describe("P&D não mexe enquanto a amostra está com o cliente", () => {
  test("com o cliente, aprovada ou concluída: travado; retrabalho e bancada: livre", () => {
    expect(bloqueioPdComCliente("WAITING_APPROVAL")).toMatch(/com o cliente/);
    expect(bloqueioPdComCliente("APPROVED")).toMatch(/Kickoff/);
    expect(bloqueioPdComCliente("COMPLETED")).toMatch(/Kickoff/);
    for (const s of ["OPEN", "IN_PROGRESS", "IN_TESTS", "REJECTED", undefined]) expect(bloqueioPdComCliente(s)).toBeNull();
  });
  test("rotas de bancada cobertas pela trava; retorno do cliente e leitura ficam livres", () => {
    expect(rotaDeBancada("POST", "/pd/developments/D1/formulas")).toEqual({ tipo: "development", id: "D1" });
    expect(rotaDeBancada("POST", "/pd/developments/D1/samples")).toEqual({ tipo: "development", id: "D1" });
    expect(rotaDeBancada("PUT", "/pd/developments/D1/sample-batches/B1")).toEqual({ tipo: "development", id: "D1" });
    expect(rotaDeBancada("POST", "/pd/formulas/F1/items")).toEqual({ tipo: "formula", id: "F1" });
    expect(rotaDeBancada("POST", "/pd/formulas/F1/new-version")).toEqual({ tipo: "formula", id: "F1" });
    expect(rotaDeBancada("POST", "/pd/formulas/F1/import-into/D9")).toEqual({ tipo: "development", id: "D9" });
    expect(rotaDeBancada("PUT", "/pd/formulas/F1")).toEqual({ tipo: "formula", id: "F1" });
    expect(rotaDeBancada("DELETE", "/pd/formula-items/I1")).toEqual({ tipo: "item", id: "I1" });
    expect(rotaDeBancada("PUT", "/pd/formula-phases/P1")).toEqual({ tipo: "phase", id: "P1" });
    expect(rotaDeBancada("PUT", "/pd/samples/S1")).toBeNull();
    expect(rotaDeBancada("GET", "/pd/formulas/F1/items")).toBeNull();
    expect(rotaDeBancada("POST", "/pd/developments/D1/documents")).toBeNull();
  });
  test("ADM passa (avanço administrativo)", () => {
    expect(bloqueioPdComCliente("WAITING_APPROVAL", { admin: true })).toBeNull();
  });
});

describe("cards do quadro", () => {
  test("solicitação sem card ganha card de id fixo com os dados do CRM", () => {
    const req = { id: "R9", title: "Body Splash Linha Superior", client_name: "Febella Beauty", status: "WAITING_APPROVAL", crm_sample_id: "S1", crm_variacao_id: "V2" };
    const amostra = { id: "S1", projeto_id: "P1", numero_amostra: "2026-1004", variacoes: [{ id: "V2", codigo: "2026-1004-b" }] };
    const card = cardParaSolicitacao(req, { amostra, projeto: { nome_projeto: "Linha Superior" }, cardStatus: "aguardando_aprovacao", agora: "t" });
    expect(card).toMatchObject({ id: idCardDaSolicitacao("R9"), pd_request_id: "R9", cliente_nome: "Febella Beauty", projeto_id: "P1", projeto_nome: "Linha Superior", amostra_variacao_id: "V2", amostra_numero: "2026-1004-b", status_pd: "aguardando_aprovacao" });
  });
  test("amostra inexistente não inventa vínculo; nome e código vêm dos campos reais", () => {
    const req = { id: "R8", commercial_name: "Óleo de Banho 100ml", project_name: "Óleo", internal_code: "2026-1030-a", crm_sample_id: "X", linked_pd_card_id: "db1a" };
    const card = cardParaSolicitacao(req, { amostra: null, projeto: null, cardStatus: "em_desenvolvimento", agora: "t" });
    expect(card.amostra_id).toBeNull();
    expect(card.amostra_variacao_id).toBeNull();
    expect(card).toMatchObject({ id: "db1a", nome_produto: "Óleo de Banho 100ml", amostra_numero: "2026-1030-a" });
  });
  test("card sem solicitação sai do quadro", () => {
    expect(cardsVisiveis([{ pd_request_id: "R1" }, { pd_request_id: "SUMIU" }, null], new Set(["R1"]))).toEqual([{ pd_request_id: "R1" }]);
  });
});
