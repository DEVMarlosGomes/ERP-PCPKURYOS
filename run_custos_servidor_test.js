'use strict';
/* Custos e Resultado no servidor (functions/custos_resultado.js + index.js):
   custo gravado no lote pelo recebimento REAL, razão append-only com estorno,
   tabela de pontos congelada, placar só com totais, fechamento do mês e a
   rodada agendada ponta a ponta contra um banco simulado (a ligação, não só a
   unidade -- lição do clienteKey duplicado em CLAUDE.md). */
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const S = require('./functions/custos_resultado');

let n = 0;
const t = (nome, fn) => { fn(); n++; console.log('ok -', nome); };
const ta = async (nome, fn) => { await fn(); n++; console.log('ok -', nome); };

// ── banco simulado (mesmo do run_propriedade_estoque_test.js, com .on) ──────
function fakeDb(dados) {
  const partes = (p) => String(p || '').split('/').filter(Boolean);
  const get = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), dados);
  const set = (p, v) => {
    const ks = partes(p), last = ks.pop(); let o = dados;
    ks.forEach((k) => { o = o[k] || (o[k] = {}); });
    if (v === null || v === undefined) delete o[last]; else o[last] = v;
  };
  const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  let seq = 0;
  const escutas = [];
  const ref = (p) => ({
    key: partes(p).slice(-1)[0],
    once: async () => ({val: () => clone(get(p)), exists: () => get(p) != null}),
    get: async () => ({val: () => clone(get(p)), exists: () => get(p) != null}),
    on: (ev, cb) => { escutas.push([p, cb]); cb({val: () => clone(get(p))}); },
    orderByKey() { const q = {startAt: () => q, endAt: () => q, get: async () => ({val: () => clone(get(p))})}; return q; },
    set: async (v) => set(p, clone(v)),
    update: async (v) => {
      Object.entries(v).forEach(([k, val]) => {
        if (val && typeof val === 'object' && val['.sv']) {
          const atual = Number(get((p ? p + '/' : '') + k)) || 0;
          set((p ? p + '/' : '') + k, atual + val['.sv'].increment);
        } else set((p ? p + '/' : '') + k, clone(val));
      });
      // Escutas veem o valor novo (como o SDK).
      escutas.forEach(([ep, cb]) => cb({val: () => clone(get(ep))}));
    },
    push(v) {
      const k = 'push' + (++seq); const r = ref(p + '/' + k);
      if (v === undefined) return r;
      return Promise.resolve(set(p + '/' + k, clone(v))).then(() => r);
    },
    transaction: async (fn) => {
      let out = fn(null);
      if (out === undefined) return {committed: false, snapshot: {val: () => clone(get(p))}};
      if (get(p) != null) { out = fn(clone(get(p))); if (out === undefined) return {committed: false, snapshot: {val: () => clone(get(p))}}; }
      set(p, clone(out));
      return {committed: true, snapshot: {val: () => clone(get(p)), exists: () => get(p) != null}};
    },
  });
  return {ref, dados};
}

(async () => {
  // ── 1. Cópias byte a byte ───────────────────────────────────────────────
  t('motores em functions/ são cópia byte a byte de public/shared', () => {
    ['custos', 'custos-realizado', 'resultado-pontos'].forEach((f) => {
      assert.equal(fs.readFileSync(`functions/${f}.js`, 'utf8'), fs.readFileSync(`public/shared/${f}.js`, 'utf8'), f);
    });
  });

  t('diretoria = ADM ou módulo Custos', () => {
    assert.ok(S.ehDiretoria({role: 'admin'}));
    assert.ok(S.ehDiretoria({role: 'pcp', modulos: {custos: true}}));
    assert.ok(!S.ehDiretoria({role: 'pcp'}));
    assert.ok(!S.ehDiretoria(null));
  });

  t('dia civil de São Paulo (UTC−3)', () => {
    assert.equal(S.diaSP('2026-10-01T02:00:00Z'), '2026-09-30');
    assert.equal(S.diaSP('2026-10-01T03:00:00Z'), '2026-10-01');
    assert.equal(S.mesAnterior('2026-01'), '2025-12');
  });

  t('custo do lote: celofane R$ 2.100 / 3 rolos = R$ 700 o rolo (não R$ 60)', () => {
    const pc = {itens: {i: {materialCodigo: 'ES-00319', custoTotalNaDecisao: 2100, precoUnit: 60, qtd: 3, qtdEmUnidadeEstoque: 3, unidade: 'rolo', unidadeCotada: 'kg'}}};
    const c = S.custoDoLoteRecebido(pc, 'i', 3, 'PC/i');
    assert.equal(c.campos.custoUnitario, 700);
    assert.equal(c.campos.custoFonte, 'PAGO');
    assert.equal(c.lancamento.valorTotal, 2100);
    assert.equal(c.lancamento.natureza, 'EMBALAGEM');
    const sem = S.custoDoLoteRecebido({itens: {i: {materialCodigo: 'X', qtd: 3}}}, 'i', 3, 'PC/i');
    assert.equal(sem.campos.custoUnitario, null, 'item sem preço: null');
    assert.equal(sem.campos.custoFonte, 'SEM_CUSTO');
    assert.equal(sem.lancamento, null, 'sem preço: sem lançamento de zero');
  });

  // ── 2. Servidor real (index.js) contra o banco simulado ─────────────────
  const dados = {};
  const sdb = fakeDb(dados);
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const fakeFunctions = new Proxy({}, {get: (_, nome) => {
    if (nome === 'HttpsError') return HttpsError;
    if (nome === 'defineSecret') return (s) => ({value: () => 'segredo-' + s});
    return (opts, handler) => ({opts, handler: handler || opts, tipo: nome});
  }});
  const fakeAdmin = {initializeApp() {}, database: Object.assign(() => sdb, {ServerValue: {increment: (x) => ({'.sv': {increment: x}})}})};
  const loadOriginal = Module._load;
  Module._load = function(req) {
    if (req === 'firebase-admin') return fakeAdmin;
    if (req.startsWith('firebase-functions')) return fakeFunctions;
    return loadOriginal.apply(this, arguments);
  };
  const index = require(path.join(__dirname, 'functions', 'index.js'));
  Module._load = loadOriginal;
  const chamar = (fn, data, uid = 'log') => index[fn].handler({auth: {uid, token: {}}, data});

  dados.usuarios = {log: {nome: 'Logística', role: 'logistica'}, adm: {nome: 'Ana ADM', role: 'admin'}, pcp: {nome: 'Paulo', role: 'pcp'}};
  dados.enderecos_estoque = {DOC: {codigo: 'DOC-1.1.1', ativo: true}};
  dados.contadores_lote_interno = {2026: 700};
  const linha = (itemKey, qtd, lote) => ({itemKey, qtdRecebida: qtd, qtdVolumes: 1, qtdAmostragem: 1, tipoMaterial: 'EMBALAGEM',
    identificacaoMaterial: 'Celofane', skuFornecedor: 'F-1', loteOrigem: lote, certificadoFornecedor: 'SIM', condicoesEmbalagem: 5, enderecoKey: 'DOC'});
  const payload = (pedidoKey, idem, linhas) => ({pedidoKey, idempotencyKey: idem, data: '2026-10-15', notaFiscal: 'NF 1', condicoesVeiculo: 5, linhas});
  const geral = {geral: true, clienteKey: null, clienteNome: null, pedidos: []};

  await ta('recebimento grava o custo no lote, no movimento e a ENTRADA no razão', async () => {
    dados.pedidos_compra = {PC1: {status: 'ENVIADO', numeroFormatado: 'PC-0001', fornecedorNome: 'Emblema', itens: {
      i1: {materialCodigo: 'ES-00319', materialNome: 'BOBINA CELOFANE', qtd: 3, qtdRecebida: 0, unidade: 'rolo', unidadeCotada: 'kg',
        custoTotalNaDecisao: 2100, precoUnit: 60, qtdCotada: 35, qtdEmUnidadeEstoque: 3, vinculo: geral},
      i2: {materialCodigo: 'ES-00999', materialNome: 'SEM PREÇO', qtd: 5, qtdRecebida: 0, unidade: 'un', vinculo: geral}}}};
    const r = await chamar('registrarRecebimento', payload('PC1', 'idem-custo-lote-0001', [linha('i1', 3, 'B1'), linha('i2', 5, 'B2')]));
    const lote = dados.estoque_lotes['ES-00319'][r.lotes[0].loteKey];
    assert.equal(lote.custoUnitario, 700);
    assert.equal(lote.custoFonte, 'PAGO');
    assert.equal(lote.custoRef, 'PC1/i1');
    const semPreco = dados.estoque_lotes['ES-00999'][r.lotes[1].loteKey];
    assert.equal(semPreco.custoUnitario, null, 'sem preço: null, nunca zero');
    assert.equal(semPreco.custoFonte, 'SEM_CUSTO');
    const mov = Object.values(dados.movimentos_estoque['ES-00319'])[0];
    assert.equal(mov.custoTotal, 2100);
    const razao = dados.custos.razao['2026-10'];
    const entradas = Object.values(razao).filter((l) => l.tipo === 'ENTRADA_MATERIAL');
    assert.equal(entradas.length, 1, 'só a linha com preço vira lançamento');
    assert.equal(entradas[0].valorTotal, 2100);
    assert.deepEqual(entradas[0].objeto, {tipo: 'MATERIAL', id: 'ES-00319'});
  });

  await ta('remessa do cliente: lote CLIENTE com custo zero carimbado, sem lançamento', async () => {
    dados.pedidos_compra.PCC = {status: 'ENVIADO', naturezaMovimentacao: 'REMESSA_CLIENTE', origemNome: 'Miss Rose',
      itens: {i1: {materialCodigo: 'VAL-1', qtd: 10, qtdRecebida: 0, vinculo: {clienteKey: 'MRAR', clienteNome: 'MISS ROSE', pedidos: ['0006']}}}};
    const antes = Object.keys(dados.custos.razao['2026-10']).length;
    const r = await chamar('registrarRecebimento', payload('PCC', 'idem-custo-cliente-01', [linha('i1', 10, 'C1')]));
    const lote = dados.estoque_lotes['VAL-1'][r.lotes[0].loteKey];
    assert.equal(lote.custoUnitario, 0);
    assert.equal(lote.custoFonte, 'CLIENTE');
    assert.equal(Object.keys(dados.custos.razao['2026-10']).length, antes);
  });

  await ta('devolução parcial ao fornecedor estorna só a parte devolvida no razão', async () => {
    dados.pedidos_compra.PC2 = {status: 'ENVIADO', fornecedorNome: 'Emblema', itens: {i1: {materialCodigo: 'EP-00777', qtd: 10, qtdRecebida: 0, unidade: 'un', precoUnit: 2, vinculo: geral}}};
    const r = await chamar('registrarRecebimento', payload('PC2', 'idem-custo-dev-00001', [linha('i1', 10, 'D1')]));
    await chamar('registrarDevolucaoRecebimento', {pedidoKey: 'PC2', recebimentoKey: r.recebimentoKey, linhaKey: 'L001', quantidade: 4, motivo: 'avaria', idempotencyKey: 'idem-dev-parcial-0001'});
    const est = Object.values(dados.custos.razao[new Date().toISOString().slice(0, 7)] || {}).filter((l) => l.tipo === 'ESTORNO' && l.parcial);
    assert.equal(est.length, 1);
    assert.equal(est[0].valorTotal, -8, '4 un × R$ 2');
  });

  await ta('cancelar recebimento ESTORNA no razão (append-only), não apaga', async () => {
    const recKey = Object.keys(dados.pedidos_compra.PC1.recebimentos)[0];
    const antes = JSON.parse(JSON.stringify(dados.custos.razao['2026-10']));
    await chamar('cancelarRecebimento', {pedidoKey: 'PC1', recebimentoKey: recKey, motivo: 'NF errada'});
    const depois = dados.custos.razao[new Date().toISOString().slice(0, 7)] || {};
    Object.keys(antes).forEach((k) => assert.deepEqual(dados.custos.razao['2026-10'][k], antes[k], 'lançamento original intacto'));
    const est = Object.values(depois).filter((l) => l.tipo === 'ESTORNO' && !l.parcial);
    assert.equal(est.length, 1);
    assert.equal(est[0].valorTotal, -2100);
    assert.match(est[0].estornaId, /^2026-10\//);
  });

  // ── 3. Congelamento, placar, fechamento e razão das OPs ─────────────────
  const materiais = {
    agua: {mpCodigo: 'MPGR-1', mpNome: 'ÁGUA', tipo: 'MPGR', unidade: 'kg'},
    frasco: {mpCodigo: 'EP-1', mpNome: 'FRASCO 200ML', tipo: 'EP', unidade: 'un'},
  };
  const config = {turnoHorarios: {Padrao: '07:00'}, turnoHorariosFim: {Padrao: '17:00'}, turnoHorariosFimSexta: {Padrao: '16:00'},
    turnoPausas: {Padrao: {inicio: '12:00', fim: '13:00'}}, planejamento: {diasSemana: [1, 2, 3, 4, 5]}, linhas: ['Linha 1', 'Linha 2', 'Linha 3']};
  const baseCompleta = () => ({
    materiais, config,
    produtos: {p: {sku: 'BS', descricao: 'BODY SPLASH', clienteKey: 'CLI', volume: 200, unidadeVolume: 'ml', densidadeGranel: 1, prodHoraRef: 600}},
    formulas: {BS__v1: {codProduto: 'BS', versao: 'v1', status: 'APROVADA', itens: {a: {mpCodigo: 'MPGR-1', percentualMM: 100}}}},
    bom: {BS__v1: {codProduto: 'BS', versao: 'v1', status: 'APROVADA', itens: {a: {materialCodigo: 'EP-1', qtdPorPeca: 1}}}},
    especificacoes: {},
    custos_precos: {agua: {valor: 2, unidade: 'kg'}, frasco: {valor: 1, unidade: 'un'}},
    precos_venda: {BS: {sku: 'BS', vigencias: {a: {preco: 5, inicio: '2026-01-01'}}}},
    ops: {
      o1: {sku: 'BS', lote: 'L1', produzido: 6000, mediaPorHora: 600, status: 'Concluído', linha: 'Linha 1', cliente: 'CLI', skuPedidoKey: '0006__BS', dataFimReal: '2026-09-15T16:00:00'},
      o2: {sku: 'BS', lote: 'L2', produzido: 5400, mediaPorHora: 600, status: 'Concluído', linha: 'Linha 1', cliente: 'CLI', dataFimReal: '2026-10-05T16:00:00'},
    },
    registros: {
      '2026-10-05': {a: {linha: 'Linha 1', lote: 'L2', quantidade: 5400, horasTrabalhadas: 9}, b: {linha: 'Rotulagem 01', lote: 'L2', quantidade: 5400}},
      '2026-10-06': {c: {linha: 'Linha 1', lote: 'L2', quantidade: 2700, horasTrabalhadas: 9}},
    },
    perdas: {}, retrabalhos: {}, estoque_lotes: {}, conferencias_pa: {},
    custos: {parametros: {impostosPct: 10, fatorPontos: 100, metaAlvoPct: 90, bonusBase: 1000, faixasBonus: [{pct: 100, mult: 1}, {pct: 110, mult: 1.2}], tetoBonusPct: 130},
      operacao: {'2026-09': {folhaProducao: 55500, fixos: {}}}},
    resultado: {},
  });

  t('congelar: tabela de pontos sem R$, fichas e taxa só no nó da diretoria', () => {
    const c = S.prepararCongelamento(baseCompleta(), '2026-10', {agora: '2026-10-01T03:05:00Z', por: 'Ana'});
    assert.ok(c.ok, c.motivo);
    const tab = c.updates['resultado/tabelas/2026-10'];
    // granel 0,2 kg × R$2 = 0,40 ; frasco 1,00 ; operação: folha 55.500 / (hora-linha disponível de out/26) ÷ 600
    const horas = require('./public/shared/custos').horasUteisDoMes(config, '2026-10').horasUteis;
    const op = 55500 / (horas * 3) / 600;
    const lp = 5 * 0.9 - (0.4 + 1 + op);
    assert.equal(tab.porSku.BS.pontos, Math.round(lp * 100));
    assert.equal(tab.porSku.BS.origem, 'LP_PADRAO');
    assert.ok(!JSON.stringify(tab).includes('"lp"'), 'tabela de pontos (lida pela fábrica) não leva LP');
    const f = c.updates['custos/fichas/2026-10/BS'];
    assert.ok(Math.abs(f.lp - lp) < 1e-6, 'LP no snapshot da diretoria');
    assert.equal(c.updates['custos/taxas/2026-10'].competenciaOperacao, '2026-09', 'operação de outubro não informada: usa a última, declarado');
    assert.deepEqual(c.updates['custos/taxas/2026-10'].mesesBaseHorasPadrao, ['2026-09'], 'horas-padrão: meses COM produção antes da competência');
  });

  t('congelar: recusa sem fator, recusa duplicar, substituir exige motivo e guarda a anterior', () => {
    const b = baseCompleta(); b.custos.parametros.fatorPontos = null;
    assert.ok(!S.prepararCongelamento(b, '2026-10', {}).ok);
    const b2 = baseCompleta(); b2.resultado.tabelas = {'2026-10': {congeladaEm: 'x', porSku: {}}};
    assert.match(S.prepararCongelamento(b2, '2026-10', {}).motivo, /já está congelada/);
    assert.match(S.prepararCongelamento(b2, '2026-10', {substituir: true}).motivo, /motivo/);
    const sub = S.prepararCongelamento(b2, '2026-10', {substituir: true, motivo: 'preço de venda errado', agora: '2026-10-02T10:00:00.000Z'});
    assert.ok(sub.ok);
    assert.ok(Object.keys(sub.updates).some((k) => k.startsWith('resultado/tabelas_historico/2026-10/')), 'a tabela anterior vai para o histórico');
  });

  t('placar: só totais (nunca R$ nem SKU), meta pelo mix, rotulagem não conta', () => {
    const b = baseCompleta();
    b.resultado.tabelas = {'2026-10': {porSku: {BS: {pontos: 100}}}};
    const p = S.prepararPlacar(b, '2026-10-06T20:00:00Z');
    const d5 = p.updates['resultado/placar/dias/2026-10-05'];
    assert.equal(d5.pontos, 5400 * 100, 'rotulagem do mesmo lote não soma');
    assert.equal(d5.meta, Math.round(9 * 600 * 100 * 0.9), 'meta: 9 h × 600 × 100 × 90%');
    assert.equal(d5.batida, true);
    const d6 = p.updates['resultado/placar/dias/2026-10-06'];
    assert.equal(d6.batida, false, 'meio ritmo não bate');
    const texto = JSON.stringify(p.updates);
    assert.ok(!/"lp"|"BS"|preco|custo/i.test(texto), 'placar não leva LP, custo, preço nem SKU');
    assert.ok(p.updates['resultado/placar/semanas/2026-W41'], 'semana');
    assert.ok(p.updates['resultado/placar/meses/2026-10'], 'mês');
    assert.equal(p.updates['resultado/placar/hoje'].dia, '2026-10-06');
  });

  t('placar: mês fechado não é regravado', () => {
    const b = baseCompleta();
    b.resultado.tabelas = {'2026-10': {porSku: {BS: {pontos: 100}}}};
    b.resultado.fechamentos = {'2026-10': {fechadoEm: '2026-11-01'}};
    const p = S.prepararPlacar(b, '2026-10-06T20:00:00Z');
    assert.ok(!Object.keys(p.updates).some((k) => k.startsWith('resultado/placar/dias/2026-10')));
  });

  t('fechamento: % do mês, faixa do bônus e portões', () => {
    const b = baseCompleta();
    b.resultado.placar = {dias: {
      '2026-10-05': {dia: '2026-10-05', pontos: 120, meta: 100, unidades: 1, unidadesComPontos: 1, batida: true},
      '2026-10-13': {dia: '2026-10-13', pontos: 100, meta: 100, unidades: 1, unidadesComPontos: 1, batida: true}}};
    b.resultado.portoes = {'2026-10': {x: {tipo: 'ACIDENTE', data: '2026-10-13'}}};
    const f = S.prepararFechamento(b, '2026-10', {agora: '2026-11-01T10:00:00Z', por: 'Ana'});
    const fe = f.updates['resultado/fechamentos/2026-10'];
    assert.equal(fe.pct, 110);
    assert.equal(fe.multiplicador, 1.2);
    assert.equal(fe.semanasComAcidente, 1);
    assert.equal(fe.bonus, 600, '1.000 × 1,2 × (1 de 2 semanas sem acidente)');
    assert.equal(fe.bonusValendo, false, 'piloto: bônus calculado, não valendo');
    b.resultado.fechamentos = {'2026-10': {fechadoEm: 'x'}};
    assert.ok(!S.prepararFechamento(b, '2026-10', {}).ok, 'não fecha duas vezes');
  });

  t('razão das OPs: lança uma vez, não repete, e estorna+relança se a quantidade mudar', () => {
    const b = baseCompleta();
    const r1 = S.prepararRazaoOps(b, '2026-10-06T20:00:00Z', {desde: '2026-10-01'});
    assert.equal(r1.lancadas, 1, 'só a OP concluída no período');
    const chaves = Object.keys(r1.updates).filter((k) => k.startsWith('custos/razao/2026-10/OP_o2_'));
    // Sem perda apontada: material e hora; a PERDA de zero não vira lançamento.
    assert.deepEqual(chaves.map((k) => k.replace(/^.*OP_o2_/, '')).sort(), ['CONSUMO_MATERIAL_r1', 'HORA_PRODUCAO_r1']);
    b.custos.razao_ops = {o2: r1.updates['custos/razao_ops/o2']};
    assert.equal(S.prepararRazaoOps(b, '2026-10-06T21:00:00Z', {desde: '2026-10-01'}).lancadas, 0, 'idempotente');
    // Sem preço de material: a OP espera, não vira lançamento vazio nem fica marcada.
    const semPreco = baseCompleta(); semPreco.custos_precos = {};
    const rs = S.prepararRazaoOps(semPreco, '2026-10-06T20:00:00Z', {desde: '2026-10-01'});
    assert.equal(rs.lancadas, 0); assert.equal(rs.aguardandoCusto, 1);
    assert.ok(!Object.keys(rs.updates).some((k) => k.startsWith('custos/razao_ops/')), 'OP sem custo não é marcada como lançada');
    b.ops.o2.produzido = 5000;
    const r3 = S.prepararRazaoOps(b, '2026-10-07T10:00:00Z', {desde: '2026-10-01'});
    assert.equal(r3.estornadas, 1);
    assert.ok(Object.keys(r3.updates).some((k) => /_estorno_r2$/.test(k)), 'estorno');
    assert.ok(Object.keys(r3.updates).some((k) => /HORA_PRODUCAO_r2$/.test(k)), 'relançamento r2');
  });

  // ── 4. Rodada agendada ponta a ponta ────────────────────────────────────
  await ta('calcularResultado: congela a tabela no 1º do mês e grava o placar (ligação real)', async () => {
    const b = baseCompleta();
    Object.assign(dados, {produtos: b.produtos, formulas: b.formulas, bom: b.bom, especificacoes: b.especificacoes, materiais,
      custos_precos: b.custos_precos, precos_venda: b.precos_venda, ops: b.ops, registros: b.registros, config,
      perdas: {}, retrabalhos: {}, conferencias_pa: {}});
    dados.custos.parametros = b.custos.parametros;
    dados.custos.operacao = b.custos.operacao;
    const RealDate = Date;
    global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : ['2026-10-06T20:00:00Z'])); } static now() { return new RealDate('2026-10-06T20:00:00Z').getTime(); } };
    try { await index.calcularResultado.handler(); } finally { global.Date = RealDate; }
    assert.ok(dados.resultado.tabelas['2026-10'], 'tabela de outubro congelada sozinha');
    assert.ok(dados.custos.fichas['2026-10'].BS, 'snapshot das fichas');
    assert.ok(dados.resultado.placar.dias['2026-10-05'].pontos > 0, 'placar gravado');
    assert.ok(dados.custos.razao_ops && dados.custos.razao_ops.o2, 'razão da OP lançado');
  });

  await ta('callables da diretoria recusam quem não é diretoria', async () => {
    await assert.rejects(chamar('congelarTabelaPontos', {competencia: '2026-11'}, 'pcp'), (e) => e.code === 'permission-denied');
    await assert.rejects(chamar('fecharMesResultado', {competencia: '2026-10'}, 'log'), (e) => e.code === 'permission-denied');
    await assert.rejects(chamar('congelarTabelaPontos', {competencia: '10/2026'}, 'adm'), (e) => e.code === 'invalid-argument');
    const r = await chamar('congelarTabelaPontos', {competencia: '2026-11'}, 'adm');
    assert.ok(r.ok && dados.resultado.tabelas['2026-11'].congeladaPor === 'Ana ADM');
  });

  console.log(`\nOK custos servidor: ${n} casos`);
})().catch((e) => { console.error(e); process.exit(1); });
