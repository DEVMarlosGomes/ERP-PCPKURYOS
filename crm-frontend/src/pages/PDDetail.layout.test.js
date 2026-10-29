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

// PD-01 (reunião 28/10/2026): editar/excluir não podem sumir atrás da rolagem horizontal.
describe("PDDetail — tabela da manipulação (PD-01)", () => {
  const tabela = fonte.slice(fonte.indexOf('testId="tabela-manipulacao"'), fonte.indexOf("</RolagemHorizontalDupla>"));
  it("rola com barra no topo e embaixo (RolagemHorizontalDupla)", () => {
    expect(tabela.length).toBeGreaterThan(0);
    expect(fonte).toContain('import RolagemHorizontalDupla from "@/components/RolagemHorizontalDupla"');
  });
  it("coluna de ações presa à direita, com fundo opaco, no cabeçalho, nas linhas e no rodapé", () => {
    expect(fonte).toMatch(/const ACOES_FIXAS = "sticky right-0 z-10/);
    expect(tabela.split("${ACOES_FIXAS}").length - 1).toBe(4); // cabeçalho, linha em edição, linha normal, rodapé
    expect(tabela).toContain("bg-[#0A0A0B] ${ACOES_FIXAS}");
    expect(tabela).toContain("bg-card group-hover:bg-muted ${ACOES_FIXAS}");
    expect(tabela).toContain("bg-blue-50 dark:bg-blue-950 ${ACOES_FIXAS}");
  });
  it("editar e remover com alvo de 32 px e rótulo acessível", () => {
    expect(fonte).toMatch(/const BOTAO_ACAO = "inline-flex h-8 w-8 /);
    expect(tabela).toContain('data-testid="editar-ingrediente"');
    expect(tabela).toContain("aria-label={`Remover ");
  });
});
