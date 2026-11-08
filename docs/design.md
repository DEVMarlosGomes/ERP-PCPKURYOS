# Design e acessibilidade

O ERP usa os tokens e componentes de `public/shared/theme.css`,
`public/shared/kuryos-ui-*.css` e o sistema React em `crm-frontend/src/components/ui`.
O tom visual é operacional, sóbrio e legível, com suporte claro/escuro.

Controles devem ter rótulo, foco visível, estados de carregamento/erro/vazio e
alvos adequados para toque. Tabelas precisam de rolagem responsiva sem esconder
ações. Cores não podem ser o único indicador de status. Movimento respeita
`prefers-reduced-motion`.

Mudanças visuais são verificadas em desktop e móvel na tela real; artefatos
gerados do CRM nunca são editados manualmente.

