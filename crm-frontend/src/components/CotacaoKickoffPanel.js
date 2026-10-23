/* COM-03: a cotação do projeto em registro próprio (COT-2026-031-r1), montada do Kickoff.
 * Mostra itens, quantidades, quem fornece e item novo; o preço de cada linha é lançado aqui
 * (Comercial ou Compras) e volta para a composição do orçamento como COTADO. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { formatApiError } from "@/lib/formatError";
import { STATUS_COTACAO } from "@/lib/cotacaoKickoff";

const qtd = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 4 }));
const ACOES = {
  rascunho: [["em_cotacao_compras", "Enviar para Compras cotar"]],
  em_cotacao_compras: [["precificada", "Marcar precificada"], ["rascunho", "Voltar a rascunho"]],
  precificada: [["aprovada", "Aprovar cotação"], ["em_cotacao_compras", "Reabrir em Compras"]],
  aprovada: [],
};
const NIVEL = { manipulacao: "Manipulação", primaria: "Primária", secundaria: "Secundária", terciaria: "Terciária" };

export default function CotacaoKickoffPanel({ projetoId, onAlterada }) {
  const [dados, setDados] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const carregar = () => api.get(`/crm/projects/${projetoId}/cotacao`).then(({ data }) => setDados(data)).catch(() => setDados({ vigente: null, revisoes: [] }));
  useEffect(() => { if (projetoId) carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projetoId]);

  const agir = async (fn, ok) => {
    setOcupado(true);
    try { const { data } = await fn(); setDados(data); if (ok) toast.success(ok); onAlterada?.(); } catch (error) { toast.error(formatApiError(error)); } finally { setOcupado(false); }
  };
  const gerar = () => agir(() => api.post(`/crm/projects/${projetoId}/cotacao`, {}), "Cotação atualizada a partir do Kickoff.");
  const status = (s) => agir(() => api.post(`/crm/projects/${projetoId}/cotacao/status`, { status: s }), `Cotação: ${STATUS_COTACAO[s]}.`);
  const preco = (linha, valor, moeda) => agir(() => api.put(`/crm/projects/${projetoId}/cotacao/linhas/${encodeURIComponent(linha.linha_id)}`,
    { preco: valor === "" ? null : Number(String(valor).replace(",", ".")), moeda }));

  if (!dados) return <p className="text-sm text-muted-foreground">Carregando a cotação…</p>;
  const c = dados.vigente;
  const editavel = c && ["rascunho", "em_cotacao_compras"].includes(c.status);
  return (
    <div className="space-y-3" data-testid="cotacao-kickoff">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{c ? c.numero : "Cotação do Kickoff"}
            {c && <Badge variant="outline" className="ml-2 text-[10px]">{STATUS_COTACAO[c.status] || c.status}</Badge>}</p>
          {c ? (
            <p className="text-xs text-muted-foreground">
              {c.numero_kickoff} {c.kickoff_versao} · {c.resumo.itens} itens ({c.resumo.do_cliente} do cliente)
              {c.resumo.sem_preco ? <span className="text-red-600"> · {c.resumo.sem_preco} sem preço</span> : " · todos com preço"}
              {c.resumo.itens_novos ? ` · ${c.resumo.itens_novos} item(ns) novo(s)` : ""}{c.resumo.sem_cadastro ? ` · ${c.resumo.sem_cadastro} sem cadastro` : ""}
            </p>
          ) : <p className="text-xs text-muted-foreground">Ainda não gerada. Ela nasce do Kickoff: ficha de manipulação + BOM de embalagens.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={gerar}>{c ? "Atualizar do Kickoff" : "Gerar cotação"}</Button>
          {c && (ACOES[c.status] || []).map(([s, r]) => <Button key={s} type="button" size="sm" disabled={ocupado} onClick={() => status(s)}>{r}</Button>)}
        </div>
      </div>
      {c?.motivo_revisao && <p className="text-xs text-amber-700">Revisão {c.revisao}: {c.motivo_revisao}{c.diff?.length ? ` (${c.diff.length} mudança(s))` : ""}.</p>}
      {c && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-muted/60"><tr>
              {["Nível", "Item", "Especificação", "Fornece", "Qtd/un", "Qtd pedido", "Preço", ""].map((h) => <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y">
              {c.linhas.map((l) => (
                <tr key={l.linha_id} className={l.fornecido_por !== "cliente" && !(l.preco > 0) ? "bg-red-500/5" : ""}>
                  <td className="px-2 py-1.5">{NIVEL[l.nivel] || l.nivel || "—"}</td>
                  <td className="px-2 py-1.5"><span className="font-medium">{l.descricao}</span>
                    <span className="block text-[10px] text-muted-foreground">{l.material_codigo || l.codigo}{l.item_novo ? " · item novo" : ""}</span></td>
                  <td className="px-2 py-1.5 max-w-[260px]">{l.especificacao || "—"}</td>
                  <td className="px-2 py-1.5">{l.fornecido_por === "cliente" ? "Cliente" : l.fornecido_por === "kuryos" ? "Kuryos" : "a definir"}</td>
                  <td className="px-2 py-1.5 tabular-nums">{qtd(l.qtd_por_unidade)} {l.unidade}</td>
                  <td className="px-2 py-1.5 tabular-nums">{qtd(l.qtd_total)}</td>
                  <td className="px-2 py-1.5">
                    {l.fornecido_por === "cliente" ? <span className="text-muted-foreground">não cobra</span> : (
                      <span className="inline-flex items-center gap-1">
                        <Input className="h-7 w-24 text-xs tabular-nums" type="number" min="0" step="any" disabled={!editavel || ocupado}
                          defaultValue={l.preco ?? ""} onBlur={(ev) => { if (String(ev.target.value) !== String(l.preco ?? "")) preco(l, ev.target.value, l.moeda); }} />
                        <select className="h-7 rounded border bg-background px-1 text-[11px]" disabled={!editavel || ocupado} value={l.moeda || "BRL"}
                          onChange={(ev) => { if (l.preco > 0) preco(l, l.preco, ev.target.value); }}>
                          <option value="BRL">R$</option><option value="USD">US$</option>
                        </select>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-[10px] text-muted-foreground">{l.preco_atualizado_por ? `por ${l.preco_atualizado_por}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dados.revisoes.length > 1 && (
        <p className="text-[11px] text-muted-foreground">Revisões: {dados.revisoes.map((r) => `${r.numero} (${STATUS_COTACAO[r.status] || r.status})`).join(" · ")}</p>
      )}
    </div>
  );
}
