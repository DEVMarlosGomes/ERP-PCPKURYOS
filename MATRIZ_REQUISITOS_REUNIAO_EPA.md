# Matriz industrial/EPA — primeiro incremento, não encerrada

HEAD de referência: `376eada506b4d88fb0934af3990558997a78fabe`. Fontes: R = reunião 28/10, P = prompt 28/10, H = histórico `skills frontend.txt`, E = novo roteiro industrial + PDF. Esta matriz é um **recorte inicial**, não a decomposição exaustiva de todos os anexos. Itens não rastreados até persistência/consumidores não são classificados como conformes. Testes gerais verdes não comprovam cada requisito.

`T` = testes locais em `functions/test/epa*.test.js`. `B` = provas da linha de base em `functions/test/epa-baseline-audit.test.js` (confirmam defeitos existentes, não correções). O caminho de fonte/endereço da evidência identifica onde continuar a auditoria; não implica que a integração foi testada.

| ID | Fonte / esperado | Status | Evidência ou localização inicial | Teste executado / dependência e próxima ação |
|---|---|---|---|---|
| MENU-01a | P: registro único, sem duplicação | NÃO VERIFICADO | `public/shared/navegacao.js` | Reexecutar por perfil e comparar portas |
| MENU-01b | P: página desconhecida não libera acesso | NÃO VERIFICADO | `public/auth_check.js` | Chamada direta e perfil sem módulo |
| MENU-02a | P: identidade e sanfona | NÃO VERIFICADO | `public/shared/kuryos-ui-layout.css` | Conferência visual desktop/móvel |
| MENU-02b | P: busca, tema, Escape, foco | NÃO VERIFICADO | `public/auth_check.js` | Navegador e acessibilidade |
| MENU-03a | P: cartões por permissão | NÃO VERIFICADO | `public/inicio.html` | Testar dados lidos por perfil |
| MENU-04a | P: ativo/título/aria no React | NÃO VERIFICADO | `public/shared/crm-pd-shell-bridge.js` | Navegar seis rotas |
| CRM-01a | R/P: categoria dinâmica e ativa | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseCommercial.js` | Rastrear `config/categoriasProduto` até SKU |
| CRM-01b | P: persistir código, não descrição | NÃO VERIFICADO | `crm-frontend/src/pages/CRM1Page.js` | Comparar gravação com cadastro |
| CRM-02a | R/P: sugerir CLI4 funcional e livre | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseApi.js` | Caso de componente/rota específico |
| CRM-03a | R/P: preço vazio não presume zero | NÃO VERIFICADO | `crm-frontend/src/lib/masks.js` | Entrada real e persistência |
| CRM-03b | R/P: volume digitado sem prefixo zero | NÃO VERIFICADO | `crm-frontend/src/pages/CRM2Page.js` | Entrada real e persistência |
| CRM-04a | R: prazo do projeto autopopula | NÃO VERIFICADO | `crm-frontend/src/components/SampleBatchModal.js` | Projeto→amostra→P&D |
| CRM-04b | R: prazo editável guarda origem | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseApi.js` | Revisão manual e histórico |
| H-CONT-01 | H: contato é decisor | NÃO VERIFICADO | `crm-frontend/src/pages/CRM1Page.js` | Testar qualificação e persistência |
| H-CONT-02 | H: retirar pergunta redundante Anvisa | NÃO VERIFICADO | `crm-frontend/src/pages/CRM1Page.js` | Não apagar processo regulatório |
| H-NUM-01 | H: projeto/amostra/KO rastreáveis | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseCommercial.js` | Preservar legados, teste concorrente |
| H-V1-01 | H: V1 automática após manipulação | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseApi.js` | Fluxo real→persistência |
| H-CARDS-01 | H: cards refletem solicitação | NÃO VERIFICADO | `crm-frontend/src/lib/pdCards.js` | Mudança de status e reabertura |
| H-BASE-01 | H: base reutilizada sem alterar irmãs | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseApi.js` | Versões e retrabalho |
| H-BASE-02 | H: alteração de fragrância fecha fórmula | NÃO VERIFICADO | `crm-frontend/src/lib/fechamentoFormula.js` | Localizar consumidor e fechamento autoritativo |
| PD-01a | R/P: ações fixas e acessíveis | NÃO VERIFICADO | `crm-frontend/src/pages/PDDetail.js` | Notebook/390px/40 ingredientes |
| PD-02a | R/P: seleção somente MPES/MPGR | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseApi.js` | Rotas e chamada direta |
| PD-02b | P: embalagem legada aparece com aviso | NÃO VERIFICADO | `crm-frontend/src/pages/PDDetail.js` | Fixture legada |
| PD-03a | R: fila imediata ao salvar ingrediente | NÃO VERIFICADO | `crm-frontend/src/lib/filaCadastroMp.js` | Não confundir solicitação com validação |
| PD-03b | H: vincular existente sem duplicar | NÃO VERIFICADO | `public/cadastros.html` | Fornecedor/especificação distintos |
| H-MPES-01 | H: código final obrigatório na validação | PARCIAL | `functions/epa.js`: `MPES_SEM_CODIGO_FINAL` | T confirma contrato; falta adaptador de códigos reais |
| H-MPES-02 | H: preservar SKU aprovação/interno | NÃO VERIFICADO | `public/shared/sku-entrada.js` | Histórico e imutabilidade reais |
| H-FT-01 | H: fases/INCI/procedimento alimentam 2.2 | NÃO VERIFICADO | `crm-frontend/src/pages/PDDetail.js` | Fonte→documento |
| PD-05a | R: diretoria sem leitura, alerta explícito | NÃO VERIFICADO | `crm-frontend/src/lib/liberacaoAntecipada.js` | Repetir fluxo sem D0 e sem dispensar indústria |
| H-EST-01 | H: checkpoints sequenciais com tempo servidor | NÃO VERIFICADO | `functions/index.js` | Tempo autoritativo/valores ausentes |
| PD-06a | R: puxar especificações só para vazios | PARCIAL | `firebaseApi.js:3040` + `especificacoesCadastro.js` | Suíte CRM geral passou; falta ensaio específico multicamada |
| H-RET-01 | H: enviada bloqueia até retorno | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseApi.js` | API/banco além da UI |
| H-RET-02 | H: retrabalho gera nova versão | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseCommercial.js` | Preservar aprovações antigas |
| KO-10a | R: Bloco 0 todo autopopulado | NÃO VERIFICADO | `crm-frontend/src/lib/kickoffAutopreenchimento.js` | Campos um a um com origem |
| KO-10b | H: bloco aprovado não sobrescreve | NÃO VERIFICADO | `crm-frontend/src/lib/kickoffBlocos.js` | Invalidação e diff |
| KO-11a | R: frasco e tampa/válvula agrupados | NÃO VERIFICADO | `KickoffCompositionQuestionnaire.js` | UI e BOM legado |
| KO-11b | H: Outro/atributos/fornecido por | NÃO VERIFICADO | `KickoffCompositionQuestionnaire.js` | Valores chegam às linhas de cotação |
| KO-12a | R: não rotulado pergunta gravação | NÃO VERIFICADO | `KickoffCompositionQuestionnaire.js` | Sim/não/indefinido |
| KO-12b | R: aplicável sem definição gera pendência | PARCIAL | `functions/epa.js`: `APLICABILIDADE_AUSENTE` | T; falta derivar dos blocos reais |
| KO-13a | R: funções/equipamentos/produtividade | NÃO VERIFICADO | `crm-frontend/src/lib/kickoffOperacional.js` | Capacidade conservadora, sem sobrescrita |
| BOM-02a | R: ficha aprovada relacionada em tela | NÃO VERIFICADO | `crm-frontend/src/pages/KickoffPage.js` | Consulta e revisão efetiva |
| BOM-02b | R: PDF BOM exclui fórmula/equipamento | NÃO VERIFICADO | `crm-frontend/src/lib/bomDocumento.js` | Inspecionar bytes e layout |
| BOM-03a | R: árvore e tabela legíveis | NÃO VERIFICADO | `crm-frontend/src/lib/bomArvore.js` | 390px/nome longo |
| BOM-04a | R: sem paletização no BOM/cotação | NÃO VERIFICADO | `crm-frontend/src/lib/kickoffBom.js` | Rastrear consumidores |
| H-FX-01 | H: dólar/spread único, sem fallback fictício | NÃO VERIFICADO | `functions/index.js` | Falha/expiração e todos os consumidores |
| H-FX-02 | H: câmbio nos eventos de aprovação | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseCommercial.js` | Sem reescrever aprovado |
| COT-01a | R: desconto inicia zero e tem máximo | NÃO VERIFICADO | `crm-frontend/src/lib/cotacao.js` | Servidor/regra e exceção auditada |
| COT-02a | R: insumos completos sem fornecedor | NÃO VERIFICADO | `crm-frontend/src/lib/cotacaoKickoff.js` | SC preserva especificações |
| COT-03a | R: PC bloqueado até pedido | NÃO VERIFICADO | `public/compras.html` | Todos os caminhos e regra |
| COT-04a | R: orçamento sugere preços da cotação | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseCommercial.js` | Ausência de preço não vira zero |
| SKU-01a | R: SKU no orçamento aprovado idempotente | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseCommercial.js` | Retry/concorrência/regra |
| SKU-01b | R/H: CGI anterior válido evita duplicar | NÃO VERIFICADO | `crm-frontend/src/lib/firebaseCommercial.js` | Vigência/cliente/escopo |
| OP-01a | R: saldo suficiente autoritativo | PARCIAL | `functions/emissao_op.js:82` | 5 testes existentes; B reproduz consumo confiado ao cliente |
| OP-01b | E: OP exige origem técnica e EPA final | AUSENTE | `functions/emissao_op.js:108` | B aceita rascunho técnico e nenhuma EPA |
| OP-02a | R: substituto mostra saldo/unidade | NÃO VERIFICADO | `public/emitir_op.html:1094` | UI + validar substituição tecnicamente |
| PLAN-01a | R: ritmo antecipa/adia sequência | NÃO VERIFICADO | `public/planejamento.html` | Ritmo real, 15 min, sem zona fixa conforme usuário |
| FEFO-01a | R: MP/embalagem elegíveis por dono/lote | NÃO VERIFICADO | `public/shared/fefo-embalagem.js` | Rastrear motor de lotes e testar vencido/quarentena/reservado |
| FIN-01a | R: parcelas em um título com soma exata | NÃO VERIFICADO | `public/shared/financeiro.js` | A pagar/receber/mês fechado |
| PORT-01a | P: Painel comparado ao oficial | NÃO VERIFICADO | `public/painel.html` | Sem comparação nova por funcionalidade |
| PORT-02a | P: Pesagens integradas | NÃO VERIFICADO | `public/pesagens.html` | Fluxo operacional e regras |
| PORT-03a | P: Inspeção PA/liberação/checklists | NÃO VERIFICADO | `public/liberacao_linha.html` | Pré-requisitos e execução real |
| PORT-04a | P: titularidade auditável | NÃO VERIFICADO | `functions/titularidade.js` | Titular/transferência/consumidores |
| PORT-05a | P: auditoria autoritativa | PARCIAL | `functions/index.js:32` | Segurança anterior: autor servidor; antes/depois ainda client_reported |
| PORT-06a | P: Ativos alimentam operacional | NÃO VERIFICADO | `public/ativos.html` | Vínculo real |
| PORT-07a | P: 5S preservado | NÃO VERIFICADO | `public/auditoria_5s.html` | Regras/UI |
| PORT-08a | P: RH temporários/feedback/clima | NÃO VERIFICADO | `public/rh_temporarios.html` | Perfil e privacidade |
| PORT-09a | P: Roadmap | NÃO VERIFICADO | `public/backlog.html` | Permissões/fluxo |
| PORT-10a | P: pequenas diferenças do oficial | NÃO VERIFICADO | Matriz antiga não substitui comparação atual | Inventário por funcionalidade |
| EPA-01 | E: consolidar dados sem cadastro paralelo | PARCIAL | `functions/epa.js`: contrato `sources` | Adaptadores reais não implementados |
| EPA-02 | E: separar especificação e ocorrência | PARCIAL | `functions/epa.js`: `snapshot` | T; persistência por OP pendente |
| EPA-03 | E: oito variantes coerentes | PARCIAL | `functions/test/fixtures/epa.js` | T cobre oito/duplicação/F-H; falta associação real |
| EPA-04 | E: referências aprovadas e vigentes | PARCIAL | `functions/epa.js`: `ORIGEM_NAO_APROVADA` | T; flags ainda precisam vir do servidor |
| EPA-05 | E: fórmula 100% com tolerância | PARCIAL | `functions/epa.js`: `FORMULA_TOLERANCE` | T cobre 99,9/100/NaN e limites; sem conversão automática |
| EPA-06 | E: MPES/provisórios bloqueiam final | PARCIAL | `functions/epa.js`: validação componentes | T; código fornecedor real ainda não adaptado |
| EPA-07 | E: lote/datas/peso sem placeholders | PARCIAL | `functions/epa.js`: ocorrência | T; política real de validade a resolver na origem |
| EPA-08 | E: caixa parcial explícita | PARCIAL | `functions/epa.js`: `CAIXA_PARCIAL` | T; decisão precisa ser autoritativa |
| EPA-09 | E: segregação de aprovação | PARCIAL | `functions/epa-revisions.js`: `approve` | T bloqueia própria revisão/inativo; política real pendente |
| EPA-10 | E: nova revisão preserva anterior | PARCIAL | `functions/epa-revisions.js`: `revise` | T; armazenamento imutável pendente |
| EPA-11 | E: mudança de origem aborta aprovação | PARCIAL | `functions/epa-revisions.js`: `fresh` | T; transação/concorrência no banco não implementadas |
| EPA-12 | E: PDF paginado marcado rascunho | PARCIAL | `functions/epa-preview.js` | T + inspeção de todas as 3 páginas; sem tela integrada |
| EPA-13 | E: excluir fórmula/custo/equipamento | PARCIAL | `functions/epa.js`: `snapshot` | T cobre campos extras conhecidos; leitura/PDF legado continua pendente |
| EPA-14 | E: ativos preservados e privados | PARCIAL | `functions/epa.js`: `ATIVO_NAO_VERSIONADO` | T valida metadados; infraestrutura e bytes pendentes |
| EPA-15 | E: idempotência emissão/reserva | NÃO VERIFICADO | Emissão nova ainda não implementada | Coordenador transacional obrigatório |
| EPA-16 | E: falha PDF não libera OP | AUSENTE | Fluxo atual não possui vínculo final por OP | Novo fluxo não libera nada; portão existente ainda a integrar |
| EPA-17 | E: símbolo master decodificável | AUSENTE | Prévia imprime só referência e aviso | Não serve como etiqueta; implementar/decodificar antes de final |
| EPA-18 | E: cancelamento/reimpressão imutáveis | NÃO VERIFICADO | Nova persistência ainda inexistente | Implementar com motivo/impactos e bytes originais |
| EPA-19 | E: ações no projeto/Kickoff/OP | AUSENTE | Módulos locais não expostos | UI, API, regras e teste por perfil pendentes |
| EPA-20 | E: proteger registro/PDF por tenant | NÃO VERIFICADO | Sem endpoint EPA industrial neste incremento | Regras negativas e token revogado no futuro adaptador |

As referências sem linha indicam **localização inicial**, não evidência de conformidade. O histórico de testes anteriores está em `AGENT_STATUS.md`, mas ainda não foi convertido em cobertura industrial requisito a requisito nesta tarefa. KO-02/KO-09/COM-07 têm referências no RFC e no código; suas garantias atuais continuam por rastrear, não serão inferidas da descrição histórica.
