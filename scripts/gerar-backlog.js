'use strict';
/* Gera public/backlog.json a partir do painel "Em aberto para execução" de MELHORIAS_FUTURAS.md.

   A tela Roadmap do sistema (public/backlog.html) lê esse JSON. Ninguém preenche nada à
   mão: quem termina um trabalho atualiza a tabela do painel (regra do próprio arquivo) e
   este script traduz as três tabelas — A. código nosso, B. depende da Kuryos, C. decisões
   do usuário — em itens com marca de "feito".

   Uso:  node scripts/gerar-backlog.js          (grava public/backlog.json)
   O teste run_backlog_test.js falha se o JSON publicado estiver desatualizado. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, 'MELHORIAS_FUTURAS.md');
const DESTINO = path.join(RAIZ, 'public', 'backlog.json');

const PIPE = '\u0000';

function celulas(linha) {
  const corpo = linha.trim().replace(/^\|/, '').replace(/\|$/, '').replace(/\\\|/g, PIPE);
  return corpo.split('|').map((c) => c.replace(new RegExp(PIPE, 'g'), '|').trim());
}

/* Texto da célula: primeira parte é o texto; trechos "- xxx" depois de <br> viram subitens. */
function partirCelula(cel) {
  const partes = String(cel || '').split(/<br\s*\/?>/i).map((p) => p.trim()).filter(Boolean);
  let texto = '';
  const subitens = [];
  partes.forEach((p, i) => {
    if (/^-\s+/.test(p) && i > 0) subitens.push(p.replace(/^-\s+/, ''));
    else texto = texto ? texto + ' ' + p : p;
  });
  return {texto, subitens};
}

function limpar(t) {
  return String(t || '').replace(/~~/g, '').replace(/\s*feito em\s+`?[0-9a-f]{7,40}`?\.?/i, '').replace(/\s+/g, ' ').trim();
}

function parse(md) {
  const linhas = String(md).split(/\r?\n/);
  const ini = linhas.findIndex((l) => /^## .*Em aberto para execução/.test(l));
  if (ini < 0) throw new Error('painel "Em aberto para execução" não encontrado em MELHORIAS_FUTURAS.md');
  let fim = linhas.findIndex((l, i) => i > ini && /^## /.test(l));
  if (fim < 0) fim = linhas.length;
  const atualizado = (linhas[ini].match(/atualizado em (\d{2}\/\d{2}\/\d{4})/) || [])[1] || null;

  const secoes = [];
  let atual = null, cab = null;
  for (let i = ini + 1; i < fim; i++) {
    const l = linhas[i];
    const h = l.match(/^###\s+([A-Z])\.\s+(.*)$/);
    if (h) { atual = {letra: h[1], titulo: h[2].trim(), itens: []}; secoes.push(atual); cab = null; continue; }
    if (!atual || !/^\s*\|/.test(l)) continue;
    if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue;
    const c = celulas(l);
    if (!cab) { cab = c; continue; }
    if (c.length < 2) continue;
    const grupo = c[0].replace(/\*\*/g, '').trim();
    const {texto, subitens} = partirCelula(c[1]);
    const extras = {};
    for (let k = 2; k < cab.length && k < c.length; k++) {
      const v = c[k].replace(/<br\s*\/?>/gi, ' ').trim();
      if (v && v !== '—' && v !== '-') extras[cab[k]] = v;
    }
    const feito = /^(\*\*)?~~/.test(c[1].trim()) || /^~~/.test(c[1].trim());
    const hash = ((c[1].match(/feito em\s+`?([0-9a-f]{7,40})`?/i) || [])[1]) || null;
    const base = limpar(texto);
    atual.itens.push({
      id: crypto.createHash('sha1').update(atual.letra + '|' + grupo + '|' + base).digest('hex').slice(0, 10),
      grupo: grupo, texto: base, subitens: subitens.map(limpar), extras: extras, feito: feito, hash: hash
    });
  }
  const resumo = {};
  secoes.forEach((s) => {
    resumo[s.letra] = {titulo: s.titulo, total: s.itens.length, feitos: s.itens.filter((x) => x.feito).length};
  });
  return {atualizadoEm: atualizado, secoes: secoes, resumo: resumo};
}

/* PORT-09 (Fase 8, reunião 28/10/2026): o nosso MELHORIAS_FUTURAS.md ainda não tem o painel
   "Em aberto para execução" com as tabelas A/B/C do Gustavo -- é uma lista de seções `##` com
   itens em tópico. Até o painel existir, a tela lê esse formato: cada `##` é um grupo, cada
   tópico de primeiro nível é um item (o trecho em negrito é o título; o resto, o detalhe),
   tópicos recuados viram subitens e item riscado (~~) é feito. A letra sai do texto:
   C = decisão pendente, B = depende da Kuryos (operação, cadastro, Dia D), A = o resto. */
const TITULOS_LIVRE = {A: 'Código: o que está adiado (MELHORIAS_FUTURAS.md)', B: 'Depende da Kuryos', C: 'Decisões pendentes do usuário'};
function letraDe(grupo, titulo, inicio) {
  const t = grupo + ' ' + titulo;
  // Decisão já tomada ("decisão do usuário, 30/09") não é pendência: só o que ainda espera resposta.
  if (/decis[ãa]o (de neg[óo]cio )?pendente|pendente de decis[ãa]o|precisam de decis[ãa]o|aguarda(ndo)? (a )?(decis[ãa]o|resposta|defini[çc][ãa]o)|decidir se\b/i.test(t + ' ' + inicio)) return 'C';
  if (/depende d[ao] (kuryos|opera[çc][ãa]o)|[ée] opera[çc][ãa]o, n[ãa]o c[óo]digo|n[ãa]o [ée] c[óo]digo|dia d\b/i.test(t + ' ' + inicio)) return 'B';
  return 'A';
}
function parseLivre(md) {
  const linhas = String(md).split(/\r?\n/);
  const itens = [];
  let grupo = null, atual = null;
  function fecha() {
    if (!atual) return;
    const bruto = atual.linhas.join(' ').replace(/\s+/g, ' ').trim();
    const feito = /^~~/.test(bruto);
    const hash = ((bruto.match(/feito em\s+`?([0-9a-f]{7,40})`?/i) || [])[1]) || null;
    const sem = bruto.replace(/~~/g, '');
    const neg = sem.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    const titulo = limpar(neg ? neg[1] : sem.slice(0, 160)).replace(/[.:]$/, '');
    const detalhe = limpar(neg ? neg[2] : sem.slice(160));
    const extras = detalhe ? {Detalhe: detalhe.length > 320 ? detalhe.slice(0, 317) + '…' : detalhe} : {};
    if (titulo) itens.push({grupo: grupo, texto: titulo, subitens: atual.subitens.map(limpar).filter(Boolean), extras: extras, feito: feito, hash: hash,
      letra: letraDe(grupo, titulo, detalhe.slice(0, 200))});
    atual = null;
  }
  linhas.forEach((l) => {
    const h = l.match(/^##\s+(?!#)(.*)$/);
    if (h) { fecha(); grupo = h[1].replace(/\s*\([^)]*\d{4}[^)]*\)\s*$/, '').replace(/\*\*/g, '').trim(); return; }
    if (/^#/.test(l)) { fecha(); return; }
    if (!grupo) return;
    if (/^- /.test(l)) { fecha(); atual = {linhas: [l.replace(/^- /, '')], subitens: []}; return; }
    if (!atual) return;
    const sub = l.match(/^\s{2,}- (.*)$/);
    if (sub) { atual.subitens.push(sub[1]); return; }
    if (/^\s{2,}\S/.test(l)) {
      if (atual.subitens.length) atual.subitens[atual.subitens.length - 1] += ' ' + l.trim();
      else atual.linhas.push(l.trim());
      return;
    }
    if (!l.trim()) return;
    fecha();
  });
  fecha();
  const secoes = ['A', 'B', 'C'].map((letra) => ({letra: letra, titulo: TITULOS_LIVRE[letra],
    itens: itens.filter((i) => i.letra === letra).map((i) => ({
      id: crypto.createHash('sha1').update(i.grupo + '|' + i.texto).digest('hex').slice(0, 10),
      grupo: i.grupo, texto: i.texto, subitens: i.subitens, extras: i.extras, feito: i.feito, hash: i.hash}))}));
  const resumo = {};
  secoes.forEach((s) => { resumo[s.letra] = {titulo: s.titulo, total: s.itens.length, feitos: s.itens.filter((x) => x.feito).length}; });
  return {atualizadoEm: null, secoes: secoes, resumo: resumo};
}

/* O painel do Gustavo, se existir; senão, o formato atual do nosso arquivo. */
function lerOrigem(md) {
  try { return {dados: parse(md), fonte: 'MELHORIAS_FUTURAS.md › Em aberto para execução'}; } catch (e) {
    if (!/não encontrado/.test(e.message)) throw e;
    return {dados: parseLivre(md), fonte: 'MELHORIAS_FUTURAS.md (seções e tópicos)'};
  }
}

function gerar() {
  const lido = lerOrigem(fs.readFileSync(ORIGEM, 'utf8'));
  const dados = lido.dados;
  let commit = null;
  try { commit = cp.execSync('git rev-parse --short HEAD', {cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore']}).toString().trim(); } catch (e) { /* fora do git */ }
  return Object.assign({fonte: lido.fonte, geradoEm: new Date().toISOString(), commit: commit}, dados);
}

if (require.main === module) {
  const saida = gerar();
  fs.writeFileSync(DESTINO, JSON.stringify(saida, null, 1) + '\n');
  const r = saida.resumo;
  console.log('public/backlog.json: ' + Object.keys(r).map((k) => k + '=' + (r[k].total - r[k].feitos) + ' abertos/' + r[k].total).join('  '));
}

module.exports = {parse, parseLivre, lerOrigem, gerar, celulas, partirCelula, DESTINO, ORIGEM};
