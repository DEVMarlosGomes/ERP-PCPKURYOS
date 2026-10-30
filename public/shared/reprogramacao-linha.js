/* Reprogramação da linha pelo realizado (PLAN-01, reunião 28/10/2026):
 * "antecipou puxa, atrasou empurra".
 *
 * Hoje a Grade de OPs (planejamento.html) só reencaixa os blocos no arraste
 * (reflowAposArrasto, por colunas de hora de UM dia). Este motor olha o que já
 * aconteceu em cada linha e propõe a nova posição das OPs PROGRAMADAS que vêm
 * depois:
 *  - OP que terminou antes do previsto: as seguintes ENCADEADAS (que estavam
 *    encostadas nela, só com o changeover no meio) puxam para a frente;
 *  - OP atrasada (ainda rodando depois do fim previsto): as programadas que ela
 *    invade empurram, em cadeia.
 * Nada é gravado aqui: a tela mostra a simulação ("N blocos serão movidos") e o
 * PCP confirma; o update sai em caminhos planos (montarUpdates).
 *
 * Regras (decisões travadas do PLANO_PLANEJAMENTO_PCP.md e do ticket):
 *  - Tempo de TRABALHO: a duração de cada OP é medida em minutos úteis do
 *    calendário (turnos de config, pausas, turnos extras, dias da semana,
 *    feriados) e preservada ao mover; passou do fim do expediente, continua na
 *    próxima janela útil (virada de dia, feriado pulado).
 *  - Granularidade de 15 min: todo início movido cai num múltiplo de 15 min
 *    (hora local) -- `granularidadeMin`.
 *  - Changeover por linha: OP movida começa depois do setup dela
 *    (ops/{op}.setupMinutosManual, senão config/setupPadraoPorLinha). Só entra
 *    quando a OP de fato se move -- um plano já encostado sem setup não é
 *    empurrado à toa.
 *  - Travado não se move e vira obstáculo: OP aberta/rodando (o início já
 *    aconteceu), OP terminada, OP na zona fixa de congelamento
 *    (config/congelamento.diasFixos). Bloco movido pula por cima de um
 *    travado no meio; se uma OP atrasada invade uma OP da zona fixa, o motor
 *    NÃO move a da zona fixa -- devolve o CONFLITO para o PCP decidir.
 *  - Programação vencida (OP programada que nem abriu e cujo fim previsto já
 *    passou) fica fora: não se sabe se vai rodar; é decisão do PCP.
 *  - Nunca programa no passado: início movido >= agora.
 *  - Não apaga nem lê alocacoes_planejamento / horizonte.html: mexe só em
 *    ops/{op}/dataInicioPlanejada e dataFimPlanejada.
 *
 * Horário local por fuso fixo (`fusoMin`, padrão −180 = Brasília, sem horário
 * de verão desde 2019) para o motor ser puro e dar o mesmo resultado no
 * navegador, no Node e no ensaio. Funções puras. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReprogramacaoLinha = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var MIN = 60000, DIA_MIN = 1440;
  var FINAIS = {'Concluído': 1, 'Aguardando Confirmação': 1};

  function ms(v) { if (v == null || v === '') return null; var t = typeof v === 'number' ? v : new Date(v).getTime(); return isFinite(t) ? t : null; }
  function iso(t) { return new Date(t).toISOString(); }
  function hm(s) {
    var m = String(s || '').match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ── Calendário de trabalho ─────────────────────────────────────────────
     cfg: {diasSemana:[1..7] (1=seg), feriados:{AAAA-MM-DD:..}, turnos:[nome],
     turnoHorarios, turnoHorariosFim, turnoHorariosFimSexta, turnoPausas{t:{inicio,fim}},
     modoOperacaoTurno, turnoFixoNome, turnosExtras} -- o mesmo de config/ que a
     Grade lê (horasEPausasDoDia), mas em minutos exatos, não em horas cheias. */
  function criarCalendario(cfg, opcoes) {
    var c = Object.assign({}, cfg || {}), fuso = opcoes && opcoes.fusoMin != null ? opcoes.fusoMin : -180;
    // config/planejamento (diasSemana, feriados) vem aninhado quando se passa o nó config inteiro.
    var pl = c.planejamento || {};
    if (!(c.diasSemana && c.diasSemana.length) && pl.diasSemana && pl.diasSemana.length) c.diasSemana = pl.diasSemana;
    if (!c.feriados && pl.feriados) c.feriados = pl.feriados;
    var dias = (c.diasSemana && c.diasSemana.length ? c.diasSemana : [1, 2, 3, 4, 5]).map(Number);
    var memo = {};
    function turnos() {
      if (c.modoOperacaoTurno === 'fixo' && c.turnoFixoNome) return [c.turnoFixoNome];
      return c.turnos && c.turnos.length ? c.turnos : Object.keys(c.turnoHorarios || {});
    }
    function local(t) { var d = new Date(t + fuso * MIN); return {ymd: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), min: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60, dow: d.getUTCDay() === 0 ? 7 : d.getUTCDay()}; }
    function instante(ymd, minuto) { var p = ymd.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) + minuto * MIN - fuso * MIN; }
    function proximoDia(ymd) { var p = ymd.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    function dowDe(ymd) { var p = ymd.split('-').map(Number); var w = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); return w === 0 ? 7 : w; }
    // Janelas úteis do dia: [[iniMin, fimMin)], já sem as pausas.
    function janelas(ymd) {
      if (memo[ymd]) return memo[ymd];
      var dow = dowDe(ymd), ativos = [], pausas = [];
      function intervalo(a, b, lista) { if (a == null || b == null) return; if (b <= a) b = DIA_MIN; lista.push([a, Math.min(b, DIA_MIN)]); }
      if (!(c.feriados && c.feriados[ymd])) {
        if (dias.indexOf(dow) >= 0) {
          turnos().forEach(function(t) {
            var fim = (dow === 5 && c.turnoHorariosFimSexta && c.turnoHorariosFimSexta[t]) || (c.turnoHorariosFim || {})[t];
            intervalo(hm((c.turnoHorarios || {})[t]), hm(fim), ativos);
            var p = (c.turnoPausas || {})[t];
            if (p) intervalo(hm(p.inicio), hm(p.fim), pausas);
          });
        }
        // Turnos extras (sábado extra, 2º turno por N semanas) somam por cima.
        Object.keys(c.turnosExtras || {}).forEach(function(k) {
          var x = c.turnosExtras[k];
          if (!x || !x.dataInicio || !x.dataFim || ymd < x.dataInicio || ymd > x.dataFim) return;
          if (Array.isArray(x.diasSemana) && x.diasSemana.length && x.diasSemana.indexOf(dow) < 0) return;
          intervalo(hm(x.horarioInicio), hm(x.horarioFim), ativos);
          if (x.pausaInicio && x.pausaFim) intervalo(hm(x.pausaInicio), hm(x.pausaFim), pausas);
        });
      }
      ativos.sort(function(a, b) { return a[0] - b[0]; });
      var unidos = [];
      ativos.forEach(function(j) { var u = unidos[unidos.length - 1]; if (u && j[0] <= u[1]) u[1] = Math.max(u[1], j[1]); else unidos.push(j.slice()); });
      pausas.forEach(function(p) {
        var novo = [];
        unidos.forEach(function(j) {
          if (p[1] <= j[0] || p[0] >= j[1]) { novo.push(j); return; }
          if (p[0] > j[0]) novo.push([j[0], p[0]]);
          if (p[1] < j[1]) novo.push([p[1], j[1]]);
        });
        unidos = novo;
      });
      memo[ymd] = unidos;
      return unidos;
    }
    // Primeiro instante útil >= t.
    function proximoUtil(t) {
      var l = local(t), ymd = l.ymd, m = l.min;
      for (var i = 0; i < 400; i++) {
        var js = janelas(ymd);
        for (var k = 0; k < js.length; k++) if (js[k][1] > m) return instante(ymd, Math.max(js[k][0], m));
        ymd = proximoDia(ymd); m = 0;
      }
      return null;
    }
    // t + minutos úteis (o que passa do expediente continua na próxima janela).
    function somarUteis(t, minutos) {
      var resta = minutos, atual = proximoUtil(t);
      if (atual == null) return null;
      if (!(resta > 0)) return atual;
      for (var i = 0; i < 4000; i++) {
        var l = local(atual), js = janelas(l.ymd);
        for (var k = 0; k < js.length; k++) {
          if (js[k][1] <= l.min) continue;
          var ini = Math.max(js[k][0], l.min), livre = js[k][1] - ini;
          if (resta <= livre) return instante(l.ymd, ini + resta);
          resta -= livre;
        }
        atual = proximoUtil(instante(proximoDia(l.ymd), 0));
        if (atual == null) return null;
      }
      return null;
    }
    // Minutos úteis entre a e b (b > a).
    function minutosUteis(a, b) {
      if (a == null || b == null || b <= a) return 0;
      var total = 0, la = local(a), ymd = la.ymd, ultimo = local(b).ymd;
      for (var i = 0; i < 400; i++) {
        var lo = ymd === la.ymd ? la.min : 0, hi = ymd === ultimo ? local(b).min : DIA_MIN;
        janelas(ymd).forEach(function(j) { var x = Math.max(j[0], lo), y = Math.min(j[1], hi); if (y > x) total += y - x; });
        if (ymd === ultimo) break;
        ymd = proximoDia(ymd);
      }
      return Math.round(total * 1000) / 1000;
    }
    // Arredonda para cima até o múltiplo de `g` minutos (hora local).
    function arredondarAcima(t, g) {
      if (!(g > 0)) return t;
      var l = local(t), resto = l.min % g;
      return resto < 1e-9 ? t : t + (g - resto) * MIN;
    }
    return {janelas: janelas, proximoUtil: proximoUtil, somarUteis: somarUteis, minutosUteis: minutosUteis,
      arredondarAcima: arredondarAcima, local: local, instante: instante};
  }

  /* ── OPs -> blocos da linha ─────────────────────────────────────────────
     ctx: {agora, setupPadraoPorLinha, congeladoAte, linhas (nomes, opcional)}
     Bloco: {id, lote, linha, estado: TERMINADA|RODANDO|PROGRAMADA, inicio, fim,
     fimPlanejado, setupMin, movel, motivoFixo} */
  function blocosDasOps(ops, ctx) {
    var c = ctx || {}, agora = ms(c.agora), congeladoAte = ms(c.congeladoAte), saida = [], vencidas = [];
    Object.keys(ops || {}).forEach(function(id) {
      var op = ops[id];
      if (!op || op.status === 'Cancelado') return;
      var linha = op.abertaLinha || op.linha;
      if (!linha || (c.linhas && c.linhas.indexOf(linha) < 0)) return;
      var iniPlan = ms(op.dataInicioPlanejada), fimPlan = ms(op.dataFimPlanejada);
      var iniReal = ms(op.dataInicioReal) || ms(op.abertaDesde);
      var b = {id: id, lote: op.lote || id, produto: op.produto || '', linha: linha, inicioPlanejado: iniPlan, fimPlanejado: fimPlan,
        setupMin: Number(op.setupMinutosManual) > 0 ? Number(op.setupMinutosManual) : (Number((c.setupPadraoPorLinha || {})[linha]) || 0)};
      if (FINAIS[op.status]) {
        // Terminou: o envase fechou (Aguardando Confirmação) ou o PCP confirmou.
        var envase = op.confirmacaoEtapas && op.confirmacaoEtapas.envase;
        var fimReal = ms(envase && envase.fechadoEm) || ms(op.dataFimReal) || fimPlan;
        if (fimReal == null) return;
        saida.push(Object.assign(b, {estado: 'TERMINADA', inicio: iniReal || iniPlan || fimReal, fim: fimReal, movel: false, motivoFixo: 'terminada'}));
        return;
      }
      if (iniReal || op.abertaDesde) {
        // Rodando (ou parada entre turnos): o início já aconteceu. Fim esperado:
        // o previsto, ou agora se já passou dele (estimativa mínima; reavalia a cada rodada).
        var fimEst = Math.max(fimPlan || 0, agora || 0);
        saida.push(Object.assign(b, {estado: 'RODANDO', inicio: iniReal, fim: fimEst, movel: false, motivoFixo: 'em produção',
          atrasada: fimPlan != null && agora != null && agora > fimPlan}));
        return;
      }
      if (iniPlan == null || fimPlan == null) return;
      if (agora != null && fimPlan <= agora) { vencidas.push(Object.assign(b, {estado: 'VENCIDA', inicio: iniPlan, fim: fimPlan})); return; }
      var naZona = congeladoAte != null && iniPlan < congeladoAte;
      saida.push(Object.assign(b, {estado: 'PROGRAMADA', inicio: iniPlan, fim: fimPlan, movel: !naZona, motivoFixo: naZona ? 'zona fixa' : null}));
    });
    return {blocos: saida, vencidas: vencidas};
  }

  /* ── O motor ────────────────────────────────────────────────────────────
     p: {blocos, calendario, agora, granularidadeMin (15)}
     -> {movimentos:[{id, lote, linha, tipo: PUXA|EMPURRA, de:{inicio,fim}, para:{inicio,fim}, deltaMin}],
         conflitos:[{id, lote, linha, sobreposicaoMin, motivo}], gatilhos:[{id, lote, linha, tipo, minutos}]} */
  function reprogramar(p) {
    var cal = p.calendario, g = p.granularidadeMin == null ? 15 : p.granularidadeMin, agora = ms(p.agora);
    var agoraG = agora == null ? null : cal.arredondarAcima(agora, g);
    var porLinha = {};
    (p.blocos || []).forEach(function(b) { (porLinha[b.linha] = porLinha[b.linha] || []).push(b); });
    var movimentos = [], conflitos = [], gatilhos = [];

    Object.keys(porLinha).sort().forEach(function(linha) {
      var lista = porLinha[linha].slice().sort(function(a, b) { return (a.inicio - b.inicio) || String(a.id).localeCompare(String(b.id)); });
      var obstaculos = lista.filter(function(b) { return !b.movel; });
      lista.forEach(function(b) {
        if (b.estado === 'TERMINADA' && b.fimPlanejado != null && b.fimPlanejado - b.fim >= g * MIN) {
          gatilhos.push({id: b.id, lote: b.lote, linha: linha, tipo: 'ANTECIPOU', minutos: Math.round(cal.minutosUteis(b.fim, b.fimPlanejado))});
        }
        if (b.estado === 'RODANDO' && b.atrasada) gatilhos.push({id: b.id, lote: b.lote, linha: linha, tipo: 'ATRASOU', minutos: Math.round(cal.minutosUteis(b.fimPlanejado, b.fim))});
      });

      // Posição de um bloco que começa depois de `fronteira` (+ setup), sem
      // invadir travado nenhum e nunca no passado.
      function posicionar(fronteira, b, duracao) {
        var base = fronteira;
        for (var volta = 0; volta < 200; volta++) {
          var t = cal.proximoUtil(base);
          if (t == null) return null;
          if (b.setupMin > 0) t = cal.somarUteis(t, b.setupMin);
          if (agoraG != null && t < agoraG) t = agoraG;
          for (var k = 0; k < 10; k++) { var s = cal.proximoUtil(cal.arredondarAcima(t, g)); if (s === t) break; t = s; }
          var fim = cal.somarUteis(t, duracao);
          if (t == null || fim == null) return null;
          var bate = obstaculos.filter(function(o) { return o.id !== b.id && o.inicio < fim && o.fim > t; })
            .sort(function(x, y) { return x.fim - y.fim; })[0];
          if (!bate) return {inicio: t, fim: fim};
          base = bate.fim;
        }
        return null;
      }

      var fronteira = null, fimOrigAnterior = null, final = {};
      lista.forEach(function(b) {
        if (!b.movel) {
          final[b.id] = {inicio: b.inicio, fim: b.fim};
          fronteira = fronteira == null ? b.fim : Math.max(fronteira, b.fim);
          fimOrigAnterior = b.estado === 'PROGRAMADA' ? b.fim : (b.fimPlanejado != null ? b.fimPlanejado : b.fim);
          return;
        }
        if (fronteira == null) { final[b.id] = {inicio: b.inicio, fim: b.fim}; fronteira = b.fim; fimOrigAnterior = b.fim; return; } // nada antes: sem gatilho
        var duracao = cal.minutosUteis(b.inicio, b.fim) || Math.max(0, (b.fim - b.inicio) / MIN);
        var folgaOrig = fimOrigAnterior != null && b.inicio > fimOrigAnterior ? cal.minutosUteis(fimOrigAnterior, b.inicio) : 0;
        var encadeado = folgaOrig <= (b.setupMin || 0) + g;
        var invadido = fronteira > b.inicio;
        var pos = null, tipo = null;
        if (invadido || encadeado) pos = posicionar(fronteira, b, duracao);
        if (pos && invadido && pos.inicio > b.inicio) tipo = 'EMPURRA';
        else if (pos && !invadido && encadeado && b.inicio - pos.inicio >= g * MIN) tipo = 'PUXA';
        if (tipo) {
          movimentos.push({id: b.id, lote: b.lote, produto: b.produto, linha: linha, tipo: tipo, de: {inicio: iso(b.inicio), fim: iso(b.fim)}, para: {inicio: iso(pos.inicio), fim: iso(pos.fim)},
            deltaMin: Math.round((pos.inicio - b.inicio) / MIN)});
          fronteira = pos.fim;
          final[b.id] = pos;
        } else {
          fronteira = Math.max(fronteira, b.fim);
          final[b.id] = {inicio: b.inicio, fim: b.fim};
        }
        fimOrigAnterior = b.fim;
      });
      // Conflito: OP da zona fixa que, na posição final, ainda divide a linha
      // com outra (tipicamente a OP atrasada que rodou por cima). O motor não
      // a move; o PCP decide.
      lista.forEach(function(b) {
        if (b.motivoFixo !== 'zona fixa') return;
        var f = final[b.id], pior = 0, quem = null;
        lista.forEach(function(o) {
          var x = final[o.id];
          if (o.id === b.id || !x || x.inicio >= f.fim || x.fim <= f.inicio) return;
          var sobre = cal.minutosUteis(Math.max(f.inicio, x.inicio), Math.min(f.fim, x.fim));
          if (sobre > pior) { pior = sobre; quem = o; }
        });
        if (quem) conflitos.push({id: b.id, lote: b.lote, linha: linha, sobreposicaoMin: Math.round(pior), com: quem.lote,
          motivo: 'OP na zona fixa invadida pela OP ' + quem.lote + ': libere a zona fixa ou reprograme à mão.'});
      });
    });
    return {movimentos: movimentos, conflitos: conflitos, gatilhos: gatilhos};
  }

  /* Tudo de uma vez: ops + config -> simulação. */
  function simular(ops, cfg, ctx) {
    var c = ctx || {}, agora = ms(c.agora);
    var cal = criarCalendario(cfg, {fusoMin: c.fusoMin});
    var dias = cfg && cfg.congelamento && cfg.congelamento.diasFixos != null ? Number(cfg.congelamento.diasFixos) : 7;
    // Zona fixa como a Grade: datas < hoje + N dias (dentroZonaFixa).
    var congeladoAte = c.ignorarZonaFixa || !(dias > 0) || agora == null ? null : cal.instante(cal.local(agora).ymd, 0) + dias * DIA_MIN * MIN;
    var b = blocosDasOps(ops, {agora: agora, setupPadraoPorLinha: (cfg || {}).setupPadraoPorLinha, congeladoAte: congeladoAte, linhas: c.linhas});
    var r = reprogramar({blocos: b.blocos, calendario: cal, agora: agora, granularidadeMin: c.granularidadeMin});
    r.vencidas = b.vencidas.map(function(v) { return {id: v.id, lote: v.lote, linha: v.linha, inicio: iso(v.inicio), fim: iso(v.fim)}; });
    r.zonaFixa = b.blocos.filter(function(x) { return x.motivoFixo === 'zona fixa'; }).map(function(x) { return x.id; });
    r.congeladoAte = congeladoAte == null ? null : iso(congeladoAte);
    return r;
  }

  /* Update em caminhos planos + registro em ajustes_planejamento/{hoje}. */
  function montarUpdates(resultado, quem) {
    var q = quem || {}, u = {}, porLinha = {};
    (resultado.movimentos || []).forEach(function(m) {
      u['ops/' + m.id + '/dataInicioPlanejada'] = m.para.inicio;
      u['ops/' + m.id + '/dataFimPlanejada'] = m.para.fim;
      (porLinha[m.linha] = porLinha[m.linha] || []).push(m);
    });
    Object.keys(porLinha).forEach(function(linha, i) {
      var ms_ = porLinha[linha], puxa = ms_.filter(function(m) { return m.tipo === 'PUXA'; }).length;
      var gat = (resultado.gatilhos || []).filter(function(x) { return x.linha === linha; })
        .map(function(x) { return 'OP ' + x.lote + (x.tipo === 'ANTECIPOU' ? ' terminou ' : ' atrasou ') + x.minutos + ' min' + (x.tipo === 'ANTECIPOU' ? ' antes' : ''); }).join('; ');
      u['ajustes_planejamento/' + q.hoje + '/reprog_' + q.chave + '_' + i] = {
        timestamp: q.agoraISO, linha: linha, por: q.por || null, tipo: 'reprogramacao_realizado',
        motivo: linha + ': reprogramação pelo realizado' + (gat ? ' (' + gat + ')' : '') + ' — ' + puxa + ' puxada(s), ' + (ms_.length - puxa) + ' empurrada(s): ' +
          ms_.map(function(m) { return m.lote; }).join(', '),
        movimentos: ms_.map(function(m) { return {op: m.id, lote: m.lote, tipo: m.tipo, de: m.de.inicio, para: m.para.inicio}; })
      };
    });
    return u;
  }

  return {criarCalendario: criarCalendario, blocosDasOps: blocosDasOps, reprogramar: reprogramar, simular: simular, montarUpdates: montarUpdates};
});
