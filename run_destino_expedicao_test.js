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
  assert.equal(G.compativel(linha(grafias[0]), linha('')), true, 'pedido sem endereço acompanha o destino (mesmo cliente)'); n++;
  assert.equal(G.compativel(linha(grafias[0]), linha('Av. Paulista, 1000')), false, 'endereço diferente continua fora'); n++;
  assert.equal(G.compativel(linha(''), {cliente: 'OUTRO', clienteKey: 'OUT', frete: {enderecoEntrega: ''}}), false, 'outro cliente continua fora'); n++;
}
const sel = G.selecionarTodos([linha(grafias[0]), linha(grafias[1]), linha(grafias[2])], []);
assert.equal(sel.selecionar.length, 3, 'selecionar todos junta as três grafias: ' + JSON.stringify(sel)); n++;
// destinoDaCarga: o caso do Marcos (pedido 27 sem endereço junto com o 30).
const pal = (id, ped, end, extra) => Object.assign({lote: {identificadorPalete: id}, pedidoNumero: ped, cliente: 'Miss Rose', frete: {tipo: 'CIF', enderecoEntrega: end}}, extra || {});
let d = R.destinoDaCarga([pal('PA-26273-03-P1', '27', ''), pal('PA-26303-02-P1', '30', grafias[2]), pal('PA-26246-03-P1', '0023', grafias[0])]);
assert.deepEqual([d.conflito, d.endereco, d.semEndereco], [null, grafias[2], ['27']]); n++;
d = R.destinoDaCarga([pal('PA-1', '27', ''), pal('PA-2', '28', '')]);
assert.deepEqual([d.conflito, d.endereco, d.semEndereco], [null, '', ['27', '28']], 'todos sem endereço: carga sem destino informado'); n++;
d = R.destinoDaCarga([pal('PA-1', '30', grafias[0]), pal('PA-9', '41', 'Av. Paulista, 1000')]);
assert.match(d.conflito, /PA-1 \(pedido 30\) → "RUA LAGOA TAI GRANDE, 1130"; PA-9 \(pedido 41\) → "Av\. Paulista, 1000"\. O que fazer: monte uma carga para cada endereço/); n++;
assert.match(R.mensagemOutroCliente(pal('PA-1', '30', ''), pal('PA-7', '12', '', {cliente: 'Bria Beauty'})), /O palete PA-7 \(pedido 12\) é do cliente Bria Beauty, e a carga já tem paletes de Miss Rose\. .*tire esse palete da seleção/); n++;
assert.match(R.mensagemFrete(pal('PA-3', '30', '', {frete: {tipo: 'FOB'}}), 'ENTREGA'), /é FOB \(o cliente coleta\), mas a carga está como Entrega CIF\. Troque o tipo de transporte para Coleta FOB/); n++;

// As três cópias da regra não podem divergir.
assert.equal(fs.readFileSync('functions/expedicao_regras.js', 'utf8'), fs.readFileSync('public/shared/expedicao.js', 'utf8')); n++;
for (const f of ['functions/agenda_expedicao.js', 'functions/expedicao.js', 'public/shared/expedicao-grade.js']) {
  assert.ok(!/JSON\.stringify\([^)]*enderecoEntrega/.test(fs.readFileSync(f, 'utf8')), f + ' voltou a comparar endereço exato'); n++;
}
console.log('destino da carga: ' + n + ' asserções OK');
