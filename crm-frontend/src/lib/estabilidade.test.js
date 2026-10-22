import { formatarEspera, parametrosFaltando, proximoCheckpoint, rotuloDia, validarLeitura } from "./estabilidade";

const CK = [1, 2, 7, 30, 60, 90];
const PARAMS = [{ code: "ph", label: "pH" }, { code: "color", label: "Cor" }, { code: "microbiology", label: "Microbiologia" }];
const COMPLETO = { ph: "6,5", color: "Conforme", microbiology: "N/A" };
const INICIO = "2026-10-01T10:00:00Z";
const h = (iso, horas) => new Date(Date.parse(iso) + horas * 3600e3).toISOString();

describe("estabilidade em sequência", () => {
  test("D24h libera 24 h depois do início; antes disso mostra quanto falta", () => {
    expect(proximoCheckpoint({ checkpoints: CK, leituras: [], iniciadoEm: INICIO, agora: h(INICIO, 11) }))
      .toMatchObject({ proximo: 1, anterior: null, liberado: false, liberaEm: h(INICIO, 24) });
    expect(proximoCheckpoint({ checkpoints: CK, leituras: [], iniciadoEm: INICIO, agora: h(INICIO, 24) }).liberado).toBe(true);
  });

  test("D48h libera 24 h depois da leitura do D24h; D7 5 dias depois do D48h", () => {
    const d24 = { day_offset: 1, reading_at: h(INICIO, 30) };
    let p = proximoCheckpoint({ checkpoints: CK, leituras: [d24], iniciadoEm: INICIO, agora: h(INICIO, 41) });
    expect(p).toMatchObject({ proximo: 2, anterior: 1, liberado: false, liberaEm: h(INICIO, 54) });
    expect(formatarEspera(p.faltaMs)).toBe("13 h");
    const d48 = { day_offset: 2, reading_at: h(INICIO, 60) };
    p = proximoCheckpoint({ checkpoints: CK, leituras: [d24, d48], iniciadoEm: INICIO, agora: h(INICIO, 61) });
    expect(p).toMatchObject({ proximo: 7, liberaEm: h(INICIO, 60 + 5 * 24) });
    expect(formatarEspera(p.faltaMs)).toBe("4 d 23 h");
  });

  test("buraco antigo não trava: a sequência anda a partir do último registrado", () => {
    const p = proximoCheckpoint({ checkpoints: CK, leituras: [{ day_offset: 1, reading_at: INICIO }, { day_offset: 7, reading_at: h(INICIO, 200) }], iniciadoEm: INICIO, agora: h(INICIO, 2000) });
    expect(p).toMatchObject({ proximo: 30, pulados: [2] });
    expect(proximoCheckpoint({ checkpoints: [1, 2], leituras: [{ day_offset: 1 }, { day_offset: 2 }], iniciadoEm: INICIO, agora: INICIO }).concluido).toBe(true);
  });

  test("validação: um por vez, no prazo e completo; ADM só passa o prazo", () => {
    const base = { checkpoints: CK, leituras: [], iniciadoEm: INICIO, agora: h(INICIO, 30), parametros: PARAMS };
    expect(validarLeitura({ ...base, dia: 2, valores: COMPLETO })).toMatch(/um checkpoint por vez: o próximo é o D24h/);
    expect(validarLeitura({ ...base, dia: 1, valores: { ph: "6,5" } })).toMatch(/incompleta.*Cor, Microbiologia/);
    expect(validarLeitura({ ...base, dia: 1, valores: COMPLETO })).toBeNull();
    const cedo = { ...base, agora: h(INICIO, 5) };
    expect(validarLeitura({ ...cedo, dia: 1, valores: COMPLETO })).toMatch(/D24h libera em 19 h \(24 h do início do estudo\)/);
    expect(validarLeitura({ ...cedo, dia: 1, valores: COMPLETO, admin: true })).toBeNull();
    expect(validarLeitura({ ...cedo, dia: 2, valores: COMPLETO, admin: true })).toMatch(/um checkpoint por vez/);
    const comD24 = { ...base, leituras: [{ day_offset: 1, reading_at: h(INICIO, 30) }], agora: h(INICIO, 31) };
    expect(validarLeitura({ ...comD24, dia: 1, valores: COMPLETO })).toMatch(/D24h já registrado. O próximo é o D48h/);
    expect(validarLeitura({ ...comD24, dia: 2, valores: COMPLETO })).toMatch(/D48h libera em 23 h \(24 h depois do D24h\)/);
  });

  test("auxiliares", () => {
    expect([1, 2, 7].map(rotuloDia)).toEqual(["D24h", "D48h", "D7"]);
    expect(parametrosFaltando(PARAMS, { ph: " ", color: "ok" })).toEqual(["pH", "Microbiologia"]);
    expect(formatarEspera(0)).toBe("agora");
    expect(formatarEspera(25 * 60000)).toBe("25 min");
  });
});
