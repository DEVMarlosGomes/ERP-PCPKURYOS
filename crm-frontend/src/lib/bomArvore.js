/* BOM-03 (reunião 28/10/2026, D-06): vista explodida do BOM, alternável com a tabela.
 * Produto → Primária / Secundária / Terciária → componente (tipo, especificação, qtd por unidade,
 * total do lote, fornecedor ou "a definir"). Funções puras, sem banco. */

export const NIVEIS_BOM = [["primaria", "Primária"], ["secundaria", "Secundária"], ["terciaria", "Terciária"], ["", "Outros"]];

const TIPO_ROTULO = { embalagem_primaria: "Embalagem primária", tampa: "Tampa", rotulo: "Rótulo", emb_secundaria: "Embalagem secundária", emb_terciaria: "Embalagem terciária" };
const fmt = (v) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 }));

export function fornecedorDaLinha(l) {
  if (l?.fornecido_por === "cliente") return "cliente";
  return l?.fornecedor_principal?.nome || "a definir";
}

// "1/un" ou "24 un/caixa": como a linha se relaciona com a unidade do produto.
export function quantidadeDaLinha(l) {
  if (l?.nivel === "terciaria") return l.unidades_por_embalagem ? `${fmt(l.unidades_por_embalagem)} un/emb.` : "—";
  return l?.quantidade_por_unidade === null || l?.quantidade_por_unidade === undefined ? "—" : `${fmt(l.quantidade_por_unidade)}/un`;
}

export function rotuloDoTipo(l) {
  return l?.tipo_componente_nome || TIPO_ROTULO[l?.tipo] || l?.componente || "";
}

/* { produto, resumo, niveis: [{ nivel, titulo, itens: [{ id, titulo, detalhe, especificacao }] }] } — só níveis com linhas. */
export function arvoreDoBom(bom, { produto = "", sku = "" } = {}) {
  const linhas = (bom || []).filter((l) => l && l.tipo !== "mp_formula");
  const niveis = NIVEIS_BOM.map(([nivel, titulo]) => {
    const itens = linhas.filter((l) => (l.nivel || "") === nivel).map((l) => ({
      id: l.id || l.codigo_interno,
      titulo: l.descricao || l.componente || "",
      especificacao: l.especificacao && l.especificacao !== l.descricao ? l.especificacao : "",
      detalhe: [rotuloDoTipo(l), quantidadeDaLinha(l), `total ${fmt(l.quantidade_total_pedido)}`, `fornecedor: ${fornecedorDaLinha(l)}`, l.definido === false ? "a definir" : ""]
        .filter(Boolean).join(" · "),
    }));
    return { nivel, titulo, itens };
  }).filter((n) => n.itens.length);
  const porUnidade = linhas.filter((l) => l.nivel !== "terciaria" && l.quantidade_por_unidade)
    .map((l) => `${fmt(l.quantidade_por_unidade)} ${(l.componente || l.descricao || "").toLowerCase()}`);
  return { produto: [produto, sku].filter(Boolean).join(" — "), resumo: porUnidade.length ? `1 unidade = ${porUnidade.join(" + ")}` : "", niveis };
}
