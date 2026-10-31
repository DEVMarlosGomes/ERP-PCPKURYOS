/* Composição do preço da cotação (PLANO_PD_CRM_AJUSTES.md, Fase 7): insumos do BOM do
 * Kickoff + serviços da tabela do Cadastros, com desconto por etapa. Regras em lib/cotacao.js;
 * o servidor recalcula ao salvar e recusa enviar com item SEM PREÇO. */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { MIN_MOTIVO_DESCONTO, UNIDADES_SERVICO, calcularCotacao, linhaDeServico, mesclarComposicao } from "@/lib/cotacao";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/crmRules";

const rs = (n, casas = 2) => (n === null || n === undefined ? "—"
  : `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: Math.max(casas, 4) })}`);
const qtd = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const TIPO_INSUMO = { mp_formula: "MP", embalagem_primaria: "Emb. primária", tampa: "Tampa", emb_secundaria: "Emb. secundária", emb_terciaria: "Caixa master", rotulo: "Rótulo" };
const ORIGEM_PRECO = { cotacao: "Compras", formula: "Fórmula P&D", manual: "Manual", cadastro_servicos: "Cadastros" };
const SemPreco = () => <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300 text-[10px]">SEM PREÇO</Badge>;

const acimaDoMaximo = (l) => l?.desconto_maximo_pct !== undefined && l?.desconto_maximo_pct !== null && Number(l.desconto_pct || 0) > Number(l.desconto_maximo_pct) + 1e-9;

export default function CotacaoComposicao({ projetoId, salva, congelada, taxa, onChange, onAplicarPreco }) {
  const { user } = useAuth() || {};
  const adm = isAdmin(user);
  const [base, setBase] = useState(null);
  const [erro, setErro] = useState("");
  const [composicao, setComposicao] = useState(null);
  const [novoServico, setNovoServico] = useState("");

  useEffect(() => {
    if (!projetoId) return;
    let vivo = true;
    api.get(`/crm/projects/${projetoId}/cotacao-base`)
      .then(({ data }) => { if (vivo) setBase(data); })
      .catch(() => { if (vivo) setErro("Não foi possível ler o Kickoff e a tabela de serviços."); });
    return () => { vivo = false; };
  }, [projetoId]);

  // Junta o que estava salvo com o Kickoff e a tabela atuais (uma vez, quando a base chega).
  useEffect(() => {
    if (!base) return;
    setComposicao(mesclarComposicao(salva, base, { congelada }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);
  useEffect(() => { if (composicao) onChange?.(composicao); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [composicao]);

  const calc = useMemo(() => (composicao ? calcularCotacao(composicao, taxa) : null), [composicao, taxa]);
  const atualizar = (fn) => setComposicao(fn);
  const setCampo = (campo, valor) => atualizar((c) => ({ ...c, [campo]: valor }));
  const setInsumo = (i, campos) => atualizar((c) => ({ ...c, insumos: c.insumos.map((l, idx) => (idx === i ? { ...l, ...campos } : l)) }));
  const setServico = (i, campos) => atualizar((c) => ({ ...c, servicos: c.servicos.map((l, idx) => (idx === i ? { ...l, ...campos } : l)) }));
  const removerServico = (i) => atualizar((c) => ({ ...c, servicos: c.servicos.filter((_, idx) => idx !== i) }));
  const adicionarServico = () => {
    const sv = (base?.servicos || []).find((s) => s.id === novoServico);
    if (!sv) return;
    atualizar((c) => ({ ...c, servicos: [...c.servicos, linhaDeServico(sv)] }));
    setNovoServico("");
  };

  if (erro) return <p className="text-sm text-red-600">{erro}</p>;
  if (!composicao || !calc) return <p className="text-sm text-muted-foreground">Carregando o Kickoff e a tabela de serviços…</p>;

  const bloqueado = Boolean(congelada);
  const usados = new Set(composicao.servicos.map((l) => l.servico_id));
  // KO-08: com serviços escolhidos no Kickoff, só eles podem entrar; mudar a lista é no Kickoff.
  const doKickoff = new Set(base?.servicos_selecionados || []);
  const disponiveis = (base?.servicos || []).filter((s) => !usados.has(s.id) && (!doKickoff.size || doKickoff.has(s.id)));

  return (
    <div className="space-y-4" data-testid="cotacao-composicao">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-sm font-semibold">Composição do preço</p>
          <p className="text-xs text-muted-foreground">
            {base?.numero_kickoff ? `Insumos do BOM do Kickoff ${base.numero_kickoff}` : "Projeto sem Kickoff: só os serviços entram na composição"}
            {base?.kickoff_status && base.kickoff_status !== "aprovado" && <span className="text-amber-700" data-testid="kickoff-em-revisao"> (Kickoff ainda não aprovado — o BOM pode mudar)</span>}
            {taxa ? ` · dólar R$ ${Number(taxa).toFixed(4).replace(".", ",")}${congelada ? " (da aprovação)" : ""}` : ""}
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Qtd do pedido (un)</Label>
          <Input className="h-8 w-28 text-xs tabular-nums" type="number" min="0" disabled={bloqueado} value={composicao.qtd_pedido || ""}
            onChange={(e) => setCampo("qtd_pedido", Number(e.target.value) || 0)} data-testid="cotacao-qtd" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Lotes</Label>
          <Input className="h-8 w-20 text-xs tabular-nums" type="number" min="1" disabled={bloqueado} value={composicao.lotes || 1}
            onChange={(e) => setCampo("lotes", Math.max(1, Number(e.target.value) || 1))} />
        </div>
        {composicao.kg_por_unidade > 0 && <p className="text-xs text-muted-foreground pb-2">{qtd(composicao.kg_por_unidade)} kg de granel por unidade</p>}
      </div>

      {composicao.insumos.length > 0 && (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="bg-muted/60">
              <tr>{["Insumo", "Qtd/un", "Preço", "Fornecido por", "Custo/un"].map((h) => <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {calc.insumos.map((l, i) => (
                <tr key={l.bom_id || i} className={l.pendente ? "bg-red-500/5" : ""}>
                  <td className="px-2 py-1.5 min-w-[180px]">
                    <span className="font-medium">{l.descricao}</span>
                    <span className="block text-[10px] text-muted-foreground">{[TIPO_INSUMO[l.tipo] || l.tipo, l.codigo].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{qtd(l.qtd_por_unidade)} {l.unidade}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {l.fornecido_por === "cliente" ? <span className="text-muted-foreground">—</span> : l.origem_preco === "formula" ? (
                      <span title="Preço da MP na fórmula do P&D">{l.moeda === "USD" ? "US$" : "R$"} {Number(l.preco).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}/{l.unidade === "un" ? "un" : "kg"} <Badge variant="secondary" className="text-[9px] ml-1">fórmula</Badge></span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <select className="h-7 rounded border bg-background px-1 text-xs" disabled={bloqueado} value={l.moeda || "BRL"} onChange={(e) => setInsumo(i, { moeda: e.target.value })}>
                          <option value="BRL">R$</option><option value="USD">US$</option>
                        </select>
                        <Input className="h-7 w-24 text-xs tabular-nums" type="number" min="0" step="0.0001" disabled={bloqueado} value={l.preco ?? ""} placeholder="preço"
                          onChange={(e) => setInsumo(i, { preco: e.target.value === "" ? null : Number(e.target.value) })} data-testid={`insumo-preco-${i}`} />
                        {l.origem_preco && <Badge variant="secondary" className="text-[9px] whitespace-nowrap" title={l.fonte_preco || l.cotacao_numero || ""}>
                          {ORIGEM_PRECO[l.origem_preco] || l.origem_preco}
                        </Badge>}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <select className="h-7 rounded border bg-background px-1 text-xs" disabled={bloqueado} value={l.fornecido_por || "kuryos"} onChange={(e) => setInsumo(i, { fornecido_por: e.target.value })}>
                      <option value="kuryos">Kuryos</option><option value="cliente">Cliente</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{l.pendente ? <SemPreco /> : rs(l.custo_un, 4)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/40 border-t">
              <tr><td colSpan={4} className="px-2 py-2 text-right font-semibold">Insumos por unidade</td><td className="px-2 py-2 text-right font-bold tabular-nums">{rs(calc.insumos_por_un, 4)}</td></tr>
              {calc.insumos.some((l) => l.tipo === "mp_formula" && l.unidade === "L") && (
                <tr><td colSpan={5} className="px-2 pb-2 text-[10px] text-muted-foreground">MP em L com preço por kg: o BOM do Kickoff conta 1 L = 1 kg (densidade ainda não entra no cálculo).</td></tr>
              )}
            </tfoot>
          </table>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold mr-auto">Serviços (cobrança por etapa)</p>
          {!bloqueado && (
            <>
              <select className="h-8 rounded border bg-background px-2 text-xs max-w-[240px]" value={novoServico} onChange={(e) => setNovoServico(e.target.value)} data-testid="servico-select">
                <option value="">{disponiveis.length ? "Escolha um serviço…" : "Todos os serviços já estão na cotação"}</option>
                {disponiveis.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.preco ? "" : " (sem preço)"}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" disabled={!novoServico} onClick={adicionarServico}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar</Button>
            </>
          )}
        </div>
        {base?.servicos_erro ? <p className="text-xs text-red-700" data-testid="servicos-erro">Não foi possível ler a tabela de serviços ({base.servicos_erro}). Avise o ADM: falta publicar a regra do banco para servicos/.</p>
          : (base?.servicos || []).length === 0 && <p className="text-xs text-amber-700">A tabela de serviços está vazia. Cadastre em PCP › Cadastros › Serviços.</p>}
        {composicao.servicos.length > 0 && (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="bg-muted/60">
                <tr>{["Serviço", "Qtd cobrada", "Preço cheio", "Desconto", "Preço final", "Setup/lote", "Total", "R$/un", ""].map((h) => <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {calc.servicos.map((l, i) => (
                  <tr key={`${l.servico_id}-${i}`} className={l.pendente ? "bg-red-500/5" : ""}>
                    <td className="px-2 py-1.5 min-w-[150px]">
                      <span className="font-medium">{l.nome}</span>
                      <span className="block text-[10px] text-muted-foreground">{UNIDADES_SERVICO[l.unidade]?.rotulo || l.unidade}{l.fora_da_tabela ? " · fora da tabela atual" : ""}{doKickoff.has(l.servico_id) ? " · do Kickoff" : ""}{l.origem_preco ? ` · ${ORIGEM_PRECO[l.origem_preco] || l.origem_preco}` : ""}</span>
                      {l.fora_do_kickoff && <span className="block text-[10px] font-medium text-red-700" data-testid="servico-fora-kickoff">não escolhido no Kickoff — remova ou marque no Kickoff</span>}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">
                      {qtd(l.quantidade)} {UNIDADES_SERVICO[l.unidade]?.curto || ""}
                      {["un", "milheiro"].includes(l.unidade) && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-muted-foreground" title="Vezes por unidade do produto (ex.: 2 rótulos, frente e verso)">
                          ×<Input className="h-6 w-12 text-[11px] tabular-nums px-1" type="number" min="1" step="1" disabled={bloqueado} value={l.fator || 1}
                            onChange={(e) => setServico(i, { fator: Math.max(1, Number(e.target.value) || 1) })} />
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{l.pendente ? <span title="Preencha o preço em PCP › Cadastros › Serviços"><SemPreco /></span> : rs(l.preco_cheio, 4)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Input className={`h-7 w-16 text-xs tabular-nums ${acimaDoMaximo(l) ? "border-red-500" : ""}`} type="number" min="0" max="100" step="0.5" disabled={bloqueado} value={l.desconto_pct ?? 0}
                          onChange={(e) => setServico(i, { desconto_pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} data-testid={`servico-desconto-${i}`} />%
                      </span>
                      {/* COT-01 (D-10): o Cadastros define o máximo; a linha nasce com 0 %. */}
                      {l.desconto_maximo_pct !== undefined && l.desconto_maximo_pct !== null && (
                        <span className={`block text-[10px] ${acimaDoMaximo(l) ? "font-medium text-red-700" : "text-muted-foreground"}`} data-testid={`servico-desconto-max-${i}`}>
                          máx. {l.desconto_maximo_pct}%{acimaDoMaximo(l) ? (adm ? " — acima: informe o motivo" : " — acima do máximo: só o ADM libera") : ""}
                        </span>
                      )}
                      {acimaDoMaximo(l) && adm && (
                        <Input className="mt-1 h-7 w-48 text-[11px]" placeholder={`Motivo (mín. ${MIN_MOTIVO_DESCONTO} caracteres) *`} disabled={bloqueado} value={l.desconto_motivo || ""}
                          onChange={(e) => setServico(i, { desconto_motivo: e.target.value })} data-testid={`servico-desconto-motivo-${i}`} />
                      )}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{l.pendente ? "—" : rs(l.preco_final, 4)}</td>
                    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{l.setup_lote ? rs(l.setup_lote) : "—"}</td>
                    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">
                      {l.pendente ? "—" : rs(l.total)}
                      {l.minimo_aplicado && <span className="block text-[10px] text-amber-700">mínimo do pedido</span>}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{l.pendente ? "—" : rs(l.por_unidade, 4)}</td>
                    <td className="px-1 py-1.5">{!bloqueado && !doKickoff.has(l.servico_id) && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removerServico(i)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4" data-testid="cotacao-resumo">
        <div><p className="text-[11px] text-muted-foreground">Insumos / un</p><p className="font-semibold tabular-nums">{rs(calc.insumos_por_un, 4)}</p></div>
        <div><p className="text-[11px] text-muted-foreground">Serviços / un</p><p className="font-semibold tabular-nums">{rs(calc.servicos_por_un, 4)}</p></div>
        <div><p className="text-[11px] text-muted-foreground">Preço calculado / un</p><p className="font-bold tabular-nums">{rs(calc.preco_un, 4)}</p></div>
        <div><p className="text-[11px] text-muted-foreground">Total do pedido</p><p className="font-semibold tabular-nums">{rs(calc.total_pedido)}</p></div>
        {calc.desconto_servicos_total > 0 && <p className="col-span-full text-xs text-emerald-700">Desconto concedido nos serviços: {rs(calc.desconto_servicos_total)}</p>}
      </div>

      {calc.pendencias.length > 0 ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300" data-testid="cotacao-pendencias">
          <p className="font-medium flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> A cotação não pode ser enviada enquanto houver:</p>
          <ul className="mt-1 list-disc pl-5">{calc.pendencias.map((p, i) => <li key={i}>{p.descricao}: {p.motivo}</li>)}</ul>
          <p className="mt-1 opacity-80">Preço de serviço se preenche em PCP › Cadastros › Serviços; preço de insumo, aqui na linha.</p>
        </div>
      ) : (!bloqueado && calc.preco_un > 0 && (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => onAplicarPreco?.(calc.preco_un)} data-testid="aplicar-preco">
            Usar {rs(calc.preco_un, 4)}/un no preço da cotação
          </Button>
        </div>
      ))}
    </div>
  );
}
