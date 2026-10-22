/* Painel do dólar ao vivo (PLANO_PD_CRM_AJUSTES.md, Fase 5): taxa vigente com spread,
 * quando atualizou, aviso de cotação velha e, para o ADM, o spread editável. */
import { useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/crmRules";
import { formatApiError } from "@/lib/formatError";
import { publicarCambio, useCambio } from "@/lib/useCambio";

const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export default function CambioPainel({ compacto = false }) {
  const cambio = useCambio();
  const { user } = useAuth();
  const [spread, setSpread] = useState("");
  const [salvando, setSalvando] = useState(false);
  if (!cambio) return null;

  const salvarSpread = async () => {
    setSalvando(true);
    try {
      const { data } = await api.put("/config/cambio/spread", { spread });
      publicarCambio(data);
      setSpread("");
      toast.success(`Spread de ${data.spread}% aplicado: dólar a R$ ${brl(data.taxa)}`);
    } catch (err) { toast.error(formatApiError(err) || "Erro ao salvar o spread"); }
    finally { setSalvando(false); }
  };

  if (!cambio.disponivel) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        Dólar ao vivo ainda sem cotação{cambio.erro ? ` (${cambio.erro})` : ""}. As fórmulas usam a cotação gravada nelas.
      </div>
    );
  }
  const hora = cambio.atualizadoEm ? new Date(cambio.atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1 ${cambio.velho ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-muted/30 text-foreground"}`} data-testid="cambio-painel">
      <span><b>Dólar:</b> R$ {brl(cambio.taxa)}</span>
      {!compacto && <span className="text-muted-foreground">comercial R$ {brl(cambio.venda)} + spread {cambio.spread}%</span>}
      <span className="text-muted-foreground">atualizado {hora}{cambio.fonte ? ` · ${cambio.fonte}` : ""}</span>
      {cambio.velho && <span className="font-semibold">Cotação sem atualizar há mais de 1 h — confira antes de enviar preço.</span>}
      {isAdmin(user) && !compacto && (
        <span className="flex items-center gap-1 ml-auto">
          <input value={spread} onChange={(e) => setSpread(e.target.value)} placeholder={`spread ${cambio.spread}%`} className="h-6 w-24 rounded border bg-background px-2 text-xs" aria-label="Spread do dólar (%)" />
          <button type="button" onClick={salvarSpread} disabled={salvando || spread === ""} className="h-6 rounded border px-2 font-medium hover:bg-muted disabled:opacity-50">Aplicar spread</button>
        </span>
      )}
    </div>
  );
}
