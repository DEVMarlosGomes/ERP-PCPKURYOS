# Correções de segurança — 03/11/2026

Referência: `AUDITORIA_SEGURANCA_20261103.md`. Implementação em `b609127` e
`bf1f39d`. Publicação e evidências finais registradas ao fim deste documento.

## O que foi alterado

| Achado | Entrega | Limite ou dependência restante |
|---|---|---|
| SEC-01 | Escrita no pai do tenant removida; acesso ao CRM exige setor/função ou módulo autorizado e tenant correto | As funções Comercial/P&D/PCP/Qualidade compartilham coleções necessárias aos espelhos do fluxo; regras de aprovação preexistentes foram preservadas. Evolução para autorização por campo/operação continua recomendada |
| SEC-02 | Navegador não grava nem exclui audit_log, mesmo como admin; nova callable grava UID, nome e hora no servidor | Before/after são relatos do cliente, marcados `client_reported`; não equivalem a trilha forense automática de todas as alterações |
| SEC-03 | Leituras/escritas operacionais exigem perfil existente, ativo, não pending e sessão válida; preços, fórmulas e documentos comerciais ganharam restrições setoriais | Projeções mínimas de dados compartilhados entre setores ainda podem reduzir exposição; perfil próprio continua legível para explicar estado da conta no login |
| SEC-04 | API verifica tokens com checkRevoked; consulta perfil ativo; RTDB verifica auth_time contra security_sessions; mudanças de acesso/e-mail/tenant revogam sessões | Validação do próprio perfil é exceção intencional, não autoriza leitura operacional. Operações administrativas exigem login nos últimos 15 minutos |
| SEC-05 | Regras-fonte de Storage agora negam capacidades ausentes, exclusão e sobrescrita de evidências; imagens limitadas a JPEG/PNG/WebP | Ambos os buckets usuais do projeto retornam 404. Não há regras Storage de produção para publicar/validar. Provisionamento, capacidades assinadas e teste de uploads são pendentes; não declarar o módulo ativo |
| SEC-06 | Decode inválido retorna 400; captura final de rejeições evita exceção solta; requisição abortada é tratada | Teste isolado passou |
| SEC-07 | Administração de contas exige autenticação recente, com mensagem para entrar novamente | MFA permanece pendente: projeto é FIREBASE_AUTH sem Identity Platform; requer ativação do serviço e cadastro pessoal dos fatores/recuperação |
| SEC-08 | Limites por IP/UID/ação, mapa de memória limitado, até 16 chamadas simultâneas, 429 e Retry-After; limites HTTP; comparação de API keys em tempo constante | Não é proteção DDoS de borda. Execução de mutação já iniciada não é cancelada por desconexão, e continua ocupando vaga até encerrar |
| SEC-09 | Script root validado preparado para bloquear login root/senha, reduzir tentativas e validar SSH antes de reload | Não executado: sudo exige senha administrativa indisponível nesta sessão. Não utilizar Docker para contornar essa exigência |
| SEC-10 | Backup corrigido para receber URL do banco fora do servidor; exporta RTDB e identidades; trata Storage ausente; fecha conexão; agendamento idempotente; retenção local só remove antigos após cópia externa bem-sucedida | Backup externo automático criptografado ainda depende de destino/credenciais Restic. Auth export pode exigir reset de senhas na recuperação; não inclui hash parameters/configuração completa de Auth |
| SEC-11 | Caddy sem root, filesystem read-only; volumes preparados para UID 1000; limites de memória/PIDs; capabilities reduzidas; CSP parcial aplicada e política de scripts Report-Only; Permissions-Policy | Scripts inline existentes ainda precisam de migração para nonce/hash antes de aplicar CSP estrita. Report-Only gera diagnóstico no navegador, sem coletor central configurado |
| SEC-12 | Senha não reproduzida em arquivos ou logs | Proprietário precisa trocar a senha no sistema oficial antigo e onde houver reutilização; nenhuma troca foi simulada nem declarada feita |

## Arquivos

- `database.rules.json`: perfil ativo, validade de sessão, permissões setoriais,
  tenant, bloqueio de escrita no pai e auditoria protegida.
- `functions/render-server.js`: tokens revogados, perfil ativo, URI, exceções,
  leitura abortada, limites por IP/usuário/ação e concorrência.
- `functions/identidade_acesso.js`: metadados de revogação RTDB, revogação após
  mudança de e-mail/tenant e login recente para administração.
- `functions/index.js`: callable de auditoria comercial e comparação de chave.
- `crm-frontend/src/lib/firebaseApi.js`: envia auditoria à callable.
- `crm-frontend/src/test/setup.js`: simula a resposta dessa callable nos testes.
- `Dockerfile`, `compose.production.yml`, `deploy/hostinger/Caddyfile`: isolamento,
  limites e headers do navegador.
- `scripts/hostinger/backup-firebase.js`, `backup.sh`: cópia de dados e identidades,
  Storage não provisionado, tratamento seguro do dotenv e retenção conservadora.
- `scripts/hostinger/install-backup-cron.sh`: agenda cópia diária pelo deploy.
- `scripts/hostinger/harden-ssh.sh`: etapa administrativa pendente de root.
- `storage.rules`: política restritiva preparada para bucket futuro; capacidades
  `erp_storage` não são emitidas ao navegador nesta entrega. Sem claims = negar.
- Testes: `run_security_http_test.js`, `run_security_audit_endpoint_test.js`,
  `run_security_audit_rules_test.js`, `run_security_restore_test.js`, `run_identity_access_test.js` e atualização
  da contagem de funções em `run_render_functions_test.js`.

## Validações realizadas antes de publicar

- Emulador: pending não lê fórmula; produção sem módulo não altera CRM;
  admin/comercial/operador não apagam auditoria; remoção do tenant é negada;
  token anterior à revogação é negado e login posterior é aceito; outro tenant negado.
- Endpoint de auditoria: perfil e tenant recusados quando indevidos; autor forjado
  pelo cliente é substituído pelo autor do servidor.
- HTTP: URL inválida retorna 400; token revogado retorna 401; limite retorna 429;
  saúde continua disponível.
- Identidade e rollback aprovados; login recente vencido é recusado.
- Servidor 14/14; contratos de UI de identidade 24/24; Hostinger 24/24;
  78 callbacks de transação analisados; sintaxe e diff limpos.
- CRM: 408 testes aprovados, 2 ignorados; build Vite aprovado.
- Caddy validado com a imagem real na VPS antes da publicação.

## Backup anterior

`/opt/kuryos/backups/security-before-20261103-v2` contém 24.560.548 bytes de JSON
descompactado, 86 nós raiz e 9 identidades. Storage registrado como
`not-provisioned`. Gzip, JSON e contagens conferidos em segunda cópia, na estação
do proprietário (`scratch/security-backups/`, fora do Git, ACL restrita).
Além da integridade de gzip/JSON, `run_security_restore_test.js` restaurou o RTDB
completo no namespace local demo e confirmou igualdade semântica por SHA-256:
`29cf12de0092b5ea1333dedc2623ed447beda13bdef2d3fc567a585de401eced`.
O namespace sintético foi limpo ao concluir. As 9 identidades foram validadas
como export; não foram importadas no Auth de produção. Esse ensaio não comprova
recuperação de senhas, certificado/segredos, Storage futuro nem backup externo recorrente.

## Publicação

- Versão de produção: `bf1f39daf468c0a260d2015303ef9c1cab870066`.
- VPS: ambos os containers saudáveis; Caddy UID 1000; ambos read-only e com
  capabilities removidas/limitadas, limites de memória e PIDs conferidos no Docker.
- Headers CSP/CSP Report-Only/Permissions-Policy observados no HTTPS público.
- RTDB: deploy concluído no projeto explícito `erpkuryos`; regras relidas e
  semanticamente iguais ao arquivo local; escrita no pai do tenant é false.
- API: saúde com 39 funções; identidade e auditoria recusam token inválido com 401.
- Backup diário instalado pelo usuário deploy às 03:15 UTC (00:15 de Brasília),
  cron ativo. Primeira execução completa: `/opt/kuryos/backups/20261103T040100Z`.
- Nenhum erro espontâneo de execução nos logs consultados após a publicação;
  testes negativos de token são recusas intencionais.
- Alterações enviadas ao GitHub na branch `hostinger-deploy`.

## Dependências que impedem encerrar todos os itens

1. **SSH:** no console Hostinger, como root, executar:
   `sh /opt/kuryos/current/scripts/hostinger/harden-ssh.sh`.
   Manter o console aberto e validar nova sessão deploy antes de sair. A sessão
   atual não possui sudo sem senha e não contornou essa restrição.
2. **MFA:** ativar Identity Platform e implementar/testar inscrição, desafio e
   recuperação de fatores antes de exigir MFA dos administradores. O projeto
   atual continua `FIREBASE_AUTH`; nenhum upgrade de serviço/cobrança foi executado.
3. **Backup externo:** falta serviço/bucket e credenciais configuradas no arquivo
   privado da VPS. A cópia automática atual é local; a segunda cópia na estação é
   manual. Não chamar isso de backup externo automático criptografado.
4. **Senha compartilhada:** proprietário deve trocar no sistema oficial antigo
   e em qualquer conta em que foi reutilizada. A senha nunca foi reproduzida aqui.
5. **Storage:** não existe bucket de produção; precisa ser provisionado e ganhar
   fluxo de autorização/capacidades antes de liberar uploads. Regras preparadas
   não representam serviço ativo nem foram publicadas em bucket inexistente.
   **Atualização 06/11/2026:** bucket `erpkuryos.firebasestorage.app` (US-EAST1)
   criado; regras publicadas com envio para qualquer login válido (tipo, tamanho
   e proibição de sobrescrita/exclusão mantidos), por decisão do usuário, para
   destravar a foto da pesagem. O vínculo por área via claim `erp_storage`
   segue pendente (`MELHORIAS_FUTURAS.md`, Segurança).

Estas dependências são pendências reais. As correções publicadas reduzem os riscos
demonstrados, mas não autorizam declarar os doze itens integralmente encerrados.
