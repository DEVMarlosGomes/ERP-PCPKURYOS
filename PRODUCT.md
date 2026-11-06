# Produto

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Colaboradores da Kuryos usam o ERP durante rotinas administrativas, comerciais,
de qualidade, logística e chão de fábrica. Administradores gerenciam identidades e
permissões; cada colaborador precisa conseguir cuidar da própria senha sem ganhar
acesso a dados administrativos.

## Product Purpose

O Kuryos ERP reúne o fluxo operacional da fabricante de cosméticos, preservando
rastreabilidade, segregação de funções e continuidade entre cadastros, produção e
gestão. Sucesso significa que cada pessoa entra na identidade correta e vê somente o
que sua função permite.

## Positioning

Uma única identidade acompanha o histórico operacional do colaborador: login,
perfil, permissões e auditoria permanecem ligados ao mesmo UID, inclusive ao
regularizar cadastros legados.

## Operating Context

O produto é usado em navegadores desktop e móveis, em ambientes administrativos e
de fábrica. O Firebase Authentication é o provedor de credenciais; o Realtime
Database guarda perfis e autorização; a VPS Hostinger executa as funções do servidor.

## Capabilities and Constraints

- O acesso pode ser identificado por usuário ou e-mail, sempre autenticado pelo
  provedor de identidade.
- Senhas nunca são legíveis, recuperáveis ou armazenadas no banco, na auditoria, em
  logs ou no HTML.
- Administradores podem redefinir uma senha temporária e exigir troca, mas nunca
  consultar a senha atual.
- O próprio colaborador pode trocar a senha após confirmar a credencial atual.
- Perfis e contas Auth conflitantes não são fundidos automaticamente.
- O projeto Firebase de autenticação e dados é `erpkuryos`; o domínio principal é
  `kuryoserp.com.br`.

## Brand Commitments

Preservar o sistema visual e a linguagem operacional já usados nas telas do ERP,
inclusive temas claro/escuro, navegação lateral e textos diretos em português.

## Evidence on Hand

O código existente, `CLAUDE.md`, as regras do banco e o export legado fornecido são
as fontes reais. Não inventar contas, funções, permissões, e-mails ou estados ausentes.

## Product Principles

- Identidade única antes de conveniência.
- Privilégio mínimo e autorização conferida no servidor.
- Operações sensíveis deixam trilha sem registrar segredo.
- Ambiguidade vira pendência explícita, nunca fusão silenciosa.
- Recuperação deve ser possível sem depender de suporte para revelar credenciais.

