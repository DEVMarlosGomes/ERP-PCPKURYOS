# Financeiro F9 — liquidação por filtro, elementos de custo e aberturas do caixa

Data: 12/11/2026. Origem: `financeiro-mapeamento-auditoria.md` (78 funções do WebMais).

O documento cita o patch `financeiro-f9-liquidacao-elementos.patch` (commit `a19ab85`), que não existe
nesta máquina nem no GitHub. Esta F9 é **reconstruída a partir do que o documento descreve**.

Linhas atendidas: CB-06, CB-07, CB-08, CP-05, CP-06, CR-03, CR-08, CT-06, NA-06, NA-07 e NA-08.

Pedido do Marlos: entregar tudo funcionando, sem parar para aprovação. As decisões abaixo são minhas e
estão marcadas como tal.

## 1. Elementos de custo (CP-06, NA-07)

- **O que é.** Elemento é "o nome da conta" (fala do financeiro). Cada elemento tem código, nome,
  grupo, subgrupo e a **natureza** do Financeiro a que pertence. É a natureza que liga o elemento
  à Controladoria e ao DFC por atividade.
- **Plano padrão** (proposta, 27 elementos): `ELEMENTOS_PADRAO` no motor. Leva os códigos que o vídeo
  mostra (408 A definir, 004 Adiantamento, 1101 Adiantamento salarial, 1103 Adiantamento 13º e
  2113 Aluguel); os demais são propostos. O Financeiro cadastra, renomeia ou inativa em
  `fin/elementos/{codigo}` pela callable `finCadastrarElemento`. Elemento não se apaga, só se
  inativa.
- **Grupos do DFC por elemento:**
  - 1 Receitas operacionais;
  - 2 Custos de produção;
  - 3 Despesas operacionais;
  - 4 Financeiro;
  - 9 A classificar.
- **Classificação do título** em `fin/classificacoes/{titulo}`, pela callable `finClassificar`:
  elemento, forma de pagamento e rateio entre centros de custo (percentuais que somam 100). O título
  não muda: a classificação é um registro à parte, como a condição informada.
- **Título manual:** já nasce com elemento e forma de pagamento.
- **Sem classificação:** vale o elemento padrão da natureza (`elementoDaNatureza`) e o centro do
  título. Recebimento com várias naturezas continua dividido por natureza.
- **Na Controladoria:** o título manual classificado lança a despesa (ou receita) na conta da natureza
  do elemento, rateada por centro. Quando a classificação muda, a derivação estorna o lançamento antigo
  e lança o novo (append-only).

## 2. Liquidação por filtro (CB-06, CB-07, CB-08, NA-08)

- Aba **Liquidação**, com A pagar e A receber.
- **Filtros:** vencimento de/até, com os atalhos "Hoje e amanhã", "Esta semana" e "Vencidos";
  fornecedor ou documento; elemento.
- **Grade:** uma linha por parcela aberta, com parceiro, documento, parcela, emissão, vencimento,
  dias, valor, em aberto e elemento. Os totais da seleção ficam no rodapé.
- **Confirmar:** pede a data de movimentação e a conta, e grava uma baixa por título (soma das
  parcelas marcadas) pela callable `finLiquidar`. Vale o mesmo que a baixa comum: título bloqueado fica
  de fora, mês fechado recusa e caixa físico não fica negativo.
- **Quadro "Movimento de dd/mm":** o que foi baixado na data de movimentação.
- **Juros, multa, desconto e baixa parcial** continuam pelo botão Pagar do título, como o
  documento descreve.

## 3. Aberturas do caixa (CR-03, NA-06, CR-08, CT-06)

- **`dfcElementos`:** DFC realizado aberto por grupo › subgrupo › elemento. A variação de cada mês é a
  mesma do DFC por atividade (o teste confere).
  - O principal das baixas vai para o elemento do título.
  - Juros e multa vão para o 401; tarifa e IOF para o 402; rendimento e desconto obtido para o 403.
  - O adiantamento vai para o 004.
  - A transferência entre contas fica fora.
- **`fluxoCaixa(..., {porGrupo: true})`:** uma linha por grupo de elemento (realizado e títulos a vencer).
  As previsões de pedido ficam numa linha à parte.
- **Gastos por elemento/centro:**
  - agrupamento elemento › centro (como no vídeo) ou centro › elemento;
  - filtro por elemento;
  - rateio entre centros aplicado.
- **Lançamento de despesas:** colunas e filtros de elemento e forma de pagamento.

## 4. Fora

- Vários elementos no mesmo rateio. O documento registra "um elemento por título".
- Portador, tipo de cobrança e valor de/até na liquidação.
- Juros por linha na liquidação.
