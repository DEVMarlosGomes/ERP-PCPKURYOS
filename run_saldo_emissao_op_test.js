'use strict';
/* OP-01/OP-02 (reunião 28/10): saldo de insumo na emissão de OP, pelo dono certo
   (public/shared/saldo-emissao-op.js). */
const assert = require('node:assert/strict');
const S = require('./public/shared/saldo-emissao-op');

let n = 0;
const eq = (a, b, m) => { n++; assert.equal(a, b, m); };
const deq = (a, b, m) => { n++; assert.deepEqual(a, b, m); };
const ok = (c, m) => { n++; assert.ok(c, m); };

const materiais = {
  'EP-1': {mpCodigo: 'EP-1', mpNome: 'FRASCO', unidade: 'un'},
  'EP-2': {mpCodigo: 'EP-2', mpNome: 'TAMPA', unidade: 'un'},
  'MPGR-AGUA': {mpCodigo: 'MPGR-AGUA', mpNome: 'ÁGUA', unidade: 'kg', controlaEstoque: false},
  'ES-9': {mpCodigo: 'ES-9', mpNome: 'CAIXA', unidade: 'un'},
};
const estoque = {
  // 1.000 no total, 600 são do cliente MR, 100 do cliente XX -> geral 300.
  'EP-1': {saldoAtual: 1000, unidade: 'un', porCliente: {MR: {saldoAtual: 600}, XX: {saldoAtual: 100}}},
  'EP-2': {saldoAtual: 50, unidade: 'un'},
  // Registro com chave diferente do código (o achado de saldoEstoqueDoMaterial).
  outro: {materialCodigo: 'ES-9', saldoAtual: 5, unidade: 'un'},
};

// ── Saldo do dono certo ─────────────────────────────────────────────────
deq(S.saldoParaOp(estoque['EP-1'], null), {registrado: true, total: 1000, geral: 300, parteCliente: 0, disponivel: 300, unidade: 'un'}, 'OP sem cliente: só o geral (total − partes)');
deq(S.saldoParaOp(estoque['EP-1'], 'MR'), {registrado: true, total: 1000, geral: 300, parteCliente: 600, disponivel: 900, unidade: 'un'}, 'OP do cliente MR: geral + a parte dele');
eq(S.saldoParaOp(estoque['EP-1'], 'XX').disponivel, 400, 'cliente XX não usa a parte do MR');
eq(S.saldoParaOp({saldoAtual: 100, porCliente: {MR: {saldoAtual: 150}}}, 'XX').disponivel, -50, 'geral negativo (material de cliente usado por outro) aparece');
eq(S.saldoParaOp(null, 'MR').registrado, false, 'sem registro: saldo 0, não registrado');
eq(S.registroEstoque('ES-9', estoque).saldoAtual, 5, 'acha o registro pelo materialCodigo');
ok(S.semControle('MPGR-AGUA', materiais), 'controlaEstoque=false: sem controle');

// ── Verificação ─────────────────────────────────────────────────────────
const itens = [
  {mpCodigo: 'EP-1', mpNome: 'FRASCO', quantidade: 500, unidade: 'un'},
  {mpCodigo: 'EP-1', mpNome: 'FRASCO', quantidade: 300, unidade: 'un'},   // mesmo material duas vezes: soma 800
  {mpCodigo: 'EP-2', mpNome: 'TAMPA', quantidade: 800, unidade: 'un'},
  {mpCodigo: 'MPGR-AGUA', mpNome: 'ÁGUA', quantidade: 999999, unidade: 'kg'}, // sem controle: fora
  {mpCodigo: 'ES-9', mpNome: 'CAIXA', quantidade: 5, unidade: 'un'},
  {mpCodigo: 'EP-NOVO', mpNome: 'VÁLVULA', quantidade: 10, unidade: 'un'},  // sem registro de estoque
];
const vMR = S.verificarSaldoEmissao({itens, estoque, materiais, clienteKey: 'MR'});
deq(vMR.faltas.map((f) => [f.mpCodigo, f.necessario, f.saldo]), [['EP-2', 800, 50], ['EP-NOVO', 10, 0]], 'cliente MR: o frasco (800 ≤ 900) passa; tampa e válvula faltam');
eq(vMR.conferidos, 4, 'água sem controle fica fora da conferência');
const vSem = S.verificarSaldoEmissao({itens, estoque, materiais, clienteKey: null});
deq(vSem.faltas.map((f) => [f.mpCodigo, f.necessario, f.saldo]), [['EP-1', 800, 300], ['EP-2', 800, 50], ['EP-NOVO', 10, 0]], 'sem cliente: o frasco do cliente não conta (800 > 300)');
const vXX = S.verificarSaldoEmissao({itens: [itens[0]], estoque, materiais, clienteKey: 'XX'});
deq(vXX.faltas.map((f) => [f.mpCodigo, f.saldo, f.geral, f.parteCliente]), [['EP-1', 400, 300, 100]], 'material do cliente MR não serve à OP do XX');
const msg = S.mensagemFaltas(vMR.faltas);
ok(/EP-2 — TAMPA: necessário 800 un, saldo 50 un/.test(msg) && /EP-NOVO — VÁLVULA: necessário 10 un, saldo 0 un \(sem registro de estoque\)/.test(msg), 'mensagem lista item, necessário e saldo: ' + msg);

// ── Decisão ─────────────────────────────────────────────────────────────
deq(S.decidirEmissao({bloquear: false, verificacao: vMR, ehAdm: false}).pode, true, 'chave desligada: emite como hoje, mesmo faltando');
deq(S.decidirEmissao({bloquear: undefined, verificacao: vMR}).pode, true, 'chave ausente = desligada (padrão até o Dia D)');
const negado = S.decidirEmissao({bloquear: true, verificacao: vMR, ehAdm: false});
ok(!negado.pode && /administrador/.test(negado.mensagem) && /EP-2/.test(negado.mensagem), 'chave ligada, PCP: recusa listando as faltas e diz quem libera');
const pedeMotivo = S.decidirEmissao({bloquear: true, verificacao: vMR, ehAdm: true});
ok(!pedeMotivo.pode && pedeMotivo.precisaMotivo, 'chave ligada, ADM sem motivo: pede o motivo');
ok(/mínimo 10/.test(S.decidirEmissao({bloquear: true, verificacao: vMR, ehAdm: true, motivo: 'curto'}).mensagem), 'motivo curto recusado');
const liberado = S.decidirEmissao({bloquear: true, verificacao: vMR, ehAdm: true, motivo: '  Material chega amanhã cedo, NF 123  '});
ok(liberado.pode && liberado.liberacao.motivo === 'Material chega amanhã cedo, NF 123' && liberado.liberacao.faltas.length === 2, 'ADM com motivo: libera e leva motivo + faltas para a OP');
eq(S.decidirEmissao({bloquear: true, verificacao: S.verificarSaldoEmissao({itens: [itens[0]], estoque, materiais, clienteKey: 'MR'})}).pode, true, 'chave ligada com saldo suficiente: emite sem liberação');

console.log(`OK saldo na emissão de OP: ${n} asserções — dono certo (geral/porCliente pelo SKU), material sem controle fora, consumo somado por material, chave desligada = como hoje, ligada recusa com item/necessário/saldo, ADM libera com motivo.`);
