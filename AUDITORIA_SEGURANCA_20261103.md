# Auditoria de segurança do ERP Kuryos — 03/11/2026

## Resultado

Há falhas de autorização de gravidade alta demonstradas. O sistema não deve ser
considerado seguro apenas porque exige login ou porque o npm audit retornou zero.
A revisão não demonstrou invasão ocorrida. Não houve investigação forense completa
nem exploração em produção; portanto também não se pode afirmar ausência de invasão.

Escopo: repositório na branch `hostinger-deploy`, aplicação da VPS no commit
`ccb8022`, configurações Firebase Auth, regras RTDB publicadas, portas e containers
da VPS, dependências npm e respostas HTTP. Produção consultada somente em leitura.
Provas de escrita usaram exclusivamente dados sintéticos no emulador `demo-security`.
Esta é uma auditoria de código/configuração com provas dirigidas, não uma garantia
de descoberta de todas as vulnerabilidades do sistema.

## Achados e prioridade

| ID | Gravidade | Estado da evidência | Problema |
|---|---|---|---|
| SEC-01 | Alta | Confirmado em emulador; regra publicada conferida | Usuário do mesmo tenant escreve no CRM sem autorização setorial |
| SEC-02 | Alta | Confirmado em emulador; regra publicada conferida | Trilha `erp/{tenant}/audit_log` pode ser apagada pelo mesmo operador |
| SEC-03 | Alta | Confirmado em emulador; regra publicada conferida | Perfil pending lê fórmulas; 75 nós de primeiro nível exigem somente autenticação para leitura |
| SEC-04 | Alta | Código e prova isolada do adaptador | API não consulta revogação de ID tokens |
| SEC-05 | Alta, se aplicável em produção | Regra local; publicação não verificada | Storage permite acesso amplo e exclusão de evidências a qualquer autenticado |
| SEC-06 | Média | Exceção reproduzida somente em processo local | URL malformada causa rejeição assíncrona não tratada no backend |
| SEC-07 | Média | Configuração Firebase consultada | MFA desativado, inclusive para administradores |
| SEC-08 | Média | Código e configuração | Ausência de limitação explícita de chamadas e concorrência das APIs |
| SEC-09 | Média | VPS consultada | SSH permite root; fail2ban inativo; configuração efetiva completa depende de root |
| SEC-10 | Alta para recuperação | Evidência parcial da VPS | Backup externo e restauração operacional não demonstrados |
| SEC-11 | Média | Headers e containers consultados | CSP ausente; frontend root e sem limites explícitos de recursos |
| SEC-12 | Alta se a credencial continuar válida | Contexto fornecido pelo proprietário | Senha da aplicação oficial foi compartilhada na conversa |

### SEC-01 — autorização do CRM baseada apenas em empresa

`database.rules.json:719`, em `erp/$tenant`, concede `.read` e `.write` a qualquer
usuário cujo `tenant_id` corresponda ao caminho. Não exige função Comercial, P&D
ou módulo apropriado. A ausência de botão/menu no frontend não restringe o SDK.

Prova: `run_security_audit_rules_test.js` cria um usuário `production`, sem módulo
Comercial, com tenant `kuryos`. Sua alteração de nome em um cliente sintético do
CRM foi aceita. Escrita em `erp/outro` foi negada, confirmando que a falha é
horizontal entre setores da mesma empresa, não uma fuga entre tenants demonstrada.

Impacto: alteração indevida de dados comerciais e outros descendentes que não
tenham validações específicas impeditivas. Não se afirma que todas as validações
filhas sejam contornáveis: `.validate` continua aplicável a dados não excluídos.

Correção: retirar concessão ampla no pai; conceder por coleção/operação, função,
módulo e tenant. Transferir aprovações e operações administrativas ao servidor.
Testar a matriz de papéis com tentativas diretas ao banco, não apenas navegação.
Referência: https://firebase.google.com/docs/database/security/core-syntax

### SEC-02 — alteração e exclusão da trilha comercial

A mesma concessão no pai permite remover `erp/kuryos/audit_log/fixture`. A prova
isolada foi aceita. Assim, um usuário que altera registros pode apagar essa trilha.
`auditoria_acessos`, criada pelo módulo de identidade, tem proteção diferente e
não foi demonstrada vulnerável a essa operação.

Correção: gravação de auditoria exclusivamente pelo servidor, com campos de autor
derivados do token e eventos append-only; retenção em destino independente. Uma
negação `.write: false` no filho não anula uma concessão existente no pai.

### SEC-03 — confidencialidade insuficiente após autenticação

Há 75 nós de primeiro nível com `.read: "auth != null"`, entre eles fórmulas,
custos/preços, clientes, materiais e dados operacionais. O teste confirmou que um
perfil `pending`, sem módulo nem tenant, lê conteúdo sintético em `formulas`.
Isso inclui contas pendentes legadas existentes; o bloqueio de cadastro público
reduz criação de novas contas, mas não corrige a autorização dessas leituras.

Correção: exigir perfil ativo e autorização setorial por conjunto de dados;
separar projeções públicas internas mínimas. Revisar impacto nas telas antes de
publicar regras mais restritas. O bloqueio deve ocorrer no banco/servidor.

### SEC-04 — revogação de sessões não é imediata na API

`functions/render-server.js:129` usa `verifyIdToken(token)` sem `checkRevoked=true`.
O serviço de identidade chama `revokeRefreshTokens`, mas o adaptador continua
aceitando ID tokens assinados ainda não expirados sem consultar sua revogação.
Uma prova com Auth simulado confirmou segundo argumento `undefined` e HTTP 200.
Isso demonstra a opção de validação ausente; não usou token real roubado.

As funções que consultam o perfil atual ainda podem negar operações após mudança
de função. Isso não substitui revogação de sessão nem protege as leituras gerais
do banco. A janela restante depende da validade do token emitido.

Correção: verificar revogação/desativação no backend; aplicar política de sessão
nas regras RTDB e autorização ativa nos recursos. Operações críticas devem exigir
login recente. Testar token anterior à revogação contra todos os caminhos relevantes.
Referência: https://firebase.google.com/docs/auth/admin/manage-sessions

### SEC-05 — evidências no Storage sem autorização por setor

`storage.rules:7–40` permite leitura a qualquer autenticado. Manipulação,
Qualidade e logos permitem escrita/exclusão a qualquer autenticado. Limite de
tamanho e MIME são úteis, mas não provam autorização nem validam o conteúdo real
do arquivo. A consulta de releases do Rules API não encontrou publicação Storage;
não foi possível confirmar regras efetivas do bucket, existência de objetos ou
exploração em produção. Tratar como risco de código e verificação pendente.

Correção: inspecionar bucket/regras efetivas; exigir autorização por operação e
recurso, restringir exclusão de evidências, impedir sobrescrita indevida e limitar
formatos seguros. Para regras Storage, planejar fonte de autorização compatível
com o serviço (claims gerenciadas pelo servidor ou fluxo de upload no backend).

### SEC-06 — tratamento de URL pode derrubar o processo Node

`functions/render-server.js:99` chama `decodeURIComponent` antes do bloco de
tratamento de erro. Uma requisição exclusivamente local com escape inválido
gerou `unhandledRejection` com `URIError: URI malformed`. No comportamento padrão
do Node isso pode encerrar o processo. O teste capturou a rejeição para não deixar
processo residual. Não foi enviado payload malformado à VPS e não foi comprovado
que o Caddy encaminha esse formato; a explorabilidade pública permanece pendente.

Correção: tratar decodificação inválida como 400 e envolver o handler assíncrono
com captura final. Validar no ambiente de homologação através do proxy real.

### SEC-07 — ausência de segundo fator

Identity Toolkit retornou `mfa.state=DISABLED`. Há política de senha e cadastro
público desativado, mas não foi observado segundo fator/reautenticação para ações
administrativas. Roubo de senha ou sessão pode comprometer a administração.

Correção: MFA para administradores e contas sensíveis; exigir autenticação recente
em exclusão, redefinição e concessão de privilégios. Avaliar suporte/plano Firebase
antes de selecionar o mecanismo. Não obrigar todos os operadores sem fluxo de recuperação.

### SEC-08 — abuso de recursos/API

Não há rate limiter explícito no Caddy ou em `createServer`. `onCall` define
timeouts que o adaptador próprio invoca por `.run`, sem impor esses mesmos
timeouts de execução por chamada. Há operações com leitura/transação na raiz do
banco (`functions/index.js:52` e seguintes), ampliando custo de repetição por uma
conta autorizada. CORS controla navegador, não autentica clientes HTTP.

Correção: limites por IP/UID/ação, concorrência, tamanho e prazo de execução;
idempotência para ações críticas; monitoramento e alertas de custo. Não foi feito
teste de carga/DoS em produção. As APIs de integração exigem chave: não foi
demonstrado bypass. A comparação da chave é simples; trocar por comparação de
tempo constante é endurecimento, sem alegar exploração temporal comprovada.

### SEC-09 — acesso administrativo à VPS

Portas de escuta públicas observadas: 22, 80 e 443. Backend 8080 e administração
Caddy 2019 não estão publicados no host. Arquivos SSH legíveis mostram
`PermitRootLogin yes`, `PasswordAuthentication no` em include e
`KbdInteractiveAuthentication no`; fail2ban inativo e unattended-upgrades ativo.
Configuração efetiva via `sshd -T`, UFW e logs de autenticação exigem acesso root
que esta sessão não possui. Não se conclui que login por senha esteja habilitado.

Correção: confirmar configuração efetiva, bloquear root remoto após garantir
recuperação pelo painel, restringir SSH e revisar chaves. O usuário deploy integra
o grupo Docker e deve ser tratado como acesso equivalente a root.

### SEC-10 — recuperação após incidente não demonstrada

`/opt/kuryos/backups` está vazio. Não apareceu agendamento Kuryos nos timers
consultados, cron do deploy ou caminhos examinados. Scripts de backup existem,
mas não comprovam execução, cópia externa ou teste de restauração. Backups
gerenciados por outro usuário/provedor não foram descartados por esta auditoria.

Correção: provar backup externo criptografado, retenção e restauração em ambiente
isolado; documentar RPO/RTO e alertar falhas. Proteção de credenciais e recuperação
de Auth devem integrar o procedimento, além do RTDB/Storage.

### SEC-11 — contenção e navegador

Headers presentes: HSTS, nosniff, SAMEORIGIN e Referrer-Policy. Ausente CSP.
Múltiplas telas usam scripts inline/innerHTML; esse fato sozinho não prova XSS.
A amostra da tela Usuários escapa nome/e-mail. Não houve revisão exaustiva de
todos os pontos de renderização nem confirmação de XSS explorável.

Backend executa como node, filesystem read-only e no-new-privileges. Frontend
Caddy executa como root com filesystem gravável; containers não têm memória/PIDs
explicitamente limitados nem capability drop configurado. Isso aumenta impacto
de falha futura; não demonstra escape de container.

Correção: CSP inicialmente Report-Only com inventário de dependências, posterior
nonce/hash; revisão de HTML/URLs não confiáveis; frontend com privilégios mínimos
e limites de recursos validados com o comportamento real.

### SEC-12 — credencial anteriormente compartilhada

O proprietário forneceu login/senha do sistema oficial antigo nesta conversa.
Não reproduzir o segredo em relatório, commit ou logs. Sua validade atual e
eventual reutilização no ERP novo não foram testadas.

Correção: trocar a senha dessa conta no serviço de origem, revogar sessões e
trocar em qualquer lugar onde tenha sido reutilizada. Não desativar contas de
produção durante auditoria. A chave Firebase não foi exibida nesta revisão;
permissões de arquivo observadas na VPS são 600 e pasta secrets 700.

## Verificações favoráveis

- Regras RTDB em produção equivalentes semanticamente ao arquivo revisado.
- Leitura anônima de `/usuarios` retornou 401; perfis administrativos não estão públicos.
- `.env` e `.git/config` no site retornaram 404.
- HTTPS válido no novo domínio e redirects válidos dos aliases.
- Cadastro e exclusão públicos desativados; política de senha ENFORCE.
- Dois npm audit: zero vulnerabilidades reportadas (backend e CRM, incluindo dev).
- Nenhuma chave privada encontrada na busca dirigida em código/public/scripts;
  não foi varrido todo o histórico Git nem todos os artefatos/dispositivos externos.
- Não foram observados serviços Docker/Node administrativos expostos publicamente.

## Provas e limitações

Executar as provas de regras:

```powershell
firebase emulators:exec --project demo-security --only database --config firebase.retrabalhos-test.json "node run_security_audit_rules_test.js"
```

As quatro verificações do script passaram. O CLI consulta o projeto demo na API
e registra 403 por ele não existir; ainda assim carregou as regras no namespace
local correto, executou o script com sucesso e encerrou o emulador. A prova exige
explicitamente host local e namespace demo. Não executar contra dados reais.

Não foram realizados: força bruta, exploração externa, scanners de carga,
criação/alteração de usuários reais, exclusão/upload no Storage, rotação de segredos,
análise forense, avaliação de malware, revisão integral de IAM/Cloud Audit Logs,
varredura de imagens/OS por CVE ou teste de restauração. Regras Storage efetivas
permanecem não verificadas. Ausência de achado nessas áreas não é aprovação.

## Ordem de correção

1. Fechar permissões amplas CRM e trilha, com matriz de papéis e testes negativos.
2. Restringir leituras a perfil ativo/módulo e aplicar revogação em API/RTDB.
3. Confirmar/proteger Storage e trocar credencial compartilhada no serviço de origem.
4. Corrigir erro de URI; impor limites de abuso; ativar MFA administrativo.
5. Provar backup/restauração e endurecer SSH, containers e CSP em homologação.

Nenhuma correção de produção foi aplicada como parte desta auditoria. As
correções devem ter commits, regressões de operação e evidências de publicação.
