/* Ordem de manipulação do lote para imprimir (LM-08, spec 2026-11-04 §10).
 * HTML puro, tudo escapado: nome de ingrediente, código, motivo e nome de quem pesou vêm do banco.
 * Mostra a ordem gerada pelo servidor (pré-mistura por fase + adições por amostra) com campos em
 * branco para a bancada (lote da MP, quem pesou, quem conferiu) — ou o que já foi registrado. */
import { ROTULO_STATUS_LOTE, fmtG } from "@/lib/manipulacaoLote";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (p) => Number(p || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const quando = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

function registroAtual(lote, linhaId) {
  const p = lote?.pesagens?.[linhaId];
  return p?.atual ? p.registros?.[p.atual] || null : null;
}

function linhaHtml(lote, linhaId, l, { comAmostra = false } = {}) {
  const r = registroAtual(lote, linhaId);
  const celula = (v) => `<td>${v ? esc(v) : "&nbsp;"}</td>`;
  return `<tr>${comAmostra ? `<td>${esc(l.codigo_amostra || l.request_id || "")}</td>` : ""}<td>${esc(l.fase || "—")}</td><td>${esc(l.nome)}</td>`
    + `<td class="n">${fmtG(l.teorico_g)}</td><td class="n">${r ? fmtG(r.real_g) : "&nbsp;"}</td>`
    + celula(r ? (r.lote_mp_informado ? r.lote_mp : "não informado") : "") + celula(r?.pesou_nome) + celula(r?.conferiu_nome) + "</tr>";
}

export function ordemLoteHtml(lote) {
  const o = lote?.ordem || {};
  const membros = lote?.membros || {};
  const cod = (r) => membros[r]?.codigo_amostra || r;
  const linhas = Object.entries(o.linhas_pesagem || {});
  const cab = "<tr><th>Fase</th><th>Ingrediente</th><th>Teórico (g)</th><th>Real (g)</th><th>Lote da MP</th><th>Pesou</th><th>Conferiu</th></tr>";
  const preMisturas = (o.pre_misturas || []).map((pm) => {
    const ids = linhas.filter(([, l]) => l.tipo === "pre_mistura" && l.fase === pm.fase);
    const porcoes = Object.entries(pm.porcoes || {}).map(([r, g]) => `<li>${esc(cod(r))}: <b>${fmtG(g)} g</b></li>`).join("");
    return `<h3>Pré-mistura · fase ${esc(pm.fase)} <small>(excesso ${pct(pm.excesso_pct)} %; base ${fmtG(pm.total_base_g)} g, pesar ${fmtG(pm.total_pesado_g)} g)</small></h3>`
      + `<table><thead>${cab}</thead><tbody>${ids.map(([id, l]) => linhaHtml(lote, id, l)).join("")}</tbody></table>`
      + `<p class="porcoes">Porção da pré-mistura para cada amostra:</p><ul class="porcoes">${porcoes}</ul>`;
  }).join("");
  const adicoes = Object.keys(o.adicoes || {}).map((r) => {
    const ids = linhas.filter(([, l]) => l.tipo === "adicao" && l.request_id === r);
    if (!ids.length) return "";
    const removido = membros[r]?.status_membro === "removido";
    return `<h3>${esc(cod(r))} · ${fmtG(membros[r]?.quantidade_g)} g${o.versoes?.[r] ? ` · versão v${esc(o.versoes[r].versao)}` : ""}${removido ? " · <span class=\"aviso\">retirada do lote</span>" : ""}</h3>`
      + `<table><thead>${cab}</thead><tbody>${ids.map(([id, l]) => linhaHtml(lote, id, l)).join("")}</tbody></table>`;
  }).join("");
  const avisos = (o.avisos || []).length ? `<div class="avisos"><b>Avisos</b><ul>${o.avisos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>` : "";
  const manip = lote?.manipulacao;
  const conciliacao = manip?.conciliacao
    ? `<p><b>Manipulação registrada</b> em ${esc(quando(manip.em))} por ${esc(manip.por_nome)} — pesado ${fmtG(manip.conciliacao.pesado_g)} g, destinos ${fmtG(manip.conciliacao.destinos_g)} g, diferença ${fmtG(manip.conciliacao.residuo_g)} g.</p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ordem ${esc(lote?.codigo)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;margin:18px}
  h1{font-size:16px;margin:0 0 4px} h2{font-size:13px;margin:16px 0 6px} h3{font-size:12px;margin:14px 0 4px}
  small{font-weight:normal;color:#444} table{border-collapse:collapse;width:100%;margin-bottom:6px}
  th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top} th{background:#eee}
  td.n{text-align:right;white-space:nowrap} .meta{color:#333;margin:2px 0} .avisos{border:1px solid #c80;background:#fff7e6;padding:6px 8px;margin:8px 0}
  .aviso{color:#a40} ul.porcoes{margin:2px 0 8px 16px;padding:0} p.porcoes{margin:4px 0 0}
  .assinaturas{display:flex;gap:24px;margin-top:28px} .assinaturas div{flex:1;border-top:1px solid #111;padding-top:4px;text-align:center}
  @media print{body{margin:8mm} h3{break-after:avoid} table{break-inside:auto} tr{break-inside:avoid}}
</style></head><body>
<h1>Ordem de manipulação em lote ${esc(lote?.codigo)}</h1>
<p class="meta">Projeto ${esc(lote?.projeto_numero || "")} ${esc(lote?.projeto_nome || "")} · ${esc(ROTULO_STATUS_LOTE[lote?.status] || lote?.status || "")}</p>
<p class="meta">Gerada em ${esc(quando(o.gerada_em))} por ${esc(o.gerada_por_nome || "")} · ${esc(o.n_amostras || 0)} amostra(s) · total ${fmtG(o.total_teorico_g || 0)} g
 · conferência por segundo usuário: ${o.conferencia_segundo_usuario === false ? "desligada" : "ligada"}</p>
${avisos}
${preMisturas ? `<h2>1. Pré-misturas</h2>${preMisturas}` : ""}
<h2>${preMisturas ? "2" : "1"}. Adições por amostra</h2>${adicoes || "<p>Sem adições.</p>"}
${conciliacao}
<div class="assinaturas"><div>Manipulado por</div><div>Conferido por</div><div>Data</div></div>
</body></html>`;
}
