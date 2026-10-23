/* Estado por bloco do Kickoff (RFC-001, aprovado em 22/10/2026: D-1 donos, D-3 V1 + V4).
 *
 *   não iniciado → em preenchimento → pronto → validado → congelado
 * "pronto" é calculado (sem pendência, lib/kickoffPendencias.js); "validado" é o dono do bloco
 * que confere (ou aprova a etapa dele); "congelado" é o Kickoff aprovado — mudar só em nova vN.
 * Bloco validado que muda perde a validação (nunca sobrescrever validado em silêncio).
 * Funções puras: nada aqui lê ou grava no banco. */

import { BLOCOS, simNao } from "./kickoffPendencias";

// D-1 (aprovado): quem valida cada bloco = etapa de aprovação dona dele.
export const DONO_DO_BLOCO = {
  bloco0: "comercial", fechamento: "comercial", bloco1: "lider_pd",
  bloco2: "eng_produto", bloco3: "eng_produto", bloco4: "eng_produto", bloco5: "cq",
};
export const BLOCOS_DA_ETAPA = Object.entries(DONO_DO_BLOCO).reduce((m, [bloco, etapa]) => {
  (m[etapa] ||= []).push(bloco);
  return m;
}, { direcao: [] });

export const ROTULO_ESTADO = {
  nao_iniciado: "Não iniciado", em_preenchimento: "Em preenchimento", pronto: "Pronto",
  validado: "Validado", congelado: "Congelado",
};

// Conteúdo do bloco em texto estável (mesma informação = mesma assinatura, a ordem das chaves não importa).
function estavel(v) {
  if (Array.isArray(v)) return `[${v.map(estavel).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${estavel(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? "");
}
export const assinaturaDoBloco = (questionario, bloco) => estavel((questionario || {})[bloco] || {});

// Bloco sem nada respondido (linha de componente só com o nome padrão não conta).
function vazio(dados) {
  const d = dados || {};
  return Object.entries(d).every(([k, v]) => {
    if (k === "componentes") return (v || []).every((linha) => Object.entries(linha || {}).every(([c, x]) => ["id", "componente"].includes(c) || !String(x ?? "").trim()));
    if (Array.isArray(v)) return !v.length;
    return !String(v ?? "").trim();
  });
}

/* O bloco 1 (formulação) espera o P&D enquanto a fórmula não está registrada — salvo fórmula do
 * cliente (industrialização pura), que não passa pelo P&D. */
export const aguardaPd = (kickoff, questionario) => !kickoff?.formula_id && (questionario?.bloco1?.formula || "") !== "do_cliente";

/* estados = { bloco: { estado, dono, aguardando, validado_por, validado_por_nome, validado_em, assinatura } }
 * Devolve { estados, invalidados: [bloco] }. */
export function estadoDosBlocos({ questionario, pendencias, anterior = {}, congelado = false, aguardandoPd = false }) {
  const estados = {};
  const invalidados = [];
  for (const bloco of BLOCOS) {
    const antes = anterior[bloco] || {};
    const assinatura = assinaturaDoBloco(questionario, bloco);
    const base = { dono: DONO_DO_BLOCO[bloco], aguardando: bloco === "bloco1" && aguardandoPd ? "pd" : null };
    const validadoAntes = ["validado", "congelado"].includes(antes.estado);
    if (validadoAntes && antes.assinatura === assinatura) {
      estados[bloco] = { ...antes, ...base, estado: congelado ? "congelado" : "validado" };
      continue;
    }
    if (validadoAntes) invalidados.push(bloco);
    const completo = pendencias?.[bloco]?.completo;
    const estado = vazio(questionario?.[bloco]) ? "nao_iniciado" : (completo ? "pronto" : "em_preenchimento");
    estados[bloco] = { ...base, estado, ...(validadoAntes ? { invalidado_em: true } : {}) };
  }
  return { estados, invalidados };
}

// Validar os blocos de uma etapa: só "pronto" (ou já validado) e sem esperar o P&D.
export function validarBlocos(estados, blocos, { assinaturas, quem, quemNome, agora }) {
  const erros = [];
  const novos = { ...estados };
  for (const bloco of blocos) {
    const e = estados[bloco] || {};
    if (e.aguardando === "pd") { erros.push(`${bloco}: aguardando o P&D registrar a fórmula`); continue; }
    if (e.estado === "validado" || e.estado === "congelado") continue;
    if (e.estado !== "pronto") { erros.push(`${bloco}: ${ROTULO_ESTADO[e.estado] || e.estado} (complete antes de validar)`); continue; }
    novos[bloco] = { ...e, estado: "validado", validado_por: quem, validado_por_nome: quemNome, validado_em: agora, assinatura: assinaturas[bloco] };
  }
  return { estados: novos, erros };
}

export const congelarTodos = (estados) => Object.fromEntries(Object.entries(estados).map(([b, e]) => [b, { ...e, estado: "congelado" }]));

export { simNao };
