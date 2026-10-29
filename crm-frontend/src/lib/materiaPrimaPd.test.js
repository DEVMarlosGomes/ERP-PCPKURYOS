import { ehMateriaPrimaPd, filtrarMateriaisPd, ingredienteEhEmbalagem, tiposDoFiltro } from "./materiaPrimaPd";

describe("PD-02: ingrediente do P&D é só MPES/MPGR", () => {
  const cadastro = [
    { nome: "GLICERINA", tipo_material: "MPGR", codigo_interno: "MPGR-00008" },
    { nome: "FRAGRÂNCIA FLORAL", tipo_material: "MPES", codigo_interno: "MPES-00010" },
    { nome: "FRASCO PET 120ML", tipo_material: "EP", codigo_interno: "EP-00001", categoria: "embalagem" },
    { nome: "CAIXA DISPLAY", tipo_material: "ES", codigo_interno: "ES-00004", categoria: "embalagem" },
    { nome: "ETIQUETA FRONTAL", tipo_material: "ET", codigo_interno: "ET-00012", categoria: "embalagem" },
    { nome: "LUVA NITRÍLICA", tipo_material: "MU", codigo_interno: "MU-00002" },
    { nome: "Manteiga do banco de custos", categoria: "Catálogo" }, // item do P&D sem vínculo com o Cadastros
    { nome: "Frasco antigo do banco", categoria: "embalagem" },
  ];

  test("só MPES e MPGR do Cadastros; item do banco de custos sem tipo fica se não for embalagem", () => {
    expect(filtrarMateriaisPd(cadastro).map((m) => m.nome)).toEqual(["GLICERINA", "FRAGRÂNCIA FLORAL", "Manteiga do banco de custos"]);
  });

  test("buscar 'frasco' no que sobra não traz nada", () => {
    expect(filtrarMateriaisPd(cadastro).filter((m) => m.nome.toLowerCase().includes("frasco"))).toEqual([]);
  });

  test("tipo em minúsculas e lista do filtro vinda da URL", () => {
    expect(ehMateriaPrimaPd({ tipo_material: "mpgr" })).toBe(true);
    expect(tiposDoFiltro("mpes, MPGR")).toEqual(["MPES", "MPGR"]);
    expect(tiposDoFiltro("")).toBeNull();
    expect(filtrarMateriaisPd(cadastro, tiposDoFiltro("MPES")).map((m) => m.codigo_interno)).toEqual(["MPES-00010", undefined]);
  });

  test("ingrediente já gravado com embalagem é reconhecido para o aviso (não some)", () => {
    expect(ingredienteEhEmbalagem({ ingredient_name: "Frasco", material_code: "EP-00001" })).toBe(true);
    expect(ingredienteEhEmbalagem({ ingredient_name: "Etiqueta", material_code: "ET-00012" })).toBe(true);
    expect(ingredienteEhEmbalagem({ ingredient_name: "Glicerina", material_code: "MPGR-00008" })).toBe(false);
    expect(ingredienteEhEmbalagem({ ingredient_name: "Digitado à mão" })).toBe(false);
  });
});
