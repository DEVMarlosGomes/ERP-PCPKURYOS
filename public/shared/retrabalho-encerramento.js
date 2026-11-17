/* ══════════════════════════════════════════════════════════════════════
   ENCERRAMENTO DA OP DE RETRABALHO PELA QUALIDADE (16/11/2026)

   Relato da Roberta (Qualidade): "Como eu faço para concluir? Aqui só dá a
   opção de imprimir as OPs." A OP de retrabalho não tinha caminho de
   conclusão para a Qualidade: mudar status é só do ADM, confirmar é do
   ADM/PCP e fichas/etiquetas exigiam BOM, que o retrabalho não tem.

   Decisão do usuário: "sempre o máximo de informações possível". O
   encerramento registra execução (período, recurso, executores), quantidades
   (retrabalhadas, aprovadas, reprovadas e o destino das reprovadas), perdas
   de material, inspeção, decisão, análise, RNC e registro de retrabalho.

   O que o encerramento NÃO faz, de propósito:
   - não lança produção (produzido*): OP de retrabalho concluída COM produção
     entra na Conferência de PA e viraria palete em dobro -- as unidades já
     foram contadas e paletizadas na OP original (caso 26302/01);
   - não credita pedido e não baixa BOM (a OP nasce sem os dois).
   O resultado fica em ops/{k}/retrabalhoEncerramento, com histórico.

   Funções PURAS. Cópia byte a byte em functions/retrabalho_encerramento.js
   (run_retrabalho_encerramento_test.js confere).
   ══════════════════════════════════════════════════════════════════════ */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RetrabalhoEncerramento = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var DESTINOS_REPROVADAS = {
    DESCARTE: 'Descarte',
    NOVO_RETRABALHO: 'Novo retrabalho',
    RETIDO: 'Retido / quarentena',
    DEVOLUCAO: 'Devolução ao fornecedor/cliente',
    OUTRO: 'Outro (descrever)'
  };
  var DECISOES = {
    LIBERADO: 'Liberado',
    LIBERADO_COM_RESTRICAO: 'Liberado com restrição',
    REPROVADO: 'Reprovado'
  };
  var FINAIS = ['Concluído', 'Cancelado'];

  function texto(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 500); }
  function inteiro(v) {
    if (v === '' || v == null) return null;
    var n = Number(v);
    return Number.isSafeInteger(n) && n >= 0 ? n : NaN;
  }
  function decimal(v) {
    if (v === '' || v == null) return null;
    var n = Number(String(v).replace(',', '.'));
    return isFinite(n) && n >= 0 ? n : NaN;
  }
  function papeis(user) {
    if (!user) return [];
    return [user.role].concat(Object.keys(user.funcoes || {}).filter(function(f) { return user.funcoes[f] === true; }));
  }
  // Qualidade (papel, função ou módulo), PCP e ADM encerram ou cancelam.
  function podeEncerrar(user) {
    if (!user) return false;
    return papeis(user).some(function(p) { return p === 'admin' || p === 'pcp' || p === 'qualidade'; }) ||
      !!(user.modulos && user.modulos.qualidade === true);
  }
  function ehRetrabalho(op) { return !!op && op.tipoOrdem === 'RETRABALHO'; }
  function encerravel(op) { return ehRetrabalho(op) && FINAIS.indexOf(op.status) === -1; }

  function dataValida(v) { var t = Date.parse(v); return isFinite(t) ? t : null; }

  /* Confere e normaliza o que a tela mandou. Devolve {ok, erros, avisos, dados}. */
  function validar(op, d, agora) {
    var e = [], avisos = [];
    d = d || {};
    if (!ehRetrabalho(op)) e.push('Esta OP não é de retrabalho.');
    else if (FINAIS.indexOf(op.status) !== -1) e.push('Esta OP de retrabalho já está ' + String(op.status).toLowerCase() + '.');
    var ini = dataValida(d.dataInicio), fim = dataValida(d.dataFim), now = dataValida(agora) || Date.now();
    if (ini == null) e.push('Informe quando o retrabalho começou.');
    if (fim == null) e.push('Informe quando o retrabalho terminou.');
    if (ini != null && fim != null && fim < ini) e.push('O fim do retrabalho não pode ser antes do início.');
    if (fim != null && fim > now + 5 * 60 * 1000) e.push('O fim do retrabalho não pode estar no futuro.');
    var executores = texto(d.executores, 300);
    if (!executores) e.push('Informe quem executou o retrabalho.');
    var qtd = inteiro(d.qtdRetrabalhada), apr = inteiro(d.qtdAprovada), rep = inteiro(d.qtdReprovada);
    if (!(qtd > 0)) e.push('Informe quantas unidades foram retrabalhadas.');
    if (apr == null || isNaN(apr)) e.push('Informe quantas unidades foram aprovadas (0 se nenhuma).');
    if (rep == null || isNaN(rep)) e.push('Informe quantas unidades foram reprovadas (0 se nenhuma).');
    var aprOk = typeof apr === 'number' && apr >= 0, repOk = typeof rep === 'number' && rep >= 0;  // null >= 0 é true em JS
    if (qtd > 0 && aprOk && repOk && apr + rep !== qtd)
      e.push('Aprovadas (' + apr + ') + reprovadas (' + rep + ') precisam fechar as ' + qtd + ' retrabalhadas.');
    var destino = texto(d.destinoReprovadas, 40), destinoObs = texto(d.destinoReprovadasObs, 500);
    if (rep > 0 && !DESTINOS_REPROVADAS[destino]) e.push('Informe o destino das ' + rep + ' unidades reprovadas.');
    if (rep > 0 && destino === 'OUTRO' && !destinoObs) e.push('Descreva o destino das unidades reprovadas.');
    var decisao = texto(d.decisao, 40);
    if (!DECISOES[decisao]) e.push('Informe a decisão da Qualidade.');
    if (decisao === 'LIBERADO' && rep > 0) avisos.push('Decisão "Liberado" com unidades reprovadas: as reprovadas seguem o destino informado.');
    if (decisao === 'REPROVADO' && apr > 0) e.push('Decisão "Reprovado" com unidades aprovadas não fecha: use "Liberado com restrição" ou ajuste as quantidades.');
    var analise = texto(d.analise, 2000);
    if (analise.length < 10) e.push('Registre a análise da Qualidade (o que foi verificado e com que resultado).');
    var restricao = texto(d.restricao, 1000);
    if (decisao === 'LIBERADO_COM_RESTRICAO' && !restricao) e.push('Descreva a restrição da liberação.');
    var perdas = [];
    (Array.isArray(d.perdas) ? d.perdas : []).forEach(function(p, i) {
      p = p || {};
      var mat = texto(p.material, 160), q = decimal(p.quantidade);
      if (!mat && (q == null || q === 0) && !texto(p.motivo)) return; // linha vazia
      if (!mat) e.push('Perda ' + (i + 1) + ': informe o material.');
      if (!(q > 0)) e.push('Perda ' + (i + 1) + ': informe a quantidade perdida.');
      perdas.push({material: mat, quantidade: q > 0 ? q : 0, unidade: texto(p.unidade, 12) || 'un', motivo: texto(p.motivo, 300)});
    });
    if (perdas.length > 30) e.push('No máximo 30 linhas de perda.');
    if (qtd > 0 && op && Number(op.qtdPlanejada) > 0 && qtd > Number(op.qtdPlanejada))
      avisos.push('Foram retrabalhadas mais unidades (' + qtd + ') do que o planejado na OP (' + op.qtdPlanejada + ').');
    var dados = {
      dataInicio: ini != null ? new Date(ini).toISOString() : null,
      dataFim: fim != null ? new Date(fim).toISOString() : null,
      duracaoMin: ini != null && fim != null ? Math.round((fim - ini) / 60000) : null,
      recurso: texto(d.recurso, 80) || (op && op.linha) || '',
      executores: executores,
      qtdRetrabalhada: qtd > 0 ? qtd : 0,
      qtdAprovada: aprOk ? apr : 0,
      qtdReprovada: repOk ? rep : 0,
      destinoReprovadas: rep > 0 ? destino : null,
      destinoReprovadasObs: rep > 0 ? (destinoObs || null) : null,
      perdas: perdas.length ? perdas : null,
      inspecao: texto(d.inspecao, 1000) || null,
      amostragem: texto(d.amostragem, 300) || null,
      decisao: decisao,
      restricao: decisao === 'LIBERADO_COM_RESTRICAO' ? restricao : null,
      analise: analise,
      rncVinculada: texto(d.rncVinculada, 60) || null,
      registroRetrabalho: texto(d.registroRetrabalho, 80) || null,
      observacoes: texto(d.observacoes, 2000) || null
    };
    return {ok: !e.length, erros: e, avisos: avisos, dados: dados};
  }

  /* Caminhos a gravar (update plano). ctx: {opKey, autor, uid, agora, operacaoId}. */
  function planoEncerrar(op, d, ctx) {
    var v = validar(op, d, ctx.agora);
    if (!v.ok) { var erro = new Error(v.erros.join(' ')); erro.code = 'failed-precondition'; throw erro; }
    var enc = Object.assign({}, v.dados, {
      encerradoEm: ctx.agora, encerradoPor: ctx.autor, encerradoPorUid: ctx.uid, operacaoId: ctx.operacaoId,
      avisos: v.avisos.length ? v.avisos : null,
      // O que NÃO aconteceu, explícito para quem audita.
      efeitos: 'Sem lançamento de produção, sem crédito ao pedido, sem baixa de BOM e sem palete novo.'
    });
    var base = 'ops/' + ctx.opKey + '/';
    var u = {};
    u[base + 'status'] = 'Concluído';
    u[base + 'retrabalhoEncerramento'] = enc;
    if (!op.dataInicioReal) u[base + 'dataInicioReal'] = enc.dataInicio;
    if (!op.dataFimReal) u[base + 'dataFimReal'] = enc.dataFim;
    u[base + 'historicoRetrabalho/' + ctx.operacaoId] = {acao: 'ENCERRAR', em: ctx.agora, por: ctx.autor, statusAntes: op.status || null,
      decisao: enc.decisao, qtdRetrabalhada: enc.qtdRetrabalhada, qtdAprovada: enc.qtdAprovada, qtdReprovada: enc.qtdReprovada};
    return {updates: u, encerramento: enc};
  }

  function planoCancelar(op, d, ctx) {
    if (!ehRetrabalho(op)) throw Object.assign(new Error('Esta OP não é de retrabalho.'), {code: 'failed-precondition'});
    if (FINAIS.indexOf(op.status) !== -1) throw Object.assign(new Error('Esta OP de retrabalho já está ' + String(op.status).toLowerCase() + '.'), {code: 'failed-precondition'});
    var motivo = texto((d || {}).motivo, 1000);
    if (motivo.length < 10) throw Object.assign(new Error('Explique o motivo do cancelamento (ex.: retrabalho documentado no registro RR-…).'), {code: 'failed-precondition'});
    if (Number(op.produzidoLinha || 0) + Number(op.produzidoRotulagem || 0) + Number(op.produzidoPosto || 0) > 0)
      throw Object.assign(new Error('Esta OP já tem produção apontada. Encerre-a com as quantidades em vez de cancelar.'), {code: 'failed-precondition'});
    var base = 'ops/' + ctx.opKey + '/';
    var u = {};
    u[base + 'status'] = 'Cancelado';
    u[base + 'canceladoEm'] = ctx.agora;
    u[base + 'canceladoPor'] = ctx.autor;
    u[base + 'motivoCancelamento'] = motivo;
    u[base + 'historicoRetrabalho/' + ctx.operacaoId] = {acao: 'CANCELAR', em: ctx.agora, por: ctx.autor, statusAntes: op.status || null, motivo: motivo};
    return {updates: u};
  }

  return {DESTINOS_REPROVADAS: DESTINOS_REPROVADAS, DECISOES: DECISOES, podeEncerrar: podeEncerrar,
    encerravel: encerravel, validar: validar, planoEncerrar: planoEncerrar, planoCancelar: planoCancelar};
});
