/* Tabela de serviços da cotação (PLANO_PD_CRM_AJUSTES.md, Fase 7).

   Cadastros › Serviços grava em servicos/{key}; a cotação do CRM lê dali e cobra cada
   etapa (envase, rosqueamento, celofane…) pela tabela. Cada serviço:
     unidade de cobrança (un, milheiro, kg de granel, lote), preço R$ (vazio = SEM PREÇO,
     nunca zero — bloqueia o envio da cotação), setup por lote, mínimo por pedido,
     desconto padrão da etapa (%) e histórico de vigência (quem mudou o quê e quando).
   Preço sugerido, nunca inventado: custo-hora da linha ÷ produtividade × (1 + margem).
   A produtividade inicial vem do prodHoraRef dos produtos pelo valor conservador (P25).
   Mesmo cálculo do sugerido em src/lib/cotacao.js do ERP.
   Funções puras: nada aqui lê ou grava no banco. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Servicos = factory();
})(this, function() {
  'use strict';

  var UNIDADES = {
    un: { rotulo: 'por unidade', curto: 'un', produtividade: 'un/h' },
    milheiro: { rotulo: 'por milheiro', curto: 'milheiro', produtividade: 'un/h' },
    kg: { rotulo: 'por kg de granel', curto: 'kg', produtividade: 'kg/h' },
    lote: { rotulo: 'por lote', curto: 'lote', produtividade: 'horas por lote' }
  };
  // Mudou um destes = nova vigência (a cotação em rascunho passa a usar o valor novo).
  var CAMPOS_VIGENCIA = ['unidade', 'preco', 'descontoPct', 'setupLote', 'minimoPedido'];
  var CAMPOS = ['nome', 'unidade', 'preco', 'descontoPct', 'setupLote', 'minimoPedido', 'custoHora', 'produtividade', 'margemPct', 'ativo', 'obs'];

  // Carga inicial: nenhuma proposta da base tem preço de serviço (3 propostas, 0 com valor por
  // etapa), então todos nascem SEM PREÇO. Produtividade do envase = P25 do prodHoraRef
  // (líquidos: 165 produtos, 151 deles perfumaria, mediana 617 un/h; o P25 de 150 un/h são 45
  // perfumes de 50 mL; cremosos: 73 produtos, mediana 639 un/h).
  var SEMENTE = [
    { codigo: 'SRV-001', nome: 'Manipulação de granel', unidade: 'kg' },
    { codigo: 'SRV-002', nome: 'Envase líquido', unidade: 'un', produtividade: 150, obs: 'Produtividade: P25 do prodHoraRef de 165 líquidos (mediana 617 un/h). Os 150 un/h são 45 perfumes de 50 mL; produto que não é perfume costuma rodar a ~600 un/h.' },
    { codigo: 'SRV-003', nome: 'Envase creme/pasta', unidade: 'un', produtividade: 515, obs: 'Produtividade: P25 do prodHoraRef de 73 produtos cremosos (mediana 639 un/h).' },
    { codigo: 'SRV-004', nome: 'Rosqueamento/tampa', unidade: 'un' },
    { codigo: 'SRV-005', nome: 'Rotulagem', unidade: 'un' },
    { codigo: 'SRV-006', nome: 'Celofane/shrink', unidade: 'un' },
    { codigo: 'SRV-007', nome: 'Encartuchamento', unidade: 'un' },
    { codigo: 'SRV-008', nome: 'Montagem de kit/display', unidade: 'un' },
    { codigo: 'SRV-009', nome: 'Codificação de lote/validade', unidade: 'un' },
    { codigo: 'SRV-010', nome: 'Embalagem em caixa master', unidade: 'un' }
  ];

  function txt(v) { return String(v == null ? '' : v).trim(); }
  function num(v) {
    if (v === null || v === undefined || txt(v) === '') return null;
    var n = Number(String(v).replace(',', '.'));
    return isFinite(n) ? n : NaN;
  }
  function r4(n) { return Math.round(n * 10000) / 10000; }

  function normalizar(form) {
    var f = form || {};
    return {
      nome: txt(f.nome), unidade: txt(f.unidade) || 'un',
      preco: num(f.preco), descontoPct: num(f.descontoPct) || 0, setupLote: num(f.setupLote) || 0, minimoPedido: num(f.minimoPedido) || 0,
      custoHora: num(f.custoHora), produtividade: num(f.produtividade), margemPct: num(f.margemPct),
      ativo: f.ativo !== false, obs: txt(f.obs)
    };
  }

  function validar(s) {
    if (!s.nome) return 'Informe o nome do serviço.';
    if (!UNIDADES[s.unidade]) return 'Unidade de cobrança inválida.';
    var invalido = ['preco', 'descontoPct', 'setupLote', 'minimoPedido', 'custoHora', 'produtividade', 'margemPct']
      .filter(function(c) { return typeof s[c] === 'number' && isNaN(s[c]); });
    if (invalido.length) return 'Número inválido em: ' + invalido.join(', ') + '.';
    if (s.preco !== null && !(s.preco > 0)) return 'Preço precisa ser maior que zero — deixe vazio para "SEM PREÇO".';
    if (s.descontoPct < 0 || s.descontoPct > 100) return 'Desconto da etapa entre 0 e 100%.';
    if (s.setupLote < 0 || s.minimoPedido < 0) return 'Setup e mínimo não podem ser negativos.';
    if (s.custoHora !== null && s.custoHora < 0) return 'Custo-hora não pode ser negativo.';
    if (s.produtividade !== null && !(s.produtividade > 0)) return 'Produtividade precisa ser maior que zero (ou vazia).';
    return null;
  }

  function precoSugerido(s) {
    var custoHora = s && s.custoHora > 0 ? s.custoHora : null;
    var prod = s && s.produtividade > 0 ? s.produtividade : null;
    if (!custoHora || !prod) return null;
    var margem = 1 + (Number(s.margemPct) || 0) / 100;
    var base = { un: custoHora / prod, milheiro: custoHora / prod * 1000, kg: custoHora / prod, lote: custoHora * prod }[s.unidade];
    return base === undefined ? null : r4(base * margem);
  }

  function proximoCodigo(servicos) {
    var max = 0;
    Object.keys(servicos || {}).forEach(function(k) {
      var m = /^SRV-(\d+)$/.exec(txt(servicos[k] && servicos[k].codigo));
      if (m) max = Math.max(max, Number(m[1]));
    });
    return 'SRV-' + String(max + 1).padStart(3, '0');
  }

  function igual(a, b) { return (a === undefined ? null : a) === (b === undefined ? null : b); }

  function mudancas(antes, depois) {
    var out = {};
    CAMPOS.forEach(function(c) {
      var a = antes ? antes[c] : null;
      if (c === 'ativo' && antes && a === undefined) a = true;
      if (!igual(a, depois[c])) out[c] = [a === undefined ? null : a, depois[c]];
    });
    return out;
  }

  // Update com caminhos planos (servicos/{key}/campo) — nunca objeto aninhado no update,
  // que no RTDB troca o nó inteiro. Serviço novo nasce num set só.
  function gravacao(key, antes, depois, autor, agora, idHistorico) {
    var base = 'servicos/' + key;
    if (!antes) {
      var novo = {};
      CAMPOS.forEach(function(c) { novo[c] = depois[c]; });
      novo.codigo = depois.codigo; novo.vigenteDesde = agora; novo.criadoEm = agora; novo.criadoPor = autor;
      novo.atualizadoEm = agora; novo.atualizadoPor = autor;
      novo.historico = {}; novo.historico[idHistorico] = { em: agora, por: autor, criado: true };
      var set = {}; set[base] = novo;
      return { mudou: true, update: set };
    }
    var dif = mudancas(antes, depois);
    var campos = Object.keys(dif);
    if (!campos.length) return { mudou: false, update: {} };
    var up = {};
    campos.forEach(function(c) { up[base + '/' + c] = depois[c]; });
    if (campos.some(function(c) { return CAMPOS_VIGENCIA.indexOf(c) >= 0; })) up[base + '/vigenteDesde'] = agora;
    up[base + '/atualizadoEm'] = agora;
    up[base + '/atualizadoPor'] = autor;
    var hist = { em: agora, por: autor, campos: {} };
    campos.forEach(function(c) { hist.campos[c] = { de: dif[c][0], para: dif[c][1] }; });
    up[base + '/historico/' + idHistorico] = hist;
    return { mudou: true, update: up };
  }

  // Serviços da carga inicial, já normalizados (cada um vira gravacao(key, null, s, ...)).
  function semente() {
    return SEMENTE.map(function(s) { return Object.assign(normalizar(s), { codigo: s.codigo }); });
  }

  function rotuloPreco(s) {
    if (!(s && s.preco > 0)) return 'SEM PREÇO';
    var u = UNIDADES[s.unidade] || UNIDADES.un;
    return 'R$ ' + Number(s.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' / ' + u.curto;
  }

  return {
    UNIDADES: UNIDADES, CAMPOS: CAMPOS, CAMPOS_VIGENCIA: CAMPOS_VIGENCIA, SEMENTE: SEMENTE,
    normalizar: normalizar, validar: validar, precoSugerido: precoSugerido, proximoCodigo: proximoCodigo,
    mudancas: mudancas, gravacao: gravacao, semente: semente, rotuloPreco: rotuloPreco
  };
});
