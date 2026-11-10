/* Itens e fornecedores do formulário de RNC (qualidade.html), 10/11/2026.
   O campo "Item" era texto livre conferido só pelo código exato, e a lista
   de fornecedores lia `fornecedor.nome` -- campo que nenhum dos 425
   cadastros tem (o nome vive em nomeFantasia/razaoSocial), então a lista
   mostrava as chaves internas. Aqui: um catálogo único de produtos (SKU) e
   materiais (código), busca por código, SKU, nome, EAN ou cliente, e os
   fornecedores que o cadastro do material já liga ao item.
   Funções puras: carregam no navegador (window.RncItens) e no Node. */
(function(raiz) {
  'use strict';

  function semAcento(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function chave(s) { return semAcento(s).toUpperCase().replace(/\s+/g, ' ').trim(); }
  function inativo(v) {
    if (v === false) return true;
    return /^inativ/i.test(String(v == null ? '' : v));
  }

  function nomeFornecedor(f, key) {
    f = f || {};
    return String(f.nomeFantasia || f.razaoSocial || f.nome || key || '').trim();
  }

  // Lista ordenada por nome para o <select>; inativos ficam de fora, salvo o
  // que já estiver escolhido.
  function listaFornecedores(fornecedores, manter) {
    fornecedores = fornecedores || {};
    return Object.keys(fornecedores).filter(function(k) {
      return k === manter || !inativo((fornecedores[k] || {}).ativo);
    }).map(function(k) {
      return {key: k, nome: nomeFornecedor(fornecedores[k], k)};
    }).sort(function(a, b) { return chave(a.nome).localeCompare(chave(b.nome)); });
  }

  function catalogoItens(produtos, materiais) {
    var itens = [];
    Object.keys(produtos || {}).forEach(function(k) {
      var p = produtos[k] || {};
      itens.push({
        key: k, codigo: String(p.sku || k).trim() || k, tipo: 'produto',
        nome: String(p.descricao || p.nome || '').trim(),
        cliente: String(p.cliente || '').trim() || null, clienteKey: p.clienteKey || null,
        extras: [p.ean13, p.codCliente, p.dum14].filter(Boolean).map(String),
        inativo: inativo(p.ativo), fornecedorKeys: []
      });
    });
    Object.keys(materiais || {}).forEach(function(k) {
      var m = materiais[k] || {};
      itens.push({
        key: k, codigo: String(m.mpCodigo || k).trim() || k, tipo: 'material',
        nome: String(m.mpNome || m.nome || '').trim(),
        cliente: null, clienteKey: null,
        extras: [m.codigoBarras].concat(Object.keys(m.fornecedores || {}).map(function(f) {
          return (m.fornecedores[f] || {}).nomeComercial;
        })).filter(Boolean).map(String),
        inativo: inativo(m.ativo),
        fornecedorKeys: Object.keys(m.fornecedores || {})
      });
    });
    itens.forEach(function(i) {
      i.busca = chave([i.codigo, i.key, i.nome, i.cliente || ''].concat(i.extras).join(' '));
    });
    return itens;
  }

  // Aceita o código, a chave, ou o texto "CÓDIGO — nome" que a própria lista
  // escreve no campo. Sem diferença de maiúsculas/acentos.
  function resolverItem(catalogo, texto) {
    var t = chave(texto);
    if (!t) return null;
    var cod = t.split(' — ')[0].trim();
    var achou = null;
    (catalogo || []).some(function(i) {
      if (chave(i.codigo) === cod || chave(i.key) === cod) { achou = i; return true; }
      return false;
    });
    return achou;
  }

  // Todas as palavras precisam aparecer; código exato, depois começo do
  // código, depois o resto. Ativos antes dos inativos.
  function buscarItens(catalogo, texto, limite) {
    var t = chave(texto);
    if (!t) return [];
    var palavras = t.split(' ').filter(Boolean);
    var achados = [];
    (catalogo || []).forEach(function(i) {
      if (!palavras.every(function(p) { return i.busca.indexOf(p) !== -1; })) return;
      var c = chave(i.codigo);
      var nota = c === t ? 0 : c.indexOf(t) === 0 ? 1 : chave(i.nome).indexOf(t) === 0 ? 2 : 3;
      achados.push({i: i, nota: nota + (i.inativo ? 10 : 0)});
    });
    achados.sort(function(a, b) {
      return a.nota - b.nota || chave(a.i.codigo).localeCompare(chave(b.i.codigo));
    });
    return achados.slice(0, limite || 30).map(function(a) { return a.i; });
  }

  function rotuloItem(i) {
    if (!i) return '';
    return i.codigo + (i.nome ? ' — ' + i.nome : '');
  }

  // Fornecedores que o cadastro liga a este item (materiais), só os que
  // existem no cadastro de fornecedores.
  function fornecedoresDoItem(item, fornecedores) {
    fornecedores = fornecedores || {};
    if (!item) return [];
    return (item.fornecedorKeys || []).filter(function(k) { return fornecedores[k]; }).map(function(k) {
      return {key: k, nome: nomeFornecedor(fornecedores[k], k)};
    });
  }

  // Lotes do item para a RNC. Produto quase nunca tem lote em estoque_lotes
  // (em 10/11/2026: 46 de 408 SKUs; 268 têm OP): o lote dele é o da OP. Então
  // vêm os dois -- lotes em estoque e OPs do SKU (canceladas fora), mais
  // recentes primeiro. `chave` é o código digitado quando não há item.
  var PREFIXO_OP = 'op:';
  function lotesDoItem(item, chaveTexto, estoqueLotes, ops) {
    var k = item ? item.key : chaveTexto;
    var doItem = (k && (estoqueLotes || {})[k]) || {};
    var estoque = Object.keys(doItem).map(function(lk) {
      var l = doItem[lk] || {};
      return {key: lk, rotulo: String(l.loteOrigem || l.loteInterno || lk), status: l.status || null,
        saldo: l.saldoLote != null ? l.saldoLote : null, unidade: l.unidade || '',
        opKey: l.opKey || null, opLote: l.opLote || null, criadoEm: String(l.criadoEm || '')};
    }).sort(function(a, b) { return b.criadoEm.localeCompare(a.criadoEm); });
    var listaOps = [];
    if (k && (!item || item.tipo === 'produto')) {
      Object.keys(ops || {}).forEach(function(ok) {
        var o = (ops || {})[ok];
        if (!o || o.sku !== k || /^cancel/i.test(String(o.status || ''))) return;
        listaOps.push({key: ok, valor: PREFIXO_OP + ok, lote: String(o.lote || ok), status: o.status || null,
          produzido: o.produzido != null ? o.produzido : null, quando: String(o.dataFimReal || o.dataInicioReal || '')});
      });
      listaOps.sort(function(a, b) { return b.quando.localeCompare(a.quando) || b.key.localeCompare(a.key); });
    }
    return {estoque: estoque, ops: listaOps};
  }
  // O valor escolhido no <select>: lote de estoque (chave) ou OP ("op:<chave>").
  function lerEscolhaLote(valor) {
    valor = String(valor || '');
    if (!valor) return {loteKey: null, opKey: null};
    if (valor.indexOf(PREFIXO_OP) === 0) return {loteKey: null, opKey: valor.slice(PREFIXO_OP.length)};
    return {loteKey: valor, opKey: null};
  }

  var api = {
    nomeFornecedor: nomeFornecedor, listaFornecedores: listaFornecedores,
    catalogoItens: catalogoItens, resolverItem: resolverItem, buscarItens: buscarItens,
    rotuloItem: rotuloItem, fornecedoresDoItem: fornecedoresDoItem,
    lotesDoItem: lotesDoItem, lerEscolhaLote: lerEscolhaLote
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.RncItens = api;
})(typeof window !== 'undefined' ? window : this);
