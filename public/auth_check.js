// --- Cloud Functions fora do Firebase (site na Vercel, funções no Render) ---
// No Firebase Hosting (prod-kuryos.web.app etc.) e no preview local, nada muda:
// as funções seguem nas Cloud Functions do projeto. Em qualquer outro domínio
// (Vercel), firebase.functions() passa a chamar o servidor do Render, que roda o
// mesmo functions/index.js (functions/render-server.js). Resolvido na hora da
// chamada, porque as páginas inicializam o Firebase depois deste script.
var KURYOS_FUNCTIONS_ORIGIN = 'https://pcp-kuryos-functions.onrender.com';
(function() {
  var host = location.hostname;
  // *.test é o domínio reservado dos testes automatizados (Firebase simulado).
  var noFirebase = !/\.(web\.app|firebaseapp\.com|test)$/.test(host) && !/^(localhost|127\.|.*\.nip\.io$)/.test(host);
  if (!noFirebase || typeof firebase === 'undefined' || typeof firebase.functions !== 'function' || typeof firebase.app !== 'function') return;
  var original = firebase.functions;
  var desviado = function(app) { return (app || firebase.app()).functions(KURYOS_FUNCTIONS_ORIGIN); };
  Object.keys(original).forEach(function(k) { desviado[k] = original[k]; });
  firebase.functions = desviado;
})();

// --- Leituras únicas esperam o login ser restaurado ---
// Ao abrir uma página, o Firebase leva alguns instantes para restaurar a sessão
// (IndexedDB). Leitura com .once()/.get() disparada nesse intervalo vai sem
// usuário e o banco nega ("permission_denied", ex.: "Erro ao recalcular
// Prod/hora" no Cadastros). dbOnValue (shared/utils.js) já tenta de novo; as
// leituras únicas não tinham isso. Aqui elas esperam a primeira resposta do
// Auth (com ou sem usuário) — depois disso seguem direto, sem atraso.
(function() {
  if (typeof firebase === 'undefined' || !firebase.database || !firebase.database.Query) return;
  var proto = firebase.database.Query.prototype;
  var authResolvido = null;
  function esperarAuth() {
    if (authResolvido) return authResolvido;
    authResolvido = new Promise(function(resolve) {
      try {
        var parar = firebase.auth().onAuthStateChanged(function() { parar(); resolve(); });
      } catch (e) { resolve(); }
    });
    return authResolvido;
  }
  function precisaEsperar() {
    try { return firebase.apps.length > 0 && typeof firebase.auth === 'function' && !firebase.auth().currentUser; }
    catch (e) { return false; }
  }
  // Mesmo com o usuário já restaurado, a conexão do banco recebe o token um
  // instante depois: leitura nesse intervalo volta permission_denied. Com
  // usuário logado, tenta de novo (3x, como dbOnValue) antes de devolver o erro.
  function comRetentativa(executar) {
    function tentar(restantes) {
      return executar().catch(function(err) {
        var negado = /permission[_ ]denied/i.test(String((err && (err.code || err.message)) || ''));
        var logado = false;
        try { logado = !!firebase.auth().currentUser; } catch (e) {}
        if (!negado || !logado || restantes <= 0) throw err;
        return new Promise(function(r) { setTimeout(r, 700); }).then(function() { return tentar(restantes - 1); });
      });
    }
    return (precisaEsperar() ? esperarAuth() : Promise.resolve()).then(function() { return tentar(3); });
  }
  var onceOriginal = proto.once;
  if (typeof onceOriginal === 'function') {
    // once(evento, sucesso?, falha|contexto?, contexto?) — com callbacks, eles
    // passam a ser chamados a partir da promessa com retentativa.
    proto.once = function(evento, sucesso, falhaOuContexto, contexto) {
      var self = this;
      var falha = typeof falhaOuContexto === 'function' ? falhaOuContexto : null;
      var ctx = falha ? contexto : falhaOuContexto;
      var p = comRetentativa(function() { return onceOriginal.call(self, evento); });
      if (typeof sucesso !== 'function') return p;
      return p.then(function(snap) { sucesso.call(ctx, snap); return snap; }, function(err) {
        if (falha) { falha.call(ctx, err); return undefined; }
        throw err;
      });
    };
  }
  var getOriginal = proto.get;
  if (typeof getOriginal === 'function') {
    proto.get = function() { var self = this; return comRetentativa(function() { return getOriginal.call(self); }); };
  }
})();

// --- Preferência manual de tema (claro/escuro/automático) ---
// Aplicado já no topo do script, antes de qualquer outra coisa, pra não
// piscar o tema errado (o CSS já está linkado no <head> antes deste script).
(function() {
  try {
    var saved = localStorage.getItem('kuryos-theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) {}
})();

function kuryosThemeState() {
  var saved = null;
  try { saved = localStorage.getItem('kuryos-theme'); } catch (e) {}
  return (saved === 'light' || saved === 'dark') ? saved : 'auto';
}

function kuryosThemeIcon(state) {
  return typeof kuryosThemeIconSvg === 'function' ? kuryosThemeIconSvg(state) : '';
}

function kuryosThemeLabel(state) {
  if (state === 'light') return 'Tema: Claro — clique para Escuro';
  if (state === 'dark') return 'Tema: Escuro — clique para Automático (segue o sistema)';
  return 'Tema: Automático (segue o sistema) — clique para Claro';
}

window.cycleKuryosTheme = function() {
  var state = kuryosThemeState();
  var next = state === 'auto' ? 'light' : (state === 'light' ? 'dark' : 'auto');
  try {
    if (next === 'auto') localStorage.removeItem('kuryos-theme');
    else localStorage.setItem('kuryos-theme', next);
  } catch (e) {}
  if (next === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', next);
  var btn = document.getElementById('kt-theme-toggle');
  if (btn) {
    btn.textContent = kuryosThemeIcon(next);
    btn.title = kuryosThemeLabel(next);
  }
};

// Mantém o tema do shell legado e o tema do React rigorosamente sincronizados.
function applyKuryosTheme(state) {
  var effective = state === 'auto'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : state;
  if (state === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', state);
  document.documentElement.classList.toggle('dark', effective === 'dark');
  document.documentElement.dataset.effectiveTheme = effective;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = effective === 'dark' ? '#000000' : '#f5f5f7';
}

function kuryosThemeIconSvg(state) {
  if (state === 'light') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>';
  if (state === 'dark') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/></svg>';
}

window.cycleKuryosTheme = function() {
  var state = kuryosThemeState();
  var next = state === 'auto' ? 'light' : (state === 'light' ? 'dark' : 'auto');
  try {
    if (next === 'auto') localStorage.removeItem('kuryos-theme');
    else localStorage.setItem('kuryos-theme', next);
  } catch (e) {}
  applyKuryosTheme(next);
  var btn = document.getElementById('kt-theme-toggle');
  if (btn) {
    btn.innerHTML = kuryosThemeIconSvg(next);
    btn.title = kuryosThemeLabel(next);
  }
};

applyKuryosTheme(kuryosThemeState());
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    if (kuryosThemeState() === 'auto') applyKuryosTheme('auto');
  });
}

// --- Perfis de Acesso Permitidos por Página ---
// 'pcp' (novo, pedido do usuário): vê tudo do PCP -- mesmo acesso de
// página que 'admin' sempre teve nas páginas de produção/planejamento/
// cadastros/compras/logística -- só NÃO entra em nenhuma página de RH.
// 'admin' virou o papel "vê literalmente tudo, sem exceção" -- ganhou
// acesso às páginas de RH também (ver grupo rh_* abaixo), que antes eram
// só de 'rh'/'gestor'.
// Regra permanente (pedido do usuário): onde quer que 'production' apareça
// abaixo, 'pcp' entra junto -- PCP precisa sempre ter acesso a tudo que é
// "produção", nunca menos que o operador de chão de fábrica. As regras de
// escrita em database.rules.json já seguem esse mesmo padrão em todo lugar;
// aqui só faltava form.html (Apontamento/Registro de Produção).
// ══════════════════════════════════════════════════════════════════════
// MÓDULOS DE ACESSO — a fonte ÚNICA de "quem vê o quê"
//
// Antes, acesso era um papel só por pessoa, com a lista de páginas fixa no
// código: mudar o alcance de alguém exigia deploy. Agora o ADM marca módulos
// por usuário direto na tela de Usuários (pedido do usuário: "é possível
// adicionar quais módulos incluo dentro deles, via checkbox? isso é uma
// função exclusiva de admin").
//
// O PAPEL NÃO MORREU -- ele virou o PADRÃO. Quem não tem `modulos` gravado
// (que hoje é todo mundo: os 10 usuários em produção) continua com
// exatamente o alcance que o papel sempre deu, sem nenhuma mudança. A
// marcação individual só passa a valer quando o ADM salva pela primeira vez.
// Sem esse fallback, publicar isto trancaria a fábrica inteira pra fora do
// sistema na manhã seguinte.
//
// Os módulos foram recortados pra que CADA papel de hoje seja exatamente a
// união de alguns deles -- por isso `apontamento` é só form.html (rotulagem
// não vê histórico) e `historico.html` mora em `planejamento` (produção vê).
// Isso é verificado por teste contra os 10 usuários reais.
const KURYOS_MODULOS = {
  analytics:    { rotulo: 'Dashboards',            desc: 'Visão Executiva, Dashboard Diário e análises setoriais',
                  paginas: ['dashboard_executivo.html', 'dashboard_setorial.html', 'dashboard.html', 'dashboard_analise.html'] },
  // OPERAÇÃO (23/09): o chão de fábrica em três setores, um checkbox cada --
  // pedido do usuário: "Produção (apontamento, histórico, estoque WMS da
  // fábrica); Manipulação (pesagem, manipulação e estoque da manipulação);
  // Rotulagem (apontamentos e estoque da sala de rótulos)". A chave
  // `apontamento` continua sendo a da Produção de propósito: as regras do
  // banco e os `modulos` já gravados usam esse nome.
  apontamento:  { rotulo: 'Operação — Produção',   desc: 'Apontamento das linhas, histórico e estoque da fábrica',
                  paginas: ['form.html', 'historico.html', 'estoque_setor.html', 'proximas_ordens.html', 'material_processo.html', 'liberacao_linha.html'] },
  manipulacao:  { rotulo: 'Operação — Manipulação', desc: 'Pesagem, manipulação do bulk e estoque da manipulação',
                  paginas: ['manipulacao.html', 'pesagens.html', 'estoque_setor.html', 'proximas_ordens.html', 'material_processo.html'] },
  rotulagem:    { rotulo: 'Operação — Rotulagem',  desc: 'Apontamento da rotulagem, histórico e estoque da sala de rótulos',
                  paginas: ['form.html', 'historico.html', 'estoque_setor.html', 'proximas_ordens.html', 'material_processo.html'] },
  // Quem pode conferir a pesagem enquanto a chave "Conferência de Pesagem"
  // (Ajustes) estiver ligada -- Qualidade e P&D. Dá acesso só à tela da
  // Manipulação; conferir é a única ação que a tela oferece a quem só tem isto.
  conferencia_pesagem: { rotulo: 'Conferência de Pesagem', desc: 'Qualidade/P&D: conferir a pesagem antes da manipulação',
                  paginas: ['manipulacao.html', 'pesagens.html'] },
  planejamento: { rotulo: 'Planejamento e OPs',    desc: 'Programação, controle de OPs e histórico de apontamentos',
                  paginas: ['planejamento.html', 'horizonte.html', 'ops.html', 'pesagens.html', 'historico.html', 'proximas_ordens.html', 'material_processo.html', 'consulta_estoque.html', 'o_que_comprar.html'] },
  emitir_op:    { rotulo: 'Emitir OP',             desc: 'Criar a ordem de produção que a fábrica executa',
                  paginas: ['emitir_op.html', 'dossie_lote.html', 'pesagens.html'] },
  comercial:    { rotulo: 'Comercial',             desc: 'Orçamentos, pedidos, CRM e desenvolvimento',
                  paginas: ['comercial.html', 'gestao_comercial.html', 'crm1.html', 'crm2.html', 'crm3.html', 'pd.html', 'crm-admin.html', 'devolucoes.html', 'relatorio_pedido.html'] },
  // P&D (14/10/2026): função própria, separada do Comercial (que continua vendo
  // o P&D). Kickoffs/Contratos ficam fora do mapa -- o CRM decide por função.
  pd:           { rotulo: 'P&D',                   desc: 'Pipeline de desenvolvimento, fórmulas, homologação e Kickoff',
                  paginas: ['pd.html'] },
  pedidos:      { rotulo: 'Pedidos e MRP',         desc: 'Backlog de produção e Matriz de Insumos',
                  paginas: ['pedidos.html', 'insumos.html', 'relatorio_pedido.html', 'consulta_estoque.html', 'o_que_comprar.html'] },
  cadastros:    { rotulo: 'Cadastros',             desc: 'Produtos, materiais, clientes, fórmulas e BOM',
                  paginas: ['cadastros.html'] },  // produtos/materiais/clientes/formulas.html foram
                  // aposentados em 23/09: eram só redirecionamentos para as abas de cadastros.html
  compras:      { rotulo: 'Compras',               desc: 'Solicitações, cotações e pedidos de compra',
                  paginas: ['compras.html', 'consulta_estoque.html', 'o_que_comprar.html'] },
  logistica:    { rotulo: 'Logística e Estoque',   desc: 'Agendamentos, Estoque/WMS e Separação de Materiais',
                  paginas: ['logistica.html', 'movimentar.html', 'expedicao.html', 'faturamento.html', 'cargas.html', 'relatorio_expedicao.html', 'estoque.html', 'consulta_estoque.html', 'kardex.html', 'separacao_materiais.html', 'descarte.html', 'devolucoes.html', 'proximas_ordens.html', 'material_processo.html'] },
  qualidade:    { rotulo: 'Qualidade',             desc: 'Liberação de lotes, não conformidades e fornecedores',
                  paginas: ['qualidade.html', 'qualidade_historico.html', 'dossie_lote.html', 'retrabalhos.html', 'devolucoes.html', 'material_processo.html', 'checklists_cq.html', 'liberacao_linha.html'] },
  config:       { rotulo: 'Ajustes / Configuração',desc: 'Metas, parâmetros e listas do sistema',
                  paginas: ['admin.html'] },
  usuarios:     { rotulo: 'Gestão de Usuários',    desc: 'Ver a lista de usuários do sistema',
                  paginas: ['usuarios.html'] },
  rh:           { rotulo: 'RH — Pessoas',          desc: 'Colaboradores, avaliação de desempenho e férias',
                  paginas: ['rh_cadastros.html', 'rh_avaliacao.html', 'rh_ferias.html'] },
  rh_dashboard: { rotulo: 'RH — Dashboard',        desc: 'Indicadores de RH (dado sensível)',
                  paginas: ['rh_dashboard.html'] },
  // Custos e Resultado (26/10/2026, PLANO_CUSTOS_RESULTADO.md): R$ e LP só a
  // diretoria. Padrão só do ADM; o ADM pode marcar para quem for diretoria (não
  // existe papel Diretoria -- as regras do banco leem este mesmo módulo).
  custos:       { rotulo: 'Custos e Resultado',    desc: 'LP, custo padrão e realizado, pontos e bônus (dado sensível: diretoria)',
                  paginas: ['custos.html'] },
  // Placar da fábrica: só totais de pontos × meta, sem R$, sem produto, sem nomes.
  placar:       { rotulo: 'Placar da fábrica',     desc: 'Pontos do dia × meta, para a TV e para a fábrica (só totais)',
                  paginas: ['placar.html'] },
  // Financeiro e Controladoria (28/10/2026, PROMPT_FINANCEIRO.md e PROMPT_CONTROLADORIA.md):
  // padrão só do ADM; o ADM marca para quem opera. As regras do banco leem estes módulos.
  financeiro:   { rotulo: 'Financeiro',            desc: 'Contas a pagar e a receber, bancos, conciliação e fluxo de caixa (dado sensível)',
                  paginas: ['financeiro.html'] },
  controladoria:{ rotulo: 'Controladoria',         desc: 'Razão gerencial, DRE, rentabilidade, orçamento e fechamento do mês (dado sensível)',
                  paginas: ['controladoria.html'] },
  // ── Fase 8 (reunião 28/10/2026), portes do repositório do Gustavo -- Dev 3 (PORT-06 a PORT-09).
  // Manutenção › Ativos (PORT-06): o cadastro que a Qualidade, a Operação e o Kickoff (KO-13) consomem.
  manutencao:   { rotulo: 'Manutenção — Ativos',   desc: 'Cadastro de máquinas e equipamentos (reatores, linhas, instrumentos) usado pelos outros módulos',
                  paginas: ['ativos.html'] },
  // Auditoria 5S (PORT-07): checklist do líder, auditoria da Qualidade e inspeção da Diretoria.
  auditoria5s:  { rotulo: 'Auditoria 5S',        desc: 'Checklist do líder, auditoria da Qualidade e inspeção da Diretoria (5S)',
                  paginas: ['auditoria_5s.html'] },
  // RH (PORT-08): Feedback da Semana é de todo colaborador com login; o painel e os Temporários, do RH Central.
  feedback:     { rotulo: 'Feedback da Semana',     desc: 'Avaliar colegas e líder e responder a pesquisa de clima (o colaborador não vê resultado)',
                  paginas: ['feedback.html'] },
  rh_feedback:  { rotulo: 'RH — Feedback e Clima',  desc: 'Dashboard, pendências, recados e configuração do Feedback e Clima (só RH Central e administrador)',
                  paginas: ['rh_feedback.html'] },
  rh_temporarios: { rotulo: 'RH — Temporários',    desc: 'Convocação e pagamento semanal dos temporários (só RH Central e administrador; CPF e Pix)',
                  paginas: ['rh_temporarios.html'] },
  // Roadmap do sistema (PORT-09): checklist gerado do MELHORIAS_FUTURAS.md. Fora do padrão de qualquer papel:
  // só o admin e quem o ADM marcar.
  backlog:      { rotulo: 'Roadmap do sistema', desc: 'Checklist automático do que ainda falta implementar, do que depende da Kuryos e das decisões pendentes',
                  paginas: ['backlog.html'] },
  // Painel de Controle (PORT-01, porte do Gustavo e3ddcd0): filas, idade e SLA por etapa e por
  // setor. Fora de MODULOS_POR_PAPEL: o ADM marca quem acompanha (visão de gestão).
  painel:       { rotulo: 'Painel de Controle', desc: 'Filas, idade e atraso de cada etapa do fluxo, por setor, com a cobrança pronta (visão de gestão)',
                  paginas: ['painel.html'] }
};

// Padrão por papel. Reproduz EXATAMENTE o alcance que cada papel tinha antes
// desta mudança -- é o contrato que o teste de regressão verifica usuário a
// usuário. 'admin' é '*': vê tudo sempre, e nunca pode ser trancado pra fora.
const MODULOS_POR_PAPEL = {
  admin: '*',
  pcp: ['analytics', 'apontamento', 'manipulacao', 'rotulagem', 'planejamento', 'emitir_op', 'comercial', 'pedidos', 'cadastros',
        'compras', 'logistica', 'qualidade', 'config', 'usuarios', 'placar'],
  production: ['analytics', 'apontamento', 'manipulacao', 'rotulagem', 'planejamento', 'placar'],
  rotulagem: ['rotulagem', 'placar'],
  logistica: ['logistica', 'placar'],
  qualidade: ['qualidade', 'conferencia_pesagem', 'placar'],
  // TV da fábrica (26/10/2026): login próprio que só abre o placar.
  tv: ['placar'],
  rh: ['rh', 'rh_dashboard'],
  gestor: ['rh'],
  comercial: ['comercial'],
  pd: ['pd'],
  pending: []
};
// PORT-08 (Fase 8, Dev 3), acréscimo ao padrão por papel, como no repositório do Gustavo:
// o Feedback da Semana é de todo colaborador com login (a TV e a conta pendente não respondem);
// o RH Central ganha Temporários e o painel do Feedback e Clima.
['pcp', 'production', 'rotulagem', 'logistica', 'qualidade', 'rh', 'gestor', 'comercial', 'pd'].forEach(function(papel) {
  if (MODULOS_POR_PAPEL[papel].indexOf('feedback') < 0) MODULOS_POR_PAPEL[papel].push('feedback');
});
MODULOS_POR_PAPEL.rh.push('rh_temporarios', 'rh_feedback');

// página -> lista de módulos que a liberam (derivada, nunca digitada duas
// vezes). Página fora deste mapa é liberada pra qualquer autenticado -- é o
// caso dos manuais, material de treinamento sem restrição.
const PAGINA_MODULOS = (function() {
  const mapa = {};
  Object.keys(KURYOS_MODULOS).forEach(function(mod) {
    KURYOS_MODULOS[mod].paginas.forEach(function(pg) {
      (mapa[pg] = mapa[pg] || []).push(mod);
    });
  });
  return mapa;
})();

// Módulos efetivos de um usuário: o que o ADM marcou; se nunca marcou, o
// padrão do papel. `admin` recebe tudo, sempre -- é a trava contra o ADM
// desmarcar a própria gestão de usuários e ninguém mais conseguir entrar.
// Funções (14/10/2026): o usuário pode ter mais de uma. `role` segue sendo a
// principal (é a que o resto do sistema e as regras do banco leem); `funcoes`
// guarda todas. O padrão de módulos é a SOMA dos padrões de cada função.
function funcoesDoUsuario(user) {
  if (!user) return [];
  const extras = Object.keys(user.funcoes || {}).filter(function(f) { return user.funcoes[f] === true; });
  return [user.role].concat(extras).filter(function(f, i, all) { return f && all.indexOf(f) === i; });
}
function modulosPadraoDasFuncoes(user) {
  const out = [];
  const funcoes = funcoesDoUsuario(user);
  for (let i = 0; i < funcoes.length; i++) {
    const padrao = MODULOS_POR_PAPEL[funcoes[i]];
    if (padrao === '*') return Object.keys(KURYOS_MODULOS);
    (padrao || []).forEach(function(m) { if (out.indexOf(m) < 0) out.push(m); });
  }
  return out;
}

function modulosDoUsuario(user) {
  if (!user) return [];
  if (user.role === 'admin' || (user.funcoes && user.funcoes.admin === true)) return Object.keys(KURYOS_MODULOS);
  // Módulos gravados pela tela de Usuários a partir das funções (não é
  // personalização): seguem o padrão atual das funções.
  if (user.modulosDasFuncoes === true) return modulosPadraoDasFuncoes(user);
  const marcados = user.modulos;
  if (marcados && typeof marcados === 'object') {
    const ativos = Object.keys(marcados).filter(function(m) {
      return marcados[m] === true && KURYOS_MODULOS[m];
    });
    // Marcação feita antes da Operação existir (23/09): `apontamento` valia
    // pelo apontamento inteiro E pela Manipulação. Chave ausente (nunca
    // salva) herda de `apontamento`; `false` gravado é escolha do ADM.
    if (marcados.apontamento === true) {
      ['manipulacao', 'rotulagem'].forEach(function(m) {
        if (!(m in marcados) && ativos.indexOf(m) < 0) ativos.push(m);
      });
    }
    // Objeto existente porém vazio é uma escolha do ADM ("este usuário não
    // acessa nada"), não um dado faltando -- respeitamos.
    return ativos;
  }
  return modulosPadraoDasFuncoes(user);
}
function usuarioTemModulo(user, modulo) {
  return modulosDoUsuario(user).indexOf(modulo) !== -1;
}
// Setores da Operação que a pessoa enxerga. Gestão (planejamento) vê os
// três -- é quem acompanha a fábrica inteira; o operador vê só o seu.
function setoresOperacao(user) {
  const tem = function(m) { return usuarioTemModulo(user, m); };
  const gestao = !!user && (user.role === 'admin' || user.role === 'pcp' || tem('planejamento'));
  return {
    producao: tem('apontamento'), manipulacao: tem('manipulacao'), rotulagem: tem('rotulagem'),
    gestao: gestao
  };
}
// Conferir a pesagem com a chave ligada: Qualidade ou P&D. O admin NÃO entra
// aqui só por ver tudo -- ele tem a liberação com motivo, que fica registrada
// como tal; conferir é de quem foi marcado para isso.
function podeConferirPesagem(user) {
  if (!user) return false;
  if (user.role === 'qualidade' && !(user.modulos && typeof user.modulos === 'object')) return true;
  return !!(user.modulos && user.modulos.conferencia_pesagem === true);
}
// Editar/excluir apontamento: só o PCP (pedido do usuário, 23/09). O setor
// consulta os próprios apontamentos, sem editar.
function podeEditarApontamentos(user) {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'pcp' || usuarioTemModulo(user, 'emitir_op');
}
// A pessoa pode abrir esta página?
function podeAbrirPagina(user, pagina) {
  const exigidos = PAGINA_MODULOS[pagina];
  if (!exigidos) return true; // sem regra = liberada (manuais)
  const meus = modulosDoUsuario(user);
  return exigidos.some(function(m) { return meus.indexOf(m) !== -1; });
}
// Primeira página que a pessoa consegue abrir -- usada como "home" e como
// destino de um Acesso Negado. Sem isto, mandar alguém pra dashboard.html
// (que ele também não acessa) trocaria um Acesso Negado por outro, em loop.
// Início (29/10/2026, D-02 da reunião de 28/10): primeiro da fila. Abre para
// qualquer autenticado (fora de PAGINA_MODULOS, como os manuais) porque só
// mostra o que a pessoa já abre: atalhos do registro de telas e cartões cuja
// página de destino ela acessa. A TV da fábrica (papel tv) segue no placar.
const ORDEM_HOME = ['inicio.html', 'dashboard_executivo.html', 'dashboard.html', 'form.html', 'qualidade.html', 'manipulacao.html', 'planejamento.html',
                    'logistica.html', 'comercial.html', 'pd.html', 'compras.html', 'cadastros.html', 'pedidos.html',
                    'rh_dashboard.html', 'rh_avaliacao.html', 'placar.html', 'financeiro.html', 'controladoria.html'];
function temInicio(user) { return !!user && user.role !== 'tv' && user.role !== 'pending'; }
function homeDoUsuario(user) {
  for (var i = 0; i < ORDEM_HOME.length; i++) {
    if (ORDEM_HOME[i] === 'inicio.html' && !temInicio(user)) continue;
    if (podeAbrirPagina(user, ORDEM_HOME[i])) return ORDEM_HOME[i];
  }
  return 'login.html?status=pending';
}
// Exposto pra usuarios.html montar os checkboxes a partir da MESMA definição.
window.KURYOS_MODULOS = KURYOS_MODULOS;
window.MODULOS_POR_PAPEL = MODULOS_POR_PAPEL;
window.modulosDoUsuario = modulosDoUsuario;
window.funcoesDoUsuario = funcoesDoUsuario;
window.modulosPadraoDasFuncoes = modulosPadraoDasFuncoes;
window.usuarioTemModulo = usuarioTemModulo;
window.podeAbrirPagina = podeAbrirPagina;
window.homeDoUsuario = homeDoUsuario;
window.setoresOperacao = setoresOperacao;
window.podeConferirPesagem = podeConferirPesagem;
window.podeEditarApontamentos = podeEditarApontamentos;

// Extrai o nome da página atual
// URLs limpas (14/10/2026): /dashboard e /dashboard.html são a mesma página.
// O acesso por módulo (PAGINA_MODULOS) e o menu comparam pelo nome com .html,
// então o caminho sem extensão é normalizado aqui — senão a página viraria
// "sem regra = liberada".
function getActivePageName() {
  const path = window.location.pathname;
  var nome = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
  if (nome.indexOf('.') < 0) nome += '.html';
  return nome;
}
// "comercial.html?tab=x" -> "comercial?tab=x" (links do menu já saem limpos).
function urlLimpa(href) {
  return String(href).replace(/\.html(?=$|[?#])/, '');
}
window.urlLimpa = urlLimpa;

// Registro único de telas do menu (shared/navegacao.js, 29/10/2026). Carregado
// em sincronia durante o parse (todas as páginas trazem o auth_check.js sem
// defer), para o menu já nascer com ele; se este arquivo chegar depois do
// parse, entra por <script> e o menu espera o load (renderUnifiedNavbar).
(function() {
  if (typeof window.KuryosNav !== 'undefined') return;
  var src = 'shared/navegacao.js?v=20261029-2';
  try {
    if (document.readyState === 'loading') { document.write('<script src="' + src + '" data-kuryos-nav></script>'); return; }
  } catch (e) { /* document.write bloqueado: segue para o <script> */ }
  var s = document.createElement('script');
  s.src = src;
  s.setAttribute('data-kuryos-nav', '');
  document.head.appendChild(s);
})();

window.currentUser = null;

(function() {
  // Garante que shared/theme.css (tokens de cor/tipografia da linguagem Apple,
  // aprovada 2026-07-19) esteja carregado antes da sidebar usar as variáveis.
  if (!document.querySelector('link[href="shared/theme.css"]')) {
    var themeLink = document.createElement('link');
    themeLink.rel = 'stylesheet';
    themeLink.href = 'shared/theme.css';
    document.head.appendChild(themeLink);
  }

  // Estilos da sidebar de navegação (ver dashboard.html para o resto dos tokens).
  // O recuo de layout (padding-left:232px) NÃO fica aqui — mora em
  // shared/theme.css na classe estática ".has-sidebar" do <body>, presente
  // desde o primeiro paint de cada página. Isso evita o "pulo" de conteúdo
  // que acontecia quando o recuo só era aplicado depois que a sidebar era
  // inserida via JS (auth + leitura de perfil no Firebase, ambos assíncronos).
  const css = `
    .kt-sidebar {
      position: fixed; left: 0; top: 0; height: 100vh; width: 232px;
      padding: 22px 14px; box-sizing: border-box;
      background: var(--sidebar-bg, rgba(255,255,255,.85));
      backdrop-filter: blur(22px) saturate(1.4);
      -webkit-backdrop-filter: blur(22px) saturate(1.4);
      border-right: 1px solid var(--line, #d2d2d7);
      display: flex; flex-direction: column; gap: 22px;
      font-family: var(--font-ui, -apple-system, "Segoe UI", sans-serif);
      z-index: 9999;
      color: var(--ink, #1d1d1f);
      transition: transform .25s ease;
      /* A lista de páginas cresceu (Compras, Logística, Materiais,
         Fórmulas/BOM, Clientes...) e passou a ultrapassar 100vh em telas
         normais -- sem overflow, os itens de baixo (Ajuste de Metas,
         Usuários, o próprio rodapé com o usuário logado) ficavam
         visualmente cortados E inacessíveis, sem nenhuma forma de rolar até
         eles. overflow-y:auto deixa só a sidebar rolar, sem mexer no resto
         da página; overflow-x:hidden evita barra horizontal por causa do
         padding lateral. */
      overflow-y: auto; overflow-x: hidden;
    }
    .kt-sidebar::-webkit-scrollbar { width: 6px; }
    .kt-sidebar::-webkit-scrollbar-thumb { background: var(--line, #d2d2d7); border-radius: 3px; }
    .kt-hamburger, .kt-backdrop { display: none; }
    /* Tablet e celular: sidebar vira gaveta que desliza por cima do conteúdo,
       aberta por um botão hamburger fixo — sem isso a navegação simplesmente
       sumia abaixo de 980px, sem nenhuma forma alternativa de trocar de tela. */
    @media (max-width: 980px) {
      .kt-sidebar { transform: translateX(-100%); box-shadow: 0 0 0 transparent; width: min(300px, 86vw); gap: 14px; }
      /* Toque de dedo (29/09): alvo mínimo de 44 px no celular. */
      .kt-nav-cap { min-height: 44px; font-size: 12px; }
      /* O botão do menu fica por cima do canto: a logo abre espaço para ele. */
      .kt-sidebar .kt-brand { padding-left: 52px; }
      .kt-nav-link { min-height: 44px; font-size: 15px; }
      .kt-sidebar.open { transform: translateX(0); box-shadow: 8px 0 32px rgba(0,0,0,.18); }
      .kt-hamburger {
        display: flex; align-items: center; justify-content: center;
        position: fixed; top: 14px; left: 14px; z-index: 10001;
        width: 40px; height: 40px; border-radius: 12px; border: none; cursor: pointer;
        background: var(--sidebar-bg, rgba(255,255,255,.85));
        backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        box-shadow: var(--shadow, 0 1px 2px rgba(0,0,0,.08));
        color: var(--ink, #1d1d1f);
      }
      .kt-hamburger svg { width: 20px; height: 20px; }
      .kt-backdrop {
        display: block; position: fixed; inset: 0; z-index: 9998;
        background: rgba(0,0,0,.35); opacity: 0; pointer-events: none;
        transition: opacity .2s ease;
      }
      .kt-backdrop.open { opacity: 1; pointer-events: auto; }
    }
    @media (prefers-reduced-motion: reduce) { .kt-sidebar { transition: none; } }
    .kt-brand { display: flex; align-items: center; gap: 10px; padding: 4px 6px 10px; cursor: pointer; }
    .kt-brand-logo { height: 26px; width: auto; display: block; }
    /* A logo é navy sólido (não tem variante clara) — no modo escuro ela some
       contra o fundo escuro da sidebar, então inverte pra branco só ali. */
    @media (prefers-color-scheme: dark) {
      :root:where(:not([data-theme="light"])) .kt-brand-logo { filter: brightness(0) invert(1); }
    }
    :root[data-theme="dark"] .kt-brand-logo { filter: brightness(0) invert(1); }
    .kt-nav-group { display: flex; flex-direction: column; gap: 2px; }
    /* Menu em sanfona (29/09): "os menus ficaram muito grandes, condensados e
       abrir caso a caso". O título do bloco é um botão; o corpo abre e fecha. */
    .kt-nav-cap { font-size: 11px; font-weight: 600; color: var(--ink-mute, #86868b); text-transform: uppercase; letter-spacing: .06em; padding: 6px 12px 4px;
      display: flex; align-items: center; gap: 6px; width: 100%; background: none; border: none; cursor: pointer; text-align: left; font-family: inherit; border-radius: 8px; }
    .kt-nav-cap:hover { color: var(--ink, #1d1d1f); }
    .kt-nav-cap .kt-cap-txt { flex: 1; }
    .kt-nav-cap .kt-cap-n { font-size: 10.5px; font-weight: 700; letter-spacing: 0; min-width: 18px; text-align: center; padding: 0 5px; border-radius: 9px;
      background: color-mix(in srgb, var(--ink, #1d1d1f) 7%, transparent); color: var(--ink-mute, #86868b); }
    .kt-nav-cap .kt-cap-chev { width: 14px; height: 14px; flex: none; transition: transform .18s ease; }
    .kt-nav-group.fechado .kt-cap-chev { transform: rotate(-90deg); }
    .kt-nav-group:not(.fechado) .kt-cap-n { display: none; }
    .kt-nav-group.tem-ativo > .kt-nav-cap { color: var(--accent, #2456d6); }
    .kt-nav-body { display: flex; flex-direction: column; gap: 2px; }
    .kt-nav-group.fechado .kt-nav-body { display: none; }
    .kt-sanfona-off .kt-nav-cap, .kt-nav-group.fixo .kt-nav-cap { cursor: default; }
    .kt-sanfona-off .kt-cap-chev, .kt-sanfona-off .kt-cap-n, .kt-nav-group.fixo .kt-cap-chev, .kt-nav-group.fixo .kt-cap-n { display: none; }
    .kt-nav-sub { font-size: 11.5px; font-weight: 700; color: var(--ink-soft, #515154); padding: 6px 12px 2px; }
    .kt-nav-link { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 9px; color: var(--ink-soft, #6e6e73); font-size: 13.5px; font-weight: 500; cursor: pointer; text-decoration: none; }
    .kt-nav-link svg { width: 18px; height: 18px; flex: none; }
    .kt-nav-link.active { background: var(--accent, #2456d6); color: #fff; font-weight: 600; }
    .kt-nav-link:not(.active):hover { background: color-mix(in srgb, var(--ink, #1d1d1f) 6%, transparent); }
    .kt-sidebar-foot { margin-top: auto; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid var(--line, #d2d2d7); }
    .kt-avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--s2, #c9910a); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; flex: none; }
    .kt-sidebar-foot .who { flex: 1; min-width: 0; }
    .kt-sidebar-foot .name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .kt-sidebar-foot .role { font-size: 11px; color: var(--ink-mute, #86868b); }
    .kt-sidebar-foot button { background: none; border: none; color: var(--ink-mute, #86868b); cursor: pointer; font-size: 16px; line-height: 1; padding: 4px; }
    .nav-links { display: none !important; }
  `;
  const styleEl = document.createElement('style');
  styleEl.innerHTML = css;
  document.head.appendChild(styleEl);

  // ── Watchdog de carregamento ─────────────────────────────────────
  // Nenhum passo da cadeia de autenticação abaixo (onAuthStateChanged,
  // leitura de usuarios/{uid}) tinha timeout ou tratamento de erro -- se a
  // conexão engasgasse (wifi instável, VPN, aba que "dormiu"), a leitura do
  // perfil simplesmente nunca retornava, renderUnifiedNavbar() nunca era
  // chamada, e a página ficava parada pra sempre sem barra lateral e sem
  // nenhum aviso (relatado como "às vezes não carrega"). Este watchdog é a
  // rede de segurança: se nada resolver em 12s, mostra uma tela de erro com
  // botão de tentar de novo, em vez de travar silenciosamente.
  let authWatchdogTimer = null;
  let authWatchdogResolved = false;
  function startAuthWatchdog() {
    authWatchdogTimer = setTimeout(() => {
      if (!authWatchdogResolved) showAuthLoadError('O sistema está demorando pra carregar. Verifique sua conexão com a internet.');
    }, 12000);
  }
  function clearAuthWatchdog() {
    authWatchdogResolved = true;
    if (authWatchdogTimer) { clearTimeout(authWatchdogTimer); authWatchdogTimer = null; }
    // A leitura pode terminar depois do aviso de 12s. A conclusão validada
    // deve liberar a tela; o aviso não pode permanecer sobre o módulo pronto.
    var loadError = document.getElementById('kt-auth-error-overlay');
    if (loadError) loadError.remove();
  }
  function showAuthLoadError(msg) {
    authWatchdogResolved = true;
    if (authWatchdogTimer) { clearTimeout(authWatchdogTimer); authWatchdogTimer = null; }
    if (document.getElementById('kt-auth-error-overlay')) return; // já mostrando
    const overlay = document.createElement('div');
    overlay.id = 'kt-auth-error-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bg,#f5f5f7);display:flex;align-items:center;justify-content:center;padding:24px;font-family:var(--font-ui,-apple-system,"Segoe UI",sans-serif)';
    overlay.innerHTML =
      '<div style="max-width:380px;text-align:center;background:var(--panel,#fff);border-radius:16px;padding:32px 28px;box-shadow:0 12px 28px -14px rgba(0,0,0,.25)">' +
        '<div style="display:flex;justify-content:center;color:var(--k-orange,#c93400);margin-bottom:12px"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></div>' +
        '<div style="font-size:16px;font-weight:700;color:var(--ink,#1d1d1f);margin-bottom:8px">Não foi possível carregar</div>' +
        '<div style="font-size:13.5px;color:var(--ink-soft,#6e6e73);margin-bottom:20px;line-height:1.5">' + msg + '</div>' +
        '<button id="kt-auth-retry-btn" style="display:inline-flex;align-items:center;gap:8px;background:var(--accent,#0071e3);color:#fff;border:none;border-radius:12px;padding:12px 20px;font-size:14px;font-weight:650;cursor:pointer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7L20 8"/><path d="M20 3v5h-5"/></svg>Tentar novamente</button>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('kt-auth-retry-btn').addEventListener('click', () => window.location.reload());
  }

  // Inicializa a verificação de autenticação
  document.addEventListener('DOMContentLoaded', () => {
    startAuthWatchdog();

    if (typeof firebase === 'undefined') {
      console.error('Firebase compat library não carregada. Certifique-se de importar o Firebase antes do auth_check.js.');
      showAuthLoadError('Não foi possível carregar as bibliotecas do sistema. Tente novamente.');
      return;
    }

    firebase.auth().onAuthStateChanged(user => {
      const activePage = getActivePageName();

      if (!user) {
        // Redireciona para o login caso não esteja logado
        clearAuthWatchdog();
        if (activePage !== 'login.html') {
          window.location.href = 'login.html';
        }
      } else {
        const db = firebase.database();
        readUsuarioProfileWithRetry(db, user.uid, snapshot => {
          const profile = snapshot.val();

          if (!profile || profile.role === 'pending') {
            // Sem perfil ou pendente de aprovação
            clearAuthWatchdog();
            if (activePage !== 'login.html') {
              window.location.href = 'login.html?status=pending';
            } else {
              const pendingMsg = document.getElementById('pending-message');
              if (pendingMsg) pendingMsg.style.display = 'block';
            }
          } else {
            const role = profile.role || 'pending';
            window.currentUser = {
              uid: user.uid,
              nome: profile.nome || user.displayName || user.email.split('@')[0],
              email: user.email,
              role: role,
              // Módulos marcados pelo ADM. Ausente = usa o padrão do papel
              // (ver modulosDoUsuario) -- é o que mantém os usuários atuais
              // exatamente como estavam antes desta mudança.
              modulos: profile.modulos || null,
              funcoes: profile.funcoes || null,
              modulosDasFuncoes: profile.modulosDasFuncoes === true
            };

            // Validação de acessos da página, agora por MÓDULO
            if (!podeAbrirPagina(window.currentUser, activePage)) {
              clearAuthWatchdog();
              const exigidos = (PAGINA_MODULOS[activePage] || [])
                .map(function(m) { return (KURYOS_MODULOS[m] || {}).rotulo || m; });
              // Dizer QUAL módulo falta é o que transforma "Acesso Negado"
              // num pedido acionável ao ADM, em vez de um beco sem saída.
              alert('Acesso Negado: seu usuário não tem o módulo '
                + (exigidos.length ? '"' + exigidos.join('" ou "') + '"' : 'necessário')
                + '.\n\nPeça a um administrador para liberá-lo em Usuários.');
              const destino = homeDoUsuario(window.currentUser);
              // Se a home calculada for a própria página negada, não há pra
              // onde mandar -- redirecionar seria um laço infinito.
              if (destino.split('?')[0] !== activePage) {
                window.location.href = destino;
              } else {
                window.location.href = 'login.html?status=pending';
              }
            } else {
              // Constrói e injeta o menu superior unificado
              renderUnifiedNavbar(window.currentUser);
              // Avisa a página que o PAPEL do usuário já é conhecido.
              //
              // A leitura do perfil é assíncrona e quase sempre chega DEPOIS
              // do primeiro render dos dados -- então qualquer tela que
              // decida o que mostrar pelo papel (ex: botão de editar só pra
              // admin) renderiza com window.currentUser ainda null e o
              // controle nunca aparece, sem erro nenhum no console.
              // Encontrado ao construir a edição de Pedido de Compra.
              window.dispatchEvent(new CustomEvent('kuryos-auth-pronto', { detail: window.currentUser }));
              clearAuthWatchdog();
              // Índice público (nome + papel) para listas de responsáveis do CRM:
              // usuarios/ só abre para admin/RH. Grava só quando muda.
              // Promise.resolve().then: um throw síncrono aqui não pode pular o
              // resto do login (sincronização do ADM, planejamento só leitura).
              (function(pub) {
                Promise.resolve().then(function() {
                  return firebase.database().ref('usuarios_publico/' + user.uid).once('value');
                }).then(function(snap) {
                  var atual = snap.val() || {};
                  if (atual.nome !== pub.nome || atual.role !== pub.role) return snap.ref.set(pub);
                }).catch(function() {});
              })({ nome: window.currentUser.nome, role: role });

              if (role === 'admin' && typeof window.syncAllActiveOpsStatus === 'function') {
                window.syncAllActiveOpsStatus();
              }

              // Adapta o planejamento para visualização somente leitura para o perfil de produção
              if (activePage === 'planejamento.html' && role === 'production') {
                makePlanningReadOnly();
              }
            }
          }
        });
      }
    });
  });
})();

// Lê usuarios/{uid} com retentativa silenciosa em caso de erro. Este é um
// app multi-página sem SPA -- toda navegação recarrega a página do zero, o
// que recria a conexão websocket do Realtime Database do zero também
// (diferente do estado de autenticação, que fica em cache local). Nos
// primeiros instantes após onAuthStateChanged dar o usuário como logado, o
// token de auth às vezes ainda não terminou de propagar pra essa conexão
// nova, e uma leitura que dispara nesse instante recebe permission_denied
// mesmo com o login válido -- um erro transitório, não uma falha real de
// permissão. Sem retentativa, isso aparecia como "Erro ao carregar seu
// perfil" a cada navegação em que essa corrida acontecesse. Tenta de novo
// silenciosamente antes de admitir derrota e mostrar a tela de erro.
function readUsuarioProfileWithRetry(db, uid, onSuccess, attemptsLeft) {
  if (attemptsLeft === undefined) attemptsLeft = 2;
  db.ref('usuarios/' + uid).once('value', snapshot => {
    // Bug real encontrado testando a Fase 0 no emulador local (achado
    // independente do problema de databaseURL já corrigido): o retry aqui
    // só cobria o callback de ERRO do once() -- uma leitura que teve SUCESSO
    // mas voltou null (a corrida entre a conexão de long-polling do RTDB
    // ainda terminando de sincronizar e essa leitura disparando cedo demais)
    // nunca era retentada, e usuarios/{uid} nulo é tratado como "sem perfil"
    // -> redireciona pro login mesmo com sessão válida. No app de produção
    // (WebSocket, não long-polling) essa corrida é rara; no emulador local
    // era reproduzível toda vez em páginas com muitos listeners (ex:
    // dashboard.html). Retry aqui é seguro nos dois ambientes.
    if (snapshot.val() === null && attemptsLeft > 0) {
      setTimeout(() => {
        readUsuarioProfileWithRetry(db, uid, onSuccess, attemptsLeft - 1);
      }, 700);
      return;
    }
    onSuccess(snapshot);
  }, err => {
    if (attemptsLeft > 0) {
      setTimeout(() => {
        readUsuarioProfileWithRetry(db, uid, onSuccess, attemptsLeft - 1);
      }, 700);
    } else {
      showAuthLoadError('Erro ao carregar seu perfil: ' + (err && err.message ? err.message : 'tente novamente') + '.');
    }
  });
}

// Ícones de linha (estilo SF Symbols) usados na sidebar — desenhados com
// formas simples, sem path complexo, pra ficar consistente e leve.
const ktIcons = {
  dashboard: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2"/>',
  history: '<path d="M4 20V10M12 20V4M20 20v-7"/>',
  calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 3v3M16 3v3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.5-2-3.4-2.2.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.2-.9-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3L2.7 15l2 3.4 2.2-.9c.77.66 1.65 1.17 2.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l2.2.9 2-3.4-1.9-1.5Z"/>',
  list: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  tag: '<path d="M11.5 3.5H5A1.5 1.5 0 0 0 3.5 5v6.5c0 .4.16.78.44 1.06l9 9a1.5 1.5 0 0 0 2.12 0l6.5-6.5a1.5 1.5 0 0 0 0-2.12l-9-9a1.5 1.5 0 0 0-1.06-.44Z"/><circle cx="8" cy="8" r="1.5"/>',
  box: '<path d="M3.5 8 12 4l8.5 4M3.5 8v8L12 20l8.5-4V8M3.5 8 12 12m0 0 8.5-4M12 12v8"/>',
  document: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M9 12h11M4 18h13M19 18h1"/><circle cx="11" cy="6" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  pencil: '<path d="M4 20.5V9l6-4.5 6 4.5v11.5"/><path d="M10 20.5v-6h4v6M15 9.5h5v11"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20c.6-3.4 3-5.5 6.2-5.5s5.6 2.1 6.2 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.3 14.7c2.3.3 4 2 4.5 4.8"/>',
  chart: '<path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2.2L8 15h9l2.5-7.5H6.3"/>',
  truck: '<rect x="1.5" y="7" width="13" height="9" rx="1.5"/><path d="M14.5 10h4l3 3.5V16h-7z"/><circle cx="6" cy="18.5" r="1.7"/><circle cx="17" cy="18.5" r="1.7"/>',
  // Estoque/WMS -- galpão com telhado e portão, distinto de "box" (já usado
  // por Matriz de Insumos) e de "truck".
  warehouse: '<path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9 20v-6.5h6V20"/>',
  // Separação de Materiais (WMS Fase 2) -- prancheta com check, distinto de
  // "warehouse" (o hub de estoque em si) e "box" (Matriz de Insumos).
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9 12l2 2 4-4"/>',
  // Manuais -- livro aberto, distinto de "clipboard" (Separação) e "list".
  book: '<path d="M12 6.5S10 4.5 3.5 4.5v13C10 17.5 12 19.5 12 19.5s2-2 8.5-2v-13C14 4.5 12 6.5 12 6.5Z"/><path d="M12 6.5v13"/>',
  // Qualidade -- erlenmeyer (fila de inspeção) e triângulo de atenção (RNC).
  flask: '<path d="M9.5 3v6.2L4.2 18a2 2 0 0 0 1.7 3h12.2a2 2 0 0 0 1.7-3l-5.3-8.8V3"/><path d="M8 3h8"/><path d="M7.2 14h9.6"/>',
  alert: '<path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3.1L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.5"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>',
  // Financeiro -- fachada de banco; Controladoria -- balança (razão e resultado).
  bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7"/><path d="M3.5 20h17"/>',
  scale: '<path d="M12 4v16M7 20h10"/><path d="M5 8h14"/><path d="M5 8l-2.5 6a2.5 2.5 0 0 0 5 0Z"/><path d="M19 8l-2.5 6a2.5 2.5 0 0 0 5 0Z"/>'
};
function ktIcon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ktIcons[name] + '</svg>';
}
function ktLink(href, icon, label, activePage, fam) {
  // Compara só o nome do arquivo, ignorando ?query -- necessário desde que
  // uma mesma página passou a ter mais de um link de menu apontando pra
  // abas diferentes dela (ex: "Estoque" e "WMS" -> estoque.html?tab=X) --
  // sem isso, NENHUM dos dois nunca ficava marcado como ativo, porque
  // activePage (só o nome do arquivo) nunca batia com href+query.
  // `fam`: telas encadeadas que respondem pelo mesmo link (as três etapas
  // da Expedição de Vendas, ver shared/navegacao.js).
  var hrefPage = href.split('?')[0];
  var ativo = activePage === hrefPage || !!(fam && fam.indexOf(activePage) !== -1);
  // Operação (23/09): os três "Estoque do setor" são a mesma página com
  // ?setor=; sem isto os três ficavam marcados ao mesmo tempo.
  var setorLink = (href.match(/[?&]setor=([^&]+)/) || [])[1];
  if (ativo && setorLink) {
    var setorAqui = (window.location.search.match(/[?&]setor=([^&]+)/) || [])[1];
    ativo = !setorAqui || setorAqui === setorLink;
  }
  // Mesma regra para as abas (Estoque × WMS × Conferência de PA são
  // estoque.html?tab=): com a aba na URL, só o link dela fica ativo -- senão
  // os três apareciam marcados e com aria-current ao mesmo tempo.
  var abaLink = (href.match(/[?&]tab=([^&]+)/) || [])[1];
  if (ativo && abaLink) {
    var abaAqui = (window.location.search.match(/[?&]tab=([^&]+)/) || [])[1];
    ativo = !abaAqui || abaAqui === abaLink;
  }
  var cls = 'kt-nav-link' + (ativo ? ' active' : '');
  return '<a class="' + cls + '" href="' + urlLimpa(href) + '"' + (ativo ? ' aria-current="page"' : '') + '>' + ktIcon(icon) + '<span>' + label + '</span></a>';
}

// Renderiza a sidebar de navegação (linguagem visual Apple, aprovada 2026-07-19)
function renderUnifiedNavbar(user) {
  // Remove qualquer cabeçalho legado ou barra preta antiga
  // NOTA: '.header' foi removido deste seletor -- hoje é a classe do cabeçalho
  // ATUAL e intencional de quase toda página (título h1, status de conexão,
  // relógio em form.html). Headers operacionais marcados pelo UI kit também
  // são preservados; só a navegação antiga pode ser substituída pelo shell.
  const oldHeader = document.querySelector('header:not([data-ui="page-header"]), #auth-status-bar, #auth-status-bar-black');
  const blackToolbar = document.querySelector('body > div[style*="background:#0f172a"], body > div[style*="background: #0f172a"]');
  const body = document.body;
  const activePage = getActivePageName();

  if (blackToolbar) {
    blackToolbar.remove();
  }

  // Se já existir a sidebar, não renderiza de novo
  if (document.getElementById('unified-navbar')) return;

  // O registro de telas ainda não chegou (só no caminho de reserva, quando o
  // auth_check.js foi injetado depois do parse): monta quando ele carregar.
  if (!window.KuryosNav) {
    var navScript = document.querySelector('script[data-kuryos-nav]');
    if (navScript && !navScript.__kuryosEspera) {
      navScript.__kuryosEspera = true;
      navScript.addEventListener('load', function() { renderUnifiedNavbar(user); });
      return;
    }
  }

  const sidebar = document.createElement('aside');
  sidebar.id = 'unified-navbar';
  sidebar.className = 'kt-sidebar';

  // O menu passou a ser montado por MÓDULO, não por papel. Antes, cada link
  // repetia à mão uma condição de papel que precisava concordar com
  // pageAccessRules -- duas listas separadas dizendo a mesma coisa, e um
  // link visível pra quem não tem acesso vira "Acesso Negado" ao clicar.
  // Agora o menu e a validação de página leem a MESMA função: se o link
  // aparece, a página abre.
  const temMod = function(m) { return usuarioTemModulo(user, m); };
  const ROTULO_FUNCAO = { admin: 'Administrador', pcp: 'PCP', rh: 'RH Central', gestor: 'Gestor de Linha', qualidade: 'Qualidade',
    rotulagem: 'Rotulagem', logistica: 'Logística', comercial: 'Comercial', pd: 'P&D', production: 'Produção', tv: 'TV (placar)' };
  const roleLabel = funcoesDoUsuario(user).map(function(f) { return ROTULO_FUNCAO[f] || f; }).join(' · ') || 'Produção';
  // Blocos e links vêm do registro único (shared/navegacao.js, MENU-01 de
  // 29/10/2026): cada tela mora em UM bloco e só aparece para quem consegue
  // abri-la (podeAbrirPagina) -- a mesma regra que valida a página. Um bloco
  // sem nenhum link some (senão sobra uma legenda sem nada embaixo).
  const grupo = function(titulo, visual, corpo) {
    if (!corpo) return '';
    const n = (corpo.match(/class="kt-nav-link/g) || []).length;
    const icone = (visual && visual[0]) || 'list';
    const tom = (visual && visual[1]) || 'neutro';
    return '<div class="kt-nav-group" data-grupo="' + titulo + '" data-tom="' + tom + '">' +
      '<button type="button" class="kt-nav-cap" aria-expanded="true"><span class="kt-cap-icon" aria-hidden="true">' + ktIcon(icone) + '</span><span class="kt-cap-txt">' + titulo + '</span>' +
      '<span class="kt-cap-n">' + n + '</span>' +
      '<svg class="kt-cap-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
      '</button><div class="kt-nav-body">' + corpo + '</div></div>';
  };
  const initials = (user.nome || '?').trim().split(/\s+/).slice(0, 2).map(function(s) { return s[0]; }).join('').toUpperCase();
  const navCtx = {
    podeAbrir: function(pg) { return podeAbrirPagina(user, pg); },
    temMod: temMod,
    role: user.role,
    setores: setoresOperacao(user)
  };
  const gruposHtml = (window.KuryosNav ? window.KuryosNav.blocos(navCtx) : []).map(function(bl) {
    var subAtual = null;
    var corpo = bl.itens.map(function(it) {
      var cab = '';
      if (it.s !== subAtual) { subAtual = it.s; if (it.s) cab = '<div class="kt-nav-sub">' + it.s + '</div>'; }
      return cab + ktLink(it.h, it.i, it.r, activePage, it.fam);
    }).join('');
    return grupo(bl.nome, bl.visual, corpo);
  }).join('');

  // A home segue os módulos que a pessoa tem, na mesma ordem de preferência
  // usada quando um Acesso Negado precisa redirecionar -- uma regra só, em
  // vez de um encadeamento de papéis que precisava ser lembrado a cada
  // papel novo (foi assim que 'pcp' e 'qualidade' foram esquecidos antes).
  var brandHome = homeDoUsuario(user);
  sidebar.innerHTML =
    '<button type="button" class="kt-brand" aria-label="Kuryos — página inicial" onclick="window.location.href=\'' + brandHome + '\'"><span class="kuryos-brand-mark" aria-hidden="true">K</span><img class="kt-brand-logo" src="kuryos-logo.svg" alt="Kuryos"><span class="kt-brand-sub">Sistema de Produção</span></button>' +
    '<nav class="kuryos-sidebar-nav" aria-label="Navegação principal">' +
    // Início fica fora dos blocos: é a porta de entrada, não uma área.
    (temInicio(user) ? '<div class="kt-nav-top">' + ktLink('inicio.html', 'dashboard', 'Início', activePage) + '</div>' : '') +
    gruposHtml +
    '</nav>' +
    '<div class="kt-sidebar-foot">' +
      '<span class="kt-avatar">' + initials + '</span>' +
      '<div class="who"><div class="name">' + user.nome + '</div><div class="role">' + roleLabel + '</div></div>' +
      '<button id="kt-theme-toggle" aria-label="Alternar tema" title="' + kuryosThemeLabel(kuryosThemeState()) + '" onclick="cycleKuryosTheme()">' + kuryosThemeIconSvg(kuryosThemeState()) + '</button>' +
      '<button title="Sair" aria-label="Sair" onclick="firebase.auth().signOut().then(() => window.location.href=\'login.html\')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></svg></button>' +
    '</div>';

  // Botão hamburger + fundo escurecido — só aparecem (via CSS) abaixo de
  // 980px, quando a sidebar vira gaveta deslizante em vez de ficar fixa.
  const backdrop = document.createElement('div');
  backdrop.className = 'kt-backdrop';
  backdrop.id = 'kt-backdrop';

  const hamburger = document.createElement('button');
  hamburger.className = 'kt-hamburger';
  hamburger.id = 'kt-hamburger';
  hamburger.title = 'Menu';
  hamburger.setAttribute('aria-label', 'Abrir menu');
  hamburger.setAttribute('aria-controls', 'unified-navbar');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/></svg>';

  function closeDrawer() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Abrir menu');
  }
  function toggleDrawer() {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
    hamburger.setAttribute('aria-label', sidebar.classList.contains('open') ? 'Fechar menu' : 'Abrir menu');
  }
  hamburger.addEventListener('click', toggleDrawer);
  backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeDrawer(); });
  // Fecha a gaveta ao navegar (toque num link) pra não reabrir já aberta na próxima página
  sidebar.addEventListener('click', function(e) { if (e.target.closest('.kt-nav-link')) closeDrawer(); });

  montarSanfona(sidebar, user);

  // Insere sidebar, hamburger e fundo escurecido no início do body
  body.insertBefore(backdrop, body.firstChild);
  body.insertBefore(sidebar, body.firstChild);
  body.insertBefore(hamburger, body.firstChild);

  // Menu longo (ADM, PCP): o item da tela atual pode nascer abaixo da dobra.
  // Rola só a lista do menu -- nunca a página -- para deixá-lo à vista.
  // Repete quando as folhas de estilo do shell terminam de carregar (é só
  // então que a lista vira a área que rola).
  function rolarAteAtivo() {
    var nav = sidebar.querySelector('.kuryos-sidebar-nav');
    var atual = sidebar.querySelector('.kt-nav-link.active');
    if (!nav || !atual || !nav.getBoundingClientRect) return;
    var n = nav.getBoundingClientRect(), a = atual.getBoundingClientRect();
    if (a.bottom > n.bottom || a.top < n.top) nav.scrollTop += (a.top - n.top) - (n.height - a.height) / 2;
  }
  rolarAteAtivo();
  if (window.requestAnimationFrame) requestAnimationFrame(function() { requestAnimationFrame(rolarAteAtivo); });
  if (document.readyState !== 'complete') window.addEventListener('load', rolarAteAtivo, { once: true });

  // Remove cabeçalhos duplicados/antigos se existirem na página para manter o design clean
  if (oldHeader && oldHeader !== sidebar) {
    oldHeader.remove();
  }
}

/* Menu em sanfona (29/09). Pedido do usuário: "os menus acabaram ficando muito
   grandes; condensados e abrir caso a caso". Regras:
   - quem tem pouco no menu (até 10 links) vê tudo aberto, sem sanfona --
     esconder 6 links atrás de cliques só atrapalha;
   - senão, abre o bloco da tela atual e o último que a pessoa abriu (lembrado
     neste aparelho, por usuário); os outros ficam fechados, com o número de
     links no título;
   - abrir um bloco fecha os demais (fora o da tela atual): o menu continua
     curto, o que importa no celular. */
var KT_SANFONA_MIN_LINKS = 11;
function montarSanfona(sidebar, user) {
  var grupos = Array.prototype.slice.call(sidebar.querySelectorAll('.kt-nav-group'));
  var total = sidebar.querySelectorAll('.kt-nav-link').length;
  var chave = 'kt.menu.aberto.' + ((user && (user.uid || user.email)) || '');
  grupos.forEach(function(g) {
    if (g.querySelector('.kt-nav-link.active')) g.classList.add('tem-ativo');
    // Bloco de um link só não fecha: esconder um link atrás de outro toque não condensa nada.
    if (g.querySelectorAll('.kt-nav-link').length <= 1) g.classList.add('fixo');
  });
  if (total < KT_SANFONA_MIN_LINKS) { sidebar.classList.add('kt-sanfona-off'); return; }
  var lembrado = null;
  try { lembrado = localStorage.getItem(chave); } catch (e) { /* sem armazenamento: segue sem lembrar */ }
  function aplicar(abertoNome) {
    grupos.forEach(function(g) {
      var aberto = g.classList.contains('tem-ativo') || g.classList.contains('fixo') || g.getAttribute('data-grupo') === abertoNome;
      g.classList.toggle('fechado', !aberto);
      g.querySelector('.kt-nav-cap').setAttribute('aria-expanded', aberto ? 'true' : 'false');
    });
  }
  aplicar(lembrado);
  grupos.forEach(function(g) {
    g.querySelector('.kt-nav-cap').addEventListener('click', function() {
      var nome = g.getAttribute('data-grupo');
      // O bloco da tela atual não fecha: é onde a pessoa está.
      if (g.classList.contains('tem-ativo') || g.classList.contains('fixo')) return;
      var abrir = g.classList.contains('fechado');
      var alvo = abrir ? nome : null;
      try { if (alvo) localStorage.setItem(chave, alvo); else localStorage.removeItem(chave); } catch (e) { /* idem */ }
      aplicar(alvo);
    });
  });
}

// Configura o planejamento para modo Somente Leitura para a Produção
function makePlanningReadOnly() {
  setTimeout(() => {
    // Oculta painel de agendamento lateral
    const sidebar = document.getElementById('sidebar');
    const pContainer = document.querySelector('.p-container');
    if (sidebar) sidebar.style.display = 'none';
    if (pContainer) pContainer.style.gridTemplateColumns = '1fr';

    // Oculta botões de salvar e resetar
    const btnSave = document.getElementById('btn-save');
    const btnReset = document.getElementById('btn-reset');
    if (btnSave) btnSave.style.display = 'none';
    if (btnReset) btnReset.style.display = 'none';

    // Bloqueia cliques nas células e cartões no planejamento
    const grid = document.getElementById('planning-grid');
    if (grid) {
      const style = document.createElement('style');
      style.innerHTML = `
        .cell, .scheduled-card, .drag-item, .time-col button { pointer-events: none !important; }
        .grid-container { pointer-events: auto !important; overflow: auto !important; }
      `;
      document.head.appendChild(style);
    }
  }, 800);
}

// --- MÁQUINA DE STATUS AUTOMÁTICA DAS OPs ---
// Executa recálculo do status de uma OP ativa com base em seus slots e apontamentos
window.updateOpStatusAutomatically = function(pedidoId, callback, preloadedProgramacao) {
  if (typeof firebase === 'undefined') return;
  const db = firebase.database();

  db.ref('pedidos/' + pedidoId).once('value', pedSnap => {
    const p = pedSnap.val();
    if (!p) {
      if (callback) callback(null);
      return;
    }

    // Se a OP já estiver concluída manualmente, respeita e não altera de volta a menos que explicitamente solicitado
    const plannedQty = p.qtdTotal || 0;
    // produzido/ultimoApontamento já são mantidos incrementalmente a cada apontamento
    // (ver transaction em form.html) — evita reescanear todo o histórico de registros.
    const totalProduced = parseFloat(p.produzido) || 0;
    const lastTimestamp = p.ultimoApontamento ? new Date(p.ultimoApontamento).getTime() : 0;

    function withProgramacao(programacao) {
      let isScheduled = false;

      Object.keys(programacao).forEach(date => {
        const dayData = programacao[date] || {};
        Object.keys(dayData).forEach(hour => {
          const hourData = dayData[hour] || {};
          // 10 slots, não 4: todo o resto do sistema varre 1..10 (grade,
          // Andon, replanejamento, form.html). Com a 5ª linha cadastrada, todo
          // pedido programado só nela ficava eternamente "Não Iniciado".
          // E normaliza a chave dos dois lados -- '0022__SKU' vs '22__SKU' é o
          // caso real que motivou _kuryosNormalizePedidoKey (hoisted, def. abaixo).
          for (let l = 1; l <= 10; l++) {
            const slot = hourData['env' + l];
            if (!slot) continue;
            const alvo = _kuryosNormalizePedidoKey(pedidoId);
            if (!alvo) continue; // nunca casar undefined com undefined
            if (_kuryosNormalizePedidoKey(slot.pedidoKey) === alvo
                || _kuryosNormalizePedidoKey(slot.pedidoId) === alvo) {
              isScheduled = true;
            }
          }
        });
      });

      // Define o novo status
      let newStatus = 'Não Iniciado';
      if (totalProduced >= plannedQty && plannedQty > 0) {
        newStatus = 'Concluído';
      } else if (totalProduced > 0) {
        // Diferença de tempo desde o último apontamento
        const diffMs = Date.now() - lastTimestamp;
        const twoHoursMs = 2 * 60 * 60 * 1000;
        if (diffMs > twoHoursMs) {
          newStatus = 'Produção Parcial';
        } else {
          newStatus = 'Em Produção';
        }
      } else if (isScheduled) {
        newStatus = 'Programado';
      }

      // Atualiza no banco se mudou
      if (p.status !== newStatus) {
        db.ref('pedidos/' + pedidoId).update({ status: newStatus })
          .then(() => {
            console.log(`Status de ${pedidoId} (Pedido) recalculado automaticamente: ${newStatus}`);
            if (callback) callback(newStatus);
          });
      } else {
        if (callback) callback(p.status);
      }
    }

    if (preloadedProgramacao) {
      withProgramacao(preloadedProgramacao);
    } else {
      // Busca se está agendada no planejamento semanal
      db.ref('programacao').once('value', progSnap => {
        withProgramacao(progSnap.val() || {});
      });
    }
  });
};

// Executa varredura e atualização de todas as OPs ativas no banco (para consistência do sistema).
// Hoje rodava em TODA carga de página admin (form/planejamento/dashboard/ops/
// pedidos/produtos/insumos/admin/usuarios/importar), cada vez lendo pedidos+
// programacao inteiros sem escopo, mais uma leitura extra por OP não
// concluída (N+1) -- pressão real e crescente no RTDB conforme o histórico
// aumenta, que piora a chance da leitura de perfil em auth_check.js travar
// (várias leituras grandes competindo pelo mesmo websocket). Cooldown de 5min
// por aba/sessão evita repetir a varredura inteira a cada navegação, sem
// deixar de rodar quando genuinamente faz sentido (primeira carga do dia).
window.syncAllActiveOpsStatus = function() {
  if (typeof firebase === 'undefined') return;
  // Depende de shared/utils.js (getProduzido, sanitizeKey). Páginas que não o
  // carregam -- o CRM/P&D em crm-app.html -- pulam a sincronização (antes dava
  // "getProduzido is not defined" para o ADM nessas telas); a próxima página
  // operacional sincroniza normalmente.
  if (typeof getProduzido !== 'function' || typeof sanitizeKey !== 'function') return;
  // Intervalo de 5 min vale para o NAVEGADOR (localStorage), não por aba: cada
  // aba nova repetia ~1,2 MB de pedidos/programação/OPs/alocações (medido em
  // 14/10/2026). sessionStorage segue como reserva se o localStorage falhar.
  try {
    const store = (function() { try { localStorage.setItem('kuryos_probe', '1'); localStorage.removeItem('kuryos_probe'); return localStorage; } catch (e) { return sessionStorage; } })();
    const last = parseInt(store.getItem('kuryos_last_ops_sync') || '0', 10);
    if (Date.now() - last < 5 * 60 * 1000) return;
    store.setItem('kuryos_last_ops_sync', String(Date.now()));
  } catch (e) { /* armazenamento indisponível -- segue sem cooldown */ }
  const db = firebase.database();

  db.ref('pedidos').once('value', snapshot => {
    const pedidos = snapshot.val() || {};
    db.ref('programacao').once('value', progSnap => {
      const programacao = progSnap.val() || {};
      Object.keys(pedidos).forEach(key => {
        const p = pedidos[key];
        if (p.status !== 'Concluído') {
          window.updateOpStatusAutomatically(key, null, programacao);
        }
      });
      // Mesma varredura, agora pro nível de OP/lote real (ops/) -- até aqui
      // só tinha status setado manualmente em Controle de OPs, ou "Em
      // Produção"/"Concluído" quando alguém apontava produção (ver
      // updateOpRecordOnApontamento em form.html). Nunca virava "Programado"
      // nem "Produção Parcial" (parada), então ficava sempre incompleto.
      window._syncOpsLoteStatusELinha(programacao);
    });
  });
};

// Normaliza a parte numérica do id do pedido (antes do "__sku") removendo
// zeros à esquerda -- mesma correção usada em planejamento.html pra casar
// ops/{lote}.skuPedidoKey com pedidos/{key} mesmo quando um dos dois perdeu
// o zero à esquerda na emissão (ex: "12__SKU" vs "0012__SKU").
function _kuryosNormalizePedidoKey(key) {
  if (!key) return key;
  var parts = String(key).split('__');
  if (parts.length < 2) return key;
  var idPart = parts[0];
  if (/^\d+$/.test(idPart)) idPart = String(parseInt(idPart, 10));
  return idPart + '__' + parts.slice(1).join('__');
}

function _kuryosBuildScheduledPedidoKeySet(programacao) {
  var set = {};
  Object.keys(programacao).forEach(function(date) {
    var dayData = programacao[date] || {};
    Object.keys(dayData).forEach(function(hour) {
      var hourData = dayData[hour] || {};
      for (var l = 1; l <= 10; l++) {
        var slot = hourData['env' + l];
        if (slot && slot.pedidoKey) set[_kuryosNormalizePedidoKey(slot.pedidoKey)] = true;
      }
    });
  });
  return set;
}

// Recalcula status (Não Iniciado/Programado/Em Produção/Produção Parcial) e
// preenche a linha de cada OP real (ops/) que ainda não tenha uma -- mesma
// lógica de status já usada pro nível de pedido, adaptada pra OP: usa
// dataFimReal (atualizado a cada apontamento) como "última atividade" e
// abertaDesde como sinal de que está rodando agora mesmo. A linha só é
// preenchida quando existe um vínculo confirmado no horizonte rolante
// (alocacoes_planejamento vinculado) -- nunca sobrescreve uma linha já
// definida manualmente.
window._syncOpsLoteStatusELinha = function(programacao) {
  if (typeof firebase === 'undefined') return;
  const db = firebase.database();
  const scheduledSet = _kuryosBuildScheduledPedidoKeySet(programacao);

  Promise.all([
    db.ref('ops').once('value'),
    db.ref('alocacoes_planejamento').once('value')
  ]).then(function(results) {
    const ops = results[0].val() || {};
    const alocacoes = Object.values(results[1].val() || {});
    const now = Date.now();
    const twoHoursMs = 2 * 60 * 60 * 1000;

    Object.keys(ops).forEach(function(key) {
      const op = ops[key];
      // 'Cancelado' faltava aqui -- sem essa checagem, essa varredura (roda
      // em TODA carga de página, ver comentário de syncAllActiveOpsStatus)
      // reescrevia o status de qualquer OP cancelada de volta pra "Não
      // Iniciado"/"Programado"/etc pouco depois do cancelamento, silenciosamente
      // desfazendo o cancelOp (ops.html) -- a OP cancelada voltava a aparecer
      // disponível pra alocação em linha/rotulagem como se nada tivesse
      // acontecido, sem nenhum aviso.
      // Achado do Auditor: mesmo problema valia pra QUALQUER correção manual
      // de status feita em ops.html (ex: "Produção Parcial" numa OP travada
      // por abertaDesde obsoleto) -- essa varredura sobrescrevia de volta na
      // próxima carga de página de qualquer admin, sem aviso. statusManualOverride
      // (gravado por updateOpField em ops.html, limpo por clearStatusOverride)
      // avisa pra deixar essa OP em paz até alguém devolver pro automático.
      // 'Aguardando Confirmação' (Fase 7 do plano) entra no mesmo balde de
      // Concluído/Cancelado -- já é um estado "pegajoso" aguardando o PCP,
      // essa varredura automática não deve mais mexer nele.
      if (!op || op.status === 'Concluído' || op.status === 'Cancelado' || op.status === 'Aguardando Confirmação' || op.statusManualOverride) return;

      var updates = {};

      if (!op.linha) {
        // Fase 6 do plano: opLote (vínculo único) virou opsVinculadas (mapa
        // -- uma alocação pode ter várias OPs, um pedido de 10.000 vira N
        // OPs). Não exige mais status==='vinculado' (só bate quando a
        // alocação inteira já foi 100% consumida) -- uma OP específica já
        // está genuinamente vinculada a essa linha mesmo que a alocação
        // ainda esteja 'congelado' aguardando as outras OPs do mesmo bloco.
        var opLoteKeySafe = sanitizeKey(op.lote);
        var alocLinha = alocacoes.find(function(a) {
          return a && a.opsVinculadas && a.opsVinculadas[opLoteKeySafe] && a.linha;
        });
        if (alocLinha) updates.linha = alocLinha.linha;
      }

      const planned = op.qtdPlanejada || 0;
      // Linha/Rotulagem/Posto são somatórias sempre distintas (getProduzido,
      // shared/utils.js), nunca somadas -- mas decisão explícita do usuário
      // pra esta primeira etapa beta: só a Linha decide "Concluído"/"Em
      // Produção" da OP inteira (dado de Rotulagem ainda não é confiável o
      // bastante pra isso). Mesmo escopo de computeOpStatus, mantido em
      // sincronia manual aqui porque essa função tem a nuance extra de
      // "Produção Parcial" (atividade parada há >2h) que computeOpStatus
      // não tem.
      var tiposTocados = ['linha'].filter(function(t) { return getProduzido(op, t) > 0; });
      var todosConcluidos = planned > 0 && tiposTocados.length > 0 &&
        tiposTocados.every(function(t) { return getProduzido(op, t) / planned >= 0.95; });
      const lastTs = op.dataFimReal ? new Date(op.dataFimReal).getTime()
        : (op.dataInicioReal ? new Date(op.dataInicioReal).getTime() : 0);

      var newStatus;
      if (todosConcluidos) {
        // Fase 7 do plano: nunca conclui sozinho -- só sinaliza pro PCP
        // confirmar em ops.html (mesmo raciocínio de computeOpStatus,
        // shared/utils.js, mantido em sincronia aqui).
        newStatus = 'Aguardando Confirmação';
      } else if (tiposTocados.length > 0) {
        newStatus = (now - lastTs) > twoHoursMs ? 'Produção Parcial' : 'Em Produção';
      } else if (op.abertaDesde || op.abertaDesdeRot) {
        // abertaDesdeRot = aberta na Rotulagem (form.html/campoAberturaInicio)
        // -- Linha e Rotulagem são setores diferentes que podem estar
        // trabalhando a mesma OP ao mesmo tempo, em campos de abertura
        // separados; qualquer um dos dois já significa "rodando agora".
        newStatus = 'Em Produção';
      } else if (scheduledSet[_kuryosNormalizePedidoKey(op.skuPedidoKey)]) {
        newStatus = 'Programado';
      } else {
        newStatus = 'Não Iniciado';
      }
      if (newStatus !== op.status) updates.status = newStatus;

      if (Object.keys(updates).length) {
        db.ref('ops/' + key).update(updates);
      }
    });
  });
};

// --- AUTO-AJUSTE DE PLANEJAMENTO ---
// Compara o ritmo real de produção de uma OP (últimas 3h de registros) com o
// planejado, e reajusta automaticamente os slots futuros dela e da fila de
// OPs da mesma linha na grade de programação, registrando cada mudança em
// ajustes_planejamento/{data}. Nunca toca no passado nem na hora corrente;
// nunca move OP entre linhas diferentes; sem limite de alcance da cascata
// dentro da capacidade já existente na grade (se a grade não tiver slots
// futuros suficientes, registra um aviso de capacidade esgotada em vez de
// inventar novos dias/horas fora da configuração do calendário).
window._autoAjusteCooldown = {};

function _kuryosDateStr(d) {
  var local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
}

function _kuryosTodayStr() {
  return _kuryosDateStr(new Date());
}

function _kuryosLineIndexForSlot(hourData, linha) {
  for (var i = 1; i <= 10; i++) {
    var nome = hourData['linha' + i];
    if (!nome) {
      if (linha === 'Linha ' + i) return i;
    } else if (nome === linha) {
      return i;
    }
  }
  return null;
}

function _kuryosMondayOf(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var dw = d.getDay();
  d.setDate(d.getDate() + (dw === 0 ? -6 : 1 - dw));
  return _kuryosDateStr(d);
}

function _kuryosIsConcluidoLike(p) {
  if (!p) return true;
  if (p.statusManual === 'encerrado') return true;
  var st = String(p.status || '').toLowerCase().trim();
  // 'cancelado' tratado como "não disputa mais fila/slot futuro", mesmo
  // raciocínio de opEstaAtiva pras OPs -- pedidos não usam esse status hoje,
  // é só blindagem caso passem a usar no futuro.
  return st.indexOf('conclu') === 0 || st === 'cancelado';
}

// Slots futuros (hoje após a hora atual + dias seguintes) de uma linha,
// ordenados cronologicamente. Cada item: { date, hourKey, envKey, pedidoKey }
function _kuryosFutureSlotsForLinha(programacao, linha, todayStr, nowHour) {
  var out = [];
  Object.keys(programacao).sort().forEach(function(date) {
    if (date < todayStr) return;
    var dayData = programacao[date] || {};
    Object.keys(dayData).sort().forEach(function(hourKey) {
      if (date === todayStr) {
        var h = parseInt(hourKey.replace('_', ':').split(':')[0]);
        if (isNaN(h) || h <= nowHour) return; // nunca toca hoje ate a hora atual
      }
      var hourData = dayData[hourKey] || {};
      var idx = _kuryosLineIndexForSlot(hourData, linha);
      if (!idx) return;
      var envKey = 'env' + idx;
      var slot = hourData[envKey];
      out.push({
        date: date,
        hourKey: hourKey,
        envKey: envKey,
        pedidoKey: slot && slot.pedidoKey ? slot.pedidoKey : null,
        congelamentoLiberado: !!(slot && slot.congelamentoLiberado)
      });
    });
  });
  return out;
}

/* Chave de liga/desliga do motor de reajuste.

   Pedido do usuário (2026-09-09): "conseguimos pausar o auto ajuste do
   planejamento por ora? Está mais confundindo do que ajudando" -- a grade
   mudava sozinha depois de um apontamento e ninguém sabia dizer por quê.

   O guard fica AQUI, no ponto de entrada único, e não em cada chamador: são
   quatro (três em form.html, um em planejamento.html) e um deles esquecido
   deixaria o motor rodando pela metade -- pior que ligado, porque só parte
   da fila se movimenta.

   Ausente = LIGADO, de propósito: o código sozinho não muda comportamento
   nenhum. A pausa é uma decisão gravada em `config/autoAjustePlanejamento`
   pelo ADM, e reversível por lá. */
window.autoAjustePlanejamentoAtivo = function(cfg) {
  // Só `ativo === false` desliga. Nó ausente, objeto vazio ou valor
  // inesperado mantêm ligado -- um dado corrompido não pode desligar
  // silenciosamente uma automação que o PCP acha que está funcionando.
  return !(cfg && cfg.ativo === false);
};

window.autoAjustarPlanejamento = function(pedidoKey) {
  if (typeof firebase === 'undefined' || !pedidoKey) return;
  var db = firebase.database();

  db.ref('config/autoAjustePlanejamento').once('value').then(function(cfgSnap) {
    if (!window.autoAjustePlanejamentoAtivo(cfgSnap.val())) return;
    return _autoAjustarPlanejamentoInterno(db, pedidoKey);
  }).catch(function(err) {
    console.error('Auto-ajuste de planejamento: falha ao ler a configuração —', err);
  });
};

function _autoAjustarPlanejamentoInterno(db, pedidoKey) {
  return db.ref('pedidos/' + pedidoKey).once('value').then(function(pedSnap) {
    var pedidoOrigem = pedSnap.val();
    if (!pedidoOrigem) return;

    // A linha vem direto do cadastro do pedido (pedidos.html grava
    // pedidos/{key}.linha a partir do mesmo <select> que alimenta
    // configLinhas -- mesmíssimos valores comparados against filaLinha
    // logo abaixo, x.p.linha===linha). Achado real (2026-09-04): antes a
    // linha era descoberta procurando um slot FUTURO já ocupado por ESTE
    // pedido em programacao -- se o pedido tivesse caído inteiro pro
    // passado (nenhuma hora futura própria agendada ainda, o cenário
    // exato de "ficou pra trás"), a busca voltava null e a função
    // desistia sem reajustar nada, mesmo com saldo real (qtdTotal-
    // produzido) ainda em aberto. O pedido ficava órfão do motor de
    // reajuste até, por acaso, outro pedido da MESMA linha disparar a
    // função primeiro. Ler direto do cadastro elimina essa dependência.
    var linha = pedidoOrigem.linha || null;
    if (!linha) return; // pedido sem linha definida, nada a reajustar

    // Cooldown por linha — evita recalcular a cada apontamento isolado.
    // Checado ANTES das leituras pesadas abaixo (não precisamos mais
    // varrer toda a programacao futura só pra descobrir a linha).
    var now = Date.now();
    var lastRun = window._autoAjusteCooldown[linha] || 0;
    if (now - lastRun < 3 * 60 * 1000) return;
    window._autoAjusteCooldown[linha] = now;

    var todayStr = _kuryosTodayStr();
    Promise.all([
      // Só datas de hoje em diante importam aqui (tudo antes de todayStr é
      // descartado logo abaixo de qualquer forma — ver _kuryosFutureSlotsForLinha).
      db.ref('programacao').orderByKey().startAt(todayStr).once('value'),
      db.ref('pedidos').once('value'),
      db.ref('config/opAtrasoHoras').once('value'),
      db.ref('alocacoes_planejamento').once('value'),
      db.ref('config/congelamento').once('value')
    ]).then(function(results) {
      var programacao = results[0].val() || {};
      var todosPedidos = results[1].val() || {};
      var opAtrasoHoras = results[2].val() || 1;
      var alocacoes = results[3].val() || {};
      // Zona fixa rolante: além do vínculo explícito de OP emitida acima,
      // qualquer slot já ocupado dentro dos próximos N dias (config.congelamento.diasFixos,
      // padrão 7) também some do pool reajustável -- é o "conforme fosse
      // aproximando, deixássemos fixo" pedido pelo usuário. Só protege o que
      // já está preenchido (slot vazio dentro da janela continua livre pro
      // cascade usar); um planejador pode romper essa proteção por slot via
      // "🔓 Liberar para replanejamento" na Grade Semanal (grava
      // congelamentoLiberado no próprio slot -- ver planejamento.html).
      // `|| 7` engolia o 0: desligar a zona fixa gravando diasFixos:0 não
      // tinha efeito nenhum aqui (0 é falsy -> caía pro default 7), enquanto
      // planejamento.html e admin.html já liam com `!= null` e mostravam a
      // grade destravada. UI e motor discordavam em silêncio.
      var _cong = results[4].val() || {};
      var diasFixos = _cong.diasFixos != null ? _cong.diasFixos : 7;
      var limiteZonaFixaStr = _kuryosDateStr(new Date(Date.now() + diasFixos * 24 * 60 * 60 * 1000));
      // Slots com OP real emitida (alocação 'vinculado') viram fixos -- a
      // automação de reajuste nunca mais mexe neles, é o compromisso real
      // que endurece na zona congelada do horizonte rolante. Chave:
      // pedidoKey|segunda-da-semana|linha.
      var vinculadoSet = {};
      Object.values(alocacoes).forEach(function(a) {
        // Fase 6 do plano: status só vira 'vinculado' quando a alocação
        // inteira já foi 100% consumida (todas as N OPs do bloco emitidas)
        // -- mas mesmo uma OP só (consumo parcial, opsVinculadas não
        // vazio) já é um compromisso real que o reajuste automático não
        // deve mexer, senão reshufflaria a capacidade restante em cima de
        // OPs que já existem de verdade pra esse mesmo bloco.
        if (a && ((a.opsVinculadas && Object.keys(a.opsVinculadas).length) || a.status === 'vinculado')) {
          vinculadoSet[a.pedidoKey + '|' + a.semanaISO + '|' + a.linha] = true;
        }
      });
      var nowHour = new Date().getHours();

      // linha já foi resolvida acima, direto de pedidoOrigem.linha (mesmo
      // valor comparado contra x.p.linha logo abaixo).

      // 2. Fila de OPs ativas dessa linha, por prioridade
      var filaLinha = Object.keys(todosPedidos)
        .map(function(k) { return { key: k, p: todosPedidos[k] }; })
        .filter(function(x) { return x.p && x.p.linha === linha && !_kuryosIsConcluidoLike(x.p); })
        .sort(function(a, b) {
          var pa = a.p.priority || 999, pb = b.p.priority || 999;
          if (pa !== pb) return pa - pb;
          return String(a.p.id || '').localeCompare(String(b.p.id || ''), undefined, { numeric: true });
        });
      if (!filaLinha.length) return;

      // Janela ampla (30 dias) pra alimentar o motor de ritmo demonstrado
      // (shared/utils.js) -- ele mesmo escolhe, dentro disso, as sessões
      // recentes e "limpas" (sem parada relevante, sem sessão curta demais)
      // até KURYOS_RITMO_JANELA_SESSOES. Antes disso aqui era só as
      // últimas 3h -- volátil por natureza, um período atípico virava a
      // meta da linha inteira. Registros são particionados por dia
      // (registros/{data}/...), então basta pedir a partir da data de corte.
      var corte = now - 30 * 24 * 60 * 60 * 1000;
      var corteDateStr = _kuryosDateStr(new Date(corte));
      db.ref('registros').orderByKey().startAt(corteDateStr).once('value').then(function(regSnap) {
        var registros = regSnap.val() || {};

        function ritmoReal(p) {
          var r = kuryosRitmoDemonstrado(registros, { pedidoId: p.id, produto: p.produto });
          return r.fonte === 'demonstrado' ? r.ritmo : 0;
        }

        // 3. Slots futuros já existentes na grade pra essa linha -- exclui os
        // que já têm OP real vinculada (fixos, fora do alcance do cascade) e
        // conta quantas horas fixas cada pedido já tem, pra não tentar
        // reclamar de novo o que já é compromisso real.
        var slotsLinhaTodos = _kuryosFutureSlotsForLinha(programacao, linha, todayStr, nowHour);
        var horasFixasPorPedido = {};
        var slotsLinha = slotsLinhaTodos.filter(function(slot) {
          if (!slot.pedidoKey) return true;
          var semanaISO = _kuryosMondayOf(slot.date);
          var vinculado = vinculadoSet[slot.pedidoKey + '|' + semanaISO + '|' + linha];
          var zonaFixa = !vinculado && !slot.congelamentoLiberado && slot.date < limiteZonaFixaStr;
          if (vinculado || zonaFixa) {
            horasFixasPorPedido[slot.pedidoKey] = (horasFixasPorPedido[slot.pedidoKey] || 0) + 1;
            return false;
          }
          return true;
        });
        if (!slotsLinha.length) return;

        // 4. Relineariza a fila sobre os slots existentes, na ordem de prioridade —
        //    isso já implementa tanto "puxar pra frente" (OP adiantada libera slot,
        //    próxima da fila ocupa) quanto "empurrar" (OP atrasada consome mais slots,
        //    empurrando as seguintes) como resultado natural do mesmo recálculo.
        var updates = {};
        var logEntries = [];
        var ponteiro = 0;
        var semCapacidade = [];

        filaLinha.forEach(function(item) {
          var p = item.p;
          var falta = Math.max((p.qtdTotal || 0) - (p.produzido || 0), 0);
          if (falta <= 0) return;

          var ritmoDemonstradoVal = ritmoReal(p);
          var ritmo = ritmoDemonstradoVal || p.mediaPorHora || 0;
          var horasNecessarias = ritmo > 0 ? Math.ceil(falta / ritmo) : 1;
          // Já tem horas fixas (OP vinculada) cobrindo parte dessa falta --
          // não reclama de novo no pool reajustável.
          horasNecessarias = Math.max(horasNecessarias - (horasFixasPorPedido[item.key] || 0), 0);
          if (horasNecessarias <= 0) return;

          // Corrige pedidos/{key}.mediaPorHora pro ritmo demonstrado (janela
          // de sessões limpas) sempre que houver amostra suficiente -- é o
          // único ponto do app que agora sobrescreve esse campo com o motor
          // novo; form.html continua gravando o ritmo cru de cada fechamento
          // (dado honesto, não mexe nisso), e este passo (que já roda a cada
          // apontamento fechado, via window.autoAjustarPlanejamento) refina
          // pro valor que efetivamente deve guiar o planejamento.
          if (ritmoDemonstradoVal > 0 && ritmoDemonstradoVal !== p.mediaPorHora) {
            updates['pedidos/' + item.key + '/mediaPorHora'] = ritmoDemonstradoVal;
          }

          // OP atrasada (ritmo): ritmo real pior que o planejado a ponto de
          // faltar mais horas do que faltariam no ritmo planejado, além do
          // limiar configurado em admin.html (config.opAtrasoHoras).
          // Achado da 2a rodada de auditoria (PLANO_PLANEJAMENTO_PCP.md,
          // Fase 4): antes empurrava um evento ÚNICO pra alertas_pendentes/,
          // que checkOpsAtrasadas (functions/index.js) consumia e descartava
          // -- se ninguém apontasse de novo (o cenário que mais importa: o
          // gargalo real costuma ser apontamento, não produção em si), nunca
          // gerava outro evento e o alerta nunca repetia. Agora grava um
          // estado AO VIVO em pedidos/{key}.desvioAtraso, recalculado a cada
          // replanejamento (limpo quando o desvio se resolve) -- o cron de
          // 2min do servidor reavalia esse estado direto, com tolerância de
          // 5min + repique a cada 10min enquanto persistir (seção 3 do plano).
          if (p.mediaPorHora > 0 && ritmo > 0 && ritmo < p.mediaPorHora) {
            var horasNoRitmoPlanejado = Math.ceil(falta / p.mediaPorHora);
            var desvioHoras = horasNecessarias - horasNoRitmoPlanejado;
            if (desvioHoras >= opAtrasoHoras) {
              updates['pedidos/' + item.key + '/desvioAtraso'] = {
                linha: linha,
                ritmoReal: Math.round(ritmo),
                ritmoPlanejado: Math.round(p.mediaPorHora),
                desvioHoras: desvioHoras,
                // Preserva o momento da PRIMEIRA detecção -- sem isso, cada
                // replanejamento (roda a cada apontamento fechado) reseta o
                // relógio e a tolerância de 5min do servidor nunca completa.
                detectadoEm: (p.desvioAtraso && p.desvioAtraso.detectadoEm) || new Date().toISOString()
              };
            } else if (p.desvioAtraso) {
              updates['pedidos/' + item.key + '/desvioAtraso'] = null;
            }
          } else if (p.desvioAtraso) {
            updates['pedidos/' + item.key + '/desvioAtraso'] = null;
          }

          for (var i = 0; i < horasNecessarias; i++) {
            if (ponteiro >= slotsLinha.length) {
              if (semCapacidade.indexOf(p.id || item.key) === -1) semCapacidade.push(p.id || item.key);
              break;
            }
            var slot = slotsLinha[ponteiro];
            if (slot.pedidoKey !== item.key) {
              var path = 'programacao/' + slot.date + '/' + slot.hourKey + '/' + slot.envKey;
              updates[path] = { pedidoKey: item.key, produto: p.produto || '', sku: p.sku || '', mediaPorHora: ritmo || p.mediaPorHora || 0 };
              logEntries.push({
                timestamp: new Date().toISOString(),
                linha: linha,
                data: slot.date,
                hora: slot.hourKey.replace('_', ':'),
                de: slot.pedidoKey ? (todosPedidos[slot.pedidoKey] ? todosPedidos[slot.pedidoKey].id : slot.pedidoKey) : null,
                para: p.id || item.key,
                motivo: 'reajuste automático de ritmo'
              });
            }
            ponteiro++;
          }
        });

        // Slots sobrando no fim da grade (ninguém mais precisa deles) ficam livres
        for (var j = ponteiro; j < slotsLinha.length; j++) {
          if (slotsLinha[j].pedidoKey) {
            var freePath = 'programacao/' + slotsLinha[j].date + '/' + slotsLinha[j].hourKey + '/' + slotsLinha[j].envKey;
            updates[freePath] = null;
          }
        }

        if (Object.keys(updates).length > 0) {
          db.ref().update(updates).then(function() {
            var logRef = db.ref('ajustes_planejamento/' + todayStr);
            logEntries.forEach(function(entry) { logRef.push(entry); });
            if (semCapacidade.length) {
              logRef.push({
                timestamp: new Date().toISOString(),
                linha: linha,
                motivo: 'Capacidade esgotada: OP(s) ' + semCapacidade.join(', ') + ' não têm slot futuro suficiente na grade atual. Amplie a programação manualmente.'
              });
            }
          });
        }
      });
    });
  });
};
// Kuryos Design System global (Apple UI + ícones vetoriais).
(function() {
  if (!document.querySelector('link[data-kuryos-apple-system]')) {
    var style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'shared/kuryos-apple-system.css?v=20261007-1';
    style.setAttribute('data-kuryos-apple-system', '');
    document.head.appendChild(style);
  }
  if (!document.querySelector('script[data-kuryos-icon-system]')) {
    var icons = document.createElement('script');
    icons.src = 'shared/kuryos-icon-system.js?v=20261013-apple2';
    icons.defer = true;
    icons.setAttribute('data-kuryos-icon-system', '');
    document.head.appendChild(icons);
  }
  if (!document.querySelector('link[data-kuryos-enterprise-shell]')) {
    var enterpriseStyle = document.createElement('link');
    enterpriseStyle.rel = 'stylesheet';
    enterpriseStyle.href = 'shared/kuryos-enterprise-shell.css?v=20261008-6';
    enterpriseStyle.setAttribute('data-kuryos-enterprise-shell', '');
    document.head.appendChild(enterpriseStyle);
  }
  if (!document.querySelector('link[data-kuryos-repo-visual]')) {
    var referenceStyle = document.createElement('link');
    referenceStyle.rel = 'stylesheet';
    referenceStyle.href = 'shared/kuryos-repo-visual.css?v=20261029-menu';
    referenceStyle.setAttribute('data-kuryos-repo-visual', '');
    document.head.appendChild(referenceStyle);
  }
  if (!document.querySelector('script[data-kuryos-enterprise-shell]')) {
    var enterpriseShell = document.createElement('script');
    enterpriseShell.src = 'shared/kuryos-enterprise-shell.js?v=20261020-3';
    enterpriseShell.defer = true;
    enterpriseShell.setAttribute('data-kuryos-enterprise-shell', '');
    document.head.appendChild(enterpriseShell);
  }
  if (!document.querySelector('script[data-kuryos-ui]')) {
    var ui = document.createElement('script');
    ui.src = 'shared/kuryos-ui.js?v=20261012-2';
    ui.defer = true;
    ui.setAttribute('data-kuryos-ui', '');
    document.head.appendChild(ui);
  }
  // Aspecto do ERP no ar (20/10/2026): cabeçalhos, KPIs, painéis e gráficos.
  // A navegação continua na barra lateral inteligente.
  if (!document.querySelector('link[data-kuryos-erp-ref]')) {
    var erpRef = document.createElement('link');
    erpRef.rel = 'stylesheet';
    erpRef.href = 'shared/kuryos-erp-ref.css?v=20261020-2';
    erpRef.setAttribute('data-kuryos-erp-ref', '');
    document.head.appendChild(erpRef);
  }
  if (!document.querySelector('script[data-kuryos-erp-ref]')) {
    var erpRefJs = document.createElement('script');
    erpRefJs.src = 'shared/kuryos-erp-ref.js?v=20261020-2';
    erpRefJs.setAttribute('data-kuryos-erp-ref', '');
    document.head.appendChild(erpRefJs);
  }
})();

