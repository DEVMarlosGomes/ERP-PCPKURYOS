import { describe, expect, test } from "vitest";
import {
  aprovadaPeloCliente, entradaRetrabalhos, marcaDesatualizado, resolverDesatualizado, textoDesatualizado, validarPedidoRetrabalho, variacaoEmRetrabalho,
} from "./retrabalhoAprovada";
import { statusPeloRetornoDoCliente } from "./pdCards";

const APROVADA = { id: "V1", codigo: "2026-031-A1-a", status: "aprovada", resultado_cliente: "aprovada", resultado_em: "2026-10-10T10:00:00Z",
  aprovacao_cliente: { quem_nome: "Maria", canal: "whatsapp" }, feedback_cliente: "Perfeita" };

describe("retrabalhar amostra aprovada (AMO-05)", () => {
  test("só amostra aprovada; exige o que alterar e quem pediu", () => {
    expect(validarPedidoRetrabalho({ status: "enviada" }, { o_que_alterar: "Fragrância mais suave", solicitado_por: "cliente" }).erros[0]).toMatch(/Só amostra aprovada/);
    expect(validarPedidoRetrabalho(APROVADA, { o_que_alterar: "curto", solicitado_por: "x" }).erros).toHaveLength(2);
    expect(validarPedidoRetrabalho(APROVADA, { o_que_alterar: "  Fragrância mais suave ", solicitado_por: "interno" })).toMatchObject({ ok: true, o_que_alterar: "Fragrância mais suave" });
  });

  test("a aprovação vai para o histórico; a variação volta a retrabalho e deixa de contar como aprovada", () => {
    const v = variacaoEmRetrabalho(APROVADA, { o_que_alterar: "Fragrância mais suave", solicitado_por: "cliente" }, { por: "u1", porNome: "Carla", em: "2026-10-23T12:00:00Z" });
    expect(v).toMatchObject({ status: "retrabalho", resultado_cliente: "retrabalho", aprovacao_cliente: null, direcoes_retrabalho: "Fragrância mais suave", resultado_em: "2026-10-23T12:00:00Z" });
    expect(v.aprovacoes_anteriores).toEqual([{ aprovacao_cliente: APROVADA.aprovacao_cliente, resultado_em: APROVADA.resultado_em, feedback_cliente: "Perfeita", versao: null, arquivada_em: "2026-10-23T12:00:00Z" }]);
    expect(v.retrabalho_pos_aprovacao).toMatchObject({ solicitado_por: "cliente", por_nome: "Carla" });
    expect(aprovadaPeloCliente(v)).toBe(false);
    // Defeito de 16/10: entregue de novo (aguardando desde depois do retrabalho), o retrabalho antigo não volta sozinho.
    expect(statusPeloRetornoDoCliente("WAITING_APPROVAL", v.status, { aguardandoDesde: "2026-10-25T09:00:00Z", resultadoEm: v.resultado_em })).toBeNull();
  });

  test("histórico de retrabalhos no formato da aba Retrabalhos", () => {
    expect(entradaRetrabalhos({ o_que_alterar: "Cor mais clara", solicitado_por: "cliente" }, { variacaoId: "V1", codigo: "A1-a", em: "t" }))
      .toEqual({ origem: "externa", data: "t", variacao_id: "V1", apos_aprovacao: true, motivo: "Retrabalho após aprovação (A1-a): Cor mais clara" });
  });

  test("desatualizado: marca, texto e resolução com motivo (a marca vai para o histórico)", () => {
    const marca = marcaDesatualizado({ motivo: "amostra A1-a em retrabalho", eventoId: "E1", em: "2026-10-23T12:00:00Z" });
    expect(textoDesatualizado(marca)).toBe("Desatualizado desde 23/10/2026: amostra A1-a em retrabalho");
    expect(resolverDesatualizado({ desatualizado: marca }, { motivo: "curto" }).ok).toBe(false);
    expect(resolverDesatualizado({}, { motivo: "Sem impacto no BOM" }).ok).toBe(false);
    const r = resolverDesatualizado({ desatualizado: marca }, { motivo: "Só a cor muda; BOM e preço iguais", porNome: "Carla", em: "t2" });
    expect(r.mudancas.desatualizado).toBeNull();
    expect(r.mudancas.desatualizado_historico[0]).toMatchObject({ evento_id: "E1", decisao: "revisado_sem_impacto", motivo_decisao: "Só a cor muda; BOM e preço iguais", resolvido_por_nome: "Carla" });
  });
});
