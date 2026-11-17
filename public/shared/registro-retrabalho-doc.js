/* ══════════════════════════════════════════════════════════════════════
   ANEXO DO RELATÓRIO DA RNC — REGISTRO DE RETRABALHO (16/11/2026)

   O FOR-QUA-0001 (shared/laudo-cq.js) é a folha da RNC. O retrabalho que a
   tratou vai junto, como ANEXO, no mesmo papel A4 e com as mesmas classes de
   impressão (shared/laudo-cq.css): identificação, balanço de quantidades,
   as três etapas com materiais, a decisão da Qualidade, o histórico de
   alterações e o anexo fotográfico (fotos da RNC e das etapas).

   Regra de documento de BPF, a mesma do laudo: campo vazio sai EM BRANCO
   (pendência visível), nunca preenchido por suposição. Registro ainda não
   encerrado sai com faixa de documento provisório, e balanço que não fecha
   sai com faixa própria -- papel que circula sem essas faixas pareceria um
   caso encerrado e conciliado.

   Funções PURAS (sem DOM, sem Firebase). Recebe o motor
   (shared/registro-retrabalho.js) por parâmetro ou do escopo global.
   Teste: run_registro_retrabalho_doc_test.js.
   ══════════════════════════════════════════════════════════════════════ */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./registro-retrabalho.js'));
  else root.RegistroRetrabalhoDoc = factory(root.RegistroRetrabalho);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(T) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) { if (v === '' || v == null) return ''; var x = Number(v); return isFinite(x) ? x.toLocaleString('pt-BR') : ''; }
  function data(s) {
    s = String(s || '');
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
    var d = s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
    var h = /T(\d{2}:\d{2})/.exec(s);
    // ISO com Z vem do servidor (UTC): mostra no horário de Brasília.
    if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) {
      var t = new Date(s);
      if (!isNaN(t)) return t.toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'});
    }
    return d + (h ? ' ' + h[1] : '');
  }
  function titulo(n, t) { return '<div class="laudo-h">' + esc(n) + '. ' + esc(t) + '</div>'; }
  function campo(rot, v, larg) {
    return '<span class="laudo-par"><b>' + esc(rot) + ':</b> <span class="laudo-campo"' + (larg ? ' style="min-width:' + larg + '"' : '') + '>' + esc(v == null ? '' : v) + '</span></span>';
  }
  function linha(partes) { return '<div class="laudo-campo-linha">' + partes.join('') + '</div>'; }
  function obs(t) { return '<div class="laudo-obs">' + esc(t || '') + '</div>'; }
  // "3.470 → 1.460 (ajuste)" quando o apontamento foi ajustado depois do fato.
  function apontado(x) {
    var aj = T.lista(x.ajustesApontamento);
    if (!aj.length || x.qtdApontadaOriginal == null) return num(x.qtdApontada);
    return num(x.qtdApontadaOriginal) + ' → ' + num(x.qtdApontada) + ' (ajuste)';
  }
  function sku(v) { return {html: '<span style="white-space:nowrap">' + esc(v || '') + '</span>'}; }
  function tabela(cols, linhas) {
    return '<table class="laudo-tabela"><thead><tr>' + cols.map(function(c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      linhas.map(function(l) { return '<tr>' + l.map(function(c) { return '<td>' + (c && c.html != null ? c.html : esc(c == null ? '' : c)) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table>';
  }
  function topo(codigo, sub) {
    return '<div class="laudo-topo"><div class="laudo-topo-org">LABORATÓRIO DE CONTROLE DE QUALIDADE E DESENVOLVIMENTO</div>' +
      '<div class="laudo-topo-doc">ANEXO DO RELATÓRIO DE NÃO CONFORMIDADE<br>REGISTRO DE RETRABALHO ' + esc(codigo) + '</div>' +
      '<div class="laudo-topo-ref">' + esc(sub) + '</div></div>';
  }
  function faixa(texto, detalhe) {
    return '<div class="laudo-cancelada">' + esc(texto) + (detalhe ? '<div class="laudo-cancelada-motivo">' + esc(detalhe) + '</div>' : '') + '</div>';
  }
  function ehImagem(f) { return /^image\//.test(f.contentType || '') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(f.nomeOriginal || f.caminho || f.url || ''); }

  /* Páginas do anexo de UM registro. rnc = nao_conformidades/{n} (para as fotos). */
  function paginasRegistro(codigo, r, rnc) {
    r = r || {};
    var o = r.origem || {}, b = T.balanco(r), destinos = T.lista(r.destinos), perdas = T.lista(r.perdas), ets = T.etapas(r);
    var dec = r.decisao || {}, cri = r.criadoPor || {};
    var rel = Object.keys(r.rncsRelacionadas || {}).map(function(k) { return r.rncsRelacionadas[k]; });
    var sub = 'Vinculado à ' + (r.rncNumero || 'RNC') + ' · Situação: ' + (T.STATUS[r.status] || r.status || '');

    var h = '<div class="laudo-page laudo-rr">' + topo(codigo, sub);
    if (r.status !== 'ENCERRADO') h += faixa('DOCUMENTO PROVISÓRIO — REGISTRO ' + String(T.STATUS[r.status] || r.status || '').toUpperCase(), 'Sem a decisão da Qualidade este anexo não encerra o caso.');
    if (!b.fecha) h += faixa('BALANÇO NÃO FECHADO — DIFERENÇA DE ' + num(b.diferenca) + ' UN.', 'Origem − destinos − perdas declaradas ≠ 0. A diferença precisa de destino declarado.');

    h += titulo(1, 'IDENTIFICAÇÃO') + '<div class="laudo-ident">' +
      linha([campo('Registro', codigo, '150px'), campo('RNC', r.rncNumero, '130px'), campo('RNCs relacionadas', rel.join(', '), '150px')]) +
      linha([campo('Cliente', o.cliente, '300px'), campo('Pedido', o.pedidoKey ? String(o.pedidoKey).split('__')[0] : '', '110px')]) +
      linha([campo('Lote de origem', o.lote, '110px'), campo('Produto', o.produto, '330px')]) +
      linha([campo('Ocorrida em', data(r.ocorridaEm), '100px'), campo('Aberto por', cri.nome, '170px'), campo('Aberto em', data(r.criadoEm), '120px')]) +
      '</div>' +
      '<div class="laudo-linha-info"><b>Descrição:</b></div>' + obs(r.descricao) +
      '<div class="laudo-nota-peq">Registro retrospectivo: documenta o retrabalho executado. Não altera OP, pedido, estoque, palete, conferência nem expedição.</div>';

    h += titulo(2, 'BALANÇO DE QUANTIDADES') +
      tabela(['', 'Lote', 'SKU', 'Produto', 'Apontado no sistema', 'Conferido (PA)', 'Unidades finais', 'Granel de origem', 'Observação'],
        [['Origem', o.lote, sku(o.sku), o.produto, apontado(o) + (o.qtdPlanejada != null ? ' (plan. ' + num(o.qtdPlanejada) + ')' : ''), '', num(o.qtd), '', '']]
          .concat(destinos.map(function(d) { return ['Destino', d.lote, sku(d.sku), d.produto, apontado(d), num(d.qtdConferida), num(d.qtd), d.granelLote, d.observacao]; }))
          .concat(perdas.map(function(p) { return ['Perda', '', '', T.MOTIVOS_PERDA[p.motivo] || '', '', '', num(p.qtd), '', p.observacao]; }))) +
      '<div class="laudo-campo-linha">' + campo('Origem', num(b.origem)) + campo('Destinos', num(b.destinos)) + campo('Perdas', num(b.perdas)) +
        campo('Diferença', num(b.diferenca)) + '<span class="laudo-par"><b>' + (b.fecha ? 'Balanço fechado' : 'Balanço NÃO fechado') + '</b></span></div>' +
      (b.avisos.length ? '<div class="laudo-nota-peq">Avisos: ' + esc(b.avisos.join(' · ')) + '</div>' : '');

    ets.forEach(function(e, i) {
      var be = b.etapas[i] || {};
      h += titulo(3 + i, 'ETAPA ' + e.n + ' — ' + String(T.TIPOS_ETAPA[e.tipo] || e.tipo).toUpperCase()) + '<div class="laudo-ident">' +
        linha([campo('Recurso', e.recurso, '160px'), campo('Início', data(e.inicio), '110px'), campo('Fim', data(e.fim), '110px')]) +
        linha([campo('Responsáveis', e.responsaveis, '260px')]) +
        linha([campo('Entrada (un.)', num(e.qtdEntrada), '70px'), campo('Saída (un.)', num(e.qtdSaida), '70px'), campo('Perda (un.)', num(e.qtdPerda), '70px'),
          campo('Conferência', be.diferenca == null ? '' : be.fecha ? 'entrada = saída + perda' : 'diferença de ' + num(be.diferenca), '150px')]) +
        '</div><div class="laudo-linha-info"><b>Procedimento aplicado:</b></div>' + obs(e.procedimento) +
        (e.materiais.length ? tabela(['Código', 'Material', 'Consumido', 'Recuperado', 'Descartado'], e.materiais.map(function(m) {
          return [m.codigo, m.nome, num(m.consumido), num(m.recuperado), num(m.descartado)]; })) : '<div class="laudo-nota-peq">Materiais: nenhum registrado.</div>') +
        (e.observacao ? '<div class="laudo-linha-info"><b>Observação:</b> ' + esc(e.observacao) + '</div>' : '') +
        '<div class="laudo-nota-peq">Evidências: ' + e.evidencias.length + ' arquivo(s) · Preenchido por ' + esc(e.preenchidoPor || '—') + (e.preenchidoEm ? ' em ' + esc(data(e.preenchidoEm)) : '') + '</div>';
    });

    var n = 3 + ets.length;
    h += titulo(n, 'DECISÃO DA QUALIDADE') +
      '<div class="laudo-linha-info"><b>Análise:</b></div>' + obs(dec.analise) +
      '<div class="laudo-linha-info"><b>Conclusão / destino final dos lotes:</b></div>' + obs(dec.conclusao) +
      '<div class="laudo-ident">' + linha([campo('Decidido por', dec.por, '190px'), campo('Data', data(dec.em), '120px')]) + '</div>';

    var hist = Object.keys(r.historico || {}).sort().map(function(k) { return r.historico[k] || {}; });
    h += titulo(n + 1, 'HISTÓRICO DO REGISTRO') + (hist.length ? tabela(['Data', 'Responsável', 'Ação', 'Motivo', 'Campos alterados'], hist.map(function(ev) {
      return [data(ev.em), ev.por, T.ACOES[ev.acao] || ev.acao, ev.motivo || '', Object.keys(ev.mudou || {}).map(function(c) { return T.CAMPOS[c] || c; }).join(', ')];
    })) : '<div class="laudo-nota-peq">Sem eventos.</div>');

    h += '<div class="laudo-assina" style="display:flex;gap:40px;justify-content:space-between">' +
      '<div class="laudo-assina-bloco"><div class="laudo-assina-nome">' + esc(cri.nome || '') + '</div><div class="laudo-assina-rotulo">Elaborado por</div></div>' +
      '<div class="laudo-assina-bloco"><div class="laudo-assina-nome">' + esc(dec.por || '') + '</div><div class="laudo-assina-rotulo">Aprovado por (Qualidade)</div></div>' +
      '</div></div>';

    // Anexo fotográfico: fotos da RNC e evidências de cada etapa. PDF sai listado pelo nome.
    var fotos = [];
    T.lista((rnc || {}).fotos).forEach(function(f) { fotos.push({f: f, origem: 'RNC ' + (r.rncNumero || '') + ' · abertura'}); });
    T.lista((rnc || {}).fotosEncerramento).forEach(function(f) { fotos.push({f: f, origem: 'RNC ' + (r.rncNumero || '') + ' · encerramento'}); });
    ets.forEach(function(e) { e.evidencias.forEach(function(f) { fotos.push({f: f, origem: 'Etapa ' + e.n + ' · ' + (T.TIPOS_ETAPA[e.tipo] || e.tipo)}); }); });
    if (fotos.length) {
      h += '<div class="laudo-page laudo-rr">' + topo(codigo, 'Anexo fotográfico · ' + fotos.length + ' arquivo(s)') +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + fotos.map(function(x, i) {
          var f = x.f, leg = (i + 1) + '. ' + x.origem + (f.legenda ? ' — ' + f.legenda : '') + (f.enviadoPor ? ' · ' + f.enviadoPor : '') + (f.enviadoEm ? ' · ' + data(f.enviadoEm) : '');
          return '<figure style="margin:0;break-inside:avoid;page-break-inside:avoid;border:1px solid #999;padding:4px">' +
            (ehImagem(f) && f.url ? '<img src="' + esc(f.url) + '" alt="" style="width:100%;max-height:260px;object-fit:contain">'
              : '<div class="laudo-nota-peq">Arquivo: ' + esc(f.nomeOriginal || f.caminho || '') + '</div>') +
            '<figcaption class="laudo-nota-peq">' + esc(leg) + '</figcaption></figure>';
        }).join('') + '</div></div>';
    }
    return h;
  }

  /* Registros vinculados a uma RNC, mais antigos primeiro. */
  function daRnc(registros, numero) {
    return Object.keys(registros || {}).filter(function(k) { return (registros[k] || {}).rncNumero === numero; })
      .sort(function(a, b) { return String((registros[a] || {}).criadoEm || '').localeCompare(String((registros[b] || {}).criadoEm || '')); });
  }

  /* Anexos de todos os registros da RNC (string vazia quando não há). */
  function anexosDaRnc(registros, numero, rnc) {
    return daRnc(registros, numero).map(function(k) { return paginasRegistro(k, registros[k], rnc); }).join('');
  }

  return {paginasRegistro: paginasRegistro, daRnc: daRnc, anexosDaRnc: anexosDaRnc};
});
