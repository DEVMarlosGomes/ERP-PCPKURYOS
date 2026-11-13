# CLAUDE.md — App PCP Kuryos (`producao_firebase_FINAL`)

> **União de dados (01/11/2026):** `scripts/firebase-merge/cli.js` implementa simulação padrão, merge por folha, validação de referências, conflitos, lotes/checkpoint, concorrência, backup e reversão seletiva. O export atual foi aplicado ao `erpkuryos` na execução `merge-7d3744273b64c678` (269.237 campos; gatilhos desativados); a auditoria posterior retornou zero alterações. Os 46 órfãos aparecem para regularização em Cadastros. Detalhes: `AUDITORIA_MERGE_DADOS_20261101.md`.

App de PCP/produção da Kuryos em Firebase (RTDB + Hosting + Functions), projeto
`prod-kuryos`, repo `https://github.com/gcallegaro-kur/PCP-Kuryos.git`, branch `main`.
Kuryos é fabricante *private label* de cosméticos: ~30 clientes-marca, operação de
envase/rotulagem, licenciada pela Anvisa.

Memória completa (histórico, decisões antigas, projetos vizinhos):
`../../MEMORIA_KURYOS.md` — leia a seção relevante antes de re-derivar qualquer diagnóstico.

---

## Como trabalhar aqui

### Coordenação com outros agentes

- Este repositório também é operado pelo Codex. Antes de editar, leia
  `AGENT_STATUS.md`, confira `git status --short` e registre o seu escopo no
  seu próprio bloco. As regras completas estão em `AGENTS.md`.
- Não altere nem faça commit de arquivos que outro agente tenha marcado como
  ativos. Para tarefas simultâneas com sobreposição, use branches/worktrees
  separados e integre somente commits revisados.
- Nunca use `git add -A`: cada commit deve conter exclusivamente seus arquivos
  e sua tarefa. Quem publicar registra o commit no `AGENT_STATUS.md`.

- **Só eu escrevo no repositório.** O usuário não edita código nem documentos —
  palavras dele: *"eu não anoto nada no repo, só vc"*. Quando ele disser "joguei no
  repo de melhorias" ou "deixei registrado", leia como **"considere adiado, e registre
  você"**. Registrar em `MELHORIAS_FUTURAS.md` faz parte da tarefa; basta conferir
  duplicata com `grep` antes de inserir, sem perguntar.
- **Deploy e git andam juntos.** Desde 14/10/2026 o site é a Vercel
  (`https://pcp-kuryos.vercel.app`), que publica sozinha a cada `git push origin main`:
  commit descritivo + push **é** o deploy. Confira depois com `curl` no arquivo mudado.
  O antigo `firebase deploy --only hosting --project prod-kuryos` não é mais o site em
  uso. Regras do banco seguem pela CLI (`--only database --project erpkuryos`). O repo existe para o dev do Kuryos ERP acompanhar o progresso —
  GitHub desatualizado em relação à produção anula o propósito.
- **Enquadramento de consultor, não de revisor de código.** Em conversas de
  roadmap/funcionalidade, lidere pela razão de negócio e pela priorização
  impacto×esforço para uma fabricante de cosméticos por contrato, ancorado nos
  artefatos reais do drive — não em teoria genérica de MES/ERP.
- **Capacidade sempre pelo valor conservador.** Quando a média histórica calculada
  divergir do teto que o usuário relata, use o menor valor em `prodHoraRef` /
  `mediaPorHora`. Apontamentos lançam lote inteiro como se fosse uma hora e inflam a
  média; superestimar capacidade gera prazo que não se cumpre.
- Ele opta consistentemente pela alternativa mais simples/gratuita quando há escolha, e
  tolera sessões longas de depuração iterativa.

## Onde este app se encaixa

O **Kuryos ERP** (`kuryos-deploy.vercel.app`) é a plataforma de longo prazo e absorverá
o fluxo ponta a ponta. Este app nasceu como remédio para tirar o PCP das planilhas.
**Mesmo assim, continue construindo código real, testado e deployado aqui** — confirmado
em 2026-09-01: *"todo o código que estamos produzindo está sendo aproveitado no outro
sistema, principalmente os motores que rodam as regras de negócio"*. Não responda a um
pedido de funcionalidade com "escrevo só a spec"; o formato de spec vale apenas quando o
próprio usuário pedir um documento para entregar aos devs do ERP. Não tenho acesso ao
código do Kuryos ERP — lá só dá para verificar pelo navegador.

## Estado dos módulos (outubro/2026)

| Módulo | Situação |
|---|---|
| WMS Fase 1 (endereçamento, mapa, planta baixa) | em produção desde 2026-09-02 |
| WMS Fase 2 (separação guiada FEFO, `separacao_materiais.html`) | em produção desde 2026-09-03 |
| Qualidade Fase 2 (`qualidade.html`, papel `qualidade`) | no ar; Fases 3-4 bloqueadas por Ordem de Manipulação, anexo de arquivo e Tarefas Pendentes, que não existem |
| Planejamento/apontamento (`PLANO_PLANEJAMENTO_PCP.md`) | em produção: grade, sequência e apontamento; desde 31/10 a ETA usa o ritmo real da OP, atraso empurra toda a fila e adiantamento puxa toda a fila. Zona fixa é informativa nesse reflow; OP iniciada/concluída permanece trava dura; grade de 15 min |
| MRP (aba em `insumos.html`) | motor completo em produção desde 2026-09-13; **parâmetros de planejamento vazios nos 906 materiais** |
| Custos e Resultado (`custos.html`, `placar.html`) | construído e auditado em 26–28/10 (`AUDITORIA_CUSTOS_20261028.md`); LP em 0 SKUs até haver preço, impostos e custo da operação; realizado e placar param na última OP (21/09). Regras `custos/` e `resultado/` publicadas em 28/10. |
| Financeiro (`financeiro.html`) e Controladoria (`controladoria.html`) | construídos em 28/10 (`PROMPT_FINANCEIRO.md` §15, `PROMPT_CONTROLADORIA.md` §15); módulos `financeiro` e `controladoria` marcados pelo ADM; só LEEM os outros módulos (títulos dos recebimentos/NFs/operação; lançamentos do razão de custos/NFs/baixas). Títulos, baixas, lançamentos e fechamento só o servidor grava; nada se apaga (estorno). Base sem NF de saída e sem banco até a operação cadastrar. Relatórios do WebMais (12/11, só leitura) em `shared/financeiro-relatorios.js`, mapa em `docs/financeiro-fase0-lacunas.md` §8; Entrega B (adiantamento, renegociação, cancelamento em lote) e F9 reconstruída (liquidação por filtro, elementos de custo, DFC por elemento) em 12–13/11, mapa em §9 do mesmo doc |
| Menu lateral e Início (reunião 28/10) | no ar desde 30/10: menu montado de um registro único (`public/shared/navegacao.js`, ordem do D-01, identidade do Gustavo); `inicio.html` é a home. Tela nova entra no registro no mesmo commit; `run_navegacao_test.js` compara os links de 39 perfis |
| Reunião 28/10 (`AUDITORIA_REUNIAO_20261028.md`) | concluída em 31/10: MENU-01..04, CRM-01..04, PD-01..06, KO-10..13, BOM-02..04, COT-01..04, SKU-01, OP-01/02, PLAN-01, FEFO-01, FIN-01 e PORT-01..10. Em 01/11 a emissão de OP migrou para transação no servidor e as duas propostas antigas foram confirmadas com SKU. A trava de saldo segue **desligada** até a execução física do Dia D (`PLANO_DIA_D_CUTOVER.md`). |
| Amostras de MP (aba do Cadastros, spec `docs/superpowers/specs/2026-11-11-amostras-mp-design.md`) | construída em 11–12/11 em `hostinger-deploy`: P&D registra a amostra pedida ao fornecedor, logística dá baixa, P&D homologa/reprova. Grava só a callable `amostraMp` (`functions/amostras_mp.js`); módulo `amostras_mp` (padrão de `pd`, `logistica`, `pcp`) abre o Cadastros só nessa aba; P&D cria fornecedor novo (regra só de criação). Publicar regras antes da VPS |
| P&D — Manipulação em lote (`PROMPT_PD_MANIPULACAO_EM_LOTE.md`) | construída, auditada e corrigida em 04–05/11 (spec `docs/superpowers/specs/2026-11-04-pd-manipulacao-lote-design.md`, §13 = auditoria final). Regras publicadas em 05/11; código em `hostinger-deploy` `31a1939`. Ordem, pesagem, conferência e aprovação de crítico só pela callable `manipulacaoLoteServidor`; crítico = `materiais/{k}/criticoPd`, marcado só pelo ADM no Cadastros |
| Estoque | ver "Dia D" abaixo |

**O saldo de estoque ainda não serve para decidir.** Dos 906 materiais cadastrados, só 37
têm registro e 11 estão negativos (pior caso: ET-00012 a −538.784 un). A **saída**
funciona — `baixarEstoqueConsumo` roda a cada apontamento —, a **entrada** nunca
aconteceu, porque só existe via recebimento contra Pedido de Compra. Um **"Dia D"**
operacional (inventário físico completo + endereçamento) vai estabelecer o saldo de
abertura. Até lá: não use saldo como base de compra ou de emissão de OP, e não exiba
saldo ao lado do item na tela de Compras — saldo errado parece confiável e é pior que
saldo nenhum. Pendência operacional, não de código: `estoque_lotes` segue vazio em
produção e ninguém tem o papel `qualidade` ainda.

**O MRP está pronto e cru ao mesmo tempo.** `insumos.html` tem duas abas: a antiga
("Insumos por Pedido", checklist de um pedido) e a nova (**MRP — Necessidade de**
**Materiais**). O motor vive em `public/shared/utils.js` (`calcularMrpMaterial` e
vizinhas, funções puras, 46 asserções em `run_mrp_test.js`): agrega a demanda de todos
os pedidos abertos, faseia por semana, desconta PC em trânsito, aplica lote
mínimo/múltiplo e recua o lead time. Gera exceções COMPRAR / COMPRAR_ATRASADO /
ANTECIPAR / ADIAR / BACKLOG, com balde "em atraso" colapsado na frente (padrão
SAP/Oracle).

Duas restrições que **não são bugs** e precisam ser respeitadas por quem mexer nele:

- **Só 39 dos 84 pedidos abertos têm data**, e ela vem da grade de `programacao`, não
  do pedido. O resto cai no balde BACKLOG de propósito — inventar data produziria um
  plano preciso e falso.
- **Nenhum dos 906 materiais tem lead time / estoque de segurança / lote mínimo /
  múltiplo.** Os campos nascem em `materiais/{key}` e são editáveis no card do MRP.
  Com lead time zero o plano manda comprar tudo para ontem, e a tela avisa isso.
  Preencher uns 20 materiais de maior giro é o próximo passo de valor — é operação,
  não código.

Lição do MRP que vale para qualquer cálculo novo: **o ensaio com dados reais achou dois
defeitos que 46 asserções sintéticas não pegaram** (semanas vencidas espalhadas pela
grade e uma sentinela interna vazando no texto da tela). Rode o motor contra a base
antes de fechar.

## Fonte das telas do CRM e regras do banco

- **As telas CRM/P&D/Kickoff/Cotação/Contratos (`/crm-app`) são React e a fonte vive em
  `crm-frontend/` neste repo** (desde 22/10/2026). Mudou a fonte:
  `cd crm-frontend && npx vitest run && npx vite build --assetsDir static/crm`, depois
  `node scripts/integrar-crm-build.mjs`. O que vai para `public/static/crm` é o
  resultado compilado: nunca edite ali.
- O projeto antigo `../KURYOS/ERPKuryosBeauty-master` (backend Python/Mongo) está
  **abandonado**: não recebe commit nem deploy.
- **Banco e login de PCP e CRM são o projeto Firebase `erpkuryos`** (não `prod-kuryos`).
  As regras se publicam **só** a partir de `database.rules.json` deste repo; a cópia da
  pasta antiga foi desativada porque apagaria nós em produção.

### Identidade e acesso (03/11/2026)

- Correção publicada na VPS em `397b4a3`: SDK compat 10.7.0 perdia `/api` no
  customDomain; `auth_check.js` agora usa URL explícita nas callables. Usuários
  oferece verificar vínculo e regularizar Auth no mesmo UID com confirmação,
  sem fusão automática de identidades ou nova função concedida. Há journal
  prévio/idempotência por requestId e trava servidor; falhas parciais exigem
  conferência, não replay automático. Contadores PC/SC/COT alinhados em 81/39/44
  com backup e releitura. Validade da expedição lê os três nomes históricos e
  bloqueia datas inválidas/vencidas no servidor e navegador. Quatro colisões
  antigas ainda aguardam decisão documental; gatilhos/agendas permanecem
  desligados. Detalhes: `CORRECOES_VIRADA_ACESSOS_20261103.md`.
- Segurança em produção desde `bf1f39d`: API verifica revogação/perfil ativo e limita
  chamadas; administração exige login recente; RTDB exige perfil ativo e validade de
  sessão, restringe CRM ao setor e proíbe escrita/exclusão de auditoria pelo cliente.
  Auditoria comercial passa por callable. Caddy executa UID 1000 e containers têm
  filesystem read-only/limites. Backup diário local ativo, com ensaio de restauração
  RTDB aprovado. Detalhes/pendências: `CORRECOES_SEGURANCA_20261103.md`.
  MFA/Identity Platform, SSH root, destino externo de backup, troca de senha antiga
  e provisionamento/autorização do Storage ainda precisam das etapas descritas lá.
- Domínio principal da VPS Hostinger: `kuryoserp.com.br`; `www` e os endereços
  `kuryoserp.tech`/`www.kuryoserp.tech` redirecionam ao principal. O projeto de
  Auth/RTDB continua `erpkuryos`. Deploy por commit com
  `scripts/hostinger/deploy.sh` na branch `hostinger-deploy`; push sozinho não
  atualiza a VPS. Os dois domínios novos estão autorizados no Firebase Auth.
- O login público não cadastra contas. `public/login.html` oferece entrada e recuperação
  de senha; a criação, edição, funções, módulos, tenant, bloqueio, revogação de sessões e
  exclusão ficam em `public/usuarios.html` para administradores.
- Toda mutação privilegiada passa pela callable `gerenciarUsuario` e pelo Admin SDK
  (`functions/identidade_acesso.js`). Senhas atuais nunca são consultadas. O ADM pode
  definir nova senha (com confirmação recente da própria identidade); ela transita
  somente para o provedor e não entra em journal/auditoria. Perfis sem Auth podem
  preparar login no mesmo UID, preservando acessos; conflitos de e-mail usam o
  cadastro já vinculado, sem fusão automática. O navegador não escreve perfis
  administrativos. Desativar bloqueia também o Firebase Auth; excluir arquiva o perfil
  em `usuarios_removidos`; ações ficam em `auditoria_acessos`.
- Autoexclusão, autodesativação e mudança do próprio acesso são recusadas. A proteção do
  último administrador ocorre em transação no nó `usuarios`, portanto duas ações
  simultâneas não conseguem retirar todos os administradores.
- No projeto `erpkuryos`, cadastro e exclusão pelo cliente estão desativados na
  configuração do Identity Toolkit. Senhas novas exigem 8 caracteres, maiúscula,
  minúscula e número; símbolo é permitido. `forceUpgradeOnSignin=false`: senhas antigas
  continuam entrando até serem redefinidas. A configuração idempotente vive em
  `scripts/configurar-auth-producao.js` e foi aplicada/verificada em 03/11/2026.
- `usuarios/$uid` só pode ser lido pelo próprio usuário, ADM ou RH. O cliente só cria o
  próprio perfil pendente para recuperar logins legados sem perfil; perfis ativos,
  auditoria e arquivo de excluídos são escritos exclusivamente pelo servidor.

- **Status "Em Testes" e "Aguardando Aprovação" do P&D só com liberação do servidor**
  (desde 23/10/2026): a regra de `erp/$tenant/pd_requests/$req/status` exige
  `pd_liberacoes_status/$req`, que só `liberarEtapaPd` (Render) grava depois de conferir os
  100%. Código novo que mude esses status passa por `lib/servidor.js:liberarEtapaPd`.
- **Material novo só nasce com a chave tipo+nome em `materiais_chave`** no mesmo update
  (`shared/duplicidade-material.js:mudancasDoIndice`). Script ou importação que cria
  material direto em `materiais/` é recusado pela regra.
- **Emulador de regras:** rode com `--project demo-<nome>` igual ao `projectId` do teste.
  Sem isso o emulador não aplica `database.rules.json` ao namespace e teste de negação
  "passa" sem testar nada. Java portátil: Temurin 21 JRE (o PATH precisa do caminho em
  formato `/c/...` no Git Bash).

## Armadilhas confirmadas (todas já custaram caro)

- **`firebase database:update /nó` com objetos aninhados APAGA campos.** O RTDB trata
  cada chave do objeto como um *caminho*. Um update `{PRODUTO: {clienteKey: X}}` trocou
  375 produtos inteiros por um objeto de um campo só. Use sempre **caminhos planos**
  (`PRODUTO/campo`). Antes de qualquer comando destrutivo em massa: (a) backup,
  (b) rodar em UM registro, (c) conferir, (d) só então o resto.
- **Testar a unidade não basta quando o defeito está na ligação.** `clienteKey` ficou
  declarado duas vezes no mesmo objeto literal do save — em JS a última vence, e a
  funcionalidade nasceu morta em produção enquanto 16 asserções passavam testando a
  função isolada.
- **Papel novo precisa entrar em cinco pontas:** `pageAccessRules`, navbar,
  `login.html` (senão dá "Perfil desconhecido"), `usuarios.html` (senão é inatribuível)
  e `database.rules.json` (senão dá PERMISSION_DENIED e o módulo fica decorativo).
- **Escrita em nó novo: confira a regra do banco contra os papéis que usam a TELA.**
  `estoque_lotes` tinha `.write` só para `admin|pcp`, mas quem aponta é
  `production`/`rotulagem` — a baixa retornava PERMISSION_DENIED, o `.catch()` engolia,
  e o bug parecia resolvido.
- **`.transaction()` nunca aborta no null.** O SDK chama o callback primeiro com o
  cache local; sem listener no nó ele vem null, e `return;` aborta sem consultar o
  servidor — travou toda Conferência de PA (`019cb52`) e estava latente no Descarte,
  Compras e Histórico (`9f30bbd`), mascarado só porque as telas mantêm listener.
  Use `if (!atual) return atual;`, detecte nó inexistente por `snapshot.exists()` e
  zere variáveis de fechamento a cada passada. `run_transacoes_null_test.js` varre o repo.
- **Transação na raiz do banco morre acima de 16 MB** (09/11/2026). Ela reescreve o banco
  inteiro; com 29,7 MB após o merge de 01/11, o servidor derrubava a conexão: Montar carga
  dava 500 desde a VPS e emitir OP dava 403 "Permissão de emissão revogada." (callback com
  null). Operação multi-nó do servidor usa `functions/transacao_raiz.js` (fila no processo,
  leitura fresca, update só dos caminhos mudados); `run_agenda_expedicao_test.js` recusa
  transação na raiz e `run_transacao_raiz_emulator_test.js` prova o limite no emulador.
- **`.catch()` não protege contra throw síncrono** (cache velho após deploy quebrava
  consumo e perdas) — envolva com `Promise.resolve().then(...)`.
- **Buscar `db.ref` por regex não acha escrita mediada por função** (`ajustarEstoque`,
  `putawayEstoqueLote`). Isso me levou a concluir o oposto do verdadeiro e a afirmação
  errada chegou a entrar em 4 manuais. Confirme sempre na implementação.
- **`horizonte.html` NÃO é código morto** — está fora do menu, mas continua gravando
  `alocacoes_planejamento`, que o motor de reajuste lê. Não apague.
- **`materiais.html` é código morto por construção** — faz `location.replace` para
  `cadastros.html?tab=materiais` na abertura; nada no `<body>` dele é visto. A busca
  facetada real vive na aba Materiais de `cadastros.html`.
- **WMS e Estoque ficam desacoplados de propósito.** "Ajustar Estoque" corrige
  quantidade e nunca exige endereço; a aba "Endereçamento" é puramente aditiva a
  `estoque_lotes` e nunca escreve em `estoque/{key}`. Não acople os dois.
- **Estoque tem dono (2026-09-15).** De quem é o material vem do Pedido de Compra,
  nunca do cadastro nem da doca (`shared/propriedade-estoque.js`, cópia byte a byte
  em `functions/`). `estoque/{m}/saldoAtual` segue sendo o **total físico**; a parte
  de cada cliente fica em `porCliente/{c}` e o geral da Kuryos é total − partes.
  Quem baixa saldo de OP passa o cliente (`clienteKeyConsumidor` em `ajustarEstoque`,
  `{clienteKey}` em `sugerirAlocacaoFefo`/`baixarLotesFefo`); **sem cliente, lote de
  cliente fica de fora** — padrão seguro, não é bug. Todo código que cria lote novo
  a partir de outro copia `propriedade`, `destino` e `loteInterno`. Cliente de
  pedido/OP sai do SKU (`clienteKeyDoSku`): pedido e OP guardam só o nome.
- Separação/transferência só **move** endereço, nunca decrementa saldo — a baixa real
  continua no apontamento.

## Documentos vivos no repo (git-tracked, leia antes de trabalhar no tema)

- `MELHORIAS_FUTURAS.md` — backlog de tudo que foi deliberadamente adiado. Todo item
  adiado entra aqui, com contexto e arquivo/função para retomar.
- `PLANO_PLANEJAMENTO_PCP.md` — roadmap de planejamento/eficiência/apontamento, com
  diagnóstico já confirmado contra o código (não re-derive). Decisões travadas:
  granularidade de 15 min, conclusão de OP 100% manual pelo PCP no início, duas telas de
  planejamento sobre o pipeline `alocacoes_planejamento` existente, changeover por linha,
  ML adiado. Sequência: apontamento de manipulação → popular `dataInicioPlanejada/Fim` →
  travar apontamento na OP programada → paradas na ETA → telas → conclusão gated → etc.
- `PROMPT_CUSTOS_ERP.md` — **a entrega viva do tema Custos.** Spec para o dev construir o
  módulo no Kuryos ERP, onde o custo tem origem nativa que aqui não existe: o P&D aponta
  custo por item ao fechar a amostra, e Compras substitui depois pelo custo da cotação
  (`ESTIMADO_PD` → `COTADO` → `PAGO`, sem apagar histórico). A aba construída aqui foi
  **removida de produção** em `bb245a0`; o motor, os testes e o ensaio ficaram no repo
  como referência de lógica. Se o tema voltar, comece por este arquivo.
- `PLANO_CUSTOS.md` — controladoria: custos, margem e o que **não** construir (2026-09-14,
  nada implementado). Números medidos contra a base, não estimados. Decisões travadas:
  **não construir financeiro transacional** (comprar, integrar por uma fronteira só) e sim
  controladoria; começar pela **conversão**, não pelo material, porque preço de compra
  (2 PCs), preço de venda (0 de 411 itens) e folha (0 colaboradores) estão vazios enquanto
  fórmula/BOM/`prodHoraRef`/OPs são bons; absorção por **horas-padrão**
  (`produzido ÷ prodHoraRef`), **nunca** por duração de OP — medido, dá 123–243% e é tempo
  de calendário; custo de fórmula **por kg**, desacoplado da densidade (só 6 de 377
  produtos a têm); fila de preço por exposição — **83 materiais cobrem 80%**, não 911;
  `SEM_CUSTO` nunca vira zero. **Ocupação média medida: 40%** — ~60% da capacidade paga não
  vira produto, e isso tem que aparecer como linha do custo. Fase 0 urgente: gravar custo
  no lote no recebimento enquanto `estoque_lotes` está vazio.
- `AUDITORIA_INTEGRACAO.md` — os 9 elos entre setores, com evidência no código. 4 foram
  fechados em 2026-09-08.
- `public/manuais.html` — manuais operacionais. Cada passagem que ainda depende de
  conversa leva um selo laranja "manual"; **ao fechar um elo no código, tire a marca do
  manual correspondente**.

## Próximos passos conhecidos (nenhum iniciado)

1. Acesso por papel conforme os 8 blocos do menu (Analytics/Geral/Compras/PCP/Logística/
   Produção/RH/ADM) — o usuário disse que vem como passo próprio, depois da renomeação.
2. WMS Fase 3: inventário rotativo + coletor de código de barras (o app já gera
   EAN13/Code39 e tem `qrcode-lib.js`, mas não lê nada).
3. Fase 1 do plano de planejamento: apontamento de manipulação — hoje a etapa de granel
   tem zero rastreamento, e é a causa raiz do buraco "programei 1000, finalizei 800".
