/* Registro retrospectivo de retrabalho (16/11/2026) — aba "Registros de retrabalho" de qualidade.html.
   Prompt: PROMPT_RNC_RETRABALHO_26302_01.md. Regras em shared/registro-retrabalho.js; toda gravação
   pela callable registroRetrabalho (functions/registro_retrabalho.js): o navegador só lê
   registros_retrabalho/ e, para abrir um registro, lê a RNC e as OPs escolhidas.
   Usa da página: db, storage, dbOnValue, escapeHtml, escapeAttr, showAlert, currentUserNome, FotosQualidade. */
(function() {
  if (!window.RegistroRetrabalho || !document.getElementById('rrLista')) return;
  var T = window.RegistroRetrabalho;
  var $ = function(id) { return document.getElementById(id); };
  var registros = {}, rncs = {}, selecionado = null, fotosPorEtapa = {}, perfil = T.perfil(null), sujo = false;

  function novoReq() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function fmt(v) { return v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR'); }
  function dataHora(iso) { return iso ? new Date(iso).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'}) : ''; }
  function chamar(acao, id, dados) {
    var req = novoReq();
    return Promise.resolve().then(function() {
      return firebase.functions().httpsCallable('registroRetrabalho')({acao: acao, id: id || null, dados: dados || {}, requestId: req});
    }).then(function(r) { return (r && r.data) || {}; });
  }
  function msg(e) { return String((e && e.message) || e || 'Erro desconhecido.'); }
  function badge(st) {
    var cor = {EM_PREENCHIMENTO: 'badge-orange', AGUARDANDO_DECISAO: 'badge-blue', ENCERRADO: 'badge-green'}[st] || 'badge-gray';
    return '<span class="badge ' + cor + '">' + escapeHtml(T.STATUS[st] || st || '') + '</span>';
  }
  function opcoes(obj, sel, vazio) {
    return (vazio != null ? '<option value="">' + escapeHtml(vazio) + '</option>' : '') + Object.keys(obj).map(function(k) {
      return '<option value="' + escapeAttr(k) + '"' + (k === sel ? ' selected' : '') + '>' + escapeHtml(obj[k]) + '</option>';
    }).join('');
  }

  // ── Lista ──────────────────────────────────────────────────────────
  function renderLista() {
    var ids = Object.keys(registros).sort(function(a, b) { return String((registros[b] || {}).criadoEm || '').localeCompare(String((registros[a] || {}).criadoEm || '')); });
    $('rrNovo').style.display = perfil.edita ? '' : 'none';
    if (!ids.length) { $('rrLista').innerHTML = '<div class="no-data">Nenhum registro de retrabalho ainda.</div>'; return; }
    $('rrLista').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Registro</th><th>Origem</th><th>Destinos</th><th>RNC</th><th>Balanço</th><th>Status</th></tr></thead><tbody>' +
      ids.map(function(id) {
        var r = registros[id] || {}, b = T.balanco(r), o = r.origem || {};
        var dest = T.lista(r.destinos).map(function(d) { return escapeHtml(d.lote) + ' (' + fmt(d.qtd) + ')'; }).join(' + ');
        return '<tr class="rr-linha' + (id === selecionado ? ' rr-sel' : '') + '" data-id="' + escapeAttr(id) + '" style="cursor:pointer">' +
          '<td><b>' + escapeHtml(id) + '</b></td>' +
          '<td>' + escapeHtml(o.lote || '') + ' · ' + escapeHtml(o.produto || '') + ' · ' + fmt(o.qtd) + ' un.</td>' +
          '<td>' + dest + '</td><td>' + escapeHtml(r.rncNumero || '') + '</td>' +
          '<td>' + (b.fecha ? '<span class="badge badge-green">Fecha</span>' : '<span class="badge badge-red">Diferença ' + fmt(b.diferenca) + '</span>') + '</td>' +
          '<td>' + badge(r.status) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    Array.prototype.forEach.call(document.querySelectorAll('#rrLista .rr-linha'), function(tr) {
      tr.addEventListener('click', function() {
        if (sujo && !confirm('Há alterações não salvas neste registro. Descartar?')) return;
        selecionado = tr.getAttribute('data-id'); sujo = false; renderLista(); renderDetalhe();
      });
    });
  }

  // ── Abrir registro ─────────────────────────────────────────────────
  function linhaDestino(lote, qtd) {
    return '<div class="rr-dest form-grid"><div class="form-group"><label>Lote de destino (OP)</label><input class="rr-dest-lote" placeholder="ex.: 26264/14" value="' + escapeAttr(lote || '') + '"></div>' +
      '<div class="form-group"><label>Unidades finais</label><input class="rr-dest-qtd" type="number" min="0" step="1" value="' + escapeAttr(qtd == null ? '' : qtd) + '"></div></div>';
  }
  function abrirNovo() {
    var lista = Object.keys(rncs).sort().reverse();
    $('rrNovoRnc').innerHTML = '<option value="">Escolha a RNC</option>' + lista.map(function(k) {
      var r = rncs[k] || {};
      return '<option value="' + escapeAttr(k) + '">' + escapeHtml(k + ' · ' + (r.opLote || '') + ' · ' + String(r.descricao || '').slice(0, 70)) + '</option>';
    }).join('');
    $('rrNovoOrigem').value = ''; $('rrNovoQtd').value = ''; $('rrNovoRel').value = ''; $('rrNovoData').value = ''; $('rrNovoDesc').value = '';
    $('rrNovoDestinos').innerHTML = linhaDestino('', '');
    $('rrNovoInfo').textContent = '';
    $('rrNovoBg').classList.add('open');
  }
  function opKeyDe(lote) { return String(lote || '').trim().replace(/[.#$\[\]\/]/g, '-'); }
  function conferirOrigem() {
    var k = opKeyDe($('rrNovoOrigem').value);
    if (!k) { $('rrNovoInfo').textContent = ''; return; }
    db.ref('ops/' + k).once('value').then(function(s) {
      var op = s.val();
      if (!op) { $('rrNovoInfo').textContent = 'OP ' + k + ' não encontrada.'; return; }
      $('rrNovoInfo').textContent = (op.produto || '') + ' — planejado ' + fmt(op.qtdPlanejada) + ', apontado ' + fmt(op.produzido) + ' un.';
      if (!$('rrNovoQtd').value) $('rrNovoQtd').value = op.produzido || '';
    }).catch(function(e) { $('rrNovoInfo').textContent = msg(e); });
  }
  function criar() {
    var destinos = Array.prototype.map.call(document.querySelectorAll('#rrNovoDestinos .rr-dest'), function(el) {
      return {opKey: opKeyDe(el.querySelector('.rr-dest-lote').value), qtd: el.querySelector('.rr-dest-qtd').value};
    }).filter(function(d) { return d.opKey; });
    var dados = {rncNumero: $('rrNovoRnc').value, opKeyOrigem: opKeyDe($('rrNovoOrigem').value), qtdOrigem: $('rrNovoQtd').value,
      destinos: destinos, rncsRelacionadas: $('rrNovoRel').value.split(/[,;\s]+/).filter(Boolean),
      ocorridaEm: $('rrNovoData').value, descricao: $('rrNovoDesc').value};
    var btn = $('rrNovoSalvar'); btn.disabled = true;
    chamar('CRIAR', null, dados).then(function(r) {
      $('rrNovoBg').classList.remove('open'); selecionado = r.id; sujo = false;
      renderLista(); renderDetalhe(); showAlert('Registro ' + r.id + ' aberto. Preencha as três etapas.', 'success');
    }).catch(function(e) { showAlert('Erro: ' + msg(e), 'danger'); }).then(function() { btn.disabled = false; });
  }

  // ── Detalhe ────────────────────────────────────────────────────────
  function editavel(r) { return perfil.edita && r.status === 'EM_PREENCHIMENTO'; }
  function campo(rot, html, largura) { return '<div class="form-group"' + (largura ? ' style="grid-column:span ' + largura + '"' : '') + '><label>' + rot + '</label>' + html + '</div>'; }
  function inp(cls, v, tipo, dis, extra) {
    return '<input class="' + cls + '"' + (tipo ? ' type="' + tipo + '"' : '') + ' value="' + escapeAttr(v == null ? '' : v) + '"' + (dis ? ' disabled' : '') + (extra || '') + '>';
  }
  function area(cls, v, dis) { return '<textarea class="' + cls + '" rows="2"' + (dis ? ' disabled' : '') + '>' + escapeHtml(v || '') + '</textarea>'; }
  function linhaPerda(p, dis) {
    return '<div class="rr-perda rr-grid4">' +
      campo('Motivo', '<select class="rr-perda-motivo"' + (dis ? ' disabled' : '') + '>' + opcoes(T.MOTIVOS_PERDA, p.motivo, 'Escolha') + '</select>') +
      campo('Unidades', inp('rr-perda-qtd', p.qtd, 'number', dis, ' min="0" step="1"')) +
      campo('Observação', inp('rr-perda-obs', p.observacao, '', dis), 2) + '</div>';
  }
  function linhaMaterial(m, dis) {
    return '<div class="rr-mat rr-grid5">' +
      campo('Código', inp('rr-mat-cod', m.codigo, '', dis)) + campo('Material', inp('rr-mat-nome', m.nome, '', dis)) +
      campo('Consumido', inp('rr-mat-cons', m.consumido, 'number', dis, ' min="0"')) +
      campo('Recuperado', inp('rr-mat-rec', m.recuperado, 'number', dis, ' min="0"')) +
      campo('Descartado', inp('rr-mat-desc', m.descartado, 'number', dis, ' min="0"')) + '</div>';
  }
  function cartaoEtapa(e, dis) {
    var k = e._k;
    return '<div class="card rr-etapa" data-k="' + escapeAttr(k) + '" data-ui="surface"><div class="card-header" data-ui="surface-head"><h3>Etapa ' + e.n + ' — ' +
      escapeHtml(T.TIPOS_ETAPA[e.tipo] || e.tipo) + '</h3><span class="rr-etapa-bal" data-k="' + escapeAttr(k) + '"></span></div><div class="card-body">' +
      '<div class="rr-grid4">' +
      campo('Recurso (linha, posto, estação)', inp('rr-e-recurso', e.recurso, '', dis)) +
      campo('Início', inp('rr-e-inicio', e.inicio, 'datetime-local', dis)) +
      campo('Fim', inp('rr-e-fim', e.fim, 'datetime-local', dis)) +
      campo('Responsáveis', inp('rr-e-resp', e.responsaveis, '', dis)) + '</div>' +
      campo('O que foi feito (procedimento aplicado)', area('rr-e-proc', e.procedimento, dis)) +
      '<div class="rr-grid4">' +
      campo('Entrada (un.)', inp('rr-e-ent rr-num', e.qtdEntrada, 'number', dis, ' min="0" step="1"')) +
      campo('Saída (un.)', inp('rr-e-sai rr-num', e.qtdSaida, 'number', dis, ' min="0" step="1"')) +
      campo('Perda (un.)', inp('rr-e-per rr-num', e.qtdPerda, 'number', dis, ' min="0" step="1"')) +
      campo('Observação', inp('rr-e-obs', e.observacao, '', dis)) + '</div>' +
      '<div class="field-hint" style="margin:4px 0">Materiais da etapa (frascos, válvulas, rótulos...). Só registro: nada é lançado no estoque.</div>' +
      '<div class="rr-mats">' + (e.materiais.length ? e.materiais : (dis ? [] : [{}])).map(function(m) { return linhaMaterial(m, dis); }).join('') + '</div>' +
      (dis ? '' : '<button type="button" class="btn btn-ghost btn-sm rr-add-mat">+ Material</button>') +
      '<div style="margin-top:10px"><label>Evidências</label> ' + (e.evidencias.length ? FotosQualidade.botao(e.evidencias, 'Etapa ' + e.n) : '<span class="field-hint">nenhuma</span>') +
      (dis ? '' : '<div class="rr-fotos" data-k="' + escapeAttr(k) + '"></div>') + '</div>' +
      (e.preenchidoPor ? '<div class="field-hint">Preenchido por ' + escapeHtml(e.preenchidoPor) + ' em ' + dataHora(e.preenchidoEm) + '</div>' : '') +
      '</div></div>';
  }
  function renderDetalhe() {
    var box = $('rrDetalhe');
    var r = selecionado && registros[selecionado];
    if (!r) { box.innerHTML = ''; return; }
    var dis = !editavel(r), o = r.origem || {};
    var destinos = T.lista(r.destinos), perdas = T.lista(r.perdas);
    var rel = Object.keys(r.rncsRelacionadas || {}).map(function(k) { return r.rncsRelacionadas[k]; });
    var rs = r.rncResumo || {};
    box.innerHTML =
      '<div class="rr-aviso">📄 <b>Registro retrospectivo.</b> Documenta um retrabalho já executado. <b>Não altera</b> OP, pedido, estoque, palete, conferência nem expedição: salvar, enviar ou encerrar não libera nem bloqueia nada.</div>' +
      '<div class="card" data-ui="surface"><div class="card-header" data-ui="surface-head"><h3>' + escapeHtml(selecionado) + ' ' + badge(r.status) + '</h3>' +
      '<div><button type="button" class="btn btn-ghost btn-sm" id="rrImprimir">🖨️ Imprimir</button></div></div><div class="card-body">' +
      '<div class="rr-grid4">' +
      campo('RNC', '<div><b>' + escapeHtml(r.rncNumero || '') + '</b> <span class="field-hint">' + escapeHtml([rs.classificacao, rs.status, rs.disposicao].filter(Boolean).join(' · ')) + '</span>' +
        (rs.opLoteNaRnc ? '<div class="field-hint">Lote escrito na RNC: ' + escapeHtml(rs.opLoteNaRnc) + '</div>' : '') + '</div>') +
      campo('RNCs relacionadas', '<div>' + (rel.length ? rel.map(escapeHtml).join(', ') : '—') + '</div>') +
      campo('Ocorrida em', inp('rr-ocorrida', r.ocorridaEm, 'date', dis)) +
      campo('Cliente', '<div>' + escapeHtml(o.cliente || '') + '</div>') + '</div>' +
      campo('Descrição', area('rr-descricao', r.descricao, dis)) +
      '</div></div>' +
      '<div class="card" data-ui="surface"><div class="card-header" data-ui="surface-head"><h3>Balanço de quantidades</h3></div><div class="card-body">' +
      '<div class="rr-bal" id="rrBal"></div>' +
      '<div class="table-wrap"><table><thead><tr><th></th><th>Lote</th><th>Produto</th><th>Apontado no sistema</th><th>Conferido (PA)</th><th>Unidades finais</th><th>Granel de origem</th><th>Observação</th></tr></thead><tbody>' +
      '<tr><td><b>Origem</b></td><td>' + escapeHtml(o.lote || '') + '</td><td>' + escapeHtml(o.produto || '') + '</td><td>' + fmt(o.qtdApontada) + ' <span class="field-hint">(planejado ' + fmt(o.qtdPlanejada) + ')</span></td><td>—</td>' +
      '<td>' + inp('rr-origem-qtd rr-num', o.qtd, 'number', dis, ' min="0" step="1" style="width:110px"') + '</td><td></td><td></td></tr>' +
      destinos.map(function(d) {
        return '<tr class="rr-dest-linha" data-k="' + escapeAttr(d._k) + '"><td>Destino</td><td>' + escapeHtml(d.lote || '') + '</td><td>' + escapeHtml(d.produto || '') + '</td><td>' + fmt(d.qtdApontada) + '</td><td>' + fmt(d.qtdConferida) + '</td>' +
          '<td>' + inp('rr-d-qtd rr-num', d.qtd, 'number', dis, ' min="0" step="1" style="width:110px"') + '</td>' +
          '<td>' + inp('rr-d-granel', d.granelLote, '', dis, ' style="width:110px"') + '</td><td>' + inp('rr-d-obs', d.observacao, '', dis) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<h4 style="margin:14px 0 6px">Perdas e diferenças declaradas</h4><div id="rrPerdas">' +
      (perdas.length ? perdas : (dis ? [] : [{}])).map(function(p) { return linhaPerda(p, dis); }).join('') + '</div>' +
      (dis ? '' : '<button type="button" class="btn btn-ghost btn-sm" id="rrAddPerda">+ Perda</button>') +
      '</div></div>' +
      T.etapas(r).map(function(e) { return cartaoEtapa(e, dis); }).join('') +
      (r.decisao ? '<div class="card" data-ui="surface"><div class="card-header" data-ui="surface-head"><h3>Decisão da Qualidade</h3></div><div class="card-body"><p><b>Análise:</b> ' + escapeHtml(r.decisao.analise) + '</p>' +
        (r.decisao.conclusao ? '<p><b>Conclusão:</b> ' + escapeHtml(r.decisao.conclusao) + '</p>' : '') + '<div class="field-hint">' + escapeHtml(r.decisao.por || '') + ' em ' + dataHora(r.decisao.em) + '</div></div></div>' : '') +
      '<div class="rr-pend" id="rrPend"></div>' +
      '<div class="rr-acoes">' +
      (editavel(r) ? '<button type="button" class="btn btn-ghost" id="rrSalvar">Salvar</button><button type="button" class="btn btn-primary" id="rrEnviar">Enviar para decisão</button>' : '') +
      (perfil.edita && r.status === 'AGUARDANDO_DECISAO' ? '<button type="button" class="btn btn-ghost" id="rrReabrir">Devolver ao preenchimento</button><button type="button" class="btn btn-primary" id="rrEncerrar">Encerrar</button>' : '') +
      '</div>' +
      '<details class="rr-hist"><summary>Histórico (' + Object.keys(r.historico || {}).length + ')</summary>' +
      Object.keys(r.historico || {}).sort().map(function(h) {
        var ev = r.historico[h] || {};
        return '<div class="field-hint">' + dataHora(ev.em) + ' · ' + escapeHtml(ev.por || '') + ' · ' + escapeHtml(T.ACOES[ev.acao] || ev.acao) +
          (ev.motivo ? ' — ' + escapeHtml(ev.motivo) : '') + (ev.mudou ? ' · mudou: ' + escapeHtml(Object.keys(ev.mudou).join(', ')) : '') + '</div>';
      }).join('') + '</details>';
    fotosPorEtapa = {};
    if (!dis) Array.prototype.forEach.call(box.querySelectorAll('.rr-fotos'), function(el) { fotosPorEtapa[el.getAttribute('data-k')] = FotosQualidade.montar(el, {}); });
    ligarDetalhe(r);
    atualizarBalanco();
  }

  // Lê o formulário no formato que a callable aceita (SALVAR).
  function lerFormulario(r) {
    var box = $('rrDetalhe'), d = {};
    var q = function(sel, el) { var x = (el || box).querySelector(sel); return x ? x.value : undefined; };
    d.descricao = q('.rr-descricao'); d.ocorridaEm = q('.rr-ocorrida');
    d.origem = {qtd: q('.rr-origem-qtd')};
    d.destinos = {};
    Array.prototype.forEach.call(box.querySelectorAll('.rr-dest-linha'), function(tr) {
      d.destinos[tr.getAttribute('data-k')] = {qtd: q('.rr-d-qtd', tr), granelLote: q('.rr-d-granel', tr), observacao: q('.rr-d-obs', tr)};
    });
    d.perdas = Array.prototype.map.call(box.querySelectorAll('#rrPerdas .rr-perda'), function(el) {
      return {motivo: q('.rr-perda-motivo', el), qtd: q('.rr-perda-qtd', el), observacao: q('.rr-perda-obs', el)};
    });
    d.etapas = {};
    Array.prototype.forEach.call(box.querySelectorAll('.rr-etapa'), function(el) {
      var k = el.getAttribute('data-k'), atual = ((r.etapas || {})[k]) || {};
      d.etapas[k] = {recurso: q('.rr-e-recurso', el), inicio: q('.rr-e-inicio', el), fim: q('.rr-e-fim', el), responsaveis: q('.rr-e-resp', el),
        procedimento: q('.rr-e-proc', el), qtdEntrada: q('.rr-e-ent', el), qtdSaida: q('.rr-e-sai', el), qtdPerda: q('.rr-e-per', el), observacao: q('.rr-e-obs', el),
        materiais: Array.prototype.map.call(el.querySelectorAll('.rr-mat'), function(m) {
          return {codigo: q('.rr-mat-cod', m), nome: q('.rr-mat-nome', m), consumido: q('.rr-mat-cons', m), recuperado: q('.rr-mat-rec', m), descartado: q('.rr-mat-desc', m)};
        }),
        evidencias: T.lista(atual.evidencias)};
    });
    return d;
  }
  // Prévia do registro como ficaria depois de salvar (para o balanço ao vivo).
  function previa(r) {
    var d = lerFormulario(r), x = JSON.parse(JSON.stringify(r));
    if (d.origem.qtd !== undefined) x.origem.qtd = d.origem.qtd;
    Object.keys(d.destinos).forEach(function(k) { if (x.destinos[k]) x.destinos[k].qtd = d.destinos[k].qtd; });
    x.perdas = {}; d.perdas.forEach(function(p, i) { x.perdas['p' + i] = p; });
    Object.keys(d.etapas).forEach(function(k) { if (x.etapas[k]) Object.assign(x.etapas[k], d.etapas[k]); });
    return x;
  }
  function atualizarBalanco() {
    var r = registros[selecionado]; if (!r || !$('rrBal')) return;
    var x = editavel(r) ? previa(r) : r, b = T.balanco(x);
    $('rrBal').innerHTML =
      '<span>Origem <b>' + fmt(b.origem) + '</b></span><span>− Destinos <b>' + fmt(b.destinos) + '</b></span><span>− Perdas <b>' + fmt(b.perdas) + '</b></span>' +
      '<span class="rr-dif ' + (b.fecha ? 'ok' : 'erro') + '">= Diferença <b>' + fmt(b.diferenca) + '</b> ' + (b.fecha ? '✓ fecha' : '— declare o destino') + '</span>' +
      (b.avisos.length ? '<div class="field-hint" style="flex-basis:100%">⚠️ ' + b.avisos.map(escapeHtml).join(' · ') + '</div>' : '');
    b.etapas.forEach(function(e) {
      var el = document.querySelector('.rr-etapa-bal[data-k="' + e.k + '"]');
      if (el) el.innerHTML = e.diferenca == null ? '<span class="badge badge-gray">sem quantidades</span>'
        : e.fecha ? '<span class="badge badge-green">entrada = saída + perda</span>' : '<span class="badge badge-red">diferença ' + fmt(e.diferenca) + '</span>';
    });
    var pend = T.pendencias(x);
    $('rrPend').innerHTML = r.status === 'EM_PREENCHIMENTO' && pend.length
      ? '<b>Para enviar à decisão falta:</b><ul>' + pend.map(function(p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') + '</ul>' : '';
  }
  function salvar(r) {
    var dados = lerFormulario(r), pend = [];
    Object.keys(fotosPorEtapa).forEach(function(k) {
      var f = fotosPorEtapa[k].pendentes();
      if (f.length) pend.push(FotosQualidade.enviar(storage, f, {contexto: 'retrabalho', chave: selecionado + '-' + k, autor: currentUserNome()}).then(function(env) {
        dados.etapas[k].evidencias = dados.etapas[k].evidencias.concat(env);
      }));
    });
    return Promise.all(pend).then(function() { return chamar('SALVAR', selecionado, dados); }).then(function() { sujo = false; });
  }
  function ligarDetalhe(r) {
    var box = $('rrDetalhe');
    box.oninput = function(ev) { if (ev.target.matches('input,textarea,select')) { sujo = true; atualizarBalanco(); } };
    box.onchange = box.oninput;
    var on = function(id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); };
    var trava = function(fn) { return function(ev) { var b = ev.currentTarget; b.disabled = true; Promise.resolve().then(fn).catch(function(e) { showAlert('Erro: ' + msg(e), 'danger'); }).then(function() { b.disabled = false; }); }; };
    on('rrAddPerda', function() { $('rrPerdas').insertAdjacentHTML('beforeend', linhaPerda({}, false)); });
    Array.prototype.forEach.call(box.querySelectorAll('.rr-add-mat'), function(b) {
      b.addEventListener('click', function() { b.previousElementSibling.insertAdjacentHTML('beforeend', linhaMaterial({}, false)); });
    });
    on('rrSalvar', trava(function() { return salvar(r).then(function() { renderDetalhe(); showAlert('Registro salvo.', 'success'); }); }));
    on('rrEnviar', trava(function() {
      return salvar(r).then(function() { return chamar('ENVIAR', selecionado); }).then(function() { renderDetalhe(); showAlert('Registro enviado para a decisão da Qualidade.', 'success'); });
    }));
    on('rrReabrir', trava(function() {
      var m = prompt('Por que o registro volta ao preenchimento?'); if (!m) return;
      return chamar('REABRIR', selecionado, {motivo: m}).then(function() { renderDetalhe(); showAlert('Registro devolvido ao preenchimento.', 'success'); });
    }));
    on('rrEncerrar', trava(function() {
      var a = prompt('Análise da Qualidade (obrigatória):'); if (!a) return;
      var c = prompt('Conclusão / destino final dos lotes (opcional):') || '';
      return chamar('ENCERRAR', selecionado, {analise: a, conclusao: c}).then(function() { renderDetalhe(); showAlert('Registro encerrado.', 'success'); });
    }));
    on('rrImprimir', function() { imprimir(registros[selecionado]); });
  }

  // ── Impressão (relatório da RNC + registro) ────────────────────────
  function imprimir(r) {
    if (!r) return;
    var o = r.origem || {}, b = T.balanco(r), rnc = rncs[r.rncNumero] || {};
    var linhas = function(arr, f) { return arr.map(f).join(''); };
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(selecionado) + '</title><style>body{font:12px/1.45 system-ui,sans-serif;margin:24px;color:#111}' +
      'h1{font-size:18px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px;text-align:left}</style></head><body>' +
      '<h1>Registro retrospectivo de retrabalho ' + escapeHtml(selecionado) + '</h1><p>Status: ' + escapeHtml(T.STATUS[r.status] || r.status) + ' · Cliente: ' + escapeHtml(o.cliente || '') + '</p>' +
      '<h2>RNC ' + escapeHtml(r.rncNumero || '') + '</h2><p>' + escapeHtml(rnc.descricao || '') + '</p><p><b>Causa raiz:</b> ' + escapeHtml(rnc.causaRaiz || '') + '<br><b>Ação imediata:</b> ' + escapeHtml(rnc.acaoImediata || '') +
      '<br><b>Ação corretiva:</b> ' + escapeHtml(rnc.acaoCorretiva || '') + '<br><b>Disposição:</b> ' + escapeHtml(rnc.disposicao || '') + '</p>' +
      '<h2>Balanço</h2><table><tr><th></th><th>Lote</th><th>Produto</th><th>Unidades</th></tr><tr><td>Origem</td><td>' + escapeHtml(o.lote) + '</td><td>' + escapeHtml(o.produto) + '</td><td>' + fmt(o.qtd) + '</td></tr>' +
      linhas(T.lista(r.destinos), function(d) { return '<tr><td>Destino</td><td>' + escapeHtml(d.lote) + '</td><td>' + escapeHtml(d.produto) + '</td><td>' + fmt(d.qtd) + '</td></tr>'; }) +
      linhas(T.lista(r.perdas), function(p) { return '<tr><td>Perda</td><td colspan="2">' + escapeHtml(T.MOTIVOS_PERDA[p.motivo] || '') + ' ' + escapeHtml(p.observacao || '') + '</td><td>' + fmt(p.qtd) + '</td></tr>'; }) +
      '<tr><th colspan="3">Diferença</th><th>' + fmt(b.diferenca) + '</th></tr></table>' +
      linhas(T.etapas(r), function(e) {
        return '<h2>Etapa ' + e.n + ' — ' + escapeHtml(T.TIPOS_ETAPA[e.tipo] || e.tipo) + '</h2><p><b>Recurso:</b> ' + escapeHtml(e.recurso) + ' · <b>Início:</b> ' + escapeHtml(e.inicio) + ' · <b>Fim:</b> ' + escapeHtml(e.fim) +
          ' · <b>Responsáveis:</b> ' + escapeHtml(e.responsaveis) + '</p><p>' + escapeHtml(e.procedimento) + '</p><p>Entrada ' + fmt(e.qtdEntrada) + ' · Saída ' + fmt(e.qtdSaida) + ' · Perda ' + fmt(e.qtdPerda) + '</p>' +
          (e.materiais.length ? '<table><tr><th>Material</th><th>Consumido</th><th>Recuperado</th><th>Descartado</th></tr>' + linhas(e.materiais, function(m) {
            return '<tr><td>' + escapeHtml((m.codigo || '') + ' ' + (m.nome || '')) + '</td><td>' + fmt(m.consumido) + '</td><td>' + fmt(m.recuperado) + '</td><td>' + fmt(m.descartado) + '</td></tr>'; }) + '</table>' : '') +
          (e.evidencias.length ? '<p>Evidências: ' + e.evidencias.length + ' arquivo(s)</p>' : '');
      }) +
      (r.decisao ? '<h2>Decisão</h2><p>' + escapeHtml(r.decisao.analise) + '</p><p>' + escapeHtml(r.decisao.conclusao || '') + '</p><p>' + escapeHtml(r.decisao.por || '') + ' — ' + dataHora(r.decisao.em) + '</p>' : '') +
      '<p style="margin-top:24px;color:#555">Registro retrospectivo: documenta o retrabalho executado e não altera OP, estoque ou expedição.</p></body></html>';
    var w = window.open('', '_blank');
    if (!w) { showAlert('O navegador bloqueou a janela de impressão.', 'warning'); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  // ── Dados ──────────────────────────────────────────────────────────
  function iniciar() {
    perfil = T.perfil(window.currentUser || null);
    if (!perfil.le) { $('rrLista').innerHTML = '<div class="no-data">Sem acesso aos registros de retrabalho.</div>'; return; }
    dbOnValue(db.ref('registros_retrabalho'), function(s) {
      registros = s.val() || {};
      renderLista();
      // Não redesenha por cima de uma edição em curso (mesma lição da câmera da pesagem, 13/11).
      if (!sujo) renderDetalhe();
    });
    dbOnValue(db.ref('nao_conformidades'), function(s) { rncs = s.val() || {}; });
  }
  $('rrNovo').addEventListener('click', abrirNovo);
  $('rrNovoClose').addEventListener('click', function() { $('rrNovoBg').classList.remove('open'); });
  $('rrNovoCancelar').addEventListener('click', function() { $('rrNovoBg').classList.remove('open'); });
  $('rrNovoSalvar').addEventListener('click', criar);
  $('rrNovoOrigem').addEventListener('change', conferirOrigem);
  $('rrNovoAddDest').addEventListener('click', function() { $('rrNovoDestinos').insertAdjacentHTML('beforeend', linhaDestino('', '')); });
  // Espera o login: perfil decide o que aparece (armadilha de 13/11, dbOnValue não espera o login).
  if (window.currentUser) iniciar(); else window.addEventListener('kuryos-auth-pronto', iniciar, {once: true});
})();
