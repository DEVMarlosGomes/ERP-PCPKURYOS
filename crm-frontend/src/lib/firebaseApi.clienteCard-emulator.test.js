// Card do cliente <-> Cadastros (08/11/2026) com as peças reais: adaptador do CRM -> regras do banco.
//   cd crm-frontend && firebase emulators:exec --project demo-pd-lote --only database --config ../firebase.pdlote-test.json \
//     "npx vitest run src/lib/firebaseApi.clienteCard-emulator.test.js"
import {describe, test, expect, beforeAll, afterAll} from 'vitest';
vi.mock('firebase/database', () => import('@/test/pdLoteEmulatorFirebase').then((m) => m.databaseModule));
vi.mock('firebase/storage', () => import('@/test/pdLoteEmulatorFirebase').then((m) => m.storageModule));
vi.mock('@/lib/firebase', () => import('@/test/pdLoteEmulatorFirebase').then((m) => m.firebaseModule));
vi.mock('@/lib/servidor', () => import('@/test/pdLoteEmulatorFirebase').then((m) => m.serverModule));

const T = 'erp/kuryos';
describe.skipIf(process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9063' || process.env.GCLOUD_PROJECT !== 'demo-pd-lote')('Card do cliente e Cadastros: ida e volta com histórico', () => {
  let api, ponte;
  const ler = async (p) => (await ponte.root.ref(p).get()).val();
  beforeAll(async () => {
    ponte = await import('@/test/pdLoteEmulatorFirebase');
    await ponte.root.ref().set({
      usuarios: {
        vend: {role: 'vendedor', nome: 'Vendedora fictícia', tenant_id: 'kuryos'},
        pcp: {role: 'pcp', nome: 'PCP fictício', tenant_id: 'kuryos'},
      },
      clientes: {MISS: {nome: 'Miss Rose', codigo: 'MISS', ativo: true, cidade: 'São Paulo', uf: 'SP', contatosVersao: 1,
        contatos: {c1: {nome: 'Cirilo', email: 'cirilo@x.com', telefone: '11956886592', areas: ['COMERCIAL'], principais: ['COMERCIAL']},
          c2: {nome: 'Ana', email: 'ana@x.com', telefone: '', areas: ['FINANCEIRO'], principais: ['FINANCEIRO'], observacoes: 'boletos'}}}},
      erp: {kuryos: {crm_clients: {}}},
    });
    ponte.comoUsuario('vend');
    api = (await import('@/lib/firebaseApi')).default;
  }, 90000);
  afterAll(async () => { if (ponte) await ponte.stop(); });

  test('Cadastros -> card: a lista inteira de contatos chega ao card', async () => {
    const {data} = await api.get('/crm/clients');
    const card = data.find((c) => c.cadastro_cliente_id === 'MISS');
    expect(card.contato_principal).toMatchObject({cadastro_contato_id: 'c1', nome: 'Cirilo'});
    expect(card.contatos_adicionais.map((c) => c.nome)).toEqual(['Ana']);
  });

  test('card -> Cadastros: contato novo e cidade vão para clientes/, com histórico nos dois lados', async () => {
    const card = (await api.get('/crm/clients')).data.find((c) => c.cadastro_cliente_id === 'MISS');
    const {data} = await api.put(`/crm/clients/${card.id}`, {
      cidade: 'Campinas',
      contato_principal: {...card.contato_principal, decisor: true, cargo: 'comprador'},
      contatos_adicionais: [...card.contatos_adicionais, {nome: 'Bia nova', whatsapp: '1188', email: ''}],
    });
    expect(data.aviso_cadastro).toBeUndefined();
    const m = await ler('clientes/MISS');
    expect(m.cidade).toBe('Campinas');
    expect(Object.values(m.contatos).map((c) => c.nome)).toEqual(['Cirilo', 'Ana', 'Bia nova']);
    expect(m.contatos.c2.observacoes).toBe('boletos');
    const hist = Object.values(m.historicoAlteracoes);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({por: 'Vendedora fictícia', porUid: 'vend', origem: 'crm_card'});
    expect(hist[0].campos).toEqual(expect.arrayContaining(['Cidade', 'Contatos']));
    expect(m.ultimaAlteracao.origem).toBe('crm_card');
    const cardDepois = await ler(`${T}/crm_clients/${card.id}`);
    expect(cardDepois.historico_alteracoes.at(-1)).toMatchObject({usuario: 'Vendedora fictícia', origem: 'crm_card', cadastro: 'atualizado'});
    expect(cardDepois.cadastro_sync_pendente).toBeUndefined();
  });

  test('voltar à lista não reescreve nem duplica histórico; cargo/decisor do card ficam', async () => {
    const card = (await api.get('/crm/clients')).data.find((c) => c.cadastro_cliente_id === 'MISS');
    expect(card.contato_principal).toMatchObject({nome: 'Cirilo', decisor: true, cargo: 'comprador'});
    expect(card.contatos_adicionais.map((c) => c.nome)).toEqual(['Ana', 'Bia nova']);
    expect(card.contatos_adicionais[1].cadastro_contato_id).toMatch(/^crm_/);
    expect(card.historico_alteracoes).toHaveLength(1);
  });

  test('Cadastros altera -> card mostra a mudança com quem alterou', async () => {
    ponte.comoUsuario('pcp');
    await ponte.root.ref('clientes/MISS').update({cidade: 'Jundiaí', atualizadoPor: 'PCP fictício', ultimaAlteracao: {origem: 'cadastros', por: 'PCP fictício', em: '2026-11-08T13:00:00.000Z'}});
    ponte.comoUsuario('vend');
    const card = (await api.get('/crm/clients')).data.find((c) => c.cadastro_cliente_id === 'MISS');
    expect(card.cidade).toBe('Jundiaí');
    expect(card.historico_alteracoes.at(-1)).toMatchObject({usuario: 'PCP fictício', origem: 'cadastros', campos: ['Cidade']});
  });
});
