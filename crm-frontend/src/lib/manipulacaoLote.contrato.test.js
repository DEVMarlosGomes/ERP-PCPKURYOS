// Contrato: o servidor (functions/manipulacao_lote_motor.js) aplica as MESMAS regras do editor do lote.
// A cópia CommonJS é a saída de scripts/gerar-manipulacao-lote-cjs.mjs; se o motor mudar sem gerar de
// novo, este teste cai. Rode: node scripts/gerar-manipulacao-lote-cjs.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import { DESTINO, FONTE, gerarCjs } from "../../../scripts/gerar-manipulacao-lote-cjs.mjs";
import * as M from "./manipulacaoLote";

const lf = (s) => String(s).replace(/\r\n/g, "\n");
const S = createRequire(import.meta.url)("../../../functions/manipulacao_lote_motor.js");

describe("motor do lote: CRM × servidor (contrato)", () => {
  test("a cópia do servidor é exatamente a saída do gerador", () => {
    expect(lf(readFileSync(DESTINO, "utf8"))).toBe(gerarCjs(readFileSync(FONTE, "utf8")));
  });
  test("exporta as mesmas funções e constantes", () => {
    expect(Object.keys(S).sort()).toEqual(Object.keys(M).sort());
  });
  test("mesma ordem, assinatura e conciliação num lote de exemplo", () => {
    const itens = [
      { ingredient_name: "Água", percentage: 78.25, phase: "A", master_material_id: "AGUA" },
      { ingredient_name: "Fenoxietanol", percentage: 0.75, phase: "A", master_material_id: "FENOX" },
      { ingredient_name: "Fragrância", percentage: 21, phase: "B", function: "fragrância" },
    ];
    const membros = [{ request_id: "R1", itens, quantidade_g: 50, codigo_amostra: "a" }, { request_id: "R2", itens, quantidade_g: 37.5, codigo_amostra: "b" }];
    for (const X of [M, S]) expect(X.MAX_MEMBROS).toBe(20);
    const de = (X) => {
      const mm = X.montarMatriz({ matrizItens: itens, membros });
      return {
        ordem: X.ordemDoLote({ ingredientes: mm.ingredientes, celulas: mm.celulas, membros, preMistura: { A: true }, perdaPct: 3 }),
        assinatura: X.assinaturaItens(itens), texto: X.textoCanonicoItens(itens),
        conciliacao: X.conciliacaoMassa({ pesadoG: 87.6, entregue: { R1: 50, R2: 37.5 }, perdaDeclaradaG: 0.1, n: 2, perdaPct: 3 }),
      };
    };
    expect(de(S)).toEqual(de(M));
  });
});
