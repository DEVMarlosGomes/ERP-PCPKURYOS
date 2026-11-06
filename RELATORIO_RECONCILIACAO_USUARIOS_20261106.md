# Reconciliação de usuários — export `prod-kuryos`

Data da auditoria: 06/11/2026. Fonte: export fornecido pelo usuário, tratado
exclusivamente como dados. Destino auditado: projeto `erpkuryos`.

## Resultado

- Export legado: 16 perfis.
- Destino na validação final: 27 perfis e 21 contas Firebase Auth.
- O e-mail `gustavobraulio@gmail.com` já possui perfil e Auth prontos no destino.
- O backfill de `usuario` foi aplicado aos 27 perfis com backup obrigatório. A
  releitura posterior encontrou zero alterações pendentes.
- Nenhuma senha é importada, inventada, consultada ou registrada.

## Pendências que não podem ser resolvidas automaticamente

### Perfil legado ausente no destino e sem Auth

| Nome | E-mail do export | Função | Situação |
|---|---|---|---|
| Gabriel | `rotulagem@kuryos.com` | rotulagem | confirmar se é conta distinta de `rotulagem@kuryos.com.br` |
| luana | `luarlagtal@gamil.com` | production | confirmar provável erro `gamil.com` antes de criar |

### Perfil no destino sem conta Auth no mesmo UID

| Nome | E-mail | Função | Ação segura disponível |
|---|---|---|---|
| vicenzo callegaro | `vicenzo@kuryos.com.br` | admin | regularizar no mesmo UID após confirmar identidade |
| Robert Briz | `robertflpe1@gmail.com` | production | regularizar no mesmo UID após confirmar identidade |

### E-mail encontrado em Auth com UID diferente do perfil legado

| Nome | E-mail | Função no export | Regra aplicada |
|---|---|---|---|
| Yasmim Fantini | `yasmim.fantini@kuryos.com.br` | pcp | bloquear fusão; destino hoje diverge também na função |
| Lucca De Camillis Lestingi | `lucca@kuryos.com.br` | admin | bloquear fusão automática |

O e-mail `gustavo@kuryos.com.br` possui hoje perfil e Auth válidos no mesmo UID,
com função `admin`, mas também conserva um perfil legado antigo em outro UID. O
perfil antigo permanece bloqueado para login por usuário até decisão humana.

### Pendências adicionais encontradas no destino atual

| E-mail | Situação |
|---|---|
| `bruna.araujo@kuryos.com.br` | perfil sem Auth |
| `roberta.ramos@kuryos.com` | perfil sem Auth; não confundir com a conta `.com.br` |
| `rodolfo-lima-sousa@kuryos.com` | perfil sem Auth |

Esses casos exigem confirmação documental de qual UID deve permanecer. O sistema não
move histórico, função ou permissões entre UIDs por coincidência de e-mail.

## Migração autorizada e reversível

O script `functions/migrar_login_usuarios.js`:

1. executa em modo leitura por padrão;
2. lista vínculos `OK`, `SEM_AUTH`, `UID_DIVERGENTE` e `EMAIL_DIVERGENTE`;
3. deriva usuários do trecho anterior ao `@`, normaliza e resolve colisões com sufixo;
4. em `--apply`, recusa prosseguir sem `/backups`, grava snapshot de perfis, índice e
   resumo Auth, reserva cada usuário por transação e só então atualiza o perfil;
5. não cria Auth, não define senha e não altera função, módulos, tenant ou e-mail.

## Critério de fechamento

Backup criado antes da aplicação:
`/backups/login-usuarios-2026-11-06T13-46-36-061Z.json`.

Depois do backfill, todo perfil recebeu `usuarios/{uid}/usuario` e o índice privado
`login_usuarios/{sha256(usuario)}`. A autenticação por usuário só é liberada quando
perfil, Auth, UID e e-mail coincidem e a conta está ativa. As pendências acima
continuam visíveis no painel administrativo até decisão humana.
