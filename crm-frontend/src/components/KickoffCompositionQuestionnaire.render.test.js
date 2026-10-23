import { renderToStaticMarkup } from "react-dom/server";
import KickoffCompositionQuestionnaire, { emptyKickoffQuestionnaire } from "@/components/KickoffCompositionQuestionnaire";
import { CATALOGO_PADRAO, OUTRO, escolherTipo } from "@/lib/tiposComponente";

vi.mock("@/lib/api", () => ({ default: { get: () => new Promise(() => {}), put: async () => ({}) } }));

// KO-04: a linha com tipo escolhido mostra o menu de tipos, os atributos e a especificação montada.
test("questionário renderiza tipo, atributos com Outro e especificação das características", () => {
  const q = emptyKickoffQuestionnaire();
  const pote = CATALOGO_PADRAO.find((tp) => tp.codigo === "POTE");
  q.bloco2.componentes[0] = { ...q.bloco2.componentes[0], aplicavel: "sim", definido: "sim", fornecido_por: "kuryos",
    ...escolherTipo({}, pote), atributos: { formato: "Redondo", material: OUTRO }, atributos_outro: { material: "PCR" } };
  const html = renderToStaticMarkup(<KickoffCompositionQuestionnaire value={q} onChange={() => {}} onSave={() => {}} admin />);
  expect(html).toContain('data-testid="tipo-componente"');
  expect(html).toContain(">Frasco</option>");
  expect(html).toContain(">Outro…</option>");
  expect(html).toContain("Pote · Formato: Redondo · Material: PCR");
  expect(html).toContain("Catálogo de componentes");
  expect(html).toContain("Bisnaga");
});
