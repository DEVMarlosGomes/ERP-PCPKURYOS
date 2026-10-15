'use strict';
/* SKU de entrada e fila de cadastro do P&D (PLANO_PD_CRM_AJUSTES.md, Fase 4).
   Regras puras de public/shared/sku-entrada.js. */
const assert = require('node:assert/strict');
const S = require('./public/shared/sku-entrada.js');

const T1 = '2026-10-15T10:00:00Z';
const T2 = '2026-11-02T09:00:00Z';

// MPES: aprovação primeiro; validação só com o final
assert.match(S.aplicar({}, { aprovacao: '', final: '' }, 'MPES', 'Ana', T1).erro, /SKU de aprovação/);
let r = S.aplicar({}, { aprovacao: 'SCE963092-AM', final: '' }, 'MPES', 'Ana', T1);
assert.equal(r.erro, undefined);
let mat = { tipo: 'MPES', mpCodigo: 'MPES-00012', skusEntrada: r.skusEntrada };
assert.equal(S.estado(mat).status, 'aguardando_final');
assert.equal(S.estado(mat).rotulo, 'Aguardando SKU final');

// chega o lote de compra: SKU final valida; aprovação continua guardada
r = S.aplicar(mat, { aprovacao: 'SCE963092-AM', final: 'SCE963092-L240' }, 'MPES', 'Bruno', T2);
mat = { ...mat, skusEntrada: r.skusEntrada };
assert.equal(S.estado(mat).status, 'validado');
assert.equal(S.estado(mat).aprovacao, 'SCE963092-AM');
assert.equal(mat.skusEntrada.aprovacao.em, T1, 'código que não mudou mantém a data original');
assert.equal(mat.mpCodigo, 'MPES-00012', 'código interno não muda');

// troca do SKU final: o anterior vai para o histórico
r = S.aplicar(mat, { aprovacao: 'SCE963092-AM', final: 'SCE963092-L311' }, 'MPES', 'Carla', '2026-12-01T00:00:00Z');
assert.deepEqual(r.skusEntrada.historico, [{ campo: 'final', codigo: 'SCE963092-L240', desde: T2, ate: '2026-12-01T00:00:00Z', por: 'Carla' }]);

// demais tipos: SKU final só com a caixa marcada
r = S.aplicar({}, { aprovacao: 'BASF-CETIOL', final: 'BASF-CETIOL-2' }, 'MPGR', 'Ana', T1);
assert.equal(r.skusEntrada.final, null, 'sem a caixa o final não entra');
assert.equal(S.estado({ tipo: 'MPGR', skusEntrada: r.skusEntrada }).status, 'aprovacao');
r = S.aplicar({}, { aprovacao: 'BASF-CETIOL', final: 'BASF-CETIOL-2', querFinal: true }, 'MPGR', 'Ana', T1);
assert.equal(S.estado({ tipo: 'MPGR', skusEntrada: r.skusEntrada }).status, 'final');
assert.equal(S.aplicar({}, { aprovacao: '', final: '' }, 'EP', 'Ana', T1).erro, undefined, 'demais tipos não exigem SKU');
assert.match(S.aplicar({}, { aprovacao: '', final: 'X', querFinal: true }, 'MPGR', 'Ana', T1).erro, /antes do SKU final/);
// desmarcar a caixa tira o final, que vai para o histórico
const comFinal = { tipo: 'MPGR', skusEntrada: r.skusEntrada };
r = S.aplicar(comFinal, { aprovacao: 'BASF-CETIOL', final: 'BASF-CETIOL-2', querFinal: false }, 'MPGR', 'Ana', T2);
assert.equal(r.skusEntrada.final, null);
assert.equal(r.skusEntrada.historico[0].codigo, 'BASF-CETIOL-2');
assert.equal(S.estado({}).status, 'sem_sku');

// fila do P&D
const fila = {
  b: { status: 'PENDENTE_CADASTRO', criadoEm: T2, tipo: 'MPES', nome: 'Fragrância Shower Butter I', inci: 'Parfum', fornecedor: 'Scentec',
    origem: { projetoNumero: '2026-031', projeto: 'Linha Banho', amostra: '2026-031-A1-a', cliente: 'Lumi', formulaVersao: 2 } },
  a: { status: 'PENDENTE_CADASTRO', criadoEm: T1, tipo: 'MPGR', nome: 'Manteiga de Quinoa' },
  c: { status: 'CADASTRADO', criadoEm: T1 },
};
assert.deepEqual(S.pendentes(fila).map((e) => e[0]), ['a', 'b']);
const f = S.dadosParaFormulario(fila.b);
assert.deepEqual(f, { tipo: 'MPES', nome: 'Fragrância Shower Butter I', inci: 'Parfum', fornecedorNome: 'Scentec',
  especificacoes: 'Do P&D · projeto 2026-031 Linha Banho · amostra 2026-031-A1-a · cliente Lumi · fórmula v2.' });
assert.equal(S.dadosParaFormulario({ tipo: 'XX' }).tipo, 'MPGR');
assert.deepEqual(S.fechamento('MPES-00012', 'MPES-00012', 'Ana', T2), { status: 'CADASTRADO', materialKey: 'MPES-00012', mpCodigo: 'MPES-00012', cadastradoEm: T2, cadastradoPor: 'Ana' });

console.log('run_sku_entrada_test: OK');
