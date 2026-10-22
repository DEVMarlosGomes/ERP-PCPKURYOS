// Cotação por insumo e por serviço (PLANO_PD_CRM_AJUSTES.md, Fase 7).
//
// Pedido do usuário (15/10/2026): a cotação nasce do BOM do Kickoff (MPs, embalagens)
// e cobra cada processo (envase, rosqueamento, celofane…) pela tabela de serviços do
// Cadastros (nó servicos/ do PCP), com um desconto próprio em cada etapa.
//   - Insumo em US$ converte pela taxa da cotação (ao vivo no rascunho, congelada no envio).
//   - Serviço: quantidade × (preço cheio − desconto da etapa) + setup por lote, nunca abaixo
//     do mínimo por pedido.
//   - Preço que falta é "SEM PREÇO", nunca zero, e bloqueia o envio ao cliente.
//   - Preço sugerido do serviço = custo-hora ÷ produtividade × (1 + margem); o comercial decide.
// Funções puras: nada aqui lê ou grava no banco.

export const UNIDADES_SERVICO = {
  un: { rotulo: "por unidade", curto: "un", produtividade: "un/h" },
  milheiro: { rotulo: "por milheiro", curto: "mil", produtividade: "un/h" },
  kg: { rotulo: "por kg de granel", curto: "kg", produtividade: "kg/h" },
  lote: { rotulo: "por lote", curto: "lote", produtividade: "horas por lote" },
};

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const positivo = (v) => { const n = num(v); return n !== null && n > 0 ? n : null; };
const pct = (v) => Math.min(100, Math.max(0, num(v) || 0));
const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;

export function precoSugerido(servico) {
  const s = servico || {};
  const custoHora = positivo(s.custoHora);
  const prod = positivo(s.produtividade);
  if (!custoHora || !prod) return null;
  const margem = 1 + (num(s.margemPct) || 0) / 100;
  const base = {
    un: custoHora / prod,
    milheiro: (custoHora / prod) * 1000,
    kg: custoHora / prod,
    lote: custoHora * prod,
  }[s.unidade];
  if (base === undefined) return null;
  return r4(base * margem);
}

// MP do BOM: preço por kg da fórmula do P&D (US$ quando informado, senão R$/kg).
export function precoDoItemDeFormula(item) {
  const usd = num(item?.price_usd);
  if (usd !== null && usd > 0) return { preco: usd, moeda: "USD" };
  const brl = positivo(item?.price_per_kg);
  return brl ? { preco: brl, moeda: "BRL" } : { preco: null, moeda: "BRL" };
}

// Linhas de insumo a partir do BOM do Kickoff + itens da fórmula (preço da MP).
export function insumosDoBom(bom, itensFormula) {
  const porId = new Map((itensFormula || []).map((i) => [i.id, i]));
  return (bom || []).map((l) => {
    const item = l.tipo === "mp_formula" ? porId.get(l.id) : null;
    const preco = item ? precoDoItemDeFormula(item) : { preco: null, moeda: "BRL" };
    return {
      bom_id: l.id, codigo: l.codigo_interno || "", descricao: l.descricao || "", tipo: l.tipo || "",
      unidade: l.unidade || "un", qtd_por_unidade: num(l.quantidade_por_unidade) || 0,
      preco: preco.preco, moeda: preco.moeda, origem_preco: item && preco.preco !== null ? "formula" : "manual",
      fornecido_por: "kuryos",
    };
  });
}

export function linhaDeServico(servico) {
  const s = servico || {};
  return {
    servico_id: s.id, codigo: s.codigo || "", nome: s.nome || "", unidade: s.unidade || "un",
    preco_cheio: positivo(s.preco), desconto_pct: pct(s.descontoPct), setup_lote: num(s.setupLote) || 0,
    minimo_pedido: num(s.minimoPedido) || 0, fator: 1,
  };
}

// Junta o que foi salvo na cotação com o que o Kickoff e a tabela dizem agora.
// Rascunho acompanha o BOM, a fórmula e a tabela; cotação enviada (congelada) fica como saiu.
export function mesclarComposicao(salva, base, { congelada = false } = {}) {
  const s = salva || {};
  const b = base || {};
  if (congelada && s.insumos) return s;
  const salvos = new Map((s.insumos || []).map((l) => [l.bom_id, l]));
  const insumos = (b.insumos || []).map((l) => {
    const antes = salvos.get(l.bom_id);
    if (!antes) return l;
    const manual = l.origem_preco !== "formula";
    return {
      ...l, fornecido_por: antes.fornecido_por || "kuryos",
      ...(manual ? { preco: num(antes.preco), moeda: antes.moeda || "BRL" } : {}),
    };
  });
  const tabela = new Map((b.servicos || []).map((sv) => [sv.id, sv]));
  const servicos = (s.servicos || []).map((l) => {
    const atual = tabela.get(l.servico_id);
    if (!atual) return { ...l, fora_da_tabela: true };
    const nova = linhaDeServico(atual);
    return { ...nova, desconto_pct: pct(l.desconto_pct), fator: positivo(l.fator) || 1 };
  });
  return {
    ...s,
    kickoff_id: b.kickoff_id ?? s.kickoff_id ?? null, numero_kickoff: b.numero_kickoff ?? s.numero_kickoff ?? "",
    qtd_pedido: positivo(s.qtd_pedido) ?? positivo(b.qtd_pedido) ?? 0,
    kg_por_unidade: num(b.kg_por_unidade) ?? num(s.kg_por_unidade) ?? 0,
    lotes: positivo(s.lotes) || 1,
    insumos: b.insumos ? insumos : (s.insumos || []),
    servicos,
  };
}

function quantidadeCobrada(unidade, fator, ctx) {
  const f = positivo(fator) || 1;
  if (unidade === "milheiro") return (ctx.qtd * f) / 1000;
  if (unidade === "kg") return ctx.qtd * ctx.kg * f;
  if (unidade === "lote") return ctx.lotes * f;
  return ctx.qtd * f;
}

export function calcularCotacao(composicao, taxa) {
  const c = composicao || {};
  const ctx = { qtd: num(c.qtd_pedido) || 0, kg: num(c.kg_por_unidade) || 0, lotes: positivo(c.lotes) || 1 };
  const cambio = positivo(taxa);
  const pendencias = [];
  if (!(ctx.qtd > 0)) pendencias.push({ tipo: "pedido", descricao: "Quantidade do pedido", motivo: "Informe a quantidade" });

  const insumos = (c.insumos || []).map((l) => {
    if (l.fornecido_por === "cliente") return { ...l, custo_un: 0, pendente: false };
    const preco = positivo(l.preco);
    if (preco === null) {
      pendencias.push({ tipo: "insumo", descricao: l.descricao, motivo: "SEM PREÇO" });
      return { ...l, custo_un: null, pendente: true };
    }
    if (l.moeda === "USD" && !cambio) {
      pendencias.push({ tipo: "insumo", descricao: l.descricao, motivo: "SEM CÂMBIO" });
      return { ...l, custo_un: null, pendente: true };
    }
    const brl = l.moeda === "USD" ? preco * cambio : preco;
    return { ...l, preco_brl: r4(brl), custo_un: r4((num(l.qtd_por_unidade) || 0) * brl), pendente: false };
  });

  const servicos = (c.servicos || []).map((l) => {
    const cheio = positivo(l.preco_cheio);
    const quantidade = quantidadeCobrada(l.unidade, l.fator, ctx);
    if (cheio === null) {
      pendencias.push({ tipo: "servico", descricao: l.nome, motivo: "SEM PREÇO" });
      return { ...l, quantidade, preco_final: null, total: null, por_unidade: null, pendente: true };
    }
    const final = cheio * (1 - pct(l.desconto_pct) / 100);
    const subtotal = quantidade * final + (num(l.setup_lote) || 0) * ctx.lotes;
    const minimo = num(l.minimo_pedido) || 0;
    const total = Math.max(subtotal, minimo);
    // Desconto efetivo da etapa: o que sairia a preço cheio menos o que sai (o mínimo pode anulá-lo).
    const cheioTotal = Math.max(quantidade * cheio + (num(l.setup_lote) || 0) * ctx.lotes, minimo);
    return {
      ...l, quantidade: r4(quantidade), preco_final: r4(final), desconto_rs: r4(cheio - final), desconto_total: r2(cheioTotal - total), total: r2(total),
      minimo_aplicado: minimo > subtotal, por_unidade: ctx.qtd > 0 ? r4(total / ctx.qtd) : null, pendente: false,
    };
  });

  const soma = (arr, campo) => arr.reduce((acc, l) => acc + (num(l[campo]) || 0), 0);
  const insumosUn = soma(insumos, "custo_un");
  const servicosTotal = soma(servicos, "total");
  const servicosUn = ctx.qtd > 0 ? servicosTotal / ctx.qtd : 0;
  const descontoTotal = soma(servicos, "desconto_total");
  return {
    insumos, servicos, pendencias,
    taxa: cambio,
    insumos_por_un: r4(insumosUn),
    servicos_por_un: r4(servicosUn),
    servicos_total: r2(servicosTotal),
    desconto_servicos_total: r2(descontoTotal),
    preco_un: r4(insumosUn + servicosUn),
    total_pedido: r2((insumosUn + servicosUn) * ctx.qtd),
    pode_enviar: pendencias.length === 0,
  };
}

// Texto do bloqueio de envio (servidor e tela usam o mesmo).
export function mensagemDePendencias(pendencias) {
  if (!pendencias?.length) return "";
  const itens = pendencias.slice(0, 6).map((p) => `${p.descricao} (${p.motivo})`).join("; ");
  const resto = pendencias.length > 6 ? ` e mais ${pendencias.length - 6}` : "";
  return `Cotação não pode ser enviada: ${itens}${resto}. Preço que falta não vira zero — preencha na cotação (insumo) ou na tabela de serviços do Cadastros.`;
}
