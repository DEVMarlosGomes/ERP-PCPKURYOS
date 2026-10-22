/* Fechamento de 100% da fórmula (AMO-03, PROMPT_ENGENHARIA_PACOTE_20261021.md).
 *
 * Pedido do usuário (21–22/10/2026): alterou variante ou fórmula e não fecha 100% →
 * não conclui, popup vermelho, e a correção é da Química (sem q.s.p. automático: o
 * sistema nunca completa sozinho). Antes, a única trava era ±0,5 só na fórmula base, ao
 * ir para Em Testes; as variantes dos lotes nunca eram conferidas.
 *
 * Soma em inteiros (% × 10⁶) para não acumular erro de ponto flutuante em dezenas de
 * itens com 3–4 casas. Funções puras: nada aqui lê ou grava no banco. */

export const TOLERANCIA_FORMULA = 0.001; // pontos percentuais
export const CODIGO_FORMULA_NAO_FECHA = "FORMULA_NAO_FECHA_100";

const ESCALA = 1e6;
const escalado = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * ESCALA) : 0;
};

export function fechamentoFormula(itens) {
  const total = (itens || []).reduce((s, it) => s + escalado(it?.percentage), 0);
  const diferenca = total - 100 * ESCALA; // > 0 excede, < 0 falta
  const ok = Math.abs(diferenca) <= Math.round(TOLERANCIA_FORMULA * ESCALA);
  return { soma: total / ESCALA, diferenca: diferenca / ESCALA, ok };
}

const fmt = (n) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 4 });

export function textoFechamento(r) {
  if (r.ok) return `Fecha 100% (${fmt(r.soma)}%).`;
  return r.diferenca < 0
    ? `Soma ${fmt(r.soma)}% — falta ${fmt(-r.diferenca)}%.`
    : `Soma ${fmt(r.soma)}% — excede ${fmt(r.diferenca)}%.`;
}

// Mesma regra da Ordem de Manipulação do lote (PDDetail.resolveVariantItems): a variante é a
// fórmula base com os ingredientes substituídos, cada um com o % da substituição.
export function itensDaVariante(itensBase, overrides) {
  const porBase = new Map((overrides || []).filter((o) => o?.ingredient_name_base).map((o) => [o.ingredient_name_base, o]));
  return (itensBase || []).map((it) => {
    const ov = porBase.get(it.ingredient_name);
    return ov ? { ...it, ingredient_name: ov.ingredient_name || it.ingredient_name, percentage: ov.percentage, substituido: true } : it;
  });
}

// Pendências de um lote: uma por variante fora de 100%.
export function pendenciasDoLote(lote, itensBase) {
  return (lote?.variantes || []).map((v, i) => {
    const r = fechamentoFormula(itensDaVariante(itensBase, v.overrides));
    return { lote: lote.nome || "", variante: v.nome || `Variante ${i + 1}`, ...r };
  }).filter((p) => !p.ok);
}

// Corpo do erro 422 que a tela transforma no popup vermelho.
export function erroNaoFecha({ formula, pendencias, responsavel }) {
  const linhas = [
    ...(formula && !formula.ok ? [`Fórmula ${formula.nome || ""}: ${textoFechamento(formula)}`.replace("  ", " ")] : []),
    ...(pendencias || []).map((p) => `Lote ${p.lote} · ${p.variante}: ${textoFechamento(p)}`),
  ];
  return {
    codigo: CODIGO_FORMULA_NAO_FECHA,
    message: `A fórmula precisa fechar 100% para concluir. ${linhas.join(" ")} A correção é da Química${responsavel ? ` (${responsavel})` : ""}.`,
    formula: formula && !formula.ok ? formula : null,
    pendencias: pendencias || [],
    responsavel: responsavel || "",
    linhas,
  };
}
