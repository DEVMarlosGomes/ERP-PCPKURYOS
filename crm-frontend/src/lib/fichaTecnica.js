/* Manipulação no modelo das fichas (PLANO_PD_CRM_AJUSTES.md, Fase 3).
 *
 * Modelo das fichas Mochi Blur / Manteiga de Banho: tabela Fase · Ingrediente ·
 * INCI · Fornecedor · % e o PROCEDIMENTO como receita, fase a fase. A Manipulação
 * guarda a fase de cada ingrediente e o passo a passo de cada fase
 * (pd_formula_phases: nome_fase, temperatura, etapas[]); daqui saem a seção
 * 2.2 da Ficha Técnica e o documento para imprimir.
 * Funções puras: nada aqui lê ou grava no banco. */

const SEM_FASE = "Sem fase";

export const TIPOS_MP_NOVA = { MPGR: "MP Geral", MPES: "Fragrância / Essência" };

const texto = (v) => String(v ?? "").trim();

// "Fase A" → "A"; "b" → "B"; "Aquosa" fica "Aquosa".
export function nomeFase(valor) {
  const t = texto(valor).replace(/^fase\s+/i, "");
  return /^[a-z]{1,2}$/i.test(t) ? t.toUpperCase() : t;
}

function ordemFase(nome) {
  if (!nome || nome === SEM_FASE) return [2, ""];
  return /^[A-Z]{1,2}$/.test(nome) ? [0, nome.padStart(2, " ")] : [1, nome.toLowerCase()];
}

const compararFases = (a, b) => {
  const [ga, ka] = ordemFase(a);
  const [gb, kb] = ordemFase(b);
  return ga - gb || ka.localeCompare(kb);
};

// Ingredientes agrupados por fase (A, B, C… depois nomes livres, "Sem fase" no fim),
// mantendo a ordem em que foram lançados dentro de cada fase.
export function agruparPorFase(itens) {
  const grupos = new Map();
  for (const item of itens || []) {
    if (!item) continue;
    const fase = nomeFase(item.phase) || SEM_FASE;
    if (!grupos.has(fase)) grupos.set(fase, []);
    grupos.get(fase).push(item);
  }
  return [...grupos.keys()].sort(compararFases).map((fase) => ({ fase, itens: grupos.get(fase) }));
}

// Passo a passo da fase: lista nova (etapas) ou o texto antigo (instrucoes), um passo por linha.
export function passosDaFase(fase) {
  if (Array.isArray(fase?.etapas)) return fase.etapas.map(texto).filter(Boolean);
  return texto(fase?.instrucoes || fase?.descricao).split(/\r?\n/).map((l) => l.replace(/^\s*\d+[.)-]\s*/, "").trim()).filter(Boolean);
}

export function ordenarFasesDoProcedimento(fases) {
  return [...(fases || [])].filter(Boolean).sort((a, b) => (Number(a.order ?? a.ordem ?? 0) - Number(b.order ?? b.ordem ?? 0)) || compararFases(nomeFase(a.nome_fase || a.titulo), nomeFase(b.nome_fase || b.titulo)));
}

// Seção 2.2 da Ficha Técnica a partir da Manipulação.
export function elaboracaoDaManipulacao(fases) {
  const secoes = ordenarFasesDoProcedimento(fases).map((f, i) => {
    const passos = passosDaFase(f);
    const nome = nomeFase(f.nome_fase || f.titulo);
    return {
      id: `m-${f.id || i}`,
      nome: /^[A-Z]{1,2}$/.test(nome) ? `Fase ${nome}` : (nome || `Fase ${i + 1}`),
      tipo: "", temperatura: texto(f.temperatura), agitacao: "", tempo_min: "",
      etapas: passos.length ? passos : [""],
    };
  });
  return { secoes, origem: "manipulacao" };
}

export function validarMpNova(mp) {
  if (!mp) return null;
  if (!texto(mp.nome)) return "Escreva o nome da matéria-prima nova por extenso.";
  if (!TIPOS_MP_NOVA[mp.tipo]) return "Selecione o tipo da MP nova: MPGR ou MPES.";
  return null;
}

// Evento do histórico de MPs novas (retrabalho troca a MP; a antiga fica no log).
export function eventoMpNova(antes, depois) {
  const a = antes?.mp_nova || null;
  const d = depois?.mp_nova || null;
  if (!a && !d) return null;
  if (!a && d) return { acao: "incluida", nome: d.nome, tipo: d.tipo };
  if (a && !depois) return { acao: "removida", nome: a.nome, tipo: a.tipo };
  if (a && !d) return { acao: "vinculada_ao_cadastro", nome: a.nome, tipo: a.tipo, para: texto(depois.ingredient_name) };
  if (texto(a.nome) !== texto(d.nome) || a.tipo !== d.tipo) return { acao: "substituida", nome: d.nome, tipo: d.tipo, de: a.nome, de_tipo: a.tipo };
  return null;
}

/* ── Documento da Ficha Técnica (modelo Mochi Blur) ─────────────────── */

export function montarFichaTecnica({ request, formula, itens, fases, analise }) {
  const r = request || {};
  const f = formula || {};
  const a = analise || {};
  const parametros = ["aspecto", "cor", "odor", "ph", "densidade", "teor_alcool"].map((key) => {
    const v = a[key] && typeof a[key] === "object" ? a[key] : { resultado: a[key] || "" };
    return { key, especificacao: texto(v.especificacao), resultado: texto(v.resultado), pa: texto(v.pa) };
  }).filter((p) => p.especificacao || p.resultado || p.pa);
  const procedimento = ordenarFasesDoProcedimento(fases).map((fase) => ({
    fase: nomeFase(fase.nome_fase || fase.titulo), temperatura: texto(fase.temperatura), passos: passosDaFase(fase),
  })).filter((p) => p.passos.length);
  return {
    produto: texto(a.produto) || texto(r.commercial_name) || texto(r.project_name) || texto(r.title) || texto(f.name),
    codigo: texto(r.internal_code),
    cliente: texto(r.client_name),
    versao: f.version ? `v${f.version}` : "",
    volume: f.volume ? `${f.volume} ${f.volume_unit || ""}`.trim() : "",
    lote: texto(a.lote), data_fabricacao: texto(a.data_fabricacao), validade: texto(a.validade),
    fases: agruparPorFase(itens).map((g) => ({
      fase: g.fase,
      itens: g.itens.map((i) => ({
        ingrediente: texto(i.ingredient_name), inci: texto(i.inci), fornecedor: texto(i.fornecedor),
        percentual: Number(i.percentage) || 0, mp_nova: i.mp_nova ? i.mp_nova.tipo : "",
        custo_kg: Number(i.cost_brl_via_cambio ?? i.price_per_kg) || 0,
      })),
    })),
    total: (itens || []).reduce((s, i) => s + (Number(i?.percentage) || 0), 0),
    procedimento,
    parametros,
    observacoes: texto(a.elaboracao?.observacoes_gerais),
  };
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (n) => (Number(n) || 0).toFixed(2).replace(".", ",");
const ROTULO_PARAM = { aspecto: "Aspecto", cor: "Cor", odor: "Odor", ph: "pH", densidade: "Densidade", teor_alcool: "Teor de Álcool" };

export function htmlFichaTecnica(m, { comCustos = false } = {}) {
  const cols = comCustos ? 5 : 4;
  const linhas = m.fases.map((g) => `
    <tr class="fase"><td colspan="${cols}">${g.fase === SEM_FASE ? "SEM FASE" : `FASE ${esc(g.fase)}`}</td></tr>
    ${g.itens.map((i) => `<tr><td>${esc(i.ingrediente)}${i.mp_nova ? ` <span class="nova">MP nova · ${esc(i.mp_nova)}</span>` : ""}</td><td>${esc(i.inci) || "—"}</td><td class="c">${esc(i.fornecedor) || "—"}</td><td class="n">${pct(i.percentual)}</td>${comCustos ? `<td class="n">${i.custo_kg ? `R$ ${pct(i.custo_kg)}` : "—"}</td>` : ""}</tr>`).join("")}`).join("");
  const procedimento = m.procedimento.length
    ? `<ol class="proc">${m.procedimento.map((p) => `<li><b>Fase ${esc(p.fase)}${p.temperatura ? ` · ${esc(p.temperatura)}` : ""}</b><ol>${p.passos.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></li>`).join("")}</ol>`
    : `<p class="vazio">Procedimento ainda não preenchido na Manipulação.</p>`;
  const parametros = m.parametros.length
    ? `<h2>Características</h2><table><thead><tr><th>Teste</th><th>Especificação</th><th>Resultado</th><th>PA</th></tr></thead><tbody>${m.parametros.map((p) => `<tr><td>${ROTULO_PARAM[p.key] || p.key}</td><td>${esc(p.especificacao) || "—"}</td><td>${esc(p.resultado) || "—"}</td><td class="c">${esc(p.pa) || "—"}</td></tr>`).join("")}</tbody></table>`
    : "";
  const ident = [["Código", m.codigo], ["Cliente", m.cliente], ["Versão da fórmula", m.versao], ["Amostra", m.volume], ["Lote", m.lote], ["Fabricação", m.data_fabricacao], ["Validade", m.validade]]
    .filter(([, v]) => v).map(([k, v]) => `<span><b>${k}:</b> ${esc(v)}</span>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha Técnica · ${esc(m.produto)}</title>
<style>
  body{font-family:Calibri,Arial,sans-serif;color:#111;margin:24px auto;max-width:820px;padding:0 16px}
  header{display:flex;justify-content:space-between;align-items:center;border:1px solid #333;border-bottom:0;padding:14px 18px}
  header .marca{font-weight:700;letter-spacing:.18em}header .lema{font-weight:600}
  h1{margin:0;padding:6px;text-align:center;font-size:16px;background:#9dc3e6;border:1px solid #333}
  .ident{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;padding:8px 2px}
  table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #333;padding:4px 6px}
  thead th{background:#2e75b6;color:#fff;font-weight:600}tr.fase td{background:#ddebf7;text-align:center;font-weight:700}
  td.c{text-align:center}td.n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:700}
  .nova{font-size:10px;background:#fff2cc;border:1px solid #bf9000;border-radius:3px;padding:0 3px}
  h2{font-size:14px;margin:18px 0 6px}.proc{font-size:13px;line-height:1.5}.proc ol{margin:2px 0 8px}
  .vazio{font-size:12px;color:#777}.obs{font-size:12px;white-space:pre-wrap}
  @media print{body{margin:0}button{display:none}}
</style></head><body>
<header><span class="marca">KURYOS</span><span class="lema">Ficha Técnica de Manipulação</span></header>
<h1>${esc(m.produto || "Produto")}</h1>
<div class="ident">${ident}</div>
<table><thead><tr><th>Ingrediente</th><th>INCI</th><th>Fornecedor</th><th>%</th>${comCustos ? "<th>Custo R$/kg</th>" : ""}</tr></thead>
<tbody>${linhas}</tbody><tfoot><tr><td colspan="3">Total</td><td class="n">${pct(m.total)}</td>${comCustos ? "<td></td>" : ""}</tr></tfoot></table>
<h2>Procedimento</h2>${procedimento}
${parametros}
${m.observacoes ? `<h2>Observações</h2><p class="obs">${esc(m.observacoes)}</p>` : ""}
<p style="margin-top:24px"><button onclick="window.print()">Imprimir / salvar em PDF</button></p>
</body></html>`;
}
