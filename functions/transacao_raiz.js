"use strict";
/* Substitui a transação do SDK feita na RAIZ do banco (09/11/2026).
 *
 * A transação na raiz manda o banco inteiro de volta ao servidor a cada gravação.
 * Com o merge de 01/11 o banco passou de 16 MB (29,7 MB em 09/11), que é o limite de
 * escrita única do SDK: o servidor derruba a conexão ("disconnect"), agendar carga
 * devolvia 500 e nenhuma OP saía pelo servidor (provado em run_transacao_raiz_emulator_test.js).
 *
 * Aqui o callback é o MESMO da transação (recebe a base, muda no lugar, devolve a base
 * para gravar ou undefined para desistir), mas:
 *   1. uma fila no processo executa uma operação por vez (a API roda num único
 *      processo, o serviço `functions` do compose da VPS);
 *   2. a base é lida do servidor a cada operação (nunca vem null nem de cache);
 *   3. grava só os caminhos que mudaram, num único update de vários caminhos (atômico).
 * Uma trava no próprio banco foi tentada e descartada: a transação da trava desiste
 * olhando o cache local e travava a terceira operação concorrente.
 * Escrita direta de tela em nó que estas funções também escrevem pode cruzar no
 * intervalo entre a leitura e o update (~1 s); os nós críticos (agendamentos_expedicao,
 * expedicoes_comerciais) já são só do servidor pela regra do banco.
 * Se a API passar a rodar em mais de um processo, esta fila deixa de bastar. */

function ehObjeto(v) { return v !== null && typeof v === "object"; }

// Caminhos planos de `antes` → `depois`. Subárvore nova ou trocada de tipo vai inteira;
// chave que sumiu vira null. Nunca gera um caminho e um descendente dele ao mesmo tempo.
function diferencas(antes, depois, prefixo, saida) {
  if (depois === undefined) depois = null;
  if (antes === undefined) antes = null;
  if (ehObjeto(antes) && ehObjeto(depois)) {
    const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
    for (const k of chaves) diferencas(antes[k], depois[k], prefixo ? prefixo + "/" + k : k, saida);
    return saida;
  }
  if (JSON.stringify(antes) !== JSON.stringify(depois)) {
    if (!prefixo) throw new Error("A base inteira não pode ser substituída.");
    saida[prefixo] = depois === null ? null : JSON.parse(JSON.stringify(depois));
  }
  return saida;
}

let fila = Promise.resolve();

async function executar(db, fn) {
  const snap = await db.ref().once("value");
  const base = snap.val() || {};
  // Foto de cada nó de primeiro nível para comparar depois (o callback muda `base` no lugar).
  const fotos = {};
  for (const k of Object.keys(base)) fotos[k] = JSON.stringify(base[k]);
  const resultado = fn(base);
  if (resultado === undefined) return {committed: false, caminhos: 0};
  const depois = resultado || {};
  const updates = {};
  for (const k of new Set([...Object.keys(fotos), ...Object.keys(depois)])) {
    const novo = JSON.stringify(depois[k] === undefined ? null : depois[k]);
    const velho = fotos[k] === undefined ? "null" : fotos[k];
    if (novo === velho) continue;
    diferencas(JSON.parse(velho), JSON.parse(novo), k, updates);
  }
  const n = Object.keys(updates).length;
  if (n) await db.ref().update(updates);
  return {committed: true, caminhos: n};
}

/**
 * @param db  Admin SDK database
 * @param fn  (base) => base | undefined — mesmo contrato do callback da transação
 * @returns {committed: boolean, caminhos: number}
 */
function transacaoRaiz(db, fn) {
  const vez = fila.then(() => executar(db, fn));
  fila = vez.catch(() => null);
  return vez;
}

/* Fila de execução no processo (10/11/2026, Financeiro F5.0). Cada fila roda uma
 * operação por vez: quem lê saldo e grava (baixa, estorno, lote) não cruza com outra
 * operação da MESMA fila entre a leitura e o update. Filas diferentes não se esperam
 * (o financeiro não atrasa a expedição). Erro de uma operação não trava a fila.
 * Mesma premissa da transacaoRaiz: a API roda num único processo. */
function criarFila() {
  let cauda = Promise.resolve();
  return function emFila(fn) {
    const vez = cauda.then(() => fn());
    cauda = vez.catch(() => null);
    return vez;
  };
}

module.exports = {transacaoRaiz, diferencas, criarFila};
