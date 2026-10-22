import { describe, expect, test } from "vitest";
import { erroNaoFecha, fechamentoFormula, itensDaVariante, pendenciasDoLote, textoFechamento } from "./fechamentoFormula";

const itens = (...ps) => ps.map((p, i) => ({ ingredient_name: `MP${i}`, percentage: p }));

describe("fechamento de 100% (AMO-03)", () => {
  test("99,5% falta 0,5%", () => {
    const r = fechamentoFormula(itens(60, 39.5));
    expect(r.ok).toBe(false);
    expect(textoFechamento(r)).toBe("Soma 99,5% — falta 0,5%.");
  });
  test("100,4% excede 0,4%", () => {
    const r = fechamentoFormula(itens(60, 40.4));
    expect(r.ok).toBe(false);
    expect(textoFechamento(r)).toBe("Soma 100,4% — excede 0,4%.");
  });
  test("100,0004% está dentro da tolerância de 0,001", () => {
    expect(fechamentoFormula(itens(60, 40.0004)).ok).toBe(true);
    expect(fechamentoFormula(itens(60, 40.002)).ok).toBe(false);
  });
  test("muitos itens com 3 casas não acumulam erro de ponto flutuante", () => {
    // 0.1 + 0.2 em double dá 0.30000000000000004; 1000 itens de 0.1 somam 100 exatos aqui.
    expect(fechamentoFormula(Array.from({ length: 1000 }, () => ({ percentage: 0.1 }))).ok).toBe(true);
    expect(fechamentoFormula([{ percentage: "40,5" }, { percentage: "59.5" }]).ok).toBe(true);
  });
  test("variante: troca a fragrância pelo % da substituição; diferença não é completada sozinha (Q16)", () => {
    const base = [
      { ingredient_name: "Álcool", percentage: 80 },
      { ingredient_name: "Água", percentage: 18 },
      { ingredient_name: "Fragrância A", percentage: 2 },
    ];
    const v = itensDaVariante(base, [{ ingredient_name_base: "Fragrância A", ingredient_name: "Fragrância B", percentage: 2.5 }]);
    expect(v.map((i) => i.ingredient_name)).toEqual(["Álcool", "Água", "Fragrância B"]);
    expect(v[1].percentage).toBe(18); // a água não absorve a diferença
    const p = pendenciasDoLote({ nome: "Lote Jun", variantes: [
      { nome: "Rosa", overrides: [{ ingredient_name_base: "Fragrância A", ingredient_name: "Fragrância B", percentage: 2.5 }] },
      { nome: "Base", overrides: [] },
    ] }, base);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ lote: "Lote Jun", variante: "Rosa", ok: false });
    expect(textoFechamento(p[0])).toBe("Soma 100,5% — excede 0,5%.");
  });
  test("erro estruturado diz o que falta e que a correção é da Química", () => {
    const e = erroNaoFecha({ formula: { nome: "v2", ...fechamentoFormula(itens(99)) }, pendencias: [], responsavel: "Yasmim" });
    expect(e.codigo).toBe("FORMULA_NAO_FECHA_100");
    expect(e.linhas).toEqual(["Fórmula v2: Soma 99% — falta 1%."]);
    expect(e.message).toContain("Química (Yasmim)");
  });
});
