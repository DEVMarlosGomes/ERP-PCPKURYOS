'use strict';
/* Remontar palete e planejar a carga por rota — tela (Montar carga, 16/11/2026).
   Motor em shared/remontar-palete.js. Usa o estado da grade de
   shared/expedicao-grade-tela.js (base, agendas, agendaDoPalete, selecionados,
   renderPaletes, aviso, e, num, el, db, hoje, idLinha, chaveClienteExp). */
(function() {
  function autor() { return (window.currentUser && (window.currentUser.nome || window.currentUser.email)) || 'Logística'; }
  function emCarga(i, l) { return !!agendaDoPalete(i + '/' + l); }
  function fundoModal(html) {
    var bg = document.createElement('div');
    bg.className = 'rm-fundo';
    bg.innerHTML = '<div class="rm-caixa">' + html + '</div>';
    document.body.appendChild(bg);
    bg.addEventListener('keydown', function(ev) { if (ev.key === 'Escape') bg.remove(); });
    return bg;
  }
  // Todos os registros com saldo, fora de carga: candidatos a destino.
  function registrosComSaldo(excetoK) {
    var out = [];
    Object.keys(base.estoque_lotes || {}).forEach(function(i) {
      Object.keys(base.estoque_lotes[i] || {}).forEach(function(k) {
        var l = base.estoque_lotes[i][k];
        if (!l || !(Number(l.saldoLote) > 0) || i + '/' + k === excetoK || emCarga(i, k) || l.itemTipo && l.itemTipo !== 'produto') return;
        out.push({itemKey: i, loteKey: k, lote: l});
      });
    });
    return out.sort(function(a, b) { return String(a.lote.identificadorPalete || a.loteKey).localeCompare(String(b.lote.identificadorPalete || b.loteKey), 'pt-BR', {numeric: true}); });
  }

  /* ── Remontar um palete ──────────────────────────────────────────── */
  window.abrirRemontar = function(k) {
    var ids = k.split('/'), lote = ((base.estoque_lotes[ids[0]] || {})[ids[1]]) || null;
    if (!lote) return aviso('Palete não encontrado.', true);
    if (agendaDoPalete(k)) return aviso('Este palete está numa carga agendada. Tire-o da carga (Acompanhamento › Editar paletes) antes de remontar.', true);
    var c = RemontarPalete.composicao(lote);
    if (!c) return aviso('A composição deste palete não fecha com o saldo. Corrija antes de remontar.', true);
    var opcoes = registrosComSaldo(k).map(function(r) {
      return '<option value="' + e(r.itemKey + '/' + r.loteKey) + '">' + e((r.lote.identificadorPalete || r.loteKey) + ' · ' + (r.lote.itemCodigo || '') + ' · lote ' +
        (r.lote.opLote || r.lote.loteOrigem || '—') + ' · ' + num(r.lote.saldoLote) + ' un · ' + (r.lote.enderecoCodigo || 'sem endereço')) + '</option>';
    }).join('');
    var gravando = false;
    var bg = fundoModal(
      '<h2>Remontar palete</h2>' +
      '<div class="sub">' + e(lote.itemCodigo) + ' — ' + e(lote.itemNome || '') + ' · lote ' + e(lote.opLote || lote.loteOrigem || '—') + ' · palete <b>' + e(lote.identificadorPalete || ids[1]) + '</b><br>' +
        'Hoje: <b>' + num(c.caixas) + ' cx × ' + num(c.multiplo || 0) + (c.parcial ? ' + 1 parcial de ' + num(c.parcial) + ' un' : '') + ' = ' + num(c.saldo) + ' un</b> · ' + e(lote.enderecoCodigo || 'sem endereço') + '</div>' +
      '<div class="rm-grid"><label>Caixas a tirar deste palete<input type="number" id="rmCaixas" min="0" max="' + c.caixas + '" step="1" value=""></label>' +
        (c.parcial ? '<label class="check" style="align-self:end"><input type="checkbox" id="rmParcial"> levar a caixa parcial (' + num(c.parcial) + ' un)</label>' : '<div></div>') + '</div>' +
      '<fieldset class="rm-dest"><legend>Para onde vão as caixas</legend>' +
        '<label class="check"><input type="radio" name="rmDest" value="NOVO" checked> Palete novo <input type="text" id="rmNovoId" maxlength="40" placeholder="identificação (opcional, ex.: R-PF-01)"></label>' +
        '<label class="check"><input type="radio" name="rmDest" value="REGISTRO"' + (opcoes ? '' : ' disabled') + '> Palete que já existe ' +
          '<select id="rmRegistro"' + (opcoes ? '' : ' disabled') + '>' + (opcoes || '<option>nenhum palete livre</option>') + '</select></label>' +
        '<div class="sub">Mesmo lote e mesma condição: as caixas juntam no registro. Lote ou produto diferente: o palete vira <b>misto</b>, com cada lote rastreado separado.</div>' +
      '</fieldset>' +
      '<label>Motivo<input type="text" id="rmMotivo" maxlength="200" value="Remontagem para o frete do cliente"></label>' +
      '<div id="rmMsg" class="sub" style="font-weight:700;margin-top:8px"></div><div id="rmErro" class="sub" style="color:#d03b3b"></div>' +
      '<div class="rm-acoes"><button type="button" class="btn ghost" id="rmFechar">Cancelar</button><button type="button" class="btn" id="rmOk" disabled>Remontar</button></div>');
    function req() {
      var tipo = (bg.querySelector('[name="rmDest"]:checked') || {}).value;
      var dest = tipo === 'REGISTRO' ? (function() { var v = el('rmRegistro').value.split('/'); return {tipo: 'REGISTRO', itemKey: v[0], loteKey: v[1]}; })()
        : {tipo: 'NOVO', identificador: el('rmNovoId').value.trim() || undefined};
      return {itemKey: ids[0], loteKey: ids[1], caixas: el('rmCaixas').value, parcial: !!(el('rmParcial') && el('rmParcial').checked), destino: dest};
    }
    function validar() {
      try {
        var p = RemontarPalete.planejar({estoque_lotes: base.estoque_lotes}, req(), {emCarga: emCarga});
        el('rmMsg').style.color = '#176b40';
        el('rmMsg').textContent = 'Move ' + num(p.qtd) + ' un (' + num(p.caixas) + ' cx' + (p.parcial ? ' + parcial de ' + num(p.parcial) + ' un' : '') + ') para ' + p.identificadorDestino +
          (p.juntou ? ' (junta no mesmo lote)' : p.destinoNovo && p.destinoNovo.remontagem && p.destinoNovo.remontagem.paleteMisto ? ' (palete misto)' : ' (palete novo)') +
          '. Fica no original: ' + num(p.origemDepois.caixasFechadas) + ' cx' + (p.origemDepois.unidadesCaixaParcial ? ' + parcial' : '') + ' = ' + num(p.origemDepois.saldoLote) + ' un.';
        el('rmOk').disabled = gravando;
      } catch (err) { el('rmMsg').style.color = '#9a6700'; el('rmMsg').textContent = err.message; el('rmOk').disabled = true; }
    }
    bg.querySelectorAll('input,select').forEach(function(x) { x.addEventListener('input', validar); x.addEventListener('change', validar); });
    el('rmFechar').onclick = function() { bg.remove(); };
    el('rmOk').onclick = function() {
      if (gravando) return; gravando = true; el('rmOk').disabled = true; el('rmErro').textContent = '';
      RemontarPalete.executar(db, req(), {autor: autor(), motivo: el('rmMotivo').value, emCarga: emCarga, todosLotes: base.estoque_lotes,
        operacaoId: 'rm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)}).then(function(p) {
        bg.remove(); delete selecionados[k];
        aviso('Palete remontado: ' + num(p.qtd) + ' un de ' + (lote.identificadorPalete || ids[1]) + ' para ' + p.identificadorDestino + '. O total do lote não mudou.');
      }).catch(function(err) { gravando = false; el('rmErro').textContent = err.message || 'Não foi possível remontar.'; validar(); });
    };
    el('rmCaixas').focus();
    validar();
  };

  /* ── Planejar a carga por rota ──────────────────────────────────── */
  var rotas = [{nome: 'PF', caixas: {}}, {nome: 'GVT', caixas: {}}], ultimoPlano = null, executando = false;
  function paletesDoCliente() {
    var filtro = el('filtroCliente').value;
    if (!filtro || !window.ExpedicaoPA) return null;
    return ExpedicaoPA.listar(base, hoje()).filter(function(l) {
      return l.disponivel && !agendaDoPalete(idLinha(l)) && chaveClienteExp(l.cliente) === filtro;
    });
  }
  function desenharPlano() {
    var box = el('planoRotasCorpo');
    if (!box) return;
    var ls = paletesDoCliente();
    if (!ls) { box.innerHTML = '<div class="sub">Escolha um <b>cliente</b> no filtro da grade acima para planejar as rotas da carga dele.</div>'; return; }
    var skus = {};
    ls.forEach(function(l) { var c = RemontarPalete.composicao(l.lote); if (!c) return; var s = l.lote.itemCodigo; (skus[s] = skus[s] || {nome: l.lote.itemNome || '', caixas: 0, paletes: 0}); skus[s].caixas += c.caixas; skus[s].paletes++; });
    var lista = Object.keys(skus).sort();
    if (!lista.length) { box.innerHTML = '<div class="sub">Este cliente não tem paletes liberados fora de carga.</div>'; return; }
    box.innerHTML = '<div class="table-wrap"><table class="rm-plano"><thead><tr><th>Produto</th><th class="numeric">Caixas livres</th>' +
      rotas.map(function(r, i) { return '<th><input type="text" data-rota-nome="' + i + '" value="' + e(r.nome) + '" maxlength="12" aria-label="Nome da rota ' + (i + 1) + '"></th>'; }).join('') +
      '<th class="numeric">Sobra</th></tr></thead><tbody>' +
      lista.map(function(s) {
        var pedido = rotas.reduce(function(t, r) { return t + (Number(r.caixas[s]) || 0); }, 0), sobra = skus[s].caixas - pedido;
        return '<tr><td><b>' + e(s) + '</b><div class="sub">' + e(skus[s].nome) + ' · ' + num(skus[s].paletes) + ' palete(s)</div></td><td class="numeric">' + num(skus[s].caixas) + '</td>' +
          rotas.map(function(r, i) { return '<td><input type="number" min="0" step="1" data-rota="' + i + '" data-sku="' + e(s) + '" value="' + e(r.caixas[s] || '') + '" aria-label="Caixas de ' + e(s) + ' na rota ' + e(r.nome) + '"></td>'; }).join('') +
          '<td class="numeric" style="font-weight:700;color:' + (sobra < 0 ? '#d03b3b' : 'inherit') + '">' + num(sobra) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="rm-acoes" style="justify-content:flex-start"><button type="button" class="btn ghost" id="rotaMais"' + (rotas.length >= 6 ? ' disabled' : '') + '>+ Rota</button>' +
        (rotas.length > 1 ? '<button type="button" class="btn ghost" id="rotaMenos">− Rota</button>' : '') +
        '<button type="button" class="btn" id="rotaCalcular">Calcular remontagem</button></div><div id="rotaResultado"></div>';
    box.querySelectorAll('[data-rota]').forEach(function(x) { x.oninput = function() { rotas[Number(x.dataset.rota)].caixas[x.dataset.sku] = x.value; ultimoPlano = null; desenharSobras(lista, skus); }; });
    box.querySelectorAll('[data-rota-nome]').forEach(function(x) { x.oninput = function() { rotas[Number(x.dataset.rotaNome)].nome = x.value; ultimoPlano = null; }; });
    el('rotaMais').onclick = function() { rotas.push({nome: 'ROTA' + (rotas.length + 1), caixas: {}}); desenharPlano(); };
    if (el('rotaMenos')) el('rotaMenos').onclick = function() { rotas.pop(); desenharPlano(); };
    el('rotaCalcular').onclick = calcular;
    if (ultimoPlano) desenharResultado();
  }
  function desenharSobras(lista, skus) {
    var linhas = el('planoRotasCorpo').querySelectorAll('tbody tr');
    lista.forEach(function(s, i) {
      var pedido = rotas.reduce(function(t, r) { return t + (Number(r.caixas[s]) || 0); }, 0), sobra = skus[s].caixas - pedido, td = linhas[i].lastChild;
      td.textContent = num(sobra); td.style.color = sobra < 0 ? '#d03b3b' : 'inherit';
    });
  }
  function calcular() {
    var ls = paletesDoCliente() || [];
    ultimoPlano = RemontarPalete.planejarRotas(ls.map(function(l) { return {itemKey: l.itemKey, loteKey: l.loteKey, lote: l.lote}; }), rotas);
    desenharResultado();
  }
  function desenharResultado() {
    var p = ultimoPlano, box = el('rotaResultado');
    if (!p || !box) return;
    var faltas = p.skus.filter(function(s) { return s.sobra < 0; });
    box.innerHTML = (faltas.length ? '<div class="aviso-rnc">Falta caixa: ' + e(faltas.map(function(s) { return s.sku + ' (' + num(-s.sobra) + ' cx)'; }).join(', ')) + '. O plano atende o que existe.</div>' : '') +
      p.rotas.map(function(r) {
        return '<div class="rm-rota"><h3>Rota ' + e(r.nome) + ' · ' + num(r.caixas) + ' cx</h3>' +
          (r.inteiros.length ? '<div><b>Paletes inteiros:</b> ' + e(r.inteiros.map(function(x) { return x.identificador + ' (' + x.sku + ', ' + x.caixas + ' cx' + (x.parcial ? ' + parcial' : '') + ')'; }).join(' · ')) + '</div>' : '') +
          (r.transferencias.length ? '<div><b>Tirar caixas:</b> ' + e(r.transferencias.map(function(x) { return x.caixas + ' cx de ' + x.identificador + ' → ' + x.destino; }).join(' · ')) + '</div>' : '') +
          (!r.inteiros.length && !r.transferencias.length ? '<div class="sub">Nada para esta rota.</div>' : '') +
          '<button type="button" class="btn ghost" data-selecionar-rota="' + e(r.nome) + '">Selecionar os paletes desta rota</button></div>';
      }).join('') +
      '<div class="sub">Sobra (3ª rota): ' + e(p.skus.map(function(s) { return s.sku + ' ' + num(Math.max(s.sobra, 0)) + ' cx'; }).join(' · ')) + '</div>' +
      '<div class="rm-acoes" style="justify-content:flex-start"><button type="button" class="btn" id="rotaExecutar"' + (!p.operacoes.length || executando ? ' disabled' : '') + '>' +
        (p.operacoes.length ? 'Executar as ' + num(p.operacoes.length) + ' transferência(s)' : 'Nenhuma transferência necessária') + '</button><span id="rotaProgresso" class="sub"></span></div>';
    var exec = el('rotaExecutar');
    if (exec) exec.onclick = executarPlano;
    box.querySelectorAll('[data-selecionar-rota]').forEach(function(b) { b.onclick = function() { selecionarRota(b.dataset.selecionarRota); }; });
  }
  function executarPlano() {
    if (!ultimoPlano || executando) return;
    if (!confirm('Executar ' + ultimoPlano.operacoes.length + ' transferência(s) de caixas entre paletes? O total de cada lote não muda; cada transferência fica no histórico.')) return;
    executando = true; el('rotaExecutar').disabled = true;
    var ops = ultimoPlano.operacoes.slice(), feitas = 0;
    (function proxima() {
      if (!ops.length) {
        executando = false;
        aviso('Remontagem concluída: ' + feitas + ' transferência(s). Use "Selecionar os paletes desta rota" para montar cada carga.');
        setTimeout(calcular, 800);  // espera o estoque novo chegar pela escuta
        return;
      }
      var o = ops.shift();
      el('rotaProgresso').textContent = ' ' + (feitas + 1) + ' de ' + (feitas + ops.length + 1) + ': ' + o.caixas + ' cx de ' + o.de + ' → ' + o.destino.identificador;
      RemontarPalete.executar(db, {itemKey: o.itemKey, loteKey: o.loteKey, caixas: o.caixas, parcial: false, destino: o.destino},
        {autor: autor(), motivo: 'Remontagem por rota (' + o.rota + ')', emCarga: emCarga, operacaoId: 'rm_' + Date.now().toString(36) + '_' + feitas}).then(function() {
        feitas++; proxima();
      }).catch(function(err) {
        executando = false;
        aviso('Parou na transferência ' + (feitas + 1) + ' (' + o.de + '): ' + (err.message || err) + ' As ' + feitas + ' anteriores ficaram gravadas. Recalcule e continue.', true);
        setTimeout(calcular, 800);
      });
    })();
  }
  function selecionarRota(nome) {
    var ls = paletesDoCliente() || [], r = (ultimoPlano && ultimoPlano.rotas.find(function(x) { return x.nome === nome; })) || {inteiros: []};
    var inteiros = {}; r.inteiros.forEach(function(x) { inteiros[x.itemKey + '/' + x.loteKey] = true; });
    var prefixo = ('R-' + nome + '-').toUpperCase();
    Object.keys(selecionados).forEach(function(k) { delete selecionados[k]; });
    ls.forEach(function(l) { if (inteiros[idLinha(l)] || String(l.lote.identificadorPalete || '').toUpperCase().indexOf(prefixo) === 0) selecionados[idLinha(l)] = l; });
    renderPaletes();
    aviso(Object.keys(selecionados).length + ' palete(s) da rota ' + nome + ' selecionado(s). Confira o resumo e agende a carga.');
    var f = el('formCarga'); if (f && f.scrollIntoView) f.scrollIntoView({block: 'start'});
  }
  window.desenharPlanoRotas = desenharPlano;
  el('filtroCliente').addEventListener('change', function() { ultimoPlano = null; desenharPlano(); });
  var aberto = false;
  el('planoRotasAbrir').onclick = function() { aberto = !aberto; el('planoRotasCorpo').style.display = aberto ? '' : 'none'; this.textContent = aberto ? 'Fechar' : 'Planejar'; if (aberto) desenharPlano(); };
})();
