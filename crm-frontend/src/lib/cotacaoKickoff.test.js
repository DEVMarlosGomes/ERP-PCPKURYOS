import { describe, expect, test } from "vitest";
import { cotacaoPrecificada, diffLinhas, faltasDeParidade, itensParaCompras, linhasDaCotacao, mesclarLinhas, numeroCotacao, precosDaCotacao, precosDosProcessos, resumoCotacao } from "./cotacaoKickoff";
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

describe("ponte com o Compras (COM-05)", () => {
  test("COT-02: vai para a SC tudo que a Kuryos compra, mesmo sem cadastro e sem fornecedor (com a especificação)", () => {
    const { itens, fora } = itensParaCompras({ linhas: linhasDaCotacao(KICKOFF) });
    expect(itens.map((i) => [i.materialCodigo, i.materialNome, i.qtd, i.sem_cadastro])).toEqual([
      ["MP0001", "Álcool", 160, false], ["EP-00089", "FRASCO PET 200", 1000, false], ["", "Válvula bruma 24/410", 1000, true],
      ["", "cartucho", 1000, true], ["", "display_expositor_pdv", 84, true], ["", "caixa_master", 21, true],
    ]);
    expect(itens[2]).toMatchObject({ item_novo: true, obs: "fornecedor a definir · item novo (não cadastrado)" });
    expect(itens.some((i) => i.materialNome === "rotulo")).toBe(false); // do cliente: não se compra
    expect(fora).toEqual([]);
    expect(itensParaCompras({ linhas: [{ descricao: "X", qtd_total: null }] }).fora).toEqual([{ descricao: "X", motivo: "sem quantidade do pedido" }]);
  });
  test("COT-02: componente pelo tipo, sem fornecedor, vai com a especificação completa", () => {
    const linhas = linhasDaCotacao({ bom: linhasDeEmbalagem({ bloco2: { componentes: [comp("tampa", { tipo_componente: "TAMPA", tipo_componente_nome: "Tampa",
      atributos_def: [{ chave: "rosca", nome: "Rosca", tipo: "enum", obrigatorio: true }], atributos: { rosca: "24/410" } })] } }, { volumePedido: 500 }) });
    expect(linhas[0]).toMatchObject({ especificacao: "Tampa · Rosca: 24/410", fornecedor_sugerido: "" });
    const [item] = itensParaCompras({ linhas }).itens;
    expect(item).toMatchObject({ materialNome: "Tampa · Rosca: 24/410", sem_cadastro: true, obs: "fornecedor a definir · sem cadastro" });
  });
  test("preço do processo: vencedor do item → vencedor geral → menor resposta", () => {
    const resp = (preco) => ({ respostaItens: { i1: { precoUnit: preco }, i2: { precoUnit: preco } } });
    const processos = {
      p1: { numeroFormatado: "COT-0042", itens: { i1: { materialCodigo: "EP-00089", origemSolicitacaoKey: "SC1" }, i2: { materialCodigo: "MP0001", origemSolicitacaoKey: "SC1" } },
        vencedoresPorItem: { i1: "c2" }, fornecedoresConvidados: { c1: { fornecedorKey: "f1", ...resp(1.1) }, c2: { nomeAvulso: "Vidro Sul", ...resp(1.3) } } },
      p2: { numeroFormatado: "COT-0050", itens: { i1: { materialCodigo: "ET-1", origemSolicitacaoKey: "OUTRA" } }, fornecedoresConvidados: { c1: resp(9) } },
    };
    const m = precosDosProcessos(processos, ["SC1"], (k) => ({ f1: "Plastsul" })[k]);
    expect(m.get("EP-00089")).toEqual({ preco: 1.3, detalhe: "COT-0042 · Vidro Sul · vencedor" });
    expect(m.get("MP0001")).toEqual({ preco: 1.1, detalhe: "COT-0042 · Plastsul · menor resposta" });
    expect(m.has("ET-1")).toBe(false);
  });
});

describe("COT-03: cotação precificada", () => {
  test("toda linha que a Kuryos compra com preço; a do cliente não conta", () => {
    expect(cotacaoPrecificada([{ preco: 1 }, { fornecido_por: "cliente" }])).toBe(true);
    expect(cotacaoPrecificada([{ preco: 1 }, { preco: null }])).toBe(false);
    expect(cotacaoPrecificada([{ fornecido_por: "cliente" }])).toBe(false);
    expect(cotacaoPrecificada([{ preco: 1, fonte_preco: "cotado_compras" }, { preco: 2 }], { soCompras: true })).toBe(false);
    expect(cotacaoPrecificada([{ preco: 1, fonte_preco: "cotado_compras" }], { soCompras: true })).toBe(true);
  });
});
