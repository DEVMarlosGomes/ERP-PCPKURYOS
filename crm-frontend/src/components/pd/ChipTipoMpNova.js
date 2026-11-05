/* Chip do tipo da MP nova (MPGR ↔ MPES): o mesmo na aba Manipulação e no lote. */
import { RefreshCw } from "lucide-react";
import { TIPOS_MP_NOVA } from "@/lib/fichaTecnica";

export default function ChipTipoMpNova({ tipo, onTrocar, compacto = false }) {
  return (
    <button type="button" onClick={onTrocar} title="Trocar o tipo da MP nova (MPGR ↔ MPES)" aria-label={`Tipo da MP nova: ${tipo}. Clique para trocar.`}
      className={`inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 ${compacto ? "h-5 px-1.5 text-[10px]" : "h-7 px-2.5 text-xs"}`}
      data-testid="chip-tipo-mp-nova">
      {tipo}{compacto ? "" : ` · ${TIPOS_MP_NOVA[tipo]}`} <RefreshCw className="h-2.5 w-2.5" />
    </button>
  );
}
