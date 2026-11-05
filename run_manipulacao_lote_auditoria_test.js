'use strict';
/* Regressão da auditoria final (LM-15, 05/11/2026) da manipulação em lote, no emulador real:
     firebase emulators:exec --project demo-pd-lote --only database --config firebase.pdlote-test.json "node run_manipulacao_lote_auditoria_test.js"
   Cada cenário é um ataque que o auditor confirmou antes da correção; agora tem que ser RECUSADO
   (pela regra do banco ou pela callable do servidor):
   A matriz forjada na criação · B id do material crítico tirado no rascunho · C autor do motivo forjado
   (autoaprovação) · D célula fantasma · E membro apontando para a amostra aprovada de outro projeto ·
   G material trocado depois da aprovação · I evento em nome de outra pessoa na criação ·
   K (05/11) carimbo de quem alterou reaproveitado para se autoaprovar.
   E o que tinha que existir: F lote preso em gerando_ordem cancela depois de 2 min; H módulo
   aprovar_critico_pd atribuível pelo ADM. */
const assert = require('assert/strict');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9063') throw new Error('Teste exige emulador local 9063.');
process.env.GCLOUD_PROJECT = 'demo-pd-lote';
const URL = 'http://127.0.0.1:9063?ns=demo-pd-lote-default-rtdb';
process.env.FIREBASE_CONFIG = JSON.stringify({projectId: 'demo-pd-lote', databaseURL: URL});
const reqF = require('node:module').createRequire(require('node:path').resolve(__dirname, 'functions/package.json'));
const {initializeApp} = reqF('firebase-admin/app');
const {getDatabase} = reqF('firebase-admin/database');
const fns = require('./functions/index.js');
const M = require('./functions/manipulacao_lote_motor.js');
const Ident = require('./functions/identidade_acesso.js');
const raiz = getDatabase();
const como = (uid) => getDatabase(initializeApp({projectId: 'demo-pd-lote', databaseURL: URL, databaseAuthVariableOverride: {uid, token: {auth_time: 100}}}, uid));
const T = 'erp/kuryos';
const LC = `${T}/pd_manipulacao_lotes`;
const chamar = (uid, loteId, data) => fns.manipulacaoLoteServidor.run({auth: {uid}, data: Object.assign({tenant: 'kuryos', loteId}, data)});
const ler = async (p) => (await raiz.ref(p).get()).val();
const negado = (p) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i);
const recusado = (p, re) => assert.rejects(p, (e) => { assert.equal(e.code, 'failed-precondition', e.message); if (re) assert.match(e.message, re); return true; });
let n = 0;
const passo = (m) => { n++; console.log('  ok  ' + m); };

const itens = (F) => [
  {id: `${F}_a`, formula_id: F, ingredient_name: 'Agua', percentage: 99, phase: '', master_material_id: 'AGUA', price_per_kg: 1},
  {id: `${F}_b`, formula_id: F, ingredient_name: 'Fenoxietanol', percentage: 1, phase: '', master_material_id: 'FENOX', price_per_kg: 50},
];
const ING = {i01: {nome: 'Agua', master_material_id: 'AGUA', fase: ''}, i02: {nome: 'Fenoxietanol', master_material_id: 'FENOX', fase: ''}};
const MATRIZ = {i01: 99, i02: 1};
function erp() {
  const e = {crm_samples: {}, pd_requests: {}, pd_developments: {}, pd_formulas: {}, pd_formula_items: {}, pd_manipulacao_lotes: {}};
  const par = (tag, proj = 'P1', status = 'IN_PROGRESS') => {
    for (const s of ['a', 'b']) {
      const R = `R${tag}${s}`, D = `D${tag}${s}`, F = `F${tag}${s}`;
      e.pd_requests[R] = {id: R, status, internal_code: R};
      e.pd_developments[D] = {id: D, request_id: R};
      e.pd_formulas[F] = {id: F, development_id: D, version: 1};
      for (const it of itens(F)) e.pd_formula_items[it.id] = it;
    }
    e.crm_samples[`S${tag}`] = {id: `S${tag}`, projeto_id: proj, variacoes: [{id: `v${tag}a`, codigo: `C${tag}a`, pd_request_id: `R${tag}a`}, {id: `v${tag}b`, codigo: `C${tag}b`, pd_request_id: `R${tag}b`}]};
  };
  ['A', 'B', 'C', 'D', 'E', 'G', 'X', 'OK', 'J', 'K'].forEach((t) => par(t));
  par('Z', 'P2', 'APPROVED');
  return e;
}
const membro = (tag, s, over = {}) => Object.assign({request_id: `R${tag}${s}`, development_id: `D${tag}${s}`, sample_id: `S${tag}`, variacao_id: `v${tag}${s}`,
  codigo_amostra: `C${tag}${s}`, quantidade_g: 50, formula_id_antes: `F${tag}${s}`, versao_antes: 1, assinatura_antes: M.assinaturaItens(itens(`F${tag}${s}`)), status_membro: 'ativo'}, over);
const lote = (id, tag, por, over = {}) => Object.assign({id, tenant_id: 'kuryos', codigo: `LM-${id}`, projeto_id: 'P1', status: 'rascunho', revisao: 1, criado_por: por,
  matriz: {tipo: 'amostra', ref_id: `F${tag}a`, request_id: `R${tag}a`, versao: 1, celulas: {...MATRIZ}},
  membros: {[`R${tag}a`]: membro(tag, 'a'), [`R${tag}b`]: membro(tag, 'b')},
  ingredientes: JSON.parse(JSON.stringify(ING)), celulas: {[`R${tag}a`]: {...MATRIZ}, [`R${tag}b`]: {...MATRIZ}},
  perda_pct: 0, minimo_pesavel_g: 0.05, eventos: {e1: {tipo: 'criado', por, em: 'x'}}}, over);
const salvar = (db, id, rev, u) => db.ref().update(Object.assign({[`${LC}/${id}/revisao`]: rev, [`${LC}/${id}/atualizado_em`]: 'agora'}, u));

(async () => {
  await raiz.ref().set({
    usuarios: {pd: {role: 'pd', nome: 'PD', tenant_id: 'kuryos'}, adm: {role: 'admin', nome: 'ADM', tenant_id: 'kuryos'}},
    materiais: {FENOX: {mpNome: 'Fenoxietanol', criticoPd: true}, MIT: {mpNome: 'Metilisotiazolinona', criticoPd: true}, AGUA: {mpNome: 'Agua'}},
    config: {linhas: ['L1']},
    erp: {kuryos: erp()},
  });
  const pd = como('pd'), adm = como('adm');

  // Controle: o caminho legítimo continua funcionando (sem mudança de crítico, a ordem sai).
  await pd.ref(`${LC}/LOK`).set(lote('LOK', 'OK', 'pd'));
  assert.equal((await chamar('pd', 'LOK', {acao: 'gerar_ordem', revisao: 1})).ok, true);
  passo('controle: lote legítimo gera a ordem');

  // A — matriz forjada na criação.
  const forjada = {i01: 99.2, i02: 0.8};
  await pd.ref(`${LC}/LA`).set(lote('LA', 'A', 'pd', {matriz: {tipo: 'amostra', ref_id: 'FAa', versao: 1, celulas: forjada}, celulas: {RAa: {...forjada}, RAb: {...forjada}}}));
  await recusado(chamar('pd', 'LA', {acao: 'gerar_ordem', revisao: 1}), /matriz do lote não confere/);
  passo('A: matriz forjada na criação — o servidor recalcula a matriz da fórmula e recusa');

  // B — tirar o id do material crítico no rascunho.
  await pd.ref(`${LC}/LB`).set(lote('LB', 'B', 'pd'));
  await salvar(pd, 'LB', 2, {[`${LC}/LB/ingredientes/i02/master_material_id`]: null, [`${LC}/LB/ingredientes/i02/codigo`]: 'MP-FENOX',
    [`${LC}/LB/celulas/RBa`]: {i01: 99.5, i02: 0.5}, [`${LC}/LB/motivos/RBa`]: {i01: {texto: 'compensar', por: 'pd', valor: 99.5}, i02: {texto: 'menos conservante', por: 'pd', valor: 0.5, chave: 'FENOX|'}}});
  await recusado(chamar('pd', 'LB', {acao: 'gerar_ordem', revisao: 2}), /Fenoxietanol/);
  assert.equal(await ler(`${LC}/LB/status`), 'rascunho');
  passo('B: crítico sem o id do material — continua crítico (nome) e a matriz não confere; nada gerado');

  // C — autor do motivo forjado para se autoaprovar.
  await adm.ref(`${LC}/LC`).set(lote('LC', 'C', 'adm'));
  await negado(salvar(adm, 'LC', 2, {[`${LC}/LC/celulas/RCa`]: {i01: 99.5, i02: 0.5},
    [`${LC}/LC/motivos/RCa`]: {i01: {texto: 'compensar', por: 'pd', valor: 99.5}, i02: {texto: 'menos conservante', por: 'pd', valor: 0.5, chave: 'FENOX|'}}}));
  await salvar(adm, 'LC', 2, {[`${LC}/LC/celulas/RCa`]: {i01: 99.5, i02: 0.5},
    [`${LC}/LC/motivos/RCa`]: {i01: {texto: 'compensar', por: 'adm', valor: 99.5}, i02: {texto: 'menos conservante', por: 'adm', valor: 0.5, chave: 'FENOX|'}}});
  await recusado(chamar('adm', 'LC', {acao: 'aprovar_critico', requestId: 'RCa', ingKey: 'i02'}), /outra pessoa/);
  passo('C: o banco só aceita o motivo em nome de quem grava; o ADM não aprova a própria mudança');

  // K — 05/11/2026 (sem comentário): o carimbo "quem alterou" não se reaproveita. A química muda o conservante;
  //     o ADM troca o valor mantendo o carimbo dela (ou reescreve o carimbo no nome dela) para aprovar a própria mudança.
  await pd.ref(`${LC}/LK`).set(lote('LK', 'K', 'pd'));
  await salvar(pd, 'LK', 2, {[`${LC}/LK/celulas/RKa`]: {i01: 99.1, i02: 0.9}, [`${LC}/LK/motivos/RKa`]: {i02: {texto: '', por: 'pd', valor: 0.9, chave: 'FENOX|'}}});
  await negado(salvar(adm, 'LK', 3, {[`${LC}/LK/celulas/RKa`]: {i01: 99.5, i02: 0.5}, [`${LC}/LK/motivos/RKa/i02/valor`]: 0.5}));
  await negado(salvar(adm, 'LK', 3, {[`${LC}/LK/celulas/RKa`]: {i01: 99.5, i02: 0.5}, [`${LC}/LK/motivos/RKa`]: {i02: {texto: '', por: 'pd', valor: 0.5, chave: 'FENOX|'}}}));
  await salvar(adm, 'LK', 3, {[`${LC}/LK/celulas/RKa`]: {i01: 99.5, i02: 0.5}}); // muda só a célula: o carimbo fica do 0,9 da química
  await recusado(chamar('adm', 'LK', {acao: 'aprovar_critico', requestId: 'RKa', ingKey: 'i02'}), /valor atual/);
  passo('K: carimbo preso ao valor — o ADM não muda o crítico em nome da química nem aprova a própria mudança');

  // D — célula fantasma.
  await pd.ref(`${LC}/LD`).set(lote('LD', 'D', 'pd'));
  await salvar(pd, 'LD', 2, {[`${LC}/LD/celulas/RDa`]: {i01: 94, i02: 1, i99: 5}, [`${LC}/LD/motivos/RDa`]: {i01: {texto: 'teste de fantasma', por: 'pd', valor: 94}}});
  await recusado(chamar('pd', 'LD', {acao: 'gerar_ordem', revisao: 2}), /célula sem ingrediente/);
  passo('D: célula fora dos ingredientes não fecha 100 % e a ordem não sai');

  // E — membro apontando para o desenvolvimento da amostra aprovada de outro projeto.
  await pd.ref(`${LC}/LE`).set(lote('LE', 'E', 'pd', {membros: {REa: membro('E', 'a'),
    REb: membro('E', 'b', {development_id: 'DZa', formula_id_antes: 'FZa', assinatura_antes: M.assinaturaItens(itens('FZa')), sample_id: 'SZ', variacao_id: 'vZa'})}}));
  await recusado(chamar('pd', 'LE', {acao: 'gerar_ordem', revisao: 1}), /não é desta solicitação/);
  assert.equal(await ler(`${T}/pd_developments/DZa/current_version`), null);
  assert.equal(await ler(`${T}/crm_samples/SZ/variacoes/0/lote_manipulacao`), null);
  passo('E: membro com desenvolvimento/amostra de outra solicitação — recusado; a amostra aprovada não é tocada');

  // F — lote preso em gerando_ordem: cancela depois de 2 min (antes não cancela).
  await raiz.ref(`${LC}/LF`).set(Object.assign(lote('LF', 'X', 'pd'), {status: 'gerando_ordem', revisao: 2, gerando: {token: 't', por: 'pd', desde_ms: Date.now()}}));
  const cancelar = () => salvar(pd, 'LF', 3, {[`${LC}/LF/status`]: 'cancelado', [`${LC}/LF/cancelamento`]: {motivo: 'servidor caiu no meio', por: 'pd', em: 'x'}});
  await negado(cancelar());
  await raiz.ref(`${LC}/LF/gerando/desde_ms`).set(Date.now() - 3 * 60 * 1000);
  await cancelar();
  assert.equal(await ler(`${LC}/LF/status`), 'cancelado');
  passo('F: lote preso em gerando_ordem: não cancela enquanto o servidor trabalha; depois de 2 min cancela com motivo');

  // G — material trocado depois da aprovação.
  await pd.ref(`${LC}/LG`).set(lote('LG', 'G', 'pd'));
  await salvar(pd, 'LG', 2, {[`${LC}/LG/celulas/RGa`]: {i01: 99.5, i02: 0.5},
    [`${LC}/LG/motivos/RGa`]: {i01: {texto: 'compensar', por: 'pd', valor: 99.5}, i02: {texto: 'menos conservante', por: 'pd', valor: 0.5, chave: 'FENOX|'}}});
  await chamar('adm', 'LG', {acao: 'aprovar_critico', requestId: 'RGa', ingKey: 'i02'});
  await salvar(pd, 'LG', 4, {[`${LC}/LG/ingredientes/i02`]: {nome: 'Metilisotiazolinona', master_material_id: 'MIT', fase: ''}});
  await recusado(chamar('pd', 'LG', {acao: 'gerar_ordem', revisao: 4}), /Metilisotiazolinona|matriz do lote não confere|material mudou/);
  assert.equal(await ler(`${LC}/LG/status`), 'rascunho');
  passo('G: trocar o material depois da aprovação invalida a aprovação; a ordem não sai');

  // J — MP nova criada no próprio lote (a tela a registrou na fila com a origem do lote): a ordem sai e a
  //     versão entra na mesma solicitação.
  await raiz.ref('solicitacoes_cadastro_material/NOME__OLEO_DE_PRACAXI').set({status: 'PENDENTE_CADASTRO', nome: 'Óleo de Pracaxi',
    origens: {lote_LJ__i03: {pdRequestId: 'RJa', formulaId: 'lote_LJ', itemId: 'i03', ativa: true}}});
  await pd.ref(`${LC}/LJ`).set(lote('LJ', 'J', 'pd', {ingredientes: {...JSON.parse(JSON.stringify(ING)), i03: {nome: 'Óleo de Pracaxi', fase: '', mp_nova: {nome: 'Óleo de Pracaxi', tipo: 'MPGR'}}}}));
  await salvar(pd, 'LJ', 2, {[`${LC}/LJ/celulas/RJa`]: {i01: 98.5, i02: 1, i03: 0.5},
    [`${LC}/LJ/motivos/RJa`]: {i01: {texto: 'abre espaço para o ativo', por: 'pd', valor: 98.5}, i03: {texto: 'ativo novo do briefing', por: 'pd', valor: 0.5}}});
  await chamar('pd', 'LJ', {acao: 'gerar_ordem', revisao: 2});
  const lj = await ler(`${LC}/LJ`);
  const fidJ = lj.membros.RJa.formula_id_lote;
  assert.equal((await ler(`${T}/pd_formula_items/${fidJ}_i03`)).mp_nova.nome, 'Óleo de Pracaxi');
  assert.ok((await ler('solicitacoes_cadastro_material/NOME__OLEO_DE_PRACAXI/origens'))[`${fidJ}__${fidJ}_i03`]);
  passo('J: MP nova criada no lote — a ordem sai e a versão entra na mesma solicitação do Cadastros');

  // H — módulo atribuível.
  assert.equal(Ident.MODULOS_VALIDOS.has('aprovar_critico_pd'), true);
  passo('H: módulo aprovar_critico_pd é atribuível pelo ADM');

  // I — evento em nome de outra pessoa (e criador alheio) na criação.
  await negado(pd.ref(`${LC}/LI`).set(lote('LI', 'X', 'pd', {membros: {}, eventos: {e1: {tipo: 'ordem_gerada', por: 'adm', por_nome: 'ADM', em: 'x'}}})));
  await negado(pd.ref(`${LC}/LI2`).set(lote('LI2', 'X', 'adm', {eventos: {e1: {tipo: 'criado', por: 'pd', em: 'x'}}})));
  passo('I: na criação, evento e criador só em nome de quem grava');

  console.log(`run_manipulacao_lote_auditoria_test: OK (${n} passos)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
