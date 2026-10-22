/* Regras do funil comercial (CRM1 clientes, CRM2 projetos, CRM3 amostras).
 *
 * Porta para o adaptador Firebase as regras do backend do ERP
 * (backend/crm_routes.py: CLIENT_TRANSITIONS, PROJECT_TRANSITIONS,
 * SAMPLE_TRANSITIONS, move_client/move_project) e acrescenta as regras
 * pedidas para o PCP Kuryos em 13/10/2026:
 *   - voltar um card exige justificativa e fica no histórico (todos os níveis);
 *   - um card não pode ser criado duas vezes (cliente, projeto, amostra);
 *   - ADM move livre entre etapas, registrado como avanço administrativo;
 *   - excluir é só para ADM.
 * Funções puras: nada aqui lê ou grava no banco. */

export const CLIENT_STAGES = ["prospeccao", "qualificado", "projeto_em_discussao", "negociacao", "cliente_fechado", "cliente_perdido"];
export const CLIENT_TRANSITIONS = {
  prospeccao: ["qualificado", "cliente_perdido"],
  qualificado: ["projeto_em_discussao", "prospeccao", "cliente_perdido"],
  projeto_em_discussao: ["negociacao", "qualificado", "prospeccao", "cliente_perdido"],
  negociacao: ["cliente_fechado", "projeto_em_discussao", "qualificado", "prospeccao", "cliente_perdido"],
  cliente_fechado: ["negociacao", "projeto_em_discussao", "qualificado", "prospeccao"],
  cliente_perdido: ["prospeccao"],
};

// 15/10/2026 (Fase 2.3): o Kickoff vem antes da cotação — amostra aprovada pelo
// cliente abre o Kickoff, e a cotação sai do BOM do Kickoff aprovado.
export const PROJECT_STAGES = [
  "projeto_em_discussao", "amostra_solicitada", "amostra_em_desenvolvimento", "amostra_enviada",
  "kickoff", "cotacao", "orcamento_completo", "em_negociacao", "pedido_aprovado", "projeto_arquivado",
];
export const PROJECT_TRANSITIONS = {
  projeto_em_discussao: ["amostra_solicitada", "projeto_arquivado"],
  amostra_solicitada: ["amostra_em_desenvolvimento", "projeto_arquivado"],
  amostra_em_desenvolvimento: ["amostra_enviada", "projeto_arquivado"],
  amostra_enviada: ["kickoff", "amostra_em_desenvolvimento", "projeto_arquivado"],
  kickoff: ["cotacao", "amostra_enviada", "amostra_em_desenvolvimento", "projeto_arquivado"],
  cotacao: ["orcamento_completo", "em_negociacao", "kickoff", "amostra_enviada", "amostra_em_desenvolvimento", "projeto_arquivado"],
  orcamento_completo: ["em_negociacao", "pedido_aprovado", "cotacao", "amostra_enviada", "amostra_em_desenvolvimento", "projeto_arquivado"],
  em_negociacao: ["pedido_aprovado", "orcamento_completo", "cotacao", "amostra_em_desenvolvimento", "projeto_arquivado"],
  pedido_aprovado: [],
  projeto_arquivado: [],
};

export const SAMPLE_STAGES = ["solicitada", "em_elaboracao", "retrabalho", "enviada", "aprovada", "reprovada"];
export const SAMPLE_TRANSITIONS = {
  solicitada: ["em_elaboracao"],
  em_elaboracao: ["enviada", "retrabalho"],
  retrabalho: ["em_elaboracao"],
  enviada: ["aprovada", "reprovada", "retrabalho"],
  aprovada: [],
  reprovada: [],
};

export const STAGE_LABELS = {
  prospeccao: "Prospecção", qualificado: "Qualificado", projeto_em_discussao: "Projeto em Discussão",
  negociacao: "Negociação", cliente_fechado: "Cliente Fechado", cliente_perdido: "Cliente Perdido",
  amostra_solicitada: "Amostra Solicitada", amostra_em_desenvolvimento: "Amostra em Desenvolvimento",
  amostra_enviada: "Amostra Enviada", kickoff: "Kickoff", cotacao: "Cotação", orcamento_completo: "Orçamento Completo",
  em_negociacao: "Em Negociação", pedido_aprovado: "Pedido Fechado", projeto_arquivado: "Projeto Arquivado",
  solicitada: "Solicitada", em_elaboracao: "Em Elaboração", retrabalho: "Retrabalho", enviada: "Enviada",
  aprovada: "Aprovada", reprovada: "Reprovada",
};

export const MOTIVO_PERDA_OPTIONS = ["preco", "prazo", "qualidade", "concorrencia", "projeto_cancelado", "sem_retorno", "outro"];
export const MIN_JUSTIFICATIVA = 10;

const ENTITIES = {
  client: { stages: CLIENT_STAGES, transitions: CLIENT_TRANSITIONS, label: "Cliente" },
  project: { stages: PROJECT_STAGES, transitions: PROJECT_TRANSITIONS, label: "Projeto" },
  sample: { stages: SAMPLE_STAGES, transitions: SAMPLE_TRANSITIONS, label: "Amostra" },
};

// Saídas do funil não entram na comparação de "voltar": arquivar ou perder é
// uma decisão própria (com motivo), não um retrocesso.
const TERMINAL_EXITS = new Set(["cliente_perdido", "projeto_arquivado", "reprovada"]);

// Funções do PCP Kuryos -> papéis do ERP. No PCP o usuário pode ter várias
// funções (role = principal; funcoes = todas) e o CRM/P&D decide por papéis do
// ERP. "gestor" no PCP é Gestor de Linha do RH (não o gestor comercial do ERP).
const PCP_PARA_ERP = {
  comercial: ["comercial", "vendedor", "sales_ops"],
  pd: ["pd", "lider_pd", "formulador", "engenharia_produto"],
  pcp: ["pcp", "vendedor", "sales_ops", "lider_pd", "formulador", "engenharia_produto"],
  qualidade: ["qualidade", "qa"],
  gestor: ["gestor_linha"],
};

export function effectiveRoles(profile) {
  if (!profile) return [];
  const funcoes = Object.keys(profile.funcoes || {}).filter((key) => profile.funcoes[key] === true);
  const out = new Set();
  for (const raw of [profile.role, ...funcoes].filter(Boolean)) {
    for (const role of PCP_PARA_ERP[String(raw).toLowerCase()] || [String(raw).toLowerCase()]) out.add(role);
  }
  // Módulos do PCP também liberam (personalização feita pelo ADM).
  if (profile.modulos?.comercial === true) PCP_PARA_ERP.comercial.forEach((role) => out.add(role));
  if (profile.modulos?.pd === true) PCP_PARA_ERP.pd.forEach((role) => out.add(role));
  return [...out];
}

export function hasAnyRole(profile, roles) {
  const eff = effectiveRoles(profile);
  return eff.includes("admin") || (roles || []).some((role) => eff.includes(role));
}

export function isAdmin(profile) {
  return effectiveRoles(profile).includes("admin");
}

// Comercial no PCP Kuryos: ADM, função Comercial (ou PCP), papéis comerciais do
// ERP ou módulo Comercial — o mesmo critério das regras do banco para origem CRM.
export function isComercial(profile) {
  return hasAnyRole(profile, ["vendedor", "sales_ops", "sucesso_cliente"]);
}

export function stageLabel(stage) {
  return STAGE_LABELS[stage] || stage || "—";
}

function text(value) {
  return String(value ?? "").trim();
}

export function isRegression(entity, from, to) {
  const { stages } = ENTITIES[entity];
  if (TERMINAL_EXITS.has(to) || TERMINAL_EXITS.has(from)) return false;
  if (entity === "sample" && to === "retrabalho") return true;
  const a = stages.indexOf(from);
  const b = stages.indexOf(to);
  return a >= 0 && b >= 0 && b < a;
}

/* Decide se uma movimentação pode acontecer. Nunca lança: devolve
 * { ok, status, detail } para o adaptador transformar em erro HTTP. */
export function planMove({ entity, from, to, profile, justificativa, motivoPerda, motivoArquivamento }) {
  const cfg = ENTITIES[entity];
  if (!cfg) return { ok: false, status: 400, detail: `Entidade inválida: ${entity}` };
  if (!cfg.stages.includes(to)) return { ok: false, status: 400, detail: `Estágio inválido: ${to}` };
  if (from === to) return { ok: false, status: 400, detail: `${cfg.label} já está em ${stageLabel(to)}.` };

  const admin = isAdmin(profile);
  const allowed = (cfg.transitions[from] || []).includes(to);
  if (!allowed && !admin) {
    return { ok: false, status: 400, detail: `Transição não permitida: ${stageLabel(from)} → ${stageLabel(to)}` };
  }

  if (entity === "client" && from === "cliente_perdido" && !admin) {
    return { ok: false, status: 403, detail: "Reativar um cliente perdido é decisão do administrador." };
  }

  const regression = isRegression(entity, from, to);
  const just = text(justificativa);
  if (regression && just.length < MIN_JUSTIFICATIVA) {
    return { ok: false, status: 400, detail: `Justificativa obrigatória para voltar o card (mínimo ${MIN_JUSTIFICATIVA} caracteres).` };
  }
  if (entity === "client" && to === "cliente_perdido") {
    const motivo = text(motivoPerda).toLowerCase();
    if (!motivo) return { ok: false, status: 400, detail: "Motivo da perda é obrigatório." };
    if (!MOTIVO_PERDA_OPTIONS.includes(motivo)) {
      return { ok: false, status: 400, detail: `Motivo da perda inválido. Use: ${MOTIVO_PERDA_OPTIONS.join(", ")}` };
    }
  }
  if (entity === "project" && to === "projeto_arquivado" && !text(motivoArquivamento)) {
    return { ok: false, status: 400, detail: "Motivo do arquivamento é obrigatório." };
  }

  return { ok: true, regression, administrativo: !allowed && admin, justificativa: just || null };
}

export function movementEntry({ from, to, profile, uid, at, plan }) {
  const entry = {
    de: from,
    para: to,
    de_label: stageLabel(from),
    para_label: stageLabel(to),
    data: at,
    usuario: profile?.name || profile?.nome || profile?.email || "",
    usuario_id: uid || "",
    is_regression: Boolean(plan?.regression),
  };
  if (plan?.justificativa) entry.justificativa = plan.justificativa;
  if (plan?.administrativo) entry.administrativo = true;
  return entry;
}

/* ── Requisitos de avanço (iguais ao ERP) ───────────────────────────── */

function pick(obj, path) {
  return String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

const QUALIFICATION_FIELDS = [
  ["canal_origem", "Canal de origem"],
  ["categoria_interesse", "Categoria de interesse"],
  ["temperatura_lead", "Temperatura"],
  ["responsavel_comercial", "Responsável comercial"],
  ["segmento", "Segmento"],
  ["contato_principal.nome", "Contato — nome"],
  ["contato_principal.whatsapp", "Contato — WhatsApp"],
];
// 15/10/2026: saíram a lista "Decisores" e a pergunta "Tem Anvisa?"; cada
// contato tem a caixa "É decisor" e o funil exige ao menos um marcado.
const PROJECT_GATE_EXTRA = [
  ["contato_decisor", "Contato decisor"],
  ["volume_estimado_mensal", "Volume estimado mensal"],
  ["fornecedor_atual", "Fornecedor atual"],
];

// Cliente antigo com a lista "Decisores" preenchida continua valendo.
export function temContatoDecisor(client) {
  const contatos = [client?.contato_principal, ...(Array.isArray(client?.contatos_adicionais) ? client.contatos_adicionais : [])];
  if (contatos.some((c) => c && c.decisor === true && text(c.nome))) return true;
  return (Array.isArray(client?.decisores) ? client.decisores : []).some((item) => text(item?.nome));
}

// Fórmula registrada = aprovada pelo cliente. A aprovação do químico no P&D
// saiu em 15/10/2026; as aprovações de Qualidade continuam no Kickoff.
export function formulaRegistrada(approval) {
  return Boolean(approval?.approved_by_client);
}

function filled(value) {
  if (Array.isArray(value)) return value.length > 0;
  return text(value) !== "";
}

export function missingQualification(client) {
  return QUALIFICATION_FIELDS.filter(([field]) => !filled(pick(client, field))).map(([, label]) => label);
}

export function missingProjectGate(client) {
  const missing = missingQualification(client);
  for (const [field, label] of PROJECT_GATE_EXTRA) {
    if (field === "contato_decisor") {
      if (!temContatoDecisor(client)) missing.push(label);
    } else if (!filled(client?.[field])) missing.push(label);
  }
  return missing;
}

export function missingPreBriefing(project) {
  const missing = [];
  if (!text(project?.nome_projeto)) missing.push("Nome do projeto");
  if (!text(project?.categoria)) missing.push("Categoria");
  if (!text(project?.responsavel_comercial)) missing.push("Responsável comercial");
  if (!text(project?.ideia_conceito) && !text(project?.briefing_tecnico)) missing.push("Ideia/conceito");
  if (!text(project?.posicionamento)) missing.push("Posicionamento");
  if (!project?.volume_estimado_pedido) missing.push("Volume estimado do pedido");
  if (!text(project?.tipo_servico)) missing.push("Tipo de serviço");
  if (!text(project?.prazo_desejado_amostra) && !text(project?.prazo_prometido_cliente)) missing.push("Prazo da amostra");
  return missing;
}

/* Requisitos por destino. ADM passa por cima, mas fica registrado. */
export function stageRequirements(entity, record, to, context = {}) {
  if (entity === "client") {
    if (to === "qualificado") return missingQualification(record);
    if (to === "projeto_em_discussao") return missingProjectGate(record);
  }
  if (entity === "project") {
    if (to === "amostra_solicitada") return missingPreBriefing(record);
    if (["kickoff", "cotacao", "orcamento_completo", "em_negociacao"].includes(to) && !context.hasApprovedSample) {
      return ["Ao menos uma amostra aprovada pelo cliente"];
    }
    if (to === "cotacao" && !context.kickoffApproved) return ["Kickoff aprovado"];
  }
  return [];
}

/* ── Unicidade: um card só nasce uma vez ───────────────────────────── */

export function normalizeName(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function onlyDigits(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

export function findDuplicateClient(clients, payload, ignoreId) {
  const cnpj = onlyDigits(payload?.cnpj);
  const name = normalizeName(payload?.nome_empresa || payload?.nome);
  return (clients || []).find((client) => {
    if (!client || client.id === ignoreId || client.deleted_at) return false;
    if (cnpj && cnpj.length >= 11 && onlyDigits(client.cnpj) === cnpj) return true;
    return Boolean(name) && normalizeName(client.nome_empresa || client.nome) === name;
  }) || null;
}

export function findDuplicateProject(projects, clienteId, nomeProjeto, ignoreId) {
  const name = normalizeName(nomeProjeto);
  if (!name) return null;
  return (projects || []).find((project) => project && project.id !== ignoreId && !project.deleted_at
    && project.cliente_id === clienteId && normalizeName(project.nome_projeto) === name) || null;
}

export function findDuplicateSample(samples, projetoId, nomeProduto, ignoreId) {
  const name = normalizeName(nomeProduto);
  if (!name) return null;
  return (samples || []).find((sample) => sample && sample.id !== ignoreId && !sample.deleted_at
    && sample.projeto_id === projetoId && normalizeName(sample.nome_produto || sample.nome_amostra) === name) || null;
}

/* Cliente nascido direto no cadastro mestre (só ADM cria): o comercial vê,
 * mas a passagem livre pelo funil é do administrador. */
export function isDirectRegistration(client) {
  return Boolean(client?.cadastro_cliente_id || client?.origem === "cadastro_direto");
}
