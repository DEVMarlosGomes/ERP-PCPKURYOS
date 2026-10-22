import { describe, expect, test } from "vitest";
import { baseVigente, mesmaBase, planoDaBase, substituicoesForaDaFragrancia } from "./formulacaoBase";

const base = [
  { nome: "Álcool", codigo: "MPGR-00002", inci: "Alcohol", percentual: 80 },
  { nome: "Água", codigo: "MPGR-00010", inci: "Aqua", percentual: 18 },
];

describe("formulação base do projeto (AMO-02)", () => {
  test("primeira base do projeto nasce v1", () => {
    expect(planoDaBase([], base)).toEqual({ acao: "criar", versao: 1, itens: base });
  });
  test("mesma base (ordem/caixa/acento diferentes) reaproveita a versão vigente", () => {
    const v1 = { id: "B1", versao: 1, itens: base };
    const igual = [{ nome: "AGUA", percentual: 18 }, { nome: "alcool", percentual: 80.00001 }];
    expect(mesmaBase(v1.itens, igual)).toBe(true);
    expect(planoDaBase([v1], igual)).toEqual({ acao: "reusar", base: v1 });
  });
  test("base diferente gera a próxima versão; a anterior não muda", () => {
    const v1 = { id: "B1", versao: 1, itens: base };
    const v2Itens = [...base, { nome: "Fenoxietanol", percentual: 0.5 }];
    expect(planoDaBase([v1], v2Itens)).toMatchObject({ acao: "criar", versao: 2 });
    expect(v1.itens).toHaveLength(2);
    expect(baseVigente([v1, { id: "B2", versao: 2, itens: v2Itens }]).id).toBe("B2");
  });
  test("sem ingrediente na base não grava nada", () => {
    expect(planoDaBase([], [])).toEqual({ acao: "nenhuma" });
  });
  test("variação que troca ingrediente da base é recusada; trocar a fragrância passa", () => {
    const variantes = [
      { nome: "Rosa", overrides: [{ ingredient_name_base: "Fragrância A", ingredient_name: "Fragrância Rosa", percentage: 2 }] },
      { nome: "Errada", overrides: [{ ingredient_name_base: "agua", ingredient_name: "Água floral", percentage: 18 }] },
    ];
    expect(substituicoesForaDaFragrancia(variantes, ["Álcool", "Água"])).toEqual([
      'Errada: "agua" é da base — na variação só a fragrância muda.',
    ]);
  });
});
