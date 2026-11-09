import { describe, test, expect } from "vitest";
import { planoVinculoAmostrasPd, statusPdDoCardLegado } from "./vinculoAmostrasPd";

// Caso real de 08/11/2026: variações migradas do Mongo sem pd_request_id/pd_card_id gravados,
// mas com solicitação (crm_variacao_id) ou card legado (amostra_variacao_id) já existentes.
const amostra = (variacoes) => ({ id: "A1", variacoes });

describe("planoVinculoAmostrasPd", () => {
  test("variação já ligada fica como está", () => {
    const plano = planoVinculoAmostrasPd({
      samples: [amostra([{ id: "v1", pd_request_id: "r1", pd_card_id: "c1" }])],
      requests: [{ id: "r1", crm_variacao_id: "v1", status: "APPROVED" }],
      cards: [{ id: "c1", pd_request_id: "r1" }],
    });
    expect(plano).toEqual([]);
  });

  test("solicitação existente pelo crm_variacao_id: só liga, não cria", () => {
    const plano = planoVinculoAmostrasPd({
      samples: [amostra([{ id: "v1" }])],
      requests: [{ id: "r1", crm_sample_id: "A1", crm_variacao_id: "v1", status: "WAITING_APPROVAL" }],
      cards: [{ id: "c1", pd_request_id: "r1", amostra_variacao_id: "v1" }],
    });
    expect(plano).toEqual([{ acao: "ligar", sampleId: "A1", variacaoId: "v1", requestId: "r1", cardId: "c1", status: "WAITING_APPROVAL" }]);
  });

  test("solicitação existente sem card: liga e pede card novo só para ela", () => {
    const plano = planoVinculoAmostrasPd({
      samples: [amostra([{ id: "v1" }])],
      requests: [{ id: "r1", crm_variacao_id: "v1", status: "APPROVED" }],
      cards: [],
    });
    expect(plano[0]).toMatchObject({ acao: "ligar", requestId: "r1", cardId: null });
  });

  test("card legado sem solicitação: cria a solicitação no status do card e reaproveita o card", () => {
    const plano = planoVinculoAmostrasPd({
      samples: [amostra([{ id: "v1" }])],
      requests: [],
      cards: [{ id: "c9", amostra_id: "A1", amostra_variacao_id: "v1", status_pd: "aguardando_aprovacao" }],
    });
    expect(plano).toEqual([{ acao: "criar_para_card", sampleId: "A1", variacaoId: "v1", cardId: "c9", status: "WAITING_APPROVAL" }]);
  });

  test("nada no P&D: cria o fluxo completo", () => {
    const plano = planoVinculoAmostrasPd({ samples: [amostra([{ id: "v1" }])], requests: [], cards: [] });
    expect(plano).toEqual([{ acao: "criar", sampleId: "A1", variacaoId: "v1" }]);
  });

  test("pd_request_id apontando para solicitação apagada conta como faltando", () => {
    const plano = planoVinculoAmostrasPd({
      samples: [amostra([{ id: "v1", pd_request_id: "sumiu", pd_card_id: "c-sumiu" }])],
      requests: [{ id: "r1", crm_variacao_id: "v1", status: "IN_PROGRESS" }],
      cards: [],
    });
    expect(plano[0]).toMatchObject({ acao: "ligar", requestId: "r1" });
  });

  test("várias solicitações da mesma variação: fica a mais avançada, cancelada nunca", () => {
    const plano = planoVinculoAmostrasPd({
      samples: [amostra([{ id: "v1" }])],
      requests: [
        { id: "aberta", crm_variacao_id: "v1", status: "OPEN", updated_at: "2026-11-08" },
        { id: "aprovada", crm_variacao_id: "v1", status: "APPROVED", updated_at: "2026-08-01" },
        { id: "cancelada", crm_variacao_id: "v1", status: "CANCELLED", updated_at: "2026-11-09" },
      ],
      cards: [],
    });
    expect(plano[0].requestId).toBe("aprovada");
  });
});

test("statusPdDoCardLegado traduz o status do card antigo", () => {
  expect(statusPdDoCardLegado({ status_pd: "em_desenvolvimento" })).toBe("IN_PROGRESS");
  expect(statusPdDoCardLegado({ status_pd: "aguardando_aprovacao" })).toBe("WAITING_APPROVAL");
  expect(statusPdDoCardLegado({ status_pd: "desconhecido" })).toBe("OPEN");
  expect(statusPdDoCardLegado({})).toBe("OPEN");
});
