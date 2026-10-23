import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { formatApiError } from "@/lib/formatError";
import { MIN_O_QUE_ALTERAR, SOLICITANTES } from "@/lib/retrabalhoAprovada";

/* AMO-05: retrabalhar amostra já aprovada. Pergunta o que deve mudar e quem pediu; avisa o que
 * acontece com o Kickoff e o orçamento antes de confirmar. */
export default function RetrabalhoAprovadaModal({ open, onOpenChange, sampleId, variacao, onFeito }) {
  const [oQue, setOQue] = useState("");
  const [quem, setQuem] = useState("cliente");
  const [enviando, setEnviando] = useState(false);
  const curto = oQue.trim().length < MIN_O_QUE_ALTERAR;

  const confirmar = async () => {
    setEnviando(true);
    try {
      const { data } = await api.post(`/crm/samples/${sampleId}/variacoes/${variacao.id}/retrabalho-aprovada`, { o_que_alterar: oQue, solicitado_por: quem });
      const extras = [data.pd_reabertas?.length ? "P&D destravado para a próxima versão" : "", data.kickoff_id ? "Kickoff marcado como desatualizado" : "",
        data.proposta_id ? "orçamento marcado como desatualizado" : ""].filter(Boolean);
      toast.success(`Retrabalho registrado${extras.length ? `: ${extras.join("; ")}` : ""}.`);
      setOQue("");
      onOpenChange(false);
      onFeito?.();
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Retrabalhar amostra aprovada{variacao?.codigo ? ` — ${variacao.codigo}` : ""}</DialogTitle>
          <DialogDescription>
            A aprovação atual vai para o histórico da variação. O P&D abre a próxima versão; o Kickoff e o orçamento do projeto ficam
            marcados como desatualizados até serem revisados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>O que deve ser alterado? *</Label>
            <Textarea rows={4} value={oQue} onChange={(ev) => setOQue(ev.target.value)} data-testid="retrabalho-o-que-alterar"
              placeholder="Ex.: fragrância mais suave (reduzir de 1,2% para 0,8%) e cor um tom mais claro" />
            {curto && oQue && <p className="mt-1 text-[11px] text-amber-700">Descreva com pelo menos {MIN_O_QUE_ALTERAR} caracteres.</p>}
          </div>
          <div>
            <Label>Quem pediu *</Label>
            <div className="mt-1 flex gap-2">
              {Object.entries(SOLICITANTES).map(([v, r]) => (
                <button key={v} type="button" onClick={() => setQuem(v)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${quem === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{r}</button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={enviando || curto} onClick={confirmar} data-testid="retrabalho-confirmar">Registrar retrabalho</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
