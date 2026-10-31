# Auditoria final — reunião de 28/10/2026

Fechamento técnico em 31/10/2026. A revisão percorreu o prompt inteiro, os commits integrados, os testes de motor, navegador e regras, e uma leitura somente leitura da base `erpkuryos`.

## Ticket × entrega × evidência

| Ticket | Status | Commit(s) no `main` | Evidência principal |
|---|---|---|---|
| MENU-01 | concluído | `9428dbb` | `run_navegacao_test.js`: 39 perfis |
| MENU-02 | concluído | `0dab3d7` | `run_menu_sanfona_ui_test.js`, desktop e 390 px |
| MENU-03 | concluído | `5150c0a`, `229b83b`, `9eba5bd` | `run_inicio_ui_test.js` |
| MENU-04 | concluído | `9ece895`, `54dd3ba` | `run_crm_menu_ui_test.js`: carga direta, pushState, voltar e celular |
| CRM-01..04 | concluídos | `2df7b1d`, `71fedd7`, `36257dc`, `1ae6341`, build `7c72bc4` | Vitest CRM e ensaios de categoria, código, máscara e prazo |
| PD-01..06 | concluídos | `41dc446`, `5cecda3`, `69d0f95`, `69157fd`, `251ee14`, `7180c84`, build `52d520f` | Vitest/UI: manipulação, materiais, fila idempotente, variações, diretoria e especificações |
| KO-10..13 | concluídos | `9f650b5`, `8680f79`, `c3552bc`, `f791887` | autopreenchimento, BOM antigo, pendências e bloco operacional |
| BOM-02..04 | concluídos | `8abe2ea`, `d87c72c`, `239ac31` | PDF sem manipulação/equipamentos; árvore/cartões 390 px; paletização excluída |
| COT-01 | concluído e endurecido | `d2e2e11`, `0f9ca5d` | Vitest + emulador: 8 casos, inclusive ADM com motivo |
| COT-02 | concluído | `9d47a4a` | componente sem fornecedor na cotação e SC |
| COT-03 | concluído | `caddb9e` | emulador: 13 casos de PC antes/depois do pedido e exceção ADM |
| COT-04 | concluído | `ba075d0` | orçamento precificado com origem |
| SKU-01 | concluído; legado identificado | `7192303`, build `921083a` | base real: 6 propostas, 3 aprovadas, 1 já com SKU/índice; 2 aprovações antigas sem `skus_gerados` |
| OP-01 | concluído com limite conhecido | `c17758b`, `aabcf01` | ligado/desligado, cliente e liberação ADM; emissão ainda é cliente, registrada em Melhorias |
| OP-02 | concluído | `29ee01a` | saldo por substituto |
| PLAN-01 | concluído | `a4f3ce5`, `b4cf1e4` | motor: antecipação, atraso, trava e virada do dia; grava só após confirmação |
| FEFO-01 | concluído | `12a5202`, `b4cf1e4` | lote de embalagem, cliente e motivo fora do FEFO |
| FIN-01 | concluído | `b3465fb` | 2×30/60, centavo, à vista e mês fechado |
| PORT-01 | concluído | `6360701` | motores de gargalos/cadastros e UI |
| PORT-02 | concluído | `74b6c77` | Pesagens motor/UI |
| PORT-03 | concluído | `df27013`, `2c0ef73`, `9b807c0` | Checklists, Liberação/Assepsia, Inspeção Total e laudo |
| PORT-04 | concluído | `ffd70e6` | Titularidade motor/servidor/UI |
| PORT-05 | concluído | `3f36b18` | Auditoria append-only, emulador e UI |
| PORT-06..09 | concluídos | `4e09c9d`, `0271645`, `cbea45e`, `ddd5f66` | Ativos, 5S, RH e Roadmap com testes e permissões |
| PORT-10 | concluído no escopo aprovado | `a5a8a7b`, `6a03005`, `88b0593`, `dc2a324`, `ed30a5d`, `8609d4d`, `3487445`, `44a1e6d` | login idempotente; listas/cabeçalhos; RNC; palete; nomes normalizados |

O CRM fechou com **408 testes passando e 2 ignorados** (49/1 arquivos), build Vite de 2.565 módulos e compilado integrado. A coerência global passou em 402 verificações; a navegação em 39 perfis. As suítes de Painel, Pesagens, Checklists, Liberação de Linha, Inspeção Total, Titularidade, Auditoria, RNC, Expedição e Render também passaram. Os testes visuais usam navegador headless e fixtures sem dados de clientes; os artefatos locais ficam ignorados pelo Git.

## Decisões D-01 a D-11

Todas foram aplicadas: registro/menu e Início (D-01/02); trava de OP configurável e desligada até o Dia D (D-03); Bloco 0 vindo do CRM (D-04); agrupamento frasco/tampa-válvula (D-05); árvore do BOM (D-06); especificações Cadastros → P&D (D-07); MP nova na fila ao salvar (D-08); diretoria sem leitura de estabilidade (D-09); desconto como máximo (D-10); PC bloqueado até pedido, com exceção ADM motivada (D-11).

## Regras do banco

Antes do fechamento, a leitura de `/.settings/rules` em produção tinha SHA-256 `2f75aeea09280ca3988418f68c7f68da96c2cdc9bd5602ae5a2819b55a368dbc` e não continha os 11 grupos persistentes verificados da Fase 8 (`liberacoes_pc_projeto`, Checklists/Inspeção/Liberação/Assepsia, Auditoria, Ativos, 5S e RH). Roadmap lê `backlog.json` estático e não cria nó de banco. O arquivo final acrescenta esses nós e a proteção COT-01. Publicado em 31/10 exclusivamente com `firebase deploy --only database --project erpkuryos`; a leitura posterior teve SHA-256 `e186c13a2b3a6964974bfee83d9d112797d2d75d4ec48d3beca5acd40f82e99e`, com os 11 grupos presentes. O `.firebaserc` não foi alterado.

## Brechas e falhas encontradas

- **Segurança — corrigida:** COT-01 limitava desconto no adaptador, mas escrita direta podia ultrapassar o máximo. `0f9ca5d` levou a trava à regra e cobriu 8 cenários no emulador.
- **Regressão — corrigida:** o cartão Feedback do RH não estava na fixture de Início (`9eba5bd`).
- **Mobile — corrigida:** a tabela de materiais da Emissão de OP alargava a página em 390 px (`da07369`).
- **Qualidade de teste — corrigida:** a coerência rejeitava scripts válidos com `?v=`; o teste do shell CRM dependia de timeouts fixos (`54dd3ba`).
- **Dados históricos:** duas propostas aprovadas antes do fluxo atual não têm `skus_gerados`; não houve backfill automático para não criar produtos/pedidos sem revisão comercial. O caminho atual é comprovado por uma aprovação real já indexada e pela suíte idempotente.
- **Fronteira conhecida:** a trava de saldo da OP ainda vive no cliente; as regras protegem a configuração/liberação ADM, mas não tornam toda emissão server-side. Está em `MELHORIAS_FUTURAS.md`.
- **Portão visual:** a validação final foi por Playwright local. Capturas da referência e credenciais não entram no repo público. O pedido de prosseguir sem parar substituiu os Portões B/C intermediários pelo fechamento contínuo.

## Decisões e operação ainda necessárias

- Confirmar autorização Anvisa para saneantes: criar categoria própria ou remover “home spray” da ficha Febella.
- Confirmar no planejamento: atraso pelo mínimo atual ou ritmo previsto; zona fixa também no reflow; grade de 15 ou 5 minutos. O código mantém a decisão documentada de 15 minutos até nova orientação.
- Virar a fábrica para `erpkuryos` e fazer o inventário físico do Dia D; só então ligar a trava de saldo e usar FEFO com lotes reais.
- Atribuir Financeiro/Controladoria, Qualidade e RH; corrigir tenant de Adlai, Diego e Roberta.
- Cadastrar bancos/títulos de abertura, contas ECD, capacidade dos SKUs e lead time/lote mínimo dos materiais prioritários.
- Revisar manualmente as duas propostas legadas aprovadas sem SKU antes de qualquer backfill.
- Permanecem em Melhorias: emissão de OP no servidor e no celular, testes antigos, manuais de Custos/Financeiro/Controladoria, unir paletes e desmembrar também na Conferência de PA.
