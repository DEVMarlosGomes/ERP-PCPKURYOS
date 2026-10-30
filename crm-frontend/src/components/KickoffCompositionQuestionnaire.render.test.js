import { renderToStaticMarkup } from "react-dom/server";
import KickoffCompositionQuestionnaire, { GRUPOS_BLOCO2, emptyKickoffQuestionnaire, linhasPorGrupo } from "@/components/KickoffCompositionQuestionnaire";
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

// KO-11 (D-05): Bloco 2 em dois grupos — Frasco e Tampa e válvula; Kickoff antigo (ordem antiga) abre igual.
test("Bloco 2 agrupado: Frasco × Tampa e válvula, sem mexer na ordem gravada", () => {
  const ordemAntiga = ["frasco_pote_bisnaga", "airless_rollon_ampola", "tampa", "valvula_pump", "valvula_spray", "valvula_aerossol_atuador",
    "gatilho_trigger", "batoque_redutor_orificio", "lacre_inducao_disco", "aplicador", "custom_1"].map((id) => ({ id, componente: id }));
  const ordem = linhasPorGrupo(ordemAntiga, GRUPOS_BLOCO2);
  expect(ordem.map((o) => [o.grupo, ordemAntiga[o.indice].id])).toEqual([
    ["Frasco", "frasco_pote_bisnaga"], ["Frasco", "airless_rollon_ampola"], ["Frasco", "batoque_redutor_orificio"], ["Frasco", "lacre_inducao_disco"], ["Frasco", "aplicador"],
    ["Tampa e válvula", "tampa"], ["Tampa e válvula", "valvula_pump"], ["Tampa e válvula", "valvula_spray"], ["Tampa e válvula", "valvula_aerossol_atuador"], ["Tampa e válvula", "gatilho_trigger"],
    ["Outros componentes", "custom_1"],
  ]);
  const q = emptyKickoffQuestionnaire();
  q.bloco2.componentes = ordemAntiga.slice(0, 10).map((r) => ({ ...r, aplicavel: "", definido: "" }));
  const html = renderToStaticMarkup(<KickoffCompositionQuestionnaire value={q} onChange={() => {}} onSave={() => {}} />);
  expect(html.split('data-testid="grupo-componentes"').length - 1).toBe(2);
  expect(html.indexOf(">Frasco</th>")).toBeLessThan(html.indexOf(">Tampa e válvula</th>"));
  expect(html).toContain('value="tampa"');
});
