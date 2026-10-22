// Cobertura do adaptador: toda rota que as telas do fluxo comercial chamam
// (CRM1/2/3 → orçamento → kickoff → contrato CGI → SKU → pedido) precisa ser
// atendida pelo Firebase. 404/400/409 são respostas válidas (registro inexistente,
// payload vazio); 501 significa "rota não adaptada" e quebra a tela.
import { memory } from "@/test/memoryFirebase";

vi.mock("firebase/database", () => import("@/test/memoryFirebase").then((m) => m.databaseModule));
vi.mock("firebase/storage", () => import("@/test/memoryFirebase").then((m) => m.storageModule));
vi.mock("@/lib/firebase", () => import("@/test/memoryFirebase").then((m) => m.firebaseModule));
vi.mock("@/lib/justificationPrompt", async (orig) => ({ ...(await orig()), askJustification: async () => null }));

const ROUTES = [
  ["GET", "/crm/constants"], ["GET", "/crm/users-list"],
  ["GET", "/crm/clients"], ["POST", "/crm/clients"], ["GET", "/crm/clients/x/full"], ["PUT", "/crm/clients/x"],
  ["PUT", "/crm/clients/x/move"], ["DELETE", "/crm/clients/x"],
  ["GET", "/crm/projects"], ["POST", "/crm/projects/batch"], ["POST", "/crm/projects/sync-approved"],
  ["GET", "/crm/projects/x/full"], ["PUT", "/crm/projects/x"], ["PUT", "/crm/projects/x/move"], ["DELETE", "/crm/projects/x"],
  ["GET", "/crm/projects/x/amostras-status"], ["GET", "/crm/projects/x/material-requirements"],
  ["GET", "/crm/projects/x/proposta"], ["POST", "/crm/projects/x/proposta"], ["PATCH", "/crm/projects/x/proposta"],
  ["POST", "/crm/projects/x/proposta/decisao"],
  ["GET", "/crm/samples"], ["GET", "/crm/samples/x"], ["PUT", "/crm/samples/x"], ["DELETE", "/crm/samples/x"],
  ["POST", "/crm/samples/batch/v2"], ["POST", "/crm/samples/sync-missing-pd-cards"],
  ["POST", "/crm/samples/x/variacoes"], ["PUT", "/crm/samples/x/variacoes/y"], ["DELETE", "/crm/samples/x/variacoes/y"],
  ["POST", "/crm/samples/x/variacoes/y/resultado-cliente"], ["GET", "/crm/pd/cards/x"], ["GET", "/pd/samples/x/label.pdf"],
  ["GET", "/kickoffs"], ["GET", "/kickoffs?status=aprovado"], ["GET", "/kickoff/x"], ["PUT", "/kickoff/x/questionario-composicao"],
  ["POST", "/kickoff/x/aprovacao"], ["POST", "/kickoff/x/bom/export"], ["DELETE", "/kickoff/x"], ["POST", "/kickoff/x/restore"],
  ["GET", "/contratos"], ["POST", "/contratos/gerar"], ["POST", "/contratos/x/assinar"], ["GET", "/contratos/x/pdf"],
  ["GET", "/crm/skus"], ["PUT", "/crm/skus/x"], ["GET", "/crm/skus/x/saldo"], ["POST", "/crm/skus/x/descontinuar"],
  ["POST", "/crm/skus/x/meta"], ["POST", "/crm/skus/x/orders"],
  ["GET", "/orders"], ["GET", "/orders/reorder/x"], ["POST", "/orders/generator"], ["POST", "/orders/x/attachments"], ["POST", "/orders/direct"],
];

let api;
beforeAll(async () => {
  memory.reset({ usuarios: { adm: { role: "admin", name: "Ana ADM", tenant_id: "kuryos" } } });
  memory.setUser("adm");
  api = (await import("@/lib/firebaseApi")).default;
});
afterAll(() => memory.restore());

test.each(ROUTES)("%s %s é atendida pelo adaptador", async (method, url) => {
  let status = 200;
  try { await api.request({ method, url, data: {} }); } catch (error) { status = error.response?.status ?? `throw: ${error.message}`; }
  expect(status).not.toBe(501);
  expect(String(status)).not.toMatch(/^throw/);
});
