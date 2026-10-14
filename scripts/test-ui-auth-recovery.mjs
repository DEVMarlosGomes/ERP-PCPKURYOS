import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/auth_check.js', import.meta.url), 'utf8');
function scenario(profile) {
  const elements = new Map(), timers = new Map(), callbacks = new Map();
  let nextTimer = 0, authCallback, profileCallback;
  const events = [], alerts = [];
  const classes = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  function element() {
    const item = {
      id: '', style: {}, classList: classes, children: [],
      setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, addEventListener() {}, querySelector() { return null; },
      appendChild(child) { this.children.push(child); if (child.id) elements.set(child.id, child); return child; },
      remove() { elements.delete(this.id); },
    };
    Object.defineProperty(item, 'innerHTML', { set(value) {
      for (const match of String(value).matchAll(/id="([^"]+)"/g)) { const child = element(); child.id = match[1]; elements.set(child.id, child); }
    } });
    return item;
  }
  const document = {
    readyState: 'loading', head: element(), body: element(), documentElement: element(),
    createElement: element, querySelector() { return null; }, querySelectorAll() { return []; },
    getElementById(id) { return elements.get(id) || null; },
    addEventListener(name, callback) { callbacks.set(name, callback); },
  };
  document.documentElement.dataset = {};
  const location = { pathname: '/cadastros.html', href: '/cadastros.html', search: '' };
  const storage = new Map();
  const localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const media = { matches: false, addEventListener() {} };
  const firebase = {
    auth() { return { onAuthStateChanged(callback) { authCallback = callback; } }; },
    database() { return { ref(path) {
      // usuarios_publico/{uid}: índice nome+papel do próprio usuário (14/10), não dado operacional.
      assert.ok(['usuarios/teste-ui', 'usuarios_publico/teste-ui'].includes(path), 'a recuperação não deve tocar dados operacionais: ' + path);
      return { once(event, callback) { profileCallback = callback; } };
    } }; },
  };
  const window = {
    location, localStorage, matchMedia() { return media; }, addEventListener() {},
    dispatchEvent(event) { events.push(event.type); },
  };
  const context = {
    window, document, location, localStorage, firebase, matchMedia: () => media,
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() { return 0; }, clearInterval() {},
    CustomEvent: class { constructor(type) { this.type = type; } },
    console: { error() {}, warn() {}, log() {} }, alert: message => alerts.push(message),
  };
  runInNewContext(source, context);
  // A apresentação da navbar não participa do contrato de autorização testado.
  runInNewContext('renderUnifiedNavbar = function() { window.uiRendered = true; };', context);
  callbacks.get('DOMContentLoaded')();
  authCallback({ uid: 'teste-ui', email: 'teste@example.test' });
  assert.equal(window.currentUser, null, 'perfil ainda não foi validado');
  [...timers.values()].find(timer => timer.delay === 12000).fn();
  assert.ok(elements.has('kt-auth-error-overlay'), 'leitura lenta precisa mostrar orientação');
  profileCallback({ val: () => profile });
  assert.equal(elements.has('kt-auth-error-overlay'), false, 'resultado tardio deve retirar aviso bloqueador');
  return { window, location, events, alerts };
}

const allowed = scenario({ nome: 'Teste UI', role: 'pcp', modulos: { cadastros: true } });
assert.equal(allowed.window.uiRendered, true);
assert.equal(allowed.window.currentUser.role, 'pcp');
assert.ok(allowed.events.includes('kuryos-auth-pronto'));
assert.equal(allowed.location.href, '/cadastros.html');

const denied = scenario({ nome: 'Teste UI', role: 'production', modulos: { envase: true } });
assert.equal(denied.window.uiRendered, undefined, 'acesso negado não pode montar a UI autorizada');
assert.ok(denied.alerts.some(message => message.includes('Acesso Negado')));
assert.notEqual(denied.location.href, '/cadastros.html');
console.log('OK: autenticação tardia libera a UI; perfil sem módulo continua negado; nenhuma escrita operacional.');
