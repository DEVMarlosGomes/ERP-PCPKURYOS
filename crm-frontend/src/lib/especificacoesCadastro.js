/* PD-06 (reunião 28/10/2026, D-07): o P&D puxa as especificações do Cadastros
 * (Fórmulas/BOM/Especificações) para a Ficha Técnica, em vez de digitar à mão.
 *
 * Cadastros guarda especificacoes/{produtoKey}__v{n} = { codProduto, versao, status, itens: {
 * ensaio, especificacaoTexto, minimo, maximo, metodo, critico } }; o ensaio vem de
 * config/tiposEnsaio (ASPECTO, COR, ODOR, DENSIDADE, PH, TEOR DE ÁLCOOL...).
 * Regras: preenche só a especificação vazia (o que o P&D já digitou fica), continua editável e
 * cada campo puxado guarda a origem (produto, SKU, versão). Funções puras, sem banco. */

const normalizar = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

// Ensaio do Cadastros → linha da Ficha Técnica do P&D (FT_PARAMS em PDDetail.js).
export const CAMPO_DO_ENSAIO = {
  ASPECTO: "aspecto",
  COR: "cor",
  DENSIDADE: "densidade",
  ODOR: "odor",
  PH: "ph",
  "TEOR DE ALCOOL": "teor_alcool",
  "TEOR ALCOOLICO": "teor_alcool",
};

export const campoDoEnsaio = (ensaio) => CAMPO_DO_ENSAIO[normalizar(ensaio)] || null;

/* "Límpido · 0,98 a 1,02" — texto do Cadastros e a faixa, o que houver. */
export function textoDaEspecificacao(item) {
  const i = item || {};
  const min = String(i.minimo ?? "").trim();
  const max = String(i.maximo ?? "").trim();
  const faixa = min && max ? `${min} a ${max}` : min ? `mín. ${min}` : max ? `máx. ${max}` : "";
  return [String(i.especificacaoTexto || "").trim(), faixa].filter(Boolean).join(" · ");
}

const numeroDaVersao = (registro, chave) => {
  const n = Number(registro?.versao ?? String(chave || "").split("__v").pop());
  return Number.isFinite(n) ? n : 0;
};

/* Versão a puxar de um produto: a aprovada mais nova; sem aprovada, a mais nova com itens.
 * especificacoes = nó especificacoes/ inteiro ({ chave: registro }). */
export function versaoParaPuxar(especificacoes, produtoKey) {
  const versoes = Object.entries(especificacoes || {})
    .filter(([chave, r]) => r && (r.codProduto === produtoKey || chave.startsWith(`${produtoKey}__`)))
    .filter(([, r]) => Object.keys(r.itens || {}).length > 0)
    .map(([chave, r]) => ({ chave, versao: numeroDaVersao(r, chave), status: r.status || "", itens: r.itens || {} }))
    .sort((a, b) => b.versao - a.versao);
  return versoes.find((v) => v.status === "APROVADA") || versoes[0] || null;
}

/* Produtos do Cadastros que têm especificação para puxar, com a versão escolhida. */
export function opcoesParaPuxar(produtos, especificacoes) {
  const out = [];
  for (const [produtoKey, p] of Object.entries(produtos || {})) {
    if (!p || p.ativo === false || p.ativo === "Inativo") continue;
    const v = versaoParaPuxar(especificacoes, produtoKey);
    if (!v) continue;
    out.push({ produtoKey, sku: p.sku || produtoKey, produto: p.descricao || p.nome || produtoKey, cliente: p.cliente || "", ...v });
  }
  return out.sort((a, b) => String(a.sku).localeCompare(String(b.sku), "pt-BR"));
}

// Busca por SKU ou pelo nome do produto de referência.
export function filtrarOpcoes(opcoes, busca) {
  const b = normalizar(busca);
  if (!b) return opcoes || [];
  return (opcoes || []).filter((o) => normalizar(o.sku).includes(b) || normalizar(o.produto).includes(b));
}

/* Junta a especificação escolhida na Ficha Técnica. Só preenche especificação vazia; cada linha
 * puxada guarda `especificacao_origem`; a ficha guarda `especificacoes_origem` (a última puxada).
 * Devolve { form, preenchidos, mantidos, semCorrespondencia }. */
export function mesclarEspecificacoes(form, opcao, { em = "", por = "" } = {}) {
  const novo = { ...(form || {}) };
  const preenchidos = [];
  const mantidos = [];
  const semCorrespondencia = [];
  const origem = { fonte: "cadastros", produto_key: opcao.produtoKey, sku: opcao.sku, produto: opcao.produto, versao: opcao.versao, status: opcao.status, chave: opcao.chave };
  for (const item of Object.values(opcao.itens || {})) {
    const campo = campoDoEnsaio(item?.ensaio);
    const texto = textoDaEspecificacao(item);
    if (!texto) continue;
    if (!campo) { semCorrespondencia.push(String(item.ensaio || "").trim() || "(sem ensaio)"); continue; }
    if (preenchidos.includes(campo)) continue; // ensaio repetido no Cadastros: vale o primeiro
    const atual = novo[campo] || { especificacao: "", resultado: "", pa: "" };
    if (String(atual.especificacao || "").trim()) { mantidos.push(campo); continue; }
    novo[campo] = { ...atual, especificacao: texto, especificacao_origem: { ...origem, puxado_em: em, puxado_por: por } };
    preenchidos.push(campo);
  }
  if (preenchidos.length) novo.especificacoes_origem = { ...origem, puxado_em: em, puxado_por: por, campos: preenchidos };
  return { form: novo, preenchidos, mantidos, semCorrespondencia };
}

// Rótulo curto da origem para a tela: "do Cadastros · PRF-JOHN-0001 v2".
export const rotuloOrigem = (o) => (o?.fonte === "cadastros" ? `do Cadastros · ${o.sku}${o.versao ? ` v${o.versao}` : ""}` : "");
