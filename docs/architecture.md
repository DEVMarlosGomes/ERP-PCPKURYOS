# Arquitetura atual

## Stack e mapa

- `public/`: aplicação operacional HTML/JavaScript e módulos compartilhados.
- `crm-frontend/`: React 18, Vite 8, Vitest e Firebase SDK; o build é integrado
  em `public/static/crm` somente pelo script oficial.
- `functions/`: Node 24, Firebase Functions/Admin e adaptador HTTP da VPS.
- `database.rules.json` e `storage.rules`: autorização efetiva dos dados.
- `scripts/hostinger/`: build, deploy, rollback e backup da VPS.
- `scripts/firebase-merge/`: importação conservadora por folha, com simulação,
  pré-condições, lotes, checkpoint, backup e reversão seletiva.

## Fluxo e limites

As telas autenticam no projeto `erpkuryos`. Operações comuns usam o SDK; ações
privilegiadas e transações de negócio passam pelas funções. O CRM usa o namespace
`erp/kuryos`; os módulos históricos de PCP usam raízes como `pedidos`, `ops`,
`registros`, `estoque` e `expedicoes_comerciais`.

Não há PostgreSQL, Drizzle ou migrações SQL: o RTDB é uma decisão existente e
operacional. Mudanças de esquema são aditivas e compatíveis com registros antigos.
Dados reais nunca são usados como fixture destrutiva; auditorias em produção são
somente leitura, salvo autorização específica de correção.

## Decisões

O toolkit Vibe Coding foi adotado como processo/documentação, sem migrar o stack
para Next.js. `CLAUDE.md` continua sendo a memória técnica detalhada e
`AGENT_STATUS.md` coordena propriedade de arquivos entre sessões.

