/* Dólar ao vivo + spread no CRM/P&D (PLANO_PD_CRM_AJUSTES.md, Fase 5).
 *
 * Mesmas regras de public/shared/cambio.js do PCP (lá também roda no servidor,
 * que grava config/cambio a cada 15 min). Taxa efetiva = venda × (1 + spread%).
 * Fórmula acompanha o dólar salvo se a cotação for fixada nela; cotação enviada
 * ao cliente congela o câmbio. Funções puras: nada aqui lê ou grava no banco. */

export const PADRAO_SEM_CAMBIO = 6;
export const MAX_IDADE_MIN = 60;
export const SPREAD_MAX = 20;

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const r4 = (n) => Math.round(n * 10000) / 10000;

export function validarSpread(valor) {
  const n = Number(String(valor).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > SPREAD_MAX) return { erro: `Spread entre 0 e ${SPREAD_MAX}%.` };
  return { spread: Math.round(n * 100) / 100 };
}

export function taxaEfetiva(cambio) {
  const venda = num(cambio?.usd_brl?.venda);
  if (!venda) return null;
  return r4(venda * (1 + (Number(cambio.spread_pct) || 0) / 100));
}

export function idadeMinutos(cambio, agora) {
  const t = Date.parse(cambio?.usd_brl?.atualizadoEm);
  const a = Date.parse(agora);
  return Number.isFinite(t) && Number.isFinite(a) ? Math.max(0, Math.round((a - t) / 60000)) : null;
}

export function situacao(cambio, agora) {
  const taxa = taxaEfetiva(cambio);
  const idade = idadeMinutos(cambio, agora);
  return {
    disponivel: taxa !== null, taxa, venda: num(cambio?.usd_brl?.venda), spread: Number(cambio?.spread_pct) || 0,
    fonte: cambio?.usd_brl?.fonte || "", atualizadoEm: cambio?.usd_brl?.atualizadoEm || "", idadeMin: idade,
    velho: taxa !== null && (idade === null || idade > MAX_IDADE_MIN), erro: cambio?.erro || "",
  };
}

export function cotacaoDaFormula(formula, cambio) {
  const f = formula || {};
  if (f.cotacao_usd_fixa && num(f.cotacao_usd)) return { taxa: num(f.cotacao_usd), origem: "fixa" };
  const viva = taxaEfetiva(cambio);
  if (viva) return { taxa: viva, origem: "ao_vivo" };
  if (num(f.cotacao_usd)) return { taxa: num(f.cotacao_usd), origem: "gravada" };
  return { taxa: PADRAO_SEM_CAMBIO, origem: "padrao" };
}

/* COM-01 (22/10/2026, decisão do usuário): não existe mais congelamento. Documento em
 * aberto acompanha o dólar do dia; o orçamento aprovado usa a taxa registrada na aprovação
 * (cambio_da_etapa). Proposta antiga já aprovada com cambio_congelado continua com aquela taxa. */
export function taxaDaCotacao(proposta, cambio) {
  const aprovada = proposta?.negociacao_status === "aprovado";
  const registrada = proposta?.cambio_da_etapa || (aprovada ? proposta?.cambio_congelado : null);
  if (aprovada && registrada && num(registrada.taxa)) {
    return { taxa: num(registrada.taxa), origem: "aprovacao", em: registrada.registrado_em || registrada.congeladoEm || "" };
  }
  const viva = taxaEfetiva(cambio);
  return viva ? { taxa: viva, origem: "ao_vivo" } : { taxa: PADRAO_SEM_CAMBIO, origem: "padrao" };
}

// Registro da taxa numa etapa (envio ao cliente, aprovação da cotação, aprovação do orçamento).
export const ETAPAS_CAMBIO = {
  envio: "Enviado ao cliente",
  cotacao_aprovada: "Cotação aprovada",
  orcamento_aprovado: "Orçamento aprovado",
  envio_legado: "Câmbio congelado no envio (antes de 22/10/2026)",
};

export function registroDeCambio(cambio, { etapa, documento = "", projetoId = "", agora, por = "", porNome = "" }) {
  const taxa = taxaEfetiva(cambio);
  if (!taxa) return null;
  return {
    tipo: "cambio", etapa, documento, projeto_id: projetoId, moeda: "USD",
    taxa, venda: num(cambio.usd_brl.venda), spread_pct: Number(cambio.spread_pct) || 0,
    fonte: cambio.usd_brl.fonte || "", cotado_em: cambio.usd_brl.cotadoEm || cambio.usd_brl.atualizadoEm || "",
    registrado_em: agora, registrado_por: por, registrado_por_nome: porNome,
  };
}

const fmtTaxa = (n) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const dataHoraSp = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

// Linha legível do histórico do cliente (o número fica nos campos ao lado, para conta e auditoria).
export function textoCambio(r) {
  const fonte = [r.fonte, r.cotado_em ? `cotação de ${dataHoraSp(r.cotado_em)}` : ""].filter(Boolean).join(", ");
  const spread = r.spread_pct ? ` (comercial ${fmtTaxa(r.venda)} + spread ${r.spread_pct}%)` : "";
  return `${dataHoraSp(r.registrado_em)} — ${ETAPAS_CAMBIO[r.etapa] || r.etapa}${r.documento ? ` ${r.documento}` : ""} — US$ 1,00 = R$ ${fmtTaxa(r.taxa)}${spread}${fonte ? ` (${fonte})` : ""}${r.registrado_por_nome ? ` — registrado por ${r.registrado_por_nome}` : ""}`;
}

export const ROTULO_ORIGEM = { fixa: "fixada na fórmula", ao_vivo: "ao vivo", gravada: "última gravada", padrao: "padrão (sem cotação)", congelada: "congelada no envio", aprovacao: "registrada na aprovação" };
