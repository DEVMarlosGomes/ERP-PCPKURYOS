# Qualidade

## Estratégia

Cada correção reproduz o defeito, testa a regra isolada e valida a integração
afetada. Fluxos Firebase usam fixtures/emulador quando há escrita; produção é
consultada somente para evidência. Alterações de CRM exigem Vitest e build oficial.

Comandos recorrentes:

```powershell
node <teste-regressao-do-modulo>.js
npm test --prefix crm-frontend -- --run
npm run build --prefix crm-frontend -- --assetsDir static/crm
node scripts/integrar-crm-build.mjs crm-frontend/build
node run_hostinger_deploy_test.js
git diff --check
```

Não há lint/typecheck raiz unificado; essa é uma limitação conhecida do legado.
Não se adicionam bloqueadores de push ou migrações amplas como efeito colateral.

## Revisão e segurança

Revise o diff, chamadores, regras do RTDB/Storage, permissões e testes conectados.
Relatórios de segurança com dados sensíveis permanecem privados. Auditoria não
autoriza exploração ativa, escrita em produção ou publicação. Dependências e
avisos são investigados no escopo da entrega; build aprovado não equivale a
segurança completa.

O método de harness adotado é nativo: instruções curtas e carregáveis,
`AGENT_STATUS.md` como passagem verificável, testes determinísticos por contrato e
registro explícito de verificações bloqueadas. Reavaliar quando AGENTS/CLAUDE,
autorização, deploy ou fluxo multiagente mudar materialmente.

