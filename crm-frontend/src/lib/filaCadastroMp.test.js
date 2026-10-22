import { chaveSolicitacaoMp, solicitacoesDeMpsNovas } from "./filaCadastroMp";

describe("fila de cadastro das MPs novas do P&D", () => {
  test("só itens com MP nova viram tarefa, com origem completa e chave fixa", () => {
    const fila = solicitacoesDeMpsNovas({
      request: { id: "R1", internal_code: "2026-031-A1-a", client_name: "Lumi" },
      formula: { id: "F2", version: 2 },
      itens: [
        { id: "I1", ingredient_name: "Cetiol LC" },
        { id: "I2", ingredient_name: "Fragrância (SCE963092)", inci: "Parfum", fornecedor: "Scentec", mp_nova: { nome: "Fragrância Shower Butter I", tipo: "MPES" } },
        { id: "I3", ingredient_name: "Manteiga de Quinoa", mp_nova: { nome: "", tipo: "??" } },
      ],
      projeto: { id: "P1", numero_projeto: "2026-031", nome_projeto: "Linha Banho" },
      agora: "t", autor: "Ana",
    });
    expect(Object.keys(fila)).toEqual([chaveSolicitacaoMp("F2", "I2"), chaveSolicitacaoMp("F2", "I3")]);
    expect(fila.F2__I2).toMatchObject({
      status: "PENDENTE_CADASTRO", tipo: "MPES", nome: "Fragrância Shower Butter I", inci: "Parfum", fornecedor: "Scentec",
      origem: { pdRequestId: "R1", formulaVersao: 2, projetoNumero: "2026-031", amostra: "2026-031-A1-a", cliente: "Lumi" },
    });
    expect(fila.F2__I3).toMatchObject({ tipo: "MPGR", nome: "Manteiga de Quinoa" });
  });
  test("sem fórmula não abre nada", () => {
    expect(solicitacoesDeMpsNovas({ itens: [{ id: "I", mp_nova: { nome: "X", tipo: "MPGR" } }] })).toEqual({});
  });
});
