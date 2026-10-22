/* Formulação base do projeto (AMO-02, PROMPT_ENGENHARIA_PACOTE_20261021.md).
 *
 * Pedido do usuário (21/10/2026): no lote de amostras, os ingredientes da base (em geral
 * álcool, água, conservantes) ficam salvos e aparecem para as demais amostras do mesmo
 * projeto; na variação, só a fragrância muda.
 *
 * A base vive em erp/{tenant}/pd_formulacoes_base/{id} com versão por projeto. Versão
 * gravada nunca muda: base diferente gera a próxima versão, e o lote guarda a versão que
 * usou. Funções puras: nada aqui lê ou grava no banco. */

const chaveNome = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const pct4 = (v) => Math.round((Number(v) || 0) * 1e4);

// Itens da base no formato gravado (o editor do lote já monta nome/código/INCI/% do Cadastros).
export function normalizarItensBase(itens) {
  return (itens || [])
    .filter((i) => String(i?.nome || "").trim())
    .map((i) => ({ nome: String(i.nome).trim(), codigo: i.codigo || "", inci: i.inci || "", percentual: Number(i.percentual) || 0 }));
}

// Mesma base = mesmos ingredientes com o mesmo % (ordem e caixa não importam).
export function mesmaBase(a, b) {
  const assinatura = (lista) => normalizarItensBase(lista).map((i) => `${chaveNome(i.nome)}=${pct4(i.percentual)}`).sort().join("|");
  return assinatura(a) === assinatura(b);
}

export const baseVigente = (basesDoProjeto) =>
  [...(basesDoProjeto || [])].sort((x, y) => Number(y.versao || 0) - Number(x.versao || 0))[0] || null;

// Ao salvar o lote: reaproveita a versão vigente se a base for igual; senão, cria a próxima.
export function planoDaBase(basesDoProjeto, itens) {
  const normal = normalizarItensBase(itens);
  if (!normal.length) return { acao: "nenhuma" };
  const vigente = baseVigente(basesDoProjeto);
  if (vigente && mesmaBase(vigente.itens, normal)) return { acao: "reusar", base: vigente };
  return { acao: "criar", versao: (Number(vigente?.versao) || 0) + 1, itens: normal };
}

// Na variação só a fragrância muda: substituir um ingrediente que está na base é recusado.
export function substituicoesForaDaFragrancia(variantes, nomesDaBase) {
  const base = new Set((nomesDaBase || []).map(chaveNome));
  const erros = [];
  (variantes || []).forEach((v, i) => (v.overrides || []).forEach((o) => {
    if (o?.ingredient_name_base && base.has(chaveNome(o.ingredient_name_base))) {
      erros.push(`${v.nome || `Variante ${i + 1}`}: "${o.ingredient_name_base}" é da base — na variação só a fragrância muda.`);
    }
  }));
  return erros;
}
