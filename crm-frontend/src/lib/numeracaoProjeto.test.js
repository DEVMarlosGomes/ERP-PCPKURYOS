import {
  codigoVariacao, formatarNumeroProjeto, letraVariacao, numeroAmostra, numeroKickoff,
  planoNumeracaoProjetos, proximoIndiceAmostra, sequenciaDoNumero,
} from "./numeracaoProjeto";

describe("numeração por projeto", () => {
  test("formatos do plano", () => {
    expect(formatarNumeroProjeto(2026, 31)).toBe("2026-031");
    expect(formatarNumeroProjeto(2026, 1204)).toBe("2026-1204");
    expect(numeroAmostra("2026-031", 1)).toBe("2026-031-A1");
    expect(codigoVariacao("2026-031-A1", 0)).toBe("2026-031-A1-a");
    expect(numeroKickoff("2026-031")).toBe("KO-2026-031");
  });

  test("letras das variações seguem o padrão antigo (z → aa)", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(letraVariacao)).toEqual(["a", "b", "z", "aa", "ab", "az", "ba"]);
  });

  test("próxima amostra do projeto ignora números antigos e continua depois do maior", () => {
    const amostras = [{ numero_amostra: "2026-031-A1" }, { numero_amostra: "2026-031-A3" }, { numero_amostra: "AM-00007" }, { numero_amostra: "2026-1002" }];
    expect(proximoIndiceAmostra(amostras, "2026-031")).toBe(4);
    expect(proximoIndiceAmostra([], "2026-031")).toBe(1);
    expect(proximoIndiceAmostra([{ numero_amostra: "2026-0311-A9" }], "2026-031")).toBe(1);
  });

  test("numerar projetos antigos por data de criação, por ano, sem repetir número já usado", () => {
    const projetos = [
      { id: "c", created_at: "2026-08-01T00:00:00Z" },
      { id: "a", created_at: "2026-06-26T00:00:00Z" },
      { id: "x", created_at: "2025-12-30T00:00:00Z" },
      { id: "j", created_at: "2026-07-01T00:00:00Z", numero_projeto: "2026-002" },
      { id: "b", created_at: "2026-07-10T00:00:00Z" },
    ];
    const { atribuicoes, contadores } = planoNumeracaoProjetos(projetos, { 2026: 1 });
    expect(atribuicoes).toEqual({ x: "2025-001", a: "2026-003", b: "2026-004", c: "2026-005" });
    expect(contadores).toEqual({ 2025: 1, 2026: 5 });
    expect(sequenciaDoNumero("2026-031")).toEqual({ ano: 2026, sequencia: 31 });
    expect(sequenciaDoNumero("AM-00001")).toBeNull();
  });
});
