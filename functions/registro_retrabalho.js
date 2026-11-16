"use strict";
/* Registro retrospectivo de retrabalho (16/11/2026) — PROMPT_RNC_RETRABALHO_26302_01.md.

   Callable `registroRetrabalho`. A Qualidade documenta um retrabalho que JÁ aconteceu: RNC,
   etapas (identificação, retrabalho, envase de retrabalho) e balanço de quantidades.

   Garantia da tarefa: este serviço só LÊ ops/, nao_conformidades/, conferencias_pa/ e usuarios/,
   e só GRAVA em registros_retrabalho/{id} e registros_retrabalho_pedidos/{uid}/{requestId}.
   Nada de OP, pedido, estoque, palete, conferência, expedição ou linha (o pedido já seguiu).
   run_registro_retrabalho_test.js confere os caminhos gravados.

   Motor puro: ./registro_retrabalho_motor.js (cópia byte a byte de public/shared/registro-retrabalho.js).
   Transação só no nó do registro, nunca na raiz (limite de 16 MB, CLAUDE.md). */
const M = require("./registro_retrabalho_motor");

const NO = "registros_retrabalho";
const NO_PEDIDOS = "registros_retrabalho_pedidos";
const CHAVE_OK = /^[A-Za-z0-9_-]{1,80}$/;

function erro(code, message) { return Object.assign(new Error(message), {code}); }
function chave(v, rotulo) {
  const s = String(v == null ? "" : v).trim();
  if (!CHAVE_OK.test(s)) throw erro("invalid-argument", rotulo + " inválido.");
  return s;
}
function chaveRnc(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s || /[.#$\[\]\/]/.test(s) || s.length > 60) throw erro("invalid-argument", "RNC inválida.");
  return s;
}

function criarServico({db, agora = () => new Date().toISOString()}) {
  const ler = async (p) => (await db.ref(p).once("value")).val();

  async function contextoCriacao(d) {
    d = d || {};
    const rncNumero = chaveRnc(d.rncNumero);
    const opKeyOrigem = chave(d.opKeyOrigem, "OP de origem");
    const destinos = M.lista(d.destinos).map((x) => chave(x && x.opKey, "OP de destino"));
    const ctx = {rnc: await ler("nao_conformidades/" + rncNumero), opOrigem: await ler("ops/" + opKeyOrigem), opsDestino: {}, conferencias: {}};
    for (const k of destinos) {
      ctx.opsDestino[k] = await ler("ops/" + k);
      ctx.conferencias[k] = await ler("conferencias_pa/" + k);
    }
    return ctx;
  }

  async function resultado(id) {
    const r = (await ler(NO + "/" + id)) || {};
    return {id, status: r.status || ""};
  }

  async function executar(uid, pedido) {
    const p = pedido || {};
    const req = chave(p.requestId, "Pedido (requestId)");
    const acao = String(p.acao || "");
    if (!M.ACOES[acao]) throw erro("invalid-argument", "Ação desconhecida.");
    const usuario = await ler("usuarios/" + uid);
    const ator = {uid, nome: String((usuario && (usuario.nome || usuario.email)) || uid).slice(0, 120), usuario};
    const perfil = M.perfil(usuario);
    if (!perfil.ativo) throw erro("permission-denied", "Seu acesso está inativo.");
    if (!perfil.edita) throw erro("permission-denied", "Só a Qualidade (ou o administrador) registra o retrabalho.");

    const pedRef = db.ref(NO_PEDIDOS + "/" + uid + "/" + req);
    const jaFeito = await ler(NO_PEDIDOS + "/" + uid + "/" + req);
    if (typeof jaFeito === "string") return resultado(jaFeito);
    if (jaFeito) throw erro("failed-precondition", "Este pedido já está sendo processado. Aguarde e confira a lista.");

    const t = agora();
    const ctx = acao === "CRIAR" ? await contextoCriacao(p.dados) : null;
    if (acao === "CRIAR") M.aplicarAcao(null, acao, ator, p.dados, t, ctx); // valida antes de reservar

    const reserva = await pedRef.transaction((v) => (v ? undefined : {processando: true, em: t}));
    if (!reserva.committed) {
      const v = reserva.snapshot.val();
      if (typeof v === "string") return resultado(v);
      throw erro("failed-precondition", "Este pedido já está sendo processado. Aguarde e confira a lista.");
    }
    try {
      const id = acao === "CRIAR" ? await criar(ator, p.dados, t, ctx) : await agir(acao, ator, p, t);
      await pedRef.set(id);
      return resultado(id);
    } catch (e) {
      await pedRef.set(null).catch(() => null);
      throw e;
    }
  }

  async function criar(ator, dados, t, ctx) {
    const existentes = (await db.ref(NO).once("value")).val() || {};
    for (let tentativa = 0; tentativa < 10; tentativa++) {
      const id = M.proximaChave(dados.opKeyOrigem, existentes);
      const hid = db.ref(NO + "/" + id + "/historico").push().key;
      let falhou = null;
      const tx = await db.ref(NO + "/" + id).transaction((atual) => {
        falhou = null;
        if (atual) return undefined; // chave ocupada: tenta a seguinte
        try {
          const r = M.aplicarAcao(null, "CRIAR", ator, dados, t, ctx);
          r.registro.codigo = id;
          r.registro.historico = {[hid]: r.evento};
          return r.registro;
        } catch (e) { falhou = e; return undefined; }
      });
      if (falhou) throw falhou;
      if (tx.committed) return id;
      existentes[id] = true;
    }
    throw erro("aborted", "Não foi possível reservar o código do registro. Tente de novo.");
  }

  async function agir(acao, ator, p, t) {
    const id = chave(p.id, "Registro");
    const hid = db.ref(NO + "/" + id + "/historico").push().key;
    let falhou = null;
    const tx = await db.ref(NO + "/" + id).transaction((atual) => {
      if (!atual) return atual; // cache vazio: deixa o servidor responder (armadilha do null, CLAUDE.md)
      falhou = null;
      try {
        const r = M.aplicarAcao(atual, acao, ator, p.dados, t, null);
        r.registro.historico = Object.assign({}, atual.historico, {[hid]: r.evento});
        return r.registro;
      } catch (e) { falhou = e; return undefined; }
    });
    if (falhou) throw falhou;
    if (!tx.snapshot.exists()) throw erro("not-found", "Registro não encontrado.");
    return id;
  }

  return {executar};
}

module.exports = {NO, NO_PEDIDOS, criarServico};
