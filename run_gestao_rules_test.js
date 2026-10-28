'use strict';
/* Regras do Financeiro e da Controladoria (28/10/2026) no emulador real:
   firebase emulators:exec --project demo-gestao --only database --config firebase.retrabalhos-test.json "node run_gestao_rules_test.js"
   (--project demo-<nome> igual ao projectId daqui, senão o emulador não aplica as regras e o teste
   de negação "passa" sem testar nada -- CLAUDE.md.)
   - fin/: ADM ou módulo Financeiro (a Controladoria lê para reconciliar); títulos, abatimentos e
     baixas só o servidor grava; lote nasce aguardando e em nome de quem cria; extrato não se
     sobrescreve; conciliação só cria e só com baixa existente;
   - ctl/: ADM ou módulo Controladoria; lançamentos, derivados, painel e fechamento só o servidor;
     plano de contas não se apaga; orçamento por ano válido; o Financeiro lê os fechamentos. */
const assert = require('assert/strict');
const admin = require('./functions/node_modules/firebase-admin');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9023') throw new Error('Teste exige emulador local 9023.');
const URL = 'http://127.0.0.1:9023?ns=demo-gestao-default-rtdb';
const raiz = admin.initializeApp({projectId: 'demo-gestao', databaseURL: URL}, 'raiz').database();
const como = (uid) => admin.initializeApp({projectId: 'demo-gestao', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid).database();
const negado = (p, msg) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i, msg);
let n = 0;
const ok = async (p) => { await p; n++; };
const nega = async (p, msg) => { await negado(p, msg); n++; };

(async () => {
  await raiz.ref().set({
    usuarios: { adm: {role: 'admin'}, fin: {role: 'pcp', modulos: {financeiro: true}}, ctl: {role: 'pcp', modulos: {controladoria: true}},
      dir: {role: 'pcp', modulos: {custos: true}}, pcp: {role: 'pcp'}, tv: {role: 'tv'} },
    fin: { titulos: {T1: {tipo: 'PAGAR', valorCentavos: 100}}, baixas: {B1: {tipo: 'BAIXA', titulo: 'T1', valorCentavos: 50}},
      extratos: {itau: {F1: {valorCentavos: -50, data: '2026-10-01'}}} },
    ctl: { lancamentos: {'2026-10': {D1: {partidas: []}}}, fechamentos: {'2026-09': {status: 'FECHADO'}}, plano_contas: {BANCOS: {nome: 'Bancos'}} }
  });
  const adm = como('adm'), fin = como('fin'), ctl = como('ctl'), dir = como('dir'), pcp = como('pcp'), tv = como('tv');

  // ── fin/: leitura ──
  await ok(fin.ref('fin').once('value'));
  await ok(ctl.ref('fin/titulos').once('value'));
  await ok(adm.ref('fin/baixas').once('value'));
  await nega(pcp.ref('fin').once('value'), 'PCP não lê o Financeiro');
  await nega(dir.ref('fin/titulos').once('value'), 'módulo Custos sozinho não lê o Financeiro');
  await nega(tv.ref('fin/contas_bancarias').once('value'), 'TV não lê banco');

  // ── fin/: o que só o servidor grava ──
  await nega(adm.ref('fin/titulos/T2').set({tipo: 'PAGAR', valorCentavos: 1}), 'título: nem o ADM cria pela tela');
  await nega(fin.ref('fin/titulos/T1/valorCentavos').set(1), 'título: ninguém edita');
  await nega(fin.ref('fin/baixas/B2').set({tipo: 'BAIXA', titulo: 'T1', valorCentavos: 50}), 'baixa: só pelo servidor (callable)');
  await nega(adm.ref('fin/baixas/B1').remove(), 'baixa não se apaga (estorno)');
  await nega(fin.ref('fin/abatimentos/A1').set({valorCentavos: 1}), 'abatimento: só o servidor');

  // ── fin/: o que a tela grava ──
  await ok(fin.ref('fin/contas_bancarias/itau').set({nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-10-01'}));
  await nega(fin.ref('fin/contas_bancarias/bb').set({nome: 'BB', saldoInicialCentavos: '100', dataSaldoInicial: '2026-10-01'}), 'saldo inicial tem de ser número');
  await nega(ctl.ref('fin/contas_bancarias/bb').set({nome: 'BB', saldoInicialCentavos: 1, dataSaldoInicial: '2026-10-01'}), 'Controladoria só lê o Financeiro');
  await ok(fin.ref('fin/condicoes/T1').set({condicao: '28/42', por: 'Fin', em: 'x'}));
  await nega(fin.ref('fin/condicoes/NAO_EXISTE').set({condicao: '28', por: 'Fin'}), 'condição só para título que existe');
  await ok(fin.ref('fin/bloqueios/T1').set({motivo: 'nota com divergência', por: 'Fin', ativo: true}));
  await nega(fin.ref('fin/bloqueios/T1').set({motivo: 'x', por: 'Fin'}), 'bloqueio exige motivo');
  await ok(fin.ref('fin/lotes_pagamento/L1').set({status: 'AGUARDANDO', criadoPorUid: 'fin', titulos: {T1: 50}}));
  await nega(fin.ref('fin/lotes_pagamento/L1/status').set('APROVADO'), 'aprovar lote: só o servidor (segregação)');
  await nega(fin.ref('fin/lotes_pagamento/L2').set({status: 'APROVADO', criadoPorUid: 'fin', titulos: {T1: 50}}), 'lote nasce aguardando');
  await nega(fin.ref('fin/lotes_pagamento/L3').set({status: 'AGUARDANDO', criadoPorUid: 'adm', titulos: {T1: 50}}), 'lote em nome de outra pessoa');
  await ok(fin.ref('fin/extratos/itau/F2').set({valorCentavos: 100, data: '2026-10-02'}));
  await nega(fin.ref('fin/extratos/itau/F1').set({valorCentavos: 999, data: '2026-10-01'}), 'linha do extrato não se sobrescreve');
  await ok(fin.ref('fin/conciliacoes/itau_F1').set({conta: 'itau', fitid: 'F1', baixa: 'B1'}));
  await nega(fin.ref('fin/conciliacoes/itau_F1').set({conta: 'itau', fitid: 'F1', baixa: 'B1'}), 'conciliação não se troca');
  await nega(fin.ref('fin/conciliacoes/itau_F2').set({conta: 'itau', fitid: 'F2', baixa: 'NAO_EXISTE'}), 'conciliação só com baixa existente');
  await ok(fin.ref('fin/parametros/vencimentoFolhaDia').set(5));
  await nega(pcp.ref('usuarios/pcp/modulos/financeiro').set(true), 'ninguém se dá o módulo Financeiro');

  // ── ctl/ ──
  await ok(ctl.ref('ctl').once('value'));
  await ok(adm.ref('ctl/lancamentos').once('value'));
  await nega(fin.ref('ctl/lancamentos').once('value'), 'Financeiro não lê o razão gerencial');
  await ok(fin.ref('ctl/fechamentos').once('value'));
  await nega(dir.ref('ctl').once('value'), 'módulo Custos sozinho não lê a Controladoria');
  await nega(adm.ref('ctl/lancamentos/2026-10/D2').set({partidas: []}), 'lançamento: só o servidor');
  await nega(ctl.ref('ctl/lancamentos/2026-10/D1').remove(), 'lançamento não se apaga');
  await nega(ctl.ref('ctl/fechamentos/2026-09/status').set('REABERTO'), 'reabrir: só pelo servidor (ADM)');
  await nega(ctl.ref('ctl/derivados/X').set({doc: 'x'}), 'derivados: só o servidor');
  await nega(ctl.ref('ctl/painel/2026-10').set({ok: true}), 'painel: só o servidor');
  await ok(ctl.ref('ctl/plano_contas/BANCOS/contaReferencial').set('1.01.01.02.00'));
  await nega(ctl.ref('ctl/plano_contas/BANCOS').remove(), 'conta não se apaga');
  await ok(ctl.ref('ctl/orcamento/2026/DESP_ADM/ADMINISTRATIVO/10').set(50000));
  await nega(ctl.ref('ctl/orcamento/26/DESP_ADM/_/10').set(1), 'ano do orçamento inválido');
  await nega(fin.ref('ctl/orcamento/2026/DESP_ADM/_/10').set(1), 'Financeiro não mexe no orçamento');
  await ok(ctl.ref('ctl/centros_custo/LINHA_3').set({nome: 'Linha 3', tipo: 'PRODUTIVO'}));
  await nega(ctl.ref('ctl/centros_custo/LINHA_3').remove(), 'centro de custo não se apaga');
  await nega(fin.ref('fin/contas_bancarias/itau').remove(), 'conta bancária não se apaga');

  console.log(`OK regras Financeiro/Controladoria: ${n} verificações`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
