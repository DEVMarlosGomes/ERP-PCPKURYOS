// Firebase em memória para testar o adaptador (src/lib/firebaseApi.js) no Vitest.
// Uso em um arquivo de teste:
//   vi.mock("firebase/database", () => import("@/test/memoryFirebase").then((m) => m.databaseModule));
//   vi.mock("firebase/storage", () => import("@/test/memoryFirebase").then((m) => m.storageModule));
//   vi.mock("@/lib/firebase", () => import("@/test/memoryFirebase").then((m) => m.firebaseModule));
//   vi.mock("@/lib/justificationPrompt", async (orig) => ({ ...(await orig()), askJustification: (d) => memory.prompt(d) }));
// e, antes de importar o adaptador, memory.reset(seed).
// Relógio e IDs são determinísticos: cada new Date() avança 1 s e randomUUID conta.

const parts = (p) => String(p || "").split("/").filter(Boolean);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const RealDate = Date;
let clock = RealDate.UTC(2026, 9, 13, 12, 0, 0);
let seq = 0;

class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else { clock += 1000; super(clock); }
  }
  static now() { clock += 1000; return clock; }
}

export const memory = {
  root: {},
  auth: { currentUser: null },
  prompt: async () => null,
  // Caminhos cuja leitura é negada (simula PERMISSION_DENIED das regras).
  denied: new Set(),
  reset(seed = {}, { prompt } = {}) {
    this.root = clone(seed) || {};
    this.auth.currentUser = null;
    this.denied = new Set();
    this.prompt = prompt || (async () => null);
    clock = RealDate.UTC(2026, 9, 13, 12, 0, 0);
    seq = 0;
    globalThis.Date = FakeDate;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { ...globalThis.crypto, randomUUID: () => `id-${String(++seq).padStart(5, "0")}`, getRandomValues: (a) => a },
    });
  },
  restore() { globalThis.Date = RealDate; },
  setUser(uid) { this.auth.currentUser = uid ? { uid, email: `${uid}@kuryos.test` } : null; },
  read(p) { return clone(parts(p).reduce((o, k) => (o == null ? undefined : o[k]), this.root)); },
  write(p, v) {
    const ks = parts(p);
    let o = this.root;
    ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== "object") o[k] = {}; o = o[k]; });
    if (v == null) delete o[ks[ks.length - 1]];
    else o[ks[ks.length - 1]] = clone(v);
  },
};

const snapshot = (p) => {
  const value = memory.read(p);
  const val = value === undefined ? null : value;
  return { val: () => clone(val), exists: () => val !== null, key: parts(p).pop() };
};

export const databaseModule = {
  ref: (_db, p) => ({ path: p || "", key: parts(p).pop() }),
  get: async (r) => {
    if (memory.denied.has(String(r.path))) throw new Error("PERMISSION_DENIED: Permission denied");
    return snapshot(r.path);
  },
  set: async (r, v) => memory.write(r.path, v),
  remove: async (r) => memory.write(r.path, null),
  runTransaction: async (r, fn) => {
    const next = fn(memory.read(r.path) ?? null);
    if (next === undefined) return { committed: false, snapshot: snapshot(r.path) };
    memory.write(r.path, next);
    return { committed: true, snapshot: snapshot(r.path) };
  },
  update: async (r, obj) => Object.entries(obj).forEach(([k, v]) => memory.write(`${r.path}/${k}`, v)),
  push: (r) => { seq += 1; return { path: `${r.path}/-K${seq}`, key: `-K${seq}` }; },
};

export const storageModule = {
  ref: (_s, p) => ({ path: p }),
  uploadBytes: async () => ({}),
  getDownloadURL: async (r) => `https://storage.test/${r.path}`,
};

export const firebaseModule = { firebaseDb: {}, firebaseStorage: {}, firebaseAuth: memory.auth };

// Espera um erro HTTP do adaptador com o status dado (e, opcionalmente, texto).
export async function expectStatus(promise, status, pattern) {
  let error;
  try { await promise; } catch (e) { error = e; }
  if (!error) throw new Error(`esperava erro ${status}`);
  if (error.response?.status !== status) throw new Error(`status ${error.response?.status}: ${error.message}`);
  if (pattern && !pattern.test(error.message)) throw new Error(`mensagem "${error.message}" não casa ${pattern}`);
  return error;
}
