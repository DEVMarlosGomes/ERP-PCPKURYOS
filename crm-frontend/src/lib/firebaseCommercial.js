/* Fluxo comercial do ERP no Firebase (PCP Kuryos incorporado), portado de
 * backend/propostas_routes.py, kickoff_routes.py e contratos_routes.py do
 * master a6892e6:
 *
 *   CRM2 cotação/orçamento → decisão do cliente → Kickoff (questionário de
 *   composição + aprovação P&D → CQ → Engenharia → Direção) → CGI gerado do
 *   Kickoff aprovado → CGI assinado → SKU no cadastro mestre (produtos/) →
 *   pedido liberado no PCP (pedidos_comerciais/ + pedidos/) → emissão de OP.
 *
 * Diferenças deliberadas em relação ao backend Python:
 *  - SKU nasce em produtos/{CAT-CLI-0001}, o cadastro mestre que o PCP usa,
 *    com o contador config/contadores/sku/{CAT}_{CLI} do próprio PCP.
 *  - O pedido é o mesmo documento do Comercial do PCP (formato de
 *    comercial.html → salvarPedido): nasce AGUARDANDO_CGI na aprovação do
 *    orçamento e só ganha as linhas de pedidos/ (lidas pela emissão de OP)
 *    quando o CGI é assinado e as SKUs existem.
 *  - O PDF do CGI é um documento HTML para imprimir/salvar em PDF (não há
 *    servidor); o conteúdo jurídico fica congelado no contrato ao gerar.
 *  - ADM pode dispensar requisitos (fórmula registrada, amostra aprovada,
 *    cadastro de itens do BOM); a dispensa fica registrada no histórico.
 */
import { get, ref, runTransaction, set, update } from "firebase/database";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { firebaseAuth, firebaseDb, firebaseStorage } from "@/lib/firebase";
import { MIN_JUSTIFICATIVA, PROJECT_STAGES, PROJECT_TRANSITIONS, formulaRegistrada, hasAnyRole, isAdmin, isComercial, movementEntry, normalizeName } from "@/lib/crmRules";
import { numeroKickoff } from "@/lib/numeracaoProjeto";
import { registroDeCambio, taxaDaCotacao, textoCambio } from "@/lib/cambio";
import { calcularCotacao, insumosDoBom, mensagemDePendencias, precoDoItemDeFormula } from "@/lib/cotacao";
import { ehSugestao, sugestaoDePreco, ultimoPrecoDoMaterial } from "@/lib/ultimoPreco";
import { entradaHistoricoAprovacao, validarAprovacaoCliente } from "@/lib/aprovacaoCliente";
import { acrescentarHistorico } from "@/lib/historicoTimeline";
import { ROTULOS, normalizarLinhaComponente, pendenciasQuestionario, simNao } from "@/lib/kickoffPendencias";
import { BLOCOS_DA_ETAPA, aguardaPd, assinaturaDoBloco, congelarTodos, estadoDosBlocos, validarBlocos } from "@/lib/kickoffBlocos";
import { aplicarSobrescritas, coletorDeOrigem, preencherVazios, sobrescritasDaOrigem, variacaoEntreSkus } from "@/lib/kickoffAutopreenchimento";
import { insumosDoKickoff, linhasDeEmbalagem } from "@/lib/kickoffBom";
import { validarResponsavel } from "@/lib/responsaveisTecnicos";
import { resolverDesatualizado, textoDesatualizado } from "@/lib/retrabalhoAprovada";
import {
  STATUS_COTACAO, TRAVADAS, diffLinhas, itensParaCompras, linhasDaCotacao, mesclarLinhas, numeroCotacao, precosDaCotacao, precosDosProcessos, resumoCotacao,
} from "@/lib/cotacaoKickoff";

export const NOT_HANDLED = Symbol("not-handled");

/* ── Papéis ───────────────────────────────────────────────────────────── */

export { isComercial };

const KICKOFF_EDIT_ROLES = new Set(["lider_pd", "formulador", "engenharia_produto", "qa", "qualidade"]);
const CONTRATO_READ_ROLES = new Set(["compras", "lider_pd", "qa", "qualidade", "engenharia_produto"]);

// KO-07 (23/10/2026): etapa Comercial antes da Direção (premissa aprovada). Aprova o responsável
// comercial do cliente (crm_clients.responsavel_comercial) ou o ADM, com registro.
const APPROVAL_SEQUENCE = ["lider_pd", "cq", "eng_produto", "comercial", "direcao"];
const APPROVAL_ROLE_MAP = {
  lider_pd: new Set(["lider_pd"]),
  cq: new Set(["qa", "qualidade"]),
  eng_produto: new Set(["engenharia_produto"]),
  comercial: new Set(["vendedor", "sales_ops", "sucesso_cliente"]),
  direcao: new Set(),
};
const APPROVAL_LABELS = { lider_pd: "Lider P&D", cq: "CQ", eng_produto: "Engenharia de Produto", comercial: "Comercial", direcao: "Direcao" };

export const KURYOS_FABRICANTE = {
  razao_social: "KURYOS BEAUTY PACKING INDUSTRIAL LTDA",
  cnpj: "00.767.554/0001-19",
  endereco: "Rua Lagoa Tai Grande, n. 1130, CEP 08290-425, Sao Paulo/SP",
  anvisa: "355030801-206-000078-1-1",
  foro: "Comarca de Sao Paulo/SP",
};

/* ── Questionário de composição (kickoff_routes.py) ───────────────────── */

export const QUESTIONARIO_COMPOSICAO_VERSION = "questionario_composicao_projeto_2";

const BLOCO2_COMPONENTS = [
  ["frasco_pote_bisnaga", "Frasco / pote / bisnaga"],
  ["airless_rollon_ampola", "Airless / roll-on / ampola"],
  ["tampa", "Tampa (rosca / flip-top / pressao)"],
  ["valvula_pump", "Valvula pump / bomba dosadora"],
  ["valvula_spray", "Valvula spray / atomizador"],
  ["valvula_aerossol_atuador", "Valvula aerossol + atuador"],
  ["gatilho_trigger", "Gatilho / trigger"],
  ["batoque_redutor_orificio", "Batoque / redutor / orificio"],
  ["lacre_inducao_disco", "Lacre de inducao / disco de vedacao"],
  ["aplicador", "Aplicador (pincel / espatula / esponja)"],
];
const BLOCO3_COMPONENTS = [
  ["rotulo", "Rotulo (frontal / contra)"],
  ["cartucho", "Cartucho"],
  ["bula_folheto", "Bula / folheto"],
  ["selo_lacre_seguranca", "Selo / lacre de seguranca"],
  ["celofane_shrink", "Celofane / shrink"],
  ["berco_suporte_interno", "Berco / suporte interno"],
];
const BLOCO4_COMPONENTS = [
  ["display_expositor_pdv", "Display / expositor de PDV"],
  ["caixa_master", "Caixa de embarque (master)"],
  ["divisoria_colmeia", "Divisoria / separador / colmeia"],
  ["cantoneira", "Cantoneira"],
  ["paletizacao", "Especificacao de paletizacao"],
];

const EMPTY = (value) => value === undefined || value === null || value === ""
  || (Array.isArray(value) && value.length === 0)
  || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const firstValue = (...values) => values.find((value) => !EMPTY(value)) ?? "";
const asText = (value) => (EMPTY(value) ? "" : String(value));

function toFloatOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = typeof value === "string" ? value.replace(/\./g, "").replace(",", ".") : value;
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : null;
}

// BOM-01/KO-05: primária e secundária nascem com 1 peça por unidade; a terciária pede unidades por embalagem.
function componentRows(rows, hasArt = false, terciaria = false) {
  return rows.map(([id, componente]) => ({
    id, componente, aplicavel: "", definido: "", fornecido_por: "", observacoes: "", especificacao_fornecedor_codigo: "",
    ...(terciaria ? { unidades_por_embalagem: "" } : { qtd_por_unidade: 1 }),
    ...(hasArt ? { arte_cria_aprova: "", arte_aprovada: "" } : {}),
  }));
}

export function questionarioTemplate() {
  return {
    schema_version: QUESTIONARIO_COMPOSICAO_VERSION,
    bloco0: {
      cliente: "", nome_produto: "", categoria: "", categoria_outro: "", forma_fisica: "", forma_fisica_outro: "",
      volume_gramatura: "", numero_skus_variacoes: "", varia_entre_skus: [], varia_entre_skus_outro: "",
      unidades_por_display: "", displays_ou_unidades_por_caixa_master: "", registro_notificacao_anvisa: "",
      detentor_registro: "", responsavel_tecnico: "", modelo_servico: "",
    },
    bloco1: {
      formula: "", cliente_fornece: [], tem_cor: "", tem_brilho_mica_glitter: "", viscosidade: "", densidade: "",
      fragrancia_essencia: "", compra_fragrancia_por: "", observacoes_formulacao: "",
    },
    bloco2: { componentes: componentRows(BLOCO2_COMPONENTS) },
    bloco3: { componentes: componentRows(BLOCO3_COMPONENTS, true) },
    bloco4: { componentes: componentRows(BLOCO4_COMPONENTS, false, true) },
    bloco5: {
      especificacoes_cq_componentes: "", especificacoes_cq_anexos: [], testes_aprovacoes_obrigatorios: "",
      amostra_referencia_fornecida_cliente: "",
    },
    fechamento: {
      data_prevista_inicio_producao: "", volume_primeiro_lote: "", responsavel_kuryos: "", responsavel_cliente: "",
      data_preenchimento: "",
    },
    autopopulated_from: [],
  };
}

export function mergeQuestionario(base, incoming) {
  const merged = clone(base) || {};
  for (const [key, value] of Object.entries(incoming || {})) {
    if (["bloco2", "bloco3", "bloco4"].includes(key) && value && typeof value === "object" && !Array.isArray(value)) {
      const current = merged[key] || (merged[key] = {});
      // KO-05: linha antiga (fornecido por em texto livre) é gravada no formato novo.
      if (Array.isArray(value.componentes)) current.componentes = clone(value.componentes).map(normalizarLinhaComponente);
      for (const [subKey, subValue] of Object.entries(value)) if (subKey !== "componentes") current[subKey] = clone(subValue);
    } else if (value && typeof value === "object" && !Array.isArray(value) && merged[key] && typeof merged[key] === "object" && !Array.isArray(merged[key])) {
      merged[key] = { ...merged[key], ...clone(value) };
    } else {
      merged[key] = clone(value);
    }
  }
  merged.schema_version = QUESTIONARIO_COMPOSICAO_VERSION;
  return merged;
}

// KO-03 (23/10/2026): pendências em lib/kickoffPendencias.js — "Não" é resposta, "Sim" exige o
// complemento, vazio é pendente. Antes "Definido? = Não" ainda exigia fornecedor e especificação e
// a tela convertia pergunta não respondida em "Não".
export const questionarioReady = pendenciasQuestionario;

const findComponent = (questionario, section, id) => (questionario?.[section]?.componentes || []).find((row) => row.id === id) || {};
// Componente "não aplicável" não alimenta o BOM (no master contava como respondido).
// KO-03/05: só componente com "Aplicável?" = Sim e algo além do nome e da quantidade padrão.
const componentAnswered = (row) => simNao(row?.aplicavel) === "sim"
  && Object.entries(row || {}).some(([key, value]) => !["id", "componente", "aplicavel", "qtd_por_unidade", "unidades_por_embalagem"].includes(key) && !EMPTY(value));

export function legacyBlocksFromQuestionario(questionario, kickoff) {
  const b0 = questionario.bloco0 || {};
  const b1 = questionario.bloco1 || {};
  const b5 = questionario.bloco5 || {};
  const fe = questionario.fechamento || {};
  const old2 = kickoff.bloco2 || {};
  const old3 = kickoff.bloco3 || {};
  const old4 = kickoff.bloco4 || {};
  const answered = (section, id) => { const row = findComponent(questionario, section, id); return componentAnswered(row) ? row : {}; };
  const primary = answered("bloco2", "frasco_pote_bisnaga");
  const tampa = answered("bloco2", "tampa");
  const rotulo = answered("bloco3", "rotulo");
  const caixa = answered("bloco4", "caixa_master");
  const palete = answered("bloco4", "paletizacao");
  return {
    bloco2: {
      ...old2,
      volume_primeiro_pedido: toFloatOrNull(fe.volume_primeiro_lote) || old2.volume_primeiro_pedido || null,
      unidade_venda: firstValue(b0.volume_gramatura, old2.unidade_venda),
      quantidade_por_caixa: toFloatOrNull(b0.displays_ou_unidades_por_caixa_master) || old2.quantidade_por_caixa || null,
      data_entrega_contratada: firstValue(fe.data_prevista_inicio_producao, old2.data_entrega_contratada),
      condicao_pagamento: firstValue(old2.condicao_pagamento, "a_definir"),
      preco_venda_cliente_rs_un: firstValue(old2.preco_venda_cliente_rs_un, 0),
      observacoes_comerciais: firstValue(old2.observacoes_comerciais, b5.testes_aprovacoes_obrigatorios),
    },
    bloco3: {
      ...old3,
      nome_tecnico_produto: firstValue(b0.nome_produto, old3.nome_tecnico_produto),
      nome_comercial_cliente: firstValue(b0.nome_produto, old3.nome_comercial_cliente),
      categoria_anvisa: firstValue(b0.categoria, old3.categoria_anvisa),
      tipo_produto: firstValue(b0.categoria, old3.tipo_produto),
      forma_apresentacao: firstValue(b0.forma_fisica, old3.forma_apresentacao),
      volume_peso_liquido_valor: toFloatOrNull(b0.volume_gramatura) || old3.volume_peso_liquido_valor || null,
      aspecto_visual: firstValue(old3.aspecto_visual, b0.forma_fisica),
      cor_descricao: firstValue(old3.cor_descricao, b1.tem_cor),
      odor: firstValue(old3.odor, b1.fragrancia_essencia),
      registro_anvisa_numero: firstValue(old3.registro_anvisa_numero, b0.registro_notificacao_anvisa),
      analises_obrigatorias_por_lote: old3.analises_obrigatorias_por_lote || (b5.testes_aprovacoes_obrigatorios ? [b5.testes_aprovacoes_obrigatorios] : []),
      plano_amostragem: firstValue(old3.plano_amostragem, b5.especificacoes_cq_componentes),
      responsavel_liberacao_lote: firstValue(old3.responsavel_liberacao_lote, fe.responsavel_kuryos),
    },
    bloco4: {
      ...old4,
      embalagem_primaria_tipo: firstValue(primary.componente, old4.embalagem_primaria_tipo),
      embalagem_primaria_material: firstValue(primary.especificacao_fornecedor_codigo, old4.embalagem_primaria_material),
      embalagem_primaria_fornecedor_id: firstValue(primary.fornecedor_nome, old4.embalagem_primaria_fornecedor_id),
      fechamento_tipo: firstValue(tampa.componente, old4.fechamento_tipo),
      fechamento_fornecedor_id: firstValue(tampa.fornecedor_nome, old4.fechamento_fornecedor_id),
      caixa_master_tipo: firstValue(caixa.especificacao_fornecedor_codigo, caixa.componente, old4.caixa_master_tipo),
      caixa_master_unidades: toFloatOrNull(b0.displays_ou_unidades_por_caixa_master) || old4.caixa_master_unidades || null,
      configuracao_palete: firstValue(palete.especificacao_fornecedor_codigo, old4.configuracao_palete),
      tipo_rotulagem: firstValue(rotulo.componente, old4.tipo_rotulagem),
      rotulo_fornecedor_id: firstValue(rotulo.fornecedor_nome, old4.rotulo_fornecedor_id),
      rotulo_arte_aprovador: firstValue(rotulo.arte_cria_aprova, old4.rotulo_arte_aprovador),
    },
  };
}

function mapCategoria(value) {
  const key = String(value || "").trim().toLowerCase();
  return ({ capilares: "capilar", capilar: "capilar", skin_care: "skin_care", skincare: "skin_care", skin_care_dermocosmeticos: "skin_care",
    perfumaria: "perfumaria", maquiagem: "maquiagem", home_care: "home_care" })[key] || key;
}

function mapModeloServico(value) {
  const key = String(value || "").trim().toLowerCase();
  return ({ formula_do_cliente: "industrializacao_pura", co_desenvolvimento: "industrializacao_com_desenvolvimento",
    full_service: "full_service_marca_propria", full_service_kuryos: "full_service_marca_propria",
    full_service_marca_propria: "full_service_marca_propria" })[key] || key;
}

// Kickoff antigo (antes do questionário de composição): prontidão por blocos, como no master.
const LEGACY_REQUIRED = {
  bloco2: ["volume_primeiro_pedido", "data_entrega_contratada", "preco_venda_cliente_rs_un", "condicao_pagamento"],
  bloco3: ["nome_tecnico_produto", "tipo_produto", "forma_apresentacao", "categoria_anvisa"],
  bloco4: ["embalagem_primaria_tipo", "embalagem_primaria_material", "tipo_rotulagem"],
};

export function kickoffReadiness(kickoff) {
  if (!EMPTY(kickoff.questionario_composicao)) {
    const { ok, status } = questionarioReady(kickoff.questionario_composicao);
    const missing = Object.entries(status).filter(([, info]) => !info.completo).map(([section, info]) => `${section}: ${info.campos_pendentes.join(", ")}`);
    return { legacy: false, ok, status, missing: missing.length ? `Questionario incompleto: ${missing.join("; ")}` : "" };
  }
  const status = Object.fromEntries(Object.entries(LEGACY_REQUIRED).map(([bloco, fields]) => {
    const pendentes = fields.filter((field) => EMPTY((kickoff[bloco] || {})[field]));
    return [bloco, { completo: pendentes.length === 0, campos_pendentes: pendentes }];
  }));
  const first = Object.entries(status).find(([, info]) => !info.completo);
  const label = (b) => `Bloco ${b.slice(-1)}`;
  return { legacy: true, ok: !first, status, missing: first ? `${label(first[0])} incompleto: ${first[1].campos_pendentes.join(", ")}` : "" };
}

const approvalTemplate = () => APPROVAL_SEQUENCE.map((etapa) => ({
  etapa, label: APPROVAL_LABELS[etapa], status: "pendente", decisao: null, justificativa: "", observacoes: "",
  decidido_por: null, decidido_por_nome: "", decidido_em: null,
}));

// Kickoff em andamento criado antes do KO-07 ganha a etapa Comercial na posição certa; aprovado fica como está.
function normalizarAprovacoes(kickoff) {
  if (kickoff?.status === "aprovado") return kickoff?.aprovacoes || [];
  const porEtapa = new Map((kickoff?.aprovacoes || []).map((a) => [a.etapa, a]));
  return approvalTemplate().map((modelo) => porEtapa.get(modelo.etapa) || modelo);
}
const currentApprovalStep = (kickoff) => normalizarAprovacoes(kickoff).find((step) => step.status === "pendente") || null;

// RFC-001: estado de cada bloco a partir do questionário e do que já foi validado.
function blocosDoKickoff(kickoff, questionario = kickoff?.questionario_composicao) {
  if (!questionario) return { estados: {}, invalidados: [] };
  const dispensouFormula = (kickoff.requisitos_dispensados || []).some((r) => /f[óo]rmula/i.test(String(r)));
  return estadoDosBlocos({
    questionario, pendencias: pendenciasQuestionario(questionario).status, anterior: kickoff.blocos_estado || {},
    congelado: kickoff.status === "aprovado", aguardandoPd: aguardaPd(kickoff, questionario) && !dispensouFormula,
  });
}

/* ── Amostras: aprovação P&D + Comercial (propostas_routes.py, R18) ───── */

const STATUS_PD_APROVADO = new Set(["aprovado", "concluido", "APPROVED", "COMPLETED"]);
const STATUS_PD_REPROVADO = new Set(["reprovado", "REJECTED"]);

export function variationApprovals(variation) {
  const resultado = variation.resultado || variation.resultado_cliente || "";
  const aprovacaoPd = Boolean(variation.aprovacao_pd) || STATUS_PD_APROVADO.has(variation.status_pd_raw || "");
  const aprovacaoComercial = resultado === "aprovada" || variation.status === "aprovada" || (Boolean(variation.aprovacao_externa) && resultado === "aprovada");
  return { aprovacaoPd, aprovacaoComercial, aprovada: aprovacaoPd && aprovacaoComercial, resultado };
}

const clientApproved = (variation) => variationApprovals(variation).aprovacaoComercial;

/* ── Cadastro mestre de materiais (materiais/{key}: mpCodigo, mpNome) ── */

export const materialCode = (m) => (m ? m.mpCodigo || m.codigo || m.id : "");
export const materialName = (m) => (m ? m.mpNome || m.nome || m.descricao || "" : "");

// Procura por chave, código ou nome (sem acento/caixa) no cadastro mestre.
export function materialFinder(materials) {
  const index = new Map();
  for (const m of materials) {
    if (m.ativo === false) continue;
    for (const value of [m.id, m.mpCodigo, m.codigo, m.mpNome, m.nome, m.descricao, m.inci, m.nomeInci]) {
      const key = value && normalizeName(value);
      if (key && !index.has(key)) index.set(key, m);
    }
  }
  return (...keys) => keys.filter(Boolean).map((key) => index.get(normalizeName(key))).find(Boolean) || null;
}

/* ── Utilidades de banco ──────────────────────────────────────────────── */

async function nextCounter(path) {
  const result = await runTransaction(ref(firebaseDb, path), (current) => (Number(current) || 0) + 1);
  const value = result?.snapshot?.val();
  if (!result?.committed || value === null || value === undefined || Number.isNaN(Number(value))) {
    throw new Error(`Não foi possível reservar o próximo número em ${path}. Nada foi gravado — tente de novo.`);
  }
  return Number(value);
}

const pad = (value, size = 4) => String(value).padStart(size, "0");
const today = () => new Date().toISOString().slice(0, 10);

// Mesmo saneamento de chave do PCP (public/shared/utils.js → sanitizeKey).
export function sanitizeKey(value) {
  if (!value) return "";
  return String(value).trim().replace(/[./[\]#$]/g, "-").replace(/\s+/g, "_").slice(0, 60);
}

const userName = (profile) => profile?.name || profile?.nome || profile?.email || "Usuário do sistema";
// Contatos do CRM no formato do cadastro mestre (shared/contatos-cliente.js, contatosVersao 1).
function contatosParaCadastro(crmClient) {
  const lista = [crmClient?.contato_principal, ...(Array.isArray(crmClient?.contatos_adicionais) ? crmClient.contatos_adicionais : [])];
  const contatos = {};
  lista.forEach((c, i) => {
    const nome = String(c?.nome || "").trim();
    const email = String(c?.email || "").trim();
    const telefone = String(c?.whatsapp || c?.telefone || "").trim();
    if (!nome && !email && !telefone) return;
    const cargo = String(c?.cargo_custom || c?.cargo || "").trim();
    contatos[i === 0 ? "crm_principal" : `crm_${i}`] = { nome, email, telefone, areas: ["COMERCIAL"], principais: i === 0 ? ["COMERCIAL"] : [],
      outraArea: "", observacoes: ["Do CRM", cargo, c?.decisor ? "decisor" : ""].filter(Boolean).join(" · ") };
  });
  if (!Object.keys(contatos).length) return {};
  const principal = contatos.crm_principal || Object.values(contatos)[0];
  return { contatosVersao: 1, contatos, contatoComNome: principal.nome, contatoComEmail: principal.email, contatoComTelefone: principal.telefone };
}
// O que a Emissão de OP do PCP lê do produto e o Kickoff já sabe: volume + unidade (dimensionamento
// do lote), densidade do granel e prazo de validade. Só preenche o que o Kickoff tem — nada inventado.
export function dadosDeProducaoDoKickoff(kickoff) {
  const q = kickoff?.questionario_composicao || {};
  const b3 = kickoff?.bloco3 || {};
  const b2 = kickoff?.bloco2 || {};
  const out = {};
  const m = String(q.bloco0?.volume_gramatura || "").replace(",", ".").match(/([\d.]+)\s*(ml|l|g|kg)\b/i);
  if (m && Number(m[1]) > 0) Object.assign(out, { volume: Number(m[1]), unidadeVolume: m[2].toLowerCase() });
  else if (Number(b3.volume_peso_liquido_valor) > 0) {
    const u = String(b3.volume_peso_liquido_unidade || "ml").toLowerCase();
    Object.assign(out, { volume: Number(b3.volume_peso_liquido_valor), unidadeVolume: ["ml", "l", "g", "kg"].includes(u) ? u : "ml" });
  }
  const densidade = Number(String(q.bloco1?.densidade ?? "").replace(",", "."));
  if (densidade > 0 && densidade < 3) out.densidadeGranel = densidade;
  const validade = Number.parseInt(b2.prazo_validade_produto_meses, 10);
  if (validade > 0) out.prazoValidadeMeses = validade;
  return out;
}

// responsavel_comercial guarda o id do usuário; documentos (Kickoff, CGI) levam o nome.
async function nomeDoUsuario(masterOne, valor) {
  const v = String(valor || "").trim();
  if (!v || /\s/.test(v)) return v;
  for (const col of ["usuarios_publico", "usuarios"]) {
    try {
      const u = await masterOne(col, v);
      if (u && (u.nome || u.name || u.email)) return u.nome || u.name || u.email;
    } catch { /* sem permissão nesse índice: tenta o próximo */ }
  }
  return v;
}
const currentUid = () => firebaseAuth.currentUser?.uid || "";

/* ── Rotas ────────────────────────────────────────────────────────────── */

export function createCommercialRouter(h) {
  const { all, one, save, patch, create, related, masterAll, masterOne, masterWrite, apiError, now, newId, auditCard, syncMasterClients, call } = h;
  const ensureNumeroProjeto = h.ensureNumeroProjeto || (async (tenant, project) => project?.numero_projeto || "");
  const justificationRequired = h.justificationRequired || ((detail) => apiError(400, detail));
  const lerCambio = h.lerCambio || (async () => null);

  /* COM-01 (22/10/2026): sem congelamento. Em cada etapa a taxa do momento vai, em número e
   * em texto, para o histórico do cliente (aba Histórico do CRM1) e para erp/{t}/cambio_log.
   * Chamar DEPOIS de mudar etapa do projeto/cliente: essas rotinas regravam o histórico inteiro. */
  async function cambioAgora(project, etapa, profile) {
    return registroDeCambio(await lerCambio(true), {
      etapa, documento: project?.numero_projeto ? `Projeto ${project.numero_projeto}` : (project?.nome_projeto || ""),
      projetoId: project?.id || "", agora: now(), por: currentUid(), porNome: userName(profile),
    });
  }
  async function registrarCambio(tenant, project, etapa, profile, pronto = null) {
    const registro = pronto || await cambioAgora(project, etapa, profile);
    if (!registro) return null;
    const entrada = { ...registro, texto: textoCambio(registro), data: registro.registrado_em, usuario: registro.registrado_por_nome };
    const cliente = project?.cliente_id ? await one(tenant, "crm_clients", project.cliente_id) : null;
    if (cliente) await acrescentarHistorico(`erp/${tenant}/crm_clients/${cliente.id}/historico_movimentacoes`, entrada);
    await create(tenant, "cambio_log", { ...entrada, cliente_id: cliente?.id || null });
    return registro;
  }

  const requireComercial = (profile, action) => {
    if (!isComercial(profile)) throw apiError(403, `${action}: permissão exclusiva do Comercial ou do administrador.`);
  };

  async function getProject(tenant, projectId) {
    const project = await one(tenant, "crm_projects", projectId);
    if (!project) throw apiError(404, "Projeto não encontrado");
    return project;
  }

  /* Proposta (uma por projeto) */

  const PROPOSTA_FIELDS = [
    "tipo_produto", "variacao_produto", "preco_unitario", "insumos_inclusos", "observacoes_proposta", "items_pedido",
    "desenvolvimentos_embalagem", "condicoes_pagamento", "insumos_fabricacao", "rodape_observacoes", "status",
    "negociacao_status", "negociacao_motivo", "negociacao_evidencia_file_id", "negociacao_observacoes", "composicao",
  ];
  const pickProposta = (data, { dropNull }) => Object.fromEntries(PROPOSTA_FIELDS
    .filter((key) => Object.prototype.hasOwnProperty.call(data || {}, key))
    .filter((key) => !dropNull || (data[key] !== null && data[key] !== undefined))
    .map((key) => [key, data[key]]));

  const findProposta = async (tenant, projectId) => (await related(tenant, "crm_propostas", "projeto_id", projectId))[0] || null;

  // Fase 7: a composição (insumos do BOM + serviços) é recalculada aqui com a taxa da cotação
  // (a da aprovação quando aprovada, senão a do dia). Enviar com item SEM PREÇO é recusado — nunca vira zero.
  async function conferirComposicao(changes, existing) {
    if (!changes.composicao) return;
    const status = changes.status ?? existing?.status;
    // Só taxa real (registrada na aprovação ou ao vivo): o padrão de R$ 6,00 das fórmulas não vale
    // para cotação ao cliente — sem dólar, insumo em US$ fica "SEM CÂMBIO", como na tela.
    // Leitura forçada: o cache de 30 s pode estar atrás do dólar que será registrado nesta gravação.
    const cambio = taxaDaCotacao({ ...(existing || {}), ...changes }, await lerCambio(true));
    const r = calcularCotacao(changes.composicao, cambio.origem === "padrao" ? null : cambio.taxa);
    if (status === "enviado" && !r.pode_enviar) throw apiError(422, mensagemDePendencias(r.pendencias));
    changes.composicao = {
      ...changes.composicao,
      resumo: {
        insumos_por_un: r.insumos_por_un, servicos_por_un: r.servicos_por_un, preco_un: r.preco_un, total_pedido: r.total_pedido,
        desconto_servicos_total: r.desconto_servicos_total, taxa: r.taxa, pendencias: r.pendencias.length, calculado_em: now(),
      },
    };
  }

  const kickoffVigente = async (tenant, projectId) => (await related(tenant, "kickoffs", "projeto_id", projectId))
    .filter((k) => !["substituida", "arquivado"].includes(k.status))
    .sort((a, b) => Number(b.versao_numero || 0) - Number(a.versao_numero || 0))[0] || null;

  const kgDaUnidade = (valor, unidade) => {
    const v = Number(valor) || 0;
    return ["ml", "g"].includes(String(unidade || "mL").toLowerCase()) ? v / 1000 : v;
  };

  // Base da cotação: BOM do Kickoff vigente (preço da MP pela fórmula do P&D) + tabela de serviços.
  async function cotacaoBase(tenant, projectId) {
    const project = await getProject(tenant, projectId);
    // Sem a regra do nó servicos/ publicada a leitura dá PERMISSION_DENIED: a cotação segue com
    // os insumos e avisa que a tabela de serviços não pôde ser lida.
    let servicosErro = "";
    const servicos = (await masterAll("servicos").catch((err) => { servicosErro = String(err?.code || err?.message || err); return []; }))
      .filter((sv) => sv.ativo !== false)
      .sort((a, b) => String(a.codigo || a.nome || "").localeCompare(String(b.codigo || b.nome || "")));
    const proposta = (await findProposta(tenant, projectId)) || {};
    const qtdProposta = (proposta.items_pedido || []).reduce((acc, item) => acc + (Number(item.qtd) || 0), 0);
    const kickoff = await kickoffVigente(tenant, projectId);
    if (!kickoff) {
      return { kickoff_id: null, numero_kickoff: "", insumos: null, servicos, servicos_erro: servicosErro, kg_por_unidade: 0,
        qtd_pedido: qtdProposta || Number(project.volume_estimado_pedido) || 0 };
    }
    const atualizado = keepStoredBom(kickoff) ? kickoff : await refreshBom(tenant, kickoff);
    const bom = insumosDoKickoff(atualizado);
    const itens = kickoff.formula_id ? await related(tenant, "pd_formula_items", "formula_id", kickoff.formula_id) : [];
    const cotacao = await cotacaoVigente(tenant, projectId);
    const b3 = kickoff.bloco3 || {};
    return {
      kickoff_id: kickoff.id, numero_kickoff: kickoff.numero_kickoff || "", kickoff_status: kickoff.status || "",
      qtd_pedido: Number(kickoff.bloco2?.volume_primeiro_pedido) || qtdProposta || Number(project.volume_estimado_pedido) || 0,
      kg_por_unidade: kgDaUnidade(b3.volume_peso_liquido_valor, b3.volume_peso_liquido_unidade),
      insumos: precosDaCotacao(insumosDoBom(bom, itens), cotacao), servicos, servicos_erro: servicosErro,
      // KO-08: serviços que o Kickoff contratou (Bloco 0).
      servicos_selecionados: servicosDoKickoff(kickoff),
      // COM-03: a cotação (registro próprio) que o orçamento usa.
      cotacao: cotacao ? { id: cotacao.id, numero: cotacao.numero, revisao: cotacao.revisao, status: cotacao.status, resumo: resumoCotacao(cotacao) } : null,
    };
  }

  /* COM-03: cotação em registro próprio (erp/{t}/cotacoes), montada do Kickoff vigente. */
  const cotacaoVigente = async (tenant, projectId) => (await related(tenant, "cotacoes", "projeto_id", projectId))
    .filter((c) => c.status !== "substituida").sort((a, b) => Number(b.revisao || 0) - Number(a.revisao || 0))[0] || null;

  async function referenciaDaCotacao(tenant, projectId) {
    const c = await cotacaoVigente(tenant, projectId);
    return c ? { cotacao_id: c.id, cotacao_numero: c.numero, cotacao_revisao: c.revisao } : {};
  }

  async function listarCotacoes(tenant, projectId) {
    const todas = (await related(tenant, "cotacoes", "projeto_id", projectId)).sort((a, b) => Number(b.revisao || 0) - Number(a.revisao || 0));
    const achada = todas.find((c) => c.status !== "substituida") || null;
    const vigente = achada ? await trazerPrecosDoCompras(tenant, achada) : null;
    return { vigente: vigente ? { ...vigente, resumo: resumoCotacao(vigente) } : null, revisoes: todas };
  }

  /* COM-04: linha sem preço cotado recebe a sugestão — último PC → última cotação aprovada →
   * fórmula do P&D — com a origem. Preço lançado por alguém (cotado) nunca é trocado. */
  async function sugerirPrecos(tenant, kickoff, linhas) {
    const [pcs, cotacoes, itens] = await Promise.all([
      masterAll("pedidos_compra").catch(() => []),
      all(tenant, "cotacoes").catch(() => []),
      kickoff.formula_id ? related(tenant, "pd_formula_items", "formula_id", kickoff.formula_id) : [],
    ]);
    const pcsObj = Object.fromEntries((pcs || []).map((pc) => [pc.id, pc]));
    const aprovadas = cotacoes.filter((c) => c.status === "aprovada").sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    const porItem = new Map(itens.map((i) => [i.id, i]));
    return linhas.map((l) => {
      if (l.fornecido_por === "cliente" || (l.preco > 0 && !ehSugestao(l.fonte_preco))) return l;
      const cot = l.material_codigo && aprovadas.map((c) => ({ c, linha: (c.linhas || []).find((x) => x.material_codigo === l.material_codigo && x.preco > 0) })).find((x) => x.linha);
      const item = porItem.get(l.linha_id);
      const s = sugestaoDePreco({
        ultimoPc: ultimoPrecoDoMaterial(pcsObj, l.material_codigo),
        cotacaoAprovada: cot ? { preco: cot.linha.preco, moeda: cot.linha.moeda, numero: cot.c.numero, em: cot.c.updated_at } : null,
        formula: item ? precoDoItemDeFormula(item) : null,
      });
      return { ...l, preco: s.preco, moeda: s.moeda, fonte_preco: s.fonte, fonte_detalhe: s.preco ? s.detalhe : "" };
    });
  }

  // Gera a cotação do Kickoff; rascunho acompanha o Kickoff, cotação já em Compras abre revisão.
  async function gerarCotacao(tenant, projectId, profile) {
    requireComercial(profile, "Gerar a cotação");
    const project = await getProject(tenant, projectId);
    let kickoff = await kickoffVigente(tenant, projectId);
    if (!kickoff) throw apiError(409, "O projeto ainda não tem Kickoff: a cotação nasce dele.");
    if (!keepStoredBom(kickoff)) kickoff = await refreshBom(tenant, kickoff);
    const novas = linhasDaCotacao(kickoff);
    if (!novas.length) throw apiError(409, "O Kickoff não tem itens (ficha de manipulação e BOM de embalagens vazios).");
    const atual = await cotacaoVigente(tenant, projectId);
    const at = now();
    const base = { projeto_id: projectId, numero_projeto: project.numero_projeto || "", kickoff_id: kickoff.id, kickoff_versao: kickoff.versao || "v1",
      numero_kickoff: kickoff.numero_kickoff || "", qtd_pedido: Number(kickoff.bloco2?.volume_primeiro_pedido) || Number(kickoff.questionario_composicao?.fechamento?.volume_primeiro_lote) || null,
      servicos_selecionados: servicosDoKickoff(kickoff), atualizado_em: at, atualizado_por_nome: userName(profile) };
    if (!atual) {
      return create(tenant, "cotacoes", { ...base, numero: numeroCotacao(project.numero_projeto, 1), revisao: 1, status: "rascunho",
        linhas: await sugerirPrecos(tenant, kickoff, novas), historico_status: [{ status: "rascunho", em: at, por_nome: userName(profile) }], created_by: currentUid(), created_by_name: userName(profile) });
    }
    const linhas = await sugerirPrecos(tenant, kickoff, mesclarLinhas(novas, atual.linhas));
    const diff = diffLinhas(atual.linhas, linhas);
    if (!TRAVADAS.has(atual.status)) return patch(tenant, "cotacoes", atual.id, { ...base, linhas });
    if (!diff.length && atual.kickoff_id === kickoff.id) return atual;
    const revisao = Number(atual.revisao || 1) + 1;
    await patch(tenant, "cotacoes", atual.id, { status: "substituida", substituida_em: at });
    return create(tenant, "cotacoes", { ...base, numero: numeroCotacao(project.numero_projeto, revisao), revisao, status: "rascunho", linhas,
      revisao_anterior_id: atual.id, motivo_revisao: `Kickoff ${kickoff.versao || "vigente"} mudou depois da cotação ${atual.numero}`, diff,
      historico_status: [{ status: "rascunho", em: at, por_nome: userName(profile) }], created_by: currentUid(), created_by_name: userName(profile) });
  }

  const PROXIMO_STATUS = { rascunho: ["em_cotacao_compras"], em_cotacao_compras: ["precificada", "rascunho"], precificada: ["aprovada", "em_cotacao_compras"], aprovada: [] };

  async function mudarStatusCotacao(tenant, projectId, data, profile) {
    requireComercial(profile, "Mudar o status da cotação");
    const atual = await cotacaoVigente(tenant, projectId);
    if (!atual) throw apiError(404, "Projeto sem cotação.");
    const novo = data?.status;
    if (!(PROXIMO_STATUS[atual.status] || []).includes(novo)) throw apiError(409, `Cotação ${STATUS_COTACAO[atual.status] || atual.status} não vai para ${STATUS_COTACAO[novo] || novo}.`);
    const r = resumoCotacao(atual);
    if (["precificada", "aprovada"].includes(novo) && r.sem_preco) throw apiError(422, `${r.sem_preco} item(ns) comprado(s) pela Kuryos ainda SEM PREÇO.`);
    // COM-05: ir para o Compras abre a Solicitação de Compra (uma por revisão); o Compras cota pelos
    // processos de cotação que já existem (texto ao fornecedor, rascunho de e-mail).
    const extra = novo === "em_cotacao_compras" && !atual.solicitacao_compra_id ? await abrirSolicitacaoCompra(tenant, atual, profile) : {};
    return patch(tenant, "cotacoes", atual.id, { status: novo, ...extra,
      historico_status: [...(atual.historico_status || []), { status: novo, em: now(), por: currentUid(), por_nome: userName(profile) }] });
  }

  async function abrirSolicitacaoCompra(tenant, cotacao, profile) {
    const { itens, fora } = itensParaCompras(cotacao);
    if (!itens.length) return { solicitacao_compra_id: null, compras_fora: fora };
    const materiais = await masterAll("materiais");
    const chaveDo = new Map(materiais.map((mat) => [materialCode(mat), mat.id]));
    const numero = await nextCounter("config/contadores/solicitacaoCompra");
    const scKey = newId();
    const project = await getProject(tenant, cotacao.projeto_id);
    const sc = {
      numero, numeroFormatado: `SC-${pad(numero)}`, status: "PENDENTE", criadoEm: now(), criadoPor: userName(profile), solicitante: userName(profile),
      justificativa: `Cotação ${cotacao.numero} do projeto ${project.numero_projeto || ""} ${project.nome_projeto || ""}`.replace(/\s+/g, " ").trim(),
      origemTela: "crm", origemModulo: "CRM",
      itens: Object.fromEntries(itens.map((it) => [newId(), { materialKey: chaveDo.get(it.materialCodigo) || it.materialCodigo, materialCodigo: it.materialCodigo,
        materialNome: it.materialNome, qtd: it.qtd, unidade: it.unidade, obs: it.obs, origemCotacaoLinhaId: it.linha_id }])),
      origem: { tipo: "CRM_COTACAO", cotacaoId: cotacao.id, cotacaoNumero: cotacao.numero, projetoId: project.id, projeto: project.nome_projeto || "", cliente: project.cliente_nome || "" },
    };
    await masterWrite("solicitacoes_compra", scKey, sc);
    return { solicitacao_compra_id: scKey, solicitacao_compra_numero: sc.numeroFormatado, compras_fora: fora };
  }

  // COM-05: preço que o Compras levantou volta para a linha (COTADO, com processo e fornecedor).
  async function trazerPrecosDoCompras(tenant, cotacao) {
    if (cotacao?.status !== "em_cotacao_compras" || !cotacao.solicitacao_compra_id) return cotacao;
    const [processos, fornecedores] = await Promise.all([masterAll("processos_cotacao").catch(() => []), masterAll("fornecedores").catch(() => [])]);
    const nome = new Map(fornecedores.map((f) => [f.id, f.nomeFantasia || f.razaoSocial || f.id]));
    const precos = precosDosProcessos(Object.fromEntries(processos.map((p) => [p.id, p])), [cotacao.solicitacao_compra_id], (k) => nome.get(k));
    if (!precos.size) return cotacao;
    let mudou = false;
    const linhas = (cotacao.linhas || []).map((l) => {
      const p = precos.get(l.material_codigo);
      if (!p || l.fornecido_por === "cliente" || (l.preco === p.preco && l.fonte_preco === "cotado_compras")) return l;
      mudou = true;
      return { ...l, preco: p.preco, moeda: "BRL", fonte_preco: "cotado_compras", fonte_detalhe: p.detalhe, preco_atualizado_em: now(), preco_atualizado_por: "Compras" };
    });
    return mudou ? patch(tenant, "cotacoes", cotacao.id, { linhas }) : cotacao;
  }

  async function precificarLinha(tenant, projectId, linhaId, data, profile) {
    if (!isComercial(profile) && !isAdmin(profile) && profile?.modulos?.compras !== true) throw apiError(403, "Preço da cotação é lançado pelo Comercial ou por Compras.");
    const atual = await cotacaoVigente(tenant, projectId);
    if (!atual) throw apiError(404, "Projeto sem cotação.");
    if (!["rascunho", "em_cotacao_compras"].includes(atual.status)) throw apiError(409, `Cotação ${STATUS_COTACAO[atual.status]}: o preço não muda mais (abra uma revisão).`);
    const preco = data?.preco === null || data?.preco === "" ? null : Number(data?.preco);
    if (preco !== null && !(Number.isFinite(preco) && preco > 0)) throw apiError(422, "Preço deve ser maior que zero (sem preço = vazio, nunca zero).");
    const moeda = data?.moeda === "USD" ? "USD" : "BRL";
    let achou = false;
    const linhas = (atual.linhas || []).map((l) => {
      if (l.linha_id !== linhaId) return l;
      achou = true;
      return { ...l, preco, moeda, fonte_preco: preco === null ? null : (data?.fonte_preco || "cotado_compras"), fonte_detalhe: String(data?.fonte_detalhe || "").trim(),
        preco_atualizado_em: now(), preco_atualizado_por: userName(profile) };
    });
    if (!achou) throw apiError(404, "Linha não encontrada na cotação.");
    return patch(tenant, "cotacoes", atual.id, { linhas });
  }

  async function upsertProposta(tenant, projectId, data, profile) {
    requireComercial(profile, "Salvar proposta");
    const project = await getProject(tenant, projectId);
    const existing = await findProposta(tenant, projectId);
    const payload = {
      tipo_produto: "", variacao_produto: "", preco_unitario: null, insumos_inclusos: [], observacoes_proposta: "",
      items_pedido: [], desenvolvimentos_embalagem: [], condicoes_pagamento: "", insumos_fabricacao: [],
      rodape_observacoes: "", status: "rascunho", negociacao_status: "rascunho", negociacao_motivo: "",
      negociacao_evidencia_file_id: "", negociacao_observacoes: "",
      ...pickProposta(data, { dropNull: false }),
      updated_by: currentUid(), updated_by_name: userName(profile),
    };
    if (!payload.composicao) delete payload.composicao;
    if (!payload.composicao && payload.status === "enviado" && existing?.composicao) payload.composicao = existing.composicao;
    if (existing?.desatualizado && payload.status === "enviado") {
      throw apiError(409, `Orçamento — ${textoDesatualizado(existing.desatualizado)}. Revise ou registre "revisado, sem impacto" antes de enviar.`);
    }
    await conferirComposicao(payload, existing);
    // COM-03: o orçamento aponta para a revisão da cotação que usou.
    Object.assign(payload, await referenciaDaCotacao(tenant, projectId));
    // COM-01: enviar ao cliente registra a taxa do momento no histórico (não congela nada).
    const registrarEnvio = payload.status === "enviado" && existing?.status !== "enviado";
    if (existing) {
      const salva = await patch(tenant, "crm_propostas", existing.id, payload);
      if (registrarEnvio) await registrarCambio(tenant, project, "envio", profile);
      return salva;
    }
    const criada = await create(tenant, "crm_propostas", {
      projeto_id: projectId, projeto_nome: project.nome_projeto || "", cliente_id: project.cliente_id || null,
      cliente_nome: project.cliente_nome || "", arquivos: [], ...payload,
      created_by: currentUid(), created_by_name: userName(profile),
    });
    if (registrarEnvio) await registrarCambio(tenant, project, "envio", profile);
    return criada;
  }

  async function amostrasStatus(tenant, projectId) {
    await getProject(tenant, projectId);
    const samples = (await all(tenant, "crm_samples")).filter((sample) => sample.projeto_id === projectId);
    const variacoes = [];
    let totalAprovadas = 0;
    for (const sample of samples) {
      for (const variation of sample.variacoes || []) {
        const { aprovacaoPd, aprovacaoComercial, aprovada, resultado } = variationApprovals(variation);
        let status = "em_andamento";
        if (aprovada) { status = "aprovada"; totalAprovadas += 1; }
        else if (["reprovada", "cancelada"].includes(variation.status) || resultado === "reprovada" || STATUS_PD_REPROVADO.has(variation.status_pd_raw || "")) status = "reprovada";
        else if (variation.status === "plano_futuro") status = "plano_futuro";
        variacoes.push({
          amostra_id: sample.id, numero_amostra: sample.numero_amostra || "",
          nome_produto: sample.nome_produto || variation.nome_produto || "", variacao_id: variation.id,
          codigo: variation.codigo || "", descricao: variation.descricao_aplicacao || "", status, aprovada,
          aprovacao_pd: aprovacaoPd, aprovacao_comercial: aprovacaoComercial,
          sku_id: variation.sku_id || null, sku_codigo: variation.sku_codigo || variation.sku_id || "",
        });
      }
    }
    return { total: variacoes.length, total_aprovadas: totalAprovadas, pode_confirmar: totalAprovadas > 0, variacoes };
  }

  /* Estágio do projeto e espelho no cliente */

  // _advance_project_stage_if_needed: segue transição permitida ou avança para
  // frente; nunca volta nem sai de arquivado.
  async function advanceProjectStage(tenant, projectId, target, profile, source, extra = {}) {
    const project = await one(tenant, "crm_projects", projectId);
    if (!project || !target || project.stage === target) return project;
    const allowed = PROJECT_TRANSITIONS[project.stage] || [];
    if (!allowed.includes(target)) {
      const oldRank = PROJECT_STAGES.indexOf(project.stage);
      const newRank = PROJECT_STAGES.indexOf(target);
      const forward = oldRank >= 0 && newRank > oldRank && target !== "projeto_arquivado" && project.stage !== "projeto_arquivado";
      if (!forward) return project;
    }
    const at = now();
    const entry = { ...movementEntry({ from: project.stage, to: target, profile, uid: currentUid(), at, plan: {} }), origem: source };
    return patch(tenant, "crm_projects", projectId, {
      ...extra, stage: target, updated_at: at,
      historico_movimentacoes: [...(project.historico_movimentacoes || []), entry],
    });
  }

  // Espelho CRM2 → CRM1 (cotação → negociação; pedido → fechado; arquivado → perdido).
  async function mirrorClientStage(tenant, project, profile, target, source, extra = {}) {
    const client = project?.cliente_id ? await one(tenant, "crm_clients", project.cliente_id) : null;
    if (!client || client.stage === target) return client;
    if (target === "negociacao" && ["cliente_fechado", "cliente_perdido"].includes(client.stage)) return client;
    if (target === "cliente_perdido") {
      const others = (await all(tenant, "crm_projects")).filter((p) => p.cliente_id === client.id && p.id !== project.id && p.stage !== "projeto_arquivado");
      if (others.length || client.stage === "cliente_fechado") return client;
    }
    const at = now();
    const entry = { ...movementEntry({ from: client.stage, to: target, profile, uid: currentUid(), at, plan: {} }), origem: source };
    return patch(tenant, "crm_clients", client.id, {
      ...extra, stage: target, updated_at: at,
      historico_movimentacoes: [...(client.historico_movimentacoes || []), entry],
    });
  }

  /* Fórmula registrada no Banco P&D (exigência do Kickoff) */

  async function resolveRegisteredFormula(tenant, projectId, explicitFormulaId) {
    const [requests, developments, approvals, formulas] = await Promise.all([
      all(tenant, "pd_requests"), all(tenant, "pd_developments"), all(tenant, "pd_approvals"), all(tenant, "pd_formulas"),
    ]);
    const projectRequests = requests.filter((req) => req.crm_project_id === projectId || req.linked_projeto_id === projectId);
    const requestIds = new Set(projectRequests.map((req) => req.id));
    const devs = developments.filter((dev) => requestIds.has(dev.request_id || dev.pd_request_id));
    const devById = new Map(devs.map((dev) => [dev.id, dev]));
    const approvalByDev = new Map(approvals.map((item) => [item.development_id, item]));
    const registered = (formula) => {
      const approval = approvalByDev.get(formula.development_id) || {};
      return formulaRegistrada(approval);
    };
    const contextFor = (formula) => {
      const development = devById.get(formula.development_id) || {};
      return {
        formula, development, approval: approvalByDev.get(formula.development_id) || {},
        pd_request: projectRequests.find((req) => req.id === (development.request_id || development.pd_request_id)) || null,
      };
    };
    if (explicitFormulaId) {
      const formula = formulas.find((item) => item.id === explicitFormulaId);
      if (!formula) throw apiError(404, "Formula nao encontrada");
      if (!devById.has(formula.development_id)) throw apiError(400, "Formula informada nao pertence ao projeto");
      if (!registered(formula)) throw apiError(400, "A formula informada ainda nao esta registrada no Banco P&D.");
      return contextFor(formula);
    }
    const candidates = formulas.filter((formula) => devById.has(formula.development_id) && registered(formula))
      .sort((a, b) => Number(b.version || 0) - Number(a.version || 0) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return candidates.length ? contextFor(candidates[0]) : null;
  }

  const NO_FORMULA = "Nenhuma formula registrada encontrada para este projeto. Registre a formula no Banco P&D antes de avancar.";

  // Antes de fechar o pedido: sem fórmula registrada o Kickoff não abre. Checar
  // antes de mover evita projeto em "pedido fechado" sem Kickoff.
  async function assertKickoffPossible(tenant, projectId, profile) {
    const existing = (await related(tenant, "kickoffs", "projeto_id", projectId))
      .some((k) => !["substituida", "arquivado"].includes(k.status) && (k.formula_id || (k.requisitos_dispensados || []).some((r) => /f[óo]rmula/i.test(String(r)))));
    if (existing) return [];
    const formula = await resolveRegisteredFormula(tenant, projectId);
    if (formula) return [];
    if (!isAdmin(profile)) throw apiError(409, NO_FORMULA);
    // D-2: o Kickoff já existe desde a criação do projeto; a dispensa do ADM fica registrada nele também.
    const dispensa = "Fórmula registrada no Banco P&D";
    for (const k of (await related(tenant, "kickoffs", "projeto_id", projectId)).filter((x) => !["substituida", "arquivado"].includes(x.status) && !x.formula_id)) {
      if ((k.requisitos_dispensados || []).includes(dispensa)) continue;
      await patch(tenant, "kickoffs", k.id, {
        requisitos_dispensados: [...(k.requisitos_dispensados || []), dispensa],
        log_auditoria: [...(k.log_auditoria || []), { campo: "requisitos_dispensados", valor_anterior: "", valor_novo: dispensa,
          usuario_id: currentUid(), usuario_nome: userName(profile), datetime: now(), observacoes: "Dispensa do ADM ao mover o projeto sem fórmula registrada" }],
      });
    }
    return [dispensa];
  }

  /* Tarefas (workflow_tasks) */

  async function createOrReuseTask(tenant, kickoff, { code, title, category, roles, description = "", blocking = false }) {
    const open = (await related(tenant, "workflow_tasks", "entity_id", kickoff.id)).find((task) => task.entity_type === "kickoff"
      && ["pendente", "em_andamento", "em_atraso"].includes(task.status) && task.metadata?.kickoff_task_code === code);
    if (open) return open;
    const due = new Date(Date.now() + 2 * 864e5).toISOString();
    return create(tenant, "workflow_tasks", {
      entity_type: "kickoff", entity_id: kickoff.id, title, description, category, blocking, status: "pendente",
      decision: null, due_date: due, responsible_id: null, responsible_roles: roles,
      created_by: currentUid(), metadata: { module_origin: "kickoff", kickoff_task_code: code, kickoff_id: kickoff.id, kickoff_numero: kickoff.numero_kickoff },
    });
  }

  const enqueueApprovalTask = (tenant, kickoff, etapa) => createOrReuseTask(tenant, kickoff, {
    code: `aprovar_kickoff_${etapa}`, title: `Aprovar Kickoff ${kickoff.numero_kickoff} - ${APPROVAL_LABELS[etapa]}`,
    category: { lider_pd: "pd_dev", cq: "qa", eng_produto: "engenharia_produto", direcao: "manual" }[etapa],
    roles: { lider_pd: ["lider_pd", "admin"], cq: ["qa", "qualidade", "admin"], eng_produto: ["engenharia_produto", "admin"], direcao: ["admin"] }[etapa],
    description: `Registrar aprovacao ou reprovacao da etapa ${APPROVAL_LABELS[etapa]}.`, blocking: true,
  });

  const enqueueRevisionTask = (tenant, kickoff, etapa) => {
    const [code, category, roles, title] = {
      lider_pd: ["preencher_kickoff_bloco3", "pd_dev", ["formulador", "lider_pd", "admin"], "Revisar Bloco 3 do Kickoff"],
      cq: ["preencher_kickoff_bloco3", "pd_dev", ["formulador", "lider_pd", "admin"], "Ajustar criterios tecnicos do Kickoff"],
      eng_produto: ["preencher_kickoff_bloco4", "engenharia_produto", ["engenharia_produto", "admin"], "Revisar Bloco 4 do Kickoff"],
      direcao: ["preencher_kickoff_bloco2", "comercial", ["sales_ops", "vendedor", "admin"], "Revisar condicoes comerciais do Kickoff"],
    }[etapa];
    return createOrReuseTask(tenant, kickoff, { code, category, roles, title: `${title} ${kickoff.numero_kickoff}`,
      description: "Kickoff reprovado em fluxo de aprovacao. Ajustar bloco responsavel." });
  };

  /* BOM (kickoff_routes._build_bom_lines / _refresh_bom) */

  const bomKey = (line) => [line.tipo, line.codigo_interno, line.descricao].map((v) => String(v || "").trim().toLowerCase()).join("|").replace(/\s+/g, " ");

  async function buildBomLines(tenant, kickoff) {
    const bloco2 = kickoff.bloco2 || {};
    const bloco3 = kickoff.bloco3 || {};
    const bloco4 = kickoff.bloco4 || {};
    const pedidoVolume = Number(bloco2.volume_primeiro_pedido) || 0;
    const items = kickoff.formula_id ? (await all(tenant, "pd_formula_items")).filter((item) => item.formula_id === kickoff.formula_id) : [];
    const findMaterial = materialFinder(await masterAll("materiais"));
    const unit = String(bloco3.volume_peso_liquido_unidade || "mL").toLowerCase() === "ml" ? "L" : "kg";
    const volume = Number(bloco3.volume_peso_liquido_valor) || 0;
    const mps = items.map((item) => {
      const material = findMaterial(item.material_key, item.material_codigo, item.ingredient_name);
      const perUnit = Number((((Number(item.percentage) || 0) / 100) * (volume / 1000)).toFixed(6));
      return {
        id: item.id || newId(), codigo_interno: materialCode(material) || item.catalog_id || item.ingredient_name || "",
        descricao: item.ingredient_name || "", tipo: "mp_formula",
        fornecedor_principal: { id: material?.fornecedorKey || null, nome: material?.fornecedor || "" }, fornecedor_alternativo: null,
        unidade: unit, quantidade_por_unidade: perUnit, custo_unitario_estimado_rs: Number((Number(item.cost_brl) || 0).toFixed(4)),
        status_homologacao: material ? "homologado" : "pendente", quantidade_total_pedido: Number((perUnit * pedidoVolume).toFixed(4)),
      };
    });
    // BOM-01 (23/10/2026): com questionário, uma linha por componente aplicável dos Blocos 2–4, com
    // quantidade e nível; o item do Cadastros (KO-05) já vem homologado, o resto tenta pelo nome.
    if (!EMPTY(kickoff.questionario_composicao)) {
      const embalagens = linhasDeEmbalagem(kickoff.questionario_composicao, { numeroKickoff: kickoff.numero_kickoff, volumePedido: pedidoVolume })
        .map((linha) => {
          if (linha.material_codigo) return linha;
          const material = findMaterial(linha.especificacao, linha.descricao);
          return material ? { ...linha, codigo_interno: materialCode(material) || linha.codigo_interno, status_homologacao: "homologado" } : linha;
        });
      return { mps, embalagens };
    }
    const lines = [];
    // Cada embalagem só entra no BOM quando o tipo foi definido (no master entravam
    // mesmo vazias e viravam pendência de cadastro que travava a Direção).
    const packaging = [
      ["embalagem_primaria", bloco4.embalagem_primaria_codigo_interno, `Embalagem primaria ${bloco4.embalagem_primaria_tipo || ""} ${bloco4.embalagem_primaria_material || ""}`, bloco4.embalagem_primaria_fornecedor_id, 1, bloco4.embalagem_primaria_tipo],
      ["tampa", bloco4.fechamento_codigo_interno, `Fechamento ${bloco4.fechamento_tipo || ""}`, bloco4.fechamento_fornecedor_id, Number(bloco4.fechamento_quantidade_por_unidade) || 1, bloco4.fechamento_tipo],
      ["emb_secundaria", bloco4.embalagem_secundaria_codigo_interno, `Embalagem secundaria ${bloco4.embalagem_secundaria_tipo || ""}`, bloco4.embalagem_secundaria_fornecedor_id, bloco4.embalagem_secundaria_tipo !== "sem_caixa" ? 1 : 0, bloco4.embalagem_secundaria_tipo],
      ["emb_terciaria", bloco4.caixa_master_codigo_interno, `Caixa master ${bloco4.caixa_master_tipo || ""}`, null, 1 / Math.max(Number.parseInt(bloco4.caixa_master_unidades, 10) || 1, 1), bloco4.caixa_master_tipo],
      ["rotulo", bloco4.rotulo_codigo_interno, `Rotulo ${bloco4.tipo_rotulagem || ""}`, bloco4.rotulo_fornecedor_id, 1, bloco4.tipo_rotulagem],
    ];
    for (const [tipo, codigo, descricao, fornecedor, qty, definido] of packaging) {
      if (EMPTY(definido) && EMPTY(codigo)) continue;
      if (!qty && tipo !== "emb_terciaria") continue;
      // A especificação do questionário (ex.: "Frasco PET 200 mL") costuma ser o nome do material no cadastro.
      const especificacao = { embalagem_primaria: bloco4.embalagem_primaria_material, tampa: bloco4.fechamento_material }[tipo] || "";
      const material = findMaterial(codigo, especificacao);
      lines.push({
        id: `${kickoff.id}-${tipo}`, codigo_interno: codigo || materialCode(material) || `${kickoff.numero_kickoff}-${tipo}`, descricao: descricao.trim(), tipo,
        especificacao,
        fornecedor_principal: { id: null, nome: fornecedor || "" }, fornecedor_alternativo: null, unidade: "un",
        quantidade_por_unidade: Number(Number(qty).toFixed(6)), custo_unitario_estimado_rs: 0,
        status_homologacao: material ? "homologado" : "pendente", quantidade_total_pedido: Number(((qty || 0) * pedidoVolume).toFixed(4)),
      });
    }
    return { mps, embalagens: lines };
  }

  async function refreshBom(tenant, kickoff) {
    // V4 (RFC-001): Kickoff aprovado não muda — o BOM gravado na aprovação é o que o CGI e o PCP usaram.
    if (kickoff.status === "aprovado" && (kickoff.bom || []).length) return kickoff;
    const semQuestionario = EMPTY(kickoff.questionario_composicao);
    if (semQuestionario && EMPTY(Object.fromEntries(Object.entries(kickoff.bloco4 || {}).filter(([, v]) => !EMPTY(v))))) return { ...kickoff, bom: [] };
    const previous = new Map(insumosDoKickoff(kickoff).map((line) => [bomKey(line), line]));
    const manter = (line) => {
      const key = bomKey(line);
      const prior = previous.get(key) || {};
      const kept = Object.fromEntries(["cadastro_status", "cadastro_solicitacao_id", "material_id", "compras_item_id", "cadastro_concluido_em"]
        .filter((field) => !EMPTY(prior[field])).map((field) => [field, prior[field]]));
      return { ...line, cadastro_chave: key, ...kept };
    };
    const { mps, embalagens } = await buildBomLines(tenant, kickoff);
    // Kickoff antigo (sem questionário) segue com tudo no BOM, como sempre foi.
    const bom = (semQuestionario ? [...mps, ...embalagens] : embalagens).map(manter);
    const ficha = semQuestionario ? (kickoff.ficha_manipulacao || null)
      : { formula_id: kickoff.formula_id || null, itens: mps.map(manter), atualizado_em: kickoff.ficha_manipulacao?.atualizado_em || null };
    const mudou = JSON.stringify(bom) !== JSON.stringify(kickoff.bom || [])
      || JSON.stringify(ficha?.itens || []) !== JSON.stringify(kickoff.ficha_manipulacao?.itens || []);
    if (mudou) {
      const at = now();
      await patch(tenant, "kickoffs", kickoff.id, { bom, ...(ficha ? { ficha_manipulacao: { ...ficha, atualizado_em: at } } : {}) });
      return { ...kickoff, bom, ...(ficha ? { ficha_manipulacao: { ...ficha, atualizado_em: at } } : {}) };
    }
    return { ...kickoff, bom, ...(ficha ? { ficha_manipulacao: ficha } : {}) };
  }

  // Fila de cadastro dos itens novos do BOM (_sync_bom_registration_requests).
  async function syncBomRegistration(tenant, kickoff, profile) {
    const findMaterial = materialFinder(await masterAll("materiais"));
    const requests = await related(tenant, "cadastro_bom_solicitacoes", "kickoff_id", kickoff.id);
    const ficha = clone(kickoff.ficha_manipulacao?.itens || []);
    const embalagens = clone(kickoff.bom || []);
    const bom = [...ficha, ...embalagens];
    let created = 0;
    let reused = 0;
    let registered = 0;
    for (const line of bom) {
      const key = line.cadastro_chave || bomKey(line);
      line.cadastro_chave = key;
      const material = findMaterial(line.codigo_interno, line.especificacao, line.descricao);
      if (material) {
        Object.assign(line, { cadastro_status: "cadastrado", material_id: material.id });
        registered += 1;
        continue;
      }
      let request = requests.find((item) => item.bom_chave === key);
      if (request) reused += 1;
      else {
        request = await create(tenant, "cadastro_bom_solicitacoes", {
          kickoff_id: kickoff.id, bom_chave: key, numero_kickoff: kickoff.numero_kickoff || "", projeto_id: kickoff.projeto_id,
          cliente_id: kickoff.cliente_id || null, cliente_nome: kickoff.bloco1?.cliente || "", descricao: line.descricao || "",
          codigo_sugerido: line.codigo_interno || "", tipo_bom: line.tipo || "", unidade: line.unidade || "un",
          quantidade_por_unidade: line.quantidade_por_unidade || 0, quantidade_total_pedido: line.quantidade_total_pedido || 0,
          status: "pendente_cadastro", material_id: null, created_by: currentUid(), created_by_name: userName(profile),
        });
        requests.push(request);
        created += 1;
        await createOrReuseTask(tenant, kickoff, {
          code: `cadastrar_item_bom:${request.id}`, title: `Cadastrar item novo do BOM: ${line.descricao || ""}`, category: "cadastros",
          roles: ["engenharia_produto", "compras", "admin"], blocking: true,
          description: "Item novo identificado no BOM. Conclua o cadastro do material no PCP (Cadastros > Materiais).",
        });
      }
      Object.assign(line, { cadastro_status: request.status || "pendente_cadastro", cadastro_solicitacao_id: request.id });
    }
    const pending = bom.filter((line) => line.cadastro_status !== "cadastrado").length;
    const summary = {
      status: pending === 0 ? "liberado_compras" : "aguardando_cadastros", total_bom: bom.length, cadastrados: registered,
      pendentes: pending, solicitacoes_criadas: created, solicitacoes_reutilizadas: reused, updated_at: now(),
    };
    const fichaManipulacao = kickoff.ficha_manipulacao ? { ...kickoff.ficha_manipulacao, itens: ficha } : null;
    await patch(tenant, "kickoffs", kickoff.id, { bom: embalagens, ...(fichaManipulacao ? { ficha_manipulacao: fichaManipulacao } : {}), cadastro_bom: summary });
    return { kickoff: { ...kickoff, bom: embalagens, ...(fichaManipulacao ? { ficha_manipulacao: fichaManipulacao } : {}), cadastro_bom: summary }, summary };
  }

  // Kickoff importado do Mongo sem questionário: o BOM gravado lá vale como está.
  const keepStoredBom = (kickoff) => Boolean(kickoff.origem_migracao) && EMPTY(kickoff.questionario_composicao);

  async function decorateKickoff(tenant, kickoff) {
    const base = keepStoredBom(kickoff) ? { ...kickoff, bom: kickoff.bom || [] } : await refreshBom(tenant, kickoff);
    // KO-01: o código é fixo; o nome exibido acompanha o projeto (renomear o projeto muda o título).
    const projeto = base.projeto_id ? await one(tenant, "crm_projects", base.projeto_id).catch(() => null) : null;
    const nomeProjeto = projeto?.nome_projeto || base.bloco1?.projeto_vinculado || "";
    const decorated = { ...base, titulo: nomeProjeto ? `${base.numero_kickoff} — ${nomeProjeto}` : base.numero_kickoff };
    const { legacy, ok, status } = kickoffReadiness(decorated);
    if (legacy) {
      const blocks = ["bloco2", "bloco3", "bloco4"].map((b) => status[b].completo);
      return {
        ...decorated,
        progress: { bloco1: true, bloco2: blocks[0], bloco3: blocks[1], bloco4: blocks[2], percentual: Math.round(((1 + blocks.filter(Boolean).length) / 4) * 100) },
        locks: {
          bloco2: null,
          bloco3: blocks[0] ? null : "Bloco 3 bloqueado: complete todos os campos comerciais do Bloco 2 primeiro.",
          bloco4: blocks[1] ? null : "Bloco 4 bloqueado: complete os criterios tecnicos e especificacoes do Bloco 3 primeiro.",
          aprovacao: ok ? null : "Aprovacao liberada somente apos concluir Blocos 2, 3 e 4.",
        },
        blocos_status: status,
        aprovacao_pendente: currentApprovalStep(decorated),
      };
    }
    const complete = Object.values(status).filter((item) => item.completo).length;
    return {
      ...decorated,
      progress: { questionario_composicao: ok, percentual: Math.round((complete / Object.keys(status).length) * 100) },
      locks: { questionario_composicao: null, aprovacao: ok ? null : "Aprovacao liberada somente apos concluir o questionario de composicao." },
      blocos_status: status,
      blocos_estado: blocosDoKickoff(decorated).estados,
      aprovacoes: normalizarAprovacoes(decorated),
      aprovacao_pendente: currentApprovalStep(decorated),
    };
  }

  // D-2: Kickoff que nasceu sem fórmula ganha a fórmula registrada quando ela existir (com registro).
  async function vincularFormula(tenant, kickoff, project, profile, explicitFormulaId) {
    if (kickoff.formula_id || kickoff.status === "aprovado") return kickoff;
    const ctx = await resolveRegisteredFormula(tenant, project.id, explicitFormulaId).catch(() => null);
    if (!ctx?.formula?.id) return kickoff;
    const f = ctx.formula;
    const at = now();
    return patch(tenant, "kickoffs", kickoff.id, {
      formula_id: f.id,
      bloco1: { ...(kickoff.bloco1 || {}), formula_vinculada: f.name || f.nome || "", formulador_responsavel: f.created_by_name || "" },
      log_auditoria: [...(kickoff.log_auditoria || []), { campo: "formula_id", valor_anterior: "", valor_novo: f.id,
        usuario_id: currentUid(), usuario_nome: userName(profile), datetime: at, observacoes: "Fórmula registrada no P&D vinculada ao Kickoff" }],
    });
  }

  /* Kickoff vivo (RFC-001 §7.1): o que o projeto/cliente/amostra/fórmula ganharam depois preenche os
   * campos ainda vazios, em bloco não validado. Nunca sobrescreve o que foi digitado. */
  async function completarDaOrigem(tenant, kickoff, project, profile) {
    if (!kickoff.questionario_composicao || kickoff.status === "aprovado") return kickoff;
    const client = (await one(tenant, "crm_clients", project.cliente_id)) || {};
    const formulaCtx = kickoff.formula_id ? await resolveRegisteredFormula(tenant, project.id, kickoff.formula_id).catch(() => null) : null;
    const novo = await buildQuestionario(tenant, project, client, formulaCtx, kickoff.bloco1 || {});
    const travados = Object.entries(kickoff.blocos_estado || {}).filter(([, e]) => ["validado", "congelado"].includes(e?.estado)).map(([b]) => b);
    const { questionario, campos } = preencherVazios(kickoff.questionario_composicao, novo, travados);
    if (!campos.length) return kickoff;
    const at = now();
    return patch(tenant, "kickoffs", kickoff.id, {
      questionario_composicao: questionario, ...legacyBlocksFromQuestionario(questionario, kickoff),
      log_auditoria: [...(kickoff.log_auditoria || []), ...campos.map((c) => ({ campo: `questionario_composicao.${c}`, valor_anterior: "",
        valor_novo: "preenchido da origem", usuario_id: currentUid(), usuario_nome: userName(profile), datetime: at }))],
    });
  }

  // D-2: todo projeto novo já nasce com o Kickoff em rascunho (falha aqui não impede criar o projeto).
  async function afterProjectCreate(tenant, project, profile) {
    try {
      const k = await createKickoffForProject(tenant, project.id, profile);
      return { kickoff_id: k.id, numero_kickoff: k.numero_kickoff };
    } catch (error) {
      console.error("[Kickoff] não abriu junto com o projeto:", project?.id, error);
      return null;
    }
  }

  async function syncProjectKickoffSummary(tenant, kickoff) {
    if (!kickoff.projeto_id || !(await one(tenant, "crm_projects", kickoff.projeto_id))) return;
    await patch(tenant, "crm_projects", kickoff.projeto_id, {
      kickoff_id: kickoff.id, kickoff_numero: kickoff.numero_kickoff, kickoff_status: kickoff.status,
      kickoff_versao: kickoff.versao, kickoff_group_id: kickoff.kickoff_group_id,
    });
  }

  async function getKickoff(tenant, kickoffId) {
    const kickoff = await one(tenant, "kickoffs", kickoffId);
    if (!kickoff) throw apiError(404, "Kickoff nao encontrado");
    return kickoff;
  }

  function assertEditable(kickoff) {
    if (kickoff.status === "substituida") throw apiError(409, "Versao substituida. Edite a versao vigente do Kickoff.");
    if (kickoff.status === "arquivado") throw apiError(409, "Kickoff arquivado nao pode ser alterado.");
  }

  const diffEntries = (prefix, before, after, profile) => [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort()
    .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
    .map((key) => ({ campo: `${prefix}.${key}`, valor_anterior: before?.[key] ?? null, valor_novo: after?.[key] ?? null,
      usuario_id: currentUid(), usuario_nome: userName(profile), datetime: now() }));

  // Kickoff aprovado não muda: nova versão em revisão, a anterior fica substituída.
  async function ensureMutableVersion(tenant, kickoff, profile, reason) {
    if (kickoff.status !== "aprovado") return kickoff;
    const versions = await related(tenant, "kickoffs", "kickoff_group_id", kickoff.kickoff_group_id);
    const latest = versions.sort((a, b) => Number(b.versao_numero || 0) - Number(a.versao_numero || 0))[0] || kickoff;
    const number = Number(latest.versao_numero || 1) + 1;
    const revision = await create(tenant, "kickoffs", {
      ...clone(latest), id: undefined, created_at: undefined, versao_numero: number, versao: `v${number}`, status: "em_revisao", aprovacoes: approvalTemplate(), blocos_estado: null,
      created_by: currentUid(), created_by_name: userName(profile), approved_at: null, approved_by: null, approved_by_name: "",
      parent_kickoff_id: latest.id,
      // AMO-05/RFC-001 §4: nova versão é a resposta à marca de desatualizado; a marca vai para o histórico.
      desatualizado: null,
      desatualizado_historico: [...(latest.desatualizado_historico || []),
        ...(latest.desatualizado ? [{ ...latest.desatualizado, resolvido_em: now(), resolvido_por: currentUid(), resolvido_por_nome: userName(profile), decisao: "nova_versao", motivo_decisao: reason }] : [])],
      log_auditoria: [...(latest.log_auditoria || []), { campo: "versao", valor_anterior: latest.versao, valor_novo: `v${number}`,
        usuario_id: currentUid(), usuario_nome: userName(profile), datetime: now(), motivo: reason }],
    });
    await patch(tenant, "kickoffs", latest.id, { status: "substituida" });
    await syncProjectKickoffSummary(tenant, revision);
    await auditCard(tenant, "kickoff_version_created", "kickoff", revision.id, { kickoff_id: latest.id, versao: latest.versao }, { versao: revision.versao, motivo: reason }, profile);
    return revision;
  }

  async function buildQuestionario(tenant, project, client, formulaCtx, autoBlock) {
    const questionario = questionarioTemplate();
    const proposta = (await findProposta(tenant, project.id)) || {};
    const samples = (await all(tenant, "crm_samples")).filter((sample) => sample.projeto_id === project.id);
    const approved = samples.flatMap((sample) => (sample.variacoes || []).filter((v) => clientApproved(v) || v.aprovacao_externa).map((variation) => ({ sample, variation })));
    const formula = formulaCtx?.formula || {};
    const formulaItems = formula.id ? (await all(tenant, "pd_formula_items")).filter((item) => item.formula_id === formula.id) : [];
    const firstItem = (proposta.items_pedido || [])[0] || {};
    const firstSample = samples[0] || {};
    const firstVariation = approved[0]?.variation || (firstSample.variacoes || [])[0] || {};
    const contato = client.contato_principal || {};
    const fragrance = formulaItems.filter((item) => /fragr|essenc/i.test(`${item.ingredient_name || ""} ${item.phase || ""} ${item.function || ""}`))
      .map((item) => item.ingredient_name).filter(Boolean).join(", ");
    const formulaVolume = EMPTY(formula.volume) ? "" : `${formula.volume} ${formula.volume_unit || ""}`.trim();
    // KO-02: cada campo guarda a fonte (selo na tela; mudar exige motivo).
    const { de, origem } = coletorDeOrigem(now());
    const PROJ = "Projeto (CRM)", CLI = "Cliente (CRM)", PROP = "Proposta", AMO = "Amostra", FORM = "Fórmula (P&D)";
    const variacao = variacaoEntreSkus(approved, project.categoria);
    Object.assign(questionario.bloco0, {
      cliente: de("bloco0", "cliente", [project.cliente_nome, PROJ], [client.nome_empresa, CLI]),
      nome_produto: de("bloco0", "nome_produto", [proposta.tipo_produto, PROP], [firstItem.item, PROP], [firstSample.nome_produto, AMO], [project.nome_projeto, PROJ]),
      categoria: mapCategoria(de("bloco0", "categoria", [project.categoria, PROJ], [firstSample.categoria, AMO])),
      forma_fisica: de("bloco0", "forma_fisica", [firstSample.textura_esperada, AMO], [project.forma_fisica, PROJ]),
      volume_gramatura: de("bloco0", "volume_gramatura", [firstItem.volume_gramatura, PROP], [formulaVolume, FORM], [project.volume_gramatura, PROJ]),
      // Nº de SKUs = variações aprovadas pelo cliente; sem amostra aprovada, a proposta e o projeto.
      numero_skus_variacoes: asText(de("bloco0", "numero_skus_variacoes", [variacao.numero_skus || "", "Variações aprovadas"],
        [(proposta.items_pedido || []).length || "", PROP], [project.numero_skus_variacoes, PROJ])),
      varia_entre_skus: de("bloco0", "varia_entre_skus", [variacao.varia_entre_skus, "Variações aprovadas"],
        [firstSample.parametro_variacao ? [firstSample.parametro_variacao] : [], AMO]) || [],
      varia_entre_skus_outro: de("bloco0", "varia_entre_skus_outro", [variacao.varia_entre_skus_outro, "Variações aprovadas"]),
      variacao_outra_categoria: de("bloco0", "variacao_outra_categoria", [variacao.variacao_outra_categoria, "Variações aprovadas"]),
      variacao_outra_categoria_qual: de("bloco0", "variacao_outra_categoria_qual", [variacao.variacao_outra_categoria_qual, "Variações aprovadas"]),
      unidades_por_display: asText(de("bloco0", "unidades_por_display", [project.unidades_por_display, PROJ])),
      displays_ou_unidades_por_caixa_master: asText(de("bloco0", "displays_ou_unidades_por_caixa_master", [project.displays_por_caixa_master, PROJ], [firstItem.quantidade_por_caixa, PROP])),
      registro_notificacao_anvisa: firstValue(de("bloco0", "registro_notificacao_anvisa", [project.registro_notificacao_anvisa, PROJ], [client.tem_anvisa, CLI]), "a_providenciar"),
      detentor_registro: de("bloco0", "detentor_registro", [project.detentor_registro, PROJ], [client.nome_empresa, CLI]),
      responsavel_tecnico: de("bloco0", "responsavel_tecnico", [project.responsavel_tecnico, PROJ], [client.responsavel_tecnico, CLI]),
      modelo_servico: mapModeloServico(de("bloco0", "modelo_servico", [project.tipo_servico, PROJ], [proposta.modelo_servico, PROP])),
    });
    Object.assign(questionario.bloco1, {
      formula: formula.id ? de("bloco1", "formula", ["desenvolvida_kuryos", FORM]) : de("bloco1", "formula", [project.formula_origem, PROJ]),
      cliente_fornece: project.tipo_servico === "formula_do_cliente" ? de("bloco1", "cliente_fornece", [["formula_documento"], PROJ]) : [],
      tem_cor: firstVariation.cor ? de("bloco1", "tem_cor", ["sim", AMO]) : "",
      viscosidade: de("bloco1", "viscosidade", [firstSample.viscosidade, AMO], [project.viscosidade, PROJ]),
      densidade: de("bloco1", "densidade", [firstSample.densidade, AMO], [project.densidade, PROJ]),
      fragrancia_essencia: de("bloco1", "fragrancia_essencia", [fragrance, FORM], [firstVariation.referencia_fragrancia, AMO]),
      compra_fragrancia_por: de("bloco1", "compra_fragrancia_por", [firstVariation.compra_fragrancia_por, AMO], [fragrance ? "kuryos" : "", FORM]),
      observacoes_formulacao: de("bloco1", "observacoes_formulacao", [formula.notes, FORM], [firstSample.observacao_tecnica, AMO], [proposta.observacoes_proposta, PROP]),
    });
    Object.assign(questionario.bloco5, {
      especificacoes_cq_componentes: de("bloco5", "especificacoes_cq_componentes", [project.especificacoes_cq_componentes, PROJ], [firstSample.observacao_tecnica, AMO]),
      testes_aprovacoes_obrigatorios: de("bloco5", "testes_aprovacoes_obrigatorios", [project.testes_aprovacoes_obrigatorios, PROJ]),
      amostra_referencia_fornecida_cliente: samples.length ? de("bloco5", "amostra_referencia_fornecida_cliente", ["sim", AMO]) : "",
    });
    Object.assign(questionario.fechamento, {
      data_prevista_inicio_producao: de("fechamento", "data_prevista_inicio_producao", [project.data_prevista_inicio_producao, PROJ], [firstItem.prazo_entrega, PROP]),
      volume_primeiro_lote: asText(de("fechamento", "volume_primeiro_lote", [firstItem.qtd, PROP], [proposta.volume_primeiro_lote, PROP], [project.volume_estimado_pedido, PROJ])),
      responsavel_kuryos: de("fechamento", "responsavel_kuryos", [await nomeDoUsuario(masterOne, project.responsavel_comercial), PROJ], [autoBlock.responsavel_comercial, PROJ]),
      responsavel_cliente: de("fechamento", "responsavel_cliente", [contato.nome, CLI], [client.responsavel_cliente, CLI]),
      data_preenchimento: now().slice(0, 10),
    });
    questionario.origem = origem;
    questionario.autopopulated_from = [["crm_projects", project], ["crm_clients", client], ["propostas_comerciais", proposta.id], ["crm_samples", samples.length], ["pd_formulas", formula.id]]
      .filter(([, present]) => Boolean(present)).map(([label]) => label);
    return questionario;
  }

  /* D-2 (RFC-001, aprovado 22/10/2026): o Kickoff nasce em rascunho junto com o projeto. Sem fórmula
   * registrada ele abre do mesmo jeito, com o bloco 1 "aguardando P&D"; a fórmula é vinculada quando
   * a amostra for aprovada e registrada (vincularFormula). O que exige a fórmula é aprovar o bloco 1. */
  async function createKickoffForProject(tenant, projectId, profile, explicitFormulaId) {
    const project = await getProject(tenant, projectId);
    if (project.stage === "projeto_arquivado") throw apiError(400, "Projeto arquivado não abre Kickoff.");
    const active = (await related(tenant, "kickoffs", "projeto_id", projectId))
      .filter((k) => ["em_preenchimento", "aguardando_aprovacao", "aprovado", "em_revisao"].includes(k.status))
      .sort((a, b) => Number(b.versao_numero || 0) - Number(a.versao_numero || 0))[0];
    if (active) {
      const comFormula = await vincularFormula(tenant, active, project, profile, explicitFormulaId);
      return decorateKickoff(tenant, await completarDaOrigem(tenant, comFormula, project, profile));
    }
    const client = (await one(tenant, "crm_clients", project.cliente_id)) || null;
    if (!client) throw apiError(404, "Cliente do projeto nao encontrado");
    const formulaCtx = await resolveRegisteredFormula(tenant, projectId, explicitFormulaId);
    const dispensados = [];
    const formula = formulaCtx?.formula || {};
    const pdRequest = formulaCtx?.pd_request || {};
    const samples = (await all(tenant, "crm_samples")).filter((sample) => sample.projeto_id === projectId);
    let sample = samples.find((s) => s.id === (pdRequest.crm_sample_id || pdRequest.linked_amostra_id)) || null;
    let variation = sample ? (sample.variacoes || []).find((v) => v.id === (pdRequest.crm_variacao_id || pdRequest.linked_variacao_id)) : null;
    if (!sample) {
      sample = samples.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0] || null;
      variation = sample ? (sample.variacoes || []).find((v) => clientApproved(v) || v.gera_sku) : null;
    }
    const numeroProjeto = await ensureNumeroProjeto(tenant, project);
    const usados = new Set((await related(tenant, "kickoffs", "projeto_id", projectId)).map((k) => k.numero_kickoff));
    let numero = numeroKickoff(numeroProjeto);
    for (let n = 2; usados.has(numero); n += 1) numero = `${numeroKickoff(numeroProjeto)}-${n}`;
    const autoBlock = {
      numero_kickoff: numero, data_abertura: now(), versao: "v1", versao_numero: 1, status: "em_preenchimento",
      cliente: project.cliente_nome || client.nome_empresa || "", cnpj: client.cnpj || "", projeto_vinculado: project.nome_projeto || "",
      amostra_aprovada: variation?.codigo || (sample ? String(sample.numero_amostra || "") : ""),
      formula_vinculada: formula.name || formula.nome || "", formulador_responsavel: formula.created_by_name || "",
      responsavel_comercial: await nomeDoUsuario(masterOne, project.responsavel_comercial || client.responsavel_comercial || ""),
      pre_briefing_origem: project.briefing_resumido || "",
      feedback_cliente: variation?.feedback_cliente || variation?.observacoes_especificas || variation?.descricao_aplicacao || sample?.feedback_cliente || "",
      categoria_anvisa_herdada: project.categoria || "",
    };
    const questionario = await buildQuestionario(tenant, project, client, formulaCtx, autoBlock);
    // Condições comerciais do CGI (Cláusulas 3 e 4) vêm do orçamento aprovado: a tela de
    // Kickoff do master só tem o questionário, e sem isto o CGI sairia com "R$ 0,00" e
    // pagamento "a_definir".
    const proposta = (await findProposta(tenant, projectId)) || {};
    const firstItem = (proposta.items_pedido || []).find((item) => Number(item.valor_unitario ?? item.preco_negociado) > 0) || {};
    const legacy = legacyBlocksFromQuestionario(questionario, { bloco2: {
      preco_venda_cliente_rs_un: Number(firstItem.valor_unitario ?? firstItem.preco_negociado) || 0,
      condicao_pagamento: proposta.condicoes_pagamento || "",
      volume_estimado_mes: Number.parseInt(String(client.volume_estimado_mensal || "").replace(/\D/g, ""), 10) || null,
    } });
    const kickoff = await create(tenant, "kickoffs", {
      kickoff_group_id: newId(), parent_kickoff_id: null, projeto_id: projectId, cliente_id: project.cliente_id || null,
      formula_id: formula.id || null, numero_kickoff: autoBlock.numero_kickoff, data_abertura: autoBlock.data_abertura,
      versao: "v1", versao_numero: 1, status: "em_preenchimento", bloco1: autoBlock, ...legacy,
      questionario_composicao: questionario, questionario_composicao_version: QUESTIONARIO_COMPOSICAO_VERSION,
      bom: [], aprovacoes: approvalTemplate(), log_auditoria: [], requisitos_dispensados: dispensados,
      created_by: currentUid(), created_by_name: userName(profile), approved_at: null, approved_by: null, approved_by_name: "",
    });
    await syncProjectKickoffSummary(tenant, kickoff);
    await createOrReuseTask(tenant, kickoff, {
      code: "preencher_kickoff_bloco2", title: `Preencher Bloco 2 do Kickoff ${kickoff.numero_kickoff}`, category: "comercial",
      roles: ["sales_ops", "vendedor", "admin"], description: "Preencher especificacao comercial e anexar contrato assinado.",
    });
    await auditCard(tenant, "kickoff_created", "kickoff", kickoff.id, null,
      { numero_kickoff: kickoff.numero_kickoff, projeto_id: projectId, formula_id: kickoff.formula_id, requisitos_dispensados: dispensados }, profile);
    return decorateKickoff(tenant, kickoff);
  }

  // KO-08: o Bloco 0 guarda a lista; o Kickoff espelha em servicos_selecionados/{id}: true.
  const servicosDoKickoff = (kickoff) => {
    const lista = kickoff?.questionario_composicao?.bloco0?.servicos_selecionados;
    return Array.isArray(lista) ? lista.filter(Boolean) : Object.keys(kickoff?.servicos_selecionados || {});
  };

  async function updateQuestionario(tenant, kickoffId, data, profile) {
    if (!isComercial(profile) && !hasAnyRole(profile, [...KICKOFF_EDIT_ROLES])) throw apiError(403, "Sem permissão para editar o Kickoff.");
    let kickoff = await getKickoff(tenant, kickoffId);
    assertEditable(kickoff);
    if (kickoff.status === "aprovado" && String(data?.justificativa || "").trim().length < MIN_JUSTIFICATIVA) {
      throw justificationRequired(`Kickoff ${kickoff.numero_kickoff} já aprovado: alterar cria a versão v${Number(kickoff.versao_numero || 1) + 1} e exige justificativa.`, { titulo: "Justifique a alteração do Kickoff", botao: "Criar nova versão" });
    }
    kickoff = await ensureMutableVersion(tenant, kickoff, profile, String(data?.justificativa || "").trim() || "Alteracao no questionario de composicao apos aprovacao");
    const existing = kickoff.questionario_composicao || questionarioTemplate();
    const merged = mergeQuestionario(existing, data?.questionario || {});
    // KO-02: a origem é gravada pelo servidor (a tela não a altera); mudar um valor que veio da
    // origem exige motivo, que fica em origem[bloco][campo].
    const motivos = { ...(data?.questionario?.motivos_sobrescrita || {}), ...(data?.motivos_sobrescrita || {}) };
    delete merged.motivos_sobrescrita;
    if (existing.origem) merged.origem = clone(existing.origem); else delete merged.origem;
    const sobrescritas = sobrescritasDaOrigem(existing, merged);
    if (sobrescritas.length) {
      const r = aplicarSobrescritas(merged, sobrescritas, motivos, { por: currentUid(), porNome: userName(profile), em: now() });
      if (r.faltam.length) {
        const lista = r.faltam.map((f) => `${ROTULOS[f.campo.split(".")[1]] || f.campo}${f.fonte ? ` (veio de: ${f.fonte})` : ""}`).join("; ");
        throw apiError(422, `Informe o motivo para alterar o que veio da origem: ${lista}.`);
      }
      merged.origem = r.questionario.origem;
    }
    const legacy = legacyBlocksFromQuestionario(merged, kickoff);
    const { ok } = questionarioReady(merged);
    let status = kickoff.status || "em_preenchimento";
    if (ok && ["em_preenchimento", "em_revisao"].includes(status)) status = "aguardando_aprovacao";
    else if (!ok && status === "aguardando_aprovacao") status = "em_preenchimento";
    const flatten = (q) => Object.fromEntries(Object.entries(q || {}).map(([k, v]) => [k, JSON.stringify(v)]));
    const changes = diffEntries("questionario_composicao", flatten(existing), flatten(merged), profile);
    // RFC-001 §7: bloco validado que mudou perde a validação e a etapa dona volta a pendente (com registro).
    const { estados, invalidados } = blocosDoKickoff(kickoff, merged);
    const at = now();
    let aprovacoes = normalizarAprovacoes(kickoff);
    const etapasReabertas = [...new Set(invalidados.map((b) => Object.keys(BLOCOS_DA_ETAPA).find((e) => BLOCOS_DA_ETAPA[e].includes(b))))]
      .filter((e) => aprovacoes.some((a) => a.etapa === e && a.status === "concluida"));
    if (etapasReabertas.length) {
      // Reabrir uma etapa reabre também as que vieram depois dela (a sequência não pula).
      const primeira = Math.min(...etapasReabertas.map((e) => APPROVAL_SEQUENCE.indexOf(e)));
      aprovacoes = aprovacoes.map((a) => (APPROVAL_SEQUENCE.indexOf(a.etapa) >= primeira && a.status === "concluida"
        ? { ...a, status: "pendente", decisao: null, reaberta_em: at, reaberta_motivo: `Bloco alterado depois de validado: ${invalidados.join(", ")}` } : a));
    }
    const invalidacoes = invalidados.map((b) => ({ campo: `bloco.${b}`, valor_anterior: "validado", valor_novo: "alterado — validar de novo",
      usuario_id: currentUid(), usuario_nome: userName(profile), datetime: at }));
    const updated = await patch(tenant, "kickoffs", kickoff.id, {
      questionario_composicao: merged, questionario_composicao_version: QUESTIONARIO_COMPOSICAO_VERSION, ...legacy, status,
      servicos_selecionados: Object.fromEntries(servicosDoKickoff({ questionario_composicao: merged }).map((id) => [id, true])),
      blocos_estado: estados, aprovacoes,
      log_auditoria: [...(kickoff.log_auditoria || []), ...changes, ...invalidacoes],
    });
    if (ok) await enqueueApprovalTask(tenant, updated, "lider_pd");
    await syncProjectKickoffSummary(tenant, updated);
    await auditCard(tenant, "kickoff_questionario_composicao_updated", "kickoff", updated.id, null, { complete: ok, campos: changes.length }, profile);
    return decorateKickoff(tenant, updated);
  }

  async function setArchived(tenant, kickoffId, archive, motivo, profile) {
    requireComercial(profile, archive ? "Arquivar Kickoff" : "Restaurar Kickoff");
    const kickoff = await getKickoff(tenant, kickoffId);
    if (archive === (kickoff.status === "arquivado")) return decorateKickoff(tenant, kickoff);
    const at = now();
    const status = archive ? "arquivado" : (kickoffReadiness(kickoff).ok ? "aguardando_aprovacao" : "em_preenchimento");
    const extra = archive
      ? { archived_at: at, archived_by: currentUid(), archived_by_name: userName(profile), archive_reason: motivo || "" }
      : { restored_at: at, restored_by: currentUid(), restored_by_name: userName(profile) };
    const updated = await patch(tenant, "kickoffs", kickoffId, {
      ...extra, status,
      log_auditoria: [...(kickoff.log_auditoria || []), { campo: "status", valor_anterior: kickoff.status, valor_novo: status,
        usuario_id: currentUid(), usuario_nome: userName(profile), datetime: at, ...(archive ? { motivo: motivo || "" } : {}) }],
    });
    await syncProjectKickoffSummary(tenant, updated);
    await auditCard(tenant, archive ? "kickoff_archived" : "kickoff_restored", "kickoff", kickoffId, { status: kickoff.status }, { status, motivo: motivo || "" }, profile);
    return decorateKickoff(tenant, updated);
  }

  // KO-07: na etapa Comercial, só o responsável comercial do cliente (ou o ADM, registrado como override).
  async function conferirResponsavelComercial(tenant, kickoff, etapa, profile) {
    if (etapa !== "comercial") return null;
    const cliente = kickoff.cliente_id ? await one(tenant, "crm_clients", kickoff.cliente_id) : null;
    const responsavel = cliente?.responsavel_comercial || "";
    // Medido em 23/10: 57 de 88 clientes sem responsável e 10 com id antigo do Mongo (não é usuário daqui):
    // nesses casos qualquer um do Comercial aprova. Registro antigo com o nome em vez do id também vale.
    if (!responsavel || responsavel === currentUid()) return null;
    const usuario = await masterOne("usuarios", responsavel).catch(() => null);
    const mesmoNome = normalizeName(responsavel) === normalizeName(userName(profile));
    if (mesmoNome || (!usuario && !/\s/.test(responsavel) && responsavel.length >= 20)) return null;
    if (isAdmin(profile)) return { responsavel, por: currentUid(), por_nome: userName(profile), motivo: "ADM aprovou no lugar do responsável comercial do cliente" };
    throw apiError(403, `A etapa Comercial deste Kickoff é aprovada pelo responsável comercial do cliente (${await nomeDoUsuario(masterOne, responsavel)}).`);
  }

  // RFC-001: o dono valida um bloco pronto antes da etapa dele (em paralelo); a etapa depois só confirma.
  async function validarBloco(tenant, kickoffId, bloco, profile) {
    const kickoff = await getKickoff(tenant, kickoffId);
    const etapa = Object.keys(BLOCOS_DA_ETAPA).find((e) => BLOCOS_DA_ETAPA[e].includes(bloco));
    if (!etapa) throw apiError(400, "Bloco inválido.");
    if (!isAdmin(profile) && !hasAnyRole(profile, [...APPROVAL_ROLE_MAP[etapa]])) throw apiError(403, `O bloco é validado por ${APPROVAL_LABELS[etapa]}.`);
    await conferirResponsavelComercial(tenant, kickoff, etapa, profile);
    if (kickoff.status === "aprovado") throw apiError(409, "Kickoff aprovado: os blocos estão congelados (alterar cria nova versão).");
    const { estados } = blocosDoKickoff(kickoff);
    const assinaturas = { [bloco]: assinaturaDoBloco(kickoff.questionario_composicao, bloco) };
    const v = validarBlocos(estados, [bloco], { assinaturas, quem: currentUid(), quemNome: userName(profile), agora: now() });
    if (v.erros.length) throw apiError(400, v.erros.join("; "));
    const updated = await patch(tenant, "kickoffs", kickoff.id, {
      blocos_estado: v.estados,
      log_auditoria: [...(kickoff.log_auditoria || []), { campo: `bloco.${bloco}`, valor_anterior: estados[bloco]?.estado || "", valor_novo: "validado",
        usuario_id: currentUid(), usuario_nome: userName(profile), datetime: now() }],
    });
    return decorateKickoff(tenant, updated);
  }

  async function approveKickoff(tenant, kickoffId, data, profile) {
    let kickoff = await getKickoff(tenant, kickoffId);
    const etapa = data?.etapa;
    const decisao = data?.decisao;
    if (!APPROVAL_SEQUENCE.includes(etapa)) throw apiError(400, "Etapa de aprovacao invalida");
    if (!["aprovado", "reprovado"].includes(decisao)) throw apiError(400, "Decisao invalida");
    if (!isAdmin(profile) && !hasAnyRole(profile, [...APPROVAL_ROLE_MAP[etapa]])) {
      throw apiError(403, `A etapa ${APPROVAL_LABELS[etapa]} é aprovada por ${etapa === "direcao" ? "administrador" : [...APPROVAL_ROLE_MAP[etapa]].join(", ")}.`);
    }
    const override = await conferirResponsavelComercial(tenant, kickoff, etapa, profile);
    // AMO-05: Kickoff sobre amostra em retrabalho não segue aprovando até ser revisado.
    if (decisao === "aprovado" && kickoff.desatualizado) {
      throw apiError(409, `Kickoff — ${textoDesatualizado(kickoff.desatualizado)}. Ajuste o Kickoff ou registre "revisado, sem impacto".`);
    }
    if (!keepStoredBom(kickoff)) kickoff = await refreshBom(tenant, kickoff);
    const registration = await syncBomRegistration(tenant, kickoff, profile);
    kickoff = registration.kickoff;
    const dispensados = [];
    if (etapa === "direcao" && registration.summary.pendentes) {
      // A Direção é ADM; no PCP a dispensa fica registrada em vez de travar o
      // fluxo (decisão do usuário: ADM avança sem requisitos, com histórico).
      dispensados.push(`Cadastro de ${registration.summary.pendentes} item(ns) novo(s) do BOM`);
    }
    const readiness = kickoffReadiness(kickoff);
    if (!readiness.ok) throw apiError(400, readiness.missing);
    const step = currentApprovalStep(kickoff);
    if (!step) throw apiError(409, "O fluxo de aprovacao deste Kickoff ja foi concluido.");
    if (step.etapa !== etapa) throw apiError(409, `Etapa atual de aprovacao: ${APPROVAL_LABELS[step.etapa]}. Nao e permitido pular etapas.`);
    // RFC-001: aprovar a etapa valida os blocos dela (prontos; o bloco 1 não pode estar esperando o P&D).
    let blocos = blocosDoKickoff(kickoff).estados;
    if (decisao === "aprovado" && kickoff.questionario_composicao) {
      const assinaturas = Object.fromEntries(Object.keys(blocos).map((b) => [b, assinaturaDoBloco(kickoff.questionario_composicao, b)]));
      const v = validarBlocos(blocos, BLOCOS_DA_ETAPA[etapa] || [], { assinaturas, quem: currentUid(), quemNome: userName(profile), agora: now() });
      if (v.erros.length) throw apiError(400, `Não dá para aprovar ${APPROVAL_LABELS[etapa]}: ${v.erros.join("; ")}.`);
      blocos = v.estados;
    }
    if (decisao === "reprovado" && !String(data.justificativa || "").trim()) throw apiError(400, "Justificativa obrigatoria quando a decisao for reprovado.");
    const at = now();
    const aprovacoes = normalizarAprovacoes(kickoff).map((item) => (item.etapa !== etapa ? item : {
      ...item, status: decisao === "aprovado" ? "concluida" : "reprovada", decisao, justificativa: data.justificativa || "",
      observacoes: data.observacoes || "", decidido_por: currentUid(), decidido_por_nome: userName(profile), decidido_em: at,
      ...(dispensados.length ? { requisitos_dispensados: dispensados } : {}),
      ...(override ? { override_responsavel: override } : {}),
    }));
    const nextIndex = APPROVAL_SEQUENCE.indexOf(etapa) + 1;
    const documentos = [];
    const status = decisao === "reprovado" ? "em_preenchimento" : (nextIndex >= APPROVAL_SEQUENCE.length ? "aprovado" : "aguardando_aprovacao");
    const updated = await patch(tenant, "kickoffs", kickoff.id, {
      aprovacoes, status,
      ...(kickoff.questionario_composicao ? { blocos_estado: status === "aprovado" ? congelarTodos(blocos) : blocos } : {}),
      approved_at: status === "aprovado" ? at : kickoff.approved_at || null,
      approved_by: status === "aprovado" ? currentUid() : kickoff.approved_by || null,
      approved_by_name: status === "aprovado" ? userName(profile) : kickoff.approved_by_name || "",
      log_auditoria: [...(kickoff.log_auditoria || []), { campo: `aprovacao.${etapa}`, valor_anterior: "pendente", valor_novo: decisao,
        usuario_id: currentUid(), usuario_nome: userName(profile), datetime: at, observacoes: data.observacoes || "",
        justificativa: data.justificativa || "", ...(dispensados.length ? { requisitos_dispensados: dispensados } : {}) }],
    });
    await syncProjectKickoffSummary(tenant, updated);
    if (decisao === "reprovado") await enqueueRevisionTask(tenant, updated, etapa);
    else if (status !== "aprovado") await enqueueApprovalTask(tenant, updated, APPROVAL_SEQUENCE[nextIndex]);
    else {
      const ctx = updated.formula_id ? await resolveRegisteredFormula(tenant, updated.projeto_id, updated.formula_id).catch(() => null) : null;
      if (ctx?.pd_request?.id) {
        await patch(tenant, "pd_requests", ctx.pd_request.id, { kickoff_completed: true });
        // _mark_pd_request_kickoff_complete: o EPA nasce como nova versão do documento vivo, em revisão.
        try {
          const { data: doc } = await call("POST", `/pd/requests/${ctx.pd_request.id}/live-documents/epa/generate`, {
            reason: `Gerado apos aprovacao final do Kickoff ${updated.numero_kickoff}`,
            changed_fields: ["identificacao_produto", "bom_bulk_formula", "bom_embalagem_primaria", "bom_embalagem_secundaria", "criterios_liberacao_lote"],
            source_changes: [{ field: "kickoff", label: "Kickoff aprovado", before: null, after: updated.numero_kickoff }],
          });
          documentos.push({ tipo: "epa", id: doc.id, version_code: doc.version_code });
        } catch { /* o EPA segue pela tarefa abaixo */ }
      }
      await createOrReuseTask(tenant, updated, {
        code: "gerar_epa", title: `Gerar EPA do Kickoff ${updated.numero_kickoff}`, category: "pd_dev",
        roles: ["lider_pd", "qa", "engenharia_produto", "admin"],
        description: documentos.length ? "Kickoff aprovado: EPA foi disparado e precisa seguir o fluxo de revisao." : "Kickoff aprovado: gerar o EPA no P&D (documentos vivos).",
      });
    }
    await auditCard(tenant, "kickoff_approval_decision", "kickoff", updated.id, { status: kickoff.status, etapa }, { status, etapa, decisao, requisitos_dispensados: dispensados }, profile);
    return { ...(await decorateKickoff(tenant, updated)), documentos_gerados: documentos };
  }

  async function exportBom(tenant, kickoffId) {
    const kickoff = await refreshBom(tenant, await getKickoff(tenant, kickoffId));
    const header = ["codigo_interno", "descricao", "tipo", "nivel", "fornecido_por", "fornecedor_principal", "unidade", "quantidade_por_unidade", "quantidade_total_pedido", "status_homologacao"];
    const cell = (value) => { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
    const rows = insumosDoKickoff(kickoff).map((line) => [line.codigo_interno, line.descricao, line.tipo, line.nivel || (line.tipo === "mp_formula" ? "manipulacao" : ""),
      line.fornecido_por || "", line.fornecedor_principal?.nome, line.unidade,
      line.quantidade_por_unidade, line.quantidade_total_pedido, line.status_homologacao].map(cell).join(","));
    return new Blob([[header.join(","), ...rows].join("\r\n") + "\r\n"], { type: "text/csv" });
  }

  /* Contrato CGI (contratos_routes.py) */

  const canWriteContrato = (profile) => isComercial(profile) || hasAnyRole(profile, ["compras"]);
  const canReadContrato = (profile) => isComercial(profile) || hasAnyRole(profile, [...CONTRATO_READ_ROLES]);

  async function gerarContrato(tenant, data, profile) {
    if (!canWriteContrato(profile)) throw apiError(403, "Gerar CGI: permissão exclusiva do Comercial, Compras ou administrador.");
    const kickoff = await getKickoff(tenant, data?.kickoff_id).catch(() => { throw apiError(404, "Kickoff nao encontrado."); });
    if (kickoff.status !== "aprovado") throw apiError(400, `Contrato so pode ser gerado a partir de Kickoff aprovado. Status atual: ${kickoff.status}.`);
    const version = Math.max(1, Number.parseInt(data?.version, 10) || 1);
    const existing = (await related(tenant, "contratos", "kickoff_id", kickoff.id)).find((c) => Number(c.version) === version && c.ativo !== false);
    if (existing) return { ...existing, reutilizado: true };
    const project = kickoff.projeto_id ? await one(tenant, "crm_projects", kickoff.projeto_id) : null;
    // Caso JOHN (17/10/2026): CGI assinado antes da cotação gerou o pedido sem quantidade nem preço.
    // O CGI leva as condições do orçamento aprovado, então só nasce depois dele.
    if (project && project.stage !== "pedido_aprovado") {
      throw apiError(409, `O CGI sai do orçamento aprovado: registre a decisão do cliente no orçamento (CRM2) antes de gerar o CGI. Etapa atual do projeto: ${project.stage}.`);
    }
    const client = await one(tenant, "crm_clients", kickoff.cliente_id || project?.cliente_id || "__none__");
    if (!client) throw apiError(409, "Cliente do projeto nao resolvido. Corrija o vinculo cliente_id antes de gerar o CGI.");
    const overrides = data?.contratante || {};
    const contratante = {
      razao_social: client.nome_empresa || kickoff.bloco1?.cliente || "", cnpj: client.cnpj || kickoff.bloco1?.cnpj || "",
      inscricao_estadual: overrides.inscricao_estadual || "", endereco_completo: overrides.endereco_completo || "",
      representante_nome: overrides.representante_nome || "", representante_cpf: overrides.representante_cpf || "",
      representante_rg: overrides.representante_rg || "", representante_cargo: overrides.representante_cargo || "",
    };
    const sequence = await nextCounter(`erp/${tenant}/sequences/contrato_cgi`);
    const numero = `CGI-${new Date().getUTCFullYear()}-${pad(sequence)}`;
    const at = now();
    const contrato = await create(tenant, "contratos", {
      numero_contrato: numero, kickoff_id: kickoff.id, numero_kickoff: kickoff.numero_kickoff, kickoff_versao: kickoff.versao,
      projeto_id: kickoff.projeto_id || project?.id || null, client_id: client.id, cliente_id: client.id, contratante,
      fabricante: KURYOS_FABRICANTE, observacoes: data?.observacoes || "",
      // Conteúdo jurídico congelado na geração (o PDF do ERP era imutável).
      documento: { clausulas: buildClauses(comCondicoesDoOrcamento(kickoff, kickoff.projeto_id ? await findProposta(tenant, kickoff.projeto_id) : null)), projeto_vinculado: kickoff.bloco1?.projeto_vinculado || "", emitido_em: at },
      created_by: currentUid(), created_by_name: userName(profile), status: "gerado",
      status_history: [{ from: null, to: "gerado", at, by: currentUid(), by_name: userName(profile), observacoes: "" }],
      version, ativo: true,
    });
    await auditCard(tenant, "contrato_gerado", "contrato_cgi", contrato.id, null, { numero_contrato: numero, kickoff_id: kickoff.id, client_id: client.id }, profile);
    return contrato;
  }

  async function assinarContrato(tenant, contratoId, data, profile) {
    if (!canWriteContrato(profile)) throw apiError(403, "Assinar CGI: permissão exclusiva do Comercial, Compras ou administrador.");
    let contrato = await one(tenant, "contratos", contratoId);
    if (!contrato) throw apiError(404, "Contrato nao encontrado.");
    const current = contrato.status || "gerado";
    const alreadySigned = ["assinado", "vigente"].includes(current);
    if (!alreadySigned && !["gerado", "enviado"].includes(current)) throw apiError(409, `Contrato em status '${current}' nao pode ser assinado.`);
    const at = now();
    if (!alreadySigned) {
      const assinatura = { status: "assinado", assinado_em: at, assinado_por: currentUid(), assinado_por_nome: userName(profile),
        assinatura_ref: data?.assinatura_ref || "", observacoes: data?.observacoes || "" };
      contrato = await patch(tenant, "contratos", contratoId, {
        status: "assinado", assinatura, signed_at: at, signed_by: currentUid(), signed_by_name: userName(profile),
        status_history: [...(contrato.status_history || []), { from: current, to: "assinado", at, by: currentUid(), by_name: userName(profile), observacoes: data?.observacoes || "" }],
      });
    }
    const skus = contrato.projeto_id ? await generateSkusForProject(tenant, contrato.projeto_id, profile, contrato) : [];
    const successful = skus.filter((item) => item.sku && !item.sku.blocked);
    const bloqueios = skus.filter((item) => item.sku?.blocked).map((item) => item.sku.reason || "Falha desconhecida ao gerar SKU.");
    if (!successful.length && !bloqueios.length) bloqueios.push("Nenhuma amostra aprovada foi encontrada para gerar o SKU.");
    let pedido = null;
    if (!bloqueios.length) {
      const release = await releaseOrderToPcp(tenant, contrato, successful, profile);
      pedido = release.pedido;
      bloqueios.push(...release.bloqueios);
    }
    const liberado = Boolean(successful.length) && !bloqueios.length;
    const updated = await patch(tenant, "contratos", contratoId, {
      pedido_liberado_para_emissao: liberado, skus_gerados_cgi: skus, sku_bloqueios: bloqueios, sku_processado_em: at,
      pedido_id: pedido?.id || contrato.pedido_id || null, numero_pedido: pedido?.numeroFormatado || contrato.numero_pedido || null,
    });
    await auditCard(tenant, alreadySigned ? "contrato_sku_reconciliado" : "contrato_assinado", "contrato_cgi", contratoId, { status: current },
      { status: "assinado", skus_gerados: successful.length, pedido_liberado_para_emissao: liberado, sku_bloqueios: bloqueios }, profile);
    return { ...updated, skus_gerados: skus, pedido_liberado_para_emissao: liberado, sku_bloqueios: bloqueios };
  }

  /* SKU no cadastro mestre do PCP */

  // Categoria do CRM → código de categoria do PCP (config/categoriasProduto).
  const CATEGORIA_PCP = [
    [/sabonete|gel_de_banho|higiene/, "HIG"],
    [/protetor_solar|solar/, "SOL"],
    [/shampoo|condicionador|capilar|cabelo|mascara_capilar|finalizador|tonico/, "CAB"],
    [/perfum|body_splash|colonia|extrato|fragr/, "PRF"],
    [/hidratante|oleo_corporal|corporal|facial|serum|creme|pele|skin/, "PEL"],
    [/maquiagem|batom/, "MAQ"],
    [/desodorante/, "DES"],
  ];

  async function resolveCategoria(values) {
    const raw = (await get(ref(firebaseDb, "config/categoriasProduto"))).val() || [];
    const categorias = (Array.isArray(raw) ? raw : Object.values(raw)).filter((c) => c && c.ativo !== false);
    for (const value of values.flat().filter(Boolean)) {
      const key = normalizeName(value).replace(/\s+/g, "_");
      const direct = categorias.find((c) => normalizeName(c.codigo) === normalizeName(value) || normalizeName(c.nome) === normalizeName(value));
      if (direct) return direct;
      const mapped = CATEGORIA_PCP.find(([pattern]) => pattern.test(key));
      const found = mapped && categorias.find((c) => c.codigo === mapped[1]);
      if (found) return found;
    }
    return null;
  }

  // CLI4 a partir do nome, único entre os códigos do cadastro mestre.
  function cli4For(name, taken) {
    const letters = normalizeName(name).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const base = (letters.slice(0, 4) || "CLIX").padEnd(4, "X");
    if (!taken.has(base)) return base;
    for (const ch of "23456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const code = base.slice(0, 3) + ch;
      if (!taken.has(code)) return code;
    }
    throw apiError(409, `Não foi possível gerar um código de cliente livre para ${name}.`);
  }

  // Cliente do cadastro mestre (clientes/) ligado ao card do CRM. Cliente que
  // só existe no funil é criado com origemCrmClienteId (regra do banco).
  async function ensureMasterClient(tenant, crmClient, contrato) {
    if (crmClient.cadastro_cliente_id) {
      const linked = await masterOne("clientes", crmClient.cadastro_cliente_id);
      if (linked) return linked;
    }
    const masters = await masterAll("clientes");
    const digits = String(crmClient.cnpj || "").replace(/\D/g, "");
    const match = masters.find((m) => (digits.length >= 11 && String(m.cnpj || "").replace(/\D/g, "") === digits)
      || normalizeName(m.nome) === normalizeName(crmClient.nome_empresa));
    if (match) {
      await patch(tenant, "crm_clients", crmClient.id, { cadastro_cliente_id: match.id });
      return match;
    }
    const codigo = cli4For(crmClient.nome_empresa || crmClient.nome || "", new Set(masters.flatMap((m) => [m.codigo, m.id]).filter(Boolean)));
    const record = {
      nome: crmClient.nome_empresa || crmClient.nome || codigo, codigo, cnpj: crmClient.cnpj || "", cidade: crmClient.cidade || "",
      uf: crmClient.uf || crmClient.estado || "", ativo: true, origemCrmClienteId: crmClient.id,
      origemCrm: { contratoId: contrato.id, contratoNumero: contrato.numero_contrato }, criadoEm: now(),
      // 17/10/2026: o cliente nasce no cadastro já com os contatos do CRM (o pedido do PCP lê daqui).
      ...contatosParaCadastro(crmClient),
    };
    await set(ref(firebaseDb, `clientes/${codigo}`), record);
    await patch(tenant, "crm_clients", crmClient.id, { cadastro_cliente_id: codigo });
    return { id: codigo, ...record };
  }

  async function generateSkusForProject(tenant, projectId, profile, contrato) {
    const project = await one(tenant, "crm_projects", projectId);
    const samples = (await all(tenant, "crm_samples")).filter((sample) => sample.projeto_id === projectId);
    const kickoff = contrato.kickoff_id ? await one(tenant, "kickoffs", contrato.kickoff_id) : null;
    const results = [];
    const blocked = (reason) => ({ blocked: true, reason });
    for (const sample of samples) {
      for (const variation of sample.variacoes || []) {
        if (!clientApproved(variation)) continue;
        const entry = { amostra_id: sample.id, variacao_id: variation.id, sku: null };
        results.push(entry);
        const cgi = { origem_contratual_status: "cgi_assinado", cgiContratoId: contrato.id, cgiNumero: contrato.numero_contrato,
          cgiAssinadoEm: contrato.signed_at || now() };
        if (variation.sku_id) {
          const existing = await masterOne("produtos", variation.sku_id);
          if (existing) {
            // Só produto nascido do CRM recebe o vínculo do CGI (regra do banco: produtos/$sku/origemCrm).
            if (existing.origemCrm && existing.origemCrm.cgiContratoId !== contrato.id) {
              await set(ref(firebaseDb, `produtos/${variation.sku_id}/origemCrm`), { ...existing.origemCrm, ...cgi });
            }
            entry.sku = { ...existing, id: variation.sku_id, codigo_interno: variation.sku_id,
              estrutura_pcp: await ensurePcpStructure(tenant, variation.sku_id, variation, kickoff, contrato, profile) };
            continue;
          }
        }
        if (!project) { entry.sku = blocked("[R25] Projeto não encontrado — pré-requisito para geração de SKU"); continue; }
        if (project.stage === "projeto_arquivado") { entry.sku = blocked("[R25] Projeto arquivado — não é possível gerar SKU"); continue; }
        const crmClient = await one(tenant, "crm_clients", sample.cliente_id || project.cliente_id);
        if (!crmClient) { entry.sku = blocked("[R25] Cliente não encontrado — pré-requisito para geração de SKU"); continue; }
        const categoria = await resolveCategoria([sample.categoria, project.categoria, crmClient.categoria_interesse || []]);
        if (!categoria) {
          entry.sku = blocked(`[R25] Categoria '${sample.categoria || project.categoria || "—"}' não possui código ativo em Cadastros > Categorias de produto — cadastre/ative antes de gerar o SKU`);
          continue;
        }
        const master = await ensureMasterClient(tenant, crmClient, contrato);
        const cli = master.codigo || master.id;
        let code;
        do {
          const number = await nextCounter(`config/contadores/sku/${categoria.codigo}_${cli}`);
          code = `${categoria.codigo}-${cli}-${pad(number)}`;
        } while (await masterOne("produtos", sanitizeKey(code)));
        const key = sanitizeKey(code);
        const nomeBase = sample.nome_amostra || sample.nome_produto || project.nome_projeto || "";
        const q0 = kickoff?.questionario_composicao?.bloco0 || {};
        const produto = {
          sku: code, descricao: `${nomeBase}${variation.codigo ? ` - ${variation.codigo}` : ""}`.trim(), cliente: master.nome || crmClient.nome_empresa || "",
          clienteKey: master.id, categoria: categoria.nome, categoriaCodigo: categoria.codigo, ativo: true,
          unCx: Number.parseInt(q0.displays_ou_unidades_por_caixa_master, 10) || 0,
          msAnvisa: /\d{5,}/.test(String(q0.registro_notificacao_anvisa || "")) ? String(q0.registro_notificacao_anvisa) : "",
          ...dadosDeProducaoDoKickoff(kickoff),
          obs: `Gerado pela assinatura do ${contrato.numero_contrato} (Kickoff ${contrato.numero_kickoff}). Complete kg/caixa, lote padrão, capacidade e o que faltar (validade, densidade) antes da OP.`,
          origemCrm: { ...cgi, kickoffId: contrato.kickoff_id || null, projetoId: projectId, amostraId: sample.id, variacaoId: variation.id,
            clienteCrmId: crmClient.id, descricaoAplicacao: variation.descricao_aplicacao || "" },
          criadoEm: now(), criadoPor: userName(profile),
        };
        await set(ref(firebaseDb, `produtos/${key}`), produto);
        const fresh = await one(tenant, "crm_samples", sample.id);
        await patch(tenant, "crm_samples", sample.id, {
          stage: "aprovada",
          variacoes: (fresh.variacoes || []).map((v) => (v.id === variation.id ? { ...v, sku_id: key, sku_codigo: code, gera_sku: true } : v)),
        });
        entry.sku = { ...produto, id: key, codigo_interno: code, nome_produto: produto.descricao, cliente_id: crmClient.id,
          estrutura_pcp: await ensurePcpStructure(tenant, key, variation, kickoff, contrato, profile) };
      }
    }
    return results;
  }

  /* Fórmula, BOM e Especificação da SKU no PCP (formulas/ bom/ especificacoes/ {SKU}__v1) */

  // Fórmula registrada da própria variação; sem ela, a do Kickoff.
  async function formulaForVariation(tenant, variation, kickoff) {
    const [requests, developments, approvals, formulas] = await Promise.all([
      all(tenant, "pd_requests"), all(tenant, "pd_developments"), all(tenant, "pd_approvals"), all(tenant, "pd_formulas"),
    ]);
    const request = requests.find((r) => r.id === variation.pd_request_id || r.crm_variacao_id === variation.id);
    const devIds = new Set(developments.filter((d) => request && (d.request_id || d.pd_request_id) === request.id).map((d) => d.id));
    const registered = new Set(approvals.filter(formulaRegistrada).map((a) => a.development_id));
    const own = formulas.filter((f) => devIds.has(f.development_id) && registered.has(f.development_id))
      .sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0];
    return own || formulas.find((f) => f.id === kickoff?.formula_id) || null;
  }

  // v1 em RASCUNHO, no mesmo formato do Cadastros (btnNovaVersaoClick). Material que
  // não está no cadastro entra "pendente" com o texto original: o Cadastros já mostra,
  // sugere correspondência e trava a aprovação até alguém resolver — e a emissão de OP
  // só libera com Fórmula, BOM e Especificação aprovadas. Idempotente por produto.
  async function ensurePcpStructure(tenant, skuKey, variation, kickoff, contrato, profile) {
    if (!kickoff) return null;
    const existing = (await Promise.all(["formulas", "bom", "especificacoes"].map((col) => masterAll(col))))
      .flat().filter((r) => r.codProduto === skuKey);
    if (existing.length) return { versao: existing[0].versao, criada: false };
    const findMaterial = materialFinder(await masterAll("materiais"));
    const formula = await formulaForVariation(tenant, variation, kickoff);
    const formulaItems = formula ? (await all(tenant, "pd_formula_items")).filter((item) => item.formula_id === formula.id) : [];
    const origemCrm = { cgiContratoId: contrato.id, cgiNumero: contrato.numero_contrato, kickoffId: kickoff.id, kickoffNumero: kickoff.numero_kickoff, pdFormulaId: formula?.id || null };
    const meta = { codProduto: skuKey, versao: "v1", status: "RASCUNHO", criadoPor: userName(profile), criadoEm: now(), origemCrm };
    const pendente = (texto) => ({ pendente: true, textoOriginalGeradorOPs: texto });
    const fItens = {};
    formulaItems.sort((a, b) => Number(a.order || a.ordem || 0) - Number(b.order || b.ordem || 0)).forEach((item, index) => {
      const material = findMaterial(item.material_key, item.material_codigo, item.ingredient_name);
      fItens[`i${pad(index + 1, 3)}`] = {
        mpCodigo: materialCode(material), mpNome: materialName(material), fase: item.phase || item.fase || "A", ordemAdicao: index + 1,
        percentualMM: Number(item.percentage) || 0, ...(material ? {} : pendente(item.ingredient_name || "")),
      };
    });
    const bItens = {};
    (kickoff.bom || []).filter((line) => line.tipo !== "mp_formula").forEach((line, index) => {
      const material = findMaterial(line.codigo_interno, line.especificacao, line.descricao);
      const qty = Number(line.quantidade_por_unidade) || 0;
      const pecas = qty > 0 && qty < 1 ? Math.round(1 / qty) : null;
      bItens[`i${pad(index + 1, 3)}`] = {
        materialCodigo: materialCode(material), materialNome: materialName(material), qtdPorPeca: qty, pecasPorUnidade: pecas, posicao: index + 1,
        ...(material ? {} : pendente([line.descricao, line.especificacao].filter(Boolean).join(" — "))),
      };
    });
    const soma = Object.values(fItens).reduce((sum, item) => sum + item.percentualMM, 0);
    const key = `${skuKey}__v1`;
    await update(ref(firebaseDb), {
      [`formulas/${key}`]: { ...meta, itens: fItens, somaPercentual: Math.round(soma * 1000) / 1000, itemAjusteKey: null,
        aprovadoPD: null, aprovadoQualidade: null, substituiVersao: null },
      [`bom/${key}`]: { ...meta, itens: bItens },
      [`especificacoes/${key}`]: { ...meta, itens: {} },
    });
    const count = (itens) => Object.values(itens).filter((item) => item.pendente).length;
    return { versao: "v1", criada: true, formula_itens: Object.keys(fItens).length, formula_pendentes: count(fItens),
      bom_itens: Object.keys(bItens).length, bom_pendentes: count(bItens) };
  }

  /* Pedido no Comercial do PCP (comercial.html → salvarPedido) */

  const evento = (tipo, texto, profile) => ({ tipo, texto, em: now(), por: userName(profile) });

  async function findCrmOrder(projectId) {
    const pedidos = await masterAll("pedidos_comerciais");
    return pedidos.find((p) => p.origemCrm?.projetoId === projectId && p.origem === "orcamento_aprovado" && p.status !== "CANCELADO") || null;
  }

  function itemsFromProposta(proposta, samples) {
    const fromProposta = (proposta?.items_pedido || []).filter((item) => item.item || item.codigo_kuryos || item.sku_id).map((item) => ({
      produtoKey: item.sku_id || "", sku: item.codigo_kuryos || "", descricao: item.item || "", qtd: Number(item.qtd) || 0,
      valorUnitario: Number(item.valor_unitario ?? item.preco_negociado) || 0, desconto: 0, codigoCliente: item.codigo_cliente || "",
      amostraId: item.sample_id || "", variacaoId: item.variacao_id || "", prazoEntrega: item.prazo_entrega || "",
    }));
    if (fromProposta.length) return fromProposta;
    return samples.flatMap((sample) => (sample.variacoes || []).filter(clientApproved).map((variation) => ({
      produtoKey: "", sku: "", descricao: [sample.nome_produto || sample.nome_amostra, variation.descricao_aplicacao || variation.codigo].filter(Boolean).join(" - "),
      qtd: 0, valorUnitario: 0, desconto: 0, codigoCliente: variation.codigo || "", amostraId: sample.id, variacaoId: variation.id, prazoEntrega: "",
    })));
  }

  // Rascunho do pedido na aprovação do orçamento: aparece no Comercial do PCP
  // como AGUARDANDO_CGI e ainda não gera linha em pedidos/ (nada para a OP).
  async function createOrReuseOrderDraft(tenant, project, proposta, kickoff, profile) {
    const existing = await findCrmOrder(project.id);
    if (existing) return existing;
    const client = await one(tenant, "crm_clients", project.cliente_id);
    const samples = (await all(tenant, "crm_samples")).filter((sample) => sample.projeto_id === project.id);
    const itens = itemsFromProposta(proposta, samples);
    const number = await nextCounter("config/contadores/pedido_comercial");
    const numeroFormatado = `PED-${pad(number)}`;
    const total = itens.reduce((sum, item) => sum + item.qtd * (item.valorUnitario || 0) - (item.desconto || 0), 0);
    const pedido = {
      numero: number, numeroFormatado, tipo: "PEDIDO_COMERCIAL", status: "AGUARDANDO_CGI",
      cliente: client?.nome_empresa || project.cliente_nome || "", clienteKey: client?.cadastro_cliente_id || null,
      dataPedido: today(), numeroPedidoCliente: "",
      clienteCadastro: { nome: client?.nome_empresa || "", cnpj: client?.cnpj || "", codigo: client?.cadastro_cliente_id || "" },
      prazoPagamento: proposta?.condicoes_pagamento || "", observacoes: proposta?.rodape_observacoes || "", entregaParcial: true,
      itens, total_qtd: itens.reduce((sum, item) => sum + item.qtd, 0), totalValor: total, criadoEm: now(), criadoPor: userName(profile),
      origem: "orcamento_aprovado", aprovacaoCliente: "aprovado", aprovacaoClienteEm: now(),
      origemCrm: { projetoId: project.id, propostaId: proposta?.id || null, kickoffId: kickoff?.id || null, clienteCrmId: project.cliente_id || null },
      historico: [evento("AGUARDANDO_CGI", "Orçamento aprovado no CRM2. Pedido aguarda o CGI assinado e as SKUs para liberar ao PCP.", profile)],
    };
    await set(ref(firebaseDb, `pedidos_comerciais/${numeroFormatado}`), pedido);
    return { id: numeroFormatado, ...pedido };
  }

  // Pedido do CRM ainda não liberado acompanha o orçamento aprovado (quantidade, valor, prazo);
  // o SKU que o item já tinha fica.
  async function atualizarRascunhoDoPedido(tenant, pedido, proposta, projectId, profile) {
    if (!pedido || pedido.status === "LIBERADO_PCP") return pedido;
    const samples = (await all(tenant, "crm_samples")).filter((sample) => sample.projeto_id === projectId);
    const atuais = pedido.itens || [];
    const itens = itemsFromProposta(proposta, samples).map((item, index) => {
      const antes = atuais.find((a) => a.variacaoId && a.variacaoId === item.variacaoId) || atuais[index] || {};
      return { ...item, produtoKey: item.produtoKey || antes.produtoKey || "", sku: item.sku || antes.sku || "",
        amostraId: item.amostraId || antes.amostraId || "", variacaoId: item.variacaoId || antes.variacaoId || "" };
    });
    if (!itens.length) return pedido;
    const total = itens.reduce((sum, item) => sum + item.qtd * (item.valorUnitario || 0) - (item.desconto || 0), 0);
    const mudancas = {
      itens, total_qtd: itens.reduce((sum, item) => sum + item.qtd, 0), totalValor: total,
      prazoPagamento: proposta?.condicoes_pagamento || pedido.prazoPagamento || "",
      historico: [...(pedido.historico || []), evento(pedido.status || "AGUARDANDO_CGI", "Quantidades e valores atualizados pelo orçamento aprovado no CRM2.", profile)],
    };
    await update(ref(firebaseDb, `pedidos_comerciais/${pedido.id}`), mudancas);
    return { ...pedido, ...mudancas };
  }

  // Assinatura do CGI: SKUs nos itens e liberação ao PCP (mesmas gravações de
  // comercial.html → salvarPedido), que é o que a emissão de OP lê.
  async function releaseOrderToPcp(tenant, contrato, skus, profile) {
    const project = await one(tenant, "crm_projects", contrato.projeto_id);
    const proposta = await findProposta(tenant, contrato.projeto_id);
    const kickoff = contrato.kickoff_id ? await one(tenant, "kickoffs", contrato.kickoff_id) : null;
    let pedido = await findCrmOrder(contrato.projeto_id);
    if (!pedido) pedido = await createOrReuseOrderDraft(tenant, project, proposta, kickoff, profile);
    if (pedido.status === "LIBERADO_PCP") return { pedido, bloqueios: [] };
    const samples = (await all(tenant, "crm_samples")).filter((sample) => sample.projeto_id === contrato.projeto_id);
    // Quantidades/preços valem os do orçamento no momento da liberação.
    const base = itemsFromProposta(proposta, samples);
    const itens = base.map((item, index) => {
      const match = skus.find((s) => s.variacao_id && s.variacao_id === item.variacaoId) || skus[index];
      // Item que já aponta para um produto do cadastro (recompra) mantém o SKU.
      const sku = item.produtoKey ? null : match?.sku;
      return sku ? { ...item, produtoKey: sku.id, sku: sku.codigo_interno || sku.sku, descricao: item.descricao || sku.descricao } : item;
    });
    const bloqueios = [];
    const semSku = itens.filter((item) => !item.sku);
    if (semSku.length) bloqueios.push(`Itens do orçamento sem SKU: ${semSku.map((i) => i.descricao || "—").join(", ")}`);
    const semQtd = itens.filter((item) => !(item.qtd > 0));
    if (semQtd.length) bloqueios.push(`Informe a quantidade no orçamento (CRM2) para: ${semQtd.map((i) => i.descricao || i.sku).join(", ")} e reprocesse o CGI.`);
    const seen = new Set();
    if (itens.some((item) => item.sku && (seen.has(item.sku) || !seen.add(item.sku)))) bloqueios.push("Cada SKU deve aparecer uma única vez no pedido. Consolide a quantidade no orçamento.");
    const master = project?.cliente_id ? await one(tenant, "crm_clients", project.cliente_id) : null;
    const masterClient = master?.cadastro_cliente_id ? await masterOne("clientes", master.cadastro_cliente_id) : null;
    const total = itens.reduce((sum, item) => sum + item.qtd * (item.valorUnitario || 0) - (item.desconto || 0), 0);
    const common = {
      itens, total_qtd: itens.reduce((sum, item) => sum + item.qtd, 0), totalValor: total,
      cliente: masterClient?.nome || pedido.cliente, clienteKey: masterClient?.id || pedido.clienteKey || null,
      clienteCadastro: { nome: masterClient?.nome || pedido.cliente, cnpj: masterClient?.cnpj || "", codigo: masterClient?.codigo || "" },
      cgi: { contratoId: contrato.id, numero: contrato.numero_contrato, assinadoEm: contrato.signed_at || now(), assinadoPor: contrato.signed_by_name || userName(profile) },
    };
    const base_ = `pedidos_comerciais/${pedido.id}`;
    if (bloqueios.length) {
      await update(ref(firebaseDb, base_), { ...common, bloqueioEmissao: bloqueios.join(" | "),
        historico: [...(pedido.historico || []), evento("BLOQUEADO", `CGI ${contrato.numero_contrato} assinado; liberação ao PCP bloqueada: ${bloqueios.join(" | ")}`, profile)] });
      return { pedido: { ...pedido, ...common }, bloqueios };
    }
    const frete = pedido.frete || { tipo: "", responsabilidade: "", prazo: "", enderecoEntrega: "" };
    const updates = {};
    Object.entries({ ...common, status: "LIBERADO_PCP", bloqueioEmissao: null, liberadoPcpEm: now(),
      historico: [...(pedido.historico || []), evento("LIBERADO_PCP", `CGI ${contrato.numero_contrato} assinado e SKUs gerados. Pedido liberado ao PCP.`, profile)] })
      .forEach(([key, value]) => { updates[`${base_}/${key}`] = value; });
    for (const item of itens) {
      updates[`pedidos/${pedido.id}__${sanitizeKey(item.sku)}`] = {
        id: pedido.id, produto: item.descricao, sku: item.sku, cliente: common.cliente, qtdTotal: item.qtd, produzido: 0, priority: 999,
        parentPedidoId: pedido.id, dataPedido: pedido.dataPedido, dataEntrega: pedido.previsaoComercialEntrega || item.prazoEntrega || null,
        valorUnitario: item.valorUnitario, pedidoComercialStatus: "LIBERADO_PCP", frete,
      };
    }
    updates[`notificacoes_comercial/${pedido.id}`] = { tipo: "PEDIDO_LIBERADO_PCP", status: "PENDENTE", pedido: pedido.id, cliente: common.cliente, criadoEm: now() };
    await update(ref(firebaseDb), updates);
    return { pedido: { ...pedido, ...common, status: "LIBERADO_PCP" }, bloqueios: [] };
  }

  /* Decisão do cliente sobre o orçamento */

  async function decidirOrcamento(tenant, projectId, data, profile) {
    requireComercial(profile, "Registrar decisão do orçamento");
    const decisao = data?.decisao;
    const motivo = String(data?.motivo || "").trim();
    if (!["aprovado", "reprovado"].includes(decisao)) throw apiError(422, "decisao deve ser 'aprovado' ou 'reprovado'.");
    if (decisao === "reprovado" && !motivo) throw apiError(422, "Motivo obrigatório para reprovar o orçamento.");
    // COM-02: decisão do cliente só com quem, canal e data/hora reais.
    const aprovacao = validarAprovacaoCliente(data?.aprovacao_cliente, { registradoPor: currentUid(), registradoPorNome: userName(profile) });
    if (!aprovacao.ok) throw apiError(422, aprovacao.erros.join(" "));
    let project = await getProject(tenant, projectId);
    const proposta = await findProposta(tenant, projectId);
    if (!proposta) throw apiError(409, "Salve o orçamento antes de registrar a decisão do cliente.");
    // AMO-05: orçamento sobre amostra em retrabalho não é aprovado até ser revisado.
    if (decisao === "aprovado" && proposta.desatualizado) throw apiError(409, `Orçamento — ${textoDesatualizado(proposta.desatualizado)}. Revise o orçamento ou registre "revisado, sem impacto".`);
    const dispensados = [];
    if (decisao === "aprovado") {
      const status = await amostrasStatus(tenant, projectId);
      if (!status.pode_confirmar) {
        if (!isAdmin(profile)) throw apiError(409, "É necessária ao menos uma amostra aprovada pelo P&D e pelo Comercial.");
        dispensados.push("Amostra aprovada pelo P&D e pelo Comercial");
      }
      dispensados.push(...(await assertKickoffPossible(tenant, projectId, profile)));
    }
    const at = now();
    // COM-01: orçamento aprovado fica com a taxa do momento da aprovação (registrada no histórico abaixo).
    const cambioAprovacao = decisao === "aprovado" ? await cambioAgora(project, "orcamento_aprovado", profile) : null;
    await patch(tenant, "crm_propostas", proposta.id, {
      negociacao_status: decisao, negociacao_motivo: motivo, negociacao_evidencia_file_id: data?.evidencia_file_id || "",
      negociacao_observacoes: data?.observacoes || "", negociacao_decidida_em: at, negociacao_decidida_por: currentUid(),
      negociacao_aprovacao_cliente: aprovacao.registro,
      ...(cambioAprovacao ? { cambio_da_etapa: cambioAprovacao } : {}),
      ...(dispensados.length ? { requisitos_dispensados: dispensados } : {}),
    });
    let kickoff = null;
    let order = null;
    if (decisao === "reprovado") {
      project = await advanceProjectStage(tenant, projectId, "projeto_arquivado", profile, "orcamento_reprovado", { motivo_arquivamento: motivo });
      await mirrorClientStage(tenant, project, profile, "cliente_perdido", "espelho_crm2_projeto_arquivado", { motivo_perda: "outro" });
    } else {
      project = await advanceProjectStage(tenant, projectId, "pedido_aprovado", profile, "orcamento_aprovado");
      kickoff = await createKickoffForProject(tenant, projectId, profile);
      order = await createOrReuseOrderDraft(tenant, project, proposta, kickoff, profile);
      order = await atualizarRascunhoDoPedido(tenant, order, proposta, projectId, profile);
      // CGI já assinado antes (fluxo antigo): reprocessa a assinatura para liberar o pedido com o orçamento.
      const assinado = (await related(tenant, "contratos", "projeto_id", projectId))
        .find((c) => ["assinado", "vigente"].includes(c.status) && c.ativo !== false);
      if (assinado && order?.status !== "LIBERADO_PCP") {
        await assinarContrato(tenant, assinado.id, {}, profile);
        order = (await findCrmOrder(projectId)) || order;
      }
      await mirrorClientStage(tenant, project, profile, "cliente_fechado", "espelho_crm2_pedido_fechado");
    }
    // Depois das mudanças de etapa (que regravam o histórico inteiro do projeto e do cliente).
    await acrescentarHistorico(`erp/${tenant}/crm_projects/${projectId}/historico_movimentacoes`,
      entradaHistoricoAprovacao(aprovacao.registro, { oque: "Orçamento", resultado: decisao, documentoId: proposta.id }));
    if (cambioAprovacao) await registrarCambio(tenant, project, "orcamento_aprovado", profile, cambioAprovacao);
    await auditCard(tenant, "orcamento_decidido", "projeto", projectId, { stage: project?.stage }, { decisao, motivo, requisitos_dispensados: dispensados, aprovacao_cliente: aprovacao.registro }, profile);
    return { decisao, project, kickoff, order };
  }

  /* Ganchos chamados pelo adaptador ao mover projeto no CRM2 */

  async function beforeProjectMove(tenant, projectId, to, profile) {
    if (to === "kickoff" || to === "pedido_aprovado") return assertKickoffPossible(tenant, projectId, profile);
    return [];
  }

  async function afterProjectMove(tenant, project, profile) {
    const result = {};
    if (project.stage === "kickoff") {
      const kickoff = await createKickoffForProject(tenant, project.id, profile);
      result.kickoff_criado = { kickoff_id: kickoff.id, numero_kickoff: kickoff.numero_kickoff };
      result.tarefas_criadas = [{ tipo: "preencher_kickoff_bloco2", responsavel: "comercial" }];
    } else if (project.stage === "pedido_aprovado") {
      const kickoff = await createKickoffForProject(tenant, project.id, profile);
      result.kickoff_criado = { kickoff_id: kickoff.id, numero_kickoff: kickoff.numero_kickoff };
      result.tarefas_criadas = [{ tipo: "preencher_kickoff_bloco2", responsavel: "comercial" }];
      await mirrorClientStage(tenant, project, profile, "cliente_fechado", "espelho_crm2_pedido_fechado");
    } else if (project.stage === "cotacao") {
      await mirrorClientStage(tenant, project, profile, "negociacao", "espelho_crm2_cotacao");
    } else if (project.stage === "projeto_arquivado") {
      await mirrorClientStage(tenant, project, profile, "cliente_perdido", "espelho_crm2_projeto_arquivado", { motivo_perda: "outro" });
    }
    return result;
  }

  /* Pedidos (OrdersPage/CommercialBudgetPage) sobre pedidos_comerciais/ */

  function orderView(pedido) {
    return {
      ...pedido, id: pedido.id, numero_pedido: pedido.numeroFormatado || pedido.id,
      cliente: { nome: pedido.cliente, razao_social: pedido.clienteCadastro?.nome || pedido.cliente, cnpj: pedido.clienteCadastro?.cnpj || "" },
      status_pcp: pedido.status, status: { LIBERADO_PCP: "confirmado", AGUARDANDO_CGI: "rascunho", CANCELADO: "cancelado" }[pedido.status] || String(pedido.status || "").toLowerCase(),
      total_pedido: pedido.totalValor || 0, data_pedido: pedido.dataPedido, created_at: pedido.criadoEm, created_by_name: pedido.criadoPor,
      kickoff_id: pedido.origemCrm?.kickoffId || null, projeto_id: pedido.origemCrm?.projetoId || null,
      items: (pedido.itens || []).map((item) => ({ sku_id: item.produtoKey, codigo_kuryos: item.sku, item: item.descricao, qtd: item.qtd, valor_unitario: item.valorUnitario })),
      attachments: Object.values(pedido.anexos || {}),
      liberado_para_emissao: pedido.status === "LIBERADO_PCP", bloqueio_emissao: pedido.bloqueioEmissao || "",
    };
  }

  // Pedido direto (aba Pedido do orçamento) = salvarPedido do PCP.
  async function createPcpOrder(tenant, data, profile) {
    requireComercial(profile, "Criar pedido");
    const client = await one(tenant, "crm_clients", data?.cliente_id);
    const masterClient = client?.cadastro_cliente_id ? await masterOne("clientes", client.cadastro_cliente_id) : await masterOne("clientes", data?.cliente_id || "__none__");
    if (!masterClient) throw apiError(409, "Pedido só para cliente do cadastro mestre. Feche o CGI do cliente novo antes.");
    const produtos = new Map((await masterAll("produtos")).map((p) => [p.id, p]));
    const itens = (data?.items || []).map((item) => {
      const produto = produtos.get(item.sku_id) || {};
      return { produtoKey: item.sku_id || "", sku: produto.sku || item.codigo_kuryos || "", descricao: produto.descricao || item.item || "",
        qtd: Number(item.qtd) || 0, valorUnitario: Number(item.valor_unitario) || 0, desconto: 0 };
    });
    if (!itens.length || itens.some((item) => !item.produtoKey || !item.sku || item.qtd <= 0)) throw apiError(400, "Cada linha precisa de produto cadastrado e quantidade positiva.");
    const seen = new Set();
    if (itens.some((item) => seen.has(item.sku) || !seen.add(item.sku))) throw apiError(400, "Cada SKU deve aparecer uma única vez. Consolide a quantidade para impedir duplicidade no PCP.");
    const number = await nextCounter("config/contadores/pedido_comercial");
    const id = `PED-${pad(number)}`;
    const frete = { tipo: data?.frete?.tipo || "", responsabilidade: data?.frete?.tipo === "FOB" ? "CLIENTE_COLETA_OU_CONTRATA" : "KURYOS_ENTREGA_OU_CONTRATA",
      prazo: data?.frete?.prazo_coleta || "", enderecoEntrega: data?.frete?.endereco || "" };
    const pedido = {
      numero: number, numeroFormatado: id, tipo: "PEDIDO_COMERCIAL", status: "LIBERADO_PCP", cliente: masterClient.nome, clienteKey: masterClient.id,
      dataPedido: data?.data_pedido || today(), numeroPedidoCliente: data?.pedido_cliente_ref || "", contato: data?.cliente?.responsavel || "",
      telefone: data?.cliente?.telefone || "", email: data?.cliente?.email || "",
      clienteCadastro: { nome: masterClient.nome, cnpj: masterClient.cnpj || "", codigo: masterClient.codigo || "" },
      previsaoComercialEntrega: data?.prazo_entrega || null, frete, prazoPagamento: data?.condicoes?.forma_pgto || "", entregaParcial: true,
      observacoes: data?.observacoes || "", itens, total_qtd: itens.reduce((s, i) => s + i.qtd, 0),
      totalValor: itens.reduce((s, i) => s + i.qtd * i.valorUnitario, 0), criadoEm: now(), criadoPor: userName(profile),
      historico: [evento("LIBERADO_PCP", "Pedido confirmado e liberado ao PCP", profile)],
    };
    const updates = { [`pedidos_comerciais/${id}`]: pedido, [`notificacoes_comercial/${id}`]: { tipo: "PEDIDO_LIBERADO_PCP", status: "PENDENTE", pedido: id, cliente: masterClient.nome, criadoEm: now() } };
    for (const item of itens) {
      updates[`pedidos/${id}__${sanitizeKey(item.sku)}`] = { id, produto: item.descricao, sku: item.sku, cliente: masterClient.nome, qtdTotal: item.qtd,
        produzido: 0, priority: 999, parentPedidoId: id, dataPedido: pedido.dataPedido, dataEntrega: pedido.previsaoComercialEntrega, valorUnitario: item.valorUnitario,
        pedidoComercialStatus: "LIBERADO_PCP", frete };
    }
    await update(ref(firebaseDb), updates);
    return orderView({ id, ...pedido });
  }

  async function attachToOrder(orderId, data, profile) {
    requireComercial(profile, "Anexar documento ao pedido");
    const pedido = await masterOne("pedidos_comerciais", orderId);
    if (!pedido) throw apiError(404, "Pedido não encontrado.");
    const file = typeof data?.get === "function" ? data.get("file") : data?.file;
    if (!file) throw apiError(400, "Selecione o arquivo.");
    const fileId = newId();
    const path = `pedidos_comerciais/${orderId}/${fileId}-${file.name || "anexo"}`;
    const stored = storageRef(firebaseStorage, path);
    await uploadBytes(stored, file);
    const meta = { id: fileId, original_filename: file.name || "anexo", content_type: file.type || "", size: file.size || 0, url: await getDownloadURL(stored),
      path, uploaded_at: now(), uploaded_by_name: userName(profile) };
    await set(ref(firebaseDb, `pedidos_comerciais/${orderId}/anexos/${fileId}`), meta);
    return meta;
  }

  /* Rotas */

  // AMO-05 (RFC-001 §6): Kickoff vigente e orçamento do projeto ficam desatualizados.
  async function marcarDesatualizadoDoProjeto(tenant, projectId, marca) {
    const marcados = {};
    const kickoff = await kickoffVigente(tenant, projectId);
    if (kickoff) { await patch(tenant, "kickoffs", kickoff.id, { desatualizado: marca }); marcados.kickoff_id = kickoff.id; }
    const proposta = await findProposta(tenant, projectId);
    if (proposta) { await patch(tenant, "crm_propostas", proposta.id, { desatualizado: marca }); marcados.proposta_id = proposta.id; }
    return marcados;
  }

  async function resolverMarca(tenant, colecao, doc, data, profile) {
    const r = resolverDesatualizado(doc, { motivo: data?.motivo, por: currentUid(), porNome: userName(profile), em: now() });
    if (!r.ok) throw apiError(422, r.erro);
    return patch(tenant, colecao, doc.id, r.mudancas);
  }

  return {
    beforeProjectMove,
    afterProjectMove,
    afterProjectCreate,
    marcarDesatualizadoDoProjeto,
    async route({ method, path, query, data, profile, tenant }) {
      let m;
      const is = (verb, pattern) => method === verb && (m = path.match(pattern));
      // AMO-05: "revisado, sem impacto" tira a marca de desatualizado, com decisão registrada.
      if (is("POST", /^\/kickoff\/([^/]+)\/desatualizado\/resolver$/)) {
        if (!isComercial(profile) && !hasAnyRole(profile, [...KICKOFF_EDIT_ROLES])) throw apiError(403, "Sem permissão para revisar o Kickoff.");
        return decorateKickoff(tenant, await resolverMarca(tenant, "kickoffs", await getKickoff(tenant, m[1]), data, profile));
      }
      if (is("POST", /^\/crm\/projects\/([^/]+)\/proposta\/desatualizado\/resolver$/)) {
        requireComercial(profile, "Revisar o orçamento");
        const proposta = await findProposta(tenant, m[1]);
        if (!proposta) throw apiError(404, "Proposta não encontrada");
        return resolverMarca(tenant, "crm_propostas", proposta, data, profile);
      }

      if (is("GET", /^\/crm\/projects\/([^/]+)\/proposta$/)) { await getProject(tenant, m[1]); return (await findProposta(tenant, m[1])) || {}; }
      if (is("POST", /^\/crm\/projects\/([^/]+)\/proposta$/)) return upsertProposta(tenant, m[1], data, profile);
      if (is("PATCH", /^\/crm\/projects\/([^/]+)\/proposta$/)) {
        requireComercial(profile, "Atualizar proposta");
        const project = await getProject(tenant, m[1]);
        const current = await findProposta(tenant, m[1]);
        const changes = pickProposta(data, { dropNull: true });
        if (!Object.keys(changes).length) return { ok: true };
        if (!current) throw apiError(404, "Proposta não encontrada — crie com POST primeiro");
        if (current.desatualizado && (changes.status === "enviado" || changes.negociacao_status === "aprovado")) {
          throw apiError(409, `Orçamento — ${textoDesatualizado(current.desatualizado)}. Revise ou registre "revisado, sem impacto" antes de enviar ou aprovar.`);
        }
        // COM-02: registrar o aceite por aqui também exige quem, canal e data/hora.
        let aprovacao = null;
        let cambioAprovacao = null;
        if (changes.negociacao_status === "aprovado" && current.negociacao_status !== "aprovado") {
          aprovacao = validarAprovacaoCliente(data?.aprovacao_cliente, { registradoPor: currentUid(), registradoPorNome: userName(profile) });
          if (!aprovacao.ok) throw apiError(422, aprovacao.erros.join(" "));
          changes.negociacao_aprovacao_cliente = aprovacao.registro;
          // COM-01: o orçamento aprovado fica com a taxa do momento da aprovação.
          cambioAprovacao = await cambioAgora(project, "orcamento_aprovado", profile);
          if (cambioAprovacao) changes.cambio_da_etapa = cambioAprovacao;
        }
        // Enviar sem mexer na composição também confere a que já está gravada.
        if (!changes.composicao && changes.status === "enviado" && current.composicao) changes.composicao = current.composicao;
        await conferirComposicao(changes, current);
        const salva = await patch(tenant, "crm_propostas", current.id, { ...changes, updated_by: currentUid(), updated_by_name: userName(profile) });
        if (changes.status === "enviado" && current.status !== "enviado") await registrarCambio(tenant, project, "envio", profile);
        if (cambioAprovacao) await registrarCambio(tenant, project, "orcamento_aprovado", profile, cambioAprovacao);
        if (aprovacao) {
          await acrescentarHistorico(`erp/${tenant}/crm_projects/${m[1]}/historico_movimentacoes`,
            entradaHistoricoAprovacao(aprovacao.registro, { oque: "Orçamento", resultado: "aprovado", documentoId: current.id }));
        }
        return salva;
      }
      if (is("GET", /^\/crm\/projects\/([^/]+)\/cotacao-base$/)) return cotacaoBase(tenant, m[1]);
      // COM-03: cotação em registro próprio (vigente + revisões), gerada do Kickoff.
      if (is("GET", /^\/crm\/projects\/([^/]+)\/cotacao$/)) { await getProject(tenant, m[1]); return listarCotacoes(tenant, m[1]); }
      if (is("POST", /^\/crm\/projects\/([^/]+)\/cotacao$/)) { await gerarCotacao(tenant, m[1], profile); return listarCotacoes(tenant, m[1]); }
      if (is("POST", /^\/crm\/projects\/([^/]+)\/cotacao\/status$/)) { await mudarStatusCotacao(tenant, m[1], data, profile); return listarCotacoes(tenant, m[1]); }
      if (is("PUT", /^\/crm\/projects\/([^/]+)\/cotacao\/linhas\/([^/]+)$/)) { await precificarLinha(tenant, m[1], decodeURIComponent(m[2]), data, profile); return listarCotacoes(tenant, m[1]); }
      // KO-06: responsáveis técnicos (menu do Kickoff, com "+ cadastrar" ali mesmo).
      if (is("GET", /^\/crm\/responsaveis-tecnicos$/)) {
        return (await all(tenant, "responsaveis_tecnicos")).filter((r) => r.ativo !== false)
          .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
      }
      if (is("POST", /^\/crm\/responsaveis-tecnicos$/)) {
        if (!isComercial(profile) && !hasAnyRole(profile, [...KICKOFF_EDIT_ROLES])) throw apiError(403, "Sem permissão para cadastrar responsável técnico.");
        const v = validarResponsavel(data, await all(tenant, "responsaveis_tecnicos"));
        if (!v.ok) throw apiError(v.duplicado ? 409 : 422, v.erros.join(" "));
        return create(tenant, "responsaveis_tecnicos", { ...v.registro, criado_por: currentUid(), criado_por_nome: userName(profile) });
      }
      if (is("POST", /^\/crm\/projects\/([^/]+)\/proposta\/decisao$/)) return decidirOrcamento(tenant, m[1], data, profile);
      if (is("GET", /^\/crm\/projects\/([^/]+)\/amostras-status$/)) return amostrasStatus(tenant, m[1]);
      if (is("GET", /^\/crm\/projects\/([^/]+)\/material-requirements$/)) {
        await getProject(tenant, m[1]);
        // R20 sem o backend do ERP: necessidade estimada pelo BOM do Kickoff vigente
        // (fórmula × volume do primeiro pedido + embalagens). Sem Kickoff, nada a mostrar.
        const kickoff = await kickoffVigente(tenant, m[1]);
        if (!kickoff) return {};
        const bom = insumosDoKickoff(await refreshBom(tenant, kickoff));
        if (!bom.length) return {};
        const materiais = bom.map((line) => ({
          id: line.id, insumo_id: line.codigo_interno, codigo_material: line.cadastro_status === "cadastrado" || line.status_homologacao === "homologado" ? line.codigo_interno : "",
          tipo: line.tipo, descricao: line.descricao, qtd_necessaria: line.quantidade_total_pedido, qtd_necessaria_compra: line.quantidade_total_pedido,
          unidade_consumo: line.unidade, unidade_compra: line.unidade, responsavel: "compras",
          pendente_info: !(line.quantidade_total_pedido > 0) || line.status_homologacao !== "homologado",
        }));
        return { kickoff_id: kickoff.id, numero_kickoff: kickoff.numero_kickoff, gerado_em: now(),
          status: materiais.some((item) => item.pendente_info) ? "pendente_info" : "gerado", materiais };
      }
      if (is("POST", /^\/crm\/projects\/sync-approved$/)) {
        if (!isAdmin(profile)) throw apiError(403, "Sincronizar pedidos aprovados é exclusivo do administrador.");
        const details = [];
        let synced = 0;
        const errors = [];
        for (const project of (await all(tenant, "crm_projects")).filter((p) => p.stage === "pedido_aprovado")) {
          try {
            const kickoff = await createKickoffForProject(tenant, project.id, profile);
            const order = await createOrReuseOrderDraft(tenant, project, await findProposta(tenant, project.id), kickoff, profile);
            details.push({ project_id: project.id, nome_projeto: project.nome_projeto, kickoff: { id: kickoff.id, numero_kickoff: kickoff.numero_kickoff, status: kickoff.status },
              orders: [order.id], sku_status: "aguardando_assinatura_cgi" });
            synced += 1;
          } catch (error) { errors.push({ project_id: project.id, error: error.message }); }
        }
        return { synced, skipped: 0, errors, details };
      }

      if (is("POST", /^\/kickoff$/)) {
        if (!isComercial(profile) && !hasAnyRole(profile, ["lider_pd"])) throw apiError(403, "Abrir Kickoff: permissão do Comercial, Líder P&D ou administrador.");
        return createKickoffForProject(tenant, data?.projeto_id, profile, data?.formula_id);
      }
      if (method === "GET" && path === "/kickoffs") {
        const start = query.periodo_de ? Date.parse(query.periodo_de) : null;
        const end = query.periodo_ate ? Date.parse(query.periodo_ate) + 864e5 : null;
        return (await all(tenant, "kickoffs"))
          .filter((k) => !query.status || k.status === query.status)
          .filter((k) => {
            const opened = Date.parse(k.data_abertura || k.created_at || "");
            return (!start || !opened || opened >= start) && (!end || !opened || opened <= end);
          })
          .filter((k) => !query.responsavel || `${k.created_by_name || ""} ${currentApprovalStep(k)?.decidido_por_nome || ""}`.toLowerCase().includes(String(query.responsavel).toLowerCase()))
          .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
          .map((k) => ({ ...k, responsavel_aprovacao_pendente: currentApprovalStep(k)?.label || null, data_aprovacao: k.approved_at || null }));
      }
      if (is("GET", /^\/kickoff\/([^/]+)$/)) return decorateKickoff(tenant, await getKickoff(tenant, m[1]));
      if (is("GET", /^\/kickoff\/([^/]+)\/historico$/)) {
        const kickoff = await getKickoff(tenant, m[1]);
        return (await related(tenant, "kickoffs", "kickoff_group_id", kickoff.kickoff_group_id)).sort((a, b) => Number(b.versao_numero || 0) - Number(a.versao_numero || 0));
      }
      if (is("PUT", /^\/kickoff\/([^/]+)\/questionario-composicao$/)) return updateQuestionario(tenant, m[1], data, profile);
      if (is("DELETE", /^\/kickoff\/([^/]+)$/)) return setArchived(tenant, m[1], true, data?.motivo, profile);
      if (is("POST", /^\/kickoff\/([^/]+)\/restore$/)) return setArchived(tenant, m[1], false, "", profile);
      if (is("GET", /^\/kickoff\/([^/]+)\/bom$/)) return (await refreshBom(tenant, await getKickoff(tenant, m[1]))).bom;
      if (is("POST", /^\/kickoff\/([^/]+)\/bom\/export$/)) return exportBom(tenant, m[1]);
      if (is("POST", /^\/kickoff\/([^/]+)\/aprovacao$/)) return approveKickoff(tenant, m[1], data, profile);
      if (is("POST", /^\/kickoff\/([^/]+)\/blocos\/([^/]+)\/validar$/)) return validarBloco(tenant, m[1], m[2], profile);

      if (method === "GET" && path === "/contratos") {
        if (!canReadContrato(profile)) throw apiError(403, "Sem permissão para consultar contratos.");
        const contratos = (await all(tenant, "contratos"))
          .filter((c) => (!query.kickoff_id || c.kickoff_id === query.kickoff_id) && (!query.client_id || c.client_id === query.client_id))
          .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
        return { contratos, count: contratos.length };
      }
      if (is("POST", /^\/contratos\/gerar$/)) return gerarContrato(tenant, data, profile);
      if (is("POST", /^\/contratos\/([^/]+)\/assinar$/)) return assinarContrato(tenant, m[1], data, profile);
      if (is("GET", /^\/contratos\/([^/]+)\/pdf$/)) {
        if (!canReadContrato(profile)) throw apiError(403, "Sem permissão para consultar contratos.");
        const contrato = await one(tenant, "contratos", m[1]);
        if (!contrato) throw apiError(404, "Contrato nao encontrado.");
        if (contrato.pdf_base64) {
          const bytes = Uint8Array.from(atob(contrato.pdf_base64), (ch) => ch.charCodeAt(0));
          return new Blob([bytes], { type: "application/pdf" });
        }
        if (!contrato.documento) {
          const kickoff = await one(tenant, "kickoffs", contrato.kickoff_id);
          contrato.documento = { clausulas: kickoff ? buildClauses(kickoff) : [], projeto_vinculado: kickoff?.bloco1?.projeto_vinculado || "", emitido_em: contrato.created_at };
        }
        return new Blob([contratoHtml(contrato)], { type: "text/html" });
      }
      if (is("GET", /^\/contratos\/([^/]+)$/)) {
        if (!canReadContrato(profile)) throw apiError(403, "Sem permissão para consultar contratos.");
        const contrato = await one(tenant, "contratos", m[1]);
        if (!contrato) throw apiError(404, "Contrato nao encontrado.");
        return contrato;
      }

      // Produto no PCP é mantido em Cadastros > Produtos (renomeação com histórico,
      // vínculo com cliente, dados de OP). A tela de SKU do ERP só consulta.
      if (/^\/crm\/skus\/[^/]+(\/(meta|descontinuar|orders))?$/.test(path) && ["PUT", "POST"].includes(method)) {
        throw apiError(409, "Produtos são mantidos em Cadastros > Produtos do PCP. Edite, descontinue ou ajuste a meta por lá.");
      }
      if (is("GET", /^\/crm\/skus\/([^/]+)\/saldo$/)) {
        throw apiError(409, "Saldo de produto acabado ainda não é confiável (inventário do Dia D pendente) e não é exibido.");
      }
      if (method === "GET" && path === "/orders") {
        return (await masterAll("pedidos_comerciais")).map(orderView)
          .filter((o) => !query.status || o.status === query.status || o.status_pcp === query.status)
          .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      }
      if (is("POST", /^\/orders\/generator$/)) return createPcpOrder(tenant, data, profile);
      // Pedido Direto do CRM2: cliente e SKU já cadastrados pulam o funil e vão direto ao PCP
      // (mesma permissão do Comercial do PCP: módulo Comercial ou ADM).
      if (is("POST", /^\/orders\/direct$/)) {
        return createPcpOrder(tenant, {
          cliente_id: data?.cliente_id, data_pedido: today(), pedido_cliente_ref: data?.pedido_cliente_ref || "",
          prazo_entrega: data?.prazo_entrega || null, observacoes: data?.observacoes || "",
          items: [{ sku_id: data?.sku_id, qtd: data?.qtd, valor_unitario: data?.valor_unitario }],
        }, profile);
      }
      if (is("POST", /^\/orders\/([^/]+)\/attachments$/)) return attachToOrder(m[1], data, profile);

      return NOT_HANDLED;
    },
  };
}

/* ── CGI: cláusulas e documento para impressão ────────────────────────── */

const brl = (value) => {
  const number = Number(value);
  return `R$ ${(Number.isFinite(number) ? number : 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const dateBr = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
};
const intBr = (value) => (Number(value) || 0).toLocaleString("pt-BR");

// Fase 2.3: o Kickoff nasce antes da cotação, então preço e condição de pagamento
// ainda não existem quando ele é aberto. O CGI sai depois do orçamento aprovado e
// leva os valores dele; sem orçamento, fica o que o Kickoff já tinha.
export function comCondicoesDoOrcamento(kickoff, proposta) {
  const itens = Array.isArray(proposta?.items_pedido) ? proposta.items_pedido : [];
  const item = itens.find((i) => Number(i?.valor_unitario ?? i?.preco_negociado) > 0) || null;
  const b2 = kickoff?.bloco2 || {};
  const preco = item ? Number(item.valor_unitario ?? item.preco_negociado) : Number(b2.preco_venda_cliente_rs_un) || 0;
  const condicao = String(proposta?.condicoes_pagamento || "").trim() || b2.condicao_pagamento || "a_definir";
  return { ...kickoff, bloco2: { ...b2, preco_venda_cliente_rs_un: preco, condicao_pagamento: condicao } };
}

// Cláusulas 1–29 do CGI Kuryos (contratos_routes._build_clauses).
export function buildClauses(kickoff) {
  const b1 = kickoff.bloco1 || {};
  const b2 = kickoff.bloco2 || {};
  const b3 = kickoff.bloco3 || {};
  const produto = b3.nome_tecnico_produto || b1.formula_vinculada || "Produto a definir";
  const volumeTotal = Number(b2.volume_primeiro_pedido) || 0;
  const preco = Number(b2.preco_venda_cliente_rs_un) || 0;
  let pagamento = b2.condicao_pagamento || "a vista";
  if (pagamento === "outro") pagamento = b2.condicao_pagamento_outro || pagamento;
  const incoterm = b2.incoterm || "FOB";
  const F = KURYOS_FABRICANTE;
  return [
    ["CLAUSULA PRIMEIRA - DO OBJETO", `O presente contrato tem por objeto a industrializacao, sob encomenda, do produto <b>${produto}</b>, conforme especificacoes tecnicas detalhadas no Kickoff ${kickoff.numero_kickoff} versao ${kickoff.versao}, anexo a este instrumento.`],
    ["CLAUSULA SEGUNDA - DAS ESPECIFICACOES TECNICAS", "As especificacoes tecnicas do produto, criterios de liberacao de lote, parametros fisico-quimicos, microbiologicos e de embalagem sao aquelas constantes no Bloco 3 e Bloco 4 do Kickoff aprovado, considerando a Ficha Tecnica (FT) e o EPA (Especificacao de Produto Acabado) vigentes na data de emissao deste contrato."],
    ["CLAUSULA TERCEIRA - DAS QUANTIDADES E PRAZOS", `O primeiro pedido contratado corresponde a ${intBr(volumeTotal)} unidades, com volume mensal estimado de ${intBr(b2.volume_estimado_mes)} unidades. O prazo contratado para entrega do primeiro pedido e ${dateBr(b2.data_entrega_contratada)}, com lead time de producao de ${Number(b2.lead_time_producao_dias_uteis) || 0} dias uteis a partir da liberacao formal pelo CONTRATANTE.`],
    ["CLAUSULA QUARTA - DO PRECO E CONDICOES DE PAGAMENTO", `O preco unitario praticado e de ${brl(preco)} por unidade, totalizando ${brl(volumeTotal * preco)} para o primeiro pedido. As condicoes de pagamento sao <b>${pagamento}</b> a contar da emissao da nota fiscal.`],
    ["CLAUSULA QUINTA - DO TRANSPORTE E ENTREGA", `O regime de entrega adotado e <b>${incoterm}</b>. ${incoterm === "CIF" ? `O endereco de entrega declarado e: ${b2.endereco_entrega || ""}.` : "A retirada das mercadorias sera realizada pelo CONTRATANTE diretamente na unidade fabril da FABRICANTE."}`],
    ["CLAUSULA SEXTA - DA PROPRIEDADE INTELECTUAL", "A formulacao desenvolvida pela FABRICANTE permanece de sua exclusiva propriedade industrial, salvo manifestacao expressa em contrario. As marcas, artes, identidade visual e direitos de imagem do CONTRATANTE permanecem de sua propriedade exclusiva."],
    ["CLAUSULA SETIMA - DA QUALIDADE E LIBERACAO DE LOTE", "Cada lote produzido sera submetido aos criterios de liberacao definidos no Bloco 3 do Kickoff. Os ensaios fisico-quimicos e microbiologicos serao realizados conforme plano de amostragem, com retencao obrigatoria de amostra para o periodo definido na especificacao."],
    ["CLAUSULA OITAVA - DA VALIDADE DO PRODUTO", `O prazo de validade do produto acabado e de ${Number(b2.prazo_validade_produto_meses) || 0} meses a contar da data de fabricacao, respeitadas as condicoes de armazenamento previstas no EPA.`],
    ["CLAUSULA NONA - DAS RESPONSABILIDADES DO CONTRATANTE", "Compete ao CONTRATANTE: (i) homologar formalmente as artes de embalagem secundaria e rotulagem; (ii) fornecer registros, notificacoes ou autorizacoes ANVISA, quando aplicavel; (iii) honrar prazos de pagamento; (iv) prover informacoes legais para rotulagem."],
    ["CLAUSULA DECIMA - DAS RESPONSABILIDADES DA FABRICANTE", "A FABRICANTE compromete-se a: (i) cumprir as Boas Praticas de Fabricacao (BPF) aplicaveis a industria cosmetica; (ii) manter sua autorizacao ANVISA vigente; (iii) garantir rastreabilidade integral dos lotes; (iv) entregar produto conforme as especificacoes do Kickoff aprovado."],
    ["CLAUSULA DECIMA PRIMEIRA - DA HOMOLOGACAO DE FORNECEDORES", "A homologacao de fornecedores de materias-primas e materiais de embalagem e prerrogativa da FABRICANTE, que adota processo proprio de qualificacao tecnica, documental e de qualidade, registrado no sistema interno."],
    ["CLAUSULA DECIMA SEGUNDA - DAS ALTERACOES TECNICAS", "Alteracoes em formula, embalagem ou criterios de liberacao apos a aprovacao do Kickoff exigirao nova versao formal do Kickoff, com aprovacao sequencial de Lider de P&D, CQ, Engenharia de Produto e Direcao da FABRICANTE."],
    ["CLAUSULA DECIMA TERCEIRA - DA CONFIDENCIALIDADE", "As partes obrigam-se a manter sigilo absoluto sobre informacoes tecnicas, comerciais e estrategicas trocadas em razao deste contrato, durante sua vigencia e por 5 (cinco) anos apos o termino, sob pena de responder por perdas e danos."],
    ["CLAUSULA DECIMA QUARTA - DA NAO CONCORRENCIA", "A FABRICANTE compromete-se a nao replicar a formulacao especifica desenvolvida sob este contrato para concorrentes diretos do CONTRATANTE, durante sua vigencia, salvo previa autorizacao por escrito."],
    ["CLAUSULA DECIMA QUINTA - DAS GARANTIAS", "A FABRICANTE garante a conformidade do produto com as especificacoes tecnicas durante todo o prazo de validade. Eventuais nao conformidades de fabricacao deverao ser comunicadas em ate 30 (trinta) dias do recebimento, sob pena de decadencia."],
    ["CLAUSULA DECIMA SEXTA - DA RETENCAO DE AMOSTRAS", "A FABRICANTE retera amostras de cada lote produzido pelo prazo definido no Bloco 3 do Kickoff, para fins de controle de qualidade, rastreabilidade e atendimento a eventuais auditorias."],
    ["CLAUSULA DECIMA SETIMA - DA RECUSA DE LOTE", "Lotes que nao atenderem aos criterios de liberacao serao retidos. O CONTRATANTE sera notificado imediatamente para alinhamento de tratativa (re-trabalho, devolucao ou destruicao)."],
    ["CLAUSULA DECIMA OITAVA - DA SUSPENSAO E RESCISAO", "O contrato podera ser rescindido por qualquer das partes, mediante notificacao previa de 60 (sessenta) dias. Inadimplemento contratual de qualquer das partes configurara hipotese de rescisao imediata sem prejuizo das perdas e danos cabiveis."],
    ["CLAUSULA DECIMA NONA - DA INADIMPLENCIA", "O atraso no pagamento sujeitara o CONTRATANTE a multa de 2% (dois por cento) sobre o valor devido, juros de 1% (um por cento) ao mes e correcao monetaria pelo IGP-M ou indice equivalente."],
    ["CLAUSULA VIGESIMA - DA TRIBUTACAO", "Os tributos incidentes sobre a operacao serao suportados na forma da legislacao vigente. O CFOP aplicavel a operacao e o de industrializacao por encomenda, salvo se outro for expressamente acordado."],
    ["CLAUSULA VIGESIMA PRIMEIRA - DAS NOTIFICACOES", "As comunicacoes oficiais entre as partes serao realizadas por meio dos contatos formais cadastrados, preferencialmente por e-mail com confirmacao de recebimento, ou por correspondencia postal com aviso de recebimento."],
    ["CLAUSULA VIGESIMA SEGUNDA - DA CESSAO", "Nenhuma das partes podera ceder, total ou parcialmente, os direitos e obrigacoes decorrentes deste contrato sem previa anuencia por escrito da outra parte."],
    ["CLAUSULA VIGESIMA TERCEIRA - DO CASO FORTUITO E FORCA MAIOR", "Nao havera responsabilizacao das partes por descumprimento decorrente de caso fortuito, forca maior, atos de autoridade ou eventos que estejam fora de seu controle razoavel."],
    ["CLAUSULA VIGESIMA QUARTA - DA INDEPENDENCIA", "Este contrato nao estabelece qualquer vinculo trabalhista, societario ou de representacao comercial entre as partes, que se mantem economicamente e juridicamente independentes."],
    ["CLAUSULA VIGESIMA QUINTA - DA TOLERANCIA", "A tolerancia, por qualquer das partes, quanto ao descumprimento de obrigacao prevista neste contrato nao implicara renuncia, novacao ou alteracao do pactuado."],
    ["CLAUSULA VIGESIMA SEXTA - DA INTEGRALIDADE", "Este instrumento, juntamente com o Kickoff aprovado, FT e EPA vinculados, representa a integralidade do acordo entre as partes, prevalecendo sobre quaisquer entendimentos verbais ou escritos anteriores."],
    ["CLAUSULA VIGESIMA SETIMA - DAS ALTERACOES", "Quaisquer alteracoes ou aditivos a este contrato deverao ser formalizados por escrito e assinados por ambas as partes, registrados no sistema de gestao da FABRICANTE."],
    ["CLAUSULA VIGESIMA OITAVA - DA AUTORIZACAO ANVISA", `A FABRICANTE declara possuir Autorizacao de Funcionamento ANVISA n. ${F.anvisa}, vigente, atendendo aos requisitos sanitarios para fabricacao de produtos cosmeticos.`],
    ["CLAUSULA VIGESIMA NONA - DO FORO", `Fica eleito o foro da ${F.foro}, com renuncia expressa a qualquer outro, por mais privilegiado que seja, para dirimir quaisquer questoes oriundas do presente contrato.`],
  ].map(([titulo, texto]) => ({ titulo, texto }));
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
// Cláusulas usam só <b> como marcação (texto gerado por nós); o resto é escapado.
const clauseHtml = (text) => escapeHtml(text).replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>");

export function contratoHtml(contrato) {
  const c = contrato.contratante || {};
  const f = contrato.fabricante || KURYOS_FABRICANTE;
  const doc = contrato.documento || {};
  const representante = c.representante_nome
    ? `Representante: ${escapeHtml(c.representante_nome)}${c.representante_cargo ? `, ${escapeHtml(c.representante_cargo)}` : ""}${c.representante_cpf ? `, CPF ${escapeHtml(c.representante_cpf)}` : ""}${c.representante_rg ? `, RG ${escapeHtml(c.representante_rg)}` : ""}<br>`
    : "";
  const clausulas = (doc.clausulas || []).map((cl) => `<h3>${escapeHtml(cl.titulo)}</h3><p>${clauseHtml(cl.texto)}</p>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(contrato.numero_contrato)}</title>
<style>
@page{size:A4;margin:18mm 20mm}body{font:10pt/1.45 Manrope,Arial,sans-serif;color:#0f172a;max-width:170mm;margin:0 auto;padding:12mm 0}
h1{font:600 16pt Outfit,Arial,sans-serif;text-align:center;margin:0 0 2mm}h2{font:600 11pt Outfit,Arial,sans-serif;text-align:center;color:#334155;margin:0 0 8mm}
h3{font:600 10pt Outfit,Arial,sans-serif;margin:5mm 0 1.5mm}p{text-align:justify;margin:0 0 2mm}
table.partes{width:100%;border-collapse:collapse;margin-bottom:6mm}table.partes td{border:.5pt solid #cbd5e1;padding:2mm 3mm;vertical-align:top}
table.partes td:first-child{width:32mm;color:#475569;font-weight:600}.assinaturas{page-break-before:always}
.ass{display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin-top:18mm}.linha{border-top:.6pt solid #0f172a;padding-top:2mm}
@media print{.acoes{display:none}}.acoes{position:fixed;top:12px;right:12px}.acoes button{font:600 13px Manrope,Arial;padding:8px 14px;border-radius:8px;border:0;background:#0a1c69;color:#fff;cursor:pointer}
</style></head><body>
<div class="acoes"><button onclick="window.print()">Salvar em PDF / imprimir</button></div>
<h1>CONTRATO GERAL DE INDUSTRIALIZACAO</h1><h2>${escapeHtml(contrato.numero_contrato)}</h2>
<table class="partes"><tr><td>FABRICANTE</td><td><b>${escapeHtml(f.razao_social)}</b><br>CNPJ: ${escapeHtml(f.cnpj)}<br>Endereco: ${escapeHtml(f.endereco)}<br>Autorizacao ANVISA: ${escapeHtml(f.anvisa)}</td></tr>
<tr><td>CONTRATANTE</td><td><b>${escapeHtml(c.razao_social)}</b><br>CNPJ: ${escapeHtml(c.cnpj)}<br>${c.inscricao_estadual ? `Inscricao Estadual: ${escapeHtml(c.inscricao_estadual)}<br>` : ""}${c.endereco_completo ? `Endereco: ${escapeHtml(c.endereco_completo)}<br>` : ""}${representante}</td></tr></table>
<p>As partes acima identificadas, por seus representantes legais, tem, entre si, justa e acordada a celebracao do presente <b>CONTRATO GERAL DE INDUSTRIALIZACAO (CGI)</b>, vinculado ao Kickoff ${escapeHtml(contrato.numero_kickoff)} versao ${escapeHtml(contrato.kickoff_versao)}, do projeto <b>${escapeHtml(doc.projeto_vinculado)}</b>, regendo-se pelas clausulas e condicoes a seguir.</p>
${clausulas}
${contrato.observacoes ? `<h3>OBSERVACOES ADICIONAIS</h3><p>${escapeHtml(contrato.observacoes)}</p>` : ""}
<div class="assinaturas"><h3>DAS ASSINATURAS</h3><p>E por estarem assim justas e contratadas, as partes assinam o presente em duas vias de igual teor e forma, na cidade de Sao Paulo/SP, em ${dateBr(doc.emitido_em || contrato.created_at)}.</p>
<div class="ass"><div class="linha"><b>FABRICANTE</b><br>${escapeHtml(f.razao_social)}<br>CNPJ ${escapeHtml(f.cnpj)}</div><div class="linha"><b>CONTRATANTE</b><br>${escapeHtml(c.razao_social)}<br>CNPJ ${escapeHtml(c.cnpj)}</div></div>
<div class="ass"><div class="linha"><b>TESTEMUNHA 1</b><br>Nome: ____________________ CPF: ______________</div><div class="linha"><b>TESTEMUNHA 2</b><br>Nome: ____________________ CPF: ______________</div></div>
${contrato.assinatura ? `<p style="margin-top:10mm;color:#475569">Assinatura registrada no sistema em ${dateBr(contrato.assinatura.assinado_em)} por ${escapeHtml(contrato.assinatura.assinado_por_nome)}${contrato.assinatura.assinatura_ref ? ` (ref. ${escapeHtml(contrato.assinatura.assinatura_ref)})` : ""}.</p>` : ""}
</div></body></html>`;
}
