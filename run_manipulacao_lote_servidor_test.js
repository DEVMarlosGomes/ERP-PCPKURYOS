'use strict';
/* Manipulação em lote — a callable real (functions/index.js → manipulacao_lote.js) no emulador:
     firebase emulators:exec --project demo-pd-lote --only database --config firebase.pdlote-test.json "node run_manipulacao_lote_servidor_test.js"
   (--project igual ao projectId daqui; sem isso o emulador não aplica database.rules.json.)
   - gerar_ordem: perfil/tenant pelo uid; revisão velha e pendência recusadas sem gravar nada; versão nova
     JÁ TRAVADA por amostra (itens = rascunho, fases copiadas, current_version), ordem com assinatura
     SHA-256, CRM com a composição sem perder a variação irmã, MP nova na mesma solicitação.
   - crítico: só ADM/aprovar_critico_pd e nunca quem escreveu o motivo.
   - pesagem: tolerância max(0,01 g; 1 %) com motivo, correção = registro novo, conferência por outra pessoa.
   - registrar_manipulacao: conferência e massa conciliada; versão alterada depois da ordem é recusada.
   - liberarEtapaPd: Em Testes só depois da manipulação; assinatura da versão reconferida. */
const assert = require('assert/strict');
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9063') throw new Error('Teste exige emulador local 9063.');
process.env.GCLOUD_PROJECT = 'demo-pd-lote';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-pd-lote', databaseURL: 'http://127.0.0.1:9063?ns=demo-pd-lote-default-rtdb' });
const reqFunctions = require('node:module').createRequire(require('node:path').resolve(__dirname, 'functions/package.json'));
const {getDatabase} = reqFunctions('firebase-admin/database');
const fns = require('./functions/index.js'); // inicializa o app padrão (servidor) neste emulador
const M = require('./functions/manipulacao_lote_motor.js');
const Srv = require('./functions/manipulacao_lote.js');
const raiz = getDatabase();
const T = 'erp/kuryos';
const L = `${T}/pd_manipulacao_lotes/LM1`;
const chamar = (uid, data) => fns.manipulacaoLoteServidor.run({ auth: { uid }, data: Object.assign({ tenant: 'kuryos', loteId: 'LM1' }, data) });
const liberar = (uid, data) => fns.liberarEtapaPd.run({ auth: { uid }, data });
const ler = async (p) => (await raiz.ref(p).get()).val();
const recusa = (p, code, re) => assert.rejects(p, (e) => { assert.equal(e.code, code, e.message); if (re) assert.match(e.message, re); return true; });
let n = 0;
const passo = (m) => { n++; console.log('  ok  ' + m); };

const item = (id, f, nome, pct, extra = {}) => ({ id, formula_id: f, ingredient_name: nome, percentage: pct, phase: 'A', master_material_id: nome.toUpperCase().replace(/[^A-Z]/g, ''), price_per_kg: 10, ...extra });
const itensF1 = [item('i1a', 'F1', 'Agua', 90), item('i1b', 'F1', 'Fragrancia Rosa', 10, { function: 'fragrância' })];
const itensF2 = [item('i2a', 'F2', 'Agua', 78), item('i2b', 'F2', 'Fenoxietanol', 1), item('i2c', 'F2', 'Extrato', 1, { mp_nova: { nome: 'Extrato Novo', tipo: 'MPGR' } }),
  item('i2d', 'F2', 'Fragrancia Lavanda', 20, { function: 'fragrância' })];
const porId = (l) => Object.fromEntries(l.map((x) => [x.id, x]));

(async () => {
  const mm = M.montarMatriz({ matrizItens: itensF2, membros: [{ request_id: 'R1', itens: itensF1 }, { request_id: 'R2', itens: itensF2 }, { request_id: 'R3', itens: [] }] });
  const k = (nome) => Object.keys(mm.ingredientes).find((x) => mm.ingredientes[x].nome === nome);
  const celulas = {
    R1: Object.fromEntries(Object.entries({ ...mm.matrizCelulas, [k('Fragrancia Rosa')]: 20 }).filter(([x]) => x !== k('Fragrancia Lavanda'))),
    R2: { ...mm.matrizCelulas, [k('Fenoxietanol')]: 0.8, [k('Agua')]: 78.2 },
    R3: { ...mm.matrizCelulas, [k('Agua')]: 77.5, [k('Fragrancia Lavanda')]: 20.5 },
  };
  const membro = (r, s, v, dev, fid, versao, itens, q, cod) => ({ request_id: r, development_id: dev, sample_id: s, variacao_id: v, codigo_amostra: cod, quantidade_g: q,
    formula_id_antes: fid, versao_antes: versao, assinatura_antes: itens.length ? M.assinaturaItens(itens) : null, status_membro: 'ativo' });
  const motivo = (por, texto, valor) => ({ texto, nivel: 2, valor, por, por_nome: por, em: '2026-11-04T10:00:00Z' });
  await raiz.ref().set({
    usuarios: {
      pd: { role: 'pd', nome: 'Yasmim', tenant_id: 'kuryos' }, pd2: { role: 'formulador', nome: 'Carla', tenant_id: 'kuryos' },
      adm: { role: 'admin', nome: 'ADM', tenant_id: 'kuryos' }, com: { role: 'comercial', nome: 'Vendas', tenant_id: 'kuryos' },
      rt: { role: 'pd', nome: 'RT', tenant_id: 'kuryos', modulos: { aprovar_critico_pd: true } }, semtenant: { role: 'pd' },
      inativo: { role: 'pd', tenant_id: 'kuryos', desativado: true },
    },
    materiais: { FENOXIETANOL: { mpNome: 'Fenoxietanol', criticoPd: true } },
    solicitacoes_cadastro_material: { NOME__EXTRATO_NOVO: { status: 'PENDENTE_CADASTRO', nome: 'Extrato Novo', origens: { F2__i2c: { pdRequestId: 'R2', formulaId: 'F2', itemId: 'i2c', ativa: true } } } },
    erp: { kuryos: {
      crm_samples: {
        S1: { id: 'S1', projeto_id: 'P1', variacoes: [{ id: 'v1', codigo: '2026-1003-a', pd_request_id: 'R1' }, { id: 'v2', codigo: '2026-1003-b', pd_request_id: 'R2' }] },
        S2: { id: 'S2', projeto_id: 'P1', variacoes: [{ id: 'v3', codigo: '2026-1003-c', pd_request_id: 'R3' }] },
      },
      pd_requests: {
        R1: { id: 'R1', status: 'IN_PROGRESS', internal_code: '2026-1003-a' }, R2: { id: 'R2', status: 'IN_PROGRESS', internal_code: '2026-1003-b' },
        R3: { id: 'R3', status: 'IN_PROGRESS', internal_code: '2026-1003-c' },
      },
      pd_developments: { D1: { id: 'D1', request_id: 'R1' }, D2: { id: 'D2', request_id: 'R2' }, D3: { id: 'D3', request_id: 'R3' } },
      pd_formulas: {
        F1: { id: 'F1', development_id: 'D1', version: 1, volume: 50, indice_perdas: 2 },
        F2: { id: 'F2', development_id: 'D2', version: 2, locked: true, volume: 50, indice_perdas: 3, name: 'Base manteiga', cotacao_usd: 5.5 },
      },
      pd_formula_items: porId([...itensF1, ...itensF2]),
      pd_formula_phases: { PH2: { id: 'PH2', formula_id: 'F2', titulo: 'Fase A', ordem: 0 } },
      pd_manipulacao_lotes: { LM1: {
        id: 'LM1', tenant_id: 'kuryos', codigo: 'LM-2026-031-1', projeto_id: 'P1', projeto_numero: '2026-031', status: 'rascunho', revisao: 3,
        matriz: { tipo: 'amostra', ref_id: 'F2', request_id: 'R2', versao: 2, codigo: '2026-1003-b', celulas: mm.matrizCelulas },
        membros: {
          R1: membro('R1', 'S1', 'v1', 'D1', 'F1', 1, itensF1, 50, '2026-1003-a'), R2: membro('R2', 'S1', 'v2', 'D2', 'F2', 2, itensF2, 50, '2026-1003-b'),
          R3: membro('R3', 'S2', 'v3', 'D3', null, null, [], 90, '2026-1003-c'),
        },
        ingredientes: mm.ingredientes, celulas,
        motivos: { R2: { [k('Agua')]: motivo('pd', 'ajuste do conservante', 78.2), [k('Fenoxietanol')]: { ...motivo('rt', 'menos conservante', 0.8), nivel: 3 } },
          R3: { [k('Agua')]: motivo('pd', 'compensar fragrância', 77.5) },
          R1: { [k('Fenoxietanol')]: { ...motivo('pd', 'entra o conservante da base', 1), nivel: 3 } } }, // R1 não tinha (muda a fórmula dela)
        pre_mistura: { A: true }, perda_pct: 3, minimo_pesavel_g: 0.05,
        eventos: { e1: { tipo: 'criado', por: 'pd', em: '2026-11-04T09:00:00Z' } },
      } },
    } },
  });

  // Perfil e tenant pelo uid.
  await recusa(chamar('com', { acao: 'gerar_ordem', revisao: 3 }), 'permission-denied', /P&D/);
  await recusa(chamar('semtenant', { acao: 'gerar_ordem', revisao: 3 }), 'permission-denied');
  await recusa(chamar('inativo', { acao: 'gerar_ordem', revisao: 3 }), 'permission-denied', /inativo/);
  await recusa(chamar('pd', { acao: 'gerar_ordem', revisao: 3, tenant: 'outro' }), 'permission-denied', /tenant/);
  await recusa(chamar('pd', { acao: 'gerar_ordem', revisao: 3, loteId: '../ops' }), 'invalid-argument');
  passo('comercial, sem tenant, desativado e outro tenant não chamam; id de lote forjado recusado');

  await recusa(chamar('pd', { acao: 'gerar_ordem', revisao: 2 }), 'aborted', /mudou/);
  await recusa(chamar('pd', { acao: 'gerar_ordem', revisao: 3 }), 'failed-precondition', /Fenoxietanol.*aprovação/);
  assert.equal(await ler(`${L}/status`), 'rascunho');
  assert.deepEqual(Object.keys(await ler(`${T}/pd_formulas`)).sort(), ['F1', 'F2']);
  passo('revisão velha e crítico sem aprovação: nada gravado, lote segue rascunho');

  // Crítico: módulo ou ADM, nunca quem escreveu o motivo.
  await recusa(chamar('pd', { acao: 'aprovar_critico', requestId: 'R2', ingKey: k('Fenoxietanol') }), 'permission-denied', /crítico/);
  await recusa(chamar('rt', { acao: 'aprovar_critico', requestId: 'R2', ingKey: k('Fenoxietanol') }), 'failed-precondition', /outra pessoa/);
  await recusa(chamar('adm', { acao: 'aprovar_critico', requestId: 'R2', ingKey: k('Agua') }), 'failed-precondition', /não é crítico/);
  const ap = await chamar('adm', { acao: 'aprovar_critico', requestId: 'R2', ingKey: k('Fenoxietanol') });
  assert.equal(ap.valor, 0.8);
  assert.deepEqual(await ler(`${L}/aprovacoes_criticas/R2/${k('Fenoxietanol')}`), { valor: 0.8, chave: 'FENOXIETANOL|a', master_material_id: 'FENOXIETANOL', por: 'adm', por_nome: 'ADM',
    em: (await ler(`${L}/aprovacoes_criticas/R2/${k('Fenoxietanol')}/em`)) });
  assert.equal(await ler(`${L}/revisao`), 4);
  await recusa(chamar('pd', { acao: 'gerar_ordem', revisao: 4 }), 'failed-precondition', /2026-1003-a: Fenoxietanol é crítico.*fórmula anterior desta amostra/);
  await chamar('rt', { acao: 'aprovar_critico', requestId: 'R1', ingKey: k('Fenoxietanol') }); // a R1 ganhou o conservante da matriz
  assert.equal(await ler(`${L}/revisao`), 5);
  passo('crítico: só ADM/módulo e outra pessoa; aprovação amarrada ao material; clonar a matriz que muda a amostra também pede aprovação');

  // Ordem.
  const r = await chamar('pd', { acao: 'gerar_ordem', revisao: 5 });
  assert.equal(r.ok, true);
  const lote = await ler(L);
  assert.equal(lote.status, 'ordem_gerada');
  assert.equal(lote.revisao, 7); // trava (+1) e ordem (+1)
  assert.equal(lote.gerando, undefined); // a trava saiu
  const f = async (rq) => ({ formula: await ler(`${T}/pd_formulas/${lote.membros[rq].formula_id_lote}`), id: lote.membros[rq].formula_id_lote });
  const v1 = await f('R1'); const v2 = await f('R2'); const v3 = await f('R3');
  assert.deepEqual([v1.formula.version, v2.formula.version, v3.formula.version], [2, 3, 1]);
  for (const v of [v1, v2, v3]) assert.equal(v.formula.locked, true);
  assert.equal(v1.formula.locked_motivo, 'ordem_lote');
  assert.equal(v1.formula.parent_formula_id, 'F1');
  assert.deepEqual(v1.formula.origem_lote, { lote_id: 'LM1', codigo: 'LM-2026-031-1', matriz: { tipo: 'amostra', ref_id: 'F2', versao: 2 } });
  assert.equal(v2.formula.name, 'Base manteiga');
  assert.equal(v2.formula.indice_perdas, 3);
  assert.deepEqual(await ler(`${T}/pd_formulas/F2`), { id: 'F2', development_id: 'D2', version: 2, locked: true, volume: 50, indice_perdas: 3, name: 'Base manteiga', cotacao_usd: 5.5 });
  assert.equal(await ler(`${T}/pd_developments/D3/current_version`), 1);
  assert.equal(await ler(`${T}/pd_developments/D2/current_version`), 3);
  const todos = Object.values(await ler(`${T}/pd_formula_items`));
  const itensDe = (fid) => todos.filter((i) => i.formula_id === fid);
  assert.deepEqual(itensDe(v3.id).map((i) => [i.ingredient_name, i.percentage]).sort(), [['Agua', 77.5], ['Extrato', 1], ['Fenoxietanol', 1], ['Fragrancia Lavanda', 20.5]]);
  assert.ok(itensDe(v1.id).every((i) => i.id.startsWith(`${v1.id}_`) && typeof i.cost_brl === 'number'));
  assert.equal(Object.values(await ler(`${T}/pd_formula_phases`)).filter((p) => p.formula_id === v2.id).length, 1);
  assert.equal(lote.ordem.assinaturas.R1, Srv.sha256(M.textoCanonicoItens(itensDe(v1.id))));
  assert.equal(lote.membros.R1.assinatura_lote, M.assinaturaItens(itensDe(v1.id)));
  assert.equal(lote.membros.R2.fora_da_base, true);
  passo('ordem: versões travadas por amostra com os itens do rascunho, fases e current_version; a anterior intacta');
  const s1 = await ler(`${T}/crm_samples/S1`);
  assert.deepEqual(s1.variacoes.map((v) => v.codigo), ['2026-1003-a', '2026-1003-b']);
  assert.equal(s1.variacoes[1].lote_manipulacao.codigo, 'LM-2026-031-1');
  assert.equal(s1.variacoes[1].lote_manipulacao.fora_da_base, true);
  assert.deepEqual(s1.variacoes[1].lote_manipulacao.diferencas.sort(), ['Agua', 'Fenoxietanol']);
  assert.equal(s1.variacoes[0].lote_manipulacao.composicao.length, 4);
  assert.deepEqual(s1.variacoes[0].lote_manipulacao.composicao.filter((c) => c.fragrancia).map((c) => c.nome), ['Fragrancia Rosa']); // o Kickoff separa fragrância do resto
  const origens = Object.keys(await ler('solicitacoes_cadastro_material/NOME__EXTRATO_NOVO/origens'));
  assert.equal(origens.length, 4);
  assert.ok(origens.includes('F2__i2c'));
  assert.equal(Object.keys(await ler('solicitacoes_cadastro_material')).length, 1);
  passo('CRM: composição na variação, irmã preservada; MP nova acrescenta origens na mesma solicitação');
  const linhas = lote.ordem.linhas_pesagem;
  const soma = Object.values(linhas).reduce((s, l) => s + Math.round(l.teorico_g * 100), 0) / 100;
  assert.ok(soma >= 190 && soma <= 190.2, `total ${soma}`);
  assert.ok(lote.ordem.pre_misturas.length >= 1);
  await recusa(chamar('pd', { acao: 'gerar_ordem', revisao: 7 }), 'failed-precondition', /Ordem gerada/);
  passo(`ordem com ${Object.keys(linhas).length} linhas (${soma} g, pré-mistura da fase A); gerar de novo é recusado`);

  // Em Testes antes da manipulação: recusado.
  await recusa(liberar('pd', { requestId: 'R1', novoStatus: 'IN_TESTS' }), 'failed-precondition', /registre a manipulação/);
  passo('liberarEtapaPd segura Em Testes com a ordem gerada e ainda não manipulada');

  // Pesagem.
  const ids = Object.keys(linhas);
  const agua = `ad_R1_${k('Agua')}`;
  assert.ok(linhas[agua]);
  const tudo = Object.fromEntries(ids.filter((id) => id !== agua).map((id) => [id, { real_g: linhas[id].teorico_g, lote_mp: id.includes('pm') ? 'L-123' : '' }]));
  await recusa(chamar('pd', { acao: 'registrar_pesagens', linhas: { [agua]: { real_g: linhas[agua].teorico_g + 0.5 } } }), 'failed-precondition', /tolerância/);
  await chamar('pd', { acao: 'registrar_pesagens', linhas: { ...tudo, [agua]: { real_g: linhas[agua].teorico_g + 0.5, motivo_desvio: 'escorreu do béquer' } } });
  const pes = await ler(`${L}/pesagens`);
  assert.equal(pes[agua].registros.r1.desvio_g, 0.5);
  assert.equal(pes[ids.find((x) => x.startsWith('ad_'))].registros.r1.lote_mp, 'nao_informado');
  await recusa(chamar('pd', { acao: 'registrar_pesagens', linhas: { [agua]: { real_g: 1 } } }), 'failed-precondition', /Corrigir/);
  await recusa(chamar('pd', { acao: 'corrigir_pesagem', linhaId: agua, real_g: linhas[agua].teorico_g, motivo: 'erro' }), 'invalid-argument', /10/);
  await chamar('pd', { acao: 'corrigir_pesagem', linhaId: agua, real_g: linhas[agua].teorico_g + 0.2, motivo: 'balança recalibrada e repesado' });
  const corr = await ler(`${L}/pesagens/${agua}`);
  assert.equal(corr.atual, 'r2');
  assert.equal(corr.registros.r2.corrige, 'r1');
  assert.equal(corr.registros.r1.real_g, Math.round((linhas[agua].teorico_g + 0.5) * 100) / 100);
  passo('pesagem: desvio fora da tolerância exige motivo; repetir exige Corrigir; correção é registro novo');

  // Conferência e registro.
  await recusa(chamar('pd', { acao: 'registrar_manipulacao', entregue: { R1: 50, R2: 50, R3: 90 } }), 'failed-precondition', /sem conferência/);
  await recusa(chamar('pd', { acao: 'conferir_pesagem', linhas: ids }), 'failed-precondition', /outra pessoa/);
  await chamar('pd2', { acao: 'conferir_pesagem', linhas: ids });
  const pesado = Object.values(await ler(`${L}/pesagens`)).reduce((s, p) => s + Math.round(p.registros[p.atual].real_g * 100), 0) / 100;
  const antesDoRegistro = await ler(L);
  assert.throws(() => Srv.aplicarManipulacao(JSON.parse(JSON.stringify(antesDoRegistro)), { entregue: { R1: 50, R2: 50, R3: 90 } }, { uid: 'pd', nome: 'Y' }, 'x', () => 'id',
    { R1: 'outra', R2: antesDoRegistro.ordem.assinaturas.R2, R3: antesDoRegistro.ordem.assinaturas.R3 }), /alterada depois da ordem/);
  await recusa(chamar('pd', { acao: 'registrar_manipulacao', entregue: { R1: 50, R2: 50, R3: 80 } }), 'failed-precondition', /não fecha/);
  const perda = Math.round((pesado - 190) * 100) / 100;
  const reg = await chamar('pd', { acao: 'registrar_manipulacao', entregue: { R1: 50, R2: 50, R3: 90 }, perda_declarada_g: perda, observacao: 'tudo certo' });
  assert.equal(reg.conciliacao.ok, true);
  const feito = await ler(L);
  assert.equal(feito.status, 'manipulado');
  assert.equal(feito.manipulacao.conciliacao.pesado_g, pesado);
  passo(`conferência por outra pessoa; massa conciliada (${pesado} g, perda ${perda} g) → manipulado; versão alterada é recusada`);

  // Depois da manipulação: Em Testes liberado; versão adulterada (mesma soma) recusada.
  assert.deepEqual(await liberar('pd', { requestId: 'R1', novoStatus: 'IN_TESTS' }), { ok: true });
  const alvo = itensDe(v2.id).find((i) => i.ingredient_name === 'Agua');
  await raiz.ref(`${T}/pd_formula_items/${alvo.id}/phase`).set('B');
  await recusa(liberar('pd', { requestId: 'R2', novoStatus: 'IN_TESTS' }), 'failed-precondition', /alterada depois da ordem/);
  passo('liberarEtapaPd: manipulado libera; versão do lote mexida depois da ordem não libera');

  console.log(`run_manipulacao_lote_servidor_test: OK (${n} passos)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
