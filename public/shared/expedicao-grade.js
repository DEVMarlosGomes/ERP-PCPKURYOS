(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ExpedicaoGrade = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function numero(v) { return Number(v).toLocaleString('pt-BR'); }
  function composicao(p) {
    p = p || {};
    var caixas = Number(p.caixasFechadas), multiplo = Number(p.unidadesPorCaixa), parcial = Number(p.unidadesCaixaParcial || 0);
    var total = Number(p.saldoLote != null ? p.saldoLote : p.qtdUnidades);
    var valida = Number.isInteger(caixas) && caixas >= 0 && Number.isInteger(parcial) && parcial >= 0 &&
      Number.isInteger(total) && total > 0 && (caixas === 0 || Number.isInteger(multiplo) && multiplo > 0) &&
      (multiplo <= 0 || parcial < multiplo) && caixas * multiplo + parcial === total;
    if (!valida) return {valida: false, total: Number.isFinite(total) ? total : null, volumes: null,
      texto: 'Composição a conferir', resumo: (Number.isFinite(total) ? numero(total) + ' un · ' : '') + 'composição a conferir'};
    var partes = [];
    if (caixas > 0) partes.push(numero(caixas) + ' cx × ' + numero(multiplo));
    if (parcial > 0) partes.push('1 parcial com ' + numero(parcial));
    var texto = partes.join(' + ');
    return {valida: true, caixas: caixas, multiplo: multiplo || null, parcial: parcial,
      total: total, volumes: caixas + (parcial > 0 ? 1 : 0), texto: texto, resumo: texto + ' = ' + numero(total) + ' un'};
  }
  function dia(v) {
    var s = String(v || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var n = Date.parse(s + 'T12:00:00Z');
    return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === s ? n : null;
  }
  function diasEstoque(entrada, saidaOuHoje) {
    var a = dia(entrada), b = dia(saidaOuHoje);
    return a == null || b == null || b < a ? null : Math.round((b - a) / 86400000);
  }
  function totais(paletes) {
    return (paletes || []).reduce(function(t, p) {
      var c = composicao(p);
      t.paletes++; t.unidades += c.total || 0;
      if (c.valida) { t.caixasFechadas += c.caixas; t.caixasParciais += c.parcial > 0 ? 1 : 0; t.volumes += c.volumes; }
      else t.composicoesPendentes++;
      return t;
    }, {paletes: 0, unidades: 0, caixasFechadas: 0, caixasParciais: 0, volumes: 0, composicoesPendentes: 0});
  }
  /* ── Peso da carga ───────────────────────────────────────────────────
     Pedido do usuário (2026-09-15): peso da carga como na planilha, e o
     teórico do que ainda aguarda Qualidade ou Conferência de PA.
     Caixa PARCIAL pela regra de três (pedido de 16/11/2026, para a NF): se a
     caixa de 48 un pesa 10 kg, a parcial com 12 un pesa 12 × 10 ÷ 48 = 2,5 kg.
     Até 16/11 a parcial pesava uma caixa cheia (convenção da planilha).
     Ordem das fontes: peso real do palete (planilha) > kg/cx gravado no palete >
     kg/cx do cadastro do produto. Sem nenhuma, o peso é DESCONHECIDO (null),
     nunca zero -- zero somaria como se a carga fosse mais leve. */
  function positivo(v) { var n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }
  function arred(v) { return Math.round(v * 1000) / 1000; }
  function produtoDoSku(produtos, sku) {
    produtos = produtos || {};
    if (!sku) return null;
    if (produtos[sku]) return produtos[sku];
    var chave = Object.keys(produtos).find(function(k) { return (produtos[k] || {}).sku === sku; });
    return chave ? produtos[chave] : null;
  }
  function pesoPalete(lote, produto) {
    lote = lote || {};
    var real = positivo(lote.pesoTotalKg);
    if (real != null) return {kg: arred(real), kgPorCaixa: positivo(lote.pesoPorCaixaKg), fonte: 'PLANILHA'};
    var kgCx = positivo(lote.pesoPorCaixaKg), fonte = 'PALETE';
    if (kgCx == null) { kgCx = positivo((produto || {}).kgCaixa); fonte = 'CADASTRO'; }
    if (kgCx == null) return {kg: null, kgPorCaixa: null, fonte: null, falta: 'kg por caixa no cadastro do produto'};
    var c = composicao(lote), volumes = c.valida ? c.volumes : null;
    // Composição a conferir: estima volumes pelo un/cx do cadastro, se houver.
    if (volumes == null) {
      var unCx = positivo((produto || {}).unCx), total = positivo(lote.saldoLote != null ? lote.saldoLote : lote.qtdUnidades);
      if (unCx != null && total != null) volumes = Math.ceil(total / unCx);
    }
    if (volumes == null) return {kg: null, kgPorCaixa: kgCx, fonte: null, falta: 'composição das caixas'};
    // Regra de três na parcial quando a composição fecha; estimada pelo cadastro, por volume.
    var kg = c.valida ? pesoCaixas(c.caixas, c.parcial, c.multiplo, kgCx) : volumes * kgCx;
    return {kg: arred(kg), kgPorCaixa: kgCx, fonte: fonte, volumes: volumes};
  }
  // Peso de caixas fechadas + uma parcial: a parcial pesa a fração das unidades.
  function pesoCaixas(caixas, parcial, multiplo, kgCx) {
    var m = positivo(multiplo);
    var fracao = parcial > 0 ? (m ? parcial / m : 1) : 0;
    return (caixas + fracao) * kgCx;
  }

  /* ── Caixas e peso de uma CARGA (pedido de 16/11/2026) ──────────────
     "Se tem 100 cx com 48 un + 1 cx parcial com 30 un, hoje mostra 100 cx +
     38 un; preciso que mostre 100 cx + 1 cx parcial" -- é o número de volumes
     da NF. A composição sai das UNIDADES QUE ESTÃO NA CARGA e das unidades por
     caixa do palete (senão, do cadastro): palete desmembrado leva só parte das
     caixas. Cada palete tem no máximo uma caixa parcial física.
     itens: [{itemKey, loteKey, quantidade}]; base: {estoque_lotes, produtos}. */
  function composicaoDaQuantidade(lote, produto, quantidade) {
    lote = lote || {};
    var q = Number(quantidade);
    if (!(q > 0)) return {valida: false, total: 0};
    var upc = positivo(lote.unidadesPorCaixa) || positivo((produto || {}).unCx);
    if (upc) {
      var cx = Math.floor(q / upc);
      return {valida: true, caixas: cx, parcial: q - cx * upc, multiplo: upc, total: q};
    }
    var c = composicao(lote);
    if (c.valida && c.total === q) return {valida: true, caixas: c.caixas, parcial: c.parcial, multiplo: c.multiplo, total: q};
    return {valida: false, total: q};
  }
  function resumoCarga(itens, base) {
    base = base || {};
    var t = {paletes: 0, unidades: 0, caixasFechadas: 0, caixasParciais: 0, unidadesParciais: 0, volumes: 0,
      pesoKg: 0, semPeso: 0, semComposicao: 0, linhas: []};
    (itens || []).forEach(function(it) {
      if (!it) return;
      var lote = ((base.estoque_lotes || {})[it.itemKey] || {})[it.loteKey] || {};
      var produto = produtoDoSku(base.produtos, lote.itemCodigo || it.sku) || {};
      var q = Number(it.quantidade != null ? it.quantidade : lote.saldoLote) || 0;
      var c = composicaoDaQuantidade(lote, produto, q);
      var kgCx = positivo(lote.pesoPorCaixaKg) || positivo(produto.kgCaixa);
      var kg = null;
      if (c.valida && kgCx) kg = arred(pesoCaixas(c.caixas, c.parcial, c.multiplo, kgCx));
      else if (positivo(lote.pesoTotalKg) && positivo(lote.saldoLote)) kg = arred(lote.pesoTotalKg * q / lote.saldoLote);
      t.paletes++; t.unidades += q;
      if (c.valida) {
        t.caixasFechadas += c.caixas;
        if (c.parcial > 0) { t.caixasParciais++; t.unidadesParciais += c.parcial; }
        t.volumes += c.caixas + (c.parcial > 0 ? 1 : 0);
      } else t.semComposicao++;
      if (kg == null) t.semPeso++; else t.pesoKg = arred(t.pesoKg + kg);
      t.linhas.push({itemKey: it.itemKey, loteKey: it.loteKey, quantidade: q, caixas: c.valida ? c.caixas : null,
        parcial: c.valida ? c.parcial : null, unidadesPorCaixa: c.valida ? c.multiplo : null, kgPorCaixa: kgCx, pesoKg: kg});
    });
    t.texto = textoCaixas(t);
    return t;
  }
  // "100 cx + 1 cx parcial (30 un)" -- o que vai na NF como volumes.
  function textoCaixas(t) {
    var partes = [];
    if (t.caixasFechadas) partes.push(numero(t.caixasFechadas) + ' cx');
    if (t.caixasParciais) partes.push(numero(t.caixasParciais) + ' cx parcia' + (t.caixasParciais > 1 ? 'is' : 'l') +
      ' (' + numero(t.unidadesParciais) + ' un)');
    var txt = partes.join(' + ') || '—';
    if (t.caixasParciais) txt += ' = ' + numero(t.volumes) + ' volumes';
    return txt;
  }
  function textoPesoKg(t) {
    if (!t || !t.paletes) return '—';
    if (t.semPeso === t.paletes) return 'sem peso (cadastre o kg por caixa)';
    return Number(t.pesoKg).toLocaleString('pt-BR', {maximumFractionDigits: 2}) + ' kg' +
      (t.semPeso ? ' (' + t.semPeso + ' palete' + (t.semPeso > 1 ? 's' : '') + ' sem peso)' : '');
  }
  // OP produzida que ainda não virou palete (aguarda Conferência de PA ou a
  // confirmação do PCP): o palete não existe, então o peso é TEÓRICO pelo
  // cadastro -- produzido ÷ un/cx, arredondado para cima, × kg/cx.
  function pesoTeoricoOp(qtd, produto) {
    var q = positivo(qtd), unCx = positivo((produto || {}).unCx), kgCx = positivo((produto || {}).kgCaixa);
    if (q == null) return {kg: null, volumes: null, falta: 'quantidade produzida'};
    if (unCx == null) return {kg: null, volumes: null, falta: 'unidades por caixa no cadastro do produto'};
    var volumes = Math.ceil(q / unCx);
    if (kgCx == null) return {kg: null, volumes: volumes, falta: 'kg por caixa no cadastro do produto'};
    return {kg: arred(volumes * kgCx), volumes: volumes, kgPorCaixa: kgCx};
  }
  function somaPeso(pesos) {
    return (pesos || []).reduce(function(t, p) {
      t.itens++;
      if (p && p.kg != null) t.kg = arred(t.kg + p.kg); else t.semPeso++;
      return t;
    }, {kg: 0, itens: 0, semPeso: 0});
  }

  /* ── Selecionar todos ────────────────────────────────────────────────
     Uma carga só é aceita pelo servidor (confirmarExpedicaoPA /
     salvarAgendamentoExpedicaoPA) com o MESMO cliente, o MESMO destino, CIF/FOB
     compatível e até 100 paletes. Selecionar tudo sem essas regras montaria
     uma carga que o servidor recusa na hora de confirmar. */
  var LIMITE_PALETES_CARGA = 100;
  // Mesma regra do servidor (functions/expedicao_regras.js, mesmoCliente):
  // cadastro igual OU nome igual sem acento, caixa e espaços repetidos.
  function chaveNomeCliente(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  }
  function mesmoCliente(a, b) {
    if (a.clienteKey && b.clienteKey) return a.clienteKey === b.clienteKey;  // cadastro manda
    var na = chaveNomeCliente(a.cliente), nb = chaveNomeCliente(b.cliente);
    if (na && nb) return na === nb;
    return !na && !nb && (a.clienteKey || '') === (b.clienteKey || '');
  }
  // Mesma regra de mesmoDestino em shared/expedicao.js (a grade também roda
  // no estoque.html, sem aquele arquivo): grafia não muda o destino.
  function chaveDestino(e) {
    if (e != null && typeof e === 'object') e = Object.keys(e).sort().map(function(k) { return e[k]; }).join(' ');
    return String(e == null ? '' : e).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ').trim();
  }
  function compativel(a, b) {
    if (!mesmoCliente(a, b)) return false;
    // Pedido sem endereço acompanha o destino dos outros (mesmo cliente, conferido acima).
    var da = chaveDestino((a.frete || {}).enderecoEntrega), db = chaveDestino((b.frete || {}).enderecoEntrega);
    if (da && db && da !== db) return false;
    var ta = (a.frete || {}).tipo || '', tb = (b.frete || {}).tipo || '';
    return !ta || !tb || ta === tb;
  }
  // `candidatas`: linhas visíveis e selecionáveis; `jaSelecionadas`: linhas da
  // seleção atual. Âncora = seleção atual; sem seleção, as candidatas precisam
  // formar UMA carga, senão nada é marcado e o motivo diz o que filtrar.
  function selecionarTodos(candidatas, jaSelecionadas) {
    candidatas = candidatas || []; jaSelecionadas = jaSelecionadas || [];
    var ancora = jaSelecionadas[0] || candidatas[0];
    if (!ancora) return {selecionar: [], ignoradas: 0, motivo: 'Nenhum palete disponível neste filtro.'};
    var compat = candidatas.filter(function(l) { return compativel(ancora, l); });
    var incompat = candidatas.length - compat.length;
    if (!jaSelecionadas.length && incompat) {
      var clientes = {};
      candidatas.forEach(function(l) { clientes[chaveNomeCliente(l.cliente) || l.clienteKey] = true; });
      var n = Object.keys(clientes).length;
      return {selecionar: [], ignoradas: candidatas.length,
        motivo: n > 1 ? 'Os paletes visíveis são de ' + n + ' clientes. Filtre um cliente para selecionar todos.'
                      : 'Os paletes visíveis têm destinos ou CIF/FOB diferentes e não cabem na mesma carga. Refine a busca.'};
    }
    var espaco = Math.max(0, LIMITE_PALETES_CARGA - jaSelecionadas.length);
    var selecionar = compat.slice(0, espaco);
    var motivos = [];
    if (incompat) motivos.push(incompat + ' palete(s) de outro cliente, destino ou CIF/FOB ficaram de fora');
    if (compat.length > espaco) motivos.push('limite de ' + LIMITE_PALETES_CARGA + ' paletes por carga');
    return {selecionar: selecionar, ignoradas: candidatas.length - selecionar.length, motivo: motivos.join('; ')};
  }

  return {composicao: composicao, diasEstoque: diasEstoque, totais: totais,
    produtoDoSku: produtoDoSku, pesoPalete: pesoPalete, pesoTeoricoOp: pesoTeoricoOp, somaPeso: somaPeso,
    pesoCaixas: pesoCaixas, composicaoDaQuantidade: composicaoDaQuantidade, resumoCarga: resumoCarga, textoCaixas: textoCaixas, textoPesoKg: textoPesoKg,
    compativel: compativel, selecionarTodos: selecionarTodos, LIMITE_PALETES_CARGA: LIMITE_PALETES_CARGA};
});
