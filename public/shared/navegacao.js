/* Navegação do sistema: UM registro de telas que alimenta o menu lateral
   (29/10/2026, MENU-01 da reunião de 28/10; modelo do registro do Gustavo,
   gcallegaro-kur/PCP-Kuryos, public/shared/navegacao.js).

   Por que existe: o menu era montado à mão em auth_check.js, link a link, cada
   um com a sua condição de módulo -- e a mesma tela aparecia em até quatro
   blocos, com `!temMod(...)` para esconder as repetições. Aqui cada tela é
   declarada UMA vez, com a sua "casa" (o bloco onde mora). Quem pode abrir a
   página (podeAbrirPagina, em auth_check.js) vê o link; ninguém vê o mesmo
   link duas vezes. O menu nunca oferece o que daria "Acesso Negado".

   As condições extras (`q`) reproduzem exatamente as do menu antigo: quem via
   um link continua vendo, quem não via continua sem ver. A regressão está em
   run_navegacao_test.js (fixture do menu antigo, perfil a perfil).

   Módulo puro (sem DOM), UMD: Node (testes) e navegador (window.KuryosNav).
     ctx = {podeAbrir(pagina), temMod(modulo), role, setores: {producao, manipulacao, rotulagem, gestao}} */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KuryosNav = factory();
})(typeof window !== 'undefined' ? window : this, function() {
  'use strict';

  /* Ordem dos blocos (D-01): do cliente até a saída da carga, depois o apoio.
     Manutenção fica na ordem, mas só aparece quando tiver tela neste repo. */
  var BLOCOS = ['Analytics', 'Comercial', 'P&D', 'Pedidos e Rastreio', 'PCP', 'Compras', 'Armazém', 'Operação',
    'Qualidade', 'Expedição', 'Manutenção', 'Cadastros', 'Financeiro', 'ADM', 'RH', 'Ajuda'];

  /* As três etapas da expedição de vendas: a própria tela encadeia as outras
     (shared/cargas-fluxo.js, renderizado em expedicao/faturamento/cargas). */
  var EXPEDICAO = ['expedicao.html', 'faturamento.html', 'cargas.html'];

  /* Telas do CRM/P&D (React): não são arquivos em public/, são rotas que a
     Vercel e o Hosting reescrevem para crm-app.html (vercel.json, firebase.json). */
  var ROTAS_CRM = ['crm1.html', 'crm2.html', 'crm3.html', 'pd.html', 'kickoffs.html', 'contratos.html', 'crm-admin.html'];

  function temAlgum(c, mods) { for (var i = 0; i < mods.length; i++) { if (c.temMod(mods[i])) return true; } return false; }

  /* p: página (o que podeAbrirPagina confere); h: link, quando leva ?aba;
     r: rótulo; i: ícone (ktIcons em auth_check.js);
     b: bloco (texto, ou função do contexto quando a casa depende de quem olha);
     s: subtítulo dentro do bloco; q: condição extra além de poder abrir a página;
     fam: páginas que também marcam este link como ativo;
     o: posição dentro do bloco (número ou função); sem ele vale a ordem do registro. */
  var TELAS = [
    // ── Analytics
    {p: 'dashboard_executivo.html', r: 'Visão Executiva 360°', i: 'dashboard', b: 'Analytics'},
    {p: 'dashboard_setorial.html', r: 'Indicadores Setoriais', i: 'chart', b: 'Analytics'},
    {p: 'dashboard.html', r: 'Dashboard Diário', i: 'dashboard', b: 'Analytics'},
    {p: 'dashboard_analise.html', r: 'Dashboard Geral', i: 'history', b: 'Analytics'},
    {p: 'custos.html', r: 'Custos e Resultado', i: 'chart', b: 'Analytics'},
    {p: 'placar.html', r: 'Placar da fábrica', i: 'dashboard', b: 'Analytics'},

    // ── Comercial › Vendas
    {p: 'comercial.html', r: 'Pedidos e Orçamentos', i: 'list', b: 'Comercial', s: 'Vendas'},
    {p: 'gestao_comercial.html', r: 'Gestão Comercial', i: 'chart', b: 'Comercial', s: 'Vendas'},
    // Devolução de cliente: o Comercial autoriza, a Logística recebe, a Qualidade acompanha.
    {p: 'devolucoes.html', r: 'Devoluções de Cliente', i: 'history',
      b: function(c) { return c.temMod('comercial') ? 'Comercial' : c.temMod('logistica') ? 'Armazém' : 'Qualidade'; },
      s: function(c) { return c.temMod('comercial') ? 'Vendas' : c.temMod('logistica') ? 'Fluxo' : null; },
      o: function(c) { return c.temMod('comercial') ? pos('gestao_comercial.html') + 0.5 : 1000; }},
    // Relatório de Pedido: PCP e Comercial acompanham o mesmo pedido; quem tem
    // Pedidos e MRP o vê no rastreio.
    {p: 'relatorio_pedido.html', r: 'Relatório de Pedido', i: 'chart',
      b: function(c) { return c.temMod('comercial') && !c.temMod('pedidos') ? 'Comercial' : 'Pedidos e Rastreio'; },
      s: function(c) { return c.temMod('comercial') && !c.temMod('pedidos') ? 'Vendas' : null; },
      o: function(c) { return c.temMod('comercial') && !c.temMod('pedidos') ? pos('gestao_comercial.html') + 0.6 : pos('pedidos.html') + 0.5; }},

    // ── Comercial › CRM (React em crm-app.html)
    {p: 'crm1.html', r: 'CRM 1 · Clientes', i: 'people', b: 'Comercial', s: 'CRM'},
    {p: 'crm2.html', r: 'CRM 2 · Projetos', i: 'list', b: 'Comercial', s: 'CRM'},
    {p: 'crm3.html', r: 'CRM 3 · Amostras', i: 'flask', b: 'Comercial', s: 'CRM'},
    // Orçamento aprovado -> Kickoff -> CGI assinado. O CQ (papel qualidade)
    // aprova uma etapa do Kickoff. Página sem módulo: a condição é toda aqui.
    {p: 'kickoffs.html', r: 'Kickoffs', i: 'clipboard', b: 'Comercial', s: 'CRM',
      q: function(c) { return c.temMod('comercial') || c.temMod('pd') || c.role === 'qualidade'; }},
    {p: 'contratos.html', r: 'Contratos CGI', i: 'document', b: 'Comercial', s: 'CRM',
      q: function(c) { return c.temMod('comercial'); }},
    // Painel do ADM para corrigir/remover cards do funil.
    {p: 'crm-admin.html', r: 'Gerenciar cards do CRM', i: 'people', b: 'Comercial', s: 'CRM',
      q: function(c) { return c.role === 'admin'; }},

    // ── P&D
    {p: 'pd.html', r: 'P&D', i: 'flask', b: 'P&D'},

    // ── Pedidos e Rastreio: acompanhar pedido e lote de ponta a ponta
    {p: 'pedidos.html', r: 'Pedidos', i: 'list', b: 'Pedidos e Rastreio'},
    // Dossiê é ferramenta de gestão: PCP (emitir_op) ou Qualidade, nunca o operador.
    {p: 'dossie_lote.html', r: 'Dossiê do Lote', i: 'history', o: 1000,
      b: function(c) { return c.temMod('emitir_op') ? 'Pedidos e Rastreio' : 'Qualidade'; }},
    // Histórico de Apontamentos: o setor que aponta o vê na Operação; a gestão,
    // no rastreio.
    {p: 'historico.html', r: 'Histórico de Apontamentos', i: 'history', o: 1001,
      b: function(c) { return c.setores.producao || c.setores.rotulagem ? 'Operação' : 'Pedidos e Rastreio'; },
      s: function(c) { return c.setores.producao ? 'Produção' : c.setores.rotulagem ? 'Rotulagem' : null; }},

    // ── PCP
    {p: 'planejamento.html', r: 'Planejamento', i: 'calendar', b: 'PCP'},
    {p: 'ops.html', r: 'Controle de OPs', i: 'gear', b: 'PCP'},
    {p: 'emitir_op.html', r: 'Emitir OP', i: 'pencil', b: 'PCP'},
    // Pesagens (PORT-02, porte do Gustavo f2090df): a gestão cobra pelo PCP; a
    // Manipulação vê o seu dia na Operação.
    {p: 'pesagens.html', i: 'flask',
      r: function(c) { return c.temMod('planejamento') || c.temMod('emitir_op') ? 'Pesagens' : 'Pesagens do dia'; },
      b: function(c) { return c.temMod('planejamento') || c.temMod('emitir_op') ? 'PCP' : 'Operação'; },
      s: function(c) { return c.temMod('planejamento') || c.temMod('emitir_op') ? null : 'Manipulação'; },
      o: function(c) { return c.temMod('planejamento') || c.temMod('emitir_op') ? pos('emitir_op.html') + 0.6 : pos('manipulacao.html') + 0.5; }},
    {p: 'insumos.html', r: 'Matriz de Insumos (MRP)', i: 'box', b: 'PCP'},
    // O que comprar: escolhe pedidos e vê o que falta, material a material.
    {p: 'o_que_comprar.html', r: 'O que comprar', i: 'cart',
      b: function(c) { return c.temMod('pedidos') || c.temMod('planejamento') ? 'PCP' : 'Compras'; }},

    // ── Compras
    {p: 'compras.html', r: 'Compras', i: 'cart', b: 'Compras', o: -1},

    // ── Armazém › Estoque
    // Consulta de Estoque (só leitura): no Armazém para quem tem Logística; o
    // PCP e o Compras a acham no próprio bloco.
    {p: 'consulta_estoque.html', r: 'Consulta de Estoque', i: 'warehouse',
      b: function(c) { return c.temMod('logistica') ? 'Armazém' : c.temMod('pedidos') || c.temMod('planejamento') ? 'PCP' : 'Compras'; },
      s: function(c) { return c.temMod('logistica') ? 'Estoque' : null; }},
    {p: 'estoque.html', h: 'estoque.html?tab=agregado', r: 'Estoque', i: 'warehouse', b: 'Armazém', s: 'Estoque'},
    {p: 'estoque.html', h: 'estoque.html?tab=posicoes', r: 'WMS', i: 'warehouse', b: 'Armazém', s: 'Estoque'},
    {p: 'kardex.html', r: 'Kardex', i: 'list', b: 'Armazém', s: 'Estoque'},
    {p: 'movimentar.html', r: 'Movimentar material', i: 'truck', b: 'Armazém', s: 'Estoque'},
    // ── Armazém › Fluxo
    {p: 'logistica.html', r: 'Agendamentos', i: 'truck', b: 'Armazém', s: 'Fluxo'},
    {p: 'proximas_ordens.html', h: 'proximas_ordens.html?setor=separacao', r: 'Próximas Separações', i: 'list', b: 'Armazém', s: 'Fluxo',
      q: function(c) { return c.temMod('logistica'); }},
    {p: 'separacao_materiais.html', r: 'Separação de Materiais', i: 'clipboard', b: 'Armazém', s: 'Fluxo'},
    {p: 'estoque.html', h: 'estoque.html?tab=conferenciapa', r: 'Conferência de PA', i: 'clipboard', b: 'Armazém', s: 'Fluxo'},
    {p: 'descarte.html', r: 'Descarte e Reversa', i: 'clipboard', b: 'Armazém', s: 'Fluxo'},

    // ── Operação: cada setor com a sua fila, a sua tela de trabalho, o seu
    // histórico e o seu estoque (a página mostra só os setores da pessoa).
    {p: 'proximas_ordens.html', h: 'proximas_ordens.html?setor=envase', r: 'Próximas Ordens', i: 'list', b: 'Operação', s: 'Produção',
      q: function(c) { return c.setores.producao; }},
    {p: 'form.html', r: 'Apontamento', i: 'pencil', b: 'Operação',
      s: function(c) { return c.setores.producao ? 'Produção' : 'Rotulagem'; },
      o: function(c) { return c.setores.producao ? pos('form.html') : pos('proximas_ordens.html?setor=rotulagem') + 0.5; },
      q: function(c) { return c.setores.producao || c.setores.rotulagem; }},
    {p: 'estoque_setor.html', h: 'estoque_setor.html?setor=producao', r: 'Estoque da Fábrica', i: 'warehouse', b: 'Operação', s: 'Produção', o: 1001.5,
      q: function(c) { return c.setores.producao; }},
    {p: 'proximas_ordens.html', h: 'proximas_ordens.html?setor=manipulacao', r: 'Próximas Ordens', i: 'list', b: 'Operação', s: 'Manipulação',
      q: function(c) { return c.setores.manipulacao; }},
    {p: 'manipulacao.html', i: 'flask', b: 'Operação', s: 'Manipulação',
      r: function(c) { return c.setores.manipulacao ? 'Pesagem e Manipulação' : 'Conferência de Pesagem'; },
      q: function(c) { return c.setores.manipulacao || c.temMod('conferencia_pesagem'); }},
    {p: 'estoque_setor.html', h: 'estoque_setor.html?setor=manipulacao', r: 'Estoque da Manipulação', i: 'warehouse', b: 'Operação', s: 'Manipulação',
      q: function(c) { return c.setores.manipulacao; }},
    {p: 'proximas_ordens.html', h: 'proximas_ordens.html?setor=rotulagem', r: 'Próximas Ordens', i: 'list', b: 'Operação', s: 'Rotulagem',
      q: function(c) { return c.setores.rotulagem; }},
    {p: 'estoque_setor.html', h: 'estoque_setor.html?setor=rotulagem', r: 'Estoque dos Rótulos', i: 'warehouse', b: 'Operação', s: 'Rotulagem', o: 1002,
      q: function(c) { return c.setores.rotulagem; }},
    // Material em processo (bulk em bombona e sobras): quem opera, quem guarda e quem libera.
    {p: 'material_processo.html', r: 'Material em Processo', i: 'warehouse', b: 'Operação', o: 1003},

    // ── Qualidade
    {p: 'qualidade.html', h: 'qualidade.html?tab=fila', r: 'Fila de Inspeção', i: 'flask', b: 'Qualidade'},
    {p: 'qualidade.html', h: 'qualidade.html?tab=rnc', r: 'Não Conformidades', i: 'alert', b: 'Qualidade'},
    {p: 'qualidade_historico.html', r: 'Histórico e Indicadores', i: 'chart', b: 'Qualidade'},
    {p: 'retrabalhos.html', r: 'Retrabalhos', i: 'history', b: 'Qualidade'},

    // ── Expedição: um link só; a tela encadeia montar carga → faturamento → acompanhamento.
    {p: 'expedicao.html', r: 'Expedição de Vendas', i: 'truck', b: 'Expedição', fam: EXPEDICAO},
    {p: 'relatorio_expedicao.html', r: 'Relatório de Expedição', i: 'clipboard', b: 'Expedição'},

    // ── Cadastros, Financeiro, ADM
    {p: 'cadastros.html', r: 'Cadastros', i: 'tag', b: 'Cadastros'},
    {p: 'financeiro.html', r: 'Financeiro', i: 'bank', b: 'Financeiro'},
    {p: 'controladoria.html', r: 'Controladoria', i: 'scale', b: 'Financeiro'},
    {p: 'admin.html', r: 'Ajustes / Config', i: 'sliders', b: 'ADM'},
    {p: 'usuarios.html', r: 'Usuários', i: 'people', b: 'ADM'},

    // ── RH
    {p: 'rh_dashboard.html', r: 'Dash', i: 'dashboard', b: 'RH'},
    {p: 'rh_cadastros.html', r: 'Colaboradores', i: 'people', b: 'RH'},
    {p: 'rh_avaliacao.html', r: 'Avaliação de Desempenho', i: 'pencil', b: 'RH'},
    {p: 'rh_ferias.html', r: 'Férias', i: 'calendar', b: 'RH'},

    // ── Ajuda: manuais abrem para qualquer autenticado; o módulo só escolhe QUAL oferecer
    {p: 'manuais.html', r: 'Manuais de Operação', i: 'book', b: 'Ajuda'},
    {p: 'manual_apontamento.html', r: 'Apontamento', i: 'book', b: 'Ajuda',
      q: function(c) { return temAlgum(c, ['apontamento', 'rotulagem', 'manipulacao']); }},
    {p: 'manual_pcp.html', r: 'Planejamento e OPs', i: 'book', b: 'Ajuda', q: function(c) { return c.temMod('planejamento'); }},
    {p: 'manual_comercial.html', r: 'Pedidos e MRP', i: 'book', b: 'Ajuda', q: function(c) { return temAlgum(c, ['pedidos', 'comercial']); }},
    {p: 'manual_compras.html', r: 'Compras', i: 'book', b: 'Ajuda', q: function(c) { return c.temMod('compras'); }},
    {p: 'manual_logistica.html', r: 'Recebimento', i: 'book', b: 'Ajuda', q: function(c) { return c.temMod('logistica'); }},
    {p: 'manual_estoque.html', r: 'Estoque e WMS', i: 'book', b: 'Ajuda', q: function(c) { return c.temMod('logistica'); }},
    {p: 'manual_qualidade.html', r: 'Qualidade', i: 'book', b: 'Ajuda', q: function(c) { return c.temMod('qualidade'); }},
    {p: 'manual_cadastros.html', r: 'Cadastros', i: 'book', b: 'Ajuda', q: function(c) { return c.temMod('cadastros'); }},
    {p: 'manual_admin.html', r: 'Administração', i: 'book', b: 'Ajuda', q: function(c) { return c.temMod('usuarios'); }},
    // A referência completa descreve o sistema INTEIRO, inclusive o que a pessoa não acessa.
    {p: 'manual_referencia.html', r: 'Referência do Sistema', i: 'book', b: 'Ajuda'},

    // ── Fase 8 (reunião 28/10/2026), portes do Gustavo -- Dev 3 (PORT-06 a PORT-09).
    // As posições `o` encaixam cada tela no bloco sem reordenar o que já existe.
    {p: 'ativos.html', r: 'Ativos', i: 'gear', b: 'Manutenção'},
    {p: 'manual_ativos.html', r: 'Ativos', i: 'book', b: 'Ajuda', o: function() { return pos('manual_cadastros.html') - 0.5; },
      q: function(c) { return c.temMod('manutencao'); }},
    {p: 'auditoria_5s.html', r: 'Auditoria 5S', i: 'clipboard', b: 'Qualidade', o: function() { return pos('retrabalhos.html') + 0.5; }},
    {p: 'manual_auditoria_5s.html', r: 'Auditoria 5S', i: 'book', b: 'Ajuda', o: function() { return pos('manual_cadastros.html') - 0.6; },
      q: function(c) { return c.temMod('auditoria5s'); }},
    {p: 'rh_temporarios.html', r: 'Temporários', i: 'clipboard', b: 'RH'},
    {p: 'feedback.html', r: 'Feedback da Semana', i: 'pencil', b: 'RH'},
    {p: 'rh_feedback.html', r: 'Feedback e Clima', i: 'chart', b: 'RH'},
    {p: 'manual_temporarios.html', r: 'Temporários', i: 'book', b: 'Ajuda', o: function() { return pos('manual_cadastros.html') - 0.4; },
      q: function(c) { return c.temMod('rh_temporarios'); }},
    {p: 'manual_feedback.html', r: 'Feedback e Clima', i: 'book', b: 'Ajuda', o: function() { return pos('manual_cadastros.html') - 0.3; },
      q: function(c) { return c.temMod('feedback'); }},
    {p: 'backlog.html', r: 'Roadmap do sistema', i: 'list', b: 'ADM'}
  ];

  /* Ícone (ktIcons em auth_check.js) e matiz de cada bloco: azul (--s1) para o
     lado do cliente e do plano, ouro (--s2) para compras, cadastro e gente,
     verde (--s3) para o chão de fábrica; ADM e Ajuda neutros. */
  var AZUL = 's1', OURO = 's2', VERDE = 's3', NEUTRO = 'neutro';
  var VISUAL = {
    'Analytics': ['dashboard', AZUL], 'Comercial': ['chart', AZUL], 'P&D': ['flask', AZUL], 'Pedidos e Rastreio': ['history', AZUL],
    'PCP': ['calendar', AZUL], 'Compras': ['cart', OURO], 'Armazém': ['warehouse', VERDE], 'Operação': ['gear', VERDE],
    'Qualidade': ['flask', VERDE], 'Expedição': ['truck', VERDE], 'Manutenção': ['gear', OURO], 'Cadastros': ['tag', OURO],
    'Financeiro': ['bank', OURO], 'ADM': ['sliders', NEUTRO], 'RH': ['people', OURO], 'Ajuda': ['book', NEUTRO]
  };

  function valor(v, ctx) { return typeof v === 'function' ? v(ctx) : v; }

  /* Posição natural de uma tela no registro (para encaixar as de mais de uma casa). */
  function pos(h) { for (var i = 0; i < TELAS.length; i++) { if ((TELAS[i].h || TELAS[i].p) === h) return i; } return 0; }

  /* Telas visíveis para a pessoa, já agrupadas por bloco (na ordem de BLOCOS) e
     por subtítulo. Um bloco sem nenhuma tela some. */
  function blocos(ctx) {
    var porBloco = {};
    var vistos = {};
    TELAS.forEach(function(t, idx) {
      if (!ctx.podeAbrir(t.p)) return;
      if (t.q && !t.q(ctx)) return;
      var href = t.h || t.p;
      if (vistos[href]) return;
      vistos[href] = true;
      var nome = valor(t.b, ctx);
      (porBloco[nome] = porBloco[nome] || []).push({
        p: t.p, h: href, r: valor(t.r, ctx), i: t.i, s: valor(t.s, ctx) || null, fam: t.fam || null,
        o: t.o !== undefined ? valor(t.o, ctx) : idx
      });
    });
    return BLOCOS.filter(function(n) { return porBloco[n] && porBloco[n].length; }).map(function(n) {
      // Itens do mesmo subtítulo ficam juntos, na ordem em que o subtítulo apareceu;
      // itens sem subtítulo vêm antes dos subtítulos (não ficam "embaixo" do último).
      var itens = porBloco[n].sort(function(a, b) { return a.o - b.o; }), ordem = [], porSub = {};
      itens.forEach(function(it) {
        var k = it.s || '';
        if (!porSub[k]) { porSub[k] = []; ordem.push(k); }
        porSub[k].push(it);
      });
      var lista = [];
      if (porSub['']) porSub[''].forEach(function(it) { lista.push(it); });
      ordem.forEach(function(k) { if (k) porSub[k].forEach(function(it) { lista.push(it); }); });
      return {nome: n, visual: VISUAL[n] || ['list', NEUTRO], itens: lista};
    });
  }

  /* ── Tela Início (MENU-03): o que está esperando por esta pessoa ──
     Cada cartão declara de quais nós do banco precisa (fontes), quem o vê (a
     página de destino precisa abrir + condição extra) e como contar. Quem não
     vê o cartão também não gera a leitura dos dados dele (fontesNecessarias).
     Portados do registro do Gustavo só os cartões cujas fontes existem aqui;
     "Pesagens para cobrar" voltou com a tela (PORT-02); "Inspeção total de
     PA" volta no PORT-03. */
  function contar(no, status) {
    var n = 0;
    Object.keys(no || {}).forEach(function(k) { if ((no[k] || {}).status === status) n++; });
    return n;
  }

  /* Cartão da fila de um setor: quantas OPs esperam e quantas já estão rodando.
     A regra de "está na fila" é a da própria tela Próximas Ordens (SequenciaSetor.etapa). */
  function cartaoFila(id, setor, titulo, icone, q) {
    return {id: id, i: icone, titulo: titulo, pagina: 'proximas_ordens.html', href: 'proximas_ordens.html?setor=' + setor, fontes: ['ops'], q: q,
      calcular: function(d, lib) {
        if (!lib.SequenciaSetor) return null;
        var ctx = {temRotulagem: lib.PerdasEtapa ? function(op) {
          return lib.PerdasEtapa.embalagensDaOp(op, null, null).some(function(i) { return i.tipo === 'Rótulos'; });
        } : null};
        var n = 0, andamento = 0;
        Object.keys(d.ops || {}).forEach(function(k) {
          var e = lib.SequenciaSetor.etapa(setor, d.ops[k], ctx);
          if (!e) return;
          n++;
          if (e.emAndamento) andamento++;
        });
        if (!n) return null;
        return {n: n, tom: 'aviso', texto: andamento ? andamento + ' em andamento · ' + (n - andamento) + ' aguardando' : 'nenhuma iniciada'};
      }};
  }

  var CARTOES = [
    {id: 'pesagens', i: 'flask', titulo: 'Pesagens para cobrar', pagina: 'pesagens.html', fontes: ['ops', 'programacao'],
      q: function(c) { return c.temMod('planejamento') || c.temMod('emitir_op'); },
      calcular: function(d, lib) {
        if (!lib.PesagensDia) return null;
        var r = lib.PesagensDia.pendencias(d.ops, d.programacao, lib.hoje, {ideal: 3, janela: 5});
        if (!r.cobrar) return null;
        var a = r.contagem.ATRASADA || 0, f = r.contagem.FORA_META || 0;
        var partes = [];
        if (a) partes.push(a + ' com envase hoje ou atrasado');
        if (f) partes.push(f + ' fora da meta');
        return {n: r.cobrar, tom: a ? 'alerta' : 'aviso', texto: partes.join(' · ')};
      }},
    // ── Expedição (shared/cargas-pa.js: a mesma contagem da faixa de etapas)
    {id: 'cargas_faturar', i: 'clipboard', titulo: 'Cargas a faturar', pagina: 'faturamento.html', fontes: ['agendamentos_expedicao'],
      calcular: function(d, lib) {
        if (!lib.CargasPA) return null;
        var c = lib.CargasPA.contagem(d.agendamentos_expedicao);
        var n = (c.AGENDADA || 0) + (c.FATURAMENTO_SOLICITADO || 0);
        return n ? {n: n, tom: 'aviso', texto: 'agendadas ou com faturamento solicitado'} : null;
      }},
    {id: 'cargas_carregar', i: 'truck', titulo: 'Cargas para carregar', pagina: 'cargas.html', fontes: ['agendamentos_expedicao'],
      calcular: function(d, lib) {
        if (!lib.CargasPA) return null;
        var c = lib.CargasPA.contagem(d.agendamentos_expedicao);
        var n = (c.FATURADA || 0) + (c.AGUARDANDO_EMBARQUE || 0);
        return n ? {n: n, tom: 'aviso', texto: 'faturadas, aguardando carregamento e saída'} : null;
      }},
    // ── Qualidade
    {id: 'rnc_abertas', i: 'alert', titulo: 'Não conformidades abertas', pagina: 'qualidade.html', href: 'qualidade.html?tab=rnc', fontes: ['nao_conformidades'],
      q: function(c) { return c.temMod('qualidade'); },
      calcular: function(d) {
        var n = contar(d.nao_conformidades, 'ABERTA');
        return n ? {n: n, tom: 'aviso', texto: 'aguardando alguém assumir'} : null;
      }},

    // ── Fila de cada setor (as mesmas "Próximas Ordens", contadas por SequenciaSetor.etapa)
    cartaoFila('fila_separacao', 'separacao', 'OPs para separar', 'list',
      function(c) { return c.temMod('logistica'); }),
    cartaoFila('fila_envase', 'envase', 'OPs na fila do envase', 'list',
      function(c) { return c.setores.producao; }),
    cartaoFila('fila_manipulacao', 'manipulacao', 'Lotes na fila da manipulação', 'flask',
      function(c) { return c.setores.manipulacao; }),
    cartaoFila('fila_rotulagem', 'rotulagem', 'OPs na fila da rotulagem', 'list',
      function(c) { return c.setores.rotulagem; }),

    // ── Compras
    {id: 'sc_aprovar', i: 'cart', titulo: 'Solicitações de compra para aprovar', pagina: 'compras.html', fontes: ['solicitacoes_compra'],
      q: function(c) { return c.temMod('compras'); },
      calcular: function(d) { var n = contar(d.solicitacoes_compra, 'PENDENTE'); return n ? {n: n, tom: 'aviso', texto: 'aguardando aprovação'} : null; }},
    {id: 'sc_cotar', i: 'cart', titulo: 'Solicitações aprovadas para cotar', pagina: 'compras.html', fontes: ['solicitacoes_compra'],
      q: function(c) { return c.temMod('compras'); },
      calcular: function(d) { var n = contar(d.solicitacoes_compra, 'APROVADA'); return n ? {n: n, tom: 'aviso', texto: 'prontas para virar cotação'} : null; }},
    {id: 'pc_enviar', i: 'cart', titulo: 'Pedidos de compra para enviar', pagina: 'compras.html', fontes: ['pedidos_compra'],
      q: function(c) { return c.temMod('compras'); },
      calcular: function(d) { var n = contar(d.pedidos_compra, 'ABERTO'); return n ? {n: n, tom: 'aviso', texto: 'emitidos, ainda não enviados ao fornecedor'} : null; }},
    {id: 'pc_atrasados', i: 'alert', titulo: 'Entregas de compra atrasadas', pagina: 'compras.html', fontes: ['pedidos_compra'],
      q: function(c) { return c.temMod('compras'); },
      calcular: function(d, lib) {
        var n = 0;
        Object.keys(d.pedidos_compra || {}).forEach(function(k) {
          var p = d.pedidos_compra[k] || {}, prev = String(p.dataPrevistaEntrega || '').slice(0, 10);
          if ((p.status === 'ENVIADO' || p.status === 'RECEBIDO_PARCIAL') && prev && prev < lib.hoje) n++;
        });
        return n ? {n: n, tom: 'alerta', texto: 'passaram da data prevista de entrega'} : null;
      }},

    // ── Armazém
    {id: 'devolucoes_receber', i: 'history', titulo: 'Devoluções para receber', pagina: 'devolucoes.html', fontes: ['devolucoes_cliente'],
      q: function(c) { return c.temMod('logistica'); },
      calcular: function(d) { var n = contar(d.devolucoes_cliente, 'AUTORIZADA'); return n ? {n: n, tom: 'aviso', texto: 'autorizadas, aguardando chegada'} : null; }},
    {id: 'descartes', i: 'clipboard', titulo: 'Descartes aguardando decisão', pagina: 'descarte.html', fontes: ['solicitacoes_descarte'],
      calcular: function(d) { var n = contar(d.solicitacoes_descarte, 'SOLICITADO'); return n ? {n: n, tom: 'aviso', texto: 'solicitados, sem decisão'} : null; }}
  ];

  /* Cartões que esta pessoa pode ver (a página de destino abre e a condição extra vale). */
  function cartoesVisiveis(ctx) {
    return CARTOES.filter(function(c) { return ctx.podeAbrir(c.pagina) && (!c.q || c.q(ctx)); });
  }

  /* Nós do banco que os cartões visíveis precisam ler, sem repetir. */
  function fontesNecessarias(cartoes) {
    var vistos = {}, out = [];
    cartoes.forEach(function(c) { c.fontes.forEach(function(f) { if (!vistos[f]) { vistos[f] = true; out.push(f); } }); });
    return out;
  }

  /* Calcula cada cartão; o que não tem pendência não aparece. Um cartão que
     falha também some, sem derrubar a tela -- mas o erro vai para o console
     (nada de catch silencioso). */
  function pendencias(cartoes, dados, lib) {
    var out = [];
    cartoes.forEach(function(c) {
      var r = null;
      try { r = c.calcular(dados, lib || {}); } catch (e) {
        r = null;
        if (typeof console !== 'undefined' && console.error) console.error('Início: o cartão "' + c.titulo + '" falhou ao calcular', e);
      }
      if (r && r.n) out.push({id: c.id, i: c.i, titulo: c.titulo, href: c.href || c.pagina, n: r.n, tom: r.tom, texto: r.texto});
    });
    out.sort(function(a, b) { return (a.tom === 'alerta' ? 0 : 1) - (b.tom === 'alerta' ? 0 : 1); });
    return out;
  }

  return {BLOCOS: BLOCOS, VISUAL: VISUAL, TELAS: TELAS, EXPEDICAO: EXPEDICAO, ROTAS_CRM: ROTAS_CRM, CARTOES: CARTOES, blocos: blocos,
    cartoesVisiveis: cartoesVisiveis, fontesNecessarias: fontesNecessarias, pendencias: pendencias};
});
