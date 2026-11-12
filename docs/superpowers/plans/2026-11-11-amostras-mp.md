# Amostras de MP no Cadastros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba "Amostras de MP" em `cadastros.html` onde o P&D registra amostras pedidas a fornecedores, a logística dá baixa e o P&D homologa ou reprova.

**Architecture:** Toda gravação passa pela callable `amostraMp` (`functions/amostras_mp.js`, padrão de `functions/cobrancas.js`): regras puras de status/permissão + serviço com transação só no nó da amostra. O navegador só lê `amostras_mp/`. A tela é um bloco novo em `cadastros.html` com a lógica pura em `public/shared/amostras-mp.js`. Acesso por módulo novo `amostras_mp` (página `cadastros.html`), com abas filtradas por módulo.

**Tech Stack:** Firebase RTDB + regras (`database.rules.json`, JSON com comentários `//`), Cloud Functions v2 `onCall` servidas pela VPS, HTML/JS sem build em `public/`, testes `node run_*.js`, emulador (`firebase emulators:exec --project demo-amostras`), Chrome via `PLAYWRIGHT_MODULE`.

**Spec:** `docs/superpowers/specs/2026-11-11-amostras-mp-design.md` (ler antes; este plano argumenta a partir dele).

## Global Constraints

- Status: `SOLICITADA`, `RECEBIDA`, `HOMOLOGADA`, `REPROVADA`, `CANCELADA`. Ações: `CRIAR`, `EDITAR`, `CANCELAR`, `RECEBER`, `HOMOLOGAR`, `REPROVAR`.
- Tipos `NOVA` | `CADASTRADA`. Motivos `HOMOLOGAR_FORNECEDOR` | `REPOSICAO` | `AMOSTRA_CLIENTE` | `DESENVOLVIMENTO` (rótulos: "Homologar novo fornecedor", "Reposição", "Amostra para cliente", "Desenvolvimento interno"). Formas `CORREIO` | `TRANSPORTADORA` | `MOTOBOY`. Unidade `g` | `kg`.
- P&D = papel `pd` ou módulo `pd`; Logística = papel `logistica` ou módulo `logistica`; ADM (papel `admin` ou `funcoes.admin`) pode tudo. Perfil desativado/pendente/`tv` recusado.
- Depois de `RECEBIDA`: fornecedor, material, custos, quantidade imutáveis. Parecer obrigatório em `REPROVAR`; motivo obrigatório em `CANCELAR`.
- Atrasada = `SOLICITADA` e `previsaoChegada < hoje` em America/Sao_Paulo; nunca gravado.
- Código `AM-0001` (4 dígitos) pelo contador `config/contadores/amostrasMp` (transação com `(v) => (Number(v) || 0) + 1`, nunca `return;` no null — armadilha do CLAUDE.md).
- Transação só em `amostras_mp/{id}`, nunca na raiz (limite de 16 MB).
- Arquivos novos ≤ 350 linhas. Mensagens de erro e textos de tela em português.
- Constantes duplicadas servidor × cliente são cópia deliberada, conferida por teste de contrato.
- Commits só com os arquivos da tarefa (`git add <arquivos>`, nunca `-A`); fim de mensagem `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Duas pessoas da logística dando baixa na mesma amostra ao mesmo tempo → só uma grava; a outra recebe "Esta amostra já foi recebida" (Task 3, emulador).
2. Duplo clique / nova tentativa de "Criar" com o mesmo `requestId` → um registro e um código só (Task 1).
3. Amostra prevista para hoje às 22h de Brasília (já amanhã em UTC) não aparece como atrasada (Task 4).
4. Material ou fornecedor que não existe (ou foi excluído) no cadastro → criação recusada; lista antiga mostra o nome gravado (Tasks 1 e 5).
5. Logística sem módulo `cadastros` abre `cadastros.html?tab=materiais` pela URL → cai em Amostras de MP, sem ver Materiais (Task 5).

---

### Task 1: Regras e serviço do servidor

**Files:**
- Create: `functions/amostras_mp.js`
- Test: `run_amostras_mp_test.js`

**Interfaces:**
- Produces (CommonJS `module.exports`): `STATUS`, `ACOES`, `TIPOS`, `MOTIVOS`, `FORMAS`, `UNIDADES` (objetos `{CHAVE: "Rótulo"}`); `perfilAmostra(usuario) -> {pd, logistica, admin, ativo}`; `normalizarDados(dados, {materiais, fornecedores}) -> campos` (lança `{code, message}`); `aplicarAcao(atual|null, acao, ator {uid, nome, usuario}, dados, agoraIso, ctx) -> {registro, evento}`; `criarServico({db, agora}) -> {executar(uid, {acao, id, dados, requestId}) -> Promise<{id, codigo, status}>}`.

- [ ] **Step 1: Escrever o teste falhando** — `run_amostras_mp_test.js` no estilo de `run_cobrancas_test.js` (usuários fixos `pd`, `yasmim` com `role:'comercial', modulos:{pd:true}`, `log` papel `logistica`, `adm`, `pcp`, `off` desativado). Asserções:
  - `aplicarAcao(null,'CRIAR', pd, dadosValidosNova)` → `registro.status === 'SOLICITADA'`, `solicitante.uid === 'pd'`, `materialNovo.nome` aparado, sem `material`; tipo `CADASTRADA` com `material.codigo:'MPGR-00127'` → `material.nome` vem de `ctx.materiais` (não do navegador).
  - Recusas `invalid-argument`: tipo/motivo/unidade fora da lista; `quantidade.valor <= 0`; `custoKg < 0`; `previsaoChegada` que não é `AAAA-MM-DD`; NOVA sem nome; CADASTRADA com código inexistente; fornecedor inexistente.
  - Permissão `permission-denied`: `log`/`pcp` em `CRIAR`, `EDITAR`, `HOMOLOGAR`; `pd` em `RECEBER`; `off` em qualquer ação; `adm` pode todas.
  - Transição `failed-precondition` com a mensagem "Esta amostra já foi recebida": `RECEBER` em `RECEBIDA`; `EDITAR` em `RECEBIDA`; `HOMOLOGAR` em `SOLICITADA`; qualquer ação em `HOMOLOGADA`/`REPROVADA`/`CANCELADA` → "Esta amostra já está encerrada".
  - `RECEBER` exige `forma` válida e `data` `AAAA-MM-DD`; grava `recebimento.por.uid === 'log'`.
  - `REPROVAR` sem `parecer` (ou só espaços) → `invalid-argument`; `HOMOLOGAR` sem parecer → ok. `CANCELAR` sem motivo → `invalid-argument`.
  - `EDITAR` em `SOLICITADA` muda `previsaoChegada` e `evento.campos` lista o que mudou.
  - Serviço com banco simulado em memória (objeto com `ref(path)` → `once`, `transaction`, `update`, `set`): `executar('pd', {acao:'CRIAR', requestId:'r1'})` duas vezes → mesmo `id` e `codigo:'AM-0001'`; segunda criação com `r2` → `AM-0002`; cada ação acrescenta uma entrada em `historico` com `acao`, `de`, `para`, `por.uid`, `em`.
- [ ] **Step 2: Rodar e ver falhar** — `node run_amostras_mp_test.js` → FAIL "Cannot find module './functions/amostras_mp.js'".
- [ ] **Step 3: Implementar `functions/amostras_mp.js`** — funções puras primeiro; `criarServico` relê `usuarios/{uid}`, `materiais/{codigo}` e `fornecedores/{key}` do banco; idempotência por `amostras_mp_pedidos/{uid}/{requestId} = id` (lido antes; gravado no mesmo `update` da criação); criação: contador por transação, depois `update` de `amostras_mp/{id}` + `historico/{push}` + pedido; demais ações: `transaction` em `amostras_mp/{id}` aplicando `aplicarAcao` (se `!atual` → `return atual`, e erro `not-found` depois se `snapshot.exists()` falso).
- [ ] **Step 4: Rodar e ver passar** — `node run_amostras_mp_test.js` → todas as linhas `ok` e saída 0.
- [ ] **Step 5: Commit** — `git add functions/amostras_mp.js run_amostras_mp_test.js` · `feat(amostras-mp): regras de status e serviço do servidor`.

### Task 2: Callable `amostraMp`

**Files:**
- Modify: `functions/index.js` (depois do bloco de Cobranças, ~linha 789)
- Modify: `run_render_functions_test.js:153-158`

**Interfaces:**
- Consumes: `criarServico` (Task 1).
- Produces: callable `amostraMp(data: {acao, id?, dados?, requestId}) -> {id, codigo, status}`; erros `HttpsError` com o `code` do serviço.

- [ ] **Step 1: Teste falhando** — em `run_render_functions_test.js`: título "as 47 funções reais são reconhecidas (35 callables, 2 APIs, 6 gatilhos e 4 agendas)" e `assert.equal(server.kindOf(real.amostraMp), 'callable')`.
- [ ] **Step 2: Rodar** — `node run_render_functions_test.js` → FAIL na contagem.
- [ ] **Step 3: Implementar** — `const AmostrasMp = require("./amostras_mp");` e `exports.amostraMp = onCall({timeoutSeconds: 30}, ...)` igual ao de `cobrancaInterna` (sem secrets): sem `request.auth` → `unauthenticated` "Faça login para usar as amostras."; repassa `e.code` como `HttpsError`.
- [ ] **Step 4: Rodar** — `node run_render_functions_test.js` e `node run_amostras_mp_test.js` → OK.
- [ ] **Step 5: Commit** — `git add functions/index.js run_render_functions_test.js` · `feat(amostras-mp): callable amostraMp`.

### Task 3: Regras do banco + emulador

**Files:**
- Modify: `database.rules.json` (nós `amostras_mp`, `amostras_mp_pedidos`, `fornecedores/$fornecedor`, `historico_fornecedores/$key/$entrada`; `config/contadores` já fecha o navegador — conferir)
- Create: `firebase.amostras-test.json` (porta 9077, mesma forma de `firebase.cobrancas-test.json`)
- Create: `run_amostras_mp_emulator_test.js`

**Interfaces:**
- Consumes: `criarServico` (Task 1) com banco do emulador.
- Produces: regras que a tela (Task 5) assume: leitura de `amostras_mp` para P&D, Logística, módulo `cadastros`, `pcp`, `admin`, módulo `amostras_mp`; nenhuma escrita do navegador; `amostras_mp_pedidos` fechado (`.read`/`.write` false); P&D cria `fornecedores/$f` só quando `!data.exists()`; P&D grava `historico_fornecedores/$f/$entrada` só se `fornecedores/$f` não existia (`!root.child('fornecedores').child($key).exists()` ou a mesma condição do nó do fornecedor no `newData`).

- [ ] **Step 1: Teste falhando** — `run_amostras_mp_emulator_test.js` no padrão de `run_cobrancas_emulator_test.js` (`como(uid)`, `negado`, `recusa`), exige `FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9077`. Passos:
  - semeia usuários (pd, log, cad com `modulos.cadastros`, prod `production`), um material e um fornecedor;
  - `pd`, `log`, `cad` leem `amostras_mp`; `prod` é negado;
  - nenhum deles grava `amostras_mp/x/status` (negado);
  - serviço real: `pd` cria, `log` recebe; duas baixas simultâneas (`Promise.allSettled`) → uma `fulfilled`, outra `failed-precondition`;
  - `pd` cria `fornecedores/novo` (update com `fornecedores/novo/razaoSocial` + entrada em `historico_fornecedores/novo/...`) → ok; `pd` muda `fornecedores/existente/razaoSocial` → negado; `cad` muda → ok.
- [ ] **Step 2: Rodar** — `firebase emulators:exec --project demo-amostras --only database --config firebase.amostras-test.json "node run_amostras_mp_emulator_test.js"` → FAIL (leituras negadas / P&D não cria fornecedor).
- [ ] **Step 3: Implementar as regras** — reaproveitar a expressão "perfil ativo" e os testes de papel/módulo já usados em `solicitacoes_cadastro_material` e `cobrancas`; comentário `//` com data e motivo em cada nó novo.
- [ ] **Step 4: Rodar** — o mesmo comando → todos os passos `ok`; e `firebase emulators:exec --project demo-cobrancas --only database --config firebase.cobrancas-test.json "node run_cobrancas_emulator_test.js"` continua OK (regressão de regras próximas).
- [ ] **Step 5: Commit** — `git add database.rules.json firebase.amostras-test.json run_amostras_mp_emulator_test.js` · `feat(amostras-mp): regras do banco (só servidor grava; P&D cria fornecedor)`.

### Task 4: Lógica pura da tela

**Files:**
- Create: `public/shared/amostras-mp.js` (UMD: `module.exports` + `window.AmostrasMp`, como `shared/nome-material-versao.js`)
- Test: `run_amostras_mp_tela_test.js`

**Interfaces:**
- Produces: `AmostrasMp.STATUS|MOTIVOS|FORMAS|TIPOS|UNIDADES` (mesmos objetos da Task 1); `hojeBrasilia(date) -> 'AAAA-MM-DD'`; `atrasada(a, hoje) -> boolean`; `filtrar(lista, {status, tipo, fornecedorKey, motivo, de, ate}) -> lista` (período pela data de `solicitante.em` em Brasília); `aReceber(lista, hoje) -> lista` (`SOLICITADA`, atrasadas primeiro, depois por previsão crescente); `aguardandoHomologacao(lista) -> lista` (`RECEBIDA`, mais antiga primeiro); `papel(usuario) -> {pd, logistica, admin, cadastros}`; `acoesVisiveis(a, papel) -> string[]` (subconjunto de `ACOES`); `abasVisiveis(papel) -> string[]` (nomes de `MAINTAB_ALIASES`); `nomeMaterial(a) -> string`.

- [ ] **Step 1: Teste falhando** — asserções:
  - `hojeBrasilia(new Date('2026-11-12T01:00:00Z')) === '2026-11-11'`; `atrasada({status:'SOLICITADA', previsaoChegada:'2026-11-11'}, '2026-11-11') === false`; `'2026-11-10'` → `true`; status `RECEBIDA` com previsão vencida → `false`.
  - `aReceber([{status:'RECEBIDA',...}, {status:'SOLICITADA', previsaoChegada:'2026-11-20'}, {status:'SOLICITADA', previsaoChegada:'2026-11-05'}], '2026-11-11')` → só as duas `SOLICITADA`, a de 05/11 primeiro.
  - `filtrar` com `{motivo:'REPOSICAO'}`, `{fornecedorKey:'f1'}`, `{de:'2026-11-01', ate:'2026-11-10'}` (pela data de `solicitante.em` em Brasília) e `{}` (devolve tudo) — uma asserção cada.
  - `acoesVisiveis(SOLICITADA, pd) = ['EDITAR','CANCELAR']`; `(SOLICITADA, logistica) = ['RECEBER']`; `(RECEBIDA, pd) = ['HOMOLOGAR','REPROVAR']`; `(RECEBIDA, logistica) = []`; admin = união; encerrada = `[]`.
  - `abasVisiveis({cadastros:true}) ` inclui `'materiais'` e `'amostras'`; `abasVisiveis({pd:true}) = ['amostras','fornecedores']`; `abasVisiveis({logistica:true}) = ['amostras']`.
  - Contrato: `require('./functions/amostras_mp.js').MOTIVOS` deep-equal `AmostrasMp.MOTIVOS` (idem STATUS, FORMAS, TIPOS, UNIDADES).
- [ ] **Step 2: Rodar** — `node run_amostras_mp_tela_test.js` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** — `hojeBrasilia` com `toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'})`.
- [ ] **Step 4: Rodar** — passa.
- [ ] **Step 5: Commit** — `git add public/shared/amostras-mp.js run_amostras_mp_tela_test.js` · `feat(amostras-mp): lógica da tela (atraso, filas, ações por papel)`.

### Task 5: Aba Amostras de MP, acesso e menu

**Files:**
- Modify: `public/auth_check.js` (`KURYOS_MODULOS.amostras_mp = {rotulo:'Amostras de MP', desc:'Amostras de matéria-prima pedidas a fornecedores: previsão, recebimento e homologação', paginas:['cadastros.html']}`; acrescentar `'amostras_mp'` a `MODULOS_POR_PAPEL.pd`, `.logistica`, `.pcp`)
- Modify: `public/shared/navegacao.js` (entrada `{p:'cadastros.html', h:'cadastros.html?tab=amostras', r:'Amostras de MP', i:'flask', ...}` visível com `c.temMod('amostras_mp')`, nos blocos do P&D e da Logística — seguir as entradas com `h:` e `q:` existentes)
- Modify: `public/cadastros.html` (botão `data-maintab="amostras"`, `MAINTAB_ALIASES.amostras`, painel `maintab-amostras`, `<script src="shared/amostras-mp.js">`, bloco IIFE da aba; filtro de abas por `AmostrasMp.abasVisiveis`; aba Fornecedores só com "+ Novo Fornecedor" quando o usuário não tem `cadastros`; atalhos de homologação)
- Modify: `run_navegacao_test.js` (expectativa dos perfis `pd`, `logistica`, `pcp` com o link novo) e o teste de regressão de módulos por papel, se existir (`grep -l MODULOS_POR_PAPEL run_*.js`)
- Test: `run_amostras_mp_ui_test.js` (harness de `run_nome_material_versao_test.js`, que simula `firebase.functions().httpsCallable` gravando no estado simulado)

**Interfaces:**
- Consumes: `AmostrasMp.*` (Task 4); callable `amostraMp` via `firebase.functions().httpsCallable('amostraMp')` com `requestId` = `Date.now().toString(36) + Math.random().toString(36).slice(2)` gerado ao abrir o formulário (repetir o clique reaproveita o mesmo); `openModalFornecedor(null)` (aba Fornecedores, já existe); `openModal(null)` de Materiais + campos `fNome-mat`/`fornecedoresHomologadosStaged` para o atalho "Cadastrar MP"; fila `solicitacoes_cadastro_material/NOME__...` (chave por `chaveSolicitacaoPorNome`, mesma normalização de `filaCadastroMp.js`).

- [ ] **Step 1: Teste falhando** — `run_amostras_mp_ui_test.js` (Chrome), cenários:
  - P&D (`role:'pd'`): `cadastros.html` abre em Amostras; só as abas Amostras de MP e Fornecedores visíveis; "Nova solicitação" tipo NOVA preenche e salva → linha `AM-0001` com status "Solicitada"; link "Fornecedor não está na lista? Cadastrar" abre o modal de fornecedor; fornecedor salvo aparece no select.
  - Logística (`role:'logistica'`): `?tab=materiais` cai em Amostras; "A receber" mostra a amostra com previsão vencida em destaque (classe `atrasada`); "Dar baixa" com forma Motoboy → status "Recebida".
  - P&D: "Aguardando homologação" → Reprovar sem parecer mostra erro e não chama a callable; Homologar → "Homologada" e botão "Cadastrar MP"; com `modulos.cadastros` abre "Novo Material" com nome e fornecedor preenchidos; sem `cadastros` grava a tarefa em `solicitacoes_cadastro_material`.
  - P&D homologa amostra `CADASTRADA` com motivo `HOMOLOGAR_FORNECEDOR`: aparece o link "Abrir o material no Cadastros" só para quem tem `cadastros`; nada muda em `materiais/`.
  - Detalhe da amostra mostra o histórico (Solicitada → Recebida → Homologada, com nomes).
  - Usuário com `cadastros`: todas as abas de antes continuam visíveis + Amostras de MP. Sem erro de JavaScript em nenhum cenário.
- [ ] **Step 2: Rodar** — `PLAYWRIGHT_MODULE=<caminho> node run_amostras_mp_ui_test.js` → FAIL (aba inexistente).
- [ ] **Step 3: Implementar** acesso, menu e aba conforme a spec §4 e §7.
- [ ] **Step 4: Rodar** — UI test passa; `node run_navegacao_test.js` passa; bateria de Cadastros (mesma lista usada em 11/11: `ls run_*.js | grep -iE "cadastr|trava|formula|bom|histor|diff_versao|contador_mat|critico_pd|duplicidade|usado|navegacao"`) sem falha nova.
- [ ] **Step 5: Commit** — `git add public/auth_check.js public/shared/navegacao.js public/cadastros.html run_navegacao_test.js run_amostras_mp_ui_test.js` (+ teste de módulos, se mudou) · `feat(amostras-mp): aba no Cadastros, módulo e menu`.

### Task 6: Documentação, verificação final e publicação do código

**Files:**
- Modify: `public/manual_cadastros.html` (seção Amostras de MP), manual da Logística (uma linha: onde ver e dar baixa), `MELHORIAS_FUTURAS.md` (tela completa de homologação; custo/kg no custo padrão), `AGENT_STATUS.md` (bloco desta sessão), `CLAUDE.md` tabela de módulos (uma linha)

- [ ] **Step 1:** Rodar tudo: `run_amostras_mp_test.js`, `run_amostras_mp_tela_test.js`, `run_render_functions_test.js`, emulador da Task 3, UI da Task 5, bateria de Cadastros, `run_navegacao_test.js`. Esperado: 0 falhas novas (os `*_rules_test` antigos só rodam com emulador próprio).
- [ ] **Step 2:** Revisão independente do diff do ramo (toolkit: não trivial → revisão do diff exato).
- [ ] **Step 3:** Commit da documentação e `git push origin hostinger-deploy`.
- [ ] **Step 4:** Entregar ao Marlos a ordem de publicação: (1) `firebase deploy --only database --project erpkuryos` depois de conferir que as regras no ar = repo antes da mudança; (2) `cd /opt/kuryos/repo && ./scripts/hostinger/deploy.sh <commit>`; (3) conferir `curl` de `shared/amostras-mp.js` no ar.
