/* Barra "Pendências da Emissão de OP" nas telas dos setores (Cadastros, Qualidade), 17/10/2026.
   Regras em shared/pendencias-setor.js. Dado do produto se preenche ali mesmo (grava em
   produtos/{key}/campo e fecha a pendência no mesmo update); material fora do cadastro abre
   Cadastros › Fórmulas / BOM do produto. Pendência cujo dado já apareceu no cadastro fecha sozinha.
   Uso: PendenciasSetorUI.montar({ el, setores: ['CADASTROS'], db, autor: function() { return nome; } }) */
(function(root) {
  'use strict';
  var P = root.PendenciasSetor;
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function dataBr(iso) { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function chaveMaterial(c) { return String(c || '').replace(/[.#$\[\]\/]/g, '_'); }

  function montar(op) {
    var el = op.el, db = op.db, setores = op.setores || [];
    var autor = op.autor || function() { return 'Usuário do sistema'; };
    if (!el || !db || !P) return;
    var todas = {};
    var conferidas = {};

    // Fecha sozinha a pendência cujo dado já está no cadastro (uma conferência por pendência por carga).
    function conferir(lista) {
      lista.forEach(function(e) {
        var k = e[0], p = e[1];
        if (conferidas[k]) return;
        conferidas[k] = true;
        var leitura = p.tipo === 'MATERIAL'
          ? db.ref(p.colecao + '/' + p.versaoKey + '/itens/' + p.itemKey).once('value').then(function(s) {
              var it = s.val() || {}, cod = p.colecao === 'bom' ? it.materialCodigo : it.mpCodigo;
              if (!cod) return { item: it };
              return db.ref('materiais/' + chaveMaterial(cod)).once('value').then(function(m) { return { item: it, codigoNoCadastro: function() { return m.exists(); } }; });
            })
          : db.ref('produtos/' + p.produtoKey).once('value').then(function(s) { return { produto: s.val() || {} }; });
        leitura.then(function(dados) {
          if (P.jaResolvida(p, dados)) return db.ref().update(P.gravacaoResolvida(k, autor(), new Date().toISOString(), 'dado já estava no cadastro'));
        }).catch(function() {});
      });
    }

    function render() {
      var lista = P.abertasDoSetor(todas, setores);
      if (!lista.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
      el.style.display = 'block';
      el.innerHTML = '<div style="margin:12px 0;padding:12px 14px;border-radius:10px;font-size:13px;background:var(--tint-red-bg,#fee2e2);border:1px solid var(--border,#d2d2d7);color:var(--text,#1d1d1f)" data-testid="pendencias-setor">' +
        '<b>⚠ ' + lista.length + ' pendência(s) da Emissão de OP</b>' +
        '<div style="font-size:12px;color:var(--muted);margin:4px 0 8px">Quem emitiu a OP encontrou dado faltando. Preencha aqui (vai direto para o cadastro do produto) ou corrija no cadastro — a pendência fecha sozinha.</div>' +
        lista.map(function(e) {
          var k = e[0], p = e[1], meta = P.CAMPOS[p.campo] || {};
          var acao = p.tipo === 'DADO_PRODUTO'
            ? '<span style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap">' +
                '<input class="ps-valor" data-k="' + esc(k) + '" inputmode="decimal" placeholder="' + esc(p.rotulo) + '" style="width:120px">' +
                (meta.tipo === 'volume' ? '<select class="ps-unidade" data-k="' + esc(k) + '">' + P.UNIDADES_VOLUME.map(function(u) { return '<option value="' + u + '">' + u + '</option>'; }).join('') + '</select>' : '') +
                '<button class="btn btn-primary btn-sm ps-salvar" data-k="' + esc(k) + '">Salvar</button></span>'
            : '<a class="btn btn-ghost btn-sm" href="cadastros.html?tab=formulas&produto=' + encodeURIComponent(p.produtoKey) + '">Abrir Fórmula / BOM</a>';
          return '<div style="display:flex;gap:10px;align-items:center;padding:6px 0;flex-wrap:wrap;border-top:1px solid var(--border)">' +
            '<span class="badge">' + esc(P.SETORES[p.setor] || p.setor) + '</span>' +
            (p.obrigatorio ? '<span class="badge" style="background:var(--tint-red-bg);color:var(--tint-red-fg)">trava a OP</span>' : '<span class="badge">aviso</span>') +
            '<span style="flex:1;min-width:220px"><b>' + esc(p.sku) + '</b> · ' + esc(p.texto) +
              '<span style="display:block;font-size:11px;color:var(--muted)">' + esc(p.ultimoAvisoPor || p.criadoPor) + ' em ' + dataBr(p.ultimoAvisoEm || p.criadoEm) +
              (Number(p.avisos) > 1 ? ' · avisado ' + p.avisos + ' vezes' : '') + ' · ' + esc(p.onde) + '</span></span>' + acao + '</div>';
        }).join('') + '<div class="ps-erro" style="color:var(--danger);font-size:12px"></div></div>';
      el.querySelectorAll('.ps-salvar').forEach(function(b) { b.addEventListener('click', function() { salvar(b.getAttribute('data-k')); }); });
      conferir(lista);
    }

    function salvar(k) {
      var p = todas[k];
      if (!p) return;
      var campoValor = el.querySelector('.ps-valor[data-k="' + k + '"]');
      var campoUn = el.querySelector('.ps-unidade[data-k="' + k + '"]');
      var r = P.validarValor(p.campo, campoValor && campoValor.value, campoUn && campoUn.value);
      var erroEl = el.querySelector('.ps-erro');
      if (r.vazio) { erroEl.textContent = 'Informe ' + p.rotulo + '.'; return; }
      if (r.erro) { erroEl.textContent = r.erro; return; }
      var up = P.gravacaoResolvida(k, autor(), new Date().toISOString(), 'preenchido na barra do setor');
      Object.keys(r.valores).forEach(function(c) { up['produtos/' + p.produtoKey + '/' + c] = r.valores[c]; });
      up['pendencias_setor/' + k + '/valorInformado'] = r.valores;
      db.ref().update(up).then(function() { erroEl.textContent = ''; })
        .catch(function(err) { erroEl.textContent = 'Não foi possível salvar: ' + (err && err.message || err); });
    }

    var ref = db.ref('pendencias_setor');
    var onData = function(s) { todas = s.val() || {}; render(); };
    if (typeof root.dbOnValue === 'function') root.dbOnValue(ref, onData, { onError: function() { el.style.display = 'none'; } });
    else ref.on('value', onData, function() { el.style.display = 'none'; });
  }

  root.PendenciasSetorUI = { montar: montar };
})(typeof globalThis !== 'undefined' ? globalThis : this);
