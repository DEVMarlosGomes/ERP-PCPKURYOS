/* Cadastro de responsável técnico (KO-06, PROMPT_ENGENHARIA_PACOTE_20261021.md).
 *
 * Antes o RT do Kickoff era texto livre (Bloco 0): o mesmo químico aparecia com três grafias e
 * ninguém sabia o CRQ. Agora é pessoa cadastrada em erp/{tenant}/responsaveis_tecnicos/{id}
 * (nome, cargo, registro profissional, e-mail, telefone, vínculo Kuryos/cliente), escolhida no
 * menu do Kickoff; "+ cadastrar" no próprio Kickoff. O Bloco 0 continua guardando o nome em texto
 * (o resto do sistema lê esse campo) e passa a guardar também o id.
 * Funções puras: nada aqui lê ou grava no banco. */

export const VINCULOS = { kuryos: "Kuryos", cliente: "Cliente" };

const limpo = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const chaveNome = (v) => limpo(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export function validarResponsavel(entrada, existentes = []) {
  const r = {
    nome: limpo(entrada?.nome), cargo: limpo(entrada?.cargo), registro_profissional: limpo(entrada?.registro_profissional).toUpperCase(),
    email: limpo(entrada?.email).toLowerCase(), telefone: limpo(entrada?.telefone), vinculo: entrada?.vinculo,
    cliente_id: entrada?.vinculo === "cliente" ? entrada?.cliente_id || null : null, ativo: entrada?.ativo !== false,
  };
  const erros = [];
  if (r.nome.length < 3) erros.push("Informe o nome completo.");
  if (!VINCULOS[r.vinculo]) erros.push("Informe o vínculo: Kuryos ou cliente.");
  if (r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) erros.push("E-mail inválido.");
  // Mesma pessoa = mesmo nome (sem acento/caixa) e mesmo registro; registro igual em outra pessoa também é erro.
  const outros = (existentes || []).filter((x) => x && x.id !== entrada?.id);
  const duplicado = outros.find((x) => chaveNome(x.nome) === chaveNome(r.nome) && limpo(x.registro_profissional).toUpperCase() === r.registro_profissional);
  if (duplicado) erros.push(`${duplicado.nome} já está cadastrado.`);
  else if (r.registro_profissional && outros.some((x) => limpo(x.registro_profissional).toUpperCase() === r.registro_profissional)) {
    erros.push(`O registro ${r.registro_profissional} já pertence a outra pessoa.`);
  }
  return { ok: !erros.length, erros, registro: r, duplicado: duplicado || null };
}

// "Ana Souza · CRQ 04123456 · Kuryos" — o que o menu mostra.
export function rotuloResponsavel(r) {
  if (!r) return "";
  return [r.nome, r.registro_profissional, VINCULOS[r.vinculo]].filter(Boolean).join(" · ");
}

// Kickoff antigo com o RT em texto: acha a pessoa cadastrada pelo nome (sem acento e caixa).
export function responsavelPeloNome(lista, nome) {
  const k = chaveNome(nome);
  if (!k) return null;
  return (lista || []).find((r) => chaveNome(r.nome) === k) || null;
}
