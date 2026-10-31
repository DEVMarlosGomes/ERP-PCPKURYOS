'use strict';
/* COT-03 + D-11 (reunião 28/10/2026): Pedido de Compra de cotação de projeto do CRM só depois de o
   projeto virar pedido; exceção: o ADM libera com motivo. Todo PC de processo consolida antes as SCs de
   origem (solicitacoes_compra/{sc}/status = CONSOLIDADA); a regra recusa essa consolidação para SC com
   origem CRM_COTACAO sem liberacoes_pc_projeto/{projeto}.liberado. No emulador real:
     firebase emulators:exec --only database --project demo-pc-projeto --config <config com a porta>
       "node run_pc_projeto_rules_test.js"
   (--project demo-<nome> igual ao projectId abaixo; sem isso o emulador não aplica as regras.) */
const assert = require('assert/strict');
const path = require('path');
const admin = require(path.join(path.resolve(process.env.FUNCTIONS_NODE_MODULES || './functions/node_modules'), 'firebase-admin'));
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!/^127\.0\.0\.1:\d+$/.test(HOST || '')) throw new Error('Teste exige o emulador local (FIREBASE_DATABASE_EMULATOR_HOST).');
const URL = 'http://' + HOST + '?ns=demo-pc-projeto-default-rtdb';
const raiz = admin.initializeApp({projectId: 'demo-pc-projeto', databaseURL: URL}, 'raiz');
const como = (uid) => admin.initializeApp({projectId: 'demo-pc-projeto', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid).database();
const negado = (p) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i);

(async () => {
  const scCrm = (projetoId) => ({status: 'APROVADA', numeroFormatado: 'SC-0001', origem: {tipo: 'CRM_COTACAO', projetoId, cotacaoId: 'c1'}});
  await raiz.database().ref().set({
    usuarios: {
      adm: {role: 'admin', tenant_id: 'kuryos'},
      pcp: {role: 'pcp'},
      com: {role: 'comercial', tenant_id: 'kuryos'},
      prod: {role: 'production'}
    },
    erp: {kuryos: {crm_projects: {P1: {stage: 'cotacao'}, P2: {stage: 'cotacao'}}}},
    solicitacoes_compra: {S1: scCrm('P1'), S2: scCrm('P2'), S3: {status: 'APROVADA', numeroFormatado: 'SC-0003'}}
  });
  const adm = como('adm'), pcp = como('pcp'), com = como('com'), prod = como('prod');
  let casos = 0;
  const ok = async (p) => { await p; casos += 1; };
  const nao = async (p) => { await negado(p); casos += 1; };

  // SC comum (sem origem CRM) consolida como sempre.
  await ok(pcp.ref('solicitacoes_compra/S3/status').set('CONSOLIDADA'));
  // SC de cotação de projeto: antes do pedido, a consolidação (o PC) é recusada.
  await nao(pcp.ref('solicitacoes_compra/S1/status').set('CONSOLIDADA'));
  // O comercial não libera um projeto que ainda não é pedido; nem o ADM sem motivo.
  const pedido = {liberado: true, tipo: 'pedido', tenant: 'kuryos', em: 't'};
  await nao(com.ref('liberacoes_pc_projeto/P1').set(pedido));
  await nao(adm.ref('liberacoes_pc_projeto/P1').set({liberado: true, tipo: 'adm', motivo: 'curto'}));
  await nao(com.ref('liberacoes_pc_projeto/P1').set({liberado: true, tipo: 'adm', motivo: 'Amostra para a feira de sexta'}));
  await nao(prod.ref('liberacoes_pc_projeto/P1').set(pedido));
  // Projeto vira pedido: o CRM grava a liberação e o PC passa.
  await raiz.database().ref('erp/kuryos/crm_projects/P1/stage').set('pedido_aprovado');
  await ok(com.ref('liberacoes_pc_projeto/P1').set(pedido));
  await ok(pcp.ref('solicitacoes_compra/S1/status').set('CONSOLIDADA'));
  // Exceção D-11: ADM libera com motivo antes do pedido.
  await nao(pcp.ref('solicitacoes_compra/S2/status').set('CONSOLIDADA'));
  await ok(adm.ref('liberacoes_pc_projeto/P2').set({liberado: true, tipo: 'adm', motivo: 'Urgência: amostra para o cliente', em: 't'}));
  await ok(pcp.ref('solicitacoes_compra/S2/status').set('CONSOLIDADA'));
  // Só o ADM apaga a liberação.
  await nao(com.ref('liberacoes_pc_projeto/P1').remove());
  await ok(adm.ref('liberacoes_pc_projeto/P1').remove());

  console.log('run_pc_projeto_rules_test: ' + casos + ' casos OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
