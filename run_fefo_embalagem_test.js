'use strict';
/* FEFO-01 (reunião 28/10): lote de embalagem segue FEFO na separação e no consumo.
   public/shared/fefo-embalagem.js com o FEFO REAL de shared/utils.js (sugerirAlocacaoFefo). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const FE = require('./public/shared/fefo-embalagem.js');

const ctx = {console, window: {}, document: {addEventListener() {}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('public/shared/utils.js', 'utf8'), ctx, {filename: 'utils.js'});
const sugerir = ctx.sugerirAlocacaoFefo;

let n = 0;
const eq = (a, b, m) => { n++; assert.equal(a, b, m); };
const deq = (a, b, m) => { n++; assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m); };
const ok = (c, m) => { n++; assert.ok(c, m); };

// Dois lotes da mesma tampa: o B vence antes, mesmo tendo chegado depois.
const lote = (x) => Object.assign({itemCodigo: 'EP-00200', status: 'LIBERADO', unidade: 'un'}, x);
const lotes = {
  A: lote({loteInterno: 'L-A', saldoLote: 600, dataValidade: '2027-12-31', dataRecebimento: '2026-08-01', enderecoKey: 'E1', enderecoCodigo: 'A-01'}),
  B: lote({loteInterno: 'L-B', saldoLote: 400, dataValidade: '2027-03-31', dataRecebimento: '2026-09-01', enderecoKey: 'E2', enderecoCodigo: 'A-02'}),
  // Lote da MISS RÔSE: só para OP dela, e vem antes do geral.
  C: lote({loteInterno: 'L-C', saldoLote: 100, dataValidade: '2028-01-31', enderecoKey: 'E3', enderecoCodigo: 'A-03', propriedade: {tipo: 'CLIENTE', clienteKey: 'MISSROSE'}}),
  // Em quarentena e em posição bloqueada: nunca indicados.
  Q: lote({loteInterno: 'L-Q', saldoLote: 999, dataValidade: '2026-11-30', status: 'QUARENTENA', enderecoKey: 'E4'}),
  X: lote({loteInterno: 'L-X', saldoLote: 999, dataValidade: '2026-11-15', enderecoKey: 'BLOQ'}),
};
const bloqueados = {BLOQ: true};
const av = (escolhas, clienteKey) => FE.avaliarEscolha({itemCodigo: 'EP-00200', escolhas, lotesDoItem: lotes, bloqueados, clienteKey: clienteKey || null, sugerir});

// ── Indicação ─────────────────────────────────────────────────────────────
const semCliente = FE.lotesElegiveis('EP-00200', lotes, bloqueados, null, sugerir);
deq(semCliente.map((l) => [l.loteKey, l.saldo]), [['B', 400], ['A', 600]], 'dois lotes, validades diferentes: o que vence primeiro (B) é o indicado; quarentena, posição bloqueada e lote de cliente fora');
const mr = FE.lotesElegiveis('EP-00200', lotes, bloqueados, 'MISSROSE', sugerir);
deq(mr.map((l) => l.loteKey), ['C', 'B', 'A'], 'OP da MISS RÔSE: o lote dela primeiro, depois o FEFO do geral');
deq(FE.lotesElegiveis('EP-00200', lotes, bloqueados, 'OUTRO', sugerir).map((l) => l.loteKey), ['B', 'A'], 'OP de outro cliente: o lote da MISS RÔSE não aparece');
deq(FE.lotesElegiveis('EP-00200', {}, {}, null, sugerir), [], 'sem lote (antes do Dia D): nada a indicar');

// ── Escolha do separador ──────────────────────────────────────────────────
let a = av([{loteKey: 'B', qtd: 400}, {loteKey: 'A', qtd: 100}]);
ok(!a.foraFefo && FE.validarSeparacao(a, '').ok, 'seguiu o FEFO (B inteiro, resto do A): passa sem motivo');
a = av([{loteKey: 'B', qtd: 300}]);
ok(!a.foraFefo, 'separação parcial na ordem do FEFO: sem motivo');
a = av([{loteKey: 'A', qtd: 500}]);
ok(a.foraFefo, 'pegou só do A (vence depois): fora do FEFO');
deq(a.fefo.map((f) => [f.loteKey, f.qtd]), [['B', 400], ['A', 100]], 'para os mesmos 500, o FEFO tiraria 400 do B e 100 do A');
const v = FE.validarSeparacao(a, '  ');
eq(v.erro, 'O FEFO indica L-B (400), L-A (100). Para usar outro lote, informe o motivo.', 'sem motivo: recusa com a mesma frase da pesagem');
ok(FE.validarSeparacao(a, 'Lote B está atrás de paletes, sem empilhadeira').ok, 'com motivo: passa');
a = av([{loteKey: 'B', qtd: 200}, {loteKey: 'A', qtd: 200}]);
ok(a.foraFefo, 'pegou do A antes de esgotar o B: fora do FEFO');
a = av([{loteKey: 'C', qtd: 50}], null);
ok(!FE.validarSeparacao(a, 'qualquer motivo').ok && /não pode ser usado/.test(a.erros[0]), 'lote do cliente para OP sem cliente: recusado mesmo com motivo');
a = av([{loteKey: 'C', qtd: 100}, {loteKey: 'B', qtd: 50}], 'MISSROSE');
ok(!a.foraFefo, 'OP da MISS RÔSE consumindo o lote dela primeiro: dentro do FEFO');
a = av([{loteKey: 'B', qtd: 450}]);
ok(/só 400/.test(a.erros[0]), 'mais que o saldo do lote: recusado');
a = av([{loteKey: 'A', qtd: 500}]);
deq(FE.registroForaFefo(a, ' Lote B atrás de paletes ', [{loteKey: 'A', qtd: 500}, {loteKey: 'B', qtd: 0}]),
  {motivoForaFefo: 'Lote B atrás de paletes', indicado: [{loteKey: 'B', qtd: 400, dataValidade: '2027-03-31'}, {loteKey: 'A', qtd: 100, dataValidade: '2027-12-31'}], usado: [{loteKey: 'A', qtd: 500}]},
  'registro na OP: motivo, o que o FEFO indicava e o que foi usado');

// ── Consumo (apontamento): o pedaço separado para a OP sai primeiro ───────
// A separação move o lote para a OP (origemTipo separacao_op, origemRef = lote da OP);
// o apontamento passa separadoPara, então baixa o que foi separado, não outro lote.
const comSeparado = Object.assign({}, lotes, {
  S: lote({loteInterno: 'L-A', saldoLote: 500, dataValidade: '2027-12-31', enderecoKey: 'E9', enderecoCodigo: 'PICK-01', origemTipo: 'separacao_op', origemRef: '26302/01'})
});
const baixa = sugerir('EP-00200', 300, comSeparado, bloqueados, {clienteKey: null, separadoPara: '26302/01'});
deq(baixa.alocacoes.map((x) => [x.loteKey, x.qtdSugerida]), [['S', 300]], 'consumo com separadoPara: sai do pedaço separado para a OP (mesmo fora do FEFO, com motivo registrado)');
const semRef = sugerir('EP-00200', 300, comSeparado, bloqueados, {clienteKey: null});
eq(semRef.alocacoes[0].loteKey, 'B', 'sem separadoPara o consumo baixaria o B -- divergência com o físico separado');

// form.html passa separadoPara e clienteKey nas duas baixas do WMS.
const form = fs.readFileSync('public/form.html', 'utf8');
ok(/baixarLotesFefo\(db, itemTipo, codigo, qtd, motivo, autor, ref, \{ clienteKey: clienteKey \|\| null, separadoPara: separadoPara \|\| null \}\)/.test(form), 'apontamento: baixa do WMS com clienteKey e separadoPara');
ok(/'CONSUMO DE PRODUÇÃO', autorConsumo, ref, clienteConsumo, op\.lote \|\| ref\)/.test(form) && /'PERDA DE PRODUÇÃO', autorPerda, ref, clientePerda, ref\)/.test(form), 'consumo e perda passam o lote da OP');

console.log(`OK FEFO da embalagem: ${n} asserções — indicado o que vence primeiro, cliente antes do geral e só para ele, fora do FEFO só com motivo (mesma frase da pesagem), lote inválido recusado, consumo sai do separado para a OP.`);
