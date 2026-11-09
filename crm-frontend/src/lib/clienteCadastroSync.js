/*
 * Card do cliente (CRM1, erp/{tenant}/crm_clients) <-> Cadastros (clientes/{codigo}).
 * Pedido do Marlos (08/11/2026): o que se altera num lado aparece no outro, com
 * rastreabilidade (data, hora, usuário, origem e campos). Funções puras: quem
 * grava é firebaseApi.js (card -> cadastro no PUT; cadastro -> card no sync).
 *
 * Contatos: o Cadastros guarda a lista completa (contatosVersao 1, com áreas e
 * principal por área — shared/contatos-cliente.js). O card mostra o principal
 * comercial em contato_principal e os demais em contatos_adicionais; cada um leva
 * cadastro_contato_id para casar de volta. Cargo e "é decisor" só existem no card
 * e ficam preservados pelo id.
 */

export const AREAS_CONTATO = { COMERCIAL: "Comercial", COMPRAS: "Compras", TECNICO: "Técnico / Desenvolvimento", LOGISTICA: "Logística", FINANCEIRO: "Financeiro", OUTRA: "Outra" };

// Campo do card -> campo do Cadastros (identificação/condição; contatos à parte).
export const CAMPOS_CARD_CADASTRO = {
  nome_empresa: "nome",
  cnpj: "cnpj",
  cidade: "cidade",
  regiao: "uf",
  site: "site",
  condicao_pagamento: "condicaoPagamento",
  endereco_entrega: "enderecoEntrega",
  endereco_faturamento: "enderecoFaturamento",
};
const ROTULOS = {
  nome: "Nome", cnpj: "CNPJ", cidade: "Cidade", uf: "UF", site: "Site", condicaoPagamento: "Condição de pagamento",
  enderecoEntrega: "Endereço de entrega", enderecoFaturamento: "Endereço de faturamento", contatos: "Contatos", ativo: "Ativo",
};

const txt = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const temDado = (c) => Boolean(c && (txt(c.nome) || txt(c.email) || txt(c.whatsapp) || txt(c.telefone)));
const chaveValida = (k) => /^[A-Za-z0-9_-]+$/.test(String(k || ""));

/** Lista de contatos do Cadastros (v1 ou legado contatoCom* e contatoTec*). */
export function listaCadastro(master) {
  const c = master || {};
  if (c.contatosVersao === 1) {
    return Object.entries(c.contatos || {}).map(([id, p]) => ({ id, nome: txt(p.nome), email: txt(p.email), telefone: txt(p.telefone),
      areas: Array.isArray(p.areas) ? p.areas.slice() : [], principais: Array.isArray(p.principais) ? p.principais.slice() : [],
      outraArea: txt(p.outraArea), observacoes: txt(p.observacoes) }));
  }
  const ls = [];
  [["comercial", "COMERCIAL", c.contatoComNome || c.contato, c.contatoComEmail || c.email, c.contatoComTelefone || c.telefone],
    ["tecnico", "TECNICO", c.contatoTecNome, c.contatoTecEmail, c.contatoTecTelefone]].forEach(([id, area, nome, email, tel]) => {
    if (!txt(nome) && !txt(email) && !txt(tel)) return;
    const igual = ls.find((p) => p.nome === txt(nome) && p.email === txt(email) && p.telefone === txt(tel));
    if (igual) { igual.areas.push(area); igual.principais.push(area); return; }
    ls.push({ id: "legado_" + id, nome: txt(nome), email: txt(email), telefone: txt(tel), areas: [area], principais: [area], outraArea: "", observacoes: "" });
  });
  return ls;
}

function principalDaArea(lista, area) {
  const daArea = lista.filter((p) => p.areas.includes(area));
  return daArea.find((p) => p.principais.includes(area)) || daArea[0] || null;
}

/** Contatos do card a partir do Cadastros, preservando cargo/decisor do card pelo id. */
export function contatosCardDoCadastro(master, card) {
  const lista = listaCadastro(master);
  if (!lista.length) return null; // Cadastro sem contato: o card fica como está.
  const doCard = [card?.contato_principal, ...(Array.isArray(card?.contatos_adicionais) ? card.contatos_adicionais : [])].filter(Boolean);
  const casar = (p) => doCard.find((c) => c.cadastro_contato_id === p.id)
    || doCard.find((c) => !c.cadastro_contato_id && txt(c.nome) && txt(c.nome).toLowerCase() === p.nome.toLowerCase()) || {};
  const paraCard = (p) => {
    const atual = casar(p);
    return { cadastro_contato_id: p.id, nome: p.nome, email: p.email, whatsapp: p.telefone,
      cargo: atual.cargo || "", cargo_custom: atual.cargo_custom || "", decisor: Boolean(atual.decisor),
      areas: p.areas.slice(), observacoes: p.observacoes || "" };
  };
  const principal = principalDaArea(lista, "COMERCIAL") || lista[0];
  // Contato criado só no card (sem id e sem par no Cadastros) não se perde: fica e vai ao Cadastros no próximo salvar.
  const casados = new Set(lista.map((p) => casar(p)).filter((c) => c && c.nome !== undefined));
  const soDoCard = doCard.filter((c) => !c.cadastro_contato_id && temDado(c) && !casados.has(c)).map((c) => ({ ...c }));
  return { contato_principal: paraCard(principal), contatos_adicionais: [...lista.filter((p) => p !== principal).map(paraCard), ...soDoCard] };
}

/** Contatos do Cadastros (v1 + espelhos antigos) a partir do card. `novoId` gera id para contato novo. */
export function contatosCadastroDoCard(card, master, novoId) {
  const existentes = Object.fromEntries(listaCadastro(master).map((p) => [p.id, p]));
  const doCard = [
    ...(temDado(card?.contato_principal) ? [{ ...card.contato_principal, _principal: true }] : []),
    ...(Array.isArray(card?.contatos_adicionais) ? card.contatos_adicionais : []).filter(temDado),
  ];
  const contatos = {};
  const donoPrincipal = {};
  doCard.forEach((c, i) => {
    let id = chaveValida(c.cadastro_contato_id) ? c.cadastro_contato_id : null;
    if (!id || contatos[id]) id = novoId ? novoId(i) : `crm_${i}`;
    const antes = existentes[id] || {};
    let areas = Array.isArray(c.areas) && c.areas.length ? c.areas.filter((a) => AREAS_CONTATO[a]) : (antes.areas && antes.areas.length ? antes.areas.slice() : ["COMERCIAL"]);
    let principais = (antes.principais || []).filter((a) => a !== "COMERCIAL" && areas.includes(a));
    if (c._principal) { if (!areas.includes("COMERCIAL")) areas = ["COMERCIAL", ...areas]; principais = ["COMERCIAL", ...principais]; }
    principais = principais.filter((a) => { if (donoPrincipal[a]) return false; donoPrincipal[a] = id; return true; });
    contatos[id] = { nome: txt(c.nome), email: txt(c.email), telefone: txt(c.whatsapp || c.telefone), areas: Array.from(new Set(areas)), principais,
      outraArea: areas.includes("OUTRA") ? txt(c.outraArea || antes.outraArea) : "", observacoes: txt(c.observacoes != null ? c.observacoes : antes.observacoes) };
  });
  const lista = Object.entries(contatos).map(([id, p]) => ({ id, ...p }));
  const com = principalDaArea(lista, "COMERCIAL") || {};
  const tec = principalDaArea(lista, "TECNICO") || {};
  return { contatosVersao: 1, contatos, contatoComNome: com.nome || "", contatoComEmail: com.email || "", contatoComTelefone: com.telefone || "",
    contatoTecNome: tec.nome || "", contatoTecEmail: tec.email || "", contatoTecTelefone: tec.telefone || "" };
}

/** Assinatura do que o Cadastros manda ao card: mudou, o sync reescreve o card. */
export function assinaturaCadastro(master) {
  const m = master || {};
  const contatos = listaCadastro(m).map((p) => [p.id, p.nome, p.email, p.telefone, p.areas.join(","), p.principais.join(","), p.observacoes]);
  return JSON.stringify([m.nome || m.nomeFantasia || m.razaoSocial || "", (m.cnpj || "").replace(/\D/g, ""), m.cidade || "", m.uf || "", m.site || "",
    m.condicaoPagamento || "", m.enderecoEntrega || "", m.enderecoFaturamento || "", m.ativo !== false, contatos]);
}

/** Caminhos relativos a clientes/{id} que o card altera. null = nada de cadastro mudou. */
export function mudancasCadastroDoCard(updates, cardDepois, master, novoId) {
  const rel = {};
  Object.entries(CAMPOS_CARD_CADASTRO).forEach(([doCard, doCadastro]) => {
    if (!(doCard in (updates || {}))) return;
    const v = doCadastro === "uf" ? txt(updates[doCard]).toUpperCase() : txt(updates[doCard]);
    if (doCadastro === "nome" && !v) return; // nome do cadastro nunca fica vazio
    if (v !== txt((master || {})[doCadastro])) rel[doCadastro] = v;
  });
  if ("contato_principal" in (updates || {}) || "contatos_adicionais" in (updates || {})) {
    const novos = contatosCadastroDoCard(cardDepois, master, novoId);
    if (assinaturaContatos(novos) !== assinaturaContatos(master)) Object.assign(rel, novos);
  }
  return Object.keys(rel).length ? rel : null;
}
function assinaturaContatos(m) {
  return JSON.stringify(listaCadastro(m).map((p) => [p.nome, p.email, p.telefone, p.areas.slice().sort().join(","), p.principais.slice().sort().join(","), p.observacoes]));
}

/** Rótulos legíveis dos campos que mudaram (para o histórico). */
export function rotulosMudancas(rel) {
  const out = new Set();
  Object.keys(rel || {}).forEach((k) => {
    if (/^contato|^contatos/.test(k)) out.add(ROTULOS.contatos);
    else out.add(ROTULOS[k] || k);
  });
  return Array.from(out);
}

/** Campos do card que o Cadastros mudou (comparando card antes e depois do sync). */
export function rotulosMudancasNoCard(antes, depois) {
  const out = [];
  const a = antes || {}, d = depois || {};
  Object.entries(CAMPOS_CARD_CADASTRO).forEach(([doCard, doCadastro]) => {
    if (txt(a[doCard]) !== txt(d[doCard])) out.push(ROTULOS[doCadastro]);
  });
  const cont = (c) => JSON.stringify([c?.contato_principal, ...(c?.contatos_adicionais || [])].filter(Boolean).map((x) => [x.nome || "", x.email || "", x.whatsapp || "", (x.areas || []).join(",")]));
  if (cont(a) !== cont(d)) out.push(ROTULOS.contatos);
  if ((a.ativo !== false) !== (d.ativo !== false)) out.push(ROTULOS.ativo);
  return out;
}
