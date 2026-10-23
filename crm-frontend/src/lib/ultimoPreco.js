/* Último preço de compra e preço sugerido (COM-04) — mesma conta de public/shared/ultimo-preco.js
 * (Compras do PCP); ultimoPreco.contrato.test.js garante que os dois dão o mesmo resultado.
 * Sugestão, nesta ordem e com a origem: último PC → última cotação aprovada → fórmula do P&D.
 * Sem nada = SEM PREÇO, nunca zero. Funções puras. */

const numero = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function ultimoPrecoDoMaterial(pedidosCompra, materialCodigo) {
  if (!materialCodigo) return null;
  let achado = null;
  for (const pc of Object.values(pedidosCompra || {})) {
    if (!pc || pc.status === "CANCELADO") continue;
    for (const it of Object.values(pc.itens || {})) {
      const preco = numero(it?.precoUnit);
      if (it?.materialCodigo !== materialCodigo || preco === null || preco <= 0) continue;
      const data = pc.dataEmissao || pc.dataCriacao || "";
      if (!achado || data > achado.data) achado = { precoUnit: preco, fornecedorNome: pc.fornecedorNome || "", data, pcNumero: pc.numeroFormatado || pc.numero || "" };
    }
  }
  return achado;
}

export function sugestaoDePreco({ ultimoPc, cotacaoAprovada, formula } = {}) {
  if (ultimoPc && numero(ultimoPc.precoUnit) > 0) {
    return { preco: numero(ultimoPc.precoUnit), moeda: "BRL", fonte: "ultimo_pc",
      detalhe: ["último PC", ultimoPc.pcNumero, ultimoPc.fornecedorNome, String(ultimoPc.data || "").slice(0, 10)].filter(Boolean).join(" · ") };
  }
  if (cotacaoAprovada && numero(cotacaoAprovada.preco) > 0) {
    return { preco: numero(cotacaoAprovada.preco), moeda: cotacaoAprovada.moeda === "USD" ? "USD" : "BRL", fonte: "cotacao_aprovada",
      detalhe: ["cotação aprovada", cotacaoAprovada.numero, String(cotacaoAprovada.em || "").slice(0, 10)].filter(Boolean).join(" · ") };
  }
  if (formula && numero(formula.preco) > 0) {
    return { preco: numero(formula.preco), moeda: formula.moeda === "USD" ? "USD" : "BRL", fonte: "formula_pd", detalhe: "estimado na fórmula do P&D" };
  }
  return { preco: null, moeda: "BRL", fonte: null, detalhe: "SEM PREÇO" };
}

export const ROTULO_FONTE = { ultimo_pc: "último PC", cotacao_aprovada: "cotação aprovada", formula_pd: "estimado P&D", cotado_compras: "cotado" };
// Preço que veio de sugestão é refeito a cada atualização; o cotado por alguém fica.
export const ehSugestao = (fonte) => ["ultimo_pc", "cotacao_aprovada", "formula_pd"].includes(fonte);
