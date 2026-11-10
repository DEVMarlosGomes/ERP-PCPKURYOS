# Kuryos ERP — Planejamento, Produção e Qualidade

Sistema de gestão industrial da **Kuryos**, fabricante de cosméticos sob contrato
(*private label*) licenciada pela Anvisa. A plataforma conduz o ciclo completo de
um produto — do primeiro contato com a marca cliente até a saída do caminhão —
num único ambiente, com rastreabilidade de ponta a ponta.

Nasceu para tirar o Planejamento e Controle da Produção (PCP) das planilhas e
cresceu até cobrir comercial, desenvolvimento, suprimentos, armazém, qualidade,
expedição, custos e gestão de pessoas.

---

## O problema que resolve

Uma fabricante por contrato atende dezenas de marcas ao mesmo tempo, cada uma com
fórmulas, embalagens, prazos e exigências próprias. Sem um sistema integrado, a
informação se perde entre setores: o pedido não conversa com a produção, a
produção não conversa com o estoque, e a qualidade descobre o problema quando o
lote já está pronto.

O Kuryos ERP liga essas pontas. Cada etapa consome o que a anterior registrou e
entrega o que a seguinte precisa — sem redigitação e sem planilha paralela.

---

## Fluxo ponta a ponta

```
 CRM ─► P&D ─► Kickoff ─► Pedido ─► MRP / Compras ─► Recebimento + CQ
                                         │
                                         ▼
 Expedição ◄─ Conferência de PA ◄─ Produção / Apontamento ◄─ Planejamento / OP
     │
     ▼
 Faturamento ─► Financeiro / Controladoria ─► Custos e Resultado
```

---

## Módulos

### Comercial
- **CRM em três etapas** — clientes, projetos e amostras, com acompanhamento do funil.
- **Kickoffs** — passagem formal do projeto aprovado para a operação.
- **Pedidos e orçamentos** — pedido comercial que alimenta automaticamente o PCP.
- **Contratos e gestão comercial** — carteira, condições e visão por cliente.

### Pesquisa e Desenvolvimento
- Solicitações de desenvolvimento, fórmulas e versões.
- **Manipulação em lote de amostras**, com pesagem, conferência e aprovação de
  itens críticos.
- Cadastro de novas matérias-primas com INCI e fornecedor, encaminhado ao Cadastro.

### Planejamento e Controle da Produção
- **Emissão e controle de Ordens de Produção**, com reserva de saldo.
- **Planejamento em grade** de 15 minutos por linha, com sequência, ritmo real da
  OP e reprogramação automática da fila quando há atraso ou adiantamento.
- **MRP — Necessidade de Materiais**: demanda de todos os pedidos abertos,
  faseada por semana, descontando compras em trânsito, com lote mínimo, múltiplo
  e lead time, e exceções de compra, antecipação e adiamento.

### Produção
- **Apontamento** de produção por OP, com baixa automática de consumo.
- Material em processo, próximas ordens e estoque por setor (fábrica,
  manipulação e rótulos).

### Suprimentos
- **Compras**: solicitação, cotação e pedido de compra.
- **Recebimento** contra pedido de compra, com geração de lote e envio à Qualidade.

### Armazém e WMS
- **Endereçamento** com mapa e planta baixa do armazém.
- **Separação guiada FEFO** (primeiro a vencer, primeiro a sair).
- **Kardex**, movimentação, descarte e logística reversa.
- **Titularidade do estoque**: separa o que é da Kuryos do que pertence a cada
  cliente, a partir do pedido de compra.

### Qualidade
- **Fila de inspeção** de matéria-prima, embalagem, granel e produto acabado,
  com laudos, especificações e registro fotográfico.
- **Não conformidades (RNC)** ligadas ao item, ao lote ou à OP e ao fornecedor,
  com tratativa, anuência do cliente, concessão e encerramento com causa raiz.
- Desempenho de fornecedores, retrabalhos, checklists e auditoria 5S.
- **Dossiê do lote**: a história completa de um lote em uma única página.

### Expedição
- **Conferência de produto acabado** por palete, com tripla contagem.
- **Montagem de carga** com validação de cliente, destino, modalidade de frete,
  validade e liberação da Qualidade.
- Agendamento, faturamento, carregamento parcial e acompanhamento até a saída.

### Financeiro, Custos e Resultado
- **Financeiro e Controladoria**: títulos, baixas, razão e fechamento, com
  estorno em vez de exclusão.
- **Custos e Resultado**: custo padrão por absorção em horas-padrão, margem por
  SKU e placar da fábrica.

### Pessoas e Manutenção
- Colaboradores, temporários, férias, avaliação de desempenho e pesquisa de clima.
- Cadastro de ativos e manutenção.

### Gestão
- **Visão executiva 360°**, dashboards diário, geral e setorial e painel de controle.
- **Auditoria** das operações sensíveis.
- **Manuais de operação** integrados ao sistema, por setor.

---

## Princípios do sistema

- **Rastreabilidade completa.** Todo lote é rastreável do fornecedor da
  matéria-prima ao pedido do cliente que o recebeu.
- **Dado mestre único.** Itens, clientes e fornecedores vêm do cadastro; ninguém
  redigita nome ou código.
- **Nada se apaga.** Correções financeiras e de estoque são feitas por estorno e
  histórico, nunca por exclusão.
- **Regras críticas no servidor.** Emissão de OP, movimentação de estoque,
  expedição e aprovações sensíveis são validadas e gravadas pelo servidor, de
  forma atômica.
- **Planejamento conservador.** Capacidade e prazos usam o valor mais
  conservador disponível: um prazo que não se cumpre vale menos que um prazo honesto.
- **Acesso por função.** Cada pessoa vê e opera somente os módulos da sua função,
  e as permissões também são verificadas no banco de dados.

---

## Tecnologia

| Camada | Tecnologia |
|---|---|
| Interface operacional | HTML, CSS e JavaScript, com design system próprio e navegação lateral única |
| Comercial (CRM, P&D, Kickoff, Cotações e Contratos) | React + Vite |
| Regras de negócio no servidor | Node.js |
| Banco de dados, autenticação e arquivos | Firebase (Realtime Database, Authentication e Storage) |
| Qualidade de código | Cerca de 280 suítes de testes automatizados, entre regras de negócio, telas, regras do banco e ensaios com dados reais |

Os motores de cálculo (MRP, planejamento, custos, FEFO, titularidade e expedição)
são escritos como funções puras e testáveis, reaproveitáveis em outras plataformas.

---

## Estrutura do repositório

| Pasta | Conteúdo |
|---|---|
| `public/` | Telas do sistema e módulos compartilhados de regras de negócio |
| `crm-frontend/` | Aplicação React dos módulos comerciais |
| `functions/` | Regras de negócio executadas no servidor |
| `docs/` | Especificações, planos e auditorias |
| `scripts/` | Rotinas de manutenção e migração de dados |
| `run_*_test.js` | Testes de regressão por módulo |

---

<sub>Kuryos · Sistema proprietário de uso interno.</sub>
