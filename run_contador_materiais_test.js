'use strict';
/* Código de material novo nunca cai num código que já existe (11/11/2026).
   O contador config/contadores/materiais/EP estava em 197 com EP-00204 cadastrado:
   "Novo material" gravou por cima de EP-00193..197 e de MPGR-00144, e as OPs
   passaram a sair com o item errado (o BOM aponta o código).
   node run_contador_materiais_test.js */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('public/shared/utils.js', 'utf8');
const start = source.indexOf('function nextSequential('), end = source.indexOf('// Ordenação clicável', start);
const {nextSequential, maiorNumeroDoPrefixo} = vm.runInNewContext(source.slice(start, end) + '\n;({nextSequential, maiorNumeroDoPrefixo})');

function fake(counter, records) {
  let value = counter; const lidos = [];
  return {get value() { return value; }, lidos, ref(path) { return {
    once: async () => { lidos.push(path); return {val: () => records}; },
    transaction: async (update) => { value = update(value); return {committed: true, snapshot: {val: () => value}}; }
  }; }};
}
const materiais = {
  'EP-00195': {mpCodigo: 'EP-00195', mpNome: 'FRASCO FEBELLA SP205 200ML'},
  'EP-00204': {mpCodigo: 'EP-00204', mpNome: 'TAMPA'},
  'ES-00347': {mpCodigo: 'ES-00347'},
  'MPGR-00149': {mpCodigo: 'MPGR-00149'},
  'CHAVE_LEGADA': {mpCodigo: 'EP-00210'},        // código só no campo
  'EP-00300': {mpNome: 'sem mpCodigo'},            // código só na chave
  'EPX-00999': {mpCodigo: 'EPX-00999'},            // outro prefixo: não conta
  'EP-ABC': {mpCodigo: 'EP-ABC'}, nulo: null
};
(async () => {
  let n = 0; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
  eq(maiorNumeroDoPrefixo(materiais, 'EP'), 300, 'maior entre chave e mpCodigo');
  eq(maiorNumeroDoPrefixo(materiais, 'ES'), 347);
  eq(maiorNumeroDoPrefixo(materiais, 'MU'), 0, 'tipo sem material começa do contador');
  eq(maiorNumeroDoPrefixo(null, 'EP'), 0);

  // O caso de produção: contador em 197, cadastro até 204 (aqui 300) -> nunca 198.
  const db = fake(197, materiais);
  const r = await nextSequential(db, 'config/contadores/materiais/EP', 'EP', 5);
  eq(r.formatado, 'EP-00301', 'pula tudo que já existe');
  eq(db.value, 301, 'e o contador fica alinhado');
  eq(db.lidos, ['materiais'], 'o piso vem do cadastro de materiais');
  eq(Object.keys(materiais).includes(r.formatado), false, 'código novo não colide');
  // Contador à frente do cadastro continua valendo (nunca volta).
  eq((await nextSequential(fake(500, materiais), 'config/contadores/materiais/EP', 'EP', 5)).formatado, 'EP-00501');
  // Contador vazio em tipo com cadastro.
  eq((await nextSequential(fake(null, materiais), 'config/contadores/materiais/MPGR', 'MPGR', 5)).formatado, 'MPGR-00150');
  // Dois "Novo" seguidos não repetem.
  const db2 = fake(326, materiais);
  eq([(await nextSequential(db2, 'config/contadores/materiais/ES', 'ES', 5)).formatado, (await nextSequential(db2, 'config/contadores/materiais/ES', 'ES', 5)).formatado], ['ES-00348', 'ES-00349']);
  // Outros contadores não leem materiais.
  const db3 = fake(7, {});
  await nextSequential(db3, 'contador_bombonas/BB', 'BB', 4);
  eq(db3.lidos, [], 'contador sem piso segue igual');

  // Ligação na tela: o salvamento confere no servidor antes de gravar e não grava por cima.
  const tela = fs.readFileSync('public/cadastros.html', 'utf8');
  const i = tela.indexOf("nextSequential(db, 'config/contadores/materiais/' + tipo, tipo, 5)");
  const trecho = tela.slice(i, tela.indexOf("updates['materiais/' + key] = data;", i));
  assert.ok(i > 0 && /db\.ref\('materiais\/' \+ sanitizeKey\(r\.formatado\)\)\.once\('value'\)/.test(trecho), 'confere a existência no servidor'); n++;
  assert.ok(/snap\.exists\(\)\) throw new Error/.test(trecho), 'recusa gravar por cima'); n++;
  console.log('run_contador_materiais_test: ' + n + ' verificações OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
