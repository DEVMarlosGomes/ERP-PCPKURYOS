// FOR-QUA-0001: campos preenchíveis da RNC (18/11/2026).
// node run_rnc_formulario_test.js
'use strict';
const assert = require('node:assert/strict');
const F = require('./public/shared/rnc-formulario.js');
const LaudoCQ = require('./public/shared/laudo-cq.js');
let n = 0; const ok = (m) => { n++; console.log('  ok  ' + m); };
const clone = (x) => JSON.parse(JSON.stringify(x));

const completo = {
  procedimento: 'POP-QUA-005', evidencia: 'Ensaio de volume: 120 g de água até o gargalo',
  acaoImediata: 'Lote segregado na doca', responsavelContencao: 'Roberta Ramos', prazoContencao: '2026-11-18',
  contencao: {loteBloqueado: 'SIM', materiaisBloqueados: 'SIM', outrosImpactados: 'SIM', outrosBloqueados: 'NAO', houveExpedicao: 'NAO', equipesAvisadas: 'SIM'},
  observacaoContencao: 'Lote 2 do mesmo PC', metodo: '5 Porquês', causaRaiz: 'Molde do fornecedor sem headspace',
  acaoCorretiva: 'Homologar frasco 130 ml', responsavelAcao: 'Compras', prazoAcao: '2026-12-01',
  risco: {probabilidade: 'Baixa', impacto: 'Médio', residual: 'Aceitável'},
  eficacia: {descricao: 'Próximos 3 recebimentos medidos', resultado: 'APROVADO', data: '2026-12-15', responsavel: 'Roberta Ramos'},
  aprovadoPor: 'Gustavo'
};

// ── normalizar ──
{
  const r = F.normalizar(completo, {status: 'ABERTA'});
  assert.deepEqual(r.erros, []);
  assert.equal(r.formulario.contencao.loteBloqueado, true);
  assert.equal(r.formulario.contencao.outrosBloqueados, false);
  assert.equal(r.principais.causaRaiz, 'Molde do fornecedor sem headspace');
  ok('formulário completo normaliza sem erro; Sim/Não viram true/false');

  const vazio = F.normalizar({}, {status: 'ABERTA'});
  assert.deepEqual(vazio.erros, []);
  assert.ok(Object.values(vazio.formulario.contencao).every((v) => v === null), 'sem resposta = null, nunca "Não"');
  ok('formulário vazio salva (preencher aos poucos) e pergunta sem resposta fica null');

  const semObs = F.normalizar({contencao: {houveExpedicao: 'SIM'}}, {});
  assert.match(semObs.erros.join(), /liste quais/);
  ok('"Sim" em expedição/outros lotes exige a observação');

  const orf = F.normalizar({contencao: {outrosImpactados: 'NAO', outrosBloqueados: 'SIM'}}, {});
  assert.equal(orf.formulario.contencao.outrosBloqueados, null);
  ok('"também bloqueados?" só vale com outros impactados = Sim');

  assert.match(F.normalizar({metodo: 'OUTRO'}, {}).erros.join(), /qual método/);
  assert.equal(F.normalizar({metodo: 'OUTRO', metodoOutro: 'Brainstorming'}, {}).formulario.metodo, 'Brainstorming');
  assert.match(F.normalizar({eficacia: {resultado: 'APROVADO'}}, {}).erros.join(), /data e o responsável/);
  ok('método "Outro" pede o nome; resultado da eficácia pede data, responsável e descrição');

  const conc = F.normalizar(completo, {status: 'CONCLUIDA'});
  assert.equal('causaRaiz' in conc.principais, false, 'concluída: causa/plano não mudam por aqui');
  assert.equal(conc.formulario.eficacia.resultado, 'APROVADO', 'eficácia segue editável depois de concluída');
  ok('RNC concluída: causa/plano ficam como encerrados; eficácia e risco seguem editáveis');
}

// ── salvar (transação falsa, como o RTDB) ──
(async () => {
  function banco(dados) {
    return {dados, ref(path) {
      const k = path.split('/')[1];
      return {transaction: async (fn) => {
        const atual = dados[k] ? clone(dados[k]) : null;
        const novo = fn(atual);
        if (novo === undefined) return {committed: false};
        dados[k] = novo; return {committed: true};
      }};
    }};
  }
  const db = banco({'RNC-2026-013': {numero: 'RNC-2026-013', status: 'EM_ANALISE', descricao: 'frasco sem headspace'}, 'RNC-2026-009': {status: 'CANCELADA'}});
  let r = await F.salvar(db, 'RNC-2026-013', completo, 'Roberta Ramos', '2026-11-18T10:00:00.000Z');
  assert.equal(r.ok, true);
  const g = db.dados['RNC-2026-013'];
  assert.equal(g.status, 'EM_ANALISE', 'formulário não muda o status');
  assert.equal(g.causaRaiz, 'Molde do fornecedor sem headspace');
  assert.equal(g.formulario.atualizadoPor, 'Roberta Ramos');
  r = await F.salvar(db, 'RNC-2026-009', completo, 'X');
  assert.equal(r.ok, false); assert.match(r.erro, /cancelada/);
  r = await F.salvar(db, 'RNC-2026-013', {contencao: {houveExpedicao: 'SIM'}}, 'X');
  assert.equal(r.ok, false); assert.match(r.erro, /liste quais/);
  assert.equal(db.dados['RNC-2026-013'].causaRaiz, 'Molde do fornecedor sem headspace', 'recusa não grava nada');
  ok('salvar grava formulario + campos do encerramento, recusa cancelada e entrada inválida');

  // ── valores iniciais e documento ──
  const ini = F.valoresIniciais({status: 'ABERTA'}, {contencao: {loteBloqueado: true}});
  assert.equal(ini.contencao.loteBloqueado, true); assert.equal(ini.contencaoSugerida.loteBloqueado, true);
  const ini2 = F.valoresIniciais(g, {contencao: {loteBloqueado: false}});
  assert.equal(ini2.contencao.loteBloqueado, true, 'resposta gravada vence a sugestão');
  assert.equal(ini2.contencaoSugerida.loteBloqueado, undefined);
  ok('tela abre com a sugestão do sistema marcada; resposta gravada vence');

  const doc = F.paraDocumento(g, {contencao: {loteBloqueado: false}});
  const html = LaudoCQ.paginaRnc(Object.assign({numero: g.numero, descricao: g.descricao, causaRaiz: g.causaRaiz, planoAcao: g.acaoCorretiva,
    responsavelAcao: g.responsavelAcao, prazoAcao: g.prazoAcao, encerramento: {aprovadoPor: doc.aprovadoPor}}, doc));
  for (const t of ['POP-QUA-005', 'Ensaio de volume', 'Lote 2 do mesmo PC', 'Molde do fornecedor', 'Próximos 3 recebimentos', 'Gustavo', 'Roberta Ramos']) assert.ok(html.includes(t), 'relatório traz ' + t);
  assert.equal(F.progresso(g).feitos, F.progresso(g).total, 'formulário completo = 100%');
  assert.equal(F.progresso({}).feitos, 0);
  const vazioHtml = LaudoCQ.paginaRnc({numero: 'X'});
  assert.ok(vazioHtml.includes('Observação:'), 'campo de observação sai mesmo vazio');
  ok('relatório FOR-QUA-0001 imprime tudo o que foi preenchido; progresso conta 13 itens');

  console.log('run_rnc_formulario_test: ' + n + ' OK');
})().catch((e) => { console.error(e); process.exit(1); });
