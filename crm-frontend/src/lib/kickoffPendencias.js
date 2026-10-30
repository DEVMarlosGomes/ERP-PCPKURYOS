/* Pendências do questionário do Kickoff (KO-03, PROMPT_ENGENHARIA_PACOTE_20261021.md).
 *
 * Pedido do usuário (21/10/2026): o que no Kickoff for respondido como NÃO conta como preenchido
 * e segue sem pendência; o que for SIM obriga a preencher o texto que acompanha. Até aqui a tela
 * transformava pergunta não respondida em "Não" ao abrir (normalizeBinary(null) → "nao"), e salvar
 * gravava esse "Não" como resposta — a pendência sumia sem ninguém responder.
 * Sim/não tem três estados: "" (não respondida) · "sim" · "nao".
 * Pendência = obrigatório ∧ visível pela condição ∧ vazio (RFC-001 §9).
 * Funções puras: nada aqui lê ou grava no banco. */

import { TIPO_OUTRO, atributosPendentes } from "./tiposComponente";

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
  especificacao_fornecedor_codigo: "Item do Cadastros ou especificação", arte_cria_aprova: "Arte: cria / aprova", arte_aprovada: "Arte aprovada?",
  item_novo_descricao: "Descrição do item novo", definido_pendente: "Definir o componente (aplicável e ainda não definido)",
  gravacao: "Vai ser gravado?", tipo_gravacao: "Tipo de gravação", tipo_componente_outro: "Qual tipo (Outro)", qtd_por_unidade: "Quantidade por unidade", unidades_por_embalagem: "Unidades por embalagem",
};

/* KO-05 (23/10/2026): "Fornecido por" é Kuryos ou Cliente (menu). Medido em 22/10 nos 11 Kickoffs:
 * o texto livre tinha "ok" ×11, "KURYOS" ×5 e NOMES DE FORNECEDOR no lugar (PLASTSUL, VALVSPRAY,
 * GRÁFICA X…). Conversão: Kuryos/Cliente ficam; nome de fornecedor → Kuryos + fornecedor preenchido
 * (Compras confere); "ok" e afins → vazio (pendência visível). */
export function normalizarFornecidoPor(v) {
  const s = String(v ?? "").trim();
  const n = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!n || ["ok", "sim", "s", "x", "-", "nao", "n"].includes(n)) return { fornecido_por: "" };
  if (n === "kuryos" || n === "kuryos beauty") return { fornecido_por: "kuryos" };
  if (n === "cliente") return { fornecido_por: "cliente" };
  return { fornecido_por: "kuryos", fornecedor_nome: s };
}

// Linha gravada antes do KO-05 (fornecido_por em texto livre) no formato novo; a nova passa igual.
export function normalizarLinhaComponente(linha) {
  const r = { ...(linha || {}) };
  if (r.fornecido_por !== "kuryos" && r.fornecido_por !== "cliente") {
    const conv = normalizarFornecidoPor(r.fornecido_por);
    r.fornecido_por = conv.fornecido_por;
    if (conv.fornecedor_nome && !r.fornecedor_nome) r.fornecedor_nome = conv.fornecedor_nome;
  }
  return r;
}

const numeroPositivo = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/* Unidades do produto por embalagem terciária. Sem o número na linha, usa o Bloco 0:
 * display = unidades por display; caixa master = unidades por display × displays por master
 * (ou o campo "displays (ou unidades) por caixa master" quando não há display). */
export function unidadesPorEmbalagem(linha, bloco0 = {}) {
  const proprio = numeroPositivo(linha?.unidades_por_embalagem);
  if (proprio) return proprio;
  const porDisplay = numeroPositivo(bloco0.unidades_por_display);
  const porMaster = numeroPositivo(bloco0.displays_ou_unidades_por_caixa_master);
  if (linha?.id === "display_expositor_pdv") return porDisplay;
  if (linha?.id === "caixa_master") return porDisplay && porMaster ? porDisplay * porMaster : porMaster;
  return null;
}

// Quantidade da linha (BOM-01): primária/secundária = peças por unidade; terciária = unidades por embalagem.
const QTD_DO_BLOCO = { bloco2: "qtd_por_unidade", bloco3: "qtd_por_unidade", bloco4: "unidades_por_embalagem" };
const positivo = (v) => Number(String(v ?? "").replace(",", ".")) > 0;

/* KO-12 (reunião 28/10/2026): rótulo "Não aplicável" pergunta se o produto vai ser gravado (silk, hot
 * stamping, impressão direta) — sem rótulo, a identificação vai na peça. */
export const TIPOS_GRAVACAO = { silk: "Silk", hot_stamping: "Hot stamping", impressao_direta: "Impressão direta" };
export const LINHA_COM_GRAVACAO = "rotulo";

/* Linha de componente: Aplicável? vazio = pendente; Não = pronto (não entra no BOM) — o rótulo "Não"
 * ainda pede "Vai ser gravado?" e, se Sim, o tipo de gravação;
 * Sim → Definido? obrigatório; KO-12: Definido? Não (aplicável e não definido) é PENDÊNCIA — o bloco
 * não fica pronto e a aprovação do Kickoff trava até definir (antes era "pronto, define depois");
 * Definido? Sim → fornecido por (Kuryos/Cliente) + o item (do Cadastros, ou "item novo" descrito, ou a
 * especificação escrita) + quantidade; na secundária também arte: quem cria/aprova + arte aprovada?. */
export function pendenciasDaLinha(linha, comArte = false, bloco = comArte ? "bloco3" : "bloco2", bloco0 = {}) {
  const r = normalizarLinhaComponente(linha);
  const aplicavel = simNao(r.aplicavel);
  if (aplicavel === "") return ["aplicavel"];
  if (aplicavel === "nao") {
    if (r.id !== LINHA_COM_GRAVACAO) return [];
    const gravacao = simNao(r.gravacao);
    if (gravacao === "") return ["gravacao"];
    return gravacao === "sim" && !TIPOS_GRAVACAO[r.tipo_gravacao] ? ["tipo_gravacao"] : [];
  }
  const definido = simNao(r.definido);
  if (definido === "") return ["definido"];
  if (definido === "nao") return ["definido_pendente"];
  const faltam = [];
  if (VAZIO(r.fornecido_por)) faltam.push("fornecido_por");
  // KO-04: sem item do Cadastros, o tipo escolhido no menu especifica o componente — todos os
  // atributos obrigatórios do tipo preenchidos. Item do Cadastros traz as características dele.
  const peloTipo = VAZIO(r.material_codigo) && !VAZIO(r.tipo_componente);
  if (peloTipo) {
    if (r.tipo_componente === TIPO_OUTRO && VAZIO(r.tipo_componente_outro)) faltam.push("tipo_componente_outro");
    for (const def of atributosPendentes(r)) faltam.push(`atributos.${def.chave}`);
  } else if (r.item_novo) {
    if (VAZIO(r.item_novo_descricao)) faltam.push("item_novo_descricao");
  } else if (VAZIO(r.material_codigo) && VAZIO(r.especificacao_fornecedor_codigo)) faltam.push("especificacao_fornecedor_codigo");
  const campoQtd = QTD_DO_BLOCO[bloco];
  // Terciária: vale também a conta pelo Bloco 0 (unidades por display × displays por master).
  const qtdOk = bloco === "bloco4" ? Boolean(unidadesPorEmbalagem(r, bloco0)) : positivo(r[campoQtd]);
  if (campoQtd && Object.prototype.hasOwnProperty.call(r, campoQtd) && !qtdOk) faltam.push(campoQtd);
  if (comArte) {
    if (VAZIO(r.arte_cria_aprova)) faltam.push("arte_cria_aprova");
    if (simNao(r.arte_aprovada) === "") faltam.push("arte_aprovada");
  }
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
        for (const campo of pendenciasDaLinha(linha, bloco === "bloco3", bloco, q.bloco0 || {})) {
          const atributo = campo.startsWith("atributos.") && (linha.atributos_def || []).find((d) => `atributos.${d.chave}` === campo);
          pend.push({ campo: `componentes[${i}].${campo}`, rotulo: `${linha.componente || `Componente ${i + 1}`}: ${atributo ? atributo.nome : ROTULOS[campo] || campo}` });
        }
      });
    }
    status[bloco] = { completo: pend.length === 0, campos_pendentes: pend.map((p) => p.campo), pendencias: pend };
  }
  return { ok: Object.values(status).every((s) => s.completo), status };
}
