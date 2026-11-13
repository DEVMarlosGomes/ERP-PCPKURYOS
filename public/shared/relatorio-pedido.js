/* Relatório de Pedido (2026-09-25).
   Pedido do usuário: "relatório de pedido, onde mostra a produção total,
   lotes, expedidos, perdas de cada um dos itens".

   Funções PURAS. Não refaz conta nenhuma que já exista:
   - produzido / expedido / em estoque, por item e por OP, vêm da
     ConciliacaoPedidos.calcular (a mesma conta da tela de Pedidos -- os dois
     lugares nunca discordam);
   - perdas seguem a regra do Histórico de Apontamentos (perdasDoLote):
     perdas/{lote} lançadas no apontamento têm prioridade; ops/{op}.perdas
     (importado do Excel antigo) só entra quando o lote não tem lançamento.

   Perdas aqui são de COMPONENTES (frasco, rótulo, cartucho...), na unidade de
   cada um -- é o que o apontamento registra, item a item. Desde 12/11/2026 o %
   é de CADA componente sobre a base dele na OP: o separado para a OP
   (ops/{op}/separacaoConcluida/itens) ou, sem separação do material, o empenho
   (ops/{op}/materiaisConsumo). Antes somava frasco + rótulo + válvula e dividia
   pelo produzido -- o PED-0007 mostrava 99,8% num lote com 21,6% de frasco e
   23,9% de rótulo. Sem base conhecida, mostra a quantidade e nenhum %.

   Um pedido = todos os pedidos/{id__sku} com o mesmo parentPedidoId (ou id),
   comparado EXATO: na base, "05" (Febella) e "0005" (Safira) são pedidos
   diferentes. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./expedicao.js'));
  else root.RelatorioPedido = factory(root.ExpedicaoPA);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ExpedicaoPA) {
  'use strict';

  function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function arred(v) { return Math.round(n(v) * 1000) / 1000; }
  function chaveLote(lote) { // = sanitizeKey de shared/utils.js (chave de perdas/)
    if (!lote) return '';
    return String(lote).trim().replace(/[./[\]#$]/g, '-').replace(/\s+/g, '_').slice(0, 60);
  }
  function idDoPedido(p, k) { return String((p && (p.parentPedidoId || p.id)) || String(k || '').split('__')[0]); }
  // Tipo de perda -> palavras do nome do material na OP. Serve para ligar o
  // apontamento antigo (sem materialCodigo) ao componente: só liga quando a OP
  // tem UM candidato daquele tipo -- com dois frascos, não escolhe.
  var TIPOS = [
    ['Frascos', /FRASCO|BISNAGA|POTE\b|TUBO\b/],
    ['Rótulos', /ROTULO|ETIQUETA/],
    ['Tampas/Válvulas', /TAMPA|VALVULA|BOMBA|GATILHO|PUMP/],
    ['Cartuchos', /CARTUCHO/],
    ['Display', /DISPLAY/],
    ['Caixa de Embarque', /CAIXA/]
  ];
  // Chaves do Excel antigo (ops/{op}.perdas) -> tipo.
  var LEGADO = { cartuchos: 'Cartuchos', frascosEnvase: 'Frascos', frascosRotulagem: 'Frascos',
    rotulosEnvase: 'Rótulos', rotulosRotulagem: 'Rótulos' };
  // Perda do PRODUTO (unidades envasadas descartadas, bulk em kg): outras
  // unidades, não componentes -- ficam numa lista própria, sem %.
  var TIPOS_PRODUTO = { 'Produto envasado (un)': 1, 'Bulk (kg)': 1 };

  function maiusc(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
  function tipoDoTexto(texto) {
    var t = maiusc(texto);
    if (!t) return null;
    for (var i = 0; i < TIPOS.length; i++) {
      if (maiusc(TIPOS[i][0]) === t || TIPOS[i][1].test(t)) return TIPOS[i][0];
    }
    return null;
  }
  function rotuloTipo(t) {
    var s = String(t || 'Outro');
    if (LEGADO[s]) return LEGADO[s];
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function pct2(parte, todo) { return todo > 0 ? Math.round((parte / todo) * 10000) / 100 : null; }
  // Ordem de leitura: pelo tipo (frasco, rótulo, tampa...), o componente
  // identificado antes do que só tem o tipo, depois o código.
  function ordemTipo(t) { for (var i = 0; i < TIPOS.length; i++) if (TIPOS[i][0] === t) return i; return TIPOS.length; }
  function ordemComponente(a, b) {
    return ordemTipo(a.tipo) - ordemTipo(b.tipo) || (a.codigo ? 0 : 1) - (b.codigo ? 0 : 1) || String(a.chave).localeCompare(String(b.chave));
  }

  // Base de cada material da OP: o separado quando a separação registrou o
  // material, senão o empenho (materiaisConsumo).
  function basesDaOp(op) {
    var bases = {}, sep = (op && op.separacaoConcluida && op.separacaoConcluida.itens) || {};
    Object.keys((op && op.materiaisConsumo) || {}).forEach(function (k) {
      var m = op.materiaisConsumo[k] || {};
      if (!m.mpCodigo) return;
      var b = bases[m.mpCodigo] || (bases[m.mpCodigo] = { codigo: m.mpCodigo, nome: m.mpNome || '', unidade: m.unidade || '', empenho: 0 });
      b.empenho = arred(b.empenho + n(m.quantidade));
    });
    Object.keys(bases).forEach(function (c) {
      var b = bases[c], separado = n(sep[c]);
      b.base = separado > 0 ? arred(separado) : b.empenho;
      b.origem = separado > 0 ? 'SEPARADO' : 'EMPENHO';
    });
    return bases;
  }

  // OP reemitida ("26204/04-v2"): o apontador lança no número de lote que está
  // no papel ("26204/04"). Se esse lote não é de outra OP (`lotesComOp`), a
  // perda lançada nele é desta. Mesma regra do Histórico (perdasDoLote).
  function entradasDoLote(perdas, op, lotesComOp) {
    var chave = chaveLote(op && op.lote);
    var entradas = (perdas || {})[chave];
    var semSufixo = chave.replace(/-v\d+$/, '');
    if (!entradas && semSufixo !== chave && lotesComOp && !lotesComOp[semSufixo]) entradas = (perdas || {})[semSufixo];
    return entradas || null;
  }

  // Perdas de um lote, componente a componente, já com a base da OP.
  // Lançamento do apontamento tem prioridade; ops/{op}.perdas (Excel antigo)
  // só entra quando o lote não tem lançamento.
  function perdasDoLote(perdas, op, lotesComOp) {
    var bases = basesDaOp(op), porChave = {}, produto = {}, porTipo = {};
    Object.keys(bases).forEach(function (c) {
      var tipo = tipoDoTexto(bases[c].nome);
      if (tipo) (porTipo[tipo] = porTipo[tipo] || []).push(c);
    });
    function somar(tipo, codigo, nomeApontado, unidade, qtd) {
      if (!n(qtd)) return;
      if (!codigo && tipo && porTipo[tipo] && porTipo[tipo].length === 1) codigo = porTipo[tipo][0];
      var chave = codigo || 'TIPO:' + (tipo || 'Outro');
      var b = codigo ? bases[codigo] : null;
      var c = porChave[chave] || (porChave[chave] = { chave: chave, codigo: codigo || '', tipo: tipo || 'Outro',
        nome: (b && b.nome) || nomeApontado || '', unidade: (b && b.unidade) || unidade || '', perdido: 0,
        base: b ? b.base : null, baseOrigem: b ? b.origem : null });
      c.perdido = arred(c.perdido + n(qtd));
    }
    var entradas = entradasDoLote(perdas, op, lotesComOp);
    if (entradas) {
      Object.keys(entradas).forEach(function (k) {
        var e = entradas[k] || {};
        (Array.isArray(e.perdas) ? e.perdas : Object.values(e.perdas || {})).forEach(function (p) {
          if (!p) return;
          if (p.produto || TIPOS_PRODUTO[p.tipo]) { produto[p.tipo] = arred((produto[p.tipo] || 0) + n(p.quantidade)); return; }
          var tipo = p.tipo === 'Outro'
            ? (tipoDoTexto(p.especificacao) || p.especificacao || 'Outro')
            : (tipoDoTexto(p.tipo) || rotuloTipo(p.tipo));
          var nome = p.materialNome || (p.tipo === 'Outro' ? '' : p.especificacao) || '';
          somar(tipo, p.materialCodigo || '', nome, p.unidade, p.quantidade);
        });
      });
    } else if (op && op.perdas && typeof op.perdas === 'object') {
      Object.keys(op.perdas).forEach(function (t) { somar(rotuloTipo(t), '', '', '', op.perdas[t]); });
    }
    var componentes = Object.keys(porChave).map(function (k) {
      var c = porChave[k];
      c.pct = c.base > 0 ? pct2(c.perdido, c.base) : null;
      c.baseIncompleta = false;
      return c;
    }).sort(ordemComponente);
    return { componentes: componentes, produto: produto, bases: bases };
  }

  // Soma componentes de vários lotes. A base de um material soma TODOS os
  // lotes que o têm na OP, inclusive os sem perda -- senão o % sobe. Perda num
  // lote sem base para o material deixa o % do grupo indefinido
  // (baseIncompleta): dividir pela base dos outros lotes inflaria o número.
  function agregar(lotes) {
    var porChave = {}, produto = {};
    lotes.forEach(function (l) {
      somaTipos(produto, l.perdasProduto);
      l.componentes.forEach(function (c) {
        var a = porChave[c.chave] || (porChave[c.chave] = { chave: c.chave, codigo: c.codigo, tipo: c.tipo, nome: c.nome,
          unidade: c.unidade, perdido: 0, base: null, origens: {}, baseIncompleta: false });
        a.perdido = arred(a.perdido + c.perdido);
        if (!a.nome && c.nome) a.nome = c.nome;
        if (c.codigo && c.base == null) a.baseIncompleta = true;
      });
    });
    Object.keys(porChave).forEach(function (k) {
      var a = porChave[k];
      if (a.codigo) {
        lotes.forEach(function (l) {
          var b = l.bases[a.codigo];
          if (!b || !(b.base > 0)) return;
          a.base = arred((a.base || 0) + b.base);
          a.origens[b.origem] = 1;
          if (!a.unidade) a.unidade = b.unidade;
        });
      }
      var origens = Object.keys(a.origens);
      a.baseOrigem = origens.length > 1 ? 'MISTA' : (origens[0] || null);
      delete a.origens;
      a.pct = a.base > 0 && !a.baseIncompleta ? pct2(a.perdido, a.base) : null;
    });
    return { componentes: Object.keys(porChave).map(function (k) { return porChave[k]; }).sort(ordemComponente), produto: produto };
  }
  function somaTipos(destino, origem) {
    Object.keys(origem || {}).forEach(function (t) { destino[t] = arred((destino[t] || 0) + origem[t]); });
    return destino;
  }
  function pct(parte, todo) { return todo > 0 ? Math.round((parte / todo) * 1000) / 10 : null; }

  // Lista para escolher o pedido: um registro por número, mais recente em cima.
  function listarPedidos(pedidos, comerciais) {
    var grupos = {};
    Object.keys(pedidos || {}).forEach(function (k) {
      var p = pedidos[k] || {};
      var id = idDoPedido(p, k);
      var g = grupos[id] || (grupos[id] = { id: id, cliente: '', data: '', itens: 0, qtdPedido: 0, produzido: 0, abertos: 0 });
      g.itens++;
      g.qtdPedido = arred(g.qtdPedido + n(p.qtdTotal));
      g.produzido = arred(g.produzido + n(p.produzido));
      if (p.status !== 'Concluído' && p.statusManual !== 'encerrado') g.abertos++;
      if (!g.cliente && p.cliente) g.cliente = p.cliente;
    });
    return Object.keys(grupos).map(function (id) {
      var g = grupos[id], c = (comerciais || {})[id] || {};
      g.cliente = c.cliente || g.cliente;
      g.data = c.dataPedido || (c.criadoEm ? String(c.criadoEm).slice(0, 10) : '');
      g.numeroCliente = c.numeroPedidoCliente || '';
      return g;
    }).sort(function (a, b) {
      if (a.data !== b.data) return a.data < b.data ? 1 : -1; // sem data vai pro fim
      return a.id < b.id ? 1 : (a.id > b.id ? -1 : 0);
    });
  }

  // base: {pedidos, ops, perdas, pedidos_comerciais}; conc: saída de
  // ConciliacaoPedidos.calcular sobre a mesma base.
  function montar(pedidoId, base, conc) {
    base = base || {};
    var pedidos = base.pedidos || {}, ops = base.ops || {}, perdas = base.perdas || {};
    var porPedido = (conc && conc.porPedido) || {};
    var resolver = function (k) { return ExpedicaoPA.resolverChavePedido(pedidos, k); };
    var id = String(pedidoId);
    var chaves = Object.keys(pedidos).filter(function (k) { return idDoPedido(pedidos[k], k) === id; })
      .sort(function (a, b) { return String(pedidos[a].sku || a).localeCompare(String(pedidos[b].sku || b)); });
    if (!chaves.length) return null;

    // OPs de cada item: pela chave do item (mesma resolução da conciliação).
    var opsPorItem = {}, lotesComOp = {};
    Object.keys(ops).forEach(function (opKey) {
      var op = ops[opKey] || {};
      lotesComOp[chaveLote(op.lote)] = true;
      if (op.status === 'Cancelado') return;
      var k = resolver(op.skuPedidoKey || '');
      if (chaves.indexOf(k) < 0) return;
      (opsPorItem[k] = opsPorItem[k] || []).push(opKey);
    });

    var tot = { qtdPedido: 0, produzido: 0, aProduzir: 0, expedido: 0, estoque: 0, lotes: 0, motivos: {} };
    var todosLotes = [];
    var itens = chaves.map(function (k) {
      var p = pedidos[k] || {};
      var r = porPedido[k] || null;
      var produzido = arred(r ? r.produzido : p.produzido);
      var lista = (opsPorItem[k] || []).slice();
      // OP que só aparece na conciliação (saída ou palete apontando para ela).
      Object.keys((r && r.porOp) || {}).forEach(function (o) { if (o !== 'SEM_OP' && ops[o] && lista.indexOf(o) < 0) lista.push(o); });

      var lotes = lista.map(function (opKey) {
        var op = ops[opKey] || {};
        var c = (r && r.porOp && r.porOp[opKey]) || null;
        var pl = perdasDoLote(perdas, op, lotesComOp);
        var prod = arred(op.produzido);
        return {
          opKey: opKey, lote: op.lote || opKey, status: op.status || '', linha: op.abertaLinha || op.linha || '',
          retrabalho: op.tipoOrdem === 'RETRABALHO',
          inicio: op.dataInicioReal || op.abertaDesde || '', fim: op.dataFimReal || '',
          planejado: arred(op.qtdPlanejada), produzido: prod,
          expedido: c ? c.expedido.total : 0, motivos: c ? c.expedido.motivos : {},
          estoque: c ? c.estoque.total : 0,
          componentes: pl.componentes, perdasProduto: pl.produto, bases: pl.bases
        };
      }).sort(function (a, b) { return String(a.lote).localeCompare(String(b.lote)); });

      var perdasItem = agregar(lotes);
      todosLotes = todosLotes.concat(lotes);
      var semOp = r && r.porOp && r.porOp.SEM_OP;
      var somaOps = lotes.reduce(function (s, l) { return s + l.produzido; }, 0);
      var qtdPedido = arred(p.qtdTotal);
      var item = {
        key: k, sku: p.sku || '', produto: p.produto || p.sku || k, status: p.status || '',
        encerrado: p.statusManual === 'encerrado',
        qtdPedido: qtdPedido, produzido: produzido,
        atendidoPct: pct(produzido, qtdPedido),
        aProduzir: p.statusManual === 'encerrado' ? 0 : arred(Math.max(0, qtdPedido - produzido)),
        expedido: r ? r.expedido.total : 0, motivos: r ? r.expedido.motivos : {},
        estoque: r ? r.estoque.total : 0,
        situacao: r ? r.situacao : 'SEM_PRODUCAO', diferenca: r ? r.diferenca : 0,
        devolvido: r && r.devolvido ? r.devolvido.total : 0,
        componentes: perdasItem.componentes, perdasProduto: perdasItem.produto,
        lotes: lotes,
        // Produção do item que nenhuma OP explica (apontamento antigo, OP de
        // outro pedido) e saídas/paletes sem OP: aparecem numa linha própria.
        semOp: {
          produzido: arred(produzido - somaOps),
          expedido: semOp ? semOp.expedido.total : 0,
          estoque: semOp ? semOp.estoque.total : 0
        }
      };
      tot.qtdPedido += item.qtdPedido; tot.produzido += item.produzido; tot.aProduzir += item.aProduzir;
      tot.expedido += item.expedido; tot.estoque += item.estoque; tot.lotes += lotes.length;
      Object.keys(item.motivos).forEach(function (m) { tot.motivos[m] = arred((tot.motivos[m] || 0) + item.motivos[m]); });
      return item;
    });
    ['qtdPedido', 'produzido', 'aProduzir', 'expedido', 'estoque'].forEach(function (c) { tot[c] = arred(tot[c]); });
    var perdasPedido = agregar(todosLotes);
    tot.componentes = perdasPedido.componentes;
    tot.perdasProduto = perdasPedido.produto;
    tot.atendidoPct = pct(tot.produzido, tot.qtdPedido);

    var c = (base.pedidos_comerciais || {})[id] || {};
    return {
      pedidoId: id, cliente: c.cliente || (pedidos[chaves[0]] || {}).cliente || '',
      dataPedido: c.dataPedido || '', numeroCliente: c.numeroPedidoCliente || '',
      previsaoEntrega: c.previsaoComercialEntrega || '', statusComercial: c.status || '',
      itens: itens, totais: tot
    };
  }

  var ORIGEM = { SEPARADO: 'Separado', EMPENHO: 'Empenho', MISTA: 'Separado + empenho' };
  function rotuloComponente(c) { return c.tipo + (c.nome ? ' — ' + c.nome : ''); }

  // CSV (separador ;, padrão do Excel em pt-BR): uma linha por lote e
  // componente perdido, com as colunas do item e do lote repetidas -- abre
  // pronto para filtrar/dinâmica. Lote sem perda sai numa linha com o
  // componente em branco; perda de produto sai como componente sem base.
  function csv(rel) {
    if (!rel) return '';
    var num = function (v) { return v == null || v === '' ? '' : String(arred(v)).replace('.', ','); };
    var esc = function (v) { var s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var cab = ['Pedido', 'Cliente', 'SKU', 'Produto', 'Qtd pedido', 'Produzido item', 'A produzir', 'Expedido item', 'Em estoque item',
      'Lote', 'Status OP', 'Linha', 'Planejado', 'Produzido lote', 'Expedido lote', 'Em estoque lote',
      'Componente', 'Código', 'Perdido', 'Base', 'Origem da base', '% perda'];
    var linhas = [cab.map(esc).join(';')];
    rel.itens.forEach(function (it) {
      var base = [rel.pedidoId, rel.cliente, it.sku, it.produto, num(it.qtdPedido), num(it.produzido), num(it.aProduzir), num(it.expedido), num(it.estoque)];
      var ls = it.lotes.length ? it.lotes : [null];
      ls.forEach(function (l) {
        var dl = l ? [l.lote, l.status, l.linha, num(l.planejado), num(l.produzido), num(l.expedido), num(l.estoque)] : ['', '', '', '', '', '', ''];
        var comps = l ? l.componentes.map(function (c) {
          return [rotuloComponente(c), c.codigo, num(c.perdido), num(c.base), c.baseOrigem ? ORIGEM[c.baseOrigem] : '', num(c.pct)];
        }) : [];
        Object.keys((l && l.perdasProduto) || {}).sort().forEach(function (t) { comps.push([t, '', num(l.perdasProduto[t]), '', '', '']); });
        if (!comps.length) comps.push(['', '', '', '', '', '']);
        comps.forEach(function (c) { linhas.push(base.concat(dl, c).map(esc).join(';')); });
      });
    });
    return linhas.join('\r\n');
  }

  return { listarPedidos: listarPedidos, montar: montar, perdasDoLote: perdasDoLote, rotuloComponente: rotuloComponente, ORIGEM_BASE: ORIGEM, csv: csv };
});
