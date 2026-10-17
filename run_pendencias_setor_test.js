'use strict';
/* Pendências da Emissão de OP para os setores (17/10/2026). Regras de public/shared/pendencias-setor.js. */
const assert = require('node:assert/strict');
const P = require('./public/shared/pendencias-setor.js');

const T1 = '2026-10-17T12:00:00Z';
const T2 = '2026-10-18T09:00:00Z';

// Caso real: PRF-JOHN-0001 nasceu no CGI só com unCx = 20
const john = { sku: 'PRF-JOHN-0001', descricao: 'JOHN WOOD100ML', cliente: 'JOHN', unCx: 20 };
assert.deepEqual(P.faltasDoProduto(john).map((f) => [f.campo, f.setor, f.obrigatorio]), [
  ['volume', 'CADASTROS', true], ['densidadeGranel', 'QUALIDADE', true], ['prazoValidadeMeses', 'QUALIDADE', true], ['kgCaixa', 'CADASTROS', false],
]);
assert.equal(P.faltasDoProduto(john, { densidadeNaTela: '1' }).some((f) => f.campo === 'densidadeGranel'), false, 'densidade digitada na OP vale');
assert.equal(P.campoPreenchido({ volume: 60, unidadeVolume: 'ML' }, 'volume'), true);
assert.equal(P.campoPreenchido({ volume: 60, unidadeVolume: 'caixa' }, 'volume'), false);

// validação do que é digitado no quadro
assert.deepEqual(P.validarValor('volume', '60', 'ml'), { valores: { volume: 60, unidadeVolume: 'ml' } });
assert.deepEqual(P.validarValor('densidadeGranel', '0,98'), { valores: { densidadeGranel: 0.98 } });
assert.deepEqual(P.validarValor('prazoValidadeMeses', ''), { vazio: true });
assert.match(P.validarValor('prazoValidadeMeses', '24.5').erro, /inteiro/);
assert.match(P.validarValor('densidadeGranel', '9').erro, /entre/);
assert.match(P.validarValor('volume', '0', 'ml').erro, /maior que zero/);

// pendência por campo e por item; chave sem duplicar
const pv = P.pendenciaDeCampo('PRF-JOHN-0001', john, 'prazoValidadeMeses', 'Paula PCP', T1);
assert.equal(pv.setor, 'QUALIDADE');
assert.equal(pv.tipo, 'DADO_PRODUTO');
assert.equal(P.chave('PRF-JOHN-0001', P.refDe(pv)), 'PRF-JOHN-0001__prazoValidadeMeses');
const pi = P.pendenciaDeItem('PRF-JOHN-0001', john, { colecao: 'bom', versaoKey: 'PRF-JOHN-0001__v1', itemKey: 'i002', texto: 'Caixa master KUTM' }, 'Paula PCP', T1);
assert.equal(pi.setor, 'CADASTROS');
assert.match(pi.texto, /BOM do PRF-JOHN-0001: "Caixa master KUTM" não está no cadastro/);
assert.equal(P.chave('PRF-JOHN-0001', P.refDe(pi)), 'PRF-JOHN-0001__bom_i002');

// primeiro aviso grava a pendência; reaviso só conta (não duplica, não perde a data de criação)
let up = P.gravacaoAviso(null, pv);
assert.deepEqual(Object.keys(up), ['pendencias_setor/PRF-JOHN-0001__prazoValidadeMeses']);
up = P.gravacaoAviso(pv, P.pendenciaDeCampo('PRF-JOHN-0001', john, 'prazoValidadeMeses', 'Rui PCP', T2));
assert.deepEqual(up, { 'pendencias_setor/PRF-JOHN-0001__prazoValidadeMeses/ultimoAvisoEm': T2,
  'pendencias_setor/PRF-JOHN-0001__prazoValidadeMeses/ultimoAvisoPor': 'Rui PCP', 'pendencias_setor/PRF-JOHN-0001__prazoValidadeMeses/avisos': 2 });
// resolvida antes: novo aviso reabre do zero
assert.deepEqual(Object.keys(P.gravacaoAviso({ ...pv, status: 'RESOLVIDA' }, pv)), ['pendencias_setor/PRF-JOHN-0001__prazoValidadeMeses']);

// fecha sozinha quando o dado aparece
assert.equal(P.jaResolvida(pv, { produto: john }), false);
assert.equal(P.jaResolvida(pv, { produto: { ...john, prazoValidadeMeses: 24 } }), true);
const noCadastro = (c) => c === 'ET-00068';
assert.equal(P.jaResolvida(pi, { item: { materialCodigo: '' }, codigoNoCadastro: noCadastro }), false);
assert.equal(P.jaResolvida(pi, { item: { materialCodigo: 'ET-00068' }, codigoNoCadastro: noCadastro }), true);
assert.equal(P.jaResolvida({ ...pv, status: 'RESOLVIDA' }, { produto: {} }), false);
assert.deepEqual(Object.keys(P.gravacaoResolvida('K', 'Ana', T2, 'preenchido na barra')), [
  'pendencias_setor/K/status', 'pendencias_setor/K/resolvidaEm', 'pendencias_setor/K/resolvidaPor', 'pendencias_setor/K/resolvidaComo']);

// cada setor vê as suas (obrigatórias primeiro)
const todas = { a: { ...pv }, b: { ...pi }, c: { ...P.pendenciaDeCampo('X', {}, 'kgCaixa', '', T1) }, d: { ...pi, status: 'RESOLVIDA' } };
assert.deepEqual(P.abertasDoSetor(todas, 'QUALIDADE').map((e) => e[0]), ['a']);
assert.deepEqual(P.abertasDoSetor(todas, 'CADASTROS').map((e) => e[0]), ['b', 'c']);
assert.equal(P.abertasDoSetor(todas).length, 3);

console.log('run_pendencias_setor_test: OK');
