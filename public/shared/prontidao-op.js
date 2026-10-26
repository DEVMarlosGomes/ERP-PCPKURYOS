/* Prontidão para emitir OP (PCP-02, PROMPT_ENGENHARIA_PACOTE_20261021.md). Função única que a tela
 * de emissão usa (emitir_op.html) e que o CRM pode reaproveitar.
 *
 * Checklist:
 *  1. orçamento aprovado;                       ┐ só para SKU nascida no CRM (origemCrm):
 *  2. SKU gerada e CGI assinado;                │ o legado não tem esses registros
 *  3. Kickoff aprovado (congelado);             ┘
 *  4. Fórmula e BOM sem item pendente de cadastro;
 *  5. Fórmula, BOM e Especificação aprovadas;
 *  6. insumos: só AVISO — o saldo de estoque não serve para decidir até o Dia D (CLAUDE.md).
 * Virada segura (decisão do pacote): trava dura para SKU do CRM; legado continua com aviso, como
 * era, até a medição mostrar que travar não para a fábrica.
 * Função pura. */
(function (root) {
  'use strict';

  var APROVADA = 'APROVADA';

  // ctx = { produto, formula, bom, especificacao, pendentesFormula, pendentesBom }
  function prontidaoOp(ctx) {
    var c = ctx || {};
    var p = c.produto || {};
    var oc = p.origemCrm || null;
    var crm = !!oc;
    var itens = [];
    var item = function (chave, rotulo, ok, onde, soCrm) {
      itens.push({ chave: chave, rotulo: rotulo, ok: !!ok, onde: onde || '', aplica: !soCrm || crm });
    };
    item('orcamento', 'Orçamento aprovado pelo cliente', !crm || !!(oc.orcamentoId || oc.cgiContratoId), 'CRM › Orçamentos', true);
    item('cgi', 'SKU gerada e CGI assinado', !crm || oc.origem_contratual_status === 'cgi_assinado', 'CRM › Contratos (assinar o CGI)', true);
    // CGI só é gerado com Kickoff aprovado; SKU nascida no orçamento grava o status do Kickoff.
    item('kickoff', 'Kickoff aprovado (congelado)', !crm || oc.kickoffStatus === 'aprovado' || !!oc.cgiContratoId, 'CRM › Kickoff', true);
    // KO-09 (25/10/2026): "ir para produção com SKU completo" — o cadastro da SKU nascida no CRM
    // precisa dos dados que a OP e a expedição usam.
    var faltaSku = [];
    if (!(parseFloat(p.volume) > 0) || !p.unidadeVolume) faltaSku.push('volume e unidade');
    if (!(parseInt(p.prazoValidadeMeses, 10) > 0)) faltaSku.push('validade');
    if (!(parseFloat(p.densidadeGranel) > 0)) faltaSku.push('densidade');
    if (!(parseInt(p.unCx, 10) > 0)) faltaSku.push('Un./Cx');
    if (!(parseFloat(p.kgCaixa) > 0)) faltaSku.push('kg/caixa');
    item('sku', 'Cadastro da SKU completo' + (faltaSku.length ? ' (falta: ' + faltaSku.join(', ') + ')' : ''), !crm || !faltaSku.length,
      'Cadastros › Produtos (Identificação, Parâmetros de Lote e Embalagem)', true);
    var pend = (c.pendentesFormula || 0) + (c.pendentesBom || 0);
    item('cadastro', 'Fórmula e BOM sem item pendente de cadastro' + (pend ? ' (' + pend + ' pendente' + (pend > 1 ? 's' : '') + ')' : ''), !pend,
      'Cadastros › Fórmulas / BOM (escolher o material do item pendente)');
    var falta = [];
    if (!c.formula || c.formula.status !== APROVADA) falta.push('Fórmula');
    if (!c.bom || c.bom.status !== APROVADA) falta.push('BOM');
    if (!c.especificacao || c.especificacao.status !== APROVADA) falta.push('Especificação');
    item('aprovacoes', 'Fórmula, BOM e Especificação aprovadas' + (falta.length ? ' (falta: ' + falta.join(', ') + ')' : ''), !falta.length,
      'Cadastros › Fórmulas / BOM / Especificações');
    var abertos = itens.filter(function (i) { return i.aplica && !i.ok; });
    return {
      crm: crm,
      itens: itens,
      faltando: abertos.map(function (i) { return i.chave; }),
      pode: !crm || !abertos.length,           // trava dura só para SKU do CRM
      aviso: !crm && abertos.length > 0,         // legado: emite com aviso
      avisoInsumos: 'Disponibilidade de insumos: confira com Compras — o saldo de estoque ainda não serve para decidir até o Dia D.',
    };
  }

  var api = { prontidaoOp: prontidaoOp };
  root.ProntidaoOp = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
