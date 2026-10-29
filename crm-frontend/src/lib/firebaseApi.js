import { get, push, ref, remove, runTransaction, set, update } from "firebase/database";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { firebaseAuth, firebaseDb, firebaseStorage } from "@/lib/firebase";
import {
  findDuplicateClient, findDuplicateProject, findDuplicateSample, hasAnyRole, isAdmin, isComercial, movementEntry,
  formulaRegistrada, normalizeName, planMove, stageLabel, stageRequirements,
} from "@/lib/crmRules";
import { askJustification, isJustificationRequired } from "@/lib/justificationPrompt";
import { createCommercialRouter, NOT_HANDLED } from "@/lib/firebaseCommercial";
import { categoriasAtivas } from "@/lib/categoriasProduto";
import { sugestoesCli4 } from "@/lib/cli4";
import { amostraDaVersaoFaltando, precoUsd, volumeEmKg } from "@/lib/pdAmostra";
import { eventoMpNova, htmlFichaTecnica, montarFichaTecnica, validarMpNova } from "@/lib/fichaTecnica";
import { solicitacoesDeMpsNovas } from "@/lib/filaCadastroMp";
import { filtrarMateriaisPd, tiposDoFiltro } from "@/lib/materiaPrimaPd";
import { erroNaoFecha, fechamentoFormula, pendenciasDoLote } from "@/lib/fechamentoFormula";
import { baseVigente, planoDaBase, substituicoesForaDaFragrancia } from "@/lib/formulacaoBase";
import { contatosDoCliente, entradaHistoricoAprovacao, validarAprovacaoCliente } from "@/lib/aprovacaoCliente";
import { acrescentarHistorico } from "@/lib/historicoTimeline";
import { liberarEtapaPd } from "@/lib/servidor";
import { cotacaoDaFormula, situacao as situacaoCambio, validarSpread } from "@/lib/cambio";
import { validarLeitura } from "@/lib/estabilidade";
import { CATALOGO_PADRAO, mesclarCatalogo, validarTipoComponente } from "@/lib/tiposComponente";
import { aplicarDecisao, novaSolicitacao, podeSolicitar, textoDecisao, validarDecisao } from "@/lib/liberacaoAntecipada";
import {
  EVENTO_RETRABALHO, PD_FECHADO, SOLICITANTES, entradaRetrabalhos, marcaDesatualizado, validarPedidoRetrabalho, variacaoEmRetrabalho,
} from "@/lib/retrabalhoAprovada";
import { TRECHO_AMOSTRA, etapaPelaAmostra, passosAte } from "@/lib/etapaPelaAmostra";
import { bloqueioPdComCliente, cardParaSolicitacao, cardsVisiveis, entradaHistoricoSync, rotaDeBancada, statusComercialPeloPd, statusPeloRetornoDoCliente } from "@/lib/pdCards";
import {
  anoDe, caminhoContadorProjeto, codigoVariacao, formatarNumeroProjeto, numeroAmostra, proximoIndiceAmostra, sequenciaDoNumero,
} from "@/lib/numeracaoProjeto";

/* Adaptador Firebase do CRM/P&D incorporado ao PCP Kuryos.
 * Consolidado em 13/10/2026 a partir do bundle publicado
 * (public/static/js/9752.masterintegration20261008.chunk.js), que recebeu
 * edições diretas entre 07 e 08/10 (paridade P&D, espelho CRM3 <-> P&D,
 * integração com o cadastro mestre). Trechos sem alteração voltaram ao texto
 * original; trechos editados mantêm a lógica publicada byte a byte, com os
 * nomes de topo restaurados. Variáveis locais curtas vêm do minificador. */

const ROOT = "erp";

const CRM_CONSTANTS = {
  canal_origem: ["indicacao", "instagram", "site", "evento", "prospeccao_ativa", "cliente_recorrente", "outro"],
  canal_origem_grupos: {
    prospeccao_ativa_digital: ["linkedin", "instagram", "email", "whatsapp"],
    indicacao: ["indicacao_cliente", "indicacao_parceiro"],
    inbound_digital: ["site", "instagram", "google"],
    outros: ["evento", "cliente_recorrente", "outro"],
  },
  temperatura_lead: ["quente", "morno", "frio"],
  segmento: ["marca_propria", "varejo", "distribuidor", "influenciador", "clinica", "outro"],
  porte: ["micro", "pequeno", "medio", "grande"],
  cargo_decisor: ["socio", "diretor", "gerente", "compras", "marketing", "outro"],
  ufs: ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"],
  project_posicionamento: ["entrada", "massivo", "premium", "luxo"],
  project_tipo_servico: ["desenvolvimento_completo", "adaptacao_formula", "industrializacao", "private_label"],
  project_restricoes_tecnicas: ["vegano", "natural", "sem_parabenos", "sem_sulfatos", "hipoalergenico"],
  sample_tipos: ["nova_formula", "adaptacao_de_formula", "benchmark", "ajuste"],
  sample_unidades: ["g", "ml", "un"],
  stage_labels: {
    prospeccao: "Prospecção", qualificado: "Qualificado", projeto_em_discussao: "Projeto em Discussão",
    negociacao: "Negociação", cliente_fechado: "Cliente Fechado", cliente_perdido: "Cliente Perdido",
    amostra_solicitada: "Amostra Solicitada", amostra_em_desenvolvimento: "Amostra em Desenvolvimento",
    amostra_enviada: "Amostra Enviada", kickoff: "Kickoff", cotacao: "Cotação", orcamento_completo: "Orçamento Completo",
    em_negociacao: "Em Negociação", pedido_aprovado: "Pedido Aprovado",
    projeto_arquivado: "Projeto Arquivado",
  },
};

function apiError(status, detail) {
  const error = new Error(typeof detail === "string" ? detail : detail?.message || "Erro no Firebase");
  error.response = { status, data: { detail } };
  return error;
}

function clean(value) {
  if (Array.isArray(value)) return value.map(clean).filter((item) => item !== undefined);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, clean(item)]));
  }
  return value;
}

function id() {
  return globalThis.crypto?.randomUUID?.() || push(ref(firebaseDb, "_ids")).key;
}

function now() { return new Date().toISOString(); }

function collectionPath(tenantId, collection) { return `${ROOT}/${tenantId}/${collection}`; }

async function all(tenantId, collection) {
  const value = (await get(ref(firebaseDb, collectionPath(tenantId, collection)))).val() || {};
  return Object.entries(value).map(([key, item]) => ({ id: item?.id || key, ...(item || {}) }));
}

async function one(tenantId, collection, itemId) {
  const value = (await get(ref(firebaseDb, `${collectionPath(tenantId, collection)}/${itemId}`))).val();
  return value ? { id: value.id || itemId, ...value } : null;
}

async function save(tenantId, collection, itemId, value) {
  const document = clean({ ...value, id: itemId, tenant_id: tenantId });
  await set(ref(firebaseDb, `${collectionPath(tenantId, collection)}/${itemId}`), document);
  return document;
}

async function patch(tenantId, collection, itemId, values) {
  const current = await one(tenantId, collection, itemId);
  if (!current) throw apiError(404, "Registro não encontrado.");
  return save(tenantId, collection, itemId, { ...current, ...clean(values), updated_at: now() });
}

async function erase(tenantId, collection, itemId) {
  await remove(ref(firebaseDb, `${collectionPath(tenantId, collection)}/${itemId}`));
}

async function create(tenantId, collection, values) {
  const itemId = id();
  return save(tenantId, collection, itemId, { ...values, created_at: values?.created_at || now(), updated_at: now() });
}

async function related(tenantId, collection, field, value) {
  return (await all(tenantId, collection)).filter((item) => item[field] === value);
}

async function masterAll(e) {
  const t = (await get(ref(firebaseDb, e))).val() || {};
  return Object.entries(t).map(([e, t]) => ({
    id: (null === t || void 0 === t ? void 0 : t.id) || e,
    ...(t || {})
  }));
}

async function masterOne(e, t) {
  const a = (await get(ref(firebaseDb, `${e}/${t}`))).val();
  return a ? {
    id: a.id || t,
    ...a
  } : null;
}

async function masterWrite(e, t, a) {
  const r = clean({
    ...a
  });
  return await set(ref(firebaseDb, `${e}/${t}`), r), {
    id: t,
    ...r
  };
}

function onlyDigits(e) {
  return String(e || "").replace(/\D/g, "");
}

function masterClientAsCrm(e, t, a) {
  const r = t.nome || t.nomeFantasia || t.razaoSocial || e,
    i = `${r}|${onlyDigits(t.cnpj)}|${t.contatoComNome || ""}|${t.contatoComEmail || ""}|${t.contatoComTelefone || ""}|${t.cidade || ""}|${t.uf || ""}|${false !== t.ativo}`;
  return {
    ...(a || {}),
    id: (null === a || void 0 === a ? void 0 : a.id) || e,
    cadastro_cliente_id: e,
    cli4: t.codigo || e,
    nome_empresa: r,
    nome_fantasia: r,
    cnpj: t.cnpj || "",
    contato_principal: {
      ...((null === a || void 0 === a ? void 0 : a.contato_principal) || {}),
      nome: t.contatoComNome || (null === a || void 0 === a ? void 0 : a.contato_principal && a.contato_principal.nome) || "",
      email: t.contatoComEmail || (null === a || void 0 === a ? void 0 : a.contato_principal && a.contato_principal.email) || "",
      whatsapp: t.contatoComTelefone || (null === a || void 0 === a ? void 0 : a.contato_principal && a.contato_principal.whatsapp) || ""
    },
    contato_tecnico: {
      nome: t.contatoTecNome || "",
      email: t.contatoTecEmail || "",
      telefone: t.contatoTecTelefone || ""
    },
    cidade: t.cidade || "",
    regiao: t.uf || (null === a || void 0 === a ? void 0 : a.regiao) || "",
    site: t.site || (null === a || void 0 === a ? void 0 : a.site) || "",
    condicao_pagamento: t.condicaoPagamento || "",
    ativo: false !== t.ativo,
    stage: (null === a || void 0 === a ? void 0 : a.stage) || "cliente_fechado",
    origem_integracao: "cadastro_clientes",
    master_sync_signature: i,
    created_at: (null === a || void 0 === a ? void 0 : a.created_at) || now(),
    updated_at: now()
  };
}

async function syncMasterClients(e) {
  const [t, a] = await Promise.all([masterAll("clientes"), all(e, "crm_clients")]),
    r = new Map(a.map(e => [e.cadastro_cliente_id, e])),
    i = new Map(a.filter(e => onlyDigits(e.cnpj)).map(e => [onlyDigits(e.cnpj), e]));
  for (const o of t) {
    const t = r.get(o.id) || i.get(onlyDigits(o.cnpj)) || null,
      a = masterClientAsCrm(o.id, o, t),
      s = (null === t || void 0 === t ? void 0 : t.id) || o.id;
    (!t || t.master_sync_signature !== a.master_sync_signature || t.cadastro_cliente_id !== o.id) && (await save(e, "crm_clients", s, {
      ...a,
      id: s
    }));
  }
  return all(e, "crm_clients");
}

function masterMaterialCategory(e) {
  return ["EP", "ES", "ET"].includes(e) ? "embalagem" : "mp";
}

async function integratedMaterials(e) {
  const [t, a, r, i, o] = await Promise.all([masterAll("materiais"), masterAll("estoque"), masterAll("fornecedores"), masterAll("pedidos_compra"), all(e, "pd_catalog")]),
    s = new Map(a.map(e => [e.id, e])),
    n = new Map(r.map(e => [e.id, e])),
    d = new Map();
  for (const e of i) for (const t of Object.values(e.itens || {})) {
    const a = t.materialCodigo;
    a && Number(t.precoUnit || t.custoUnitarioNaDecisao || 0) > 0 && (!d.has(a) || String(e.criadoEm || e.dataCriacao || "") > String(d.get(a).date || "")) && d.set(a, {
      price: Number(t.precoUnit || t.custoUnitarioNaDecisao),
      date: e.criadoEm || e.dataCriacao || "",
      unit: t.unidade || t.unidadeCotada || ""
    });
  }
  const c = new Map(o.map(e => [e.master_material_id || e.codigo_interno, e])),
    g = t.filter(e => false !== e.ativo).map(e => {
      const t = c.get(e.id) || {},
        a = s.get(e.id) || {},
        r = d.get(e.id) || {},
        i = Object.entries(e.fornecedores || {}).map(([e, t]) => ({
          id: e,
          fornecedor_id: e,
          fornecedor_nome: (n.get(e) || {}).nomeFantasia || (n.get(e) || {}).razaoSocial || e,
          codigo_fornecedor: t.codigoFornecedor || "",
          nome_comercial: t.nomeComercial || ""
        }));
      return {
        ...t,
        id: t.id || e.id,
        master_material_id: e.id,
        codigo_interno: e.mpCodigo || e.id,
        nome: e.mpNome || e.nome || e.id,
        descricao: e.mpNome || e.nome || e.id,
        inci: e.inci || e.nomeInci || "",
        categoria: t.categoria || masterMaterialCategory(e.tipo),
        tipo_material: e.tipo || "",
        unidade: e.unidade || e.unidadeCompra || "un",
        unidade_compra: e.unidadeCompra || e.unidade || "un",
        fornecedores: i,
        fornecedor: i.map(e => e.fornecedor_nome).filter(Boolean).join(", "),
        preco_rs_kg: Number(t.preco_rs_kg || ("kg" === String(r.unit || e.unidadeCompra || e.unidade).toLowerCase() ? r.price : 0) || 0),
        ultimo_preco_pago: Number(r.price || 0) || null,
        ultima_compra_em: r.date || null,
        estoque_sistema: Number(a.saldoAtual || 0),
        estoque_conferido: !1,
        especificacoes_tecnicas: e.especificacoesTecnicas || "",
        origem_integracao: "cadastro_materiais",
        read_only_master: !0
      };
    }),
    b = new Set(g.map(e => e.id));
  return [...g, ...o.filter(e => !b.has(e.id) && !e.master_material_id)];
}

function contains(e, t, a) {
  if (!t) return !0;
  const r = String(t).toLocaleLowerCase("pt-BR");
  return a.some(t => String(t.split(".").reduce((e, t) => null === e || void 0 === e ? void 0 : e[t], e) || "").toLocaleLowerCase("pt-BR").includes(r));
}

function response(e, t) {
  return {
    data: e,
    status: 200,
    statusText: "OK",
    headers: {},
    config: t
  };
}

function normalizePdCard(e) {
  return {
    ...e,
    numero_completo: e.numero_completo || e.amostra_codigo || e.amostra_numero || "",
    produto: e.produto || e.nome_produto || e.titulo || "",
    cliente: e.cliente || e.cliente_nome || "",
    descricao_aplicacao: e.descricao_aplicacao || e.projeto_nome || "",
    responsavel_pd: e.responsavel_pd || ""
  };
}

const PD_STATUS_TO_CARD = {
    OPEN: "solicitado",
    IN_PROGRESS: "em_desenvolvimento",
    IN_TESTS: "em_testes",
    WAITING_APPROVAL: "aguardando_aprovacao",
    APPROVED: "aprovado",
    REJECTED: "retrabalho_interno",
    COMPLETED: "concluido"
  },
  PD_CARD_TO_STATUS = {
    solicitado: "OPEN",
    em_desenvolvimento: "IN_PROGRESS",
    em_testes: "IN_TESTS",
    aguardando_aprovacao: "WAITING_APPROVAL",
    aprovado: "APPROVED",
    retrabalho_interno: "REJECTED",
    concluido: "COMPLETED"
  },
  PD_STATUS_LABELS = {
    OPEN: "Aberto",
    IN_PROGRESS: "Em Desenvolvimento",
    IN_TESTS: "Em Testes",
    WAITING_APPROVAL: "Aguardando Aprovação",
    APPROVED: "Aprovado",
    REJECTED: "Retrabalho",
    COMPLETED: "Plano Futuro"
  },
  PD_ALLOWED_TRANSITIONS = {
    OPEN: ["IN_PROGRESS"],
    IN_PROGRESS: ["IN_TESTS"],
    IN_TESTS: ["WAITING_APPROVAL"],
    WAITING_APPROVAL: ["APPROVED", "REJECTED"],
    APPROVED: ["COMPLETED"],
    REJECTED: ["IN_PROGRESS"],
    COMPLETED: []
  },
  PD_BACKWARD_TRANSITIONS = {
    IN_PROGRESS: "OPEN",
    IN_TESTS: "IN_PROGRESS",
    WAITING_APPROVAL: "IN_TESTS",
    APPROVED: "WAITING_APPROVAL"
  },
  PD_STABILITY_CONDITIONS = [{
    code: "ambient",
    label: "Ambiente",
    temperature: "25°C",
    humidity: "60% UR",
    checkpoints: [1, 2, 7, 30, 60, 90]
  }, {
    code: "oven_45",
    label: "Estufa 45°C",
    temperature: "45°C",
    humidity: "Controlada",
    checkpoints: [1, 2, 7, 30, 60, 90]
  }, {
    code: "freezer_minus5",
    label: "Freezer -5°C",
    temperature: "-5°C",
    humidity: "N/A",
    checkpoints: [1, 2, 7, 30, 60, 90]
  }, {
    code: "light_exposure",
    label: "Exposição a Luz",
    temperature: "25°C",
    humidity: "60% UR",
    checkpoints: [1, 2, 7, 30, 60, 90]
  }, {
    code: "freeze_thaw",
    label: "Ciclo Freeze/Thaw",
    temperature: "-5°C ↔ 40°C",
    humidity: "Cíclico",
    checkpoints: [1, 2, 7, 15]
  }],
  PD_STABILITY_PARAMETERS = [["appearance", "Aspecto"], ["color", "Cor"], ["odor", "Odor"], ["ph", "pH"], ["viscosity", "Viscosidade"], ["density", "Densidade"], ["spreadability", "Espalhabilidade"], ["separation", "Separação de fases"], ["precipitation", "Precipitação"], ["microbiology", "Microbiologia"], ["package_compatibility", "Compatibilidade com embalagem"], ["mass_variation", "Variação de massa"]].map(([code, label]) => ({
    code,
    label
  }));

function pdUserName(e) {
  return e.nome || e.name || e.email || "Usuário Kuryos";
}

// Fase 5: dólar ao vivo. O servidor grava config/cambio a cada 15 min; aqui fica em
// cache por 30 s para não ler o banco em cada chamada.
let cambioAtual = null;
let cambioLidoEm = 0;
async function lerCambio(forcar = false) {
  if (!forcar && Date.now() - cambioLidoEm < 30000) return cambioAtual;
  cambioAtual = (await get(ref(firebaseDb, "config/cambio"))).val() || null;
  cambioLidoEm = Date.now();
  return cambioAtual;
}
const taxaDaFormula = (formula) => cotacaoDaFormula(formula, cambioAtual).taxa;

function pdItemCosts(e, t) {
  const a = Number(e.percentage || 0),
    r = Number(e.price_per_kg || 0),
    i = precoUsd(e),
    o = Number(t || 6),
    s = null == i || Number.isNaN(i) ? r : i * o;
  return {
    cost_brl: Number((a / 100 * s).toFixed(6)),
    cost_kg_usd: null == i || Number.isNaN(i) ? 0 : i,
    cost_brl_via_cambio: null == i || Number.isNaN(i) ? null : Number(s.toFixed(4))
  };
}

function pdEnrichFormula(formula, t) {
  // Fórmula acompanha o dólar (ou a cotação fixada nela); cotacao_usd_gravada guarda o que estava no banco.
  const cot = cotacaoDaFormula(formula, cambioAtual);
  const e = { ...formula, cotacao_usd: cot.taxa, cotacao_usd_origem: cot.origem, cotacao_usd_gravada: formula.cotacao_usd ?? null };
  const a = t.map(t => ({
      ...t,
      ...pdItemCosts(t, e.cotacao_usd)
    })),
    r = a.reduce((e, t) => e + Number(t.cost_brl || 0), 0),
    i = Number(e.volume || 0),
    o = volumeEmKg(i, e.volume_unit),
    s = r * (o > 0 ? o : 1),
    n = Number(e.indice_perdas || 0);
  return {
    ...e,
    items: a.map(e => ({
      ...e,
      cost_percentage: r > 0 ? Number((Number(e.cost_brl || 0) / r * 100).toFixed(2)) : 0
    })),
    total_cost_per_kg: Number(r.toFixed(4)),
    custo_unitario: Number(s.toFixed(2)),
    custo_com_perdas: Number((s * (1 + n / 100)).toFixed(2))
  };
}

function pdFormulaCostData(e) {
  if (!e || !e.length) return null;
  const t = [...e].sort((e, t) => Number(t.version || 0) - Number(e.version || 0))[0],
    a = Number(t.total_cost_per_kg || 0),
    r = Number(t.volume || 0),
    i = volumeEmKg(r, t.volume_unit),
    o = a * (i > 0 ? i : 1),
    s = Number(t.indice_perdas || 0);
  return {
    total_cost_per_kg: Number(a.toFixed(4)),
    total_price_sum: Number((t.items || []).reduce((e, t) => e + Number(t.price_per_kg || 0), 0).toFixed(2)),
    custo_unitario: Number(o.toFixed(2)),
    custo_com_perdas: Number((o * (1 + s / 100)).toFixed(2)),
    cotacao_usd: Number(t.cotacao_usd || 6),
    volume: r,
    volume_unit: t.volume_unit || "mL",
    indice_perdas: s
  };
}

function pdCostVersions(e, t) {
  const a = {
      ingredient_cost_auto: Number(t || 0),
      ingredient_cost_manual: 0,
      total: Number(t || 0),
      notes: "",
      status: "rascunho",
      submitted_at: null,
      submitted_by_name: null,
      ...((null === e || void 0 === e ? void 0 : e.v1) || {})
    },
    r = null === e || void 0 === e ? void 0 : e.v2;
  return {
    v1: a,
    v2: r || null,
    total_final: null === e || void 0 === e ? void 0 : e.total_final,
    updated_at: null === e || void 0 === e ? void 0 : e.updated_at,
    pd_cost_blank: "rascunho" === a.status && !a.submitted_at && !Number(a.ingredient_cost_auto || 0) && !Number(a.ingredient_cost_manual || 0) && !a.notes,
    pd_cost_analysis_required: "rascunho" === a.status && !a.submitted_at && !Number(a.ingredient_cost_auto || 0) && !Number(a.ingredient_cost_manual || 0) && !a.notes
  };
}

function pdFlattenSnapshot(e, t = "", a = {}) {
  if (Array.isArray(e)) e.forEach((e, r) => pdFlattenSnapshot(e, `${t}[${r}]`, a));else if (e && "object" === typeof e) Object.keys(e).sort().forEach(r => pdFlattenSnapshot(e[r], t ? `${t}.${r}` : r, a));else t && (a[t] = null == e ? null : e);
  return a;
}

function pdSampleBatch(e, t, a) {
  const r = String(e.nome || "").trim(),
    i = String(e.formula_base_id || "").trim(),
    o = Number(e.volume_base_ml || 0),
    s = Number(e.perda_operacional_percent || 0),
    n = Array.isArray(e.variantes) ? e.variantes : [];
  if (!r) throw apiError(400, "Nome do lote obrigatório.");
  if (!i) throw apiError(400, "Fórmula base obrigatória.");
  if (!(o > 0)) throw apiError(400, "volume_base_ml deve ser maior que zero.");
  if (s < 0 || s >= 100) throw apiError(400, "perda_operacional_percent deve estar entre 0 e 99,9999.");
  if (!n.length) throw apiError(400, "Adicione ao menos uma amostra derivada.");
  const d = n.map((e, t) => ({
      ...e,
      id: e.id || id(),
      nome: String(e.nome || `Variante ${t + 1}`).trim(),
      versao: Math.max(Number(e.versao || 1), 1),
      overrides: e.overrides || []
    })),
    g = d.map(e => e.nome.toLowerCase());
  if (new Set(g).size !== g.length) throw apiError(400, "Os nomes das variantes não podem se repetir.");
  const b = Number(null == e.base_total_volume_ml ? o * d.length : e.base_total_volume_ml),
    $ = e.max_derivacoes ? Number(e.max_derivacoes) : null,
    S = Math.floor(b * (1 - s / 100) / o),
    q = null == $ ? S : Math.min(S, $),
    j = d.length;
  if (!(b > 0) || q <= 0) throw apiError(400, "A base informada não gera nenhuma derivação útil.");
  if (j > q) throw apiError(400, `A base suporta no máximo ${q} derivações e foram informadas ${j}.`);
  const O = String(e.status_base || "ativa").toLowerCase(),
    y = String(e.status_qualidade || "aprovada").toLowerCase(),
    R = q - j,
    A = Number((j * o).toFixed(4)),
    C = Number(Math.max(b - A, 0).toFixed(4)),
    x = [];
  "ativa" !== O && x.push(`status_base_${O}`);
  "aprovada" !== y && x.push(`qualidade_${y}`);
  R <= 0 && x.push("capacidade_esgotada");
  C < o && x.push("volume_insuficiente");
  e.validade_base && new Date(`${e.validade_base}T23:59:59`) < new Date() && x.push("validade_expirada");
  return {
    ...e,
    id: a || e.id || id(),
    development_id: t,
    nome: r,
    formula_base_id: i,
    volume_base_ml: o,
    base_total_volume_ml: b,
    perda_operacional_percent: s,
    allowed_change_scopes: e.allowed_change_scopes && e.allowed_change_scopes.length ? e.allowed_change_scopes : ["cor", "ativo", "fragrancia"],
    base_reference_ingredients: Array.isArray(e.base_reference_ingredients) ? e.base_reference_ingredients : [],
    status_base: O,
    status_qualidade: y,
    variantes: d,
    derivadas_count: j,
    capacidade_maxima_derivacoes: q,
    capacidade_restante_derivacoes: Math.max(R, 0),
    volume_consumido_ml: A,
    volume_disponivel_ml: C,
    bloqueado_para_novas_derivacoes: !!x.length,
    motivos_bloqueio: x,
    updated_at: now()
  };
}

async function pdDeleteRequestCascade(e, t) {
  const a = (await all(e, "pd_developments")).filter(e => e.request_id === t || e.pd_request_id === t),
    r = new Set(a.map(e => e.id)),
    i = (await all(e, "pd_formulas")).filter(e => r.has(e.development_id)),
    o = new Set(i.map(e => e.id)),
    s = (await all(e, "pd_stability_studies")).filter(e => e.request_id === t || e.pd_request_id === t || e.pd_card_id === t),
    n = new Set(s.map(e => e.id)),
    d = (await all(e, "pd_document_versions")).filter(e => e.request_id === t || e.pd_request_id === t),
    g = new Set(d.map(e => e.id));
  for (const [a, i] of [["pd_formula_items", e => o.has(e.formula_id)], ["pd_formula_phases", e => o.has(e.formula_id)], ["pd_formula_costs", e => o.has(e.formula_id)], ["pd_formulas", e => r.has(e.development_id)], ["pd_tests", e => r.has(e.development_id)], ["pd_samples", e => r.has(e.development_id)], ["pd_sample_batches", e => r.has(e.development_id)], ["pd_approvals", e => r.has(e.development_id)], ["pd_costs", e => r.has(e.development_id)], ["pd_cost_versions", e => r.has(e.development_id)], ["pd_documents", e => r.has(e.development_id)], ["pd_lab_results", e => r.has(e.development_id)], ["pd_developments", e => r.has(e.id)], ["pd_request_status_history", e => e.request_id === t || e.pd_request_id === t], ["pd_pending_items", e => e.request_id === t || e.pd_request_id === t], ["pd_updates", e => e.request_id === t || e.pd_request_id === t], ["pd_purchase_requests", e => e.request_id === t || e.pd_request_id === t], ["pd_stability_readings", e => n.has(e.study_id)], ["pd_stability_studies", e => e.request_id === t || e.pd_request_id === t || e.pd_card_id === t], ["workflow_tasks", e => "pd_document" === e.entity_type && g.has(e.entity_id)], ["pd_document_versions", e => e.request_id === t || e.pd_request_id === t], ["pd_ficha_tecnica", e => e.request_id === t || e.pd_request_id === t || r.has(e.development_id)], ["pd_cards", e => e.pd_request_id === t]]) for (const r of (await all(e, a)).filter(i)) await erase(e, a, r.id);
  await erase(e, "pd_requests", t);
}

// Status comercial da variação (CRM3) que acompanha o status do P&D, com a entrada no
// histórico; {} quando não muda (pdCards.statusComercialPeloPd).
function statusComercialDaVariacao(variacao, statusPd, cardStatus, label, em) {
  const status = statusComercialPeloPd(variacao.status, statusPd);
  if (!status) return {};
  return {
    status,
    historico_status: [...(variacao.historico_status || []), entradaHistoricoSync(variacao.status, status, cardStatus, label, em)],
  };
}

async function pdSyncRequestStatus(e, t, a) {
  const d0 = a,
    r = PD_STATUS_TO_CARD[a] || "solicitado",
    i = PD_STATUS_LABELS[a] || a,
    o = (await all(e, "pd_cards")).filter(e => e.pd_request_id === t.id),
    s = new Map();
  for (const i of o) {
    await patch(e, "pd_cards", i.id, {
      status_pd: r,
      status: a
    });
    const o = i.amostra_id || i.crm_sample_id,
      n = i.amostra_variacao_id || i.crm_variacao_id;
    o && n && s.set(`${o}:${n}`, {
      sampleId: o,
      variationId: n
    });
  }
  const n = t.crm_sample_id || t.linked_amostra_id,
    d = t.crm_variacao_id || t.linked_variacao_id;
  n && d && s.set(`${n}:${d}`, {
    sampleId: n,
    variationId: d
  });
  for (const {
    sampleId: t,
    variationId: a
  } of s.values()) {
    const o = await one(e, "crm_samples", t);
    if (o && Array.isArray(o.variacoes)) {
      const t = o.variacoes.map(e => e.id === a ? {
        ...e,
        ...statusComercialDaVariacao(e, d0, r, i, now()),
        status_pd_raw: r,
        status_pd_label: i,
        updated_at: now()
      } : e);
      await patch(e, "crm_samples", o.id, {
        variacoes: t
      });
    }
  }
}

// Espelho de status P&D -> cards P&D e variações do CRM3, chamado em toda listagem.
// Calcula as diferenças em memória e grava tudo numa única atualização multi-caminho
// (antes eram leituras/gravações em sequência por solicitação). Vínculo com amostra
// ou variação inexistente é ignorado — antes contava como "diferente" para sempre e
// refazia o trabalho a cada abertura (com os dados migrados do Mongo, o CRM3 não abria).
// Também traz de volta o retorno do cliente no CRM3 (pdCards.js, Fase 1.6): P&D
// esperando o cliente + variação aprovada → Aprovado; retrabalho/reprovada →
// Retrabalho, com registro no histórico da solicitação. Solicitação sem card
// ganha card.
async function pdReconcileStatusMirrors(tenantId) {
  const [requests, cards, samples, projects, developments, approvals] = await Promise.all([
    all(tenantId, "pd_requests"), all(tenantId, "pd_cards"), all(tenantId, "crm_samples"),
    all(tenantId, "crm_projects"), all(tenantId, "pd_developments"), all(tenantId, "pd_approvals"),
  ]);
  const sampleById = new Map(samples.map((sample) => [sample.id, sample]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const cardsByRequest = new Map();
  for (const card of cards) {
    if (!cardsByRequest.has(card.pd_request_id)) cardsByRequest.set(card.pd_request_id, []);
    cardsByRequest.get(card.pd_request_id).push(card);
  }
  const at = now();
  const updates = {};
  const aprovadasAgora = [];
  const variationOf = (sid, vid) => {
    const sample = sampleById.get(sid);
    return sample && Array.isArray(sample.variacoes) ? sample.variacoes.find((v) => v && v.id === vid) || null : null;
  };
  for (const request of requests) {
    const linked = new Map();
    for (const card of cardsByRequest.get(request.id) || []) {
      const sampleId = card.amostra_id || card.crm_sample_id;
      const variationId = card.amostra_variacao_id || card.crm_variacao_id;
      if (sampleId && variationId) linked.set(`${sampleId}:${variationId}`, [sampleId, variationId]);
    }
    const sampleId = request.crm_sample_id || request.linked_amostra_id;
    const variationId = request.crm_variacao_id || request.linked_variacao_id;
    if (sampleId && variationId) linked.set(`${sampleId}:${variationId}`, [sampleId, variationId]);

    let status = request.status || "OPEN";
    const retornoDe = (v) => statusPeloRetornoDoCliente(status, v.status, { aguardandoDesde: request.aguardando_cliente_desde, resultadoEm: v.resultado_em });
    const retorno = [...linked.values()].map(([sid, vid]) => variationOf(sid, vid)).find((v) => v && retornoDe(v));
    const novoStatus = retorno ? retornoDe(retorno) : null;
    if (novoStatus) {
      const requestBase = `${collectionPath(tenantId, "pd_requests")}/${request.id}`;
      updates[`${requestBase}/status`] = novoStatus;
      updates[`${requestBase}/updated_at`] = at;
      updates[`${collectionPath(tenantId, "pd_request_status_history")}/${id()}`] = {
        request_id: request.id, pd_request_id: request.id, from_status: status, to_status: novoStatus,
        comment: `Retorno do cliente no CRM3 (${retorno.codigo || "variação"}: ${retorno.status})`,
        changed_by: "sistema", changed_by_name: "Retorno do cliente (CRM3)", created_at: at, updated_at: at, user_id: "sistema",
      };
      const development = developments.find((d) => d.request_id === request.id || d.pd_request_id === request.id);
      if (novoStatus === "APPROVED" && development) {
        const approval = approvals.find((a) => a.development_id === development.id);
        const approvalId = approval ? approval.id : id();
        const approvalBase = `${collectionPath(tenantId, "pd_approvals")}/${approvalId}`;
        if (!approval) {
          updates[approvalBase] = { id: approvalId, development_id: development.id, request_id: request.id, approved_by_client: true, approved_at: at, created_at: at, updated_at: at, notes: "Aprovada pelo cliente no CRM3" };
        } else {
          updates[`${approvalBase}/approved_by_client`] = true;
          updates[`${approvalBase}/approved_at`] = approval.approved_at || at;
          updates[`${approvalBase}/updated_at`] = at;
        }
      }
      status = novoStatus;
      if (novoStatus === "APPROVED") aprovadasAgora.push(request.id);
    }

    const cardStatus = PD_STATUS_TO_CARD[status] || "solicitado";
    const label = PD_STATUS_LABELS[status] || status || "Aberto";
    const requestCards = cardsByRequest.get(request.id) || [];
    for (const card of requestCards) {
      if (card.status_pd !== cardStatus || card.status !== status) {
        const base = `${collectionPath(tenantId, "pd_cards")}/${card.id}`;
        updates[`${base}/status_pd`] = cardStatus;
        updates[`${base}/status`] = status;
        updates[`${base}/updated_at`] = at;
      }
    }
    if (!requestCards.length) {
      const amostra = sampleById.get(sampleId) || null;
      const projeto = projectById.get(request.crm_project_id || request.linked_projeto_id || amostra?.projeto_id) || null;
      const card = cardParaSolicitacao({ ...request, status }, { amostra, projeto, cardStatus, agora: at });
      updates[`${collectionPath(tenantId, "pd_cards")}/${card.id}`] = { ...card, tenant_id: tenantId };
    }
    for (const [sid, vid] of linked.values()) {
      const sample = sampleById.get(sid);
      const index = sample && Array.isArray(sample.variacoes) ? sample.variacoes.findIndex((v) => v && v.id === vid) : -1;
      if (index < 0) continue;
      const variation = sample.variacoes[index];
      // O retorno do cliente processado acima já entra aqui (retrabalho → REJECTED → retrabalho).
      const comercial = statusComercialDaVariacao(variation, status, cardStatus, label, at);
      if (variation.status_pd_raw === cardStatus && variation.status_pd_label === label && !comercial.status) continue;
      const base = `${collectionPath(tenantId, "crm_samples")}/${sid}/variacoes/${index}`;
      if (comercial.status) {
        updates[`${base}/status`] = comercial.status;
        updates[`${base}/historico_status`] = comercial.historico_status;
      }
      updates[`${base}/status_pd_raw`] = cardStatus;
      updates[`${base}/status_pd_label`] = label;
      updates[`${base}/updated_at`] = at;
    }
  }
  if (Object.keys(updates).length) await update(ref(firebaseDb), updates);
  for (const requestId of aprovadasAgora) await enfileirarSemTravar(tenantId, requestId, "Retorno do cliente (CRM3)");
  // Revisão (16/10): fila que falhou antes (permissão, rede) é tentada de novo a cada abertura do quadro.
  for (const request of requests) {
    if (request.fila_mp_nova_falhou_em && !aprovadasAgora.includes(request.id)) await enfileirarSemTravar(tenantId, request.id, "Nova tentativa da fila");
  }
}

async function pdFullDetail(e, t) {
  const a = (await all(e, "pd_developments")).find(e => e.request_id === t.id || e.pd_request_id === t.id) || null,
    r = null === a || void 0 === a ? void 0 : a.id,
    i = async t => (await all(e, t)).filter(e => e.development_id === r),
    o = r ? await i("pd_formulas") : [],
    s = new Set(o.map(e => e.id)),
    n = (await all(e, "pd_formula_items")).filter(e => s.has(e.formula_id)),
    d = o.map(e => pdEnrichFormula(e, n.filter(t => t.formula_id === e.id))).sort((e, t) => Number(t.version || 0) - Number(e.version || 0)),
    u = r ? await i("pd_approvals") : [],
    l = (await all(e, "pd_pending_items")).filter(e => e.request_id === t.id || e.pd_request_id === t.id),
    _ = (await all(e, "pd_request_status_history")).filter(e => e.request_id === t.id || e.pd_request_id === t.id).sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))),
    g = t.crm_sample_id || t.linked_amostra_id ? await one(e, "crm_samples", t.crm_sample_id || t.linked_amostra_id) : null,
    P = g && Array.isArray(g.variacoes) ? g.variacoes.find(e => e.id === (t.crm_variacao_id || t.linked_variacao_id)) || null : null,
    b = g ? {
      ...g,
      _source: "crm_sample",
      _amostra_id: g.id,
      _variacao_id: null === P || void 0 === P ? void 0 : P.id,
      _variacao_codigo: null === P || void 0 === P ? void 0 : P.codigo,
      nome_cliente: g.cliente_nome || t.client_name || "",
      nome_projeto: g.projeto_nome || t.project_name || "",
      produto: g.produto || g.nome_produto || t.project_name || "",
      observacoes: (null === P || void 0 === P ? void 0 : P.observacoes_especificas) || g.observacao_tecnica || "",
      outras_observacoes: (null === P || void 0 === P ? void 0 : P.observacoes_especificas) || "",
      feedback_cliente: (null === P || void 0 === P ? void 0 : P.feedback_cliente) || g.feedback_cliente || "",
      direcoes_retrabalho: (null === P || void 0 === P ? void 0 : P.direcoes_retrabalho) || g.direcoes_retrabalho || "",
      resultado_cliente: (null === P || void 0 === P ? void 0 : P.resultado_cliente) || (null === P || void 0 === P ? void 0 : P.resultado) || g.resultado || ""
    } : null,
    $ = pdFormulaCostData(d),
    S = r ? (await i("pd_cost_versions"))[0] || null : null,
    q = r ? (await i("pd_lab_results"))[0] || (null === a || void 0 === a ? void 0 : a.lab_results) || null : null;
  return {
    request: g ? {
      ...t,
      category: t.category || g.categoria || "",
      description: t.description || g.briefing_especifico || "",
      objectives: t.objectives || g.objetivo_projeto || "",
      references: t.references || g.referencia_formula || "",
      deadline: t.deadline || g.prazo_entrega_cliente || ""
    } : t,
    development: a,
    formulas: d,
    tests: r ? (await i("pd_tests")).sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))) : [],
    samples: r ? (await i("pd_samples")).sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))) : [],
    approvals: u,
    approval: u[0] || null,
    costs: r ? (await i("pd_costs"))[0] || {
      ingredient_cost: 0,
      packaging_cost: 0,
      labor_cost: 0,
      total_cost: 0
    } : {
      ingredient_cost: 0,
      packaging_cost: 0,
      labor_cost: 0,
      total_cost: 0
    },
    documents: r ? (await i("pd_documents")).sort((e, t) => String(t.uploaded_at || t.created_at || "").localeCompare(String(e.uploaded_at || e.created_at || ""))) : [],
    updates: (await all(e, "pd_updates")).filter(e => e.request_id === t.id || e.pd_request_id === t.id).sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))),
    pending_items: l,
    pending: l.map(e => ({
      ...e,
      status_calc: "pendente" === e.status && e.data_prevista && new Date(e.data_prevista) < new Date() ? "atrasado" : e.status
    })),
    status_history: _,
    history: _,
    client_info: b,
    formula_cost_data: $,
    cost_versions: pdCostVersions(S, null === $ || void 0 === $ ? void 0 : $.total_cost_per_kg),
    lab_results: q,
    blocking_tasks: []
  };
}

async function createPdFlow(e, t, a, r, i, o) {
  var s;
  const d = id(),
    c = id(),
    u = id(),
    _ = now(),
    m = await save(e, "pd_requests", d, {
      project_name: t.nome_produto || t.nome_amostra,
      title: t.nome_produto || t.nome_amostra,
      client_id: (null === i || void 0 === i ? void 0 : i.id) || "",
      client_name: (null === i || void 0 === i ? void 0 : i.nome_empresa) || t.cliente_nome || "",
      crm_project_id: (null === r || void 0 === r ? void 0 : r.id) || t.projeto_id,
      crm_sample_id: t.id,
      crm_variacao_id: a.id,
      category: t.categoria || (null === r || void 0 === r ? void 0 : r.categoria) || "",
      description: t.briefing_especifico || (null === r || void 0 === r ? void 0 : r.briefing_resumido) || "",
      objectives: t.objetivo_projeto || (null === r || void 0 === r ? void 0 : r.ideia_conceito) || "",
      references: t.referencia_formula || (null === r || void 0 === r ? void 0 : r.referencia_mercado) || "",
      restrictions: Array.isArray(null === r || void 0 === r ? void 0 : r.restricoes_tecnicas) ? r.restricoes_tecnicas.join(", ") : "",
      deadline: t.prazo_entrega_cliente || (null === r || void 0 === r ? void 0 : r.prazo_desejado_amostra) || "",
      status: "OPEN",
      priority: t.prioridade || "Normal",
      request_type: "CLIENT",
      created_by: null === (s = firebaseAuth.currentUser) || void 0 === s ? void 0 : s.uid,
      created_by_name: o.nome || o.name || o.email,
      created_at: _,
      updated_at: _
    });
  await save(e, "pd_developments", c, {
    request_id: d,
    status: "OPEN",
    created_at: _,
    updated_at: _
  });
  return {
    request: m,
    card: await save(e, "pd_cards", u, {
      pd_request_id: d,
      development_id: c,
      projeto_id: (null === r || void 0 === r ? void 0 : r.id) || t.projeto_id,
      amostra_id: t.id,
      amostra_variacao_id: a.id,
      amostra_numero: t.numero_amostra || "",
      amostra_codigo: a.codigo || t.numero_amostra || "",
      numero_completo: a.codigo || t.numero_amostra || "",
      titulo: m.project_name,
      nome_produto: m.project_name,
      produto: m.project_name,
      cliente_nome: m.client_name,
      cliente: m.client_name,
      descricao_aplicacao: a.descricao_aplicacao || "",
      briefing_base: t.briefing_base || t.briefing_especifico || "",
      observacoes_especificas: a.observacoes_especificas || "",
      responsavel_pd: t.responsavel_pd || "",
      prazo_prometido: t.prazo_entrega_cliente || (null === r || void 0 === r ? void 0 : r.prazo_desejado_amostra) || "",
      projeto_nome: (null === r || void 0 === r ? void 0 : r.nome_projeto) || t.projeto_nome || "",
      status_pd: "solicitado",
      created_at: _,
      updated_at: _
    })
  };
}


/* ── Funil comercial: regras do ERP + regras do PCP Kuryos (13/10/2026) ── */

const CARD_COLLECTIONS = { client: "crm_clients", project: "crm_projects", sample: "crm_samples" };

function requireAdmin(profile, action) {
  if (!isAdmin(profile)) throw apiError(403, `${action} é exclusivo do administrador.`);
}

// 428: a tela não mandou justificativa para voltar o card. O cliente do
// adaptador pede a justificativa ao usuário e repete a chamada.
function justificationRequired(detail, opcoes = {}) {
  return apiError(428, { code: "JUSTIFICATIVA_REQUIRED", message: detail, ...opcoes });
}

// AMO-02: projeto da amostra (solicitação do P&D ligada ao CRM2), ou null em amostra avulsa.
async function projetoDoDesenvolvimento(tenantId, devId) {
  const dev = await one(tenantId, "pd_developments", devId);
  const req = dev ? await one(tenantId, "pd_requests", dev.request_id || dev.pd_request_id) : null;
  return { projetoId: req?.crm_project_id || req?.linked_projeto_id || null, request: req };
}

// AMO-02: no lote, variação só troca a fragrância; a base vira (ou reaproveita) uma versão da
// formulação base do projeto, e o lote guarda qual versão usou. Amostra sem projeto: só o lote.
async function aplicarBaseDoProjeto(tenantId, devId, lote, profile) {
  const nomesDaBase = (lote.base_reference_items || []).map((i) => i.nome);
  const foraDaFragrancia = substituicoesForaDaFragrancia(lote.variantes, nomesDaBase);
  if (foraDaFragrancia.length) throw apiError(422, foraDaFragrancia.join(" "));
  const { projetoId, request } = await projetoDoDesenvolvimento(tenantId, devId);
  if (!projetoId) return lote;
  const plano = planoDaBase(await related(tenantId, "pd_formulacoes_base", "projeto_id", projetoId), lote.base_reference_items);
  if (plano.acao === "nenhuma") return lote;
  let base = plano.base;
  if (plano.acao === "criar") {
    const versao = await nextSequence(collectionPath(tenantId, `sequences/formulacao_base_${projetoId}`));
    base = await create(tenantId, "pd_formulacoes_base", {
      projeto_id: projetoId, versao, itens: plano.itens,
      origem: { development_id: devId, amostra: request?.internal_code || "", lote: lote.nome || "" },
      criado_por: firebaseAuth.currentUser.uid, criado_por_nome: pdUserName(profile), criado_em: now(),
    });
  }
  return { ...lote, formulacao_base_id: base.id, formulacao_base_versao: Number(base.versao) || 1, projeto_id: projetoId };
}

// AMO-03: fórmula vigente e variantes dos lotes ativos precisam fechar 100%. Fórmula sem
// itens fica com a regra RN-PD-02 da etapa; lote bloqueado/encerrado não é entregue, fica fora.
async function conferirFechamentoPd(tenantId, request, development) {
  const cache = new Map();
  const itensDe = async (formulaId) => {
    if (!cache.has(formulaId)) cache.set(formulaId, await related(tenantId, "pd_formula_items", "formula_id", formulaId));
    return cache.get(formulaId);
  };
  const vigente = (await related(tenantId, "pd_formulas", "development_id", development.id))
    .sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0];
  const itensVigente = vigente ? await itensDe(vigente.id) : [];
  const fechamento = itensVigente.length ? { nome: `v${vigente.version || 1}`, ...fechamentoFormula(itensVigente) } : null;
  const pendencias = [];
  for (const lote of await related(tenantId, "pd_sample_batches", "development_id", development.id)) {
    if (!lote.formula_base_id || (lote.status_base && lote.status_base !== "ativa")) continue;
    pendencias.push(...pendenciasDoLote(lote, await itensDe(lote.formula_base_id)));
  }
  if ((!fechamento || fechamento.ok) && !pendencias.length) return;
  const responsavel = request.assigned_to_name || vigente?.created_by_name || "";
  throw apiError(422, erroNaoFecha({ formula: fechamento, pendencias, responsavel }));
}

async function auditCard(tenantId, action, entityType, entityId, before, after, profile) {
  await create(tenantId, "audit_log", {
    action, entity_type: entityType, entity_id: entityId, before: before || null, after: after || null,
    user_id: firebaseAuth.currentUser?.uid || "", user_name: profile?.name || profile?.nome || profile?.email || "",
  });
}

async function projectHasApprovedSample(tenantId, projectId) {
  const samples = (await all(tenantId, "crm_samples")).filter((sample) => sample.projeto_id === projectId);
  return samples.some((sample) => sample.stage === "aprovada"
    || (sample.variacoes || []).some((v) => v.status === "aprovada" || v.resultado_cliente === "aprovada"));
}

// Fase 2.3: a cotação sai do Kickoff aprovado (versão vigente).
async function projectKickoffApproved(tenantId, projectId) {
  return (await all(tenantId, "kickoffs")).some((k) => k.projeto_id === projectId && k.status === "aprovado");
}

async function nextSequence(path) {
  const result = await runTransaction(ref(firebaseDb, path), (current) => (Number(current) || 0) + 1);
  const value = Number(result?.snapshot?.val());
  if (!result?.committed || !Number.isFinite(value)) throw apiError(409, `Não foi possível reservar o próximo número em ${path}. Nada foi gravado — tente de novo.`);
  return value;
}

// Fase 2.2: todo projeto tem número (2026-031); quem ainda não tem ganha o próximo do ano.
async function ensureNumeroProjeto(tenantId, project) {
  if (sequenciaDoNumero(project?.numero_projeto)) return project.numero_projeto;
  const ano = anoDe(project?.created_at);
  const numero = formatarNumeroProjeto(ano, await nextSequence(caminhoContadorProjeto(tenantId, ano)));
  await update(ref(firebaseDb), { [`${collectionPath(tenantId, "crm_projects")}/${project.id}/numero_projeto`]: numero });
  project.numero_projeto = numero;
  return numero;
}

// Fase 4: cliente aprovou → cada MP nova da fórmula aprovada vira tarefa no Cadastros do PCP
// (solicitacoes_cadastro_material/, raiz do banco). Só grava a que ainda não existe.
async function enfileirarMpsNovas(tenantId, requestId, autor) {
  const request = await one(tenantId, "pd_requests", requestId);
  const dev = request ? (await all(tenantId, "pd_developments")).find((d) => d.request_id === requestId || d.pd_request_id === requestId) : null;
  const formula = dev ? (await related(tenantId, "pd_formulas", "development_id", dev.id)).sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0] : null;
  if (!formula) return 0;
  const itens = await related(tenantId, "pd_formula_items", "formula_id", formula.id);
  if (!itens.some((i) => i.mp_nova)) return 0;
  const projetoId = request.crm_project_id || request.linked_projeto_id;
  const projeto = projetoId ? await one(tenantId, "crm_projects", projetoId) : null;
  const fila = solicitacoesDeMpsNovas({ request, formula, itens, projeto, agora: now(), autor });
  const updates = {};
  for (const [chave, tarefa] of Object.entries(fila)) {
    if (!(await masterOne("solicitacoes_cadastro_material", chave))) updates[`solicitacoes_cadastro_material/${chave}`] = tarefa;
  }
  if (Object.keys(updates).length) await update(ref(firebaseDb), updates);
  return Object.keys(updates).length;
}

// A aprovação do cliente não pode falhar por causa da fila; o erro fica visível no console
// e a solicitação fica marcada (fila_mp_nova_falhou_em) para nova tentativa ao abrir o quadro.
async function enfileirarSemTravar(tenantId, requestId, autor) {
  const marca = `${collectionPath(tenantId, "pd_requests")}/${requestId}/fila_mp_nova_falhou_em`;
  try {
    const n = await enfileirarMpsNovas(tenantId, requestId, autor);
    await update(ref(firebaseDb), { [marca]: null }).catch(() => {});
    return n;
  } catch (error) {
    console.error(`[Fila de cadastro] MPs novas da solicitação ${requestId} não entraram na fila do Cadastros:`, error);
    await update(ref(firebaseDb), { [marca]: now() }).catch(() => {});
    return 0;
  }
}

// Fase 3: histórico das MPs novas (retrabalho troca a MP; a antiga fica no log).
async function logMpNova(tenantId, antes, depois, formula, profile) {
  const evento = eventoMpNova(antes, depois);
  if (!evento || !formula) return;
  const dev = await one(tenantId, "pd_developments", formula.development_id);
  await create(tenantId, "pd_mp_novas_log", {
    ...evento, formula_id: formula.id, formula_version: Number(formula.version) || 1, development_id: formula.development_id || null,
    request_id: dev ? dev.request_id || dev.pd_request_id || null : null, item_id: (depois || antes)?.id || null,
    ingrediente: (depois || antes)?.ingredient_name || "", by: firebaseAuth.currentUser?.uid || "", by_name: pdUserName(profile),
  });
}

// Fase 3: Ficha Técnica no modelo das fichas (Mochi Blur), a partir da Manipulação.
async function fichaTecnicaHtml(tenantId, requestId, comCustos) {
  const request = await one(tenantId, "pd_requests", requestId);
  if (!request) throw apiError(404, "Solicitação P&D não encontrada.");
  const dev = (await all(tenantId, "pd_developments")).find((d) => d.request_id === requestId || d.pd_request_id === requestId) || null;
  const formula = dev ? (await related(tenantId, "pd_formulas", "development_id", dev.id)).sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0] || null : null;
  const itens = formula ? (await related(tenantId, "pd_formula_items", "formula_id", formula.id)).map((item) => ({ ...item, ...pdItemCosts(item, taxaDaFormula(formula)) })) : [];
  const fases = formula ? await related(tenantId, "pd_formula_phases", "formula_id", formula.id) : [];
  const analise = (await related(tenantId, "pd_ficha_tecnica", "request_id", requestId))[0] || (await related(tenantId, "pd_ficha_tecnica", "pd_request_id", requestId))[0] || {};
  const html = htmlFichaTecnica(montarFichaTecnica({ request, formula, itens, fases, analise }), { comCustos });
  return new Blob([html], { type: "text/html;charset=utf-8" });
}

// Fase 2.1: de qual solicitação P&D é o registro que a rota de bancada altera.
async function pdBancadaRequest(tenantId, alvo) {
  let devId = alvo.tipo === "development" ? alvo.id : null;
  if (!devId) {
    let formulaId = alvo.tipo === "formula" ? alvo.id : null;
    if (alvo.tipo === "item") formulaId = (await one(tenantId, "pd_formula_items", alvo.id))?.formula_id;
    if (alvo.tipo === "phase") formulaId = (await one(tenantId, "pd_formula_phases", alvo.id))?.formula_id;
    devId = formulaId ? (await one(tenantId, "pd_formulas", formulaId))?.development_id : null;
  }
  const dev = devId ? await one(tenantId, "pd_developments", devId) : null;
  const requestId = dev && (dev.request_id || dev.pd_request_id);
  return requestId ? one(tenantId, "pd_requests", requestId) : null;
}

// Validações do funil (transição, justificativa, requisitos da etapa). Roda antes
// dos ganchos do comercial para a mensagem certa aparecer primeiro.
async function checkMove(tenantId, entity, cardId, data, profile) {
  const collection = CARD_COLLECTIONS[entity];
  const record = await one(tenantId, collection, cardId);
  if (!record) throw apiError(404, "Registro não encontrado.");
  const from = record.stage;
  const to = data.stage;
  const plan = planMove({
    entity, from, to, profile, justificativa: data.justificativa,
    motivoPerda: data.motivo_perda, motivoArquivamento: data.motivo_arquivamento,
  });
  if (!plan.ok) {
    if (plan.status === 400 && /Justificativa obrigatória/.test(plan.detail)) throw justificationRequired(plan.detail);
    throw apiError(plan.status, plan.detail);
  }
  const context = entity === "project" ? {
    hasApprovedSample: await projectHasApprovedSample(tenantId, cardId),
    kickoffApproved: await projectKickoffApproved(tenantId, cardId),
  } : {};
  const missing = stageRequirements(entity, record, to, context);
  if (missing.length && !isAdmin(profile)) {
    throw apiError(409, `Preencha antes de avançar para ${stageLabel(to)}: ${missing.join(", ")}`);
  }
  return { collection, record, from, to, plan, missing };
}

async function moveCard(tenantId, entity, cardId, data, profile, extraDispensed = []) {
  const { collection, record, from, to, plan, missing } = await checkMove(tenantId, entity, cardId, data, profile);
  const at = now();
  const entry = movementEntry({ from, to, profile, uid: firebaseAuth.currentUser?.uid, at, plan });
  if (missing.length || extraDispensed.length) entry.requisitos_dispensados = [...missing, ...extraDispensed];
  const updates = { stage: to, updated_at: at, historico_movimentacoes: [...(record.historico_movimentacoes || []), entry] };
  if (entity === "client" && to === "cliente_perdido") updates.motivo_perda = String(data.motivo_perda).trim().toLowerCase();
  if (entity === "project" && to === "projeto_arquivado") updates.motivo_arquivamento = String(data.motivo_arquivamento).trim();
  if (entity === "project" && to === "amostra_em_desenvolvimento" && !record.data_inicio_desenvolvimento) updates.data_inicio_desenvolvimento = at;
  if (entity === "project" && to === "amostra_enviada") updates.data_envio_amostra = at;
  const updated = await patch(tenantId, collection, cardId, updates);
  await auditCard(tenantId, `${entity}_moved`, entity, cardId, { stage: from }, { stage: to, justificativa: entry.justificativa || null, administrativo: Boolean(entry.administrativo) }, profile);
  return { updated, entry, from, to };
}

// Etapa do projeto pareada com a amostra (lib/etapaPelaAmostra.js): anda para a frente pelo
// mesmo caminho do arrastar no CRM2 (validações, Kickoff criado na etapa Kickoff). Etapa que
// recusar (ex.: fórmula ainda não registrada) para ali, sem erro. Só quem move o CRM2 move aqui.
// Movimento automático nunca usa a dispensa do ADM: requisito que falta segura a etapa.
async function moverProjeto(tenantId, projectId, stage, profile) {
  const data = { stage };
  const { missing } = await checkMove(tenantId, "project", projectId, data, profile);
  if (missing.length) throw apiError(409, `Falta para ${stageLabel(stage)}: ${missing.join(", ")}`);
  const dispensed = await commercial.beforeProjectMove(tenantId, projectId, stage, profile);
  if (dispensed.length) throw apiError(409, `Falta para ${stageLabel(stage)}: ${dispensed.join(", ")}`);
  const moved = await moveCard(tenantId, "project", projectId, data, profile, dispensed);
  const extra = await commercial.afterProjectMove(tenantId, moved.updated, profile);
  return { moved, extra };
}

async function parearEtapasPelaAmostra(tenantId, profile, apenasProjeto = null) {
  if (!isComercial(profile)) return [];
  const projetos = (await all(tenantId, "crm_projects"))
    .filter((p) => (!apenasProjeto || p.id === apenasProjeto) && TRECHO_AMOSTRA.slice(0, -1).includes(p.stage || ""));
  if (!projetos.length) return [];
  const [amostras, solicitacoes] = await Promise.all([all(tenantId, "crm_samples"), all(tenantId, "pd_requests")]);
  const statusPd = new Map(solicitacoes.map((r) => [r.id, r.status || "OPEN"]));
  const movidos = [];
  for (const projeto of projetos) {
    const variacoes = amostras.filter((a) => a.projeto_id === projeto.id).flatMap((a) => (a.variacoes || []).filter(Boolean)
      .map((v) => ({ ...v, status_pd: statusPd.get(v.pd_request_id) || null })));
    for (const etapa of passosAte(projeto.stage, etapaPelaAmostra(variacoes))) {
      try {
        await moverProjeto(tenantId, projeto.id, etapa, profile);
        movidos.push({ projeto: projeto.id, etapa });
      } catch (error) {
        console.info(`[CRM2] ${projeto.numero_projeto || projeto.id} fica antes de ${etapa}: ${error?.response?.data?.detail || error?.message || error}`);
        break;
      }
    }
  }
  return movidos;
}

async function crmDependents(tenantId, entity, cardId) {
  if (entity === "client") {
    const projects = (await all(tenantId, "crm_projects")).filter((p) => p.cliente_id === cardId);
    const ids = new Set(projects.map((p) => p.id));
    const samples = (await all(tenantId, "crm_samples")).filter((s) => ids.has(s.projeto_id) || s.cliente_id === cardId);
    return { projects, samples };
  }
  if (entity === "project") {
    return { projects: [], samples: (await all(tenantId, "crm_samples")).filter((s) => s.projeto_id === cardId) };
  }
  return { projects: [], samples: [] };
}

async function deleteSampleCascade(tenantId, sample) {
  for (const variation of sample.variacoes || []) {
    if (variation.pd_request_id) await pdDeleteRequestCascade(tenantId, variation.pd_request_id).catch(() => null);
    if (variation.pd_card_id) await erase(tenantId, "pd_cards", variation.pd_card_id);
  }
  await erase(tenantId, "crm_samples", sample.id);
}

async function deleteCard(tenantId, entity, cardId, profile, cascade) {
  requireAdmin(profile, "Excluir cards");
  const collection = CARD_COLLECTIONS[entity];
  const record = await one(tenantId, collection, cardId);
  if (!record) throw apiError(404, "Registro não encontrado.");
  const { projects, samples } = await crmDependents(tenantId, entity, cardId);
  if ((projects.length || samples.length) && !cascade) {
    throw apiError(409, `Este card tem ${projects.length} projeto(s) e ${samples.length} amostra(s) vinculados. Confirme a exclusão em cascata.`);
  }
  for (const sample of samples) await deleteSampleCascade(tenantId, sample);
  for (const project of projects) await erase(tenantId, "crm_projects", project.id);
  if (entity === "sample") await deleteSampleCascade(tenantId, record);
  else await erase(tenantId, collection, cardId);
  await auditCard(tenantId, `${entity}_deleted`, entity, cardId, record, { cascade: Boolean(cascade), projetos: projects.length, amostras: samples.length }, profile);
  return { deleted: true, deleted_projects: projects.length, deleted_samples: samples.length };
}

const ADMIN_EDIT_LOCKED = new Set(["id", "tenant_id", "created_at", "created_by", "historico_movimentacoes"]);

async function adminEditCard(tenantId, entity, cardId, values, profile) {
  requireAdmin(profile, "Editar cards pelo painel administrativo");
  const collection = CARD_COLLECTIONS[entity];
  const record = await one(tenantId, collection, cardId);
  if (!record) throw apiError(404, "Registro não encontrado.");
  const changes = Object.fromEntries(Object.entries(values || {}).filter(([key]) => !ADMIN_EDIT_LOCKED.has(key)));
  const justificativa = String(changes.justificativa || "").trim();
  delete changes.justificativa;
  if (!justificativa) throw apiError(400, "Informe o motivo da edição administrativa.");
  const at = now();
  const history = [...(record.historico_movimentacoes || [])];
  if (changes.stage && changes.stage !== record.stage) {
    history.push({
      ...movementEntry({ from: record.stage, to: changes.stage, profile, uid: firebaseAuth.currentUser?.uid, at, plan: { administrativo: true, justificativa } }),
      edicao_administrativa: true,
    });
  }
  const before = Object.fromEntries(Object.keys(changes).map((key) => [key, record[key] ?? null]));
  const updated = await patch(tenantId, collection, cardId, { ...changes, historico_movimentacoes: history, updated_at: at });
  await auditCard(tenantId, `${entity}_admin_edit`, entity, cardId, before, { ...changes, justificativa }, profile);
  return updated;
}

// Orçamento → Kickoff → CGI → SKU → pedido no PCP (src/lib/firebaseCommercial.js).
const commercial = createCommercialRouter({
  all, one, save, patch, create, related, masterAll, masterOne, masterWrite, apiError, now, newId: id, auditCard, syncMasterClients,
  ensureNumeroProjeto, justificationRequired, lerCambio,
  // Chamada interna a outra rota do adaptador (ex.: gerar o EPA do P&D na aprovação do Kickoff).
  call: (method, url, data) => dispatch(method, url, data, {}),
});

async function dispatch(e, t) {
  var a;
  let r = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {},
    i = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : {};
  const {
      profile: u,
      tenantId: _
    } = await async function () {
      const e = firebaseAuth.currentUser;
      if (!e) throw apiError(401, "Sess\xe3o expirada.");
      const t = (await get(ref(firebaseDb, `usuarios/${e.uid}`))).val() || {};
      return {
        authUser: e,
        profile: t,
        tenantId: t.tenant_id || "kuryos"
      };
    }(),
    $ = new URL(t, "https://firebase.local"),
    S = $.pathname.replace(/^\/api/, ""),
    q = {
      ...Object.fromEntries($.searchParams),
      ...(i.params || {})
    },
    j = e => S.match(e);
  try { await lerCambio(); } catch { /* sem cotação: as fórmulas usam a gravada ou o padrão */ }
  if ("GET" === e && "/auth/me" === S) return response(u, i);
  if ("GET" === e && "/config/cambio" === S) return response({ ...situacaoCambio(await lerCambio(true), now()), cambio: cambioAtual }, i);
  if ("PUT" === e && "/config/cambio/spread" === S) {
    requireAdmin(u, "Definir o spread do dólar");
    const v = validarSpread(r.spread);
    if (v.erro) throw apiError(422, v.erro);
    await update(ref(firebaseDb), { "config/cambio/spread_pct": v.spread, "config/cambio/spread_atualizado_por": pdUserName(u), "config/cambio/spread_atualizado_em": now() });
    return response({ ...situacaoCambio(await lerCambio(true), now()), cambio: cambioAtual }, i);
  }
  {
    const adminList = S.match(/^\/crm\/admin\/cards\/(client|project|sample)$/);
    if ("GET" === e && adminList) {
      requireAdmin(u, "Painel administrativo de cards");
      return response(await all(_, CARD_COLLECTIONS[adminList[1]]), i);
    }
    const adminCard = S.match(/^\/crm\/admin\/cards\/(client|project|sample)\/([^/]+)$/);
    if (adminCard && "PUT" === e) return response(await adminEditCard(_, adminCard[1], adminCard[2], r, u), i);
    if (adminCard && "DELETE" === e) return response(await deleteCard(_, adminCard[1], adminCard[2], u, ["1", "true"].includes(String(q.cascade))), i);
    if (adminCard && "GET" === e) {
      requireAdmin(u, "Painel administrativo de cards");
      const record = await one(_, CARD_COLLECTIONS[adminCard[1]], adminCard[2]);
      if (!record) throw apiError(404, "Registro não encontrado.");
      return response({ record, dependents: await crmDependents(_, adminCard[1], adminCard[2]), audit: (await all(_, "audit_log")).filter((x) => x.entity_id === adminCard[2]) }, i);
    }
  }
  {
    const bancada = ["POST", "PUT", "DELETE"].includes(e) ? rotaDeBancada(e, S) : null;
    if (bancada) {
      const pedido = await pdBancadaRequest(_, bancada);
      const trava = pedido && bloqueioPdComCliente(pedido.status, { admin: isAdmin(u) });
      if (trava) throw apiError(423, trava);
    }
  }
  {
    const handled = await commercial.route({ method: e, path: S, query: q, data: r, profile: u, tenant: _ });
    if (handled !== NOT_HANDLED) return response(handled, i);
  }
  if ("GET" === e && ("/crm/users-list" === S || "/users" === S)) return response(await async function () {
    // usuarios/ só abre para admin/RH; os demais leem o índice público (nome + papel).
    const e = (await get(ref(firebaseDb, "usuarios")).catch(() => get(ref(firebaseDb, "usuarios_publico")))).val() || {};
    return Object.entries(e).map(e => {
      let [t, a] = e;
      return {
        id: t,
        uid: t,
        name: a.name || a.nome || a.email,
        email: a.email,
        role: a.role
      };
    });
  }(), i);
  // CRM-01: categorias de interesse = Cadastros › Categorias de produto, lidas a cada chamada
  // (categoria nova no Cadastros aparece no CRM sem deploy).
  if ("GET" === e && "/crm/constants" === S) return response({
    ...CRM_CONSTANTS, categorias_produto: categoriasAtivas((await get(ref(firebaseDb, "config/categoriasProduto"))).val()),
  }, i);
  if ("GET" === e && "/crm/clients" === S) {
    let e = await syncMasterClients(_);
    return q.search && (e = e.filter(e => contains(e, q.search, ["nome_empresa", "cnpj", "contato_principal.nome", "contato_principal.email"]))), response(e.sort((e, t) => String(t.updated_at || t.created_at).localeCompare(String(e.updated_at || e.created_at))), i);
  }
  if ("POST" === e && "/crm/clients" === S) {
    const duplicate = findDuplicateClient(await syncMasterClients(_), r);
    if (duplicate) throw apiError(409, `Cliente já cadastrado: ${duplicate.nome_empresa || duplicate.nome} (${duplicate.cnpj || "sem CNPJ"}).`);
    const e = id();
    return response(await save(_, "crm_clients", e, {
      ...r,
      stage: "prospeccao",
      created_at: now(),
      updated_at: now(),
      created_by: firebaseAuth.currentUser.uid
    }), i);
  }
  let O = j(/^\/crm\/clients\/([^/]+)\/full$/);
  if ("GET" === e && O) {
    const e = await one(_, "crm_clients", O[1]);
    if (!e) throw apiError(404, "Cliente n\xe3o encontrado.");
    return response(await async function (e, t) {
      const a = (await all(e, "crm_projects")).filter(e => e.cliente_id === t.id),
        r = new Set(a.map(e => e.id)),
        i = (await all(e, "crm_samples")).filter(e => r.has(e.projeto_id)),
        o = (await all(e, "orders")).filter(e => e.cliente_id === t.id);
      return {
        client: t,
        projects: a,
        samples: i,
        orders: o,
        summary: {
          total_projetos: a.length,
          projetos_ativos: a.filter(e => !["pedido_aprovado", "projeto_arquivado"].includes(e.stage)).length,
          total_amostras: i.length,
          item_mais_pedido: ""
        }
      };
    }(_, e), i);
  }
  if (O = j(/^\/crm\/clients\/([^/]+)\/move$/), "PUT" === e && O) {
    const moved = await moveCard(_, "client", O[1], r, u);
    return response({
      ...moved.updated,
      client: moved.updated,
      from_stage: stageLabel(moved.from),
      to_stage: moved.to,
      movement: moved.entry,
      trigger_batch_projects: "projeto_em_discussao" === moved.to
    }, i);
  }
  // CRM-02: a rota vivia DEPOIS de /crm/clients/:id, que a capturava (id "suggest-cli4" → null) e o
  // campo engolia o erro. Fica antes, e devolve { sugestoes } livres. Só leitura (sem sync).
  if ("GET" === e && "/crm/clients/suggest-cli4" === S) {
    const [mestres, crm] = await Promise.all([masterAll("clientes"), all(_, "crm_clients")]);
    const taken = new Set([...mestres.flatMap(c => [c.codigo, c.id]), ...crm.filter(c => c.id !== q.cliente_id).map(c => c.cli4)].filter(Boolean).map(c => String(c).toUpperCase()));
    return response({ sugestoes: sugestoesCli4(q.nome || "", taken).map(cli4 => ({ cli4, disponivel: true })) }, i);
  }
  if (O = j(/^\/crm\/clients\/([^/]+)$/), O && "GET" === e) return response(await one(_, "crm_clients", O[1]), i);
  if (O && "DELETE" === e) return response(await deleteCard(_, "client", O[1], u, ["1", "true"].includes(String(q.cascade))), i);
  if (O && "PUT" === e) return response(await patch(_, "crm_clients", O[1], r), i);
  if ("GET" === e && "/crm/projects" === S) {
    try { await parearEtapasPelaAmostra(_, u); } catch (error) { console.error("[CRM2] pareamento com a amostra falhou:", error); }
    let e = await all(_, "crm_projects");
    return q.search && (e = e.filter(e => contains(e, q.search, ["nome_projeto", "cliente_nome", "ideia_conceito"]))), response(e, i);
  }
  if ("POST" === e && "/crm/projects/batch" === S) {
    const e = await one(_, "crm_clients", r.cliente_id);
    if (!e) throw apiError(404, "Cliente n\xe3o encontrado.");
    const existingProjects = await all(_, "crm_projects");
    const seenNames = new Set();
    for (const project of r.projects || []) {
      const key = normalizeName(project.nome_projeto);
      const duplicate = findDuplicateProject(existingProjects, e.id, project.nome_projeto);
      if (duplicate || (key && seenNames.has(key))) throw apiError(409, `Projeto já existe para este cliente: ${project.nome_projeto}.`);
      seenNames.add(key);
    }
    const t = [];
    for (const a of r.projects || []) {
      const r = id();
      const criadoEm = now();
      const ano = anoDe(criadoEm);
      t.push(await save(_, "crm_projects", r, {
        ...a,
        numero_projeto: formatarNumeroProjeto(ano, await nextSequence(caminhoContadorProjeto(_, ano))),
        cliente_id: e.id,
        cliente_nome: e.nome_empresa,
        stage: "projeto_em_discussao",
        created_at: criadoEm,
        updated_at: criadoEm
      }));
    }
    // D-2 (RFC-001): o Kickoff nasce em rascunho junto com o projeto.
    for (const projeto of t) await commercial.afterProjectCreate(_, projeto, u);
    return response({
      count: t.length,
      projects: t
    }, i);
  }
  if (O = j(/^\/crm\/projects\/([^/]+)\/full$/), "GET" === e && O) {
    const e = await one(_, "crm_projects", O[1]);
    if (!e) throw apiError(404, "Projeto n\xe3o encontrado.");
    return response(await async function (e, t) {
      const a = await one(e, "crm_clients", t.cliente_id),
        r = (await all(e, "crm_samples")).filter(e => e.projeto_id === t.id),
        i = (await all(e, "pd_cards")).filter(e => e.projeto_id === t.id);
      return {
        project: t,
        client: a,
        samples: r,
        pd_cards: i,
        orders: []
      };
    }(_, e), i);
  }
  if (O = j(/^\/crm\/projects\/([^/]+)\/move$/), "PUT" === e && O) {
    await checkMove(_, "project", O[1], r, u);
    const dispensed = await commercial.beforeProjectMove(_, O[1], r.stage, u);
    const moved = await moveCard(_, "project", O[1], r, u, dispensed);
    const extra = await commercial.afterProjectMove(_, moved.updated, u);
    const project = await one(_, "crm_projects", O[1]);
    return response({
      ...project,
      project,
      from_stage: stageLabel(moved.from),
      to_stage: moved.to,
      movement: moved.entry,
      trigger_batch_samples: "amostra_solicitada" === moved.to,
      kickoff_criado: null,
      tarefas_criadas: [],
      ...extra
    }, i);
  }
  if (O = j(/^\/crm\/projects\/([^/]+)$/), O && "GET" === e) return response(await one(_, "crm_projects", O[1]), i);
  if (O && "PUT" === e) return response(await patch(_, "crm_projects", O[1], r), i);
  if (O && "DELETE" === e) return response(await deleteCard(_, "project", O[1], u, ["1", "true"].includes(String(q.cascade))), i);
  if ("POST" === e && ["/crm/samples/batch/v2", "/crm/samples/batch"].includes(S)) return response(await async function (e, t, a) {
    const r = await one(e, "crm_projects", t.projeto_id);
    if (!r) throw apiError(404, "Projeto n\xe3o encontrado.");
    t.projeto_updates && (await patch(e, "crm_projects", r.id, t.projeto_updates));
    const i = await one(e, "crm_clients", r.cliente_id),
      o = await all(e, "crm_samples"),
      s = [];
    const numeroProjeto = await ensureNumeroProjeto(e, r);
    let indiceAmostra = proximoIndiceAmostra(o.filter((x) => x.projeto_id === r.id), numeroProjeto);
    const seenSamples = new Set();
    for (const sample of t.samples || []) {
      const name = sample.nome_produto || sample.nome_amostra;
      const key = normalizeName(name);
      if (findDuplicateSample(o, r.id, name) || (key && seenSamples.has(key))) throw apiError(409, `Amostra já existe neste projeto: ${name}.`);
      seenSamples.add(key);
    }
    for (const d of t.samples || []) {
      var n;
      const t = id(),
        c = numeroAmostra(numeroProjeto, indiceAmostra++),
        u = (null !== (n = d.variacoes) && void 0 !== n && n.length ? d.variacoes : [{}]).map((e, t) => ({
          ...e,
          id: id(),
          codigo: codigoVariacao(c, t),
          status: "solicitada",
          status_pd_raw: "solicitado",
          status_pd_label: "Aberto",
          created_at: now()
        }));
      let _ = await save(e, "crm_samples", t, {
        ...d,
        projeto_id: r.id,
        projeto_nome: r.nome_projeto,
        cliente_id: (null === i || void 0 === i ? void 0 : i.id) || r.cliente_id,
        cliente_nome: (null === i || void 0 === i ? void 0 : i.nome_empresa) || r.cliente_nome,
        numero_amostra: c,
        stage: "solicitada",
        variacoes: u,
        created_at: now(),
        updated_at: now()
      });
      for (const o of u) {
        const t = await createPdFlow(e, _, o, r, i, a);
        o.pd_card_id = t.card.id, o.pd_request_id = t.request.id;
      }
      _ = await save(e, "crm_samples", t, {
        ..._,
        variacoes: u
      }), s.push(_);
    }
    return {
      count: s.length,
      samples: s
    };
  }(_, r, u), i);
  if ("POST" === e && "/crm/samples/sync-missing-pd-cards" === S) {
    // Variações sem card no P&D (criadas antes da integração ou com falha): cria o fluxo P&D que faltou.
    requireAdmin(u, "Sincronizar amostras com o P&D");
    const projects = new Map((await all(_, "crm_projects")).map((p) => [p.id, p]));
    const clients = new Map((await all(_, "crm_clients")).map((c) => [c.id, c]));
    let created = 0;
    const errors = [];
    for (const sample of await all(_, "crm_samples")) {
      const missing = (sample.variacoes || []).filter((v) => !v.pd_card_id || !v.pd_request_id);
      if (!missing.length) continue;
      const project = projects.get(sample.projeto_id) || null;
      const client = clients.get(sample.cliente_id || project?.cliente_id) || null;
      const variacoes = [];
      for (const variation of sample.variacoes || []) {
        if (variation.pd_card_id && variation.pd_request_id) { variacoes.push(variation); continue; }
        try {
          const flow = await createPdFlow(_, sample, variation, project, client, u);
          variacoes.push({ ...variation, pd_card_id: flow.card.id, pd_request_id: flow.request.id, status_pd_raw: variation.status_pd_raw || "solicitado" });
          created += 1;
        } catch (error) {
          variacoes.push(variation);
          errors.push({ sample_id: sample.id, variacao_id: variation.id, error: error.message });
        }
      }
      await patch(_, "crm_samples", sample.id, { variacoes });
    }
    return response({ created, errors, message: created ? `${created} variação(ões) enviada(s) ao P&D.` : "Nenhuma amostra pendente de envio ao P&D." }, i);
  }
  if ("GET" === e && "/crm/samples" === S) {
    await pdReconcileStatusMirrors(_);
    let e = await all(_, "crm_samples");
    return q.search && (e = e.filter(e => contains(e, q.search, ["nome_produto", "nome_amostra", "numero_amostra", "cliente_nome", "projeto_nome"]))), response(e, i);
  }
  if (O = j(/^\/crm\/samples\/([^/]+)\/variacoes$/), "POST" === e && O) {
    const e = await one(_, "crm_samples", O[1]);
    if (!e) throw apiError(404, "Amostra n\xe3o encontrada.");
    const t = await one(_, "crm_projects", e.projeto_id),
      a = t ? await one(_, "crm_clients", t.cliente_id) : null,
      o = [...(e.variacoes || [])];
    for (const i of r.variacoes || []) {
      const r = {
          ...i,
          id: id(),
          codigo: codigoVariacao(e.numero_amostra, o.length),
          status: "solicitada",
          status_pd_raw: "solicitado",
          status_pd_label: "Aberto",
          created_at: now()
        },
        s = await createPdFlow(_, e, r, t, a, u);
      r.pd_card_id = s.card.id, r.pd_request_id = s.request.id, o.push(r);
    }
    return await patch(_, "crm_samples", e.id, {
      variacoes: o
    }), response({
      added: (r.variacoes || []).length,
      variacoes: o
    }, i);
  }
  // AMO-05: retrabalhar amostra já aprovada — o que mudar + quem pediu; aprovação para o histórico,
  // P&D destravado para a próxima versão, Kickoff e orçamento do projeto desatualizados.
  if (O = j(/^\/crm\/samples\/([^/]+)\/variacoes\/([^/]+)\/retrabalho-aprovada$/), "POST" === e && O) {
    if (!isComercial(u) && !isAdmin(u)) throw apiError(403, "Retrabalho de amostra aprovada é pedido pelo Comercial.");
    const amostra = await one(_, "crm_samples", O[1]);
    const variacao = ((amostra && amostra.variacoes) || []).find((v) => v.id === O[2]);
    if (!variacao) throw apiError(404, "Variação não encontrada.");
    const pedido = validarPedidoRetrabalho(variacao, r);
    if (!pedido.ok) throw apiError(422, pedido.erros.join(" "));
    const em = now(), por = firebaseAuth.currentUser.uid, porNome = pdUserName(u);
    await patch(_, "crm_samples", O[1], {
      variacoes: amostra.variacoes.map((v) => (v.id === O[2] ? variacaoEmRetrabalho(v, pedido, { por, porNome, em }) : v)),
      historico_retrabalhos: [...(amostra.historico_retrabalhos || []), entradaRetrabalhos(pedido, { variacaoId: O[2], codigo: variacao.codigo || "", em })],
    });
    // Solicitação do P&D fechada pela aprovação → Reprovado (Retrabalho): o P&D abre a próxima versão.
    const ligadas = new Set((await all(_, "pd_cards"))
      .filter((c) => (c.amostra_id || c.crm_sample_id) === O[1] && (c.amostra_variacao_id || c.crm_variacao_id) === O[2]).map((c) => c.pd_request_id).filter(Boolean));
    for (const rq of await all(_, "pd_requests")) {
      if ((rq.crm_sample_id || rq.linked_amostra_id) === O[1] && (rq.crm_variacao_id || rq.linked_variacao_id) === O[2]) ligadas.add(rq.id);
    }
    const reabertas = [];
    for (const rid of ligadas) {
      const rq = await one(_, "pd_requests", rid);
      if (!rq || !PD_FECHADO.has(rq.status)) continue;
      await patch(_, "pd_requests", rid, { status: "REJECTED" });
      await create(_, "pd_request_status_history", { request_id: rid, pd_request_id: rid, from_status: rq.status, to_status: "REJECTED",
        comment: `Retrabalho após aprovação (pedido: ${SOLICITANTES[pedido.solicitado_por]}): ${pedido.o_que_alterar}`, changed_by: por, changed_by_name: porNome, created_at: em, user_id: por });
      await pdSyncRequestStatus(_, rq, "REJECTED");
      reabertas.push(rid);
    }
    const evento = await create(_, "eventos", { tipo: EVENTO_RETRABALHO, entidade: "amostra", entidade_id: O[1],
      payload: { variacao_id: O[2], codigo: variacao.codigo || "", o_que_alterar: pedido.o_que_alterar, solicitado_por: pedido.solicitado_por }, em, por, por_nome: porNome });
    let marcados = {};
    if (amostra.projeto_id && await one(_, "crm_projects", amostra.projeto_id)) {
      const amostraTxt = ["amostra", variacao.codigo].filter(Boolean).join(" ");
      marcados = await commercial.marcarDesatualizadoDoProjeto(_, amostra.projeto_id,
        marcaDesatualizado({ motivo: `${amostraTxt} em retrabalho após aprovação — ${pedido.o_que_alterar}`, eventoId: evento.id, em }));
      await acrescentarHistorico(`${collectionPath(_, "crm_projects")}/${amostra.projeto_id}/historico_movimentacoes`, {
        tipo: "retrabalho_apos_aprovacao", texto: `${amostraTxt} volta ao P&D (pedido: ${SOLICITANTES[pedido.solicitado_por]}): ${pedido.o_que_alterar}`,
        data: em, usuario: porNome, usuario_id: por,
      });
    }
    await auditCard(_, "retrabalho_amostra_aprovada", "amostra", O[1], { variacao_id: O[2], status: "aprovada" }, { variacao_id: O[2], status: "retrabalho", o_que_alterar: pedido.o_que_alterar }, u);
    return response({ ok: true, pd_reabertas: reabertas, evento_id: evento.id, ...marcados }, i);
  }
  if (O = j(/^\/crm\/samples\/([^/]+)\/variacoes\/([^/]+)\/resultado-cliente$/), "POST" === e && O) {
    // COM-02: o retorno do cliente só vale com quem, canal e data/hora reais.
    const aprovacao = validarAprovacaoCliente(r.aprovacao_cliente, { registradoPor: firebaseAuth.currentUser.uid, registradoPorNome: pdUserName(u) });
    if (!aprovacao.ok) throw apiError(422, aprovacao.erros.join(" "));
    const e = await one(_, "crm_samples", O[1]),
      variacao = ((e && e.variacoes) || []).find((v) => v.id === O[2]),
      t = ((null === e || void 0 === e ? void 0 : e.variacoes) || []).map(e => e.id === O[2] ? {
        ...e,
        status: r.resultado,
        resultado_cliente: r.resultado,
        feedback_cliente: r.feedback_cliente || "",
        direcoes_retrabalho: r.direcoes_retrabalho || "",
        aprovacao_cliente: aprovacao.registro,
        resultado_em: now()
      } : e);
    await patch(_, "crm_samples", O[1], { variacoes: t });
    try { if (e?.projeto_id) await parearEtapasPelaAmostra(_, u, e.projeto_id); } catch (error) { console.error("[CRM2] pareamento com a amostra falhou:", error); }
    // Depois do pareamento: a mudança de etapa ainda regrava o histórico inteiro do projeto.
    if (e?.projeto_id && await one(_, "crm_projects", e.projeto_id)) {
      const entrada = entradaHistoricoAprovacao(aprovacao.registro, { oque: `Amostra ${variacao?.codigo || ""}`.trim(), resultado: r.resultado, documentoId: O[2] });
      await acrescentarHistorico(`${collectionPath(_, "crm_projects")}/${e.projeto_id}/historico_movimentacoes`, entrada);
    }
    await auditCard(_, "retorno_cliente_amostra", "amostra", O[1], null, { variacao_id: O[2], resultado: r.resultado, aprovacao_cliente: aprovacao.registro }, u);
    return response({
      success: !0,
      sku_created: "aprovada" === r.resultado ? {
        blocked: !0,
        reason: "Gera\xe7\xe3o de SKU ser\xe1 habilitada com o m\xf3dulo de Cadastros."
      } : null
    }, i);
  }
  if (O = j(/^\/crm\/samples\/([^/]+)\/variacoes\/([^/]+)$/), O && ["PUT", "DELETE"].includes(e)) {
    if ("DELETE" === e) requireAdmin(u, "Excluir variações");
    const t = await one(_, "crm_samples", O[1]);
    if (!t) throw apiError(404, "Amostra n\xe3o encontrada.");
    const a = "DELETE" === e ? (t.variacoes || []).filter(e => e.id !== O[2]) : (t.variacoes || []).map(e => e.id === O[2] ? {
      ...e,
      ...r,
      updated_at: now()
    } : e);
    return await patch(_, "crm_samples", O[1], {
      variacoes: a
    }), response({
      success: !0
    }, i);
  }
  if (O = j(/^\/crm\/samples\/([^/]+)$/), O && "GET" === e) return response(await one(_, "crm_samples", O[1]), i);
  if (O && "PUT" === e) return response(await patch(_, "crm_samples", O[1], r), i);
  if (O && "DELETE" === e) return response(await deleteCard(_, "sample", O[1], u, true), i);
  if ("GET" === e && "/crm/pd/cards" === S) {
    await pdReconcileStatusMirrors(_);
    const t = await all(_, "crm_samples"),
      a = new Map(t.map(e => [e.id, e])),
      requestIds = new Set((await all(_, "pd_requests")).map(e => e.id));
    let e = cardsVisiveis(await all(_, "pd_cards"), requestIds).map(e => {
      const t = a.get(e.amostra_id),
        r = t && Array.isArray(t.variacoes) ? t.variacoes.find(t => t.id === e.amostra_variacao_id) : null;
      return normalizePdCard({
        ...e,
        amostra_codigo: e.amostra_codigo || (null === r || void 0 === r ? void 0 : r.codigo),
        descricao_aplicacao: e.descricao_aplicacao || (null === r || void 0 === r ? void 0 : r.descricao_aplicacao),
        briefing_base: e.briefing_base || (null === t || void 0 === t ? void 0 : t.briefing_base) || (null === t || void 0 === t ? void 0 : t.briefing_especifico)
      });
    });
    return q.search && (e = e.filter(e => contains(e, q.search, ["titulo", "nome_produto", "cliente_nome", "projeto_nome"]))), response(e, i);
  }
  if (O = j(/^\/crm\/pd\/cards\/([^/]+)\/move$/), "PUT" === e && O) {
    const e = await one(_, "pd_cards", O[1]);
    if (!e) throw apiError(404, "Card P&D não encontrado.");
    const t = await one(_, "pd_requests", e.pd_request_id);
    if (!t) throw apiError(404, "Solicitação P&D vinculada não encontrada.");
    const a = PD_CARD_TO_STATUS[r.status] || (PD_STATUS_TO_CARD[r.status] ? r.status : null);
    if (!a) throw apiError(400, `Status P&D inválido: ${r.status}`);
    const o = t.status || "OPEN";
    await patch(_, "pd_requests", t.id, {
      status: a
    });
    o !== a && (await create(_, "pd_request_status_history", {
      request_id: t.id,
      pd_request_id: t.id,
      from_status: o,
      to_status: a,
      comment: r.observacao || `Movido no kanban de ${PD_STATUS_LABELS[o] || o} para ${PD_STATUS_LABELS[a] || a}`,
      changed_by: firebaseAuth.currentUser.uid,
      changed_by_name: pdUserName(u),
      created_at: now(),
      user_id: firebaseAuth.currentUser.uid
    }));
    await pdSyncRequestStatus(_, t, a);
    const s = await one(_, "pd_cards", O[1]);
    return response({
      ...normalizePdCard(s),
      to_status: PD_STATUS_TO_CARD[a],
      synced_to_crm: !0
    }, i);
  }
  if (O = j(/^\/crm\/pd\/cards\/([^/]+)$/), O && "GET" === e) {
    const e = await one(_, "pd_cards", O[1]);
    return response(e ? normalizePdCard(e) : null, i);
  }
  if (O && "PUT" === e) {
    const e = await one(_, "pd_cards", O[1]);
    if (!e) throw apiError(404, "Card P&D não encontrado.");
    const t = await patch(_, "pd_cards", O[1], r),
      a = r.status_pd || r.status,
      o = a && (PD_CARD_TO_STATUS[a] || (PD_STATUS_TO_CARD[a] ? a : null));
    if (o && e.pd_request_id) {
      const t = await one(_, "pd_requests", e.pd_request_id);
      t && (await patch(_, "pd_requests", t.id, {
        status: o
      }), await pdSyncRequestStatus(_, t, o));
    }
    return response(t, i);
  }
  if ("POST" === e && "/pd/requests/internal-research" === S) {
    const e = id(),
      t = id(),
      a = id(),
      s = now(),
      d = (await all(_, "pd_cards")).filter(e => String(e.numero_completo || "").startsWith("PI-")).length + 1,
      g = `PI-${String(d).padStart(3, "0")}`,
      b = [r.objectives ? `Objetivo da Pesquisa: ${r.objectives}` : "", r.description ? `Descrição: ${r.description}` : "", r.references ? `Referências: ${r.references}` : ""].filter(Boolean).join("\n"),
      o = await save(_, "pd_requests", e, {
        ...r,
        title: r.project_name,
        client_name: "— Pesquisa Interna —",
        description: b || r.description || "",
        status: "IN_PROGRESS",
        request_type: "Pesquisa Interna",
        priority: r.priority || "Normal",
        is_internal_research: !0,
        created_by: firebaseAuth.currentUser.uid,
        created_by_name: pdUserName(u),
        pd_card_id: a,
        created_at: s,
        updated_at: s
      });
    return await save(_, "pd_developments", t, {
      request_id: e,
      pd_request_id: e,
      assigned_to: firebaseAuth.currentUser.uid,
      assigned_to_name: pdUserName(u),
      lab_responsible: pdUserName(u),
      current_version: 0,
      status: "active",
      started_at: s,
      completed_at: null,
      is_internal_research: !0
    }), await create(_, "pd_request_status_history", {
      request_id: e,
      pd_request_id: e,
      from_status: null,
      to_status: "OPEN",
      changed_by: firebaseAuth.currentUser.uid,
      changed_by_name: pdUserName(u),
      comment: "Pesquisa Interna iniciada pelo lab",
      created_at: s
    }), await create(_, "pd_request_status_history", {
      request_id: e,
      pd_request_id: e,
      from_status: "OPEN",
      to_status: "IN_PROGRESS",
      changed_by: firebaseAuth.currentUser.uid,
      changed_by_name: pdUserName(u),
      comment: "Auto-iniciado como Pesquisa Interna",
      created_at: s
    }), await save(_, "pd_cards", a, {
      pd_request_id: e,
      development_id: t,
      tipo: "pesquisa_interna",
      titulo: r.project_name,
      nome_produto: r.project_name,
      produto: r.project_name,
      numero_completo: g,
      cliente: "— Pesquisa Interna —",
      descricao_aplicacao: r.description || r.objectives || "",
      briefing_base: r.description || "",
      observacoes_especificas: r.references || "",
      responsavel_pd: pdUserName(u),
      prazo_prometido: r.deadline || null,
      is_internal_research: !0,
      status_pd: "em_desenvolvimento",
      historico_movimentacoes: [{
        de: "",
        para: "em_desenvolvimento",
        data: s,
        usuario: pdUserName(u),
        usuario_id: firebaseAuth.currentUser.uid,
        observacao: "Pesquisa Interna iniciada"
      }],
      created_by: firebaseAuth.currentUser.uid,
      created_by_name: pdUserName(u),
      created_at: s,
      updated_at: s
    }), response(o, i);
  }
  if ("GET" === e && "/pd/requests" === S) return response(await all(_, "pd_requests"), i);
  if (O = j(/^\/pd\/requests\/([^/]+)\/full$/), "GET" === e && O) {
    const e = await one(_, "pd_requests", O[1]);
    if (!e) throw apiError(404, "Requisi\xe7\xe3o P&D n\xe3o encontrada.");
    return response(await pdFullDetail(_, e), i);
    return response(await async function (e, t) {
      const a = (await all(e, "pd_developments")).find(e => e.request_id === t.id) || null,
        r = null === a || void 0 === a ? void 0 : a.id,
        i = async t => (await all(e, t)).filter(e => e.development_id === r),
        o = r ? await i("pd_formulas") : [],
        s = new Set(o.map(e => e.id)),
        n = (await all(e, "pd_formula_items")).filter(e => s.has(e.formula_id)),
        d = r ? await i("pd_approvals") : [],
        c = (await all(e, "pd_pending_items")).filter(e => e.request_id === t.id),
        u = (await all(e, "pd_request_status_history")).filter(e => e.request_id === t.id),
        l = t.crm_sample_id ? await one(e, "crm_samples", t.crm_sample_id) : null,
        p = l && Array.isArray(l.variacoes) ? l.variacoes.find(e => e.id === t.crm_variacao_id) || null : null,
        _ = l ? {
          ...l,
          _source: "crm_sample",
          _variacao_codigo: null === p || void 0 === p ? void 0 : p.codigo,
          nome_cliente: l.cliente_nome || t.client_name || "",
          nome_projeto: l.projeto_nome || t.project_name || "",
          produto: l.nome_produto || t.project_name || "",
          outras_observacoes: (null === p || void 0 === p ? void 0 : p.observacoes_especificas) || ""
        } : null;
      return {
        request: l ? {
          ...t,
          category: t.category || l.categoria || "",
          description: t.description || l.briefing_especifico || "",
          objectives: t.objectives || l.objetivo_projeto || "",
          references: t.references || l.referencia_formula || "",
          deadline: t.deadline || l.prazo_entrega_cliente || ""
        } : t,
        development: a,
        formulas: o.map(e => ({
          ...e,
          items: n.filter(t => t.formula_id === e.id)
        })),
        tests: r ? await i("pd_tests") : [],
        samples: r ? await i("pd_samples") : [],
        approvals: d,
        approval: d[0] || null,
        costs: r ? await i("pd_costs") : [],
        documents: r ? await i("pd_documents") : [],
        updates: (await all(e, "pd_updates")).filter(e => e.request_id === t.id),
        pending_items: c,
        pending: c,
        status_history: u,
        history: u,
        client_info: _,
        formula_cost_data: null,
        cost_versions: {},
        lab_results: (null === a || void 0 === a ? void 0 : a.lab_results) || null,
        blocking_tasks: []
      };
    }(_, e), i);
  }
  if (O = j(/^\/pd\/requests\/([^/]+)\/purchase-requests$/), "GET" === e && O) {
    const e = (await masterAll("solicitacoes_compra")).filter(e => e.pdRequestId === O[1] || e.origem && e.origem.pdRequestId === O[1]).sort((e, t) => String(t.criadoEm || "").localeCompare(String(e.criadoEm || "")));
    return response(e, i);
  }
  if ("POST" === e && O) {
    const e = await one(_, "pd_requests", O[1]);
    if (!e) throw apiError(404, "Solicitação P&D não encontrada.");
    const t = (Array.isArray(r.items) ? r.items : []).filter(e => Number(e.quantidade || e.qtd || 0) > 0);
    if (!t.length) throw apiError(400, "Inclua ao menos um material com quantidade maior que zero.");
    const a = await integratedMaterials(_),
      s = new Map(a.flatMap(e => [[e.id, e], [e.master_material_id, e], [e.codigo_interno, e]].filter(e => e[0]))),
      d = {},
      g = await masterAll("solicitacoes_compra"),
      b = Math.max(0, ...g.map(e => Number(e.numero || 0))) + 1,
      C = id();
    for (const e of t) {
      const t = s.get(e.material_id || e.material_key || e.codigo_interno || e.materialCodigo),
        a = id();
      if (!t) throw apiError(400, `Material não encontrado no cadastro: ${e.material_id || e.codigo_interno || e.materialNome || "sem identificação"}`);
      d[a] = {
        materialKey: t.master_material_id || t.id,
        materialCodigo: t.codigo_interno || t.id,
        materialNome: t.nome || t.descricao,
        qtd: Number(e.quantidade || e.qtd),
        unidade: e.unidade || t.unidade_compra || t.unidade || "un",
        obs: e.observacao || e.obs || "",
        origemFormulaItemId: e.formula_item_id || null
      };
    }
    const R = {
      numero: b,
      numeroFormatado: `SC-${String(b).padStart(4, "0")}`,
      status: "PENDENTE",
      criadoEm: now(),
      criadoPor: pdUserName(u),
      solicitante: pdUserName(u),
      justificativa: r.justificativa || `Necessidade do P&D — ${e.title || e.project_name || "desenvolvimento"}`,
      origemTela: "pd",
      origemModulo: "PD",
      pdRequestId: e.id,
      pdDevelopmentId: r.development_id || null,
      itens: d,
      origem: {
        tipo: "PD",
        pdRequestId: e.id,
        pdDevelopmentId: r.development_id || null,
        projeto: e.project_name || e.title || "",
        cliente: e.client_name || "",
        crmSampleId: e.crm_sample_id || null,
        crmVariacaoId: e.crm_variacao_id || null
      }
    };
    await masterWrite("solicitacoes_compra", C, R);
    await create(_, "pd_purchase_requests", {
      solicitacao_compra_id: C,
      pd_request_id: e.id,
      development_id: r.development_id || null,
      numero: b,
      numero_formatado: R.numeroFormatado,
      status: "PENDENTE",
      items: Object.values(d),
      created_by: firebaseAuth.currentUser.uid,
      created_by_name: pdUserName(u)
    });
    await create(_, "pd_updates", {
      request_id: e.id,
      pd_request_id: e.id,
      tipo: "compra_solicitada",
      titulo: `${R.numeroFormatado} enviada para Compras`,
      descricao: R.justificativa,
      created_by: firebaseAuth.currentUser.uid,
      created_by_name: pdUserName(u)
    });
    return response({
      id: C,
      ...R
    }, i);
  }
  if (O = j(/^\/pd\/requests\/([^/]+)\/purchase-requests\/([^/]+)$/), "DELETE" === e && O) {
    const e = await masterOne("solicitacoes_compra", O[2]);
    if (!e || e.pdRequestId !== O[1] && (!e.origem || e.origem.pdRequestId !== O[1])) throw apiError(404, "Solicitação de compra do P&D não encontrada.");
    if (!["PENDENTE", "REJEITADA"].includes(e.status)) throw apiError(409, "A solicitação já está em processamento por Compras e não pode ser removida pelo P&D.");
    await remove(ref(firebaseDb, `solicitacoes_compra/${O[2]}`));
    for (const e of (await all(_, "pd_purchase_requests")).filter(e => e.solicitacao_compra_id === O[2])) await erase(_, "pd_purchase_requests", e.id);
    return response({
      deleted: !0
    }, i);
  }
  // Liberação antecipada (24/10/2026): P&D pede com o D24h; ADM decide no CRM (Projetos).
  if (O = j(/^\/pd\/requests\/([^/]+)\/liberacao-antecipada$/), "POST" === e && O) {
    if (!hasAnyRole(u, ["pd", "lider_pd", "formulador", "engenharia_produto"])) throw apiError(403, "A liberação antecipada é pedida pelo P&D.");
    const t = await one(_, "pd_requests", O[1]);
    if (!t) throw apiError(404, "Solicitação P&D não encontrada.");
    const estudo = (await all(_, "pd_stability_studies")).find((x) => x.request_id === t.id || x.pd_card_id === t.id);
    const leituras = estudo ? await related(_, "pd_stability_readings", "study_id", estudo.id) : [];
    const pode = podeSolicitar({ status: t.status, leituras, liberacao: t.liberacao_antecipada });
    if (!pode.ok) throw apiError(409, pode.motivo);
    const nova = novaSolicitacao({ motivo: r.motivo, por: firebaseAuth.currentUser.uid, porNome: pdUserName(u), em: now(), leituras });
    if (!nova.ok) throw apiError(422, nova.erro);
    const registro = { ...nova.registro, historico: t.liberacao_antecipada?.historico || [] };
    await patch(_, "pd_requests", t.id, { liberacao_antecipada: registro });
    await save(_, "pd_request_status_history", id(), { request_id: t.id, pd_request_id: t.id, from_status: t.status, to_status: t.status,
      comment: `Liberação antecipada pedida à diretoria (${registro.leituras_no_pedido.join(", ")}): ${registro.motivo}`,
      changed_by: firebaseAuth.currentUser.uid, changed_by_name: pdUserName(u), created_at: now(), user_id: firebaseAuth.currentUser.uid });
    return response({ ...t, liberacao_antecipada: registro }, i);
  }
  if ("GET" === e && "/crm/liberacoes-antecipadas" === S) {
    if (!isAdmin(u)) return response([], i);
    const [reqs, projetos] = await Promise.all([all(_, "pd_requests"), all(_, "crm_projects")]);
    const proj = new Map(projetos.map((p) => [p.id, p]));
    return response(reqs.filter((x) => x.liberacao_antecipada?.status === "aguardando_diretoria").map((x) => {
      const p = proj.get(x.crm_project_id) || {};
      return { request_id: x.id, titulo: x.title || x.project_name || "", projeto_id: x.crm_project_id || null, numero_projeto: p.numero_projeto || "",
        nome_projeto: p.nome_projeto || x.project_name || "", cliente_nome: p.cliente_nome || x.client_name || "", status: x.status, liberacao: x.liberacao_antecipada };
    }).sort((a, b) => String(a.liberacao.solicitada_em).localeCompare(String(b.liberacao.solicitada_em))), i);
  }
  if (O = j(/^\/pd\/requests\/([^/]+)\/liberacao-antecipada\/decisao$/), "POST" === e && O) {
    if (!isAdmin(u)) throw apiError(403, "A liberação antecipada é aprovada pela diretoria (administrador).");
    const t = await one(_, "pd_requests", O[1]);
    if (!t) throw apiError(404, "Solicitação P&D não encontrada.");
    if (t.liberacao_antecipada?.status !== "aguardando_diretoria") throw apiError(409, "Não há pedido de liberação antecipada aguardando a diretoria.");
    const v = validarDecisao({ decisao: r.decisao, justificativa: r.justificativa, dataHora: r.data_hora, agoraMs: Date.now(), por: firebaseAuth.currentUser.uid, porNome: pdUserName(u) });
    if (!v.ok) throw apiError(422, v.erros.join(" "));
    const liberacao = aplicarDecisao(t.liberacao_antecipada, v.registro);
    await patch(_, "pd_requests", t.id, { liberacao_antecipada: liberacao });
    if (v.registro.decisao === "aprovada") {
      // Segue o caminho normal (100% conferido no servidor, histórico, espelho no CRM), sem o D48h.
      try {
        await dispatch("PUT", `/pd/requests/${t.id}/status`, { new_status: "WAITING_APPROVAL",
          comment: `Entregue ao Comercial por liberação antecipada — ${textoDecisao(liberacao)}` }, {});
      } catch (error) {
        await patch(_, "pd_requests", t.id, { liberacao_antecipada: { ...liberacao, status: "aguardando_diretoria", decisao: null, historico: t.liberacao_antecipada.historico || [] } });
        throw error;
      }
      // O Comercial vê na amostra que ela saiu antes do D48h, com quem aprovou.
      const amostraId = t.crm_sample_id || t.linked_amostra_id, variacaoId = t.crm_variacao_id || t.linked_variacao_id;
      const amostra = amostraId ? await one(_, "crm_samples", amostraId) : null;
      if (amostra && variacaoId) {
        await patch(_, "crm_samples", amostra.id, { variacoes: (amostra.variacoes || []).map((x) => (x.id === variacaoId
          ? { ...x, liberacao_antecipada: { aprovada_por_nome: v.registro.decidida_por_nome, aprovada_em: v.registro.decidida_em, justificativa: v.registro.justificativa,
            estabilidade_no_envio: liberacao.leituras_no_pedido || [] } } : x)) });
      }
    }
    await auditCard(_, "liberacao_antecipada_" + v.registro.decisao, "pd_request", t.id, { status: "aguardando_diretoria" }, v.registro, u);
    return response({ ...(await one(_, "pd_requests", t.id)) }, i);
  }
  if (O = j(/^\/pd\/requests\/([^/]+)\/status$/), "PUT" === e && O) {
    const t = await one(_, "pd_requests", O[1]);
    if (!t) throw apiError(404, "Solicitação P&D não encontrada.");
    const a = t.status || "OPEN",
      o = r.new_status;
    if (!Object.prototype.hasOwnProperty.call(PD_ALLOWED_TRANSITIONS, o)) throw apiError(400, `Status inválido: ${o}`);
    if (r.is_backward) {
      if (!r.comment || r.comment.trim().length < 10) throw apiError(400, "Justificativa obrigatória para retroceder (mínimo 10 caracteres).");
      if (PD_BACKWARD_TRANSITIONS[a] !== o) throw apiError(400, `Retrocesso não permitido: ${a} → ${o}`);
    } else if (!(PD_ALLOWED_TRANSITIONS[a] || []).includes(o)) {
      throw apiError(400, `Transição não permitida: ${a} → ${o}.`);
    }
    const s = (await all(_, "pd_developments")).find(e => e.request_id === t.id || e.pd_request_id === t.id) || null;
    // AMO-03: concluir a manipulação ou entregar ao cliente exige 100% na fórmula vigente e em
    // cada variante dos lotes (tolerância 0,001; antes ±0,5 só na fórmula). Popup na tela.
    if (("IN_TESTS" === o || "WAITING_APPROVAL" === o) && s && !r.is_backward) await conferirFechamentoPd(_, t, s);
    // INF-04: a regra do banco só aceita esses dois status com a liberação do servidor (que confere de novo).
    if ("IN_TESTS" === o || "WAITING_APPROVAL" === o) await liberarEtapaPd(t.id, o, Boolean(r.is_backward));
    if ("IN_TESTS" === o) {
      if (!s) throw apiError(400, "Inicie o desenvolvimento antes de avançar para Em Testes.");
      const e = (await related(_, "pd_formulas", "development_id", s.id)).sort((e, t) => Number(t.version || 0) - Number(e.version || 0))[0];
      if (!e) throw apiError(400, "Registre a fórmula antes de avançar para Em Testes (RN-PD-02).");
      const t = await related(_, "pd_formula_items", "formula_id", e.id);
      if (!t.length) throw apiError(400, "Adicione ingredientes à fórmula antes de avançar para Em Testes (RN-PD-02).");
      await patch(_, "pd_formulas", e.id, {
        locked: !0,
        locked_at: now(),
        locked_by: firebaseAuth.currentUser.uid,
        locked_by_name: pdUserName(u)
      });
      // Manipulação finalizada: a amostra desta versão aparece sozinha na aba Amostras.
      const amostras = await related(_, "pd_samples", "development_id", s.id);
      if (amostraDaVersaoFaltando(amostras, e.version)) await create(_, "pd_samples", {
        development_id: s.id,
        formula_version: Number(e.version) || 1,
        sent_to_client: !1,
        sent_at: null,
        feedback: "",
        origem: "manipulacao_finalizada",
        created_by: firebaseAuth.currentUser.uid,
        created_by_name: pdUserName(u)
      });
    }
    // Liberação antecipada aprovada pela diretoria (24/10/2026) dispensa o D48h; o resto vale igual.
    if ("WAITING_APPROVAL" === o && t.liberacao_antecipada?.status !== "aprovada") {
      const e = (await all(_, "pd_stability_studies")).find(e => e.request_id === t.id || e.pd_card_id === t.id),
        a = e ? await related(_, "pd_stability_readings", "study_id", e.id) : [];
      if (!e || !a.some(e => 2 === Number(e.day_offset))) throw apiError(400, "Nenhuma leitura D48h (48 horas) registrada. Conclua o checkpoint D48h antes de entregar ao Comercial — ou peça a liberação antecipada à diretoria (já com o D24h).");
    }
    if ("APPROVED" === o && s) {
      const e = await related(_, "pd_tests", "development_id", s.id);
      if (e.some(e => "FAILED" === e.status)) throw apiError(400, "Existem testes com falha. Corrija antes de aprovar.");
      const t = (await related(_, "pd_approvals", "development_id", s.id))[0],
        a = {
          approved_by_internal: !0,
          approved_by_client: !0,
          approved_by_comercial: !0,
          approved_by_comercial_id: firebaseAuth.currentUser.uid,
          approved_by_comercial_name: pdUserName(u),
          approved_at: now(),
          approval_date: now(),
          updated_at: now()
        };
      t ? await patch(_, "pd_approvals", t.id, a) : await create(_, "pd_approvals", {
        ...a,
        development_id: s.id,
        request_id: O[1],
        notes: `Aprovado comercialmente por ${pdUserName(u)}`
      });
      await enfileirarSemTravar(_, O[1], pdUserName(u));
    }
    const d = await patch(_, "pd_requests", O[1], {
        status: o,
        // Amostra entregue ao cliente: daqui em diante só vale retorno novo (o retrabalho antigo não volta).
        ...("WAITING_APPROVAL" === o ? { aguardando_cliente_desde: now() } : {})
      }),
      g = id();
    await save(_, "pd_request_status_history", g, {
      request_id: O[1],
      pd_request_id: O[1],
      from_status: a,
      to_status: o,
      comment: r.comment || `Status alterado de ${a} para ${o}`,
      changed_by: firebaseAuth.currentUser.uid,
      changed_by_name: pdUserName(u),
      created_at: now(),
      user_id: firebaseAuth.currentUser.uid
    });
    await pdSyncRequestStatus(_, t, o);
    if (s && "COMPLETED" === o) await patch(_, "pd_developments", s.id, {
      status: "completed",
      completed_at: now()
    });
    // CRM2 acompanha a amostra (só quando quem mexe pode mover o CRM2; senão pareia ao abrir o CRM2).
    const projetoDaSolicitacao = t.crm_project_id || t.linked_projeto_id;
    try { if (projetoDaSolicitacao) await parearEtapasPelaAmostra(_, u, projetoDaSolicitacao); } catch (error) { console.error("[CRM2] pareamento com a amostra falhou:", error); }
    return response(d, i);
  }
  if (O = j(/^\/pd\/requests\/([^/]+)$/), O && "GET" === e) return response(await one(_, "pd_requests", O[1]), i);
  if (O && "PUT" === e) {
    const e = await one(_, "pd_requests", O[1]);
    if (!e) throw apiError(404, "Solicitação P&D não encontrada.");
    const t = await patch(_, "pd_requests", O[1], r);
    r.status && (await pdSyncRequestStatus(_, t, r.status));
    return response(t, i);
  }
  if (O && "DELETE" === e) return await pdDeleteRequestCascade(_, O[1]), response({
    deleted: !0,
    message: "Solicitação removida"
  }, i);
  if ("GET" === e && "/pd/formulas/bank" === S) {
    let e = await all(_, "pd_formulas");
    const t = await all(_, "pd_formula_items"),
      a = await all(_, "pd_developments"),
      r = await all(_, "pd_requests"),
      o = await all(_, "pd_approvals"),
      s = new Map(a.map(e => [e.id, e])),
      d = new Map(r.map(e => [e.id, e])),
      b = new Map(o.map(e => [e.development_id, e]));
    e = e.map(e => {
      const a = t.filter(t => t.formula_id === e.id),
        r = s.get(e.development_id) || {},
        i = d.get(r.request_id || r.pd_request_id) || {},
        o = b.get(e.development_id) || {},
        n = !!o.approved_by_client,
        c = !!o.approved_by_internal,
        u = !!i.is_internal_research || !i.client_name;
      return {
        ...pdEnrichFormula(e, a),
        pd_request_id: i.id,
        project_name: i.project_name || i.title || "",
        client_name: i.client_name || "",
        origin_label: u ? "Portfólio Kuryos" : i.client_name,
        origin_type: u ? "portfolio" : "cliente",
        request_status: i.status,
        approved_by_client: n,
        approved_by_internal: c,
        is_registered: formulaRegistrada(o),
        item_count: a.length,
        total_percentage: Number(a.reduce((e, t) => e + Number(t.percentage || 0), 0).toFixed(4)),
        fragrance_percentage: Number(a.filter(e => /fragr|essência|essencia|perfum|aroma/i.test(e.ingredient_name || "")).reduce((e, t) => e + Number(t.percentage || 0), 0).toFixed(4)),
        restricted_view: !1
      };
    });
    const C = e.reduce((t, a) => (t[a.development_id] = Math.max(t[a.development_id] || 0, Number(a.version || 0)), t), {});
    e = e.map(e => ({
      ...e,
      is_latest_version: Number(e.version || 0) === C[e.development_id]
    }));
    return q.origem && (e = e.filter(e => e.origin_type === q.origem)), "true" === String(q.somente_registradas) && (e = e.filter(e => e.is_registered)), q.q && (e = e.filter(e => contains(e, q.q, ["name", "nome", "project_name", "client_name", "origin_label", "created_by_name", "items"]))), response(e.sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))), i);
  }
  if (O = j(/^\/pd\/pd-cards\/([^/]+)\/executor$/), "PUT" === e && O) return response(await patch(_, "pd_cards", O[1], r), i);
  if ("GET" === e && "/pd/clients/search" === S) {
    const e = q.q || q.nome || "";
    return response((await syncMasterClients(_)).filter(t => contains(t, e, ["nome_empresa", "nome_fantasia", "cnpj"])).slice(0, Number(q.limit) || 20), i);
  }
  if ("GET" === e && "/crm/skus" === S) return response((await masterAll("produtos")).filter(e => false !== e.ativo && "Inativo" !== e.ativo).map(e => ({
    ...e,
    id: e.id,
    codigo: e.sku || e.id,
    codigo_interno: e.sku || e.id,
    nome: e.descricao || e.nome || e.id,
    nome_produto: e.descricao || e.nome || e.id,
    cliente_id: e.clienteKey || null,
    cliente_nome: e.cliente || "",
    categoria: e.categoria || "",
    subcategoria: e.subcategoria || "",
    volume: e.volume || null,
    unidade_volume: e.unidadeVolume || null,
    origem_integracao: "cadastro_produtos"
  })), i);
  // PD-02: tipo2=MP (o que o P&D pede) traz só MPES/MPGR; sem filtro (Kickoff) traz tudo, embalagens incluídas.
  if ("GET" === e && "/cadastros/materiais" === S) {
    const materiais = await integratedMaterials(_);
    return response(String(q.tipo2 || "").toUpperCase() === "MP" ? filtrarMateriaisPd(materiais) : materiais, i);
  }
  // KO-04: catálogo de tipos de componente = padrão do código + config/tipos_componente (ADM edita, sem deploy).
  if ("GET" === e && "/config/tipos-componente" === S) {
    const doBanco = (await get(ref(firebaseDb, "config/tipos_componente")).catch(() => null))?.val() || {};
    return response(mesclarCatalogo(CATALOGO_PADRAO, doBanco), i);
  }
  {
    const tipoComp = S.match(/^\/config\/tipos-componente\/([A-Za-z0-9_]+)$/);
    if ("PUT" === e && tipoComp) {
      requireAdmin(u, "Editar o catálogo de componentes");
      const v = validarTipoComponente({ ...r, codigo: tipoComp[1] });
      if (!v.ok) throw apiError(422, v.erros.join(" "));
      await set(ref(firebaseDb, `config/tipos_componente/${v.tipo.codigo}`), { ...v.tipo, atualizado_por: pdUserName(u), atualizado_em: now() });
      return response(v.tipo, i);
    }
  }
  if ("GET" === e && "/cadastros/fragrancias" === S) return response(await all(_, "fragrancias"), i);
  // KO-08: serviços ativos (Cadastros › Serviços) para o Kickoff escolher.
  if ("GET" === e && "/cadastros/servicos" === S) return response((await masterAll("servicos")).filter((sv) => sv.ativo !== false)
    .map((sv) => ({ id: sv.id, codigo: sv.codigo || "", nome: sv.nome || sv.id, unidade: sv.unidade || "" }))
    .sort((a, b) => String(a.codigo || a.nome).localeCompare(String(b.codigo || b.nome))), i);
  if ("GET" === e && "/compras/fornecedores" === S) return response((await masterAll("fornecedores")).map(e => ({
    ...e,
    razao_social: e.razaoSocial || e.razao_social,
    nome_fantasia: e.nomeFantasia || e.nome_fantasia,
    contato_email: e.contatoEmail || e.contato_email,
    contato_nome: e.contatoNome || e.contato_nome
  })), i);
  if ("POST" === e && "/orders/direct" === S) return response(await create(_, "orders", {
    ...r,
    origem: "crm_direto",
    status: "rascunho"
  }), i);
  if (O = j(/^\/orders\/reorder\/([^/]+)$/), "GET" === e && O) return response((await all(_, "orders")).filter(e => e.cliente_id === O[1]).sort((e, t) => String(t.updated_at || t.created_at || "").localeCompare(String(e.updated_at || e.created_at || ""))), i);
  // Proposta, decisão, amostras-status e material-requirements: firebaseCommercial.js.
  if ("POST" === e && "/pd/requests" === S) {
    const e = await create(_, "pd_requests", {
        ...r,
        title: r.title || r.project_name || r.product_name,
        status: r.status || "OPEN",
        request_type: r.request_type || "CLIENT"
      }),
      t = await create(_, "pd_developments", {
        request_id: e.id,
        status: "OPEN"
      });
    return await create(_, "pd_cards", {
      pd_request_id: e.id,
      development_id: t.id,
      titulo: e.title,
      nome_produto: e.title,
      cliente_nome: e.client_name || "",
      status_pd: "solicitado"
    }), response(e, i);
  }
  if (O = j(/^\/pd\/developments\/([^/]+)\/formulas$/), "GET" === e && O) {
    const e = await related(_, "pd_formulas", "development_id", O[1]),
      t = await all(_, "pd_formula_items");
    return response(e.map(e => pdEnrichFormula(e, t.filter(t => t.formula_id === e.id))).sort((e, t) => Number(t.version || 0) - Number(e.version || 0)), i);
  }
  if ("POST" === e && O) {
    const e = await related(_, "pd_formulas", "development_id", O[1]),
      t = Math.max(0, ...e.map(e => Number(e.version || 0))) + 1,
      a = await create(_, "pd_formulas", {
        ...r,
        development_id: O[1],
        version: t,
        status: r.status || "DRAFT",
        locked: !1,
        volume: Number(r.volume || 0),
        volume_unit: r.volume_unit || "mL",
        indice_perdas: Number(r.indice_perdas || 0),
        cotacao_usd: Number(r.cotacao_usd || 6),
        created_by: firebaseAuth.currentUser.uid,
        created_by_name: pdUserName(u)
      });
    const o = await one(_, "pd_developments", O[1]);
    o && (await patch(_, "pd_developments", O[1], {
      current_version: t
    }));
    if (o) {
      const e = await one(_, "pd_requests", o.request_id || o.pd_request_id);
      if (e && "OPEN" === (e.status || "OPEN")) {
        await patch(_, "pd_requests", e.id, {
          status: "IN_PROGRESS"
        });
        await create(_, "pd_request_status_history", {
          request_id: e.id,
          pd_request_id: e.id,
          from_status: "OPEN",
          to_status: "IN_PROGRESS",
          comment: "Desenvolvimento iniciado ao criar a primeira fórmula",
          changed_by: firebaseAuth.currentUser.uid,
          changed_by_name: pdUserName(u),
          created_at: now(),
          user_id: firebaseAuth.currentUser.uid
        });
        await pdSyncRequestStatus(_, e, "IN_PROGRESS");
      }
    }
    return response({
      ...a,
      items: []
    }, i);
  }
  if (O = j(/^\/pd\/formulas\/([^/]+)\/items$/), "GET" === e && O) return response(await related(_, "pd_formula_items", "formula_id", O[1]), i);
  if ("POST" === e && O) {
    const e = await one(_, "pd_formulas", O[1]);
    if (!e) throw apiError(404, "Fórmula não encontrada.");
    if (e.locked) throw apiError(409, `Fórmula v${e.version || 1} está registrada e bloqueada. Crie uma nova versão para editar.`);
    const a = r.catalog_id || r.master_material_id || r.material_id,
      o = a ? (await integratedMaterials(_)).find(e => e.id === a || e.master_material_id === a || e.codigo_interno === a) : null,
      s = o ? {
        ...r,
        catalog_id: o.id,
        master_material_id: o.master_material_id || o.id,
        material_code: o.codigo_interno,
        ingredient_name: r.ingredient_name || o.nome,
        unit: r.unit || o.unidade || o.unidade_compra,
        price_per_kg: Number(r.price_per_kg || o.preco_rs_kg || 0),
        supplier_names: o.fornecedor || ""
      } : r,
      t = {
        ...s,
        formula_id: O[1],
        percentage: Number(s.percentage || 0),
        price_per_kg: Number(s.price_per_kg || 0),
        ...pdItemCosts(s, taxaDaFormula(e))
      };
    const erroMp = validarMpNova(t.mp_nova);
    if (erroMp) throw apiError(422, erroMp);
    const criado = await create(_, "pd_formula_items", t);
    await logMpNova(_, null, criado, e, u);
    return response(criado, i);
  }
  if (O = j(/^\/pd\/formula-items\/([^/]+)$/), "PUT" === e && O) {
    const e = await one(_, "pd_formula_items", O[1]);
    if (!e) throw apiError(404, "Ingrediente não encontrado.");
    const t = await one(_, "pd_formulas", e.formula_id);
    if (null !== t && void 0 !== t && t.locked) throw apiError(409, `Fórmula v${t.version || 1} está registrada e bloqueada. Crie uma nova versão para editar.`);
    const a = {
        ...e,
        ...r
      },
      s = r.catalog_id || r.master_material_id || r.material_id,
      n = s ? (await integratedMaterials(_)).find(e => e.id === s || e.master_material_id === s || e.codigo_interno === s) : null,
      d = n ? {
        ...a,
        catalog_id: n.id,
        master_material_id: n.master_material_id || n.id,
        material_code: n.codigo_interno,
        ingredient_name: a.ingredient_name || n.nome,
        unit: a.unit || n.unidade || n.unidade_compra,
        price_per_kg: Number(a.price_per_kg || n.preco_rs_kg || 0),
        supplier_names: n.fornecedor || ""
      } : a,
      o = {
        ...r,
        ...(n ? d : {}),
        ...pdItemCosts(d, taxaDaFormula(t))
      };
    const erroMp = validarMpNova(o.mp_nova === undefined ? e.mp_nova : o.mp_nova);
    if (erroMp) throw apiError(422, erroMp);
    const atualizado = await patch(_, "pd_formula_items", O[1], o);
    await logMpNova(_, e, atualizado, t, u);
    return response(atualizado, i);
  }
  if ("DELETE" === e && O) {
    const e = await one(_, "pd_formula_items", O[1]),
      t = e ? await one(_, "pd_formulas", e.formula_id) : null;
    if (null !== t && void 0 !== t && t.locked) throw apiError(409, `Fórmula v${t.version || 1} está registrada e bloqueada. Crie uma nova versão para editar.`);
    await erase(_, "pd_formula_items", O[1]);
    if (e) await logMpNova(_, e, null, t, u);
    return response({
      deleted: !0
    }, i);
  }
  if (O = j(/^\/pd\/formulas\/([^/]+)\/(duplicate|new-version)$/), "POST" === e && O) {
    const e = await one(_, "pd_formulas", O[1]);
    if (!e) throw apiError(404, "Fórmula não encontrada.");
    if ("new-version" === O[2] && !e.locked) throw apiError(400, "Apenas fórmulas registradas podem ser versionadas. Edite diretamente a fórmula atual.");
    if ("new-version" === O[2] && (!r.justification || r.justification.trim().length < 10)) throw apiError(400, "Justificativa obrigatória para nova versão (mínimo 10 caracteres).");
    const a = await related(_, "pd_formulas", "development_id", e.development_id),
      o = Math.max(0, ...a.map(e => Number(e.version || 0))) + 1,
      t = await create(_, "pd_formulas", {
        ...e,
        id: void 0,
        parent_formula_id: O[1],
        name: "duplicate" === O[2] ? `${e.name || e.nome || "Fórmula"} - cópia` : e.name,
        version: o,
        version_justification: "duplicate" === O[2] ? "Variação duplicada" : r.justification.trim(),
        justification: r.justification || "Variação duplicada",
        locked: !1,
        locked_at: void 0,
        locked_by: void 0,
        locked_by_name: void 0,
        created_by: firebaseAuth.currentUser.uid,
        created_by_name: pdUserName(u),
        status: "DRAFT"
      });
    for (const a of await related(_, "pd_formula_items", "formula_id", O[1])) await create(_, "pd_formula_items", {
      ...a,
      id: void 0,
      formula_id: t.id
    });
    // Fase 3: o passo a passo (fases da receita) acompanha a nova versão.
    for (const fase of await related(_, "pd_formula_phases", "formula_id", O[1])) await create(_, "pd_formula_phases", {
      ...fase,
      id: void 0,
      created_at: void 0,
      formula_id: t.id
    });
    return response({
      ...t,
      items: await related(_, "pd_formula_items", "formula_id", t.id)
    }, i);
  }
  if (O = j(/^\/pd\/formulas\/([^/]+)\/import-into\/([^/]+)$/), "POST" === e && O) {
    const e = await one(_, "pd_formulas", O[1]);
    if (!e) throw apiError(404, "Fórmula de origem não encontrada.");
    const a = await one(_, "pd_developments", O[2]);
    if (!a) throw apiError(404, "Desenvolvimento de destino não encontrado.");
    const o = await related(_, "pd_formulas", "development_id", O[2]),
      s = Math.max(0, ...o.map(e => Number(e.version || 0))) + 1,
      t = await create(_, "pd_formulas", {
        ...e,
        id: void 0,
        development_id: O[2],
        source_formula_id: O[1],
        importada_de_formula_id: O[1],
        version: s,
        locked: !1,
        locked_at: void 0,
        locked_by: void 0,
        locked_by_name: void 0,
        version_justification: "Importada de outra requisição",
        created_by: firebaseAuth.currentUser.uid,
        created_by_name: pdUserName(u),
        status: "DRAFT"
      });
    for (const a of await related(_, "pd_formula_items", "formula_id", O[1])) await create(_, "pd_formula_items", {
      ...a,
      id: void 0,
      formula_id: t.id
    });
    // Fase 3: o passo a passo (fases da receita) acompanha a nova versão.
    for (const fase of await related(_, "pd_formula_phases", "formula_id", O[1])) await create(_, "pd_formula_phases", {
      ...fase,
      id: void 0,
      created_at: void 0,
      formula_id: t.id
    });
    return response({
      ...t,
      items: await related(_, "pd_formula_items", "formula_id", t.id)
    }, i);
  }
  if (O = j(/^\/pd\/formulas\/([^/]+)\/costs$/), "GET" === e && O) return response(await related(_, "pd_formula_costs", "formula_id", O[1]), i);
  if ("POST" === e && O) return response(await create(_, "pd_formula_costs", {
    ...r,
    formula_id: O[1]
  }), i);
  if (O = j(/^\/pd\/formulas\/([^/]+)\/phases$/), "GET" === e && O) return response((await related(_, "pd_formula_phases", "formula_id", O[1])).sort((e, t) => Number(e.order || 0) - Number(t.order || 0)), i);
  if ("POST" === e && O) return response(await create(_, "pd_formula_phases", {
    ...r,
    formula_id: O[1]
  }), i);
  if (O = j(/^\/pd\/formulas\/([^/]+)\/phases\/reorder$/), "PUT" === e && O) {
    for (const [e, t] of (r.phase_ids || []).entries()) await patch(_, "pd_formula_phases", t, {
      order: e
    });
    return response({
      success: !0
    }, i);
  }
  if (O = j(/^\/pd\/formula-phases\/([^/]+)$/), "PUT" === e && O) return response(await patch(_, "pd_formula_phases", O[1], r), i);
  if ("DELETE" === e && O) return await erase(_, "pd_formula_phases", O[1]), response({
    deleted: !0
  }, i);
  if (O = j(/^\/pd\/formulas\/([^/]+)$/), "PUT" === e && O) return response(await patch(_, "pd_formulas", O[1], r), i);
  const y = {
    "sample-batches": "pd_sample_batches",
    samples: "pd_samples",
    documents: "pd_documents",
    tests: "pd_tests"
  };
  // COM-02: contatos do cliente para o modal de aprovação (a partir do projeto ou da amostra).
  if (O = j(/^\/crm\/contatos-aprovacao\/(projeto|amostra)\/([^/]+)$/), O && "GET" === e) {
    const amostra = "amostra" === O[1] ? await one(_, "crm_samples", O[2]) : null;
    const projeto = await one(_, "crm_projects", "projeto" === O[1] ? O[2] : amostra?.projeto_id || "__nenhum__");
    const clienteId = projeto?.cliente_id || amostra?.cliente_id;
    const cliente = clienteId ? await one(_, "crm_clients", clienteId) : null;
    return response({ cliente: cliente?.nome_empresa || "", contatos: contatosDoCliente(cliente) }, i);
  }
  // AMO-02: base vigente do projeto da amostra, para as demais amostras do mesmo projeto.
  if (O = j(/^\/pd\/developments\/([^/]+)\/base-projeto$/), O && "GET" === e) {
    const { projetoId } = await projetoDoDesenvolvimento(_, O[1]);
    const base = projetoId ? baseVigente(await related(_, "pd_formulacoes_base", "projeto_id", projetoId)) : null;
    return response({ projeto_id: projetoId, base }, i);
  }
  if (O = j(/^\/pd\/developments\/([^/]+)\/(sample-batches|samples|documents|tests)$/), O && "GET" === e) return response(await related(_, y[O[2]], "development_id", O[1]), i);
  if (O && "POST" === e) {
    const e = await one(_, "pd_developments", O[1]);
    if (!e) throw apiError(404, "Desenvolvimento não encontrado.");
    let t = {
      ...r,
      development_id: O[1]
    };
    if ("sample-batches" === O[2]) {
      const e = await one(_, "pd_formulas", r.formula_base_id);
      if (!e || e.development_id !== O[1]) throw apiError(404, "Fórmula base não encontrada para este desenvolvimento.");
      t = {
        ...(await aplicarBaseDoProjeto(_, O[1], pdSampleBatch(r, O[1]), u)),
        created_at: now(),
        created_by: firebaseAuth.currentUser.uid,
        created_by_name: pdUserName(u)
      };
    }
    if ("samples" === O[2]) Object.assign(t, {
      sent_at: r.sent_to_client ? now() : null
    });
    if ("documents" === O[2]) Object.assign(t, {
      uploaded_at: now(),
      uploaded_by: firebaseAuth.currentUser.uid,
      uploaded_by_name: pdUserName(u)
    });
    if ("tests" === O[2]) Object.assign(t, {
      status: r.status || "PENDING",
      dados: r.dados || {},
      created_by: firebaseAuth.currentUser.uid,
      created_by_name: pdUserName(u)
    });
    return response(await create(_, y[O[2]], t), i);
  }
  if (O = j(/^\/pd\/developments\/([^/]+)\/sample-batches\/([^/]+)$/), "PUT" === e && O) {
    const e = await one(_, "pd_sample_batches", O[2]),
      t = await one(_, "pd_formulas", r.formula_base_id);
    if (!e || e.development_id !== O[1]) throw apiError(404, "Lote não encontrado.");
    if (!t || t.development_id !== O[1]) throw apiError(404, "Fórmula base não encontrada para este desenvolvimento.");
    return response(await save(_, "pd_sample_batches", O[2], {
      ...e,
      ...(await aplicarBaseDoProjeto(_, O[1], pdSampleBatch(r, O[1], O[2]), u)),
      created_at: e.created_at,
      created_by: e.created_by,
      created_by_name: e.created_by_name
    }), i);
  }
  if ("DELETE" === e && O) return await erase(_, "pd_sample_batches", O[2]), response({
    deleted: !0
  }, i);
  if (O = j(/^\/pd\/tests\/([^/]+)$/), O && "PUT" === e) return response(await patch(_, "pd_tests", O[1], r), i);
  if (O && "DELETE" === e) return await erase(_, "pd_tests", O[1]), response({
    deleted: !0
  }, i);
  if (O = j(/^\/pd\/samples\/([^/]+)$/), "PUT" === e && O) {
    const e = await one(_, "pd_samples", O[1]);
    if (!e) throw apiError(404, "Amostra não encontrada.");
    if (Object.prototype.hasOwnProperty.call(r, "client_approved") && !r.sent_to_client && !e.sent_to_client) throw apiError(409, "Amostra precisa ser enviada ao cliente antes de registrar aprovação externa.");
    return response(await patch(_, "pd_samples", O[1], {
      ...r,
      sent_at: r.sent_to_client ? now() : e.sent_at
    }), i);
  }
  if (O = j(/^\/pd\/documents\/([^/]+)$/), "DELETE" === e && O) return await erase(_, "pd_documents", O[1]), response({
    deleted: !0
  }, i);
  if (O = j(/^\/pd\/developments\/([^/]+)\/approval$/), "POST" === e && O) {
    const e = (await related(_, "pd_approvals", "development_id", O[1]))[0],
      t = {
        ...r,
        development_id: O[1],
        approval_date: now(),
        approved_by_user: firebaseAuth.currentUser.uid,
        approved_by_user_name: pdUserName(u)
      };
    const gravada = e ? await patch(_, "pd_approvals", e.id, t) : await create(_, "pd_approvals", t);
    // Fase 4: aprovação do cliente registrada aqui também abre a fila de cadastro das MPs novas.
    if (r.approved_by_client === true && !(e && e.approved_by_client)) {
      const dev = await one(_, "pd_developments", O[1]);
      const requestId = dev && (dev.request_id || dev.pd_request_id);
      if (requestId) await enfileirarSemTravar(_, requestId, pdUserName(u));
    }
    return response(gravada, i);
  }
  if (O = j(/^\/pd\/developments\/([^/]+)\/lab-results$/), "PUT" === e && O) {
    const e = await one(_, "pd_developments", O[1]);
    if (!e) throw apiError(404, "Desenvolvimento não encontrado.");
    const t = (await related(_, "pd_lab_results", "development_id", O[1]))[0],
      a = {
        ...(t || {}),
        ...r,
        development_id: O[1],
        updated_at: now(),
        updated_by: firebaseAuth.currentUser.uid,
        updated_by_name: pdUserName(u)
      };
    return response(t ? await patch(_, "pd_lab_results", t.id, a) : await create(_, "pd_lab_results", a), i);
  }
  if (O = j(/^\/pd\/developments\/([^/]+)\/cost-versions$/), "GET" === e && O) {
    const e = (await related(_, "pd_cost_versions", "development_id", O[1]))[0] || null,
      t = await related(_, "pd_formulas", "development_id", O[1]),
      a = await all(_, "pd_formula_items"),
      r = t.map(e => pdEnrichFormula(e, a.filter(t => t.formula_id === e.id))),
      o = pdFormulaCostData(r);
    return response(pdCostVersions(e, null === o || void 0 === o ? void 0 : o.total_cost_per_kg), i);
  }
  if (O = j(/^\/pd\/developments\/([^/]+)\/cost-versions\/(v1|v2)(?:\/(submit|finalize))?$/), O && ["PUT", "POST"].includes(e)) {
    const e = await one(_, "pd_developments", O[1]);
    if (!e) throw apiError(404, "Desenvolvimento não encontrado.");
    let t = (await related(_, "pd_cost_versions", "development_id", O[1]))[0] || null;
    const a = await related(_, "pd_formulas", "development_id", O[1]),
      o = await all(_, "pd_formula_items"),
      s = pdFormulaCostData(a.map(e => pdEnrichFormula(e, o.filter(t => t.formula_id === e.id)))),
      d = Number((null === s || void 0 === s ? void 0 : s.total_cost_per_kg) || 0);
    let g = t || {
      development_id: O[1],
      v1: null,
      v2: null,
      total_final: 0
    };
    if ("v1" === O[2] && !O[3]) {
      if ("enviado" === (null === g.v1 || void 0 === g.v1 ? void 0 : g.v1.status)) throw apiError(409, "Custo v1 já enviado para análise comercial.");
      const e = Number(r.ingredient_cost_manual || 0);
      g = {
        ...g,
        v1: {
          ingredient_cost_auto: d,
          ingredient_cost_manual: e,
          total: Number((d + e).toFixed(4)),
          notes: r.notes || "",
          status: "rascunho",
          submitted_at: null,
          submitted_by_name: null
        },
        updated_at: now()
      };
    } else if ("v1" === O[2] && "submit" === O[3]) {
      if (!g.v1) throw apiError(400, "Salve um rascunho de custo antes de enviar.");
      g = {
        ...g,
        v1: {
          ...g.v1,
          status: "enviado",
          submitted_at: now(),
          submitted_by_name: pdUserName(u)
        },
        updated_at: now()
      };
    } else if ("v2" === O[2] && !O[3]) {
      if ("enviado" !== (null === g.v1 || void 0 === g.v1 ? void 0 : g.v1.status)) throw apiError(400, "Aguardando envio do custo v1 pelo P&D.");
      if ("finalizado" === (null === g.v2 || void 0 === g.v2 ? void 0 : g.v2.status)) throw apiError(409, "Custo v2 já foi finalizado.");
      const e = Number(r.packaging_cost || 0) + Number(r.labor_cost || 0) + Number(r.overhead_cost || 0) + Number(r.other_cost || 0);
      g = {
        ...g,
        v2: {
          ...r,
          total: Number(e.toFixed(4)),
          status: "rascunho"
        },
        total_final: Number((Number(g.v1.total || 0) + e).toFixed(4)),
        updated_at: now()
      };
    } else if ("v2" === O[2] && "finalize" === O[3]) {
      if (!g.v2) throw apiError(400, "Salve os dados de custo comercial antes de finalizar.");
      g = {
        ...g,
        v2: {
          ...g.v2,
          status: "finalizado",
          finalized_at: now(),
          finalized_by_name: pdUserName(u),
          approved_by_commercial: !0
        },
        updated_at: now()
      };
    }
    t = t ? await save(_, "pd_cost_versions", t.id, {
      ...g,
      id: t.id
    }) : await create(_, "pd_cost_versions", g);
    return response(pdCostVersions(t, d), i);
  }
  if ("/pd/catalog" === S && "GET" === e) {
    let e = await integratedMaterials(_);
    // PD-02: a manipulação pede tipo_material=MPES,MPGR; o Banco de Custos segue sem filtro.
    const tiposPd = tiposDoFiltro(q.tipo_material);
    tiposPd && (e = filtrarMateriaisPd(e, tiposPd));
    return q.q && (e = e.filter(e => contains(e, q.q, ["nome", "inci", "codigo_interno", "fornecedor", "fornecedores"]))), q.categoria && (e = e.filter(e => e.categoria === q.categoria)), response(e.sort((e, t) => String(e.nome || "").localeCompare(String(t.nome || ""))), i);
  }
  if ("/pd/catalog" === S && "POST" === e) return response(await create(_, "pd_catalog", {
    ...r,
    preco_rs_kg: Number(r.preco_rs_kg || 0),
    moeda: r.moeda || "BRL",
    unidade: r.unidade || "kg",
    fornecedores: r.fornecedores || [],
    ultima_atualizacao: now(),
    atualizado_por: pdUserName(u),
    atualizado_por_id: firebaseAuth.currentUser.uid,
    created_by: firebaseAuth.currentUser.uid,
    created_by_name: pdUserName(u)
  }), i);
  if (O = j(/^\/pd\/catalog\/([^/]+)\/price-history$/), "GET" === e && O) return response(await related(_, "pd_catalog_price_history", "catalog_id", O[1]), i);
  if (O = j(/^\/pd\/catalog\/([^/]+)$/), "PUT" === e && O) {
    const e = await one(_, "pd_catalog", O[1]),
      a = await masterOne("materiais", O[1]),
      t = e ? await patch(_, "pd_catalog", O[1], r) : a ? await save(_, "pd_catalog", O[1], {
        ...r,
        master_material_id: O[1],
        codigo_interno: a.mpCodigo || O[1],
        nome: r.nome || a.mpNome || O[1],
        origem_integracao: "cadastro_materiais",
        created_at: now(),
        updated_at: now()
      }) : await patch(_, "pd_catalog", O[1], r);
    return void 0 !== r.preco_rs_kg && Number(r.preco_rs_kg) !== Number((null === e || void 0 === e ? void 0 : e.preco_rs_kg) || 0) && (await create(_, "pd_catalog_price_history", {
      catalog_id: O[1],
      catalog_item_id: O[1],
      old_price: null === e || void 0 === e ? void 0 : e.preco_rs_kg,
      new_price: Number(r.preco_rs_kg),
      preco_anterior: null === e || void 0 === e ? void 0 : e.preco_rs_kg,
      preco_novo: Number(r.preco_rs_kg),
      updated_by: firebaseAuth.currentUser.uid,
      updated_by_name: pdUserName(u),
      created_at: now()
    })), response(await patch(_, "pd_catalog", O[1], {
      ultima_atualizacao: now(),
      atualizado_por: pdUserName(u),
      atualizado_por_id: firebaseAuth.currentUser.uid
    }), i);
  }
  if ("DELETE" === e && O) {
    if (await masterOne("materiais", O[1])) throw apiError(409, "Item originado no Cadastro Mestre. Desative-o em Cadastros, sem excluir pelo P&D.");
    for (const e of (await all(_, "pd_formula_items")).filter(e => e.catalog_id === O[1])) await patch(_, "pd_formula_items", e.id, {
      catalog_id: null
    });
    for (const e of (await all(_, "pd_catalog_price_history")).filter(e => e.catalog_id === O[1] || e.catalog_item_id === O[1])) await erase(_, "pd_catalog_price_history", e.id);
    return await erase(_, "pd_catalog", O[1]), response({
      deleted: !0
    }, i);
  }
  if ("/compras/itens" === S && "GET" === e) {
    let e = await integratedMaterials(_);
    return q.q && (e = e.filter(e => contains(e, q.q, ["nome", "descricao", "codigo_interno", "fornecedor"]))), q.categoria && (e = e.filter(e => e.categoria === q.categoria)), response({
      itens: e.slice(0, Number(q.limit || 200)),
      total: e.length
    }, i);
  }
  if ("/compras/itens" === S && "POST" === e) return response(await create(_, "pd_catalog", {
    ...r,
    nome: r.nome || r.descricao,
    unidade: r.unidade || r.unidade_compra || "un",
    created_by: firebaseAuth.currentUser.uid,
    created_by_name: pdUserName(u)
  }), i);
  if (O = j(/^\/compras\/itens\/([^/]+)$/), "GET" === e && O) {
    const e = (await integratedMaterials(_)).find(e => e.id === O[1] || e.master_material_id === O[1]);
    if (!e) throw apiError(404, "Item de compra não encontrado.");
    return response(e, i);
  }
  if ("/pd/stock" === S && "GET" === e) {
    let e = await all(_, "pd_stock");
    return q.categoria && (e = e.filter(e => e.categoria === q.categoria)), q.q && (e = e.filter(e => contains(e, q.q, ["nome", "codigo_interno", "formula_ref"]))), "true" === String(q.low_stock) && (e = e.filter(e => Number(e.quantidade_minima || 0) > 0 && Number(e.quantidade_atual || 0) <= Number(e.quantidade_minima || 0))), response(e.sort((e, t) => String(e.nome || "").localeCompare(String(t.nome || ""))), i);
  }
  if ("/pd/stock" === S && "POST" === e) {
    const t = await create(_, "pd_stock", {
      ...r,
      quantidade_atual: Number(r.quantidade_atual || 0),
      quantidade_minima: Number(r.quantidade_minima || 0),
      custo_unitario: Number(r.custo_unitario || 0),
      created_by: firebaseAuth.currentUser.uid,
      created_by_name: pdUserName(u)
    });
    if (Number(t.quantidade_atual || 0) > 0) await create(_, "pd_stock_movements", {
      stock_id: t.id,
      stock_item_id: t.id,
      tipo: "entrada",
      type: "IN",
      quantidade: Number(t.quantidade_atual),
      quantity: Number(t.quantidade_atual),
      saldo_anterior: 0,
      saldo_novo: Number(t.quantidade_atual),
      motivo: "Estoque inicial",
      lote: t.lote || null,
      user_id: firebaseAuth.currentUser.uid,
      user_name: pdUserName(u),
      created_at: now()
    });
    return response(t, i);
  }
  if ("/pd/stock/alerts" === S && "GET" === e) {
    const e = await all(_, "pd_stock"),
      t = new Date(Date.now() + 30 * 864e5);
    return response({
      low_stock: e.filter(e => Number(e.quantidade_minima || 0) > 0 && Number(e.quantidade_atual || 0) <= Number(e.quantidade_minima || 0)),
      expiring: e.filter(e => e.validade && new Date(e.validade) <= t)
    }, i);
  }
  if ("/pd/stock/check-product" === S && "GET" === e) {
    const e = (await all(_, "pd_stock")).find(e => contains(e, q.produto_nome, ["product_name", "produto_nome", "nome"]));
    return response({
      available: !!e && Number(e.quantidade_atual || e.quantity || e.quantidade || 0) > 0,
      item: e
    }, i);
  }
  if ("/pd/stock/movements" === S && "GET" === e) {
    let e = await all(_, "pd_stock_movements");
    return q.tipo && (e = e.filter(e => (e.tipo || e.type) === q.tipo)), response(e.sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))).slice(0, Number(q.limit || 500)), i);
  }
  if (O = j(/^\/pd\/stock\/([^/]+)\/movements$/), "GET" === e && O) return response((await all(_, "pd_stock_movements")).filter(e => e.stock_id === O[1] || e.stock_item_id === O[1]).sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))), i);
  if ("POST" === e && O) {
    const t = await one(_, "pd_stock", O[1]);
    if (!t) throw apiError(404, "Item de estoque não encontrado.");
    const a = Number(t.quantidade_atual || 0),
      d = Number(r.quantity || r.quantidade || 0),
      g = String(r.type || r.tipo || "entrada").toLowerCase(),
      b = ["out", "saida", "saída"].includes(g) ? a - d : "ajuste" === g ? d : a + d;
    if (b < 0) throw apiError(400, "Saldo insuficiente para esta saída.");
    const e = await create(_, "pd_stock_movements", {
      ...r,
      stock_id: O[1],
      stock_item_id: O[1],
      saldo_anterior: a,
      saldo_novo: b,
      user_id: firebaseAuth.currentUser.uid,
      user_name: pdUserName(u),
      created_at: now()
    });
    return await patch(_, "pd_stock", O[1], {
      quantidade_atual: b,
      updated_at: now()
    }), response(e, i);
  }
  if (O = j(/^\/pd\/stock\/([^/]+)$/), "PUT" === e && O) return response(await patch(_, "pd_stock", O[1], r), i);
  if ("DELETE" === e && O) {
    for (const e of (await all(_, "pd_stock_movements")).filter(e => e.stock_id === O[1] || e.stock_item_id === O[1])) await erase(_, "pd_stock_movements", e.id);
    return await erase(_, "pd_stock", O[1]), response({
      deleted: !0
    }, i);
  }
  const R = {
    fornecedores: "pd_homologacao_fornecedores",
    mps: "pd_homologacao_mps"
  };
  if (O = j(/^\/pd\/homologacao\/(fornecedores|mps)$/), O && "GET" === e) {
    let e = await all(_, R[O[1]]);
    return q.status && (e = e.filter(e => e.status === q.status)), q.tipo_mp && (e = e.filter(e => e.tipo_mp === q.tipo_mp)), (q.search || q.q) && (e = e.filter(e => contains(e, q.search || q.q, ["razao_social", "nome_fantasia", "cnpj", "nome", "inci", "codigo_interno", "fornecedor_nome"]))), response(e, i);
  }
  if (O && "POST" === e) return response(await create(_, R[O[1]], {
    ...r,
    status: r.status || "pendente",
    historico: r.historico || [],
    created_by: firebaseAuth.currentUser.uid,
    created_by_name: pdUserName(u)
  }), i);
  if (O = j(/^\/pd\/homologacao\/(fornecedores|mps)\/([^/]+)$/), O && "PUT" === e) return response(await patch(_, R[O[1]], O[2], r), i);
  if (O && "DELETE" === e) return await erase(_, R[O[1]], O[2]), response({
    deleted: !0
  }, i);
  if (O = j(/^\/pd\/homologacao\/(fornecedores|mps)\/([^/]+)\/(aprovar|reprovar|avaliar|homologar)$/), O && "POST" === e) {
    const e = await one(_, R[O[1]], O[2]);
    if (!e) throw apiError(404, "Registro de homologação não encontrado.");
    const t = !1 === r.aprovado || "reprovar" === O[3] ? "mps" === O[1] ? "reprovada" : "reprovado" : "mps" === O[1] ? "homologada" : "homologado",
      a = {
        evento: t,
        por: pdUserName(u),
        por_id: firebaseAuth.currentUser.uid,
        data: now(),
        parecer: r.parecer || r.parecer_homologacao || ""
      };
    return response(await patch(_, R[O[1]], O[2], {
      ...r,
      status: t,
      parecer_homologacao: a.parecer,
      homologado_por: pdUserName(u),
      homologado_por_id: firebaseAuth.currentUser.uid,
      data_homologacao: a.data,
      historico: [...(e.historico || []), a]
    }), i);
  }
  if ("/pd/homologacao/dashboard" === S && "GET" === e) {
    const e = await all(_, "pd_homologacao_fornecedores"),
      t = await all(_, "pd_homologacao_mps"),
      a = (e, t) => e.reduce((e, a) => ({
        ...e,
        [a[t] || ""]: (e[a[t] || ""] || 0) + 1
      }), {}),
      r = t.filter(e => ["reprovada", "suspensa", "bloqueada"].includes(e.status));
    return response({
      fornecedores: {
        total: e.length,
        por_status: a(e, "status"),
        por_categoria: a(e, "categoria")
      },
      mps: {
        total: t.length,
        por_status: a(t, "status"),
        por_tipo: a(t, "tipo_mp"),
        bloqueadas_total: r.length
      },
      alertas: {
        fornecedor_unico: [],
        risco_fornecimento: [],
        mps_bloqueadas: r.slice(0, 50).map(e => ({
          id: e.id,
          nome: e.nome,
          status: e.status,
          fornecedor_nome: e.fornecedor_nome || ""
        }))
      },
      total_fornecedores: e.length,
      fornecedores_aprovados: e.filter(e => "homologado" === e.status).length,
      total_mps: t.length,
      mps_aprovadas: t.filter(e => "homologada" === e.status).length
    }, i);
  }
  if (O = j(/^\/pd\/requests\/([^/]+)\/(updates|pending)$/), O && "GET" === e) {
    let e = (await all(_, "updates" === O[2] ? "pd_updates" : "pd_pending_items")).filter(e => e.request_id === O[1] || e.pd_request_id === O[1]);
    return "pending" === O[2] && q.status && (e = e.filter(e => e.status === q.status)), response(e.map(e => "pending" === O[2] ? {
      ...e,
      status_calc: "pendente" === e.status && e.data_prevista && new Date(e.data_prevista) < new Date() ? "atrasado" : e.status
    } : e).sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))), i);
  }
  if (O = j(/^\/pd\/requests\/([^/]+)\/(updates|pending)$/), O && "POST" === e) {
    const e = await one(_, "pd_requests", O[1]);
    if (!e) throw apiError(404, "Solicitação não encontrada.");
    const t = now(),
      a = "updates" === O[2],
      o = await create(_, a ? "pd_updates" : "pd_pending_items", a ? {
        ...r,
        request_id: O[1],
        pd_request_id: O[1],
        tipo: r.tipo || "observacao",
        mensagem: String(r.mensagem || "").trim(),
        visivel_comercial: !!r.visivel_comercial,
        recebido: !1,
        recebido_em: null,
        user_id: firebaseAuth.currentUser.uid,
        user_name: pdUserName(u),
        user_role: u.role || "",
        created_at: t
      } : {
        ...r,
        request_id: O[1],
        pd_request_id: O[1],
        descricao: String(r.descricao || "").trim(),
        fornecedor: String(r.fornecedor || "").trim(),
        observacoes: String(r.observacoes || "").trim(),
        data_solicitacao: t,
        data_recebido: null,
        status: "pendente",
        user_id: firebaseAuth.currentUser.uid,
        user_name: pdUserName(u),
        created_at: t,
        updated_at: t
      });
    if (!a) await create(_, "pd_updates", {
      request_id: O[1],
      pd_request_id: O[1],
      tipo: "pendencia_criada",
      mensagem: `Solicitado(a) ${r.tipo}: ${r.descricao}${r.data_prevista ? ` — previsão ${r.data_prevista}` : ""}`,
      visivel_comercial: !0,
      user_id: firebaseAuth.currentUser.uid,
      user_name: pdUserName(u),
      user_role: u.role || "",
      pending_item_id: o.id,
      created_at: t
    });
    return response(o, i);
  }
  if (O = j(/^\/pd\/(updates|pending)\/([^/]+)(?:\/received)?$/), O && "PUT" === e) {
    const e = "updates" === O[1] ? "pd_updates" : "pd_pending_items",
      t = await one(_, e, O[2]);
    if (!t) throw apiError(404, "Registro não encontrado.");
    let a = r;
    if (S.endsWith("/received")) a = {
      recebido: !0,
      recebido_em: now(),
      recebido_por: firebaseAuth.currentUser.uid,
      recebido_por_nome: pdUserName(u)
    };else if ("pd_pending_items" === e && "recebido" === r.status && "recebido" !== t.status) {
      a = {
        ...r,
        data_recebido: now(),
        updated_at: now()
      };
      await create(_, "pd_updates", {
        request_id: t.request_id || t.pd_request_id,
        pd_request_id: t.pd_request_id || t.request_id,
        tipo: "pendencia_resolvida",
        mensagem: `Recebido(a): ${t.descricao}`,
        visivel_comercial: !0,
        user_id: firebaseAuth.currentUser.uid,
        user_name: pdUserName(u),
        user_role: u.role || "",
        pending_item_id: t.id,
        created_at: now()
      });
    }
    return response(await patch(_, e, O[2], a), i);
  }
  if (O && "DELETE" === e) return await erase(_, "updates" === O[1] ? "pd_updates" : "pd_pending_items", O[2]), response({
    deleted: !0
  }, i);
  if (O = j(/^\/pd\/requests\/([^/]+)\/ficha-tecnica-ui$/), "GET" === e && O) {
    const e = await one(_, "pd_requests", O[1]);
    if (!e) throw apiError(404, "Solicitação P&D não encontrada.");
    const t = (await all(_, "pd_developments")).find(e => e.request_id === O[1] || e.pd_request_id === O[1]) || null,
      a = t ? (await related(_, "pd_formulas", "development_id", t.id)).sort((e, t) => Number(t.version || 0) - Number(e.version || 0))[0] || null : null,
      r = a ? await related(_, "pd_formula_items", "formula_id", a.id) : [],
      formulaPhases = a ? await related(_, "pd_formula_phases", "formula_id", a.id) : [],
      o = (await related(_, "pd_ficha_tecnica", "request_id", O[1]))[0] || (await related(_, "pd_ficha_tecnica", "pd_request_id", O[1]))[0] || {},
      s = t ? (await related(_, "pd_lab_results", "development_id", t.id))[0] || (null === t || void 0 === t ? void 0 : t.lab_results) || {} : {},
      d = {
        ...o
      };
    for (const [e, t] of Object.entries({
      aspecto: null === s.sensorial || void 0 === s.sensorial ? void 0 : s.sensorial.aspecto,
      cor: null === s.sensorial || void 0 === s.sensorial ? void 0 : s.sensorial.cor,
      odor: null === s.sensorial || void 0 === s.sensorial ? void 0 : s.sensorial.odor,
      ph: (null === s.ph || void 0 === s.ph ? void 0 : s.ph.valor_medido) || (null === s.ph || void 0 === s.ph ? void 0 : s.ph.valor),
      densidade: "",
      teor_alcool: ""
    })) {
      const a = d[e] && "object" === typeof d[e] ? d[e] : {
        especificacao: "",
        resultado: d[e] || "",
        pa: ""
      };
      d[e] = {
        especificacao: a.especificacao || "",
        resultado: a.resultado || t || "",
        pa: a.pa || ""
      };
    }
    return response({
      request: e,
      development: t,
      formula: a,
      formula_items: r,
      formula_phases: formulaPhases,
      analise: d,
      lab_results: s,
      auto_filled: {}
    }, i);
  }
  if ("PUT" === e && O) {
    const e = await one(_, "pd_requests", O[1]);
    if (!e) throw apiError(404, "Solicitação P&D não encontrada.");
    const t = (await all(_, "pd_developments")).find(e => e.request_id === O[1] || e.pd_request_id === O[1]) || null,
      a = (await related(_, "pd_ficha_tecnica", "request_id", O[1]))[0] || (await related(_, "pd_ficha_tecnica", "pd_request_id", O[1]))[0],
      o = {
        ...(a || {}),
        ...r,
        request_id: O[1],
        pd_request_id: O[1],
        development_id: null === t || void 0 === t ? void 0 : t.id,
        updated_at: now(),
        updated_by: firebaseAuth.currentUser.uid,
        updated_by_name: pdUserName(u)
      };
    return response(a ? await save(_, "pd_ficha_tecnica", a.id, {
      ...o,
      id: a.id
    }) : await create(_, "pd_ficha_tecnica", o), i);
  }
  if (O = j(/^\/pd\/requests\/([^/]+)\/link-to-crm$/), "PUT" === e && O) return response(await patch(_, "pd_requests", O[1], r), i);
  if (O = j(/^\/pd\/requests\/([^/]+)\/stability-study$/), "GET" === e && O) {
    const e = await one(_, "pd_requests", O[1]);
    if (!e) throw apiError(404, "Solicitação P&D não encontrada.");
    let t = (await all(_, "pd_stability_studies")).find(e => e.request_id === O[1] || e.pd_card_id === O[1]) || null;
    if (!t) {
      const a = now();
      t = await create(_, "pd_stability_studies", {
        request_id: O[1],
        pd_card_id: O[1],
        amostra_id: e.crm_sample_id || e.linked_amostra_id,
        amostra_variacao_id: e.crm_variacao_id || e.linked_variacao_id,
        status: "ativo",
        started_at: a,
        updated_at: a,
        conditions: PD_STABILITY_CONDITIONS.map(e => ({
          ...e,
          completed_day_offsets: [],
          next_due_day_offset: e.checkpoints[0],
          next_due_at: a
        })),
        summary: {
          overall_status: "pendente_d0",
          completed_readings: 0
        }
      });
    }
    const a = (await related(_, "pd_stability_readings", "study_id", t.id)).sort((e, t) => Number(e.day_offset || 0) - Number(t.day_offset || 0));
    return response({
      study: t,
      readings: a,
      constants: {
        conditions: PD_STABILITY_CONDITIONS,
        parameters: PD_STABILITY_PARAMETERS,
        checkpoints: [1, 2, 7, 30, 60, 90]
      }
    }, i);
  }
  if (O = j(/^\/pd\/stability\/studies\/([^/]+)\/readings$/), "POST" === e && O) {
    const e = await one(_, "pd_stability_studies", O[1]);
    if (!e) throw apiError(404, "Estudo de estabilidade não encontrado.");
    const t = PD_STABILITY_CONDITIONS.find(e => e.code === r.condition_code);
    if (!t) throw apiError(400, "Condição de estabilidade inválida.");
    if (!t.checkpoints.includes(Number(r.day_offset))) throw apiError(400, "Checkpoint inválido para esta condição.");
    const a = await related(_, "pd_stability_readings", "study_id", O[1]);
    if (a.some(e => e.condition_code === r.condition_code && Number(e.day_offset) === Number(r.day_offset))) throw apiError(409, "Já existe leitura registrada para esta condição e checkpoint.");
    // Fase 6: um checkpoint por vez, no prazo (24 h D24h→D48h, 5 d D48h→D7…) e completo.
    const condicaoEstudo = (e.conditions || []).find((c) => c.code === r.condition_code) || t;
    const erroSequencia = validarLeitura({
      checkpoints: condicaoEstudo.checkpoints || t.checkpoints, leituras: a.filter((l) => l.condition_code === r.condition_code),
      iniciadoEm: e.started_at || e.created_at, agora: now(), parametros: PD_STABILITY_PARAMETERS,
      dia: r.day_offset, valores: r.parameters || {}, admin: isAdmin(u),
    });
    if (erroSequencia) throw apiError(422, erroSequencia);
    const o = await create(_, "pd_stability_readings", {
        ...r,
        study_id: O[1],
        condition_label: t.label,
        // A hora da leitura é a do registro: o prazo do próximo checkpoint conta daqui (ADM pode lançar com data).
        reading_at: isAdmin(u) && r.reading_at ? r.reading_at : now(),
        created_by: firebaseAuth.currentUser.uid,
        created_by_name: pdUserName(u)
      }),
      s = (e.conditions || []).map(e => e.code === r.condition_code ? {
        ...e,
        completed_day_offsets: [...new Set([...(e.completed_day_offsets || []), Number(r.day_offset)])].sort((e, t) => e - t),
        last_reading_at: o.reading_at
      } : e),
      d = await patch(_, "pd_stability_studies", O[1], {
        conditions: s,
        summary: {
          overall_status: "em_dia",
          completed_readings: a.length + 1
        }
      });
    return response({
      reading: o,
      study: d
    }, i);
  }
  if ("POST" === e && "/upload" === S) {
    const e = "undefined" !== typeof FormData && r instanceof FormData ? [...r.values()].find(e => e instanceof File) : null;
    if (!e) throw apiError(400, "Arquivo nao informado.");
    try {
      const t = storageRef(firebaseStorage, `erp/${_}/uploads/${id()}-${e.name}`);
      return await uploadBytes(t, e, {
        contentType: e.type || "application/octet-stream"
      }), response({
        url: await getDownloadURL(t),
        filename: e.name
      }, i);
    } catch {
      if (e.size > 5242880) throw apiError(413, "Arquivo maior que 5 MB. Ative o Firebase Storage para anexos grandes.");
      const t = await new Promise((t, a) => {
          const r = new FileReader();
          r.onload = () => t(r.result), r.onerror = () => a(r.error), r.readAsDataURL(e);
        }),
        a = await create(_, "uploads", {
          filename: e.name,
          content_type: e.type,
          size: e.size,
          url: t
        });
      return response({
        url: a.url,
        filename: e.name,
        id: a.id,
        storage: "database"
      }, i);
    }
  }
  if (O = j(/^\/pd\/requests\/([^/]+)\/ficha-tecnica$/), "GET" === e && O) return response(await fichaTecnicaHtml(_, O[1], true), i);
  if (O = j(/^\/pd\/samples\/([^/]+)\/tech-sheet\.pdf$/), "GET" === e && O) {
    const pedido = (await all(_, "pd_requests")).find((x) => x.crm_sample_id === O[1] || x.linked_amostra_id === O[1]);
    if (!pedido) throw apiError(404, "Nenhuma solicitação P&D vinculada a esta amostra.");
    return response(await fichaTecnicaHtml(_, pedido.id, false), i);
  }
  if (O = j(/^\/pd\/developments\/([^/]+)\/mp-novas-fila$/), "GET" === e && O) {
    const dev = await one(_, "pd_developments", O[1]);
    const requestId = dev && (dev.request_id || dev.pd_request_id);
    return response(requestId ? (await masterAll("solicitacoes_cadastro_material")).filter((x) => x.origem?.pdRequestId === requestId) : [], i);
  }
  if (O = j(/^\/pd\/developments\/([^/]+)\/mp-novas$/), "GET" === e && O) {
    return response((await related(_, "pd_mp_novas_log", "development_id", O[1])).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))), i);
  }
  if ("GET" === e && (/\.pdf$/.test(S) || S.endsWith("/ficha-tecnica"))) return response(function (e, t) {
    const a = `<!doctype html><meta charset="utf-8"><title>${e}</title><h1>${e}</h1><pre>${JSON.stringify(t, null, 2)}</pre>`;
    return new Blob([a], {
      type: "text/html;charset=utf-8"
    });
  }("Documento Kuryos", {
    path: S,
    generated_at: now()
  }), i);
  if ("GET" === e && "/pd/metrics" === S) {
    const e = await all(_, "pd_requests"),
      t = await all(_, "pd_formulas");
    const a = e.reduce((e, t) => ({
        ...e,
        [t.status || "OPEN"]: (e[t.status || "OPEN"] || 0) + 1
      }), {}),
      r = e.reduce((e, t) => ({
        ...e,
        [t.priority || "Normal"]: (e[t.priority || "Normal"] || 0) + 1
      }), {});
    return response({
      total: e.length,
      total_requests: e.length,
      open_requests: e.filter(e => !["DONE", "CANCELLED", "CONCLUIDO"].includes(e.status)).length,
      total_formulas: t.length,
      by_status: a,
      by_priority: {
        Baixa: 0,
        Normal: 0,
        Alta: 0,
        Urgente: 0,
        ...r
      }
    }, i);
  }
  if (O = j(/^\/workflow\/tasks\/([^/]+)\/decision$/), "PUT" === e && O) {
    const e = await one(_, "workflow_tasks", O[1]);
    if (!e) throw apiError(404, "Tarefa de aprovação não encontrada.");
    if ("rejected" === r.decision && !String(r.comment || "").trim()) throw apiError(400, "Justificativa obrigatória para reprovação.");
    const t = await patch(_, "workflow_tasks", O[1], {
        ...r,
        decision_comment: r.comment || "",
        status: "concluida",
        decided_at: now(),
        decided_by: firebaseAuth.currentUser.uid,
        decided_by_name: pdUserName(u)
      }),
      a = await one(_, "pd_document_versions", e.entity_id);
    if (a) {
      const t = (await related(_, "workflow_tasks", "entity_id", a.id)).filter(e => "pd_document" === e.entity_type),
        r = t.some(e => "rejected" === e.decision),
        i = t.length && t.every(e => "concluida" === e.status && "approved" === e.decision);
      if (r) await patch(_, "pd_document_versions", a.id, {
        status: "reprovado",
        active_for_operation: !1
      });else if (i) {
        for (const e of (await all(_, "pd_document_versions")).filter(e => e.pd_request_id === a.pd_request_id && e.doc_type === a.doc_type && e.id !== a.id && e.active_for_operation)) await patch(_, "pd_document_versions", e.id, {
          active_for_operation: !1
        });
        await patch(_, "pd_document_versions", a.id, {
          status: "aprovado",
          active_for_operation: !0,
          approved_at: now()
        });
      }
    }
    return response(t, i);
  }
  if (O = j(/^\/pd\/requests\/([^/]+)\/live-documents\/([^/]+)\/versions$/), "GET" === e && O) return response((await all(_, "pd_document_versions")).filter(e => (e.request_id === O[1] || e.pd_request_id === O[1]) && (e.document_type === O[2] || e.doc_type === O[2])).sort((e, t) => Number(t.version_number || 0) - Number(e.version_number || 0)), i);
  if (O = j(/^\/pd\/requests\/([^/]+)\/live-documents\/([^/]+)\/generate$/), "POST" === e && O) {
    if (!["ficha_tecnica", "epa"].includes(O[2])) throw apiError(400, "Tipo de documento vivo inválido.");
    const e = await one(_, "pd_requests", O[1]);
    if (!e) throw apiError(404, "Solicitação não encontrada.");
    const t = await pdFullDetail(_, e),
      a = (await all(_, "pd_document_versions")).filter(e => (e.request_id === O[1] || e.pd_request_id === O[1]) && (e.document_type === O[2] || e.doc_type === O[2])),
      o = Math.max(0, ...a.map(e => Number(e.version_number || 0))) + 1,
      s = O[2] === "ficha_tecnica" ? "FT" : "EPA",
      d = {
        request: t.request,
        development: t.development,
        formula: t.formulas[0] || null,
        formula_items: (t.formulas[0] || {}).items || [],
        lab_results: t.lab_results,
        approval: t.approval,
        ficha_tecnica: (await related(_, "pd_ficha_tecnica", "request_id", O[1]))[0] || null
      },
      g = await create(_, "pd_document_versions", {
        ...r,
        request_id: O[1],
        pd_request_id: O[1],
        document_type: O[2],
        doc_type: O[2],
        version_number: o,
        version_code: `${s}-${String(o).padStart(3, "0")}`,
        status: "em_revisao",
        active_for_operation: !1,
        snapshot: d,
        changed_fields: r.changed_fields || [O[2]],
        source_changes: r.source_changes || [],
        source_trigger: "manual",
        generated_by: firebaseAuth.currentUser.uid,
        created_by: firebaseAuth.currentUser.uid,
        created_by_name: pdUserName(u),
        created_at: now()
      });
    await create(_, "workflow_tasks", {
      entity_type: "pd_document",
      entity_id: g.id,
      title: `Aprovar ${g.version_code}`,
      status: "pendente",
      decision: null,
      responsible_id: firebaseAuth.currentUser.uid,
      responsible_name: pdUserName(u),
      due_date: null,
      metadata: {
        approver_role: u.role || "admin"
      },
      created_at: now()
    });
    return response(g, i);
  }
  if (O = j(/^\/pd\/requests\/([^/]+)\/live-documents\/([^/]+)\/current$/), "GET" === e && O) {
    const e = (await all(_, "pd_document_versions")).filter(e => (e.request_id === O[1] || e.pd_request_id === O[1]) && (e.document_type === O[2] || e.doc_type === O[2])).sort((e, t) => Number(t.version_number || 0) - Number(e.version_number || 0))[0];
    if (!e) throw apiError(404, "Documento vivo não encontrado.");
    return response(e, i);
  }
  if (O = j(/^\/pd\/document-versions\/([^/]+)$/), "GET" === e && O) {
    const e = await one(_, "pd_document_versions", O[1]);
    if (!e) throw apiError(404, "Versão de documento não encontrada.");
    return response(e, i);
  }
  if (O = j(/^\/pd\/document-versions\/([^/]+)\/diff$/), "GET" === e && O) {
    const e = await one(_, "pd_document_versions", O[1]);
    if (!e) throw apiError(404, "Versão de documento não encontrada.");
    const t = (await all(_, "pd_document_versions")).filter(t => t.id !== e.id && (t.request_id === e.request_id || t.pd_request_id === e.pd_request_id) && (t.document_type === e.document_type || t.doc_type === e.doc_type) && Number(t.version_number || 0) < Number(e.version_number || 0) && "reprovado" !== t.status).sort((e, t) => Number(t.version_number || 0) - Number(e.version_number || 0))[0] || null,
      a = pdFlattenSnapshot(e.snapshot || {}),
      r = pdFlattenSnapshot((t || {}).snapshot || {}),
      o = [...new Set([...Object.keys(a), ...Object.keys(r)])].sort().filter(e => a[e] !== r[e]).map(e => ({
        path: e,
        label: e.replaceAll("_", " ").replaceAll(".", " · "),
        before: r[e],
        after: a[e]
      })),
      s = (await related(_, "workflow_tasks", "entity_id", e.id)).filter(e => "pd_document" === e.entity_type);
    return response({
      current: {
        ...e
      },
      previous: t ? {
        id: t.id,
        version_code: t.version_code,
        version_number: t.version_number,
        status: t.status,
        snapshot: t.snapshot
      } : null,
      differences: o,
      changes: o,
      approval_tasks: s
    }, i);
  }
  throw apiError(501, `Rota Firebase ainda n\xe3o adaptada: ${e} ${S}`);
}

// Voltar um card sem justificativa responde 428; pede o texto e repete a chamada.
async function send(method, url, data, config = {}) {
  try {
    return await dispatch(method, url, data, config);
  } catch (error) {
    if (!isJustificationRequired(error) || !["PUT", "POST", "PATCH"].includes(method)) throw error;
    const { message, titulo, botao } = error.response.data.detail;
    const justificativa = await askJustification(message, { titulo, botao });
    if (!justificativa) throw apiError(400, "Retorno cancelado: a justificativa é obrigatória.");
    return dispatch(method, url, { ...(data || {}), justificativa }, config);
  }
}

const firebaseApi = {
  defaults: { baseURL: "firebase://erpkuryos" },
  interceptors: { response: { use: () => {} } },
  request(config = {}) { return send(String(config.method || "GET").toUpperCase(), config.url, config.data, config); },
  get(url, config = {}) { return send("GET", url, undefined, config); },
  post(url, data, config = {}) { return send("POST", url, data, config); },
  put(url, data, config = {}) { return send("PUT", url, data, config); },
  patch(url, data, config = {}) { return send("PATCH", url, data, config); },
  delete(url, config = {}) { return send("DELETE", url, undefined, config); },
};

// Ponte usada pelo PCP (public/shared/crm-pd-master-integration.js).
globalThis.__KURYOS_PD_API__ = firebaseApi;

export default firebaseApi;
