/* Retrabalhar amostra já aprovada (AMO-05, PROMPT_ENGENHARIA_PACOTE_20261021.md; RFC-001 §6).
 *
 * Antes o retrabalho só existia enquanto a variação estava com o cliente ("enviada"). Depois de
 * aprovada, mudar a amostra exigia gambiarra: a aprovação ficava valendo e o Kickoff, a cotação
 * e o orçamento seguiam sobre uma fórmula que ia mudar.
 * Agora: o Comercial registra o que deve mudar e quem pediu; a aprovação vai para o histórico da
 * variação (nunca é apagada); o P&D destrava para a próxima versão (o mecanismo de versões que já
 * existe, V2 da mesma variação); Kickoff e orçamento do projeto ficam `desatualizado` até nova
 * versão ou decisão registrada ("revisado, sem impacto").
 * Funções puras: nada aqui lê ou grava no banco. */

export const MIN_O_QUE_ALTERAR = 10;
export const SOLICITANTES = { cliente: "Cliente", interno: "Kuryos (interno)" };
export const EVENTO_RETRABALHO = "amostra.retrabalho_solicitado";
// Status do P&D em que a solicitação está fechada pela aprovação; o retrabalho volta para Reprovado
// (Retrabalho no quadro), de onde o P&D abre a próxima versão.
export const PD_FECHADO = new Set(["APPROVED", "COMPLETED"]);

export const aprovadaPeloCliente = (v) => (v?.status === "aprovada" || v?.resultado_cliente === "aprovada" || v?.resultado === "aprovada");

export function validarPedidoRetrabalho(variacao, pedido) {
  const erros = [];
  if (!aprovadaPeloCliente(variacao)) erros.push("Só amostra aprovada pelo cliente usa este retrabalho; antes da aprovação, registre o retorno do cliente.");
  const oQue = String(pedido?.o_que_alterar || "").trim();
  if (oQue.length < MIN_O_QUE_ALTERAR) erros.push(`Descreva o que deve ser alterado (mínimo ${MIN_O_QUE_ALTERAR} caracteres).`);
  if (!SOLICITANTES[pedido?.solicitado_por]) erros.push("Informe quem pediu o retrabalho: cliente ou Kuryos.");
  return { ok: !erros.length, erros, o_que_alterar: oQue, solicitado_por: pedido?.solicitado_por };
}

/* Variação depois do pedido: volta a "retrabalho"; a aprovação e o retorno anteriores vão para
 * aprovacoes_anteriores. resultado_em = agora: a reconciliação do P&D só aceita retorno posterior à
 * próxima entrega (aguardando_cliente_desde da solicitação), então o retrabalho não volta sozinho
 * quando a amostra refeita for entregue (defeito de 16/10). */
export function variacaoEmRetrabalho(variacao, pedido, { por = "", porNome = "", em = "" } = {}) {
  const v = variacao || {};
  const anterior = { aprovacao_cliente: v.aprovacao_cliente || null, resultado_em: v.resultado_em || null, feedback_cliente: v.feedback_cliente || "",
    versao: v.versao_formula || v.formula_versao || null, arquivada_em: em };
  return {
    ...v,
    status: "retrabalho", resultado_cliente: "retrabalho", ...(v.resultado !== undefined ? { resultado: "retrabalho" } : {}),
    direcoes_retrabalho: pedido.o_que_alterar, feedback_cliente: pedido.o_que_alterar,
    aprovacao_cliente: null, resultado_em: em,
    aprovacoes_anteriores: [...(v.aprovacoes_anteriores || []), anterior],
    retrabalho_pos_aprovacao: { o_que_alterar: pedido.o_que_alterar, solicitado_por: pedido.solicitado_por, por, por_nome: porNome, em },
  };
}

export function entradaRetrabalhos(pedido, { variacaoId = "", codigo = "", em = "" } = {}) {
  return { origem: pedido.solicitado_por === "cliente" ? "externa" : "interna", data: em, variacao_id: variacaoId, apos_aprovacao: true,
    motivo: `Retrabalho após aprovação${codigo ? ` (${codigo})` : ""}: ${pedido.o_que_alterar}` };
}

// Marca do RFC-001 §4: { desde, motivo, evento_id, diff }.
export function marcaDesatualizado({ motivo, eventoId = null, em, diff = [] }) {
  return { desde: em, motivo, evento_id: eventoId, diff };
}

/* "Revisado, sem impacto": tira a marca com decisão registrada (a marca vai para o histórico). */
export function resolverDesatualizado(doc, { motivo, por = "", porNome = "", em = "" } = {}) {
  const m = String(motivo || "").trim();
  if (!doc?.desatualizado) return { ok: false, erro: "Não está desatualizado." };
  if (m.length < MIN_O_QUE_ALTERAR) return { ok: false, erro: `Explique por que não há impacto (mínimo ${MIN_O_QUE_ALTERAR} caracteres).` };
  return { ok: true, mudancas: {
    desatualizado: null,
    desatualizado_historico: [...(doc.desatualizado_historico || []), { ...doc.desatualizado, resolvido_em: em, resolvido_por: por, resolvido_por_nome: porNome, decisao: "revisado_sem_impacto", motivo_decisao: m }],
  } };
}

export function textoDesatualizado(d) {
  if (!d) return "";
  return `Desatualizado desde ${String(d.desde || "").slice(0, 10).split("-").reverse().join("/")}: ${d.motivo}`;
}
