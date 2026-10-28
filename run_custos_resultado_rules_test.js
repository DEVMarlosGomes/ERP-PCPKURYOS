'use strict';
/* Regras de Custos e Resultado (26/10/2026) no emulador real:
   firebase emulators:exec --project demo-custos --only database --config firebase.retrabalhos-test.json "node run_custos_resultado_rules_test.js"
   (--project demo-<nome> igual ao projectId daqui, senão o emulador não aplica as regras e o teste
   de negação "passa" sem testar nada -- CLAUDE.md.)
   - custos/ (R$ e LP): só a diretoria = ADM ou módulo Custos lê e grava; PCP, TV e o próprio
     usuário não; ninguém grava razão, fichas ou taxas pela tela (só o servidor);
   - resultado/placar: todos leem os totais, ninguém grava; tabela de pontos e fechamento
     (com o bônus em R$) só a diretoria lê;
   - programa do dia: PCP e diretoria; horas entre 0 e 24;
   - portões: reclamação só a diretoria; acidente também o RH; mês fechado não recebe portão. */
const assert = require('assert/strict');
const admin = require('./functions/node_modules/firebase-admin');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9023') throw new Error('Teste exige emulador local 9023.');
const URL = 'http://127.0.0.1:9023?ns=demo-custos-default-rtdb';
const raiz = admin.initializeApp({projectId: 'demo-custos', databaseURL: URL}, 'raiz').database();
const como = (uid) => admin.initializeApp({projectId: 'demo-custos', databaseURL: URL, databaseAuthVariableOverride: {uid}}, uid).database();
const negado = (p, msg) => assert.rejects(p, /PERMISSION_DENIED|permission_denied/i, msg);
let n = 0;
const ok = async (p) => { await p; n++; };
const nega = async (p, msg) => { await negado(p, msg); n++; };

(async () => {
  await raiz.ref().set({
    usuarios: {
      adm: {role: 'admin'}, dir: {role: 'pcp', modulos: {custos: true}}, pcp: {role: 'pcp'},
      rh: {role: 'rh'}, tv: {role: 'tv'}, prod: {role: 'production', modulos: {planejamento: true}}
    },
    custos: {parametros: {fatorPontos: 25}, razao: {'2026-10': {x: {tipo: 'ENTRADA_MATERIAL', valorTotal: 10}}}, fichas: {'2026-10': {BS: {lp: 1}}}},
    resultado: {placar: {dias: {'2026-10-05': {pontos: 10, meta: 9}}}, tabelas: {'2026-10': {porSku: {BS: {pontos: 30}}}},
      fechamentos: {'2026-09': {fechadoEm: '2026-10-01', bonus: 1000}}}
  });
  const adm = como('adm'), dir = como('dir'), pcp = como('pcp'), rh = como('rh'), tv = como('tv'), prod = como('prod');

  // ── custos/: só diretoria ──
  await ok(adm.ref('custos/parametros').once('value'));
  await ok(dir.ref('custos/fichas').once('value'));
  await nega(pcp.ref('custos').once('value'), 'PCP não lê custos');
  await nega(tv.ref('custos/fichas').once('value'), 'TV não lê LP');
  await nega(rh.ref('custos/parametros').once('value'), 'RH não lê custos');
  await ok(dir.ref('custos/parametros/impostosPct').set(12));
  await nega(dir.ref('custos/parametros/impostosPct').set(150), 'imposto acima de 100%');
  await nega(dir.ref('custos/parametros/fatorPontos').set(0), 'fator zero');
  await nega(pcp.ref('custos/parametros/fatorPontos').set(30), 'PCP não mexe no fator');
  await ok(dir.ref('custos/operacao/2026-10').set({folhaProducao: 55500}));
  await nega(dir.ref('custos/operacao/outubro').set({folhaProducao: 1}), 'competência fora do formato');
  await ok(dir.ref('custos/depara_pd/AGUA').set({materialCodigo: 'MPGR-00132'}));
  await ok(adm.ref('custos/material_cliente/BS/frasco').set(true));
  await nega(adm.ref('custos/razao/2026-10/x').set({valorTotal: 0}), 'razão: nem o ADM edita (append-only, só o servidor)');
  await nega(adm.ref('custos/razao/2026-10/novo').set({valorTotal: 1}), 'razão: nem lança pela tela');
  await nega(dir.ref('custos/fichas/2026-10/BS').set({lp: 99}), 'ficha congelada: só o servidor');
  await nega(adm.ref('custos/taxas/2026-10').set({}), 'taxa: só o servidor');
  await nega(pcp.ref('usuarios/pcp/modulos/custos').set(true), 'ninguém se dá o módulo Custos');

  // ── resultado/: placar aberto, tabela e fechamento fechados ──
  await ok(tv.ref('resultado/placar').once('value'));
  await ok(prod.ref('resultado/placar/dias').once('value'));
  await nega(adm.ref('resultado/placar/dias/2026-10-05/pontos').set(999), 'placar: só o servidor grava');
  await nega(tv.ref('resultado/tabelas').once('value'), 'tabela de pontos por SKU: só a diretoria');
  await ok(dir.ref('resultado/tabelas').once('value'));
  await nega(adm.ref('resultado/tabelas/2026-11').set({porSku: {}}), 'tabela: só o servidor congela');
  await nega(tv.ref('resultado/fechamentos').once('value'), 'fechamento leva bônus em R$');
  await nega(pcp.ref('resultado/fechamentos').once('value'), 'idem PCP');
  await ok(dir.ref('resultado/fechamentos').once('value'));

  // ── programa do dia ──
  await ok(pcp.ref('resultado/programa/2026-10-27').set({'Linha 1': 4, 'Linha 2': 9}));
  await ok(prod.ref('resultado/programa/2026-10-28/Linha 3').set(6));
  await nega(pcp.ref('resultado/programa/2026-10-27/Linha 1').set(30), 'mais de 24 h');
  await nega(pcp.ref('resultado/programa/27-10/Linha 1').set(3), 'dia fora do formato');
  await nega(tv.ref('resultado/programa/2026-10-27/Linha 1').set(3), 'TV não programa');

  // ── portões ──
  await ok(dir.ref('resultado/portoes/2026-10/r1').set({tipo: 'RECLAMACAO', data: '2026-10-14', descricao: 'lote com vazamento'}));
  await ok(rh.ref('resultado/portoes/2026-10/a1').set({tipo: 'ACIDENTE', data: '2026-10-15'}));
  await nega(rh.ref('resultado/portoes/2026-10/r2').set({tipo: 'RECLAMACAO', data: '2026-10-15'}), 'RH não registra reclamação');
  await nega(rh.ref('resultado/portoes/2026-10/r1').remove(), 'RH não apaga reclamação');
  await ok(rh.ref('resultado/portoes/2026-10/a1').remove());
  await nega(dir.ref('resultado/portoes/2026-10/x').set({tipo: 'OUTRO', data: '2026-10-15'}), 'tipo desconhecido');
  await nega(dir.ref('resultado/portoes/2026-10/y').set({tipo: 'ACIDENTE', data: '2026-11-02'}), 'data fora da competência');
  await nega(dir.ref('resultado/portoes/2026-09/z').set({tipo: 'ACIDENTE', data: '2026-09-10'}), 'mês fechado não recebe portão');
  await nega(pcp.ref('resultado/portoes/2026-10/w').set({tipo: 'ACIDENTE', data: '2026-10-15'}), 'PCP não registra portão');
  await nega(tv.ref('resultado/portoes').once('value'), 'TV não lê portões');

  console.log(`OK regras de custos/resultado: ${n} verificações no emulador`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
