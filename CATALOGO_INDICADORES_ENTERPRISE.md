# Catálogo de indicadores — Kuryos ERP/PCP

Data: 08/10/2026. Atualização: a cada abertura/troca de filtro do painel. Acesso: módulo `analytics`; o Firebase continua aplicando as permissões de cada fonte. Valores indisponíveis são `N/D`, nunca zero artificial.

## Indicadores executivos

| Indicador | Fórmula/unidade | Fonte | Responsável | Regra e drill-down |
|---|---|---|---|---|
| Pedidos em carteira | contagem de pedido não concluído/cancelado | `pedidos/` | PCP | atenção quando backlog > 70; `pedidos.html` |
| Carteira comercial registrada | Σ `totalValor`, BRL, no período | `pedidos_comerciais/` | Comercial | não equivale a faturamento; `gestao_comercial.html` |
| Aderência das OPs | Σ produzido ÷ Σ planejado, % | `ops/` | PCP/Produção | somente OP concluída com quantidade; Dashboard Geral |
| OPs em execução/fila | OP não concluída/cancelada | `ops/` | PCP | `ops.html` |
| Pedidos de compra abertos | enviados + recebidos parcialmente | `pedidos_compra/` | Compras | `compras.html` |
| Projetos P&D ativos | solicitação não concluída/cancelada | `erp/kuryos/pd_requests` | P&D | `pd.html` |
| Lotes em quarentena | `status = QUARENTENA` | `estoque_lotes/` | Qualidade | `qualidade.html?tab=fila` |
| Entregas OTIF | indisponível | — | Logística/Comercial | exige data prometida, completa e entregue |
| Estoque crítico | indisponível | — | Estoque/PCP | bloqueado até Dia D e parâmetros mínimos |
| Faturamento realizado | indisponível | — | Financeiro | exige razão financeira conciliada |

## PCP e Produção

| Indicador | Fórmula | Fonte | Observação |
|---|---|---|---|
| OPs programadas/em andamento/concluídas | contagem por `status` | `ops/` | canceladas excluídas quando pertinente |
| Lead time de fabricação | média de `dataFimReal - dataInicioReal` | `ops/` | somente pares de datas válidos |
| Quantidade produzida | Σ `produzido` das OPs concluídas | `ops/` | unidades |
| Paradas registradas | contagem e Σ `duracao` informada | `paradas_historico/` | não transforma ausência em tempo zero |
| Ordens atrasadas | `N/D` | — | prazo por OP incompleto |
| Carga × capacidade | `N/D` | `alocacoes_planejamento/` | nó vazio na auditoria |
| Produtividade/OEE/refugo | `N/D` | — | tempos e perdas sem cobertura completa |

## Comercial e P&D

| Indicador | Fórmula | Fonte | Observação |
|---|---|---|---|
| Clientes no CRM | contagem | `erp/kuryos/crm_clients` | inclui espelhos do cadastro mestre |
| Projetos/amostras | contagem | `crm_projects`, `crm_samples` | pipeline real |
| Ticket médio registrado | Σ `totalValor` ÷ pedidos válidos | `pedidos_comerciais/` | não é ticket faturado |
| Pedidos confirmados | status liberado/aprovado | `pedidos_comerciais/` | drill-down Comercial |
| Testes/aprovações pendentes | registro não finalizado | `pd_tests`, `pd_approvals` | P&D |
| Tempo médio de desenvolvimento | `updated_at - created_at` de concluídos | `pd_requests` | só quando existirem concluídos |
| Conversão e taxa de aprovação | `N/D` | — | histórico atual insuficiente |

## Compras

| Indicador | Fórmula | Fonte | Observação |
|---|---|---|---|
| Requisições pendentes | SC não consolidada/finalizada | `solicitacoes_compra/` | inclui solicitações originadas no P&D |
| Pedidos abertos | PC não recebido totalmente/cancelado | `pedidos_compra/` | estado atual |
| Compras em atraso | previsão < hoje e PC aberto | `pedidos_compra/` | usa somente previsão explícita |
| Valor comprado estimado | Σ `valorTotalEstimado`, sem cancelados | `pedidos_compra/` | não é valor pago |
| Fornecedores em pedidos | chaves distintas | `pedidos_compra/` | fornecedores com PC |
| Lead time/aderência do fornecedor | `N/D` | — | data efetiva final incompleta |

## Estoque, Qualidade e Expedição

| Indicador | Fórmula | Fonte | Observação |
|---|---|---|---|
| Materiais cadastrados/com saldo | contagens separadas | `materiais/`, `estoque/` | cobertura parcial explícita |
| Lotes rastreados/liberados/quarentena | contagem por status | `estoque_lotes/` | estoque não orienta compra antes do Dia D |
| Taxa de aprovação CQ | decisões aprovadas ÷ decisões totais | `estoque_lotes/*/qualidade` | inclui concessão como aprovação |
| RNCs abertas | não finalizada/cancelada | `nao_conformidades/` | conforme autorização do perfil |
| Expedições/volume | contagem e Σ `itens[].qtd` | `expedicoes_comerciais/` | saídas registradas, sem canceladas |
| Agendas abertas | não finalizada/cancelada | `agendamentos_expedicao/` | fluxo logístico atual |
| Valor/cobertura/giro de estoque | `N/D` | — | inventário/custo incompletos |
| OTIF/tempo de preparação | `N/D` | — | marcos temporais incompletos |

## Financeiro — indisponível

Faturamento, contas a receber, aging, margem, lucro e EBITDA não são calculados. O controle de carga aguardando nota fiscal é operacional e não substitui uma razão financeira. A futura integração deve fornecer documento fiscal, competência, valor, vencimento, baixa e conciliação antes de habilitar esses KPIs.

## Regras de apresentação

- `0`: a fonte foi lida e o resultado calculado é zero.
- `N/D`: a fórmula não pode ser calculada de forma confiável.
- “Sem acesso”: a regra do banco não autoriza a fonte para o perfil atual.
- Erro de carregamento: manter o último estado fora de uso e orientar nova tentativa; nunca exibir zero.
- Filtros setoriais usam `?area=`; o executivo usa `?periodo=` para URL compartilhável.
