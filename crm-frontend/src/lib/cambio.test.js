import { congelar, cotacaoDaFormula, situacao, taxaDaCotacao, taxaEfetiva, validarSpread } from "./cambio";

// Mesmos casos de run_cambio_test.js do PCP (as duas cópias precisam dar o mesmo resultado).
const cambio = { usd_brl: { compra: 5.4312, venda: 5.4342, fonte: "AwesomeAPI", atualizadoEm: "2026-10-15T15:00:00Z" }, spread_pct: 3 };

describe("dólar ao vivo + spread", () => {
  test("taxa efetiva e spread", () => {
    expect(taxaEfetiva(cambio)).toBe(5.5972);
    expect(taxaEfetiva({})).toBeNull();
    expect(validarSpread("2,5")).toEqual({ spread: 2.5 });
    expect(validarSpread(25).erro).toMatch(/entre 0 e 20/);
  });
  test("cotação velha depois de 1 h", () => {
    expect(situacao(cambio, "2026-10-15T15:20:00Z").velho).toBe(false);
    expect(situacao(cambio, "2026-10-15T16:30:00Z").velho).toBe(true);
  });
  test("fórmula: fixada > ao vivo > gravada > padrão", () => {
    expect(cotacaoDaFormula({ cotacao_usd: 6, cotacao_usd_fixa: true }, cambio)).toEqual({ taxa: 6, origem: "fixa" });
    expect(cotacaoDaFormula({ cotacao_usd: 6 }, cambio)).toEqual({ taxa: 5.5972, origem: "ao_vivo" });
    expect(cotacaoDaFormula({ cotacao_usd: 5.9 }, {})).toEqual({ taxa: 5.9, origem: "gravada" });
    expect(cotacaoDaFormula({}, null)).toEqual({ taxa: 6, origem: "padrao" });
  });
  test("cotação enviada congela o câmbio", () => {
    const c = congelar(cambio, "2026-10-15T15:05:00Z");
    expect(c).toMatchObject({ taxa: 5.5972, spread_pct: 3, congeladoEm: "2026-10-15T15:05:00Z" });
    const depois = { ...cambio, usd_brl: { ...cambio.usd_brl, venda: 6.1 } };
    expect(taxaDaCotacao({ cambio_congelado: c }, depois)).toEqual({ taxa: 5.5972, origem: "congelada", em: "2026-10-15T15:05:00Z" });
    expect(taxaDaCotacao({}, depois).origem).toBe("ao_vivo");
  });
});
