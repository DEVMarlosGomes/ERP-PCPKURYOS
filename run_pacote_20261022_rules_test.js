'use strict';
/* Regras do pacote 22/10/2026 no emulador real (INF-04, AMO-03, COM-02, CAD-01) e as duas
   que estavam pendentes de publicar (pendencias_setor de 17/10, usuarios/$uid de 20/10):
   firebase emulators:exec --project demo-pacote --only database --config firebase.retrabalhos-test.json "node run_pacote_20261022_rules_test.js"
   - "Em Testes"/"Aguardando Aprovação" só com liberação do servidor (vencida não vale);
     status que não muda e os demais status passam; cliente não grava liberação;
   - aprovação do cliente com data no futuro é recusada;
   - material novo só nasce reservando a chave tipo+nome; chave com dono não troca de dono;
     material existente edita como antes;
   - quem cria a própria conta nasce pendente (não vira admin); pendências de setor gravam. */
const assert = require('assert/strict');
const admin = require('./functions/node_modules/firebase-admin');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9023') throw new Error('Teste exige emulador local 9023.');
const URL = 'http://127.0.0.1:9023?ns=demo-pacote-default-rtdb';
const raiz = admin.initializeApp({projectId: 'demo-pacote', databaseURL: URL}, 'raiz').database();
const como = (uid) => admin.initializeApp({projectId: 'demo-pacote', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid).database();
const negado = (p, msg) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i, msg);

(async () => {
  await raiz.ref().set({
    usuarios: {
      pd: {role: 'pd', tenant_id: 'kuryos'},
      adm: {role: 'admin'},
      cad: {role: 'pcp'},
      emit: {role: 'production', modulos: {emitir_op: true}}
    },
    erp: {kuryos: {
      pd_requests: {R1: {id: 'R1', status: 'IN_PROGRESS', title: 'Body Splash'}, R2: {id: 'R2', status: 'WAITING_APPROVAL', title: 'Colônia'}},
      crm_samples: {S1: {id: 'S1', variacoes: [{id: 'V1', status: 'enviada'}]}},
      crm_propostas: {P1: {id: 'P1', status: 'enviado'}}
    }},
    materiais: {'MPGR-00008': {mpCodigo: 'MPGR-00008', mpNome: 'GLICERINA', tipo: 'MPGR'}},
    materiais_chave: {'MPGR|GLICERINA': 'MPGR-00008'}
  });
  const pd = como('pd'), adm = como('adm'), cad = como('cad'), emit = como('emit'), novo = como('novo');
  const T = 'erp/kuryos';

  // ── Status do P&D: só com liberação do servidor ──
  await negado(pd.ref(T + '/pd_requests/R1/status').set('IN_TESTS'), 'sem liberação não vai para Em Testes');
  await negado(adm.ref(T + '/pd_requests/R1/status').set('IN_TESTS'), 'nem o ADM pela tela');
  await negado(pd.ref(T + '/pd_liberacoes_status/R1').set({status: 'IN_TESTS', ate: Date.now() + 60000}), 'cliente não grava liberação');
  await raiz.ref(T + '/pd_liberacoes_status/R1').set({status: 'IN_TESTS', ate: Date.now() + 60000, por: 'pd'});
  // O adaptador grava o documento inteiro (set): com liberação, passa.
  await pd.ref(T + '/pd_requests/R1').set({id: 'R1', status: 'IN_TESTS', title: 'Body Splash', updated_at: 'x'});
  await negado(pd.ref(T + '/pd_requests/R1/status').set('WAITING_APPROVAL'), 'liberação de Em Testes não serve para Aguardando');
  // Liberação vencida não vale.
  await raiz.ref(T + '/pd_liberacoes_status/R1').set({status: 'WAITING_APPROVAL', ate: Date.now() - 1000});
  await negado(pd.ref(T + '/pd_requests/R1/status').set('WAITING_APPROVAL'), 'liberação vencida');
  // Status que não muda (regravar o documento) e os demais status passam.
  await pd.ref(T + '/pd_requests/R2').set({id: 'R2', status: 'WAITING_APPROVAL', title: 'Colônia', obs: 'regravado'});
  await pd.ref(T + '/pd_requests/R1/status').set('IN_PROGRESS');
  await pd.ref(T + '/pd_requests/R2/status').set('APPROVED');
  await pd.ref(T + '/pd_requests/R3').set({id: 'R3', status: 'OPEN'});

  // ── Aprovação do cliente nunca no futuro ──
  const reg = (ms) => ({quem_nome: 'Maria', canal: 'whatsapp', aprovado_em: new Date(ms).toISOString(), aprovado_em_ms: ms});
  await negado(pd.ref(T + '/crm_samples/S1/variacoes/0/aprovacao_cliente').set(reg(Date.now() + 3600e3)), 'amostra: futuro');
  await pd.ref(T + '/crm_samples/S1/variacoes/0/aprovacao_cliente').set(reg(Date.now() - 3600e3));
  await negado(pd.ref(T + '/crm_propostas/P1/negociacao_aprovacao_cliente').set(reg(Date.now() + 3600e3)), 'orçamento: futuro');
  await pd.ref(T + '/crm_propostas/P1/negociacao_aprovacao_cliente').set(reg(Date.now() + 30000)); // folga de 2 min
  // Regravar a amostra inteira com a aprovação antiga continua valendo.
  const s1 = (await raiz.ref(T + '/crm_samples/S1').get()).val();
  await pd.ref(T + '/crm_samples/S1').set({...s1, atualizado: true});

  // ── Material: chave tipo+nome ──
  await negado(cad.ref('materiais/MPGR-00200').set({mpCodigo: 'MPGR-00200', mpNome: 'UREIA', tipo: 'MPGR'}), 'novo sem chave');
  await cad.ref().update({
    'materiais/MPGR-00200': {mpCodigo: 'MPGR-00200', mpNome: 'UREIA', tipo: 'MPGR', chaveDuplicidade: 'MPGR|UREIA'},
    'materiais_chave/MPGR|UREIA': 'MPGR-00200'
  });
  await negado(cad.ref().update({
    'materiais/MPGR-00201': {mpCodigo: 'MPGR-00201', mpNome: 'GLICERINA', tipo: 'MPGR', chaveDuplicidade: 'MPGR|GLICERINA'},
    'materiais_chave/MPGR|GLICERINA': 'MPGR-00201'
  }), 'segundo material com o mesmo tipo e nome');
  await negado(cad.ref().update({
    'materiais/MPGR-00202': {mpCodigo: 'MPGR-00202', mpNome: 'GLICERINA', tipo: 'MPGR', chaveDuplicidade: 'MPGR|GLICERINA'}
  }), 'apontar para chave de outro');
  // Existente (sem chave) edita como antes; renomear troca a chave no mesmo update.
  await cad.ref('materiais/MPGR-00008').set({mpCodigo: 'MPGR-00008', mpNome: 'GLICERINA', tipo: 'MPGR', obs: 'editado'});
  await cad.ref().update({
    'materiais/MPGR-00200': {mpCodigo: 'MPGR-00200', mpNome: 'UREIA 99', tipo: 'MPGR', chaveDuplicidade: 'MPGR|UREIA 99'},
    'materiais_chave/MPGR|UREIA': null, 'materiais_chave/MPGR|UREIA 99': 'MPGR-00200'
  });
  await negado(emit.ref('materiais_chave/X|Y').set('Z'), 'quem não cuida do cadastro não mexe no índice');

  // ── Pendentes de 17/10 e 20/10 ──
  await emit.ref('pendencias_setor/PRF-1__volume').set({setor: 'cadastros', campo: 'volume', status: 'ABERTA'});
  await novo.ref('usuarios/novo').set({role: 'pending', email: 'novo@x.com'});
  await negado(novo.ref('usuarios/novo').set({role: 'admin', email: 'novo@x.com'}), 'quem cria a própria conta não vira admin');
  await adm.ref('usuarios/novo/role').set('pd');

  // ── KO-04 (23/10): catálogo de componentes do Kickoff, só o ADM grava ──
  const estojo = {codigo: 'ESTOJO', nome: 'Estojo', nivel_embalagem: 'secundaria', atributos: [{chave: 'material', nome: 'Material', tipo: 'texto'}]};
  await negado(cad.ref('config/tipos_componente/ESTOJO').set(estojo), 'PCP grava config/, mas não o catálogo');
  await adm.ref('config/tipos_componente/ESTOJO').set(estojo);
  await negado(adm.ref('config/tipos_componente/X').set({nome: 'x'}), 'tipo sem nível');
  await cad.ref('config/outra_chave').set(1); // o resto de config/ segue como antes

  // ── COM-05 (23/10): o Comercial numera a SC que a cotação do CRM abre; produção não ──
  await raiz.ref('usuarios/com').set({role: 'vendedor', modulos: {comercial: true}});
  await raiz.ref('config/contadores/solicitacaoCompra').set(41);
  const comercial = como('com');
  await comercial.ref('config/contadores/solicitacaoCompra').transaction((n) => (n || 0) + 1);
  assert.equal((await raiz.ref('config/contadores/solicitacaoCompra').get()).val(), 42);
  await negado(comercial.ref('config/contadores/solicitacaoCompra').set(10), 'contador não volta');
  await negado(emit.ref('config/contadores/solicitacaoCompra').set(43), 'produção não numera SC');

  // ── COM-07 (23/10): SKU nasce com o orçamento aprovado; índice uma vez só ──
  await raiz.ref('usuarios/com/tenant_id').set('kuryos');
  await raiz.ref(T + '/crm_propostas').set({ORC1: {negociacao_status: 'aprovado'}, ORC2: {negociacao_status: 'rascunho'}});
  const sku = (orc, cod) => ({sku: cod, descricao: 'Body Splash', origemCrm: {orcamentoId: orc, origem_contratual_status: 'aguardando_cgi'}});
  await negado(comercial.ref('produtos/PRF-X-0002').set(sku('ORC2', 'PRF-X-0002')), 'orçamento não aprovado não gera SKU');
  await negado(comercial.ref('produtos/PRF-X-0003').set({sku: 'PRF-X-0003', origemCrm: {}}), 'SKU do CRM sem origem');
  await comercial.ref().update({'produtos/PRF-X-0001': sku('ORC1', 'PRF-X-0001'), [T + '/sku_por_orcamento/ORC1__V1']: 'PRF-X-0001'});
  await negado(comercial.ref(T + '/sku_por_orcamento/ORC1__V1').set('PRF-X-0009'), 'índice não troca de SKU');
  await negado(comercial.ref('produtos/PRF-X-0001/descricao').set('outra'), 'SKU criada não é editada pelo Comercial');
  await comercial.ref('produtos/PRF-X-0001/origemCrm').set({orcamentoId: 'ORC1', origem_contratual_status: 'cgi_assinado', cgiContratoId: 'C1'});

  console.log('run_pacote_20261022_rules_test: OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
