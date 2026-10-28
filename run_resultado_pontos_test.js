'use strict';
/* Testes do custo realizado (public/shared/custos-realizado.js) e dos pontos,
   meta, placar e bônus (public/shared/resultado-pontos.js) —
   PLANO_CUSTOS_RESULTADO.md §5–§7. */
const assert = require('node:assert/strict');
const R = require('./public/shared/custos-realizado');
const P = require('./public/shared/resultado-pontos');

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { n++; assert.equal(a, b, msg); };
const perto = (a, b, msg, tol = 1e-6) => { n++; assert.ok(a != null && Math.abs(a - b) <= tol, msg + ` (esperado ${b}, veio ${a})`); };

// ── 1. Apontamentos: achatar, linha de envase, SKU pelo lote ───────────────
const registros = {
  '2026-09-01': {
    a: { linha: 'Linha 01', lote: 'L1', quantidade: 1000, horasTrabalhadas: 2 },
    b: { linha: 'Rotulagem 02', lote: 'L1', quantidade: 1000 },
    c: { linha: 'Celofane', lote: 'L1', quantidade: 1000 },
    d: { linha: 'Linha 2', sku: 'b', quantidade: 600, horasTrabalhadas: 1 },
    e: { linha: 'Linha 2', produto: 'NADA CONHECIDO', quantidade: 50 }
  },
  '2026-09-02': { f: { linha: 'Linha 1', lote: 'L1', quantidade: 500, horasTrabalhadas: 1 } },
  'sem-data': { g: { linha: 'Linha 1', lote: 'L1', quantidade: 999 } }
};
const ops = { op1: { lote: 'L1', sku: 'A', produzido: 1500, linha: 'Linha 1', cliente: 'CLI', skuPedidoKey: '0006__A', dataFimReal: '2026-09-02T10:00:00' } };
const aps = R.achatarRegistros(registros);
eq(aps.length, 6, 'balde "sem-data" fica de fora');
ok(R.ehLinhaEnvase('Linha 01') && R.ehLinhaEnvase('linha 3') && !R.ehLinhaEnvase('Rotulagem 02') && !R.ehLinhaEnvase('Celofane'), 'só linha de envase conta como unidade boa');
const idxOps = R.indexarOps(ops);
eq(R.skuDoApontamento({ lote: 'L1' }, idxOps, {}).sku, 'A', 'SKU pela OP do lote');
eq(R.skuDoApontamento({ sku: 'x' }, idxOps, {}).via, 'APONTAMENTO', 'campo do apontamento primeiro');
eq(R.skuDoApontamento({ produto: 'Body ' }, idxOps, { BODY: 'Z' }).sku, 'Z', 'pela descrição exata');
eq(R.pedidoDaOp(ops.op1), '0006', 'pedido global da OP');

// ── 2. Perdas: unidades = maior tipo, nunca a soma ─────────────────────────
const perdasNo = { x: { perdas: [{ tipo: 'Frascos', quantidade: 5 }, { tipo: 'Rótulos', quantidade: 7 }] } };
const porTipo = R.perdasDoLote(perdasNo, {});
eq(porTipo.Frascos, 5, 'perda por tipo');
eq(R.unidadesPerdidas(porTipo), 7, 'unidades perdidas = maior tipo (frasco e rótulo da mesma unidade)');
eq(R.perdasDoLote({}, { perdas: { cartuchos: 33 } }).cartuchos, 33, 'campo antigo ops.perdas');

// ── 3. Consumo do lote, com custo do lote de estoque ──────────────────────
const movs = { mpgr: { m1: { tipo: 'consumo', ref: 'L1', itemCodigo: 'MPGR-1', qtd: -10, loteKey: 'lt1' }, m2: { tipo: 'consumo', ref: 'OUTRO', itemCodigo: 'MPGR-1', qtd: -3 }, m3: { tipo: 'recebimento_pc', ref: 'L1', qtd: 50 } } };
const cons = R.consumosDoLote(movs, { mpgr: { lt1: { custoUnitario: 4 } } }, 'L1');
eq(cons.length, 1, 'só consumo do lote');
eq(cons[0].qtd, 10, 'saída negativa volta positiva');
eq(cons[0].custoUnitario, 4, 'custo do lote de origem');
// Auditoria 27/10: lote nascido de separação não traz custo; vale o irmão do mesmo lote interno.
const consSep = R.consumosDoLote({ mp: { m: { tipo: 'consumo', ref: 'L1', itemCodigo: 'MPGR-1', qtd: -5, loteKey: 'sep' } } },
  { mp: { orig: { loteInterno: 'AK-1', custoUnitario: 7 }, sep: { loteInterno: 'AK-1' } } }, 'L1');
eq(consSep[0].custoUnitario, 7, 'lote separado herda o custo do lote de mesmo lote interno');
eq(R.consumosDoLote({ mp: { m: { tipo: 'consumo', ref: 'L1', qtd: -5, loteKey: 'x' } } }, { mp: { x: { loteInterno: 'AK-9' } } }, 'L1')[0].custoUnitario, null, 'sem irmão com custo: null');

// ── 4. Custo realizado da OP ───────────────────────────────────────────────
const ficha = {
  custoMaterial: 2, custoVariavel: 2.4, lp: 1, ritmo: { valor: 600 },
  perdas: { custoPorPeca: 0.05 }, operacao: { custoPorPeca: 0.2 },
  embalagem: { linhas: [{ nome: 'FRASCO 200ML', precoUnitario: 1.5 }, { nome: 'ROTULO FRENTE', precoUnitario: 0.2 }] }
};
const taxa = { custoHoraDireta: 120, custoHoraLinha: {} };
const apsL1 = aps.filter((r) => r.lote === 'L1');
const res = R.custoRealizadoOp({ opKey: 'op1', op: ops.op1, ficha, apontamentos: apsL1, perdasPorTipo: { Frascos: 5, Rótulos: 7 },
  consumos: [], taxa, precoVenda: { valor: 5 }, impostosPct: 10 });
eq(res.horas, 3, 'horas apontadas SÓ das linhas de envase (rotulagem e celofane fora)');
eq(res.horasFonte, 'APONTADAS', 'fonte das horas');
perto(res.custo.operacao, 360, '3 h × R$ 120');
eq(res.custo.materialFonte, 'TEORICO', 'sem consumo apontado: teórico, declarado');
perto(res.custo.material, 3000, 'ficha × produzido');
perto(res.custo.perdas, 5 * 1.5 + 7 * 0.2, 'perdas valorizadas pelo material do BOM do mesmo tipo');
perto(res.variacoes.eficiencia, (3 - 2.5) * 120, 'eficiência: (horas reais − 1.500/600) × custo-hora');
eq(res.variacoes.consumo, null, 'consumo não medido: null, não zero');
perto(res.receitaLiquida, 1500 * 5 * 0.9, 'receita líquida');
perto(res.lp, 6750 - (3000 + 8.9 + 360), 'LP realizado');
eq(res.unidadesPerdidas, 7, 'unidades perdidas para os pontos');
ok(res.completo, 'OP completa');
// Duração da OP nunca entra: mudar dataInicio/Fim não muda nada.
const res2 = R.custoRealizadoOp({ opKey: 'op1', op: Object.assign({}, ops.op1, { dataInicioReal: '2026-08-01T00:00', dataFimReal: '2026-09-02T23:00' }), ficha, apontamentos: apsL1, perdasPorTipo: {}, taxa, precoVenda: { valor: 5 }, impostosPct: 10 });
perto(res2.custo.operacao, 360, 'duração de OP (calendário) não entra na operação');
// Sem horas apontadas: horas-padrão, e eficiência não medida.
const res3 = R.custoRealizadoOp({ opKey: 'op1', op: ops.op1, ficha, apontamentos: [], perdasPorTipo: {}, taxa, precoVenda: { valor: 5 }, impostosPct: 10 });
eq(res3.horasFonte, 'PADRAO', 'sem horas: cai nas horas-padrão');
eq(res3.variacoes.eficiencia, null, 'e a eficiência não é medida');
// Com consumo valorizado: variações de preço e consumo.
const idx = { 'MPGR-1': { key: 'mpgr' } };
const res4 = R.custoRealizadoOp({ opKey: 'op1', op: ops.op1, ficha, apontamentos: apsL1, perdasPorTipo: {},
  consumos: [{ itemCodigo: 'MPGR-1', qtd: 1000, custoUnitario: 3.3 }], precos: { mpgr: { valor: 3 } }, idx, taxa, precoVenda: { valor: 5 }, impostosPct: 10 });
perto(res4.custo.material, 3300, 'consumo × custo do lote');
perto(res4.variacoes.preco, 300, 'preço: pagou 3,30 contra 3,00 padrão');
perto(res4.variacoes.consumo, 0, 'consumo: 1.000 × 3 = 3.000 = padrão');
// Perda de tipo sem material no BOM: sem valor, sem total.
const res5 = R.custoRealizadoOp({ opKey: 'op1', op: ops.op1, ficha, apontamentos: apsL1, perdasPorTipo: { Outro: 3 }, taxa, precoVenda: { valor: 5 }, impostosPct: 10 });
eq(res5.custo.perdas, null, 'perda "Outro" sem material: não vira zero');
eq(res5.lp, null, 'e a OP fica sem LP');
// Estado vazio.
const vazio = R.custoRealizadoOp({});
ok(['lp', 'receita', 'horas'].every((k) => vazio[k] === null || vazio[k] === 0 || isFinite(vazio[k])), 'OP vazia: nada NaN');
eq(vazio.completo, false, 'OP vazia: incompleta');

// ── 5. Consolidação e razão ───────────────────────────────────────────────
const cons2 = R.consolidar([res, res5, Object.assign({}, res, { cliente: 'OUTRO', pedido: '0007' })], 'cliente');
const cli = cons2.find((g) => g.chave === 'CLI');
eq(cli.ops, 2, 'duas OPs do cliente');
perto(cli.coberturaPct, 50, 'cobertura: metade do produzido com custo');
ok(!cli.completo, 'nível com OP incompleta não é completo');
perto(cli.lp, res.lp, 'LP soma só as completas');
eq(R.consolidar([], 'mes').length, 0, 'vazio');
assert.throws(() => R.consolidar([], 'x')); n++;
const lanc = R.lancamentosDaOp(res, { em: '2026-09-02', por: 'servidor' });
eq(lanc.length, 3, 'material, perda e hora');
ok(lanc.every((l) => l.objeto.tipo === 'OP' && l.objeto.id === 'op1' && l.competencia === '2026-09'), 'objeto de custo e competência');
eq(R.lancamentosDaOp(res5).filter((l) => l.tipo === 'PERDA').length, 0, 'sem valor: sem lançamento de zero');

// ── 6. Tabela de pontos ───────────────────────────────────────────────────
const fichas = {
  A: { completo: true, lp: 1.2, pagoCotadoPct: 90 },
  B: { completo: true, lp: -0.4, pagoCotadoPct: 100 },
  C: { completo: false, lp: null, lpInformado: 0.8 },
  D: { completo: true, lp: 2, pagoCotadoPct: 30 }
};
const tab = P.tabelaDePontos({ fichas, fator: 25 });
eq(tab.porSku.A.pontos, 30, 'R$ 1,20 × 25 = 30 pontos (exemplo do plano)');
eq(P.pontosDe({ porSku: { 'BS_200': { pontos: 9 } } }, 'bs.200'), 9, 'SKU com ponto acha a chave sanitizada da tabela congelada');
eq(tab.porSku.B.pontos, 0, 'LP negativo vira 0 ponto (não pune a linha)');
ok(tab.porSku.B.lpNegativo, 'mas fica marcado');
ok(!tab.porSku.C && tab.fora.C, 'SEM CUSTO fica fora');
eq(P.tabelaDePontos({ fichas, fator: 25, usarLpInformado: true }).porSku.C.origem, 'LP_INFORMADO', 'opção: LP digitado do Cadastros');
ok(!P.tabelaDePontos({ fichas, fator: 25, coberturaMinimaPct: 80 }).porSku.D, 'cobertura mínima PAGO/COTADO tira o D (30%)');
ok(!P.tabelaDePontos({ fichas }).ok, 'sem fator: sem tabela');

// ── 7. Meta e placar do dia ───────────────────────────────────────────────
const tabela = { porSku: { A: { pontos: 30 }, B: { pontos: 10 } } };
const ritmos = { A: { valor: 600 }, B: { valor: 300 }, X: { valor: 600 } };
const producao = { porLinha: { 'Linha 1': { A: 3000, X: 600 }, 'Linha 2': { B: 900 } }, semSku: 100, total: 4600 };
const pl = P.placarDoDia({ dia: '2026-09-01', producao, tabela, ritmos, alvoPct: 80, horasDia: 9, descontos: { perdas: 300, retrabalho: 0 } });
// Linha 1: hp A=5, X=1 -> fatia A = 5/6 de 9 h = 7,5 h × 600 × 30 = 135.000 (X sem pontos não vira meta)
// Linha 2: B só -> 9 h × 300 × 10 = 27.000. Programa = 162.000; meta = 80% = 129.600.
eq(pl.meta, 129600, 'meta = programa do mix no ritmo × horas × alvo');
eq(pl.pontosBrutos, 3000 * 30 + 900 * 10, 'pontos brutos = unidades boas × pontos');
eq(pl.pontos, 99000 - 300, 'descontos saem');
eq(pl.porLinha['Linha 1'].meta, Math.round(135000 * 0.8), 'meta por linha');
perto(pl.coberturaPct, Math.round(3900 / 4600 * 1000) / 10, 'cobertura: SKU sem pontos e sem SKU entram no denominador');
eq(pl.batida, false, '98.700 < 129.600');
// Dia de mix de margem baixa: meta acompanha.
const baixo = P.placarDoDia({ dia: 'd', producao: { porLinha: { 'Linha 2': { B: 2700 } }, semSku: 0, total: 2700 }, tabela, ritmos, alvoPct: 80, horasDia: 9 });
eq(baixo.batida, true, 'linha no ritmo com produto de margem baixa bate a meta');
// Horas programadas da linha (programa reduzido) mudam a meta.
const prog = P.placarDoDia({ dia: 'd', producao: { porLinha: { 'Linha 2': { B: 900 } }, semSku: 0, total: 900 }, tabela, ritmos, alvoPct: 100, horasDia: 9, horasPorLinha: { 'Linha 2': 3 } });
eq(prog.meta, 9000, '3 h programadas × 300 × 10');
const vazioDia = P.placarDoDia({});
eq(vazioDia.meta, 0, 'dia vazio: meta 0');
eq(vazioDia.pct, null, 'e sem %');

// ── 8. Descontos por dia ──────────────────────────────────────────────────
const tabDia = () => tabela;
const ds = P.descontosPorDia({
  tabelaDoDia: tabDia, idxOps: R.indexarOps({ o: { lote: 'L1', sku: 'A' }, o2: { lote: 'L2', sku: 'B' } }),
  ops: { o: { lote: 'L1', sku: 'A' }, o2: { lote: 'L2', sku: 'B' } },
  perdas: { L1: { p: { lote: 'L1', data: '2026-09-01', perdas: [{ tipo: 'Frascos', quantidade: 4 }, { tipo: 'Rótulos', quantidade: 2 }] } } },
  retrabalhos: { r: { sku: 'B', apontamentos: { a: { fim: '2026-09-02T10:00:00Z', quantidade: 50 }, b: { fim: '2026-09-02T11:00:00Z', quantidadePendente: true } } } },
  apontamentos: [{ dia: '2026-09-01', linha: 'Linha 1', lote: 'L1', quantidade: 600 }, { dia: '2026-09-02', linha: 'Linha 1', lote: 'L1', quantidade: 400 },
    { dia: '2026-09-03', linha: 'Linha 2', lote: 'L2', quantidade: 100 }],
  estoqueLotes: { a: { pa1: { origemTipo: 'conferencia_pa', opKey: 'o', qtdOriginal: 1000, qualidade: { decisao: 'REPROVADO' } } } },
  conferenciasPa: { o2: { divergencia: -20 } },
  ativos: { loteReprovado: true, divergenciaPA: true }
});
eq(ds['2026-09-01'].perdas, 4 * 30, 'perda: 4 unidades (maior tipo) × 30');
eq(ds['2026-09-02'].retrabalho, 50 * 10, 'retrabalho confirmado × pontos; pendente não conta');
eq(ds['2026-09-01'].loteReprovado, 600 * 30, 'lote reprovado sai do dia em que foi contado (600 no dia 1)');
eq(ds['2026-09-02'].loteReprovado, 400 * 30, '... e 400 no dia 2');
eq(ds['2026-09-03'].divergenciaPA, 20 * 10, 'apontado 20 acima do contado: sai no último dia do lote');
const dsPadrao = P.descontosPorDia({ tabelaDoDia: tabDia, idxOps: R.indexarOps({ o: { lote: 'L1', sku: 'A' } }), ops: { o: { lote: 'L1', sku: 'A' } },
  apontamentos: [{ dia: '2026-09-01', linha: 'Linha 1', lote: 'L1', quantidade: 600 }],
  estoqueLotes: { a: { pa1: { origemTipo: 'conferencia_pa', opKey: 'o', qualidade: { decisao: 'REPROVADO' } } } } });
ok(!dsPadrao['2026-09-01'], 'proposto (lote reprovado) fica desligado por padrão');

// ── 9. Semana, mês e bônus ────────────────────────────────────────────────
eq(P.semanaISO('2026-09-21'), '2026-W39', 'semana ISO');
eq(P.semanaISO('2026-01-01'), '2026-W01', 'virada de ano');
eq(P.semanaISO('2027-01-01'), '2026-W53', '1º/01/2027 (sexta) ainda é a W53 de 2026');
const dias = [{ dia: '2026-09-21', pontos: 80, meta: 100, unidades: 1, unidadesComPontos: 1, batida: false }, { dia: '2026-09-22', pontos: 130, meta: 100, unidades: 1, unidadesComPontos: 1, batida: true },
  { dia: '2026-09-28', pontos: 90, meta: 100, unidades: 1, unidadesComPontos: 1, batida: false }, { dia: '2026-09-29', pontos: 50, meta: 0, unidades: 1, unidadesComPontos: 0 }];
const sem = P.acumular(dias, 'semana');
eq(sem.length, 2, 'duas semanas (dia sem meta não entra)');
eq(sem[0].batida, true, 'semana soma: um dia ruim compensa com um bom (210 ≥ 200)');
eq(P.acumular(dias, 'mes')[0].pct, 100, 'mês: 300 / 300');
const faixas = [{ pct: 100, mult: 1 }, { pct: 110, mult: 1.2 }, { pct: 120, mult: 1.5 }];
eq(P.bonusDoMes({ base: 1000, faixas, pctMes: 99.9 }).valor, 0, 'abaixo de 100%: sem bônus');
eq(P.bonusDoMes({ base: 1000, faixas, pctMes: 112 }).valor, 1200, 'faixa de 110%');
eq(P.bonusDoMes({ base: 1000, faixas, pctMes: 200, tetoPct: 115 }).valor, 1200, 'teto: 200% conta como 115%');
eq(P.bonusDoMes({ base: 1000, faixas, pctMes: 100, semanasNoMes: 4, semanasComAcidente: 1 }).valor, 750, 'acidente zera a semana');
eq(P.bonusDoMes({ base: 1000, faixas, pctMes: 100, reducaoReclamacaoPct: 50 }).valor, 500, 'reclamação com causa na fábrica: −50%');
eq(P.bonusDoMes({ faixas, pctMes: 100 }).valor, null, 'sem base: null, não zero');

// ── 10. Placar do período (orquestração do servidor e da simulação) ───────
const periodo = P.placarDoPeriodo({ registros, ops, produtos: {}, tabelas: { '2026-09': { porSku: { A: { pontos: 30 }, B: { pontos: 10 } } } },
  ritmos: { A: { valor: 600 }, B: { valor: 600 } }, alvoPct: 100, horasDoDia: () => 9, programa: { '2026-09-02': { 'Linha 1': 1 } } });
eq(periodo.length, 2, 'dois dias com apontamento datado');
eq(periodo[0].pontosBrutos, 1000 * 30 + 600 * 10, 'dia 1: só envase (rotulagem/celofane fora)');
eq(periodo[0].unidades, 1000 + 600 + 50, 'dia 1: unidades de envase, inclusive as sem SKU');
eq(periodo[1].meta, 600 * 30, 'dia 2: 1 h programada na Linha 1 × 600 × 30');
const semTabela = P.placarDoPeriodo({ registros, ops, tabelas: {} });
ok(semTabela.every((d) => d.indisponivel), 'mês sem tabela congelada: placar indisponível, nunca zero');
const sim = P.resumoSimulacao(periodo, { bonusBase: 1000, faixas, tetoPct: 130 });
eq(sim.dias, 2, 'simulação: dias com meta');
ok(sim.meses.length === 1 && sim.bonus.length === 1, 'simulação: mês e bônus');
eq(P.resumoSimulacao([], {}).diasBatidosPct, null, 'simulação vazia: sem %');

console.log(`OK resultado: ${n} asserções — realizado por horas apontadas (nunca duração de OP), perdas pelo maior tipo, consumo valorizado e variações, consolidação, tabela de pontos, meta ajustada ao mix, descontos por dia, semana/mês e bônus em faixas com portões.`);
