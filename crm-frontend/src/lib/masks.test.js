import { describe, expect, it } from "vitest";
import { fmtPriceDisplay, fmtVolumeDisplay, mascaraMilhar, mascaraMoeda, parsePriceInput, parseVolumeInput, seedPriceDisplay, seedVolumeDisplay } from "@/lib/masks";

const n = (s) => s.replace(/ /g, " ");

describe("máscara de moeda da direita (CRM-03, D-13)", () => {
  it("digitar 1550 mostra 15,50, dígito a dígito", () => {
    let campo = "";
    for (const ch of "1550") campo = mascaraMoeda(campo + ch);
    expect(campo).toBe("15,50");
    expect(parsePriceInput(campo)).toBe(15.5);
  });

  it("1, 15, 155000, colar e apagar até vazio", () => {
    expect(mascaraMoeda("1")).toBe("0,01");
    expect(mascaraMoeda("15")).toBe("0,15");
    expect(mascaraMoeda("155000")).toBe("1.550,00");
    expect(mascaraMoeda("1.234,56")).toBe("1.234,56");
    expect(mascaraMoeda("R$ 12,3x")).toBe("1,23");
    expect(mascaraMoeda("0,0")).toBe("");
    expect(mascaraMoeda("")).toBe("");
    // apagar o último dígito de "15,50" → "1,55"
    expect(mascaraMoeda("15,5")).toBe("1,55");
  });

  it("valor salvo (número) abre formatado e volta igual", () => {
    expect(fmtPriceDisplay(15.5)).toBe("15,50");
    expect(fmtPriceDisplay(1550)).toBe("1.550,00");
    expect(parsePriceInput(fmtPriceDisplay(15.5))).toBe(15.5);
    expect(parsePriceInput(15.5)).toBe(15.5);
    expect(fmtPriceDisplay("")).toBe("");
  });

  it("campo vazio nunca vira zero", () => {
    expect(seedPriceDisplay("")).toBe("");
    expect(seedPriceDisplay(undefined)).toBe("");
    expect(parsePriceInput("")).toBeNull();
  });
});

describe("máscara de milhar do volume (CRM-03)", () => {
  it("digitar 3000 mostra 3.000; vazio fica vazio", () => {
    let campo = "";
    for (const ch of "3000") campo = mascaraMilhar(campo + ch);
    expect(n(campo)).toBe("3.000");
    expect(parseVolumeInput(campo)).toBe(3000);
    expect(mascaraMilhar("")).toBe("");
    expect(mascaraMilhar("000")).toBe("");
    expect(seedVolumeDisplay(null)).toBe("");
  });

  it("valor salvo (número) abre formatado", () => {
    expect(fmtVolumeDisplay(3000)).toBe("3.000");
    expect(parseVolumeInput(3000)).toBe(3000);
  });
});
