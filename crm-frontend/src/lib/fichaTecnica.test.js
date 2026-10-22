import {
  agruparPorFase, elaboracaoDaManipulacao, eventoMpNova, htmlFichaTecnica, montarFichaTecnica,
  nomeFase, passosDaFase, validarMpNova,
} from "./fichaTecnica";

// Manteiga de Banho (ficha Scentec enviada pelo usuário em 15/10/2026).
const ITENS = [
  { ingredient_name: "Cetiol LC", inci: "Coco-Caprylate/Caprate", fornecedor: "Basf", percentage: 10, phase: "A" },
  { ingredient_name: "Manteiga de Quinoa (LH0348)", inci: "Shea Butter Butyrospermum Chenopodium Quinoa Extract", fornecedor: "Loop Hope", percentage: 40.5, phase: "Fase B" },
  { ingredient_name: "Miristato de Isopropila", inci: "Isopropil Miristate", fornecedor: "Basf", percentage: 10, phase: "a" },
  { ingredient_name: "Fragrância (SCE963092 SHOWER BUTTER I)", inci: "Parfum", fornecedor: "Scentec", percentage: 4, phase: "D", mp_nova: { nome: "Fragrância Shower Butter I", tipo: "MPES" } },
  { ingredient_name: "B.H.T", inci: "Butylated Hydroxytoluene", fornecedor: "Polycomercio", percentage: 0.05, phase: "C" },
  { ingredient_name: "Água", percentage: 35.45 },
];
const FASES = [
  { id: "p2", nome_fase: "Fase B", temperatura: "65 °C", order: 1, etapas: ["Aquecer a Fase B a 65 °C", "Adicionar a Fase B sobre a Fase A sob agitação contínua"] },
  { id: "p1", nome_fase: "A", temperatura: "75 °C", order: 0, instrucoes: "1. Pesar as matérias-primas na ordem descrita\n2) Aquecer a Fase A a 75 °C e homogeneizar\n" },
  { id: "p3", nome_fase: "C", order: 2, etapas: ["  ", "Adicionar a Fase C e D a 50 °C"] },
];

describe("manipulação no modelo das fichas", () => {
  test("fase normalizada e ingredientes agrupados A, B, C, D… com 'Sem fase' no fim", () => {
    expect(nomeFase("Fase b")).toBe("B");
    expect(nomeFase("Aquosa")).toBe("Aquosa");
    const grupos = agruparPorFase(ITENS);
    expect(grupos.map((g) => g.fase)).toEqual(["A", "B", "C", "D", "Sem fase"]);
    expect(grupos[0].itens.map((i) => i.ingredient_name)).toEqual(["Cetiol LC", "Miristato de Isopropila"]);
  });

  test("passo a passo: lista nova ou texto antigo, um passo por linha, sem numeração duplicada", () => {
    expect(passosDaFase(FASES[1])).toEqual(["Pesar as matérias-primas na ordem descrita", "Aquecer a Fase A a 75 °C e homogeneizar"]);
    expect(passosDaFase(FASES[2])).toEqual(["Adicionar a Fase C e D a 50 °C"]);
    expect(passosDaFase({})).toEqual([]);
  });

  test("seção 2.2 da Ficha Técnica nasce da Manipulação, na ordem das fases", () => {
    const e = elaboracaoDaManipulacao(FASES);
    expect(e.origem).toBe("manipulacao");
    expect(e.secoes.map((s) => [s.nome, s.temperatura, s.etapas.length])).toEqual([["Fase A", "75 °C", 2], ["Fase B", "65 °C", 2], ["Fase C", "", 1]]);
  });
});

describe("MP nova não cadastrada", () => {
  test("exige nome por extenso e tipo MPGR ou MPES", () => {
    expect(validarMpNova({ nome: "", tipo: "MPGR" })).toMatch(/nome/);
    expect(validarMpNova({ nome: "Extrato de Quinoa", tipo: "XX" })).toMatch(/MPGR ou MPES/);
    expect(validarMpNova({ nome: "Extrato de Quinoa", tipo: "MPES" })).toBeNull();
    expect(validarMpNova(null)).toBeNull();
  });

  test("histórico: incluída, trocada no retrabalho, vinculada ao cadastro, removida", () => {
    const v1 = { ingredient_name: "Fragrância X", mp_nova: { nome: "Fragrância X", tipo: "MPES" } };
    expect(eventoMpNova(null, v1)).toEqual({ acao: "incluida", nome: "Fragrância X", tipo: "MPES" });
    expect(eventoMpNova(v1, { ...v1, mp_nova: { nome: "Fragrância Y", tipo: "MPES" } })).toEqual({ acao: "substituida", nome: "Fragrância Y", tipo: "MPES", de: "Fragrância X", de_tipo: "MPES" });
    expect(eventoMpNova(v1, { ingredient_name: "Fragrância X (FR-0012)" })).toMatchObject({ acao: "vinculada_ao_cadastro", para: "Fragrância X (FR-0012)" });
    expect(eventoMpNova(v1, null)).toEqual({ acao: "removida", nome: "Fragrância X", tipo: "MPES" });
    expect(eventoMpNova(v1, { ...v1, percentage: 3 })).toBeNull();
    expect(eventoMpNova({ ingredient_name: "Água" }, { ingredient_name: "Água", percentage: 1 })).toBeNull();
  });
});

describe("documento da Ficha Técnica (modelo Mochi Blur)", () => {
  const modelo = montarFichaTecnica({
    request: { commercial_name: "Manteiga de Banho", internal_code: "2026-031-A1-a", client_name: "Lumi" },
    formula: { version: 2, volume: 60, volume_unit: "g" },
    itens: ITENS, fases: FASES,
    analise: { aspecto: { especificacao: "Pasta cremosa", resultado: "Conforme", pa: "Conforme" }, cor: { especificacao: "", resultado: "", pa: "" } },
  });

  test("monta identificação, fases, procedimento e só as características preenchidas", () => {
    expect(modelo.produto).toBe("Manteiga de Banho");
    expect(modelo.versao).toBe("v2");
    expect(modelo.fases.map((g) => g.fase)).toEqual(["A", "B", "C", "D", "Sem fase"]);
    expect(modelo.total).toBeCloseTo(100);
    expect(modelo.procedimento.map((p) => p.fase)).toEqual(["A", "B", "C"]);
    expect(modelo.parametros.map((p) => p.key)).toEqual(["aspecto"]);
  });

  test("HTML: tabela por fase com INCI, procedimento numerado, sem custo na versão do cliente", () => {
    const cliente = htmlFichaTecnica(modelo);
    expect(cliente).toMatch(/<tr class="fase"><td colspan="4">FASE A<\/td><\/tr>/);
    expect(cliente).toMatch(/Shea Butter Butyrospermum/);
    expect(cliente).toMatch(/MP nova · MPES/);
    expect(cliente).toMatch(/<b>Fase B · 65 °C<\/b>/);
    expect(cliente).not.toMatch(/Custo R\$/);
    expect(htmlFichaTecnica(modelo, { comCustos: true })).toMatch(/Custo R\$\/kg/);
    expect(htmlFichaTecnica({ ...modelo, produto: "<script>x</script>" })).not.toMatch(/<script>x/);
  });
});
