/*
 * A conclusão nunca pode depender de um indicador visual de "alterado".
 * A tela é a fonte do clique: primeiro persiste exatamente o que está nela e
 * somente depois usa a revisão devolvida pelo salvamento para gerar a ordem.
 */
export async function salvarAntesDeConcluirLote({ salvar, gerar }) {
  const salvo = await salvar();
  const pendencias = salvo?.pendencias || [];
  if (pendencias.length) return { salvo, pendencias, ordem: null };

  const revisao = salvo?.lote?.revisao;
  const ordem = await gerar(revisao);
  return { salvo, pendencias: [], ordem };
}
