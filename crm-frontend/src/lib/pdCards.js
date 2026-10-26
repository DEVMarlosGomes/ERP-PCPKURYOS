/* Cards do P&D em dia com o retorno do cliente (PLANO_PD_CRM_AJUSTES.md, Fase 1.6).
 *
 * Medido em 15/10/2026 na base real: o espelho só ia do P&D para o CRM. Das
 * variações que o cliente já aprovou no CRM3, 10 seguiam "Aguardando Aprovação"
 * no P&D, e 1 com retrabalho pedido também; 3 solicitações não tinham card e 5
 * cards não tinham solicitação. Regras:
 *   - P&D esperando o cliente + cliente aprovou → Aprovado;
 *   - P&D esperando o cliente + cliente pediu retrabalho/reprovou → Retrabalho
 *     (o P&D volta a mexer, Fase 2.1);
 *   - fora dessa espera o retorno não mexe no P&D.
 * Funções puras: nada aqui lê ou grava no banco. */

const ESPERANDO_CLIENTE = "WAITING_APPROVAL";

// Revisão (16/10): depois de um retrabalho a variação continua "retrabalho" no CRM até o
// cliente responder de novo. Quando o P&D reenvia (aguardando_cliente_desde), só vale o
// retorno registrado depois do envio; sem a data (solicitação antiga) vale como antes.
export function statusPeloRetornoDoCliente(statusSolicitacao, statusVariacao, { aguardandoDesde, resultadoEm } = {}) {
  if ((statusSolicitacao || "OPEN") !== ESPERANDO_CLIENTE) return null;
  if (aguardandoDesde && !(String(resultadoEm || "") > String(aguardandoDesde))) return null;
  if (statusVariacao === "aprovada") return "APPROVED";
  if (statusVariacao === "retrabalho" || statusVariacao === "reprovada") return "REJECTED";
  return null;
}

// Status comercial da variação (CRM3) acompanha o P&D (26/10/2026). O sistema antigo
// gravava isso a cada movimento (histórico "sincronizado_pd", até 20/10); no Firebase só
// o status_pd_raw seguia, e a variação ficava "em_elaboracao" com a amostra já entregue.
// Aprovação nunca vem daqui: só pelo retorno do cliente com quem/canal/data (COM-02).
const STATUS_COMERCIAL_PELO_PD = {
  OPEN: "solicitada",
  IN_PROGRESS: "em_elaboracao",
  IN_TESTS: "em_elaboracao",
  WAITING_APPROVAL: "enviada",
  REJECTED: "retrabalho",
};
const DECIDIDO_PELO_CLIENTE = new Set(["aprovada", "reprovada", "cancelada", "plano_futuro"]);

export function statusComercialPeloPd(statusVariacao, statusSolicitacao) {
  if (DECIDIDO_PELO_CLIENTE.has(statusVariacao)) return null;
  const novo = STATUS_COMERCIAL_PELO_PD[statusSolicitacao || "OPEN"];
  if (!novo || novo === statusVariacao) return null;
  // Esperando o cliente, "aguardando informação" é o Comercial falando com ele: fica.
  if (novo === "enviada" && String(statusVariacao || "").startsWith("aguardando_informa")) return null;
  return novo;
}

export function entradaHistoricoSync(de, para, statusPd, labelPd, em) {
  return { data: em, de: de || "", para, label_pd: labelPd, status_pd: statusPd, sincronizado_pd: true, usuario: "Sincronização P&D", usuario_id: "sistema" };
}

// Fase 2.1: P&D envia a amostra, o Comercial leva ao cliente e o P&D não mexe
// até o retorno. Retrabalho (REJECTED → Em Desenvolvimento) destrava e abre a
// próxima versão; aprovada segue para o Kickoff sem voltar à bancada.
const TRAVADO = {
  WAITING_APPROVAL: "Amostra com o cliente: o P&D só volta a mexer na manipulação e nas amostras depois do retorno (retrabalho).",
  APPROVED: "Amostra aprovada pelo cliente: a fórmula segue para o Kickoff. Mudança agora só por retrabalho pedido pelo Comercial.",
  COMPLETED: "Desenvolvimento concluído: a fórmula segue para o Kickoff. Mudança agora só por retrabalho pedido pelo Comercial.",
};

export function bloqueioPdComCliente(statusSolicitacao, { admin = false } = {}) {
  if (admin) return null;
  return TRAVADO[statusSolicitacao] || null;
}

// Rotas de bancada (manipulação, fases, versões, lotes e novas amostras) que a
// trava cobre, e de onde sai o registro para achar a solicitação. Registrar o
// retorno do cliente numa amostra (PUT /pd/samples/:id) não é bancada: fica livre.
const ROTAS_BANCADA = [
  ["POST", /^\/pd\/developments\/([^/]+)\/(formulas|sample-batches|samples)$/, "development"],
  [["PUT", "DELETE"], /^\/pd\/developments\/([^/]+)\/sample-batches\/[^/]+$/, "development"],
  ["POST", /^\/pd\/formulas\/[^/]+\/import-into\/([^/]+)$/, "development"],
  ["POST", /^\/pd\/formulas\/([^/]+)\/(items|phases|duplicate|new-version)$/, "formula"],
  ["PUT", /^\/pd\/formulas\/([^/]+)\/phases\/reorder$/, "formula"],
  ["PUT", /^\/pd\/formulas\/([^/]+)$/, "formula"],
  [["PUT", "DELETE"], /^\/pd\/formula-items\/([^/]+)$/, "item"],
  [["PUT", "DELETE"], /^\/pd\/formula-phases\/([^/]+)$/, "phase"],
];

export function rotaDeBancada(method, path) {
  for (const [metodos, padrao, tipo] of ROTAS_BANCADA) {
    if (!(Array.isArray(metodos) ? metodos : [metodos]).includes(method)) continue;
    const m = padrao.exec(path);
    if (m) return { tipo, id: m[1] };
  }
  return null;
}

// Card determinístico para solicitação que ficou sem card (id fixo: duas abas
// abertas ao mesmo tempo gravam o mesmo card, não dois). Se a solicitação ainda
// guarda o id do card que tinha (linked_pd_card_id, dados do Mongo), é ele que volta.
export function idCardDaSolicitacao(requestId, linkedCardId) {
  return linkedCardId || `card-${requestId}`;
}

export function cardParaSolicitacao(request, { amostra, projeto, cardStatus, agora }) {
  const variacao = amostra && Array.isArray(amostra.variacoes)
    ? amostra.variacoes.find((v) => v && v.id === (request.crm_variacao_id || request.linked_variacao_id)) : null;
  const produto = request.commercial_name || request.title || request.technical_name || request.project_name || amostra?.nome_produto || "";
  return {
    id: idCardDaSolicitacao(request.id, request.linked_pd_card_id),
    pd_request_id: request.id,
    titulo: produto,
    nome_produto: produto,
    cliente_nome: request.client_name || projeto?.cliente_nome || amostra?.cliente_nome || "",
    projeto_id: request.crm_project_id || request.linked_projeto_id || amostra?.projeto_id || null,
    projeto_nome: projeto?.nome_projeto || request.project_name || "",
    amostra_id: amostra ? amostra.id : null,
    amostra_variacao_id: variacao ? variacao.id : null,
    amostra_numero: variacao?.codigo || request.internal_code || amostra?.numero_amostra || "",
    status: request.status || "OPEN",
    status_pd: cardStatus,
    origem: "reconciliacao_sem_card",
    created_at: agora,
    updated_at: agora,
  };
}

// Card cuja solicitação não existe mais não aparece no quadro (o registro fica).
export function cardsVisiveis(cards, requestIds) {
  const ids = requestIds instanceof Set ? requestIds : new Set(requestIds || []);
  return (cards || []).filter((c) => c && ids.has(c.pd_request_id));
}
