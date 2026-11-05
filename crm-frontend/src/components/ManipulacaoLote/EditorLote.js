/* Editor da matriz do lote (LM-07, spec 2026-11-04 §6/§10). Amostras nas colunas, ingredientes nas
 * linhas, 100 % ao vivo por coluna. Célula diferente da matriz fica marcada: fragrância (lilás) é livre;
 * comum (âmbar) exige motivo; crítico (vermelho) exige motivo e a aprovação de outra pessoa (ADM ou
 * módulo "Aprovar crítico P&D"). Salvar grava só o rascunho; "Gerar ordem" vai ao servidor. */
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { formatApiError } from "@/lib/formatError";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Copy, Loader2, Plus, Save, Search, ShieldCheck, X } from "lucide-react";
import {
  MAX_MEMBROS, MINIMO_PESAVEL_PADRAO_G, MIN_MOTIVO, NIVEL, ROTULO_STATUS_PD, chaveMaterialFase, clonar, diferencas, fechamentoPorMembro,
  pendencias, quantidadeEmGramas, sugereFragrancia,
} from "@/lib/manipulacaoLote";

const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const paraNumeros = (celulas) => Object.fromEntries(Object.entries(celulas || {}).map(([r, col]) => [r,
  Object.fromEntries(Object.entries(col || {}).map(([k, v]) => [k, num(v)]).filter(([, v]) => v > 0))]));
const chaves = (o) => Object.keys(o || {}).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
const proximaChave = (ingredientes) => { let n = 1; while (ingredientes[`i${String(n).padStart(2, "0")}`]) n += 1; return `i${String(n).padStart(2, "0")}`; };
const ativosDe = (lote) => Object.keys(lote.membros || {}).filter((r) => lote.membros[r]?.status_membro !== "removido");
const CLASSE_NIVEL = {
  [NIVEL.FRAGRANCIA]: "bg-violet-50 border-violet-300 dark:bg-violet-950/40 dark:border-violet-700",
  [NIVEL.COMUM]: "bg-amber-50 border-amber-400 dark:bg-amber-950/40 dark:border-amber-600",
  [NIVEL.CRITICO]: "bg-red-50 border-red-500 dark:bg-red-950/40 dark:border-red-600",
};
const SELECT = "rounded-md border border-input bg-background text-foreground";

function estadoDe(lote) {
  const ativos = ativosDe(lote);
  return {
    ingredientes: { ...(lote.ingredientes || {}) },
    celulas: Object.fromEntries(ativos.map((r) => [r, { ...(lote.celulas?.[r] || {}) }])),
    motivos: Object.fromEntries(Object.entries(lote.motivos || {}).map(([r, o]) => [r, Object.fromEntries(Object.entries(o || {}).map(([k, x]) => [k, { texto: x?.texto || "" }]))])),
    quantidades: Object.fromEntries(ativos.map((r) => [r, { quantidade_g: lote.membros[r].quantidade_g ?? "", densidade: lote.membros[r].densidade ?? "" }])),
    pre_mistura: { ...(lote.pre_mistura || {}) },
    perda_pct: lote.perda_pct ?? 0,
    minimo_pesavel_g: lote.minimo_pesavel_g ?? MINIMO_PESAVEL_PADRAO_G,
  };
}

function useEstreito() {
  const consulta = "(max-width: 639px)";
  const [estreito, setEstreito] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(consulta).matches));
  useEffect(() => {
    const m = window.matchMedia?.(consulta);
    if (!m) return undefined;
    const f = () => setEstreito(m.matches);
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  return estreito;
}

/* Motivo com mínimo de letras (tirar amostra, cancelar, ocorrência). */
export function MotivoDialog({ titulo, descricao, minimo = 0, rotulo = "Motivo", onConfirmar, onFechar, extra = null }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const ok = texto.trim().length >= minimo;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle>{descricao && <DialogDescription>{descricao}</DialogDescription>}</DialogHeader>
        {extra}
        <Label htmlFor="motivo-lote">{rotulo}{minimo ? ` (mín. ${minimo} letras)` : ""}</Label>
        <Textarea id="motivo-lote" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} />
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button disabled={!ok || enviando} onClick={async () => { setEnviando(true); try { await onConfirmar(texto.trim()); } finally { setEnviando(false); } }}>
            {enviando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdicionarIngrediente({ ingredientes, onAdicionar, onFechar }) {
  const [termo, setTermo] = useState("");
  const [fase, setFase] = useState("");
  const [lista, setLista] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const buscar = async () => {
    setBuscando(true);
    try {
      const { data } = await api.get("/pd/catalog", { params: { tipo_material: "MPES,MPGR", q: termo.trim() } });
      setLista((data || []).slice(0, 40));
    } catch (e) { toast.error(formatApiError(e)); } finally { setBuscando(false); }
  };
  const existentes = new Set(Object.values(ingredientes).map(chaveMaterialFase));
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Adicionar ingrediente ao lote</DialogTitle>
          <DialogDescription>Matéria-prima do Cadastros (MPES/MPGR). Entra com 0 % em todas as amostras.</DialogDescription></DialogHeader>
        <div className="flex gap-2">
          <Input placeholder="Nome, INCI ou código" value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") buscar(); }} />
          <Button onClick={buscar} disabled={buscando}><Search className="h-4 w-4" /></Button>
        </div>
        <div className="flex items-center gap-2"><Label htmlFor="fase-novo">Fase</Label>
          <Input id="fase-novo" className="w-24" value={fase} onChange={(e) => setFase(e.target.value)} placeholder="A" /></div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {lista && !lista.length && <p className="text-sm text-muted-foreground">Nada encontrado.</p>}
          {(lista || []).map((m) => {
            const ing = { nome: m.nome, codigo: m.codigo_interno || "", catalog_id: m.id, master_material_id: m.master_material_id || m.id, inci: m.inci || "",
              fase: fase.trim(), funcao: "", price_per_kg: num(m.preco_rs_kg), unit: m.unidade || null, fornecedor: m.fornecedor || "", tipo_material: m.tipo_material || "" };
            const repetido = existentes.has(chaveMaterialFase(ing));
            return (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                <span><b>{m.nome}</b> <span className="text-xs text-muted-foreground">{m.codigo_interno} {m.inci}</span></span>
                <Button size="sm" variant="outline" disabled={repetido} title={repetido ? "Já está no lote nesta fase." : ""} onClick={() => onAdicionar(ing)}>Adicionar</Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EditorLote({ detalhe, user, recarregar }) {
  const { lote, estado = {}, eu } = detalhe;
  const pode = Boolean(detalhe.pode_editar);
  const ativos = useMemo(() => ativosDe(lote), [lote]);
  const [form, setForm] = useState(() => estadoDe(lote));
  const [sujo, setSujo] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [coluna, setColuna] = useState(ativos[0]);
  const [dialogo, setDialogo] = useState(null);
  const estreito = useEstreito();
  useEffect(() => { setForm(estadoDe(lote)); setSujo(false); }, [lote]);

  const mudar = (f) => { setForm((x) => f(x)); setSujo(true); };
  const matriz = lote.matriz?.celulas || {};
  const celN = useMemo(() => paraNumeros(form.celulas), [form.celulas]);
  const difs = useMemo(() => diferencas({ ingredientes: form.ingredientes, celulas: celN, matrizCelulas: matriz }), [form.ingredientes, celN, matriz]);
  const motivosComAutor = useMemo(() => Object.fromEntries(Object.entries(form.motivos).map(([r, o]) => [r,
    Object.fromEntries(Object.entries(o || {}).map(([k, x]) => [k, { ...(lote.motivos?.[r]?.[k] || {}), texto: x.texto }]))])), [form.motivos, lote.motivos]);
  const pend = useMemo(() => pendencias({ ingredientes: form.ingredientes, celulas: celN, matrizCelulas: matriz, motivos: motivosComAutor, aprovacoes: lote.aprovacoes_criticas || {}, membros: ativos }),
    [form.ingredientes, celN, matriz, motivosComAutor, lote.aprovacoes_criticas, ativos]);
  const fech = useMemo(() => fechamentoPorMembro(celN, ativos), [celN, ativos]);
  const keys = chaves(form.ingredientes);
  const fases = [...new Set(keys.map((k) => String(form.ingredientes[k].fase || "").trim()).filter(Boolean))].sort();
  const cod = (r) => lote.membros[r]?.codigo_amostra || r;
  const semGramas = ativos.filter((r) => quantidadeEmGramas({ ...lote.membros[r] }) == null);
  const podeGerar = pode && !sujo && ativos.length >= 2 && !pend.length && ativos.every((r) => fech[r]?.ok) && !semGramas.length;
  const podeAprovar = user?.role === "admin" || user?.modulos?.aprovar_critico_pd === true;
  const visiveis = estreito ? [ativos.includes(coluna) ? coluna : ativos[0]] : ativos;
  const nivelDe = (r, k) => (difs[r] || []).find((x) => x.ingKey === k)?.nivel || 0;

  const executar = async (rotulo, fn) => {
    setOcupado(rotulo);
    try { await fn(); } catch (e) { toast.error(formatApiError(e)); } finally { setOcupado(""); }
  };
  const salvar = () => executar("salvar", async () => {
    const motivos = Object.fromEntries(Object.entries(form.motivos).map(([r, o]) => [r,
      Object.fromEntries(Object.entries(o || {}).filter(([, x]) => String(x?.texto || "").trim()).map(([k, x]) => [k, { texto: x.texto.trim() }]))]));
    const quantidades = Object.fromEntries(Object.entries(form.quantidades).map(([r, q]) => [r, { quantidade_g: num(q.quantidade_g) || null, densidade: num(q.densidade) || null }]));
    const { data } = await api.put(`/pd/manipulacao-lotes/${lote.id}`, { revisao: lote.revisao, ingredientes: form.ingredientes, celulas: celN, motivos,
      pre_mistura: form.pre_mistura, perda_pct: num(form.perda_pct), minimo_pesavel_g: num(form.minimo_pesavel_g), quantidades });
    if (data.sem_mudanca) toast.info("Nada mudou desde o último salvamento.");
    else toast.success(`Rascunho salvo (revisão ${data.lote?.revisao ?? ""}).`);
    (data.avisos || []).forEach((a) => toast.warning(a));
    await recarregar();
  });
  const gerar = () => executar("gerar", async () => {
    const { data } = await api.post(`/pd/manipulacao-lotes/${lote.id}/gerar-ordem`, { revisao: lote.revisao });
    toast.success("Ordem gerada: cada amostra ganhou uma versão travada da fórmula.");
    (data.avisos || []).forEach((a) => toast.warning(a));
    await recarregar();
  });
  const aprovar = (r, k) => executar(`aprovar-${r}-${k}`, async () => {
    await api.post(`/pd/manipulacao-lotes/${lote.id}/aprovar-critico`, { requestId: r, ingKey: k });
    toast.success("Mudança de ingrediente crítico aprovada.");
    await recarregar();
  });
  const clonarMatrizParaTodas = () => {
    if (!window.confirm("Copiar a matriz para todas as amostras? As células atuais são substituídas (salve depois).")) return;
    mudar((f) => ({ ...f, celulas: clonar(f.celulas, { de: "matriz", para: ativos, matrizCelulas: matriz }) }));
  };

  return (
    <div className="space-y-4" data-testid="editor-lote">
      {Object.entries(estado).filter(([, s]) => s?.fora_do_lote).map(([r]) => (
        <p key={r} className="flex items-center gap-1 text-sm text-red-700 dark:text-red-400" role="alert"><AlertTriangle className="h-4 w-4" />{cod(r)}: a fórmula foi editada fora do lote — tire a amostra e inclua de novo.</p>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={salvar} disabled={!pode || !sujo || Boolean(ocupado)} data-testid="btn-salvar-lote">
          {ocupado === "salvar" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Salvar rascunho
        </Button>
        <Button variant="secondary" onClick={gerar} disabled={!podeGerar || Boolean(ocupado)} data-testid="btn-gerar-ordem"
          title={sujo ? "Salve antes de gerar a ordem." : pend.length ? "Resolva as pendências." : semGramas.length ? "Informe a quantidade em g de todas." : ""}>
          {ocupado === "gerar" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Gerar ordem
        </Button>
        <Button variant="outline" onClick={clonarMatrizParaTodas} disabled={!pode}><Copy className="mr-1 h-4 w-4" />Clonar matriz para todas</Button>
        <Button variant="outline" onClick={() => setDialogo({ tipo: "adicionar" })} disabled={!pode}><Plus className="mr-1 h-4 w-4" />Adicionar ingrediente</Button>
        <Button variant="ghost" className="text-red-700 dark:text-red-400" onClick={() => setDialogo({ tipo: "cancelar" })} disabled={!pode}>Cancelar lote</Button>
        {sujo && <span className="text-xs text-amber-700 dark:text-amber-300">Alterações não salvas</span>}
        {!pode && <span className="text-xs text-muted-foreground">Seu perfil só consulta.</span>}
      </div>

      <div className="flex flex-wrap items-end gap-4 text-sm">
        <div><Label htmlFor="perda-lote">Excesso nas pré-misturas (%)</Label>
          <Input id="perda-lote" className="w-24" inputMode="decimal" value={form.perda_pct} disabled={!pode} onChange={(e) => mudar((f) => ({ ...f, perda_pct: e.target.value }))} /></div>
        <div><Label htmlFor="minimo-lote">Mínimo pesável (g)</Label>
          <Input id="minimo-lote" className="w-24" inputMode="decimal" value={form.minimo_pesavel_g} disabled={!pode} onChange={(e) => mudar((f) => ({ ...f, minimo_pesavel_g: e.target.value }))} /></div>
        <div>
          <span className="text-xs text-muted-foreground">Pré-mistura por fase (só ingredientes iguais em todas):</span>
          <div className="flex flex-wrap gap-3">
            {fases.length ? fases.map((fase) => (
              <label key={fase} className="flex items-center gap-1">
                <input type="checkbox" disabled={!pode} checked={form.pre_mistura[fase] === true}
                  onChange={(e) => mudar((f) => ({ ...f, pre_mistura: { ...f.pre_mistura, [fase]: e.target.checked } }))} />Fase {fase}
              </label>
            )) : <span className="text-xs text-muted-foreground">sem fase nomeada — tudo é pesado por amostra</span>}
          </div>
        </div>
        {estreito && (
          <div><Label htmlFor="coluna-lote">Amostra</Label>
            <select id="coluna-lote" className={`h-9 px-2 ${SELECT}`} value={visiveis[0]} onChange={(e) => setColuna(e.target.value)}>
              {ativos.map((r) => <option key={r} value={r}>{cod(r)}</option>)}
            </select></div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="border-collapse text-sm" data-testid="matriz-lote">
          <thead>
            <tr className="border-b align-top">
              <th className="sticky left-0 z-10 min-w-[130px] bg-background p-2 text-left sm:min-w-[200px]">Ingrediente</th>
              <th className="p-2 text-right text-xs font-normal text-muted-foreground">Matriz<div>{lote.matriz?.codigo || lote.matriz?.tipo}</div></th>
              {visiveis.map((r) => {
                const m = lote.membros[r];
                const ml = String(m.unidade_pedido || "g").toLowerCase() !== "g";
                return (
                  <th key={r} className="min-w-[110px] p-2 text-left font-normal sm:min-w-[130px]">
                    <div className="font-semibold">{cod(r)}</div>
                    <div className="text-xs text-muted-foreground">{ROTULO_STATUS_PD[estado[r]?.status_pd] || estado[r]?.status_pd || ""}{m.versao_antes ? ` · v${m.versao_antes}` : " · sem fórmula"}</div>
                    <label className="mt-1 block text-xs">g
                      <Input className="h-7" inputMode="decimal" aria-label={`Quantidade em g de ${cod(r)}`} value={form.quantidades[r]?.quantidade_g ?? ""} disabled={!pode}
                        onChange={(e) => mudar((f) => ({ ...f, quantidades: { ...f.quantidades, [r]: { ...f.quantidades[r], quantidade_g: e.target.value } } }))} /></label>
                    {ml && (
                      <label className="block text-xs">densidade (g/mL) — pedido {m.quantidade_pedido} {m.unidade_pedido}
                        <Input className="h-7" inputMode="decimal" value={form.quantidades[r]?.densidade ?? ""} disabled={!pode}
                          onChange={(e) => mudar((f) => ({ ...f, quantidades: { ...f.quantidades, [r]: { ...f.quantidades[r], densidade: e.target.value } } }))} /></label>
                    )}
                    <select className={`mt-1 h-7 w-full text-xs ${SELECT}`} value="" disabled={!pode} aria-label={`Copiar para ${cod(r)}`}
                      onChange={(e) => { const de = e.target.value; if (de) mudar((f) => ({ ...f, celulas: clonar(f.celulas, { de, para: [r], matrizCelulas: matriz }) })); }}>
                      <option value="">Copiar de…</option><option value="matriz">Matriz</option>
                      {ativos.filter((x) => x !== r).map((x) => <option key={x} value={x}>{cod(x)}</option>)}
                    </select>
                    <Button variant="ghost" size="sm" className="mt-1 h-6 px-1 text-xs text-red-700 dark:text-red-400" disabled={!pode || ativos.length <= 2}
                      title={ativos.length <= 2 ? "O lote precisa de pelo menos 2 amostras." : ""} onClick={() => setDialogo({ tipo: "remover", r })}>
                      <X className="mr-1 h-3 w-3" />Tirar do lote
                    </Button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const ing = form.ingredientes[k];
              return (
                <tr key={k} className="border-b last:border-0">
                  <td className="sticky left-0 z-10 bg-background p-2 align-top">
                    <div className="font-medium">{ing.nome}</div>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {ing.fase ? `Fase ${ing.fase}` : "sem fase"}
                      {ing.critico && <Badge variant="outline" className="border-red-400 text-red-700 dark:text-red-400">crítico</Badge>}
                      {ing.ehFragrancia && <Badge variant="outline" className="border-violet-400 text-violet-700 dark:text-violet-300">fragrância</Badge>}
                      {!ing.ehFragrancia && sugereFragrancia(ing) && <span className="text-muted-foreground" title="Pelo nome parece fragrância; o que vale é o Cadastros ou a função na fórmula.">parece fragrância?</span>}
                      <button type="button" className="underline disabled:opacity-40" disabled={!pode} title="Usar o % da matriz em todas as amostras"
                        onClick={() => mudar((f) => ({ ...f, celulas: clonar(f.celulas, { de: "matriz", para: ativos, ingKey: k, matrizCelulas: matriz }) }))}>= matriz em todas</button>
                    </div>
                  </td>
                  <td className="p-2 text-right align-top text-muted-foreground">{matriz[k] ? fmt(matriz[k]) : "—"}</td>
                  {visiveis.map((r) => (
                    <td key={r} className="p-1 align-top">
                      <Input inputMode="decimal" className={`h-8 text-right ${CLASSE_NIVEL[nivelDe(r, k)] || ""}`} aria-label={`${cod(r)} · ${ing.nome} (%)`}
                        value={form.celulas[r]?.[k] ?? ""} disabled={!pode} data-testid={`cel-${r}-${k}`}
                        onChange={(e) => mudar((f) => ({ ...f, celulas: { ...f.celulas, [r]: { ...f.celulas[r], [k]: e.target.value } } }))} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="sticky left-0 z-10 bg-background p-2">Soma</td>
              <td className="p-2 text-right text-muted-foreground">{fmt(Object.values(matriz).reduce((s, v) => s + num(v), 0))} %</td>
              {visiveis.map((r) => (
                <td key={r} className={`p-2 text-right ${fech[r]?.ok ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid={`soma-${r}`}>
                  {fmt(fech[r]?.soma)} %{fech[r]?.ok ? <CheckCircle2 className="ml-1 inline h-3 w-3" /> : null}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="space-y-2" data-testid="diferencas-lote">
        <h4 className="text-sm font-semibold">Diferenças da matriz</h4>
        {ativos.every((r) => !(difs[r] || []).length) && <p className="text-xs text-muted-foreground">Todas as amostras iguais à matriz.</p>}
        {ativos.map((r) => {
          const frag = (difs[r] || []).filter((x) => x.nivel === NIVEL.FRAGRANCIA);
          return frag.length ? (
            <div key={`${r}-frag`} className={`rounded border p-2 text-sm ${CLASSE_NIVEL[NIVEL.FRAGRANCIA]}`}>
              <b>{cod(r)}</b> · fragrância: {frag.map((x) => `${x.nome} ${fmt(x.de)} → ${fmt(x.para)} %`).join("; ")} <span className="text-xs text-violet-700 dark:text-violet-300">— livre</span>
            </div>
          ) : null;
        })}
        {ativos.map((r) => (difs[r] || []).filter((x) => x.nivel !== NIVEL.FRAGRANCIA).map((x) => {
          const salvo = lote.motivos?.[r]?.[x.ingKey];
          const ap = lote.aprovacoes_criticas?.[r]?.[x.ingKey];
          const aprovado = ap && Math.round(num(ap.valor) * 1e4) === Math.round(num(x.para) * 1e4);
          const podeEsteAprovar = podeAprovar && !sujo && salvo?.por && salvo.por !== eu && Math.round(num(salvo.valor) * 1e4) === Math.round(num(x.para) * 1e4);
          return (
            <div key={`${r}-${x.ingKey}`} className={`flex flex-wrap items-center gap-2 rounded border p-2 text-sm ${CLASSE_NIVEL[x.nivel] || ""}`}>
              <span className="sm:min-w-[220px]"><b>{cod(r)}</b> · {x.nome}: {fmt(x.de)} → {fmt(x.para)} %</span>
              {(
                <>
                  <Input className="h-8 w-full sm:max-w-sm sm:flex-1" placeholder={`Motivo (mín. ${MIN_MOTIVO} letras)`} disabled={!pode} aria-label={`Motivo ${cod(r)} ${x.nome}`}
                    value={form.motivos[r]?.[x.ingKey]?.texto || ""}
                    onChange={(e) => mudar((f) => ({ ...f, motivos: { ...f.motivos, [r]: { ...(f.motivos[r] || {}), [x.ingKey]: { texto: e.target.value } } } }))} />
                  {x.nivel === NIVEL.CRITICO && (aprovado
                    ? <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400"><ShieldCheck className="h-3 w-3" />aprovado por {ap.por_nome}</span>
                    : podeEsteAprovar
                      ? <Button size="sm" variant="outline" onClick={() => aprovar(r, x.ingKey)} disabled={Boolean(ocupado)}>Aprovar mudança</Button>
                      : <span className="text-xs text-red-700 dark:text-red-400">crítico: precisa da aprovação de outra pessoa (ADM ou módulo Aprovar crítico P&D){sujo ? " — salve antes" : ""}</span>)}
                </>
              )}
            </div>
          );
        }))}
        {pend.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-amber-800 dark:text-amber-300" data-testid="pendencias-lote">
            {pend.slice(0, 8).map((p) => <li key={`${p.request_id}-${p.ingKey}-${p.tipo}`}>{cod(p.request_id)}: {p.motivo}</li>)}
            {pend.length > 8 && <li>+{pend.length - 8} pendência(s)</li>}
          </ul>
        )}
        {semGramas.length > 0 && <p className="text-xs text-amber-800 dark:text-amber-300">Sem quantidade em g (salvo): {semGramas.map(cod).join(", ")}.</p>}
        <p className="text-xs text-muted-foreground">Até {MAX_MEMBROS} amostras por lote. A ordem só sai com 100 % em todas, motivos escritos e críticos aprovados.</p>
      </section>

      {dialogo?.tipo === "adicionar" && (
        <AdicionarIngrediente ingredientes={form.ingredientes} onFechar={() => setDialogo(null)} onAdicionar={(ing) => {
          mudar((f) => ({ ...f, ingredientes: { ...f.ingredientes, [proximaChave(f.ingredientes)]: ing } }));
          setDialogo(null);
          toast.info(`${ing.nome} entrou com 0 % — preencha nas amostras e salve.`);
        }} />
      )}
      {dialogo?.tipo === "remover" && (
        <MotivoDialog titulo={`Tirar ${cod(dialogo.r)} do lote`} descricao="A amostra volta a ficar livre; o que já está gravado no lote fica no histórico."
          onFechar={() => setDialogo(null)} onConfirmar={(motivo) => executar("remover", async () => {
            await api.post(`/pd/manipulacao-lotes/${lote.id}/membros/${encodeURIComponent(dialogo.r)}/remover`, { motivo, revisao: lote.revisao });
            setDialogo(null);
            toast.success(`${cod(dialogo.r)} saiu do lote.`);
            await recarregar();
          })} />
      )}
      {dialogo?.tipo === "cancelar" && (
        <MotivoDialog titulo={`Cancelar o lote ${lote.codigo}`} descricao="As amostras ficam livres para outro lote. Nada é apagado." minimo={5}
          onFechar={() => setDialogo(null)} onConfirmar={(motivo) => executar("cancelar", async () => {
            await api.post(`/pd/manipulacao-lotes/${lote.id}/cancelar`, { motivo, revisao: lote.revisao });
            setDialogo(null);
            toast.success("Lote cancelado.");
            await recarregar();
          })} />
      )}
    </div>
  );
}
