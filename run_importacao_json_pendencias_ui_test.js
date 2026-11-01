'use strict';
const assert = require('node:assert/strict');
const UI = require('./public/shared/importacao-json-pendencias-ui.js');

const dados = {
  a: {status: 'ABERTA', tipo: 'REFERENCIA_IMPORTACAO', colecao: 'ops', registroKey: 'OP1'},
  b: {status: 'RESOLVIDA', tipo: 'REFERENCIA_IMPORTACAO', colecao: 'ops', registroKey: 'OP2'},
  c: {status: 'ABERTA', tipo: 'DADO_PRODUTO', colecao: 'produtos'},
  d: {status: 'ABERTA', tipo: 'REFERENCIA_IMPORTACAO', colecao: 'bom', registroKey: 'B1'},
};
const abertas = UI.abertas(dados);
assert.deepEqual(abertas.map((item) => item.key), ['d', 'a']);
assert.deepEqual(UI.resumo(abertas), {bom: 1, ops: 1});
assert.deepEqual(UI.abertas(null), []);
console.log('run_importacao_json_pendencias_ui_test: OK');
