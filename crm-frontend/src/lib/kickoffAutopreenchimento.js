/* Kickoff vivo (RFC-001 §7 regra 1; base do KO-02): com o Kickoff nascendo junto com o projeto
 * (D-2), o que o projeto, o cliente, a amostra e a fórmula ganham depois chega ao questionário.
 * Só preenche o que está VAZIO e só em bloco que não foi validado nem congelado — o que alguém
 * digitou nunca é sobrescrito. Linhas de componentes ficam de fora (são estruturadas pela pessoa).
 * Funções puras: nada aqui lê ou grava no banco. */

const vazio = (v) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

// Devolve { questionario, campos: ["bloco0.volume_gramatura", ...] } com o que foi completado.
export function preencherVazios(atual, novo, blocosTravados = []) {
  const travados = new Set(blocosTravados);
  const out = { ...(atual || {}) };
  const campos = [];
  for (const [bloco, dados] of Object.entries(novo || {})) {
    if (travados.has(bloco) || !dados || typeof dados !== "object" || Array.isArray(dados)) continue;
    const destino = { ...(out[bloco] || {}) };
    for (const [campo, valor] of Object.entries(dados)) {
      if (campo === "componentes" || vazio(valor) || !vazio(destino[campo])) continue;
      destino[campo] = valor;
      campos.push(`${bloco}.${campo}`);
    }
    out[bloco] = destino;
  }
  return { questionario: out, campos };
}
