/* CAD-01: MP nova não duplica cadastro — candidatos, bloqueio por nome e vínculo.
   Casos tirados da base real de 22/10 (AUDITORIA_PACOTE_20261021.md §6.2). */
const assert = require('assert');
const D = require('./public/shared/duplicidade-material.js');

const materiais = {
  'MPGR-00030': { mpCodigo: 'MPGR-00030', mpNome: 'ALCOOL CETOESTEARILICO 30/70', tipo: 'MPGR', inci: 'Cetearyl Alcohol' },
  'MPGR-00008': { mpCodigo: 'MPGR-00008', mpNome: 'GLICERINA', tipo: 'MPGR', inci: 'GLYCERIN' },
  'MPGR-00010': { mpCodigo: 'MPGR-00010', mpNome: 'CARBONATO DE DICAPRILILA', tipo: 'MPGR', inci: 'DICAPRYLYL CARBONATE' },
  'MPES-00004': { mpCodigo: 'MPES-00004', mpNome: 'ESSENCIAL LAYA GF47915', tipo: 'MPES', inci: 'PARFUM',
    fornecedores: { f1: { codigoFornecedor: 'GF47915' } } },
  'MPGR-00099': { mpCodigo: 'MPGR-00099', mpNome: 'GLICERINA BIDESTILADA', tipo: 'MPGR', ativo: false },
};

// Aceite do prompt: "Álcool Cetoestearílico 30/70" bate com "ALCOOL CETOESTEARILICO 30/70".
const c1 = D.candidatos({ tipo: 'MPGR', nome: 'Álcool Cetoestearílico 30/70' }, materiais);
assert.equal(c1[0].mpCodigo, 'MPGR-00030');
assert.equal(c1[0].motivo, 'mesmo nome');
assert.equal(D.duplicataExata(c1).key, 'MPGR-00030');

// Mesmo nome em OUTRO tipo não é duplicata (rótulo × MP podem ter nomes iguais).
assert.equal(D.duplicataExata(D.candidatos({ tipo: 'ES', nome: 'Glicerina' }, materiais)), null);

// Nome parecido sugere, mas não bloqueia; inativo fica de fora.
const c2 = D.candidatos({ tipo: 'MPGR', nome: 'Glicerina vegetal' }, materiais);
assert.deepEqual(c2.map((c) => [c.mpCodigo, c.motivo]), [['MPGR-00008', 'nome parecido']]);
assert.equal(D.duplicataExata(c2), null);

// Nome comercial diferente com o mesmo INCI: candidato fraco (Cetiol CC × Carbonato de dicaprilila).
const c3 = D.candidatos({ tipo: 'MPGR', nome: 'Cetiol CC', inci: 'Dicaprylyl Carbonate' }, materiais);
assert.deepEqual(c3.map((c) => [c.mpCodigo, c.motivo]), [['MPGR-00010', 'mesmo INCI']]);

// PARFUM não serve: 90 fragrâncias têm o mesmo INCI.
assert.deepEqual(D.candidatos({ tipo: 'MPES', nome: 'Essência Nova X', inci: 'Parfum' }, materiais), []);
// Mas o código do fornecedor serve.
assert.equal(D.candidatos({ tipo: 'MPES', nome: 'Laya nova', codigoFornecedor: 'gf47915' }, materiais)[0].motivo, 'mesmo código do fornecedor');

// Editar o próprio material não acusa ele mesmo.
assert.equal(D.duplicataExata(D.candidatos({ tipo: 'MPGR', nome: 'Glicerina' }, materiais, 'MPGR-00008')), null);

// Vínculo fecha a tarefa apontando para o existente.
assert.deepEqual(D.vinculo(materiais['MPGR-00008'], 'MPGR-00008', 'Ana', 't'),
  { status: 'VINCULADO', materialKey: 'MPGR-00008', mpCodigo: 'MPGR-00008', vinculadoEm: 't', vinculadoPor: 'Ana' });
assert.equal(D.chaveMaterial('mpgr', ' Glicerina '), 'MPGR|GLICERINA');

console.log('run_duplicidade_material_test: OK');
