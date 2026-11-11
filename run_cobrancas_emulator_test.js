'use strict';
/* Cobranças internas (11/11/2026): serviço real (functions/cobrancas.js) e regras
   do banco no emulador, com e-mail falso.
     firebase emulators:exec --project demo-cobrancas --only database --config firebase.cobrancas-test.json "node run_cobrancas_emulator_test.js"
   - criar grava cobrança + caixa dos participantes num update só e manda e-mail;
   - e-mail que falha não desfaz a cobrança e pode ser reenviado (uma vez);
   - duas pessoas concluindo ao mesmo tempo: só uma vence (transação no nó);
   - só quem participa (e o ADM) lê a cobrança; ninguém grava pelo navegador;
   - cada um lê só a própria caixa e só marca como lida. */
const assert = require('assert/strict');
const path = require('path');
const reqFn = require('module').createRequire(path.resolve(__dirname, 'functions', 'x.js'));
const {initializeApp} = reqFn('firebase-admin/app');
const {getDatabase} = reqFn('firebase-admin/database');
const Cobrancas = require('./functions/cobrancas.js');
const PORTA = process.env.COBRANCAS_PORTA || '9076';
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:' + PORTA) throw new Error('Teste exige emulador local ' + PORTA + '.');
const URL = `http://127.0.0.1:${PORTA}?ns=demo-cobrancas-default-rtdb`;
const raiz = initializeApp({projectId: 'demo-cobrancas', databaseURL: URL}, 'raiz');
const apps = {};
const como = (uid) => getDatabase(apps[uid] || (apps[uid] = initializeApp({projectId: 'demo-cobrancas', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid)));
const negado = (p, msg) => assert.rejects(p, /permission[ _]denied/i, msg);
const recusa = (p, code) => assert.rejects(p, (e) => e.code === code);
let n = 0;
const passo = (m) => { n++; console.log('  ok  ' + m); };

(async () => {
  const db = getDatabase(raiz);
  await db.ref().set({
    usuarios: {
      ana: {nome: 'Ana PCP', role: 'pcp', email: 'ana@kuryos.com.br'},
      bia: {nome: 'Bia Qualidade', role: 'qualidade', email: 'bia@kuryos.com.br'},
      caio: {nome: 'Caio Produção', role: 'production'},
      adm: {nome: 'Admin', role: 'admin', email: 'adm@kuryos.com.br'},
      zz: {nome: 'Zeca', role: 'logistica', email: 'zz@kuryos.com.br'},
      off: {nome: 'Desligado', role: 'pcp', desativado: true},
    },
  });
  let relogio = Date.parse('2026-11-11T12:00:00.000Z');
  const enviados = [];
  let quebrarEmail = false;
  const servico = Cobrancas.criarServico({
    db,
    agora: () => new Date(relogio).toISOString(),
    enviarEmail: async (para, assunto) => { if (quebrarEmail) throw new Error('Graph fora do ar'); enviados.push({para, assunto}); },
  });

  // 1. Criar: documento + caixa num update só + e-mail aos cobrados com e-mail.
  const r = await servico.executar('ana', {acao: 'CRIAR', titulo: 'Enviar laudo do lote 2611-04', para: ['bia', 'caio'], prazo: '2026-11-14'});
  const id = r.id;
  const doc = (await db.ref('cobrancas/' + id).get()).val();
  assert.equal(doc.status, 'ABERTA');
  assert.equal(Object.keys(doc.eventos).length, 1);
  assert.equal(r.email.status, 'ENVIADO');
  assert.deepEqual(r.email.para, ['bia@kuryos.com.br']);
  assert.deepEqual(r.email.semEmail, ['Caio Produção']);
  assert.deepEqual(enviados[0].para, ['bia@kuryos.com.br']);
  const cxBia = (await db.ref('cobrancas_caixa/bia/' + id).get()).val();
  assert.equal(cxBia.aguardaVoce, true);
  assert.equal(cxBia.naoLida, true);
  assert.equal((await db.ref('cobrancas_caixa/ana/' + id + '/papel').get()).val(), 'enviada');
  assert.equal((await db.ref('cobrancas_caixa/zz').get()).exists(), false);
  await recusa(servico.executar('off', {acao: 'CRIAR', titulo: 'X qualquer', para: ['bia']}), 'permission-denied');
  passo('criar grava documento, caixas e e-mail (sem e-mail no perfil fica listado); inativo não cria');

  // 2. Resposta do cobrado: vira RESPONDIDA, espera quem cobrou, e-mail a ele.
  const r2 = await servico.executar('bia', {acao: 'RESPONDER', id, texto: 'Sai amanhã cedo'});
  assert.equal(r2.status, 'RESPONDIDA');
  assert.deepEqual(r2.email.para, ['ana@kuryos.com.br']);
  assert.equal((await db.ref('cobrancas_caixa/ana/' + id + '/aguardaVoce').get()).val(), true);
  assert.equal((await db.ref('cobrancas_caixa/bia/' + id + '/aguardaVoce').get()).val(), false);
  assert.equal(Object.keys((await db.ref('cobrancas/' + id + '/eventos').get()).val()).length, 2);
  await recusa(servico.executar('zz', {acao: 'RESPONDER', id, texto: 'oi'}), 'permission-denied');
  await recusa(servico.executar('ana', {acao: 'RESPONDER', id: 'naoexiste', texto: 'oi'}), 'not-found');
  passo('resposta muda a situação, avisa quem cobrou e acrescenta ao histórico; estranho e inexistente recusados');

  // 3. E-mail falha: a ação vale, status ERRO; reenviar manda uma vez só.
  relogio += 31 * 60000;
  quebrarEmail = true;
  const r3 = await servico.executar('ana', {acao: 'COBRAR_NOVAMENTE', id, texto: 'Preciso hoje'});
  assert.equal(r3.status, 'ABERTA');
  assert.equal(r3.email.status, 'ERRO');
  const emails = (await db.ref('cobrancas/' + id + '/emails').get()).val();
  const idErro = Object.keys(emails).find((k) => emails[k].status === 'ERRO');
  assert.ok(idErro, 'aviso com erro registrado');
  quebrarEmail = false;
  await recusa(servico.executar('zz', {acao: 'REENVIAR_EMAIL', id, eventoId: idErro}), 'permission-denied');
  const r3b = await servico.executar('ana', {acao: 'REENVIAR_EMAIL', id, eventoId: idErro});
  assert.equal(r3b.email.status, 'ENVIADO');
  assert.deepEqual(r3b.email.para, ['bia@kuryos.com.br']);
  await recusa(servico.executar('ana', {acao: 'REENVIAR_EMAIL', id, eventoId: idErro}), 'failed-precondition');
  await recusa(servico.executar('ana', {acao: 'COBRAR_NOVAMENTE', id}), 'failed-precondition');
  passo('e-mail que falha não desfaz a cobrança; reenviar funciona uma vez; intervalo entre cobranças respeitado');

  // 4. Concorrência: dois concluindo juntos -- só um vence.
  const corrida = await Promise.allSettled([
    servico.executar('bia', {acao: 'CONCLUIR', id}),
    servico.executar('caio', {acao: 'CONCLUIR', id}),
  ]);
  assert.equal(corrida.filter((x) => x.status === 'fulfilled').length, 1, 'só uma conclusão');
  assert.equal(corrida.find((x) => x.status === 'rejected').reason.code, 'failed-precondition');
  const fim = (await db.ref('cobrancas/' + id).get()).val();
  assert.equal(fim.status, 'CONCLUIDA');
  assert.equal(Object.values(fim.eventos).filter((e) => e.tipo === 'CONCLUIDA').length, 1);
  const reab = await servico.executar('ana', {acao: 'REABRIR', id, texto: 'Faltou a assinatura'});
  assert.equal(reab.status, 'ABERTA');
  assert.equal((await db.ref('cobrancas/' + id + '/concluidaPor').get()).exists(), false);
  passo('conclusão simultânea: uma vence, a outra é recusada; reabrir limpa a conclusão');

  // 5. Regras: leitura só de quem participa e do ADM; ninguém grava pelo navegador.
  for (const uid of ['ana', 'bia', 'caio', 'adm']) await como(uid).ref('cobrancas/' + id).get();
  await negado(como('zz').ref('cobrancas/' + id).get(), 'estranho não lê');
  await negado(como('off').ref('cobrancas/' + id).get(), 'desativado não lê');
  await negado(como('ana').ref('cobrancas').get(), 'ninguém lista todas');
  await negado(como('ana').ref('cobrancas/' + id + '/status').set('CONCLUIDA'), 'autor não grava direto');
  await negado(como('adm').ref('cobrancas/novo').set({titulo: 'x'}), 'ADM não grava direto');
  await negado(como('bia').ref('cobrancas/' + id + '/eventos/x').set({tipo: 'RESPOSTA'}), 'cobrado não grava evento direto');
  passo('cobrança: lê quem participa e o ADM; estranho, desativado e lista inteira negados; nenhuma escrita do navegador');

  // 6. Caixa: só a própria; só marca como lida.
  await como('bia').ref('cobrancas_caixa/bia').get();
  await negado(como('bia').ref('cobrancas_caixa/ana').get(), 'caixa alheia');
  await negado(como('adm').ref('cobrancas_caixa/bia').get(), 'nem o ADM lê a caixa alheia');
  await como('bia').ref('cobrancas_caixa/bia/' + id + '/naoLida').set(false);
  assert.equal((await db.ref('cobrancas_caixa/bia/' + id + '/naoLida').get()).val(), false);
  await negado(como('bia').ref('cobrancas_caixa/bia/' + id + '/naoLida').set(true), 'não remarca como não lida');
  await negado(como('bia').ref('cobrancas_caixa/bia/' + id + '/aguardaVoce').set(false), 'não zera o contador');
  await negado(como('bia').ref('cobrancas_caixa/bia/' + id).remove(), 'não apaga o item');
  await negado(como('bia').ref('cobrancas_caixa/bia/inventado/naoLida').set(false), 'não cria item');
  await negado(como('bia').ref('cobrancas_caixa/ana/' + id + '/naoLida').set(false), 'não mexe na caixa alheia');
  passo('caixa: só a própria; o dono só marca como lida o que já existe');

  console.log('OK run_cobrancas_emulator_test: ' + n + ' passos.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
