/* ══════════════════════════════════════════════════════════════════════
   PDF DO LAUDO PARA E-MAIL (17/11/2026)

   O laudo impresso sai pelo diálogo de impressão do navegador. Para mandar ao
   cliente por e-mail é preciso o ARQUIVO, e ele tem que ser o mesmo documento
   que a Qualidade imprime: por isso o PDF nasce do mesmo HTML
   (shared/laudo-cq.js) e do mesmo CSS (shared/laudo-cq.css), desenhado fora da
   janela em largura A4 e fatiado em folhas.

   Corte de folha: nunca no meio de uma linha de tabela, de um título, de um
   item de lista ou da assinatura (o mesmo cuidado do break-inside:avoid da
   impressão). `pontosDeCorte` é puro e testado em run_laudo_email_test.js.

   Bibliotecas carregadas sob demanda (só quem envia paga o download):
   html2canvas 1.4.1 e jsPDF 2.5.1, de cdnjs.
   ══════════════════════════════════════════════════════════════════════ */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LaudoPdf = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var URL_HTML2CANVAS = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  var URL_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var MM_PX = 96 / 25.4;
  var A4 = {largura: 210, altura: 297, margem: 12};

  /* Escolhe onde cortar cada folha. `blocos` = [{topo, base}] dos elementos
     que não podem ser partidos (px, relativos ao topo do documento);
     `altura` = altura total; `folha` = altura útil de uma folha (px).
     Devolve a lista de cortes [y1, y2, ..., altura]. Um bloco maior que a
     folha inteira é cortado onde cair (não há alternativa). */
  function pontosDeCorte(blocos, altura, folha) {
    var cortes = [];
    var inicio = 0;
    var lista = (blocos || []).filter(function(b) { return b && b.base > b.topo; });
    var guarda = 0;
    while (altura - inicio > folha + 0.5 && guarda++ < 500) {
      var limite = inicio + folha;
      var corte = limite;
      // Se o limite cai dentro de um bloco, recua para o topo do bloco; repete
      // porque o topo pode cair dentro de outro bloco (célula dentro de linha).
      for (var volta = 0; volta < 50; volta++) {
        var dentro = null;
        for (var i = 0; i < lista.length; i++) {
          var b = lista[i];
          if (b.topo < corte - 0.5 && b.base > corte + 0.5) { if (!dentro || b.topo < dentro.topo) dentro = b; }
        }
        if (!dentro) break;
        corte = dentro.topo;
      }
      // Recuo que esvaziaria a folha (bloco maior que a folha): corta no limite.
      if (corte <= inicio + folha * 0.25) corte = limite;
      cortes.push(Math.round(corte));
      inicio = Math.round(corte);
    }
    cortes.push(Math.ceil(altura));
    return cortes;
  }

  function carregarScript(url, pronto) {
    return new Promise(function(resolve, reject) {
      if (pronto()) return resolve();
      var s = document.createElement('script');
      s.src = url; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function() { pronto() ? resolve() : reject(new Error('Biblioteca de PDF não carregou.')); };
      s.onerror = function() { reject(new Error('Não foi possível baixar a biblioteca de PDF (sem internet?).')); };
      document.head.appendChild(s);
    });
  }
  function bibliotecas() {
    return Promise.all([
      carregarScript(URL_HTML2CANVAS, function() { return typeof window.html2canvas === 'function'; }),
      carregarScript(URL_JSPDF, function() { return !!(window.jspdf && window.jspdf.jsPDF); })
    ]);
  }

  // Toda imagem entra no canvas como DADO. Duas razões: (1) logo de outro
  // domínio (cliente, no Storage) sem isso fica em branco no html2canvas;
  // (2) SVG sem largura/altura próprias (o logo da Kuryos só tem viewBox) sai
  // desenhado pela metade -- vira PNG aqui, em alta resolução (achado no PDF
  // do teste de UI de 17/11). Falhou: tira a imagem e avisa, em vez de mandar
  // um PDF com um quadrado vazio sem ninguém saber.
  function svgParaPng(texto) {
    return new Promise(function(resolve, reject) {
      var doc = new DOMParser().parseFromString(texto, 'image/svg+xml');
      var svg = doc.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== 'svg') return reject(new Error('SVG inválido'));
      var vb = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      var w = parseFloat(svg.getAttribute('width')) || (vb.length === 4 ? vb[2] : 300);
      var h = parseFloat(svg.getAttribute('height')) || (vb.length === 4 ? vb[3] : 150);
      var k = Math.max(1, 1600 / Math.max(w, h));
      svg.setAttribute('width', String(w * k));
      svg.setAttribute('height', String(h * k));
      var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
      var im = new Image();
      im.onload = function() {
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/png'));
      };
      im.onerror = function() { reject(new Error('SVG não desenhou')); };
      im.src = url;
    });
  }
  function imagemComoDado(img) {
    var src = img.getAttribute('src') || '';
    if (!src || /^data:image\/(png|jpe?g|webp|gif)/i.test(src)) return Promise.resolve(true);
    var abs = new URL(src, location.href);
    return fetch(abs.href, {mode: 'cors'}).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).then(function(blob) {
      if (/svg/i.test(blob.type) || /\.svg(\?|$)/i.test(abs.pathname)) {
        return blob.text().then(svgParaPng).then(function(png) { img.setAttribute('src', png); return true; });
      }
      return new Promise(function(resolve) {
        var fr = new FileReader();
        fr.onload = function() { img.setAttribute('src', fr.result); resolve(true); };
        fr.onerror = function() { resolve(false); };
        fr.readAsDataURL(blob);
      });
    }).catch(function() { return false; });
  }
  function esperarImagens(el) {
    var imgs = Array.prototype.slice.call(el.querySelectorAll('img'));
    return Promise.all(imgs.map(function(img) {
      return imagemComoDado(img).then(function(ok) {
        if (!ok) { img.parentNode && img.parentNode.removeChild(img); return {falhou: img.getAttribute('alt') || 'imagem'}; }
        if (img.complete && img.naturalWidth) return {};
        return new Promise(function(resolve) {
          img.onload = function() { resolve({}); };
          img.onerror = function() { img.parentNode && img.parentNode.removeChild(img); resolve({falhou: img.getAttribute('alt') || 'imagem'}); };
        });
      });
    })).then(function(rs) { return rs.filter(function(r) { return r.falhou; }).map(function(r) { return r.falhou; }); });
  }

  var SELETOR_BLOCOS = 'tr, li, .laudo-h, .laudo-h2, .laudo-topo, .laudo-linha-info, .laudo-conclusao, .laudo-obs, ' +
    '.laudo-assina, .laudo-nota, .laudo-nota-peq, .laudo-pesos-resumo, img';

  /* Folha isolada: um iframe com SÓ o CSS do laudo. Desenhar dentro da página
     levava junto o tema do app, e o html2canvas 1.4.1 aborta em cores
     modernas como color(...) ("unsupported color function", achado no teste
     de UI de 17/11). Isolado, o PDF também não muda se o tema mudar. */
  function folhaIsolada(html, larguraPx) {
    var link = document.querySelector('link[href*="laudo-cq.css"]');
    var css = new URL(link ? link.getAttribute('href') : 'shared/laudo-cq.css', location.href).href;
    var frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + larguraPx + 'px;height:2000px;border:0;visibility:hidden';
    document.body.appendChild(frame);
    return new Promise(function(resolve, reject) {
      var doc = frame.contentDocument;
      doc.open();
      doc.write('<!doctype html><html><head><meta charset="utf-8"><base href="' + location.href.replace(/"/g, '%22') + '">' +
        '<link rel="stylesheet" href="' + css.replace(/"/g, '%22') + '">' +
        '<style>html,body{margin:0;padding:0;background:#fff;color:#000}' +
        // html2canvas desenha border-collapse com bordas duplicadas/borradas: no PDF a
        // grade vira bordas separadas, uma linha só por divisa (mesmo desenho do impresso).
        '.laudo-tabela{border-collapse:separate;border-spacing:0;border-top:1px solid #666;border-left:1px solid #666}' +
        '.laudo-tabela th,.laudo-tabela td{border-width:0 1px 1px 0}</style></head>' +
        '<body><div id="laudoPdfFolha" style="width:' + larguraPx + 'px;background:#fff">' + html + '</div></body></html>');
      doc.close();
      var l = doc.querySelector('link[rel=stylesheet]');
      var pronto = function() { resolve({frame: frame, box: doc.getElementById('laudoPdfFolha')}); };
      if (l.sheet) return pronto();
      l.onload = pronto;
      l.onerror = function() { reject(new Error('Não foi possível carregar o estilo do laudo.')); };
    });
  }

  /* gerar(html) -> Promise<{base64, bytes, folhas, avisos}>. */
  function gerar(html) {
    var larguraPx = Math.round((A4.largura - 2 * A4.margem) * MM_PX);
    var folhaPx = (A4.altura - 2 * A4.margem) * MM_PX;
    var avisos = [];
    var frame = null;
    return bibliotecas().then(function() {
      return folhaIsolada(html, larguraPx);
    }).then(function(f) {
      frame = f.frame;
      var box = f.box;
      return esperarImagens(box).then(function(falhas) {
        if (falhas.length) avisos.push('Não foi possível incluir: ' + falhas.join(', ') + '.');
        var base = box.getBoundingClientRect().top;
        var blocos = Array.prototype.map.call(box.querySelectorAll(SELETOR_BLOCOS), function(el) {
          var r = el.getBoundingClientRect();
          // Título de seção nunca fica sozinho no pé da folha: anda junto com o
          // começo do que vem embaixo (mesmo efeito do break-after:avoid).
          var titulo = el.classList.contains('laudo-h') || el.classList.contains('laudo-h2');
          return {topo: r.top - base, base: r.bottom - base + (titulo ? 40 : 0)};
        });
        var altura = Math.ceil(box.scrollHeight);
        frame.style.height = (altura + 20) + 'px';
        var cortes = pontosDeCorte(blocos, altura, folhaPx);
        var escala = 2;
        return window.html2canvas(box, {scale: escala, backgroundColor: '#ffffff', useCORS: true, logging: false,
          windowWidth: larguraPx, width: larguraPx, height: altura}).then(function(canvas) {
          var pdf = new window.jspdf.jsPDF({unit: 'mm', format: 'a4', orientation: 'portrait', compress: true});
          var larguraMm = A4.largura - 2 * A4.margem;
          var inicio = 0;
          cortes.forEach(function(fim, i) {
            var hPx = Math.max(1, fim - inicio);
            var fatia = document.createElement('canvas');
            fatia.width = canvas.width;
            fatia.height = Math.round(hPx * escala);
            var ctx = fatia.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, fatia.width, fatia.height);
            ctx.drawImage(canvas, 0, Math.round(inicio * escala), canvas.width, fatia.height, 0, 0, fatia.width, fatia.height);
            if (i > 0) pdf.addPage();
            pdf.addImage(fatia.toDataURL('image/jpeg', 0.9), 'JPEG', A4.margem, A4.margem, larguraMm, hPx / MM_PX);
            inicio = fim;
          });
          var dataUri = pdf.output('datauristring');
          var base64 = dataUri.slice(dataUri.indexOf(',') + 1);
          return {base64: base64, bytes: Math.round(base64.length * 3 / 4), folhas: cortes.length, avisos: avisos, pdf: pdf};
        });
      });
    }).finally(function() {
      if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    });
  }

  return {gerar: gerar, pontosDeCorte: pontosDeCorte, A4: A4};
});
