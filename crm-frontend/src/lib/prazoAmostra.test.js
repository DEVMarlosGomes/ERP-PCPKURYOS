import { describe, expect, it } from "vitest";
import { editarPrazo, herdarPrazo, propagarPrazoDoProjeto } from "@/lib/prazoAmostra";

describe("prazo da amostra vem do projeto (CRM-04)", () => {
  it("amostra nova nasce com o prazo do projeto e o selo de origem", () => {
    expect(herdarPrazo({ nome_produto: "A" }, "2026-11-10")).toEqual({ nome_produto: "A", prazo_entrega_cliente: "2026-11-10", prazo_origem: "projeto" });
    expect(herdarPrazo({ prazo_entrega_cliente: "2026-12-01", prazo_origem: "manual" }, "2026-11-10").prazo_entrega_cliente).toBe("2026-12-01");
    expect(herdarPrazo({ nome_produto: "A" }, "")).toEqual({ nome_produto: "A" });
  });

  it("mudar à mão marca manual; voltar ao do projeto volta a acompanhar", () => {
    const a = herdarPrazo({}, "2026-11-10");
    expect(editarPrazo(a, "2026-11-20", "2026-11-10").prazo_origem).toBe("manual");
    expect(editarPrazo(a, "2026-11-10", "2026-11-10").prazo_origem).toBe("projeto");
  });

  it("prazo do projeto mudou: acompanha quem segue o projeto, não quem foi alterado", () => {
    const lista = [herdarPrazo({ id: 1 }, "2026-11-10"), editarPrazo({ id: 2 }, "2026-12-01", "2026-11-10"), { id: 3, prazo_entrega_cliente: "" }];
    const nova = propagarPrazoDoProjeto(lista, "2026-11-15");
    expect(nova.map((a) => a.prazo_entrega_cliente)).toEqual(["2026-11-15", "2026-12-01", "2026-11-15"]);
    expect(nova.map((a) => a.prazo_origem)).toEqual(["projeto", "manual", "projeto"]);
  });
});
