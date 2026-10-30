import { formaFisicaDoCrm, modeloServicoDoCrm, registroAnvisaDoCrm, servicosDaProposta, volumeDaVariacao } from "./bloco0DoCrm";

describe("KO-10: Bloco 0 do Kickoff a partir do CRM", () => {
  test("forma física: texto livre do CRM vira a opção do Kickoff; sem casar vai em 'outro' com o texto", () => {
    expect(formaFisicaDoCrm("Creme leve").forma_fisica).toBe("creme_gel");
    expect(formaFisicaDoCrm("Gel fluido").forma_fisica).toBe("creme_gel");
    expect(formaFisicaDoCrm("Body splash").forma_fisica).toBe("liquido");
    expect(formaFisicaDoCrm("Pó compacto").forma_fisica).toBe("po");
    expect(formaFisicaDoCrm("Batom em bastão").forma_fisica).toBe("bastao");
    expect(formaFisicaDoCrm("Aerossol 150 mL").forma_fisica).toBe("aerossol");
    expect(formaFisicaDoCrm("liquido").forma_fisica).toBe("liquido");
    expect(formaFisicaDoCrm("Patch adesivo de microagulhas")).toEqual({ forma_fisica: "outro", forma_fisica_outro: "Patch adesivo de microagulhas" });
    expect(formaFisicaDoCrm("", null, "Loção")).toEqual({ forma_fisica: "creme_gel", forma_fisica_outro: "" });
    expect(formaFisicaDoCrm()).toEqual({ forma_fisica: "", forma_fisica_outro: "" });
  });

  test("tipo de serviço do CRM → classificação do Kickoff", () => {
    expect(modeloServicoDoCrm("desenvolvimento_completo")).toBe("industrializacao_com_desenvolvimento");
    expect(modeloServicoDoCrm("adaptacao_formula")).toBe("industrializacao_com_desenvolvimento");
    expect(modeloServicoDoCrm("industrializacao")).toBe("industrializacao_pura");
    expect(modeloServicoDoCrm("private_label")).toBe("full_service_marca_propria");
    expect(modeloServicoDoCrm("formula_do_cliente")).toBe("industrializacao_pura");
    expect(modeloServicoDoCrm("")).toBe("");
  });

  test("volume da variação, serviços do orçamento e ANVISA", () => {
    expect(volumeDaVariacao({ volume: "120", unidade_volume: "ml" })).toBe("120 ml");
    expect(volumeDaVariacao({})).toBe("");
    expect(servicosDaProposta({ composicao: { servicos: [{ servico_id: "s1" }, { servico_id: "s2" }, { servico_id: "s1" }] } })).toEqual(["s1", "s2"]);
    expect(servicosDaProposta({})).toEqual([]);
    expect(registroAnvisaDoCrm("sim")).toBe("existe");
    expect(registroAnvisaDoCrm("nao")).toBe("a_providenciar");
    expect(registroAnvisaDoCrm("talvez")).toBe("");
  });
});
