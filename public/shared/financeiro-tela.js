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
  var NOS_UMA_VEZ = ['pedidos_compra', 'processos_cotacao', 'fornecedores', 'clientes', 'estoque_lotes', 'pedidos_comerciais', 'agendamentos_expedicao'];
  var D = {}, fin = {}, fechamentos = {}, avisos = [];
  var S = {aba: 'painel', q: '', filtro: 'abertos', conta: '', sel: {}, extratoConta: ''};
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
  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function() { t.remove(); }, 4200); }
  function erroMsg(err) { return (err && (err.message || err.code)) || String(err); }
  function chamar(nome, dados) { return firebase.functions().httpsCallable(nome)(dados).then(function(r) { return r.data; }); }
  function kpi(cls, r, v, d) { return '<div class="kpi ' + cls + '"><div class="r">' + r + '</div><div class="v">' + v + '</div><div class="d">' + (d || '') + '</div></div>'; }
  function lerReais(v) { var c = F.centavos(v); return c == null ? null : c; }
  var ROT_ORIGEM = {RECEBIMENTO: 'Recebimento', NF_SAIDA: 'NF de saída', OPERACAO: 'Operação do mês', BONUS: 'PLR', MANUAL: 'Manual', IMPORTACAO: 'Saldo de abertura'};
  var ROT_STATUS = {ABERTO: ['info', 'Aberto'], PARCIAL: ['warn', 'Parcial'], QUITADO: ['ok', 'Quitado'], ABATIDO: ['mute', 'Abatido']};

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
  }
  function tentar() {
    if (!pronto.fatos || !pronto.fin) return;
    el('sDot').classList.add('on'); el('sTxt').textContent = 'Atualizado · ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
    render();
  }

  /* ── Abas ──────────────────────────────────────────────────────────────── */
  function render() {
    Array.prototype.forEach.call(document.querySelectorAll('.aba'), function(b) { b.setAttribute('aria-selected', b.dataset.aba === S.aba ? 'true' : 'false'); });
    var h = avisos.length ? '<div class="alerta warn"><div><b>Parte da base não carregou.</b> ' + avisos.map(e).join('<br>') + '</div></div>' : '';
    h += ({painel: abaPainel, pagar: function() { return abaTitulos('PAGAR'); }, receber: function() { return abaTitulos('RECEBER'); }, lotes: abaLotes,
      conciliacao: abaConciliacao, fluxo: abaFluxo, complementos: abaComplementos, cadastros: abaCadastros}[S.aba] || abaPainel)();
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
      '<button class="btn sm" data-manual="' + tipo + '">+ Título manual</button></div>';
    h += '<div class="tw"><table><thead><tr><th>Documento</th><th>' + (tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente') + '</th><th>Origem</th><th>Emissão</th><th>Próx. vencimento</th><th>Parcelas</th><th class="n">Valor</th><th class="n">Saldo</th><th>Situação</th><th></th></tr></thead><tbody>' +
      (lista.length ? lista.map(function(s) {
        var t = s.titulo, p = s.abertas[0], st = ROT_STATUS[s.status] || ['mute', s.status];
        var vencido = p && p.vencimento < hoje;
        return '<tr><td><a href="#" data-det="' + e(s.id) + '">' + e(t.documento || s.id) + '</a></td><td>' + e(t.parceiro && t.parceiro.nome) + '</td><td>' + e(ROT_ORIGEM[t.origem && t.origem.tipo] || (t.origem && t.origem.tipo)) + (t.origem && t.origem.pc ? ' <span class="mut">' + e(t.origem.pc) + '</span>' : '') + '</td>' +
          '<td>' + dataBR(t.emissao) + '</td><td>' + (s.semVencimento ? '<span class="tg warn">sem prazo</span>' : p ? '<span class="' + (vencido ? 'neg' : '') + '">' + dataBR(p.vencimento) + '</span>' + (p.de > 1 ? ' <span class="mut">' + p.n + '/' + p.de + '</span>' : '') : '—') + '</td>' +
          '<td>' + e(F.resumoParcelas(s)) + '</td><td class="n">' + brl(t.valorCentavos) + '</td><td class="n">' + brl(s.saldoCentavos) + '</td><td><span class="tg ' + st[0] + '">' + st[1] + '</span>' + (s.bloqueio ? ' <span class="tg bad">bloqueado</span>' : '') + '</td>' +
          '<td class="mini-acoes">' + (s.saldoCentavos > 0 ? '<button class="btn sm pri" data-baixar="' + e(s.id) + '">' + (tipo === 'PAGAR' ? 'Pagar' : 'Receber') + '</button>' : '') +
          (tipo === 'PAGAR' && s.saldoCentavos > 0 ? '<button class="btn sm" data-bloq="' + e(s.id) + '">' + (s.bloqueio ? 'Desbloquear' : 'Bloquear') + '</button>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="10"><div class="vazio"><b>Nenhum título ' + (S.filtro === 'abertos' ? 'em aberto' : 'neste filtro') + '.</b>' + (tipo === 'PAGAR' ? 'Títulos a pagar nascem dos recebimentos contra pedido de compra.' : 'Títulos a receber nascem das notas registradas nas cargas (Faturamento) — o faturamento ainda não opera neste banco.') + '</div></td></tr>') +
      '</tbody></table></div></div>';
    return h;
  }

  function detalhe(id) {
    var s = F.carteira(fin).filter(function(x) { return x.id === id; })[0]; if (!s) return;
    var t = s.titulo;
    var h = '<div class="tres"><div class="col"><div class="t">Valor</div><div class="v">' + brl(t.valorCentavos) + '</div></div><div class="col"><div class="t">Pago/recebido</div><div class="v">' + brl(s.pagoCentavos) + '</div></div><div class="col"><div class="t">Saldo</div><div class="v">' + brl(s.saldoCentavos) + '</div></div></div>';
    h += '<div class="linha-kv"><span>Origem</span><b>' + e(ROT_ORIGEM[t.origem && t.origem.tipo] || '') + ' ' + e(t.origem && (t.origem.pc || t.origem.nf || t.origem.ref) || '') + '</b></div>' +
      '<div class="linha-kv"><span>Parceiro</span><b>' + e(t.parceiro && t.parceiro.nome) + (t.parceiro && t.parceiro.cnpj ? ' · ' + e(t.parceiro.cnpj) : '') + '</b></div>' +
      '<div class="linha-kv"><span>Natureza</span><b>' + e(t.natureza) + '</b></div>' +
      '<div class="linha-kv"><span>Condição</span><b>' + e((fin.condicoes || {})[id] ? ((fin.condicoes[id].condicao || 'vence ' + dataBR(fin.condicoes[id].vencimento)) + ' (informada no Financeiro)') : (t.condicao || (t.vencimentoFixo ? 'vence ' + dataBR(t.vencimentoFixo) : '—')) + (t.condicaoFonte ? ' · ' + t.condicaoFonte : '')) + '</b></div>';
    if (s.avisos.length) h += '<div class="alerta warn" style="margin-top:10px"><div>' + s.avisos.map(e).join('<br>') + '</div></div>';
    if (s.semVencimento) h += '<div class="alerta warn" style="margin-top:10px"><div><b>Sem vencimento:</b> ' + e(s.motivoVencimento) + '. Informe a condição em <b>Complementos</b>.</div></div>';
    h += '<h3 style="margin-top:14px">Parcelas</h3><div class="tw"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th class="n">Valor</th><th class="n">Em aberto</th></tr></thead><tbody>' +
      (s.parcelas.length ? s.parcelas.map(function(p) { var ab = s.abertas.filter(function(a) { return a.n === p.n; })[0]; return '<tr><td>' + p.n + '/' + p.de + (p.tipo !== 'PRAZO' ? ' <span class="mut">' + e(p.tipo) + '</span>' : '') + '</td><td>' + dataBR(p.vencimento) + '</td><td class="n">' + brl(p.valorCentavos) + '</td><td class="n">' + brl(ab ? ab.abertoCentavos : 0) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="mut">Sem parcelas (sem condição).</td></tr>') + '</tbody></table></div>';
    var estornadas = {}; s.baixas.forEach(function(x) { if (x.tipo === 'ESTORNO') estornadas[x.estorna] = true; });
    h += '<h3 style="margin-top:14px">Baixas e abatimentos</h3><div class="tw"><table><thead><tr><th>Data</th><th>Tipo</th><th class="n">Principal</th><th class="n">Juros+multa</th><th class="n">Desconto</th><th>Conta</th><th></th></tr></thead><tbody>' +
      s.baixas.map(function(x) { return '<tr><td>' + dataBR(x.data) + '</td><td>' + (x.tipo === 'ESTORNO' ? '<span class="tg bad">Estorno</span> ' + e(x.motivo || '') : 'Baixa' + (x.loteKey ? ' (lote)' : '')) + '</td><td class="n">' + brl(x.valorCentavos) + '</td><td class="n">' + brl(num(x.jurosCentavos) + num(x.multaCentavos)) + '</td><td class="n">' + brl(x.descontoCentavos) + '</td><td>' + e(((fin.contas_bancarias || {})[x.conta] || {}).nome || x.conta) + '</td><td>' + (x.tipo === 'BAIXA' && !estornadas[x.id] ? '<button class="btn sm perigo" data-estornar="' + e(x.id) + '">Estornar</button>' : '') + '</td></tr>'; }).join('') +
      s.abatimentos.map(function(a) { return '<tr><td>' + dataBR(a.data) + '</td><td><span class="tg mute">Abatimento</span> ' + e(a.motivo) + '</td><td class="n">' + brl(a.valorCentavos) + '</td><td></td><td></td><td></td><td></td></tr>'; }).join('') +
      (!s.baixas.length && !s.abatimentos.length ? '<tr><td colspan="7" class="mut">Nenhuma.</td></tr>' : '') + '</tbody></table></div>';
    if (t.itens && t.itens.length) h += '<h3 style="margin-top:14px">Itens da nota</h3><div class="tw"><table><thead><tr><th>SKU</th><th>Lote</th><th class="n">Unidades</th><th class="n">Valor</th></tr></thead><tbody>' + t.itens.map(function(i) { return '<tr><td>' + e(i.sku) + '</td><td>' + e(i.lote) + '</td><td class="n">' + num(i.unidades).toLocaleString('pt-BR') + '</td><td class="n">' + brl(i.valorCentavos) + '</td></tr>'; }).join('') + '</tbody></table></div>';
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
        if (c) cell = '<span class="tg ok">conciliada</span> <span class="mut">' + e(c.baixa) + '</span>';
        else {
          var sug = F.sugerirConciliacao(l, base(), S.extratoConta, num((fin.parametros || {}).toleranciaConciliacaoDias) || 3).candidatos;
          cell = !sug.length ? '<span class="tg warn">sem par</span> <span class="mut">lance o título (manual) ou confira a data</span>'
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
  function abaFluxo() {
    var fl = F.fluxoDeCaixa(base(), hojeISO(), 13);
    return '<div class="card"><h3>Fluxo de caixa — 4 semanas realizadas e 13 projetadas</h3><div class="sub" style="margin-bottom:10px">Título é <b>fato</b> (recebimento, nota, operação); "previsto" é <b>expectativa</b> (pedido de compra ainda não recebido e carteira comercial ainda não faturada) e aparece separado. Valor sem data fica de fora do saldo projetado — inventar data daria um caixa preciso e falso.</div>' + tabelaFluxo(fl, false) + '</div>';
  }

  function abaComplementos() {
    var lista = F.complementos(base());
    var rot = {SEM_VALOR: ['bad', 'Sem valor'], SEM_VENCIMENTO: ['warn', 'Sem prazo'], DIFERENCA_FISCAL: ['info', 'Diferença fiscal']};
    return '<div class="card"><h3>Complementos</h3><div class="sub" style="margin-bottom:10px">O que a derivação não completou sozinha. Nenhum outro módulo é alterado: o Financeiro resolve aqui. Corrigido na origem (ex.: preço no PC), o item some sozinho na próxima rodada.</div>' +
      '<div class="tw"><table><thead><tr><th>Tipo</th><th>O que falta</th><th class="n">Valor</th><th>Resolver</th></tr></thead><tbody>' +
      (lista.length ? lista.map(function(c) {
        var r = rot[c.tipo] || ['mute', c.tipo], acao;
        if (c.tipo === 'SEM_VENCIMENTO') acao = '<div class="mini-acoes"><input class="inp" style="width:130px" placeholder="ex.: 28/42" data-cond-txt="' + e(c.titulo) + '"><span class="mut">ou</span><input class="inp" type="date" data-cond-venc="' + e(c.titulo) + '"><button class="btn sm pri" data-cond-ok="' + e(c.titulo) + '">Salvar</button></div>';
        else acao = '<button class="btn sm" data-manual="' + (c.origem && c.origem.tipo === 'RECEBIMENTO' ? 'PAGAR' : 'RECEBER') + '">Lançar título manual</button> <span class="mut">' + e(c.acao) + '</span>';
        return '<tr><td><span class="tg ' + r[0] + '">' + r[1] + '</span></td><td>' + e(c.texto) + '</td><td class="n">' + brl(c.valorCentavos) + '</td><td>' + acao + '</td></tr>';
      }).join('') : '<tr><td colspan="4"><div class="vazio"><b>Nada pendente.</b>Todos os fatos viraram títulos com valor e prazo.</div></td></tr>') + '</tbody></table></div></div>';
  }

  function abaCadastros() {
    var cs = fin.contas_bancarias || {}, par = fin.parametros || {};
    var h = '<div class="grid2"><div class="card"><h3>Contas bancárias</h3><div class="tw"><table><thead><tr><th>Conta</th><th>Saldo inicial</th><th>Em</th><th class="n">Saldo hoje</th></tr></thead><tbody>' +
      (Object.keys(cs).length ? Object.keys(cs).map(function(k) { var sb = F.saldosBancarios(fin, hojeISO())[k]; return '<tr><td>' + e(cs[k].nome) + ' <span class="mut">' + e([cs[k].banco, cs[k].agencia, cs[k].numero].filter(Boolean).join(' · ')) + '</span></td><td>' + brl(cs[k].saldoInicialCentavos) + '</td><td>' + dataBR(cs[k].dataSaldoInicial) + '</td><td class="n">' + brl(sb && sb.saldoCentavos) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="mut">Nenhuma.</td></tr>') +
      '</tbody></table></div><div class="form" style="margin-top:12px"><div><label for="cbNome">Nome</label><input class="inp" id="cbNome" placeholder="Itaú movimento"></div><div><label for="cbBanco">Banco / agência / conta</label><input class="inp" id="cbBanco" placeholder="341 · 0001 · 12345-6"></div>' +
      '<div><label for="cbSaldo">Saldo inicial (R$)</label><input class="inp" id="cbSaldo" placeholder="0,00"></div><div><label for="cbData">Data do saldo</label><input class="inp" type="date" id="cbData" value="' + hojeISO() + '"></div></div>' +
      '<div style="margin-top:10px"><button class="btn pri sm" id="cbSalvar">Adicionar conta</button> <span class="dica">O saldo inicial vira lançamento de abertura na Controladoria. Corrigir depois = nova conta ou ajuste, não edição.</span></div></div>';
    h += '<div class="card"><h3>Parâmetros</h3><div class="form"><div><label for="pFolha">Folha vence no dia (mês seguinte)</label><input class="inp" id="pFolha" type="number" min="1" max="28" value="' + e(par.vencimentoFolhaDia || 5) + '"></div>' +
      '<div><label for="pFixos">Custos fixos vencem no dia (mês seguinte)</label><input class="inp" id="pFixos" type="number" min="1" max="28" value="' + e(par.vencimentoFixosDia || 10) + '"></div>' +
      '<div><label for="pTol">Tolerância da conciliação (dias)</label><input class="inp" id="pTol" type="number" min="0" max="15" value="' + e(par.toleranciaConciliacaoDias || 3) + '"></div></div>' +
      '<div style="margin-top:10px"><button class="btn sm" id="pSalvar">Salvar parâmetros</button></div></div></div>';
    h += '<div class="card"><h3>Importar títulos em aberto (planilha)</h3><div class="sub" style="margin-bottom:8px">Para começar com a carteira de hoje. Cole do Excel uma linha por título: <code>tipo;parceiro;cnpj;documento;emissão;vencimento;valor;natureza</code> (tipo PAGAR ou RECEBER, datas DD/MM/AAAA, valor 1.234,56). Entra como <b>saldo de abertura</b>. Importar a mesma linha de novo não duplica.</div>' +
      '<textarea class="inp" id="impTxt" rows="6" style="width:100%;font-family:monospace"></textarea><div style="margin-top:8px;display:flex;gap:8px;align-items:center"><button class="btn sm" id="impVer">Conferir</button><button class="btn pri sm" id="impOk" disabled>Importar</button><span id="impRes" class="mut"></span></div>' +
      '<div class="dica">Naturezas: ' + F.NATUREZAS.join(', ') + '.</div></div>';
    return h;
  }
  function formManual(tipo) {
    var h = '<div class="form"><div><label for="mParc">' + (tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente') + '</label><input class="inp" id="mParc"></div><div><label for="mCnpj">CNPJ</label><input class="inp" id="mCnpj"></div>' +
      '<div><label for="mDoc">Documento</label><input class="inp" id="mDoc" placeholder="NF 123"></div><div><label for="mValor">Valor (R$)</label><input class="inp" id="mValor"></div>' +
      '<div><label for="mEmi">Emissão</label><input class="inp" type="date" id="mEmi" value="' + hojeISO() + '"></div><div><label for="mVenc">Vencimento único</label><input class="inp" type="date" id="mVenc"><div class="dica">Preenchido, vale ele e o parcelamento é ignorado.</div></div>' +
      '<div><label for="mNParc">Nº de parcelas</label><input class="inp" type="number" inputmode="numeric" min="1" max="60" id="mNParc" placeholder="2"></div>' +
      '<div><label for="mPrim">1º vencimento (dias)</label><input class="inp" type="number" inputmode="numeric" min="0" max="365" id="mPrim" value="30"></div>' +
      '<div><label for="mInt">Intervalo (dias)</label><input class="inp" type="number" inputmode="numeric" min="1" max="365" id="mInt" value="30"></div>' +
      '<div><label for="mCond">Condição</label><input class="inp" id="mCond" placeholder="30/60 ou 2x 30/60"><div class="dica">Montada pelos campos ao lado, ou digite (ex.: 2x 30/60, 3x, 20% à vista, 30/45).</div></div>' +
      '<div style="grid-column:1/-1" id="mPrev" aria-live="polite"></div>' +
      '<div><label for="mNat">Natureza</label><select class="sel" id="mNat">' + F.NATUREZAS.map(function(n) { return '<option' + ((tipo === 'RECEBER' ? 'RECEITA_VENDA' : 'OUTROS') === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
      '<div style="grid-column:1/-1"><label for="mHist">Histórico</label><input class="inp" id="mHist"></div></div>' +
      '<div style="margin-top:12px"><button class="btn pri" id="mOk" data-tipo="' + tipo + '">Lançar</button> <span class="dica">Título manual vira lançamento na Controladoria pela natureza.</span></div>';
    abrir('Título ' + (tipo === 'PAGAR' ? 'a pagar' : 'a receber') + ' manual', h);
    previaManual();
  }
  function linhaManual(tipo) {
    return {tipo: tipo, parceiro: el('mParc').value, cnpj: el('mCnpj').value, documento: el('mDoc').value, valor: el('mValor').value, emissao: el('mEmi').value,
      vencimento: el('mVenc').value || null, condicao: el('mCond').value, natureza: el('mNat').value, historico: el('mHist').value};
  }
  // Prévia das parcelas (n/de, vencimento, valor) pelo mesmo motor que o servidor usa.
  function previaManual() {
    var alvo = el('mPrev'); if (!alvo) return;
    var p = F.previaParcelas(linhaManual(''));
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
    if (t.classList.contains('aba')) { S.aba = d.aba; S.q = ''; render(); return; }
    if (t.id === 'btnRecarregar') { lerFatos(); return; }
    if (d.det) { ev.preventDefault(); detalhe(d.det); return; }
    if (d.baixar) { formBaixa(d.baixar); return; }
    if (d.manual) { formManual(d.manual); return; }
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
      travar(t, db.ref('fin/contas_bancarias/' + k).set({nome: nome, banco: partes[0] || null, agencia: partes[1] || null, numero: partes[2] || null,
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
      var v = F.validarTituloManual(linha, 'MANUAL'); if (!v.ok) { toast(v.motivo); return; }
      travar(t, chamar('finLancarTitulos', {origem: 'MANUAL', titulos: [linha]})).then(function(res) { fechar(); toast(res.criados ? 'Título lançado.' : 'Já existia um título igual.'); });
      return;
    }
  });
  document.addEventListener('change', function(ev) {
    var t = ev.target, d = t.dataset;
    if (t.id === 'fFiltro') { S.filtro = t.value; render(); }
    if (d.sel) { if (t.checked) S.sel[d.sel] = Number(d.valor); else delete S.sel[d.sel]; render(); }
    if (t.id === 'ltConta') { S.conta = t.value; render(); }
    if (t.id === 'exConta') { S.extratoConta = t.value; render(); }
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
    if (id !== 'qTit') return;
    clearTimeout(tBusca);
    var t = ev.target;
    tBusca = setTimeout(function() { S.q = t.value; var pos = t.selectionStart; render(); var n = el('qTit'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ok */ } } }, 250);
  });

  var iniciado = false;
  function iniciar() { if (iniciado) return; iniciado = true; lerFatos(); escutar(); }
  if (window.currentUser) iniciar(); else window.addEventListener('kuryos-auth-pronto', iniciar);
})();
