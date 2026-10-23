/* Kickoff vivo (RFC-001 §7 regra 1; base do KO-02): com o Kickoff nascendo junto com o projeto
 * (D-2), o que o projeto, o cliente, a amostra e a fórmula ganham depois chega ao questionário.
 * Só preenche o que está VAZIO e só em bloco que não foi validado nem congelado — o que alguém
 * digitou nunca é sobrescrito. Linhas de componentes ficam de fora (são estruturadas pela pessoa).
 *
 * KO-02 (23/10/2026): cada campo que veio de fora guarda de onde veio em
 * questionario.origem[bloco][campo] = { fonte, atualizado_em, sobrescrito, motivo }. A tela mostra
 * o selo; mudar um valor que veio da origem exige motivo, que fica gravado no mesmo lugar.
 * Funções puras: nada aqui lê ou grava no banco. */

const vazio = (v) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
const NAO_SAO_BLOCOS = new Set(["origem", "autopopulated_from", "schema_version", "motivos_sobrescrita"]);
export const MIN_MOTIVO = 5;

// Devolve { questionario, campos: ["bloco0.volume_gramatura", ...] } com o que foi completado.
export function preencherVazios(atual, novo, blocosTravados = []) {
  const travados = new Set(blocosTravados);
  const out = { ...(atual || {}) };
  const origem = { ...(out.origem || {}) };
  const campos = [];
  for (const [bloco, dados] of Object.entries(novo || {})) {
    if (NAO_SAO_BLOCOS.has(bloco) || travados.has(bloco) || !dados || typeof dados !== "object" || Array.isArray(dados)) continue;
    const destino = { ...(out[bloco] || {}) };
    for (const [campo, valor] of Object.entries(dados)) {
      if (campo === "componentes" || vazio(valor) || !vazio(destino[campo])) continue;
      destino[campo] = valor;
      campos.push(`${bloco}.${campo}`);
      const o = novo.origem?.[bloco]?.[campo];
      if (o) origem[bloco] = { ...(origem[bloco] || {}), [campo]: o };
    }
    out[bloco] = destino;
  }
  if (Object.keys(origem).length) out.origem = origem;
  return { questionario: out, campos };
}

/* Coletor de origem para quem monta o questionário: de(bloco, campo, [valor, fonte], ...) devolve o
 * primeiro valor não vazio e anota a fonte dele. */
export function coletorDeOrigem(agora) {
  const origem = {};
  const de = (bloco, campo, ...pares) => {
    for (const [valor, fonte] of pares) {
      if (vazio(valor) || (typeof valor === "object" && !Array.isArray(valor) && !Object.keys(valor).length)) continue;
      origem[bloco] = { ...(origem[bloco] || {}), [campo]: { fonte, atualizado_em: agora, sobrescrito: false } };
      return valor;
    }
    return "";
  };
  return { de, origem };
}

const igual = (a, b) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");

// Campos que vieram da origem (e ainda não foram sobrescritos) e mudaram entre antes e depois.
export function sobrescritasDaOrigem(antes, depois) {
  const campos = [];
  for (const [bloco, porCampo] of Object.entries(antes?.origem || {})) {
    for (const [campo, o] of Object.entries(porCampo || {})) {
      if (o?.sobrescrito) continue;
      if (!igual(antes?.[bloco]?.[campo], depois?.[bloco]?.[campo])) campos.push(`${bloco}.${campo}`);
    }
  }
  return campos;
}

/* Exige motivo para cada campo sobrescrito e marca a origem. motivos = { "bloco0.volume_gramatura": "..." }.
 * Devolve { questionario, faltam: [{ campo, fonte }] }. */
export function aplicarSobrescritas(questionario, campos, motivos, { por = "", porNome = "", em = "" } = {}) {
  const origem = JSON.parse(JSON.stringify(questionario?.origem || {}));
  const faltam = [];
  for (const chave of campos) {
    const [bloco, campo] = chave.split(".");
    const o = origem[bloco]?.[campo];
    const motivo = String(motivos?.[chave] || "").trim();
    if (motivo.length < MIN_MOTIVO) { faltam.push({ campo: chave, fonte: o?.fonte || "" }); continue; }
    origem[bloco][campo] = { ...o, sobrescrito: true, motivo, sobrescrito_por: por, sobrescrito_por_nome: porNome, sobrescrito_em: em };
  }
  return { questionario: { ...questionario, origem }, faltam };
}

/* Variações aprovadas → o que varia entre os SKUs (opções do Bloco 0) e se alguma é de outra
 * categoria. aprovadas = [{ sample, variation }]. */
const OPCAO_DO_PARAMETRO = { fragrancia: "fragrancia", fragrância: "fragrancia", cor: "cor", volume: "volume", versao: "versao", versão: "versao" };

export function variacaoEntreSkus(aprovadas, categoriaProjeto = "") {
  const lista = aprovadas || [];
  const varia = new Set();
  const outros = new Set();
  const distintos = (f) => new Set(lista.map(({ variation }) => String(variation?.[f] ?? "").trim().toLowerCase()).filter(Boolean)).size > 1;
  if (lista.length > 1) {
    if (distintos("referencia_fragrancia")) varia.add("fragrancia");
    if (distintos("cor")) varia.add("cor");
    for (const { sample } of lista) {
      const p = String(sample?.parametro_variacao || "").trim().toLowerCase();
      if (!p) continue;
      if (OPCAO_DO_PARAMETRO[p]) varia.add(OPCAO_DO_PARAMETRO[p]);
      else { varia.add("outro"); outros.add(sample.parametro_variacao); }
    }
  }
  const norm = (c) => String(c || "").trim().toLowerCase();
  const categorias = [...new Set(lista.map(({ sample }) => norm(sample?.categoria)).filter(Boolean))];
  const base = norm(categoriaProjeto) || categorias[0] || "";
  const diferentes = categorias.filter((c) => c !== base);
  return {
    numero_skus: lista.length,
    varia_entre_skus: [...varia],
    varia_entre_skus_outro: [...outros].join(", "),
    variacao_outra_categoria: !lista.length || !categorias.length ? "" : diferentes.length ? "sim" : "nao",
    variacao_outra_categoria_qual: diferentes.join(", "),
  };
}
