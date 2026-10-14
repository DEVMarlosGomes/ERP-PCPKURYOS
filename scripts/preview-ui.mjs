// Preview local da UI usando os mesmos rewrites do firebase.json.
// Só serve public/ em loopback; não chama deploy nem escreve no Firebase.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(workspace, 'firebase.json'), 'utf8'));
const root = path.resolve(workspace, config.hosting.public);
const rewrites = config.hosting.rewrites.map(item => ({
  match: new RegExp('^' + item.source.split('**').map(part => part.split('*').map(text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$'),
  destination: item.destination,
}));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.map': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8' };
async function resolveFile(pathname) {
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || pathname.split('/').some(part => part.startsWith('.'))) return null;
  try { if ((await stat(file)).isFile()) return file; } catch {}
  return null;
}
const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const rewrite = rewrites.find(item => item.match.test(pathname));
    const file = await resolveFile(pathname) || (rewrite && await resolveFile(rewrite.destination));
    if (!file) { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Página não encontrada'); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : await readFile(file));
  } catch { response.writeHead(500); response.end('Não foi possível carregar o recurso'); }
});
server.listen(Number(process.argv[2] || 5000), '127.0.0.1', () => console.log('Preview UI: http://127.0.0.1.nip.io:' + server.address().port));
