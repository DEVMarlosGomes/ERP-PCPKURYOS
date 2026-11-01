(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImportacaoJsonPendenciasUI = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(char) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];
    });
  }

  function abertas(todas) {
    return Object.keys(todas || {}).map(function(key) { return {key: key, dado: todas[key]}; })
      .filter(function(item) { return item.dado && item.dado.status === 'ABERTA' && item.dado.tipo === 'REFERENCIA_IMPORTACAO'; })
      .sort(function(a, b) { return String(a.dado.colecao).localeCompare(String(b.dado.colecao)) || String(a.dado.registroKey).localeCompare(String(b.dado.registroKey)); });
  }

  function resumo(lista) {
    return lista.reduce(function(acc, item) {
      var key = item.dado.colecao || 'outros';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function montar(opcoes) {
    var host = opcoes.el, db = opcoes.db;
    if (!host || !db) return;
    var todas = {};

    function render() {
      var lista = abertas(todas);
      if (!lista.length) { host.hidden = true; host.innerHTML = ''; return; }
      var grupos = resumo(lista);
      host.hidden = false;
      host.innerHTML = '<section class="ij-alerta" aria-labelledby="ij-alerta-titulo">' +
        '<div class="ij-alerta-icone" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 8v5.5M12 17h.01"/></svg></div>' +
        '<div class="ij-alerta-copy"><strong id="ij-alerta-titulo">' + lista.length + ' referências importadas precisam de regularização</strong>' +
        '<span>Os históricos já estão preservados. Vincule os produtos corretos para fechar estas pendências.</span></div>' +
        '<button type="button" class="btn btn-ghost ij-abrir">Revisar pendências</button></section>' +
        '<dialog class="ij-dialog" aria-labelledby="ij-dialog-titulo"><div class="ij-dialog-head"><div><h2 id="ij-dialog-titulo">Regularização da importação</h2>' +
        '<p>' + Object.keys(grupos).sort().map(function(k) { return esc(k) + ': ' + grupos[k]; }).join(' · ') + '</p></div>' +
        '<button type="button" class="ij-fechar" aria-label="Fechar"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>' +
        '<div class="ij-dialog-body"><p class="ij-explicacao">O registro foi trazido porque o JSON é a fonte mais atual, mas aponta para um SKU/código de produto que ainda não existe em Cadastros. Não exclua o histórico: crie o produto ou corrija o vínculo.</p>' +
        '<div class="ij-lista">' + lista.map(function(item) { var p = item.dado; return '<article class="ij-item"><div><strong>' + esc(p.valorAusente || 'Referência sem valor') + '</strong><span>' + esc(p.colecao) + ' / ' + esc(p.registroKey) + '</span><small>' + esc(p.texto) + '</small></div><a class="btn btn-ghost btn-sm" href="cadastros.html?tab=produtos&regularizar=' + encodeURIComponent(p.valorAusente || '') + '">Abrir Produtos</a></article>'; }).join('') +
        '</div></div><div class="ij-dialog-foot"><span>A pendência fecha automaticamente quando o vínculo apontar para um produto existente.</span><button type="button" class="btn btn-primary ij-entendi">Entendi</button></div></dialog>';
      var dialog = host.querySelector('.ij-dialog');
      function abrir() { if (dialog && !dialog.open) dialog.showModal(); }
      function fechar() { if (dialog && dialog.open) dialog.close(); }
      host.querySelector('.ij-abrir').addEventListener('click', abrir);
      host.querySelector('.ij-fechar').addEventListener('click', fechar);
      host.querySelector('.ij-entendi').addEventListener('click', fechar);
      dialog.addEventListener('click', function(event) { if (event.target === dialog) fechar(); });
      var regularizacaoEmCurso = typeof location !== 'undefined' && new URLSearchParams(location.search).has('regularizar');
      if (!regularizacaoEmCurso) abrir();
    }

    var ref = db.ref('pendencias_setor');
    var onValue = function(snapshot) { todas = snapshot.val() || {}; render(); };
    if (typeof root.dbOnValue === 'function') root.dbOnValue(ref, onValue, {onError: function() { host.hidden = true; }});
    else ref.on('value', onValue, function() { host.hidden = true; });
  }

  return {abertas: abertas, resumo: resumo, montar: montar};
});
