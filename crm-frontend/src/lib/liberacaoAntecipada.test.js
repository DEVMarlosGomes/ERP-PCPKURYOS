import { describe, expect, test } from "vitest";
import { aplicarDecisao, novaSolicitacao, podeSolicitar, textoDecisao, textoEstabilidade, validarDecisao } from "./liberacaoAntecipada";

const D24 = [{ day_offset: 1 }];
const AGORA = Date.parse("2026-10-24T15:00:00Z");

describe("liberação antecipada ao Comercial (24/10/2026)", () => {
  test("PD-05: pede com a manipulação registrada (Em Testes), sem leitura; com o D48h é a entrega normal", () => {
    expect(podeSolicitar({ status: "IN_TESTS", leituras: D24 })).toEqual({ ok: true, motivo: "" });
    expect(podeSolicitar({ status: "IN_TESTS", leituras: [] })).toEqual({ ok: true, motivo: "" });
    expect(podeSolicitar({ status: "IN_TESTS" }).ok).toBe(true);
    expect(podeSolicitar({ status: "IN_PROGRESS", leituras: [] }).motivo).toMatch(/Finalize a manipulação/);
    expect(podeSolicitar({ status: "IN_TESTS", leituras: [...D24, { day_offset: 2 }] }).motivo).toMatch(/Entregar ao Comercial/);
    expect(podeSolicitar({ status: "IN_PROGRESS", leituras: D24 }).ok).toBe(false);
    expect(podeSolicitar({ status: "IN_TESTS", leituras: D24, liberacao: { status: "aguardando_diretoria" } }).motivo).toMatch(/aguardando/);
  });
  test("pedido exige motivo e registra as leituras feitas", () => {
    expect(novaSolicitacao({ motivo: "curto" }).ok).toBe(false);
    const r = novaSolicitacao({ motivo: "Cliente apresenta na feira", por: "u1", porNome: "Paulo", em: "t", leituras: D24 });
    expect(r.registro).toMatchObject({ status: "aguardando_diretoria", leituras_no_pedido: ["D24h"], sem_leitura: false, solicitada_por_nome: "Paulo", decisao: null });
    expect(textoEstabilidade(r.registro)).toBe("D24h");
    const sem = novaSolicitacao({ motivo: "Cliente apresenta na feira", por: "u1", porNome: "Paulo", em: "t", leituras: [] });
    expect(sem.registro).toMatchObject({ leituras_no_pedido: [], sem_leitura: true });
    expect(textoEstabilidade(sem.registro)).toBe("sem leitura de estabilidade");
  });
  test("decisão: quem, data/hora (nunca no futuro) e justificativa", () => {
    const base = { decisao: "aprovada", justificativa: "D24h estável, cliente com feira", agoraMs: AGORA, por: "adm", porNome: "Ana ADM" };
    expect(validarDecisao({ ...base, dataHora: "2026-10-24T18:00:00Z" }).erros).toEqual(["A data e o horário da decisão não podem estar no futuro."]);
    expect(validarDecisao({ ...base, justificativa: "ok", dataHora: "2026-10-24T14:00:00Z" }).ok).toBe(false);
    expect(validarDecisao({ ...base, decisao: "talvez", dataHora: "2026-10-24T14:00:00Z" }).ok).toBe(false);
    const v = validarDecisao({ ...base, dataHora: "2026-10-24T14:30:00Z" });
    expect(v.registro).toMatchObject({ decisao: "aprovada", decidida_por_nome: "Ana ADM", decidida_em: "2026-10-24T14:30:00.000Z", decidida_em_ms: Date.parse("2026-10-24T14:30:00Z") });
    const lib = aplicarDecisao({ status: "aguardando_diretoria", motivo: "feira", solicitada_em: "t" }, v.registro);
    expect(lib.status).toBe("aprovada");
    expect(lib.historico).toHaveLength(1);
    expect(textoDecisao(lib)).toMatch(/^Aprovada por Ana ADM em .* — D24h estável, cliente com feira$/);
    expect(textoDecisao({ status: "aguardando_diretoria" })).toBe("Aguardando aprovação da diretoria");
  });
});
