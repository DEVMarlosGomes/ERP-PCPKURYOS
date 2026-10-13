# Clonagem de identidade UI/UX — 12–13/10/2026

Referência: [ERPKuryosBeauty](https://github.com/DEVMarlosGomes/ERPKuryosBeauty),
`master` em `a6892e68f2a5d997b9102c2cdfcba27af3ba2635`. A auditoria utilizou
`frontend/src/index.css`, `App.css`, `DynamicSidebar.js`, e os componentes
`ui/button.jsx`, `input.jsx`, `tabs.jsx`, `card.jsx` e `table.jsx`.

## Entrega integrada

Dois desenvolvedores trabalharam em branches e worktrees próprios. O Frontend 1
implementou o design system e shell; o Frontend 2 aplicou os layouts operacionais.
Os commits da segunda frente foram integrados por cherry-pick.

O ponto de entrada continua sendo `public/shared/kuryos-repo-visual.css`. Ele
passou de uma folha monolítica para um agregador dos módulos abaixo, em ordem:

| Arquivo | Responsabilidade |
| --- | --- |
| `kuryos-ui-tokens.css` | Paleta Kuryos, temas, tipografia e escala de espaços |
| `kuryos-ui-components.css` | Botões, campos, cards, tabs, tabelas, dialogs e React existente |
| `kuryos-ui-layout.css` | Sidebar, navegação, rodapé, busca, compactação e mobile |
| `kuryos-ui-operational.css` | Layouts opt-in de 42 páginas operacionais |
| `kuryos-ui.js` | Identificação da página para os estilos; nenhuma leitura/escrita de dados |

Os estilos de compatibilidade anteriores continuam disponíveis para elementos
legados ainda dependentes deles. A nova identidade é carregada depois desses
estilos, com tokens e seletores explícitos; não há substituição de bundle React.

## Identidade aplicada

- Outfit em títulos, Manrope no conteúdo e JetBrains Mono nos códigos.
- Navy institucional `#0A1C69`, preservado conforme solicitado; sem trocar a
  marca por outra. A referência usa uma variação de navy, portanto a cor foi
  adaptada intencionalmente ao PCP.
- Componentes operacionais com raios de 6–8 px. Dashboards mantêm a exceção da
  referência: KPIs de 16 px e painéis de 20 px.
- Superfícies claras/escuras, bordas discretas e estados de foco/hover consistentes.
- Sidebar de 280 px expandida e 76 px compacta, com logo oficial e marca `K`
  compacta. O rodapé do usuário fica acessível enquanto só a navegação rola.
- Fora dos dashboards, o menu inicia compacto quando não existe preferência;
  hover/foco expandem por cima do conteúdo. Fixar/recolher persiste a escolha.
- Grupos e destinos continuam provenientes das permissões reais do PCP.
- Navegação interna do React atualiza item ativo, `aria-current`, título e
  contexto do shell em CRM/P&D, sem substituir o router nem inventar destinos.
- Busca desktop aberta por botão ou Ctrl/Cmd+K; resultados contêm somente
  módulos autorizados. Escape fecha a busca e devolve o foco ao acionador.
- Menu mobile sobreposto, alvos de navegação de 44 px, estado `aria-expanded`,
  fechamento por Escape, backdrop ou navegação.
- Claro/escuro/automático continuam usando a preferência `kuryos-theme` e a ponte
  existente entre o shell e o React.

## Proteção funcional

As 42 páginas operacionais receberam apenas atributos `data-ui` e
`data-kuryos-operational` aditivos. O teste `test-ui-operational-contracts.mjs`
compara a versão atual com o baseline `4052a55` e exige igualdade byte a byte
após retirar exclusivamente esses atributos: 421 scripts, 2.303 IDs, 24 bindings
inline, todos os campos, labels, opções, estados hidden, valores de tabs, ordem
dos scripts e estilos originais de impressão.

No `auth_check.js`, foram ajustados markup do shell, semântica do botão de menu,
carregamento dos assets e preservação do header operacional de Descarte. Um
defeito encontrado no QA também foi corrigido: quando a leitura do perfil
termina depois do aviso de 12 segundos, o overlay antigo é removido. A decisão
de acesso continua sendo validada; o teste cobre perfil permitido e negado.
Critérios de acesso, home por perfil e funções de produção permanecem iguais.

Os tokens distinguem cores completas usadas pelas páginas legadas dos canais
HSL usados pelo React. Assim, `--card`, `--muted`, `--border` e similares não
invalidam componentes de nenhum dos dois ambientes. O cabeçalho de Material
também respeita o contraste do tema, apesar do estilo inline legado.

O CSS operacional é exclusivo de `@media screen` e opt-in. Calendários, slots,
grades de arraste do PCP e dimensões de documentos preservam sua geometria.
Cabeçalhos, filtros, superfícies, tabelas, forms e modais recebem a identidade.
As telas de referência e do PCP não têm necessariamente os mesmos campos ou
conteúdos; a correspondência é de componentes e identidade, preservando a
informação operacional existente.

## Validação

| Verificação | Resultado |
| --- | --- |
| Contratos das 42 páginas | Aprovado; scripts, campos e IDs preservados |
| Cadastro de itens | Aprovado |
| Apontamento e encerramento | Aprovado, incluindo idempotência e setores |
| Manipulação | Aprovado |
| Rotas de compra e travas de Logística | Aprovado |
| Recuperação da autenticação tardia | Aprovado; perfil negado continua bloqueado; nenhuma escrita |
| Contexto interno do shell | Aprovado em teste de código: 8 rotas; sem mutação repetida nem links não autorizados |
| Auditoria global de navegador | Aprovado: 64 rotas; claro/escuro; zero emojis visíveis |
| CRM/P&D funcional no navegador | Aprovado: 9 rotas e 4 interações |
| Responsividade CRM/P&D | Aprovado: 27 layouts e 6 modais/popovers |
| Drawers CRM/P&D e temas | Aprovado: 8 cenários |
| Modais de Cadastros | Aprovado: 12 cenários; título com contraste 18,54:1 claro e 17,15:1 escuro |
| Dashboards setoriais | Aprovado: 9 setores e mobile; dados reais e indisponibilidade explícita |
| Suíte adicional de identidade/shell | Inconclusiva na rodada final: timeout CDP `Runtime.evaluate`; não registrada como aprovada |
| Sintaxe dos JS de shell e ponte | Aprovado |
| `git diff --check` das alterações | Aprovado |

As suítes de navegador usam a sessão de teste local e abrem diálogos sem salvar
registros. Capturas ficam em `scripts/artifacts/`, ignorado pelo Git por conter
informações operacionais. Os testes não substituem homologação por perfil em
produção. As últimas correções de contexto SPA têm teste de código aprovado;
a confirmação adicional em navegador permanece pendente junto da suíte de shell.

A sessão isolada Chrome/CDP travou durante a repetição final. Ela foi encerrada
sem tocar o navegador pessoal, e sua reinicialização foi bloqueada pelo ambiente.
Não foi possível concluir nessa sessão a repetição adicional de sidebar,
busca/teclado e impressão em ambos os temas. O script reproduzível é
`node scripts/test-kuryos-repo-visual.mjs 9224`, com preview e uma sessão
autenticada de teste disponíveis. Nenhum timeout foi tratado como sucesso.

O teste de propriedade de estoque no worktree isolado passou 18 casos de
cliente/FEFO/MRP e interrompeu ao importar o servidor por ausência de `pdfkit`.
Esse limite de infraestrutura não é uma validação completa do servidor.

## Revisão e recuperação

Commits locais separados para shell, layouts e correções permitem recuperar uma
etapa com `git revert <commit>` após revisão. Não fazer reset destrutivo.
Preview: `node scripts/preview-ui.mjs`, que serve `public/` em loopback usando os
rewrites do `firebase.json`, sem deploy e sem escrita no Firebase. Firebase
Hosting continua sendo a infraestrutura de publicação do projeto.

Esta entrega não publica Hosting, Functions ou regras de banco e não instala
bibliotecas adicionais. A migração React-fonte e novas funções de negócio ficam
fora deste trabalho visual.

## Registro de alterações e pendências

- `bd87ad8`: design system, identidade, shell e dashboards.
- `fcab561`: integração dos layouts operacionais do Frontend 2 (`9b0db51`).
- `ebea897`: recuperação da autenticação e preservação de headers.
- `c3f6b84`: compatibilidade de temas, componentes e contexto CRM/P&D.
- Correções complementares: compatibilidade de tokens, contraste, impressão,
  busca oculta sem `role=dialog`, contexto SPA e versionamento de cache.
- QA e ferramentas: contratos operacionais, recuperação de perfil, contexto
  de rotas, contraste de modais e servidor local sem dependências adicionais.
- Pendente: repetição da suíte adicional de shell em Chrome/CDP estável e
  homologação final por usuários/perfis. A suíte completa de servidor não foi
  validada por este trabalho visual.
- Nenhuma nova métrica, coleção, fórmula de KPI ou biblioteca foi criada.
  Fontes/cálculos/indisponibilidades dos dashboards existentes foram preservados.
- Nenhum push ou deploy das alterações desta etapa.
