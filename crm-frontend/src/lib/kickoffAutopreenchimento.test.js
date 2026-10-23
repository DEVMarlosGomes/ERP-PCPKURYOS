import { describe, expect, test } from "vitest";
import { preencherVazios } from "./kickoffAutopreenchimento";

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
