# Preparação local

## Pré-requisitos

Windows/PowerShell, Git, Node.js 24 e npm. Para o CRM:

```powershell
npm ci --prefix crm-frontend
npm ci --prefix functions
```

Credenciais e arquivos `.env` não entram no Git. O Firebase CLI deve ser usado
pela instalação oficial já autenticada; não copie caches ou credenciais de outra
máquina.

## Verificação

Leia `AGENTS.md`, `CLAUDE.md` e `AGENT_STATUS.md`, confira `git status --short` e
o último commit, depois rode os testes do módulo. Para CRM:

```powershell
npm test --prefix crm-frontend -- --run
npm run build --prefix crm-frontend -- --assetsDir static/crm
node scripts/integrar-crm-build.mjs crm-frontend/build
```

Testes HTML/Node vivem em `run_*_test.js`. Alguns testes visuais usam Playwright
em instalação isolada e informam `PLAYWRIGHT_MODULE`; ausência desse módulo é uma
limitação do ambiente, não motivo para instalá-lo dentro da aplicação.

