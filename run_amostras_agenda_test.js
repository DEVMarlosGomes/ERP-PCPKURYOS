'use strict';
/* Amostras de MP na agenda da Logística (19/11/2026, shared/calendario-logistica.js).
   Caso real: AM-0004 "ghk cu" (TC QUIMICA) não entrava em lugar nenhum da Logística; a
   tentativa era um PC Direto, cuja busca só acha material cadastrado. */
const assert = require('node:assert/strict');
const C = require('./public/shared/calendario-logistica.js');

const amostras = {
  a4: {codigo: 'AM-0004', status: 'SOLICITADA', tipo: 'NOVA', materialNovo: {nome: 'ghk cu'}, fornecedor: {nome: 'TC QUIMICA'},
    quantidade: {valor: 20, unidade: 'g'}, previsaoChegada: '2026-11-23', solicitante: {nome: 'yasmim.fantini'}},
  a1: {codigo: 'AM-0001', status: 'SOLICITADA', tipo: 'NOVA', materialNovo: {nome: 'COLÁGENO E PROTEINA'}, fornecedor: {nome: 'TC QUIMICA'},
    quantidade: {valor: 20, unidade: 'g'}, previsaoChegada: '2026-11-17'},
  a5: {codigo: 'AM-0005', status: 'RECEBIDA', tipo: 'CADASTRADA', material: {codigo: 'MPGR-00003', nome: 'ÁLCOOL'}, fornecedor: {nome: 'X'},
    quantidade: {valor: 1.5, unidade: 'kg'}, previsaoChegada: '2026-11-10', recebimento: {data: '2026-11-12', forma: 'CORREIO'}},
  a6: {codigo: 'AM-0006', status: 'CANCELADA', tipo: 'NOVA', materialNovo: {nome: 'x'}, previsaoChegada: '2026-11-20'},
  a7: {codigo: 'AM-0007', status: 'SOLICITADA', tipo: 'NOVA', materialNovo: {nome: 'sem data'}},
};

let ev = C.eventos({}, {}, {hoje: '2026-11-19', amostras});
assert.deepEqual(ev.map((e) => e.id), ['am:a1', 'am:a4'], 'solicitadas com previsão; cancelada, recebida (sem concluídos) e sem data fora');
const a4 = ev.find((e) => e.id === 'am:a4');
assert.equal(a4.tipo, 'ENTRADA');
assert.equal(a4.amostra, true);
assert.equal(a4.data, '2026-11-23');
assert.equal(a4.situacao, 'AGENDADO');
assert.equal(a4.titulo, 'TC QUIMICA');
assert.equal(a4.numero, 'AM-0004');
assert.match(a4.subtitulo, /Amostra · ghk cu \(nova\) · 20 g/);
assert.equal(ev.find((e) => e.id === 'am:a1').situacao, 'ATRASADO', 'previsão passou');

// Concluídos: recebida aparece na data da baixa.
ev = C.eventos({}, {}, {hoje: '2026-11-19', amostras, incluirConcluidos: true});
const a5 = ev.find((e) => e.id === 'am:a5');
assert.equal(a5.situacao, 'CONCLUIDO');
assert.equal(a5.data, '2026-11-12');
assert.match(a5.subtitulo, /MPGR-00003 — ÁLCOOL · 1,5 kg/);

// Entram como ENTRADA: filtro, resumo e PCs continuam iguais.
const pcs = {p1: {status: 'ENVIADO', numeroFormatado: 'PC-0001', fornecedorNome: 'F', agendamento: {dataAgendada: '2026-11-21'}, itens: {i: {qtd: 1}}}};
ev = C.eventos(pcs, {}, {hoje: '2026-11-19', amostras});
assert.deepEqual(ev.map((e) => e.id), ['am:a1', 'pc:p1', 'am:a4']);
assert.equal(C.filtrar(ev, {entradas: false}).length, 0);
assert.equal(C.resumo(ev).entradas, 3);
assert.equal(C.eventos(pcs, {}, {hoje: '2026-11-19'}).length, 1, 'sem amostras: igual a antes');

console.log('OK amostras na agenda: solicitada na previsão (atrasada se passou), recebida como concluída, cancelada fora, junto dos PCs.');
