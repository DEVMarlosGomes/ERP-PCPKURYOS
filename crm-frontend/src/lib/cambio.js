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

export function congelar(cambio, agora) {
  const taxa = taxaEfetiva(cambio);
  if (!taxa) return null;
  return {
    taxa, venda: num(cambio.usd_brl.venda), spread_pct: Number(cambio.spread_pct) || 0,
    fonte: cambio.usd_brl.fonte || "", cotadoEm: cambio.usd_brl.cotadoEm || "", congeladoEm: agora,
  };
}

export function taxaDaCotacao(proposta, cambio) {
  const c = proposta?.cambio_congelado;
  if (c && num(c.taxa)) return { taxa: num(c.taxa), origem: "congelada", em: c.congeladoEm || "" };
  const viva = taxaEfetiva(cambio);
  return viva ? { taxa: viva, origem: "ao_vivo" } : { taxa: PADRAO_SEM_CAMBIO, origem: "padrao" };
}

export const ROTULO_ORIGEM = { fixa: "fixada na fórmula", ao_vivo: "ao vivo", gravada: "última gravada", padrao: "padrão (sem cotação)", congelada: "congelada no envio" };
