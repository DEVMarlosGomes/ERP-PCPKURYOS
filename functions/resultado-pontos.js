/* Resultado: pontos, meta, placar, bônus e simulação — funções PURAS.
 *
 * PLANO_CUSTOS_RESULTADO.md §3 e §7. O LP vira PONTOS por um fator único e
 * fixo; a fábrica vê pontos, nunca reais. Regras que mandam aqui:
 *  - Pontos por item = LP padrão × fator, numa TABELA CONGELADA POR MÊS (preço
 *    de material atualizado no meio do mês muda o LP da diretoria, não os pontos).
 *  - Contados sobre o REALIZADO: unidades boas das linhas de envase.
 *  - Meta ajustada ao programa do dia: os pontos que o mix rodado em cada linha
 *    renderia no ritmo de referência e sem perda, nas horas programadas da linha,
 *    × o % alvo. Dia de mix de margem baixa não pune a fábrica.
 *  - SKU SEM CUSTO (fora da tabela) sai da meta E da contagem; a cobertura (% do
 *    volume do dia com pontos) aparece ao lado.
 *  - LP negativo vira 0 ponto: produzir o que o Comercial vendeu abaixo do custo
 *    não é culpa da linha (a diretoria vê o LP negativo no painel dela).
 *  - Paradas NÃO descontam (já reduzem a produção sozinhas).
 * O servidor (placar da TV) e a tela da diretoria (simulação) usam as MESMAS
 * funções, para que o número da TV e o da simulação não divirjam.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./custos-realizado'));
  else root.ResultadoPontos = factory(root.CustosRealizado);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(R) {
  'use strict';

  var VERSAO = 'pontos-v1-20261026';

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function norm(c) { return String(c == null ? '' : c).trim().toUpperCase(); }

  // Descontos e portões: decididos (perdas, retrabalho) ligados; propostos desligados até a diretoria aprovar.
  var DESCONTOS_PADRAO = { perdas: true, retrabalho: true, loteReprovado: false, divergenciaPA: false };

  /* Tabela de pontos de um mês, congelada a partir das fichas padrão.
     coberturaMinimaPct (opcional): % mínimo do custo que precisa ser PAGO/COTADO
     para o SKU pontuar (decisão em aberto no plano §11; null = basta a ficha
     completa). usarLpInformado: SKU sem ficha completa usa o LP digitado no
     Cadastros (origem LP_INFORMADO) -- desligado por padrão. */
  function tabelaDePontos(a) {
    var x = a || {}, fator = num(x.fator);
    var porSku = {}, fora = {};
    if (!(fator > 0)) return { ok: false, motivo: 'fator de pontos não definido', porSku: porSku, fora: fora };
    Object.keys(x.fichas || {}).forEach(function(s) {
      var f = x.fichas[s];
      if (!f) return;
      var lp = null, origem = null;
      if (f.completo && f.lp != null) {
        if (x.coberturaMinimaPct != null && (f.pagoCotadoPct || 0) < num(x.coberturaMinimaPct)) {
          fora[norm(s)] = 'custo só ' + Math.round(f.pagoCotadoPct || 0) + '% pago/cotado (mínimo ' + x.coberturaMinimaPct + '%)';
        } else { lp = f.lp; origem = 'LP_PADRAO'; }
      } else if (x.usarLpInformado && f.lpInformado > 0) { lp = f.lpInformado; origem = 'LP_INFORMADO'; }
      else fora[norm(s)] = 'sem custo completo';
      if (lp == null) return;
      porSku[norm(s)] = { pontos: Math.max(0, Math.round(lp * fator)), lp: Math.round(lp * 10000) / 10000, origem: origem, lpNegativo: lp < 0 };
    });
    return { ok: true, fator: fator, porSku: porSku, fora: fora, versao: VERSAO };
  }

  // A tabela congelada guarda o SKU com a chave do RTDB (sem . # $ / [ ]): procura nas duas formas.
  function pontosDe(tabela, sku) {
    var p = tabela && tabela.porSku, s = norm(sku);
    var t = p && (p[s] || p[s.replace(/[.#$\/\[\]]/g, '_')]);
    return t ? t.pontos : null;
  }

  /* Produção boa de um dia por linha × SKU, só linhas de envase. */
  function producaoDoDia(apontamentos, idxOps, porDescricao) {
    var porLinha = {}, semSku = 0, total = 0;
    (apontamentos || []).forEach(function(r) {
      if (!R.ehLinhaEnvase(r.linha)) return;
      var q = num(r.quantidade);
      if (!(q > 0)) return;
      total += q;
      var s = R.skuDoApontamento(r, idxOps, porDescricao).sku;
      if (!s) { semSku += q; return; }
      var l = R.nomeLinha(r.linha);
      porLinha[l] = porLinha[l] || {};
      porLinha[l][s] = (porLinha[l][s] || 0) + q;
    });
    return { porLinha: porLinha, semSku: semSku, total: total };
  }

  /* Meta e pontos do dia.
   *   para cada linha: horas-padrão de cada SKU rodado (q / ritmo); a hora
   *   programada da linha é repartida pelo mix na proporção dessas horas;
   *   programa = Σ fatia × horas × ritmo × pontos; meta = programa × alvo.
   * A fatia de SKU sem pontos não vira meta (sai do programa e da contagem). */
  function placarDoDia(a) {
    var x = a || {}, prod = x.producao || { porLinha: {}, semSku: 0, total: 0 };
    var alvo = num(x.alvoPct) / 100;
    var porLinha = {}, pontosBrutos = 0, programa = 0, unidades = 0, unidadesComPontos = 0, semRitmo = 0;
    Object.keys(prod.porLinha).forEach(function(l) {
      var mix = prod.porLinha[l], horasLinha = x.horasPorLinha && x.horasPorLinha[l] != null ? num(x.horasPorLinha[l]) : num(x.horasDia);
      var hp = {}, hpTotal = 0, pts = 0, prog = 0;
      Object.keys(mix).forEach(function(s) {
        var r = x.ritmos && x.ritmos[s] && x.ritmos[s].valor;
        unidades += mix[s];
        var p = pontosDe(x.tabela, s);
        if (p != null) { pts += mix[s] * p; unidadesComPontos += mix[s]; }
        if (!(r > 0)) { semRitmo += mix[s]; return; }
        hp[s] = mix[s] / r; hpTotal += hp[s];
      });
      Object.keys(hp).forEach(function(s) {
        var p = pontosDe(x.tabela, s);
        if (p == null || !(hpTotal > 0)) return;
        prog += (hp[s] / hpTotal) * horasLinha * x.ritmos[s].valor * p;
      });
      porLinha[l] = { pontos: Math.round(pts), meta: Math.round(prog * alvo) };
      pontosBrutos += pts; programa += prog;
    });
    unidades += prod.semSku;
    var d = x.descontos || {};
    var totalDesc = ['perdas', 'retrabalho', 'loteReprovado', 'divergenciaPA'].reduce(function(s, k) { return s + num(d[k]); }, 0);
    var pontos = Math.round(pontosBrutos - totalDesc);
    var meta = Math.round(programa * alvo);
    return {
      dia: x.dia || null, pontosBrutos: Math.round(pontosBrutos), descontos: {
        perdas: Math.round(num(d.perdas)), retrabalho: Math.round(num(d.retrabalho)),
        loteReprovado: Math.round(num(d.loteReprovado)), divergenciaPA: Math.round(num(d.divergenciaPA)), total: Math.round(totalDesc) },
      pontos: pontos, meta: meta, pct: meta > 0 ? Math.round(pontos / meta * 1000) / 10 : null, batida: meta > 0 ? pontos >= meta : null,
      unidades: Math.round(unidades), unidadesComPontos: Math.round(unidadesComPontos),
      coberturaPct: unidades > 0 ? Math.round(unidadesComPontos / unidades * 1000) / 10 : null,
      unidadesSemSku: Math.round(prod.semSku), unidadesSemRitmo: Math.round(semRitmo),
      porLinha: porLinha, versao: VERSAO
    };
  }

  /* Descontos por dia, em PONTOS, a partir das fontes de cada um.
   *   perdas:        perdas/{lote}/{id} {data, lote, perdas[]} -> unidades = maior tipo
   *   retrabalho:    retrabalhos/{id}.apontamentos[*] {fim, quantidade} × pontos do SKU
   *   loteReprovado: lote de PA REPROVADO pela Qualidade -> sai dos dias em que
   *                  as unidades do lote foram contadas
   *   divergenciaPA: conferencias_pa/{op}.divergencia < 0 (apontado acima do
   *                  contado) -> sai no último dia de apontamento do lote */
  function descontosPorDia(a) {
    var x = a || {}, ativos = Object.assign({}, DESCONTOS_PADRAO, x.ativos || {});
    var tabelaDoDia = x.tabelaDoDia || function() { return null; };
    var idxOps = x.idxOps || { porLote: {} };
    var out = {};
    function add(dia, tipo, pts) {
      if (!dia || !(pts > 0)) return;
      out[dia] = out[dia] || { perdas: 0, retrabalho: 0, loteReprovado: 0, divergenciaPA: 0 };
      out[dia][tipo] += pts;
    }
    if (ativos.perdas) Object.keys(x.perdas || {}).forEach(function(lk) {
      var porId = x.perdas[lk] || {};
      Object.keys(porId).forEach(function(id) {
        var p = porId[id]; if (!p) return;
        var op = idxOps.porLote[String(p.lote || '').trim()];
        var s = op && op.sku; if (!s) return;
        var porTipo = {};
        (p.perdas || []).forEach(function(i) { if (i) porTipo[i.tipo || 'Outro'] = (porTipo[i.tipo || 'Outro'] || 0) + num(i.quantidade); });
        var dia = String(p.data || p.timestamp || '').slice(0, 10);
        var pt = pontosDe(tabelaDoDia(dia), s);
        if (pt != null) add(dia, 'perdas', R.unidadesPerdidas(porTipo) * pt);
      });
    });
    if (ativos.retrabalho) Object.keys(x.retrabalhos || {}).forEach(function(id) {
      var rt = x.retrabalhos[id]; if (!rt || !rt.sku) return;
      Object.keys(rt.apontamentos || {}).forEach(function(k) {
        var ap = rt.apontamentos[k]; if (!ap || ap.quantidadePendente || !(num(ap.quantidade) > 0)) return;
        var dia = String(ap.fim || ap.inicio || '').slice(0, 10);
        var pt = pontosDe(tabelaDoDia(dia), rt.sku);
        if (pt != null) add(dia, 'retrabalho', num(ap.quantidade) * pt);
      });
    });
    // Unidades por lote e dia (para reprovado e divergência).
    var porLoteDia = {};
    (x.apontamentos || []).forEach(function(r) {
      if (!R.ehLinhaEnvase(r.linha) || !(num(r.quantidade) > 0)) return;
      var l = String(r.lote || '').trim(); if (!l) return;
      porLoteDia[l] = porLoteDia[l] || {};
      porLoteDia[l][r.dia] = (porLoteDia[l][r.dia] || 0) + num(r.quantidade);
    });
    function opPorKey(opKey) { var o = (x.ops || {})[opKey]; return o ? Object.assign({ opKey: opKey }, o) : null; }
    if (ativos.loteReprovado) Object.keys(x.estoqueLotes || {}).forEach(function(item) {
      var lotes = x.estoqueLotes[item] || {};
      Object.keys(lotes).forEach(function(lk) {
        var l = lotes[lk];
        if (!l || l.origemTipo !== 'conferencia_pa' || !l.qualidade || l.qualidade.decisao !== 'REPROVADO') return;
        var op = opPorKey(l.opKey || l.origemRef); if (!op || !op.lote) return;
        var dias = porLoteDia[String(op.lote).trim()] || {};
        var totalLote = Object.keys(dias).reduce(function(s, d) { return s + dias[d]; }, 0);
        var qtdRep = num(l.qtdOriginal) || totalLote;
        Object.keys(dias).forEach(function(d) {
          var pt = pontosDe(tabelaDoDia(d), op.sku);
          if (pt != null && totalLote > 0) add(d, 'loteReprovado', qtdRep * (dias[d] / totalLote) * pt);
        });
      });
    });
    if (ativos.divergenciaPA) Object.keys(x.conferenciasPa || {}).forEach(function(opKey) {
      var c = x.conferenciasPa[opKey];
      if (!c || !(num(c.divergencia) < 0)) return;
      var op = opPorKey(opKey); if (!op || !op.lote) return;
      var dias = Object.keys(porLoteDia[String(op.lote).trim()] || {}).sort();
      var ultimo = dias[dias.length - 1] || String(c.conferidoEm || '').slice(0, 10);
      var pt = pontosDe(tabelaDoDia(ultimo), op.sku);
      if (pt != null) add(ultimo, 'divergenciaPA', -num(c.divergencia) * pt);
    });
    return out;
  }

  // Semana ISO (segunda a domingo): "2026-W39".
  function semanaISO(diaISO) {
    var d = new Date(diaISO + 'T12:00:00Z');
    var dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow + 3);
    var ano = d.getUTCFullYear();
    var primeira = new Date(Date.UTC(ano, 0, 4));
    var sem = 1 + Math.round(((d - primeira) / 864e5 - 3 + ((primeira.getUTCDay() + 6) % 7)) / 7);
    return ano + '-W' + (sem < 10 ? '0' : '') + sem;
  }

  /* Dia -> semana -> mês: a semana SOMA os dias (um dia ruim compensa com um
     bom), o mês soma os dias do mês. Só entram dias com meta. */
  function acumular(placares, nivel) {
    var g = {};
    (placares || []).forEach(function(p) {
      if (!p || !p.dia || !(p.meta > 0)) return;
      var k = nivel === 'semana' ? semanaISO(p.dia) : p.dia.slice(0, 7);
      var x = g[k] = g[k] || { chave: k, pontos: 0, meta: 0, dias: 0, diasBatidos: 0, unidades: 0, unidadesComPontos: 0 };
      x.pontos += p.pontos; x.meta += p.meta; x.dias++; if (p.batida) x.diasBatidos++;
      x.unidades += p.unidades; x.unidadesComPontos += p.unidadesComPontos;
    });
    return Object.keys(g).sort().map(function(k) {
      var x = g[k];
      x.pct = x.meta > 0 ? Math.round(x.pontos / x.meta * 1000) / 10 : null;
      x.batida = x.meta > 0 ? x.pontos >= x.meta : null;
      x.coberturaPct = x.unidades > 0 ? Math.round(x.unidadesComPontos / x.unidades * 1000) / 10 : null;
      return x;
    });
  }

  /* Bônus do mês: valor fixo ao bater, crescendo em FAIXAS (degraus, não
     linear), com teto. Portões: reclamação/devolução com causa na fábrica reduz
     o mês (ex.: −50%); acidente com afastamento zera a semana -- o mês paga a
     fração das semanas sem acidente.
     faixas: [{pct: 100, mult: 1}, {pct: 110, mult: 1.2}, ...] */
  function bonusDoMes(a) {
    var x = a || {}, base = num(x.base), pct = num(x.pctMes);
    var teto = x.tetoPct != null ? num(x.tetoPct) : Infinity;
    var faixas = (x.faixas || []).filter(function(f) { return f && num(f.pct) > 0; }).sort(function(p, q) { return num(p.pct) - num(q.pct); });
    if (!(base > 0) || !faixas.length) return { valor: null, motivo: 'bônus base ou faixas não definidos' };
    var efetivo = Math.min(pct, teto), mult = 0;
    faixas.forEach(function(f) { if (efetivo >= num(f.pct)) mult = num(f.mult); });
    var semanas = Math.max(1, num(x.semanasNoMes) || 1);
    var semAcidente = Math.max(0, semanas - num(x.semanasComAcidente));
    var reducao = Math.min(100, Math.max(0, num(x.reducaoReclamacaoPct)));
    var valor = base * mult * (semAcidente / semanas) * (1 - reducao / 100);
    return { valor: Math.round(valor * 100) / 100, mult: mult, pctConsiderado: efetivo,
      fracaoSemanas: semAcidente / semanas, reducaoPct: reducao, bateu: mult > 0 };
  }

  /* Placar de um período a partir da base crua -- o que o servidor grava e o
     que a simulação da diretoria roda. Pontos do dia usam a tabela do MÊS do dia. */
  function placarDoPeriodo(a) {
    var x = a || {};
    var idxOps = R.indexarOps(x.ops);
    var porDesc = R.indexarProdutosPorDescricao(x.produtos);
    var aps = R.achatarRegistros(x.registros).filter(function(r) { return (!x.desde || r.dia >= x.desde) && (!x.ate || r.dia <= x.ate); });
    var tabelas = x.tabelas || {};
    function tabelaDoDia(d) { return tabelas[String(d || '').slice(0, 7)] || null; }
    var desc = descontosPorDia({ ativos: x.descontosAtivos, tabelaDoDia: tabelaDoDia, idxOps: idxOps, perdas: x.perdas,
      retrabalhos: x.retrabalhos, apontamentos: aps, estoqueLotes: x.estoqueLotes, conferenciasPa: x.conferenciasPa, ops: x.ops });
    var porDia = {};
    aps.forEach(function(r) { (porDia[r.dia] = porDia[r.dia] || []).push(r); });
    var horasDoDia = x.horasDoDia || function() { return null; };
    return Object.keys(porDia).sort().map(function(dia) {
      var tabela = tabelaDoDia(dia);
      var prod = producaoDoDia(porDia[dia], idxOps, porDesc);
      if (!tabela) return { dia: dia, indisponivel: 'tabela de pontos de ' + dia.slice(0, 7) + ' não congelada', unidades: Math.round(prod.total) };
      var horas = horasDoDia(dia);
      var prog = (x.programa || {})[dia] || {};
      var horasPorLinha = {};
      Object.keys(prod.porLinha).forEach(function(l) { horasPorLinha[l] = prog[l] != null ? num(prog[l]) : (horas != null ? horas : 0); });
      return placarDoDia({ dia: dia, producao: prod, tabela: tabela, ritmos: x.ritmos, alvoPct: x.alvoPct,
        horasDia: horas, horasPorLinha: horasPorLinha, descontos: desc[dia] });
    });
  }

  /* Simulação (Fase 4): roda o placar de um período e resume o que a
     diretoria precisa para calibrar fator, % alvo e faixas. */
  function resumoSimulacao(placares, params) {
    var p = params || {};
    var validos = (placares || []).filter(function(x) { return x && x.meta > 0; });
    var semanas = acumular(validos, 'semana'), meses = acumular(validos, 'mes');
    var bonus = meses.map(function(m) {
      var semanasDoMes = {};
      validos.forEach(function(x) { if (x.dia.slice(0, 7) === m.chave) semanasDoMes[semanaISO(x.dia)] = true; });
      var b = bonusDoMes({ base: p.bonusBase, faixas: p.faixas, tetoPct: p.tetoPct, pctMes: m.pct, semanasNoMes: Object.keys(semanasDoMes).length });
      return { mes: m.chave, pct: m.pct, valor: b.valor, mult: b.mult };
    });
    return {
      dias: validos.length, diasBatidos: validos.filter(function(x) { return x.batida; }).length,
      diasBatidosPct: validos.length ? Math.round(validos.filter(function(x) { return x.batida; }).length / validos.length * 1000) / 10 : null,
      semanas: semanas, semanasBatidas: semanas.filter(function(s) { return s.batida; }).length,
      meses: meses, bonus: bonus,
      custoBonus: bonus.reduce(function(s, b) { return s + (b.valor || 0); }, 0),
      coberturaMediaPct: validos.length ? Math.round(validos.reduce(function(s, x) { return s + (x.coberturaPct || 0); }, 0) / validos.length * 10) / 10 : null,
      indisponiveis: (placares || []).filter(function(x) { return x && x.indisponivel; }).length
    };
  }

  return {
    VERSAO: VERSAO,
    DESCONTOS_PADRAO: DESCONTOS_PADRAO,
    tabelaDePontos: tabelaDePontos,
    pontosDe: pontosDe,
    producaoDoDia: producaoDoDia,
    placarDoDia: placarDoDia,
    descontosPorDia: descontosPorDia,
    semanaISO: semanaISO,
    acumular: acumular,
    bonusDoMes: bonusDoMes,
    placarDoPeriodo: placarDoPeriodo,
    resumoSimulacao: resumoSimulacao
  };
});
