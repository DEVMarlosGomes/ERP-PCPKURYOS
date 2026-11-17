/* Remontar e desmembrar os paletes de uma carga no FATURAMENTO — só ADM (17/11/2026).

   Pedido do usuário: "coloque a parte de remontar e desmembrar carga para
   administradores na aba faturamento também". Em Montar carga, remontar e
   desmembrar só valem para palete FORA de carga (a carga guarda o palete pela
   chave e pela quantidade). Aqui o ADM mexe no palete que JÁ está na carga e,
   no mesmo gesto, a carga é atualizada pela callable de sempre
   (salvarAgendamentoExpedicaoPA, editarPaletes), que confere tudo de novo e
   guarda antes/depois e o motivo na linha do tempo:
     1. o estoque muda pelos motores de sempre (DesmembrarPalete / RemontarPalete);
     2. a carga passa a ter as quantidades novas (+ os paletes que entram).
   Se o passo 2 falhar, o card mostra "Atualizar a carga ao estoque" (o mesmo
   passo 2, de novo) -- a carga nunca fica muda e errada.
   Mesmas travas do servidor: carga AGENDADA, sem viagem e sem NF
   (CargasPA.acoes(a).editarPaletes). Com faturamento já solicitado, a
   solicitação fica desatualizada e precisa ser refeita antes da NF.
   Funções puras testadas em run_faturamento_paletes_adm_test.js. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FaturamentoPaletesAdm = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function ehAdmin(u) { return !!u && (u.role === 'admin' || !!(u.funcoes && u.funcoes.admin === true)); }
  function ref(p) { return p.itemKey + '/' + p.loteKey; }
  function loteDe(lotes, itemKey, loteKey) { return ((lotes || {})[itemKey] || {})[loteKey] || null; }
  function pendente(p) { return Math.max(Number(p.quantidade || 0) - Number(p.embarcado || 0), 0); }
  function ativa(a) { return !!a && (a.status === 'AGENDADO' || a.status === 'EXPEDIDO_PARCIAL'); }

  // Palete preso em OUTRA carga ativa (a desta carga pode ser mexida aqui).
  function emOutraCarga(agendas, agendaKey, itemKey, loteKey) {
    var k = itemKey + '/' + loteKey;
    return Object.keys(agendas || {}).some(function(x) {
      var a = agendas[x];
      return x !== agendaKey && ativa(a) && (a.paletes || []).some(function(p) { return ref(p) === k && pendente(p) > 0; });
    });
  }

  /* Paletes da carga como o servidor espera, a partir do estoque ATUAL:
     quantidade = saldo do palete; palete zerado sai; `extras` entram com o
     vínculo de pedido do palete de onde vieram (`modeloRef`), porque o palete
     novo é cópia dele. Devolve {paletes, removidos, erro}. */
  function paletesDepois(a, lotes, extras) {
    var vistos = {}, out = [], removidos = [], porRef = {};
    (a.paletes || []).forEach(function(p) { porRef[ref(p)] = p; });
    function incluir(itemKey, loteKey, skuPedidoKey, nome) {
      var k = itemKey + '/' + loteKey;
      if (vistos[k]) return;
      vistos[k] = true;
      var l = loteDe(lotes, itemKey, loteKey);
      if (!l || !(Number(l.saldoLote) > 0)) { removidos.push(nome || k); return; }
      out.push({itemKey: itemKey, loteKey: loteKey, quantidade: Number(l.saldoLote), enderecoKey: l.enderecoKey, skuPedidoKey: skuPedidoKey});
    }
    (a.paletes || []).forEach(function(p) { incluir(p.itemKey, p.loteKey, p.skuPedidoKey, p.identificadorPalete); });
    (extras || []).forEach(function(x) {
      var modelo = porRef[x.modeloRef] || {};
      incluir(x.itemKey, x.loteKey, x.skuPedidoKey || modelo.skuPedidoKey, x.identificador);
    });
    return {paletes: out, removidos: removidos, erro: out.length ? null : 'A carga ficaria sem paletes. Para desfazer a carga, cancele-a no Acompanhamento.'};
  }

  // Carga descasada do estoque (passo 2 que falhou, ou mudança por fora).
  function divergencias(a, lotes) {
    return (a.paletes || []).filter(function(p) {
      var l = loteDe(lotes, p.itemKey, p.loteKey);
      return !l || Number(l.saldoLote) !== Number(p.quantidade) || (l.enderecoKey || null) !== (p.enderecoKey || null);
    }).map(function(p) {
      var l = loteDe(lotes, p.itemKey, p.loteKey);
      return {palete: p.identificadorPalete || p.loteKey, naCarga: Number(p.quantidade) || 0, noEstoque: l ? Number(l.saldoLote) || 0 : 0};
    });
  }

  /* ── Tela (só no navegador) ─────────────────────────────────────────── */
  function tela(ctx) {
    // ctx: {agendas(), lotes(), aviso(html, erro), render()}
    var db = firebase.database(), fn = firebase.functions();
    var ocupado = false;
    function el(id) { return document.getElementById(id); }
    function e(v) { return escapeHtml(String(v == null ? '' : v)); }
    function num(v) { return Number(v || 0).toLocaleString('pt-BR'); }
    function autor() { return (window.currentUser && (window.currentUser.nome || window.currentUser.email)) || 'ADM'; }
    function modal(html) {
      var bg = document.createElement('div');
      bg.className = 'rm-fundo';
      bg.innerHTML = '<div class="rm-caixa" role="document">' + html + '</div>';
      document.body.appendChild(bg);
      bg.addEventListener('keydown', function(ev) { if (ev.key === 'Escape' && !ocupado) bg.remove(); });
      return bg;
    }
    function lotesFrescos(itemKeys) {
      var copia = Object.assign({}, ctx.lotes());
      return Promise.all(itemKeys.map(function(i) {
        return db.ref('estoque_lotes/' + i).once('value').then(function(s) { copia[i] = s.val() || {}; });
      })).then(function() { return copia; });
    }

    // Passo 2: a carga passa a refletir o estoque (+ extras).
    function salvarCarga(agendaKey, extras, motivo, itemKeys) {
      var a = ctx.agendas()[agendaKey];
      if (!a) return Promise.reject(new Error('Carga não encontrada.'));
      return lotesFrescos(itemKeys).then(function(lotes) {
        var r = paletesDepois(a, lotes, extras);
        if (r.erro) throw new Error(r.erro);
        return fn.httpsCallable('salvarAgendamentoExpedicaoPA')({agendaKey: agendaKey, revisao: a.revisao, editarPaletes: true, motivo: motivo, paletes: r.paletes})
          .then(function() { return r; });
      });
    }
    function falhaPasso2(err) {
      ctx.aviso('O estoque foi alterado, mas a carga <b>não</b> foi atualizada: ' + e(err.message || err) +
        '. Use <b>Atualizar a carga ao estoque</b> no card da carga.', true);
    }

    function botoesHTML(a) {
      if (!ehAdmin(window.currentUser) || !window.CargasPA || !CargasPA.acoes(a).editarPaletes) return '';
      var div = divergencias(a, ctx.lotes());
      return '<button class="btn ghost" data-adm-paletes="' + e(a._key) + '" title="Só administradores: dividir ou remontar um palete desta carga; a carga é atualizada junto">✂️🔀 Remontar / desmembrar (ADM)</button>' +
        (div.length ? '<button class="btn ghost" data-adm-sincronizar="' + e(a._key) + '" title="' + e(div.map(function(d) { return d.palete + ': carga ' + d.naCarga + ' × estoque ' + d.noEstoque; }).join('; ')) + '">⚠ Atualizar a carga ao estoque</button>' : '');
    }
    function ligar(raiz) {
      raiz.querySelectorAll('[data-adm-paletes]').forEach(function(b) { b.onclick = function() { abrirLista(b.dataset.admPaletes); }; });
      raiz.querySelectorAll('[data-adm-sincronizar]').forEach(function(b) { b.onclick = function() { sincronizar(b.dataset.admSincronizar, b); }; });
    }

    function sincronizar(k, botao) {
      if (ocupado) return;
      var a = ctx.agendas()[k];
      if (!a) return;
      ocupado = true; botao.disabled = true; botao.textContent = 'Atualizando…';
      salvarCarga(k, [], 'Carga atualizada ao estoque após remontagem/desmembramento (ADM)', (a.paletes || []).map(function(p) { return p.itemKey; }).filter(function(x, i, l) { return l.indexOf(x) === i; }))
        .then(function(r) { ctx.aviso('Carga de <b>' + e(a.cliente) + '</b> atualizada ao estoque' + (r.removidos.length ? ' (saíram, zerados: ' + e(r.removidos.join(', ')) + ')' : '') + '.'); })
        .catch(function(err) { ctx.aviso(e(err.message || 'Não foi possível atualizar a carga.'), true); })
        .then(function() { ocupado = false; ctx.render(); });
    }

    function abrirLista(k) {
      var a = ctx.agendas()[k];
      if (!a) return;
      var lotes = ctx.lotes();
      var fat = a.faturamento || {};
      var linhas = (a.paletes || []).map(function(p) {
        var l = loteDe(lotes, p.itemKey, p.loteKey) || {};
        var c = window.RemontarPalete ? RemontarPalete.composicao(l) : null;
        var podeDm = window.DesmembrarPalete && DesmembrarPalete.podeDesmembrar(l);
        return '<tr><td><b>' + e(p.identificadorPalete || p.loteKey) + '</b></td><td>' + e(p.sku || '') + ' ' + e(p.descricao || '') + '</td>' +
          '<td class="num">' + num(l.saldoLote) + (c ? '<div class="sub">' + num(c.caixas) + ' cx' + (c.parcial ? ' + parcial ' + num(c.parcial) : '') + '</div>' : '<div class="sub" style="color:#b42318">composição não fecha</div>') + '</td>' +
          '<td style="white-space:nowrap">' + (podeDm ? '<button type="button" class="btn ghost" data-dm="' + e(ref(p)) + '">✂️ Desmembrar</button> ' : '') +
          (c && Number(l.saldoLote) > 0 ? '<button type="button" class="btn ghost" data-rm="' + e(ref(p)) + '">🔀 Remontar</button>' : '') + '</td></tr>';
      }).join('');
      var bg = modal('<h2>Paletes da carga — ' + e(a.cliente) + '</h2>' +
        '<p class="sub">Só administradores. O palete muda no estoque e a carga é atualizada em seguida, com o motivo na linha do tempo. O total do lote não muda.</p>' +
        (fat.status === 'SOLICITADO' ? '<div class="notice">O faturamento já foi solicitado: depois da mudança, solicite de novo antes de registrar a NF.</div>' : '') +
        '<div class="table-wrap" style="overflow-x:auto"><table class="carga-itens"><thead><tr><th>Palete</th><th>Produto</th><th class="num">Unidades</th><th></th></tr></thead><tbody>' + linhas + '</tbody></table></div>' +
        '<div class="rm-acoes"><button type="button" class="btn ghost" id="admFechar">Fechar</button></div>');
      el('admFechar').onclick = function() { bg.remove(); };
      bg.querySelectorAll('[data-dm]').forEach(function(b) { b.onclick = function() { bg.remove(); abrirDesmembrar(k, b.dataset.dm); }; });
      bg.querySelectorAll('[data-rm]').forEach(function(b) { b.onclick = function() { bg.remove(); abrirRemontar(k, b.dataset.rm); }; });
    }

    /* ── Desmembrar ── */
    function abrirDesmembrar(agendaKey, pk) {
      var ids = pk.split('/'), lote = loteDe(ctx.lotes(), ids[0], ids[1]);
      if (!lote) return ctx.aviso('Palete não encontrado.', true);
      var c = DesmembrarPalete.composicaoAtual(lote);
      if (!c) return ctx.aviso('A composição deste palete não fecha com o saldo. Corrija antes de desmembrar.', true);
      var partes = [{caixas: c.caixas, parcial: c.parcial}, {caixas: '', parcial: ''}];
      var bg = modal('<h2>Desmembrar palete da carga</h2>' +
        '<div class="sub">' + e(lote.itemCodigo) + ' — ' + e(lote.itemNome || '') + ' · palete <b>' + e(lote.identificadorPalete || ids[1]) + '</b><br>Hoje: <b>' +
          num(c.caixas) + ' cx × ' + num(c.multiplo || 0) + (c.parcial ? ' + 1 parcial de ' + num(c.parcial) + ' un' : '') + ' = ' + num(c.saldo) + ' un</b></div>' +
        '<div class="sub" style="margin:8px 0">Quantas caixas ficam em cada palete. O primeiro mantém o código; os demais nascem no mesmo endereço e <b>todos seguem nesta carga</b>.</div>' +
        '<div id="admDmLinhas"></div><button type="button" class="btn ghost" id="admDmMais">+ Adicionar palete</button>' +
        '<label style="margin-top:10px">Motivo<input type="text" id="admDmMotivo" maxlength="200" value="Desmembramento no faturamento (ADM)"></label>' +
        '<div id="admDmMsg" class="sub" style="font-weight:700;margin-top:8px"></div><div id="admDmErro" class="sub" style="color:#d03b3b"></div>' +
        '<div class="rm-acoes"><button type="button" class="btn ghost" id="admDmFechar">Cancelar</button><button type="button" class="btn" id="admDmOk" disabled>Desmembrar e atualizar a carga</button></div>');
      function desenhar() {
        el('admDmLinhas').innerHTML = partes.map(function(p, i) {
          return '<div class="rm-grid" style="margin:6px 0;grid-template-columns:90px 1fr ' + (c.parcial ? '1fr ' : '') + 'auto"><b style="align-self:center">Palete ' + (i + 1) + '</b>' +
            '<label>Caixas<input type="number" min="0" step="1" data-i="' + i + '" data-campo="caixas" value="' + e(p.caixas) + '"></label>' +
            (c.parcial ? '<label>Un. na parcial<input type="number" min="0" step="1" data-i="' + i + '" data-campo="parcial" value="' + e(p.parcial) + '"></label>' : '') +
            (i >= 2 ? '<button type="button" class="btn ghost" data-rmi="' + i + '" aria-label="Remover palete ' + (i + 1) + '">✕</button>' : '<span></span>') + '</div>';
        }).join('');
        el('admDmLinhas').querySelectorAll('input').forEach(function(x) { x.oninput = function() { partes[Number(x.dataset.i)][x.dataset.campo] = x.value; validar(); }; });
        el('admDmLinhas').querySelectorAll('[data-rmi]').forEach(function(b) { b.onclick = function() { partes.splice(Number(b.dataset.rmi), 1); desenhar(); validar(); }; });
        el('admDmMais').disabled = partes.length >= DesmembrarPalete.MAX_PARTES;
      }
      function validar() {
        var r = DesmembrarPalete.conferir(lote, partes);
        var motivoOk = el('admDmMotivo').value.trim().length >= 5;
        el('admDmMsg').textContent = !r.ok ? r.mensagem : !motivoOk ? 'Informe o motivo (mínimo 5 caracteres).' : 'Confere: ' + num(c.caixas) + ' caixas em ' + partes.length + ' paletes.';
        el('admDmMsg').style.color = r.ok && motivoOk ? '#176b40' : '#9a6700';
        el('admDmOk').disabled = !r.ok || !motivoOk || ocupado;
      }
      el('admDmMais').onclick = function() { partes.push({caixas: '', parcial: ''}); desenhar(); validar(); };
      el('admDmMotivo').oninput = validar;
      el('admDmFechar').onclick = function() { if (!ocupado) bg.remove(); };
      el('admDmOk').onclick = function() {
        if (ocupado) return;
        ocupado = true; el('admDmOk').disabled = true; el('admDmErro').textContent = '';
        var motivo = el('admDmMotivo').value.trim(), agendas = ctx.agendas();
        DesmembrarPalete.executar(db, {itemKey: ids[0], loteKey: ids[1], partes: partes, autor: autor(), motivo: motivo,
          emCarga: function(i, l) { return emOutraCarga(agendas, agendaKey, i, l); }}).then(function(r) {
          bg.remove();
          var extras = r.novos.map(function(n) { return {itemKey: ids[0], loteKey: n.loteKey, identificador: n.identificador, modeloRef: pk}; });
          return salvarCarga(agendaKey, extras, motivo + ' — ' + (lote.identificadorPalete || ids[1]) + ' em ' + (r.novos.length + 1) + ' paletes', [ids[0]]).then(function() {
            ctx.aviso('Palete ' + e(lote.identificadorPalete || ids[1]) + ' desmembrado em ' + (r.novos.length + 1) + (r.novos.length ? ' (' + e(r.novos.map(function(n) { return n.identificador; }).join(', ')) + ')' : '') +
              '; todos seguem na carga.' + ((ctx.agendas()[agendaKey] || {}).faturamento && ctx.agendas()[agendaKey].faturamento.status === 'SOLICITADO' ? ' Solicite o faturamento de novo.' : ''));
          }, falhaPasso2);
        }).catch(function(err) { if (el('admDmErro')) el('admDmErro').textContent = err.message || String(err); else ctx.aviso(e(err.message || String(err)), true); })
          .then(function() { ocupado = false; if (document.body.contains(bg)) validar(); ctx.render(); });
      };
      desenhar(); validar();
    }

    /* ── Remontar ── */
    function abrirRemontar(agendaKey, pk) {
      var ids = pk.split('/'), lotes = ctx.lotes(), lote = loteDe(lotes, ids[0], ids[1]);
      var a = ctx.agendas()[agendaKey];
      if (!lote || !a) return ctx.aviso('Palete não encontrado.', true);
      var c = RemontarPalete.composicao(lote);
      if (!c) return ctx.aviso('A composição deste palete não fecha com o saldo. Corrija antes de remontar.', true);
      var agendas = ctx.agendas();
      function emCarga(i, l) { return emOutraCarga(agendas, agendaKey, i, l); }
      var naCarga = {};
      (a.paletes || []).forEach(function(p) { naCarga[ref(p)] = true; });
      var opcoes = [];
      Object.keys(lotes || {}).forEach(function(i) {
        Object.keys(lotes[i] || {}).forEach(function(k) {
          var l = lotes[i][k];
          if (!l || !(Number(l.saldoLote) > 0) || i + '/' + k === pk || emCarga(i, k) || l.itemTipo && l.itemTipo !== 'produto') return;
          opcoes.push({v: i + '/' + k, t: (l.identificadorPalete || k) + ' · ' + (l.itemCodigo || '') + ' · lote ' + (l.opLote || l.loteOrigem || '—') + ' · ' + num(l.saldoLote) + ' un' + (naCarga[i + '/' + k] ? ' · NESTA CARGA' : '')});
        });
      });
      opcoes.sort(function(x, y) { return (y.t.indexOf('NESTA CARGA') >= 0) - (x.t.indexOf('NESTA CARGA') >= 0) || x.t.localeCompare(y.t, 'pt-BR', {numeric: true}); });
      var opHtml = opcoes.map(function(o) { return '<option value="' + e(o.v) + '">' + e(o.t) + '</option>'; }).join('');
      var bg = modal('<h2>Remontar palete da carga</h2>' +
        '<div class="sub">' + e(lote.itemCodigo) + ' — ' + e(lote.itemNome || '') + ' · palete <b>' + e(lote.identificadorPalete || ids[1]) + '</b><br>Hoje: <b>' +
          num(c.caixas) + ' cx × ' + num(c.multiplo || 0) + (c.parcial ? ' + 1 parcial de ' + num(c.parcial) + ' un' : '') + ' = ' + num(c.saldo) + ' un</b></div>' +
        '<div class="rm-grid"><label>Caixas a tirar<input type="number" id="admRmCaixas" min="0" max="' + c.caixas + '" step="1"></label>' +
          (c.parcial ? '<label class="check" style="align-self:end"><input type="checkbox" id="admRmParcial"> levar a caixa parcial (' + num(c.parcial) + ' un)</label>' : '<div></div>') + '</div>' +
        '<fieldset class="rm-dest"><legend>Para onde vão as caixas</legend>' +
          '<label class="check"><input type="radio" name="admRmDest" value="NOVO" checked> Palete novo <input type="text" id="admRmNovoId" maxlength="40" placeholder="identificação (opcional)"></label>' +
          '<label class="check"><input type="radio" name="admRmDest" value="REGISTRO"' + (opHtml ? '' : ' disabled') + '> Palete que já existe <select id="admRmRegistro"' + (opHtml ? '' : ' disabled') + '>' + (opHtml || '<option>nenhum palete livre</option>') + '</select></label>' +
          '<label class="check"><input type="checkbox" id="admRmFica"> As caixas tiradas <b>seguem nesta carga</b> (sem marcar, o palete de destino fica fora da carga)</label>' +
        '</fieldset>' +
        '<label>Motivo<input type="text" id="admRmMotivo" maxlength="200" value="Remontagem no faturamento (ADM)"></label>' +
        '<div id="admRmMsg" class="sub" style="font-weight:700;margin-top:8px"></div><div id="admRmErro" class="sub" style="color:#d03b3b"></div>' +
        '<div class="rm-acoes"><button type="button" class="btn ghost" id="admRmFechar">Cancelar</button><button type="button" class="btn" id="admRmOk" disabled>Remontar e atualizar a carga</button></div>');
      function req() {
        var tipo = (bg.querySelector('[name="admRmDest"]:checked') || {}).value;
        var dest = tipo === 'REGISTRO' ? (function() { var v = el('admRmRegistro').value.split('/'); return {tipo: 'REGISTRO', itemKey: v[0], loteKey: v[1]}; })()
          : {tipo: 'NOVO', identificador: el('admRmNovoId').value.trim() || undefined};
        return {itemKey: ids[0], loteKey: ids[1], caixas: el('admRmCaixas').value, parcial: !!(el('admRmParcial') && el('admRmParcial').checked), destino: dest};
      }
      // Quais paletes entram na carga depois (o destino, se marcado). O motor
      // sempre grava o destino no item da origem (junta no mesmo item ou cria
      // a chave nova lá, inclusive no palete misto).
      function extrasDe(plano) {
        if (!el('admRmFica').checked) return [];
        return [{itemKey: ids[0], loteKey: plano.destinoKey, identificador: plano.identificadorDestino, modeloRef: pk}];
      }
      function validar() {
        try {
          var plano = RemontarPalete.planejar({estoque_lotes: ctx.lotes()}, req(), {emCarga: emCarga});
          var r = req(), destNaCarga = r.destino.tipo === 'REGISTRO' && naCarga[r.destino.itemKey + '/' + r.destino.loteKey];
          var sobra = (a.paletes || []).length - (plano.origemDepois.saldoLote > 0 ? 0 : 1) + (el('admRmFica').checked && !destNaCarga ? 1 : 0);
          if (sobra < 1) throw new Error('A carga ficaria sem paletes. Marque "seguem nesta carga" ou cancele a carga no Acompanhamento.');
          if (el('admRmMotivo').value.trim().length < 5) throw new Error('Informe o motivo (mínimo 5 caracteres).');
          el('admRmMsg').style.color = '#176b40';
          el('admRmMsg').textContent = 'Move ' + num(plano.qtd) + ' un para ' + plano.identificadorDestino + (plano.juntou ? ' (junta no mesmo lote)' : ' (palete novo' + (plano.destinoNovo && plano.destinoNovo.remontagem && plano.destinoNovo.remontagem.paleteMisto ? ', misto' : '') + ')') +
            '. Fica no original: ' + num(plano.origemDepois.saldoLote) + ' un' + (plano.origemDepois.saldoLote > 0 ? '' : ' (sai da carga)') + '. ' +
            (destNaCarga ? 'O destino já está nesta carga.' : el('admRmFica').checked ? 'O destino entra nesta carga' + (r.destino.tipo === 'REGISTRO' && plano.juntou ? ' com o saldo inteiro dele.' : '.') : 'O destino fica fora da carga.');
          el('admRmOk').disabled = ocupado;
        } catch (err) { el('admRmMsg').style.color = '#9a6700'; el('admRmMsg').textContent = err.message; el('admRmOk').disabled = true; }
      }
      bg.querySelectorAll('input,select').forEach(function(x) { x.addEventListener('input', validar); x.addEventListener('change', validar); });
      el('admRmFechar').onclick = function() { if (!ocupado) bg.remove(); };
      el('admRmOk').onclick = function() {
        if (ocupado) return;
        ocupado = true; el('admRmOk').disabled = true; el('admRmErro').textContent = '';
        var motivo = el('admRmMotivo').value.trim(), r = req();
        RemontarPalete.executar(db, r, {autor: autor(), motivo: motivo, emCarga: emCarga, todosLotes: ctx.lotes(),
          operacaoId: 'rm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)}).then(function(plano) {
          var extras = extrasDe(plano);  // antes de fechar: lê a caixa do modal
          bg.remove();
          return salvarCarga(agendaKey, extras, motivo + ' — ' + num(plano.qtd) + ' un de ' + (lote.identificadorPalete || ids[1]) + ' para ' + plano.identificadorDestino, [ids[0]]).then(function(res) {
            ctx.aviso('Palete remontado: ' + num(plano.qtd) + ' un de ' + e(lote.identificadorPalete || ids[1]) + ' para ' + e(plano.identificadorDestino) + '. Carga atualizada' +
              (res.removidos.length ? ' (saiu, zerado: ' + e(res.removidos.join(', ')) + ')' : '') + '.' +
              ((ctx.agendas()[agendaKey] || {}).faturamento && ctx.agendas()[agendaKey].faturamento.status === 'SOLICITADO' ? ' Solicite o faturamento de novo.' : ''));
          }, falhaPasso2);
        }).catch(function(err) { if (el('admRmErro')) el('admRmErro').textContent = err.message || 'Não foi possível remontar.'; else ctx.aviso(e(err.message || 'Não foi possível remontar.'), true); })
          .then(function() { ocupado = false; if (document.body.contains(bg)) validar(); ctx.render(); });
      };
      el('admRmCaixas').focus();
      validar();
    }

    return {botoesHTML: botoesHTML, ligar: ligar};
  }

  return {ehAdmin: ehAdmin, emOutraCarga: emOutraCarga, paletesDepois: paletesDepois, divergencias: divergencias, tela: tela};
});
