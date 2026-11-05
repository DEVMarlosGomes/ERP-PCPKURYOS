/* Painel "Amostras deste projeto" na Overview do P&D (LM-06, spec 2026-11-04 §10).
 * Lista as variações do projeto com caixinha e o motivo de quem não pode entrar; com 2 a 20 marcadas,
 * "Manipular em lote" cria o rascunho e abre a matriz. Também lista os lotes do projeto. */
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { formatApiError } from "@/lib/formatError";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combine, Loader2 } from "lucide-react";
import { MAX_MEMBROS, MIN_MEMBROS, ROTULO_STATUS_LOTE, ROTULO_STATUS_PD, podeManipularLote } from "@/lib/manipulacaoLote";
import EditorLote from "./EditorLote";
import OrdemLote from "./OrdemLote";

export const COR_STATUS_LOTE = {
  rascunho: "bg-slate-500/10 text-slate-700 border-slate-300",
  gerando_ordem: "bg-blue-500/10 text-blue-700 border-blue-300",
  ordem_gerada: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300",
  manipulado: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-300",
  cancelado: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-300",
};

/* Abre um lote: carrega o detalhe e mostra o editor (rascunho) ou a ordem (depois). */
export function LoteDialog({ loteId, user, onClose }) {
  const [detalhe, setDetalhe] = useState(null);
  const [erro, setErro] = useState("");
  const recarregar = useCallback(async () => {
    try {
      const { data } = await api.get(`/pd/manipulacao-lotes/${encodeURIComponent(loteId)}`);
      setDetalhe(data);
      setErro("");
      return data;
    } catch (e) { setErro(formatApiError(e)); return null; }
  }, [loteId]);
  useEffect(() => { recarregar(); }, [recarregar]);
  const lote = detalhe?.lote;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-none sm:rounded-xl sm:border" data-testid="lote-dialog" data-lote-workspace="true">
        <DialogHeader className="shrink-0 border-b bg-background px-5 py-4 pr-14 text-left sm:px-6 sm:pr-16">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">P&amp;D · Manipulação em lote</p>
              <DialogTitle className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xl">
                <span className="truncate">{lote?.codigo || "Carregando lote…"}</span>
                {lote && <Badge variant="outline" className={COR_STATUS_LOTE[lote.status] || ""}>{ROTULO_STATUS_LOTE[lote.status] || lote.status}</Badge>}
              </DialogTitle>
              <DialogDescription className="mt-1 truncate">
                {lote ? `${lote.projeto_numero || ""} ${lote.projeto_nome || ""}`.trim() || "Projeto sem identificação" : "Buscando dados e permissões…"}
              </DialogDescription>
            </div>
            {lote && <div className="shrink-0 text-left text-xs text-muted-foreground sm:text-right"><span className="block font-medium text-foreground">Revisão {lote.revisao}</span><span>{Object.values(lote.membros || {}).filter((m) => m?.status_membro !== "removido").length} amostras no lote</span></div>}
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/15 p-4 sm:p-5 lg:p-6" data-testid="lote-workspace-scroll">
          <div className="mx-auto w-full max-w-[1600px]">
            {erro && <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">{erro}</p>}
            {!detalhe && !erro && <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando workspace do lote…</div>}
            {detalhe && lote.status === "rascunho" && <EditorLote detalhe={detalhe} user={user} recarregar={recarregar} />}
            {detalhe && lote.status !== "rascunho" && <OrdemLote detalhe={detalhe} user={user} recarregar={recarregar} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PainelAmostrasProjeto({ projetoId, requestId, user }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [criando, setCriando] = useState(false);
  const [aberto, setAberto] = useState(null);
  const pode = podeManipularLote(user);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get(`/pd/projetos/${encodeURIComponent(projetoId)}/amostras-elegiveis`);
      setDados(data);
      setErro("");
      setSel((s) => new Set([...s].filter((r) => data.amostras.some((a) => a.request_id === r && a.elegivel))));
    } catch (e) { setErro(formatApiError(e)); }
  }, [projetoId]);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">Amostras do projeto: {erro}</p>;
  if (!dados || dados.amostras.length < 2) return null; // lote só faz sentido com várias amostras

  const alternar = (r) => setSel((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n; });
  const elegiveis = dados.amostras.filter((a) => a.elegivel);
  const n = sel.size;
  const podeCriar = pode && n >= MIN_MEMBROS && n <= MAX_MEMBROS;
  const criar = async () => {
    setCriando(true);
    try {
      const { data } = await api.post("/pd/manipulacao-lotes", { projeto_id: projetoId, request_ids: [...sel] });
      toast.success(`Lote ${data.codigo} criado — monte a matriz e salve.`);
      setSel(new Set());
      setAberto(data.id);
      carregar();
    } catch (e) { toast.error(formatApiError(e)); } finally { setCriando(false); }
  };

  return (
    <Card className="mt-4" data-testid="painel-amostras-projeto">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><Combine className="h-4 w-4" />Amostras deste projeto</span>
          <Button size="sm" onClick={criar} disabled={!podeCriar || criando} data-testid="btn-manipular-lote"
            title={!pode ? "A manipulação em lote é do P&D (química) e do ADM." : n < MIN_MEMBROS ? `Marque de ${MIN_MEMBROS} a ${MAX_MEMBROS} amostras.` : ""}>
            {criando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Manipular em lote{n ? ` (${n})` : ""}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Marque de {MIN_MEMBROS} a {MAX_MEMBROS} amostras Abertas ou Em Desenvolvimento para manipular juntas: matriz comum, fragrâncias e
          ajustes por amostra, uma ordem de pesagem só. {elegiveis.length} de {dados.amostras.length} podem entrar agora.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm [&_td]:pr-2">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-8 py-1" /><th className="py-1">Amostra</th><th>Etapa no P&D</th><th>Fórmula</th><th className="hidden sm:table-cell">Por que não entra</th>
            </tr></thead>
            <tbody>
              {dados.amostras.map((a) => (
                <tr key={`${a.sample_id}-${a.variacao_id}`} className={`border-b last:border-0 ${a.request_id === requestId ? "bg-muted/40" : ""}`}>
                  <td className="py-1">
                    <input type="checkbox" aria-label={`Selecionar ${a.codigo}`} disabled={!a.elegivel || !pode} checked={sel.has(a.request_id)}
                      onChange={() => alternar(a.request_id)} data-testid={`sel-${a.request_id || a.variacao_id}`} />
                  </td>
                  <td className="py-1 font-medium">{a.codigo || "—"}{a.request_id === requestId ? <span className="ml-1 text-xs text-muted-foreground">(esta)</span> : null}
                    <div className="text-xs font-normal text-muted-foreground">{a.produto}</div>
                    {!a.elegivel && <div className="text-xs font-normal text-amber-800 dark:text-amber-300 sm:hidden">{a.motivo}</div>}</td>
                  <td>{a.status_pd ? ROTULO_STATUS_PD[a.status_pd] || a.status_pd : "—"}</td>
                  <td>{a.formula ? `v${a.formula.version}${a.formula.locked ? " (travada)" : ""}` : "sem fórmula"}
                    {a.fechamento && !a.fechamento.ok ? <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">não fecha 100 %</span> : null}</td>
                  <td className="hidden text-xs text-muted-foreground sm:table-cell">{a.elegivel ? "" : a.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dados.lotes.length > 0 && (
          <div className="space-y-1" data-testid="lotes-do-projeto">
            <p className="text-xs font-medium">Lotes deste projeto</p>
            {dados.lotes.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{l.codigo}</span>
                <Badge variant="outline" className={COR_STATUS_LOTE[l.status] || ""}>{ROTULO_STATUS_LOTE[l.status] || l.status}</Badge>
                <span className="text-xs text-muted-foreground">{l.membros} amostra(s)</span>
                <Button variant="ghost" size="sm" onClick={() => setAberto(l.id)} data-testid={`abrir-lote-${l.id}`}>Abrir</Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {aberto && <LoteDialog loteId={aberto} user={user} onClose={() => { setAberto(null); carregar(); }} />}
    </Card>
  );
}
