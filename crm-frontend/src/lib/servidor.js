/* Chamadas às funções do servidor pelo mesmo protocolo callable do SDK.
 * Vercel continua no Render até o cutover; no domínio próprio, Caddy encaminha
 * /api para o container Node da Hostinger. VITE_FUNCTIONS_ORIGIN permite build
 * explícito para outro destino sem colocar credenciais no frontend. */
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/lib/firebase";

const origemPadrao = globalThis.location?.hostname === "pcp-kuryos.vercel.app"
  ? "https://pcp-kuryos-functions.onrender.com"
  : `${globalThis.location?.origin || ""}/api`;
export const ORIGEM_FUNCOES = import.meta.env.VITE_FUNCTIONS_ORIGIN || origemPadrao;

let funcoes = null;
const instancia = () => (funcoes ||= getFunctions(firebaseApp, ORIGEM_FUNCOES));

// Erro do servidor no mesmo formato do adaptador (err.response.status/data.detail).
function comoErroDaApi(err) {
  const status = { "failed-precondition": 422, "invalid-argument": 400, "permission-denied": 403, unauthenticated: 401, "not-found": 404 }[String(err?.code || "").replace("functions/", "")] || 503;
  const detail = err?.details && typeof err.details === "object" ? { ...err.details, message: err.message } : (status === 503 ? "O servidor não respondeu. Tente de novo em instantes." : err?.message);
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
