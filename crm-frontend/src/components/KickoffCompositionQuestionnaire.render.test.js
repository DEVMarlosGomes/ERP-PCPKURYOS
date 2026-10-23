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

// KO-02: campo que veio da origem mostra o selo; alterado sem motivo registrado pede o motivo.
test("selo de origem e motivo de alteração", () => {
  const original = emptyKickoffQuestionnaire();
  original.bloco0.volume_gramatura = "200 mL";
  original.origem = { bloco0: { volume_gramatura: { fonte: "Fórmula (P&D)", sobrescrito: false } }, fechamento: { responsavel_cliente: { fonte: "Cliente (CRM)", sobrescrito: true, motivo: "Contato mudou" } } };
  const igual = renderToStaticMarkup(<KickoffCompositionQuestionnaire value={original} original={original} onChange={() => {}} onSave={() => {}} />);
  expect(igual).toContain("veio de Fórmula (P&amp;D)");
  expect(igual).not.toContain('data-testid="motivo-sobrescrita"');
  expect(igual).toContain("Alterado (veio de Cliente (CRM)): Contato mudou");
  const editado = { ...original, bloco0: { ...original.bloco0, volume_gramatura: "250 mL" } };
  const html = renderToStaticMarkup(<KickoffCompositionQuestionnaire value={editado} original={original} onChange={() => {}} onSave={() => {}} />);
  expect(html).toContain('data-testid="motivo-sobrescrita"');
});
