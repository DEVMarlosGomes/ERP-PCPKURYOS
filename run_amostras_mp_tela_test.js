'use strict';
/* Amostras de MP (11/11/2026): lógica pura da aba (public/shared/amostras-mp.js).
     node run_amostras_mp_tela_test.js
   Atraso no fuso de Brasília, filas "a receber" e "aguardando homologação", filtros, botões por papel,
   abas visíveis por módulo e contrato das constantes com o servidor (functions/amostras_mp.js). */
const assert = require('assert/strict');
const T = require('./public/shared/amostras-mp.js');
const S = require('./functions/amostras_mp.js');

let n = 0;
const ok = (m) => { n++; console.log('  ok  ' + m); };

// ── Contrato com o servidor
for (const k of ['STATUS', 'MOTIVOS', 'FORMAS', 'TIPOS', 'UNIDADES']) assert.deepEqual(T[k], S[k], k + ' igual ao do servidor');
ok('constantes iguais às do servidor');

// ── Hoje e atraso em Brasília
assert.equal(T.hojeBrasilia(new Date('2026-11-12T01:00:00Z')), '2026-11-11', '22h de Brasília ainda é dia 11');
assert.equal(T.hojeBrasilia(new Date('2026-11-12T03:30:00Z')), '2026-11-12');
assert.equal(T.atrasada({status: 'SOLICITADA', previsaoChegada: '2026-11-11'}, '2026-11-11'), false, 'prevista para hoje não está atrasada');
assert.equal(T.atrasada({status: 'SOLICITADA', previsaoChegada: '2026-11-10'}, '2026-11-11'), true);
assert.equal(T.atrasada({status: 'RECEBIDA', previsaoChegada: '2026-11-01'}, '2026-11-11'), false, 'recebida nunca atrasa');
assert.equal(T.atrasada({status: 'SOLICITADA'}, '2026-11-11'), false, 'sem previsão não acusa atraso');
ok('hoje e atraso pelo fuso de Brasília');

// ── Filas
const lista = [
  {id: 'a', status: 'RECEBIDA', previsaoChegada: '2026-11-01', recebimento: {em: '2026-11-09T10:00:00Z'}},
  {id: 'b', status: 'SOLICITADA', previsaoChegada: '2026-11-20'},
  {id: 'c', status: 'SOLICITADA', previsaoChegada: '2026-11-05'},
  {id: 'd', status: 'RECEBIDA', recebimento: {em: '2026-11-08T10:00:00Z'}},
  {id: 'e', status: 'CANCELADA', previsaoChegada: '2026-11-02'},
];
assert.deepEqual(T.aReceber(lista, '2026-11-11').map((a) => a.id), ['c', 'b']);
assert.deepEqual(T.aguardandoHomologacao(lista).map((a) => a.id), ['d', 'a'], 'mais antiga primeiro');
ok('a receber por previsão; aguardando homologação pela data da baixa');

// ── Filtros
const f = [
  {id: 1, status: 'SOLICITADA', tipo: 'NOVA', motivo: 'REPOSICAO', fornecedor: {key: 'f1'}, solicitante: {em: '2026-11-02T13:00:00Z'}},
  {id: 2, status: 'RECEBIDA', tipo: 'CADASTRADA', motivo: 'DESENVOLVIMENTO', fornecedor: {key: 'f2'}, solicitante: {em: '2026-11-11T02:00:00Z'}},
  {id: 3, status: 'SOLICITADA', tipo: 'CADASTRADA', motivo: 'REPOSICAO', fornecedor: {key: 'f1'}, solicitante: {em: '2026-10-20T12:00:00Z'}},
];
const ids = (l) => l.map((a) => a.id);
assert.deepEqual(ids(T.filtrar(f, {})), [1, 2, 3]);
assert.deepEqual(ids(T.filtrar(f, {motivo: 'REPOSICAO'})), [1, 3]);
assert.deepEqual(ids(T.filtrar(f, {fornecedorKey: 'f1', tipo: 'CADASTRADA'})), [3]);
assert.deepEqual(ids(T.filtrar(f, {status: 'RECEBIDA'})), [2]);
assert.deepEqual(ids(T.filtrar(f, {de: '2026-11-01', ate: '2026-11-10'})), [1, 2], '2026-11-11T02:00Z é dia 10 em Brasília');
ok('filtros por status, tipo, fornecedor, motivo e período (data de Brasília)');

// ── Papel, ações e abas
const pd = T.papel({role: 'pd'});
const log = T.papel({role: 'logistica'});
const adm = T.papel({role: 'admin'});
const yas = T.papel({role: 'comercial', modulos: {pd: true, cadastros: true}});
assert.deepEqual(pd, {pd: true, logistica: false, admin: false, cadastros: false});
assert.equal(yas.pd && yas.cadastros, true);
assert.equal(T.papel({role: 'pcp'}).cadastros, true, 'PCP tem Cadastros pelo papel');
assert.deepEqual(T.acoesVisiveis({status: 'SOLICITADA'}, pd), ['EDITAR', 'CANCELAR']);
assert.deepEqual(T.acoesVisiveis({status: 'SOLICITADA'}, log), ['RECEBER']);
assert.deepEqual(T.acoesVisiveis({status: 'RECEBIDA'}, pd), ['HOMOLOGAR', 'REPROVAR']);
assert.deepEqual(T.acoesVisiveis({status: 'RECEBIDA'}, log), []);
assert.deepEqual(T.acoesVisiveis({status: 'SOLICITADA'}, adm), ['EDITAR', 'CANCELAR', 'RECEBER']);
assert.deepEqual(T.acoesVisiveis({status: 'HOMOLOGADA'}, adm), []);
assert.deepEqual(T.acoesVisiveis({status: 'SOLICITADA'}, T.papel({role: 'pcp'})), [], 'PCP só lê');
const todas = ['materiais', 'produtos', 'formulas', 'categorias', 'clientes', 'fornecedores', 'servicos', 'amostras'];
assert.deepEqual(T.abasVisiveis(yas), todas);
assert.deepEqual(T.abasVisiveis(T.papel({role: 'pcp'})), todas);
assert.deepEqual(T.abasVisiveis(pd), ['amostras', 'fornecedores']);
assert.deepEqual(T.abasVisiveis(log), ['amostras']);
assert.equal(T.nomeMaterial({tipo: 'NOVA', materialNovo: {nome: 'Pigmento X'}}), 'Pigmento X (nova)');
assert.equal(T.nomeMaterial({tipo: 'CADASTRADA', material: {codigo: 'MPGR-00127', nome: 'ALCOOL'}}), 'MPGR-00127 — ALCOOL');
ok('papel por papel/módulo; botões por status e papel; abas por módulo; nome do material');

console.log('run_amostras_mp_tela_test: ' + n + ' grupos OK');
