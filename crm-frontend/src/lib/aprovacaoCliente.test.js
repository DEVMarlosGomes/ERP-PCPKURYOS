import { describe, expect, test } from "vitest";
import { contatosDoCliente, entradaHistoricoAprovacao, textoAprovacao, validarAprovacaoCliente } from "./aprovacaoCliente";

const AGORA = Date.parse("2026-10-22T17:30:00Z"); // 14:30 em São Paulo

describe("aprovação do cliente (COM-02)", () => {
  test("sem quem, canal e data/hora não aprova", () => {
    const r = validarAprovacaoCliente({}, { agoraMs: AGORA });
    expect(r.ok).toBe(false);
    expect(r.erros).toEqual([
      "Informe quem aprovou do lado do cliente.",
      "Informe o canal da aprovação.",
      "Informe a data e o horário da aprovação.",
    ]);
  });
  test("data no futuro é recusada (com folga de 2 min para relógio adiantado)", () => {
    const base = { quem_nome: "Maria", canal: "whatsapp" };
    expect(validarAprovacaoCliente({ ...base, aprovado_em: "2026-10-22T18:00:00Z" }, { agoraMs: AGORA }).erros)
      .toEqual(["A data e o horário da aprovação não podem estar no futuro."]);
    expect(validarAprovacaoCliente({ ...base, aprovado_em: "2026-10-22T17:31:00Z" }, { agoraMs: AGORA }).ok).toBe(true);
  });
  test("canal Outro exige descrição", () => {
    expect(validarAprovacaoCliente({ quem_nome: "Maria", canal: "outro", aprovado_em: "2026-10-21T12:00:00Z" }, { agoraMs: AGORA }).erros)
      .toEqual(["Descreva o canal (Outro)."]);
  });
  test("registro guarda quem registrou e a data real; texto em horário de Brasília", () => {
    const r = validarAprovacaoCliente(
      { quem_nome: " Maria Souza ", quem_cargo: "Compras", canal: "whatsapp", aprovado_em: "2026-10-21T13:05:00Z" },
      { agoraMs: AGORA, registradoPor: "u1", registradoPorNome: "Ana" },
    );
    expect(r.registro).toMatchObject({ quem_nome: "Maria Souza", canal: "whatsapp", aprovado_em_ms: Date.parse("2026-10-21T13:05:00Z"), registrado_por: "u1" });
    expect(textoAprovacao(r.registro, { oque: "Amostra 2026-031-A1-a", resultado: "aprovada" }))
      .toBe("Amostra 2026-031-A1-a aprovada por Maria Souza (Compras) via WhatsApp em 21/10/2026, 10:05 — registrado por Ana");
    expect(entradaHistoricoAprovacao(r.registro, { oque: "Orçamento", resultado: "aprovado" })).toMatchObject({ tipo: "aprovacao_cliente", usuario: "Ana" });
  });
  test("contatos do cliente: decisores primeiro, sem nome fica fora", () => {
    const c = contatosDoCliente({ contato_principal: { nome: "João" }, contatos_adicionais: [{ nome: "Maria", cargo: "Diretora", decisor: true }, { nome: "" }] });
    expect(c.map((x) => x.nome)).toEqual(["Maria", "João"]);
  });
});
