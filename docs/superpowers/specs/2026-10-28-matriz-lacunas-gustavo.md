# F0-4 — Matriz de lacunas do Gustavo

Levantamento somente-leitura, 29/10/2026.

- **Nosso repo:** `C:\Users\Marlos\Documents\PCP-Kuryos-main` (HEAD `087dfd7`).
- **Repo do Gustavo:** clone em `...\scratchpad\gustavo` (HEAD `97afd77`, 28/10 13:51).
- Abaixo, "G:" indica caminho no repo dele e "N:" caminho no nosso.

## 0. Achados que mudam o escopo

1. **A lacuna começa em 06/10, não em 12/10.** O nosso `d013d97` (12/10) foi copiado de uma pasta que estava no estado do Gustavo em **`125ab95` (05/10 17:20)**. Para confirmar, conferi a presença, no nosso repo, de cada arquivo que ele criou entre 28/09 e 11/10:
   - **Até 05/10 está tudo aqui**, inclusive `4d884a1` (intermediários), `b29f19d` e `125ab95`, este último verificado por `RetrabalhosTela.visibilidade` em N:`public/form.html`.
   - **De `6777405` (06/10) em diante, nada está aqui.**

   Por isso a matriz inclui os ~20 commits funcionais de 06 a 09/10 (5S, Temporários, Feedback e Clima, auditoria de programação, encerramento de pedido, crédito por SKU etc.). Esses itens estão marcados **[pré-12/10]**. Somando, são cerca de 150 commits dele que não temos, e não 108.
2. **São dois bancos diferentes.** O Gustavo continua em `prod-kuryos`: G:`.firebaserc`, `projectId: "prod-kuryos"` e `prod-kuryos-default-rtdb` em G:`public/shared/utils.js`. O nosso usa `erpkuryos` (N:`public/shared/utils.js`). Daí saem duas consequências:
   - Os scripts de saneamento que ele rodou (`scripts/sanear-vinculos-pedido.js`, `corrigir-mrarbs07-onda-pedido-30.js`, `limpar-logins-duplicados.js`, `regularizar-pa-hig-next-0001.js`, `corrigir-produzido-subcreditado.js` etc.) **corrigiram dados no banco dele, não no nosso**.
   - Se a fábrica aponta no app dele, os dados operacionais estão divergindo também.
3. **Servidor.** Cada `exports.X` de `functions/index.js` é servido automaticamente pelo Render (N:`functions/render-server.js:253-257`). O cliente redireciona `httpsCallable` para `KURYOS_FUNCTIONS_ORIGIN` (N:`public/auth_check.js:7`). Portar uma Cloud Function dele, portanto, é exportá-la no nosso `functions/index.js`, sem precisar de Firebase Functions.
   - Ele tem 1 callable que não temos: `alterarTitularidadeEstoque`.
   - Arquivos de servidor que só existem no lado dele: G:`functions/titularidade.js`, `pesos_volumes.js` e `dados_nf.js`.
4. **Regras do banco.**
   - **Nós de topo só nele:** `usuarios_removidos`, `comercial_config`, `qualidade_rascunhos`, `inspecoes_cq`, `liberacao_linha`, `assepsia_linhas`, `checklist_modelos`, `ativos`, `ativos_historico`, `auditoria5s_config`, `auditorias_5s`, `acoes_5s`, `ciencia_5s`, `ocorrencias_5s`, `eventos_auditoria`, `auditoria_geral`, `rh_temporarios*` (6 nós), `feedback_*` (6 nós), `clima_respostas` e `clima_recados_lidos`.
   - **Subcaminhos novos dele dentro de nós comuns:**
     - `clientes/$cliente/responsavelComercialId|Nome` (G:`database.rules.json:79-87`);
     - `.validate` em `pedidos/$pedidoKey` para `statusManual`/`encerramento` (G:185-186);
     - `ops/$opKey/qualidadePA`, `ops/$opKey/inspecaoTotal` e a criação de OP `tipoOrdem == 'RETRABALHO'` pela Qualidade (G:374-377).
   - **Nós de topo só nossos:** `usuarios_publico`, `custos`, `resultado`, `fin`, `ctl`, `materiais_chave`, `solicitacoes_cadastro_material`, `pendencias_setor`, `servicos` e `erp`.
5. **Nenhuma tela do Gustavo tem equivalente pronto aqui**, e só um item cai em "já temos": o tema Custos, em que estamos à frente (ele só tem o plano). As nossas 106 commits foram quase todas CRM/P&D/Kickoff/Custos/Financeiro/UI. Os únicos pontos de contato com o trabalho dele são usuários, prontidão da OP, duplicidade de material, menu e pendências de cadastro.

Contagem: **41 funcionalidades alteradas por ele**, sendo **1 "já temos"**, **9 "temos diferente"** e **31 "não temos"**. A contagem não inclui o item 42, idêntico e não alterado, nem os scripts de dados (item 43), que não são funcionalidade.

---

## (a) Matriz — ordenada por valor para a operação da fábrica

Legenda de porte: **M** = novo módulo em `KURYOS_MODULOS` (N:`public/auth_check.js:197-260`), com página nova em `paginas`, usuários (`usuarios.html` lê `window.KURYOS_MODULOS`) e eventualmente `MODULOS_POR_PAPEL` (N:265). **R** = nó/regra nova em `database.rules.json`, publicada com `--only database --project erpkuryos`. **F** = função de servidor exportada em `functions/index.js` (sai pelo Render). **T** = testes `run_*` a copiar.

| # | Funcionalidade | Status | Commits dele | Arquivos dele (G:) | Nossos arquivos (N:) | O que portar exige |
|---|---|---|---|---|---|---|
| 1 | Crédito de produção no pedido guiado pela OP: SKU certo, sub-crédito, transferência de OP acha o pedido, "produzido" só por apontamento, conferência na confirmação da OP, PA não conferido e legado deixam de ser divergência | não temos | b45cbf5 [pré-12/10], b5b8e87, 7e347c1, f0698cb, b84b367 | `public/shared/conciliacao-pedidos.js` (`classificar`), `shared/transferencia-op.js`, `shared/utils.js` (`avaliarConfirmacaoOp`, `findPedidoKeyPorLote`, `porSku`), `pedidos.html` (`seloCoerenciaOps`), `ops.html`, `historico.html`, `relatorio_pedido.html`; T: `run_pedido_sku_credito_test`, `run_confirmacao_op_test`, `run_razao_historico_test`, `run_conciliacao_pedidos_test`, `run_transferencia_op_test`, `run_pedidos_conciliacao_ui_test` | `conciliacao-pedidos.js`, `transferencia-op.js`, `utils.js`, `pedidos.html`, `form.html` (versões de 05/10) | Merge cuidadoso em `utils.js`/`form.html`/`pedidos.html`, que nós também alteramos. Sem módulo nem regra novos. Rodar os scripts de correção **contra o erpkuryos**, com ensaio antes. |
| 2 | Liberação de linha: assepsia (CK-4) e first article (CK-5) por OP, com assepsia exigida antes de alocar a OP na linha | não temos | e1ac6e6, 3954b2a | `liberacao_linha.html`, `shared/liberacao-linha.js`, `shared/liberacao-linha-tela.js`, `form.html` (`bloquearSeLinhaNaoLiberada`, `bloquearSeAssepsiaPendente`), `admin.html` (`renderTravaLiberacao`), `manual_qualidade.html`, `manual_apontamento.html`; T: `run_liberacao_linha_*`, `run_assepsia_alocacao_ui_test` | — | R: `liberacao_linha`, `assepsia_linhas`, `inspecoes_cq`. Página em `qualidade.paginas` e `apontamento.paginas` (no G: `auth_check.js:97,123`). Trava em Ajustes. Depende do item 21 (checklists). |
| 3 | Laudo único de PA por lote (OP), não por palete, com amostragem por palete dentro do laudo | não temos | f112ab3 | `shared/laudo-pa-lote.js`, `qualidade.html`, `shared/dossie-lote.js`, `utils.js`; T: `run_laudo_pa_lote_*`, `run_qualidade_pa_tipo_test` | `qualidade.html` (laudo por palete) | R: `ops/$opKey/qualidadePA` (G:`database.rules.json:374`). Merge em `qualidade.html`. |
| 4 | Inspeção total de PA: sinalização, inspeção por motivo, decisão parcial e OPs de retrabalho, que voltam pela Conferência de PA, com fotos por palete; laudo avulso bloqueado; OP de retrabalho sai da fila da manipulação | não temos | abe35cb, afe5065, 26e74c9 | `inspecao_total.html`, `shared/inspecao-total-pa.js`, `functions/conferencia_pa.js`, `functions/expedicao_regras.js`, `estoque.html`, `shared/manipulacao.js`, `manipulacao.html`; T: `run_inspecao_total_pa_*`, `run_manipulacao_ui_test` | `estoque.html`, `functions/conferencia_pa.js` | R: `ops/$opKey/inspecaoTotal` e criação de OP RETRABALHO pela Qualidade (G:377). Página em `apontamento`, `planejamento` e `qualidade` (G:`auth_check.js:97,108,123`). F: alterar `conferencia_pa.js`. |
| 5 | RNC: consulta ao cliente (AGUARDANDO_CLIENTE), uso sob concessão + FOR-QUA-0001, cancelar duplicata sem causa raiz; RNC automática da Conferência de PA não sobrescreve tratativa | não temos | 7f99161, 6481d9d, 97afd77, 2ec5815 | `qualidade.html`, `shared/laudo-cq.js` (`paginaTermoConcessao`, `blocoConsultaCliente`, `faixaCancelada`), `shared/laudo-cq.css`, `utils.js` (`consultarClienteRnc`, `liberarLoteSobConcessao`, `cancelarRnc`), `shared/fotos-qualidade.js`, `functions/conferencia_pa.js`; T: `run_rnc_concessao_test`, `run_rnc_cancelamento_test`, `run_conferencia_pa_server_test`, `run_coerencia_modulos_test` | `qualidade.html`, `laudo-cq.js`, `utils.js` | Merge. F: redeploy no Render. Sem nó novo (fica em `nao_conformidades`). |
| 6 | Apontamento: baixa o material que a OP de fato usou (substituições), horas pela janela do turno, `horasEstimadas` nos três fechamentos, encerrar OP com incremento zero, OP só sai do card quando encerrada, empenho liberado ao encerrar OP | não temos | a556e88 (parte), f37d61e, f46ff24, 9a75542, 07335c0 [pré-12/10], 71eda01 [pré-12/10] | `form.html` (`horasTrabalhadasPeriodo`, `confirmarIncrementoZero`, `confirmarPeriodoTrabalhado`), `shared/horas-turno.js`, `utils.js` (`aplicarSubstituicoesOp`, `substituicoesDaOp`, `opSegueAlocada`, `informados`), `ops.html`, `dashboard.html`, `planejamento.html`; T: `run_horas_turno_test`, `run_substituicao_apontamento_test`, `run_op_segue_alocada_test`, `run_empenho_liberacao_test` | `form.html`, `utils.js` | Merge em arquivos centrais. Rodar `scripts/liberar-empenho-op-encerrada.js` no erpkuryos, com ensaio. |
| 7 | Emitir OP: **bloqueio** sem Fórmula + BOM + Especificação aprovadas (todos os SKUs) e sem escolher pedido sozinho quando há mais de um aberto | temos diferente (bloqueio) / não temos (vínculo ambíguo) | a556e88 (parte), 32a20c1 | `emitir_op.html` (`emissaoBloqueadaMotivo`, `htmlAmbiguo`, `ondaDoSkuPorPedido`); T: `run_emitir_op_bloqueio_ui_test`, `run_emitir_op_vinculo_ambiguo_ui_test` | `emitir_op.html` + `shared/prontidao-op.js` (PCP-02, `1786700`): trava dura **só para SKU nascida no CRM** (`origemCrm`); legado só avisa | Decisão (ver §c). O vínculo ambíguo é merge direto em `emitir_op.html`. |
| 8 | Encerramento de pedido **linha a linha com motivo** pelo PCP e Comercial, 95% vira aviso, "Reabrir saldo" e "Encerrar" em linha Concluída com produzido menor | temos diferente | 5e508e5 [pré-12/10], 9609af4 [pré-12/10], 9f20c57, 88af61e | `shared/encerramento-pedido.js`, `pedidos.html` (`abrirEncerramento`), `comercial.html` (`encerrarOuReabrir`); T: `run_encerramento_pedido_*`, `run_reabrir_saldo_ui_test` | `pedidos.html:423` "Encerrar Pedido" do pedido **inteiro** via `statusManual` (`pedidos.html:521`) | R: `.validate` de `pedidos/$pedidoKey` (G:`database.rules.json:185-186`). Decisão (ver §c). |
| 9 | Edição de pedido: total em R$ e status acompanham a quantidade; quantidade de linha comercial só se edita no Comercial; PCP não exclui pedido comercial | não temos | 3494991, 638277d, b3ddc7d (parte) | `shared/pedido-edicao.js` (`statusAposQuantidade`, `totalValorItens`), `pedidos.html`, `comercial.html`; T: `run_pedido_edicao_test` | `pedido-edicao.js` (versão antiga) | Merge. Sem regra nova. |
| 10 | Recebimento: peso real de cada volume (6×50 + 30), conferido com a quantidade e impresso na etiqueta; amostragem por volume em kg/L; aviso de erro por cima do modal | não temos | a6e5eee, f443010, f69a764 | `functions/pesos_volumes.js`, `functions/recebimento.js` (`amostragemDoLote`, `amostraPorVolume`), `functions/index.js`, `shared/pesos-volumes.js`, `shared/etiquetas-wms.js` (`quantidadeDoVolume`), `logistica.html`; T: `run_pesos_volumes_test`, `run_recebimento_pesos_ui_test`, `run_recebimento_amostragem_test`, `run_etiquetas_volume_test` | `functions/recebimento.js`, `logistica.html`, `etiquetas-wms.js` | F: novo `pesos_volumes.js` + alteração em `recebimento.js`. Merge em `logistica.html`. |
| 11 | NF: fabricação e validade obrigatórias no faturamento + conserto do campo de validade do lote | não temos | 54fdb70 | `functions/dados_nf.js`, `functions/faturamento_carga.js`, `functions/expedicao_regras.js` (`validadeLote`), `shared/dados-nf.js`, `shared/faturamento-tela.js` (`validacaoNF`), `faturamento.html`; T: `run_dados_nf_test`, `run_faturamento_nf_ui_test`, `run_carga_parcial_*` | `faturamento.html`, `faturamento-tela.js`, `functions/faturamento_carga.js` | F: novo `dados_nf.js`. Merge. |
| 12 | Compras: ajustar a quantidade do PC antes de receber e encerrar o saldo de PC recebido em parte, liberado ao módulo Compras | não temos | 50eab0e, 606bd0f | `shared/ajuste-pc.js`, `compras.html` (`abrirModalAjustarPC`, `podeAjustarPC`); T: `run_ajuste_pc_*` | `compras.html` (alterado por nós em COM-05) | Merge em `compras.html`, que tem mudanças nossas. Regra: ver `pedidos_compra`. |
| 13 | Compras: fechar a cotação com um fornecedor só (cotação parcial) | não temos | e14cd39 | `compras.html` (`gerarPedidoDoFornecedor`, `itensFechaveisDoConvidado`, `reservarItensDaSolicitacao`), `shared/cancelamento-pc.js`, `shared/necessidade-pedidos.js`; T: `run_cotacao_parcial_test` | `compras.html`, `cancelamento-pc.js` | Merge. Atenção à integração COM-05 (cotação do CRM abre SC). |
| 14 | Compras: vínculo cliente/pedido do PC sugere só pedidos que usam o material (BOM/fórmula); pedido 95% produzido não pede material | não temos | 76a7040, 671f5ee, 96df7d6 [pré-12/10] | `shared/pedidos-do-material.js`, `compras.html` (`usaMaterial`), `insumos.html`, `shared/necessidade-pedidos-tela.js`, `utils.js` (`pedidoFinalizado`); T: `run_pedidos_do_material_test`, `run_vinculo_pc_demanda_ui_test` | `compras.html`, `insumos.html` | Merge. Conferir o efeito no motor MRP (`calcularMrpMaterial`). |
| 15 | Pesagens: o que foi pesado no dia e pendências de pesagem antes do envase | não temos | f2090df | `pesagens.html`, `shared/pesagens-dia.js`; T: `run_pesagens_dia_*` | — | M: incluir `pesagens.html` em `manipulacao`, `conferencia_pesagem`, `planejamento` e `emitir_op` (G:`auth_check.js:99,106,108,110`). Só leitura, sem regra nova. |
| 16 | Entrada avulsa de PA sem OP (devolução de item antigo): quarentena, laudo, vínculo a pedido na expedição e crédito do pedido por estoque | não temos | 2eab676 | `shared/entrada-avulsa-pa.js`, `devolucoes.html` (`renderAvulsa`), `expedicao.html`, `shared/expedicao-grade-tela.js` (`abrirVinculoEstoque`), `functions/expedicao.js`, `functions/expedicao_regras.js`, `shared/kardex.js`; T: `run_entrada_avulsa_pa_*` | `devolucoes.html`, `expedicao-grade-tela.js` | F + merge. Depende do item 1 (conciliação). |
| 17 | Expedição: desmembrar palete de PA na Montar Carga; "Miss Rose" = "MISS ROSE" (cliente sem acento/caixa/espaços) na carga, na agenda e nos filtros | não temos | 4444bbf, 378febf, f3d9c0f | `shared/desmembrar-palete.js`, `expedicao-grade-tela.js` (`abrirDesmembrar`), `functions/expedicao_regras.js` (`chaveNomeCliente`, `mesmoCliente`), `functions/agenda_expedicao.js`, `shared/expedicao-grade.js`, `utils.js` (`chaveNome`), `cadastros.html`, `planejamento.html`, `relatorio_expedicao.html`, `dashboard_analise.html`; T: `run_desmembrar_palete_*`, `run_chave_nome_test`, `run_agenda_expedicao_test` | arquivos homônimos (versão 05/10) | F + merge. Sem nó novo (`estoque_lotes`, `movimentos_estoque`). |
| 18 | WMS: Movimentar com busca pelo item e divisão do lote em paletes; Endereçamento recusa excesso, recusa PA e filtra por dono; busca avisa saldo sem posição; script de regularização | não temos | f9a1b7d, 1df12b6, 3c7c0e6, c8dbd4f | `shared/movimentacao-wms.js` (`buscarLotes`, `planejarDivisao`), `shared/movimentar-tela.js`, `shared/movimentar.css`, `estoque.html` (`edSemEnderecoPorDono`), `movimentar.html`; T: `run_movimentar_busca_divisao_ui_test`, `run_enderecamento_trava_ui_test`, `run_movimentacao_wms_test` | arquivos homônimos | Merge. Respeitar a regra "WMS e Estoque desacoplados" do CLAUDE.md. |
| 19 | Titularidade do estoque: alterar de quem é o material (Kuryos/cliente), com motivo, Cloud Function e Kardex | não temos | e6ad1fc | `titularidade.html`, `shared/titularidade.js`, `shared/titularidade-tela.js`, `functions/titularidade.js`, `functions/index.js` (`alterarTitularidadeEstoque`), `shared/kardex.js`; T: `run_titularidade_*` | `shared/propriedade-estoque.js` (dono vem do PC, sem tela de troca) | M: `titularidade` (G:`auth_check.js:151`), fora de `MODULOS_POR_PAPEL`. F: export `alterarTitularidadeEstoque`. |
| 20 | Qualidade: rascunho do laudo e da análise do granel na Fila de Inspeção; busca e filtros na Fila e nas RNCs; link do Histórico abre a RNC filtrada; liberar bulk com restrição | não temos | d3a0fcb, f609e1e, cc44503 [pré-12/10] | `shared/rascunho-cq.js`, `shared/filtro-qualidade.js`, `qualidade.html` (~50 funções novas), `qualidade_historico.html`, `shared/manipulacao.js` (`restricao`, `rotuloCompleto`), `manipulacao.html`; T: `run_rascunho_cq_*`, `run_filtro_qualidade_*`, `run_manipulacao_*` | `qualidade.html`, `manipulacao.js` | R: `qualidade_rascunhos`. É o maior merge de tela (`qualidade.html`). |
| 21 | Motor de checklists editáveis e versionados (A2) | não temos | 9c02f76 | `checklists_cq.html`, `shared/checklists.js`, `shared/checklists-tela.js`, `shared/checklists-modelos-padrao.js`; T: `run_checklists_*` | — | R: `checklist_modelos`. Página em `qualidade.paginas`. Pré-requisito do item 2. |
| 22 | Consulta de Estoque: relatório PDF com logotipo, exportar empenho por OP (CSV com decimal correto), quem está segurando o empenho, cliente do PA na mesma chave | não temos | ead2201, faf8463, 965c616, cba0da1 [pré-12/10], 9081a8a [pré-12/10] | `shared/consulta-estoque-pdf.js`, `shared/consulta-estoque-tela.js` (`gerarPdf`, `exportarEmpenhos`), `shared/consulta-estoque.js` (`situacaoEmpenho`, `unificarClientesDosProdutos`), `consulta_estoque.html`; T: `run_consulta_estoque_*` | arquivos homônimos | Merge direto. Respeitar a regra "não exibir saldo como confiável" até o Dia D. |
| 23 | Kardex geral (entradas e movimentos de todos os itens), "Ver kardex" em Lotes Vencendo, relatório de entradas de materiais no Histórico da Logística, painel de movimentações no Histórico do Estoque/WMS | não temos | e32e31b, 69cb574, b510c80, cda6363 | `shared/kardex.js` (`movimentosGerais`, `csvGerais`), `kardex.html`, `estoque.html` (`iniciarPainelMovimentos`), `shared/relatorio-entradas.js`, `logistica.html`, `shared/painel-movimentos*.js/.css`; T: `run_kardex_*`, `run_relatorio_entradas_*`, `run_painel_movimentos_*`, `run_lotes_vencendo_kardex_test` | `kardex.html` (só por item), `logistica.html` | Merge. Só leitura. |
| 24 | Auditoria do sistema: eventos de programação, apontamento assinado com o login, eventos de chão de fábrica e **toda gravação das telas** em `auditoria_geral` | não temos | 42e95de, 7d0d2cd, 0a5e577, b479907, 1d65efe [pré-12/10]; c2cde70 | `auditoria.html`, `shared/auditoria-escritas.js` (envolve `set/update/push/remove/transaction`), `shared/eventos-auditoria.js`, `shared/auditoria-tela.js`, `form.html` (`assinaturaApontamento`, `registrarEventoAuditoria`), `historico.html`, `planejamento.html` (`registrarEventoProg`), `auth_check.js:290-293,526-527`; T: `run_auditoria_*`, `run_eventos_auditoria_test` | — | M: `auditoria` (G:`auth_check.js:153`). R: `eventos_auditoria`, `auditoria_geral` (G:`database.rules.json:452,465`). **Risco:** o gancho envolve o SDK em todas as páginas, inclusive o CRM React incorporado e as telas de custos/fin/ctl, então é preciso definir a lista de nós sensíveis do nosso lado (`fin`, `ctl`, `custos`, `resultado`). |
| 25 | Painel de Controle: gargalos por etapa (fila, idade, SLA), cobrança por setor, Comercial/pedidos/cadastro e cadastros incompletos dos SKUs em uso | temos diferente (parcial) | e3ddcd0, e2497d2, 37dd249 | `painel.html`, `shared/painel-gargalos.js` (SLA em `config/painelSlaHoras`); T: `run_painel_*` | `dashboard_setorial.html` + `shared/sector-dashboard.js` (contagens por setor, sem idade/SLA); `shared/pendencias-setor.js` | M: `painel` (G:`auth_check.js:141`). Ler `config/painelSlaHoras`. Decidir a convivência com o dashboard setorial. |
| 26 | Menu lateral por registro único de telas + tela Início com "Precisa de você" + identidade Kuryos no menu | temos diferente | 072bc4d, 428d99e, 4be40e0, 59b0547 | `shared/navegacao.js`, `inicio.html`, `auth_check.js`, `login.html`; T: `run_navegacao_test`, `run_inicio_ui_test`, `run_menu_sanfona_ui_test` | `auth_check.js:779-1118`, `shared/kuryos-enterprise-shell.js/.css` | Ver §b. |
| 27 | Comercial: aba "Acompanhar pedido" com lista filtrável (a produzir, decidir, aguardando expedição, concluídos, cancelados) e expedido pela mesma conciliação; Gestão: carteira só com itens abertos, "A produzir" × "Produzido sem saída", linhas encerradas/faltantes | temos diferente (carteira) / não temos (Acompanhar) | b3ddc7d, 2dfd744, a36b101, 185d235, 88af61e, c846e3f | `comercial.html` (`renderDocLista`, `docExpedido`), `gestao_comercial.html` (`visaoCarteira`), `shared/gestao-comercial.js` (`somaAbertos`); T: `run_acompanhar_pedido_ui_test`, `run_gestao_comercial_*` | `comercial.html`; `gestao_comercial.html:446,662` (KPI "Carteira: A produzir · pronto") | Merge. Conferir colisão com o fluxo CRM→pedido (`shared/crm-para-pedido.js`). |
| 28 | Responsável comercial por cliente, com atribuição em lote e filtro "meus clientes" | não temos | 864f950 | `shared/responsavel-comercial.js`, `gestao_comercial.html` (`caAbrir`… `filtroResponsavel`), `cadastros.html` (`preencherResponsavelCli`), `shared/gestao-comercial.js`; T: `run_responsavel_comercial_*` | — | R: `clientes/$cliente/responsavelComercialId|Nome` (G:79-87) e `comercial_config`. Avaliar contra o CRM (o CRM1 já tem dono de conta?). |
| 29 | Painel de pendências de Fórmula/BOM/Especificação em Cadastros › Produtos | temos diferente | a8a12aa [pré-12/10] | `shared/pendencias-produto.js`, `cadastros.html` (`renderPainelPendencias`, `tagPendencia`); T: `run_pendencias_produto_*` | `shared/pendencias-setor.js` (`1cec206`): pendência nasce **na Emissão de OP** e vai ao setor dono em `pendencias_setor/` | Decidir se os dois coexistem (o deles lista o catálogo inteiro; o nosso, o que travou uma OP). |
| 30 | Padrão de nome do material (embalagem: TIPO + descrição + medida, sem nome repetido), caixa de embarque pelo un/cx do produto, BOM/Fórmula mostram o nome atual do insumo | temos diferente (nome) / não temos (caixa, nome atual) | 959b3e8, 587a230 | `shared/nome-material.js`, `cadastros.html` (`caixaDoProdutoNoBom`, `nomeAtualDoMaterial`), `form.html`; T: `run_nome_material_test`, `run_bom_caixa_uncx_ui_test`, `run_bom_nome_atual_ui_test` | `shared/duplicidade-material.js` + índice `materiais_chave` (CAD-01, `8feb59c`, `c897585`, `5a8a8ac`): bloqueio de nome duplicado **no servidor** | Decisão (ver §c). "Nome atual" e "caixa un/cx" são merge simples em `cadastros.html`. |
| 31 | Exportar produtos, materiais, fórmulas, BOM, especificações, clientes e fornecedores para Excel, com aba de conferência | não temos | d9c20a3 | `shared/exportar-cadastros.js`, `cadastros.html`; T: `run_exportar_cadastros_test` | `utils.js` já carrega XLSX 0.18.5 do cdnjs (linhas 6-10), mas sem exportação de cadastro | Merge simples, só leitura. |
| 32 | Dossiê do lote: seção Perdas com todas as etapas; busca por data (produção, emissão, confirmação; digitada ou por intervalo) e coluna Produção | não temos | ec1a97f [pré-12/10], fdddf58 | `shared/dossie-lote.js` (`perdasDoLote`, `passaDatasDoTermo`), `dossie_lote.html` (`secaoPerdas`, `filtroData`); T: `run_dossie_perdas_ui_test`, `run_dossie_busca_data_*` | `dossie_lote.html`, `dossie-lote.js` | Merge. Só leitura. |
| 33 | Dashboard Geral: produção só no envase, Setor como filtro de primeira classe, produção pertence ao dia do apontamento | não temos | 8244201, 3deb77d [pré-12/10], cf18195 | `dashboard_analise.html` (`setorDoRegistro`); T: `run_dashboard_geral_setor_test`, `run_dashboard_geral_dia_test` | `dashboard_analise.html` | Merge. Afeta o realizado de Custos/Placar, que lê a mesma produção: conferir. |
| 34 | Usuários: desativar **e excluir** (com `usuarios_removidos`) e travar o duplo clique no cadastro/login | temos diferente | 6d63a68 | `shared/gestao-usuarios.js`, `usuarios.html` (`excluirUsuario`, `reativarUsuario`), `login.html` (`travarEnvio`); T: `run_gestao_usuarios_test`, `run_usuarios_ui_test` | `usuarios.html:419-443` (desativar/reativar), `ece5e07` (cadastro pelo ADM, esqueci a senha), `e08668c` (várias funções) | R: `usuarios_removidos`. Merge com o nosso modelo de várias funções. |
| 35 | UI global: lista suspensa única (substitui `<datalist>` em todas as telas) e cabeçalho de tabela congelado em todas as telas | temos diferente (sticky parcial) / não temos (lista) | 93322fc, 8f2ced1 | `shared/lista-suspensa.js` (`KtListaSuspensa`, carregado em `auth_check.js:6`), `shared/tabela-fixa.js` (carregado em `auth_check.js:307-313`); T: `run_lista_suspensa_ui_test`, `run_tabela_fixa_test` | `position:sticky` pontual em `kardex.html:55` e `cadastros.html:62,282`; nada equivalente à lista | Carregar pelos `auth_check.js`. Testar contra o shell (`kuryos-enterprise-shell.css` tem topbar sticky, `top:0; z-index:9400`, linha 106) e contra o React do CRM. |
| 36 | Manutenção › Ativos (máquinas e equipamentos) | não temos | 48e390a | `ativos.html`, `manual_ativos.html`, `shared/ativos.js`, `shared/ativos-tela.js`; T: `run_ativos_*` | — | M: `manutencao` (G:`auth_check.js:129`). R: `ativos`, `ativos_historico` (G:`database.rules.json:279`). |
| 37 | Auditoria 5S (checklist do líder com foto obrigatória, auditoria da Qualidade, inspeção da Diretoria, setores/áreas editáveis, auditor-líder em rodízio) | não temos | 6777405, 9410956, 8a50f02, e5232d7 [pré-12/10] | `auditoria_5s.html`, `manual_auditoria_5s.html`, `shared/auditoria-5s.js`, `shared/auditoria-5s-tela.js`, `shared/fotos-qualidade.js`; T: `run_auditoria_5s_*` | — | M: `auditoria5s` (G:124). R: `auditoria5s_config`, `auditorias_5s`, `acoes_5s`, `ciencia_5s`, `ocorrencias_5s` (G:302). Depende de Storage para fotos. |
| 38 | RH › Temporários (convocação, fechamento semanal, pagamentos, atrasos, cadastro, histórico) | não temos | 3c7022a, 9c83020 [pré-12/10] | `rh_temporarios.html`, `manual_temporarios.html`, `shared/temporarios.js`, `shared/temporarios-tela.js`, scripts de importação; T: `run_temporarios_*` | — | M: `rh_temporarios` (G:163), também em `MODULOS_POR_PAPEL.rh`. R: 6 nós `rh_temporarios*` (G:549). Dado sensível (CPF/Pix). |
| 39 | RH › Feedback da Semana e Feedback e Clima (pares, líder, pesquisa de clima, dashboard do RH) | não temos | 9dcb434 [pré-12/10] | `feedback.html`, `rh_feedback.html`, `manual_feedback.html`, `shared/feedback-clima.js`, `shared/feedback-tela.js`, `shared/rh-feedback-tela.js`, `rh_cadastros.html` (`setoresConhecidos`); T: `run_feedback_clima_*`, `run_rh_cadastros_feedback_ui_test` | `rh_cadastros.html` | M: `feedback` (G:159; o G dá a **todos** os papéis em `MODULOS_POR_PAPEL`, linhas 172-179) e `rh_feedback`. R: 8 nós `feedback_*`/`clima_*` (G:605). |
| 40 | Roadmap do sistema (checklist automático do backlog, `backlog.json` gerado do repositório) | não temos | 51a6813 | `backlog.html`, `public/backlog.json`, `scripts/gerar-backlog.js`; T: `run_backlog_*` | `MELHORIAS_FUTURAS.md` (sem tela) | M: `backlog` (G:137). O gerador lê os .md **dele**, então seria preciso apontá-lo para o nosso `MELHORIAS_FUTURAS.md`. |
| 41 | Custos e Resultado (LP, LPD, metas, bonificação) | já temos (estamos à frente) | dadf484, 13b2b04, 572b764 (só docs) | `PLANO_CUSTOS_RESULTADO.md` | `custos.html`, `placar.html`, `shared/custos-*.js`, `functions/custos*.js`, `resultado-pontos.js` (`896ad25`…`087dfd7`) | Nada. Ele tem o plano; nós temos a implementação. |
| 42 | Categorias de produto (`config/categoriasProduto`) | já temos (idêntico) | — (não alterou depois de 05/10) | G:`cadastros.html:3305-3425` | N:`cadastros.html:3727-3850` | Nada. Ver §d. *(Fora da contagem: não é mudança dele.)* |
| 43 | Scripts de saneamento de dados | n/a | 7e347c1, c3d4336, b45cbf5, 71eda01, 6d63a68, c8dbd4f, 33fe412, df8f281, 864f950 | `scripts/corrigir-*.js`, `sanear-vinculos-pedido.js`, `limpar-logins-duplicados.js`, `regularizar-pa-hig-next-0001.js`, `liberar-empenho-op-encerrada.js`, `ensaio-*.js` | — | Rodaram no `prod-kuryos`. Se o nosso banco tiver a mesma base, reavaliar cada um em ensaio no `erpkuryos`. |

Contagem final (itens 1–41): **já temos 1** (41) · **temos diferente 9** (7, 8, 25, 26, 27, 29, 30, 34, 35; os itens 7, 27, 30 e 35 têm também parte "não temos") · **não temos 31** (1–6, 9–24, 28, 31–33, 36–40). Com o item 42 (idêntico, não alterado), 42 linhas de funcionalidade.

Commits só de documentação ou status, não incluídos: 826219f, ed99b05, 95a1909, b160725, 6e445e5, a6a52e2, 5326a29, 48926c1, 4d73581, 2789d04, 3f9da8c, 934e7e3, 9436c28, 6c49b4b, a7c0589, c2a445f, c235a6f, 2aa5463, e505da9, cc65be3, 720bb97, 24d5f08, bc905d7 e os merges 1f0291a, 6e0a301, 525a837. O b160725 contém o **plano de ação das fases 3 e 4 do CQ**, que vale ler antes de portar os itens 2–5, 20 e 21.

---

## (b) Menu lateral

### b.1 Como o menu do Gustavo é montado

**Registro único: G:`public/shared/navegacao.js`** (366 linhas, UMD, exporta `window.KuryosNav`). É um módulo puro, sem DOM.

- **`BLOCOS`** (linhas 20-21) define a ordem dos blocos: Analytics → Comercial → Pedidos e Rastreio → PCP → Compras → Armazém → Operação → Qualidade → Expedição → Manutenção → Cadastros → ADM → RH → Ajuda.
- **`TELAS`** (linhas 29-160) traz uma entrada por tela, com os campos:
  - `p`: página;
  - `h`: href com `?tab=`/`?setor=`;
  - `r`: rótulo (texto ou função do ctx);
  - `i`: ícone;
  - `b`: bloco (texto ou função, quando a "casa" depende de quem olha);
  - `s`: subtítulo;
  - `q`: condição extra;
  - `fam`: páginas que também acendem o link (ex.: `EXPEDICAO = ['expedicao.html','faturamento.html','cargas.html']`, linha 23);
  - `o`: posição.

  As posições especiais de `inspecao_total`, `liberacao_linha` e `pesagens` são ajustadas nas linhas 178-184.
- **`VISUAL`** (linhas 164-170) dá a cada bloco `[ícone, cor]`, com AZUL=`var(--s1)`, VERDE=`var(--s3)`, OURO=`var(--s2)` e NEUTRO=`var(--ink-soft)`. Os tokens `--s1/--s2/--s3` estão em `shared/theme.css:21-23`, que é **idêntico** nos dois repos.
- **`blocos(ctx)`** (linhas 188-215) recebe `ctx = {podeAbrir(pagina), temMod(modulo), setores:{producao,manipulacao,rotulagem,gestao}}` e:
  - filtra por `podeAbrir`, que é a mesma regra de acesso da página: "se o link aparece, a página abre";
  - remove duplicatas por href, resolve bloco/rótulo/subtítulo;
  - ordena por `o` e agrupa por subtítulo;
  - descarta blocos vazios.
- **`CARTOES`** (linhas 248-338) define os cartões da tela Início: inspeção total, pesagens a cobrar, cargas a faturar, cargas para carregar, RNC abertas, filas por setor (`cartaoFila`, linhas 229-246, usando `SequenciaSetor.etapa`), SC para aprovar, SC para cotar, PC para enviar, PC atrasados, devoluções a receber e descartes.
  - `cartoesVisiveis(ctx)` fica nas linhas 341-343, `fontesNecessarias` nas 346-350 (só lê os nós do banco que os cartões visíveis precisam) e `pendencias` nas 353-362 (alertas primeiro).

**Renderização: G:`public/auth_check.js`.**

- **Carga do registro:** linha 295, `document.write('<script src="shared/navegacao.js">')` síncrono. A linha 293 faz o mesmo com `auditoria-escritas.js`.
- **CSS da sidebar:** está inline no `auth_check.js`, linhas 321-421. Não há arquivo CSS separado para o menu. Seletores:
  - `.kt-sidebar` (232 px, vidro fosco);
  - gaveta ≤980 px com `.kt-hamburger`/`.kt-backdrop` (linhas 350-374);
  - **identidade Kuryos** (`59b0547`, linhas 376-382): `.kt-brand` em bloco azul-marinho com gradiente `#050f38 → #0a1c69 → #2e4fc0`, círculo decorativo `::after` e `.kt-brand-logo` com `filter: brightness(0) invert(1)`, mais `.kt-brand-sub` ("Sistema de Produção");
  - `.kt-nav-group { --tom }`, `.kt-cap-ico` (quadrado de 26 px tingido pela cor do bloco, cheio quando `.tem-ativo`), `.kt-cap-n` (contador, só com o bloco fechado) e `.kt-cap-chev`;
  - `.kt-nav-body` com **trilho colorido** `border-left: 2px solid color-mix(--tom 28%)`;
  - `.kt-nav-top` (link Início destacado) e `.kt-nav-sub` (subtítulo);
  - `.kt-nav-link.active` com **gradiente** `#0a1c69 → #2e4fc0` e variantes para o tema escuro (linhas 410-412);
  - `.kt-sidebar-foot` em cartão e `.kt-avatar` em gradiente (linhas 414-419).
- **Ícones:** `ktIcons`/`ktIcon` nas linhas 623-651 (dashboard, history, calendar, gear, list, tag, box, sliders, pencil, people, chart, cart, truck, warehouse, clipboard, book, flask, alert).
- **`ktLink(href, icon, label, activePage, fam)`** nas linhas 652-669 compara só o nome do arquivo e trata `fam` e `?setor=`.
- **`renderUnifiedNavbar`** nas linhas 672-802:
  - `grupo(titulo, links)` (711-723) monta o bloco com ícone e cor de `KuryosNav.VISUAL`;
  - `navCtx` nas linhas 733-737;
  - `gruposHtml = KuryosNav.blocos(navCtx).map(...)`, com subtítulo inserido quando `it.s` muda (738-746);
  - o link **Início** fica fora dos blocos (748);
  - a marca + Início + grupos + rodapé ficam nas linhas 755-763.
- **`montarSanfona`** nas linhas 813-845 (`KT_SANFONA_MIN_LINKS = 11`):
  - abre o bloco da tela atual mais o último aberto, lembrado em `localStorage` pela chave `kt.menu.aberto.<uid>`;
  - bloco de um link só fica `.fixo`.
- **Acesso:**
  - `KURYOS_MODULOS` nas linhas 87-165, `MODULOS_POR_PAPEL` nas 170-181 e `PAGINA_MODULOS` derivado nas 186-194;
  - `podeAbrirPagina` (251-256) libera página fora do mapa para qualquer autenticado; é o caso de `inicio.html` e dos manuais;
  - `homeDoUsuario` (263-271) leva **todo usuário com algum módulo ao `inicio.html`**.
- **Tela Início:** G:`public/inicio.html` (227 linhas). Carrega `navegacao.js`, `manipulacao.js`, `pesagens-dia.js`, `inspecao-total-pa.js`, `cargas-pa.js`, `sequencia-setor.js` e `perdas-etapa.js` (linhas 12-20). Funções:
  - `desenharAreas()` (167): atalhos por bloco com `VISUAL`;
  - `desenharPendencias()` (191): `KuryosNav.pendencias`;
  - faixa de abertura em gradiente com saudação e papel (`428d99e`).
  - Observação: tem `preconnect` fixo para `prod-kuryos-default-rtdb` (linha 8), que precisa ser trocado ao portar.

### b.2 Blocos do Gustavo, em ordem, com subtítulos e telas

Fonte: G:`navegacao.js:29-160`. Os blocos são vistos como admin; para outros perfis, uma tela pode morar em outro bloco.

| Bloco | Subtítulo | Telas (rótulo → página) |
|---|---|---|
| *(topo, fora dos blocos)* | — | Início → `inicio.html` |
| Analytics | — | Painel de Controle → `painel.html`; Dashboard Diário → `dashboard.html`; Dashboard Geral → `dashboard_analise.html` |
| Comercial | — | Pedidos e Orçamentos → `comercial.html`; Gestão Comercial → `gestao_comercial.html`; Devoluções de Cliente → `devolucoes.html` (com `comercial`; senão Armazém; senão Qualidade) |
| Pedidos e Rastreio | — | Pedidos → `pedidos.html`; Relatório de Pedido → `relatorio_pedido.html` (vai para Comercial quem só tem `comercial`); Dossiê do Lote → `dossie_lote.html` (com `emitir_op`; senão Qualidade); Histórico de Apontamentos → `historico.html` (para quem tem setor produção/rotulagem: Operação) |
| PCP | — | Planejamento; Controle de OPs; Emitir OP; Pesagens (gestão) / Pesagens do dia (Operação › Manipulação); Matriz de Insumos (MRP); O que comprar (para quem só tem Compras: no bloco Compras); Inspeção Total de PA (para quem tem `planejamento` sem `qualidade`) |
| Compras | — | Compras → `compras.html` (+ O que comprar, conforme acima) |
| Armazém | Estoque | Consulta de Estoque; Estoque (`estoque.html?tab=agregado`); WMS (`?tab=posicoes`); Titularidade do Estoque; Kardex; Movimentar material |
| Armazém | Fluxo | Agendamentos (`logistica.html`); Próximas Separações (`proximas_ordens.html?setor=separacao`); Separação de Materiais; Conferência de PA (`estoque.html?tab=conferenciapa`); Descarte e Reversa |
| Operação | Produção | Próximas Ordens (`?setor=envase`); Apontamento (`form.html`); Liberação de linha (sem `qualidade`); Inspeção Total de PA (sem `qualidade`/`planejamento`); Estoque da Fábrica |
| Operação | Manipulação | Próximas Ordens (`?setor=manipulacao`); Pesagem e Manipulação / Conferência de Pesagem; Pesagens do dia; Estoque da Manipulação |
| Operação | Rotulagem | Próximas Ordens (`?setor=rotulagem`); Apontamento (se não tiver Produção); Estoque dos Rótulos |
| Operação | — | Material em Processo |
| Qualidade | — | Fila de Inspeção (`qualidade.html?tab=fila`); Não Conformidades (`?tab=rnc`); Inspeção Total de PA; Liberação de linha; Histórico e Indicadores; Retrabalhos; Modelos de checklist (`checklists_cq.html`); Auditoria 5S; (+ Devoluções e Dossiê no fim, conforme o perfil) |
| Expedição | — | Expedição de Vendas → `expedicao.html` (acende também em `faturamento.html`/`cargas.html`); Relatório de Expedição |
| Manutenção | — | Ativos → `ativos.html` |
| Cadastros | — | Cadastros → `cadastros.html` |
| ADM | — | Ajustes / Config → `admin.html`; Usuários; Auditoria → `auditoria.html`; Roadmap do sistema → `backlog.html` |
| RH | — | Dash; Colaboradores; Avaliação de Desempenho; Férias; Temporários; Feedback da Semana; Feedback e Clima |
| Ajuda | — | Manuais de Operação; Apontamento; Planejamento e OPs; Pedidos e MRP; Compras; Recebimento; Estoque e WMS; Qualidade; Auditoria 5S; Ativos; Temporários; Feedback e Clima; Cadastros; Administração; Referência do Sistema |

**Testes dele:**

- **G:`run_navegacao_test.js`** (195 linhas, Node puro): extrai `KURYOS_MODULOS`/`MODULOS_POR_PAPEL` do `auth_check.js`, monta o menu de ~14 perfis e verifica:
  - pendente só vê Ajuda e vai para `login.html`;
  - logística vai para `inicio.html`;
  - admin vê todos os blocos;
  - ordem exata do PCP: `['Planejamento','Controle de OPs','Emitir OP','Pesagens','Matriz de Insumos (MRP)','O que comprar']`;
  - subtítulos da Operação em ordem;
  - `fam` da Expedição;
  - cartões visíveis por perfil (linhas 131-137).
- **G:`run_menu_sanfona_ui_test.js`** (182 linhas, 8 linhas alteradas no `072bc4d`): teste de UI da sanfona.
- **G:`run_inicio_ui_test.js`** (100 linhas): teste de UI da tela Início.

### b.3 Como é o nosso

N:`public/auth_check.js`:

- **`KURYOS_MODULOS`** (197-260): tem `pd`, `custos`, `placar`, `financeiro`, `controladoria` e analytics com executivo/setorial. **Não tem** `auditoria5s`, `manutencao`, `backlog`, `painel`, `titularidade`, `auditoria`, `feedback`, `rh_feedback` nem `rh_temporarios`, e não inclui `pesagens.html`, `liberacao_linha.html`, `inspecao_total.html` nem `checklists_cq.html` em `paginas`.
- **`MODULOS_POR_PAPEL`** (265+) tem os papéis `tv` e `placar`, que ele não tem; ele tem `feedback` em todos os papéis, que nós não temos.
- **`homeDoUsuario`** (382) percorre `ORDEM_HOME` (379), que começa em `dashboard_executivo.html`. Não existe `inicio.html`.
- **`renderUnifiedNavbar`** (779-1118):
  - `grupoIcone(titulo)` por regex (814-826): ícone por bloco, **sem cor por bloco**;
  - `grupo()` (827-837);
  - **links escritos à mão, cada um com o seu `temMod(...)` e exclusões `!temMod(...)`** (845-1055);
  - **ordem dos blocos** (1065): Analytics → Cadastros → Comercial → Compras → PCP → Logística → Qualidade → Operação → Financeiro → ADM → RH → Ajuda;
  - marca em `<button class="kt-brand">` com `kuryos-brand-mark` "K" + logo (1063), dentro de `<nav class="kuryos-sidebar-nav">`.
- **`ktLink`** (759) não tem o parâmetro `fam`. **`montarSanfona`** (1129-1145+) é igual à dele, com `KT_SANFONA_MIN_LINKS = 11`.
- **CSS:** inline em `auth_check.js:436-520` (`.kt-sidebar` 436, `.kt-brand` 490, `.kt-nav-link.active` em cor sólida `var(--accent)`, linha 518), mais as folhas carregadas por `auth_check.js:1808-1852`:
  - `kuryos-apple-system.css` (seletores `.kt-*` nas linhas 159-201, 363, 387);
  - `kuryos-enterprise-shell.css` (59-198: topbar sticky, breadcrumb e recolher);
  - `kuryos-repo-visual.css`, que faz `@import` de `kuryos-ui-tokens.css`/`kuryos-ui-layout.css` (`.kt-*` nas linhas 7-257);
  - `kuryos-erp-ref.css`.
- **`kuryos-enterprise-shell.js`** (314 linhas) lê o menu já renderizado (`.kt-nav-group`/`.kt-nav-link`, linhas 23-150) para montar breadcrumb, busca de telas, recolher e sino. Ou seja, **depende das classes `kt-nav-*`**, que o Gustavo manteve: um port do registro único é compatível com o shell, desde que `.kt-cap-txt` continue existindo (o dele tem, na linha 719).
- **Teste:** temos `run_menu_sanfona_ui_test.js` (versão de 29/09). Não temos `run_navegacao_test.js` nem `run_inicio_ui_test.js`.
- **Histórico:** em 20/10 testamos um menu no topo e voltamos atrás (`1854f96` → `8d31f18`; memória "sidebar inteligente").

### b.4 Diferenças de conteúdo

- **Telas do nosso menu que não existem no dele:**
  - Visão Executiva 360° (`dashboard_executivo.html`), Indicadores Setoriais (`dashboard_setorial.html`), Custos e Resultado (`custos.html`), Placar da fábrica (`placar.html`);
  - CRM 1 · Clientes / CRM 2 · Projetos / CRM 3 · Amostras (`crm1/2/3.html`), P&D (`pd.html`), Kickoffs (`kickoffs.html`), Contratos CGI (`contratos.html`), Gerenciar cards do CRM (`crm-admin.html`), todos reescritos para `crm-app.html` pelo `vercel.json`;
  - bloco **Financeiro** (Financeiro `financeiro.html`, Controladoria `controladoria.html`);
  - ícones `bank`, `scale` e `document`.
- **Telas do menu dele que não existem no nosso:** Início, Painel de Controle, Pesagens, Titularidade do Estoque, Liberação de linha, Inspeção Total de PA, Modelos de checklist, Auditoria 5S, Ativos (bloco Manutenção), Auditoria, Roadmap do sistema, Temporários, Feedback da Semana, Feedback e Clima e os manuais Auditoria 5S/Ativos/Temporários/Feedback.
- **Reorganização dele sem tela nova:**
  - Logística dividida em **Armazém** (subtítulos Estoque/Fluxo) e **Expedição**; as 3 etapas viram 1 link com `fam`;
  - Pedidos/Relatório/Dossiê/Histórico saem do PCP para **Pedidos e Rastreio**;
  - `admin.html` sai do PCP e vai para **ADM** (no nosso está no bloco PCP, `auth_check.js:914`).
- **Para portar** o registro único é preciso:
  - acrescentar ao `TELAS` as nossas entradas (Analytics executivo/setorial/custos/placar, as 7 telas do CRM, o bloco Financeiro);
  - incluir `'Financeiro'` em `BLOCOS`/`VISUAL`;
  - adicionar os ícones `bank`/`scale`/`document` ao `ktIcons`;
  - manter `kickoffs.html` visível ao papel `qualidade` (hoje `user.role === 'qualidade'`, `auth_check.js:881`) via `q`;
  - manter `crm-admin` só para admin.

  A parte visual (`59b0547`) são ~50 linhas de CSS inline que precisam ser conciliadas com `kuryos-apple-system.css`/`kuryos-ui-layout.css`, que já sobrescrevem `.kt-*`.

---

## (c) Itens "temos diferente" que pedem decisão do dono

1. **Emitir OP sem Fórmula + BOM + Especificação aprovadas (item 7).**
   - Ele bloqueia para **todo** SKU: decisão de 24/10, "vamos bloquear, pra ter que ajustar tudo na marra".
   - Nós travamos só SKU do CRM (`prontidao-op.js`, PCP-02) e deixamos o legado com aviso.
   - Escolher entre trava total, trava só CRM, ou trava total com prazo de transição.
2. **Encerramento de pedido (item 8).** O nosso encerra o pedido inteiro (`statusManual`); o dele encerra linha a linha, com motivo, e permite "Reabrir saldo". É preciso escolher um modelo, porque os dois gravam em `pedidos/` e a regra `.validate` dele recusaria o nosso fluxo se fosse publicada sem ajuste.
3. **Padrão de nome × duplicidade de material (item 30).** O nosso CAD-01 recusa nome repetido **no banco** (`materiais_chave`, qualquer tipo). O dele exige formato de nome para embalagem (TIPO + descrição + medida, ≥3 palavras, com número) e recusa repetido só no cliente. São complementares, mas é preciso decidir se o padrão de nome entra e se a recusa de repetido dele fica redundante.
4. **Pendências de cadastro (item 29) e Painel de Controle (item 25).** Ele mostra o catálogo inteiro de pendências em Cadastros e um painel de gargalos com SLA. Nós temos pendência nascida na Emissão de OP por setor (`pendencias_setor`) e um dashboard setorial sem idade/SLA. Decidir se coexistem ou se um absorve o outro.
5. **Menu lateral + tela Início (item 26).** Adotar o registro único dele (`navegacao.js`), acrescentando as nossas telas de CRM, Custos e Financeiro, ou manter o nosso menu à mão. Decidir também se a porta de entrada passa a ser `inicio.html` (dele) ou continua `dashboard_executivo.html` (nosso `ORDEM_HOME`), e se Logística vira Armazém + Expedição.
6. **Usuários (item 34).** Nós temos várias funções por usuário + desativar/reativar. Ele tem excluir de fato (com `usuarios_removidos`). Decidir se "excluir" entra ou se desativar basta.
7. **Gestão Comercial: carteira (item 27).** As duas carteiras já separam "a produzir" de "pronto". A dele mostra só itens abertos e conta as linhas encerradas. Decidir qual cálculo vale, porque afeta o R$ a entregar.
8. **UI global (item 35).** A lista suspensa e o cabeçalho fixo dele carregam em **todas** as páginas pelo `auth_check.js`. Antes de adotar, testar contra o nosso shell (topbar sticky) e contra o CRM React incorporado.
9. **Pré-requisito de qualquer porte: em que banco a fábrica está operando hoje (§0.2).** Se a operação está no `prod-kuryos` do Gustavo, portar código sem migrar os dados deixa as telas novas vazias aqui, e os scripts de saneamento dele não valem para o `erpkuryos`.

---

## (d) Categorias de produto em Cadastros

- **Onde ficam:** `config/categoriasProduto`, um **array** de `{codigo, nome, exemplos, ativo}`. Exemplo: `{codigo:'HIG', nome:'Higiene Corporal', exemplos:'sabonete líquido, gel de banho', ativo:true}`.
- **Semente:** taxonomia Anvisa com 14 códigos (HIG, CAB, PEL, PRF, DES, SOL, BRZ, MAQ, UNH, DEP, BAR, BUC, INF, TAL), com só os 4 primeiros ativos.
- **Como é gravado:**
  - sempre com `set` do array inteiro **escopado** em `config/categoriasProduto`, nunca em `config`;
  - clicar na etiqueta alterna `ativo`;
  - leitura por `dbOnValue`, e semeia quando vazio.
- **Arquivos e linhas:**
  - G:`public/cadastros.html:3305-3425`: semente em 3327-3342, escrita em 3365/3382/3404, leitura e semente em 3416-3422, uso no cadastro de produto em 3756, 3930-3956 e 4529-4530;
  - nosso, igual: N:`public/cadastros.html:3727-3850` (escrita em 3787/3804/3826, leitura em 3838-3844).
- O Gustavo **não mexeu** nisso depois de 05/10.
