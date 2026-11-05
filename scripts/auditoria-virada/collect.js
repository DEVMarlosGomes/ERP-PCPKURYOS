"use strict";
// Somente leitura: POST apenas ao login do Firebase; GET nas duas bases.
// Recebe credencial da referência por stdin, nunca por argumentos/arquivo/log.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline");
const requireFunctions = require("node:module").createRequire(path.resolve(__dirname, "../../functions/package.json"));
const {initializeApp, cert, deleteApp} = requireFunctions("firebase-admin/app");
const {getDatabase} = requireFunctions("firebase-admin/database");
const out = path.resolve(__dirname, "../../scratch/virada-20261103");
async function json(response, label) {
  if (!response.ok) throw new Error(label + ": HTTP " + response.status);
  return response.json();
}
async function save(name, data, metadata) {
  const content = JSON.stringify(data);
  await fs.writeFile(path.join(out, name + ".json"), content, {mode: 0o600, flag: "wx"});
  const manifest = {...metadata, completedAt: new Date().toISOString(), bytes: Buffer.byteLength(content), sha256: crypto.createHash("sha256").update(content).digest("hex"), roots: Object.keys(data || {}).length};
  await fs.writeFile(path.join(out, name + "-manifest.json"), JSON.stringify(manifest, null, 2), {mode: 0o600, flag: "wx"});
  const {coverage, ...publicManifest} = manifest;
  console.log(JSON.stringify({name, ...publicManifest, coverageCount: coverage?.length}));
}
async function main() {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  const rl = readline.createInterface({input: process.stdin, crlfDelay: Infinity});
  console.log("Aguardando credenciais via stdin; não serão registradas.");
  const credentials = await new Promise(resolve => rl.once("line", line => resolve(JSON.parse(line))));
  rl.close(); process.stdin.pause();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  const config = await json(await fetch("https://prod-kuryos.web.app/__/firebase/init.json", {signal: AbortSignal.timeout(30000)}), "configuração pública");
  if (config.projectId !== "prod-kuryos" || new URL(config.databaseURL).hostname !== "prod-kuryos-default-rtdb.firebaseio.com") throw new Error("Referência inesperada.");
  const signed = await json(await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + encodeURIComponent(config.apiKey), {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({email: credentials.email, password: credentials.password, returnSecureToken: true}), signal: AbortSignal.timeout(30000)
  }), "autenticação de referência");
  delete credentials.password;
  const extraMode = process.argv[4] === "extra";
  const serviceAccountFile = process.argv[2];
  if (!serviceAccountFile) throw new Error("Caminho da credencial administrativa do destino ausente.");
  const account = JSON.parse(await fs.readFile(serviceAccountFile, "utf8"));
  if (account.project_id !== "erpkuryos") throw new Error("Credencial de destino inesperada.");
  if (!extraMode) {
  const app = initializeApp({credential: cert(account), databaseURL: "https://erpkuryos-default-rtdb.firebaseio.com", projectId: "erpkuryos"}, "virada-readonly");
  try {
    const startedAt = new Date().toISOString();
    const snapshot = await getDatabase(app).ref("/").get();
    await save("target-live", snapshot.val() || {}, {project: "erpkuryos", startedAt, authorization: "Admin SDK GET; sem escrita"});
  } finally { await deleteApp(app); }
  }
  // A regra não concede leitura na raiz à conta de navegador. Ler cada módulo
  // pelos caminhos conhecidos respeita suas próprias permissões, sem contorná-las.
  const old = JSON.parse(await fs.readFile(path.resolve(process.argv[3]), "utf8"));
  const target = JSON.parse(await fs.readFile(path.join(out, "target-live.json"), "utf8"));
  let roots = [...new Set([...Object.keys(old), ...Object.keys(target)])].sort();
  if (extraMode) {
    const known = JSON.parse(await fs.readFile(path.join(out,"reference-live-manifest.json"),"utf8"));
    const found = new Set(["qualidade_rascunhos"]);
    async function walk(dir) {
      for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
        const file=path.join(dir,entry.name);
        if(entry.isDirectory()) await walk(file);
        else if(/\.(js|html)$/.test(file)) {
          const content=await fs.readFile(file,"utf8");
          for(const match of content.matchAll(/\.ref\(\s*["'`]([a-zA-Z_][a-zA-Z_0-9-]*)(?:\/|["'`])/g)) found.add(match[1]);
        }
      }
    }
    await walk(path.join(out,"assets-reference"));
    const covered=new Set(known.coverage.map(x=>x.root));
    roots=[...found].filter(x=>!covered.has(x)).sort();
  }
  const reference = {}, coverage = [], startedAt = new Date().toISOString();
  let cursor = 0;
  await Promise.all(Array.from({length: 4}, async () => {
    while (cursor < roots.length) {
      const root = roots[cursor++];
      const response = await fetch(config.databaseURL + "/" + encodeURIComponent(root) + ".json?auth=" + encodeURIComponent(signed.idToken), {signal: AbortSignal.timeout(90000)});
      if (!response.ok) {coverage.push({root, status: response.status, read: false}); continue;}
      reference[root] = await response.json();
      coverage.push({root, status: response.status, read: true, exists: reference[root] !== null});
    }
  }));
  await save(extraMode ? "reference-extra" : "reference-live", reference, {project: "prod-kuryos", startedAt, authorization: "conta fornecida pelo usuário; leitura por módulo", coverage: coverage.sort((a,b) => a.root.localeCompare(b.root))});
  delete signed.idToken; delete signed.refreshToken;
}
main().catch(error => {console.error("Coleta interrompida: " + (error?.message || "falha sem detalhes")); process.exitCode = 1;});
