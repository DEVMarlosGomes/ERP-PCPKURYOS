/* Amostras de MP (11/11/2026) — lógica pura da aba em cadastros.html.
   Spec: docs/superpowers/specs/2026-11-11-amostras-mp-design.md. Quem grava é o servidor
   (functions/amostras_mp.js, callable amostraMp); aqui só se decide o que mostrar.
   As constantes são cópia deliberada das do servidor (contrato em run_amostras_mp_tela_test.js).
     hojeBrasilia(date), atrasada(a, hoje), filtrar(lista, filtros), aReceber(lista, hoje),
     aguardandoHomologacao(lista), papel(usuario), acoesVisiveis(a, papel), abasVisiveis(papel),
     nomeMaterial(a) */
(function(raiz) {
  var STATUS = {SOLICITADA: 'Solicitada', RECEBIDA: 'Recebida', HOMOLOGADA: 'Homologada', REPROVADA: 'Reprovada', CANCELADA: 'Cancelada'};
  var TIPOS = {NOVA: 'Nova matéria-prima', CADASTRADA: 'Matéria-prima já cadastrada'};
  var MOTIVOS = {HOMOLOGAR_FORNECEDOR: 'Homologar novo fornecedor', REPOSICAO: 'Reposição', AMOSTRA_CLIENTE: 'Amostra para cliente', DESENVOLVIMENTO: 'Desenvolvimento interno'};
  var FORMAS = {CORREIO: 'Correio', TRANSPORTADORA: 'Transportadora', MOTOBOY: 'Motoboy'};
  var UNIDADES = {g: 'g', kg: 'kg'};
  var TODAS_ABAS = ['materiais', 'produtos', 'formulas', 'categorias', 'clientes', 'fornecedores', 'servicos', 'amostras'];

  function hojeBrasilia(d) { return (d || new Date()).toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'}); }
  function diaBrasilia(iso) { return iso ? hojeBrasilia(new Date(iso)) : ''; }
  function atrasada(a, hoje) { return !!a && a.status === 'SOLICITADA' && !!a.previsaoChegada && a.previsaoChegada < hoje; }

  function filtrar(lista, f) {
    f = f || {};
    return (lista || []).filter(function(a) {
      if (f.status && a.status !== f.status) return false;
      if (f.tipo && a.tipo !== f.tipo) return false;
      if (f.motivo && a.motivo !== f.motivo) return false;
      if (f.fornecedorKey && (!a.fornecedor || a.fornecedor.key !== f.fornecedorKey)) return false;
      var dia = diaBrasilia(a.solicitante && a.solicitante.em);
      if (f.de && dia < f.de) return false;
      if (f.ate && dia > f.ate) return false;
      return true;
    });
  }
  function aReceber(lista) {
    return (lista || []).filter(function(a) { return a.status === 'SOLICITADA'; })
      .sort(function(x, y) { return String(x.previsaoChegada || '9999').localeCompare(String(y.previsaoChegada || '9999')); });
  }
  function aguardandoHomologacao(lista) {
    var em = function(a) { return String((a.recebimento && a.recebimento.em) || ''); };
    return (lista || []).filter(function(a) { return a.status === 'RECEBIDA'; })
      .sort(function(x, y) { return em(x).localeCompare(em(y)); });
  }

  /* P&D e logística como no servidor (papel OU módulo); Cadastros pelo módulo gravado ou, sem
     módulos gravados, pelo papel (admin/pcp) — o mesmo padrão de auth_check.js. */
  function papel(u) {
    u = u || {};
    var mod = u.modulos || null;
    var funcoes = u.funcoes || {};
    var admin = u.role === 'admin' || funcoes.admin === true;
    return {
      // A role é só a função principal. Para usuários multi-função
      // (como Comercial + P&D), `funcoes` também precisa decidir os botões.
      pd: u.role === 'pd' || funcoes.pd === true || !!(mod && mod.pd === true),
      logistica: u.role === 'logistica' || funcoes.logistica === true || !!(mod && mod.logistica === true),
      admin: admin,
      cadastros: admin || (mod ? mod.cadastros === true : u.role === 'pcp'),
    };
  }
  function acoesVisiveis(a, p) {
    var out = [];
    if (!a || !p) return out;
    if (a.status === 'SOLICITADA') {
      if (p.pd || p.admin) out.push('EDITAR', 'CANCELAR');
      if (p.logistica || p.admin) out.push('RECEBER');
    } else if (a.status === 'RECEBIDA' && (p.pd || p.admin)) {
      out.push('HOMOLOGAR', 'REPROVAR');
    }
    return out;
  }
  function abasVisiveis(p) {
    if (!p) return [];
    if (p.admin || p.cadastros) return TODAS_ABAS.slice();
    if (p.pd) return ['amostras', 'fornecedores'];
    // Só o módulo amostras_mp (ex.: Qualidade marcada pelo ADM): só a aba, para ler. Nunca "todas".
    return ['amostras'];
  }
  function nomeMaterial(a) {
    if (!a) return '';
    if (a.tipo === 'NOVA') return ((a.materialNovo && a.materialNovo.nome) || '') + ' (nova)';
    var m = a.material || {};
    return (m.codigo || '') + ' — ' + (m.nome || '');
  }

  var api = {STATUS: STATUS, TIPOS: TIPOS, MOTIVOS: MOTIVOS, FORMAS: FORMAS, UNIDADES: UNIDADES,
    hojeBrasilia: hojeBrasilia, atrasada: atrasada, filtrar: filtrar, aReceber: aReceber,
    aguardandoHomologacao: aguardandoHomologacao, papel: papel, acoesVisiveis: acoesVisiveis,
    abasVisiveis: abasVisiveis, nomeMaterial: nomeMaterial};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.AmostrasMp = api;
})(typeof window !== 'undefined' ? window : globalThis);
