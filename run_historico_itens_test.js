'use strict';
/* Histórico item a item de Fórmula/BOM/Especificação (11/11/2026): node run_historico_itens_test.js */
const assert = require('node:assert/strict');
const H = require('./public/shared/historico-itens.js');
let n = 0;
const ok = (m) => { n++; console.log('  ok  ' + m); };

const alcool = {mpCodigo: 'MPGR-00127', mpNome: 'ÁLCOOL 96°GL', fase: 'A', ordemAdicao: 1, percentualMM: 74, sugestaoMatch: {x: 1}, pendente: null};
const agua = {mpCodigo: 'MPGR-00132', mpNome: 'ÁGUA', fase: 'A', ordemAdicao: 1, percentualMM: 74};

// Retrato guarda só o que conta e nunca undefined/null (o RTDB não guarda).
assert.deepEqual(H.retrato('formulas', alcool), {mpCodigo: 'MPGR-00127', mpNome: 'ÁLCOOL 96°GL', fase: 'A', ordemAdicao: 1, percentualMM: 74});
assert.equal(H.retrato('bom', null), null);
assert.throws(() => H.retrato('xpto', {}), /desconhecido/);
ok('retrato: só os campos do item, sem vazio');

// Edição de quantidade.
let e = H.evento('formulas', 'i1', alcool, Object.assign({}, alcool, {percentualMM: 70}));
assert.equal(e.acao, 'EDITAR');
assert.equal(e.itemKey, 'i1');
assert.equal(e.antes.percentualMM, 74);
assert.equal(e.depois.percentualMM, 70);
assert.deepEqual(e.mudancas, ['MPGR-00127 — ÁLCOOL 96°GL: % m/m 74 → 70']);
assert.equal(e.descricao, 'Fórmula · Edição: MPGR-00127 — ÁLCOOL 96°GL: % m/m 74 → 70');
ok('edição: antes → depois da % m/m');

// Nada mudou: sem linha no histórico (só a sugestão do import, que não conta).
assert.equal(H.evento('formulas', 'i1', alcool, Object.assign({}, alcool, {sugestaoMatch: null})), null);
assert.equal(H.evento('formulas', 'i1', alcool, Object.assign({}, alcool, {percentualMM: '74'})), null, '"74" e 74 são o mesmo');
ok('sem mudança que conte: nenhum evento');

// Substituição (material trocado na mesma linha).
e = H.evento('formulas', 'i1', alcool, agua);
assert.equal(e.acao, 'SUBSTITUIR');
assert.deepEqual(e.mudancas, ['Trocado: MPGR-00127 — ÁLCOOL 96°GL por MPGR-00132 — ÁGUA']);
assert.equal(e.descricao, 'Fórmula · Substituição: MPGR-00127 — ÁLCOOL 96°GL por MPGR-00132 — ÁGUA');
e = H.evento('formulas', 'i1', alcool, Object.assign({}, agua, {percentualMM: 73}));
assert.deepEqual(e.mudancas, ['Trocado: MPGR-00127 — ÁLCOOL 96°GL por MPGR-00132 — ÁGUA (% m/m 74 → 73)']);
// O botão ⇄ força SUBSTITUIR mesmo sem trocar o código (ex.: mesmo material, nova %), e grava o evento.
e = H.evento('bom', 'b1', {materialCodigo: 'EP-1', qtdPorPeca: 1}, {materialCodigo: 'EP-1', qtdPorPeca: 1}, {acao: 'SUBSTITUIR'});
assert.equal(e.acao, 'SUBSTITUIR');
assert.deepEqual(e.mudancas, []);
ok('substituição: troca de material com antes/depois e % junto');

// Primeiro material numa linha nova não é "troca".
e = H.evento('formulas', 'i9', {fase: 'A', ordemAdicao: 1, percentualMM: 0}, {mpCodigo: 'MPGR-00132', mpNome: 'ÁGUA', fase: 'A', ordemAdicao: 1, percentualMM: 26});
assert.equal(e.acao, 'EDITAR');
assert.deepEqual(e.mudancas, ['Definido: MPGR-00132 — ÁGUA (% m/m 0 → 26)']);
ok('linha nova recebendo material: "Definido", não "Trocado"');

// Inclusão e exclusão.
e = H.evento('bom', 'b2', null, {materialCodigo: '', materialNome: '', qtdPorPeca: 0, posicao: 1});
assert.equal(e.acao, 'INCLUIR');
assert.equal(e.antes, null);
assert.deepEqual(e.depois, {qtdPorPeca: 0});
assert.deepEqual(e.mudancas, ['Linha nova (a preencher)']);
e = H.evento('bom', 'b1', {materialCodigo: 'EP-00012', materialNome: 'TAMPA', qtdPorPeca: 1}, null);
assert.equal(e.acao, 'EXCLUIR');
assert.equal(e.depois, null);
assert.deepEqual(e.mudancas, ['Removido: EP-00012 — TAMPA']);
assert.equal(e.descricao, 'BOM · Exclusão: Removido: EP-00012 — TAMPA');
ok('inclusão e exclusão');

// BOM "1 a cada N peças".
e = H.evento('bom', 'b3', {materialCodigo: 'ES-1', qtdPorPeca: 0.020833, pecasPorUnidade: 48}, {materialCodigo: 'ES-1', qtdPorPeca: 0.020833, pecasPorUnidade: 48});
assert.equal(e, null);
e = H.evento('bom', 'b3', {materialCodigo: 'ES-1', qtdPorPeca: 0.020833, pecasPorUnidade: 48}, {materialCodigo: 'ES-1', qtdPorPeca: 0.041667, pecasPorUnidade: 24});
assert.equal(e.acao, 'EDITAR');
assert.deepEqual(e.mudancas, ['ES-1: qtd. por peça 0,0208 → 0,0417']);
ok('BOM: 1 a cada N peças');

// Especificação: trocar o ensaio é substituir; mudar a faixa é editar.
const ph = {ensaio: 'pH', especificacaoTexto: '5,0 A 6,0', minimo: '5', maximo: '6', metodo: 'POT', critico: true};
e = H.evento('especificacoes', 'e1', ph, Object.assign({}, ph, {minimo: '4,5'}));
assert.equal(e.acao, 'EDITAR');
assert.deepEqual(e.mudancas, ['pH: mínimo 5 → 4,5']);
e = H.evento('especificacoes', 'e1', ph, Object.assign({}, ph, {ensaio: 'Viscosidade', critico: false}));
assert.equal(e.acao, 'SUBSTITUIR');
assert.deepEqual(e.mudancas, ['Trocado: pH por Viscosidade (crítico sim → não)']);
assert.equal(e.antes.critico, true);
assert.equal(e.depois.critico, false, 'false é guardado (não é vazio)');
ok('especificação: faixa = edição; outro ensaio = substituição');

assert.equal(H.rotuloAcao('SUBSTITUIR'), 'Substituição');
assert.equal(H.rotuloAcao('EDICAO'), 'Edição finalizada');
assert.equal(H.rotuloAcao('OUTRA'), 'OUTRA');
ok('rótulos');

console.log(`run_historico_itens_test: OK (${n} grupos)`);
