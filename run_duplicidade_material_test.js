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

// Mesmo nome em OUTRO tipo também é duplicata (23/10: a válvula EP-00001 foi recadastrada como MPGR
// no teste do usuário). O aviso diz o tipo em que ela já existe.
const cruzado = D.duplicataExata(D.candidatos({ tipo: 'ES', nome: 'Glicerina' }, materiais));
assert.equal(cruzado.mpCodigo, 'MPGR-00008');
assert.equal(cruzado.motivo, 'mesmo nome, cadastrado como MPGR');
const valvulas = { 'EP-00001': { mpCodigo: 'EP-00001', mpNome: 'VÁLVULA SPRAY R.24/410 BRUMA MATTE 120ML', tipo: 'EP' } };
assert.equal(D.duplicataExata(D.candidatos({ tipo: 'MPGR', nome: 'VALVULA SPRAY R.24/410 BRUMA MATTE 120ML' }, valvulas)).mpCodigo, 'EP-00001');

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
assert.equal(D.chaveMaterial('mpgr', ' Glicerina '), 'GLICERINA');

// ── Índice materiais_chave (regra do banco) ──
const ix = D.indiceInicial({
  'MPGR-00077': { mpNome: 'GLICERINA', tipo: 'MPGR' }, 'MPGR-00008': { mpNome: 'Glicerina', tipo: 'MPGR' },
  'MPGR-00099': { mpNome: 'Glicerina', tipo: 'MPGR', ativo: false }, 'EP-00001': { mpNome: 'Válvula spray 120ml', tipo: 'EP' },
  'MPGR-00142': { mpNome: 'VALVULA SPRAY 120ML', tipo: 'MPGR' },
});
assert.deepEqual(ix, { 'GLICERINA': 'MPGR-00008', 'VALVULA SPRAY 120ML': 'EP-00001' }, 'menor código é o dono (em qualquer tipo); inativo fora');
// Criar: reserva a chave; com dona, recusa.
assert.deepEqual(D.mudancasDoIndice(null, { tipo: 'MPGR', mpNome: 'Ureia' }, 'MPGR-00200', ix), { chave: 'UREIA', updates: { 'UREIA': 'MPGR-00200' } });
assert.equal(D.mudancasDoIndice(null, { tipo: 'MPGR', mpNome: 'glicerina' }, 'MPGR-00201', ix).erro, 'Já existe MPGR-00008 com este nome.');
// Duplicata antiga que não muda de nome continua salvando, sem ganhar a chave.
assert.deepEqual(D.mudancasDoIndice({ tipo: 'MPGR', mpNome: 'GLICERINA' }, { tipo: 'MPGR', mpNome: 'GLICERINA' }, 'MPGR-00077', ix), { chave: null, updates: {} });
// Renomear a duplicata para um nome livre resolve: ganha a chave nova.
assert.deepEqual(D.mudancasDoIndice({ tipo: 'MPGR', mpNome: 'GLICERINA' }, { tipo: 'MPGR', mpNome: 'GLICERINA USP' }, 'MPGR-00077', ix),
  { chave: 'GLICERINA USP', updates: { 'GLICERINA USP': 'MPGR-00077' } });
// Dono renomeado libera a chave antiga; inativado libera sem pegar outra.
assert.deepEqual(D.mudancasDoIndice({ tipo: 'MPGR', mpNome: 'Glicerina' }, { tipo: 'MPGR', mpNome: 'Glicerina bidestilada' }, 'MPGR-00008', ix).updates,
  { 'GLICERINA': null, 'GLICERINA BIDESTILADA': 'MPGR-00008' });
assert.deepEqual(D.mudancasDoIndice({ tipo: 'MPGR', mpNome: 'Glicerina' }, { tipo: 'MPGR', mpNome: 'Glicerina', ativo: false }, 'MPGR-00008', ix),
  { chave: null, updates: { 'GLICERINA': null } });
// Renomear para nome que já tem dono: recusado.
assert.match(D.mudancasDoIndice({ tipo: 'MPGR', mpNome: 'Ureia' }, { tipo: 'MPGR', mpNome: 'GLICERINA' }, 'MPGR-00200', ix).erro, /MPGR-00008/);

console.log('run_duplicidade_material_test: OK');
