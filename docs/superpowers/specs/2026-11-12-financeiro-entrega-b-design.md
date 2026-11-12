# Financeiro — Entrega B: adiantamento, renegociação e cancelamento em lote

Data: 12/11/2026. Origem: mapeamento do WebMais (`docs/financeiro-fase0-lacunas.md` §8). A Entrega A
(relatórios, só leitura) está no ar em `4ca2b2a`. Decisões do Marlos em 12/11:

| Pergunta | Decisão |
|---|---|
| O que cancelar um título significa no razão | Dois motivos: **emitido por engano** desfaz a receita ou despesa; **incobrável** vira perda com clientes |
| Alcance do cancelamento | A receber (qualquer origem) e a pagar **manual ou de abertura** |
| Aprovação | Sem segunda pessoa; motivo obrigatório, autor e data gravados, e desfazer disponível |

## 1. Objetivo e critério de sucesso

Dar ao Financeiro as três operações de cadastro do WebMais que faltam, sem quebrar as regras do
módulo (`PROMPT_FINANCEIRO.md` §2): título e baixa nunca se editam nem se apagam, valor em centavos
inteiros, só o servidor grava título e baixa, e a Controladoria continua fechando.

Critérios de sucesso:
1. O saldo dos bancos, o extrato, o fluxo, o DFC e a reconciliação de Bancos incluem o adiantamento.
   O DFC continua fechando com os bancos.
2. Depois de qualquer operação e do desfazer, a reconciliação da Controladoria dá diferença zero em
   Fornecedores, Clientes e nas duas contas novas de adiantamento.
3. Desfazer uma renegociação ou um cancelamento devolve os títulos originais ao saldo de antes, e o
   razão estorna sozinho (a Controladoria já estorna fato que deixa de existir: `controladoria.js:derivar`).
4. Nenhum relatório conta o mesmo gasto ou receita duas vezes por causa de renegociação.
5. Clique duplo não duplica nada: chave da tela em todo registro novo.

## 2. Abordagem

Cada operação grava **um registro próprio** em `fin/` e mexe nos títulos só por **abatimento**
(`fin/abatimentos`, o mesmo nó que a devolução de recebimento já usa) ou por **baixa**
(`fin/baixas`). Rejeitado: editar o título (valor, vencimento ou status), porque quebra o
append-only e tira o rastro que a Controladoria lê.

Desfazer nunca apaga: grava abatimento **negativo** nos originais (o motor já soma abatimentos, então
o saldo volta) e marca o registro como desfeito.

## 3. Modelo de dados (todos os nós só pelo servidor)

`fin/` não tem regra de escrita genérica, então nó novo já nasce fechado para o cliente. O teste de
regras passa a provar isso para os três nós novos.

### 3.1 Adiantamento — `fin/adiantamentos/{AD_chave}`
```
tipoRegistro  ADIANTAMENTO | ESTORNO
tipo          PAGAR (a fornecedor) | RECEBER (de cliente)
parceiro      {tipo FORNECEDOR|CLIENTE, key?, nome, cnpj?}
conta         conta bancária (fin/contas_bancarias)
data, valorCentavos, documento?, historico?
estorna       (no ESTORNO) id do adiantamento
criadoEm, criadoPor, criadoPorUid, versao
```
- **Compensação** é uma baixa em `fin/baixas/CP_{chave}` com `forma: 'ADIANTAMENTO'`,
  `adiantamento: {id}`, `conta: null`, juros/multa/desconto 0 e `liquidoCentavos = valorCentavos`.
  O estorno da compensação usa o `finEstornarBaixa` existente.
- **Saldo do adiantamento** = valor − Σ compensações (baixa − estorno). Fica em aberto até zerar.
- Estornar o adiantamento só é permitido com o saldo integral (nada compensado), e o estorno sai do
  ou entra no banco na data informada.

### 3.2 Renegociação — `fin/renegociacoes/{RN_chave}`
```
tipo, parceiro, titulos {id: saldoCentavos}, novoTitulo 'RNG_{chave}'
acrescimoCentavos, descontoCentavos, valorNovoCentavos = Σ saldos + acréscimo − desconto
data, motivo, condicao | vencimento
status ATIVA | DESFEITA, desfeitaEm, desfeitaPor, motivoDesfazer
```
Junto, no mesmo update:
- `fin/abatimentos/RN_{chave}_{tid}` em cada original: `{titulo, motivo: 'RENEGOCIACAO', valorCentavos: saldo, data, ref}`;
- `fin/titulos/RNG_{chave}`: `origem {tipo: 'RENEGOCIACAO', ref: 'fin/renegociacoes/RN_…', titulos: [...]}`, mesmo
  parceiro e tipo, emissão = data da renegociação, valor = `valorNovoCentavos`. Natureza, `porNatureza` e
  centro de custo vêm dos originais, na proporção do saldo de cada um. A condição ou o vencimento
  informado geram as parcelas pelo motor de sempre (`parcelas`, `montarCondicao`).

**Desfazer** (só sem baixa líquida e sem abatimento no título novo): abatimento `RENEGOCIACAO_DESFEITA` do
valor inteiro no título novo, abatimento **negativo** de mesmo nome em cada original e `status: DESFEITA`.

### 3.3 Cancelamento — `fin/cancelamentos/{CN_chave}`
```
tipo, titulos {id: saldoCentavos}, motivo ENGANO | INCOBRAVEL, justificativa (≥ 10 caracteres)
data, status ATIVO | DESFEITO, desfeitoEm, desfeitoPor, motivoDesfazer
```
Junto: `fin/abatimentos/CN_{chave}_{tid}` `{titulo, motivo: 'CANCELAMENTO', tipoCancelamento, valorCentavos: saldo, data, ref}`.
Desfazer: abatimento negativo `CANCELAMENTO_DESFEITO` em cada título e `status: DESFEITO`.

### 3.4 Status do título (motor, `situacao`)
Saldo zero com abatimento líquido de renegociação → `RENEGOCIADO`; de cancelamento → `CANCELADO`;
demais abatimentos → `ABATIDO` (como hoje). Tela e relatórios ganham os dois rótulos.

## 4. Validações (motor puro, repetidas no servidor dentro da fila)

| Operação | Recusa quando |
|---|---|
| Adiantamento | sem parceiro; valor ≤ 0; data inválida; conta inexistente; mês fechado; caixa físico ficaria negativo |
| Compensação | tipos ou parceiros diferentes (parceiro pelo CNPJ ou, sem CNPJ, pelo nome); valor > saldo do adiantamento ou do título; título bloqueado (a pagar); mês fechado |
| Estorno do adiantamento | já estornado; já houve compensação; mês fechado; caixa negativo |
| Renegociação | nenhum título; título sem saldo; tipos ou parceiros diferentes; título em lote AGUARDANDO; título repetido; sem condição e sem vencimento (ou condição ilegível); acréscimo ou desconto negativo; desconto ≥ saldo; mês fechado |
| Desfazer renegociação | não ATIVA; título novo com baixa líquida ou abatimento |
| Cancelamento | título sem saldo; a pagar que não é MANUAL/IMPORTACAO; INCOBRAVEL em título a pagar; ENGANO em título de NF de saída ou de renegociação (nota errada se cancela no Faturamento; renegociação se desfaz); título em lote AGUARDANDO; justificativa curta; mês fechado |
| Desfazer cancelamento | não ATIVO |

## 5. Controladoria (`controladoria.js`, cópia em `functions/`)

Contas novas no plano padrão:
- `ADIANT_FORNECEDORES` 1.1.4 (Adiantamentos a fornecedores, ativo);
- `ADIANT_CLIENTES` 2.1.6 (Adiantamentos de clientes, passivo);
- `PERDAS_CLIENTES` 5.1.4 (Perdas com clientes, despesa, grupo DRE `DESPESAS_COMERCIAIS`).

Lançamentos (documentos esperados; estorno automático quando o fato deixa de valer):

| Fato | Partidas |
|---|---|
| Adiantamento a fornecedor | D ADIANT_FORNECEDORES / C BANCOS {banco} (estorno: invertido) |
| Adiantamento de cliente | D BANCOS {banco} / C ADIANT_CLIENTES |
| Compensação a pagar | D passivo do título / C ADIANT_FORNECEDORES |
| Compensação a receber | D ADIANT_CLIENTES / C CLIENTES |
| Renegociação a pagar (ATIVA) | D passivo de cada original (saldo) + D DESP_FIN (acréscimo) / C passivo do novo (valor novo) + C RECEITA_FIN (desconto) |
| Renegociação a receber (ATIVA) | D CLIENTES (valor novo) + D DESP_FIN (desconto) / C CLIENTES (saldos) + C RECEITA_FIN (acréscimo) |
| Cancelamento a receber, ENGANO | D conta de origem (manual: conta da natureza; abertura: SALDOS_ABERTURA) / C CLIENTES |
| Cancelamento a receber, INCOBRAVEL | D PERDAS_CLIENTES / C CLIENTES |
| Cancelamento a pagar, ENGANO | D passivo do título / C conta da natureza (manual, com o centro de custo) ou SALDOS_ABERTURA (abertura) |

- Partida da mesma conta a débito e a crédito no mesmo documento se compensa (renegociação entre
  títulos do mesmo passivo não gera ruído).
- `passivoDoTitulo` de título de renegociação = passivo do primeiro original (recursivo).
- `partidasDaBaixa` recebe o mapa de títulos para resolver isso.
- A reconciliação inclui `ADIANT_FORNECEDORES` e `ADIANT_CLIENTES` contra o saldo de adiantamentos do
  Financeiro (posição no fim do mês).

## 6. Financeiro: motor e relatórios

- **Banco:** `saldosBancarios`, `extratoConta`, `fluxosRealizados` (fluxo e DFC) e `caixaNegativo`
  incluem o adiantamento e o estorno dele. A compensação não mexe no banco (`conta: null`). A natureza
  no fluxo e no DFC é `ADIANTAMENTOS`, atividade operacional por padrão.
- **Funções puras novas:** `validarAdiantamento`, `validarEstornoAdiantamento`, `saldosAdiantamentos`,
  `validarCompensacao`, `validarRenegociacao`, `montarRenegociacao`, `validarDesfazerRenegociacao`,
  `validarCancelamento`, `montarCancelamento`, `validarDesfazerCancelamento`.
- **Relatórios** (`financeiro-relatorios.js`):
  - gastos, ranking, lançamento de despesas e evolução por **emissão** ignoram título de origem
    RENEGOCIACAO, para não contar o gasto duas vezes; por **pagamento**, a baixa dele conta normalmente;
  - realizado × previsto deixa de prever título RENEGOCIADO ou CANCELADO (o novo prevê);
  - fornecedores/clientes em aberto ganham a coluna "Adiantamento disponível";
  - relatório novo **Adiantamentos**: por parceiro, com data, documento, valor, compensado e saldo;
  - gastos ganham a opção **não exibir adiantamentos** (esconde as baixas por compensação).

## 7. Servidor (`functions/financeiro_servidor.js` + `index.js`)

| Callable | Ações | Prepara |
|---|---|---|
| `finAdiantamento` | `CRIAR`, `ESTORNAR` | `prepararAdiantamento`, `prepararEstornoAdiantamento` |
| `finCompensarAdiantamento` | — | `prepararCompensacao` |
| `finRenegociar` | `CRIAR`, `DESFAZER` | `prepararRenegociacao`, `prepararDesfazerRenegociacao` |
| `finCancelarTitulos` | `CRIAR`, `DESFAZER` | `prepararCancelamento`, `prepararDesfazerCancelamento` |

Todas exigem o módulo Financeiro (`exigirFinanceiro`) e rodam na `filaFinanceiro`: leitura fresca,
validação, um update atômico por caminhos planos. A chave vem da tela, e chave repetida devolve
"já feito" sem gravar.

## 8. Tela (`financeiro-tela.js`)

- **A pagar e A receber:**
  - coluna de seleção, com a barra "Renegociar selecionados" e "Cancelar selecionados" (o cancelamento só
    habilita para títulos permitidos e explica o motivo dos demais);
  - botão "+ Adiantamento";
  - card "Adiantamentos em aberto" com saldo, compensações e "Estornar".
- **Detalhe do título:**
  - "Compensar com adiantamento" quando o parceiro tem saldo;
  - a renegociação ou o cancelamento que o afetou, com "Desfazer".
- **Formulário de renegociação:** títulos e saldos, acréscimo, desconto, condição (parcelas, 1º
  vencimento, intervalo, igual ao título manual) ou vencimento único, prévia das parcelas e motivo.
- **Formulário de cancelamento:** lista, motivo (engano ou incobrável, só a receber) e justificativa.

## 9. Testes

- **Motor:** `run_financeiro_entrega_b_test.js`. Cobre validações, saldos, status novos, bancos, DFC
  fechando e base vazia.
- **Servidor:** `prepar*` contra base simulada. Cobre idempotência, mês fechado e lote aguardando.
- **Controladoria:**
  - todos os documentos balanceados;
  - reconciliação zero em Fornecedores, Clientes e adiantamentos depois de cada operação e depois de
    desfazer (derivar → aplicar → derivar de novo);
  - DRE com a perda na linha de despesas comerciais.
- **Regras (emulador):** cliente não grava `fin/adiantamentos`, `fin/renegociacoes` nem `fin/cancelamentos`.
- **Tela no Chrome:** adiantamento, compensação, renegociação com prévia, cancelamento em lote, desfazer.
- **Bateria existente do Financeiro e da Controladoria** e o ensaio no retrato da base real.

## 10. Fora desta entrega

- Casar linha do OFX direto com adiantamento (lança o adiantamento, depois concilia como hoje).
- Cancelar título a pagar que veio de recebimento (continua pelo cancelamento do recebimento em Compras).
- Cheques, CNAB e comissão (`MELHORIAS_FUTURAS.md`).
