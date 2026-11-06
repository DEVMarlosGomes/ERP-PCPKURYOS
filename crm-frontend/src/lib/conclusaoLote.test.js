import { salvarAntesDeConcluirLote } from "@/lib/conclusaoLote";

test("sempre salva a tela antes de gerar a ordem e usa a revisão gravada", async () => {
  const chamadas = [];
  const resultado = await salvarAntesDeConcluirLote({
    salvar: async () => { chamadas.push("salvar"); return { lote: { revisao: 8 }, pendencias: [] }; },
    gerar: async (revisao) => { chamadas.push(`gerar:${revisao}`); return { versoes: { R1: { versao: 1 } } }; },
  });

  expect(chamadas).toEqual(["salvar", "gerar:8"]);
  expect(resultado.ordem.versoes.R1.versao).toBe(1);
});

test("não gera ordem quando o salvamento falha", async () => {
  let gerou = false;
  await expect(salvarAntesDeConcluirLote({
    salvar: async () => { throw new Error("sem rede"); },
    gerar: async () => { gerou = true; },
  })).rejects.toThrow("sem rede");
  expect(gerou).toBe(false);
});

test("salva, mas não gera ordem quando o servidor encontra pendência", async () => {
  let gerou = false;
  const resultado = await salvarAntesDeConcluirLote({
    salvar: async () => ({ lote: { revisao: 9 }, pendencias: [{ request_id: "R2", motivo: "aprovação" }] }),
    gerar: async () => { gerou = true; },
  });

  expect(gerou).toBe(false);
  expect(resultado.pendencias).toHaveLength(1);
});

test("propaga falha da geração somente depois de o rascunho estar salvo", async () => {
  const chamadas = [];
  await expect(salvarAntesDeConcluirLote({
    salvar: async () => { chamadas.push("salvar"); return { lote: { revisao: 10 }, pendencias: [] }; },
    gerar: async () => { chamadas.push("gerar"); throw new Error("ordem recusada"); },
  })).rejects.toThrow("ordem recusada");
  expect(chamadas).toEqual(["salvar", "gerar"]);
});
