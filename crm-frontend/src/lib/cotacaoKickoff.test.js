import { describe, expect, test } from "vitest";
import { diffLinhas, faltasDeParidade, linhasDaCotacao, mesclarLinhas, numeroCotacao, precosDaCotacao, resumoCotacao } from "./cotacaoKickoff";
import { linhasDeEmbalagem } from "./kickoffBom";

const comp = (id, extra = {}) => ({ id, componente: id, aplicavel: "sim", definido: "sim", fornecido_por: "kuryos", qtd_por_unidade: 1, ...extra });
const KICKOFF = {
  ficha_manipulacao: { itens: [{ id: "I1", tipo: "mp_formula", codigo_interno: "MP0001", descricao: "Álcool", unidade: "L", quantidade_por_unidade: 0.16, quantidade_total_pedido: 160, status_homologacao: "homologado" }] },
  bom: linhasDeEmbalagem({
    bloco0: { unidades_por_display: "12", displays_ou_unidades_por_caixa_master: "4" },
    bloco2: { componentes: [comp("frasco_pote_bisnaga", { material_codigo: "EP-00089", material_nome: "FRASCO PET 200" }), comp("valvula_spray", { item_novo: true, item_novo_descricao: "Válvula bruma 24/410" })] },
    bloco3: { componentes: [comp("rotulo", { qtd_por_unidade: 2, fornecido_por: "cliente" }), comp("cartucho")] },
    bloco4: { componentes: [comp("display_expositor_pdv"), comp("caixa_master")] },
  }, { numeroKickoff: "KO-2026-031", volumePedido: 1000 }),
};

describe("cotação em registro próprio (COM-03)", () => {
  test("número preso ao projeto, com revisão", () => {
    expect(numeroCotacao("2026-031", 2)).toBe("COT-2026-031-r2");
  });

  test("paridade: todo item e quantidade do Kickoff aparece na cotação", () => {
    const linhas = linhasDaCotacao(KICKOFF);
    expect(linhas.map((l) => [l.descricao, l.qtd_total, l.fornecido_por])).toEqual([
      ["Álcool", 160, "kuryos"], ["FRASCO PET 200", 1000, "kuryos"], ["Válvula bruma 24/410", 1000, "kuryos"],
      ["rotulo", 2000, "cliente"], ["cartucho", 1000, "kuryos"], ["display_expositor_pdv", 84, "kuryos"], ["caixa_master", 21, "kuryos"],
    ]);
    expect(linhas.find((l) => l.descricao === "Válvula bruma 24/410").item_novo).toBe(true);
    expect(linhas[1]).toMatchObject({ material_codigo: "EP-00089", nivel: "primaria", item_novo: false });
    expect(faltasDeParidade(KICKOFF, { linhas })).toEqual([]);
    expect(faltasDeParidade(KICKOFF, { linhas: linhas.slice(1) })).toEqual(["Álcool"]);
  });

  test("Kickoff muda: preços levantados ficam; diff aponta o que mudou", () => {
    const antes = linhasDaCotacao(KICKOFF).map((l) => (l.descricao === "cartucho" ? { ...l, preco: 0.42, fonte_preco: "cotado_compras" } : l));
    const novo = { ...KICKOFF, bom: KICKOFF.bom.map((l) => (l.componente_id === "cartucho" ? { ...l, quantidade_total_pedido: 1500 } : l)) };
    const depois = mesclarLinhas(linhasDaCotacao(novo), antes);
    expect(depois.find((l) => l.descricao === "cartucho")).toMatchObject({ preco: 0.42, qtd_total: 1500 });
    expect(diffLinhas(antes, depois)).toEqual([{ campo: "cartucho", de: 1000, para: 1500 }]);
    expect(diffLinhas(antes, antes)).toEqual([]);
  });

  test("resumo e preço COTADO vencendo o estimado da fórmula", () => {
    const linhas = linhasDaCotacao(KICKOFF).map((l) => (l.linha_id === "I1" ? { ...l, preco: 11, fonte_preco: "cotado_compras" } : l));
    expect(resumoCotacao({ linhas })).toEqual({ itens: 7, do_cliente: 1, sem_preco: 5, itens_novos: 1, sem_cadastro: 4 });
    const insumos = precosDaCotacao([{ bom_id: "I1", preco: 9.5, moeda: "BRL", origem_preco: "formula" }, { bom_id: "x", preco: null }], { numero: "COT-1-r1", linhas });
    expect(insumos[0]).toMatchObject({ preco: 11, origem_preco: "cotacao", cotacao_numero: "COT-1-r1" });
    expect(insumos[1].preco).toBeNull();
  });
});
