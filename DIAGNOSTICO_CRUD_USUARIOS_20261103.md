# Diagnóstico do CRUD de usuários — 03/11/2026

> Registro do diagnóstico anterior às correções. Após o “prossiga” do Marlos,
> as correções e seus limites passaram a ser acompanhados em
> `CORRECOES_VIRADA_ACESSOS_20261103.md`. Os testes de prova foram convertidos
> em regressões; não interpretar o estado histórico abaixo como resultado pós-correção.

## Resultado e limites

O erro mostrado pelo Marlos foi reproduzido com o SDK real da tela. As ações administrativas compartilham um endereço incorreto na VPS. Além disso, foram reproduzidas três falhas de consistência/recuperação em memória. Não houve alteração em contas reais, envio de e-mails, mudança de regras, correção de código operacional ou deploy nesta investigação.

Inspeção de `public/usuarios.html`, `public/auth_check.js`, `functions/identidade_acesso.js`, wrapper em `functions/index.js`, adaptador HTTP e Caddy. Verificação HTTP sem token em produção; demais mutações exclusivamente com dados fictícios.

## Achados

### USR-01 — P0: chamada administrativa perde `/api`

- `public/auth_check.js:7` configura `https://kuryoserp.com.br/api`; a adaptação em `:17` usa `app.functions(customDomain)`.
- A tela carrega Firebase compat **10.7.0** e captura `httpsCallable('gerenciarUsuario')` em `public/usuarios.html:506`.
- O SDK dessa versão descarta o caminho do custom domain. Navegador isolado com os dois scripts reais do Google, configuração fictícia e interceptação de todas as requisições da página enviou POST para **`https://kuryoserp.com.br/gerenciarUsuario`**.
- Caddy só encaminha `/api/*` ao backend. Prova sem autenticação em produção: `/gerenciarUsuario` = **404**, `/api/gerenciarUsuario` = **401 UNAUTHENTICATED**, com mensagem legítima da função. A segunda resposta é a proteção correta, não defeito de autorização.
- Impacto: criar, editar, salvar funções/módulos, voltar ao padrão, desativar/reativar, revogar sessões, solicitar recuperação e excluir usam a mesma callable e estão sujeitos ao mesmo bloqueio. Outros módulos que usam essa adaptação global também precisam ser conferidos; não foram certificados nesta auditoria de Usuários.
- A mensagem `not-found` da UI diz que a conta não existe mais, confundindo 404 de infraestrutura com ausência de identidade.
- Correção proposta: preservar o caminho real com chamada por URL explícita suportada pelo SDK e testar o adaptador compartilhado. Não expor o serviço por rota raiz nem remover autenticação para contornar o problema.

### USR-02 — P1: perfil órfão não tem caminho de regularização

- A tabela lista RTDB, sem confirmar correspondência de UID no Firebase Auth.
- `public/usuarios.html:904` recusa criar quando o e-mail já existe na lista, inclusive para perfil sem conta.
- Editar conta exige Auth existente (`functions/identidade_acesso.js:280`). Reset também faz `getUser`; `auth/user-not-found` não está traduzido adequadamente pelo wrapper, podendo virar erro interno genérico. A orientação da UI para criar novamente contradiz o bloqueio anterior.
- Prova em memória: invocar criação no serviço com e-mail de perfil órfão cria novo UID, preservando o antigo e deixando **dois perfis com o mesmo e-mail**. O bloqueio do navegador não é uma garantia do servidor.
- A auditoria anterior identificou 13 perfis com e-mail sem conta Auth no mesmo UID, no snapshot de 03/11. Não foi feita nova enumeração de contas nesta tarefa; não atribuir automaticamente essa situação à pessoa do print.
- Correção proposta: diagnóstico servidor de vínculo Auth/perfil e regularização explícita, preservando UID histórico quando seguro. Colisão por e-mail em outro UID exige decisão auditável, sem fusão automática nem promoção de permissões.

### USR-03 — P1: módulos podem mudar apesar da resposta de erro

- `functions/identidade_acesso.js:334` persiste o perfil antes de revogar e auditar, sem compensação para falha posterior nesse ramo.
- Prova: revogação simulada lança erro; a chamada rejeita, mas os novos módulos permanecem no banco falso e não existe evento de auditoria.
- A UI informa erro, embora a alteração já esteja aplicada. Repetir cegamente a operação não é uma recuperação confiável.
- Correção proposta: estado de operação/idempotência, concorrência e compensação ou resultado parcial explícito, mantendo bloqueio seguro e registro recuperável. Não desfazer marca de segurança sem analisar tokens já emitidos.

### USR-04 — P1: falha de auditoria após edição deixa operação parcial

- Em `atualizar`, a compensação cobre falha de persistência do perfil, mas não falha da revogação/auditoria posterior (`:295–296`).
- Prova: escrita da auditoria simulada falha; chamada rejeita, porém Auth e perfil já contêm o novo e-mail.
- Outros ramos também auditam após seus efeitos; a presença de `auditar()` não comprova atomicidade entre Auth, RTDB e log. Nem todos esses cenários de falha foram reproduzidos.
- Correção proposta: operação durável/reconciliável e resposta que não afirme que nada mudou quando houve efeito parcial. Testar interrupções em cada fronteira.

### USR-05 — P2: resumo conta módulos negados como liberados

- `salvarModulos` grava `false` para Manipulação/Rotulagem desmarcadas, mas `public/usuarios.html:706` usa `Object.keys(marcados).length` para o aviso de quantidade liberada.
- Inspeção determinística: duas chaves `false` contam como dois módulos, embora nenhum esteja liberado. Isso afeta a mensagem; não comprova concessão indevida de acesso.
- Correção proposta: contar somente valores `true`.

## Cobertura executada

| Fluxo | Verificação disponível | Limite |
|---|---|---|
| Listagem | Código de leitura RTDB e screenshot | Não certifica existência de Auth |
| Criar/editar | Suíte de serviço em memória aprovada; falhas acima reproduzidas | Nenhum cadastro real alterado |
| Funções/reativação | Serviço em memória aprovado; rota real reproduzida com payload fictício interceptado | Não validado ponta a ponta em produção |
| Módulos/padrão | Contratos UI aprovados; injeção de falha reproduzida | Sem garantia de recuperação após falha |
| Desativar/excluir | Suíte de serviço aprovada, incluindo proteção própria e arquivo | Sem exclusão/bloqueio de pessoa real |
| Recuperação/revogação | Serviço/contratos inspecionados e testados em memória | Entrega de e-mail não ensaiada |
| Último ADM/login recente | Guardas testadas na suíte existente | Fake transacional não substitui corrida real no emulador |

Executados: `run_identity_access_test.js` aprovado; `run_identity_access_ui_test.js` **24 contratos**; `run_render_functions_test.js` **14/14**. Novos diagnósticos: `run_identity_route_audit_test.js` reproduz USR-01 com SDK real; `run_identity_failure_audit_test.js` reproduz três falhas (USR-02..04). Testes diagnósticos verdes significam **falha demonstrada**, não falha corrigida.

O teste de rota usa Playwright/Chrome isolado e baixa os scripts públicos oficiais fixados pela própria página. Nenhuma chamada mutável sai para o ERP: todas são interceptadas. Para executar nesta estação, definir `PLAYWRIGHT_MODULE` para `scratch/operacao-deps/node_modules/playwright`.

## Ordem recomendada

1. Corrigir e testar o roteamento compartilhado, incluindo erro de infraestrutura distinto de usuário ausente.
2. Implementar regularização Auth/perfil com UID preservado e relatório prévio, sem recriar pessoas automaticamente.
3. Tratar operações parciais, auditoria e repetição/concorrência no serviço.
4. Corrigir a contagem e exercitar todos os botões num ambiente isolado com Auth/RTDB, inclusive e-mail capturado e falhas de rede.
5. Somente após autorização de correção/publicação: deploy por commit, verificar versão e roteiro de aceite, sem testes destrutivos em contas reais.

**Não considero o CRUD aprovado para operação a partir desta auditoria.**
