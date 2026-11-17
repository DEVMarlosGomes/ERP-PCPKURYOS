/* Tela de Manutenção › Ativos (ativos.html). Regras em shared/ativos.js. */
(function() {
  'use strict';
  var A = window.Ativos;
  var db = firebase.database();
  var S = {ativos: {}, config: {}, fornecedores: {}, materiais: {}, scs: {}, f: {busca: '', tipo: '', area: '', linha: '', situacao: '', marcador: ''}, carregado: false};

  /* ── Integração com Cadastros e Compras (16/11/2026) ──
     Fornecedor e peça vêm do cadastro por um rótulo único no <datalist>
     ("NOME · CNPJ" / "MN-00001 — ROLAMENTO"); o rótulo volta para a chave. */
  function rotuloFornecedor(k) { var f = S.fornecedores[k] || {}; return A.nomeFornecedor(f) + (f.cnpj ? ' · ' + f.cnpj : '') + ' [' + k.slice(-4) + ']'; }
  function chaveDoRotuloFornecedor(r) {
    r = String(r || '').trim();
    if (!r) return '';
    return Object.keys(S.fornecedores).find(function(k) { return rotuloFornecedor(k) === r; }) || null;
  }
  function rotuloMaterial(m) { return m.mpCodigo + ' — ' + (m.mpNome || ''); }
  function materialDoRotulo(r) {
    r = String(r || '').trim();
    var cod = r.split(' — ')[0].trim().toUpperCase();
    var k = Object.keys(S.materiais).find(function(x) { return String((S.materiais[x] || {}).mpCodigo || '').toUpperCase() === cod; });
    return k ? S.materiais[k] : null;
  }
  function chaveMaterial(cod) { return String(cod || '').replace(/[.#$\[\]\/]/g, '-'); }
  function datalists() {
    var dl = el('dlFornecedores');
    if (dl && dl.getAttribute('data-n') !== String(Object.keys(S.fornecedores).length)) {
      dl.innerHTML = Object.keys(S.fornecedores).filter(function(k) { return S.fornecedores[k] && S.fornecedores[k].ativo !== false; })
        .map(function(k) { return '<option value="' + e(rotuloFornecedor(k)) + '">'; }).join('');
      dl.setAttribute('data-n', String(Object.keys(S.fornecedores).length));
    }
    var dp = el('dlPecas');
    if (dp && dp.getAttribute('data-n') !== String(Object.keys(S.materiais).length)) {
      dp.innerHTML = Object.keys(S.materiais).map(function(k) { return S.materiais[k]; })
        .filter(function(m) { return m && m.mpCodigo && A.TIPOS_PECA.indexOf(m.tipo) >= 0 && m.ativo !== false; })
        .map(function(m) { return '<option value="' + e(rotuloMaterial(m)) + '">'; }).join('');
      dp.setAttribute('data-n', String(Object.keys(S.materiais).length));
    }
  }
  function usuarioTem(mod) {
    var u = window.currentUser;
    if (!u) return false;
    if (u.role === 'admin') return true;
    return typeof window.usuarioTemModulo === 'function' ? window.usuarioTemModulo(u, mod) : !!(u.modulos && u.modulos[mod]);
  }
  // Espelha a regra de solicitacoes_compra (criação): ADM, PCP, Compras e, desde 16/11, Manutenção.
  function podeSolicitar() {
    var u = window.currentUser || {};
    return u.role === 'admin' || u.role === 'pcp' || !!(u.modulos && (u.modulos.compras === true || u.modulos.manutencao === true));
  }
  function comprasAbertas(id) {
    return A.comprasDoAtivo(id, S.scs, {}, {}).filter(function(c) { return c.status !== 'REJEITADA' && c.status !== 'CONSOLIDADA'; }).length;
  }

  function el(id) { return document.getElementById(id); }
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
  function nomeUsuario() { var u = window.currentUser || {}; return u.nome || u.email || (firebase.auth().currentUser && firebase.auth().currentUser.email) || 'Usuário'; }
  function agora() { return new Date().toISOString(); }
  function dataBR(iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}); }
  function fmt(n) { return n == null || n === '' ? '' : Number(n).toLocaleString('pt-BR'); }
  function toast(msg, erro) {
    var t = document.createElement('div'); t.className = 'toast' + (erro ? ' erro' : ''); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function() { t.remove(); }, 6000);
  }

  // Linhas e postos de onde o equipamento pode estar (os mesmos do apontamento).
  function locais() {
    var c = S.config || {};
    var arr = [].concat(c.linhas || [], c.rotulagem || [], c.postos || []).filter(Boolean);
    Object.keys(S.ativos).forEach(function(k) { var l = (S.ativos[k] || {}).linha; if (l && arr.indexOf(l) < 0) arr.push(l); });
    return arr;
  }
  function opcoes(obj, sel, vazio) {
    return (vazio != null ? '<option value="">' + e(vazio) + '</option>' : '') +
      Object.keys(obj).map(function(k) { var r = typeof obj[k] === 'string' ? obj[k] : obj[k].rotulo; return '<option value="' + e(k) + '"' + (k === sel ? ' selected' : '') + '>' + e(r) + '</option>'; }).join('');
  }
  function opcoesLista(arr, sel, vazio) {
    return '<option value="">' + e(vazio) + '</option>' + arr.map(function(x) { return '<option' + (x === sel ? ' selected' : '') + '>' + e(x) + '</option>'; }).join('');
  }

  /* ── Painel e lista ── */
  function render() {
    if (!S.carregado) return;
    var r = A.resumo(S.ativos), f = S.f;
    var card = function(id, rot, val, filtro) {
      var on = (filtro.situacao && f.situacao === filtro.situacao) || (filtro.marcador && f.marcador === filtro.marcador) || (!filtro.situacao && !filtro.marcador && !f.situacao && !f.marcador);
      return '<button type="button" class="stat' + (on ? ' on' : '') + '" data-card="' + id + '" aria-pressed="' + on + '"><b>' + val + '</b><span>' + rot + '</span></button>';
    };
    el('painel').innerHTML =
      card('todos', 'Equipamentos', r.total, {}) +
      card('op', 'Operacionais', r.porSituacao.OPERACIONAL, {situacao: 'OPERACIONAL'}) +
      card('man', 'Em manutenção', r.porSituacao.EM_MANUTENCAO, {situacao: 'EM_MANUTENCAO'}) +
      card('ina', 'Inativos', r.porSituacao.INATIVO, {situacao: 'INATIVO'}) +
      card('ase', 'Pedem assepsia', r.assepsia, {marcador: 'assepsia'}) +
      card('cal', 'Pedem calibração', r.calibracao, {marcador: 'calibracao'});
    el('painel').querySelectorAll('[data-card]').forEach(function(b) {
      b.onclick = function() {
        var id = b.getAttribute('data-card');
        var m = {todos: {}, op: {situacao: 'OPERACIONAL'}, man: {situacao: 'EM_MANUTENCAO'}, ina: {situacao: 'INATIVO'}, ase: {marcador: 'assepsia'}, cal: {marcador: 'calibracao'}}[id];
        var mesmo = (m.situacao && f.situacao === m.situacao) || (m.marcador && f.marcador === m.marcador);
        f.situacao = mesmo ? '' : (m.situacao || ''); f.marcador = mesmo ? '' : (m.marcador || '');
        render();
      };
    });
    var fT = el('fTipo'), fA = el('fArea'), fL = el('fLinha');
    var hT = opcoes(A.TIPOS, f.tipo, 'Todos os tipos'), hA = opcoes(A.AREAS, f.area, 'Todas as áreas'), hL = opcoesLista(locais(), f.linha, 'Todas as linhas/postos');
    if (fT.getAttribute('data-h') !== hT) { fT.innerHTML = hT; fT.setAttribute('data-h', hT); }
    if (fA.getAttribute('data-h') !== hA) { fA.innerHTML = hA; fA.setAttribute('data-h', hA); }
    if (fL.getAttribute('data-h') !== hL) { fL.innerHTML = hL; fL.setAttribute('data-h', hL); }

    var itens = A.filtrar(S.ativos, f);
    var corpo = el('lista');
    if (!r.total) {
      corpo.innerHTML = '<div class="vazio"><b>Nenhum equipamento cadastrado ainda.</b><br>Comece pelos reatores e tachos da manipulação e pelas máquinas de cada linha de envase — são eles que a assepsia e o first article vão usar.<br><br><button class="btn pri" type="button" data-novo>+ Cadastrar o primeiro</button></div>';
    } else if (!itens.length) {
      corpo.innerHTML = '<div class="vazio">Nenhum equipamento com esses filtros.</div>';
    } else {
      corpo.innerHTML = '<div class="tw"><table><thead><tr><th>Código</th><th>Equipamento</th><th>Área / local</th><th>Capacidade</th><th>Pede</th><th>Situação</th><th></th></tr></thead><tbody>' +
        itens.map(function(a) {
          var t = A.TIPOS[a.tipo] || A.TIPOS.OUTRO, s = A.SITUACOES[a.situacao] || A.SITUACOES.OPERACIONAL;
          var pede = (a.exigeAssepsia ? '<span class="tg info">assepsia</span> ' : '') + (a.exigeCalibracao ? '<span class="tg info">calibração ' + (a.calibracaoPeriodicidadeMeses || 12) + 'm</span>' : '');
          return '<tr data-id="' + e(a.id) + '"><td><b class="cod">' + e(a.codigo) + '</b></td>' +
            '<td>' + e(a.nome) + '<div class="dica">' + e(t.rotulo) + [a.fabricante, a.modelo].filter(Boolean).map(function(x) { return ' · ' + e(x); }).join('') + '</div>' +
              (a.fornecedorAssistenciaNome ? '<div class="dica">Assistência: ' + e(a.fornecedorAssistenciaNome) + '</div>' : '') + '</td>' +
            '<td>' + e(A.AREAS[a.area] || '—') + (a.linha ? '<div class="dica">' + e(a.linha) + '</div>' : '') + '</td>' +
            '<td>' + (a.capacidade != null ? fmt(a.capacidade) + ' ' + e(a.capacidadeUnidade || '') : '<span class="mut">—</span>') + '</td>' +
            '<td>' + (pede || '<span class="mut">—</span>') + '</td>' +
            '<td><span class="tg ' + s.cor + '">' + e(s.rotulo) + '</span>' + (a.situacaoMotivo && a.situacao !== 'OPERACIONAL' ? '<div class="dica">' + e(a.situacaoMotivo) + '</div>' : '') + '</td>' +
            '<td class="acoes"><button class="btn sm" type="button" data-editar="' + e(a.id) + '">Editar</button> <button class="btn sm" type="button" data-situacao="' + e(a.id) + '">Situação</button> <button class="btn sm" type="button" data-hist="' + e(a.id) + '">Histórico</button>' +
              ' <button class="btn sm" type="button" data-pecas="' + e(a.id) + '">Peças e compras' + (function() {
                var n = comprasAbertas(a.id), p = Object.keys(a.pecas || {}).length;
                return (p ? ' <span class="tg info">' + p + ' peça' + (p > 1 ? 's' : '') + '</span>' : '') + (n ? ' <span class="tg warn">' + n + ' em compra</span>' : '');
              })() + '</button></td></tr>';
        }).join('') + '</tbody></table></div><div class="dica" style="margin-top:8px">' + itens.length + ' de ' + r.total + ' equipamento(s).</div>';
    }
    corpo.querySelectorAll('[data-editar]').forEach(function(b) { b.onclick = function() { abrirForm(b.getAttribute('data-editar')); }; });
    corpo.querySelectorAll('[data-situacao]').forEach(function(b) { b.onclick = function() { abrirSituacao(b.getAttribute('data-situacao')); }; });
    corpo.querySelectorAll('[data-hist]').forEach(function(b) { b.onclick = function() { abrirHistorico(b.getAttribute('data-hist')); }; });
    corpo.querySelectorAll('[data-pecas]').forEach(function(b) { b.onclick = function() { abrirPecasCompras(b.getAttribute('data-pecas')); }; });
    corpo.querySelectorAll('[data-novo]').forEach(function(b) { b.onclick = function() { abrirForm(null); }; });
  }

  /* ── Modais ── */
  function modal(html) {
    el('modais').innerHTML = '<div class="mf" id="mf"><div class="md" role="dialog" aria-modal="true">' + html + '</div></div>';
    el('mf').addEventListener('mousedown', function(ev) { if (ev.target.id === 'mf') fechar(); });
    document.addEventListener('keydown', escFecha);
  }
  function escFecha(ev) { if (ev.key === 'Escape') fechar(); }
  function fechar() { el('modais').innerHTML = ''; S.modalAtivo = null; document.removeEventListener('keydown', escFecha); }

  function abrirForm(id) {
    var a = id ? S.ativos[id] || {} : {};
    var novo = !id;
    var tipo = a.tipo || 'REATOR';
    modal('<h2>' + (novo ? 'Novo equipamento' : 'Editar ' + e(a.codigo)) + '</h2>' +
      '<div class="grid2">' +
        '<div><label class="t" for="aTipo">Tipo *</label><select id="aTipo">' + opcoes(A.TIPOS, tipo) + '</select></div>' +
        '<div><label class="t" for="aCodigo">Código (TAG) *</label><input type="text" id="aCodigo" value="' + e(a.codigo || A.sugerirCodigo(tipo, S.ativos)) + '"><div class="dica">O que está (ou vai estar) plaqueado no equipamento.</div></div>' +
        '<div style="grid-column:1/-1"><label class="t" for="aNome">Nome *</label><input type="text" id="aNome" value="' + e(a.nome || '') + '" placeholder="Ex.: Reator inox 500 kg com agitador"></div>' +
        '<div><label class="t" for="aArea">Área *</label><select id="aArea">' + opcoes(A.AREAS, a.area || A.padroesDoTipo(tipo).area) + '</select></div>' +
        '<div><label class="t" for="aLinha">Linha / posto</label><select id="aLinha">' + opcoesLista(locais(), a.linha || '', '— nenhum (fixo na área) —') + '</select></div>' +
        '<div><label class="t" for="aCap">Capacidade</label><input type="text" id="aCap" inputmode="decimal" value="' + e(a.capacidade == null ? '' : a.capacidade) + '"></div>' +
        '<div><label class="t" for="aCapUn">Unidade</label><input type="text" id="aCapUn" value="' + e(a.capacidadeUnidade || A.padroesDoTipo(tipo).unidade || '') + '" placeholder="kg, L, un/h"></div>' +
        '<div><label class="t" for="aFab">Fabricante (como está na placa)</label><input type="text" id="aFab" value="' + e(a.fabricante || '') + '"></div>' +
        '<div><label class="t" for="aFabForn">Fabricante no cadastro de fornecedores</label><input type="text" id="aFabForn" list="dlFornecedores" autocomplete="off" placeholder="Digite para buscar…" value="' +
          e(a.fornecedorFabricanteKey && S.fornecedores[a.fornecedorFabricanteKey] ? rotuloFornecedor(a.fornecedorFabricanteKey) : '') + '"><div class="dica" id="aFabSug"></div></div>' +
        '<div style="grid-column:1/-1"><label class="t" for="aAssForn">Assistência técnica (quem conserta)</label><input type="text" id="aAssForn" list="dlFornecedores" autocomplete="off" placeholder="Digite para buscar… — é quem Compras convida para orçar o conserto" value="' +
          e(a.fornecedorAssistenciaKey && S.fornecedores[a.fornecedorAssistenciaKey] ? rotuloFornecedor(a.fornecedorAssistenciaKey) : '') + '"><div class="dica">Fornecedor que falta: cadastre em <a href="cadastros.html?tab=fornecedores" target="_blank" rel="noopener">Cadastros › Fornecedores</a> e volte aqui.</div></div>' +
        '<div><label class="t" for="aMod">Modelo</label><input type="text" id="aMod" value="' + e(a.modelo || '') + '"></div>' +
        '<div><label class="t" for="aSerie">Nº de série</label><input type="text" id="aSerie" value="' + e(a.numeroSerie || '') + '"></div>' +
        '<div><label class="t" for="aPat">Patrimônio</label><input type="text" id="aPat" value="' + e(a.patrimonio || '') + '"></div>' +
        '<div><label class="t" for="aData">Data de aquisição</label><input type="date" id="aData" value="' + e(a.dataAquisicao || '') + '"></div>' +
      '</div>' +
      '<div class="checks">' +
        '<label><input type="checkbox" id="aAsep"' + ((a.exigeAssepsia != null ? a.exigeAssepsia : A.padroesDoTipo(tipo).assepsia) ? ' checked' : '') + '> Pede <b>assepsia</b> (limpeza e sanitização liberada pela Qualidade antes de usar)</label>' +
        '<label><input type="checkbox" id="aCalib"' + ((a.exigeCalibracao != null ? a.exigeCalibracao : A.padroesDoTipo(tipo).calibracao) ? ' checked' : '') + '> Pede <b>calibração</b> a cada <input type="number" id="aPer" min="1" style="width:70px" value="' + e(a.calibracaoPeriodicidadeMeses || A.PERIODICIDADE_PADRAO_MESES) + '"> mês(es)</label>' +
      '</div>' +
      '<div><label class="t" for="aObs">Observações</label><textarea id="aObs" rows="2">' + e(a.obs || '') + '</textarea></div>' +
      '<div class="aviso bad" id="aErros" hidden></div>' +
      '<div class="rodape"><button class="btn" type="button" id="aCancelar">Cancelar</button><button class="btn pri" type="button" id="aSalvar">' + (novo ? 'Cadastrar' : 'Salvar') + '</button></div>');
    var tocouCodigo = !novo;
    el('aCodigo').addEventListener('input', function() { tocouCodigo = true; });
    el('aTipo').onchange = function() {
      // Trocar o tipo ajusta os padrões (área, unidade, assepsia, calibração) e o código sugerido.
      var p = A.padroesDoTipo(el('aTipo').value);
      el('aArea').value = p.area; el('aCapUn').value = p.unidade || '';
      el('aAsep').checked = p.assepsia; el('aCalib').checked = p.calibracao;
      if (!tocouCodigo) el('aCodigo').value = A.sugerirCodigo(el('aTipo').value, S.ativos);
    };
    // Sugestões do cadastro a partir do fabricante digitado (só a marca casa;
    // ver sugerirFornecedores). Clicar preenche; ninguém é escolhido sozinho.
    function sugerir() {
      var box = el('aFabSug');
      if (el('aFabForn').value.trim()) { box.innerHTML = ''; return; }
      var sug = A.sugerirFornecedores(el('aFab').value, S.fornecedores, 3);
      box.innerHTML = sug.length
        ? 'Parece com: ' + sug.map(function(s) { return '<button type="button" class="btn sm" data-sug="' + e(s.key) + '">' + e(s.nome) + '</button>'; }).join(' ')
        : (el('aFab').value.trim().length >= 3 ? 'Não achei este fabricante no cadastro de fornecedores.' : '');
      box.querySelectorAll('[data-sug]').forEach(function(b) {
        b.onclick = function() { el('aFabForn').value = rotuloFornecedor(b.getAttribute('data-sug')); sugerir(); };
      });
    }
    el('aFab').addEventListener('input', sugerir);
    el('aFabForn').addEventListener('input', sugerir);
    sugerir();
    el('aCancelar').onclick = fechar;
    el('aSalvar').onclick = function() { salvar(id); };
    el(novo ? 'aNome' : 'aCodigo').focus();
  }

  function salvar(id) {
    var ant = id ? S.ativos[id] || {} : {};
    var fabKey = chaveDoRotuloFornecedor(el('aFabForn').value), assKey = chaveDoRotuloFornecedor(el('aAssForn').value);
    if (fabKey === null || assKey === null) {
      el('aErros').hidden = false;
      el('aErros').textContent = 'Escolha o fornecedor na lista (digite e clique na opção) ou deixe o campo vazio.';
      return;
    }
    var a = A.normalizar({
      fornecedorFabricanteKey: fabKey, fornecedorAssistenciaKey: assKey,
      fornecedorFabricanteNome: ant.fornecedorFabricanteNome, fornecedorAssistenciaNome: ant.fornecedorAssistenciaNome,
      tipo: el('aTipo').value, codigo: el('aCodigo').value, nome: el('aNome').value, area: el('aArea').value,
      linha: el('aLinha').value, capacidade: el('aCap').value, capacidadeUnidade: el('aCapUn').value,
      fabricante: el('aFab').value, modelo: el('aMod').value, numeroSerie: el('aSerie').value, patrimonio: el('aPat').value,
      dataAquisicao: el('aData').value, exigeAssepsia: el('aAsep').checked, exigeCalibracao: el('aCalib').checked,
      calibracaoPeriodicidadeMeses: el('aPer').value, obs: el('aObs').value, situacao: ant.situacao
    }, S.fornecedores);
    var erros = A.validar(a, S.ativos, id);
    if (erros.length) { el('aErros').hidden = false; el('aErros').innerHTML = erros.map(e).join('<br>'); return; }
    var t = agora(), por = nomeUsuario();
    var ref = id ? db.ref('ativos/' + id) : db.ref('ativos').push();
    var dados = Object.assign({}, a, {atualizadoEm: t, atualizadoPor: por});
    if (!id) Object.assign(dados, {criadoEm: t, criadoPor: por, situacaoDesde: t});
    // `pecas` é editado no modal Peças e compras; o set() do cadastro não pode apagá-lo.
    else ['criadoEm', 'criadoPor', 'situacaoDesde', 'situacaoMotivo', 'limpeza', 'pecas'].forEach(function(k) { if (ant[k] !== undefined) dados[k] = ant[k]; });
    el('aSalvar').disabled = true;
    ref.set(dados).then(function() {
      fechar(); toast((id ? 'Equipamento ' : 'Cadastrado: ') + a.codigo + (id ? ' salvo.' : ''));
    }).catch(function(err) {
      el('aSalvar').disabled = false; el('aErros').hidden = false; el('aErros').textContent = 'Não foi possível gravar: ' + err.message;
    });
  }

  function abrirSituacao(id) {
    var a = S.ativos[id] || {}, atual = a.situacao || 'OPERACIONAL';
    modal('<h2>Situação de ' + e(a.codigo) + '</h2><div class="dica">' + e(a.nome) + ' · hoje: <b>' + e(A.SITUACOES[atual].rotulo) + '</b>' + (a.situacaoDesde ? ' desde ' + dataBR(a.situacaoDesde) : '') + '</div>' +
      '<div class="seg" id="sSeg" style="margin:14px 0">' + Object.keys(A.SITUACOES).filter(function(k) { return k !== atual; }).map(function(k, i) {
        return '<button type="button" data-s="' + k + '"' + (i === 0 ? ' class="on"' : '') + '>' + e(A.SITUACOES[k].rotulo) + '</button>';
      }).join('') + '</div>' +
      '<label class="t" for="sMotivo">Motivo</label><textarea id="sMotivo" rows="2" placeholder="Obrigatório para parar ou inativar. Ex.: troca da vedação do eixo"></textarea>' +
      '<div class="aviso bad" id="sErro" hidden></div>' +
      '<div class="rodape"><button class="btn" type="button" id="sCancelar">Cancelar</button><button class="btn pri" type="button" id="sSalvar">Confirmar</button></div>');
    el('sSeg').querySelectorAll('button').forEach(function(b) { b.onclick = function() { el('sSeg').querySelectorAll('button').forEach(function(x) { x.classList.toggle('on', x === b); }); }; });
    el('sCancelar').onclick = fechar;
    el('sSalvar').onclick = function() {
      var nova = el('sSeg').querySelector('.on').getAttribute('data-s');
      var r = A.mudarSituacao(id, a, nova, {motivo: el('sMotivo').value, por: nomeUsuario(), agora: agora(), chaveHistorico: db.ref('ativos_historico/' + id).push().key});
      if (r.erro) { el('sErro').hidden = false; el('sErro').textContent = r.erro; return; }
      el('sSalvar').disabled = true;
      db.ref().update(r.updates).then(function() { fechar(); toast(a.codigo + ': ' + A.SITUACOES[nova].rotulo.toLowerCase() + '.'); })
        .catch(function(err) { el('sSalvar').disabled = false; el('sErro').hidden = false; el('sErro').textContent = 'Não foi possível gravar: ' + err.message; });
    };
  }

  function abrirHistorico(id) {
    var a = S.ativos[id] || {};
    modal('<h2>Histórico de ' + e(a.codigo) + '</h2><div class="dica">' + e(a.nome) + ' · cadastrado ' + dataBR(a.criadoEm) + (a.criadoPor ? ' por ' + e(a.criadoPor) : '') + '</div><div id="hCorpo" style="margin-top:12px">Carregando…</div><div class="rodape"><button class="btn" type="button" id="hFechar">Fechar</button></div>');
    el('hFechar').onclick = fechar;
    db.ref('ativos_historico/' + id).once('value').then(function(s) {
      var h = s.val() || {};
      var linhas = Object.keys(h).map(function(k) { return h[k]; }).sort(function(x, y) { return String(y.em).localeCompare(String(x.em)); });
      el('hCorpo').innerHTML = linhas.length ? '<table><thead><tr><th>Quando</th><th>De → para</th><th>Motivo</th><th>Por</th></tr></thead><tbody>' + linhas.map(function(x) {
        return '<tr><td>' + dataBR(x.em) + '</td><td>' + e((A.SITUACOES[x.de] || {}).rotulo || x.de) + ' → <b>' + e((A.SITUACOES[x.para] || {}).rotulo || x.para) + '</b></td><td>' + e(x.motivo || '') + '</td><td>' + e(x.por || '') + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="mut">Nenhuma mudança de situação registrada.</div>';
    }).catch(function(err) { el('hCorpo').textContent = 'Não foi possível ler o histórico: ' + err.message; });
  }

  /* ── Peças e compras do ativo (16/11/2026) ──
     Peças: ativos/{id}/pecas/{codigo} (material MN/MU do cadastro).
     Compras: SC aberta aqui entra na fila normal de Compras; o andamento
     (cotação, PC, recebimento/atesto) é lido de volta pelos elos que já
     existem (comprasDoAtivo). */
  function abrirPecasCompras(id) {
    var a = S.ativos[id] || {};
    var pecas = a.pecas || {};
    var linhasPecas = Object.keys(pecas).map(function(k) {
      var p = pecas[k] || {};
      return '<tr><td><b class="cod">' + e(p.materialCodigo) + '</b></td><td>' + e(p.materialNome || '') + (p.obs ? '<div class="dica">' + e(p.obs) + '</div>' : '') + '</td>' +
        '<td>' + (p.qtdReferencia != null ? fmt(p.qtdReferencia) + ' ' + e(p.unidade || '') : '<span class="mut">—</span>') + '</td>' +
        '<td class="acoes"><button class="btn sm" type="button" data-rem="' + e(k) + '" aria-label="Tirar ' + e(p.materialCodigo) + ' da lista">Tirar</button></td></tr>';
    }).join('');
    modal('<h2>Peças e compras de ' + e(a.codigo) + '</h2>' +
      '<div class="dica">' + e(a.nome) + '</div>' +
      '<div class="dica" style="margin-top:6px">Fabricante: <b>' + e(a.fornecedorFabricanteNome || a.fabricante || '—') + '</b>' + (a.fornecedorFabricanteKey ? '' : (a.fabricante ? ' <span class="tg warn">fora do cadastro</span>' : '')) +
        ' · Assistência técnica: <b>' + e(a.fornecedorAssistenciaNome || '—') + '</b>' + (a.fornecedorAssistenciaKey ? '' : ' <button class="btn sm" type="button" id="pcEditar">Definir</button>') + '</div>' +
      '<h3 style="margin:16px 0 6px;font-size:15px">Peças de reposição e consumíveis</h3>' +
      (linhasPecas ? '<div class="tw"><table><thead><tr><th>Código</th><th>Peça</th><th>Qtd. de referência</th><th></th></tr></thead><tbody>' + linhasPecas + '</tbody></table></div>'
        : '<div class="mut" style="font-size:13px">Nenhuma peça ligada a este equipamento ainda.</div>') +
      '<div class="grid2" style="margin-top:10px;align-items:end">' +
        '<div style="grid-column:span 2"><label class="t" for="pcMat">Adicionar peça do cadastro (MN ou MU)</label><input type="text" id="pcMat" list="dlPecas" autocomplete="off" placeholder="Código ou nome…"></div>' +
        '<div><label class="t" for="pcQtd">Qtd. de referência</label><input type="text" id="pcQtd" inputmode="decimal" placeholder="Ex.: 2"></div>' +
        '<div><label class="t" for="pcObs">Onde vai</label><input type="text" id="pcObs" placeholder="Ex.: eixo do agitador"></div>' +
        '<div><button class="btn" type="button" id="pcAdd">Adicionar</button></div>' +
      '</div>' +
      '<div class="dica" style="margin-top:6px">Peça que não existe: cadastre em <a href="cadastros.html?tab=materiais" target="_blank" rel="noopener">Cadastros › Materiais</a> com o tipo <b>MN – Peça de manutenção</b>.</div>' +
      '<div class="aviso bad" id="pcErro" hidden></div>' +
      '<h3 style="margin:18px 0 6px;font-size:15px">Compras e orçamentos deste equipamento</h3>' +
      '<div id="pcCompras" class="dica">Carregando…</div>' +
      '<div class="rodape">' + (podeSolicitar() ? '<button class="btn pri" type="button" id="pcSolicitar">Solicitar compra / orçamento</button>' : '') +
        '<button class="btn" type="button" id="pcFechar">Fechar</button></div>');
    el('pcFechar').onclick = fechar;
    if (el('pcEditar')) el('pcEditar').onclick = function() { abrirForm(id); };
    if (el('pcSolicitar')) el('pcSolicitar').onclick = function() { abrirSolicitacao(id); };
    el('pcAdd').onclick = function() {
      var mat = materialDoRotulo(el('pcMat').value);
      var p = A.pecaDoMaterial(mat, {qtd: el('pcQtd').value, obs: el('pcObs').value});
      if (p.erro) { el('pcErro').hidden = false; el('pcErro').textContent = p.erro; return; }
      el('pcAdd').disabled = true;
      db.ref('ativos/' + id + '/pecas/' + chaveMaterial(p.materialCodigo)).set(p).then(function() {
        toast(p.materialCodigo + ' ligado a ' + a.codigo + '.'); abrirPecasCompras(id);
      }).catch(function(err) { el('pcAdd').disabled = false; el('pcErro').hidden = false; el('pcErro').textContent = 'Não foi possível gravar: ' + err.message; });
    };
    el('modais').querySelectorAll('[data-rem]').forEach(function(b) {
      b.onclick = function() {
        var k = b.getAttribute('data-rem');
        db.ref('ativos/' + id + '/pecas/' + k).remove().then(function() { abrirPecasCompras(id); })
          .catch(function(err) { el('pcErro').hidden = false; el('pcErro').textContent = 'Não foi possível tirar: ' + err.message; });
      };
    });
    S.modalAtivo = id;
    preencherCompras(id);
  }
  // Lista de compras do modal. Chamada de novo quando solicitacoes_compra muda
  // (SC recém-enviada, aprovação de Compras) sem redesenhar o resto do modal.
  function preencherCompras(id) {
    Promise.all([db.ref('processos_cotacao').once('value'), db.ref('pedidos_compra').once('value')]).then(function(r) {
      var box = el('pcCompras');
      if (!box || S.modalAtivo !== id) return;
      var lista = A.comprasDoAtivo(id, S.scs, r[0].val() || {}, r[1].val() || {});
      box.innerHTML = lista.length ? '<div class="tw"><table><thead><tr><th>SC</th><th>Itens</th><th>Etapa</th><th>Pedido de Compra</th></tr></thead><tbody>' + lista.map(function(c) {
        var et = A.etapaCompra(c);
        return '<tr><td><b>' + e(c.numero) + '</b><div class="dica">' + e(dataBR(c.criadoEm)) + '</div></td>' +
          '<td>' + c.itens.map(function(it) { return e((it.tipoItem === 'SERVICO' ? 'Serviço: ' : '') + (it.materialNome || it.materialCodigo || it.descricao || '')) + ' <span class="mut">(' + fmt(it.qtd) + ' ' + e(it.unidade || '') + ')</span>'; }).join('<br>') + '</td>' +
          '<td><span class="tg ' + et.cor + '">' + e(et.rotulo) + '</span>' + (c.cotacoes.length ? '<div class="dica">' + c.cotacoes.map(function(x) { return e(x.numero); }).join(', ') + '</div>' : '') + '</td>' +
          '<td>' + (c.pcs.length ? c.pcs.map(function(p) { return '<b>' + e(p.numero) + '</b> ' + e(p.fornecedor) + (p.dataPrevista ? '<div class="dica">previsto ' + e(String(p.dataPrevista).slice(0, 10).split('-').reverse().join('/')) + '</div>' : ''); }).join('<br>') : '<span class="mut">—</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : 'Nenhuma compra pedida por este equipamento ainda.';
    }).catch(function(err) { if (el('pcCompras')) el('pcCompras').textContent = 'Não foi possível ler as compras: ' + err.message; });
  }

  function abrirSolicitacao(id) {
    var a = S.ativos[id] || {};
    var pecas = a.pecas || {};
    var linhas = Object.keys(pecas).map(function(k) {
      var p = pecas[k];
      return {tipo: 'PECA', marcada: false, materialCodigo: p.materialCodigo, materialNome: p.materialNome, unidade: p.unidade, qtd: p.qtdReferencia || 1};
    });
    function desenhar() {
      el('scLinhas').innerHTML = linhas.length ? linhas.map(function(l, i) {
        if (l.tipo === 'SERVICO') {
          return '<div class="grid2" style="align-items:end;margin-bottom:6px"><div style="grid-column:span 2"><label class="t" for="scD' + i + '">Serviço</label>' +
            '<input type="text" id="scD' + i + '" data-i="' + i + '" data-c="descricao" value="' + e(l.descricao || '') + '" placeholder="Ex.: Conserto do vazamento no bico 3 (assistência técnica)"></div>' +
            '<div><label class="t" for="scQ' + i + '">Qtd.</label><input type="text" id="scQ' + i + '" data-i="' + i + '" data-c="qtd" inputmode="decimal" value="' + e(l.qtd) + '"></div>' +
            '<div><button class="btn sm" type="button" data-tirar="' + i + '">Tirar</button></div></div>';
        }
        return '<div class="grid2" style="align-items:end;margin-bottom:6px"><div style="grid-column:span 2"><label style="font-size:13.5px;display:flex;gap:8px;align-items:center">' +
          '<input type="checkbox" data-i="' + i + '" data-c="marcada"' + (l.marcada ? ' checked' : '') + '> <b class="cod">' + e(l.materialCodigo) + '</b> ' + e(l.materialNome || '') + '</label></div>' +
          '<div><label class="t" for="scQ' + i + '">Qtd. (' + e(l.unidade || 'un') + ')</label><input type="text" id="scQ' + i + '" data-i="' + i + '" data-c="qtd" inputmode="decimal" value="' + e(l.qtd) + '"></div>' +
          (l.avulsa ? '<div><button class="btn sm" type="button" data-tirar="' + i + '">Tirar</button></div>' : '<div></div>') + '</div>';
      }).join('') : '<div class="mut" style="font-size:13px">Sem peças ligadas: adicione a peça ou o serviço abaixo.</div>';
      el('scLinhas').querySelectorAll('[data-c]').forEach(function(inp) {
        inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', function() {
          var l = linhas[+inp.getAttribute('data-i')], c = inp.getAttribute('data-c');
          l[c] = inp.type === 'checkbox' ? inp.checked : inp.value;
        });
      });
      el('scLinhas').querySelectorAll('[data-tirar]').forEach(function(b) { b.onclick = function() { linhas.splice(+b.getAttribute('data-tirar'), 1); desenhar(); }; });
    }
    modal('<h2>Solicitar compra para ' + e(a.codigo) + '</h2>' +
      '<div class="dica">' + e(a.nome) + '. A solicitação entra na fila de <b>Compras</b>, que aprova, cota (orçamento) e emite o Pedido de Compra. ' +
        'Peça chega pela Logística; serviço é atestado por Compras quando for prestado.' +
        (a.fornecedorAssistenciaNome ? ' Assistência técnica cadastrada: <b>' + e(a.fornecedorAssistenciaNome) + '</b>.' : '') + '</div>' +
      '<div id="scLinhas" style="margin:12px 0"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">' +
        '<div style="flex:1;min-width:220px"><label class="t" for="scNova">Outra peça do cadastro</label><input type="text" id="scNova" list="dlPecas" autocomplete="off" placeholder="Código ou nome…"></div>' +
        '<button class="btn" type="button" id="scAddPeca">+ Peça</button><button class="btn" type="button" id="scAddServ">+ Serviço (conserto, assistência, calibração)</button></div>' +
      '<label class="t" for="scJust" style="margin-top:12px">Motivo *</label><textarea id="scJust" rows="2" placeholder="O que aconteceu e o que vai ser feito. Ex.: rolamento do agitador fazendo ruído; trocar na parada de sexta."></textarea>' +
      '<div class="aviso bad" id="scErro" hidden></div>' +
      '<div class="rodape"><button class="btn" type="button" id="scVoltar">Voltar</button><button class="btn pri" type="button" id="scEnviar">Enviar para Compras</button></div>');
    desenhar();
    el('scVoltar').onclick = function() { abrirPecasCompras(id); };
    el('scAddPeca').onclick = function() {
      var mat = materialDoRotulo(el('scNova').value);
      var p = A.pecaDoMaterial(mat, {});
      if (p.erro) { el('scErro').hidden = false; el('scErro').textContent = p.erro; return; }
      el('scErro').hidden = true;
      linhas.push({tipo: 'PECA', marcada: true, avulsa: true, materialCodigo: p.materialCodigo, materialNome: p.materialNome, unidade: p.unidade, qtd: 1});
      el('scNova').value = ''; desenhar();
    };
    el('scAddServ').onclick = function() { linhas.push({tipo: 'SERVICO', descricao: '', qtd: 1}); desenhar(); };
    el('scEnviar').onclick = function() {
      var escolhidas = linhas.filter(function(l) { return l.tipo === 'SERVICO' || l.marcada; });
      var r = A.montarSolicitacao(id, a, escolhidas, {justificativa: el('scJust').value, por: nomeUsuario(), agora: agora(),
        novaChave: function() { return db.ref('solicitacoes_compra').push().key; }});
      if (r.erro) { el('scErro').hidden = false; el('scErro').textContent = r.erro; return; }
      el('scEnviar').disabled = true;
      nextSequential(db, 'config/contadores/solicitacaoCompra', 'SC', 4).then(function(seq) {
        var key = db.ref('solicitacoes_compra').push().key;
        return db.ref('solicitacoes_compra/' + key).set(Object.assign({numero: seq.numero, numeroFormatado: seq.formatado}, r.registro))
          .then(function() { return seq.formatado; });
      }).then(function(num) {
        toast(num + ' enviada para Compras (' + a.codigo + ').'); abrirPecasCompras(id);
      }).catch(function(err) {
        el('scEnviar').disabled = false; el('scErro').hidden = false;
        el('scErro').textContent = 'Não foi possível enviar: ' + err.message + (/permission/i.test(err.message) ? ' — seu usuário precisa do módulo Manutenção ou Compras.' : '');
      });
    };
  }

  /* ── Ligações ── */
  el('fBusca').addEventListener('input', function() { S.f.busca = el('fBusca').value; render(); });
  el('fTipo').addEventListener('change', function() { S.f.tipo = el('fTipo').value; render(); });
  el('fArea').addEventListener('change', function() { S.f.area = el('fArea').value; render(); });
  el('fLinha').addEventListener('change', function() { S.f.linha = el('fLinha').value; render(); });
  el('btnNovo').addEventListener('click', function() { abrirForm(null); });

  var pend = 2;
  function pronto() { if (--pend <= 0) { S.carregado = true; el('conn').textContent = 'Ao vivo'; el('conn').className = 'tg ok'; } render(); }
  var aviso = function(err) { el('lista').innerHTML = '<div class="aviso bad">Sem acesso ao cadastro de ativos: ' + e(err && err.message) + '</div>'; };
  dbOnValue(db.ref('ativos'), function(s) { S.ativos = s.val() || {}; if (!S._a) { S._a = 1; pronto(); } else render(); }, {onError: aviso});
  dbOnValue(db.ref('config'), function(s) { S.config = s.val() || {}; if (!S._c) { S._c = 1; pronto(); } else render(); }, {onError: function() { if (!S._c) { S._c = 1; pronto(); } }});
  // Cadastros e Compras (16/11/2026): leitura liberada a todo usuário ativo.
  // Não seguram a lista -- chegam depois e só completam seletores e contagens.
  dbOnValue(db.ref('fornecedores'), function(s) { S.fornecedores = s.val() || {}; datalists(); });
  dbOnValue(db.ref('materiais'), function(s) { S.materiais = s.val() || {}; datalists(); });
  dbOnValue(db.ref('solicitacoes_compra'), function(s) {
    S.scs = s.val() || {}; render();
    if (S.modalAtivo && el('pcCompras')) preencherCompras(S.modalAtivo);
  });
})();
