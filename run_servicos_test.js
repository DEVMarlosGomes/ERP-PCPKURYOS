'use strict';
/* Tabela de serviços da cotação (PLANO_PD_CRM_AJUSTES.md, Fase 7).
   Regras puras de public/shared/servicos.js. */
const assert = require('node:assert/strict');
const S = require('./public/shared/servicos.js');

const T1 = '2026-10-15T10:00:00Z';
const T2 = '2026-10-20T09:00:00Z';

// normalização: vazio = SEM PREÇO (null), nunca zero; vírgula decimal aceita
let s = S.normalizar({ nome: ' Envase líquido ', unidade: 'un', preco: '', descontoPct: '5', setupLote: '150,5' });
assert.equal(s.nome, 'Envase líquido');
assert.equal(s.preco, null);
assert.equal(s.setupLote, 150.5);
assert.equal(S.validar(s), null);
assert.equal(S.rotuloPreco(s), 'SEM PREÇO');
assert.equal(S.rotuloPreco({ preco: 0.3, unidade: 'un' }), 'R$ 0,30 / un');

// validação
assert.match(S.validar(S.normalizar({ nome: '', unidade: 'un' })), /nome/);
assert.match(S.validar(S.normalizar({ nome: 'X', unidade: 'caixa' })), /Unidade/);
assert.match(S.validar(S.normalizar({ nome: 'X', unidade: 'un', preco: '0' })), /SEM PREÇO/);
assert.match(S.validar(S.normalizar({ nome: 'X', unidade: 'un', descontoPct: '120' })), /0 e 100/);
assert.match(S.validar(S.normalizar({ nome: 'X', unidade: 'un', preco: 'abc' })), /inválido em: preco/);
assert.match(S.validar(S.normalizar({ nome: 'X', unidade: 'un', produtividade: '0' })), /Produtividade/);

// preço sugerido = custo-hora ÷ produtividade × (1 + margem), na unidade de cobrança
assert.equal(S.precoSugerido({ unidade: 'un', custoHora: 300, produtividade: 600, margemPct: 20 }), 0.6);
assert.equal(S.precoSugerido({ unidade: 'milheiro', custoHora: 300, produtividade: 600 }), 500);
assert.equal(S.precoSugerido({ unidade: 'kg', custoHora: 200, produtividade: 400 }), 0.5);
assert.equal(S.precoSugerido({ unidade: 'lote', custoHora: 250, produtividade: 2, margemPct: 10 }), 550);
assert.equal(S.precoSugerido({ unidade: 'un', custoHora: null, produtividade: 600 }), null, 'sem custo-hora não inventa');

// código sequencial
assert.equal(S.proximoCodigo({}), 'SRV-001');
assert.equal(S.proximoCodigo({ a: { codigo: 'SRV-010' }, b: { codigo: 'SRV-002' }, c: { codigo: 'outro' } }), 'SRV-011');

// carga inicial: 10 serviços, todos SEM PREÇO, envase com produtividade conservadora
const sem = S.semente();
assert.equal(sem.length, 10);
assert.ok(sem.every((x) => x.preco === null && S.validar(x) === null));
assert.deepEqual(sem.map((x) => x.codigo), ['SRV-001', 'SRV-002', 'SRV-003', 'SRV-004', 'SRV-005', 'SRV-006', 'SRV-007', 'SRV-008', 'SRV-009', 'SRV-010']);
assert.equal(sem.find((x) => x.nome === 'Envase líquido').produtividade, 150);
assert.equal(sem.find((x) => x.nome === 'Manipulação de granel').unidade, 'kg');

// gravação: novo nasce num set só, com vigência e histórico
let g = S.gravacao('k1', null, { ...sem[1] }, 'Ana', T1, 'h1');
assert.deepEqual(Object.keys(g.update), ['servicos/k1']);
const gravado = g.update['servicos/k1'];
assert.equal(gravado.codigo, 'SRV-002');
assert.equal(gravado.vigenteDesde, T1);
assert.deepEqual(gravado.historico.h1, { em: T1, por: 'Ana', criado: true });

// edição: só caminhos planos; preço/desconto mudam a vigência e entram no histórico
const depois = S.normalizar({ ...gravado, preco: '0,32', descontoPct: '10' });
g = S.gravacao('k1', gravado, depois, 'Bruno', T2, 'h2');
assert.ok(Object.keys(g.update).every((k) => k.startsWith('servicos/k1/')), 'nunca objeto aninhado no update');
assert.equal(g.update['servicos/k1/preco'], 0.32);
assert.equal(g.update['servicos/k1/descontoPct'], 10);
assert.equal(g.update['servicos/k1/vigenteDesde'], T2);
assert.deepEqual(g.update['servicos/k1/historico/h2'].campos, { preco: { de: null, para: 0.32 }, descontoPct: { de: 0, para: 10 } });
assert.equal(g.update['servicos/k1/nome'], undefined, 'campo que não mudou não é regravado');

// mudar só a observação não abre vigência nova
g = S.gravacao('k1', { ...gravado, preco: 0.32 }, S.normalizar({ ...gravado, preco: 0.32, obs: 'nova' }), 'Bruno', T2, 'h3');
assert.equal(g.update['servicos/k1/vigenteDesde'], undefined);
assert.equal(g.update['servicos/k1/obs'], 'nova');

// salvar sem mudar nada não grava
g = S.gravacao('k1', gravado, S.normalizar(gravado), 'Bruno', T2, 'h4');
assert.equal(g.mudou, false);

// registro antigo sem "ativo" conta como ativo
assert.deepEqual(S.mudancas({ nome: 'X', unidade: 'un', preco: null, descontoPct: 0, setupLote: 0, minimoPedido: 0, custoHora: null, produtividade: null, margemPct: null, obs: '' },
  S.normalizar({ nome: 'X', unidade: 'un' })), {});

console.log('run_servicos_test: ok');
