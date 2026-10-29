import {
  MARCA_APROVADA, MARCA_EM_DESENVOLVIMENTO, STATUS_CANCELADO, STATUS_PENDENTE, chaveSolicitacaoMp, chaveSolicitacaoPorNome, compactarUpdates,
  daSolicitacaoPd, planoDaFila, retiradaDoItem, solicitacoesDeMpsNovas, tipoMpNovaPeloContexto,
} from "./filaCadastroMp";

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

describe("PD-03: solicitação nasce ao salvar, chave pelo nome, cancela sem apagar", () => {
  const B = "solicitacoes_cadastro_material";
  const req = { id: "R1", internal_code: "2026-040-A1-a", client_name: "Lumi" };
  const f1 = { id: "F1", version: 1 };
  const f2 = { id: "F2", version: 2 };
  const item = (id, nome, formula_id = "F1", extra = {}) => ({ id, formula_id, ingredient_name: nome, mp_nova: { nome, tipo: "MPGR" }, ...extra });
  const aplicar = (estado, updates) => {
    const out = JSON.parse(JSON.stringify(estado));
    for (const [p, v] of Object.entries(updates)) {
      const partes = p.split("/").slice(1);
      let o = out;
      partes.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; });
      o[partes[partes.length - 1]] = v;
    }
    return out;
  };

  test("chave fixa pelo nome normalizado; tipo pelo contexto", () => {
    expect(chaveSolicitacaoPorNome("Manteiga de Quinoa LH0348")).toBe("NOME__MANTEIGA_DE_QUINOA_LH0348");
    expect(chaveSolicitacaoPorNome("  manteiga  de quinoa lh-0348 ")).toBe("NOME__MANTEIGA_DE_QUINOA_LH_0348");
    expect(chaveSolicitacaoPorNome("Ácido Hialurônico 1%")).toBe("NOME__ACIDO_HIALURONICO_1%");
    expect(chaveSolicitacaoPorNome("")).toBe("");
    expect(tipoMpNovaPeloContexto({ ingredient_name: "Fragrância Shower Butter" })).toBe("MPES");
    expect(tipoMpNovaPeloContexto({ ingredient_name: "Óleo X", inci: "Parfum" })).toBe("MPES");
    expect(tipoMpNovaPeloContexto({ ingredient_name: "Manteiga de Quinoa" })).toBe("MPGR");
  });

  test("salvar cria PENDENTE_CADASTRO 'amostra em desenvolvimento'; salvar de novo só atualiza a origem", () => {
    const u1 = planoDaFila({ registrar: [{ item: item("I1", "Manteiga de Quinoa", "F1", { inci: "Quinoa Oil" }), formula: f1, request: req }], agora: "t1", autor: "Ana" });
    expect(Object.keys(u1)).toEqual([`${B}/NOME__MANTEIGA_DE_QUINOA`]);
    const reg = u1[`${B}/NOME__MANTEIGA_DE_QUINOA`];
    expect(reg).toMatchObject({ status: STATUS_PENDENTE, marca: MARCA_EM_DESENVOLVIMENTO, amostra_em_desenvolvimento: true, tipo: "MPGR", inci: "Quinoa Oil",
      origem: { pdRequestId: "R1", formulaId: "F1", itemId: "I1", amostra: "2026-040-A1-a" }, criadoPor: "Ana" });
    expect(reg.origens.F1__I1).toMatchObject({ ativa: true, registradaEm: "t1" });
    const estado = aplicar({}, u1);
    const u2 = planoDaFila({ existentes: estado, registrar: [{ item: item("I1", "Manteiga de Quinoa"), formula: f1, request: req }], agora: "t2" });
    expect(Object.keys(u2).every((p) => p.startsWith(`${B}/NOME__MANTEIGA_DE_QUINOA/`))).toBe(true);
    expect(u2[`${B}/NOME__MANTEIGA_DE_QUINOA/status`]).toBeUndefined();
  });

  test("nova versão: copia para a v2 e retira a v1 no mesmo plano — continua pendente", () => {
    const estado = aplicar({}, planoDaFila({ registrar: [{ item: item("I1", "Manteiga de Quinoa"), formula: f1, request: req }], agora: "t1" }));
    const u = planoDaFila({ existentes: estado, registrar: [{ item: item("C1", "Manteiga de Quinoa", "F2"), formula: f2, request: req }],
      retirar: [retiradaDoItem(item("I1", "Manteiga de Quinoa"), "Versão v1 substituída pela v2")], agora: "t2" });
    const depois = aplicar(estado, u).NOME__MANTEIGA_DE_QUINOA;
    expect(depois.status).toBe(STATUS_PENDENTE);
    expect(depois.origens.F1__I1).toMatchObject({ ativa: false, motivo: "Versão v1 substituída pela v2" });
    expect(depois.origens.F2__C1.ativa).toBe(true);
  });

  test("sem origem ativa a pendente vira CANCELADO (não apaga); marcar de novo reabre; cadastrada não é cancelada", () => {
    const estado = aplicar({}, planoDaFila({ registrar: [{ item: item("I1", "Manteiga de Quinoa"), formula: f1, request: req }], agora: "t1" }));
    const cancelado = aplicar(estado, planoDaFila({ existentes: estado, retirar: [retiradaDoItem(item("I1", "Manteiga de Quinoa"), "Ingrediente removido da fórmula")], agora: "t2" }));
    expect(cancelado.NOME__MANTEIGA_DE_QUINOA).toMatchObject({ status: STATUS_CANCELADO, canceladoEm: "t2", motivoCancelamento: "Ingrediente removido da fórmula", nome: "Manteiga de Quinoa" });
    const reaberto = aplicar(cancelado, planoDaFila({ existentes: cancelado, registrar: [{ item: item("I9", "Manteiga de Quinoa"), formula: f1, request: req }], agora: "t3" }));
    expect(reaberto.NOME__MANTEIGA_DE_QUINOA).toMatchObject({ status: STATUS_PENDENTE, reabertaEm: "t3" });
    const cadastrada = { NOME__MANTEIGA_DE_QUINOA: { ...estado.NOME__MANTEIGA_DE_QUINOA, status: "CADASTRADO", mpCodigo: "MPGR-00200" } };
    const u = planoDaFila({ existentes: cadastrada, retirar: [retiradaDoItem(item("I1", "Manteiga de Quinoa"), "removido")], agora: "t4" });
    expect(u[`${B}/NOME__MANTEIGA_DE_QUINOA/status`]).toBeUndefined();
  });

  test("aprovação do cliente: marca 'aprovada pelo cliente'; sem solicitação (item antigo) cria uma já aprovada; idempotente", () => {
    const u = planoDaFila({ aprovar: [{ item: item("I1", "Fragrância Floral", "F1", { mp_nova: { nome: "Fragrância Floral", tipo: "MPES" } }), formula: f1, request: req, projeto: { numero_projeto: "2026-040" } }], agora: "t5" });
    const reg = u[`${B}/NOME__FRAGRANCIA_FLORAL`];
    expect(reg).toMatchObject({ status: STATUS_PENDENTE, tipo: "MPES", marca: MARCA_APROVADA, amostra_em_desenvolvimento: false, aprovadaPeloClienteEm: "t5", origem: { projetoNumero: "2026-040" } });
    const estado = aplicar({}, u);
    const de_novo = aplicar(estado, planoDaFila({ existentes: estado, aprovar: [{ item: item("I1", "Fragrância Floral"), formula: f1, request: req }], agora: "t6" }));
    expect(Object.keys(de_novo)).toEqual(["NOME__FRAGRANCIA_FLORAL"]);
  });

  test("compactar: caminho e descendente no mesmo update viram um valor só", () => {
    expect(compactarUpdates({ "a/b": { x: 1 }, "a/b/y": 2, "a/c": 3 })).toEqual({ "a/b": { x: 1, y: 2 }, "a/c": 3 });
  });

  test("a fila desta amostra inclui solicitação compartilhada com outra", () => {
    expect(daSolicitacaoPd({ origem: { pdRequestId: "R2" }, origens: { a: { pdRequestId: "R2" }, b: { pdRequestId: "R1" } } }, "R1")).toBe(true);
    expect(daSolicitacaoPd({ origem: { pdRequestId: "R2" } }, "R1")).toBe(false);
  });
});
