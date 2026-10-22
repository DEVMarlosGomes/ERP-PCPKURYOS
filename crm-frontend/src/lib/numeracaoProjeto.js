/* Numeração por projeto (PLANO_PD_CRM_AJUSTES.md, Fase 2.2).
 *
 * Projeto `2026-031`; amostras dentro dele `2026-031-A1`, `A2`…; variações
 * `2026-031-A1-a`, `-b`…; Kickoff acompanha o projeto: `KO-2026-031`.
 * Amostras antigas (`2026-1001`, `AM-00001`) mantêm o número que já têm —
 * renumerar quebraria a rastreabilidade de quem já recebeu amostra.
 * Funções puras: nada aqui lê ou grava no banco. */

export function anoDe(iso) {
  const d = new Date(iso || Date.now());
  return Number.isNaN(d.getTime()) ? new Date().getUTCFullYear() : d.getUTCFullYear();
}

export function formatarNumeroProjeto(ano, sequencia) {
  return `${ano}-${String(sequencia).padStart(3, "0")}`;
}

export const caminhoContadorProjeto = (tenant, ano) => `erp/${tenant}/sequences/projeto_${ano}`;

const PADRAO_PROJETO = /^(\d{4})-(\d{3,})$/;

export function sequenciaDoNumero(numero) {
  const m = PADRAO_PROJETO.exec(String(numero || ""));
  return m ? { ano: Number(m[1]), sequencia: Number(m[2]) } : null;
}

// Índice da próxima amostra do projeto (A1, A2…), olhando as que já seguem o padrão.
export function proximoIndiceAmostra(amostrasDoProjeto, numeroProjeto) {
  const prefixo = `${numeroProjeto}-A`;
  let maior = 0;
  for (const a of amostrasDoProjeto || []) {
    const numero = String(a?.numero_amostra || "");
    if (!numero.startsWith(prefixo)) continue;
    const n = Number(numero.slice(prefixo.length));
    if (Number.isInteger(n) && n > maior) maior = n;
  }
  return maior + 1;
}

export function numeroAmostra(numeroProjeto, indice) {
  return `${numeroProjeto}-A${indice}`;
}

// 0 → a, 25 → z, 26 → aa (mesmo padrão das variações que vieram do Mongo).
export function letraVariacao(indice) {
  let n = Number(indice) || 0;
  let s = "";
  do { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

export function codigoVariacao(numeroDaAmostra, indice) {
  return `${numeroDaAmostra}-${letraVariacao(indice)}`;
}

export function numeroKickoff(numeroProjeto) {
  return `KO-${numeroProjeto}`;
}

// Numeração dos projetos que ainda não têm número: por data de criação, dentro
// de cada ano, continuando depois do maior número já usado naquele ano.
export function planoNumeracaoProjetos(projetos, contadores = {}) {
  const maiorPorAno = { ...contadores };
  for (const p of projetos || []) {
    const seq = sequenciaDoNumero(p?.numero_projeto);
    if (seq) maiorPorAno[seq.ano] = Math.max(Number(maiorPorAno[seq.ano]) || 0, seq.sequencia);
  }
  const semNumero = (projetos || []).filter((p) => p && !sequenciaDoNumero(p.numero_projeto))
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id)));
  const atribuicoes = {};
  for (const p of semNumero) {
    const ano = anoDe(p.created_at);
    maiorPorAno[ano] = (Number(maiorPorAno[ano]) || 0) + 1;
    atribuicoes[p.id] = formatarNumeroProjeto(ano, maiorPorAno[ano]);
  }
  return { atribuicoes, contadores: maiorPorAno };
}
