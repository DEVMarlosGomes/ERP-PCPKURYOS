/* Cotação em registro próprio (COM-03, opção A da Q12 — decidida em 22/10/2026).
 *
 * erp/{t}/cotacoes/{id}: o que precisa ser comprado/precificado para o projeto, montado do Kickoff
 * vigente — MPs da ficha de manipulação e embalagens do BOM (BOM-01), com especificação,
 * quantidade por unidade e do pedido, quem fornece e "item novo". É ela que o Compras precifica
 * (processos_cotacao do PCP); o orçamento (crm_propostas) aponta para a revisão que usou.
 * Número preso ao projeto: COT-2026-031-r1 (não colide com os COT-0001 dos processos do PCP).
 * Revisão nova quando o Kickoff muda depois que a cotação saiu do rascunho; a anterior fica
 * consultável como "substituida".
 * Funções puras: nada aqui lê ou grava no banco. */

import { insumosDoKickoff } from "./kickoffBom";

export const STATUS_COTACAO = {
  rascunho: "Rascunho", em_cotacao_compras: "Em cotação (Compras)", precificada: "Precificada", aprovada: "Aprovada", substituida: "Substituída",
};
// Cotação fora do rascunho não muda de linhas: mudança do Kickoff abre revisão.
export const TRAVADAS = new Set(["em_cotacao_compras", "precificada", "aprovada"]);
const PRECO = ["preco", "moeda", "fonte_preco", "fonte_detalhe", "preco_atualizado_em"];

export function numeroCotacao(numeroProjeto, revisao = 1) {
  return `COT-${numeroProjeto || "SEM-NUMERO"}-r${revisao}`;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// Linhas da cotação a partir do Kickoff (mesma fonte da cotação de preço: insumosDoKickoff).
export function linhasDaCotacao(kickoff) {
  return insumosDoKickoff(kickoff).map((l) => {
    const material = l.material_codigo || (l.status_homologacao === "homologado" ? l.codigo_interno || "" : "");
    return {
    linha_id: l.id || l.cadastro_chave || l.codigo_interno, codigo: l.codigo_interno || "", material_codigo: material,
    descricao: l.descricao || "", especificacao: l.especificacao || "", tipo: l.tipo || "",
    nivel: l.nivel || (l.tipo === "mp_formula" ? "manipulacao" : ""), unidade: l.unidade || "un",
    qtd_por_unidade: num(l.quantidade_por_unidade), qtd_total: num(l.quantidade_total_pedido),
    fornecido_por: ["cliente", "kuryos"].includes(l.fornecido_por) ? l.fornecido_por : (l.tipo === "mp_formula" ? "kuryos" : ""),
    // item_novo = marcado no Kickoff (vai para o cadastro); sem_cadastro = ainda sem código no Cadastros.
    item_novo: Boolean(l.item_novo), sem_cadastro: !material,
    fornecedor_sugerido: l.fornecedor_principal?.nome || "", codigo_fornecedor: l.codigo_fornecedor || "",
    preco: null, moeda: "BRL", fonte_preco: null,
    };
  });
}

/* Junta as linhas novas do Kickoff com os preços já levantados (mesma linha_id). */
export function mesclarLinhas(novas, antigas) {
  const porId = new Map((antigas || []).map((l) => [l.linha_id, l]));
  return (novas || []).map((l) => {
    const a = porId.get(l.linha_id);
    if (!a) return l;
    return { ...l, ...Object.fromEntries(PRECO.filter((k) => a[k] !== undefined && a[k] !== null).map((k) => [k, a[k]])) };
  });
}

// Diferença que importa entre duas listas de linhas (itens e quantidades): vazio = mesma cotação.
export function diffLinhas(antes, depois) {
  const chave = (l) => JSON.stringify([l.descricao, l.especificacao, l.qtd_por_unidade, l.qtd_total, l.fornecido_por, l.material_codigo]);
  const a = new Map((antes || []).map((l) => [l.linha_id, l]));
  const d = new Map((depois || []).map((l) => [l.linha_id, l]));
  const diff = [];
  for (const [id, l] of d) {
    if (!a.has(id)) diff.push({ campo: l.descricao || id, de: null, para: "incluído" });
    else if (chave(a.get(id)) !== chave(l)) diff.push({ campo: l.descricao || id, de: a.get(id).qtd_total, para: l.qtd_total });
  }
  for (const [id, l] of a) if (!d.has(id)) diff.push({ campo: l.descricao || id, de: "incluído", para: null });
  return diff;
}

/* Paridade (aceite do COM-03): todo item e quantidade do Kickoff aparece na cotação. */
export function faltasDeParidade(kickoff, cotacao) {
  const esperadas = linhasDaCotacao(kickoff);
  const tem = new Map((cotacao?.linhas || []).map((l) => [l.linha_id, l]));
  return esperadas.filter((l) => {
    const c = tem.get(l.linha_id);
    return !c || c.qtd_total !== l.qtd_total || c.qtd_por_unidade !== l.qtd_por_unidade;
  }).map((l) => l.descricao || l.linha_id);
}

// Resumo para a tela e para o orçamento.
export function resumoCotacao(cotacao) {
  const linhas = cotacao?.linhas || [];
  const compra = linhas.filter((l) => l.fornecido_por !== "cliente");
  return {
    itens: linhas.length, do_cliente: linhas.length - compra.length,
    sem_preco: compra.filter((l) => !(num(l.preco) > 0)).length,
    itens_novos: compra.filter((l) => l.item_novo).length,
    sem_cadastro: compra.filter((l) => l.sem_cadastro).length,
  };
}

/* Insumos do orçamento com o preço levantado na cotação: COTADO vence o estimado da fórmula do
 * P&D (trilha ESTIMADO_PD → COTADO → PAGO, PROMPT_CUSTOS_ERP.md). Sem preço na cotação, fica o
 * que já havia. */
export function precosDaCotacao(insumos, cotacao) {
  const porId = new Map((cotacao?.linhas || []).filter((l) => num(l.preco) > 0).map((l) => [l.linha_id, l]));
  return (insumos || []).map((i) => {
    const l = porId.get(i.bom_id);
    return l ? { ...i, preco: num(l.preco), moeda: l.moeda || "BRL", origem_preco: "cotacao", fonte_preco: l.fonte_preco || "cotacao", cotacao_numero: cotacao.numero } : i;
  });
}

/* COM-05: o que vai para o Compras como Solicitação de Compra — itens que a Kuryos compra, com quantidade.
 * COT-02 (reunião 28/10/2026): TODA linha definida no Kickoff vai, mesmo sem código no Cadastros (item
 * novo) e sem fornecedor: segue com as características (especificação montada pelo tipo/atributos) e
 * "fornecedor a definir", marcada sem_cadastro para o Compras cotar sem esperar o cadastro.
 * Fica de fora só o que é do cliente (não se compra) e o que não tem quantidade do pedido. */
export const FORNECEDOR_A_DEFINIR = "fornecedor a definir";
export function obsDaLinha(l) {
  return [l.especificacao && l.especificacao !== l.descricao ? l.especificacao : "", l.fornecedor_sugerido ? `fornecedor sugerido: ${l.fornecedor_sugerido}` : FORNECEDOR_A_DEFINIR,
    !l.material_codigo ? (l.item_novo ? "item novo (não cadastrado)" : "sem cadastro") : ""].filter(Boolean).join(" · ");
}
export function itensParaCompras(cotacao) {
  const itens = [];
  const fora = [];
  for (const l of cotacao?.linhas || []) {
    if (l.fornecido_por === "cliente") continue;
    if (!(num(l.qtd_total) > 0)) { fora.push({ descricao: l.descricao, motivo: "sem quantidade do pedido" }); continue; }
    itens.push({ linha_id: l.linha_id, materialCodigo: l.material_codigo || "", materialNome: l.descricao, qtd: num(l.qtd_total), unidade: l.unidade || "un",
      obs: obsDaLinha(l), especificacao: l.especificacao || "", sem_cadastro: !l.material_codigo, item_novo: Boolean(l.item_novo),
      fornecedor_sugerido: l.fornecedor_sugerido || "" });
  }
  return { itens, fora };
}

/* Preço que o Compras levantou nos processos de cotação abertos a partir das SCs desta cotação:
 * vencedor do item → vencedor geral → menor preço respondido. → Map(materialCodigo → {preco, detalhe}). */
export function precosDosProcessos(processos, scKeys, nomeFornecedor = () => "") {
  const scs = new Set(scKeys || []);
  const out = new Map();
  for (const p of Object.values(processos || {})) {
    for (const [itemKey, it] of Object.entries(p?.itens || {})) {
      if (!scs.has(it?.origemSolicitacaoKey)) continue;
      const convidados = p.fornecedoresConvidados || {};
      const resp = (cKey) => num(convidados[cKey]?.respostaItens?.[itemKey]?.precoUnit);
      let cKey = p.vencedoresPorItem?.[itemKey] || (resp(p.fornecedorVencedorConvidadoKey) > 0 ? p.fornecedorVencedorConvidadoKey : null);
      let como = cKey ? "vencedor" : "menor resposta";
      if (!cKey || !(resp(cKey) > 0)) {
        cKey = Object.keys(convidados).filter((k) => resp(k) > 0).sort((a, b) => resp(a) - resp(b))[0] || null;
        como = "menor resposta";
      }
      if (!cKey) continue;
      const c = convidados[cKey];
      const forn = c.nomeAvulso || nomeFornecedor(c.fornecedorKey) || "";
      out.set(it.materialCodigo, { preco: resp(cKey), detalhe: [p.numeroFormatado, forn, como].filter(Boolean).join(" · ") });
    }
  }
  return out;
}
