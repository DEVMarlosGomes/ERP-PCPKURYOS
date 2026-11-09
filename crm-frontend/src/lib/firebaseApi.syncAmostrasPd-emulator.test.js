// "Sincronizar amostras com o P&D" (09/11/2026) com as peças reais: adaptador do CRM -> regras do banco.
//   cd crm-frontend && firebase emulators:exec --project demo-pd-lote --only database --config ../firebase.pdlote-test.json \
//     "npx vitest run src/lib/firebaseApi.syncAmostrasPd-emulator.test.js"
// Reproduz 08/11: variações migradas do Mongo sem pd_request_id/pd_card_id, com a solicitação ligada
// só por crm_variacao_id ou só um card legado. O botão não pode criar solicitação por cima.
import {describe, test, expect, beforeAll, afterAll} from 'vitest';
vi.mock('firebase/database', () => import('@/test/pdLoteEmulatorFirebase').then((m) => m.databaseModule));
vi.mock('firebase/storage', () => import('@/test/pdLoteEmulatorFirebase').then((m) => m.storageModule));
vi.mock('@/lib/firebase', () => import('@/test/pdLoteEmulatorFirebase').then((m) => m.firebaseModule));
vi.mock('@/lib/servidor', () => import('@/test/pdLoteEmulatorFirebase').then((m) => m.serverModule));

const T = 'erp/kuryos';
describe.skipIf(process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9063' || process.env.GCLOUD_PROJECT !== 'demo-pd-lote')('Sincronizar amostras com o P&D não duplica o que já existe', () => {
  let api, ponte;
  const ler = async (p) => (await ponte.root.ref(p).get()).val() || {};
  beforeAll(async () => {
    ponte = await import('@/test/pdLoteEmulatorFirebase');
    await ponte.root.ref().set({
      usuarios: {adm: {role: 'admin', nome: 'ADM fictício', tenant_id: 'kuryos'}},
      erp: {kuryos: {
        crm_samples: {S1: {id: 'S1', numero_amostra: '2026-1010', nome_produto: 'Bruma', variacoes: [
          {id: 'vAprov', codigo: '2026-1010-a', status: 'aprovada'},
          {id: 'vLegado', codigo: '2026-1010-b', status: 'em_elaboracao'},
          {id: 'vNova', codigo: '2026-1010-c', status: 'solicitada'},
        ]}},
        pd_requests: {R1: {id: 'R1', crm_sample_id: 'S1', crm_variacao_id: 'vAprov', status: 'APPROVED', title: 'Bruma', created_at: '2026-07-16'}},
        pd_cards: {
          C1: {id: 'C1', pd_request_id: 'R1', amostra_id: 'S1', amostra_variacao_id: 'vAprov', status_pd: 'aprovado', status: 'APPROVED'},
          CL: {id: 'CL', amostra_id: 'S1', amostra_variacao_id: 'vLegado', status_pd: 'em_desenvolvimento', origem_migracao: 'mongo_erp_20261014'},
        },
      }},
    });
    ponte.comoUsuario('adm');
    api = (await import('@/lib/firebaseApi')).default;
  }, 90000);
  afterAll(async () => { if (ponte) await ponte.stop(); });

  test('liga a existente, reaproveita o card legado e cria só a que não tinha nada', async () => {
    const {data} = await api.post('/crm/samples/sync-missing-pd-cards', {});
    expect(data).toMatchObject({linked: 1, created: 2, errors: []});
    const reqs = Object.values(await ler(`${T}/pd_requests`));
    expect(reqs.filter((r) => r.crm_variacao_id === 'vAprov').map((r) => r.id)).toEqual(['R1']);
    const legado = reqs.filter((r) => r.crm_variacao_id === 'vLegado');
    expect(legado).toHaveLength(1);
    expect(legado[0].status).toBe('IN_PROGRESS');
    expect(reqs.filter((r) => r.crm_variacao_id === 'vNova')).toHaveLength(1);
    const cards = Object.values(await ler(`${T}/pd_cards`));
    expect(cards).toHaveLength(3);
    expect(cards.find((c) => c.id === 'CL').pd_request_id).toBe(legado[0].id);
    const vars = (await ler(`${T}/crm_samples/S1`)).variacoes;
    expect(vars[0]).toMatchObject({pd_request_id: 'R1', pd_card_id: 'C1', status: 'aprovada'});
    expect(vars[1]).toMatchObject({pd_request_id: legado[0].id, pd_card_id: 'CL'});
  });

  test('segunda vez não cria nada', async () => {
    const {data} = await api.post('/crm/samples/sync-missing-pd-cards', {});
    expect(data).toMatchObject({linked: 0, created: 0});
    expect(Object.keys(await ler(`${T}/pd_requests`))).toHaveLength(3);
  });
});
