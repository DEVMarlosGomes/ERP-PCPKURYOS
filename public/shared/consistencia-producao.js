/* Consistência produção × estoque × expedição -> RNC automática (13/11/2026).

   Pedido do usuário depois do caso Rose Absolut / Sunrise (PED-0001,
   Bioflora): "quando dá divergência de contagem da logística vs apontamento
   pela produção, abre uma RNC automática que tem que ser investigada e
   solucionada" -- e alerta vermelho para ADM, PCP e Expedição.

   Três situações viram RNC. As regras foram CALIBRADAS contra a base real
   (132 OPs concluídas desde 10/09) antes de valer, porque RNC que dispara
   por rotina vira ruído e deixa de ser lida:

   1. CONTAGEM (RNC-PA-{op}) -- a Conferência de PA conta diferente do
      apontamento. Já existia (functions/conferencia_pa.js); aqui só entra no
      alerta.
   2. SUPERPRODUCAO (RNC-SP-{op}) -- OP confirmada com apontado acima de 150%
      do planejado. Caso real: 26302/01, 690 planejadas, 3.470 apontadas,
      porque o granel do Sunrise foi envasado como Rose Absolut. Acima de
      110% dispararia em 22% das OPs (excedente de granel é rotina); acima de
      150%, em 2 OPs em dois meses. O aviso amarelo de 110% continua na tela.
   3. SALDO_DESCASADO (RNC-CS-{op}) -- OP JÁ CONFERIDA cuja conta "apontado =
      expedido + estoque + divergência apontada" não fecha. Caso real:
      26282/03, conferida com 1.792 em 16/10; o apontamento subiu para 4.308
      depois e 2.516 un. nunca entraram no estoque.

   O que NÃO vira RNC: OP confirmada e ainda não conferida. Isso é fila de
   trabalho, não não-conformidade -- 90 das 132 OPs levaram mais de 24 h até
   a conferência. A conciliação mostra "Aguardando conferência".

   Chave da RNC derivada da OP: abrir é idempotente (transação que só cria),
   uma RNC já tratada nunca volta para ABERTA. Corte prospectivo para a
   superprodução: OP confirmada antes da regra não vira RNC retroativa. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ConsistenciaProducao = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var LIMITE_SUPERPRODUCAO = 1.5;
  // Dia da regra. Medido: nenhuma OP confirmada neste dia passa de 150%.
  var CORTE_SUPERPRODUCAO = '2026-11-13';
  var PREFIXO = {SUPERPRODUCAO: 'RNC-SP-', SALDO_DESCASADO: 'RNC-CS-'};
  var TITULO = {
    SUPERPRODUCAO: 'Produção muito acima do planejado',
    SALDO_DESCASADO: 'Apontamento não bate com estoque + expedição',
    CONTAGEM: 'Contagem da Logística diferente do apontamento'
  };

  function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function fmt(v) { return (Math.round(n(v) * 1000) / 1000).toLocaleString('pt-BR'); }
  function chaveOp(opKey) { return String(opKey || '').replace(/[.#$\[\]\/]/g, '-').toUpperCase(); }
  function chaveRnc(tipo, opKey) { return PREFIXO[tipo] + chaveOp(opKey); }
  function rotuloOp(opKey, op) { return 'OP ' + ((op && op.lote) || opKey) + (op && op.produto ? ' (' + op.produto + ')' : ''); }

  function base(tipo, opKey, op, qtd, descricao) {
    return {tipo: tipo, chave: chaveRnc(tipo, opKey), opKey: opKey, op: op || {}, qtd: Math.abs(n(qtd)), descricao: descricao};
  }

  /* Regras que dependem só da OP. `opcoes.confirmandoEm`: a confirmação
     avalia antes de gravar -- trata a OP como Concluída nessa data. */
  function avaliarOp(opKey, op, conf, conciliacaoOp, opcoes) {
    opcoes = opcoes || {};
    var out = [];
    if (!op || op.tipoOrdem === 'RETRABALHO' || op.status === 'Cancelado') return out;
    var concluida = opcoes.confirmandoEm ? true : op.status === 'Concluído';
    // OP concluída pelo seletor manual de status não grava confirmadoEm.
    var confirmadoEm = opcoes.confirmandoEm || op.confirmadoEm || op.dataFimReal || '';
    var plan = n(op.qtdPlanejada), prod = n(op.produzido);
    if (concluida && plan > 0 && prod > plan * LIMITE_SUPERPRODUCAO && String(confirmadoEm) >= CORTE_SUPERPRODUCAO) {
      out.push(base('SUPERPRODUCAO', opKey, op, prod - plan,
        rotuloOp(opKey, op) + ': apontado ' + fmt(prod) + ' un. para ' + fmt(plan) + ' planejadas (' +
        Math.round(prod / plan * 100) + '%). Acima de ' + Math.round(LIMITE_SUPERPRODUCAO * 100) +
        '% do planejado costuma ser granel de outra OP/SKU envasado aqui ou apontamento lançado em dobro. ' +
        'Confirme fisicamente o SKU e a quantidade antes da expedição; corrija o apontamento se for o caso.'));
    }
    if (conf && conf.finalizadoEm && conciliacaoOp && conciliacaoOp.situacao === 'DIVERGENTE') {
      var c = conciliacaoOp;
      out.push(base('SALDO_DESCASADO', opKey, op, c.diferenca,
        rotuloOp(opKey, op) + ': apontado ' + fmt(c.produzido) + ' un.' +
        (c.divergenciaApontada && c.divergenciaApontada.total ? ' (divergência apontada na conferência: ' + fmt(c.divergenciaApontada.total) + ')' : '') +
        ', mas expedido ' + fmt(c.expedido.total) + ' + em estoque ' + fmt(c.estoque.total) + ' = ' + fmt(c.contabilizado) +
        '. Conferência de PA: ' + fmt(conf.qtdPaletizada != null ? conf.qtdPaletizada : conf.qtdApontada) + ' un. ' +
        (c.diferenca < 0 ? 'Faltam ' + fmt(-c.diferenca) + ' un. sem destino registrado' : 'Sobram ' + fmt(c.diferenca) + ' un. sem produção que as explique') +
        ' -- apontamento alterado depois da conferência ou movimento sem registro.'));
    }
    return out;
  }

  /* Varre todas as OPs. `conciliacao` = ConciliacaoPedidos.calcular(base). */
  function avaliar(dados, conciliacao, opcoes) {
    dados = dados || {};
    var ops = dados.ops || {}, confs = dados.conferencias_pa || {}, porOp = {};
    Object.keys((conciliacao && conciliacao.porPedido) || {}).forEach(function(pk) {
      var bo = conciliacao.porPedido[pk].porOp || {};
      Object.keys(bo).forEach(function(k) { if (bo[k].opKey) porOp[bo[k].opKey] = bo[k]; });
    });
    var out = [];
    Object.keys(ops).forEach(function(k) {
      out = out.concat(avaliarOp(k, ops[k], confs[k] || null, porOp[k] || null, opcoes));
    });
    return out;
  }

  function registroRnc(item, agora, autor) {
    var op = item.op || {}, plan = n(op.qtdPlanejada);
    var grave = item.tipo === 'SUPERPRODUCAO' || !plan || item.qtd / Math.max(plan, n(op.produzido), 1) >= 0.02;
    return {
      numero: item.chave, status: 'ABERTA', classificacao: grave ? 'MAIOR' : 'MENOR', origem: 'PRODUCAO',
      categoria: 'CONSISTENCIA', tipoInconsistencia: item.tipo, titulo: TITULO[item.tipo],
      descricao: item.descricao, abertaEm: agora, abertaPor: autor || 'sistema', automatica: true,
      itemTipo: 'produto', itemCodigo: op.sku || null, itemNome: op.produto || null, unidade: 'un',
      qtdEnvolvida: item.qtd, opKey: item.opKey, opLote: op.lote || null, loteOrigem: op.lote || null,
      skuPedidoKey: op.skuPedidoKey || null,
      acaoImediata: 'Aberta automaticamente pela verificação de consistência. Bloquear expedição do lote até a conferência física.'
    };
  }

  /* Cria só o que não existe. Transação: o SDK chama primeiro com o cache
     (null) -- devolvemos o registro novo; se o servidor já tem a RNC, a
     segunda passada recebe o valor real e aborta. Nunca sobrescreve. */
  function abrirRncs(db, itens, agora, autor) {
    var vistos = {}, abertas = [];
    var lista = (itens || []).filter(function(i) { if (!i || vistos[i.chave]) return false; vistos[i.chave] = true; return true; });
    return lista.reduce(function(p, item) {
      return p.then(function() {
        var criada = false;
        return db.ref('nao_conformidades/' + item.chave).transaction(function(atual) {
          criada = false;
          if (atual) return;
          criada = true;
          return registroRnc(item, agora, autor);
        }).then(function(res) { if (res && res.committed && criada) abertas.push(item.chave); });
      });
    }, Promise.resolve()).then(function() { return abertas; });
  }

  function ehDeConsistencia(r) {
    return !!r && r.automatica === true && (r.categoria === 'CONSISTENCIA' || !!r.conferenciaOpKey);
  }
  // Abertas primeiro (mais nova em cima), depois em análise.
  function alertasAtivos(naoConformidades) {
    var lista = [];
    Object.keys(naoConformidades || {}).forEach(function(k) {
      var r = naoConformidades[k];
      if (!ehDeConsistencia(r) || r.status === 'CONCLUIDA' || r.status === 'CANCELADA') return;
      lista.push(Object.assign({numero: k}, r, {numero: r.numero || k}));
    });
    return lista.sort(function(a, b) {
      var sa = a.status === 'ABERTA' ? 0 : 1, sb = b.status === 'ABERTA' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return String(b.abertaEm || '').localeCompare(String(a.abertaEm || ''));
    });
  }

  function papeis(user) {
    if (!user) return [];
    return [user.role].concat(Object.keys(user.funcoes || {}).filter(function(f) { return user.funcoes[f] === true; }));
  }
  // ADM, PCP e Expedição (Logística) -- pedido do usuário.
  function veAlertas(user) {
    if (!user) return false;
    return papeis(user).some(function(p) { return p === 'admin' || p === 'pcp' || p === 'logistica'; }) ||
      !!(user.modulos && user.modulos.logistica === true);
  }
  // Espelha a regra de escrita de nao_conformidades (database.rules.json).
  function podeAbrirRnc(user) {
    if (!user) return false;
    return ['admin', 'pcp', 'qualidade'].indexOf(user.role) !== -1 || !!(user.modulos && user.modulos.qualidade === true);
  }

  return {avaliarOp: avaliarOp, avaliar: avaliar, registroRnc: registroRnc, abrirRncs: abrirRncs,
    alertasAtivos: alertasAtivos, ehDeConsistencia: ehDeConsistencia, veAlertas: veAlertas, podeAbrirRnc: podeAbrirRnc,
    chaveRnc: chaveRnc, TITULO: TITULO, LIMITE_SUPERPRODUCAO: LIMITE_SUPERPRODUCAO, CORTE_SUPERPRODUCAO: CORTE_SUPERPRODUCAO};
});
