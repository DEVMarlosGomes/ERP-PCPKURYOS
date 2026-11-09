/* Vínculo variação do CRM3 <-> solicitação/card do P&D (09/11/2026).
 *
 * Em 08/11 o botão "Sincronizar amostras com o P&D" olhava só pd_request_id/pd_card_id da
 * variação. As variações migradas do Mongo têm o vínculo do outro lado (crm_variacao_id na
 * solicitação, amostra_variacao_id no card): o botão achou que faltava e criou 96 solicitações
 * OPEN vazias, que passaram a disputar o espelho de status com as verdadeiras (já produzidas,
 * aprovadas...). Regra agora: antes de criar, procura o que já existe e só liga.
 * Funções puras: nada aqui lê ou grava no banco. */

const CARD_PARA_STATUS = {
  solicitado: "OPEN",
  em_desenvolvimento: "IN_PROGRESS",
  em_testes: "IN_TESTS",
  aguardando_aprovacao: "WAITING_APPROVAL",
  aprovado: "APPROVED",
  retrabalho_interno: "REJECTED",
  concluido: "COMPLETED",
};

// Quanto mais adiante no fluxo, mais trabalho real a solicitação carrega.
const AVANCO = { OPEN: 0, IN_PROGRESS: 1, IN_TESTS: 2, REJECTED: 2, WAITING_APPROVAL: 3, APPROVED: 4, COMPLETED: 5 };
const DESCARTADO = new Set(["CANCELLED"]);

export function statusPdDoCardLegado(card) {
  return CARD_PARA_STATUS[card?.status_pd] || "OPEN";
}

const variacaoDa = (r) => r.crm_variacao_id || r.linked_variacao_id;
const variacaoDoCard = (c) => c.amostra_variacao_id || c.crm_variacao_id;

export function melhorSolicitacao(lista) {
  return lista
    .filter((r) => !DESCARTADO.has(r.status))
    .sort((a, b) => (AVANCO[b.status || "OPEN"] ?? 0) - (AVANCO[a.status || "OPEN"] ?? 0)
      || String(a.created_at || "").localeCompare(String(b.created_at || "")))[0] || null;
}

export function planoVinculoAmostrasPd({ samples = [], requests = [], cards = [] }) {
  const requestById = new Map(requests.map((r) => [r.id, r]));
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const plano = [];
  for (const sample of samples) {
    for (const v of sample.variacoes || []) {
      if (!v || !v.id) continue;
      if (v.pd_request_id && requestById.has(v.pd_request_id) && v.pd_card_id && cardById.has(v.pd_card_id)) continue;
      const req = melhorSolicitacao(requests.filter((r) => variacaoDa(r) === v.id));
      if (req) {
        const card = cards.find((c) => c.pd_request_id === req.id) || null;
        plano.push({ acao: "ligar", sampleId: sample.id, variacaoId: v.id, requestId: req.id, cardId: card ? card.id : null, status: req.status || "OPEN" });
        continue;
      }
      const legado = cards.find((c) => variacaoDoCard(c) === v.id && (!c.pd_request_id || !requestById.has(c.pd_request_id)));
      if (legado) {
        plano.push({ acao: "criar_para_card", sampleId: sample.id, variacaoId: v.id, cardId: legado.id, status: statusPdDoCardLegado(legado) });
        continue;
      }
      plano.push({ acao: "criar", sampleId: sample.id, variacaoId: v.id });
    }
  }
  return plano;
}
