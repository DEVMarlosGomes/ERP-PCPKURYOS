# Status compartilhado dos agentes

Este é o ponto de passagem de contexto entre Codex e Claude. Atualize somente
o bloco do agente que você está operando e mantenha o histórico curto.

## Em andamento

### Claude (sessão `fin-webmais`) — Financeiro Entrega B: adiantamento, renegociação, cancelamento (12/11/2026)

- **Spec escrito, aguardando revisão do Marlos:** `docs/superpowers/specs/2026-11-12-financeiro-entrega-b-design.md`.
  Decisões: cancelamento com dois motivos (engano desfaz; incobrável = perda com clientes), vale para receber e
  para pagar manual/abertura, sem segunda aprovação (motivo + desfazer). Arquivos que serão tocados:
  `public/shared/financeiro.js` + `functions/financeiro.js`, `public/shared/financeiro-relatorios.js`,
  `public/shared/financeiro-tela.js`, `public/shared/controladoria.js` + `functions/controladoria.js`,
  `functions/financeiro_servidor.js`, `functions/index.js` (4 callables fin*), testes novos.

### Claude (sessão `fin-webmais`) — Financeiro: relatórios do WebMais (Entrega A) (12/11/2026)

- **Código concluído em `hostinger-deploy`** (commit "feat(financeiro): relatórios do WebMais"). 14 relatórios
  novos, só leitura, na aba Relatórios (seletor agrupado Caixas e bancos / A pagar / A receber): espelho de caixa
  diário, saldo das contas, lançamentos bancários, realizado × previsto, gastos por centro de custo e elemento,
  lançamento de despesas, fornecedores/clientes em aberto, principais fornecedores/clientes (ABC, filtro de
  natureza), evolução, composição de vencimentos, conta corrente, conciliação por parceiro, antecipação, PMR/PMP.
  Motor `public/shared/financeiro-relatorios.js`; centro de custo no título manual (motor valida o formato, nas
  duas cópias); regra: leitura de `ctl/centros_custo` para o módulo `financeiro`. Corrigido no caminho: render
  reentrante da tela quebrava ao mudar campo de texto em foco (Parceiro/Taxa); `run_gestao_rules_test.js` não
  rodava com firebase-admin 14 (API modular agora). Mapa WebMais em `docs/financeiro-fase0-lacunas.md` §8.
  Testes: `run_financeiro_relatorios_webmais_test` 1.082, `_ui_test` 48 (Chrome), regras 51 (emulador), bateria
  do Financeiro (motor 126/69/39/34/54/8, servidor 12, Controladoria 59, telas 18/11/12/17/17), navegação 39;
  ensaio no retrato da base de 11/11 sem número inválido. **Pendente (Marlos), nesta ordem:** publicar regras
  (`firebase deploy --only database --project erpkuryos`; sem elas a tela usa só os centros padrão) e deploy
  da VPS. Próximo: Entrega B (adiantamento, renegociação, cancelamento em lote) com spec. Arquivos ativos: nenhum.

### Claude (sessão `conferencia-pa-presa`) — Conferência de PA presa: 3 OPs que ninguém finalizava (12/11/2026)

- **Código concluído em `hostinger-deploy`.** Relato do Vicenzo; medido em produção (só leitura): 3 OPs presas, as
  outras 8 da fila sem contagem. (1) **26265/01**: apontamento corrigido 581 → 570 depois das contagens; o servidor
  mandava "reiniciar com o PCP", caminho inexistente. Agora `prepararFinalizacao` aceita o apontamento atual se for
  o que a tela mostrou (`qtdApontadaVista`) e grava `qtdApontadaNoInicio` na conferência, no palete e na
  conciliação/RNC. (2) **26251/08 e 26253/03**: PA já entrou pela regularização de 01/10 (lotes `legado_planilha`,
  EXPEDIDOS); servidor recusa com razão, e a fila agora as esconde (`paJaRegistradoForaDaConferenciaPA`).
  (3) Conciliação ganhou "Fazer nova contagem física" (mesma regra 2 de 3). Testes: `run_conferencia_pa_test`,
  `_server_test`, `_uncx_test`, novo `run_conferencia_pa_conciliacao_ui_test` (Chrome; falha no código antigo),
  seletor/propriedade UI, coerência 427. **Pendente (Marlos):** deploy da VPS (callable muda). Arquivos ativos: nenhum.
- **12/11, Relatório de Pedido: perdas por componente + documento A4 (pedido do Marlos).** O % somava frasco +
  rótulo + válvula e dividia pelo produzido (PED-0007: 99,8% na 26267/04). Agora `relatorio-pedido.js` dá o % de
  CADA componente sobre a base dele na OP: separado (`separacaoConcluida/itens`, hoje 0 OPs) ou empenho
  (`materiaisConsumo`); apontamento sem código liga ao único candidato do tipo na OP; sem base, só a quantidade.
  Ensaio no PED-0007 real: 26267/04 = frascos 21,6% e rótulos 23,9%. Tela vira folha A4 com logo, cabeçalho e
  rodapé repetidos, sem data/URL do navegador; título/PDF "Relatório do Pedido - id - cliente". `tabela-fixa.js`
  ganhou a saída `[data-kt-sem-fixa]` (rolagem interna cortava a última linha). Testes: motor 12, tela 8 (Chrome),
  tabela-fixa 17, navegação 39, conciliação, coerência. Menu segue "Relatório de Pedido" (guarda de rótulo do
  menu). Achado de dados, sem código: 26267/04 com linha 2.281, rotulagem 6.000 e estoque 3.769. Arquivos ativos: nenhum.

### Claude (sessão `pcp-kuryos-main-0b`) — Etiqueta de caixa: logo maior com ajuste e peças da caixa parcial (12/11/2026)

- **Concluído.** Logo: faixa 11 mm na 90x55 (era 9; a 100x70 segue 13 mm, medido: 15 cortaria nome de 2 linhas),
  envio corta a margem branca, "Tamanho do logo" no diálogo (50–200%, + / − / Padrão, aviso quando o conteúdo não
  cabe) salvo em `clientes/{k}/logoEtiquetaTamanho` (regra existente: PCP/Cadastros gravam cliente). Caixa parcial:
  "Peças na caixa parcial" (sugestão = sobra planejada); a etiqueta sai CAIXA PARCIAL com a quantidade e o peso em
  branco para pesar; peças ≥ caixa cheia trava a impressão. Logo antigo com margem: reenviar em Cadastros › Clientes.
  Testes: `run_etiqueta_caixa_test` 13, `_ui_test` (Chrome), emissão de OP 42, coerência 427. Manuais PCP e
  Referência. **Pendente (Marlos):** deploy da VPS. Arquivos ativos: nenhum.
- **12/11, ajuste (pedido do Marlos):** ampliar o logo empurrava nome/grade/código. Agora a faixa é fixa (11/13 mm)
  e o "Tamanho do logo" (50–300%) é zoom centralizado dentro dela: o que passa é cortado (a margem branca de logo
  antigo some primeiro) e o resto da etiqueta não se move (medido no Chrome em 100/150/250%, os dois formatos).
  Envio do logo corta a margem na resolução original e só depois reduz (máx. 1200 x 400, era 800 x 300 antes do corte).

### Claude (sessão `pcp-kuryos-main-0b`) — Emissão de NF-e: análise e plano (12/11/2026)

- **Só documento, nenhum código.** `PLANO_EMISSAO_NFE.md`: complexidade, dados medidos em produção (0 de 408
  produtos com NCM; 0 de 61 clientes com IE/CEP), caminhos A (provedor de API + regras aqui, recomendado),
  B (direto na SEFAZ) e C (Bling como motor), mapa funcional do Bling, particularidades (industrialização por
  encomenda, ST/IPI de cosméticos, IBS/CBS), fases e decisões pendentes. Aguarda respostas do Marlos.
  Arquivos ativos: nenhum.

### Claude (sessão `fila-mp-versao`) — Fila de MP nova do P&D + aviso de versão pendente na OP (11–12/11/2026)

- **Código concluído e integrado na `hostinger-deploy` (`8497cb9`, merge `0269fc4`).** Causas: as 22 MPs da fila
  são MPES e o "Cadastrar" abria sem SKU de aprovação (o salvar parava; o aviso ficava atrás do modal), e a
  faixa `.recalc-bar` (flex em linha) punha cada MP numa coluna. A v2 do PRF-BIOF-0008 tem o BOM em RASCUNHO
  (idêntico ao da v1), por isso a OP segue na v1 com MPGR-00061/00019.
  Feito: fila em tabela (INCI, fornecedor, preço, % por amostra, SKU sugerido); `SkuEntrada.codigoAmostraDoNome`
  preenche o SKU de aprovação a partir do nome (fila e digitação); `showAlert` repete no rodapé do modal;
  `versoesMaisNovasPendentes` (utils) avisa na Emissão de OP e no cabeçalho da versão; P&D grava `percentual`
  na origem (crm + `manipulacao_lote.js`, CRM recompilado). Testes: `run_fila_mp_versao_test` 32,
  `run_fornecedor_pd_cadastro_ui_test`, `run_emitir_op_saldo_ui_test` 42, `run_nome_material_versao_test`,
  `run_sku_entrada_test`, servidor do lote no emulador, vitest 57 arquivos, bateria de Cadastros e Amostras OK
  após o merge. Falham também na base, sem relação: `run_etiquetas_leitura` (sem `@zxing`),
  `run_fluxo_ponta_a_ponta`, `run_propriedade_estoque`.
  **Pendente (Marlos):** deploy da VPS (callable do lote muda); gravar o `percentual` nas 22 já na fila
  (41 caminhos planos, plano e backup em `scratch/fila-mp-percentual-20261112/`, barrado pela permissão desta
  sessão); aprovar o BOM da v2 do PRF-BIOF-0008. Arquivos ativos: nenhum.

### Claude (sessão `pcp-kuryos-main-0b`) — Amostras de MP no Cadastros (11–12/11/2026)

- **12/11, concluído (pedido do Marlos antes de publicar):** criação nunca duplica (reserva atômica do pedido),
  datas possíveis (sem 31/02; previsão não nasce no passado; baixa nem no futuro nem antes da solicitação), fornecedor
  inativo só com "Reativar" (servidor reativa + histórico do fornecedor), material pela chave do banco (conferido em
  produção: 1.029 materiais, chave = código), fornecedor da amostra entra "Aguardando homologação" no Cadastrar MP.
  Testes: servidor 10, emulador 5 (corrida de criação), tela 7, bateria de Cadastros 16 OK. Arquivos ativos: nenhum.
- **Código concluído** (`d5dc90c`..`9c2ef53` em `hostinger-deploy`; spec `docs/superpowers/specs/2026-11-11-amostras-mp-design.md`,
  plano `docs/superpowers/plans/2026-11-11-amostras-mp.md`). Aba **Amostras de MP** no Cadastros: P&D registra a amostra
  (nova ou já cadastrada, fornecedor, custo/kg, custo, quantidade g/kg, motivo, previsão), logística dá baixa (data e
  forma), P&D homologa ou reprova (parecer obrigatório ao reprovar) ou cancela (motivo). Grava só a callable
  `amostraMp` (`functions/amostras_mp.js`, 35 callables); regras: `amostras_mp` só leitura, `amostras_mp_pedidos`
  fechado, P&D **cria** fornecedor novo (não edita). Módulo `amostras_mp` (padrão de pd, logistica, pcp; também em
  `identidade_acesso.js`): quem não tem Cadastros vê só a aba (o P&D também Fornecedores). "Cadastrar MP" usa a fila
  `solicitacoes_cadastro_material`. Testes: `run_amostras_mp_test` 7, `_tela_test` 5, `_ui_test` 6 (Chrome),
  `_emulator_test` 4 (porta 9077), navegação 39 perfis, render 14/14, histórico de cadastro (+ emulador), identidade 27;
  revisão independente sem crítico (importante corrigido em `9c2ef53`). Rodada completa: falhas restantes são de
  ambiente (emulador/credencial/@zxing) ou já falhavam na base `5953b42`.
  **Pendente (Marlos), nesta ordem:** publicar regras (`firebase deploy --only database --project erpkuryos`) e só
  então o deploy da VPS. Quem tem módulos personalizados recebe `amostras_mp` pelo ADM em Usuários. Arquivos ativos: nenhum.

### Claude (sessão `pcp-kuryos-main-0b`) — Restauração dos 8 materiais sobrescritos + nome atual nas versões aprovadas (11/11/2026)

- **Dados: concluído às 16:21** (assumi o bloco da `pcp-kuryos-main-4a`, que não estava mais rodando).
  Originais de volta em EP-00193/194/195/196/197, ET-00068, MU-00003, MPGR-00144 (registro de 06/11 + edição
  de 06/11 13:30 no EP-00197, conferida no histórico). Os cadastros que caíram por cima foram para os códigos
  reservados: EP-00205 bisnaga 200G, EP-00206 bisnaga 150G, EP-00207 tampa 200G, EP-00208 tampa 150G,
  EP-00209 tampa 50MM (Bauny), ET-00076 fita kraft, MU-00022 etiquetas de patrimônio, MPGR-00150 extrato de
  urucum, com índice `materiais_chave` e histórico movidos (+ registro da correção nos dois códigos).
  Re-apontados para o código novo: BOM `PEL-BAUN-0001__v1` (2 itens), 3 cotações, 3 SCs e a solicitação de
  cadastro do urucum. Nome corrigido nas OPs 26315/04, /05, /06 (código já era o certo). 86 caminhos planos,
  conferidos um a um no banco depois. Varredura FEBELLA: 20 SKUs, 303 itens de fórmula/BOM, 0 apontando
  material errado; 7 OPs em aberto sem item trocado. Backups antes/depois e scripts em
  `scratch/correcao-codigos-materiais-20261111/` (`banco-completo-1615.json`, `corrigir.js`, `*.update.json`).
- **Código concluído (commit "fix(cadastros): versão aprovada mostra o nome atual do material"):** versão
  aprovada de Fórmula/BOM em Cadastros mostra o nome ATUAL do cadastro (o mesmo da OP) e, quando difere,
  "Nome gravado nesta versão" embaixo (`shared/nome-material-versao.js`); redesenha se o cadastro muda com a
  versão aberta (só em leitura). Dado gravado intocado. Manual de Cadastros e MELHORIAS_FUTURAS atualizados.
  Testes: `run_nome_material_versao_test` (função + tela no Chrome), bateria de Cadastros 23 OK
  (`run_trava_aprovados_ui_test` incluso); os 2 `*_rules_test` exigem emulador (sem mudança de regras; regras
  no ar = repo, 122 nós, conferido 16:2x). VPS já servia `ebc7609` antes deste commit.
  **Pendente (Marlos):** deploy da VPS com o commit novo. Arquivos ativos: nenhum.

### Claude — Código de material novo gravava por cima de material existente; trava da saída de carga (11/11/2026)

- **Código concluído (sessão do código; os DADOS estão com a sessão `pcp-kuryos-main-4a`, ver o bloco dela).**
  1. **OP com item errado:** `config/contadores/materiais` estava atrás do cadastro (EP 197 com EP-00204
     existente; ES 326/347, ET 68/75, MPES 211/225, MU 3/21). "Novo material" recebia código em uso e
     `updates['materiais/'+key] = data` sobrescrevia o antigo: em 11/11 EP-00193/195/196/197 e MPGR-00144,
     antes ET-00068 e MU-00003. O BOM aponta o código e a OP mostra o nome do cadastro, daí "frasco" virar
     "tampa flip top" (OPs 26315/04, /05, /06). Correção: `nextSequential` usa como piso o maior código do
     tipo em `materiais` (`maiorNumeroDoPrefixo`, `shared/utils.js`) e o salvamento de material novo lê
     `materiais/{chave}` no servidor e recusa se existir (`cadastros.html`). `run_contador_materiais_test` 14.
     **Não gravei nada em produção** (subir os contadores foi barrado pela permissão desta sessão).
  2. **"Há uma confirmação de saída pendente em outra carga":** a tentativa guardada na aba nunca era
     conferida com a carga. Agora `CargasPA.situacaoTentativa` descarta quando a carga sumiu, não pode mais
     ser carregada, a saída já está em `agenda.expedicoes`, ou passou de 24 h; o bloqueio que resta diz qual
     carga e oferece "Abrir essa carga" / "Descartar a tentativa" (`shared/cargas-tela.js`, `cargas-pa.js`).
     `run_cargas_pa_test` 36, `run_expedicao_ui_test` (Chrome) com os cenários novos. Manual da Logística.
  Backlog em `MELHORIAS_FUTURAS.md` (nome do BOM × nome do cadastro, BOMs V1/v1, registros sem cabeçalho).

### Claude (sessão `pcp-kuryos-main-4a`) — DADOS: materiais sobrescritos por código repetido (11/11/2026)

- **Em andamento, só dados de produção (`erpkuryos`); nenhum arquivo de código.** Autorizado pelo Marlos em
  11/11 ("códigos devem subir, não substituir; arrume toda a cadeia de cadastros alterados").
  Feito: `config/contadores/materiais` subido (EP 197→209, ES 326→347, ET 68→76, MPES 211→225, MPGR 149→150,
  MU 3→22), já reservando os códigos novos. A fazer: devolver EP-00193/194/195/196/197, ET-00068, MU-00003 e
  MPGR-00144 ao material original, dar código novo aos cadastros que caíram por cima, re-apontar BOM em
  rascunho e corrigir o nome nas OPs 26315/04, /05 e /06. Backups e planos em
  `scratch/correcao-codigos-materiais-20261111/` (fora do Git). **Não gravar em `/materiais`,
  `/materiais_chave`, `/historico_materiais`, `/bom`, `/ops` nem nos contadores de material até este bloco
  dizer "concluído".**
  **→ Concluído em 11/11 16:21 pela sessão `pcp-kuryos-main-0b` (esta não estava mais rodando); ver o bloco dela
  acima. Trava liberada.**
  **Pendente:** deploy da VPS; dados (contadores + restauração) pela outra sessão. Arquivos ativos: nenhum.

### Claude — Espelho do faturamento da Expedição no Financeiro (11/11/2026)

- **Concluído:** aba "Faturamento (Expedição)" em `financeiro.html`, só leitura, espelho da tela da Expedição
  (mesma régua `CargasPA.listar`: a faturar / faturadas / em aberto, busca, CSV). Por palete: descrição com código
  interno e externo (`produtos.codCliente`), lote, fabricação (fim real da OP, senão emissão), validade (lote, senão
  OP), caixas fechadas e avulsas desta carga (unidades ÷ múltiplo), total, valor por caixa (unitário × múltiplo),
  unitário e total. Carga solicitada usa o retrato da solicitação (preço); só agendada fica sem preço. Falta de
  código externo/fabricação/validade/preço aparece como aviso, nunca zero. `shared/espelho-faturamento.js`; o
  Financeiro passou a ler `produtos` e `ops` (regras já permitiam). Corrigido também o contador de Cobranças
  (`auth_check.js`), que usava `snapshot.forEach` e quebrava os testes de tela com Firebase simulado.
  Testes: `run_espelho_faturamento_test` 6 grupos (fluxo real do servidor), `run_espelho_faturamento_ui_test` 13
  (Chrome via `PLAYWRIGHT_MODULE`), bateria financeiro (6 + 5 telas), carga parcial e navegação OK.
  **Pendente:** deploy da VPS. Arquivos ativos: nenhum.

### Claude — Análise do granel com ensaio em dobro (11/11/2026)

- **Concluído:** o modal "Análise do granel" (lote 26309/08, FBBS0005__v1) mostrava cada ensaio duas vezes.
  Causa no cadastro: 52 repetições em 34 especificações (importação `impN` + mesmo ensaio digitado de novo no
  Cadastros; ou "APLICAÇÃO EM MECHA" importada 2×). `AnaliseGranel.itensSemRepeticao` deixa um por nome (o
  digitado vence o importado; campo vazio completado; faixa só em par); usado no granel e no laudo de PA.
  `num` passa a ler faixa com unidade ("60°G/L", "190g"), que gerava falsa "Sem faixa na especificação".
  Cadastro não foi alterado (limpar as 34 é operação). `run_analise_granel_test` 68 OK; base real: 0 specs
  com repetido na tela. Pendente: deploy da VPS. Arquivos ativos: nenhum.

### Claude — Editar, excluir e substituir itens de Fórmula/BOM/Especificação com histórico (11/11/2026)

- **Código concluído em `f987879`** na branch `cadastros/itens-historico` (worktree `../PCP-Kuryos-cad-itens`),
  feita à parte porque `database.rules.json` está ativo no bloco de Cobranças. **Ainda não integrada em
  `hostinger-deploy`**: o merge espera Cobranças commitar `database.rules.json` (o diff dela e o meu tocam nós
  diferentes; deve entrar sem conflito). ADM passa a alterar versão aprovada (além do módulo "Alterar
  aprovados"), na tela e nas 3 regras; ⇄ Substituir por linha (material ou ensaio, mesma chave do item, motivo
  obrigatório em aprovada); × pede confirmação; cada inclusão/edição/exclusão/substituição grava na hora
  quem/quando/antes→depois em `historicoAlteracoes` (`shared/historico-itens.js`). Manual de Cadastros
  atualizado. Testes: `run_historico_itens_test` 9, `run_trava_aprovados_ui_test` (PCP/Yasmim/ADM),
  `run_trava_aprovados_rules_test` no emulador 6 passos, bateria de Cadastros (11) OK.
  **Publicado em 11/11:** VPS em `f987879` (branch enviada ao GitHub). Regras: publicadas as de PRODUÇÃO + só as
  3 linhas do ADM (produção já tinha `cobrancas`, que o arquivo da branch apagaria); conferido no ar 3/3 e
  `cobrancas` preservado. Sem as regras, o ADM apagava item de aprovada e ele "voltava" (PERMISSION_DENIED).
  **Pendente:** merge da branch em `hostinger-deploy` depois do commit de Cobranças, para o próximo deploy da VPS
  não voltar à versão sem esta mudança. Arquivos ativos: nenhum.

### Claude — Cobranças internas com e-mail (11/11/2026)

- **Concluído:** `cobrancas.html` (link "Cobranças" no topo do menu, junto do Início, com contador do que
  espera a pessoa). Cobrar uma ou mais pessoas (ou um setor inteiro), com prazo, prioridade e tela
  relacionada; responder, marcar como feito, cobrar de novo (30 min de intervalo), reabrir e cancelar com
  motivo. Toda gravação pela callable `cobrancaInterna` (`functions/cobrancas.js`), que manda o e-mail no
  mesmo pedido (gatilhos da VPS desligados); falha de e-mail fica em `cobrancas/{id}/emails` com "Reenviar".
  Regras: `cobrancas/$id` lê quem participa e o ADM, ninguém grava pelo navegador; `cobrancas_caixa/$uid`
  só o dono lê e só marca `naoLida=false`. Painel de Controle: "Cobrar no sistema" por setor.
  Links dos e-mails de OP encerrada, pedido e pesagem trocados de `pcp-kuryos.vercel.app` para
  `kuryoserp.com.br`. Testes: `run_cobrancas_test.js` (8 grupos), `run_cobrancas_emulator_test.js`
  (6 passos, `firebase.cobrancas-test.json`), navegação 39 perfis, render 14/14 (34 callables).
  `run_op_encerrada_email_test`/`run_pesagem_fechada_email_test` já falhavam antes (parte 2, URL do banco).
  Tela não clicada no navegador (sem Playwright). **Pendente (Marlos): publicar regras e deploy da VPS.**
  Arquivos ativos: nenhum.

### Claude — Identificação do IBC (bulk), 5 páginas por OP (11/11/2026)

- **Concluído:** ao emitir a OP, "🛢 Identificação do IBC (5 páginas)" ao lado das fichas e etiquetas de caixa;
  reimpressão pelo 🛢 na linha da OP (Controle de OPs). Modelo `etiqueta_kuryos MANIPULAÇÃO.pdf`: Produto,
  SKU, Lote, Validade (dd/mm/aaaa) da OP, faixa Kuryos; uma página por setor (Separação, Fabricação, Envase,
  Rotulagem, Produto Acabado), A4 deitada, janela própria. Só Equipamento e Etiqueta editáveis (por setor,
  60 caracteres), gravados em `ops/{op}/identificacaoIbc` para a reimpressão sair igual (regra de `ops` já
  permitia). `shared/identificacao-ibc.js`, teste `run_identificacao_ibc_test.js`; testes de OP/emissão OK;
  PDF conferido com 5 páginas A4 deitada. Manuais PCP e Referência atualizados. Pendente: deploy da VPS.
  Arquivos ativos: nenhum.

### Claude — Histórico do cadastro vivo: Materiais, Produtos e Fornecedores (11/11/2026)

- **Concluído:** editar Material/Produto/Fornecedor em Cadastros exige justificativa curta (≥10) quando algo
  muda; o salvamento grava no MESMO update uma entrada por campo (antes/depois/quem/quando/justificativa,
  `grupo`) em `historico_{materiais|produtos|fornecedores}/{key}`; criar registra "Cadastro criado". Modal
  mostra o histórico agrupado (o antigo de materiais continua). Produto e Fornecedor passaram a gravar por
  caminhos planos na raiz (mesma mescla de antes). Regras: os 3 nós só aceitam inclusão, com quem grava o
  cadastro (fornecedor inclui Compras). Testes: `run_historico_cadastro_test.js`, `_ui_test`, `_rules_test`
  (emulador, `firebase.histcad-test.json`), bateria de Cadastros OK. **Pendente (Marlos): publicar regras
  ANTES do deploy da VPS** (sem `historico_produtos`/`historico_fornecedores` no ar, salvar produto e
  fornecedor dá PERMISSION_DENIED). Arquivos ativos: nenhum.

### Claude — Módulo financeiro do docs/prompt-financeiro.md (10–11/11/2026)

- **Concluído** (plano em `docs/financeiro-fase0-lacunas.md`, §7). Arquivos ativos: nenhum.
- F5.0 `a846d91` baixa/estorno/títulos/lote em fila única · F5 `5d02c5e` NF de entrada por XML ·
  F6 `4cbf613` caixas e bancos (movimentos, transferência, caixa não negativo, extrato) · F7 `7aa63f4`
  fluxo por dia/semana/mês e DFC; reconciliação de Bancos na Controladoria · F8 `8825ec0` relatórios
  (CSV para Excel e impressão). Callables novas: `finImportarNfEntrada`, `finMovimentar`,
  `finEstornarMovimento` (45 funções, 33 callables).
- F6 a F8 feitas na worktree `../PCP-Kuryos-f7`, porque outro agente editava a pasta principal.
- **Pendente:** deploy na VPS; conferir relatórios e DFC contra o WebMais (perguntas 6 e 7).

### Claude — Nova versão a partir desta para todos + histórico do que mudou (10/11/2026)

- **Concluído:** em Cadastros › Fórmulas/BOM/Especificações, "+ Nova versão a partir desta" aparece em
  qualquer versão para quem edita Cadastros (antes: só com as 3 aprovadas e o módulo "Alterar aprovados").
  A origem não é tocada; a nova nasce rascunho com `baseEdicao` e histórico "Criada a partir da vN", e a tela
  abre nela. Edição em rascunho fica pendente ("✎ N alterações a finalizar"), trava as aprovações até
  "Finalizar edição", que pede justificativa e grava `historicoAlteracoes` (EDICAO) com o que mudou
  (`shared/diff-versao.js`: % alterado, MP trocada pela mesma chave, incluído, removido, QSP, BOM, ensaios).
  "Alterar aprovada" grava um RESUMO_ALTERACAO ao concluir. Rascunho com edição registrada não se exclui.
  Regras do banco inalteradas (rascunho já era gravável por Cadastros). Testes: `run_diff_versao_test.js`,
  `run_trava_aprovados_ui_test.js` reescrito, demais UI de Cadastros OK; ponta a ponta falha igual ao HEAD
  (emissão). Pendente: deploy da VPS; demais cadastros em MELHORIAS_FUTURAS. Arquivos ativos: nenhum.

### Claude — Devolver OP à produção (10/11/2026)

- **Concluído (`ee9a4e7`):** OP fechada por engano (26309/04: "Fechamento OP" na Rotulagem 01) volta pela ação
  `DEVOLVER_PRODUCAO` da callable `rearranjarLinhas` (ADM/PCP; contagem de callables inalterada). Motor
  `functions/devolucao_producao.js`: justificativa ≥60, status volta a Programado/Em Produção, a etapa
  fechada sai de `confirmacaoEtapas` (guardada em `ops/{op}/historicoAlteracoes/{requestId}` com de/para),
  programa linha + `dataInicioPlanejada/Fim` (Brasília), idempotente; transação só no nó da OP. NÃO desfaz
  apontamentos, produzido, baixas de estoque nem e-mail. Tela: botão "↩️ Devolver à produção" no Controle
  de OPs (`ops.html`). Teste `run_devolucao_producao_test.js`.
- **Complemento (10/11 noite):** a 26309/04 estava **Concluído** e o servidor recusava. Agora OP concluída
  também volta: `confirmadoPor/confirmadoEm` e `statusManualOverride` saem (guardados em `de`), aviso de que a
  sobra de empenho liberada na conclusão não volta. ↩️ aparece também para OP concluída. Controle de OPs:
  coluna Ações presa à direita (sempre visível), tabela cabe sem rolar a partir de ~1536 px, selects sem
  quebra; modal refeito (estado atual, aviso de concluída, rodapé fixo, Esc fecha). Commitado de worktree
  separada: o checkout principal tinha um `stash apply` com conflito de outro agente (EditorLote.js,
  prints-pd-lote.mjs), não tocado. **Pendente (Marlos):** deploy da VPS e devolver a 26309/04.
  Arquivos ativos: nenhum.

### Claude — Faturamento da carga chega ao Financeiro (10/11/2026)

- **Concluído:** o e-mail da solicitação de faturamento ficava SEM_DESTINATARIOS (`config/emailFinanceiro`
  vazio). Agora vai a todo usuário ativo com o módulo **Financeiro** (+ `config/emailFinanceiro`, se houver);
  quem tem o módulo abre `faturamento.html` (link no bloco Financeiro quando não vê a Expedição) e registra
  a NF pela `faturamentoCargaPA`. Solicitação SEM_DESTINATARIOS/ERRO ganhou "Reenviar e-mail" (ação
  `REENVIAR_EMAIL` na mesma callable). **Pendente (Marlos):** marcar o módulo Financeiro em Larissa e Lucca
  (Usuários) com e-mail no perfil, deploy da VPS e clicar "Reenviar e-mail" na carga já solicitada.
  Arquivos ativos: nenhum.

### Claude — Usuários, RNC e destino da carga (10/11/2026)

- **Concluído e publicado na VPS** (`hostinger-deploy`). Arquivos ativos: nenhum.
- `b666cb4` Usuários: o servidor exigia "usuário" mas a tela voltou a login por e-mail em 601b53f;
  criar e editar falhavam. Agora é opcional (validado se vier). Confirmado: perfil de manipulação criado.
- `c2e3c6b` RNC: item com busca (SKU, código, nome, EAN, cliente; `shared/rnc-itens.js`); fornecedor pelo
  nome (o cadastro não tem `nome`, só nomeFantasia/razaoSocial) e sugerido pelo material; `abrirRnc` grava
  `cliente` (era enviado e descartado).
- `940fbe1` RNC: lote lista também as OPs do SKU (46 de 408 produtos tinham lote em estoque; 270 com OP);
  OP escolhida vai para `opLote`.
- `2341f99` Expedição: `mesmoDestino` (shared/expedicao.js = functions/expedicao_regras.js) ignora
  maiúscula/acento/pontuação; mesmo endereço da Miss Rose estava em 3 grafias. Pedido sem endereço segue
  separado (pedido 27 da Miss Rose).
- `513d8c9` (09/11 noite) também não estava registrado aqui: ver complemento do bloco abaixo.
- `ad0cdf2` Expedição: pedido sem endereço acompanha o destino da carga (mesmo cliente);
  mensagens de destino/cliente/CIF-FOB/palete preso dizem o que fazer (`destinoDaCarga`).
- Auditoria geral: `dea29f1` FEFO não sugere lote vencido; Pedidos redesenha em
  `kuryos-auth-pronto`. `b9189f1` 15 testes desatualizados em dia; dados a regularizar em
  MELHORIAS_FUTURAS ("Auditoria geral de 10/11/2026"). README novo publicado em `a26776e`.

### Claude — Fornecedor do P&D no cadastro de MP nova e 500 na Montar carga (09/11/2026)

- **Concluído.** Expedição: as callables faziam `db.ref().transaction` na RAIZ; com o banco em 29,7 MB
  (limite de escrita única 16 MB) o servidor derrubava a conexão: Montar carga dava INTERNAL e nenhuma
  agenda saía desde 23/10 (o mesmo valia para emitir OP, titularidade, faturamento, rearranjo e
  retrabalho). `functions/transacao_raiz.js`: fila no processo, leitura fresca, update só dos caminhos
  mudados (`run_transacao_raiz_emulator_test.js` reproduz o disconnect com ~20 MB). Cadastro de MP nova
  pelo P&D: o fornecedor ia para o bloco oculto de fornecedor único e a MPGR nascia sem homologado; agora
  entra na lista de homologados (aguardando) e o nome livre casa com o cadastro
  (`IngredienteCampos.fornecedorDoPd`), com aviso quando não acha ou acha mais de um.
  **Pendente (Marlos):** deploy da VPS. Arquivos ativos: nenhum.
- **Complemento (09/11 noite):** a fila de MP nova no Cadastros mostra INCI e fornecedor do P&D já casado
  com o cadastro (antes só ao abrir a tarefa). Três testes antigos consertados: saldo na emissão (campo
  `empenhado` de 563ade1), contagem de funções do Render (30 callables desde 788edf5) e devolução no
  emulador (firebase-admin 14 sem `admin.apps`; aceita qualquer porta, a 9023 tem emulador órfão de 05/11).

### Claude — Amostras duplicadas no P&D pela sincronização de 08/11 (09/11/2026)

- **Código concluído:** o botão ADM "Sincronizar amostras com o P&D" (`/crm/samples/sync-missing-pd-cards`)
  criou em 08/11 17:10 96 solicitações OPEN vazias para variações migradas do Mongo que já tinham
  solicitação (ligada só por `crm_variacao_id`) ou card legado; as duas disputavam o espelho e a
  variação oscilava solicitada/enviada a cada abertura. Agora o botão liga o que existe antes de criar
  (`crm-frontend/src/lib/vinculoAmostrasPd.js`, 8 testes; emulador 2). `scripts/correcao-amostras-duplicadas-20261108.js` gerou o update (91 religadas à original, 5 no
  status do card legado). **Dados corrigidos em 09/11** (1 amostra conferida, depois 95 num update
  atômico; backups em `scratch/amostras-20261109/`): 167 solicitações, OPEN só as 14 da Vyra, zero
  variação sem vínculo ou com duas solicitações, zero card/desenvolvimento órfão. Não clicar no botão
  antes do deploy da VPS. Arquivos ativos: nenhum.

### Claude — Card do cliente ↔ Cadastros e KPIs faltantes (08/11/2026)

- **Concluído:** card do cliente (CRM1) e `clientes/` (Cadastros) são o mesmo registro nos dois sentidos:
  contatos (lista inteira, principal, cargo/decisor preservados pelo `cadastro_contato_id`), cidade, UF,
  site, condição de pagamento e endereços. Salvar no card grava em `clientes/` com `ultimaAlteracao`
  (origem `crm_card`, horário do servidor) e `historicoAlteracoes`; salvar no Cadastros grava o mesmo
  histórico, que o card mostra na aba Histórico. Aba Contatos do card virou editável (adicionar,
  remover, tornar principal). Regra de `clientes/$clienteKey` libera o comercial só com esse carimbo
  e sem mexer em código/matriz/fornecedor/ativo. Painéis: Executivo ganhou "Expedido no período"
  (pela data da saída; a última saída registrada em produção é 11/09) e a cobertura de valor da
  carteira; Setorial › Produção lê `perdas/`. Testes: módulo 9, emulador do card 4, regras 4+5,
  CRM 503, UI espelho/contatos/trava/crítico, painéis, navegação 39, Hostinger 25.
  **Pendente (Marlos):** publicar regras e deploy da VPS. Arquivos ativos: nenhum.

### Claude — Trava de fórmulas aprovadas e P&D concluído (08/11/2026)

- **Concluído:** Fórmula/BOM/Especificação APROVADA só muda por quem tem o módulo
  "Alterar aprovados" (`modulos/alterar_aprovados`), com justificativa ≥10, `ultimaAlteracao`
  em horário do servidor e linha em `historicoAlteracoes` no mesmo update (regra do banco);
  nova versão de produto já aprovado idem. Granel não gera mais versão de especificação.
  P&D: solicitação APROVADA/CONCLUÍDA trava a bancada até para o ADM; com o módulo libera e
  cada escrita grava `pd_requests/{id}/alteracoes_aprovado` (data, autor, rota). Testes: regras
  no emulador 5 passos, UI da trava, Manipulação, crítico P&D, CRM 495, navegação 39, Hostinger 25.
  **Pendente (Marlos):** publicar regras (`firebase deploy --only database --project erpkuryos`),
  marcar o módulo em Adlai/Gustavo Callegaro/Yasmim no `usuarios.html` e deploy da VPS.
  Arquivos ativos: nenhum (Codex pode retomar `PDDetail.js`/`firebaseApi.js`).

### Claude — Lote de amostras conclui direto na Manipulação (08/11/2026)

- **Concluído (`85374c0`), assumindo a reserva do Codex com autorização do Marlos:** o P&D não
  pesa (pesagem é da Produção). Concluir o lote cria V1/V2… EDITÁVEIS em cada amostra, sem ordem de
  pesagem do lote, sem gramas/mínimo pesável/pré-mistura; amostra Aberta vai a Em Desenvolvimento pela
  rota de status do P&D; lote vira `concluido` (não cancela nem perde amostra). Testes: servidor
  no emulador 7, auditoria 12, regras 10, CRM 493, Hostinger 25. **LM-2026-040-2** voltou a rascunho
  preenchido (backup local; ordem e 24 pesagens em `historico_ordens`; V1 destravadas viraram
  fórmula anterior; `conferirOrdem` real: zero problemas). **Deploy da VPS obrigatório antes de
  alguém concluir um lote:** o servidor antigo ainda gera ordem. Arquivos ativos: nenhum.

### Claude — P&D lote de volta a 05/11 e aviso de sessão encerrada (06/11/2026)

- **Concluído e enviado (`c6ed38c`, `21957dd`):** tela do lote de amostras voltou à
  versão de 05/11 12:28 (`acb3eea`), a pedido do Marlos (muitos erros na nova);
  desfeitos na tela `b07b6c5`, `cd7db1a` e `ada99b8`; mantido de `742b20d` salvar
  antes de concluir e proteção ao sair. Servidor/regras do lote intactos; nenhum
  arquivo reservado pelo Codex tocado. CRM 493 testes, build oficial integrado,
  Hostinger 25. `auth_check.js` ganhou bloco isolado que avisa "Sua sessão foi
  encerrada" quando `security_sessions/{uid}/revokedAfter` ≥ `auth_time`
  (`run_sessao_encerrada_ui_test.js`). **Deploy da VPS pendente.** Arquivos
  ativos: nenhum.

### Codex — resultados da Manipulação e etapa da Qualidade (06/11/2026)

- **Em investigação:** auditar em produção, somente leitura, o envio dos resultados
  da manipulação em lote e a passagem das amostras para Em Testes/Qualidade; depois
  reproduzir com fixtures e corrigir o ponto confirmado. Escopo inicialmente reservado:
  `crm-frontend/src/components/ManipulacaoLote/OrdemLote.js`,
  `crm-frontend/src/lib/manipulacaoLoteRotas.js`, `functions/manipulacao_lote.js` e
  testes específicos. A tela legada `public/qualidade.html` permanece somente leitura
  até a auditoria demonstrar relação com a falha. Nenhum lote real será alterado.
- **Diagnóstico confirmado em 08/11:** a etapa real é P&D › Testes/Estabilidade,
  não `qualidade.html`. O banco aceita o papel `qualidade`, mas `PDDetail.js` entrega
  `canEdit=false` a `TestsTab` e `StabilityGridPanel` porque só reconhece
  admin/gestor/formulador/líder P&D/engenharia. Nas três amostras A5 do lote 041,
  duas seguem sem resultado; a terceira tem `pd_lab_results` sem campos técnicos
  (apenas metadado/tenant), embora possua estudo e 5 leituras. Também foi confirmado
  que `TestsTab` não zera o formulário ao trocar para uma amostra sem resultado e
  esconde a mensagem real de falha. **Coordenação:** `PDDetail.js`, `firebaseApi.js`
  e o build estão reservados pelo Claude na trava de fórmulas; não editar nem
  publicar esses arquivos até ele liberar. Assim que liberados, aplicar permissão
  restrita a Testes/Estabilidade para `qualidade|qa`, reset seguro e erro detalhado,
  sem conceder edição de fórmula/BOM.
- **Dashboard em correção independente:** a fotografia atual confirma em 03/11
  `21.038` unidades no Dashboard Análise contra `8.803` no Diário: os `12.235`
  excedentes são Rotulagem 01/02 e Celofane. Reservados
  `public/dashboard_analise.html` e `run_dashboard_analise_envase_test.js` para
  aplicar a mesma classificação de Envase já usada no Diário a todos os KPIs
  de produção; sem tocar dados nem arquivos ativos do Claude.
- **Pedidos em correção independente:** a própria fonte confirma que os quatro
  cards usam `allPedidos` mesmo depois de montar `list` com busca/status/linha/
  conferência; Pedidos Comerciais também mantém `ids.length` e categorias de
  fora do filtro. Reservados `public/pedidos.html`,
  `public/shared/pedidos-kpis.js` e `run_pedidos_kpis_filtro_test.js` para
  restaurar o consolidado dinâmico conforme todos os filtros visíveis;
  o teste UI histórico permaneceu intacto porque já possui uma flutuação não
  relacionada na data de entrega.
- **Vibe Coding Toolkit — adoção compatível:** fonte fixada na revisão
  `7ef68dd7`; não existe `SKILL.md`, então não foi simulada instalação como skill.
  Reservados somente `README.md`, `PRODUCT.md`, `.graphifyignore` e
  `docs/{architecture,design,onboarding,quality,setup}.md`. A documentação mapeia
  o stack Firebase/Vite real, preserva AGENTS/CLAUDE e registra como não aplicáveis
  Next/Drizzle/PostgreSQL/shadcn; nenhum pacote global, conta, serviço ou deploy
  foi alterado.

### Codex — rollback emergencial do login (06/11/2026)

- **Rollback concluído e publicado (`601b53f`):** restaurada a interface anterior
  ao commit `2338705`, após relato
  de bloqueio geral. Escopo reservado: `public/login.html`, `public/auth_check.js`,
  `public/usuarios.html`, remoção da tela `minha-conta.html` e documentos/testes
  exclusivos daquele incremento. O backend personalizado ficará inativo, sem apagar
  usuários, senhas, perfis, índices ou auditoria; pesagem e P&D foram preservados.
  O login voltou a usar `signInWithEmailAndPassword` diretamente. Validação local:
  identidade UI 27 contratos, serviço de identidade, política de senha, Hostinger
  25 contratos e navegação de 39 perfis aprovados; `git diff --check` limpo. VPS
  saudável na versão `601b53ffcfb5de6ff4773ab0d1c80b55ebd36963`; releitura HTTP
  confirmou `signInWithEmailAndPassword`, ausência da função personalizada e do
  redirecionamento obrigatório, com `/api/health` OK (42 funções). Arquivos ativos:
  nenhum.

### Codex — Pesagem e P&D em lote (06/11/2026)

- **Frente 1 concluída e publicada:** `5644429` comprime a foto no navegador,
  mostra progresso, limita esperas e torna a repetição idempotente. Testes da
  Manipulação/Anexos/Hostinger aprovados; VPS validada nessa versão.
- **Frente 2 concluída e publicada:** auditoria somente
  leitura do `LM-2026-041-4` confirmou que nenhuma composição chegou ao servidor
  (lote segue rascunho, revisão 1, sem ordem). A conclusão agora sempre persiste o
  estado visível antes de gerar a ordem, usa a revisão devolvida pelo salvamento,
  não gera com pendências e não recarrega/apaga o formulário quando salvar ou gerar
  falha; alterações não salvas também protegem contra recarga da página. Arquivos:
  `EditorLote.js`, `lib/conclusaoLote.js`, teste novo e bundle do build oficial.
  Validação: 493 testes CRM aprovados (8 ignorados), build Vite aprovado,
  `run_hostinger_deploy_test.js` 25/25 e `git diff --check` limpo. Commit
  `742b20d` enviado a `origin/hostinger-deploy` e implantado na VPS; containers
  saudáveis, `/api/health` retornou `ok` com 42 funções, entrada CRM e chunk P&D
  HTTP 200. Arquivos ativos: nenhum.

### Codex — Login personalizado e Minha Conta (06/11/2026)

- **Concluído:** commits `788edf5` e `2338705`. Login aceita usuário ou e-mail
  com erro genérico, índice privado e rate limit; `Minha Conta` permite trocar a
  própria senha e encerrar sessões após reautenticação. ADM vê somente estado da
  credencial, pode definir senha temporária com troca obrigatória e nunca consulta
  senha. Testes de serviço, falhas, senha, UI, navegação e 25 contratos Hostinger
  aprovados; navegador visual do ambiente ficou indisponível, sem reutilizar capturas
  antigas. Regras RTDB publicadas e relidas com igualdade exata.
- **Publicado:** `233870597fa1a42def75d6395beca1e267a1d9b8` na VPS; containers
  saudáveis e `/api/health` com 42 funções. Backfill aplicou usuário a 27 perfis,
  com backup `/backups/login-usuarios-2026-11-06T13-46-36-061Z.json`; segunda
  execução: zero alterações. Permanecem cinco perfis sem Auth e três divergências
  de UID, sem fusão/criação automática. Relatório atualizado em
  `RELATORIO_RECONCILIACAO_USUARIOS_20261106.md`. `.impeccable/` e `storage.rules`
  permaneceram fora dos commits deste trabalho. Arquivos ativos: nenhum.

### Claude — Qualidade: foto, rascunho e busca da inspeção (06/11/2026)

- **Concluído:** `6effc14` (Storage aceita HEIC e PDF de autorização na pasta
  `qualidade/`; publicado) e `4bbb8b7` (porte de `d3a0fcb`+`f609e1e` do repo
  `gcallegaro-kur/PCP-Kuryos`: rascunho do laudo/granel em `qualidade_rascunhos`
  e busca única de lote/produto/SKU sobre fila, granel e laudos decididos).
  Regra `qualidade_rascunhos` publicada no `erpkuryos` a partir de worktree limpo;
  regras no ar relidas iguais ao arquivo. **Deploy da VPS pendente (Marlos):**
  `cd /opt/kuryos/repo && ./scripts/hostinger/deploy.sh 4bbb8b7` ou posterior.
  `firebase-admin` 14 removeu `app.database()`: testes de regra antigos que usam
  a API namespaced quebram; `run_rascunho_cq_rules_test.js` já usa a modular.
  Arquivos ativos: nenhum.

### Claude — Storage para foto da pesagem (06/11/2026)

- **Concluído:** bucket `gs://erpkuryos.firebasestorage.app` (US-EAST1, criado
  pelo usuário no Console) recebeu `storage.rules` com envio para qualquer login
  válido (decisão do usuário); 9 casos aprovados na API de teste de regras antes
  da publicação (`deploy --only storage --project erpkuryos`, 12:39 UTC). Claim
  `erp_storage` por área adiada em `MELHORIAS_FUTURAS.md` por sobreposição com o
  bloco do Codex acima. Arquivos ativos: nenhum.

### Codex — CRM2/Cotações: erro de leitura e paridade com export `prod-kuryos` (05/11/2026)

- **Cadastro direto de usuários concluído (06/11/2026):** commit `ff59f24`. O
  ADM agora informa senha inicial e
  confirmação no próprio sistema; o servidor cria Auth + perfil no mesmo UID,
  mantém `emailVerified=false` por honestidade e não exige essa marca para o
  login. Definir senha em perfil legado também cria o Auth no UID preservado,
  ativa a conta e aprova o acesso, sem link/verificação de e-mail. Senhas não
  entram em RTDB, journal, auditoria ou assinatura idempotente. Auditoria
  somente-leitura do export: 16 perfis; destino atual com 20 perfis e 10 contas
  Auth; 6 perfis legados ainda sem login, 3 identidades divididas por e-mail e
  7 ausentes em ambos. Nenhum usuário/dado real foi criado, alterado ou
  reativado. Provas: serviço/acesso/falhas/senha e 27 contratos UI aprovados;
  Playwright desktop/mobile de senha e recuperação aprovado; rota da callable e
  24 contratos Hostinger aprovados. Emuladores não executados nesta máquina por
  ausência da CLI operacional; regras não mudaram. `.impeccable/` permanece
  intocada. Arquivos ativos: somente este registro até o commit documental.
- **Publicado na VPS (06/11/2026, 07:01 BRT):** `8cbed46f8b6def5f317bb18ee1a4378351bdef3e`
  está em `/opt/kuryos/current-version`; containers `functions` e `web`
  saudáveis, `/api/health` respondeu `ok` com 40 funções. `usuarios.html` no ar
  tem SHA-256 `12114538...7820b`, idêntico à fonte local, e o serviço
  `identidade_acesso.js` tem SHA-256 `c486e5c1...a1128` idêntico no release.
  Nenhum usuário, senha, permissão, regra ou dado real foi criado/alterado pelo
  deploy. `.impeccable/` segue fora dos commits. Arquivos ativos: nenhum.

- **Plano integral entregue (06/11/2026):** commits `1c23655`, `34b97e4` e
  `596af73`. A Simulação Comercial passou a usar `/orcamentos`, sem criar/alterar
  proposta, etapa ou projeto CRM2; Ativos operacionais da Manutenção e Serviços
  ativos de Cadastros populam o Kickoff, com erros explícitos e preservação do
  legado; selects/dropdowns são superfícies opacas de alto contraste em claro e
  escuro. Custos e Resultado mostram cobertura, custo orçado no fechamento,
  custo real, desvio R$/%, lucro orçado e lucro real, sem converter ausência em
  zero. CRM: 489 testes verdes, build Vite (2.582 módulos) e integrador oficial;
  Custos: 118 asserções e cópias navegador/servidor idênticas.
- **Febella regularizada em produção com backup integral prévio:** CNPJ confirmado
  pelo fornecedor vinculado `26.747.489/0001-53`; padrão original `FB` + família
  + quatro dígitos. Atualização atômica de 226 caminhos, gatilhos desativados:
  `FBMF0003`, `FBHD0003`–`FBHD0008` e `FBBS0007`, incluindo produtos, fórmulas,
  BOMs, especificações, pedidos, OPs, programação, empenhos e aliases. Snapshot
  pós-carga validado por `migrar-sku-febella.js --verify`: `ok: true`, zero
  referência operacional antiga. Novos SKUs Febella seguem esse padrão por CNPJ.
  **Bimedic não existe por nome/CNPJ** no banco atual nem no export fornecido;
  nenhuma identidade foi inventada e nenhum dado de terceiro foi alterado.
  Arquivos ativos: somente este registro até o commit final; `.impeccable/`
  continua intocada.

- **Plano integrado de evolução concluído (05/11/2026):** mapeadas, sem
  implementação nesta etapa, seis frentes solicitadas por Marlos: KPIs de custo
  orçado x custo real x lucro real; ativos/manutenção no bloco 6 do Kickoff;
  menus suspensos claros/escuros; serviços de Cadastros no Kickoff; saneamento
  de SKU/nomenclatura de Febella Beauty e Bimedic; e independência da Simulação
  de Orçamento Comercial em relação ao orçamento do CRM. Escopo de leitura:
  fontes de Custos/Resultado, Kickoff, Ativos, Cadastros, Comercial, componentes
  compartilhados e auditorias de SKU. Diagnóstico-base: o realizado por OP já
  calcula materiais, perdas, operação e LP, mas falta congelar a base orçada no
  fechamento; Ativos já fornece `paraSelecao`, enquanto o Bloco 6 ainda grava
  texto; Serviços já é lido no Kickoff e requer endurecimento/validação; a
  Simulação Comercial hoje exige projeto CRM2 e grava em `crm_propostas`;
  Febella mistura SKU legado e canônico, e Bimedic não aparece com esse nome no
  export legado. Plano apresentado no chat, com fases, critérios de aceite,
  auditoria/rollback e ordem de implantação. Nenhuma regra, dado, tela ou
  produção foi modificada. **Arquivos ativos: nenhum.**

- Pedido: diagnosticar a tela CRM2/Cotações, comparar o export
  `C:\Users\Marlos\Downloads\prod-kuryos-default-rtdb-export (2).json` com o sistema atual
  e migrar somente os dados necessários para obter paridade verificável com o
  `dashboard_analise.html` legado.
- Escopo inicial: investigação em `crm-frontend/`, adaptadores Firebase do CRM,
  scripts de migração/auditoria a identificar e este bloco. O JSON e os bancos são
  somente leitura até mapear origem, destino, conflitos, backup e validação pós-carga.
- Não tocar nos arquivos do lote de P&D nem em `.impeccable/`. Nenhum deploy ou
  alteração nessa pasta foi feita.
- Causa do erro confirmada na base real: 3 das 6 `crm_propostas` são aprovadas e
  congeladas com `composicao.insumos`, mas sem `composicao.servicos`; a abertura
  devolve o formato legado cru e a UI quebra em `servicos.map(...)`.
- Correção validada: CRM 487 aprovados/8 ignorados; build Vite (2.582 módulos),
  integrador oficial e 24 contratos Hostinger aprovados. Commit `ffa4e80` enviado
  a `origin/hostinger-deploy`. **Deploy da VPS pendente**, pois a chave exige senha:
  `cd /opt/kuryos/repo && ./scripts/hostinger/deploy.sh ffa4e80`.
- Export de 05/11 aplicado ao `erpkuryos` com fonte vencedora, referências órfãs
  preservadas e gatilhos desativados: execução `merge-81d3b789beced4b4`, 72.232
  campos, backup e checkpoint locais. Auditoria pós-carga
  `merge-9e7baa817db62361`: 9.303 registros idênticos, zero inclusão, conflito,
  sobrescrita ou rejeição pendente. As 11 OPs com SKU órfão foram importadas com
  pendência de Cadastros. Raízes técnicas/de acesso continuaram excluídas.
- O `erpkuryos` possui registros adicionais válidos fora do export (inclusive OPs
  e pedidos nascidos do CRM); foram preservados, pois apagá-los seria exclusão de
  produção e não faz parte da migração.
- Registro de auditoria publicado em `ab8bf83` no `origin/hostinger-deploy`.
  **Arquivos ativos: nenhum;** implementação e documentação liberadas.

### Claude (sessão na nuvem, 05/11/2026) — Lote de amostras: sem comentário e concluir num clique

- Pedido do Marlos (05/11, 12:06): concluir o preenchimento do lote manda as amostras direto para a Manipulação
  (V1, V2, V3…) e não pede comentário de alteração. Spec §15 (`docs/superpowers/specs/2026-11-04-pd-manipulacao-lote-design.md`).
- Branch `pd-lote/concluir-sem-motivo`, a partir de `origin/hostinger-deploy` `8317469` (não da `main`, que está atrás).
  Arquivos: `crm-frontend/src/lib/manipulacaoLote.js` (+ cópia `functions/manipulacao_lote_motor.js` regerada),
  `manipulacaoLoteRotas.js`, `components/ManipulacaoLote/EditorLote.js`, `AvisoLoteDaAmostra.js` (novo), `pages/PDDetail.js`,
  `functions/manipulacao_lote.js` (aprovação de crítico), testes do lote, vitrine, `public/manuais.html`, bundle do CRM.
  **Regra do banco mudou** (`pd_manipulacao_lotes/$lote/motivos/$r/$k`: autor anterior só com o mesmo valor e material — achado
  do auditor do diff): publicar `--only database --project erpkuryos` junto com as funções.
- Provas: CRM 486 testes verdes; vitrine conferida com Playwright (1440/390, claro/escuro). **Emulador não roda na nuvem**
  (download bloqueado): rodar `run_manipulacao_lote_servidor_test.js`, `run_manipulacao_lote_auditoria_test.js` (cenário K novo) e `run_pd_lote_rules_test.js` no
  computador antes de publicar; a callable `manipulacaoLoteServidor` mudou, então o deploy da VPS precisa subir as funções.
- **GitHub (05/11, 12:55):** `origin/hostinger-deploy` avançada por fast-forward até este registro; `origin/main`
  (envio avulso `9e402b8`, sem histórico em comum) recebeu um commit por cima com a mesma árvore, sem force push.
  **Pendente no computador do Marlos:** emulador (3 testes acima), `firebase deploy --only database --project erpkuryos`
  e `./scripts/hostinger/deploy.sh <commit>` na VPS (conferir 40 funções e hash do `crm-app.html`).
- **Arquivos ativos: nenhum.**

### Claude (Dev Fullstack) — P&D: Manipulação em Lote (04–05/11/2026)

- **Tela dedicada do lote terminada (05/11/2026, pedido do Marlos: "veja onde o codex parou com a nova criação e
  termine"):** o Codex deixou sem commit o workspace em tela cheia (lista de amostras + uma amostra por vez). Terminado
  em cima dele: os 100 % liberam "Concluir lote" (a quantidade em g que o pedido não traz é pedida no clique —
  `GramasDialog` — e gravada antes de `gerar_ordem`; servidor e regras inalterados); "Copiar composição de" virou menu
  (o `<select>` ganhava seta dupla do `lista-suspensa.js`); caixinhas de pré-mistura com 16 px; lista de amostras em
  faixa horizontal abaixo de 1280 px; cabeçalho alinhado à esquerda no celular. Vitrine injeta todo o CSS/JS global de
  produção na ordem da página, abre o lote pelo diálogo real e confere que a conclusão grava as gramas antes da ordem
  (spec §16). Provas: CRM 486; vitrine 54 prints sem erro/rolagem horizontal; Hostinger 24 contratos. O vite que o Codex
  deixou aberto na 5179 não foi derrubado (os prints usam porta livre). **Deploy na VPS pelo Marlos.** **Arquivos
  ativos: nenhum.**

- **Publicação (05/11/2026):** regras publicadas no `erpkuryos` às ~08:20 (só 5 pontos novos sobre as publicadas em
  `b58eb74`: `pd_manipulacao_lotes`, exclusão no `$collection`, `criticoPd`, `config/pdLote` e o `.validate` de `config`).
  Código em `origin/hostinger-deploy` = `31a1939` (avanço direto do publicado `25bb2bb`: lote + auditoria final + a
  pesagem sem foto `25a470b`, recolhida por cherry-pick). **VPS ainda na versão anterior** (API com 39 funções): o deploy é
  `cd /opt/kuryos/repo && ./scripts/hostinger/deploy.sh <commit>` pelo Marlos (a chave de deploy tem senha); conferir
  40 funções e o hash do `crm-app.html`. O `hostinger-deploy` LOCAL do checkout principal tem `62fc9e3`/`1eed1ce`/
  `ce19979`/`360d43d` (redesign cancelado + preview + registro) não publicados: rebasear sobre `origin/hostinger-deploy`
  antes de qualquer commit novo; o `25a470b` sai sozinho no rebase (mesmo patch).
- Construído e testado na worktree `PCP-Kuryos-pdlote`, branch `pd-lote/manipulacao-lote`,
  rebaseada em 05/11 sobre a versão publicada `25bb2bb` (fora o redesign cancelado `62fc9e3`/`1eed1ce`; backup da base
  antiga em `backup/pd-lote-antes-rebase-20261105`). Sem push, deploy ou regra publicada.
- LM-01..08, LM-10..14 feitos (LM-09 kanban adiado). Servidor: callable nova `manipulacaoLoteServidor` (28 callables)
  e trava extra no `liberarEtapaPd`. Regras novas: `erp/$tenant/pd_manipulacao_lotes`, `materiais/$m/criticoPd` e
  `config/pdLote` só ADM. Cadastros: caixa "Crítico no P&D" (só ADM). Bundle do CRM integrado.
- Provas: emulador `demo-pd-lote` (servidor 10 passos, regras 10 passos, adaptador+regras+callables de ponta a ponta,
  ensaio com fotografia da base apagada às 01:54 de 05/11), CRM 474+ testes, UI do Cadastros e da Central de Ajuda.
- Para publicar: integrar com a branch da auditoria (`audit-fix-20261104`, também mexe em `database.rules.json`),
  rodar a bateria completa de regras sobre a junção, publicar regras e funções juntas (a tela chama a callable).
- **Arquivos ativos: nenhum em edição;** progresso por ticket em `docs/superpowers/specs/2026-11-04-pd-manipulacao-lote-progresso.md`.

### Codex (Tech Lead) — Fechamento das pendências P1/P2 (01/11/2026)

- **Concluído pelo Claude (05/11/2026, ver bloco "Claude (Dev Fullstack) — P&D: Manipulação em Lote") — tela dedicada de amostras em lote:** após validar que os ajustes incrementais não resolveram a sobreposição no navegador real, Marlos autorizou substituir especificamente o editor de lote por uma superfície organizada de padrão ERP. Impeccable em modo Operate; preservar motor, regras, dados, auditoria e ações. Escopo reservado: `crm-frontend/src/components/ManipulacaoLote/EditorLote.js`, `crm-frontend/src/components/ManipulacaoLote/PainelAmostrasProjeto.js`, regra responsiva estritamente escopada do workspace em `public/shared/crm-pd-responsive.css`, novos componentes locais se necessários, testes/vitrine do lote, bundle oficial em `public/static/crm`, `public/crm-app.html` e este registro. Esta autorização é pontual para Manipulação em Lote e não reabre o redesign global cancelado.
- **Publicado — cabeçalho da matriz P&D sem sobreposição (05/11/2026):** `cd7db1a` foi enviado a `origin/hostinger-deploy` e implantado na VPS; `/opt/kuryos/current-version` confirma o SHA completo. O CSS global forçava `36px` nos `th` e fazia quantidade, cópia e remoção invadirem as primeiras linhas de ingredientes. Refinamento Impeccable/Operate: altura automática prioritária, identidade da amostra separada dos controles e vitrine carregando a camada global real para cobrir a regressão. Provas: CRM 486 aprovados/8 ignorados; detector Impeccable sem achados; Chrome headless escuro 1840×900 e 390×900 sem interseção; build Vite 2.575 módulos; Hostinger 24 contratos. Pós-deploy: containers saudáveis, API 40 funções, índice/CSS/chunk HTTP 200 e SHA-256 do `PDDetail-B2CIRjME.js` idêntico ao build local. Nenhuma regra, dado ou comportamento de negócio mudou; `.impeccable/` permanece preexistente e fora dos commits. **Arquivos ativos: nenhum.**
- **Publicado — correção urgente da matriz P&D (05/11/2026):** `b07b6c5` foi enviado a `origin/hostinger-deploy` e implantado na VPS; `/opt/kuryos/current-version` confirma o SHA completo. A tabela agora tem largura própria por coluna, layout fixo e rolagem responsiva, sem alterar regras de negócio; o bundle oficial usa `index-vhuZ2V3j.js` e `PDDetail-ZOZNtqJF.js`. Pós-deploy: `crm-app.html` e chunk HTTP 200, SHA-256 do chunk público idêntico ao build local, containers saudáveis e `/api/health` com 40 funções. Regras do Realtime Database também foram publicadas explicitamente no projeto `erpkuryos`, sem mudança de dados. Provas: CRM 486 aprovados/8 ignorados; emulador servidor 10 passos, auditoria 12 e regras 10; build Vite 2.575 módulos; Hostinger 24 contratos; Chrome headless 1840×900/390×900 no tema escuro. `git diff --check` limpo. O redesign segue cancelado; `.impeccable/` permanece preexistente e fora dos commits. **Arquivos ativos: nenhum.**
- **REDESIGN CANCELADO PELO USUÁRIO (04/11):** “não publique nada da interface” e “não quero nada de redesign deixa do jeito que está”. Esta orientação substitui a aprovação anterior do plano e qualquer indicação histórica de UI pronta para publicar. Não continuar protótipos, tela-piloto, motion ou expansão visual; manter a interface atual de produção intacta. Os commits locais `62fc9e3` e `1eed1ce` NÃO estão autorizados para publicação, nem a branch `release/ui-ux-20261104`. Não implantar o HEAD de `hostinger-deploy`, que contém esse lote, em futura correção funcional: partir da versão efetivamente publicada e selecionar somente as correções autorizadas. Nenhum revert, exclusão de arquivos locais, push ou deploy nesta solicitação; somente este registro de cancelamento. Arquivos de implementação ativos: nenhum.
- **Prévia local corrigida (04/11):** `login.html` e `shared/utils.js` ativam emuladores automaticamente em `localhost`/`127.0.0.1`; como não há Auth 9099 rodando, o endereço informado antes causou `auth/network-request-failed`. `scripts/preview-ui.mjs` agora redireciona esses aliases temporariamente para `http://127.0.0.1.nip.io:5000` (mesmo loopback), preserva caminho/query e rejeita Host externo; raiz abre login. Processo anterior 31992 confirmado/encerrado, substituído por Node 5452 com logs privados em `scratch/preview-ui.*.log`. `run_preview_ui_test.mjs`: 33 asserções HTTP aprovadas. Chrome isolado com SDK real confirmou redirecionamento, `emulatorConfig=null`, RTDB real, leitura pública da configuração Auth HTTP 200, zero chamadas aos emuladores e zero erros JS. Nenhuma senha usada, tentativa de login real, conta/dado alterado, deploy ou mudança da autenticação em produção. Não alegar que credenciais reais foram homologadas; usuário deve entrar no endereço corrigido. Arquivos deste reparo liberados após validação.
- **Prévia local disponível (04/11):** reutilizado o processo Node 31992 (`scripts/preview-ui.mjs 5000`), escutando somente em `127.0.0.1:5000`. Login, Início, CRM1, P&D, Financeiro, Custos, estilos/runtime novos e bundle final `index-B5kk0Cpd.js` responderam HTTP 200; CRM aponta para esse bundle. Servidor mantido ativo para visualização. Sem deploy, rebuild, login automático, alteração de dados ou regras. App mantém conexão com Auth/RTDB reais: ações de salvar/excluir podem afetar produção. Somente este registro foi alterado; nenhum arquivo de implementação ativo nesta solicitação.
- **UI/UX validado para consolidação (04/11):** base transversal/CRM/P&D + motion observado no MP4: máscara de navegação/abas, dados Financeiro/Custos com opacidade breve sem count-up, teclado/reduced-motion instantâneos. HTML 252 cenários, Radix36+8portais, CRM426 aprovados/6ignorados, build2560módulos+integrador86novos/72existentes, Financeiro126/Custos113/nav39 e motion6contextos/End/Home/alinhamento<1px/interrupção passados. Início integrado com shell/Firebasefake passou; não alegar loop antigo, FPS ou aparelho físico. Revisor base e revisor do incremento motion deram ship com os limites registrados; motion final foi revisado pelo patch e provas, sem releitura de fonte por ferramenta indisponível. DESIGN.md/sidecar validados pelo Tech Lead após falha do documenter auxiliar. 80 artefatos intermediários regeneráveis removidos, rastreados preservados. Parent atual `25a470b` já inclui o commit paralelo de Manipulação; nenhum hunk paralelo foi incluído no nosso índice. Publicação ainda não realizada deste lote; próximo marco setorial continua aberto.
- **Motion em implementação (04/11):** os 3 arquivos MP4 têm SHA-256 `d981d495…a7785db`, 416.485 bytes; cópias idênticas do clipe de 6,105s/720×1280. Frames decodificados com Range correto mostram destaque deslizante por máscara no menu e troca Overview/Pipeline/Customers/Schedule/Growth. Adaptar o padrão observado, sem afirmar que três Reels distintos foram vistos. Reservados `public/shared/kuryos-motion.css/.js`, `public/shared/financeiro-tela.js` e `public/shared/custos-tela.js` (apenas sinal de render), loader no `auth_check.js`, testes novos isolados e docs. Movimento só em ponteiro/estado ocasional; teclado instantâneo e preferência reduzida respeitada. Sem números financeiros intermediários, dados fictícios em produção ou mudança de regras.
- **Motion solicitado (04/11):** referências Reels `DeywyTcvzbX` (menus), `De_zgnrPMfJ` (Financeiro/Custos) e `DfIKeN-P4ox` (motion adicional). Consulta web bloqueada por throttling, pesquisa sem resultado e navegador integrado indisponível. Solicitados vídeos/gravações por pergunta assíncrona; não afirmar que os efeitos foram vistos/reproduzidos. Skill animate lida; motion futuro deve preservar dados/teclado/reduced-motion, sem contagens financeiras fictícias, parallax de operação ou mudança de permissão. Fechar a base validada primeiro. Documenter auxiliar falhou por indisponibilidade de uso antes de produzir arquivos; documentação será finalizada pelo Tech Lead, sem alegar revisão documental independente.
- **Ajuste de integração do redesign (03/11):** reservados também `Dockerfile` e `run_hostinger_deploy_test.js`: os dois estilos comuns importados pelo CRM precisam existir antes do build no estágio Docker. Copiar somente essas dependências antes do build e manter a cópia pública completa na etapa existente. `public/dossie_lote.html` também apareceu alterado por trabalho paralelo e fica fora deste lote, junto com Manipulação.
- **Regressão reproduzida de controles portados (03/11):** `Dialog` resolve DismissableLayer/FocusScope novos, enquanto Popover/Select/Alert resolvem cópias antigas no lockfile. O portal estava acima em z-index mas ainda não recebia clique dentro do Dialog. Reservado `crm-frontend/vite.config.mjs` para deduplicar os dois contextos compartilhados no bundle (sem atualização cega de dependências) e revalidar foco/Escape/nesting.
- **UI/UX — base em validação (03/11):** base visual comum e limite de viewport/foco para HTML e Radix; filtros acessíveis, visualizações pessoais e retorno ao recorte no CRM1/CRM2/P&D; tabela/CSV dos dados visíveis Chart.js sem novas leituras. Primeiras provas: 42 modais HTML/252 viewports, 36 casos React mais teclado simulado e foco; CRM 425 testes antes do cache de sessão + build oficial/integrador. Revalidar após revisão final. `public/manipulacao.html`, `public/shared/manipulacao.js` e `run_manipulacao_test.js` apareceram alterados em paralelo e NÃO pertencem a este lote; preservar, não incluir no commit/publicação UI. Reservados também `run_inicio_ui_test.js` (contrato visual/capturas), arquivos novos `filterViews`, `useScopedFilters`, `SavedFilterViews`, testes e `.impeccable/surfaces/`/documentação. Revisor terá worktree própria e fonte principal somente leitura. Nenhum deploy ou dado real alterado por este redesign até este registro.
- **Em andamento — execução UI/UX e modais (03/11):** plano aprovado pelo usuário, incluindo Vibe Coding Toolkit e prioridade para todos os modais responsivos. Reservados os estilos/componentes compartilhados `public/shared/kuryos-*`, `public/shared/crm-pd-responsive.css`, `public/auth_check.js` (somente carregamento/shell), `public/inicio.html`, `public/dashboard*.html`, componentes UI/layout/estilos e telas de dashboard/CRM/P&D em `crm-frontend/src/`, testes novos de UI, documentação de produto/design e artefatos CRM exclusivamente gerados pelo build oficial. Trabalho sequencial neste checkout; agentes históricos estão encerrados/errored e os escopos antigos descrevem código já integrado, não edição concorrente. Alinhamento: retomada pelo Tech Lead dos arquivos compartilhados antes marcados por frentes históricas; nenhum bloco de outro agente será alterado. Preservar auth, papéis, regras, dados e automações; sem bootstrap global de máquina ou novas integrações pagas. Validação isolada antes de qualquer publicação.
- **Plano UI/UX entregue para aprovação (03/11):** proposta em seis marcos: inventário/marca, protótipos Executive/CRM/P&D, base visual e filtros comuns HTML+React, dashboards/CRM/P&D, expansão aos setores e homologação/publicação gradual. Fontes GitHub consultadas; Impeccable disponível, demais integrações não instaladas/configuradas nesta tarefa. Site institucional retornou 502: confirmar tokens oficiais antes de fixar paleta. Nenhuma tela, pacote, desenho externo, conta, regra, banco ou produção alterada; somente registro de coordenação. **Arquivos ativos: nenhum; implementação depende da aprovação do plano.**
- **Planejamento UI/UX (03/11):** pedido de plano para redesign integral mantendo cores Kuryos; consultar Impeccable, UI UX Pro Max, Blender MCP, img2threejs, Penpot e site institucional como fontes. Escopo somente leitura/inventário e este registro; nenhuma tela, dependência, instalação, regra ou publicação autorizada nesta etapa. Plano será entregue no chat para aprovação antes de protótipos/implementação.
- **Publicado — painel ADM de senhas/acessos (03/11, 18:30 BRT):** `188ed53d04c29d04302ba2dc162d0eeeaa9d059b` implantado; versão saudável, página Usuários HTTP 200/hash igual ao local, serviço no container hash igual, API health 200/39 funções e identidade sem token 401. Rollback de código `bd24410` preservado. Reautenticação inline resolve a causa observada no log; ADM define nova senha/prepara Auth ausente no mesmo UID e valida permissões, mantendo conflitos no cadastro de login já existente. Testes Auth/RTDB e UI isolados concluídos; ver validação acima. Nenhuma senha real foi definida, conta real criada, permissão concedida, regra publicada ou automação ligada nesta tarefa. Operação dos 10 perfis sem Auth e dos 3 conflitos deve ser concluída pelo ADM no painel com as senhas e permissões escolhidas; contas pending/desativadas não foram liberadas em massa. **Arquivos ativos: nenhum após este registro.**
- **Usuários — pronto para publicar (03/11):** reteste final Auth+RTDB emulados aprovado também para permissões antes/depois da preparação, sem journal parcial para pré-condição sem login. Testes novos de senha/segredo/revogação/retry, regressões identidade/falhas, 24 contratos UI, HTTP/auditoria, adaptador 14/14, rota SDK real e UI Chrome desktop/mobile aprovados. Uma repetição do Chrome expirou no lançamento; nova execução completa passou, sem falha funcional restante reproduzida. Inspeção das capturas feita. Os 3 conflitos possuem cadastro canônico: atalho seguro funciona sem fundir históricos. 20 perfis foram somente lidos; ninguém recebeu senha nova ou acesso real por estes testes. Nenhuma regra, CRM compilado ou automação alterada. Código pronto para commit/deploy por SHA.
- **Usuários: causa confirmada e correção validada (03/11):** logs VPS confirmaram `requiresRecentLogin` sem fluxo de reautenticação no painel. Agora confirmação inline com senha do próprio ADM, renovação do token e uma única repetição da ação preservam formulário/requestId; cancelar não envia alteração. Nova senha pode ser definida via servidor com confirmação do e-mail, política mínima, revogação e trilha sem senha nem fingerprint do segredo; login faltante preparado no mesmo UID pela regularização existente, preservando funções/módulos. Conflitos recebem atalho ao cadastro já vinculado, sem fusão/apagamento. Leitura atual: 20 perfis com e-mail, 7 vinculados, 10 sem Auth, 3 conflitos, 3 e-mails duplicados, 5 pending, 4 desativados, 9 Auth; zero locks/ações exigindo conferência. Nenhum dado real alterado. UI Chrome isolado 390/1200 e capturas inspecionadas; Auth+RTDB reais emulados comprovaram senha nova aceita/antiga recusada, mesmo UID/permissões; testes de serviço/contratos/regressões/rota `/api` aprovados. Reservado também ajuste documental mínimo em `CLAUDE.md` e script de auditoria somente leitura. Publicação pendente neste registro.
- **Em andamento — usuários/permissões/senhas (03/11):** Marlos continua sem conceder permissões/criar/redefinir senhas. Reservados `public/usuarios.html`, `functions/identidade_acesso.js`, testes próprios de identidade/UI e adaptador HTTP somente se a prova indicar. Conferir vínculos perfil/Auth de todos os e-mails em leitura; implementar recuperação de senha e validação de acessos para cadastros existentes sem duplicação. Nenhuma senha real alterada, função concedida em massa ou conta criada automaticamente; correções testadas com fixtures/emuladores antes de publicar. Escopos antigos descrevem entregas integradas; worktree limpo, sem edição concorrente.
- **Publicado — D0 com justificativa e aprovação ADM (03/11, 17:10 BRT):** `bd244101663eb500926eb4adc1a9fced500c11e8` implantado na VPS; versão saudável, API 200/39 funções e hashes de CRM incorporado/API/PDDetail/CRM2 iguais ao build local. Fluxo e textos confirmam que D0 pode seguir ao Comercial após aprovação administrativa, sem esperar D24h/D48h e sem encerrar estabilidade. Trava dos 100% preservada; regras e dados reais não alterados. Testes 422 CRM + 4 integração real/emulador e prévia visual isolada aprovados. Nenhuma aprovação real efetuada. **Arquivos ativos: nenhum após este registro.**
- **D0 validado para publicação (03/11):** liberação antecipada já permitia pedir antes do D24h; corrigidos erro antigo que dizia “já com D24h”, orientação/botão/modal P&D e exemplo de justificativa ADM. Mantida política anterior, inclusive pedido sem leitura identificado como tal; D0 não é aprovação nem conclusão do estudo. Novos testes provam justificativa, pendência sem envio, não ADM recusado, ADM com autor/data/motivo, ticket real e estudo IN_PROGRESS. CRM 422 aprovados; integração real API/handler/regras 4/4; render SSR e Chrome isolado 390/1280 sem overflow, capturas inspecionadas. Build com mensagem final conferida e integração oficial concluídos. Nenhuma regra alterada nem amostra real enviada/aprovada. Arquivos reservados desta retomada + artefatos gerados somente; publicar commit após revisão do índice.
- **Em andamento — envio antecipado com D0 (03/11):** pedido explícito do Marlos: justificativa + aprovação ADM permitem envio ao Comercial com D0. Retomar pontualmente `crm-frontend/src/lib/liberacaoAntecipada.js`, `firebaseApi.js`, testes dessas rotas e textos existentes da liberação nas telas, se necessário. Confirmar pedido pendente/recusado sem envio, aprovação ADM com autor/data/motivo e estabilidade continuando; não aprovar nem enviar amostras reais. Artefatos somente via build oficial. Nenhuma outra frente ativa concorrente no worktree limpo; preservar escopos históricos.
- **Publicado — desbloqueio P&D/CRM (03/11):** código `b58eb749a25336ff1acf08f4c80180465a281196` na VPS e regras publicadas explicitamente em `erpkuryos`, relidas integralmente iguais à fonte. Containers web/functions saudáveis; health/API 200 (39 funções); callable sem token 401; hashes públicos de `crm-app.html`, API e PDPage iguais ao local. Rollback de código preservado em `397b4a3` (regras são publicação independente). Teste real adicional `run_liberar_etapa_pd_test.js` aprovado; testes novos e validações descritos no relatório. Correção de parser no verificador de regras trata resposta textual JSON com comentários, sem imprimir regras ou credenciais. Avisos de whitespace do bundle gerado em `Combination` são saída do build, não editada manualmente; diff das fontes limpo. Triggers/schedules continuam 1. Nenhuma conta/card real movida, nenhuma carga de dados. **Arquivos ativos: nenhum após registro; aguardando aceite do gesto no navegador do operador.** P0 industriais/estoque/cutover não estão encerrados por este incremento.
- **Correção P&D/CRM validada localmente (03/11):** Kanban e PUTs genéricos passam pelo pipeline da ficha; pré-condições antes de ticket/efeitos, justificativa no retrocesso, repetição sem novo histórico/amostra. Encontrada segunda causa no emulador: ticket válido não bastava porque os quatro nós explícitos não herdavam a escrita do wildcard. Esses nós agora repetem a mesma política de perfil/sessão/setor/tenant; pai, auditoria e tickets continuam protegidos. Suíte CRM 419 aprovados; integração real API+handler+regras 3/3 (CRUD ADM/Comercial/P&D, perfis negados, outro tenant, revogação, validações de aprovação/desconto/SKU, ticket obrigatório e retrocessos); SDK modular/API, identidade, HTTP, auditoria e Hostinger aprovados. Build Vite + integração oficial concluídos. Sem movimentação real, JSON ou automação. Relatório `CORRECOES_PD_KANBAN_20261103.md`. Publicação ainda pendente neste registro.
- **Regra ERP em investigação (03/11):** prova integrada encontrou ticket válido, mas escrita recusada no nó explícito `pd_requests`. Reservados somente os nós explícitos CRM de `database.rules.json` (`pd_requests`, `sku_por_orcamento`, `crm_samples`, `crm_propostas`) e testes próprios: conferir herança do wildcard, replicar a mesma autorização de coleção se confirmada, sem liberar `audit_log`/tickets ou mudar a política de sessão/tenant. O bloco histórico `config/tipos_componente` não será tocado.
- **Extensão pontual P&D (03/11):** reservado também somente o handler `liberarEtapaPd` em `functions/index.js` e `run_liberar_etapa_pd_test.js`: alinhar o retrocesso Aguardando Aprovação → Em Testes já previsto na ficha, mantendo os demais retrocessos negados. Testes de integração novos usam exclusivamente projeto demo/emulador; integração do bundle será feita pelo build oficial, sem edição manual de artefatos.
- **Em andamento — cards de P&D não movem para ADM (03/11):** Marlos localizou a falha no Kanban P&D. Rastrear `PDPage.js` → API Firebase → servidor/regras, reproduzir com fixtures/emulador e corrigir sem mover solicitações reais. Escopo inicial em leitura para os arquivos históricos do CRM; testes novos e este bloco reservados. Alinhar o arquivo específico antes de qualquer correção na frente CRM marcada historicamente como ativa. Não mexer em permissões reais nem remover travas de fórmula/aprovação por suposição.
- **Alinhamento da retomada P&D (03/11):** pedido atual ampliado para “ajuste todo o sistema”; retomada pontual pelo Tech Lead de `crm-frontend/src/lib/firebaseApi.js`, teste novo `firebaseApi.kanban.test.js` e, se a prova indicar, `lib/servidor.js`/teste próprio. Registros da antiga frente CRM descrevem entregas já integradas; não há mudança concorrente nesses arquivos no worktree atual. Não tocar nas demais telas/estilos da frente histórica nem editar bundle manualmente. Defeito localizado: rota de arrastar escreve status sem a liberação exigida pelas regras, enquanto ficha tem pipeline separado.
- **Diagnóstico ainda não concluído — administrador sem conseguir alterar no publicado (03/11):** VPS relida em `397b4a3`, dois containers saudáveis; últimos logs mostram somente a prova sem token, sem a tentativa autenticada relatada. Nenhuma causa nova reproduzida ou correção publicada nesta reconferência. Controle de tela identificou a janela Chrome de Usuários, mas foi encerrado pela ferramenta por não conseguir determinar a URL com segurança; nenhum clique ou salvamento executado. Pergunta de tela/erro/e-mail enviada ao Marlos, sem pedir senha. Aguardar a evidência da tentativa para distinguir sessão, regra, vínculo ou código; não relaxar segurança por suposição. Somente este registro alterado, sem commit ou arquivo operacional ativo.
- **Publicado — incremento de acessos/virada (03/11):** `3f6d2cf` (rota `/api` preservada no SDK real, CRUD/regularização explícita no mesmo UID, bloqueio de perfil duplicado, compensações, journal/requestId/trava) + `397b4a3` (validade da expedição e numeração). VPS saudável em `397b4a384ea360dcd6df8befed65829b915040c9`, rollback `43c63ad`; quatro arquivos públicos com hash igual ao local, health/API 200 e callable sem token 401. Serviço no RTDB emulado aprovou journal/cache frio/compensação/UID/concorrência; contadores com papel Compras aprovaram 8 reservas concorrentes reais no emulador; testes em memória/contratos UI/SDK Chrome desktop/mobile/expedição/carga/devolução/segurança/Hostinger/navegação aprovados. Relatório: `CORRECOES_VIRADA_ACESSOS_20261103.md`. Sem regra nova, JSON reimportado, usuário real criado/alterado ou expedição real. Automação continua desligada. Não equivale ao aceite industrial; quatro colisões antigas, vínculos reais, recuperação de interrupções e demais P0 anteriores continuam explícitos. **Arquivos ativos: nenhum após registro documental.**
- **Reconciliação pontual aplicada (03/11):** somente contadores compartilhados do `erpkuryos`: PC 19→81, SC 10→39, COT 14→44. Backup privado `counter-reconcile-1793730625018.json`, transações monotônicas, segunda simulação sem mudança e hashes das três coleções iguais; nenhum documento renumerado, nenhum JSON reimportado. Quatro colisões históricas existentes encontradas (PC-0018/0019, SC-0010, COT-0014); pergunta de circulação externa enviada ao Marlos, pendente. CRM usa helper distinto: arquivo marcado ativo de outra frente não foi alterado; alinhamento do contador compartilhado já beneficia esse fluxo. Correção mínima da coluna de validade inclui `public/shared/expedicao-grade-tela.js`, sem outra intervenção visual. Não há outro agente em execução nesta árvore, mas os escopos históricos de CRM foram preservados.
- **Concluído — diagnóstico do CRUD de usuários (03/11):** `DIAGNOSTICO_CRUD_USUARIOS_20261103.md`, 5 achados: SDK compat 10.7.0 descarta `/api` e POST cai na raiz 404 (confirmado com SDK real em Chrome isolado; URL explícita preserva o caminho no controle); perfis órfãos sem regularização e criação direta pode duplicar perfil; módulos persistem após erro de revogação; Auth/perfil persistem após erro de auditoria; aviso conta valores false como liberados. HTTP sem token em produção: raiz 404/API 401 correto. Suíte de serviço aprovada, contratos UI 24, adaptador 14/14, segurança HTTP/auditoria aprovadas; dois novos testes diagnósticos reproduzem 4 falhas, não são correções. Arquivos: relatório, `run_identity_route_audit_test.js`, `run_identity_failure_audit_test.js` e este bloco. Sem conta real, regra, código operacional, push/deploy ou commit alterado; correção e publicação pendentes de autorização. Não considerar CRUD aprovado.
- **JSON existente confirmado (03/11):** arquivo `(1).json` de 01/11, 25.276.514 bytes, hash `E29F5314…D718971D`, igual à importação documentada; Marlos não precisa reenviar esse mesmo arquivo. Complemento no relatório conferiu 9 das 25 coleções negadas: 5 idênticas historicamente; 4 filas/estados técnicos diferentes (incluindo 88 marcas de OP e 79 de pesagem exclusivas do export). Não copiar filas/reprocessar histórico; não reimportado. Os 25 caminhos continuam sem leitura ao vivo, com 9 adicionalmente conferidos contra o export histórico. Pendência principal é fechar bloqueios de código/acessos/numeração/automação, não repetir importação. Somente relatório e este bloco alterados.
- **Conferência disponível concluída / virada não recomendada (03/11):** `AUDITORIA_VIRADA_20261103.md`; leitura autenticada ao vivo oficial e Admin SDK destino, 117 caminhos conhecidos (67 equivalentes, sendo 24 vazios; 25 diferentes; 25 negados). Principais cadastros/OPs/pedidos do oficial presentes por chave no destino, com diferenças/exclusivos detalhados. 263 recursos públicos: 96 idênticos, 94 diferentes, 55 só nossos, 17 só oficiais (16 JS + 1 CSS), 1 indisponível nos dois. P0 confirmados: próximos PC-0020/SC-0011/COT-0015 repetiriam números existentes; dataValidade ignorada na expedição atual (duas provas sintéticas, sem expedição real); 14/16 perfis oficiais sem conta+perfil habilitado correspondente comprovado; gatilhos/agendas da VPS ainda desligados; P0 anteriores da OP reproduzidos. Estoque atual: 1.012 materiais, 321 saldos, 77 negativos, 295 lotes, chave de bloqueio não true. Testes: comparador 4/4, expiração 2 provas, OP 3 provas, navegação 39 perfis, prontidão e FEFO 19; E2E parou na emissão em harness sem callable novo, não aprovado nem atribuído sozinho à produção. Snapshot/checklist privado de acessos em `scratch/virada-20261103/`, ignorado e ACL restrita; nenhum dado, usuário, regra ou deploy alterado. **Conferência integral depende de export novo do oficial solicitado ao Marlos**; não alegar paridade ou aceite de fábrica. Arquivos exclusivos desta tarefa: `scripts/auditoria-virada/**`, dois testes `virada-*`, relatório novo e este bloco. Sem push.
- **Publicado por autorização do Marlos (03/11):** incremento até `43c63ad3801f9f6e1973bb1288d8005e2ed28390` enviado à branch `hostinger-deploy` e implantado na VPS `kuryoserp.com.br`. Ambos os containers saudáveis; `/healthz`, `/api/health` (39 funções) e `/login.html` HTTP 200. Testes locais EPA/OP 43/43 e contratos Hostinger 24/24; testes da política 2/2 dentro do container publicado. Rollback preservado em `bf1f39d`. Sem regra, migração, dado real, configuração de estoque ou endpoint novo. Código/política EPA publicados, mas **não há nova tela ou fluxo operacional EPA integrado**; não anunciar liberação industrial ou correção dos P0 da OP. Registro documental posterior não muda a versão de código publicada.
- **Decisão EPA registrada/testada localmente (03/11):** Marlos confirmou Qualidade + Engenharia de Produto para aprovar a revisão técnica antes da emissão. Política v1 em `functions/epa-policy.js` e documentação atualizada; teste exige as duas aprovações em qualquer ordem e recusa ADM sem os papéis. Suíte EPA/OP: 43/43 aprovados, incluindo provas de falhas existentes (não correções). Sem alterar políticas publicadas, perfis ou dados; nenhum push/deploy. Demais integrações industriais continuam pendentes. A pergunta de aprovadores do incremento anterior está resolvida, não pedir novamente.
- **Tarefa ativa — auditoria industrial/EPA (03/11):** ler o roteiro recebido e a EPA MR178 como fontes, mapear requisitos e conflitos contra o código e implementar incrementos locais verificáveis. Escopo inicial exclusivo: novos documentos `AUDITORIA_INDUSTRIAL_EPA.md`, `MATRIZ_REQUISITOS_REUNIAO_EPA.md`, `ESPECIFICACAO_EPA.md`, `PLANO_CORRECOES_INDUSTRIAIS.md`, módulo/testes EPA novos; arquivos compartilhados só após conferir os escopos ativos. Sem deploy, alteração de dados reais ou liberação industrial. Pendências externas de segurança permanecem abertas conforme relatório.
- **Incremento EPA 1 concluído localmente (`34593e5`):** núcleo de contrato/pendências/snapshot/hash, reducer de preparação/validação/aprovação/revisão e prévia PDF sempre marcada NÃO LIBERA PRODUÇÃO. 41 testes Node (33 novos do núcleo/preview, 3 provas de lacunas existentes, 5 da OP), CRM 408/2 ignorados e adaptador 14/14. Demonstração sintética A–H em `scratch/epa-demo/epa-demonstracao.pdf`, 3 páginas renderizadas/inspecionadas. Matriz inicial: 88 itens, 19 parciais, 4 ausentes, 65 não verificados; auditoria integral ainda em andamento. Reproduzidos em memória: OP aceita técnica em rascunho/sem EPA, consumo arbitrário e troca de material sob chave original. Não corrigidos no fluxo publicado. Política de aprovadores perguntada ao Marlos, pendente; faltam adaptadores reais, persistência/regras/API, artefato privado, portão de execução/estoque, imagens/barcode e UI. Nenhum módulo novo exposto por `index.js`, nenhuma regra/dado real alterado e nenhum push/deploy. Documentação completa do incremento nos quatro arquivos novos; não anunciar EPA instalada ou auditoria encerrada.
- **Correções de segurança publicadas parcialmente (03/11, `b609127` + `bf1f39d`):** RTDB/perfil ativo/sessão/tenant/setor, audit_log protegido e callable com autor do servidor, revogação API, login recente, rate limit/concorrência/URI, containers sem root/read-only/limites, CSP parcial + Report-Only, backup RTDB/Auth diário local e cópia manual restrita na estação. VPS saudável em `bf1f39d`; regras publicadas/relidas iguais; 408 testes CRM + build, servidor 14/14, identidade/HTTP/auditoria, regras negativas e restore real no emulador aprovados (86 nós, 24.560.548 bytes, export de 9 identidades). Relatório completo: `CORRECOES_SEGURANCA_20261103.md`. Pendências explícitas: root para script SSH, ativação/fluxo MFA, destino externo criptografado, troca pessoal da senha antiga e provisionamento/autorização Storage (ambos os buckets consultados retornam 404). Não declarar todos os 12 achados encerrados. Código/regras testados enviados à branch `hostinger-deploy`; apenas documentação/teste de restore posteriores à versão publicada.
- **Concluído — auditoria de segurança (03/11):** relatório `AUDITORIA_SEGURANCA_20261103.md`, 12 achados priorizados (incluindo riscos e lacunas explicitamente não confirmados em produção). Emulador `demo-security` confirmou leitura de fórmula por pending, escrita no CRM e exclusão de audit_log por production sem módulo Comercial; outro tenant negado. Regras publicadas equivalentes ao arquivo local. Provas locais confirmaram checkRevoked ausente e URIError não tratado no adaptador HTTP. Auth com MFA desativado; npm audit backend/CRM 0; HTTPS/headers/portas/permissões consultados. Storage efetivo, forense/IAM e restauração permanecem não verificados. Novo `run_security_audit_rules_test.js` contém somente fixtures locais. Nenhuma correção/deploy ou modificação em contas/dados de produção; nenhum indício de invasão foi demonstrado. Correções SEC-01..12 pendentes e ordenadas no relatório.
- **Publicado — migração para `kuryoserp.com.br` (03/11, `ccb8022`):** DNS autoritativo aponta para `187.41.112.2`; VPS saudável, ERP_DOMAIN/CORS no novo domínio, Firebase Auth autoriza raiz e www preservando os domínios anteriores. HTTPS direto à VPS com hostname/SNI real aprovado; API retorna JSON saudável com 38 funções; www e ambos os endereços `.tech` retornam 301 preservando caminho/parâmetros. Configuração anterior preservada em `/home/deploy/.kuryos-env-before-com-br` (permissão 600). Contratos Hostinger 24/24 e diff aprovados. Pendente apenas expiração dos caches DNS públicos: 1.1.1.1 ainda respondeu IP antigo `2.57.91.91` com TTL restante 308 s na última checagem; acesso sem override ainda pode mostrar estacionamento da Hostinger. Não declarar propagação global concluída com base apenas no teste direto à VPS.
- **Concluído e publicado — identidade e acessos do ERP (03/11, `11fcdc6`, versão publicada `57d7c58`):** login público ficou somente com entrada e recuperação/troca de senha; cadastro e exclusão públicos foram bloqueados também na configuração do Identity Toolkit do `erpkuryos`, com senha nova de 8+ caracteres, maiúscula, minúscula e número (`forceUpgradeOnSignin=false`). `usuarios.html` ganhou CRUD administrativo de conta, funções, módulos e tenant, reset, revogação de sessões, bloqueio real no Firebase Auth, reativação e exclusão arquivada. Tudo passa pela callable `gerenciarUsuario`/Admin SDK, com auditoria, rollback de falhas, proteção transacional do último administrador e regras que impedem escrita administrativa pelo navegador. Validações: serviço e rollback unitários; 24 contratos UI/servidor; regras aprovadas no emulador; 78 transações/250 arquivos no cache frio; navegação de 39 perfis; recuperação tardia; Hostinger 23/23; sintaxe/diff; inspeção visual desktop/compacta. Em produção: Auth relido em `ENFORCE`, signup/delete públicos desligados; containers `web` e `functions` saudáveis na VPS; HTTPS, `/healthz`, `/api/health`, login, Usuários e callable protegida aprovados; regras do `erpkuryos-default-rtdb` compiladas e publicadas com sucesso. O único erro de aplicação nos logs foi o `401` intencional da prova sem token.
- **Concluído e publicado — alias HTTPS `www` (03/11, `3c9aac5`):** `www.kuryoserp.tech` agora tem TLS válido e redireciona permanentemente ao domínio principal, preservando caminho e parâmetros. Caddy validado na VPS; prova externa e local retornou `301` para `https://kuryoserp.tech/login.html`; API saudável com 38 funções. Contratos Hostinger 24/24 aprovados. Versão atual da VPS: `3c9aac510b9fde8a20ef544a6248df0f8a2a4436`, incluindo identidade e acessos; regras do banco já publicadas. CRUD mutável foi testado em ambiente isolado; contas reais não foram alteradas nesta verificação de produção.

- **Tarefa ativa — implantação Hostinger (01/11):** diagnosticar a stack real e preparar o primeiro deploy na Hostinger sem Render/Vercel, preservando Firebase Auth/RTDB/Storage/Functions enquanto ainda forem dependências do sistema. Escopo exclusivo: arquivos novos de infraestrutura Hostinger, `.env.production.example`, `DEPLOY_HOSTINGER.md`, scripts de deploy/validação/backup necessários e ajustes mínimos de configuração descobertos na auditoria. Nenhuma importação, migração de banco, alteração de DNS ou publicação em servidor real sem apresentar antes versão/destino/procedimento validados.
- **Concluído — preparação Hostinger (01/11):** arquitetura confirmada como frontend estático/CRM Vite + backend Node 24 com 25 callables, 2 APIs, 6 escutas RTDB e 4 agendas; recomendação KVM 2/Ubuntu 24.04 LTS/Docker/Caddy. Corrigida a quebra real do `firebase-admin` 14 modular em `da09016`. Infraestrutura, deploy por commit, rollback, backup RTDB/Storage + Restic, restauração isolada, DNS/cutover e operação documentados em `d2507f7`. Validações: servidor 14/14, CRM 408/408 (2 ignorados) + build, contratos Hostinger 21/21, Caddy válido, Compose válido, ShellCheck limpo, npm audit 0/0 e nenhuma credencial administrativa no bundle. Docker não existe nesta estação; build/subida dos containers, TLS, login e persistência final são portões na VPS. **Nada publicado, nenhum DNS ou dado alterado.**
- **Corrigido — primeiro build Hostinger (02/11):** o BuildKit reproduziu corrida no cache npm compartilhado: a imagem `functions` executava `npm cache clean --force` enquanto `web` ainda fazia `npm ci`, falhando com `ENOTEMPTY`. A limpeza redundante do cache montado foi removida em `4ae6f6b`; contrato preventivo incluído e 22/22 verificações Hostinger aprovadas. Publicação registrada no commit de status seguinte da branch `hostinger-deploy`.
- **Validação pós-deploy Hostinger (02/11):** versão `c644aa5` saudável na VPS; HTTPS, `/login` e `/api/health` aprovados, com 37 funções carregadas e gatilhos/agendas ainda desligados. Corrigido em `7bf7661` o 404 do `/healthz` público causado pela precedência do `handle` estático; contrato preventivo incluído e 23/23 verificações Hostinger aprovadas. Pendente redeploy e prova externa do endpoint.
- **Tarefa ativa — reconciliação das 46 pendências com o oficial (02/11):** usar `prod-kuryos.web.app/historico.html` somente como fonte oficial da fábrica até 30/10/2026, identificar por chave de negócio cada órfão importado no `erpkuryos`, produzir decisão e evidência por registro, simular uma atualização idempotente, fazer backup e só então aplicar correções sem duplicar nem inventar dados. Escopo exclusivo: `scripts/firebase-merge/**`, `run_firebase_merge_test.js`, novo `run_reference_reconciliation_test.js`, `public/shared/pendencias-setor-ui.js`, novo relatório `AUDITORIA_REGULARIZACAO_46_20261102.md`, artefatos reais em `scratch/` e este bloco. A UI compartilhada entra apenas para impedir que alias de SKU ou especificação de material volte a ser marcada como produto órfão. Nenhuma escrita durante a coleta no sistema oficial.
- **Concluído — reconciliação das 46 pendências (02/11):** plano `reconcile-f3a6238cce852802` aplicado no `erpkuryos` com precondições ao vivo, backup, checkpoint, dois lotes e gatilhos desativados. Resultado: 46/46 resolvidas com evidência do corte oficial; 10 eram especificações de materiais válidos, 25 referências de produto/alias e 11 placeholders históricos; 12 aliases novos/achatados; zero produto duplicado e zero alteração nos 46 registros históricos. Pós-leitura: 0 abertas, 0 alias/destino quebrado; segunda execução planeja 0 campos. Importador e baixa automática corrigidos para reconhecer `sku_historico` e `tipoItem=MATERIAL`; 23 testes aprovados. Implementação/auditoria: `3b20910`, `AUDITORIA_REGULARIZACAO_46_20261102.md`.
- **Publicado:** branch `hostinger-deploy` enviada ao GitHub até `7f26c84`; os dados já estavam aplicados diretamente no `erpkuryos` pela execução auditada acima.
- **Tarefa ativa — operação integral por personas (01/11):** simular, em ambiente isolado/emuladores, operadores de Comercial, P&D, Cadastros, Compras, PCP, Produção, Qualidade, Estoque, Logística/Expedição, Financeiro, Controladoria, RH e Diretoria; concluir o fluxo ponta a ponta, auditar regras, papéis/tenant, navegação, UI e integrações, corrigir defeitos reproduzíveis e consolidar evidências. Produção fica somente leitura para não criar pedidos, OPs, saldos ou usuários fictícios. Agentes auxiliares trabalham apenas em leitura; arquivos exclusivos do Tech Lead serão testes/relatório novos e correções fora de qualquer escopo ativo declarado neste arquivo.
- **Tarefa ativa — aplicação da fonte atual (01/11):** por autorização do usuário, tratar o export de 01/11 como fonte mais atual, ignorar registros idênticos, aplicar inclusões e divergências de negócio sem duplicar efeitos, importar os 46 órfãos e registrá-los para regularização com aviso laranja em Cadastros. Arquivos ativos exclusivos: `scripts/firebase-merge/**`, `run_firebase_merge_test.js`, `public/cadastros.html`, testes específicos, regras se necessárias, documentação e este bloco. Aplicação somente após nova simulação, backup, validação e `--disable-triggers`.
- **Concluído — aplicação da fonte atual:** `merge-7d3744273b64c678` aplicou 269.237 campos em 27 lotes no `erpkuryos`, com backup/checkpoint e gatilhos desativados. Os 46 órfãos foram importados e abertos em Cadastros (19 OPs, 18 especificações, 3 BOMs, 3 pedidos, 3 fórmulas). Auditoria pós-aplicação `merge-a32a9598d2560a22`: zero inclusões, complementos, sobrescritas, conflitos ou rejeições. Popup laranja desktop/mobile e fechamento automático entregues; testes do merge 15/15 e testes de pendências aprovados.
- **Publicado:** frontend/importador em `1503896`, otimização dos lotes em `c5f5820` e fechamento pós-importação em `9aba65e`, todos enviados ao `main` em 01/11/2026.
- **Tarefa ativa — união conservadora de dados reais (01/11):** implementar simulador/importador idempotente para comparar `prod-kuryos-default-rtdb-export (1).json` com fotografia somente leitura do `erpkuryos`, validar vínculos, gerar plano/proveniência/backup/reversão com detecção de concorrência e impedir efeitos operacionais. Arquivos exclusivos previstos: `scripts/firebase-merge/**`, `run_firebase_merge_test.js`, `AUDITORIA_MERGE_DADOS_20261101.md`, este bloco e `CLAUDE.md`. Nenhuma escrita em produção nesta etapa.
- **Resultado da união de dados:** rotina concluída em `scripts/firebase-merge/`; simulação `merge-aafb10ee8a418f0a` encontrou 2.304 registros novos, 684 complementáveis, 4.968 idênticos, 1.056 conflitantes e 46 rejeitados (264.952 folhas planejadas), sem escrita. Export anterior acrescenta zero campos. Testes 12/12 e repetição real idempotente com zero novas inclusões. Detalhes e comandos em `AUDITORIA_MERGE_DADOS_20261101.md`; aplicação depende de revisão dos conflitos/referências e janela de corte.
- **Publicado:** implementação e auditoria enviadas ao `main` no commit `74ac4b0`; artefatos reais permaneceram em `scratch/` e nenhuma escrita foi feita no Firebase.
- **Pedido atual:** resolver Dia D/saldo de abertura, cutover, emissão de OP no servidor, OP sem data/fila, acessos/tenant, dados mestres, propostas legadas e vulnerabilidades residuais.
- **Escopo inicial:** primeiro auditar os mecanismos existentes e separar automação segura de ações que exigem contagem física ou dado contábil real; alterações previstas em funções/regras/testes, emissão/planejamento, inventário/cutover, usuários e documentação. Nenhum dado real será inventado e nenhuma migração destrutiva será executada sem backup e reconciliação.
- **Concluído:** emissão normal de OP migrou para callable atômica (validação de perfil, fórmula/BOM, saldo menos empenhos, numeração, criação, empenho e alerta) e criação direta normal foi bloqueada nas regras (`563ade1`; 5 testes). Dependências zeradas nos dois `npm audit`, sem `--force`, CRM 408/408 + build (`1d296fe`). Em produção, `tenant_id=kuryos` foi aplicado aos perfis ativos de Adlai (2), Diego e Roberta; Roberta `pending` foi preservada. Propostas JOHN'S WOOD/abelinha já tinham SKU e saíram da pendência. Fila explícita de OP sem programação já existia e foi reconfirmada.
- **Pendências externas:** executar fisicamente o Dia D e escolher horário/responsáveis do cutover; informar quem recebe Financeiro, Controladoria e RH; fornecer bancos/títulos, contas ECD, capacidade, lead time e lote mínimo reais. Roteiro: `PLANO_DIA_D_CUTOVER.md`.
- **Validação:** CRM 49 arquivos/408 testes aprovados, 1 arquivo/2 testes ignorados; Vite 8.3.5 build aprovado; backend 5/5 e sintaxe de todos os JS raiz; `npm audit` 0/0.

- **Pedido:** (1) reprogramar pela duração/ritmo real: atraso empurra todas as OPs seguintes e adiantamento puxa todas; (2) a zona fixa não impede esse reflow; (3) manter grade de 15 minutos; (4) construir em Ajuda o workflow completo do sistema e de cada setor; (5) auditar o sistema inteiro e corrigir falhas.
- **Coordenação:** Dev Full Stack 1 trabalha apenas no motor/tela/testes de Planejamento; Dev Full Stack 2 trabalha apenas em `public/manuais.html`, módulos novos exclusivos da Central de Ajuda e testes. Ambos usam branch/worktree própria; o Tech Lead integra commits revisados e executa a auditoria transversal no `main`.
- **Arquivos do Tech Lead:** `AGENT_STATUS.md`, `CLAUDE.md`, relatório de auditoria final e correções encontradas fora dos arquivos ativos dos devs. Nenhuma publicação antes das suítes e revisão visual.
- **Estado inicial:** `main` limpo em `34e47d0`; decisões anteriores de 15 minutos mantidas; decisão nova remove a zona fixa do reflow automático e manda usar o ritmo real da linha em ambas as direções.
- **Concluído (01/11):** Planejamento integrado em `1208174`; Central de Ajuda em `1f58dfb`; HOM em `805de54`; RNC/cache frio em `19e191f`; backlog sincronizado em `f7939ac`. Auditoria final em `AUDITORIA_SISTEMA_20261101.md`: corrigidos banco legado da Inspeção Total, índice público de responsáveis, links antigos dos e-mails, fallback de gatilhos, sobreposição mobile e fixtures frágeis. Validação: 129 scripts triados/verdes; CRM 408/408 (2 ignorados) + build; motor 31; Ajuda 93; navegação 39 perfis; coerência 402; banco emulado e fluxo ponta a ponta. Pendências operacionais e de segurança residual estão classificadas P1/P2 no relatório.
- **Publicado:** `main` enviado ao GitHub em 01/11 até `aa338d9` (implementação, correções, build e relatório); este registro de encerramento é o único commit posterior.

### Claude — Reunião 28/10: menu do Gustavo + ajustes CRM · P&D · Kickoff · BOM · Compras · PCP · Financeiro

- **Pedido:** executar `PROMPT_REUNIAO_20261028.md` (Agente 1 tech lead + Agente 2 dev). Referência: `prod-kuryos.web.app` (só leitura) e `gcallegaro-kur/PCP-Kuryos`.
- **Estado (30/10):** no `main`: Fase 2 (CRM-01..04), Fase 1 (menu do Gustavo, Início), Fase 3 (PD-01..06) e FIN-01/OP-01/OP-02, revisados pelo tech lead e publicados. Em seguida, sem parar (pedido do Marlos em 30/10): Dev 2 → Fases 4 e 5; Dev 3 → Fase 6; Dev 1 → Fase 8.
- **Arquivos ativos:** `docs/superpowers/specs/2026-10-28-reuniao-ajustes-design.md` e `docs/superpowers/specs/2026-10-28-matriz-lacunas-gustavo.md` (novos). Código só depois do Portão A. MENU-01/02 tocam `auth_check.js` e o shell, que têm alterações abertas de outra sessão (D-12).

### Claude (Dev Sênior 1) — Reunião 28/10: menu lateral do Gustavo (29/10/2026)

- **Pedido:** Fase 1 de `docs/superpowers/specs/PROMPT_REUNIAO_20261028.md` (MENU-01 registro único, MENU-02 identidade, MENU-04 CRM no shell, MENU-03 Início), em worktree própria, branch `reuniao-20261028/menu`; integra o tech lead (Agente 1). Sem push.
- **MENU-01:** `public/shared/navegacao.js` (registro único, UMD) + montagem do menu por ele em `public/auth_check.js`; Logística virou Armazém (Estoque/Fluxo) + Expedição (um link com `fam` para as três etapas). `PAGINA_MODULOS`, `KURYOS_MODULOS` e `podeAbrirPagina` intocados. Regressão em `run_navegacao_test.js` contra `run_navegacao_fixture.json` (menu antigo de `087dfd7`, 39 perfis, gerado por `run_navegacao_menu.js --fixture`).
- **MENU-02:** identidade no fim de `shared/kuryos-ui-layout.css` (data-tom s1/s2/s3/neutro). **MENU-04:** `crm-pd-shell-bridge.js` acompanha as rotas do React (`run_crm_menu_ui_test.js`). **MENU-03:** `public/inicio.html` primeiro em `ORDEM_HOME` e destino do login (TV segue no placar); aberta a todo autenticado (fora de `PAGINA_MODULOS`, como os manuais) porque só mostra o que a pessoa abre; cartões sem Inspeção total e Pesagens (telas não existem aqui).
- **Arquivos ativos:** `public/auth_check.js` (só o menu), `public/shared/navegacao.js`, `public/shared/kuryos-ui-layout.css` (só a barra lateral), `public/shared/crm-pd-shell-bridge.js`, `public/crm-app.html`, `public/inicio.html`, `run_navegacao_*`, `run_menu_sanfona_ui_test.js`, `run_inicio_ui_test.js`.

### Claude — Financeiro e Controladoria (28/10/2026)

- **Pedido:** "todos os módulos se interligam; não mexa nos módulos já criados; Financeiro e Controladoria podem ser criados com base em SAP/TOTVS" — construir `PROMPT_FINANCEIRO.md` e `PROMPT_CONTROLADORIA.md`.
- **Arquivos ativos (novos):** `public/financeiro.html`, `public/controladoria.html`, `public/shared/financeiro.js`, `public/shared/financeiro-tela.js`, `public/shared/controladoria.js`, `public/shared/controladoria-tela.js`, `public/shared/gestao-financeira.css`, `functions/financeiro.js`, `functions/controladoria.js`, `functions/financeiro_servidor.js`, `functions/controladoria_servidor.js`, testes `run_financeiro*_test.js` e `run_controladoria*_test.js`.
- **Estado (28/10):** construído e testado — motores (81 + 59 asserções), servidor (11 casos), regras (47 no emulador `demo-gestao`; Custos 42 e pacote seguem passando), e2e com a base real (47/0), contrato do Render 35 funções.
- **Encanamento (só acréscimo):** `functions/index.js` (escutas, agenda e callables novos), `database.rules.json` (nós `fin/` e `ctl/`), `public/auth_check.js` (módulos `financeiro` e `controladoria` + links no menu; a linha da versão do shell é de outra sessão e fica fora do meu commit). Nenhum módulo existente muda.

### Claude — Custos e Resultado: LP, LPD, metas e bônus (26/10/2026)

- **Pedido:** "rode o prompt completo de custos, crie tudo" — `PLANO_CUSTOS_RESULTADO.md` (Fases 0–6) com o motor/regras de `PROMPT_CUSTOS_ERP.md`.
- **Estado (28/10):** construído, testado (113+121+112 asserções, 16 casos de servidor, 42 regras no emulador, e2e 40/0) e auditado duas vezes contra `PLANO_CUSTOS_RESULTADO.md` (`AUDITORIA_CUSTOS_20261028.md`, 14 defeitos achados e corrigidos). Regras `custos/`/`resultado/` publicadas em 28/10. Prompts dos próximos módulos: `PROMPT_FINANCEIRO.md` e `PROMPT_CONTROLADORIA.md`.
- **Arquivos ativos:** `public/shared/custos.js`, `public/shared/custos-realizado.js` (novo), `public/shared/resultado-pontos.js` (novo) e as cópias em `functions/`; `functions/index.js` (recebimento com custo no lote, razão, placar, tabela de pontos, fechamento); `public/custos.html` e `public/placar.html` (novas); `public/auth_check.js` (só módulos `custos`/`placar` e papel `tv`; a troca de versão do shell, linha ~1805, é de outra sessão e fica fora do meu commit); `public/login.html`, `public/usuarios.html`; `database.rules.json` (nós `custos/` e `resultado/`); testes `run_custos*_test.js`, `run_resultado_*_test.js`.

### Claude — Plano Amostra → Kickoff → Cotação → OP (21/10/2026)

- **Pedido:** avaliação do sistema + plano das alterações do usuário (lote de amostras, 100%, MP nova sem duplicar, aprovação do cliente, Kickoff estruturado, cotação/Compras/orçamento, SKU/CGI, OP 100%).
- **22/10:** o usuário mandou um prompt de engenharia (FastAPI/Mongo) para adaptar ao Firebase. Feito `PROMPT_ENGENHARIA_PACOTE_20261021.md` (prompt adaptado + viabilidade + plano estrutural); o rascunho `PLANO_FLUXO_AMOSTRA_OP.md` foi incorporado e removido. Nada implementado, sem commit; aguardando Q11–Q16.
- **Achados de infraestrutura:** fonte do ERP sem commit desde 09/10 (59 arquivos); `ERPKuryosBeauty-master/database.rules.json` é cópia velha que aponta para `erpkuryos` (sem `pendencias_setor`, `servicos`, `solicitacoes_cadastro_material`) — não publicar de lá; frontend do ERP não chama o servidor (travas só no navegador).
- **Revisão 2 (22/10), decisões do usuário:** Q15 autorizada (a fonte React vem para `crm-frontend/` neste repo; o repo ERPKuryosBeauty não recebe mais commit); Q14 tenant pela operação; câmbio sem congelamento, número + texto no histórico do cliente a cada etapa; Q16 sem q.s.p., popup vermelho e a Química completa; KO-09 (CGI) e PCP-01 (etiquetas) por último — avisar o usuário que faltam instruções ao terminar as Ondas 0–5. Produção liberada em 22/10.
- **Onda 0 (22/10):** INF-01 feito (`72773fa`: fonte React em `crm-frontend/`, build idêntico ao publicado, Vitest 209/209); INF-02 feito (cópia velha das regras renomeada para NAO-PUBLICAR; CLAUDE.md); INF-03 lista entregue (Adlai, Diego, Roberta sem tenant — correção pela operação); AUD-01 em `AUDITORIA_PACOTE_20261021.md` (medições na base, só leitura); ARQ-01 em `RFC_001_PROJETO_KICKOFF_PARALELO.md` — **aguarda aprovação de D-1/D-2/D-3** (bloqueia Fase 3 e AMO-05). Site de produção = Vercel `pcp-kuryos.vercel.app` (push no main publica).
- **Fase 1 publicada (22/10, Vercel):** AMO-01 (`1a48fc7`), AMO-04 (`8a61a40`: MP nova leva INCI…US$ ao Cadastros), AMO-03 (`50ae071`: 100% com tolerância 0,001 na fórmula e em cada variante dos lotes ao ir para Em Testes/entregar; 422 `FORMULA_NAO_FECHA_100` + popup vermelho; ensaio: nada em andamento trava, 2026-1022-a/b/c aprovadas com 100,4%), AMO-02 (`b3b9d9b`: `pd_formulacoes_base` versionada por projeto, lote guarda a versão, variação só troca fragrância, 422 se trocar ingrediente da base). Vitest 234/234. **Falta da Fase 1:** a camada de servidor do AMO-03 (INF-04: função no Render + `.validate` em `pd_requests/status`) — depende de autorização para publicar regra. Conferência visual com login no navegador não feita (sem Playwright/emuladores nesta sessão).
- **Fase 2 (22/10):** COM-02 publicado (`3230d7c`: modal quem/canal/data-hora em CRM3, CRM2, decisão do orçamento e "Registrar aceite"; 422 sem registro; timeline do projeto por transação). COM-01 publicado (`b1febca`: sem congelamento; taxa em número + texto no histórico do cliente no envio e na aprovação + `erp/kuryos/cambio_log`; orçamento aprovado usa `cambio_da_etapa`; sai a "Cotação US$ fixa" do P&D). CAD-01 (duplicidade de MP: `shared/duplicidade-material.js`, aviso ao digitar, bloqueio de mesmo tipo+nome, "Vincular" na tarefa do P&D → status VINCULADO) — commit a seguir. **Pendente:** índice de unicidade `materiais_chave` na regra do banco (precisa de autorização para publicar) e AMO-05 (depende do RFC).
- **22–23/10, decisões do usuário:** RFC aprovado (D-1 ok, D-2 Kickoff nasce com o projeto, D-3 V1+V4); publicar regras (trava dos 100% com função no Render gratuito); Q12 = cotação em registro próprio.
- **Regras PUBLICADAS em `erpkuryos` (23/10):** no ar = repo (conferido antes e depois); Render com `liberarEtapaPd` no ar (HTTP 401 sem login); Vercel com o build que chama o servidor; índice `materiais_chave` montado (685 chaves, materiais intactos). Backups no scratchpad: `regras-no-ar-20261022.json` (antes), `medicao/materiais-backfill.json`. **Falta conferir com login real:** um "Em Testes" no P&D (primeira chamada pode levar até 1 min com o Render dormindo).
- **23/10, teste do usuário:** "VÁLVULA SPRAY R.24/410 BRUMA MATTE 120ML" entrou 2× (EP-00001 e MPGR-00142, criado no teste como MPGR) porque a chave levava o tipo. Corrigido (`5a8a8ac`): chave só pelo nome; índice no ar refeito (685 chaves, formato antigo apagado, materiais intactos). **MPGR-00142 continua ativo** — é o registro de teste do usuário; inativar no Cadastros (não apaguei dado dele).
- **Publicação das regras (registro do que foi feito):** `liberarEtapaPd` (functions/index.js) + `shared/fechamento-formula.js` (cópia idêntica em functions/) + `crm-frontend/src/lib/servidor.js`; regras novas em `erp/$tenant/pd_requests/$req/status` (só com liberação), `pd_liberacoes_status` (só servidor), `aprovado_em_ms` (nunca no futuro), `materiais/$material` + `materiais_chave` (unicidade tipo+nome); inclui as pendentes de 17/10 (`pendencias_setor`) e 20/10 (`usuarios/$uid`). No ar antes = repo menos essas duas (backup no scratchpad `regras-no-ar-20261022.json`). Testes: `run_pacote_20261022_rules_test.js` e `run_liberar_etapa_pd_test.js` no emulador (`--project demo-…` obrigatório, senão o emulador não aplica as regras). Ordem: push (Vercel + Render) → conferir no ar → publicar regras → `scripts/backfill-materiais-chave.js` (685 chaves; 11 duplicatas antigas sem chave).
- **Atenção:** `public/cadastros.html` tem alteração pendente de outra sessão (índice "Usado em", 20/10) — meus commits levam só os meus trechos (montados sobre o HEAD); a alteração dela continua na pasta, sem commit.
- **Fase 3 publicada (23/10, Vercel):** KO-03, KO-05, KO-07, KO-01, BOM-01 (`3a0844e`: BOM por nível, MPs na ficha de manipulação), KO-04 (`71dc7da`: 25 tipos de componente com atributos e "Outro", catálogo editável pelo ADM em `config/tipos_componente`), KO-08 (`55edaa2`: serviços do Bloco 0 entram na cotação; fora do Kickoff trava o envio), KO-06 (`bcbbc39`: cadastro de RT), KO-02 (`3f5157b`: selo de origem, sobrescrita com motivo, nº de SKUs/o que varia pelas variações, display/master no CRM2; assinatura de bloco ignora campo vazio). AMO-05 (`12ff09b`: retrabalho de amostra aprovada; Kickoff e orçamento `desatualizado` até nova versão ou "revisado, sem impacto"). Vitest 295/295.
- **Fase 4 (23/10):** COM-03 (`60fb289`: cotação em `erp/kuryos/cotacoes`, COT-{projeto}-rN, revisões), COM-04 (`6e910e2`: `shared/ultimo-preco.js` + sugestão último PC → cotação aprovada → fórmula), COM-05 (`07caff0`: cotação abre SC no Compras, preço do fornecedor volta como COTADO; fixture do texto). Vitest 305/305.
- **Mongo antigo → Firebase (23/10, autorizado pelo usuário):** o sistema antigo seguiu em uso depois de 14/10. Importados 244 caminhos (só registros novos + 2 campos vazios; nenhum existente alterado, conferido a fundo): 5 amostras do Linha Praiana (2026-1038..1042) com briefing, solicitação P&D (aguardando aprovação), desenvolvimento, fórmula (todas 100%), card, estudo e 140 leituras. Clientes: nenhum novo (os 8 já existem com outra chave). **Pendente de decisão do usuário:** 3 versões do Bumbum Cream (v6, v6, v7 de 14–15/10, 63 caminhos) — aqui foi criada uma "V6" vazia em 23/10 18:46. Arquivos no scratchpad `mongo2/` (backup antes, plano, lote, `bumbum-20261023.json`). Marca `origem_migracao: mongo_erp_20261023`.
- **Fase 4 concluída e Fase 5 (23/10):** COM-06 (`e4e9807`: reprovado reabre cotação e orçamento em revisão; "cliente desistiu" arquiva), COM-07 (`505e0b0`: SKU na aprovação do orçamento, `aguardando_cgi`, índice `sku_por_orcamento`), PCP-02 (`1786700`: `shared/prontidao-op.js` + trava em `emitir_op.html` só para SKU do CRM; legado com aviso). Ensaio na base: 2 SKUs do CRM (PRF-JOHN-0001, PRF-TEST-0001) bloqueadas por v1 em rascunho + item pendente; 172 de 173 legados seguem com aviso. Regra de `ops/` deliberadamente fora (MELHORIAS). Falta só a Fase 6 (KO-09 CGI por cliente, PCP-01 etiquetas) — aguardando instruções do usuário.
- **Liberação antecipada do P&D (24/10, `c60e6e9`):** Em Testes com D24h → pedido à diretoria → ADM aprova/recusa no CRM2 (quem, data/hora, justificativa) → segue para Aguardando Aprovação sem o D48h. Diretoria = ADM (não existe papel Diretoria; criar exige as 5 pontas). Regra `pd_requests/$req/liberacao_antecipada` pendente de publicar (4ª da lista abaixo).
- **CRM3 ↔ P&D (26/10, `d032ba8` + build `9fb27a1`):** o status comercial da variação (`status`) deixara de seguir o P&D na migração (sistema antigo gravava `sincronizado_pd` até 20/10; Firebase só o `status_pd_raw`). Religado em `pdSyncRequestStatus` + `pdReconcileStatusMirrors` (`pdCards.statusComercialPeloPd`): Aberto→solicitada, Dev/Testes→em_elaboracao, Aguardando→enviada, Retrabalho→retrabalho; aprovada só pelo retorno do cliente (COM-02), decisão do cliente nunca é tocada. Ensaio na base: corrige 5 (2026-1003-h/i/j/k, 2026-1002-ai) ao abrir o CRM3. Pendente de decisão: 5 variações com card antigo sem solicitação no P&D (2026-1003-f, 2026-1002-e/g/m/t) — ver MELHORIAS.
- **Regras pendentes de publicar (3, testadas no emulador; no ar = `5a8a8ac`, backup `regras-no-ar-20261023.json`):** catálogo `config/tipos_componente` só ADM; contador de SC aceita o Comercial (COM-05); `produtos/$sku` aceita `origemCrm.orcamentoId` de orçamento aprovado + `sku_por_orcamento` (COM-07). A publicação pela CLI foi barrada pelo verificador de permissões; precisa do usuário.
- **Regra pendente de publicar (detalhe):** `config/tipos_componente/$codigo` só ADM (`.validate`, testada no emulador em `run_pacote_20261022_rules_test.js`). Sem ela, PCP e módulo config também gravam o catálogo pelo banco (a tela já restringe ao ADM).
- **Próximo:** Fase 4 (COM-03 cotação em registro próprio, COM-04 último preço, COM-05, COM-06 reprovação reabre a cotação, COM-07 SKU no orçamento aprovado), Fase 5 (PCP-02, OP 100%), por último KO-09 e PCP-01 (faltam instruções do usuário).
- **Arquivos ativos:** `crm-frontend/src/**`, `public/static/crm`, `public/crm-app.html`, `database.rules.json` (só o bloco `config/tipos_componente`).

### Claude — Visual do ERP (erpkuryos.web.app) em todo o PCP + dashboards (20/10/2026)

- **Pedido:** seções e dashboards com o aspecto do ERP no ar, mantendo as cores do PCP; "tudo de uma vez".
- **Referência:** capturas do ERP no ar (somente leitura) no scratchpad `e2e/ref/`: menu horizontal no topo com submenus, escuro por padrão, cabeçalho com ícone + título + ações, KPIs com ícone e borda tingida, painéis com borda fina, abas segmentadas.
- **Feito:** camada nova `shared/kuryos-erp-ref.css` + `.js`, carregada por último pelo `auth_check.js` em todas as telas (só apresentação). Ícone da seção antes do título; KPIs com rótulo em cima e borda tingida pelo tom (Diário mantém a faixa colorida por tom, como o PCP do ERP); painéis e abas no padrão do ERP. Gráficos: tema global do Chart.js a partir dos tokens (fontes, grade tracejada só no eixo de valores, tooltip, rosca 72%, área com degradê, borda branca e grade cinza fixas trocadas pelos tokens, escala polar sem caixa branca) + paleta `--chart-1..5` no Executivo e no Geral. Login no formato dividido do ERP.
- **Menu no topo do ERP: feito, publicado (`1854f96`) e RECUSADO pelo usuário no mesmo dia** ("volte a side bar inteligente"). Removido por inteiro; a barra lateral inteligente (compacta 76 px, abre ao passar o mouse, sanfona) segue como era. Não propor de novo.
- **Defeito antigo corrigido:** Dashboard Geral estourava a pilha ("Maximum call stack size exceeded", 5x por tema já no "antes") — `shared/dashboard-showcase.js` regravava `chart.options.*.labels/ticks/grid` sobre eles mesmos a cada mudança do DOM e trocava o objeto de `Chart.defaults.animation` (também em `dashboard_analise.html`). Agora mescla e não toca nas instâncias.
- **Validação (emuladores + Chrome, dados fictícios):** login+usuários 55/55, barra lateral de volta (76 px compacta, 280 ao passar o mouse e nos dashboards), 16 telas × 2 temas sem erro de JS. `test-ui-operational-contracts.mjs` não se aplica mais (falha contra o baseline por commits antigos e não compara contra HEAD). Em produção (só leitura): Executivo, Pedidos, CRM1, P&D e Geral sem erro de JS.
- **Arquivos ativos:** nenhum após o commit.

### Claude — Esqueci minha senha + cadastro de usuário pelo ADM (20/10/2026)

- **Pedido:** "esqueci minha senha" na tela de login e CRUD de usuários para o ADM em `usuarios.html`.
- **Login:** "Esqueci minha senha" envia o link do Firebase (mesma resposta para e-mail inexistente; continueUrl `/login` com fallback se o domínio não estiver autorizado); a própria tela troca a senha com `?mode=resetPassword&oobCode=` (confere o código, pede a senha 2x, tira o código da URL). Conta desativada vê o motivo e sai; login sem perfil cria perfil `pending` (antes nunca aparecia para o ADM); `auth/invalid-credential` com mensagem amigável.
- **Usuários (ADM):** "+ Novo usuário" (nome, e-mail, senha opcional — em branco manda link —, funções) cria a conta numa segunda instância do Firebase no navegador, sem derrubar a sessão do ADM e sem servidor; perfil com o mesmo cálculo de funções/módulos/tenant da janela de funções (`perfilDasFuncoes`). Coluna "Conta › Editar": nome, link de nova senha, **Desativar** (role `pending`, sem funções/módulos, guarda `funcoes_antes_desativar`) e **Reativar** (abre funções já marcadas). Não exclui: apagar o nó deixaria o login vivo e o nó recriável pelo dono.
- **Regra (`database.rules.json`, NÃO publicada):** `.validate` em `usuarios/$uid` — quem cria o próprio perfil só nasce `pending`, sem funções/módulos/tenant. Antes qualquer pessoa podia se cadastrar pela aba pública e gravar `role: admin`.
- **Validação:** emuladores Auth + Database (JRE portátil no scratchpad) + Chrome via Playwright: 55/55 (`scratchpad/e2e/e2e.js`) — regras (6), esqueci/troca de senha (13), CRUD do ADM (36, incl. 375 px). Pendências em MELHORIAS › Segurança.
- **Arquivos ativos:** nenhum após o commit.

### Claude — Ajustes P&D → CRM → Cadastros, Fase 1 (15/10/2026)

- **Pedido:** plano aprovado em `PLANO_PD_CRM_AJUSTES.md` (7 fases). **Fase 1 publicada.**
- **Fase 1 (fonte do ERP, sem commit no GitHub do ERP; build em `public/static/crm`):** `lib/pdAmostra.js` (amostra 60 + unidade, base 1000, R$ da cotação na coluna própria, g/mL como milésimo de kg — antes 60 g contava como 60 kg no custo) e `lib/pdCards.js` (retorno do cliente no CRM3 volta ao P&D: aprovada → Aprovado, retrabalho/reprovada → Retrabalho; solicitação sem card ganha card; card órfão sai do quadro). Aprovação do químico saiu (`crmRules.formulaRegistrada` = cliente; Qualidade segue no Kickoff). "É decisor" no contato, sem "Tem Anvisa?" (`crmRules.temContatoDecisor`, lista antiga ainda vale). V1 nasce ao ir para Em Testes. Vitest 145/145.
- **Dados (15/10, conferidos contra ensaio sem gravação):** 10 solicitações → Aprovado (Afeer ×9, Perfumes de Nicho), 1 → Retrabalho (Maya Massafera), 3 cards criados, 10 aprovações de cliente, 11 entradas no histórico ("Retorno do cliente (CRM3)"). Backup antes: scratchpad `mongo/backup-pd-antes-fase1-20261015.json`.
- **Fase 2 publicada (15/10):** funil CRM2 com a etapa **Kickoff** entre Amostra Enviada e Cotação (`crmRules`: Kickoff exige amostra aprovada pelo cliente + fórmula registrada; Cotação exige Kickoff aprovado; Amostra Enviada não pula para a Cotação). Kickoff nasce na etapa Kickoff com número `KO-<projeto>`; projetos antigos que só chegam no pedido aprovado continuam abrindo lá. CGI leva preço/condição do orçamento aprovado (`comCondicoesDoOrcamento`). Kickoff aprovado só muda com justificativa (428 → diálogo "Justifique a alteração do Kickoff" → versão vN, motivo no `log_auditoria`). Numeração `lib/numeracaoProjeto.js`: projeto `2026-031`, amostra `-A1`, variação `-A1-a`; contador `erp/kuryos/sequences/projeto_{ano}`. Trava do P&D (`pdCards.rotaDeBancada` + `bloqueioPdComCliente`, HTTP 423 no adaptador; aviso e bancada só leitura na tela; ADM passa e vê o aviso). Vitest 161/161.
- **Dados (15/10):** 30 projetos numerados `2026-001`…`2026-030` por data de criação; `sequences/projeto_2026` = 30. Backup: scratchpad `mongo/backup-projetos-antes-numeracao-20261015.json`. Amostras antigas mantêm o número.
- **Fase 3 publicada (15/10):** `lib/fichaTecnica.js` (agrupar por fase, passo a passo, 2.2 a partir da Manipulação, MP nova, documento HTML modelo Mochi Blur). Manipulação: colunas Fase e INCI, ingredientes na ordem das fases, "Fases e procedimento (passo a passo)" com `etapas[]` em `pd_formula_phases` (um passo por linha; `instrucoes` mantido), MP nova (nome por extenso + MPGR/MPES, 422 sem nome/tipo) com histórico em `pd_mp_novas_log` (incluída / substituída / removida / vinculada ao cadastro, com versão). Nova versão, duplicar e importar copiam as fases. Ficha Técnica: 2.2 nasce da Manipulação quando vazia + botão "Puxar da Manipulação"; formulação por fase com INCI. Os dois botões de ficha (com custos / sem custos) deixaram de gerar placeholder em JSON e abrem o documento para imprimir/salvar em PDF. Vitest 171/171. Nenhum dado de produção alterado.
- **Fase 4 publicada (15/10, pedida antes da 5):** cliente aprovou (retorno no CRM3, "Aprovar" do Comercial no P&D ou aprovação registrada) → cada MP nova da fórmula aprovada vira tarefa em `solicitacoes_cadastro_material/{formula}__{item}` (`lib/filaCadastroMp.js`; não duplica; falha da fila não trava a aprovação e sai no console). Cadastros › Materiais: barra "MP(s) nova(s) do P&D aguardando cadastro" → "Cadastrar" abre o formulário pré-preenchido e fecha a tarefa no mesmo update. Seção "SKU de entrada" (`shared/sku-entrada.js`, `run_sku_entrada_test.js`): MPES exige SKU de aprovação e fica "Aguardando SKU final" até o final; demais com caixa "Adicionar versão final"; código trocado vai para `skusEntrada.historico`; `codigoFornecedor` (lido por Compras) espelha o SKU vigente; `mpCodigo` não muda. P&D mostra o status da tarefa (cadastrada como MPES-xxxxx). Vitest 174/174.
- **Regras publicadas em `erpkuryos` (15/10):** nó novo `solicitacoes_cadastro_material` + a troca pendente `gestor`→`comercial` (11 regras do fluxo comercial). Conferido antes que eram as únicas diferenças e depois que o publicado = repo. Cópia das regras anteriores: scratchpad `regras-no-ar-antes-fase4-20261015.json`.
- **Achado:** só 1 dos 14 usuários ativos tem `tenant_id = kuryos`; as regras de `erp/kuryos/*` (CRM/P&D) liberam só ADM ou quem tem o tenant. Ver MELHORIAS.
- **Fase 5 publicada (15/10):** função agendada `atualizarCambio` (functions/index.js, a cada 15 min; no Render também 30 s depois de ligar) grava `config/cambio/usd_brl`. Fontes em ordem: AwesomeAPI (dólar comercial), Banco Central PTAX (boletins do dia), ExchangeRate-API (diária); falha em todas mantém a última e grava `erro`. **Medido no ar:** a AwesomeAPI responde HTTP 429 ao Render (IP compartilhado) — o servidor usa o PTAX do BCB e grava o motivo em `aviso`. PTAX atualiza nos boletins (abertura, intermediários, fechamento ~13h), não a cada minuto. Regras em `shared/cambio.js` (cópia idêntica em `functions/cambio.js`, `run_cambio_test.js` roda a função real com fetch/banco simulados) e `lib/cambio.js` no ERP. P&D: fórmula acompanha o dólar (`cotacao_usd_origem` ao_vivo/fixa/gravada/padrão; "Cotação US$ fixa" na Config), painel "Dólar" com spread editável pelo ADM (`PUT /config/cambio/spread`, 0–20%). Cotação enviada grava `cambio_congelado` (POST e PATCH, só uma vez). `CurrencyInput` usa o dólar do dia (era R$ 5,80 fixo). Cadastros: custo target US$ mostra ≈ R$. Achado: dólar do dia R$ 5,08 contra R$ 6,00 fixo nas fórmulas (custo em US$ ~18% acima).
- **Dados (15/10):** `config/cambio/usd_brl` semeado com a cotação real das 15:51 para testar as telas; o servidor sobrescreve a cada 15 min.
- **Fase 6 publicada (15/10):** `lib/estabilidade.js` — próximo checkpoint = primeiro depois do último registrado (buraco antigo não trava, fica "não registrado"); libera após a diferença de dias desde a leitura anterior (D24h→D48h 24 h, D48h→D7 5 d; o primeiro conta do início do estudo); leitura só com os 12 parâmetros preenchidos ("N/A" vale). Adaptador recusa com 422 (ordem, prazo, incompleta); hora da leitura = hora do registro (ADM pode lançar antes do prazo e com data, nunca fora de ordem). Testes: Características Padrão acima do estudo; card mostra "Próx: D48h · libera em 13 h"; diálogo sem escolha de dia. Vitest 189/189.
- **Achado (base real):** 2.455 das 2.494 leituras de estabilidade têm só 1 parâmetro (Aspecto); 9 têm os 12. A exigência de leitura completa muda a rotina do laboratório — decisão do usuário se a lista obrigatória deve ser menor.
- **Fase 7 (15/10):** cotação por insumo e por serviço. `lib/cotacao.js` (ERP): insumos do BOM do Kickoff vigente com o preço da MP na fórmula (US$/kg ou R$/kg), embalagem com preço digitado na linha, "fornecido pelo cliente" não cobra; serviço = qtd cobrada (un, milheiro, kg de granel, lote; fator por unidade) × (preço cheio − desconto da etapa) + setup × lotes, nunca abaixo do mínimo do pedido; faltou preço = SEM PREÇO (nunca zero). Servidor recalcula ao salvar (`composicao.resumo`) e recusa enviar com pendência (422). Rascunho acompanha tabela, fórmula e dólar; enviada fica como saiu. Tela: "Composição do preço" na aba da cotação, com "Usar R$ X/un no preço da cotação" e Finalizar/Aprovado travados com o motivo. PCP: Cadastros › Serviços (`shared/servicos.js`, `run_servicos_test.js`): unidade, preço, desconto da etapa, setup, mínimo, custo-hora/produtividade/margem → sugerido, vigência e histórico (update só com caminhos planos), carga dos 10 serviços por botão. Vitest 201/201. Conferido no navegador com banco em memória (CRM e Cadastros) e, no banco real, só leitura.
- **Ensaio (base real, sem gravar):** 1 Kickoff com BOM (KO-2026-0001, teste "Shampoo bubaloo"): 4 MPs com preço da fórmula (0,300 L = 300 mL), 5 embalagens SEM PREÇO → envio bloqueado até o comercial digitar o preço.
- **Pendente (permissão):** publicar a regra nova `servicos` em `erpkuryos` (`npx firebase-tools deploy --only database --project erpkuryos`). Regras no ar conferidas = HEAD antes da mudança; backup no scratchpad `regras-no-ar-antes-fase7-20261015.json`. Sem a regra, a aba Serviços e a cotação mostram "sem permissão para ler a tabela de serviços" e a cotação segue só com os insumos.
- **Arquivos ativos:** nenhum após o commit. Plano das 7 fases concluído no código.
- **Revisão completa (16/10):** quatro correções, com teste.
  1. **Retrabalho voltava sozinho** (Fase 1/2): depois de um retrabalho a variação segue "retrabalho" no CRM; quando o P&D reenviava a amostra refeita, a reconciliação a devolvia para Retrabalho na abertura seguinte do quadro. Agora a entrega ao cliente grava `aguardando_cliente_desde` e só vale retorno com `resultado_em` posterior (`pdCards.statusPeloRetornoDoCliente`). Solicitação antiga sem a data segue como antes. Na base: só 1 volta automática (Maya, legítima); ela seria a primeira a cair no defeito ao reenviar.
  2. **Cotação com dólar padrão** (Fase 7): sem dólar ao vivo nem congelado, o servidor convertia US$ a R$ 6,00 enquanto a tela marcava SEM CÂMBIO. Agora o servidor também recusa (só taxa real).
  3. **Fila de MP nova sem nova tentativa** (Fase 4): falha ao gravar ficava só no console. Agora marca `fila_mp_nova_falhou_em` na solicitação e tenta de novo a cada abertura do quadro do P&D.
  4. Menores: tela da estabilidade usa a mesma data de início do servidor (`started_at || created_at`); cotação avisa quando o Kickoff ainda não está aprovado; `startSchedules().stop()` cancela também a primeira rodada de 30 s.
  Vitest 203/203. Conferido de novo no navegador (banco em memória).
- **Regra `servicos/` publicada em `erpkuryos` (17/10, aprovada pelo usuário):** no ar antes = repo menos `servicos`; depois = repo. Backup: scratchpad `regras-no-ar-20261017.json`.
- **Ajustes do teste do cliente JOHN (17/10):**
  1. Responsável comercial: o lote de amostras mostrava o id do usuário em texto livre; agora é lista de usuários, e o Kickoff grava o nome (`nomeDoUsuario`), não o id.
  2. "Enviar para Compras" saiu do botão flutuante e foi para dentro da aba Custos P&D (`shared/crm-pd-master-integration.js` só remove o antigo; `scripts/test-pd-master-integration.mjs` atualizado).
  3. Lote de amostras: "Base fixa de referência" nascia fixa no código ("Agua, Alcool, Acido hialuronico"); agora vem dos ingredientes da fórmula base (código, INCI, % do Cadastros), fragrância fora; grava `base_reference_items`.
  4. Manipulação: tabela rola na horizontal (nenhuma coluna cortada), página do P&D até 1600 px, sugestões de ingrediente com o nome inteiro; preço zero no cadastro aparece "sem preço".
  5. Descrição de elaboração (fases + passo a passo) foi para baixo dos Lotes de Amostras, com escolha da versão; continua alimentando a 2.2 da Ficha Técnica.
  6. Aprovar/Reprovar saiu do P&D: o retorno do cliente é registrado pelo Comercial no CRM2/CRM3 e chega ao P&D sozinho.
  7. CRM2 pareado com a amostra (`lib/etapaPelaAmostra.js`): P&D trabalhando → Amostra em Desenvolvimento; entregue → Amostra Enviada; cliente aprovou → Kickoff (se a fórmula estiver registrada; o pareamento automático nunca usa a dispensa do ADM). Roda ao abrir o CRM2, ao registrar o retorno do cliente e quando o P&D muda o status.
  8. Modal da cotação refeito: uma área de rolagem só (a área útil foi de ~100 px para 630 px em 1920×830), abas presas no topo, rodapé fixo, cores do tema (o título branco sobre degradê âmbar sumia no escuro).
  9. Pedido do JOHN saiu vazio porque o CGI foi assinado antes da cotação. Agora: CGI só com o projeto em Pedido Aprovado (409); aprovar o orçamento atualiza o rascunho do pedido (quantidade, valor, pagamento) e, se o CGI já estava assinado, reprocessa a assinatura e libera.
  10. Pedidos (`comercial.html` + `shared/crm-para-pedido.js`, `run_crm_para_pedido_test.js`): cadastro mestre sem contato oferece os contatos do CRM; produto que nasceu no CRM traz quantidade e valor da cotação (editáveis). Cliente criado pelo CRM já nasce com os contatos.
  Vitest 209/209. Conferido no navegador (banco em memória) e, no banco real só lendo, o pedido do JOHN: contato JOHN do CRM, 5.000 un × R$ 9,228.
- **Emissão de OP do JOHN (17/10):** a tela mostrava só o aviso de aprovação e as travas apareciam uma por vez ao clicar em Emitir. Agora o quadro "Para emitir esta OP falta" lista tudo ao escolher o produto (volume, densidade, validade, itens da Fórmula/BOM fora do cadastro), cada um com onde corrigir. Causa de 3 das travas: o SKU gerado pelo CGI nascia sem volume/unidade/densidade/validade; agora leva do Kickoff o que ele tiver (`dadosDeProducaoDoKickoff`; validade só se `bloco2.prazo_validade_produto_meses` estiver preenchido — no JOHN não está). O PRF-JOHN-0001, criado antes, precisa disso preenchido em Cadastros › Produtos.
- **Completar na OP + pendência por setor (17/10, pedido do usuário):** com trava que não se resolve na tela (volume, validade, material fora do cadastro), a Emissão de OP abre sozinha o quadro "Completar para emitir a OP": quem emite preenche o que souber (grava em `produtos/{sku}` e liga o material no item da Fórmula/BOM em rascunho) e o que ficar em branco vira pendência em `pendencias_setor/{sku}__{campo|item}` para o setor dono (volume, Un./caixa, peso/caixa e materiais → Cadastros; densidade e validade → Qualidade). Cadastros e Qualidade veem a barra "Pendências da Emissão de OP" e preenchem ali (vai direto para o produto) ou corrigem no cadastro; a pendência fecha sozinha quando o dado aparece. Reaviso não duplica (conta). Regras em `shared/pendencias-setor.js` (`run_pendencias_setor_test.js`), barra em `shared/pendencias-setor-ui.js`. Conferido no navegador com Firebase em memória e os dados do JOHN (OP → Qualidade → Cadastros). **Regra nova `pendencias_setor` aguardando aprovação para publicar.**
- **Ficou com o usuário (permissão negada para eu gravar em produção):** cadastrar os 4 itens do JOHN e aprovar Fórmula/BOM/Especificação do PRF-JOHN-0001 v1; cancelar o PED-0009 (rascunho vazio do CRM, duplicado do PED-0010 lançado à mão); carregar os 10 serviços em Cadastros › Serviços.

### Claude — URLs sem .html + auditoria ponta a ponta (14/10/2026)

- **URLs limpas:** `cleanUrls` em `vercel.json` e `firebase.json` (`/x.html` → 301 → `/x`); CRM/P&D/Kickoffs/Contratos por rewrite para `/crm-app`; menu (`ktLink` → `urlLimpa`), login, shell (rota ativa, sino da Central de Atenção) e rotas React sem `.html`. `getActivePageName` normaliza `/x` → `x.html`, então `PAGINA_MODULOS`/acesso por módulo seguem iguais. `scripts/preview-ui.mjs` imita redirects + cleanUrls. Validado no navegador real (admin): 16 rotas, 70 links sem `.html`, item ativo certo, 0 erros.
- **Corrigido na auditoria:** bottom sheet do celular sem limite de altura (`kuryos-ui-components.css`; botão Encerrar OP saía da tela em 375×667 — achado do Codex); desvio Render não roda em host `*.test` nem sem `firebase.app` (destrava `run_fluxo_ponta_a_ponta_test.js`, que voltou a passar inteiro); gravação de `usuarios_publico` com `Promise.resolve().then`; ícone `document` inexistente ("undefinedContratos CGI"); SKU automático pula número já ocupado (`cadastros.html`, contador `PEL_SEUN` atrás). Testes de menu passaram a procurar o href limpo.
- **Arquivos ativos:** nenhum após o commit.

### Codex — teste ponta a ponta do sistema (14/10/2026)

- **Pedido:** testar o sistema de ponta a ponta no estado atual da árvore, cobrindo o fluxo integrado e as regressões relevantes sem publicar nem alterar dados de produção.
- **Resultado do fluxo:** o harness real percorreu Orçamento → aceite → cadastro → pedido PCP → emissão de OP → apontamento → confirmação PCP → Conferência de PA → WMS/quarentena → fila da Qualidade → bloqueio da Expedição. Após contornar apenas no runner temporário os dois bloqueios abaixo, terminou com exit 0 e achou um gap de negócio: OP sem bloco programado nasce sem `dataInicioPlanejada`/`dataFimPlanejada` e fica fora do horizonte/promessa de prazo.
- **Defeito reproduzido:** no celular 375×667, o modal Encerrar OP deixa o botão abaixo da viewport. `kuryos-ui-components.css` impõe `padding:24px 0 0 !important` e `max-height:none` no bottom sheet, anulando o limite/rolagem segura de `form.html`. Com a regra de altura restaurada só em memória, apontamento e restante do fluxo passaram.
- **Harness desatualizado:** `fluxo.test` agora aciona o desvio Vercel→Render de `auth_check.js`, mas o mock não implementa `firebase.app()`. A continuação usou `fluxo.web.app`, equivalente ao Hosting; o teste permanente precisa ajustar o host/mock.
- **Regressões aprovadas:** apontamento/encerramento, Conferência de PA cliente+servidor, Qualidade PA, Expedição regra+UI e servidor Render (13/13). `run_operacao_ui_test.js` falha só porque ainda exige o emoji removido pelo novo sistema de ícones; `test-ui-auth-recovery.mjs` não aceita a nova leitura de `usuarios_publico`; `test-ui-operational-contracts.mjs` compara `cadastros.html` com baseline anterior às mudanças CRM. Testes de regras CRM/clientes não rodaram: Firebase CLI/Java ausentes.
- **Arquivos ativos:** nenhum. Nenhum arquivo funcional alterado, nenhum dado real escrito, nenhum commit/push/deploy feito; o runner temporário foi removido. O único registro desta tarefa é este bloco.

### Claude — Repaginação Apple: design system global (13/10/2026)

- **Pedido:** repaginação completa, minimalista no estilo Apple, responsividade de elite. Skills instaladas em `~/.claude/skills` (emilkowalski/skills, pbakaus/impeccable, leonxlnx/taste-skill).
- **Arquivos ativos:** `public/shared/kuryos-ui-{tokens,components,layout,operational}.css`, `public/shared/kuryos-repo-visual.css`, `public/shared/dashboard-showcase.css`, `public/login.html`, referências de cache (`auth_check.js`, manuais), `AGENT_STATUS.md`, `CLONAGEM_UI_UX.md`.
- **Regra:** só CSS/cache; nenhum ID, script, handler, dado ou regra de banco muda. Única mudança de JS: `shared/kuryos-icon-system.js` (mais ícones; emoji sem correspondência some em vez de virar círculo).
- **13/10 (2ª rodada):** visual realinhado à identidade do ERPKuryosBeauty (Outfit/Manrope/JetBrains Mono, navy + pervinca, sidebar 280/76 com item ativo navy, KPIs 16 px com barra superior, painéis 20 px) mantendo o acabamento Apple.
- **Estado:** implementado e validado localmente (detalhes em `CLONAGEM_UI_UX.md` › Repaginação Apple; pendências em `MELHORIAS_FUTURAS.md`).

### Claude — Fluxo comercial do ERP no CRM incorporado (13/10/2026)

- **Pedido:** CRM seguir a lógica do ERPKuryosBeauty: prospecção → qualificação → projeto → amostra → aprovação do cliente → cotação/orçamento (CRM2) → kickoff → contrato CGI → SKU → pedido → emissão de OP (fluxo PCP existente). Voltar card exige justificativa + histórico; card único; CRUD de edição/remoção só ADM; cliente direto pelo cadastro só ADM (ADM move livre no funil).
- **Fase 0 (feita):** o adaptador Firebase só existia editado à mão no chunk `9752.masterintegration20261008`; o modo incorporado do `App.js` também tinha sido perdido do fonte. Ambos consolidados no repositório do ERP (`KURYOS/ERPKuryosBeauty`, branch `claude/crm-fluxo-erp`, sem commit). Prova: build do fonte reproduz o `main` publicado (só muda o hash do chunk) e teste diferencial (61 chamadas, Firebase em memória) dá 0 diferença entre chunk publicado e chunk recompilado.
- **Fase 1 (feita, não publicada):** `src/lib/crmRules.js` (+15 testes), regras ligadas no adaptador (transições ERP, requisitos, justificativa 428 + diálogo, histórico, `audit_log`, unicidade, exclusão só ADM com cascata explícita), tela `/crm/admin` (ADM). `scripts/test-crm-funnel.cjs` 20/20. PCP: `cadastros.html` e `database.rules.json` (`clientes/$key`: criar só ADM ou funil do CRM com `origemCrmClienteId`); `run_clientes_criacao_rules_test.js` escrito, **não executado** (sem Java/Firebase CLI aqui).
- **Integração:** build do ERP (`main.aa8c8284.js`) integrado por `scripts/integrar-crm-build.mjs` (copia só arquivos novos para `public/static`, atualiza `crm-app.html`). Rotas: `/crm/admin` e alias `/crm-admin.html` (rewrite novo em `firebase.json`; o preview local precisa ser reiniciado para ler). Fumaça sem sessão: sem erros de JS; validação autenticada pendente.
- **Fases 2–4 (feitas, não publicadas, 14/10/2026):** o ERP local foi levado ao `master` `a6892e6` numa worktree nova, sem tocar no checkout antigo: `KURYOS/ERPKuryosBeauty-master`, branch `claude/crm-fluxo-erp-master` (o `master` migrou de CRA para **Vite 8 + React 18 + Vitest**). Reaplicados: adaptador Firebase, modo incorporado, rotas `.html`, `crmRules`, painel ADM; `process.env.REACT_APP_*` → `import.meta.env.VITE_*`. Fluxo novo em `frontend/src/lib/firebaseCommercial.js` (porta de `propostas_routes`/`kickoff_routes`/`contratos_routes`):
  - CRM2 cotação/orçamento (proposta por projeto) → decisão: aprovado exige amostra aprovada por P&D **e** Comercial e fórmula registrada no Banco P&D (ADM dispensa, registrado); fecha o projeto, abre o **Kickoff** e cria o pedido `AGUARDANDO_CGI` em `pedidos_comerciais/` (sem linha em `pedidos/`); reprovado arquiva com motivo. Espelho no cliente (cotação → negociação, pedido → fechado, arquivado → perdido).
  - **Kickoff completo do master:** questionário de composição (blocos 0–5 + fechamento), versões (aprovado editado vira v2, anterior “substituída”), aprovação sequencial P&D → CQ (`qa` ou `qualidade` do PCP) → Engenharia → Direção (ADM), BOM (fórmula + embalagens), fila `cadastro_bom_solicitacoes`, tarefas em `workflow_tasks`, arquivar/restaurar, exportar BOM CSV.
  - **CGI:** gerado só de Kickoff aprovado (`CGI-AAAA-NNNN`, 29 cláusulas congeladas no contrato); documento HTML para imprimir/salvar em PDF; assinatura gera a **SKU** em `produtos/{CAT-CLI-NNNN}` (contador `config/contadores/sku/{CAT}_{CLI}` do PCP; categoria de `config/categoriasProduto`; cliente novo nasce em `clientes/` com `origemCrmClienteId`) e **libera o pedido ao PCP** no mesmo formato de `comercial.html → salvarPedido` (`pedidos_comerciais/` `LIBERADO_PCP` + `pedidos/{PED}__{SKU}` + `notificacoes_comercial/`), que é o que a emissão de OP lê. Sem quantidade no orçamento ou sem categoria ativa, a liberação fica bloqueada com o motivo e reprocessa pela tela de Contratos.
  - Pedido Direto (cliente e SKU já cadastrados) grava direto no PCP; telas de pedido do ERP redirecionam para `comercial.html`/`relatorio_pedido.html`. Tela de SKU do ERP só consulta (409 para editar; saldo não exibido antes do Dia D).
  - Defeitos do master corrigidos no caminho: CGI saía com “R$ 0,00” e pagamento “a_definir” (agora vem do orçamento aprovado); componente “não aplicável” virava linha de BOM e travava a Direção; versão “vv1”; status crus; CQ do PCP e `gestor` sem acesso.
  - **Testes (Vitest):** 114/114 — regras, funil, cobertura de rotas (56 rotas das telas do fluxo, nenhuma 501) e fluxo ponta a ponta até `pedidos/` (mutação conferida: 3 mutações derrubam o teste). Visual: build de demonstração com o estado do teste, 31 capturas (desktop/celular/escuro), 0 erro de JS, 0 overflow.
  - **PCP:** build Vite integrado em `public/static/crm/` (bloco `crm-build` em `crm-app.html`; reescritor do chunk 9752 removido); rewrites `/kickoffs(.html)`, `/kickoff/**`, `/contratos(.html)`; menu Comercial ganhou **Kickoffs** e **Contratos CGI**; `database.rules.json` com regras de origem CRM para `produtos/$sku`, `pedidos/$linha`, `pedidos_comerciais/$id`, `notificacoes_comercial/$id` e contadores `sku/$par` e `pedido_comercial`; `run_crm_fluxo_rules_test.js` escrito, **não executado** (sem Java/Firebase CLI). As regras do `erpkuryos` são publicadas a partir do repo do ERP (`scripts/merge-firebase-rules.mjs` mescla as do PCP + nó `erp`).
- **Complementos (14/10, depois do commit `bdd4887` do usuário; não commitados):** assinatura do CGI cria no PCP `formulas/`, `bom/` e `especificacoes/{SKU}__v1` em RASCUNHO (fórmula registrada da variação + embalagens do Kickoff; material fora do cadastro entra `pendente` com o texto original, que o Cadastros já revisa e que trava a aprovação); `cadastros.html?tab=formulas&produto=SKU` abre direto na SKU; EPA gerado na aprovação final do Kickoff; necessidade de material pelo BOM do Kickoff; `RoleGuard` aceita módulo Comercial; `usuarios_publico/{uid}` (nome+papel) gravado pelo `auth_check` ao entrar e sincronizado por `usuarios.html`, com regra própria; comparador de materiais usa `mpCodigo`/`mpNome` do cadastro real. Preview `scripts/preview-ui.mjs` com charset no 404 e reiniciado na porta 5000. Vitest 120/120.
- **Migração Mongo do ERP → Firebase (14/10, CONCLUÍDA e conferida):** exportado (usuário `kuryos_migration_readonly`, só leitura) o banco `kuryos`: dados reais no tenant "Kuryos Demo" — 16 clientes, 28 projetos, 30 amostras, 95 solicitações P&D, 173 fórmulas/778 itens, 1 Kickoff (formato antigo), 2 CGIs com PDF original, 3.520 auditorias etc. (8.562 registros, 30 coleções; `users`/`tenants`/`counters`/`order_material_requirements` não entram). Conversão e plano em `scratchpad/mongo/` (fora do repo): renomeia coleções para as do adaptador, aliases `pd_request_id`/`linked_*` → `request_id`/`crm_*`, tenant → `kuryos`. **Regra do usuário: não sobrescrever nada** — id existente é pulado; cliente/projeto/amostra equivalente já existente recebe só campos ausentes e os vínculos do Mongo são redirecionados; cliente só no mestre entra com o id do mestre; contadores só sobem. Adaptador: Kickoff antigo com prontidão por blocos (sem recalcular o BOM importado) e CGI importado devolve o PDF original. Teste `src/test/dataSweep.test.js` (DATA_SEED): 1.584 leituras com os dados do Mongo e 1.674 no combinado simulado, 0 erro; 9 telas renderizadas com os dados reais sem erro. **Gravado em produção** (admin@kuryos.com, aba com depuração): backup antes (`scratchpad/mongo/backup-firebase-20261014.KEEP.json`, 60 clientes CRM/59 mestre) → 1 registro conferido → 8.618 caminhos em 9 lotes; 4 pulados por já existirem (o de teste e 3 campos vazios pré-existentes, preservados); verificação caminho a caminho: 0 ausentes; dos 2.599 valores pré-existentes, 0 alterados; sequences kickoff=1, contrato_cgi=2. Pós-importação: 70 clientes, 29 projetos, 31 amostras, 96 solicitações P&D, 174 fórmulas. Navegador real: CRM1/2/3, P&D, Kickoffs, Contratos e painel ADM abrem em 3–7 s sem erro. Corrigidos no caminho: reconciliação P&D→CRM3 (laço eterno com vínculo órfão; agora uma gravação em lote e idempotente — CRM3 abria em >90 s) e `getProduzido is not defined` do `auth_check` nas telas do CRM.
- **PCP independente no `erpkuryos` (14/10, decisão do usuário):** a conta do usuário só acessa `erpkuryos` (`prod-kuryos` é de outra conta) e o site padrão do `erpkuryos` é o ERP. Preparado: hosting com alvo `pcp` (`.firebaserc`: `prod-kuryos`→site `prod-kuryos`, `erpkuryos`→site novo `pcp-kuryos`; `firebase.json` com `"target": "pcp"`); functions com `RTDB_INSTANCE` lido de `functions/.env.erpkuryos` (sem o arquivo, segue `prod-kuryos-default-rtdb`, comportamento original); `database.rules.json` do PCP com o bloco `erp` (idêntico ao que o repo do ERP mesclava). Pendente com o usuário: plano Blaze, criar o site, segredos (MS_GRAPH_* e OPS/PEDIDOS_API_KEY), deploy de regras/functions/hosting. Virada: copiar os dados operacionais mais recentes do `prod-kuryos` para o `erpkuryos` no dia, sem sobrescrever CRM/P&D migrado.
- **Plano gratuito escolhido (14/10): Vercel + Render, Firebase no Spark.** Site estático na Vercel (`vercel.json`: `public/`, mesmas rotas/cabeçalhos do `firebase.json`, `/` → `login.html`). As 20 Cloud Functions rodam no Render grátis por `functions/render-server.js` (reaproveita `functions/index.js` sem reescrever regra): 11 callable no protocolo do SDK com verificação do token, 2 onRequest, agenda de 2 min por temporizador, 6 gatilhos do banco por escuta `on(value)` com linha de base (não dispara no que já existia ao ligar). `render.yaml` (Blueprint `pcp-kuryos-functions`). Desvio no `auth_check.js`: fora de `*.web.app/*.firebaseapp.com`/preview local, `firebase.functions()` aponta para `https://pcp-kuryos-functions.onrender.com` (no `prod-kuryos` nada muda). Testes: `run_render_functions_test.js` 13/13 (pacote real firebase-functions) e SDK compat 10.7 real no navegador chamando o servidor (sucesso e erro `functions/failed-precondition`). Ressalvas: Render grátis dorme sem acesso (pinger em `/health`); gatilho que ocorrer com o servidor fora do ar não é reprocessado; plano Hobby da Vercel é para uso não comercial.
- **Funções múltiplas + Comercial e P&D (14/10):** `usuarios.html` troca o seletor por janela de funções (várias); grava `role` = principal por prioridade, `funcoes` = todas e, com várias ou com Comercial/P&D, `modulos` somados + `modulosDasFuncoes=true` (regras do banco leem os módulos; a tela trata como padrão das funções), além de `tenant_id=kuryos` para o CRM. `auth_check.js`: módulo `pd` (`pd.html`), padrões `comercial`/`pd`, soma de módulos por função, rótulo com todas as funções, `pd.html` na ordem de home. `login.html`: comercial→crm1, pd→pd. Regras: no PCP `gestor` é Gestor de Linha (RH) — saiu das permissões de origem CRM e entrou `comercial` (11 trechos). CRM/P&D (React, repo do ERP local): `crmRules.effectiveRoles/hasAnyRole` traduz funções do PCP para papéis do ERP (comercial→vendedor/sales_ops; pd→lider_pd/formulador/engenharia_produto; pcp→ambos; qualidade→qa; gestor→gestor_linha), usado pelo `RoleGuard`, 9 verificações de PD/CRM3/Contratos/Kickoff e o adaptador. Vitest 125/125; tela de usuários testada com Firebase simulado (grava role/funcoes/modulos/tenant corretos, 0 erro, 0 overflow).
- **Erros de permissão no carregamento + velocidade (14/10):** `auth_check.js` faz `once()/get()` esperarem o Auth e tentarem de novo (3x/700 ms) em permission_denied com usuário logado — o token chega ao banco um instante depois do login restaurado. A/B no navegador real: 7 erros em 10 telas → 0 (mais 10 telas de CRM/P&D/operação sem erro). Cadastros: Prod/hora em cache de sessão por 2 h (auto, sem alerta); sincronização de OPs do ADM com intervalo por navegador (localStorage). Medição e plano em MELHORIAS_FUTURAS.md › Velocidade das telas.
- **Pendente:** validação autenticada no navegador real; rodar os dois testes de regras no emulador; publicar (PCP hosting + regras via repo do ERP) e commitar nos dois repos quando o usuário autorizar.
- **Arquivos ativos (PCP):** `public/cadastros.html`, `public/usuarios.html`, `scripts/preview-ui.mjs`, `database.rules.json`, `public/crm-app.html`, `public/static/crm/**`, `public/auth_check.js`, `firebase.json`, `run_clientes_criacao_rules_test.js`, `run_crm_fluxo_rules_test.js`, `scripts/integrar-crm-build.mjs`. Também tocados: `shared/{executive-dashboard,sector-dashboard}.css`, `dashboard*.html` (versão de cache), `MELHORIAS_FUTURAS.md`. **Sem commit, push ou deploy** — aguardando o usuário. Arquivos seguem reservados até o commit.

### Codex — Frontend 2: layouts operacionais (12/10/2026)

- **Concluído no worktree:** `PCP-Kuryos-ui-dev2`, branch `ui-ux/operational-layouts`; commit `9b0db51` (`feat(ui): alinhar layouts operacionais ao ERP de referencia`). Nova camada `public/shared/kuryos-ui-operational.css` escopada por `data-kuryos-operational` e restrita a `@media screen`, com cabeçalhos alinhados, navegação segmentada, filtros, superfícies, densidade de tabelas/KPIs, formulários/modais, cartões de fornecedores e moldura da grade PCP. Marcações `data-ui` aditivas em 42 páginas operacionais; dashboards antigos recebem hooks, mas são excluídos dos overrides para manter a geometria específica do Frontend 1. IDs, scripts, atributos funcionais, dados, permissões e impressão preservados.
- **Validação:** `scripts/test-ui-operational-contracts.mjs` aprovado contra `4052a55`: 42 páginas, 421 scripts, 2.303 IDs e 24 handlers inline, todos byte a byte iguais após remover exclusivamente os hooks visuais. Todos campos, labels, opções, hidden, tabs, ordem de scripts e estilos de impressão idênticos. `git diff --check` limpo. Smoke aprovados: `run_itens_cadastro_test.js`, `run_apontamento_encerramento_test.js`, `run_manipulacao_test.js`, `run_rotas_pc_test.js`. `run_propriedade_estoque_test.js` passou os 18 casos de cliente/FEFO/MRP e interrompeu no carregamento do servidor por dependência `pdfkit` ausente no worktree. QA de navegador/temas/responsividade transferido ao Frontend 1 com Chrome CDP 9224; a camada será integrada pelo agregador global. Arquivos liberados; nenhum push/deploy realizado.

### Codex — Frontend 1: identidade e shell (12/10/2026)

- **Implementação integrada (13/10/2026):** identidade e shell em `ui-ux/identity-shell`, integração local fast-forward em `main`; foundation `bd87ad8`, layouts da segunda frente integrados por `fcab561`/`b1888ea`, recuperação de autenticação e headers `ebea897`, temas e contexto `c3f6b84`. Agregador modular de tokens/componentes/layout/operacional, Outfit/Manrope, navy preservado, sidebar 280/76 px com expansão por hover/foco, rodapé fixo e apenas navegação rolável, busca por destinos autorizados, claro/escuro, menu mobile e contexto SPA. Correções de compatibilidade entre cores legadas/HSL React, contraste do título de Material, impressão clara e busca oculta sem role de diálogo. Cache versionado. Sem mudanças em dados, contratos Firebase, regras de negócio ou bibliotecas. Documentação em `CLONAGEM_UI_UX.md`; arquivos liberados após os commits finais.
- **QA:** 42 páginas/421 scripts/2.303 IDs/24 bindings comprovadamente preservados; smoke Cadastro, Encerramento, Manipulação e Compras aprovados. Navegador: 64 rotas/temas/zero emojis, CRM/P&D 9 rotas + 4 interações, 27 layouts + 6 modais/popovers, 8 drawers, 12 modais de Cadastros com contraste claro/escuro, 9 dashboards setoriais + mobile aprovados. Recuperação de perfil permitido/negado e 8 rotas de contexto SPA aprovadas em teste de código. Sintaxe e diff limpos. **Pendência explícita:** suíte adicional final de identidade/shell interrompida por timeout CDP; sessão isolada encerrada e reinicialização bloqueada pelo ambiente. Não marcada como aprovada; repetição documentada. Sem validação completa de servidor. Preview local em `:5000`; nenhum push/deploy desta etapa.

### Codex — CRM 1/2/3 e P&D canônicos dentro do PCP (06/10/2026)

- **Publicação inicial no GitHub concluída (12/10/2026):** remoto público `origin` configurado para `DEVMarlosGomes/ERP-PCPKURYOS`; estado atual publicado na branch `main` pelo commit `d013d97` (`feat: importar estado atual do ERP PCP Kuryos`). A triagem incluiu 633 arquivos/26,18 MiB e não encontrou chaves privadas ou credenciais no índice. `.gitignore` exclui credenciais locais, logs, relatórios operacionais, planilhas de exemplo e capturas de teste. Publicação confirmada no remoto; nenhum deploy Firebase foi realizado.
- **Transposição visual do ERPKuryosBeauty concluída (09/10/2026):** linguagem visual auditada no `master` de referência (`a6892e6`) e portada como camada global em `shared/kuryos-repo-visual.css`: Outfit/Manrope/JetBrains Mono, superfícies planas, raios de até 8 px, sidebar 280/76 px, navegação com ícones, topbar apenas no mobile e paleta institucional Kuryos em claro/escuro. A camada foi conectada pelo `auth_check.js` a todas as rotas autenticadas e diretamente às páginas públicas/manuais, sem alterar backend, regras, rotas, permissões ou contratos de API. Validação aprovada: 64 rotas e zero emojis visíveis; 10 cenários de estilo em Dashboard/Cadastros/Compras/CRM/P&D mais mobile; 27 layouts e 6 modais CRM/P&D; 8 drawers; 12 modais de Cadastros; 9 rotas CRM/P&D e 4 interações; shell/dashboard enterprise. Capturas em `scripts/artifacts/repo-visual/`. Sem commit, push ou deploy; arquivos liberados.
- **Altura profissional dos drawers CRM/P&D concluída (09/10/2026):** painéis laterais agora flutuam com margens superior/inferior de 16 px no desktop, reduzem para 8 px em notebooks com até 700 px de altura e permanecem em tela cheia somente até 640 px de largura. A altura usa `dvh`, desconta topbar e margens, preserva a rolagem interna, adiciona raio/sombra coerentes e mantém o painel totalmente dentro da viewport; margem lateral também foi equilibrada. Cache do CSS atualizado. `test-crm-pd-theme-drawers.mjs` aprovou 8 drawers reais em notebook, notebook baixo (1536×661), 600 px e 390 px, com geometria exata, zero overflow e temas CRM/P&D; `test-crm-pd-responsive.mjs` aprovou 27 layouts e 6 modais/popovers. Sintaxe e `git diff --check` limpos. Sem bundle, dados, commit, push ou deploy; arquivos liberados.
- **Tema e drawers CRM/P&D concluídos (09/10/2026):** `crm-pd-shell-bridge.js` passou a sincronizar a preferência `kuryos-theme` do shell com a classe e os tokens do React, inclusive após navegação e alteração do sistema; claro/escuro foi confirmado no CRM e no P&D. Os drawers laterais agora respeitam a área útil no desktop e ocupam integralmente a tela em 600 px e 390 px, com grids em uma coluna, campos limitados, conteúdo sem overflow global e abas numerosas com rolagem horizontal local. Também foi neutralizado o `translateX(100%)` que podia permanecer aplicado a um Sheet aberto sob `prefers-reduced-motion`. Cache do CSS atualizado em `crm-app.html`. Validação: `test-crm-pd-theme-drawers.mjs` aprovou 6 drawers reais (CRM 1/CRM 3 × notebook/600 px/390 px) e os dois temas no CRM/P&D; `test-crm-pd-responsive.mjs` aprovou 27 layouts e 6 modais/popovers; `test-crm-pd-browser.mjs` aprovou 9 rotas e 4 interações, sem erros de console; sintaxe e `git diff --check` limpos. Sem alteração de bundle funcional, dados ou persistência; sem commit, push ou deploy; arquivos liberados.
- **Responsividade dos modais de Cadastros concluída (08/10/2026):** Material, Produto, Cliente e Fornecedor agora abrem acima da topbar/sidebar, limitados à viewport útil, com cabeçalho e rodapé sempre visíveis, rolagem somente no corpo, grids sem estouro e campos empilhados no celular; botões móveis ganharam área de toque de 44 px e os autocompletes permanecem acima do backdrop. Sem alteração em campos, validações ou persistência. `scripts/test-cadastros-modal-responsive.mjs` aprovou 12 cenários (4 modais × notebook/tablet/celular), sem overflow global, com acessibilidade `role=dialog`/`aria-modal`; `run_itens_cadastro_test.js`, sintaxe e `git diff --check` passaram. Revisão visual em `scripts/artifacts/cadastros-modal/`. Sem commit, push ou deploy; arquivos liberados.
- **Redesign enterprise integral Kuryos concluído (08/10/2026):** identidade oficial extraída do site/logo Kuryos (`#0A1C69` e escala institucional) aplicada ao design system claro/escuro e também aos dashboards legados; shell global recebeu topbar, breadcrumbs, busca global (`Ctrl/Cmd+K`), sidebar pesquisável/recolhível com preferência persistida, teclado, tooltips e adaptação mobile, preservando os links derivados das permissões reais. Foram entregues `dashboard_executivo.html` com 10 KPIs, 4 gráficos, fluxo industrial de 9 etapas e central de atenção, e `dashboard_setorial.html` com 9 áreas, 8 KPIs por área, filtros por URL e critérios documentados; dados inexistentes aparecem como N/D, sem simulação, e estoque crítico permanece indisponível antes do Dia D. Auditoria, inventário, riscos, catálogo de fórmulas/fontes e lacunas estão em `AUDITORIA_FRONTEND_ENTERPRISE.md`, `CATALOGO_INDICADORES_ENTERPRISE.md` e `MELHORIAS_FUTURAS.md`. Validação aprovada: design global em 64 rotas/zero emojis visíveis; Dashboard Executivo desktop/mobile/claro/escuro; 9 painéis setoriais; dashboards legados em 4 cenários; CRM/P&D em 27 layouts, 6 modais/popovers, 9 rotas e 4 interações autenticadas; sintaxe JS e `git diff --check` limpos. `run_menu_sanfona_ui_test.js` não iniciou por ausência do pacote Playwright, coberto pelo teste Chrome/CDP do shell; sem commit, push ou deploy. Preview local permanece ativo e arquivos liberados.
- **Integração mestre PCP ↔ CRM/P&D ↔ Compras concluída (08/10/2026):** os 59 clientes de `clientes/` são espelhados no CRM por chave/CNPJ, mantendo etapa e dados comerciais próprios; o catálogo do P&D passou a consumir os materiais ativos do cadastro mestre (696 de 939 registros), com tipo, unidade, especificação, 403 fornecedores e último preço de compra quando disponível; os 328 produtos ativos também estão disponíveis pelos contratos CRM/P&D. Fórmulas agora preservam a chave, código e fornecedor do material mestre. No detalhe do desenvolvimento, a nova ação responsiva `Enviar para Compras` cria uma SC diretamente em `solicitacoes_compra/`, com projeto, cliente, amostra, fórmula, itens e justificativa, e devolve o status de Compras ao P&D; saldo físico é apenas informativo e não gera sugestão automática antes do Dia D. Adaptador versionado em `public/static/js/9752.masterintegration20261008.chunk.js`; ponte em `public/shared/crm-pd-master-integration.{js,css}`; entradas atualizadas em `main.6cbbf5dd.js`, `crm-app.html`, `firebase.json` e permissão mínima de criação comercial em `database.rules.json`. Validação real: `scripts/test-pd-master-integration.mjs` aprovou 8 fluxos e removeu a SC/solicitação temporárias; paridade P&D aprovou 20 fluxos; espelho CRM3/P&D e transições passaram; navegador aprovou 9 rotas + 4 interações sem erro; responsividade aprovou 27 layouts + 6 modais/popovers; banco permaneceu com as 4 SCs operacionais preexistentes. Sincronização inicial aditiva criou/atualizou 59 espelhos em `/erp/kuryos/crm_clients` (60 registros com o cliente CRM preexistente), sem alterar os cadastros mestres. Sem commit, push ou deploy; preview local permanece ativo. Arquivos liberados.
- **Espelho bidirecional CRM3 ↔ P&D concluído (08/10/2026):** `pd_requests.status` passou a ser a fonte única da etapa técnica. Movimentos em `/crm/pd/cards/:id/move`, alterações diretas da solicitação e a criação da primeira fórmula sincronizam `pd_cards.status_pd` e `crm_samples.variacoes[].status_pd_raw/status_pd_label`; leituras dos dois kanbans reconciliam automaticamente registros legados divergentes. A amostra “abelinha” foi corrigida de `solicitado/Aberto` para `em_desenvolvimento/Em Desenvolvimento` nos dois espelhos, mantendo a solicitação em `IN_PROGRESS`. Bundle físico versionado como `public/static/js/9752.crm3pdsync20261008.chunk.js`, com referências atualizadas em `main.6cbbf5dd.js`, `crm-app.html` e `firebase.json`. Validação: novo `scripts/test-crm3-pd-status-sync.mjs` comprovou movimento P&D → CRM3 e status principal → ambos os kanbans, removendo o fixture; integração real confirmou “abelinha” em Em Desenvolvimento nas duas telas; paridade P&D passou em 20 fluxos sem resíduos; navegador autenticado passou 9 telas + 4 interações; responsividade passou 27 layouts + 6 modais/popovers; sintaxe aprovada. Sem commit, push ou deploy; preview local permanece ativo. Arquivos liberados.
- **Dashboards conforme vídeo de referência concluídos (08/10/2026):** Dashboard Diário e Dashboard Geral receberam palco verde profundo, workspace flutuante, cartões compactos, destaque esmeralda, hierarquia de métricas no topo, gráficos com paleta coordenada e animações de entrada progressivas, preservando todos os dados, Firebase e regras. A camada compartilhada vive em `public/shared/dashboard-showcase.css` e `.js`, sincroniza gráficos com claro/escuro/automático e respeita movimento reduzido. No celular, a meta viewport ausente do Dashboard Geral foi corrigida e seus filtros agora recolhem em um controle acessível, deixando abas e KPIs no primeiro scroll. Validação visual em desktop/mobile e claro/escuro; `scripts/test-dashboard-showcase.mjs` aprovou 4 cenários, 28 gráficos, animações, zero overflow e zero exceções; `run_andon_cadeia_test.js` passou; auditoria global aprovou 62 rotas e zero emojis visíveis. Artefatos ficam em `scripts/artifacts/dashboard-showcase/`; diagnóstico do vídeo em `scripts/inspect-dashboard-reference-video.mjs`. Sem commit, push ou deploy; preview local permanece em execução. Arquivos liberados.
- **Repaginação Apple do sistema inteiro concluída (08/10/2026):** nova camada global em `public/shared/kuryos-apple-system.css` cobre PCP, CRM, P&D, RH, relatórios, login e manuais com tipografia de sistema, hierarquia, superfícies, sidebar translúcida, cards, tabelas, kanbans, formulários, modais, estados de foco e responsividade. O tema claro/escuro/automático agora é persistente e sincroniza o shell legado (`data-theme`) com o React (`.dark`), inclusive nas páginas públicas. `public/shared/kuryos-icon-system.js` troca emojis/dingbats visíveis por SVGs semânticos também em conteúdo dinâmico; controles de tema, saída, erro e retry do `auth_check.js` usam SVG nativo. Entradas públicas sem `auth_check.js` receberam os assets globais. Validação: `scripts/test-kuryos-apple-system.mjs` aprovou 62 rotas, ambos os temas e zero emojis visíveis; revisão visual das capturas claro/escuro aprovada; responsividade aprovou 27 layouts (9 rotas × 3 viewports), 6 modais/popovers e links aninhados; navegador autenticado aprovou 9 telas e 4 interações sem erros; paridade P&D repetida e aprovada em 20 fluxos. Sintaxe JS e `git diff --check` limpos. Sem commit, push ou deploy; preview local permanece em execução. Arquivos deste escopo liberados.
- **Paridade funcional integral do P&D concluída (07/10/2026):** o adaptador Firebase incorporado agora replica o fluxo do ERP nas abas Overview, Manipulação/Fórmulas, Testes e estabilidade D48, Amostras/lotes rápidos, Ficha Técnica, Atualizações e Pendências, Custos P&D/Comercial, Documentos, Documentos Vivos e Comercial/aprovação, incluindo gates e transições até conclusão. Pesquisa interna nasce em desenvolvimento com card e histórico; fórmulas calculam custo, bloqueiam em testes, versionam/importam/duplicam e expõem contexto no Banco de Fórmulas; lotes validam fórmula e capacidade; documentos vivos têm snapshot, versão, diff, tarefa, decisão e vigência; exclusão faz cascata sem órfãos. Abas superiores receberam filtros e contratos equivalentes para Banco de Fórmulas, Homologações, Banco de Custos/histórico, Estoque Lab/movimentações/alertas e Relatórios. Cache físico atualizado por `pcp-rev=crm3-pd-20261007-6`. Validação: `scripts/test-pd-parity.mjs` aprovou 20 fluxos reais no Firebase e confirmou remoção dos registros temporários; integração CRM3→P&D aprovada; suíte autenticada 9/9 telas + 4/4 interações sem erros; responsividade 27 layouts + 6 modais/popovers aprovada após uma repetição por timeout transitório de navegação; sintaxe e `git diff --check` limpos. Preview local mantido em execução; sem commit, push ou deploy.
- **Integração CRM3 → P&D concluída (07/10/2026):** a causa era dupla no adaptador Firebase incorporado: `pd_cards` gravava nomes de campos diferentes dos consumidos pelo Pipeline (`nome_produto`/`cliente_nome`/`amostra_numero` em vez de `produto`/`cliente`/`numero_completo`) e `/pd/requests/:id/full` devolvia `status_history`, `pending_items` e `approvals`, enquanto o detalhe esperava `history`, `pending` e `approval`. O adaptador agora grava o contrato completo, normaliza também registros legados em leitura, recupera código e aplicação da variação CRM3 e entrega o briefing CRM como `client_info`; o registro existente “abelinha” passou a mostrar `0001-A`, produto e cliente, e o Overview abre sem erro. Como o Chrome persistiu usando o hash antigo mesmo após F5/login, o arquivo foi fisicamente versionado como `public/static/js/9752.crm3pd20261007.chunk.js`; `public/static/js/main.6cbbf5dd.js` aponta para o novo nome, `crm-app.html` versiona o carregador e `firebase.json` mantém compatibilidade da URL antiga. Regressão: `scripts/test-crm3-pd-integration.mjs`. Validação após reiniciar o Hosting: recursos novos confirmados com cache normal, integração real aprovada, suíte autenticada 9/9 telas + 4/4 interações sem erros, responsividade 27 layouts + 6 modais/popovers aprovada, sintaxe e `git diff --check` limpos. Preview local mantido em execução; sem alteração direta na base, commit, push ou deploy.
- **Responsividade integral concluída (07/10/2026):** `public/crm-app.html` passou a carregar `public/shared/crm-pd-responsive.css`. A camada corrige o corte de dialogs/sheets/selects pela sidebar (`z-index` do portal acima de 9999), largura/altura útil do shell, navegação CRM rolável, cabeçalhos e ações quebráveis, filtros em coluna no celular, kanbans e tabelas com rolagem interna, modais compactos e campos/popovers contidos na viewport. Validação: `scripts/test-crm-pd-responsive.mjs` aprovou 27 layouts (9 rotas × desktop/tablet/celular) e 6 modais/popovers; `scripts/test-crm-pd-browser.mjs` aprovou 9 telas e 4 interações, com zero erros de console. Diagnósticos: `scripts/inspect-crm-pd-responsive.mjs` e `scripts/inspect-crm-pd-dialog.mjs`. Preview local atualizado e deixado em execução; sem commit, push ou deploy.
- **Preview local reativado (06/10/2026 20:17 BRT):** Hosting servindo `public/` em `http://127.0.0.1.nip.io:5000`; `/crm2.html` confirmado com HTTP 200. Servidor deixado em execução para validação do usuário; nenhum arquivo de implementação alterado.
- **Reexecução concluída (06/10/2026):** `scripts/test-crm-pd-browser.mjs` aprovou 9/9 telas autenticadas e 4/4 interações, com zero erros de console; `scripts/test-crm-pd-crud.mjs` criou o cliente temporário `TESTE-CODEX-1791327753749` em `prospeccao`, confirmou no RTDB e removeu o registro `-P3IS4z6pCcci2GVeNf_`. Nenhum arquivo de implementação foi alterado; sem commit, push ou deploy.
- **Pedido final:** os módulos devem rodar dentro do `PCP-Kuryos-main` e com comportamento exatamente igual ao `ERPKuryosBeauty`, usando o Firebase `erpkuryos`.
- **Arquitetura:** as próprias telas canônicas React/Firebase foram compiladas em modo incorporado ao PCP. `public/crm-app.html` inicializa a autenticação/sidebar do PCP; a navegação superior do ERP externo é suprimida. As rotas locais `crm1.html`, `crm2.html`, `crm3.html`, `pd.html`, `/crm/**` e `/pd/**` são resolvidas pelo Hosting para o módulo incorporado.
- **Paridade:** o build contém o mesmo código funcional de CRM 1, CRM 2, CRM 3, Pipeline P&D, detalhe P&D, banco de fórmulas, homologações, banco de custos, estoque de laboratório e relatórios. Os 248 assets em `public/static/**` foram comparados por SHA-256 com o build canônico: zero diferenças.
- **Integração PCP:** atalhos do Dashboard e links do `auth_check.js` abrem o módulo dentro do mesmo host e mantêm barra lateral, sessão e controle do módulo Comercial; não há iframe nem navegação superior duplicada.
- **Firebase:** o adaptador canônico lê e grava em `/erp/kuryos/*` no projeto `erpkuryos`. Leitura administrativa confirmou a instância ativa; a raiz estava vazia no teste.
- **Testes:** build de produção aprovado; 13 rotas e assets HTTP 200; teste autenticado em navegador real aprovou 9 telas, barra lateral presente, barra externa ausente e zero erros de console; interações Lista/Kanban, Novo Cliente, Pedido Direto e Nova Pesquisa Interna aprovadas; suíte frontend 2/2; CRUD real criou cliente em `prospeccao`, confirmou no RTDB e removeu o registro de teste com confirmação `null`.
- **Escopo local:** nenhum commit, push ou deploy, conforme pedido. Scripts: `scripts/test-crm-pd-browser.mjs`, `scripts/test-crm-pd-crud.mjs` e diagnóstico `scripts/inspect-crm-pd-browser.mjs`.

### Claude — Retrabalhos fora do perfil da rotulagem (05/10/2026)

- **Pedido:** o perfil da rotulagem só vê rotuladoras e a rotulagem realizada; o bloco de Retrabalhos sai de lá.
- **Ajuste:** `#retrabalhosPainel` (Painel de Turno) só aparece na área do envase; `RetrabalhosTela.visibilidade()` (`public/shared/retrabalhos-tela.js`) é chamada por `aplicarRestricaoRotulagem` (`public/form.html`). A tela `retrabalhos.html` já era só da Qualidade. Teste: `run_encerrar_turno_setor_ui_test.js`.

### Claude — Encerrar turno por setor (05/10/2026)

- **Pedido:** envase e rotulagem têm perfis e telas diferentes; ao encerrar o turno no envase, o sistema pedia dados da rotulagem (já encerrada por outro perfil).
- **Causa:** `turnoItensAtivos` (form.html) juntava linhas E rotuladoras para quem tem os dois setores (admin/gestão/perfil com os dois), sem olhar a área do painel, e perguntava de novo uma linha/rotuladora já fechada ("Fim de turno") e não retomada.
- **Ajuste (`public/form.html`):** o Encerrar Turno fecha só a área em que a pessoa está (`setorVisao()`: envase = linhas + postos; rotulagem = rotuladoras) e pula o que já está `parada` por "Fim de turno" (avisa "Nada a fechar…"). Retomar Produção volta a perguntar. Intervalo por card não muda. Teste: `run_encerrar_turno_setor_ui_test.js`.
- **Arquivos:** `public/form.html`, `run_encerrar_turno_setor_ui_test.js`, `AGENT_STATUS.md`.

### Claude — Intermediários, conciliação da rotulagem e BOM por versão (05/10/2026)

- **Escopo/arquivos:** `public/shared/conciliacao-rotulagem.js` (+ chip em `public/ops.html`), `public/shared/consulta-estoque.js` (`estoqueIntermediario`) e `consulta-estoque-tela.js`/`consulta_estoque.html` (seção por produto), `public/shared/validacao-intermediarios-tela.js` + `public/material_processo.html` (validação da Qualidade), `database.rules.json` (`qualidade_intermediarios`), `public/form.html` (fechar o envase leva a OP ao PCP com a rotulagem aberta), `public/shared/utils.js` (`bomDaVersao`) e os pontos de leitura do BOM (`compras`, `emitir_op`, `form`, `insumos`, `manipulacao`, `cadastros`, `onde-usado`, `necessidade-pedidos`), testes `run_conciliacao_rotulagem_test`, `run_bom_versao_test`, `run_qualidade_intermediarios_rules_test`, `run_validacao_intermediarios_ui_test`, `scripts/aplicar-plano1.sh`.
- **Dados:** 1 BOM de teste (`HDR-MISS-0001__v1`) foi marcado OBSOLETA; a escrita em massa foi bloqueada pelo classificador do Claude Code. Resto do plano 1 em `scripts/aplicar-plano1.sh` (rodar manualmente): 5 BOMs + 21 alocações abertas em OP Concluída. OP 26271/01 já estava em Aguardando Confirmação.

### Claude — "Usado em" só com a versão em uso (02/10/2026)

- **Causa (EP-00106 x EP-00101):** `cadastros.html › Materiais › Usado em` listava TODO registro de `bom/`/`formulas/`: versões antigas (MRARBS11__v1) e duplicatas só na caixa da letra (`HDR-MISS-0001__V1` ao lado de `__v1`). As contas do app usam a fórmula de `melhorFormulaDoProduto` e o BOM de MESMA chave (`produto__versão`); o resto é sobra.
- **Código:** `public/cadastros.html` (`mapaVigencia`/`calcularUsoMaterial`, caixa "incluir versões antigas"), `public/shared/onde-usado.js` (mesma regra: fórmula aprovada de maior versão, BOM da chave da fórmula, desempate estável), `run_onde_usado_test.js`.
- **Dados NÃO alterados:** 7 BOMs sobrando (`HDR-MISS-0001/2/3/6/7__v1`, `MRARBS10__v1`, `MRARBS11__v1`) aguardam autorização do usuário para virarem OBSOLETA (com backup). Não afetam cálculo.

### Claude — "O que comprar" por pedido (01/10/2026)

- **Escopo:** nova tela `public/o_que_comprar.html` + `public/shared/necessidade-pedidos.js` (motor puro; usa a MESMA `explodirMateriaisNecessarios`) + `public/shared/necessidade-pedidos-tela.js`; menu em `public/auth_check.js` (PCP e Compras); manual (`manual_compras.html` §1a); testes `run_necessidade_pedidos_test.js` e `run_necessidade_pedidos_ui_test.js`. Não toca `insumos.html` (MRP/Matriz seguem como estão). Única escrita: solicitação de compra pendente (`solicitacoes_compra`, com `pedidoKeys`, `origemTela: 'o_que_comprar'`).
- **Arquivos ativos:** os acima + `AGENT_STATUS.md`.

### Claude — Consulta de Estoque + intermediários x embalagens (01/10/2026)

- **PUBLICADO (`9df9603`, Hosting, 01/10):** `consulta_estoque.html` (menu Logística › Consulta de Estoque; PCP e Compras também) — só leitura, não toca `estoque.html`. Busca por palavras (nome/código/lote/endereço/cliente), filtros com contagem viva (tipo, situação, cliente, "já contado no Dia D"), drawer com lotes FEFO, empenhos por OP, dono, onde é usado, link ao Kardex, CSV, atalhos (`/`, setas, Esc), estado na URL. Aba **Intermediários e envase**: bulk manipulado x embalagem utilizável por OP (casamento por BOM da OP/BOM vigente; estoque de outro cliente e empenho de outras OPs não contam; material sem "Controla estoque" nunca trava), gargalo, e retidos da produção (`material_processo`).
- **Arquivos:** `public/consulta_estoque.html`, `public/shared/consulta-estoque.js` (regras puras), `public/shared/consulta-estoque-tela.js`, `public/auth_check.js` (páginas dos módulos logistica/pedidos/planejamento/compras + links), `public/manual_estoque.html` (§5b), `run_consulta_estoque_test.js`, `run_consulta_estoque_ui_test.js`. Todos liberados; sem arquivos ativos.
- **Validação:** teste de regras, teste de tela (Firebase simulado), ensaio contra a base real (182 itens, 10 OPs com 4.921 kg de bulk, render 27 ms, sem erros), regressões de menu (operação, movimentar, relatório de expedição, material em processo) e transações null. Hashes ao vivo = repo.
- **Observação de dado:** hoje todas as 10 OPs aparecem "travadas por embalagem" porque o Dia D ainda não contou as embalagens (saldo 0/negativo). A tela diz isso; muda sozinha conforme os ajustes entrarem.

### Codex — rearranjo de linhas e retrabalho 21–22/09/2026

- **Publicado — rearranjo:** commit `3331fdb`, botão admin para transferir/trocar OPs pausadas, histórico e totais preservados. Hosting/RTDB/callable publicados e conferidos.
- **Publicado — execução inicial de retrabalho:** commit `a1fde05`, Hosting/RTDB/`apontarRetrabalho`/`rearranjarLinhas` por worktree limpo `../deploy-retrabalho-26216`. Form e módulo conferidos byte a byte por HTTP; função sem login HTTP 401. Domínio, navegador desktop/celular, regras reais no emulador, regressões de encerramento/transações null e ensaio na base real aprovados.
- **Correção operacional APLICADA E REVALIDADA:** `RT-26216-04-20260921`, lote inteiro, sedimentação inesperada do corante com precipitado. Setup 21/09 15:42, envase 16:00, pausa Fim de turno 17:09 BRT. Apontamento do período com quantidade pendente (campo numérico ausente), editável por admin no Apontamento. OP 26216/04 permanece Concluído com 867 unidades, sem duplicação de produção/estoque/pedido. OP 26160/04 voltou a Programado; alocação/setup/datas/marcadores fictícios retirados e preservados na auditoria do RT. Pedido original permaneceu com total zero, sem novo estorno. Backup pré-transação: `backups/correcao-rt26216-1790070001241.json`. Script idempotente: `scripts/corrigir-retrabalho-26216.js`.
- **Novo direcionamento do usuário:** quer uma SEÇÃO DE GESTÃO, com origem em análise CQ/RNC, caso de retrabalho e ordens de fabricação/envase/rotulagem, execução em linha ou posto conforme trabalho. Esse módulo completo AINDA NÃO foi implementado; a tela publicada é o primeiro controle de execução. Modelo e integrações reais registrados em `PLANO_GESTAO_RETRABALHOS.md`; não interpretar o envase publicado como escopo final. Não inventar RNC nem procedimentos de tratamento do precipitado.
- **Coordenação:** usuário lembrou que Claude está trabalhando. Qualidade, laudos, Cadastro e utils.js alheios intactos. Próxima seção deve usar arquivos próprios, com integração à tela CQ somente após coordenação. Nenhuma alteração antecipada na migração Céu Infinito linha 1 → 3, mencionada para amanhã.
- **Arquivos ativos:** nenhum após registrar esta passagem. Últimos arquivos deste escopo: form.html, modules retrabalhos/rearranjo, functions/index.js, regras, testes, script de correção e docs. Trabalhos paralelos não incluídos.

### Codex — Dev 3 11/09

- **Retomada em 16/09 — contatos por área:** assumida a conclusão do escopo de contatos do Dev 2, cuja última execução falhou por limite semanal (tarefa atualmente inativa). Preservar e integrar as alterações salvas de Cadastro, Comercial, agenda/Expedição e módulos/testes de contatos. Validar, corrigir pendências, commit/push/deploy isolado. Nenhuma execução simultânea identificada nos arquivos reservados abaixo.

- **Conclusão dos contatos em 16/09:** cadastro com múltiplos contatos/áreas e principal por área; seleção no Comercial e recebimento do cliente na agenda/Expedição. Legado preservado; pedido, agenda, saída e histórico guardam o contato escolhido. Corrigido carregamento tardio sem sobrescrever ajustes manuais. Testes de dados, gravação do pedido/PCP e navegador (duas telas, revisão, parciais, reload e celular) aprovados; revisão visual concluída. **Publicado:** `d4d36bc` no origin/main e Firebase `prod-kuryos` em 2026-09-16, por worktree limpo (Hosting + `salvarAgendamentoExpedicaoPA` + `confirmarExpedicaoPA`). Os 11 arquivos públicos conferidos retornaram HTTP 200 e conteúdo idêntico ao commit; ambas as funções sem login retornaram HTTP 401. Primeiro deploy parou na descoberta local (10 s); repetição com `FUNCTIONS_DISCOVERY_TIMEOUT=60` concluída. Arquivos deste escopo liberados; nenhuma pendência de implementação.

- **Escopo:** grade de Expedição baseada na planilha, composição compacta de caixas parciais e agenda de transporte PA compartilhada com Logística.
- **Coordenação:** base do Dev 2 publicada em `3d7a60f` e integrada. Arquivos ativos: nenhum; entrega encerrada. MRP/Claude preservado.
- **Entrega pronta:** grade por palete com filtros/ordenação, caixas completas e parcial na mesma linha, totais e histórico. Agenda PA acessível pela Expedição e Logística; transporte compartilhado com revisão/histórico, sem baixa ao agendar, sem palete em duas agendas, cancelamento com motivo. Confirmação encerra agenda e baixa estoque/pedidos atomicamente, preservando transporte agendado e efetivo.
- **Validação:** testes de grade/parciais, agenda/handler com concorrência e permissão revogada, navegador em duas telas (transporte, revisão, reabertura, saída e histórico), reload/idempotência/celular e regressões de rota PC, Conferência PA, Recebimento, Lote Interno, Qualidade e Descarte aprovados. Revisão visual feita com dados de teste.
- **Publicação:** `78545d0` no origin/main e Firebase `prod-kuryos`, Hosting + RTDB + `salvarAgendamentoExpedicaoPA` + `confirmarExpedicaoPA`; deploy completo por worktree limpo. Verificação em 2026-09-11 às 13:14 BRT: HTMLs Logística/Expedição e módulos de grade/agenda HTTP 200, idênticos ao commit; agenda sem login HTTP 401. MRP/Claude preservado (SHA256 de `utils.js` inalterado).

### Codex

- **Escopo atual — contatos por área:** lista dinâmica de contatos de clientes, múltiplas áreas/principal, compatibilidade com contatos legados, seleção no Comercial e contato do cliente na agenda/Expedição com snapshot.
- **Arquivos ativos:** `public/cadastros.html`, `public/comercial.html`, `public/expedicao.html`, `public/logistica.html`, módulos novos `public/shared/contatos-cliente*`, `public/shared/cliente-comercial.js`, `public/shared/agenda-pa-tela.js`, `public/shared/expedicao-grade-tela.js`, `functions/agenda_expedicao.js`, `functions/expedicao.js`, testes de contatos e `run_cliente_comercial_test.js`, `AGENT_STATUS.md`. `public/shared/utils.js` reservado ao MRP/Claude.

- **Entrega dados do cliente no pedido comercial:** seleção preenche contato comercial, telefone, e-mail, endereços de entrega/faturamento e pagamento; permite ajustes no pedido, preserva-os em atualizações do cadastro e limpa dados ao trocar cliente. Cadastro ganhou campos de endereços completos; pedido mantém valores próprios para PCP/Expedição.
- **Validação/publicação:** `run_cliente_comercial_test.js` e regressão da Expedição aprovados; commit `69f475b` no origin/main e Hosting publicado em 2026-09-11 por worktree limpo. Comercial, Cadastros e módulo cadastral HTTP 200, idênticos ao commit.
- **Arquivos ativos neste escopo:** nenhum; entrega encerrada. MRP/Claude preservado.

- **Entrega Expedição por paletes PA:** carga seleciona paletes inteiros conferidos, liberados pela Qualidade e endereçados; herda pedido/cliente/OP/lote, preserva caixas completas/parcial, conferência, laudo e dados comerciais. Saída física, movimentos e expedido dos pedidos confirmados em uma única transação, com idempotência e revalidação concorrente. NF externa permanece separada da situação física; API futura registrada no backlog.
- **Validação Expedição:** run_expedicao_test.js e run_expedicao_ui_test.js aprovados (navegador desktop/celular, reload/retry, CQ, WMS, legado e concorrência), além das regressões de Conferência PA, Recebimento, Lote Interno, Qualidade e Descarte. Base medida em 5,32 MB; a transação na raiz deve ser reavaliada se o volume crescer significativamente.
- **Commit/deploy Expedição:** `3d7a60f`, enviado ao origin/main e publicado em 2026-09-11 (Hosting, RTDB, confirmarExpedicaoPA e finalizarConferenciaPA), por worktree limpo. HTTP 200 e arquivos idênticos ao commit; callable sem login retorna 401. Estoque de PA ainda sem paletes na verificação.
- **Arquivos ativos neste escopo:** nenhum; liberados para Dev 3 11/09 integrar grade/agendamento. MRP/Claude e módulos novos do Dev 3 preservados.

- **Escopo atual — endereços do transporte no PC:** Compras confirma snapshots estruturados de origem/coleta e destino/entrega no Pedido de Compra; Logística consome esses endereços no agendamento, bloqueia ausência e permite correção excepcional com motivo e histórico. Cobrir cotação, PC direto, edição, retirada/FOB, entrega/CIF e remessa.
- **Arquivos ativos neste escopo:** `public/compras.html`, `public/logistica.html`, `public/shared/rotas-pc.js`, `run_rotas_pc_test.js`, `public/manual_compras.html`, `public/manual_logistica.html` e `AGENT_STATUS.md`. Não alterar `public/shared/utils.js` nem `public/insumos.html`, reservados ao MRP/Claude.
- **Entrega pronta — rota do PC:** origem e destino estruturados são sugeridos pelo cadastro/cotação, revisados e congelados no PC. FOB exige origem + contato/telefone; CIF exige destino; remessas não usam CIF/FOB. PC sem rota confirmada não pode ser enviado/agendado. Logística mostra, copia e abre a rota no mapa; exceção vale só para a viagem e preserva rota do PC, antes/depois, motivo, usuário e data. O PDF do PC inclui a rota congelada.
- **Validação rota do PC:** `run_rotas_pc_test.js` cobre FOB, CIF, remessa, snapshot imutável, comparação de exceção, PDF e integrações; regressões de recebimento, lote interno, Conferência PA, Qualidade e Descarte aprovadas.
- **Commit/deploy rota do PC:** `adca695`; Hosting publicado em 2026-09-11 no projeto `prod-kuryos` por worktree limpo, sem o MRP pendente. Verificação externa: `shared/rotas-pc.js` HTTP 200 e `logistica.html` contém `rotaEfetiva`.
- **Arquivos ativos neste escopo:** nenhum; entrega encerrada.

- **Escopo atual — lote interno/recebimento:** implementar `AK-AAAA-NNNNNN` com contador anual transacional no servidor, linhas separadas por lote do fornecedor, recebimento/estoque/CQ idempotentes, etiquetas, cancelamento/estorno e devolução auditáveis; validar cenários completos e publicar.
- **Arquivos ativos neste escopo:** nenhum; entrega encerrada. `public/shared/utils.js` e `public/insumos.html` continuam reservados ao MRP/Claude.
- **Entrega pronta — lote interno/recebimento:** novos lotes seguem `AK-AAAA-NNNNNN` (base histórica 2026 preservada; próximo lógico 576), gerados no servidor com contador anual, índice global, lock por PC e idempotência. Um item aceita múltiplos lotes externos e volumes; confirmação grava PC, saldo físico, `estoque_lotes`, movimentos e fila CQ por update multipath. Histórico ganhou etiquetas Code39+QR, reimpressão, cancelamento seguro e devolução com reabertura do saldo do PC.
- **Validação lote interno:** `run_lote_interno_test.js`, `run_recebimento_qualidade_test.js`, testes de Conferência de PA/CQ/Descarte, sintaxe de Functions, JSON das regras e `git diff --check` aprovados.
- **Commit/deploy lote interno:** `747b607`; Hosting, RTDB e Functions publicados em 2026-09-11 no projeto `prod-kuryos`, usando worktree limpo para não incluir o MRP não commitado. Firebase confirmou `release complete`; conferência HTTP externa permaneceu indisponível por falha local de credencial TLS.

- **Entrega Recebimento/CQ:** `Registrar recebimento` replica as 14 perguntas do Microsoft Forms com fornecedor/identificação/SKU interno pré-cadastrados e SKU do fornecedor vindo da homologação quando disponível; mantém validade e endereço do WMS. Todo item recebido exige endereço, nasce em `QUARENTENA` e carrega a ficha de entrada para a fila/laudo da Qualidade sem redigitação. Corrigido também o elo antigo que zerava `origemRef` ao fechar o modal e fazia o lote perder PC/fornecedor.
- **Validação Recebimento/CQ:** `run_recebimento_qualidade_test.js` cobre campos, obrigatoriedade, quantidades inválidas, classificação, homologação, quarentena, origem e consumo pela Qualidade. Regressões `run_conferencia_pa_test.js`, `run_qualidade_pa_tipo_test.js` e `run_descarte_test.js`, sintaxe dos HTMLs e `git diff --check` aprovadas. Commit funcional `1dad636`; Hosting publicado em 2026-09-11 no projeto `prod-kuryos` e GitHub `main` atualizado.
- **Arquivos ativos:** nenhum. Não alterar `public/shared/utils.js` nem `public/insumos.html`, reservados ao MRP/Claude.
- **Entrega WMS concluída:** Conferência de PA exibe também OPs em `Aguardando Confirmação`, destacadas no topo como cobrança ao PCP, mas bloqueia a contagem/entrada até a confirmação definitiva. Depois disso, a Logística informa múltiplos paletes, caixas fechadas/parciais, total e endereço. Divergência não cria estoque: exige três contagens, consenso de duas das três últimas e, se o físico continuar diferente, causa formal com RNC automática. Finalização protegida por callable no servidor, com lock, validação de OP/endereço/legado e caminhos determinísticos; paletes nascem em `QUARENTENA`. Corte prospectivo em 2026-09-10 evita transformar 1.251 OPs históricas sem WMS em pendências falsas.
- **Validação WMS:** `run_conferencia_pa_test.js` e `run_conferencia_pa_server_test.js` cobrem consenso, ausência de consenso, conciliação, OP mutável, endereço inativo, legado, RNC e idempotência; sintaxe de Functions/HTML e `git diff --check` aprovados.
- **Arquivos ativos WMS:** `public/estoque.html`, `functions/index.js`, `functions/conferencia_pa.js`, `run_conferencia_pa_test.js`, `run_conferencia_pa_server_test.js`, `public/manual_estoque.html`, `public/manual_logistica.html`, `public/manual_referencia.html` e `AGENT_STATUS.md`. Não alterar `public/shared/utils.js` nem `public/insumos.html`, reservados ao MRP/Claude.
- **Commit/deploy WMS:** base protegida em `457b681`; fila de cobrança ao PCP em `4ad50d5`. Callable `finalizarConferenciaPA` e Hosting publicados em 2026-09-10 no projeto `prod-kuryos`; GitHub `main` atualizado.
- **Correção de rastreabilidade CQ/PA:** o movimento do laudo agora preserva `itemTipo=produto` para paletes, em vez de classificar toda liberação como material. Validado por `run_qualidade_pa_tipo_test.js`, commitado seletivamente sem incluir o MRP e publicado no Hosting em 2026-09-10.
- **Última entrega Apontamento:** pausa permanece `apontamento_total`; todos os botões de encerramento gravam `fechamento_op`. Quantidade, liberação da linha e status final entram na mesma transaction; UI só confirma após ACK. OP, pedido, consumo e perdas ficaram idempotentes por ID/dedupe contra clique, retry e reconexão.
- **Correção operacional concluída:** lote `26247/06` preserva checkpoint de 864 (10h42–12h04) e recebeu fechamento incremental de 797 no período informado de 13h00–14h15; total da OP 1.661. Pedido `0019__GLMKAM01` atualizado para 15.053 e concluído. Baixas do BOM foram aplicadas uma única vez e marcadas para impedir retry; consumo químico ficou explicitamente pendente porque o produto possui `densidadeGranel=-1`.
- **Proteção adicional:** densidade ausente/inválida não pode mais gerar consumo negativo de fórmula nem aumentar estoque; nesses casos, somente o BOM por peça é baixado. Pedido passa a `Concluído` atomicamente ao atingir a quantidade total.
- **Validação:** correção no Firebase revalidada após escrita; `run_apontamento_encerramento_test.js`, sintaxe de todos os scripts de `public/form.html` e `git diff --check` aprovados.
- **Commit/deploy Apontamento:** `7d30cdd` (inclui a proteção de densidade), Hosting publicado em 2026-09-10 em `https://prod-kuryos.web.app`; GitHub `main` atualizado. A CLI confirmou `release complete`; a conferência HTTP externa ficou indisponível neste host por falha local de credencial TLS.
- **Arquivos ativos:** `public/form.html`, `run_apontamento_encerramento_test.js` e `AGENT_STATUS.md`. `public/shared/utils.js` permanece reservado ao MRP/Claude e não será incluído nem publicado.
- **Última entrega Compras:** “＋ Fornecedor” sugere somente homologados do próprio item e homologados de materiais similares por volume, como na abertura da cotação. Similar fica marcado, vinculado ao item original e exige especificação técnica antes de gerar PC; fornecedor avulso continua pelo CNPJ.
- **Validação Compras:** sintaxe e `git diff --check` aprovados; cenário cobre homologado direto + homologado via material similar.
- **Arquivos ativos:** nenhum.
- **Última entrega Compras:** ao iniciar uma cotação, abre a aba Cotações. O cartão de fornecedores ganhou “＋ Fornecedor”: busca na base ou CNPJ avulso, sempre com escopo obrigatório por material; convite repetido amplia o escopo sem duplicar e itens fora da homologação ficam sinalizados.
- **Validação Compras:** sintaxe de `compras.html`, `git diff --check` e cenário de convite por item (sem duplicidade; fora da homologação sinalizado) aprovados.
- **Commit/deploy Compras:** `f738e9b`, Hosting publicado em 2026-09-10 em `https://prod-kuryos.web.app`.
- **Arquivos ativos:** nenhum. Não alterar `public/shared/utils.js` enquanto MRP estiver em integração.
- **Última entrega WMS:** Conferência de PA mantida como etapa específica da Logística (produção → conferência → quarentena → CQ). Nova tela **Descarte e Logística Reversa** segrega lotes vencidos, reprovados ou retidos; a saída só baixa o lote ao confirmar coleta/destinação e deixa movimento auditável.
- **Validação WMS:** `run_descarte_test.js`, sintaxe JS/HTML, JSON das regras e `git diff --check` aprovados. Hosting e regras RTDB publicados em 2026-09-09.
- **Commit/deploy WMS:** `051ce9e`, publicado em 2026-09-09 em `https://prod-kuryos.web.app`.
- **Arquivos ativos:** nenhum.
- **Escopo:** Reconstrução completa do módulo Comercial confirmado: orçamento sem impacto operacional, pedido apenas com produtos cadastrados e liberação idempotente para PCP.
- **Arquivos ativos:** `public/comercial.html`, `functions/index.js`, `database.rules.json`, `AGENT_STATUS.md`.
- **Entrega em publicação:** fluxo Comercial completo: Pedido com SKU cadastrado, bloqueio de SKU duplicado e liberação ao PCP; Orçamento sem impacto no PCP, envio/aceite registrado e solicitação de cadastro para item novo; condição comercial, % NF, entrega/faturamento, CIF/FOB de venda e aviso interno por e-mail.
- **Validação:** sintaxe de HTML/JS e Functions, JSON das regras e `git diff --check` aprovados; deploy de Hosting, RTDB e Functions concluído em 2026-09-09. A tela publicada exige login, como esperado.
- **Commit/deploy Comercial:** `231e44f`, publicado em 2026-09-09 em `https://prod-kuryos.web.app`.
- **Escopo atual:** ciclo comercial ponta a ponta: documentos, anexos, aditivo/cancelamento auditáveis, expedição/faturamento parcial e timeline integrada ao PCP.
- **Arquivos ativos:** `public/comercial.html`, `public/expedicao.html`, `public/auth_check.js`, `functions/index.js`, `database.rules.json`, `firebase.json`, `storage.rules`, `AGENT_STATUS.md`.
- **Entrega parcial publicada:** `expedicao.html` registra cargas de venda, NF externa, CIF/FOB, transportador e quantidades limitadas ao saldo produzido; eventos e metadados comerciais receberam nós próprios.
- **Validação:** sintaxe JS/JSON e `git diff --check` aprovados; Hosting e RTDB publicados em 2026-09-09. Storage bloqueado até inicialização única do bucket no Console Firebase.
- **Atualização publicada:** bucket Storage inicializado pelo usuário; Comercial recebeu anexos, emissão de PDF para impressão/salvamento, timeline, aditivo e cancelamento com evento registrado.
- **Última entrega Comercial:** orçamento pode vincular cliente cadastrado e preencher seus dados, sem exigir que os itens estejam cadastrados como produtos.
- **Commit/deploy Comercial:** `ea91fa8`, publicado em 2026-09-09 em `https://prod-kuryos.web.app`.
- **Última entrega Acessos:** Comercial é módulo próprio em Usuários; permite Pedidos e Orçamentos sem liberar Pedidos/MRP. PCP mantém Comercial no padrão do perfil.
- **Commit/deploy Acessos:** `245dd95`, publicado em 2026-09-09 em `https://prod-kuryos.web.app` (Hosting e regras RTDB).
- **Última entrega Comercial:** tela Pedidos e Orçamentos. Pedido usa cliente/produtos cadastrados e cria automaticamente os itens do backlog do PCP; Orçamento aceita prospectos/itens livres e só entra no PCP ao ser convertido e confirmado.
- **Commit/deploy Comercial:** `62db872`, publicado em 2026-09-09 em `https://prod-kuryos.web.app` (Hosting e regras RTDB).
- **Última entrega Logística:** previsão do Pedido de Compra visível no card e usada como data inicial editável do agendamento; CIF indica recebimento e FOB indica disponibilidade para coleta. A previsão de origem fica registrada no agendamento.
- **Commit/deploy Logística:** `c3ba30f`, publicado em 2026-09-09 em `https://prod-kuryos.web.app`.
- **Estado Apontamento:** checkpoint recebe total acumulado do operador, mas
  registro salva o incremento confirmado na transação; fechamento começa no
  fim do último checkpoint, preservando os períodos úteis.
- **Commit/deploy Apontamento:** `82aba17`, publicado em 2026-09-09 em
  `https://prod-kuryos.web.app`.
- **Commit/deploy Histórico:** `35afccb`, publicado em 2026-09-09 em
  `https://prod-kuryos.web.app`.
- **Estado:** Cotação agora mantém homologados apenas do material original.
  Materiais de embalagem de volume próximo são sugestões explícitas e exigem
  ficha técnica quando incluídos, sem trocar BOM ou homologação.
- **Commit/deploy Cotação:** `94c1ff9`, publicado em 2026-09-09 em
  `https://prod-kuryos.web.app`.
- **Estado:** filtro de área aplicado à Lista, Mapa por Rua e Planta Baixa;
  indicadores passam a refletir o recorte. Logística diferencia coleta da
  Kuryos de entrega pelo remetente para agendamento.
- **Validação:** sintaxe JavaScript de `public/estoque.html` validada com Node.
- **Commit/deploy:** `855de2f` (saldo na OP), `250f5ef` (Logística) e
  `88ad322` (WMS) commitados e publicados em 2026-09-09.
- **Última entrega:** saldo de estoque por material na criação de OP,
  exclusivamente como referência visual; destaca saldo menor que o consumo.
- **Validação adicional:** sintaxe JavaScript de `public/emitir_op.html`
  validada com Node.
- **Última entrega Logística:** dados de coleta/viagem (modalidade, prestador
  cadastrado, valor negociado, referência e status), em `250f5ef`.
- **Última entrega Cotação:** fluxo guiado para preencher uma proposta por
  fornecedor e comparar por material, em `365c759`; publicado em 2026-09-09.
- **Última entrega Cotação:** decisão por material e geração automática de
  um PC por fornecedor, em `913effc`; publicado em 2026-09-09.

### Claude

- **PUBLICADO — Compras: "Confirmar rota e enviar" para quem não é admin (2026-10-02).** Relato:
  PC nascido da cotação vem com `rota.statusConfirmacao` PENDENTE; só o Editar (admin,
  `podeEditarPC`) confirmava, e o analista não conseguia "Marcar Enviado" — o usuário
  editava toda vez. Agora `marcarPedidoEnviado` (`compras.html`) abre o modal
  `modalRotaEnvio` (prefixo `pcEnv`, mesmo editor de rota) quando a rota está pendente;
  grava, num update só, rota CONFIRMADA + transporte + status ENVIADO + dataEmissao +
  enviadoPor. Itens/preços/condições não mudam; Editar segue só admin. Regra do banco já
  permitia (módulo compras). Teste `run_pc_rota_envio_ui_test.js` (usuário não-admin).
  Manual `manual_compras.html`. Arquivos ativos: nenhum.

- **DADO — Regularização de PA expedido fora do sistema (2026-10-01).** Pedido do usuário
  (lista da Expedição): baixar todo PA em estoque exceto 26258/02-04, 26264/06, /07, /13,
  /17, 26273/03, /04 e 26267/03. Com autorização: 60 paletes de 50 lotes (110.948 un)
  zerados como a saída real faz (`saldoLote 0`, `status EXPEDIDO`, `expedicaoId
  regularizacao_20261001`, expedidoEm/Por) + `movimentos_estoque/{sku}/regularizacao_20261001_{lote}`
  (`expedicao_pa`, "SAÍDA DE PA FORA DO SISTEMA (REGULARIZAÇÃO)"); carga Glow Make Up
  `73eac72c…` (AGENDADO, 18 paletes, todos na baixa) CANCELADA com motivo. Piloto + resto,
  conferido: 425 caminhos, nenhum outro lote mudou, 13 paletes dos 10 lotes ficaram, kardex
  concilia. **Pedidos NÃO alterados** (usuário: "só estoque, mas conferir os pedidos"):
  26 pedidos com `expedido` 0; 6 com saída+estoque > produzido (PED-0008 MRARBS07, PED-0002
  MRARBS04, 0019 GLMKAM01/03, 0020 KUBPBA01-2, 26 ESF-SEUN-0001); 4 paletes sem pedido
  (PEL-SEUN-0001, PRF-AFEE-0032, KUBPBA02, PRF-PROP-0001); skuPedidoKey dos paletes sem zeros
  ("19__" × "0019__"). Backups em `backups/estoque_lotes-antes-regularizacao-20261001.json`
  e `backups/carga-73eac72c-antes-cancelamento-20261001.json`.

- **PUBLICADO — "1 a cada N peças", consumo inteiro e material sem controle de estoque
  (2026-10-01).** Pedidos: caixa de papelão como unidades por caixa em vez de 0,020833;
  consumo/estoque nunca em fração; itens como água sem controle de estoque. `utils.js`:
  `ehUnidadeDiscreta` (kg/g/L/ml/m contínuos, o resto discreto), `pecasPorUnidadeBom`
  (campo novo `bom/.../itens/{i}.pecasPorUnidade` ou 1/qtdPorPeca redondo — sem migração),
  `qtdBomParaPecas` (discreto: ceil), `consumoBomIncremental` (diferença dos acumulados da
  OP: inteiro e soma exata), `materialSemControleEstoque` (`materiais/{k}.controlaEstoque
  === false`). `explodirMateriaisNecessarios` usa qtdBomParaPecas. Baixa do apontamento
  (`form.html`) pelo acumulado `produzidoLinha`; perdas, pesagem (`manipulacao.html`),
  empenho (`emitir_op.html`), MRP (`insumos.html`) e sugestão de compra (`compras.html`)
  pulam o sem-controle. Cadastros: checkbox "Controla estoque" no material e "1 a cada N
  peças" no BOM (grava pecasPorUnidade + qtdPorPeca=1/N). Estoque: selo "sem controle".
  Testes `run_consumo_inteiro_test.js`, `run_apontamento_encerramento_test.js` (34+36=70
  caixas). **Dados (01/10):** água sem controle e unidade das MPGR-00038/47/50 (un→kg)
  ajustados pelo próprio usuário no cadastro; 8 caixas ET com saldo fracionado arredondadas
  para baixo com autorização (ex.: ET-00012 −2.231,798 → −2.232), cada uma com `ajustes/
  arred_20261001` e `movimentos_estoque/{k}/arred_20261001` (ajuste_manual, aparece no
  kardex); conferido: só saldo/última movimentação/ajustes mudaram, empenhos intactos.
  Backups em `backups/estoque-ET-*-antes-arredondamento-20261001.json`. Arquivos ativos: nenhum.

- **PUBLICADO — Estoque: coluna "Onde é usado" (2026-10-01).** Pedido: mostrar em quais
  BOMs/produtos o item é usado. `shared/onde-usado.js` (`OndeUsado.indice`): por produto
  ativo, só a versão vigente (maior, fora OBSOLETA) da fórmula (`mpCodigo`, %) e do BOM
  (`materialCodigo`, por peça). `estoque.html` aba Estoque: coluna com nº de produtos +
  2 SKUs, lista completa no drill-down da linha, ordenação e busca por SKU/descrição/
  cliente do produto. Base: 144 de 151 materiais com saldo têm uso; água em 169 produtos.
  Testes `run_onde_usado_test.js` e caso novo em `run_propriedade_estoque_ui_test.js`.
  Arquivos ativos: nenhum.
- **PUBLICADO — Bombona é opcional (2026-10-01).** Decisão do usuário: "não precisa cadastrar
  bombona hoje". Declarar bulk que sobrou (encerramento e Devolver OP à fila) vale SEM identificar
  recipiente: o seletor virou "não identificar agora (opcional)"; com bombona escolhida, ela segue
  sendo atualizada; sem, só o registro em `material_processo` (`recipienteCodigo: null`). A página
  Material em Processo trata "Bulk sem bombona" como informação opcional, não alerta. Regra em
  `shared/material-processo.js` (`aceitaRecipiente`, sem `exigeRecipiente`); testes ajustados
  (`run_material_processo_test.js`, `run_devolver_fila_ui_test.js` com caso sem bombona). Manual
  do apontador atualizado. Arquivos ativos: nenhum.

- **PUBLICADO — Kardex: contagens, aba Histórico e itemTipo (2026-10-01).** Pendências do
  kardex resolvidas: (1) `contagens_inventario` vira linha informativa "Contagem de
  inventário" no item (contado × sistema, diferença, ajuste aplicado ou não) e coluna
  "Última contagem" na Conciliação (`Kardex.movimentosContagens`/`prepararBase`); (2) aba
  Histórico do `estoque.html` virou atalho para `kardex.html?item=` (a lista antiga somava
  movimento de item e de lote); (3) `ajustarEstoque` (utils.js) aceita `extras.itemTipo`
  (padrão `material`), teste em `run_propriedade_estoque_test.js`. Arquivos ativos: nenhum.

- **PUBLICADO (parte 2 de 2) — Material em Processo: sobras no encerramento e "Devolver OP à
  fila" (2026-10-01).** `form.html` + novo `shared/material-processo-form.js`: (1) **contagem de
  sobras OBRIGATÓRIA** nas três formas de encerrar a OP (Encerrar OP do Painel de Turno, Apontamento
  por Total, Fechar Lote): toda linha do BOM + frascos rotulados + bulk (só OP com fase de bulk) pede
  número (0 = não sobrou; branco não passa), dono cliente/Kuryos por linha, bulk exige bombona (vazia
  ou do mesmo lote). Grava `ops/{op}/contagemSobras`, `material_processo/` e acerta a bombona
  (`bombonas_bulk`, com histórico). (2) **⏸ Devolver OP à fila** (botão em todo card com OP, todos os
  papéis do painel): a OP sai da linha/rotuladora SEM encerrar (`abertaDesde`/`abertaLinha` saem,
  `emFila` entra; produção e status intactos), pausa fechada em `paradas_historico`, `estado_linhas`
  liberada, itens retidos declarados (origem PAUSA); **+ Alocar OP** limpa `emFila` e continua de onde
  parou. (3) `ops.html`: chips "⏸ Em fila: motivo" e "📦 retidos: …" na linha da OP. Ensaio: o
  fluxo ponta a ponta (`run_fluxo_ponta_a_ponta_test.js`) agora conta as sobras. Testes novos:
  `run_devolver_fila_ui_test.js`; atualizados `run_fluxo_ponta_a_ponta_test.js`,
  `run_encerradas_ops_ui_test.js`. Manual do apontador atualizado. Arquivos ativos: nenhum.

- **PUBLICADO — Etiqueta de caixa de embarque padrão (2026-10-01), `f2f1e2a`.** Pedido: etiqueta emitida com a OP, campos obrigatórios nesta ordem: logo/nome do cliente, nome do SKU, código do cliente, qtde/cx, lote, validade, peso da cx, lote interno, DUN-14. Módulo `shared/etiqueta-caixa.js` (ITF-14 próprio, lido pelo ZXing a 8 e 6 px/mm; diálogo com pré-visualização, avisos de cadastro, cheias + parcial em branco, `ops/{op}/loteCliente`; formatos 90x55 e 100x70). Logo em Cadastros › Clientes (`clientes/{c}/logoEtiquetaUrl`, Storage `clientes_logo/`, regra nova em `storage.rules`). OP fotografa codCliente/kgCaixa/dum14/clienteKey. Etiqueta antiga (`montarEtiquetasCaixa`, CSS `.etiqueta-page`) removida. Hosting + Storage publicados por worktree limpo, 7 arquivos conferidos idênticos por HTTP. Testes: `run_etiqueta_caixa_test.js`, `run_etiqueta_caixa_ui_test.js`, `run_etiquetas_leitura_test.js`. Cadastro: só 28/385 produtos com DUN-14, 79 com código do cliente, 78 com peso. Arquivos ativos: nenhum.

- **PUBLICADO (parte 1 de 2) — Material em Processo: bombonas e tanques (2026-10-01).** Pedido do
  usuário sobre semiacabados: bulk e frascos rotulados em primeiro lugar; líder declara; contagem
  de sobras exigida no fim da OP; bombona identificada com etiqueta (lote, validade); dono às
  vezes cliente, às vezes Kuryos. **Parte 1 (no ar):** página `material_processo.html` (menu
  Operação › Material em Processo) com (a) Bombonas e tanques: cadastro em lote com código
  BB-0001/TQ-0001 (contador `contador_bombonas`), registrar bulk (OP, kg, dono, validade, local;
  lote diferente não se mistura, capacidade vale, complemento do mesmo lote soma), ajustar kg /
  esvaziar com motivo e histórico, **etiqueta** (`EtiquetasWMS` formato `bombona`: código, lote,
  kg, fabricação, validade, dono, local, barras e QR); lista "Bulk sem bombona identificada"
  (ensaio na base: 6 OPs, ~2.950 kg manipulados sem recipiente); (b) aba Sobras e retidos
  (`material_processo/`, baixa com motivo). Regras novas no banco (`bombonas_bulk`,
  `contador_bombonas`, `material_processo`; teste de regras no emulador com `--project demo-mp`).
  **Parte 2 (a fazer):** "Devolver OP à fila" + contagem de sobras exigida no Encerrar OP
  (`form.html`) + selo no Controle de OPs. Módulo puro `shared/material-processo.js` já traz as
  regras da parte 2. Testes: `run_material_processo_test.js`, `run_material_processo_ui_test.js`,
  `run_material_processo_rules_test.js`. Arquivos ativos para a parte 2: `form.html`, `ops.html`.

- **PUBLICADO — Kardex de estoque (2026-10-01).** Pedido: histórico kardex por item
  (entrou/saiu/consumido/ajustado, log de tudo), incluindo intermediários, e auditoria de
  inventário. `public/kardex.html` (menu Logística › Kardex, módulo `logistica`) sobre
  `shared/kardex.js`, que lê só `movimentos_estoque` + `estoque` + `estoque_lotes`.
  **Duas razões no mesmo log:** material (tem `estoque/{key}`) usa o saldo do item —
  contam recebimento_pc, consumo_producao, consumo_manipulacao, perda, ajuste_manual,
  cancelamento_recebimento, devolucao_fornecedor; item só com lote (PA, intermediário) usa
  a soma dos lotes — contam conferencia_pa, expedicao_pa, devolucao_cliente, saida_manual,
  descarte, inventario, producao_op, recebimento_pc, consumo (FEFO). `transferencia` e
  `qualidade` nunca contam (divisão de lote grava qtd POSITIVA). Tipo desconhecido conta
  pelo sinal. Lote `origemTipo: legado_planilha` vira linha sintética "Saldo implantado".
  `saldoApos` só confere elo (null tolerado). Ensaio na base: 178 itens, 151 conciliados,
  27 com saldo sem movimento registrado (todos materiais com consumo de 01–02/09, antes do
  log), 0 elos quebrados. **Contrato p/ intermediários (sessão não identificada):** gravar
  em `movimentos_estoque/{sanitizeKey(codigo)}` com `itemTipo: 'intermediario'`, `qtd`
  com sinal, `em`, `ref`, `loteKey`; ajustarEstoque fixa `itemTipo: 'material'` (aviso da
  sessão "Arquitetura de novo módulo e custos") — para agregado, aceitar itemTipo por extras.
  Testes `run_kardex_test.js` (+ ensaio com KARDEX_BASE) e `run_kardex_ui_test.js`.
  **Material em processo** (`6a90ddd`, bombonas): o kardex também lê
  `bombonas_bulk/{cod}/historico` (ENCHER/AJUSTE/ESVAZIAR, delta kgDepois−kgAntes) e
  `material_processo/` (sobra = entrada; baixa USADO/DESCARTADO/DEVOLVIDO = saída), como
  movimentos sintéticos (`Kardex.comMaterialProcesso`): itens `proc_bulk_{lote}`,
  `proc_rot_{sku}`, `proc_comp_{codigo}`; sobra de BULK com `recipienteCodigo` não conta
  duas vezes. Se esse módulo mudar o formato do histórico, ajustar
  `movimentosMaterialProcesso` em `shared/kardex.js`.
  Manual: `manual_estoque.html` §6. Arquivos ativos: nenhum.

- **PUBLICADO — Envase que bate a meta sem encerrar também vira etapa a confirmar (2026-10-01).**
  Turno retroativo e apontamento horário não "encerram" (sem `efeitosOp`), mas o cálculo
  de 95% leva a OP a `Aguardando Confirmação`; agora isso grava também
  `confirmacaoEtapas/envase` AGUARDANDO (`automatico: true`), para o PCP confirmar pela
  linha nova. Motivo: 26273/03 e /04 serão lançadas pelo retroativo (envase já fechado no
  chão). Teste em `run_apontamento_encerramento_test.js`. **Dado (autorizado em 01/10):**
  26273/03 gravada (status `Não Iniciado` + `confirmacaoEtapas/rotulagem` AGUARDANDO 1750,
  fechadoEm 2026-09-30T14:54:15Z) e 26273/04 (559, fechadoEm 2026-09-30T17:55:08Z) gravadas
  com autorização explícita do usuário; releitura conferida contra o backup: só `status` e
  `confirmacaoEtapas` mudaram, rotulagem 1750/559 e envase 0 intactos. Próximo passo é do
  chão: turno retroativo do envase das duas. Backups em `backups/op-26273-0{3,4}-antes-20261001.json`. Arquivos ativos: nenhum.

- **PUBLICADO — PCP confirma cada encerramento de setor (2026-10-01).** Pedido: "neste
  momento, o PCP confirme cada apontamento, de rotulagem e de envase". Cada fechamento
  (`aguardarConfirmacao`, exceto posto) grava `ops/{op}/confirmacaoEtapas/{envase|rotulagem}`
  = {status AGUARDANDO, quantidade (total do setor), fechadoEm, local, operador} na mesma
  transaction (`form.html`); novo fechamento do setor substitui o anterior. Controle de OPs
  (`ops.html`) lista uma linha por etapa no grupo "Aguardando Confirmação do PCP" (e no
  filtro de mesmo nome); confirmar grava CONFIRMADO/por/em por caminho plano; a última etapa
  de OP já `Aguardando Confirmação` conclui a OP (`confirmarConclusaoOp`). OP pronta sem
  etapa pendente mantém o botão antigo. Status da OP inalterado (rotulagem antes do envase
  segue ativa, `cab15a9`). Módulo `shared/confirmacao-etapas.js`, testes
  `run_confirmacao_etapas_test.js`, `run_apontamento_encerramento_test.js`,
  `run_fluxo_ponta_a_ponta_test.js`. Arquivos ativos: nenhum.
- **PUBLICADO — Botão de rearranjo que "sumia" (2026-10-01).** Relato: "o botão sumiu, até
  para mim, que sou admin". Causa (`form.html`): o Painel de Turno desenhava os cards ANTES de
  o papel do usuário chegar (`window.currentUser` ainda null), então a condição admin/PCP dava
  falso e o botão só voltava quando algum dado mudasse (o próprio `auth_check.js` documenta
  essa corrida e dispara `kuryos-auth-pronto`, que o form.html não escutava). Agora o painel
  redesenha nesse evento. O botão continua só nos cards de LINHA com OP alocada (hoje, na
  base, só a Linha 2: 26258/05). Teste novo `run_painel_rearranjo_ui_test.js` (tela real,
  login imediato e atrasado; admin/PCP veem, produção/qualidade não) — falhava antes.
  Arquivos ativos: nenhum.

- **PUBLICADO — "Mudar de linha / trocar OPs" também para o PCP (2026-10-01).** Era só admin
  em três pontos, todos ajustados para `admin` + `pcp`: botão no Painel de Turno
  (`form.html`), abertura do modal (`shared/rearranjo-linhas-tela.js`) e o servidor
  (`rearranjarLinhas` em `functions/index.js` + `functions/rearranjo_linhas.js`). Qualquer
  outro perfil continua recusado. Testes: `run_rearranjo_linhas_test.js` (PCP rearranja e
  preserva totais; produção/qualidade/usuário inexistente recusados) e
  `run_rearranjo_linhas_ui_test.js` (PCP vê e abre; produção e qualidade não veem).
  Arquivos ativos: nenhum.

- **PUBLICADO — Rotulagem antes do envase não manda a OP ao PCP (2026-10-01).** Relato:
  Controle de OPs pedia para confirmar OPs que só tinham rotulagem. Medido: 26273/03
  (rot 1750, envase 0) e 26273/04 (rot 559, envase 0) em `Aguardando Confirmação`.
  Causa: a correção de 30/09 (`25c8f63`) só olhava se o OUTRO setor estava aberto; com o
  envase ainda nem iniciado, nada estava aberto e o fechamento da rotulagem encaminhava a
  OP. Agora (`form.html`, `updateOpRecordOnApontamento`, `aguardaEnvase`) fechar a
  rotulagem só encaminha com `produzidoLinha > 0`; posto segue podendo encerrar sozinho.
  `run_apontamento_encerramento_test.js` cobre os dois sentidos (falha no código antigo).
  **Dado NÃO corrigido** (aguarda autorização): as duas OPs voltarem a `Não Iniciado`.
  Fora do escopo, só apontado: 26251/16 `Aguardando Confirmação` desde 14/09 com a
  Linha 3 ainda alocada. Arquivos ativos: nenhum.

- **PUBLICADO — Sugestão de compra de produto em g/kg (2026-09-30).** Erro reportado ao
  gerar solicitação de compra: "HDR-MISS-0005: unidade de volume "g" -- só sei calcular a
  partir de ml ou L". `explodirMateriaisNecessarios` (`shared/utils.js`) só aceitava ml/L,
  enquanto o Emitir OP (`dimensaoNominalDoProduto`) já calcula g/kg. Agora a massa do lote
  sai do peso nominal (densidade se cancela, não é exigida; volume do granel fica nulo sem
  densidade) — mesma conta do Emitir OP, conferida em `run_explosao_massa_test.js`.
  Base real: 33 produtos cadastrados em g/kg; todos calculam (14 sem fórmula cadastrada).
  De quebra: ml com densidade -1 (truthy) passava e dava quantidade NEGATIVA; agora exige
  densidade > 0. Arquivos ativos: nenhum.

- **PUBLICADO — Fotos em todas as análises da Qualidade (2026-09-30).** Pedido da
  Qualidade: foto na análise de insumos. Decisões do usuário: vale para qualquer análise
  (laudo de MP/embalagem/PA, bulk, RNC), até 6 fotos, reprovação exige pelo menos uma.
  Saída explícita "Não há o que fotografar" (fica gravada em `fotosDispensadas`; o motivo
  escrito continua obrigatório). `shared/fotos-qualidade.js` (regras puras + seletor +
  galeria); Storage `qualidade/{contexto}_{chave}/` (regra nova em `storage.rules`);
  gravação em `estoque_lotes/.../qualidade/fotos`, `ops/.../manipulacao/analise/fotos`,
  `nao_conformidades/{n}/fotos` e `fotosEncerramento`; a RNC automática herda as fotos do
  laudo. Upload só ao salvar (sem arquivo órfão). Aparece no histórico da Qualidade, nas RNCs
  e no Dossiê do Lote. Tocou `utils.js` (registrarLaudoQualidade, abrirRnc, encerrarRnc,
  registrarLaudoComRnc), `qualidade.html`, `dossie_lote.html`, manual. Testes:
  `run_fotos_qualidade_test.js`, `run_fotos_qualidade_ui_test.js`. Arquivos ativos: nenhum.

- **PUBLICADO — Item fora do cadastro não entra em fórmula aprovada nem em OP (2026-09-30).**
  Usuário: "se o item não existir no cadastro, não deveria aparecer na fórmula". Medido:
  fórmulas APROVADAS limpas, mas 80 dos 183 produtos com fórmula usam versão rascunho com
  item sem código (250 linhas da importação) ou material inativo (7), e o Emitir OP aceita
  rascunho; 15 desses têm pedido aberto ou OP recente. Módulo `shared/itens-cadastro.js`
  (`problemas`/`mensagem`, teste `run_itens_cadastro_test.js`): trava a aprovação de
  Fórmula e BOM (`cadastros.html`, `bloqueioAprovacaoComponente`) e a emissão
  (`emitir_op.html`, `validarMateriaisConsumo`), com a linha marcada em vermelho e
  resolução por "Substituir" na própria tela — não para a fábrica.
  `run_fluxo_ponta_a_ponta_test.js` cobre trava + substituição. Manuais PCP e Cadastros.
  Arquivos ativos: nenhum.

- **PUBLICADO — Andon: rotulagem, manipulação e qualidade (2026-09-30).** `dashboard.html`
  ganhou (1) a faixa "Cadeia do lote" — Manipulação → Qualidade do bulk → Envase →
  Rotulagem → Conferência de PA → Qualidade do PA, com contagem e a espera mais antiga
  de cada etapa, colorida quando passa do limite; (2) a fila da Qualidade por tipo
  (matéria-prima, embalagem, PA) e RNCs abertas; (3) cards das rotuladoras (operando/
  parada/livre, OP, %) e os postos abertos agora. O detalhe abre por clique. Tudo em
  `shared/andon-cadeia.js` (puro) + `run_andon_cadeia_test.js` e
  `run_andon_dashboard_ui_test.js`. Ensaiado contra a base real (achou que as 11 OPs da
  Logística deixam a faixa sempre em atenção — é o real). **Falta** a parte do dia
  fechado do Dashboard Diário (MELHORIAS_FUTURAS.md). Arquivos ativos: nenhum.

- **PUBLICADO — OP leva o nome do material do cadastro (2026-09-30).** Relato: MPES-00094
  no cadastro é "ESSENCIA LILAH ECO HS - GF49767", na OP saía sem o GF. Causa: Emitir OP
  copiava `mpNome`/`materialNome` do instantâneo da fórmula/BOM (nome de quando foi
  aprovada). Agora `nomeMaterialAtual` (`emitir_op.html`) usa o cadastro, com o nome da
  fórmula só se o material sumiu. Medido: 16 materiais com nome divergente em 38
  fórmulas; 18 OPs ativas com nome antigo em `materiaisConsumo`. **Dado corrigido
  com autorização do usuário (30/09):** 44 campos `mpNome` (41 em `materiaisConsumo`, 3 em
  `manipulacao/previstos`) por caminho plano; piloto na 26271/02, depois o resto; conferido
  44/44 e nenhum outro campo alterado. Backup local em
  `backups/nomes-materiais-ops-antes-20260930.json`. OPs encerradas mantidas como histórico. Fórmulas aprovadas não foram reescritas.
  `run_fluxo_ponta_a_ponta_test.js` cobre. Arquivos ativos: nenhum.

- **PUBLICADO — Onde está a OP indisponível no apontamento (2026-09-30).** Pedido do
  usuário: ao tentar alocar OP no envase que não está disponível, mostrar onde ela
  está. Antes a OP bloqueada sumia da lista (só um aviso com 4 lotes). Agora, no
  modal Alocar OP (`form.html`), as indisponíveis aparecem tracejadas e não
  selecionáveis com "onde está": sem bulk iniciado (+ situação da separação),
  pesagem/conferência/manipulação, bulk aguardando análise ou reprovado, aberta em
  outra linha, aguardando PCP, concluída, cancelada. Sem busca: bloco recolhido com
  resumo por setor; com busca: as que batem aparecem abertas (inclusive encerradas).
  O alerta do portão do bulk também diz "Onde está agora". Regra em
  `shared/onde-op.js` (`OndeOp.onde/resumo`, usa `Manipulacao.podeEnvasar`; NÃO
  confundir com `shared/situacao-op.js`, que é do Controle de OPs), teste
  `run_onde_op_test.js`; `run_fluxo_ponta_a_ponta_test.js` ajustado. Manual:
  `manual_apontamento.html`. Arquivos ativos: nenhum.

- **PUBLICADO — Encerrar num setor não encerra a OP inteira (2026-09-30).** Relato do
  usuário: a rotulagem encerrou "a mesma OP" que seguia no envase. Causa
  (`form.html`, `updateOpRecordOnApontamento`): a transação gravava `Aguardando
  Confirmação` em QUALQUER fechamento, sem olhar o outro setor; e o cálculo
  automático (envase ≥95%) também rodava a partir de apontamento de rotulagem.
  Agora o status só vai ao PCP quando o fechamento deixa a OP sem alocação aberta
  (`abertaDesde` Linha / `abertaDesdeRot` Rotulagem), e o cálculo automático só
  vale a partir de apontamento de envase com nada mais aberto. A mensagem ao
  operador diz "Etapa encerrada — a OP continua aberta no envase". Teste
  (`run_apontamento_encerramento_test.js`) reproduz o defeito no código antigo.
  **DADO NÃO CORRIGIDO:** OP 26267/02 segue `Aguardando Confirmação`/override manual
  com a Linha 1 aberta (960 de 1760); gravação em produção negada nesta sessão;
  backup em `backups/correcao-status-op-26267-02-*.json`. Pendente do usuário.
  Arquivos ativos: nenhum.

- **PUBLICADO — Entrega (PCP) e Prioridade (2026-09-30).** `pedidos/{chave}.dataEntregaPcp`
  (+ `Por`/`Em`): data por item, digitada por admin/pcp na coluna nova "Entrega (PCP)"
  de Pedidos (com selo de atraso e a previsão do Comercial ao lado, ⚠ quando o PCP
  entrega depois); aba Pedidos Comerciais mostra a MAIOR data dos itens e quantos
  itens estão sem data. Controle de OPs ganhou colunas "Prio." e "Entrega (PCP)"
  (leitura). Módulo `shared/entrega-pcp.js`; a sugestão dos 30 dias (corridos, com
  opção de úteis) existe como função pura e **não está ligada** (estoque/MRP ainda
  não confiáveis) — ver MELHORIAS_FUTURAS.md. Testes: `run_entrega_pcp_test.js`,
  `run_pedidos_conciliacao_ui_test.js`, `run_encerradas_ops_ui_test.js` (Pedidos agora
  13 colunas SKU / 11 comerciais). Arquivos ativos: nenhum.

- **PUBLICADO — Menu em sanfona + celular em todas as telas (2026-09-29).**
  `auth_check.js`: cada bloco do menu é um botão que abre/fecha; aberto o da
  tela atual + o último que a pessoa abriu (localStorage por usuário), um de
  cada vez; bloco de 1 link fica sempre aberto; menu com < 11 links fica sem
  sanfona. Celular: gaveta `min(300px, 86vw)`, alvos de 44 px, logo livre do
  botão. `shared/theme.css` (≤980 px): `body.has-sidebar` ganha
  `padding-top:58px` (o botão do menu cobria o título de ~30 telas) — recuos
  esquerdos por página removidos (form, estoque_setor, proximas_ordens,
  qualidade_historico); barras de abas rolam de lado (`:has(> .tab/.top-tab)`
  e `div.tabs`); `.header` quebra linha. Auditoria automática de todas as
  páginas em 375 px: zero rolagem horizontal e nenhum título coberto (antes:
  Estoque 761 px, Compras 288, Planejamento 268…). Teste novo
  `run_menu_sanfona_ui_test.js`; `run_operacao_ui_test.js` lê o bloco pelo
  `data-grupo`. Arquivos ativos: nenhum.

- **PUBLICADO — Pipeline semanal da Qualidade (2026-09-29).** Aba "Semana"
  (padrão) em `qualidade_historico.html`: abre na semana anterior completa;
  em aberto no início + entraram − decididas = em aberto no fim, com Δ vs
  semana anterior; decisões por resultado, por tipo, lista da semana; ◀ ▶.
  "Período" = indicadores de antes; clique na barra do gráfico abre a semana.
  Motor: `itensFluxo` (decididas + quarentena + bulk AGUARDANDO_CQ) e
  `pipelineSemana`. Na base a conta fecha em todas as semanas: 14/09 entraram
  18 e nada decidido; 21/09 entraram 35 (32 paletes), 26 em aberto no fim;
  28/09 (até agora) 30 decididas, 2 em aberto. Arquivos ativos: nenhum.

- **PUBLICADO — Histórico e indicadores da Qualidade (2026-09-29).**
  `qualidade_historico.html` (menu Qualidade › Histórico e Indicadores; página
  no módulo `qualidade`). Motor `shared/qualidade-historico.js` LÊ as decisões
  de onde moram: `estoque_lotes/*.qualidade` (MP/embalagem/PA) e
  `ops/*.manipulacao.analise` + `historico/c{n}.analise` (bulk, cada ciclo).
  KPIs: aprovação, reprovação, concessão, retido, tempo entrada→decisão
  (mediana/p90), bulk na 1ª análise, fila por tipo, série semanal, fornecedor,
  analista, peso/crítico de PA. Histórico com busca e links Laudo
  (`qualidade.html?emitir=&lote=`, novo link profundo) e Dossiê. Ensaio na
  base: 57 análises (38 PA, 7 bulk, 7 MP, 5 embalagem), nenhuma sem entrada ou
  analista; **bulk analisado 1–3 min depois de fechar a manipulação em 5 de 6
  casos** (lançamento em sequência, não tempo real de laboratório). Testes:
  `run_qualidade_historico_test.js`, `run_qualidade_historico_ui_test.js`.
  Próximo: histórico + dashboard da Manipulação. Arquivos ativos: nenhum.

- **PUBLICADO — Controle de OPs menos poluído (2026-09-29, opção A do usuário).**
  `ops.html`: lista principal só com o que pede ação. OP concluída sai da
  principal para a aba nova **Encerradas** (consulta, busca, link do Dossiê)
  quando o PCP confirmou e todo o PA está liberado; com PA em quarentena/
  reprovado ou conferência de PA aberta (ou confirmada há <7 dias sem
  conferência) continua na principal, seção "Concluídas, com produto acabado
  pendente". A situação é sempre calculada (`shared/situacao-op.js`), então a
  OP volta sozinha se chegar devolução em quarentena. "Aguardando emissão de
  OP" deixou de listar pedido já atendido (≥95%). Linha da OP: selos de
  pendência (falta linha, divergência, transferência, sem pedido, Qualidade,
  reprovado); quem emitiu e previsão de término ficam em "detalhes".
  Testes: `run_situacao_op_test.js`, `run_encerradas_ops_ui_test.js`.
  **Medido na base real (29/09, leitura autorizada):** das 1.315 OPs
  concluídas, 1.302 vão para Encerradas, 2 ficam na Qualidade e 11 esperam a
  Logística. Correções vindas da medição: sem selo "falta linha" (59 de 65 OPs
  ativas não têm linha, é normal) e "Aguardando emissão de OP" recolhida por
  padrão (60 itens de demanda real; 72 antes do filtro de ≥95%).
- **PUBLICADO — Pedidos menos poluído (2026-09-29).** `pedidos.html`: filtro
  padrão "Pedem ação" = em andamento (<95%) + produzido com PA no estoque
  esperando expedir (selo "📦 Aguardando expedição"); "Finalizados
  (consulta)" = o resto. Na base: 71 em andamento + 11 aguardando expedição
  (antes 71); as ~200 concluídas sem saldo (legado sem registro/já expedidas)
  saem do padrão. Colunas 15 → 12: Data Prod., Data Pedido e Qtd Total saíram
  (datas no hover de "Em aberto há"; quantidade no Progresso). Teste:
  `run_pedidos_conciliacao_ui_test.js` (padrão, finalizados, 12 colunas).
  Arquivos ativos: nenhum.

- **Incidente de deploy (29/09, ~1 min):** Hosting publicado de um worktree
  sem `e899e27`/`c1846b3` (barra de PA do Controle de OPs, já publicada pela
  outra sessão) voltou `ops.html` e tirou `shared/progresso-op.js` do ar.
  Corrigido no deploy seguinte, a partir do `origin/main` atualizado; todos os
  arquivos conferidos por HTTP. Lição: `git fetch` e comparar HEAD com
  `origin/main` IMEDIATAMENTE antes do deploy, não só antes do commit.

- **PUBLICADO — Controle de OPs: barra principal = produto acabado + hover por
  etapa (2026-09-29).** `ops.html`: a barra mostrava o que a rotulagem apontou;
  agora mostra PA conferido (estoque + expedido, mesma conta da Conciliação de
  pedidos, `porOp`) / planejado. Hover lista Manipulação (kg, rendimento ou
  pesado / previsto), Envase, Rotulagem, Posto (se houver), PA e Expedido.
  Enquanto a conciliação carrega, mostra "carregando" (nunca zero falso).
  Novo `shared/progresso-op.js` (puro) + `run_progresso_op_test.js` e
  `run_progresso_op_ui_test.js`. Achado no ensaio: campo ausente dava NaN%.
  **Depois (mesmo dia):** barra em três faixas — liberado pela Qualidade (verde,
  inclui expedido), aguardando a Qualidade (âmbar, QUARENTENA) e reprovado
  (vermelho); palete legado conta como liberado. `ProgressoOp.paletesPorOp`.
  Manipulação só aparece em OP que tem `ops/{op}.manipulacao` (as emitidas
  depois do portão do bulk); OP antiga não tem dado e fica sem a linha.
  Arquivos ativos: nenhum.

- **PUBLICADO — Qualidade: fila separada por tipo de análise
  (2026-09-29).** `qualidade.html`, aba Fila: abas Matéria-prima / Embalagem /
  Bulk / Produto acabado com contador (tipo por `roteiroDoLote`; bulk = granel
  aguardando análise + reprovado aguardando correção); "Ver tudo" consolidado
  é opção, lembrada em localStorage por uid. Sem escolha, abre no primeiro
  tipo com pendência; `?tipo=` na URL também. Laudos recentes filtram pelo
  tipo. A fila redesenha quando `materiais` carrega (antes a embalagem contava
  como MP até algum outro dado chegar). Testes: `run_inspecao_pa_ui_test.js`
  (abas, contagens, lembrança) + testes que abrem a Qualidade. Próximos:
  histórico + dashboard da Qualidade, depois da Manipulação.
  Arquivos ativos: nenhum.

- **PUBLICADO — edição no Histórico falhava com "set"
  (2026-09-29).** `historico.html`: ajustes do total da OP (transactions) e
  `saveOpDatasReais` (update na mesma OP) agora em FILA -- em paralelo o SDK
  abortava as transactions ("set"), o registro já estava alterado e o total
  ficava pela metade; repetir o salvamento com o registro velho em memória
  descontava de novo. Em erro, a lista recarrega. Seletor de linha da edição
  passa a listar as rotuladoras. Teste: simulador com transaction assíncrona
  que aborta em set/update no mesmo nó (`run_historico_apontamentos_ui_test.js`).
  **26267/01 CORRIGIDA NA BASE (29/09, autorizada pelo usuário):** registros
  28/09 Linha 3 · 1.056 e 29/09 Linha 3 · 885 (novo, `-P2corr26267x01L3`),
  rotulagem 29/09 · 1.760 mantida; OP envasado 1.941 / rotulado 1.760 /
  linha "Linha 3" + `correcaoApontamento`; pedido 0023 7.970 → 9.911
  (incremento). Backups no scratchpad da sessão. **NÃO usar "Reconciliar
  Pedidos" no 0023**: ele soma só OPs vinculadas (4.672) e apagaria a produção
  antiga sem OP. Publicados em 29/09 junto com `63b38bc`.
  Arquivos ativos: nenhum.

- **PUBLICADO — OP concluída com bulk aberto sumia da Manipulação
  (2026-09-29).** Caso 26267/01: OP encerrada com a manipulação em
  EM_MANIPULACAO; `manipulacao.html` escondia toda OP Concluída, ninguém
  fechava a manipulação e o bulk nunca chegava à Qualidade. Agora OP
  Concluída fica na lista enquanto a fase estiver aberta (AGUARDANDO_PESAGEM
  até EM_MANIPULACAO, e CORRECAO_ABERTA). Na base, das OPs sob o portão do
  bulk (emitidas desde 24/09): 26267/02 e /03 LIBERADO (o fluxo funciona),
  26267/01 presa. Teste: `run_manipulacao_ui_test.js`. **Pendente, do
  usuário:** aplicar a correção de apontamento da 26267/01 (rotulagem →
  envase) -- gravação em produção bloqueada nesta sessão; arquivo gerado
  para revisão. Arquivos ativos: nenhum.

- **Publicado — Movimentar (WMS) + etiquetas que leem (2026-09-29).** Commit
  `c071a09`, Hosting por worktree novo do origin/main; arquivos idênticos
  (inclui cargas/faturamento/qualidade). `movimentar.html` (De onde → O quê →
  Para onde → Confirmar; motor `shared/movimentacao-wms.js`; PA só inteiro;
  `separarParcialLoteEndereco` com `opcoes.origemTipo`). Etiquetas medidas com
  ZXing (`run_etiquetas_leitura_test.js`, precisa `ZXING_DIR` com
  @zxing/library + pngjs): **Code39 tinha '.' e '/' errados em utils.js**
  (endereço e lote de OP não liam) — corrigido; quiet zone em Code39/EAN;
  EAN da caixa 0,40 x 13 mm; `shared/etiquetas-wms.js` (recebimento, palete,
  endereço térmica/A4) — Recebimento da Logística usa o modelo novo. 24/24
  leituras a 8 e 6 px/mm. Backlog: etiqueta automática na Conferência de PA;
  leitor no iPhone. Arquivos ativos: nenhum.

- **Publicado — Expedição de vendas em três telas (2026-09-29).** Commit
  `c80f48b`, Hosting por worktree novo do origin/main; 14 arquivos públicos
  idênticos (inclui qualidade/planejamento/relatório de pedido). Sem mudança
  de Functions/regras (mesmas callables). `expedicao.html` = Montar carga
  (grade + transporte + Agendar; `?agenda=K` redireciona a `cargas.html`);
  `faturamento.html` = solicitar faturamento e registrar NF na página;
  `cargas.html` = acompanhamento (etapas, NF quando emitida, carregamento/
  saída com viagens parciais e recuperação de tentativa em
  `sessionStorage['cargasPA-tentativa']`, transporte, cancelar, linha do
  tempo, histórico). Saída só com NF registrada (`CargasPA.acoes().carregar`).
  Régua pura `shared/cargas-pa.js`; faixa `shared/cargas-fluxo.js`; agenda da
  Logística perdeu NF/solicitar (código removido), ganhou atalhos. Base real:
  1 carga ativa (Miss Rose, faturamento não solicitado), 338 saídas legado.
  Testes: `run_cargas_pa_test.js` (23), UI de carga parcial/agenda/expedição
  reescritos para as três telas, calendário atualizado + regressões.
  Arquivos ativos: nenhum.

- **Publicado — faixa do granel grava na especificação (2026-09-29).** Commit
  `9582204`, Hosting por worktree novo do origin/main; arquivos idênticos
  (inclui Planejamento e Relatório de Pedido). Ensaio SEM faixa na spec do
  produto ("-", vazio, "N/A" sem colunas) + faixa digitada = nova versão
  (`AnaliseGranel.especificacaoComLacunas`: copia a vigente, só preenche;
  `origem ANALISE_GRANEL`, `baseadaEm`, `faixasPreenchidas`). Faixa existente
  ajustada e NA seguem só do lote. Lote aponta para a versão analisada
  (`analise.especificacaoKey`); nova em `analise.especificacaoGerada`.
  Testes: `run_analise_granel_test.js` (58), `run_manipulacao_ui_test.js`
  + regressões. Arquivos ativos: nenhum.

- **Publicado — Análise do granel: NA, faixa editável, só o resultado
  (2026-09-29).** Commit `8ac1fb8`, Hosting por worktree novo do origin/main;
  arquivos idênticos (inclui Planejamento/ajuste-grade e Relatório de Pedido).
  Motor `shared/analise-granel.js`: NA em todo ensaio (`aplicavel:false` na
  spec começa em NA); faixa mín–máx editável vinda da especificação
  (colunas ou TEXTO: 282 linhas reais só tinham "5,5 – 6,5"/"180g-198g" no
  texto; agora 533/709 numéricas chegam preenchidas); numérico = só resultado,
  C/NC automático; faixa editada = `faixaAlterada` só no lote; produto sem
  especificação ganha `especificacoes/{sku}__v1` (origem ANALISE_GRANEL).
  Ensaios gravados mantêm os campos lidos por laudo de PA/INMETRO/dossiê
  (+ minimo, maximo, faixaAlterada, na; `cnc` 'NA'). Laudo de PA imprime
  N/A e número com vírgula. Testes: `run_analise_granel_test.js` (46),
  UI de manipulação/correção atualizadas + regressões. Arquivos ativos: nenhum.

- **PUBLICADO — botão "Ajustar a grade" a partir do desvio (2026-09-29).**
  Na Sequência, OP com desvio contra a grade de Quantidades tem o botão:
  `shared/ajuste-grade.js` compara falta do pedido (qtdTotal − produzido)
  com o que a grade ainda reserva (horas futuras em qualquer linha, hora
  corrente pela fração que falta); faltando, insere horas depois do último
  horário do pedido na linha e empurra os seguintes só até o primeiro vago;
  sobrando, libera as últimas e não puxa ninguém. Hora corrente ocupada por
  outro pedido nunca recebe inserção. Prévia + confirm; log em
  `ajustes_planejamento/{dia}` com `por`. Auto-ajuste pausado continua
  desligado. Testes: `run_ajuste_grade_test.js`, `run_proximas_ordens_ui_test.js`
  (clique, confirmação, gravação, log, desvio some). Commit `4d5707f`, só Hosting, conferido por HTTP.
  Arquivos ativos: nenhum.

- **PUBLICADO — Sequência herda a grade de Quantidades + aviso de desvio
  (2026-09-29).** `sugestoesDaGrade` lê `programacao` (janela de 14 dias
  para trás): OP sem decisão do PCP e sem `linha` entra na linha do pedido
  (`skuPedidoKey`; slot com o `lote` da OP vale mais) e na ordem do primeiro
  horário dele -- só sugestão, a decisão do PCP e a linha da OP vencem.
  Desvio (`desvioHoras`, ≥ 1 h) contra `dataFimPlanejada` da OP ou o fim do
  pedido na grade; mostrado só ao PCP. Tolerância de 1 min no fim de cada
  hora (segundos de sobra jogavam o término para depois da pausa). Commit `65a46ef`, só
  Hosting. Arquivos ativos: nenhum.

- **PUBLICADO — Sequência por setor e Próximas Ordens (2026-09-29).**
  Commit `7656081`, Hosting + RTDB (regra `sequenciamento`) do worktree limpo;
  6 arquivos públicos idênticos ao commit por HTTP.
  PCP ordena a fila de cada setor no Planejamento (aba "Sequência por setor",
  um bloco por setor: Separação, Manipulação, Envase por linha, Rotulagem por
  rotuladora); cada setor consulta a sua em `proximas_ordens.html?setor=`
  (só leitura; Logística vê a Separação). Etapas LIDAS da OP (sem ficha nova):
  `separacaoConcluida`, fase da manipulação (sai do setor em AGUARDANDO_CQ),
  `produzidoLinha`, `produzidoRotulagem` (rotulagem só se a OP tem rótulo em
  `materiaisConsumo`). O que roda vence o plano (`abertaLinha`/
  `abertaRotulagem`); OP na grade horária segue a grade. Estimativa encadeada
  por recurso nas horas de turno (mesma regra de `horasEPausasDoDia`), espera
  a etapa anterior da mesma OP (separação → manipulação → envase; rotulagem em
  paralelo). Ritmo: envase = menor entre `prodHoraRef` e o da linha; os demais
  informados pelo PCP. Gravado só `sequenciamento/{ordem,ritmos}`, caminhos
  planos; regra nova: escreve admin/pcp ou `modulos.emitir_op`, todos leem.
  Menu: "Próximas Ordens" em cada setor da Operação e "Próximas Separações" na
  Logística. Testes: `run_sequencia_setor_test.js`,
  `run_proximas_ordens_ui_test.js`, `run_sequencia_setor_rules_test.js`
  (emulador, `--project demo-sequencia`) + regras antigas no emulador +
  varredura. Adiados (reator, ritmo demonstrado, tempo do CQ) em
  `MELHORIAS_FUTURAS.md`. Arquivos ativos: nenhum.

- **Publicado — Rotulagem como área própria no apontamento (2026-09-29).**
  Commit `20e09b9`, Hosting + Functions `onTurnoEncerrado` e
  `checkNotificacoes` por worktree novo; arquivos públicos idênticos ao commit.
  Abas Envase/Rotulagem no Painel de Turno para quem tem os dois setores
  (`localStorage apontamento.setorVisao`); textos da rotulagem; parada na
  rotuladora pelo mesmo `estado_linhas`/`paradas_historico`, agora com `setor`
  (`linha`|`rotulagem`). Envase ignora parada de rotuladora: ritmo em
  `ops.html` e disponibilidade do e-mail de turno. Encerrar turno marca a
  rotuladora "Fim de turno". Cabeçalho do `form.html` abre espaço para o botão
  de menu no celular. Teste: `run_operacao_ui_test.js` (bloco 5b).
  Arquivos ativos: nenhum.

- **Publicado — modal do apontamento cabe no celular (2026-09-29).** Commit
  `a16b747`, Hosting por worktree novo; `form.html` idêntico ao commit. Com a
  perda item a item o Encerrar OP passava da tela e o botão ficava fora (sem
  rolagem). Modais de `form.html`: altura ≤ 100dvh, cabeçalho/botões fixos,
  corpo rola; z-index 10002 (acima do botão de menu, que cobria o título).
  Teste em 375×667 no `run_fluxo_ponta_a_ponta_test.js`. Outras páginas com
  modal de z-index 9999 podem ter o mesmo botão de menu por cima no celular —
  não verificado. Arquivos ativos: nenhum.

- **Publicado — resultados do laudo de PA no sistema (2026-09-28).** Commit
  `6e80660`, Hosting por worktree novo do origin/main; 7 arquivos públicos
  idênticos (inclui Relatório de Pedido e Manipulação). Laudo do palete ganhou
  "Resultados do laudo": FQ (parâmetros da especificação ou os 5 do modelo,
  mesclados com a análise do bulk do lote — marcados `bulk` — editáveis) e
  micro (realizada com resultado por análise + laboratório + nº do laudo
  externo, ou dispensada com justificativa). Grava `qualidade.resultadosPa`
  (campo novo na whitelist de `registrarLaudoQualidade`, utils.js). Impresso
  mostra só o digitado; `MICRO_PADRAO` de `laudo-cq.js` perdeu os resultados
  fixos ("Ausente") que eram impressos sem análise — laudo antigo agora sai
  com a micro em branco. Micro Presente/acima trava liberação; pendência só
  avisa. Motor `shared/laudo-pa-resultados.js`. Testes:
  `run_laudo_pa_resultados_test.js` (24), `run_inspecao_pa_ui_test.js`
  estendido + regressões. Arquivos ativos: nenhum.

- **Publicado — perdas item a item no fechamento da OP (2026-09-25).** Commit
  `e835c03`, Hosting por worktree novo do origin/main; 10 arquivos públicos
  idênticos ao commit. Motor `shared/perdas-etapa.js`. Encerrar OP (Painel de
  Turno) e Finalizar OP listam cada insumo da OP (`materiaisConsumo`; OP antiga
  usa o BOM de `baixarEstoqueConsumo`); envase pede também unidades envasadas
  descartadas e bulk (kg) — conversão só com peso/densidade reais (25 de 65 OPs
  abertas); rotulagem põe frascos/rótulos em cima. Fechar exige perda ou "Não
  houve perda". Formato de `perdas/{lote}` inalterado (tipo derivado do
  material, `especificacao` = nome; novos: `materialCodigo` sempre, `unidade`,
  `etapa`, `produto`). Insumo baixa estoque; produto é registro. Manipulação:
  `manipulacao/perdasMp/{itemKey}` (kg, ≤ pesado) + `semPerda`; soma em
  `perdasManipulacao`. Corrigido re-render que apagava o campo recém-tocado.
  Relatório de Pedido: perda de produto fora do total de componentes. Turno
  Retroativo segue com a lista livre. Bateria completa sem falhas.
  Arquivos ativos: nenhum.

- **PUBLICADO — peso do PA pela densidade + regras do INMETRO (2026-09-25).**
  Commit `f7354f7`, só Hosting (sem regras/Functions), do worktree limpo;
  4 arquivos públicos idênticos ao commit por HTTP.
  Produto declarado em ml era pesado em g e comparado direto com o nominal.
  `shared/inspecao-pa.js`: tudo em gramas de conteúdo líquido (balança tarada
  na embalagem vazia); nominal/T/2T × densidade para ml. Densidade: medida no
  laudo > ensaio "Densidade" da análise do bulk do lote > cadastro (OP
  `densidadeGranelUsada` / produto), origem gravada. Portaria INMETRO
  249/2021: T da tabela por faixa (não mais −3% fixo; `toleranciaPct`
  ignorado), c pelo plano (5/0, 13/1, 20/1, 32/2, 80/5; o do maior plano que
  a amostra cobre), nenhuma abaixo de 2T, média Qn − k·s. Pesagens padrão =
  n do plano pelo tamanho do lote (conferido da OP), senão 32. Registro
  `CK7-2026-09b`; laudo impresso (`laudo-cq.js`) mostra T, 2T, média mínima
  e densidade (laudo antigo sem `tolerancia` segue o texto de antes).
  Análise do bulk: valor numérico sempre apontável em pH/densidade/álcool,
  sem especificação mostra os seis ensaios padrão, e liberar sem densidade
  pergunta. Manual da Qualidade seção 1c. Testes: `run_inspecao_pa_test.js`,
  `run_inspecao_pa_ui_test.js`, `run_manipulacao_ui_test.js`,
  `run_correcao_bulk_ui_test.js` + varredura. Leitura da produção bloqueada
  nesta sessão: não foi possível ver quantos SKUs têm densidade no bulk/
  cadastro. Arquivos ativos: nenhum.

- **Publicado — Relatório de Pedido (2026-09-25).** Commit `a2a3ec9`, Hosting
  (republicado após o incidente abaixo; conferido byte a byte). Página nova
  `relatorio_pedido.html` (menu PCP e Comercial; módulos `pedidos`/`comercial`
  em `auth_check.js`): por item, pedido / produzido / a produzir / expedido /
  em estoque / lotes / perdas de componentes; clique abre os lotes; PDF, CSV e
  link `?pedido=`. Motor `shared/relatorio-pedido.js` sobre a
  `ConciliacaoPedidos` (mesma conta de `pedidos.html`); perdas pela regra do
  Histórico (`perdas/{lote}` vence `ops.perdas` do Excel; OP `-vN` herda a
  perda lançada no número do papel). Testes: `run_relatorio_pedido_test.js`
  (8), `_ui_test.js` (7). Ensaio: 14 de 80 pedidos têm perda; 8 lançamentos de
  julho são de OPs apagadas e sem pedido (não atribuíveis).
  **Histórico com rótulo trocado:** o commit `81b4876` diz "Relatório de Pedido
  publicado", mas contém a nota "correção de bulk publicada" da outra sessão —
  fiz `git add`/`commit` no checkout principal sem ver que havia um rebase dela
  parado no conflito. Conteúdo correto, só a mensagem errada; não reescrevi o
  main publicado. Lição: antes de commitar no checkout principal, `git status`
  inteiro (não `--short`), procurando rebase/merge em andamento.
  Arquivos ativos: nenhum.

- **Publicado — correção de bulk só com matéria-prima (2026-09-25).** Commit
  `967a93f`, Hosting por worktree novo do origin/main; 7 arquivos públicos
  idênticos (inclui Relatório de Pedido). A lista da correção oferece só MP
  (`tipo` MPGR/MPES, `Manipulacao.ehMateriaPrima`); EP/ES/ET/MU recusados;
  textos falam em matérias-primas. Arquivos ativos: nenhum.

- **Publicado — correção de bulk reprovado (2026-09-25).** Commit `b97fc03`,
  Hosting publicado. **Incidente:** meu deploy saiu de um worktree de
  `b97fc03` criado antes de `a2a3ec9` e derrubou o Relatório de Pedido (404);
  a outra sessão republicou `a2a3ec9` e conferi: relatório e correção de bulk
  no ar, idênticos ao origin/main. Lição: worktree de deploy nasce do
  origin/main recém-buscado NA HORA do deploy, nunca reaproveitado.
  Bulk reprovado deixava o lote travado. Agora: Qualidade abre a correção
  (card novo em `qualidade.html`, RNC obrigatória, massa que entra, insumos,
  transação só se ainda REPROVADO); o ciclo reprovado vai para
  `ops/{op}/manipulacao/historico/c{n}` e a fase recomeça em
  `CORRECAO_ABERTA` com os insumos como `previstos`; pesagem/conferência/
  manipulação existentes servem à correção; rendimento soma `entradaBulk`.
  Ao fechar, excedente = floor(rendimento ÷ kg/un da fórmula) − planejado →
  `qtdPlanejada` (original em `qtdPlanejadaOriginal`), `excedenteBulk`,
  BOM escalado em `materiaisConsumo` (`quantidadeOriginal`), empenho somado
  (transação própria — `empenharMateriais` SOBRESCREVE o empenho do lote) e
  `separacaoConcluida` reaberta como `separacaoParcial` + `separacaoReaberta`.
  Retroativo: `correcao.retroativo` dispensa foto com justificativa. Dossiê
  mostra todos os ciclos. Reprovar de novo na correção não abre RNC nova.
  Testes: `run_correcao_bulk_test.js` (60), `run_correcao_bulk_ui_test.js`,
  `run_correcao_bulk_rules_test.js` (emulador, `--project demo-operacao`) +
  regressões. **Pendente:** regularizar o lote reprovado de hoje
  (usuário precisa informar o lote e as quantidades; leitura da produção
  também bloqueada nesta sessão). Arquivos ativos: nenhum.

- **Publicado — Separação consolidada por material (2026-09-25).** Commit
  `c830041`, Hosting + RTDB por worktree limpo; 4 arquivos públicos idênticos ao
  commit e regra conferida no ar. Aba nova em `separacao_materiais.html`: soma o
  mesmo material de várias OPs (SKUs diferentes) por posição, na ordem do
  Planejamento (na linha → `dataInicioPlanejada` → sem programação pela emissão).
  Motor puro `shared/separacao-consolidada.js` (roda OP a OP sobre saldo simulado
  com o FEFO real, dono respeitado; falta cai na OP de menor prioridade). Grava
  pedaços com `origemRef` da OP, `ops/$op/separacaoParcial` (acumula) e
  `separacaoConcluida` só quando completa (`via: 'consolidada'`). Regra nova:
  esses dois campos graváveis por papel/módulo Logística — antes a separação por
  OP também tomava PERMISSION_DENIED ao marcar a OP. Testes: unit 7, UI 8,
  regras no emulador. **Atenção para testes de regra:** rodar com
  `--project demo-<ns>`; sem isso o emulador aplica as regras a outro namespace
  e tudo passa aberto (`run_operacao_rules_test.js` só passa com
  `--project demo-operacao`). Ensaio na base: 18 OPs elegíveis, **nenhuma com
  data no Planejamento** (tela avisa), 0 saldo endereçado nos materiais delas.
  Arquivos ativos: nenhum.

- **Publicado — PC direto travado em "Criando..." (2026-09-24).** Commit
  `f082ca6`, Hosting + RTDB; `compras.html` idêntico ao commit. O botão travava
  antes da conferência da rota (return sem destravar) e `#alertBox` ficava
  atrás do fundo do modal (z-index 500) — todo aviso com modal aberto era
  invisível em Compras. Agora a rota é conferida antes, o botão destrava em
  qualquer falha e o aviso flutua acima dos modais. Regras:
  `config/contadores/{solicitacaoCompra,processoCotacao,pedidoCompra}`
  graváveis pelo módulo Compras (antes só admin/PCP), só sobem. Testes:
  `run_pc_direto_ui_test.js`, `run_compras_contadores_rules_test.js` (emulador
  9023) + regressões de Compras. Arquivos ativos: nenhum.

- **Publicado — GAP-02 devolução de cliente (2026-09-23).** Commit `dd520ee`: Hosting + RTDB + todas as Functions (20, nodejs24; `receberDevolucaoCliente` criada; as da Expedição republicadas com a regra nova) por worktree limpo; 9 arquivos públicos idênticos ao commit. Regressão completa 86/86 após corrigir o painel de pendências do `ops.html` (botões dependiam do tempo de carga do perfil). Arquivos ativos: nenhum. Tela nova
  `devolucoes.html` (Comercial autoriza, Logística recebe, todos acompanham),
  `shared/devolucao-cliente.js` + cópia `functions/devolucao_cliente.js`, callable
  `receberDevolucaoCliente`, origem `devolucao_cliente` em
  `functions/expedicao_regras.js` = `shared/expedicao.js`, conciliação com
  DEVOLVIDO (estorno) e retrabalho (informativo) em `shared/conciliacao-pedidos.js`
  (`pedidos.html`, `gestao_comercial.html`, `shared/gestao-comercial.js` passam
  `devolucoes_cliente`), menu/módulos em `auth_check.js`, regras
  `devolucoes_cliente`/`contadores_devolucao`. Testes novos: unit (49),
  servidor+regras no emulador (25), UI (4 etapas).
  **Aviso ao Codex — `descarte.html`:** o cabeçalho é `<header class="header">`,
  e `renderUnifiedNavbar` (`auth_check.js:569/823`) remove todo `<header>` como
  legado — em produção o título e o selo "Conectado" da tela somem ao carregar o
  menu. Troca por `<div class="header">` resolve (feito assim em `devolucoes.html`).
- **Publicado — GAP-04 portão do bulk + GAP-18 (2026-09-23).** Commit `3d361e5`, Hosting por worktree limpo; `form.html`, `pedidos.html`, `shared/manipulacao.js` idênticos ao commit por HTTP. Arquivos ativos: nenhum.
  `shared/manipulacao.js` (`podeEnvasar` com fórmula + corte
  `PORTAO_BULK_DESDE` 24/09), `form.html` (5 portas do envase; rotulagem fora
  do portão), `pedidos.html` (sem "+ Novo Pedido"). Testes novos
  `run_portao_bulk_test.js` (28), `run_portao_bulk_ui_test.js` (6),
  `run_pedido_porta_unica_test.js` (4); `run_fluxo_ponta_a_ponta_test.js`
  ajustado para fixar a emissão depois do corte e exigir o portão (senão
  quebraria a partir de 24/09). Regressão de manipulação, apontamento,
  operação, retrabalho, rearranjo, histórico, transferência, conciliação e
  GAP-05 aprovada. Sem mudança de regras do banco.


- **Entregue — modelagem dos fluxos do sistema (2026-09-23).** Pedido do
  usuário: fluxo por área (tela › campo › onde aparece), numerado `[Área].n`,
  fluxo padrão ponta a ponta, fluxos não padrão e gaps. Em
  `FLUXOS_DO_SISTEMA.md`: 69 passos (CAD, CMP, COM, PCP, LOG, QUA, PRO, MAN,
  ROT, FAT), 28 exceções (EX-01..28) e 20 gaps (GAP-01..20; 4 altos:
  estoque sem base, devolução de cliente, portão do bulk, mudança de pedido
  que não chega à OP). Versão navegável publicada como artifact
  (https://claude.ai/artifact/4swhySza1PhashnA1ECYNH), gerada a partir do .md.
  Só documentação; nenhum código alterado. **Quem mudar um fluxo atualiza o
  passo no .md no mesmo commit.** Arquivos ativos: nenhum.
- **Integrado ao backlog (2026-09-23).** Cada gap do `FLUXOS_DO_SISTEMA.md`
  aponta a seção do `MELHORIAS_FUTURAS.md`; nova seção *Backlog × fluxo* encaixa
  cada seção do backlog em gap/passo ou "dívida técnica". Do backlog vieram
  GAP-21..28 e EX-29..32 (transformação de material, devolução de remessa ao
  cliente, sobra da pesagem, inspeção em linha CK-3/4/5/6/8, documentação CQ,
  coletor, histórico de produto, dossiê). No backlog: nota de ligação no
  topo, seção *Gaps levantados na modelagem de fluxos* (GAP-02/03/04/05/13/18,
  que não tinham item) e 6 itens marcados FEITO (selo, solicitação pelo MRP,
  estoque de PA, devolução ao fornecedor, em trânsito, campo de segurança).
  Destaque: migração do Node 20 das Functions vence em 30/10/2026.

- **Publicado — vírgula decimal na Qualidade (2026-09-23).** Hosting;
  `qualidade.html` e `shared/campo-decimal.js` idênticos ao commit. Num
  `type="number"` o Chrome descartava a vírgula ("197,5" → 1975, sem aviso).
  O script converte os `step="any"` da página em texto com teclado decimal e
  normaliza (vírgula → ponto). Outras telas com `step="any"` ainda têm o
  mesmo risco — incluir o script nelas é uma linha cada.
- **Publicado — média de peso do CK-7 pelo INMETRO (2026-09-23).** Commit
  `5bd3027`, Hosting; `qualidade.html` e `shared/inspecao-pa.js` idênticos ao
  commit. A média exigia ≥ nominal sem tolerância (tela só mostrava o −3%
  individual) e bloqueava lotes dentro dos −3%. Decisão do usuário: x̄ ≥ Qn − k·s,
  k = t(99,5%; n−1)/√n (bate com a tabela da Portaria 249/2021). Com menos de
  5 unidades segue média ≥ nominal. Tela mostra média mínima, k e s; laudo
  grava `limiteMedia`, `k`, `desvioPadrao`. Individual continua sem as `c`
  unidades toleradas do plano do INMETRO (mais rígido; não pedido).
  Arquivos ativos: nenhum.

- **Módulo Operação, Fase 1 (2026-09-23) — PUBLICADO.** Commit `fccafce` (rebase de `88060ca`, mesmo conteúdo)
  no origin/main; Firebase `prod-kuryos`: Hosting + RTDB + função nova
  `onPesagemFechada` (criada; segredos do Graph concedidos). Os 9 arquivos
  públicos alterados conferidos por HTTP: 200 e idênticos ao commit.
  O que entra: menu "Operação" (Produção / Manipulação / Rotulagem), um
  checkbox por setor em Usuários (`apontamento` segue sendo a chave da
  Produção; `manipulacao`, `rotulagem`, `conferencia_pesagem` novos).
  Marcação antiga só com `apontamento` herda os dois setores novos enquanto
  a chave estiver ausente; `usuarios.html` grava `false` ao desmarcar.
  Perfil `rotulagem` passa a ver só a Rotulagem (não vê mais a Manipulação).
  Histórico: setor vê só os seus apontamentos; editar/excluir só admin/PCP
  (perfil `production` perdeu a edição, pedido do usuário). Estoque por
  área, só consulta (`estoque_setor.html` + `shared/estoque-setor.js`,
  áreas por setor em `config/operacao/areasPorSetor`). Chave "Conferência
  de Pesagem" (`config/conferenciaPesagem/ativa`, Ajustes): ligada, só
  Qualidade/P&D conferem com login; admin libera com motivo
  (`conferencia/modo = LIBERADO_PELO_ADMIN`); e-mail `onPesagemFechada`
  (`functions/pesagem_fechada.js`, marca em `notificacoes_pesagem`).
  Regras: módulos da Operação onde `apontamento` já escrevia + `ops` e
  `estoque`; `ops/$opKey/manipulacao` para papel `qualidade` e marca
  `conferencia_pesagem` — corrige a liberação do bulk pelo papel
  `qualidade`, que as regras negavam. "Granel" virou "bulk" só no texto.
- **Validação:** `run_operacao_ui_test.js` (novo), `run_operacao_rules_test.js`
  (novo, emulador 9023), `run_pesagem_fechada_email_test.js` (novo),
  manipulação unit/UI, histórico unit/UI, apontamento, OP encerrada,
  transações null, dossiê e `run_retrabalhos_rules_test.js` no emulador.
  Varredura completa: só 7 falhas, todas anteriores a este trabalho —
  testes de Expedição/Compras fazem `JSON.parse` cru de
  `database.rules.json`, que tem uma linha `//` desde `ea4c1bd`.
- **Arquivos ativos:** nenhum. Fases 2 e 3 registradas em `MELHORIAS_FUTURAS.md`.

- **Escopo atual — teste de fluxo ponta a ponta (2026-09-22).** O usuário pediu
  testar "as funcionalidades, fluxos, integrações", começando "no orçamento >
  cadastro > pedido" e seguindo em cadeia. `run_fluxo_ponta_a_ponta_test.js`
  agora dirige as telas reais de Orçamento → aceite → cadastro → Pedido →
  Emissão de OP → Apontamento → Conferência de PA → confirmação do PCP, com o
  banco vivendo no Node e passando de tela em tela.
- **Corrigido nesta rodada:**
  1. `ops.html` — "Confirmar conclusão" não existia nas visões filtradas; quem
     filtrava por "Aguardando Confirmação" via a OP e nenhuma forma de
     confirmá-la, travando Conferência de PA, estoque e Expedição atrás disso.
  2. `cadastros.html` + `database.rules.json` — a solicitação de cadastro aberta
     pelo aceite de orçamento não era lida por NENHUMA outra tela. Agora aparece
     como tarefa na aba Produtos, abre o cadastro pré-preenchido e é fechada
     (`CADASTRADO` + `produtoKey`) quando o produto é salvo. A regra do nó ganhou
     `modulos.cadastros`, senão quem cadastra tomaria PERMISSION_DENIED.
  3. `comercial.html` — a previsão comercial de entrega agora desce para
     `pedidos/{PED__SKU}/dataEntrega`. O MRP **continua** ignorando-a de
     propósito; a razão está em `MELHORIAS_FUTURAS.md`.
- **Armadilha que isto custou:** `currentUserNome` existe em `cadastros.html`,
  mas dentro de outras IIFEs. Chamada da IIFE de Produtos era ReferenceError, o
  throw caía no `.catch` genérico do save e a tela dizia "Erro" enquanto o
  produto era gravado normalmente e a tarefa ficava aberta em silêncio.
- **Cadeia fechada até a Expedição (commit `f0f7f11`).** O teste vai de
  orçamento até o palete endereçado em QUARENTENA, a fila do CQ e a trava da
  Expedição. O passo 8 é negativo de propósito: roda `shared/expedicao.js`
  contra o estado produzido e exige recusa por "Aguardando liberação da
  Qualidade" — qualquer outro motivo significaria que o laudo liberaria e a
  Expedição travaria no motivo seguinte. Falta o laudo do CQ e a saída física.
- **Cuidado para quem mexer no harness:** `functions/conferencia_pa.js` exporta
  `prepararFinalizacao` (pura, devolve `{updates, ...}`), não `finalizar`.
  Tratar o retorno inteiro como mapa de updates grava nós de lixo e nenhum
  palete — e a tela continua dizendo "Conferência concluída".
- **Gaps conhecidos que NÃO corrigi** (são escopo do `PLANO_PLANEJAMENTO_PCP.md`):
  OP nasce sem `dataInicioPlanejada` quando não há bloco programado; o portão do
  granel só barra OP que já começou a manipulação, então OP recém-emitida vai
  direto ao envase sem laudo.
- **Arquivos ativos:** `public/cadastros.html`, `public/comercial.html`,
  `public/ops.html`, `database.rules.json`, `run_fluxo_ponta_a_ponta_test.js`.
  `public/shared/conciliacao-pedidos.js` está modificado na árvore e **não é
  meu** — não tocado, não commitado.

- **Entrega publicada — retrabalho é uma OP (2026-09-22).** O usuário refez
  o escopo: *"apenas poder abrir uma OP, mas de retrabalho... pode ser
  alocada em linhas de produção ou postos de trabalho"*. O universo paralelo
  `retrabalhos/{id}` sai do caminho principal.
  - **`public/shared/retrabalho-op.js`** monta a OP. O que impede contar
    produção duas vezes são duas AUSÊNCIAS, não campos novos: **sem
    `skuPedidoKey`** (o crédito ao pedido já é pulado) e **sem
    `materiaisConsumo`** (a baixa de BOM já não acontece). Quem "completar"
    esses dois campos um dia quebra a regra inteira — tem asserção própria
    em `run_retrabalho_op_test.js` por isso.
  - **Numeração `{lote}-RT{n}`** (decisão do usuário): retrabalho não gera
    lote novo, é o mesmo lote voltando.
  - **Abrir:** botão ♻️ no Controle de OPs (filtre por Concluído ou busque o
    lote — a tela esconde concluídas por padrão, de propósito).
  - **Posto executa OP:** `produzidoPosto` e `tipo==='posto'` já existiam,
    mas **nada escrevia** neles. Agora o card do posto mostra a OP de
    retrabalho alocada (vínculo pelo campo `linha`, sem campo novo) e
    "+ Somar produção" credita a OP via `ajustarProduzidoOp(...,'posto',...)`.
    É a única peça de verdade nova.
- **PENDÊNCIA OPERACIONAL — migrar o caso do TAWUS.**
  `scripts/migrar-retrabalho-para-op.js` converte o RT-26216-04-20260921 em
  `26216/04-RT1`, preserva setup/envase/pausa, **libera o bloqueio da Linha
  2** e marca o registro antigo como migrado. Idempotente, com backup e
  ensaio (sem `--apply` só simula). Lógica coberta por
  `run_retrabalho_migracao_test.js`. **Ainda NÃO foi executado contra
  produção** — escrita em produção não é liberada para mim nesta sessão.
  Até rodar, a Linha 2 continua recusando alocação.
- **Aviso ao Codex:** `form.html` levou o vínculo posto→OP e o script do
  módulo; `ops.html` levou o botão e o modal. `functions/retrabalhos.js`,
  `rearranjo_linhas.js` e o painel de execução continuam de pé — o caso
  antigo segue funcionando até migrar.
- **Arquivos ativos:** nenhum; entrega encerrada. 72 de 73 testes passando;
  o único que não roda é `run_retrabalhos_rules_test.js` (emulador 9023).

- **Entrega publicada — gestão de retrabalhos (2026-09-22).** O usuário pediu
  para eu corrigir a entrega anterior: *"não ficou bom... não deu pra
  acompanhar bem"*. Dois defeitos concretos, os dois corrigidos:
  1. **O botão "Encerrar execução" sumia** quando havia apontamento com
     quantidade pendente, sem dizer por quê. Agora aparece DESABILITADO com
     o motivo ao lado. (Isso inverte a asserção da linha 13 de
     `run_retrabalhos_ui_test.js`, que eu atualizei com comentário — era a
     única forma de deixar a suíte verde e o comportamento certo.)
  2. **O caso morria em `aguardando_qualidade`:** não havia passo de
     avaliação. Nova ação `decidir` (liberado / nova etapa / reprovado) com
     responsável, análise e histórico. **"Nova etapa" reocupa a linha de
     verdade**, senão seria só um rótulo e o caso ficaria de novo sem saída.
  Nova tela **`public/retrabalhos.html`** (módulo `qualidade`, menu novo):
  KPIs, filtros, busca, linha do tempo do caso, conferência da quantidade
  pendente e a avaliação. `decidir` é REGISTRO — não mexe em estoque, lote
  nem RNC, como o `PLANO_GESTAO_RETRABALHOS.md` exige.
- **Aviso ao Codex — permissões.** `apontarRetrabalho` passou a aceitar o
  papel `qualidade` no gate do callable, **só** para decidir: quem separa as
  ações é `PODE_EXECUTAR` x `PODE_DECIDIR` em `functions/retrabalhos.js`.
  Qualidade continua sem poder apontar execução (coberto por teste).
  `form.html` levou **uma linha** — o `<script>` de `retrabalhos-gestao.js`,
  para o Apontamento e a tela nova dizerem a mesma frase.
- **O modelo completo do plano continua com você.** Não implementei caso x
  roteiro x ordens de fabricação/envase/rotulagem, postos nem unidades
  decimais. O que entreguei opéra sobre o `retrabalhos/{id}` que já existe.
- **Arquivos ativos:** nenhum; entrega encerrada. Testes novos:
  `run_retrabalhos_gestao_test.js`, `run_retrabalhos_decisao_test.js` e
  `run_retrabalhos_gestao_ui_test.js`. 68 de 69 passando — o único que não
  roda é `run_retrabalhos_rules_test.js`, que exige o emulador na 9023.

- **Entrega publicada — laudos do CQ em PDF (2026-09-21/22).** `0204133` e
  o commit desta entrega, os dois no `origin/main` e no Hosting por worktree
  limpo. Três pedidos do usuário:
  1. **Pesagem do CK-7 em aberto.** A tela dava um campo por caixa da
     amostragem √N+1 (4 ou 5). Mas √N+1 é a amostra de ASPECTO, sobre as
     CAIXAS; o Relatório de Análise pede "Análise de Peso: 32 amostras", que
     é outra coisa. Agora começa em 32 e a inspetora muda à vontade.
  2. **Relatório de Análise de PA em PDF**, com as 9 seções do modelo Word
     oficial, microbiológicas opcionais (sem elas sai a justificativa do
     álcool ≥ 60%) e responsável escolhido na hora de imprimir.
  3. **F0070 (MP) e F009 (embalagem)**, roteados pelo `tipo` do cadastro de
     Materiais: MPGR/MPES/MU → MP, EP/ES/ET → embalagem. Embalagem ganhou
     roteiro próprio (13 parâmetros do formulário + tabela dimensional em
     aberto) porque o que se analisa nela não é ensaio de laboratório.
  Novos: `public/shared/laudo-cq.js`, `laudo-cq.css`, `inspecao-embalagem.js`,
  `run_laudo_cq_test.js`. Os formulários foram lidos em
  `06. Laboratório/01. CQ` antes de escrever código — o layout é o do papel,
  o ganho é a origem do dado.
- **Aviso ao Codex — `utils.js` mudou.** `registrarLaudoQualidade` guarda
  três campos novos no laudo (`recebimentoCq`, `embalagem`, `resumoEmbalagem`).
  Nada existente mudou de forma. Vi o seu "não tocar Cadastro/CQ/utils.js" —
  combinado, mas estes 7 arquivos eram o escopo que reservei em `d3d6169`.
- **Aviso ao Codex — `run_retrabalhos_rules_test.js` exige o emulador na
  9023.** Ele é o único que não roda numa varredura comum (65 de 66 passam);
  quem for rodar a suíte inteira precisa subir o emulador antes.
- **Arquivos ativos:** nenhum; entrega encerrada.

- **Entrega publicada — impressão das fichas de OP (2026-09-21).** `cb9b6a4`
  no `origin/main`; Hosting por worktree limpo (4 arquivos públicos conferidos
  por HTTP, idênticos ao commit). Três achados
  do usuário, com PDF real das OPs 26253/07 e 26261/04 (22 folhas cada):
  (1) ensaio cadastrado por `minimo`/`maximo` saía com a coluna
  Especificação EM BRANCO na ficha físico-química — só `especificacaoTexto`
  era impresso; (2) 16 folhas EM BRANCO por impressão — `body
  *{visibility:hidden}` esconde mas não tira do fluxo, então o Chrome
  paginava a tela do app inteira por trás; (3) Ordem de Envase vazando pra
  uma 2ª folha. O bloco CSS de impressão, que era duplicado em
  emitir_op.html e ops.html, virou **`public/shared/fichas-op.css`**. O
  nome do PDF passou a ser `lote - cliente produto - sku`
  (`nomeArquivoFichasOP`/`imprimirComNome` em utils.js), padrão da OP em
  Excel que a fábrica já arquivava.
- **Correção em cima da entrega — `f5f1fb2`, publicado.** O primeiro
  conserto não bastou: no cadastro a coluna Especificação desses ensaios
  não está VAZIA, está escrita **"N/A"** — e "N/A" é um valor, então o
  texto vencia a faixa e a ficha continuava sem parâmetro. `textoEspecAusente`
  trata N/A, NA, N.A., "-" e vazio como ausência. A faixa também passou a
  imprimir o limite COMO ESTÁ no cadastro ("180g – 198g", não "180 – 198"):
  a unidade faz parte da especificação e sumia ao formatar pelo parseFloat;
  a comparação do laudo continua pelo número.
- **Aviso ao Codex — `avaliarEnsaio` mudou de comportamento.** Limite
  cadastrado com vírgula ("0,8") virava `parseFloat` = 0, não NaN: a faixa
  saía "≥ 0" e o laudo aprovava qualquer leitura. Agora `numeroEspec`
  troca a vírgula antes de converter, e o mesmo número vale pro laudo
  (qualidade.html) e pra ficha impressa. `run_inspecao_pa_test.js` e
  `run_inspecao_pa_ui_test.js` seguem passando.
- **Aviso ao Codex — `run_agenda_expedicao_ui_test.js` passa.** O timeout
  que registrei em 18/09 era falta de navegador do Playwright nesta
  máquina, não defeito: com `channel: 'chrome'` os 15 testes de UI passam.
  Vale baixar os navegadores (`npx playwright install`) antes de concluir
  que um teste de UI quebrou aqui.
- **Arquivos ativos:** nenhum; entrega encerrada. `compras.html` tem o
  MESMO defeito de folha em branco (`visibility:hidden` no bloco de
  impressão) — a correção pronta está em `public/shared/fichas-op.css`;
  deixei registrado em `MELHORIAS_FUTURAS.md` por ser escopo do Codex, não
  mexi.
- **Sessão paralela:** enquanto isto rodava, a devolução ao endereço
  (`a7fadf3`) foi commitada e publicada por outra sessão minha. O worktree
  limpo desta entrega saiu de `cb9b6a4`, que já tem `a7fadf3` como
  ancestral — nada meio-pronto foi ao ar.

- **Entrega publicada — devolução da embalagem ao endereço (2026-09-21).**
  `a7fadf3` no `origin/main`; Hosting por worktree limpo (4 arquivos idênticos).
  Fluxo real confirmado pelo usuário: não há separação para o granel — o
  operador pega a embalagem inteira, item a item, e guarda de volta. A tela da
  MP ganhou "Guardar de volta" (confirma o endereço de origem ou escolhe outro,
  e aí `transferirLoteEndereco` move o lote); registro em
  `pesagem/devolucoes/{mp}`; dossiê mostra por MP.
- **Armadilha nova:** `firebase deploy | grep -m1` mata o deploy no meio
  (SIGPIPE) e ele sai sem publicar — o `cmp` contra produção pegou. Não filtre
  a saída do deploy com `-m1`.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — pesagem no celular + lote pelo FEFO (2026-09-18).**
  `47c2eb2` no `origin/main`; Hosting por worktree limpo (5 arquivos idênticos).
  `manipulacao.html`: três telas (lista na ordem da fórmula → MP → nova
  pesagem com foto primeiro). Plano FEFO congelado em `pesagem/planoLotes`;
  lote fora do FEFO exige `motivoForaFefo`. **`shared/utils.js` (reservado a
  mim):** `sugerirAlocacaoFefo` ganhou opções `loteInterno`/`separadoPara`
  (só ordenação, sem efeito quando ausentes) e `separarParcialLoteEndereco`
  grava `enderecoOrigemKey/Codigo`.
- **Aviso ao Codex:** `run_agenda_expedicao_ui_test.js` dá timeout também no
  HEAD anterior (`8afcf05`), sem as mudanças acima — falha pré-existente,
  provavelmente dependente de data. Não mexi.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — pesagem em parcelas + Dossiê do Lote (2026-09-18).**
  `a1f04f5` no `origin/main`; Hosting por worktree limpo (6 arquivos idênticos
  ao commit). Pesagem: cada ida à balança é parcela com peso/lote/foto em
  `ops/{lote}/manipulacao/pesagem/parcelas/{mp}`; soma automática, cancelamento
  com motivo (nunca apaga). Novo `dossie_lote.html` + `shared/dossie-lote.js`
  (só leitura): busca por lote/cliente/produto e junta OP, granel, apontamentos,
  paradas, perdas, consumo, paletes/laudos, conferência PA, RNC e linha do
  tempo. Acesso só PCP (`emitir_op`) e `qualidade` — `8a97177` tirou do operador.
  Testes: `run_dossie_lote_test.js` (novo), manipulação unit/UI e regressões.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — foto por matéria-prima na pesagem (2026-09-18).**
  `50d1b09` no `origin/main`; Hosting por worktree limpo (`manipulacao.html`,
  `qualidade.html`, `shared/manipulacao.js` idênticos ao commit). Cada MP exige
  foto própria em `ops/{lote}/manipulacao/pesagem/fotosItens/{item}`; ícone de
  câmera por linha; tabelas viram cartões abaixo de 700px. A foto geral
  (`pesagem/fotos`) deixou de valer. Testes de manipulação, anexos, CK-7,
  apontamento e transações aprovados.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — foto obrigatória da pesagem (2026-09-17).** `13f1142`
  no `origin/main`; Hosting + regras de Storage por worktree limpo às 23:19 BRT
  (`manipulacao.html`, `qualidade.html`, `shared/anexos.js`,
  `shared/manipulacao.js` idênticos ao commit). A pesagem do granel só fecha com
  foto (câmera do celular), guardada em Storage `/manipulacao/{lote}/` e
  registrada em `ops/{lote}/manipulacao/pesagem/fotos`; a Qualidade vê as fotos
  na análise do granel. Módulo novo `shared/anexos.js` (validação por perfil,
  caminho seguro, registro) para reaproveitar em RNC, calibração e COA.
  `storage.rules`: pasta `/manipulacao/{lote}` só imagem < 10 MB (Comercial
  intacto). Testes: `run_anexos_test.js`, `run_manipulacao_test.js`,
  `run_manipulacao_ui_test.js` + regressões.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — CK-7, inspeção de produto acabado (2026-09-17).**
  `457d010` no `origin/main`; Hosting + regras por worktree limpo às 19:35 BRT
  (`qualidade.html`, `shared/inspecao-pa.js`, `shared/utils.js` idênticos ao
  commit). A fila de PA usava o plano de GRANEL para liberar palete. Agora usa
  checklist próprio: seções com severidade, amostragem √N+1 das caixas, pesagem
  individual (média, mínimo, −3% INMETRO), retenção validade+1 ano e laudo
  externo. Crítico ou peso fora **bloqueiam** a liberação. Torque só com
  `parametros_pa/{sku}.torqueAtivo` (a Qualidade não usa torquímetro).
  `utils.js`: `registrarLaudoQualidade` passou a gravar `ck7`/`resumoCk7`.
  Nó novo `parametros_pa` com regra igual à de `nao_conformidades`.
  Testes: `run_inspecao_pa_test.js`, `run_inspecao_pa_ui_test.js` + regressões
  de recebimento/CQ, conferência PA, expedição, descarte e transações.
- **Entrega publicada — manipulação como fase do lote (2026-09-17).**
  `50b5e46` no `origin/main`; Hosting por worktree limpo às 20:58 BRT (6 arquivos
  idênticos ao commit). Lote da manipulação = lote da OP, então a fase vive em
  `ops/{lote}/manipulacao` (sem numeração nova). Tela nova `manipulacao.html`:
  pesagem (previsto × pesado, lote da MP, perda, justificativa fora de 2%),
  **conferência por outra pessoa** (quem pesou não confere; divergência trava),
  manipulação com tempos/perdas/rendimento, envio à Qualidade. Baixa de estoque
  na **pesagem**, com tipo `consumo_manipulacao` novo em `utils.js`. Qualidade
  ganhou a fila de granel (usa `especificacoes`, reprovar abre RNC). `form.html`:
  não aloca OP com granel não liberado (OP sem a fase segue livre) e não baixa a
  fórmula de novo quando a pesagem já baixou. Menu/acesso: `manipulacao.html` no
  módulo `apontamento`. Testes: `run_manipulacao_test.js`,
  `run_manipulacao_ui_test.js` (3 telas, 3 usuários) + regressões de apontamento,
  CQ, conferência PA e transações.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — Calendário de agendamentos na Logística (2026-09-17).**
  Aba **Calendário** em `logistica.html` + motor `shared/calendario-logistica.js`
  (Hosting, worktree limpo, arquivos idênticos ao commit). Junta entradas de PC
  (`agendamento`; `dataPrevistaEntrega` como PREVISTO) e saídas de PA
  (`agendamentos_expedicao`, inclusive `EXPEDIDO_PARCIAL`); mês/semana/lista no
  celular; detalhe chama `openModalAgendar`/`openModalReceber` e
  `expedicao.html?agenda=`. Só leitura. Testes `run_calendario_logistica_test.js`
  e `run_calendario_logistica_ui_test.js`; `run_rotas_pc_test.js` OK.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — faturamento e carga parcial na Expedição de PA
  (2026-09-17).** `511edd8` no `origin/main`; por worktree limpo às 00:36 BRT:
  Hosting (`expedicao.html`, `shared/expedicao-grade-tela.js`,
  `shared/agenda-pa-tela.js`, `gestao_comercial.html` idênticos ao commit) +
  Functions `faturamentoCargaPA` (nova), `onSolicitacaoFaturamentoPA` (nova),
  `confirmarExpedicaoPA` e `salvarAgendamentoExpedicaoPA` (atualizadas).
  **Para o Codex:** a agenda ganhou o estado `EXPEDIDO_PARCIAL` (ativa, saldo
  reservado), `paletes[i].embarcado`, `viagens/vN`, `expedicoes/{carga}`,
  `aguardandoEmbarqueDesde` e `faturamento` (`SOLICITADO`/`FATURADO`,
  `solicitacoes/{id}` com e-mail, `nfs/{id}`). `confirmarExpedicaoPA` aceita
  `paletes[].carregar` = `{modo: INTEIRO|PARCIAL|NAO_CARREGADO, caixas,
  caixaParcial}` só em carga agendada; sem `carregar` o comportamento é o de
  antes. A carga (`expedicoes_comerciais`) ganhou `viagem`, `complementar`,
  `naoCarregados` e itens com `parcial`/`saldoRestante`; NF da agenda vale para
  todas as viagens e `valorFaturado` só entra na 1ª. E-mail em
  `config/emailFinanceiro` (vazio = não envia), cópia `config/emailDiretoria`.
  Testes novos `run_carga_parcial_test.js` e `run_carga_parcial_ui_test.js`;
  regressões de expedição/agenda/grade/legado/peso/chave/transações OK.
  **Aviso:** `run_agenda_expedicao_ui_test.js` já estourava tempo no commit
  anterior (`56bac03`, conferido em worktree limpo): o callable simulado demora
  mais que a espera; com 3 s de pausa passa inteiro com este código.
- **Arquivos ativos:** nenhum.

- **Operação de dados — importação da pasta 02. Comercial (2026-09-17).**
  Sem código. 751 caminhos planos, cópia antes em
  `../backups/2026-09-17_importacao_comercial/`, teste em 1 registro e
  conferência profunda 751/751. `precos_venda`: 110 SKUs / 116 vigências
  (id `imp_AAAAMMDD`, `origem: IMPORTACAO_PASTA_COMERCIAL`, motivo com o
  arquivo). 17 pedidos comerciais completados só em campo vazio (preço dos
  itens + linha do PCP, nº do cliente, condição, % NF, frete) com marca
  `importacaoComercial`; pedido 0006 e itens suspeitos (pedidos 10 e 24) fora.
  `clientes/*/condicaoPagamento` em 8 clientes que estavam vazios. Nenhuma
  versão nem e-mail gerado. Cobertura de preço da carteira: 8% -> 77%.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — Gestão Comercial (2026-09-16).** Três commits, todos
  por worktree limpo: `bca729a` (22:25, Hosting + RTDB: tela
  `gestao_comercial.html` no módulo comercial, motor
  `shared/gestao-comercial.js`, nó `precos_venda` com vigência), `b4023a5`
  (22:35, Hosting: edição de pedido com versão/travas,
  `shared/pedido-edicao.js`), `ae20f67` (22:45, Hosting + Functions
  **só** `onPedidoComercialCriado` e `onPedidoComercialVersao`: PDF pdfkit por
  e-mail à diretoria; `sendMailViaGraph` ganhou anexos, demais Functions não
  foram republicadas). Destinatários em `config/emailDiretoria` (vazio =
  não envia). Testes: `run_gestao_comercial_test.js`,
  `run_gestao_comercial_ui_test.js`, `run_pedido_edicao_test.js`,
  `run_pedido_diretoria_test.js`.
- **Correção publicada em `public/comercial.html`:** data de hoje no fuso
  local (após 21h saía o dia seguinte) e Documentos do mais novo ao mais
  antigo. Hosting por worktree limpo; regressões de cliente comercial e
  contatos aprovadas.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — transferência de OP entre pedidos (2026-09-16).**
  `b282582` no `origin/main`; Hosting por worktree limpo às 18:32 BRT
  (`ops.html`, `pedidos.html`, `shared/transferencia-op.js` idênticos ao
  commit). O lápis da OP virou transferência: move `skuPedidoKey`, produzido
  pelos `apontamentosAplicados` do lote (ou envase da OP se anterior ao
  registro), paletes com saldo (inclusive `skuPedidoKeyOrigem` do legado),
  programação futura do lote e alocações; id idempotente, retomável
  (`ops/{op}/transferenciasPedido`, `pedidos/{k}/transferenciasOP`).
  `pedidos.html`: salvar não apaga mais campos fora do formulário, quantidade
  reflete em `pedidos_comerciais`, excluir item com OP bloqueado. Testes:
  `run_transferencia_op_test.js`, `run_transferencia_op_ui_test.js` + regressões
  de conciliação/expedição/transações. **Nenhum dado alterado** — a conciliação
  Miss Rose/Wike Make/Habibi aguarda o usuário digitar os pedidos novos.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — pedidos sem divergência de acento (2026-09-16).**
  `8390907` no `origin/main`; Hosting por worktree limpo às 15:33 BRT
  (`pedidos.html` idêntico ao commit). Agrupar por cliente/linha usa
  `normalizeSearch` como chave ("Briá"/"Bria", "Miss Rose"/"Miss Rôse" num grupo
  só, título = grafia mais usada); as duas buscas da tela ignoram acento. Só
  exibição — os nomes gravados nos pedidos não foram alterados.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — uso e consumo sem cliente/pedido (2026-09-15).**
  `ed29f4b` no `origin/main`; por worktree limpo às 16:27 BRT: Hosting (5
  arquivos idênticos ao commit) + as três Functions de recebimento.
  **Caso real do usuário:** PC-0003 é etiqueta térmica (ET-00064) de uso e
  consumo, sem cliente nem pedido de venda. Item de **compra da Kuryos** pode ter
  destino geral (`vinculo = {geral: true}`, opção "Sem cliente — uso e consumo /
  estoque geral" no seletor de cliente); lote nasce da Kuryos com
  `destino.geral`. **Remessa recusa** esse destino (navegador e servidor).
  API nova: `vinculoGeral`, `vinculoAceito(v, tipoDono)`.
  **⚠ Codex:** `public/logistica.html` recebeu mais 3 linhas na exibição do
  destino do recebimento; commit só com o meu hunk, sua linha do `<head>` segue
  intacta e sem commit.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — remessa é do cliente por padrão (2026-09-15).**
  `22a901a` no `origin/main`; por worktree limpo às 15:21 BRT: Hosting
  (`compras.html`, `manual_compras.html`, `shared/propriedade-estoque.js`
  idênticos ao commit) + as três Functions de recebimento.
  **Decisão do usuário:** compra é sempre da Kuryos — cliente/pedido é só
  vínculo, e material de uso geral (álcool, glicerina, uso e consumo) atende
  qualquer cliente; **remessa é do cliente** ("quase 100% das vezes").
  Remessa de terceiro deixou de pedir escolha: nasce CLIENTE
  (`proprietarioPadraoDaNatureza`), Kuryos só como exceção gravada em Compras.
  A trava do dono vale só com escolha gravada + recebimento. **Descartado:**
  o destino "Estoque geral sem cliente" proposto nesta sessão — o usuário
  prefere vincular a um pedido e manter o estoque da Kuryos.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — propriedade do estoque por cliente (2026-09-15).**
  `6fd8285` no `origin/main`; por **worktree limpo** às 15:01 BRT: Hosting (11
  arquivos, SHA256 idênticos ao commit) + Functions `registrarRecebimento`,
  `cancelarRecebimento`, `registrarDevolucaoRecebimento` (sem login 401;
  `contatos-cliente.js` segue 404).
  **Regras do usuário:** o cadastro do material é amplo, então o dono vem do PC.
  Compra da Kuryos = Kuryos (estoque geral, serve a qualquer OP, mesmo comprada
  para pedido de outro cliente); remessa do cliente = cliente (só produtos/
  pedidos/demandas dele); remessa de terceiro = Compras escolhe. Cliente e
  pedido(s) por item, obrigatórios, vários pedidos. Estoque com duas vistas:
  propriedade do cliente × destinado ao cliente (posse Kuryos).
  **Onde:** `shared/propriedade-estoque.js` (puro; `functions/propriedade_estoque.js`
  é cópia byte a byte, o teste falha se divergirem). PC ganha `propriedade` e
  `itens/{i}/vinculo`; lote ganha `propriedade`/`destino`; agregado ganha
  `estoque/{m}/porCliente/{c}/saldoAtual` (`saldoAtual` segue total físico).
  Recebimento no servidor **recusa PC sem dono/vínculo**; cancelamento e
  devolução desfazem na parte do cliente. Apontamento (consumo e perda), FEFO,
  separação guiada, Insumos por Pedido/Solicitar Compra e MRP respeitam o dono.
  `separarParcialLoteEndereco` passou a copiar dono, destino e `loteInterno`
  (antes separar uma válvula de cliente a tornava da Kuryos).
  **Ensaio na base:** 364 linhas de pedido e 80 OPs ativas resolvem cliente
  (pedido 26 via nome curto dos produtos). Os 4 PCs existentes estão sem
  vínculo — PC-0003, PC-0005 e o saldo do PC-0004 ficam **bloqueados no
  recebimento** até Compras preencher 🔗 Cliente/pedido.
  **Testes:** `run_propriedade_estoque_test.js` (22, inclui o `index.js` real) e
  `run_propriedade_estoque_ui_test.js` (9); suíte 39/39. Adiados em
  `MELHORIAS_FUTURAS.md` (MRP ignora data da remessa, empenho sem dono, mapa sem
  filtro, devolução ao cliente).
- **⚠ Codex — três toques em arquivos seus:** (1) `public/logistica.html`: só
  exibição de dono/destino e trava no modal de recebimento; commit com **apenas
  os meus 5 hunks** (`git apply --cached`), sua linha de `contatos-cliente` no
  `<head>` segue sem commit e intacta. (2) `run_apontamento_encerramento_test.js`
  passou a carregar `clienteKeyDaOp` e o módulo real e confere que o consumo leva
  o cliente da OP — `baixarEstoqueConsumo` agora depende dele. (3) Republicar
  as três Functions de recebimento a partir de commit **anterior** a `6fd8285`
  tira a trava e grava lote sem dono.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — Histórico de apontamentos: início/término e visão
  condensada por OP (2026-09-15).** `bc904a0` no `origin/main`; Hosting por
  **worktree limpo** às 10:37 BRT (2 arquivos enviados; `historico.html`,
  `shared/historico-apontamentos.js` e `utils.js` SHA256 idênticos ao commit;
  `contatos-cliente.js` segue 404).
  **Causa do "só hora":** `loadRegistros` montava a linha campo a campo e nunca
  levava `periodoInicio/periodoFim`; `fmtRegistroRange` caía sempre na hora
  cheia + 1h. **Regras do usuário:** coluna com data e hora de início e de
  término; sem término = `?` (registro antigo), nunca presumido; editar início e
  término; condensar os apontamentos de cada OP para conferir; horas
  trabalhadas e un/h da OP.
  **Motor:** `shared/historico-apontamentos.js` (puro). Condensa por lote +
  setor; un/h só com a quantidade dos registros com horas conhecidas.
  Conferência: acumulado do checkpoint × soma até ele, total da OP × soma
  (soma maior = erro; menor = aviso, pode ser registro fora do período),
  sobreposição na mesma linha, apontamento > 12h, registros sem término.
  **Edição:** sem mexer nos campos não reescreve horário; com término grava
  período e recalcula `horasTrabalhadas` mantendo a pausa descontada; não
  deixa apagar término; registro fica no dia dele se o dia estiver no período.
  **Corrigido junto:** mudar a data na edição apagava período, horas, fonte e
  timestamp (nó novo só com os campos do modal); Por Pedido lia `horasUteis`
  (não existe) e mostrava a quantidade inteira como "/h"; aba Por OP não
  redesenhava ao Carregar.
  **Ensaio na base (482 registros, jun–set):** 35% sem término; 66 OP/setor
  com apontamento > 12h (retroativo de 24h/dia, linha aberta no fim de
  semana). **Pendente de autorização do usuário (dado):** 26219/03 tem +144
  e 26217/03 −144 (checkpoints 4.416 × 4.272 trocados) — não mexi.
  Testes: `run_historico_apontamentos_test.js` (20) e
  `run_historico_apontamentos_ui_test.js` (10, cai para o Edge se o Chromium
  do Playwright não estiver baixado). Suíte 35/35.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — e-mail ao PCP quando OP é encerrada (2026-09-15).**
  `8502d57` no `origin/main`; Function nova `onOpEncerrada` criada em
  `prod-kuryos` por worktree limpo (listada como
  `google.firebase.database.ref.v1.written`). Só Functions — sem Hosting/RTDB.
  **Regra:** transição de `ops/{op}/status` para "Aguardando Confirmação"
  (operador encerra ou `computeOpStatus` a ~95%) → um e-mail HTML via Graph a
  pcp@kuryos.com.br; `config/emailConfirmacaoOp` (lista ou texto com `,`/`;`)
  substitui, mas não há campo em `admin.html` ainda. Não usa
  `config.emailNotificacoes`. Traz produzido × planejado, justificativa e perdas
  do `fechamento_op` do dia e link para `ops.html`.
  **Histórico/dedupe:** `notificacoes_op_encerrada/{op}/{eventId}` reservado por
  transaction antes do envio → ENVIADO / IGNORADO (PCP confirmou antes) / ERRO.
  **Não verificado com e-mail real** — o primeiro encerramento de OP em produção
  é a prova; conferir o nó acima se o PCP disser que não chegou.
  **Teste:** `run_op_encerrada_email_test.js` carrega o `index.js` real com
  admin/functions/Graph simulados. Suíte 34/34.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — cancelamento de Pedido de Compra (2026-09-15).**
  `34d3aae` no `origin/main`; por worktree limpo às 10:17 BRT: Functions
  (`registrarRecebimento`, `cancelarRecebimento`,
  `registrarDevolucaoRecebimento`), regras RTDB e Hosting (`compras.html`,
  `shared/cancelamento-pc.js`, `manual_compras.html` e `estoque.html`
  idênticos ao commit; callable sem login 401).
  **Regras:** só admin cancela PC ABERTO/ENVIADO/RECEBIDO_PARCIAL; motivo
  obrigatório; PC vira CANCELADO (nunca apagado, nunca reaberto) com
  `cancelamento` {motivo, canceladoPor/Em, statusAnterior, saldoPorItem,
  solicitacoesReabertas}. Parcial cancela só o saldo. SC de origem pode voltar a
  APROVADA (só sem recebimento) com `reaberturaPorCancelamentoPC`. Filtro
  Cancelados/Todos na aba; faixa “PEDIDO CANCELADO — NÃO ATENDER” no documento;
  cancelado fora de preço/histórico/análise de fornecedor. Editar segue só em
  ABERTO; PC enviado errado = cancelar e emitir novo.
  **Travas:** `database.rules.json` `pedidos_compra/$pedidoKey/status` só
  entra/sai de CANCELADO com role admin; `statusPedidoApos(itens, deltas,
  statusAtual)` mantém CANCELADO em estorno/devolução. Logística e MRP não
  mudaram (já filtram ENVIADO/RECEBIDO_PARCIAL).
  **Validação:** `run_cancelamento_pc_test.js`; ensaio nos emuladores Auth +
  Database + Hosting com cópia dos 4 PCs de produção. **Atenção:** o emulador
  NÃO carrega `database.rules.json` no ns `prod-kuryos` que as telas usam (sobe
  aberto) — carregue com `PUT /.settings/rules.json?ns=prod-kuryos`, senão
  teste de permissão passa falso. Suíte 31/31.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — detalhe da posição em popup (2026-09-15).** `ff2d7c2`
  no `origin/main`; Hosting por worktree limpo, `estoque.html` idêntico ao
  commit. O conteúdo do palete abre em modal (X, clique fora, Esc) em vez de
  card no fim da tela. **Mudança que afeta todos os modais de `estoque.html`:**
  `.modal-bg` subiu de z-index 500 para **10000** — o menu lateral do
  `auth_check` (9999) cobria o lado esquerdo de todo popup no desktop. O seletor
  de endereço segue acima (10050). Se criar modal novo em outra tela, confira
  o mesmo conflito com o menu.
- **Registrado, fora do escopo:** no celular, `estoque.html` já tem 1.136 px de
  largura com popup fechado (barra de abas), igual na versão anterior.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — conteúdo da posição no mapa do WMS (2026-09-15).**
  `7ae4959` no `origin/main`; Hosting por worktree limpo, conferido
  (`estoque.html`, `shared/conteudo-posicao.js`, `shared/expedicao-grade.js`
  idênticos ao commit). Clique numa posição (Mapa por rua ou Planta baixa por
  nível) mostra resumo do palete (itens, quantidade por unidade, volumes, peso,
  situação) e linha a linha (lote, origem, volumes/composição, quantidade, peso
  com fonte, validade, status). Regras em `shared/conteudo-posicao.js`: PA pela
  composição e `ExpedicaoGrade.pesoPalete`; material com volumes do recebimento
  e peso por KG / L×densidade / `pesoUnitario` (gramas). Sem dado = desconhecido.
  `estoque.html` passou a carregar `shared/expedicao-grade.js`.
- **Correção junto:** `fmtData` de `estoque.html` exibia data pura um dia antes
  (UTC). **Mesmo defeito em cadastros, compras, formulas, logistica, qualidade
  e separacao_materiais** — aberto como tarefa separada; cadastros/logistica são
  arquivos ativos do Codex.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — seletor visual de endereço e Doca (2026-09-15).**
  `6518040` no `origin/main`; Hosting por **worktree limpo**, conferido
  (`estoque.html`, `logistica.html`, `shared/seletor-endereco.js`, `utils.js` e
  os dois manuais idênticos ao commit; `contatos-cliente.js` segue 404).
  **Fluxo (decisões do usuário):** recebimento entra na **Doca** (área `DOCA`,
  posição `DOC-1.1.1`, cadastrada pelo usuário); guardar a qualquer momento;
  PA pode ir de posição para a Doca para agilizar expedição; **uma posição = um
  palete, que pode ter mais de um produto** (ocupada não bloqueia, pede
  "Colocar no mesmo palete").
  **Componente:** `public/shared/seletor-endereco.js` — primeiro o local,
  depois o mapa rua × prédio × nível; campo com `<input hidden>` da classe que a
  tela já lê (`rc-endereco`, `cpa-endereco`). Endereço `legado` e dimensão >60
  ficam fora do mapa (o `HISTORICO` 999×999 travaria a tela). Entrou no
  recebimento (Logística, padrão Doca), Transferir (+ "Levar para a Doca"),
  formulário de Endereçamento, Conferência de PA e card **"Na Doca"** em
  Estoque › Endereçamento.
  **Regra mudada em `utils.js` (`registrarLaudoQualidade`):** a liberação
  **não grava mais `aguardandoEnderecoDefinitivo`**. "Aguardando guardar" = lote
  de material numa posição da área DOCA (calculado em `estoque.html`). A marca
  antiga segue respeitada e é limpa por `transferirLoteEndereco`.
- **⚠ Codex — efeito na sua regra de Expedição:** palete de PA liberado pela
  Qualidade **deixa de nascer bloqueado** em "Aguardando endereço definitivo
  ativo" (a marca não é mais gravada na liberação). O portão continua em
  `ExpedicaoPA.analisar` para marca antiga. E `logistica.html` (arquivo seu)
  recebeu o seletor e um listener de `estoque_lotes`; sua tag de scripts de
  contatos no `<head>` foi reaplicada por cima sem conflito (diff seu idêntico;
  suíte combinada 31/31).
- **Arquivos ativos:** nenhum.

- **Entrega publicada — Expedição: peso da carga, peso teórico e selecionar
  todos (2026-09-15).** `932aa88` no `origin/main`; Hosting por **worktree
  limpo** (`.claude/worktrees/expedicao-peso`, sobre `a007ec1`), conferido:
  `expedicao.html`, `shared/expedicao-grade-tela.js`, `shared/expedicao-grade.js`
  e `.css` SHA256 idênticos ao commit; `contatos-cliente.js` segue 404.
  **Peso:** colunas Kg/cx e Peso sempre visíveis. Fontes: peso real do palete
  (planilha) > `pesoPorCaixaKg` do palete > `produtos.kgCaixa`. Convenção da
  planilha: cada volume, inclusive a parcial, pesa uma caixa cheia. Sem kg/cx =
  desconhecido, nunca zero. Painel segue cliente/busca: liberado, aguardando
  Qualidade e **teórico** das OPs sem palete (mesmos critérios e corte de
  2026-09-10 da fila de `estoque.html`), com lista por OP.
  **Selecionar todos:** respeita as regras de carga do servidor (mesmo cliente,
  destino, CIF/FOB compatível, ≤100). API pura nova em `expedicao-grade.js`:
  `pesoPalete`, `pesoTeoricoOp`, `somaPeso`, `produtoDoSku`, `compativel`,
  `selecionarTodos`. `base` da grade ganhou `produtos`; `pronto()` passou a
  contar `Object.keys(base).length` em vez do 6 fixo.
  **Ensaio na base:** liberado 15 paletes / 6.768,6 kg; Qualidade 1 / 268,6 kg;
  13 OPs aguardando Conferência/PCP com ~644 kg e **9 sem peso** (faltam kg/cx
  no cadastro de GLMKAM01/02, BBSJBS05-2, PRF-AFEE-0023, KUBPBA02, PRF-PROP-0001;
  un/cx no PRF-AFEE-0018) — operação, não código.
- **⚠ Codex — integrei nos seus arquivos ativos `public/expedicao.html` e
  `public/shared/expedicao-grade-tela.js`.** O commit NÃO contém o seu contato
  do cliente na carga; na sua árvore, as suas mudanças foram **reaplicadas por
  cima** da versão nova (2 conflitos de linha vizinha, resolvidos somando: a
  linha `clientesContatos/contatoCargaUI` logo após `base`, e o
  `contatoCargaUI.carregar` antes do `selecaoResumo`). Conferido: seu diff nesses
  dois arquivos segue com exatamente as suas 8 linhas, os outros 14 arquivos
  intactos, e a suíte inteira (29, inclusive `run_contatos_cliente_test.js` e os
  testes de tela da Expedição com o seu código) passa. Backup dos seus dois
  arquivos originais: scratchpad da sessão Claude de 2026-09-15.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — CEP automático e endereços da Kuryos na rota do PC
  (2026-09-15).** `d3d1fd7` no `origin/main` (integrado sobre `ec6149b`, da
  sessão do Descarte); Hosting por **worktree limpo**, conferido
  (`compras.html`, `shared/rotas-pc.js`, `shared/utils.js` SHA256 idênticos ao
  commit; `contatos-cliente.js` segue 404).
  **O que mudou:** o editor de rota é o MESMO no PC direto (`pcd`) e no PC
  tradicional (`pcEdit`), então vale para os dois. (1) CEP com 8 dígitos
  preenche logradouro/bairro/cidade/UF via `buscarEnderecoPorCep`, nunca
  número/complemento. (2) Atalhos 🏭 Fábrica / 📦 Galpão em Origem e Destino;
  "Entregar em" do PC tradicional preenche o destino inteiro; PC gerado da
  cotação com local de entrega nasce com destino preenchido. Preencher nunca
  confirma: todo portão segue exigindo `statusConfirmacao === 'CONFIRMADA'`.
  (3) **Cadastro editável** em `config/locaisKuryos/{FABRICA|GALPAO}` (botão
  "Endereços da Kuryos" só para admin/pcp/módulo config, a regra de `/config`).
  Até alguém salvar, vale `RotasPC.LOCAIS_KURYOS_PADRAO`. **Nada gravado na base.**
  **API nova em `rotas-pc.js`:** `localKuryos(chave, cadastro)`,
  `CHAVES_LOCAIS_KURYOS`, `LOCAIS_KURYOS_PADRAO`; `rotaInicial` ganhou 3º
  parâmetro opcional `locaisKuryos`.
- **⚠ Codex — `logistica.html` não foi tocado**, mas a chamada de lá a
  `RotasPC.rotaInicial(p, null)` agora devolve destino preenchido quando o PC
  sem rota tem `localEntrega` GALPAO/FABRICA. Para usar o cadastro vivo,
  passe `allConfig.locaisKuryos` como 3º argumento.
- **A conferir com o usuário:** pelos Correios o nº 1130 da Rua Lagoa Tai
  Grande é CEP **08290-425** (Vila Carmosina); o **08290-500** informado é
  Itaquera, até o 548. CNPJ do Galpão não informado (vazio no padrão).
- **Arquivos ativos:** nenhum.

- **Entrega publicada — transaction abortando no null, lado cliente (2026-09-15).**
  `9f30bbd` no `origin/main`; Hosting por **worktree limpo** às 00:31 BRT
  (3 arquivos enviados; `shared/utils.js`, `compras.html`, `historico.html`,
  `descarte.html` SHA256 idênticos ao commit).
  **Causa:** mesmo defeito de `019cb52`, agora no cliente — callback de
  `.transaction()` devolvendo `undefined` quando a 1ª passada (cache local)
  vem null aborta sem consultar o servidor. **Pontos:** Descarte
  (solicitar, desfazer, confirmar), `ajustarProduzidoOp`, Compras (aprovar,
  rejeitar, convite na cotação, reserva CONSOLIDADA ×2) e
  `historico.html adjustPedidoProduzido`. **Alcance:** mascarado em produção
  — as quatro telas mantêm listener na raiz do nó. Medido com SDK web compat
  10.7.0 no emulador: código antigo com cache frio reproduz "Não foi possível
  confirmar a saída deste lote."; com cache quente passa; código novo passa
  nos dois e reporta "Lote não encontrado" sem gravar nada.
  **Regra para quem escrever transaction:** `if (!atual) return atual;` antes
  da regra de negócio; nó inexistente se detecta por `snapshot.exists()` /
  valor final; zere variáveis de fechamento a cada passada.
  **Guarda:** `run_transacoes_null_test.js` agora varre `functions/`,
  `public/shared/` e `<script>` de `public/*.html` com parser de callback
  (43 callbacks, conferidos contra a contagem bruta) e ensaia as funções
  reais com fake fiel ao SDK. Suíte 25/25.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — Pedidos: colunas Expedido e Conferência (2026-09-15).**
  `f5974e2` no `origin/main`; Hosting por **worktree limpo**, conferido
  (`pedidos.html`, `shared/conciliacao-pedidos.js`, `shared/expedicao.js`
  SHA256 idênticos ao commit; `contatos-cliente.js` segue 404).
  **Conta:** Produzido = Expedido + Em estoque, nas tabelas SKUs e Pedidos
  Comerciais. **Regras do usuário:** só dois destinos; expedido tem motivo
  (de fato, furto, descarte); retrabalho e devolução voltam ao estoque; só
  exato é OK, exceto quando a Conferência de PA conciliou divergência (entra
  na conta); produzido sem registro fica cinza. No pedido comercial a
  situação é a do **pior item**.
  **Motor:** `public/shared/conciliacao-pedidos.js` (puro; depende de
  `shared/expedicao.js` para resolver a chave). Fontes: `pedidos.produzido`,
  `expedicoes_comerciais`, `estoque_lotes`, `solicitacoes_descarte`,
  `conferencias_pa`. **Não lê `pedidos/{k}/expedido`** (gravado pelo
  `confirmarExpedicaoPA`): conta pelas cargas, para não somar duas vezes.
  **Ensaio na base:** 358 pedidos, 101 OK, 163 com diferença, 66 sem registro;
  conservação exata das 3.094.141 un. Testes:
  `run_conciliacao_pedidos_test.js` e `run_pedidos_conciliacao_ui_test.js`
  (no worktree de deploy, rodar com `PLAYWRIGHT_MODULE` apontando para o
  `node_modules` do repo).
- **Pendente de autorização do usuário (dado):** OPs 26243/07 e 26244/11
  (HDR-MISS-0008, Midnight Honey) apontam para `23__HDR-MISS-0008`, que não
  existe; o item é do pedido **27** (produzido 2.071 = 260 + 1.811). Correção:
  `ops/{op}/skuPedidoKey = 27__HDR-MISS-0008` + reaplicar a carga do legado.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — caixa parcial dentro do palete no legado (2026-09-14).**
  `b0f7c72` no `origin/main`; Hosting (`relatorio_expedicao.html`) por
  **worktree limpo**, conferido idêntico ao commit. **Carga reaplicada em
  produção** com autorização explícita do usuário, primeiro só a OP 26244/16
  (conferida), depois o restante.
  **Causa:** a aba EXPEDIÇÃO registra a parcial como linha própria ("1 cx × 10"),
  e o importador fazia um palete por linha. Paletes da Conferência de PA já
  nascem certos; era só o legado.
  **Regra (decidida pelo usuário):** parcial = 1 cx com múltiplo menor que o da
  OP; vai para o palete da mesma OP com mesmo status/data/NF, o de **menos
  caixas**; sem candidato, linha própria com `caixaParcialAvulsa`. Vale para
  estoque e histórico.
  **Conferido em produção após a carga:** paletes legado 26 → 21, linhas de
  histórico 1.722 → 1.422, **unidades idênticas** por OP e por carga, zero
  composição inválida no estoque; Expedição com as mesmas 20.818 un disponíveis
  (15 paletes, 4 com parcial); lotes não legado e cargas do fluxo novo
  **intocados** (comparação byte a byte com o backup).
  **Relatório:** a parcial conta como 1 caixa (senão cairia de 67.125 para
  66.796 caixas). `run_relatorio_caixa_parcial_test.js` novo.
  **Importador:** remove o registro próprio que a carga anterior criou para a
  parcial, preserva palete legado já mexido no sistema e grava
  `rollback.json` com o **valor anterior** de cada caminho (backup real).
- **Arquivos ativos:** nenhum.

- **Entrega publicada — chave do pedido com/sem zero na Expedição + un/cx na
  Conferência de PA (2026-09-14).** `35242a8` no `origin/main`; Hosting +
  `confirmarExpedicaoPA` + `salvarAgendamentoExpedicaoPA` no `prod-kuryos` por
  **worktree limpo** (`Documents/Codex/deploy-chave-pedido-35242a8`). Conferido
  no ar: `shared/expedicao.js` e `estoque.html` HTTP 200 e **SHA256 idêntico ao
  commit**; callables 401 sem login; `shared/contatos-cliente.js` segue **404**
  (nada do Codex subiu).
- **Chave do pedido:** `/pedidos` tem **os dois formatos de verdade** — 174 OPs
  gravam `17__X` para pedido que existe como `0017__X`, e 17 pedidos reais
  existem só sem zero, sem gêmeo. Por isso **não migrar as OPs "pondo zero"**.
  `ExpedicaoPA.analisar` agora resolve a chave contra o que existe
  (`resolverChavePedido`: exata, senão a única equivalente; ambíguo não escolhe)
  e compara vínculo com `normalizarChavePedido` (ignora só o zero; número/SKU
  diferente segue bloqueando). Ambas exportadas — use-as para qualquer junção
  pedido×OP×expedição.
  **Ensaio na base (27 paletes):** nenhum motivo mudou, 19 disponíveis seguem
  19; só a 26251/15 passou a resolver a chave (estava armada para cair em
  "Pedido de origem ausente" quando a Qualidade liberasse). Com as OPs
  migradas: regra antiga 0 disponíveis, nova 19.
- **Un/cx na Conferência de PA:** campo segue digitado, **sem pré-preencher**
  (decisão do usuário: formato de caixa muda sem o cadastro). Mostra o `unCx`
  do produto, fica vermelho ao divergir e salvar pede confirmação indicando
  ajustar o cadastro; a contagem grava `unidadesPorCaixaCadastro` e
  `formatoCaixaDivergente`. O consenso compara só `total`.
- **Estado das conferências abertas:** 26251/15 **finalizou** às 22h20 de
  14/09 (RNC −1, palete `pa_26251-15_p1` em quarentena). **26247/06 precisa de
  recontagem física**: contada com 48 un/cx, cadastro e as 10 OPs irmãs são de
  24 (2.618 × 1.661 apontados); não mexi no dado.
- **⚠ Codex — mexi em `public/shared/expedicao.js` e
  `functions/expedicao_regras.js`** (base da sua grade). Aditivo: a chave
  devolvida por `analisar` agora é a **resolvida**; grade, agenda e callable
  comparam `skuPedidoKey` entre duas chamadas da mesma regra, então seguem
  consistentes. Republicar `confirmarExpedicaoPA`/`salvarAgendamentoExpedicaoPA`
  a partir de um commit **anterior** a `35242a8` desfaz a correção.
  `run_expedicao_chave_pedido_test.js` e `run_conferencia_pa_uncx_test.js`
  novos; os 23 testes do repo passam.
- **Arquivos ativos:** nenhum.

- **⚠⚠ Correção publicada — a Conferência de PA NUNCA conseguiu finalizar
  (2026-09-14).** `019cb52` no `origin/main`; `finalizarConferenciaPA`
  republicada no `prod-kuryos` por worktree limpo. Callable no ar responde 401
  sem login, como esperado.
  **Sintoma:** "Outra sessão já está finalizando esta OP" na conciliação, com a
  base **sem lock nenhum** (`finalizacaoStatus`, `finalizandoEm` e
  `finalizacaoToken` ausentes nas duas conferências).
  **Causa:** `if (!atual) return;` dentro do `confRef.transaction`
  (`functions/index.js`). O SDK chama o callback com o **cache local** primeiro
  e, depois do `.once()` do `lerContexto`, o cache já esfriou — a primeira
  passada vem `null`. Devolver `undefined` **aborta a transação** sem nunca
  falar com o servidor, e o código caía no `!lock.committed`.
  **Medido no emulador** (firebase-admin 12.7.0, mesmo padrão `.once()` +
  `.transaction()`): `return;` → passadas `[null]`, `committed=false`;
  `return atual;` → passadas `[null, dado]`, `committed=true`.
  Era **determinístico**: explica `estoque_lotes` não ter um único palete de
  produto acabado desde o deploy do fluxo em 2026-09-10.
- **A regra, para não repetir:** transação do RTDB devolve **o próprio valor**
  (`return atual;`), nunca `return;`. As outras três transações do
  `functions/index.js` (linhas 25, 55 e 1793) já faziam certo — foi deslize
  isolado de uma linha. `run_transacoes_null_test.js` novo **varre todas as
  transações de `functions/`** atrás do mesmo padrão, além de provar a
  semântica num fake fiel ao SDK e travar o site específico.
- **Buraco de cobertura que permitiu isso:** `run_conferencia_pa_server_test.js`
  só exercita as funções puras de `functions/conferencia_pa.js`. A transação e
  o lock, que vivem no `functions/index.js`, não tinham teste nenhum.
- **Também corrigido:** nó inexistente deixou de ser reportado como disputa de
  sessão; agora responde "Não há Conferência de PA registrada para esta OP".
- **Ainda aberto, agora do lado da operação:** 26247/06 está em
  `DIVERGENCIA_RECONTAGEM` com 1 contagem (a regra pede três) e 26251/15 em
  `AGUARDANDO_CONCILIACAO` com 3 contagens sem consenso. Com a correção no ar,
  a conciliação deve concluir.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — Relatório de Expedição (2026-09-14).** `c24fce8` no
  `origin/main` e no Hosting `prod-kuryos`, por **worktree limpo**
  (`Documents/Codex/deploy-relatorio-c24fce8`). Conferido no ar:
  `relatorio_expedicao.html` e `auth_check.js` HTTP 200 e **SHA256 idêntico ao
  commit**.
  Tela nova `public/relatorio_expedicao.html`, no menu de Logística e no mesmo
  módulo de acesso. **Deliberadamente fora de `expedicao.html`:** Expedição é
  operação (montar carga), isto é consulta — e aquele arquivo é do Codex.
  **O grão é o ITEM de uma carga**, não a carga: é como a pergunta é feita
  ("o que saiu do item X para o cliente Y") e é o mesmo grão da planilha que o
  PCP usa para conferir OP e pedido.
  Filtros que se cruzam: período, cliente e item por seleção múltipla,
  situação, transportadora, pedido, OP/lote, NF e busca livre sem acento.
  Agrupamento por cliente, item, mês, pedido, OP, transportadora ou situação.
  Totais do recorte, gráfico de barras por mês em **SVG puro** (o sistema não
  carrega biblioteca de fora) e exportação CSV com `;` e vírgula decimal, que
  o Excel pt-BR abre direto.
- **Medido contra a base real:** 1.722 linhas, 3.063.149 unidades, 67.125
  caixas, 587 t, 28 clientes, 166 itens, de 25/04/2025 a 11/09/2026.
- **Correções junto:** peso passou a ir também para o histórico (antes só no
  palete em estoque), rótulos de situação ganharam acento, e data inválida
  (`-`/vazio da planilha) deixou de ser tratada como data — virava o início do
  período e entrava nas comparações de de/até. Carga reaplicada; **idempotente**,
  segue em 26 paletes e 338 cargas.
- **Validação:** `run_relatorio_expedicao_test.js` novo (playwright) cobre o
  caso do usuário ponta a ponta, peso derivado de kg/caixa, agrupamento,
  ordenação, CSV filtrado com BOM, busca sem acento e celular. **Os 21 testes
  do repo passam.**
- **Arquivos ativos:** nenhum. Só `public/auth_check.js` foi tocado fora da
  tela nova (uma linha no menu e a página no módulo `logistica`).

- **Entrega publicada — Expedição: histórico e estoque legado da planilha (2026-09-14).**
  `31674b6` no `origin/main`; Hosting + `confirmarExpedicaoPA` +
  `salvarAgendamentoExpedicaoPA` publicados no `prod-kuryos` por **worktree
  limpo** (`Documents/Codex/deploy-legado-31674b6`).
  **Carga de dados já aplicada em produção:** 26 paletes legado, 338 cargas de
  histórico e o endereço `HISTORICO`. Na grade: **19 paletes disponíveis,
  20.818 unidades** (MISS ROSE e Glow Make Up); 7 pendentes com motivo à vista.
- **Regra nova:** `ExpedicaoPA.analisar` aceita `origemTipo: 'legado_planilha'`
  com `legado: true` e dispensa **apenas** dois portões — liberação/laudo da
  Qualidade e Conferência de PA finalizada. Eles nunca existiram no sistema, e
  exigi-los obrigaria a **forjar** registro de Qualidade na importação. Todos os
  outros portões seguem valendo. Status novo `LEGADO_ESTOQUE` (cinza, não o
  verde de "liberado pela Qualidade") e identificador com prefixo `LEG-`.
- **⚠ `functions/expedicao_regras.js` é cópia byte a byte de
  `public/shared/expedicao.js`** e `run_expedicao_test.js` falha se divergirem.
  Mudou um, copie no outro e **redeploy das Functions** — senão a UI libera o
  palete e o callable recusa. Foi exatamente o que o teste pegou aqui.
- **⚠ Achado que vale para o sistema todo, não só para isto:** o `skuPedidoKey`
  gravado nas OPs usa o número do pedido **sem zero à esquerda**
  (`19__GLMKAM04`) e `/pedidos` guarda **com** (`0019__GLMKAM04`). Só essa
  diferença deixava **66 vínculos OP→pedido órfãos**; normalizar recupera 51
  deles e leva a cobertura de 81,2% para **95,7%**. Não migrei o nó `ops` — é
  dado do PCP e fora do escopo pedido —, mas **a migração vale a pena** e
  destravaria vínculo em outras telas. O palete legado contorna gravando a
  chave reconstruída em `skuPedidoKey` e a crua em `skuPedidoKeyOrigem`, que é
  o campo que o portão de "vínculo mudou" passa a comparar.
- **Importador:** `scripts/importar_expedicao_legado.py`, **simulação por
  padrão** (`--aplicar` grava). Chaves determinísticas por hash do conteúdo da
  linha, não da posição — o usuário vai **repetir a carga** com dados mais
  novos, e reordenar a planilha não pode duplicar. Gera `payload.json`,
  `rollback.json` e `relatorio.csv` em `importacao_legado/` (gitignored).
  **Pula palete de OP com conferência em andamento**: `conferencia_pa.js:102`
  bloqueia a finalização se já existirem paletes da OP no WMS, então importar
  travaria a conferência de vez (foi o caso da 26247/06).
- **Ainda pendente do lado do PCP, aparece na grade com o motivo:** 26244/11
  (pedido `23__HDR-MISS-0008` não existe em `/pedidos`); 26247/03, 26251/08 e
  26253/03 (OPs em `Aguardando Confirmação`).
- **Validação:** `run_expedicao_legado_test.js` novo — a dispensa não vaza para
  quem só finge ser legado, e todos os outros portões seguem bloqueando.
  **Os 20 testes do repo passam**, inclusive os dois de UI com playwright
  (que não estava instalado nesta máquina; instalei).
- **⚠ Operacional:** a CLI avisou que o **runtime Node.js 20 das Functions foi
  descontinuado em 2026-04-30 e será desativado em 2026-10-30**. Depois disso
  não dá mais deploy sem atualizar.
- **⚠ Codex — mexi em `public/shared/expedicao.js` e
  `functions/expedicao_regras.js`**, que são a base da sua grade de Expedição.
  A mudança é aditiva (uma origem nova); `run_expedicao_test.js`,
  `run_expedicao_grade_test.js`, `run_expedicao_ui_test.js` e
  `run_agenda_expedicao_ui_test.js` passam. Seus 16 arquivos continuam
  intactos e sem commit; `shared/contatos-cliente.js` segue **HTTP 404**.
- **Arquivos ativos:** nenhum.

- **Entrega publicada — Recebimento alinhado ao formulário de entrada (2026-09-14).**
  `701ad16` no `origin/main` e no Hosting `prod-kuryos`, por **worktree limpo**
  (`Documents/Codex/deploy-recebimento-701ad16`). Fonte da verdade: o
  **Formulário de entrada de materiais** em `forms.cloud.microsoft/r/HDwua0LnV1`,
  lido nesta sessão. Das 14 perguntas, **13 já existiam** na tela e as escalas
  1–5 batem com as estrelas do Forms. Faltavam duas:
  (1) **Fornecedor** (pergunta 7) não era campo — só texto no cabeçalho do
  modal. Virou campo travado, do Pedido de Compra. O dado já ia no payload
  (`fornecedorKey`/`fornecedorNome`); quem preenchia é que não via.
  (2) **Quantidade de amostragem** (pergunta 10) era digitada. Agora é
  **`√(quantidade recebida do lote) + 1`, arredondado para cima**, campo
  travado — decisão do usuário: a regra vale sempre, ninguém digita. A dica
  abaixo do campo mostra a conta e como destrinchar a coleta entre os volumes
  daquele lote.
- **Detalhe que importa se alguém mexer:** o valor gravado é **recalculado** em
  `lerItensRecebimentoDaTela` (`qtdAmostragem: amostragemDoLote(qtd)`), não lido
  do input. O campo é só espelho — DOM desatualizado não vira número errado na
  fila da Qualidade.
- **Validação:** `run_recebimento_amostragem_test.js` (fórmula com quadrados
  perfeitos sem arredondar a mais, monotonicidade até 3000, quantidade
  fracionada, zero/negativo/lixo; paridade com as 14 perguntas; gatilhos de
  recálculo); regressões `run_recebimento_qualidade_test.js`,
  `run_lote_interno_test.js`, `run_rotas_pc_test.js`, `run_descarte_test.js`,
  `run_conferencia_pa_test.js` e `run_cotacao_texto_test.js` aprovadas.
- **Verificação no ar (2026-09-14):** `logistica.html` HTTP 200 e **SHA256
  idêntico ao commit**; `rcFornecedor` e `amostragemDoLote` presentes.
- **⚠ Codex — `public/logistica.html` é arquivo ativo seu e eu editei.** Só a
  região do modal de recebimento; o commit levou **apenas os meus 6 hunks**
  (`git apply --cached` de patch filtrado). **Sua tag de script de
  `contatos-cliente` no `<head>` continua sem commit na árvore de trabalho** e
  não subiu: `shared/contatos-cliente.js` segue **HTTP 404** no ar e a
  `logistica.html` publicada não tem a referência. Se você commitar o arquivo
  inteiro agora, leva junto o recebimento já publicado — sem problema, é o
  mesmo conteúdo.
- **Arquivos ativos:** nenhum. `public/logistica.html` devolvido.

- **Entrega publicada — Cotação: copiar texto e incluir fornecedor (2026-09-14).**
  `885bbc0` no `origin/main` e no Hosting `prod-kuryos`, por **worktree limpo**
  (`Documents/Codex/deploy-cotacao-texto-885bbc0`). Só `public/compras.html` e
  `run_cotacao_texto_test.js` entraram no commit.
  (1) Cada convidado ganhou **"📋 Copiar texto"** no cabeçalho da proposta, na
  aba Cotações — o botão da aba Solicitações sumia justamente quando o convite
  já existia. O texto sai **só com os materiais do escopo do convidado** e **não
  leva código nem descrição interna da Kuryos**: usa `codigoFornecedor` /
  `nomeComercial` da homologação (`materiais/{k}/fornecedores/{fKey}`) quando
  existem; senão, descrição + `especificacoesTecnicas`. Convite por similar
  resolve a nomenclatura pelo similar.
  (2) **`＋ Fornecedor` tinha beco sem saída:** a lista só mostrava homologados
  do material/similar e o CNPJ recusava quem já estava cadastrado ("use o
  fornecedor cadastrado acima" — que não estava acima). Fornecedor cadastrado
  depois da cotação aberta, ou não homologado para a MP, não tinha caminho.
  Agora há a seção "Outros fornecedores da base" (busca na base inteira,
  inclusão marcada fora da homologação) e o CNPJ já cadastrado inclui o
  fornecedor da base.
- **⚠ Compatibilidade que quase passou batido, vale para quem mexer em cotação:**
  o escopo de um convidado é `escopoDoConvidado` (`public/shared/utils.js:4098`),
  **não** `convidado.itens` direto — convidado sem o campo vem de cotação
  anterior ao escopo por item e cota o **processo inteiro**. Ler o campo direto
  fazia as duas cotações hoje abertas mostrarem o botão e copiarem vazio. Pela
  mesma raiz, `gravarFornecedorNaCotacao` passou a **materializar** o escopo do
  convidado legado antes de somar itens novos: sem isso, ampliar o convite de um
  fornecedor antigo o **encolhia** de "todos os materiais" para os poucos
  marcados na hora. Esse segundo defeito já existia antes desta sessão.
- **Validação:** `run_cotacao_texto_test.js` (carrega o `escopoDoConvidado` real
  do `utils.js` — copiar a regra no teste esconderia a divergência); regressões
  `run_rotas_pc_test.js`, `run_recebimento_qualidade_test.js`,
  `run_lote_interno_test.js`, `run_descarte_test.js` e
  `run_conferencia_pa_test.js` aprovadas; sintaxe dos scripts inline e
  `git diff --check` limpos.
- **Verificação no ar (2026-09-14):** `compras.html` HTTP 200 e **SHA256 idêntico
  ao commit**; `cot-copiar-texto` e `caf-add-fora` presentes; zero ocorrência da
  recusa de CNPJ. Firebase reportou `uploading new files [0/1]` — um arquivo só.
- **⚠ Codex — seu trabalho NÃO subiu junto, de novo por worktree destacado.**
  `shared/contatos-cliente.js` e `contatos-cliente-ui.js` respondem **HTTP 404**
  no ar; `cadastros.html`, `comercial.html`, `expedicao.html` e `logistica.html`
  seguem HTTP 200 na versão anterior. Seus 12 modificados e 4 novos continuam
  intactos e sem commit na árvore de trabalho — não toquei em nenhum.
- **Arquivos ativos:** nenhum. `public/compras.html` liberado.

- **Escopo atual — Controladoria/Custos (arquitetura, 2026-09-14).** Sessão de
  desenho, nada implementado. Decisões em `PLANO_CUSTOS.md`, reescrito depois de
  **medir a base de produção** (4 sondas somente-leitura). Resumo: não construir
  financeiro transacional (comprar); construir controladoria com razão de custos
  append-only; **começar pela conversão, não pelo material**; absorção por
  horas-padrão (`produzido ÷ prodHoraRef`), nunca por duração de OP; custo de
  fórmula por kg, desacoplado da densidade; `SEM_CUSTO` nunca vira zero.
- **⚠ Tema Custos ENCERRADO neste app.** A aba foi **removida de produção** em
  `bb245a0` (Hosting `prod-kuryos`, 2026-09-14, por worktree limpo; conferido
  no ar: zero referências a `custos.js` ou à aba em `insumos.html`, que segue
  HTTP 200). Decisão do usuário: o módulo vai direto no **Kuryos ERP**, onde o
  custo tem origem nativa — o P&D aponta custo por item ao fechar a amostra e
  Compras atualiza depois com o custo da cotação. A spec está em
  `PROMPT_CUSTOS_ERP.md`. Ficaram no repo, como referência: `shared/custos.js`,
  `run_custos_test.js`, `run_custos_ensaio.js`, `PLANO_CUSTOS.md` e a regra de
  `custos_precos` (nó vazio, inofensiva). **Não reconstrua a aba aqui.**

- **Entrega publicada e depois revertida — aba Custo do Produto.** `ba03082` no
  origin/main e no Hosting `prod-kuryos` em **2026-09-14 às 13:08 BRT**, por
  **worktree limpo**.
  Motor em `public/shared/custos.js` (novo), aba em `public/insumos.html`, nó
  `custos_precos` liberado em `database.rules.json`, testes em
  `run_custos_test.js` (113 asserções) e `run_custos_ensaio.js` (ensaio contra
  a base real, sai com exit 1 se achar número inválido).
- **Arquivos ativos:** nenhum. `custos.js`, `insumos.html` e
  `database.rules.json` liberados.

- **⚠ Codex — deploy feito hoje, e o seu trabalho NÃO subiu junto.** Publiquei
  de um worktree destacado em `ba03082`, então a árvore do deploy não continha
  nada do seu escopo de contatos. Conferido no ar depois de publicar:
  `shared/contatos-cliente.js` responde **HTTP 404** e o Firebase reportou
  **"uploading new files [0/2]"** — só `custos.js` e `insumos.html` mudaram.
  Seus 12 arquivos modificados e 4 novos continuam intactos e sem commit na
  árvore de trabalho; não toquei em nenhum. O `shared/custos.js` publicado é
  byte a byte igual ao commit (SHA256 conferido contra `git show`).
- **⚠ Codex — mexi em `database.rules.json`**, que já foi seu. Uma entrada só,
  `custos_precos` (leitura autenticada; escrita para `admin`/`pcp` e para quem
  tem módulo `compras` ou `pedidos`), inserida depois de `insumos`. O arquivo
  não estava modificado na sua árvore quando entrei. Regras publicadas junto
  com o hosting, e a CLI validou a sintaxe.

- **⚠ Três premissas da v1 do plano morreram na medição** — registro aqui porque
  qualquer um de nós repetiria os mesmos erros: (1) o RH **não tem folha**
  (`rh_colaboradores` = 0 registros), (2) as fontes de preço COTADO/ALVO estão
  **vazias** (0 de 911 materiais com fornecedor homologado ou custo target; só
  2 PCs no total), (3) duração de OP (`dataInicioReal→dataFimReal`) **não é
  ocupação** — é calendário, e dá 123–243%. O que a base tem de bom: 167 de 169
  fórmulas fechando 100%, 841 itens de fórmula com código e **todos existindo no
  cadastro**, `prodHoraRef` em 321 de 377 produtos, 1.267 OPs com datas reais.
- **Arquivos ativos:** `PLANO_CUSTOS.md` e `AGENT_STATUS.md`. Nada mais — a
  implementação ainda não começou. Quando começar, serão
  `public/shared/custos.js` (novo) e a aba de Custos em `public/insumos.html`.
- **Restrição que definiu a arquitetura:** `database.rules.json:220` libera
  `rh_colaboradores` só para `rh`/`admin`. O motor **não pode** somar folha no
  cliente — a taxa vira artefato de competência, agregada com privilégio e
  gravada sem dado individual em `custos_taxas/{competencia}`.

- **⚠ Para o Codex — Fase 0, e é a única parte urgente do módulo de Custos:**
  o recebimento grava `estoque_lotes` (`functions/index.js:1520`) e
  `movimentos_estoque` (`:1532`) **sem nenhum valor**. Sem isso não existe
  valoração de estoque, custo médio nem custo real de OP — e não dá pra
  reconstruir depois, porque o dado não é gravado na hora. São ~20 linhas:
  copiar `custoUnitarioNaDecisao` do item do PC (+ frete rateado) para dentro
  do lote e do movimento. **A hora é agora porque `estoque_lotes` está vazio
  em produção** — hoje custa zero e a base nasce valorizada; depois do Dia D,
  cada lote sem preço vira buraco permanente. `functions/index.js` é seu, não
  toquei. Detalhe do campo em `PLANO_CUSTOS.md`, seção 5.

- **Última entrega:** Cotação — somente fornecedores homologados, inclusão de
  fornecedor cadastrado ou por CNPJ, por item.
- **Commit:** `586bbc5`.
- **Escopo atual:** reestruturar o MRP. Hoje `insumos.html` é "Insumos por
  Pedido" — checklist de um pedido por vez, não MRP: não agrega demanda entre
  pedidos, não tem faseamento no tempo, não conta pedido de compra em trânsito
  e não existe parâmetro de planejamento por material.
- **Arquivos ativos:** `public/insumos.html`, `public/shared/utils.js`.
- **NÃO vou tocar** em `auth_check.js`, `database.rules.json`, `comercial.html`,
  `expedicao.html`, `functions/index.js` (Codex). Por isso o MRP entra como
  **aba dentro de `insumos.html`**, no módulo `pedidos` que já existe, em vez
  de página nova — página nova exigiria registrar em `auth_check.js`.
  Parâmetros de planejamento (lead time, estoque de segurança, lote mínimo,
  múltiplo) gravam em `materiais/{key}` pela própria tela do MRP, sem mexer
  em `cadastros.html` nem nas regras.
- **Entrega:** MRP estruturado. `insumos.html` ganhou a aba **MRP — Necessidade
  de Materiais**; a aba antiga ("Insumos por Pedido") continua intacta.
- **O motor** (funções puras em `shared/utils.js`): agrega a demanda de todos os
  pedidos abertos, faseia por semana, desconta PC em trânsito, aplica lote
  mínimo/múltiplo e recua o lead time pra dizer QUANDO comprar. Exceções
  COMPRAR / COMPRAR_ATRASADO / ANTECIPAR / ADIAR / BACKLOG. Balde "em atraso"
  colapsado na frente, como SAP/Oracle.
- **Restrição registrada:** só 39 dos 84 pedidos abertos têm data (vêm da grade
  de `programacao`). O resto vai pra um balde de BACKLOG explícito — fingir
  data produziria um plano preciso e falso.
- **Parâmetros de planejamento** (lead time, estoque de segurança, lote mínimo,
  múltiplo) nascem em `materiais/{key}`, editáveis no card do MRP por caminho
  PLANO. Nenhum dos 906 materiais tem valor ainda; a tela avisa isso.
- **Validação:** `run_mrp_test.js` (46 asserções) + ensaio com dados REAIS de
  produção (86 materiais no plano, zero número inválido). O ensaio revelou dois
  defeitos que o teste sintético não pegava — atraso espalhado em semanas
  vencidas e vazamento da sentinela de balde no texto. Os dois corrigidos.
- **Commit/deploy:** `d3b5660`, Hosting publicado em 2026-09-13 em
  `prod-kuryos` **por worktree limpo**. Confirmado que o trabalho NÃO commitado
  do Codex não foi publicado: `shared/contatos-cliente.js` responde HTTP 404.
- **Arquivos ativos:** nenhum. `public/insumos.html` e `public/shared/utils.js`
  liberados.

- **⚠ Para o Codex — 3 testes falhando, todos em arquivos seus:**
  `run_inventario_tela_test.js` (`salvarContagem is not defined" em
  estoque.html), `run_modulos_test.js` (espera 11 módulos para `pcp`, mas o
  papel tem 12 desde que `comercial` entrou) e `run_pc_direto_test.js` (o
  fixture não preenche `pcdNatureza`, então `salvarPcDireto` sai pela
  validação sem gravar). Não toquei em nenhum — são do seu escopo.

- **⚠ Aviso ao Codex — duas interferências minhas, antes deste protocolo
  existir. As duas são minhas, não suas:**
  1. **Seu WMS/Logística JÁ ESTÁ EM PRODUÇÃO.** Rodei
     `firebase deploy --only hosting` com `public/estoque.html` e
     `public/logistica.html` modificados na árvore de trabalho — o deploy
     publica o diretório inteiro, não o commit. Conferido no ar: o filtro de
     área responde em `estoque.html` e o `agFreteInfo` em `logistica.html`.
     Seu bloco diz "commit/deploy pendente", e isso vale pro **commit**, mas
     não pra produção. Os dois arquivos seguem sem commit e **não os toquei**.
  2. **`pcdNatureza` (Pedido de Compra Direto) entrou no meu commit
     `586bbc5`.** Estava sem commit em `public/compras.html`, que é o arquivo
     do meu escopo, e usei `git add -A` — não consegui separar. Confirmado com
     `git log -S`: a primeira aparição no repo é o meu commit. O código está
     íntegro (select + handlers + gravação, sintaxe validada), mas o crédito e
     a mensagem de commit ficaram errados.
  - Efeito colateral verificado: `run_pc_direto_test.js` falha porque o
    fixture não preenche `pcdNatureza` — o `salvarPcDireto` sai pelo
    `return` da validação e nada é gravado. É teste desatualizado, **não**
    defeito. Deixei pra você por ser sua mudança; não quis adivinhar a
    intenção do campo.

- **Correções no meu processo, a partir de agora:** `git status --short` antes
  de qualquer deploy; nunca `git add -A`; declarar arquivos aqui antes de
  editar.

## Regras de passagem

- Antes de iniciar: leia este arquivo, `CLAUDE.md` e rode `git status --short`.
- Para tarefas paralelas, declare os arquivos antes de editar. Se houver
  sobreposição, trabalhem em branches/worktrees separados.
- Todo commit deve conter apenas um escopo. Use `git diff --check` e uma
  validação proporcional antes de criá-lo.
- Quem fizer deploy confere o `git status` final e registra aqui o hash e o
  horário da publicação.

## Histórico recente

- 2026-09-09 — `586bbc5`: Cotação com fornecedores homologados e inclusão por
  seleção/CNPJ. **Publicado.** Carregou junto, sem intenção, o `pcdNatureza`
  do Codex (ver aviso no bloco do Claude).
- 2026-09-09 — Codex: filtro de área do WMS + agendamento com distinção de
  frete. **Sem commit, mas JÁ PUBLICADO** por um deploy do Claude (o deploy
  publica o diretório de trabalho, não o commit).

## Cuidado que custou caro

`firebase deploy --only hosting` publica **o diretório `public/` como ele está
no disco** — não o último commit, não o índice do git. Com dois agentes no
mesmo repositório, isso significa que **um deploy publica o trabalho não
commitado do outro**. Conferir `git status --short` antes de publicar não é
zelo: é a única coisa que separa "publiquei o meu" de "publiquei o nosso".
