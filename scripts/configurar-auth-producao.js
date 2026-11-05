"use strict";

// Configuração idempotente do Firebase Auth do ERP.
// Leitura:  node scripts/configurar-auth-producao.js --project erpkuryos
// Escrita:  node scripts/configurar-auth-producao.js --project erpkuryos --apply
// Exige GOOGLE_APPLICATION_CREDENTIALS com uma conta de serviço autorizada.
const path = require("node:path");
const {createRequire} = require("node:module");
const requireFunctions = createRequire(path.resolve(__dirname, "../functions/package.json"));
const {initializeApp, getApps, deleteApp, applicationDefault} = requireFunctions("firebase-admin/app");
const {getAuth} = requireFunctions("firebase-admin/auth");
const {GoogleAuth} = requireFunctions("google-auth-library");

const PASSWORD_POLICY = Object.freeze({
  enforcementState: "ENFORCE",
  forceUpgradeOnSignin: false,
  constraints: Object.freeze({
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireNumeric: true,
    requireNonAlphanumeric: false,
  }),
});

const CLIENT_PERMISSIONS = Object.freeze({
  disabledUserSignup: true,
  disabledUserDeletion: true,
});

function argumento(nome, fallback = null) {
  const index = process.argv.indexOf(nome);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function clienteGoogle() {
  const auth = new GoogleAuth({scopes: ["https://www.googleapis.com/auth/cloud-platform"]});
  const client = await auth.getClient();
  const rawHeaders = await client.getRequestHeaders();
  const headers = typeof rawHeaders.entries === "function" ? Object.fromEntries(rawHeaders.entries()) : {...rawHeaders};
  return {client, headers};
}

async function chamarConfig(projectId, options = {}) {
  const {headers} = await clienteGoogle();
  const mask = options.mask ? `?updateMask=${encodeURIComponent(options.mask)}` : "";
  const response = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config${mask}`, {
    method: options.method || "GET",
    headers: {...headers, "Content-Type": "application/json"},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && data.error && data.error.message || `HTTP ${response.status}`;
    throw new Error(`Identity Toolkit: ${message}`);
  }
  return data;
}

function resumo(config, projectConfig) {
  const permissions = config && config.client && config.client.permissions || {};
  const policy = projectConfig && projectConfig.passwordPolicyConfig || {};
  return {
    signup_publico_desativado: permissions.disabledUserSignup === true,
    exclusao_publica_desativada: permissions.disabledUserDeletion === true,
    politica_senha: {
      estado: policy.enforcementState || null,
      forcar_troca_no_login: policy.forceUpgradeOnSignin === true,
      restricoes: policy.constraints || null,
    },
  };
}

async function executar({projectId, apply}) {
  const app = initializeApp({credential: applicationDefault(), projectId}, `auth-config-${Date.now()}`);
  try {
    const adminAuth = getAuth(app);
    if (apply) {
      await adminAuth.projectConfigManager().updateProjectConfig({
        passwordPolicyConfig: JSON.parse(JSON.stringify(PASSWORD_POLICY)),
      });
      await chamarConfig(projectId, {
        method: "PATCH",
        mask: "client.permissions.disabledUserSignup,client.permissions.disabledUserDeletion",
        body: {client: {permissions: CLIENT_PERMISSIONS}},
      });
    }
    const [rawConfig, projectConfig] = await Promise.all([
      chamarConfig(projectId),
      adminAuth.projectConfigManager().getProjectConfig(),
    ]);
    const state = resumo(rawConfig, projectConfig);
    if (apply && (!state.signup_publico_desativado || !state.exclusao_publica_desativada || state.politica_senha.estado !== "ENFORCE")) {
      throw new Error("A configuração retornada não confirma todas as proteções solicitadas.");
    }
    return state;
  } finally {
    await deleteApp(app);
  }
}

if (require.main === module) {
  const projectId = argumento("--project", process.env.GCLOUD_PROJECT || "erpkuryos");
  executar({projectId, apply: process.argv.includes("--apply")})
    .then((state) => console.log(JSON.stringify({projectId, aplicado: process.argv.includes("--apply"), ...state}, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = {PASSWORD_POLICY, CLIENT_PERMISSIONS, resumo, executar};
