/* Fila de cadastro das MPs novas do P&D (PLANO_PD_CRM_AJUSTES.md, Fase 4).
 *
 * Cliente aprovou a amostra → cada MP nova (não cadastrada) da fórmula aprovada
 * vira tarefa em solicitacoes_cadastro_material/ (raiz do banco, lida pelo
 * Cadastros do PCP). Chave fixa por fórmula+item: aprovar de novo não duplica;
 * retrabalho gera versão nova, com itens novos, e as tarefas novas.
 * AMO-04 (22/10/2026): leva também os campos do material da linha (INCI até US$, ver
 * ingredienteCampos.js) em `campos`; inci/fornecedor na raiz continuam para o legado.
 * Funções puras: nada aqui lê ou grava no banco. */

import { camposMaterialDoItem } from "./ingredienteCampos";

export const chaveSolicitacaoMp = (formulaId, itemId) => `${formulaId}__${itemId}`;

export function solicitacoesDeMpsNovas({ request, formula, itens, projeto, agora, autor }) {
  const r = request || {};
  const out = {};
  for (const item of itens || []) {
    if (!item?.mp_nova || !item.id || !formula?.id) continue;
    out[chaveSolicitacaoMp(formula.id, item.id)] = {
      status: "PENDENTE_CADASTRO",
      tipo: item.mp_nova.tipo === "MPES" ? "MPES" : "MPGR",
      nome: String(item.mp_nova.nome || item.ingredient_name || "").trim(),
      ingrediente: item.ingredient_name || "",
      inci: item.inci || "",
      fornecedor: item.fornecedor || "",
      campos: camposMaterialDoItem(item),
      origem: {
        pdRequestId: r.id || null,
        formulaId: formula.id,
        formulaVersao: Number(formula.version) || 1,
        itemId: item.id,
        projetoId: projeto?.id || r.crm_project_id || r.linked_projeto_id || null,
        projetoNumero: projeto?.numero_projeto || "",
        projeto: projeto?.nome_projeto || r.project_name || "",
        amostra: r.internal_code || "",
        cliente: r.client_name || projeto?.cliente_nome || "",
      },
      criadoEm: agora,
      criadoPor: autor || "",
    };
  }
  return out;
}
