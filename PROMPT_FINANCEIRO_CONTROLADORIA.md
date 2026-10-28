# Prompt — Módulo Financeiro + Controladoria (Kuryos, `erpkuryos`)

> Instrução de construção para um dev sênior full stack ou um agente de código. Pode ser colado
> inteiro como prompt. Escrito em 28/10/2026, depois da entrega e da auditoria do módulo Custos e
> Resultado (`AUDITORIA_CUSTOS_20261028.md`). Todo número citado foi **medido na base real de
> `erpkuryos`** (somente leitura) nessa data.

---

## 0. Seu papel e o que se espera de você

Você é o engenheiro responsável por construir, testar e publicar o **módulo Financeiro +
Controladoria** do sistema da Kuryos. Você trabalha como um consultor de implantação de SAP/TOTVS
que conhece o chão de fábrica: lidera pela razão de negócio, decide por impacto × esforço e entrega
código real, testado e no ar — não uma especificação.

Antes de escrever código, leia nesta ordem: `CLAUDE.md`, `AGENT_STATUS.md`, este prompt,
`PLANO_CUSTOS_RESULTADO.md`, `PROMPT_CUSTOS_ERP.md`, `AUDITORIA_CUSTOS_20261028.md`. Registre seu
escopo no `AGENT_STATUS.md`. Comece cada fase rodando os motores contra a base real (seção 13).

---

## 1. O negócio, em uma página

A Kuryos é fabricante **private label** de cosméticos: ~30 clientes-marca, envase e rotulagem,
licenciada pela Anvisa. Ela vende **capacidade de fabricar o produto de outra marca**. Três coisas
decorrem disso e moldam o financeiro:

1. **Parte do material é do cliente.** O estoque tem dono (`propriedade` no lote). Material do
   cliente não é ativo da Kuryos, não gera conta a pagar e não entra no CPV.
2. **A receita é por pedido e por SKU**, com preço por vigência (`precos_venda`) ou do orçamento
   aprovado no CRM, condição de pagamento parcelada ("15/30/45/60", "20% à vista, 30/45") e
   faturamento por carga expedida.
3. **A pergunta da diretoria é margem**, não saldo: "este pedido/cliente deu dinheiro?" e "o mês
   cobriu o custo fixo?". O módulo de Custos já responde a parte de custo; o financeiro fecha a
   conta com receita, prazos e caixa.

### Mudança de decisão — leia

O `PLANO_CUSTOS.md` (14/09) decidiu **não construir financeiro transacional**. Em 28/10 o usuário
pediu o módulo. A fronteira continua a mesma para o que é **fiscal**, que fica com o contador:

| Camada | Decisão agora |
|---|---|
| Fiscal (emissão de NF-e, SPED, apuração de impostos, obrigações acessórias) | **Não construir.** O contador faz. O módulo **exporta** o que ele precisa |
| Financeiro gerencial (contas a pagar e receber, caixa, conciliação bancária, fluxo de caixa) | **Construir** |
| Controladoria (razão gerencial, centros de custo, DRE gerencial, orçamento × real, margem, fechamento) | **Construir**, sobre o módulo de Custos que já existe |

---

## 2. Restrições invioláveis

1. **Nenhuma função nova em outro módulo.** Compras, Recebimento, Comercial, Expedição/Faturamento,
   PCP e Custos **não mudam**. O financeiro **lê** os fatos que eles já gravam e deriva seus próprios
   registros. Toda lacuna (PC sem condição de pagamento, NF sem pedido, cliente sem prazo) vira uma
   **fila de complementos dentro do financeiro**, resolvida por quem opera o financeiro. Se algum dia
   for indispensável mexer fora, pare e pergunte.
2. **Partidas dobradas e documento balanceado.** Todo lançamento contábil gerencial é um documento
   com débitos = créditos, ao centavo. Documento desbalanceado é recusado pelo motor e pela regra do
   banco.
3. **Append-only.** Lançamento não se edita nem se apaga: corrige-se por **estorno** com referência
   ao original (mesmo padrão de `custos/razao`). Título baixado não volta a aberto sem estorno da baixa.
4. **Valor ausente nunca vira zero.** Título sem valor, sem vencimento ou sem cliente fica na fila de
   complementos, nunca entra no fluxo de caixa como 0 (a mesma regra `SEM_CUSTO` do módulo de Custos).
5. **Período fechado é imutável.** Depois do fechamento do mês, nada é lançado com data nele; ajuste
   vai no período aberto, referenciando o fechado (SAP: fechamento de período; TOTVS: data-base).
6. **Dinheiro em centavos inteiros** no motor (nunca float acumulado); exibição em R$. Moeda
   estrangeira guarda valor original, moeda e taxa (`config/cambio`), e a variação cambial é lançada na baixa.
7. **Idempotência por chave determinística.** O servidor deriva título e lançamento de um fato com
   chave fixa (ex.: `NF_{carga}_{nf}_p{parcela}`); rodar duas vezes não duplica (padrão de
   `prepararRazaoOps`).
8. **Integralidade.** O financeiro registra **o valor integral** de cada operação. A cobertura fiscal
   (quanto do pedido saiu em documento fiscal) é dado do pedido e aparece como conciliação para o
   contador; o módulo **não mantém caixa paralelo** nem esconde diferença.
9. **Dado sensível.** R$ e margem só para quem tem o módulo `financeiro` (ou `custos`) marcado pelo
   ADM. Salário individual não é lido: a folha entra pelo total de `custos/operacao/{mês}`.
10. **Caminhos planos** em todo `update` no RTDB (objeto aninhado apaga campos — CLAUDE.md).

---

## 3. A referência: como SAP e TOTVS fazem, e o que copiar

| Conceito de mercado | SAP | TOTVS Protheus | Aqui |
|---|---|---|---|
| Razão geral com documento balanceado | FI-GL (documento contábil, partidas dobradas) | SIGACTB (lançamentos contábeis) | `fin/lancamentos/{AAAA-MM}/{doc}` |
| Plano de contas + conta referencial do fisco | plano de contas + conta alternativa | plano de contas + plano referencial (ECD) | `fin/plano_contas` com `contaReferencial` para o export ao contador |
| Contas a pagar | FI-AP (fornecedor, vencimento, bloqueio de pagamento) | SIGAFIN — títulos a pagar (SE2) | `fin/titulos` tipo PAGAR |
| Contas a receber | FI-AR (cliente, dunning) | SIGAFIN — títulos a receber (SE1) | `fin/titulos` tipo RECEBER |
| Natureza financeira | — (conta de razão) | **Natureza financeira** (SED) | `natureza` (já existe no razão de custos: `MATERIA_PRIMA`, `EMBALAGEM`, `MAO_DE_OBRA`, `CUSTO_FIXO`…) |
| Compromisso (pedido ainda sem nota) | CO commitment / purchase order commitment | previsão financeira do pedido de compra | **compromisso** derivado do PC, fora do razão, dentro do fluxo de caixa |
| Lote de pagamento com aprovação | Payment run (F110) | Borderô de pagamento | `fin/lotes_pagamento` com aprovação de segunda pessoa |
| Compensação (clearing) | compensação de partidas em aberto | baixa / compensação entre carteiras | baixa total/parcial com juros, multa, desconto |
| Conciliação bancária | Electronic Bank Statement | conciliação bancária (SE5 × extrato) | importar **OFX** do banco e casar com baixas |
| Fluxo de caixa | Cash Management / Liquidity Forecast | fluxo de caixa por natureza | realizado + projetado (títulos, compromissos, previsões) |
| Centro de custo | CO-CCA | centro de custo (CTT) | `fin/centros_custo`: linhas, manipulação, rotulagem, logística, qualidade, comercial, ADM |
| Custo do produto | CO-PC | SIGACUS | **já existe**: `public/shared/custos.js` (ficha padrão, LP) |
| Margem por cliente/produto | CO-PA | Controladoria — rentabilidade | **reaproveitar** `CustosRealizado.consolidar` + receita das NFs |
| Orçamento × real | CO planning / FM | SIGAPCO (planejamento e controle orçamentário) | `fin/orcamento/{ano}` por conta × centro × mês |
| Fechamento de período | period-end closing (cockpit) | fechamento contábil / data-base | checklist + trava do mês |

Copie os **conceitos** (documento balanceado, natureza, compromisso, compensação, borderô, fechamento),
não a complexidade: uma empresa, um CNPJ, poucos bancos, uma moeda funcional (BRL).

---

## 4. O que já existe e o módulo vai ler (medido em 28/10/2026)

Nenhum destes nós muda. O financeiro só lê.

| Fonte | Nó | O que tem | Vira no financeiro |
|---|---|---|---|
| Pedido de Compra | `pedidos_compra/{pc}` | 16 PCs (13 não cancelados); itens com `custoTotalNaDecisao`, `precoUnit`, `unidadeCotada` × `unidade` (cuidado: erro de 11,67× — use `Custos.custoUnitarioItemPC`); `condicaoPagamento` ("28"), `prazoPagamentoParcelas` ([28]), `frete {tipo, valor}`, `dataEmissao`, `propriedade` (remessa do cliente) | **compromisso** a pagar (fluxo de caixa projetado) |
| Recebimento | `pedidos_compra/{pc}/recebimentos/{rec}` + lotes com custo (desde 26/10) | `data`, `notaFiscal`, linhas com quantidade; lote com `custoUnitario`, `custoFonte` | **título a pagar** efetivo (parcelas pela condição do PC, base = data do recebimento/NF) + lançamento D Estoque / C Fornecedores |
| Cancelamento/devolução do recebimento | `.../recebimentos/{rec}/status`, `/devolucoes` | já estornam o razão de custos | estorno/abatimento do título |
| Cotação de Compras | `processos_cotacao` | 13 (5 decididas): frete, validade, condição | prazo e frete esperados do compromisso |
| Pedido comercial | `pedidos_comerciais/{k}` | 81 pedidos; `totalValor` em 30 (R$ 3,89 mi somados), `prazoPagamento` em 23, itens com `valorUnitario`, `percentualNF` (100 em 4, 50 em 13, 10 em 2) | **previsão** a receber (projeção) + base da conciliação fiscal |
| Pedido no PCP | `pedidos/{k}` | 379; `valorUnitario` em 114 | preço do pedido quando o comercial não tem |
| Preço de venda | `precos_venda/{sku}/vigencias` | 110 SKUs com vigência | preço de referência |
| Orçamento do CRM | `erp/kuryos/crm_propostas` | preço aprovado, condição, câmbio congelado | receita esperada de SKU do CRM |
| Faturamento | `agendamentos_expedicao/{carga}/faturamento/nfs/{nf}` | `numero`, `serie`, `chaveNfe`, `valor`, `emitidaEm`, itens com `precoUnitario` (estrutura pronta; vazio no `erpkuryos` até a virada) | **título a receber** (parcelas pela condição do pedido/cliente) + lançamento D Clientes / C Receita; deduções estimadas |
| Cliente | `clientes/{k}` | 61; `cnpj` 52, `uf` 50, `condicaoPagamento` 9 | prazo padrão, UF para imposto |
| Fornecedor | `fornecedores/{k}` | 403; `cnpj` 395, `condicaoPagamento` 1 | cadastro do favorecido |
| Câmbio | `config/cambio/usd_brl` | atualizado a cada 15 min pelo Render | taxa de título em US$ e variação cambial |
| Razão de custos | `custos/razao/{mês}` | append-only: `ENTRADA_MATERIAL`, `CONSUMO_MATERIAL`, `HORA_PRODUCAO`, `PERDA`, `ESTORNO`, com natureza e procedência | lançamentos de produção (PEP, PA, CPV) **sem recalcular** |
| Operação do mês | `custos/operacao/{mês}` | folha da produção (total), fixos com rateio PRODUÇÃO/ADMINISTRATIVO | títulos recorrentes + despesa/CIF do mês |
| Fichas e taxas congeladas | `custos/fichas/{mês}`, `custos/taxas/{mês}` | custo padrão por SKU e taxas por competência | CPV padrão quando não houver realizado |
| Bônus | `resultado/fechamentos/{mês}` | bônus do mês, `bonusValendo` | título de PLR a pagar (só se valendo) |
| Parâmetros | `custos/parametros` | % de impostos padrão e por cliente | dedução estimada da receita |

**Situação honesta dos dados:** a última OP é de 21/09; não há NF de saída nem baixa nenhuma no
`erpkuryos`; só 13 PCs. O módulo precisa nascer útil com pouco dado (fila de complementos, cadastro
de saldo inicial de bancos e de títulos em aberto por importação de planilha) e crescer com a virada.

---

## 5. Arquitetura

Mesmo desenho do módulo de Custos, que já foi auditado:

- **Motor puro** `public/shared/financeiro.js` (UMD, cópia byte a byte em `functions/`): derivação
  de títulos e lançamentos a partir dos fatos, parcelamento, baixa e compensação, fluxo de caixa,
  aging, DRE gerencial, orçamento × real, conciliação OFX, fechamento. Sem banco e sem DOM.
- **Servidor** (Render, `functions/financeiro_servidor.js` ligado no `index.js`): escutas
  persistentes nos nós da seção 4 (só baixa a diferença — reler tudo a cada rodada estoura a cota do
  RTDB), agenda `every 5 minutes` que deriva títulos/lançamentos novos de forma idempotente, e
  callables para baixa, lote de pagamento, conciliação e fechamento. O agendador do Render só entende
  `every N minutes`: tarefa mensal roda na primeira passada do mês.
- **Telas**: `public/financeiro.html` + `shared/financeiro-tela.js`. A controladoria entra como abas
  da tela de Custos (`custos.html`), não como tela nova: DRE gerencial, centros de custo, orçamento.
- **Acesso**: módulo `financeiro` em `KURYOS_MODULOS` (checkbox do ADM, sem papel novo — papel novo
  custa cinco pontas). Regras `fin/` só para ADM, módulo `financeiro` ou `custos`.

---

## 6. Modelo de dados (nós novos, todos em `fin/`)

```
fin/plano_contas/{conta}            codigo, nome, tipo (ATIVO|PASSIVO|PL|RECEITA|DEDUCAO|CUSTO|DESPESA),
                                    natureza, contaReferencial (ECD, para o contador), ativa
fin/centros_custo/{cc}              nome, tipo (PRODUTIVO|APOIO|ADMINISTRATIVO|COMERCIAL), linhaPcp?
fin/contas_bancarias/{banco}        nome, agencia, conta, saldoInicial (centavos), dataSaldoInicial
fin/titulos/{id}                    tipo (PAGAR|RECEBER), origem {tipo: RECEBIMENTO|NF_SAIDA|OPERACAO|BONUS|MANUAL|IMPORTACAO, ref},
                                    parceiro {tipo, key, nome, cnpj}, documento (NF), parcela "1/4",
                                    emissao, vencimento, valorCentavos, moeda, taxaCambio, natureza, centroCusto,
                                    status (ABERTO|PARCIAL|BAIXADO|ESTORNADO|BLOQUEADO), saldoCentavos,
                                    baixas/{id}: {data, valor, juros, multa, desconto, conta, loteKey?, conciliacaoKey?, estornadaPor?}
fin/compromissos/{id}               PC sem nota / pedido comercial sem faturar: valor previsto, data prevista,
                                    origem; nunca vira lançamento contábil
fin/lancamentos/{AAAA-MM}/{doc}     data, historico, origem {tipo, ref}, partidas: [{conta, cc?, debito, credito}],
                                    estornaDoc?, criadoEm, criadoPor, versaoMotor      (append-only, balanceado)
fin/lotes_pagamento/{id}            títulos, total, criadoPor, aprovadoPor (≠ criadoPor), status, exportadoEm
fin/extratos/{banco}/{id}           linhas importadas do OFX (FITID único), conciliadoCom
fin/orcamento/{ano}/{conta}/{cc}/{mm}  valor em centavos
fin/fechamentos/{AAAA-MM}           checklist, fechadoEm, fechadoPor, totais da DRE
fin/complementos/{id}               lacuna achada na derivação (sem vencimento, sem cliente, NF sem pedido…), resolvida aqui
```

---

## 7. Derivação: fato existente → registro do financeiro

| Fato (nó lido) | Quando | Gera | Lançamento (D / C) |
|---|---|---|---|
| PC `ENVIADO`/`RECEBIDO_PARCIAL` sem recebimento | ao aparecer | compromisso a pagar (parcelas pela condição) | nenhum (pedido não é fato contábil) |
| Recebimento `ATIVO` de material da Kuryos | ao aparecer | título(s) a pagar; consome o compromisso | D Estoque MP/Embalagem (natureza do material) / C Fornecedores — **valor do lote do razão de custos** |
| Recebimento de material do **cliente** (`custoFonte: CLIENTE`) | — | nada | nada (não é ativo da Kuryos) |
| Cancelamento / devolução do recebimento | ao aparecer | estorno / abatimento do título | estorno do documento (parcial na devolução) |
| Frete FOB com valor | no recebimento | título a pagar ao transportador (natureza FRETE) | D Estoque (custo de aquisição) / C Fornecedores |
| `custos/razao` CONSUMO_MATERIAL / HORA_PRODUCAO / PERDA da OP | ao aparecer | — | D Produção em processo / C Estoque MP; D PEP / C MOD aplicada; D Perdas / C PEP |
| OP concluída | com o razão da OP | — | D Estoque PA (custo da OP) / C PEP |
| NF de saída registrada na carga | ao aparecer | título(s) a receber pela condição do pedido (ou do cliente) | D Clientes / C Receita; D Deduções / C Impostos estimados a recolher (% de `custos/parametros`); D CPV / C Estoque PA (custo médio do PA pelo razão; sem ele, ficha padrão do mês, marcado PADRAO) |
| Pedido comercial liberado sem NF | ao aparecer | previsão a receber (compromisso) | nenhum |
| `custos/operacao/{mês}` salva | na competência | títulos recorrentes (folha, cada fixo) com o vencimento padrão do parâmetro | D CIF/Despesa (pelo rateio) / C Salários e Fornecedores a pagar; diferença entre MOD aplicada e folha = **variação de absorção** |
| `resultado/fechamentos/{mês}` com `bonusValendo` | ao fechar | título de PLR | D Despesa com PLR / C PLR a pagar |
| Baixa (manual, lote ou conciliação) | ao confirmar | — | D Fornecedores / C Banco (pagar); D Banco / C Clientes (receber); juros, multa, desconto e variação cambial em contas próprias |

Cada linha desta tabela é uma função pura testada; o servidor só aplica o que ela devolve.

---

## 8. Motor (funções puras, `financeiro.js`)

- `parcelas(condicao, base, valorCentavos)`: lê "28", "15/30/45/60", "20% A VISTA, 30/45"; a
  última parcela absorve o arredondamento; condição ilegível → `{ok:false, motivo}` (vira complemento).
- `derivarTitulosRecebimento`, `derivarTitulosNfSaida`, `derivarRecorrentes`, `derivarCompromissos`:
  fato → títulos com chave determinística.
- `documentoBalanceado(partidas)` e `lancamentosDe(fato)`: devolve documento ou recusa.
- `baixar(titulo, baixa)`: parcial, juros/multa/desconto, variação cambial; nunca saldo negativo.
- `conciliarOfx(extrato, baixas, titulos)`: casa por valor + data ± N dias + documento; o que não
  casa fica para decisão humana (nunca "casa o mais próximo" sozinho).
- `fluxoDeCaixa({saldos, titulos, compromissos, previsoes, recorrentes}, horizonte)`: realizado +
  projetado por semana, por natureza; compromisso e previsão aparecem separados do título.
- `aging(titulos, data)`: a vencer / vencidos 1–30 / 31–60 / 61–90 / >90; PMR, PMP e ciclo de caixa.
- `dre(lancamentos, competencia)`: receita → deduções → receita líquida → CPV → **margem de
  contribuição** (deve fechar com Σ LP realizado do módulo de Custos — teste de consistência) → CIF e
  ociosidade → despesas ADM e comerciais → resultado operacional gerencial.
- `orcamentoXReal(orcamento, lancamentos)`: por conta × centro × mês, com variação e %.
- `checklistFechamento(mes, base)`: NF sem título, recebimento sem título, razão da OP pendente,
  folha não lançada, extrato não conciliado, complementos abertos. Fecha só com tudo verde (o ADM
  pode forçar com justificativa registrada).
- `exportarContador(mes)`: CSV de lançamentos por conta referencial, títulos e NFs do mês.

---

## 9. Telas

**Financeiro** (`financeiro.html`), abas:
1. **Painel**: saldo por banco, a pagar e a receber da semana, vencidos, fluxo de 13 semanas, PMR/PMP.
2. **A pagar** e **A receber**: títulos com filtros, aging, baixa (individual e parcial), anexo do
   comprovante pela origem, bloqueio de pagamento com motivo.
3. **Lote de pagamento**: seleciona títulos, total do dia contra o saldo, aprovação por **outra
   pessoa** (segregação de funções), exporta a lista.
4. **Conciliação bancária**: importa OFX, sugere pares, confirma; o que sobra vira baixa ou título novo.
5. **Fluxo de caixa**: realizado × projetado; compromissos e previsões em tom diferente do título.
6. **Complementos**: tudo que a derivação não conseguiu completar (sem vencimento, sem condição,
   NF sem pedido, cliente sem CNPJ), com a ação para resolver ali mesmo.
7. **Cadastros do financeiro**: plano de contas (semeado; editável), centros de custo, bancos, saldo
   inicial, vencimento padrão de folha e fixos, importação de títulos em aberto por planilha.

**Controladoria** (abas novas em `custos.html`): DRE gerencial por mês (com a margem de
contribuição batendo com o LP realizado), centros de custo, orçamento × real, rentabilidade por
cliente/pedido/SKU (CO-PA = `consolidar` do realizado + receita da NF), fechamento do mês com o checklist.

---

## 10. Segurança

- Regras `fin/`: leitura e escrita só ADM ou módulo `financeiro`; `fin/lancamentos` e `fin/titulos`
  só o servidor grava (o cliente chama callable); `fin/fechamentos/{mês}` trava lançamento com data no
  mês; lote de pagamento recusa `aprovadoPor == criadoPor`.
- Teste de regras no emulador com `--project demo-financeiro` (sem isso o teste de negação passa sem testar).
- Extrato e conta bancária são o dado mais sensível do módulo: nunca no placar, nunca para o PCP.

---

## 11. Fases (cada uma publicada e útil sozinha)

| Fase | Entrega | Depende de |
|---|---|---|
| F0 | Plano de contas, centros de custo, bancos e saldo inicial; importação de títulos em aberto por planilha; módulo `financeiro` e regras | nada |
| F1 | Contas a pagar a partir dos recebimentos (com o custo do lote) e da operação do mês; baixa manual; fila de complementos | F0 |
| F2 | Contas a receber a partir das NFs de saída; aging; PMR | F0 + faturamento operando no `erpkuryos` |
| F3 | Fluxo de caixa realizado × projetado (compromissos de PC, previsões de pedido, recorrentes) | F1 |
| F4 | Conciliação OFX e lote de pagamento com aprovação | F1 |
| F5 | Razão gerencial completo (produção via razão de custos), DRE gerencial, CO-PA | F1 + F2 |
| F6 | Orçamento × real, fechamento com checklist e trava, export ao contador | F5 |

---

## 12. Critérios de aceite

1. Com o banco vazio de NF e de baixas, nenhuma tela mostra NaN, Infinity ou total falso; os vazios dizem por quê.
2. Todo documento de `fin/lancamentos` fecha débito = crédito ao centavo; um teste varre a base.
3. Rodar a derivação duas vezes não cria título nem lançamento duplicado.
4. Material do cliente nunca gera título a pagar nem lançamento de estoque.
5. Condição de pagamento ilegível ou ausente vira complemento, não título com vencimento inventado.
6. Cancelar/devolver recebimento estorna (nunca apaga) e o título reflete o abatimento.
7. Mês fechado recusa lançamento com data nele, pela regra do banco e pelo servidor.
8. Lote de pagamento não é aprovado por quem o criou.
9. A margem de contribuição da DRE do mês bate com Σ LP realizado das OPs faturadas (tolerância de centavos); divergência aparece explicada.
10. O fluxo de caixa separa título (fato) de compromisso e previsão (expectativa).
11. Nenhum arquivo de outro módulo foi alterado (o `git diff` da entrega só toca `fin/`, telas e motores do financeiro, `custos.html` nas abas da controladoria, `auth_check.js` no módulo novo e as regras).
12. O motor roda contra a base real (13 PCs, 81 pedidos comerciais, 61 clientes, 403 fornecedores) sem número inválido, e esse ensaio faz parte da suíte.

---

## 13. Como trabalhar (lições que já custaram caro aqui)

- **Ensaio com a base real antes de fechar cada fase.** No MRP e no Custos, o ensaio achou defeitos
  que dezenas de asserções sintéticas não pegaram (sentinela vazando na tela, motivo "sem cadastro"
  virando "sem preço", lançamento de R$ 0,00 no razão).
- **Teste a ligação, não só a unidade:** callable real contra banco simulado (veja
  `run_custos_servidor_test.js`) e e2e no navegador contra os emuladores com a base real semeada.
- **Estado vazio é o estado de estreia:** toda suíte tem o caso "nenhuma NF, nenhuma baixa, nenhum extrato".
- **Unidade e moeda viajam com o valor.** Preço por kg cotado × quantidade em rolo já deu erro de 11,67×.
- **Deploy = commit + push no `main`** (Vercel e Render publicam sozinhos); regras do banco pela CLI
  (`--only database --project erpkuryos`), com autorização do usuário e backup das regras no ar antes.
- **Nada de `git add -A`.** Outro agente opera o repo; commite só os seus arquivos.

---

## 14. Fora de escopo

- Emissão de NF-e, SPED, apuração de ICMS/PIS/COFINS/IPI, obrigações acessórias (contador).
- Integração bancária por API, boleto registrado e PIX automático (o OFX resolve sem custo; reavaliar depois).
- Folha de pagamento individual (o RH não está populado; entra o total do mês).
- Multiempresa, multimoeda funcional, consolidação societária.
