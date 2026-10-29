/* PD-04 (reunião 28/10/2026, D-14): "Parâmetro de variação" do lote de amostras.
 *
 * Antes: o campo lia constants.sample_parametros_variacao, que não existia (só aparecia
 * "Nenhuma"), e cada variação mostrava sempre os campos de fragrância. Agora a lista e os
 * campos de cada variação seguem o parâmetro escolhido. Os valores gravados em
 * crm_samples/{id}/parametro_variacao são os que o Kickoff já entende
 * (kickoffAutopreenchimento.js: fragrancia, cor, volume, versao; o resto vira "outro").
 * Fragrância mantém os nomes de campo antigos (CRM3, Kickoff e P&D leem esses nomes);
 * cor grava o código em `cor`, que o Kickoff compara entre SKUs. Funções puras. */

export const SEM_PARAMETRO = "";

export const PARAMETROS_VARIACAO = [
  {
    valor: "fragrancia",
    rotulo: "Fragrância",
    campos: [
      { campo: "percentual_fragrancia", rotulo: "% de fragrância", tipo: "numero", placeholder: "% fragrância" },
      { campo: "referencia_fragrancia", rotulo: "Referência da fragrância", tipo: "texto", placeholder: "Ref. fragrância" },
      { campo: "custo_fragrancia", rotulo: "Custo da fragrância", tipo: "moeda", campoMoeda: "custo_fragrancia_currency" },
    ],
  },
  {
    valor: "cor",
    rotulo: "Cor",
    campos: [
      { campo: "pigmento", rotulo: "Pigmento", tipo: "texto", placeholder: "Ex.: óxido de ferro vermelho" },
      { campo: "cor", rotulo: "Código da cor", tipo: "texto", placeholder: "Ex.: Pantone 7621 C" },
    ],
  },
  {
    valor: "volume",
    rotulo: "Volume",
    campos: [
      { campo: "volume", rotulo: "Volume", tipo: "numero", placeholder: "Ex.: 120" },
      { campo: "unidade_volume", rotulo: "Unidade", tipo: "opcao", opcoes: ["ml", "g", "L", "kg"] },
    ],
  },
  {
    valor: "versao",
    rotulo: "Versão",
    campos: [
      { campo: "nome_versao", rotulo: "Nome da versão", tipo: "texto", placeholder: "Ex.: Versão leve" },
      { campo: "o_que_muda", rotulo: "O que muda", tipo: "texto", placeholder: "Ex.: menos emoliente, sem silicone" },
    ],
  },
  {
    valor: "concentracao",
    rotulo: "Concentração",
    campos: [
      { campo: "ativo", rotulo: "Ativo", tipo: "texto", placeholder: "Ex.: Niacinamida" },
      { campo: "percentual_ativo", rotulo: "% do ativo", tipo: "numero", placeholder: "Ex.: 5" },
    ],
  },
];

const POR_VALOR = new Map(PARAMETROS_VARIACAO.map((p) => [p.valor, p]));
// Gravado com acento ou maiúscula em algum lugar: "Fragrância" → fragrancia.
export const normalizarParametro = (valor) =>
  String(valor || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export function parametroDe(valor) {
  return POR_VALOR.get(normalizarParametro(valor)) || null;
}

/* Campos da variação para o parâmetro. Nenhum (ou desconhecido) → nenhum campo próprio:
 * a variação fica com descrição e observações. */
export function camposDoParametro(valor) {
  return parametroDe(valor)?.campos || [];
}

// "Nenhuma" → uma variação só.
export const aceitaVariasVariacoes = (valor) => Boolean(parametroDe(valor));

export function variacaoVazia(valor) {
  const v = { descricao_aplicacao: "", observacoes_especificas: "" };
  for (const c of camposDoParametro(valor)) {
    v[c.campo] = "";
    if (c.campoMoeda) v[c.campoMoeda] = "USD";
  }
  return v;
}

/* Trocar o parâmetro: grava o valor e, se for "Nenhuma", fica só a primeira variação.
 * Os campos já digitados das variações que ficam não são apagados (o banco guarda o que veio). */
export function trocarParametro(amostra, valor) {
  const p = parametroDe(valor);
  const variacoes = amostra?.variacoes?.length ? amostra.variacoes : [variacaoVazia(valor)];
  return { ...amostra, parametro_variacao: p ? p.valor : SEM_PARAMETRO, variacoes: p ? variacoes : variacoes.slice(0, 1) };
}

const vazio = (v) => v === undefined || v === null || String(v).trim() === "";

/* O que foi digitado, para o card da amostra (CRM3) e o P&D: [{ rotulo, valor }].
 * Amostra antiga sem parâmetro que tem campos de fragrância continua mostrando a fragrância. */
export function camposPreenchidos(valor, variacao) {
  const v = variacao || {};
  const campos = parametroDe(valor) ? camposDoParametro(valor) : POR_VALOR.get("fragrancia").campos;
  const out = [];
  for (const c of campos) {
    if (vazio(v[c.campo])) continue;
    if (c.campo === "unidade_volume") continue; // vai junto do volume
    let texto = String(v[c.campo]).trim();
    if (c.campo === "volume" && !vazio(v.unidade_volume)) texto = `${texto} ${v.unidade_volume}`;
    if (c.tipo === "moeda") texto = `${v[c.campoMoeda] === "BRL" ? "R$" : "US$"} ${texto}`;
    if (c.campo.startsWith("percentual_")) texto = `${texto}%`;
    out.push({ rotulo: c.rotulo, valor: texto });
  }
  return out;
}

export function resumoDaVariacao(valor, variacao) {
  const campos = camposPreenchidos(valor, variacao);
  if (!campos.length) return "";
  const p = parametroDe(valor);
  return `${p ? `${p.rotulo}: ` : ""}${campos.map((c) => `${c.rotulo} ${c.valor}`).join(" · ")}`;
}
