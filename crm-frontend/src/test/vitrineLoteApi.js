// API falsa da vitrine da manipulação em lote (prints P3): só dados fictícios, nada de banco.
import { classificarIngredientes, montarMatriz, ordemDoLote } from "@/lib/manipulacaoLote";

const item = (nome, pct, extra = {}) => ({ ingredient_name: nome, percentage: pct, phase: "A", master_material_id: nome.toUpperCase().replace(/[^A-Z]/g, ""), ...extra });
const base = [item("Água", 70), item("Glicerina", 5), item("Manteiga de karité", 4, { phase: "B" }), item("Fenoxietanol", 1), item("Fragrância Lavanda", 20, { function: "fragrância", phase: "C" })];
const amostras = [
  ["R1", "2026-9000-a", "Fragrância Lavanda", 20], ["R2", "2026-9000-b", "Fragrância Rosa", 20], ["R3", "2026-9000-c", "Fragrância Cítrica", 19.5],
  ["R4", "2026-9000-d", "Fragrância Baunilha", 20],
];
const itensDe = ([, , frag, pct]) => base.map((i) => (i.function ? item(frag, pct, { function: "fragrância", phase: "C" }) : i))
  .map((i, idx, arr) => (i.ingredient_name === "Água" ? { ...i, percentage: 100 - arr.filter((x) => x.ingredient_name !== "Água").reduce((s, x) => s + x.percentage, 0) } : i));

export function montarLote(status) {
  const membros = amostras.map((a) => ({ request_id: a[0], itens: itensDe(a) }));
  const mm = montarMatriz({ matrizItens: itensDe(amostras[0]), membros });
  const ingredientes = classificarIngredientes(mm.ingredientes, { materiais: new Map([["FENOXIETANOL", { criticoPd: true }]]), itensOrigem: membros.flatMap((m) => m.itens) });
  const k = (nome) => Object.keys(ingredientes).find((x) => ingredientes[x].nome === nome);
  const celulas = mm.celulas;
  if (status === "rascunho") celulas.R3 = { ...celulas.R3, [k("Fenoxietanol")]: 0.8, [k("Água")]: 70.7 };
  const lote = {
    id: "LV", codigo: "LM-2026-900-1", status, revisao: 4, projeto_numero: "2026-900", projeto_nome: "Linha corporal (fictícia)",
    matriz: { tipo: "amostra", ref_id: "F1", codigo: "2026-9000-a", celulas: mm.matrizCelulas },
    membros: Object.fromEntries(amostras.map(([r, cod]) => [r, { request_id: r, codigo_amostra: cod, quantidade_g: 50, unidade_pedido: "g", status_membro: "ativo", versao_antes: 2 }])),
    ingredientes, celulas, perda_pct: 3, minimo_pesavel_g: 0.05, pre_mistura: { A: true, B: true },
    motivos: status === "rascunho" ? { R3: { [k("Água")]: { texto: "compensar o conservante", por: "pd2", valor: 70.7 } } } : {},
    eventos: { e1: { tipo: "criado", por_nome: "Química (fictícia)", em: "2026-11-05T09:00:00Z", detalhe: "4 amostra(s); matriz 2026-9000-a" } },
  };
  if (status !== "rascunho") {
    const o = ordemDoLote({ ingredientes, celulas, membros: Object.entries(lote.membros).map(([r, m]) => ({ ...m, request_id: r })), preMistura: lote.pre_mistura, perdaPct: 3 });
    lote.ordem = { gerada_em: "2026-11-05T10:00:00Z", gerada_por_nome: "Química (fictícia)", n_amostras: 4, total_teorico_g: o.total_teorico_g, conferencia_segundo_usuario: true,
      versoes: Object.fromEntries(amostras.map(([r]) => [r, { formula_id: `V${r}`, versao: 3 }])), fases: o.fases,
      pre_misturas: o.fases.filter((f) => o.pre_misturas[f]).map((f) => o.pre_misturas[f]), adicoes: o.adicoes, linhas_pesagem: o.linhas_pesagem, avisos: o.avisos };
    const ids = Object.keys(o.linhas_pesagem);
    const pesadas = status === "manipulado" ? ids : ids.slice(0, Math.ceil(ids.length / 2));
    lote.pesagens = Object.fromEntries(pesadas.map((id, i) => [id, { teorico_g: o.linhas_pesagem[id].teorico_g, atual: "r1", registros: { r1: {
      real_g: o.linhas_pesagem[id].teorico_g + (i === 1 ? 0.03 : 0), desvio_g: i === 1 ? 0.03 : 0, lote_mp: "L-2611", lote_mp_informado: true, pesou: "pd", pesou_nome: "Química (fictícia)",
      ...(status === "manipulado" || i % 2 === 0 ? { conferiu: "pd2", conferiu_nome: "Conferente (fictícia)" } : {}) } } }]));
    if (status === "manipulado") {
      lote.manipulacao = { em: "2026-11-05T11:30:00Z", por_nome: "Química (fictícia)", conciliacao: { pesado_g: o.total_teorico_g, destinos_g: o.total_teorico_g, residuo_g: 0, ok: true } };
      lote.eventos.e2 = { tipo: "manipulado", por_nome: "Química (fictícia)", em: "2026-11-05T11:30:00Z", detalhe: "Pesado e conciliado." };
    }
  }
  return lote;
}

const elegiveis = {
  amostras: [
    ...amostras.map(([r, cod]) => ({ request_id: r, sample_id: "S1", variacao_id: `v${r}`, codigo: cod, produto: "Manteiga corporal 150 g (fictícia)", status_pd: r === "R1" ? "OPEN" : "IN_PROGRESS",
      elegivel: true, motivo: "", formula: { id: `F${r}`, version: 2, locked: r === "R2" }, fechamento: { ok: true } })),
    { request_id: "R5", sample_id: "S2", variacao_id: "v5", codigo: "2026-9000-e", produto: "Manteiga corporal 150 g (fictícia)", status_pd: "IN_TESTS", elegivel: false,
      motivo: "Está em Em Testes; só entram amostras Abertas ou Em Desenvolvimento.", formula: { id: "F5", version: 1, locked: true }, fechamento: { ok: true } },
    { request_id: "R6", sample_id: "S2", variacao_id: "v6", codigo: "2026-9000-f", produto: "Manteiga corporal 150 g (fictícia)", status_pd: "IN_PROGRESS", elegivel: false,
      motivo: "O cliente já decidiu (aprovada) — a amostra não volta para a bancada pelo lote.", formula: null, fechamento: null },
  ],
  lotes: [{ id: "LV", codigo: "LM-2026-900-1", status: "ordem_gerada", membros: 4, atualizado_em: "2026-11-05T10:00:00Z" }],
  matriz_padrao: { request_id: "R1" }, limite: { min: 2, max: 20 },
};

const api = {
  get: async (url) => {
    if (url.includes("amostras-elegiveis")) return { data: elegiveis };
    if (url.includes("/pd/catalog")) return { data: [] };
    return { data: {} };
  },
  post: async () => ({ data: { resultados: amostras.map(([r, cod], i) => ({ request_id: r, codigo: cod, ok: i !== 2, mensagem: i !== 2 ? "Em Testes" : "A fórmula precisa fechar 100% para concluir." })) } }),
  put: async () => ({ data: {} }),
};
export default api;
