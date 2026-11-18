/* RNC — campos preenchíveis do FOR-QUA-0001 (18/11/2026).

   Pedido do usuário, com o PDF da RNC-2026-013 na mão: "preciso que tenham
   todos os campos na rnc; ainda está no modelo antigo, falta o restante das
   perguntas; insira os campos preenchíveis". O relatório (shared/laudo-cq.js,
   paginaRnc) já tinha TODAS as seções do formulário Word, mas o sistema só
   gravava descrição, ação imediata, causa raiz, ação corretiva, responsável,
   prazo e disposição. Procedimento, evidência, prazo da contenção, as seis
   perguntas Sim/Não, observação, método de análise, risco residual,
   verificação da eficácia e "aprovado por" saíam sempre em branco.

   Onde grava: na própria RNC (`nao_conformidades/{n}`), num bloco
   `formulario`, mais os campos que o encerramento já usa (causaRaiz,
   acaoCorretiva, responsavelAcao, prazoAcao, acaoImediata) -- preencher antes
   adianta o encerramento, que passa a abrir com eles. Depois de CONCLUÍDA,
   causa/plano/disposição ficam como foram encerrados (é o registro da
   tratativa); o que segue editável é o que de fato acontece depois:
   verificação da eficácia, risco residual e aprovação.

   Perguntas Sim/Não têm TRÊS estados (sim, não, sem resposta): resposta
   ausente imprime vazia, nunca "Não" -- regra já adotada em laudo-cq.js.
   Funções puras, testadas em run_rnc_formulario_test.js. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RncFormulario = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Mesmas chaves e textos de PERGUNTAS_CONTENCAO (shared/laudo-cq.js).
  var PERGUNTAS = [
    ['loteBloqueado', 'O lote do produto foi bloqueado no estoque interno?'],
    ['materiaisBloqueados', 'As matérias-primas, granéis e/ou materiais de embalagem envolvidos no desvio foram bloqueados no estoque interno?'],
    ['outrosImpactados', 'Há outros produtos/lotes que podem ter sido impactados pelo mesmo desvio?'],
    ['outrosBloqueados', 'Caso a resposta acima seja "sim", estes itens também foram bloqueados no estoque interno?'],
    ['houveExpedicao', 'Houve expedição do lote reprovado e/ou de outros lotes possivelmente impactados pelo desvio?'],
    ['equipesAvisadas', 'As equipes internas foram avisadas sobre o RNC?']
  ];
  var METODOS = ['5 Porquês', 'Ishikawa', 'FMEA'];
  var PROBABILIDADE = ['Baixa', 'Média', 'Alta'];
  var IMPACTO = ['Baixo', 'Médio', 'Alto'];
  var RESIDUAL = ['Aceitável', 'Não aceitável'];
  var RESULTADOS = ['APROVADO', 'REPROVADO'];

  function txt(v, max) { var s = String(v == null ? '' : v).trim(); return s ? s.slice(0, max || 2000) : null; }
  function dataIso(v) { var s = txt(v, 10); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; }
  function opcao(v, lista) { return lista.indexOf(v) >= 0 ? v : null; }
  // 'SIM' | 'NAO' | true | false -> true/false; o resto -> null (sem resposta).
  function sn(v) { return v === true || v === 'SIM' ? true : v === false || v === 'NAO' ? false : null; }

  /* Entrada da tela -> {erros, formulario, principais}. `rnc` é o registro
     atual (decide o que ainda pode mudar). */
  function normalizar(entrada, rnc) {
    var e = entrada || {}, r = rnc || {}, erros = [];
    var concluida = r.status === 'CONCLUIDA';
    var contencao = {};
    PERGUNTAS.forEach(function(p) { contencao[p[0]] = sn((e.contencao || {})[p[0]]); });
    if (contencao.outrosImpactados !== true && contencao.outrosBloqueados != null) contencao.outrosBloqueados = null;
    var obs = txt(e.observacaoContencao);
    if ((contencao.outrosImpactados === true || contencao.houveExpedicao === true) && !obs) {
      erros.push('Respondeu "Sim" sobre outros lotes impactados ou expedição: liste quais na observação da contenção.');
    }
    var metodo = e.metodo === 'OUTRO' ? txt(e.metodoOutro, 80) : opcao(e.metodo, METODOS);
    if (e.metodo === 'OUTRO' && !metodo) erros.push('Escreva qual método de análise de causa foi usado.');
    var ef = e.eficacia || {};
    var eficacia = {descricao: txt(ef.descricao), resultado: opcao(ef.resultado, RESULTADOS), data: dataIso(ef.data), responsavel: txt(ef.responsavel, 120)};
    if (eficacia.resultado && (!eficacia.data || !eficacia.responsavel)) erros.push('Resultado da verificação da eficácia pede a data e o responsável.');
    if (eficacia.resultado && !eficacia.descricao) erros.push('Descreva como a eficácia foi verificada.');
    var rk = e.risco || {};
    var formulario = {
      procedimento: txt(e.procedimento, 200),
      evidencia: txt(e.evidencia),
      responsavelContencao: txt(e.responsavelContencao, 120),
      prazoContencao: dataIso(e.prazoContencao),
      contencao: contencao,
      observacaoContencao: obs,
      metodo: metodo,
      risco: {probabilidade: opcao(rk.probabilidade, PROBABILIDADE), impacto: opcao(rk.impacto, IMPACTO), residual: opcao(rk.residual, RESIDUAL)},
      eficacia: eficacia,
      aprovadoPor: txt(e.aprovadoPor, 120)
    };
    var principais = {acaoImediata: txt(e.acaoImediata)};
    if (!concluida) {
      principais.causaRaiz = txt(e.causaRaiz);
      principais.acaoCorretiva = txt(e.acaoCorretiva);
      principais.responsavelAcao = txt(e.responsavelAcao, 120);
      principais.prazoAcao = dataIso(e.prazoAcao);
    }
    return {erros: erros, formulario: formulario, principais: principais};
  }

  // Grava numa transação: RNC cancelada não recebe formulário.
  function salvar(dbRef, numero, entrada, autor, agora) {
    if (!numero) return Promise.resolve({ok: false, erro: 'RNC não identificada.'});
    var recusa = null;
    return dbRef.ref('nao_conformidades/' + numero).transaction(function(atual) {
      if (!atual) return atual;
      recusa = null;
      if (atual.status === 'CANCELADA') { recusa = 'RNC cancelada: o formulário não é preenchido.'; return; }
      var n = normalizar(entrada, atual);
      if (n.erros.length) { recusa = n.erros.join(' '); return; }
      Object.keys(n.principais).forEach(function(k) { atual[k] = n.principais[k]; });
      n.formulario.atualizadoEm = agora || new Date().toISOString();
      n.formulario.atualizadoPor = autor || null;
      atual.formulario = n.formulario;
      return atual;
    }).then(function(res) {
      if (!res || !res.committed) return {ok: false, erro: recusa || 'RNC não encontrada. Atualize a tela.'};
      return {ok: true};
    });
  }

  /* Valores para a tela: o que foi gravado; sem resposta gravada, a sugestão
     do sistema (`sugestoes.contencao`, ex.: lote bloqueado lido do estoque). */
  function valoresIniciais(r, sugestoes) {
    var f = (r && r.formulario) || {}, s = sugestoes || {}, c = f.contencao || {}, sc = s.contencao || {};
    var contencao = {}, sugerido = {};
    PERGUNTAS.forEach(function(p) {
      var v = c[p[0]];
      if (v === true || v === false) contencao[p[0]] = v;
      else if (sc[p[0]] === true || sc[p[0]] === false) { contencao[p[0]] = sc[p[0]]; sugerido[p[0]] = true; }
      else contencao[p[0]] = null;
    });
    var metodoOutro = !!f.metodo && METODOS.indexOf(f.metodo) < 0;
    return {
      procedimento: f.procedimento || '', evidencia: f.evidencia || '',
      acaoImediata: (r && r.acaoImediata) || '', responsavelContencao: f.responsavelContencao || s.responsavelContencao || '',
      prazoContencao: f.prazoContencao || '', contencao: contencao, contencaoSugerida: sugerido,
      observacaoContencao: f.observacaoContencao || '',
      metodo: metodoOutro ? 'OUTRO' : (f.metodo || ''), metodoOutro: metodoOutro ? f.metodo : '',
      causaRaiz: (r && r.causaRaiz) || '', acaoCorretiva: (r && r.acaoCorretiva) || '',
      responsavelAcao: (r && r.responsavelAcao) || '', prazoAcao: (r && r.prazoAcao) || '',
      risco: Object.assign({probabilidade: '', impacto: '', residual: ''}, f.risco || {}),
      eficacia: Object.assign({descricao: '', resultado: '', data: '', responsavel: ''}, f.eficacia || {}),
      aprovadoPor: f.aprovadoPor || ''
    };
  }

  /* Campos do documento (LaudoCQ.paginaRnc) a partir do formulário. A
     resposta gravada vence a sugestão do sistema; sem nenhuma, fica vazia. */
  function paraDocumento(r, sugestoes) {
    var f = (r && r.formulario) || {}, sc = (sugestoes || {}).contencao || {}, c = f.contencao || {};
    var contencao = {};
    PERGUNTAS.forEach(function(p) {
      var v = c[p[0]];
      contencao[p[0]] = v === true || v === false ? v : (sc[p[0]] === true || sc[p[0]] === false ? sc[p[0]] : undefined);
    });
    return {
      procedimento: f.procedimento || null,
      evidencia: f.evidencia || null,
      responsavelAcaoImediata: f.responsavelContencao || null,
      prazoAcaoImediata: f.prazoContencao || null,
      contencao: contencao,
      observacaoContencao: f.observacaoContencao || null,
      metodo: f.metodo || null,
      risco: f.risco || {},
      eficacia: f.eficacia || {},
      aprovadoPor: f.aprovadoPor || null
    };
  }

  // Quanto do formulário está preenchido (para o selo na lista).
  function progresso(r) {
    var f = (r && r.formulario) || {}, c = f.contencao || {}, ef = f.eficacia || {}, rk = f.risco || {};
    var itens = [
      !!f.procedimento, !!f.evidencia, !!(r && r.acaoImediata), !!f.responsavelContencao,
      PERGUNTAS.every(function(p) { return p[0] === 'outrosBloqueados' ? c.outrosImpactados !== true || c.outrosBloqueados != null : c[p[0]] === true || c[p[0]] === false; }),
      !!f.metodo, !!(r && r.causaRaiz), !!(r && r.acaoCorretiva), !!(r && r.responsavelAcao), !!(r && r.prazoAcao),
      !!(rk.probabilidade && rk.impacto && rk.residual), !!ef.resultado, !!f.aprovadoPor
    ];
    return {feitos: itens.filter(Boolean).length, total: itens.length};
  }

  return {PERGUNTAS: PERGUNTAS, METODOS: METODOS, PROBABILIDADE: PROBABILIDADE, IMPACTO: IMPACTO, RESIDUAL: RESIDUAL,
    normalizar: normalizar, salvar: salvar, valoresIniciais: valoresIniciais, paraDocumento: paraDocumento, progresso: progresso};
});
