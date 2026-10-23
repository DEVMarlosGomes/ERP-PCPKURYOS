import { calcularCotacao, insumosDoBom, linhaDeServico, mensagemDePendencias, mesclarComposicao, precoDoItemDeFormula, precoSugerido } from "./cotacao";

const BOM = [
  { id: "I1", tipo: "mp_formula", codigo_interno: "MP0001", descricao: "Álcool Etílico", unidade: "L", quantidade_por_unidade: 0.16 },
  { id: "I2", tipo: "mp_formula", codigo_interno: "MPES-1", descricao: "Fragrância Cítrica", unidade: "L", quantidade_por_unidade: 0.04 },
  { id: "k-embalagem_primaria", tipo: "embalagem_primaria", codigo_interno: "EP0001", descricao: "Frasco PET 200 mL", unidade: "un", quantidade_por_unidade: 1 },
];
const ITENS = [
  { id: "I1", price_per_kg: 9.5 },
  { id: "I2", price_usd: 40 },
];
const ENVASE = { id: "s1", codigo: "SRV-002", nome: "Envase líquido", unidade: "un", preco: 0.3, descontoPct: 10, setupLote: 150, minimoPedido: 0 };
const CELOFANE = { id: "s6", codigo: "SRV-006", nome: "Celofane", unidade: "milheiro", preco: 90, descontoPct: 0, setupLote: 0, minimoPedido: 500 };
const ROTULO = { id: "s5", codigo: "SRV-005", nome: "Rotulagem", unidade: "un", preco: null };

describe("preço sugerido do serviço", () => {
  test("custo-hora ÷ produtividade × (1 + margem), na unidade de cobrança", () => {
    expect(precoSugerido({ unidade: "un", custoHora: 300, produtividade: 600, margemPct: 20 })).toBe(0.6);
    expect(precoSugerido({ unidade: "milheiro", custoHora: 300, produtividade: 600, margemPct: 0 })).toBe(500);
    expect(precoSugerido({ unidade: "kg", custoHora: 200, produtividade: 400 })).toBe(0.5);
    expect(precoSugerido({ unidade: "lote", custoHora: 250, produtividade: 2, margemPct: 10 })).toBe(550);
  });
  test("sem custo-hora ou produtividade não inventa preço", () => {
    expect(precoSugerido({ unidade: "un", custoHora: null, produtividade: 600 })).toBeNull();
    expect(precoSugerido({ unidade: "un", custoHora: 300, produtividade: 0 })).toBeNull();
  });
});

describe("insumos do BOM do Kickoff", () => {
  test("MP leva o preço da fórmula (US$ quando houver, senão R$/kg); embalagem nasce sem preço", () => {
    const linhas = insumosDoBom(BOM, ITENS);
    expect(linhas.map((l) => [l.codigo, l.preco, l.moeda, l.origem_preco])).toEqual([
      ["MP0001", 9.5, "BRL", "formula"], ["MPES-1", 40, "USD", "formula"], ["EP0001", null, "BRL", "manual"],
    ]);
    expect(precoDoItemDeFormula({ price_usd: "", price_per_kg: 0 })).toEqual({ preco: null, moeda: "BRL" });
  });
});

describe("cálculo da cotação", () => {
  const base = () => ({ qtd_pedido: 3000, kg_por_unidade: 0.2, lotes: 1, insumos: insumosDoBom(BOM, ITENS), servicos: [linhaDeServico(ENVASE)] });

  test("insumo sem preço e serviço sem preço bloqueiam o envio (nunca viram zero)", () => {
    const c = base();
    c.servicos.push(linhaDeServico(ROTULO));
    const r = calcularCotacao(c, 5.5);
    expect(r.pode_enviar).toBe(false);
    expect(r.pendencias).toEqual([
      { tipo: "insumo", descricao: "Frasco PET 200 mL", motivo: "SEM PREÇO" },
      { tipo: "servico", descricao: "Rotulagem", motivo: "SEM PREÇO" },
    ]);
    expect(r.servicos[1].total).toBeNull();
    expect(mensagemDePendencias(r.pendencias)).toMatch(/Frasco PET 200 mL \(SEM PREÇO\); Rotulagem \(SEM PREÇO\)/);
  });

  test("US$ converte pela taxa; desconto da etapa, setup e mínimo por pedido", () => {
    const c = base();
    c.insumos[2].preco = 1.2;
    c.servicos.push(linhaDeServico(CELOFANE));
    const r = calcularCotacao(c, 5.5);
    expect(r.pode_enviar).toBe(true);
    // 0,16 × 9,50 + 0,04 × 40 × 5,5 + 1 × 1,20 = 1,52 + 8,80 + 1,20
    expect(r.insumos_por_un).toBe(11.52);
    const [envase, celofane] = r.servicos;
    expect(envase.preco_final).toBe(0.27);
    expect(envase.total).toBe(960); // 3000 × 0,27 + 150 de setup
    expect(celofane.quantidade).toBe(3);
    expect(celofane.total).toBe(500); // 3 milheiros × 90 = 270 < mínimo 500
    expect(celofane.minimo_aplicado).toBe(true);
    expect(r.servicos_por_un).toBe(0.4867);
    expect(r.preco_un).toBe(12.0067);
    expect(r.desconto_servicos_total).toBe(90); // só o envase: o celofane caiu no mínimo
    expect(celofane.desconto_total).toBe(0);
  });

  test("insumo fornecido pelo cliente não é cobrado nem pede preço", () => {
    const c = base();
    c.insumos[2].fornecido_por = "cliente";
    const r = calcularCotacao(c, 5.5);
    expect(r.pode_enviar).toBe(true);
    expect(r.insumos[2].custo_un).toBe(0);
  });

  test("insumo em US$ sem câmbio e pedido sem quantidade também bloqueiam", () => {
    const c = { ...base(), qtd_pedido: 0 };
    c.insumos[2].preco = 1;
    const r = calcularCotacao(c, null);
    expect(r.pendencias.map((p) => p.motivo)).toEqual(["Informe a quantidade", "SEM CÂMBIO"]);
  });

  test("serviço por kg usa o granel da unidade; por lote usa o número de lotes", () => {
    const c = { ...base(), lotes: 2, servicos: [
      linhaDeServico({ id: "m", nome: "Manipulação", unidade: "kg", preco: 2 }),
      linhaDeServico({ id: "l", nome: "Liberação", unidade: "lote", preco: 100 }),
    ] };
    c.insumos[2].fornecido_por = "cliente";
    const r = calcularCotacao(c, 5.5);
    expect(r.servicos[0].total).toBe(1200); // 3000 × 0,2 kg × 2
    expect(r.servicos[1].total).toBe(200);
  });
});

describe("mesclar o salvo com o Kickoff e a tabela", () => {
  test("rascunho segue a tabela e a fórmula; mantém desconto, fator, preço manual e quem fornece", () => {
    const salva = {
      qtd_pedido: 5000, lotes: 2,
      insumos: [
        { bom_id: "I1", preco: 1, moeda: "BRL", origem_preco: "formula" },
        { bom_id: "k-embalagem_primaria", preco: 1.1, moeda: "BRL", origem_preco: "manual", fornecido_por: "cliente" },
      ],
      servicos: [{ ...linhaDeServico(ENVASE), preco_cheio: 0.25, desconto_pct: 15, fator: 2 }, { servico_id: "velho", nome: "Saiu" }],
    };
    const base = { kickoff_id: "K", numero_kickoff: "KO-2026-001", qtd_pedido: 3000, kg_por_unidade: 0.2, insumos: insumosDoBom(BOM, ITENS), servicos: [ENVASE] };
    const m = mesclarComposicao(salva, base);
    expect(m.qtd_pedido).toBe(5000);
    expect(m.lotes).toBe(2);
    expect(m.insumos[0].preco).toBe(9.5);
    expect(m.insumos[2]).toMatchObject({ preco: 1.1, fornecido_por: "cliente" });
    expect(m.servicos[0]).toMatchObject({ preco_cheio: 0.3, desconto_pct: 15, fator: 2 });
    expect(m.servicos[1].fora_da_tabela).toBe(true);
  });

  test("cotação enviada fica como saiu", () => {
    const salva = { insumos: [{ bom_id: "I1", preco: 1 }], servicos: [{ servico_id: "s1", preco_cheio: 0.25 }] };
    expect(mesclarComposicao(salva, { insumos: insumosDoBom(BOM, ITENS), servicos: [ENVASE] }, { congelada: true })).toBe(salva);
  });

  test("sem nada salvo, quantidade vem do Kickoff", () => {
    const m = mesclarComposicao(null, { qtd_pedido: 3000, kg_por_unidade: 0.2, insumos: [], servicos: [] });
    expect(m).toMatchObject({ qtd_pedido: 3000, kg_por_unidade: 0.2, lotes: 1, insumos: [], servicos: [] });
  });
});

describe("quem fornece vem do Kickoff (KO-05/BOM-01)", () => {
  test("linha do Kickoff com 'fornecido por' manda; sem o campo, vale o que a cotação marcou", () => {
    const bom = [
      { id: "frasco", tipo: "embalagem_primaria", nivel: "primaria", descricao: "Frasco", quantidade_por_unidade: 1, fornecido_por: "cliente" },
      { id: "tampa", tipo: "tampa", descricao: "Tampa", quantidade_por_unidade: 1 },
    ];
    const base = { insumos: insumosDoBom(bom, []), servicos: [] };
    expect(base.insumos.map((l) => l.fornecido_por)).toEqual(["cliente", ""]);
    const salva = { insumos: [{ bom_id: "frasco", fornecido_por: "kuryos", preco: 1 }, { bom_id: "tampa", fornecido_por: "cliente", preco: 0.2 }], servicos: [] };
    const m = mesclarComposicao(salva, base);
    expect(m.insumos.map((l) => l.fornecido_por)).toEqual(["cliente", "cliente"]);
  });
});
