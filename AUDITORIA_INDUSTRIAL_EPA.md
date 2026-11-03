# Auditoria industrial e EPA — incremento 1

03/11/2026 · branch `hostinger-deploy` · HEAD auditado `376eada506b4d88fb0934af3990558997a78fabe`.

**Auditoria em andamento, não encerrada.** Produção, regras, DNS, estoque, contas e configurações não foram alterados nesta tarefa. Não houve push nem deploy. O novo código é local e não está ligado ao servidor público.

## Fontes e linha de base

Encontrados os quatro anexos: reunião e histórico de frontend no Desktop; prompt de 28/10 e PDF no Downloads. O novo roteiro industrial foi lido como documento de escopo; comandos históricos de publicar, delegar ou instalar ferramentas não foram executados como ordens novas. O PDF foi extraído integralmente (1 página) e sua página renderizada inspecionada. Assinaturas/imagens e dados de cliente do modelo não foram copiados para fixtures versionadas.

Lidos/revistos status e arquitetura (`CLAUDE.md`, `AGENT_STATUS.md`, mapa, fluxos, plano P&D e RFC paralelo). O plano extenso de PCP foi consultado nas decisões e na emissão nativa; seu histórico completo ainda não está reauditado. Foram diferenciadas decisões atuais de Marlos (ritmo real, sem zona fixa, 15 minutos, HOM) de propostas antigas conflitantes.

Stack confirmada: HTML/JS no PCP, React/Vite/Vitest no CRM, RTDB/Auth, Node 24 e PDFKit já presente no backend. Não há `package.json` na raiz. Módulos puros em `functions/` podem ser testados sem credenciais. Não editar bundles em `public/static/crm`.

Linha de base efetivamente executada:

- CRM: `npx vitest run` em `crm-frontend`: **408 passaram, 2 ignorados**, 49 arquivos aprovados e 1 ignorado.
- OP existente: `node --test functions/test/emissao_op.test.js`: **5 passaram**.
- Adaptador HTTP: `node run_render_functions_test.js`: **14/14**, reconhecendo as 39 funções existentes. O erro interno exibido é o cenário intencional de mascaramento de erro.
- Tentativas iniciais `run_emissao_op_test.js` e `run_render_server_test.js` falharam por nomes inexistentes; foram substituídas pelos comandos corretos acima. Isso não foi falha do produto.

## Cobertura atual, sem inflar conformidade

A matriz inicial contém **88 itens: 19 PARCIAIS, 4 AUSENTES e 65 NÃO VERIFICADOS; zero CONFORME**. São itens inventariados, não 88 verificações ponta a ponta concluídas. Ainda falta decompor integralmente os pedidos transversais e terminar o rastreamento UI→servidor/regras→persistência→consumidores de cada área. A suíte geral aprovada não encerra esse trabalho.

## Achados prioritários

### AUD-EPA-01 / Exportação de documento vivo não entrega a EPA industrial / P1

Fonte: roteiro industrial §§6–8; PDF com grade, componentes, enchimento, gravação e master.
Desejado: PDF controlado do snapshot exato, acessível com autorização do registro.
Observado: `crm-frontend/src/lib/firebaseApi.js:3234` responde a GET genérico `.pdf` com HTML contendo apenas caminho/data. O botão em `PDDetail.js:7056` aponta diretamente ao backend, sem passar por esse adaptador. Não foi encontrada uma implementação industrial correspondente nesse caminho.
Causa confirmada: placeholder genérico e desconexão entre download e exportação real. O sintoma no navegador do ambiente publicado **não foi reproduzido nesta tarefa**.
Impacto: um link chamado PDF não comprova documento real nem prontidão técnica.
Implementado: **somente** gerador local de prévia PDF real, nunca final. Corrigir o link existente/endpoint ainda pendente.
Aceite: download autenticado do artefato imutável correto, conteúdo completo, 390px/notebook, sem composição/custos indevidos.
Teste: 2 testes `epa-preview.test.js`, demonstração de 3 páginas inspecionadas. Não é prova da integração do botão existente.
Migração/reversão: integrar sem reclassificar documentos antigos como emitidos; código novo isolado pode ser removido sem alteração de dados.

### AUD-EPA-02 / OP não verifica prontidão industrial ou EPA final no servidor / P0

Fonte: reunião “EMISSÃO DE OPS só ocorre QUANDO TIVER TUDO PRONTO”; roteiro §§5, 6.4–6.6.
Observado: `functions/emissao_op.js:88` aceita origem técnica em rascunho e nenhuma EPA. A chamada `functions/index.js:71` usa esse preparador numa transação; não há portão EPA ali. `public/shared/prontidao-op.js:19` verifica parte da prontidão na tela, mas não substitui esse servidor e aceita legado com avisos.
Reprodução sintética: `functions/test/epa-baseline-audit.test.js`, cenário `AUD-EPA-02`, perfil PCP. `prepare` retorna lote mesmo com fórmula/BOM em RASCUNHO e sem EPA.
Causa confirmada: validação server-side cobre saldo/lista de consumo, não a cadeia de aprovações/documento final. Não foi emitida uma OP real.
Impacto: contorno da tela pode criar OP sem comprovação industrial; distinguir emissão/rascunho de autorização de execução.
Correção proposta: OP rascunho sem empenho; documento final recuperável; portão de execução no servidor+regras com revisões exatas e estoque elegível. **Não corrigido no fluxo atual neste incremento**; não ligar uma trava parcial com dados/decisões faltantes.
Aceite: chamada direta recusa finalização sem EPA e nenhuma falha de PDF libera execução. Validar também os consumidores `form.html`/Manipulação, não só emissão.
Risco/reversão: não bloquear OPs históricas silenciosamente; ensaio de compatibilidade e plano de migração antes da publicação.

### AUD-EPA-03 / Consumo e substituto ainda confiados ao payload / P0

Fonte: roteiro §§4 OP, 6.4 e 6.6; solicitação anterior de barreira no servidor.
Evidência: `functions/emissao_op.js:40` confere presença de chaves `f_*`/`b_*`, total de percentuais e material cadastrado, mas não recalcula quantitativos nem compara o código da linha com o da revisão aprovada.
Reprodução: dois cenários adicionais de `epa-baseline-audit.test.js` demonstram consumo positivo arbitrário `0,001` e material `OUTRA` sob a chave original. Ambos geram OP/empenho no objeto **em memória**. Teste passar aqui confirma o defeito, não proteção.
Impacto: saldo pode parecer suficiente com quantitativo subinformado; composição/substituição diverge da fonte técnica. Não foi verificado que alguém explorou isso em produção.
Correção proposta: motor autoritativo de dimensionamento/revisões/conversões; substituição com decisão técnica versionada e revalidação EPA/BOM/fórmula; não simplesmente proibir toda substituição legítima ou aceitar justificativa livre como aprovação.
Aceite: payload adulterado é recusado e quantidades resultam das fontes/conversões aprovadas, com testes equivalentes ao cálculo real de massa/volume/perdas.
Status: pendente; risco de migração alto porque a tela atual permite ajustes/substituições. Precisa inventário das regras vigentes e do formato dos registros antes de mudar o comportamento.

### AUD-EPA-04 / Aprovação documental antiga atribuída ao próprio gerador / P0 (risco confirmado no desenho; exploração não testada)

Fonte: roteiro §6.3, política de ações e segregação.
Evidência: `firebaseApi.js:3340` cria tarefa de documento com `responsible_id` do gerador; `firebaseApi.js:3269` processa decisão de tarefa e pode marcar documento `active_for_operation=true`. A escrita de coleções CRM continua compartilhada entre setores autorizados (`database.rules.json:726`), não constitui política industrial por ação/revisão.
Causa: fluxo documental genérico não equivale a conferência independente de EPA industrial.
Impacto: não reaproveitar `active_for_operation` como autorização de OP. O snapshot antigo inclui composição; visibilidade do documento precisa respeitar a permissão da fórmula.
Correção parcial local: reducer novo impede autoaprovação, perfil inativo, mudança de fonte/política e aprovação sem política confirmada. O fluxo/documentos antigos e regras não foram modificados.
Aceite: papéis aprovados por Marlos; rejeição por API e por escrita direta; histórico autoritativo e nenhuma dispensa automática do administrador. Requer novo teste de regras, não só teste de reducer.

### AUD-EPA-05 / Referência PDF tem divergência de identificação / P1

Fonte: arquivo A–G, grade A–H e última descrição master da única página renderizada.
Observado: oito variantes, última MR178/H na grade e MR178/F na master; placeholders 0000/00/0000/0KG. Coluna “Variações” 0/2/7/0 sem semântica informada. Numeração de seção pula 3.
Ação: nenhuma retificação de dado real. Fixture inteiramente sintética com oito variantes; validador rejeita SKU duplicado, lote zero, data impossível e peso zero. Exige aplicabilidade explícita e não interpreta “Variações” como consumo.
Aceite para produto real: responsável resolve correspondência H/F e explica a coluna; lote/quantidade/peso reais preenchidos por ocorrência. Não copiar assinaturas do PDF.

## Incremento local entregue

`functions/epa.js` (validação/snapshot/hash), `functions/epa-revisions.js` (estados/revisões), `functions/epa-preview.js` (prévia), fixtures sintéticas, testes e `scripts/epa-demo.js`.

Nenhum endpoint novo. Sem edição de `functions/index.js`, telas, bundles ou regras. Sem reserva/baixa, sem API de aprovação em produção, sem emissão final. Os novos módulos ainda não comprovam prontidão do sistema inteiro.

Artefato: `scratch/epa-demo/epa-demonstracao.pdf`, A4, 3 páginas, variantes DEMO/A–H. Todas as páginas foram renderizadas e inspecionadas; corrigidos rodapé que criava páginas vazias e quebra do aviso de controle. Há cabeçalho/marca/numeração em todas. Prévia textual deliberadamente não incorpora imagens, assinaturas nem símbolos GS1; o PDF de referência orientou as seções, não foi reproduzido como identidade de cliente.

Evidências: 33 testes do núcleo/revisões/preview + 3 provas de defeitos + 5 OP existentes = **41 testes Node**; CRM 408/2 ignorados; adaptador 14/14. O conjunto deve ser reexecutado após mudanças. Build CRM não repetido porque nenhuma fonte frontend mudou; regras/E2E/móvel não executados para a nova EPA porque integração ainda não existe.

## Bloqueios e continuação

Pergunta enviada: quem aprova a EPA industrial (Qualidade, Qualidade+Engenharia ou outra política). Essa decisão bloqueia a aprovação/emissão final, não a auditoria independente e preparação.

Também pendem resolução das fontes reais, unidades/conversões, preparação OP sem reserva, API/regras, armazenamento privado provisionado, emissão idempotente/recuperável, ativos, código de barras, UI e E2E. Ver `PLANO_CORRECOES_INDUSTRIAIS.md` e limites em `ESPECIFICACAO_EPA.md`.

As cinco pendências externas da segurança anterior continuam em `CORRECOES_SEGURANCA_20261103.md`; esta tarefa não as encerra por produzir documentos locais.
