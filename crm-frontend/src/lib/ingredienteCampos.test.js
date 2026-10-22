import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";
import { CAMPOS_MATERIAL, camposMaterialDoItem } from "./ingredienteCampos";
import { solicitacoesDeMpsNovas } from "./filaCadastroMp";

// Lado do PCP (Cadastros), carregado como o navegador carrega: script UMD.
function ladoPcp() {
  const codigo = readFileSync(new URL("../../../public/shared/ingrediente-campos.js", import.meta.url), "utf8");
  const ctx = { self: {} };
  vm.runInNewContext(codigo, ctx);
  return ctx.self.IngredienteCampos;
}

describe("campos do material (AMO-04)", () => {
  test("contrato: CRM e Cadastros usam a mesma lista, na mesma ordem (INCI até US$)", () => {
    const pcp = ladoPcp();
    expect(CAMPOS_MATERIAL.map((c) => c.chave)).toEqual(pcp.CAMPOS_MATERIAL.map((c) => c.chave));
    expect(CAMPOS_MATERIAL.map((c) => c.chave)).toEqual(["inci", "funcao", "fornecedor", "preco_brl_kg", "preco_usd_kg"]);
  });

  test("linha da manipulação vira campos do material; preço vazio é null, nunca zero", () => {
    expect(camposMaterialDoItem({ inci: " Parfum ", function: "fragrância", fornecedor: "Scentec", price_per_kg: "", price_usd: "38,5" }))
      .toEqual({ inci: "Parfum", funcao: "fragrância", fornecedor: "Scentec", preco_brl_kg: null, preco_usd_kg: 38.5 });
    expect(camposMaterialDoItem({ price_per_kg: "0" }).preco_brl_kg).toBeNull();
    expect(camposMaterialDoItem(null)).toEqual({ inci: "", funcao: "", fornecedor: "", preco_brl_kg: null, preco_usd_kg: null });
  });

  test("a fila leva todos os campos e o Cadastros lê os mesmos valores", () => {
    const fila = solicitacoesDeMpsNovas({
      formula: { id: "F1", version: 1 },
      itens: [{ id: "I1", ingredient_name: "Manteiga de Quinoa", inci: "Chenopodium Quinoa Extract", function: "emoliente",
        fornecedor: "Loop Hope", price_per_kg: "212.4", price_usd: "", mp_nova: { nome: "Manteiga de Quinoa LH0348", tipo: "MPGR" } }],
    });
    const tarefa = fila.F1__I1;
    expect(Object.keys(tarefa.campos)).toEqual(CAMPOS_MATERIAL.map((c) => c.chave));
    const pcp = ladoPcp();
    const form = pcp.paraFormularioMaterial(pcp.camposDaSolicitacao(tarefa), tarefa.tipo);
    expect(form).toMatchObject({ inci: "Chenopodium Quinoa Extract", funcaoFormula: "emoliente", custoReferencia: 212.4, fornecedorNome: "Loop Hope" });
    expect(form.referenciaPd).toContain("R$ 212,4/kg");
  });
});
