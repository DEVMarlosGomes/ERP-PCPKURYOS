'use strict';
/* 11–12/11/2026, pedido do Marlos (pontos 2, 3 e 5):
   - a fila de MP nova do P&D chegava sem o SKU de aprovação, que a fragrância (MPES) exige: o salvar parava
     ("não está salvando") — o código da amostra já vem no nome e passa a ser sugerido;
   - a fila mostra quanto a MP foi usada em cada amostra;
   - a OP do PRF-BIOF-0008 seguia na v1 (MICA GOLD 33) porque o BOM da v2 estava em rascunho, sem aviso. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const S = require('./public/shared/sku-entrada.js');

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n += 1; };

// ── Código da amostra no nome ──────────────────────────────────────────
eq(S.codigoAmostraDoNome('FRAGRANCIA YARA - GF48244'), 'GF48244');
eq(S.codigoAmostraDoNome("J'ADORE - FAV374566 - GLAM"), 'FAV374566', 'o código no meio, nome depois');
eq(S.codigoAmostraDoNome('LOVE SPELL - FAV374574 - ENERGY'), 'FAV374574');
eq(S.codigoAmostraDoNome('Fragrância Uva C02704-00062'), 'C02704-00062', 'código com hífen e acento no nome');
eq(S.codigoAmostraDoNome('ESSENCIA ASAD - FAV 380759'), 'FAV380759', 'espaço entre letras e número');
eq(S.codigoAmostraDoNome('ESSENCIA HOT BERRY AROMATY - SHP2972'), 'SHP2972');
eq(S.codigoAmostraDoNome('ESSENCIA ADVENTURE GF51747'), 'GF51747');
eq(S.codigoAmostraDoNome('FRAGRANCIA ROYAL  AMBER - GF48243'), 'GF48243');
eq(S.codigoAmostraDoNome('ESSENCIA DE LAVANDA'), '', 'sem código, não inventa');
eq(S.codigoAmostraDoNome('FRASCO 24/410 200ML'), '', 'medida não é código');
eq(S.codigoAmostraDoNome(''), '');
eq(S.codigoAmostraDoNome(null), '');

// A fila preenche o SKU sugerido só na fragrância.
eq(S.dadosParaFormulario({tipo: 'MPES', nome: 'FRAGRANCIA FAKHAR - FAV380757'}).skuAprovacaoSugerido, 'FAV380757');
eq(S.dadosParaFormulario({tipo: 'MPGR', nome: 'EXTRATO X AB1234'}).skuAprovacaoSugerido, '', 'MP Geral não exige SKU de aprovação');
// Com o sugerido, o salvar passa (antes devolvia o erro do SKU de aprovação).
ok(!S.aplicar({}, {aprovacao: 'FAV380757'}, 'MPES', 'Adlai', '2026-11-12T10:00:00Z').erro);
ok(/SKU de aprovação/.test(S.aplicar({}, {aprovacao: ''}, 'MPES', 'Adlai', '2026-11-12T10:00:00Z').erro), 'sem SKU continua barrando');

// ── Quanto usou em cada amostra ────────────────────────────────────────
const sol = {
  origem: {amostra: '', projetoNumero: '2026-040'},
  origens: {
    'f1__i08': {amostra: '2026-040-A1-a', projetoNumero: '2026-040', projeto: 'Body Care', cliente: 'Vivai', percentual: 4.2, ativa: true},
    'lote__i08': {amostra: '2026-040-A1-a', origemLote: 'LM-2026-040-1', projetoNumero: '2026-040', ativa: true},
    'f2__i03': {amostra: '2026-040-A1-b', projetoNumero: '2026-040', ativa: true},
    'f3__i01': {amostra: '2026-040-A1-c', percentual: 3, ativa: false},
  },
};
const usos = S.usosDaSolicitacao(sol);
eq(usos.length, 2, 'mesma amostra pela fórmula e pelo lote conta uma vez; origem retirada sai');
eq(usos[0].amostra, '2026-040-A1-a');
eq(usos[0].percentual, 4.2);
eq(usos[1].percentual, null, 'sem percentual gravado: null, nunca zero');
eq(S.usosDaSolicitacao({origem: {amostra: 'X-1', percentual: 2}}).map((u) => u.percentual), [2], 'registro antigo sem origens usa a origem');
eq(S.usosDaSolicitacao({origens: {a: {amostra: 'Y', percentual: 0}}})[0].percentual, null, 'zero não é uso');
// Origem do lote sem amostra (como na base: "lote_…__i16") não duplica a linha da amostra.
eq(S.usosDaSolicitacao({origens: {f__i: {amostra: '2026-034-A1-c', percentual: 25}, lote_x__i16: {amostra: '', projetoNumero: '2026-034', percentual: 25}}}).length, 1);
eq(S.usosDaSolicitacao({origens: {lote_x__i11: {amostra: '', projetoNumero: '2026-041', projeto: 'Linha', percentual: 0.3}}}),
  [{amostra: '', projeto: '2026-041 Linha', cliente: '', percentual: 0.3}], 'única origem, mesmo sem amostra, aparece');

// ── Versão mais nova que ainda não vai para a OP ───────────────────────
const ctx = {console: {log() {}, warn() {}, error() {}}, window: {}, document: undefined, setTimeout, Promise};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('public/shared/utils.js', 'utf8'), ctx, {filename: 'utils.js'});
const A = 'APROVADA', R = 'RASCUNHO';
const formulas = {
  'PRF-BIOF-0008__v1': {codProduto: 'PRF-BIOF-0008', versao: 'v1', status: A},
  'PRF-BIOF-0008__v2': {codProduto: 'PRF-BIOF-0008', versao: 'v2', status: A},
  'OUTRO__v1': {codProduto: 'OUTRO', versao: 'v1', status: A},
};
const bom = {'PRF-BIOF-0008__v1': {status: A}, 'PRF-BIOF-0008__v2': {status: R}, 'OUTRO__v1': {status: A}};
const espec = {'PRF-BIOF-0008__v1': {status: A}, 'PRF-BIOF-0008__v2': {status: A}, 'OUTRO__v1': {status: A}};
const plain = (x) => JSON.parse(JSON.stringify(x));

const achado = ctx.melhorFormulaDoProduto('PRF-BIOF-0008', formulas, bom, espec);
eq(achado.registro.versao, 'v1', 'a OP usa a v1 (a última com as 3 aprovadas) — o caso relatado');
eq(plain(ctx.versoesMaisNovasPendentes('PRF-BIOF-0008', 'v1', formulas, bom, espec)), [{versao: 'v2', faltando: ['BOM']}], 'avisa a v2 e o que falta');
eq(plain(ctx.versoesMaisNovasPendentes('PRF-BIOF-0008', 'v2', formulas, bom, espec)), [], 'nada mais novo que a v2');
eq(plain(ctx.versoesMaisNovasPendentes('OUTRO', 'v1', formulas, bom, espec)), [], 'produto em dia: sem aviso');
const semNada = Object.assign({}, formulas, {'PRF-BIOF-0008__v3': {codProduto: 'PRF-BIOF-0008', versao: 'v3', status: R}});
eq(plain(ctx.versoesMaisNovasPendentes('PRF-BIOF-0008', 'v1', semNada, bom, espec)),
  [{versao: 'v3', faltando: ['Fórmula', 'BOM', 'Especificação']}, {versao: 'v2', faltando: ['BOM']}], 'mais nova primeiro; componente ausente conta como falta');
const comV3Pronta = Object.assign({}, semNada, {'PRF-BIOF-0008__v3': {codProduto: 'PRF-BIOF-0008', versao: 'v3', status: A}});
eq(ctx.melhorFormulaDoProduto('PRF-BIOF-0008', comV3Pronta, Object.assign({}, bom, {'PRF-BIOF-0008__v3': {status: A}}),
  Object.assign({}, espec, {'PRF-BIOF-0008__v3': {status: A}})).registro.versao, 'v3', 'aprovou as 3: a OP passa para a nova');
eq(plain(ctx.versoesMaisNovasPendentes('PRF-BIOF-0008', 'V1', formulas, bom, espec)), [{versao: 'v2', faltando: ['BOM']}], 'V1 x v1 não confunde');
eq(plain(ctx.versoesMaisNovasPendentes('NADA', 'v1', formulas, bom, espec)), []);

console.log('run_fila_mp_versao_test: ' + n + ' verificações OK');
