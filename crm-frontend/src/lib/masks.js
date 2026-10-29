/**
 * Mascaras de digitacao pt-BR (moeda e milhar) extraidas do formulario de
 * criacao de projeto do CRM1Page para reutilizacao em qualquer formulario
 * que colete valores monetarios ou volumes inteiros.
 *
 * Padrao de uso: <Input type="text" inputMode="decimal|numeric"> com
 * onChange armazenando o texto cru e onBlur reformatando via fmt*Display.
 * O valor numerico real (para enviar a API) vem de parse*Input.
 */

export const DEFAULT_PRICE_DISPLAY = "0,00";
export const DEFAULT_VOLUME_DISPLAY = "0.000";

const BRL = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

/** CRM-03 (D-13): mascara de moeda que preenche da direita (padrao banco): digitar 1550 mostra
 *  "15,50"; colar "1.234,56" mostra "1.234,56"; apagar tudo deixa vazio (nunca "0,00"). */
export const mascaraMoeda = (texto) => {
  const digitos = String(texto ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digitos) return "";
  return (Number.parseInt(digitos, 10) / 100).toLocaleString("pt-BR", BRL);
};

/** Mascara de milhar ao digitar: 3000 mostra "3.000"; vazio fica vazio. */
export const mascaraMilhar = (texto) => {
  const digitos = String(texto ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digitos) return "";
  return Number.parseInt(digitos, 10).toLocaleString("pt-BR");
};

/** Formata um valor digitado livre para o padrao pt-BR de moeda. Numero (valor salvo) formata
 *  direto: antes, 15.5 virava "155,00" porque o ponto decimal era lido como milhar. */
export const fmtPriceDisplay = (value) => {
  if (value === "" || value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("pt-BR", BRL) : "";
  const parsed = parseFloat(String(value).replace(/\./g, "").replace(",", "."));
  if (isNaN(parsed)) return "";
  return parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Formata um valor digitado livre para o padrao pt-BR de milhar. */
export const fmtVolumeDisplay = (value) => {
  if (value === "" || value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value).toLocaleString("pt-BR") : "";
  const parsed = parseInt(String(value).replace(/\./g, "").replace(/,/g, ""), 10);
  if (isNaN(parsed)) return "";
  return parsed.toLocaleString("pt-BR");
};

/** Converte um texto no padrao pt-BR de moeda de volta para float ou null. */
export const parsePriceInput = (value) => {
  if (typeof value === "number") return Number.isFinite(value) && value !== 0 ? value : null;
  if (!value) return null;
  return parseFloat(String(value).replace(/\./g, "").replace(",", ".")) || null;
};

/** Converte um texto no padrao pt-BR de milhar de volta para inteiro ou null. */
export const parseVolumeInput = (value) => {
  if (typeof value === "number") return Number.isFinite(value) && value !== 0 ? Math.round(value) : null;
  if (!value) return null;
  return parseInt(String(value).replace(/\./g, "").replace(/,/g, ""), 10) || null;
};

/** CRM-03: semear "0,00"/"0.000" no foco punha o cursor depois do zero e o digitado entrava
 *  depois dele. O campo vazio fica vazio (o "0,00" e so placeholder). Mantido por compatibilidade. */
export const seedPriceDisplay = (value) => (value == null ? "" : String(value));

/** Ver seedPriceDisplay. */
export const seedVolumeDisplay = (value) => (value == null ? "" : String(value));
