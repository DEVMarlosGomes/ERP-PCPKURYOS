# Prompt — Módulo Financeiro (Kuryos, `erpkuryos`)

> Instrução de construção para um dev sênior full stack ou agente de código; pode ser colada inteira
> como prompt. Escrita em 28/10/2026, depois da entrega e da auditoria do módulo Custos e Resultado.
> Todo número foi **medido na base real de `erpkuryos`** (somente leitura) nessa data.
> Módulo irmão: `PROMPT_CONTROLADORIA.md`. Todos os módulos se interligam **por leitura**: o Financeiro lê
> Compras, Recebimento, Faturamento e Custos; a Controladoria lê tudo isso e o Financeiro (contrato da
> seção 6). Nenhum módulo escreve no outro. **Construído em 28/10/2026** — ver a seção 15.

---

## 0. Seu papel

Você constrói, testa e publica o **Financeiro** da Kuryos: contas a pagar e a receber, caixa, bancos,
conciliação e fluxo de caixa. Trabalhe como consultor de implantação SAP/TOTVS que conhece o chão de
fábrica: decida por impacto × esforço e entregue código real, testado e no ar, não especificação.

Leia antes, nesta ordem: `CLAUDE.md`, `AGENTS.md`, `AGENT_STATUS.md`, este prompt,
`PLANO_CUSTOS_RESULTADO.md` (o plano de Custos, que este módulo complementa),
`AUDITORIA_CUSTOS_20261028.md`. Registre seu escopo no `AGENT_STATUS.md`.

No vocabulário do SAP, **o Financeiro é o razão auxiliar (subledger)**: títulos, baixas e bancos.
O razão geral, a DRE e o fechamento contábil gerencial são da Controladoria, que **lê** o que você grava.

---

## 1. O negócio, em uma página

A Kuryos é fabricante **private label** de cosméticos: ~30 clientes-marca, envase e rotulagem, licenciada
pela Anvisa. Ela vende capacidade de fabricar o produto de outra marca. Três consequências:

1. **Parte do material é do cliente.** O estoque tem dono (`propriedade` no lote; `custoFonte: CLIENTE`
   no recebimento). Material do cliente não gera conta a pagar.
2. **A receita é por carga faturada**, com preço por pedido e SKU, e condição parcelada
   ("15/30/45/60", "20% à vista, 30/45").
3. **O caixa é curto e a pergunta é de prazo:** "o que vence esta semana e o que entra para cobrir?".

### Fronteira com o fiscal (decisão de 28/10)

O `PLANO_CUSTOS.md` (14/09) decidiu não construir financeiro transacional; em 28/10 o usuário pediu o
módulo. O **fiscal** continua com o contador.

| Camada | Decisão |
|---|---|
| Emissão de NF-e, SPED, apuração de impostos, obrigações acessórias | **Não construir.** Este módulo só exporta o que o contador pede |
| A pagar, a receber, bancos, baixas, conciliação, fluxo de caixa | **Construir (este prompt)** |
| Razão geral, centros de custo, DRE, orçamento, fechamento | Controladoria (`PROMPT_CONTROLADORIA.md`) |

---

## 2. Restrições invioláveis

1. **Nenhuma função nova em outro módulo.** Compras, Recebimento, Comercial, Faturamento, PCP, Custos e
   Controladoria não mudam. O financeiro **lê** os fatos que eles já gravam. Toda lacuna vira item da
   **fila de complementos dentro do financeiro**, por exemplo PC sem condição de pagamento, NF sem pedido
   ou cliente sem prazo. Quem opera o financeiro resolve ali. A única exceção é o encanamento de
   acesso: o módulo novo em `KURYOS_MODULOS` (`auth_check.js`) e as regras `fin/`. Se outra mudança
   externa parecer indispensável, pare e pergunte.
2. **Valor ausente nunca vira zero.** Título sem valor, sem vencimento ou sem parceiro fica na fila de
   complementos e nunca entra no fluxo de caixa como 0 (mesma regra `SEM_CUSTO` do Custos).
3. **Append-only.** Título e baixa não se editam nem se apagam. Corrige-se por **estorno** com
   referência ao original, no mesmo padrão de `custos/razao`. Título baixado só volta a aberto com
   estorno da baixa.
4. **Centavos inteiros** no motor (nunca float acumulado). Moeda estrangeira guarda valor original,
   moeda e taxa (`config/cambio/usd_brl`, atualizado a cada 15 min pelo Render). A variação cambial é
   apurada na baixa.
5. **Idempotência.** O título derivado de um fato tem chave determinística, por exemplo
   `NF_{carga}_{nf}_p{parcela}` ou `REC_{pc}_{rec}_p{parcela}`. Rodar duas vezes não duplica (padrão de
   `prepararRazaoOps`).
6. **Integralidade.** Registre o **valor integral** de cada operação. 13 pedidos comerciais têm
   `percentualNF` 50 (4 têm 100 e 2 têm 10). Essa cobertura fiscal aparece como conciliação para o
   contador; o módulo **não mantém caixa paralelo** nem esconde diferença.
7. **Segregação de funções.** O lote de pagamento é aprovado por outra pessoa (`aprovadoPor ≠
   criadoPor`), garantido no servidor e na regra do banco.
8. **Dado sensível.** R$ só para quem tem o módulo `financeiro` (ou é ADM). Extrato e conta bancária
   nunca aparecem para PCP, fábrica ou TV.
9. **Caminhos planos** em todo `update` no RTDB: objeto aninhado apaga campos (CLAUDE.md).

---

## 3. Referência de mercado: o que copiar

| Conceito | SAP | TOTVS Protheus | Aqui |
|---|---|---|---|
| Contas a pagar | FI-AP (fornecedor, vencimento, bloqueio de pagamento) | SIGAFIN — títulos a pagar (SE2) | `fin/titulos` tipo PAGAR |
| Contas a receber | FI-AR (cliente, cobrança) | SIGAFIN — títulos a receber (SE1) | `fin/titulos` tipo RECEBER |
| Natureza financeira | conta de razão | **natureza** (SED) | `natureza` no título (seção 6) |
| Compromisso (pedido sem nota) | commitment do PO | previsão financeira do pedido | `fin/compromissos`, fora do título, dentro do fluxo |
| Lote de pagamento | Payment run (F110) | Borderô | `fin/lotes_pagamento` com aprovação de segunda pessoa |
| Compensação | clearing de partidas em aberto | baixa e compensação entre carteiras | baixa total ou parcial, com juros, multa e desconto |
| Conciliação bancária | Electronic Bank Statement | conciliação (SE5 × extrato) | importação de **OFX** e casamento com as baixas |
| Fluxo de caixa | Cash Management | fluxo de caixa por natureza | realizado + projetado por semana |

Copie os **conceitos**, não a complexidade: uma empresa, um CNPJ, poucos bancos, moeda funcional BRL.

---

## 4. O que já existe e o módulo lê (medido em 28/10/2026)

Nenhum destes nós muda.

| Fonte | Nó | O que tem | Vira |
|---|---|---|---|
| Pedido de Compra | `pedidos_compra/{pc}` | 16 PCs, 13 não cancelados. **Só 3 têm `condicaoPagamento`** ("28", com `prazoPagamentoParcelas`). Itens com `precoUnit` e `unidadeCotada` × `unidade` (já houve erro de 11,67×: use `Custos.custoUnitarioItemPC`), mais `frete {tipo, valor}` e `propriedade` | **compromisso** a pagar; a maioria cai na fila de complementos (sem condição) |
| Recebimento | `pedidos_compra/{pc}/recebimentos/{rec}` | `data`, `notaFiscal`, linhas; o lote em `estoque_lotes` leva `custoUnitario` e `custoFonte` (PAGO ou CLIENTE) desde o deploy do Custos (27/10) | **título a pagar** efetivo, com parcelas pela condição do PC a partir da data do recebimento |
| Cancelamento e devolução | `.../recebimentos/{rec}/status`, `/devolucoes` | já estornam o razão de custos | estorno ou abatimento do título |
| Cotação de Compras | `processos_cotacao` | 13 processos (5 decididos): frete, validade, condição | condição do compromisso quando o PC não tem |
| Pedido comercial | `pedidos_comerciais/{k}` | 81 pedidos; `totalValor` > 0 em 28 (R$ 3,89 mi somados); `prazoPagamento` em 23; itens com `valorUnitario` e `percentualNF` | **previsão** a receber |
| Faturamento | `agendamentos_expedicao/{carga}/faturamento` | `solicitacoes/{id}`: itens com `precoUnitario` e `totalValor`. `nfs/{id}`: `numero`, `serie`, `valor`, `emitidaEm`, `chaveNfe`, `registradoPor/Em`. `status: FATURADO`. Estrutura pronta, **vazia no `erpkuryos` até a virada** | **título a receber**, com parcelas pela condição do pedido ou do cliente |
| Cliente | `clientes/{k}` | 61; `cnpj` em 52, `uf` em 50, `condicaoPagamento` em 9 | parceiro e prazo padrão |
| Fornecedor | `fornecedores/{k}` | 403; `cnpj` em 395, `condicaoPagamento` em 1 | parceiro |
| Operação do mês | `custos/operacao/{mês}` | total da folha de produção e fixos (descrição, valor, rateio) | **títulos recorrentes** (folha e cada fixo) |
| Bônus | `resultado/fechamentos/{mês}` | `bonus`, `bonusValendo` | título de PLR, **só se `bonusValendo`** |

**Situação honesta:** não há NF de saída nem baixa nenhuma no `erpkuryos`. Há só 13 PCs válidos, e só
3 têm condição de pagamento. O módulo tem de nascer útil com pouco dado:
- saldo inicial dos bancos;
- importação por planilha dos títulos em aberto de hoje;
- fila de complementos.

Ele cresce com a virada da fábrica.

---

## 5. Arquitetura

O desenho é o mesmo do módulo de Custos, já auditado:

- **Motor puro** `public/shared/financeiro.js`: UMD, cópia byte a byte em `functions/`, sem banco e
  sem DOM.
- **Servidor** no Render: `functions/financeiro_servidor.js`, ligado no `index.js`.
  - Escutas persistentes nos nós da seção 4. Elas só baixam a diferença; reler tudo a cada rodada
    estoura a cota do RTDB.
  - Agenda `every 5 minutes` que deriva títulos e compromissos de forma idempotente. O agendador do
    Render só entende `every N minutes`, então tarefa mensal roda na primeira passada do mês.
  - Callables para baixa, estorno, lote, aprovação, conciliação e importação.
- **Tela** `public/financeiro.html` + `shared/financeiro-tela.js`.
- **Acesso**: módulo `financeiro` em `KURYOS_MODULOS`, marcado pelo ADM. Não crie papel novo: papel
  novo custa cinco pontas (CLAUDE.md).

---

## 6. Modelo de dados e contrato com a Controladoria

```
fin/contas_bancarias/{banco}   nome, agencia, conta, saldoInicialCentavos, dataSaldoInicial, ativa
fin/titulos/{id}               tipo (PAGAR|RECEBER), origem {tipo: RECEBIMENTO|NF_SAIDA|OPERACAO|BONUS|MANUAL|IMPORTACAO, ref},
                               parceiro {tipo, key, nome, cnpj}, documento, parcela "1/4", emissao, vencimento,
                               valorCentavos, moeda, taxaCambio, natureza, centroCusto?, competencia,
                               status (ABERTO|PARCIAL|BAIXADO|ESTORNADO|BLOQUEADO), saldoCentavos, bloqueio {motivo, por}?
fin/baixas/{id}                titulo, data, valorCentavos, jurosCentavos, multaCentavos, descontoCentavos,
                               variacaoCambialCentavos, conta (banco), loteKey?, conciliacaoKey?, estornaBaixa?, criadoPor
fin/compromissos/{id}          PC sem nota ou pedido sem faturar: valor previsto, data prevista, origem; nunca vira título
fin/lotes_pagamento/{id}       titulos, totalCentavos, criadoPor, aprovadoPor (≠ criadoPor), status, exportadoEm
fin/extratos/{banco}/{fitid}   linha do OFX (FITID é a chave: importar duas vezes não duplica), conciliadoCom
fin/complementos/{id}          lacuna da derivação, com a ação que resolve
fin/parametros                 vencimento padrão da folha e dos fixos, tolerância da conciliação (dias), naturezas
```

**Contrato com a Controladoria.** Ela lê `fin/titulos` e `fin/baixas` como fatos, igual lê o razão de
custos, e gera os lançamentos contábeis. Para que ela nunca precise pedir mudança aqui, todo título e
toda baixa já nascem com estes campos:
- `natureza`: MATERIA_PRIMA, EMBALAGEM, USO_E_CONSUMO, OUTROS (as de `Custos.naturezaDoMaterial`),
  FRETE, FOLHA, CUSTO_FIXO_PRODUCAO, CUSTO_FIXO_ADM, PLR, RECEITA_VENDA;
- `competencia`;
- `centroCusto`, quando a origem diz qual é;
- juros, multa, desconto e variação cambial **separados** do principal;
- o banco da baixa.

O financeiro **não grava** em `fin/lancamentos`; esse nó é da Controladoria.

---

## 7. Derivação: fato existente → registro do financeiro

| Fato | Quando | Gera |
|---|---|---|
| PC `ENVIADO` ou `RECEBIDO_PARCIAL` sem recebimento | ao aparecer | compromisso a pagar com parcelas pela condição; sem condição, compromisso **sem data** + complemento |
| Recebimento `ATIVO` de material da Kuryos | ao aparecer | título(s) a pagar com o **valor do lote** (`custoUnitario` × quantidade, o mesmo do razão de custos), parcelas pela condição do PC; consome o compromisso |
| Recebimento de material do cliente (`custoFonte: CLIENTE`) | — | nada |
| Cancelamento ou devolução | ao aparecer | estorno do título, ou abatimento parcial na devolução |
| Frete FOB com valor no PC | no recebimento | título a pagar ao transportador (natureza FRETE) |
| NF registrada na carga (`faturamento/nfs`) | ao aparecer | título(s) a receber, com parcelas pela condição do pedido comercial ou, na falta, do cliente; sem nenhuma, complemento |
| Pedido comercial liberado sem NF | ao aparecer | previsão a receber (compromisso) |
| `custos/operacao/{mês}` salva | na competência | títulos recorrentes (folha e cada fixo) no vencimento padrão de `fin/parametros` |
| `resultado/fechamentos/{mês}` com `bonusValendo` | ao fechar | título de PLR |

Cada linha é uma função pura testada; o servidor só aplica o que ela devolve.

---

## 8. Motor (funções puras, `financeiro.js`)

- `parcelas(condicao, base, valorCentavos)`
  - Lê "28", "15/30/45/60" e "20% A VISTA, 30/45".
  - A última parcela absorve o arredondamento.
  - Condição ilegível devolve `{ok:false, motivo}`, que vira complemento.
- `derivarTitulosRecebimento`, `derivarTitulosNfSaida`, `derivarRecorrentes`, `derivarCompromissos`:
  transformam o fato em títulos com chave determinística.
- `baixar(titulo, baixa)`: baixa parcial, juros, multa, desconto e variação cambial; nunca deixa saldo
  negativo.
- `estornarBaixa(baixa)`.
- `conciliarOfx(extrato, baixas, titulos, tolerancia)`
  - Casa por valor + data ± N dias + documento.
  - O que não casa fica para decisão humana; o motor nunca casa sozinho "o mais próximo".
- `fluxoDeCaixa({saldos, titulos, compromissos, previsoes, recorrentes}, semanas)`
  - Realizado + projetado por semana e por natureza.
  - Título (fato) aparece separado de compromisso e previsão (expectativa).
- `aging(titulos, data)`
  - Faixas: a vencer, vencido 1–30, 31–60, 61–90 e >90 dias.
  - Indicadores: PMR, PMP e ciclo de caixa.
- `validarLote(lote, usuario)`: segregação de funções e saldo do dia.

---

## 9. Tela (`financeiro.html`)

1. **Painel**: saldo por banco, a pagar e a receber da semana, vencidos, fluxo de 13 semanas, PMR e PMP.
2. **A pagar** e **A receber**:
   - títulos com filtros e aging;
   - baixa individual e parcial;
   - bloqueio de pagamento com motivo;
   - link para a origem (PC, recebimento, carga).
3. **Lote de pagamento**:
   - seleção de títulos e total do dia contra o saldo;
   - aprovação por outra pessoa;
   - exportação da lista.
4. **Conciliação bancária**:
   - importação do OFX e sugestão de pares para confirmar;
   - o que sobra vira baixa ou título novo.
5. **Fluxo de caixa**: realizado × projetado, com compromissos e previsões em tom diferente do título.
6. **Complementos**: tudo que a derivação não completou, com a ação para resolver ali mesmo.
7. **Cadastros**: bancos e saldo inicial, vencimentos padrão, naturezas, importação de títulos em aberto
   por planilha.

---

## 10. Segurança

- Regras `fin/` deste módulo:
  - Leitura e escrita só para ADM ou módulo `financeiro`.
  - `fin/titulos` e `fin/baixas`: só o servidor grava; a tela chama callable.
  - Lote de pagamento recusa `aprovadoPor == criadoPor`.
- A Controladoria lê `fin/titulos` e `fin/baixas`: libere leitura para a diretoria (ADM ou módulo
  `custos`).
- Rode o teste de regras no emulador com `--project demo-financeiro`. Sem isso, o teste de negação passa
  sem testar nada.

---

## 11. Fases (cada uma publicada e útil sozinha)

| Fase | Entrega | Depende de |
|---|---|---|
| F0 | Módulo `financeiro`, regras, bancos e saldo inicial, importação de títulos em aberto, parâmetros | nada |
| F1 | A pagar a partir dos recebimentos e da operação do mês; baixa manual; complementos | F0 |
| F2 | A receber a partir das NFs de saída; aging; PMR | F0 + faturamento operando no `erpkuryos` |
| F3 | Fluxo de caixa realizado × projetado (compromissos de PC, previsões de pedido, recorrentes) | F1 |
| F4 | Conciliação OFX e lote de pagamento com aprovação | F1 |

---

## 12. Critérios de aceite

1. Com o banco sem NF e sem baixas, nenhuma tela mostra NaN, Infinity ou total falso; os vazios dizem
   por quê.
2. Rodar a derivação duas vezes não cria título duplicado; importar o mesmo OFX duas vezes não duplica
   linha.
3. Material do cliente nunca gera título a pagar.
4. Condição de pagamento ilegível ou ausente, no PC e na cotação decidida, vira complemento, não
   vencimento inventado. Só 3 dos 16 PCs têm condição; o ensaio com a base real informa quantos caem
   aqui.
5. Cancelar ou devolver recebimento estorna (nunca apaga), e o título reflete o abatimento.
6. Lote de pagamento não é aprovado por quem o criou (servidor e regra).
7. O fluxo de caixa separa título de compromisso e de previsão.
8. Todo título e toda baixa saem com os campos do contrato da seção 6; um teste varre a base.
9. O total de títulos a pagar de recebimentos bate com Σ `ENTRADA_MATERIAL` − estornos do razão de custos
   no mês (mesma origem, mesmo valor).
10. Nenhum arquivo de outro módulo foi alterado. O `git diff` só toca `fin/`, os arquivos do
    financeiro, `auth_check.js` (módulo novo) e as regras.
11. O motor roda contra a base real (13 PCs, 81 pedidos comerciais, 61 clientes, 403 fornecedores) sem
    número inválido, e esse ensaio faz parte da suíte.

---

## 13. Como trabalhar (lições que já custaram caro aqui)

- **Ensaio com a base real antes de fechar cada fase.** No Custos, o ensaio achou:
  - o tipo de movimento real (`consumo_producao`), diferente do que o código lia;
  - um lançamento de R$ 0,00 no razão;
  - "sem cadastro" virando "sem preço".

  Dezenas de asserções sintéticas não tinham pegado nenhum dos três.
- **Leia o dado, não o nome do campo.** Confirme no código que grava e na base (por exemplo,
  `shared/kardex.js` explica as duas razões do estoque). Busca por regex de `db.ref` não acha escrita
  feita por função.
- **Teste a ligação, não só a unidade:**
  - callable real contra banco simulado (modelo: `run_custos_servidor_test.js`);
  - e2e no navegador contra os emuladores, com a base real semeada.
- **Estado vazio é o estado de estreia:** toda suíte tem o caso "nenhuma NF, nenhuma baixa, nenhum
  extrato".
- **`.transaction()` nunca aborta no null** (CLAUDE.md): use `if (!atual) return atual;`.
- **Deploy = commit + push no `main`** (Vercel e Render publicam sozinhos). As regras do banco vão pela
  CLI (`--only database --project erpkuryos`), com autorização do usuário e backup das regras no ar
  antes.
- **Nunca use `git add -A`:** outro agente opera o repo.

---

## 14. Fora de escopo

- Emissão de NF-e, SPED e apuração de impostos (contador).
- Razão geral, DRE, centros de custo e orçamento (Controladoria).
- Integração bancária por API, boleto registrado e PIX automático: o OFX resolve sem custo; reavaliar
  depois.
- Folha individual: entra o total do mês.
- Multiempresa e multimoeda funcional.

---

## 15. Estado da implementação (28/10/2026)

Fases F0–F4 construídas, testadas e no ar. Nenhum módulo existente mudou: os acréscimos foram só o
módulo no menu (`auth_check.js`), a ligação no servidor (`functions/index.js`) e as regras `fin/`.

| Peça | Arquivo |
|---|---|
| Motor puro | `public/shared/financeiro.js` (cópia em `functions/`) |
| Servidor | `functions/financeiro_servidor.js`; agenda `derivarGestaoFinanceira` (5 min) e callables `finBaixar`, `finEstornarBaixa`, `finLancarTitulos`, `finDecidirLote` |
| Tela | `public/financeiro.html` + `shared/financeiro-tela.js` (8 abas: Painel, A pagar, A receber, Lote, Conciliação, Fluxo, Complementos, Cadastros) |
| Testes | `run_financeiro_test.js` (81), `run_gestao_servidor_test.js` (11), `run_gestao_rules_test.js` (47 no emulador `demo-gestao`), e2e com a base real (47) |

Decisões tomadas na construção:

- **Um título por fato, com parcelas derivadas na leitura** (como o documento com parcelas do SAP), em
  vez de um título por parcela (TOTVS SE1/SE2). Assim o título nunca muda: a condição que falta é
  informada à parte (`fin/condicoes/{título}`) e as parcelas aparecem.
- **NF = valor da nota.** A diferença entre o pedido e a nota (`percentualNF` < 100) vira complemento
  `DIFERENCA_FISCAL`, e quem decide se ela é recebível é o Financeiro (título manual).
- **Recorrente corrigido** (folha ou fixo alterado depois no Custos): nasce título de ajuste (a mais)
  ou abatimento (a menos), com a chave pelo valor novo.
- **Mês fechado na Controladoria** recusa baixa e título manual com data nele.
- Na base real de 28/10: 3 títulos a pagar dos recebimentos e 2 recebimentos sem preço (complementos).
  Só 1 dos 3 títulos tem condição de pagamento (PC-0002, "28"); os outros 2 aparecem em
  Complementos como "sem prazo".
