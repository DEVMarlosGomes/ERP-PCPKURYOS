// Etapa do projeto no CRM2 pareada com a amostra (pedido do usuário, 17/10/2026: "amostra foi
// aprovada e o CRM2 não estava pareado com o status da amostra").
//
// Só anda para a frente, dentro do trecho de amostra do funil:
//   P&D trabalhando (Em Desenvolvimento, Em Testes, Retrabalho) → Amostra em Desenvolvimento
//   amostra entregue ao cliente (Aguardando Aprovação) ou já aprovada no P&D → Amostra Enviada
//   cliente aprovou a variação → Kickoff (se a etapa aceitar; senão para em Amostra Enviada)
// Mover de volta continua sendo decisão do Comercial. Funções puras.

export const TRECHO_AMOSTRA = ["amostra_solicitada", "amostra_em_desenvolvimento", "amostra_enviada", "kickoff"];

const EM_DESENVOLVIMENTO = new Set(["IN_PROGRESS", "IN_TESTS", "REJECTED"]);
const ENTREGUE = new Set(["WAITING_APPROVAL", "APPROVED", "COMPLETED"]);

const aprovadaPeloCliente = (v) => v?.status === "aprovada" || v?.resultado_cliente === "aprovada" || v?.resultado === "aprovada";

// variacoes: [{ ...variação do CRM, status_pd: status da solicitação do P&D }]
export function etapaPelaAmostra(variacoes) {
  const lista = (variacoes || []).filter(Boolean);
  if (lista.some(aprovadaPeloCliente)) return "kickoff";
  if (lista.some((v) => ENTREGUE.has(v.status_pd))) return "amostra_enviada";
  if (lista.some((v) => EM_DESENVOLVIMENTO.has(v.status_pd))) return "amostra_em_desenvolvimento";
  return null;
}

// Etapas a percorrer, uma por vez (o funil não pula etapa), da atual até o alvo.
export function passosAte(atual, alvo) {
  const de = TRECHO_AMOSTRA.indexOf(atual);
  const ate = TRECHO_AMOSTRA.indexOf(alvo);
  if (de < 0 || ate <= de || de === TRECHO_AMOSTRA.length - 1) return [];
  return TRECHO_AMOSTRA.slice(de + 1, ate + 1);
}
