# Reconciliação de usuários — export `prod-kuryos`

Data da auditoria: 06/11/2026. Fonte: export fornecido pelo usuário, tratado
exclusivamente como dados. Destino auditado: projeto `erpkuryos`.

## Resultado

- Export legado: 16 perfis.
- Destino no momento da releitura: 24 perfis e 16 contas Firebase Auth.
- O e-mail `gustavobraulio@gmail.com` já possui perfil e Auth prontos no destino.
- O backfill de `usuario` é independente de senha e pode ser aplicado com backup.
- Nenhuma senha é importada, inventada, consultada ou registrada.

## Pendências que não podem ser resolvidas automaticamente

### Perfil legado ausente no destino e sem Auth

| Nome | E-mail do export | Função | Situação |
|---|---|---|---|
| Gabriel | `rotulagem@kuryos.com` | rotulagem | confirmar se é conta distinta de `rotulagem@kuryos.com.br` |
| Larissa Correia | `larissa.jesus@kuryos.com.br` | rh | exige criação administrativa e senha temporária |
| Luzia Silva | `luzia@kuryos.com.br` | production | exige criação administrativa e senha temporária |
| luana | `luarlagtal@gamil.com` | production | confirmar provável erro `gamil.com` antes de criar |

### Perfil no destino sem conta Auth no mesmo UID

| Nome | E-mail | Função | Ação segura disponível |
|---|---|---|---|
| vicenzo callegaro | `vicenzo@kuryos.com.br` | admin | regularizar no mesmo UID após confirmar identidade |
| Robert Briz | `robertflpe1@gmail.com` | production | regularizar no mesmo UID após confirmar identidade |
| rotulagem | `rotulagem@kuryos.com.br` | rotulagem | regularizar no mesmo UID após confirmar identidade |
| Diego Costa | `diego.costa@kuryos.com.br` | pcp | regularizar no mesmo UID após confirmar identidade |

### E-mail encontrado em Auth com UID diferente do perfil legado

| Nome | E-mail | Função no export | Regra aplicada |
|---|---|---|---|
| Yasmim Fantini | `yasmim.fantini@kuryos.com.br` | pcp | bloquear fusão; destino hoje diverge também na função |
| Gustavo Callegaro | `gustavo@kuryos.com.br` | admin | bloquear fusão automática |
| Lucca De Camillis Lestingi | `lucca@kuryos.com.br` | admin | bloquear fusão automática |

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

Depois do backfill, todo perfil recebe `usuarios/{uid}/usuario` e o índice privado
`login_usuarios/{sha256(usuario)}`. A autenticação por usuário só é liberada quando
perfil, Auth, UID e e-mail coincidem e a conta está ativa. As pendências acima
continuam visíveis no painel administrativo até decisão humana.
