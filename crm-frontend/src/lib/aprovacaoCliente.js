/* Registro da aprovação do cliente (COM-02, PROMPT_ENGENHARIA_PACOTE_20261021.md).
 *
 * Pedido do usuário (21/10/2026): "modal aprovação do cliente com quem aprovou, qual canal,
 * data e horário". Até aqui o retorno da amostra gravava só o resultado e a hora do clique
 * (as aprovações de 14–15/10 têm a data da reconciliação em lote, não a do cliente), e a
 * decisão do orçamento só o uid de quem registrou.
 * Funções puras: nada aqui lê ou grava no banco. */

export const CANAIS_APROVACAO = [
  ["whatsapp", "WhatsApp"],
  ["email", "E-mail"],
  ["telefone", "Telefone"],
  ["presencial", "Presencial"],
  ["reuniao_online", "Reunião online"],
  ["outro", "Outro"],
];
const ROTULO_CANAL = Object.fromEntries(CANAIS_APROVACAO);

// Folga para relógio do computador um pouco adiantado em relação ao do servidor.
const FOLGA_FUTURO_MS = 2 * 60 * 1000;

const txt = (v) => String(v ?? "").trim();

// Contatos do cliente no CRM (principal + adicionais), decisores primeiro.
export function contatosDoCliente(cliente) {
  const lista = [cliente?.contato_principal, ...(Array.isArray(cliente?.contatos_adicionais) ? cliente.contatos_adicionais : [])]
    .filter((c) => c && txt(c.nome))
    .map((c, i) => ({ id: i === 0 ? "principal" : `adicional_${i}`, nome: txt(c.nome), cargo: txt(c.cargo), decisor: c.decisor === true }));
  return lista.sort((a, b) => Number(b.decisor) - Number(a.decisor));
}

/* dados = { contato_id?, quem_nome, quem_cargo?, canal, canal_outro?, aprovado_em (ISO ou
 * "AAAA-MM-DDTHH:mm" do input), evidencia_file_id?, observacao? } */
export function validarAprovacaoCliente(dados, { agoraMs = Date.now(), registradoPor = "", registradoPorNome = "" } = {}) {
  const d = dados || {};
  const erros = [];
  if (!txt(d.quem_nome)) erros.push("Informe quem aprovou do lado do cliente.");
  if (!ROTULO_CANAL[d.canal]) erros.push("Informe o canal da aprovação.");
  if (d.canal === "outro" && !txt(d.canal_outro)) erros.push("Descreva o canal (Outro).");
  const ms = Date.parse(d.aprovado_em);
  if (!txt(d.aprovado_em) || Number.isNaN(ms)) erros.push("Informe a data e o horário da aprovação.");
  else if (ms > agoraMs + FOLGA_FUTURO_MS) erros.push("A data e o horário da aprovação não podem estar no futuro.");
  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    erros: [],
    registro: {
      contato_id: txt(d.contato_id), quem_nome: txt(d.quem_nome), quem_cargo: txt(d.quem_cargo),
      canal: d.canal, canal_outro: d.canal === "outro" ? txt(d.canal_outro) : "",
      aprovado_em: new Date(ms).toISOString(), aprovado_em_ms: ms,
      evidencia_file_id: txt(d.evidencia_file_id), observacao: txt(d.observacao),
      registrado_por: registradoPor, registrado_por_nome: registradoPorNome, registrado_em: new Date(agoraMs).toISOString(),
    },
  };
}

const dataHora = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Linha do histórico: "Amostra 2026-031-A1-a aprovada por Maria (Compras) via WhatsApp em 22/10/2026 14:05 — registrado por Ana".
export function textoAprovacao(registro, { oque = "", resultado = "aprovada" } = {}) {
  const r = registro || {};
  const quem = r.quem_cargo ? `${r.quem_nome} (${r.quem_cargo})` : r.quem_nome;
  const canal = r.canal === "outro" ? r.canal_outro : ROTULO_CANAL[r.canal] || r.canal;
  const verbo = { aprovada: "aprovada", aprovado: "aprovado", reprovada: "reprovada", reprovado: "reprovado", retrabalho: "com retrabalho pedido" }[resultado] || resultado;
  return `${oque ? `${oque} ` : ""}${verbo} por ${quem} via ${canal} em ${dataHora(r.aprovado_em)}${r.registrado_por_nome ? ` — registrado por ${r.registrado_por_nome}` : ""}`;
}

// Entrada na linha do tempo (historico_movimentacoes) do projeto.
export function entradaHistoricoAprovacao(registro, { oque, resultado, documentoId = "" }) {
  return {
    tipo: "aprovacao_cliente", resultado, documento_id: documentoId,
    texto: textoAprovacao(registro, { oque, resultado }),
    aprovacao_cliente: registro, data: registro.registrado_em, usuario: registro.registrado_por_nome || "",
  };
}
