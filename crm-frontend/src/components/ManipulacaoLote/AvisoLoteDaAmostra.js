/* Aba Manipulação (e Custo P&D) da amostra que está num lote aberto (05/11/2026): enquanto o lote está em
 * rascunho a fórmula ainda não existe aqui — ela nasce quando a química clica em "Concluir e enviar para a
 * manipulação" no lote. Sem este aviso a amostra parecia "não ter ido para a manipulação". */
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Layers } from "lucide-react";

const TEXTO = {
  rascunho: (l) => `Esta amostra está no lote ${l.codigo} (rascunho). A fórmula aparece aqui quando o lote for concluído — abra o lote na aba Overview, em "Amostras deste projeto".`,
  gerando_ordem: (l) => `O lote ${l.codigo} está sendo concluído agora; recarregue em alguns segundos para ver a versão nova.`,
  ordem_gerada: (l) => `Esta amostra está no lote ${l.codigo}${l.versao_lote ? ` (versão v${l.versao_lote} criada pelo lote)` : ""}. Pesagem e registro da manipulação são feitos no lote.`,
};

export default function AvisoLoteDaAmostra({ requestId, refreshKey }) {
  const [lote, setLote] = useState(null);
  useEffect(() => {
    let vivo = true;
    if (!requestId) return undefined;
    api.get(`/pd/requests/${encodeURIComponent(requestId)}/lote-aberto`)
      .then(({ data }) => { if (vivo) setLote(data?.lote || null); })
      .catch(() => { if (vivo) setLote(null); }); // aviso é só informação: sem ele a aba continua igual
    return () => { vivo = false; };
  }, [requestId, refreshKey]);
  const texto = lote && TEXTO[lote.status]?.(lote);
  if (!texto) return null;
  return (
    <div role="status" data-testid="aviso-lote-amostra"
      className="mb-3 flex items-start gap-2 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
      <Layers className="mt-0.5 h-4 w-4 shrink-0" /><span>{texto}</span>
    </div>
  );
}
