# Prompt mestre — Controladoria, Financeiro e Fiscal (SPED + SINTEGRA) em paridade com o WebMais

> Instrução de execução para um agente de código ou dev sênior full stack, no repositório
> `DEVMarlosGomes/ERP-PCPKURYOS` (projeto `erpkuryos`, publicado em kuryoserp.com.br). Pode ser colada
> inteira como prompt. Escrita em 17/11/2026 com as decisões do Marlos do mesmo dia.
>
> **Objetivo:** a Kuryos desligar o WebMais (ERPmais5) nas áreas de Controladoria, Financeiro e Fiscal sem
> perder função e sem o contador perceber diferença.
>
> Este prompt junta quatro frentes e diz **em que ordem** fazer. O detalhe de cada uma está nos prompts
> próprios, que você lê inteiros:
> - `PROMPT_CONTROLADORIA.md` (Controladoria, construída em 28/10);
> - `PROMPT_FINANCEIRO.md` (Financeiro, F0–F9 + Entregas A/B);
> - `PROMPT_FISCAL.md` (SPED Fiscal e SINTEGRA, nada construído);
> - `docs/controladoria-webmais-paridade.md` e `docs/financeiro-fase0-lacunas.md` §8–9 (mapas WebMais ×
>   KuryosERP).

---

## 0. Seu papel e como começar

Você executa, testa e publica. Trabalhe como consultor de implantação TOTVS/SAP que conhece o chão de
fábrica e o escritório de contabilidade: decida por impacto × esforço, entregue código real, testado e no
ar, e pergunte só o que §10 manda perguntar.

Leia antes, nesta ordem:
1. `CLAUDE.md`, `AGENTS.md` e `AGENT_STATUS.md` (protocolo multiagente: registre seu bloco antes de tocar
   em arquivo);
2. este prompt;
3. os quatro documentos citados no topo;
4. `shared/propriedade-estoque.js` (material do cliente × da Kuryos) e `shared/kardex.js`.

**Antes de qualquer código**, confira o estado real:
- `git log origin/hostinger-deploy` (o Hostinger é o que está no ar) e `origin/main`;
- se os commits da paridade (`feat(controladoria): paridade com a Controladoria do WebMais` e
  `docs(fiscal): prompt…`) já estão lá. Se não estiverem, aplique os patches que o Marlos tiver
  (`git am`) ou peça;
- rode a suíte da §8. Tudo verde é o ponto de partida.

---

## 1. Decisões do Marlos (17/11/2026), valem para as três frentes

| # | Decisão | O que muda |
|---|---|---|
| D1 | **Regime tributário: decisão posterior** | O regime é **parâmetro** (`fis/estabelecimento/regime`: `NORMAL` \| `SIMPLES`). Nada no código ou na tela assume um dos dois. O caminho principal é o regime normal (EFD obrigatória); o Simples precisa continuar funcionando (CSOSN, SINTEGRA só se notificado) |
| D2 | **Emissão de NF-e: em decisão, nada nesta etapa** | O KuryosERP **só recebe** XML (entrada e saída), por upload de XML/ZIP. Nenhum emissor, nenhuma comunicação com a SEFAZ para autorizar nota |
| D3 | **Industrialização por encomenda: sim.** Clientes mandam produtos e insumos para a Kuryos industrializar | Afeta as três frentes (§5). Retorno simbólico (5902/5903) **não é receita nem recebível**; só o 5124/5125 é |
| D4 | **O escritório vai usar o Domínio** | Exportação **contábil** Domínio (já existe, falta validar o leiaute com o escritório) e exportação **fiscal** Domínio (`PROMPT_FISCAL.md` F7) são obrigatórias |
| — | Um CNPJ só (decisão de 12/11); 002 CONNEXXA e 003 NEXT21 fora até nova ordem | Nada de multiempresa |

---

## 2. Estado em 17/11/2026

| Frente | Pronto | Falta (este prompt) |
|---|---|---|
| **Controladoria** | C0–C4 (`PROMPT_CONTROLADORIA.md` §15). Paridade de 17/11: DRE por elemento, índices gerenciais, bloqueio de período por movimento, export contábil Domínio com inconsistências (`docs/controladoria-webmais-paridade.md`) | Trilha A (§3) |
| **Financeiro** | F0–F9, Entrega A (relatórios WebMais), Entrega B (adiantamento, renegociação, cancelamento em lote). Mapa: 40 de 78 funções do WebMais cobertas, 22 em parte | Trilha B (§4) |
| **Fiscal** | Nada. Prompt pronto, com decisões: `PROMPT_FISCAL.md` | Trilha C (§5 e §6) |

**Ainda não foi feito ensaio com a base real** nem validação no PVA. Quem constrói faz: a sessão que
escreveu este prompt não tinha acesso ao banco nem ao navegador.

---

## 3. Trilha A — Controladoria

| # | Tarefa | Detalhe | Pronto quando |
|---|---|---|---|
| A0 | Publicar a paridade de 17/11 | Commit da paridade no `hostinger-deploy` (e `main`, conforme `CLAUDE.md`). Deploy das funções na VPS: callables novas `ctlSalvarBloqueio` e `ctlLancarIndices`; as callables do Financeiro passam a respeitar o bloqueio (função `fechado` em `financeiro_servidor.js`). Regras do banco **não mudam** | No ar; `run_controladoria_gerencial_test.js` (70) e `_ui_test.js` (13) verdes; ensaio na base real: DRE por elemento de out/2026 com o mesmo resultado da aba DRE |
| A1 | Validar o leiaute contábil Domínio com o escritório (D4) | `exportarDominio` gera hoje `Data;Débito;Crédito;Valor;Cód. histórico;Histórico`. O escritório informa o leiaute de importação de lançamentos que usa e os códigos reduzidos do plano dele. Ajuste o gerador ao leiaute **oficial do escritório** (versionado: `dominio-lancamentos-v2`), mantendo o relatório de inconsistências | Um mês real importado no Domínio pelo escritório, sem retrabalho, confirmado por escrito |
| A2 | Receita da industrialização por encomenda (D3) | Hoje a receita é o valor digitado da NF (`agendamentos_expedicao/*/faturamento/nfs/*/valor`). Quando o Fiscal F1 existir, a Controladoria **lê** `fis/documentos` (via `livro().receitaPorCfop`) e separa: 5124/5125 → receita de industrialização (linha própria na DRE, dentro de Receita bruta); 5101/5102… → venda; 5902/5903 → fora da receita. Até lá: **medir** na base se alguma NF registrada inclui retorno simbólico no valor e listar como pendência de conciliação, nunca como receita silenciosa | DRE de um mês com NF de encomenda: receita = Σ 5124/5125 (+ vendas), conferida contra o XML |
| A3 | Trava de período nos outros movimentos | `ctl/bloqueio_periodo` hoje trava o **Financeiro** e o **ajuste contábil**. Faltam: N.F. Entrada (recebimento em Compras), N.F. Saída (registro de NF no Faturamento), Movto Estoque (WMS/kardex), Movto Prod. (apontamento) e Movto Fiscal (Fiscal C). Mexe em quatro módulos: **confirme com o Marlos antes** (`PROMPT_CONTROLADORIA.md` §2.1). Use `ControladoriaGerencial.periodoLiberado` no servidor de cada um, nunca só na tela | Cada movimento recusa data fora da janela no servidor, com a mensagem do bloqueio; teste de ligação por módulo |
| A4 | DRE "Orçado" | O WebMais tem Informação: Realizado/Orçado. Aqui o orçado mora em `ctl/orcamento/{ano}/{conta}/{cc}/{mes}`. Acrescente à DRE por elemento a opção Realizado / Orçado / Realizado × Orçado (no nível conta × centro; elemento não tem orçado) | Colunas orçado e variação na DRE por elemento, conferidas contra a aba Orçamento × real |
| A5 | Reconciliação com recebimento parcial | `MELHORIAS_FUTURAS.md` (Financeiro × WebMais): medir na base se existe recebimento com ENTRADA parcial no razão antes de mexer | Medido e registrado; corrigido só se existir |

---

## 4. Trilha B — Financeiro (o que falta do WebMais)

Origem: `docs/financeiro-fase0-lacunas.md` §8–9 e `MELHORIAS_FUTURAS.md` "Financeiro × WebMais". Códigos
(CB-, CP-, CR-, RC-, PR-, NF-) são os do mapeamento de 78 funções.

| # | Tarefa | Detalhe | Pronto quando |
|---|---|---|---|
| **B0** | **CNPJ alfanumérico** (urgente) | O Financeiro usa `soDigitos` no CNPJ (`lerXmlNfe`, `casarNotaEntrada`, soma por parceiro). CNPJ com letra (leiaute 2026 em diante) vira lixo e casa errado. Troque por `normCnpj`: `[0-9A-Z]{14}`, maiúsculas, sem pontuação; DV pelo algoritmo novo (valores ASCII − 48). Uma função só, no `financeiro.js`, copiada para `fiscal.js` | Teste com CNPJ numérico e alfanumérico em XML, cadastro e soma por parceiro; nenhum dado existente muda de chave (medir na base) |
| B1 | Recebível da industrialização (D3) | `derivarNfs` cria o título com o valor digitado da NF. Quando o Fiscal F1 existir, o título a receber de uma NF com XML vem das **duplicatas / valor da fatura** do XML (`cobr/fat`), nunca do vNF quando houver 5902/5903. Até lá, a tela de registro de NF (Faturamento) **avisa** "nota com retorno simbólico: informe só o valor cobrado". Mexer no Faturamento: confirmar com o Marlos | Título de NF de encomenda = valor cobrado; teste com XML real |
| B2 | Entrada fiscal da NF (NF-03/04/05) | **Não construir no Financeiro.** Passa a vir do Fiscal: o Fiscal guarda o XML completo e o Financeiro lê `fis/documentos` para itens, CFOP e impostos (pergunta P10 do `PROMPT_FISCAL.md`; proposta: um upload só, no Fiscal, e o Financeiro F5 consome). Confirmar com o Marlos antes de mudar a importação F5 | Um XML importado uma vez alimenta título (Financeiro) e livro (Fiscal) |
| B3 | Liquidação completa (CB-06/07) | Filtros de portador, tipo de cobrança, emissão, valor de/até e liquidação de/até; juros, multa e desconto **por linha**; data de crédito e representante no lado a receber. Base: `parcelasParaLiquidar`, `montarLiquidacao` | Paridade com a tela do WebMais (pedir print ao Gustavo); testes de motor, servidor e tela |
| B4 | Rateio multi-elemento (CP-06) | `fin/classificacoes/{titulo}` com linhas elemento × centro × valor (Σ = título, centavos inteiros). A Controladoria já lança por elemento (`partesDoTitulo`). **Hash do documento inalterado** para quem tem um elemento só | Título com 3 elementos em 2 centros lança 6 partidas que somam o título; nada antigo re-deriva |
| B5 | DFC completo (CR-03) | Filtro de conta bancária, "exibir descontos", "pedidos de venda e ordens de compra" (previsto). Hoje é só mensal e realizado | Opções do WebMais na tela; CSV total = soma |
| B6 | Fluxo dia a dia com período livre (CC-02) | Hoje fixo em 7 dias passados + 30 futuros | De/até escolhidos |
| B7 | Gastos e despesas (CR-08, PR-03) | Listagem resumida; agrupamento, periodicidade e responsável no lançamento de despesas | Paridade com o WebMais |
| B8 | Lote bancário (CB-05, CC-04) | Consulta de lotes por período. **Arquivo de remessa CNAB continua fora** (`PROMPT_FINANCEIRO.md` §14) até decisão | Consulta no ar |
| B9 | Plano de elementos: quem edita | Hoje qualquer usuário do Financeiro renomeia ou inativa elemento. Proposta: só ADM ou Controladoria, com histórico. Confirmar com o Marlos | Regra + teste no emulador |
| B10 | Centro de custo do recebimento | 27 de 44 títulos de recebimento sem centro (base de 11/11). Regra proposta: natureza → centro (MP e embalagem → Produção; frete → Logística). **Decisão do Financeiro com a Controladoria**: perguntar | Regra decidida, aplicada só a títulos novos (sem re-derivar o passado) |
| — | Cheques (CB-02, CR-01/02), comissão (RC-04) | Fora até o Gustavo confirmar que a Kuryos ainda usa cheque e paga comissão | — |

---

## 5. Industrialização por encomenda: regra transversal (D3)

**Como a base guarda hoje** (não recrie):
- PC de remessa → propriedade `CLIENTE`;
- `estoque/{material}/porCliente/{clienteKey}/saldoAtual`;
- custo zero carimbado `PROCEDENCIA.CLIENTE` no Custos.

**CFOPs** (SP → SP 5/1; interestadual 6/2). Tabela completa e regras em `PROMPT_FISCAL.md` §15.
- 1901/2901: entrada para industrializar.
- 1924/2924: entrada por conta e ordem, quando o fornecedor do cliente entrega direto.
- 5902/6902: retorno simbólico do material aplicado.
- 5903/6903: retorno do material não aplicado.
- 5124/6124 e 5125/6125: a cobrança do que a Kuryos agregou.

**Por frente:**

| Frente | Regra |
|---|---|
| Fiscal | Entrada 1901/1924 sem crédito, estoque de terceiro; H010 IND_PROP 2 com COD_PART do cliente; SINTEGRA 74 posse 3; conferência saldo `porCliente` × entradas − retornos |
| Controladoria | Receita = 5124/5125 (+ vendas). 5902/5903 fora da receita e do CPV. Material do cliente nunca no CPV (já é zero) |
| Financeiro | Recebível = valor cobrado (fatura do XML), nunca o vNF com retorno simbólico |
| Custos / PCP | Nada muda: propriedade e custo zero já existem. Só **ler** |
| Tributação do 5124 | ICMS/IPI sobre valor agregado ou ISS: **decisão do contador** (P11), guardada como regra de saída, nunca no código |

---

## 6. Trilha C — Fiscal (SPED Fiscal e SINTEGRA)

Siga `PROMPT_FISCAL.md` **inteiro**, já com as decisões de §1. Resumo da ordem:

| Fase | Entrega | Depende de |
|---|---|---|
| F0 | Medir na base (volume de NF-e/CT-e, amostra de XMLs reais de **cada CFOP de §5**) e pegar no WebMais o SPED de um mês fechado (sugestão out/2026) + print do seletor "Tipo de arquivo" | — |
| F1 | Documentos fiscais: upload XML/ZIP (entrada, saída exportada do emissor atual, CT-e, eventos), parser completo, `fis/documentos` + `fis_xml` | B0 (CNPJ) |
| F2 | Regras de entrada (CFOP do fornecedor → CFOP de entrada, gera livro, crédito, propriedade), itens fiscais 0200/0220, de-para, sugestão automática incluindo 5901→1901 e 5924→1924 | F1 |
| F3 | Livros de entradas e saídas, apuração ICMS/IPI, `receitaPorCfop`, fechamento fiscal | F2 |
| F4 | **SPED Fiscal**: tela igual à do WebMais, relatório de inconsistências (contabilista CPF/CRC; CFOP sem "gera livro"), TXT leiaute 020 (2026) / 021 (2027), histórico de arquivos e retificador | F3 |
| F5 | Inventário (Bloco H) com material de terceiro (IND_PROP 2) | F3 |
| F6 | **SINTEGRA** (Conv. 57/95, 126 posições, registro 74 com posse 3) | F3, F5 |
| F7 | Exportação fiscal **Domínio** (obrigatória, D4): ZIP de XMLs + TXT da EFD ou o leiaute de importação de notas do escritório | F4 |
| F8 | Depois: DF-e (download automático de NF-e contra o CNPJ), Bloco K, CIAP | — |

**Aceite da frente:**
- um mês real gerado aqui **valida no PVA sem erro**;
- e bate com o arquivo do WebMais do mesmo mês: mesmos C100 por situação, mesmos Σ VL_DOC, VL_ICMS e VL_IPI,
  mesmo E110;
- toda diferença explicada por escrito.

---

## 7. Ordem de execução

1. **A0** publicar a paridade da Controladoria + **B0** CNPJ alfanumérico. B0 desbloqueia o Fiscal e já
   pode estar quebrando hoje.
2. **C-F0** medir e obter os arquivos do WebMais. Em paralelo, **A1** (leiaute Domínio contábil com o
   escritório).
3. **C-F1 → F2 → F3** (o livro fiscal). Logo depois de F3: **A2** e **B1** (receita e recebível da
   encomenda lendo o Fiscal) e **B2** (um upload de XML só).
4. **C-F4 SPED** → **C-F5 inventário** → **C-F7 Domínio fiscal** → **C-F6 SINTEGRA**. O SINTEGRA vem por
   último porque, em SP, quem entrega EFD está dispensado; ele existe por paridade e para o caso Simples.
5. Financeiro **B3–B8** intercalados conforme o Gustavo priorizar (pedir print da tela do WebMais de cada
   um).
6. **A3** (trava nos outros módulos), **A4**, **A5**, **B9**, **B10**: depois das confirmações de §10.

Cada item é publicado e útil sozinho. Nunca deixe uma frente pela metade no `hostinger-deploy`.

---

## 8. Regras de trabalho (todas as frentes)

- **Restrições invioláveis de cada prompt valem:**
  - partidas dobradas e append-only (Controladoria);
  - título nunca editado, só estornado (Financeiro);
  - XML imutável e arquivo nunca pela metade (Fiscal);
  - centavos inteiros;
  - idempotência por chave determinística;
  - valor ausente nunca vira zero;
  - caminhos planos no `update` do RTDB;
  - **nunca `git add -A`**.
- **Nenhum módulo escreve no outro.** Cada um **lê**. As mudanças fora do módulo que este prompt lista (A3, B1,
  B2, B9, B10) só depois da confirmação do Marlos.
- **Motor puro** em `public/shared/*.js` (UMD) + **cópia byte a byte** em `functions/` (teste confere).
  Servidor com `preparar…` puros que devolvem `updates`; callables em `functions/index.js` (os `exports`
  são registrados sozinhos na VPS).
- **Testes por camada:**
  - motor (`run_*_test.js`);
  - servidor contra banco simulado;
  - regras no emulador (`run_*_rules_test.js`);
  - tela com Playwright no Chrome, no molde de `run_controladoria_gerencial_ui_test.js`: 390 px sem
    rolagem horizontal, sem `NaN`/`undefined`;
  - **ensaio com a base real** (somente leitura) antes de fechar cada item.
- **Suíte de regressão** que fica verde em toda entrega:
  - `run_controladoria_test.js`, `run_controladoria_gerencial_test.js` e `run_gestao_servidor_test.js`;
  - todos os `run_financeiro*_test.js`;
  - os `run_fiscal*_test.js` que você criar;
  - as de tela quando a mudança tocar a tela.
- **Deploy:** `CLAUDE.md` manda.
  - Commit + push no branch certo (`hostinger-deploy` é o que está no ar; o `main` alimenta o Vercel).
  - Funções na VPS.
  - Regras pela CLI com backup antes e autorização do Marlos.
- **Documentação a cada entrega:**
  - `AGENT_STATUS.md` (bloco seu, "arquivos ativos: nenhum" ao terminar);
  - `CLAUDE.md` (tabela de módulos);
  - o mapa de paridade da frente;
  - `MELHORIAS_FUTURAS.md` (o que ficou para depois);
  - o manual da tela (`manual_*.html`).

---

## 9. Critérios de aceite globais

1. Para cada tela do WebMais mapeada (Controladoria › Contábil; Financeiro, 78 funções; SPED; SINTEGRA),
   o mapa diz **coberto / em parte / fora**, com o porquê. Nenhum "não verificado" sem dono.
2. Out/2026 (ou o mês escolhido na F0), lado a lado com o WebMais:
   - DRE: mesmo resultado, ou diferença explicada;
   - recebíveis e pagáveis em aberto iguais;
   - EFD valida no PVA e bate;
   - SINTEGRA aceito pelo validador.
3. O escritório importa no Domínio, sem retrabalho, o export contábil e o fiscal do mesmo mês.
4. NF de industrialização por encomenda: receita, recebível, livro, inventário e SINTEGRA corretos, com XML
   real de teste.
5. Período bloqueado e mês fechado são respeitados pelo servidor em todos os movimentos ligados.
6. Suíte da §8 verde; nada no ar sem teste.

---

## 10. Perguntas (a quem, e o que bloqueiam)

| # | Pergunta | Para | Bloqueia |
|---|---|---|---|
| Q1 | Leiaute de importação de lançamentos do Domínio e códigos reduzidos do plano | Escritório | A1 |
| Q2 | Tributação do 5124/5125 (ICMS/IPI no valor agregado × ISS) e CFOPs de encomenda usados de fato | Contador | Regras de saída (C-F2/F3) |
| Q3 | O escritório quer ZIP de XMLs + TXT da EFD, ou leiaute próprio de notas? | Escritório | C-F7 |
| Q4 | Energia e água: NF3e (XML 66) ou papel? Crédito de ICMS de energia? | Gustavo / contador | C500 na F4 |
| Q5 | Seletor "Tipo de arquivo" do SPED do WebMais (print) e o SPED de um mês fechado | Gustavo | C-F0, aceite F4 |
| Q6 | XML bruto: RTDB (`fis_xml`) ou disco da VPS? | Marlos (após medir volume) | C-F1 |
| Q7 | Pode mexer em Compras, Faturamento, WMS e apontamento para a trava de período (A3) e o aviso de retorno simbólico (B1)? | Marlos | A3, B1 |
| Q8 | Upload de XML único no Fiscal, com o Financeiro F5 lendo de lá (B2)? | Marlos | B2 |
| Q9 | Plano de elementos só ADM/Controladoria (B9)? Regra natureza → centro do recebimento (B10)? | Marlos / Gustavo | B9, B10 |
| Q10 | Regime tributário (D1), emissor de NF-e (D2), Connexxa/Next21 | Marlos | Nada agora (parametrizado / fora) |
| Q11 | Ainda usa cheque? Paga comissão? | Gustavo | Cheques, comissão |

Pergunta sem resposta **não vira chute no código**. Construa o que não depende dela e registre no
`AGENT_STATUS.md` o que ficou esperando.
