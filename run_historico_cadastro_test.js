'use strict';
/* Histórico do cadastro vivo (public/shared/historico-cadastro.js, 10/11/2026). */
const assert = require('assert');
const H = require('./public/shared/historico-cadastro');

// 1. O que mudou: vazio = vazio; número como texto = número; objeto em outra ordem = igual; controle ignorado.
{
  const antes = {descricao: 'BODY SPLASH 200ML', volume: 200, obs: '', tipos: ['MP'], forn: {a: {nome: 'X'}, b: {nome: 'Y'}}, ultimaAlteracao: {em: 1}};
  const depois = {descricao: 'BODY SPLASH B.BALM 200ML', volume: '200', obs: null, tipos: ['MP', 'EMB'], forn: {b: {nome: 'Y'}, a: {nome: 'X'}}, ultimaAlteracao: {em: 2}, cidade: 'Jundiaí'};
  const m = H.mudancas(antes, depois, {rotulos: {descricao: 'Descrição', tipos: 'Categorias', cidade: 'Cidade'}});
  assert.deepEqual(m.map((x) => x.campo), ['tipos', 'cidade', 'descricao']);
  assert.deepEqual(m.find((x) => x.campo === 'tipos'), {campo: 'tipos', rotulo: 'Categorias', de: ['MP'], para: ['MP', 'EMB']});
  assert.equal(m.find((x) => x.campo === 'cidade').de, null);
  assert.deepEqual(H.mudancas({a: 1}, {a: 1}), []);
  assert.deepEqual(H.mudancas({x: 1}, {x: 2}, {ignorar: ['x']}), []);
  // Campo que nunca existiu + checkbox desmarcado não é mudança; ausente em "ativo" vale sim, então desativar aparece.
  assert.deepEqual(H.mudancas({}, {controlado: false}), []);
  assert.deepEqual(H.mudancas({}, {ativo: false}).map((x) => x.campo), ['ativo']);
  assert.deepEqual(H.mudancas({}, {ativo: true}), []);
  assert.deepEqual(H.mudancas({}, {revisado: true}, {padroes: {revisado: true}}), []);
}

// 2. Entradas: uma por campo, mesmo grupo/autor/justificativa; formato antigo de historico_materiais preservado.
{
  const meta = {por: 'Yasmim', porUid: 'u9', em: '2026-11-10T20:00:00.000Z', em_ms: {'.sv': 'timestamp'}, grupo: 'g1', justificativa: '  Troca do fornecedor da essência  '};
  const e = H.entradas([{campo: 'mpNome', rotulo: 'Nome', de: 'A', para: 'B'}, {campo: 'ativo', rotulo: 'Ativo', de: true, para: false}], meta);
  assert.equal(e.length, 2);
  assert.deepEqual(e[0], {alteradoPor: 'Yasmim', alteradoEm: '2026-11-10T20:00:00.000Z', grupo: 'g1', alteradoPorUid: 'u9', em_ms: {'.sv': 'timestamp'},
    justificativa: 'Troca do fornecedor da essência', acao: 'EDICAO', campo: 'mpNome', rotulo: 'Nome', valorAnterior: 'A', valorNovo: 'B'});
  assert.equal(e[1].grupo, 'g1');
  const c = H.criacao({por: 'PCP', em: '2026-11-10T19:00:00.000Z', grupo: 'g0'});
  assert.equal(c.acao, 'CRIADO');
  assert.equal(c.justificativa, undefined);
}

// 3. Agrupar: por salvamento, mais recente primeiro; entradas antigas sem grupo juntam por autor+instante.
{
  const gravadas = [
    {campo: 'mpNome', valorAnterior: 'A', valorNovo: 'B', alteradoPor: 'Ana', alteradoEm: '2026-10-01T10:00:00.000Z'},
    {campo: 'unidade', valorAnterior: 'kg', valorNovo: 'g', alteradoPor: 'Ana', alteradoEm: '2026-10-01T10:00:00.000Z'},
    {acao: 'CRIADO', campo: '_criado', alteradoPor: 'Leo', alteradoEm: '2026-09-01T08:00:00.000Z', grupo: 'g0'},
    {campo: 'ativo', rotulo: 'Ativo', valorAnterior: true, valorNovo: false, alteradoPor: 'Yasmim', alteradoEm: '2026-11-10T20:00:00.000Z', grupo: 'g2', justificativa: 'Material descontinuado pelo fornecedor'}
  ];
  const g = H.agrupar(gravadas);
  assert.deepEqual(g.map((x) => [x.por, x.itens.length, x.acao]), [['Yasmim', 1, 'EDICAO'], ['Ana', 2, 'EDICAO'], ['Leo', 0, 'CRIADO']]);
  const html = H.html(g);
  assert.match(html, /Justificativa: Material descontinuado pelo fornecedor/);
  assert.match(html, /Ativo<\/span>: Sim/);
  assert.match(html, /Cadastro criado/);
  assert.match(H.html([]), /Nenhuma alteração/);
  assert.ok(!/<script>/.test(H.html(H.agrupar([{campo: 'x', valorAnterior: '<script>', valorNovo: '', alteradoPor: '<b>', alteradoEm: 'z'}]))), 'escapa HTML');
}

// 4. Formatação e justificativa.
assert.equal(H.fmt(null), '—');
assert.equal(H.fmt(1234.5), '1.234,5');
assert.equal(H.fmt({k1: {nome: 'Fornecedor A'}, k2: {nome: 'Fornecedor B'}}), 'Fornecedor A, Fornecedor B');
assert.equal(H.fmt({k1: {x: 1}}), '1 item');
assert.equal(H.justificativaValida('curta'), false);
assert.equal(H.justificativaValida('Nova descrição do cliente'), true);

// 5. Regras: os três nós só aceitam inclusão, com quem grava o cadastro.
const regras = require('fs').readFileSync(require('path').join(__dirname, 'database.rules.json'), 'utf8');
['historico_materiais', 'historico_produtos', 'historico_fornecedores'].forEach((n) => {
  const i = regras.indexOf('"' + n + '": {');
  assert.ok(i > 0, n);
  const bloco = regras.slice(i, regras.indexOf('\n    },', i));
  assert.equal((bloco.match(/"\.write"/g) || []).length, 1, n + ': uma escrita só, na entrada');
  assert.match(bloco, /"\$entrada": \{\s*"\.write": "[^"]*!data\.exists\(\) && newData\.exists\(\)"/, n + ': só inclusão');
});
assert.match(regras.slice(regras.indexOf('"historico_fornecedores": {')).slice(0, 4000), /modulos'\)\.child\('compras'\)/, 'Compras também grava fornecedor');

console.log('OK histórico do cadastro: o que mudou (vazio/número/objeto), entradas por campo com grupo e justificativa, agrupamento, HTML escapado, regras só-inclusão.');
