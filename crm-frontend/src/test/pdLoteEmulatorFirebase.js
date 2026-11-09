// Ponte de teste da manipulação em lote: API real do CRM -> RTDB com as regras reais -> callables reais,
// com troca de usuário (a química que monta e pesa, a colega que confere). Só no emulador demo-pd-lote.
import {createRequire} from 'node:module';
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9063' || process.env.GCLOUD_PROJECT !== 'demo-pd-lote') throw Error('Exige demo-pd-lote no emulador 9063');
const req = createRequire(new URL('../../../functions/package.json', import.meta.url));
const {initializeApp, getApp, getApps, deleteApp} = req('firebase-admin/app');
const {getDatabase, ServerValue} = req('firebase-admin/database');
const databaseURL = 'http://127.0.0.1:9063?ns=demo-pd-lote-default-rtdb';
process.env.FIREBASE_CONFIG = JSON.stringify({projectId: 'demo-pd-lote', databaseURL});
const fns = req('./index.js'); // O módulo real inicializa o app padrão (servidor) pelo FIREBASE_CONFIG.
export const root = getDatabase(getApp());

let atual = 'pd';
const clientes = new Map();
const cliente = () => {
  if (!clientes.has(atual)) {
    clientes.set(atual, getDatabase(initializeApp({projectId: 'demo-pd-lote', databaseURL, databaseAuthVariableOverride: {uid: atual, token: {auth_time: 200}}}, `lote-${atual}`)));
  }
  return clientes.get(atual);
};
export const comoUsuario = (uid) => { atual = uid; };
export const databaseModule = {
  ref: (_db, path) => (path ? cliente().ref(path) : cliente().ref()), get: (r) => r.get(), set: (r, v) => r.set(v),
  update: (r, v) => r.update(v), remove: (r) => r.remove(), push: (r) => r.push(),
  runTransaction: (r, fn) => r.transaction(fn), serverTimestamp: () => ServerValue.TIMESTAMP,
};
export const firebaseModule = {firebaseDb: {}, firebaseStorage: {}, firebaseAuth: {get currentUser() { return {uid: atual, email: `${atual}@example.test`}; }}};
export const storageModule = {ref: () => { throw Error('Storage não faz parte deste teste'); }, uploadBytes: () => { throw Error('Não permitido'); }, getDownloadURL: () => { throw Error('Não permitido'); }};
// Erro da callable no mesmo formato que lib/servidor.js entrega ao adaptador (status + detalhe).
const comoErroDaApi = (e) => Object.assign(new Error(e?.message || String(e)), {code: e?.code, response: {status: 400, data: {detail: e?.details ? {...e.details, message: e.message} : e?.message}}});
export const serverModule = {
  ORIGEM_FUNCOES: 'emulator-only',
  liberarEtapaPd: (requestId, novoStatus, voltar = false) => fns.liberarEtapaPd.run({auth: {uid: atual}, data: {requestId, novoStatus, voltar}}).catch((e) => { throw comoErroDaApi(e); }),
  chamarServidor: (name, data) => {
    if (!fns[name]?.run) throw Error('Callable inesperada: ' + name);
    return fns[name].run({auth: {uid: atual}, data}).catch((e) => { throw comoErroDaApi(e); });
  },
};
export const stop = () => Promise.all(getApps().map(deleteApp));
