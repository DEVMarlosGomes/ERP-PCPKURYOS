'use strict';
/* Financeiro — tela (PROMPT_FINANCEIRO.md). As contas moram no motor puro
   shared/financeiro.js. Títulos, baixas, estornos e decisão de lote são do
   SERVIDOR (callables): a regra do banco recusa escrita direta. Esta tela grava
   só o que é dela: contas bancárias, parâmetros, condição informada para título
   sem prazo, bloqueio de pagamento, lote (aguardando), extrato e conciliação de
   baixa existente. Toda gravação por caminho plano (CLAUDE.md). */
(function() {
  var db = firebase.database();
  var F = Financeiro;

  // Fatos dos outros módulos: lidos uma vez (botão "Recarregar"). O fin/ é ao vivo.
  var NOS_UMA_VEZ = ['pedidos_compra', 'processos_cotacao', 'fornecedores', 'clientes', 'estoque_lotes', 'pedidos_comerciais', 'agendamentos_expedicao', 'produtos', 'ops'];
  var D = {}, fin = {}, fechamentos = {}, avisos = [];
  var S = {aba: 'painel', q: '', tsel: {}, lq: {tipo: 'PAGAR', sel: {}, q: '', elemento: ''}, flGrupo: false, dfcAb: 'ATIVIDADE', filtro: 'abertos', fatFiltro: 'faturamento', conta: '', sel: {}, extratoConta: '', previaNotas: [], extConta: '', extDe: '', extAte: '', flG: 'SEMANA', flConta: '', flNat: '', dfcDe: '', dfcAte: '',
    rel: {tipo: 'pagar', de: '', ate: '', dataBase: 'VENCIMENTO', situacao: 'ABERTOS', natureza: '', parceiro: '', conta: '', granularidade: 'SEMANA',
      data: '', destino: '', tipoMov: '', dataAnt: '', granRP: 'MES', base2: 'EMISSAO', centroCusto: '', usuario: '', agrupar: 'PARCEIRO', top: '', meses: 6, taxa: ''}};
  var pronto = {fatos: false, fin: false};

  function el(id) { return document.getElementById(id); }
  function e(v) { return escapeHtml(String(v == null ? '' : v)); }
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function brl(c) {
    if (c == null || !isFinite(c)) return '<span class="mut">—</span>';
    if (c === 0) c = 0; // −0 vira 0 (senão aparece "R$ -0,00")
    var t = 'R$ ' + (c / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    return c < 0 ? '<span class="neg">' + t + '</span>' : t;
  }
  function dataBR(v) { var s = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : '—'; }
  function hojeISO() { return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); }
  function autor() { var u = window.currentUser || {}; return u.nome || u.email || 'financeiro'; }
  function uid() { var u = firebase.auth().currentUser; return u ? u.uid : null; }
  function chave() { return (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^A-Za-z0-9_-]/g, ''); }
  function san(k) { return String(k == null ? '' : k).replace(/[.#$\/\[\]]/g, '_'); }
  // Um aviso por vez: o novo substitui o anterior (antes se sobrepunham no mesmo lugar).
  function toast(msg) { Array.prototype.forEach.call(document.querySelectorAll('.toast'), function(x) { x.remove(); }); var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function() { t.remove(); }, 4200); }
  function erroMsg(err) { return (err && (err.message || err.code)) || String(err); }
  function chamar(nome, dados) { return firebase.functions().httpsCallable(nome)(dados).then(function(r) { return r.data; }); }
  function kpi(cls, r, v, d) { return '<div class="kpi ' + cls + '"><div class="r">' + r + '</div><div class="v">' + v + '</div><div class="d">' + (d || '') + '</div></div>'; }
  function lerReais(v) { var c = F.centavos(v); return c == null ? null : c; }
  var ROT_ORIGEM = {RECEBIMENTO: 'Recebimento', NF_SAIDA: 'NF de saída', OPERACAO: 'Operação do mês', BONUS: 'PLR', MANUAL: 'Manual', IMPORTACAO: 'Saldo de abertura', RENEGOCIACAO: 'Renegociação'};
  var ROT_STATUS = {ABERTO: ['info', 'Aberto'], PARCIAL: ['warn', 'Parcial'], QUITADO: ['ok', 'Quitado'], ABATIDO: ['mute', 'Abatido'], RENEGOCIADO: ['mute', 'Renegociado'], CANCELADO: ['bad', 'Cancelado']};

  function base() { return Object.assign({}, D, {fin: fin, ctl: {fechamentos: fechamentos}}); }

  /* ── Carga ─────────────────────────────────────────────────────────────── */
  function lerFatos() {
    avisos = [];
    el('sDot').classList.remove('on'); el('sTxt').textContent = 'Carregando…';
    return Promise.all(NOS_UMA_VEZ.map(function(n) {
      return db.ref(n).once('value').then(function(s) { D[n] = s.val() || {}; }, function(err) { D[n] = {}; avisos.push(n + ': ' + erroMsg(err)); });
    })).then(function() { pronto.fatos = true; tentar(); });
  }
  function escutar() {
    dbOnValue(db.ref('fin'), function(s) { fin = s.val() || {}; pronto.fin = true; tentar(); },
      {onError: function(err) { fin = {}; pronto.fin = true; avisos.push('fin: ' + erroMsg(err)); tentar(); }});
    dbOnValue(db.ref('ctl/fechamentos'), function(s) { fechamentos = s.val() || {}; if (pronto.fin) render(); }, {onError: function() { fechamentos = {}; }});
    // Centros de custo cadastrados na Controladoria. Sem a leitura (regra ainda não
    // publicada ou sem permissão), valem os centros padrão: não é erro da tela.
    db.ref('ctl/centros_custo').once('value').then(function(s) { centrosCtl = s.val() || {}; if (pronto.fin) render(); }, function() { centrosCtl = {}; });
  }
  function tentar() {
    if (!pronto.fatos || !pronto.fin) return;
    el('sDot').classList.add('on'); el('sTxt').textContent = 'Atualizado · ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
    render();
  }

  /* ── Abas ──────────────────────────────────────────────────────────────── */
  // Trocar o HTML com um campo de texto em foco (Parceiro, Taxa) dispara o "change" dele
  // no meio da troca; um render aninhado ali quebra ("node to be removed is no longer a
  // child"). O pedido que chega durante um render espera ele terminar.
  var renderizando = false;
  function render() {
    if (renderizando) { setTimeout(render, 0); return; }
    renderizando = true;
    try { desenhar(); } finally { renderizando = false; }
  }
  function desenhar() {
    Array.prototype.forEach.call(document.querySelectorAll('.aba'), function(b) { b.setAttribute('aria-selected', b.dataset.aba === S.aba ? 'true' : 'false'); });
    var h = avisos.length ? '<div class="alerta warn"><div><b>Parte da base não carregou.</b> ' + avisos.map(e).join('<br>') + '</div></div>' : '';
    h += ({painel: abaPainel, pagar: function() { return abaTitulos('PAGAR'); }, receber: function() { return abaTitulos('RECEBER'); }, notas: abaNotas, faturamento: abaFaturamento, bancos: abaBancos, liquidacao: abaLiquidacao, lotes: abaLotes,
      conciliacao: abaConciliacao, fluxo: abaFluxo, relatorios: abaRelatorios, complementos: abaComplementos, cadastros: abaCadastros}[S.aba] || abaPainel)();
    el('conteudo').innerHTML = h;
  }
  function contasOpcoes(sel) {
    var cs = fin.contas_bancarias || {};
    var ks = Object.keys(cs);
    if (!ks.length) return '<option value="">— cadastre uma conta em Cadastros —</option>';
    return ks.map(function(k) { return '<option value="' + e(k) + '"' + (k === sel ? ' selected' : '') + '>' + e(cs[k].nome || k) + '</option>'; }).join('');
  }

  function abaPainel() {
    var hoje = hojeISO(), b = base(), cart = F.carteira(fin), bancos = F.saldosBancarios(fin, hoje);
    var saldo = Object.keys(bancos).reduce(function(s, k) { return s + bancos[k].saldoCentavos; }, 0);
    var semana = F.addDias(hoje, 7), venc = {PAGAR: 0, RECEBER: 0}, sem7 = {PAGAR: 0, RECEBER: 0};
    cart.forEach(function(s) { s.abertas.forEach(function(p) { if (p.vencimento < hoje) venc[s.titulo.tipo] += p.abertoCentavos; else if (p.vencimento <= semana) sem7[s.titulo.tipo] += p.abertoCentavos; }); });
    var pm = F.prazosMedios(fin, hoje), compl = F.complementos(b);
    var h = '';
    if (!Object.keys(fin.contas_bancarias || {}).length) h += '<div class="alerta info"><div><b>Comece pelos bancos.</b> Cadastre as contas e o saldo de hoje em <b>Cadastros</b>; depois importe os títulos em aberto (planilha). A partir daí, recebimentos e notas entram sozinhos.</div></div>';
    h += '<div class="kpis">' +
      kpi(saldo >= 0 ? 'ok' : 'bad', 'Saldo em bancos', brl(saldo), Object.keys(bancos).length + ' conta(s), saldo inicial + baixas') +
      kpi('warn', 'A pagar nos próximos 7 dias', brl(sem7.PAGAR), 'parcelas abertas até ' + dataBR(semana)) +
      kpi('info', 'A receber nos próximos 7 dias', brl(sem7.RECEBER), 'parcelas abertas até ' + dataBR(semana)) +
      kpi(venc.PAGAR ? 'bad' : 'ok', 'Pagamentos vencidos', brl(venc.PAGAR), 'parcelas a pagar com vencimento passado') +
      kpi(venc.RECEBER ? 'bad' : 'ok', 'Recebimentos vencidos', brl(venc.RECEBER), 'clientes em atraso') +
      kpi('info', 'Prazo médio', (pm.pmr == null ? '—' : pm.pmr + ' d') + ' / ' + (pm.pmp == null ? '—' : pm.pmp + ' d'), 'recebimento / pagamento (90 dias); sem baixa, não há prazo') +
      kpi(compl.length ? 'warn' : 'ok', 'Complementos abertos', compl.length, 'fatos sem valor ou sem prazo') + '</div>';
    var fl = F.fluxoDeCaixa(b, hoje, 6);
    h += '<div class="card"><h3>Próximas 6 semanas</h3>' + tabelaFluxo(fl, true) + '</div>';
    return h;
  }

  /* ── Faturamento (Expedição): espelho só de leitura ─────────────────────
     Mesmas cargas e mesma régua da tela da Expedição (CargasPA); as linhas e
     os campos que faltam no retrato vêm de shared/espelho-faturamento.js. */
  var FAT_FILTROS = [['faturamento', 'A faturar (sem NF)'], ['FATURADA', 'Faturadas, ainda não expedidas'], ['ativas', 'Todas as cargas em aberto']];
  var COR_ETAPA = {cinza: 'mute', laranja: 'warn', azul: 'info', verde: 'ok', vermelho: 'bad'};
  function reais(v) { return v == null ? '<span class="mut">—</span>' : 'R$ ' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 4}); }
  function inteiro(v) { return Number(v || 0).toLocaleString('pt-BR'); }
  function cargasDoEspelho() {
    return CargasPA.listar(D.agendamentos_expedicao || {}, S.fatFiltro, S.q).map(function(a) {
      var ls = EspelhoFaturamento.linhas(a, D);
      return {agenda: a, etapa: CargasPA.etapa(a), sol: EspelhoFaturamento.ultimaSolicitacao(a), linhas: ls,
        totais: EspelhoFaturamento.totais(ls), cliente: a.cliente || '', dataAgendada: a.dataAgendada || ''};
    });
  }
  function linhaEspelho(l) {
    return '<tr><td><b>' + e(l.descricao || '—') + '</b><br><span class="mut" style="font-size:12px">Interno: ' + e(l.sku || '—') +
      ' · Externo: ' + (l.codExterno ? e(l.codExterno) : '<span class="neg">não cadastrado</span>') +
      (l.identificadorPalete ? ' · ' + e(l.identificadorPalete) : '') + (l.pedidoNumero ? ' · Pedido ' + e(l.pedidoNumero) : '') + '</span></td>' +
      '<td>' + e(l.lote || '—') + '</td><td>' + dataBR(l.fabricacao) + '</td><td>' + dataBR(l.validade) + '</td>' +
      '<td class="n">' + inteiro(l.caixasFechadas) + (l.unidadesPorCaixa ? '<br><span class="mut" style="font-size:12px">de ' + inteiro(l.unidadesPorCaixa) + ' un</span>' : '') + '</td>' +
      '<td class="n">' + inteiro(l.unidadesAvulsas) + '</td><td class="n"><b>' + inteiro(l.totalUnidades) + '</b></td>' +
      '<td class="n">' + reais(l.valorCaixa) + '</td><td class="n">' + reais(l.valorUnitario) + '</td><td class="n">' + reais(l.valorTotal) + '</td></tr>';
  }
  function cartaoEspelho(c) {
    var a = c.agenda, t = c.totais, nfs = CargasPA.nfs(a), falta = [];
    if (c.sol && t.semPreco) falta.push(t.semPreco + ' sem preço no pedido');
    if (t.semCodExterno) falta.push(t.semCodExterno + ' sem código externo (Cadastros › Produtos › Código no cliente)');
    if (t.semFabricacao) falta.push(t.semFabricacao + ' sem data de fabricação');
    if (t.semValidade) falta.push(t.semValidade + ' sem validade');
    return '<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
      '<h3 style="margin:0">' + e(c.cliente || 'Cliente não informado') + ' · ' + dataBR(c.dataAgendada) + (a.janela ? ' ' + e(a.janela) : '') + '</h3>' +
      '<span><span class="tg ' + (COR_ETAPA[c.etapa.cor] || 'mute') + '">' + e(c.etapa.curto) + '</span>' +
      (nfs.length ? ' <span class="tg info">NF ' + e(nfs.map(function(x) { return x.texto; }).join(', ')) + '</span>' : '') + '</span></div>' +
      '<div class="mut" style="font-size:13px;margin:4px 0 10px">' +
      (c.sol ? 'Solicitado em ' + dataBR(c.sol.em) + ' por ' + e(c.sol.por || '—') : 'Faturamento ainda não solicitado pela Expedição (sem preço até solicitar)') +
      (a.transportadora ? ' · Transportadora: ' + e(a.transportadora) : '') + (a.enderecoEntrega ? ' · Entrega: ' + e(a.enderecoEntrega) : '') +
      (c.sol && c.sol.observacoes ? '<br>Observações: ' + e(c.sol.observacoes) : '') + '</div>' +
      (falta.length ? '<div class="alerta warn"><div><b>Falta para emitir:</b> ' + e(falta.join(' · ')) + '</div></div>' : '') +
      '<div class="tw"><table><thead><tr><th>Descrição do SKU</th><th>Lote</th><th>Fabricação</th><th>Validade</th><th class="n">Caixas fechadas</th>' +
      '<th class="n">Unid. avulsas</th><th class="n">Total unid.</th><th class="n">Valor por caixa</th><th class="n">Valor unitário</th><th class="n">Valor total</th></tr></thead><tbody>' +
      c.linhas.map(linhaEspelho).join('') +
      '<tr><td colspan="4"><b>Total da carga</b> (' + c.linhas.length + (c.linhas.length === 1 ? ' palete' : ' paletes') + ')</td>' +
      '<td class="n"><b>' + inteiro(t.caixasFechadas) + '</b></td><td class="n"><b>' + inteiro(t.unidadesAvulsas) + '</b></td><td class="n"><b>' + inteiro(t.totalUnidades) + '</b></td>' +
      '<td></td><td></td><td class="n"><b>' + (c.sol ? reais(t.valorTotal) + (t.semPreco ? ' <span class="mut">(parcial)</span>' : '') : '<span class="mut">—</span>') + '</b></td></tr>' +
      '</tbody></table></div></div>';
  }
  function abaFaturamento() {
    var cargas = cargasDoEspelho();
    var h = '<div class="card"><h3>Espelho do faturamento da Expedição</h3><div class="mut" style="font-size:13px;margin-bottom:10px">' +
      'O que a Expedição pediu para faturar, palete a palete. Carga com faturamento solicitado mostra o que foi enviado ao Financeiro (com preço); ' +
      'carga só agendada aparece sem preço até a Expedição solicitar. Caixas fechadas e unidades avulsas são desta carga. ' +
      'Para registrar a NF, use <a href="faturamento.html">Faturamento de cargas</a>. Os dados são de quando a página abriu: use "Recarregar dados".</div>' +
      '<div class="barra"><input class="busca" id="qTit" placeholder="Buscar cliente, pedido, SKU, NF…" value="' + e(S.q) + '">' +
      '<select class="sel" id="fFat">' + FAT_FILTROS.map(function(o) { return '<option value="' + o[0] + '"' + (S.fatFiltro === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<button class="btn sm" id="fatCsv"' + (cargas.length ? '' : ' disabled') + '>Baixar CSV (Excel)</button></div></div>';
    if (!cargas.length) return h + '<div class="vazio"><b>Nenhuma carga neste filtro.</b>As cargas aparecem aqui quando a Expedição agenda.</div>';
    return h + cargas.map(cartaoEspelho).join('');
  }
  function baixarCsvFat() {
    var blob = new Blob([EspelhoFaturamento.csv(cargasDoEspelho())], {type: 'text/csv;charset=utf-8'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'faturamento-expedicao-' + hojeISO() + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function abaTitulos(tipo) {
    var hoje = hojeISO(), q = S.q.trim().toUpperCase();
    var lista = F.carteira(fin).filter(function(s) { return s.titulo.tipo === tipo; })
      .filter(function(s) { return S.filtro === 'todos' || (S.filtro === 'abertos' ? s.saldoCentavos > 0 : S.filtro === 'vencidos' ? s.abertas.some(function(p) { return p.vencimento < hoje; }) : s.semVencimento); })
      .filter(function(s) { return !q || [s.titulo.documento, s.titulo.parceiro && s.titulo.parceiro.nome, s.id, s.titulo.origem && s.titulo.origem.pc].join(' ').toUpperCase().indexOf(q) >= 0; })
      .sort(function(a, b) { var va = (a.abertas[0] || {}).vencimento || '9999', vb = (b.abertas[0] || {}).vencimento || '9999'; return va.localeCompare(vb); });
    var ag = F.aging(base(), hoje)[tipo];
    var h = '<div class="kpis">' + [['A_VENCER', 'A vencer', 'info'], ['D1_30', 'Vencido 1–30 d', 'warn'], ['D31_60', '31–60 d', 'bad'], ['D61_90', '61–90 d', 'bad'], ['D90', 'Mais de 90 d', 'bad'], ['SEM_VENCIMENTO', 'Sem vencimento', 'warn']]
      .map(function(x) { return kpi(ag[x[0]] ? x[2] : 'ok', x[1], brl(ag[x[0]]), ''); }).join('') + '</div>';
    h += '<div class="card"><div class="barra"><input class="busca" id="qTit" placeholder="Buscar documento, ' + (tipo === 'PAGAR' ? 'fornecedor' : 'cliente') + ', PC…" value="' + e(S.q) + '">' +
      '<select class="sel" id="fFiltro">' + [['abertos', 'Em aberto'], ['vencidos', 'Vencidos'], ['semvenc', 'Sem vencimento'], ['todos', 'Todos']].map(function(o) { return '<option value="' + o[0] + '"' + (S.filtro === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<button class="btn sm" data-manual="' + tipo + '">+ Título manual</button><button class="btn sm" data-adiant="' + tipo + '">+ Adiantamento</button></div>' + barraSelecao(tipo);
    h += '<div class="tw"><table><thead><tr><th></th><th>Documento</th><th>' + (tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente') + '</th><th>Origem</th><th>Emissão</th><th>Próx. vencimento</th><th>Parcelas</th><th class="n">Valor</th><th class="n">Saldo</th><th>Situação</th><th></th></tr></thead><tbody>' +
      (lista.length ? lista.map(function(s) {
        var t = s.titulo, p = s.abertas[0], st = ROT_STATUS[s.status] || ['mute', s.status];
        var vencido = p && p.vencimento < hoje;
        return '<tr><td>' + (s.saldoCentavos > 0 ? '<input type="checkbox" data-tsel="' + e(s.id) + '"' + (S.tsel[s.id] ? ' checked' : '') + ' aria-label="Selecionar ' + e(t.documento || s.id) + '">' : '') + '</td><td><a href="#" data-det="' + e(s.id) + '">' + e(t.documento || s.id) + '</a></td><td>' + e(t.parceiro && t.parceiro.nome) + '</td><td>' + e(ROT_ORIGEM[t.origem && t.origem.tipo] || (t.origem && t.origem.tipo)) + (t.origem && t.origem.pc ? ' <span class="mut">' + e(t.origem.pc) + '</span>' : '') + '</td>' +
          '<td>' + dataBR(t.emissao) + '</td><td>' + (s.semVencimento ? '<span class="tg warn">sem prazo</span>' : p ? '<span class="' + (vencido ? 'neg' : '') + '">' + dataBR(p.vencimento) + '</span>' + (p.de > 1 ? ' <span class="mut">' + p.n + '/' + p.de + '</span>' : '') : '—') + '</td>' +
          '<td>' + e(F.resumoParcelas(s)) + '</td><td class="n">' + brl(t.valorCentavos) + '</td><td class="n">' + brl(s.saldoCentavos) + '</td><td><span class="tg ' + st[0] + '">' + st[1] + '</span>' + (s.bloqueio ? ' <span class="tg bad">bloqueado</span>' : '') + '</td>' +
          '<td class="mini-acoes">' + (s.saldoCentavos > 0 ? '<button class="btn sm pri" data-baixar="' + e(s.id) + '">' + (tipo === 'PAGAR' ? 'Pagar' : 'Receber') + '</button>' : '') +
          (tipo === 'PAGAR' && s.saldoCentavos > 0 ? '<button class="btn sm" data-bloq="' + e(s.id) + '">' + (s.bloqueio ? 'Desbloquear' : 'Bloquear') + '</button>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="11"><div class="vazio"><b>Nenhum título ' + (S.filtro === 'abertos' ? 'em aberto' : 'neste filtro') + '.</b>' + (tipo === 'PAGAR' ? 'Títulos a pagar nascem dos recebimentos contra pedido de compra.' : 'Títulos a receber nascem das notas registradas nas cargas (Faturamento) — o faturamento ainda não opera neste banco.') + '</div></td></tr>') +
      '</tbody></table></div></div>';
    return h + cardAdiantamentos(tipo);
  }

  /* ── F9: liquidação por filtro (CB-06/07/08, NA-08) ─────────────────────── */
  function opcoesElementos(tipo, atual, vazio) {
    var els = F.elementos(fin);
    var ks = Object.keys(els).filter(function(k) { var x = els[k], rec = x.natureza === 'RECEITA_VENDA' || x.natureza === 'OUTRAS_RECEITAS'; return x.ativo && F.NATUREZAS.indexOf(x.natureza) >= 0 && (!tipo || rec === (tipo === 'RECEBER')); })
      .sort(function(a, b) { return String(els[a].grupo).localeCompare(String(els[b].grupo)) || a.localeCompare(b); });
    return (vazio ? '<option value="">' + e(vazio) + '</option>' : '') + ks.map(function(k) { return '<option value="' + e(k) + '"' + (k === atual ? ' selected' : '') + '>' + e(k + ' ' + els[k].nome) + '</option>'; }).join('');
  }
  function lqChave(l) { return l.titulo + '#' + l.n; }
  function abaLiquidacao() {
    var L = S.lq, hoje = hojeISO();
    if (!L.data) L.data = hoje;
    if (L.de === undefined) { L.de = hoje; L.ate = F.addDias(hoje, 1); }
    var ls = F.parcelasParaLiquidar(fin, {tipo: L.tipo, de: L.de || null, ate: L.ate || null, q: L.q, elemento: L.elemento || null, hoje: hoje});
    var vis = {}; ls.forEach(function(l) { vis[lqChave(l)] = l; });
    Object.keys(L.sel).forEach(function(k) { if (!vis[k] || vis[k].bloqueado) delete L.sel[k]; });
    var nSel = Object.keys(L.sel).length, tot = Object.keys(L.sel).reduce(function(a, k) { return a + vis[k].abertoCentavos; }, 0);
    var totAberto = ls.reduce(function(a, l) { return a + l.abertoCentavos; }, 0), els = F.elementos(fin), pagar = L.tipo === 'PAGAR';
    var h = '<div class="card"><h3>Liquidação ' + (pagar ? 'de pagamentos' : 'de recebimentos') + '</h3><div class="barra">' +
      '<select class="sel" id="lqTipo" aria-label="Tipo"><option value="PAGAR"' + (pagar ? ' selected' : '') + '>A pagar</option><option value="RECEBER"' + (pagar ? '' : ' selected') + '>A receber</option></select>' +
      '<button class="btn sm" data-lq-atalho="HOJE">Hoje e amanhã</button><button class="btn sm" data-lq-atalho="SEMANA">Esta semana</button><button class="btn sm" data-lq-atalho="VENCIDOS">Vencidos</button><button class="btn sm" data-lq-atalho="TUDO">Tudo</button>' +
      '<label class="mut">vencimento de <input class="inp" type="date" id="lqDe" value="' + e(L.de || '') + '"></label><label class="mut">até <input class="inp" type="date" id="lqAte" value="' + e(L.ate || '') + '"></label>' +
      '<input class="inp" id="lqQ" placeholder="' + (pagar ? 'Fornecedor' : 'Cliente') + ' ou documento…" value="' + e(L.q) + '">' +
      '<select class="sel" id="lqElem" aria-label="Elemento">' + opcoesElementos(L.tipo, L.elemento, 'Todos os elementos') + '</select></div>' +
      '<div class="sub" style="margin-bottom:8px">Uma linha por parcela em aberto. Marque, informe a data de movimentação e a conta, e confirme: sai uma baixa por título. Juros, multa, desconto e baixa parcial ficam no botão ' + (pagar ? 'Pagar' : 'Receber') + ' do título.</div>' +
      '<div class="tw"><table id="lqTabela"><thead><tr><th><input type="checkbox" id="lqTodos" aria-label="Marcar todas"' + (ls.length && nSel === ls.filter(function(l) { return !l.bloqueado; }).length ? ' checked' : '') + '></th><th>' + (pagar ? 'Fornecedor' : 'Cliente') + '</th><th>Documento</th><th>Parcela</th><th>Emissão</th><th>Vencimento</th><th class="n">Dias</th><th class="n">Valor</th><th class="n">Em aberto</th><th>Elemento</th></tr></thead><tbody>' +
      (ls.length ? ls.map(function(l) {
        var k = lqChave(l);
        return '<tr><td>' + (l.bloqueado ? '<span class="tg bad" title="Pagamento bloqueado">bloq.</span>' : '<input type="checkbox" data-lq-sel="' + e(k) + '"' + (L.sel[k] ? ' checked' : '') + ' aria-label="Marcar ' + e(l.documento + ' ' + l.n + '/' + l.de) + '">') + '</td>' +
          '<td>' + e(l.parceiro) + '</td><td><a href="#" data-det="' + e(l.titulo) + '">' + e(l.documento) + '</a></td><td>' + l.n + '/' + l.de + '</td><td>' + dataBR(l.emissao) + '</td>' +
          '<td' + (l.dias > 0 ? ' class="neg"' : '') + '>' + dataBR(l.vencimento) + '</td><td class="n">' + (l.dias > 0 ? l.dias : '') + '</td><td class="n">' + brl(l.valorCentavos) + '</td><td class="n">' + brl(l.abertoCentavos) + '</td>' +
          '<td>' + e(l.elemento ? l.elemento + ' ' + ((els[l.elemento] || {}).nome || '') : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="10"><div class="vazio"><b>Nada a ' + (pagar ? 'pagar' : 'receber') + ' neste filtro.</b></div></td></tr>') +
      '<tr class="tot"><td></td><td colspan="7"><b>' + ls.length + ' parcela(s)</b></td><td class="n"><b>' + brl(totAberto) + '</b></td><td></td></tr></tbody></table></div>' +
      '<div class="barra" style="margin-top:10px"><span class="pill" id="lqResumo">' + nSel + ' marcada(s) · ' + brl(tot) + '</span>' +
      '<label class="mut">data de movimentação <input class="inp" type="date" id="lqData" value="' + e(L.data) + '"></label>' +
      '<select class="sel" id="lqConta" aria-label="Conta">' + contasOpcoes(L.conta || S.conta) + '</select>' +
      '<button class="btn pri sm" id="lqOk"' + (nSel ? '' : ' disabled') + '>' + (pagar ? 'Pagar' : 'Receber') + ' marcadas</button></div></div>';
    var mov = F.relBaixas(fin, {de: L.data, ate: L.data, tipo: L.tipo});
    h += '<div class="card" id="lqMovimento"><h3>Movimento de ' + dataBR(L.data) + '</h3><div class="sub" style="margin-bottom:8px">Tudo o que foi ' + (pagar ? 'pago' : 'recebido') + ' nesta data de movimentação (com os estornos).</div>' + tabelaRel(mov).replace('id="relTabela"', 'id="lqMovTabela"') + '</div>';
    return h;
  }
  function linhaClassif(id, t) {
    var ce = F.classificacaoEfetiva(fin, id), els = F.elementos(fin), nomes = RX.centros(centrosCtl);
    var partes = F.partesDoTitulo(fin, id, 10000).map(function(x) { return x.elemento; }).filter(function(c, i, a) { return a.indexOf(c) === i; });
    var rat = ce.rateio && ce.rateio.length ? ce.rateio.map(function(r) { return (nomes[r.centro] || r.centro) + ' ' + String(r.percentual).replace('.', ',') + '%'; }).join(' · ') : (t.centroCusto ? (nomes[t.centroCusto] || t.centroCusto) : '—');
    return '<div class="linha-kv"><span>Elemento</span><b>' + e(partes.map(function(c) { return c + ' ' + ((els[c] || {}).nome || ''); }).join(' + ')) + (ce.fonte === 'NATUREZA' ? ' <span class="mut">(pela natureza)</span>' : '') +
      ' <button class="btn sm" data-classif="' + e(id) + '">Classificar</button></b></div>' +
      '<div class="linha-kv"><span>Centro de custo</span><b>' + e(rat) + '</b></div>' +
      '<div class="linha-kv"><span>Forma de pagamento</span><b>' + e(ce.formaPagamento ? F.FORMAS_PAGAMENTO[ce.formaPagamento] || ce.formaPagamento : '—') + '</b></div>';
  }
  function formClassificar(id) {
    var s = porIdCarteira()[id]; if (!s) return;
    var ce = F.classificacaoEfetiva(fin, id), nomes = RX.centros(centrosCtl), atual = ce.elemento || F.elementoDaNatureza(s.titulo.natureza);
    var rat = ce.rateio && ce.rateio.length ? ce.rateio : [{centro: s.titulo.centroCusto || '', percentual: 100}];
    var linhas = [0, 1, 2, 3, 4].map(function(i) {
      var r = rat[i] || {centro: '', percentual: ''};
      return '<div><label for="clCC' + i + '">Centro ' + (i + 1) + '</label><select class="sel" id="clCC' + i + '"><option value="">—</option>' + Object.keys(nomes).map(function(k) { return '<option value="' + e(k) + '"' + (k === r.centro ? ' selected' : '') + '>' + e(nomes[k]) + '</option>'; }).join('') + '</select></div>' +
        '<div><label for="clPc' + i + '">%</label><input class="inp" id="clPc' + i + '" inputmode="decimal" value="' + e(r.percentual === '' ? '' : String(r.percentual).replace('.', ',')) + '"></div>';
    }).join('');
    var h = '<div class="sub" style="margin-bottom:10px">' + e(s.titulo.documento || id) + ' · ' + e(s.titulo.parceiro && s.titulo.parceiro.nome) + ' · ' + brl(s.titulo.valorCentavos) + '</div>' +
      '<div class="form"><div><label for="clEl">Elemento de custo</label><select class="sel" id="clEl">' + opcoesElementos(s.titulo.tipo, atual) + '</select></div>' +
      '<div><label for="clForma">Forma de pagamento</label><select class="sel" id="clForma"><option value="">—</option>' + Object.keys(F.FORMAS_PAGAMENTO).map(function(k) { return '<option value="' + k + '"' + (k === ce.formaPagamento ? ' selected' : '') + '>' + e(F.FORMAS_PAGAMENTO[k]) + '</option>'; }).join('') + '</select></div>' +
      '<div style="grid-column:1/-1"><b>Rateio entre centros de custo</b> <span class="dica">os percentuais somam 100%</span></div>' + linhas + '</div>' +
      '<div style="margin-top:12px"><button class="btn pri" id="clOk" data-tit="' + e(id) + '">Salvar classificação</button> <span class="dica">O título não muda: a classificação vale nos relatórios de gastos, no DFC por elemento e, no título manual, na Controladoria.</span></div>';
    abrir('Classificar título', h);
  }
  function cardElementos() {
    var els = F.elementos(fin), ks = Object.keys(els).sort(function(a, b) { return String(els[a].grupo).localeCompare(String(els[b].grupo)) || String(els[a].subgrupo).localeCompare(String(els[b].subgrupo)) || a.localeCompare(b); });
    return '<div class="card" id="cardElementos"><h3>Plano de elementos de custo</h3><div class="sub" style="margin-bottom:8px">Elemento é o nome da conta (ex.: 2113 Aluguel). A natureza liga o elemento à Controladoria e ao DFC por atividade; o grupo e o subgrupo abrem o DFC por elemento. Proposta inicial de ' + Object.keys(F.ELEMENTOS_PADRAO).length + ' elementos: ajuste os códigos aos do WebMais. Elemento não se apaga; inative.</div>' +
      '<div class="tw"><table><thead><tr><th>Código</th><th>Nome</th><th>Grupo</th><th>Subgrupo</th><th>Natureza</th><th>Situação</th><th></th></tr></thead><tbody>' +
      ks.map(function(k) { var x = els[k]; return '<tr><td>' + e(k) + '</td><td>' + e(x.nome) + '</td><td>' + e(x.grupo + ' ' + (F.GRUPOS_ELEMENTO[x.grupo] || '')) + '</td><td>' + e(x.subgrupo) + '</td><td>' + e(rotNat(x.natureza)) + '</td><td>' + (x.ativo ? '<span class="tg ok">ativo</span>' : '<span class="tg mute">inativo</span>') + (x.padrao === false ? ' <span class="tg info">cadastrado</span>' : '') + '</td><td><button class="btn sm" data-el-edit="' + e(k) + '">Editar</button></td></tr>'; }).join('') +
      '</tbody></table></div><div class="form" style="margin-top:12px"><div><label for="elCod">Código</label><input class="inp" id="elCod" placeholder="2120"></div><div><label for="elNome">Nome</label><input class="inp" id="elNome"></div>' +
      '<div><label for="elGrupo">Grupo</label><select class="sel" id="elGrupo">' + Object.keys(F.GRUPOS_ELEMENTO).map(function(g) { return '<option value="' + g + '">' + e(g + ' ' + F.GRUPOS_ELEMENTO[g]) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="elSub">Subgrupo</label><input class="inp" id="elSub"></div>' +
      '<div><label for="elNat">Natureza</label><select class="sel" id="elNat">' + F.NATUREZAS.concat(['RESULTADO_FINANCEIRO', 'ADIANTAMENTOS']).map(function(n) { return '<option value="' + n + '">' + e(rotNat(n)) + '</option>'; }).join('') + '</select></div>' +
      '<div><label><input type="checkbox" id="elAtivo" checked> ativo</label></div></div>' +
      '<div style="margin-top:10px"><button class="btn sm pri" id="elOk">Salvar elemento</button></div></div>';
  }

  /* ── Entrega B: seleção, adiantamento, renegociação e cancelamento ─────── */
  function porIdCarteira() { var m = {}; F.carteira(fin).forEach(function(x) { m[x.id] = x; }); return m; }
  function selecionados(tipo) {
    var m = porIdCarteira();
    return Object.keys(S.tsel).filter(function(k) { var x = m[k]; return x && x.titulo.tipo === tipo && x.saldoCentavos > 0; }).map(function(k) { return m[k]; });
  }
  function barraSelecao(tipo) {
    var sel = selecionados(tipo), tot = sel.reduce(function(a, x) { return a + x.saldoCentavos; }, 0), dis = sel.length ? '' : ' disabled';
    return '<div class="barra" id="barraSel"><span class="pill">' + sel.length + ' selecionado(s) · ' + brl(tot) + '</span>' +
      '<button class="btn sm" data-reneg="' + tipo + '"' + dis + '>Renegociar selecionados</button>' +
      '<button class="btn sm perigo" data-cancel="' + tipo + '"' + dis + '>Cancelar selecionados</button>' +
      (sel.length ? '<button class="btn sm" data-limpar-sel="1">Limpar seleção</button>' : '<span class="dica">Marque os títulos na primeira coluna para renegociar ou cancelar.</span>') + '</div>';
  }
  function cardAdiantamentos(tipo) {
    var ads = F.saldosAdiantamentos(fin);
    var ks = Object.keys(ads).filter(function(k) { return ads[k].tipo === tipo && !ads[k].estornado; })
      .sort(function(a, b) { return (ads[b].saldoCentavos > 0) - (ads[a].saldoCentavos > 0) || String(ads[b].data).localeCompare(String(ads[a].data)); });
    if (!ks.length) return '';
    var abertos = ks.filter(function(k) { return ads[k].saldoCentavos > 0; }).reduce(function(a, k) { return a + ads[k].saldoCentavos; }, 0);
    return '<div class="card" id="cardAdiant"><h3>Adiantamentos ' + (tipo === 'PAGAR' ? 'a fornecedores' : 'de clientes') + ' · disponível ' + brl(abertos) + '</h3>' +
      '<div class="sub" style="margin-bottom:8px">O dinheiro já ' + (tipo === 'PAGAR' ? 'saiu' : 'entrou') + '. Para abater um título do mesmo ' + (tipo === 'PAGAR' ? 'fornecedor' : 'cliente') + ', abra o título e use "Compensar".</div>' +
      '<div class="tw"><table><thead><tr><th>Data</th><th>' + (tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente') + '</th><th>Documento</th><th>Conta</th><th class="n">Valor</th><th class="n">Compensado</th><th class="n">Disponível</th><th></th></tr></thead><tbody>' +
      ks.map(function(k) {
        var a = ads[k];
        return '<tr><td>' + dataBR(a.data) + '</td><td>' + e(a.parceiro.nome) + '</td><td>' + e(a.documento || '') + '</td><td>' + e(((fin.contas_bancarias || {})[a.conta] || {}).nome || a.conta) + '</td>' +
          '<td class="n">' + brl(a.valorCentavos) + '</td><td class="n">' + brl(a.compensadoCentavos) + '</td><td class="n"><b>' + brl(a.saldoCentavos) + '</b></td>' +
          '<td>' + (a.compensadoCentavos === 0 ? '<button class="btn sm perigo" data-est-ad="' + e(k) + '">Estornar</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function formAdiantamento(tipo) {
    var nomes = {};
    vals0(fin.titulos).forEach(function(x) { if (x.tipo === tipo && x.parceiro && x.parceiro.nome) nomes[x.parceiro.nome] = x.parceiro.cnpj || nomes[x.parceiro.nome] || ''; });
    var h = '<datalist id="adParcLista">' + Object.keys(nomes).sort().map(function(n) { return '<option value="' + e(n) + '">'; }).join('') + '</datalist>' +
      '<div class="form"><div><label for="adParc">' + (tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente') + '</label><input class="inp" id="adParc" list="adParcLista" data-cnpjs="' + e(JSON.stringify(nomes)) + '"></div>' +
      '<div><label for="adCnpj">CNPJ</label><input class="inp" id="adCnpj"><div class="dica">Com o CNPJ, a compensação reconhece o parceiro mesmo com o nome escrito diferente.</div></div>' +
      '<div><label for="adConta">Conta</label><select class="sel" id="adConta">' + contasOpcoes(S.conta) + '</select></div>' +
      '<div><label for="adData">Data</label><input class="inp" type="date" id="adData" value="' + hojeISO() + '"></div>' +
      '<div><label for="adValor">Valor (R$)</label><input class="inp" id="adValor" inputmode="decimal"></div>' +
      '<div><label for="adDoc">Documento</label><input class="inp" id="adDoc" placeholder="recibo, PIX…"></div>' +
      '<div style="grid-column:1/-1"><label for="adHist">Histórico</label><input class="inp" id="adHist"></div></div>' +
      '<div style="margin-top:12px"><button class="btn pri" id="adOk" data-tipo="' + tipo + '">Lançar adiantamento</button> <span class="dica">' + (tipo === 'PAGAR' ? 'Sai' : 'Entra') + ' da conta agora; depois compensa os títulos.</span></div>';
    abrir('Adiantamento ' + (tipo === 'PAGAR' ? 'a fornecedor' : 'de cliente'), h);
  }
  function vals0(o) { return Object.keys(o || {}).map(function(k) { return o[k]; }).filter(Boolean); }
  function formCompensar(adId, titId) {
    var a = F.saldosAdiantamentos(fin)[adId], x = porIdCarteira()[titId]; if (!a || !x) return;
    var sug = Math.min(a.saldoCentavos, x.saldoCentavos);
    var h = '<div class="sub" style="margin-bottom:12px">' + e(x.titulo.documento || titId) + ' · saldo ' + brl(x.saldoCentavos) + ' · adiantamento de ' + dataBR(a.data) + ' com ' + brl(a.saldoCentavos) + ' disponível</div>' +
      '<div class="form"><div><label for="cpValor">Valor a compensar (R$)</label><input class="inp" id="cpValor" value="' + (sug / 100).toFixed(2).replace('.', ',') + '"></div>' +
      '<div><label for="cpData">Data</label><input class="inp" type="date" id="cpData" value="' + hojeISO() + '"></div></div>' +
      '<div style="margin-top:12px"><button class="btn pri" id="cpOk" data-ad="' + e(adId) + '" data-tit="' + e(titId) + '">Compensar</button> <span class="dica">Não mexe no banco: o dinheiro já ' + (a.tipo === 'PAGAR' ? 'saiu' : 'entrou') + ' no adiantamento.</span></div>';
    abrir('Compensar com adiantamento', h);
  }
  function formRenegociar(tipo) {
    var sel = selecionados(tipo); if (!sel.length) return;
    var h = '<div class="tw"><table><thead><tr><th>Título</th><th>' + (tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente') + '</th><th class="n">Saldo</th></tr></thead><tbody>' +
      sel.map(function(x) { return '<tr><td>' + e(x.titulo.documento || x.id) + '</td><td>' + e(x.titulo.parceiro && x.titulo.parceiro.nome) + '</td><td class="n">' + brl(x.saldoCentavos) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="form" style="margin-top:10px"><div><label for="rnAcr">Acréscimo / juros (R$)</label><input class="inp" id="rnAcr" value="0"></div><div><label for="rnDesc">Desconto (R$)</label><input class="inp" id="rnDesc" value="0"></div>' +
      '<div><label for="rnVenc">Vencimento único</label><input class="inp" type="date" id="rnVenc"><div class="dica">Preenchido, vale ele e o parcelamento é ignorado.</div></div>' +
      '<div><label for="rnNParc">Nº de parcelas</label><input class="inp" type="number" min="1" max="60" id="rnNParc" placeholder="2"></div>' +
      '<div><label for="rnPrim">1º vencimento (dias)</label><input class="inp" type="number" min="0" max="365" id="rnPrim" value="30"></div>' +
      '<div><label for="rnInt">Intervalo (dias)</label><input class="inp" type="number" min="1" max="365" id="rnInt" value="30"></div>' +
      '<div><label for="rnCond">Condição</label><input class="inp" id="rnCond" placeholder="30/60"></div>' +
      '<div style="grid-column:1/-1"><label for="rnMotivo">Motivo</label><input class="inp" id="rnMotivo" placeholder="ex.: acordo com o fornecedor"></div>' +
      '<div style="grid-column:1/-1" id="rnPrev" aria-live="polite"></div></div>' +
      '<div style="margin-top:12px"><button class="btn pri" id="rnOk" data-tipo="' + tipo + '">Renegociar</button> <span class="dica">Os originais ficam como "Renegociado" e nasce um título novo; dá para desfazer enquanto o novo não tiver baixa.</span></div>';
    abrir('Renegociar ' + sel.length + ' título(s)', h);
    previaReneg();
  }
  function dadosReneg() {
    return {titulos: Object.keys(S.tsel).filter(function(k) { return S.tsel[k]; }), data: hojeISO(), vencimento: el('rnVenc').value || null, condicao: el('rnCond').value,
      acrescimoCentavos: lerReais(el('rnAcr').value || '0') || 0, descontoCentavos: lerReais(el('rnDesc').value || '0') || 0, motivo: el('rnMotivo').value};
  }
  function previaReneg() {
    var alvo = el('rnPrev'); if (!alvo) return;
    var tipo = el('rnOk').dataset.tipo, d = dadosReneg();
    d.titulos = selecionados(tipo).map(function(x) { return x.id; });
    var m = F.montarRenegociacao(fin, Object.assign({}, d, {motivo: d.motivo || 'prévia'}), 'previa');
    if (!m.ok) { alvo.innerHTML = '<div class="alerta warn"><div><b>Prévia:</b> ' + e(m.motivo) + '</div></div>'; return; }
    var sx = F.situacao('previa', m.titulo, null, null, null);
    alvo.innerHTML = '<h3 style="margin:4px 0 6px">Título novo: ' + brl(m.titulo.valorCentavos) + '</h3><div class="tw"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th class="n">Valor</th></tr></thead><tbody>' +
      sx.parcelas.map(function(x) { return '<tr><td>' + x.n + '/' + x.de + '</td><td>' + dataBR(x.vencimento) + '</td><td class="n">' + brl(x.valorCentavos) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function formCancelar(tipo) {
    var sel = selecionados(tipo); if (!sel.length) return;
    var h = '<div class="form"><div><label for="cnMotivo">Motivo</label><select class="sel" id="cnMotivo"><option value="ENGANO">Emitido por engano (desfaz a ' + (tipo === 'PAGAR' ? 'despesa' : 'receita') + ')</option>' +
      (tipo === 'RECEBER' ? '<option value="INCOBRAVEL">Incobrável (vira perda com clientes)</option>' : '') + '</select></div>' +
      '<div style="grid-column:1/-1"><label for="cnJust">Justificativa</label><input class="inp" id="cnJust" placeholder="fica no histórico (ao menos 10 letras)"></div></div>' +
      '<div id="cnLista" style="margin-top:10px"></div>' +
      '<div style="margin-top:12px"><button class="btn perigo" id="cnOk" data-tipo="' + tipo + '">Cancelar títulos</button> <span class="dica">O saldo de cada título é abatido; dá para desfazer.</span></div>';
    abrir('Cancelar ' + sel.length + ' título(s)', h);
    previaCancel();
  }
  function previaCancel() {
    var alvo = el('cnLista'); if (!alvo) return;
    var tipo = el('cnOk').dataset.tipo, motivo = el('cnMotivo').value, sel = selecionados(tipo), bloq = 0;
    alvo.innerHTML = '<div class="tw"><table><thead><tr><th>Título</th><th>Parceiro</th><th class="n">Saldo</th><th>Situação</th></tr></thead><tbody>' + sel.map(function(x) {
      var pc = F.podeCancelar(x, motivo); if (!pc.ok) bloq++;
      return '<tr><td>' + e(x.titulo.documento || x.id) + '</td><td>' + e(x.titulo.parceiro && x.titulo.parceiro.nome) + '</td><td class="n">' + brl(x.saldoCentavos) + '</td><td>' + (pc.ok ? '<span class="tg ok">pode cancelar</span>' : '<span class="tg bad">não</span> ' + e(pc.motivo)) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    el('cnOk').disabled = !!bloq;
  }
  function blocoEntregaB(id, s) {
    var h = '';
    var rns = Object.keys(fin.renegociacoes || {}).filter(function(k) { var r = fin.renegociacoes[k]; return r && ((r.titulos || {})[id] != null || r.novoTitulo === id); });
    var cns = Object.keys(fin.cancelamentos || {}).filter(function(k) { var c = fin.cancelamentos[k]; return c && (c.titulos || {})[id] != null; });
    rns.forEach(function(k) {
      var r = fin.renegociacoes[k], ativa = r.status === 'ATIVA', docs = Object.keys(r.titulos || {}).map(function(x) { return ((fin.titulos || {})[x] || {}).documento || x; }).join(', ');
      h += '<div class="alerta ' + (ativa ? 'info' : 'warn') + '" style="margin-top:10px"><div><b>Renegociação de ' + dataBR(r.data) + (ativa ? '' : ' (desfeita)') + ':</b> ' + e(docs) + ' → ' +
        e(((fin.titulos || {})[r.novoTitulo] || {}).documento || r.novoTitulo) + ' ' + brl(r.valorNovoCentavos) + ' · ' + e(r.motivo) + (r.criadoPor ? ' · ' + e(r.criadoPor) : '') +
        (ativa ? ' <button class="btn sm perigo" data-desf-rn="' + e(k) + '">Desfazer</button>' : '') + '</div></div>';
    });
    cns.forEach(function(k) {
      var c = fin.cancelamentos[k], ativo = c.status === 'ATIVO';
      h += '<div class="alerta ' + (ativo ? 'warn' : 'info') + '" style="margin-top:10px"><div><b>Cancelamento de ' + dataBR(c.data) + (ativo ? '' : ' (desfeito)') + ':</b> ' +
        (c.motivo === 'INCOBRAVEL' ? 'incobrável' : 'emitido por engano') + ' · ' + e(c.justificativa) + (c.criadoPor ? ' · ' + e(c.criadoPor) : '') +
        (ativo ? ' <button class="btn sm" data-desf-cn="' + e(k) + '">Desfazer</button>' : '') + '</div></div>';
    });
    if (s.saldoCentavos > 0) {
      var ads = F.saldosAdiantamentos(fin), chaveT = F.chaveParceiro(s.titulo.parceiro);
      var disp = Object.keys(ads).filter(function(k) { var a = ads[k]; return a.tipo === s.titulo.tipo && a.saldoCentavos > 0 && F.chaveParceiro(a.parceiro) === chaveT; });
      if (disp.length) h += '<h3 style="margin-top:14px">Adiantamentos disponíveis deste ' + (s.titulo.tipo === 'PAGAR' ? 'fornecedor' : 'cliente') + '</h3><div class="tw"><table><tbody>' +
        disp.map(function(k) { var a = ads[k]; return '<tr><td>' + dataBR(a.data) + '</td><td>' + e(a.documento || '') + '</td><td class="n">' + brl(a.saldoCentavos) + '</td><td><button class="btn sm pri" data-comp-ad="' + e(k) + '" data-comp-tit="' + e(id) + '">Compensar</button></td></tr>'; }).join('') + '</tbody></table></div>';
    }
    return h;
  }

  function detalhe(id) {
    var s = F.carteira(fin).filter(function(x) { return x.id === id; })[0]; if (!s) return;
    var t = s.titulo;
    var h = '<div class="tres"><div class="col"><div class="t">Valor</div><div class="v">' + brl(t.valorCentavos) + '</div></div><div class="col"><div class="t">Pago/recebido</div><div class="v">' + brl(s.pagoCentavos) + '</div></div><div class="col"><div class="t">Saldo</div><div class="v">' + brl(s.saldoCentavos) + '</div></div></div>';
    h += '<div class="linha-kv"><span>Origem</span><b>' + e(ROT_ORIGEM[t.origem && t.origem.tipo] || '') + ' ' + e(t.origem && (t.origem.pc || t.origem.nf || t.origem.ref) || '') + '</b></div>' +
      '<div class="linha-kv"><span>Parceiro</span><b>' + e(t.parceiro && t.parceiro.nome) + (t.parceiro && t.parceiro.cnpj ? ' · ' + e(t.parceiro.cnpj) : '') + '</b></div>' +
      '<div class="linha-kv"><span>Natureza</span><b>' + e(t.natureza) + '</b></div>' + linhaClassif(id, t) +
      '<div class="linha-kv"><span>Condição</span><b>' + e((fin.condicoes || {})[id] ? ((fin.condicoes[id].condicao || 'vence ' + dataBR(fin.condicoes[id].vencimento)) + ' (informada no Financeiro)') : (t.condicao || (t.vencimentoFixo ? 'vence ' + dataBR(t.vencimentoFixo) : '—')) + (t.condicaoFonte ? ' · ' + t.condicaoFonte : '')) + '</b></div>';
    if (s.nota) h += '<div class="linha-kv"><span>Nota fiscal (XML)</span><b>NF ' + e(s.nota.numero) + (s.nota.serie && s.nota.serie !== '0' ? '/' + e(s.nota.serie) : '') +
      (s.fonteParcelas === 'NF_XML' ? ' · vencimentos pelas duplicatas da nota' : '') + ' <span class="mut">' + e(s.nota.chave) + '</span></b></div>';
    if (s.avisos.length) h += '<div class="alerta warn" style="margin-top:10px"><div>' + s.avisos.map(e).join('<br>') + '</div></div>';
    if (s.semVencimento) h += '<div class="alerta warn" style="margin-top:10px"><div><b>Sem vencimento:</b> ' + e(s.motivoVencimento) + '. Informe a condição em <b>Complementos</b>.</div></div>';
    h += '<h3 style="margin-top:14px">Parcelas</h3><div class="tw"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th class="n">Valor</th><th class="n">Em aberto</th></tr></thead><tbody>' +
      (s.parcelas.length ? s.parcelas.map(function(p) { var ab = s.abertas.filter(function(a) { return a.n === p.n; })[0]; return '<tr><td>' + p.n + '/' + p.de + (p.tipo !== 'PRAZO' ? ' <span class="mut">' + e(p.tipo) + '</span>' : '') + '</td><td>' + dataBR(p.vencimento) + '</td><td class="n">' + brl(p.valorCentavos) + '</td><td class="n">' + brl(ab ? ab.abertoCentavos : 0) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="mut">Sem parcelas (sem condição).</td></tr>') + '</tbody></table></div>';
    var estornadas = {}; s.baixas.forEach(function(x) { if (x.tipo === 'ESTORNO') estornadas[x.estorna] = true; });
    h += '<h3 style="margin-top:14px">Baixas e abatimentos</h3><div class="tw"><table><thead><tr><th>Data</th><th>Tipo</th><th class="n">Principal</th><th class="n">Juros+multa</th><th class="n">Desconto</th><th>Conta</th><th></th></tr></thead><tbody>' +
      s.baixas.map(function(x) { return '<tr><td>' + dataBR(x.data) + '</td><td>' + (x.tipo === 'ESTORNO' ? '<span class="tg bad">Estorno</span> ' + e(x.motivo || '') : 'Baixa' + (x.forma === 'ADIANTAMENTO' ? ' (compensação de adiantamento)' : x.loteKey ? ' (lote)' : '')) + '</td><td class="n">' + brl(x.valorCentavos) + '</td><td class="n">' + brl(num(x.jurosCentavos) + num(x.multaCentavos)) + '</td><td class="n">' + brl(x.descontoCentavos) + '</td><td>' + e(((fin.contas_bancarias || {})[x.conta] || {}).nome || x.conta) + '</td><td>' + (x.tipo === 'BAIXA' && !estornadas[x.id] ? '<button class="btn sm perigo" data-estornar="' + e(x.id) + '">Estornar</button>' : '') + '</td></tr>'; }).join('') +
      s.abatimentos.map(function(a) { return '<tr><td>' + dataBR(a.data) + '</td><td><span class="tg mute">Abatimento</span> ' + e(a.motivo) + '</td><td class="n">' + brl(a.valorCentavos) + '</td><td></td><td></td><td></td><td></td></tr>'; }).join('') +
      (!s.baixas.length && !s.abatimentos.length ? '<tr><td colspan="7" class="mut">Nenhuma.</td></tr>' : '') + '</tbody></table></div>';
    if (t.itens && t.itens.length) h += '<h3 style="margin-top:14px">Itens da nota</h3><div class="tw"><table><thead><tr><th>SKU</th><th>Lote</th><th class="n">Unidades</th><th class="n">Valor</th></tr></thead><tbody>' + t.itens.map(function(i) { return '<tr><td>' + e(i.sku) + '</td><td>' + e(i.lote) + '</td><td class="n">' + num(i.unidades).toLocaleString('pt-BR') + '</td><td class="n">' + brl(i.valorCentavos) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    h += blocoEntregaB(id, s);
    abrir(e((t.tipo === 'PAGAR' ? 'A pagar · ' : 'A receber · ') + (t.documento || id)), h);
  }
  function formBaixa(id, extrato) {
    var s = F.carteira(fin).filter(function(x) { return x.id === id; })[0]; if (!s) return;
    var sugest = extrato ? Math.abs(extrato.valorCentavos) : (s.abertas[0] ? s.abertas[0].abertoCentavos : s.saldoCentavos);
    var h = '<div class="sub" style="margin-bottom:12px">' + e(s.titulo.parceiro && s.titulo.parceiro.nome) + ' · ' + e(s.titulo.documento || id) + ' · saldo ' + brl(s.saldoCentavos) + '</div>' +
      '<div class="form"><div><label for="bxValor">Principal (R$)</label><input class="inp" id="bxValor" value="' + (sugest / 100).toFixed(2).replace('.', ',') + '"></div>' +
      '<div><label for="bxData">Data</label><input class="inp" id="bxData" type="date" value="' + (extrato ? extrato.data : hojeISO()) + '"></div>' +
      '<div><label for="bxConta">Conta</label><select class="sel" id="bxConta">' + contasOpcoes(extrato ? extrato.conta : S.conta) + '</select></div>' +
      '<div><label for="bxJuros">Juros (R$)</label><input class="inp" id="bxJuros" value="0"></div><div><label for="bxMulta">Multa (R$)</label><input class="inp" id="bxMulta" value="0"></div>' +
      '<div><label for="bxDesc">Desconto (R$)</label><input class="inp" id="bxDesc" value="0"></div>' +
      '<div style="grid-column:1/-1"><label for="bxHist">Histórico</label><input class="inp" id="bxHist" placeholder="opcional"></div></div>' +
      '<div style="margin-top:14px;display:flex;gap:8px"><button class="btn pri" id="bxOk" data-tit="' + e(id) + '"' + (extrato ? ' data-extrato="' + e(JSON.stringify({conta: extrato.conta, fitid: extrato.fitid})) + '"' : '') + '>Confirmar ' + (s.titulo.tipo === 'PAGAR' ? 'pagamento' : 'recebimento') + '</button></div>';
    abrir((s.titulo.tipo === 'PAGAR' ? 'Pagar' : 'Receber') + ' título', h);
  }

  /* ── Notas de entrada (XML) — F5 ───────────────────────────────────────── */
  var ROT_CASA = {VINCULADA: ['ok', 'casa com o recebimento'], SEM_RECEBIMENTO: ['info', 'aguardando recebimento'], SEM_PEDIDO: ['warn', 'sem pedido de compra'],
    FORNECEDOR_NAO_CADASTRADO: ['warn', 'fornecedor não cadastrado'], AMBIGUA: ['warn', 'mais de um recebimento'], RECEBIMENTO_SEM_TITULO: ['info', 'recebimento sem título']};
  function dupResumo(n) {
    var ds = n.duplicatas || [];
    if (!ds.length) return '<span class="mut">sem duplicatas</span>';
    return ds.map(function(d) { return dataBR(d.vencimento) + ' ' + brl(d.valorCentavos); }).join('<br>');
  }
  function rotNf(n) { return e(n.numero) + (n.serie && n.serie !== '0' ? '/' + e(n.serie) : ''); }
  function abaNotas() {
    var b = base(), notas = fin.notas_entrada || {}, porTit = F.notasPorTitulo(fin), comTitulo = {};
    Object.keys(porTit).forEach(function(id) { comTitulo[porTit[id].chave] = id; });
    var validas = S.previaNotas.filter(function(x) { return x.r.ok && !x.repetida; }).length;
    var h = '<div class="card"><h3>Importar XML de NF-e</h3><div class="sub" style="margin-bottom:10px">Envie o XML que o fornecedor manda (um ou vários). ' +
      'A nota casa com o <b>recebimento</b> pelo CNPJ e pelo número; as <b>duplicatas</b> passam a ser os vencimentos do título. A mesma nota não entra duas vezes. ' +
      'O XML <b>não</b> dá entrada no estoque: isso continua sendo do recebimento.</div>' +
      '<div class="barra"><label class="btn sm pri">Escolher XML<input type="file" id="nfArquivos" accept=".xml,text/xml,application/xml" multiple hidden></label>' +
      (S.previaNotas.length ? '<button class="btn sm pri" id="nfImportar"' + (validas ? '' : ' disabled') + '>Importar ' + validas + ' nota(s)</button><button class="btn sm" id="nfLimpar">Limpar</button>' : '') + '</div>';
    if (S.previaNotas.length) {
      h += '<div class="tw"><table><thead><tr><th>Arquivo</th><th>NF</th><th>Emitente</th><th>Emissão</th><th class="n">Valor</th><th>Duplicatas</th><th>Situação</th></tr></thead><tbody>' +
        S.previaNotas.map(function(x) {
          if (!x.r.ok) return '<tr><td>' + e(x.nome) + '</td><td colspan="6"><span class="tg bad">não lido</span> ' + e(x.r.motivo) + '</td></tr>';
          var n = x.r.nota, c = F.casarNotaEntrada(n, b), st = ROT_CASA[c.tipo] || ['mute', c.tipo];
          return '<tr><td>' + e(x.nome) + '</td><td>' + rotNf(n) + '</td><td>' + e(n.emitente.nome) + '<br><span class="mut">' + e(n.emitente.cnpj) + '</span></td><td>' + dataBR(n.emissao) + '</td><td class="n">' + brl(n.valorTotalCentavos) + '</td><td>' + dupResumo(n) + '</td>' +
            '<td>' + (x.repetida ? '<span class="tg mute">já importada</span>' : '<span class="tg ' + st[0] + '">' + st[1] + '</span>' + (c.pc ? ' <span class="mut">' + e(c.pc) + '</span>' : '')) +
            (x.r.avisos.length ? '<div class="dica">' + x.r.avisos.map(e).join(' ') + '</div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    h += '</div>';
    var ks = Object.keys(notas).sort(function(a, c) { return String((notas[c] || {}).emissao).localeCompare(String((notas[a] || {}).emissao)); });
    h += '<div class="card"><h3>Notas importadas (' + ks.length + ')</h3><div class="tw"><table><thead><tr><th>Emissão</th><th>NF</th><th>Emitente</th><th class="n">Valor</th><th>Duplicatas</th><th>Título</th><th>Importada</th></tr></thead><tbody>' +
      (ks.length ? ks.map(function(k) {
        var n = notas[k], tid = comTitulo[k], sit;
        if (tid) sit = '<a href="#" data-det="' + e(tid) + '">' + e(((fin.titulos || {})[tid] || {}).documento || tid) + '</a>';
        else {
          var c = F.casarNotaEntrada(n, b), st = ROT_CASA[c.tipo] || ['mute', c.tipo];
          sit = '<span class="tg ' + st[0] + '">' + (c.tipo === 'VINCULADA' ? 'a vincular' : st[1]) + '</span>' +
            (c.tipo === 'SEM_PEDIDO' || c.tipo === 'FORNECEDOR_NAO_CADASTRADO' ? ' <button class="btn sm" data-manual-nf="' + e(k) + '">Lançar título</button>' : '') +
            (c.tipo === 'VINCULADA' ? ' <button class="btn sm" data-vincular-nf="1">Vincular agora</button>' : '');
        }
        return '<tr><td>' + dataBR(n.emissao) + '</td><td>' + rotNf(n) + '</td><td>' + e(n.emitente && n.emitente.nome) + '</td><td class="n">' + brl(n.valorTotalCentavos) + '</td><td>' + dupResumo(n) + '</td><td>' + sit + '</td><td>' + dataBR(n.importadoEm) + ' <span class="mut">' + e(n.importadoPor) + '</span></td></tr>';
      }).join('') : '<tr><td colspan="7"><div class="vazio"><b>Nenhuma nota importada.</b>Escolha os XMLs acima.</div></td></tr>') + '</tbody></table></div></div>';
    return h;
  }

  /* ── Caixas e bancos — F6 ──────────────────────────────────────────────── */
  function primeiroDoMes() { return hojeISO().slice(0, 8) + '01'; }
  function abaBancos() {
    var cs = fin.contas_bancarias || {}, ks = Object.keys(cs);
    if (!ks.length) return '<div class="card"><div class="vazio"><b>Nenhuma conta cadastrada.</b>Cadastre bancos e o caixa em Cadastros, com o saldo de hoje.</div></div>';
    if (!S.extConta || !cs[S.extConta]) S.extConta = ks[0];
    if (!S.extDe) S.extDe = primeiroDoMes();
    if (!S.extAte) S.extAte = hojeISO();
    var saldos = F.saldosBancarios(fin, hojeISO());
    var h = '<div class="kpis">' + ks.map(function(k) {
      var sb = saldos[k] || {saldoCentavos: 0}, tp = F.tipoConta(cs[k]);
      return kpi(sb.saldoCentavos < 0 ? 'bad' : 'ok', e(cs[k].nome || k), brl(sb.saldoCentavos), F.TIPOS_CONTA[tp] + (tp === 'CAIXA' ? ' · não fica negativo' : ''));
    }).join('') + '</div>';
    h += '<div class="card"><div class="barra"><button class="btn sm pri" data-mov="1">Lançar tarifa, IOF, juros ou rendimento</button><button class="btn sm" data-transf="1">Transferência entre contas</button>' +
      '<span class="dica">Suprimento e sangria do caixa são transferências entre o banco e o caixa. Pagamento de título continua em A pagar.</span></div></div>';
    var ex = F.extratoConta(fin, S.extConta, S.extDe, S.extAte);
    h += '<div class="card"><h3>Extrato da conta</h3><div class="barra"><select class="sel" id="extConta">' + contasOpcoes(S.extConta) + '</select>' +
      '<label class="mut">de <input class="inp" type="date" id="extDe" value="' + e(S.extDe) + '"></label><label class="mut">até <input class="inp" type="date" id="extAte" value="' + e(S.extAte) + '"></label></div>' +
      '<div class="tw"><table><thead><tr><th>Data</th><th>Histórico</th><th class="n">Entrada</th><th class="n">Saída</th><th class="n">Saldo</th><th></th></tr></thead><tbody>' +
      '<tr class="mut"><td>' + dataBR(S.extDe) + '</td><td>Saldo anterior</td><td></td><td></td><td class="n">' + brl(ex.saldoAnteriorCentavos) + '</td><td></td></tr>' +
      (ex.linhas.length ? ex.linhas.map(function(l) {
        var ent = l.valorCentavos > 0 && l.tipo !== 'SALDO_INICIAL' ? l.valorCentavos : null, sai = l.valorCentavos < 0 ? -l.valorCentavos : null;
        var hist = e(l.historico);
        if (l.titulo) hist = '<a href="#" data-det="' + e(l.titulo) + '">' + hist + '</a>';
        if (l.tipo === 'SALDO_INICIAL') hist = '<b>' + hist + '</b> ' + brl(l.valorCentavos);
        return '<tr><td>' + dataBR(l.data) + '</td><td>' + hist + (l.tipo.indexOf('ESTORNO') === 0 ? ' <span class="tg bad">estorno</span>' : '') + '</td><td class="n">' + (ent ? brl(ent) : '') + '</td><td class="n">' + (sai ? brl(-sai) : '') + '</td><td class="n">' + brl(l.saldoCentavos) + '</td>' +
          '<td>' + (l.estornavel ? '<button class="btn sm perigo" data-estornar-mov="' + e(l.ref) + '">Estornar</button>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="mut">Nenhum lançamento no período.</td></tr>') +
      '<tr class="tot"><td></td><td><b>Total do período</b></td><td class="n">' + brl(ex.entradasCentavos) + '</td><td class="n">' + brl(-ex.saidasCentavos) + '</td><td class="n"><b>' + brl(ex.saldoFinalCentavos) + '</b></td><td></td></tr>' +
      '</tbody></table></div></div>';
    return h;
  }
  function formMovimento(extrato) {
    var tipos = ['TARIFA', 'IOF', 'JUROS_BANCARIOS', 'RENDIMENTO'];
    var sugerido = extrato ? (extrato.valorCentavos >= 0 ? 'RENDIMENTO' : 'TARIFA') : 'TARIFA';
    var h = '<div class="form"><div><label for="mvConta">Conta</label><select class="sel" id="mvConta">' + contasOpcoes(extrato ? extrato.conta : S.extConta) + '</select></div>' +
      '<div><label for="mvTipo">Tipo</label><select class="sel" id="mvTipo">' + tipos.map(function(t) { return '<option value="' + t + '"' + (t === sugerido ? ' selected' : '') + '>' + e(F.TIPOS_MOVIMENTO[t].rotulo) + (F.TIPOS_MOVIMENTO[t].sinal > 0 ? ' (entrada)' : ' (saída)') + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="mvData">Data</label><input class="inp" type="date" id="mvData" value="' + (extrato ? extrato.data : hojeISO()) + '"></div>' +
      '<div><label for="mvValor">Valor (R$)</label><input class="inp" id="mvValor" value="' + (extrato ? (Math.abs(extrato.valorCentavos) / 100).toFixed(2).replace('.', ',') : '') + '"></div>' +
      '<div style="grid-column:1/-1"><label for="mvHist">Histórico</label><input class="inp" id="mvHist" value="' + e(extrato ? extrato.memo || '' : '') + '"></div></div>' +
      '<div style="margin-top:12px"><button class="btn pri" id="mvOk"' + (extrato ? ' data-extrato="' + e(JSON.stringify({conta: extrato.conta, fitid: extrato.fitid})) + '"' : '') + '>Lançar</button> <span class="dica">Vai para a Controladoria como despesa ou receita financeira.</span></div>';
    abrir('Lançar movimento da conta', h);
  }
  function formTransferencia() {
    var h = '<div class="form"><div><label for="trOrigem">De</label><select class="sel" id="trOrigem">' + contasOpcoes(S.extConta) + '</select></div>' +
      '<div><label for="trDestino">Para</label><select class="sel" id="trDestino">' + contasOpcoes('') + '</select></div>' +
      '<div><label for="trData">Data</label><input class="inp" type="date" id="trData" value="' + hojeISO() + '"></div>' +
      '<div><label for="trValor">Valor (R$)</label><input class="inp" id="trValor"></div>' +
      '<div style="grid-column:1/-1"><label for="trHist">Histórico</label><input class="inp" id="trHist" placeholder="ex.: suprimento do caixa"></div></div>' +
      '<div style="margin-top:12px"><button class="btn pri" id="trOk">Transferir</button> <span class="dica">Sai de uma conta e entra na outra no mesmo registro; estornar desfaz os dois lados.</span></div>';
    abrir('Transferência entre contas', h);
  }

  /* ── Relatórios — F8 + WebMais (12/11/2026) ────────────────────────────────
     Cada relatório declara os filtros que usa; o mesmo objeto {titulo, colunas,
     linhas, totais} serve a tela, o CSV e a impressão. Os novos (mapa WebMais)
     moram em shared/financeiro-relatorios.js. */
  var RX = FinanceiroRelatorios;
  var centrosCtl = {};
  var REL_GRUPOS = [
    ['Caixas e bancos', [['saldos', 'Saldo das contas'], ['espelho', 'Espelho de caixa diário'], ['extrato', 'Extrato da conta (por período)'], ['movimentos', 'Lançamentos bancários'],
      ['baixas', 'Baixas do período'], ['fluxo', 'Fluxo de caixa previsto'], ['realizado', 'Fluxo de caixa realizado × previsto'], ['dfc', 'Demonstrativo de fluxo de caixa'],
      ['gastos', 'Gastos por centro de custo e elemento']]],
    ['A pagar', [['pagar', 'Contas a pagar'], ['despesas', 'Lançamento de despesas'], ['aberto_pagar', 'Fornecedores em aberto'], ['ranking_pagar', 'Principais fornecedores'],
      ['evolucao_pagar', 'Evolução de pagamento'], ['composicao_pagar', 'Composição de vencimentos (a pagar)'], ['conta_pagar', 'Conta corrente do fornecedor'],
      ['conciliacao_pagar', 'Conciliação de fornecedores'], ['pmp', 'Prazo médio de pagamento (PMP)'], ['aging_pagar', 'Aging a pagar'], ['adiantamentos_pagar', 'Adiantamentos a fornecedores']]],
    ['A receber', [['receber', 'Contas a receber'], ['aberto_receber', 'Clientes em aberto'], ['ranking_receber', 'Principais clientes'], ['evolucao_receber', 'Evolução de recebimento'],
      ['composicao_receber', 'Composição de vencimentos (a receber)'], ['conta_receber', 'Conta corrente do cliente'], ['conciliacao_receber', 'Conciliação de clientes'],
      ['antecipacao', 'Cálculo de antecipação'], ['pmr', 'Prazo médio de recebimento (PMR)'], ['aging_receber', 'Aging a receber'], ['adiantamentos_receber', 'Adiantamentos de clientes']]]
  ];
  var RELS = {}; REL_GRUPOS.forEach(function(g) { g[1].forEach(function(x) { RELS[x[0]] = x[1]; }); });
  // Filtros de cada relatório (a ordem é a da barra).
  var REL_FILTROS = {
    pagar: ['periodo', 'dataBase', 'situacao', 'natureza', 'parceiro'], receber: ['periodo', 'dataBase', 'situacao', 'natureza', 'parceiro'],
    baixas: ['periodo', 'conta'], aging_pagar: [], aging_receber: [], extrato: ['periodo', 'contaUnica'], fluxo: ['conta', 'granularidade'], dfc: ['periodo', 'aberturaDfc'],
    saldos: ['periodo'], espelho: ['data', 'conta'], movimentos: ['periodo', 'conta', 'destino', 'tipoMov'], realizado: ['periodo', 'granRP'],
    gastos: ['periodo', 'base2', 'agruparGasto', 'centro', 'natureza', 'elemento', 'semAdiant'], adiantamentos_pagar: ['parceiro'], adiantamentos_receber: ['parceiro'], despesas: ['periodo', 'situacao', 'natureza', 'elemento', 'forma', 'centro', 'usuario', 'parceiro'],
    aberto_pagar: ['natureza', 'parceiro'], aberto_receber: ['parceiro'], ranking_pagar: ['periodo', 'base2', 'natureza', 'top'], ranking_receber: ['periodo', 'base2', 'top'],
    evolucao_pagar: ['periodo', 'agrupar', 'natureza'], evolucao_receber: ['periodo'], composicao_pagar: ['meses', 'parceiro'], composicao_receber: ['meses', 'parceiro'],
    conta_pagar: ['periodo', 'parceiro'], conta_receber: ['periodo', 'parceiro'], conciliacao_pagar: ['periodo', 'parceiro'], conciliacao_receber: ['periodo', 'parceiro'],
    antecipacao: ['data', 'taxa', 'parceiro'], pmp: ['periodo'], pmr: ['periodo']
  };
  function ultimoDoMes(iso) { return F.addDias(F.somarPeriodo(String(iso).slice(0, 8) + '01', 'MES', 1), -1); }
  function tipoRel(k) { return /receber|pmr|antecipacao/.test(k) ? 'RECEBER' : 'PAGAR'; }
  function relAtual() {
    var r = S.rel, k = r.tipo, contas = Object.keys(fin.contas_bancarias || {}), hoje = hojeISO(), tp = tipoRel(k);
    if (!REL_FILTROS[k]) k = r.tipo = 'pagar';
    if (!r.de) r.de = hoje.slice(0, 8) + '01';
    if (!r.ate) r.ate = ultimoDoMes(hoje);
    if (!r.data) r.data = hoje;
    if (!r.dataAnt) r.dataAnt = hoje; // antecipação: data própria, não herda o dia do espelho
    if (k === 'extrato' && (!r.conta || contas.indexOf(r.conta) < 0)) r.conta = contas[0] || '';
    var per = {de: r.de, ate: r.ate}, cc = r.centroCusto || '', nat = r.natureza || '';
    switch (k) {
      case 'pagar': case 'receber':
        return F.relTitulos(fin, {tipo: tp, data: r.dataBase, de: r.de, ate: r.ate, parceiro: r.parceiro, situacao: r.situacao, natureza: nat, hoje: hoje});
      case 'baixas': return F.relBaixas(fin, {de: r.de, ate: r.ate, conta: r.conta || null});
      case 'aging_pagar': case 'aging_receber': return F.relAging(fin, {tipo: tp, hoje: hoje});
      case 'extrato': return F.relExtrato(fin, {conta: r.conta, de: r.de, ate: r.ate});
      case 'fluxo': return F.relFluxo(base(), {granularidade: r.granularidade || 'SEMANA', conta: r.conta || null, hoje: hoje});
      case 'dfc': return F.relDfc(fin, {de: r.de.slice(0, 7), ate: r.ate.slice(0, 7), abertura: r.aberturaDfc || 'ATIVIDADE'});
      case 'saldos': return RX.relSaldosContas(fin, per);
      case 'espelho': return RX.relEspelhoDiario(fin, {data: r.data, conta: r.conta || null});
      case 'movimentos': return RX.relMovimentos(fin, Object.assign({conta: r.conta || null, destino: r.destino || null, tipo: r.tipoMov || null}, per));
      case 'realizado': return RX.relRealizadoPrevisto(fin, Object.assign({granularidade: r.granRP || 'MES'}, per));
      case 'gastos': return RX.relGastosCentroCusto(fin, Object.assign({dataBase: r.base2, centroCusto: cc, natureza: nat, centros: centrosCtl, semAdiantamentos: !!r.semAdiant, elemento: r.elemento || null, agrupar: r.agruparGasto || 'CENTRO'}, per));
      case 'adiantamentos_pagar': case 'adiantamentos_receber': return RX.relAdiantamentos(fin, {tipo: tp, parceiro: r.parceiro});
      case 'despesas': return RX.relLancamentoDespesas(fin, Object.assign({situacao: r.situacao, natureza: nat, elemento: r.elemento || null, formaPagamento: r.forma || null, centroCusto: cc, usuario: r.usuario, parceiro: r.parceiro, centros: centrosCtl}, per));
      case 'aberto_pagar': case 'aberto_receber': return RX.relEmAberto(fin, {tipo: tp, hoje: hoje, natureza: tp === 'PAGAR' ? nat : '', parceiro: r.parceiro});
      case 'ranking_pagar': case 'ranking_receber': return RX.relRanking(fin, Object.assign({tipo: tp, dataBase: r.base2, natureza: tp === 'PAGAR' ? nat : '', top: r.top}, per));
      case 'evolucao_pagar': case 'evolucao_receber': return RX.relEvolucao(fin, Object.assign({tipo: tp, agrupar: tp === 'PAGAR' ? r.agrupar : 'PARCEIRO', natureza: tp === 'PAGAR' ? nat : ''}, per));
      case 'composicao_pagar': case 'composicao_receber': return RX.relComposicaoVencimentos(fin, {tipo: tp, hoje: hoje, meses: r.meses, parceiro: r.parceiro});
      case 'conta_pagar': case 'conta_receber': return RX.relContaCorrente(fin, Object.assign({tipo: tp, parceiro: r.parceiro}, per));
      case 'conciliacao_pagar': case 'conciliacao_receber': return RX.relConciliacaoParceiros(fin, Object.assign({tipo: tp, parceiro: r.parceiro}, per));
      case 'antecipacao': return RX.relAntecipacao(fin, {data: r.dataAnt, taxaMensal: r.taxa, parceiro: r.parceiro});
      case 'pmp': case 'pmr': return RX.relPrazosMedios(fin, Object.assign({tipo: tp}, per));
    }
    return {titulo: '', colunas: [], linhas: [], totais: {}};
  }
  function filtrosTexto(r) {
    var fs = REL_FILTROS[r.tipo] || [], p = [], cs = fin.contas_bancarias || {};
    if (!fs.length || /^(aberto|composicao)_/.test(r.tipo)) p.push('posição de ' + dataBR(hojeISO()));
    if (r.tipo === 'fluxo') p.push({DIA: 'por dia', SEMANA: 'por semana', MES: 'por mês'}[r.granularidade || 'SEMANA'] + ', a partir de ' + dataBR(hojeISO()));
    if (fs.indexOf('periodo') >= 0) p.push((fs.indexOf('dataBase') >= 0 ? (r.dataBase === 'EMISSAO' ? 'emissão' : 'vencimento') + ' de ' : fs.indexOf('base2') >= 0 ? (r.base2 === 'PAGAMENTO' ? (tipoRel(r.tipo) === 'PAGAR' ? 'pagamento' : 'recebimento') : 'emissão') + ' de ' : 'de ') + dataBR(r.de) + ' a ' + dataBR(r.ate));
    if (fs.indexOf('data') >= 0) p.push((r.tipo === 'antecipacao' ? 'antecipação em ' + dataBR(r.dataAnt) : 'dia ' + dataBR(r.data)));
    if (fs.indexOf('taxa') >= 0 && r.taxa) p.push('taxa ' + r.taxa + '% a.m.');
    if (fs.indexOf('granRP') >= 0) p.push({DIA: 'por dia', SEMANA: 'por semana', MES: 'por mês'}[r.granRP || 'MES']);
    if (r.conta && (fs.indexOf('conta') >= 0 || fs.indexOf('contaUnica') >= 0)) p.push((r.tipo === 'movimentos' ? 'origem ' : 'conta ') + ((cs[r.conta] || {}).nome || r.conta));
    if (r.destino && fs.indexOf('destino') >= 0) p.push('destino ' + ((cs[r.destino] || {}).nome || r.destino));
    if (r.tipoMov && fs.indexOf('tipoMov') >= 0) p.push(((F.TIPOS_MOVIMENTO[r.tipoMov] || {}).rotulo || r.tipoMov).toLowerCase());
    if (fs.indexOf('situacao') >= 0) p.push({ABERTOS: 'em aberto', QUITADOS: 'quitadas', TODOS: 'todas as situações'}[r.situacao || 'ABERTOS']);
    if (r.centroCusto && fs.indexOf('centro') >= 0) p.push('centro ' + (r.centroCusto === '_SEM' ? 'não informado' : (RX.centros(centrosCtl)[r.centroCusto] || r.centroCusto)));
    if (r.natureza && fs.indexOf('natureza') >= 0) p.push(rotNat(r.natureza));
    if (r.usuario && fs.indexOf('usuario') >= 0) p.push('lançado por "' + r.usuario + '"');
    if (r.parceiro && fs.indexOf('parceiro') >= 0) p.push('parceiro contém "' + r.parceiro + '"');
    if (r.top && fs.indexOf('top') >= 0) p.push('os ' + r.top + ' maiores');
    if (r.semAdiant && fs.indexOf('semAdiant') >= 0) p.push('sem adiantamentos');
    if (r.elemento && fs.indexOf('elemento') >= 0) p.push('elemento ' + r.elemento);
    if (r.forma && fs.indexOf('forma') >= 0) p.push(F.FORMAS_PAGAMENTO[r.forma] || r.forma);
    if (r.agruparGasto === 'ELEMENTO' && fs.indexOf('agruparGasto') >= 0) p.push('por elemento');
    if (r.aberturaDfc === 'ELEMENTO' && fs.indexOf('aberturaDfc') >= 0) p.push('por elemento');
    return p.join(' · ');
  }
  function celRel(c, v) {
    if (c.tipo === 'valor') return v == null ? '' : brl(v);
    if (c.tipo === 'data') return v ? dataBR(v) : '';
    return e(v);
  }
  function tabelaRel(rel) {
    var cols = rel.colunas, tem = Object.keys(rel.totais || {}).length;
    return '<div class="tw"><table class="dre" id="relTabela"><thead><tr>' + cols.map(function(c) { return '<th' + (c.tipo === 'valor' ? ' class="n"' : '') + '>' + e(c.rotulo) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (rel.linhas.length ? rel.linhas.map(function(l) {
        return '<tr' + (l.destaque ? ' class="tot"' : '') + '>' + cols.map(function(c) { return '<td' + (c.tipo === 'valor' ? ' class="n"' : '') + '>' + celRel(c, l[c.chave]) + '</td>'; }).join('') + '</tr>';
      }).join('') : '<tr><td colspan="' + Math.max(1, cols.length) + '" class="mut">Nada neste filtro.</td></tr>') +
      (tem ? '<tr class="tot" data-rel-total="1">' + cols.map(function(c, i) { return '<td' + (c.tipo === 'valor' ? ' class="n"' : '') + '>' + (i === 0 ? '<b>Total</b>' : c.tipo === 'valor' && rel.totais[c.chave] != null ? '<b>' + brl(rel.totais[c.chave]) + '</b>' : '') + '</td>'; }).join('') + '</tr>' : '') +
      '</tbody></table></div>';
  }
  function opcoes(lista, atual) { return lista.map(function(o) { return '<option value="' + e(o[0]) + '"' + (String(atual == null ? '' : atual) === o[0] ? ' selected' : '') + '>' + e(o[1]) + '</option>'; }).join(''); }
  function opContas(todas, atual) {
    var cs = fin.contas_bancarias || {};
    return (todas ? [['', todas]] : []).concat(Object.keys(cs).map(function(k) { return [k, cs[k].nome || k]; }));
  }
  function filtroRel(f, r) {
    var tp = tipoRel(r.tipo), cs = RX.centros(centrosCtl);
    switch (f) {
      case 'periodo': return '<label class="mut">de <input class="inp" type="date" id="relDe" value="' + e(r.de) + '"></label><label class="mut">até <input class="inp" type="date" id="relAte" value="' + e(r.ate) + '"></label>';
      case 'data': return '<label class="mut">' + (r.tipo === 'antecipacao' ? 'antecipar em' : 'dia') + ' <input class="inp" type="date" id="relData" value="' + e(r.tipo === 'antecipacao' ? r.dataAnt : r.data) + '"></label>';
      case 'dataBase': return '<select class="sel" id="relDataBase" aria-label="Data">' + opcoes([['VENCIMENTO', 'por vencimento'], ['EMISSAO', 'por emissão']], r.dataBase === 'EMISSAO' ? 'EMISSAO' : 'VENCIMENTO') + '</select>';
      case 'base2': return '<select class="sel" id="relBase2" aria-label="Data">' + opcoes([['EMISSAO', 'lançado (emissão)'], ['PAGAMENTO', tp === 'PAGAR' ? 'pago (data do pagamento)' : 'recebido (data do recebimento)']], r.base2 || 'EMISSAO') + '</select>';
      case 'situacao': return '<select class="sel" id="relSit" aria-label="Situação">' + opcoes([['ABERTOS', 'Em aberto'], ['QUITADOS', 'Quitadas'], ['TODOS', 'Todas']], r.situacao || 'ABERTOS') + '</select>';
      case 'natureza': return '<select class="sel" id="relNat" aria-label="Natureza (elemento)">' + opcoes([['', 'Todas as naturezas']].concat(F.NATUREZAS.map(function(n) { return [n, rotNat(n)]; })), r.natureza) + '</select>';
      case 'parceiro': return '<input class="inp" id="relParc" placeholder="' + (tp === 'PAGAR' ? 'Fornecedor' : 'Cliente') + ' (nome ou CNPJ)…" value="' + e(r.parceiro || '') + '">';
      case 'conta': return '<select class="sel" id="relConta" aria-label="Conta">' + opcoes(opContas(r.tipo === 'movimentos' ? 'Toda conta de origem' : 'Todas as contas'), r.conta) + '</select>';
      case 'contaUnica': return '<select class="sel" id="relConta" aria-label="Conta">' + opcoes(opContas(null), r.conta) + '</select>';
      case 'destino': return '<select class="sel" id="relDestino" aria-label="Conta destino">' + opcoes(opContas('Toda conta destino'), r.destino) + '</select>';
      case 'tipoMov': return '<select class="sel" id="relTipoMov" aria-label="Tipo de lançamento">' + opcoes([['', 'Todos os tipos']].concat(Object.keys(F.TIPOS_MOVIMENTO).map(function(t) { return [t, F.TIPOS_MOVIMENTO[t].rotulo]; })), r.tipoMov) + '</select>';
      case 'granularidade': return '<select class="sel" id="relG" aria-label="Período">' + opcoes([['DIA', 'Por dia'], ['SEMANA', 'Por semana'], ['MES', 'Por mês']], r.granularidade || 'SEMANA') + '</select>';
      case 'granRP': return '<select class="sel" id="relGRP" aria-label="Periodicidade">' + opcoes([['DIA', 'Por dia'], ['SEMANA', 'Por semana'], ['MES', 'Por mês']], r.granRP || 'MES') + '</select>';
      case 'centro': return '<select class="sel" id="relCC" aria-label="Centro de custo">' + opcoes([['', 'Todos os centros'], ['_SEM', 'Sem centro de custo']].concat(Object.keys(cs).map(function(k) { return [k, cs[k]]; })), r.centroCusto) + '</select>';
      case 'usuario': return '<input class="inp" id="relUsuario" placeholder="Lançado por…" value="' + e(r.usuario || '') + '">';
      case 'agrupar': return '<select class="sel" id="relAgrupar" aria-label="Agrupar">' + opcoes([['PARCEIRO', 'por fornecedor'], ['NATUREZA', 'por natureza']], r.agrupar || 'PARCEIRO') + '</select>';
      case 'top': return '<select class="sel" id="relTop" aria-label="Quantos">' + opcoes([['', 'Todos'], ['10', 'Os 10 maiores'], ['20', 'Os 20 maiores'], ['50', 'Os 50 maiores']], r.top) + '</select>';
      case 'meses': return '<select class="sel" id="relMeses" aria-label="Meses">' + opcoes([['3', 'Próximos 3 meses'], ['6', 'Próximos 6 meses'], ['12', 'Próximos 12 meses']], String(r.meses || 6)) + '</select>';
      case 'elemento': return '<select class="sel" id="relElem" aria-label="Elemento">' + opcoesElementos(null, r.elemento, 'Todos os elementos') + '</select>';
      case 'agruparGasto': return '<select class="sel" id="relAgG" aria-label="Agrupar">' + opcoes([['CENTRO', 'centro › natureza'], ['ELEMENTO', 'elemento › centro']], r.agruparGasto || 'CENTRO') + '</select>';
      case 'forma': return '<select class="sel" id="relForma" aria-label="Forma de pagamento">' + opcoes([['', 'Todas as formas']].concat(Object.keys(F.FORMAS_PAGAMENTO).map(function(k) { return [k, F.FORMAS_PAGAMENTO[k]]; })), r.forma) + '</select>';
      case 'aberturaDfc': return '<select class="sel" id="relAbDfc" aria-label="Abertura">' + opcoes([['ATIVIDADE', 'por atividade'], ['ELEMENTO', 'por grupo › subgrupo › elemento']], r.aberturaDfc || 'ATIVIDADE') + '</select>';
      case 'semAdiant': return '<label class="mut"><input type="checkbox" id="relSemAd"' + (r.semAdiant ? ' checked' : '') + '> não exibir adiantamentos</label>';
      case 'taxa': return '<label class="mut">taxa ao mês (%) <input class="inp" id="relTaxa" inputmode="decimal" style="width:80px" placeholder="2,5" value="' + e(r.taxa || '') + '"></label>';
    }
    return '';
  }
  function abaRelatorios() {
    var r = S.rel, rel = relAtual(), fs = REL_FILTROS[r.tipo] || [];
    var h = '<div class="card"><h3>Relatórios</h3><div class="barra">' +
      '<select class="sel" id="relTipo" aria-label="Relatório">' + REL_GRUPOS.map(function(g) {
        return '<optgroup label="' + e(g[0]) + '">' + g[1].map(function(x) { return '<option value="' + x[0] + '"' + (r.tipo === x[0] ? ' selected' : '') + '>' + e(x[1]) + '</option>'; }).join('') + '</optgroup>';
      }).join('') + '</select>' + fs.map(function(f) { return filtroRel(f, r); }).join('') +
      '<button class="btn sm pri" id="relCsv"' + (rel.erro ? ' disabled' : '') + '>Baixar CSV (Excel)</button><button class="btn sm" id="relImprimir"' + (rel.erro ? ' disabled' : '') + '>Imprimir</button></div>' +
      '<div class="sub" id="relFiltros" style="margin-bottom:10px"><b>' + e(rel.titulo) + '</b>' + (filtrosTexto(r) ? ' · ' + e(filtrosTexto(r)) : '') + ' · ' + rel.linhas.length + ' linha(s)</div>' +
      (rel.erro ? '<div class="alerta warn"><div>' + e(rel.erro) + '</div></div>' : '') +
      ((rel.avisos || []).length ? '<div class="alerta info"><div>' + rel.avisos.map(e).join('<br>') + '</div></div>' : '') +
      (rel.erro ? '' : tabelaRel(rel)) + '<div class="dica" style="margin-top:8px">O CSV abre direto no Excel: separador ";", vírgula decimal e datas dd/mm/aaaa. O total do arquivo é o mesmo da tela.</div></div>';
    return h;
  }
  function nomeArquivoRel(rel) {
    return (rel.titulo || 'relatorio').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + hojeISO() + '.csv';
  }
  function baixarCsvRel() {
    var rel = relAtual(), blob = new Blob([F.relatorioCsv(rel)], {type: 'text/csv;charset=utf-8'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nomeArquivoRel(rel);
    document.body.appendChild(a); a.click(); setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function imprimirRel() {
    var rel = relAtual();
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + e(rel.titulo) + '</title><style>' +
      'body{font:12px/1.4 Arial,sans-serif;color:#111;margin:18px}h1{font-size:16px;margin:0 0 2px}.f{color:#555;margin-bottom:10px}' +
      'table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}th{background:#f2f2f2}' +
      '.n{text-align:right;white-space:nowrap}.tot td{font-weight:bold;border-top:2px solid #999}.neg{color:#b00}.mut{color:#777}a{color:inherit;text-decoration:none}' +
      '@page{size:A4 landscape;margin:12mm}</style></head><body><h1>Kuryos · ' + e(rel.titulo) + '</h1><div class="f">' + e(filtrosTexto(S.rel)) +
      ' · emitido em ' + new Date().toLocaleString('pt-BR') + ' por ' + e(autor()) + '</div>' + tabelaRel(rel) + '</body></html>';
    var w = window.open('', '_blank');
    if (!w) { toast('O navegador bloqueou a janela de impressão: libere pop-ups para este site.'); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus(); setTimeout(function() { w.print(); }, 300);
  }

  function abaLotes() {
    var abertos = F.carteira(fin).filter(function(s) { return s.titulo.tipo === 'PAGAR' && s.saldoCentavos > 0 && !s.bloqueio; })
      .sort(function(a, b) { return ((a.abertas[0] || {}).vencimento || '9999').localeCompare((b.abertas[0] || {}).vencimento || '9999'); });
    var total = Object.keys(S.sel).reduce(function(s, k) { return s + (S.sel[k] || 0); }, 0);
    var bancos = F.saldosBancarios(fin, hojeISO()), saldoConta = S.conta && bancos[S.conta] ? bancos[S.conta].saldoCentavos : null;
    var h = '<div class="card"><h3>Montar lote (borderô)</h3><div class="sub" style="margin-bottom:10px">Quem monta o lote <b>não aprova</b>: a aprovação é de outra pessoa (segregação de funções). Aprovado, cada título recebe a baixa na data e conta do lote.</div>' +
      '<div class="barra"><select class="sel" id="ltConta">' + contasOpcoes(S.conta) + '</select><input class="inp" type="date" id="ltData" value="' + hojeISO() + '">' +
      '<span class="pill">Selecionado: ' + brl(total) + (saldoConta != null ? ' · saldo da conta ' + brl(saldoConta) : '') + '</span>' +
      (saldoConta != null && total > saldoConta ? '<span class="tg bad">passa do saldo</span>' : '') + '<button class="btn pri sm" id="ltCriar"' + (total > 0 ? '' : ' disabled') + '>Criar lote para aprovação</button></div>' +
      '<div class="tw"><table><thead><tr><th></th><th>Vencimento</th><th>Fornecedor</th><th>Documento</th><th class="n">Saldo</th></tr></thead><tbody>' +
      (abertos.length ? abertos.map(function(s) { var p = s.abertas[0]; return '<tr><td><input type="checkbox" data-sel="' + e(s.id) + '" data-valor="' + s.saldoCentavos + '"' + (S.sel[s.id] ? ' checked' : '') + '></td><td>' + (p ? dataBR(p.vencimento) : '<span class="tg warn">sem prazo</span>') + '</td><td>' + e(s.titulo.parceiro && s.titulo.parceiro.nome) + '</td><td>' + e(s.titulo.documento || s.id) + '</td><td class="n">' + brl(s.saldoCentavos) + '</td></tr>'; }).join('') : '<tr><td colspan="5"><div class="vazio"><b>Nada a pagar em aberto.</b></div></td></tr>') +
      '</tbody></table></div></div>';
    var lotes = fin.lotes_pagamento || {};
    var ks = Object.keys(lotes).sort().reverse();
    h += '<div class="card"><h3>Lotes</h3><div class="tw"><table><thead><tr><th>Criado</th><th>Por</th><th>Pagamento</th><th>Conta</th><th class="n">Títulos</th><th class="n">Total</th><th>Situação</th><th></th></tr></thead><tbody>' +
      (ks.length ? ks.map(function(k) {
        var l = lotes[k], meu = l.criadoPorUid === uid();
        return '<tr><td>' + dataBR(l.criadoEm) + '</td><td>' + e(l.criadoPor) + '</td><td>' + dataBR(l.dataPagamento) + '</td><td>' + e(((fin.contas_bancarias || {})[l.conta] || {}).nome || l.conta) + '</td><td class="n">' + Object.keys(l.titulos || {}).length + '</td><td class="n">' + brl(l.totalCentavos) + '</td>' +
          '<td><span class="tg ' + (l.status === 'APROVADO' ? 'ok' : l.status === 'RECUSADO' ? 'bad' : 'warn') + '">' + e(l.status) + '</span>' + (l.decididoPor ? ' <span class="mut">' + e(l.decididoPor) + '</span>' : '') + '</td>' +
          '<td class="mini-acoes">' + (l.status === 'AGUARDANDO' ? (meu ? '<span class="mut">aguarda outra pessoa</span>' : '<button class="btn sm pri" data-lote-ok="' + e(k) + '">Aprovar</button>') + '<button class="btn sm" data-lote-no="' + e(k) + '">Recusar</button>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="8" class="mut">Nenhum lote.</td></tr>') + '</tbody></table></div></div>';
    return h;
  }

  function abaConciliacao() {
    var contas = Object.keys(fin.contas_bancarias || {});
    if (!contas.length) return '<div class="card"><div class="vazio"><b>Cadastre uma conta bancária primeiro</b>em Cadastros.</div></div>';
    if (!S.extratoConta || contas.indexOf(S.extratoConta) < 0) S.extratoConta = contas[0];
    var linhas = (fin.extratos || {})[S.extratoConta] || {}, conc = {};
    Object.keys(fin.conciliacoes || {}).forEach(function(k) { var c = fin.conciliacoes[k]; if (c && c.conta === S.extratoConta) conc[c.fitid] = c; });
    var ks = Object.keys(linhas).sort(function(a, b) { return String(linhas[b].data).localeCompare(String(linhas[a].data)); });
    var pend = ks.filter(function(k) { return !conc[linhas[k].fitid]; });
    var h = '<div class="card"><div class="barra"><select class="sel" id="exConta">' + contasOpcoes(S.extratoConta) + '</select>' +
      '<label class="btn sm">Importar extrato (OFX)<input type="file" id="exArquivo" accept=".ofx,.OFX,text/plain" hidden></label>' +
      '<span class="pill">' + ks.length + ' linha(s) · ' + pend.length + ' a conciliar</span></div>' +
      '<div class="sub" style="margin-bottom:10px">O OFX sai do internet banking, de graça. Cada linha é casada com a baixa de mesmo valor e data (± 3 dias). Com um candidato só, a sugestão aparece pronta; com vários, você escolhe; sem nenhum, dá para pagar/receber o título ali mesmo. Nunca se casa "o mais próximo" sozinho.</div>' +
      '<div class="tw"><table><thead><tr><th>Data</th><th>Histórico do banco</th><th class="n">Valor</th><th>Situação / sugestão</th></tr></thead><tbody>' +
      (ks.length ? ks.map(function(k) {
        var l = linhas[k], c = conc[l.fitid];
        var cell;
        if (c) cell = '<span class="tg ok">conciliada</span> <span class="mut">' + e(c.baixa || c.movimento) + '</span>';
        else {
          var sug = F.sugerirConciliacao(l, base(), S.extratoConta, num((fin.parametros || {}).toleranciaConciliacaoDias) || 3).candidatos;
          cell = !sug.length ? '<span class="tg warn">sem par</span> <button class="btn sm" data-conc-mov="' + e(k) + '">Lançar como tarifa/rendimento</button> <span class="mut">ou lance o título (manual)</span>'
            : sug.slice(0, 4).map(function(x) {
              var t = (fin.titulos || {})[x.titulo] || {};
              var rot = e((t.parceiro && t.parceiro.nome || '') + ' · ' + (t.documento || x.titulo));
              return x.tipo === 'BAIXA' ? '<button class="btn sm" data-conc-baixa="' + e(x.baixa) + '" data-fitid="' + e(l.fitid) + '">Casar com baixa: ' + rot + '</button>'
                : '<button class="btn sm" data-conc-tit="' + e(x.titulo) + '" data-k="' + e(k) + '">' + (l.valorCentavos < 0 ? 'Pagar' : 'Receber') + ': ' + rot + '</button>';
            }).join(' ') + (sug.length > 1 ? ' <span class="tg warn">' + sug.length + ' candidatos: escolha</span>' : '');
        }
        return '<tr><td>' + dataBR(l.data) + '</td><td>' + e(l.memo) + '</td><td class="n">' + brl(l.valorCentavos) + '</td><td>' + cell + '</td></tr>';
      }).join('') : '<tr><td colspan="4"><div class="vazio"><b>Nenhum extrato importado nesta conta.</b></div></td></tr>') + '</tbody></table></div></div>';
    return h;
  }

  function tabelaFluxo(fl, curto) {
    var cols = fl.semanas.filter(function(c) { return !curto || !c.passada; });
    function linha(rot, f, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + rot + '</td>' + cols.map(function(c) { return '<td class="n">' + f(c) + '</td>'; }).join('') + '</tr>'; }
    return '<div class="tw"><table class="dre"><thead><tr><th>Semana de</th>' + cols.map(function(c) { return '<th class="n">' + dataBR(c.semana).slice(0, 5) + (c.passada ? '<br><span class="mut">realizado</span>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      linha('Entradas (títulos)', function(c) { return brl(c.entradas); }) +
      linha('Entradas previstas (carteira)', function(c) { return c.passada ? '' : brl(c.entradasPrevistas); }) +
      linha('Saídas (títulos)', function(c) { return brl(-c.saidas); }) +
      linha('Saídas previstas (pedidos de compra)', function(c) { return c.passada ? '' : brl(-c.saidasPrevistas); }) +
      linha('<b>Saldo projetado</b>', function(c) { return c.passada ? '' : '<b>' + brl(c.saldoProjetadoCentavos) + '</b>'; }, 'tot') + '</tbody></table></div>' +
      '<div class="leg"><span><b>Atrasado</b> a pagar ' + brl(fl.atrasado.saidas) + ' · a receber ' + brl(fl.atrasado.entradas) + ' (entra no saldo desta semana)</span>' +
      '<span><b>Sem data</b> a pagar ' + brl(fl.semData.saidas + fl.semData.saidasPrevistas) + ' · a receber ' + brl(fl.semData.entradas + fl.semData.entradasPrevistas) + ' (fora do saldo projetado)</span></div>';
  }
  /* ── Fluxo de caixa por período e DFC — F7 ─────────────────────────────── */
  var ROT_NAT = {MATERIA_PRIMA: 'Matéria-prima', EMBALAGEM: 'Embalagem', USO_E_CONSUMO: 'Uso e consumo', OUTROS: 'Outros', FRETE: 'Frete', FOLHA: 'Folha',
    CUSTO_FIXO_PRODUCAO: 'Custo fixo da produção', CUSTO_FIXO_ADM: 'Custo fixo administrativo', DESPESA_COMERCIAL: 'Despesa comercial', PLR: 'PLR',
    IMPOSTOS: 'Impostos', RECEITA_VENDA: 'Receita de vendas', OUTRAS_RECEITAS: 'Outras receitas', ADIANTAMENTOS: 'Adiantamentos', RESULTADO_FINANCEIRO: 'Resultado financeiro (juros, multas, descontos, tarifas, IOF, rendimentos)'};
  function rotNat(n) { return ROT_NAT[n] || n; }
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function rotMes(m) { return MESES[Number(String(m).slice(5, 7)) - 1] + '/' + String(m).slice(2, 4); }
  function rotColuna(c, g) { return g === 'MES' ? rotMes(c.inicio) : g === 'DIA' ? dataBR(c.inicio).slice(0, 5) : dataBR(c.inicio).slice(0, 5); }
  function abaFluxo() {
    var fl = F.fluxoCaixa(base(), hojeISO(), {granularidade: S.flG, conta: S.flConta || null, natureza: S.flNat || null, porGrupo: !!S.flGrupo}), g = fl.granularidade;
    var cols = fl.colunas;
    function linha(rot, f, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + rot + '</td>' + cols.map(function(c) { return '<td class="n">' + f(c) + '</td>'; }).join('') + '</tr>'; }
    var h = '<div class="card"><h3>Fluxo de caixa</h3><div class="barra">' +
      '<select class="sel" id="flG" aria-label="Período">' + [['DIA', 'Por dia'], ['SEMANA', 'Por semana'], ['MES', 'Por mês']].map(function(o) { return '<option value="' + o[0] + '"' + (g === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<select class="sel" id="flConta" aria-label="Conta"><option value="">Todas as contas</option>' + Object.keys(fin.contas_bancarias || {}).map(function(k) { return '<option value="' + e(k) + '"' + (S.flConta === k ? ' selected' : '') + '>' + e(fin.contas_bancarias[k].nome || k) + '</option>'; }).join('') + '</select>' +
      '<select class="sel" id="flNat" aria-label="Natureza"><option value="">Todas as naturezas</option>' + F.NATUREZAS.concat(['RESULTADO_FINANCEIRO', 'ADIANTAMENTOS']).map(function(n) { return '<option value="' + n + '"' + (S.flNat === n ? ' selected' : '') + '>' + e(rotNat(n)) + '</option>'; }).join('') + '</select></div>' +
      '<label class="mut" style="display:inline-block;margin-bottom:8px"><input type="checkbox" id="flGrupo"' + (S.flGrupo ? ' checked' : '') + '> abrir por tipo de conta (grupo de elemento)</label>' +
      '<div class="sub" style="margin-bottom:10px">Título é <b>fato</b> (recebimento, nota, operação); "previsto" é <b>expectativa</b> (pedido de compra ainda não recebido e carteira comercial ainda não faturada) e aparece separado. Valor sem data fica de fora do saldo projetado — inventar data daria um caixa preciso e falso.</div>' +
      (fl.avisos.length ? '<div class="alerta info"><div>' + fl.avisos.map(e).join('<br>') + '</div></div>' : '') +
      '<div class="tw"><table class="dre"><thead><tr><th>' + ({DIA: 'Dia', SEMANA: 'Semana de', MES: 'Mês'}[g]) + '</th>' + cols.map(function(c) { return '<th class="n">' + rotColuna(c, g) + (c.passada ? '<br><span class="mut">realizado</span>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      linha('Entradas' + (fl.projetado ? ' (títulos)' : ''), function(c) { return brl(c.entradas); }) +
      (fl.projetado ? linha('Entradas previstas (carteira)', function(c) { return c.passada ? '' : brl(c.entradasPrevistas); }) : '') +
      linha('Saídas' + (fl.projetado ? ' (títulos)' : ''), function(c) { return brl(-c.saidas); }) +
      (fl.projetado ? linha('Saídas previstas (pedidos de compra)', function(c) { return c.passada ? '' : brl(-c.saidasPrevistas); }) : '') +
      (S.flNat ? '' : linha('<b>Saldo projetado</b>', function(c) { return c.passada || c.saldoProjetadoCentavos == null ? '' : '<b>' + brl(c.saldoProjetadoCentavos) + '</b>'; }, 'tot')) +
      (fl.porGrupo ? '<tr><td colspan="' + (cols.length + 1) + '"><b>Aberto por tipo de conta</b> <span class="mut">(títulos e realizado; sem as previsões de pedido)</span></td></tr>' +
        fl.porGrupo.map(function(gr) { return linha('&nbsp;&nbsp;' + e(gr.grupo + ' ' + gr.rotulo), function(c) { var v = gr.valores[cols.indexOf(c)]; return v ? brl(v) : '<span class="mut">—</span>'; }); }).join('') : '') +
      '</tbody></table></div>' +
      (fl.projetado ? '<div class="leg"><span><b>Atrasado</b> a pagar ' + brl(fl.atrasado.saidas) + ' · a receber ' + brl(fl.atrasado.entradas) + ' (entra no saldo do período atual)</span>' +
        '<span><b>Sem data</b> a pagar ' + brl(fl.semData.saidas + fl.semData.saidasPrevistas) + ' · a receber ' + brl(fl.semData.entradas + fl.semData.entradasPrevistas) + ' (fora do saldo projetado)</span></div>' : '') + '</div>';
    return h + cardDfc();
  }
  function cardDfc() {
    if (!S.dfcAte) S.dfcAte = hojeISO().slice(0, 7);
    if (!S.dfcDe) S.dfcDe = F.somarPeriodo(S.dfcAte + '-01', 'MES', -5).slice(0, 7);
    var d = F.dfc(fin, S.dfcDe, S.dfcAte);
    var h = '<div class="card"><h3>Demonstrativo de fluxo de caixa (método direto)</h3><div class="barra">' +
      '<label class="mut">de <input class="inp" type="month" id="dfcDe" value="' + e(S.dfcDe) + '"></label><label class="mut">até <input class="inp" type="month" id="dfcAte" value="' + e(S.dfcAte) + '"></label>' +
      '<select class="sel" id="dfcAb" aria-label="Abertura"><option value="ATIVIDADE"' + (S.dfcAb !== 'ELEMENTO' ? ' selected' : '') + '>por atividade</option><option value="ELEMENTO"' + (S.dfcAb === 'ELEMENTO' ? ' selected' : '') + '>por grupo › subgrupo › elemento</option></select>' +
      '<span class="dica">Realizado: o que passou pelas contas. Transferência entre contas não entra (é interna). A atividade de cada natureza se ajusta em Cadastros.</span></div>';
    if (!d.ok) return h + '<div class="alerta warn"><div>' + e(d.motivo) + '</div></div></div>';
    if (S.dfcAb === 'ELEMENTO') return h + tabelaRel(F.relDfc(fin, {de: S.dfcDe, ate: S.dfcAte, abertura: 'ELEMENTO'})).replace('id="relTabela"', 'id="dfcElTabela"') + '</div>';
    var ms = d.meses;
    function lin(rot, f, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + rot + '</td>' + ms.map(function(m, i) { return '<td class="n">' + f(m, i) + '</td>'; }).join('') + '</tr>'; }
    h += '<div class="tw"><table class="dre"><thead><tr><th></th>' + ms.map(function(m) { return '<th class="n">' + rotMes(m) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      lin('<b>Saldo inicial</b>', function(m, i) { return brl(d.colunas[i].saldoInicialCentavos); }, 'tot');
    if (d.colunas.some(function(c) { return c.aberturaContasCentavos; })) h += lin('Saldo de abertura de conta nova', function(m, i) { return d.colunas[i].aberturaContasCentavos ? brl(d.colunas[i].aberturaContasCentavos) : ''; });
    d.grupos.forEach(function(gr) {
      h += '<tr><td colspan="' + (ms.length + 1) + '"><b>' + e(gr.rotulo) + '</b>' + (gr.atividade === 'NAO_CLASSIFICADO' ? ' <span class="tg warn">defina a atividade em Cadastros</span>' : '') + '</td></tr>';
      gr.linhas.forEach(function(l) { h += lin('&nbsp;&nbsp;' + e(rotNat(l.natureza)), function(m) { return l.meses[m] ? brl(l.meses[m]) : '<span class="mut">—</span>'; }); });
      h += lin('<i>Caixa líquido — ' + e(gr.rotulo.toLowerCase()) + '</i>', function(m) { return '<i>' + brl(gr.totais[m]) + '</i>'; });
    });
    if (!d.grupos.length) h += '<tr><td colspan="' + (ms.length + 1) + '" class="mut">Nenhuma entrada ou saída realizada no período.</td></tr>';
    h += lin('<b>Variação do caixa</b>', function(m, i) { return '<b>' + brl(d.colunas[i].variacaoCentavos) + '</b>'; }, 'tot') +
      lin('<b>Saldo final</b>', function(m, i) { return '<b>' + brl(d.colunas[i].saldoFinalCentavos) + '</b>'; }, 'tot') +
      lin('Conferência com os bancos', function(m, i) { var c = d.colunas[i]; return c.confere ? '<span class="tg ok">confere</span>' : '<span class="tg bad">dif. ' + brl(c.diferencaCentavos) + '</span>'; }) +
      '</tbody></table></div></div>';
    return h;
  }

  function abaComplementos() {
    var lista = F.complementos(base());
    var rot = {SEM_VALOR: ['bad', 'Sem valor'], SEM_VENCIMENTO: ['warn', 'Sem prazo'], DIFERENCA_FISCAL: ['info', 'Diferença fiscal'],
      NF_DIVERGENTE: ['bad', 'NF ≠ recebimento'], NF_SEM_PEDIDO: ['warn', 'NF sem pedido'], NF_SEM_FORNECEDOR: ['warn', 'NF sem fornecedor'],
      NF_SEM_RECEBIMENTO: ['info', 'NF aguardando recebimento'], NF_AMBIGUA: ['warn', 'NF ambígua'], NF_SEM_TITULO: ['info', 'NF sem título'], NF_A_VINCULAR: ['info', 'NF a vincular']};
    return '<div class="card"><h3>Complementos</h3><div class="sub" style="margin-bottom:10px">O que a derivação não completou sozinha. Nenhum outro módulo é alterado: o Financeiro resolve aqui. Corrigido na origem (ex.: preço no PC), o item some sozinho na próxima rodada.</div>' +
      '<div class="tw"><table><thead><tr><th>Tipo</th><th>O que falta</th><th class="n">Valor</th><th>Resolver</th></tr></thead><tbody>' +
      (lista.length ? lista.map(function(c) {
        var r = rot[c.tipo] || ['mute', c.tipo], acao;
        if (c.tipo === 'NF_SEM_PEDIDO' || c.tipo === 'NF_SEM_FORNECEDOR') acao = '<button class="btn sm pri" data-manual-nf="' + e(c.nota) + '">Lançar título da nota</button> <span class="mut">' + e(c.acao) + '</span>';
        else if (c.tipo === 'NF_A_VINCULAR') acao = '<button class="btn sm pri" data-vincular-nf="1">Vincular agora</button>';
        else if (c.tipo.indexOf('NF_') === 0) acao = '<span class="mut">' + e(c.acao) + '</span>';
        else if (c.tipo === 'SEM_VENCIMENTO') acao = '<div class="mini-acoes"><input class="inp" style="width:130px" placeholder="ex.: 28/42" data-cond-txt="' + e(c.titulo) + '"><span class="mut">ou</span><input class="inp" type="date" data-cond-venc="' + e(c.titulo) + '"><button class="btn sm pri" data-cond-ok="' + e(c.titulo) + '">Salvar</button></div>';
        else acao = '<button class="btn sm" data-manual="' + (c.origem && c.origem.tipo === 'RECEBIMENTO' ? 'PAGAR' : 'RECEBER') + '">Lançar título manual</button> <span class="mut">' + e(c.acao) + '</span>';
        return '<tr><td><span class="tg ' + r[0] + '">' + r[1] + '</span></td><td>' + e(c.texto) + '</td><td class="n">' + brl(c.valorCentavos) + '</td><td>' + acao + '</td></tr>';
      }).join('') : '<tr><td colspan="4"><div class="vazio"><b>Nada pendente.</b>Todos os fatos viraram títulos com valor e prazo.</div></td></tr>') + '</tbody></table></div></div>';
  }

  function abaCadastros() {
    var cs = fin.contas_bancarias || {}, par = fin.parametros || {};
    var h = '<div class="grid2"><div class="card"><h3>Contas bancárias</h3><div class="tw"><table><thead><tr><th>Conta</th><th>Saldo inicial</th><th>Em</th><th class="n">Saldo hoje</th></tr></thead><tbody>' +
      (Object.keys(cs).length ? Object.keys(cs).map(function(k) { var sb = F.saldosBancarios(fin, hojeISO())[k]; return '<tr><td>' + e(cs[k].nome) + ' <span class="mut">' + e([cs[k].banco, cs[k].agencia, cs[k].numero].filter(Boolean).join(' · ')) + '</span>' +
        ' <select class="sel" data-tipo-conta="' + e(k) + '" aria-label="Tipo da conta ' + e(cs[k].nome) + '">' + Object.keys(F.TIPOS_CONTA).map(function(t) { return '<option value="' + t + '"' + (F.tipoConta(cs[k]) === t ? ' selected' : '') + '>' + F.TIPOS_CONTA[t] + '</option>'; }).join('') + '</select></td><td>' + brl(cs[k].saldoInicialCentavos) + '</td><td>' + dataBR(cs[k].dataSaldoInicial) + '</td><td class="n">' + brl(sb && sb.saldoCentavos) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="mut">Nenhuma.</td></tr>') +
      '</tbody></table></div><div class="form" style="margin-top:12px"><div><label for="cbNome">Nome</label><input class="inp" id="cbNome" placeholder="Itaú movimento"></div><div><label for="cbBanco">Banco / agência / conta</label><input class="inp" id="cbBanco" placeholder="341 · 0001 · 12345-6"></div>' +
      '<div><label for="cbTipo">Tipo</label><select class="sel" id="cbTipo">' + Object.keys(F.TIPOS_CONTA).map(function(t) { return '<option value="' + t + '">' + F.TIPOS_CONTA[t] + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="cbSaldo">Saldo inicial (R$)</label><input class="inp" id="cbSaldo" placeholder="0,00"></div><div><label for="cbData">Data do saldo</label><input class="inp" type="date" id="cbData" value="' + hojeISO() + '"></div></div>' +
      '<div style="margin-top:10px"><button class="btn pri sm" id="cbSalvar">Adicionar conta</button> <span class="dica">O saldo inicial vira lançamento de abertura na Controladoria. Corrigir depois = nova conta ou ajuste, não edição.</span></div></div>';
    h += '<div class="card"><h3>Parâmetros</h3><div class="form"><div><label for="pFolha">Folha vence no dia (mês seguinte)</label><input class="inp" id="pFolha" type="number" min="1" max="28" value="' + e(par.vencimentoFolhaDia || 5) + '"></div>' +
      '<div><label for="pFixos">Custos fixos vencem no dia (mês seguinte)</label><input class="inp" id="pFixos" type="number" min="1" max="28" value="' + e(par.vencimentoFixosDia || 10) + '"></div>' +
      '<div><label for="pTol">Tolerância da conciliação (dias)</label><input class="inp" id="pTol" type="number" min="0" max="15" value="' + e(par.toleranciaConciliacaoDias || 3) + '"></div></div>' +
      '<div style="margin-top:10px"><button class="btn sm" id="pSalvar">Salvar parâmetros</button></div></div></div>';
    var atvMap = par.dfcAtividades || {};
    h += '<div class="card"><h3>Demonstrativo de fluxo de caixa — atividade de cada natureza</h3><div class="sub" style="margin-bottom:8px">Padrão: tudo operacional. Empréstimo, financiamento ou compra de máquina pedem natureza própria (lançamento manual) marcada aqui como financiamento ou investimento.</div>' +
      '<div class="tw"><table><thead><tr><th>Natureza</th><th>Atividade no DFC</th></tr></thead><tbody>' +
      F.NATUREZAS.concat(['RESULTADO_FINANCEIRO', 'ADIANTAMENTOS']).map(function(n) {
        var atual = F.atividadeDe(n, par);
        return '<tr><td>' + e(rotNat(n)) + '</td><td><select class="sel" data-dfc-nat="' + n + '" aria-label="Atividade de ' + e(rotNat(n)) + '">' +
          Object.keys(F.ATIVIDADES).filter(function(a) { return a !== 'NAO_CLASSIFICADO'; }).map(function(a) { return '<option value="' + a + '"' + (atual === a ? ' selected' : '') + '>' + e(F.ATIVIDADES[a]) + '</option>'; }).join('') +
          '</select>' + (atvMap[n] && atvMap[n] !== F.ATIVIDADE_PADRAO[n] ? ' <span class="tg info">alterado</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    h += cardElementos();
    h += '<div class="card"><h3>Importar títulos em aberto (planilha)</h3><div class="sub" style="margin-bottom:8px">Para começar com a carteira de hoje. Cole do Excel uma linha por título: <code>tipo;parceiro;cnpj;documento;emissão;vencimento;valor;natureza</code> (tipo PAGAR ou RECEBER, datas DD/MM/AAAA, valor 1.234,56). Entra como <b>saldo de abertura</b>. Importar a mesma linha de novo não duplica.</div>' +
      '<textarea class="inp" id="impTxt" rows="6" style="width:100%;font-family:monospace"></textarea><div style="margin-top:8px;display:flex;gap:8px;align-items:center"><button class="btn sm" id="impVer">Conferir</button><button class="btn pri sm" id="impOk" disabled>Importar</button><span id="impRes" class="mut"></span></div>' +
      '<div class="dica">Naturezas: ' + F.NATUREZAS.join(', ') + '.</div></div>';
    return h;
  }
  function formManual(tipo, nota) {
    var h = (nota ? '<div class="alerta info" style="margin-bottom:10px"><div>Título da <b>NF ' + e(nota.numero) + '</b> de ' + e(nota.emitente && nota.emitente.nome) + '. ' +
      ((nota.duplicatas || []).length ? 'Os vencimentos seguem as ' + nota.duplicatas.length + ' duplicata(s) da nota: deixe vencimento e condição em branco.' : 'A nota não tem duplicatas: informe o vencimento ou a condição.') + '</div></div>' : '') +
      '<input type="hidden" id="mNota" value="' + e(nota ? nota.chave : '') + '"><div class="form"><div><label for="mParc">' + (tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente') + '</label><input class="inp" id="mParc"></div><div><label for="mCnpj">CNPJ</label><input class="inp" id="mCnpj"></div>' +
      '<div><label for="mDoc">Documento</label><input class="inp" id="mDoc" placeholder="NF 123"></div><div><label for="mValor">Valor (R$)</label><input class="inp" id="mValor"></div>' +
      '<div><label for="mEmi">Emissão</label><input class="inp" type="date" id="mEmi" value="' + hojeISO() + '"></div><div><label for="mVenc">Vencimento único</label><input class="inp" type="date" id="mVenc"><div class="dica">Preenchido, vale ele e o parcelamento é ignorado.</div></div>' +
      '<div><label for="mNParc">Nº de parcelas</label><input class="inp" type="number" inputmode="numeric" min="1" max="60" id="mNParc" placeholder="2"></div>' +
      '<div><label for="mPrim">1º vencimento (dias)</label><input class="inp" type="number" inputmode="numeric" min="0" max="365" id="mPrim" value="30"></div>' +
      '<div><label for="mInt">Intervalo (dias)</label><input class="inp" type="number" inputmode="numeric" min="1" max="365" id="mInt" value="30"></div>' +
      '<div><label for="mCond">Condição</label><input class="inp" id="mCond" placeholder="30/60 ou 2x 30/60"><div class="dica">Montada pelos campos ao lado, ou digite (ex.: 2x 30/60, 3x, 20% à vista, 30/45).</div></div>' +
      '<div style="grid-column:1/-1" id="mPrev" aria-live="polite"></div>' +
      '<div><label for="mNat">Natureza</label><select class="sel" id="mNat">' + F.NATUREZAS.map(function(n) { return '<option' + ((tipo === 'RECEBER' ? 'RECEITA_VENDA' : 'OUTROS') === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="mEl">Elemento de custo</label><select class="sel" id="mEl">' + opcoesElementos(tipo, '', 'pela natureza') + '</select></div>' +
      '<div><label for="mForma">Forma de pagamento</label><select class="sel" id="mForma"><option value="">—</option>' + Object.keys(F.FORMAS_PAGAMENTO).map(function(k) { return '<option value="' + k + '">' + e(F.FORMAS_PAGAMENTO[k]) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="mCC">Centro de custo</label><select class="sel" id="mCC">' + opcoes([['', '— não informado —']].concat(Object.keys(RX.centros(centrosCtl)).map(function(k) { return [k, RX.centros(centrosCtl)[k]]; })), '') + '</select>' +
      '<div class="dica">Entra no relatório de gastos por centro e na Controladoria.</div></div>' +
      '<div style="grid-column:1/-1"><label for="mHist">Histórico</label><input class="inp" id="mHist"></div></div>' +
      '<div style="margin-top:12px"><button class="btn pri" id="mOk" data-tipo="' + tipo + '">Lançar</button> <span class="dica">Título manual vira lançamento na Controladoria pela natureza.</span></div>';
    abrir('Título ' + (tipo === 'PAGAR' ? 'a pagar' : 'a receber') + ' manual', h);
    if (nota) {
      el('mParc').value = (nota.emitente && nota.emitente.nome) || ''; el('mCnpj').value = (nota.emitente && nota.emitente.cnpj) || '';
      el('mDoc').value = 'NF ' + nota.numero + (nota.serie && nota.serie !== '0' ? '/' + nota.serie : '');
      var somaDup = (nota.duplicatas || []).reduce(function(s2, d2) { return s2 + num(d2.valorCentavos); }, 0) || num(nota.valorTotalCentavos);
      el('mValor').value = (somaDup / 100).toFixed(2).replace('.', ','); el('mEmi').value = nota.emissao || hojeISO();
    }
    previaManual();
  }
  function linhaManual(tipo) {
    return {tipo: tipo, parceiro: el('mParc').value, cnpj: el('mCnpj').value, documento: el('mDoc').value, valor: el('mValor').value, emissao: el('mEmi').value,
      vencimento: el('mVenc').value || null, condicao: el('mCond').value, natureza: el('mNat').value, historico: el('mHist').value,
      centroCusto: (el('mCC') && el('mCC').value) || null, elemento: (el('mEl') && el('mEl').value) || null, formaPagamento: (el('mForma') && el('mForma').value) || null,
      notaChave: (el('mNota') && el('mNota').value) || null};
  }
  // Prévia das parcelas (n/de, vencimento, valor) pelo mesmo motor que o servidor usa.
  function previaManual() {
    var alvo = el('mPrev'); if (!alvo) return;
    var lm = linhaManual(''), nt = lm.notaChave && (fin.notas_entrada || {})[lm.notaChave];
    var p = nt && !lm.vencimento && !String(lm.condicao || '').trim() && (nt.duplicatas || []).length
      ? {ok: true, parcelas: F.parcelasDaNota(nt, F.centavos(lm.valor) || 0), avisos: ['Vencimentos das duplicatas da nota.']} : F.previaParcelas(lm);
    if (!p.ok) { alvo.innerHTML = '<div class="alerta info"><div><b>Prévia das parcelas:</b> ' + e(p.motivo) + '</div></div>'; return; }
    alvo.innerHTML = '<h3 style="margin:4px 0 6px">Prévia das parcelas</h3><div class="tw"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th class="n">Valor</th></tr></thead><tbody>' +
      p.parcelas.map(function(x) { return '<tr><td>' + x.n + '/' + x.de + (x.tipo !== 'PRAZO' ? ' <span class="mut">' + e(x.tipo === 'A_VISTA' ? 'à vista' : x.tipo) + '</span>' : '') + '</td><td>' + dataBR(x.vencimento) + '</td><td class="n">' + brl(x.valorCentavos) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + (p.avisos.length ? '<div class="dica">' + p.avisos.map(e).join(' ') + '</div>' : '');
  }

  /* ── Diálogo ───────────────────────────────────────────────────────────── */
  function abrir(t, h) { el('dlgT').innerHTML = '<h2>' + t + '</h2>'; el('dlgB').innerHTML = h; var d = el('dlg'); if (!d.open) d.showModal(); }
  function fechar() { var d = el('dlg'); if (d.open) d.close(); }
  el('dlgX').addEventListener('click', fechar);

  /* ── Ações ─────────────────────────────────────────────────────────────── */
  function travar(b, p) { b.disabled = true; return p.then(function(r) { b.disabled = false; return r; }, function(err) { b.disabled = false; toast(erroMsg(err)); throw err; }); }
  document.addEventListener('click', function(ev) {
    var t = ev.target.closest('button, a, [data-aba]'); if (!t) return;
    var d = t.dataset;
    if (t.classList.contains('aba')) { S.aba = d.aba; S.q = ''; S.tsel = {}; render(); return; }
    if (t.id === 'btnRecarregar') { lerFatos(); return; }
    if (d.det) { ev.preventDefault(); detalhe(d.det); return; }
    if (d.baixar) { formBaixa(d.baixar); return; }
    if (d.manual) { formManual(d.manual); return; }
    if (t.id === 'relCsv') { baixarCsvRel(); return; }
    // F9.
    if (d.lqAtalho) {
      var hj = hojeISO(), L = S.lq; L.sel = {};
      if (d.lqAtalho === 'HOJE') { L.de = hj; L.ate = F.addDias(hj, 1); }
      else if (d.lqAtalho === 'SEMANA') { L.de = hj; L.ate = F.addDias(hj, 6); }
      else if (d.lqAtalho === 'VENCIDOS') { L.de = ''; L.ate = F.addDias(hj, -1); }
      else { L.de = ''; L.ate = ''; }
      render(); return;
    }
    if (t.id === 'lqOk') {
      var vis2 = {}; F.parcelasParaLiquidar(fin, {tipo: S.lq.tipo, hoje: hojeISO()}).forEach(function(l) { vis2[lqChave(l)] = l; });
      var itens = Object.keys(S.lq.sel).filter(function(k) { return vis2[k]; }).map(function(k) { return {titulo: vis2[k].titulo, valorCentavos: vis2[k].abertoCentavos}; });
      var dl = {chave: chave(), itens: itens, data: el('lqData').value, conta: el('lqConta').value};
      var ml = F.montarLiquidacao(fin, dl); if (!ml.ok) { toast(ml.motivo); return; }
      S.lq.data = dl.data; S.lq.conta = dl.conta;
      travar(t, chamar('finLiquidar', dl)).then(function() { S.lq.sel = {}; render(); toast(ml.baixas.length + ' baixa(s) · ' + (ml.totalCentavos / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) + '.'); });
      return;
    }
    if (d.classif) { formClassificar(d.classif); return; }
    if (t.id === 'clOk') {
      var rat = []; [0, 1, 2, 3, 4].forEach(function(i) { var c = el('clCC' + i).value, pc = Number(String(el('clPc' + i).value || '').replace(',', '.')); if (c && pc) rat.push({centro: c, percentual: pc}); });
      var dc = {titulo: d.tit, elemento: el('clEl').value, formaPagamento: el('clForma').value || null, rateio: rat.length ? rat : null};
      var vc = F.validarClassificacao(porIdCarteira()[d.tit], dc, fin); if (!vc.ok) { toast(vc.motivo); return; }
      travar(t, chamar('finClassificar', dc)).then(function() { fechar(); toast('Classificado.'); });
      return;
    }
    if (d.elEdit) {
      var x9 = F.elementos(fin)[d.elEdit]; if (!x9) return;
      el('elCod').value = d.elEdit; el('elNome').value = x9.nome; el('elGrupo').value = x9.grupo; el('elSub').value = x9.subgrupo; el('elNat').value = x9.natureza; el('elAtivo').checked = !!x9.ativo;
      el('elNome').focus(); return;
    }
    if (t.id === 'elOk') {
      var de9 = {codigo: el('elCod').value, nome: el('elNome').value, grupo: el('elGrupo').value, subgrupo: el('elSub').value, natureza: el('elNat').value, ativo: el('elAtivo').checked};
      var ve = F.validarElemento(de9, fin); if (!ve.ok) { toast(ve.motivo); return; }
      travar(t, chamar('finCadastrarElemento', de9)).then(function() { toast('Elemento ' + ve.registro.codigo + ' salvo.'); });
      return;
    }
    // Entrega B.
    if (d.adiant) { formAdiantamento(d.adiant); return; }
    if (d.limparSel) { S.tsel = {}; render(); return; }
    if (d.reneg) { formRenegociar(d.reneg); return; }
    if (d.cancel) { formCancelar(d.cancel); return; }
    if (d.compAd) { formCompensar(d.compAd, d.compTit); return; }
    if (t.id === 'adOk') {
      var ad = {acao: 'CRIAR', chave: chave(), tipo: d.tipo, parceiro: el('adParc').value, cnpj: el('adCnpj').value, conta: el('adConta').value, data: el('adData').value,
        valorCentavos: lerReais(el('adValor').value), documento: el('adDoc').value, historico: el('adHist').value};
      var va = F.validarAdiantamento(ad, fin); if (!va.ok) { toast(va.motivo); return; }
      travar(t, chamar('finAdiantamento', ad)).then(function() { fechar(); toast('Adiantamento lançado.'); });
      return;
    }
    if (d.estAd) {
      var mEa = prompt('Motivo do estorno do adiantamento (fica no histórico):'); if (!mEa) return;
      travar(t, chamar('finAdiantamento', {acao: 'ESTORNAR', adiantamento: d.estAd, motivo: mEa, data: hojeISO()})).then(function() { toast('Adiantamento estornado.'); });
      return;
    }
    if (t.id === 'cpOk') {
      travar(t, chamar('finCompensarAdiantamento', {chave: chave(), adiantamento: d.ad, titulo: d.tit, valorCentavos: lerReais(el('cpValor').value), data: el('cpData').value}))
        .then(function() { fechar(); toast('Compensado.'); });
      return;
    }
    if (t.id === 'rnOk') {
      var rd = dadosReneg(); rd.titulos = selecionados(d.tipo).map(function(x) { return x.id; });
      var mr = F.montarRenegociacao(fin, rd, 'previa'); if (!mr.ok) { toast(mr.motivo); return; }
      travar(t, chamar('finRenegociar', Object.assign({acao: 'CRIAR', chave: chave()}, rd))).then(function() { S.tsel = {}; fechar(); toast('Renegociado: título novo criado.'); });
      return;
    }
    if (t.id === 'cnOk') {
      var cdd = {acao: 'CRIAR', chave: chave(), titulos: selecionados(d.tipo).map(function(x) { return x.id; }), data: hojeISO(), motivo: el('cnMotivo').value, justificativa: el('cnJust').value};
      var mc = F.montarCancelamento(fin, cdd, 'previa'); if (!mc.ok) { toast(mc.motivo); return; }
      travar(t, chamar('finCancelarTitulos', cdd)).then(function() { S.tsel = {}; fechar(); toast('Cancelado(s): ' + cdd.titulos.length + '.'); });
      return;
    }
    if (d.desfRn || d.desfCn) {
      var mD = prompt('Por que desfazer? (fica no histórico)'); if (!mD) return;
      var pr = d.desfRn ? chamar('finRenegociar', {acao: 'DESFAZER', renegociacao: d.desfRn, motivo: mD, data: hojeISO()}) : chamar('finCancelarTitulos', {acao: 'DESFAZER', cancelamento: d.desfCn, motivo: mD, data: hojeISO()});
      travar(t, pr).then(function() { fechar(); toast('Desfeito: os títulos voltaram ao saldo de antes.'); });
      return;
    }
    if (t.id === 'fatCsv') { baixarCsvFat(); return; }
    if (t.id === 'relImprimir') { imprimirRel(); return; }
    if (d.mov) { formMovimento(null); return; }
    if (d.transf) { formTransferencia(); return; }
    if (d.concMov) { var lx = ((fin.extratos || {})[S.extratoConta] || {})[d.concMov]; if (lx) formMovimento(Object.assign({conta: S.extratoConta}, lx)); return; }
    if (t.id === 'mvOk') {
      var mv = {chave: chave(), tipo: el('mvTipo').value, conta: el('mvConta').value, data: el('mvData').value, valorCentavos: lerReais(el('mvValor').value), historico: el('mvHist').value};
      if (d.extrato) mv.extrato = JSON.parse(d.extrato);
      travar(t, chamar('finMovimentar', mv)).then(function() { fechar(); toast('Movimento lançado.'); });
      return;
    }
    if (t.id === 'trOk') {
      var tr = {chave: chave(), tipo: 'TRANSFERENCIA', conta: el('trOrigem').value, destino: el('trDestino').value, data: el('trData').value, valorCentavos: lerReais(el('trValor').value), historico: el('trHist').value};
      travar(t, chamar('finMovimentar', tr)).then(function() { fechar(); toast('Transferência lançada.'); });
      return;
    }
    if (d.estornarMov) {
      var mot2 = prompt('Motivo do estorno (fica no histórico):'); if (!mot2) return;
      travar(t, chamar('finEstornarMovimento', {movimento: d.estornarMov, motivo: mot2, data: hojeISO()})).then(function() { toast('Movimento estornado.'); });
      return;
    }
    if (d.manualNf) { var nt = (fin.notas_entrada || {})[d.manualNf]; if (nt) formManual('PAGAR', nt); return; }
    if (d.vincularNf) { travar(t, chamar('finImportarNfEntrada', {xmls: []})).then(function(r) { toast(r.vinculadas ? r.vinculadas + ' nota(s) vinculada(s).' : 'Nada novo para vincular.'); }); return; }
    if (t.id === 'nfLimpar') { S.previaNotas = []; render(); return; }
    if (t.id === 'nfImportar') {
      var envio = S.previaNotas.filter(function(x) { return x.r.ok && !x.repetida; }).map(function(x) { return {nome: x.nome, texto: x.texto}; });
      travar(t, chamar('finImportarNfEntrada', {xmls: envio})).then(function(r) {
        S.previaNotas = []; render();
        toast(r.importadas + ' nota(s) importada(s)' + (r.vinculadas ? ', ' + r.vinculadas + ' vinculada(s) ao recebimento' : '') + (r.repetidas.length ? ', ' + r.repetidas.length + ' já existia(m)' : '') + (r.erros.length ? '. Erros: ' + r.erros.slice(0, 3).join(' ') : '.'));
      });
      return;
    }
    if (t.id === 'bxOk') {
      var conta = el('bxConta').value; S.conta = conta;
      var dados = {chave: chave(), titulo: d.tit, valorCentavos: lerReais(el('bxValor').value), data: el('bxData').value, conta: conta,
        jurosCentavos: lerReais(el('bxJuros').value) || 0, multaCentavos: lerReais(el('bxMulta').value) || 0, descontoCentavos: lerReais(el('bxDesc').value) || 0, historico: el('bxHist').value};
      if (d.extrato) dados.extrato = JSON.parse(d.extrato);
      travar(t, chamar('finBaixar', dados)).then(function() { fechar(); toast('Baixa registrada.'); });
      return;
    }
    if (d.estornar) {
      var motivo = prompt('Motivo do estorno (fica no histórico):'); if (!motivo) return;
      travar(t, chamar('finEstornarBaixa', {baixa: d.estornar, motivo: motivo, data: hojeISO()})).then(function() { fechar(); toast('Baixa estornada.'); });
      return;
    }
    if (d.bloq) {
      var bl = (fin.bloqueios || {})[d.bloq], ativo = bl && bl.ativo !== false;
      if (ativo) { db.ref('fin/bloqueios/' + d.bloq).remove().then(function() { toast('Desbloqueado.'); }, function(err) { toast(erroMsg(err)); }); return; }
      var mot = prompt('Por que bloquear o pagamento? (ex.: nota com divergência)'); if (!mot || mot.trim().length < 5) return;
      db.ref('fin/bloqueios/' + d.bloq).set({motivo: mot.trim().slice(0, 300), por: autor(), em: new Date().toISOString(), ativo: true}).then(function() { toast('Pagamento bloqueado.'); }, function(err) { toast(erroMsg(err)); });
      return;
    }
    if (t.id === 'ltCriar') {
      var ids = Object.keys(S.sel).filter(function(k) { return S.sel[k] > 0; }), conta2 = el('ltConta').value;
      if (!conta2) { toast('Escolha a conta.'); return; }
      var tit = {}; ids.forEach(function(k) { tit[k] = S.sel[k]; });
      var ref = db.ref('fin/lotes_pagamento').push();
      travar(t, ref.set({titulos: tit, conta: conta2, dataPagamento: el('ltData').value, totalCentavos: ids.reduce(function(s, k) { return s + S.sel[k]; }, 0),
        criadoPor: autor(), criadoPorUid: uid(), criadoEm: new Date().toISOString(), status: 'AGUARDANDO'})).then(function() { S.sel = {}; toast('Lote criado: aguarda aprovação de outra pessoa.'); });
      return;
    }
    if (d.loteOk) { travar(t, chamar('finDecidirLote', {lote: d.loteOk, acao: 'APROVAR'})).then(function(r) { toast('Lote aprovado: ' + r.baixas + ' baixa(s).'); }); return; }
    if (d.loteNo) { var m2 = prompt('Motivo da recusa:') || ''; travar(t, chamar('finDecidirLote', {lote: d.loteNo, acao: 'RECUSAR', motivo: m2})).then(function() { toast('Lote recusado.'); }); return; }
    if (d.concBaixa) {
      travar(t, db.ref('fin/conciliacoes/' + san(S.extratoConta) + '_' + san(d.fitid)).set({conta: S.extratoConta, fitid: d.fitid, baixa: d.concBaixa, em: new Date().toISOString(), por: autor()})).then(function() { toast('Conciliada.'); });
      return;
    }
    if (d.concTit) { var l = ((fin.extratos || {})[S.extratoConta] || {})[d.k]; formBaixa(d.concTit, Object.assign({conta: S.extratoConta}, l)); return; }
    if (d.condOk) {
      var tx = (document.querySelector('[data-cond-txt="' + d.condOk + '"]') || {}).value || '', vc = (document.querySelector('[data-cond-venc="' + d.condOk + '"]') || {}).value || '';
      if (tx && !F.lerCondicao(tx).ok) { toast(F.lerCondicao(tx).motivo); return; }
      if (!tx && !vc) { toast('Informe a condição ou o vencimento.'); return; }
      var reg = {por: autor(), em: new Date().toISOString()};
      if (vc) reg.vencimento = vc; else reg.condicao = tx;
      travar(t, db.ref('fin/condicoes/' + d.condOk).set(reg)).then(function() { toast('Prazo informado.'); });
      return;
    }
    if (t.id === 'cbSalvar') {
      var nome = el('cbNome').value.trim(), saldo = lerReais(el('cbSaldo').value || '0');
      if (!nome || saldo == null) { toast('Informe o nome e o saldo inicial.'); return; }
      var partes = el('cbBanco').value.split(/·|\|/).map(function(s) { return s.trim(); });
      var k = san(nome.toLowerCase().replace(/\s+/g, '_')).slice(0, 40);
      if ((fin.contas_bancarias || {})[k]) { toast('Já existe uma conta com esse nome.'); return; }
      travar(t, db.ref('fin/contas_bancarias/' + k).set({nome: nome, tipo: el('cbTipo').value || 'BANCO', banco: partes[0] || null, agencia: partes[1] || null, numero: partes[2] || null,
        saldoInicialCentavos: saldo, dataSaldoInicial: el('cbData').value, criadoPor: autor(), criadoEm: new Date().toISOString()})).then(function() { toast('Conta adicionada.'); });
      return;
    }
    if (t.id === 'pSalvar') {
      travar(t, db.ref().update({'fin/parametros/vencimentoFolhaDia': Number(el('pFolha').value) || 5, 'fin/parametros/vencimentoFixosDia': Number(el('pFixos').value) || 10,
        'fin/parametros/toleranciaConciliacaoDias': Number(el('pTol').value) || 3})).then(function() { toast('Parâmetros salvos.'); });
      return;
    }
    if (t.id === 'impVer') {
      var r = F.lerPlanilhaTitulos(el('impTxt').value);
      el('impRes').textContent = r.titulos.length + ' título(s) válido(s)' + (r.erros.length ? ' · ' + r.erros.length + ' com erro: ' + r.erros.slice(0, 3).join(' ') : '');
      el('impOk').disabled = !r.titulos.length;
      return;
    }
    if (t.id === 'impOk') {
      var r2 = F.lerPlanilhaTitulos(el('impTxt').value);
      travar(t, chamar('finLancarTitulos', {origem: 'IMPORTACAO', ignorarErros: true, titulos: r2.titulos.map(function(x) {
        return {tipo: x.tipo, parceiro: x.parceiro.nome, cnpj: x.parceiro.cnpj, documento: x.documento, emissao: x.emissao, vencimento: x.vencimentoFixo, valorCentavos: x.valorCentavos, natureza: x.natureza};
      })})).then(function(res) { el('impRes').textContent = res.criados + ' importado(s), ' + res.repetidos + ' já existiam.'; });
      return;
    }
    if (t.id === 'mOk') {
      var linha = linhaManual(d.tipo);
      if (!linha.notaChave) delete linha.notaChave;
      var v = F.validarTituloManual(linha, 'MANUAL'); if (!v.ok) { toast(v.motivo); return; }
      travar(t, chamar('finLancarTitulos', {origem: 'MANUAL', titulos: [linha]})).then(function(res) { fechar(); toast(res.criados ? 'Título lançado.' : 'Já existia um título igual.'); });
      return;
    }
  });
  document.addEventListener('change', function(ev) {
    var t = ev.target, d = t.dataset;
    if (t.id === 'fFiltro') { S.filtro = t.value; render(); }
    if (t.id === 'fFat') { S.fatFiltro = t.value; render(); }
    if (d.sel) { if (t.checked) S.sel[d.sel] = Number(d.valor); else delete S.sel[d.sel]; render(); }
    if (d.tsel) { if (t.checked) S.tsel[d.tsel] = true; else delete S.tsel[d.tsel]; render(); }
    if (d.lqSel) { if (t.checked) S.lq.sel[d.lqSel] = true; else delete S.lq.sel[d.lqSel]; render(); }
    if (t.id === 'lqTodos') {
      S.lq.sel = {};
      if (t.checked) F.parcelasParaLiquidar(fin, {tipo: S.lq.tipo, de: S.lq.de || null, ate: S.lq.ate || null, q: S.lq.q, elemento: S.lq.elemento || null, hoje: hojeISO()})
        .forEach(function(l) { if (!l.bloqueado) S.lq.sel[lqChave(l)] = true; });
      render();
    }
    if (t.id === 'lqTipo') { S.lq.tipo = t.value; S.lq.sel = {}; S.lq.elemento = ''; render(); }
    if (t.id === 'lqDe') { S.lq.de = t.value; S.lq.sel = {}; render(); }
    if (t.id === 'lqAte') { S.lq.ate = t.value; S.lq.sel = {}; render(); }
    if (t.id === 'lqQ') { S.lq.q = t.value; S.lq.sel = {}; render(); }
    if (t.id === 'lqElem') { S.lq.elemento = t.value; S.lq.sel = {}; render(); }
    if (t.id === 'lqData' && t.value) { S.lq.data = t.value; render(); }
    if (t.id === 'lqConta') { S.lq.conta = t.value; }
    if (t.id === 'flGrupo') { S.flGrupo = t.checked; render(); }
    if (t.id === 'dfcAb') { S.dfcAb = t.value; render(); }
    if (t.id === 'relSemAd') { S.rel.semAdiant = t.checked; render(); }
    if (t.id === 'cnMotivo') previaCancel();
    if (t.id === 'adParc') { try { var cj = JSON.parse(t.dataset.cnpjs || '{}'); if (cj[t.value] && !el('adCnpj').value) el('adCnpj').value = cj[t.value]; } catch (x) { /* ok */ } }
    if (t.id === 'ltConta') { S.conta = t.value; render(); }
    if (t.id === 'exConta') { S.extratoConta = t.value; render(); }
    if (t.id === 'extConta') { S.extConta = t.value; render(); }
    if (t.id === 'flG') { S.flG = t.value; render(); }
    if (t.id === 'relTipo') { S.rel.tipo = t.value; render(); }
    if (t.id === 'relDe' && t.value) { S.rel.de = t.value; render(); }
    if (t.id === 'relAte' && t.value) { S.rel.ate = t.value; render(); }
    if (t.id === 'relDataBase') { S.rel.dataBase = t.value; render(); }
    if (t.id === 'relSit') { S.rel.situacao = t.value; render(); }
    if (t.id === 'relNat') { S.rel.natureza = t.value; render(); }
    if (t.id === 'relParc') { S.rel.parceiro = t.value; render(); }
    if (t.id === 'relConta') { S.rel.conta = t.value; render(); }
    if (t.id === 'relG') { S.rel.granularidade = t.value; render(); }
    var relCampo = {relData: S.rel.tipo === 'antecipacao' ? 'dataAnt' : 'data', relDestino: 'destino', relTipoMov: 'tipoMov', relGRP: 'granRP', relBase2: 'base2', relCC: 'centroCusto', relUsuario: 'usuario',
      relAgrupar: 'agrupar', relTop: 'top', relMeses: 'meses', relTaxa: 'taxa', relElem: 'elemento', relAgG: 'agruparGasto', relForma: 'forma', relAbDfc: 'aberturaDfc'}[t.id];
    if (relCampo && (!/^data/.test(relCampo) || t.value)) { S.rel[relCampo] = t.value; render(); }
    if (t.id === 'flConta') { S.flConta = t.value; render(); }
    if (t.id === 'flNat') { S.flNat = t.value; render(); }
    if (t.id === 'dfcDe' && t.value) { S.dfcDe = t.value; render(); }
    if (t.id === 'dfcAte' && t.value) { S.dfcAte = t.value; render(); }
    if (d.dfcNat) { db.ref('fin/parametros/dfcAtividades/' + d.dfcNat).set(t.value).then(function() { toast('Atividade salva.'); }, function(err) { toast(erroMsg(err)); }); }
    if (t.id === 'extDe') { S.extDe = t.value; render(); }
    if (t.id === 'extAte') { S.extAte = t.value; render(); }
    if (d.tipoConta) { db.ref('fin/contas_bancarias/' + d.tipoConta + '/tipo').set(t.value).then(function() { toast('Tipo da conta salvo.'); }, function(err) { toast(erroMsg(err)); }); }
    if (t.id === 'nfArquivos' && t.files && t.files.length) {
      var arquivos = Array.prototype.slice.call(t.files, 0, 50), notasJa = fin.notas_entrada || {};
      Promise.all(arquivos.map(function(f) {
        return new Promise(function(ok) { var r = new FileReader(); r.onload = function() { ok({nome: f.name, texto: String(r.result || '')}); }; r.onerror = function() { ok({nome: f.name, texto: ''}); }; r.readAsText(f, 'utf-8'); });
      })).then(function(lidos) {
        var vistos = {};
        S.previaNotas = lidos.map(function(x) {
          var r = F.lerXmlNfe(x.texto), k = r.ok ? r.nota.chave : null;
          var repetida = !!(k && (notasJa[k] || vistos[k])); if (k) vistos[k] = true;
          return {nome: x.nome, texto: x.texto, r: r, repetida: repetida};
        });
        render();
      });
      return;
    }
    if (t.id === 'exArquivo' && t.files && t.files[0]) {
      var leitor = new FileReader();
      leitor.onload = function() {
        var ex = F.lerOfx(leitor.result);
        if (ex.erro) { toast(ex.erro); return; }
        var atuais = (fin.extratos || {})[S.extratoConta] || {}, u = {}, novas = 0;
        ex.linhas.forEach(function(l) { var k = san(l.fitid); if (atuais[k]) return; novas++; u['fin/extratos/' + san(S.extratoConta) + '/' + k] = Object.assign({}, l, {importadoEm: new Date().toISOString(), por: autor()}); });
        if (!novas) { toast('Nenhuma linha nova (todas já importadas).'); return; }
        db.ref().update(u).then(function() { toast(novas + ' linha(s) importada(s).'); }, function(err) { toast(erroMsg(err)); });
      };
      leitor.readAsText(t.files[0], 'latin1');
    }
  });
  var tBusca = null;
  document.addEventListener('input', function(ev) {
    var id = ev.target.id;
    if (id === 'mNParc' || id === 'mPrim' || id === 'mInt') {
      // Nº de parcelas + 1º vencimento + intervalo montam a condição canônica.
      if (String(el('mNParc').value).trim() !== '') {
        var mc = F.montarCondicao({nParcelas: el('mNParc').value, primeiroPrazoDias: el('mPrim').value, intervaloDias: el('mInt').value});
        el('mCond').value = mc.ok ? mc.condicao : '';
        if (!mc.ok) { el('mPrev').innerHTML = '<div class="alerta warn"><div><b>Parcelamento:</b> ' + e(mc.motivo) + '</div></div>'; return; }
      }
      previaManual(); return;
    }
    // Condição digitada à mão manda: o Nº de parcelas deixa de valer (não fica contradizendo).
    if (id === 'mCond') el('mNParc').value = '';
    if (/^m(Valor|Emi|Venc|Cond)$/.test(id)) { previaManual(); return; }
    if (id === 'rnNParc' || id === 'rnPrim' || id === 'rnInt') {
      if (String(el('rnNParc').value).trim() !== '') { var rc = F.montarCondicao({nParcelas: el('rnNParc').value, primeiroPrazoDias: el('rnPrim').value, intervaloDias: el('rnInt').value}); el('rnCond').value = rc.ok ? rc.condicao : ''; }
      previaReneg(); return;
    }
    if (/^rn(Acr|Desc|Venc|Cond)$/.test(id)) { if (id === 'rnCond') el('rnNParc').value = ''; previaReneg(); return; }
    if (id !== 'qTit') return;
    clearTimeout(tBusca);
    var t = ev.target;
    tBusca = setTimeout(function() { S.q = t.value; var pos = t.selectionStart; render(); var n = el('qTit'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ok */ } } }, 250);
  });

  var iniciado = false;
  function iniciar() { if (iniciado) return; iniciado = true; lerFatos(); escutar(); }
  if (window.currentUser) iniciar(); else window.addEventListener('kuryos-auth-pronto', iniciar);
})();
