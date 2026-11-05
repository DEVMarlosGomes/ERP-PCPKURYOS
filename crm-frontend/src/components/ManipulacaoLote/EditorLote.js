/* Editor do lote (LM-07, spec 2026-11-04 §6/§10 e §16). Workspace em tela cheia: lista das amostras à esquerda,
 * uma amostra por vez com a matriz ao lado de cada %, 100 % ao vivo. Célula diferente da matriz fica marcada só
 * como informação (fragrância lilás, comum âmbar, crítico vermelho) — desde 05/11/2026 o lote NÃO pede comentário:
 * quem alterou cada célula é registrado sozinho no salvamento. Única trava que sobra (D-1): crítico que
 * muda a fórmula ANTERIOR da amostra precisa do "Aprovar" de outra pessoa (ADM ou módulo "Aprovar
 * crítico P&D"). "Concluir lote" libera com todas em 100 % (e o crítico aprovado), salva o que estiver na tela e,
 * no servidor, cria a próxima versão de cada amostra (V1 para quem não tinha fórmula, V(n+1) para quem tinha) +
 * a ordem. A quantidade em g só serve à ordem de pesagem: se o pedido não traz, é pedida no clique (GramasDialog). */
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, FlaskConical, Loader2, Plus, Save, ShieldCheck, X } from "lucide-react";
import NovoIngredienteLote from "./NovoIngredienteLote";
import {
  MAX_MEMBROS, MINIMO_PESAVEL_PADRAO_G, NIVEL, ROTULO_STATUS_PD, chaveMaterialFase, clonar, fechamentoPorMembro,
  diferencasDoLote, mudancasCriticasDaOrigem, pendencias, quantidadeEmGramas, sugereFragrancia,
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
// Caixa de seleção nativa: o index.css dá min-height de 2,5 rem a todo input (a caixinha virava um quadrado de 40 px).
const CAIXA = "h-4 w-4 min-h-0 shrink-0";

function estadoDe(lote) {
  const ativos = ativosDe(lote);
  return {
    ingredientes: { ...(lote.ingredientes || {}) },
    celulas: Object.fromEntries(ativos.map((r) => [r, { ...(lote.celulas?.[r] || {}) }])),
    quantidades: Object.fromEntries(ativos.map((r) => [r, { quantidade_g: lote.membros[r].quantidade_g ?? "", densidade: lote.membros[r].densidade ?? "" }])),
    pre_mistura: { ...(lote.pre_mistura || {}) },
    perda_pct: lote.perda_pct ?? 0,
    minimo_pesavel_g: lote.minimo_pesavel_g ?? MINIMO_PESAVEL_PADRAO_G,
  };
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

/* Gramas que o pedido não trouxe: pedidas no clique de concluir (só entram na ordem de pesagem). */
export function GramasDialog({ faltam, membros, codigoDe, onConfirmar, onFechar }) {
  const [g, setG] = useState(() => Object.fromEntries(faltam.map((r) => [r, ""])));
  const [todas, setTodas] = useState("");
  const ok = faltam.every((r) => num(g[r]) > 0);
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-md" data-testid="gramas-lote">
        <DialogHeader>
          <DialogTitle>Quantidade a manipular</DialogTitle>
          <DialogDescription>O pedido {faltam.length > 1 ? "destas amostras" : "desta amostra"} não traz a quantidade em g. Ela só serve para a ordem de pesagem — os % de cada versão são os que estão no lote.</DialogDescription>
        </DialogHeader>
        {faltam.length > 1 && (
          <div>
            <Label htmlFor="g-todas">Mesma quantidade para todas (g)</Label>
            <Input id="g-todas" className="mt-1 w-32 text-right" inputMode="decimal" value={todas}
              onChange={(e) => { setTodas(e.target.value); setG(Object.fromEntries(faltam.map((r) => [r, e.target.value]))); }} />
          </div>
        )}
        <div className="space-y-2">
          {faltam.map((r) => {
            const m = membros[r] || {};
            return (
              <div key={r} className="flex items-center gap-2">
                <Label htmlFor={`g-${r}`} className="min-w-0 flex-1 truncate">{codigoDe(r)}
                  {m.quantidade_pedido ? <span className="block text-xs font-normal text-muted-foreground">pedido: {fmt(m.quantidade_pedido)} {m.unidade_pedido}</span> : null}</Label>
                <Input id={`g-${r}`} className="w-28 text-right" inputMode="decimal" value={g[r]}
                  onChange={(e) => setG((x) => ({ ...x, [r]: e.target.value }))} />
                <span className="text-sm text-muted-foreground">g</span>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button disabled={!ok} data-testid="btn-gramas-concluir" onClick={() => onConfirmar(Object.fromEntries(faltam.map((r) => [r, num(g[r])])))}
            className="bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500">
            <FlaskConical className="mr-1 h-4 w-4" />Concluir lote
          </Button>
        </DialogFooter>
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
  useEffect(() => {
    setForm(estadoDe(lote));
    setSujo(false);
    setColuna((atual) => (ativos.includes(atual) ? atual : ativos[0]));
  }, [lote, ativos]);

  const mudar = (f) => { setForm((x) => f(x)); setSujo(true); };
  const matriz = lote.matriz?.celulas || {};
  const celN = useMemo(() => paraNumeros(form.celulas), [form.celulas]);
  // Fórmula anterior de cada amostra (só de quem tinha fórmula): base da trava de crítico (D-1).
  const origem = detalhe.origem_celulas || {};
  // Matriz vazia e amostra sem fórmula anterior = fórmula nova: não há "diferença" a destacar.
  const formulaNova = (r) => lote.matriz?.tipo === "vazia" && !origem[r];
  const difs = useMemo(() => diferencasDoLote({ ingredientes: form.ingredientes, celulas: celN, matrizCelulas: matriz, origem }), [form.ingredientes, celN, matriz, origem]);
  const criticosDaOrigem = useMemo(() => mudancasCriticasDaOrigem({ ingredientes: form.ingredientes, celulas: celN, origem }), [form.ingredientes, celN, origem]);
  const pend = useMemo(() => pendencias({ ingredientes: form.ingredientes, celulas: celN, motivos: lote.motivos || {}, aprovacoes: lote.aprovacoes_criticas || {}, membros: ativos, origem }),
    [form.ingredientes, celN, lote.motivos, lote.aprovacoes_criticas, ativos, origem]);
  const fech = useMemo(() => fechamentoPorMembro(celN, ativos, form.ingredientes), [celN, ativos, form.ingredientes]);
  const keys = chaves(form.ingredientes);
  const fases = [...new Set(keys.map((k) => String(form.ingredientes[k].fase || "").trim()).filter(Boolean))].sort();
  const cod = (r) => lote.membros[r]?.codigo_amostra || r;
  // Gramas do que está NA TELA. Não seguram o botão (05/11, Marlos: "ao atingir 100 % liberar para criar V1, V2"):
  // faltando, o clique de concluir pergunta (GramasDialog) antes de salvar e gerar a ordem.
  const semGramas = ativos.filter((r) => quantidadeEmGramas({ ...lote.membros[r],
    quantidade_g: num(form.quantidades[r]?.quantidade_g) || null, densidade: num(form.quantidades[r]?.densidade) || null }) == null);
  const foraDos100 = ativos.filter((r) => !fech[r]?.ok);
  const falta = [
    ...(ativos.length < 2 ? ["o lote precisa de pelo menos 2 amostras"] : []),
    ...foraDos100.map((r) => `${cod(r)} fecha ${fmt(fech[r]?.soma)} % (precisa de 100 %)`),
    ...(pend.length ? [`${pend.length} ingrediente(s) crítico(s) para outra pessoa aprovar`] : []),
  ];
  const podeConcluir = pode && !falta.length;
  const podeAprovar = user?.role === "admin" || user?.modulos?.aprovar_critico_pd === true;
  const ativa = ativos.includes(coluna) ? coluna : ativos[0];
  const membroAtivo = lote.membros[ativa] || {};
  const pedidoEmVolume = String(membroAtivo.unidade_pedido || "g").toLowerCase() !== "g";
  const totalMatriz = Object.values(matriz).reduce((s, v) => s + num(v), 0);
  const nivelDe = (r, k) => (formulaNova(r) ? 0 : (difs[r] || []).find((x) => x.ingKey === k)?.nivel || 0);
  const deltaDe = (k) => num(form.celulas[ativa]?.[k]) - num(matriz[k]);

  const executar = async (rotulo, fn) => {
    setOcupado(rotulo);
    try { await fn(); } catch (e) { toast.error(formatApiError(e)); } finally { setOcupado(""); }
  };
  // Grava o rascunho e devolve a revisão gravada (a ordem precisa dela).
  const gravarRascunho = async (qs = form.quantidades) => {
    const quantidades = Object.fromEntries(Object.entries(qs).map(([r, q]) => [r, { quantidade_g: num(q.quantidade_g) || null, densidade: num(q.densidade) || null }]));
    const { data } = await api.put(`/pd/manipulacao-lotes/${lote.id}`, { revisao: lote.revisao, ingredientes: form.ingredientes, celulas: celN,
      pre_mistura: form.pre_mistura, perda_pct: num(form.perda_pct), minimo_pesavel_g: num(form.minimo_pesavel_g), quantidades });
    (data.avisos || []).forEach((a) => toast.warning(a));
    return data;
  };
  const salvar = () => executar("salvar", async () => {
    const data = await gravarRascunho();
    if (data.sem_mudanca) toast.info("Nada mudou desde o último salvamento.");
    else toast.success(`Rascunho salvo (revisão ${data.lote?.revisao ?? ""}).`);
    await recarregar();
  });
  // Um clique: salva o que está na tela e o servidor cria V1/V(n+1) em cada amostra + a ordem de pesagem.
  // `gramas` = { requestId: g } vindas do GramasDialog (o pedido não trazia).
  const concluir = (gramas = null) => executar("concluir", async () => {
    let revisao = lote.revisao;
    const qs = gramas ? Object.fromEntries(Object.entries(form.quantidades).map(([r, q]) => [r, gramas[r] ? { ...q, quantidade_g: String(gramas[r]) } : q])) : form.quantidades;
    if (gramas) setForm((f) => ({ ...f, quantidades: qs }));
    if (sujo || gramas) {
      const salvo = await gravarRascunho(qs);
      revisao = salvo.lote?.revisao ?? revisao;
      // O salvamento recalcula crítico/fragrância pelo Cadastros: se surgiu pendência, para aqui (salvo, sem ordem).
      if ((salvo.pendencias || []).length) {
        toast.error(`Rascunho salvo, mas ainda falta: ${salvo.pendencias.map((p) => `${cod(p.request_id)} · ${p.motivo}`).join(" ")}`);
        await recarregar();
        return;
      }
    }
    try {
      const { data } = await api.post(`/pd/manipulacao-lotes/${lote.id}/gerar-ordem`, { revisao });
      const v = Object.entries(data.versoes || {}).map(([r, x]) => `${cod(r)} v${x?.versao ?? "?"}`).join(", ");
      toast.success(v ? `Enviado para a manipulação: ${v}.` : "Enviado para a manipulação: cada amostra ganhou a próxima versão da fórmula.");
      (data.avisos || []).forEach((a) => toast.warning(a));
    } finally {
      await recarregar(); // o rascunho já salvo aparece mesmo se o servidor recusar
    }
  });
  const aprovar = (r, k) => executar(`aprovar-${r}-${k}`, async () => {
    await api.post(`/pd/manipulacao-lotes/${lote.id}/aprovar-critico`, { requestId: r, ingKey: k });
    toast.success("Mudança de ingrediente crítico aprovada.");
    await recarregar();
  });
  const pedirConcluir = () => (semGramas.length ? setDialogo({ tipo: "gramas" }) : concluir());
  const novas = ativos.filter((r) => !lote.membros[r]?.versao_antes).length;
  const copiarPara = (de) => mudar((f) => ({ ...f, celulas: clonar(f.celulas, { de, para: [ativa], matrizCelulas: matriz }) }));
  const clonarMatrizParaTodas = () => {
    if (!window.confirm("Copiar a matriz para todas as amostras? As células atuais são substituídas (salve depois).")) return;
    mudar((f) => ({ ...f, celulas: clonar(f.celulas, { de: "matriz", para: ativos, matrizCelulas: matriz }) }));
  };

  return (
    <div className="min-w-0 space-y-5" data-testid="editor-lote">
      {Object.entries(estado).filter(([, s]) => s?.fora_do_lote).map(([r]) => (
        <p key={r} className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert"><AlertTriangle className="h-4 w-4 shrink-0" />{cod(r)}: a fórmula foi editada fora do lote — tire a amostra e inclua de novo.</p>
      ))}
      <section className="rounded-xl border bg-card shadow-sm" aria-label="Comandos do lote">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Preparação do lote</p>
            <p className="mt-1 text-sm text-muted-foreground">Edite uma amostra por vez. A matriz permanece ao lado de cada percentual para conferência.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lote.matriz?.tipo !== "vazia" && <Button variant="outline" onClick={clonarMatrizParaTodas} disabled={!pode}><Copy className="mr-1 h-4 w-4" />Clonar matriz</Button>}
            <Button variant="outline" onClick={() => setDialogo({ tipo: "adicionar" })} disabled={!pode}><Plus className="mr-1 h-4 w-4" />Ingrediente</Button>
            <Button onClick={salvar} disabled={!pode || !sujo || Boolean(ocupado)} data-testid="btn-salvar-lote">
              {ocupado === "salvar" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Salvar rascunho
            </Button>
            <Button onClick={pedirConcluir} disabled={!podeConcluir || Boolean(ocupado)} data-testid="btn-gerar-ordem"
              className="bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              title={falta.length ? `Falta: ${falta.join(" · ")}` : "Cria a próxima versão da fórmula em cada amostra e a ordem de pesagem."}>
              {ocupado === "concluir" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-1 h-4 w-4" />}Concluir lote
            </Button>
            <Button variant="ghost" className="text-red-700 dark:text-red-400 xl:hidden" onClick={() => setDialogo({ tipo: "cancelar" })} disabled={!pode}>Cancelar lote</Button>
          </div>
        </div>
        <div className={`flex gap-3 p-4 text-sm ${falta.length ? "bg-amber-50 text-amber-900 dark:bg-amber-950/25 dark:text-amber-200" : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-200"}`} data-testid="falta-lote" role="status">
          {falta.length ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <div>
            {pode ? (falta.length ? <><b>Para concluir:</b> {falta.join(" · ")}.</>
              : <>Tudo preenchido. Ao concluir, cada amostra ganha a próxima versão da fórmula ({novas === ativos.length ? "todas começam na V1" : novas ? `V1 para ${novas} sem fórmula, a seguinte para as demais` : "a seguinte de cada uma"}) e segue para a Manipulação.
                {semGramas.length ? ` A quantidade em g de ${semGramas.length === ativos.length ? "todas" : semGramas.map(cod).join(", ")} é pedida no clique (o pedido não traz).` : ""}</>)
              : <>Seu perfil está em modo consulta.</>}
            {sujo && <span className="ml-2 font-medium">Há alterações não salvas.</span>}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-4 lg:grid-cols-[13rem_13rem_minmax(0,1fr)]" aria-label="Parâmetros de pesagem">
        <div className="flex flex-col justify-between"><Label htmlFor="perda-lote">Excesso nas pré-misturas (%)</Label>
          <Input id="perda-lote" className="mt-1" inputMode="decimal" value={form.perda_pct} disabled={!pode} onChange={(e) => mudar((f) => ({ ...f, perda_pct: e.target.value }))} /></div>
        <div className="flex flex-col justify-between"><Label htmlFor="minimo-lote">Mínimo pesável (g)</Label>
          <Input id="minimo-lote" className="mt-1" inputMode="decimal" value={form.minimo_pesavel_g} disabled={!pode} onChange={(e) => mudar((f) => ({ ...f, minimo_pesavel_g: e.target.value }))} /></div>
        <div className="col-span-2 min-w-0 lg:col-span-1 lg:border-l lg:pl-4">
          <p className="text-sm font-medium">Pré-mistura por fase</p>
          <p className="text-xs text-muted-foreground">Somente ingredientes iguais em todas as amostras.</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {fases.length ? fases.map((fase) => (
              <label key={fase} className="flex items-center gap-2">
                <input type="checkbox" className={CAIXA} disabled={!pode} checked={form.pre_mistura[fase] === true}
                  onChange={(e) => mudar((f) => ({ ...f, pre_mistura: { ...f.pre_mistura, [fase]: e.target.checked } }))} />Fase {fase}
              </label>
            )) : <span className="text-xs text-muted-foreground">Sem fase nomeada — tudo é pesado por amostra.</span>}
          </div>
        </div>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]" data-testid="workspace-amostras-lote">
        <aside className="self-start overflow-hidden rounded-xl border bg-card xl:sticky xl:top-4" data-testid="amostras-lote-nav">
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">Amostras do lote</h3>
              <Badge variant="secondary">{ativos.length}</Badge>
            </div>
            <p className="mt-1 hidden text-xs text-muted-foreground xl:block">Selecione para editar a composição.</p>
          </div>
          {/* Abaixo de 1280 px a lista vira uma faixa que rola na horizontal: a composição fica logo abaixo, não depois de N cartões. */}
          <nav className="flex gap-2 overflow-x-auto p-2 xl:block xl:max-h-[62vh] xl:space-y-1 xl:overflow-y-auto xl:overflow-x-hidden" aria-label="Amostras do lote">
            {ativos.map((r, indice) => {
              const selecionada = r === ativa;
              const versao = lote.membros[r]?.versao_antes;
              return (
                <button key={r} type="button" onClick={() => setColuna(r)} aria-pressed={selecionada}
                  className={`w-44 shrink-0 rounded-lg border px-3 py-2.5 text-left transition-colors xl:w-full xl:py-3 ${selecionada ? "border-primary bg-primary/5 ring-1 ring-primary/25" : "border-transparent hover:border-border hover:bg-muted/50"}`}
                  data-testid={`amostra-lote-${r}`}>
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Amostra {indice + 1}</span>
                      <span className="mt-0.5 block truncate font-semibold">{cod(r)}</span>
                    </span>
                    <span className={`whitespace-nowrap text-sm font-semibold ${fech[r]?.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300"}`}>{fmt(fech[r]?.soma)}%</span>
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{ROTULO_STATUS_PD[estado[r]?.status_pd] || estado[r]?.status_pd || "Sem etapa"}</span>
                    <span>{versao ? `v${versao}` : "Nova fórmula"}</span>
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="hidden border-t p-2 xl:block">
            <Button variant="ghost" className="w-full justify-start text-red-700 dark:text-red-400" onClick={() => setDialogo({ tipo: "cancelar" })} disabled={!pode}>Cancelar lote</Button>
          </div>
        </aside>

        <main className="min-w-0 space-y-4" data-testid="amostra-lote-ativa">
          <section className="overflow-hidden rounded-xl border bg-card" data-testid={`cabecalho-amostra-${ativa}`}>
            <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Amostra em edição</p>
                <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">{cod(ativa)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{ROTULO_STATUS_PD[estado[ativa]?.status_pd] || estado[ativa]?.status_pd || "Sem etapa"}{membroAtivo.versao_antes ? ` · fórmula v${membroAtivo.versao_antes}` : " · fórmula nova"}</p>
              </div>
              <div className={`rounded-lg border px-3 py-2 text-right ${fech[ativa]?.ok ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/25" : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/25"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Fechamento</p>
                <p className={`text-lg font-semibold ${fech[ativa]?.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-300"}`} data-testid={`soma-${ativa}`}>{fmt(fech[ativa]?.soma)}%</p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 bg-muted/20 p-4">
              <div className="w-36">
                <Label htmlFor={`quantidade-${ativa}`}>Quantidade (g)</Label>
                <Input id={`quantidade-${ativa}`} className="mt-1 text-right" inputMode="decimal" placeholder={semGramas.includes(ativa) ? "pedida ao concluir" : ""} aria-label={`Quantidade em g de ${cod(ativa)}`} value={form.quantidades[ativa]?.quantidade_g ?? ""} disabled={!pode}
                  onChange={(e) => mudar((f) => ({ ...f, quantidades: { ...f.quantidades, [ativa]: { ...f.quantidades[ativa], quantidade_g: e.target.value } } }))} />
              </div>
              {pedidoEmVolume && (
                <div className="w-36">
                  <Label htmlFor={`densidade-${ativa}`}>Densidade (g/mL)</Label>
                  <Input id={`densidade-${ativa}`} className="mt-1 text-right" inputMode="decimal" value={form.quantidades[ativa]?.densidade ?? ""} disabled={!pode} title={`Pedido: ${membroAtivo.quantidade_pedido} ${membroAtivo.unidade_pedido}`}
                    onChange={(e) => mudar((f) => ({ ...f, quantidades: { ...f.quantidades, [ativa]: { ...f.quantidades[ativa], densidade: e.target.value } } }))} />
                </div>
              )}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={!pode} data-testid={`copiar-${ativa}`} aria-label={`Copiar composição para ${cod(ativa)}`}>
                    <Copy className="mr-1 h-4 w-4" />Copiar composição de<ChevronDown className="ml-1 h-4 w-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {lote.matriz?.tipo !== "vazia" && <DropdownMenuItem onSelect={() => copiarPara("matriz")}>Matriz {lote.matriz?.codigo || ""}</DropdownMenuItem>}
                  {ativos.filter((x) => x !== ativa).map((x) => <DropdownMenuItem key={x} onSelect={() => copiarPara(x)}>{cod(x)}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" className="text-red-700 dark:text-red-400 sm:ml-auto" disabled={!pode || ativos.length <= 2}
                title={ativos.length <= 2 ? "O lote precisa de pelo menos 2 amostras." : ""} onClick={() => setDialogo({ tipo: "remover", r: ativa })}>
                <X className="mr-1 h-4 w-4" />Tirar do lote
              </Button>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border bg-card" data-testid="matriz-lote-table-wrap">
            <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">Composição da amostra</h3>
                <p className="text-xs text-muted-foreground">Percentuais da matriz comparados com {cod(ativa)}.</p>
              </div>
              <Badge variant="outline">Matriz: {lote.matriz?.codigo || lote.matriz?.tipo}</Badge>
            </div>
            <div data-testid="matriz-lote">
              <div className="hidden grid-cols-[minmax(240px,1fr)_110px_150px_100px] items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:grid" data-testid="matriz-lote-cabecalho">
                <span>Ingrediente</span><span className="text-right">Matriz</span><span className="text-right">{cod(ativa)}</span><span className="text-right">Variação</span>
              </div>
              <div className="divide-y">
                {keys.map((k) => {
                  const ing = form.ingredientes[k];
                  const delta = deltaDe(k);
                  const deltaZero = Math.abs(delta) < 0.00005;
                  const variacao = formulaNova(ativa) ? "Nova" : deltaZero ? "Sem alteração" : `${delta > 0 ? "+" : ""}${fmt(delta)} p.p.`;
                  const meta = (
                    <div className="min-w-0">
                      <div className="break-words font-medium">{ing.nome}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span>{ing.fase ? `Fase ${ing.fase}` : "Sem fase"}</span>
                        {ing.critico && <Badge variant="outline" className="border-red-400 text-red-700 dark:text-red-400">crítico</Badge>}
                        {ing.ehFragrancia && <Badge variant="outline" className="border-violet-400 text-violet-700 dark:text-violet-300">fragrância</Badge>}
                        {!ing.ehFragrancia && sugereFragrancia(ing) && <span title="Pelo nome parece fragrância; o que vale é o Cadastros ou a função na fórmula.">parece fragrância?</span>}
                        {lote.matriz?.tipo !== "vazia" && (
                          <button type="button" className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-40" disabled={!pode} title="Usar o % da matriz em todas as amostras"
                            onClick={() => mudar((f) => ({ ...f, celulas: clonar(f.celulas, { de: "matriz", para: ativos, ingKey: k, matrizCelulas: matriz }) }))}>Aplicar matriz em todas</button>
                        )}
                      </div>
                    </div>
                  );
                  return (
                    <div key={k} className="px-4 py-3">
                      <div className="hidden grid-cols-[minmax(240px,1fr)_110px_150px_100px] items-center gap-3 lg:grid">
                        {meta}
                        <span className="text-right text-sm text-muted-foreground">{matriz[k] ? `${fmt(matriz[k])}%` : "—"}</span>
                        <Input inputMode="decimal" className={`h-9 text-right ${CLASSE_NIVEL[nivelDe(ativa, k)] || ""}`} aria-label={`${cod(ativa)} · ${ing.nome} (%)`}
                          value={form.celulas[ativa]?.[k] ?? ""} disabled={!pode} data-testid={`cel-${ativa}-${k}`}
                          onChange={(e) => mudar((f) => ({ ...f, celulas: { ...f.celulas, [ativa]: { ...f.celulas[ativa], [k]: e.target.value } } }))} />
                        <span className={`text-right text-xs font-medium ${deltaZero || formulaNova(ativa) ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300"}`}>{variacao}</span>
                      </div>
                      <div className="space-y-3 lg:hidden">
                        {meta}
                        <div className="grid grid-cols-[90px_minmax(0,1fr)] items-end gap-3">
                          <div><span className="text-xs text-muted-foreground">Matriz</span><p className="mt-2 text-sm font-medium">{matriz[k] ? `${fmt(matriz[k])}%` : "—"}</p></div>
                          <div><Label className="text-xs" htmlFor={`cel-mobile-${ativa}-${k}`}>{cod(ativa)} (%)</Label>
                            <Input id={`cel-mobile-${ativa}-${k}`} inputMode="decimal" className={`mt-1 h-9 text-right ${CLASSE_NIVEL[nivelDe(ativa, k)] || ""}`}
                              value={form.celulas[ativa]?.[k] ?? ""} disabled={!pode}
                              onChange={(e) => mudar((f) => ({ ...f, celulas: { ...f.celulas, [ativa]: { ...f.celulas[ativa], [k]: e.target.value } } }))} /></div>
                        </div>
                        <p className="text-xs text-muted-foreground">Variação: <span className="font-medium text-foreground">{variacao}</span></p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t bg-muted/30 px-4 py-3 font-semibold sm:grid-cols-[minmax(0,1fr)_110px_150px_100px]">
                <span>Total da fórmula</span>
                <span className="hidden text-right text-sm text-muted-foreground sm:block">{fmt(totalMatriz)}%</span>
                <span className={`text-right ${fech[ativa]?.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{fmt(fech[ativa]?.soma)}%{fech[ativa]?.ok ? <CheckCircle2 className="ml-1 inline h-4 w-4" /> : null}</span>
                <span className="hidden sm:block" />
              </div>
            </div>
          </section>
        </main>
      </div>

      {ativos.some((r) => (criticosDaOrigem[r] || []).length) && (
        <section className="space-y-2" data-testid="criticos-lote">
          <h4 className="text-sm font-semibold">Ingrediente crítico alterado em fórmula que já existia</h4>
          {ativos.map((r) => (criticosDaOrigem[r] || []).map((x) => {
            const quem = lote.motivos?.[r]?.[x.ingKey];
            const ap = lote.aprovacoes_criticas?.[r]?.[x.ingKey];
            const aprovado = ap && Math.round(num(ap.valor) * 1e4) === Math.round(num(x.para) * 1e4) && ap.chave === chaveMaterialFase(form.ingredientes[x.ingKey] || {});
            const podeEsteAprovar = podeAprovar && !sujo && quem?.por && quem.por !== eu && Math.round(num(quem.valor) * 1e4) === Math.round(num(x.para) * 1e4)
              && quem.chave === chaveMaterialFase(form.ingredientes[x.ingKey] || {});
            return (
              <div key={`${r}-${x.ingKey}`} className={`flex flex-wrap items-center gap-2 rounded border p-2 text-sm ${CLASSE_NIVEL[NIVEL.CRITICO]}`}>
                <span className="sm:min-w-[260px]"><b>{cod(r)}</b> · {x.nome}: {fmt(x.de)} → {fmt(x.para)} %{quem?.por_nome ? <span className="block text-xs">alterado por {quem.por_nome}</span> : null}</span>
                {aprovado
                  ? <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400"><ShieldCheck className="h-3 w-3" />aprovado por {ap.por_nome}</span>
                  : podeEsteAprovar
                    ? <Button size="sm" variant="outline" onClick={() => aprovar(r, x.ingKey)} disabled={Boolean(ocupado)}>Aprovar</Button>
                    : <span className="text-xs text-red-700 dark:text-red-400">precisa do "Aprovar" de outra pessoa (ADM ou módulo Aprovar crítico P&D){sujo ? " — salve antes" : ""}</span>}
              </div>
            );
          }))}
        </section>
      )}

      <section className="space-y-2" data-testid="diferencas-lote">
        <h4 className="text-sm font-semibold">Diferenças da matriz <span className="font-normal text-xs text-muted-foreground">(só para conferência — não precisa comentar)</span></h4>
        {lote.matriz?.tipo === "vazia" && <p className="text-xs text-muted-foreground">Matriz vazia: as amostras sem fórmula anterior são fórmulas novas e viram v1 ao concluir.</p>}
        {ativos.filter((r) => !formulaNova(r)).every((r) => !(difs[r] || []).length) && lote.matriz?.tipo !== "vazia" && <p className="text-xs text-muted-foreground">Todas as amostras iguais à matriz.</p>}
        {ativos.filter((r) => !formulaNova(r) && (difs[r] || []).length).map((r) => (
          <div key={`${r}-dif`} className="rounded border p-2 text-sm">
            <b>{cod(r)}</b>: {(difs[r] || []).map((x) => (
              <span key={x.ingKey} className={`mr-2 inline-block rounded border px-1 ${CLASSE_NIVEL[x.nivel] || ""}`}>{x.nome} {fmt(x.de)} → {fmt(x.para)} %</span>
            ))}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Até {MAX_MEMBROS} amostras por lote. Quem alterou cada número fica registrado automaticamente ao salvar.</p>
      </section>

      {dialogo?.tipo === "adicionar" && (
        <NovoIngredienteLote ingredientes={form.ingredientes} ativos={ativos} codigoDe={cod} onFechar={() => setDialogo(null)} onAdicionar={(ing, pct, alvos) => {
          mudar((f) => {
            const k = proximaChave(f.ingredientes);
            const celulas = { ...f.celulas };
            if (pct > 0) for (const r of alvos) celulas[r] = { ...(celulas[r] || {}), [k]: String(pct) };
            return { ...f, ingredientes: { ...f.ingredientes, [k]: ing }, celulas };
          });
          setDialogo(null);
          toast.info(pct > 0 ? `${ing.nome} entrou com ${pct} % em ${alvos.length === ativos.length ? "todas as amostras" : alvos.map(cod).join(", ")} — confira os 100 % e salve.`
            : `${ing.nome} entrou com 0 % — preencha nas amostras e salve.`);
        }} />
      )}
      {dialogo?.tipo === "gramas" && (
        <GramasDialog faltam={semGramas} membros={lote.membros} codigoDe={cod} onFechar={() => setDialogo(null)}
          onConfirmar={(g) => { setDialogo(null); concluir(g); }} />
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
