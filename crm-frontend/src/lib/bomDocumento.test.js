import { htmlDoBom, linhasDoPdf } from "./bomDocumento";

describe("BOM-02: PDF do BOM sem manipulação e sem o Bloco Operacional", () => {
  const kickoff = {
    numero_kickoff: "KO-2026-031", versao: "v1",
    questionario_composicao: {
      bloco0: { cliente: "Lumi", nome_produto: "Body Splash", volume_gramatura: "200 ml" }, fechamento: { volume_primeiro_lote: "3000" },
      bloco6: { equipamentos: ["Envasadora volumétrica 4 bicos"], pessoas: [{ funcao: "Operador de envase", quantidade: 2 }] },
    },
    ficha_manipulacao: { itens: [{ descricao: "Álcool Etílico", tipo: "mp_formula" }] },
    bom: [
      { codigo_interno: "EP-1", descricao: "Frasco PET 200 mL", tipo: "embalagem_primaria", nivel: "primaria", quantidade_por_unidade: 1, quantidade_total_pedido: 3000, fornecido_por: "kuryos", fornecedor_principal: { nome: "Plastipak" } },
      { codigo_interno: "KO-x", descricao: "Válvula spray <24/410>", tipo: "embalagem_primaria", nivel: "primaria", quantidade_por_unidade: 1, quantidade_total_pedido: 3000, definido: false },
      { codigo_interno: "ET-1", descricao: "Caixa master", tipo: "emb_terciaria", nivel: "terciaria", unidades_por_embalagem: 24, quantidade_total_pedido: 125 },
      { codigo_interno: "MP0001", descricao: "Álcool Etílico (legado)", tipo: "mp_formula" },
    ],
  };

  test("só embalagens, por nível; nada da fórmula nem de equipamentos/equipe", () => {
    expect(linhasDoPdf(kickoff.bom).map((l) => l.codigo_interno)).toEqual(["EP-1", "KO-x", "ET-1"]);
    const html = htmlDoBom(kickoff, { geradoEm: "30/10/2026" });
    expect(html).toContain("Embalagem primária");
    expect(html).toContain("Embalagem terciária");
    expect(html).toContain("Plastipak");
    expect(html).toContain("a definir");
    expect(html).toContain("Válvula spray &lt;24/410&gt;");
    expect(html).toContain("lote de 3000 un");
    for (const fora of ["Álcool Etílico", "Envasadora", "Operador de envase", "Manipulação</h2>"]) expect(html).not.toContain(fora);
  });
});
