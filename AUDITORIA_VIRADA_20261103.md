# Conferência de virada: oficial × ERP atual

Data: **03/11/2026**, horário de Brasília. Pedido: comparar antes da entrada em produção prevista em aproximadamente três horas.

## Parecer executivo: NÃO RECOMENDO A VIRADA TOTAL NO ESTADO OBSERVADO

**Os sistemas não estão exatamente iguais.** A migração preservou os registros principais que consegui conferir, mas há diferenças funcionais relevantes, contadores que repetiriam números, acessos não reconciliados e defeitos industriais reproduzidos. Site saudável não comprova que a fábrica pode operar sem esses riscos.

Esta foi uma auditoria **somente leitura**. Não sincronizei dados, ativei gatilhos, alterei usuários/regras/saldos, emiti documentos reais nem publiquei código. Os scripts novos só autenticam/consultam e produzem artefatos locais. A decisão final da virada é dos responsáveis operacionais; este relatório não é aceite industrial.

## 1. Evidência e limites

- Oficial: `https://prod-kuryos.web.app/historico.html`; configuração pública confirmou RTDB `prod-kuryos-default-rtdb`.
- Atual: `https://kuryoserp.com.br`, RTDB `erpkuryos-default-rtdb`, release confirmado na VPS `43c63ad3801f9f6e1973bb1288d8005e2ed28390`; HEAD local `ed2bdb3` contém documentação posterior.
- Fotografia do destino: **05:52:51–05:52:55**. Fotografia dos primeiros módulos oficiais: **05:52:56–05:53:01**. Leitura complementar dos caminhos encontrados no código: **06:00:56–06:00:58**.
- O destino foi lido integralmente por Admin SDK. No oficial, a conta fornecida autenticou, mas a leitura da raiz foi negada. Consultei caminhos de módulos conhecidos e caminhos adicionais encontrados nos scripts públicos, respeitando as permissões de cada um.
- **117 caminhos-raiz conhecidos examinados: 92 legíveis e 25 negados.** Dos legíveis, 67 equivalentes (43 com dados e 24 vazios nos dois lados), 25 diferentes. Isso não prova ausência de coleções desconhecidas, nem cobertura integral das coleções negadas.
- As leituras dos módulos oficiais não são uma transação global. Novos lançamentos posteriores exigem outra fotografia/delta no horário real do corte. O export de 01/11 foi usado apenas como terceira referência histórica, não como substituto da leitura de hoje.
- Comparei também **263 recursos públicos** entre páginas, JavaScript e CSS encontrados no inventário local, menu e dependências das páginas. Não exportei o código privado das Functions do oficial, suas regras, objetos Storage nem identidades Auth completas; não alego equivalência dessas camadas.

Fotografias e divergências por registro estão em `scratch/virada-20261103/`, ignorado pelo Git e com acesso NTFS restrito ao usuário da estação. Credencial de login não foi gravada em scripts, snapshots ou relatório; tokens ficaram somente na memória do coletor. Nenhum export real foi adicionado ao repositório.

Hashes SHA-256 dos JSONs brutos coletados:

- Destino: `745e80e0224528890fc02bcf4b50f8f53552d809152e35cb2a1a1d42d9bc50db` — 24.560.548 bytes.
- Oficial, coleta principal: `b6c0936d919da20fe91ab12b39c4f3f6245eff18bb06d7308f902ce805b23a55` — 17.526.943 bytes.
- Oficial, complemento: `15af0e79336223817b0f2dca7d690bd17e493558d76ea42a99cbf0637b36425d` — 604 bytes (caminhos adicionais legíveis estavam vazios).

## 2. Dados principais

Contagem por chave de registro de cada coleção. `estoque_lotes` tem 154 grupos de item e **295 lotes individuais**, não apenas 154 lotes.

| Coleção | Oficial | Atual | Resultado na fotografia |
|---|---:|---:|---|
| Materiais | 1.012 | 1.012 | Nenhum ausente; 1.001 idênticos, 11 com campos adicionais no atual |
| Produtos | 405 | 408 | Nenhum oficial ausente; 393 idênticos, 12 com campos adicionais, 3 exclusivos do atual |
| Clientes | 61 | 64 | Os 61 oficiais idênticos; 3 exclusivos do atual |
| Fornecedores | 424 | 424 | Idênticos |
| Fórmulas | 231 | 242 | Nenhuma oficial ausente; 217 idênticas, 14 preservadas com campos adicionais, 11 exclusivas |
| BOM | 272 | 301 | Nenhum oficial ausente; 252 idênticos, 20 preservados com campos adicionais, 29 exclusivos |
| Especificações | 276 | 296 | Nenhuma oficial ausente; 266 idênticas, 10 preservadas com campos adicionais, 20 exclusivas |
| OPs | 1.490 | 1.494 | 1.485 idênticas; 5 diferentes; 4 exclusivas do atual |
| Demandas/pedidos PCP | 396 | 402 | 392 idênticos; 4 diferentes; 6 exclusivos do atual |
| Pedidos comerciais | 78 | 82 | 73 idênticos; 5 diferentes; 4 exclusivos do atual |
| Pedidos de compra | 80 | 82 | Os 80 oficiais idênticos; 2 exclusivos do atual |
| Registros de apontamento | 403 | 403 | 401 idênticos; 2 com campos adicionais no atual |
| Estoque agregado | 316 | 321 | 303 idênticos; 13 preservam conteúdo oficial e têm campos extras; 5 exclusivos |
| Estoque por lote | 154 grupos / 295 lotes | 154 grupos / 295 lotes | Idêntico |
| Conferências PA | 88 | 88 | Idênticas |
| Liberações de linha | 30 | 30 | Idênticas |

No conjunto dos caminhos legíveis há 8.873 registros/chaves de primeiro nível idênticos, 115 diferentes, 38 exclusivos do oficial e 136 exclusivos do atual. Essas contagens incluem configurações, índices e auditoria; **não significam 38 pedidos ou OPs perdidos**. Noventa e seis das diferenças apenas acrescentam campos no destino, preservando todos os campos presentes na fonte.

### Diferenças que exigem decisão, não cópia cega

- OPs `26264-19` e `26264-20`: oficial **Não Iniciado**, atual **Programado**. O pedido relacionado `PED-0001__PRF-BIOF-0007` tem a mesma divergência. Não concluir que um lado está certo apenas por ser mais novo; conferir programação aprovada.
- Quatro OPs `26301-02` a `26301-05`, SKU `CAB-GUST-0001`, mil unidades cada, só existem no atual. Foram emitidas em 28/10 e estão **Não Iniciado**. Precisam de confirmação operacional; não as rotulei automaticamente como testes e não as excluí.
- Há pedidos com SKU contendo `TEST` e registros exclusivos do CRM. Precisam de revisão antes de alimentar carteira/MRP; o nome por si só não autoriza exclusão.
- Existem chaves de pedido `0011__…` e `11__…` para o mesmo SKU, com quantidades e estados diferentes. É uma possível ambiguidade de chave de negócio, não duplicidade confirmada para apagar.
- Aliases novos/achatados do atual decorrem da reconciliação aprovada das 46 referências. Não devem ser revertidos para as cadeias antigas apenas para obter igualdade bruta.
- Eventos de e-mail, filas, auditoria, usuários e configurações têm semântica própria. Reimportar o estado do oficial pode reenviar mensagens ou desfazer controles de acesso.

## 3. Bloqueios prioritários

### VIR-01 — P0: próximos números comerciais repetem documentos existentes

Fotografia do atual:

| Sequência | Contador atual | Próximo número | Já existe? | Maior número observado |
|---|---:|---|---|---:|
| Pedido de compra | 19 | **PC-0020** | Sim | 81 |
| Solicitação de compra | 10 | **SC-0011** | Sim | 39 |
| Processo de cotação | 14 | **COT-0015** | Sim | 44 |

Evidência de código: `public/shared/utils.js:924`, `nextSequential`, incrementa somente o contador; não procura o maior número existente. `public/compras.html:4593` e `:4782` usam a sequência para o número do PC e uma push key para persistir o registro. Isso pode criar **números de documento duplicados**, embora a push key evite sobrescrita física do mesmo registro.

O oficial tem contadores diferentes (PC 81, SC 39, COT 44). Também divergem sequências de material, SKU e lote. **Não copiar todo `config`**: em algumas famílias o atual está à frente da fonte. Correção deve calcular máximos por domínio, validar formato/escopo e aplicar transacionalmente com backup, sem diminuir nenhum contador. Nada aplicado nesta auditoria.

### VIR-02 — P0: acesso dos operadores não está reconciliado

- Oficial: 16 perfis cadastrados, com papéis não pending na fotografia. Isso não prova que todas as identidades oficiais estejam habilitadas no Auth do oficial.
- Atual: 19 perfis RTDB, **9 identidades Auth habilitadas**.
- Apenas **2 dos 16 perfis oficiais** encontraram correspondência por e-mail normalizado com Auth habilitado **e perfil ativo no UID correto** do destino.
- Treze perfis oficiais não encontraram identidade Auth por e-mail; outro não passou na correspondência completa. Total: **14 sem prontidão de acesso comprovada**.
- No destino há **13 perfis sem identidade Auth correspondente** e **3 identidades Auth sem perfil no mesmo UID**.

Não criar contas automaticamente pelo nome nem copiar role/admin entre bases. A lista individual de correspondências está em `scratch/virada-20261103/access-private.json`, com planilha de conferência em `acessos-para-conferencia.csv` na mesma pasta restrita. Requer responsável identificar quem operará cada setor, provisionar/convidar corretamente e comprovar login/permissão com as contas reais. Senhas do oficial não foram exportadas nem presumidas iguais.

### VIR-03 — P0: expedição não lê o campo real de validade

Confirmado em `public/shared/expedicao.js:82` e `functions/expedicao_regras.js:82`: o portão atual testa `lote.validade`. O código público do oficial tem `validadeLote`, que prioriza `dataValidade` e usa o campo antigo apenas como fallback.

Nos 295 lotes lidos, 42 têm `dataValidade` e somente 1 tem `validade`. `functions/faturamento_carga.js:49` também monta validade apenas pelo campo antigo, podendo produzir dados de faturamento incompletos.

Prova: `functions/test/virada-expiry-audit.test.js`, lote **sintético** vencido em `dataValidade`, com outros pré-requisitos satisfeitos, foi considerado disponível tanto pela regra de frontend quanto pela de servidor. O controle com o campo legado foi bloqueado. **Dois testes passaram demonstrando a falha, não uma correção.**

A análise dos dados reais encontrou um lote com saldo positivo e `dataValidade` anterior à data auditada, mas **zero PA vencido atualmente considerado disponível** nesse conjunto: outros portões o impedem. Isso não elimina o defeito nem demonstra que houve expedição indevida.

Aceite antes de liberar expedição: corrigir servidor/tela/ordenação FEFO/snapshot fiscal, testar os dois campos, datas inválidas e ausência de validade sem inventar prazo.

### VIR-04 — P0: gatilhos e agendas continuam desligados

Leitura direta e restrita da configuração da VPS confirmou:

```text
DISABLE_TRIGGERS=1
DISABLE_SCHEDULE=1
```

O backend responde saudável com 39 funções, mas saúde não significa que suas escutas e rotinas agendadas estejam executando. Antes de ativar, revisar fila pendente, eventos históricos, idempotência e responsabilidades. **Não ativei:** isso poderia disparar processamentos/e-mails/efeitos de negócio. A lista específica de automações esperadas no Dia D precisa de aceite.

### VIR-05 — P0 industrial: portão de OP ainda incompleto

Reexecutei as três provas de `functions/test/epa-baseline-audit.test.js`: preparador atual aceita OP sem EPA final, origem técnica em rascunho, quantidade positiva arbitrária e material trocado sob a chave original. Provas são em memória; nenhuma OP real emitida.

Detalhes e correção necessária em `AUDITORIA_INDUSTRIAL_EPA.md`. O incremento publicado da EPA é núcleo/política, **não uma tela ou autorização industrial pronta**. Não considerar esse portão corrigido por ter publicado o módulo.

### VIR-06 — P1/operacional: estoque igual ao oficial não é estoque conciliado

Ambas as bases têm **77 saldos agregados negativos**, 219 positivos e 295 lotes. A chave `config/emitirOp/bloquearSemSaldo` não está true. Não existe nesta auditoria comprovação de contagem física/conciliação assinada.

As estatísticas antigas de 37 saldos/11 negativos em documentação histórica ficaram desatualizadas depois da importação. As quantidades acima são as medidas de hoje. **Não ligar a trava para “corrigir” números nem zerar estoque.** Fazer contagem/conciliação ou aprovar expressamente um piloto controlado com restrições; não anunciar MRP/FEFO/disponibilidade confiáveis por igualdade entre bancos.

## 4. Diferenças funcionais publicadas

Inventário de 263 recursos: **96 idênticos**, **94 diferentes**, **55 só no atual**, **17 só no oficial** e 1 inexistente nos dois (`index.html`). Entre os 67 caminhos de dados equivalentes há 24 vazios, portanto não inflar isso como módulos validados em operação.

Os 17 recursos encontrados no oficial e não servidos pelo atual estão abaixo. São **16 scripts e 1 CSS**, não necessariamente 17 funções independentes. A existência/nome de uma função não prova o comportamento completo; a classificação é presença/ligação estática, sem salvar nada nas telas oficiais.

| Recurso oficial | Função/efeito observado no código publicado |
|---|---|
| `shared/ajuste-pc.js` | Revisar PC enviado ou encerrar saldo parcial, com motivo/histórico; ligação em `compras.html:2190` |
| `shared/consulta-estoque-pdf.js` | Relatório PDF de consulta/totalização por unidade |
| `shared/dados-nf.js` | Derivar fabricação/validade/caixas/peso e validar solicitação fiscal; relevante ao VIR-03 |
| `shared/entrada-avulsa-pa.js` | Entrada de PA sem OP, quarentena, posterior vínculo ao pedido |
| `shared/exportar-cadastros.js` | Exportação consolidada dos cadastros |
| `shared/gestao-usuarios.js` | Gestão/diagnóstico de perfis; nosso CRUD usa outro serviço e não deve ser substituído cegamente |
| `shared/horas-turno.js` | Horas trabalhadas recortadas por turno/pausa e conferência do período; ligado ao apontamento |
| `shared/nome-material.js` | Normalização e validação de nome de material |
| `shared/painel-movimentos.js` | Histórico de movimentos WMS por natureza/data, sem somar unidades incompatíveis |
| `shared/painel-movimentos-tela.js` | Interface do painel de movimentos |
| `shared/painel-movimentos.css` | Estilo desse painel |
| `shared/pedidos-do-material.js` | Pedidos/SKUs que usam um material e filtros por cliente |
| `shared/pendencias-produto.js` | Painel de produto sem fórmula/BOM/especificação aprovada |
| `shared/pesos-volumes.js` | Conferência/interpretação de pesos por volume |
| `shared/rascunho-cq.js` | Autosave/restauração de laudo/análise de granel; ligado em `qualidade.html:1358` e `:1446` |
| `shared/relatorio-entradas.js` | Histórico/filtros/CSV de recebimentos; ligado em `logistica.html:911` |
| `shared/responsavel-comercial.js` | Carteira/atribuição comercial e responsáveis selecionáveis |

Várias páginas com o mesmo nome têm comportamentos diferentes: Compras, Apontamento, Qualidade, Logística, Gestão Comercial, Expedição, Cadastros, Dossiê, entre outras. Recursos próprios de CRM/P&D/Financeiro/Controladoria e segurança também explicam diferenças do nosso lado. Exemplo intencional: o cadastro público `handleRegister` do oficial não deve ser reintroduzido no nosso login.

**Conclusão funcional:** não há paridade exata. Não é seguro copiar os arquivos do oficial por cima: preservaria alguns recursos mas poderia remover módulos, regras e travas atuais. A lista completa por recurso/hashes e funções nomeadas exclusivas está em `scratch/virada-20261103/assets-report.json`. Hash igual confirma bytes normalizados daquele recurso, não servidor/regras/fluxo inteiro iguais; hash diferente também não equivale automaticamente a bug.

## 5. Áreas sem comprovação integral

25 caminhos da referência negaram leitura: `clientes_logo`, `contadores_lote_interno`, `correcoes_estoque`, `ctl`, `custos`, `devolucoes_operacoes`, `email_notifications_state`, `emails_diretoria`, `erp`, `feedback_diretorio_por_uid`, `feedback_feitos`, `fin`, `importacoes_dados`, `lotes_internos`, `materiais_chave`, `notificacoes_op_encerrada`, `notificacoes_pesagem`, `pendencias_setor`, `recebimentos_operacoes`, `resultado`, `rh_avaliacoes_por_avaliador`, `rh_ferias_por_gestor`, `servicos`, `solicitacoes_cadastro_material`, `usuarios_publico`.

Negação **não significa coleção vazia ou dado ausente**. Marlos esclareceu que o último JSON já está no sistema. Confirmei o arquivo de 01/11 e o mesmo hash registrado na importação; não é necessário reenviá-lo para a conferência histórica nem reimportá-lo. Ele permite conferir nove das coleções negadas, conforme complemento abaixo, mas não transforma a fotografia histórica em leitura ao vivo de 03/11. Não solicitei credencial administrativa em texto nem tentei contornar regras. Mesmo um export completo não comprova telas, Storage, identidades ou efeitos das Functions: exigem evidência própria.

## 6. Testes executados e resultado real

- Comparador: 4 testes aprovados (negação não vira ausência, comparação bidirecional, complemento sem sobrescrita, diferença frente ao export antigo).
- Expedição: 2 provas aprovadas demonstrando falha existente/controle; **não corrigida**.
- OP: 3 provas existentes reexecutadas confirmando os defeitos conhecidos.
- Navegação: 39 perfis sem duplicação/negado no inventário do menu antigo × novo; isso não compara funcionalidade integral do oficial.
- Prontidão OP: teste existente aprovado; não substitui o portão de servidor incompleto.
- FEFO embalagens: 19 asserções aprovadas; não substitui a falha de validade da expedição de PA.
- E2E `run_fluxo_ponta_a_ponta_test.js`: primeira tentativa sem Playwright na resolução padrão; repetição com a dependência isolada existente percorreu orçamento/aceite/cadastro/pedido e parou por timeout na emissão de OP. O harness não implementa o novo callable `emitirOpServidor`; **não classifico esse timeout sozinho como defeito comprovado da produção, nem como E2E aprovado**.
- HTTPS/saúde e containers atuais: aprovados, release conferido. Nenhum lançamento em produção foi usado como teste.

## 7. Condições para a janela de três horas

Ordem de prioridade recomendada, sem promessa de concluir toda a migração nessa janela:

1. **Não liberar novos documentos de Compras** antes de corrigir/retestar as três sequências (VIR-01).
2. Conferir lista real de operadores; resolver Auth/perfil/tenant/módulos e testar uma conta de cada setor. Só copiar RTDB não migra login (VIR-02).
3. Corrigir/retestar validade da expedição/faturamento e manter expedição controlada até o aceite (VIR-03).
4. Revisar escutas/agendas/filas e decidir o que ligar; não processar histórico sem ensaio/idempotência (VIR-04).
5. Fechar o portão autoritativo de OP ou restringir explicitamente emissão/execução; EPA ainda não integrada (VIR-05).
6. Resolver as diferenças de programação, as OPs exclusivas e os possíveis registros de teste/ambiguidade de pedido com o PCP; não apagar por suposição.
7. Confirmar corte único, bloquear lançamentos no antigo no horário aprovado, fotografar novamente, conferir delta e totais e manter rollback. Não operar as duas bases simultaneamente.
8. Aceite Logística/Qualidade/PCP/Compras/Direção, com estoque conciliado ou restrição operacional formal. Os dados de saldo negativos não desaparecem por migrar.

Se esses portões não forem fechados, a alternativa de menor risco é **adiar a virada total** ou limitar o novo sistema a consulta/piloto autorizado sem emissão, expedição ou automações financeiras. Trocar somente o domínio/site não resolve esses riscos.

## 8. Artefatos e repetição

Scripts locais novos em `scripts/auditoria-virada/`: `collect.js`, `assets.js`, `compare.js`, `access.js`, `details.js`. Não executam importação/restauração nem alterações de regras/usuários/estoque. O único POST é a autenticação normal na referência.

Dados reais privados: manifests/fotografias, `comparison-private.json`, `comparison-summary.json`, `readiness-summary.json`, `access-private.json`, `assets-report.json` e os recursos públicos consultados, todos sob `scratch/virada-20261103/`. A coleta recusa sobrescrever suas fotografias, exigindo novo destino/rodada para novo corte. Não compartilhar os JSONs brutos em repositório ou relatório público.

O JSON já disponível foi confirmado e usado no complemento abaixo. A correção dos bloqueios não deve ficar esperando outra importação; uma fotografia de corte mais recente só é necessária para atestar o estado atual das áreas sem leitura ao vivo. **Nenhuma autorização de correção/importação foi inferida do pedido de conferir.**

## 9. Complemento — último JSON já importado, confirmado com Marlos

Arquivo: `prod-kuryos-default-rtdb-export (1).json`, 25.276.514 bytes, modificação local em 01/11/2026. SHA-256: `E29F53144DB5D7BF6F643A47C83C445A6C6EF054B6614791C094C4B3D718971D`, exatamente o documentado em `AUDITORIA_REGULARIZACAO_46_20261102.md`. Não encontrei outro export RTDB mais recente nos Downloads/JSONs anexados consultados.

O export tem 76 raízes. Nove das 25 coleções sem leitura ao vivo estão presentes nele; as outras 16 não constavam desse export, o que não comprova inexistência atual.

| Coleção negada ao vivo | Comparação do export 01/11 com destino 03/11 |
|---|---|
| `contadores_lote_interno` | Idêntico (1 registro/chave) |
| `correcoes_estoque` | Idêntico (1) |
| `feedback_diretorio_por_uid` | Idêntico (1) |
| `lotes_internos` | Idêntico (113) |
| `recebimentos_operacoes` | Idêntico (5) |
| `email_notifications_state` | 2 registros com diferenças |
| `emails_diretoria` | Export 9 × destino 8; 6 diferentes e 1 exclusivo do export |
| `notificacoes_op_encerrada` | Export 131 × destino 43; 88 exclusivos do export, 2 diferentes |
| `notificacoes_pesagem` | Export 80 × destino 1; 79 exclusivos do export, 1 diferente |

Esses últimos quatro nós são filas/estado técnico de automações, não pedidos ou materiais que devam ser copiados cegamente. As diferenças reforçam a necessidade de revisar deduplicação/processamento histórico antes de ativar gatilhos e agendas. **Não houve importação, restauração ou reenvio de notificações.** Os 25 caminhos permanecem não verificados *ao vivo*, com nove agora também conferidos historicamente.
