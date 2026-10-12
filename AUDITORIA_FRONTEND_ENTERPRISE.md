# Auditoria frontend enterprise — Kuryos ERP/PCP

Data: 08/10/2026. Escopo: frontend local em `public/`, autorização, fontes de dados e painéis. A auditoria não altera regras de negócio.

## Diagnóstico executivo

O produto é um ERP multipágina em HTML/CSS/JavaScript, Firebase Auth + RTDB, com um módulo React compilado incorporado para CRM/P&D. A arquitetura operacional é funcional e extensa, mas a apresentação nasceu por etapas: havia tokens duplicados, estilos locais por tela, duas linguagens visuais de dashboard e uma sidebar sem busca/recolhimento em desktop.

A identidade oficial foi conferida no [site da Kuryos](https://kuryos.com.br/) e no [SVG institucional](https://kuryos.com.br/assets/img/logo-kuryos.svg). A cor principal real é `#0A1C69`, apoiada por `#06123F`, `#4E5C86`, `#7D91B8`, `#ACBCD4`, `#DCE3EF` e `#F2F5FA`. O verde profundo anteriormente usado nos dashboards não pertence à paleta oficial e foi substituído na camada enterprise.

## Arquitetura encontrada

- 60 entradas HTML após o redesign; 49 entradas autenticadas já carregavam `auth_check.js` antes da nova visão executiva.
- 78 módulos JavaScript compartilhados e 13 folhas compartilhadas antes dos novos assets enterprise.
- Firebase Compat 10.7 para autenticação e RTDB.
- Chart.js 4.4 nos dashboards legados e no dashboard executivo; nenhuma biblioteca adicional instalada.
- CRM/P&D: bundle React compilado em `public/static/`, roteado por `crm-app.html` e adaptador Firebase local.
- Autorização: `KURYOS_MODULOS`, `MODULOS_POR_PAPEL`, `PAGINA_MODULOS` e regras reais do RTDB. A navegação deriva da mesma matriz usada para permitir páginas.
- Tema: claro/escuro/automático persistido em `localStorage`, sincronizado entre páginas legadas e React.

## Inventário de rotas por domínio

| Domínio | Entradas funcionais |
|---|---|
| Visão e BI | `dashboard_executivo.html`, `dashboard_setorial.html`, `dashboard.html`, `dashboard_analise.html` |
| Comercial | `comercial.html`, `gestao_comercial.html`, `crm1.html`, `crm2.html`, `crm3.html`, `relatorio_pedido.html`, `devolucoes.html` |
| P&D | `pd.html`, `/pd/**` via `crm-app.html` |
| PCP | `planejamento.html`, `ops.html`, `emitir_op.html`, `pedidos.html`, `insumos.html`, `o_que_comprar.html`, `dossie_lote.html`, `proximas_ordens.html` |
| Operação | `form.html`, `historico.html`, `manipulacao.html`, `material_processo.html`, `estoque_setor.html` |
| Compras | `compras.html`, `o_que_comprar.html` |
| Estoque/Logística | `consulta_estoque.html`, `estoque.html`, `kardex.html`, `movimentar.html`, `separacao_materiais.html`, `logistica.html` |
| Expedição | `expedicao.html`, `faturamento.html`, `cargas.html`, `relatorio_expedicao.html`, `descarte.html` |
| Qualidade | `qualidade.html`, `qualidade_historico.html`, `retrabalhos.html` |
| Cadastros/Admin | `cadastros.html`, `admin.html`, `usuarios.html` |
| RH | `rh_dashboard.html`, `rh_cadastros.html`, `rh_avaliacao.html`, `rh_ferias.html` |
| Treinamento | `manuais.html` e manuais setoriais |

`horizonte.html` permanece fora do menu, mas não foi removido porque ainda grava dados consumidos pelo planejamento. Redirecionamentos e rotas React existentes foram preservados.

## Componentes e padrões consolidados

- Design tokens oficiais: `kuryos-enterprise-shell.css`, sobre a base compatível existente.
- AppShell/Topbar: breadcrumb, contexto setorial, busca global autorizada e acesso à central de atenção.
- DynamicSidebar: permissões reais, busca local, grupos expansíveis, modo recolhido persistente, tooltips e teclado.
- KPI Card, Chart Container, Status/Unavailable State, Filter/Tab Bar e layouts analíticos: dashboard executivo/setorial.
- Tabelas, formulários, modais, kanbans e estados de foco: camada global `kuryos-apple-system.css`, preservada e realinhada à marca pelo shell enterprise.
- Ícones: SVG lineares; nenhum emoji novo foi introduzido.

## Fontes auditadas

| Fonte | Registros observados | Uso seguro |
|---|---:|---|
| `pedidos/` | 377 | carteira e status |
| `pedidos_comerciais/` | 76 | valor registrado e pedidos comerciais; não é faturamento |
| `ops/` | 1.388 | situação, planejado, produzido e datas reais quando presentes |
| `paradas_historico/` | 141 | contagem/duração informada de paradas |
| `solicitacoes_compra/` | 4 | requisições e status |
| `pedidos_compra/` | 16 | pedidos, valor estimado, fornecedor e previsão |
| `materiais/` | 939 | cadastro mestre |
| `estoque/` | 95 | apenas informativo antes do Dia D |
| `estoque_lotes/` | 24 grupos | situação de lote e decisão da Qualidade |
| CRM | 60 clientes, 1 projeto, 1 amostra | pipeline real, com espelhos do cadastro |
| P&D | 1 solicitação ativa | desenvolvimento, testes e aprovações |

O script `scripts/audit-enterprise-data.mjs` registra contagem, campos e status sem escrever no banco.

## Riscos de regressão identificados

1. `auth_check.js` concentra autorização, menu e utilidades operacionais; mudanças nele afetam quase todo o sistema.
2. Há CSS local extenso e com alta especificidade. A camada enterprise usa seletores limitados e novos nomes para evitar alterar lógica/estrutura.
3. `dashboard_analise.html` contém um snapshot histórico grande além das leituras ao vivo; ele continua explicitamente identificado como congelado onde aplicável.
4. O montador legado remove qualquer `<header>` semântico. Novas telas usam contêiner próprio para não serem removidas.
5. Estoque não pode embasar compra, ruptura, cobertura ou valor antes do inventário Dia D.
6. Nem todos os pedidos/OPs têm prazo comparável; atraso e OTIF não podem ser inferidos.
7. Não há razão financeira integrada; faturamento, recebíveis, margem, lucro e EBITDA ficam indisponíveis.
8. Alguns nós retornam `PERMISSION_DENIED` conforme o perfil. Os painéis respeitam isso e não contornam regras.
9. Chart.js e Firebase são carregados por CDN nas páginas legadas; indisponibilidade externa precisa resultar em estado de erro, não números falsos.

## Estratégia aplicada

1. Preservar páginas e motores existentes.
2. Corrigir a identidade por uma camada semântica reversível.
3. Evoluir a sidebar existente, que já deriva de permissões reais.
4. Adicionar visão executiva e setorial como rotas funcionais do módulo Analytics.
5. Exibir zero somente quando a leitura foi feita e o cálculo resultou em zero; usar `N/D` para fonte ausente ou insuficiente.
6. Validar shell, navegação, temas, dados, responsividade e regressões existentes antes de qualquer publicação.

## Alterações realizadas

- `public/shared/kuryos-enterprise-shell.{css,js}`: identidade, topbar, busca e sidebar.
- `public/dashboard_executivo.html` + `shared/executive-dashboard.{css,js}`: visão macro com dados reais.
- `public/dashboard_setorial.html` + `shared/sector-dashboard.{css,js}`: nove painéis por domínio.
- `public/auth_check.js`: rotas Analytics e carregamento global do shell.
- `scripts/audit-enterprise-data.mjs`, `scripts/test-enterprise-redesign.mjs` e `scripts/test-sector-dashboard.mjs`: auditoria e QA.

## Pendências futuras

- Completar datas prometidas/efetivas para OTIF e atraso.
- Executar o inventário Dia D e preencher parâmetros de planejamento dos materiais.
- Integrar notas fiscais, contas a receber e razão financeira antes de indicadores financeiros.
- Padronizar causas de não conformidade para Pareto confiável.
- Completar tempos efetivos e perdas para OEE.
- Substituir gradualmente CSS local duplicado por componentes compartilhados, tela a tela, mantendo testes funcionais.
