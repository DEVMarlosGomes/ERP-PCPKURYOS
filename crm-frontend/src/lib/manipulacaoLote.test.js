// LM-01 — motor da Manipulação em Lote (spec 2026-11-04-pd-manipulacao-lote-design.md §4).
import { describe, expect, test } from "vitest";
import {
  MAX_MEMBROS, NIVEL, assinaturaItens, classificarIngredientes, clonar, conciliacaoMassa, desvioPesagem, diferencas, ehFragrancia,
  fechamentoPorMembro, gramas, matrizPadrao, montarMatriz, motivoInelegivel, nivelDaMudanca, oQueVaria, ordemDoLote, ordemIndividual,
  pendencias, planoSalvarLote, quantidadeEmGramas, sugereFragrancia, validarSelecao, chaveMaterialFase, celulasDaOrigem, diferencasDoLote, composicaoValida,
} from "./manipulacaoLote";

const item = (nome, pct, extra = {}) => ({ ingredient_name: nome, percentage: pct, phase: "A", master_material_id: nome.toUpperCase(), ...extra });
const BASE = [
  item("Água", 70), item("Glicerina", 5), item("Carbopol", 0.5, { phase: "B" }),
  item("Fenoxietanol", 0.8, { phase: "C" }), item("Fragrância Rosa", 2, { phase: "C", function: "fragrância" }),
  item("Álcool", 21.7, { phase: "" }),
];

describe("elegibilidade (D-01)", () => {
  const ok = { request: { id: "R1", status: "IN_PROGRESS" }, variacao: { id: "v1" }, lotesAbertos: [] };
  test("Aberto/Em Desenvolvimento sem decisão do cliente entra", () => {
    expect(motivoInelegivel(ok)).toBe("");
    expect(motivoInelegivel({ ...ok, request: { id: "R1", status: "OPEN" } })).toBe("");
  });
  test("cada bloqueio tem motivo que diz o que fazer", () => {
    expect(motivoInelegivel({ ...ok, request: null })).toMatch(/sem solicitação/i);
    expect(motivoInelegivel({ ...ok, request: { id: "R1", status: "IN_TESTS" } })).toMatch(/Em Testes/);
    expect(motivoInelegivel({ ...ok, variacao: { id: "v1", resultado_cliente: "aprovada" } })).toMatch(/cliente já decidiu/i);
    expect(motivoInelegivel({ ...ok, variacao: { id: "v1", status: "cancelada" } })).toMatch(/cancelada/i);
    expect(motivoInelegivel({ ...ok, lotesAbertos: [{ codigo: "LM-2026-031-1", membros: { R1: { status_membro: "ativo" } } }] })).toMatch(/LM-2026-031-1/);
    expect(motivoInelegivel({ ...ok, lotesAbertos: [{ codigo: "LM-2026-031-1", membros: { R1: { status_membro: "removido" } } }] })).toBe("");
  });
  test("auditoria A4/B4: enviada aguardando o cliente e etapa ausente não entram", () => {
    expect(motivoInelegivel({ ...ok, variacao: { id: "v1", status: "enviada" } })).toMatch(/aguardando retorno/);
    expect(motivoInelegivel({ ...ok, request: { id: "R1" } })).toMatch(/sem etapa/i);
  });
  test("seleção: mínimo 2, máximo 20, todas elegíveis", () => {
    expect(MAX_MEMBROS).toBe(20);
    expect(validarSelecao([{ elegivel: true }])).toMatch(/pelo menos 2/);
    expect(validarSelecao(Array.from({ length: 21 }, () => ({ elegivel: true })))).toMatch(/no máximo 20/);
    expect(validarSelecao([{ elegivel: true }, { elegivel: false, codigo: "X", motivo: "m" }])).toMatch(/X/);
    expect(validarSelecao(Array.from({ length: 20 }, () => ({ elegivel: true })))).toBe("");
  });
});

describe("matriz padrão (D-04) e montagem", () => {
  test("a mais recente que fecha 100%; sem nenhuma que feche, a mais recente com itens", () => {
    const c = [
      { request_id: "R1", formula: { id: "F1", version: 1, updated_at: "2026-11-01" }, itens: BASE },
      { request_id: "R2", formula: { id: "F2", version: 3, updated_at: "2026-11-03" }, itens: [item("Água", 90)] },
      { request_id: "R3", formula: { id: "F3", version: 2, updated_at: "2026-11-02" }, itens: BASE },
    ];
    expect(matrizPadrao(c)).toMatchObject({ tipo: "amostra", request_id: "R3", ref_id: "F3", versao: 2, fecha: true });
    expect(matrizPadrao(c.slice(1, 2))).toMatchObject({ request_id: "R2", fecha: false });
    expect(matrizPadrao([{ request_id: "R9", formula: null, itens: [] }])).toBeNull();
  });
  test("amostra sem fórmula recebe a matriz; com fórmula, a dela; mesmo material em 2 fases = 2 linhas", () => {
    const outra = [...BASE.filter((i) => i.ingredient_name !== "Fragrância Rosa"), item("Fragrância Lavanda", 2, { phase: "C", function: "fragrância" }), item("Glicerina", 0, { phase: "B" })];
    const m = montarMatriz({ matrizItens: BASE, membros: [{ request_id: "R1", itens: [] }, { request_id: "R2", itens: outra }] });
    const nomes = Object.values(m.ingredientes).map((i) => `${i.nome}|${i.fase}`);
    expect(nomes).toContain("Glicerina|A");
    expect(nomes).toContain("Glicerina|B");
    expect(Object.keys(m.ingredientes)[0]).toBe("i01");
    const k = (nome) => Object.keys(m.ingredientes).find((x) => m.ingredientes[x].nome === nome);
    expect(m.celulas.R1[k("Fragrância Rosa")]).toBe(2);
    expect(m.celulas.R2[k("Fragrância Rosa")]).toBeUndefined();
    expect(m.celulas.R2[k("Fragrância Lavanda")]).toBe(2);
    expect(m.matrizCelulas[k("Fragrância Rosa")]).toBe(2);
    expect(m.ingredientes[k("Fragrância Rosa")].ehFragrancia).toBe(true);
  });
  test("auditoria A1: fragrância só por cadastro (MPES) ou função de origem; nome/INCI só sugerem; crítico vence", () => {
    expect(ehFragrancia({ funcao: "fragrância" })).toBe(true);
    expect(ehFragrancia({ codigo: "MPES-00012" })).toBe(true);
    expect(ehFragrancia({ nome: "Óleo essencial de melaleuca" })).toBe(false);
    expect(sugereFragrancia({ nome: "Óleo essencial de melaleuca" })).toBe(true);
    expect(ehFragrancia({ inci: "Parfum" })).toBe(false);
    expect(ehFragrancia({ nome: "Glicerina", codigo: "MPGR-00002" })).toBe(false);
    expect(nivelDaMudanca({ ehFragrancia: true, critico: true })).toBe(NIVEL.CRITICO);
    const materiais = new Map([["M_FRAG", { tipo: "MPES", criticoPd: true }], ["M_MEL", { tipo: "MPGR" }], ["M_ROSA", { tipo: "MPES" }]]);
    const forjado = {
      a: { nome: "Fragrância alergênica", master_material_id: "M_FRAG", fase: "C", critico: false, ehFragrancia: true },
      b: { nome: "Aroma de melaleuca", master_material_id: "M_MEL", fase: "C", ehFragrancia: true, funcao: "fragrância" },
      c: { nome: "Rosa", master_material_id: "M_ROSA", fase: "C" },
      d: { nome: "Extrato livre", fase: "A", ehFragrancia: true, codigo: "MPES-99" },
      e: { nome: "Essência X", fase: "A" },
    };
    const c = classificarIngredientes(forjado, { materiais, itensOrigem: [{ ingredient_name: "Essência X", phase: "A", function: "fragrância" }] });
    expect(nivelDaMudanca(c.a)).toBe(NIVEL.CRITICO);
    expect(c.b.ehFragrancia).toBe(false);
    expect(c.c.ehFragrancia).toBe(true);
    expect(c.d.ehFragrancia).toBe(false);
    expect(c.e.ehFragrancia).toBe(true);
  });
});

describe("clonar, diferenças, motivo e 100%", () => {
  const m = montarMatriz({ matrizItens: BASE, membros: [{ request_id: "R1", itens: BASE }, { request_id: "R2", itens: [] }, { request_id: "R3", itens: [] }] });
  const k = (nome) => Object.keys(m.ingredientes).find((x) => m.ingredientes[x].nome === nome);
  test("clonar coluna inteira, para várias, e um ingrediente só", () => {
    const c1 = { ...m.celulas, R2: { [k("Água")]: 50 } };
    const tudo = clonar(c1, { de: "R1", para: ["R2", "R3"] });
    expect(tudo.R2).toEqual(m.celulas.R1);
    expect(tudo.R2).not.toBe(tudo.R1);
    const um = clonar({ ...m.celulas, R2: { [k("Água")]: 50 } }, { de: "R1", para: ["R2"], ingKey: k("Glicerina") });
    expect(um.R2).toEqual({ [k("Água")]: 50, [k("Glicerina")]: 5 });
    const daMatriz = clonar(c1, { de: "matriz", para: ["R2"], matrizCelulas: m.matrizCelulas });
    expect(daMatriz.R2).toEqual(m.matrizCelulas);
  });
  test("05/11: sem comentário — só o crítico que muda a fórmula anterior da amostra pede aprovação de outra pessoa", () => {
    const ingredientes = { ...m.ingredientes, [k("Fenoxietanol")]: { ...m.ingredientes[k("Fenoxietanol")], critico: true } };
    const celulas = clonar(m.celulas, { de: "R1", para: ["R2", "R3"] });
    celulas.R2 = { ...celulas.R2, [k("Fragrância Rosa")]: 1.5, [k("Água")]: 70.5 };
    celulas.R3 = { ...celulas.R3, [k("Fenoxietanol")]: 1.0, [k("Água")]: 69.8 };
    const d = diferencas({ ingredientes, celulas, matrizCelulas: m.matrizCelulas });
    expect(d.R1).toEqual([]);
    expect(d.R2.map((x) => [x.nome, x.nivel])).toEqual([["Água", 2], ["Fragrância Rosa", 1]]);
    expect(d.R3.find((x) => x.nome === "Fenoxietanol")).toMatchObject({ nivel: 3, de: 0.8, para: 1 });
    const membros = ["R1", "R2", "R3"];
    // Sem fórmula anterior (primeira formulação): nada pendente — nem motivo, nem aprovação de crítico.
    expect(pendencias({ ingredientes, celulas, motivos: {}, aprovacoes: {}, membros })).toEqual([]);
    // R3 já tinha fórmula (Fenoxietanol 0,8): a troca para 1,0 pede aprovação; água e fragrância não pedem nada.
    const origem = { R3: { ...m.celulas.R1 } };
    let p = pendencias({ ingredientes, celulas, motivos: {}, aprovacoes: {}, membros, origem });
    expect(p.map((x) => `${x.request_id}:${x.nome}:${x.tipo}`)).toEqual(["R3:Fenoxietanol:aprovacao"]);
    const chaveF = chaveMaterialFase(ingredientes[k("Fenoxietanol")]);
    const quem = { R3: { [k("Fenoxietanol")]: { valor: 1, chave: chaveF, por: "u1" } } }; // carimbo automático do salvamento
    p = pendencias({ ingredientes, celulas, motivos: quem, aprovacoes: { R3: { [k("Fenoxietanol")]: { valor: 0.9, por: "adm" } } }, membros, origem });
    expect(p).toEqual([expect.objectContaining({ request_id: "R3", tipo: "aprovacao", motivo: expect.stringMatching(/mudou depois/) })]);
    // A aprovação vale para o material + fase aprovados (auditoria LM-15): sem a chave, não vale.
    p = pendencias({ ingredientes, celulas, motivos: quem, aprovacoes: { R3: { [k("Fenoxietanol")]: { valor: 1, por: "adm" } } }, membros, origem });
    expect(p).toEqual([expect.objectContaining({ request_id: "R3", tipo: "aprovacao", motivo: expect.stringMatching(/material mudou/) })]);
    const chave = chaveMaterialFase(ingredientes[k("Fenoxietanol")]);
    p = pendencias({ ingredientes, celulas, motivos: quem, aprovacoes: { R3: { [k("Fenoxietanol")]: { valor: 1, por: "adm", chave } } }, membros, origem });
    expect(p).toEqual([]);
    // Alteração ainda não salva (sem carimbo) ou aprovada por quem alterou: não vale.
    expect(pendencias({ ingredientes, celulas, motivos: {}, aprovacoes: { R3: { [k("Fenoxietanol")]: { valor: 1, por: "adm", chave } } }, membros, origem }))
      .toEqual([expect.objectContaining({ tipo: "aprovacao", motivo: expect.stringMatching(/outra pessoa/) })]);
    expect(pendencias({ ingredientes, celulas, motivos: { R3: { [k("Fenoxietanol")]: { valor: 1, chave: chaveF, por: "adm" } } }, aprovacoes: { R3: { [k("Fenoxietanol")]: { valor: 1, por: "adm", chave } } }, membros, origem }))
      .toEqual([expect.objectContaining({ tipo: "aprovacao", motivo: expect.stringMatching(/outra pessoa/) })]);
    // Carimbo de outro valor ou de outro material não serve (quem alterou tem que ser desta mudança).
    for (const outro of [{ valor: 0.9, chave: chaveF, por: "u1" }, { valor: 1, chave: "OUTRO|a", por: "u1" }]) {
      expect(pendencias({ ingredientes, celulas, motivos: { R3: { [k("Fenoxietanol")]: outro } }, aprovacoes: { R3: { [k("Fenoxietanol")]: { valor: 1, por: "adm", chave } } }, membros, origem }))
        .toEqual([expect.objectContaining({ tipo: "aprovacao", motivo: expect.stringMatching(/outra pessoa/) })]);
    }
    // Nenhuma pendência é de comentário.
    expect(pendencias({ ingredientes, celulas, motivos: {}, aprovacoes: {}, membros, origem }).some((x) => x.tipo === "motivo")).toBe(false);
  });
  test("100% por coluna com 4 casas", () => {
    const celulas = { A: { i1: 33.3333, i2: 33.3333, i3: 33.3334 }, B: { i1: 99.99 } };
    const f = fechamentoPorMembro(celulas, ["A", "B"]);
    expect(f.A.ok).toBe(true);
    expect(f.B).toMatchObject({ ok: false, diferenca: -0.01 });
  });
});

describe("ordem do lote (D-05/D-06)", () => {
  const ingredientes = {
    i01: { nome: "Água", fase: "A" }, i02: { nome: "Glicerina", fase: "A" }, i03: { nome: "Carbopol", fase: "B" },
    i04: { nome: "Fenoxietanol", fase: "C" }, i05: { nome: "Fragrância Rosa", fase: "C", ehFragrancia: true },
    i06: { nome: "Fragrância Lavanda", fase: "C", ehFragrancia: true }, i07: { nome: "Ativo X", fase: "" },
  };
  const celulas = {
    R1: { i01: 70, i02: 5, i03: 0.5, i04: 0.8, i05: 2, i07: 21.7 },
    R2: { i01: 70, i02: 5, i03: 0.5, i04: 0.8, i06: 2, i07: 21.7 },
    R3: { i01: 69.5, i02: 5, i03: 0.5, i04: 0.8, i06: 2.5, i07: 21.7 },
  };
  const membros = [{ request_id: "R1", codigo_amostra: "2026-1003-a", quantidade_g: 50 },
    { request_id: "R2", codigo_amostra: "2026-1003-b", quantidade_g: 100 }, { request_id: "R3", codigo_amostra: "2026-1003-h", quantidade_g: 33.33 }];
  test("sem pré-mistura: só adições, iguais às ordens individuais", () => {
    const o = ordemDoLote({ ingredientes, celulas, membros });
    expect(Object.keys(o.pre_misturas)).toEqual([]);
    expect(o.adicoes.R1.map((l) => l.teorico_g)).toEqual(ordemIndividual({ ingredientes, celulas, membro: membros[0] }).map((l) => l.teorico_g));
    expect(o.reconciliacao.ok).toBe(true);
  });
  test("pré-mistura por fase: só comuns com o mesmo %; aviso para % diferente; soma das porções ≤ pesado", () => {
    const o = ordemDoLote({ ingredientes, celulas, membros, preMistura: { A: true, C: true, "": true }, perdaPct: 3 });
    expect(o.pre_misturas.A.linhas.map((l) => l.nome)).toEqual(["Glicerina"]);
    expect(o.avisos.join(" ")).toMatch(/Água.*pesar separado: % diferente em 2026-1003-h/);
    expect(o.pre_misturas.C.linhas.map((l) => l.nome)).toEqual(["Fenoxietanol"]);
    expect(o.avisos.join(" ")).toMatch(/Fragrância Rosa.*ausente em/);
    expect(o.pre_misturas[""]).toBeUndefined(); // sem fase nunca vai para pré-mistura
    const pa = o.pre_misturas.A;
    // Glicerina: 2,5 + 5 + 1,67 (33,33 × 5 % = 1,6665 → 1,67)
    expect(pa.porcoes).toEqual({ R1: 2.5, R2: 5, R3: 1.67 });
    expect(pa.total_base_g).toBe(9.17);
    expect(pa.total_pesado_g).toBe(9.45); // 9,17 × 1,03 = 9,4451
    const soma = Object.values(pa.porcoes).reduce((s, g) => s + g, 0);
    expect(soma).toBeLessThanOrEqual(pa.total_pesado_g);
    // Água sai da pré-mistura e vira adição de cada amostra.
    expect(o.adicoes.R3.find((l) => l.nome === "Água").teorico_g).toBe(23.16); // 33,33 × 69,5 % = 23,16435
    expect(o.passos.R1.map((p) => `${p.tipo}:${p.fase}`)).toEqual(["porcao:A", "adicao:A", "adicao:B", "porcao:C", "adicao:C", "adicao:"]);
    expect(o.reconciliacao.ok).toBe(true);
  });
  test("fase sem nenhum comum: aviso e sem pré-mistura", () => {
    const o = ordemDoLote({ ingredientes, celulas: { R1: { i03: 1, i01: 99 }, R2: { i03: 2, i01: 98 } }, membros: membros.slice(0, 2), preMistura: { B: true } });
    expect(o.pre_misturas.B).toBeUndefined();
    expect(o.avisos.join(" ")).toMatch(/Fase B: nenhum ingrediente comum/);
  });
  test("mínimo pesável gera aviso com pré-diluição", () => {
    const o = ordemDoLote({ ingredientes: { i1: { nome: "Corante", fase: "A" }, i2: { nome: "Água", fase: "A" } },
      celulas: { R1: { i1: 0.05, i2: 99.95 }, R2: { i1: 0.05, i2: 99.95 } }, membros: [{ request_id: "R1", codigo_amostra: "a", quantidade_g: 50 }, { request_id: "R2", codigo_amostra: "b", quantidade_g: 50 }] });
    expect(o.adicoes.R1[0].teorico_g).toBe(0.03); // 0,025 → 0,03 (meio para cima, inteiro exato)
    expect(o.avisos.join(" ")).toMatch(/Corante.*abaixo do mínimo pesável \(0,05 g\).*pré-dilua a 10 %.*0,3 g/);
  });
  test("amostra sem gramas fica fora e é listada", () => {
    const o = ordemDoLote({ ingredientes, celulas, membros: [...membros.slice(0, 2), { request_id: "R3", codigo_amostra: "2026-1003-h", unidade_pedido: "ml", quantidade_pedido: 50 }] });
    expect(o.sem_quantidade).toEqual(["R3"]);
    expect(o.adicoes.R3).toBeUndefined();
  });
  test("20 amostras × 40 ingredientes com 4 casas: lote = soma das individuais, linha a linha", () => {
    const ing = {}; const cel = {}; const mem = [];
    for (let j = 1; j <= 40; j += 1) ing[`i${String(j).padStart(2, "0")}`] = { nome: `MP ${j}`, fase: j <= 20 ? "A" : j <= 35 ? "B" : "" };
    for (let r = 1; r <= 20; r += 1) {
      const c = {}; let resto = 100;
      for (let j = 1; j <= 39; j += 1) { const v = j % 7 === 0 && r % 3 === 0 ? 0.1234 + r / 10000 : 0.7531; c[`i${String(j).padStart(2, "0")}`] = v; resto -= v; }
      c.i40 = Number(resto.toFixed(4));
      cel[`R${r}`] = c; mem.push({ request_id: `R${r}`, codigo_amostra: `c${r}`, quantidade_g: 25 + r * 7.31 });
    }
    expect(Object.values(fechamentoPorMembro(cel, Object.keys(cel))).every((f) => f.ok)).toBe(true);
    const o = ordemDoLote({ ingredientes: ing, celulas: cel, membros: mem, preMistura: { A: true, B: true }, perdaPct: 2 });
    expect(o.reconciliacao.ok).toBe(true);
    for (const m of mem) {
      const ind = ordemIndividual({ ingredientes: ing, celulas: cel, membro: m });
      const doLote = [...Object.values(o.pre_misturas).flatMap((pm) => pm.linhas.map((l) => ({ ingKey: l.ingKey, g: l.por_membro[m.request_id] }))),
        ...o.adicoes[m.request_id].map((l) => ({ ingKey: l.ingKey, g: l.teorico_g }))];
      for (const l of ind) expect(Math.abs(doLote.find((x) => x.ingKey === l.ingKey).g - l.teorico_g)).toBeLessThanOrEqual(0.01);
    }
  });
});

describe("assinatura, gramas, conciliação, o que varia", () => {
  test("assinatura estável à ordem e sensível a % e fase", () => {
    const a = assinaturaItens([item("Água", 70), item("Glicerina", 30)]);
    expect(assinaturaItens([item("Glicerina", 30.00001), item("água", 70)])).toBe(a);
    expect(assinaturaItens([item("Água", 70), item("Glicerina", 30, { phase: "B" })])).not.toBe(a);
    expect(assinaturaItens([item("Água", 70.0001), item("Glicerina", 29.9999)])).not.toBe(a);
    expect(assinaturaItens([item("Água", 70, { master_material_id: "OUTRA" }), item("Glicerina", 30)])).not.toBe(a);
  });
  test("gramas e quantidade (D-06)", () => {
    expect(gramas(33.33, 5)).toBe(1.67);
    expect(quantidadeEmGramas({ quantidade_g: 40 })).toBe(40);
    expect(quantidadeEmGramas({ unidade_pedido: "g", quantidade_pedido: 30 })).toBe(30);
    expect(quantidadeEmGramas({ unidade_pedido: "ml", quantidade_pedido: 100, densidade: 0.79 })).toBe(79);
    expect(quantidadeEmGramas({ unidade_pedido: "ml", quantidade_pedido: 100 })).toBeNull();
  });
  test("conciliação de massa: tolerância 0,05 g por amostra ou 0,5 %, o maior", () => {
    const ok = conciliacaoMassa({ pesadoG: 200, entregue: { a: 90, b: 90 }, retencao: { a: { g: 10 } }, descarteG: 9.2, perdaDeclaradaG: 0, n: 2 });
    expect(ok).toMatchObject({ ok: true, destinos_g: 199.2, tolerancia_g: 1, residuo_g: 0.8 });
    expect(conciliacaoMassa({ pesadoG: 200, entregue: { a: 90 }, retencao: {}, descarteG: 0, perdaDeclaradaG: 0, n: 2 }).ok).toBe(false);
    expect(conciliacaoMassa({ pesadoG: 4, entregue: { a: 2, b: 1.85 }, retencao: {}, descarteG: 0, perdaDeclaradaG: 0, n: 3 }).tolerancia_g).toBe(0.15);
    const perda = conciliacaoMassa({ pesadoG: 200, entregue: { a: 90 }, retencao: {}, descarteG: 0, perdaDeclaradaG: 110, n: 2, perdaPct: 3 });
    expect(perda).toMatchObject({ perda_ok: false, ok: false, perda_max_g: 6 });
    expect(conciliacaoMassa({ pesadoG: 200, entregue: { a: 97 }, retencao: { a: { g: 98 } }, descarteG: 0, perdaDeclaradaG: 5, n: 2, perdaPct: 3 }).ok).toBe(true);
  });
  test("pesagem por linha (M4): tolerância max(0,01 g; 1 %)", () => {
    expect(desvioPesagem(10, 10.1)).toMatchObject({ desvio_g: 0.1, tolerancia_g: 0.1, dentro: true });
    expect(desvioPesagem(10, 10.11).dentro).toBe(false);
    expect(desvioPesagem(0.3, 0.31)).toMatchObject({ tolerancia_g: 0.01, dentro: true });
  });
  test("o que varia entre aprovadas: ingrediente fora da fragrância com % diferente ou ausente", () => {
    const v = (comp) => ({ lote_manipulacao: { composicao: comp } });
    const aprov = (fid, comp) => ({ aprovacao_cliente: { formula_aprovada: { id: "FV2" } }, lote_manipulacao: { formula_id: fid, composicao: comp } });
    expect(oQueVaria([aprov("FV1", [{ chave: "m1|a", nome: "Ativo", pct: 1 }]), v([{ chave: "m1|a", nome: "Ativo", pct: 2 }])])).toEqual([]);
    expect(oQueVaria([v([{ chave: "m1|a", nome: "Ativo", pct: 1 }]), v([{ chave: "m2|a", nome: "Ativo", pct: 1 }])])).toEqual(["Ativo"]);
    expect(oQueVaria([v([{ nome: "Água", pct: 70 }, { nome: "Ativo", pct: 1 }]), v([{ nome: "Água", pct: 70 }, { nome: "Ativo", pct: 2 }]), v([{ nome: "Água", pct: 70 }, { nome: "Ativo", pct: 1 }, { nome: "Mentol", pct: 0.1 }])])).toEqual(["Ativo", "Mentol"]);
    expect(oQueVaria([v([{ nome: "Água", pct: 70 }])])).toEqual([]);
    expect(oQueVaria([{}, {}])).toEqual([]);
  });
});

describe("plano de salvamento (só o rascunho; versões nascem no servidor — A4)", () => {
  const L = "erp/k/pd_manipulacao_lotes/L1";
  const ctx = () => ({ requests: new Map([["R1", { id: "R1", status: "OPEN" }], ["R2", { id: "R2", status: "IN_PROGRESS" }]]) });
  const lote = {
    id: "L1", codigo: "LM-2026-031-1", revisao: 1, status: "rascunho", matriz: { tipo: "amostra", ref_id: "F1", celulas: { i01: 98, i02: 2 } },
    celulas: { R1: { i01: 98, i02: 2 }, R2: { i01: 98, i02: 2 } },
    membros: { R1: { request_id: "R1", codigo_amostra: "A1", status_membro: "ativo" }, R2: { request_id: "R2", codigo_amostra: "A2", status_membro: "ativo" } },
  };
  const rascunho = {
    ingredientes: { i01: { nome: "Água", fase: "A", codigo: "MPGR-1", master_material_id: "M1" }, i02: { nome: "Fragrância", fase: "A", ehFragrancia: true } },
    celulas: { R1: { i01: 98, i02: 2 }, R2: { i01: 97, i02: 3 } }, motivos: { R2: { i01: { texto: "mais fragrância" } } },
    pre_mistura: {}, perda_pct: 3, quantidades: { R1: { quantidade_g: 50 }, R2: { quantidade_g: 30 } },
  };
  const base = { tenantPath: "erp/k", lote, rascunho, agora: "2026-11-04T12:00:00.000Z", autor: { uid: "u1", nome: "Yasmim" }, novoId: ((n) => () => `id${++n}`)(0) };
  test("grava o rascunho, Aberto→Em Desenvolvimento, revisão +1 e o de→para no evento; nenhuma fórmula", () => {
    const { updates, resumo } = planoSalvarLote({ ...base, contexto: ctx() });
    expect(Object.keys(updates).some((p) => /pd_formulas|pd_formula_items|pd_developments|crm_samples/.test(p))).toBe(false);
    expect(updates["erp/k/pd_requests/R1/status"]).toBe("IN_PROGRESS");
    expect(updates["erp/k/pd_requests/R2/status"]).toBeUndefined();
    expect(Object.values(updates).find((v) => v?.to_status === "IN_PROGRESS")).toMatchObject({ request_id: "R1", from_status: "OPEN" });
    expect(updates[`${L}/revisao`]).toBe(2);
    expect(updates[`${L}/membros/R2/quantidade_g`]).toBe(30);
    expect(updates[`${L}/membros/R2/diferencas`]).toEqual(["Água"]);
    expect(updates[`${L}/motivos`].R2.i01).toMatchObject({ texto: "mais fragrância", por: "u1", por_nome: "Yasmim", em: base.agora, valor: 97, nivel: 2 });
    const ev = Object.entries(updates).find(([p]) => p.startsWith(`${L}/eventos/`))[1];
    expect(ev.mudancas).toEqual(["A2 · Água: 98 → 97 %", "A2 · Fragrância: 2 → 3 %"]);
    const ps = Object.keys(updates);
    expect(ps.filter((p) => ps.some((q) => q !== p && q.startsWith(`${p}/`)))).toEqual([]);
    expect(resumo.passaramEmDesenvolvimento).toEqual(["R1"]);
  });
  test("05/11: sem comentário, quem alterou é carimbado sozinho e só muda quando o valor muda", () => {
    const semTexto = { ...rascunho, motivos: undefined };
    const { updates } = planoSalvarLote({ ...base, rascunho: semTexto, contexto: ctx() });
    expect(updates[`${L}/motivos`].R2.i01).toMatchObject({ texto: "", por: "u1", por_nome: "Yasmim", valor: 97, nivel: 2, chave: "M1|a" });
    // Outra pessoa salva de novo sem mexer no 97: o carimbo continua de quem alterou (u1).
    const l2 = { ...lote, celulas: { R1: { i01: 98, i02: 2 }, R2: { i01: 97, i02: 3 } }, motivos: { R2: { i01: { texto: "", por: "u1", por_nome: "Yasmim", em: "x", valor: 97, nivel: 2, chave: "M1|a" } } } };
    const outro = planoSalvarLote({ ...base, lote: l2, rascunho: { ...semTexto, perda_pct: 4 }, autor: { uid: "u2", nome: "Ana" }, contexto: ctx() });
    expect(outro.updates[`${L}/motivos`].R2.i01).toMatchObject({ por: "u1", valor: 97 });
    // Mudou o número: o carimbo passa a ser de quem mudou.
    const mudou = planoSalvarLote({ ...base, lote: l2, rascunho: { ...semTexto, celulas: { R1: { i01: 98, i02: 2 }, R2: { i01: 96, i02: 4 } } }, autor: { uid: "u2", nome: "Ana" }, contexto: ctx() });
    expect(mudou.updates[`${L}/motivos`].R2.i01).toMatchObject({ por: "u2", valor: 96 });
    // Trocou o material da linha mantendo o número: também é mudança de quem trocou.
    const troca = { ...semTexto, ingredientes: { ...semTexto.ingredientes, i01: { nome: "Água deionizada", fase: "A", master_material_id: "M9" } } };
    const trocou = planoSalvarLote({ ...base, lote: l2, rascunho: troca, autor: { uid: "u2", nome: "Ana" }, contexto: ctx() });
    expect(trocou.updates[`${L}/motivos`].R2.i01).toMatchObject({ por: "u2", chave: "M9|a" });
  });
  test("mesmo conteúdo: sem mudança, nenhum caminho", () => {
    const l2 = { ...lote, revisao: 2, ...rascunho, membros: { R1: { ...lote.membros.R1, quantidade_g: 50 }, R2: { ...lote.membros.R2, quantidade_g: 30 } },
      motivos: { R2: { i01: { texto: "mais fragrância", por: "u1", em: "x", valor: 97, nivel: 2 } } } };
    const r = planoSalvarLote({ ...base, lote: l2, contexto: ctx() });
    expect(r.resumo.semMudanca).toBe(true);
    expect(r.updates).toEqual({});
  });
});

describe("auditoria LM-15: crítico não se contorna pelo lote", () => {
  const fenox = (pct) => item("Fenoxietanol", pct);
  const origemB = [item("Água", 99.5), fenox(0.5)];
  const matrizA = [item("Água", 98), fenox(2)];
  const mm = montarMatriz({ matrizItens: matrizA, membros: [{ request_id: "A", itens: matrizA }, { request_id: "B", itens: origemB }] });
  const materiais = new Map([["FENOXIETANOL", { mpNome: "Fenoxietanol", criticoPd: true }]]);
  const ingredientes = classificarIngredientes(mm.ingredientes, { materiais });
  const kF = Object.keys(ingredientes).find((x) => ingredientes[x].nome === "Fenoxietanol");
  const origem = { A: celulasDaOrigem(ingredientes, matrizA).celulas, B: celulasDaOrigem(ingredientes, origemB).celulas };
  test("Clonar matriz não muda um crítico da amostra sem aprovação (compara com a fórmula anterior dela)", () => {
    const celulas = clonar(mm.celulas, { de: "matriz", para: ["B"], matrizCelulas: mm.matrizCelulas });
    expect(diferencas({ ingredientes, celulas, matrizCelulas: mm.matrizCelulas }).B).toEqual([]); // igual à matriz…
    const d = diferencasDoLote({ ingredientes, celulas, matrizCelulas: mm.matrizCelulas, origem });
    expect(d.B).toEqual([expect.objectContaining({ ingKey: kF, de: 0.5, para: 2, nivel: NIVEL.CRITICO, daAmostra: true })]);
    const p = pendencias({ ingredientes, celulas, matrizCelulas: mm.matrizCelulas, membros: ["A", "B"], origem });
    expect(p.map((x) => `${x.request_id}:${x.tipo}`)).toEqual(["B:aprovacao"]); // …mas muda a amostra B (sem pedir comentário)
  });
  test("crítico também pelo nome do material marcado (tirar o id não descaracteriza)", () => {
    const semId = classificarIngredientes({ i09: { nome: "fenoxietanol", fase: "A" } }, { materiais });
    expect(semId.i09.critico).toBe(true);
  });
  test("chave fantasma não fecha 100 %; linha de origem fora do lote aparece", () => {
    const celulas = { B: { [kF]: 0.5, i99: 99.5 } };
    expect(fechamentoPorMembro(celulas, ["B"]).B.ok).toBe(true); // sem os ingredientes, soma tudo
    expect(fechamentoPorMembro(celulas, ["B"], ingredientes).B.ok).toBe(false);
    const { fora } = celulasDaOrigem({ [kF]: ingredientes[kF] }, origemB);
    expect(fora).toEqual(["Água"]);
    expect(chaveMaterialFase(ingredientes[kF])).toBe("FENOXIETANOL|a");
  });
  test("composição de amostra retirada do lote não vale para o Kickoff", () => {
    expect(composicaoValida({ lote_manipulacao: { formula_id: "V1", composicao: [{ nome: "Água", pct: 1 }], removido_em: "x" } })).toBeNull();
  });
});

