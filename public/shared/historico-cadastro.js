/* Histórico do cadastro vivo (10/11/2026).

   Pedido da operação: o cadastro muda o tempo todo (descrição, especificação,
   fornecedores, versões) e cada mudança precisa ficar registrada com data,
   hora, quem editou e uma justificativa curta, "no geral", ao salvar.

   Vale para Materiais (historico_materiais/{key}), Produtos
   (historico_produtos/{sku}) e Fornecedores (historico_fornecedores/{key}).
   Cada salvamento grava UMA entrada por campo alterado, todas com o mesmo
   `grupo`, a mesma justificativa e o mesmo autor/horário. O formato é o que
   historico_materiais já usava (campo, valorAnterior, valorNovo, alteradoPor,
   alteradoEm), então o histórico antigo continua aparecendo. Os nós só aceitam
   inclusão (regra do banco): nada se edita nem se apaga depois.

   mudancas(antes, depois, {rotulos, ignorar}) -> [{campo, rotulo, de, para}]
   entradas(mudancas, meta) -> objetos a gravar (um por campo)
   criacao(meta) -> entrada única "Cadastro criado"
   agrupar(entradasGravadas) -> [{em, por, justificativa, acao, itens:[{rotulo, de, para}]}] (mais recente primeiro)
   fmt(valor) -> texto curto para a tela
   MIN_JUSTIFICATIVA = 10
   Funções puras; mesmo arquivo no navegador (window.HistoricoCadastro) e no Node. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HistoricoCadastro = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var MIN_JUSTIFICATIVA = 10;
  // Campos de controle: mudam sozinhos ou já têm histórico próprio.
  var IGNORAR_SEMPRE = ['ultimaAlteracao', 'historicoAlteracoes', 'chaveDuplicidade', 'atualizadoEm', 'updatedAt'];

  function vazio(v) {
    if (v === undefined || v === null || v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
  }
  // Forma canônica para comparar: vazio = null; número escrito como texto = número;
  // objeto com chaves em ordem estável.
  function canon(v) {
    if (vazio(v)) return null;
    if (typeof v === 'string') {
      var t = v.trim();
      if (t === '') return null;
      var n = Number(t.replace(',', '.'));
      return /^-?\d+([.,]\d+)?$/.test(t) && Number.isFinite(n) ? n : t;
    }
    if (Array.isArray(v)) return v.map(canon);
    if (typeof v === 'object') {
      var o = {};
      Object.keys(v).sort().forEach(function(k) { var c = canon(v[k]); if (c !== null) o[k] = c; });
      return Object.keys(o).length ? o : null;
    }
    return v;
  }
  function igual(a, b) { return JSON.stringify(canon(a)) === JSON.stringify(canon(b)); }
  function limpo(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v === undefined ? null : v)); }

  // Campo ausente no registro antigo: vale o padrão da tela. Checkbox desmarcado (false) num
  // campo que nunca existiu não é mudança, exceto onde ausente significa "sim".
  var AUSENTE_E_SIM = ['ativo', 'controlaEstoque'];
  function valorAntes(antes, k, padroes) {
    if (antes[k] !== undefined && antes[k] !== null) return antes[k];
    if (Object.prototype.hasOwnProperty.call(padroes, k)) return padroes[k];
    return AUSENTE_E_SIM.indexOf(k) !== -1 ? true : antes[k];
  }
  function mudancas(antes, depois, opts) {
    opts = opts || {};
    var rot = opts.rotulos || {};
    var padroes = opts.padroes || {};
    var ign = IGNORAR_SEMPRE.concat(opts.ignorar || []);
    antes = antes || {}; depois = depois || {};
    var campos = {};
    Object.keys(antes).concat(Object.keys(depois)).forEach(function(k) { campos[k] = true; });
    return Object.keys(campos).filter(function(k) {
      if (ign.indexOf(k) !== -1) return false;
      var a = valorAntes(antes, k, padroes);
      if ((a === undefined || a === null) && depois[k] === false) return false;
      return !igual(a, depois[k]);
    })
      .sort(function(a, b) { return String(rot[a] || a).localeCompare(String(rot[b] || b), 'pt-BR'); })
      .map(function(k) { return {campo: k, rotulo: rot[k] || k, de: limpo(antes[k]), para: limpo(depois[k])}; });
  }

  function base(meta) {
    meta = meta || {};
    var e = {alteradoPor: meta.por || 'Desconhecido', alteradoEm: meta.em || new Date().toISOString(), grupo: meta.grupo || null};
    if (meta.porUid) e.alteradoPorUid = meta.porUid;
    if (meta.em_ms !== undefined) e.em_ms = meta.em_ms;
    if (meta.justificativa) e.justificativa = String(meta.justificativa).trim();
    return e;
  }
  function entradas(lista, meta) {
    return (lista || []).map(function(m) {
      return Object.assign(base(meta), {acao: (meta && meta.acao) || 'EDICAO', campo: m.campo, rotulo: m.rotulo,
        valorAnterior: m.de === undefined ? null : m.de, valorNovo: m.para === undefined ? null : m.para});
    });
  }
  function criacao(meta) {
    return Object.assign(base(meta), {acao: 'CRIADO', campo: '_criado', rotulo: 'Cadastro criado', valorAnterior: null, valorNovo: null});
  }

  function fmt(v) {
    if (v === null || v === undefined || v === '') return '—';
    if (v === true) return 'Sim';
    if (v === false) return 'Não';
    if (typeof v === 'number') return v.toLocaleString('pt-BR', {maximumFractionDigits: 6});
    if (Array.isArray(v)) return v.length ? v.map(fmt).join(', ') : '—';
    if (typeof v === 'object') {
      var vals = Object.values(v);
      // lista de objetos (ex.: fornecedores homologados): nomes legíveis quando houver
      var nomes = vals.map(function(x) { return x && typeof x === 'object' ? (x.nome || x.razaoSocial || x.nomeFantasia || x.codigo || '') : ''; }).filter(Boolean);
      if (nomes.length === vals.length && nomes.length) return nomes.join(', ');
      return vals.length + (vals.length === 1 ? ' item' : ' itens');
    }
    return String(v);
  }

  function agrupar(gravadas) {
    var grupos = {};
    (gravadas || []).forEach(function(e) {
      if (!e) return;
      // Entradas antigas (antes de 10/11/2026) não têm grupo: junta por autor + instante.
      var g = e.grupo || ((e.alteradoPor || '') + '|' + (e.alteradoEm || ''));
      if (!grupos[g]) grupos[g] = {em: e.alteradoEm || '', por: e.alteradoPor || '', justificativa: e.justificativa || '', acao: e.acao || 'EDICAO', itens: []};
      if (e.acao === 'CRIADO') { grupos[g].acao = 'CRIADO'; return; }
      grupos[g].itens.push({rotulo: e.rotulo || e.campo, de: e.valorAnterior, para: e.valorNovo});
    });
    return Object.keys(grupos).map(function(k) { return grupos[k]; })
      .sort(function(a, b) { return String(b.em).localeCompare(String(a.em)); });
  }

  function justificativaValida(txt) { return String(txt || '').trim().length >= MIN_JUSTIFICATIVA; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; });
  }
  function dataHora(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString('pt-BR');
  }
  // Lista agrupada por salvamento, para os modais de Cadastros.
  function html(grupos) {
    if (!grupos || !grupos.length) return '<div class="hc-vazio">Nenhuma alteração registrada ainda.</div>';
    return '<ol class="hc-lista">' + grupos.map(function(g) {
      var cab = '<div class="hc-cab"><b>' + esc(dataHora(g.em)) + '</b> · ' + esc(g.por) +
        (g.acao === 'CRIADO' ? ' · <span class="hc-tag">Cadastro criado</span>' : '') + '</div>';
      var just = g.justificativa ? '<div class="hc-just">Justificativa: ' + esc(g.justificativa) + '</div>' : '';
      var itens = g.itens.length ? '<ul class="hc-itens">' + g.itens.map(function(i) {
        return '<li><span class="hc-campo">' + esc(i.rotulo) + '</span>: ' + esc(fmt(i.de)) + ' <span aria-hidden="true">→</span><span class="sr-only"> para </span> ' + esc(fmt(i.para)) + '</li>';
      }).join('') + '</ul>' : '';
      return '<li class="hc-grupo">' + cab + just + itens + '</li>';
    }).join('') + '</ol>';
  }

  return {MIN_JUSTIFICATIVA: MIN_JUSTIFICATIVA, mudancas: mudancas, entradas: entradas, criacao: criacao,
    agrupar: agrupar, fmt: fmt, igual: igual, justificativaValida: justificativaValida, html: html};
});
