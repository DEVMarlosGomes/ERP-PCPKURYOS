'use strict';
/* Navegação: o registro único de telas (public/shared/navegacao.js) que monta o
   menu lateral (MENU-01, reunião de 28/10/2026).
   1. Regressão antigo × novo: para cada perfil, o conjunto de links do menu
      NOVO -- montado pelo renderUnifiedNavbar de verdade, com o registro
      carregado -- é igual ao do menu ANTIGO (fixture gerada do auth_check.js
      de 087dfd7 por run_navegacao_menu.js --fixture). Só muda o agrupamento.
      Única diferença aceita: as etapas Faturamento e Acompanhamento da
      Expedição deixam de ser links próprios e respondem pelo link
      "Expedição de Vendas" (fam), porque a tela encadeia as três
      (shared/cargas-fluxo.js).
   2. Nenhum link duplicado, nenhum link para página negada, blocos na ordem
      do D-01, bloco vazio não aparece.
   3. Toda tela do registro existe (arquivo em public/ ou rota do CRM reescrita
      para crm-app.html).
   A definição de módulos vem do próprio auth_check.js, não de uma cópia. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Nav = require('./public/shared/navegacao.js');
const {PERFIS, linksDoMenu} = require('./run_navegacao_menu.js');
const ANTIGO = require('./run_navegacao_fixture.json');

const fonte = fs.readFileSync('public/auth_check.js', 'utf8');
const fonteNav = fs.readFileSync('public/shared/navegacao.js', 'utf8');

// Trecho puro de acesso (módulos, papéis, podeAbrirPagina) extraído do auth_check.js.
const ini = fonte.indexOf('const KURYOS_MODULOS = {');
const fim = fonte.indexOf('window.KURYOS_MODULOS = KURYOS_MODULOS;');
assert.ok(ini > 0 && fim > ini, 'trecho de módulos não encontrado em auth_check.js');
const acesso = new Function(fonte.slice(ini, fim) +
  '; return {KURYOS_MODULOS, PAGINA_MODULOS, MODULOS_POR_PAPEL, modulosDoUsuario, usuarioTemModulo, podeAbrirPagina, setoresOperacao, homeDoUsuario};')();

const semHtml = (h) => String(h).replace(/\.html(?=$|[?#])/, '');
const paginaDe = (href) => semHtml(href).split('?')[0] + '.html';
const ETAPAS_EXPEDICAO = ['faturamento', 'cargas'];
// Telas portadas na Fase 8 (Dev 3: PORT-06 a PORT-09): os únicos links novos aceitos
// além do menu antigo -- quem tem o módulo passa a vê-los; o resto não muda.
const NOVAS_FASE8 = ['ativos', 'manual_ativos', 'auditoria_5s', 'manual_auditoria_5s', 'rh_temporarios', 'manual_temporarios',
  'feedback', 'rh_feedback', 'manual_feedback', 'backlog', 'pesagens', 'checklists_cq', 'liberacao_linha', 'painel', 'titularidade'];

// O fixture cobre todos os perfis do aceite.
['admin', 'pcp', 'gestor', 'qualidade', 'rotulagem', 'logistica', 'comercial', 'pd', 'production', 'rh', 'tv',
  'financeiro', 'controladoria'].forEach((p) => assert.ok(ANTIGO[p], 'fixture sem o perfil ' + p));
assert.deepEqual(Object.keys(ANTIGO).sort(), Object.keys(PERFIS).sort(), 'fixture e perfis andam juntos (regere a fixture)');

let comparados = 0;
Object.keys(PERFIS).forEach((nome) => {
  const user = Object.assign({uid: 'u1', nome: 'Pessoa Teste', email: 't@kuryos.com', modulos: null, funcoes: null}, PERFIS[nome]);
  const todos = linksDoMenu(fonte, PERFIS[nome], fonteNav);
  // Início (MENU-03) fica fora dos blocos, no topo: o único link que o menu antigo não tinha.
  const inicio = todos.filter((l) => l.href === 'inicio');
  const novo = todos.filter((l) => l.href !== 'inicio');
  const esperaInicio = !['tv', 'pending'].includes(user.role);
  assert.deepEqual(inicio.map((l) => [l.grupo, l.rotulo]), esperaInicio ? [[null, 'Início']] : [], nome + ': Início no topo');
  assert.equal(acesso.homeDoUsuario(user), esperaInicio ? 'inicio.html' : (user.role === 'tv' ? 'placar.html' : 'login.html?status=pending'), nome + ': home');
  const hrefsNovos = novo.map((l) => l.href);

  // ── 2. sem duplicado, sem página negada, blocos conhecidos e na ordem
  assert.equal(new Set(hrefsNovos).size, hrefsNovos.length, nome + ': link repetido no menu: ' + hrefsNovos.join(' '));
  novo.forEach((l) => {
    assert.ok(acesso.podeAbrirPagina(user, paginaDe(l.href)), nome + ': link para página negada ' + l.href);
    assert.ok(Nav.BLOCOS.includes(l.grupo), nome + ': bloco desconhecido ' + l.grupo);
  });
  const blocosVistos = [...new Set(novo.map((l) => l.grupo))];
  assert.deepEqual(blocosVistos, Nav.BLOCOS.filter((b) => blocosVistos.includes(b)), nome + ': blocos fora da ordem do D-01');

  // ── 1. regressão contra o menu antigo
  const antigos = ANTIGO[nome];
  const rotuloAntigo = {};
  antigos.forEach((l) => { rotuloAntigo[l.href] = l.rotulo; });
  const setAntigo = new Set(antigos.map((l) => l.href));
  const setNovo = new Set(hrefsNovos);
  const sobrando = [...setNovo].filter((h) => !setAntigo.has(h) && !NOVAS_FASE8.includes(h));
  assert.deepEqual(sobrando, [], nome + ': link novo que o menu antigo não oferecia');
  const faltando = [...setAntigo].filter((h) => !setNovo.has(h));
  const faltaAceita = faltando.filter((h) => ETAPAS_EXPEDICAO.includes(h) && setNovo.has('expedicao'));
  assert.deepEqual(faltando, faltaAceita, nome + ': link do menu antigo sumiu: ' + faltando.join(' '));
  // Mesmo rótulo, salvo o link que passou a representar as três etapas.
  novo.forEach((l) => {
    if (l.href === 'expedicao') { assert.equal(l.rotulo, 'Expedição de Vendas'); return; }
    if (NOVAS_FASE8.includes(l.href)) return; // tela nova: não havia rótulo antigo
    assert.equal(l.rotulo, rotuloAntigo[l.href], nome + ': rótulo mudou em ' + l.href);
  });
  comparados++;
});
assert.equal(comparados, Object.keys(PERFIS).length);

// ── Blocos do D-01 e agrupamentos esperados
const menu = (nome, pagina) => linksDoMenu(fonte, PERFIS[nome], fonteNav, pagina).filter((l) => l.href !== 'inicio');
const doBloco = (links, bloco) => links.filter((l) => l.grupo === bloco);
const rotulos = (links, bloco) => doBloco(links, bloco).map((l) => l.rotulo);

const admin = menu('admin');
assert.deepEqual([...new Set(admin.map((l) => l.grupo))],
  ['Analytics', 'Comercial', 'P&D', 'Pedidos e Rastreio', 'PCP', 'Compras', 'Armazém', 'Operação', 'Qualidade', 'Expedição',
    'Manutenção', 'Cadastros', 'Financeiro', 'ADM', 'RH', 'Ajuda'], 'admin: blocos na ordem do D-01 (Manutenção com Ativos desde o PORT-06)');
assert.deepEqual(rotulos(admin, 'Manutenção'), ['Ativos'], 'PORT-06: Ativos no bloco Manutenção');
assert.deepEqual(rotulos(menu('rh'), 'RH'), ['Dash', 'Colaboradores', 'Avaliação de Desempenho', 'Férias', 'Temporários', 'Feedback da Semana', 'Feedback e Clima'],
  'PORT-08: RH como no menu do Gustavo');
assert.deepEqual(rotulos(menu('production'), 'RH'), ['Feedback da Semana'], 'PORT-08: todo colaborador com login responde o Feedback da Semana');
assert.ok(!menu('tv').some((l) => l.href === 'feedback'), 'a TV não responde feedback');
const ajudaAdm = rotulos(admin, 'Ajuda');
assert.deepEqual(ajudaAdm.slice(ajudaAdm.indexOf('Qualidade'), ajudaAdm.indexOf('Qualidade') + 6),
  ['Qualidade', 'Auditoria 5S', 'Ativos', 'Temporários', 'Feedback e Clima', 'Cadastros'], 'manuais novos na ordem do Gustavo, entre Qualidade e Cadastros');
assert.deepEqual(rotulos(admin, 'Analytics'), ['Painel de Controle', 'Visão Executiva 360°', 'Indicadores Setoriais', 'Dashboard Diário', 'Dashboard Geral', 'Custos e Resultado', 'Placar da fábrica']);
assert.deepEqual(doBloco(admin, 'Comercial').map((l) => [l.sub, l.rotulo]), [
  ['Vendas', 'Pedidos e Orçamentos'], ['Vendas', 'Gestão Comercial'], ['Vendas', 'Devoluções de Cliente'],
  ['CRM', 'CRM 1 · Clientes'], ['CRM', 'CRM 2 · Projetos'], ['CRM', 'CRM 3 · Amostras'], ['CRM', 'Kickoffs'],
  ['CRM', 'Contratos CGI'], ['CRM', 'Gerenciar cards do CRM']], 'Comercial com subtítulos Vendas e CRM (D-01)');
assert.deepEqual(rotulos(admin, 'P&D'), ['P&D']);
assert.deepEqual(rotulos(admin, 'Financeiro'), ['Financeiro', 'Controladoria']);
assert.deepEqual([...new Set(doBloco(admin, 'Armazém').map((l) => l.sub))], ['Estoque', 'Fluxo'], 'Armazém: Estoque e Fluxo');
assert.deepEqual([...new Set(doBloco(admin, 'Operação').map((l) => l.sub).filter(Boolean))], ['Produção', 'Manipulação', 'Rotulagem']);
assert.deepEqual(rotulos(admin, 'Expedição'), ['Expedição de Vendas', 'Relatório de Expedição']);
assert.deepEqual(rotulos(admin, 'Pedidos e Rastreio'), ['Pedidos', 'Relatório de Pedido', 'Dossiê do Lote']);
assert.deepEqual(rotulos(admin, 'ADM'), ['Ajustes / Config', 'Usuários', 'Roadmap do sistema'], 'PORT-09: Roadmap no ADM');
assert.ok(!admin.some((l) => l.grupo === 'Logística'), 'Logística virou Armazém + Expedição');

const log = menu('logistica');
assert.deepEqual(doBloco(log, 'Armazém').slice(-1).map((l) => [l.sub, l.rotulo]), [['Fluxo', 'Devoluções de Cliente']], 'devolução no Armazém para quem não é Comercial');
assert.deepEqual(rotulos(menu('qualidade'), 'Qualidade').slice(-2), ['Devoluções de Cliente', 'Dossiê do Lote'], 'telas de apoio no fim da Qualidade');
assert.deepEqual(rotulos(menu('comercialPedidos'), 'Pedidos e Rastreio'), ['Pedidos', 'Relatório de Pedido']);
assert.ok(rotulos(menu('comercial'), 'Comercial').includes('Relatório de Pedido'), 'só Comercial: relatório no Comercial');
assert.deepEqual(rotulos(menu('soCompras'), 'Compras'), ['Compras', 'O que comprar', 'Consulta de Estoque']);
const rot = menu('rotulagem');
assert.deepEqual(doBloco(rot, 'Operação').map((l) => [l.sub, l.rotulo]).filter((x) => x[0] === 'Rotulagem'),
  [['Rotulagem', 'Próximas Ordens'], ['Rotulagem', 'Apontamento'], ['Rotulagem', 'Histórico de Apontamentos'], ['Rotulagem', 'Estoque dos Rótulos']]);
assert.equal(rotulos(menu('soConferencia'), 'Operação')[0], 'Conferência de Pesagem');
assert.deepEqual([...new Set(menu('pending').map((l) => l.grupo))], ['Ajuda'], 'conta pendente só vê os manuais');

// ── Fase 8: telas portadas no lugar certo
assert.deepEqual(rotulos(menu('pcp'), 'PCP').slice(0, 4), ['Planejamento', 'Controle de OPs', 'Emitir OP', 'Pesagens'], 'PORT-02: Pesagens logo depois de Emitir OP');
assert.deepEqual(doBloco(menu('soManipulacao'), 'Operação').filter((l) => l.rotulo === 'Pesagens do dia').map((l) => l.sub), ['Manipulação'], 'PORT-02: a Manipulação vê o seu dia');
assert.ok(!menu('rotulagem').some((l) => l.href === 'pesagens'), 'rotulagem não vê Pesagens');
assert.ok(Nav.cartoesVisiveis({podeAbrir: (pg) => acesso.podeAbrirPagina(PERFIS.production, pg), temMod: (m) => acesso.usuarioTemModulo(PERFIS.production, m), role: 'production', setores: acesso.setoresOperacao(PERFIS.production)}).some((c) => c.id === 'pesagens'), 'PORT-02: cartão Pesagens para quem planeja');

// ── Item ativo: a etapa da expedição marca o link único; a aba certa no Estoque
assert.deepEqual(menu('logistica', 'faturamento.html').filter((l) => l.ativo).map((l) => l.href), ['expedicao']);
assert.deepEqual(menu('logistica', 'cargas.html').filter((l) => l.ativo).map((l) => l.href), ['expedicao']);
assert.deepEqual(menu('admin', 'proximas_ordens.html?setor=rotulagem').filter((l) => l.ativo).map((l) => l.href), ['proximas_ordens?setor=rotulagem']);
assert.deepEqual(menu('admin', 'crm2.html').filter((l) => l.ativo).map((l) => l.href), ['crm2']);
assert.match(require('./run_navegacao_menu.js').htmlDoMenu(fonte, PERFIS.admin, fonteNav, 'kickoffs.html'), /class="kt-nav-link active" href="kickoffs" aria-current="page"/);

// ── Início: item ativo no topo do menu quando a tela é o Início
assert.deepEqual(linksDoMenu(fonte, PERFIS.logistica, fonteNav, 'inicio.html').filter((l) => l.ativo).map((l) => l.href), ['inicio']);

// ── Cartões da tela Início (MENU-03): quem vê o quê, e só lê o que precisa
const SequenciaSetor = require('./public/shared/sequencia-setor.js');
const PerdasEtapa = require('./public/shared/perdas-etapa.js');
const CargasPA = require('./public/shared/cargas-pa.js');
const ctxDe = (user) => ({podeAbrir: (pg) => acesso.podeAbrirPagina(user, pg), temMod: (m) => acesso.usuarioTemModulo(user, m),
  role: user.role, setores: acesso.setoresOperacao(user)});
const cartoesDe = (nome) => Nav.cartoesVisiveis(ctxDe(PERFIS[nome])).map((c) => c.id);
assert.deepEqual(cartoesDe('logistica').sort(), ['cargas_carregar', 'cargas_faturar', 'descartes', 'devolucoes_receber', 'fila_separacao']);
assert.deepEqual(cartoesDe('rotulagem'), ['fila_rotulagem']);
assert.deepEqual(cartoesDe('soCompras').sort(), ['pc_atrasados', 'pc_enviar', 'sc_aprovar', 'sc_cotar']);
assert.deepEqual(cartoesDe('soManipulacao'), ['fila_manipulacao']);
assert.deepEqual(cartoesDe('qualidade'), ['rnc_abertas']);
assert.deepEqual(cartoesDe('tv'), [], 'TV não tem cartão');
assert.deepEqual(cartoesDe('comercial'), [], 'Comercial não tem cartão (ainda)');
assert.deepEqual(Nav.fontesNecessarias(Nav.cartoesVisiveis(ctxDe(PERFIS.logistica))), ['agendamentos_expedicao', 'ops', 'devolucoes_cliente', 'solicitacoes_descarte'],
  'logística só lê o que os seus cartões usam');
assert.deepEqual(Nav.fontesNecessarias(Nav.cartoesVisiveis(ctxDe(PERFIS.qualidade))), ['nao_conformidades'], 'qualidade não lê ops nem compras');
// Todo cartão leva a uma tela do registro e só aparece para quem a abre.
Object.keys(PERFIS).forEach((nome) => {
  const user = PERFIS[nome];
  Nav.cartoesVisiveis(ctxDe(user)).forEach((c) => assert.ok(acesso.podeAbrirPagina(user, c.pagina), nome + ': cartão para página negada ' + c.id));
});
Nav.CARTOES.forEach((c) => assert.ok(fs.existsSync('public/' + c.pagina), 'cartão para tela inexistente: ' + c.id));
// Contagem com dados de verdade.
const lib = {CargasPA, SequenciaSetor, PerdasEtapa, hoje: '2026-10-27', agora: new Date('2026-10-27T12:00:00Z').getTime()};
const dados = {
  ops: {
    '10-1': {status: 'Programado', lote: '10/01', produto: 'F', qtdPlanejada: 100, formulaVersao: 'F1__v1'},
    '11-1': {status: 'Em Produção', lote: '11/01', produto: 'G', qtdPlanejada: 100, produzidoLinha: 40, abertaDesde: '2026-10-27T07:00:00', separacaoConcluida: true},
    '12-1': {status: 'Concluído', lote: '12/01', produto: 'H', qtdPlanejada: 10, produzidoLinha: 10}
  },
  agendamentos_expedicao: {a1: {status: 'AGENDADA'}, a2: {status: 'AGENDADA'}},
  nao_conformidades: {n1: {status: 'ABERTA'}, n2: {status: 'FECHADA'}, n3: {status: 'ABERTA'}},
  solicitacoes_compra: {s1: {status: 'PENDENTE'}, s2: {status: 'APROVADA'}, s3: {status: 'APROVADA'}, s4: {status: 'REJEITADA'}},
  pedidos_compra: {
    p1: {status: 'ABERTO'}, p2: {status: 'ENVIADO', dataPrevistaEntrega: '2026-10-20'},
    p3: {status: 'RECEBIDO_PARCIAL', dataPrevistaEntrega: '2026-10-26T00:00:00Z'},
    p4: {status: 'ENVIADO', dataPrevistaEntrega: '2026-10-30'}, p5: {status: 'RECEBIDO_TOTAL', dataPrevistaEntrega: '2026-10-01'}
  },
  devolucoes_cliente: {d1: {status: 'AUTORIZADA'}, d2: {status: 'RECEBIDA'}},
  solicitacoes_descarte: {x1: {status: 'SOLICITADO'}, x2: {status: 'CONCLUIDO'}}
};
const todosCartoes = Nav.pendencias(Nav.CARTOES, dados, lib);
const porId = Object.fromEntries(todosCartoes.map((p) => [p.id, p]));
assert.equal(todosCartoes[0].tom, 'alerta', 'alertas vêm primeiro');
assert.equal(porId.pc_atrasados.n, 2, 'só ENVIADO/RECEBIDO_PARCIAL com data vencida');
assert.equal(porId.rnc_abertas.n, 2); assert.equal(porId.rnc_abertas.href, 'qualidade.html?tab=rnc');
assert.equal(porId.cargas_faturar.n, 2); assert.ok(!porId.cargas_carregar, 'cartão sem pendência não aparece');
assert.equal(porId.sc_aprovar.n, 1); assert.equal(porId.sc_cotar.n, 2); assert.equal(porId.pc_enviar.n, 1);
assert.equal(porId.devolucoes_receber.n, 1); assert.equal(porId.descartes.n, 1);
assert.equal(porId.fila_separacao.n, 1, 'só a OP ativa sem separação concluída');
assert.equal(porId.fila_envase.n, 2); assert.match(porId.fila_envase.texto, /1 em andamento · 1 aguardando/);
assert.equal(porId.fila_manipulacao.n, 1, 'manipulação: OP com fórmula e sem fase iniciada');
assert.ok(!porId.fila_rotulagem, 'sem OP com rótulo, sem cartão');
assert.deepEqual(Nav.pendencias(Nav.CARTOES, {}, lib), [], 'sem dados nenhum cartão aparece nem quebra');
const errOriginal = console.error; console.error = () => {};
assert.deepEqual(Nav.pendencias([{id: 'x', titulo: 'x', pagina: 'x', fontes: [], calcular() { throw new Error('boom'); }}], {}, lib), [], 'cartão que falha some sem derrubar a tela');
console.error = errOriginal;

// ── 3. Toda tela do registro existe
const rotasCrm = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).rewrites
  .filter((r) => /^\/crm-app/.test(r.destination)).map((r) => r.source.replace(/^\//, '') + '.html');
Nav.ROTAS_CRM.forEach((p) => assert.ok(rotasCrm.includes(p), 'rota do CRM sem reescrita na Vercel: ' + p));
Nav.TELAS.forEach((t) => assert.ok(fs.existsSync('public/' + t.p) || Nav.ROTAS_CRM.includes(t.p), 'tela inexistente no registro: ' + t.p));
Nav.TELAS.forEach((t) => {
  const b = typeof t.b === 'function' ? null : t.b;
  if (b) assert.ok(Nav.BLOCOS.includes(b), 'bloco desconhecido no registro: ' + b);
});
Nav.BLOCOS.forEach((b) => assert.ok(Nav.VISUAL[b], 'bloco sem identidade visual: ' + b));
assert.deepEqual(Nav.TELAS.find((t) => t.p === 'expedicao.html').fam, ['expedicao.html', 'faturamento.html', 'cargas.html']);

// ── Ligações: auth_check carrega o registro e monta o menu por ele; o acesso não mudou
assert.match(fonte, /shared\/navegacao\.js/);
assert.match(fonte, /KuryosNav\.blocos\(navCtx\)/);
assert.ok(!/const analisesGroup|const logisticaGroup/.test(fonte), 'montagem manual removida');

console.log('OK run_navegacao_test: ' + comparados + ' perfis com o mesmo conjunto de links do menu antigo (só reagrupado), sem duplicado nem página negada; blocos do D-01; registro só com telas que existem.');
