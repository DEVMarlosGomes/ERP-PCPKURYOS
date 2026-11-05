// Manipulação em lote de ponta a ponta com as peças reais: adaptador do CRM -> regras do banco ->
// callables do servidor (manipulacaoLoteServidor, liberarEtapaPd, registrarAuditoriaCrm). Roda só com:
//   cd crm-frontend && firebase emulators:exec --project demo-pd-lote --only database --config ../firebase.pdlote-test.json \
//     "npx vitest run src/lib/firebaseApi.lote-emulator.test.js"
import {describe, test, expect, beforeAll, afterAll} from 'vitest';
vi.mock('firebase/database', () => import('@/test/pdLoteEmulatorFirebase').then((m) => m.databaseModule));
vi.mock('firebase/storage', () => import('@/test/pdLoteEmulatorFirebase').then((m) => m.storageModule));
vi.mock('@/lib/firebase', () => import('@/test/pdLoteEmulatorFirebase').then((m) => m.firebaseModule));
vi.mock('@/lib/servidor', () => import('@/test/pdLoteEmulatorFirebase').then((m) => m.serverModule));
vi.mock('@/lib/justificationPrompt', async (orig) => ({...(await orig()), askJustification: async () => null}));

const T = 'erp/kuryos';
const it = (id, f, nome, pct, extra = {}) => [id, {id, formula_id: f, ingredient_name: nome, percentage: pct, phase: 'A', master_material_id: nome.toUpperCase().replace(/[^A-Z]/g, ''), price_per_kg: 12, ...extra}];

describe.skipIf(process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9063' || process.env.GCLOUD_PROJECT !== 'demo-pd-lote')('Manipulação em lote: adaptador, regras e servidor reais', () => {
  let api, ponte;
  const ler = async (p) => (await ponte.root.ref(p).get()).val();
  beforeAll(async () => {
    ponte = await import('@/test/pdLoteEmulatorFirebase');
    vi.doMock('@/lib/servidor', () => ponte.serverModule);
    await ponte.root.ref().set({
      usuarios: {
        pd: {role: 'pd', nome: 'Química fictícia', tenant_id: 'kuryos'}, pd2: {role: 'formulador', nome: 'Conferente fictícia', tenant_id: 'kuryos'},
        pcp: {role: 'pcp', nome: 'PCP fictício', tenant_id: 'kuryos'},
      },
      materiais: {FENOXIETANOL: {mpNome: 'Fenoxietanol', chaveDuplicidade: 'FENOXIETANOL', criticoPd: true}},
      config: {linhas: ['Linha 1']},
      erp: {kuryos: {
        crm_projects: {P1: {id: 'P1', numero_projeto: '2026-900', nome_projeto: 'Projeto fictício'}},
        crm_samples: {
          S1: {id: 'S1', projeto_id: 'P1', nome_produto: 'Creme fictício', quantidade_por_variacao: 50, unidade_quantidade: 'g',
            variacoes: [{id: 'v1', codigo: '2026-9000-a', pd_request_id: 'R1'}, {id: 'v2', codigo: '2026-9000-b', pd_request_id: 'R2'}]},
          S2: {id: 'S2', projeto_id: 'P1', nome_produto: 'Creme fictício', quantidade_por_variacao: 30, unidade_quantidade: 'g',
            variacoes: [{id: 'v3', codigo: '2026-9000-c', pd_request_id: 'R3'}]},
        },
        pd_requests: {
          R1: {id: 'R1', status: 'OPEN', internal_code: '2026-9000-a', crm_project_id: 'P1', crm_sample_id: 'S1', crm_variacao_id: 'v1'},
          R2: {id: 'R2', status: 'IN_PROGRESS', internal_code: '2026-9000-b', crm_project_id: 'P1', crm_sample_id: 'S1', crm_variacao_id: 'v2'},
          R3: {id: 'R3', status: 'OPEN', internal_code: '2026-9000-c', crm_project_id: 'P1', crm_sample_id: 'S2', crm_variacao_id: 'v3'},
        },
        pd_developments: {D1: {id: 'D1', request_id: 'R1'}, D2: {id: 'D2', request_id: 'R2'}, D3: {id: 'D3', request_id: 'R3'}},
        pd_formulas: {
          F1: {id: 'F1', development_id: 'D1', version: 1, updated_at: '2026-11-01T10:00:00Z', volume: 50},
          F2: {id: 'F2', development_id: 'D2', version: 2, locked: true, updated_at: '2026-11-03T10:00:00Z', volume: 50, indice_perdas: 2, name: 'Base fictícia'},
        },
        pd_formula_items: Object.fromEntries([
          it('i1a', 'F1', 'Agua', 85), it('i1b', 'F1', 'Fragrancia Rosa', 15, {function: 'fragrância'}),
          it('i2a', 'F2', 'Agua', 79), it('i2b', 'F2', 'Fenoxietanol', 1), it('i2d', 'F2', 'Fragrancia Lavanda', 20, {function: 'fragrância'}),
        ]),
        pd_cards: {
          C1: {id: 'C1', pd_request_id: 'R1', amostra_id: 'S1', amostra_variacao_id: 'v1'}, C2: {id: 'C2', pd_request_id: 'R2', amostra_id: 'S1', amostra_variacao_id: 'v2'},
          C3: {id: 'C3', pd_request_id: 'R3', amostra_id: 'S2', amostra_variacao_id: 'v3'},
        },
      }},
    });
    ponte.comoUsuario('pd');
    api = (await import('@/lib/firebaseApi')).default;
  }, 90000);
  afterAll(async () => { if (ponte) await ponte.stop(); });

  test('monta, salva, gera a ordem, pesa, confere, registra e leva a Em Testes — sem perder a variação irmã', async () => {
    const {data: lote} = await api.post('/pd/manipulacao-lotes', {projeto_id: 'P1', request_ids: ['R1', 'R2', 'R3']});
    expect(lote).toMatchObject({codigo: 'LM-2026-900-1', status: 'rascunho', revisao: 1, matriz: {ref_id: 'F2'}});
    const k = (nome) => Object.keys(lote.ingredientes).find((x) => lote.ingredientes[x].nome === nome);
    const celulas = {
      R1: {[k('Agua')]: 79, [k('Fenoxietanol')]: 1, [k('Fragrancia Rosa')]: 20},
      R2: lote.celulas.R2,
      R3: {[k('Agua')]: 78.5, [k('Fenoxietanol')]: 1, [k('Fragrancia Lavanda')]: 20.5},
    };
    const corpo = {revisao: 1, ingredientes: lote.ingredientes, celulas, motivos: {R3: {[k('Agua')]: {texto: 'compensar a fragrância'}}}, pre_mistura: {A: true}, perda_pct: 2,
      quantidades: {R1: {quantidade_g: 50}, R2: {quantidade_g: 50}, R3: {quantidade_g: 30}}};
    const salvo = (await api.put(`/pd/manipulacao-lotes/${lote.id}`, corpo)).data;
    expect(salvo.pendencias).toEqual([]);
    expect(await ler(`${T}/pd_manipulacao_lotes/${lote.id}/revisao`)).toBe(2);
    expect(await ler(`${T}/pd_requests/R1/status`)).toBe('IN_PROGRESS');

    // Outra química com a revisão velha: o adaptador recusa; o banco também (regra da revisão).
    ponte.comoUsuario('pd2');
    await expect(api.put(`/pd/manipulacao-lotes/${lote.id}`, {...corpo, perda_pct: 3})).rejects.toThrow(/mudou/);
    const L = `${T}/pd_manipulacao_lotes/${lote.id}`;
    await expect(ponte.databaseModule.update(ponte.databaseModule.ref(null, ''), {[`${L}/revisao`]: 2, [`${L}/perda_pct`]: 3})).rejects.toThrow(/permission/i);
    ponte.comoUsuario('pcp');
    await expect(api.put(`/pd/manipulacao-lotes/${lote.id}`, {...corpo, revisao: 2})).rejects.toThrow(/só consulta/);

    // Ordem pelo servidor real.
    ponte.comoUsuario('pd');
    const {data: ordem} = await api.post(`/pd/manipulacao-lotes/${lote.id}/gerar-ordem`, {revisao: 2});
    expect(ordem.lote.status).toBe('ordem_gerada');
    const linhas = ordem.lote.ordem.linhas_pesagem;
    await expect(api.put(`/pd/manipulacao-lotes/${lote.id}`, {...corpo, revisao: ordem.lote.revisao})).rejects.toThrow(/só muda em rascunho/);

    // Pesagem (química), conferência (colega), registro.
    await api.post(`/pd/manipulacao-lotes/${lote.id}/pesagens`, {linhas: Object.fromEntries(Object.entries(linhas).map(([id, l]) => [id, {real_g: l.teorico_g, lote_mp: 'LT-1'}]))});
    await expect(api.post(`/pd/manipulacao-lotes/${lote.id}/conferir`, {linhas: Object.keys(linhas)})).rejects.toThrow(/outra pessoa/);
    ponte.comoUsuario('pd2');
    await api.post(`/pd/manipulacao-lotes/${lote.id}/conferir`, {linhas: Object.keys(linhas)});
    ponte.comoUsuario('pd');
    const pesado = Object.values(linhas).reduce((s, l) => s + Math.round(l.teorico_g * 100), 0) / 100;
    const {data: reg} = await api.post(`/pd/manipulacao-lotes/${lote.id}/registrar-manipulacao`,
      {entregue: {R1: 50, R2: 50, R3: 30}, perda_declarada_g: Math.round((pesado - 130) * 100) / 100});
    expect(reg.lote.status).toBe('manipulado');

    // Ações em lote: Em Testes uma por vez, pela rota real (liberarEtapaPd + regra do status).
    const {data: acoes} = await api.post(`/pd/manipulacao-lotes/${lote.id}/acoes`, {acao: 'em_testes'});
    expect(acoes.resultados.map((x) => [x.request_id, x.ok, x.mensagem])).toEqual([['R1', true, 'Em Testes'], ['R2', true, 'Em Testes'], ['R3', true, 'Em Testes']]);
    for (const r of ['R1', 'R2', 'R3']) expect(await ler(`${T}/pd_requests/${r}/status`)).toBe('IN_TESTS');
    const s1 = await ler(`${T}/crm_samples/S1`);
    expect(s1.variacoes.map((v) => v.codigo)).toEqual(['2026-9000-a', '2026-9000-b']);
    expect(s1.variacoes.map((v) => v.status_pd_raw)).toEqual(['em_testes', 'em_testes']);
    expect(s1.variacoes.every((v) => v.lote_manipulacao?.codigo === 'LM-2026-900-1')).toBe(true);
    const final = await ler(`${T}/pd_manipulacao_lotes/${lote.id}`);
    const vR1 = await ler(`${T}/pd_formulas/${final.membros.R1.formula_id_lote}`);
    expect(vR1).toMatchObject({version: 2, locked: true, origem_lote: {codigo: 'LM-2026-900-1'}});
    expect(await ler(`${T}/pd_formulas/F2/version`)).toBe(2);
    expect(Object.values(await ler(`${T}/audit_log`) || {}).some((a) => a.action === 'pd_lote_salvo')).toBe(true);
  }, 120000);
});
