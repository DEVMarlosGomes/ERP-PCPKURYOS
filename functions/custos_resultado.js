// Custos e Resultado no servidor (PLANO_CUSTOS_RESULTADO.md §8): o placar é
// calculado AQUI e grava só totais; nenhum navegador de quem não é diretoria
// recebe LP ou custo por produto. Também congela a tabela de pontos do mês,
// fecha o mês do bônus e lança o razão de custos das OPs.
//
// A lógica fica em funções que recebem a base já lida (`base`) e devolvem o
// update por CAMINHOS PLANOS -- testável sem banco (run_custos_servidor_test.js).
// O acesso ao banco fica em `criarServico`, que o index.js liga.
"use strict";
const Custos = require("./custos");
const Realizado = require("./custos-realizado");
const Pontos = require("./resultado-pontos");

const VERSAO = "custos-servidor-v1-20261026";

function competenciaDe(iso) { return String(iso || "").slice(0, 7); }
function diaSP(agora) {
  // Dia civil em São Paulo (UTC−3, sem horário de verão desde 2019).
  return new Date(new Date(agora).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}
function mesAnterior(comp) {
  const [a, m] = comp.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}
function sanitizeKey(k) { return String(k == null ? "" : k).replace(/[.#$/[\]]/g, "_"); }

// Quem é diretoria: ADM, ou quem o ADM marcou com o módulo Custos.
function ehDiretoria(perfil) {
  return !!perfil && (perfil.role === "admin" || (perfil.modulos && perfil.modulos.custos === true));
}

// Horas-padrão e taxa da competência: as MESMAS da tela (custos.js), para que o LP da
// tela e o da tabela de pontos não divirjam.
const horasPadraoPorMes = Custos.horasPadraoPorMes;
const taxaParaCompetencia = (base, competencia, ritmos) => Custos.taxaParaCompetencia(base, competencia, ritmos);

/* Congela a tabela de pontos (e o snapshot das fichas) de uma competência.
   Devolve o update; recusa se já existe, salvo `substituir` com motivo. */
function prepararCongelamento(base, competencia, opcoes) {
  const o = opcoes || {};
  const params = ((base.custos || {}).parametros) || {};
  const existente = ((base.resultado || {}).tabelas || {})[competencia];
  if (existente && !o.substituir) return { ok: false, motivo: `A tabela de pontos de ${competencia} já está congelada (${existente.congeladaEm}).` };
  if (existente && !String(o.motivo || "").trim()) return { ok: false, motivo: "Substituir a tabela congelada exige motivo." };
  if (!(Number(params.fatorPontos) > 0)) return { ok: false, motivo: "Defina o fator de pontos em Custos › Parâmetros." };
  const ritmos = Custos.ritmosDaCompetencia(base.produtos, base.ops, competencia);
  const taxa = taxaParaCompetencia(base, competencia, ritmos);
  const ctx = Custos.montarContextoCustos(base, { taxa, competencia, hoje: competencia + "-01", ritmos });
  const fichas = {};
  Object.keys(ctx.produtoPorSku).forEach((s) => { fichas[s] = ctx.ficha(s); });
  const tabela = Pontos.tabelaDePontos({ fichas, fator: Number(params.fatorPontos),
    coberturaMinimaPct: params.coberturaMinimaPct === "" || params.coberturaMinimaPct == null ? null : Number(params.coberturaMinimaPct),
    usarLpInformado: params.usarLpInformado === true });
  const agora = o.agora || new Date().toISOString();
  const updates = {};
  updates[`resultado/tabelas/${competencia}`] = {
    competencia, congeladaEm: agora, congeladaPor: o.por || "servidor", fator: Number(params.fatorPontos),
    alvoPct: Number(params.metaAlvoPct) || null, coberturaMinimaPct: params.coberturaMinimaPct == null ? null : params.coberturaMinimaPct,
    usarLpInformado: params.usarLpInformado === true,
    porSku: Object.fromEntries(Object.entries(tabela.porSku).map(([s, t]) => [sanitizeKey(s), { pontos: t.pontos, origem: t.origem }])),
    totalSkus: Object.keys(tabela.porSku).length, totalFora: Object.keys(tabela.fora).length,
    motivoSubstituicao: existente ? String(o.motivo).slice(0, 500) : null, versao: VERSAO,
  };
  // LP e custo (R$) só no nó da diretoria; a tabela de pontos não leva R$.
  Object.entries(fichas).forEach(([s, f]) => {
    if (!f) return;
    updates[`custos/fichas/${competencia}/${Custos.chaveSku(s)}`] = resumoFicha(f);
  });
  updates[`custos/taxas/${competencia}`] = Object.assign({}, taxa, { calculadoEm: agora });
  if (existente) updates[`resultado/tabelas_historico/${competencia}/${agora.replace(/[.:]/g, "-")}`] = existente;
  return { ok: true, updates, resumo: { skusComPontos: Object.keys(tabela.porSku).length, fora: Object.keys(tabela.fora).length } };
}

// Snapshot enxuto da ficha (sem as linhas inteiras): reproduz o número e diz de onde veio.
function resumoFicha(f) {
  const n = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 1e6) / 1e6);
  return {
    sku: f.sku, versao: f.versao || null, completo: !!f.completo,
    granelPorKg: n(f.granel.custoPorKg), granel: n(f.granel.custoPorPeca), embalagem: n(f.embalagem.custoPorPeca),
    perdas: n(f.perdas.custoPorPeca), operacao: n(f.operacao && f.operacao.custoPorPeca), custoVariavel: n(f.custoVariavel),
    custoPleno: n(f.custoPleno), preco: n(f.precoVenda && f.precoVenda.valor), precoOrigem: (f.precoVenda && f.precoVenda.origem) || null,
    impostosPct: f.impostosPct == null ? null : f.impostosPct, lp: n(f.lp), lpInformado: n(f.lpInformado),
    lpOrcamento: f.orcamento ? n(f.orcamento.lp) : null, ritmo: n(f.ritmo && f.ritmo.valor), ritmoOrigem: (f.ritmo && f.ritmo.origem) || null,
    densidadeOrigem: (f.granel.densidade && f.granel.densidade.origem) || null,
    composicao: Object.fromEntries(Object.entries(f.composicaoProcedencia || {}).map(([k, v]) => [k, n(v)])),
    pendencias: (f.pendencias || []).slice(0, 30).map((p) => ({ tipo: p.tipo, codigo: p.codigo || null, texto: String(p.texto || "").slice(0, 200) })),
    versaoMotor: f.versaoMotor,
  };
}

/* Placar dos últimos dias (mês anterior + corrente), salvo meses FECHADOS.
   Grava só totais: pontos, meta, %, descontos em pontos, cobertura e por linha. */
function prepararPlacar(base, agora) {
  const hoje = diaSP(agora);
  const comp = competenciaDe(hoje);
  const desde = mesAnterior(comp) + "-01";
  const res = base.resultado || {};
  const params = ((base.custos || {}).parametros) || {};
  const fechados = res.fechamentos || {};
  const ritmos = Custos.ritmosDaCompetencia(base.produtos, base.ops, comp);
  const config = base.config || {};
  const dias = Pontos.placarDoPeriodo({
    registros: base.registros, ops: base.ops, produtos: base.produtos, tabelas: res.tabelas || {}, ritmos,
    alvoPct: params.metaAlvoPct, horasDoDia: (d) => Custos.horasDoDia(config, d),
    perdas: base.perdas, retrabalhos: base.retrabalhos, estoqueLotes: base.estoque_lotes, conferenciasPa: base.conferencias_pa,
    programa: res.programa || {}, descontosAtivos: params.descontos || null, desde, ate: hoje,
  });
  const updates = {};
  const validos = dias.filter((d) => !fechados[competenciaDe(d.dia)] || !fechados[competenciaDe(d.dia)].fechadoEm);
  validos.forEach((d) => { updates[`resultado/placar/dias/${d.dia}`] = Object.assign({}, d, { atualizadoEm: agora }); });
  Pontos.acumular(validos, "semana").forEach((s) => { updates[`resultado/placar/semanas/${s.chave}`] = Object.assign({}, s, { atualizadoEm: agora }); });
  Pontos.acumular(validos, "mes").forEach((m) => { updates[`resultado/placar/meses/${m.chave}`] = Object.assign({}, m, { atualizadoEm: agora }); });
  const doDia = dias.find((d) => d.dia === hoje) || null;
  updates["resultado/placar/hoje"] = { dia: hoje, semana: Pontos.semanaISO(hoje), mes: comp, temProducao: !!doDia, atualizadoEm: agora };
  return { updates, dias: validos.length };
}

/* Fecha o mês: % do mês, portões e bônus. Depois de fechado, o placar do mês
   não é mais regravado (o número pago é o número que fica). */
function prepararFechamento(base, competencia, opcoes) {
  const o = opcoes || {};
  const res = base.resultado || {};
  if ((res.fechamentos || {})[competencia] && (res.fechamentos[competencia] || {}).fechadoEm) return { ok: false, motivo: `${competencia} já está fechado.` };
  const params = ((base.custos || {}).parametros) || {};
  const dias = Object.values((res.placar || {}).dias || {}).filter((d) => d && competenciaDe(d.dia) === competencia && d.meta > 0);
  if (!dias.length) return { ok: false, motivo: `Sem placar com meta em ${competencia}.` };
  const mes = Pontos.acumular(dias, "mes")[0];
  const semanas = Pontos.acumular(dias, "semana");
  const portoes = Object.values((res.portoes || {})[competencia] || {}).filter(Boolean);
  const semanasComAcidente = new Set(portoes.filter((p) => p.tipo === "ACIDENTE").map((p) => Pontos.semanaISO(String(p.data).slice(0, 10)))).size;
  const reclamacao = portoes.some((p) => p.tipo === "RECLAMACAO");
  const bonus = Pontos.bonusDoMes({ base: params.bonusBase, faixas: params.faixasBonus, tetoPct: params.tetoBonusPct, pctMes: mes.pct,
    semanasNoMes: semanas.length, semanasComAcidente, reducaoReclamacaoPct: reclamacao ? (params.reducaoReclamacaoPct != null ? params.reducaoReclamacaoPct : 50) : 0 });
  const agora = o.agora || new Date().toISOString();
  return { ok: true, updates: { [`resultado/fechamentos/${competencia}`]: {
    competencia, fechadoEm: agora, fechadoPor: o.por || null, pontos: mes.pontos, meta: mes.meta, pct: mes.pct,
    dias: mes.dias, diasBatidos: mes.diasBatidos, semanas: semanas.length, semanasBatidas: semanas.filter((s) => s.batida).length,
    semanasComAcidente, reclamacao, bonus: bonus.valor, multiplicador: bonus.mult == null ? null : bonus.mult,
    // Piloto: o plano roda 4 semanas sem bônus valendo (Fase 5). O valor é calculado e marcado.
    bonusValendo: params.bonusValendo === true, coberturaPct: mes.coberturaPct, versao: VERSAO,
  } } };
}

/* Razão de custos das OPs (append-only). Uma OP concluída gera seus
   lançamentos uma vez; se a quantidade mudar depois, estorna e relança --
   nunca edita. Chave determinística por OP e revisão. */
function prepararRazaoOps(base, agora, opcoes) {
  const o = opcoes || {};
  const desde = o.desde || "";
  const razao = ((base.custos || {}).razao_ops) || {};
  const comp = competenciaDe(diaSP(agora));
  const ritmos = Custos.ritmosDaCompetencia(base.produtos, base.ops, comp);
  const taxa = taxaParaCompetencia(base, comp, ritmos);
  const ctx = Custos.montarContextoCustos(base, { taxa, competencia: comp, hoje: diaSP(agora), ritmos });
  const regs = Realizado.achatarRegistros(base.registros);
  const porLote = {};
  regs.forEach((r) => { const l = String(r.lote || "").trim(); if (l) (porLote[l] = porLote[l] || []).push(r); });
  const updates = {};
  let lancadas = 0, estornadas = 0, pulos = 0;
  Object.entries(base.ops || {}).forEach(([opKey, op]) => {
    if (!op || op.status !== "Concluído" || !(Number(op.produzido) > 0)) return;
    if (String(op.dataFimReal || "") < desde) return;
    const atual = razao[sanitizeKey(opKey)];
    if (atual && Number(atual.produzido) === Number(op.produzido)) return;
    const ficha = op.sku ? ctx.ficha(op.sku) : null;
    const lote = String(op.lote || "").trim();
    const res = Realizado.custoRealizadoOp({ opKey, op, ficha, apontamentos: porLote[lote] || [],
      perdasPorTipo: Realizado.perdasDoLote((base.perdas || {})[Realizado.loteKey(op.lote)], op),
      consumos: Realizado.consumosDoLote(base.movimentos_estoque, base.estoque_lotes, lote),
      precos: ctx.precos, idx: ctx.idx, taxa, precoVenda: ficha ? ficha.precoVenda : null, impostosPct: ficha ? ficha.impostosPct : null });
    // Razão registra fato VALORIZADO: OP com custo incompleto (sem preço, sem custo-hora)
    // não é lançada nem marcada -- tenta de novo na próxima rodada, quando o custo existir.
    if (!res.completo) { pulos++; return; }
    const mes = competenciaDe(op.dataFimReal) || comp;
    const rev = atual ? Number(atual.revisao || 1) + 1 : 1;
    if (atual) {
      (atual.lancamentos || []).forEach((k) => {
        const [m, id] = k.split("/");
        updates[`custos/razao/${m}/${id}_estorno_r${rev}`] = { tipo: "ESTORNO", estornaId: k, objeto: { tipo: "OP", id: opKey }, criadoEm: agora, criadoPor: "servidor", versaoMotor: VERSAO };
      });
      estornadas++;
    }
    const chaves = [];
    Realizado.lancamentosDaOp(res, { em: agora, por: "servidor" }).forEach((l) => {
      const id = `OP_${sanitizeKey(opKey)}_${l.tipo}_r${rev}`;
      updates[`custos/razao/${mes}/${id}`] = l;
      chaves.push(`${mes}/${id}`);
    });
    updates[`custos/razao_ops/${sanitizeKey(opKey)}`] = { produzido: Number(op.produzido), revisao: rev, lancamentos: chaves, lancadoEm: agora,
      completo: res.completo, lp: res.lp == null ? null : Math.round(res.lp * 100) / 100 };
    lancadas++;
  });
  return { updates, lancadas, estornadas, aguardandoCusto: pulos };
}

/* Custo do lote no recebimento (Fase 0): o que entra em estoque_lotes e o
   lançamento ENTRADA_MATERIAL do razão. Do item do PC, por unidade de estoque. */
function custoDoLoteRecebido(pedido, itemKey, qtdRecebida, ref) {
  const item = ((pedido || {}).itens || {})[itemKey] || {};
  const c = Custos.custoUnitarioItemPC(item);
  if (!(c.valor > 0)) return { campos: { custoUnitario: null, custoFonte: "SEM_CUSTO", custoMotivo: c.motivo || "item sem preço" }, lancamento: null };
  const campos = { custoUnitario: Math.round(c.valor * 1e6) / 1e6, custoUnidade: c.unidade || null, custoFonte: "PAGO", custoRef: ref };
  return { campos, lancamento: { tipo: "ENTRADA_MATERIAL", natureza: naturezaDoCodigo(item.materialCodigo), quantidade: qtdRecebida,
    unidade: c.unidade || null, valorUnitario: campos.custoUnitario, valorTotal: Math.round(c.valor * qtdRecebida * 100) / 100,
    procedencia: "PAGO", origemId: ref, versaoMotor: VERSAO } };
}
function naturezaDoCodigo(cod) { return Custos.naturezaDoMaterial({ mpCodigo: cod }); }

module.exports = {
  VERSAO, ehDiretoria, diaSP, competenciaDe, mesAnterior, horasPadraoPorMes, taxaParaCompetencia,
  prepararCongelamento, prepararPlacar, prepararFechamento, prepararRazaoOps, custoDoLoteRecebido, resumoFicha,
};
