import { describe, expect, it } from "vitest";
import { cli4For, cli4Valido, sugestoesCli4 } from "@/lib/cli4";

describe("CLI4 (CRM-02)", () => {
  it("sugere de 3 a 5 códigos livres a partir do nome", () => {
    const s = sugestoesCli4("Kuryos Beauty", new Set());
    expect(s[0]).toBe("KURY");
    expect(s).toContain("KUBE");
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.length).toBeLessThanOrEqual(5);
    expect(s.every(cli4Valido)).toBe(true);
  });

  it("código já usado nunca aparece e não repete", () => {
    const s = sugestoesCli4("Kuryos Beauty", new Set(["KURY", "KUBE"]));
    expect(s).not.toContain("KURY");
    expect(s).not.toContain("KUBE");
    expect(new Set(s).size).toBe(s.length);
    expect(s.length).toBeGreaterThanOrEqual(3);
  });

  it("nome de uma palavra, curto, com acento e número", () => {
    expect(sugestoesCli4("Ômega", new Set())[0]).toBe("OMEG");
    expect(sugestoesCli4("Jo", new Set())[0]).toBe("JOXX");
    expect(sugestoesCli4("3M Brasil", new Set()).every(cli4Valido)).toBe(true);
    expect(sugestoesCli4("", new Set())).toEqual([]);
  });

  it("cli4For mantém a regra do cadastro mestre", () => {
    expect(cli4For("Lumi Cosméticos", new Set())).toBe("LUMI");
    expect(cli4For("Lumi Cosméticos", new Set(["LUMI"]))).toBe("LUM2");
  });
});
