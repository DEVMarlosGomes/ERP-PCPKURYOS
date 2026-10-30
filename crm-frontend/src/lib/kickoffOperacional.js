/* KO-13 (reunião 28/10/2026): Bloco Operacional do Kickoff (bloco6), dono Engenharia de Produto
 * (D-1 do RFC-001). Pedido: "quais equipamentos, pessoas necessárias na linha de produção, funções,
 * produção por minuto, unidades por hora".
 *
 * - Equipamentos: lista de texto (com o módulo Ativos portado na Fase 8, a escolha vem do cadastro).
 * - Pessoas por função: função + quantidade (+ observação), com o total.
 * - Ritmo: produção por minuto e unidades por hora; uma calcula a outra (× 60).
 * - Capacidade conservadora (CLAUDE.md): ao aprovar o Kickoff, un/h vai para produtos/{sku}/prodHoraRef
 *   SÓ se ele estiver vazio — nunca sobrescreve a referência do PCP.
 * - Não entra no PDF do BOM (BOM-02). Funções puras, sem banco. */

export const blocoOperacionalVazio = () => ({ equipamentos: [], pessoas: [], producao_por_minuto: "", unidades_por_hora: "", ritmo_digitado: "" });

// "1.500" (milhar) = 1500; "0,5" = 0.5; "1.5" = 1.5.
const numero = (v) => {
  let s = String(v ?? "").trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return s && Number.isFinite(n) && n > 0 ? n : null;
};
const arred = (n, casas = 2) => Math.round(n * 10 ** casas) / 10 ** casas;
const texto = (n) => (n === null ? "" : String(arred(n)));

/* Digitou um dos dois: o outro é calculado. campo = "producao_por_minuto" | "unidades_por_hora". */
export function atualizarRitmo(bloco, campo, valor) {
  const b = { ...blocoOperacionalVazio(), ...(bloco || {}) };
  const n = numero(valor);
  if (campo === "producao_por_minuto") return { ...b, producao_por_minuto: valor, unidades_por_hora: texto(n === null ? null : n * 60), ritmo_digitado: "minuto" };
  return { ...b, unidades_por_hora: valor, producao_por_minuto: texto(n === null ? null : n / 60), ritmo_digitado: "hora" };
}

// Unidades por hora do bloco (a digitada, ou a calculada pela produção por minuto).
export function unidadesPorHora(bloco) {
  const b = bloco || {};
  const porHora = numero(b.unidades_por_hora);
  if (porHora) return porHora;
  const porMinuto = numero(b.producao_por_minuto);
  return porMinuto ? arred(porMinuto * 60) : null;
}

export const totalPessoas = (pessoas) => (pessoas || []).reduce((s, p) => s + (numero(p?.quantidade) || 0), 0);

const listaDeTexto = (v) => (Array.isArray(v) ? v : Object.values(v || {})).map((x) => String(x ?? "").trim()).filter(Boolean);

/* Pendências do bloco (formato de lib/kickoffPendencias): ao menos um equipamento, uma função com
 * quantidade, e o ritmo. */
export function pendenciasOperacional(bloco) {
  const b = bloco || {};
  const pend = [];
  if (!listaDeTexto(b.equipamentos).length) pend.push({ campo: "equipamentos", rotulo: "Equipamentos da linha" });
  const pessoas = Array.isArray(b.pessoas) ? b.pessoas : Object.values(b.pessoas || {});
  if (!pessoas.length) pend.push({ campo: "pessoas", rotulo: "Pessoas na linha (função e quantidade)" });
  pessoas.forEach((p, i) => {
    if (!String(p?.funcao || "").trim()) pend.push({ campo: `pessoas[${i}].funcao`, rotulo: `Pessoa ${i + 1}: função` });
    if (!numero(p?.quantidade)) pend.push({ campo: `pessoas[${i}].quantidade`, rotulo: `${String(p?.funcao || "").trim() || `Pessoa ${i + 1}`}: quantidade` });
  });
  if (!unidadesPorHora(b)) pend.push({ campo: "unidades_por_hora", rotulo: "Produção por minuto / unidades por hora" });
  return pend;
}

/* prodHoraRef do SKU: o Kickoff só preenche o vazio. Devolve o número a gravar ou null (não grava). */
export function prodHoraRefParaGravar(atual, bloco) {
  if (numero(atual)) return null;
  return unidadesPorHora(bloco);
}

export { listaDeTexto as equipamentosDaLista };
