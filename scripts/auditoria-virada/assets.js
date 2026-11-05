"use strict";
// GETs públicos apenas. Hash diferente não significa bug nem paridade funcional.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "../.."), out = path.join(root, "scratch/virada-20261103");
const bases = {reference: "https://prod-kuryos.web.app/", target: "https://kuryoserp.com.br/"};
const hash = text => crypto.createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
async function get(base, file) {
  try {
    const r = await fetch(base + file, {signal: AbortSignal.timeout(25000)});
    return {status: r.status, type: r.headers.get("content-type"), body: r.ok ? await r.text() : ""};
  } catch { return {status: 0, type: null, body: ""}; }
}
async function main() {
  const names = new Set((await fs.readdir(path.join(root, "public"))).filter(n => /\.(html|js)$/.test(n)));
  (await fs.readdir(path.join(root, "public/shared"))).filter(n => /\.js$/.test(n)).forEach(n => names.add("shared/" + n));
  for (const base of Object.values(bases)) {
    for (const file of ["auth_check.js", "shared/navegacao.js"]) {
      const response = await get(base, file);
      for (const match of response.body.matchAll(/["'`]([a-z0-9_-]+\.html)["'`]/gi)) names.add(match[1]);
    }
  }
  const files = [...names].sort(), rows = []; let cursor = 0;
  await Promise.all(Array.from({length: 5}, async () => {
    while (cursor < files.length) {
      const file = files[cursor++];
      const [a,b] = await Promise.all([get(bases.reference,file),get(bases.target,file)]);
      for (const [side, response] of [["reference", a], ["target", b]]) {
        if (!file.endsWith(".html")) continue;
        for (const match of response.body.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
          const url = new URL(match[1], bases[side] + file);
          const next = url.pathname.replace(/^\//, "");
          if (url.origin !== new URL(bases[side]).origin || next.includes("..") || next.includes("static/") || !/\.(html|js|css)$/.test(next) || names.has(next)) continue;
          names.add(next); files.push(next);
        }
      }
      const functions = body => [...new Set([...body.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]))].sort();
      const af = functions(a.body), bf = functions(b.body);
      const status = a.status === 200 && b.status === 200 ? (hash(a.body) === hash(b.body) ? "IDENTICO" : "DIFERENTE") : a.status === 200 ? "SO_OFICIAL" : b.status === 200 ? "SO_NOSSO" : "INDISPONIVEL";
      rows.push({file,status,reference:{status:a.status,type:a.type,bytes:Buffer.byteLength(a.body),hash:hash(a.body)},target:{status:b.status,type:b.type,bytes:Buffer.byteLength(b.body),hash:hash(b.body)}, functionsOnlyReference:af.filter(n=>!bf.includes(n)),functionsOnlyTarget:bf.filter(n=>!af.includes(n))});
      if (a.status === 200) {await fs.mkdir(path.dirname(path.join(out,"assets-reference",file)),{recursive:true}); await fs.writeFile(path.join(out,"assets-reference",file),a.body,{mode:0o600});}
    }
  }));
  rows.sort((a,b)=>a.file.localeCompare(b.file));
  const counts=rows.reduce((r,x)=>(r[x.status]=(r[x.status]||0)+1,r),{});
  await fs.writeFile(path.join(out,"assets-report.json"),JSON.stringify({completedAt:new Date().toISOString(),counts,rows},null,2),{mode:0o600});
  console.log(JSON.stringify({files:rows.length,counts}));
}
main().catch(()=>{console.error("Falha na comparação de assets públicos.");process.exitCode=1;});
