# Correções de acessos e bloqueios da virada — 03/11/2026

## Entrega

O JSON de 01/11 não foi reimportado. Correções incrementais de código, reconciliação monotônica de três contadores e revisão das automações. Não equivale ao aceite integral da fábrica: as pendências industriais/operacionais da auditoria anterior continuam válidas.

### Usuários e acesso

- `auth_check.js`: adaptação das callables usa URL explícita; o SDK compat 10.7.0 não consegue mais remover `/api`. Testado com os scripts reais do Google em Chrome isolado. Não cria alias público nem desliga verificação de token.
- `usuarios.html`: erro de rota não afirma mais que a pessoa foi excluída; contagem de módulos considera somente `true`.
- Editar → **Verificar vínculo de login** distingue conta válida, ausência de login, e-mail divergente e e-mail pertencente a outro UID.
- Editar → **Regularizar login mantendo histórico** exige confirmação do e-mail; o servidor cria Auth com o mesmo UID, sem senha definida pelo administrador, mantendo funções/tenant e histórico. Nasce bloqueada durante a preparação; só é habilitada após os registros obrigatórios. Conta desativada continua desativada. Conflitos de e-mail/UID não são fundidos automaticamente.
- Após regularização, a UI solicita o link para definir senha. Falha de envio distingue “conta regularizada” de “e-mail não enviado”. Nenhum e-mail real foi enviado em teste.
- Criação duplicada de perfil é recusada também pelo servidor, não apenas pelo navegador.
- Funções, módulos, bloqueio, recuperação e revogação verificam a existência da conta Auth e orientam regularização quando necessário.
- Módulos são compensados após falha de revogação; edição de conta compensa Auth/perfil quando falha a etapa de revogação/auditoria, com controle da versão do perfil.
- Journal durável em `auditoria_acessos/op_*` precede efeitos. `requestId` permite retornar resultado já concluído e impede repetir silenciosamente uma operação incerta com o mesmo ID. Trava servidor por identidade serializa alterações.
- Operação interrompida fica `REQUER_CONFERENCIA`, com ID para rastreamento. Auth e RTDB não oferecem transação distribuída: compensações também podem falhar. A mensagem assume possibilidade de efeitos parciais; marcas de revogação não são apagadas para “desfazer” segurança.
- A trava é liberada respeitando cache frio. O teste no RTDB emulado encontrou uma falha que os mocks não pegaram; corrigida e repetida com aprovação.

Nenhuma pessoa real foi criada, removida, regularizada ou promovida nesta entrega. Os vínculos pendentes são resolvidos por decisão explícita do administrador; não por cópia automática de papéis do sistema anterior.

### Numeração

Reconciliação executada no **erpkuryos** com leitura atual, backup e transações que nunca reduzem valores:

| Contador | Antes | Depois | Próxima reserva, se ninguém reservar antes |
|---|---:|---:|---|
| pedidoCompra | 19 | 81 | PC-0082 |
| solicitacaoCompra | 10 | 39 | SC-0040 |
| processoCotacao | 14 | 44 | COT-0045 |

Segunda simulação: os três já estavam alinhados; hashes das coleções iguais antes/depois. Não houve alteração em documentos. Backup privado: `scratch/virada-20261103/counter-reconcile-1793730625018.json` e resultado correspondente. Script: `scripts/auditoria-virada/reconcile-counters.js`; padrão somente simulação; aplicação exige `--apply --project erpkuryos` e credencial do projeto correto.

O helper das telas de Compras/Insumos também lê os documentos antes de reservar e considera o maior número histórico. Reserva continua transacional; erro de leitura, contador inválido ou transação abortada bloqueiam a operação. O CRM usa outro helper; não foi alterado o arquivo marcado como ativo de outra frente. A correção do contador compartilhado já beneficia esse fluxo, mas uma futura importação precisa repetir a conferência monotônica.

**Quatro colisões históricas não renumeradas:** PC-0018, PC-0019, SC-0010 e COT-0014, cada uma com dois registros. Existem PCs recebidos e outros abertos sob o mesmo número. Pergunta enviada ao Marlos sobre circulação externa; não renumerar documento recebido/emitido nem reescrever referência textual sem essa confirmação. Chaves internas e documentos mantidos intactos.

### Validade da expedição

- Navegador e servidor reconhecem `dataValidade`, `validade` e `validadeLote`.
- ISO e data `dd/mm/aaaa` normalizadas; data impossível/preenchimento inválido bloqueia saída.
- Datas divergentes usam a menor, de forma conservadora; vencimento é comparado ao dia da operação (o próprio dia da validade não é antecipado).
- Ordenação FEFO, coluna de validade e solicitação de faturamento usam o mesmo resolvedor.
- As regras do navegador e do servidor permanecem byte a byte iguais.
- A política anterior para lote sem nenhum campo de validade foi preservada; ausência de informação não foi convertida em data inventada. Deve ser conferida operacionalmente antes da virada.

Nenhuma expedição, NF, lote ou saldo real foi movimentado.

## Revisão das automações

Inventário do código: **6 gatilhos e 4 agendas**.

| Grupo | Rotinas | Efeito relevante |
|---|---|---|
| Gatilhos | solicitação de faturamento; fim de turno; encerramento de OP; pesagem fechada; criação/versão de pedido comercial | E-mails e marcas operacionais |
| Agendas | câmbio (15 min); notificações (2 min); resultado (5 min); derivação financeira (5 min) | Escritas, e-mails e derivações financeiras |

Leitura da VPS nesta tarefa: `DISABLE_TRIGGERS=1` e `DISABLE_SCHEDULE=1`. Mantidas assim.

O adaptador toma a primeira leitura como baseline, portanto não percorre o histórico importado para disparar tudo ao iniciar. Isso também significa que alterações feitas enquanto desligado não são recuperadas automaticamente. Fila de gatilhos é em memória; erro é registrado, sem fila durável/retry persistido. Reinício pode perder trabalho pendente. Agendas longas executam também 30 s após ativação. O código tem deduplicações específicas, mas elas não equivalem a garantia de processamento exatamente uma vez.

Antes de ativar: configurar/verificar remetente e destinatários, definir corte temporal e recuperação das pendências, garantir um único executor ou coordenação durável, ensaiar idempotência/reinício/falha e conferir as derivações financeiras. Não copiar de volta filas técnicas históricas nem ativar em massa como correção do CRUD.

## Validações

- Serviço de identidade em memória: fluxo CRUD e proteções existentes aprovados.
- Regressões de falha: compensação de módulos, compensação Auth/perfil, bloqueio de perfil duplicado, regularização preservando UID, conflito por e-mail e concorrência/retry aprovados.
- Serviço no RTDB emulado: journal, exclusão da trava/cache frio, idempotência concorrente, compensação e UID preservado aprovados.
- Regras no emulador `demo-identidade`: proibição de escrita direta de perfil/auditoria/trava e isolamento de leituras aprovados. Nenhuma regra de produção alterada.
- UI com fixtures fictícias em Chrome: 1200×900 e 390×844; verificação/regularização, e-mail simulado, contagem zero, modal dentro da largura e nenhum erro JavaScript. Renderizações inspecionadas; não é teste em aparelho físico nem aceite autenticado com contas reais.
- SDK real 10.7.0: URL `/api/gerenciarUsuario` aprovada com chamadas interceptadas.
- Contadores: três pisos históricos, 12 reservas concorrentes simuladas, contador adiantado e erros fechados aprovados; no RTDB emulado, papel Compras leu os históricos e reservou 8 PCs concorrentes únicos (82–89), SC 40 e COT 45, sem alterar documentos.
- Expedição: 4 regressões de validade; suítes de expedição, chave de pedido, devolução (49 asserções), grade e carga parcial/faturamento aprovadas.
- Adaptador HTTP 14/14; contratos Hostinger 24/24; navegação 39 perfis; segurança HTTP e auditoria autenticada; contratos de identidade 24; varredura de transações/cache frio aprovados.
- Um comando tentou executar `run_faturamento_carga_test.js`, inexistente; não contado como aprovado. O faturamento está coberto pela suíte existente `run_carga_parcial_test.js`.

## Pendências explícitas

1. Confirmação dos documentos externos para tratar as quatro colisões históricas.
2. Administrador conferir e regularizar pessoas/vínculos reais; conflitos entre UIDs exigem reconciliação específica.
3. Ativação controlada das automações, com os portões acima, ainda pendente.
4. Operações `REQUER_CONFERENCIA` ou travas deixadas por queda do processo requerem conferência técnica; não há desbloqueio automático por prazo, para não duplicar efeitos.
5. Demais P0 industriais da emissão de OP, inventário/cutover, cadastros e pendências externas de segurança não são encerrados por esta entrega.

## Publicação

Publicada na VPS **`kuryoserp.com.br`**, release **`397b4a384ea360dcd6df8befed65829b915040c9`**, contendo `3f6d2cf` (acessos) e `397b4a3` (operação). Push na branch `hostinger-deploy` seguido do deploy por commit; ambos os containers saudáveis. Rollback preservado em `43c63ad3801f9f6e1973bb1288d8005e2ed28390`.

Pós-deploy: `/auth_check.js`, `/usuarios`, `/shared/utils.js` e `/shared/expedicao.js` HTTP 200 e hash SHA-256 igual aos arquivos locais testados. `/healthz` e `/api/health` HTTP 200, 39 funções. POST com JSON válido, sem token, à `/api/gerenciarUsuario` devolveu **401 UNAUTHENTICATED**, como deve. Uma primeira prova montou JSON inválido no comando e recebeu 400; repetida com `JSON.stringify`, aprovou a proteção de autenticação.

Configuração relida após deploy: `DISABLE_TRIGGERS=1` e `DISABLE_SCHEDULE=1`. Nenhuma regra alterada e nenhum teste mutável em conta real. A documentação posterior ao release pode ter commit próprio sem mudar o código efetivamente implantado.
