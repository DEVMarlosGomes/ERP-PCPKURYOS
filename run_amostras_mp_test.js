'use strict';
/* Amostras de MP (11/11/2026): regras de status/permissão e serviço de functions/amostras_mp.js.
     node run_amostras_mp_test.js
   As regras do banco e o serviço com o banco real rodam no emulador: run_amostras_mp_emulator_test.js. */
const assert = require('assert/strict');
const A = require('./functions/amostras_mp.js');

let n = 0;
const ok = (m) => { n++; console.log('  ok  ' + m); };
const falha = (fn, code, re) => assert.throws(fn, (e) => e.code === code && (!re || re.test(e.message)), code + ' ' + re);
const T0 = '2026-11-11T12:00:00.000Z';

const usuarios = {
  pd: {nome: 'Paula P&D', role: 'pd'},
  // Perfil multi-função da produção: a função P&D precisa valer
  // mesmo sem depender de uma cópia materializada em `modulos.pd`.
  yasmim: {nome: 'Yasmim', role: 'comercial', funcoes: {comercial: true, pd: true, qualidade: true}, modulos: {amostras_mp: true, cadastros: true}},
  log: {nome: 'Lia Logística', role: 'logistica'},
  adm: {nome: 'Admin', role: 'admin'},
  pcp: {nome: 'Pedro PCP', role: 'pcp'},
  off: {nome: 'Desligado', role: 'pd', desativado: true},
};
const ator = (uid) => ({uid, nome: usuarios[uid].nome, usuario: usuarios[uid]});
const ctx = {
  codigo: 'AM-0001',
  materiais: {'MPGR-00127': {mpCodigo: 'MPGR-00127', mpNome: 'ALCOOL ETILICO 96°G/L'}, 'MPGR-00999_x': {mpCodigo: 'MPGR-00999.x', mpNome: 'CHAVE DIFERENTE'}, 'MPGR-00500': {mpCodigo: 'MPGR-00500', mpNome: 'VELHA', ativo: false}},
  fornecedores: {f1: {razaoSocial: 'Lunagreen Ltda', nomeFantasia: 'Lunagreen'}, f2: {razaoSocial: 'Aromas SA'}, f3: {razaoSocial: 'Parada Ltda', ativo: false}},
};
const nova = {tipo: 'NOVA', materialNovo: {nome: '  Pigmento Rosa X ', descricao: 'para batom'}, fornecedorKey: 'f1',
  custoKg: 120.5, custoAmostra: 0, quantidade: {valor: 200, unidade: 'g'}, motivo: 'DESENVOLVIMENTO',
  previsaoChegada: '2026-11-15', observacoes: ''};
const cadastrada = Object.assign({}, nova, {tipo: 'CADASTRADA', materialNovo: null, materialKey: 'MPGR-00127', motivo: 'HOMOLOGAR_FORNECEDOR', fornecedorKey: 'f2'});

// ── Criação
const c1 = A.aplicarAcao(null, 'CRIAR', ator('pd'), nova, T0, ctx);
assert.equal(c1.registro.status, 'SOLICITADA');
assert.equal(c1.registro.codigo, 'AM-0001');
assert.deepEqual(c1.registro.solicitante, {uid: 'pd', nome: 'Paula P&D', em: T0});
assert.equal(c1.registro.materialNovo.nome, 'Pigmento Rosa X');
assert.equal(c1.registro.material, undefined);
assert.deepEqual(c1.registro.fornecedor, {key: 'f1', nome: 'Lunagreen'});
assert.deepEqual(c1.registro.quantidade, {valor: 200, unidade: 'g'});
assert.deepEqual([c1.evento.acao, c1.evento.de, c1.evento.para, c1.evento.por.uid], ['CRIAR', null, 'SOLICITADA', 'pd']);
const c2 = A.aplicarAcao(null, 'CRIAR', ator('yasmim'), Object.assign({}, cadastrada, {material: {nome: 'NOME FALSO'}}), T0, ctx);
assert.deepEqual(c2.registro.material, {key: 'MPGR-00127', codigo: 'MPGR-00127', nome: 'ALCOOL ETILICO 96°G/L'}, 'chave, código e nome vêm do cadastro');
const c3 = A.aplicarAcao(null, 'CRIAR', ator('pd'), Object.assign({}, cadastrada, {materialKey: 'MPGR-00999_x'}), T0, ctx);
assert.deepEqual(c3.registro.material, {key: 'MPGR-00999_x', codigo: 'MPGR-00999.x', nome: 'CHAVE DIFERENTE'}, 'busca pela chave do banco, guarda o código do cadastro');
assert.deepEqual(c2.registro.fornecedor, {key: 'f2', nome: 'Aromas SA'});
assert.equal(c2.registro.materialNovo, undefined);
ok('criar: NOVA e CADASTRADA, nomes vindos do cadastro, P&D por papel, função ou módulo');

// ── Dados inválidos
const com = (extra) => Object.assign({}, nova, extra);
[
  com({tipo: 'OUTRO'}), com({motivo: 'X'}), com({quantidade: {valor: 10, unidade: 'L'}}), com({quantidade: {valor: 0, unidade: 'g'}}),
  com({custoKg: -1}), com({custoKg: ''}), com({previsaoChegada: '15/11/2026'}), com({materialNovo: {nome: '  '}}),
  Object.assign({}, cadastrada, {materialKey: 'MPGR-99999'}), Object.assign({}, cadastrada, {materialKey: 'MPGR-00500'}), com({previsaoChegada: '2026-02-31'}), com({previsaoChegada: '2026-11-10'}), com({fornecedorKey: 'nao-existe'}), com({fornecedorKey: ''}),
].forEach((d, i) => falha(() => A.aplicarAcao(null, 'CRIAR', ator('pd'), d, T0, ctx), 'invalid-argument', /./, 'caso ' + i));
ok('criar: recusa tipo, motivo, unidade, quantidade, custo, data, nome, material e fornecedor inválidos');

// ── Permissões
const solicitada = c1.registro;
const recebida = A.aplicarAcao(solicitada, 'RECEBER', ator('log'), {data: '2026-11-11', forma: 'MOTOBOY'}, T0, ctx).registro;
for (const uid of ['log', 'pcp']) {
  falha(() => A.aplicarAcao(null, 'CRIAR', ator(uid), nova, T0, ctx), 'permission-denied');
  falha(() => A.aplicarAcao(solicitada, 'EDITAR', ator(uid), nova, T0, ctx), 'permission-denied');
  falha(() => A.aplicarAcao(recebida, 'HOMOLOGAR', ator(uid), {parecer: 'ok'}, T0, ctx), 'permission-denied');
}
falha(() => A.aplicarAcao(solicitada, 'RECEBER', ator('pd'), {data: '2026-11-11', forma: 'CORREIO'}, T0, ctx), 'permission-denied', /logística/);
falha(() => A.aplicarAcao(null, 'CRIAR', ator('off'), nova, T0, ctx), 'permission-denied');
assert.equal(A.aplicarAcao(null, 'CRIAR', ator('adm'), nova, T0, ctx).registro.status, 'SOLICITADA');
assert.equal(A.aplicarAcao(solicitada, 'RECEBER', ator('adm'), {data: '2026-11-11', forma: 'CORREIO'}, T0, ctx).registro.status, 'RECEBIDA');
ok('permissões: só P&D cria/edita/homologa, só logística dá baixa, ADM tudo, desativado nada');

// ── Transições
falha(() => A.aplicarAcao(recebida, 'RECEBER', ator('log'), {data: '2026-11-11', forma: 'CORREIO'}, T0, ctx), 'failed-precondition', /já foi recebida/);
falha(() => A.aplicarAcao(recebida, 'EDITAR', ator('pd'), nova, T0, ctx), 'failed-precondition', /já foi recebida/);
falha(() => A.aplicarAcao(solicitada, 'HOMOLOGAR', ator('pd'), {}, T0, ctx), 'failed-precondition', /ainda não foi recebida/);
const homologada = A.aplicarAcao(recebida, 'HOMOLOGAR', ator('pd'), {}, T0, ctx).registro;
const cancelada = A.aplicarAcao(solicitada, 'CANCELAR', ator('pd'), {motivo: 'pedido em dobro'}, T0, ctx).registro;
for (const enc of [homologada, cancelada]) for (const acao of ['EDITAR', 'RECEBER', 'HOMOLOGAR', 'REPROVAR', 'CANCELAR']) {
  falha(() => A.aplicarAcao(enc, acao, ator('adm'), {parecer: 'x', motivo: 'x', data: '2026-11-11', forma: 'CORREIO'}, T0, ctx), 'failed-precondition', /encerrada/);
}
falha(() => A.aplicarAcao(solicitada, 'CRIAR', ator('pd'), nova, T0, ctx), 'failed-precondition');
ok('transições: recebida não recebe nem edita; homologar só recebida; encerrada não muda');

// ── Baixa, homologação, reprovação, cancelamento, edição
falha(() => A.aplicarAcao(solicitada, 'RECEBER', ator('log'), {data: '2026-11-11', forma: 'DRONE'}, T0, ctx), 'invalid-argument');
falha(() => A.aplicarAcao(solicitada, 'RECEBER', ator('log'), {data: '', forma: 'CORREIO'}, T0, ctx), 'invalid-argument');
assert.deepEqual(recebida.recebimento, {data: '2026-11-11', forma: 'MOTOBOY', por: {uid: 'log', nome: 'Lia Logística'}, em: T0});
assert.equal(recebida.fornecedor.key, 'f1', 'baixa não mexe no fornecedor');
falha(() => A.aplicarAcao(recebida, 'REPROVAR', ator('pd'), {parecer: '   '}, T0, ctx), 'invalid-argument', /parecer/i);
const reprovada = A.aplicarAcao(recebida, 'REPROVAR', ator('pd'), {parecer: 'Pigmento não deu cor'}, T0, ctx);
assert.equal(reprovada.registro.status, 'REPROVADA');
assert.deepEqual(reprovada.registro.parecer, {decisao: 'REPROVADA', texto: 'Pigmento não deu cor', por: {uid: 'pd', nome: 'Paula P&D'}, em: T0});
assert.equal(homologada.parecer.decisao, 'HOMOLOGADA');
falha(() => A.aplicarAcao(solicitada, 'CANCELAR', ator('pd'), {motivo: ''}, T0, ctx), 'invalid-argument', /motivo/i);
assert.deepEqual(cancelada.cancelamento, {motivo: 'pedido em dobro', por: {uid: 'pd', nome: 'Paula P&D'}, em: T0});
const ed = A.aplicarAcao(solicitada, 'EDITAR', ator('pd'), com({previsaoChegada: '2026-11-20', observacoes: 'urgente'}), T0, ctx);
assert.equal(ed.registro.previsaoChegada, '2026-11-20');
assert.equal(ed.registro.codigo, 'AM-0001', 'edição preserva código e solicitante');
assert.deepEqual(ed.evento.campos.sort(), ['observacoes', 'previsaoChegada']);
falha(() => A.aplicarAcao(solicitada, 'RECEBER', ator('log'), {data: '2026-11-12', forma: 'CORREIO'}, T0, ctx), 'invalid-argument', /futuro/);
falha(() => A.aplicarAcao(solicitada, 'RECEBER', ator('log'), {data: '2026-11-10', forma: 'CORREIO'}, T0, ctx), 'invalid-argument', /antes da solicitação/);
falha(() => A.aplicarAcao(solicitada, 'RECEBER', ator('log'), {data: '2026-02-31', forma: 'CORREIO'}, T0, ctx), 'invalid-argument');
const vencida = Object.assign({}, solicitada, {previsaoChegada: '2026-11-01'});
assert.equal(A.aplicarAcao(vencida, 'EDITAR', ator('pd'), com({previsaoChegada: '2026-11-01', observacoes: 'cobrar fornecedor'}), T0, ctx).registro.observacoes, 'cobrar fornecedor', 'editar sem mudar a previsão vencida é permitido');
falha(() => A.aplicarAcao(vencida, 'EDITAR', ator('pd'), com({previsaoChegada: '2026-11-05'}), T0, ctx), 'invalid-argument', /passado/);
ok('baixa com forma e data; reprovar exige parecer; cancelar exige motivo; editar lista o que mudou');
ok('datas possíveis: sem 31/02, previsão não nasce no passado, baixa nem no futuro nem antes da solicitação');

// ── Fornecedor inativo: só com Reativar
falha(() => A.aplicarAcao(null, 'CRIAR', ator('pd'), com({fornecedorKey: 'f3'}), T0, ctx), 'invalid-argument', /inativo/);
const re = A.aplicarAcao(null, 'CRIAR', ator('pd'), com({fornecedorKey: 'f3', reativarFornecedor: true}), T0, ctx);
assert.equal(re.reativarFornecedor, 'f3');
assert.equal(re.evento.fornecedorReativado, true);
assert.equal(A.aplicarAcao(null, 'CRIAR', ator('pd'), com({fornecedorKey: 'f1', reativarFornecedor: true}), T0, ctx).reativarFornecedor, null, 'ativo não precisa reativar');
ok('fornecedor inativo só com Reativar, registrado no evento');

// ── Serviço com banco em memória (mesma API do firebase-admin que o serviço usa)
function bancoFalso(inicial) {
  const raiz = JSON.parse(JSON.stringify(inicial));
  const partes = (p) => String(p || '').split('/').filter(Boolean);
  const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), raiz);
  const gravar = (p, v) => {
    const ks = partes(p); let o = raiz;
    ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
  };
  let seq = 0;
  const snap = (p) => { const v = ler(p); return {val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))), exists: () => v !== undefined && v !== null}; };
  const ref = (p) => ({
    key: partes(p).pop() || null,
    once: async () => snap(p),
    set: async (v) => gravar(p, v),
    update: async (obj) => Object.entries(obj).forEach(([k, v]) => gravar((p ? p + '/' : '') + k, v)),
    push: () => ref((p ? p + '/' : '') + '-k' + String(++seq).padStart(4, '0')),
    transaction: async (fn) => {
      const atual = snap(p).val();
      const r = fn(atual);
      if (r === undefined) return {committed: false, snapshot: snap(p)};
      gravar(p, r);
      return {committed: true, snapshot: snap(p)};
    },
  });
  return {ref, raiz};
}

(async () => {
  const db = bancoFalso({usuarios, materiais: ctx.materiais, fornecedores: ctx.fornecedores});
  const svc = A.criarServico({db: db, agora: () => T0});
  const r1 = await svc.executar('pd', {acao: 'CRIAR', requestId: 'r1', dados: nova});
  const r1b = await svc.executar('pd', {acao: 'CRIAR', requestId: 'r1', dados: nova});
  assert.deepEqual(r1b, r1, 'mesmo requestId: mesma amostra');
  assert.equal(r1.codigo, 'AM-0001');
  assert.equal(Object.keys(db.raiz.amostras_mp).length, 1);
  const r2 = await svc.executar('pd', {acao: 'CRIAR', requestId: 'r2', dados: cadastrada});
  assert.equal(r2.codigo, 'AM-0002');
  assert.equal(db.raiz.config.contadores.amostrasMp, 2);
  ok('serviço: criar é idempotente por requestId e numera AM-0001, AM-0002');

  await assert.rejects(svc.executar('pd', {acao: 'RECEBER', id: r1.id, requestId: 'r3', dados: {data: '2026-11-11', forma: 'CORREIO'}}), (e) => e.code === 'permission-denied');
  const rec = await svc.executar('log', {acao: 'RECEBER', id: r1.id, requestId: 'r4', dados: {data: '2026-11-11', forma: 'CORREIO'}});
  assert.equal(rec.status, 'RECEBIDA');
  await assert.rejects(svc.executar('log', {acao: 'RECEBER', id: r1.id, requestId: 'r5', dados: {data: '2026-11-11', forma: 'CORREIO'}}), (e) => e.code === 'failed-precondition');
  const again = await svc.executar('log', {acao: 'RECEBER', id: r1.id, requestId: 'r4', dados: {data: '2026-11-11', forma: 'CORREIO'}});
  assert.equal(again.status, 'RECEBIDA', 'repetir o mesmo pedido devolve o resultado, sem erro');
  await svc.executar('pd', {acao: 'HOMOLOGAR', id: r1.id, requestId: 'r6', dados: {parecer: 'ok'}});
  const hist = Object.values(db.raiz.amostras_mp[r1.id].historico);
  assert.deepEqual(hist.map((e) => e.acao), ['CRIAR', 'RECEBER', 'HOMOLOGAR']);
  assert.ok(hist.every((e) => e.por && e.por.uid && e.em === T0));
  await assert.rejects(svc.executar('pd', {acao: 'RECEBER', id: 'nao-existe', requestId: 'r7', dados: {}}), (e) => e.code === 'not-found' || e.code === 'permission-denied');
  await assert.rejects(svc.executar('log', {acao: 'RECEBER', id: 'nao-existe', requestId: 'r8', dados: {data: '2026-11-11', forma: 'CORREIO'}}), (e) => e.code === 'not-found');
  await assert.rejects(svc.executar('off', {acao: 'CRIAR', requestId: 'r9', dados: nova}), (e) => e.code === 'permission-denied');
  await assert.rejects(svc.executar('pd', {acao: 'CRIAR', requestId: '', dados: nova}), (e) => e.code === 'invalid-argument');
  assert.equal(db.raiz.config.contadores.amostrasMp, 2, 'pedido recusado não consome número');
  ok('serviço: baixa só da logística, segunda baixa recusada, histórico por ação, inexistente = not-found');

  const antes = Object.keys(db.raiz.amostras_mp).length;
  const corrida = await Promise.allSettled([svc.executar('pd', {acao: 'CRIAR', requestId: 'dup', dados: nova}), svc.executar('pd', {acao: 'CRIAR', requestId: 'dup', dados: nova})]);
  assert.equal(Object.keys(db.raiz.amostras_mp).length, antes + 1, 'duas chamadas iguais ao mesmo tempo: um registro só');
  assert.ok(corrida.every((x) => x.status === 'fulfilled' || x.reason.code === 'failed-precondition'), JSON.stringify(corrida.map((x) => x.reason && x.reason.message)));
  await assert.rejects(svc.executar('pd', {acao: 'CRIAR', requestId: 'r20', dados: com({custoKg: -5})}), (e) => e.code === 'invalid-argument');
  const r20 = await svc.executar('pd', {acao: 'CRIAR', requestId: 'r20', dados: nova});
  assert.equal(r20.status, 'SOLICITADA', 'pedido recusado não deixa a reserva presa');
  const r21 = await svc.executar('pd', {acao: 'CRIAR', requestId: 'r21', dados: com({fornecedorKey: 'f3', reativarFornecedor: true})});
  assert.equal(db.raiz.fornecedores.f3.ativo, true, 'fornecedor reativado');
  const hf = Object.values(db.raiz.historico_fornecedores.f3);
  assert.equal(hf.length, 1);
  assert.deepEqual([hf[0].campo, hf[0].valorAnterior, hf[0].valorNovo, hf[0].alteradoPorUid], ['ativo', false, true, 'pd']);
  assert.match(hf[0].justificativa, new RegExp(r21.codigo));
  ok('serviço: sem duplicar na corrida, reserva liberada ao recusar, reativação gravada no fornecedor e no histórico dele');

  console.log('run_amostras_mp_test: ' + n + ' grupos OK');
})().catch((e) => { console.error(e); process.exit(1); });
