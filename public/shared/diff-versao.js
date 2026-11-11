/* O que mudou entre duas versões de Fórmula / BOM / Especificação (10/11/2026).

   Pedido: "manter todo histórico, mostrar o que foi editado no histórico com
   data, hora, quem editou e justificativa curta ao finalizar a edição".
   Alterações são frequentes e pontuais: às vezes só a quantidade, às vezes a
   matéria-prima.

   Os itens de uma versão criada "a partir desta" são copiados com as MESMAS
   chaves, então o item é casado pela chave: mesma chave com código diferente é
   TROCA de material (não remoção + inclusão). Item com chave nova = INCLUIDO;
   chave que sumiu = REMOVIDO.

   diffComponente(tipo, antes, depois) -> [{tipo, item, campos:[{campo, de, para}]}]
     antes/depois: {itens, itemAjusteKey?} (o registro inteiro serve).
   diffVersao({formulas, bom, especificacoes} antes, idem depois) -> {formulas:[...], bom:[...], especificacoes:[...]}
   textoMudanca(tipoComponente, mudanca) -> frase curta em português.
   resumoContagem(diff) -> "Fórmula: 2 alterações · BOM: 1" (ou '' se nada mudou).
   Funções puras; mesmo arquivo no navegador (window.DiffVersao) e no Node. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DiffVersao = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var COMPONENTES = {
    formulas: {
      nome: 'Fórmula',
      codigo: 'mpCodigo', descricao: 'mpNome',
      campos: [['percentualMM', '% m/m'], ['fase', 'fase'], ['ordemAdicao', 'ordem']]
    },
    bom: {
      nome: 'BOM',
      codigo: 'materialCodigo', descricao: 'materialNome',
      campos: [['qtdPorPeca', 'qtd. por peça']]
    },
    especificacoes: {
      nome: 'Especificação',
      codigo: 'ensaio', descricao: null,
      campos: [['especificacaoTexto', 'especificação'], ['minimo', 'mínimo'], ['maximo', 'máximo'], ['metodo', 'método'], ['critico', 'crítico']]
    }
  };

  function vazio(v) { return v === undefined || v === null || v === ''; }
  function norm(v) {
    if (vazio(v)) return null;
    if (typeof v === 'boolean') return v;
    var n = Number(v);
    if (typeof v !== 'object' && String(v).trim() !== '' && Number.isFinite(n)) return n;
    return String(v).trim();
  }
  function iguais(a, b) { return norm(a) === norm(b); }

  function rotuloItem(cfg, it) {
    it = it || {};
    var cod = it[cfg.codigo] || '';
    var desc = cfg.descricao ? (it[cfg.descricao] || '') : '';
    return cod && desc ? cod + ' — ' + desc : (cod || desc || '(sem código)');
  }

  function diffComponente(tipo, antes, depois) {
    var cfg = COMPONENTES[tipo];
    if (!cfg) throw new Error('Componente desconhecido: ' + tipo);
    var a = (antes && antes.itens) || {};
    var d = (depois && depois.itens) || {};
    var out = [];
    Object.keys(d).forEach(function(k) {
      var itA = a[k], itD = d[k] || {};
      if (!itA) { out.push({tipo: 'INCLUIDO', chave: k, item: rotuloItem(cfg, itD), campos: []}); return; }
      var campos = [];
      var trocou = !iguais(itA[cfg.codigo], itD[cfg.codigo]);
      if (trocou) campos.push({campo: 'material', de: rotuloItem(cfg, itA), para: rotuloItem(cfg, itD)});
      cfg.campos.forEach(function(c) {
        if (!iguais(itA[c[0]], itD[c[0]])) campos.push({campo: c[1], de: norm(itA[c[0]]), para: norm(itD[c[0]])});
      });
      if (campos.length) out.push({tipo: trocou ? 'TROCA' : 'ALTERADO', chave: k, item: rotuloItem(cfg, trocou ? itA : itD), campos: campos});
    });
    Object.keys(a).forEach(function(k) {
      if (!d[k]) out.push({tipo: 'REMOVIDO', chave: k, item: rotuloItem(cfg, a[k]), campos: []});
    });
    if (tipo === 'formulas') {
      var qa = (antes && antes.itemAjusteKey) || null, qd = (depois && depois.itemAjusteKey) || null;
      if (qa !== qd) {
        out.push({tipo: 'QSP', chave: qd || qa, item: 'Ajuste (QSP)', campos: [{campo: 'QSP',
          de: qa && a[qa] ? rotuloItem(cfg, a[qa]) : null, para: qd && d[qd] ? rotuloItem(cfg, d[qd]) : null}]});
      }
    }
    return out;
  }

  function diffVersao(antes, depois) {
    antes = antes || {}; depois = depois || {};
    var r = {};
    Object.keys(COMPONENTES).forEach(function(t) { r[t] = diffComponente(t, antes[t], depois[t]); });
    return r;
  }

  function fmt(v) {
    if (v === null || v === undefined || v === '') return '(vazio)';
    if (v === true) return 'sim';
    if (v === false) return 'não';
    if (typeof v === 'number') return v.toLocaleString('pt-BR', {maximumFractionDigits: 4});
    return String(v);
  }
  function textoMudanca(tipoComponente, m) {
    var campos = (m.campos || []).filter(function(c) { return c.campo !== 'material'; })
      .map(function(c) { return c.campo + ' ' + fmt(c.de) + ' → ' + fmt(c.para); }).join('; ');
    switch (m.tipo) {
      case 'INCLUIDO': return 'Incluído: ' + m.item;
      case 'REMOVIDO': return 'Removido: ' + m.item;
      case 'TROCA': {
        var mat = (m.campos || []).find(function(c) { return c.campo === 'material'; }) || {};
        return 'Trocado: ' + fmt(mat.de) + ' por ' + fmt(mat.para) + (campos ? ' (' + campos + ')' : '');
      }
      case 'QSP': return 'Ajuste (QSP): ' + fmt(m.campos[0].de) + ' → ' + fmt(m.campos[0].para);
      default: return m.item + ': ' + campos;
    }
  }

  function total(diff) {
    return Object.keys(diff || {}).reduce(function(s, t) { return s + ((diff[t] || []).length); }, 0);
  }
  function resumoContagem(diff) {
    return Object.keys(COMPONENTES).filter(function(t) { return (diff[t] || []).length; })
      .map(function(t) { var n = diff[t].length; return COMPONENTES[t].nome + ': ' + n + (n === 1 ? ' alteração' : ' alterações'); })
      .join(' · ');
  }

  return {COMPONENTES: COMPONENTES, diffComponente: diffComponente, diffVersao: diffVersao, textoMudanca: textoMudanca, total: total, resumoContagem: resumoContagem};
});
