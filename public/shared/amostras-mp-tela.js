/* Amostras de MP (11/11/2026) — aba "Amostras de MP" de cadastros.html.
   Spec: docs/superpowers/specs/2026-11-11-amostras-mp-design.md. Regras de exibição em shared/amostras-mp.js;
   toda gravação da amostra pela callable amostraMp (functions/amostras_mp.js) — o navegador só lê amostras_mp/.
   Usa da página: db, dbOnValue, escapeHtml, escapeAttr, showAlert, attachAutocomplete, activateMainTab,
   limitarAbasCadastros, DuplicidadeMaterial, window.CadastrosMateriais (atalho "Cadastrar MP"). */
(function() {
  if (!window.AmostrasMp || !document.getElementById('tableBody-amo')) return;
  var T = window.AmostrasMp;
  var $ = function(id) { return document.getElementById(id); };
  var amostras = {}, fornecedores = {}, materiais = {};
  var perfil = {pd: false, logistica: false, admin: false, cadastros: false};
  var editandoId = null, detalheId = null, detalheVersao = null, reqForm = null, reqAcao = null, esperandoForn = null;

  function novoReq() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function hoje() { return T.hojeBrasilia(new Date()); }
  function dataBr(s) { return s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '—'; }
  function dataHoraBr(iso) { return iso ? new Date(iso).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'}) : ''; }
  function brl(n) { return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 4}); }
  function nomeForn(f) { return (f && (f.nomeFantasia || f.razaoSocial)) || ''; }
  function opcoes(obj, vazio) { return (vazio != null ? '<option value="">' + escapeHtml(vazio) + '</option>' : '') +
    Object.keys(obj).map(function(k) { return '<option value="' + escapeAttr(k) + '">' + escapeHtml(obj[k]) + '</option>'; }).join(''); }
  function chamar(acao, id, dados, chave) {
    return Promise.resolve().then(function() {
      return firebase.functions().httpsCallable('amostraMp')({acao: acao, id: id || null, dados: dados || {}, requestId: chave});
    }).then(function(r) { return (r && r.data) || {}; });
  }
  function msg(e) { return String((e && e.message) || e || 'Erro desconhecido.'); }
  function badge(st) {
    var cor = {SOLICITADA: 'badge-orange', RECEBIDA: 'badge-blue', HOMOLOGADA: 'badge-green', REPROVADA: 'badge-red', CANCELADA: 'badge-gray'}[st] || 'badge-gray';
    return '<span class="badge ' + cor + '">' + escapeHtml(T.STATUS[st] || st || '') + '</span>';
  }

  // Nome ATUAL do cadastro (12/11): material pela chave do banco e fornecedor pela chave; o gravado na amostra
  // aparece no detalhe quando difere. Amostra NOVA não tem cadastro: fica o nome digitado.
  function materialAtual(a) { var m = a && a.tipo === 'CADASTRADA' && a.material; return m ? (materiais[m.key || m.codigo] || null) : null; }
  function nomeMaterialAtual(a) { var m = materialAtual(a); return m ? (m.mpCodigo || a.material.codigo) + ' — ' + (m.mpNome || '') : T.nomeMaterial(a); }
  function nomeFornecedorAtual(a) { var k = a && a.fornecedor && a.fornecedor.key; return (k && nomeForn(fornecedores[k])) || ((a && a.fornecedor) || {}).nome || ''; }

  // ── Lista
  function lista() { return Object.keys(amostras).map(function(id) { return Object.assign({id: id}, amostras[id]); }); }
  function render() {
    var v = $('visao-amo').value, h = hoje(), l = lista();
    if (v === 'receber') l = T.aReceber(l, h);
    else if (v === 'homologar') l = T.aguardandoHomologacao(l);
    else l.sort(function(a, b) { return String((b.solicitante || {}).em || '').localeCompare(String((a.solicitante || {}).em || '')); });
    l = T.filtrar(l, {status: $('fStatus-amo').value, tipo: $('fTipo-amo').value, fornecedorKey: $('fForn-amo').value,
      motivo: $('fMotivo-amo').value, de: $('fDe-amo').value, ate: $('fAte-amo').value});
    var atrasadas = lista().filter(function(a) { return T.atrasada(a, h); }).length;
    $('tableCount-amo').textContent = l.length + ' amostra(s)' + (atrasadas ? ' · ' + atrasadas + ' atrasada(s)' : '');
    if (!l.length) { $('tableBody-amo').innerHTML = '<tr><td colspan="8" class="no-data">Nenhuma amostra nesta visão.</td></tr>'; return; }
    $('tableBody-amo').innerHTML = l.map(function(a) {
      var atr = T.atrasada(a, h), q = a.quantidade || {};
      return '<tr data-id="' + escapeAttr(a.id) + '"' + (atr ? ' class="atrasada"' : '') + '>' +
        '<td><b>' + escapeHtml(a.codigo || '') + '</b></td>' +
        '<td>' + escapeHtml(nomeMaterialAtual(a)) + '</td>' +
        '<td>' + escapeHtml(nomeFornecedorAtual(a)) + '</td>' +
        '<td>' + escapeHtml(T.MOTIVOS[a.motivo] || '') + '</td>' +
        '<td>' + escapeHtml((q.valor != null ? Number(q.valor).toLocaleString('pt-BR') : '') + ' ' + (q.unidade || '')) + '</td>' +
        '<td class="amo-prev">' + dataBr(a.previsaoChegada) + (atr ? ' <span class="badge badge-red">Atrasada</span>' : '') + '</td>' +
        '<td>' + badge(a.status) + '</td>' +
        '<td><button class="btn btn-ghost btn-sm btn-abrir-amo" data-id="' + escapeAttr(a.id) + '">Abrir</button></td></tr>';
    }).join('');
  }
  function preencherFiltroFornecedor() {
    var sel = $('fForn-amo'), atual = sel.value, usados = {};
    lista().forEach(function(a) { if (a.fornecedor && a.fornecedor.key) usados[a.fornecedor.key] = a.fornecedor.nome; });
    sel.innerHTML = opcoes(usados, 'Todos os fornecedores');
    sel.value = usados[atual] ? atual : '';
  }

  // ── Formulário (P&D)
  function preencherSelectFornecedor(manter) {
    var sel = $('amFornecedor'), atual = manter != null ? manter : sel.value, mapa = {};
    Object.keys(fornecedores).filter(function(k) { return fornecedores[k]; })
      .sort(function(a, b) { return nomeForn(fornecedores[a]).localeCompare(nomeForn(fornecedores[b])); })
      .forEach(function(k) { mapa[k] = (nomeForn(fornecedores[k]) || k) + (fornecedores[k].ativo === false ? ' (inativo)' : ''); });
    sel.innerHTML = opcoes(mapa, 'Escolha o fornecedor');
    sel.value = mapa[atual] ? atual : '';
    mostrarReativar();
  }
  // Fornecedor inativo só entra marcando "Reativar" (12/11); o servidor reativa e registra no histórico dele.
  function fornecedorInativo() { var f = fornecedores[$('amFornecedor').value]; return !!f && f.ativo === false; }
  function mostrarReativar() { var inat = fornecedorInativo(); $('amReativarBox').hidden = !inat; if (!inat) $('amReativar').checked = false; }
  function mostrarBlocoTipo() {
    var t = $('amTipo').value;
    document.querySelectorAll('[data-amo-bloco]').forEach(function(el) { el.style.display = el.getAttribute('data-amo-bloco') === t ? '' : 'none'; });
  }
  function abrirForm(id) {
    var a = id ? amostras[id] : null;
    editandoId = id || null; reqForm = novoReq();
    $('modalTitle-amo').textContent = a ? 'Editar amostra ' + (a.codigo || '') : 'Nova solicitação de amostra';
    $('amTipo').value = a ? a.tipo : 'NOVA';
    $('amNome').value = a && a.materialNovo ? a.materialNovo.nome : '';
    $('amDescricao').value = a && a.materialNovo ? (a.materialNovo.descricao || '') : '';
    $('amMaterialKey').value = a && a.material ? (a.material.key || a.material.codigo) : '';
    $('amMaterialBusca').value = a && a.material ? nomeMaterialAtual(a) : '';
    preencherSelectFornecedor(a && a.fornecedor ? a.fornecedor.key : '');
    $('amCustoKg').value = a ? String(a.custoKg).replace('.', ',') : '';
    $('amCustoAmostra').value = a ? String(a.custoAmostra).replace('.', ',') : '';
    $('amQtd').value = a && a.quantidade ? String(a.quantidade.valor).replace('.', ',') : '';
    $('amUnidade').value = a && a.quantidade ? a.quantidade.unidade : 'g';
    $('amMotivo').value = a ? a.motivo : '';
    $('amPrevisao').value = a ? a.previsaoChegada : '';
    $('amPrevisao').min = hoje(); // previsão não nasce no passado (o servidor confere)
    $('amReativar').checked = false;
    $('amObs').value = a ? (a.observacoes || '') : '';
    $('amErro').textContent = '';
    $('amNovoForn').parentNode.style.display = perfil.pd || perfil.admin || perfil.cadastros ? '' : 'none';
    mostrarBlocoTipo();
    $('modalBg-amo').classList.add('open');
  }
  function fecharForm() { $('modalBg-amo').classList.remove('open'); editandoId = null; esperandoForn = null; }
  function salvarForm() {
    var dados = {tipo: $('amTipo').value, materialNovo: {nome: $('amNome').value, descricao: $('amDescricao').value},
      materialKey: $('amMaterialKey').value, fornecedorKey: $('amFornecedor').value, reativarFornecedor: fornecedorInativo() && $('amReativar').checked, custoKg: $('amCustoKg').value.trim(),
      custoAmostra: $('amCustoAmostra').value.trim(), quantidade: {valor: Number($('amQtd').value.replace(',', '.')), unidade: $('amUnidade').value},
      motivo: $('amMotivo').value, previsaoChegada: $('amPrevisao').value, observacoes: $('amObs').value};
    $('amSalvar').disabled = true; $('amErro').textContent = '';
    chamar(editandoId ? 'EDITAR' : 'CRIAR', editandoId, dados, reqForm).then(function(r) {
      fecharForm();
      showAlert('Amostra ' + (r.codigo || '') + (r.status === 'SOLICITADA' && !editandoId ? ' registrada.' : ' salva.'), 'success');
    }).catch(function(e) { $('amErro').textContent = msg(e); })
      .then(function() { $('amSalvar').disabled = false; });
  }

  // ── Detalhe e ações
  function historicoHtml(a) {
    var ev = Object.keys(a.historico || {}).map(function(k) { return a.historico[k]; })
      .sort(function(x, y) { return String(x.em || '').localeCompare(String(y.em || '')); });
    return '<ol id="amHistorico">' + ev.map(function(e) {
      return '<li>' + escapeHtml(dataHoraBr(e.em)) + ' · <b>' + escapeHtml(T.STATUS[e.para] || e.para || '') + '</b> · ' +
        escapeHtml((e.por && e.por.nome) || '') + (e.acao === 'EDITAR' ? ' (editou: ' + escapeHtml((e.campos || []).join(', ')) + ')' : '') + '</li>';
    }).join('') + '</ol>';
  }
  function linha(rot, val) { return '<div><span style="color:var(--muted)">' + escapeHtml(rot) + ':</span> ' + val + '</div>'; }
  function renderDetalhe() {
    var a = amostras[detalheId];
    if (!a) return;
    detalheVersao = a.atualizadoEm || '';
    var q = a.quantidade || {}, h = hoje();
    $('modalTitleDet-amo').textContent = 'Amostra ' + (a.codigo || '');
    $('amDetCorpo').innerHTML =
      linha('Matéria-prima', escapeHtml(nomeMaterialAtual(a)) + (a.materialNovo && a.materialNovo.descricao ? ' — ' + escapeHtml(a.materialNovo.descricao) : '') +
        (nomeMaterialAtual(a) !== T.nomeMaterial(a) ? '<div class="field-hint">Na solicitação: ' + escapeHtml(T.nomeMaterial(a)) + '</div>' : '')) +
      linha('Fornecedor', escapeHtml(nomeFornecedorAtual(a)) + (a.fornecedor && nomeFornecedorAtual(a) !== a.fornecedor.nome ? '<div class="field-hint">Na solicitação: ' + escapeHtml(a.fornecedor.nome) + '</div>' : '')) +
      linha('Motivo', escapeHtml(T.MOTIVOS[a.motivo] || '')) +
      linha('Quantidade', escapeHtml(q.valor + ' ' + (q.unidade || ''))) +
      linha('Custo', brl(a.custoKg) + '/kg · amostra ' + brl(a.custoAmostra)) +
      linha('Previsão de chegada', dataBr(a.previsaoChegada) + (T.atrasada(a, h) ? ' <span class="badge badge-red">Atrasada</span>' : '')) +
      linha('Status', badge(a.status)) +
      (a.recebimento ? linha('Recebida', dataBr(a.recebimento.data) + ' · ' + escapeHtml(T.FORMAS[a.recebimento.forma] || '') + ' · ' + escapeHtml((a.recebimento.por || {}).nome || '')) : '') +
      (a.parecer && a.parecer.texto ? linha('Parecer', escapeHtml(a.parecer.texto)) : '') +
      (a.cancelamento ? linha('Cancelada', escapeHtml(a.cancelamento.motivo)) : '') +
      (a.observacoes ? linha('Observações', escapeHtml(a.observacoes)) : '') +
      '<div class="section-label" style="margin-top:10px">Histórico</div>' + historicoHtml(a);
    var acoes = T.acoesVisiveis(a, perfil), html = '';
    if (acoes.indexOf('RECEBER') !== -1) {
      html += '<div class="section-label">Dar baixa no recebimento</div><div class="form-grid">' +
        '<div class="form-group"><label for="amRecData">Data do recebimento</label><input type="date" id="amRecData" value="' + h + '" max="' + h + '" min="' +
          escapeAttr(T.hojeBrasilia(new Date((a.solicitante && a.solicitante.em) || Date.now()))) + '"></div>' +
        '<div class="form-group"><label for="amRecForma">Forma de entrega</label><select id="amRecForma">' + opcoes(T.FORMAS, 'Escolha') + '</select></div></div>' +
        '<button class="btn btn-primary" data-acao="RECEBER">Dar baixa</button>';
    }
    if (acoes.indexOf('HOMOLOGAR') !== -1) {
      html += '<div class="section-label">Homologação</div><div class="form-group full"><label for="amParecer">Parecer (obrigatório para reprovar)</label>' +
        '<textarea id="amParecer" rows="2" maxlength="2000"></textarea></div>' +
        '<button class="btn btn-primary" data-acao="HOMOLOGAR">Homologar</button> <button class="btn btn-ghost" data-acao="REPROVAR">Reprovar</button>';
    }
    if (acoes.indexOf('EDITAR') !== -1) html += '<div style="margin-top:10px"><button class="btn btn-ghost" data-acao="EDITAR">Editar</button></div>';
    if (acoes.indexOf('CANCELAR') !== -1) {
      html += '<div class="form-group full" style="margin-top:6px"><label for="amMotivoCanc">Motivo do cancelamento</label><input type="text" id="amMotivoCanc" maxlength="500"></div>' +
        '<button class="btn btn-ghost" data-acao="CANCELAR">Cancelar solicitação</button>';
    }
    if (a.status === 'HOMOLOGADA' && a.tipo === 'NOVA' && (perfil.pd || perfil.admin || perfil.cadastros)) {
      html += '<div style="margin-top:10px"><button class="btn btn-primary" id="amCadastrarMp">Cadastrar MP</button>' +
        '<div class="field-hint">Abre o cadastro já preenchido, com o fornecedor Aguardando homologação (ou manda para a fila de cadastro de MP). Nada é cadastrado sozinho.</div></div>';
    }
    if (a.status === 'HOMOLOGADA' && a.tipo === 'CADASTRADA' && a.motivo === 'HOMOLOGAR_FORNECEDOR' && perfil.cadastros) {
      html += '<div style="margin-top:10px"><button class="btn btn-ghost" id="amAbrirMaterial">Abrir o material no Cadastros</button>' +
        '<div class="field-hint">Para marcar ' + escapeHtml((a.fornecedor || {}).nome || 'o fornecedor') + ' como Homologado no material.</div></div>';
    }
    $('amDetAcoes').innerHTML = html;
  }
  function abrirDetalhe(id) { detalheId = id; reqAcao = novoReq(); $('amDetErro').textContent = ''; renderDetalhe(); $('modalBgDet-amo').classList.add('open'); }
  function fecharDetalhe() { $('modalBgDet-amo').classList.remove('open'); detalheId = null; }
  function executar(acao) {
    var a = amostras[detalheId];
    if (!a) return;
    if (acao === 'EDITAR') { var id = detalheId; fecharDetalhe(); abrirForm(id); return; }
    var dados = {};
    if (acao === 'RECEBER') dados = {data: $('amRecData').value, forma: $('amRecForma').value};
    if (acao === 'HOMOLOGAR' || acao === 'REPROVAR') dados = {parecer: $('amParecer').value};
    if (acao === 'CANCELAR') dados = {motivo: $('amMotivoCanc').value};
    var falta = acao === 'REPROVAR' && !dados.parecer.trim() ? 'Escreva o parecer para reprovar.' :
      acao === 'CANCELAR' && !dados.motivo.trim() ? 'Informe o motivo do cancelamento.' :
      acao === 'RECEBER' && !dados.forma ? 'Escolha a forma de entrega.' : '';
    if (falta) { $('amDetErro').textContent = falta; return; }
    $('amDetErro').textContent = '';
    $('amDetAcoes').querySelectorAll('button').forEach(function(b) { b.disabled = true; });
    chamar(acao, detalheId, dados, reqAcao).then(function(r) {
      reqAcao = novoReq();
      showAlert('Amostra ' + (a.codigo || '') + ': ' + (T.STATUS[r.status] || r.status || 'atualizada') + '.', 'success');
    }).catch(function(e) {
      $('amDetErro').textContent = msg(e);
      $('amDetAcoes').querySelectorAll('button').forEach(function(b) { b.disabled = false; });
    });
  }

  // ── Atalhos depois de homologar
  function esperar(cond, ms) {
    return new Promise(function(ok) { var t0 = Date.now(); (function loop() { if (cond() || Date.now() - t0 > (ms || 3000)) ok(cond()); else setTimeout(loop, 60); })(); });
  }
  function cadastrarMp() {
    var a = amostras[detalheId], id = detalheId;
    if (!a || !a.materialNovo) return;
    var nome = a.materialNovo.nome, n = DuplicidadeMaterial.normalizar(nome), chave = 'NOME__' + n.replace(/ /g, '_');
    var b = 'solicitacoes_cadastro_material/' + chave, agora = new Date().toISOString();
    var entrada = {amostraMp: id, codigo: a.codigo || '', ativa: true, registradaEm: agora};
    return db.ref(b).once('value').then(function(s) {
      var ex = s.val(), up = {};
      if (ex && ex.status === 'CADASTRADO') { showAlert('Esta MP já foi cadastrada como ' + (ex.mpCodigo || '') + '.', 'warning'); return null; }
      if (!ex) {
        up[b] = {status: 'PENDENTE_CADASTRO', amostra_em_desenvolvimento: false, marca: 'amostra de MP homologada', chave_nome: n,
          tipo: /fragr|parfum|perfum|essenc|aroma/i.test(nome) ? 'MPES' : 'MPGR', nome: nome, inci: '', fornecedor: (a.fornecedor || {}).nome || '',
          campos: {inci: '', funcao: '', fornecedor: (a.fornecedor || {}).nome || '', preco_brl_kg: a.custoKg, preco_usd_kg: null},
          origem: {amostra: a.codigo || ''}, nasceu_em: 'amostra_mp_homologada', criadoEm: agora, criadoPor: (window.currentUser || {}).nome || ''};
        up[b].origens = {}; up[b].origens['amostraMp_' + id] = entrada;
      } else {
        up[b + '/origens/amostraMp_' + id] = entrada;
        if (ex.status === 'CANCELADO') { up[b + '/status'] = 'PENDENTE_CADASTRO'; up[b + '/reabertaEm'] = agora; }
      }
      return db.ref().update(up).then(function() { return chave; });
    }).then(function(k) {
      if (!k) return;
      if (!(perfil.cadastros && window.CadastrosMateriais)) {
        showAlert('Enviada para a fila de cadastro de MP (Cadastros › Materiais), com fornecedor e custo/kg.', 'success');
        return;
      }
      fecharDetalhe();
      activateMainTab('materiais', true);
      return esperar(function() { return CadastrosMateriais.temSolicitacao(k); }).then(function(pronto) {
        if (!pronto) { showAlert('A tarefa foi para a fila de cadastro de MP; abra-a em Materiais.', 'warning'); return; }
        CadastrosMateriais.abrirSolicitacao(k);
        var esp = $('fEspecificacoes');
        if (esp && a.materialNovo.descricao) esp.value = [esp.value, a.materialNovo.descricao].filter(Boolean).join('\n');
        if (a.fornecedor) CadastrosMateriais.definirFornecedorDaAmostra(a.fornecedor.key, a.custoKg);
      });
    }).catch(function(e) { $('amDetErro').textContent = msg(e); });
  }

  // ── Perfil, eventos e dados
  function aplicarPerfil(u) {
    if (!u) return;
    perfil = T.papel(u);
    if (typeof usuarioTemModulo === 'function') perfil.cadastros = perfil.admin || usuarioTemModulo(u, 'cadastros');
    if (!perfil.cadastros && typeof limitarAbasCadastros === 'function') limitarAbasCadastros(T.abasVisiveis(perfil));
    document.body.classList.toggle('amo-so-cria-forn', !perfil.cadastros);
    $('btnNova-amo').style.display = perfil.pd || perfil.admin ? '' : 'none';
    if (perfil.logistica && !perfil.pd && !perfil.admin) $('visao-amo').value = 'receber';
    // O modal de fornecedor mora na aba Fornecedores; vai para o body para abrir por cima da amostra.
    var mf = $('modalFornecedor-forn');
    if (mf && mf.parentNode !== document.body) document.body.appendChild(mf);
    render();
  }

  $('fStatus-amo').innerHTML = opcoes(T.STATUS, 'Todos os status');
  $('fTipo-amo').innerHTML = opcoes(T.TIPOS, 'Todos os tipos');
  $('fMotivo-amo').innerHTML = opcoes(T.MOTIVOS, 'Todos os motivos');
  $('amTipo').innerHTML = opcoes(T.TIPOS);
  $('amUnidade').innerHTML = opcoes(T.UNIDADES);
  $('amMotivo').innerHTML = opcoes(T.MOTIVOS, 'Escolha o motivo');
  ['visao-amo', 'fStatus-amo', 'fTipo-amo', 'fForn-amo', 'fMotivo-amo', 'fDe-amo', 'fAte-amo'].forEach(function(id) { $(id).addEventListener('change', render); });
  $('btnNova-amo').addEventListener('click', function() { abrirForm(null); });
  $('amTipo').addEventListener('change', mostrarBlocoTipo);
  $('amFornecedor').addEventListener('change', mostrarReativar);
  $('amSalvar').addEventListener('click', salvarForm);
  $('amCancelar').addEventListener('click', fecharForm);
  $('modalClose-amo').addEventListener('click', fecharForm);
  $('modalCloseDet-amo').addEventListener('click', fecharDetalhe);
  $('modalBgDet-amo').addEventListener('click', function(e) { if (e.target === this) fecharDetalhe(); });
  $('amNovoForn').addEventListener('click', function(e) {
    e.preventDefault();
    esperandoForn = Object.keys(fornecedores);
    var btn = $('btnNovoFornecedor-forn');
    if (btn) btn.click();
  });
  $('tableBody-amo').addEventListener('click', function(e) { var b = e.target.closest('.btn-abrir-amo'); if (b) abrirDetalhe(b.getAttribute('data-id')); });
  $('amDetAcoes').addEventListener('click', function(e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'amCadastrarMp') return cadastrarMp();
    if (b.id === 'amAbrirMaterial') {
      var a = amostras[detalheId];
      fecharDetalhe(); activateMainTab('materiais', true);
      if (a && a.material && window.CadastrosMateriais) CadastrosMateriais.abrirMaterial(a.material.key || a.material.codigo);
      return;
    }
    if (b.getAttribute('data-acao')) executar(b.getAttribute('data-acao'));
  });
  attachAutocomplete($('amMaterialBusca'), function() {
    return Object.keys(materiais).filter(function(k) { return materiais[k] && materiais[k].ativo !== false; }).sort().map(function(k) {
      var m = materiais[k], rot = (m.mpCodigo || k) + ' — ' + (m.mpNome || '');
      return {key: k, value: rot, label: rot}; // chave do banco; o código vem do registro no servidor
    });
  }, {onSelect: function(it) { $('amMaterialKey').value = it.key; }});
  $('amMaterialBusca').addEventListener('input', function() { $('amMaterialKey').value = ''; });

  dbOnValue(db.ref('amostras_mp'), function(snap) {
    amostras = snap.val() || {};
    preencherFiltroFornecedor(); render();
    if (detalheId && amostras[detalheId] && (amostras[detalheId].atualizadoEm || '') !== detalheVersao) renderDetalhe();
  }, {onError: function(err) {
    $('tableBody-amo').innerHTML = '<tr><td colspan="8" class="no-data">Sem permissão para ler as amostras (' + escapeHtml((err && err.code) || String(err)) + '). Falta publicar a regra do banco para amostras_mp/.</td></tr>';
  }});
  dbOnValue(db.ref('fornecedores'), function(snap) {
    fornecedores = snap.val() || {};
    var novo = esperandoForn ? Object.keys(fornecedores).filter(function(k) { return esperandoForn.indexOf(k) === -1; })[0] : null;
    preencherSelectFornecedor(novo || null);
    if (novo) esperandoForn = null;
  });
  dbOnValue(db.ref('materiais'), function(snap) { materiais = snap.val() || {}; });
  if (window.currentUser) aplicarPerfil(window.currentUser);
  window.addEventListener('kuryos-auth-pronto', function(e) { aplicarPerfil((e && e.detail) || window.currentUser); });
})();
