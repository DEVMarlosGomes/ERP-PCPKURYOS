/* BOM-02 (reunião 28/10/2026): PDF do BOM (documento HTML para imprimir / salvar em PDF, como a
 * Ficha Técnica). Leva só o BOM de embalagens por nível. NÃO leva a ficha de manipulação (fórmula:
 * fica na aba BOM, só leitura) nem o Bloco Operacional (equipamentos, pessoas, ritmo). O CSV continua.
 * Funções puras, sem banco. */

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NIVEIS = [["primaria", "Embalagem primária"], ["secundaria", "Embalagem secundária"], ["terciaria", "Embalagem terciária"], ["", "Outros"]];
const num = (v) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 }));
const fornecido = (l) => (l.fornecido_por === "cliente" ? "Cliente" : l.fornecido_por === "kuryos" ? "Kuryos" : "—");

/* Só as linhas de embalagem: MP da fórmula (tipo mp_formula) nunca entra no PDF. */
export const linhasDoPdf = (bom) => (bom || []).filter((l) => l && l.tipo !== "mp_formula");

export function htmlDoBom(kickoff, { geradoEm = "" } = {}) {
  const k = kickoff || {};
  const b0 = k.questionario_composicao?.bloco0 || {};
  const lote = k.questionario_composicao?.fechamento?.volume_primeiro_lote || k.bloco2?.volume_primeiro_pedido || "";
  const linhas = linhasDoPdf(k.bom);
  const secoes = NIVEIS.map(([nivel, titulo]) => {
    const doNivel = linhas.filter((l) => (l.nivel || "") === nivel);
    if (!doNivel.length) return "";
    const terc = nivel === "terciaria";
    return `<h2>${esc(titulo)}</h2><table><thead><tr><th>Código</th><th>Item</th><th>Especificação</th><th>Fornecido por</th><th>Fornecedor</th>
<th class="n">${terc ? "Unid./emb." : "Qtd/un"}</th><th class="n">Qtd do lote</th></tr></thead><tbody>${doNivel.map((l) => `<tr>
<td class="cod">${esc(l.codigo_interno)}</td><td>${esc(l.descricao)}${l.definido === false ? " <em>(a definir)</em>" : ""}</td><td>${esc(l.especificacao || "—")}</td>
<td>${fornecido(l)}</td><td>${esc(l.fornecedor_principal?.nome || "a definir")}</td>
<td class="n">${num(terc ? l.unidades_por_embalagem : l.quantidade_por_unidade)}</td><td class="n">${num(l.quantidade_total_pedido)}</td></tr>`).join("")}</tbody></table>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>BOM ${esc(k.numero_kickoff)}</title>
<style>body{font:12px/1.4 Arial,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:18px 0 6px;text-transform:uppercase}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top;word-break:break-word}th{background:#eee}
.n{text-align:right;white-space:nowrap}.cod{font-family:monospace;font-size:11px}.meta{color:#555;margin:0 0 12px}@media print{body{margin:10mm}}</style></head><body>
<h1>BOM de embalagens — ${esc(k.numero_kickoff)} ${esc(k.versao || "")}</h1>
<p class="meta">${esc(b0.cliente || k.bloco1?.cliente || "")} · ${esc(b0.nome_produto || "")}${b0.volume_gramatura ? ` · ${esc(b0.volume_gramatura)}` : ""}${lote ? ` · lote de ${esc(lote)} un` : ""}${geradoEm ? ` · gerado em ${esc(geradoEm)}` : ""}</p>
${secoes || "<p>Nenhum componente aplicável no questionário.</p>"}
<p class="meta">Documento sem a ficha de manipulação e sem o Bloco Operacional (equipamentos e equipe), que ficam no Kickoff.</p>
</body></html>`;
}
