/* BOM de embalagens do Kickoff (BOM-01, PROMPT_ENGENHARIA_PACOTE_20261021.md).
 *
 * Defeito medido em 22/10: o BOM nascia de só 5 posições fixas (frasco, tampa, rótulo, caixa
 * master, palete), sempre 1 por unidade; o cartucho nunca entrava e válvula, pump, spray, lacre,
 * bula, shrink, berço, display e divisória ficavam fora do BOM — e da cotação.
 * Agora: uma linha por componente com "Aplicável? = Sim" dos blocos 2, 3 e 4, com a quantidade
 * do Kickoff e o nível de embalagem. Terciária: unidades por embalagem, arredondando a compra
 * para cima (1.000 un ÷ 12 por display = 84 displays). A manipulação (MPs da fórmula) não entra
 * aqui: fica na ficha de manipulação do Kickoff, documento separado.
 * Funções puras: nada aqui lê ou grava no banco. */

import { normalizarLinhaComponente, simNao, unidadesPorEmbalagem } from "./kickoffPendencias";

export { unidadesPorEmbalagem };

export const NIVEL_DO_BLOCO = { bloco2: "primaria", bloco3: "secundaria", bloco4: "terciaria" };

// Tipos que o resto do sistema já conhece (cotação, PCP); o nível vai em campo próprio.
export function tipoDaLinha(bloco, componenteId) {
  if (componenteId === "tampa") return "tampa";
  if (componenteId === "rotulo") return "rotulo";
  return { bloco2: "embalagem_primaria", bloco3: "emb_secundaria", bloco4: "emb_terciaria" }[bloco];
}

const numero = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/* questionario + { numeroKickoff, volumePedido } → linhas do BOM de embalagens.
 * Componente aplicável ainda não definido entra como "a definir" (Compras vê que existe). */
export function linhasDeEmbalagem(questionario, { numeroKickoff = "", volumePedido = 0 } = {}) {
  const q = questionario || {};
  const linhas = [];
  for (const bloco of ["bloco2", "bloco3", "bloco4"]) {
    for (const bruta of q[bloco]?.componentes || []) {
      const r = normalizarLinhaComponente(bruta);
      if (simNao(r.aplicavel) !== "sim") continue;
      const terciaria = bloco === "bloco4";
      const unidades = terciaria ? unidadesPorEmbalagem(r, q.bloco0) : null;
      const porUnidade = terciaria ? (unidades ? 1 / unidades : null) : (numero(r.qtd_por_unidade) ?? 1);
      const total = !volumePedido || porUnidade === null ? null
        : (terciaria ? Math.ceil(volumePedido / unidades) : Math.ceil(porUnidade * volumePedido));
      const tipo = tipoDaLinha(bloco, r.id);
      linhas.push({
        id: `${bloco}-${r.id}`, componente_id: r.id, tipo, nivel: NIVEL_DO_BLOCO[bloco],
        // O que Compras lê: o material do Cadastros; senão a especificação; senão o nome do componente.
        descricao: r.material_nome || (r.item_novo ? r.item_novo_descricao : r.especificacao_fornecedor_codigo) || r.componente || "", componente: r.componente || "",
        especificacao: r.item_novo ? r.item_novo_descricao || "" : r.especificacao_fornecedor_codigo || "",
        codigo_interno: r.material_codigo || `${numeroKickoff}-${r.id}`, material_codigo: r.material_codigo || "",
        item_novo: Boolean(r.item_novo), definido: simNao(r.definido) === "sim",
        fornecido_por: r.fornecido_por || "", fornecedor_principal: { id: null, nome: r.fornecedor_nome || "" },
        codigo_fornecedor: r.codigo_fornecedor || "", fornecedor_alternativo: null, unidade: "un",
        quantidade_por_unidade: porUnidade === null ? null : Number(porUnidade.toFixed(6)),
        unidades_por_embalagem: terciaria ? unidades : null,
        quantidade_total_pedido: total, custo_unitario_estimado_rs: 0,
        status_homologacao: r.material_codigo ? "homologado" : "pendente",
      });
    }
  }
  return linhas;
}

// Tudo que a cotação, a necessidade de material e o cadastro precisam: MPs da ficha + embalagens.
export const insumosDoKickoff = (kickoff) => [...(kickoff?.ficha_manipulacao?.itens || []), ...(kickoff?.bom || [])];
