// INF-04: o servidor (functions/fechamento-formula.js = public/shared/fechamento-formula.js)
// e o CRM (lib/fechamentoFormula.js) dão o mesmo resultado. Se um mudar, este teste cai.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";
import { fechamentoFormula, pendenciasDoLote, textoFechamento } from "./fechamentoFormula";

const ler = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const shared = ler("../../../public/shared/fechamento-formula.js");
const ctx = { self: {} };
vm.runInNewContext(shared, ctx);
const S = ctx.self.FechamentoFormula;

const casos = [
  [{ percentage: 60 }, { percentage: 39.5 }],
  [{ percentage: 60 }, { percentage: 40.4 }],
  [{ percentage: 60 }, { percentage: 40.0004 }],
  [{ percentage: "40,5" }, { percentage: "59.5" }],
  Array.from({ length: 1000 }, () => ({ percentage: 0.1 })),
];

describe("fechamento: CRM × servidor (contrato)", () => {
  test("a cópia do servidor é idêntica à do PCP", () => {
    expect(ler("../../../functions/fechamento-formula.js")).toBe(shared);
  });
  test("mesma soma, mesmo ok e mesmo texto", () => {
    for (const c of casos) {
      const a = fechamentoFormula(c), b = S.fechamentoFormula(c);
      expect({ ok: b.ok, soma: b.soma, diferenca: b.diferenca }).toEqual({ ok: a.ok, soma: a.soma, diferenca: a.diferenca });
      expect(S.textoFechamento(b)).toBe(textoFechamento(a));
    }
  });
  test("conferirDesenvolvimento: fórmula vigente + variantes dos lotes ativos", () => {
    const base = [
      { formula_id: "F1", ingredient_name: "Álcool", percentage: 80 },
      { formula_id: "F1", ingredient_name: "Água", percentage: 18 },
      { formula_id: "F1", ingredient_name: "Fragrância A", percentage: 2 },
      { formula_id: "F0", ingredient_name: "Água", percentage: 50 },
    ];
    const lote = { nome: "Lote Out", formula_base_id: "F1", status_base: "ativa", variantes: [
      { nome: "Rosa", overrides: [{ ingredient_name_base: "Fragrância A", ingredient_name: "Fragrância B", percentage: 3 }] },
    ] };
    const r = S.conferirDesenvolvimento([{ id: "F0", version: 1 }, { id: "F1", version: 2 }], base, [lote, { ...lote, status_base: "encerrada" }]);
    expect(r.ok).toBe(false);
    expect(r.linhas).toEqual(["Lote Lote Out · Rosa: Soma 101% — excede 1%."]); // v1 (50%) não é a vigente; lote encerrado fora
    expect(r.pendencias).toEqual(pendenciasDoLote(lote, base.filter((i) => i.formula_id === "F1")).map((p) => ({ ...p })));
    expect(S.conferirDesenvolvimento([{ id: "F1", version: 1 }], base.slice(0, 3), []).ok).toBe(true);
  });
});
