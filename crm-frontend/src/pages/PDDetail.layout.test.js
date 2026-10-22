import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// AMO-01 (22/10/2026): na aba de manipulação o passo a passo (descrição de elaboração)
// fica acima dos Lotes de Amostras. Sem biblioteca de render no projeto, a ordem é
// conferida no JSX do componente que monta as duas seções.
const fonte = readFileSync(new URL("./PDDetail.js", import.meta.url), "utf8");

describe("PDDetail — ordem das seções (AMO-01)", () => {
  it("descrição de elaboração vem antes dos Lotes de Amostras", () => {
    const passoAPasso = fonte.indexOf('data-testid="descricao-elaboracao"');
    const lotes = fonte.indexOf("<SampleBatchSection ");
    expect(passoAPasso).toBeGreaterThan(0);
    expect(lotes).toBeGreaterThan(0);
    expect(passoAPasso).toBeLessThan(lotes);
  });

  it("os Lotes de Amostras são montados uma vez só", () => {
    expect(fonte.split("<SampleBatchSection ").length - 1).toBe(1);
  });
});
