import { etapaPelaAmostra, passosAte } from "./etapaPelaAmostra";

describe("etapa do projeto pela amostra", () => {
  test("cliente aprovou vai para o Kickoff; entregue vai para Amostra Enviada; P&D trabalhando, Em Desenvolvimento", () => {
    expect(etapaPelaAmostra([{ status_pd: "WAITING_APPROVAL", status: "aprovada" }])).toBe("kickoff");
    expect(etapaPelaAmostra([{ status_pd: "APPROVED", resultado_cliente: "aprovada" }])).toBe("kickoff");
    expect(etapaPelaAmostra([{ status_pd: "WAITING_APPROVAL" }, { status_pd: "IN_PROGRESS" }])).toBe("amostra_enviada");
    expect(etapaPelaAmostra([{ status_pd: "IN_TESTS" }])).toBe("amostra_em_desenvolvimento");
    expect(etapaPelaAmostra([{ status_pd: "REJECTED", status: "retrabalho" }])).toBe("amostra_em_desenvolvimento");
    expect(etapaPelaAmostra([{ status_pd: "OPEN" }])).toBeNull();
    expect(etapaPelaAmostra([])).toBeNull();
  });

  test("só anda para a frente, uma etapa por vez, e só no trecho de amostra", () => {
    expect(passosAte("amostra_solicitada", "kickoff")).toEqual(["amostra_em_desenvolvimento", "amostra_enviada", "kickoff"]);
    expect(passosAte("amostra_enviada", "amostra_em_desenvolvimento")).toEqual([]);
    expect(passosAte("amostra_enviada", "amostra_enviada")).toEqual([]);
    expect(passosAte("kickoff", "kickoff")).toEqual([]);
    expect(passosAte("cotacao", "kickoff")).toEqual([]);
    expect(passosAte("projeto_em_discussao", "amostra_enviada")).toEqual([]);
  });
});
