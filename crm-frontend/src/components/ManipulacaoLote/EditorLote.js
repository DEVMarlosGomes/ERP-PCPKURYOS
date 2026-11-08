/* Editor da matriz do lote (LM-07, spec 2026-11-04 §6/§10). Amostras nas colunas, ingredientes nas
 * linhas, 100 % ao vivo por coluna. Célula diferente da matriz fica marcada só como informação
 * (fragrância lilás, comum âmbar, crítico vermelho) — desde 05/11/2026 o lote NÃO pede comentário:
 * quem alterou cada célula é registrado sozinho no salvamento. Única trava que sobra (D-1): crítico que
 * muda a fórmula ANTERIOR da amostra precisa do "Aprovar" de outra pessoa (ADM ou módulo "Aprovar
 * crítico P&D"). "Concluir e enviar para a manipulação" salva o que estiver na tela e, no servidor, cria a
 * próxima versão EDITÁVEL de cada amostra (V1 para quem não tinha fórmula, V(n+1) para quem tinha) e a
 * amostra vai para "Em Desenvolvimento" no pipeline. Fluxo do Marlos (08/11/2026): o P&D não pesa — a
 * pesagem é da Produção —, então o lote não tem mais gramas, pré-mistura, mínimo pesável nem ordem. */
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { formatApiError } from "@/lib/formatError";
import { salvarAntesDeConcluirLote } from "@/lib/conclusaoLote";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Copy, FlaskConical, Loader2, Plus, Save, ShieldCheck, X } from "lucide-react";
import NovoIngredienteLote from "./NovoIngredienteLote";
import {
  MAX_MEMBROS, MINIMO_PESAVEL_PADRAO_G, NIVEL, ROTULO_STATUS_PD, chaveMaterialFase, clonar, fechamentoPorMembro,
  diferencasDoLote, mudancasCriticasDaOrigem, pendencias, sugereFragrancia,
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
  // Sair com alterações não salvas pede confirmação (742b20d, mantido na volta à versão de 05/11).
  useEffect(() => {
    if (!sujo) return undefined;
    const proteger = (evento) => { evento.preventDefault(); evento.returnValue = ""; };
    window.addEventListener("beforeunload", proteger);
    return () => window.removeEventListener("beforeunload", proteger);
  }, [sujo]);

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
  const cod = (r) => lote.membros[r]?.codigo_amostra || r;
  const foraDos100 = ativos.filter((r) => !fech[r]?.ok);
  const falta = [
    ...(ativos.length < 2 ? ["o lote precisa de pelo menos 2 amostras"] : []),
    ...foraDos100.map((r) => `${cod(r)} fecha ${fmt(fech[r]?.soma)} % (precisa de 100 %)`),
    ...(pend.length ? [`${pend.length} ingrediente(s) crítico(s) para outra pessoa aprovar`] : []),
  ];
  const podeConcluir = pode && !falta.length;
  const podeAprovar = user?.role === "admin" || user?.modulos?.aprovar_critico_pd === true;
  const visiveis = estreito ? [ativos.includes(coluna) ? coluna : ativos[0]] : ativos;
  const nivelDe = (r, k) => (formulaNova(r) ? 0 : (difs[r] || []).find((x) => x.ingKey === k)?.nivel || 0);

  // As versões já existem: uma falha aqui não desfaz a conclusão, só avisa.
  const moverParaEmDesenvolvimento = async (requestIds) => {
    const falhas = [];
    for (const r of requestIds) {
      try {
        await api.put(`/pd/requests/${encodeURIComponent(r)}/status`, { new_status: "IN_PROGRESS", is_backward: false,
          comment: `Desenvolvida no lote ${lote.codigo}` });
      } catch (e) { falhas.push({ r, erro: formatApiError(e) }); }
    }
    return falhas;
  };
  const executar = async (rotulo, fn) => {
    setOcupado(rotulo);
    try { await fn(); } catch (e) { toast.error(formatApiError(e)); } finally { setOcupado(""); }
  };
  // Grava o rascunho e devolve a revisão gravada (a ordem precisa dela).
  const gravarRascunho = async () => {
    const quantidades = Object.fromEntries(Object.entries(form.quantidades).map(([r, q]) => [r, { quantidade_g: num(q.quantidade_g) || null, densidade: num(q.densidade) || null }]));
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
  // Um clique: salva o que está na tela, o servidor cria V1/V(n+1) editável em cada amostra e a
  // amostra que ainda estava "Aberta" passa a "Em Desenvolvimento" pela mesma rota da tela do P&D
  // (que também atualiza o card e a variação no CRM). Sempre grava o estado visível antes (742b20d):
  // o atalho condicionado a `sujo` podia concluir com o lote vazio do servidor.
  const concluir = () => executar("concluir", async () => {
    const resultado = await salvarAntesDeConcluirLote({
      salvar: () => gravarRascunho(),
      gerar: async (revisao) => (await api.post(`/pd/manipulacao-lotes/${lote.id}/gerar-ordem`, { revisao: revisao ?? lote.revisao })).data,
    });
    if (resultado.pendencias.length) {
      toast.error(`Rascunho salvo, mas ainda falta: ${resultado.pendencias.map((p) => `${cod(p.request_id)} · ${p.motivo}`).join(" ")}`);
      await recarregar();
      return;
    }
    const data = resultado.ordem;
    const v = Object.entries(data.versoes || {}).map(([r, x]) => `${cod(r)} v${x?.versao ?? "?"}`).join(", ");
    toast.success(v ? `Enviado para a manipulação: ${v}.` : "Enviado para a manipulação: cada amostra ganhou a próxima versão da fórmula.");
    (data.avisos || []).forEach((a) => toast.warning(a));
    const naoMovidas = await moverParaEmDesenvolvimento(ativos.filter((r) => estado[r]?.status_pd === "OPEN"));
    if (naoMovidas.length) toast.warning(`Não foi possível mover para Em Desenvolvimento: ${naoMovidas.map((x) => `${cod(x.r)} (${x.erro})`).join("; ")}. Mude pelo pipeline.`);
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
        <Button onClick={concluir} disabled={!podeConcluir || Boolean(ocupado)} data-testid="btn-gerar-ordem"
          className="bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          title={falta.length ? `Falta: ${falta.join(" · ")}` : "Cria a próxima versão da fórmula em cada amostra (aba Manipulação) e a coloca em Em Desenvolvimento."}>
          {ocupado === "concluir" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-1 h-4 w-4" />}Concluir e enviar para a manipulação
        </Button>
        <Button variant="outline" onClick={clonarMatrizParaTodas} disabled={!pode}><Copy className="mr-1 h-4 w-4" />Clonar matriz para todas</Button>
        <Button variant="outline" onClick={() => setDialogo({ tipo: "adicionar" })} disabled={!pode}><Plus className="mr-1 h-4 w-4" />Adicionar ingrediente</Button>
        <Button variant="ghost" className="text-red-700 dark:text-red-400" onClick={() => setDialogo({ tipo: "cancelar" })} disabled={!pode}>Cancelar lote</Button>
        {sujo && <span className="text-xs text-amber-700 dark:text-amber-300">Alterações não salvas</span>}
        {!pode && <span className="text-xs text-muted-foreground">Seu perfil só consulta.</span>}
      </div>
      {pode && (
        <p className={`text-sm ${falta.length ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"}`} data-testid="falta-lote" role="status">
          {falta.length ? <><b>Para concluir, falta:</b> {falta.join(" · ")}.</>
            : <>Tudo preenchido. Ao concluir, cada amostra ganha uma versão nova da fórmula na aba Manipulação ({ativos.map((r) => `${cod(r)}: ${lote.membros[r]?.versao_antes ? `depois da v${lote.membros[r].versao_antes}` : "primeira versão"}`).join(" · ")}).</>}
        </p>
      )}

      {/* Sem pesagem no P&D (08/11/2026): saíram excesso de pré-mistura, mínimo pesável e pré-mistura por fase. */}
      <div className="flex flex-wrap items-end gap-4 text-sm">
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
                return (
                  <th key={r} className="min-w-[110px] p-2 text-left font-normal sm:min-w-[130px]">
                    <div className="font-semibold">{cod(r)}</div>
                    <div className="text-xs text-muted-foreground">{ROTULO_STATUS_PD[estado[r]?.status_pd] || estado[r]?.status_pd || ""}{m.versao_antes ? ` · v${m.versao_antes}` : " · sem fórmula"}</div>
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
