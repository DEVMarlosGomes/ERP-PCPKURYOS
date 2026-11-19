'use strict';
/* Tela de chamados. O cliente só mantém estado de interface e envia os prints;
   toda permissão e transição de status é validada novamente pela callable. */
(function() {
  var C = window.Chamados;
  var eu = null, admin = false, gestor = false, itens = [], responsaveis = [], roadmapItens = [], roadmapEstado = {}, metricas = null, visao = 'MEUS', arquivos = [], requestId = '', enviando = false, detalheId = '';
  var $ = function(id) { return document.getElementById(id); };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function chamar(dados) { return firebase.functions().httpsCallable('chamadoSistema')(dados).then(function(r) { return r.data || {}; }); }
  function msgErro(err) {
    var t = String(err && err.message || err || 'Não foi possível concluir. Tente novamente.');
    return t.replace(/^Firebase:\s*/i, '').replace(/^ChamadoSistema:\s*/i, '');
  }
  function mensagem(texto, tipo) { var m = $('mensagem'); m.textContent = texto || ''; m.className = 'ch-banner ' + (tipo || ''); m.hidden = !texto; }
  function tamanho(bytes) { var b=Number(bytes)||0; return b<1024*1024?Math.round(b/1024)+' KB':(Math.round(b/1024/1024*10)/10)+' MB'; }
  function statusFinal(s) { return ['CONCLUIDO','RECUSADO','DUPLICADO'].indexOf(s) >= 0; }
  function textoEspera(item) {
    if (item.aguardandoRespostaDe === 'AUTOR') return item.autor && item.autor.uid === eu.uid ? 'Aguarda você' : 'Aguarda solicitante';
    if (item.aguardandoRespostaDe === 'ADMIN') return admin ? 'Aguarda ADM' : 'Em análise';
    return '';
  }
  function tags(item) {
    if (item.fonte === 'ROADMAP') {
      var ligados = Object.keys(item.chamados || {}).length;
      return '<span class="ch-tag priority">Roadmap ' + esc(item.secao || '') + '</span>' +
        '<span class="ch-tag ' + (item.status === 'CONCLUIDO' ? 'done' : '') + '">' + esc(C.ROTULO_STATUS[item.status] || item.status) + '</span>' +
        (ligados ? '<span class="ch-tag">' + ligados + (ligados === 1 ? ' chamado' : ' chamados') + '</span>' : '');
    }
    var espera = textoEspera(item), finalizado = statusFinal(item.status);
    return '<span class="ch-tag priority ' + (item.prioridade === 'P0' ? 'critical' : '') + '">' + esc(C.ROTULO_PRIORIDADE[item.prioridade] || item.prioridade || 'Baixa') + '</span>' +
      (espera ? '<span class="ch-tag wait">' + esc(espera) + '</span>' : '') +
      '<span class="ch-tag ' + (finalizado ? 'done' : '') + '">' + esc(C.ROTULO_STATUS[item.status] || item.status) + '</span>' +
      (item.anexosQuantidade ? '<span class="ch-tag">' + item.anexosQuantidade + (item.anexosQuantidade === 1 ? ' print' : ' prints') + '</span>' : '');
  }
  function filtrados() {
    var q = $('busca').value.trim().toLowerCase(), st = $('filtroStatus').value, origem = visao === 'QUADRO' ? $('filtroOrigem').value : '';
    var base = visao === 'QUADRO' ? itens.concat(roadmapItens) : itens;
    return base.filter(function(x) {
      var fonte = x.fonte || 'CHAMADO';
      if (origem && origem !== fonte) return false;
      if (st && x.status !== st) return false;
      return !q || [x.codigo,x.titulo,x.tipo,x.autor&&x.autor.nome,x.responsavel,x.grupo,x.descricao].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function renderLista() {
    var lista = filtrados();
    $('lista').hidden = visao !== 'MEUS'; $('quadro').hidden = visao === 'MEUS'; $('metricas').hidden = visao !== 'GESTAO';
    if (visao === 'GESTAO') { renderMetricas(); return renderQuadro(); }
    if (visao !== 'MEUS') return renderQuadro();
    if (!lista.length) {
      $('lista').innerHTML = '<div class="ch-empty"><strong>Nenhum chamado encontrado</strong>' + ($('busca').value || $('filtroStatus').value ? 'Ajuste os filtros para ver outros resultados.' : 'Quando precisar, use “Abrir chamado” e descreva o que aconteceu.') + '</div>';
      return;
    }
    $('lista').innerHTML = lista.map(function(item) {
      return '<button type="button" class="ch-row" data-id="'+esc(item.id)+'"><span><span class="ch-row-title"><span class="ch-code">'+esc(item.codigo)+'</span><span class="ch-title">'+esc(item.titulo)+'</span></span>'+
        '<span class="ch-meta">'+esc(C.ROTULO_TIPO[item.tipo]||item.tipo)+' · '+esc(item.autor&&item.autor.nome||'')+' · atualizado '+esc(C.dataHora(item.atualizadaEm))+'</span></span><span class="ch-tags">'+tags(item)+'</span></button>';
    }).join('');
    $('lista').querySelectorAll('[data-id]').forEach(function(b) { b.onclick = function() { abrirDetalhe(b.dataset.id); }; });
  }
  function renderMetricas() {
    var m = metricas && metricas.geral || {}, linhas = metricas && metricas.grupos || [];
    $('metricas').innerHTML = '<div class="ch-kpis"><div class="ch-kpi"><small>Chamados abertos</small><strong>'+Number(m.abertos||0)+'</strong></div><div class="ch-kpi"><small>Chamados concluídos</small><strong>'+Number(m.concluidos||0)+'</strong></div><div class="ch-kpi"><small>Primeira resposta média</small><strong>'+esc(C.duracao(m.mediaPrimeiraRespostaMs))+'</strong></div><div class="ch-kpi"><small>Conclusão média</small><strong>'+esc(C.duracao(m.mediaConclusaoMs))+'</strong></div></div><p class="ch-metrics-note">Médias calculadas com os chamados que já possuem o respectivo marco. O quadro abaixo é somente leitura.</p>'+
      (linhas.length?'<div class="ch-table-wrap"><table class="ch-metrics-table"><thead><tr><th>Setor</th><th>Tipo</th><th>Total</th><th>Abertos</th><th>1ª resposta</th><th>Conclusão</th></tr></thead><tbody>'+linhas.map(function(g){return '<tr><td>'+esc(g.setor)+'</td><td>'+esc(C.ROTULO_TIPO[g.tipo]||g.tipo)+'</td><td>'+g.total+'</td><td>'+g.abertos+'</td><td>'+esc(C.duracao(g.mediaPrimeiraRespostaMs))+'</td><td>'+esc(C.duracao(g.mediaConclusaoMs))+'</td></tr>';}).join('')+'</tbody></table></div>':'');
  }
  function renderQuadro() {
    if (visao !== 'QUADRO' && visao !== 'GESTAO') return;
    var somenteLeitura = visao === 'GESTAO';
    var colunas = C.porStatus(filtrados());
    $('quadro').innerHTML = C.STATUS.map(function(status) {
      var cards = colunas[status].map(function(item) {
        if (item.fonte === 'ROADMAP') {
          return '<article class="ch-card roadmap" draggable="'+String(!somenteLeitura)+'" tabindex="0" data-id="'+esc(item.id)+'" data-source="ROADMAP"><div class="ch-source"><span class="ch-code">'+esc(item.codigo)+'</span><span class="ch-roadmap-badge">Roadmap</span></div><h3>'+esc(item.titulo)+'</h3><div class="ch-tags">'+tags(item)+'</div><div class="ch-roadmap-group">'+esc(item.grupo||'')+'</div></article>';
        }
        return '<article class="ch-card" draggable="'+String(!somenteLeitura)+'" tabindex="0" data-id="'+esc(item.id)+'" data-source="CHAMADO"><span class="ch-code">'+esc(item.codigo)+'</span><h3>'+esc(item.titulo)+'</h3><div class="ch-tags">'+tags(item)+'</div><small>'+esc(item.autor&&item.autor.nome||'')+' · '+esc(C.dataHora(item.atualizadaEm))+'</small></article>';
      }).join('');
      return '<section class="ch-column" data-status="'+status+'"><div class="ch-col-head">'+esc(C.ROTULO_STATUS[status])+'<span>'+colunas[status].length+'</span></div><div class="ch-cards">'+cards+'</div></section>';
    }).join('');
    $('quadro').classList.toggle('readonly',somenteLeitura);
    $('quadro').querySelectorAll('.ch-card').forEach(function(card) {
      card.onclick = function() { abrirCartao(card.dataset.id); };
      card.onkeydown = function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirCartao(card.dataset.id); } };
      if(!somenteLeitura)card.ondragstart = function(e) { e.dataTransfer.setData('text/cartao', card.dataset.id); e.dataTransfer.setData('text/plain', card.dataset.id); e.dataTransfer.effectAllowed = 'move'; };
    });
    if(somenteLeitura)return;
    $('quadro').querySelectorAll('.ch-column').forEach(function(col) {
      col.ondragover = function(e) { e.preventDefault(); col.classList.add('dragover'); e.dataTransfer.dropEffect='move'; };
      col.ondragleave = function() { col.classList.remove('dragover'); };
      col.ondrop = function(e) {
        e.preventDefault(); col.classList.remove('dragover');
        var id = e.dataTransfer.getData('text/cartao') || e.dataTransfer.getData('text/plain');
        if (!id) return;
        // Solto sobre um cartão: entra antes dele; no espaço vazio: vai para o fim. A posição é a ordem da fila.
        var alvo = e.target && e.target.closest ? e.target.closest('.ch-card') : null;
        var lista = C.porStatus(filtrados())[col.dataset.status].filter(function(x) { return x.id !== id; });
        moverCartao(id, col.dataset.status, C.ordemParaSoltar(lista, alvo && alvo.dataset.id !== id ? alvo.dataset.id : null));
      };
    });
  }
  function carregarRoadmap() {
    return fetch('backlog.json?v=' + Date.now(), {cache:'no-store'}).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(backlog) {
      var base = [];
      (backlog.secoes || []).forEach(function(secao) { (secao.itens || []).forEach(function(item) { base.push({id:item.id, feito:item.feito === true}); }); });
      var precisaSincronizar = base.some(function(item) { return !roadmapEstado[item.id] || (item.feito && roadmapEstado[item.id].fonteConcluida !== true); });
      var sincronizar = precisaSincronizar ? chamar({acao:'ROADMAP_SINCRONIZAR',itens:base}).then(function(r) { roadmapEstado = r.roadmapEstado || {}; }) : Promise.resolve();
      return sincronizar.then(function() { roadmapItens = C.itensRoadmap(backlog, roadmapEstado); });
    }).catch(function(err) {
      roadmapItens = [];
      mensagem('Os chamados foram carregados, mas o Roadmap não respondeu ('+msgErro(err)+').','error');
    });
  }
  function carregar() {
    mensagem('Carregando chamados…');
    return chamar({acao:'LISTAR',visao:visao}).then(function(r) {
      itens = r.itens || []; responsaveis = r.responsaveis || []; admin = !!r.admin; gestor = !!r.gestor; metricas = r.metricas || null; roadmapEstado = r.roadmapEstado || {}; $('tabQuadro').hidden = !admin; $('tabGestao').hidden = !gestor;
      $('filtroOrigem').hidden = !(admin && visao === 'QUADRO');
      return admin && visao === 'QUADRO' ? carregarRoadmap() : Promise.resolve().then(function(){roadmapItens=[];});
    }).then(function() {
      if (!$('mensagem').classList.contains('error')) mensagem('');
      renderLista();
    }).catch(function(err) {
      itens=[]; roadmapItens=[]; renderLista(); mensagem(msgErro(err),'error');
    });
  }
  function trocarVisao(nova) {
    if (nova === 'QUADRO' && !admin) return;
    if (nova === 'GESTAO' && !gestor) return;
    visao = nova;
    $('filtroOrigem').hidden = visao !== 'QUADRO';
    document.querySelectorAll('.ch-tab').forEach(function(b){b.setAttribute('aria-selected',String(b.dataset.visao===visao));});
    carregar();
  }

  function erroJavaScriptRecente() {
    try {
      var erro=JSON.parse(sessionStorage.getItem('kuryos-ultimo-erro-js')||'null');
      if(!erro||!erro.mensagem||Date.now()-Date.parse(erro.em||'')>24*60*60*1000)return null;
      return erro;
    }catch(_){return null;}
  }
  function mostrarErroAutomatico() {
    var erro=erroJavaScriptRecente(), box=$('erroAutomatico');
    box.hidden=!erro;
    box.innerHTML=erro?'<strong>Erro técnico detectado automaticamente</strong><code>'+esc(erro.mensagem)+(erro.pagina?' · '+esc(erro.pagina):'')+(erro.linha?' · linha '+Number(erro.linha):'')+'</code>':'';
  }
  function abrirNovo() {
    arquivos.forEach(function(a){if(a.preview)URL.revokeObjectURL(a.preview);});
    arquivos=[]; requestId=''; enviando=false; $('formNovo').reset(); $('novoErro').hidden=true; $('uploadProgress').hidden=true; $('uploadProgress').querySelector('i').style.width='0';
    renderPreviews(); mostrarErroAutomatico(); $('novoLayer').hidden=false; document.body.style.overflow='hidden'; setTimeout(function(){$('novoTipo').focus();},0);
  }
  function fecharNovo() {
    if (enviando) return;
    $('novoLayer').hidden=true; document.body.style.overflow=''; $('btnNovo').focus();
  }
  function renderPreviews() {
    $('anexoContador').textContent=arquivos.length+'/3';
    $('previews').innerHTML=arquivos.map(function(a,i){return '<div class="ch-preview"><img src="'+esc(a.preview)+'" alt="Prévia de '+esc(a.file.name)+'"><button class="ch-remove" type="button" data-remove="'+i+'" aria-label="Remover '+esc(a.file.name)+'">×</button><div class="ch-preview-info"><b>'+esc(a.file.name)+'</b><small>'+esc(tamanho(a.file.size))+(a.caminho?' · enviado':'')+'</small></div></div>';}).join('');
    $('previews').querySelectorAll('[data-remove]').forEach(function(b){b.onclick=function(){var x=arquivos.splice(Number(b.dataset.remove),1)[0];if(x&&x.preview)URL.revokeObjectURL(x.preview);renderPreviews();};});
  }
  function adicionar(lista) {
    var candidatos=Array.prototype.slice.call(lista||[]).filter(function(f){return f&&String(f.type||'').indexOf('image/')===0;});
    var erros=[];
    candidatos.forEach(function(file){
      if(arquivos.length>=C.MAX_ANEXOS){erros.push('Você pode anexar no máximo 3 prints.');return;}
      if(arquivos.some(function(a){return a.file.name===file.name&&a.file.size===file.size&&a.file.lastModified===file.lastModified;}))return;
      var e=C.validarArquivo(file);if(e){erros.push(e);return;}
      arquivos.push({file:file,preview:URL.createObjectURL(file),caminho:''});
    });
    renderPreviews();
    if(erros.length){$('novoErro').textContent=erros[0];$('novoErro').hidden=false;}else $('novoErro').hidden=true;
  }
  function contextoTela() {
    var origem='';
    try{var ref=new URL(document.referrer);if(ref.origin===location.origin)origem=ref.pathname.split('/').pop()||'inicio.html';}catch(e){}
    var contexto={pagina:origem||'chamados.html',url:(origem?document.referrer:location.href).slice(0,500),navegador:navigator.userAgent.slice(0,300),viewport:innerWidth+'x'+innerHeight};
    var erro=erroJavaScriptRecente();if(erro)contexto.erroJavaScript=erro;
    return contexto;
  }
  function progresso(valor) {$('uploadProgress').hidden=false;$('uploadProgress').querySelector('i').style.width=Math.max(0,Math.min(100,valor))+'%';}
  function enviarArquivos(id) {
    var concluidos=arquivos.filter(function(a){return a.caminho;}).length;
    progresso(arquivos.length?concluidos/arquivos.length*100:100);
    var cadeia=Promise.resolve();
    arquivos.forEach(function(item,indice){
      cadeia=cadeia.then(function(){
        if(item.caminho)return;
        var caminho=C.caminhoAnexo(eu.uid,id,item.file,indice,Date.now()+indice);
        var tarefa=firebase.storage().ref(caminho).put(item.file,{contentType:item.file.type,customMetadata:{originalName:item.file.name}});
        return new Promise(function(resolve,reject){
          tarefa.on('state_changed',function(s){var parcial=s.totalBytes?s.bytesTransferred/s.totalBytes:0;progresso((concluidos+parcial)/Math.max(1,arquivos.length)*100);},reject,function(){item.caminho=caminho;concluidos++;renderPreviews();progresso(concluidos/Math.max(1,arquivos.length)*100);resolve();});
        });
      });
    });
    return cadeia.then(function(){return arquivos.map(function(a){return{caminho:a.caminho,nomeOriginal:a.file.name};});});
  }
  function submeterNovo(e) {
    e.preventDefault(); if(enviando)return;
    var dados={tipo:$('novoTipo').value,impacto:$('novoImpacto').value,titulo:$('novoTitulo').value,descricao:$('novoDescricao').value};
    var valid=C.validarFormulario(dados,arquivos.map(function(a){return a.file;}));
    if(!valid.ok){$('novoErro').textContent=valid.erros[0];$('novoErro').hidden=false;return;}
    enviando=true;$('btnEnviar').disabled=true;$('btnEnviar').textContent=arquivos.length?'Preparando prints…':'Enviando…';$('novoErro').hidden=true;
    requestId=requestId||C.requestId();
    chamar({acao:'RESERVAR',requestId:requestId}).then(function(r){
      $('btnEnviar').textContent=arquivos.length?'Enviando prints…':'Enviando…';
      return enviarArquivos(r.id).then(function(anexos){return chamar(Object.assign({acao:'CRIAR',requestId:requestId,anexos:anexos,contexto:contextoTela()},dados));});
    }).then(function(r){
      enviando=false; mensagem((r.codigo||'Chamado')+' aberto com sucesso.','ok'); try{sessionStorage.removeItem('kuryos-ultimo-erro-js');}catch(_){} fecharNovo(); arquivos=[]; requestId=''; return carregar();
    }).catch(function(err){
      $('novoErro').textContent='O chamado não foi enviado: '+msgErro(err)+' Os dados e prints continuam aqui; tente novamente.';$('novoErro').hidden=false;
    }).finally(function(){enviando=false;$('btnEnviar').disabled=false;$('btnEnviar').textContent='Enviar chamado';});
  }

  function moverCartao(id,status,ordem) {
    var atual=itens.concat(roadmapItens).find(function(x){return x.id===id;});if(!atual)return;
    if(atual.status===status&&ordem==null)return;
    mensagem('Movendo '+atual.codigo+'…');
    var dados=atual.fonte==='ROADMAP'?{acao:'ROADMAP_MOVER',id:atual.roadmapId,status:status}:{acao:'MOVER',id:id,status:status};if(ordem!=null)dados.ordem=ordem;
    chamar(dados).then(function(){mensagem(atual.codigo+(atual.status===status?' reposicionado em ':' movido para ')+C.ROTULO_STATUS[status]+'.','ok');return carregar();}).catch(function(err){mensagem(msgErro(err),'error');});
  }
  var EVENTO={CRIADO:'abriu o chamado',COMENTARIO:'comentou',STATUS:'moveu o chamado',ORDEM:'reposicionou o chamado',TRIAGEM:'atualizou a triagem',CONFIRMADO:'confirmou a solução',REABERTO:'reabriu o chamado',RECUSADO:'recusou o chamado',DUPLICADO:'marcou como duplicado',ROADMAP:'alterou o vínculo com o Roadmap'};
  function historicoHtml(no) {
    return Object.keys(no||{}).map(function(id){return no[id];}).sort(function(a,b){return String(a.em).localeCompare(String(b.em));}).map(function(ev){
      var detalhe=ev.tipo==='STATUS'?' de '+(C.ROTULO_STATUS[ev.de]||ev.de)+' para '+(C.ROTULO_STATUS[ev.para]||ev.para):ev.tipo==='ORDEM'?' em '+esc(C.ROTULO_STATUS[ev.status]||ev.status):ev.tipo==='TRIAGEM'?' para '+esc(C.ROTULO_PRIORIDADE[ev.prioridade]||ev.prioridade)+(ev.responsavel?' · '+esc(ev.responsavel):''):ev.tipo==='DUPLICADO'?' de '+esc(ev.duplicadoDe):ev.tipo==='ROADMAP'?' para '+esc(ev.para?'RM-'+String(ev.para).slice(0,6).toUpperCase():'sem vínculo'):'';
      return '<li><b>'+esc(ev.nome||'Usuário')+'</b> '+esc(EVENTO[ev.tipo]||ev.tipo)+detalhe+'<time>'+esc(C.dataHora(ev.em))+'</time>'+(ev.texto?'<p>'+esc(ev.texto)+'</p>':'')+'</li>';
    }).join('');
  }
  function anexosHtml(no) {
    var lista=Object.keys(no||{}).map(function(id){return no[id];}).sort(function(a,b){return Number(a.ordem)-Number(b.ordem);});
    if(!lista.length)return '';
    return '<h3>Prints anexados</h3><div class="ch-attachments">'+lista.map(function(a,i){return '<a class="ch-attachment" href="#" data-anexo="'+i+'"><div style="height:130px;display:grid;place-items:center;color:var(--ink-soft);font-size:12px">Carregando print…</div><span>'+esc(a.nomeOriginal)+'</span></a>';}).join('')+'</div>';
  }
  function carregarImagens(chamado) {
    var lista=Object.keys(chamado.anexos||{}).map(function(id){return chamado.anexos[id];}).sort(function(a,b){return Number(a.ordem)-Number(b.ordem);});
    $('detalheDialog').querySelectorAll('[data-anexo]').forEach(function(link){
      var a=lista[Number(link.dataset.anexo)];
      firebase.storage().ref(a.caminho).getDownloadURL().then(function(url){link.href=url;link.target='_blank';link.rel='noopener';link.firstElementChild.outerHTML='<img src="'+esc(url)+'" alt="'+esc(a.nomeOriginal)+'">';}).catch(function(){link.firstElementChild.textContent='Print indisponível';});
    });
  }
  function roadmapPorId(id) { return roadmapItens.find(function(x){return x.roadmapId===id;}); }
  function abrirCartao(id) {
    var item=itens.concat(roadmapItens).find(function(x){return x.id===id;});
    if(!item)return;
    if(item.fonte==='ROADMAP')abrirDetalheRoadmap(item);else abrirDetalhe(item.id);
  }
  function abrirDetalheRoadmap(item) {
    detalheId=item.id;$('detalheLayer').hidden=false;document.body.style.overflow='hidden';
    var chamados=Object.keys(item.chamados||{}).map(function(id){var c=item.chamados[id]||{};return '<button type="button" class="ch-btn secondary small" data-chamado="'+esc(id)+'"><span class="ch-code">'+esc(c.codigo||id)+'</span> '+esc(c.titulo||'Abrir chamado')+'</button>';}).join('');
    var subs=(item.subitens||[]).length?'<ul>'+item.subitens.map(function(s){return '<li>'+esc(s)+'</li>';}).join('')+'</ul>':'';
    var mover=C.STATUS.filter(function(s){return s!==item.status&&!item.feito;}).map(function(s){return '<button class="ch-btn secondary small" data-rm-mover="'+s+'">'+esc(C.ROTULO_STATUS[s])+'</button>';}).join('');
    $('detalheDialog').innerHTML='<div class="ch-dialog-head"><div><span class="ch-code">'+esc(item.codigo)+'</span><h2>'+esc(item.titulo)+'</h2><p>'+esc(item.grupo||'Roadmap do sistema')+'</p></div><button class="ch-close" id="dtFechar" aria-label="Fechar">×</button></div><div class="ch-tags">'+tags(item)+'</div>'+(item.descricao?'<div class="ch-description">'+esc(item.descricao)+'</div>':'')+subs+(item.hash?'<div class="ch-detail-meta"><div><small>Commit de conclusão</small>'+esc(item.hash)+'</div></div>':'')+'<h3>Chamados vinculados</h3>'+(chamados?'<div class="ch-linked">'+chamados+'</div>':'<p class="ch-meta">Nenhum chamado vinculado. O vínculo é feito no detalhe do chamado.</p>')+(mover?'<div class="ch-detail-actions">'+mover+'</div>':'')+'<div class="ch-dialog-actions"><button class="ch-btn secondary" id="dtFechar2">Fechar</button></div><div class="ch-form-error" id="dtErro" hidden></div>';
    $('dtFechar').onclick=fecharDetalhe;$('dtFechar2').onclick=fecharDetalhe;
    $('detalheDialog').querySelectorAll('[data-chamado]').forEach(function(b){b.onclick=function(){abrirDetalhe(b.dataset.chamado);};});
    $('detalheDialog').querySelectorAll('[data-rm-mover]').forEach(function(b){b.onclick=function(){fecharDetalhe();moverCartao(item.id,b.dataset.rmMover,item.ordem);};});
    setTimeout(function(){$('dtFechar').focus();},0);
  }
  function opcoesRoadmap(selecionado) {
    var abertos=roadmapItens.filter(function(x){return !x.feito;}).sort(function(a,b){return a.titulo.localeCompare(b.titulo,'pt-BR');});
    return '<option value="">Sem vínculo</option>'+abertos.map(function(x){return '<option value="'+esc(x.roadmapId)+'" '+(x.roadmapId===selecionado?'selected':'')+'>'+esc(x.codigo+' · '+x.titulo)+'</option>';}).join('');
  }
  function opcoesResponsaveis(selecionado) {
    return '<option value="">Não definido</option>'+responsaveis.map(function(pessoa){
      return '<option value="'+esc(pessoa.uid)+'" '+(pessoa.uid===selecionado?'selected':'')+'>'+esc(pessoa.nome+(pessoa.setor&&pessoa.setor!=='NAO_INFORMADO'?' · '+pessoa.setor:''))+'</option>';
    }).join('');
  }
  function abrirDetalhe(id) {
    detalheId=id;$('detalheLayer').hidden=false;document.body.style.overflow='hidden';$('detalheDialog').innerHTML='<div class="ch-empty"><strong>Carregando chamado</strong>Aguarde um instante.</div>';
    chamar({acao:'DETALHE',id:id}).then(function(r){renderDetalhe(r.chamado,!!r.admin,visao==='GESTAO');}).catch(function(err){$('detalheDialog').innerHTML='<div class="ch-form-error">'+esc(msgErro(err))+'</div><div class="ch-dialog-actions"><button class="ch-btn secondary" id="dtFechar">Fechar</button></div>';$('dtFechar').onclick=fecharDetalhe;});
  }
  function renderDetalhe(c, podeAdmin, somenteLeitura) {
    var autor=c.autor&&c.autor.uid===eu.uid;
    var responsavelLegado=c.responsavel&&!c.responsavelUid?'<span class="help">Responsável atual: '+esc(c.responsavel)+'. Selecione um administrador para atualizar.</span>':'';
    var adminAcoes=podeAdmin&&!somenteLeitura&&!statusFinal(c.status)?'<div class="ch-inline"><label class="ch-field"><span>Prioridade</span><select id="dtPrioridade">'+['P0','P1','P2','P3'].map(function(p){return '<option value="'+p+'" '+(c.prioridade===p?'selected':'')+'>'+esc(C.ROTULO_PRIORIDADE[p])+'</option>';}).join('')+'</select></label><label class="ch-field"><span>Responsável</span><select id="dtResponsavelUid">'+opcoesResponsaveis(c.responsavelUid||'')+'</select>'+responsavelLegado+'</label><button class="ch-btn small" id="dtTriar">Salvar triagem</button></div><div class="ch-detail-actions">'+C.STATUS.filter(function(s){return s!==c.status;}).map(function(s){return '<button class="ch-btn secondary small" data-mover="'+s+'">'+esc(C.ROTULO_STATUS[s])+'</button>';}).join('')+'<button class="ch-btn secondary small" id="dtDuplicado">Duplicado</button><button class="ch-btn danger small" id="dtRecusar">Recusar</button></div>':'';
    var roadmapAcoes=podeAdmin&&!somenteLeitura?'<div class="ch-inline"><label class="ch-field"><span>Item do Roadmap que este chamado resolve</span><select id="dtRoadmap">'+opcoesRoadmap(c.roadmapId||'')+'</select></label><button class="ch-btn secondary small" id="dtRoadmapSalvar">Salvar vínculo</button></div>':'';
    var autorAcoes=autor&&!somenteLeitura&&c.status==='VALIDAR'?'<div class="ch-detail-actions"><button class="ch-btn" id="dtConfirmar">Confirmar solução</button><button class="ch-btn secondary" id="dtReabrir">Ainda não resolveu</button></div>':'';
    var podeComentar=!somenteLeitura&&!statusFinal(c.status);
    var md=c.metricas||{}, metricasDetalhe=(md.primeiraRespostaEm||md.concluidoEm)?'<div class="ch-detail-meta">'+(md.primeiraRespostaEm?'<div><small>Primeira resposta</small>'+esc(C.duracao(md.tempoPrimeiraRespostaMs))+'</div>':'')+(md.concluidoEm?'<div><small>Tempo até conclusão</small>'+esc(C.duracao(md.tempoConclusaoMs))+'</div>':'')+'</div>':'';
    var erroJs=c.contexto&&c.contexto.erroJavaScript, erroDetalhe=erroJs?'<div class="ch-tech-error"><strong>Erro JavaScript anexado automaticamente</strong><code>'+esc(erroJs.mensagem)+(erroJs.arquivo?'\n'+esc(erroJs.arquivo)+(erroJs.linha?':'+Number(erroJs.linha):''):'')+(erroJs.pilha?'\n'+esc(erroJs.pilha):'')+'</code></div>':'';
    $('detalheDialog').innerHTML='<div class="ch-dialog-head"><div><span class="ch-code">'+esc(c.codigo)+'</span><h2>'+esc(c.titulo)+'</h2><p>Aberto por '+esc(c.autor&&c.autor.nome||'')+' em '+esc(C.dataHora(c.criadaEm))+'</p></div><button class="ch-close" id="dtFechar" aria-label="Fechar">×</button></div><div class="ch-tags">'+tags(c)+'</div><div class="ch-detail-meta"><div><small>Tipo</small>'+esc(C.ROTULO_TIPO[c.tipo]||c.tipo)+'</div><div><small>Impacto</small>'+esc(C.ROTULO_IMPACTO[c.impacto]||c.impacto)+'</div><div><small>Responsável</small>'+esc(c.responsavel||'Não definido')+'</div><div><small>Setor</small>'+esc(c.setor||c.autor&&c.autor.setor||'Não informado')+'</div><div><small>Tela de origem</small>'+esc(c.contexto&&c.contexto.pagina||'—')+'</div><div><small>Versão</small>'+esc(c.contexto&&c.contexto.versao?String(c.contexto.versao).slice(0,7):'—')+'</div><div><small>Aparelho</small>'+esc(c.contexto&&c.contexto.viewport||'—')+'</div>'+(c.roadmapId?'<div><small>Roadmap</small>RM-'+esc(String(c.roadmapId).slice(0,6).toUpperCase())+'</div>':'')+(c.duplicadoDe?'<div><small>Duplicado de</small>'+esc(c.duplicadoDe)+'</div>':'')+'</div>'+metricasDetalhe+erroDetalhe+'<div class="ch-description">'+esc(c.descricao)+'</div>'+anexosHtml(c.anexos)+adminAcoes+roadmapAcoes+autorAcoes+'<h3>Histórico</h3><ol class="ch-history">'+historicoHtml(c.historico)+'</ol>'+(podeComentar?'<label class="ch-field"><span>Adicionar comentário</span><textarea id="dtComentario" maxlength="2000" placeholder="Registre uma resposta ou informação nova."></textarea></label><div class="ch-dialog-actions"><button class="ch-btn secondary" id="dtFechar2">Fechar</button><button class="ch-btn" id="dtComentar">Enviar comentário</button></div>':'<div class="ch-dialog-actions"><button class="ch-btn secondary" id="dtFechar2">Fechar</button></div>')+'<div class="ch-form-error" id="dtErro" hidden></div>';
    $('dtFechar').onclick=fecharDetalhe;$('dtFechar2').onclick=fecharDetalhe;
    carregarImagens(c);
    if($('dtComentar'))$('dtComentar').onclick=function(){acaoDetalhe({acao:'COMENTAR',texto:$('dtComentario').value},'Comentário enviado.');};
    if($('dtTriar'))$('dtTriar').onclick=function(){acaoDetalhe({acao:'TRIAR',prioridade:$('dtPrioridade').value,responsavelUid:$('dtResponsavelUid').value},'Triagem salva.');};
    if($('dtRoadmapSalvar'))$('dtRoadmapSalvar').onclick=function(){acaoDetalhe({acao:'ROADMAP_VINCULAR',roadmapId:$('dtRoadmap').value},$('dtRoadmap').value?'Vínculo com o Roadmap salvo.':'Vínculo com o Roadmap removido.');};
    $('detalheDialog').querySelectorAll('[data-mover]').forEach(function(b){b.onclick=function(){acaoDetalhe({acao:'MOVER',status:b.dataset.mover},'Chamado movido.');};});
    if($('dtConfirmar'))$('dtConfirmar').onclick=function(){acaoDetalhe({acao:'CONFIRMAR'},'Solução confirmada.');};
    if($('dtReabrir'))$('dtReabrir').onclick=function(){var m=prompt('O que ainda precisa ser corrigido?','');if(m!==null)acaoDetalhe({acao:'REABRIR',texto:m},'Chamado reaberto.');};
    if($('dtRecusar'))$('dtRecusar').onclick=function(){var m=prompt('Informe o motivo da recusa:','');if(m!==null)acaoDetalhe({acao:'RECUSAR',texto:m},'Chamado recusado.');};
    if($('dtDuplicado'))$('dtDuplicado').onclick=function(){var cod=prompt('Código do chamado original (ex.: CH-00012):','');if(cod!==null)acaoDetalhe({acao:'DUPLICADO',duplicadoDe:cod},'Chamado marcado como duplicado.');};
    setTimeout(function(){$('dtFechar').focus();},0);
  }
  function acaoDetalhe(dados,sucesso) {
    dados.id=detalheId;
    $('dtErro').hidden=true;
    chamar(dados).then(function(){mensagem(sucesso,'ok');return carregar();}).then(function(){abrirDetalhe(detalheId);}).catch(function(err){$('dtErro').textContent=msgErro(err);$('dtErro').hidden=false;});
  }
  function fecharDetalhe() {$('detalheLayer').hidden=true;document.body.style.overflow='';detalheId='';}

  $('btnNovo').onclick=abrirNovo;$('btnAtualizar').onclick=carregar;$('btnFecharNovo').onclick=fecharNovo;$('btnCancelarNovo').onclick=fecharNovo;$('formNovo').onsubmit=submeterNovo;
  $('arquivoInput').onchange=function(){adicionar(this.files);this.value='';};
  $('dropzone').onclick=function(){$('arquivoInput').click();};$('dropzone').onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();$('arquivoInput').click();}};
  ['dragenter','dragover'].forEach(function(n){$('dropzone').addEventListener(n,function(e){e.preventDefault();$('dropzone').classList.add('dragover');});});
  ['dragleave','drop'].forEach(function(n){$('dropzone').addEventListener(n,function(e){e.preventDefault();$('dropzone').classList.remove('dragover');if(n==='drop')adicionar(e.dataTransfer.files);});});
  document.addEventListener('paste',function(e){if($('novoLayer').hidden)return;var files=[];Array.prototype.forEach.call(e.clipboardData&&e.clipboardData.items||[],function(i){if(i.kind==='file'&&i.type.indexOf('image/')===0){var f=i.getAsFile();if(f)files.push(f);}});if(files.length){e.preventDefault();adicionar(files);}});
  $('novoTitulo').oninput=function(){$('tituloContador').textContent=this.value.length+'/140';};$('novoDescricao').oninput=function(){$('descricaoContador').textContent=this.value.length+'/5000';};
  $('busca').oninput=renderLista;$('filtroStatus').onchange=renderLista;$('filtroOrigem').onchange=renderLista;
  document.querySelectorAll('.ch-tab').forEach(function(b){b.onclick=function(){trocarVisao(b.dataset.visao);};});
  $('novoLayer').onclick=function(e){if(e.target===$('novoLayer'))fecharNovo();};$('detalheLayer').onclick=function(e){if(e.target===$('detalheLayer'))fecharDetalhe();};
  document.addEventListener('keydown',function(e){if(e.key!=='Escape')return;if(!$('detalheLayer').hidden)fecharDetalhe();else if(!$('novoLayer').hidden)fecharNovo();});
  C.STATUS.concat(['RECUSADO','DUPLICADO']).forEach(function(s){var o=document.createElement('option');o.value=s;o.textContent=C.ROTULO_STATUS[s]||s;$('filtroStatus').appendChild(o);});

  (function esperarLogin(){
    if(!window.currentUser){setTimeout(esperarLogin,120);return;}
    eu=window.currentUser;
    var q=new URLSearchParams(location.search);visao=q.get('visao')==='QUADRO'?'QUADRO':q.get('visao')==='GESTAO'?'GESTAO':'MEUS';
    document.querySelectorAll('.ch-tab').forEach(function(b){b.setAttribute('aria-selected',String(b.dataset.visao===visao));});
    carregar().then(function(){if(visao==='QUADRO'&&!admin)trocarVisao('MEUS');if(visao==='GESTAO'&&!gestor)trocarVisao('MEUS');if(q.get('nova')==='1')abrirNovo();if(q.get('id'))abrirDetalhe(q.get('id'));});
  })();
})();
