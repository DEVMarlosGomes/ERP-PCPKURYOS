/* Liberação antecipada da amostra ao Comercial (pedido do usuário em 24/10/2026).
 *
 * Regra até aqui: "Em Testes → Entregar ao Comercial" só depois da leitura de estabilidade D48h.
 * Agora o P&D pode pedir para entregar já com os primeiros testes (D24h completo, D48h ainda não
 * feito). O pedido fica "aguardando a diretoria"; um ADM aprova ou recusa no CRM (Projetos) com
 * quem, data/hora e justificativa. Aprovada, a solicitação segue o caminho normal (Aguardando
 * Aprovação, amostra com o Comercial) e a estabilidade continua correndo.
 * Grava em pd_requests/{id}/liberacao_antecipada. Funções puras: nada aqui lê ou grava no banco. */

export const MIN_TEXTO = 10;
export const STATUS_LIBERACAO = {
  aguardando_diretoria: "Aguardando aprovação da diretoria",
  aprovada: "Liberação antecipada aprovada",
  recusada: "Liberação antecipada recusada",
};
const D48H = 2;
const FOLGA_MS = 2 * 60 * 1000; // relógio adiantado
export const SEM_LEITURA = "sem leitura de estabilidade";

const temLeitura = (leituras, dia) => (leituras || []).some((l) => Number(l.day_offset) === dia);

/* Pode pedir? { ok, motivo }.
 * PD-05 (reunião 28/10/2026, D-09): basta a manipulação registrada — finalizar a manipulação
 * (Em Desenvolvimento → Em Testes) registra a fórmula vigente (locked) e cria a amostra V1; o
 * status Em Testes é essa marca. Nenhuma leitura é exigida: a diretoria decide vendo
 * "sem leitura de estabilidade", e o estudo continua correndo. Com o D48h é a entrega normal.
 * A trava dos 100% segue no servidor (liberarEtapaPd) quando a decisão leva a Aguardando Aprovação. */
export function podeSolicitar({ status, leituras, liberacao }) {
  if (status !== "IN_TESTS") return { ok: false, motivo: "Finalize a manipulação (a solicitação vai para Em Testes) antes de pedir a liberação antecipada." };
  if (liberacao?.status === "aguardando_diretoria") return { ok: false, motivo: "Já existe um pedido aguardando a diretoria." };
  if (temLeitura(leituras, D48H)) return { ok: false, motivo: "O D48h já foi registrado: use \"Entregar ao Comercial\"." };
  return { ok: true, motivo: "" };
}

export function novaSolicitacao({ motivo, por, porNome, em, leituras }) {
  const m = String(motivo || "").trim();
  if (m.length < MIN_TEXTO) return { ok: false, erro: `Explique por que enviar antes do fim da estabilidade (mínimo ${MIN_TEXTO} caracteres).` };
  const feitas = [...new Set((leituras || []).map((l) => Number(l.day_offset)))].sort((a, b) => a - b)
    .map((d) => (d === 1 ? "D24h" : d === 2 ? "D48h" : `D${d}`));
  return { ok: true, registro: { status: "aguardando_diretoria", motivo: m, solicitada_por: por, solicitada_por_nome: porNome, solicitada_em: em,
    leituras_no_pedido: feitas, sem_leitura: feitas.length === 0, decisao: null } };
}

// "D24h" ou o selo "sem leitura de estabilidade" (pedido sem nenhuma leitura feita).
export function textoEstabilidade(liberacao) {
  const feitas = liberacao?.leituras_no_pedido || [];
  return feitas.length ? feitas.join(", ") : SEM_LEITURA;
}

/* Decisão da diretoria (ADM). dataHora = ISO escolhida no modal (padrão: agora); nunca no futuro. */
export function validarDecisao({ decisao, justificativa, dataHora, agoraMs, por, porNome }) {
  const erros = [];
  if (!["aprovada", "recusada"].includes(decisao)) erros.push("Escolha aprovar ou recusar.");
  const j = String(justificativa || "").trim();
  if (j.length < MIN_TEXTO) erros.push(`Informe a justificativa (mínimo ${MIN_TEXTO} caracteres).`);
  const ms = Date.parse(dataHora || "");
  if (!Number.isFinite(ms)) erros.push("Informe a data e o horário da decisão.");
  else if (ms > agoraMs + FOLGA_MS) erros.push("A data e o horário da decisão não podem estar no futuro.");
  if (!por || !porNome) erros.push("Quem decide precisa estar identificado.");
  return {
    ok: !erros.length, erros,
    registro: { decisao, justificativa: j, decidida_por: por, decidida_por_nome: porNome,
      decidida_em: Number.isFinite(ms) ? new Date(ms).toISOString() : null, decidida_em_ms: Number.isFinite(ms) ? ms : null,
      registrada_em: new Date(agoraMs).toISOString() },
  };
}

export function aplicarDecisao(liberacao, registro) {
  return { ...liberacao, status: registro.decisao, decisao: registro,
    historico: [...(liberacao?.historico || []), { solicitada_em: liberacao?.solicitada_em, motivo: liberacao?.motivo, ...registro }] };
}

// Texto curto para o P&D e o CRM3: "Aprovada por Ana ADM em 24/10/2026 14:30 — justificativa".
export function textoDecisao(liberacao) {
  const d = liberacao?.decisao;
  if (!d) return liberacao?.status === "aguardando_diretoria" ? STATUS_LIBERACAO.aguardando_diretoria : "";
  const quando = d.decidida_em ? new Date(d.decidida_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
  return `${d.decisao === "aprovada" ? "Aprovada" : "Recusada"} por ${d.decidida_por_nome}${quando ? ` em ${quando}` : ""} — ${d.justificativa}`;
}
