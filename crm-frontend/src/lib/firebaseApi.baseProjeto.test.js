// AMO-02 no adaptador: a base do lote vira versão da formulação base do projeto,
// aparece nas demais amostras do mesmo projeto e a variação só troca a fragrância.
import { memory } from "@/test/memoryFirebase";

vi.mock("firebase/database", () => import("@/test/memoryFirebase").then((m) => m.databaseModule));
vi.mock("firebase/storage", () => import("@/test/memoryFirebase").then((m) => m.storageModule));
vi.mock("@/lib/firebase", () => import("@/test/memoryFirebase").then((m) => m.firebaseModule));
vi.mock("@/lib/justificationPrompt", async (orig) => ({ ...(await orig()), askJustification: async () => null }));

const T = "erp/kuryos";
const itensFormula = (fid) => ({
  [`${fid}a`]: { id: `${fid}a`, formula_id: fid, ingredient_name: "Álcool", percentage: 80 },
  [`${fid}b`]: { id: `${fid}b`, formula_id: fid, ingredient_name: "Água", percentage: 18 },
  [`${fid}c`]: { id: `${fid}c`, formula_id: fid, ingredient_name: "Fragrância A", percentage: 2 },
});
const SEED = {
  usuarios: { pd: { role: "pd", name: "Yasmim P&D", tenant_id: "kuryos" } },
  erp: { kuryos: {
    pd_requests: {
      R1: { id: "R1", status: "IN_PROGRESS", internal_code: "2026-031-A1", crm_project_id: "P1" },
      R2: { id: "R2", status: "IN_PROGRESS", internal_code: "2026-031-A2", crm_project_id: "P1" },
      R3: { id: "R3", status: "IN_PROGRESS", internal_code: "2026-040-A1", crm_project_id: "P2" },
    },
    pd_developments: { D1: { id: "D1", request_id: "R1" }, D2: { id: "D2", request_id: "R2" }, D3: { id: "D3", request_id: "R3" } },
    pd_formulas: {
      F1: { id: "F1", development_id: "D1", version: 1 },
      F2: { id: "F2", development_id: "D2", version: 1 },
    },
    pd_formula_items: { ...itensFormula("F1"), ...itensFormula("F2") },
  } },
};

let api;
beforeAll(async () => {
  memory.reset(SEED);
  memory.setUser("pd");
  api = (await import("@/lib/firebaseApi")).default;
});
afterAll(() => memory.restore());

const base = [
  { nome: "Álcool", codigo: "MPGR-00002", inci: "Alcohol", percentual: 80 },
  { nome: "Água", codigo: "MPGR-00010", inci: "Aqua", percentual: 18 },
];
const lote = (formulaId, extra = {}) => ({
  nome: "Lote Fragrâncias", formula_base_id: formulaId, volume_base_ml: 60, base_total_volume_ml: 1000,
  base_reference_ingredients: base.map((i) => i.nome), base_reference_items: base,
  variantes: [{ nome: "Rosa", overrides: [{ ingredient_name_base: "Fragrância A", ingredient_name: "Fragrância Rosa", percentage: 2 }] }],
  ...extra,
});
const bases = () => Object.values(memory.read(`${T}/pd_formulacoes_base`) || {});

let loteV1;
test("salvar o lote grava a base do projeto v1 e o lote guarda a versão", async () => {
  const { data } = await api.post("/pd/developments/D1/sample-batches", lote("F1"));
  loteV1 = data;
  expect(bases()).toHaveLength(1);
  expect(bases()[0]).toMatchObject({ projeto_id: "P1", versao: 1, origem: { amostra: "2026-031-A1" } });
  expect(data).toMatchObject({ formulacao_base_versao: 1, allowed_change_scopes: expect.any(Array) });
});

test("outra amostra do mesmo projeto vê a base; projeto diferente não", async () => {
  const { data } = await api.get("/pd/developments/D2/base-projeto");
  expect(data.base).toMatchObject({ versao: 1, projeto_id: "P1" });
  expect(data.base.itens.map((i) => i.nome)).toEqual(["Álcool", "Água"]);
  const outro = await api.get("/pd/developments/D3/base-projeto");
  expect(outro.data).toEqual({ projeto_id: "P2", base: null });
});

test("mesma base em outra amostra reaproveita a v1 (não duplica)", async () => {
  const { data } = await api.post("/pd/developments/D2/sample-batches", lote("F2"));
  expect(data.formulacao_base_versao).toBe(1);
  expect(bases()).toHaveLength(1);
});

test("base diferente vira v2; o lote antigo continua na v1", async () => {
  const comConservante = [...base, { nome: "Fenoxietanol", percentual: 0.5 }];
  const { data } = await api.post("/pd/developments/D2/sample-batches", lote("F2", { nome: "Lote 2", base_reference_items: comConservante }));
  expect(data.formulacao_base_versao).toBe(2);
  expect(memory.read(`${T}/pd_sample_batches/${loteV1.id}/formulacao_base_versao`)).toBe(1);
  expect((await api.get("/pd/developments/D1/base-projeto")).data.base.versao).toBe(2);
});

test("variação que troca ingrediente da base é recusada (422)", async () => {
  const errado = lote("F1", { nome: "Lote errado", variantes: [{ nome: "Água floral", overrides: [{ ingredient_name_base: "Água", ingredient_name: "Água de rosas", percentage: 18 }] }] });
  await expect(api.post("/pd/developments/D1/sample-batches", errado)).rejects.toMatchObject({ response: { status: 422 } });
});
