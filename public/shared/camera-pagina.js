/* ══════════════════════════════════════════════════════════════════════
   CÂMERA DENTRO DA PÁGINA (16/11/2026)

   Relato do usuário: "ao tirar a foto ela clica, carrega e ao enviar ela
   some, só funciona após a quinta tentativa". O <input type=file
   capture> abre o APP de câmera do celular e o navegador sai de cena. Em
   celular com pouca memória o Android descarta a aba nesse intervalo; ao
   voltar, a página recarrega e a foto se perde. Funciona "de vez em
   quando" porque depende da memória livre no momento.

   Aqui a câmera roda dentro da própria página (getUserMedia): a aba nunca
   sai do primeiro plano. A foto sai já reduzida (lado maior 1600 px, JPEG),
   o que também encurta o envio no Wi-Fi da fábrica.

   Se a câmera da página não estiver disponível (navegador antigo, permissão
   negada, sem câmera), o próprio painel oferece o caminho antigo: a câmera
   do celular ou a galeria, por um <input type=file> tocado pelo usuário.

   abrir() devolve Promise<File|null> (null = cancelou). Não depende de
   Firebase; o DOM é criado e destruído a cada uso.
   ══════════════════════════════════════════════════════════════════════ */
(function(root) {
  'use strict';

  var LADO_MAX = 1600;
  var QUALIDADE = 0.85;

  function disponivel() {
    return !!(root.navigator && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' &&
      root.isSecureContext !== false);
  }

  function mensagemErro(e) {
    var nome = String(e && e.name || '');
    if (nome === 'NotAllowedError' || nome === 'SecurityError')
      return 'O navegador não liberou a câmera para esta página. Libere a câmera no cadeado da barra de endereço ou use a câmera do celular abaixo.';
    if (nome === 'NotFoundError' || nome === 'OverconstrainedError')
      return 'Nenhuma câmera encontrada pelo navegador. Use a câmera do celular abaixo.';
    if (nome === 'NotReadableError')
      return 'A câmera está em uso por outro aplicativo. Feche-o e tente de novo, ou use a câmera do celular abaixo.';
    return 'Não foi possível abrir a câmera nesta página. Use a câmera do celular abaixo.';
  }

  function estilos() {
    if (document.getElementById('camPagEstilo')) return;
    var s = document.createElement('style');
    s.id = 'camPagEstilo';
    s.textContent =
      '.cam-pag{position:fixed;inset:0;z-index:2147483000;background:#000;display:flex;flex-direction:column;color:#fff;font-family:inherit}' +
      '.cam-pag-topo{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;font-size:15px;font-weight:600}' +
      '.cam-pag-x{background:rgba(255,255,255,.15);border:0;color:#fff;border-radius:999px;width:40px;height:40px;font-size:20px;cursor:pointer}' +
      '.cam-pag-vista{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden}' +
      '.cam-pag-vista video,.cam-pag-vista img{max-width:100%;max-height:100%;object-fit:contain;background:#000}' +
      '.cam-pag-msg{padding:18px;font-size:14px;line-height:1.45;text-align:center;max-width:460px}' +
      '.cam-pag-base{display:flex;align-items:center;justify-content:center;gap:12px;padding:14px 14px calc(14px + env(safe-area-inset-bottom));flex-wrap:wrap}' +
      '.cam-pag-btn{min-height:52px;padding:0 20px;border-radius:12px;border:0;font-size:16px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:8px}' +
      '.cam-pag-btn.prim{background:#fff;color:#000}' +
      '.cam-pag-btn.sec{background:rgba(255,255,255,.15);color:#fff}' +
      '.cam-pag-disparo{width:74px;height:74px;border-radius:50%;border:5px solid #fff;background:rgba(255,255,255,.25);cursor:pointer}' +
      '.cam-pag-disparo:disabled{opacity:.4}' +
      '.cam-pag-btn input{display:none}';
    document.head.appendChild(s);
  }

  function tamanhoAlvo(w, h) {
    var maior = Math.max(w, h) || 1, escala = Math.min(1, LADO_MAX / maior);
    return {w: Math.max(1, Math.round(w * escala)), h: Math.max(1, Math.round(h * escala))};
  }

  function capturar(video) {
    return new Promise(function(resolve, reject) {
      var w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) { reject(new Error('A câmera ainda não mostrou imagem. Aguarde um instante e toque de novo.')); return; }
      var t = tamanhoAlvo(w, h);
      var canvas = document.createElement('canvas');
      canvas.width = t.w; canvas.height = t.h;
      var ctx = canvas.getContext('2d', {alpha: false});
      ctx.drawImage(video, 0, 0, t.w, t.h);
      canvas.toBlob(function(blob) {
        if (!blob) { reject(new Error('Não foi possível gerar a foto.')); return; }
        var nome = 'balanca_' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '.jpg';
        try { resolve(new File([blob], nome, {type: 'image/jpeg', lastModified: Date.now()})); }
        catch (e) { try { Object.defineProperty(blob, 'name', {value: nome}); } catch (x) { /* nada */ } resolve(blob); }
      }, 'image/jpeg', QUALIDADE);
    });
  }

  /* opcoes: {titulo} */
  function abrir(opcoes) {
    var op = opcoes || {};
    estilos();
    return new Promise(function(resolve) {
      var fluxo = null, terminou = false, fotoAtual = null, urlPrevia = '';
      var raiz = document.createElement('div');
      raiz.className = 'cam-pag';
      // Sem role="dialog": o tema global (kuryos-apple-system.css) pinta todo
      // [role=dialog] de cartão branco com !important e a câmera ficava invisível.
      raiz.setAttribute('aria-label', 'Câmera');
      raiz.innerHTML =
        '<div class="cam-pag-topo"><span>' + String(op.titulo || 'Fotografar a balança').replace(/[<>&]/g, '') + '</span>' +
          '<button type="button" class="cam-pag-x" data-cam="fechar" aria-label="Fechar">✕</button></div>' +
        '<div class="cam-pag-vista" data-cam="vista"><div class="cam-pag-msg">Abrindo a câmera…</div></div>' +
        '<div class="cam-pag-base" data-cam="base"></div>';
      document.body.appendChild(raiz);
      var vista = raiz.querySelector('[data-cam="vista"]');
      var base = raiz.querySelector('[data-cam="base"]');

      function pararFluxo() {
        if (fluxo) { try { fluxo.getTracks().forEach(function(t) { t.stop(); }); } catch (e) { /* nada */ } }
        fluxo = null;
      }
      function terminar(arquivo) {
        if (terminou) return;
        terminou = true;
        pararFluxo();
        if (urlPrevia) { try { URL.revokeObjectURL(urlPrevia); } catch (e) { /* nada */ } }
        if (raiz.parentNode) raiz.parentNode.removeChild(raiz);
        document.removeEventListener('keydown', teclas, true);
        resolve(arquivo || null);
      }
      function teclas(e) { if (e.key === 'Escape') { e.preventDefault(); terminar(null); } }
      document.addEventListener('keydown', teclas, true);
      raiz.querySelector('[data-cam="fechar"]').onclick = function() { terminar(null); };

      // Caminho antigo, sempre à mão: o toque do usuário abre o seletor.
      function botaoArquivo(rotulo, comCaptura, classe) {
        return '<label class="cam-pag-btn ' + classe + '"><input type="file" accept="image/*"' +
          (comCaptura ? ' capture="environment"' : '') + ' data-cam="arquivo">' + rotulo + '</label>';
      }
      function ligarArquivos() {
        Array.prototype.forEach.call(raiz.querySelectorAll('[data-cam="arquivo"]'), function(inp) {
          inp.onchange = function() { var f = inp.files && inp.files[0]; if (f) terminar(f); };
        });
      }

      function mostrarFalha(msg) {
        pararFluxo();
        vista.innerHTML = '<div class="cam-pag-msg" data-cam="erro"></div>';
        vista.firstChild.textContent = msg;
        base.innerHTML = botaoArquivo('📷 Câmera do celular', true, 'prim') + botaoArquivo('Galeria', false, 'sec');
        ligarArquivos();
      }

      function mostrarAoVivo() {
        vista.innerHTML = '<video playsinline autoplay muted data-cam="video"></video>';
        var video = vista.querySelector('video');
        video.srcObject = fluxo;
        var p = video.play && video.play();
        if (p && p.catch) p.catch(function() { /* autoplay muted: segue */ });
        base.innerHTML = '<button type="button" class="cam-pag-disparo" data-cam="disparo" aria-label="Tirar foto"></button>' +
          botaoArquivo('Galeria', false, 'sec');
        ligarArquivos();
        var disparo = base.querySelector('[data-cam="disparo"]');
        disparo.onclick = function() {
          disparo.disabled = true;
          capturar(video).then(mostrarPrevia, function(e) {
            disparo.disabled = false;
            alert(e.message);
          });
        };
      }

      function mostrarPrevia(arquivo) {
        fotoAtual = arquivo;
        if (fluxo) fluxo.getVideoTracks().forEach(function(t) { t.enabled = false; });
        urlPrevia = URL.createObjectURL(arquivo);
        vista.innerHTML = '<img alt="Foto da balança" data-cam="previa">';
        vista.firstChild.src = urlPrevia;
        base.innerHTML = '<button type="button" class="cam-pag-btn sec" data-cam="refazer">Tirar outra</button>' +
          '<button type="button" class="cam-pag-btn prim" data-cam="usar">✓ Usar esta foto</button>';
        base.querySelector('[data-cam="usar"]').onclick = function() { terminar(fotoAtual); };
        base.querySelector('[data-cam="refazer"]').onclick = function() {
          try { URL.revokeObjectURL(urlPrevia); } catch (e) { /* nada */ }
          urlPrevia = ''; fotoAtual = null;
          if (fluxo) { fluxo.getVideoTracks().forEach(function(t) { t.enabled = true; }); mostrarAoVivo(); }
          else iniciar();
        };
      }

      function iniciar() {
        if (!disponivel()) { mostrarFalha('Este navegador não abre a câmera dentro da página. Use a câmera do celular abaixo.'); return; }
        navigator.mediaDevices.getUserMedia({audio: false,
          video: {facingMode: {ideal: 'environment'}, width: {ideal: 1920}, height: {ideal: 1080}}})
          .then(function(s) {
            if (terminou) { s.getTracks().forEach(function(t) { t.stop(); }); return; }
            fluxo = s;
            mostrarAoVivo();
          }, function(e) { if (!terminou) mostrarFalha(mensagemErro(e)); });
      }
      iniciar();
    });
  }

  root.CameraPagina = {disponivel: disponivel, abrir: abrir, tamanhoAlvo: tamanhoAlvo, mensagemErro: mensagemErro};
})(typeof window !== 'undefined' ? window : globalThis);
