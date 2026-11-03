"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");

const read = (file) => fs.readFileSync(file, "utf8");
const dockerfile = read("Dockerfile");
const compose = read("compose.production.yml");
const caddy = read("deploy/hostinger/Caddyfile");
const env = read(".env.production.example");
const auth = read("public/auth_check.js");
const crm = read("crm-frontend/src/lib/servidor.js");
const deploy = read("scripts/hostinger/deploy.sh");
const backup = read("scripts/hostinger/backup.sh");
const doc = read("DEPLOY_HOSTINGER.md");
let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks += 1; };

ok(/node:24\.17\.0-alpine3\.23/.test(dockerfile), "runtime Node fixado");
ok(/caddy:2\.10\.2-alpine/.test(dockerfile), "Caddy fixado");
ok(!/:latest\b/.test(dockerfile + compose), "nenhuma imagem latest");
ok(/npm ci --prefix crm-frontend/.test(dockerfile), "CRM usa lockfile");
ok(/npm ci --omit=dev/.test(dockerfile), "backend instala só produção");
ok(!/npm cache clean/.test(dockerfile), "build paralelo não apaga cache npm compartilhado");
ok(!/COPY\s+.*firebase-service-account/i.test(dockerfile), "credencial não entra na imagem");
ok(/GOOGLE_APPLICATION_CREDENTIALS: \/run\/secrets\/firebase_service_account/.test(compose), "credencial montada como secret");
ok(!/\b8080:8080\b/.test(compose), "backend não publica a porta 8080");
ok(/max-size: "10m"/.test(compose) && /max-file: "5"/.test(compose), "logs rotacionados");
ok(/restart: unless-stopped/.test(compose), "reinício automático");
ok(/handle_path \/api\/\*/.test(caddy), "proxy preserva prefixo público /api");
ok(/handle \/healthz \{\s*respond 200\s*\}/.test(caddy), "healthcheck público precede arquivos estáticos");
ok(/www\.\{\$ERP_DOMAIN\}\s*\{\s*redir https:\/\/\{\$ERP_DOMAIN\}\{uri\} permanent\s*\}/.test(caddy), "alias www redireciona ao domínio canônico com HTTPS");
ok(/max_size 10MB/.test(caddy) && /read_timeout 120s/.test(caddy), "limite e timeout alinhados ao servidor");
ok(/try_files \{path\} \{path\}\.html =404/.test(caddy), "rotas diretas HTML funcionam");
ok(/pcp-kuryos\.vercel\.app[\s\S]*onrender\.com/.test(auth), "Vercel mantém Render até o corte");
ok(/location\.origin[\s\S]*\/api/.test(auth), "domínio Hostinger usa API no mesmo domínio");
ok(/VITE_FUNCTIONS_ORIGIN/.test(crm) && /location\?\.origin[\s\S]*\/api/.test(crm), "CRM usa origem configurável");
ok(/flock -n/.test(deploy), "deploy concorrente é bloqueado");
ok(!/compose down|down -v/.test(deploy), "deploy não derruba nem apaga volumes");
ok(/restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6/.test(backup), "retenção externa definida");
ok(/DISABLE_TRIGGERS=1/.test(doc) && /DISABLE_TRIGGERS=0/.test(doc), "cutover impede gatilhos duplicados");
ok(/<DOMINIO_DO_ERP>/.test(env) && /<IP_DA_VPS>/.test(doc) && /<USUARIO_DEPLOY>/.test(doc), "placeholders explícitos");

console.log(`OK Hostinger deploy: ${checks} contratos verificados.`);

