// PD-03: a chave da solicitação de MP nova (CRM/P&D) e o índice materiais_chave do Cadastros
// (public/shared/duplicidade-material.js) normalizam o nome do mesmo jeito. Se um mudar, este teste cai.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";
import { normalizarNomeMp } from "./filaCadastroMp";

const shared = readFileSync(new URL("../../../public/shared/duplicidade-material.js", import.meta.url), "utf8");
const ctx = { self: {} };
vm.runInNewContext(shared, ctx);
const D = ctx.self.DuplicidadeMaterial;

describe("nome normalizado: P&D × Cadastros (contrato)", () => {
  test.each([
    "Glicerina bi-destilada", "GLICERINA BI DESTILADA", "Ácido Hialurônico 1%", "  manteiga  de quinoa (LH0348) ",
    "Válvula spray R.24/410", "Fragrância Shower Butter II", "Óleo de Rícino PEG-40", "",
  ])("%s", (nome) => {
    expect(normalizarNomeMp(nome)).toBe(D.normalizar(nome));
    expect(normalizarNomeMp(nome)).toBe(D.chaveMaterial("MPGR", nome));
  });
});
