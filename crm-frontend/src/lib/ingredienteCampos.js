/* Campos do ingrediente que são do MATERIAL (AMO-04, PROMPT_ENGENHARIA_PACOTE_20261021.md).
 *
 * Pedido do usuário (21/10/2026): "MP nova puxar os mesmos campos de ingredientes — INCI
 * até dólar". A linha da manipulação já tem INCI, fornecedor e preço R$/US$; o que se
 * perdia era a ida ao Cadastros (a fila levava só nome, tipo, INCI e fornecedor).
 * Fase e % são da linha da fórmula, não do material: ficam fora daqui.
 *
 * O Cadastros do PCP lê a mesma lista em public/shared/ingrediente-campos.js; o teste
 * ingredienteCampos.test.js falha se as duas divergirem.
 * Funções puras: nada aqui lê ou grava no banco. */

export const CAMPOS_MATERIAL = [
  { chave: "inci", rotulo: "INCI", doItem: "inci" },
  { chave: "funcao", rotulo: "Função", doItem: "function" },
  { chave: "fornecedor", rotulo: "Fornecedor", doItem: "fornecedor" },
  { chave: "preco_brl_kg", rotulo: "Preço R$/kg", doItem: "price_per_kg", numero: true },
  { chave: "preco_usd_kg", rotulo: "Preço US$/kg", doItem: "price_usd", numero: true },
];

const texto = (v) => (v === null || v === undefined ? "" : String(v).trim());

function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Linha da manipulação (pd_formula_items) → campos do material. Preço ausente é null, nunca zero.
export function camposMaterialDoItem(item) {
  const i = item || {};
  const out = {};
  for (const c of CAMPOS_MATERIAL) out[c.chave] = c.numero ? numero(i[c.doItem]) : texto(i[c.doItem]);
  return out;
}
