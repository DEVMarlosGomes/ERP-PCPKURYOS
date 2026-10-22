/* Campos do ingrediente que são do MATERIAL (AMO-04) — lado do PCP.
 *
 * A MP nova aprovada no P&D chega em solicitacoes_cadastro_material/{k}/campos com
 * estas chaves (crm-frontend/src/lib/ingredienteCampos.js monta). Aqui elas viram os
 * campos do formulário de material do Cadastros. O teste de contrato do CRM
 * (ingredienteCampos.test.js) compara as duas listas.
 * Funções puras, sem DOM nem banco. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IngredienteCampos = factory();
})(typeof self !== 'undefined' ? self : this, function() {
  var CAMPOS_MATERIAL = [
    { chave: 'inci', rotulo: 'INCI' },
    { chave: 'funcao', rotulo: 'Função' },
    { chave: 'fornecedor', rotulo: 'Fornecedor' },
    { chave: 'preco_brl_kg', rotulo: 'Preço R$/kg', numero: true },
    { chave: 'preco_usd_kg', rotulo: 'Preço US$/kg', numero: true }
  ];

  function txt(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(String(v).replace(',', '.'));
    return isFinite(n) && n > 0 ? n : null;
  }
  function fmt(n) { return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 4 }); }

  // Tarefa antiga (antes de 22/10) só tinha inci/fornecedor na raiz: lê dos dois lugares.
  function camposDaSolicitacao(s) {
    var c = (s && s.campos) || {};
    return {
      inci: txt(c.inci || (s && s.inci)),
      funcao: txt(c.funcao),
      fornecedor: txt(c.fornecedor || (s && s.fornecedor)),
      preco_brl_kg: num(c.preco_brl_kg),
      preco_usd_kg: num(c.preco_usd_kg)
    };
  }

  // Campos do material do Cadastros. US$ só tem campo próprio na fragrância (custoTargetUsd);
  // nos demais tipos o preço do P&D vai na linha de referência, para não se perder.
  function paraFormularioMaterial(campos, tipo) {
    var c = campos || {};
    var precos = [];
    if (c.preco_brl_kg != null) precos.push('R$ ' + fmt(c.preco_brl_kg) + '/kg');
    if (c.preco_usd_kg != null) precos.push('US$ ' + fmt(c.preco_usd_kg) + '/kg');
    return {
      inci: txt(c.inci),
      funcaoFormula: tipo === 'MPGR' ? txt(c.funcao) : '',
      custoTargetUsd: tipo === 'MPES' ? c.preco_usd_kg : null,
      custoReferencia: c.preco_brl_kg,
      fornecedorNome: txt(c.fornecedor),
      referenciaPd: precos.length ? 'Preço no P&D: ' + precos.join(' · ') + (c.fornecedor ? ' (' + txt(c.fornecedor) + ')' : '') : ''
    };
  }

  return { CAMPOS_MATERIAL: CAMPOS_MATERIAL, camposDaSolicitacao: camposDaSolicitacao, paraFormularioMaterial: paraFormularioMaterial };
});
