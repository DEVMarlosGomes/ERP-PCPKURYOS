/* Pedido comercial puxando do CRM (pedido do usuário, 17/10/2026):
   - contatos do pedido vêm do CRM quando o cadastro mestre do cliente ainda não tem contato;
   - produto que nasceu no CRM (produtos/{sku}/origemCrm) traz quantidade e valor unitário da
     cotação aprovada (crm_propostas), editáveis; sem cotação, do rascunho do pedido do CRM.
   Funções puras: nada aqui lê ou grava no banco. Formato dos contatos = ContatosCliente.lista. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CrmParaPedido = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function txt(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : null; }

  // Cliente do CRM ligado ao cadastro mestre (cadastro_cliente_id) ou, sem vínculo, pelo nome.
  function clienteCrmDe(crmClientes, chaveMestre, nomeMestre) {
    var lista = Object.keys(crmClientes || {}).map(function(k) { return crmClientes[k]; }).filter(Boolean);
    var porChave = lista.find(function(c) { return chaveMestre && c.cadastro_cliente_id === chaveMestre; });
    if (porChave) return porChave;
    var nome = txt(nomeMestre).toLowerCase();
    return nome ? lista.find(function(c) { return txt(c.nome_empresa).toLowerCase() === nome; }) || null : null;
  }

  function contatosDoCrm(crmCliente) {
    if (!crmCliente) return [];
    var base = [crmCliente.contato_principal].concat(Array.isArray(crmCliente.contatos_adicionais) ? crmCliente.contatos_adicionais : []);
    return base.map(function(c, i) {
      if (!c || !(txt(c.nome) || txt(c.email) || txt(c.whatsapp) || txt(c.telefone))) return null;
      var cargo = txt(c.cargo_custom) || txt(c.cargo);
      return {
        id: i === 0 ? 'crm_principal' : 'crm_' + i,
        nome: txt(c.nome), email: txt(c.email), telefone: txt(c.whatsapp) || txt(c.telefone),
        areas: ['COMERCIAL'], principais: i === 0 ? ['COMERCIAL'] : [], outraArea: '',
        observacoes: 'Do CRM' + (cargo ? ' · ' + cargo : '') + (c.decisor ? ' · decisor' : ''), doCrm: true
      };
    }).filter(Boolean);
  }

  // Cadastro mestre manda; CRM só entra quando o cadastro está sem contato.
  function contatosDoPedido(listaMestre, crmCliente) {
    return listaMestre && listaMestre.length ? listaMestre : contatosDoCrm(crmCliente);
  }

  function valoresDoCrm(produto, propostas, pedidosComerciais) {
    var o = (produto && produto.origemCrm) || {};
    if (!o.projetoId) return null;
    var sku = txt(produto.sku);
    var acha = function(itens, campoSku, campoVar) {
      return (itens || []).find(function(i) { return i && sku && txt(i[campoSku]) === sku; })
        || (itens || []).find(function(i) { return i && o.variacaoId && i[campoVar] === o.variacaoId; })
        || ((itens || []).length === 1 ? itens[0] : null);
    };
    var proposta = Object.keys(propostas || {}).map(function(k) { return propostas[k]; })
      .find(function(p) { return p && p.projeto_id === o.projetoId; });
    var item = proposta ? acha(proposta.items_pedido, 'codigo_kuryos', 'variacao_id') : null;
    if (item && (num(item.qtd) || num(item.valor_unitario))) {
      return { qtd: num(item.qtd), valor: num(item.valor_unitario), origem: 'cotação do CRM' + (proposta.status === 'enviado' ? ' (enviada)' : '') };
    }
    var rascunho = Object.keys(pedidosComerciais || {}).map(function(k) { return pedidosComerciais[k]; })
      .find(function(p) { return p && p.origemCrm && p.origemCrm.projetoId === o.projetoId && p.status !== 'CANCELADO'; });
    var it = rascunho ? acha(rascunho.itens, 'sku', 'variacaoId') : null;
    if (it && (num(it.qtd) || num(it.valorUnitario))) return { qtd: num(it.qtd), valor: num(it.valorUnitario), origem: 'pedido do CRM ' + (rascunho.numeroFormatado || '') };
    return null;
  }

  return { clienteCrmDe: clienteCrmDe, contatosDoCrm: contatosDoCrm, contatosDoPedido: contatosDoPedido, valoresDoCrm: valoresDoCrm };
});
