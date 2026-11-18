/* Edição de Pedido de Compra com justificativa -- regras puras (sem Firebase,
   sem DOM).

   Pedido do usuário (18/11/2026): "no pedido de compra colocar função para
   edição dos pedidos caso seja necessário com justificativa".

   Antes só dava para editar enquanto ABERTO. Depois de enviado, mudança de
   preço, quantidade, prazo ou frete combinada com o fornecedor não tinha
   onde entrar: o caminho era cancelar e refazer o PC, perdendo o vínculo com
   recebimentos e SC.

   Decisões:
   - ADMIN e quem é do setor de Compras (módulo `compras`, pedido do
     usuário em 18/11: "além do adm quem é do setor também pode"). A regra
     do banco de `pedidos_compra` já deixa esse grupo gravar (papel pcp ou
     modulos.compras); a tela confere as duas coisas. Cancelar segue só ADM
     (shared/cancelamento-pc.js).
   - Edita QUALQUER pedido, em qualquer status (pedido do usuário, 18/11:
     "edições devem ser para qualquer pedido"). Antes RECEBIDO_TOTAL e
     CANCELADO ficavam de fora. Em pedido recebido, a quantidade nova
     recalcula o status como o recebimento faria (functions/recebimento.js
     statusPedidoApos): aumentar reabre o saldo (RECEBIDO_PARCIAL), baixar até
     o recebido fecha (RECEBIDO_TOTAL). CANCELADO segue CANCELADO: a edição
     corrige o registro, não reabre o pedido na fila da Logística.
   - Justificativa obrigatória (mínimo 10 caracteres) em TODA edição, e cada
     edição vira uma revisão em `edicoes/{id}` com quem, quando, status no
     momento e o "de → para" de cada campo. Nada é apagado.
   - Quantidade não desce abaixo do que já foi recebido: o material entrou,
     tem lote e movimento de estoque.
   - Quando a quantidade cotada muda, o saldo a receber (`qtd`, na unidade de
     estoque, que é o limite do recebimento no servidor) acompanha. Sem isso
     a Logística seguiria limitada à quantidade antiga.
   - Recebimentos já lançados e títulos a pagar nascidos deles NÃO mudam: o
     título segue o fato (functions/financeiro.js). Preço novo vale para o
     que ainda vai chegar. */
(function(root) {
  'use strict';

  var RECEBIDOS = ['RECEBIDO_PARCIAL', 'RECEBIDO_TOTAL'];
  var JUSTIFICATIVA_MINIMA = 10;
  var LIMIAR = 0.0001;

  function numero(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function texto(v) { return v == null ? '' : String(v).trim(); }

  /* `acesso` = {admin, compras} montado pela tela, ou o papel em texto
     (compatível: 'admin' pode). */
  function podeEditarAcesso(acesso) {
    if (typeof acesso === 'string') return acesso === 'admin';
    return !!(acesso && (acesso.admin || acesso.compras));
  }

  function avaliarEdicao(pc, acesso) {
    if (!pc) return { pode: false, motivo: 'Pedido não encontrado.' };
    if (!podeEditarAcesso(acesso)) return { pode: false, motivo: 'Apenas administradores e o setor de Compras podem editar um pedido de compra.' };
    return { pode: true, motivo: null };
  }

  /* Aplica o mapa {caminhoRelativo: valor} a uma cópia do PC (null apaga).
     A mesma função serve à transaction da tela e à prévia da revisão. */
  function aplicarMudancas(pc, mudancas) {
    var out = JSON.parse(JSON.stringify(pc || {}));
    Object.keys(mudancas || {}).forEach(function(c) {
      var partes = c.split('/'), o = out;
      for (var i = 0; i < partes.length - 1; i++) {
        if (o[partes[i]] == null || typeof o[partes[i]] !== 'object') o[partes[i]] = {};
        o = o[partes[i]];
      }
      if (mudancas[c] == null) delete o[partes[partes.length - 1]]; else o[partes[partes.length - 1]] = mudancas[c];
    });
    return out;
  }

  /* Status depois da edição. Só pedido já recebido (parcial ou total) muda,
     pela mesma conta do recebimento no servidor: tudo recebido = TOTAL, algo
     recebido = PARCIAL. ABERTO, ENVIADO e CANCELADO ficam como estão. */
  function statusAposEdicao(pcDepois) {
    var st = pcDepois && pcDepois.status;
    if (RECEBIDOS.indexOf(st) < 0) return st || null;
    var itens = pcDepois.itens || {}, algum = false, completo = true;
    Object.keys(itens).forEach(function(k) {
      var rec = numero(itens[k].qtdRecebida), qtd = numero(itens[k].qtd);
      if (rec > LIMIAR) algum = true;
      if (rec < qtd - LIMIAR) completo = false;
    });
    return completo ? 'RECEBIDO_TOTAL' : (algum ? 'RECEBIDO_PARCIAL' : st);
  }

  function validarJustificativa(j) {
    var t = texto(j);
    if (t.length < JUSTIFICATIVA_MINIMA) return 'Descreva a justificativa da edição (mínimo ' + JUSTIFICATIVA_MINIMA + ' caracteres).';
    return null;
  }

  /* Saldo a receber do item depois da edição, na unidade de estoque.
     `novo` = {qtdCotada, qtdEmUnidadeEstoque, unidadeDiferente}. Só muda
     quando a quantidade cotada mudou: `qtd` pode ser diferente da cotada por
     lote mínimo, e reescrever item que ninguém tocou mudaria o recebimento
     sem motivo. */
  function qtdAReceberApos(itAntes, novo) {
    var antes = itAntes || {};
    var cotAntes = antes.qtdCotada != null ? numero(antes.qtdCotada) : null;
    var cotDepois = novo && novo.qtdCotada != null ? numero(novo.qtdCotada) : null;
    if (cotDepois == null || (cotAntes != null && Math.abs(cotDepois - cotAntes) < LIMIAR)) return numero(antes.qtd);
    if (novo.qtdEmUnidadeEstoque != null) return Math.round(numero(novo.qtdEmUnidadeEstoque) * 10000) / 10000;
    if (!novo.unidadeDiferente) return cotDepois;
    return numero(antes.qtd);
  }

  /* Recusa quantidade abaixo do recebido. `itensNovos` = {itemKey: {qtd}}. */
  function conferirRecebido(pc, itensNovos) {
    var itens = (pc && pc.itens) || {};
    var keys = Object.keys(itensNovos || {});
    for (var i = 0; i < keys.length; i++) {
      var it = itens[keys[i]] || {};
      var rec = numero(it.qtdRecebida);
      if (numero(itensNovos[keys[i]].qtd) < rec - LIMIAR) {
        return 'O item ' + (it.materialCodigo || keys[i]) + ' já teve ' + rec + ' ' + (it.unidade || '') +
          ' recebidos — a quantidade não pode ficar abaixo disso.';
      }
    }
    return null;
  }

  var ROTULOS_PC = {
    condicaoPagamento: 'Condição de pagamento', prazoEntregaDiasUteis: 'Prazo de entrega (dias úteis)',
    dataPrevistaEntrega: 'Entrega prevista', localEntrega: 'Entregar em', 'frete/tipo': 'Frete',
    'frete/valor': 'Valor do frete', valorTotalEstimado: 'Valor total'
  };
  var ROTULOS_ITEM = {
    qtdCotada: 'Quantidade', unidadeCotada: 'Unidade', fatorConversao: 'Conversão',
    precoUnit: 'Preço unitário', qtd: 'A receber (unidade de estoque)'
  };

  function ler(obj, caminho) {
    return caminho.split('/').reduce(function(o, p) { return o == null ? undefined : o[p]; }, obj);
  }
  function igual(a, b) {
    if (a == null && b == null) return true;
    if (typeof a === 'number' || typeof b === 'number') {
      var na = parseFloat(a), nb = parseFloat(b);
      if (isFinite(na) && isFinite(nb)) return Math.abs(na - nb) < LIMIAR;
    }
    return texto(a) === texto(b);
  }

  /* Lista do "de → para", só do que mudou. `mudancas` = {caminhoRelativoAoPC:
     valorNovo}, o mesmo mapa que a tela grava. Campos técnicos (custo
     rateado, carimbos, rota) ficam de fora da lista: a rota tem trilha
     própria (confirmadaPor/Em) e o custo é consequência do preço. */
  function alteracoes(pc, mudancas) {
    var out = [];
    var itensAntes = (pc && pc.itens) || {};
    // Item cancelado nesta edição: uma linha só ("Material cancelado"), sem
    // repetir a queda de quantidade, que é consequência do cancelamento.
    var cancelados = {};
    Object.keys(mudancas || {}).forEach(function(caminho) {
      var m = /^itens\/([^/]+)\/cancelado$/.exec(caminho);
      if (m && mudancas[caminho] === true && !itemCancelado(itensAntes[m[1]])) cancelados[m[1]] = true;
    });
    Object.keys(mudancas || {}).forEach(function(caminho) {
      var novo = /^itens\/([^/]+)$/.exec(caminho);
      if (novo) {
        var obj = mudancas[caminho];
        if (obj && typeof obj === 'object' && !itensAntes[novo[1]]) {
          out.push({
            campo: caminho, rotulo: 'Material adicionado', item: obj.materialCodigo || novo[1], antes: null,
            depois: descreverQtd(obj.qtdCotada != null ? obj.qtdCotada : obj.qtd, obj.unidadeCotada || obj.unidade) +
              (obj.precoUnit != null ? ' × ' + obj.precoUnit : '')
          });
        }
        return;
      }
      var mi = /^itens\/([^/]+)\//.exec(caminho);
      if (mi && cancelados[mi[1]]) {
        if (/\/cancelado$/.test(caminho)) {
          var it = itensAntes[mi[1]] || {};
          var canc = mudancas['itens/' + mi[1] + '/cancelamento'] || {};
          out.push({
            campo: caminho, rotulo: 'Material cancelado', item: it.materialCodigo || mi[1],
            antes: descreverQtd(it.qtdCotada != null ? it.qtdCotada : it.qtd, it.unidadeCotada || it.unidade),
            depois: 'cancelado' + (numero(it.qtdRecebida) > LIMIAR ? ' (fica o recebido: ' + descreverQtd(it.qtdRecebida, it.unidade) + ')' : '') +
              (canc.motivo ? ' — ' + canc.motivo : '')
          });
        }
        return;
      }
      var m = /^itens\/([^/]+)\/(.+)$/.exec(caminho);
      var rotulo, item = null;
      if (m) {
        rotulo = ROTULOS_ITEM[m[2]];
        item = ((pc && pc.itens) || {})[m[1]] || {};
      } else {
        rotulo = ROTULOS_PC[caminho];
      }
      if (!rotulo) return;
      var antes = ler(pc || {}, caminho);
      var depois = mudancas[caminho];
      if (igual(antes, depois)) return;
      out.push({
        campo: caminho, rotulo: rotulo,
        item: item ? (item.materialCodigo || m[1]) : null,
        antes: antes == null ? null : antes, depois: depois == null ? null : depois
      });
    });
    return out;
  }

  function descreverQtd(q, un) {
    var n = numero(q);
    return (Math.round(n * 10000) / 10000) + (un ? ' ' + un : '');
  }

  /* ── Cancelar e adicionar material (18/11) ──
     Pedido do usuário: "opção para cancelar um material, ou adicionar
     material", e "esse material cancelado deve continuar ali no pedido como
     histórico". O item cancelado NÃO sai de `itens/`: ganha `cancelado` e
     `cancelamento` (motivo, quem, quando, quantidades antes) e o saldo a
     receber vira zero. Zerar o saldo pelo próprio `qtd` (= recebido) é o que
     faz recebimento (limite no servidor), MRP, a receber do Financeiro,
     Logística e status do pedido pararem de esperar o material sem cada um
     precisar conhecer o campo novo. O que já chegou continua valendo. */
  function itemCancelado(it) { return !!(it && it.cancelado === true); }
  function saldoItem(it) { return Math.max(0, numero(it && it.qtd) - numero(it && it.qtdRecebida)); }

  function avaliarCancelarItem(pc, itemKey) {
    var it = ((pc && pc.itens) || {})[itemKey];
    if (!it) return 'Item não encontrado no pedido.';
    if (pc.status === 'CANCELADO') return 'O pedido está cancelado: não há material a cancelar.';
    if (itemCancelado(it)) return 'O material ' + (it.materialCodigo || itemKey) + ' já está cancelado.';
    if (saldoItem(it) <= LIMIAR) return 'O material ' + (it.materialCodigo || itemKey) + ' já foi recebido por inteiro: não há saldo a cancelar.';
    return null;
  }

  /* Mudanças (relativas ao item) do cancelamento. Quantidade cotada fica
     proporcional ao recebido, para o valor do pedido refletir só o que
     entrou; as quantidades antes ficam no próprio `cancelamento`. */
  function mudancasCancelarItem(it, dados) {
    dados = dados || {};
    var rec = numero(it.qtdRecebida), qtdAntes = numero(it.qtd);
    var cotAntes = it.qtdCotada != null ? numero(it.qtdCotada) : qtdAntes;
    var cotResidual = qtdAntes > LIMIAR ? Math.round(cotAntes * rec / qtdAntes * 10000) / 10000 : 0;
    return {
      cancelado: true,
      cancelamento: {
        motivo: texto(dados.motivo).slice(0, 500), por: dados.autor || null, porUid: dados.uid || null,
        em: dados.agora || new Date().toISOString(),
        qtdAntes: qtdAntes, qtdCotadaAntes: it.qtdCotada != null ? numero(it.qtdCotada) : null,
        qtdEmUnidadeEstoqueAntes: it.qtdEmUnidadeEstoque != null ? numero(it.qtdEmUnidadeEstoque) : null,
        qtdRecebida: rec
      },
      qtd: rec,
      qtdCotada: cotResidual,
      qtdEmUnidadeEstoque: rec
    };
  }

  var MOTIVO_ITEM_MINIMO = 5;
  function validarMotivoItem(m) {
    return texto(m).length < MOTIVO_ITEM_MINIMO ? 'Diga por que o material foi cancelado (mínimo ' + MOTIVO_ITEM_MINIMO + ' caracteres).' : null;
  }

  /* Item novo. `dados` = {materialCodigo, materialNome, unidade (estoque),
     qtdCotada, unidadeCotada, fatorConversao, qtdEmUnidadeEstoque,
     unidadeDiferente, precoUnit, vinculo, autor, uid, agora, revisao}. */
  function novoItem(dados) {
    dados = dados || {};
    return {
      materialCodigo: texto(dados.materialCodigo), materialNome: texto(dados.materialNome), unidade: texto(dados.unidade),
      qtd: qtdAReceberApos({}, { qtdCotada: dados.qtdCotada, unidadeDiferente: !!dados.unidadeDiferente,
        qtdEmUnidadeEstoque: dados.qtdEmUnidadeEstoque }),
      qtdCotada: dados.qtdCotada != null ? numero(dados.qtdCotada) : null,
      unidadeCotada: dados.unidadeCotada || null,
      fatorConversao: dados.fatorConversao != null ? dados.fatorConversao : null,
      qtdEmUnidadeEstoque: dados.qtdEmUnidadeEstoque != null ? dados.qtdEmUnidadeEstoque : null,
      precoUnit: dados.precoUnit != null ? numero(dados.precoUnit) : null,
      obs: '', qtdRecebida: 0, origemSolicitacaoKey: null,
      vinculo: dados.vinculo || null,
      adicionado: { por: dados.autor || null, porUid: dados.uid || null, em: dados.agora || new Date().toISOString(),
        revisao: dados.revisao != null ? dados.revisao : null }
    };
  }

  /* Vínculo (cliente/pedido) sugerido para o item novo: o do primeiro item
     ativo do pedido. Ajustável depois no botão "Cliente/pedido". */
  function vinculoSugerido(pc) {
    var itens = (pc && pc.itens) || {};
    var ks = Object.keys(itens);
    for (var i = 0; i < ks.length; i++) {
      if (!itemCancelado(itens[ks[i]]) && itens[ks[i]].vinculo) return JSON.parse(JSON.stringify(itens[ks[i]].vinculo));
    }
    return null;
  }

  /* Conferência dos itens novos e do pedido depois da edição. */
  function conferirItens(pc, mudancas) {
    var antes = (pc && pc.itens) || {};
    var novos = Object.keys(mudancas || {}).filter(function(c) { return /^itens\/[^/]+$/.test(c) && !antes[c.slice(6)]; });
    if (novos.length && pc.status === 'CANCELADO') return 'O pedido está cancelado: não dá para adicionar material.';
    for (var i = 0; i < novos.length; i++) {
      var it = mudancas[novos[i]] || {};
      if (!texto(it.materialCodigo)) return 'Escolha o material da linha nova na lista de sugestões.';
      if (!(numero(it.qtdCotada != null ? it.qtdCotada : it.qtd) > 0)) return 'Informe a quantidade do material ' + it.materialCodigo + '.';
    }
    var depois = aplicarMudancas(pc, mudancas).itens || {};
    var ativos = {};
    var dup = null;
    Object.keys(depois).forEach(function(k) {
      var it = depois[k] || {};
      if (itemCancelado(it) || !texto(it.materialCodigo)) return;
      if (ativos[it.materialCodigo] && !dup) dup = it.materialCodigo;
      ativos[it.materialCodigo] = true;
    });
    if (dup) return 'O material ' + dup + ' já está no pedido: altere a quantidade da linha existente em vez de adicionar outra.';
    var temAtivo = Object.keys(ativos).length > 0;
    var temRecebido = Object.keys(depois).some(function(k) { return numero(depois[k].qtdRecebida) > LIMIAR; });
    if (pc.status !== 'CANCELADO' && !temAtivo && !temRecebido) {
      return 'Todos os materiais ficariam cancelados sem nada recebido: isso é cancelar o pedido inteiro (botão Cancelar, administrador).';
    }
    return null;
  }

  /* Monta a revisão a gravar em edicoes/{id}. {erro} se não pode. */
  function montarRevisao(pc, mudancas, dados) {
    dados = dados || {};
    var av = avaliarEdicao(pc, dados.acesso != null ? dados.acesso : dados.papel);
    if (!av.pode) return { erro: av.motivo };
    var ej = validarJustificativa(dados.justificativa);
    if (ej) return { erro: ej };
    var ei = conferirItens(pc, mudancas);
    if (ei) return { erro: ei };
    var lista = alteracoes(pc, mudancas);
    if (!lista.length && !dados.rotaAlterada) return { erro: 'Nada foi alterado no pedido.' };
    var statusApos = statusAposEdicao(aplicarMudancas(pc, mudancas));
    if (statusApos !== (pc.status || null)) {
      lista.push({ campo: 'status', rotulo: 'Status', item: null, antes: pc.status || null, depois: statusApos });
    }
    var revisaoAnterior = numero(pc.revisao);
    return {
      revisao: {
        numero: revisaoAnterior + 1,
        justificativa: texto(dados.justificativa).slice(0, 1000),
        por: dados.autor || null, porUid: dados.uid || null,
        em: dados.agora || new Date().toISOString(),
        statusNoMomento: pc.status || null,
        statusApos: statusApos,
        rotaAlterada: !!dados.rotaAlterada,
        alteracoes: lista
      }
    };
  }

  // Lista de revisões, mais recente primeiro.
  function revisoes(pc) {
    var e = (pc && pc.edicoes) || {};
    return Object.keys(e).map(function(k) { return Object.assign({ id: k }, e[k]); })
      .sort(function(a, b) { return numero(b.numero) - numero(a.numero) || texto(b.em).localeCompare(texto(a.em)); });
  }

  var api = {
    JUSTIFICATIVA_MINIMA: JUSTIFICATIVA_MINIMA,
    avaliarEdicao: avaliarEdicao, aplicarMudancas: aplicarMudancas, statusAposEdicao: statusAposEdicao, validarJustificativa: validarJustificativa,
    qtdAReceberApos: qtdAReceberApos, conferirRecebido: conferirRecebido,
    alteracoes: alteracoes, montarRevisao: montarRevisao, revisoes: revisoes,
    itemCancelado: itemCancelado, saldoItem: saldoItem, avaliarCancelarItem: avaliarCancelarItem,
    mudancasCancelarItem: mudancasCancelarItem, validarMotivoItem: validarMotivoItem,
    novoItem: novoItem, vinculoSugerido: vinculoSugerido, conferirItens: conferirItens
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EdicaoPC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
