# Setup e evidências

## Fonte

Adaptação verificada em 08/11/2026 a partir do Vibe Coding Toolkit na revisão
`7ef68dd7b00ddfc5cd464458855e4ab66dd2128f`. O repositório da fonte não contém
`SKILL.md`; portanto não foi instalado como skill do Codex. Foi aplicada a rota
documentada para projeto existente, preservando stack, autenticação e instruções.

Ambiente observado: Node `v24.17.0`, npm `11.13.0`, Git `2.55.0.windows.3`, branch
`hostinger-deploy`. Firebase CLI `15.34.1` foi executado pela instalação npm já
autenticada durante auditoria somente leitura.

## Matriz de componentes

| Componente | Decisão | Estado |
|---|---|---|
| Documentação de produto/arquitetura/setup/qualidade | Adaptada ao ERP existente | Configurada neste repositório |
| AGENTS/CLAUDE e memória | Preservar equivalentes mais completos | Validados por leitura; `AGENT_STATUS.md` é o handoff |
| Next.js/Drizzle/PostgreSQL | Não aplicável | O produto usa Vite/Firebase; nenhuma migração autorizada |
| Skills de runtime Next/PostgreSQL/shadcn | Não aplicáveis | Stack incompatível ou UI já adotada |
| GitHub CI repair | Pendente de uma falha/execução CI concreta | Não há execução autorizada nesta adoção |
| Differential security review | Disponível sob pedido explícito | Não executada; não faz parte do setup comum |
| Sentry MCP | Não configurado | Serviço/organização não escolhidos |
| Context7/Graphify | Não duplicar integrações globais | Graphify não foi observado; exclusões locais preparadas |
| Harness2 | Método nativo, sem dependência de aplicação | AGENTS + status + testes por contrato; CLI oficial não executada |
| Toolkit como skill | Não instalável | Fonte não possui `SKILL.md` |

## Verificações desta adoção

- Estrutura, branch, arquivos ativos, runtimes e lockfiles: validados.
- Testes específicos de dashboard e pedidos: validados nos commits temáticos.
- Suite/build completo do CRM: pendente da liberação dos arquivos ativos da outra
  sessão; não deve ser executado/publicado a partir de árvore compartilhada suja.
- Publicação: não realizada por esta adoção.

Reaplique a matriz quando o stack, autenticação, regras, CI ou processo de deploy
mudar. Não copie templates Next para este projeto nem trate presença em disco como
prova de integração executada.

