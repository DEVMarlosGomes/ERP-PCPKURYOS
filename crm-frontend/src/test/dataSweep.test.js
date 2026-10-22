// Varredura com dados reais: carrega um snapshot do banco (DATA_SEED=arquivo.json, no
// formato da raiz do RTDB) e chama, como ADM, todas as leituras que as telas de CRM e
// P&D fazem — para cada registro. Erro 5xx ou exceção quebra o teste; 4xx é listado.
// Uso: DATA_SEED=/caminho/seed.json npx vitest run src/test/dataSweep.test.js
import fs from "node:fs";
import { memory } from "@/test/memoryFirebase";

vi.mock("firebase/database", () => import("@/test/memoryFirebase").then((m) => m.databaseModule));
vi.mock("firebase/storage", () => import("@/test/memoryFirebase").then((m) => m.storageModule));
vi.mock("@/lib/firebase", () => import("@/test/memoryFirebase").then((m) => m.firebaseModule));
vi.mock("@/lib/justificationPrompt", async (orig) => ({ ...(await orig()), askJustification: async () => null }));

const SEED = process.env.DATA_SEED;

describe.skipIf(!SEED)("varredura das telas de CRM e P&D com dados reais", () => {
  let api;
  let data;
  beforeAll(async () => {
    const seed = JSON.parse(fs.readFileSync(SEED, "utf8"));
    seed.usuarios = { ...(seed.usuarios || {}), __sweep_admin: { role: "admin", name: "Varredura", tenant_id: "kuryos" } };
    memory.reset(seed);
    memory.setUser("__sweep_admin");
    api = (await import("@/lib/firebaseApi")).default;
    data = seed.erp?.kuryos || {};
  });
  afterAll(() => memory.restore());

  test("todas as leituras respondem sem erro de servidor", async () => {
    const ids = (col) => Object.keys(data[col] || {});
    const routes = [
      "/crm/constants", "/crm/users-list", "/crm/clients", "/crm/projects", "/crm/samples", "/crm/pd/cards", "/crm/skus",
      "/kickoffs", "/kickoffs?status=aprovado", "/contratos", "/orders", "/pd/requests", "/pd/formulas/bank", "/pd/catalog",
      "/pd/homologacao/dashboard", "/pd/homologacao/fornecedores", "/pd/homologacao/mps", "/pd/metrics", "/pd/stock",
      "/pd/stock/alerts", "/cadastros/materiais", "/cadastros/fragrancias", "/compras/fornecedores",
      "/crm/admin/cards/client", "/crm/admin/cards/project", "/crm/admin/cards/sample",
      ...ids("crm_clients").flatMap((id) => [`/crm/clients/${id}/full`, `/crm/admin/cards/client/${id}`]),
      ...ids("crm_projects").flatMap((id) => [`/crm/projects/${id}/full`, `/crm/projects/${id}/proposta`, `/crm/projects/${id}/amostras-status`, `/crm/projects/${id}/material-requirements`]),
      ...ids("crm_samples").map((id) => `/crm/samples/${id}`),
      ...ids("pd_cards").map((id) => `/crm/pd/cards/${id}`),
      ...ids("pd_requests").flatMap((id) => [`/pd/requests/${id}/full`, `/pd/requests/${id}/ficha-tecnica`, `/pd/requests/${id}/ficha-tecnica-ui`,
        `/pd/requests/${id}/stability-study`, `/pd/requests/${id}/live-documents/ficha_tecnica/versions`, `/pd/requests/${id}/live-documents/epa/versions`]),
      ...ids("pd_formulas").flatMap((id) => [`/pd/formulas/${id}/items`, `/pd/formulas/${id}/phases`, `/pd/formulas/${id}/costs`]),
      ...ids("pd_developments").map((id) => `/pd/developments/${id}/sample-batches`),
      ...ids("pd_catalog").map((id) => `/pd/catalog/${id}/price-history`),
      ...ids("pd_document_versions").map((id) => `/pd/document-versions/${id}/diff`),
      ...ids("pd_stock").map((id) => `/pd/stock/${id}/movements`),
      ...ids("kickoffs").flatMap((id) => [`/kickoff/${id}`, `/kickoff/${id}/bom`, `/kickoff/${id}/historico`]),
      ...ids("contratos").flatMap((id) => [`/contratos/${id}`, `/contratos/${id}/pdf`]),
    ];
    const serverErrors = [];
    const clientErrors = [];
    for (const url of routes) {
      try {
        await api.get(url);
      } catch (error) {
        const status = error.response?.status;
        const line = `${status ?? "exceção"} GET ${url}: ${error.message}`;
        (status && status < 500 ? clientErrors : serverErrors).push(line);
      }
    }
    console.log(`varredura: ${routes.length} leituras, ${serverErrors.length} erro(s) de servidor/exceção, ${clientErrors.length} resposta(s) 4xx`);
    if (clientErrors.length) console.log(clientErrors.slice(0, 40).join("\n"));
    if (serverErrors.length) console.log(serverErrors.slice(0, 40).join("\n"));
    expect(serverErrors).toEqual([]);
  }, 600000);

  test("os dados aparecem nas listas e os vínculos se resolvem", async () => {
    const count = (col) => Object.keys(data[col] || {}).length;
    const clients = (await api.get("/crm/clients")).data;
    expect(clients.length).toBeGreaterThanOrEqual(count("crm_clients"));
    expect((await api.get("/crm/projects")).data.length).toBe(count("crm_projects"));
    expect((await api.get("/crm/samples")).data.length).toBe(count("crm_samples"));
    const requests = (await api.get("/pd/requests")).data;
    expect(requests.length).toBe(count("pd_requests"));
    // Projeto -> cliente e amostras; solicitação P&D -> fórmulas.
    const orphans = [];
    for (const id of Object.keys(data.crm_projects || {})) {
      const full = (await api.get(`/crm/projects/${id}/full`)).data;
      if (!(full.client || full.cliente)) orphans.push(`projeto ${id} sem cliente`);
    }
    let withFormulas = 0;
    for (const id of Object.keys(data.pd_requests || {})) {
      const full = (await api.get(`/pd/requests/${id}/full`)).data;
      if ((full.formulas || []).length) withFormulas += 1;
    }
    const formulaRequests = new Set(Object.values(data.pd_formulas || {}).map((f) => (data.pd_developments || {})[f.development_id]?.request_id).filter(Boolean)).size;
    console.log(`listas: ${clients.length} clientes, ${requests.length} solicitações P&D; ${withFormulas}/${formulaRequests} solicitações com fórmula exibem fórmulas; órfãos: ${orphans.length}`);
    if (orphans.length) console.log(orphans.join("\n"));
    expect(withFormulas).toBe(formulaRequests);
  }, 600000);
});
