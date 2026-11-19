'use strict';
/* Fase 2 do Help Desk: entrega o topo do Roadmap aos agentes e registra a
   conclusão no arquivo-fonte com o commit que implementou o item.

   node scripts/chamados-roadmap.js fila [--limite 20] [--estado snapshot.json]
   node scripts/chamados-roadmap.js proximo [--estado snapshot.json]
   node scripts/chamados-roadmap.js concluir <id> <commit>

   Sem --estado, fila/proximo leem somente o nó chamados_roadmap da produção
   pela Firebase CLI. "concluir" não escreve no banco: atualiza a fonte e o
   backlog.json; a callable sincroniza o estado ao abrir o quadro. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const gerador = require('./gerar-backlog');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, 'MELHORIAS_FUTURAS.md');
const DESTINO = path.join(RAIZ, 'public', 'backlog.json');

function itensDoBacklog(backlog) {
  const itens = [];
  (backlog.secoes || []).forEach((secao) => (secao.itens || []).forEach((item) => itens.push(Object.assign({secao: secao.letra}, item))));
  return itens;
}
function filaOrdenada(backlog, estado) {
  const rank = {EM_ANDAMENTO: 0, NOVO: 1, NA_FILA: 2, VALIDAR: 3};
  return itensDoBacklog(backlog).filter((item) => !item.feito && (!estado[item.id] || estado[item.id].status !== 'CONCLUIDO')).map((item, indice) => {
    const st = estado[item.id] || {};
    return Object.assign({}, item, {status: st.status || 'NA_FILA', ordem: typeof st.ordem === 'number' ? st.ordem : Number.MAX_SAFE_INTEGER - 10000 + indice, chamados: st.chamados || {}});
  }).filter((item) => Object.prototype.hasOwnProperty.call(rank, item.status)).sort((a, b) => rank[a.status] - rank[b.status] || a.ordem - b.ordem || a.texto.localeCompare(b.texto, 'pt-BR'));
}
function lerEstado(arquivo) {
  if (arquivo) return JSON.parse(fs.readFileSync(path.resolve(arquivo), 'utf8')) || {};
  const comumWindows = process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'firebase.cmd');
  const firebaseJs = process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  const usaJs = process.platform === 'win32' && firebaseJs && fs.existsSync(firebaseJs);
  const bin = usaJs ? process.execPath : (process.platform === 'win32' && comumWindows && fs.existsSync(comumWindows) ? comumWindows : (process.platform === 'win32' ? 'firebase.cmd' : 'firebase'));
  const args = (usaJs ? [firebaseJs] : []).concat(['database:get', '/chamados_roadmap', '--project', 'erpkuryos']);
  const out = cp.execFileSync(bin, args, {cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, {DEBUG: ''})});
  return JSON.parse(out || '{}') || {};
}
function marcarConcluido(md, id, commit) {
  if (!/^[a-f0-9]{10}$/i.test(id || '')) throw new Error('ID inválido: use os 10 caracteres mostrados pelo comando proximo.');
  if (!/^[a-f0-9]{7,40}$/i.test(commit || '')) throw new Error('Commit inválido: informe o hash de 7 a 40 caracteres.');
  const backlog = gerador.lerOrigem(md).dados;
  const alvo = itensDoBacklog(backlog).find((item) => item.id === id);
  if (!alvo) throw new Error('Item ' + id + ' não existe no Roadmap atual.');
  if (alvo.feito) throw new Error('Item ' + id + ' já está concluído.');
  const linhas = md.split(/\r?\n/);
  let grupo = '';
  for (let i = 0; i < linhas.length; i++) {
    const h = linhas[i].match(/^##\s+(?!#)(.*)$/);
    if (h) grupo = h[1].replace(/\s*\([^)]*\d{4}[^)]*\)\s*$/, '').replace(/\*\*/g, '').trim();
    if (grupo !== alvo.grupo || !/^- /.test(linhas[i])) continue;
    let fim = i + 1;
    while (fim < linhas.length && !/^(?:- |#)/.test(linhas[fim])) fim++;
    const trecho = ['## ' + grupo].concat(linhas.slice(i, fim)).join('\n');
    const candidato = itensDoBacklog(gerador.parseLivre(trecho)).find((item) => item.id === id);
    if (!candidato) continue;
    linhas[i] = '- ~~' + linhas[i].slice(2).replace(/\s+$/, '') + ' feito em `' + commit.toLowerCase() + '`.~~';
    return linhas.join('\n');
  }
  throw new Error('O item existe no JSON, mas não foi localizado na fonte. Rode node scripts/gerar-backlog.js e tente de novo.');
}
function argumento(nome, args) {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : '';
}
function mostrar(item) {
  const ligados = Object.values(item.chamados || {}).map((c) => c.codigo).filter(Boolean);
  return [item.id, item.status.padEnd(12), item.grupo + ' — ' + item.texto, ligados.length ? 'Chamados: ' + ligados.join(', ') : ''].filter(Boolean).join(' | ');
}

function main(args) {
  const comando = args[0] || 'fila';
  if (comando === 'concluir') {
    const novo = marcarConcluido(fs.readFileSync(ORIGEM, 'utf8'), String(args[1] || '').toLowerCase(), String(args[2] || '').toLowerCase());
    fs.writeFileSync(ORIGEM, novo, 'utf8');
    fs.writeFileSync(DESTINO, JSON.stringify(gerador.gerar(), null, 1) + '\n', 'utf8');
    console.log('Roadmap ' + args[1] + ' concluído com o commit ' + args[2] + '; MELHORIAS_FUTURAS.md e public/backlog.json atualizados.');
    return;
  }
  if (!['fila', 'proximo'].includes(comando)) throw new Error('Comando inválido. Use fila, proximo ou concluir.');
  const estado = lerEstado(argumento('--estado', args));
  const backlog = JSON.parse(fs.readFileSync(DESTINO, 'utf8'));
  let fila = filaOrdenada(backlog, estado);
  if (comando === 'proximo') fila = fila.filter((item) => ['NOVO', 'NA_FILA'].includes(item.status)).slice(0, 1);
  else fila = fila.slice(0, Math.max(1, Math.min(100, Number(argumento('--limite', args)) || 20)));
  if (!fila.length) { console.log('Nenhum item disponível na fila.'); return; }
  fila.forEach((item) => console.log(mostrar(item)));
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error('Erro: ' + e.message); process.exitCode = 1; }
}
module.exports = {itensDoBacklog, filaOrdenada, marcarConcluido, mostrar};
