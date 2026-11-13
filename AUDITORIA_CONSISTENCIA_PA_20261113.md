# Auditoria — Produzido × Expedição no PED-0001 (Bioflora) — 13/11/2026

Relato do cliente: a aba Pedidos mostrava 8.024 un. de Rose Absolut (PRF-BIOF-0006) e a Expedição
mostrava 4.554 (2 paletes: 2.304 + 2.250). A planilha dele trazia também Sunrise (1.962) e Infinity
Rouge (58). Leitura feita em produção (`erpkuryos`), **somente leitura**, em 13/11 por volta das 17h.

## 1. A conta, OP por OP

| SKU | Produzido (Pedidos) | Em estoque/expedido | Diferença | Explicação |
|---|---|---|---|---|
| Rose Absolut 0006 | 8.024 = 4.554 (26264/17) + 3.470 (26302/01) | 4.554 | 3.470 | a OP 26302/01 inteira |
| Sunrise 0004 | 4.758 = 2.796 (26264/13) + 1.962 (26264/14) | 2.796 | 1.962 | a OP 26264/14 inteira |
| Infinity Rouge 0002 | 5.485 = 2.637 + 2.848 | 5.427 | 58 | −95 e +37: RNC-PA-26264-06 e -07, **concluídas** |
| Lume Blue / Lumina | 6.492 / 5.710 | igual | 0 | — |

## 2. Causa raiz

**OP 26302/01** foi emitida em 29/10 para **690** un. de Rose Absolut. O granel do Sunrise foi
envasado nela, e ela fechou com **3.470** un. apontadas. Em 04/11 a confirmação avisou "Produzido
(3.470) passa de 110% do planejado (690)" e gravou `confirmadoComDivergencia`, mas **aceitou sem RNC**.
O retrabalho físico (desenvasar e reenvasar como Sunrise) virou a OP 26264/14 (1.965 un.). Como o
sistema não tem como **transferir unidades entre OPs/SKUs**, as 3.470 continuaram contando como Rose.
O mesmo líquido foi apontado duas vezes, e frasco e rótulo foram baixados duas vezes.

**Sunrise 1.962:** a OP 26264/14 foi confirmada em 12/11 e conferida só em 13/11 às 16:46 (1.965
contadas, RNC-PA-26264-14 de +3). A tela chamava de "diferença" o que era fila de conferência.

**Infinity Rouge 58:** é a soma das divergências que a Logística apontou e encerrou por RNC. Está
dentro da regra ("só pode haver diferença com RNC resolvida").

## 3. Achados que pedem ação de quem opera

1. **Palete de 3.470 Rose Absolut, OP 26302/01, GAL-1-3-1, LIBERADO_EXPEDICAO.** Foi criado hoje às 16:37
   por Marcos Souza, com uma contagem só, igual ao apontamento. Pelo relato do cliente, esses frascos
   foram esvaziados no retrabalho. Hoje Pedidos e Expedição batem em 8.024, mas é uma batida falsa até
   alguém **contar fisicamente o GAL-1-3-1**. Por decisão do usuário, os dados **não foram alterados**.
2. **OP 26282/03 (Flor D'Aura):** conferida em 16/10 com 1.792 un. Depois disso o apontamento subiu para
   4.308. As **2.516 un. a mais nunca entraram no estoque** e a OP está toda expedida (1.792). Ou há
   produto no galpão sem registro, ou o apontamento está inflado. A varredura nova abre a
   RNC-CS-26282-03 na primeira vez que PCP/ADM abrir Pedidos ou OPs.
3. **Site antigo da Vercel** (`pcp-kuryos.vercel.app`): estava no ar, gravando no banco de produção e
   chamando as callables do servidor antigo no Render. 56 OPs foram confirmadas por um código que não
   existe na VPS, a última em 05/11. Redirecionado em 13/11 para `kuryoserp.com.br` (seção 5).

## 4. O que mudou no sistema

Motor `public/shared/consistencia-producao.js`. As regras foram **calibradas na base real** (132 OPs
concluídas desde 10/09):

| Situação | O que faz | Medido |
|---|---|---|
| Conferência de PA conta diferente | RNC-PA (já existia) e agora entra no alerta vermelho | — |
| OP confirmada acima de **150%** do planejado | abre **RNC-SP-{op}** na confirmação; confirmar segue permitido | > 110% daria 29 de 132 (22%, excedente de granel é rotina); > 150% dá 2 |
| OP **já conferida** cuja conta não fecha | abre **RNC-CS-{op}** na varredura de Pedidos/OPs | hoje: 1 (26282/03) |
| OP confirmada e ainda não conferida | **não é RNC**: aparece "Aguardando conferência" (laranja), em vez de "Diferença" | 90 de 132 levaram > 24 h; RNC seria ruído |

- RNC com chave fixa por OP, aberta por transação que só cria: nunca duplica e nunca reabre uma tratada.
  Corte prospectivo da superprodução: confirmações a partir de 13/11.
- **Alerta vermelho** (`shared/alerta-consistencia.js`, carregado pelo `auth_check.js`) para ADM, PCP e
  Expedição/Logística em qualquer tela:
  - mostra um modal com as RNCs automáticas de consistência ainda não concluídas;
  - "Ciente" vale para a sessão;
  - um selo vermelho fica até a RNC fechar.
  - Hoje ele mostraria 2 RNCs de contagem abertas e 7 em análise.
- Quem grava a RNC: ADM, PCP e Qualidade, igual à regra já publicada de `nao_conformidades`. A
  Logística vê, mas não grava. Nenhuma regra do banco mudou.

Testes:
- `run_consistencia_producao_test.js`: os três casos reais.
- `run_alerta_consistencia_ui_test.js` e `run_confirmacao_superproducao_ui_test.js`: Chrome, tela real.
- Regressão de Pedidos, OPs, Relatório de Pedido, Gestão Comercial e Conferência de PA: verde.

## 5. Vercel

`vercel.json` do `origin/main` (que a Vercel publica) passa a redirecionar qualquer caminho para
`https://kuryoserp.com.br/<mesmo caminho>` (307, reversível). O servidor do Render segue no ar (ver
`MELHORIAS_FUTURAS.md`).

## 6. Como regularizar o caso (operação, não código)

1. Contar o GAL-1-3-1. Se não houver Rose ali, corrigir o apontamento da 26302/01 no Histórico de
   Apontamentos para a quantidade real de Rose (pelo relato, zero) e acertar o palete no WMS.
2. Tratar a RNC-CS-26282-03 com a mesma lógica.
3. O que ficou para depois (troca de SKU no retrabalho, contagem cega) está em `MELHORIAS_FUTURAS.md`.
