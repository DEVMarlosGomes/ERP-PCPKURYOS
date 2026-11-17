/* ══════════════════════════════════════════════════════════════════════
   FICHA DE RETRABALHO (16/11/2026)

   A OP de retrabalho não tinha o que imprimir: as 5 fichas e as etiquetas
   exigem BOM, que o retrabalho não tem de propósito. Pedido: "sempre que
   finalizar o retrabalho aparecer todos os botões" e "sempre o máximo de
   informações possível".

   Uma folha A4 com tudo o que identifica o retrabalho (OP de origem,
   produto, lote, motivo, escopo, destino) e a execução. Antes do
   encerramento, os campos da execução saem em branco para o chão de
   fábrica preencher à mão; depois, saem preenchidos com o que a Qualidade
   registrou (RetrabalhoEncerramento).

   html() é puro; imprimir() abre a janela de impressão.
   ══════════════════════════════════════════════════════════════════════ */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FichaRetrabalho = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var DEST = {linha: 'Linha de produção', rotulagem: 'Estação de rotulagem', posto: 'Posto de trabalho'};
  var REPROV = {DESCARTE: 'Descarte', NOVO_RETRABALHO: 'Novo retrabalho', RETIDO: 'Retido / quarentena', DEVOLUCAO: 'Devolução', OUTRO: 'Outro'};
  var DECISAO = {LIBERADO: 'Liberado', LIBERADO_COM_RESTRICAO: 'Liberado com restrição', REPROVADO: 'Reprovado'};

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
    });
  }
  function dataHora(v) {
    var d = new Date(v);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
  }
  function data(v) {
    var s = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : esc(v || '');
  }
  function num(v) { return v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR'); }
  // Campo: valor preenchido ou espaço para escrever à mão.
  function campo(rotulo, valor, largo) {
    var vazio = valor == null || valor === '';
    return '<div class="c' + (largo ? ' largo' : '') + '"><span class="r">' + esc(rotulo) + '</span>' +
      '<span class="v' + (vazio ? ' mao' : '') + '">' + (vazio ? '&nbsp;' : valor) + '</span></div>';
  }
  function marcas(opcoes, escolhida) {
    return Object.keys(opcoes).map(function(k) {
      return '<span class="mk">' + (k === escolhida ? '☒' : '☐') + ' ' + esc(opcoes[k]) + '</span>';
    }).join(' ');
  }

  function html(op, ctx) {
    op = op || {}; ctx = ctx || {};
    var enc = op.retrabalhoEncerramento || null;
    var origem = ctx.opOrigem || {};
    var perdas = (enc && enc.perdas) || [];
    var linhasPerda = perdas.map(function(p) {
      return '<tr><td>' + esc(p.material) + '</td><td class="n">' + num(p.quantidade) + ' ' + esc(p.unidade || '') + '</td><td>' + esc(p.motivo || '') + '</td></tr>';
    });
    while (linhasPerda.length < (enc ? Math.max(1, perdas.length) : 5)) linhasPerda.push('<tr><td>&nbsp;</td><td></td><td></td></tr>');
    var status = op.status === 'Cancelado' ? 'CANCELADA' + (op.motivoCancelamento ? ' — ' + esc(op.motivoCancelamento) : '') : esc(op.status || '');
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha de retrabalho ' + esc(op.lote) + '</title><style>' +
      '@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#111;margin:0}' +
      'h1{font-size:17px;margin:0}h2{font-size:12px;text-transform:uppercase;letter-spacing:.4px;background:#eee;padding:4px 6px;margin:12px 0 6px;border-left:4px solid #0a1c69}' +
      '.topo{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0a1c69;padding-bottom:6px}' +
      '.sub{font-size:11px;color:#444}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 10px}.c{display:flex;flex-direction:column}.c.largo{grid-column:1/-1}' +
      '.r{font-size:9.5px;text-transform:uppercase;color:#555}.v{border-bottom:1px solid #999;min-height:17px;padding:1px 0}.v.mao{min-height:22px}' +
      'table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:4px;text-align:left;vertical-align:top}th{background:#f3f3f3;font-size:10px}.n{text-align:right}' +
      '.mk{margin-right:12px;white-space:nowrap}.ass{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;margin-top:26px}.ass div{border-top:1px solid #111;text-align:center;padding-top:3px;font-size:10px}' +
      '.aviso{border:1px solid #c00;color:#900;padding:5px 7px;margin-top:8px;font-size:10.5px}' +
      '</style></head><body>' +
      '<div class="topo"><div><h1>Ficha de Retrabalho — OP ' + esc(op.lote) + '</h1>' +
        '<div class="sub">Kuryos · Retrabalho de ' + esc(op.retrabalhoDe || '—') + ' · situação: ' + status + '</div></div>' +
        '<div class="sub" style="text-align:right">Impresso em ' + esc(dataHora(ctx.agora || new Date().toISOString())) + (ctx.por ? '<br>por ' + esc(ctx.por) : '') + '</div></div>' +
      '<h2>Identificação</h2><div class="g">' +
        campo('OP de retrabalho', esc(op.lote)) + campo('OP / lote de origem', esc(op.retrabalhoDe || '')) + campo('Lote do produto', esc(op.retrabalhoDe || origem.lote || '')) +
        campo('Produto', esc(op.produto || ''), true) +
        campo('SKU', esc(op.sku || '')) + campo('Cliente', esc(op.cliente || '')) + campo('Validade', op.validade ? data(op.validade) : '') +
        campo('Unidades por caixa', num(op.pecasPorCaixa || '')) + campo('EAN-13', esc(op.ean13 || '')) + campo('Produzido na OP de origem', num(origem.produzidoLinha != null ? origem.produzidoLinha : origem.produzido)) +
      '</div>' +
      '<h2>Abertura</h2><div class="g">' +
        campo('Motivo', esc(op.retrabalhoMotivo || ''), true) +
        campo('Escopo', esc(op.retrabalhoEscopo || '')) + campo('Unidades planejadas', num(op.qtdPlanejada)) + campo('Executar em', esc((DEST[op.retrabalhoDestino] || '') + (op.linha ? ' · ' + op.linha : ''))) +
        campo('Aberta por', esc(op.emitidoPor || '')) + campo('Aberta em', esc(dataHora(op.dataEmissao))) + campo('Observação', esc(op.retrabalhoObs || '')) +
      '</div>' +
      '<h2>Execução</h2><div class="g">' +
        campo('Início', enc ? esc(dataHora(enc.dataInicio)) : '') + campo('Fim', enc ? esc(dataHora(enc.dataFim)) : '') + campo('Duração', enc && enc.duracaoMin != null ? esc(Math.floor(enc.duracaoMin / 60) + 'h' + String(enc.duracaoMin % 60).padStart(2, '0')) : '') +
        campo('Recurso (linha / posto)', enc ? esc(enc.recurso || '') : '') + campo('Executores', enc ? esc(enc.executores || '') : '', false) + campo('RNC vinculada', enc ? esc(enc.rncVinculada || '') : '') +
        campo('Unidades retrabalhadas', enc ? num(enc.qtdRetrabalhada) : '') + campo('Aprovadas', enc ? num(enc.qtdAprovada) : '') + campo('Reprovadas', enc ? num(enc.qtdReprovada) : '') +
        campo('Destino das reprovadas', enc ? esc((REPROV[enc.destinoReprovadas] || '—') + (enc.destinoReprovadasObs ? ' — ' + enc.destinoReprovadasObs : '')) : marcas(REPROV, null), true) +
      '</div>' +
      '<h2>Perdas de material no retrabalho</h2><table><thead><tr><th>Material</th><th class="n">Quantidade</th><th>Motivo</th></tr></thead><tbody>' + linhasPerda.join('') + '</tbody></table>' +
      '<h2>Inspeção e decisão da Qualidade</h2><div class="g">' +
        campo('Inspeção realizada', enc ? esc(enc.inspecao || '') : '', true) + campo('Amostragem', enc ? esc(enc.amostragem || '') : '', true) +
        campo('Decisão', enc ? esc(DECISAO[enc.decisao] || enc.decisao) : marcas(DECISAO, null), true) +
        (enc && enc.restricao ? campo('Restrição', esc(enc.restricao), true) : '') +
        campo('Análise', enc ? esc(enc.analise || '') : '', true) +
        campo('Registro de retrabalho', enc ? esc(enc.registroRetrabalho || '') : '') + campo('Encerrado por', enc ? esc(enc.encerradoPor || '') : '') + campo('Encerrado em', enc ? esc(dataHora(enc.encerradoEm)) : '') +
        (enc && enc.observacoes ? campo('Observações', esc(enc.observacoes), true) : '') +
      '</div>' +
      '<div class="aviso">A OP de retrabalho não credita pedido, não baixa BOM e não gera palete novo: as unidades já foram contadas na OP ' + esc(op.retrabalhoDe || 'de origem') + '. Consumo real de material entra como perda acima.</div>' +
      '<div class="ass"><div>Produção / executor</div><div>Qualidade</div><div>PCP</div></div>' +
      '</body></html>';
  }

  function imprimir(op, ctx) {
    var w = window.open('', '_blank');
    if (!w) { alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.'); return null; }
    w.document.open();
    w.document.write(html(op, ctx));
    w.document.close();
    w.focus();
    setTimeout(function() { try { w.print(); } catch (e) { /* o usuário imprime pelo menu */ } }, 300);
    return w;
  }

  return {html: html, imprimir: imprimir};
});
