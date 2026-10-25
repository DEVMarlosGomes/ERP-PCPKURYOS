import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { formatApiError } from "@/lib/formatError";
import { MIN_TEXTO } from "@/lib/liberacaoAntecipada";

/* CRM › Projetos, só para ADM (diretoria): amostras que o P&D quer entregar antes do D48h.
 * O modal mostra e grava quem aprova, data/hora e justificativa. */
const paraInputLocal = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
};
const quando = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function LiberacoesDiretoriaPanel({ nomeDoAprovador, onDecidido }) {
  const [lista, setLista] = useState([]);
  const [atual, setAtual] = useState(null);
  const [dataHora, setDataHora] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const carregar = useCallback(() => api.get("/crm/liberacoes-antecipadas").then(({ data }) => setLista(Array.isArray(data) ? data : [])).catch(() => setLista([])), []);
  useEffect(() => { carregar(); }, [carregar]);

  const abrir = (item) => { setAtual(item); setDataHora(paraInputLocal(new Date())); setJustificativa(""); };
  const decidir = async (decisao) => {
    setEnviando(true);
    try {
      await api.post(`/pd/requests/${atual.request_id}/liberacao-antecipada/decisao`, { decisao, justificativa, data_hora: new Date(dataHora).toISOString() });
      toast.success(decisao === "aprovada" ? "Liberação aprovada: a amostra segue para o Comercial." : "Liberação recusada: o P&D continua os testes até o D48h.");
      setAtual(null);
      await carregar();
      onDecidido?.();
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setEnviando(false);
    }
  };

  if (!lista.length) return null;
  const curta = justificativa.trim().length < MIN_TEXTO;
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/20" data-testid="liberacoes-diretoria">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <ShieldCheck className="h-4 w-4" /> Aguardando a diretoria: {lista.length} amostra(s) para liberar antes do D48h
      </p>
      <div className="mt-2 space-y-2">
        {lista.map((item) => (
          <div key={item.request_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2 text-xs">
            <div className="min-w-0">
              <p className="font-medium">{[item.numero_projeto, item.nome_projeto].filter(Boolean).join(" — ") || item.titulo} · {item.cliente_nome}</p>
              <p className="text-muted-foreground">Pedido por {item.liberacao.solicitada_por_nome} em {quando(item.liberacao.solicitada_em)} com {(item.liberacao.leituras_no_pedido || []).join(", ")}: {item.liberacao.motivo}</p>
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={() => abrir(item)}>Decidir</Button>
          </div>
        ))}
      </div>

      <Dialog open={Boolean(atual)} onOpenChange={(o) => { if (!o) setAtual(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Liberação antecipada — aprovação da diretoria</DialogTitle>
            <DialogDescription>
              {atual ? `${[atual.numero_projeto, atual.nome_projeto].filter(Boolean).join(" — ")}: o P&D quer entregar a amostra ao Comercial antes do D48h.` : ""}
            </DialogDescription>
          </DialogHeader>
          {atual && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md bg-muted/50 p-2 text-xs">
                <p><b>Pedido do P&D:</b> {atual.liberacao.motivo}</p>
                <p className="mt-1 text-muted-foreground">{atual.liberacao.solicitada_por_nome} · {quando(atual.liberacao.solicitada_em)} · estabilidade registrada: {(atual.liberacao.leituras_no_pedido || []).join(", ")}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Quem aprova</Label><Input value={nomeDoAprovador || ""} disabled data-testid="liberacao-quem" /></div>
                <div><Label>Data e horário *</Label><Input type="datetime-local" value={dataHora} max={paraInputLocal(new Date())} onChange={(ev) => setDataHora(ev.target.value)} data-testid="liberacao-data" /></div>
              </div>
              <div>
                <Label>Justificativa *</Label>
                <Textarea rows={3} value={justificativa} onChange={(ev) => setJustificativa(ev.target.value)} data-testid="liberacao-justificativa"
                  placeholder="Ex.: D24h estável; cliente precisa da amostra para a apresentação. Comercial avisa que o D48h ainda está em curso." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAtual(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={enviando || curta || !dataHora} onClick={() => decidir("recusada")}>Recusar</Button>
            <Button disabled={enviando || curta || !dataHora} onClick={() => decidir("aprovada")} data-testid="liberacao-aprovar">Aprovar e liberar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
