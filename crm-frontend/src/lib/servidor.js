/* Chamadas às funções do servidor (Render, functions/index.js), INF-04 (22/10/2026).
 * O site está na Vercel e as funções rodam no Render pelo mesmo protocolo do SDK
 * (public/auth_check.js faz o mesmo desvio no PCP). No plano gratuito o servidor dorme:
 * a primeira chamada depois de um tempo parado pode levar 30–60 s. */
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/lib/firebase";

export const ORIGEM_FUNCOES = "https://pcp-kuryos-functions.onrender.com";

let funcoes = null;
const instancia = () => (funcoes ||= getFunctions(firebaseApp, ORIGEM_FUNCOES));

// Erro do servidor no mesmo formato do adaptador (err.response.status/data.detail).
function comoErroDaApi(err) {
  const status = { "failed-precondition": 422, "invalid-argument": 400, "permission-denied": 403, unauthenticated: 401, "not-found": 404 }[String(err?.code || "").replace("functions/", "")] || 503;
  const detail = err?.details && typeof err.details === "object" ? { ...err.details, message: err.message } : (status === 503 ? "O servidor não respondeu. Tente de novo em instantes (no primeiro uso do dia ele pode levar até 1 minuto para acordar)." : err?.message);
  const erro = new Error(typeof detail === "string" ? detail : err?.message || "Erro no servidor");
  erro.response = { status, data: { detail } };
  return erro;
}

export async function chamarServidor(nome, dados) {
  try {
    return (await httpsCallable(instancia(), nome, { timeout: 90000 })(dados)).data;
  } catch (err) {
    throw comoErroDaApi(err);
  }
}

// AMO-03: o servidor confere os 100% e libera por 2 min a gravação do status.
export const liberarEtapaPd = (requestId, novoStatus, voltar = false) => chamarServidor("liberarEtapaPd", { requestId, novoStatus, voltar });
