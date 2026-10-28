'use strict';
/* Testes do motor de custo v2 (public/shared/custos.js, PLANO_CUSTOS_RESULTADO.md):
   origem do preço com maturidade, densidade pela especificação, ficha padrão,
   LP padrão e do orçamento, taxas da competência, horas úteis e ritmo
   conservador. Cobre o estado VAZIO e o PARCIAL, além do completo (Regra 6). */
const assert = require('node:assert/strict');
const C = require('./public/shared/custos');

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { n++; assert.equal(a, b, msg); };
const perto = (a, b, msg, tol = 1e-6) => { n++; assert.ok(a != null && Math.abs(a - b) <= tol, msg + ` (esperado ${b}, veio ${a})`); };
const finitoOuNull = (v) => v === null || (typeof v === 'number' && isFinite(v));

// ── 1. Número brasileiro e densidade da especificação ─────────────────────
eq(C.numBR('0,9'), 0.9, 'vírgula decimal');
eq(C.numBR('1.250,5'), 1250.5, 'milhar com ponto');
eq(C.numBR(''), null, 'vazio é null, não zero');
eq(C.numBR(0.85), 0.85, 'número passa');
const spec = (item) => ({ itens: { a: { ensaio: 'ASPECTO' }, b: Object.assign({ ensaio: 'DENSIDADE' }, item) } });
eq(C.densidadeDaEspecificacao(spec({ minimo: '0,9', maximo: '1,0' })).valor, 1, 'usa o MÁXIMO da faixa (conservador)');
eq(C.densidadeDaEspecificacao(spec({ especificacaoTexto: '0,85 - 0,95' })).valor, 0.95, 'faixa só no texto');
eq(C.densidadeDaEspecificacao(spec({ minimo: 0.83, maximo: 0.89 })).valor, 0.89, 'faixa numérica');
ok(!C.densidadeDaEspecificacao(spec({ maximo: '50g' })).ok, '50 não é densidade de cosmético');
ok(!C.densidadeDaEspecificacao({ itens: { a: { ensaio: 'PH' } } }).ok, 'sem ensaio de densidade');
ok(!C.densidadeDaEspecificacao(null).ok, 'sem especificação');

// ── 2. Versão que o custo usa ──────────────────────────────────────────────
const formulas = {
  X__v1: { codProduto: 'X', versao: 'v1', status: 'APROVADA', itens: { a: { mpCodigo: 'MPGR-1', percentualMM: 100 } } },
  X__v2: { codProduto: 'X', versao: 'v2', status: 'RASCUNHO', itens: {} },
  Y__v1: { codProduto: 'Y', versao: 'v1', status: 'RASCUNHO', itens: {} },
  Y__v3: { codProduto: 'Y', versao: 'v3', status: 'RASCUNHO', itens: {} }
};
const bom = { X__V1: { codProduto: 'X', versao: 'V1', status: 'APROVADA', itens: {} }, Z__v2: { codProduto: 'Z', versao: 'v2', itens: {} }, Z__v1: { codProduto: 'Z', versao: 'v1', itens: {} } };
let v = C.versaoParaCusto('X', formulas, bom, {});
eq(v.versao, 'v1', 'aprovada vence a mais nova em rascunho');
ok(v.aprovada.formula && v.bom && v.aprovada.bom, 'BOM da mesma versão, sem diferenciar maiúsculas (V1 x v1)');
eq(C.versaoParaCusto('Y', formulas, bom, {}).versao, 'v3', 'sem aprovada: a mais recente');
eq(C.versaoParaCusto('Z', formulas, bom, {}).versao, 'v2', 'sem fórmula: BOM mais recente');
eq(C.versaoParaCusto('NADA', formulas, bom, {}).versao, null, 'SKU sem nada');

// ── 3. Preço por unidade de ESTOQUE do PC e da cotação (o erro de 11,67x) ──
const celofane = { custoTotalNaDecisao: 2100, precoUnit: 60, qtd: 3, qtdCotada: 35, qtdEmUnidadeEstoque: 3, unidade: 'rolo', unidadeCotada: 'kg' };
perto(C.custoUnitarioItemPC(celofane).valor, 700, 'R$ 2.100 / 3 rolos = R$ 700 o rolo, não R$ 60');
eq(C.custoUnitarioItemPC(celofane).unidade, 'ROLO', 'unidade do estoque');
eq(C.custoUnitarioItemPC({ precoUnit: 2, qtd: 10, unidade: 'un' }).valor, 2, 'mesma unidade: preço unitário');
eq(C.custoUnitarioItemPC({ precoUnit: 60, qtd: 3, unidade: 'rolo', unidadeCotada: 'kg' }).valor, null, 'unidades diferentes sem total: recusa');
eq(C.custoUnitarioItemPC({}).valor, null, 'item sem preço');
perto(C.custoUnitarioRespostaCotacao({ precoUnit: 60, qtdCotada: 35 }, { qtd: 3, unidade: 'rolo' }).valor, 700, 'cotação: mesma conta');

// ── 4. Origem do preço: maturidade, histórico, erro da estimativa do P&D ──
const materiais = {
  agua: { mpCodigo: 'MPGR-00132', mpNome: 'ÁGUA', tipo: 'MPGR', unidade: 'kg' },
  alcool: { mpCodigo: 'MPGR-00127', mpNome: 'ALCOOL 96', tipo: 'MPGR', unidade: 'kg' },
  frasco: { mpCodigo: 'EP-00001', mpNome: 'FRASCO 200ML', tipo: 'EP', unidade: 'un' },
  rotulo: { mpCodigo: 'ET-00001', mpNome: 'RÓTULO', tipo: 'ET', unidade: 'un' },
  caixa: { mpCodigo: 'ES-00001', mpNome: 'CAIXA', tipo: 'ES', unidade: 'un' }
};
const idx = C.indexarMateriais(materiais);
const baseP = {
  materiais,
  pedidos_compra: {
    pc1: { status: 'RECEBIDO_TOTAL', numeroFormatado: 'PC-0001', dataEmissao: '2026-09-01', itens: { i: { materialCodigo: 'EP-00001', precoUnit: 1.5, qtd: 100, unidade: 'un' } } },
    pc2: { status: 'CANCELADO', itens: { i: { materialCodigo: 'ET-00001', precoUnit: 99, qtd: 1, unidade: 'un' } } }
  },
  processos_cotacao: {
    c1: { status: 'DECIDIDO', numeroFormatado: 'COT-1', fornecedorVencedorConvidadoKey: 'f2', itens: { i: { materialCodigo: 'EP-00001', qtd: 100, unidade: 'un' }, j: { materialCodigo: 'ET-00001', qtd: 10, unidade: 'un' } },
      fornecedoresConvidados: {
        f1: { status: 'RESPONDIDO', respondidoEm: '2026-08-01', respostaItens: { i: { precoUnit: 1.2 }, j: { precoUnit: 0.3 } } },
        f2: { status: 'RESPONDIDO', respondidoEm: '2026-08-02', respostaItens: { i: { precoUnit: 1.4 }, j: { precoUnit: 0.2 } } } } }
  },
  custos_precos: { alcool: { valor: 9, unidade: 'kg', em: '2026-10-01', historico: { h1: { valor: 8, unidade: 'kg', em: '2026-09-01' } } } },
  pd_formula_items: {
    p1: { ingredient_name: 'Água deionizada', price_per_kg: 0.05, created_at: '2026-07-01' },
    p2: { ingredient_name: 'Alcool etilico', price_per_kg: 7.5, updated_at: '2026-10-20' },
    p3: { ingredient_name: 'Excluído', price_per_kg: 99, is_deleted: true, material_code: 'MPGR-00132' }
  }
};
const depara = { [C.depKey('Água deionizada')]: { materialCodigo: 'MPGR-00132' }, [C.depKey('Alcool etilico')]: { materialCodigo: 'MPGR-00127' } };
const precos = C.resolverPrecos(C.fontesDePreco(baseP, idx, depara));
eq(precos.frasco.fonte, 'PAGO', 'PAGO vence a cotação');
eq(precos.frasco.valor, 1.5, 'valor do PC');
eq(precos.frasco.historico.length, 2, 'a cotação fica no histórico (substituir não apaga)');
eq(precos.rotulo.fonte, 'COTADO', 'PC cancelado não conta');
eq(precos.rotulo.valor, 0.2, 'decidida: vale a VENCEDORA, não a mais barata');
eq(precos.alcool.fonte, 'MANUAL', 'MANUAL vence a estimativa do P&D');
eq(precos.alcool.valor, 9, 'manual vigente, não o do histórico');
eq(precos.alcool.historico.length, 3, 'manual atual + manual antigo + estimativa do P&D');
perto(precos.alcool.desvioEstimativaPd.pct, 20, 'P&D estimou 7,50, vale 9,00: errou 20% para baixo');
eq(precos.agua.fonte, 'ESTIMADO_PD', 'só a estimativa do P&D (item excluído não entra)');
eq(precos.agua.valor, 0.05, 'R$/kg do P&D');
ok(!precos.caixa, 'sem fonte nenhuma: sem preço, não zero');
const semDepara = C.resolverPrecos(C.fontesDePreco(baseP, idx, {}));
ok(!semDepara.agua, 'ingrediente do P&D sem de-para confirmado não vira preço');
const ignorado = C.resolverPrecos(C.fontesDePreco(baseP, idx, { [C.depKey('Água deionizada')]: { ignorar: true, materialCodigo: 'MPGR-00132' } }));
ok(!ignorado.agua, 'de-para marcado "ignorar" não vira preço');
// Cotação aberta: a MAIS CARA das respostas (conservador).
const aberta = C.resolverPrecos(C.fontesDePreco({ materiais, processos_cotacao: { c: { status: 'ABERTO', itens: { i: { materialCodigo: 'ES-00001', qtd: 1, unidade: 'un' } },
  fornecedoresConvidados: { a: { status: 'RESPONDIDO', respostaItens: { i: { precoUnit: 1 } } }, b: { status: 'RESPONDIDO', respostaItens: { i: { precoUnit: 3 } } } } } } }, idx, {}));
eq(aberta.caixa.valor, 3, 'cotação aberta: a resposta mais cara');

// Sugestão de de-para: nome exato no topo; só matéria-prima.
const sug = C.sugerirDeparaPd('Água', '', materiais);
eq(sug[0].codigo, 'MPGR-00132', 'nome exato primeiro');
ok(sug.every((s) => /^MP/.test(s.codigo)), 'nunca sugere embalagem');

// ── 5. Ritmo conservador ───────────────────────────────────────────────────
const produtosR = {
  a: { sku: 'A', prodHoraRef: 600, categoria: 'PERF', subcategoria: 'BS', volume: 200 },
  b: { sku: 'B', prodHoraRef: 600 },
  c: { sku: 'C', categoria: 'PERF', subcategoria: 'BS', volume: 200 },
  d: { sku: 'D' }
};
const opsR = { o1: { sku: 'A', mediaPorHora: 400, produzido: 1, dataFimReal: '2026-09-01' }, o2: { sku: 'A', mediaPorHora: 500, produzido: 1, dataFimReal: '2026-09-02' },
  o3: { sku: 'B', mediaPorHora: 900, produzido: 1, dataFimReal: '2026-09-02' }, o4: { sku: 'B', mediaPorHora: 100, produzido: 1, dataFimReal: '2024-01-01' } };
const rit = C.ritmosPorSku(produtosR, opsR, '2025-10-01');
eq(rit.A.valor, 450, 'histórico (mediana 450) abaixo do cadastro (600): vale o MENOR');
eq(rit.A.origem, 'HISTORICO', 'origem declarada');
eq(rit.B.valor, 600, 'histórico acima do cadastro: vale o cadastro (OP antiga fora do período)');
eq(rit.C.origem, 'GRUPO', 'sem nada: mediana do grupo parecido');
eq(rit.D.origem, 'PLANTA', 'sem grupo: mediana da planta');

// ── 6. Horas úteis do turno ────────────────────────────────────────────────
const config = { turnoHorarios: { Padrao: '07:00' }, turnoHorariosFim: { Padrao: '17:00' }, turnoHorariosFimSexta: { Padrao: '16:00' },
  turnoPausas: { Padrao: { inicio: '12:00', fim: '13:00' } }, planejamento: { diasSemana: [1, 2, 3, 4, 5], feriados: ['2026-09-07'] } };
eq(C.horasDoDia(config, '2026-09-08'), 9, 'terça: 07–17 menos 1 h de pausa');
eq(C.horasDoDia(config, '2026-09-11'), 8, 'sexta: até as 16');
eq(C.horasDoDia(config, '2026-09-12'), 0, 'sábado');
eq(C.horasDoDia(config, '2026-09-07'), 0, 'feriado');
eq(C.horasDoDia({}, '2026-09-08'), null, 'sem turno configurado: null, não zero');
const tu = C.turnoDoDia(config, '2026-09-11');
ok(tu && tu.inicioTxt && tu.fimTxt === '16:00', 'turno da sexta: fim às 16:00 para a contagem da TV');
ok(C.turnoDoDia(config, '2026-09-12').folga === true, 'sábado: folga, sem contagem');
eq(C.turnoDoDia({}, '2026-09-08'), null, 'sem turno: null');
const bomDe = C.bomAprovadaDoSku({ p1: { sku: 'X1', perdaLinhaPct: 3 }, p2: { sku: 'X2' } }, {},
  { 'X1__1': { codProduto: 'X1', versao: '1', status: 'APROVADA', itens: { a: { materialCodigo: 'FR-1', qtdPorPeca: 1 } } },
    'X2__1': { codProduto: 'X2', versao: '1', status: 'RASCUNHO', itens: { a: { materialCodigo: 'FR-1', qtdPorPeca: 1 } } } }, {});
ok(bomDe('x1') && bomDe('x1').perdaLinhaPct === 3 && bomDe('X1').itens.a.materialCodigo === 'FR-1', 'BOM aprovada com a perda de linha do cadastro');
eq(bomDe('X2'), null, 'BOM em rascunho não confere consumo');
const set = C.horasUteisDoMes(config, '2026-09');
eq(set.diasUteis, 21, 'setembro/2026: 22 dias de semana menos o feriado');
eq(set.horasUteis, 21 * 9 - 4, '17 dias de 9 h + 4 sextas de 8 h');
ok(!C.horasUteisDoMes({}, '2026-09').ok, 'sem turno: mês indisponível');

// ── 7. Taxas da competência ────────────────────────────────────────────────
const taxa = C.taxasDaCompetencia({ operacao: { folhaProducao: 55500, fixos: { a: { valor: 11100, rateio: 'PRODUCAO' }, b: { valor: 20000, rateio: 'ADMINISTRATIVO' } },
  custoHoraLinha: { 'Linha 01': 150 } }, horasUteis: 185, linhasAtivas: 3, horasPadraoRealizadas: 222 });
perto(taxa.custoHoraDireta, 100, 'folha 55.500 / 555 hora-linha disponível = R$ 100/h (ociosidade fora do LP)');
perto(taxa.ocupacaoPct, 40, '222 horas-padrão / 555 = 40%');
perto(taxa.custoHoraPlena, (55500 + 11100) / 222, 'plena: (folha + fixos de PRODUÇÃO) / horas-padrão');
eq(taxa.custoHoraLinha['Linha 1'], 150, 'custo-hora digitado por linha, nome normalizado ("Linha 01" = "Linha 1")');
perto(taxa.custoFixoMensal, 11100 + 20000 + 55500 * 0.6, 'meta cobre fixos (produção + ADM) + a hora direta parada');
ok(taxa.custoHoraPlena * 222 < 55500 + 11100 + 20000 + 1, 'ADMINISTRATIVO nunca absorve em produto (Regra 4)');
const semFolha = C.taxasDaCompetencia({ operacao: { fixos: {} }, horasUteis: 185, linhasAtivas: 3, horasPadraoRealizadas: 100 });
eq(semFolha.custoHoraDireta, null, 'sem folha: custo-hora null, nunca zero');
ok(!semFolha.ok && semFolha.faltam.length, 'e diz o que falta');
const vazia = C.taxasDaCompetencia({});
ok(Object.keys(vazia).every((k) => typeof vazia[k] !== 'number' || isFinite(vazia[k])), 'estado vazio: nenhum NaN/Infinity');

// ── 8. Ficha padrão e LP ──────────────────────────────────────────────────
const produto = { sku: 'BS200', descricao: 'BODY SPLASH 200ML', clienteKey: 'CLI', volume: 200, unidadeVolume: 'ml', perdaProcessoPct: 2, perdaLinhaPct: 1, prodHoraRef: 600, lp: 1.35 };
const formulasF = { BS200__v1: { codProduto: 'BS200', versao: 'v1', status: 'APROVADA', itens: {
  a: { mpCodigo: 'MPGR-00132', percentualMM: 80 }, b: { mpCodigo: 'MPGR-00127', percentualMM: 20 } } } };
const bomF = { BS200__v1: { codProduto: 'BS200', versao: 'v1', status: 'APROVADA', itens: {
  a: { materialCodigo: 'EP-00001', qtdPorPeca: 1 }, b: { materialCodigo: 'ET-00001', qtdPorPeca: 1 }, c: { materialCodigo: 'ES-00001', qtdPorPeca: 0.0625 } } } };
const specF = { BS200__v1: { codProduto: 'BS200', versao: 'v1', status: 'APROVADA', itens: { d: { ensaio: 'DENSIDADE', minimo: '0,95', maximo: '1,00' } } } };
const precosF = {
  agua: { valor: 1, unidade: 'KG', fonte: 'PAGO' }, alcool: { valor: 11, unidade: 'KG', fonte: 'ESTIMADO_PD' },
  frasco: { valor: 1.5, unidade: 'UN', fonte: 'PAGO' }, rotulo: { valor: 0.2, unidade: 'UN', fonte: 'COTADO' }, caixa: { valor: 3.2, unidade: 'UN', fonte: 'MANUAL' }
};
const taxaF = { custoHoraDireta: 120, custoHoraLinha: {}, custoHoraPlena: 300 };
const args = { produto, formulas: formulasF, bom: bomF, especificacoes: specF, idxMateriais: idx, precos: precosF,
  taxa: taxaF, ritmo: { valor: 600, origem: 'CADASTRO' }, precoVenda: { valor: 10 }, impostosPct: 15 };
const f = C.fichaPadraoSku(args);
// granel: custo/kg = 0,8×1 + 0,2×11 = 3,00; massa sem perda = 0,2 L × 1,00 = 0,2 kg -> 0,60
perto(f.granel.custoPorKg, 3, 'custo do kg da fórmula');
eq(f.granel.densidade.origem, 'ESPECIFICACAO_MAX', 'densidade veio da especificação (produto sem densidade)');
perto(f.granel.custoPorPeca, 0.6, 'granel por peça SEM a perda');
perto(f.embalagem.custoPorPeca, 1.5 + 0.2 + 3.2 * 0.0625, 'embalagem = BOM × preço (caixa 1/16)');
perto(f.perdas.granel, 3 * 0.2 * 0.02, 'perda de processo: 2% do granel, em linha própria');
perto(f.perdas.embalagem, 1.9 * 0.01, 'perda de linha: 1% da embalagem');
perto(f.operacao.custoPorPeca, 0.2, 'operação direta: R$ 120/h ÷ 600 peças/h');
const variavel = 0.6 + 1.9 + 0.012 + 0.019 + 0.2;
perto(f.custoVariavel, variavel, 'custo variável = granel + embalagem + perdas + operação');
perto(f.precoLiquido, 8.5, 'preço líquido de 15% de impostos');
perto(f.lp, 8.5 - variavel, 'LP = líquido − variável (custo fixo fora)');
perto(f.custoPleno, variavel - 0.2 + 0.5, 'custo pleno troca a hora direta pela plena (R$ 300/h ÷ 600)');
eq(f.lpInformado, 1.35, 'o LP digitado no Cadastros vem ao lado, como referência');
ok(f.completo, 'ficha completa');
perto(Object.values(f.composicaoProcedencia).reduce((s, x) => s + x, 0), 100, 'composição por procedência soma 100%');
perto(f.composicaoProcedencia.ESTIMADO_PD, 0.44 / 2.5 * 100, 'P&D responde pelo álcool: 0,44 de 2,50 de material');
eq(f.pendencias.length, 0, 'sem pendência');

// Parcial: a caixa sem preço -> partes ficam, total e LP somem.
const semCaixa = Object.assign({}, precosF); delete semCaixa.caixa;
const fp = C.fichaPadraoSku(Object.assign({}, args, { precos: semCaixa }));
eq(fp.custoMaterial, null, 'parcial: SEM total de material');
eq(fp.lp, null, 'parcial: SEM LP');
perto(fp.granel.custoPorPeca, 0.6, 'parcial: o granel continua visível');
ok(fp.pendencias.some((p) => p.tipo === 'PRECO_MATERIAL' && p.codigo === 'ES-00001'), 'parcial: a caixa aparece na lista do que falta');

// Material do cliente: zero de verdade, carimbado.
const fc = C.fichaPadraoSku(Object.assign({}, args, { precos: semCaixa, materialCliente: { caixa: true } }));
ok(fc.completo, 'caixa fornecida pelo cliente fecha a ficha');
perto(fc.embalagem.custoPorPeca, 1.7, 'caixa do cliente custa zero');
ok(fc.composicaoProcedencia.CLIENTE === undefined, 'zero não pesa na composição');

// Sem impostos / sem preço de venda / sem taxa: LP null, com pendência.
eq(C.fichaPadraoSku(Object.assign({}, args, { impostosPct: null })).lp, null, 'sem % de impostos: LP null (não supõe 0%)');
ok(C.fichaPadraoSku(Object.assign({}, args, { precoVenda: { valor: null, motivo: 'x' } })).pendencias.some((p) => p.tipo === 'PRECO_VENDA'), 'sem preço de venda: pendência');
const ft = C.fichaPadraoSku(Object.assign({}, args, { taxa: null }));
eq(ft.lp, null, 'sem custo-hora: sem LP');
ok(ft.custoMaterial != null, 'mas o material segue calculado');
eq(C.fichaPadraoSku(Object.assign({}, args, { taxa: { custoHoraDireta: 120, custoHoraLinha: { 'Linha 2': 240 } }, linha: 'Linha 02' })).operacao.custoPorPeca, 0.4, 'custo-hora da linha do SKU tem precedência');

// Sem densidade em lugar nenhum: custo do kg sai, por peça não.
const fd = C.fichaPadraoSku(Object.assign({}, args, { especificacoes: {} }));
perto(fd.granel.custoPorKg, 3, 'sem densidade: custo do kg calcula');
eq(fd.granel.custoPorPeca, null, 'sem densidade: custo por peça não');
ok(fd.pendencias.some((p) => p.tipo === 'DENSIDADE'), 'e o motivo aparece');
const fneg = C.fichaPadraoSku(Object.assign({}, args, { produto: Object.assign({}, produto, { densidadeGranel: -1 }), especificacoes: {} }));
eq(fneg.granel.custoPorPeca, null, 'densidade -1 (marcador de importação) nunca gera número');

// ESTADO VAZIO: nenhum preço cadastrado.
const fv = C.fichaPadraoSku(Object.assign({}, args, { precos: {} }));
eq(fv.custoMaterial, null, 'vazio: sem total');
eq(fv.granel.custoPorKg, null, 'vazio: custo/kg null, não 0');
eq(fv.embalagem.custoPorPeca, null, 'vazio: embalagem null, não 0');
eq(fv.lp, null, 'vazio: sem LP');
ok(['custoMaterial', 'custoVariavel', 'custoPleno', 'lp', 'margemPct'].every((k) => finitoOuNull(fv[k])), 'vazio: nada NaN/Infinity');
const fnada = C.fichaPadraoSku({ produto: { sku: 'Q' } });
ok(fnada.pendencias.some((p) => p.texto === 'sem fórmula') && fnada.pendencias.some((p) => p.texto === 'sem BOM'), 'SKU sem cadastro nenhum: diz o que falta');
eq(fnada.lp, null, 'e não inventa LP');

// Item de fórmula sem código: é CADASTRO, não "sem preço" (Regra 3).
const formSemCod = { BS200__v1: { codProduto: 'BS200', versao: 'v1', status: 'APROVADA', itens: { a: { mpCodigo: '', mpNome: 'ÁGUA', percentualMM: 100 } } } };
const fsc = C.fichaPadraoSku(Object.assign({}, args, { formulas: formSemCod }));
ok(fsc.pendencias.some((p) => p.tipo === 'CADASTRO' && /sem código/.test(p.texto)), 'item sem código = problema de cadastro');
const formOrfa = { BS200__v1: { codProduto: 'BS200', versao: 'v1', status: 'APROVADA', itens: { a: { mpCodigo: 'MPGR-99999', percentualMM: 100 } } } };
ok(C.fichaPadraoSku(Object.assign({}, args, { formulas: formOrfa })).pendencias.some((p) => p.tipo === 'CADASTRO' && p.codigo === 'MPGR-99999'), 'código órfão na fórmula: cadastro, não preço');

// ── 9. LP do orçamento ─────────────────────────────────────────────────────
const proposta = { id: 'P1', negociacao_status: 'aprovado', preco_unitario: 10, items_pedido: [{ codigo_kuryos: 'BS200' }],
  composicao: { resumo: { taxa: 5 }, insumos: [
    { codigo: 'MPGR-00132', preco: 1, qtd_por_unidade: 0.2, moeda: 'BRL', fornecido_por: 'kuryos' },
    { codigo: 'MPES-1', preco: 10, qtd_por_unidade: 0.01, moeda: 'USD', fornecido_por: 'kuryos' },
    { codigo: 'EP-1', preco: 2, qtd_por_unidade: 1, moeda: 'BRL', fornecido_por: 'cliente' } ] } };
const lo = C.lpOrcamento(proposta, { impostosPct: 10, operacaoPorPeca: 0.2 });
perto(lo.custoInsumos, 0.2 + 0.5, 'insumos: US$ pela taxa da cotação; o do cliente fora');
perto(lo.lp, 9 - 0.7 - 0.2, 'LP do orçamento = líquido − insumos − operação padrão');
eq(lo.sku, 'BS200', 'ligado à SKU pelo código Kuryos');
const loSemCambio = C.lpOrcamento(Object.assign({}, proposta, { composicao: { insumos: proposta.composicao.insumos } }), { impostosPct: 10, operacaoPorPeca: 0.2 });
eq(loSemCambio.lp, null, 'US$ sem câmbio: sem LP do orçamento');
eq(C.lpOrcamento({}, {}).lp, null, 'orçamento vazio: null');

// ── 10. Preço de venda vigente e impostos ──────────────────────────────────
const pv = { vigencias: { a: { preco: 2, inicio: '2026-01-01' }, b: { preco: 3, inicio: '2026-07-01' }, c: { preco: 9, inicio: '2027-01-01' } } };
eq(C.precoVendaVigente(pv, '2026-08-01').valor, 3, 'vigência mais recente já iniciada');
eq(C.precoVendaVigente(pv, '2026-03-01').valor, 2, 'na data passada, a de então');
eq(C.precoVendaVigente({}, '2026-08-01').valor, null, 'sem vigência: null');
eq(C.impostosPct({ impostosPct: 12, impostosPorCliente: { X: 4 } }, 'X'), 4, 'por cliente vence o padrão');
eq(C.impostosPct({ impostosPct: 12 }, 'Y'), 12, 'padrão');
eq(C.impostosPct({}, 'Y'), null, 'não informado: null');

// ── 11. Contexto montado da base (estado vazio e cobertura) ───────────────
const ctxVazio = C.montarContextoCustos({});
eq(Object.keys(ctxVazio.precos).length, 0, 'base vazia: nenhum preço');
eq(ctxVazio.ficha('QUALQUER'), null, 'SKU inexistente: null');
const ctx = C.montarContextoCustos({ materiais, produtos: { p: produto }, formulas: formulasF, bom: bomF, especificacoes: specF,
  custos_precos: { agua: { valor: 1, unidade: 'kg' }, alcool: { valor: 11, unidade: 'kg' }, frasco: { valor: 1.5, unidade: 'un' }, rotulo: { valor: 0.2, unidade: 'un' }, caixa: { valor: 3.2, unidade: 'un' } },
  precos_venda: { BS200: { sku: 'BS200', vigencias: { a: { preco: 10, inicio: '2026-01-01' } } } },
  custos: { parametros: { impostosPct: 15 } } }, { taxa: taxaF, hoje: '2026-10-26' });
const fx = ctx.ficha('bs200');
perto(fx.lp, 8.5 - variavel, 'contexto montado da base chega ao mesmo LP');
const cob = C.coberturaPorVolume({ BS200: fx, OUTRO: { completo: false } }, { BS200: 300, OUTRO: 700 });
perto(cob.coberturaPct, 30, 'cobertura em % do VOLUME, não de SKUs');

console.log(`OK custos v2: ${n} asserções — origem do preço com maturidade e histórico, densidade pela especificação, ritmo conservador, horas úteis, taxas (direta × plena, ADM fora), ficha padrão e LP, LP do orçamento, estados vazio e parcial.`);
