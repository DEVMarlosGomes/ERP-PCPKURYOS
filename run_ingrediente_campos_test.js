/* AMO-04: a MP nova do P&D chega ao Cadastros com os mesmos campos da linha da
   manipulação (INCI até US$). Testa o lado do PCP (public/shared/ingrediente-campos.js);
   o contrato com o CRM está em crm-frontend/src/lib/ingredienteCampos.test.js. */
const assert = require('assert');
const C = require('./public/shared/ingrediente-campos.js');

// Tarefa nova: campos completos.
const nova = { tipo: 'MPES', inci: 'Parfum', fornecedor: 'Scentec',
  campos: { inci: 'Parfum', funcao: 'fragrância', fornecedor: 'Scentec', preco_brl_kg: null, preco_usd_kg: 38.5 } };
const fNova = C.paraFormularioMaterial(C.camposDaSolicitacao(nova), 'MPES');
assert.deepEqual(fNova, { inci: 'Parfum', funcaoFormula: '', custoTargetUsd: 38.5, custoReferencia: null,
  fornecedorNome: 'Scentec', referenciaPd: 'Preço no P&D: US$ 38,5/kg (Scentec)' });

// MPGR: função vai para "Função na fórmula"; US$ não tem campo próprio e fica na referência.
const mpgr = { campos: { inci: 'Glycerin', funcao: 'umectante', fornecedor: '', preco_brl_kg: 9.8, preco_usd_kg: 1.9 } };
const fMpgr = C.paraFormularioMaterial(C.camposDaSolicitacao(mpgr), 'MPGR');
assert.equal(fMpgr.funcaoFormula, 'umectante');
assert.equal(fMpgr.custoTargetUsd, null);
assert.equal(fMpgr.custoReferencia, 9.8);
assert.equal(fMpgr.referenciaPd, 'Preço no P&D: R$ 9,8/kg · US$ 1,9/kg');

// Tarefa antiga (antes de 22/10): só inci/fornecedor na raiz — continua abrindo.
const antiga = C.camposDaSolicitacao({ tipo: 'MPGR', inci: 'Aqua', fornecedor: 'Basf' });
assert.deepEqual(antiga, { inci: 'Aqua', funcao: '', fornecedor: 'Basf', preco_brl_kg: null, preco_usd_kg: null });
assert.equal(C.paraFormularioMaterial(antiga, 'MPGR').referenciaPd, '');

// Preço zero ou texto não vira preço.
assert.equal(C.camposDaSolicitacao({ campos: { preco_brl_kg: 0, preco_usd_kg: 'abc' } }).preco_brl_kg, null);

assert.deepEqual(C.CAMPOS_MATERIAL.map((c) => c.chave), ['inci', 'funcao', 'fornecedor', 'preco_brl_kg', 'preco_usd_kg']);
console.log('run_ingrediente_campos_test: OK');
