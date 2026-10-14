// Integra um build do ERPKuryosBeauty (frontend/build, Vite) ao CRM incorporado do PCP.
// Build esperado: cd frontend && npx vite build --assetsDir static/crm
// Uso: node scripts/integrar-crm-build.mjs [caminho/do/frontend/build]
//
// - copia para public/static/crm só os arquivos que ainda não existem
//   (arquivos antigos ficam: abas abertas com o build anterior continuam funcionando);
// - troca, no bloco <!-- crm-build --> de public/crm-app.html, as tags de
//   script/CSS/modulepreload pelas do index.html do build;
// - não toca em nada fora de public/static/crm e public/crm-app.html.
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.resolve(process.argv[2] || path.join(ROOT, '..', 'KURYOS', 'ERPKuryosBeauty-master', 'frontend', 'build'));
const PUBLIC = path.join(ROOT, 'public');
const HTML = path.join(PUBLIC, 'crm-app.html');
const ASSETS = path.join('static', 'crm');

const indexPath = path.join(BUILD, 'index.html');
if (!existsSync(indexPath) || !existsSync(path.join(BUILD, ASSETS))) {
  throw new Error(`Build Vite não encontrado em ${BUILD} (rode: npx vite build --assetsDir static/crm)`);
}
const index = await readFile(indexPath, 'utf8');
const tags = [...index.matchAll(/<(script|link)\b[^>]*\/static\/crm\/[^>]*>(?:<\/script>)?/g)].map((m) => m[0].replace(/<script\b(?![^>]*<\/script>)([^>]*)>$/, '<script$1></script>'));
if (!tags.some((tag) => /<script\b[^>]*type="module"/.test(tag))) throw new Error('index.html do build sem o script de entrada (type="module").');

let copied = 0;
let kept = 0;
const from = path.join(BUILD, ASSETS);
const to = path.join(PUBLIC, ASSETS);
await mkdir(to, { recursive: true });
for (const name of await readdir(from)) {
  const src = path.join(from, name);
  if (!(await stat(src)).isFile()) continue;
  const dst = path.join(to, name);
  if (existsSync(dst)) { kept += 1; continue; }
  await copyFile(src, dst);
  copied += 1;
}

const START = '<!-- crm-build:start (scripts/integrar-crm-build.mjs) -->';
const END = '<!-- crm-build:end -->';
const block = `${START}\n  ${tags.join('\n  ')}\n  ${END}`;
let html = await readFile(HTML, 'utf8');
const before = html;
if (html.includes(START)) {
  html = html.replace(new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}`), () => block);
} else {
  // Primeira integração Vite: sai o main.* do CRA e o reescritor do chunk 9752.
  html = html.replace(/\n\s*<script>\s*\n\s*\/\/ O adaptador Firebase é um chunk lazy[\s\S]*?<\/script>\n/, '\n');
  html = html.replace(/<link rel="stylesheet" href="\/static\/css\/main\.[a-z0-9]+\.css">/, () => block);
  html = html.replace(/\s*<script defer src="\/static\/js\/main\.[a-z0-9]+\.js(\?[^"]*)?"><\/script>/, '');
  if (!html.includes(START)) throw new Error('crm-app.html sem a tag main.css do CRA nem o bloco crm-build.');
}
if (html !== before) await writeFile(HTML, html);

console.log(`tags=${tags.length} | copiados=${copied} já existentes=${kept} | crm-app.html ${html !== before ? 'atualizado' : 'sem mudança'}`);
