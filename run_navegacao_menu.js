'use strict';
/* Monta o menu lateral de verdade (renderUnifiedNavbar do auth_check.js) no
   Node, sem navegador, e devolve os links que a pessoa vê. Serve a dois usos:
   - gerar a fixture do menu ANTIGO (montado à mão) a partir do auth_check.js
     de um commit: node run_navegacao_menu.js --fixture <arquivo-auth_check.js>
   - o teste run_navegacao_test.js, que monta o menu NOVO (registro único em
     shared/navegacao.js) pelo mesmo caminho e compara com a fixture.
   Executa o arquivo inteiro: testa a ligação auth_check -> registro, não só a
   função isolada (CLAUDE.md: "testar a unidade não basta"). */
const vm = require('node:vm');
const fs = require('node:fs');

/* Perfis do aceite do MENU-01: cada papel e combinações de módulos marcados. */
const PERFIS = {
  admin: {role: 'admin'},
  pcp: {role: 'pcp'},
  gestor: {role: 'gestor'},
  qualidade: {role: 'qualidade'},
  rotulagem: {role: 'rotulagem'},
  logistica: {role: 'logistica'},
  comercial: {role: 'comercial'},
  pd: {role: 'pd'},
  production: {role: 'production'},
  rh: {role: 'rh'},
  tv: {role: 'tv'},
  pending: {role: 'pending'},
  financeiro: {role: 'gestor', modulos: {financeiro: true}},
  controladoria: {role: 'gestor', modulos: {controladoria: true}},
  financeiroControladoria: {role: 'gestor', modulos: {financeiro: true, controladoria: true}},
  diretoria: {role: 'gestor', modulos: {custos: true, placar: true, analytics: true, financeiro: true, controladoria: true}},
  soManipulacao: {role: 'gestor', modulos: {manipulacao: true}},
  soConferencia: {role: 'gestor', modulos: {conferencia_pesagem: true}},
  soCompras: {role: 'gestor', modulos: {compras: true}},
  comprasLogistica: {role: 'gestor', modulos: {compras: true, logistica: true}},
  soPedidos: {role: 'gestor', modulos: {pedidos: true}},
  comercialPedidos: {role: 'gestor', modulos: {comercial: true, pedidos: true}},
  comercialPd: {role: 'gestor', modulos: {comercial: true, pd: true}},
  comercialLogistica: {role: 'gestor', modulos: {comercial: true, logistica: true}},
  qualidadeLogistica: {role: 'gestor', modulos: {qualidade: true, logistica: true}},
  qualidadeEmitirOp: {role: 'gestor', modulos: {qualidade: true, emitir_op: true}},
  qualidadeMarcada: {role: 'qualidade', modulos: {qualidade: true}},
  soPlanejamento: {role: 'gestor', modulos: {planejamento: true}},
  planejamentoCadastros: {role: 'gestor', modulos: {planejamento: true, cadastros: true}},
  apontamentoLegado: {role: 'gestor', modulos: {apontamento: true}},
  apontamentoSemManip: {role: 'gestor', modulos: {apontamento: true, manipulacao: false}},
  rotulagemPlanejamento: {role: 'gestor', modulos: {rotulagem: true, planejamento: true}},
  producaoRotulagem: {role: 'gestor', modulos: {apontamento: true, rotulagem: true, manipulacao: false}},
  configUsuarios: {role: 'gestor', modulos: {config: true, usuarios: true}},
  rhDash: {role: 'gestor', modulos: {rh_dashboard: true}},
  nadaMarcado: {role: 'gestor', modulos: {}},
  pcpComFuncaoComercial: {role: 'pcp', funcoes: {comercial: true}},
  pdComFuncaoQualidade: {role: 'pd', funcoes: {qualidade: true}},
  funcoesRecalculadas: {role: 'logistica', funcoes: {qualidade: true}, modulosDasFuncoes: true, modulos: {logistica: true}}
};

function elemento(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), innerHTML: '', className: '', id: '', style: {}, dataset: {},
    attrs: {}, filhos: [],
    classList: {add() {}, remove() {}, toggle() {}, contains() { return false; }},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild(c) { this.filhos.push(c); return c; }, insertBefore(c) { this.filhos.push(c); return c; },
    insertAdjacentElement() {}, insertAdjacentHTML() {}, remove() {}, closest() { return null; },
    get firstChild() { return this.filhos[0] || null; }
  };
  return el;
}

/* Executa o auth_check.js (e, se dado, o registro de telas antes) num contexto
   isolado e devolve o HTML do menu para o usuário. */
function htmlDoMenu(fonteAuth, user, fonteNav, pagina) {
  const doc = elemento('document');
  const head = elemento('head');
  const body = elemento('body');
  let criado = null;
  Object.assign(doc, {
    readyState: 'complete', head, body, documentElement: elemento('html'),
    createElement(tag) { const e = elemento(tag); if (tag === 'aside') criado = e; return e; },
    getElementById() { return null; }, write() {}
  });
  const pg = pagina || 'dashboard.html';
  const ctx = {
    console, document: doc, navigator: {userAgent: 'node'},
    location: {pathname: '/' + pg.split('?')[0], search: pg.indexOf('?') >= 0 ? '?' + pg.split('?')[1] : '', hostname: 'app.test', href: ''},
    localStorage: {getItem() { return null; }, setItem() {}, removeItem() {}},
    matchMedia() { return {matches: false, addEventListener() {}}; },
    setTimeout() { return 0; }, clearTimeout() {}, requestAnimationFrame() { return 0; },
    CustomEvent: function CustomEvent() {}, MutationObserver: function() { return {observe() {}}; },
    addEventListener() {}, dispatchEvent() {}
  };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  if (fonteNav) vm.runInContext(fonteNav, ctx, {filename: 'navegacao.js'});
  vm.runInContext(fonteAuth, ctx, {filename: 'auth_check.js'});
  const usuario = Object.assign({uid: 'u1', nome: 'Pessoa Teste', email: 't@kuryos.com', modulos: null, funcoes: null}, user);
  ctx.renderUnifiedNavbar(usuario);
  if (!criado) throw new Error('renderUnifiedNavbar não criou a barra lateral');
  return criado.innerHTML;
}

/* HTML do menu -> [{grupo, sub, href, rotulo, ativo}] na ordem em que aparecem. */
function linksDoHtml(html) {
  const out = [];
  const grupos = html.split('<div class="kt-nav-group');
  grupos.slice(1).forEach((g) => {
    const nome = (g.match(/data-grupo="([^"]+)"/) || [])[1] || null;
    let sub = null;
    const re = /<div class="kt-nav-sub">([^<]+)<\/div>|<a class="kt-nav-link( active)?"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span>([^<]*)<\/span><\/a>/g;
    let m;
    while ((m = re.exec(g))) {
      if (m[1]) { sub = m[1]; continue; }
      out.push({grupo: nome, sub, href: m[3], rotulo: m[4], ativo: !!m[2]});
    }
  });
  // Links fora de bloco (ex.: Início no topo).
  const topo = grupos[0];
  const reTopo = /<a class="kt-nav-link( active)?"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span>([^<]*)<\/span><\/a>/g;
  let t;
  while ((t = reTopo.exec(topo))) out.unshift({grupo: null, sub: null, href: t[2], rotulo: t[3], ativo: !!t[1]});
  return out;
}

function linksDoMenu(fonteAuth, user, fonteNav, pagina) {
  return linksDoHtml(htmlDoMenu(fonteAuth, user, fonteNav, pagina));
}

module.exports = {PERFIS, htmlDoMenu, linksDoHtml, linksDoMenu};

if (require.main === module && process.argv[2] === '--fixture') {
  const arquivo = process.argv[3];
  const fonte = fs.readFileSync(arquivo, 'utf8');
  const out = {};
  Object.keys(PERFIS).forEach((nome) => {
    out[nome] = linksDoMenu(fonte, PERFIS[nome]).map((l) => ({grupo: l.grupo, href: l.href, rotulo: l.rotulo}));
  });
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');
}
