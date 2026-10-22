/* Contas da amostra e da manipulação do P&D (PLANO_PD_CRM_AJUSTES.md, Fase 1).
 *
 * - A amostra nasce em 60 na unidade escolhida (mL, g, L, kg) e as quantidades
 *   também são mostradas na base de 1000 da mesma unidade, que é a base do
 *   orçamento.
 * - Densidade ≈ 1: mL e g contam como a mesma massa, L e kg também.
 * - Preço em US$ vira R$ pela cotação da fórmula; o R$ fica na sua coluna.
 * Funções puras: nada aqui lê ou grava no banco. */

export const UNIDADES_AMOSTRA = ["mL", "g", "L", "kg"];
export const VOLUME_AMOSTRA_PADRAO = 60;
export const BASE_CALCULO = 1000;
export const COTACAO_USD_PADRAO = 6;

export function unidadeValida(unidade) {
  return UNIDADES_AMOSTRA.includes(unidade) ? unidade : "mL";
}

// mL e g são milésimos de kg; L e kg já estão em kg. Antes o adaptador só
// dividia mL por 1000 e tratava 60 g como 60 kg.
export function volumeEmKg(volume, unidade) {
  const v = Number(volume) || 0;
  const u = unidadeValida(unidade);
  return u === "mL" || u === "g" ? v / 1000 : v;
}

export function quantidadeNaEscala(percentual, escala) {
  return ((Number(percentual) || 0) / 100) * (Number(escala) || 0);
}

// Massa a pesar: em mL/g mostra g (ou mg abaixo de 0,1 g); em L/kg mostra kg
// (ou g abaixo de 1 kg).
export function formatarQuantidade(quantidade, unidade) {
  const q = Number(quantidade) || 0;
  const pequena = unidadeValida(unidade) === "mL" || unidadeValida(unidade) === "g";
  const br = (n, casas) => n.toFixed(casas).replace(".", ",");
  if (q === 0) return pequena ? "0 g" : "0 kg";
  if (pequena) {
    if (q < 0.1) return `${br(q * 1000, 0)} mg`;
    if (q < 10) return `${br(q, 3)} g`;
    return `${br(q, 2)} g`;
  }
  if (q < 1) return `${br(q * 1000, 2)} g`;
  return `${br(q, 3)} kg`;
}

export function precoUsd(item) {
  const raw = item?.price_usd;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Ao finalizar a manipulação (fórmula registrada ao ir para Em Testes) a amostra
// daquela versão nasce sozinha na aba Amostras — uma por versão, sem duplicar.
export function amostraDaVersaoFaltando(amostras, versaoFormula) {
  const v = Number(versaoFormula) || 1;
  return !(amostras || []).some((a) => (Number(a?.formula_version) || 1) === v);
}

// Preço vindo do catálogo/fornecedor vai para o campo da sua moeda: US$ no
// campo US$ (o R$ sai da cotação), R$ no campo R$.
export function camposDePreco(preco, moeda) {
  const valor = preco === null || preco === undefined || preco === "" ? "" : String(preco);
  return moeda === "USD" ? { price_per_kg: "", price_usd: valor } : { price_per_kg: valor, price_usd: "" };
}

// Preço em R$/kg da coluna própria: convertido pela cotação quando há US$,
// senão o R$ digitado.
export function precoBrlKg(item, cotacao) {
  const usd = precoUsd(item);
  if (usd !== null) return usd * (Number(cotacao) || COTACAO_USD_PADRAO);
  return Number(item?.price_per_kg) || 0;
}
