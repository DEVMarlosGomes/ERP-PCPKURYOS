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

// KO-12: rótulo Não aplicável pergunta a gravação; o rótulo oferece o seletor de tipo e atributos (como o cartucho).
test("Bloco 3: gravação no rótulo não aplicável e seletor de tipo no rótulo aplicável", () => {
  const q = emptyKickoffQuestionnaire();
  q.bloco3.componentes[0] = { ...q.bloco3.componentes[0], aplicavel: "nao", gravacao: "sim" };
  const html = renderToStaticMarkup(<KickoffCompositionQuestionnaire value={q} onChange={() => {}} onSave={() => {}} />);
  expect(html).toContain('data-testid="pergunta-gravacao"');
  expect(html).toContain("Hot stamping");
  expect(html).toContain("Impressão direta");
  const rotulo = CATALOGO_PADRAO.find((tp) => tp.codigo === "ROTULO");
  const q2 = emptyKickoffQuestionnaire();
  q2.bloco3.componentes[0] = { ...q2.bloco3.componentes[0], aplicavel: "sim", definido: "sim", fornecido_por: "kuryos", ...escolherTipo({}, rotulo),
    atributos: { posicao: "Frontal + contra", material: "BOPP branco" } };
  q2.bloco3.componentes[1] = { ...q2.bloco3.componentes[1], aplicavel: "sim", definido: "nao" };
  const html2 = renderToStaticMarkup(<KickoffCompositionQuestionnaire value={q2} onChange={() => {}} onSave={() => {}} />);
  expect(html2).toContain(">Rótulo</option>");
  expect(html2).toContain("Rótulo · Posição: Frontal + contra · Material: BOPP branco");
  expect(html2).not.toContain('data-testid="pergunta-gravacao"');
  expect(html2).toContain('data-testid="chip-pendencia-definir"');
});
