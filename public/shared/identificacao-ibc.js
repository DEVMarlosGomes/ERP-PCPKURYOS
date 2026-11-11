/* Identificação do IBC (bulk) — 5 páginas, uma por setor (11/11/2026).

   Pedido: ao emitir a OP, liberar para impressão a identificação que vai no
   IBC/tanque do granel, uma página para cada setor, com os dados puxados da
   OP. Os ÚNICOS campos editáveis antes de imprimir são Equipamento e
   Etiqueta (por setor). Modelo: "etiqueta_kuryos MANIPULAÇÃO.pdf" — Produto,
   código (SKU), Lote, Validade, Equipamento, Etiqueta e a faixa da Kuryos.

   Os valores digitados ficam em ops/{opKey}/identificacaoIbc/{setor} para a
   reimpressão (Controle de OPs) sair igual. Lote, produto, SKU e validade NÃO
   se editam: vêm da OP gravada.

   dados(op) -> {produto, codigo, lote, validade}
   paginas(op, campos, opcoes) -> HTML das páginas (A4 deitada)
   imprimir(op, campos, opcoes) -> abre janela própria e imprime (false se pop-up bloqueado)
   abrirDialogo({op, opKey, db}) -> diálogo com os 5 setores
   Funções de dados/HTML são puras e rodam no Node (testes). */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IdentificacaoIbc = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var SETORES = [
    {k: 'separacao', nome: 'Separação'},
    {k: 'fabricacao', nome: 'Fabricação'},
    {k: 'envase', nome: 'Envase'},
    {k: 'rotulagem', nome: 'Rotulagem'},
    {k: 'produtoAcabado', nome: 'Produto Acabado'}
  ];
  var MAX = 60;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; });
  }
  // Validade gravada na OP (ISO, meia-noite local da emissão) em dd/mm/aaaa.
  function dataBr(iso) {
    if (!iso) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }
  function dados(op) {
    op = op || {};
    return {produto: String(op.produto || '').trim(), codigo: String(op.sku || '').trim(), lote: String(op.lote || '').trim(), validade: dataBr(op.validade)};
  }
  function faltando(op) {
    var d = dados(op), f = [];
    if (!d.produto) f.push('Produto');
    if (!d.codigo) f.push('SKU');
    if (!d.lote) f.push('Lote');
    if (!d.validade) f.push('Validade');
    return f;
  }
  function limpar(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, MAX); }
  // Só equipamento e etiqueta, só dos 5 setores conhecidos.
  function normalizarCampos(campos) {
    var out = {};
    SETORES.forEach(function(s) {
      var c = (campos || {})[s.k] || {};
      out[s.k] = {equipamento: limpar(c.equipamento), etiqueta: limpar(c.etiqueta)};
    });
    return out;
  }

  var CSS =
    '@page{size:A4 landscape;margin:12mm}' +
    '*{box-sizing:border-box}' +
    'body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.ibc{width:100%;height:178mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:31mm 15mm 31mm 14mm 34mm 7mm 1fr;border:2px solid #000;page-break-after:always;break-after:page}' +
    '.ibc:last-child{page-break-after:auto;break-after:auto}' +
    '.ibc>div{border-right:2px solid #000;border-bottom:2px solid #000;padding:2.5mm 3.5mm;overflow:hidden;min-width:0}' +
    '.ibc>div.dir{border-right:none}' +
    '.ibc .full{grid-column:1/-1;border-right:none}' +
    '.rot{color:#0a1c69;font-weight:700;font-size:15pt;letter-spacing:.01em}' +
    '.prod{font-weight:700;font-size:12pt;text-align:center;margin-top:5mm;line-height:1.2}' +
    '.cod{font-weight:700;font-size:17pt;text-align:center;display:flex;align-items:center;justify-content:center}' +
    '.equip{text-align:center}.equip .rot{display:block}' +
    '.val{font-size:15pt;font-weight:700;text-align:center;margin-top:2mm;overflow-wrap:anywhere}' +
    '.grande{font-size:48pt;text-align:center;line-height:1.05;font-variant-numeric:tabular-nums}' +
    '.setor{font-size:10pt;color:#333;display:flex;align-items:center}' +
    '.marca{grid-column:1/-1;background:#0a1c69;border:none!important;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5mm}' +
    '.marca img{height:19mm;filter:brightness(0) invert(1)}' +
    '.marca span{color:#fff;font-size:7pt;letter-spacing:.35em}' +
    '@media screen{body{background:#e9e9e9;padding:10px}.ibc{background:#fff;margin:0 auto 12px;max-width:1100px;height:620px;grid-template-rows:108px 52px 108px 48px 118px 24px 1fr}}';

  function pagina(d, setor, c, logoUrl) {
    return '<section class="ibc" aria-label="Identificação do IBC — ' + esc(setor.nome) + '">' +
      '<div><div class="rot">PRODUTO:</div><div class="prod">' + esc(d.produto) + '</div></div>' +
      '<div class="dir equip"><span class="rot">EQUIPAMENTO:</span><div class="val">' + esc(c.equipamento) + '</div></div>' +
      '<div class="cod">' + esc(d.codigo) + '</div>' +
      '<div class="dir"></div>' +
      '<div><div class="rot">LOTE:</div><div class="grande">' + esc(d.lote) + '</div></div>' +
      '<div class="dir"><div class="rot">ETIQUETA:</div><div class="val">' + esc(c.etiqueta) + '</div></div>' +
      '<div class="setor">Setor: <b style="margin-left:4px">' + esc(setor.nome) + '</b></div>' +
      '<div class="dir"></div>' +
      '<div class="full"><div class="rot">VALIDADE:</div><div class="grande">' + esc(d.validade) + '</div></div>' +
      '<div class="full"></div>' +
      // O SVG da marca já traz "INDÚSTRIA DE COSMÉTICOS"; o texto só entra sem o logo.
      '<div class="marca">' + (logoUrl ? '<img src="' + esc(logoUrl) + '" alt="Kuryos — Indústria de Cosméticos">'
        : '<b style="color:#fff;font-size:26pt;letter-spacing:.12em">KURYOS</b><span>INDÚSTRIA DE COSMÉTICOS</span>') + '</div>' +
    '</section>';
  }
  function paginas(op, campos, opcoes) {
    opcoes = opcoes || {};
    var d = dados(op), c = normalizarCampos(campos);
    var setores = opcoes.setores ? SETORES.filter(function(s) { return opcoes.setores.indexOf(s.k) !== -1; }) : SETORES;
    return setores.map(function(s) { return pagina(d, s, c[s.k], opcoes.logoUrl); }).join('');
  }
  function documento(op, campos, opcoes) {
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc('Identificação IBC ' + String((op || {}).lote || '').replace(/\//g, '.') + ' - ' + ((op || {}).produto || '')) +
      '</title><style>' + CSS + '</style></head><body>' + paginas(op, campos, opcoes) + '</body></html>';
  }
  function imprimir(op, campos, opcoes) {
    var w = window.open('', '_blank', 'width=1100,height=800');
    if (!w) return false;
    w.document.write(documento(op, campos, opcoes).replace('</body>',
      '<script>(function(){var imgs=[].slice.call(document.images),n=imgs.length,feito=false;' +
      'function ir(){if(feito)return;feito=true;setTimeout(function(){window.print()},50)}' +
      'if(!n)return window.addEventListener("load",ir);' +
      'imgs.forEach(function(i){if(i.complete)--n;else{i.onload=i.onerror=function(){if(--n<=0)ir()}}});' +
      'if(n<=0)window.addEventListener("load",ir);setTimeout(ir,4000)})()<\/script></body>'));
    w.document.close();
    return true;
  }

  /* ── Diálogo (navegador) ── */
  function abrirDialogo(cfg) {
    var doc = document, op = cfg.op || {}, db = cfg.db;
    var antigo = doc.getElementById('ibcDlg'); if (antigo) antigo.remove();
    var logoUrl = new URL('kuryos-logo.svg', doc.baseURI).href;
    var d = dados(op), falta = faltando(op);
    var campos = normalizarCampos(op.identificacaoIbc);
    var bg = doc.createElement('div');
    bg.id = 'ibcDlg';
    bg.setAttribute('style', 'position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px');
    var linhas = SETORES.map(function(s, i) {
      return '<tr data-linha="' + s.k + '"><th scope="row" style="text-align:left;padding:6px 8px;font-weight:650;white-space:nowrap">' + (i + 1) + '. ' + esc(s.nome) + '</th>' +
        '<td style="padding:4px 6px"><input type="text" data-setor="' + s.k + '" data-campo="equipamento" maxlength="' + MAX + '" aria-label="Equipamento — ' + esc(s.nome) + '" value="' + esc(campos[s.k].equipamento) + '" style="width:100%;min-height:34px"></td>' +
        '<td style="padding:4px 6px"><input type="text" data-setor="' + s.k + '" data-campo="etiqueta" maxlength="' + MAX + '" aria-label="Etiqueta — ' + esc(s.nome) + '" value="' + esc(campos[s.k].etiqueta) + '" style="width:100%;min-height:34px"></td></tr>';
    }).join('');
    var estilo = '<style>#ibcDlg .ibc-btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:7px 14px;border-radius:8px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;border:1.5px solid var(--border,#d2d2d7);background:var(--card,#fff);color:var(--text,#111)}' +
      '#ibcDlg .ibc-btn:hover{border-color:var(--muted,#6e6e73)}#ibcDlg .ibc-btn.pri{background:var(--primary,#0a1c69);border-color:var(--primary,#0a1c69);color:#fff}' +
      '#ibcDlg .ibc-btn.sm{min-height:30px;padding:4px 10px;font-weight:600;font-size:12.5px}#ibcDlg .ibc-x{width:34px;height:34px;border:none;background:transparent;border-radius:8px;font-size:18px;cursor:pointer;color:var(--muted,#666)}' +
      '#ibcDlg .ibc-x:hover{background:rgba(0,0,0,.06)}#ibcDlg input[data-setor]{box-sizing:border-box;padding:6px 9px;border:1.5px solid var(--border,#d2d2d7);border-radius:8px;background:var(--card,#fff);color:var(--text,#111);font:inherit}' +
      '#ibcDlg input[data-setor]:focus-visible,#ibcDlg .ibc-btn:focus-visible{outline:2px solid var(--primary-light,#2456d6);outline-offset:1px}' +
      '#ibcDlg .ibc-dados{display:grid;grid-template-columns:2fr 1fr 1fr 1fr}#ibcDlg tr.ativo th{color:var(--primary-light,#2456d6)}' +
      '@media (max-width:560px){#ibcDlg .ibc-dados{grid-template-columns:1fr 1fr}#ibcDlg .ibc-dados>div:first-child{grid-column:1/-1}#ibcDlg .ibc-dados>div:nth-child(2){border-left:none!important}}</style>';
    bg.innerHTML = estilo + '<div role="dialog" aria-modal="true" aria-labelledby="ibcTit" style="background:var(--card,var(--surface,#fff));color:var(--text,#111);border-radius:14px;max-width:820px;width:100%;max-height:94vh;display:flex;flex-direction:column;box-shadow:0 24px 48px -12px rgba(15,23,42,.35)">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:18px 20px 12px;border-bottom:1px solid var(--border,#ddd)">' +
        '<div><h3 id="ibcTit" style="margin:0;font-size:17px">Identificação do IBC — OP ' + esc(d.lote) + '</h3>' +
        '<div style="font-size:12.5px;color:var(--muted,#666);margin-top:3px">5 páginas, uma por setor. Só Equipamento e Etiqueta se editam; o resto vem da OP.</div></div>' +
        '<button type="button" id="ibcFechar" class="ibc-x" aria-label="Fechar">✕</button></div>' +
      '<div style="padding:14px 20px;overflow:auto">' +
        '<dl class="ibc-dados" style="gap:0;margin:0 0 14px;border:1px solid var(--border,#ddd);border-radius:10px;font-size:13px">' +
          [['Produto', d.produto], ['SKU', d.codigo], ['Lote', d.lote], ['Validade', d.validade]].map(function(x, i) {
            return '<div style="padding:8px 10px;min-width:0' + (i ? ';border-left:1px solid var(--border,#ddd)' : '') + '"><dt style="font-size:11.5px;color:var(--muted,#666)">' + x[0] + '</dt><dd style="margin:2px 0 0;font-weight:650;overflow-wrap:anywhere">' + (esc(x[1]) || '<span style="color:#b91c1c">falta</span>') + '</dd></div>';
          }).join('') + '</dl>' +
        (falta.length ? '<div role="alert" style="background:#fff4e5;color:#7a4b00;border:1px solid #f0c27a;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:13px">A OP não tem: <b>' + esc(falta.join(', ')) + '</b>. Sai em branco nas páginas.</div>' : '') +
        '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left;padding:4px 8px;font-size:12px;color:var(--muted,#666)">Setor</th><th style="text-align:left;padding:4px 6px;font-size:12px;color:var(--muted,#666)">Equipamento</th><th style="text-align:left;padding:4px 6px;font-size:12px;color:var(--muted,#666)">Etiqueta</th></tr></thead><tbody>' + linhas + '</tbody></table>' +
        '<button type="button" id="ibcRepetir" class="ibc-btn sm" style="margin-top:8px">Repetir a 1ª linha nos setores em branco</button>' +
        '<div style="margin-top:12px;background:#e9e9e9;border-radius:8px;padding:8px"><div id="ibcPrevRot" style="font-size:12px;color:#444;margin:0 0 6px 2px"></div><iframe id="ibcPrev" title="Pré-visualização da página do setor" style="border:0;width:100%;height:330px;background:transparent"></iframe></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;padding:12px 20px 16px;border-top:1px solid var(--border,#ddd);flex-wrap:wrap">' +
        '<button type="button" class="ibc-btn" id="ibcCancelar">Cancelar</button><button type="button" class="ibc-btn pri" id="ibcImprimir">🖨 Imprimir 5 páginas</button></div></div>';
    doc.body.appendChild(bg);
    function $(id) { return doc.getElementById(id); }
    function aoTeclar(e) { if (e.key === 'Escape') fechar(); }
    function fechar() { bg.remove(); doc.removeEventListener('keydown', aoTeclar); }
    doc.addEventListener('keydown', aoTeclar);
    $('ibcFechar').onclick = fechar; $('ibcCancelar').onclick = fechar;
    bg.addEventListener('click', function(e) { if (e.target === bg) fechar(); });
    function lerCampos() {
      var c = {};
      bg.querySelectorAll('input[data-setor]').forEach(function(inp) {
        var s = inp.getAttribute('data-setor');
        c[s] = c[s] || {};
        c[s][inp.getAttribute('data-campo')] = inp.value;
      });
      return normalizarCampos(c);
    }
    var setorPrev = SETORES[0];
    function render() {
      var prev = $('ibcPrev');
      $('ibcPrevRot').textContent = 'Prévia: página ' + (SETORES.indexOf(setorPrev) + 1) + ' de 5 — ' + setorPrev.nome;
      bg.querySelectorAll('tr[data-linha]').forEach(function(tr) { tr.classList.toggle('ativo', tr.getAttribute('data-linha') === setorPrev.k); });
      prev.srcdoc = '<!doctype html><meta charset="utf-8"><style>' + CSS + '</style><body style="margin:0;padding:6px;background:transparent">' +
        '<div style="transform:scale(.5);transform-origin:top center;width:200%;margin-left:-50%">' + paginas(op, lerCampos(), {setores: [setorPrev.k], logoUrl: logoUrl}) + '</div></body>';
    }
    bg.querySelectorAll('input[data-setor]').forEach(function(inp) {
      inp.addEventListener('input', render);
      inp.addEventListener('focus', function() {
        var k = inp.getAttribute('data-setor');
        if (k !== setorPrev.k) { setorPrev = SETORES.filter(function(x) { return x.k === k; })[0]; render(); }
      });
    });
    $('ibcRepetir').onclick = function() {
      var c = lerCampos(), base = c[SETORES[0].k];
      bg.querySelectorAll('input[data-setor]').forEach(function(inp) {
        if (!inp.value.trim()) inp.value = base[inp.getAttribute('data-campo')] || '';
      });
      render();
    };
    $('ibcImprimir').onclick = function() {
      var c = lerCampos();
      if (!imprimir(op, c, {logoUrl: logoUrl})) { alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.'); return; }
      // Grava o que foi digitado para a reimpressão sair igual (não bloqueia a impressão).
      if (db && cfg.opKey && JSON.stringify(c) !== JSON.stringify(normalizarCampos(op.identificacaoIbc))) {
        db.ref('ops/' + cfg.opKey + '/identificacaoIbc').set(c).then(function() { op.identificacaoIbc = c; })
          .catch(function() { alert('Páginas enviadas, mas não consegui gravar equipamento/etiqueta na OP (sem permissão?).'); });
      }
      fechar();
    };
    render();
    var primeiro = bg.querySelector('input[data-setor]'); if (primeiro) primeiro.focus();
    return bg;
  }

  return {SETORES: SETORES, dados: dados, faltando: faltando, normalizarCampos: normalizarCampos, paginas: paginas, documento: documento,
    imprimir: imprimir, abrirDialogo: abrirDialogo};
});
