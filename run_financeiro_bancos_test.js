'use strict';
/* Financeiro F6 (10/11/2026): caixas e bancos. Movimento de conta (tarifa, IOF, juros,
   rendimento, transferência), estorno, caixa que não fica negativo, extrato com saldo
   acumulado e o lançamento na Controladoria. docs/financeiro-fase0-lacunas.md. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const F = require('./functions/financeiro');
const FS = require('./functions/financeiro_servidor');
const C = require('./functions/controladoria');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const recusa = (fn, re) => { assert.throws(fn, (e) => re.test(e.message)); n++; };
const AG = '2026-11-10T12:00:00.000Z';
const adm = {uid: 'u-adm', nome: 'ADM', role: 'admin'};

function base() {
  return {
    fin: {
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-11-01'},
        cx: {nome: 'Caixa', tipo: 'CAIXA', saldoInicialCentavos: 0, dataSaldoInicial: '2026-11-01'}},
      titulos: {T1: {tipo: 'PAGAR', valorCentavos: 5000, vencimentoFixo: '2026-11-20', emissao: '2026-11-01', natureza: 'OUTROS', parceiro: {nome: 'Padaria'}, documento: 'NF 9', origem: {tipo: 'MANUAL'}}},
      baixas: {}, movimentos: {}, conciliacoes: {}
    },
    ctl: {fechamentos: {'2026-10': {status: 'FECHADO'}}}
  };
}
// Aplica o update do servidor na base (como o RTDB faria).
function aplicar(b, updates) {
  Object.entries(updates).forEach(([k, v]) => {
    const ks = k.split('/'); let x = b;
    ks.slice(0, -1).forEach((p) => { x[p] = x[p] || {}; x = x[p]; });
    if (v === null) delete x[ks[ks.length - 1]]; else x[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
  });
}
const mov = (b, d) => { const r = FS.prepararMovimento(b, Object.assign({chave: 'mov' + Math.random().toString(36).slice(2, 10)}, d), adm, AG); aplicar(b, r.updates); return r; };
const saldo = (b, c, ate) => F.saldosBancarios(b.fin, ate || null)[c].saldoCentavos;

// ── 1. Tipos e validação ───────────────────────────────────────────────────
eq([F.tipoConta({tipo: 'CAIXA'}), F.tipoConta({}), F.tipoConta({tipo: 'X'})], ['CAIXA', 'BANCO', 'BANCO'], 'conta antiga é banco');
let b = base();
recusa(() => mov(b, {tipo: 'SAQUE', conta: 'itau', data: '2026-11-05', valorCentavos: 100}), /Tipo de movimento/);
recusa(() => mov(b, {tipo: 'TARIFA', conta: 'itau', data: '2026-11-05', valorCentavos: 0}), /valor/);
recusa(() => mov(b, {tipo: 'TARIFA', conta: 'nada', data: '2026-11-05', valorCentavos: 100}), /conta/);
recusa(() => mov(b, {tipo: 'TRANSFERENCIA', conta: 'itau', destino: 'itau', data: '2026-11-05', valorCentavos: 100}), /mesma conta/);
recusa(() => mov(b, {tipo: 'TARIFA', conta: 'itau', data: '2026-10-20', valorCentavos: 100}), /fechado/);
recusa(() => FS.prepararMovimento(b, {chave: 'x', tipo: 'TARIFA', conta: 'itau', data: '2026-11-05', valorCentavos: 100}, adm, AG), /Identificador/);

// ── 2. Caixa não fica negativo ─────────────────────────────────────────────
recusa(() => mov(b, {tipo: 'TARIFA', conta: 'cx', data: '2026-11-05', valorCentavos: 100}), /caixa Caixa ficaria negativo \(saldo R\$ 0,00\)/);
recusa(() => FS.prepararBaixa(b, {chave: 'bx0001', titulo: 'T1', valorCentavos: 5000, data: '2026-11-05', conta: 'cx'}, adm, AG), /ficaria negativo/);
mov(b, {tipo: 'TRANSFERENCIA', conta: 'itau', destino: 'cx', data: '2026-11-05', valorCentavos: 20000, historico: 'Suprimento'});
eq([saldo(b, 'itau'), saldo(b, 'cx')], [80000, 20000], 'suprimento: sai do banco e entra no caixa');
const bx = FS.prepararBaixa(b, {chave: 'bx0002', titulo: 'T1', valorCentavos: 5000, data: '2026-11-06', conta: 'cx'}, adm, AG);
aplicar(b, bx.updates);
eq(saldo(b, 'cx'), 15000, 'pagamento em dinheiro sai do caixa');
// Banco pode ficar negativo (cheque especial).
mov(b, {tipo: 'TARIFA', conta: 'itau', data: '2026-11-07', valorCentavos: 90000});
eq(saldo(b, 'itau'), -10000, 'banco negativo é permitido');

// ── 3. Idempotência, rendimento, estorno ───────────────────────────────────
b = base();
const r1 = FS.prepararMovimento(b, {chave: 'abc123', tipo: 'RENDIMENTO', conta: 'itau', data: '2026-11-08', valorCentavos: 1234}, adm, AG);
aplicar(b, r1.updates);
eq(FS.prepararMovimento(b, {chave: 'abc123', tipo: 'RENDIMENTO', conta: 'itau', data: '2026-11-08', valorCentavos: 1234}, adm, AG).repetido, true, 'clique duplo não duplica');
eq(saldo(b, 'itau'), 101234);
recusa(() => FS.prepararEstornoMovimento(b, {movimento: 'MV_abc123', motivo: 'x'}, adm, AG), /motivo/);
aplicar(b, FS.prepararEstornoMovimento(b, {movimento: 'MV_abc123', motivo: 'lançado em duplicidade', data: '2026-11-09'}, adm, AG).updates);
eq(saldo(b, 'itau'), 100000, 'estorno desfaz');
ok(b.fin.movimentos.MV_abc123 && b.fin.movimentos.MV_abc123_estorno.estorna === 'MV_abc123', 'nada se apaga: o original fica, o estorno é outro registro');
recusa(() => FS.prepararEstornoMovimento(b, {movimento: 'MV_abc123', motivo: 'de novo, outra vez'}, adm, AG), /já foi estornado/);
// Estorno de transferência devolve os dois lados; não pode zerar o caixa abaixo de zero.
b = base();
mov(b, {chave: 'trf001', tipo: 'TRANSFERENCIA', conta: 'itau', destino: 'cx', data: '2026-11-05', valorCentavos: 10000});
mov(b, {tipo: 'TRANSFERENCIA', conta: 'cx', destino: 'itau', data: '2026-11-06', valorCentavos: 8000});
recusa(() => FS.prepararEstornoMovimento(b, {movimento: 'MV_trf001', motivo: 'transferência errada'}, adm, AG), /ficaria negativo/);
// Conciliação do OFX com movimento.
b = base();
const rc = mov(b, {tipo: 'TARIFA', conta: 'itau', data: '2026-11-05', valorCentavos: 1590, extrato: {conta: 'itau', fitid: 'F77'}});
eq(b.fin.conciliacoes.itau_F77.movimento, rc.id, 'linha do extrato conciliada com o movimento');
recusa(() => mov(b, {tipo: 'TARIFA', conta: 'itau', data: '2026-11-05', valorCentavos: 1590, extrato: {conta: 'itau', fitid: 'F77'}}), /já foi conciliada/);
aplicar(b, FS.prepararEstornoMovimento(b, {movimento: rc.id, motivo: 'tarifa devolvida pelo banco'}, adm, AG).updates);
ok(!b.fin.conciliacoes.itau_F77, 'estorno libera a linha do extrato');

// ── 4. Extrato ─────────────────────────────────────────────────────────────
b = base();
mov(b, {tipo: 'TRANSFERENCIA', conta: 'itau', destino: 'cx', data: '2026-11-03', valorCentavos: 20000, historico: 'Suprimento'});
mov(b, {tipo: 'TARIFA', conta: 'itau', data: '2026-11-04', valorCentavos: 1500});
aplicar(b, FS.prepararBaixa(b, {chave: 'bx0003', titulo: 'T1', valorCentavos: 5000, data: '2026-11-06', conta: 'itau'}, adm, AG).updates);
let ex = F.extratoConta(b.fin, 'itau', '2026-11-01', '2026-11-30');
eq(ex.linhas.map((l) => [l.data, l.valorCentavos, l.saldoCentavos]),
  [['2026-11-01', 100000, 100000], ['2026-11-03', -20000, 80000], ['2026-11-04', -1500, 78500], ['2026-11-06', -5000, 73500]], 'saldo acumulado linha a linha');
ok(/Transferência para Caixa · Suprimento/.test(ex.linhas[1].historico) && /Pagamento NF 9 · Padaria/.test(ex.linhas[3].historico), 'histórico legível');
eq([ex.entradasCentavos, ex.saidasCentavos, ex.saldoFinalCentavos], [0, 26500, 73500], 'saldo inicial não conta como entrada');
ex = F.extratoConta(b.fin, 'itau', '2026-11-05', '2026-11-30');
eq([ex.saldoAnteriorCentavos, ex.linhas.length, ex.saldoFinalCentavos], [78500, 1, 73500], 'período: saldo anterior acumula o que veio antes');
eq(F.extratoConta(b.fin, 'cx', '2026-11-01', '2026-11-30').linhas.map((l) => l.historico)[1], 'Transferência de Itaú · Suprimento', 'o outro lado da transferência');
eq(ex.saldoFinalCentavos, F.saldosBancarios(b.fin, '2026-11-30').itau.saldoCentavos, 'extrato fecha com o saldo do banco');
eq(F.extratoConta(b.fin, 'cx', '2026-12-01', '2026-12-31').saldoFinalCentavos, 20000, 'mês sem lançamento: saldo anterior');

// ── 5. Controladoria ───────────────────────────────────────────────────────
b = base();
mov(b, {chave: 'trf002', tipo: 'TRANSFERENCIA', conta: 'itau', destino: 'cx', data: '2026-11-03', valorCentavos: 20000});
mov(b, {chave: 'tar002', tipo: 'TARIFA', conta: 'itau', data: '2026-11-04', valorCentavos: 1500});
mov(b, {chave: 'ren002', tipo: 'RENDIMENTO', conta: 'itau', data: '2026-11-04', valorCentavos: 700});
aplicar(b, FS.prepararEstornoMovimento(b, {movimento: 'MV_tar002', motivo: 'tarifa devolvida', data: '2026-11-05'}, adm, AG).updates);
const docs = C.documentosEsperados(b);
const p = (k) => docs[k].partidas.map((x) => [x.conta, x.banco || null, x.debitoCentavos, x.creditoCentavos]);
eq(p('MOV_MV_trf002'), [['BANCOS', 'cx', 20000, 0], ['BANCOS', 'itau', 0, 20000]], 'transferência: banco a banco');
eq(p('MOV_MV_tar002'), [['DESP_FIN', null, 1500, 0], ['BANCOS', 'itau', 0, 1500]], 'tarifa: despesa financeira');
eq(p('MOV_MV_ren002'), [['BANCOS', 'itau', 700, 0], ['RECEITA_FIN', null, 0, 700]], 'rendimento: receita financeira');
eq(p('MOV_MV_tar002_estorno'), [['DESP_FIN', null, 0, 1500], ['BANCOS', 'itau', 1500, 0]], 'estorno inverte');
// Razão de BANCOS por banco = saldo do Financeiro (movimentos + saldo inicial).
const razao = {};
Object.values(docs).forEach((d) => d.partidas.forEach((x) => { if (x.conta === 'BANCOS') razao[x.banco] = (razao[x.banco] || 0) + x.debitoCentavos - x.creditoCentavos; }));
const sb = F.saldosBancarios(b.fin, null);
eq([razao.itau, razao.cx], [sb.itau.saldoCentavos, sb.cx.saldoCentavos], 'razão de Bancos fecha com o saldo de cada conta');

// ── 6. Cópias e ligação ────────────────────────────────────────────────────
eq(fs.readFileSync('public/shared/financeiro.js', 'utf8'), fs.readFileSync('functions/financeiro.js', 'utf8'), 'motor do financeiro idêntico');
eq(fs.readFileSync('public/shared/controladoria.js', 'utf8'), fs.readFileSync('functions/controladoria.js', 'utf8'), 'motor da controladoria idêntico');
const idx = fs.readFileSync('functions/index.js', 'utf8');
for (const nome of ['finMovimentar', 'finEstornarMovimento']) ok(new RegExp('exports\\.' + nome + ' = onCall[\\s\\S]{0,200}filaFinanceiro\\(async').test(idx), nome + ' na fila do financeiro');
ok(/"fin\/movimentos"/.test(idx) && /movimentos: v\["fin\/movimentos"\]/.test(idx), 'servidor escuta fin/movimentos');
console.log('financeiro F6 (caixas e bancos): ' + n + ' asserções OK');
