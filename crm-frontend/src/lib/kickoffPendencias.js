/* Pendências do questionário do Kickoff (KO-03, PROMPT_ENGENHARIA_PACOTE_20261021.md).
 *
 * Pedido do usuário (21/10/2026): o que no Kickoff for respondido como NÃO conta como preenchido
 * e segue sem pendência; o que for SIM obriga a preencher o texto que acompanha. Até aqui a tela
 * transformava pergunta não respondida em "Não" ao abrir (normalizeBinary(null) → "nao"), e salvar
 * gravava esse "Não" como resposta — a pendência sumia sem ninguém responder.
 * Sim/não tem três estados: "" (não respondida) · "sim" · "nao".
 * Pendência = obrigatório ∧ visível pela condição ∧ vazio (RFC-001 §9).
 * Funções puras: nada aqui lê ou grava no banco. */

const VAZIO = (v) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

// Três estados. Valor antigo gravado como true/false continua valendo.
export function simNao(v) {
  if (v === true) return "sim";
  if (v === false) return "nao";
  const s = String(v ?? "").trim().toLowerCase();
  if (["sim", "s", "yes", "y", "true", "1"].includes(s)) return "sim";
  if (["nao", "não", "n", "ñ", "no", "false", "0"].includes(s)) return "nao";
  return "";
}

// Campos de texto/escolha obrigatórios (sempre visíveis).
export const OBRIGATORIOS = {
  bloco0: ["cliente", "nome_produto", "categoria", "forma_fisica", "volume_gramatura", "numero_skus_variacoes", "modelo_servico"],
  bloco1: ["formula", "cliente_fornece", "viscosidade", "densidade", "compra_fragrancia_por"],
  bloco5: ["especificacoes_cq_componentes", "testes_aprovacoes_obrigatorios"],
  fechamento: ["data_prevista_inicio_producao", "volume_primeiro_lote", "responsavel_kuryos", "responsavel_cliente", "data_preenchimento"],
};

// Sim/não de cada bloco e o que o SIM obriga a preencher.
export const SIM_NAO = {
  bloco1: { tem_cor: ["cor_descricao"], tem_brilho_mica_glitter: ["brilho_descricao"] },
  bloco5: { amostra_referencia_fornecida_cliente: ["amostra_referencia_descricao"] },
};

export const ROTULOS = {
  cliente: "Cliente", nome_produto: "Nome do produto", categoria: "Categoria", forma_fisica: "Forma física",
  volume_gramatura: "Volume / gramatura", numero_skus_variacoes: "Nº de SKUs / variações", modelo_servico: "Classificação do projeto",
  formula: "Fórmula", cliente_fornece: "O cliente fornece", viscosidade: "Viscosidade", densidade: "Densidade",
  compra_fragrancia_por: "Compra da fragrância por", tem_cor: "Tem cor?", cor_descricao: "Qual cor (descrição / código)",
  tem_brilho_mica_glitter: "Tem brilho/mica/glitter?", brilho_descricao: "Qual brilho/mica/glitter",
  especificacoes_cq_componentes: "Especificações de CQ por componente", testes_aprovacoes_obrigatorios: "Testes / aprovações obrigatórios",
  amostra_referencia_fornecida_cliente: "Amostra de referência do cliente?", amostra_referencia_descricao: "Descrição da amostra de referência",
  data_prevista_inicio_producao: "Data prevista de início", volume_primeiro_lote: "Volume do primeiro lote",
  responsavel_kuryos: "Responsável Kuryos", responsavel_cliente: "Responsável cliente", data_preenchimento: "Data do preenchimento",
  aplicavel: "Aplicável?", definido: "Definido?", fornecido_por: "Fornecido por",
  especificacao_fornecedor_codigo: "Especificação / fornecedor / código", arte_cria_aprova: "Arte: cria / aprova", arte_aprovada: "Arte aprovada?",
};

/* Linha de componente: Aplicável? vazio = pendente; Não = pronto (não entra no BOM);
 * Sim → Definido? obrigatório; Definido? Não = pronto (será definido depois, sem pendência);
 * Definido? Sim → fornecido por + especificação (ou arte: quem cria/aprova + arte aprovada?). */
export function pendenciasDaLinha(linha, comArte = false) {
  const r = linha || {};
  const aplicavel = simNao(r.aplicavel);
  if (aplicavel === "") return ["aplicavel"];
  if (aplicavel === "nao") return [];
  const definido = simNao(r.definido);
  if (definido === "") return ["definido"];
  if (definido === "nao") return [];
  const faltam = [];
  if (VAZIO(r.fornecido_por)) faltam.push("fornecido_por");
  if (comArte) {
    if (VAZIO(r.arte_cria_aprova)) faltam.push("arte_cria_aprova");
    if (simNao(r.arte_aprovada) === "") faltam.push("arte_aprovada");
  } else if (VAZIO(r.especificacao_fornecedor_codigo)) faltam.push("especificacao_fornecedor_codigo");
  return faltam;
}

export const BLOCOS = ["bloco0", "bloco1", "bloco2", "bloco3", "bloco4", "bloco5", "fechamento"];

/* Mesmo formato que o resto do sistema já lê ({ ok, status: { bloco: { completo, campos_pendentes } } }),
 * mais `pendencias` com rótulo para a tela. */
export function pendenciasQuestionario(questionario) {
  const q = questionario || {};
  const status = {};
  for (const bloco of BLOCOS) {
    const dados = q[bloco] || {};
    const pend = [];
    for (const campo of OBRIGATORIOS[bloco] || []) if (VAZIO(dados[campo])) pend.push({ campo, rotulo: ROTULOS[campo] || campo });
    for (const [campo, dependentes] of Object.entries(SIM_NAO[bloco] || {})) {
      const v = simNao(dados[campo]);
      if (v === "") pend.push({ campo, rotulo: ROTULOS[campo] || campo });
      else if (v === "sim") for (const d of dependentes) if (VAZIO(dados[d])) pend.push({ campo: d, rotulo: ROTULOS[d] || d });
    }
    if (["bloco2", "bloco3", "bloco4"].includes(bloco)) {
      (dados.componentes || []).forEach((linha, i) => {
        for (const campo of pendenciasDaLinha(linha, bloco === "bloco3")) {
          pend.push({ campo: `componentes[${i}].${campo}`, rotulo: `${linha.componente || `Componente ${i + 1}`}: ${ROTULOS[campo] || campo}` });
        }
      });
    }
    status[bloco] = { completo: pend.length === 0, campos_pendentes: pend.map((p) => p.campo), pendencias: pend };
  }
  return { ok: Object.values(status).every((s) => s.completo), status };
}
