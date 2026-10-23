import { describe, expect, test } from "vitest";
import { BLOCOS_DA_ETAPA, aguardaPd, assinaturaDoBloco, congelarTodos, estadoDosBlocos, validarBlocos } from "./kickoffBlocos";
import { pendenciasQuestionario } from "./kickoffPendencias";

const q0 = () => ({
  bloco0: { cliente: "Lumi", nome_produto: "Body Splash", categoria: "perfumaria", forma_fisica: "liquido", volume_gramatura: "200", numero_skus_variacoes: "4", modelo_servico: "full_service_marca_propria" },
  bloco1: { formula: "desenvolvida_kuryos", cliente_fornece: ["nada"], tem_cor: "nao", tem_brilho_mica_glitter: "nao", viscosidade: "baixa", densidade: "0,98", compra_fragrancia_por: "kuryos" },
  bloco2: { componentes: [{ id: "frasco", componente: "Frasco", aplicavel: "" }] },
  bloco3: { componentes: [] }, bloco4: { componentes: [] },
  bloco5: { especificacoes_cq_componentes: "", testes_aprovacoes_obrigatorios: "" },
  fechamento: {},
});
const calc = (q, anterior, extra = {}) => estadoDosBlocos({ questionario: q, pendencias: pendenciasQuestionario(q).status, anterior, ...extra });

describe("estado por bloco (RFC-001)", () => {
  test("etapas e donos (D-1)", () => {
    expect(BLOCOS_DA_ETAPA).toEqual({ direcao: [], comercial: ["bloco0", "fechamento"], lider_pd: ["bloco1"], eng_produto: ["bloco2", "bloco3", "bloco4"], cq: ["bloco5"] });
  });
  test("não iniciado / em preenchimento / pronto são calculados", () => {
    const { estados } = calc(q0());
    expect(estados.bloco0.estado).toBe("pronto");
    expect(estados.bloco2.estado).toBe("nao_iniciado"); // só o nome padrão do componente
    expect(estados.fechamento.estado).toBe("nao_iniciado");
    const q = q0(); q.bloco5.especificacoes_cq_componentes = "AQL";
    expect(calc(q).estados.bloco5.estado).toBe("em_preenchimento");
  });
  test("validar exige pronto; o P&D pendente trava o bloco 1", () => {
    const q = q0();
    const { estados } = calc(q, {}, { aguardandoPd: true });
    const assinaturas = { bloco0: assinaturaDoBloco(q, "bloco0"), bloco1: assinaturaDoBloco(q, "bloco1"), bloco5: assinaturaDoBloco(q, "bloco5") };
    const r = validarBlocos(estados, ["bloco0", "bloco1", "bloco5"], { assinaturas, quem: "u1", quemNome: "Ana", agora: "t" });
    expect(r.estados.bloco0).toMatchObject({ estado: "validado", validado_por_nome: "Ana", assinatura: assinaturas.bloco0 });
    expect(r.erros).toEqual(["bloco1: aguardando o P&D registrar a fórmula", "bloco5: Não iniciado (complete antes de validar)"]);
  });
  test("validado que muda perde a validação (invalidação explícita); igual continua validado", () => {
    const q = q0();
    const { estados } = calc(q);
    const v = validarBlocos(estados, ["bloco0"], { assinaturas: { bloco0: assinaturaDoBloco(q, "bloco0") }, quem: "u", quemNome: "Ana", agora: "t" }).estados;
    expect(calc(q, v).estados.bloco0.estado).toBe("validado");
    const mudou = q0(); mudou.bloco0.volume_gramatura = "250";
    const r = calc(mudou, v);
    expect(r.invalidados).toEqual(["bloco0"]);
    expect(r.estados.bloco0).toMatchObject({ estado: "pronto", invalidado_em: true });
  });
  test("Kickoff aprovado congela tudo", () => {
    const { estados } = calc(q0());
    expect(Object.values(congelarTodos(estados)).every((e) => e.estado === "congelado")).toBe(true);
  });
  test("aguarda P&D: sem fórmula vinculada, salvo fórmula do cliente", () => {
    expect(aguardaPd({ formula_id: null }, { bloco1: { formula: "desenvolvida_kuryos" } })).toBe(true);
    expect(aguardaPd({ formula_id: null }, { bloco1: { formula: "do_cliente" } })).toBe(false);
    expect(aguardaPd({ formula_id: "F1" }, {})).toBe(false);
  });
});
