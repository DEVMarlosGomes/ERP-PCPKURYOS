// AMO-03 no adaptador: concluir a manipulação (Em Testes) ou entregar ao cliente
// (Aguardando Aprovação) com fórmula ou variante fora de 100% → 422 estruturado.
import { memory } from "@/test/memoryFirebase";

vi.mock("firebase/database", () => import("@/test/memoryFirebase").then((m) => m.databaseModule));
vi.mock("firebase/storage", () => import("@/test/memoryFirebase").then((m) => m.storageModule));
vi.mock("@/lib/firebase", () => import("@/test/memoryFirebase").then((m) => m.firebaseModule));
vi.mock("@/lib/justificationPrompt", async (orig) => ({ ...(await orig()), askJustification: async () => null }));

const T = "erp/kuryos";
const SEED = {
  usuarios: { pd: { role: "pd", name: "Yasmim P&D", tenant_id: "kuryos" } },
  erp: { kuryos: {
    pd_requests: {
      R1: { id: "R1", status: "IN_PROGRESS", title: "Body Splash", assigned_to_name: "Yasmim" },
      R2: { id: "R2", status: "IN_TESTS", title: "Colônia" },
    },
    pd_developments: { D1: { id: "D1", request_id: "R1" }, D2: { id: "D2", request_id: "R2" } },
    pd_formulas: {
      F1: { id: "F1", development_id: "D1", version: 1, name: "Body Splash" },
      F2: { id: "F2", development_id: "D2", version: 1, name: "Colônia" },
    },
    pd_formula_items: {
      I1: { id: "I1", formula_id: "F1", ingredient_name: "Álcool", percentage: 80 },
      I2: { id: "I2", formula_id: "F1", ingredient_name: "Água", percentage: 19.5 },
      J1: { id: "J1", formula_id: "F2", ingredient_name: "Álcool", percentage: 80 },
      J2: { id: "J2", formula_id: "F2", ingredient_name: "Água", percentage: 18 },
      J3: { id: "J3", formula_id: "F2", ingredient_name: "Fragrância A", percentage: 2 },
    },
    pd_sample_batches: {
      L1: { id: "L1", development_id: "D2", nome: "Lote Out", formula_base_id: "F2", status_base: "ativa", variantes: [
        { id: "v1", nome: "Rosa", overrides: [{ ingredient_name_base: "Fragrância A", ingredient_name: "Fragrância B", percentage: 3 }] },
      ] },
    },
  } },
};

let api;
beforeAll(async () => {
  memory.reset(SEED);
  memory.setUser("pd");
  api = (await import("@/lib/firebaseApi")).default;
});
afterAll(() => memory.restore());

const detalhe = async (promessa) => {
  try { await promessa; } catch (err) { return { status: err.response?.status, detail: err.response?.data?.detail }; }
  throw new Error("deveria ter recusado");
};

test("fórmula com 99,5% não vai para Em Testes (422, falta 0,5%) e o status não muda", async () => {
  const r = await detalhe(api.put("/pd/requests/R1/status", { new_status: "IN_TESTS" }));
  expect(r.status).toBe(422);
  expect(r.detail).toMatchObject({ codigo: "FORMULA_NAO_FECHA_100", responsavel: "Yasmim" });
  expect(r.detail.linhas).toEqual(["Fórmula v1: Soma 99,5% — falta 0,5%."]);
  expect(memory.read(`${T}/pd_requests/R1/status`)).toBe("IN_PROGRESS");
  expect(memory.read(`${T}/pd_formulas/F1/locked`)).toBeUndefined();
});

test("completou a fórmula: o servidor libera (INF-04) e passa", async () => {
  const { liberarEtapaPd } = await import("@/lib/servidor");
  vi.mocked(liberarEtapaPd).mockClear();
  memory.write(`${T}/pd_formula_items/I2/percentage`, 20);
  await api.put("/pd/requests/R1/status", { new_status: "IN_TESTS" });
  expect(memory.read(`${T}/pd_requests/R1/status`)).toBe("IN_TESTS");
  expect(vi.mocked(liberarEtapaPd)).toHaveBeenCalledWith("R1", "IN_TESTS", false);
});

test("servidor recusa (422 com as linhas): o status não muda", async () => {
  const { liberarEtapaPd } = await import("@/lib/servidor");
  const erro = Object.assign(new Error("A fórmula precisa fechar 100% para concluir."), {
    response: { status: 422, data: { detail: { codigo: "FORMULA_NAO_FECHA_100", linhas: ["Fórmula v1: Soma 99% — falta 1%."] } } },
  });
  vi.mocked(liberarEtapaPd).mockRejectedValueOnce(erro);
  memory.write(`${T}/pd_requests/R1/status`, "IN_PROGRESS");
  const r = await detalhe(api.put("/pd/requests/R1/status", { new_status: "IN_TESTS" }));
  expect(r.status).toBe(422);
  expect(r.detail.codigo).toBe("FORMULA_NAO_FECHA_100");
  expect(memory.read(`${T}/pd_requests/R1/status`)).toBe("IN_PROGRESS");
});

test("variante do lote fora de 100% não é entregue ao cliente", async () => {
  const r = await detalhe(api.put("/pd/requests/R2/status", { new_status: "WAITING_APPROVAL" }));
  expect(r.status).toBe(422);
  expect(r.detail.linhas).toEqual(["Lote Lote Out · Rosa: Soma 101% — excede 1%."]);
  expect(memory.read(`${T}/pd_requests/R2/status`)).toBe("IN_TESTS");
});

test("lote encerrado não é conferido", async () => {
  memory.write(`${T}/pd_sample_batches/L1/status_base`, "encerrada");
  const r = await detalhe(api.put("/pd/requests/R2/status", { new_status: "WAITING_APPROVAL" }));
  // passa do fechamento e cai na regra seguinte, que já existia (leitura D48h).
  expect(r.detail).toContain("D48h");
});
