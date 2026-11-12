"use strict";
/* Amostras de MP (11/11/2026) — spec docs/superpowers/specs/2026-11-11-amostras-mp-design.md.

   O P&D pede amostras de matéria-prima a fornecedores; a logística dá baixa quando chegam;
   o P&D homologa ou reprova. Toda gravação passa por aqui (callable `amostraMp`): o navegador
   só lê amostras_mp/. Ciclo:
     SOLICITADA → RECEBIDA → HOMOLOGADA | REPROVADA      (SOLICITADA → CANCELADA pelo P&D)
   P&D = papel `pd` ou módulo `pd`; logística = papel `logistica` ou módulo `logistica`; ADM tudo.
   Depois de recebida, fornecedor/material/custos/quantidade não mudam (EDITAR só em SOLICITADA).

   Dados: amostras_mp/{id} (registro + historico/{push}); amostras_mp_pedidos/{uid}/{requestId} = id
   (repetir o mesmo pedido devolve o resultado); config/contadores/amostrasMp (código AM-0001).
   Transação só no nó da amostra, nunca na raiz (limite de 16 MB, ver CLAUDE.md).
   Constantes duplicadas em public/shared/amostras-mp.js: cópia deliberada, conferida em
   run_amostras_mp_tela_test.js. Teste: run_amostras_mp_test.js (+ _emulator_test). */

const STATUS = {SOLICITADA: "Solicitada", RECEBIDA: "Recebida", HOMOLOGADA: "Homologada", REPROVADA: "Reprovada", CANCELADA: "Cancelada"};
const ACOES = {CRIAR: "Criar", EDITAR: "Editar", CANCELAR: "Cancelar", RECEBER: "Dar baixa", HOMOLOGAR: "Homologar", REPROVAR: "Reprovar"};
const TIPOS = {NOVA: "Nova matéria-prima", CADASTRADA: "Matéria-prima já cadastrada"};
const MOTIVOS = {HOMOLOGAR_FORNECEDOR: "Homologar novo fornecedor", REPOSICAO: "Reposição", AMOSTRA_CLIENTE: "Amostra para cliente", DESENVOLVIMENTO: "Desenvolvimento interno"};
const FORMAS = {CORREIO: "Correio", TRANSPORTADORA: "Transportadora", MOTOBOY: "Motoboy"};
const UNIDADES = {g: "g", kg: "kg"};
const ENCERRADOS = ["HOMOLOGADA", "REPROVADA", "CANCELADA"];
const EDITAVEIS = ["tipo", "material", "materialNovo", "fornecedor", "custoKg", "custoAmostra", "quantidade", "motivo", "previsaoChegada", "observacoes"];

function erro(code, message) { return Object.assign(new Error(message), {code}); }
function texto(v, max) { return String(v == null ? "" : v).replace(/\r\n/g, "\n").trim().slice(0, max); }
function data(v, rotulo) {
  const s = texto(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + "T12:00:00Z"))) throw erro("invalid-argument", "Informe " + rotulo + " (data válida).");
  return s;
}
function numero(v, rotulo) {
  const n = typeof v === "number" ? v : Number(String(v == null ? "" : v).replace(",", "."));
  if (v === "" || v == null || !isFinite(n) || n < 0) throw erro("invalid-argument", "Informe " + rotulo + " (número maior ou igual a zero).");
  return n;
}

function perfilAmostra(u) {
  const ativo = !!u && !!u.role && u.role !== "pending" && u.role !== "tv" && u.desativado !== true;
  const mod = (u && u.modulos) || {};
  return {
    ativo,
    admin: ativo && (u.role === "admin" || !!(u.funcoes && u.funcoes.admin === true)),
    pd: ativo && (u.role === "pd" || mod.pd === true),
    logistica: ativo && (u.role === "logistica" || mod.logistica === true),
  };
}
function podeFazer(acao, p) {
  if (!p.ativo) return false;
  if (p.admin) return true;
  return acao === "RECEBER" ? p.logistica : p.pd;
}
function exigirPermissao(acao, usuario) {
  const p = perfilAmostra(usuario);
  if (!p.ativo) throw erro("permission-denied", "Seu acesso está inativo.");
  if (!podeFazer(acao, p)) {
    throw erro("permission-denied", acao === "RECEBER" ? "Só a logística dá baixa no recebimento." : "Só o P&D cria, edita, homologa ou reprova amostras.");
  }
}
function exigirTransicao(acao, atual) {
  if (acao === "CRIAR") { if (atual) throw erro("failed-precondition", "Esta amostra já existe."); return; }
  if (ENCERRADOS.indexOf(atual.status) !== -1) throw erro("failed-precondition", "Esta amostra já está encerrada (" + STATUS[atual.status] + ").");
  if (["EDITAR", "CANCELAR", "RECEBER"].indexOf(acao) !== -1 && atual.status !== "SOLICITADA") throw erro("failed-precondition", "Esta amostra já foi recebida.");
  if (["HOMOLOGAR", "REPROVAR"].indexOf(acao) !== -1 && atual.status !== "RECEBIDA") throw erro("failed-precondition", "A amostra ainda não foi recebida.");
}

/* Campos da solicitação, conferidos contra o cadastro (nome do material e do fornecedor vêm do banco). */
function normalizarDados(d, ctx) {
  d = d || {};
  if (!TIPOS[d.tipo]) throw erro("invalid-argument", "Escolha o tipo: nova matéria-prima ou já cadastrada.");
  if (!MOTIVOS[d.motivo]) throw erro("invalid-argument", "Escolha o motivo da amostra.");
  const out = {tipo: d.tipo, motivo: d.motivo};
  if (d.tipo === "NOVA") {
    const nome = texto(d.materialNovo && d.materialNovo.nome, 160);
    if (!nome) throw erro("invalid-argument", "Informe o nome da matéria-prima nova.");
    out.materialNovo = {nome, descricao: texto(d.materialNovo.descricao, 1000)};
  } else {
    const codigo = texto(d.materialCodigo, 40);
    const m = codigo && ((ctx.materiais || {})[codigo]);
    if (!m) throw erro("invalid-argument", "Matéria-prima " + (codigo || "(vazia)") + " não está no cadastro.");
    out.material = {codigo, nome: texto(m.mpNome, 200)};
  }
  const fk = texto(d.fornecedorKey, 80);
  const f = fk && ((ctx.fornecedores || {})[fk]);
  if (!f) throw erro("invalid-argument", "Escolha um fornecedor do cadastro.");
  out.fornecedor = {key: fk, nome: texto(f.nomeFantasia || f.razaoSocial || fk, 200)};
  out.custoKg = numero(d.custoKg, "o custo por kg");
  out.custoAmostra = numero(d.custoAmostra, "o custo da amostra");
  const q = d.quantidade || {};
  const qv = Number(q.valor);
  if (!isFinite(qv) || qv <= 0) throw erro("invalid-argument", "Informe a quantidade da amostra (maior que zero).");
  if (!UNIDADES[q.unidade]) throw erro("invalid-argument", "Unidade da quantidade: g ou kg.");
  out.quantidade = {valor: qv, unidade: q.unidade};
  out.previsaoChegada = data(d.previsaoChegada, "a previsão de chegada");
  out.observacoes = texto(d.observacoes, 1000);
  return out;
}

/* Aplica uma ação ao registro (puro). Devolve o registro novo (sem mexer em historico) e o evento. */
function aplicarAcao(atual, acao, ator, dados, agora, ctx) {
  if (!ACOES[acao]) throw erro("invalid-argument", "Ação desconhecida.");
  exigirPermissao(acao, ator.usuario);
  exigirTransicao(acao, atual);
  dados = dados || {};
  const por = {uid: ator.uid, nome: ator.nome};
  const evento = {acao, de: atual ? atual.status : null, para: null, por, em: agora};
  let reg;
  if (acao === "CRIAR") {
    reg = Object.assign({codigo: ctx.codigo}, normalizarDados(dados, ctx), {status: "SOLICITADA", solicitante: {uid: ator.uid, nome: ator.nome, em: agora}});
  } else if (acao === "EDITAR") {
    const novos = normalizarDados(dados, ctx);
    reg = Object.assign({}, atual);
    EDITAVEIS.forEach((k) => { delete reg[k]; });
    Object.assign(reg, novos);
    evento.campos = EDITAVEIS.filter((k) => JSON.stringify(atual[k] === undefined ? null : atual[k]) !== JSON.stringify(novos[k] === undefined ? null : novos[k]));
  } else if (acao === "CANCELAR") {
    const motivo = texto(dados.motivo, 500);
    if (!motivo) throw erro("invalid-argument", "Informe o motivo do cancelamento.");
    reg = Object.assign({}, atual, {status: "CANCELADA", cancelamento: {motivo, por, em: agora}});
  } else if (acao === "RECEBER") {
    if (!FORMAS[dados.forma]) throw erro("invalid-argument", "Escolha a forma de entrega: correio, transportadora ou motoboy.");
    reg = Object.assign({}, atual, {status: "RECEBIDA", recebimento: {data: data(dados.data, "a data do recebimento"), forma: dados.forma, por, em: agora}});
  } else {
    const parecer = texto(dados.parecer, 2000);
    if (acao === "REPROVAR" && !parecer) throw erro("invalid-argument", "O parecer é obrigatório para reprovar.");
    const st = acao === "HOMOLOGAR" ? "HOMOLOGADA" : "REPROVADA";
    reg = Object.assign({}, atual, {status: st, parecer: {decisao: st, texto: parecer, por, em: agora}});
  }
  reg.atualizadoEm = agora;
  evento.para = reg.status;
  return {registro: reg, evento};
}

function chavePedido(v) {
  const s = texto(v, 64);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) throw erro("invalid-argument", "Pedido sem identificação (requestId).");
  return s;
}

function criarServico({db, agora = () => new Date().toISOString()}) {
  const ler = async (p) => (await db.ref(p).once("value")).val();
  async function contexto(dados) {
    const d = dados || {};
    const ctx = {materiais: {}, fornecedores: {}};
    const cod = texto(d.materialCodigo, 40);
    const fk = texto(d.fornecedorKey, 80);
    if (d.tipo === "CADASTRADA" && /^[A-Za-z0-9_-]+$/.test(cod)) ctx.materiais[cod] = await ler("materiais/" + cod);
    if (/^[A-Za-z0-9_-]+$/.test(fk)) ctx.fornecedores[fk] = await ler("fornecedores/" + fk);
    return ctx;
  }
  async function resultado(id) {
    const a = (await ler("amostras_mp/" + id)) || {};
    return {id, codigo: a.codigo || "", status: a.status || ""};
  }

  async function executar(uid, pedido) {
    const p = pedido || {};
    const req = chavePedido(p.requestId);
    const usuario = await ler("usuarios/" + uid);
    const ator = {uid, nome: texto((usuario && (usuario.nome || usuario.email)) || uid, 120), usuario};
    const acao = String(p.acao || "");
    if (!ACOES[acao]) throw erro("invalid-argument", "Ação desconhecida.");
    exigirPermissao(acao, usuario);
    const jaFeito = await ler("amostras_mp_pedidos/" + uid + "/" + req);
    if (jaFeito) return resultado(jaFeito);
    const ctx = acao === "CRIAR" || acao === "EDITAR" ? await contexto(p.dados) : {};
    const t = agora();

    if (acao === "CRIAR") {
      aplicarAcao(null, acao, ator, p.dados, t, Object.assign({codigo: "AM-0000"}, ctx)); // valida antes de gastar número
      const cont = await db.ref("config/contadores/amostrasMp").transaction((v) => (Number(v) || 0) + 1);
      ctx.codigo = "AM-" + String(cont.snapshot.val()).padStart(4, "0");
      const id = db.ref("amostras_mp").push().key;
      const r = aplicarAcao(null, acao, ator, p.dados, t, ctx);
      const hid = db.ref("amostras_mp/" + id + "/historico").push().key;
      r.registro.historico = {[hid]: r.evento};
      await db.ref().update({["amostras_mp/" + id]: r.registro, ["amostras_mp_pedidos/" + uid + "/" + req]: id});
      return {id, codigo: r.registro.codigo, status: r.registro.status};
    }

    const id = texto(p.id, 80);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw erro("invalid-argument", "Amostra não informada.");
    const hid = db.ref("amostras_mp/" + id + "/historico").push().key;
    let falhou = null;
    const tx = await db.ref("amostras_mp/" + id).transaction((atual) => {
      if (!atual) return atual; // cache vazio: deixa o servidor responder (armadilha do null, CLAUDE.md)
      falhou = null;
      try {
        const r = aplicarAcao(atual, acao, ator, p.dados, t, ctx);
        r.registro.historico = Object.assign({}, atual.historico, {[hid]: r.evento});
        return r.registro;
      } catch (e) { falhou = e; return undefined; }
    });
    if (falhou) throw falhou;
    if (!tx.snapshot.exists()) throw erro("not-found", "Amostra não encontrada.");
    await db.ref("amostras_mp_pedidos/" + uid + "/" + req).set(id);
    return resultado(id);
  }
  return {executar};
}

module.exports = {
  STATUS, ACOES, TIPOS, MOTIVOS, FORMAS, UNIDADES,
  perfilAmostra, podeFazer, normalizarDados, aplicarAcao, criarServico,
};
