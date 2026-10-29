# Spec — Reunião 28/10/2026: menu do Gustavo + ajustes CRM · P&D · Kickoff · BOM · Compras · PCP · Financeiro

> Escrita pelo Agente 1 (tech lead) na Fase 0 de `PROMPT_REUNIAO_20261028.md`. Serve para o **Portão A**:
> nada de código de produto antes do "ok" do Marlos nas decisões da seção 3.

## 1. O que a Fase 0 mediu (28/10/2026, commit `087dfd7`)

| Item | Achado |
|---|---|
| F0-1 Estado do repo | Repo `DEVMarlosGomes/ERP-PCPKURYOS`, branch `main`. Há alterações não commitadas de **outra sessão** em `auth_check.js` (linha da versão do shell), `cadastros.html`, `dashboard_*.html`, `executive-dashboard.js`, `kuryos-enterprise-shell.js`, `sector-dashboard.js`. MENU-01/02 mexem em `auth_check.js` e no shell: **é preciso combinar com essa sessão antes** (ou trabalhar em worktree e integrar). |
| F0-2 Linha de base | Ver seção 6 (testes que já falham antes de mexer). |
| F0-3 Regras "pendentes" | **Já estão no ar.** `produtos/$sku…origemCrm.orcamentoId` + `sku_por_orcamento`, `pd_requests/$req/liberacao_antecipada`, `config/tipos_componente` e o contador de SC estão em `database.rules.json` e no backup das regras no ar **anterior** às publicações de hoje. Nada a publicar. Consequência: a causa provável do **SKU-01** no prompt ("regra não publicada") está descartada; o ticket precisa de nova investigação. |
| Referência (site do Gustavo) | Menu lido do DOM em `prod-kuryos.web.app` (só leitura): mesmas classes do nosso (`kt-sidebar`, `kt-nav-cap`, `kt-nav-link`, `kt-nav-sub`), 14 blocos na ordem Analytics · Comercial · Pedidos e Rastreio · PCP · Compras · Armazém (Estoque/Fluxo) · Operação (Produção/Manipulação/Rotulagem) · Qualidade · Expedição · Manutenção · Cadastros · ADM · RH · Ajuda, item **Início** no topo. Prints em `scripts/artifacts/ref-gustavo/` (fora do git). |
| Categorias | `config/categoriasProduto` do Gustavo e o **nosso** (`erpkuryos`) são iguais: 15 categorias, **10 ativas** (HIG, CAB, PEL, PRF, DES, SOL, BRZ, MAQ, BAR, INF) — exatamente as das fotos. O CRM hoje usa uma lista fixa no código, sem relação com o Cadastros: `crm-frontend/src/lib/firebaseApi.js:42` (`categoria_interesse` com 4 grupos: perfumaria, corporal, capilar, facial). |
| Identidade visual | Nosso `public/shared/theme.css:21-23` já tem as três matizes do Gustavo (`--s1` azul `#2e4fc0`, `--s2` ouro `#c9910a`, `--s3` verde `#12967d`, com versões de tema escuro). MENU-02 é mapeamento, não paleta nova. |
| Figma | Frame do menu proposto (claro e escuro) em <https://www.figma.com/design/50S5daaTQrDleQLrT0jiwx>. Fonte no Figma: Inter (a SF Pro do sistema não existe no Figma). |
| Matriz de lacunas (F0-4) | Seção 5. |

## 2. Correções ao `PROMPT_REUNIAO_20261028.md`

1. **F0-3 não se aplica:** as 4 regras estão publicadas (ver acima).
2. **SKU-01:** a causa "regra não publicada" está descartada; investigar com os dados reais (`crm_propostas/*/skus_gerados` e a categoria do projeto contra o R25) antes do brief.
3. O frame do menu e os prints foram feitos com o padrão D-01; se o Marlos mudar D-01, o frame muda antes do código.

## 3. Decisões para o Portão A

Os padrões do prompt continuam como recomendação. A coluna "Observação do Agente 1" traz o que a Fase 0 acrescentou.

| ID | Pergunta | Padrão recomendado | Observação do Agente 1 |
|---|---|---|---|
| D-01 | Onde ficam CRM, P&D, Custos, Placar, Financeiro e Controladoria no menu do Gustavo | Analytics + Visão 360°, Indicadores Setoriais, Custos e Resultado, Placar; Comercial com subtítulos *Vendas* e *CRM*; bloco P&D depois de Comercial; bloco Financeiro (Financeiro, Controladoria) entre Cadastros e ADM | Montado assim no Figma. Telas que só existem no Gustavo (Painel de Controle, Pesagens, Ativos…) entram no registro só quando forem portadas (Fase 8). |
| D-02 | Início vira a home | Sim, primeiro em `ORDEM_HOME` | Depende de portar `inicio.html` + cartões (MENU-03). |
| D-03 | Bloqueio de Emitir OP sem saldo | Chave em Ajustes, **desligada** até o Dia D | Mantém a regra do CLAUDE.md (saldo não confiável). |
| D-04 | "Módulo 1" do Kickoff = Bloco 0 | Sim | — |
| D-05 | Bloco 2: Frasco × Tampa e válvula | Dois grupos | — |
| D-06 | "Explodir como a EPA" = vista em árvore | Sim, alternável com a tabela | — |
| D-07 | P&D puxa especificações do Cadastros | Sim, preenche só o vazio, guarda origem/versão | — |
| D-08 | Solicitação de MP nova nasce ao salvar o ingrediente | Sim, `PENDENTE_CADASTRO`, chave por nome normalizado | — |
| D-09 | Diretoria aprova logo após a manipulação, sem leitura | Sim, com selo "sem leitura" | — |
| D-10 | Desconto do serviço vira máximo | Sim; cotação nasce com 0 %; acima só ADM com motivo | — |
| D-11 | PC de cotação de projeto bloqueado até virar pedido | Sim; ADM libera com motivo | Bloqueio também no servidor/regra. |

**Decisão nova D-12 (do Agente 1):** coordenação com a sessão que tem `auth_check.js` e o shell abertos. Padrão: o Agente 2 trabalha MENU-01/02 em worktree própria e o Agente 1 integra só depois de a outra sessão commitar (ou o Marlos autorizar incluir aquela linha).

**Decisão nova D-13 (CRM-03, máscara de moeda):** digitar 1550 vira "15,50" (máscara que preenche da direita, padrão de banco) **ou** "1.550,00" ao sair do campo. Padrão recomendado: máscara da direita (a mais usada no Brasil e a que não deixa digitar errado).

### Bugs confirmados no código (o brief de cada um parte daqui)

| Ticket | Causa confirmada |
|---|---|
| CRM-01 | O CRM lê uma lista fixa (`firebaseApi.js:42`, 4 grupos) em vez de `config/categoriasProduto` (15 categorias, 10 ativas, iguais no nosso banco e no do Gustavo). |
| CRM-02 | `/crm/clients/suggest-cli4` (`firebaseApi.js:2100-2102`) devolve um array de clientes; `Cli4Field.js:19` lê `data.sugestoes` → sempre vazio. O `catch {}` da linha 20 engole qualquer erro. |
| CRM-03 | `seedPriceDisplay`/`seedVolumeDisplay` (`lib/masks.js:43-50`) semeiam "0,00"/"0.000" no foco; o cursor fica no fim e o digitado entra depois do zero. |
| PD-02 | `/cadastros/materiais` (`firebaseApi.js:2119`) devolve `integratedMaterials` inteiro e ignora o `tipo2: "MP"` que o P&D envia; embalagens EP/ES/ET aparecem como ingrediente. |
| PD-04 | As constantes do CRM (`firebaseApi.js:63`) têm `sample_tipos` mas **não** `sample_parametros_variacao`: o campo "Parâmetro de variação" (`SampleBatchModal.js:49,344`) só oferece "Nenhuma", e o formulário de cada variação é sempre o de fragrância. O Kickoff já reconhece fragrância, cor, volume e versão (`kickoffAutopreenchimento.js:83`). Ver D-14. |
| SKU-01 | A geração **funciona** desde `505e0b0` (23/10): a proposta aprovada hoje às 23:18 gerou `CAB-GUST-0001`, que está no Cadastros (ativo, cliente e categoria). As aprovadas **antes** do código (17/10 e 21/10) têm SKU pela assinatura do CGI: `PRF-JOHN-0001` e `PRF-TEST-0001` (corrigido em 29/10, ver 3.1). Riscos para as próximas: categorias de projeto gravadas como texto livre ("iluminador", "contorno_olhos", "fixador") não casam com o tradutor `CATEGORIA_PCP` (`firebaseCommercial.js:1587`) e cairiam no bloqueio R25. Ticket vira: (a) CRM-01 resolve a categoria na origem; (b) ~~gerar o SKU das aprovações anteriores~~ — já existem (3.1); (c) o espelho do funil Negociação → Pedido fechado. |

**Decisão nova D-14 (PD-04, campos por parâmetro de variação):** padrão recomendado, alinhado ao que o Kickoff já entende —
fragrância → % de fragrância, referência, custo; cor → pigmento e código da cor; volume → volume e unidade;
versão → nome da versão e o que muda; concentração → ativo e %; nenhuma → uma variação só.

## 3.1 Portão A — aprovado em 29/10/2026

O Marlos respondeu "ok prossiga": **D-01…D-16 valem pelo padrão recomendado.** Acrescentou:
- **D-15 = (a), sem dados:** "não traremos dados de lá ainda; vamos seguir nas funcionalidades". Porta-se só código; nada é lido nem importado do `prod-kuryos`.
- **SKU-01 (b) autorizado:** "pode fazer as aprovações anteriores" — gerar o SKU das propostas aprovadas antes de `505e0b0` (backup, um registro, conferir, depois o resto).
  - **Conferido contra a base em 29/10: não há o que gerar.** As duas aprovações anteriores já têm SKU, criado pela assinatura do CGI: JOHNS WOOD (17/10) → `PRF-JOHN-0001` (CGI-2026-0003) e "abelinha" (21/10) → `PRF-TEST-0001` (CGI-2026-0004), ambos ativos no Cadastros e gravados em `crm_samples/*/variacoes/*/sku_id`. Na Fase 0 eu tinha dito que "abelinha" estava sem SKU: errado — olhei só `crm_propostas/*/skus_gerados`, campo que nasceu em 23/10 e que nenhuma tela lê. As duas propostas "confirmado" de junho/agosto vieram do ERP antigo e estão fora do escopo.

## 4. Sequência de execução (depois do Portão A)

1. **Fase 1 — Menu** (MENU-01 registro único, MENU-02 identidade, MENU-04 ponte com o CRM; MENU-03 Início quando os cartões tiverem fonte aqui).
2. **Fase 2 — CRM** (CRM-01 categorias do Cadastros primeiro, porque destrava SKU-01 e KO-10; depois CRM-02, CRM-03, CRM-04).
3. **Fase 3 — P&D**, **Fase 4 — Kickoff/BOM**, **Fase 5 — Cotação/SKU/Compras**, **Fase 6 — PCP**, **Fase 7 — Financeiro (FIN-01)**.
4. **Fase 8 — Porte do Gustavo** pela ordem da matriz (seção 5).

Cada fase termina no **Portão B** (prints desktop/390 px, claro/escuro, testes) e nada vai para o `main` sem o **Portão C**.

### 4.1 Distribuição entre os 3 devs (29/10/2026, pedido do Marlos: "3 agentes dev fullstack nas demais etapas")

| Dev | Agora | Em seguida |
|---|---|---|
| Dev 1 (worktree `reuniao-20261028/menu`) | Fase 1 — MENU-01..04 | Fase 8 — PORT-01..10, cada porte já registrado no `navegacao.js` |
| Dev 2 (`reuniao-20261028/pd`) | Fase 3 — PD-01..06 | Fase 4 — KO-10..13, BOM-02..04 (frames aprovados no Figma), depois Fase 5 — COT-01..04 e SKU-01 (c) |
| Dev 3 (`reuniao-20261028/fin-op`) | FIN-01, OP-01, OP-02 | Fase 6 — FEFO-01 e PLAN-01 (com ensaio na base antes de ligar) |

Fases 4 e 5 ficam com o mesmo dev porque mexem nos mesmos arquivos do CRM (`firebaseCommercial.js`, Kickoff). Frames da Fase 4 no Figma: nó `3:2` de <https://www.figma.com/design/50S5daaTQrDleQLrT0jiwx>.

## 5. Matriz de lacunas do repositório do Gustavo (F0-4)

Detalhe completo, com commits e arquivos dos dois lados: [`2026-10-28-matriz-lacunas-gustavo.md`](2026-10-28-matriz-lacunas-gustavo.md).

- **A lacuna começa em 06/10, não em 12/10:** nosso primeiro commit é a pasta dele no estado de `125ab95` (05/10, 17:20). Depois disso ele fez **153 commits**, e não os ~108 do prompt.
- **41 funcionalidades:** 1 já temos (Custos e Resultado, em que estamos à frente), 9 temos diferente e 31 não temos.
- **As 10 de maior valor para a fábrica:**
  1. crédito de produção no pedido guiado pela OP, com conciliação;
  2. liberação de linha (assepsia e first article);
  3. laudo único de PA;
  4. inspeção total de PA com OPs de retrabalho;
  5. RNC com concessão, FOR-QUA-0001 e duplicata;
  6. correções do apontamento;
  7. Emitir OP bloqueando qualquer SKU sem Fórmula + BOM + Especificação;
  8. encerramento de pedido linha a linha;
  9. edição de pedido e recebimento com peso por volume;
  10. NF com fabricação e validade.
- **Menu:**
  - Ele monta tudo de um registro único, `public/shared/navegacao.js`, renderizado em `auth_check.js:672-802` dele, com o CSS da identidade nas linhas 376-412.
  - O registro usa as mesmas classes `kt-nav-*` que o nosso shell lê (barra de cima e busca de telas), então portar não quebra o shell.
- **Bancos diferentes:**
  - O app dele grava em `prod-kuryos` (`.firebaserc`, `utils.js`); o nosso grava em `erpkuryos`.
  - Os saneamentos de dado que ele rodou (vínculo pedido→OP, logins duplicados, crédito de produção) corrigiram só o banco dele. Ver D-15.
- **Auditoria geral dele (`c2cde70`):** intercepta toda gravação, em todas as páginas. Aqui pegaria também o CRM, Custos, Financeiro e Controladoria. Ver D-16.
- **Qualidade:** os módulos dele (liberação de linha, checklists, inspeção total, laudo) dependem uns dos outros. O plano das fases 3-4 do CQ (`b160725`) vem antes de portar qualquer um.
- **Regras do banco:** são 30 nós de topo que só existem nas regras dele. O servidor dele porta sem esforço, porque o Render já serve tudo o que `functions/index.js` exporta.

**Decisão nova D-15 — qual banco a fábrica usa.** A fábrica opera hoje no `prod-kuryos` (o app do Gustavo); este repositório grava no `erpkuryos` (última OP 21/09). Portar telas traz o **código**, não os dados nem os saneamentos dele. Opções:
- (a) portar o código agora e manter a virada da fábrica para o `erpkuryos` como passo próprio (com importação do histórico);
- (b) apontar este app para o `prod-kuryos`.

Padrão recomendado: **(a)**. O CRM, o P&D, os Custos, o Financeiro e a Controladoria já vivem no `erpkuryos`, e trocar de banco agora quebraria tudo isso.

**Decisão nova D-16 — auditoria geral.** Se for portada, quais nós ficam fora por serem sensíveis? Padrão recomendado: auditar só operação (pedidos, OPs, estoque, qualidade, cadastros) e deixar `custos/`, `fin/`, `ctl/`, `resultado/` e `erp/` fora. Esses já são append-only e guardam autor e data em cada registro.

## 6. Linha de base dos testes (F0-2)

Medida em 28/10/2026 no commit `087dfd7`, antes de qualquer mudança:

- **CRM (`crm-frontend`, Vitest):** 36 arquivos passam, 1 pulado; 316 testes passam e 2 são pulados. Rodado em paralelo com outras suítes, 6 arquivos estouram tempo, sem nenhuma asserção falhar. Rodar sozinho.
- **Suítes `run_*_test.js` (sem as de tela e as de regra):** 99 passam, 5 falham, todas por ambiente:
  - `run_etiquetas_leitura_test.js`, `run_fluxo_ponta_a_ponta_test.js` e `run_relatorio_expedicao_test.js`: falta o pacote `playwright`;
  - `run_devolucao_cliente_server_test.js` e `run_liberar_etapa_pd_test.js`: exigem o emulador na porta 9023.
- **Testes de tela (`*_ui_test.js`):** não rodam nesta máquina (falta `playwright` no repo). Os testes de tela novos usam o `playwright-core` do scratchpad, ou se instala `playwright` como devDependency (decisão pequena, fica em `MELHORIAS_FUTURAS.md`).

## 7. Riscos

- **Arquivos divergentes:** `auth_check.js`, `cadastros.html`, `compras.html`, `database.rules.json`, `functions/index.js`, `shared/utils.js` existem nos dois repositórios com histórias diferentes. Portar por funcionalidade; nunca copiar por cima.
- **Sessão paralela** com `auth_check.js`/shell abertos (D-12).
- **Credenciais do site de referência:** usadas só na sessão do navegador; a pasta de rastros do Playwright (que guardou o formulário de login) foi apagada e nada disso entra no git.
- **Saldo de estoque** continua não confiável (D-03, OP-02).
