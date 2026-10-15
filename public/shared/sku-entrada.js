/* SKU de entrada do material e fila de cadastro do P&D (PLANO_PD_CRM_AJUSTES.md, Fase 4).

   Pedido do usuário (15/10/2026):
   - Cadastro novo que nasce no P&D cai para o time de cadastro (fila
     solicitacoes_cadastro_material/, aberta quando o cliente aprova a amostra).
   - MPES (fragrância): primeiro o SKU de APROVAÇÃO (amostra do fornecedor); a
     validação só fecha com o SKU FINAL (lote de compra). O de aprovação fica no
     histórico para auditoria.
   - Demais tipos: caixa "Adicionar versão final do SKU de entrada" (opcional).
   - O código interno (mpCodigo, MPES-00012) nasce no cadastro e NUNCA muda com
     as trocas do SKU de entrada — o SKU de entrada é do fornecedor.
   Funções puras: nada aqui lê ou grava no banco. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SkuEntrada = factory();
})(this, function() {
  'use strict';

  var TIPOS_FINAL_OBRIGATORIO = ['MPES'];
  var STATUS_ROTULO = {
    sem_sku: 'Sem SKU de entrada',
    aguardando_final: 'Aguardando SKU final',
    validado: 'Validado (SKU final)',
    aprovacao: 'SKU de entrada informado',
    final: 'SKU final informado'
  };

  function txt(v) { return String(v == null ? '' : v).trim(); }
  function codigoDe(reg) { return reg && typeof reg === 'object' ? txt(reg.codigo) : txt(reg); }

  function exigeFinal(tipo) { return TIPOS_FINAL_OBRIGATORIO.indexOf(tipo) >= 0; }

  function estado(material) {
    var m = material || {};
    var s = m.skusEntrada || {};
    var aprovacao = codigoDe(s.aprovacao);
    var final = codigoDe(s.final);
    var obrigatorio = exigeFinal(m.tipo);
    var status;
    if (!aprovacao && !final) status = 'sem_sku';
    else if (obrigatorio) status = final ? 'validado' : 'aguardando_final';
    else status = final ? 'final' : 'aprovacao';
    return {
      aprovacao: aprovacao, final: final, exigeFinal: obrigatorio, status: status,
      rotulo: STATUS_ROTULO[status], historico: Array.isArray(s.historico) ? s.historico : []
    };
  }

  /* Aplica o que foi digitado no cadastro. entrada = {aprovacao, final, querFinal}.
     Código substituído vai para o histórico (nunca some). */
  function aplicar(atual, entrada, tipo, autor, agora) {
    var antes = (atual && atual.skusEntrada) || {};
    var e = entrada || {};
    var obrigatorio = exigeFinal(tipo);
    var aprovacao = txt(e.aprovacao);
    var final = obrigatorio || e.querFinal ? txt(e.final) : '';
    if (obrigatorio && !aprovacao) {
      return { erro: 'Fragrância (MPES): informe primeiro o SKU de aprovação (código da amostra do fornecedor).' };
    }
    if (!aprovacao && final) {
      return { erro: 'Informe o SKU de aprovação antes do SKU final.' };
    }
    var historico = Array.isArray(antes.historico) ? antes.historico.slice() : [];
    var novo = { historico: historico };
    [['aprovacao', aprovacao], ['final', final]].forEach(function(par) {
      var campo = par[0], codigo = par[1];
      var anterior = antes[campo] && typeof antes[campo] === 'object' ? antes[campo] : null;
      var codAnterior = codigoDe(anterior);
      if (codAnterior && codAnterior !== codigo) {
        historico.push({ campo: campo, codigo: codAnterior, desde: anterior.em || null, ate: agora, por: autor || '' });
      }
      novo[campo] = !codigo ? null
        : (codAnterior === codigo ? anterior : { codigo: codigo, em: agora, por: autor || '' });
    });
    return { skusEntrada: novo };
  }

  /* ── Fila de cadastro que vem do P&D ─────────────────────────────── */

  function pendentes(fila) {
    return Object.keys(fila || {}).map(function(k) { return [k, fila[k]]; })
      .filter(function(e) { return e[1] && e[1].status === 'PENDENTE_CADASTRO'; })
      .sort(function(a, b) { return txt(a[1].criadoEm).localeCompare(txt(b[1].criadoEm)); });
  }

  // O que a tarefa pré-preenche no formulário. Não adivinha o resto.
  function dadosParaFormulario(s) {
    var o = (s && s.origem) || {};
    var partes = ['Do P&D'];
    if (o.projetoNumero || o.projeto) partes.push('projeto ' + [o.projetoNumero, o.projeto].filter(Boolean).join(' '));
    if (o.amostra) partes.push('amostra ' + o.amostra);
    if (o.cliente) partes.push('cliente ' + o.cliente);
    if (o.formulaVersao) partes.push('fórmula v' + o.formulaVersao);
    return {
      tipo: s && s.tipo === 'MPES' ? 'MPES' : 'MPGR',
      nome: txt(s && s.nome),
      inci: txt(s && s.inci),
      fornecedorNome: txt(s && s.fornecedor),
      especificacoes: partes.join(' · ') + '.'
    };
  }

  function fechamento(materialKey, mpCodigo, autor, agora) {
    return { status: 'CADASTRADO', materialKey: materialKey, mpCodigo: mpCodigo, cadastradoEm: agora, cadastradoPor: autor || '' };
  }

  return {
    TIPOS_FINAL_OBRIGATORIO: TIPOS_FINAL_OBRIGATORIO, STATUS_ROTULO: STATUS_ROTULO,
    exigeFinal: exigeFinal, estado: estado, aplicar: aplicar,
    pendentes: pendentes, dadosParaFormulario: dadosParaFormulario, fechamento: fechamento
  };
});
