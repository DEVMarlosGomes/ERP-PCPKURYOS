'use strict';
/* Anexo do relatório da RNC — registro de retrabalho (16/11/2026).
     node run_registro_retrabalho_doc_test.js
   O FOR-QUA-0001 sai com o registro completo: identificação, balanço, as 3 etapas com materiais,
   decisão, histórico, assinaturas e anexo fotográfico. Registro aberto sai PROVISÓRIO; balanço que
   não fecha sai com faixa. Texto do usuário é escapado. Campo vazio sai em branco. */
const assert = require('assert/strict');
const fs = require('fs');
const T = require('./public/shared/registro-retrabalho.js');
const D = require('./public/shared/registro-retrabalho-doc.js');
const FIX = JSON.parse(fs.readFileSync('run_registro_retrabalho_fixture.json', 'utf8'));
let n = 0;
const ok = (m) => { n++; console.log('  ok  ' + m); };

const ator = {uid: 'rob', nome: 'Roberta Q', usuario: {nome: 'Roberta Q', role: 'qualidade'}};
const ctx = {rnc: FIX.nao_conformidades['RNC-2026-011'], opOrigem: FIX.ops['26302-01'],
  opsDestino: {'26302-01': FIX.ops['26302-01'], '26264-14': FIX.ops['26264-14']},
  conferencias: {'26302-01': FIX.conferencias_pa['26302-01'], '26264-14': FIX.conferencias_pa['26264-14']}};
const DADOS = {rncNumero: 'RNC-2026-011', opKeyOrigem: '26302-01', qtdOrigem: 3470,
  destinos: [{opKey: '26302-01', qtd: 1460}, {opKey: '26264-14', qtd: 1965}], rncsRelacionadas: ['RNC-PA-26264-14'],
  ocorridaEm: '2026-10-30', descricao: 'Granel do Sunrise <b>Muse</b> envasado como Rose.'};
const foto = (nome) => ({url: 'https://firebasestorage.googleapis.com/v0/b/x/o/' + nome + '?alt=media', caminho: 'qualidade/retrabalho_x/' + nome, nomeOriginal: nome, contentType: 'image/jpeg', legenda: 'segregação', enviadoPor: 'Roberta Q', enviadoEm: '2026-11-10T12:00:00Z'});
const etapa = (ent, sai, per) => ({recurso: 'Linha 1', inicio: '2026-11-10T08:00', fim: '2026-11-11T17:00', responsaveis: 'Equipe de produção',
  procedimento: 'Análise sensorial e desenvase.', qtdEntrada: ent, qtdSaida: sai, qtdPerda: per,
  materiais: [{codigo: 'EP-00182', nome: 'Válvula spray', consumido: 2010, descartado: 2010}], evidencias: [foto('etapa.jpg')]});

(async () => {
  // 1. Registro recém-aberto: provisório, balanço não fecha, campos em branco.
  const c = T.aplicarAcao(null, 'CRIAR', ator, DADOS, '2026-11-16T15:00:00Z', ctx).registro;
  c.historico = {h1: {acao: 'CRIAR', em: '2026-11-16T15:00:00Z', por: 'Roberta Q', mudou: {status: {}}}};
  let h = D.paginasRegistro('RR-26302-01-1', c, FIX.nao_conformidades['RNC-2026-011']);
  assert.match(h, /REGISTRO DE RETRABALHO RR-26302-01-1/);
  assert.match(h, /DOCUMENTO PROVISÓRIO/);
  assert.match(h, /BALANÇO NÃO FECHADO — DIFERENÇA DE 45 UN\./);
  assert.match(h, /RNC-PA-26264-14/);
  assert.match(h, /&lt;b&gt;Muse&lt;\/b&gt;/, 'texto escapado');
  assert.doesNotMatch(h, /<b>Muse<\/b>/);
  ['IDENTIFICAÇÃO', 'BALANÇO DE QUANTIDADES', 'ETAPA 1 — IDENTIFICAÇÃO', 'ETAPA 2 — RETRABALHO', 'ETAPA 3 — ENVASE DE RETRABALHO',
    'DECISÃO DA QUALIDADE', 'HISTÓRICO DO REGISTRO', 'Elaborado por', 'Aprovado por (Qualidade)'].forEach((t) => assert.ok(h.includes(t), 'seção ' + t));
  assert.match(h, /3\.470/); assert.match(h, /1\.460/); assert.match(h, /1\.965/);
  assert.match(h, /a Conferência de PA contou 3\.470/, 'aviso do palete conferido com 3.470 vai no papel');
  assert.match(h, /Não altera OP, pedido, estoque, palete, conferência nem expedição/);
  assert.doesNotMatch(h, /undefined|NaN|null/);
  assert.doesNotMatch(h, /Anexo fotográfico/, 'sem foto, sem página de fotos');
  ok('aberto: provisório, faixa de 45 un., todas as seções, texto escapado, sem undefined/NaN, sem página de fotos vazia');

  // 2. Encerrado e fechado: sem faixas; etapas, materiais, decisão, histórico e fotos.
  let r = T.aplicarAcao(c, 'SALVAR', ator, {perdas: [{motivo: 'PERDA_DESENVASE', qtd: 45, observacao: 'líquido perdido'}],
    etapas: {e1: etapa(3470, 3470, 0), e2: etapa(2010, 1965, 45), e3: etapa(1965, 1965, 0)}}, 't1').registro;
  r = T.aplicarAcao(r, 'ENVIAR', ator, {}, 't2').registro;
  r = T.aplicarAcao(r, 'ENCERRAR', ator, {analise: 'Retrabalho conforme RNC-2026-011.', conclusao: '1.460 Rose e 1.965 Sunrise Muse.'}, '2026-11-17T10:00:00Z').registro;
  r.historico = {h1: {acao: 'CRIAR', em: 't0', por: 'Roberta Q'}, h2: {acao: 'ENCERRAR', em: 't3', por: 'Roberta Q', mudou: {status: {}, decisao: {}}}};
  const rnc = Object.assign({}, FIX.nao_conformidades['RNC-2026-011'], {fotos: [foto('rnc.jpg'), {url: 'https://x/laudo.pdf', nomeOriginal: 'laudo.pdf', contentType: 'application/pdf'}]});
  h = D.paginasRegistro('RR-26302-01-1', r, rnc);
  assert.doesNotMatch(h, /PROVISÓRIO|NÃO FECHADO/);
  assert.match(h, /Balanço fechado/);
  assert.match(h, /Perda no desenvase/);
  assert.match(h, /EP-00182/); assert.match(h, /Válvula spray/); assert.match(h, /2\.010/);
  assert.match(h, /entrada = saída \+ perda/);
  assert.match(h, /Retrabalho conforme RNC-2026-011\./); assert.match(h, /1\.460 Rose e 1\.965 Sunrise Muse\./);
  assert.match(h, /Encerrar/, 'histórico com a ação');
  assert.match(h, /Situação, Decisão/, 'campos alterados com nome legível');
  assert.match(h, /white-space:nowrap">PRF-BIOF-0006/, 'SKU sem quebra');
  assert.match(h, /Anexo fotográfico · 5 arquivo\(s\)/, '2 da RNC + 3 das etapas');
  assert.equal((h.match(/<img /g) || []).length, 4, 'PDF não vira imagem');
  assert.match(h, /Arquivo: laudo\.pdf/);
  assert.match(h, /Etapa 2 · Retrabalho/);
  assert.equal((h.match(/class="laudo-page laudo-rr"/g) || []).length, 2, 'folha do registro + folha de fotos');
  ok('encerrado: sem faixas; perdas, materiais, conferência das etapas, decisão, histórico, assinaturas e 5 fotos (PDF listado)');

  // 3. RTDB podado (sem perdas, materiais, evidências, histórico): sai em branco, sem quebrar.
  const podado = JSON.parse(JSON.stringify(c)); delete podado.perdas; delete podado.historico;
  Object.values(podado.etapas).forEach((e) => { delete e.materiais; delete e.evidencias; delete e.recurso; });
  h = D.paginasRegistro('RR-X-1', podado, null);
  assert.match(h, /Materiais: nenhum registrado/); assert.match(h, /Sem eventos/);
  assert.doesNotMatch(h, /undefined|NaN/);
  ok('registro podado pelo RTDB imprime com campos em branco, sem quebrar');

  // 4. Vínculo: só os registros da RNC pedida, mais antigo primeiro.
  const regs = {'RR-A-2': {rncNumero: 'RNC-1', criadoEm: '2026-11-02'}, 'RR-A-1': {rncNumero: 'RNC-1', criadoEm: '2026-11-01'}, 'RR-B-1': {rncNumero: 'RNC-2', criadoEm: '2026-11-01'}};
  assert.deepEqual(D.daRnc(regs, 'RNC-1'), ['RR-A-1', 'RR-A-2']);
  assert.deepEqual(D.daRnc(regs, 'RNC-9'), []);
  assert.equal(D.anexosDaRnc(regs, 'RNC-9', {}), '');
  const dois = D.anexosDaRnc({'RR-26302-01-1': r, 'RR-OUTRO-1': Object.assign({}, r, {rncNumero: 'RNC-OUTRA'})}, 'RNC-2026-011', rnc);
  assert.match(dois, /RR-26302-01-1/); assert.doesNotMatch(dois, /RR-OUTRO-1/);
  ok('anexos só dos registros da RNC pedida, em ordem de abertura; RNC sem registro não ganha anexo');

  // 5. Base depois do ajuste ao físico (17/11): OP 26302/01 com 1.460 e trilha 3.470 → 1.460.
  //    A origem sugerida é o apontado ANTES do ajuste, e o papel mostra a trilha. A OP não muda.
  const opAj = Object.assign(JSON.parse(JSON.stringify(FIX.ops['26302-01'])), {produzido: 1460, produzidoLinha: 1460,
    ajustesProducao: {aj_bioflora_20261116: {em: '2026-11-17T04:30:00.000Z', por: 'Claude', campo: 'produzidoLinha', antes: 3470, depois: 1460, motivo: 'Ajuste ao físico final'}}});
  const antesOp = JSON.stringify(opAj);
  assert.equal(T.apontamentoOriginal(opAj), 3470);
  assert.equal(T.apontamentoOriginal(FIX.ops['26264-14']), Number(FIX.ops['26264-14'].produzido), 'sem ajuste = apontado atual');
  const ctxAj = Object.assign({}, ctx, {opOrigem: opAj, opsDestino: {'26302-01': opAj, '26264-14': FIX.ops['26264-14']},
    conferencias: {'26302-01': Object.assign({}, FIX.conferencias_pa['26302-01'], {qtdPaletizada: 1460}), '26264-14': FIX.conferencias_pa['26264-14']}});
  const dadosSemQtd = Object.assign({}, DADOS); delete dadosSemQtd.qtdOrigem;
  const ra = T.aplicarAcao(null, 'CRIAR', ator, dadosSemQtd, '2026-11-17T12:00:00Z', ctxAj).registro;
  assert.equal(ra.origem.qtd, 3470, 'origem sugerida = apontado antes do ajuste');
  assert.equal(ra.origem.qtdApontada, 1460); assert.equal(ra.origem.qtdApontadaOriginal, 3470);
  assert.equal(T.balanco(ra).diferenca, 45, 'balanço continua 3.470 − 1.460 − 1.965 = 45');
  assert.equal(JSON.stringify(opAj), antesOp, 'OP não é alterada');
  const bal = T.balanco(ra);
  assert.equal(bal.avisos.filter((a) => /apontamento ajustado de 3\.470 para 1\.460 em 17\/11\/2026/.test(a)).length, 1,
    'um aviso só, mesmo com a OP na origem e no destino: ' + bal.avisos.join(' | '));
  assert.ok(!bal.avisos.some((a) => /Conferência de PA contou/.test(a)), 'conferência já bate com 1.460');
  h = D.paginasRegistro('RR-26302-01-1', ra, FIX.nao_conformidades['RNC-2026-011']);
  assert.match(h, /3\.470 → 1\.460 \(ajuste\)/);
  assert.doesNotMatch(h, /undefined|NaN|null/);
  ok('após o ajuste ao físico: origem sugerida 3.470, trilha no papel e no aviso, OP intacta');

  console.log('run_registro_retrabalho_doc_test: ' + n + ' grupos OK');
})().catch((e) => { console.error(e); process.exit(1); });
