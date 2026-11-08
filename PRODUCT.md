# Kuryos ERP / PCP

## Problema e objetivo

Centralizar a operação de uma indústria cosmética private label, eliminando
planilhas e cadastros desconectados entre Comercial, P&D, PCP, Produção,
Qualidade, Compras, Estoque, Logística e Expedição. O resultado esperado é uma
única fonte rastreável, com dados operacionais e indicadores coerentes.

## Usuários e fluxos essenciais

Perfis administrativos, comerciais, formuladores, qualidade, PCP, produção,
compras, logística e diretoria têm acesso por função/módulo. Os fluxos centrais
são cliente/projeto → kickoff → P&D → pedido/OP → pesagem/manipulação → produção
e qualidade → estoque/expedição, com auditoria de mudanças e segregação de
permissões.

## Requisitos e restrições

- Interface em português, responsiva para chão de fábrica e desktop.
- Firebase Auth e regras do RTDB são parte da autorização, não só a interface.
- Alterações críticas registram data, hora e usuário; senhas nunca são legíveis.
- Dados históricos não são sobrescritos ou importados em massa sem simulação,
  backup, referência válida e autorização explícita.
- O stack existente Firebase + HTML/JavaScript + React/Vite + Node 24 é mantido.

## Critérios de aceite

Uma entrega deve preservar papéis e dados, ter teste proporcional ao risco,
passar pelo build oficial quando tocar o CRM, manter Git e produção identificados
por commit e declarar qualquer limitação ou verificação não executada.

## Próxima entrega

Concluir o envio de resultados da etapa P&D/Qualidade, depois implementar a
edição bidirecional entre cards e Cadastros com histórico completo e finalizar
a auditoria de KPIs/dados do último export do `prod-kuryos`.

