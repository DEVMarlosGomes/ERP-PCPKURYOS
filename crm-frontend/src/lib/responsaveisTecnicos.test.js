import { describe, expect, test } from "vitest";
import { responsavelPeloNome, rotuloResponsavel, validarResponsavel } from "./responsaveisTecnicos";

const ANA = { id: "r1", nome: "Ana Souza", registro_profissional: "CRQ 04123456", vinculo: "kuryos" };

describe("responsável técnico (KO-06)", () => {
  test("cadastro: nome e vínculo obrigatórios; e-mail conferido; texto limpo", () => {
    const v = validarResponsavel({ nome: "  João  da Silva ", registro_profissional: "crf 123", email: "JOAO@X.COM", vinculo: "cliente", cliente_id: "c1" });
    expect(v.ok).toBe(true);
    expect(v.registro).toMatchObject({ nome: "João da Silva", registro_profissional: "CRF 123", email: "joao@x.com", vinculo: "cliente", cliente_id: "c1" });
    expect(validarResponsavel({ nome: "Jo", vinculo: "outro", email: "x" }).erros).toEqual(["Informe o nome completo.", "Informe o vínculo: Kuryos ou cliente.", "E-mail inválido."]);
  });
  test("mesma pessoa não entra duas vezes; registro de outra pessoa é recusado", () => {
    const dup = validarResponsavel({ nome: "ana souza", registro_profissional: "crq 04123456", vinculo: "kuryos" }, [ANA]);
    expect(dup.ok).toBe(false);
    expect(dup.duplicado).toBe(ANA);
    expect(validarResponsavel({ nome: "Bruno Lima", registro_profissional: "CRQ 04123456", vinculo: "kuryos" }, [ANA]).erros)
      .toEqual(["O registro CRQ 04123456 já pertence a outra pessoa."]);
    expect(validarResponsavel({ id: "r1", nome: "Ana Souza", registro_profissional: "CRQ 04123456", vinculo: "kuryos" }, [ANA]).ok).toBe(true);
  });
  test("menu e Kickoff antigo com o nome em texto", () => {
    expect(rotuloResponsavel(ANA)).toBe("Ana Souza · CRQ 04123456 · Kuryos");
    expect(responsavelPeloNome([ANA], "ANA SOUZA")).toBe(ANA);
    expect(responsavelPeloNome([ANA], "")).toBeNull();
  });
});
