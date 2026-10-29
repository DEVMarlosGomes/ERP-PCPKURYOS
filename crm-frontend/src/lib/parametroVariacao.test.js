import { renderToStaticMarkup } from "react-dom/server";
import { CamposDaVariacao } from "@/components/SampleBatchModal";
import { variacaoEntreSkus } from "./kickoffAutopreenchimento";
import {
  PARAMETROS_VARIACAO, aceitaVariasVariacoes, camposDoParametro, camposPreenchidos, parametroDe,
  resumoDaVariacao, trocarParametro, variacaoVazia,
} from "./parametroVariacao";

describe("PD-04: mapa parâmetro → campos da variação (D-14)", () => {
  test("cada parâmetro tem os campos combinados", () => {
    const mapa = Object.fromEntries(PARAMETROS_VARIACAO.map((p) => [p.valor, p.campos.map((c) => c.campo)]));
    expect(mapa).toEqual({
      fragrancia: ["percentual_fragrancia", "referencia_fragrancia", "custo_fragrancia"],
      cor: ["pigmento", "cor"],
      volume: ["volume", "unidade_volume"],
      versao: ["nome_versao", "o_que_muda"],
      concentracao: ["ativo", "percentual_ativo"],
    });
    expect(camposDoParametro("")).toEqual([]);
    expect(camposDoParametro("textura")).toEqual([]); // desconhecido não inventa campo
  });

  test("valores casam com o que o Kickoff entende (fragrância, cor, volume, versão)", () => {
    const aprovadas = (p) => [{ sample: { parametro_variacao: p }, variation: {} }, { sample: { parametro_variacao: p }, variation: {} }];
    for (const p of ["fragrancia", "cor", "volume", "versao"]) expect(variacaoEntreSkus(aprovadas(p)).varia_entre_skus).toEqual([p]);
    // Kickoff compara o código da cor entre SKUs pelo campo `cor`.
    const cores = [{ sample: {}, variation: { cor: "Pantone 1" } }, { sample: {}, variation: { cor: "Pantone 2" } }];
    expect(variacaoEntreSkus(cores).varia_entre_skus).toContain("cor");
    expect(parametroDe("Fragrância")?.valor).toBe("fragrancia");
    expect(parametroDe("VERSÃO")?.valor).toBe("versao");
  });

  test("Nenhuma = uma variação só; trocar para Nenhuma deixa a primeira", () => {
    expect(aceitaVariasVariacoes("")).toBe(false);
    expect(aceitaVariasVariacoes("cor")).toBe(true);
    const amostra = { nome_produto: "Batom", parametro_variacao: "cor", variacoes: [{ cor: "A" }, { cor: "B" }] };
    expect(trocarParametro(amostra, "")).toMatchObject({ parametro_variacao: "", variacoes: [{ cor: "A" }] });
    expect(trocarParametro(amostra, "volume").variacoes).toHaveLength(2);
    expect(variacaoVazia("fragrancia")).toMatchObject({ percentual_fragrancia: "", custo_fragrancia_currency: "USD" });
  });

  test("o que foi digitado vira texto para o card e o P&D; amostra antiga sem parâmetro mostra a fragrância", () => {
    expect(resumoDaVariacao("cor", { pigmento: "Óxido vermelho", cor: "Pantone 7621 C" })).toBe("Cor: Pigmento Óxido vermelho · Código da cor Pantone 7621 C");
    expect(resumoDaVariacao("volume", { volume: "120", unidade_volume: "ml" })).toBe("Volume: Volume 120 ml");
    expect(resumoDaVariacao("concentracao", { ativo: "Niacinamida", percentual_ativo: "5" })).toBe("Concentração: Ativo Niacinamida · % do ativo 5%");
    expect(camposPreenchidos("", { percentual_fragrancia: 2, referencia_fragrancia: "Floral", custo_fragrancia: 40, custo_fragrancia_currency: "USD" }))
      .toEqual([{ rotulo: "% de fragrância", valor: "2%" }, { rotulo: "Referência da fragrância", valor: "Floral" }, { rotulo: "Custo da fragrância", valor: "US$ 40" }]);
    expect(resumoDaVariacao("versao", {})).toBe("");
  });

  test("trocar o parâmetro troca os campos na tela", () => {
    const html = (p) => renderToStaticMarkup(<CamposDaVariacao parametro={p} variacao={{}} onChange={() => {}} />);
    expect(html("cor")).toContain('aria-label="Pigmento"');
    expect(html("cor")).not.toContain("fragrância");
    expect(html("volume")).toContain('aria-label="Unidade"');
    expect(html("versao")).toContain('aria-label="O que muda"');
    expect(html("concentracao")).toContain('aria-label="% do ativo"');
    expect(html("fragrancia")).toContain('aria-label="% de fragrância"');
    expect(html("")).toBe("");
  });
});
