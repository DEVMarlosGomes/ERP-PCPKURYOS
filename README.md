# Kuryos ERP / PCP

Sistema operacional da Kuryos para CRM, P&D, produção, qualidade, estoque,
compras, logística, expedição, custos e gestão. A aplicação combina páginas
HTML/JavaScript em `public/`, um CRM React/Vite em `crm-frontend/`, funções Node
em `functions/` e Firebase Realtime Database/Auth/Storage.

Antes de trabalhar, leia [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md) e
[AGENT_STATUS.md](AGENT_STATUS.md). O estado técnico e os comandos canônicos
estão em [docs/setup.md](docs/setup.md).

## Desenvolvimento

```powershell
npm ci --prefix crm-frontend
npm test --prefix crm-frontend -- --run
npm run build --prefix crm-frontend -- --assetsDir static/crm
node scripts/integrar-crm-build.mjs crm-frontend/build
```

As páginas legadas têm testes de regressão `run_*_test.js`, executados de forma
proporcional ao módulo alterado. Deploy da VPS ocorre por commit na branch
`hostinger-deploy` com `scripts/hostinger/deploy.sh`; push isolado não publica.

