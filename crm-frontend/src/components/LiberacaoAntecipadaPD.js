import { Clock, ShieldCheck, ShieldX, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { formatApiError } from "@/lib/formatError";
import { MIN_TEXTO, STATUS_LIBERACAO, textoDecisao } from "@/lib/liberacaoAntecipada";

/* P&D: pedir à diretoria para entregar a amostra ao Comercial antes do D48h (já com o D24h) e ver
 * a situação do pedido — aguardando, aprovada (quem, quando, por quê) ou recusada. */
export default function LiberacaoAntecipadaPD({ req, podeEditar, onFeito }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (!req) return null;
  const lib = req.liberacao_antecipada;
  const aguardando = lib?.status === "aguardando_diretoria";
  const podePedir = podeEditar && req.status === "IN_TESTS" && !aguardando;

  const pedir = async () => {
    setEnviando(true);
    try {
      await api.post(`/pd/requests/${req.id}/liberacao-antecipada`, { motivo });
      toast.success("Pedido enviado à diretoria. Aparece no CRM › Projetos para aprovação.");
      setAberto(false);
      setMotivo("");
      onFeito?.();
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setEnviando(false);
    }
  };

  const cor = aguardando ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
    : lib?.status === "aprovada" ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
      : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200";
  const Icone = aguardando ? Clock : lib?.status === "aprovada" ? ShieldCheck : ShieldX;

  return (
    <>
      {lib && (lib.status !== "recusada" || req.status === "IN_TESTS") && (
        <div className={`mt-4 flex items-start gap-3 rounded-lg border p-3 ${cor}`} data-testid="liberacao-antecipada">
          <Icone className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{STATUS_LIBERACAO[lib.status] || lib.status}</p>
            <p className="mt-0.5 text-xs">Pedido por {lib.solicitada_por_nome} com {(lib.leituras_no_pedido || []).join(", ") || "—"}: {lib.motivo}</p>
            {lib.decisao && <p className="mt-0.5 text-xs font-medium">{textoDecisao(lib)}</p>}
          </div>
        </div>
      )}
      {podePedir && (
        <div className="mt-3">
          <Button size="sm" variant="outline" className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => setAberto(true)} data-testid="pedir-liberacao">
            <Send className="h-3.5 w-3.5" /> Enviar ao Comercial antes do D48h (aprovação da diretoria)
          </Button>
        </div>
      )}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Liberação antecipada para o Comercial</DialogTitle>
            <DialogDescription>
              Com o D24h registrado, a amostra pode ir ao Comercial antes do D48h se a diretoria aprovar. O estudo de estabilidade continua normalmente.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Por que enviar antes do D48h? *</Label>
            <Textarea rows={4} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ex.: cliente apresenta a linha na feira de sexta; D24h sem alteração de aspecto, cor, odor e pH" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={enviando || motivo.trim().length < MIN_TEXTO} onClick={pedir}>Enviar à diretoria</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
