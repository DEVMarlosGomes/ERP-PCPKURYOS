/* Acrescenta uma entrada no fim de um histórico em array (historico_movimentacoes de projeto
 * ou cliente) por transação (COM-01/COM-02, 22/10/2026). O padrão antigo regravava o array
 * inteiro a partir do que a tela tinha lido: duas gravações seguidas apagavam uma à outra.
 * A transação relê o valor do servidor e tenta de novo se ele mudou no meio. */
import { ref, runTransaction } from "firebase/database";
import { firebaseDb } from "@/lib/firebase";

export async function acrescentarHistorico(caminho, entrada) {
  const r = await runTransaction(ref(firebaseDb, caminho), (atual) => {
    const lista = Array.isArray(atual) ? atual : (atual && typeof atual === "object" ? Object.values(atual) : []);
    return [...lista, entrada];
  });
  if (!r?.committed) throw new Error(`Não foi possível registrar no histórico (${caminho}). Tente de novo.`);
}
