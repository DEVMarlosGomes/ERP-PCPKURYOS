'use strict';
/* Comunicado de boas-vindas ao Kuryos ERP (13/11/2026): só o ADM; prévia com destinatários
   e provedor; um e-mail por pessoa (ninguém vê o endereço do outro); cada envio registrado
   por pessoa, e mandar de novo não duplica para quem já recebeu; falha de um não para os
   outros; dois envios ao mesmo tempo não acontecem. */
const assert = require('node:assert/strict');
const C = require('./functions/comunicados');

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const AGORA = '2026-11-13T12:00:00.000Z';

// Banco simulado com ref().once/set/update/transaction (o suficiente para o serviço).
function banco(dados) {
  const db = JSON.parse(JSON.stringify(dados));
  const partes = (p) => String(p).split('/').filter(Boolean);
  const ler = (p) => partes(p).reduce((x, k) => (x == null ? undefined : x[k]), db);
  const gravar = (p, v) => { const ks = partes(p); let x = db; ks.slice(0, -1).forEach((k) => { if (x[k] == null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; }); if (v == null) delete x[ks[ks.length - 1]]; else x[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v)); };
  return {
    dados: db,
    ref(p) {
      return {
        once: async () => ({val: () => { const v = ler(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }}),
        set: async (v) => gravar(p, v),
        update: async (o) => Object.entries(o).forEach(([k, v]) => gravar(p + '/' + k, v)),
        transaction: async (fn) => { const atual = ler(p); const novo = fn(atual === undefined ? null : JSON.parse(JSON.stringify(atual))); if (novo === undefined) return {committed: false}; gravar(p, novo); return {committed: true}; },
      };
    },
  };
}
const usuarios = {
  adm: {role: 'admin', nome: 'Gustavo', email: 'gustavo@kuryos.com.br'},
  a1: {role: 'pcp', nome: 'Ana Souza', email: 'ana@kuryos.com.br'},
  a2: {role: 'producao', nome: 'Bruno', email: ' BRUNO@kuryos.com.br '},
  dup: {role: 'pcp', nome: 'Bruno (duplicado)', email: 'bruno@kuryos.com.br'},
  sem: {role: 'pcp', nome: 'Carla'},
  ruim: {role: 'pcp', nome: 'Davi', email: 'davi@'},
  ina: {role: 'pcp', nome: 'Eva', email: 'eva@kuryos.com.br', desativado: true},
  pen: {role: 'pending', nome: 'Fábio', email: 'fabio@kuryos.com.br'},
  tv: {role: 'tv', nome: 'TV Fábrica', email: 'tv@kuryos.com.br'}
};

(async () => {
  // ── Modelo do e-mail ──
  const m = C.montarBoasVindas({nome: 'Ana Souza', email: 'ana@kuryos.com.br'}, 'https://kuryoserp.com.br/');
  ok(/Boas-vindas ao Kuryos ERP/.test(m.assunto), 'assunto');
  ok(/Ana/.test(m.corpo) && /kuryoserp\.com\.br/.test(m.corpo) && /ana@kuryos\.com\.br/.test(m.corpo), 'nome, endereço do sistema e login da pessoa no corpo');
  ok(!/undefined|null/.test(m.corpo), 'sem campo vazio no texto');
  ok(/&lt;b&gt;/.test(C.montarBoasVindas({nome: '<b>x</b>', email: 'x@y.com'}).corpo), 'nome escapado (sem HTML injetado)');

  // ── Destinatários ──
  const d = C.destinatarios(usuarios);
  eq(d.para.map((x) => x.email), ['ana@kuryos.com.br', 'bruno@kuryos.com.br', 'gustavo@kuryos.com.br'], 'ativos com e-mail válido, sem repetir endereço');
  eq(d.semEmail.sort(), ['Carla', 'Davi'], 'quem ficou sem e-mail aparece');
  ok(!d.para.some((x) => /eva|fabio|tv@/.test(x.email)), 'inativo, pendente e TV ficam de fora');

  // ── Prévia e permissão ──
  const enviados = [];
  let falharPara = null;
  const db = banco({usuarios, comunicados: {}});
  const svc = C.criarServico({db, agora: () => AGORA, provedor: () => 'RESEND', pausaMs: 0,
    enviarEmail: async (para, assunto, corpo) => { if (para[0] === falharPara) throw new Error('caixa cheia'); enviados.push({para, assunto}); return true; }});
  await assert.rejects(svc.executar('a1', {acao: 'PREVIA'}), /administrador/); n++;
  let r = await svc.executar('adm', {acao: 'PREVIA'});
  eq([r.provedor, r.total, r.pendentes, r.semEmail.length], ['RESEND', 3, 3, 2], 'prévia: provedor, total e quem falta');
  ok(/Boas-vindas/.test(r.assunto) && r.amostra && /Gustavo/.test(r.amostra), 'prévia traz o texto (amostra com o nome de quem vê)');
  eq(enviados.length, 0, 'prévia não envia');

  // ── Envio: um e-mail por pessoa; falha de um não para os outros ──
  falharPara = 'bruno@kuryos.com.br';
  r = await svc.executar('adm', {acao: 'ENVIAR'});
  eq([r.enviados, r.erros, r.jaEnviados], [2, 1, 0]);
  eq(enviados.map((e) => e.para), [['ana@kuryos.com.br'], ['gustavo@kuryos.com.br']], 'um destinatário por e-mail');
  const env = db.dados.comunicados[C.ID_BOAS_VINDAS].envios;
  eq([env.a1.status, env.a2.status, env.adm.status], ['ENVIADO', 'ERRO', 'ENVIADO'], 'resultado por pessoa');
  ok(/caixa cheia/.test(env.a2.erro), 'motivo do erro registrado');
  eq(db.dados.comunicados[C.ID_BOAS_VINDAS].ultimoEnvio.por, 'Gustavo', 'quem disparou');

  // ── Mandar de novo: só quem falhou ──
  falharPara = null; enviados.length = 0;
  r = await svc.executar('adm', {acao: 'ENVIAR'});
  eq([r.enviados, r.erros, r.jaEnviados], [1, 0, 2], 'reenviar não duplica');
  eq(enviados.map((e) => e.para[0]), ['bruno@kuryos.com.br']);
  r = await svc.executar('adm', {acao: 'PREVIA'});
  eq(r.pendentes, 0, 'todos receberam');

  // ── Dois envios ao mesmo tempo ──
  const db2 = banco({usuarios, comunicados: {[C.ID_BOAS_VINDAS]: {emAndamento: {desde: AGORA, por: 'Outro'}}}});
  const svc2 = C.criarServico({db: db2, agora: () => AGORA, provedor: () => 'GRAPH', pausaMs: 0, enviarEmail: async () => true});
  await assert.rejects(svc2.executar('adm', {acao: 'ENVIAR'}), /andamento/); n++;
  const db3 = banco({usuarios, comunicados: {[C.ID_BOAS_VINDAS]: {emAndamento: {desde: '2026-11-13T11:00:00.000Z', por: 'Outro'}}}});
  const svc3 = C.criarServico({db: db3, agora: () => AGORA, provedor: () => 'GRAPH', pausaMs: 0, enviarEmail: async () => true});
  r = await svc3.executar('adm', {acao: 'ENVIAR'});
  eq(r.enviados, 3, 'trava esquecida há mais de 15 minutos não bloqueia');
  ok(!db3.dados.comunicados[C.ID_BOAS_VINDAS].emAndamento, 'trava liberada ao terminar');
  await assert.rejects(svc.executar('adm', {acao: 'APAGAR'}), /Ação/); n++;
  // Excluir do envio (ex.: conta de teste) e aviso de domínio incomum.
  const u4 = Object.assign({}, usuarios, {tst: {role: 'pcp', nome: 'Teste', email: 'guilherme@nexus.com'}, kb: {role: 'pcp', nome: 'Admin', email: 'admin@kuryos.com'}});
  const db4 = banco({usuarios: u4, comunicados: {}}), env4 = [];
  const svc4 = C.criarServico({db: db4, agora: () => AGORA, provedor: () => 'RESEND', pausaMs: 0, enviarEmail: async (para) => { env4.push(para[0]); return true; }});
  const pv = await svc4.executar('adm', {acao: 'PREVIA'});
  eq(pv.destinatarios.filter((x) => x.alerta).map((x) => x.email).sort(), ['admin@kuryos.com', 'guilherme@nexus.com'], 'domínio incomum vem com aviso');
  r = await svc4.executar('adm', {acao: 'ENVIAR', excluir: ['tst', 'kb']});
  eq([r.enviados, r.excluidos], [3, 2], 'excluídos não recebem');
  ok(env4.indexOf('guilherme@nexus.com') < 0 && !db4.dados.comunicados[C.ID_BOAS_VINDAS].envios.tst, 'nada registrado para quem foi excluído');
  eq((await svc4.executar('adm', {acao: 'PREVIA'})).pendentes, 2, 'excluídos continuam pendentes (podem ser enviados depois)');
  // Ligação: servidor e tela (o CLAUDE.md manda testar a ligação, não só a unidade).
  const fs = require('node:fs'), idx = fs.readFileSync('functions/index.js', 'utf8'), tela = fs.readFileSync('public/usuarios.html', 'utf8');
  ok(idx.includes('require("./comunicados")') && idx.includes('exports.comunicadoSistema = onCall('), 'callable comunicadoSistema ligada');
  ok(/servicoComunicados = Comunicados\.criarServico\(\{[\s\S]{0,200}enviarEmailSistema\(/.test(idx), 'usa o mesmo envio das cobranças (Resend ou Outlook)');
  ok(tela.includes("httpsCallable('comunicadoSistema')") && /p\.role === 'admin'[\s\S]{0,300}cardComunicado/.test(tela), 'tela de Usuários: cartão só para o ADM');
  console.log('comunicado de boas-vindas: ' + n + ' verificações OK');
})().catch((e) => { console.error(e); process.exit(1); });
