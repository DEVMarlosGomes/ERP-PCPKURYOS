import { cotacaoDaFormula, registroDeCambio, situacao, taxaDaCotacao, taxaEfetiva, textoCambio, validarSpread } from "./cambio";

// Mesmos casos de run_cambio_test.js do PCP, menos a cotação: desde COM-01 (22/10/2026) só o CRM calcula
// a taxa da cotação (sem congelamento); as cópias do PCP não usam taxaDaCotacao/congelar.
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
  test("COM-01: sem congelamento — aberto acompanha o dólar; aprovado usa a taxa da aprovação", () => {
    const r = registroDeCambio(cambio, { etapa: "orcamento_aprovado", documento: "Projeto 2026-031", agora: "2026-10-15T15:05:00Z", porNome: "Ana" });
    expect(r).toMatchObject({ tipo: "cambio", etapa: "orcamento_aprovado", taxa: 5.5972, spread_pct: 3, registrado_em: "2026-10-15T15:05:00Z" });
    const depois = { ...cambio, usd_brl: { ...cambio.usd_brl, venda: 6.1 } };
    // Enviado mas não aprovado: segue o dólar do dia (nada congela no envio).
    expect(taxaDaCotacao({ status: "enviado", cambio_congelado: { taxa: 5 } }, depois).origem).toBe("ao_vivo");
    expect(taxaDaCotacao({ negociacao_status: "aprovado", cambio_da_etapa: r }, depois)).toEqual({ taxa: 5.5972, origem: "aprovacao", em: "2026-10-15T15:05:00Z" });
    // Proposta antiga já aprovada com câmbio congelado mantém a taxa dela.
    expect(taxaDaCotacao({ negociacao_status: "aprovado", cambio_congelado: { taxa: 5.2, congeladoEm: "x" } }, depois).taxa).toBe(5.2);
    expect(registroDeCambio({}, { etapa: "envio", agora: "x" })).toBeNull();
  });
  test("COM-01: texto do histórico em horário de Brasília com taxa, spread e fonte", () => {
    const r = registroDeCambio(cambio, { etapa: "orcamento_aprovado", documento: "Projeto 2026-031", agora: "2026-10-22T17:05:00Z", porNome: "Ana" });
    expect(textoCambio(r)).toMatch(/^22\/10\/2026, 14:05 — Orçamento aprovado Projeto 2026-031 — US\$ 1,00 = R\$ 5,5972 \(comercial 5,4342 \+ spread 3%\) \(.*\) — registrado por Ana$/);
  });
});
