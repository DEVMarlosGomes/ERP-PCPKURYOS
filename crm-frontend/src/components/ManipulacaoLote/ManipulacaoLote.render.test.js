// LM-06/07/08: editor da matriz, ordem do lote e impressão (render no servidor, sem DOM).
import { renderToStaticMarkup } from "react-dom/server";
import EditorLote from "@/components/ManipulacaoLote/EditorLote";
import OrdemLote from "@/components/ManipulacaoLote/OrdemLote";
import { ordemLoteHtml } from "@/lib/ordemLoteHtml";
import { LinhaNovoIngrediente, ingredienteDaLinha } from "@/components/ManipulacaoLote/NovoIngredienteLote";
import { classificarIngredientes, montarMatriz, ordemDoLote } from "@/lib/manipulacaoLote";

vi.mock("@/lib/api", () => ({ default: { get: async () => ({ data: [] }), post: async () => ({ data: {} }), put: async () => ({ data: {} }) } }));
// A tag inteira do elemento com o data-testid (o React escreve os atributos na ordem do JSX).
const tag = (html, id) => html.match(new RegExp(`<[^>]*data-testid="${id}"[^>]*>`))?.[0] || "";
const desabilitado = (html, id) => /\sdisabled=""/.test(tag(html, id));

const item = (nome, pct, extra = {}) => ({ ingredient_name: nome, percentage: pct, phase: "A", master_material_id: nome.toUpperCase(), ...extra });
const matrizItens = [item("Água", 79), item("Fenoxietanol", 1), item("Fragrância Lavanda", 20, { function: "fragrância" })];
function loteDeExemplo(mut) {
  const mm = montarMatriz({ matrizItens, membros: [{ request_id: "R1", itens: matrizItens }, { request_id: "R2", itens: matrizItens }] });
  const ingredientes = classificarIngredientes(mm.ingredientes, { materiais: new Map([["FENOXIETANOL", { criticoPd: true }]]), itensOrigem: matrizItens });
  const k = (nome) => Object.keys(ingredientes).find((x) => ingredientes[x].nome === nome);
  const lote = {
    id: "L1", codigo: "LM-2026-031-1", status: "rascunho", revisao: 3, projeto_numero: "2026-031", projeto_nome: "Linha Corporal",
    matriz: { tipo: "amostra", ref_id: "F2", codigo: "2026-1003-a", celulas: mm.matrizCelulas },
    membros: { R1: { request_id: "R1", codigo_amostra: "2026-1003-a", quantidade_g: 50, status_membro: "ativo", versao_antes: 2 },
      R2: { request_id: "R2", codigo_amostra: "2026-1003-b", quantidade_g: 50, status_membro: "ativo", versao_antes: 1 } },
    ingredientes, celulas: mm.celulas, perda_pct: 2, minimo_pesavel_g: 0.05, pre_mistura: { A: true }, eventos: {},
  };
  mut?.(lote, k);
  return { lote, k };
}

test("editor: 100 % por coluna, comum em âmbar e crítico em vermelho; sem caixa de comentário; crítico da fórmula anterior segura a conclusão", () => {
  const { lote, k } = loteDeExemplo((l, k) => {
    l.celulas.R2 = { ...l.celulas.R2, [k("Água")]: 79.2, [k("Fenoxietanol")]: 0.8 };
  });
  // R2 já tinha fórmula (v1) com o conservante a 1 %: a troca para 0,8 pede o "Aprovar" de outra pessoa.
  const origem_celulas = { R2: { [k("Água")]: 79, [k("Fenoxietanol")]: 1, [k("Fragrância Lavanda")]: 20 } };
  const html = renderToStaticMarkup(<EditorLote detalhe={{ lote, estado: {}, eu: "pd", pode_editar: true, origem_celulas }} user={{ role: "pd" }} recarregar={async () => {}} />);
  expect(html).toContain('data-testid="matriz-lote"');
  expect(html).toMatch(/data-testid="soma-R1"[^>]*>100 %/);
  expect(tag(html, `cel-R2-${k("Água")}`)).toContain("bg-amber-50");
  expect(tag(html, `cel-R2-${k("Fenoxietanol")}`)).toContain("bg-red-50");
  expect(html).not.toMatch(/Motivo \(mín/); // não pede comentário
  expect(html).toContain('data-testid="criticos-lote"');
  expect(html).toContain("precisa do &quot;Aprovar&quot; de outra pessoa");
  expect(html).toContain("Para concluir, falta:");
  expect(html).toContain("1 ingrediente(s) crítico(s) para outra pessoa aprovar");
  expect(desabilitado(html, "btn-gerar-ordem")).toBe(true);
  expect(html).toContain("Concluir e enviar para a manipulação");
  expect(html).toContain("Fase A");
  // A mesma mudança sem fórmula anterior (primeira formulação): nada pendente, botão liberado.
  const novo = renderToStaticMarkup(<EditorLote detalhe={{ lote, estado: {}, eu: "pd", pode_editar: true }} user={{ role: "pd" }} recarregar={async () => {}} />);
  expect(novo).not.toContain('data-testid="criticos-lote"');
  expect(desabilitado(novo, "btn-gerar-ordem")).toBe(false);
});

test("editor: matriz vazia (caso LM-2026-041-2) — sem gramas o botão diz o que falta; com gramas e 100 % libera direto, mostrando que cada uma ganha a primeira versão", () => {
  const { lote, k } = loteDeExemplo((l, k) => {
    l.matriz = { tipo: "vazia", ref_id: null, codigo: "", celulas: {} };
    for (const r of ["R1", "R2"]) { l.membros[r].versao_antes = null; l.membros[r].quantidade_g = undefined; }
    l.celulas.R2 = { [k("Água")]: 79.5, [k("Fenoxietanol")]: 0.5, [k("Fragrância Lavanda")]: 20 };
  });
  const semG = renderToStaticMarkup(<EditorLote detalhe={{ lote, estado: {}, eu: "pd", pode_editar: true }} user={{ role: "pd" }} recarregar={async () => {}} />);
  expect(semG).toContain("quantidade em g de 2026-1003-a, 2026-1003-b");
  expect(desabilitado(semG, "btn-gerar-ordem")).toBe(true);
  expect(semG).toContain("Matriz vazia: as amostras sem fórmula anterior são fórmulas novas");
  expect(tag(semG, `cel-R2-${k("Fenoxietanol")}`)).not.toContain("bg-red-50"); // fórmula nova não tem "diferença"
  for (const r of ["R1", "R2"]) lote.membros[r].quantidade_g = 50;
  const pronto = renderToStaticMarkup(<EditorLote detalhe={{ lote, estado: {}, eu: "pd", pode_editar: true }} user={{ role: "pd" }} recarregar={async () => {}} />);
  expect(desabilitado(pronto, "btn-gerar-ordem")).toBe(false);
  expect(pronto).toContain("2026-1003-a: primeira versão · 2026-1003-b: primeira versão");
});

test("editor: sem diferença e tudo fechado, conclui direto; perfil sem P&D só consulta", () => {
  const { lote } = loteDeExemplo();
  const html = renderToStaticMarkup(<EditorLote detalhe={{ lote, estado: {}, eu: "pd", pode_editar: true }} user={{ role: "pd" }} recarregar={async () => {}} />);
  expect(html).toContain("Todas as amostras iguais à matriz.");
  expect(tag(html, "btn-gerar-ordem")).toBeTruthy();
  expect(desabilitado(html, "btn-gerar-ordem")).toBe(false);
  const consulta = renderToStaticMarkup(<EditorLote detalhe={{ lote, estado: {}, eu: "pcp", pode_editar: false }} user={{ role: "pcp" }} recarregar={async () => {}} />);
  expect(consulta).toContain("Seu perfil só consulta.");
  expect(desabilitado(consulta, "btn-salvar-lote")).toBe(true);
});

function comOrdem(status, pesar) {
  // R2 com outra proporção: Água e fragrância viram adições; o conservante (igual) vai à pré-mistura.
  const { lote } = loteDeExemplo((l, k) => { l.celulas.R2 = { ...l.celulas.R2, [k("Água")]: 79.5, [k("Fragrância Lavanda")]: 19.5 }; });
  const membros = Object.entries(lote.membros).map(([r, m]) => ({ ...m, request_id: r }));
  const o = ordemDoLote({ ingredientes: lote.ingredientes, celulas: lote.celulas, membros, preMistura: lote.pre_mistura, perdaPct: 2 });
  lote.status = status;
  lote.ordem = { gerada_em: "2026-11-05T10:00:00Z", gerada_por_nome: "Yasmim", versoes: { R1: { formula_id: "V1", versao: 3 }, R2: { formula_id: "V2", versao: 2 } },
    fases: o.fases, pre_misturas: o.fases.filter((f) => o.pre_misturas[f]).map((f) => o.pre_misturas[f]), adicoes: o.adicoes, linhas_pesagem: o.linhas_pesagem,
    avisos: o.avisos, total_teorico_g: o.total_teorico_g, n_amostras: 2, conferencia_segundo_usuario: true };
  if (pesar) lote.pesagens = Object.fromEntries(Object.entries(o.linhas_pesagem).map(([id, l]) => [id, { teorico_g: l.teorico_g, atual: "r1",
    registros: { r1: { real_g: l.teorico_g, desvio_g: 0, lote_mp: "LT-9", lote_mp_informado: true, pesou: "pd", pesou_nome: "Yasmim", ...(pesar === "conferido" ? { conferiu: "pd2", conferiu_nome: "Carla" } : {}) } } }]));
  return lote;
}

test("ordem: pesagem por linha, conferência de outra pessoa, registro só com tudo conferido; manipulado mostra as ações", () => {
  const gerada = renderToStaticMarkup(<OrdemLote detalhe={{ lote: comOrdem("ordem_gerada"), eu: "pd", pode_editar: true }} user={{ role: "pd" }} recarregar={async () => {}} />);
  expect(gerada).toContain('data-testid="pesagem-lote"');
  expect(gerada).toContain("Pré-mistura A");
  expect(gerada).toContain('data-testid="btn-registrar-pesagens"');
  expect(desabilitado(gerada, "btn-registrar-manipulacao")).toBe(true);
  const pesadaPorMim = renderToStaticMarkup(<OrdemLote detalhe={{ lote: comOrdem("ordem_gerada", "pesado"), eu: "pd", pode_editar: true }} user={{ role: "pd" }} recarregar={async () => {}} />);
  expect(pesadaPorMim).toContain("Você pesou esta linha");
  const conferida = renderToStaticMarkup(<OrdemLote detalhe={{ lote: comOrdem("ordem_gerada", "conferido"), eu: "pd", pode_editar: true }} user={{ role: "pd" }} recarregar={async () => {}} />);
  expect(conferida).toContain("conferido por Carla");
  expect(conferida).toContain("Faltam pesar 0 · conferir 0");
  const manipulado = renderToStaticMarkup(<OrdemLote detalhe={{ lote: comOrdem("manipulado", "conferido"), eu: "pd", pode_editar: true }} user={{ role: "pd" }} recarregar={async () => {}} />);
  expect(manipulado).toContain('data-testid="acoes-lote"');
  expect(manipulado).toContain("Levar todas a Em Testes");
  expect(manipulado).not.toContain('data-testid="registrar-manipulacao"');
});

test("impressão: pré-mistura com porções, adições por amostra e tudo escapado", () => {
  const lote = comOrdem("ordem_gerada");
  for (const l of Object.values(lote.ordem.linhas_pesagem)) if (l.nome === "Água") l.nome = '<script>alert("x")</script>';
  const html = ordemLoteHtml(lote);
  expect(html).toContain("Ordem de manipulação em lote LM-2026-031-1");
  expect(html).toContain("Pré-mistura · fase A");
  expect(html).toContain("Porção da pré-mistura para cada amostra");
  expect(html).toContain("2026-1003-b · 50 g · versão v2");
  expect(html).not.toContain("<script>alert");
  expect(html).toContain("&lt;script&gt;");
});

test("adicionar ingrediente no lote: a mesma linha da aba Manipulação, com Aplicar em", () => {
  const html = renderToStaticMarkup(<LinhaNovoIngrediente ingredientes={{}} ativos={["R1", "R2"]} codigoDe={(r) => `cod-${r}`} onAdicionar={() => {}} />);
  for (const rotulo of ["Fase", "Ingrediente", "INCI", "Fornecedor", "%Fórmula", "Preço R$/Kg", "Preço US$/Kg", "Aplicar em", "MP nova (ainda não cadastrada)", "Adicionar"]) {
    expect(html).toContain(rotulo);
  }
  expect(html).toContain("Todas as amostras");
  expect(html).toContain("cod-R2");
});

test("ingrediente do lote sai com material mestre, código e tipo do catálogo; MP nova com o nome digitado", () => {
  const catalogo = [{ id: "C9", master_material_id: "MPGR-00012", codigo_interno: "MPGR-00012", unidade: "kg", tipo_material: "MPGR" }];
  expect(ingredienteDaLinha({ ingredient_name: "Glicerina ", catalog_id: "C9", phase: "a", price_per_kg: "12.5", price_usd: "", fornecedor: "Forn", inci: "Glycerin" }, catalogo))
    .toMatchObject({ nome: "Glicerina", master_material_id: "MPGR-00012", codigo: "MPGR-00012", tipo_material: "MPGR", price_per_kg: 12.5, price_usd: null, mp_nova: null });
  expect(ingredienteDaLinha({ ingredient_name: "Óleo de Pracaxi", mp_nova_on: true, phase: "", price_usd: "" }, catalogo).mp_nova).toEqual({ nome: "Óleo de Pracaxi", tipo: "MPGR" });
});

