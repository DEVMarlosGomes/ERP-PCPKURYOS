'use strict';
/* RTDB simulado para os testes de handler que gravam via functions/transacao_raiz.js.
   `h.state` é o banco; `h.race(state)`, se definido, roda uma vez logo antes da leitura
   da raiz (simula outra tela/operação gravando antes desta). `h.pushes` conta push(). */
function criarFakeDb(h) {
  const partes = (p) => String(p || '').split('/').filter(Boolean);
  const ler = (p) => partes(p).reduce((n, k) => (n == null ? undefined : n[k]), h.state);
  const gravar = (p, v) => {
    const ks = partes(p); let o = h.state;
    ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = structuredClone(v);
  };
  h.pushes = h.pushes || 0;
  h.updates = h.updates || [];
  return {ref(path = '') {
    return {
      once: async () => {
        if (!path && h.race) { const r = h.race; h.race = null; r(h.state); }
        const v = path ? ler(path) : h.state;
        return {val: () => (v === undefined ? null : structuredClone(v))};
      },
      get: async () => { const v = ler(path); return {val: () => (v === undefined ? null : structuredClone(v))}; },
      push() { h.pushes++; return {key: 'pk' + String(h.pushes).padStart(6, '0')}; },
      transaction: async (cb) => {
        if (!path) throw new Error('transação na raiz não deve mais acontecer');
        const novo = cb(structuredClone(ler(path) === undefined ? null : ler(path)));
        if (novo === undefined) return {committed: false};
        gravar(path, novo); return {committed: true};
      },
      update: async (obj) => {
        if (path) throw new Error('update esperado na raiz');
        h.updates.push(Object.keys(obj));
        Object.entries(obj).forEach(([k, v]) => gravar(k, v));
      }
    };
  }};
}
module.exports = {criarFakeDb};
