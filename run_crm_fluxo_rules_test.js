'use strict';
/* Fluxo CRM -> CGI -> SKU -> pedido (14/10/2026), no emulador real:
   firebase emulators:exec --only database --config firebase.retrabalhos-test.json "node run_crm_fluxo_rules_test.js"
   O comercial (papel comercial ou módulo Comercial) só cria/atualiza registro
   que nasceu do funil do CRM:
   - produtos/{sku} novo com origemCrm.cgiContratoId (SKU da assinatura do CGI);
   - pedidos_comerciais/{PED} com origemCrm.projetoId (orçamento aprovado);
   - pedidos/{PED}__{sku} só de pedido de origem CRM (é o que a emissão de OP lê);
   - contadores de SKU e de pedido só para frente.
   Sem papel comercial, nada; produto/pedido do PCP continua com quem já editava. */
const assert = require('assert/strict');
const admin = require('./functions/node_modules/firebase-admin');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9023') throw new Error('Teste exige emulador local 9023.');
const URL = 'http://127.0.0.1:9023?ns=demo-crm-fluxo-default-rtdb';
const raiz = admin.initializeApp({projectId: 'demo-crm-fluxo', databaseURL: URL}, 'raiz');
const como = (uid) => admin.initializeApp({projectId: 'demo-crm-fluxo', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid).database();
const negado = (p) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i);

(async () => {
  await raiz.database().ref().set({
    usuarios: {
      adm: {role: 'admin'},
      gest: {role: 'gestor'},
      vend: {role: 'pcp', modulos: {comercial: true}},
      prod: {role: 'production'}
    },
    config: {contadores: {pedido_comercial: 41, sku: {PRF_MISS: 3}}},
    produtos: {'PRF-MISS-0001': {sku: 'PRF-MISS-0001', descricao: 'Produto PCP'}},
    pedidos_comerciais: {'PED-0001': {status: 'LIBERADO_PCP', cliente: 'MISS ROSE'}}
  });
  const gest = como('gest'), vend = como('vend'), prod = como('prod');

  // Contadores: comercial reserva o próximo número; voltar ou travar é negado.
  await gest.ref('config/contadores/pedido_comercial').set(42);
  await negado(gest.ref('config/contadores/pedido_comercial').set(10));
  await vend.ref('config/contadores/sku/PRF_LUMI').set(1);
  await negado(prod.ref('config/contadores/sku/PRF_LUMI').set(2));

  // Pedido do CRM: nasce AGUARDANDO_CGI com origem; pedido do PCP fica intocado.
  const origem = {projetoId: 'proj-1', propostaId: 'prop-1'};
  await gest.ref('pedidos_comerciais/PED-0042').set({status: 'AGUARDANDO_CGI', cliente: 'Lumi', origemCrm: origem});
  await negado(gest.ref('pedidos_comerciais/PED-0043').set({status: 'LIBERADO_PCP', cliente: 'Sem origem'}));
  await negado(gest.ref('pedidos_comerciais/PED-0001/status').set('CANCELADO'));
  await negado(gest.ref('pedidos_comerciais/PED-0042/origemCrm/projetoId').set('outro'));

  // Assinatura do CGI: SKU nova com origem; produto existente do PCP não é sobrescrito.
  const cgi = {cgiContratoId: 'cgi-1', cgiNumero: 'CGI-2026-0001', projetoId: 'proj-1'};
  await gest.ref('produtos/PRF-LUMI-0001').set({sku: 'PRF-LUMI-0001', descricao: 'Body Splash', origemCrm: cgi});
  await negado(gest.ref('produtos/PRF-MISS-0001').set({sku: 'PRF-MISS-0001', descricao: 'X', origemCrm: cgi}));
  await negado(gest.ref('produtos/PRF-MISS-0002').set({sku: 'PRF-MISS-0002', descricao: 'Sem origem'}));
  await gest.ref('produtos/PRF-LUMI-0001/origemCrm').set({...cgi, cgiContratoId: 'cgi-2'});
  await negado(gest.ref('produtos/PRF-LUMI-0001/descricao').set('Renomeado pelo comercial'));
  await negado(prod.ref('produtos/PRF-LUMI-0002').set({sku: 'PRF-LUMI-0002', origemCrm: cgi}));

  // Liberação ao PCP no mesmo update multi-caminho do comercial.html.
  await gest.ref().update({
    'pedidos_comerciais/PED-0042/status': 'LIBERADO_PCP',
    'pedidos/PED-0042__PRF-LUMI-0001': {id: 'PED-0042', sku: 'PRF-LUMI-0001', qtdTotal: 3000, produzido: 0, parentPedidoId: 'PED-0042'},
    'notificacoes_comercial/PED-0042': {tipo: 'PEDIDO_LIBERADO_PCP', status: 'PENDENTE', pedido: 'PED-0042'}
  });
  await negado(gest.ref('pedidos/PED-0001__PRF-MISS-0001').set({id: 'PED-0001', sku: 'PRF-MISS-0001', qtdTotal: 1, parentPedidoId: 'PED-0001'}));
  await negado(gest.ref('notificacoes_comercial/PED-0001').set({tipo: 'PEDIDO_LIBERADO_PCP'}));

  // v1 de Fórmula/BOM/Especificação da SKU nova: só criar, em rascunho, com origem do CGI.
  const v1 = {codProduto: 'PRF-LUMI-0001', versao: 'v1', status: 'RASCUNHO', itens: {}, origemCrm: {cgiContratoId: 'cgi-1'}};
  await gest.ref().update({'formulas/PRF-LUMI-0001__v1': v1, 'bom/PRF-LUMI-0001__v1': v1, 'especificacoes/PRF-LUMI-0001__v1': v1});
  await negado(gest.ref('formulas/PRF-LUMI-0001__v1/status').set('APROVADA'));
  await negado(gest.ref('formulas/PRF-LUMI-0001__v2').set({...v1, versao: 'v2', status: 'APROVADA'}));
  await negado(gest.ref('bom/PRF-MISS-0001__v1').set({codProduto: 'PRF-MISS-0001', versao: 'v1', status: 'RASCUNHO'}));
  await negado(prod.ref('especificacoes/PRF-LUMI-0002__v1').set({...v1, codProduto: 'PRF-LUMI-0002'}));

  // Índice público de usuários: cada um grava o próprio, com o papel verdadeiro; todos leem.
  await gest.ref('usuarios_publico/gest').set({nome: 'Gestora', role: 'gestor'});
  await negado(gest.ref('usuarios_publico/gest').set({nome: 'Gestora', role: 'admin'}));
  await negado(gest.ref('usuarios_publico/prod').set({nome: 'Outro', role: 'production'}));
  assert.equal((await prod.ref('usuarios_publico/gest/nome').once('value')).val(), 'Gestora');

  const final = (await raiz.database().ref().once('value')).val();
  assert.equal(final.pedidos_comerciais['PED-0042'].status, 'LIBERADO_PCP');
  assert.equal(final.pedidos_comerciais['PED-0001'].status, 'LIBERADO_PCP');
  assert.equal(final.produtos['PRF-MISS-0001'].descricao, 'Produto PCP');
  assert.equal(final.produtos['PRF-LUMI-0001'].origemCrm.cgiContratoId, 'cgi-2');
  assert.equal(final.config.contadores.pedido_comercial, 42);
  console.log('OK fluxo CRM: comercial só grava produto/pedido/contador de origem CRM; registros do PCP intactos.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
