// LM-13 — ensaio da manipulação em lote com a fotografia da base (dados reais em CÓPIA, no emulador).
// A fotografia fica fora do Git (pasta indicada em ENSAIO_FOTO, apagada ao fim); este arquivo não tem dado.
//   cd crm-frontend && ENSAIO_FOTO=/caminho/da/foto firebase emulators:exec --project demo-pd-lote --only database \
//     --config ../firebase.pdlote-test.json "npx vitest run src/lib/firebaseApi.lote-ensaio.test.js"
// Escolhe o projeto real com mais amostras elegíveis, monta o lote como a química faria (quem não fecha 100 %
// recebe a matriz; diferença ganha motivo), gera a ordem, pesa, confere, registra e leva a Em Testes. Confere:
// ordem do lote = soma das ordens individuais (0,01 g por linha), massa conciliada, irmãs do CRM intactas.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { NIVEL, diferencas, fechamentoPorMembro, ordemIndividual } from "@/lib/manipulacaoLote";
import { variacaoEntreSkus } from "@/lib/kickoffAutopreenchimento";
vi.mock("firebase/database", () => import("@/test/pdLoteEmulatorFirebase").then((m) => m.databaseModule));
vi.mock("firebase/storage", () => import("@/test/pdLoteEmulatorFirebase").then((m) => m.storageModule));
vi.mock("@/lib/firebase", () => import("@/test/pdLoteEmulatorFirebase").then((m) => m.firebaseModule));
vi.mock("@/lib/servidor", () => import("@/test/pdLoteEmulatorFirebase").then((m) => m.serverModule));
vi.mock("@/lib/justificationPrompt", async (orig) => ({ ...(await orig()), askJustification: async () => null }));

const FOTO = process.env.ENSAIO_FOTO || "";
const pronto = FOTO && existsSync(FOTO) && process.env.FIREBASE_DATABASE_EMULATOR_HOST === "127.0.0.1:9063" && process.env.GCLOUD_PROJECT === "demo-pd-lote";
const ler = (n) => { const f = path.join(FOTO, `${n}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8") || "null") : null; };
const T = "erp/kuryos";
const cg = (g) => Math.round(Number(g) * 100);

describe.skipIf(!pronto)("LM-13: ensaio com a fotografia da base", () => {
  let api, ponte;
  const lerDb = async (p) => (await ponte.root.ref(p).get()).val();
  beforeAll(async () => {
    ponte = await import("@/test/pdLoteEmulatorFirebase");
    vi.doMock("@/lib/servidor", () => ponte.serverModule);
    const colecoes = ["crm_projects", "crm_samples", "pd_requests", "pd_developments", "pd_formulas", "pd_formula_items", "pd_formula_phases", "pd_formulacoes_base", "pd_cards", "pd_sample_batches", "pd_catalog"];
    await ponte.root.ref().set({
      usuarios: { pd: { role: "pd", nome: "Química (ensaio)", tenant_id: "kuryos" }, pd2: { role: "formulador", nome: "Conferente (ensaio)", tenant_id: "kuryos" },
        adm: { role: "admin", nome: "Diretoria (ensaio)", tenant_id: "kuryos" } },
      materiais: ler("materiais") || {}, solicitacoes_cadastro_material: ler("solicitacoes_cadastro_material") || {},
      config: { linhas: ["Linha 1"], cambio: ler("cambio") || {} },
      erp: { kuryos: Object.fromEntries(colecoes.map((c) => [c, ler(c) || {}])) },
    });
    ponte.comoUsuario("pd");
    api = (await import("@/lib/firebaseApi")).default;
  }, 180000);
  afterAll(async () => { if (ponte) await ponte.stop(); });

  test("projeto real com mais amostras: do lote a Em Testes, ordem = soma das individuais, massa conciliada", async () => {
    const t0 = Date.now();
    const tempos = {};
    const marca = (k, desde) => { tempos[k] = Date.now() - desde; };
    // 1. Projeto com mais elegíveis.
    const projetos = Object.keys((await lerDb(`${T}/crm_projects`)) || {});
    let melhor = null;
    for (const p of projetos) {
      const { data } = await api.get(`/pd/projetos/${p}/amostras-elegiveis`);
      const el = data.amostras.filter((a) => a.elegivel);
      if (!melhor || el.length > melhor.el.length) melhor = { p, el, total: data.amostras.length };
    }
    marca("painel_todos_os_projetos_ms", t0);
    expect(melhor.el.length).toBeGreaterThanOrEqual(2);
    const ids = melhor.el.slice(0, 20).map((a) => a.request_id);

    // 2. Criar e montar como a química faria.
    let t = Date.now();
    const { data: criado } = await api.post("/pd/manipulacao-lotes", { projeto_id: melhor.p, request_ids: ids });
    marca("criar_ms", t);
    const lote = (await api.get(`/pd/manipulacao-lotes/${criado.id}`)).data.lote;
    const matriz = lote.matriz?.celulas || {};
    const celulas = JSON.parse(JSON.stringify(lote.celulas));
    const fech0 = fechamentoPorMembro(celulas, ids);
    const clonadas = ids.filter((r) => !fech0[r].ok);
    for (const r of clonadas) celulas[r] = { ...matriz };
    const difs = diferencas({ ingredientes: lote.ingredientes, celulas, matrizCelulas: matriz });
    const motivos = {};
    for (const r of ids) for (const x of difs[r] || []) if (x.nivel >= NIVEL.COMUM) (motivos[r] ||= {})[x.ingKey] = { texto: "ensaio LM-13: fórmula própria da amostra" };
    const quantidades = Object.fromEntries(ids.map((r) => [r, { quantidade_g: 50 }]));
    t = Date.now();
    const salvo = (await api.put(`/pd/manipulacao-lotes/${criado.id}`, { revisao: 1, ingredientes: lote.ingredientes, celulas, motivos, pre_mistura: Object.fromEntries(
      [...new Set(Object.values(lote.ingredientes).map((i) => String(i.fase || "").trim()).filter(Boolean))].map((f) => [f, true])), perda_pct: 2, quantidades })).data;
    marca("salvar_ms", t);
    expect(salvo.pendencias).toEqual([]);

    // 3. Ordem pelo servidor real.
    t = Date.now();
    const { data: ordem } = await api.post(`/pd/manipulacao-lotes/${criado.id}/gerar-ordem`, { revisao: 2 });
    marca("gerar_ordem_ms", t);
    const L = ordem.lote;
    const o = L.ordem;
    // Ordem do lote = soma das ordens individuais (tolerância 0,01 g por linha).
    let linhasConferidas = 0;
    for (const r of ids) {
      for (const l of ordemIndividual({ ingredientes: L.ingredientes, celulas: L.celulas, membro: { ...L.membros[r], request_id: r } })) {
        const pm = (o.pre_misturas || []).flatMap((x) => x.linhas).find((x) => x.ingKey === l.ingKey && x.por_membro?.[r] != null);
        const noLote = pm ? pm.por_membro[r] : (o.adicoes[r] || []).find((x) => x.ingKey === l.ingKey)?.teorico_g;
        expect(Math.abs(cg(noLote) - cg(l.teorico_g)), `${r} ${l.nome}`).toBeLessThanOrEqual(1);
        linhasConferidas += 1;
      }
    }
    // 4. Pesar tudo, conferir (outra pessoa), registrar.
    const linhas = o.linhas_pesagem;
    t = Date.now();
    await api.post(`/pd/manipulacao-lotes/${criado.id}/pesagens`, { linhas: Object.fromEntries(Object.entries(linhas).map(([id, l]) => [id, { real_g: l.teorico_g, lote_mp: "ENSAIO" }])) });
    ponte.comoUsuario("pd2");
    await api.post(`/pd/manipulacao-lotes/${criado.id}/conferir`, { linhas: Object.keys(linhas) });
    ponte.comoUsuario("pd");
    marca("pesar_e_conferir_ms", t);
    const pesado = Object.values(linhas).reduce((s, l) => s + cg(l.teorico_g), 0) / 100;
    const entregue = Object.fromEntries(ids.map((r) => [r, 50]));
    t = Date.now();
    const { data: reg } = await api.post(`/pd/manipulacao-lotes/${criado.id}/registrar-manipulacao`, { entregue, perda_declarada_g: Math.round((pesado - 50 * ids.length) * 100) / 100 });
    marca("registrar_ms", t);
    expect(reg.lote.status).toBe("manipulado");
    expect(reg.lote.manipulacao.conciliacao.ok).toBe(true);
    // 5. Em Testes em lote, uma por vez.
    t = Date.now();
    const { data: acoes } = await api.post(`/pd/manipulacao-lotes/${criado.id}/acoes`, { acao: "em_testes" });
    marca("em_testes_ms", t);
    const falhas = acoes.resultados.filter((x) => !x.ok);
    for (const r of ids.filter((x) => !falhas.some((f) => f.request_id === x))) expect(await lerDb(`${T}/pd_requests/${r}/status`)).toBe("IN_TESTS");
    // 6. Até a aprovação no CRM 3 (três amostras): liberação antecipada em lote → ADM aprova → Aguardando
    //    Aprovação → cliente aprova; a aprovação guarda a versão do lote e o Kickoff lê o que varia.
    t = Date.now();
    const { data: lib } = await api.post(`/pd/manipulacao-lotes/${criado.id}/acoes`, { acao: "liberacao", motivo: "ensaio LM-13: entrega ao cliente antes do D48h" });
    expect(lib.resultados.every((x) => x.ok)).toBe(true);
    const tres = ids.slice(0, 3);
    ponte.comoUsuario("adm");
    for (const r of tres) {
      await api.post(`/pd/requests/${r}/liberacao-antecipada/decisao`, { decisao: "aprovada", justificativa: "ensaio LM-13: aprovado pela diretoria", data_hora: new Date(Date.now() - 60000).toISOString() });
      expect(await lerDb(`${T}/pd_requests/${r}/status`)).toBe("WAITING_APPROVAL");
    }
    const aprovadas = [];
    for (const r of tres) {
      const m = L.membros[r];
      await api.post(`/crm/samples/${m.sample_id}/variacoes/${m.variacao_id}/resultado-cliente`, { resultado: "aprovada",
        aprovacao_cliente: { quem_nome: "Cliente (ensaio)", canal: "whatsapp", aprovado_em: new Date(Date.now() - 30000).toISOString() } });
      const amostra = await lerDb(`${T}/crm_samples/${m.sample_id}`);
      const v = (amostra.variacoes || []).find((x) => x?.id === m.variacao_id);
      expect(v.aprovacao_cliente.formula_aprovada.id).toBe(m.formula_id_lote ?? (await lerDb(`${T}/pd_manipulacao_lotes/${criado.id}/membros/${r}/formula_id_lote`)));
      aprovadas.push({ sample: amostra, variation: v });
    }
    ponte.comoUsuario("pd");
    const kickoff = variacaoEntreSkus(aprovadas, "");
    marca("ate_aprovacao_crm3_ms", t);
    // Irmãs do CRM: nenhuma variação sumiu das amostras do projeto.
    const amostras = Object.values((await lerDb(`${T}/crm_samples`)) || {}).filter((s) => s.projeto_id === melhor.p);
    const antes = Object.values(ler("crm_samples") || {}).filter((s) => s.projeto_id === melhor.p);
    expect(amostras.map((s) => (s.variacoes || []).length)).toEqual(antes.map((s) => (s.variacoes || []).length));
    const resumo = {
      projeto: melhor.p.slice(0, 6) + "…", amostras_no_projeto: melhor.total, elegiveis: melhor.el.length, no_lote: ids.length,
      ingredientes: Object.keys(L.ingredientes).length, clonadas_da_matriz: clonadas.length, com_motivo: Object.keys(motivos).length,
      linhas_pesagem: Object.keys(linhas).length, pre_misturas: (o.pre_misturas || []).length, linhas_individuais_conferidas: linhasConferidas,
      total_g: o.total_teorico_g, conciliacao: reg.lote.manipulacao.conciliacao, em_testes_ok: acoes.resultados.length - falhas.length,
      em_testes_falhas: falhas.map((f) => `${f.codigo}: ${f.mensagem}`), avisos_da_ordem: (o.avisos || []).length,
      aprovadas_no_crm3: aprovadas.length, kickoff_o_que_varia: kickoff.varia_entre_skus, kickoff_outro: kickoff.varia_entre_skus_outro, tempos, total_ms: Date.now() - t0,
    };
    writeFileSync(path.join(FOTO, "resumo-ensaio.json"), JSON.stringify(resumo, null, 1)); // fica com a fotografia, fora do Git
    expect(falhas).toEqual([]);
  }, 600000);
});
