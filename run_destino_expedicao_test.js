'use strict';
/* Destino da carga (10/11/2026): grafia do endereço não separa cargas.
   O caso real: Miss Rose com "RUA LAGOA TAI GRANDE, 1130",
   "Rua Lagoa Tai Grande, 1130" e "Rua Lagoa Taí Grande, 1130". */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const R = require('./functions/expedicao_regras.js');
const G = require('./public/shared/expedicao-grade.js');
let n = 0;
const grafias = ['RUA LAGOA TAI GRANDE, 1130', 'Rua Lagoa Tai Grande, 1130', 'Rua Lagoa Taí Grande, 1130', '  rua lagoa  taí grande 1130 '];
grafias.forEach((g) => { assert.ok(R.mesmoDestino(grafias[0], g), g); n++; });
assert.equal(R.mesmoDestino('Rua Lagoa Tai Grande, 1130', 'Rua Lagoa Tai Grande, 1310'), false, 'número diferente é outro destino'); n++;
assert.equal(R.mesmoDestino('Rua A, 10 - Barueri', 'Rua A, 10 - Osasco'), false, 'cidade diferente é outro destino'); n++;
assert.equal(R.mesmoDestino('', 'Rua A, 10'), false, 'sem endereço continua separado'); n++;
assert.equal(R.mesmoDestino('', null), true); n++;
assert.equal(R.mesmoDestino({rua: 'Rua Á', numero: '1'}, {numero: '1', rua: 'RUA A'}), true, 'objeto: mesma informação'); n++;
// Grade (seleção na tela) segue a mesma regra.
const linha = (end) => ({cliente: 'MISS ROSE', clienteKey: 'MISS', frete: {tipo: 'CIF', enderecoEntrega: end}});
if (typeof G.compativel === 'function') {
  assert.ok(G.compativel(linha(grafias[0]), linha(grafias[2]))); n++;
  assert.equal(G.compativel(linha(grafias[0]), linha('')), false); n++;
}
const sel = G.selecionarTodos([linha(grafias[0]), linha(grafias[1]), linha(grafias[2])], []);
assert.equal(sel.selecionar.length, 3, 'selecionar todos junta as três grafias: ' + JSON.stringify(sel)); n++;
// As três cópias da regra não podem divergir.
assert.equal(fs.readFileSync('functions/expedicao_regras.js', 'utf8'), fs.readFileSync('public/shared/expedicao.js', 'utf8')); n++;
for (const f of ['functions/agenda_expedicao.js', 'functions/expedicao.js', 'public/shared/expedicao-grade.js']) {
  assert.ok(!/JSON\.stringify\([^)]*enderecoEntrega/.test(fs.readFileSync(f, 'utf8')), f + ' voltou a comparar endereço exato'); n++;
}
console.log('destino da carga: ' + n + ' asserções OK');
