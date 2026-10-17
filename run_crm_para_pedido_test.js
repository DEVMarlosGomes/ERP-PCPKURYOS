'use strict';
/* Pedido comercial puxando contatos e valores do CRM (17/10/2026). Regras de public/shared/crm-para-pedido.js. */
const assert = require('node:assert/strict');
const C = require('./public/shared/crm-para-pedido.js');

// Caso real JOHN: cadastro mestre sem contato, CRM com o contato principal decisor
const crm = { a: { nome_empresa: 'JOHN', cadastro_cliente_id: 'JOHN', contato_principal: { nome: 'JOHN', email: 'JOHN@TESTE.COM', whatsapp: '11987652245', cargo: 'diretor', decisor: true },
  contatos_adicionais: [{ nome: 'Maria', email: 'maria@john.com', cargo: 'compras' }, { nome: '' }] }, b: { nome_empresa: 'Outro' } };
const cli = C.clienteCrmDe(crm, 'JOHN', 'JOHN');
assert.equal(cli.nome_empresa, 'JOHN');
assert.equal(C.clienteCrmDe(crm, 'XX', 'outro').nome_empresa, 'Outro', 'sem vínculo, acha pelo nome');
assert.equal(C.clienteCrmDe(crm, 'XX', 'nada'), null);
const lista = C.contatosDoCrm(cli);
assert.equal(lista.length, 2, 'contato vazio fica de fora');
assert.deepEqual(lista[0], { id: 'crm_principal', nome: 'JOHN', email: 'JOHN@TESTE.COM', telefone: '11987652245', areas: ['COMERCIAL'], principais: ['COMERCIAL'],
  outraArea: '', observacoes: 'Do CRM · diretor · decisor', doCrm: true });
assert.deepEqual(lista[1].principais, []);
assert.equal(C.contatosDoPedido([{ id: 'x', nome: 'Do cadastro' }], cli)[0].nome, 'Do cadastro', 'cadastro mestre manda');
assert.equal(C.contatosDoPedido([], cli).length, 2);

// Valores: cotação do CRM (caso JOHN: 5000 un a R$ 9,228)
const produto = { sku: 'PRF-JOHN-0001', origemCrm: { projetoId: 'P1', variacaoId: 'V1' } };
const propostas = { x: { projeto_id: 'P1', status: 'enviado', items_pedido: [{ codigo_kuryos: 'PRF-JOHN-0001', qtd: 5000, valor_unitario: 9.228 }] } };
assert.deepEqual(C.valoresDoCrm(produto, propostas, {}), { qtd: 5000, valor: 9.228, origem: 'cotação do CRM (enviada)' });
// sem cotação: rascunho do pedido do CRM; rascunho vazio (qtd 0) não vale
const pedidos = { 'PED-9': { numeroFormatado: 'PED-9', status: 'AGUARDANDO_CGI', origemCrm: { projetoId: 'P1' }, itens: [{ sku: 'PRF-JOHN-0001', qtd: 0, valorUnitario: 0 }] } };
assert.equal(C.valoresDoCrm(produto, {}, pedidos), null);
pedidos['PED-9'].itens[0] = { sku: 'PRF-JOHN-0001', qtd: 1200, valorUnitario: 8.5 };
assert.deepEqual(C.valoresDoCrm(produto, {}, pedidos), { qtd: 1200, valor: 8.5, origem: 'pedido do CRM PED-9' });
// produto que não nasceu no CRM
assert.equal(C.valoresDoCrm({ sku: 'X' }, propostas, pedidos), null);

console.log('run_crm_para_pedido_test: OK');
