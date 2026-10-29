# PROMPT — Reunião 28/10/2026: menu do Gustavo + ajustes CRM · P&D · Kickoff · BOM · Compras · PCP · Financeiro

> **Para quem executa:** este arquivo é o prompt completo. Ele roda com **dois agentes** no Claude Code,
> na raiz do repositório `DEVMarlosGomes/ERP-PCPKURYOS` (branch `main`).
> **Agente 1 — Engenheiro de Prompt / Tech Lead** planeja, investiga, escreve os briefs, revisa e aceita.
> **Agente 2 — Dev Fullstack Sênior** implementa, ticket a ticket, com teste.
> O dono do produto é o **Marlos**. Toda decisão marcada `D-xx` é dele.

---

## 0. Como rodar (Marlos)

1. Abra o Claude Code na raiz do repo e cole este arquivo inteiro, ou salve-o como
   `PROMPT_REUNIAO_20261028.md` e diga: *"execute o PROMPT_REUNIAO_20261028.md como Agente 1"*.
2. Antes, exporte as credenciais do site de referência **no seu terminal** (nunca no repo, que é público):
   ```bash
   export REF_KURYOS_URL="https://prod-kuryos.web.app/login.html"
   export REF_KURYOS_USER="<usuário que o Gustavo passou>"
   export REF_KURYOS_PASS="<senha que o Gustavo passou>"
   ```
3. O Agente 1 vai parar em três portões e esperar o seu "ok":
   **Portão A** (decisões D-01…D-11 + spec), **Portão B** (fim de cada fase, com prints),
   **Portão C** (publicar regras do banco / deploy).

---

## 1. Contexto que os dois agentes precisam saber antes de tocar em qualquer coisa

Leia, nesta ordem: `CLAUDE.md`, `AGENTS.md`, o bloco **Em andamento** de `AGENT_STATUS.md`,
`MAPA_DO_SISTEMA.md`, `FLUXOS_DO_SISTEMA.md`, `PLANO_PD_CRM_AJUSTES.md`, `RFC_001_PROJETO_KICKOFF_PARALELO.md`
e `PLANO_PLANEJAMENTO_PCP.md` (este último antes de qualquer ticket de PCP). Não re-derive o que já está lá.

**Stack e deploy**

- PCP: HTML/JS puro em `public/` (Firebase RTDB + Functions + servidor no Render). Menu lateral em
  `public/auth_check.js`.
- CRM / P&D / Kickoff / Cotação / Contratos: React em `crm-frontend/` (Vite + Vitest). A "API" é um
  roteador em memória sobre o Firebase: `crm-frontend/src/lib/firebaseApi.js` e `firebaseCommercial.js`.
  Build: `cd crm-frontend && npx vitest run && npx vite build --assetsDir static/crm`, depois
  `node scripts/integrar-crm-build.mjs`. **Nunca edite `public/static/crm` à mão.**
- Banco e login: projeto Firebase **`erpkuryos`**. Regras só a partir de `database.rules.json` deste repo.
- Deploy: `git push origin main` publica na Vercel. **Push é deploy**: só com o Portão C liberado.

**Armadilhas que já custaram caro e que estes tickets tocam**

- Papel/módulo novo entra em **cinco pontas**: `KURYOS_MODULOS`/`PAGINA_MODULOS` em `auth_check.js`, menu,
  `login.html`, `usuarios.html`, `database.rules.json`.
- `podeAbrirPagina()` (`auth_check.js:370`) **libera para qualquer autenticado** a página que não está em
  `PAGINA_MODULOS`. Link no menu para página sem regra é página aberta para todos.
- Estoque: **o saldo ainda não é confiável** (Dia D não aconteceu). Ver D-03 antes de qualquer bloqueio por saldo.
- RTDB: `update()` com objeto aninhado apaga campos — use caminhos planos. `.transaction()` com `if (!atual) return atual;`.
- Testar a função isolada não basta: teste a ligação (tela → API → banco) no navegador.
- **Regras já escritas e testadas, ainda NÃO publicadas** (ver `AGENT_STATUS.md`, bloco 21/10): `produtos/$sku` com
  `origemCrm.orcamentoId` + `sku_por_orcamento` (COM-07), `pd_requests/$req/liberacao_antecipada`,
  `config/tipos_componente` e o contador de SC do Comercial. Vários pedidos desta reunião dependem delas (Fase 0).

**Relação com o repositório do Gustavo (`gcallegaro-kur/PCP-Kuryos`)**

- Os dois repositórios **não têm histórico git em comum**. Este repo nasceu em 12/10/2026 de uma cópia de pasta
  (a cópia mais próxima no repo do Gustavo é `3deb77d`, de 09/10, e mesmo ela difere em ~103 arquivos).
- Desde então o Gustavo fez ~108 commits. **Portar por funcionalidade, nunca copiar por cima** um arquivo
  que existe nos dois lados (`auth_check.js`, `cadastros.html`, `compras.html`, `database.rules.json`,
  `functions/index.js`, `shared/utils.js` divergiram).
- Este repo tem o que o do Gustavo não tem: CRM/P&D/Kickoff (React), Custos, Placar, Financeiro, Controladoria,
  dashboards executivo/setorial e o design system `shared/kuryos-ui-*.css`. Nada disso pode se perder.

---

## 2. Os dois agentes

### Agente 1 — Engenheiro de Prompt / Tech Lead

Você **não escreve código de produto**. Você transforma cada pedido da reunião em um brief que o Agente 2
consegue executar sem adivinhar, e você aceita ou devolve o que ele entregar.

1. **Classifique o trabalho** (skill `superpowers:brainstorming`): o conjunto é **arquitetural** (muda o fluxo
   CRM → P&D → Kickoff → Cotação → SKU → Pedido → OP → Financeiro). Siga o caminho completo: perguntas →
   decisões D-xx → spec em `docs/superpowers/specs/2026-10-28-reuniao-ajustes-design.md` → aprovação do
   Marlos (Portão A) → plano com `superpowers:writing-plans`.
2. **Fase 0** inteira é sua (seção 5).
3. **Reproduza antes de prescrever.** Para cada ticket marcado *bug*, abra a tela (Playwright local), reproduza,
   e escreva a causa com arquivo:linha. A seção 6 já traz a causa provável medida no código; confirme ou corrija.
   Use `superpowers:systematic-debugging` e `backend-design:debugging-discipline`.
4. **Figma antes de código** nos tickets visuais (MENU-02, KO-11, KO-12, KO-13, BOM-03): monte o frame,
   mostre ao Marlos, só então escreva o brief.
5. **Escreva um brief por ticket** no formato da seção 2.3 e entregue ao Agente 2.
6. **Revise cada entrega** com `superpowers:requesting-code-review`, `backend-design:security-discipline`
   (todo diff), `backend-performance-review:backend-performance-review` (ticket que lê coleção inteira ou roda
   a cada render) e o subagente `backend-design:security-reviewer` em tudo que toca `database.rules.json`,
   `functions/` ou permissão.
7. **Aceite pelo critério, não pela descrição.** Rode o teste do ticket, abra a tela, compare com o critério.
   Use `superpowers:verification-before-completion`: sem evidência, não está pronto.
8. Mantenha `AGENT_STATUS.md` (seu bloco) e registre em `MELHORIAS_FUTURAS.md` tudo que for adiado
   (com `grep` antes, para não duplicar).

### Agente 2 — Dev Fullstack Sênior

1. Trabalhe em **worktree própria** (`superpowers:using-git-worktrees`), branch `reuniao-20261028/<ticket>`.
2. **TDD** (`superpowers:test-driven-development` + `backend-design:testing-with-discernment`): o teste que
   reproduz o pedido nasce vermelho, depois verde. Motor puro → Vitest (`crm-frontend/src/lib/*.test.js`) ou
   `run_*_test.js`; tela → `run_*_ui_test.js` com Playwright e Firebase simulado (mesmo harness dos existentes).
   Regra de banco → emulador com `--project demo-<nome>` igual ao `projectId` do teste.
3. Antes de escrever: `backend-design:think-before-coding` (servidor), `backend-design:data-modeling-discipline`
   (campo/nó novo), `backend-design:idempotency-and-side-effects` (tudo que cria SKU, SC, PC, título, solicitação
   de cadastro), `backend-design:error-handling-as-design` (nenhum `.catch()` que engole), `frontend-design`
   (só para o que for visual, respeitando o design system existente).
4. Commits pequenos e temáticos, **nunca `git add -A`**. Mensagem: `tipo(escopo): o quê` + ID do ticket.
5. Não faça push. Entregue ao Agente 1: diff, testes rodados com saída, prints (claro/escuro, desktop/390 px).
6. Achou algo fora do brief? Pare e devolva ao Agente 1. Não amplie escopo por conta própria.

### 2.3 Formato do brief (Agente 1 → Agente 2)

```
TICKET <ID> — <título>
Pedido (palavras da reunião): "..."
Decisão aplicada: D-xx = ...
Onde: arquivo:linha (confirmado em <data>)
Causa (se bug): ...
Fazer: passos objetivos
Não fazer: ...
Critério de aceite: lista verificável
Testes: nome do arquivo de teste + casos
Riscos / dados reais a conferir: ...
```

### 2.4 Pronto quer dizer

Teste novo vermelho→verde · suíte da área passando (`npx vitest run` e os `run_*_test.js` da área) ·
build do CRM integrado quando a fonte React mudou · tela conferida com Playwright em desktop e 390 px,
claro e escuro, sem erro no console · regra de banco testada no emulador quando tocada · manual
(`public/manual_*.html`) atualizado se o fluxo mudou · `AGENT_STATUS.md` atualizado.

---

## 3. Ferramentas

**Playwright**

- *Site de referência* (`$REF_KURYOS_URL`, login por `$REF_KURYOS_USER`/`$REF_KURYOS_PASS`):
  é a **produção do Gustavo**. Só leitura: navegar, abrir menus, tirar print. **Nunca** clicar em salvar,
  enviar, excluir, aprovar ou confirmar. Nunca gravar a senha em arquivo, log, print ou commit.
  Capture: menu com cada bloco aberto (desktop 1440 e celular 390), tela Início, e o modal "Novo Produto"
  de Cadastros com a lista de categorias. Prints em `scripts/artifacts/` (já ignorado pelo git).
- *Local*: `node scripts/preview-ui.mjs` serve `public/` sem escrever no Firebase; os `run_*_ui_test.js`
  já sabem simular o banco. Use o mesmo padrão.

**Figma (MCP)**

- Antes de qualquer arquivo: `create_session` com o fileKey (ou `create_new_file` e então `create_session`).
- Carregue `/figma-use` antes de `use_figma` e `/figma-generate-design` para levar telas ao Figma.
- Use para: frame do menu lateral (a partir dos prints do Gustavo, com os tokens de `shared/kuryos-ui-tokens.css`),
  Bloco 2/Bloco 3/Bloco Operacional do Kickoff e a vista explodida do BOM. O Figma é o lugar da aprovação
  visual do Marlos; o código segue o design system do repo.

**Skills**

- Do repositório (já instaladas): as citadas em 2.1–2.2 e `frontend-design`.
- Externas, a pedido do Marlos — instalar em `~/.claude/skills/` (nível do usuário, fora do repo):
  ```bash
  git clone --depth 1 https://github.com/pbakaus/impeccable /tmp/impeccable && cp -r /tmp/impeccable/plugin/skills/impeccable ~/.claude/skills/
  git clone --depth 1 https://github.com/emilkowalski/skills /tmp/emil && cp -r /tmp/emil/skills/{emil-design-eng,break-ui,review-animations} ~/.claude/skills/
  git clone --depth 1 https://github.com/leonxlnx/taste-skill /tmp/taste && cp -r /tmp/taste/skills/taste-skill ~/.claude/skills/
  ```
  Uso: `impeccable` (modos *audit*, *harden*, *adapt*, *polish*) no menu e nas telas mexidas; `break-ui` na tabela
  do BOM e na tabela de manipulação do P&D (nome longo, 40 ingredientes, 390 px); `emil-design-eng` para
  revisar estados e microinterações; `taste-skill` só como crítica de dashboards/Início.
  **Elas não autorizam redesenho**: tokens, fontes e componentes continuam os de `shared/kuryos-ui-*.css`
  e `crm-frontend/src/components/ui/`. O que elas sugerirem fora do escopo vai para `MELHORIAS_FUTURAS.md`.

---

## 4. Decisões do Marlos (Portão A) — o Agente 1 pergunta, o padrão vale se ele não responder

| ID | Pergunta | Padrão recomendado |
|---|---|---|
| D-01 | O menu do Gustavo não tem CRM, P&D, Custos, Placar, Financeiro nem Controladoria. Onde ficam? | **Analytics**: + Visão Executiva 360°, Indicadores Setoriais, Custos e Resultado, Placar. **Comercial** com subtítulos *Vendas* (Pedidos e Orçamentos, Gestão Comercial, Devoluções) e *CRM* (CRM 1 Clientes, CRM 2 Projetos, CRM 3 Amostras, Kickoffs, Contratos CGI, Gerenciar cards [admin]). Bloco novo **P&D** logo depois de Comercial. Bloco novo **Financeiro** (Financeiro, Controladoria) entre Cadastros e ADM. |
| D-02 | A tela **Início** do Gustavo vira a home? | Sim: `inicio.html` primeiro em `ORDEM_HOME`; quem não abre nada dela cai na home atual. |
| D-03 | "Bloquear Emitir OP sem insumo em estoque" contradiz a regra do Dia D (saldo não confiável). | Construir o bloqueio já, atrás de uma chave em Ajustes/Config (`config/emitirOp/bloquearSemSaldo`), **desligada** até o Dia D. Ligada: bloqueio duro; só ADM libera com motivo gravado. |
| D-04 | "Módulo 1 do Kickoff" é o **Bloco 0 – Identificação e comercial**? | Sim (é o primeiro bloco da tela e o único que é todo do CRM). |
| D-05 | Bloco 2: "tudo que vai no frasco fica no frasco; tampa segue na tampa; válvula e tampa juntas". | Dois grupos: **Frasco** (frasco/pote/bisnaga, airless/roll-on/ampola, batoque/redutor, lacre de indução, aplicador) e **Tampa e válvula** (tampa, válvula pump, válvula spray, aerossol + atuador, gatilho). Cada linha "destrinchada" com o seletor de tipo e atributos que já existe (`tiposComponente.js`). |
| D-06 | "Explodir o produto como a EPA": é uma **vista explodida em árvore** (produto → primária / secundária / terciária → componente, estilo EAP)? | Sim, alternável com a tabela. |
| D-07 | Especificações: o P&D **puxa** do Cadastros (Fórmulas/BOM/Especificações), não o contrário? | Sim. Botão "Puxar especificações do Cadastros" na Ficha Técnica; escolhe por SKU ou produto de referência; preenche só o vazio; fica editável e guarda a origem. |
| D-08 | MP nova: a solicitação de cadastro passa a nascer **ao salvar o ingrediente** (hoje nasce na aprovação do cliente)? | Sim, com status `PENDENTE_CADASTRO` e marca "amostra em desenvolvimento"; chave fixa por nome normalizado para não duplicar; se a amostra for descartada, a solicitação é cancelada, não apagada. |
| D-09 | Liberação à diretoria logo após a manipulação: sem nenhuma leitura de estabilidade? | Sim. A estabilidade continua correndo depois; o pedido mostra "sem leitura" para a diretoria decidir sabendo disso. |
| D-10 | Desconto do serviço vira **máximo**: a cotação começa em 0 % e o comercial dá até o máximo? | Sim. Acima do máximo, bloqueia; só ADM ultrapassa, com motivo. |
| D-11 | Pedido de compra de cotação de projeto fica bloqueado até o projeto virar pedido. Exceção? | ADM libera com motivo (amostra, urgência). Fora isso, bloqueio duro, também na regra do banco. |

---

## 5. Fase 0 — Preparação (Agente 1)

- **F0-1** Ler os documentos da seção 1. `git status --short`, último commit, bloco Em andamento. Registrar o seu
  escopo em `AGENT_STATUS.md`. Arquivos que outra sessão marcou como ativos não são tocados sem combinar.
- **F0-2** Linha de base: `cd crm-frontend && npx vitest run` e os `run_*_test.js` das áreas da reunião. Anotar
  o que já falha **antes** de mexer.
- **F0-3** **Publicar as 4 regras pendentes** (lista na seção 1), que já têm teste no emulador. Elas destravam
  SKU no orçamento aprovado (SKU-01), liberação antecipada (PD-05) e o catálogo de tipos (KO-11/12).
  Rodar os testes de regra de novo, mostrar o diff `regras no ar × repo` ao Marlos (Portão C), publicar com a CLI
  (`--only database --project erpkuryos`), conferir depois e guardar backup do que estava no ar.
- **F0-4** **Matriz de lacunas do Gustavo**: `git -C <clone do Gustavo> log --since=2026-10-12` e, para cada
  funcionalidade (não cada commit), dizer *já temos / temos diferente / não temos*, com os arquivos. Ponto de
  partida medido — páginas que só existem lá:
  `inicio, painel, backlog, auditoria, ativos, auditoria_5s, checklists_cq, inspecao_total, liberacao_linha,
  pesagens, titularidade, feedback, rh_feedback, rh_temporarios` + manuais `manual_ativos, manual_auditoria,
  manual_auditoria_5s, manual_feedback, manual_temporarios`, e os módulos de `public/shared/` correspondentes
  (`navegacao.js`, `ativos*.js`, `auditoria-5s*.js`, `auditoria-escritas.js`, `eventos-auditoria.js`,
  `checklists*.js`, `inspecao-total-pa.js`, `liberacao-linha*.js`, `pesagens-dia.js`, `titularidade*.js`,
  `temporarios*.js`, `feedback-*.js`, `painel-*.js`, etc.), funções de servidor e testes `run_*`.
- **F0-5** Prints do site de referência (seção 3) e frames no Figma do menu.
- **F0-6** Spec + decisões D-01…D-11 → **Portão A**.

---

## 6. Tickets

Os números de linha foram conferidos em 28/10/2026 no commit `087dfd7`. Reconfirme antes de editar.

### Fase 1 — Menu lateral igual ao do Gustavo (prioridade máxima da reunião)

**MENU-01 — Registro único de telas**
- Pedido: "Reorganizar menu lateral igual ao do Gustavo (repositório git)."
- Hoje: o menu é montado à mão em `public/auth_check.js:840-1072` (blocos Analytics, Cadastros, Comercial,
  Compras, PCP, Logística, Qualidade, Operação, Financeiro, ADM, RH, Ajuda), com telas repetidas em vários blocos.
- Referência: `public/shared/navegacao.js` do Gustavo (`TELAS`, `BLOCOS`, `VISUAL`, `blocos(ctx)`) e o
  render em `auth_check.js` dele (~linhas 700-760). Ordem dos blocos: Analytics · Comercial · Pedidos e Rastreio ·
  PCP · Compras · Armazém · Operação · Qualidade · Expedição · Manutenção · Cadastros · ADM · RH · Ajuda,
  mais os blocos de D-01.
- Fazer: trazer `navegacao.js` (módulo puro, testável no Node), declarar **toda tela deste repo** nele
  (incluindo CRM/P&D/Custos/Financeiro conforme D-01) e trocar a montagem à mão pela leitura do registro.
  Logística vira **Armazém** (subtítulos *Estoque* e *Fluxo*) + **Expedição** (as 3 telas de expedição viram um
  link com `fam`, a própria tela encadeia por `shared/cargas-fluxo.js`).
- Não fazer: registrar página que ainda não existe aqui (ela entra no registro no mesmo commit em que for portada,
  Fase 8). Não mudar quem acessa o quê.
- Aceite: para **cada perfil** existente (admin, pcp, gestor, qualidade, rotulagem, logistica, comercial, pd,
  production, rh, tv e combinações de módulos), o conjunto de links do menu novo é igual ao do antigo, só
  reagrupado — nenhum link some, nenhum aparece que dê "Acesso Negado" ou 404. Nenhum link duplicado.
- Testes: portar `run_navegacao_test.js` (regressão antigo × novo por perfil) e atualizar `run_menu_sanfona_ui_test.js`.

**MENU-02 — Identidade visual do menu (prints do Gustavo)**
- Pedido: o modelo das fotos (bloco escuro, marca KURYOS "Sistema de Produção" em cartão azul-marinho, item
  **Início** no topo, ícone em quadrado colorido por bloco, contador de links à direita, chevron, subtítulos em
  caixa alta (ESTOQUE, FLUXO, PRODUÇÃO, MANIPULAÇÃO, ROTULAGEM), trilho vertical colorido nos itens do bloco
  aberto, item ativo em destaque, rodapé do usuário em cartão).
- Referência: commit `59b0547` do Gustavo ("menu lateral com identidade Kuryos") e `VISUAL` em `navegacao.js`
  (três matizes: azul `--s1`, ouro `--s2`, verde `--s3`; neutro para ADM/Ajuda).
- Fazer: Figma primeiro (Portão visual), depois CSS em `shared/kuryos-ui-layout.css` mapeando `--s1/--s2/--s3`
  para tokens deste repo. Manter o que já funciona aqui: sanfona (`montarSanfona`), recolhido 76 px / aberto
  280 px, gaveta no celular com Escape/backdrop, busca Ctrl/Cmd+K, tema claro/escuro/automático, alvos de 44 px.
- Aceite: print lado a lado (referência × nosso) de cada bloco aberto, desktop e 390 px, claro e escuro;
  contraste AA nos rótulos; `impeccable audit` sem achado alto.

**MENU-03 — Tela Início**
- Portar `inicio.html` (cartões "Precisa de você" de `navegacao.js: CARTOES` + atalhos das áreas da pessoa).
  Só entram cartões cujas fontes existem aqui; os de módulos ainda não portados entram junto com o módulo.
- Aceite: cada perfil vê só cartões de páginas que abre; quem não vê um cartão não gera a leitura dos dados dele
  (`fontesNecessarias`). Porta `run_inicio_ui_test.js`.

**MENU-04 — Ponte com o CRM React**
- O CRM roda dentro do shell (`shared/crm-pd-shell-bridge.js`). Conferir que item ativo, título e `aria-current`
  continuam certos nas rotas `/crm1`, `/crm2`, `/crm3`, `/pd`, `/kickoffs`, `/contratos` com o menu novo.

### Fase 2 — CRM

**CRM-01 — Categorias de interesse = categorias do Cadastros**
- Pedido: "Categorias de interesse puxar as cadastradas no Cadastros" (prints: BAR, BRZ, CAB, DES, HIG, MAQ,
  PEL, PRF, INF, SOL, no formato `NOME (COD) -- exemplos`).
- Hoje: `CRM1Page.js:360-385` lê `crmConstants.categoria_interesse` (`/crm/constants`, lista própria do CRM);
  o Cadastros usa `config/categoriasProduto` (`public/cadastros.html:3729-3836`). Consequência medida: a geração
  de SKU traduz uma lista na outra por regex (`firebaseCommercial.js:1586-1610`, `resolveCategoria`) e **bloqueia o
  SKU** com "[R25] Categoria … não possui código ativo" quando não acha.
- Fazer: CRM 1 (novo cliente, linha ~1154; modal de qualificação, linha ~1353), modal de criar projeto (CRM 1
  ~1599 e CRM 2) e Kickoff Bloco 0 passam a ler `config/categoriasProduto` (só `ativo !== false`), gravando o
  **código**. Mostrar como no Cadastros: nome, código e exemplos. Dado antigo gravado como slug: migrar por script
  com a tabela de `resolveCategoria`, um registro primeiro, backup antes (caminhos planos).
- Aceite: categoria nova criada no Cadastros aparece no CRM sem deploy; SKU de projeto com categoria escolhida no
  CRM nunca cai no bloqueio R25.

**CRM-02 — "Sugerir" do modal de qualificação não funciona** *(bug)*
- Causa provável (medida): o botão **Sugerir** do campo CLI4 (`components/Cli4Field.js:15-26`) espera
  `data.sugestoes`, mas a rota `/crm/clients/suggest-cli4` em `firebaseApi.js:2100-2103` devolve a lista de clientes
  do cadastro mestre (array). Resultado: sempre "Nenhuma sugestão disponível".
- Conferir também se o modal de qualificação abre nos três gatilhos (`CRM1Page.js:468-527`, arrastar para
  "Projeto em discussão", e o erro de criação em ~699).
- Fazer: a rota devolve `{ sugestoes: [...] }` gerada pela mesma regra de `cli4For` (`firebaseCommercial.js:1612`),
  livre entre os códigos existentes (3 a 5 opções). Extrair `cli4For` para função pura compartilhada.
- Aceite: com "Kuryos Beauty" no nome, aparecem sugestões livres; clicar preenche; código já usado nunca aparece.

**CRM-03 — Faixa de preço e volume vêm preenchidos e o digitado vai para a frente** *(bug)*
- Causa (medida): no foco, `seedPriceDisplay`/`seedVolumeDisplay` (`lib/masks.js:43-50`) escrevem "0,00"/"0.000"
  no campo; o cursor fica no fim e o que se digita entra depois do zero. Acontece em `CRM1Page.js:1599-1620`
  (Criar Projetos em Lote) e `CRM2Page.js:596-600, 961-990`.
- Fazer: campo vazio com placeholder; máscara de moeda que preenche da direita para a esquerda (padrão
  pt-BR) ou formatação só no blur. Nunca persistir zero que ninguém digitou.
- Aceite: digitar 1550 no preço resulta em "15,50" (se máscara) ou "1.550,00" no blur — definir com o Marlos e
  cobrir com teste de componente; volume idem.

**CRM-04 — Prazo da amostra só no projeto, propagado e editável**
- Pedido: "Solicitação de prazo da amostra apenas no projeto e auto popular o que for preenchido para os demais
  campos à frente — editável nos outros modais, mas já populado."
- Hoje: pedido em `CRM1Page.js:~1623` (`prazo_desejado_amostra`, criação), de novo em
  `SampleBatchModal.js:198` (projeto) e `:352` (*Prazo de entrega ao cliente \**, por amostra), e no P&D
  (`PDNewRequest.js:302`, `PDPage.js:760`, `PDDetail.js:1501`, campo `deadline`).
- Fazer: obrigatório só na criação do projeto. Nos modais seguintes o campo nasce com o valor do projeto, editável,
  com o selo "do projeto" (padrão KO-02 de origem). Mudou à mão, guarda que foi alterado.
- Aceite: criar projeto com prazo X → abrir amostra em lote → solicitação P&D: todos mostram X sem digitar.

### Fase 3 — P&D

**PD-01 — Barra de rolagem da manipulação (Yasmin)**
- Pedido: "Aumentar barra de rolagem lateral P&D manipulação para facilitar acesso a edição e exclusão dos ingredientes."
- Hoje: `PDDetail.js:2421-2422` — tabela `min-w-[1180px]` dentro de `overflow-x-auto`; editar/excluir ficam na última
  coluna (`:2545-2546`), fora da tela em notebook.
- Fazer: coluna de ações **fixa à direita** (`sticky right-0` com fundo), barra horizontal mais grossa e visível
  também no topo da tabela, e alvo de clique de 32 px nos ícones.
- Aceite: em 1366 × 768 e 390 px, editar/excluir visíveis sem rolar; `break-ui` com 40 ingredientes e nome longo.

**PD-02 — Ingredientes só MPES e MPGR**
- Causa (medida): o P&D pede `/cadastros/materiais` com `{ tipo2: "MP" }` e `/pd/catalog`
  (`PDDetail.js:410-415`), mas as rotas (`firebaseApi.js:2119` e `:2601-2603`) **ignoram o filtro** e devolvem tudo,
  embalagens (EP/ES/ET) incluídas (`masterMaterialCategory`, `:213`).
- Fazer: filtrar por `tipo_material ∈ {MPES, MPGR}` na rota usada pelo P&D (não mudar quem precisa de embalagem,
  como o Kickoff). Item antigo já gravado com embalagem: aparece com aviso, não some.
- Aceite: buscar "frasco" no ingrediente não traz nada; teste de rota com material de cada tipo.

**PD-03 — Checkbox "MP nova" sem redundância e direto ao Cadastros**
- Pedido: "Ao preencher checkbox de MP nova já puxar para o Cadastros; não abrir caixas de texto adicionais."
- Hoje: `PDDetail.js:2735-2745` abre nome por extenso + tipo; edição em `:2457-2461`. A solicitação ao Cadastros só
  nasce na aprovação do cliente (`lib/filaCadastroMp.js`).
- Fazer (D-08): marcar "MP nova" usa o nome já digitado no ingrediente e o tipo pelo contexto (fragrância → MPES,
  senão MPGR, trocável num chip, sem caixa de texto). Ao salvar, grava a solicitação em
  `solicitacoes_cadastro_material/` (idempotente; mesma chave nunca duplica; respeita `materiais_chave` e o aviso
  de duplicidade de `shared/duplicidade-material.js`).
- Aceite: marcar → salvar → a MP aparece na fila do Cadastros; salvar de novo não duplica; MP que já existe com o
  mesmo nome é oferecida para vincular em vez de criar.

**PD-04 — Amostra em lote: "Parâmetro de variação" sem efeito**
- Hoje: `SampleBatchModal.js:337-346` grava `parametro_variacao`, mas o formulário de cada variação
  (`:403-445`) é sempre o de fragrância (% fragrância, referência, custo).
- Fazer: os campos da variação seguem o parâmetro escolhido. Listar os valores reais de
  `sample_parametros_variacao` e definir com o Marlos o formulário de cada um (ex.: fragrância → % e referência;
  cor → pigmento e código da cor; concentração → ativo e %; textura/viscosidade → faixa). "Nenhuma" → uma variação só.
- Aceite: trocar o parâmetro troca os campos; o que foi digitado aparece no card da amostra e no P&D.

**PD-05 — Enviar à diretoria logo após a manipulação**
- Pedido: "Após a manipulação não precisa esperar o teste mínimo de D0h; pode enviar para a diretoria aprovar antes."
- Hoje: `lib/liberacaoAntecipada.js: podeSolicitar` exige status Em Testes **e** leitura D24h.
- Fazer (D-09): permitir o pedido assim que a manipulação estiver registrada, sem leitura; a diretoria vê
  "sem leitura de estabilidade". A regra `pd_requests/$req/liberacao_antecipada` precisa estar publicada (F0-3).
  A trava dos 100 % (`liberarEtapaPd`, servidor) continua valendo.
- Aceite: amostra manipulada sem leitura → botão disponível → ADM aprova no CRM 2 → segue para Aguardando Aprovação.

**PD-06 — Especificações do Cadastros no P&D**
- Pedido: "Especificações — Cadastros — Fórmulas/BOM/Especificações: puxar especificações no P&D."
- Hoje: a Ficha Técnica do P&D (`PDDetail.js:4099-4300`) tem a coluna "Especificação" digitada à mão; o Cadastros
  guarda em `especificacoes/{codigo}__v{n}`.
- Fazer (D-07): botão "Puxar do Cadastros"; preenche só o vazio, guarda a origem e a versão.

### Fase 4 — Kickoff e BOM

**KO-10 — Bloco 0 (Módulo 1) todo populado pelo CRM**
- Hoje: `firebaseCommercial.js: buildQuestionario` (~1114) + `lib/kickoffAutopreenchimento.js` preenchem parte do
  Bloco 0 (`KickoffCompositionQuestionnaire.js:155-171`).
- Fazer (D-04): todo campo do Bloco 0 que existe no CRM vem do CRM: cliente, nome do produto, categoria (CRM-01),
  forma física, volume, nº de SKUs/variações e o que varia (das amostras), unidades por display e caixa master,
  registro ANVISA, detentor, RT, modelo de serviço e serviços. Mantém a regra KO-02: só preenche vazio, selo de
  origem, sobrescrever exige motivo, bloco validado/congelado não muda.
- Aceite: Kickoff de projeto completo no CRM abre com o Bloco 0 sem pendência.

**KO-11 — Bloco 2: frasco e tampa/válvula**
- Hoje: `BLOCO2_COMPONENTS` (`KickoffCompositionQuestionnaire.js:13-24`), lista plana de 10 linhas.
- Fazer (D-05): dois grupos com subtítulo, tampa e válvulas juntas; cada linha com o seletor de tipo/atributos de
  `tiposComponente.js`. Dados antigos: mesmas `id` de linha, só muda o agrupamento (sem migração).
- Aceite: Kickoff antigo abre igual em conteúdo; BOM gerado não muda para dado antigo (`kickoffBom.test.js`).

**KO-12 — Bloco 3: rótulo, gravação e pendência obrigatória**
- Pedido: "Caso não seja rotulado, aparecer questão se vai ser gravado. Rótulo com opções iguais ao cartucho.
  Quando aplicável e não definido, gerar pendência para tornar obrigatório o preenchimento."
- Fazer: (a) Rótulo = Não aplicável → pergunta "Vai ser gravado? (silk, hot stamping, impressão direta)" com
  sim/não e, se sim, tipo de gravação; (b) a linha Rótulo oferece o mesmo seletor de tipo e atributos da linha
  Cartucho (`tiposComponente.js:88-98`) — descobrir por que hoje não aparece; (c) em `lib/kickoffPendencias.js`,
  linha com Aplicável = Sim e Definido ≠ Sim vira **pendência**, que impede o bloco de ficar "pronto" (vale para os
  blocos 2, 3 e 4).
- Aceite: testes em `kickoffPendencias.test.js` para os três casos; aprovação do Kickoff fica travada com pendência.

**KO-13 — Bloco Operacional (novo, bloco único)**
- Pedido: "Adicionar bloco único operacional: quais equipamentos, pessoas necessárias na linha de produção,
  funções, produção por minuto, unidades por hora."
- Fazer: `bloco6` com dono `eng_produto` (D-1 do RFC-001): equipamentos (lista; se o módulo Ativos for portado na
  Fase 8, escolher do cadastro de ativos, senão texto), pessoas por função (função + quantidade), produção por
  minuto e unidades por hora (uma calcula a outra). Entra em `OBRIGATORIOS`, `DONO_DO_BLOCO`, assinatura de bloco.
  Ao aprovar o Kickoff, unidades/hora alimenta `produtos/{sku}/prodHoraRef` **só se estiver vazio** (regra do
  CLAUDE.md: capacidade pelo valor conservador; nunca sobrescreve a referência do PCP).
- Aceite: bloco aparece, tem pendência, valida; não vai para o PDF (BOM-02).

**BOM-02 — Ficha de manipulação aprovada no BOM, fora do PDF; equipamentos fora do PDF**
- Hoje: aba BOM em `KickoffPage.js:318-400` mostra BOM de embalagens e ficha de manipulação separadas; o export é
  CSV (`:196`, rota `/kickoff/{id}/bom/export`, `firebaseCommercial.js:1451`).
- Fazer: a ficha de manipulação **aprovada pelo cliente** aparece na aba BOM (somente leitura, com a versão da
  fórmula); criar **Exportar PDF** do BOM (documento HTML para imprimir, como `fichaTecnica.js`/`contratoHtml`) que
  **não inclui** a ficha de manipulação nem o Bloco Operacional/equipamentos. CSV continua.
- Aceite: PDF sem a seção de manipulação e sem equipamentos; tela com as duas.

**BOM-03 — Quebra de linha e vista explodida**
- Hoje: tabela `min-w-[900px]` (`KickoffPage.js:336`).
- Fazer: texto quebra em vez de forçar rolagem (descrição/especificação com `break-words`, colunas numéricas
  estreitas); em 390 px vira lista de cartões. Vista explodida (D-06): árvore Produto → Primária / Secundária /
  Terciária → componente (tipo, especificação, quantidade por unidade, total, fornecedor), alternável com a tabela.
- Aceite: `break-ui` sem estouro; print desktop e celular.

**BOM-04 — Paletização fora do BOM**
- Causa: `paletizacao` é linha do Bloco 4 (`KickoffCompositionQuestionnaire.js:39`) e `linhasDeEmbalagem`
  (`lib/kickoffBom.js:32-66`) a inclui quando aplicável.
- Fazer: excluir `paletizacao` do BOM (e, portanto, da cotação); a informação continua no Kickoff como logística.
- Aceite: teste em `kickoffBom.test.js`.

### Fase 5 — Cotação, orçamento, SKU e Compras

**COT-01 — Desconto do serviço é o máximo**
- Hoje: Cadastros › Serviços chama de "desconto padrão" (`public/cadastros.html:1186, 1206, 1247`), e a cotação já
  nasce com ele (`crm-frontend/src/lib/cotacao.js:76, 108, 162`).
- Fazer (D-10): rótulo "Desconto máximo (%)"; linha da cotação nasce com 0 %; validar `desconto_pct ≤ máximo` no
  motor e no servidor/regra; acima, só ADM com motivo. Cotação já enviada não muda.
- Aceite: testes em `cotacao.test.js` (0 %, no limite, acima, ADM).

**COT-02 — Insumos de fabricação vêm todos do BOM, mesmo sem fornecedor**
- Pedido: "Puxar automático do BOM tudo que foi definido; mesmo sem fornecedor, puxar as características do insumo."
- Hoje: `lib/cotacaoKickoff.js: linhasDaCotacao` monta da `insumosDoKickoff`; conferir o que fica "fora"
  em `itensParaCompras` (usado por `abrirSolicitacaoCompra`, `firebaseCommercial.js:602`).
- Fazer: toda linha definida no Kickoff entra na cotação e na SC; sem fornecedor, vai com a especificação
  (`especificacaoDasCaracteristicas`) e "fornecedor a definir".
- Aceite: Kickoff com componente sem fornecedor gera linha com especificação completa na cotação e na SC.

**COT-03 — Cotação finalizada volta ao projeto; PC bloqueado até virar pedido**
- Hoje: o preço do Compras só volta quando alguém abre a cotação (`trazerPrecosDoCompras`, `:623`, puxa na leitura);
  o PC sai de `compras.html: criarPedidoCotacaoPorFornecedor` (~4523), `gerarPedidosDeCotacaoPorItem` (~4580) e
  `gerarPedidoDeCotacao` (~4636) sem olhar a origem.
- Fazer: ao finalizar o processo de cotação de origem `CRM_COTACAO`, a cotação do projeto passa a "precificada" e o
  projeto mostra o aviso. Gerar PC de processo com essa origem fica bloqueado enquanto o projeto não estiver em
  pedido (`pedido_aprovado` com pedido liberado ao PCP); exceção D-11. Bloqueio na tela **e** na regra do banco /
  servidor (a tela sozinha não protege).
- Aceite: tentativa de PC antes do pedido → recusada na tela e no emulador; depois do pedido → passa.

**COT-04 — Orçamento sugerido pela cotação (orçamento completo)**
- Fazer: ao abrir o orçamento do projeto, insumos e serviços vêm com os valores da cotação precificada
  (`sugerirPrecos`, `:534`; `upsertProposta`, `:658`), editáveis, com a origem de cada valor. Item "SEM PREÇO"
  continua bloqueando o envio.
- Aceite: cotação precificada → orçamento abre preenchido, com total.

**SKU-01 — SKU nasce no orçamento aprovado, sem esperar o CGI; CRM 2 segue Negociação → Pedido fechado**
- Hoje: `decidirOrcamento` (`firebaseCommercial.js:1923-2005`) já chama `generateSkusForProject` com
  `origem_contratual_status: "aguardando_cgi"` (COM-07). Causa provável de "não aparece": a regra
  `produtos/$sku … origemCrm.orcamentoId` **não foi publicada** (F0-3) e a categoria cai no R25 (CRM-01).
  Verificar com dados reais (`crm_propostas/*/skus_gerados` dos projetos aprovados).
- Fazer: com F0-3 e CRM-01 feitos, confirmar a criação; CGI assinado antes (KO-09) não é exigido de novo.
  Ajustar o espelho do funil: orçamento enviado → cliente em **Negociação**; aprovado → **Pedido fechado**
  (`mirrorClientStage`), sem pular etapa.
- Aceite: orçamento aprovado → SKU no Cadastros na hora (com `aguardando_cgi`) e pedido em rascunho; cliente passa
  por Negociação e Pedido fechado no CRM.

### Fase 6 — PCP

**OP-01 — Emitir OP bloqueia sem insumo em estoque** (D-03)
- Hoje: `public/emitir_op.html:193` e `:965-982` dizem "o estoque é referência visual e não bloqueia".
- Fazer: com a chave ligada, `emitirOP()` recusa quando algum item com controle de estoque
  (`materialSemControleEstoque` fica fora) tem saldo do dono certo (`porCliente`, `clienteKeyDoSku`) menor que o
  consumo; mensagem lista item, necessário e saldo. ADM libera com motivo gravado na OP. Chave desligada = como hoje.
- Aceite: teste de tela com chave ligada/desligada e com material de cliente.

**OP-02 — Substituir insumo mostra o estoque do substituto**
- Hoje: modal "Substituir material" (`emitir_op.html:255-300`, comparação ~967).
- Fazer: cada opção do modal mostra o saldo (e unidade) daquele item, pelo mesmo `saldoEstoqueDoMaterial`, com o
  aviso de que o saldo ainda não é confiável enquanto a chave do D-03 estiver desligada.
- Aceite: print do modal com saldo por opção.

**PLAN-01 — Planejamento: antecipou puxa, atrasou empurra**
- Hoje: reflow só no arraste (`planejamento.html: reflowAposArrasto`, ~1691) e reajuste por saldo
  (`dispararReajusteLinhasComSaldo`, ~1065).
- Fazer: quando a OP termina antes do previsto, as seguintes da mesma linha **puxam** para a frente; quando atrasa,
  as programadas **empurram**. Respeitar o que já está travado (OP emitida/vinculada, zona fixa de congelamento,
  fim de expediente), as decisões do `PLANO_PLANEJAMENTO_PCP.md` (granularidade 15 min, changeover por linha) e
  `horizonte.html` / `alocacoes_planejamento` (não apagar). Antes de gravar, mostrar a simulação ("N blocos serão
  movidos") como no arraste.
- Aceite: motor puro com testes (antecipa, atrasa, bloco travado no meio, virada de dia) + ensaio com a base real
  antes de ligar (lição do MRP).

**FEFO-01 — Lote de embalagem segue FEFO na manipulação e na operação**
- Hoje: a manipulação indica o lote de MP pelo FEFO (`manipulacao.html:721-745`, `sugerirAlocacaoFefo`); a baixa de
  produção usa `baixarLotesFefo` (`form.html:3083`). Conferir separação (`separacao_materiais.html`) e apontamento
  para **embalagens** (EP/ES/ET).
- Fazer: mesma regra para embalagem: lote indicado pelo primeiro a vencer; usar outro exige motivo (padrão
  "fora do FEFO" da manipulação); passa sempre o `clienteKey` (lote de cliente).
- Aceite: dois lotes da mesma embalagem com validades diferentes → indicado o que vence primeiro.

### Fase 7 — Financeiro

**FIN-01 — Parcelas num lançamento (a pagar e a receber)**
- Pedido: "Contar as parcelas em um lançamento. Ex.: 2 vezes 30-60, lançar as parcelas tanto em receber como a pagar."
- Hoje: o título manual (`shared/financeiro-tela.js:260-268`) aceita vencimento **ou** condição "30/60", e as
  parcelas são derivadas na leitura (`shared/financeiro.js: lerCondicao` ~61, `parcelas` ~95). Decisão travada no
  `PROMPT_FINANCEIRO.md` §15: **um título com parcelas derivadas**, não um título por parcela — manter.
- Fazer: no formulário, "Nº de parcelas" + "intervalo/primeiro vencimento" que monta a condição (2× → 30/60), aceitar
  também a escrita "2x 30/60"; **prévia** das parcelas (n/de, vencimento, valor; a última absorve o centavo) antes de
  lançar; nas listas A pagar/A receber, coluna "Parcelas" (ex.: 1/2 paga). Cópia idêntica em `functions/`.
- Aceite: testes em `run_financeiro_test.js` (2×30/60, 3× sem divisão exata, à vista); mês fechado recusa como hoje.

### Fase 8 — Trazer o que só existe no repositório do Gustavo

Um ticket por funcionalidade da matriz F0-4, nesta ordem (valor para a operação primeiro). Cada um entra com:
página + `shared/` + função de servidor + regra de banco + módulo nas cinco pontas + registro em `navegacao.js` +
manual + testes `run_*` do Gustavo adaptados. Nada sobrescreve arquivo divergente.

1. **PORT-01** Painel de Controle (`painel.html`, gargalos e movimentos) — Analytics.
2. **PORT-02** Pesagens (`pesagens.html`, `pesagens-dia.js`) — PCP/Operação.
3. **PORT-03** Inspeção Total de PA e Liberação de linha (`inspecao_total.html`, `liberacao_linha.html`,
   checklists `checklists_cq.html`) — Qualidade.
4. **PORT-04** Titularidade do Estoque (`titularidade.html` + Cloud Function) — Armazém.
5. **PORT-05** Auditoria (`auditoria.html`, `auditoria-escritas.js`, `eventos-auditoria.js`) — ADM.
6. **PORT-06** Ativos (`ativos.html`) — Manutenção (alimenta KO-13).
7. **PORT-07** Auditoria 5S — Qualidade.
8. **PORT-08** RH: Temporários, Feedback da Semana, Feedback e Clima.
9. **PORT-09** Roadmap do sistema (`backlog.html`) — ADM.
10. **PORT-10** Melhorias pequenas dos ~108 commits que a matriz marcar como "temos diferente" (ex.: RNC por
    concessão, desmembrar palete, cabeçalho de tabela fixo, lista suspensa única): uma decisão do Marlos por item.

---

## 7. Regras transversais (todo ticket)

- **Segurança** (`security-discipline`): toda trava importante existe no servidor ou na regra do banco, não só na
  tela (PC bloqueado, desconto máximo, OP sem saldo, SKU). Nada de dado sensível em log. Repo é público: nada de
  credencial, `.env`, print com dado de cliente ou base exportada no commit.
- **Idempotência**: SKU, SC, PC, solicitação de cadastro e título com chave fixa — repetir o clique não duplica.
- **Erros**: mensagem que diz o que falta e onde corrigir; nenhum `catch` silencioso.
- **Desempenho**: tela não lê a coleção inteira a cada render; o que lê `materiais`/`produtos`/`ops` inteiros
  memoriza. Rodar `backend-performance-review` nos tickets PD-02, COT-03, PLAN-01 e MENU-03.
- **Mobile e acessibilidade**: 390 px sem rolagem horizontal da página; alvos de 44 px no menu; foco visível.
- **Dados reais**: todo motor novo (PLAN-01, FIN-01, SKU-01, CRM-01) roda um ensaio contra a base antes de fechar.
- **Migração de dado**: backup, um registro, conferir, depois o resto; sempre caminhos planos.

---

## 8. Entrega final (Agente 1 → Marlos)

Um relatório curto em `AUDITORIA_REUNIAO_20261028.md` com: tabela ticket × status × commit × teste × print;
decisões D-xx aplicadas; regras publicadas (antes/depois); o que foi para `MELHORIAS_FUTURAS.md`; e o que depende
de operação, não de código (Dia D para ligar o D-03, preencher `prodHoraRef`, cadastro de categorias).
Só então pedir o **Portão C** para o push final.
