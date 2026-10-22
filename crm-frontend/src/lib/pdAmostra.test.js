import {
  BASE_CALCULO, VOLUME_AMOSTRA_PADRAO, amostraDaVersaoFaltando, camposDePreco, formatarQuantidade, precoBrlKg, precoUsd,
  quantidadeNaEscala, unidadeValida, volumeEmKg,
} from "./pdAmostra";

describe("amostra do P&D: 60 na unidade escolhida, base 1000", () => {
  test("padrões do plano", () => {
    expect(VOLUME_AMOSTRA_PADRAO).toBe(60);
    expect(BASE_CALCULO).toBe(1000);
  });

  test("volume em kg respeita a unidade (60 g não é 60 kg)", () => {
    expect(volumeEmKg(60, "g")).toBeCloseTo(0.06);
    expect(volumeEmKg(60, "mL")).toBeCloseTo(0.06);
    expect(volumeEmKg(2, "L")).toBe(2);
    expect(volumeEmKg(2, "kg")).toBe(2);
    expect(volumeEmKg(60, "xpto")).toBeCloseTo(0.06);
    expect(unidadeValida(undefined)).toBe("mL");
  });

  test("quantidade na amostra e na base 1000 (Manteiga de Banho, Manteiga de Quinoa 40,5%)", () => {
    expect(quantidadeNaEscala(40.5, 60)).toBeCloseTo(24.3);
    expect(quantidadeNaEscala(40.5, BASE_CALCULO)).toBeCloseTo(405);
    expect(quantidadeNaEscala(0.05, 60)).toBeCloseTo(0.03);
  });

  test("formatação da massa a pesar", () => {
    expect(formatarQuantidade(24.3, "g")).toBe("24,30 g");
    expect(formatarQuantidade(0.03, "mL")).toBe("30 mg");
    expect(formatarQuantidade(1.2, "g")).toBe("1,200 g");
    expect(formatarQuantidade(405, "kg")).toBe("405,000 kg");
    expect(formatarQuantidade(0.5, "L")).toBe("500,00 g");
    expect(formatarQuantidade(0, "g")).toBe("0 g");
  });

  test("R$ na coluna própria: US$ convertido pela cotação, senão o R$ digitado", () => {
    expect(precoBrlKg({ price_usd: 10, price_per_kg: 1 }, 5.5)).toBeCloseTo(55);
    expect(precoBrlKg({ price_usd: "", price_per_kg: 32 }, 5.5)).toBe(32);
    expect(precoBrlKg({ price_usd: null, price_per_kg: "12.5" }, 5.5)).toBe(12.5);
    expect(precoBrlKg({ price_usd: 2 }, 0)).toBe(12);
    expect(precoUsd({ price_usd: "abc" })).toBeNull();
  });

  test("amostra da versão nasce uma vez ao finalizar a manipulação", () => {
    expect(amostraDaVersaoFaltando([], 1)).toBe(true);
    expect(amostraDaVersaoFaltando([{ formula_version: 1 }], 1)).toBe(false);
    expect(amostraDaVersaoFaltando([{ formula_version: 1 }], 2)).toBe(true);
    expect(amostraDaVersaoFaltando([{}], 1)).toBe(false);
  });

  test("preço do catálogo cai no campo da moeda dele", () => {
    expect(camposDePreco(4.2, "USD")).toEqual({ price_per_kg: "", price_usd: "4.2" });
    expect(camposDePreco(31, "BRL")).toEqual({ price_per_kg: "31", price_usd: "" });
    expect(camposDePreco(null, undefined)).toEqual({ price_per_kg: "", price_usd: "" });
  });
});
