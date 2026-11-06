'use strict';

const fs = require('node:fs');

const arquivo = process.argv[2];
if (!arquivo) throw new Error('Uso: node scripts/auditar-sku-clientes.js <backup.json>');
const base = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

const clientes = [
  { nome: 'FEBELLA BEAUTY', cnpj: '26747489000153', prefixo: 'FB' },
  { nome: 'BIMEDIC', cnpj: null, prefixo: null },
];

const soDigitos = (valor) => String(valor || '').replace(/\D/g, '');
const normal = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const produtos = base.produtos || {};
const fornecedores = base.fornecedores || {};
const cadastrosClientes = base.clientes || {};

function identidades(cliente) {
  const cnpj = cliente.cnpj;
  const porCnpj = (no) => Object.entries(no || {}).filter(([, item]) => cnpj && soDigitos(item?.cnpj) === cnpj)
    .map(([id, item]) => ({ id, nome: item.nome || item.nomeFantasia || item.razaoSocial || '', cnpj: item.cnpj || '' }));
  const porNome = (no) => Object.entries(no || {}).filter(([, item]) => normal(JSON.stringify(item)).includes(normal(cliente.nome)))
    .map(([id, item]) => ({ id, nome: item.nome || item.nomeFantasia || item.razaoSocial || '', cnpj: item.cnpj || '' }));
  return { clientesPorCnpj: porCnpj(cadastrosClientes), fornecedoresPorCnpj: porCnpj(fornecedores), clientesPorNome: porNome(cadastrosClientes), fornecedoresPorNome: porNome(fornecedores) };
}

function produtosDoCliente(cliente) {
  return Object.entries(produtos).filter(([, produto]) => normal(`${produto?.cliente || ''} ${produto?.clienteKey || ''}`).includes(normal(cliente.nome).replace(/\s+/g, ''))
    || normal(produto?.cliente || '').includes(normal(cliente.nome)))
    .map(([id, produto]) => ({ id, sku: produto.sku || id, descricao: produto.descricao || '', ativo: produto.ativo }));
}

function referencias(skus) {
  const procurados = new Set(skus);
  const saida = Object.fromEntries(skus.map((sku) => [sku, []]));
  function andar(valor, caminho) {
    if (typeof valor === 'string') {
      for (const sku of procurados) if (valor.includes(sku)) saida[sku].push({ caminho, tipo: 'valor', valor });
      return;
    }
    if (!valor || typeof valor !== 'object') return;
    for (const [chave, filho] of Object.entries(valor)) {
      for (const sku of procurados) if (chave.includes(sku)) saida[sku].push({ caminho: `${caminho}/<CHAVE>`, tipo: 'chave', valor: chave });
      andar(filho, `${caminho}/${chave}`);
    }
  }
  andar(base, '');
  return saida;
}

const relatorio = clientes.map((cliente) => {
  const itens = produtosDoCliente(cliente);
  return { cliente, identidades: identidades(cliente), produtos: itens, referencias: referencias(itens.map((item) => item.sku)) };
});

process.stdout.write(`${JSON.stringify(relatorio, null, 2)}\n`);
