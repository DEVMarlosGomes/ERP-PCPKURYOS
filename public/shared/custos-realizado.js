/* Custo REALIZADO por OP, variações e consolidação — funções PURAS.
 *
 * PLANO_CUSTOS_RESULTADO.md, Fase 2. Mesmo contrato do motor de padrão
 * (custos.js): nada aqui lê banco nem toca no DOM, e dado que falta nunca vira
 * zero -- vira null com o motivo, e a procedência de cada parte vai junto.
 *
 * Três regras que mandam aqui:
 *  1. Operação pelas HORAS TRABALHADAS APONTADAS, nunca pela duração da OP
 *     (dataFimReal − dataInicioReal é calendário: medido, dá 123–243% de
 *     ocupação). Sem horas apontadas, cai nas horas-padrão e DIZ que caiu.
 *  2. Material pelo consumo baixado no apontamento, valorizado pelo custo do
 *     lote (gravado no recebimento desde 26/10) ou pelo preço vigente. Sem
 *     consumo apontado, o material é o TEÓRICO (ficha × produzido) e a variação
 *     de consumo não existe -- não é zero, é "não medida".
 *  3. Unidades boas são as das LINHAS DE ENVASE. Rotulagem e postos (celofane,
 *     pescante, cartucho) são etapas da mesma unidade: somar duplica (medido em
 *     26/10: 1,02 milhão apontado contra 798 mil produzidos em jun–set).
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CustosRealizado = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var VERSAO = 'realizado-v1-20261026';

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function norm(c) { return String(c == null ? '' : c).trim().toUpperCase(); }
  function nomeLinha(l) {
    var m = String(l || '').match(/^\s*linha\s*0*(\d+)\s*$/i);
    return m ? 'Linha ' + Number(m[1]) : String(l || '').trim();
  }
  function ehLinhaEnvase(l) { return /^Linha \d+$/.test(nomeLinha(l)); }
  function loteKey(l) { return String(l == null ? '' : l).trim().replace(/[.#$\/\[\]]/g, '-'); }

  /* Apontamentos achatados: registros/{dia}/{id} -> [{dia, id, ...}]. O balde
     "sem-data" (importação antiga) fica de fora: sem dia não há placar. */
  function achatarRegistros(registros) {
    var out = [];
    Object.keys(registros || {}).forEach(function(dia) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return;
      var d = registros[dia] || {};
      Object.keys(d).forEach(function(id) { var r = d[id]; if (r) out.push(Object.assign({ dia: dia, id: id }, r)); });
    });
    return out;
  }

  /* De que SKU é um apontamento: o próprio campo; senão a OP do lote; senão a
     descrição exata do produto. Medido em 26/10 (jun–set): 102 pelo campo, 296
     pela OP, 83 pelo nome, 27 sem SKU (5% da quantidade, fica de fora e é contado). */
  function indexarOps(ops) {
    var porLote = {}, porDescricao = {};
    Object.keys(ops || {}).forEach(function(k) {
      var o = ops[k]; if (!o) return;
      if (o.lote) porLote[String(o.lote).trim()] = Object.assign({ opKey: k }, o);
    });
    return { porLote: porLote };
  }
  function indexarProdutosPorDescricao(produtos) {
    var m = {};
    Object.keys(produtos || {}).forEach(function(k) { var p = produtos[k]; if (p && p.sku && p.descricao) m[String(p.descricao).trim().toUpperCase()] = norm(p.sku); });
    return m;
  }
  function skuDoApontamento(r, idxOps, porDescricao) {
    if (r.sku) return { sku: norm(r.sku), via: 'APONTAMENTO' };
    var op = idxOps.porLote[String(r.lote || '').trim()];
    if (op && op.sku) return { sku: norm(op.sku), via: 'OP', opKey: op.opKey };
    var d = porDescricao[String(r.produto || '').trim().toUpperCase()];
    if (d) return { sku: d, via: 'DESCRICAO' };
    return { sku: null, via: null };
  }

  // Tipo de perda apontada -> material do BOM daquele tipo.
  var PERDA_PARA_MATERIAL = [
    [/frasco|pote|bisnaga|vidro/i, /FRASCO|POTE|BISNAGA|VIDRO/],
    [/r[oó]tulo|etiqueta/i, /ROTULO|RÓTULO|ETIQUETA/],
    [/cartucho/i, /CARTUCHO/],
    [/tampa|v[aá]lvula/i, /TAMPA|VALVULA|VÁLVULA|BOMBA|SPRAY/],
    [/caixa/i, /CAIXA/]
  ];
  function materialDaPerda(tipo, linhasBom) {
    for (var i = 0; i < PERDA_PARA_MATERIAL.length; i++) {
      if (!PERDA_PARA_MATERIAL[i][0].test(tipo || '')) continue;
      var hit = (linhasBom || []).filter(function(l) { return PERDA_PARA_MATERIAL[i][1].test(norm(l.nome || '')) && l.precoUnitario != null; })[0];
      if (hit) return hit;
    }
    return null;
  }

  /* Perdas apontadas de um lote, em unidades por tipo. Duas origens: o nó
     perdas/{lote}/{id}.perdas[] e o campo antigo ops/{op}.perdas {tipo: qtd}. */
  function perdasDoLote(perdasNo, op) {
    var por = {};
    Object.keys(perdasNo || {}).forEach(function(k) {
      ((perdasNo[k] || {}).perdas || []).forEach(function(p) { if (p && num(p.quantidade) > 0) por[p.tipo || 'Outro'] = (por[p.tipo || 'Outro'] || 0) + num(p.quantidade); });
    });
    if (!Object.keys(por).length && op && op.perdas && typeof op.perdas === 'object') {
      Object.keys(op.perdas).forEach(function(t) { if (num(op.perdas[t]) > 0) por[t] = num(op.perdas[t]); });
    }
    return por;
  }

  /* Unidades perdidas (para pontos): a perda de uma unidade costuma derrubar
     frasco e rótulo juntos, então a quantidade de unidades é o MAIOR tipo, não a
     soma -- somar contaria a mesma unidade duas vezes. */
  function unidadesPerdidas(porTipo) {
    var m = 0;
    Object.keys(porTipo || {}).forEach(function(t) { m = Math.max(m, num(porTipo[t])); });
    return m;
  }

  /* Custo realizado de UMA OP.
   * a: { opKey, op, ficha (padrão, de custos.js), apontamentos (do lote, já
   *      filtrados), perdasPorTipo, consumos [{itemCodigo, qtd(+), custoUnitario?,
   *      fonte?}], precos (resolvidos), idx, taxa, precoVenda, impostosPct } */
  function custoRealizadoOp(a) {
    var x = a || {}, op = x.op || {}, ficha = x.ficha || null;
    var produzido = num(op.produzido);
    var avisos = [];
    var linha = nomeLinha(op.linha || '');
    var envase = (x.apontamentos || []).filter(function(r) { return ehLinhaEnvase(r.linha); });

    // Operação: horas apontadas × custo-hora da linha (ou direto).
    var horas = envase.reduce(function(s, r) { return s + num(r.horasTrabalhadas); }, 0);
    var ritmo = ficha && ficha.ritmo && ficha.ritmo.valor > 0 ? ficha.ritmo.valor : null;
    var horasPadrao = ritmo ? produzido / ritmo : null;
    var horasFonte = 'APONTADAS';
    if (!(horas > 0)) {
      horas = horasPadrao; horasFonte = 'PADRAO';
      if (horas != null) avisos.push('Sem horas trabalhadas apontadas: operação pelas horas-padrão (eficiência não medida).');
    }
    var taxa = x.taxa || null;
    var custoHora = taxa ? ((taxa.custoHoraLinha || {})[linha] || taxa.custoHoraDireta) : null;
    var operacao = horas != null && custoHora > 0 ? horas * custoHora : null;

    // Material: consumo apontado valorizado, ou teórico.
    var material = null, materialFonte = null, variacaoPreco = null, variacaoConsumo = null, semValor = [];
    var consumos = x.consumos || [];
    if (consumos.length) {
      var total = 0, padraoQtdPreco = 0, realQtdPadraoPreco = 0;
      consumos.forEach(function(c) {
        var cod = norm(c.itemCodigo), achado = (x.idx || {})[cod];
        var precoPadrao = achado && x.precos && x.precos[achado.key] ? x.precos[achado.key].valor : null;
        var unit = num(c.custoUnitario) > 0 ? num(c.custoUnitario) : precoPadrao;
        if (unit == null) { semValor.push(cod); return; }
        total += num(c.qtd) * unit;
        if (precoPadrao != null) realQtdPadraoPreco += num(c.qtd) * precoPadrao;
      });
      material = semValor.length ? null : total;
      materialFonte = 'CONSUMO_APONTADO';
      if (material != null && ficha && ficha.custoMaterial != null) {
        padraoQtdPreco = ficha.custoMaterial * produzido;
        variacaoPreco = total - realQtdPadraoPreco;            // pagou diferente do padrão
        variacaoConsumo = realQtdPadraoPreco - padraoQtdPreco; // usou diferente do padrão
      }
      if (semValor.length) avisos.push('Consumo sem custo: ' + semValor.join(', ') + '.');
    } else if (ficha && ficha.custoMaterial != null) {
      material = ficha.custoMaterial * produzido;
      materialFonte = 'TEORICO';
      avisos.push('Consumo não apontado: material pelo teórico (ficha × produzido); variação de consumo não medida.');
    }

    // Perdas apontadas, valorizadas pelo material do BOM do mesmo tipo.
    var porTipo = x.perdasPorTipo || {};
    var perdasValor = 0, perdasSemValor = [];
    var linhasBom = ficha && ficha.embalagem ? ficha.embalagem.linhas : [];
    Object.keys(porTipo).forEach(function(t) {
      var m = materialDaPerda(t, linhasBom);
      if (m) perdasValor += num(porTipo[t]) * m.precoUnitario;
      else perdasSemValor.push(t + ' (' + porTipo[t] + ')');
    });
    if (perdasSemValor.length) avisos.push('Perda sem material correspondente no BOM: ' + perdasSemValor.join(', ') + '.');
    var perdas = perdasSemValor.length ? null : perdasValor;

    // Padrão da mesma quantidade, para as variações.
    var padrao = ficha && ficha.custoVariavel != null ? {
      material: ficha.custoMaterial * produzido,
      perdas: ficha.perdas.custoPorPeca * produzido,
      operacao: ficha.operacao.custoPorPeca * produzido,
      total: ficha.custoVariavel * produzido
    } : null;
    var variacaoPerda = padrao && perdas != null ? perdas - padrao.perdas : null;
    var variacaoEficiencia = horasFonte === 'APONTADAS' && horasPadrao != null && custoHora > 0 ? (horas - horasPadrao) * custoHora : null;

    var custoTotal = material != null && perdas != null && operacao != null ? material + perdas + operacao : null;
    var preco = x.precoVenda || {};
    var imp = x.impostosPct;
    var receita = preco.valor > 0 ? preco.valor * produzido : null;
    var receitaLiquida = receita != null && imp != null ? receita * (1 - imp / 100) : null;
    var lp = receitaLiquida != null && custoTotal != null ? receitaLiquida - custoTotal : null;

    return {
      opKey: x.opKey || null, sku: norm(op.sku), lote: op.lote || null, linha: linha || null, cliente: op.cliente || null,
      pedido: pedidoDaOp(op), dia: String(op.dataFimReal || op.dataInicioReal || '').slice(0, 10) || null,
      produzido: produzido,
      horas: horas, horasFonte: horasFonte, horasPadrao: horasPadrao,
      custo: { material: material, materialFonte: materialFonte, perdas: perdas, operacao: operacao, total: custoTotal },
      padrao: padrao,
      variacoes: { preco: variacaoPreco, consumo: variacaoConsumo, perda: variacaoPerda, eficiencia: variacaoEficiencia },
      receita: receita, receitaLiquida: receitaLiquida, lp: lp, lpUnitario: lp != null && produzido > 0 ? lp / produzido : null,
      lpPadraoUnitario: ficha ? ficha.lp : null,
      perdasPorTipo: porTipo, unidadesPerdidas: unidadesPerdidas(porTipo),
      completo: lp != null, avisos: avisos, versao: VERSAO
    };
  }

  /* Consumos de um lote de produção: movimentos_estoque/{item}/{mov} com tipo
     "consumo" e ref = lote da OP (form.html e manipulacao.html baixam com o lote
     como referência). A saída é gravada NEGATIVA; aqui volta positiva. O custo
     unitário vem do lote de estoque de onde saiu (custoUnitario, gravado no
     recebimento) quando existir. */
  function consumosDoLote(movimentos, estoqueLotes, lote) {
    var alvo = String(lote || '').trim(), out = [];
    if (!alvo) return out;
    Object.keys(movimentos || {}).forEach(function(itemKey) {
      var porItem = movimentos[itemKey] || {};
      Object.keys(porItem).forEach(function(mk) {
        var m = porItem[mk];
        if (!m || m.tipo !== 'consumo' || String(m.ref || '').trim() !== alvo) return;
        var lotesItem = (estoqueLotes && estoqueLotes[itemKey]) || {};
        var origem = m.loteKey ? lotesItem[m.loteKey] : null;
        var custo = origem && num(origem.custoUnitario) > 0 ? num(origem.custoUnitario) : null;
        // Lote nascido de separação/transferência copia dono e lote interno, não o custo:
        // vale o custo do irmão com o MESMO lote interno (a mesma entrada do fornecedor).
        if (custo == null && origem && origem.loteInterno) {
          Object.keys(lotesItem).some(function(k) {
            var l = lotesItem[k];
            if (l && l.loteInterno === origem.loteInterno && num(l.custoUnitario) > 0) { custo = num(l.custoUnitario); return true; }
            return false;
          });
        }
        out.push({ itemCodigo: m.itemCodigo, qtd: Math.abs(num(m.qtd)), custoUnitario: custo });
      });
    });
    return out;
  }

  // Pedido global de uma OP: "0006__MRARBS05" -> "0006".
  function pedidoDaOp(op) {
    var k = String((op && (op.skuPedidoKey || op.parentPedidoId)) || '');
    return k ? k.split('__')[0] : null;
  }

  /* Consolidação OP -> pedido × SKU -> pedido -> cliente -> mês.
     Soma só o que é número; o nível só é "completo" se todas as OPs forem, e
     a cobertura (% do produzido com custo) vai junto -- um LP de cliente sobre
     40% das unidades não é o LP do cliente. */
  function consolidar(resultados, nivel) {
    var chave = {
      pedidoSku: function(r) { return (r.pedido || 'sem pedido') + ' × ' + r.sku; },
      pedido: function(r) { return r.pedido || 'sem pedido'; },
      cliente: function(r) { return r.cliente || 'sem cliente'; },
      mes: function(r) { return r.dia ? r.dia.slice(0, 7) : 'sem data'; },
      sku: function(r) { return r.sku || 'sem SKU'; },
      linha: function(r) { return r.linha || 'sem linha'; }
    }[nivel];
    if (!chave) throw new Error('nível de consolidação desconhecido: ' + nivel);
    var grupos = {};
    (resultados || []).forEach(function(r) {
      var k = chave(r), g = grupos[k];
      if (!g) g = grupos[k] = { chave: k, ops: 0, produzido: 0, produzidoComCusto: 0, receita: 0, receitaLiquida: 0,
        material: 0, perdas: 0, operacao: 0, custo: 0, lp: 0, padrao: 0,
        variacoes: { preco: 0, consumo: 0, perda: 0, eficiencia: 0 }, incompletas: 0 };
      g.ops++; g.produzido += r.produzido;
      if (r.completo) {
        g.produzidoComCusto += r.produzido; g.receita += r.receita; g.receitaLiquida += r.receitaLiquida;
        g.material += r.custo.material; g.perdas += r.custo.perdas; g.operacao += r.custo.operacao;
        g.custo += r.custo.total; g.lp += r.lp; if (r.padrao) g.padrao += r.padrao.total;
        Object.keys(g.variacoes).forEach(function(v) { if (r.variacoes[v] != null) g.variacoes[v] += r.variacoes[v]; });
      } else g.incompletas++;
    });
    return Object.keys(grupos).map(function(k) {
      var g = grupos[k];
      g.coberturaPct = g.produzido > 0 ? g.produzidoComCusto / g.produzido * 100 : 0;
      g.completo = g.incompletas === 0 && g.ops > 0;
      g.lpUnitario = g.produzidoComCusto > 0 ? g.lp / g.produzidoComCusto : null;
      if (!g.produzidoComCusto) { g.lp = null; g.custo = null; g.receita = null; g.receitaLiquida = null; }
      return g;
    }).sort(function(a, b) { return String(a.chave).localeCompare(String(b.chave)); });
  }

  /* Lançamentos do razão de custos para uma OP realizada (append-only). Cada
     parte com valor vira uma linha com objeto, natureza e procedência; o que
     não tem valor NÃO gera lançamento de zero. */
  function lancamentosDaOp(res, meta) {
    var m = meta || {}, out = [];
    if (!res || !res.opKey) return out;
    var base = { objeto: { tipo: 'OP', id: res.opKey }, sku: res.sku, lote: res.lote, competencia: (res.dia || '').slice(0, 7) || null,
      criadoEm: m.em || null, criadoPor: m.por || 'servidor', versaoMotor: VERSAO };
    function add(tipo, natureza, valor, extra) {
      // Sem valor ou valor zero (OP sem perda apontada) não é fato econômico: não lança.
      if (valor == null || !isFinite(valor) || valor === 0) return;
      out.push(Object.assign({}, base, { tipo: tipo, natureza: natureza, valorTotal: Math.round(valor * 100) / 100 }, extra || {}));
    }
    add('CONSUMO_MATERIAL', 'MATERIA_PRIMA_EMBALAGEM', res.custo.material, { quantidade: res.produzido, unidade: 'UN', procedencia: res.custo.materialFonte });
    add('PERDA', 'MATERIA_PRIMA_EMBALAGEM', res.custo.perdas, { quantidade: res.unidadesPerdidas, unidade: 'UN', procedencia: 'APONTADO' });
    add('HORA_PRODUCAO', 'MAO_DE_OBRA', res.custo.operacao, { quantidade: res.horas, unidade: 'H', procedencia: res.horasFonte });
    return out;
  }

  return {
    VERSAO: VERSAO,
    achatarRegistros: achatarRegistros,
    indexarOps: indexarOps,
    indexarProdutosPorDescricao: indexarProdutosPorDescricao,
    skuDoApontamento: skuDoApontamento,
    nomeLinha: nomeLinha,
    ehLinhaEnvase: ehLinhaEnvase,
    loteKey: loteKey,
    perdasDoLote: perdasDoLote,
    unidadesPerdidas: unidadesPerdidas,
    materialDaPerda: materialDaPerda,
    custoRealizadoOp: custoRealizadoOp,
    consumosDoLote: consumosDoLote,
    pedidoDaOp: pedidoDaOp,
    consolidar: consolidar,
    lancamentosDaOp: lancamentosDaOp
  };
});
