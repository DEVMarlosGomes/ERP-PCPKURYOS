'use strict';
/* Identificação do IBC (bulk), 5 páginas por OP (public/shared/identificacao-ibc.js, 11/11/2026). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const I = require('./public/shared/identificacao-ibc');

const op = {lote: '26314/01', sku: 'FBHD0005', produto: 'HIDRATANTE CORPORAL GOURMET BRIGADEIRO 120ML', cliente: 'FEBELLA',
  validade: new Date(2028, 10, 30).toISOString(), qtdPlanejada: 5000};

// 1. Dados vêm da OP; validade em dd/mm/aaaa.
assert.deepEqual(I.dados(op), {produto: 'HIDRATANTE CORPORAL GOURMET BRIGADEIRO 120ML', codigo: 'FBHD0005', lote: '26314/01', validade: '30/11/2028'});
assert.equal(I.dados({validade: '2028-09-30'}).validade, '30/09/2028');
assert.deepEqual(I.faltando({lote: '1'}), ['Produto', 'SKU', 'Validade']);
assert.deepEqual(I.faltando(op), []);

// 2. Só Equipamento e Etiqueta, só dos 5 setores; texto limpo e limitado.
const c = I.normalizarCampos({fabricacao: {equipamento: '  TANQUE   03 ', etiqueta: 'A-12', lote: 'HACK', produto: 'X'}, intruso: {equipamento: 'x'}});
assert.deepEqual(Object.keys(c), ['separacao', 'fabricacao', 'envase', 'rotulagem', 'produtoAcabado']);
assert.deepEqual(c.fabricacao, {equipamento: 'TANQUE 03', etiqueta: 'A-12'});
assert.deepEqual(c.separacao, {equipamento: '', etiqueta: ''});
assert.equal(I.normalizarCampos({envase: {etiqueta: 'x'.repeat(200)}}).envase.etiqueta.length, 60);

// 3. Cinco páginas, uma por setor, com os dados da OP e o campo editável do setor.
const html = I.paginas(op, {fabricacao: {equipamento: 'TANQUE 03', etiqueta: 'A-12'}}, {logoUrl: 'kuryos-logo.svg'});
assert.equal((html.match(/<section class="ibc"/g) || []).length, 5);
['Separação', 'Fabricação', 'Envase', 'Rotulagem', 'Produto Acabado'].forEach((s) => assert.ok(html.includes('Setor: <b style="margin-left:4px">' + s + '</b>'), s));
assert.equal((html.match(/26314\/01/g) || []).length, 5);
assert.equal((html.match(/30\/11\/2028/g) || []).length, 5);
assert.equal((html.match(/FBHD0005/g) || []).length, 5);
assert.equal((html.match(/TANQUE 03/g) || []).length, 1, 'equipamento só na página da Fabricação');
assert.equal(I.paginas(op, {}, {setores: ['envase']}).match(/<section/g).length, 1);
assert.ok(!/<script>/.test(I.paginas(Object.assign({}, op, {produto: '<script>x</script>'}), {})), 'escapa HTML');

// 4. Documento: A4 deitada, cor preservada na impressão, título com o lote.
const doc = I.documento(op, {}, {});
assert.match(doc, /@page\{size:A4 landscape/);
assert.match(doc, /print-color-adjust:exact/);
assert.match(doc, /<title>Identificação IBC 26314\.01 - HIDRATANTE/);

// 5. Ligação: emissão e Controle de OPs abrem o diálogo; a OP guarda equipamento/etiqueta.
const emitir = fs.readFileSync(path.join(__dirname, 'public/emitir_op.html'), 'utf8');
assert.ok(emitir.includes('<script src="shared/identificacao-ibc.js"></script>'));
assert.match(emitir, /id="btnImprimirIbc"/);
assert.match(emitir, /IdentificacaoIbc\.abrirDialogo\(\{op: opJaEmitida, opKey: sanitizeKey\(opJaEmitida\.lote\), db: db\}\)/);
const ops = fs.readFileSync(path.join(__dirname, 'public/ops.html'), 'utf8');
assert.ok(ops.includes('<script src="shared/identificacao-ibc.js"></script>'));
assert.match(ops, /data-ibc="\$\{escapedKeyAttr\}" onclick="imprimirIdentificacaoIbc/);
const mod = fs.readFileSync(path.join(__dirname, 'public/shared/identificacao-ibc.js'), 'utf8');
assert.match(mod, /db\.ref\('ops\/' \+ cfg\.opKey \+ '\/identificacaoIbc'\)\.set\(c\)/);

console.log('OK identificação do IBC: dados da OP, 5 setores, só equipamento/etiqueta editáveis, A4 deitada, ligada na emissão e no Controle de OPs.');
