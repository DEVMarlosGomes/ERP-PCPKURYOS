'use strict';
/* Custos e Resultado — tela da diretoria (PLANO_CUSTOS_RESULTADO.md).
   As contas moram nos motores puros e testados: shared/custos.js (padrão, LP),
   shared/custos-realizado.js (OP real, variações) e shared/resultado-pontos.js
   (pontos, meta, bônus). Esta tela só lê o banco, desenha e grava o que é dela:
   parâmetros, operação da competência, preço MANUAL (com histórico), de-para do
   P&D, material do cliente, programa do dia e portões. Congelar a tabela de
   pontos e fechar o mês são do servidor (callables). Toda gravação vai por
   CAMINHOS PLANOS: update com objeto aninhado apaga campos (CLAUDE.md). */
(function() {
  var db = firebase.database();
  var C = Custos, R = CustosRealizado, P = ResultadoPontos;

  // Nós lidos uma vez (botão "Recarregar") e nós ao vivo (pequenos, mudam pela tela).
  var NOS_UMA_VEZ = ['materiais', 'produtos', 'formulas', 'bom', 'especificacoes', 'pedidos_compra', 'processos_cotacao',
    'precos_venda', 'ops', 'config', 'clientes', 'registros', 'perdas', 'retrabalhos', 'estoque_lotes', 'conferencias_pa'];
  var NOS_ERP = {pd_formula_items: 'erp/kuryos/pd_formula_items', propostas: 'erp/kuryos/crm_propostas'};
  var NOS_VIVOS = {custos: 'custos', custos_precos: 'custos_precos', resultado: 'resultado'};

  var D = {}, M = null, avisosCarga = [];
  var S = {aba: 'painel', q: '', cli: '', filtro: 'volume', ordem: 'volume', desc: true, mesReal: null, nivel: 'mes',
    qp: '', qdep: '', fichaSku: null, simul: null, movimentos: null, realizado: null};

  function el(id) { return document.getElementById(id); }
  function e(v) { return escapeHtml(String(v == null ? '' : v)); }
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function norm(s) { return String(s == null ? '' : s).trim().toUpperCase(); }
  function brl(v, casas) {
    if (v == null || !isFinite(v)) return '<span class="mut">—</span>';
    var c = casas != null ? casas : (Math.abs(v) < 10 ? 3 : 2);
    var t = 'R$ ' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits: c, maximumFractionDigits: c});
    return v < 0 ? '<span class="neg">' + t + '</span>' : t;
  }
  function dec(v, c) { return v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('pt-BR', {maximumFractionDigits: c}); }
  function inteiro(v) { return v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('pt-BR'); }
  function pct(v, casas) { return v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('pt-BR', {maximumFractionDigits: casas == null ? 1 : casas}) + '%'; }
  function dataBR(v) { var s = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : '—'; }
  function mesBR(m) { var n = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return m ? n[Number(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4) : '—'; }
  function hojeISO() { return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); }
  function mesAtual() { return hojeISO().slice(0, 7); }
  function mesMenos(m, k) { var a = Number(m.slice(0, 4)), x = Number(m.slice(5, 7)) - k; while (x < 1) { x += 12; a--; } return a + '-' + (x < 10 ? '0' : '') + x; }
  function autor() { var u = window.currentUser || {}; return u.nome || u.email || 'diretoria'; }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 3800);
  }
  function erroMsg(err) { return (err && (err.message || err.code)) || String(err); }

  var ROT_FONTE = {PAGO: 'Pago', COTADO: 'Cotado', MANUAL: 'Manual', ESTIMADO_PD: 'Estimado P&D', CLIENTE: 'Do cliente', SEM_CUSTO: 'Sem custo'};
  var COR_FONTE = {PAGO: 'var(--f-pago)', COTADO: 'var(--f-cotado)', MANUAL: 'var(--f-manual)', ESTIMADO_PD: 'var(--f-pd)', CLIENTE: 'var(--f-cliente)'};
  function tagFonte(f) { return '<span class="f f-' + e(f || 'SEM_CUSTO') + '">' + e(ROT_FONTE[f] || f || 'Sem custo') + '</span>'; }
  function barraComp(comp) {
    var ks = Object.keys(comp || {}).filter(function(k) { return comp[k] > 0; });
    if (!ks.length) return '<span class="mut">—</span>';
    return '<div class="comp" title="' + e(ks.map(function(k) { return (ROT_FONTE[k] || k) + ' ' + Math.round(comp[k]) + '%'; }).join(' · ')) + '">' +
      ks.map(function(k) { return '<span style="width:' + comp[k] + '%;background:' + (COR_FONTE[k] || 'var(--ink-mute)') + '"></span>'; }).join('') + '</div>';
  }
  function legendaFontes() {
    return '<div class="leg">' + ['PAGO', 'COTADO', 'MANUAL', 'ESTIMADO_PD'].map(function(f) {
      return '<span><i style="background:' + COR_FONTE[f] + '"></i>' + ROT_FONTE[f] + '</span>'; }).join('') + '</div>';
  }

  /* ── Carga ─────────────────────────────────────────────────────────────── */
  function lerUmaVez() {
    avisosCarga = [];
    el('sDot').classList.remove('on'); el('sTxt').textContent = 'Carregando…';
    var tarefas = NOS_UMA_VEZ.map(function(n) {
      return db.ref(n).once('value').then(function(s) { D[n] = s.val() || {}; }, function(err) { D[n] = {}; avisosCarga.push(n + ': ' + erroMsg(err)); });
    });
    Object.keys(NOS_ERP).forEach(function(k) {
      tarefas.push(db.ref(NOS_ERP[k]).once('value').then(function(s) { D[k] = s.val() || {}; }, function() {
        D[k] = {};
        avisosCarga.push('Sem acesso ao P&D/CRM (' + NOS_ERP[k] + '): estimativa do P&D e LP do orçamento ficam de fora. O usuário precisa do tenant "kuryos".');
      }));
    });
    return Promise.all(tarefas);
  }
  var vivosProntos = {};
  function escutarVivos(pronto) {
    Object.keys(NOS_VIVOS).forEach(function(k) {
      dbOnValue(db.ref(NOS_VIVOS[k]), function(s) {
        D[k] = s.val() || {};
        vivosProntos[k] = true;
        if (Object.keys(vivosProntos).length === Object.keys(NOS_VIVOS).length) pronto();
      }, {onError: function(err) { D[k] = {}; vivosProntos[k] = true; avisosCarga.push(NOS_VIVOS[k] + ': ' + erroMsg(err)); pronto(); }});
    });
  }

  /* ── Modelo (tudo dos motores) ─────────────────────────────────────────── */
  function baseCusto() {
    return {materiais: D.materiais, produtos: D.produtos, formulas: D.formulas, bom: D.bom, especificacoes: D.especificacoes,
      pedidos_compra: D.pedidos_compra, processos_cotacao: D.processos_cotacao, custos_precos: D.custos_precos,
      pd_formula_items: D.pd_formula_items, precos_venda: D.precos_venda, ops: D.ops, config: D.config,
      propostas: D.propostas, custos: D.custos || {}};
  }
  function volume12m(desde) {
    var v = {};
    Object.keys(D.ops || {}).forEach(function(k) {
      var o = D.ops[k];
      if (!o || !o.sku || !(num(o.produzido) > 0)) return;
      if (String(o.dataFimReal || o.dataInicioReal || '') < desde) return;
      v[norm(o.sku)] = (v[norm(o.sku)] || 0) + num(o.produzido);
    });
    return v;
  }
  function montar() {
    var comp = mesAtual(), hoje = hojeISO();
    var base = baseCusto();
    var ritmos = C.ritmosDaCompetencia(D.produtos, D.ops, comp);
    var taxa = C.taxaParaCompetencia(base, comp, ritmos);
    var ctx = C.montarContextoCustos(base, {taxa: taxa, competencia: comp, hoje: hoje, ritmos: ritmos});
    var horas = C.horasUteisDoMes(D.config || {}, comp);
    var horasDia = horas.ok && horas.diasUteis ? horas.horasUteis / horas.diasUteis : null;
    var fichas = {};
    Object.keys(ctx.produtoPorSku).forEach(function(s) { fichas[s] = ctx.ficha(s); });
    var vol = volume12m(mesMenos(comp, 12) + '-01');
    var pvPorSku = {};
    Object.keys(D.precos_venda || {}).forEach(function(k) { var p = D.precos_venda[k]; if (p) pvPorSku[norm(p.sku || k)] = p; });
    var ultimaOp = Object.keys(D.ops || {}).reduce(function(m, k) { var d = String((D.ops[k] || {}).dataFimReal || ''); return d > m ? d : m; }, '');
    M = {pvPorSku: pvPorSku, comp: comp, hoje: hoje, taxa: taxa, ctx: ctx, fichas: fichas, ritmos: ritmos, vol: vol, horasDia: horasDia,
      cobertura: C.coberturaPorVolume(fichas, vol), ultimaOp: ultimaOp.slice(0, 10)};
    S.realizado = null; S.realizado3m = null;
    el('sDot').classList.add('on');
    el('sTxt').textContent = 'Base de ' + dataBR(hoje) + ' · motor ' + C.VERSAO_MOTOR.replace('custos-', '');
  }

  /* ── Abas ──────────────────────────────────────────────────────────────── */
  function render() {
    if (!M) return;
    Array.prototype.forEach.call(document.querySelectorAll('.aba'), function(b) { b.setAttribute('aria-selected', b.dataset.aba === S.aba ? 'true' : 'false'); });
    var html = avisosCarga.length ? '<div class="alerta warn"><div><b>Parte da base não carregou.</b> ' + avisosCarga.map(e).join('<br>') + '</div></div>' : '';
    html += ({painel: abaPainel, skus: abaSkus, realizado: abaRealizado, pendencias: abaPendencias, precos: abaPrecos,
      resultado: abaResultado, parametros: abaParametros}[S.aba] || abaPainel)();
    el('conteudo').innerHTML = html;
    if (S.aba === 'realizado' && !S.movimentos) carregarMovimentos();
  }

  /* Painel ─────────────────────────────────────────────────────────────── */
  function abaPainel() {
    var f = Object.values(M.fichas), t = M.taxa, params = (D.custos || {}).parametros || {};
    var comLp = f.filter(function(x) { return x.completo; });
    var lpMedio = (function() {
      var soma = 0, q = 0;
      comLp.forEach(function(x) { var v = M.vol[x.sku] || 0; soma += x.lp * v; q += v; });
      return q > 0 ? soma / q : null;
    })();
    var dias = M.taxa.horasUteis && M.horasDia ? Math.round(M.taxa.horasUteis / M.horasDia) : null;
    var equilibrio = t.custoFixoMensal != null && dias ? t.custoFixoMensal / dias : null;
    var res = (D.resultado || {}).placar || {};
    var mes = (res.meses || {})[M.comp];
    var tabela = ((D.resultado || {}).tabelas || {})[M.comp];
    var plano = planoPrecos();
    var alvo50 = C.precosParaVolume(plano.marcos, 50);
    var h = '';
    var diasSemOp = M.ultimaOp ? Math.round((new Date(M.hoje) - new Date(M.ultimaOp)) / 864e5) : null;
    if (diasSemOp != null && diasSemOp > 7) {
      h += '<div class="alerta bad"><div><b>A última OP desta base é de ' + dataBR(M.ultimaOp) + ' (' + diasSemOp + ' dias).</b> ' +
        'Custo realizado, LPD realizado e placar só andam com a fábrica apontando neste sistema. O padrão (LP, pendências) já vale.</div></div>';
    }
    if (!t.ok) h += '<div class="alerta warn"><div><b>Operação sem custo-hora:</b> ' + e(t.faltam.join('; ')) + '. Sem isso nenhum SKU tem LP. <a href="#" data-ir="parametros">Informar em Parâmetros</a>.</div></div>';
    if (params.impostosPct == null) h += '<div class="alerta warn"><div><b>% de impostos não informado.</b> LP sem imposto descontado sairia inflado, então fica em branco. <a href="#" data-ir="parametros">Informar</a>.</div></div>';
    h += '<div class="kpis">';
    h += kpi(M.cobertura.coberturaPct >= 60 ? 'ok' : M.cobertura.coberturaPct > 0 ? 'warn' : 'bad', 'Volume com LP calculado', pct(M.cobertura.coberturaPct),
      comLp.length + ' de ' + f.length + ' SKUs · volume de 12 meses (' + inteiro(M.cobertura.volumeTotal) + ' un)');
    h += kpi(M.cobertura.pagoCotadoPct >= 80 ? 'ok' : 'warn', 'Confiança do custo', pct(M.cobertura.pagoCotadoPct),
      'do custo dos SKUs com LP é PAGO/COTADO; o resto é manual ou estimativa do P&D');
    h += kpi('info', 'LP médio (ponderado pelo volume)', lpMedio == null ? '—' : brl(lpMedio), 'só sobre os SKUs com custo completo');
    h += kpi(t.ocupacaoPct == null ? 'warn' : t.ocupacaoPct < 50 ? 'bad' : 'ok', 'Ocupação das linhas', pct(t.ocupacaoPct),
      'horas-padrão ÷ hora-linha disponível · base ' + (t.mesesBaseHorasPadrao || []).map(mesBR).join(', ') +
      (t.custoOciosidadeMes != null ? ' · <b>' + brl(t.custoOciosidadeMes, 0) + '/mês de capacidade paga parada</b>' : ''));
    h += kpi(equilibrio != null ? 'info' : 'warn', 'Equilíbrio do dia', equilibrio == null ? '—' : brl(equilibrio, 0),
      'LP que a fábrica precisa gerar por dia útil para cobrir o custo fixo do mês' + (t.custoFixoMensal != null ? ' (' + brl(t.custoFixoMensal, 0) + ')' : ''));
    h += kpi(mes ? (mes.batida ? 'ok' : 'warn') : 'mute', 'Resultado de ' + mesBR(M.comp), mes ? pct(mes.pct) : '—',
      mes ? inteiro(mes.pontos) + ' de ' + inteiro(mes.meta) + ' pontos · ' + mes.diasBatidos + '/' + mes.dias + ' dias batidos' :
        (tabela ? 'sem dia com meta neste mês ainda' : 'tabela de pontos do mês não congelada'));
    h += '</div>';
    h += '<div class="grid2"><div class="card"><h3>Próximo passo de maior valor</h3>';
    if (plano.precosNecessarios) {
      h += '<p style="margin:0 0 6px;font-size:13.5px">Digitar <b>' + alvo50 + ' preços</b> fecha a ficha de metade do volume produzido. ' +
        'A ordem é por <b>volume desbloqueado por preço digitado</b>: uma ficha só fecha quando todos os materiais dela têm preço.</p>';
      h += plano.marcos.filter(function(m, i) { return [10, 25, 50, 75, 100].some(function(a) { return m.volumeCobertoPct >= a && (i === 0 || plano.marcos[i - 1].volumeCobertoPct < a); }); })
        .map(function(m) { return '<div class="linha-kv"><span>' + m.precos + ' preços</span><span>' + m.skusCompletos + ' SKUs · ' + pct(m.volumeCobertoPct, 0) + ' do volume</span></div>'; }).join('');
      h += '<div style="margin-top:10px"><button class="btn pri sm" data-ir="pendencias">Abrir a fila de preços</button></div>';
    } else h += '<p class="mut">Nenhum SKU com volume depende de preço: veja as outras pendências.</p>';
    h += '</div><div class="card"><h3>O que trava os LPs hoje</h3>' + resumoPendencias() + '</div></div>';
    h += '<div class="card"><h3>Ranking do mix (SKUs com LP e volume)</h3><div class="sub" style="margin:0 0 8px">LPD = LP × peças que a linha faz num dia. LP alto com ritmo baixo pode render menos por dia de linha que LP baixo com ritmo alto.</div>' + rankingMix() + '</div>';
    return h;
  }
  function kpi(cls, rot, v, d) { return '<div class="kpi ' + cls + '"><div class="r">' + rot + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>'; }
  function resumoPendencias() {
    var cont = {};
    Object.values(M.fichas).forEach(function(f) {
      if (!(M.vol[f.sku] > 0)) return;
      var tipos = {};
      f.pendencias.forEach(function(p) { tipos[p.tipo] = true; });
      Object.keys(tipos).forEach(function(k) { cont[k] = (cont[k] || 0) + 1; });
    });
    var rot = {PRECO_MATERIAL: 'sem preço de material', CADASTRO: 'cadastro incompleto (fórmula, BOM ou item sem código)', PRECO_VENDA: 'sem preço de venda',
      DENSIDADE: 'sem densidade (nem na especificação)', UNIDADE: 'unidade que não converte', OPERACAO: 'sem ritmo ou custo-hora', IMPOSTOS: 'sem % de impostos'};
    var ks = Object.keys(cont).sort(function(a, b) { return cont[b] - cont[a]; });
    if (!ks.length) return '<p class="mut">Nada pendente nos SKUs com volume.</p>';
    return '<div class="sub" style="margin:0 0 6px">SKUs com volume nos últimos 12 meses, por motivo (um SKU pode ter vários):</div>' +
      ks.map(function(k) { return '<div class="linha-kv"><span>' + e(rot[k] || k) + '</span><b>' + cont[k] + '</b></div>'; }).join('');
  }
  function rankingMix() {
    var lista = Object.values(M.fichas).filter(function(f) { return f.completo && M.vol[f.sku] > 0; })
      .map(function(f) { return {f: f, lpd: C.lpdPadrao(f, M.horasDia)}; })
      .sort(function(a, b) { return (b.lpd || 0) - (a.lpd || 0); }).slice(0, 15);
    if (!lista.length) return '<div class="vazio"><b>Nenhum SKU com LP calculado ainda.</b>Ele aparece aqui quando a ficha fecha (todos os preços, densidade, preço de venda, impostos e custo-hora).</div>';
    return '<div class="tw"><table><thead><tr><th>SKU</th><th>Produto</th><th class="n">LP</th><th class="n">Ritmo/h</th><th class="n">LPD (dia de linha)</th><th class="n">Volume 12m</th></tr></thead><tbody>' +
      lista.map(function(x) { return '<tr class="cl" data-ficha="' + e(x.f.sku) + '"><td>' + e(x.f.sku) + '</td><td>' + e(x.f.descricao) + '</td><td class="n">' + brl(x.f.lp) +
        '</td><td class="n">' + inteiro(x.f.ritmo.valor) + '</td><td class="n">' + brl(x.lpd, 0) + '</td><td class="n">' + inteiro(M.vol[x.f.sku]) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }

  /* LP por SKU ─────────────────────────────────────────────────────────── */
  function abaSkus() {
    var clientes = {};
    Object.values(M.fichas).forEach(function(f) { if (f.cliente) clientes[f.cliente] = 1; });
    var lista = Object.values(M.fichas).filter(function(f) {
      if (S.cli && f.cliente !== S.cli) return false;
      if (S.filtro === 'volume' && !(M.vol[f.sku] > 0)) return false;
      if (S.filtro === 'lp' && !f.completo) return false;
      if (S.filtro === 'pend' && f.completo) return false;
      if (S.q) { var q = norm(S.q); if ((f.sku + ' ' + norm(f.descricao) + ' ' + norm(f.cliente)).indexOf(q) < 0) return false; }
      return true;
    });
    var chave = {volume: function(f) { return M.vol[f.sku] || 0; }, lp: function(f) { return f.lp == null ? -1e9 : f.lp; },
      margem: function(f) { return f.margemPct == null ? -1e9 : f.margemPct; }, sku: function(f) { return f.sku; },
      lpd: function(f) { var v = C.lpdPadrao(f, M.horasDia); return v == null ? -1e12 : v; }, pend: function(f) { return f.pendencias.length; }}[S.ordem] || function(f) { return M.vol[f.sku] || 0; };
    lista.sort(function(a, b) { var x = chave(a), y = chave(b); var r = x < y ? -1 : x > y ? 1 : 0; return S.desc ? -r : r; });
    function th(id, rot, n) { return '<th class="ord' + (n ? ' n' : '') + '" data-ordem="' + id + '">' + rot + (S.ordem === id ? (S.desc ? ' ▾' : ' ▴') : '') + '</th>'; }
    var h = '<div class="card"><div class="barra"><input class="busca" id="qSku" placeholder="SKU, produto ou cliente…" value="' + e(S.q) + '">' +
      '<select class="sel" id="fCli"><option value="">Todos os clientes</option>' + Object.keys(clientes).sort().map(function(c) { return '<option' + (c === S.cli ? ' selected' : '') + '>' + e(c) + '</option>'; }).join('') + '</select>' +
      '<select class="sel" id="fFiltro">' + [['volume', 'Com produção em 12 meses'], ['todos', 'Todos os SKUs'], ['lp', 'Só com LP calculado'], ['pend', 'Só com pendência']]
        .map(function(o) { return '<option value="' + o[0] + '"' + (S.filtro === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<span class="pill">' + lista.length + ' SKUs</span></div>' + legendaFontes() +
      '<div class="tw"><table><thead><tr>' + th('sku', 'SKU') + '<th>Produto / cliente</th>' + th('volume', 'Volume 12m', 1) + '<th class="n">Preço</th><th class="n">Custo variável</th>' +
      th('lp', 'LP padrão', 1) + th('margem', 'Margem', 1) + th('lpd', 'LPD/dia', 1) + '<th class="n">LP informado</th><th class="n">LP orçamento</th><th>Origem do custo</th>' + th('pend', 'Situação') + '</tr></thead><tbody>';
    if (!lista.length) h += '<tr><td colspan="12"><div class="vazio"><b>Nenhum SKU neste filtro.</b></div></td></tr>';
    lista.slice(0, 400).forEach(function(f) {
      var lpd = C.lpdPadrao(f, M.horasDia);
      h += '<tr class="cl" data-ficha="' + e(f.sku) + '"><td><b>' + e(f.sku) + '</b>' + (f.versao ? '<div class="mut">' + e(f.versao) + (f.aprovada.formula ? '' : ' · rascunho') + '</div>' : '') + '</td>' +
        '<td>' + e(f.descricao) + '<div class="mut">' + e(f.cliente || '') + '</div></td><td class="n">' + inteiro(M.vol[f.sku] || 0) + '</td>' +
        '<td class="n">' + brl(f.precoVenda.valor) + '</td><td class="n">' + brl(f.custoVariavel) + '</td><td class="n">' + brl(f.lp) + '</td>' +
        '<td class="n">' + pct(f.margemPct) + '</td><td class="n">' + brl(lpd, 0) + '</td><td class="n">' + brl(f.lpInformado) + '</td>' +
        '<td class="n">' + (f.orcamento ? brl(f.orcamento.lp) : '<span class="mut">—</span>') + '</td><td>' + barraComp(f.composicaoProcedencia) + '</td>' +
        '<td>' + (f.completo ? '<span class="tg ok">completo</span>' : '<span class="tg warn">' + f.pendencias.length + ' pendência' + (f.pendencias.length === 1 ? '' : 's') + '</span>') + '</td></tr>';
    });
    h += '</tbody></table></div>' + (lista.length > 400 ? '<div class="mut" style="margin-top:6px">Mostrando 400 de ' + lista.length + '. Use a busca.</div>' : '') + '</div>';
    return h;
  }

  /* Ficha (diálogo) ────────────────────────────────────────────────────── */
  function abrirFicha(sku) {
    var f = M.fichas[norm(sku)];
    if (!f) return;
    S.fichaSku = f.sku;
    el('dlgT').innerHTML = '<h2>' + e(f.sku) + ' — ' + e(f.descricao) + '</h2><div class="sub">' + e(f.cliente || '') +
      (f.versao ? ' · versão ' + e(f.versao) + ' (fórmula ' + (f.aprovada.formula ? 'aprovada' : 'rascunho') + ', BOM ' + (f.aprovada.bom ? 'aprovado' : 'rascunho') + ')' : '') + '</div>';
    el('dlgB').innerHTML = htmlFicha(f);
    if (!el('dlg').open) el('dlg').showModal();
  }
  function realizadoDoSku(sku) {
    if (!S.realizado3m) S.realizado3m = calcularRealizado(mesMenos(M.ultimaOp ? M.ultimaOp.slice(0, 7) : M.comp, 2) + '-01', M.hoje);
    var lista = S.realizado3m.filter(function(r) { return r.sku === sku && r.completo; });
    if (!lista.length) return null;
    var g = R.consolidar(lista, 'sku')[0];
    return g;
  }
  function htmlFicha(f) {
    var real = S.movimentos ? realizadoDoSku(f.sku) : null;
    var orc = f.orcamento;
    var h = '<div class="tres">' +
      '<div class="col"><div class="t">LP do orçamento</div><div class="v">' + (orc ? brl(orc.lp) : '—') + '</div><div class="mut">' +
        (orc ? 'Preço ' + brl(orc.preco) + ' · insumos ' + brl(orc.custoInsumos) + (orc.faltam.length ? '<br>Falta: ' + e(orc.faltam.join(', ')) : '') : 'Só SKU nascido no CRM com orçamento aprovado') + '</div></div>' +
      '<div class="col"><div class="t">LP padrão</div><div class="v">' + brl(f.lp) + '</div><div class="mut">Preço ' + brl(f.precoVenda.valor) +
        (f.precoVenda.origem ? ' (' + e(f.precoVenda.origem === 'ORCAMENTO_APROVADO' ? 'orçamento aprovado' : 'Gestão Comercial') + ')' : '') + ' · impostos ' + pct(f.impostosPct) + '</div></div>' +
      '<div class="col"><div class="t">LP realizado (3 meses)</div><div class="v">' + (real ? brl(real.lpUnitario) : '—') + '</div><div class="mut">' +
        (real ? real.ops + ' OPs · ' + inteiro(real.produzidoComCusto) + ' un com custo' : (S.movimentos ? 'Sem OP completa no período' : 'Abra a aba Realizado para calcular')) + '</div></div></div>';
    if (orc && f.lp != null && orc.lp != null) {
      var dif = f.lp - orc.lp;
      h += '<div class="alerta ' + (Math.abs(dif) < 0.01 ? 'info' : dif < 0 ? 'warn' : 'info') + '"><div>Padrão − orçamento: <b>' + brl(dif) + '/un</b>. ' +
        (dif < 0 ? 'A fábrica, com o custo de hoje, deixa menos do que o Comercial vendeu: confira preço de material e ritmo.' : 'O custo padrão está abaixo do orçado.') + '</div></div>';
    }
    h += '<div class="grid2"><div><h3>Custo por unidade</h3>' +
      kv('Granel (sem perda)', brl(f.granel.custoPorPeca) + (f.granel.custoPorKg != null ? ' <span class="mut">· ' + brl(f.granel.custoPorKg, 2) + '/kg × ' + (f.granel.massaKgPorPeca != null ? dec(f.granel.massaKgPorPeca, 4) + ' kg' : '?') + '</span>' : '')) +
      kv('Embalagem', brl(f.embalagem.custoPorPeca)) +
      kv('Perdas padrão', brl(f.perdas.custoPorPeca) + ' <span class="mut">· processo ' + pct(f.perdas.perdaProcessoPct) + ', linha ' + pct(f.perdas.perdaLinhaPct) + '</span>') +
      kv('Operação direta', f.operacao ? brl(f.operacao.custoPorPeca) + ' <span class="mut">· ' + brl(f.operacao.custoHora, 2) + '/h ÷ ' + inteiro(f.operacao.ritmo) + ' un/h (' + e(rotRitmo(f.ritmo)) + ')</span>' : '<span class="mut">—</span>') +
      kv('<b>Custo variável</b>', '<b>' + brl(f.custoVariavel) + '</b>') +
      kv('Custo pleno (com fixos de produção)', brl(f.custoPleno) + ' <span class="mut">· para precificar</span>') +
      kv('Preço líquido de impostos', brl(f.precoLiquido)) +
      kv('<b>LP</b>', '<b>' + brl(f.lp) + '</b>' + (f.margemPct != null ? ' <span class="mut">(' + pct(f.margemPct) + ')</span>' : '')) +
      kv('LP informado no Cadastros', brl(f.lpInformado)) +
      '</div><div><h3>Origem do custo</h3>' + barraComp(f.composicaoProcedencia) + legendaFontes() +
      Object.keys(f.composicaoProcedencia).map(function(k) { return kv(ROT_FONTE[k] || k, pct(f.composicaoProcedencia[k])); }).join('') +
      (f.granel.densidade ? kv('Densidade', dec(f.granel.densidade.valor, 3) + ' g/mL <span class="mut">(' + (f.granel.densidade.origem === 'CADASTRO' ? 'cadastro' : 'máximo da especificação') + ')</span>') : '') +
      '</div></div>';
    if (f.avisos.length) h += '<div class="alerta warn" style="margin-top:10px"><div>' + f.avisos.map(e).join('<br>') + '</div></div>';
    if (f.pendencias.length) {
      h += '<h3 style="margin-top:14px">O que falta para ter LP</h3><div class="tw"><table><thead><tr><th>Tipo</th><th>Item</th><th>Motivo</th><th>Resolver</th></tr></thead><tbody>' +
        f.pendencias.map(function(p) { return '<tr><td><span class="tg ' + (p.tipo === 'PRECO_MATERIAL' ? 'warn' : 'bad') + '">' + e(rotPend(p.tipo)) + '</span></td><td>' + e(p.codigo || '') + ' ' + e(p.nome || '') +
          '</td><td>' + e(p.texto) + '</td><td>' + acaoPendencia(p, f) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    h += '<h3 style="margin-top:14px">Fórmula ' + e(f.versao || '') + '</h3>' + tabelaLinhas(f.granel.linhas, true, f);
    h += '<h3 style="margin-top:14px">BOM</h3>' + tabelaLinhas(f.embalagem.linhas, false, f);
    return h;
  }
  function kv(k, v) { return '<div class="linha-kv"><span>' + k + '</span><span>' + v + '</span></div>'; }
  function rotRitmo(r) { return {CADASTRO: 'cadastro', HISTORICO: 'histórico, menor que o cadastro', GRUPO: 'média do grupo', PLANTA: 'mediana da planta'}[r && r.origem] || '—'; }
  function rotPend(t) { return {PRECO_MATERIAL: 'Preço', CADASTRO: 'Cadastro', PRECO_VENDA: 'Preço de venda', DENSIDADE: 'Densidade', UNIDADE: 'Unidade', OPERACAO: 'Operação', IMPOSTOS: 'Impostos'}[t] || t; }
  function acaoPendencia(p, f) {
    if (p.tipo === 'PRECO_MATERIAL' && p.codigo && M.ctx.idx[p.codigo]) return formPreco(M.ctx.idx[p.codigo].key, p.codigo);
    if (p.tipo === 'PRECO_VENDA') return '<a class="btn sm" href="gestao_comercial.html" target="_blank" rel="noopener">Gestão Comercial</a>';
    if (p.tipo === 'IMPOSTOS' || p.tipo === 'OPERACAO') return '<button class="btn sm" data-ir="parametros">Parâmetros</button>';
    if (p.tipo === 'CADASTRO' || p.tipo === 'DENSIDADE' || p.tipo === 'UNIDADE') {
      var q = p.codigo && /^[A-Z]+-\d+/.test(p.codigo) ? 'cadastros.html?tab=materiais&q=' + encodeURIComponent(p.codigo) : 'cadastros.html?tab=produtos&q=' + encodeURIComponent(f.sku);
      return '<a class="btn sm" href="' + q + '" target="_blank" rel="noopener">Abrir no Cadastros</a>';
    }
    return '';
  }
  function formPreco(key, codigo) {
    var m = (D.materiais || {})[key] || {};
    return '<span style="display:inline-flex;gap:4px;align-items:center"><input class="inp num" data-preco-key="' + e(key) + '" placeholder="R$ / ' + e(m.unidade || 'un') + '" inputmode="decimal" aria-label="Preço de ' + e(codigo) + '">' +
      '<button class="btn sm" data-salvar-preco="' + e(key) + '">Salvar</button></span>';
  }
  function tabelaLinhas(linhas, granel, f) {
    if (!linhas || !linhas.length) return '<div class="vazio"><b>Sem itens.</b></div>';
    var mc = ((D.custos || {}).material_cliente || {})[C.chaveSku(f.sku)] || {};
    return '<div class="tw"><table><thead><tr><th>Código</th><th>Material</th>' + (granel ? '<th class="n">% m/m</th><th class="n">R$/kg</th><th class="n">No kg</th>' : '<th class="n">Qtd/peça</th><th class="n">Preço</th><th class="n">Na peça</th>') +
      '<th>Origem</th><th>Motivo</th><th>Do cliente</th></tr></thead><tbody>' +
      linhas.map(function(l) {
        var achado = M.ctx.idx[l.codigo];
        var pr = achado ? M.ctx.precos[achado.key] : null;
        return '<tr><td>' + e(l.codigo || '—') + '</td><td>' + e(l.nome || (achado && achado.material.mpNome) || '') + '</td>' +
          (granel ? '<td class="n">' + pct(l.percentualMM, 3) + '</td><td class="n">' + brl(l.precoPorKg, 2) + '</td><td class="n">' + brl(l.custoNoKg) + '</td>'
            : '<td class="n">' + (l.qtdPorPeca != null ? Number(l.qtdPorPeca).toLocaleString('pt-BR', {maximumFractionDigits: 5}) : '—') + ' ' + e((l.unidade || '').toLowerCase()) + '</td><td class="n">' + brl(l.precoUnitario) + '</td><td class="n">' + brl(l.custoNaPeca) + '</td>') +
          '<td>' + tagFonte(l.fonte) + (pr && pr.ref ? '<div class="mut">' + e(pr.ref) + '</div>' : '') + '</td><td>' + e(l.motivo || '') +
          (l.fonte === 'SEM_CUSTO' && achado ? '<div style="margin-top:4px">' + formPreco(achado.key, l.codigo) + '</div>' : '') + '</td>' +
          '<td>' + (achado ? '<label style="font-size:12px"><input type="checkbox" data-mat-cliente="' + e(achado.key) + '"' + (mc[achado.key] ? ' checked' : '') + '> sim</label>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* Realizado ──────────────────────────────────────────────────────────── */
  function carregarMovimentos() {
    S.movimentos = {};
    db.ref('movimentos_estoque').once('value').then(function(s) { S.movimentos = s.val() || {}; S.realizado = null; S.realizado3m = null; render(); },
      function(err) { avisosCarga.push('movimentos_estoque: ' + erroMsg(err)); render(); });
  }
  function calcularRealizado(desde, ate) {
    var regs = R.achatarRegistros(D.registros);
    var porLote = {};
    regs.forEach(function(r) { var l = String(r.lote || '').trim(); if (l) (porLote[l] = porLote[l] || []).push(r); });
    var params = (D.custos || {}).parametros || {};
    var out = [];
    Object.keys(D.ops || {}).forEach(function(k) {
      var o = D.ops[k];
      if (!o || !(num(o.produzido) > 0)) return;
      var dia = String(o.dataFimReal || o.dataInicioReal || '').slice(0, 10);
      if (!dia || dia < desde || dia > ate) return;
      var f = o.sku ? M.fichas[norm(o.sku)] : null;
      var prod = o.sku ? M.ctx.produtoPorSku[norm(o.sku)] : null;
      var pv = C.precoVendaVigente(M.pvPorSku[norm(o.sku)] || null, dia);
      if (!(pv.valor > 0) && f) pv = f.precoVenda;
      var lote = String(o.lote || '').trim();
      out.push(R.custoRealizadoOp({opKey: k, op: o, ficha: f, apontamentos: porLote[lote] || [],
        perdasPorTipo: R.perdasDoLote((D.perdas || {})[R.loteKey(o.lote)], o),
        consumos: R.consumosDoLote(S.movimentos || {}, D.estoque_lotes, lote),
        precos: M.ctx.precos, idx: M.ctx.idx, taxa: M.taxa, precoVenda: pv, impostosPct: C.impostosPct(params, prod && prod.clienteKey)}));
    });
    return out;
  }
  function abaRealizado() {
    if (!S.movimentos) return '<div class="vazio"><b>Carregando consumos e apontamentos…</b></div>';
    var meses = {};
    Object.keys(D.ops || {}).forEach(function(k) { var d = String((D.ops[k] || {}).dataFimReal || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(d)) meses[d] = 1; });
    var lm = Object.keys(meses).sort().reverse();
    if (!S.mesReal) S.mesReal = lm[0] || M.comp;
    var desde = S.mesReal === 'ult3' ? mesMenos(lm[0] || M.comp, 2) + '-01' : S.mesReal + '-01';
    var ate = S.mesReal === 'ult3' ? (lm[0] || M.comp) + '-31' : S.mesReal + '-31';
    S.realizado = calcularRealizado(desde, ate);
    var lista = S.realizado;
    var grupos = R.consolidar(lista, S.nivel === 'op' ? 'sku' : S.nivel);
    var tot = R.consolidar(lista.map(function(r) { return Object.assign({}, r, {dia: '0000-00'}); }), 'mes')[0];
    var teoricas = lista.filter(function(r) { return r.custo.materialFonte === 'TEORICO'; }).length;
    var semHoras = lista.filter(function(r) { return r.horasFonte === 'PADRAO'; }).length;
    var h = '<div class="card"><div class="barra"><select class="sel" id="fMesReal"><option value="ult3"' + (S.mesReal === 'ult3' ? ' selected' : '') + '>Últimos 3 meses com OP</option>' +
      lm.map(function(m) { return '<option value="' + m + '"' + (m === S.mesReal ? ' selected' : '') + '>' + mesBR(m) + '</option>'; }).join('') + '</select>' +
      '<select class="sel" id="fNivel">' + [['mes', 'Por mês'], ['cliente', 'Por cliente'], ['pedido', 'Por pedido'], ['pedidoSku', 'Por pedido × SKU'], ['sku', 'Por SKU'], ['linha', 'Por linha'], ['op', 'OP a OP']]
        .map(function(o) { return '<option value="' + o[0] + '"' + (S.nivel === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<span class="pill">' + lista.length + ' OPs · ' + inteiro(tot ? tot.produzido : 0) + ' un</span></div>';
    h += '<div class="alerta info"><div>Material pelo <b>consumo baixado no apontamento</b>, valorizado pelo custo do lote (gravado no recebimento desde 26/10) ou pelo preço vigente; sem consumo apontado, pelo teórico da ficha (' + teoricas + ' de ' + lista.length + ' OPs). O envase baixa a embalagem <b>pela ficha</b> (BOM × apontado): a variação de consumo só aparece onde há pesagem medida. ' +
      'Operação pelas <b>horas trabalhadas apontadas</b>, nunca pela duração da OP; sem horas apontadas, pelas horas-padrão (' + semHoras + ' OPs — eficiência não medida nelas).</div></div>';
    if (tot) {
      h += '<div class="kpis">' + kpi(tot.coberturaPct >= 60 ? 'ok' : 'warn', 'Unidades com custo completo', pct(tot.coberturaPct), inteiro(tot.produzidoComCusto) + ' de ' + inteiro(tot.produzido)) +
        kpi('info', 'Receita líquida (com custo)', brl(tot.receitaLiquida, 0), 'preço vigente na data da OP, menos impostos') +
        kpi(tot.lp != null && tot.lp >= 0 ? 'ok' : 'bad', 'LP realizado', brl(tot.lp, 0), tot.lpUnitario != null ? brl(tot.lpUnitario) + ' por unidade' : '') +
        kpi('warn', 'Variações (real − padrão)', brl(somaMedidas(tot.variacoes), 0),
          'preço ' + brl(tot.variacoes.preco, 0) + ' · consumo ' + (tot.variacoes.consumo == null ? 'não medido' : brl(tot.variacoes.consumo, 0)) + ' · perda ' + brl(tot.variacoes.perda, 0) + ' · eficiência ' + brl(tot.variacoes.eficiencia, 0)) + '</div>';
    }
    if (S.nivel === 'op') {
      h += '<div class="tw"><table><thead><tr><th>OP / lote</th><th>SKU</th><th>Linha</th><th>Fim</th><th class="n">Produzido</th><th class="n">Horas</th><th class="n">Material</th><th class="n">Perdas</th><th class="n">Operação</th><th class="n">LP</th><th class="n">LP/un</th><th class="n">Padrão/un</th><th>Avisos</th></tr></thead><tbody>' +
        lista.sort(function(a, b) { return String(b.dia).localeCompare(String(a.dia)); }).map(function(r) {
          return '<tr><td>' + e(r.lote || r.opKey) + '</td><td class="cl" data-ficha="' + e(r.sku) + '">' + e(r.sku) + '</td><td>' + e(r.linha) + '</td><td>' + dataBR(r.dia) + '</td><td class="n">' + inteiro(r.produzido) +
            '</td><td class="n">' + (r.horas != null ? dec(r.horas, 1) : '—') + (r.horasFonte === 'PADRAO' ? '<span class="mut"> p</span>' : '') + '</td><td class="n">' + brl(r.custo.material, 0) + (r.custo.materialFonte === 'TEORICO' ? '<span class="mut"> t</span>' : '') +
            '</td><td class="n">' + brl(r.custo.perdas, 0) + '</td><td class="n">' + brl(r.custo.operacao, 0) + '</td><td class="n">' + brl(r.lp, 0) + '</td><td class="n">' + brl(r.lpUnitario) + '</td><td class="n">' + brl(r.lpPadraoUnitario) +
            '</td><td class="mut" style="max-width:260px">' + e(r.avisos.join(' ')) + '</td></tr>';
        }).join('') + '</tbody></table></div><div class="mut" style="margin-top:6px">p = horas-padrão (sem horas apontadas) · t = material teórico (sem consumo apontado)</div>';
    } else {
      h += '<div class="tw"><table><thead><tr><th>' + e({mes: 'Mês', cliente: 'Cliente', pedido: 'Pedido', pedidoSku: 'Pedido × SKU', sku: 'SKU', linha: 'Linha'}[S.nivel]) + '</th><th class="n">OPs</th><th class="n">Produzido</th><th class="n">Cobertura</th>' +
        '<th class="n">Receita líq.</th><th class="n">Material</th><th class="n">Perdas</th><th class="n">Operação</th><th class="n">LP</th><th class="n">LP/un</th><th class="n">Var. preço</th><th class="n">Var. consumo</th><th class="n">Var. perda</th><th class="n">Var. eficiência</th><th>Origem do material</th></tr></thead><tbody>' +
        grupos.map(function(g) {
          return '<tr><td>' + e(S.nivel === 'mes' ? mesBR(g.chave) : g.chave) + '</td><td class="n">' + g.ops + '</td><td class="n">' + inteiro(g.produzido) + '</td><td class="n">' + pct(g.coberturaPct, 0) +
            '</td><td class="n">' + brl(g.receitaLiquida, 0) + '</td><td class="n">' + brl(g.produzidoComCusto ? g.material : null, 0) + '</td><td class="n">' + brl(g.produzidoComCusto ? g.perdas : null, 0) + '</td><td class="n">' + brl(g.produzidoComCusto ? g.operacao : null, 0) +
            '</td><td class="n">' + brl(g.lp, 0) + '</td><td class="n">' + brl(g.lpUnitario) + '</td><td class="n">' + brl(g.variacoes.preco, 0) + '</td><td class="n">' + brl(g.variacoes.consumo, 0) + '</td><td class="n">' + brl(g.variacoes.perda, 0) + '</td><td class="n">' + brl(g.variacoes.eficiencia, 0) + '</td><td class="mut">' + origemTxt(g.procedenciaPct) + '</td></tr>';
        }).join('') + (grupos.length ? '' : '<tr><td colspan="15"><div class="vazio"><b>Sem OP concluída no período.</b></div></td></tr>') + '</tbody></table></div>';
    }
    return h + '</div>';
  }

  // Soma só as variações medidas; nenhuma medida -> null.
  function somaMedidas(v) {
    var ks = Object.keys(v || {}).filter(function(k) { return v[k] != null; });
    return ks.length ? ks.reduce(function(s, k) { return s + v[k]; }, 0) : null;
  }

  // Plano §6: quanto do custo de material de cada nível é PAGO, COTADO, ESTIMADO P&D...
  function origemTxt(pcts) {
    var ks = Object.keys(pcts || {}).filter(function(f) { return pcts[f] > 0; }).sort(function(a, b) { return pcts[b] - pcts[a]; });
    return ks.length ? ks.map(function(f) { return e(ROT_FONTE[f] || f) + ' ' + pct(pcts[f], 0); }).join(' · ') : '—';
  }

  /* Pendências ─────────────────────────────────────────────────────────── */
  function planoPrecos() {
    var formulaPorSku = {}, bomPorSku = {};
    Object.keys(M.vol).forEach(function(s) {
      var p = M.ctx.produtoPorSku[s]; if (!p) return;
      var vs = C.versaoParaCusto(p.sku, D.formulas, D.bom, D.especificacoes);
      if (vs.formula) formulaPorSku[s] = vs.formula;
      if (vs.bom) bomPorSku[s] = vs.bom;
    });
    return C.planoCadastroPorSku({volumePorSku: M.vol, formulaPorSku: formulaPorSku, bomPorSku: bomPorSku, idxMateriais: M.ctx.idx, precos: M.ctx.precos});
  }
  function itensPd() {
    var dep = (D.custos || {}).depara_pd || {};
    var g = {};
    Object.keys(D.pd_formula_items || {}).forEach(function(k) {
      var it = D.pd_formula_items[k];
      if (!it || it.is_deleted || it.material_code || !(num(it.price_per_kg) > 0)) return;
      var dk = C.depKey(it.ingredient_name);
      var x = g[dk] = g[dk] || {dk: dk, nome: it.ingredient_name, inci: it.inci || '', usos: 0, preco: 0, em: ''};
      x.usos++;
      var em = it.updated_at || it.created_at || '';
      if (em >= x.em) { x.em = em; x.preco = num(it.price_per_kg); }
    });
    return Object.keys(g).map(function(k) { var x = g[k]; x.dep = dep[k] || null; return x; })
      .sort(function(a, b) { return (a.dep ? 1 : 0) - (b.dep ? 1 : 0) || b.usos - a.usos; });
  }
  function abaPendencias() {
    var plano = planoPrecos();
    var h = '<div class="card"><h2>Fila de preços — na ordem que fecha mais volume</h2><div class="sub" style="margin:0 0 10px">Cada preço digitado aqui entra como <b>MANUAL</b> (sem documento). ' +
      'Pedido de Compra (PAGO) e cotação (COTADO) do mesmo material passam na frente sozinhos, e o manual fica no histórico. ' +
      'Unidade: a do cadastro do material (preço por kg, por litro, por unidade, por rolo…).</div>';
    h += '<div class="leg">' + [10, 25, 50, 75].map(function(a) { return '<span><b>' + C.precosParaVolume(plano.marcos, a) + '</b> preços → ' + a + '% do volume</span>'; }).join('') + '</div>';
    var faltam = plano.sequencia.slice(0, 120);
    if (!faltam.length) h += '<div class="vazio"><b>Nenhum preço faltando nos SKUs com volume.</b></div>';
    else {
      var porSku = {};
      plano.skusFechados.forEach(function(s) { porSku[s.sku] = s; });
      h += '<div class="tw"><table><thead><tr><th>#</th><th>Material</th><th>Tipo</th><th>Un.</th><th>Fecha o SKU</th><th class="n">Volume do SKU</th><th>Preço (R$ por unidade do cadastro)</th></tr></thead><tbody>' +
        faltam.map(function(s, i) {
          return '<tr><td class="mut">' + (i + 1) + '</td><td><b>' + e(s.codigo) + '</b> ' + e(s.nome || '') + '</td><td>' + e(s.tipo || '') + '</td><td>' + e((s.unidade || '').toLowerCase()) + '</td>' +
            '<td class="cl" data-ficha="' + e(s.desbloqueouSku) + '">' + e(s.desbloqueouSku) + '</td><td class="n">' + inteiro((porSku[s.desbloqueouSku] || {}).volume) + '</td><td>' + formPreco(s.key, s.codigo) + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (plano.sequencia.length > 120 ? '<div class="mut" style="margin-top:6px">Mostrando os 120 primeiros de ' + plano.sequencia.length + '.</div>' : '');
    }
    if (plano.bloqueadosPorCadastro.length) {
      h += '<details style="margin-top:10px"><summary>' + plano.bloqueadosPorCadastro.length + ' SKUs travados por cadastro (item sem código ou material inexistente) — preço não resolve</summary>' +
        plano.bloqueadosPorCadastro.slice(0, 60).map(function(b) { return '<div class="linha-kv"><span class="cl" data-ficha="' + e(b.sku) + '">' + e(b.sku) + '</span><span>' + inteiro(b.volume) + ' un · ' + e(b.orfaos.join(', ') || 'item sem código') + '</span></div>'; }).join('') + '</details>';
    }
    h += '</div>';
    // De-para P&D
    var pd = itensPd(), pend = pd.filter(function(x) { return !x.dep; });
    var q = norm(S.qdep);
    h += '<div class="card"><h2>Estimativa do P&D → material do cadastro</h2><div class="sub" style="margin:0 0 10px">O P&D põe R$/kg em cada ingrediente da fórmula de amostra. Para virar <b>ESTIMADO P&D</b> no custo, o ingrediente precisa estar ligado ao material do cadastro. ' +
      'As sugestões são por nome/INCI e <b>precisam de confirmação</b>: medido em 26/10, só 25 de 170 casam pelo nome exato. ' + pend.length + ' pendentes de ' + pd.length + '.</div>' +
      '<div class="barra"><input class="busca" id="qDep" placeholder="Ingrediente do P&D…" value="' + e(S.qdep) + '"></div>';
    var vis = pd.filter(function(x) { return !q || norm(x.nome).indexOf(q) >= 0; }).slice(0, 40);
    h += '<div class="tw"><table><thead><tr><th>Ingrediente (P&D)</th><th class="n">R$/kg</th><th class="n">Usos</th><th>Ligado a / sugestões</th><th></th></tr></thead><tbody>' +
      vis.map(function(x) {
        var col;
        if (x.dep) col = x.dep.ignorar ? '<span class="tg mute">ignorado</span>' : '<span class="tg ok">' + e(x.dep.materialCodigo) + '</span> ' + e(x.dep.materialNome || '');
        else col = C.sugerirDeparaPd(x.nome, x.inci, D.materiais, 3).map(function(s) {
          return '<button class="btn sm" data-depara="' + e(x.dk) + '" data-mat="' + e(s.key) + '" title="semelhança ' + Math.round(s.score * 100) + '%">' + e(s.codigo) + ' ' + e(s.nome) + '</button>'; }).join(' ') || '<span class="mut">sem sugestão</span>';
        return '<tr><td>' + e(x.nome) + (x.inci ? '<div class="mut">' + e(x.inci) + '</div>' : '') + '</td><td class="n">' + brl(x.preco, 2) + '</td><td class="n">' + x.usos + '</td><td>' + col + '</td><td>' +
          (x.dep ? '<button class="btn sm" data-desfaz-depara="' + e(x.dk) + '">Desfazer</button>' : '<span style="display:inline-flex;gap:4px"><input class="inp" style="width:120px" placeholder="Código MP…" data-depara-cod="' + e(x.dk) + '"><button class="btn sm" data-depara-manual="' + e(x.dk) + '">Ligar</button><button class="btn sm" data-ignorar="' + e(x.dk) + '">Ignorar</button></span>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    // Outras pendências por tipo
    var porTipo = {};
    Object.values(M.fichas).forEach(function(f) {
      if (!(M.vol[f.sku] > 0)) return;
      f.pendencias.forEach(function(p) { if (p.tipo !== 'PRECO_MATERIAL') (porTipo[p.tipo] = porTipo[p.tipo] || {})[f.sku] = f; });
    });
    h += '<div class="card"><h2>Outras pendências (SKUs com volume)</h2>' + Object.keys(porTipo).map(function(t) {
      var skus = Object.keys(porTipo[t]).sort(function(a, b) { return (M.vol[b] || 0) - (M.vol[a] || 0); });
      return '<details><summary>' + e(rotPend(t)) + ' — ' + skus.length + ' SKUs</summary>' + skus.slice(0, 80).map(function(s) {
        var f = porTipo[t][s];
        var txt = f.pendencias.filter(function(p) { return p.tipo === t; }).map(function(p) { return (p.codigo ? p.codigo + ': ' : '') + p.texto; });
        return '<div class="linha-kv"><span class="cl" data-ficha="' + e(s) + '"><b>' + e(s) + '</b> ' + e(f.descricao) + '</span><span class="mut" style="text-align:right">' + inteiro(M.vol[s]) + ' un · ' + e(txt.slice(0, 3).join('; ')) + '</span></div>';
      }).join('') + '</details>';
    }).join('') + '</div>';
    return h;
  }

  /* Preços ─────────────────────────────────────────────────────────────── */
  function abaPrecos() {
    var q = norm(S.qp);
    var lista = Object.keys(M.ctx.precos).map(function(k) { return {key: k, m: (D.materiais || {})[k] || {}, p: M.ctx.precos[k]}; })
      .filter(function(x) { return !q || (norm(x.m.mpCodigo) + ' ' + norm(x.m.mpNome)).indexOf(q) >= 0; })
      .sort(function(a, b) { return (C.MATURIDADE[b.p.fonte] || 0) - (C.MATURIDADE[a.p.fonte] || 0) || String(a.m.mpCodigo).localeCompare(String(b.m.mpCodigo)); });
    var desvios = Object.values(M.ctx.precos).filter(function(p) { return p.desvioEstimativaPd; });
    var erroMedio = desvios.length ? desvios.reduce(function(s, p) { return s + Math.abs(p.desvioEstimativaPd.pct); }, 0) / desvios.length : null;
    var cont = {};
    Object.values(M.ctx.precos).forEach(function(p) { cont[p.fonte] = (cont[p.fonte] || 0) + 1; });
    var h = '<div class="kpis">' + ['PAGO', 'COTADO', 'MANUAL', 'ESTIMADO_PD'].map(function(f) { return kpi('info', ROT_FONTE[f], inteiro(cont[f] || 0), 'materiais com preço vigente desta origem'); }).join('') +
      kpi(erroMedio == null ? 'mute' : erroMedio < 15 ? 'ok' : 'warn', 'Erro da estimativa do P&D', pct(erroMedio), desvios.length + ' materiais com estimativa e preço de verdade (mesma unidade)') + '</div>';
    h += '<div class="card"><div class="barra"><input class="busca" id="qPreco" placeholder="Código ou nome do material…" value="' + e(S.qp) + '"><span class="pill">' + lista.length + ' com preço de ' + Object.keys(D.materiais || {}).length + ' materiais</span></div>' +
      '<div class="sub" style="margin:0 0 8px">O estágio mais maduro vence: <b>Pago › Cotado › Manual › Estimado P&D</b>. Substituir não apaga: o histórico inteiro fica abaixo de cada material.</div>' +
      '<div class="tw"><table><thead><tr><th>Material</th><th>Un.</th><th class="n">Vigente</th><th>Origem</th><th>Documento</th><th>Data</th><th class="n">Erro do P&D</th><th>Histórico</th><th>Manual</th></tr></thead><tbody>' +
      lista.slice(0, 300).map(function(x) {
        var d = x.p.desvioEstimativaPd;
        return '<tr><td><b>' + e(x.m.mpCodigo) + '</b> ' + e(x.m.mpNome) + '</td><td>' + e((x.p.unidade || x.m.unidade || '').toLowerCase()) + '</td><td class="n">' + brl(x.p.valor, 4) + '</td><td>' + tagFonte(x.p.fonte) + '</td><td>' + e(x.p.ref || '') +
          '</td><td>' + dataBR(x.p.em) + '</td><td class="n">' + (d ? '<span class="' + (Math.abs(d.pct) > 20 ? 'neg' : '') + '">' + (d.pct > 0 ? '+' : '') + pct(d.pct) + '</span>' : '<span class="mut">—</span>') + '</td>' +
          '<td>' + (x.p.historico.length > 1 ? '<details><summary>' + x.p.historico.length + '</summary>' + x.p.historico.map(function(hh) { return '<div class="mut" style="white-space:nowrap">' + tagFonte(hh.fonte) + ' ' + brl(hh.valor, 4) + ' · ' + dataBR(hh.em) + ' · ' + e(hh.ref || '') + '</div>'; }).join('') + '</details>' : '<span class="mut">—</span>') + '</td>' +
          '<td>' + formPreco(x.key, x.m.mpCodigo) + '</td></tr>';
      }).join('') + (lista.length ? '' : '<tr><td colspan="9"><div class="vazio"><b>Nenhum material com preço.</b>Comece pela fila em Pendências.</div></td></tr>') + '</tbody></table></div></div>';
    return h;
  }

  /* Resultado e bônus ──────────────────────────────────────────────────── */
  function abaResultado() {
    var res = D.resultado || {}, params = (D.custos || {}).parametros || {};
    var tab = (res.tabelas || {})[M.comp], prox = (res.tabelas || {})[mesMenos(M.comp, -1)];
    var placar = res.placar || {}, dias = placar.dias || {};
    var h = '<div class="grid2"><div class="card"><h3>Tabela de pontos de ' + mesBR(M.comp) + '</h3>';
    if (tab) h += kv('Congelada em', dataBR(tab.congeladaEm) + ' por ' + e(tab.congeladaPor || '')) + kv('Fator', inteiro(tab.fator) + ' pontos por R$ de LP') +
      kv('SKUs que pontuam', inteiro(tab.totalSkus) + ' · fora (sem custo): ' + inteiro(tab.totalFora)) + (tab.motivoSubstituicao ? kv('Substituída', e(tab.motivoSubstituicao)) : '') +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm perigo" data-congelar="' + M.comp + '" data-substituir="1">Substituir (exige motivo)</button></div>';
    else h += '<p class="sub">Ainda não congelada. ' + (num(params.fatorPontos) > 0 ? 'O servidor congela sozinho no primeiro minuto do mês; dá para congelar agora.' : '<b>Defina o fator de pontos em Parâmetros.</b>') + '</p>' +
      '<button class="btn pri sm" data-congelar="' + M.comp + '"' + (num(params.fatorPontos) > 0 ? '' : ' disabled') + '>Congelar ' + mesBR(M.comp) + ' agora</button>';
    h += '<div class="dica" style="margin-top:8px">Pontos = LP padrão × fator, congelados no mês: preço de material atualizado no meio do mês muda o LP da diretoria, não os pontos da fábrica.' + (prox ? ' ' + mesBR(mesMenos(M.comp, -1)) + ' já congelado.' : '') + '</div></div>';
    var mes = (placar.meses || {})[M.comp];
    h += '<div class="card"><h3>Placar de ' + mesBR(M.comp) + '</h3>' + (mes ? kv('Pontos / meta', inteiro(mes.pontos) + ' / ' + inteiro(mes.meta) + ' (' + pct(mes.pct) + ')') + kv('Dias batidos', mes.diasBatidos + ' de ' + mes.dias) + kv('Cobertura (volume com pontos)', pct(mes.coberturaPct)) :
      '<p class="mut">Sem dia com meta no mês.</p>') + kv('Atualizado pelo servidor', placar.hoje ? dataBR(placar.hoje.atualizadoEm) + ' ' + String(placar.hoje.atualizadoEm || '').slice(11, 16) : '—') +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-recalcular="1">Recalcular agora</button><a class="btn sm" href="placar.html" target="_blank" rel="noopener">Abrir o placar da TV</a></div></div></div>';
    var ld = Object.keys(dias).sort().reverse().slice(0, 31);
    h += '<div class="card"><h3>Dias</h3><div class="tw"><table><thead><tr><th>Dia</th><th class="n">Pontos</th><th class="n">Meta</th><th class="n">%</th><th>Batida</th><th class="n">Unidades</th><th class="n">Cobertura</th><th class="n">Desc. perdas</th><th class="n">Desc. retrabalho</th><th class="n">Lote reprovado</th><th class="n">Divergência PA</th><th class="n">Consumo escondido</th></tr></thead><tbody>' +
      (ld.length ? ld.map(function(k) { var d = dias[k], ds = d.descontos || {};
        return '<tr><td>' + dataBR(k) + '</td><td class="n">' + inteiro(d.pontos) + '</td><td class="n">' + inteiro(d.meta) + '</td><td class="n">' + pct(d.pct) + '</td><td>' + (d.meta > 0 ? (d.batida ? '<span class="tg ok">sim</span>' : '<span class="tg warn">não</span>') : '<span class="mut">sem meta</span>') +
          '</td><td class="n">' + inteiro(d.unidades) + '</td><td class="n">' + pct(d.coberturaPct, 0) + '</td><td class="n">' + inteiro(ds.perdas) + '</td><td class="n">' + inteiro(ds.retrabalho) + '</td><td class="n">' + inteiro(ds.loteReprovado) + '</td><td class="n">' + inteiro(ds.divergenciaPA) + '</td><td class="n">' + inteiro(ds.consumoEscondido) + '</td></tr>'; }).join('')
        : '<tr><td colspan="11"><div class="vazio"><b>Nenhum dia no placar.</b>O servidor grava a cada 5 minutos quando há apontamento e tabela de pontos congelada.</div></td></tr>') + '</tbody></table></div></div>';
    // Programa do dia
    var hojeProg = (res.programa || {})[S.diaProg || M.hoje] || {};
    var linhas = ((D.config || {}).linhas || ['Linha 1', 'Linha 2', 'Linha 3']);
    h += '<div class="grid2"><div class="card"><h3>Programa do dia (horas por linha)</h3><div class="sub" style="margin:0 0 8px">Sem programa informado, a meta usa o turno inteiro de cada linha que operou. Informe quando o PCP programar menos horas (ex.: linha só de manhã). Até as telas de planejamento existirem, é aqui.</div>' +
      '<div class="barra"><input type="date" class="inp" id="diaProg" value="' + e(S.diaProg || M.hoje) + '">' + linhas.map(function(l) {
        return '<label style="font-size:12px">' + e(l) + ' <input class="inp num" style="width:70px" data-prog="' + e(l) + '" value="' + e(hojeProg[l] != null ? hojeProg[l] : '') + '" placeholder="turno"></label>'; }).join('') +
      '<button class="btn sm" id="btnProg">Salvar</button></div></div>';
    // Portões
    var portoes = (res.portoes || {})[M.comp] || {};
    h += '<div class="card"><h3>Portões do bônus — ' + mesBR(M.comp) + '</h3><div class="sub" style="margin:0 0 8px">Reclamação/devolução com causa na fábrica reduz o bônus do mês (' + pct(params.reducaoReclamacaoPct != null ? params.reducaoReclamacaoPct : 50, 0) + '); acidente com afastamento zera a semana (o RH também registra).</div>' +
      Object.keys(portoes).map(function(k) { var p = portoes[k]; return '<div class="linha-kv"><span><span class="tg ' + (p.tipo === 'ACIDENTE' ? 'bad' : 'warn') + '">' + e(p.tipo === 'ACIDENTE' ? 'Acidente' : 'Reclamação') + '</span> ' + dataBR(p.data) + ' — ' + e(p.descricao || '') + '</span><button class="btn sm" data-del-portao="' + e(k) + '">Remover</button></div>'; }).join('') +
      '<div class="barra" style="margin-top:8px"><select class="sel" id="ptTipo"><option value="RECLAMACAO">Reclamação/devolução</option><option value="ACIDENTE">Acidente com afastamento</option></select><input type="date" class="inp" id="ptData" value="' + M.hoje + '"><input class="inp" id="ptDesc" placeholder="Descrição" style="flex:1;min-width:160px"><button class="btn sm" id="btnPortao">Registrar</button></div></div></div>';
    // Fechamento
    var fech = res.fechamentos || {};
    var ant = mesMenos(M.comp, 1);
    h += '<div class="card"><h3>Fechamento do mês</h3>' + (fech[ant] ? kv(mesBR(ant), 'fechado em ' + dataBR(fech[ant].fechadoEm) + ' · ' + pct(fech[ant].pct) + ' · bônus ' + brl(fech[ant].bonus, 2) + (fech[ant].bonusValendo ? '' : ' <span class="tg mute">piloto, não pago</span>')) :
      '<p class="sub">' + mesBR(ant) + ' ainda aberto. Fechar congela o número do mês: o placar dele não é mais regravado.</p><button class="btn sm" data-fechar="' + ant + '">Fechar ' + mesBR(ant) + '</button>') +
      Object.keys(fech).filter(function(k) { return k !== ant; }).sort().reverse().map(function(k) { var x = fech[k]; return kv(mesBR(k), pct(x.pct) + ' · bônus ' + brl(x.bonus, 2) + (x.bonusValendo ? '' : ' (piloto)')); }).join('') + '</div>';
    h += abaSimulacao();
    return h;
  }
  function abaSimulacao() {
    var params = (D.custos || {}).parametros || {};
    var sim = S.simul;
    var meses = {};
    Object.keys(D.registros || {}).forEach(function(d) { if (/^\d{4}-\d{2}/.test(d)) meses[d.slice(0, 7)] = 1; });
    var lm = Object.keys(meses).sort();
    var ateDef = lm[lm.length - 1] || M.comp, desdeDef = lm.length >= 3 ? lm[lm.length - 3] : lm[0] || M.comp;
    var h = '<div class="card"><h2>Simulação (Fase 4) — calibrar fator, % alvo e faixas</h2><div class="sub" style="margin:0 0 10px">Roda o placar sobre os apontamentos reais do período com a ficha de HOJE (o placar oficial usa a tabela congelada de cada mês). ' +
      'É o que mostra se a meta é batível e quanto o bônus custaria antes de anunciar.</div><div class="form">' +
      campo('simDesde', 'De (mês)', 'month', sim ? sim.desde : desdeDef) + campo('simAte', 'Até (mês)', 'month', sim ? sim.ate : ateDef) +
      campo('simFator', 'Fator de pontos', 'number', sim ? sim.fator : (params.fatorPontos || 25)) + campo('simAlvo', '% alvo da meta', 'number', sim ? sim.alvo : (params.metaAlvoPct || 85)) +
      campo('simBase', 'Bônus base do mês (R$)', 'number', sim ? sim.base : (params.bonusBase || '')) +
      campo('simFaixas', 'Faixas (pct:mult; …)', 'text', sim ? sim.faixasTxt : faixasTxt(params.faixasBonus) || '100:1; 110:1.2; 120:1.4') +
      '<div><label>&nbsp;</label><label style="font-size:13px;font-weight:600"><input type="checkbox" id="simInf"' + (sim ? (sim.lpInf ? ' checked' : '') : (params.usarLpInformado ? ' checked' : '')) + '> Usar o LP digitado no Cadastros onde a ficha não fecha</label></div>' +
      '<div><label>&nbsp;</label><button class="btn pri" id="btnSimular">Simular</button></div></div>';
    if (sim && sim.r) {
      var r = sim.r;
      h += '<div class="kpis" style="margin-top:14px">' + kpi(r.diasBatidosPct >= 50 && r.diasBatidosPct <= 85 ? 'ok' : 'warn', 'Dias batidos', pct(r.diasBatidosPct), r.diasBatidos + ' de ' + r.dias + ' dias com meta' + (r.indisponiveis ? ' · ' + r.indisponiveis + ' sem tabela' : '')) +
        kpi('info', 'Semanas batidas', r.semanasBatidas + ' de ' + r.semanas.length, 'a semana soma os dias') +
        kpi('info', 'Cobertura média', pct(r.coberturaMediaPct), 'do volume do dia com pontos (SKU sem custo fica fora da meta e da contagem)') +
        kpi('warn', 'Custo do bônus no período', brl(r.custoBonus, 2), r.bonus.map(function(b) { return mesBR(b.mes) + ' ' + pct(b.pct, 0) + (b.mult ? ' ×' + b.mult : ''); }).join(' · ')) + '</div>' +
        '<div class="dica">SKUs que pontuam na simulação: ' + sim.skus + '. Uma meta batida em 100% dos dias não motiva; em 10%, desanima. A faixa saudável costuma ficar entre metade e ~85% dos dias.</div>';
    } else if (sim && sim.erro) h += '<div class="alerta bad" style="margin-top:10px"><div>' + e(sim.erro) + '</div></div>';
    return h + '</div>';
  }
  function campo(id, rot, tipo, v) { return '<div><label for="' + id + '">' + rot + '</label><input class="inp" id="' + id + '" type="' + tipo + '" value="' + e(v == null ? '' : v) + '"' + (tipo === 'number' ? ' step="any"' : '') + '></div>'; }
  function faixasTxt(f) { return (f || []).map(function(x) { return x.pct + ':' + x.mult; }).join('; '); }
  function lerFaixas(txt) {
    return String(txt || '').split(/[;,]\s*/).map(function(p) { var m = p.split(':'); return {pct: Number(String(m[0]).replace(',', '.')), mult: Number(String(m[1]).replace(',', '.'))}; })
      .filter(function(x) { return x.pct > 0 && x.mult >= 0; });
  }
  function simular() {
    var params = (D.custos || {}).parametros || {};
    var s = {desde: el('simDesde').value, ate: el('simAte').value, fator: Number(el('simFator').value), alvo: Number(el('simAlvo').value),
      base: Number(el('simBase').value), faixasTxt: el('simFaixas').value, lpInf: el('simInf').checked};
    if (!(s.fator > 0) || !(s.alvo > 0) || !s.desde || !s.ate) { S.simul = Object.assign(s, {erro: 'Informe período, fator e % alvo.'}); return render(); }
    var tab = P.tabelaDePontos({fichas: M.fichas, fator: s.fator, usarLpInformado: s.lpInf,
      coberturaMinimaPct: params.coberturaMinimaPct === '' || params.coberturaMinimaPct == null ? null : Number(params.coberturaMinimaPct)});
    var tabelas = {}, m = s.desde;
    for (var i = 0; i < 36 && m <= s.ate; i++) { tabelas[m] = tab; m = mesMenos(m, -1); }
    var placares = P.placarDoPeriodo({registros: D.registros, ops: D.ops, produtos: D.produtos, tabelas: tabelas, ritmos: M.ritmos, alvoPct: s.alvo,
      horasDoDia: function(d) { return C.horasDoDia(D.config || {}, d); }, perdas: D.perdas, retrabalhos: D.retrabalhos, estoqueLotes: D.estoque_lotes,
      conferenciasPa: D.conferencias_pa, programa: (D.resultado || {}).programa, descontosAtivos: params.descontos || null,
      bomDoSku: C.bomAprovadaDoSku(D.produtos, D.formulas, D.bom, D.especificacoes),
      desde: s.desde + '-01', ate: s.ate + '-31'});
    s.r = P.resumoSimulacao(placares, {bonusBase: s.base, faixas: lerFaixas(s.faixasTxt), tetoPct: params.tetoBonusPct});
    s.skus = Object.keys(tab.porSku).length;
    S.simul = s;
    render();
  }

  /* Parâmetros ─────────────────────────────────────────────────────────── */
  function abaParametros() {
    var p = (D.custos || {}).parametros || {};
    var op = ((D.custos || {}).operacao || {})[S.compOp || M.comp] || {};
    var desc = Object.assign({}, P.DESCONTOS_PADRAO, p.descontos || {});
    var h = '<div class="card"><h2>Preço e impostos</h2><div class="form">' +
      campo('pImp', '% de impostos sobre o preço (padrão)', 'number', p.impostosPct) +
      '<div><label>&nbsp;</label><div class="dica">Sem este número o LP fica em branco: LP sem imposto descontado sairia inflado. Por cliente, abaixo.</div></div></div>' +
      '<details style="margin-top:10px"><summary>% por cliente (' + Object.keys(p.impostosPorCliente || {}).length + ' informados)</summary><div class="form" style="margin-top:8px">' +
      Object.keys(D.clientes || {}).sort().map(function(k) { var c = D.clientes[k] || {}; return campo('pImpC_' + k, e(c.nome || c.razaoSocial || k), 'number', (p.impostosPorCliente || {})[k]); }).join('') +
      '</div></details><div style="margin-top:12px"><button class="btn pri" id="btnSalvarImp">Salvar impostos</button></div></div>';
    h += '<div class="card"><h2>Operação da competência</h2><div class="sub" style="margin:0 0 10px">Entra top-down, como a fábrica opera hoje: a folha da produção e os custos fixos do mês. Nenhuma tela lê salário individual — só este total. ' +
      'A <b>folha</b> vira o custo-hora direto (÷ hora-linha disponível, entra no LP); os <b>fixos de produção</b> entram no custo pleno; os <b>administrativos</b> nunca absorvem em produto e vão só para o custo fixo que a meta cobre.</div>' +
      '<div class="form">' + campo('opComp', 'Competência', 'month', S.compOp || M.comp) + campo('opFolha', 'Folha da produção no mês (R$, com encargos)', 'number', op.folhaProducao) +
      ((D.config || {}).linhas || ['Linha 1', 'Linha 2', 'Linha 3']).map(function(l, i) { return campo('opLinha' + i, 'Custo-hora ' + e(l) + ' (opcional)', 'number', (op.custoHoraLinha || {})[l]); }).join('') + '</div>' +
      '<h3 style="margin-top:12px">Custos fixos do mês</h3><div id="fixos">' + Object.keys(op.fixos || {}).map(function(k) { return linhaFixo(k, op.fixos[k]); }).join('') + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn sm" id="btnAddFixo">+ Custo fixo</button><button class="btn pri" id="btnSalvarOp">Salvar operação</button></div>' +
      '<div class="dica" style="margin-top:8px">Taxa usada hoje: ' + (M.taxa.ok ? brl(M.taxa.custoHoraDireta, 2) + '/h direta · ' + brl(M.taxa.custoHoraPlena, 2) + '/h plena · competência ' + mesBR(M.taxa.competenciaOperacao) : e(M.taxa.faltam.join('; '))) + '</div></div>';
    h += '<div class="card"><h2>Pontos, meta e bônus</h2><div class="form">' +
      campo('pFator', 'Fator de pontos (pontos por R$ de LP)', 'number', p.fatorPontos) + campo('pAlvo', '% alvo da meta', 'number', p.metaAlvoPct) +
      campo('pCob', 'Cobertura mínima PAGO/COTADO para pontuar (%, vazio = basta a ficha completa)', 'number', p.coberturaMinimaPct) +
      campo('pBase', 'Bônus base do mês (R$)', 'number', p.bonusBase) + campo('pFaixas', 'Faixas de superação (pct:mult; …)', 'text', faixasTxt(p.faixasBonus)) +
      campo('pTeto', 'Teto (% considerado no máximo)', 'number', p.tetoBonusPct) + campo('pRecl', 'Redução por reclamação (%)', 'number', p.reducaoReclamacaoPct != null ? p.reducaoReclamacaoPct : 50) +
      campo('pLinhas', 'Linhas ativas (vazio = as do Ajustes)', 'number', p.linhasAtivas) + '</div>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;font-size:13px">' +
      chk('pInf', 'Usar o LP digitado no Cadastros onde a ficha não fecha', p.usarLpInformado) + chk('pAuto', 'Congelar a tabela sozinho no 1º dia do mês', p.congelarAutomatico !== false) +
      chk('pValendo', 'Bônus valendo (desligado = piloto, só calcula)', p.bonusValendo) + '</div>' +
      '<h3 style="margin-top:12px">Descontos dos pontos</h3><div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px">' +
      chk('dPerdas', 'Perdas apontadas (decidido)', desc.perdas) + chk('dRetr', 'Retrabalho (decidido)', desc.retrabalho) + chk('dRep', 'Lote reprovado pela Qualidade (proposto)', desc.loteReprovado) + chk('dDiv', 'Divergência na conferência do PA (proposto)', desc.divergenciaPA) + chk('dCons', 'Conferência de consumo: perda escondida desconta 2× (proposto; exige separação por OP e devolução da sobra)', desc.consumoEscondido) + '</div>' +
      '<div class="dica">Paradas não descontam (já reduzem a produção). First article e assepsia só registram: descontar ensinaria a esconder.</div>' +
      '<div style="margin-top:12px"><button class="btn pri" id="btnSalvarPts">Salvar pontos e bônus</button></div></div>';
    return h;
  }
  function chk(id, rot, v) { return '<label><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '> ' + rot + '</label>'; }
  function linhaFixo(k, f) {
    f = f || {};
    return '<div class="barra fixo" data-k="' + e(k) + '"><input class="inp" style="flex:1;min-width:180px" placeholder="Descrição (aluguel, energia…)" data-c="descricao" value="' + e(f.descricao || '') + '">' +
      '<input class="inp num" data-c="valor" placeholder="R$" value="' + e(f.valor == null ? '' : f.valor) + '">' +
      '<select class="sel" data-c="rateio"><option value="PRODUCAO"' + (f.rateio !== 'ADMINISTRATIVO' ? ' selected' : '') + '>Produção</option><option value="ADMINISTRATIVO"' + (f.rateio === 'ADMINISTRATIVO' ? ' selected' : '') + '>Administrativo</option></select>' +
      '<button class="btn sm" data-del-fixo="1">Remover</button></div>';
  }
  function numOuNull(id) { var v = String((el(id) || {}).value || '').replace(',', '.').trim(); return v === '' ? null : Number(v); }

  /* ── Gravações (caminhos planos) ───────────────────────────────────────── */
  function salvarPreco(key) {
    var inp = document.querySelector('[data-preco-key="' + key + '"]');
    var v = Number(String(inp && inp.value || '').replace(',', '.'));
    if (!(v > 0)) return toast('Informe um preço maior que zero.');
    var m = (D.materiais || {})[key] || {};
    var atual = (D.custos_precos || {})[key];
    var em = new Date().toISOString();
    var up = {};
    up['custos_precos/' + key + '/valor'] = v;
    up['custos_precos/' + key + '/unidade'] = m.unidade || null;
    up['custos_precos/' + key + '/motivo'] = 'digitado na tela de Custos';
    up['custos_precos/' + key + '/por'] = autor();
    up['custos_precos/' + key + '/em'] = em;
    if (atual && num(atual.valor) > 0) {
      up['custos_precos/' + key + '/historico/' + db.ref().push().key] = {valor: num(atual.valor), unidade: atual.unidade || null, motivo: atual.motivo || null, por: atual.por || null, em: atual.em || null, substituidoEm: em};
    }
    db.ref().update(up).then(function() { toast('Preço de ' + (m.mpCodigo || key) + ' salvo como MANUAL.'); recalcularModelo(); }, function(err) { toast('Não salvou: ' + erroMsg(err)); });
  }
  function salvarDepara(dk, matKey, ignorar) {
    var m = (D.materiais || {})[matKey] || {};
    var item = itensPd().filter(function(x) { return x.dk === dk; })[0] || {};
    var reg = ignorar ? {ignorar: true, ingrediente: item.nome || dk, por: autor(), em: new Date().toISOString()}
      : {materialKey: matKey, materialCodigo: m.mpCodigo, materialNome: m.mpNome || null, ingrediente: item.nome || dk, por: autor(), em: new Date().toISOString()};
    db.ref('custos/depara_pd/' + dk).set(reg).then(function() { toast(ignorar ? 'Ingrediente ignorado.' : 'Ligado a ' + m.mpCodigo + '.'); recalcularModelo(); }, function(err) { toast('Não salvou: ' + erroMsg(err)); });
  }
  function recalcularModelo() { montar(); render(); if (S.fichaSku && el('dlg').open) abrirFicha(S.fichaSku); }
  function chamar(nome, dados) { return firebase.functions().httpsCallable(nome)(dados).then(function(r) { return r.data; }); }

  /* ── Eventos ───────────────────────────────────────────────────────────── */
  document.addEventListener('click', function(ev) {
    var t = ev.target.closest('[data-aba],[data-ir],[data-ficha],[data-ordem],[data-salvar-preco],[data-depara],[data-depara-manual],[data-ignorar],[data-desfaz-depara],[data-congelar],[data-fechar],[data-recalcular],[data-del-portao],[data-del-fixo],#btnSimular,#btnSalvarImp,#btnSalvarOp,#btnAddFixo,#btnSalvarPts,#btnProg,#btnPortao,#btnRecarregar,#dlgX');
    if (!t) return;
    var d = t.dataset;
    if (t.id === 'dlgX') return el('dlg').close();
    if (t.id === 'btnRecarregar') { el('conteudo').innerHTML = '<div class="vazio"><b>Recarregando…</b></div>'; S.movimentos = null; return lerUmaVez().then(function() { montar(); render(); }); }
    if (d.aba) { S.aba = d.aba; return render(); }
    if (d.ir) { ev.preventDefault(); if (el('dlg').open) el('dlg').close(); S.aba = d.ir; return render(); }
    if (d.ordem) { if (S.ordem === d.ordem) S.desc = !S.desc; else { S.ordem = d.ordem; S.desc = true; } return render(); }
    if (d.ficha && !ev.target.closest('input,button,a,select,label')) return abrirFicha(d.ficha);
    if (d.salvarPreco) return salvarPreco(d.salvarPreco);
    if (d.depara) return salvarDepara(d.depara, d.mat, false);
    if (d.ignorar) return salvarDepara(d.ignorar, null, true);
    if (d.deparaManual) {
      var cod = norm((document.querySelector('[data-depara-cod="' + d.deparaManual + '"]') || {}).value);
      var achado = M.ctx.idx[cod];
      if (!achado || !/^MP/.test(norm(achado.material.tipo))) return toast('Código de matéria-prima não encontrado no cadastro.');
      return salvarDepara(d.deparaManual, achado.key, false);
    }
    if (d.desfazDepara) return db.ref('custos/depara_pd/' + d.desfazDepara).remove().then(recalcularModelo);
    if (d.congelar) {
      var motivo = null;
      if (d.substituir) { motivo = prompt('A tabela já está congelada. Motivo da substituição (fica registrado):'); if (!motivo) return; }
      t.disabled = true;
      return chamar('congelarTabelaPontos', {competencia: d.congelar, substituir: !!d.substituir, motivo: motivo}).then(function(r) { toast('Tabela congelada: ' + r.skusComPontos + ' SKUs pontuam.'); }, function(err) { t.disabled = false; toast(erroMsg(err)); });
    }
    if (d.fechar) {
      if (!confirm('Fechar ' + mesBR(d.fechar) + '? O placar do mês deixa de ser regravado e o bônus é calculado.')) return;
      t.disabled = true;
      return chamar('fecharMesResultado', {competencia: d.fechar}).then(function(r) { toast('Mês fechado: ' + pct(r.pct) + ' · bônus ' + (r.bonus == null ? '—' : 'R$ ' + r.bonus)); }, function(err) { t.disabled = false; toast(erroMsg(err)); });
    }
    if (d.recalcular) { t.disabled = true; return chamar('recalcularPlacar', {}).then(function(r) { t.disabled = false; toast(r.dias + ' dias recalculados.'); }, function(err) { t.disabled = false; toast(erroMsg(err)); }); }
    if (d.delPortao) return db.ref('resultado/portoes/' + M.comp + '/' + d.delPortao).remove().catch(function(err) { toast(erroMsg(err)); });
    if (d.delFixo) return t.closest('.fixo').remove();
    if (t.id === 'btnSimular') return simular();
    if (t.id === 'btnAddFixo') { var w = document.createElement('div'); w.innerHTML = linhaFixo(db.ref().push().key, {}); return el('fixos').appendChild(w.firstChild); }
    if (t.id === 'btnSalvarImp') {
      var up = {'custos/parametros/impostosPct': numOuNull('pImp')};
      Object.keys(D.clientes || {}).forEach(function(k) { up['custos/parametros/impostosPorCliente/' + k] = numOuNull('pImpC_' + k); });
      return db.ref().update(up).then(function() { toast('Impostos salvos.'); recalcularModelo(); }, function(err) { toast(erroMsg(err)); });
    }
    if (t.id === 'btnSalvarOp') {
      var comp = el('opComp').value;
      if (!/^\d{4}-\d{2}$/.test(comp)) return toast('Competência inválida.');
      var fixos = {};
      Array.prototype.forEach.call(document.querySelectorAll('.fixo'), function(r) {
        var v = Number(String(r.querySelector('[data-c="valor"]').value).replace(',', '.'));
        if (!(v > 0)) return;
        fixos[r.dataset.k] = {descricao: r.querySelector('[data-c="descricao"]').value.trim(), valor: v, rateio: r.querySelector('[data-c="rateio"]').value};
      });
      var chl = {};
      ((D.config || {}).linhas || ['Linha 1', 'Linha 2', 'Linha 3']).forEach(function(l, i) { var v = numOuNull('opLinha' + i); if (v > 0) chl[l] = v; });
      var reg = {folhaProducao: numOuNull('opFolha'), fixos: fixos, custoHoraLinha: chl, definidoPor: autor(), definidoEm: new Date().toISOString()};
      // Competência inteira é um registro só (pequeno): set no nó dela, não update aninhado.
      return db.ref('custos/operacao/' + comp).set(reg).then(function() { S.compOp = comp; toast('Operação de ' + mesBR(comp) + ' salva.'); recalcularModelo(); }, function(err) { toast(erroMsg(err)); });
    }
    if (t.id === 'btnSalvarPts') {
      var faixas = lerFaixas(el('pFaixas').value);
      var u = {'custos/parametros/metaAlvoPct': numOuNull('pAlvo'), 'custos/parametros/coberturaMinimaPct': numOuNull('pCob'),
        'custos/parametros/bonusBase': numOuNull('pBase'), 'custos/parametros/faixasBonus': faixas.length ? faixas : null,
        'custos/parametros/tetoBonusPct': numOuNull('pTeto'), 'custos/parametros/reducaoReclamacaoPct': numOuNull('pRecl'),
        'custos/parametros/linhasAtivas': numOuNull('pLinhas'), 'custos/parametros/usarLpInformado': el('pInf').checked,
        'custos/parametros/congelarAutomatico': el('pAuto').checked, 'custos/parametros/bonusValendo': el('pValendo').checked,
        'custos/parametros/descontos/perdas': el('dPerdas').checked, 'custos/parametros/descontos/retrabalho': el('dRetr').checked,
        'custos/parametros/descontos/loteReprovado': el('dRep').checked, 'custos/parametros/descontos/divergenciaPA': el('dDiv').checked, 'custos/parametros/descontos/consumoEscondido': el('dCons').checked};
      var fator = numOuNull('pFator');
      if (fator != null) u['custos/parametros/fatorPontos'] = fator;
      return db.ref().update(u).then(function() { toast('Parâmetros salvos.'); recalcularModelo(); }, function(err) { toast(erroMsg(err)); });
    }
    if (t.id === 'btnProg') {
      var dia = el('diaProg').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return toast('Dia inválido.');
      var up2 = {};
      Array.prototype.forEach.call(document.querySelectorAll('[data-prog]'), function(i) { var v = String(i.value).replace(',', '.').trim(); up2['resultado/programa/' + dia + '/' + i.dataset.prog] = v === '' ? null : Number(v); });
      return db.ref().update(up2).then(function() { toast('Programa de ' + dataBR(dia) + ' salvo.'); }, function(err) { toast(erroMsg(err)); });
    }
    if (t.id === 'btnPortao') {
      var data = el('ptData').value;
      var compP = data.slice(0, 7);
      return db.ref('resultado/portoes/' + compP).push({tipo: el('ptTipo').value, data: data, descricao: el('ptDesc').value.trim().slice(0, 300), por: autor(), em: new Date().toISOString()})
        .then(function() { toast('Portão registrado.'); }, function(err) { toast('Não registrou: ' + erroMsg(err)); });
    }
  });
  document.addEventListener('change', function(ev) {
    var t = ev.target;
    if (t.id === 'fCli') { S.cli = t.value; return render(); }
    if (t.id === 'fFiltro') { S.filtro = t.value; return render(); }
    if (t.id === 'fMesReal') { S.mesReal = t.value; return render(); }
    if (t.id === 'fNivel') { S.nivel = t.value; return render(); }
    if (t.id === 'diaProg') { S.diaProg = t.value; return render(); }
    if (t.id === 'opComp') { S.compOp = t.value; return render(); }
    if (t.dataset.matCliente) {
      var sku = C.chaveSku(S.fichaSku);
      return db.ref('custos/material_cliente/' + sku + '/' + t.dataset.matCliente).set(t.checked ? true : null)
        .then(recalcularModelo, function(err) { toast(erroMsg(err)); });
    }
  });
  var tBusca = null;
  document.addEventListener('input', function(ev) {
    var t = ev.target, alvo = {qSku: 'q', qPreco: 'qp', qDep: 'qdep'}[t.id];
    if (!alvo) return;
    clearTimeout(tBusca);
    tBusca = setTimeout(function() {
      S[alvo] = t.value; var pos = t.selectionStart; render();
      var n = el(t.id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ok */ } }
    }, 250);
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.precoKey) salvarPreco(ev.target.dataset.precoKey);
  });

  /* ── Início ────────────────────────────────────────────────────────────── */
  var iniciado = false;
  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    var carregado = false;
    lerUmaVez().then(function() { carregado = true; if (Object.keys(vivosProntos).length === Object.keys(NOS_VIVOS).length) { montar(); render(); } });
    escutarVivos(function() { if (!carregado) return; montar(); render(); });
  }
  // O login pode ter terminado antes deste script carregar: não esperar um evento que já passou.
  if (window.currentUser) iniciar(); else window.addEventListener('kuryos-auth-pronto', iniciar);
})();
