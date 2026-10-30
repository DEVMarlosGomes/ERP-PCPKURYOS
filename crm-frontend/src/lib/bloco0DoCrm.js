/* KO-10 (reunião 28/10/2026, D-04): o Bloco 0 do Kickoff (Módulo 1) vem todo do CRM.
 *
 * Medido no código (29/10): forma física e classificação do projeto ficavam pendentes mesmo com o
 * projeto completo no CRM, porque o CRM grava texto livre (textura "Creme leve") e o tipo de serviço
 * com os valores dele (desenvolvimento_completo, adaptacao_formula, industrializacao, private_label),
 * que o Kickoff não reconhecia; o volume da variação (PD-04) e os serviços do orçamento não eram lidos.
 * Aqui só a tradução do valor do CRM para a opção do Kickoff. Funções puras, sem banco. */

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const FORMAS_FISICAS = ["liquido", "creme_gel", "po", "aerossol", "bastao", "outro"];

const REGRAS_FORMA = [
  ["aerossol", /aeross|spray pressuriz|espuma pressuriz/],
  ["po", /\bpo\b|\bpo compacto|powder|talco|\bpo solto/],
  ["bastao", /bastao|stick|batom|balm em bastao/],
  ["creme_gel", /creme|cream|gel|locao|manteiga|butter|balm|mascara|pomada|pasta|serum gel|unguento|mousse/],
  ["liquido", /liquid|splash|tonico|serum|oleo|agua|solucao|shampoo|sabonete liquido|perfume|colonia|bruma|mist|spray|fluid/],
];

/* Texto do CRM → { forma_fisica, forma_fisica_outro }. Valor que já é opção do Kickoff passa igual;
 * texto que não casa com nenhuma vira "outro" com o texto (o Bloco 0 não fica pendente e nada se perde). */
export function formaFisicaDoCrm(...textos) {
  for (const texto of textos) {
    const t = norm(texto);
    if (!t) continue;
    if (FORMAS_FISICAS.includes(t)) return { forma_fisica: t, forma_fisica_outro: "" };
    const achada = REGRAS_FORMA.find(([, re]) => re.test(t));
    if (achada) return { forma_fisica: achada[0], forma_fisica_outro: "" };
    return { forma_fisica: "outro", forma_fisica_outro: String(texto).trim() };
  }
  return { forma_fisica: "", forma_fisica_outro: "" };
}

// Tipo de serviço do CRM (constants.project_tipo_servico) e nomes antigos → classificação do Kickoff.
const MODELO = {
  industrializacao: "industrializacao_pura", industrializacao_pura: "industrializacao_pura", formula_do_cliente: "industrializacao_pura",
  adaptacao_formula: "industrializacao_com_desenvolvimento", co_desenvolvimento: "industrializacao_com_desenvolvimento",
  desenvolvimento_completo: "industrializacao_com_desenvolvimento", industrializacao_com_desenvolvimento: "industrializacao_com_desenvolvimento",
  private_label: "full_service_marca_propria", full_service: "full_service_marca_propria", full_service_kuryos: "full_service_marca_propria",
  full_service_marca_propria: "full_service_marca_propria",
};
export function modeloServicoDoCrm(valor) {
  const k = norm(valor).replace(/[\s-]+/g, "_");
  return MODELO[k] || (k ? String(valor).trim() : "");
}

// Volume da variação (PD-04: parâmetro "volume") ou da amostra: "120 ml".
export function volumeDaVariacao(variacao) {
  const v = variacao || {};
  const n = String(v.volume ?? "").trim();
  if (!n) return "";
  return `${n}${v.unidade_volume ? ` ${v.unidade_volume}` : ""}`;
}

// Serviços que o orçamento/cotação já cobra (composicao.servicos[].servico_id), sem repetir.
export function servicosDaProposta(proposta) {
  const linhas = proposta?.composicao?.servicos || [];
  return [...new Set((Array.isArray(linhas) ? linhas : Object.values(linhas)).map((l) => l?.servico_id).filter(Boolean))];
}

// Registro ANVISA: o CRM guarda sim/não ou o texto; o Kickoff, "existe" / "a_providenciar".
export function registroAnvisaDoCrm(valor) {
  const k = norm(valor);
  if (!k) return "";
  if (["existe", "sim", "s", "true", "tem", "registrado", "notificado"].includes(k)) return "existe";
  if (["a_providenciar", "nao", "n", "false", "providenciar"].includes(k)) return "a_providenciar";
  return "";
}
