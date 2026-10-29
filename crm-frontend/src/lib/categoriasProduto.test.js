import { describe, expect, it } from "vitest";
import { categoriasAtivas, codigoDaCategoria, nomeDaCategoria, opcoesDeCategoria, planoMigracaoCategorias, rotuloCategoria } from "@/lib/categoriasProduto";

// Recorte real de config/categoriasProduto (29/10/2026).
const RAW = [
  { ativo: true, codigo: "HIG", exemplos: "sabonete líquido, gel de banho", nome: "HIGIENE CORPORAL" },
  { ativo: true, codigo: "CAB", exemplos: "shampoo, condicionador, tônico, tintura", nome: "CABELO" },
  { ativo: true, codigo: "PRF", exemplos: "perfume, colônia, body splash, extrato", nome: "PERFUMARIA" },
  { ativo: true, codigo: "BAR", exemplos: "gel de barbear, pós-barba", nome: "BARBA E APÓS-BARBA" },
  { ativo: false, codigo: "UNH", exemplos: "esmalte, removedor", nome: "UNHAS" },
  { ativo: true, codigo: "PEL", exemplos: "hidratante, creme facial, óleo corporal", nome: "PELE" },
  null,
];

describe("categorias do Cadastros no CRM (CRM-01)", () => {
  const ativas = categoriasAtivas(RAW);

  it("só ativas, ordenadas pelo nome como no Cadastros", () => {
    expect(ativas.map((c) => c.codigo)).toEqual(["BAR", "CAB", "HIG", "PEL", "PRF"]);
  });

  it("aceita o nó como objeto (chaves numéricas) e vazio", () => {
    expect(categoriasAtivas({ 0: RAW[0], 1: RAW[4] }).map((c) => c.codigo)).toEqual(["HIG"]);
    expect(categoriasAtivas(null)).toEqual([]);
  });

  it("rótulo igual ao do modal Novo Produto", () => {
    expect(rotuloCategoria(ativas[0])).toBe("BARBA E APÓS-BARBA (BAR) — gel de barbear, pós-barba");
  });

  it("resolve código, nome e texto antigo; recusa inativa e desconhecida", () => {
    expect(codigoDaCategoria("PRF", ativas)).toBe("PRF");
    expect(codigoDaCategoria("cabelo", ativas)).toBe("CAB");
    expect(codigoDaCategoria("body_splash", ativas)).toBe("PRF");
    expect(codigoDaCategoria("perfume", ativas)).toBe("PRF");
    expect(codigoDaCategoria("shampoo", ativas)).toBe("CAB");
    expect(codigoDaCategoria("Óleo corporal", ativas)).toBe("PEL");
    expect(codigoDaCategoria("UNH", ativas)).toBeNull();
    expect(codigoDaCategoria("iluminador", ativas)).toBeNull();
    expect(codigoDaCategoria("", ativas)).toBeNull();
  });

  it("vocabulário real da base (29/10/2026) cai na categoria certa", () => {
    const todas = categoriasAtivas([
      ...RAW, { codigo: "MAQ", nome: "MAQUIAGEM" }, { codigo: "SOL", nome: "PROTETORES SOLARES" }, { codigo: "DES", nome: "DESODORANTES" },
      { codigo: "BRZ", nome: "BRONZEADORES" }, { codigo: "INF", nome: "PRODUTOS INFANTIS" },
    ]);
    const casos = {
      iluminador: "MAQ", fixador: "MAQ", batom_gloss: "MAQ", base_liquida: "MAQ", primer: "MAQ", blush_bronzer: "MAQ", mascara_cilios: "MAQ",
      locao_pos_barba: "BAR", protetor_solar_facial: "SOL", desodorante_creme: "DES", sabonete_liquido_facial: "HIG", gel_banho: "HIG",
      antisseptico_maos: "HIG", splash_capilar: "CAB", shampoo_masculino: "CAB", mascara_capilar: "CAB", tonico_facial: "PEL",
      contorno_olhos: "PEL", hidratante_corporal: "PEL", vitamina_c_antioxidante: "PEL", gel_redutor: "PEL", body_splash_colonia: "PRF",
      perfume_edp: "PRF", eau_de_toilette: "PRF", sache_perfumado: "PRF",
    };
    for (const [valor, codigo] of Object.entries(casos)) expect([valor, codigoDaCategoria(valor, todas)]).toEqual([valor, codigo]);
    expect(codigoDaCategoria("home_spray_aromatizador", todas)).toBeNull();
    expect(codigoDaCategoria("talco", todas)).toBeNull();
  });

  it("opções: ativas + valor antigo gravado marcado, sem duplicar", () => {
    const op = opcoesDeCategoria(ativas, ["PRF", "body_splash", "body_splash"]);
    expect(op.map((o) => o.value)).toEqual(["BAR", "CAB", "HIG", "PEL", "PRF", "body_splash"]);
    expect(op.at(-1)).toMatchObject({ label: "(antigo) Body Splash", antigo: true });
    expect(opcoesDeCategoria(ativas, "").length).toBe(5);
  });

  it("nome para exibir", () => {
    expect(nomeDaCategoria("CAB", ativas)).toBe("CABELO");
    expect(nomeDaCategoria("oleo_corporal", ativas)).toBe("Oleo Corporal");
    expect(nomeDaCategoria("", ativas)).toBe("");
  });
});

describe("migração do dado antigo (CRM-01)", () => {
  const cats = categoriasAtivas([...RAW, { codigo: "MAQ", nome: "MAQUIAGEM" }]);
  const plano = planoMigracaoCategorias({
    projetos: { p1: { categoria: "shampoo" }, p2: { categoria: "PRF" }, p3: { categoria: "home_spray" }, p4: {} },
    amostras: { a1: { categoria: "body_splash" } },
    clientes: { c1: { categoria_interesse: ["perfume", "colonia", "iluminador"] }, c2: { categoria_interesse: ["CAB"] }, c3: { categoria_interesse: ["talco", "shampoo"] } },
  }, cats);

  it("só caminhos planos, só o que muda, e o que não resolve fica como está", () => {
    expect(plano.updates).toEqual({
      "erp/kuryos/crm_projects/p1/categoria": "CAB",
      "erp/kuryos/crm_samples/a1/categoria": "PRF",
      "erp/kuryos/crm_clients/c1/categoria_interesse": ["PRF", "MAQ"],
      "erp/kuryos/crm_clients/c3/categoria_interesse": ["talco", "CAB"],
    });
    expect(plano.naoResolvidos).toEqual([
      { caminho: "erp/kuryos/crm_projects/p3/categoria", valor: "home_spray" },
      { caminho: "erp/kuryos/crm_clients/c3/categoria_interesse", valor: "talco" },
    ]);
  });
});
