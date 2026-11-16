'use strict';
/* Registro retrospectivo de retrabalho (16/11/2026) — PROMPT_RNC_RETRABALHO_26302_01.md.
     node run_registro_retrabalho_test.js
   - motor puro: perfil, balanço (o caso real fecha só com as 45 un. declaradas), etapas, ações;
   - RTDB some com vazios: registro sem perdas/materiais/evidências continua legível;
   - serviço real (functions/registro_retrabalho.js) sobre um banco falso com a base REAL do caso
     (run_registro_retrabalho_fixture.json, leitura de produção de 16/11, sem nomes);
   - NÃO INTERFERÊNCIA: conciliação do PED-0001, motor de consistência e todos os nós operacionais
     ficam idênticos antes e depois do fluxo completo; o serviço só grava em registros_retrabalho*. */
const assert = require('assert/strict');
const fs = require('fs');
const T = require('./public/shared/registro-retrabalho.js');
const S = require('./functions/registro_retrabalho.js');
const Conciliacao = require('./public/shared/conciliacao-pedidos.js');
const Consistencia = require('./public/shared/consistencia-producao.js');
const FIX = JSON.parse(fs.readFileSync('run_registro_retrabalho_fixture.json', 'utf8'));
let n = 0;
const ok = (m) => { n++; console.log('  ok  ' + m); };
const clonar = (v) => JSON.parse(JSON.stringify(v));

// Banco falso que poda vazios como o RTDB e registra todo caminho gravado.
function podar(v) {
  if (v == null || typeof v !== 'object') return v;
  const o = Array.isArray(v) ? v.map(podar).filter((x) => x != null) : {};
  if (!Array.isArray(v)) Object.keys(v).forEach((k) => { const x = podar(v[k]); if (x != null && !(typeof x === 'object' && !Object.keys(x).length)) o[k] = x; });
  return (typeof o === 'object' && !Object.keys(o).length) ? null : o;
}
function bancoFalso(inicial) {
  const raiz = clonar(inicial || {});
  const gravados = [];
  const partes = (p) => String(p || '').split('/').filter(Boolean);
  const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), raiz);
  const gravar = (p, v) => {
    gravados.push(partes(p).join('/'));
    const ks = partes(p); let o = raiz;
    ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    const pv = podar(clonar(v));
    if (pv == null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = pv;
  };
  let seq = 0;
  const snap = (p) => { const v = ler(p); return {val: () => (v === undefined ? null : clonar(v)), exists: () => v != null}; };
  const ref = (p) => ({
    key: partes(p).pop() || null,
    once: async () => snap(p), set: async (v) => gravar(p, v),
    update: async (obj) => Object.entries(obj).forEach(([k, v]) => gravar((p ? p + '/' : '') + k, v)),
    push: () => ref((p ? p + '/' : '') + '-h' + String(++seq).padStart(5, '0')),
    // Como o SDK: primeira passada com o cache (null), depois com o valor do servidor.
    transaction: async (fn) => {
      let r = fn(null);
      const atual = snap(p).val();
      if (atual != null || r === undefined) r = fn(atual);
      if (r !== undefined && !(r === null && atual != null)) gravar(p, r);
      return {committed: r !== undefined, snapshot: snap(p)};
    },
  });
  return {ref, raiz, gravados};
}

const USUARIOS = {
  rob: {nome: 'Qualidade Q', role: 'qualidade', funcoes: {qualidade: true}},
  yas: {nome: 'Multi', role: 'comercial', funcoes: {comercial: true, qualidade: true}},
  mod: {nome: 'Com módulo', role: 'production', modulos: {qualidade: true}},
  adm: {nome: 'ADM', role: 'admin'},
  pcp: {nome: 'PCP', role: 'pcp'},
  log: {nome: 'Logística', role: 'logistica'},
  prod: {nome: 'Produção', role: 'production'},
  pend: {nome: 'Pendente', role: 'pending'},
  off: {nome: 'Desligada', role: 'qualidade', desativado: true},
};
const DADOS_CRIAR = {rncNumero: 'RNC-2026-011', opKeyOrigem: '26302-01', qtdOrigem: 3470,
  destinos: [{opKey: '26302-01', qtd: 1460}, {opKey: '26264-14', qtd: 1965}],
  rncsRelacionadas: ['RNC-PA-26264-14'], ocorridaEm: '2026-10-30', descricao: 'Granel do Sunrise Muse envasado como Rose Absolut.'};
const etapaCheia = (ent, sai, per) => ({recurso: 'Linha 1', inicio: '2026-11-10T08:00', fim: '2026-11-11T17:00', responsaveis: 'Equipe de produção',
  procedimento: 'Segregação por análise sensorial.', qtdEntrada: ent, qtdSaida: sai, qtdPerda: per,
  materiais: [{codigo: 'EP-00182', nome: 'Válvula', consumido: 2010, recuperado: 0, descartado: 2010}]});

(async () => {
  // 0. Cópia do motor no servidor é idêntica.
  assert.equal(fs.readFileSync('functions/registro_retrabalho_motor.js', 'utf8'), fs.readFileSync('public/shared/registro-retrabalho.js', 'utf8'),
    'functions/registro_retrabalho_motor.js tem de ser cópia byte a byte de public/shared/registro-retrabalho.js');
  ok('motor do servidor é cópia byte a byte do motor do navegador');

  // 1. Perfil: Qualidade por role, funções ou módulo; PCP/Logística só leem.
  const p = (u) => T.perfil(USUARIOS[u]);
  ['rob', 'yas', 'mod', 'adm'].forEach((u) => assert.equal(p(u).edita, true, u + ' edita'));
  ['pcp', 'log'].forEach((u) => { assert.equal(p(u).edita, false, u + ' não edita'); assert.equal(p(u).le, true, u + ' lê'); });
  ['prod', 'pend', 'off'].forEach((u) => assert.equal(p(u).le, false, u + ' não lê'));
  assert.equal(T.perfil(null).ativo, false);
  ok('perfil: Qualidade por role/funções/módulo edita; PCP e Logística leem; produção, pendente e desativado não');

  // 2. Montar com a base real: snapshot da OP e da conferência, balanço do caso = 45 un. sem destino.
  const ctx = {rnc: FIX.nao_conformidades['RNC-2026-011'], opOrigem: FIX.ops['26302-01'],
    opsDestino: {'26302-01': FIX.ops['26302-01'], '26264-14': FIX.ops['26264-14']},
    conferencias: {'26302-01': FIX.conferencias_pa['26302-01'], '26264-14': FIX.conferencias_pa['26264-14']}};
  const ator = {uid: 'rob', nome: 'Qualidade Q', usuario: USUARIOS.rob};
  const c = T.aplicarAcao(null, 'CRIAR', ator, DADOS_CRIAR, '2026-11-16T15:00:00Z', ctx).registro;
  assert.equal(c.status, 'EM_PREENCHIMENTO');
  assert.equal(c.retrospectivo, true); assert.equal(c.semEfeitoOperacional, true);
  assert.equal(c.origem.qtdApontada, 3470); assert.equal(c.origem.qtdPlanejada, 690); assert.equal(c.origem.sku, 'PRF-BIOF-0006');
  assert.equal(c.destinos.d2.qtdConferida, 1965); assert.equal(c.destinos.d2.qtdApontada, 1962); assert.equal(c.destinos.d2.sku, 'PRF-BIOF-0004');
  assert.equal(c.destinos.d1.qtdConferida, 3470, 'a conferência da 26302/01 registrou 3.470 (o físico é 1.460)');
  assert.equal(c.rncResumo.opLoteNaRnc, '26266/14 E 26302/01', 'o lote como está escrito na RNC fica visível, sem ser corrigido');
  assert.deepEqual(Object.values(c.rncsRelacionadas), ['RNC-PA-26264-14']);
  assert.deepEqual(Object.keys(c.etapas).map((k) => c.etapas[k].tipo), T.ORDEM_ETAPAS);
  const b0 = T.balanco(c);
  assert.equal(b0.diferenca, 45); assert.equal(b0.fecha, false);
  assert.ok(b0.avisos.some((a) => /26302\/01.*1460.*3470/.test(a)), 'avisa que o palete da 26302/01 foi conferido com 3.470');
  const pend0 = T.pendencias(c);
  assert.match(pend0[0], /Balanço não fecha.*45/);
  assert.equal(pend0.filter((x) => /^Etapa/.test(x)).length, 12, '3 etapas × 4 pendências');
  ok('montar com a base real: 3.470 − 1.460 − 1.965 = 45 un. sem destino; etapas vazias pendentes; aviso do palete conferido com 3.470');

  // 3. Validações da criação.
  const criarErr = (d, cx, re) => assert.throws(() => T.aplicarAcao(null, 'CRIAR', ator, d, 't', cx), re);
  criarErr(Object.assign({}, DADOS_CRIAR), Object.assign({}, ctx, {rnc: null}), /RNC existente/);
  criarErr(Object.assign({}, DADOS_CRIAR, {destinos: []}), ctx, /ao menos um lote/);
  criarErr(Object.assign({}, DADOS_CRIAR, {destinos: [{opKey: '99999-99', qtd: 1}]}), ctx, /OP não encontrada/);
  criarErr(DADOS_CRIAR, Object.assign({}, ctx, {opOrigem: Object.assign({}, FIX.ops['26302-01'], {tipoOrdem: 'RETRABALHO'})}), /não uma OP de retrabalho/);
  criarErr(Object.assign({}, DADOS_CRIAR, {qtdOrigem: -3}), ctx, /quantidade inválida/);
  assert.throws(() => T.aplicarAcao(null, 'CRIAR', {uid: 'pcp', nome: 'PCP', usuario: USUARIOS.pcp}, DADOS_CRIAR, 't', ctx), /Só a Qualidade/);
  ok('criação recusa RNC inexistente, sem destino, OP inexistente, origem de retrabalho, quantidade negativa e PCP');

  // 4. Preencher: etapa com entrada ≠ saída + perda não fecha; perdas declaradas fecham o balanço.
  let r = T.aplicarAcao(c, 'SALVAR', ator, {etapas: {e1: etapaCheia(3470, 3470, 0), e2: etapaCheia(2010, 1960, 0), e3: etapaCheia(1965, 1965, 0)}}, 't2').registro;
  let b = T.balanco(r);
  assert.equal(b.etapas[1].fecha, false); assert.equal(b.etapas[1].diferenca, 50);
  assert.ok(T.pendencias(r).some((x) => /Etapa 2.*diferença 50/.test(x)));
  r = T.aplicarAcao(r, 'SALVAR', ator, {perdas: [{motivo: 'PERDA_DESENVASE', qtd: 45, observacao: 'líquido perdido no desenvase'}],
    etapas: {e2: etapaCheia(2010, 1965, 45)}}, 't3').registro;
  b = T.balanco(r);
  assert.equal(b.diferenca, 0); assert.equal(b.fecha, true);
  assert.deepEqual(T.pendencias(r), []);
  assert.equal(r.etapas.e2.preenchidoPor, 'Qualidade Q');
  assert.equal(r.etapas.e2.materiais.m01.descartado, 2010);
  ok('etapa 2 com 2.010 → 1.960 acusa 50; com 1.965 + 45 de perda e a perda declarada, o caso fecha');

  // 5. Perda sem motivo, "Outro" sem descrição, data inválida, destino desconhecido.
  const comMotivoVazio = T.aplicarAcao(r, 'SALVAR', ator, {perdas: [{motivo: '', qtd: 45}]}, 't').registro;
  assert.ok(T.pendencias(comMotivoVazio).some((x) => /escolha o motivo/.test(x)));
  const outro = T.aplicarAcao(r, 'SALVAR', ator, {perdas: [{motivo: 'OUTRO', qtd: 45}]}, 't').registro;
  assert.ok(T.pendencias(outro).some((x) => /descreva o motivo/.test(x)));
  assert.throws(() => T.aplicarAcao(r, 'SALVAR', ator, {etapas: {e1: {inicio: '30/10/2026'}}}, 't'), /data inválida/);
  assert.throws(() => T.aplicarAcao(r, 'SALVAR', ator, {destinos: {d9: {qtd: 1}}}, 't'), /Destino desconhecido/);
  assert.throws(() => T.aplicarAcao(r, 'SALVAR', ator, {etapas: {e9: {}}}, 't'), /Etapa desconhecida/);
  ok('perda sem motivo e "Outro" sem descrição ficam pendentes; data, destino e etapa inválidos são recusados');

  // 6. Ciclo: enviar, devolver (com motivo), reenviar, encerrar (com análise); encerrado é imutável.
  assert.throws(() => T.aplicarAcao(c, 'ENVIAR', ator, {}, 't'), /Balanço não fecha/);
  let e = T.aplicarAcao(r, 'ENVIAR', ator, {}, 't4').registro;
  assert.equal(e.status, 'AGUARDANDO_DECISAO');
  assert.throws(() => T.aplicarAcao(e, 'SALVAR', ator, {descricao: 'x'}, 't'), /aguardando decisão/);
  assert.throws(() => T.aplicarAcao(e, 'REABRIR', ator, {}, 't'), /Diga por que/);
  const dev = T.aplicarAcao(e, 'REABRIR', ator, {motivo: 'conferir válvulas'}, 't5');
  assert.equal(dev.registro.status, 'EM_PREENCHIMENTO'); assert.equal(dev.evento.motivo, 'conferir válvulas');
  e = T.aplicarAcao(dev.registro, 'ENVIAR', ator, {}, 't6').registro;
  assert.throws(() => T.aplicarAcao(e, 'ENCERRAR', ator, {}, 't'), /análise/);
  const fim = T.aplicarAcao(e, 'ENCERRAR', ator, {analise: 'Retrabalho conforme a RNC-2026-011.', conclusao: '1.460 Rose e 1.965 Sunrise Muse.'}, 't7');
  assert.equal(fim.registro.status, 'ENCERRADO'); assert.equal(fim.registro.decisao.por, 'Qualidade Q');
  assert.ok(fim.evento.mudou.status && fim.evento.mudou.decisao, 'histórico guarda antes/depois');
  ['SALVAR', 'ENVIAR', 'REABRIR', 'ENCERRAR'].forEach((a) => assert.throws(() => T.aplicarAcao(fim.registro, a, ator, {motivo: 'x', analise: 'x'}, 't'), /já foi encerrado/));
  ok('ciclo: enviar → devolver (motivo) → reenviar → encerrar (análise); histórico com antes/depois; encerrado é imutável');

  // 7. RTDB sem vazios: registro podado continua legível.
  const podado = podar(clonar(c));
  assert.equal(podado.perdas, undefined); assert.equal(podado.etapas.e1.materiais, undefined);
  assert.equal(T.balanco(podado).diferenca, 45);
  assert.equal(T.etapas(podado)[0].materiais.length, 0); assert.equal(T.etapas(podado)[0].evidencias.length, 0);
  assert.doesNotThrow(() => T.aplicarAcao(podado, 'SALVAR', ator, {perdas: [{motivo: 'DESCARTE', qtd: 45}]}, 't'));
  ok('registro com perdas/materiais/evidências podados pelo RTDB continua legível e editável');

  // 8. Serviço real sobre a base real; só grava registros_retrabalho*.
  const base = Object.assign(clonar(FIX), {usuarios: USUARIOS});
  delete base._origem;
  const antes = clonar(base);
  const concAntes = Conciliacao.calcular(clonar(base));
  const consAntes = Consistencia.avaliar(clonar(base), concAntes);
  const db = bancoFalso(base);
  let t = 0;
  const svc = S.criarServico({db, agora: () => new Date(Date.UTC(2026, 10, 16, 15, 0, t++)).toISOString()});
  const criado = await svc.executar('rob', {acao: 'CRIAR', requestId: 'r1', dados: DADOS_CRIAR});
  assert.deepEqual(criado, {id: 'RR-26302-01-1', status: 'EM_PREENCHIMENTO'});
  assert.deepEqual(await svc.executar('rob', {acao: 'CRIAR', requestId: 'r1', dados: DADOS_CRIAR}), criado, 'mesmo requestId devolve o mesmo registro');
  assert.equal(Object.keys(db.raiz.registros_retrabalho).length, 1);
  const segundo = await svc.executar('yas', {acao: 'CRIAR', requestId: 'r2', dados: DADOS_CRIAR});
  assert.equal(segundo.id, 'RR-26302-01-2', 'Qualidade por função (multi-função) abre');
  await assert.rejects(svc.executar('pcp', {acao: 'CRIAR', requestId: 'r3', dados: DADOS_CRIAR}), (x) => x.code === 'permission-denied');
  await assert.rejects(svc.executar('prod', {acao: 'CRIAR', requestId: 'r4', dados: DADOS_CRIAR}), (x) => x.code === 'permission-denied');
  await assert.rejects(svc.executar('off', {acao: 'CRIAR', requestId: 'r5', dados: DADOS_CRIAR}), /inativo/);
  await assert.rejects(svc.executar('rob', {acao: 'CRIAR', requestId: 'r6', dados: Object.assign({}, DADOS_CRIAR, {rncNumero: 'RNC-2099-999'})}), /RNC existente/);
  await assert.rejects(svc.executar('rob', {acao: 'CRIAR', requestId: 'r/7', dados: DADOS_CRIAR}), /requestId/);
  await assert.rejects(svc.executar('rob', {acao: 'SALVAR', requestId: 'r8', id: 'RR-NAO-EXISTE', dados: {}}), (x) => x.code === 'not-found');
  assert.equal(db.raiz.registros_retrabalho_pedidos.rob.r6, undefined, 'pedido que falhou é liberado para nova tentativa');
  ok('serviço real: cria RR-26302-01-1 da base real, idempotente por requestId; recusa PCP, produção, inativo, RNC inexistente');

  const id = criado.id;
  await svc.executar('rob', {acao: 'SALVAR', requestId: 's1', id, dados: {perdas: [{motivo: 'PERDA_DESENVASE', qtd: 45}],
    etapas: {e1: etapaCheia(3470, 3470, 0), e2: etapaCheia(2010, 1965, 45), e3: etapaCheia(1965, 1965, 0)}}});
  await svc.executar('rob', {acao: 'ENVIAR', requestId: 's2', id});
  const enc = await svc.executar('adm', {acao: 'ENCERRAR', requestId: 's3', id, dados: {analise: 'ok'}});
  assert.equal(enc.status, 'ENCERRADO');
  const reg = db.raiz.registros_retrabalho[id];
  assert.equal(Object.keys(reg.historico).length, 4, 'criar, salvar, enviar, encerrar');
  assert.equal(T.balanco(reg).fecha, true);
  await assert.rejects(svc.executar('rob', {acao: 'SALVAR', requestId: 's4', id, dados: {descricao: 'x'}}), /já foi encerrado/);
  ok('fluxo completo pelo serviço: salvar, enviar, encerrar; histórico com 4 eventos; encerrado não muda');

  // 9. NÃO INTERFERÊNCIA.
  const fora = db.gravados.filter((pth) => !/^registros_retrabalho(_pedidos)?\//.test(pth));
  assert.deepEqual(fora, [], 'o serviço gravou fora de registros_retrabalho*: ' + fora.join(', '));
  const depois = clonar(db.raiz);
  delete depois.registros_retrabalho; delete depois.registros_retrabalho_pedidos;
  assert.deepEqual(depois, antes, 'nenhum nó operacional mudou (OP, pedido, estoque, conferência, RNC, usuários)');
  const concDepois = Conciliacao.calcular(clonar(db.raiz));
  assert.deepEqual(concDepois, concAntes, 'conciliação do PED-0001 idêntica');
  assert.deepEqual(Consistencia.avaliar(clonar(db.raiz), concDepois), consAntes, 'motor de consistência idêntico');
  ok('não interferência: só registros_retrabalho* gravado; OPs, pedido, estoque, conferências e RNCs idênticos; conciliação e consistência idênticas');

  console.log('run_registro_retrabalho_test: ' + n + ' grupos OK');
})().catch((e) => { console.error(e); process.exit(1); });
