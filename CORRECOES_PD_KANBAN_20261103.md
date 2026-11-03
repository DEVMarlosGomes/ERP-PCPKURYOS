# Correção do Kanban P&D — 03/11/2026

## Defeito reproduzido

A rota de arrastar o card escrevia diretamente em `pd_requests`, sem chamar
`liberarEtapaPd`. As regras exigem essa liberação para Em Testes e Aguardando
Aprovação, inclusive para administrador. A ficha tinha outro caminho de
validação. Seis testes diagnósticos falharam antes da correção: chamada ao
servidor ausente e possibilidade de contornar validações no adaptador em memória.

A integração com regras reais revelou uma segunda falha independente: mesmo com
ticket válido, o banco negava a escrita em `pd_requests`. A autorização do nó
wildcard `$collection` não cobre os irmãos nomeados explicitamente. Após retirar
a autorização ampla do pai na revisão de segurança, quatro coleções explícitas
ficaram sem autorização própria: `pd_requests`, `crm_samples`, `crm_propostas` e
`sku_por_orcamento`.

## Alterações

- Kanban e edição genérica de status passam pelo fluxo existente da ficha.
- Fórmula/ingredientes, transições e D48h são conferidos antes do ticket e dos
  efeitos da mudança. As regras do banco não foram relaxadas.
- Retrocesso exige justificativa; cancelamento não movimenta o card.
- Repetição de status não cria outra amostra ou histórico de transição.
- Servidor alinhado ao retrocesso Aguardando Aprovação → Em Testes, já previsto
  na máquina de estados da ficha. Outros saltos com `voltar` continuam negados.
- Teste do SDK modular confirma que `/api/liberarEtapaPd` é preservado. Não era
  necessário repetir no CRM a correção do SDK compat usada na tela Usuários.
- As quatro coleções explícitas recebem exatamente a mesma política de perfil
  ativo, sessão, setor/módulo e tenant das coleções genéricas. Não há autorização
  no pai do tenant; auditoria e tickets continuam sem escrita pelo cliente.

## Limites

Não foram movidos cards reais, alterados usuários, reimportado JSON ou ativadas
automações. Administrador continua sujeito às etapas técnicas. Esta correção não
certifica todos os módulos do ERP: os bloqueios industriais e operacionais dos
relatórios anteriores continuam pendentes. O gesto físico no navegador publicado
precisa do aceite do operador; os testes exercitam a API usada pelo arrastar.

## Validação e publicação

- Suíte CRM/P&D: 419 aprovados; integração opcional executada separadamente.
- Integração API + handler real + regras reais: 3 testes aprovados, cobrindo
  movimentação, retrocessos e CRUD/negações nas quatro coleções.
- SDK modular real com transporte interceptado: rota `/api` preservada.
- Identidade, segurança HTTP, endpoint de auditoria e 24 contratos Hostinger:
  aprovados. Contrato estático impede divergência entre as quatro permissões.
- Build Vite e integração oficial dos artefatos concluídos.

Versão publicada será registrada no bloco Tech Lead de `AGENT_STATUS.md`, após
a verificação da VPS e das regras relidas do projeto explícito `erpkuryos`.
