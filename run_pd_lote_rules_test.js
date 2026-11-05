'use strict';
/* Regras da manipulação em lote (spec 2026-11-04 §8) no emulador real:
     firebase emulators:exec --project demo-pd-lote --only database --config firebase.pdlote-test.json "node run_pd_lote_rules_test.js"
   (--project igual ao projectId daqui; sem isso o emulador não aplica database.rules.json.) */
const assert = require('assert/strict');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9063') throw new Error('Teste exige emulador local 9063.');
const reqFunctions = require('node:module').createRequire(require('node:path').resolve(__dirname, 'functions/package.json'));
const {initializeApp, getApps, deleteApp} = reqFunctions('firebase-admin/app');
const {getDatabase} = reqFunctions('firebase-admin/database');
const URL = 'http://127.0.0.1:9063?ns=demo-pd-lote-default-rtdb';
const raiz = getDatabase(initializeApp({projectId: 'demo-pd-lote', databaseURL: URL}, 'raiz'));
const como = (uid) => getDatabase(initializeApp({projectId: 'demo-pd-lote', databaseURL: URL, databaseAuthVariableOverride: {uid, token: {auth_time: 100}}}, uid));
const negado = (p) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i);
const T = 'erp/kuryos/pd_manipulacao_lotes';
let n = 0;
const passo = (m) => { n++; console.log('  ok  ' + m); };

const novo = (id, extra = {}, por = 'pd') => Object.assign({
  id, tenant_id: 'kuryos', codigo: 'LM-2026-031-1', projeto_id: 'P1', status: 'rascunho', revisao: 1, criado_por: por,
  matriz: {tipo: 'amostra', ref_id: 'F2', celulas: {i01: 80, i02: 20}},
  membros: {R1: {request_id: 'R1', status_membro: 'ativo', quantidade_g: 50}, R2: {request_id: 'R2', status_membro: 'ativo', quantidade_g: 50}},
  ingredientes: {i01: {nome: 'Água'}, i02: {nome: 'Fragrância'}}, celulas: {R1: {i01: 80, i02: 20}, R2: {i01: 80, i02: 20}},
  eventos: {e1: {tipo: 'criado', por, em: 'x'}},
}, extra);
const salvar = (db, id, rev, extra = {}) => db.ref().update(Object.assign({[`${T}/${id}/revisao`]: rev, [`${T}/${id}/atualizado_em`]: 'agora'}, extra));

(async () => {
  await raiz.ref().set({
    usuarios: {
      pd: {role: 'pd', tenant_id: 'kuryos'}, pd2: {role: 'formulador', tenant_id: 'kuryos'}, mod: {role: 'comercial', tenant_id: 'kuryos', modulos: {pd: true}},
      adm: {role: 'admin', tenant_id: 'kuryos'}, pcp: {role: 'pcp', tenant_id: 'kuryos'}, prod: {role: 'production', tenant_id: 'kuryos'},
      com: {role: 'comercial', tenant_id: 'kuryos'}, outro: {role: 'pd', tenant_id: 'outra'}, off: {role: 'pd', tenant_id: 'kuryos', desativado: true},
    },
    materiais: {FENOX: {mpNome: 'Fenoxietanol', chaveDuplicidade: 'fenoxietanol', criticoPd: true}, AGUA: {mpNome: 'Água', chaveDuplicidade: 'agua'}},
    materiais_chave: {fenoxietanol: 'FENOX', agua: 'AGUA'},
    config: {linhas: ['Linha 1']}, // como em produção: config/ nunca fica vazio (o .validate do pai roda)
  });
  const pd = como('pd'), pd2 = como('pd2'), mod = como('mod'), adm = como('adm'), pcp = como('pcp'), prod = como('prod'), com = como('com'), outro = como('outro'), off = como('off');

  // Criação.
  await pd.ref(`${T}/L1`).set(novo('L1'));
  await mod.ref(`${T}/L2`).set(novo('L2', {}, 'mod'));
  await negado(pd.ref(`${T}/L6`).set(novo('L6', {}, 'adm'))); // criador e autor do evento: sempre quem grava
  for (const db of [pcp, prod, com, outro, off]) await negado(db.ref(`${T}/LX`).set(novo('LX')));
  await negado(pd.ref(`${T}/L3`).set(novo('L3', {status: 'ordem_gerada'})));
  await negado(pd.ref(`${T}/L3`).set(novo('L3', {revisao: 2})));
  for (const c of ['ordem', 'pesagens', 'manipulacao', 'aprovacoes_criticas', 'cancelamento', 'gerando']) await negado(pd.ref(`${T}/L3`).set(novo('L3', {[c]: {x: 1}})));
  await negado(pd.ref(`${T}/L3`).set(novo('L4')));
  await negado(pd.ref(`${T}/L1`).set(novo('L1')));
  passo('cria só P&D/ADM/módulo pd do tenant, como rascunho revisão 1, sem campos do servidor; regravar o lote inteiro não');

  // Revisão: duas químicas na mesma revisão.
  await salvar(pd, 'L1', 2, {[`${T}/L1/celulas/R1/i01`]: 79, [`${T}/L1/celulas/R1/i02`]: 21});
  await negado(salvar(pd2, 'L1', 2, {[`${T}/L1/celulas/R2/i01`]: 70}));
  await negado(pd.ref(`${T}/L1/celulas/R1/i01`).set(10));
  await negado(salvar(pd, 'L1', 4, {[`${T}/L1/celulas/R1/i01`]: 10}));
  assert.equal((await raiz.ref(`${T}/L1/celulas/R2/i01`).get()).val(), 80);
  passo('segunda gravação na mesma revisão é recusada inteira; célula sem subir a revisão (ou pulando) também');
  await salvar(pd2, 'L1', 3, {[`${T}/L1/celulas/R2/i01`]: 79.5, [`${T}/L1/membros/R2/quantidade_g`]: 40, [`${T}/L1/eventos/e2`]: {tipo: 'salvo', por: 'pd2', em: 'x'}});
  await negado(salvar(pd2, 'L1', 4, {[`${T}/L1/eventos/e3`]: {tipo: 'salvo', por: 'pd', em: 'x'}}));
  await negado(salvar(pd2, 'L1', 4, {[`${T}/L1/atualizado_por`]: 'pd'}));
  passo('outra química salva na revisão seguinte; evento e atualizado_por só com o próprio uid');

  // Apagar: lote, evento, membro.
  await negado(pd.ref(`${T}/L1`).remove());
  await negado(adm.ref(`${T}/L1`).remove());
  await negado(pd.ref(`${T}/L1/eventos/e1`).remove());
  await negado(salvar(pd, 'L1', 4, {[`${T}/L1/eventos/e1`]: null}));
  await negado(salvar(pd, 'L1', 4, {[`${T}/L1/membros/R2`]: null}));
  await negado(pd.ref(`${T}/L1/eventos`).remove());
  passo('lote, evento e membro nunca são apagados (nem pelo ADM, nem subindo a revisão)');

  // Campos do servidor.
  for (const c of ['ordem', 'pesagens', 'manipulacao', 'aprovacoes_criticas', 'gerando', 'matriz', 'codigo', 'projeto_id']) {
    await negado(salvar(pd, 'L1', 4, {[`${T}/L1/${c}`]: {x: 1}}));
    await negado(salvar(adm, 'L1', 4, {[`${T}/L1/${c}/y`]: 1}));
  }
  await negado(salvar(pd, 'L1', 4, {[`${T}/L1/status`]: 'ordem_gerada'}));
  await negado(salvar(pd, 'L1', 4, {[`${T}/L1/status`]: 'manipulado'}));
  passo('ordem, pesagens, manipulação, aprovações, matriz, código e projeto: só o servidor; status só para cancelado');

  // Papéis sem P&D não editam.
  for (const db of [pcp, prod, com, outro, off]) await negado(salvar(db, 'L1', 4, {[`${T}/L1/celulas/R1/i01`]: 1}));
  passo('PCP, produção, comercial, outro tenant e perfil desativado não editam');

  // Depois da ordem (o servidor muda o status).
  await raiz.ref(`${T}/L1`).update({status: 'ordem_gerada', revisao: 5, 'membros/R1/formula_id_lote': 'FV1', 'membros/R2/formula_id_lote': 'FV2', ordem: {gerada_em: 'x'}});
  await negado(salvar(pd, 'L1', 6, {[`${T}/L1/celulas/R1/i01`]: 1}));
  await negado(salvar(pd, 'L1', 6, {[`${T}/L1/perda_pct`]: 2}));
  await negado(salvar(pd, 'L1', 6, {[`${T}/L1/membros/R1/quantidade_g`]: 1}));
  const remover = (motivo, extra = {}) => salvar(pd, 'L1', 6, Object.assign({[`${T}/L1/membros/R2/status_membro`]: 'removido', [`${T}/L1/membros/R2/removido_motivo`]: motivo,
    [`${T}/L1/membros/R2/removido_por`]: 'pd', [`${T}/L1/membros/R2/removido_em`]: 'agora'}, extra));
  await negado(remover('curto'));
  await negado(remover('Cliente desistiu desta variação', {[`${T}/L1/membros/R2/formula_id_lote`]: 'FORJADA'}));
  await negado(salvar(pd, 'L1', 6, {[`${T}/L1/membros/R2/status_membro`]: 'removido', [`${T}/L1/membros/R2/removido_motivo`]: 'Cliente desistiu', [`${T}/L1/membros/R2/removido_por`]: 'adm'}));
  await remover('Cliente desistiu desta variação');
  await negado(salvar(pd, 'L1', 7, {[`${T}/L1/membros/R2/removido_motivo`]: 'Outro motivo qualquer longo'}));
  await negado(salvar(pd, 'L1', 7, {[`${T}/L1/membros/R2/status_membro`]: 'ativo'}));
  passo('com a ordem: célula, excesso e quantidade travados; membro só sai com motivo ≥ 10, uma vez, sem mexer na versão');

  // Cancelamento.
  const cancelar = (db, id, rev, motivo, por) => salvar(db, id, rev, {[`${T}/${id}/status`]: 'cancelado', [`${T}/${id}/cancelamento`]: {motivo, por, em: 'agora'}});
  await negado(cancelar(pd, 'L1', 7, 'curto', 'pd'));
  await negado(salvar(pd, 'L1', 7, {[`${T}/L1/status`]: 'cancelado'}));
  await negado(cancelar(pd, 'L1', 7, 'Erro grave na montagem', 'adm'));
  await cancelar(pd, 'L1', 7, 'Erro grave na montagem', 'pd');
  await negado(salvar(pd, 'L1', 8, {[`${T}/L1/cancelamento/motivo`]: 'Outro motivo depois'}));
  await negado(salvar(pd, 'L1', 8, {[`${T}/L1/status`]: 'rascunho'}));
  await cancelar(mod, 'L2', 2, 'engano', 'mod');
  await raiz.ref(`${T}/L5`).set(Object.assign(novo('L5'), {status: 'manipulado', revisao: 9}));
  await negado(cancelar(pd, 'L5', 10, 'Não deveria cancelar o manipulado', 'pd'));
  await salvar(pd, 'L5', 10, {[`${T}/L5/eventos/oc1`]: {tipo: 'ocorrencia', por: 'pd', em: 'x', detalhe: 'Frasco trincou'}});
  passo('cancelar exige motivo (≥ 10 depois da ordem, ≥ 5 no rascunho), uma vez; manipulado não cancela, mas recebe ocorrência');

  // criticoPd e conferência: só o ADM.
  await negado(pcp.ref('materiais/AGUA/criticoPd').set(true));
  await negado(pcp.ref('materiais/FENOX/criticoPd').remove());
  await negado(pcp.ref('materiais/FENOX').update({mpNome: 'Fenoxietanol 99', criticoPd: null}));
  await negado(pcp.ref('materiais/FENOX').set({mpNome: 'Fenoxietanol', chaveDuplicidade: 'fenoxietanol'}));
  await pcp.ref('materiais/FENOX').set({mpNome: 'Fenoxietanol', chaveDuplicidade: 'fenoxietanol', criticoPd: true});
  await adm.ref('materiais/AGUA/criticoPd').set(true);
  await adm.ref('materiais/AGUA/criticoPd').remove();
  passo('criticoPd: só o ADM marca ou desmarca; regravar o material mantendo a marca segue livre');
  await negado(pcp.ref('config/pdLote/conferenciaSegundoUsuario').set(false));
  await adm.ref('config/pdLote/conferenciaSegundoUsuario').set(false);
  await negado(pcp.ref('config/pdLote/conferenciaSegundoUsuario').remove());
  await negado(pcp.ref('config/pdLote/conferenciaSegundoUsuario').set(true));
  await adm.ref('config/pdLote/conferenciaSegundoUsuario').remove();
  await pcp.ref('config/linhas').set(['Linha 1', 'Linha 2']); // o resto de config/ segue como antes
  passo('conferência por segundo usuário: só o ADM desliga ou religa');

  console.log(`run_pd_lote_rules_test: OK (${n} passos)`);
  await Promise.all(getApps().map(deleteApp));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
