import { describe, expect, test } from "vitest";
import {
  CATALOGO_PADRAO, OUTRO, TIPO_OUTRO, atributosPendentes, escolherTipo, especificacaoDasCaracteristicas, mesclarCatalogo,
  tiposDaLinha, validarTipoComponente,
} from "./tiposComponente";
import { pendenciasQuestionario } from "./kickoffPendencias";
import { linhasDeEmbalagem } from "./kickoffBom";

const POTE = CATALOGO_PADRAO.find((tp) => tp.codigo === "POTE");

describe("Catálogo de tipos de componente (KO-04)", () => {
  test("as 21 linhas padrão têm tipos; Frasco / pote / bisnaga vira menu com os três", () => {
    const linhas = ["frasco_pote_bisnaga", "airless_rollon_ampola", "tampa", "valvula_pump", "valvula_spray", "valvula_aerossol_atuador",
      "gatilho_trigger", "batoque_redutor_orificio", "lacre_inducao_disco", "aplicador"];
    for (const l of linhas) expect(tiposDaLinha(CATALOGO_PADRAO, "bloco2", l).every((tp) => tp.linha === l)).toBe(true);
    expect(tiposDaLinha(CATALOGO_PADRAO, "bloco2", "frasco_pote_bisnaga").map((tp) => tp.nome)).toEqual(["Frasco", "Pote", "Bisnaga"]);
    for (const l of ["rotulo", "cartucho", "bula_folheto", "selo_lacre_seguranca", "celofane_shrink", "berco_suporte_interno"]) {
      expect(tiposDaLinha(CATALOGO_PADRAO, "bloco3", l)[0].linha).toBe(l);
    }
    for (const l of ["display_expositor_pdv", "caixa_master", "divisoria_colmeia", "cantoneira", "paletizacao"]) {
      expect(tiposDaLinha(CATALOGO_PADRAO, "bloco4", l)[0].linha).toBe(l);
    }
    // Componente acrescentado à mão vê todos os tipos do nível.
    expect(tiposDaLinha(CATALOGO_PADRAO, "bloco3", "custom_1").length).toBe(6);
    // Todo menu tem opções; nenhuma opção carrega barra (o defeito era texto livre com barras).
    for (const tp of CATALOGO_PADRAO) for (const a of tp.atributos) {
      if (a.tipo === "enum") expect(a.opcoes.length).toBeGreaterThan(0);
      expect(a.inclui_outro).toBe(a.tipo === "enum");
    }
  });

  test("escolher Pote → atributos do pote; valores montam a especificação, com Outro e complemento", () => {
    let linha = { id: "frasco_pote_bisnaga", ...escolherTipo({}, POTE) };
    expect(linha.atributos_def.map((d) => d.chave)).toEqual(["formato", "capacidade", "material", "cor", "rosca", "tipo_tampa", "material_cor_tampa", "batoque_selo", "acabamento", "decoracao"]);
    linha = { ...linha, atributos: { formato: "Redondo", capacidade: "250", material: OUTRO, rosca: "63/400" },
      atributos_outro: { material: "PCR 50%" }, atributos_unidade: { capacidade: "g" }, especificacao_complemento: "fundo grosso" };
    expect(especificacaoDasCaracteristicas(linha)).toBe("Pote · Formato: Redondo · Capacidade: 250 g · Material: PCR 50% · Rosca: 63/400 · fundo grosso");
    expect(atributosPendentes(linha).map((d) => d.chave)).toEqual(["cor", "tipo_tampa", "material_cor_tampa", "batoque_selo", "acabamento", "decoracao"]);
    // Outro sem texto continua pendente.
    expect(atributosPendentes({ ...linha, atributos_outro: {} }).map((d) => d.chave)).toContain("material");
  });

  test("trocar de tipo mantém só os atributos que o novo também tem", () => {
    const frasco = CATALOGO_PADRAO.find((tp) => tp.codigo === "FRASCO");
    const linha = { ...escolherTipo({}, POTE), atributos: { formato: "Redondo", batoque_selo: "Batoque" } };
    expect(escolherTipo(linha, frasco).atributos).toEqual({ formato: "Redondo" });
    expect(escolherTipo(linha, TIPO_OUTRO)).toMatchObject({ tipo_componente: TIPO_OUTRO, atributos_def: [] });
  });

  test("pendências: produto novo exige os atributos obrigatórios; item do Cadastros dispensa", () => {
    const base = { id: "frasco_pote_bisnaga", componente: "Frasco / pote / bisnaga", aplicavel: "sim", definido: "sim", fornecido_por: "kuryos", qtd_por_unidade: 1 };
    const comTipo = { ...base, ...escolherTipo({}, POTE), atributos: { formato: "Redondo" } };
    const p = pendenciasQuestionario({ bloco2: { componentes: [comTipo] } }).status.bloco2.pendencias;
    expect(p.map((x) => x.rotulo)).toContain("Frasco / pote / bisnaga: Capacidade");
    expect(p.some((x) => x.campo.endsWith("especificacao_fornecedor_codigo"))).toBe(false);
    const cadastrado = { ...comTipo, material_codigo: "EP-00089", material_nome: "POTE 250G" };
    expect(pendenciasQuestionario({ bloco2: { componentes: [cadastrado] } }).status.bloco2.pendencias).toEqual([]);
    const outro = { ...base, ...escolherTipo({}, TIPO_OUTRO) };
    expect(pendenciasQuestionario({ bloco2: { componentes: [outro] } }).status.bloco2.pendencias.map((x) => x.campo)).toEqual(["componentes[0].tipo_componente_outro"]);
    // Linha antiga sem tipo, com especificação escrita, segue valendo.
    expect(pendenciasQuestionario({ bloco2: { componentes: [{ ...base, especificacao_fornecedor_codigo: "Pote PP 250g" }] } }).status.bloco2.pendencias).toEqual([]);
  });

  test("o BOM leva a especificação montada", () => {
    const linha = { id: "tampa", componente: "Tampa", aplicavel: "sim", definido: "sim", fornecido_por: "kuryos", qtd_por_unidade: 1,
      ...escolherTipo({}, CATALOGO_PADRAO.find((tp) => tp.codigo === "TAMPA")), atributos: { tipo: "Flip-top", rosca: "24/410" } };
    const [l] = linhasDeEmbalagem({ bloco2: { componentes: [linha] } }, { volumePedido: 10 });
    expect(l).toMatchObject({ especificacao: "Tampa · Tipo: Flip-top · Rosca: 24/410", descricao: "Tampa · Tipo: Flip-top · Rosca: 24/410", tipo_componente: "TAMPA" });
  });

  test("catálogo do banco sobrescreve, acrescenta e esconde sem deploy", () => {
    const cat = mesclarCatalogo(CATALOGO_PADRAO, {
      POTE: { ...POTE, nome: "Pote (revisado)" },
      ESTOJO: { nome: "Estojo", nivel_embalagem: "secundaria", linha: "cartucho", atributos: { 0: { chave: "material", nome: "Material", tipo: "texto" } } },
      APLICADOR: { ...CATALOGO_PADRAO.find((tp) => tp.codigo === "APLICADOR"), ativo: false },
      LIXO: "x",
    });
    expect(cat.find((tp) => tp.codigo === "POTE").nome).toBe("Pote (revisado)");
    expect(tiposDaLinha(cat, "bloco3", "cartucho").map((tp) => tp.codigo)).toEqual(["CARTUCHO", "ESTOJO"]);
    expect(cat.some((tp) => tp.codigo === "APLICADOR")).toBe(false);
  });

  test("validação do tipo gravado pelo ADM", () => {
    const ok = validarTipoComponente({ codigo: "estojo", nome: "Estojo", nivel_embalagem: "secundaria",
      atributos: [{ nome: "Material do estojo", tipo: "enum", opcoes: ["Cartão", "Outro", "Cartão"] }, { nome: "Altura", tipo: "numero_unidade", unidades: ["mm"] }] });
    expect(ok.ok).toBe(true);
    expect(ok.tipo.codigo).toBe("ESTOJO");
    expect(ok.tipo.atributos[0]).toMatchObject({ chave: "material_do_estojo", opcoes: ["Cartão"], inclui_outro: true });
    const ruim = validarTipoComponente({ codigo: "x", nome: "", nivel_embalagem: "quaternaria", atributos: [{ nome: "Cor", tipo: "enum", opcoes: [] }, { nome: "Cor", tipo: "texto" }] });
    expect(ruim.ok).toBe(false);
    expect(ruim.erros.length).toBe(5);
  });
});
