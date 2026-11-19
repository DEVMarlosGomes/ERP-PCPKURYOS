'use strict';
const assert = require('node:assert/strict');
const gerador = require('./scripts/gerar-backlog');
const R = require('./scripts/chamados-roadmap');

const md = '# Melhorias\n\n## Frente Alpha (19/11/2026)\n\n- **Primeiro item** detalhe operacional.\n- **Segundo item** depende de código.\n';
const backlog = gerador.lerOrigem(md).dados;
const itens = R.itensDoBacklog(backlog);
assert.equal(itens.length, 2);

const estado = {};
estado[itens[0].id] = {status: 'NA_FILA', ordem: 2000};
estado[itens[1].id] = {status: 'NA_FILA', ordem: 1000, chamados: {c1: {codigo: 'CH-00001'}}};
const fila = R.filaOrdenada(backlog, estado);
assert.deepEqual(fila.map((x) => x.id), [itens[1].id, itens[0].id]);
assert.match(R.mostrar(fila[0]), /CH-00001/);

const concluido = R.marcarConcluido(md, itens[1].id, '8ada1e7');
assert.match(concluido, /~~\*\*Segundo item\*\* depende de código\. feito em `8ada1e7`\.~~/);
const depois = R.itensDoBacklog(gerador.lerOrigem(concluido).dados);
assert.equal(depois.find((x) => x.id === itens[1].id).feito, true);
assert.equal(depois.find((x) => x.id === itens[1].id).hash, '8ada1e7');
assert.throws(() => R.marcarConcluido(concluido, itens[1].id, '8ada1e7'), /já está concluído/);
assert.throws(() => R.marcarConcluido(md, 'id-invalido', '8ada1e7'), /ID inválido/);

console.log('OK run_chamados_roadmap_test.js: fila por ordem do banco e conclusão registrada por commit.');
