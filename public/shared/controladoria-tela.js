'use strict';
/* Controladoria — tela (PROMPT_CONTROLADORIA.md). Lê só ctl/ (lançamentos,
   fechamentos, painel que o servidor monta) e grava só o que é dela: plano de
   contas (nome, referencial, ativa), centros de custo e orçamento. Lançamentos,
   ajustes, fechamento e reabertura são do servidor (callables). As contas moram
   no motor puro shared/controladoria.js. Caminhos planos sempre (CLAUDE.md). */
(function() {
  var db = firebase.database();
  var Ctl = Controladoria;
  var ctl = null, avisos = [];
  var S = {aba: 'dre', comp: null, nivel: 'cliente', ano: null, conta: '', linhasAj: 2};

  function el(id) { return document.getElementById(id); }
  function e(v) { return escapeHtml(String(v == null ? '' : v)); }
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function brl(c) {
    if (c == null || !isFinite(c)) return '<span class="mut">—</span>';
    if (c === 0) c = 0; // −0 vira 0 (senão aparece "R$ -0,00")
    var t = 'R$ ' + (c / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    return c < 0 ? '<span class="neg">' + t + '</span>' : t;
  }
  function pct(v) { if (v === 0) v = 0; return v == null || !isFinite(v) ? '—' : (Math.abs(v) < 0.05 ? 0 : Number(v)).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + '%'; }
  function dataBR(v) { var s = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : '—'; }
  function mesBR(m) { var n = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return m ? n[Number(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4) : '—'; }
  function hojeISO() { return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); }
  function mesMenos(m, k) { var a = Number(m.slice(0, 4)), x = Number(m.slice(5, 7)) - k; while (x < 1) { x += 12; a--; } while (x > 12) { x -= 12; a++; } return a + '-' + (x < 10 ? '0' : '') + x; }
  function autor() { var u = window.currentUser || {}; return u.nome || u.email || 'controladoria'; }
  function ehAdm() { return (window.currentUser || {}).role === 'admin'; }
  function chave() { return (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^A-Za-z0-9_-]/g, ''); }
  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function() { t.remove(); }, 4200); }
  function erroMsg(err) { return (err && (err.message || err.code)) || String(err); }
  function chamar(nome, dados) { return firebase.functions().httpsCallable(nome)(dados).then(function(r) { return r.data; }); }
  function kpi(cls, r, v, d) { return '<div class="kpi ' + cls + '"><div class="r">' + r + '</div><div class="v">' + v + '</div><div class="d">' + (d || '') + '</div></div>'; }
  function plano() { return Ctl.planoDeContas(ctl); }
  function nomeConta(k) { var p = plano()[k]; return p ? p.codigo + ' ' + p.nome : k; }
  function centros() { return Ctl.centrosDeCusto(ctl, {}); }
  var ROT_ORIGEM = {RAZAO_CUSTOS: 'Custos', OP: 'OP → PA', NF_SAIDA: 'NF de saída', OPERACAO: 'Operação do mês', BONUS: 'PLR', BANCO: 'Banco', TITULO: 'Título', BAIXA: 'Baixa', AJUSTE: 'Ajuste manual'};

  /* ── Carga ─────────────────────────────────────────────────────────────── */
  function escutar() {
    dbOnValue(db.ref('ctl'), function(s) { ctl = s.val() || {}; montarCompetencias(); render(); },
      {onError: function(err) { ctl = {}; avisos.push('ctl: ' + erroMsg(err)); montarCompetencias(); render(); }});
  }
  function montarCompetencias() {
    var atual = hojeISO().slice(0, 7), ms = {};
    ms[atual] = 1; ms[mesMenos(atual, 1)] = 1;
    Object.keys(ctl.lancamentos || {}).forEach(function(m) { ms[m] = 1; });
    var lista = Object.keys(ms).sort().reverse();
    if (!S.comp) S.comp = mesMenos(atual, 1);
    if (!S.ano) S.ano = S.comp.slice(0, 4);
    el('selComp').innerHTML = lista.map(function(m) { var f = (ctl.fechamentos || {})[m]; return '<option value="' + m + '"' + (m === S.comp ? ' selected' : '') + '>' + mesBR(m) + (f && f.status === 'FECHADO' ? ' · fechado' : '') + '</option>'; }).join('');
    el('sDot').classList.add('on'); el('sTxt').textContent = 'Ao vivo · ' + Object.keys(ctl.lancamentos || {}).reduce(function(s, m) { return s + Object.keys(ctl.lancamentos[m] || {}).length; }, 0) + ' lançamentos';
  }

  function render() {
    if (!ctl) return;
    Array.prototype.forEach.call(document.querySelectorAll('.aba'), function(b) { b.setAttribute('aria-selected', b.dataset.aba === S.aba ? 'true' : 'false'); });
    var h = avisos.length ? '<div class="alerta warn"><div>' + avisos.map(e).join('<br>') + '</div></div>' : '';
    var f = (ctl.fechamentos || {})[S.comp];
    if (f && f.status === 'FECHADO') h += '<div class="alerta info"><div><b>' + mesBR(S.comp) + ' está fechado</b> (' + dataBR(f.fechadoEm) + ', ' + e(f.fechadoPor) + (f.forcado ? ', com pendências: ' + e(f.justificativa) : '') + '). Fato tardio entra no mês aberto, citando este.</div></div>';
    h += ({dre: abaDre, copa: abaCopa, centros: abaCentros, orcamento: abaOrcamento, razao: abaRazao, fechamento: abaFechamento, plano: abaPlano}[S.aba] || abaDre)();
    el('conteudo').innerHTML = h;
  }

  /* ── DRE ───────────────────────────────────────────────────────────────── */
  function abaDre() {
    var painel = (ctl.painel || {})[S.comp] || {};
    var taxas = {}; if (painel.ociosidade) taxas[S.comp] = {custoOciosidadeMes: painel.ociosidade.custoCentavos != null ? painel.ociosidade.custoCentavos / 100 : null, ocupacaoPct: painel.ociosidade.ocupacaoPct};
    var d = Ctl.dre(ctl, S.comp, {taxas: taxas}), ant = Ctl.dre(ctl, mesMenos(S.comp, 1), {}), A = {};
    ant.linhas.forEach(function(l) { A[l.chave] = l.valor; });
    if (!d.documentos) return '<div class="card"><div class="vazio"><b>Nenhum lançamento em ' + mesBR(S.comp) + '.</b>Os lançamentos nascem dos outros módulos a cada 5 minutos: entrada de material com custo (recebimento), OPs com custo completo (Custos), notas registradas nas cargas, operação do mês e baixas do Financeiro. Hoje a base tem a última OP em 21/09 e nenhuma nota de saída no erpkuryos.</div></div>';
    var c = d.coberturaCpv, R = {};
    d.linhas.forEach(function(l) { R[l.chave] = l.valor; });
    var h = '<div class="kpis">' + kpi(R.RESULTADO >= 0 ? 'ok' : 'bad', 'Resultado do mês', brl(R.RESULTADO), 'gerencial, competência ' + mesBR(S.comp)) +
      kpi('info', 'Margem de contribuição', brl(R.MARGEM), 'margem ' + pct(d.margemPct) + ' da receita líquida') +
      kpi(c.pctPendente ? 'warn' : 'ok', 'Cobertura do CPV', c.pctReal == null ? '—' : pct(c.pctReal) + ' real', c.pctReal == null ? 'sem venda no mês' : pct(c.pctPadrao) + ' pela ficha padrão · ' + pct(c.pctPendente) + ' pendente') +
      kpi(d.ociosidade && d.ociosidade.custoCentavos ? 'warn' : 'info', 'Ociosidade (dentro do custo fixo)', d.ociosidade ? brl(d.ociosidade.custoCentavos) : '—', d.ociosidade && d.ociosidade.ocupacaoPct != null ? 'ocupação ' + pct(d.ociosidade.ocupacaoPct) + ' das horas disponíveis' : 'taxas do mês ainda não congeladas no Custos') + '</div>';
    if (c.unidadesPendente) h += '<div class="alerta warn"><div><b>CPV pendente em ' + c.unidadesPendente.toLocaleString('pt-BR') + ' unidade(s) vendida(s):</b> sem OP com custo completo e sem ficha padrão. A margem fica superestimada nessa parte — o valor não vira zero, ele falta.</div></div>';
    if (d.nfsSemImposto) h += '<div class="alerta warn"><div><b>' + d.nfsSemImposto + ' nota(s) sem dedução de impostos:</b> defina o % em Custos › Parâmetros (regime/cliente).</div></div>';
    h += '<div class="card"><h3>DRE gerencial — ' + mesBR(S.comp) + '</h3><div class="tw"><table class="dre"><thead><tr><th></th><th class="n">' + mesBR(S.comp) + '</th><th class="n">% RL</th><th class="n">' + mesBR(mesMenos(S.comp, 1)) + '</th></tr></thead><tbody>' +
      d.linhas.map(function(l) { var rl = R.RECEITA_LIQUIDA; return '<tr class="' + (l.total ? 'tot' : 'cl') + '" data-dre="' + l.chave + '"><td>' + e(l.rotulo) + '</td><td class="n">' + brl(l.valor) + '</td><td class="n">' + (rl > 0 ? pct(l.valor / rl * 100) : '—') + '</td><td class="n">' + brl(A[l.chave]) + '</td></tr>'; }).join('') +
      '</tbody></table></div><div class="dica" style="margin-top:6px">Clique numa linha para ver os lançamentos. Custo fixo não absorvido = folha + custos fixos de produção − mão de obra que as OPs absorveram (horas apontadas × custo-hora). A ociosidade está dentro dele.</div></div>';
    return h;
  }
  var GRUPOS_DA_LINHA = {RECEITA_BRUTA: ['RECEITA_BRUTA', 'OUTRAS_RECEITAS'], DEDUCOES: ['DEDUCOES'], CPV: ['CPV'], PERDAS: ['PERDAS'], CUSTO_FIXO_PRODUCAO: ['CUSTO_FIXO_PRODUCAO'],
    DESPESAS_ADM: ['DESPESAS_ADM'], DESPESAS_COMERCIAIS: ['DESPESAS_COMERCIAIS'], PLR: ['PLR'], RESULTADO_FINANCEIRO: ['RESULTADO_FINANCEIRO']};
  function detalheDre(chaveLinha) {
    var gs = GRUPOS_DA_LINHA[chaveLinha]; if (!gs) return;
    var docs = Ctl.docsDe(ctl, function(d, m) { return m === S.comp; }).filter(function(d) { return (d.partidas || []).some(function(p) { var pc = Ctl.PLANO_PADRAO[p.conta]; return pc && gs.indexOf(pc.grupoDre) >= 0; }); });
    abrir('Lançamentos · ' + e(chaveLinha), tabelaDocs(docs, gs));
  }
  function tabelaDocs(docs, grupos) {
    return '<div class="tw"><table><thead><tr><th>Data</th><th>Origem</th><th>Histórico</th><th>Conta</th><th>CC</th><th class="n">Débito</th><th class="n">Crédito</th><th></th></tr></thead><tbody>' +
      (docs.length ? docs.sort(function(a, b) { return String(a.data).localeCompare(String(b.data)); }).map(function(d) {
        var ps = (d.partidas || []).filter(function(p) { var pc = Ctl.PLANO_PADRAO[p.conta]; return !grupos || (pc && grupos.indexOf(pc.grupoDre) >= 0); });
        return ps.map(function(p, i) {
          return '<tr><td>' + (i ? '' : dataBR(d.data)) + '</td><td>' + (i ? '' : e(ROT_ORIGEM[d.origem && d.origem.tipo] || '') + (d.estornaDoc ? ' <span class="tg bad">estorno</span>' : '') + (d.competenciaOriginal ? ' <span class="tg warn">de ' + mesBR(d.competenciaOriginal) + '</span>' : '')) + '</td><td>' + (i ? '' : e(d.historico)) + '</td>' +
            '<td>' + e(nomeConta(p.conta)) + (p.fonte ? ' <span class="mut">' + e(p.fonte) + '</span>' : '') + '</td><td>' + e(p.cc || '') + '</td><td class="n">' + (p.debitoCentavos ? brl(p.debitoCentavos) : '') + '</td><td class="n">' + (p.creditoCentavos ? brl(p.creditoCentavos) : '') + '</td>' +
            '<td>' + (!i && d.origem && d.origem.tipo === 'AJUSTE' && !d.estornaDoc ? '<button class="btn sm perigo" data-est-aj="' + e(d.chave) + '">Estornar</button>' : '') + '</td></tr>';
        }).join('');
      }).join('') : '<tr><td colspan="8" class="mut">Nenhum lançamento.</td></tr>') + '</tbody></table></div>';
  }

  /* ── CO-PA ─────────────────────────────────────────────────────────────── */
  function abaCopa() {
    var linhas = Ctl.coPa(ctl, S.comp, S.nivel);
    var h = '<div class="card"><div class="barra"><select class="sel" id="selNivel">' + [['cliente', 'Por cliente'], ['sku', 'Por SKU'], ['pedido', 'Por pedido']].map(function(o) { return '<option value="' + o[0] + '"' + (S.nivel === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<span class="sub">Receita e CPV das notas de ' + mesBR(S.comp) + '. Ao lado, o <b>LP realizado</b> das OPs vendidas (módulo de Custos): a diferença entre os dois é preço (nota × preço vigente) e quantidade (vendido × produzido).</span></div>' +
      '<div class="tw"><table><thead><tr><th>' + ({cliente: 'Cliente', sku: 'SKU', pedido: 'Pedido'}[S.nivel]) + '</th><th class="n">Unidades</th><th class="n">Receita</th><th class="n">Deduções</th><th class="n">CPV</th><th class="n">Margem</th><th class="n">Margem %</th><th class="n">LP realizado (Custos)</th><th>Faltando</th></tr></thead><tbody>' +
      (linhas.length ? linhas.map(function(x) {
        return '<tr><td>' + e(x.chave) + '</td><td class="n">' + x.unidades.toLocaleString('pt-BR') + '</td><td class="n">' + brl(x.receita) + '</td><td class="n">' + (x.deducaoPendente ? '<span class="mut">sem %</span>' : brl(x.deducoes)) + '</td><td class="n">' + brl(x.cpv) + '</td>' +
          '<td class="n">' + brl(x.margem) + '</td><td class="n">' + pct(x.margemPct) + '</td><td class="n">' + (x.unidadesComLp ? brl(x.lpRealizado) : '<span class="mut">—</span>') + '</td>' +
          '<td>' + (x.unidadesSemCpv ? '<span class="tg warn">CPV de ' + x.unidadesSemCpv.toLocaleString('pt-BR') + ' un</span>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="9"><div class="vazio"><b>Nenhuma nota de saída em ' + mesBR(S.comp) + '.</b>A rentabilidade nasce das notas registradas nas cargas (Faturamento).</div></td></tr>') + '</tbody></table></div></div>';
    return h;
  }

  /* ── Centros de custo ──────────────────────────────────────────────────── */
  function abaCentros() {
    var por = {}, cs = centros();
    Ctl.docsDe(ctl, function(d, m) { return m === S.comp; }).forEach(function(d) {
      (d.partidas || []).forEach(function(p) {
        var pc = Ctl.PLANO_PADRAO[p.conta]; if (!pc || (pc.tipo !== 'CUSTO' && pc.tipo !== 'DESPESA')) return;
        var cc = p.cc || 'SEM_CENTRO', x = por[cc] = por[cc] || {};
        x[p.conta] = (x[p.conta] || 0) + p.debitoCentavos - p.creditoCentavos;
      });
    });
    var ks = Object.keys(por).sort();
    var contas = {}; ks.forEach(function(k) { Object.keys(por[k]).forEach(function(c) { contas[c] = 1; }); });
    var cols = Object.keys(contas).sort(function(a, b) { return Ctl.PLANO_PADRAO[a].codigo.localeCompare(Ctl.PLANO_PADRAO[b].codigo); });
    return '<div class="card"><h3>Custos e despesas por centro — ' + mesBR(S.comp) + '</h3><div class="sub" style="margin-bottom:10px">Linhas de envase vêm da linha da OP; MOD aplicada aparece negativa (é o que a produção absorveu).</div><div class="tw"><table><thead><tr><th>Centro</th>' +
      cols.map(function(c) { return '<th class="n">' + e(Ctl.PLANO_PADRAO[c].nome) + '</th>'; }).join('') + '<th class="n">Total</th></tr></thead><tbody>' +
      (ks.length ? ks.map(function(k) { var tot = 0; return '<tr><td>' + e((cs[k] || {}).nome || k) + '</td>' + cols.map(function(c) { tot += por[k][c] || 0; return '<td class="n">' + (por[k][c] ? brl(por[k][c]) : '') + '</td>'; }).join('') + '<td class="n"><b>' + brl(tot) + '</b></td></tr>'; }).join('')
        : '<tr><td colspan="' + (cols.length + 2) + '" class="mut">Nenhum custo lançado no mês.</td></tr>') + '</tbody></table></div></div>';
  }

  /* ── Orçamento × real ──────────────────────────────────────────────────── */
  function abaOrcamento() {
    var linhas = Ctl.orcamentoXReal(ctl, S.ano), p = plano(), cs = centros();
    var contasRes = Object.keys(p).filter(function(k) { return p[k].grupoDre && p[k].ativa !== false; });
    var h = '<div class="card"><div class="barra"><input class="inp" id="orcAno" style="width:90px" value="' + e(S.ano) + '"><span class="sub">Orçado por conta × centro × mês (padrão SAP CO / TOTVS SIGAPCO). O real vem dos lançamentos.</span></div>' +
      '<div class="form" style="margin-bottom:12px"><div><label for="orcConta">Conta</label><select class="sel" id="orcConta">' + contasRes.map(function(k) { return '<option value="' + k + '">' + e(p[k].codigo + ' ' + p[k].nome) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="orcCc">Centro</label><select class="sel" id="orcCc"><option value="_">(sem centro)</option>' + Object.keys(cs).map(function(k) { return '<option value="' + k + '">' + e(cs[k].nome) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="orcMes">Mês</label><select class="sel" id="orcMes"><option value="todos">todos (mesmo valor)</option>' + ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(function(m) { return '<option>' + m + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="orcValor">Valor orçado (R$)</label><input class="inp" id="orcValor"></div></div><button class="btn sm pri" id="orcSalvar">Salvar orçamento</button></div>';
    h += '<div class="card"><div class="tw"><table><thead><tr><th>Conta</th><th>Centro</th><th class="n">Orçado ' + e(S.ano) + '</th><th class="n">Real</th><th class="n">Variação</th><th class="n">%</th></tr></thead><tbody>' +
      (linhas.length ? linhas.map(function(l) { var desp = Ctl.PLANO_PADRAO[l.conta] && Ctl.PLANO_PADRAO[l.conta].tipo !== 'RECEITA'; var ruim = desp ? l.variacao > 0 : l.variacao < 0;
        return '<tr><td>' + e(nomeConta(l.conta)) + '</td><td>' + e(l.cc === '_' ? '' : ((cs[l.cc] || {}).nome || l.cc)) + '</td><td class="n">' + brl(l.orcado) + '</td><td class="n">' + brl(l.real) + '</td><td class="n"><span class="' + (ruim ? 'neg' : 'pos') + '">' + brl(l.variacao).replace(/<[^>]+>/g, '') + '</span></td><td class="n">' + pct(l.variacaoPct) + '</td></tr>'; }).join('')
        : '<tr><td colspan="6" class="mut">Sem orçamento nem lançamentos em ' + e(S.ano) + '.</td></tr>') + '</tbody></table></div></div>';
    return h;
  }

  /* ── Razão e balancete ─────────────────────────────────────────────────── */
  function abaRazao() {
    var bal = Ctl.balancete(ctl, S.comp), p = plano();
    var docs = Ctl.docsDe(ctl, function(d, m) { return m === S.comp; }).filter(function(d) { return !S.conta || (d.partidas || []).some(function(x) { return x.conta === S.conta; }); });
    var h = '<div class="grid2"><div class="card"><h3>Balancete até ' + mesBR(S.comp) + '</h3><div class="tw"><table><thead><tr><th>Conta</th><th class="n">Débitos</th><th class="n">Créditos</th><th class="n">Saldo</th></tr></thead><tbody>' +
      bal.filter(function(x) { return x.debitoCentavos || x.creditoCentavos; }).map(function(x) { return '<tr class="cl" data-filtro-conta="' + x.chave + '"><td>' + e(x.codigo + ' ' + x.nome) + '</td><td class="n">' + brl(x.debitoCentavos) + '</td><td class="n">' + brl(x.creditoCentavos) + '</td><td class="n"><b>' + brl(x.saldoCentavos) + '</b></td></tr>'; }).join('') +
      '</tbody></table></div><div class="dica" style="margin-top:6px">Saldo pelo lado natural da conta. Σ débitos = Σ créditos sempre.</div></div>';
    h += '<div class="card"><h3>Ajuste manual</h3><div class="sub" style="margin-bottom:8px">Só para o que nenhum módulo registra (reclassificação, provisão). Documento balanceado e histórico obrigatório; corrigir = estornar, nunca editar.</div><div id="ajLinhas">' + linhasAjuste() + '</div>' +
      '<div class="form" style="margin-top:8px"><div><label for="ajData">Data</label><input class="inp" type="date" id="ajData" value="' + hojeISO() + '"></div><div style="grid-column:span 2"><label for="ajHist">Histórico</label><input class="inp" id="ajHist" placeholder="por que este ajuste existe"></div></div>' +
      '<div style="margin-top:8px;display:flex;gap:8px"><button class="btn sm" id="ajMais">+ linha</button><button class="btn sm pri" id="ajOk">Lançar ajuste</button></div></div></div>';
    h += '<div class="card"><div class="barra"><h3 style="margin:0">Lançamentos de ' + mesBR(S.comp) + '</h3><select class="sel" id="selConta"><option value="">Todas as contas</option>' + Object.keys(p).map(function(k) { return '<option value="' + k + '"' + (S.conta === k ? ' selected' : '') + '>' + e(p[k].codigo + ' ' + p[k].nome) + '</option>'; }).join('') + '</select></div>' + tabelaDocs(docs, null) + '</div>';
    return h;
  }
  function linhasAjuste() {
    var p = plano(), opts = Object.keys(p).filter(function(k) { return p[k].ativa !== false; }).map(function(k) { return '<option value="' + k + '">' + e(p[k].codigo + ' ' + p[k].nome) + '</option>'; }).join('');
    var cc = '<option value="">(sem centro)</option>' + Object.keys(centros()).map(function(k) { return '<option value="' + k + '">' + e(centros()[k].nome) + '</option>'; }).join('');
    var h = '';
    for (var i = 0; i < S.linhasAj; i++) h += '<div class="barra"><select class="sel" data-aj-conta="' + i + '">' + opts + '</select><select class="sel" data-aj-cc="' + i + '">' + cc + '</select><input class="inp num" data-aj-d="' + i + '" placeholder="débito"><input class="inp num" data-aj-c="' + i + '" placeholder="crédito"></div>';
    return h;
  }

  /* ── Fechamento ────────────────────────────────────────────────────────── */
  function abaFechamento() {
    var painel = (ctl.painel || {})[S.comp], f = (ctl.fechamentos || {})[S.comp] || {};
    var atual = hojeISO().slice(0, 7);
    var h = '<div class="card"><h3>Checklist de ' + mesBR(S.comp) + '</h3>';
    if (!painel) h += '<div class="vazio"><b>O servidor ainda não montou o checklist deste mês.</b>Ele monta o do mês corrente e o do anterior a cada 5 minutos.</div>';
    else h += (painel.checklist || []).map(function(i) { return '<div class="chk"><span class="tg ' + (i.ok ? 'ok' : 'warn') + '">' + (i.ok ? 'ok' : 'pendente') + '</span><span>' + e(i.texto) + '</span></div>'; }).join('') + '<div class="dica">Atualizado em ' + dataBR(painel.atualizadoEm) + ' ' + String(painel.atualizadoEm || '').slice(11, 16) + ' (UTC).</div>';
    h += '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">';
    if (f.status === 'FECHADO') h += ehAdm() ? '<button class="btn perigo" id="btnReabrir">Reabrir ' + mesBR(S.comp) + '</button>' : '<span class="mut">Fechado. Só o ADM reabre.</span>';
    else if (S.comp >= atual) h += '<span class="mut">Só se fecha mês que já terminou.</span>';
    else h += '<button class="btn pri" id="btnFechar"' + (painel && painel.ok ? '' : ' disabled') + '>Fechar ' + mesBR(S.comp) + '</button>' + (ehAdm() && painel && !painel.ok ? '<button class="btn perigo" id="btnForcar">Fechar com pendências (ADM)</button>' : '');
    h += '<button class="btn" id="btnExport">Exportar para o contador (CSV)</button></div></div>';
    if (painel && painel.reconciliacao) {
      h += '<div class="card"><h3>Reconciliação razão × Financeiro</h3><div class="sub" style="margin-bottom:8px">Conta de reconciliação (SAP): o saldo de Fornecedores e Clientes no razão tem de bater com os títulos em aberto do Financeiro. A parte explicada vem com o motivo.</div><div class="tw"><table><thead><tr><th>Conta</th><th class="n">Razão</th><th class="n">Financeiro</th><th class="n">Diferença</th><th class="n">Explicado</th><th>Motivo</th></tr></thead><tbody>' +
        painel.reconciliacao.map(function(r) { return '<tr><td>' + e(nomeConta(r.conta)) + '</td><td class="n">' + brl(r.razaoCentavos) + '</td><td class="n">' + brl(r.financeiroCentavos) + '</td><td class="n">' + brl(r.diferencaCentavos) + '</td><td class="n">' + brl(r.explicadoCentavos) + '</td><td>' + e(r.explicacao || (Math.abs(r.naoExplicadoCentavos) > 100 ? 'diferença não explicada' : 'ok')) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    }
    if (f.reaberturas) h += '<div class="card"><h3>Reaberturas</h3>' + Object.keys(f.reaberturas).map(function(k) { var r = f.reaberturas[k]; return '<div class="chk"><span>' + dataBR(r.em) + ' · ' + e(r.por) + '</span><span>' + e(r.justificativa) + '</span></div>'; }).join('') + '</div>';
    return h;
  }

  /* ── Plano de contas ───────────────────────────────────────────────────── */
  function abaPlano() {
    var p = plano(), cs = centros();
    var h = '<div class="card"><h3>Plano de contas gerencial</h3><div class="sub" style="margin-bottom:8px">O tipo e o grupo da DRE são fixos (protegem a DRE). Nome e <b>conta referencial</b> (plano referencial da ECD, que o contador informa) são editáveis. Conta com lançamento só se inativa.</div><div class="tw"><table><thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Grupo DRE</th><th>Conta referencial (ECD)</th><th>Ativa</th></tr></thead><tbody>' +
      Object.keys(p).sort(function(a, b) { return p[a].codigo.localeCompare(p[b].codigo); }).map(function(k) {
        var c = p[k];
        return '<tr><td>' + e(c.codigo) + '</td><td><input class="inp" data-pc-nome="' + k + '" value="' + e(c.nome) + '"></td><td>' + e(c.tipo) + '</td><td>' + e(c.grupoDre || '') + '</td><td><input class="inp" data-pc-ref="' + k + '" value="' + e(c.contaReferencial || '') + '" placeholder="ex.: 1.01.01.02.00"></td><td><input type="checkbox" data-pc-ativa="' + k + '"' + (c.ativa !== false ? ' checked' : '') + '></td></tr>';
      }).join('') + '</tbody></table></div><button class="btn sm pri" id="pcSalvar" style="margin-top:10px">Salvar plano</button></div>';
    h += '<div class="card"><h3>Centros de custo</h3><div class="tw"><table><thead><tr><th>Chave</th><th>Nome</th><th>Tipo</th></tr></thead><tbody>' + Object.keys(cs).map(function(k) { return '<tr><td>' + e(k) + '</td><td>' + e(cs[k].nome) + '</td><td>' + e(cs[k].tipo) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="barra" style="margin-top:10px"><input class="inp" id="ccNome" placeholder="Novo centro (ex.: Linha 3)"><select class="sel" id="ccTipo"><option>PRODUTIVO</option><option>APOIO</option><option>ADMINISTRATIVO</option><option>COMERCIAL</option></select><button class="btn sm" id="ccSalvar">Adicionar</button></div></div>';
    return h;
  }

  /* ── Diálogo e ações ───────────────────────────────────────────────────── */
  function abrir(t, h) { el('dlgT').innerHTML = '<h2>' + t + '</h2>'; el('dlgB').innerHTML = h; var d = el('dlg'); if (!d.open) d.showModal(); }
  el('dlgX').addEventListener('click', function() { el('dlg').close(); });
  function travar(b, p) { b.disabled = true; return p.then(function(r) { b.disabled = false; return r; }, function(err) { b.disabled = false; toast(erroMsg(err)); throw err; }); }
  function centavos(v) { var c = Financeiro.centavos(v); return c == null ? 0 : c; }
  function baixarArquivo(nome, texto) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + texto], {type: 'text/csv;charset=utf-8'})); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  document.addEventListener('click', function(ev) {
    var t = ev.target.closest('button, tr[data-dre], tr[data-filtro-conta]'); if (!t) return;
    var d = t.dataset;
    if (t.classList.contains('aba')) { S.aba = d.aba; render(); return; }
    if (d.dre) { detalheDre(d.dre); return; }
    if (d.filtroConta) { S.conta = d.filtroConta; render(); return; }
    if (d.estAj) {
      var m = prompt('Motivo do estorno do ajuste:'); if (!m) return;
      travar(t, chamar('ctlEstornarAjuste', {doc: d.estAj, motivo: m})).then(function() { el('dlg').open && el('dlg').close(); toast('Ajuste estornado.'); });
      return;
    }
    if (t.id === 'ajMais') { S.linhasAj++; el('ajLinhas').innerHTML = linhasAjuste(); return; }
    if (t.id === 'ajOk') {
      var partidas = [];
      for (var i = 0; i < S.linhasAj; i++) {
        var dv = centavos(document.querySelector('[data-aj-d="' + i + '"]').value), cv = centavos(document.querySelector('[data-aj-c="' + i + '"]').value);
        if (!dv && !cv) continue;
        partidas.push({conta: document.querySelector('[data-aj-conta="' + i + '"]').value, cc: document.querySelector('[data-aj-cc="' + i + '"]').value || null, debitoCentavos: dv, creditoCentavos: cv});
      }
      var dados = {chave: chave(), data: el('ajData').value, historico: el('ajHist').value, partidas: partidas};
      var v = Ctl.validarAjuste(dados, plano()); if (!v.ok) { toast(v.motivo); return; }
      travar(t, chamar('ctlLancarAjuste', dados)).then(function() { S.linhasAj = 2; toast('Ajuste lançado.'); });
      return;
    }
    if (t.id === 'btnFechar') { travar(t, chamar('ctlFecharMes', {competencia: S.comp})).then(function() { toast(mesBR(S.comp) + ' fechado.'); }); return; }
    if (t.id === 'btnForcar') {
      var j = prompt('Justificativa para fechar com pendências (fica registrada):'); if (!j) return;
      travar(t, chamar('ctlFecharMes', {competencia: S.comp, forcar: true, justificativa: j})).then(function() { toast(mesBR(S.comp) + ' fechado com pendências registradas.'); });
      return;
    }
    if (t.id === 'btnReabrir') {
      var r = prompt('Justificativa da reabertura (fica registrada):'); if (!r) return;
      travar(t, chamar('ctlReabrirMes', {competencia: S.comp, justificativa: r})).then(function() { toast(mesBR(S.comp) + ' reaberto.'); });
      return;
    }
    if (t.id === 'btnExport') { baixarArquivo('kuryos_lancamentos_' + S.comp + '.csv', Ctl.exportarContador(ctl, S.comp)); return; }
    if (t.id === 'orcSalvar') {
      var ano = S.ano, conta = el('orcConta').value, cc = el('orcCc').value, mes = el('orcMes').value, val = Financeiro.centavos(el('orcValor').value);
      if (val == null) { toast('Informe o valor.'); return; }
      var u = {}, meses = mes === 'todos' ? ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] : [mes];
      meses.forEach(function(mm) { u['ctl/orcamento/' + ano + '/' + conta + '/' + cc + '/' + mm] = val; });
      travar(t, db.ref().update(u)).then(function() { toast('Orçamento salvo.'); });
      return;
    }
    if (t.id === 'pcSalvar') {
      var u2 = {};
      Array.prototype.forEach.call(document.querySelectorAll('[data-pc-nome]'), function(i) { var k = i.dataset.pcNome; u2['ctl/plano_contas/' + k + '/nome'] = i.value.trim() || Ctl.PLANO_PADRAO[k].nome; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-pc-ref]'), function(i) { u2['ctl/plano_contas/' + i.dataset.pcRef + '/contaReferencial'] = i.value.trim() || null; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-pc-ativa]'), function(i) { u2['ctl/plano_contas/' + i.dataset.pcAtiva + '/ativa'] = i.checked; });
      travar(t, db.ref().update(u2)).then(function() { toast('Plano de contas salvo.'); });
      return;
    }
    if (t.id === 'ccSalvar') {
      var nome = el('ccNome').value.trim(); if (!nome) return;
      var k = nome.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
      travar(t, db.ref('ctl/centros_custo/' + k).set({nome: nome, tipo: el('ccTipo').value, criadoPor: autor(), criadoEm: new Date().toISOString()})).then(function() { toast('Centro adicionado.'); });
      return;
    }
  });
  document.addEventListener('change', function(ev) {
    var t = ev.target;
    if (t.id === 'selComp') { S.comp = t.value; S.ano = t.value.slice(0, 4); render(); }
    if (t.id === 'selNivel') { S.nivel = t.value; render(); }
    if (t.id === 'selConta') { S.conta = t.value; render(); }
    if (t.id === 'orcAno' && /^20\d{2}$/.test(t.value)) { S.ano = t.value; render(); }
  });

  var iniciado = false;
  function iniciar() { if (iniciado) return; iniciado = true; escutar(); }
  if (window.currentUser) iniciar(); else window.addEventListener('kuryos-auth-pronto', iniciar);
})();
