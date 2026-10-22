import { AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CODIGO_FORMULA_NAO_FECHA } from "@/lib/fechamentoFormula";

// Corpo do 422 do adaptador (erroNaoFecha) ou null quando o erro é outro.
export function detalheNaoFecha(err) {
  const detail = err?.response?.data?.detail;
  return detail && typeof detail === "object" && detail.codigo === CODIGO_FORMULA_NAO_FECHA ? detail : null;
}

/* AMO-03: popup vermelho quando fórmula ou variante não fecha 100%.
 * `detalhe` = { linhas[], responsavel }. Com `onSalvarRascunho`, oferece salvar o lote como
 * rascunho (a conclusão continua travada); sem ele, só fecha. */
export default function FechamentoFormulaDialog({ detalhe, onClose, onSalvarRascunho }) {
  return (
    <AlertDialog open={Boolean(detalhe)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent className="border-red-500 border-2" data-testid="popup-fechamento-100">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" /> A fórmula não fecha 100%
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <ul className="space-y-1 rounded-md border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {(detalhe?.linhas || []).map((l) => <li key={l}>• {l}</li>)}
              </ul>
              <p className="text-foreground">
                Complete a fórmula antes de concluir. <b>A correção é responsabilidade da Química</b>
                {detalhe?.responsavel ? <> — formulador: <b>{detalhe.responsavel}</b></> : null}. O sistema não completa a diferença sozinho.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {onSalvarRascunho ? (
            <>
              <AlertDialogCancel>Voltar e corrigir</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={onSalvarRascunho}>Salvar como rascunho</AlertDialogAction>
            </>
          ) : (
            <AlertDialogAction className="bg-red-600 hover:bg-red-700">Entendi</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
