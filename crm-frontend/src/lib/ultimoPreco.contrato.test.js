// COM-04: o Compras (public/shared/ultimo-preco.js) e a cotação do CRM (lib/ultimoPreco.js) dão o
// mesmo último preço e a mesma sugestão. Se um mudar, este teste cai.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";
import { sugestaoDePreco, ultimoPrecoDoMaterial } from "./ultimoPreco";

const ctx = { self: {} };
vm.runInNewContext(readFileSync(new URL("../../../public/shared/ultimo-preco.js", import.meta.url), "utf8"), ctx);
const S = ctx.self.UltimoPreco;

const PCS = {
  a: { numeroFormatado: "PC-0001", fornecedorNome: "Plastsul", dataEmissao: "2026-08-01", itens: { 1: { materialCodigo: "EP-00089", precoUnit: "1,20" } } },
  b: { numeroFormatado: "PC-0007", fornecedorNome: "Vidroforte", dataEmissao: "2026-09-15", itens: { 1: { materialCodigo: "EP-00089", precoUnit: 1.35 }, 2: { materialCodigo: "MP0001", precoUnit: "" } } },
  c: { numeroFormatado: "PC-0009", status: "CANCELADO", dataEmissao: "2026-10-01", itens: { 1: { materialCodigo: "EP-00089", precoUnit: 0.9 } } },
  d: { numeroFormatado: "PC-0010", dataCriacao: "2026-10-02", itens: { 1: { materialCodigo: "ET-00012", precoUnit: 0 } } },
};

describe("último preço e sugestão (COM-04)", () => {
  test("último PC: o mais recente com preço; cancelado e preço zero/vazio não contam", () => {
    expect(ultimoPrecoDoMaterial(PCS, "EP-00089")).toEqual({ precoUnit: 1.35, fornecedorNome: "Vidroforte", data: "2026-09-15", pcNumero: "PC-0007" });
    expect(ultimoPrecoDoMaterial(PCS, "MP0001")).toBeNull();
    expect(ultimoPrecoDoMaterial(PCS, "ET-00012")).toBeNull();
    expect(ultimoPrecoDoMaterial(PCS, "")).toBeNull();
  });
  test("ordem: último PC → cotação aprovada → fórmula; nada = SEM PREÇO", () => {
    const pc = ultimoPrecoDoMaterial(PCS, "EP-00089");
    expect(sugestaoDePreco({ ultimoPc: pc, formula: { preco: 2 } })).toMatchObject({ preco: 1.35, fonte: "ultimo_pc", detalhe: "último PC · PC-0007 · Vidroforte · 2026-09-15" });
    expect(sugestaoDePreco({ cotacaoAprovada: { preco: 0.5, numero: "COT-2026-010-r1", em: "2026-10-01T12:00:00Z" }, formula: { preco: 2 } }))
      .toMatchObject({ preco: 0.5, fonte: "cotacao_aprovada", detalhe: "cotação aprovada · COT-2026-010-r1 · 2026-10-01" });
    expect(sugestaoDePreco({ formula: { preco: 40, moeda: "USD" } })).toMatchObject({ preco: 40, moeda: "USD", fonte: "formula_pd" });
    expect(sugestaoDePreco({})).toEqual({ preco: null, moeda: "BRL", fonte: null, detalhe: "SEM PREÇO" });
  });
  test("contrato: Compras e CRM dão o mesmo resultado", () => {
    for (const cod of ["EP-00089", "MP0001", "ET-00012", "X"]) {
      expect(JSON.parse(JSON.stringify(S.ultimoPrecoDoMaterial(PCS, cod)))).toEqual(ultimoPrecoDoMaterial(PCS, cod));
    }
    for (const f of [{ ultimoPc: ultimoPrecoDoMaterial(PCS, "EP-00089") }, { cotacaoAprovada: { preco: "0,5", numero: "C" } }, { formula: { preco: 3 } }, {}]) {
      expect(JSON.parse(JSON.stringify(S.sugestaoDePreco(f)))).toEqual(sugestaoDePreco(f));
    }
  });
});
