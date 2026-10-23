import { describe, expect, test } from "vitest";
import { aplicarSobrescritas, coletorDeOrigem, preencherVazios, sobrescritasDaOrigem, variacaoEntreSkus } from "./kickoffAutopreenchimento";

describe("Kickoff vivo: completa os vazios da origem (RFC-001 §7)", () => {
  test("preenche só o vazio; o que alguém digitou fica", () => {
    const atual = { bloco0: { cliente: "Lumi", volume_gramatura: "" }, fechamento: { volume_primeiro_lote: "", responsavel_cliente: "Lia" } };
    const novo = { bloco0: { cliente: "LUMI COSMÉTICOS LTDA", volume_gramatura: "200 mL" }, fechamento: { volume_primeiro_lote: "3000", responsavel_cliente: "Maria" } };
    const r = preencherVazios(atual, novo);
    expect(r.questionario.bloco0).toEqual({ cliente: "Lumi", volume_gramatura: "200 mL" });
    expect(r.questionario.fechamento).toEqual({ volume_primeiro_lote: "3000", responsavel_cliente: "Lia" });
    expect(r.campos).toEqual(["bloco0.volume_gramatura", "fechamento.volume_primeiro_lote"]);
  });
  test("bloco validado/congelado não muda; componentes ficam de fora", () => {
    const r = preencherVazios({ bloco1: { viscosidade: "" }, bloco2: { componentes: [] } },
      { bloco1: { viscosidade: "baixa" }, bloco2: { componentes: [{ id: "x" }] } }, ["bloco1"]);
    expect(r.questionario.bloco1.viscosidade).toBe("");
    expect(r.questionario.bloco2.componentes).toEqual([]);
    expect(r.campos).toEqual([]);
  });
  test("lista vazia é vazio; origem vazia não apaga nada", () => {
    const r = preencherVazios({ bloco1: { cliente_fornece: [], formula: "do_cliente" } }, { bloco1: { cliente_fornece: ["formula_documento"], formula: "" } });
    expect(r.questionario.bloco1).toEqual({ cliente_fornece: ["formula_documento"], formula: "do_cliente" });
  });
});

describe("origem e sobrescrita (KO-02)", () => {
  test("coletor anota a fonte do primeiro valor não vazio; preencher leva a origem junto", () => {
    const { de, origem } = coletorDeOrigem("2026-10-23T10:00:00Z");
    expect(de("bloco0", "volume_gramatura", ["", "Proposta"], ["200 mL", "Fórmula (P&D)"])).toBe("200 mL");
    expect(de("bloco0", "detentor_registro", [null, "Projeto (CRM)"])).toBe("");
    expect(origem).toEqual({ bloco0: { volume_gramatura: { fonte: "Fórmula (P&D)", atualizado_em: "2026-10-23T10:00:00Z", sobrescrito: false } } });
    const { questionario } = preencherVazios({ bloco0: { volume_gramatura: "" } }, { bloco0: { volume_gramatura: "200 mL" }, origem });
    expect(questionario.origem.bloco0.volume_gramatura.fonte).toBe("Fórmula (P&D)");
    // Valor que alguém digitou não ganha selo de origem.
    expect(preencherVazios({ bloco0: { volume_gramatura: "250 mL" } }, { bloco0: { volume_gramatura: "200 mL" }, origem }).questionario.origem).toBeUndefined();
  });
  test("mudar o que veio da origem exige motivo; com motivo, fica marcado e não pede de novo", () => {
    const antes = { bloco0: { volume_gramatura: "200 mL", cliente: "Lumi" },
      origem: { bloco0: { volume_gramatura: { fonte: "Fórmula (P&D)", sobrescrito: false }, cliente: { fonte: "Cliente (CRM)", sobrescrito: false } } } };
    const depois = { ...antes, bloco0: { volume_gramatura: "250 mL", cliente: "Lumi" } };
    const campos = sobrescritasDaOrigem(antes, depois);
    expect(campos).toEqual(["bloco0.volume_gramatura"]);
    expect(aplicarSobrescritas(depois, campos, { "bloco0.volume_gramatura": "ok" }).faltam).toEqual([{ campo: "bloco0.volume_gramatura", fonte: "Fórmula (P&D)" }]);
    const r = aplicarSobrescritas(depois, campos, { "bloco0.volume_gramatura": "Cliente pediu frasco de 250" }, { por: "u1", porNome: "Carla", em: "t" });
    expect(r.faltam).toEqual([]);
    expect(r.questionario.origem.bloco0.volume_gramatura).toMatchObject({ sobrescrito: true, motivo: "Cliente pediu frasco de 250", sobrescrito_por_nome: "Carla" });
    expect(sobrescritasDaOrigem(r.questionario, { ...r.questionario, bloco0: { volume_gramatura: "300 mL", cliente: "Lumi" } })).toEqual([]);
  });
  test("variações aprovadas: nº de SKUs, o que varia e outra categoria", () => {
    const s1 = { categoria: "perfumaria", parametro_variacao: "fragrancia" };
    const s2 = { categoria: "capilar", parametro_variacao: "concentracao" };
    const v = variacaoEntreSkus([
      { sample: s1, variation: { referencia_fragrancia: "Cítrico", cor: "azul" } },
      { sample: s1, variation: { referencia_fragrancia: "Floral", cor: "azul" } },
      { sample: s2, variation: { referencia_fragrancia: "Floral" } },
    ], "perfumaria");
    expect(v).toEqual({ numero_skus: 3, varia_entre_skus: ["fragrancia", "outro"], varia_entre_skus_outro: "concentracao",
      variacao_outra_categoria: "sim", variacao_outra_categoria_qual: "capilar" });
    expect(variacaoEntreSkus([{ sample: s1, variation: {} }], "perfumaria")).toMatchObject({ numero_skus: 1, varia_entre_skus: [], variacao_outra_categoria: "nao" });
    expect(variacaoEntreSkus([])).toMatchObject({ numero_skus: 0, variacao_outra_categoria: "" });
  });
});
