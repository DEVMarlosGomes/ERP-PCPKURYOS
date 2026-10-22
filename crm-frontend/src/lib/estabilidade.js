/* Estabilidade em sequência (PLANO_PD_CRM_AJUSTES.md, Fase 6).
 *
 * Pedido do usuário (15/10/2026): não escolher o checkpoint livremente; preencher
 * um por vez, completo; preenche o D24h, espera 24 h para liberar o D48h, e assim
 * por diante. Regras:
 *   - o próximo checkpoint é o primeiro DEPOIS do último registrado (a sequência
 *     anda para frente; buraco antigo fica como "não registrado", não trava);
 *   - ele libera quando passa, desde a leitura anterior (ou do início do estudo),
 *     a diferença de dias entre os dois checkpoints (D24h→D48h = 24 h; D48h→D7 = 5 d);
 *   - a leitura só grava com todos os parâmetros preenchidos ("N/A" vale para o
 *     que não se aplica);
 *   - ADM pode registrar antes do prazo (atraso de lançamento), nunca fora de ordem.
 * Funções puras: nada aqui lê ou grava no banco. */

const DIA_MS = 24 * 3600 * 1000;

export const rotuloDia = (d) => (d === 1 ? "D24h" : d === 2 ? "D48h" : `D${d}`);

const texto = (v) => String(v ?? "").trim();

export function parametrosFaltando(parametros, valores) {
  return (parametros || []).filter((p) => !texto(valores?.[p.code])).map((p) => p.label);
}

export function proximoCheckpoint({ checkpoints, leituras, iniciadoEm, agora }) {
  const dias = [...new Set((checkpoints || []).map(Number))].filter(Number.isFinite).sort((a, b) => a - b);
  const feitas = new Map((leituras || []).map((l) => [Number(l.day_offset), l]));
  const ultimoDia = Math.max(0, ...[...feitas.keys()].filter((d) => dias.includes(d)));
  const proximo = dias.find((d) => d > ultimoDia);
  const pulados = dias.filter((d) => d < ultimoDia && !feitas.has(d));
  if (proximo === undefined) return { concluido: true, proximo: null, pulados };
  const anterior = ultimoDia ? feitas.get(ultimoDia) : null;
  const base = Date.parse(anterior?.reading_at || iniciadoEm);
  const liberaEm = Number.isFinite(base) ? new Date(base + (proximo - ultimoDia) * DIA_MS).toISOString() : null;
  const faltaMs = liberaEm ? Math.max(0, Date.parse(liberaEm) - Date.parse(agora)) : 0;
  return { concluido: false, proximo, anterior: ultimoDia || null, liberaEm, liberado: faltaMs === 0, faltaMs, pulados };
}

export function formatarEspera(ms) {
  const min = Math.ceil((Number(ms) || 0) / 60000);
  if (min <= 0) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.ceil(min / 60);
  if (h < 48) return `${h} h`;
  const d = Math.floor(h / 24);
  const resto = h % 24;
  return resto ? `${d} d ${resto} h` : `${d} d`;
}

export function validarLeitura({ checkpoints, leituras, iniciadoEm, agora, parametros, dia, valores, admin = false }) {
  const prox = proximoCheckpoint({ checkpoints, leituras, iniciadoEm, agora });
  const d = Number(dia);
  if (prox.concluido) return "Todos os checkpoints desta condição já foram registrados.";
  if (d !== prox.proximo) {
    return (leituras || []).some((l) => Number(l.day_offset) === d)
      ? `${rotuloDia(d)} já registrado. O próximo é o ${rotuloDia(prox.proximo)}.`
      : `Registre um checkpoint por vez: o próximo é o ${rotuloDia(prox.proximo)}.`;
  }
  if (!prox.liberado && !admin) {
    const desde = prox.anterior ? `depois do ${rotuloDia(prox.anterior)}` : "do início do estudo";
    const intervalo = d - (prox.anterior || 0);
    return `${rotuloDia(d)} libera em ${formatarEspera(prox.faltaMs)} (${intervalo === 1 ? "24 h" : `${intervalo} dias`} ${desde}).`;
  }
  const faltando = parametrosFaltando(parametros, valores);
  if (faltando.length) return `Leitura incompleta — preencha todos os parâmetros (use N/A quando não se aplica): ${faltando.join(", ")}.`;
  return null;
}
