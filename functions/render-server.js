// Servidor das Cloud Functions do PCP para rodar fora do Firebase (Render, plano
// gratuito), reaproveitando o MESMO functions/index.js — nenhuma regra de negócio
// é reescrita aqui. Mantém o Firebase no plano gratuito (Spark): banco e login
// continuam lá; só a execução das funções muda de lugar.
//
//   - onCall (11 ações de tela): POST /<nome> no protocolo callable do SDK
//     ({data} -> {result} | {error}), com o token do usuário verificado;
//   - onRequest (criarOP, criarPedido): POST /<nome>, como antes;
//   - onSchedule (checkNotificacoes): temporizador no próprio processo;
//   - gatilhos do banco (6): escutas no RTDB que comparam o estado anterior com o
//     novo e chamam o mesmo handler com {params, data, id}. Só disparam para o que
//     muda com o servidor no ar (o estado ao ligar é a linha de base).
//
// Variáveis de ambiente (Render > Environment):
//   FIREBASE_SERVICE_ACCOUNT  JSON da conta de serviço do projeto (obrigatória)
//   FIREBASE_DATABASE_URL     ex.: https://erpkuryos-default-rtdb.firebaseio.com
//   CORS_ORIGINS              origens do site, separadas por vírgula
//   MS_GRAPH_*, OPS_API_KEY, PEDIDOS_API_KEY  mesmos segredos das functions
//   DISABLE_TRIGGERS=1 / DISABLE_SCHEDULE=1   para desligar partes (testes)
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

// ── Configuração do firebase-admin ANTES de carregar index.js ─────────────────
function configureFirebaseEnv(env = process.env) {
  if (env.FIREBASE_SERVICE_ACCOUNT && !env.GOOGLE_APPLICATION_CREDENTIALS) {
    const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const file = path.join(os.tmpdir(), "firebase-service-account.json");
    fs.writeFileSync(file, JSON.stringify(account), { mode: 0o600 });
    env.GOOGLE_APPLICATION_CREDENTIALS = file;
    env.GCLOUD_PROJECT = env.GCLOUD_PROJECT || account.project_id;
  }
  const projectId = env.GCLOUD_PROJECT;
  if (!env.FIREBASE_CONFIG && projectId) {
    env.FIREBASE_CONFIG = JSON.stringify({
      projectId,
      databaseURL: env.FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`,
      storageBucket: env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
    });
  }
}

// ── Protocolo callable (o mesmo que firebase.functions().httpsCallable usa) ──
function callableError(err) {
  const code = err && err.httpErrorCode;
  if (code && typeof err.toJSON === "function") return { status: code.status, body: { error: err.toJSON() } };
  console.error("[callable] erro interno:", err);
  return { status: 500, body: { error: { status: "INTERNAL", message: "INTERNAL" } } };
}

function readBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("payload grande demais")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Mínimo de Express que os handlers onRequest usam (req.get, req.body, res.status().json()).
function expressLike(req, res, raw) {
  req.get = (name) => req.headers[String(name).toLowerCase()];
  req.header = req.get;
  req.rawBody = raw;
  try { req.body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; } catch { req.body = {}; }
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(obj)); return res; };
  res.send = (body) => (typeof body === "object" && !Buffer.isBuffer(body) ? res.json(body) : (res.end(body), res));
  res.set = (k, v) => { res.setHeader(k, v); return res; };
  return { req, res };
}

function kindOf(fn) {
  const ep = fn && fn.__endpoint;
  if (!ep) return null;
  if (ep.callableTrigger) return "callable";
  if (ep.httpsTrigger) return "request";
  if (ep.scheduleTrigger) return "schedule";
  if (ep.eventTrigger) return "event";
  return null;
}

function createServer({ fns, admin, corsOrigins = [], log = console }) {
  const allowAll = corsOrigins.includes("*");
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && (allowAll || corsOrigins.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Firebase-AppCheck, X-Firebase-GMPID, Firebase-Instance-ID-Token, X-Client-Version, X-API-Key");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "3600");
    }
    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
    const name = decodeURIComponent((req.url || "/").split("?")[0].replace(/^\/+|\/+$/g, ""));
    if (req.method === "GET" && (name === "" || name === "health")) {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, funcoes: Object.keys(fns).length, em: new Date().toISOString() }));
    }
    const fn = Object.prototype.hasOwnProperty.call(fns, name) ? fns[name] : null;
    const kind = kindOf(fn);
    if (!fn || !["callable", "request"].includes(kind)) { res.statusCode = 404; return res.end("Função não encontrada"); }
    let raw;
    try { raw = await readBody(req); } catch (e) { res.statusCode = 413; return res.end(e.message); }

    if (kind === "request") {
      const { req: r, res: s } = expressLike(req, res, raw);
      try { await fn(r, s); } catch (e) { log.error(`[${name}]`, e); if (!res.writableEnded) s.status(500).json({ ok: false, error: "Erro interno" }); }
      return;
    }

    // callable
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "POST") { res.statusCode = 405; return res.end(JSON.stringify({ error: { status: "INVALID_ARGUMENT", message: "Use POST" } })); }
    let payload;
    try { payload = JSON.parse(raw.toString("utf8") || "{}"); } catch { payload = null; }
    if (!payload || typeof payload !== "object" || !("data" in payload)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: { status: "INVALID_ARGUMENT", message: "Bad Request" } }));
    }
    let auth;
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
    if (bearer) {
      try {
        const token = await admin.auth().verifyIdToken(bearer[1]);
        auth = { uid: token.uid, token, rawToken: bearer[1] };
      } catch {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: { status: "UNAUTHENTICATED", message: "Unauthenticated" } }));
      }
    }
    try {
      const result = await fn.run({ data: payload.data, auth, rawRequest: req, acceptsStreaming: false });
      res.statusCode = 200;
      res.end(JSON.stringify({ result: result === undefined ? null : result }));
    } catch (err) {
      const { status, body } = callableError(err);
      res.statusCode = status;
      res.end(JSON.stringify(body));
    }
  });
}

// ── Gatilhos do banco por escuta ─────────────────────────────────────────────
// "/ops/{opKey}/status" -> { prefix: "ops", parts: ["{opKey}", "status"] }
function parsePattern(ref) {
  const segs = String(ref).replace(/^\/+|\/+$/g, "").split("/");
  const first = segs.findIndex((s) => /^\{.+\}$/.test(s));
  return { prefix: segs.slice(0, first < 0 ? segs.length : first).join("/"), parts: segs.slice(first < 0 ? segs.length : first) };
}

// Todos os caminhos (relativos ao prefixo) que casam com o padrão, com seus parâmetros.
function matchAll(value, parts, rel = [], params = {}, out = []) {
  if (!parts.length) { out.push({ rel: rel.join("/"), params, value }); return out; }
  if (value === null || typeof value !== "object") return out;
  const [head, ...rest] = parts;
  const wild = /^\{(.+)\}$/.exec(head);
  if (wild) {
    for (const [k, v] of Object.entries(value)) matchAll(v, rest, [...rel, k], { ...params, [wild[1]]: k }, out);
  } else if (Object.prototype.hasOwnProperty.call(value, head)) {
    matchAll(value[head], rest, [...rel, head], params, out);
  }
  return out;
}

const fakeSnapshot = (value, ref) => ({ val: () => (value === undefined ? null : JSON.parse(JSON.stringify(value))), exists: () => value !== undefined && value !== null, ref, key: ref ? ref.key : null });

// Diferenças entre dois estados de um prefixo para um gatilho (created/written).
function diffTrigger(kind, parts, before, after) {
  const prev = new Map(matchAll(before, parts).map((m) => [m.rel, m]));
  const next = new Map(matchAll(after, parts).map((m) => [m.rel, m]));
  const events = [];
  for (const [rel, m] of next) {
    const old = prev.get(rel);
    if (kind === "created" && !old) events.push({ rel, params: m.params, before: undefined, after: m.value });
    if (kind === "written" && (!old || JSON.stringify(old.value) !== JSON.stringify(m.value))) events.push({ rel, params: m.params, before: old && old.value, after: m.value });
  }
  if (kind === "written") for (const [rel, m] of prev) if (!next.has(rel)) events.push({ rel, params: m.params, before: m.value, after: undefined });
  return events;
}

function startTriggers({ fns, db, log = console }) {
  const byPrefix = new Map();
  for (const [name, fn] of Object.entries(fns)) {
    if (kindOf(fn) !== "event") continue;
    const ep = fn.__endpoint.eventTrigger;
    const ref = (ep.eventFilterPathPatterns && ep.eventFilterPathPatterns.ref) || (ep.eventFilters && ep.eventFilters.ref);
    const kind = /\.created$/.test(ep.eventType) ? "created" : /\.written$/.test(ep.eventType) ? "written" : null;
    if (!ref || !kind) { log.warn(`[gatilho] ${name}: tipo não suportado (${ep.eventType})`); continue; }
    const { prefix, parts } = parsePattern(ref);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push({ name, fn, kind, parts });
  }
  const queue = new Map(); // um handler por vez por função, na ordem dos eventos
  const enqueue = (name, task) => { const p = (queue.get(name) || Promise.resolve()).then(task).catch((e) => log.error(`[gatilho ${name}]`, e)); queue.set(name, p); return p; };
  const unsubscribers = [];
  for (const [prefix, triggers] of byPrefix) {
    const ref = db.ref(prefix);
    let state; // undefined até a primeira leitura = linha de base (não dispara)
    const onValue = (snap) => {
      const value = snap.val();
      if (state !== undefined) {
        for (const t of triggers) {
          for (const ev of diffTrigger(t.kind, t.parts, state, value)) {
            const childRef = db.ref(prefix + "/" + ev.rel);
            const data = t.kind === "created" ? snap.child(ev.rel) : { before: fakeSnapshot(ev.before, childRef), after: snap.child(ev.rel) };
            const event = { id: crypto.randomUUID(), time: new Date().toISOString(), params: ev.params, data };
            log.info(`[gatilho] ${t.name} ${prefix}/${ev.rel}`);
            enqueue(t.name, () => t.fn.run(event));
          }
        }
      }
      state = value === null ? null : value;
    };
    ref.on("value", onValue, (e) => log.error(`[gatilho] escuta ${prefix}:`, e.message));
    unsubscribers.push(() => ref.off("value", onValue));
    log.info(`[gatilho] escutando /${prefix} -> ${triggers.map((t) => t.name).join(", ")}`);
  }
  return { stop: () => unsubscribers.forEach((u) => u()), drain: () => Promise.all([...queue.values()]) };
}

function startSchedules({ fns, log = console, setIntervalFn = setInterval, setTimeoutFn = setTimeout }) {
  const timers = [];
  for (const [name, fn] of Object.entries(fns)) {
    if (kindOf(fn) !== "schedule") continue;
    const schedule = String(fn.__endpoint.scheduleTrigger.schedule || "");
    const m = /^every (\d+) minutes?$/.exec(schedule);
    if (!m) { log.warn(`[agenda] ${name}: agenda "${schedule}" não suportada`); continue; }
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try { await fn.run({ scheduleTime: new Date().toISOString(), jobName: name }); } catch (e) { log.error(`[agenda ${name}]`, e); } finally { running = false; }
    };
    timers.push(setIntervalFn(tick, Number(m[1]) * 60 * 1000));
    // Agenda longa (dólar a cada 15 min) roda também 30 s depois de ligar: no plano gratuito
    // o servidor reinicia com frequência e esperaria o intervalo inteiro sem dado.
    if (Number(m[1]) >= 5) timers.push(setTimeoutFn(tick, 30000)); // stop() também cancela a primeira rodada
    log.info(`[agenda] ${name} a cada ${m[1]} min`);
  }
  return { stop: () => timers.forEach(clearInterval) };
}

module.exports = { configureFirebaseEnv, createServer, startTriggers, startSchedules, parsePattern, matchAll, diffTrigger, kindOf };

if (require.main === module) {
  configureFirebaseEnv();
  const admin = require("firebase-admin");
  const fns = require("./index.js");
  const corsOrigins = String(process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const server = createServer({ fns, admin, corsOrigins });
  const port = Number(process.env.PORT || 8080);
  server.listen(port, () => console.log(`Functions do PCP no ar na porta ${port} (${Object.keys(fns).length} funções)`));
  if (process.env.DISABLE_TRIGGERS !== "1") startTriggers({ fns, db: admin.database() });
  if (process.env.DISABLE_SCHEDULE !== "1") startSchedules({ fns });
}
