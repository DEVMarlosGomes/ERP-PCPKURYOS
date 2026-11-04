// Testa a prévia em processo próprio, sem autenticar ou acessar o banco.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('./', import.meta.url));
const child = spawn(process.execPath, ['scripts/preview-ui.mjs', '0'], {
  cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });
try {
  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Preview não iniciou: ' + stderr)), 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Preview encerrou: ' + code + ' ' + stderr)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1\.nip\.io:(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  function get(path, host = '127.0.0.1.nip.io', method = 'GET') {
    return new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method, headers: { Host: host + ':' + port } }, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.setTimeout(10000, () => req.destroy(new Error('Timeout HTTP')));
      req.on('error', reject);
      req.end();
    });
  }
  for (const host of ['127.0.0.1', 'localhost']) {
    const result = await get('/login?status=pending', host);
    assert.equal(result.status, 302);
    assert.equal(result.headers.location, `http://127.0.0.1.nip.io:${port}/login?status=pending`);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.body, '');
  }
  const root = await get('/');
  assert.equal(root.status, 302);
  assert.equal(root.headers.location, '/login');
  for (const path of ['/login', '/inicio', '/crm1', '/pd', '/shared/kuryos-motion.js']) {
    const result = await get(path);
    assert.equal(result.status, 200, path);
    assert.ok(result.body.length > 100, path);
    assert.equal(result.headers['cache-control'], 'no-store');
  }
  const clean = await get('/login.html?status=pending');
  assert.equal(clean.status, 301);
  assert.equal(clean.headers.location, '/login?status=pending');
  const head = await get('/login', '127.0.0.1.nip.io', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal((await get('/login', 'example.com')).status, 403);
  assert.equal((await get('/.env')).status, 404);
  assert.equal((await get('/nao-existe')).status, 404);
  assert.equal((await get('/login', '127.0.0.1.nip.io', 'POST')).status, 405);
  console.log('OK: prévia local redireciona aliases sem emuladores; rotas, query, HEAD e bloqueios preservados.');
} finally {
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
}
