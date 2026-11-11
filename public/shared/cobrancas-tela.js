'use strict';
/* Cobranças internas (11/11/2026): tela. A regra mora no servidor
   (functions/cobrancas.js, callable `cobrancaInterna`): aqui só se escolhe,
   escreve e mostra. Lê só a própria caixa (cobrancas_caixa/{uid}) e a cobrança
   aberta (cobrancas/{id}); a lista de pessoas vem de usuarios_publico.

   Abertura com dados prontos (ex.: o Painel de Controle cobrando um setor):
     cobrancas.html?nova=1&titulo=...&descricao=...&link=ops.html&setor=pcp
   Abertura de uma cobrança (link do e-mail): cobrancas.html?id=... */
(function() {
  var db = firebase.database();
  var ROTULO_STATUS = {ABERTA: 'Aberta', RESPONDIDA: 'Respondida', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada'};
  var ROTULO_PRIORIDADE = {normal: 'Normal', alta: 'Alta', urgente: 'Urgente'};
  var ROTULO_PAPEL = {admin: 'Administrador', pcp: 'PCP', rh: 'RH', gestor: 'Gestor', qualidade: 'Qualidade', rotulagem: 'Rotulagem',
    logistica: 'Logística', comercial: 'Comercial', pd: 'P&D', production: 'Produção', vendedor: 'Vendedor', sales_ops: 'Sales Ops',
    sucesso_cliente: 'Sucesso do Cliente', lider_pd: 'Líder P&D', formulador: 'Formulador', engenharia_produto: 'Engenharia de Produto'};
  var EVENTO = {CRIADA: 'abriu a cobrança', RESPOSTA: 'respondeu', CONCLUIDA: 'concluiu', COBRADA_NOVAMENTE: 'cobrou de novo',
    REABERTA: 'reabriu', CANCELADA: 'cancelou'};
  var MAIL = {ENVIADO: 'E-mail enviado', SEM_EMAIL: 'E-mail não enviado: sem e-mail no perfil', ERRO: 'E-mail falhou'};
  var eu = null, caixa = {}, pessoas = {}, aba = 'recebidas', carregou = false, aberta = null, offAberta = null;

  function el(id) { return document.getElementById(id); }
  function e(v) { return escapeHtml(String(v == null ? '' : v)); }
  function hoje() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dataBr(iso) { if (!iso) return 'sem prazo'; var p = String(iso).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function dataHora(v) { var d = new Date(v); return isNaN(d) ? '—' : d.toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'}); }
  function atrasada(c) { return !!c.prazo && c.prazo < hoje() && (c.status === 'ABERTA' || c.status === 'RESPONDIDA'); }
  function encerrada(s) { return s === 'CONCLUIDA' || s === 'CANCELADA'; }
  function aviso(html, tipo) { var r = el('resultado'); r.className = 'aviso ' + (tipo || 'info'); r.innerHTML = html; r.hidden = !html; }
  function chamar(dados) {
    return Promise.resolve().then(function() { return firebase.functions().httpsCallable('cobrancaInterna')(dados); })
      .then(function(r) { return r.data || {}; });
  }
  function msgErro(err) { return (err && err.message) || 'Não foi possível concluir. Tente de novo.'; }
  function textoEmail(m) {
    if (!m) return '';
    if (m.status === 'ENVIADO') return 'E-mail enviado' + (m.semEmail && m.semEmail.length ? '; sem e-mail no perfil: ' + m.semEmail.join(', ') + '.' : '.');
    if (m.status === 'SEM_EMAIL') return 'Ninguém foi avisado por e-mail: ' + (m.semEmail || []).join(', ') + ' não tem e-mail no perfil (o aviso no sistema chegou).';
    return 'O e-mail falhou (o aviso no sistema chegou). Abra a cobrança e use "Reenviar e-mail".';
  }

  /* ── Lista ── */
  function itens() { return Object.keys(caixa).map(function(id) { return Object.assign({id: id}, caixa[id]); }); }
  function daAba(lista) {
    return lista.filter(function(c) {
      if (aba === 'encerradas') return encerrada(c.status);
      return !encerrada(c.status) && c.papel === (aba === 'recebidas' ? 'recebida' : 'enviada');
    }).sort(function(a, b) {
      if (a.aguardaVoce !== b.aguardaVoce) return a.aguardaVoce ? -1 : 1;
      var pa = a.prazo || '9999', pb = b.prazo || '9999';
      if (aba !== 'encerradas' && pa !== pb) return pa < pb ? -1 : 1;
      return String(b.atualizadaEm || '').localeCompare(String(a.atualizadaEm || ''));
    });
  }
  function renderLista() {
    var todos = itens();
    var nr = todos.filter(function(c) { return c.papel === 'recebida' && !encerrada(c.status); }).length;
    var ne = todos.filter(function(c) { return c.papel === 'enviada' && !encerrada(c.status); }).length;
    el('nRecebidas').textContent = nr ? nr : '';
    el('nEnviadas').textContent = ne ? ne : '';
    document.querySelectorAll('.cb-aba').forEach(function(b) { b.setAttribute('aria-selected', String(b.dataset.aba === aba)); });
    if (!carregou) { el('lista').innerHTML = '<div class="vazio">Carregando…</div>'; return; }
    var lista = daAba(todos);
    if (!lista.length) {
      el('lista').innerHTML = '<div class="vazio">' + (aba === 'recebidas' ? 'Ninguém está cobrando nada de você agora.' : aba === 'enviadas' ? 'Você não tem cobranças em aberto. Use “+ Nova cobrança”.' : 'Nenhuma cobrança encerrada ainda.') + '</div>';
      return;
    }
    el('lista').innerHTML = lista.map(function(c) {
      var quem = c.papel === 'recebida' ? 'De ' + c.deNome : 'Para ' + c.paraNomes;
      var tags = (c.aguardaVoce ? '<span class="tag espera">' + (c.papel === 'recebida' ? 'Aguarda você' : 'Respondida: confira') + '</span>' : '') +
        (atrasada(c) ? '<span class="tag atraso">Atrasada</span>' : '') +
        (c.prioridade && c.prioridade !== 'normal' ? '<span class="tag pr-' + e(c.prioridade) + '">' + e(ROTULO_PRIORIDADE[c.prioridade]) + '</span>' : '') +
        '<span class="tag st-' + e(c.status) + '">' + e(ROTULO_STATUS[c.status] || c.status) + '</span>';
      return '<button type="button" class="cb-item' + (c.naoLida ? ' naolida' : '') + '" data-id="' + e(c.id) + '">' +
        '<span><span class="t">' + e(c.titulo) + '</span><br><small>' + e(quem) + ' · prazo ' + e(dataBr(c.prazo)) + ' · atualizada ' + e(dataHora(c.atualizadaEm)) + '</small></span>' +
        '<span class="dir">' + tags + '</span></button>';
    }).join('');
    el('lista').querySelectorAll('[data-id]').forEach(function(b) { b.onclick = function() { abrir(b.dataset.id); }; });
  }

  /* ── Nova cobrança ── */
  function pessoasAtivas() {
    return Object.keys(pessoas).filter(function(uid) {
      var p = pessoas[uid] || {};
      return uid !== eu.uid && p.role && p.role !== 'pending' && p.role !== 'tv' && p.nome;
    }).map(function(uid) { return {uid: uid, nome: pessoas[uid].nome, role: pessoas[uid].role}; })
      .sort(function(a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  }
  function novaCobranca(pre) {
    pre = pre || {};
    var escolhidos = [];
    var ativas = pessoasAtivas();
    if (pre.setor) ativas.forEach(function(p) { if (p.role === pre.setor) escolhidos.push(p.uid); });
    if (pre.para) String(pre.para).split(',').forEach(function(u) { if (pessoas[u] && escolhidos.indexOf(u) < 0 && u !== eu.uid) escolhidos.push(u); });
    var papeis = [];
    ativas.forEach(function(p) { if (papeis.indexOf(p.role) < 0) papeis.push(p.role); });
    papeis.sort(function(a, b) { return (ROTULO_PAPEL[a] || a).localeCompare(ROTULO_PAPEL[b] || b, 'pt-BR'); });
    el('modal').innerHTML = '<div class="fundo" role="dialog" aria-modal="true" aria-labelledby="nvTitulo"><form class="modal" id="nvForm" novalidate>' +
      '<h2 id="nvTitulo">Nova cobrança</h2>' +
      '<label for="nvBusca">Para quem</label>' +
      '<input id="nvBusca" type="search" autocomplete="off" placeholder="Digite o nome da pessoa…">' +
      '<div id="nvSug" class="sugestoes" hidden></div>' +
      '<div class="sub">Ou o setor inteiro: <select id="nvSetor" style="width:auto;font-size:14px;padding:5px 8px"><option value="">escolher setor…</option>' +
      papeis.map(function(r) { return '<option value="' + e(r) + '">' + e(ROTULO_PAPEL[r] || r) + '</option>'; }).join('') + '</select></div>' +
      '<div id="nvChips" class="chips"></div>' +
      '<label for="nvAssunto">O que está sendo cobrado</label><input id="nvAssunto" maxlength="120" value="' + e(pre.titulo || '') + '" placeholder="Ex.: Enviar laudo do lote 2611-04">' +
      '<label for="nvDesc">Detalhes (opcional)</label><textarea id="nvDesc" maxlength="2000" placeholder="Contexto, o que precisa ser feito, onde achar.">' + e(pre.descricao || '') + '</textarea>' +
      '<div class="linha2"><div><label for="nvPrazo">Prazo</label><input id="nvPrazo" type="date" min="' + hoje() + '" value="' + e(pre.prazo || '') + '"></div>' +
      '<div><label for="nvPrio">Prioridade</label><select id="nvPrio"><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div></div>' +
      (pre.link ? '<p class="sub">Tela relacionada: <b>' + e(pre.link) + '</b> (vai junto na cobrança)</p>' : '') +
      '<div id="nvErro" class="aviso erro" role="alert" hidden></div>' +
      '<div class="acoes"><button type="button" class="cb-btn ghost" id="nvCancelar">Cancelar</button><button type="submit" class="cb-btn" id="nvEnviar">Enviar cobrança</button></div>' +
      '</form></div>';
    function chips() {
      el('nvChips').innerHTML = escolhidos.map(function(uid) {
        return '<span class="chip">' + e((pessoas[uid] || {}).nome || uid) + '<button type="button" aria-label="Tirar ' + e((pessoas[uid] || {}).nome || '') + '" data-tirar="' + e(uid) + '">×</button></span>';
      }).join('');
      el('nvChips').querySelectorAll('[data-tirar]').forEach(function(b) { b.onclick = function() { escolhidos.splice(escolhidos.indexOf(b.dataset.tirar), 1); chips(); }; });
    }
    function sugerir() {
      var q = normalizeSearch(el('nvBusca').value), box = el('nvSug');
      if (!q) { box.hidden = true; box.innerHTML = ''; return; }
      var achou = ativas.filter(function(p) { return escolhidos.indexOf(p.uid) < 0 && normalizeSearch(p.nome + ' ' + (ROTULO_PAPEL[p.role] || p.role)).indexOf(q) !== -1; }).slice(0, 12);
      box.hidden = false;
      box.innerHTML = achou.length ? achou.map(function(p) { return '<button type="button" data-uid="' + e(p.uid) + '">' + e(p.nome) + '<small>' + e(ROTULO_PAPEL[p.role] || p.role) + '</small></button>'; }).join('')
        : '<div class="sub" style="padding:9px 11px">Ninguém com esse nome.</div>';
      box.querySelectorAll('[data-uid]').forEach(function(b) { b.onclick = function() { escolhidos.push(b.dataset.uid); el('nvBusca').value = ''; box.hidden = true; chips(); el('nvBusca').focus(); }; });
    }
    el('nvBusca').oninput = sugerir;
    el('nvSetor').onchange = function() {
      var r = el('nvSetor').value;
      ativas.forEach(function(p) { if (p.role === r && escolhidos.indexOf(p.uid) < 0) escolhidos.push(p.uid); });
      el('nvSetor').value = '';
      chips();
    };
    if (pre.prioridade && ROTULO_PRIORIDADE[pre.prioridade]) el('nvPrio').value = pre.prioridade;
    el('nvCancelar').onclick = fechar;
    el('nvForm').onsubmit = function(ev) {
      ev.preventDefault();
      var erro = !escolhidos.length ? 'Escolha quem vai receber a cobrança.' : el('nvAssunto').value.trim().length < 3 ? 'Escreva o que está sendo cobrado.' : '';
      if (erro) { el('nvErro').textContent = erro; el('nvErro').hidden = false; return; }
      el('nvEnviar').disabled = true;
      el('nvEnviar').textContent = 'Enviando…';
      chamar({acao: 'CRIAR', para: escolhidos, titulo: el('nvAssunto').value, descricao: el('nvDesc').value, prazo: el('nvPrazo').value,
        prioridade: el('nvPrio').value, link: pre.link || ''})
        .then(function(r) {
          fechar();
          aba = 'enviadas';
          renderLista();
          aviso('Cobrança enviada. ' + e(textoEmail(r.email)), r.email && r.email.status === 'ENVIADO' && !(r.email.semEmail || []).length ? 'ok' : 'alerta');
        })
        .catch(function(err) { el('nvErro').textContent = msgErro(err); el('nvErro').hidden = false; el('nvEnviar').disabled = false; el('nvEnviar').textContent = 'Enviar cobrança'; });
    };
    chips();
    el('nvBusca').focus();
  }
  function fechar() {
    el('modal').innerHTML = '';
    if (offAberta) { offAberta(); offAberta = null; }
    aberta = null;
    if (/[?&]id=/.test(location.search) && history.replaceState) history.replaceState(null, '', 'cobrancas.html');
  }

  /* ── Uma cobrança ── */
  function abrir(id) {
    if (offAberta) { offAberta(); offAberta = null; }
    aberta = id;
    el('modal').innerHTML = '<div class="fundo" role="dialog" aria-modal="true"><div class="modal"><p class="sub">Carregando…</p></div></div>';
    var ref = db.ref('cobrancas/' + id);
    var cb = function(s) { if (aberta === id) renderDetalhe(id, s.val()); };
    ref.on('value', cb, function() {
      el('modal').innerHTML = '<div class="fundo" role="dialog" aria-modal="true"><div class="modal"><div class="aviso erro">Você não tem acesso a esta cobrança (ou ela não existe).</div><div class="acoes"><button type="button" class="cb-btn ghost" id="dtFechar">Fechar</button></div></div></div>';
      el('dtFechar').onclick = fechar;
    });
    offAberta = function() { ref.off('value', cb); };
    if (caixa[id] && caixa[id].naoLida) db.ref('cobrancas_caixa/' + eu.uid + '/' + id + '/naoLida').set(false).catch(function() {});
  }
  function botoes(c) {
    var souAutor = c.de && c.de.uid === eu.uid, souCobrado = !!(c.para && c.para[eu.uid]), admin = eu.role === 'admin';
    var b = [];
    if (encerrada(c.status)) {
      if (c.status === 'CONCLUIDA' && (souAutor || admin)) b.push(['REABRIR', 'Reabrir', 'ghost']);
      return b;
    }
    if (souAutor || souCobrado) b.push(['RESPONDER', 'Responder', '']);
    if (souAutor || souCobrado) b.push(['CONCLUIR', souCobrado ? 'Marcar como feito' : 'Concluir', 'ghost']);
    if (souAutor) b.push(['COBRAR_NOVAMENTE', 'Cobrar de novo', 'ghost']);
    if (souAutor || admin) b.push(['CANCELAR', 'Cancelar cobrança', 'perigo']);
    return b;
  }
  var PEDE_TEXTO = {RESPONDER: ['Sua resposta', true], CONCLUIR: ['Comentário (opcional)', false], COBRAR_NOVAMENTE: ['Recado (opcional)', false],
    REABRIR: ['Por que está reabrindo?', true], CANCELAR: ['Motivo do cancelamento', true]};
  function renderDetalhe(id, c) {
    if (!c || !c.de) {
      el('modal').innerHTML = '<div class="fundo" role="dialog" aria-modal="true"><div class="modal"><div class="aviso erro">Cobrança não encontrada.</div><div class="acoes"><button type="button" class="cb-btn ghost" id="dtFechar">Fechar</button></div></div></div>';
      el('dtFechar').onclick = fechar;
      return;
    }
    var rascunho = el('dtTexto') ? el('dtTexto').value : '';
    var acaoAtual = el('dtTexto') ? el('dtTexto').dataset.acao : '';
    var eventos = Object.keys(c.eventos || {}).map(function(k) { return Object.assign({id: k}, c.eventos[k]); })
      .sort(function(a, b) { return String(a.em).localeCompare(String(b.em)); });
    var emails = c.emails || {};
    var para = Object.keys(c.para || {}).map(function(u) { return c.para[u].nome; }).join(', ');
    var lista = eventos.map(function(ev) {
      var m = emails[ev.id];
      var mail = m ? '<div class="mail ' + e(m.status) + '">' + e(MAIL[m.status] || m.status) +
        (m.status === 'ENVIADO' ? ' para ' + e((m.para || []).join(', ')) : '') +
        (m.semEmail && m.semEmail.length ? ' · sem e-mail no perfil: ' + e(m.semEmail.join(', ')) : '') +
        (m.status !== 'ENVIADO' ? ' <button type="button" class="cb-link" data-reenviar="' + e(ev.id) + '">Reenviar e-mail</button>' : '') + '</div>' : '';
      return '<li class="' + e(ev.tipo) + '"><span class="quem">' + e(ev.nome) + '</span> ' + e(EVENTO[ev.tipo] || ev.tipo) +
        '<span class="quando">' + e(dataHora(ev.em)) + '</span>' + (ev.texto ? '<div class="txt">' + e(ev.texto) + '</div>' : '') + mail + '</li>';
    }).join('');
    var bts = botoes(c);
    el('modal').innerHTML = '<div class="fundo" role="dialog" aria-modal="true" aria-labelledby="dtTitulo"><div class="modal">' +
      '<div class="det-cab"><h2 id="dtTitulo" style="margin:0">' + e(c.titulo) + '</h2><span><span class="tag st-' + e(c.status) + '">' + e(ROTULO_STATUS[c.status] || c.status) + '</span>' +
      (atrasada(c) ? ' <span class="tag atraso">Atrasada</span>' : '') + '</span></div>' +
      '<div class="det-meta"><div><small>Quem cobra</small>' + e(c.de.nome) + '</div><div><small>Para</small>' + e(para) + '</div>' +
      '<div><small>Prazo</small>' + e(dataBr(c.prazo)) + '</div><div><small>Prioridade</small>' + e(ROTULO_PRIORIDADE[c.prioridade] || 'Normal') + '</div>' +
      '<div><small>Aberta em</small>' + e(dataHora(c.criadaEm)) + '</div>' + (Number(c.vezesCobrada) > 1 ? '<div><small>Cobrada</small>' + e(c.vezesCobrada) + ' vezes</div>' : '') + '</div>' +
      (c.descricao ? '<div class="desc">' + e(c.descricao) + '</div>' : '') +
      (c.link ? '<p class="sub">Tela relacionada: <a href="' + e(c.link) + '">' + e(c.link) + '</a></p>' : '') +
      '<h2 style="margin-top:18px">Histórico</h2><ul class="eventos">' + lista + '</ul>' +
      '<div id="dtCaixa"></div><div id="dtErro" class="aviso erro" role="alert" hidden></div>' +
      '<div class="acoes" id="dtAcoes">' + bts.map(function(x) { return '<button type="button" class="cb-btn ' + x[2] + '" data-acao="' + x[0] + '">' + e(x[1]) + '</button>'; }).join('') +
      '<button type="button" class="cb-btn ghost" id="dtFechar">Fechar</button></div></div></div>';
    el('dtFechar').onclick = fechar;
    el('modal').querySelectorAll('[data-acao]').forEach(function(b) { b.onclick = function() { prepararAcao(id, b.dataset.acao); }; });
    el('modal').querySelectorAll('[data-reenviar]').forEach(function(b) {
      b.onclick = function() {
        b.disabled = true;
        chamar({acao: 'REENVIAR_EMAIL', id: id, eventoId: b.dataset.reenviar})
          .then(function(r) { aviso(e(textoEmail(r.email)), r.email && r.email.status === 'ENVIADO' ? 'ok' : 'alerta'); })
          .catch(function(err) { el('dtErro').textContent = msgErro(err); el('dtErro').hidden = false; b.disabled = false; });
      };
    });
    if (acaoAtual && bts.some(function(x) { return x[0] === acaoAtual; })) { prepararAcao(id, acaoAtual); el('dtTexto').value = rascunho; }
  }
  function prepararAcao(id, acao) {
    var pede = PEDE_TEXTO[acao];
    el('dtCaixa').innerHTML = '<label for="dtTexto" style="display:block;margin-top:14px;font-size:13px;font-weight:600">' + e(pede[0]) + '</label>' +
      '<textarea id="dtTexto" data-acao="' + e(acao) + '" maxlength="2000"></textarea>' +
      '<div class="acoes"><button type="button" class="cb-btn ghost" id="dtVoltar">Voltar</button><button type="button" class="cb-btn' + (acao === 'CANCELAR' ? ' perigo' : '') + '" id="dtConfirmar">Confirmar</button></div>';
    el('dtAcoes').hidden = true;
    el('dtTexto').focus();
    el('dtVoltar').onclick = function() { el('dtCaixa').innerHTML = ''; el('dtAcoes').hidden = false; el('dtErro').hidden = true; };
    el('dtConfirmar').onclick = function() {
      var txt = el('dtTexto').value.trim();
      if (pede[1] && !txt) { el('dtErro').textContent = 'Preencha: ' + pede[0].toLowerCase().replace(/\?$/, '') + '.'; el('dtErro').hidden = false; return; }
      el('dtConfirmar').disabled = true;
      chamar({acao: acao, id: id, texto: txt})
        .then(function(r) {
          el('dtCaixa').innerHTML = '';
          el('dtAcoes').hidden = false;
          el('dtErro').hidden = true;
          aviso(r.email ? e(textoEmail(r.email)) : 'Registrado.', r.email && r.email.status !== 'ENVIADO' ? 'alerta' : 'ok');
        })
        .catch(function(err) { el('dtErro').textContent = msgErro(err); el('dtErro').hidden = false; el('dtConfirmar').disabled = false; });
    };
  }

  /* ── Início ── */
  function parametros() {
    var out = {};
    location.search.replace(/^\?/, '').split('&').forEach(function(par) {
      if (!par) return;
      var i = par.indexOf('=');
      try { out[decodeURIComponent(i < 0 ? par : par.slice(0, i))] = i < 0 ? '' : decodeURIComponent(par.slice(i + 1).replace(/\+/g, ' ')); } catch (x) {}
    });
    return out;
  }
  function iniciar() {
    if (eu) return;
    eu = window.currentUser;
    document.querySelectorAll('.cb-aba').forEach(function(b) { b.onclick = function() { aba = b.dataset.aba; aviso(''); renderLista(); }; });
    var q = parametros();
    var pessoasProntas = db.ref('usuarios_publico').once('value').then(function(s) { pessoas = s.val() || {}; })
      .catch(function() { aviso('Não foi possível carregar a lista de pessoas. Recarregue a página.', 'erro'); });
    el('btnNova').onclick = function() { aviso(''); pessoasProntas.then(function() { novaCobranca(); }); };
    db.ref('cobrancas_caixa/' + eu.uid).on('value', function(s) {
      caixa = s.val() || {};
      carregou = true;
      renderLista();
    }, function(err) {
      carregou = true;
      el('lista').innerHTML = '<div class="vazio">Não foi possível ler suas cobranças (' + e((err && err.code) || 'erro') + '). Recarregue a página ou fale com o ADM.</div>';
    });
    if (q.id && /^[A-Za-z0-9_-]{1,64}$/.test(q.id)) abrir(q.id);
    else if (q.nova) pessoasProntas.then(function() {
      novaCobranca({titulo: q.titulo, descricao: q.descricao, prazo: q.prazo, prioridade: q.prioridade, setor: q.setor, para: q.para,
        link: /^[a-z0-9_-]+\.html(\?[A-Za-z0-9_\-=&%.]*)?$/.test(q.link || '') ? q.link : ''});
    });
    renderLista();
  }
  window.addEventListener('kuryos-auth-pronto', iniciar);
  if (window.currentUser) iniciar();
  document.addEventListener('keydown', function(ev) { if (ev.key === 'Escape' && el('modal').innerHTML) fechar(); });
})();
