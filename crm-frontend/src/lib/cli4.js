/* CLI4: as 4 letras do cliente no SKU (CAT3-CLI4-SEQ4). Puro, compartilhado entre o botão
 * "Sugerir" do CRM 1 e a criação do cliente no cadastro mestre (CRM-02, 29/10/2026). */
import { normalizeName } from "./crmRules.js";

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function letras(nome) {
  return normalizeName(nome).toUpperCase().replace(/[^A-Z0-9 ]/g, "");
}

export function cli4Valido(code) {
  return /^[A-Z]{4}$/.test(String(code || ""));
}

// Primeira opção livre a partir do nome (regra original do cadastro mestre, mantida).
export function cli4For(name, taken) {
  const flat = letras(name).replace(/ /g, "");
  const base = (flat.slice(0, 4) || "CLIX").padEnd(4, "X");
  if (!taken.has(base)) return base;
  for (const ch of "23456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const code = base.slice(0, 3) + ch;
    if (!taken.has(code)) return code;
  }
  return null;
}

// 3 a 5 sugestões livres, só letras, em ordem de preferência: 4 primeiras letras, 2+2 das duas
// primeiras palavras, iniciais completadas, consoantes, e por fim as 3 primeiras + uma letra.
// Código já usado nunca aparece.
export function sugestoesCli4(nome, taken, max = 5) {
  const palavras = letras(nome).replace(/[0-9]/g, "").split(/\s+/).filter(Boolean);
  const flat = palavras.join("");
  if (!flat) return [];
  const pad = (s) => s.slice(0, 4).padEnd(4, "X");
  const candidatos = [pad(flat)];
  if (palavras.length >= 2) {
    candidatos.push(pad(palavras[0].slice(0, 2) + palavras[1].slice(0, 2)));
    candidatos.push(pad(palavras.map((p) => p[0]).join("") + flat.slice(1)));
    candidatos.push(pad(palavras[0].slice(0, 3) + palavras[1][0]));
  }
  candidatos.push(pad(flat[0] + flat.slice(1).replace(/[AEIOU]/g, "")));
  for (const ch of LETRAS) candidatos.push(pad(flat).slice(0, 3) + ch);
  const livres = [];
  for (const c of candidatos) {
    if (cli4Valido(c) && !taken.has(c) && !livres.includes(c)) livres.push(c);
    if (livres.length >= max) break;
  }
  return livres;
}
