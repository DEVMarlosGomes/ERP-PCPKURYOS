import { renderToStaticMarkup } from "react-dom/server";
import BomEmbalagens from "@/components/BomEmbalagens";
import { arvoreDoBom } from "./bomArvore";

const BOM = [
  { id: "a", codigo_interno: "EP-1", descricao: "Frasco PET 200 mL cristal", componente: "Frasco", tipo_componente_nome: "Frasco", tipo: "embalagem_primaria", nivel: "primaria", quantidade_por_unidade: 1, quantidade_total_pedido: 3000, fornecido_por: "kuryos", fornecedor_principal: { nome: "Plastipak" } },
  { id: "b", codigo_interno: "KO-v", descricao: "Válvula spray 24/410 0,13 mL", componente: "Válvula spray", tipo: "embalagem_primaria", nivel: "primaria", quantidade_por_unidade: 1, quantidade_total_pedido: 3000, fornecedor_principal: { nome: "" } },
  { id: "c", codigo_interno: "ET-1", descricao: "Caixa master papelão onda B", componente: "Caixa master", tipo: "emb_terciaria", nivel: "terciaria", unidades_por_embalagem: 24, quantidade_total_pedido: 125 },
  { id: "m", codigo_interno: "MP1", descricao: "Álcool", tipo: "mp_formula" },
];

describe("BOM-03: vista explodida e cartões", () => {
  test("árvore Produto → nível → componente, com tipo, qtd/un, total e fornecedor (ou a definir); sem MP", () => {
    const a = arvoreDoBom(BOM, { produto: "Body Splash 200 mL", sku: "PRF-LUMI-0001" });
    expect(a.produto).toBe("Body Splash 200 mL — PRF-LUMI-0001");
    expect(a.resumo).toBe("1 unidade = 1 frasco + 1 válvula spray");
    expect(a.niveis.map((n) => [n.titulo, n.itens.length])).toEqual([["Primária", 2], ["Terciária", 1]]);
    expect(a.niveis[0].itens[0].detalhe).toBe("Frasco · 1/un · total 3.000 · fornecedor: Plastipak");
    expect(a.niveis[0].itens[1].detalhe).toMatch(/fornecedor: a definir/);
    expect(a.niveis[1].itens[0].detalhe).toMatch(/24 un\/emb\. · total 125/);
  });

  test("tela: alternador Tabela/Árvore, tabela sem largura mínima forçada e cartões para o celular", () => {
    const html = renderToStaticMarkup(<BomEmbalagens bom={BOM} produto="Body Splash" />);
    expect(html).toContain('data-testid="bom-vista-arvore"');
    expect(html).toContain('data-testid="bom-primaria"');
    expect(html).toContain('data-testid="bom-cartoes-primaria"');
    expect(html).not.toMatch(/min-w-\[900px\]/);
    expect(html).toContain("break-words");
    expect(html).not.toContain("Álcool");
  });
});
