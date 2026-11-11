'use strict';
/* O que mudou entre versões de Fórmula/BOM/Especificação (public/shared/diff-versao.js, 10/11/2026). */
const assert = require('assert');
const D = require('./public/shared/diff-versao');

const v1 = {
  itemAjusteKey: 'i2',
  itens: {
    i1: {mpCodigo: 'MPGR-00003', mpNome: 'ÁLCOOL EXTRA NEUTRO', fase: 'A', ordemAdicao: 1, percentualMM: 64.71},
    i2: {mpCodigo: 'MPGR-00132', mpNome: 'ÁGUA', fase: 'A', ordemAdicao: 1, percentualMM: 24},
    i3: {mpCodigo: 'MPES-00224', mpNome: 'ESSENCIA HOT BERRY', fase: 'A', ordemAdicao: 1, percentualMM: 4.55},
    i4: {mpCodigo: 'MPGR-00061', mpNome: 'MICA GOLD 33', fase: 'A', ordemAdicao: 1, percentualMM: 0.09}
  }
};
const clone = (x) => JSON.parse(JSON.stringify(x));

// 1. Sem mudança: nada. Número igual escrito como texto ("24" vs 24) não conta.
{
  const v2 = clone(v1); v2.itens.i2.percentualMM = '24';
  assert.deepEqual(D.diffComponente('formulas', v1, v2), []);
}

// 2. Só quantidade; troca de matéria-prima (mesma chave); inclusão; remoção; QSP.
{
  const v2 = clone(v1);
  v2.itens.i1.percentualMM = 64.5;
  v2.itens.i3 = {mpCodigo: 'MPES-00300', mpNome: 'ESSENCIA AURORA', fase: 'A', ordemAdicao: 1, percentualMM: 4.76};
  delete v2.itens.i4;
  v2.itens.n1 = {mpCodigo: 'MPGR-00008', mpNome: 'GLICERINA', fase: 'B', ordemAdicao: 2, percentualMM: 0.09};
  v2.itemAjusteKey = 'i1';
  const d = D.diffComponente('formulas', v1, v2);
  const txt = d.map((m) => D.textoMudanca('formulas', m));
  assert.deepEqual(txt, [
    'MPGR-00003 — ÁLCOOL EXTRA NEUTRO: % m/m 64,71 → 64,5',
    'Trocado: MPES-00224 — ESSENCIA HOT BERRY por MPES-00300 — ESSENCIA AURORA (% m/m 4,55 → 4,76)',
    'Incluído: MPGR-00008 — GLICERINA',
    'Removido: MPGR-00061 — MICA GOLD 33',
    'Ajuste (QSP): MPGR-00132 — ÁGUA → MPGR-00003 — ÁLCOOL EXTRA NEUTRO'
  ]);
  assert.equal(d[1].tipo, 'TROCA');
}

// 3. BOM e especificação.
{
  const b1 = {itens: {e1: {materialCodigo: 'EM-001', materialNome: 'FRASCO 200ML', qtdPorPeca: 1}}};
  const b2 = {itens: {e1: {materialCodigo: 'EM-001', materialNome: 'FRASCO 200ML', qtdPorPeca: 2}}};
  assert.deepEqual(D.diffComponente('bom', b1, b2).map((m) => D.textoMudanca('bom', m)), ['EM-001 — FRASCO 200ML: qtd. por peça 1 → 2']);
  const s1 = {itens: {s1: {ensaio: 'pH', minimo: '5', maximo: '7', critico: false}}};
  const s2 = {itens: {s1: {ensaio: 'pH', minimo: '5,5', maximo: '7', critico: true}}};
  assert.deepEqual(D.diffComponente('especificacoes', s1, s2).map((m) => D.textoMudanca('especificacoes', m)),
    ['pH: mínimo 5 → 5,5; crítico não → sim']);
}

// 4. Versão inteira, contagem e resumo; registro vazio/ausente.
{
  const antes = {formulas: v1, bom: {itens: {}}, especificacoes: null};
  const depois = {formulas: clone(v1), bom: {itens: {e1: {materialCodigo: 'TP-01', materialNome: 'TAMPA'}}}, especificacoes: {}};
  depois.formulas.itens.i2.percentualMM = 23.9;
  const d = D.diffVersao(antes, depois);
  assert.equal(D.total(d), 2);
  assert.equal(D.resumoContagem(d), 'Fórmula: 1 alteração · BOM: 1 alteração');
  assert.equal(D.resumoContagem(D.diffVersao({}, {})), '');
}

// 5. A tela usa o motor: carrega o script, trava a aprovação com edição pendente e grava baseEdicao.
const tela = require('fs').readFileSync(require('path').join(__dirname, 'public/cadastros.html'), 'utf8');
assert.ok(tela.includes('<script src="shared/diff-versao.js"></script>'));
assert.ok(tela.includes("DiffVersao.diffComponente(tipo, reg.baseEdicao, reg)"));
assert.ok(!/liberarNovaVersao/.test(tela), 'nova versão não exige mais o módulo Alterar aprovados');

console.log('OK diff de versões: quantidade, troca de MP pela mesma chave, inclusão, remoção, QSP, BOM, especificação, resumo; tela ligada.');
