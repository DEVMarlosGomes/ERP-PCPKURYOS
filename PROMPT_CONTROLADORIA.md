# Prompt — Módulo Controladoria (Kuryos, `erpkuryos`)

> Instrução de construção para um dev sênior full stack ou agente de código; pode ser colada inteira
> como prompt. Escrita em 28/10/2026, depois da entrega e da auditoria do módulo Custos e Resultado.
> Todo número foi **medido na base real de `erpkuryos`** (somente leitura) nessa data.
> Módulo irmão: `PROMPT_FINANCEIRO.md`. Todos os módulos se interligam **por leitura**: a Controladoria
> lê Custos, Faturamento, Resultado e o Financeiro; nenhum módulo escreve no outro.
> **Construído em 28/10/2026** — ver a seção 15.

---

## 0. Seu papel

Você constrói, testa e publica a **Controladoria** da Kuryos:
- razão geral gerencial com partidas dobradas;
- centros de custo;
- DRE gerencial;
- rentabilidade por cliente, pedido e SKU;
- orçamento × real;
- fechamento do mês.

Trabalhe como consultor de implantação SAP/TOTVS que conhece o chão de fábrica: decida por impacto ×
esforço e entregue código real, testado e no ar.

Leia antes, nesta ordem: `CLAUDE.md`, `AGENTS.md`, `AGENT_STATUS.md`, este prompt,
`PLANO_CUSTOS_RESULTADO.md` (o plano de Custos: LP, três leituras, operação por horas-padrão,
ociosidade no custo fixo), `AUDITORIA_CUSTOS_20261028.md`, `PLANO_CUSTOS.md` (o que não construir) e
`PROMPT_FINANCEIRO.md` §6 (o contrato dos títulos). Registre seu escopo no `AGENT_STATUS.md`.

No vocabulário do SAP, a Controladoria é o **FI-GL + CO**: o razão geral, que recebe os razões
auxiliares (custos de produção e financeiro), e a gestão que responde **"o mês deu dinheiro, onde e por
quê?"**.

---

## 1. O negócio e a pergunta da diretoria

A Kuryos é fabricante **private label** de cosméticos: ~30 clientes-marca, envase e rotulagem, licenciada
pela Anvisa. Ela vende capacidade de fabricar o produto de outra marca. A diretoria pergunta **margem**:
- este pedido ou cliente deu dinheiro?
- o mês cobriu o custo fixo?
- quanto da capacidade paga não virou produto?

A **ocupação média medida é 40%**, então ~60% da capacidade paga é ociosidade e tem de aparecer como
linha própria, nunca diluída no custo do produto.

O módulo de Custos já responde o custo por produto (LP padrão, do orçamento e realizado). A Controladoria
fecha a conta da **empresa**: receita, deduções, CPV, margem de contribuição, custo fixo, ociosidade e
despesas, no regime de competência.

O **fiscal** (NF-e, SPED, apuração de impostos) é do contador. A Controladoria é **gerencial** e exporta
para ele pelo plano de contas referencial.

---

## 2. Restrições invioláveis

1. **Nenhuma função nova em outro módulo.** Custos, Financeiro, Compras, Comercial, Faturamento e PCP não
   mudam. A Controladoria **lê** os fatos e os razões auxiliares e deriva os próprios lançamentos.
   - A única exceção é o encanamento de acesso: a página nova em `KURYOS_MODULOS` (`auth_check.js`) e as
     regras `ctl/`.
   - A Controladoria é **página própria** (`controladoria.html`), não aba nova dentro de `custos.html`.
   - Se parecer indispensável mudar fora, pare e pergunte.
2. **Partidas dobradas, documento balanceado.** Todo lançamento é um documento com débitos = créditos ao
   centavo. Documento desbalanceado é recusado pelo motor e pela regra do banco.
3. **Append-only.** Lançamento não se edita nem se apaga. Corrige-se por **estorno** referenciando o
   original (padrão de `custos/razao`).
4. **Período fechado é imutável.** Depois do fechamento, nada é lançado com data no mês. O ajuste vai no
   período aberto, referenciando o fechado (SAP: fechamento de período; TOTVS: data-base).
5. **Não recalcule o que já foi calculado.** O custo de produção vem de `custos/razao`, com o valor que
   o módulo de Custos lançou. A Controladoria não reprecifica OP nem recalcula ficha. Se o número parecer
   errado, ele é corrigido lá, por estorno, e chega aqui pela derivação.
6. **Valor ausente nunca vira zero.** OP sem custo completo não tem lançamento no razão de custos (o
   servidor espera o custo). A DRE mostra a **cobertura** (% do faturado com CPV de razão) e a parte sem
   custo como linha "CPV pendente", nunca como CPV zero.
7. **Centavos inteiros** no motor. **Idempotência** por chave determinística a partir do id do fato de
   origem: rodar duas vezes não duplica.
8. **Integralidade.** A receita é o valor integral da NF e do pedido. A diferença entre o pedido e a
   cobertura fiscal (`percentualNF` 50 em 13 pedidos) aparece como conciliação para o contador, nunca
   como caixa paralelo.
9. **Dado sensível.** R$ e margem só para a diretoria (ADM ou módulo `custos`), com a mesma
   `CustosResultadoSrv.ehDiretoria` do Custos, sem checkbox novo. Salário individual não é lido: a folha
   entra pelo total em `custos/operacao/{mês}`.
10. **Caminhos planos** em todo `update` no RTDB (objeto aninhado apaga campos).

---

## 3. Referência de mercado: o que copiar

| Conceito | SAP | TOTVS Protheus | Aqui |
|---|---|---|---|
| Razão geral, documento balanceado | FI-GL | SIGACTB (lançamentos contábeis, CT2) | `ctl/lancamentos/{AAAA-MM}/{doc}` |
| Plano de contas + referencial do fisco | plano de contas + conta alternativa | plano de contas + plano referencial (ECD) | `ctl/plano_contas` com `contaReferencial` |
| Conta de reconciliação | o razão auxiliar (AP/AR) bate com a conta do GL | conciliação contábil × financeiro | saldo de Fornecedores e Clientes no razão = Σ saldo dos títulos do Financeiro |
| Centro de custo | CO-CCA | centro de custo (CTT) | `ctl/centros_custo` |
| Custo do produto | CO-PC | SIGACUS | **já existe**: `custos.js` e `custos-realizado.js` |
| Rentabilidade | CO-PA | Controladoria — rentabilidade | `CustosRealizado.consolidar` + receita da NF |
| Absorção e ociosidade | variação de volume (CO-PC) | custo de ociosidade | MOD aplicada × folha; capacidade ociosa em linha própria |
| Orçamento × real | CO planning | SIGAPCO | `ctl/orcamento/{ano}` |
| Fechamento | closing cockpit | fechamento contábil | checklist + trava do mês |

Copie os **conceitos**, não a complexidade: uma empresa, um CNPJ, moeda BRL, regime de competência.

---

## 4. O que já existe e a Controladoria lê (medido em 28/10/2026)

Nenhum destes nós muda.

| Fonte | Nó | O que tem |
|---|---|---|
| Razão de custos | `custos/razao/{mês}/{id}` | append-only. `ENTRADA_MATERIAL` (no recebimento, valor do lote, natureza MATERIA_PRIMA, EMBALAGEM, USO_E_CONSUMO ou OUTROS), `CONSUMO_MATERIAL` e `PERDA` (natureza MATERIA_PRIMA_EMBALAGEM), `HORA_PRODUCAO` (MAO_DE_OBRA) e `ESTORNO` (`estornaId`). Cada linha tem `objeto {tipo: OP, id}`, `sku`, `lote`, `competencia`, `procedencia` e `valorTotal` |
| OPs lançadas | `custos/razao_ops/{op}` | `produzido`, `revisao`, `lancamentos`, `lp`. **Só OP com custo completo** entra (as demais esperam) |
| Fichas e taxas congeladas | `custos/fichas/{mês}`, `custos/taxas/{mês}` | custo padrão por SKU; custo-hora direto e pleno; horas disponíveis e padrão; ocupação |
| Operação do mês | `custos/operacao/{mês}` | total da folha da produção e fixos com `rateio` PRODUCAO ou ADMINISTRATIVO |
| Parâmetros | `custos/parametros` | % de impostos padrão e por cliente |
| Faturamento | `agendamentos_expedicao/{carga}/faturamento` | `nfs/{id}` (`numero`, `serie`, `valor`, `emitidaEm`, `chaveNfe`) e `solicitacoes/{id}` (itens com `precoUnitario`, `totalValor`). **Vazio no `erpkuryos` até a virada** |
| Pedido comercial | `pedidos_comerciais/{k}` | 81 pedidos; `totalValor` > 0 em 28 (R$ 3,89 mi); `percentualNF` por item |
| Orçamento aprovado | `erp/kuryos/crm_propostas` | preço aprovado: o LP do orçamento já vem do Custos |
| Bônus | `resultado/fechamentos/{mês}` | bônus do mês, `bonusValendo` |
| Financeiro | `fin/titulos`, `fin/baixas` | contrato em `PROMPT_FINANCEIRO.md` §6: natureza, competência, centro de custo, juros, multa, desconto, variação cambial e banco separados. **Só existe depois que o Financeiro for construído**: a Controladoria funciona sem ele, só sem caixa |

### Limites dos dados que mudam o desenho (achados na auditoria de 28/10)

- **O envase baixa a embalagem pela ficha** (BOM × apontado; `form.html:baixarEstoqueConsumo`).
  - O consumo de embalagem no razão é teórico, então a variação de consumo **não é medida**: o motor
    devolve null, não zero.
  - Só a pesagem do granel (`consumo_manipulacao`) mede consumo de verdade.
  - A DRE mostra a variação de consumo como "não medida" e nunca soma zero.
- **Última OP em 21/09; LP completo em 0 SKUs hoje** (só 12 materiais com preço).
  - Até o preço e a virada da fábrica, o CPV do razão é pequeno, e a cobertura (restrição 6) é a
    informação principal.
- **Ocupação de 40%** (medida em 14/09) e taxas por competência em `custos/taxas`.
  - A ociosidade é `(horas disponíveis − horas-padrão produzidas) × custo-hora pleno`, linha própria da
    DRE.
  - **Nunca use a duração da OP**: medido, dá 123–243% e é tempo de calendário.

---

## 5. Arquitetura

- **Motor puro** `public/shared/controladoria.js` (UMD, cópia byte a byte em `functions/`): derivação
  de lançamentos, documento balanceado, saldos, DRE, CO-PA, orçamento × real, reconciliação, checklist,
  export.
- **Servidor** no Render: `functions/controladoria_servidor.js`, ligado no `index.js`.
  - Escutas persistentes nos nós da seção 4.
  - Agenda `every 5 minutes` que deriva os lançamentos novos de forma idempotente.
  - Callables para lançamento manual (só ajuste, com histórico), estorno, fechamento e reabertura
    (só ADM, com justificativa).
- **Tela** `public/controladoria.html` + `shared/controladoria-tela.js`, entrada no menu Analytics.
- **Acesso**: diretoria (ADM ou módulo `custos`). Não crie papel novo.

---

## 6. Modelo de dados (nós novos, todos em `ctl/`)

```
ctl/plano_contas/{conta}       codigo, nome, tipo (ATIVO|PASSIVO|PL|RECEITA|DEDUCAO|CUSTO|DESPESA), grupoDre,
                               contaReferencial (ECD), natureza(s) que a alimentam, ativa
ctl/centros_custo/{cc}         nome, tipo (PRODUTIVO|APOIO|ADMINISTRATIVO|COMERCIAL), linhas PCP associadas
ctl/lancamentos/{AAAA-MM}/{doc}  data, competencia, historico, origem {tipo: RAZAO_CUSTOS|NF_SAIDA|TITULO|BAIXA|OPERACAO|BONUS|AJUSTE, ref},
                               partidas: [{conta, cc?, debitoCentavos, creditoCentavos}], estornaDoc?,
                               criadoEm, criadoPor, versaoMotor             (append-only, balanceado)
ctl/orcamento/{ano}/{conta}/{cc}/{mm}   valor em centavos
ctl/fechamentos/{AAAA-MM}      checklist, totais da DRE, cobertura, fechadoEm, fechadoPor, reaberturas/{id}
ctl/parametros                 mapa natureza → conta, centro padrão por linha, tolerância da reconciliação
```

O plano de contas nasce semeado: ativo circulante (bancos, clientes, estoques de MP, embalagem, PEP e
PA), passivo (fornecedores, salários, impostos estimados, PLR), receita, deduções, CPV, CIF, ociosidade,
despesas administrativas e comerciais, e resultado financeiro (juros, multa, desconto e variação
cambial). Cada conta tem a referencial ECD para o contador. A diretoria pode editar; conta com
lançamento só se inativa, nunca se apaga.

---

## 7. Derivação: fato → lançamento

| Fato (nó lido) | Lançamento (D / C) |
|---|---|
| `custos/razao` ENTRADA_MATERIAL | D Estoque (conta da natureza) / C Fornecedores |
| `custos/razao` CONSUMO_MATERIAL da OP | D Produção em processo (cc da linha) / C Estoque MP e embalagem |
| `custos/razao` HORA_PRODUCAO | D Produção em processo / C MOD aplicada |
| `custos/razao` PERDA | D Perdas de produção / C Produção em processo |
| `custos/razao_ops` (OP lançada) | D Estoque PA / C Produção em processo (Σ da OP) |
| `custos/razao` ESTORNO | estorno do documento original |
| NF registrada na carga | D Clientes / C Receita bruta. D Deduções / C Impostos estimados a recolher (% de `custos/parametros`, marcado ESTIMADO). D CPV / C Estoque PA: custo da OP do lote pelo razão; sem ele, ficha padrão do mês, marcado PADRAO e contado na cobertura |
| `custos/operacao/{mês}` | D CIF produção (rateio PRODUCAO) e D Despesa administrativa (rateio ADMINISTRATIVO) / C Salários e fornecedores a pagar; **variação de absorção** = MOD aplicada − folha da produção; **ociosidade** pela taxa da competência |
| `resultado/fechamentos/{mês}` com `bonusValendo` | D Despesa com PLR / C PLR a pagar |
| `fin/baixas` (se existir) | D Fornecedores / C Banco; D Banco / C Clientes; juros, multa, desconto e variação cambial em contas próprias |
| `fin/titulos` sem fato de origem acima (MANUAL, IMPORTACAO) | D/C pela natureza do título / C/D Fornecedores ou Clientes |

Cada linha é uma função pura testada; o servidor só aplica o que ela devolve. Material do cliente
(`custoFonte: CLIENTE`) não gera lançamento: o razão de custos já não lança valor zero.

---

## 8. Motor (funções puras, `controladoria.js`)

- `documentoBalanceado(partidas)` e `lancamentosDe(fato, plano, parametros)`: devolvem o documento ou
  recusam com motivo.
- `saldos(lancamentos, ate)`: balancete por conta e centro.
- `dre(lancamentos, competencia)`, na ordem:
  1. receita bruta;
  2. deduções;
  3. receita líquida;
  4. CPV (com a **cobertura**, e "CPV pendente" separado);
  5. **margem de contribuição**;
  6. CIF e variação de absorção;
  7. **ociosidade**;
  8. despesas administrativas e comerciais;
  9. resultado operacional gerencial;
  10. resultado financeiro.
- `coPa(resultadosRealizados, nfs, nivel)`: rentabilidade por cliente, pedido, SKU ou linha.
  - Reaproveita `CustosRealizado.consolidar` (já traz LP, variações e procedência PAGO/COTADO/ESTIMADO
    por nível) e casa com a receita da NF.
  - Mostra as três leituras do LP do plano de Custos (orçamento, padrão, realizado) lado a lado.
- `reconciliacao(saldosRazao, titulos)`:
  - Fornecedores e Clientes no razão contra Σ saldo dos títulos do Financeiro;
  - Estoque MP/embalagem contra Σ do razão de custos.
  - A diferença aparece com a lista do que a explica.
- `orcamentoXReal(orcamento, lancamentos)`: por conta × centro × mês, com variação e %.
- `checklistFechamento(mes, base)`. Fecha só com tudo verde; o ADM pode forçar com justificativa
  registrada. Itens:
  - NF sem lançamento;
  - OP concluída aguardando custo;
  - operação do mês não salva;
  - taxas não congeladas;
  - reconciliação com diferença;
  - complementos do Financeiro abertos.
- `exportarContador(mes)`: CSV de lançamentos por conta referencial, balancete e NFs do mês.

---

## 9. Tela (`controladoria.html`)

1. **DRE do mês**:
   - DRE em cascata com a cobertura no topo;
   - comparação com o mês anterior e com o orçamento;
   - clique na linha abre os lançamentos que a compõem, e de lá a origem (OP, NF, título).
2. **Rentabilidade (CO-PA)**:
   - por cliente, pedido, SKU e linha;
   - receita, CPV, margem de contribuição e LP nas três leituras;
   - procedência do custo.
3. **Centros de custo**: realizado por centro e mês; variação de absorção e ociosidade das linhas.
4. **Orçamento × real**: edição do orçamento por conta × centro × mês; desvio em R$ e %.
5. **Razão e balancete**: lançamentos com filtros, estorno com motivo e ajuste manual (só diretoria, com
   histórico).
6. **Fechamento**: checklist, fechar e reabrir (ADM, com justificativa); export ao contador.
7. **Plano de contas e parâmetros**: contas, referencial, mapa natureza → conta, centros por linha.

---

## 10. Segurança

- Regras `ctl/`:
  - Leitura só para a diretoria (ADM ou módulo `custos`).
  - `ctl/lancamentos` e `ctl/fechamentos`: só o servidor grava.
  - `ctl/orcamento`, `ctl/plano_contas`, `ctl/centros_custo` e `ctl/parametros`: a diretoria grava,
    com validação.
  - Mês com `ctl/fechamentos/{mês}/fechadoEm` recusa lançamento com competência nele, também no
    servidor.
- Rode o teste de regras no emulador com `--project demo-controladoria`.

---

## 11. Fases (cada uma publicada e útil sozinha)

| Fase | Entrega | Depende de |
|---|---|---|
| C0 | Página, acesso, regras, plano de contas semeado com referencial, centros de custo, parâmetros | nada |
| C1 | Razão de produção a partir de `custos/razao` + operação do mês (CIF, absorção, ociosidade) + balancete | C0 |
| C2 | Receita e CPV pelas NFs; DRE gerencial com cobertura; CO-PA | C1 + faturamento operando no `erpkuryos` |
| C3 | Caixa e reconciliação com o Financeiro (`fin/baixas`, `fin/titulos`) | C1 + Financeiro F1 |
| C4 | Orçamento × real, fechamento com checklist e trava, export ao contador | C2 |

---

## 12. Critérios de aceite

1. Com o banco vazio de NF, títulos e baixas, nenhuma tela mostra NaN, Infinity ou total falso; os
   vazios dizem por quê.
2. Todo documento de `ctl/lancamentos` fecha débito = crédito ao centavo; um teste varre a base.
3. Rodar a derivação duas vezes não cria lançamento duplicado; um estorno no razão de custos gera
   estorno aqui, nunca apaga.
4. Σ lançamentos de produção do mês = Σ `custos/razao` do mês (sem recálculo; diferença zero).
5. A margem de contribuição da DRE bate com Σ LP realizado das OPs faturadas (tolerância de centavos); a
   divergência aparece explicada.
6. A ociosidade usa horas disponíveis e horas-padrão da competência, nunca a duração da OP. O teste
   reproduz a regra "duração de OP não entra" do Custos.
7. A variação de consumo de embalagem aparece "não medida" (null), nunca R$ 0.
8. CPV sem custo de razão aparece como "pendente" com cobertura em %, nunca como zero.
9. Mês fechado recusa lançamento com competência nele (regra do banco e servidor).
10. A reconciliação acusa diferença entre Fornecedores ou Clientes no razão e os títulos do Financeiro,
    quando ele existir.
11. Nenhum arquivo de outro módulo foi alterado. O `git diff` só toca `ctl/`, os arquivos da
    controladoria, `auth_check.js` (entrada no menu) e as regras.
12. O motor roda contra a base real (`custos/razao`, `custos/operacao`, 81 pedidos comerciais, OPs até
    21/09) sem número inválido, e esse ensaio faz parte da suíte.

---

## 13. Como trabalhar (lições que já custaram caro aqui)

- **Ensaio com a base real antes de fechar cada fase.** No Custos, o ensaio achou que o código lia
  `consumo` enquanto a base só tinha `consumo_producao`. O realizado ficava sem consumo nenhum, e 100+
  asserções sintéticas passavam.
- **Leia o dado e quem o grava** (`shared/kardex.js` explica as duas razões do estoque). Busca por regex
  de `db.ref` não acha escrita feita por função.
- **Teste a ligação, não só a unidade:**
  - servidor real contra banco simulado (`run_custos_servidor_test.js`);
  - e2e contra os emuladores com a base real semeada.
- **Zero não é "não medido".** Variação, CPV e custo ausentes são null com motivo.
- **Deploy = commit + push no `main`.** As regras vão pela CLI (`--only database --project erpkuryos`),
  com autorização do usuário e backup das regras no ar antes.
- **Nunca use `git add -A`.**

---

## 14. Fora de escopo

- Contabilidade fiscal, SPED, apuração de impostos e livros oficiais (contador; a Controladoria só
  exporta).
- Contas a pagar e a receber, baixas, bancos e conciliação bancária (Financeiro).
- Reprecificar OP ou ficha (é do módulo de Custos).
- Consolidação societária e multimoeda funcional.

---

## 15. Estado da implementação (28/10/2026)

Fases C0–C4 construídas, testadas e no ar. Nenhum módulo existente mudou (os acréscimos foram o módulo
no menu, a ligação no servidor e as regras `ctl/`).

| Peça | Arquivo |
|---|---|
| Motor puro | `public/shared/controladoria.js` (cópia em `functions/`) |
| Servidor | `functions/controladoria_servidor.js`; a mesma agenda de 5 min deriva os lançamentos e monta `ctl/painel/{mês}` (checklist, reconciliação, ociosidade); callables `ctlLancarAjuste`, `ctlEstornarAjuste`, `ctlFecharMes`, `ctlReabrirMes` |
| Tela | `public/controladoria.html` + `shared/controladoria-tela.js` (7 abas: DRE, Rentabilidade, Centros de custo, Orçamento × real, Razão e balancete, Fechamento, Plano de contas) |
| Testes | `run_controladoria_test.js` (59), `run_gestao_servidor_test.js`, `run_gestao_rules_test.js`, e2e (112 lançamentos reais + fictícios, todos balanceados) |

Desvios deste prompt, com o motivo:

- **Módulo próprio `controladoria`** em vez do módulo `custos`. A Controladoria é página própria e o ADM
  marca quem a usa. Ela **não** lê `custos/`, que é restrito: o servidor monta o checklist, a
  reconciliação e a memória de ociosidade em `ctl/painel`.
- **Margem × LP**: a DRE e o LP realizado não "batem" por construção. A nota usa o preço faturado e a
  quantidade vendida; o LP usa o preço vigente e a quantidade produzida. A Rentabilidade mostra os dois
  lado a lado, e a diferença é explicada por preço e quantidade.
- **CPV padrão** credita o estoque de PA mesmo sem a OP ter debitado. O PA pode ficar negativo no
  balancete, e isso é visível de propósito.
- **Fechamento com pendência** só pelo ADM, com justificativa gravada; reabertura idem, com histórico.
- Plano de contas semeado com 25 contas; a **conta referencial (ECD)** fica em branco para o contador
  preencher, porque inventar código daria um export preciso e falso.
