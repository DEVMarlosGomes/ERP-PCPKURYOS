'use strict';
/* Devolver OP à produção (10/11/2026, OP 26309/04).

   Caso real: a rotulagem/envase recebeu "Fechamento OP" por engano e a OP
   saiu da produção (status "Aguardando Confirmação" e/ou etapa esperando o
   PCP em ops/{op}/confirmacaoEtapas). O PCP precisa trazê-la de volta e
   programá-la numa linha de envase, com justificativa.

   O que a devolução FAZ (tudo dentro de ops/{op}, numa transação do nó):
     - status volta a "Em Produção" (já envasou algo) ou "Programado" (nada envasado);
     - a confirmação da etapa fechada por engano sai de confirmacaoEtapas (o PCP
       não confirma mais o que não aconteceu); o valor anterior fica guardado no
       histórico desta devolução;
     - programa a OP: linha, dataInicioPlanejada e dataFimPlanejada (horário de
       Brasília, fuso fixo -03:00, o mesmo da Grade/reprogramação);
     - emFila sai (a OP volta a ser alocável);
     - grava ops/{op}/historicoAlteracoes/{requestId} com quem, quando, de/para
       e a justificativa (mínimo 60 caracteres). Mesmo requestId = repetição,
       não aplica duas vezes.

   O que ela NÃO desfaz, de propósito:
     - apontamentos (registros/): o histórico do que foi lançado fica intacto;
       quantidades erradas se corrigem no Histórico (Editar), como sempre;
     - produzidoLinha/produzidoRotulagem: refletem o que foi apontado. O próximo
       fechamento por total do setor recalcula o delta contra eles;
     - baixas de estoque e empenhos já feitos (Dia D: saldo não é base de decisão);
     - e-mail de OP encerrada já enviado.
   OP Concluída por engano também volta (confirmadoPor/confirmadoEm e a trava
   manual de status saem; ficam no histórico). Cancelada não volta por aqui. */

const ETAPAS = {envase: 'Envase', rotulagem: 'Rotulagem'};
const MIN_JUSTIFICATIVA = 60;
const FUSO = '-03:00';

function falhar(msg) { throw Object.assign(new Error(msg), {code: 'failed-precondition'}); }
function texto(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 1000); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function horarioPlanejado(data, hora, duracaoHoras) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) falhar('Escolha a data da realocação.');
  if (!/^\d{2}:\d{2}$/.test(String(hora || ''))) falhar('Escolha a hora de início.');
  const dur = num(duracaoHoras);
  if (!(dur >= 0.25 && dur <= 72)) falhar('Duração entre 15 min e 72 h.');
  const ini = new Date(data + 'T' + hora + ':00' + FUSO);
  if (isNaN(ini.getTime())) falhar('Data ou hora inválida.');
  return {inicio: ini.toISOString(), fim: new Date(ini.getTime() + Math.round(dur * 60) * 60000).toISOString()};
}

/* op: valor atual de ops/{opKey}; dados: {requestId, etapa, linha, data, hora,
   duracaoHoras, justificativa}; ctx: {linhas:[...], autor, uid, agora}.
   Devolve {repetida} ou {patch, aviso, resumo}: patch são caminhos relativos a
   ops/{opKey} (planos; null apaga). */
function prepararDevolucao(op, dados, ctx) {
  dados = dados || {};
  ctx = ctx || {};
  const requestId = String(dados.requestId || '');
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestId)) falhar('Identificador da operação inválido. Reabra a janela.');
  if (!op) falhar('OP não encontrada.');
  const hist = op.historicoAlteracoes || {};
  if (hist[requestId]) return {repetida: true, resumo: hist[requestId]};

  const justificativa = texto(dados.justificativa, 1000);
  if (justificativa.length < MIN_JUSTIFICATIVA) falhar('Justificativa com pelo menos ' + MIN_JUSTIFICATIVA + ' caracteres (tem ' + justificativa.length + ').');
  const etapa = String(dados.etapa || '');
  if (!ETAPAS[etapa]) falhar('Escolha a etapa fechada por engano (envase ou rotulagem).');
  const linhas = Array.isArray(ctx.linhas) ? ctx.linhas : Object.values(ctx.linhas || {});
  const linha = texto(dados.linha, 80);
  if (!linhas.includes(linha)) falhar('Escolha uma linha de envase cadastrada.');

  const status = String(op.status || '');
  if (status === 'Cancelado') falhar('OP cancelada não volta à produção.');
  if (op.abertaDesde) falhar('A OP está aberta na ' + (op.abertaLinha || 'linha') + '. Ela já está em produção.');

  // Concluída por engano (10/11/2026, 26309/04): também volta. A conclusão só
  // grava status/confirmadoPor/confirmadoEm (e libera a sobra do empenho);
  // esses campos saem e o valor anterior fica no histórico.
  const concluida = status === 'Concluído';
  const etapaAntes = (op.confirmacaoEtapas || {})[etapa] || null;
  if (!concluida && status !== 'Aguardando Confirmação' && !etapaAntes) {
    falhar('A OP não foi fechada no ' + ETAPAS[etapa].toLowerCase() + ': não há o que devolver. Para só programar, use a Grade de OPs.');
  }

  const horario = horarioPlanejado(dados.data, dados.hora, dados.duracaoHoras);
  if (Date.parse(horario.fim) <= Date.parse(ctx.agora)) falhar('O horário escolhido já passou.');

  const envasado = num(op.produzidoLinha);
  const novoStatus = envasado > 0 ? 'Em Produção' : 'Programado';
  const planejada = num(op.qtdPlanejada);
  const avisos = [];
  if (planejada > 0 && envasado / planejada >= 0.95) {
    avisos.push('O envase já soma ' + envasado + ' de ' + planejada + ' un (95% ou mais): o próximo apontamento de envase devolve a OP ao PCP. Se a quantidade foi lançada por engano, corrija o apontamento no Histórico.');
  }
  if (concluida) {
    avisos.push('A OP estava concluída: a sobra de empenho liberada na conclusão não volta, e paletes já declarados na Conferência de PA continuam lá.');
  }
  const aviso = avisos.join(' ');

  const resumo = {
    tipo: 'DEVOLUCAO_PRODUCAO', em: ctx.agora, por: ctx.autor || ctx.uid || '', porUid: ctx.uid || '',
    justificativa, etapa,
    de: {status: status || null, linha: op.linha || null, dataInicioPlanejada: op.dataInicioPlanejada || null,
      dataFimPlanejada: op.dataFimPlanejada || null, emFila: op.emFila || null, confirmacaoEtapa: etapaAntes,
      confirmadoPor: op.confirmadoPor || null, confirmadoEm: op.confirmadoEm || null,
      statusManualOverride: op.statusManualOverride || null},
    para: {status: novoStatus, linha, dataInicioPlanejada: horario.inicio, dataFimPlanejada: horario.fim},
    naoDesfeito: 'apontamentos, quantidades produzidas, baixas de estoque e e-mails já enviados'
  };
  if (aviso) resumo.aviso = aviso;

  const patch = {
    status: novoStatus,
    linha,
    dataInicioPlanejada: horario.inicio,
    dataFimPlanejada: horario.fim,
    emFila: null,
    ['confirmacaoEtapas/' + etapa]: null,
    // Status volta ao cálculo automático; conclusão desfeita (fica em "de").
    statusManualOverride: null,
    confirmadoPor: null,
    confirmadoEm: null,
    ['historicoAlteracoes/' + requestId]: resumo
  };
  return {patch, aviso, resumo};
}

/* Aplica o patch (caminhos relativos) num objeto de OP, para uso dentro da transação. */
function aplicarPatch(op, patch) {
  Object.keys(patch).forEach((caminho) => {
    const partes = caminho.split('/');
    let alvo = op;
    for (let i = 0; i < partes.length - 1; i++) {
      if (!alvo[partes[i]] || typeof alvo[partes[i]] !== 'object') alvo[partes[i]] = {};
      alvo = alvo[partes[i]];
    }
    const ultimo = partes[partes.length - 1];
    if (patch[caminho] === null) delete alvo[ultimo];
    else alvo[ultimo] = JSON.parse(JSON.stringify(patch[caminho]));
  });
  return op;
}

module.exports = {ETAPAS, MIN_JUSTIFICATIVA, prepararDevolucao, aplicarPatch, horarioPlanejado};
