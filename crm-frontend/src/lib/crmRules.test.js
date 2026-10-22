import {
  planMove, movementEntry, isRegression, stageRequirements, missingQualification, missingProjectGate,
  findDuplicateClient, findDuplicateProject, findDuplicateSample, normalizeName, isAdmin,
  temContatoDecisor, formulaRegistrada,
} from "./crmRules";

const ADMIN = { role: "admin", name: "Ana ADM" };
const VEND = { role: "vendedor", name: "Bruno" };

describe("planMove: transições do ERP", () => {
  test("avanço permitido para o comercial", () => {
    expect(planMove({ entity: "client", from: "prospeccao", to: "qualificado", profile: VEND }).ok).toBe(true);
  });
  test("pular etapa é bloqueado para o comercial", () => {
    const r = planMove({ entity: "client", from: "prospeccao", to: "negociacao", profile: VEND });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/Transição não permitida/);
  });
  test("ADM move livre e fica marcado como administrativo", () => {
    const r = planMove({ entity: "project", from: "projeto_em_discussao", to: "pedido_aprovado", profile: ADMIN });
    expect(r.ok).toBe(true);
    expect(r.administrativo).toBe(true);
  });
  test("estágio inexistente e mesmo estágio são recusados", () => {
    expect(planMove({ entity: "client", from: "prospeccao", to: "xyz", profile: ADMIN }).status).toBe(400);
    expect(planMove({ entity: "client", from: "prospeccao", to: "prospeccao", profile: ADMIN }).ok).toBe(false);
  });
});

describe("voltar card exige justificativa (inclusive ADM)", () => {
  test("sem justificativa", () => {
    const r = planMove({ entity: "client", from: "qualificado", to: "prospeccao", profile: VEND });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/Justificativa obrigatória/);
  });
  test("justificativa curta demais", () => {
    expect(planMove({ entity: "project", from: "cotacao", to: "amostra_enviada", profile: ADMIN, justificativa: "ok" }).ok).toBe(false);
  });
  test("com justificativa vai para o histórico", () => {
    const plan = planMove({ entity: "project", from: "cotacao", to: "amostra_enviada", profile: VEND, justificativa: "Cliente pediu nova rodada de amostra" });
    expect(plan.ok).toBe(true);
    expect(plan.regression).toBe(true);
    const entry = movementEntry({ from: "cotacao", to: "amostra_enviada", profile: VEND, uid: "u2", at: "2026-10-13T12:00:00Z", plan });
    expect(entry.justificativa).toBe("Cliente pediu nova rodada de amostra");
    expect(entry.is_regression).toBe(true);
    expect(entry.de_label).toBe("Cotação");
  });
  test("retrabalho da amostra é retrocesso", () => {
    expect(isRegression("sample", "enviada", "retrabalho")).toBe(true);
  });
  test("arquivar/perder não é retrocesso, mas exige motivo", () => {
    expect(isRegression("project", "cotacao", "projeto_arquivado")).toBe(false);
    expect(planMove({ entity: "project", from: "cotacao", to: "projeto_arquivado", profile: VEND }).detail).toMatch(/arquivamento/);
    expect(planMove({ entity: "client", from: "negociacao", to: "cliente_perdido", profile: VEND, motivoPerda: "preco" }).ok).toBe(true);
    expect(planMove({ entity: "client", from: "negociacao", to: "cliente_perdido", profile: VEND, motivoPerda: "xpto" }).ok).toBe(false);
  });
  test("reativar cliente perdido é do ADM", () => {
    expect(planMove({ entity: "client", from: "cliente_perdido", to: "prospeccao", profile: VEND }).status).toBe(403);
    expect(planMove({ entity: "client", from: "cliente_perdido", to: "prospeccao", profile: ADMIN }).ok).toBe(true);
  });
});

describe("requisitos de avanço", () => {
  test("qualificação exige campos do ERP", () => {
    expect(missingQualification({})).toContain("Canal de origem");
    const ok = { canal_origem: "site", categoria_interesse: ["perfume"], temperatura_lead: "quente", responsavel_comercial: "Bruno", segmento: "varejo", contato_principal: { nome: "Ana", whatsapp: "11999" } };
    expect(missingQualification(ok)).toEqual([]);
    expect(missingProjectGate(ok)).toEqual(["Contato decisor", "Volume estimado mensal", "Fornecedor atual"]);
  });
  test("decisor é uma caixa no contato; a pergunta da Anvisa saiu", () => {
    const base = { canal_origem: "site", categoria_interesse: ["perfume"], temperatura_lead: "quente", responsavel_comercial: "Bruno", segmento: "varejo", volume_estimado_mensal: "5000", fornecedor_atual: { tem: false } };
    expect(missingProjectGate({ ...base, contato_principal: { nome: "Ana", whatsapp: "11999", decisor: true } })).toEqual([]);
    expect(missingProjectGate({ ...base, contato_principal: { nome: "Ana", whatsapp: "11999" }, contatos_adicionais: [{ nome: "Lia", decisor: true }] })).toEqual([]);
    expect(missingProjectGate({ ...base, contato_principal: { nome: "Ana", whatsapp: "11999" } })).toEqual(["Contato decisor"]);
    expect(temContatoDecisor({ contato_principal: { nome: "", decisor: true } })).toBe(false);
    expect(temContatoDecisor({ decisores: [{ nome: "Carla" }] })).toBe(true);
  });
  test("fórmula registrada só pela aprovação do cliente (químico do P&D saiu)", () => {
    expect(formulaRegistrada({ approved_by_client: true, approved_by_internal: false })).toBe(true);
    expect(formulaRegistrada({ approved_by_client: false, approved_by_internal: true })).toBe(false);
    expect(formulaRegistrada(null)).toBe(false);
  });
  test("Kickoff antes da cotação: amostra aprovada abre o Kickoff; cotação exige Kickoff aprovado", () => {
    expect(stageRequirements("project", {}, "kickoff", { hasApprovedSample: false })).toEqual(["Ao menos uma amostra aprovada pelo cliente"]);
    expect(stageRequirements("project", {}, "kickoff", { hasApprovedSample: true })).toEqual([]);
    expect(stageRequirements("project", {}, "cotacao", { hasApprovedSample: true, kickoffApproved: false })).toEqual(["Kickoff aprovado"]);
    expect(stageRequirements("project", {}, "cotacao", { hasApprovedSample: true, kickoffApproved: true })).toEqual([]);
  });
  test("amostra enviada não pula para a cotação: passa pelo Kickoff", () => {
    expect(planMove({ entity: "project", from: "amostra_enviada", to: "cotacao", profile: VEND }).ok).toBe(false);
    expect(planMove({ entity: "project", from: "amostra_enviada", to: "kickoff", profile: VEND }).ok).toBe(true);
    expect(planMove({ entity: "project", from: "kickoff", to: "cotacao", profile: VEND }).ok).toBe(true);
  });
});

describe("um card só nasce uma vez", () => {
  const clients = [{ id: "c1", nome_empresa: "Lumí Cosméticos LTDA", cnpj: "22.333.444/0001-55" }];
  test("cliente por CNPJ ou nome normalizado", () => {
    expect(findDuplicateClient(clients, { cnpj: "22333444000155" })?.id).toBe("c1");
    expect(findDuplicateClient(clients, { nome_empresa: "lumi cosmeticos ltda" })?.id).toBe("c1");
    expect(findDuplicateClient(clients, { nome_empresa: "Outra" })).toBeNull();
    expect(findDuplicateClient(clients, { cnpj: "22333444000155" }, "c1")).toBeNull();
  });
  test("projeto por cliente + nome; amostra por projeto + nome", () => {
    const projects = [{ id: "p1", cliente_id: "c1", nome_projeto: "Linha Verão" }];
    expect(findDuplicateProject(projects, "c1", "linha verao")?.id).toBe("p1");
    expect(findDuplicateProject(projects, "c2", "linha verao")).toBeNull();
    const samples = [{ id: "s1", projeto_id: "p1", nome_produto: "Body Splash" }];
    expect(findDuplicateSample(samples, "p1", "BODY  splash")?.id).toBe("s1");
  });
  test("normalização e papel", () => {
    expect(normalizeName("  Ação & Cia. ")).toBe("acao cia");
    expect(isAdmin({ role: "ADMIN" })).toBe(true);
    expect(isAdmin({ role: "vendedor" })).toBe(false);
  });
});
