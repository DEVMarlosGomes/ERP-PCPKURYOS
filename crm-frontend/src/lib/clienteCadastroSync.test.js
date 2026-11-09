import { assinaturaCadastro, contatosCadastroDoCard, contatosCardDoCadastro, listaCadastro, mudancasCadastroDoCard, rotulosMudancas, rotulosMudancasNoCard } from "./clienteCadastroSync";

const master = {
  nome: "Miss Rose", codigo: "MISS", cnpj: "12.345.678/0001-90", cidade: "São Paulo", uf: "SP",
  contatosVersao: 1,
  contatos: {
    c1: { nome: "Cirilo", email: "cirilo@x.com", telefone: "11956886592", areas: ["COMERCIAL", "COMPRAS"], principais: ["COMERCIAL"], observacoes: "" },
    c2: { nome: "Ana", email: "ana@x.com", telefone: "", areas: ["FINANCEIRO"], principais: ["FINANCEIRO"], observacoes: "boletos" },
  },
};

describe("Cadastros -> card", () => {
  test("principal comercial vira contato_principal e os demais, adicionais; cargo/decisor do card ficam pelo id", () => {
    const card = { contato_principal: { cadastro_contato_id: "c1", nome: "Cirilo", cargo: "comprador", decisor: true } };
    const r = contatosCardDoCadastro(master, card);
    expect(r.contato_principal).toMatchObject({ cadastro_contato_id: "c1", nome: "Cirilo", whatsapp: "11956886592", cargo: "comprador", decisor: true, areas: ["COMERCIAL", "COMPRAS"] });
    expect(r.contatos_adicionais).toHaveLength(1);
    expect(r.contatos_adicionais[0]).toMatchObject({ cadastro_contato_id: "c2", nome: "Ana", decisor: false, observacoes: "boletos" });
  });
  test("cadastro legado (contatoCom*) também chega ao card; sem contato, o card fica como está", () => {
    const r = contatosCardDoCadastro({ contatoComNome: "Leo", contatoComEmail: "l@x.com" }, {});
    expect(r.contato_principal).toMatchObject({ cadastro_contato_id: "legado_comercial", nome: "Leo" });
    expect(contatosCardDoCadastro({ nome: "Sem contato" }, {})).toBeNull();
  });
  test("contato só do card (sem id, sem par) fica; com id que saiu do Cadastros, sai", () => {
    const card = { contatos_adicionais: [{ nome: "Só no card", whatsapp: "11" }, { cadastro_contato_id: "removido", nome: "Removido no Cadastros" }] };
    const r = contatosCardDoCadastro(master, card);
    expect(r.contatos_adicionais.map((c) => c.nome)).toEqual(["Ana", "Só no card"]);
  });
  test("contato antigo do card sem id casa pelo nome e mantém o decisor", () => {
    const r = contatosCardDoCadastro(master, { contato_principal: { nome: "cirilo", decisor: true } });
    expect(r.contato_principal.decisor).toBe(true);
  });
});

describe("card -> Cadastros", () => {
  test("contato novo no card entra no cadastro como Comercial; áreas/observações existentes ficam", () => {
    const card = {
      contato_principal: { cadastro_contato_id: "c1", nome: "Cirilo", email: "cirilo@x.com", whatsapp: "11999990000" },
      contatos_adicionais: [{ cadastro_contato_id: "c2", nome: "Ana", email: "ana@x.com" }, { nome: "Bia (nova)", whatsapp: "1188" }, { nome: "", email: "" }],
    };
    const r = contatosCadastroDoCard(card, master, () => "novo1");
    expect(Object.keys(r.contatos)).toEqual(["c1", "c2", "novo1"]);
    expect(r.contatos.c1).toMatchObject({ telefone: "11999990000", areas: ["COMERCIAL", "COMPRAS"], principais: ["COMERCIAL"] });
    expect(r.contatos.c2).toMatchObject({ areas: ["FINANCEIRO"], principais: ["FINANCEIRO"], observacoes: "boletos" });
    expect(r.contatos.novo1).toMatchObject({ nome: "Bia (nova)", telefone: "1188", areas: ["COMERCIAL"], principais: [] });
    expect([r.contatoComNome, r.contatoComTelefone, r.contatosVersao]).toEqual(["Cirilo", "11999990000", 1]);
  });
  test("trocar o principal no card move o principal comercial no cadastro (só um por área)", () => {
    const card = { contato_principal: { cadastro_contato_id: "c2", nome: "Ana" }, contatos_adicionais: [{ cadastro_contato_id: "c1", nome: "Cirilo" }] };
    const r = contatosCadastroDoCard(card, master);
    expect(r.contatos.c2.principais).toEqual(["COMERCIAL", "FINANCEIRO"]);
    expect(r.contatos.c2.areas).toEqual(["COMERCIAL", "FINANCEIRO"]);
    expect(r.contatos.c1.principais).toEqual([]);
    expect(r.contatoComNome).toBe("Ana");
  });
  test("mudancasCadastroDoCard só devolve o que mudou; contato idêntico não gera escrita", () => {
    const ida = contatosCardDoCadastro(master, {});
    const semMudanca = mudancasCadastroDoCard({ ...ida, cidade: "São Paulo" }, ida, master);
    expect(semMudanca).toBeNull();
    const rel = mudancasCadastroDoCard({ cidade: "Campinas", regiao: "sp", nome_empresa: "" }, {}, master);
    expect(rel).toEqual({ cidade: "Campinas" });
    expect(mudancasCadastroDoCard({ regiao: "rj" }, {}, master)).toEqual({ uf: "RJ" });
    expect(rotulosMudancas({ cidade: 1, contatos: {}, contatoComNome: "" })).toEqual(["Cidade", "Contatos"]);
  });
  test("ida e volta estável: card salvo -> cadastro -> card não muda nada", () => {
    const card1 = contatosCardDoCadastro(master, {});
    const m2 = { ...master, ...contatosCadastroDoCard(card1, master) };
    expect(assinaturaCadastro(m2)).toBe(assinaturaCadastro(master));
    const card2 = contatosCardDoCadastro(m2, card1);
    expect(rotulosMudancasNoCard(card1, card2)).toEqual([]);
  });
});

test("listaCadastro e rótulos do sync", () => {
  expect(listaCadastro(master).map((p) => p.id)).toEqual(["c1", "c2"]);
  expect(rotulosMudancasNoCard({ cidade: "A", ativo: true }, { cidade: "B", ativo: false })).toEqual(["Cidade", "Ativo"]);
});
