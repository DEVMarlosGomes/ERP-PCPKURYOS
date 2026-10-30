import { describe, expect, test } from "vitest";
import { insumosDoKickoff, linhasDeEmbalagem, unidadesPorEmbalagem } from "./kickoffBom";

const linha = (id, extra = {}) => ({ id, componente: id, aplicavel: "sim", definido: "sim", fornecido_por: "kuryos", ...extra });

describe("BOM de embalagens (BOM-01)", () => {
  test("BOM-04: paletização aplicável fica no Kickoff, fora do BOM (e da cotação)", () => {
    const q = {
      bloco0: { displays_ou_unidades_por_caixa_master: "24" },
      bloco4: { componentes: [linha("caixa_master"), linha("paletizacao", { tipo_componente: "PALETIZACAO", unidades_por_embalagem: "960" })] },
    };
    const l = linhasDeEmbalagem(q, { numeroKickoff: "KO-1", volumePedido: 960 });
    expect(l.map((x) => x.componente_id)).toEqual(["caixa_master"]);
    expect(insumosDoKickoff({ bom: l }).some((x) => x.componente_id === "paletizacao")).toBe(false);
  });
  test("todo componente aplicável entra, com nível e quantidade; cartucho, válvula e bula também", () => {
    const q = {
      bloco2: { componentes: [linha("frasco_pote_bisnaga", { material_codigo: "EP-00089", material_nome: "FRASCO PET 300ML", qtd_por_unidade: 1 }),
        linha("valvula_spray", { especificacao_fornecedor_codigo: "Válvula 24/410 bruma" }), linha("tampa", { aplicavel: "nao" })] },
      bloco3: { componentes: [linha("rotulo", { qtd_por_unidade: 2, fornecido_por: "cliente" }), linha("cartucho"), linha("bula_folheto", { definido: "nao" })] },
      bloco4: { componentes: [] },
    };
    const l = linhasDeEmbalagem(q, { numeroKickoff: "KO-2026-031", volumePedido: 1000 });
    expect(l.map((x) => [x.componente_id, x.tipo, x.nivel, x.quantidade_por_unidade, x.quantidade_total_pedido])).toEqual([
      ["frasco_pote_bisnaga", "embalagem_primaria", "primaria", 1, 1000],
      ["valvula_spray", "embalagem_primaria", "primaria", 1, 1000],
      ["rotulo", "rotulo", "secundaria", 2, 2000],
      ["cartucho", "emb_secundaria", "secundaria", 1, 1000],
      ["bula_folheto", "emb_secundaria", "secundaria", 1, 1000],
    ]);
    expect(l[0]).toMatchObject({ codigo_interno: "EP-00089", status_homologacao: "homologado" });
    expect(l[1]).toMatchObject({ codigo_interno: "KO-2026-031-valvula_spray", especificacao: "Válvula 24/410 bruma", status_homologacao: "pendente" });
    expect(l[2].fornecido_por).toBe("cliente");
    expect(l[4].definido).toBe(false); // aplicável e ainda não definido: entra como "a definir"
  });
  test("aceite do prompt: 1.000 un, 12 por display, 4 displays por master → 84 displays e 21 caixas (para cima)", () => {
    const q = {
      bloco0: { unidades_por_display: "12", displays_ou_unidades_por_caixa_master: "4" },
      bloco4: { componentes: [linha("display_expositor_pdv"), linha("caixa_master")] },
    };
    const l = linhasDeEmbalagem(q, { volumePedido: 1000 });
    expect(l.map((x) => [x.componente_id, x.unidades_por_embalagem, x.quantidade_total_pedido])).toEqual([
      ["display_expositor_pdv", 12, 84], ["caixa_master", 48, 21],
    ]);
  });
  test("unidades por embalagem: o da linha vence o Bloco 0; sem display, o campo vale como unidades por master", () => {
    expect(unidadesPorEmbalagem({ id: "caixa_master", unidades_por_embalagem: "24" }, { unidades_por_display: 12, displays_ou_unidades_por_caixa_master: 4 })).toBe(24);
    expect(unidadesPorEmbalagem({ id: "caixa_master" }, { displays_ou_unidades_por_caixa_master: "48" })).toBe(48);
    expect(unidadesPorEmbalagem({ id: "cantoneira" }, {})).toBeNull();
  });
  test("texto antigo de 'fornecido por' é convertido na linha (nome de fornecedor → Kuryos + fornecedor)", () => {
    const l = linhasDeEmbalagem({ bloco2: { componentes: [linha("tampa", { fornecido_por: "PLASTSUL", especificacao_fornecedor_codigo: "PP 24/410" })] } });
    expect(l[0]).toMatchObject({ tipo: "tampa", fornecido_por: "kuryos", fornecedor_principal: { nome: "PLASTSUL" } });
  });
  test("insumos do Kickoff = MPs da ficha de manipulação + embalagens", () => {
    expect(insumosDoKickoff({ ficha_manipulacao: { itens: [{ id: "I1", tipo: "mp_formula" }] }, bom: [{ id: "b", tipo: "rotulo" }] }).map((x) => x.id)).toEqual(["I1", "b"]);
    expect(insumosDoKickoff({})).toEqual([]);
  });
});
