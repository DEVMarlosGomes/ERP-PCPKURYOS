import { describe, expect, test } from "vitest";
import { pendenciasDaLinha, pendenciasQuestionario, simNao } from "./kickoffPendencias";

const completo = () => ({
  bloco0: { cliente: "Lumi", nome_produto: "Body Splash", categoria: "perfumaria", forma_fisica: "liquido", volume_gramatura: "200 mL", numero_skus_variacoes: "4", modelo_servico: "full_service_marca_propria" },
  bloco1: { formula: "desenvolvida_kuryos", cliente_fornece: ["nada"], tem_cor: "nao", tem_brilho_mica_glitter: "nao", viscosidade: "baixa", densidade: "0,98", compra_fragrancia_por: "kuryos" },
  bloco2: { componentes: [{ componente: "Frasco", aplicavel: "sim", definido: "sim", fornecido_por: "kuryos", especificacao_fornecedor_codigo: "PET 200 mL" }] },
  bloco3: { componentes: [{ componente: "Rótulo", aplicavel: "sim", definido: "sim", fornecido_por: "cliente", especificacao_fornecedor_codigo: "BOPP branco 80×60", arte_cria_aprova: "cliente", arte_aprovada: "nao" }] },
  bloco4: { componentes: [{ componente: "Display", aplicavel: "nao" }] },
  bloco5: { especificacoes_cq_componentes: "AQL 1,0", testes_aprovacoes_obrigatorios: "Estabilidade", amostra_referencia_fornecida_cliente: "nao" },
  fechamento: { data_prevista_inicio_producao: "2026-11-10", volume_primeiro_lote: "5000", responsavel_kuryos: "Ana", responsavel_cliente: "Maria", data_preenchimento: "2026-10-23" },
});

describe("pendências do Kickoff (KO-03)", () => {
  test("três estados: vazio não é Não", () => {
    expect([simNao(""), simNao(null), simNao(undefined), simNao("nao"), simNao(false), simNao("Sim"), simNao(true)])
      .toEqual(["", "", "", "nao", "nao", "sim", "sim"]);
  });
  test("tudo respondido (com Nãos) não tem pendência", () => {
    expect(pendenciasQuestionario(completo()).ok).toBe(true);
  });
  test("Não elimina a pendência; pergunta não respondida é pendência", () => {
    const q = completo();
    q.bloco1.tem_cor = "";
    const r = pendenciasQuestionario(q);
    expect(r.ok).toBe(false);
    expect(r.status.bloco1.pendencias).toEqual([{ campo: "tem_cor", rotulo: "Tem cor?" }]);
  });
  test("Sim sem o complemento lista o campo pelo nome; com o complemento passa", () => {
    const q = completo();
    q.bloco1.tem_cor = "sim";
    expect(pendenciasQuestionario(q).status.bloco1.pendencias).toEqual([{ campo: "cor_descricao", rotulo: "Qual cor (descrição / código)" }]);
    q.bloco1.cor_descricao = "Rosa Pantone 1767C";
    expect(pendenciasQuestionario(q).status.bloco1.completo).toBe(true);
    q.bloco5.amostra_referencia_fornecida_cliente = "sim";
    expect(pendenciasQuestionario(q).status.bloco5.campos_pendentes).toEqual(["amostra_referencia_descricao"]);
  });
  test("componente: Aplicável vazio pende; Não não pende; Sim exige Definido; Definido Não não pende", () => {
    expect(pendenciasDaLinha({ aplicavel: "" })).toEqual(["aplicavel"]);
    expect(pendenciasDaLinha({ aplicavel: "nao", fornecido_por: "" })).toEqual([]);
    expect(pendenciasDaLinha({ aplicavel: "sim" })).toEqual(["definido"]);
    expect(pendenciasDaLinha({ aplicavel: "sim", definido: "nao" })).toEqual([]);
    expect(pendenciasDaLinha({ aplicavel: "sim", definido: "sim" })).toEqual(["fornecido_por", "especificacao_fornecedor_codigo"]);
    // KO-05: na secundária o item também é obrigatório (Compras cota rótulo e cartucho).
    expect(pendenciasDaLinha({ aplicavel: "sim", definido: "sim", fornecido_por: "kuryos" }, true)).toEqual(["especificacao_fornecedor_codigo", "arte_cria_aprova", "arte_aprovada"]);
  });
  test("pendência de componente aparece com o nome do componente", () => {
    const q = completo();
    q.bloco2.componentes.push({ componente: "Tampa", aplicavel: "sim", definido: "sim", fornecido_por: "" , especificacao_fornecedor_codigo: "PP 24/410" });
    expect(pendenciasQuestionario(q).status.bloco2.pendencias).toEqual([{ campo: "componentes[1].fornecido_por", rotulo: "Tampa: Fornecido por" }]);
  });
});

describe("fornecido por e item do Cadastros (KO-05)", () => {
  test("textos antigos convertidos como medido na base", async () => {
    const { normalizarFornecidoPor } = await import("./kickoffPendencias");
    expect(normalizarFornecidoPor("KURYOS")).toEqual({ fornecido_por: "kuryos" });
    expect(normalizarFornecidoPor("Cliente")).toEqual({ fornecido_por: "cliente" });
    expect(normalizarFornecidoPor("ok")).toEqual({ fornecido_por: "" });
    expect(normalizarFornecidoPor("GRÁFICA X")).toEqual({ fornecido_por: "kuryos", fornecedor_nome: "GRÁFICA X" });
  });
  test("'ok' antigo vira pendência; nome de fornecedor vira Kuryos + fornecedor", () => {
    expect(pendenciasDaLinha({ aplicavel: "sim", definido: "sim", fornecido_por: "ok", especificacao_fornecedor_codigo: "PET" })).toEqual(["fornecido_por"]);
    expect(pendenciasDaLinha({ aplicavel: "sim", definido: "sim", fornecido_por: "PLASTSUL", especificacao_fornecedor_codigo: "PET" })).toEqual([]);
  });
  test("item do Cadastros vale como especificação; item novo exige descrição; quantidade > 0", () => {
    const base = { aplicavel: "sim", definido: "sim", fornecido_por: "kuryos" };
    expect(pendenciasDaLinha({ ...base, material_codigo: "EP-00001", qtd_por_unidade: 1 })).toEqual([]);
    expect(pendenciasDaLinha({ ...base, item_novo: true, item_novo_descricao: "", qtd_por_unidade: "2" })).toEqual(["item_novo_descricao"]);
    expect(pendenciasDaLinha({ ...base, material_codigo: "EP-00001", qtd_por_unidade: 0 })).toEqual(["qtd_por_unidade"]);
    expect(pendenciasDaLinha({ ...base, material_codigo: "ET-00017", unidades_por_embalagem: "" }, false, "bloco4")).toEqual(["unidades_por_embalagem"]);
  });
});
