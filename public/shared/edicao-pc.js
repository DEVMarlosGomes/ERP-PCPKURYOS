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
    Object.keys(mudancas || {}).forEach(function(caminho) {
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

  /* Monta a revisão a gravar em edicoes/{id}. {erro} se não pode. */
  function montarRevisao(pc, mudancas, dados) {
    dados = dados || {};
    var av = avaliarEdicao(pc, dados.acesso != null ? dados.acesso : dados.papel);
    if (!av.pode) return { erro: av.motivo };
    var ej = validarJustificativa(dados.justificativa);
    if (ej) return { erro: ej };
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
    alteracoes: alteracoes, montarRevisao: montarRevisao, revisoes: revisoes
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EdicaoPC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
