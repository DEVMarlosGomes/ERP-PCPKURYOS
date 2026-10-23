import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { formatApiError } from "@/lib/formatError";
import { MIN_O_QUE_ALTERAR, textoDesatualizado } from "@/lib/retrabalhoAprovada";

/* AMO-05 / RFC-001 §4: Kickoff ou orçamento baseado em amostra que voltou ao P&D. A marca só sai
 * com nova versão ou com a decisão "revisado, sem impacto" e o porquê. */
export default function DesatualizadoBanner({ desatualizado, urlResolver, oque = "documento", onResolvido }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (!desatualizado) return null;
  const resolver = async () => {
    setEnviando(true);
    try {
      const { data } = await api.post(urlResolver, { motivo });
      toast.success("Revisão registrada.");
      setAberto(false);
      setMotivo("");
      onResolvido?.(data);
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <div className="space-y-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200" data-testid="desatualizado-banner">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong>{oque[0].toUpperCase() + oque.slice(1)} desatualizado.</strong> {textoDesatualizado(desatualizado).replace(/^Desatualizado /, "")}</span>
        </p>
        {urlResolver && !aberto && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAberto(true)}>Revisado, sem impacto</Button>}
      </div>
      {aberto && (
        <div className="flex flex-wrap gap-2">
          <Input className="h-8 min-w-[240px] flex-1 bg-background text-xs" value={motivo} onChange={(ev) => setMotivo(ev.target.value)}
            placeholder={`Por que o ${oque} continua valendo? (mín. ${MIN_O_QUE_ALTERAR} caracteres)`} />
          <Button size="sm" className="h-8" disabled={enviando || motivo.trim().length < MIN_O_QUE_ALTERAR} onClick={resolver}>Registrar</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setAberto(false)}>Cancelar</Button>
        </div>
      )}
    </div>
  );
}
