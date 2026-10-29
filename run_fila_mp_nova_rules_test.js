'use strict';
/* PD-03 (reunião 28/10/2026, D-08): a solicitação de MP nova nasce quando o P&D SALVA o
   ingrediente (crm-frontend/src/lib/firebaseApi.js:sincronizarFilaMpNova), não mais só na
   aprovação do cliente. Confere, no emulador real, que a regra de solicitacoes_cadastro_material
   deixa quem usa a tela do P&D gravar (papel pd ou módulo P&D, PCP, ADM) com os caminhos planos
   do plano da fila (criar, somar origem, cancelar, reabrir), e que a checagem de duplicidade lê
   materiais_chave/materiais. Quem não é do P&D/Cadastros/Comercial continua sem gravar.
     firebase emulators:exec --only database --project demo-fila-mp --config <config com a porta>
       "node run_fila_mp_nova_rules_test.js"
   (--project demo-<nome> igual ao projectId abaixo; sem isso o emulador não aplica as regras.) */
const assert = require('assert/strict');
const path = require('path');
const admin = require(path.join(process.env.FUNCTIONS_NODE_MODULES || './functions/node_modules', 'firebase-admin'));
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!/^127\.0\.0\.1:\d+$/.test(HOST || '')) throw new Error('Teste exige o emulador local (FIREBASE_DATABASE_EMULATOR_HOST).');
const URL = 'http://' + HOST + '?ns=demo-fila-mp-default-rtdb';
const raiz = admin.initializeApp({projectId: 'demo-fila-mp', databaseURL: URL}, 'raiz');
const como = (uid) => admin.initializeApp({projectId: 'demo-fila-mp', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid).database();
const negado = (p) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i);
const B = 'solicitacoes_cadastro_material';

(async () => {
  await raiz.database().ref().set({
    usuarios: {
      pd: {role: 'pd'},
      pdmod: {role: 'qualidade', modulos: {pd: true}},
      pcp: {role: 'pcp'},
      prod: {role: 'production'},
      rot: {role: 'rotulagem'}
    },
    materiais: {mGLI: {mpCodigo: 'MPGR-00008', mpNome: 'GLICERINA BI DESTILADA', tipo: 'MPGR'}},
    materiais_chave: {'GLICERINA BI DESTILADA': 'mGLI'}
  });
  const pd = como('pd'), pdmod = como('pdmod'), pcp = como('pcp'), prod = como('prod'), rot = como('rot');
  let casos = 0;
  const ok = async (p) => { await p; casos += 1; };
  const nao = async (p) => { await negado(p); casos += 1; };

  // Duplicidade: o P&D lê o índice e o material para oferecer o vínculo.
  await ok(pd.ref('materiais_chave/GLICERINA BI DESTILADA').once('value').then((s) => assert.equal(s.val(), 'mGLI')));
  await ok(pd.ref('materiais/mGLI/mpCodigo').once('value').then((s) => assert.equal(s.val(), 'MPGR-00008')));
  // ...mas não reserva chave nem cria material (isso é do Cadastros).
  await nao(pd.ref('materiais_chave/MANTEIGA DE QUINOA').set('mX'));

  // Salvar o ingrediente: cria a solicitação inteira (papel pd).
  const reg = {status: 'PENDENTE_CADASTRO', amostra_em_desenvolvimento: true, marca: 'amostra em desenvolvimento',
    tipo: 'MPGR', nome: 'Manteiga de Quinoa', origem: {pdRequestId: 'R1', formulaId: 'F1', itemId: 'I1'},
    origens: {F1__I1: {pdRequestId: 'R1', ativa: true, registradaEm: 't1'}}, criadoEm: 't1'};
  await ok(pd.ref().update({[B + '/NOME__MANTEIGA_DE_QUINOA']: reg}));
  // Outra amostra (módulo P&D) soma a origem com caminho plano.
  await ok(pdmod.ref().update({[B + '/NOME__MANTEIGA_DE_QUINOA/origens/F2__I7']: {pdRequestId: 'R2', ativa: true, registradaEm: 't2'}}));
  // Cancelar (amostra descartada) e reabrir, sem apagar.
  await ok(pd.ref().update({
    [B + '/NOME__MANTEIGA_DE_QUINOA/origens/F1__I1/ativa']: false,
    [B + '/NOME__MANTEIGA_DE_QUINOA/origens/F2__I7/ativa']: false,
    [B + '/NOME__MANTEIGA_DE_QUINOA/status']: 'CANCELADO',
    [B + '/NOME__MANTEIGA_DE_QUINOA/motivoCancelamento']: 'Amostra descartada'
  }));
  await ok(pcp.ref().update({[B + '/NOME__MANTEIGA_DE_QUINOA/status']: 'PENDENTE_CADASTRO', [B + '/NOME__MANTEIGA_DE_QUINOA/reabertaEm']: 't3'}));
  const final = (await raiz.database().ref(B + '/NOME__MANTEIGA_DE_QUINOA').once('value')).val();
  assert.equal(final.status, 'PENDENTE_CADASTRO');
  assert.equal(final.nome, 'Manteiga de Quinoa');

  // Produção e rotulagem não mexem na fila.
  await nao(prod.ref().update({[B + '/NOME__MANTEIGA_DE_QUINOA/status']: 'CANCELADO'}));
  await nao(rot.ref(B + '/NOME__OUTRA').set(reg));

  console.log('run_fila_mp_nova_rules_test: ' + casos + ' casos OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
