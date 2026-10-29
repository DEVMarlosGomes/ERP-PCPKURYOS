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

// O fixture cobre todos os perfis do aceite.
['admin', 'pcp', 'gestor', 'qualidade', 'rotulagem', 'logistica', 'comercial', 'pd', 'production', 'rh', 'tv',
  'financeiro', 'controladoria'].forEach((p) => assert.ok(ANTIGO[p], 'fixture sem o perfil ' + p));
assert.deepEqual(Object.keys(ANTIGO).sort(), Object.keys(PERFIS).sort(), 'fixture e perfis andam juntos (regere a fixture)');

let comparados = 0;
Object.keys(PERFIS).forEach((nome) => {
  const user = Object.assign({uid: 'u1', nome: 'Pessoa Teste', email: 't@kuryos.com', modulos: null, funcoes: null}, PERFIS[nome]);
  const novo = linksDoMenu(fonte, PERFIS[nome], fonteNav);
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
  const sobrando = [...setNovo].filter((h) => !setAntigo.has(h));
  assert.deepEqual(sobrando, [], nome + ': link novo que o menu antigo não oferecia');
  const faltando = [...setAntigo].filter((h) => !setNovo.has(h));
  const faltaAceita = faltando.filter((h) => ETAPAS_EXPEDICAO.includes(h) && setNovo.has('expedicao'));
  assert.deepEqual(faltando, faltaAceita, nome + ': link do menu antigo sumiu: ' + faltando.join(' '));
  // Mesmo rótulo, salvo o link que passou a representar as três etapas.
  novo.forEach((l) => {
    if (l.href === 'expedicao') { assert.equal(l.rotulo, 'Expedição de Vendas'); return; }
    assert.equal(l.rotulo, rotuloAntigo[l.href], nome + ': rótulo mudou em ' + l.href);
  });
  comparados++;
});
assert.equal(comparados, Object.keys(PERFIS).length);

// ── Blocos do D-01 e agrupamentos esperados
const menu = (nome, pagina) => linksDoMenu(fonte, PERFIS[nome], fonteNav, pagina);
const doBloco = (links, bloco) => links.filter((l) => l.grupo === bloco);
const rotulos = (links, bloco) => doBloco(links, bloco).map((l) => l.rotulo);

const admin = menu('admin');
assert.deepEqual([...new Set(admin.map((l) => l.grupo))],
  ['Analytics', 'Comercial', 'P&D', 'Pedidos e Rastreio', 'PCP', 'Compras', 'Armazém', 'Operação', 'Qualidade', 'Expedição',
    'Cadastros', 'Financeiro', 'ADM', 'RH', 'Ajuda'], 'admin: blocos na ordem do D-01 (Manutenção sem tela ainda)');
assert.deepEqual(rotulos(admin, 'Analytics'), ['Visão Executiva 360°', 'Indicadores Setoriais', 'Dashboard Diário', 'Dashboard Geral', 'Custos e Resultado', 'Placar da fábrica']);
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
assert.deepEqual(rotulos(admin, 'ADM'), ['Ajustes / Config', 'Usuários']);
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

// ── Item ativo: a etapa da expedição marca o link único; a aba certa no Estoque
assert.deepEqual(menu('logistica', 'faturamento.html').filter((l) => l.ativo).map((l) => l.href), ['expedicao']);
assert.deepEqual(menu('logistica', 'cargas.html').filter((l) => l.ativo).map((l) => l.href), ['expedicao']);
assert.deepEqual(menu('admin', 'proximas_ordens.html?setor=rotulagem').filter((l) => l.ativo).map((l) => l.href), ['proximas_ordens?setor=rotulagem']);
assert.deepEqual(menu('admin', 'crm2.html').filter((l) => l.ativo).map((l) => l.href), ['crm2']);
assert.match(require('./run_navegacao_menu.js').htmlDoMenu(fonte, PERFIS.admin, fonteNav, 'kickoffs.html'), /class="kt-nav-link active" href="kickoffs" aria-current="page"/);

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
