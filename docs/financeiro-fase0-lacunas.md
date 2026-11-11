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
