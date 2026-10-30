import { atualizarRitmo, pendenciasOperacional, prodHoraRefParaGravar, totalPessoas, unidadesPorHora } from "./kickoffOperacional";
import { pendenciasQuestionario } from "./kickoffPendencias";
import { DONO_DO_BLOCO, estadoDosBlocos } from "./kickoffBlocos";

const completo = () => ({
  equipamentos: ["Envasadora volumétrica 4 bicos", "Rosqueadora"],
  pessoas: [{ funcao: "Operador de envase", quantidade: "2" }, { funcao: "Embalador", quantidade: 3 }],
  producao_por_minuto: "25", unidades_por_hora: "1500",
});

describe("KO-13: Bloco Operacional", () => {
  test("ritmo: um calcula o outro (× 60 / ÷ 60)", () => {
    expect(atualizarRitmo({}, "producao_por_minuto", "25")).toMatchObject({ producao_por_minuto: "25", unidades_por_hora: "1500", ritmo_digitado: "minuto" });
    expect(atualizarRitmo({}, "unidades_por_hora", "1.200")).toMatchObject({ unidades_por_hora: "1.200", producao_por_minuto: "20", ritmo_digitado: "hora" });
    expect(atualizarRitmo({}, "producao_por_minuto", "")).toMatchObject({ unidades_por_hora: "" });
    expect(unidadesPorHora({ producao_por_minuto: "0,5" })).toBe(30);
    expect(unidadesPorHora({})).toBeNull();
  });

  test("pessoas por função com total; pendências do bloco", () => {
    expect(totalPessoas(completo().pessoas)).toBe(5);
    expect(pendenciasOperacional(completo())).toEqual([]);
    expect(pendenciasOperacional({}).map((p) => p.campo)).toEqual(["equipamentos", "pessoas", "unidades_por_hora"]);
    expect(pendenciasOperacional({ ...completo(), pessoas: [{ funcao: "", quantidade: "" }] }).map((p) => p.campo)).toEqual(["pessoas[0].funcao", "pessoas[0].quantidade"]);
  });

  test("entra nas pendências do questionário, é do dono Engenharia de Produto e tem estado próprio", () => {
    expect(DONO_DO_BLOCO.bloco6).toBe("eng_produto");
    const r = pendenciasQuestionario({ bloco6: {} });
    expect(r.status.bloco6.completo).toBe(false);
    expect(pendenciasQuestionario({ bloco6: completo() }).status.bloco6.completo).toBe(true);
    const { estados } = estadoDosBlocos({ questionario: { bloco6: completo() }, pendencias: pendenciasQuestionario({ bloco6: completo() }).status });
    expect(estados.bloco6).toMatchObject({ estado: "pronto", dono: "eng_produto" });
  });

  test("prodHoraRef: o Kickoff só preenche o vazio (capacidade conservadora)", () => {
    expect(prodHoraRefParaGravar(undefined, completo())).toBe(1500);
    expect(prodHoraRefParaGravar(0, completo())).toBe(1500);
    expect(prodHoraRefParaGravar(1200, completo())).toBeNull();
    expect(prodHoraRefParaGravar("", {})).toBeNull();
  });
});
