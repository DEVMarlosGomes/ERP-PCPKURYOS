'use strict';
/* Encerrar a OP de retrabalho pela Qualidade (16/11/2026).

   Relato da Roberta: "Como eu faço para concluir? Aqui só dá a opção de
   imprimir as OPs." Este teste prova o motor (validação com o máximo de
   informação), o caminho real do servidor (functions/retrabalhos.js, pela
   callable apontarRetrabalho) e, principalmente, o que o encerramento NÃO
   faz: não lança produção (senão a OP concluída entraria na Conferência de
   PA e viraria palete em dobro), não credita pedido e não mexe em estoque. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const RE = require('./public/shared/retrabalho-encerramento.js');
const Ficha = require('./public/shared/ficha-retrabalho.js');
const {executar} = require('./functions/retrabalhos.js');

// 0. Cópia byte a byte no servidor.
assert.equal(fs.readFileSync('functions/retrabalho_encerramento.js', 'utf8'), fs.readFileSync('public/shared/retrabalho-encerramento.js', 'utf8'),
  'functions/retrabalho_encerramento.js precisa ser cópia de public/shared/retrabalho-encerramento.js');

const AGORA = '2026-11-16T18:00:00.000Z';
const RT = {lote: '26302/01-RT1', tipoOrdem: 'RETRABALHO', retrabalhoDe: '26302/01', retrabalhoDeOpKey: '26302-01', status: 'Não Iniciado',
  sku: 'PRF-BIOF-0006', produto: 'BODY SPLASH ROSE ABSOLUT', cliente: 'BIOFLORA', qtdPlanejada: 3470, linha: 'Linha 1', retrabalhoDestino: 'linha',
  produzidoLinha: 0, produzido: 0, skuPedidoKey: '', retrabalhoMotivo: 'Envase trocado', retrabalhoEscopo: 'Lote inteiro', dataEmissao: '2026-11-16T12:00:00.000Z'};
const DADOS = {dataInicio: '2026-11-14T08:00:00.000Z', dataFim: '2026-11-14T17:30:00.000Z', recurso: 'Linha 1', executores: 'Equipe da Linha 1',
  qtdRetrabalhada: 3470, qtdAprovada: 3425, qtdReprovada: 45, destinoReprovadas: 'DESCARTE',
  perdas: [{material: 'VÁLVULA', quantidade: 120, unidade: 'un', motivo: 'Desenvase'}, {material: '', quantidade: '', motivo: ''}],
  inspecao: 'Análise sensorial 100%', amostragem: '100%', decisao: 'LIBERADO_COM_RESTRICAO', restricao: 'Confirmar granel Rose antes do despacho',
  analise: 'Segregação por análise sensorial; Rose ficou no frasco Rose e Sunrise foi reenvasado.', rncVinculada: 'RNC-2026-011', registroRetrabalho: 'RR-26302-01-1'};

// ── 1. Validação ──────────────────────────────────────────────────────
let v = RE.validar(RT, DADOS, AGORA);
assert.equal(v.ok, true, v.erros.join(' | '));
assert.equal(v.dados.duracaoMin, 570);
assert.deepEqual(v.dados.perdas, [{material: 'VÁLVULA', quantidade: 120, unidade: 'un', motivo: 'Desenvase'}], 'linha de perda vazia é ignorada');
v = RE.validar(RT, Object.assign({}, DADOS, {qtdAprovada: 3400}), AGORA);
assert.match(v.erros.join(' '), /precisam fechar as 3470/, 'aprovadas + reprovadas fecham as retrabalhadas');
v = RE.validar(RT, Object.assign({}, DADOS, {qtdAprovada: ''}), AGORA);
assert.match(v.erros.join(' '), /quantas unidades foram aprovadas/);
assert.doesNotMatch(v.erros.join(' '), /null|precisam fechar/, 'campo vazio não vira "null" na mensagem');
v = RE.validar(RT, Object.assign({}, DADOS, {destinoReprovadas: ''}), AGORA);
assert.match(v.erros.join(' '), /destino das 45 unidades reprovadas/);
v = RE.validar(RT, Object.assign({}, DADOS, {analise: 'ok'}), AGORA);
assert.match(v.erros.join(' '), /análise da Qualidade/);
v = RE.validar(RT, Object.assign({}, DADOS, {dataFim: '2026-11-13T08:00:00.000Z'}), AGORA);
assert.match(v.erros.join(' '), /antes do início/);
v = RE.validar(RT, Object.assign({}, DADOS, {dataFim: '2026-11-20T08:00:00.000Z'}), AGORA);
assert.match(v.erros.join(' '), /futuro/);
v = RE.validar(RT, Object.assign({}, DADOS, {decisao: 'REPROVADO'}), AGORA);
assert.match(v.erros.join(' '), /Reprovado" com unidades aprovadas/);
v = RE.validar(RT, Object.assign({}, DADOS, {restricao: ''}), AGORA);
assert.match(v.erros.join(' '), /restrição/);
v = RE.validar(RT, Object.assign({}, DADOS, {perdas: [{material: 'TAMPA', quantidade: 0}]}), AGORA);
assert.match(v.erros.join(' '), /Perda 1: informe a quantidade/);
v = RE.validar(Object.assign({}, RT, {tipoOrdem: ''}), DADOS, AGORA);
assert.match(v.erros.join(' '), /não é de retrabalho/);
v = RE.validar(Object.assign({}, RT, {status: 'Concluído'}), DADOS, AGORA);
assert.match(v.erros.join(' '), /já está concluído/);

// ── 2. Quem encerra ───────────────────────────────────────────────────
assert.equal(RE.podeEncerrar({role: 'qualidade'}), true);
assert.equal(RE.podeEncerrar({role: 'comercial', funcoes: {qualidade: true}}), true);
assert.equal(RE.podeEncerrar({role: 'production', modulos: {qualidade: true}}), true);
assert.equal(RE.podeEncerrar({role: 'pcp'}), true);
assert.equal(RE.podeEncerrar({role: 'admin'}), true);
assert.equal(RE.podeEncerrar({role: 'production'}), false, 'quem aponta não decide');
assert.equal(RE.podeEncerrar({role: 'logistica'}), false);

// ── 3. Servidor real: encerrar ────────────────────────────────────────
function base() {
  return {
    usuarios: {q: {nome: 'Roberta Ramos', role: 'qualidade'}, p: {nome: 'Operador', role: 'production'}},
    ops: {'26302-01-RT1': JSON.parse(JSON.stringify(RT)),
      '26302-01': {lote: '26302/01', status: 'Concluído', produzidoLinha: 3470, skuPedidoKey: 'PED-0001__PRF-BIOF-0006'}},
    pedidos: {'PED-0001__PRF-BIOF-0006': {produzido: 8024}},
    estoque_lotes: {PRF: {'pa_26302-01_p1': {saldoLote: 3470}}},
    conferencias_pa: {}
  };
}
const OPER = 'rto_1731780000000_abcdefgh';
let b = base();
const antes = JSON.parse(JSON.stringify(b));
assert.throws(() => executar(b, {acao: 'encerrar_op', opKey: '26302-01-RT1', operacaoId: OPER, dados: DADOS}, 'p', AGORA), /Somente a Qualidade/);
let r = executar(b, {acao: 'encerrar_op', opKey: '26302-01-RT1', operacaoId: OPER, dados: DADOS}, 'q', AGORA);
assert.equal(r.id, '26302-01-RT1');
const op = b.ops['26302-01-RT1'];
assert.equal(op.status, 'Concluído');
assert.equal(op.retrabalhoEncerramento.decisao, 'LIBERADO_COM_RESTRICAO');
assert.equal(op.retrabalhoEncerramento.qtdAprovada, 3425);
assert.equal(op.retrabalhoEncerramento.encerradoPor, 'Roberta Ramos');
assert.equal(op.retrabalhoEncerramento.rncVinculada, 'RNC-2026-011');
assert.equal(op.dataInicioReal, DADOS.dataInicio);
assert.equal(op.historicoRetrabalho[OPER].acao, 'ENCERRAR');
// O que NÃO pode acontecer.
assert.equal(op.produzidoLinha, 0, 'encerrar não lança produção (evita palete em dobro na Conferência de PA)');
assert.equal(op.produzido, 0);
assert.equal(op.skuPedidoKey, '', 'continua sem pedido');
assert.equal(op.materiaisConsumo, undefined, 'continua sem BOM');
for (const no of ['pedidos', 'estoque_lotes', 'conferencias_pa', 'usuarios']) assert.deepEqual(b[no], antes[no], no + ' intocado');
assert.deepEqual(b.ops['26302-01'], antes.ops['26302-01'], 'OP de origem intocada');
// Retry da mesma operação não repete nem falha.
const depois = JSON.stringify(b);
r = executar(b, {acao: 'encerrar_op', opKey: '26302-01-RT1', operacaoId: OPER, dados: DADOS}, 'q', AGORA);
assert.equal(r.repetida, true);
assert.equal(JSON.stringify(b), depois, 'retry idempotente');
// Outra operação depois de concluída: recusada.
assert.throws(() => executar(b, {acao: 'encerrar_op', opKey: '26302-01-RT1', operacaoId: OPER + 'x', dados: DADOS}, 'q', AGORA), /já está concluído/);

// ── 4. Servidor real: cancelar ────────────────────────────────────────
b = base();
assert.throws(() => executar(b, {acao: 'cancelar_op', opKey: '26302-01-RT1', operacaoId: OPER, motivo: 'curto'}, 'q', AGORA), /motivo/);
executar(b, {acao: 'cancelar_op', opKey: '26302-01-RT1', operacaoId: OPER, motivo: 'Documentado no registro RR-26302-01-1'}, 'q', AGORA);
assert.equal(b.ops['26302-01-RT1'].status, 'Cancelado');
assert.equal(b.ops['26302-01-RT1'].canceladoPor, 'Roberta Ramos');
b = base(); b.ops['26302-01-RT1'].produzidoLinha = 100;
assert.throws(() => executar(b, {acao: 'cancelar_op', opKey: '26302-01-RT1', operacaoId: OPER, motivo: 'Documentado no registro RR-26302-01-1'}, 'q', AGORA), /já tem produção apontada/);
assert.throws(() => executar(base(), {acao: 'encerrar_op', opKey: '26302-01', operacaoId: OPER, dados: DADOS}, 'q', AGORA), /não é de retrabalho/);
assert.throws(() => executar(base(), {acao: 'encerrar_op', opKey: '26302-01-RT1', operacaoId: 'x', dados: DADOS}, 'q', AGORA), /Operação inválida/);

// ── 5. Ficha de retrabalho ────────────────────────────────────────────
let html = Ficha.html(RT, {opOrigem: {produzidoLinha: 3470}, agora: AGORA, por: 'Roberta'});
assert.match(html, /Ficha de Retrabalho — OP 26302\/01-RT1/);
assert.match(html, /Envase trocado/);
assert.match(html, /☐ Descarte/, 'antes do encerramento: campos para preencher à mão');
assert.match(html, /não credita pedido, não baixa BOM e não gera palete novo/);
html = Ficha.html(op, {agora: AGORA});
assert.match(html, /3\.425/); assert.match(html, /Liberado com restrição/); assert.match(html, /VÁLVULA/); assert.match(html, /RNC-2026-011/);
assert.doesNotMatch(Ficha.html(Object.assign({}, RT, {produto: '<img src=x onerror=alert(1)>'})), /<img src=x/, 'texto escapado');

console.log('run_retrabalho_encerramento_test: OK (motor, servidor real, idempotência, sem efeito em produção/pedido/estoque, ficha)');
