(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ExpedicaoPA = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  // Os três nomes existem no histórico. Se divergem, a menor data é a
  // barreira conservadora; campo preenchido inválido nunca libera saída.
  function validadeDoLote(lote) {
    var datas = [];
    for (var campo of ['dataValidade', 'validade', 'validadeLote']) {
      var valor = lote && lote[campo];
      if (valor == null || valor === '') continue;
      var s = String(valor).trim(), br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
      if (br) s = br[3] + '-' + br[2] + '-' + br[1];
      if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(s)) return null;
      s = s.slice(0, 10);
      var d = new Date(s + 'T00:00:00Z');
      if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
      datas.push(s);
    }
    return datas.sort()[0] || '';
  }
  function key(v) { return String(v || '').trim().replace(/[./[\]#$]/g, '-').replace(/\s+/g, '_').slice(0, 60); }
  // Mesmo cliente (23/10/2026). Pedido do usuário: cargas com "Miss Rose" e
  // "MISS ROSE" eram recusadas como "clientes diferentes". Medido: 67 dos 78
  // pedidos comerciais não têm clienteKey, e aí a comparação caía no texto
  // cru -- MISS RÔSE, MISS ROSE e Miss Rose viravam três clientes. Com cadastro
  // nos dois lados vale o clienteKey; senão, o nome sem acento, caixa e espaços
  // repetidos. Só compara: o nome gravado no pedido não muda.
  function chaveNomeCliente(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  }
  function mesmoCliente(a, b) {
    a = a || {}; b = b || {};
    if (a.clienteKey && b.clienteKey) return a.clienteKey === b.clienteKey;  // cadastro manda
    var na = chaveNomeCliente(a.cliente), nb = chaveNomeCliente(b.cliente);
    if (na && nb) return na === nb;
    return !na && !nb && (a.clienteKey || '') === (b.clienteKey || '');
  }
  // Destino da carga (10/11/2026). O mesmo endereço da Miss Rose estava em três
  // grafias nos pedidos ("RUA LAGOA TAI GRANDE, 1130", "Rua Lagoa Taí Grande,
  // 1130"...) e a comparação exata recusava a carga. Maiúscula, acento,
  // pontuação e espaço não mudam o destino.
  function chaveDestino(e) {
    if (e != null && typeof e === 'object') e = Object.keys(e).sort().map(function(k) { return e[k]; }).join(' ');
    return String(e == null ? '' : e).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ').trim();
  }
  function mesmoDestino(a, b) { return chaveDestino(a) === chaveDestino(b); }
  function textoDestino(e) {
    if (e != null && typeof e === 'object') return Object.keys(e).sort().map(function(k) { return e[k]; }).join(', ');
    return String(e == null ? '' : e).trim();
  }
  function rotuloPalete(l) {
    l = l || {};
    var id = (l.lote && l.lote.identificadorPalete) || l.identificadorPalete || l.loteKey || 'palete';
    var ped = l.pedidoNumero || l.pedidoId;
    return id + (ped ? ' (pedido ' + ped + ')' : '');
  }
  // Destino de UMA carga a partir das linhas (resultado de analisar) -- 10/11/2026.
  // Pedido sem endereço não bloqueia: o cliente já é o mesmo (conferido antes),
  // então ele segue o endereço informado nos outros pedidos e fica listado em
  // `semEndereco` para a Logística ver. Endereços preenchidos e diferentes
  // recusam, com mensagem que diz quais paletes, os dois endereços e o que fazer.
  function destinoDaCarga(linhas) {
    var ref = null, semEndereco = [], conflito = null;
    (linhas || []).forEach(function(l) {
      if (conflito) return;
      var e = (l && l.frete && l.frete.enderecoEntrega) || '';
      if (!chaveDestino(e)) {
        var ped = l && (l.pedidoNumero || l.pedidoId);
        if (ped && semEndereco.indexOf(String(ped)) < 0) semEndereco.push(String(ped));
        return;
      }
      if (!ref) { ref = {linha: l, endereco: e}; return; }
      if (!mesmoDestino(ref.endereco, e)) {
        conflito = 'Estes paletes vão para endereços diferentes e não podem ir na mesma carga: ' +
          rotuloPalete(ref.linha) + ' → "' + textoDestino(ref.endereco) + '"; ' +
          rotuloPalete(l) + ' → "' + textoDestino(e) + '". ' +
          'O que fazer: monte uma carga para cada endereço. Se for o mesmo local escrito de outro jeito, ' +
          'corrija o endereço de entrega no pedido (Comercial › Pedidos e Orçamentos) e tente de novo.';
      }
    });
    return {endereco: ref ? ref.endereco : '', semEndereco: semEndereco, conflito: conflito};
  }
  function mensagemOutroCliente(base, l) {
    if (chaveNomeCliente(base && base.cliente) && chaveNomeCliente(base && base.cliente) === chaveNomeCliente(l && l.cliente)) {
      return 'O palete ' + rotuloPalete(l) + ' é de "' + l.cliente + '", mas de outro cadastro de cliente (código ' +
        ((l && l.clienteKey) || '—') + ' × ' + ((base && base.clienteKey) || '—') + ') que os demais paletes. ' +
        'O que fazer: confira no Comercial qual cadastro está certo para esse pedido; até lá, monte uma carga separada para ele.';
    }
    return 'O palete ' + rotuloPalete(l) + ' é do cliente ' + ((l && l.cliente) || 'sem cliente') +
      ', e a carga já tem paletes de ' + ((base && base.cliente) || 'outro cliente') +
      '. Uma carga leva paletes de um cliente só: tire esse palete da seleção ou monte outra carga para ele.';
  }
  function mensagemFrete(l, tipoCarga) {
    var fob = l && l.frete && l.frete.tipo === 'FOB';
    return 'O pedido de ' + rotuloPalete(l) + ' é ' + (fob ? 'FOB (o cliente coleta)' : 'CIF (a Kuryos entrega)') +
      ', mas a carga está como ' + (tipoCarga === 'COLETA' ? 'Coleta FOB' : 'Entrega CIF') +
      '. Troque o tipo de transporte para ' + (fob ? 'Coleta FOB' : 'Entrega CIF') + ' ou monte uma carga separada para esse pedido.';
  }
  // Chave de /pedidos é "<número>__<sku>", e o número aparece nos DOIS
  // formatos na base: 174 OPs gravam '17__PRF-AFEE-0014' para um pedido que
  // existe como '0017__PRF-AFEE-0014', e 17 pedidos reais existem só sem zero
  // (medido em 2026-09-14, nenhum com gêmeo). Por isso não se "põe zero em
  // tudo": resolve-se a chave contra o que existe. Comparar exato fazia o
  // palete da Conferência de PA nascer com "Pedido de origem ausente", e
  // migrar as OPs faria os 24 paletes legado acusarem "vínculo mudou".
  // Mesma regra do apontamento (resolvePedidoKeyBySkuKey, utils.js).
  function normalizarChavePedido(k) {
    var partes = String(k || '').split('__');
    if (partes.length < 2) return String(k || '');
    if (/^\d+$/.test(partes[0])) partes[0] = String(parseInt(partes[0], 10));
    return partes.join('__');
  }
  // Exata primeiro; senão a ÚNICA chave equivalente sem/com zero. Nenhuma ou
  // mais de uma devolve a própria chave, e o portão de pedido ausente decide.
  function resolverChavePedido(pedidos, k) {
    if (!k) return '';
    pedidos = pedidos || {};
    if (pedidos[k]) return k;
    var alvo = normalizarChavePedido(k);
    var achadas = Object.keys(pedidos).filter(function(c) { return normalizarChavePedido(c) === alvo; });
    return achadas.length === 1 ? achadas[0] : k;
  }
  function analisar(base, itemKey, loteKey, hoje) {
    var lote = (base.estoque_lotes[itemKey] || {})[loteKey] || {};
    var op = (base.ops || {})[lote.opKey] || {};
    // OP de retrabalho (inspeção total) não tem skuPedidoKey de propósito -- é o que impede
    // creditar a produção ao pedido duas vezes. O pedido do palete retrabalhado é o da OP
    // ORIGINAL, guardado em skuPedidoKeyExpedicao só para a expedição.
    var pedidoDaOp = op.skuPedidoKey || op.skuPedidoKeyExpedicao || '';
    var skuPedidoKey = resolverChavePedido(base.pedidos, lote.skuPedidoKey || pedidoDaOp);
    var demanda = (base.pedidos || {})[skuPedidoKey] || {};
    var pedidoId = demanda.parentPedidoId || key(demanda.id);
    var comercial = (base.pedidos_comerciais || {})[pedidoId];
    var conf = (base.conferencias_pa || {})[lote.opKey] || {};
    var endereco = (base.enderecos_estoque || {})[lote.enderecoKey];
    // Palete LEGADO: produto acabado que já estava físico no galpão antes do
    // WMS existir, importado da planilha "Controle de Entradas, Saidas e
    // Estoque". A Conferência de PA e o laudo da Qualidade nunca aconteceram
    // no sistema -- exigi-los aqui obrigaria a FORJAR esses registros na
    // importação, que é o que não se pode fazer. Então esses dois portões são
    // dispensados e só para essa origem; todos os outros (saldo, validade,
    // endereço ativo, OP concluída, vínculo do pedido, cancelamento) continuam
    // valendo igual. A origem fica à vista: status LEGADO_ESTOQUE e
    // identificador com prefixo LEG-.
    var legado = lote.origemTipo === 'legado_planilha' && lote.legado === true;
    // Palete DEVOLVIDO pelo cliente (GAP-02, shared/devolucao-cliente.js): nasce
    // no recebimento da Logística, não na Conferência de PA. A conferência
    // dele é o próprio recebimento (devolucao.recebidaEm), e o laudo da
    // Qualidade continua obrigatório -- é ele que decide reintegrar/reenviar.
    var devolvido = lote.origemTipo === 'devolucao_cliente' && !!(lote.devolucao && lote.devolucao.recebidaEm);
    var origemValida = lote.origemTipo === 'conferencia_pa' || legado || devolvido;
    var vinculoGravado = legado ? lote.skuPedidoKeyOrigem : lote.skuPedidoKey;
    var motivo = '';
    if (lote.itemTipo !== 'produto' || !origemValida || !lote.identificadorPalete) motivo = 'Sem palete de PA conferido';
    else if (!Number.isInteger(Number(lote.saldoLote)) || Number(lote.saldoLote) <= 0 || lote.expedicaoId) motivo = 'Sem saldo disponível';
    else if (!legado && !['LIBERADO_EXPEDICAO', 'APROVADO_CONCESSAO'].includes(lote.status)) motivo = 'Aguardando liberação da Qualidade';
    else if (!legado && (!lote.qualidade || lote.qualidade.decisao !== lote.status)) motivo = 'Laudo da Qualidade ausente ou divergente';
    else if (validadeDoLote(lote) === null) motivo = 'Validade inválida; regularize o lote';
    else if (validadeDoLote(lote) && validadeDoLote(lote) < hoje) motivo = 'Palete vencido';
    else if (!endereco || endereco.ativo === false || lote.aguardandoEnderecoDefinitivo) motivo = 'Aguardando endereço definitivo ativo';
    else if (op.status !== 'Concluído' || op.sku !== lote.itemCodigo || key(op.sku) !== itemKey) motivo = 'OP ou produto inconsistente';
    else if (!legado && !devolvido && (!conf.finalizadoEm || !lote.conferencia || conf.finalizacaoId !== lote.conferencia.finalizacaoId)) motivo = 'Conferência de PA não finalizada';
    else if (!skuPedidoKey || !pedidoId || demanda.sku !== lote.itemCodigo || !demanda.cliente) motivo = 'Pedido de origem ausente; regularize o vínculo da OP no PCP';
    // No palete legado, skuPedidoKey guarda a chave RECONSTRUÍDA (a que existe
    // em /pedidos); a da OP é a antiga, sem zero à esquerda. Comparar as duas
    // acusaria mudança de vínculo em todo palete importado. O que se compara
    // então é skuPedidoKeyOrigem, a chave da OP no momento da importação --
    // a proteção continua valendo, contra o campo certo. A comparação ignora
    // só o zero à esquerda: número ou SKU diferente continua sendo mudança.
    else if (vinculoGravado && normalizarChavePedido(pedidoDaOp) !== normalizarChavePedido(vinculoGravado)) motivo = 'Vínculo do pedido mudou após a conferência';
    else if ([demanda.status, demanda.pedidoComercialStatus, comercial && comercial.status].some(function(s) { return /cancelad/i.test(s || ''); })) motivo = 'Pedido cancelado';
    else if (comercial && !Object.values(comercial.itens || {}).some(function(i) { return i.sku === lote.itemCodigo; })) motivo = 'Produto não consta no pedido comercial';
    var pedido = comercial || demanda;
    return {itemKey: itemKey, loteKey: loteKey, lote: lote, op: op, demanda: demanda, comercial: comercial || null,
      skuPedidoKey: skuPedidoKey, pedidoId: pedidoId, pedidoNumero: pedido.numeroFormatado || demanda.id || pedidoId,
      cliente: pedido.cliente || op.cliente || '', clienteKey: pedido.clienteKey || '',
      frete: pedido.frete || {}, endereco: endereco || {}, motivo: motivo, disponivel: !motivo, legado: legado, devolvido: devolvido};
  }
  function listar(base, hoje) {
    var linhas = [];
    Object.entries(base.estoque_lotes || {}).forEach(function(item) {
      Object.entries(item[1] || {}).forEach(function(entry) {
        if (entry[1].itemTipo === 'produto' && Number(entry[1].saldoLote) > 0) linhas.push(analisar(base, item[0], entry[0], hoje));
      });
    });
    return linhas.sort(function(a, b) { return Number(b.disponivel) - Number(a.disponivel) || String(validadeDoLote(a.lote) || '9999').localeCompare(String(validadeDoLote(b.lote) || '9999')) || String(a.lote.identificadorPalete).localeCompare(String(b.lote.identificadorPalete)); });
  }
  return {analisar: analisar, listar: listar, validadeDoLote: validadeDoLote, normalizarChavePedido: normalizarChavePedido, resolverChavePedido: resolverChavePedido, mesmoCliente: mesmoCliente, mesmoDestino: mesmoDestino,
    destinoDaCarga: destinoDaCarga, mensagemOutroCliente: mensagemOutroCliente, mensagemFrete: mensagemFrete};
});
