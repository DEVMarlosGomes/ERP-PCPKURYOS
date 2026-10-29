import {
  campoDoEnsaio, filtrarOpcoes, mesclarEspecificacoes, opcoesParaPuxar, rotuloOrigem, textoDaEspecificacao, versaoParaPuxar,
} from "./especificacoesCadastro";

const ESPEC = {
  P1__v1: { codProduto: "P1", versao: 1, status: "APROVADA", itens: { a: { ensaio: "PH", minimo: "5,5", maximo: "6,5" } } },
  P1__v2: { codProduto: "P1", versao: 2, status: "APROVADA", itens: {
    a: { ensaio: "ASPECTO", especificacaoTexto: "LÍQUIDO LÍMPIDO" },
    b: { ensaio: "PH", minimo: "5,0", maximo: "6,0" },
    c: { ensaio: "TEOR DE ÁLCOOL", minimo: "70" },
    d: { ensaio: "APLICAÇÃO EM MECHA", especificacaoTexto: "SEM RESÍDUO" },
    e: { ensaio: "COR", especificacaoTexto: "" },
  } },
  P1__v3: { codProduto: "P1", versao: 3, status: "RASCUNHO", itens: { a: { ensaio: "PH", minimo: "4" } } },
  P2__v1: { codProduto: "P2", versao: 1, status: "RASCUNHO", itens: { a: { ensaio: "ODOR", especificacaoTexto: "CARACTERÍSTICO" } } },
  P3__v1: { codProduto: "P3", versao: 1, status: "RASCUNHO", itens: {} },
};
const PRODUTOS = {
  P1: { sku: "PRF-JOHN-0001", descricao: "Body Splash Johns Wood", cliente: "JOHN" },
  P2: { sku: "CAB-GUST-0001", descricao: "Shampoo Gust" },
  P3: { sku: "SEM-ESPEC-0001", descricao: "Sem especificação" },
  P4: { sku: "INATIVO-0001", descricao: "Inativo", ativo: false },
};

describe("PD-06: puxar especificações do Cadastros para a Ficha Técnica", () => {
  test("ensaio do Cadastros → linha da ficha; texto e faixa", () => {
    expect(campoDoEnsaio("Teor de Álcool")).toBe("teor_alcool");
    expect(campoDoEnsaio("PH")).toBe("ph");
    expect(campoDoEnsaio("APLICAÇÃO EM MECHA")).toBeNull();
    expect(textoDaEspecificacao({ especificacaoTexto: "Límpido", minimo: "0,98", maximo: "1,02" })).toBe("Límpido · 0,98 a 1,02");
    expect(textoDaEspecificacao({ minimo: "70" })).toBe("mín. 70");
    expect(textoDaEspecificacao({ maximo: "6" })).toBe("máx. 6");
  });

  test("versão: a aprovada mais nova (rascunho mais novo fica de fora); sem aprovada, a mais nova com itens", () => {
    expect(versaoParaPuxar(ESPEC, "P1")).toMatchObject({ chave: "P1__v2", versao: 2, status: "APROVADA" });
    expect(versaoParaPuxar(ESPEC, "P2")).toMatchObject({ chave: "P2__v1", status: "RASCUNHO" });
    expect(versaoParaPuxar(ESPEC, "P3")).toBeNull();
  });

  test("opções por SKU ou produto de referência (só ativos com especificação)", () => {
    const opcoes = opcoesParaPuxar(PRODUTOS, ESPEC);
    expect(opcoes.map((o) => o.sku)).toEqual(["CAB-GUST-0001", "PRF-JOHN-0001"]);
    expect(filtrarOpcoes(opcoes, "john").map((o) => o.sku)).toEqual(["PRF-JOHN-0001"]);
    expect(filtrarOpcoes(opcoes, "shampoo").map((o) => o.sku)).toEqual(["CAB-GUST-0001"]);
  });

  test("merge: só preenche o vazio, guarda origem e versão, e diz o que ficou de fora", () => {
    const form = {
      aspecto: { especificacao: "", resultado: "Conforme", pa: "Conforme" },
      ph: { especificacao: "5,8 (digitado pelo P&D)", resultado: "", pa: "" },
      teor_alcool: { especificacao: "", resultado: "", pa: "" },
      cor: { especificacao: "", resultado: "", pa: "" },
    };
    const opcao = opcoesParaPuxar(PRODUTOS, ESPEC).find((o) => o.sku === "PRF-JOHN-0001");
    const r = mesclarEspecificacoes(form, opcao, { em: "2026-10-29T20:00:00Z", por: "Yasmim" });
    expect(r.preenchidos).toEqual(["aspecto", "teor_alcool"]);
    expect(r.mantidos).toEqual(["ph"]);
    expect(r.semCorrespondencia).toEqual(["APLICAÇÃO EM MECHA"]);
    expect(r.form.ph.especificacao).toBe("5,8 (digitado pelo P&D)");
    expect(r.form.ph.especificacao_origem).toBeUndefined();
    expect(r.form.cor.especificacao).toBe(""); // item do Cadastros sem texto nem faixa não preenche
    expect(r.form.aspecto).toMatchObject({ especificacao: "LÍQUIDO LÍMPIDO", resultado: "Conforme", pa: "Conforme",
      especificacao_origem: { fonte: "cadastros", sku: "PRF-JOHN-0001", versao: 2, chave: "P1__v2", status: "APROVADA", puxado_em: "2026-10-29T20:00:00Z" } });
    expect(r.form.teor_alcool.especificacao).toBe("mín. 70");
    expect(r.form.especificacoes_origem).toMatchObject({ sku: "PRF-JOHN-0001", versao: 2, campos: ["aspecto", "teor_alcool"] });
    expect(rotuloOrigem(r.form.aspecto.especificacao_origem)).toBe("do Cadastros · PRF-JOHN-0001 v2");
    expect(form.aspecto.especificacao).toBe(""); // não muta a ficha original
  });

  test("puxar de novo não sobrescreve o que já veio", () => {
    const opcao = opcoesParaPuxar(PRODUTOS, ESPEC).find((o) => o.sku === "PRF-JOHN-0001");
    const uma = mesclarEspecificacoes({}, opcao).form;
    const duas = mesclarEspecificacoes(uma, opcoesParaPuxar(PRODUTOS, ESPEC).find((o) => o.sku === "CAB-GUST-0001"));
    expect(duas.preenchidos).toEqual(["odor"]);
    expect(duas.form.ph.especificacao_origem.sku).toBe("PRF-JOHN-0001");
  });
});
