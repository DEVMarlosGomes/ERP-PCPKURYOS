# Financeiro — Fase 0: análise de lacunas e plano (10/11/2026)

Execução do `docs/prompt-financeiro.md` no financeiro deste repositório. Esta fase não altera código;
ela entrega o diagnóstico e o plano para aprovação.

## 1. Ponto de partida

O financeiro já existe e está no ar desde 28/10/2026 (`PROMPT_FINANCEIRO.md`, §15):

| Peça | Onde | Estado |
|---|---|---|
| Motor puro (condição de pagamento, parcelas, derivação, baixa, estorno, aging, PMR/PMP, fluxo, OFX) | `public/shared/financeiro.js` (cópia em `functions/`) | 126 asserções passando hoje |
| Servidor (agenda de 5 min que deriva títulos; callables `finBaixar`, `finEstornarBaixa`, `finLancarTitulos`, `finDecidirLote`) | `functions/financeiro_servidor.js` + `functions/index.js` | 12 casos passando hoje |
| Tela com 8 abas: Painel, A pagar, A receber, Lote de pagamento, Conciliação, Fluxo de caixa, Complementos, Cadastros | `public/financeiro.html` + `shared/financeiro-tela.js` | no ar |
| Regras `fin/` (só o servidor grava títulos e baixas; lote exige aprovador diferente de quem criou) | `database.rules.json` | publicadas |

**Limite desta análise.** O prompt cita duas transcrições de vídeo (12min33s e 3min03s) como fonte da
verdade, mas o anexo não veio. O diagnóstico abaixo usa o escopo declarado no prompt e o código. O
comportamento detalhado do WebMais (telas, campos, filtros, relatórios exatos) depende das transcrições;
ver as perguntas da seção 5.

## 2. Requisitos do prompt contra o que existe

| Requisito | Existe | Lacuna |
|---|---|---|
| **NF de entrada por XML** | Não. O título a pagar nasce do recebimento contra o PC, com o **número** da NF digitado. Não há leitura de XML, chave de acesso nem duplicatas da nota. | **Total.** Ver F5. |
| **Contas a pagar** | Sim: derivado do recebimento (valor do lote × quantidade, parcelas pela condição do PC), frete FOB, folha e fixos do mês, PLR; título manual e importação por planilha; baixa parcial com juros, multa, desconto e variação cambial; bloqueio; lote com aprovação. | Vencimento e valor oficiais das duplicatas da NF (hoje vêm da condição do PC, presente em só 3 de 13 PCs). Resolve com a F5. |
| **Contas a receber** | Sim: título pela NF registrada na carga, parcelas pela condição do pedido ou do cliente, previsão pelos pedidos sem faturar, aging e PMR. | Depende do faturamento operar no `erpkuryos` (estrutura pronta, ainda vazia). Sem lacuna de código conhecida antes das transcrições. |
| **Caixas e bancos** | Parcial: cadastro de conta com saldo inicial; o saldo se move **só por baixa de título**. | Sem conta do tipo **caixa** (dinheiro); sem **transferência** entre contas; sem lançamento direto de tarifa, rendimento ou IOF (hoje exige criar um título e baixar); sem **extrato da conta** com saldo dia a dia. Ver F6. |
| **Fluxo de caixa** | Sim: 13 semanas, realizado × projetado, título separado de compromisso e previsão. | Visão **diária** e **mensal** (hoje só semanal), por conta e por natureza. Ajuste dentro da F7. |
| **Demonstrativo de fluxo de caixa (DFC)** | Não. | **Total.** Ver F7. |
| **Relatórios financeiros** | Só na tela; nenhuma exportação. | **Total:** títulos por período, parceiro e situação; baixas; aging; extrato; DFC, em CSV para Excel e em impressão. Ver F8. |
| DRE por competência e vínculo por lote (fora de escopo) | A Controladoria já tem DRE; o título já guarda `competencia`, `natureza` e `centroCusto`, e o título do recebimento sabe o lote. | Nada a fazer: o modelo já está preparado. |

### Regras de trabalho do prompt contra o código atual

| Regra | Situação |
|---|---|
| 6. Decimal, nunca ponto flutuante; centavo na última parcela | **Atende.** Tudo em centavos inteiros (`valorCentavos`) e a última parcela absorve a diferença (testado). |
| 7. Baixa, estorno e geração em transação; nada de exclusão física | **Parcial.** Nada se apaga (o estorno é uma baixa inversa com autor e data) e cada gravação é um único update atômico. Mas **a leitura do saldo e a gravação não são serializadas**: duas baixas simultâneas no mesmo título podem ler o mesmo saldo e pagar além do devido. Ver F5.0. |
| 8. Fuso de São Paulo, dd/mm/aaaa, R$ com vírgula | **Atende** na tela (`dataBR`, `brl` pt-BR, hoje em UTC−3). |
| 5. Uma fase por vez, migrations reversíveis | Banco sem schema (RTDB): cada fase só **acrescenta** nós e campos. Reverter é parar de ler; nada existente é reescrito. |

## 3. Plano proposto

Segue a mesma arquitetura do módulo, já auditada: motor puro + servidor + tela. A restrição de 28/10
continua valendo: **nenhum outro módulo muda** (Compras, Recebimento, Comercial, Faturamento ficam
como estão; o financeiro só lê). Cada fase sai publicada e útil sozinha.

### F5.0 — Baixa serializada (correção, pequena)
- Baixa, estorno, lote e título manual passam pela fila do processo já usada nas operações críticas
  (`functions/transacao_raiz.js`): leitura fresca + validação + gravação, uma de cada vez.
- Teste: duas baixas simultâneas que somadas passam do saldo; a segunda é recusada.

### F5 — NF de entrada por XML
- Aba nova **Notas de entrada**: o financeiro envia o XML da NF-e, um ou vários de uma vez.
- O motor lê:
  - emitente (CNPJ, nome), número, série e **chave de acesso**;
  - emissão, valor total, frete, desconto e impostos destacados;
  - itens;
  - **duplicatas** (`cobr/dup`: número, vencimento, valor).
- Casamento automático:
  - fornecedor pelo CNPJ;
  - PC e recebimento pelo CNPJ + número da NF.
- Título a pagar:
  - **as duplicatas da nota passam a ser as parcelas oficiais**, no lugar da condição do PC;
  - sem duplicata, vale a condição do PC, e na falta dela vira complemento;
  - a nota que casa com o recebimento **não gera um segundo título**: complementa o que já existe
    (vencimentos, chave, valor oficial).
- **Divergências viram complemento**, nunca ajuste silencioso:
  - valor da nota ≠ valor do recebimento;
  - fornecedor não cadastrado;
  - nota sem PC (serviço, conta de consumo): decisão humana de lançar como título manual;
  - XML repetido: a chave de acesso é única, então não duplica.
- **Fica de fora, de propósito:** o XML não dá entrada no estoque. A entrada continua só pelo
  recebimento, que é a regra do sistema (CLAUDE.md, "Dia D").
- Testes:
  - motor com XMLs reais de fornecedores da Kuryos;
  - casamento, divergências e repetição;
  - tela.

### F6 — Caixas e bancos
- Conta com **tipo**: banco, caixa (dinheiro) ou aplicação.
- **Movimento avulso** (`fin/movimentos`), via callable, com natureza e estorno:
  - tarifa, rendimento, IOF, juros bancários;
  - suprimento e sangria de caixa.
- **Transferência entre contas**: um par débito/crédito com a mesma chave, gravado junto e estornado junto.
- **Extrato da conta**: saldo inicial + baixas + movimentos, dia a dia, com saldo acumulado.
- A conciliação OFX passa a oferecer "lançar como tarifa/rendimento" além de "baixa" e "título novo".
- Testes: saldo com transferência e estorno; caixa negativo (ver pergunta 5).

### F7 — Fluxo de caixa e DFC
- Fluxo com granularidade **diária / semanal / mensal**, filtro por conta e por natureza.
- **DFC pelo método direto**, realizado por mês:
  - cada natureza mapeada a uma atividade (operacional, investimento, financiamento) em
    `fin/parametros`;
  - saldo inicial + entradas − saídas = saldo final, conferido contra o extrato das contas.
- Testes: DFC fecha com os saldos bancários do mês; natureza sem mapeamento aparece em linha própria,
  nunca some.

### F8 — Relatórios
- Títulos a pagar e a receber (por período de vencimento ou emissão, parceiro, situação, natureza).
- Baixas do período, aging, extrato por conta, DFC e fluxo.
- **CSV para Excel** (separador `;`, vírgula decimal, datas dd/mm/aaaa, UTF-8 com BOM) e versão para
  impressão.
- Testes: o total do CSV bate com o total da tela.

**Ordem sugerida:** F5.0 → F5 → F6 → F7 → F8. A F5 é a que mais muda a rotina: hoje as duplicatas são
digitadas à mão, ou ficam sem vencimento porque o PC não tem condição.

## 4. Pendências que não são de código
- Bancos e saldos iniciais cadastrados em `fin/contas_bancarias`: não foi possível conferir a base
  hoje, porque o login do Firebase CLI desta máquina está inválido.
- Faturamento ainda não opera no `erpkuryos`: sem NF de saída, o a receber fica só na previsão.
- Só 3 de 13 PCs têm condição de pagamento. A F5 contorna, porque as duplicatas trazem o vencimento.

## 5. Perguntas (respostas mudam o plano)
1. **Transcrições dos vídeos:** o anexo não veio. Há algo no WebMais que este plano não cobre (tela,
   filtro, relatório específico)?
2. **XML de quem:** o financeiro baixa o XML do portal/e-mail do fornecedor, ou a Logística já recebe
   o XML no recebimento? Se for a Logística, o XML pertence ao Recebimento, o que fere a restrição de
   não mexer em outro módulo e pede decisão sua.
3. **Nota sem PC** (energia, aluguel, serviço): vira título direto pelo XML, ou continua manual?
4. **Divergência de valor** entre a nota e o recebimento: vale a nota (fiscal) e a diferença fica como
   complemento? Proposta conservadora: sim.
5. **Caixa físico** pode ficar negativo? Proposta conservadora: não; o lançamento é recusado.
6. **Relatórios do WebMais** que o financeiro usa toda semana: quais? Para a F8 sair igual à rotina.
7. **Plano de contas do DFC:** existe um mapeamento de naturezas (ou contas do contador) que o DFC deve
   seguir, ou a proposta de três atividades basta?

## 6. Próximo passo
Aprovar (ou ajustar) o plano e responder às perguntas 2 a 5. A F5.0 pode começar já, porque não depende
de nenhuma resposta.

## 7. Execução (10/11/2026)

Todas as fases do plano foram entregues, cada uma em branch própria e com testes:

| Fase | Commit | Testes |
|---|---|---|
| F5.0 — baixa, estorno, títulos e lote em fila única | `a846d91` | `run_financeiro_fila_test` (8) |
| F5 — NF de entrada por XML | `5d02c5e` | `run_financeiro_nf_xml_test` (54) e tela (17) |
| F6 — caixas e bancos | `4cbf613` | `run_financeiro_bancos_test` (39) e tela (11) |
| F7 — fluxo por período e DFC; reconciliação de Bancos | `7aa63f4` | `run_financeiro_dfc_test` (34) e tela (12) |
| F8 — relatórios (CSV para Excel e impressão) | branch `financeiro/f8-relatorios` | `run_financeiro_relatorios_test` (69) e tela (18) |

As perguntas 2 a 5 seguiram as opções conservadoras: o XML é enviado pelo Financeiro; nota sem pedido vira título manual preenchido pela nota; na divergência vale o valor do título e a diferença vai para Complementos; o caixa físico não fica negativo.

Ainda depende das transcrições ou dos prints do WebMais: conferir se os relatórios e filtros reproduzem a rotina semanal do financeiro (pergunta 6) e se o DFC deve seguir um plano de contas do contador (pergunta 7).

## 8. WebMais × Financeiro (12/11/2026)

O mapeamento da tela do WebMais (vídeo curto + narração) respondeu a pergunta 6. O que já existia
foi conferido; o que faltava e só **lê** os dados entrou como Entrega A. O que **grava** ficou para a
Entrega B, com spec próprio (`MELHORIAS_FUTURAS.md`, "Financeiro × WebMais").

| WebMais | Aqui | Situação |
|---|---|---|
| Caixas e Bancos › Demonstrativo de fluxo de caixa | Relatórios › Demonstrativo de fluxo de caixa (F7) | já existia |
| › Espelho de caixa diário | Relatórios › Espelho de caixa diário (`relEspelhoDiario`) | **novo** |
| › Extrato por período | Relatórios › Extrato da conta (F6/F8) | já existia |
| › Fluxo de caixa previsto | Relatórios › Fluxo de caixa previsto (F7) | já existia |
| › Fluxo de caixa realizado/previsto | Relatórios › Realizado × previsto (`relRealizadoPrevisto`) | **novo** |
| › Gastos elemento/centro de custo | Relatórios › Gastos por centro de custo e elemento (`relGastosCentroCusto`); centro de custo no título manual | **novo** |
| › Lançamento bancário | Relatórios › Lançamentos bancários (`relMovimentos`), filtros de conta de origem, conta destino e tipo | **novo** |
| › Saldo das contas; "movimentação por conta" | Relatórios › Saldo das contas (`relSaldosContas`) | **novo** |
| Cheques a receber / a pagar | — | adiado (carteira nova) |
| A pagar › Adiantamento de fornecedores; A receber › Adiantamento de clientes | — | Entrega B |
| A pagar › Ordem de pagamento (consulta/emissão) | A pagar (título manual) + Lote de pagamento com aprovação | já existia |
| A pagar › Importação folha de pagamento | Operação do mês (Custos) → título de folha; planilha de abertura | já existia |
| A pagar › Lançamento de despesas | Título manual + Relatórios › Lançamento de despesas (`relLancamentoDespesas`: usuário, centro, natureza, situação) | **novo** (relatório) |
| A pagar / A receber › Renegociação | — | Entrega B |
| A pagar › Evolução de pagamento | Relatórios › Evolução de pagamento / de recebimento (`relEvolucao`) | **novo** |
| A pagar › Fornecedores em aberto; A receber › Clientes em aberto | Relatórios › Fornecedores / Clientes em aberto (`relEmAberto`), com a posição de vencimento | **novo** |
| A receber › Cancelamento de OR em lote | — | Entrega B |
| A receber › Ordem de recebimento, manutenção de OR e de movimento | A receber (título manual) + estorno de baixa (nada se edita) | já existia |
| A receber › Dedução e reembolso de comissão | — | adiado (sem comissão na base) |
| A receber › Remessa / remessa bancária | — | fora (`PROMPT_FINANCEIRO.md` §14) |
| A receber › Cálculo de antecipação | Relatórios › Cálculo de antecipação (`relAntecipacao`) | **novo** |
| A receber › Composição de vencimentos | Relatórios › Composição de vencimentos (`relComposicaoVencimentos`) | **novo** |
| A receber › Conciliação de clientes | Relatórios › Conciliação de clientes / fornecedores (`relConciliacaoParceiros`) | **novo** |
| A receber › Conta corrente p/ cliente | Relatórios › Conta corrente do cliente / fornecedor (`relContaCorrente`) | **novo** |
| Narração: principais fornecedores, filtro por categoria (matéria-prima) | Relatórios › Principais fornecedores / clientes, curva ABC e filtro de natureza (`relRanking`) | **novo** |
| Narração: prazo médio de recebimento e de pagamento | Relatórios › PMR / PMP por período e por parceiro (`relPrazosMedios`) | **novo** |

Decisões da construção:
- **Recebimento com mais de uma natureza** (matéria-prima e embalagem no mesmo PC) é dividido na
  proporção dos itens (`porNatureza`), em centavos inteiros. Assim o filtro "matéria-prima" pega só
  a parte de matéria-prima.
- **O mesmo parceiro com o nome escrito diferente** soma pelo CNPJ.
- **Subtotal nunca entra numa coluna que se soma.** Ele tem coluna própria, e o total do CSV continua
  igual à soma das linhas.
- **Centro de custo:** a lista padrão é a mesma da Controladoria (o teste confere), mais os centros
  cadastrados lá. A leitura de `ctl/centros_custo` foi liberada para o módulo `financeiro`, só
  leitura. O motor recusa código fora do formato da Controladoria.

Testes: `run_financeiro_relatorios_webmais_test.js` (1.082 asserções),
`run_financeiro_relatorios_webmais_ui_test.js` (48, Chrome) e `run_gestao_rules_test.js` (51, emulador),
mais o ensaio contra o retrato da base de 11/11, sem número inválido.

## 9. Entrega B e F9 (12–13/11/2026)

**Entrega B** (spec `docs/superpowers/specs/2026-11-12-financeiro-entrega-b-design.md`, plano
`docs/superpowers/plans/2026-11-12-financeiro-entrega-b.md`):
- **Adiantamento a fornecedor e de cliente.** O dinheiro sai ou entra na hora e depois compensa os
  títulos do mesmo parceiro (pelo CNPJ). Estorno só sem compensação.
- **Renegociação.** O saldo dos originais é abatido e nasce um título novo, com acréscimo e desconto
  separados. Dá para desfazer enquanto o título novo não tiver baixa. Título bloqueado não se renegocia.
- **Cancelamento em lote.** Vale para a receber e para a pagar manual ou de abertura. Engano desfaz a
  receita ou a despesa; incobrável vira perda com clientes. Dá para desfazer.
- **Controladoria.** Contas novas: `ADIANT_FORNECEDORES` 1.1.4, `ADIANT_CLIENTES` 2.1.6 e
  `PERDAS_CLIENTES` 5.1.4.
- **Achado do ensaio na base real.** A reconciliação de Fornecedores explicava só o **saldo aberto**
  do recebimento anterior ao custo no lote. Pagar, compensar ou renegociar esse título deixava a
  diferença sem explicação, o que trava o fechamento. Agora a explicação é o valor menos as devoluções.

**F9**, reconstruída. O patch `financeiro-f9-liquidacao-elementos.patch` (`a19ab85`) não existe nesta
máquina nem no GitHub. Spec: `docs/superpowers/specs/2026-11-12-financeiro-f9-design.md`.
- **Liquidação por filtro.** Atalhos "Hoje e amanhã", "Esta semana" e "Vencidos"; filtros de
  fornecedor e de elemento; marcar todas; pagar ou receber; quadro "Movimento de dd/mm".
- **Plano de elementos.** 27 propostos, com os códigos do vídeo, editáveis em Cadastros.
- **Classificar título.** Elemento, rateio entre centros e forma de pagamento. O título manual já
  nasce com elemento e forma.
- **Na Controladoria,** o título manual lança pela natureza do elemento, rateado por centro. Na
  base real, os 21 lançamentos existentes saem idênticos: nenhum relançamento.
- **Aberturas.** DFC por grupo › subgrupo › elemento e fluxo de caixa aberto por tipo de conta.
- **Relatórios.** Gastos por elemento › centro, com filtro de elemento; despesas com elemento e
  forma de pagamento.

**Situação do mapeamento** (`financeiro-mapeamento-auditoria.md`, 78 funções) depois disto:

| Situação | Antes | Agora |
|---|---:|---:|
| Coberto | 34 | 40 |
| Coberto em parte | 22 | 22 |
| Não coberto | 13 | 7 |
| Fora do escopo | 5 | 5 |
| Não verificado | 4 | 4 |

- **Passaram a coberto:** CB-01, CP-01 e RC-01 (adiantamento); CP-07 e RC-09 (renegociação);
  RC-02 (cancelamento em lote).
- **Ficaram no repositório e no ar quando publicadas,** sem depender de patch: CB-06, CB-07, CB-08,
  CP-05, CP-06, CR-03, CR-08, CT-06, NA-06, NA-07 e NA-08.
- **CR-08 e PR-03 deixaram de filtrar por natureza:** agora o filtro é por elemento, e o gasto agrupa
  também elemento › centro. Continuam "em parte":
  - CR-08 ainda não tem a listagem resumida;
  - PR-03 ainda não tem agrupamento, periodicidade nem responsável.
- **Não cobertos que restam:**
  - NF-03, NF-04 e NF-05: fiscal (itens do XML casados com Materiais, CFOP e impostos);
  - CB-02, CR-01 e CR-02: cheques;
  - RC-04: comissão.

Testes:

| Teste | Resultado |
|---|---|
| `run_financeiro_entrega_b_test` | 104 |
| `run_financeiro_entrega_b_servidor_test` | 42 |
| `run_financeiro_entrega_b_controladoria_test` | 74 |
| `run_financeiro_entrega_b_ui_test` | 18 (Chrome) |
| `run_financeiro_f9_test` | 126 |
| `run_financeiro_f9_servidor_test` | 19 |
| `run_financeiro_f9_controladoria_test` | 9 |
| `run_financeiro_f9_ui_test` | 17 (Chrome) |
| `run_gestao_rules_test` | 63 (emulador) |

Os ensaios no retrato da base de 11/11 não acharam problema depois das correções.
