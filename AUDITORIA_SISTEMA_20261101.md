# Auditoria integral do sistema — 01/11/2026

## Resultado executivo

Não foi encontrado bloqueador P0 no código revisado. A auditoria encontrou e
corrigiu falhas de banco, permissão, concorrência, navegação, responsividade e
testes. O código está coerente e as suítes executadas estão verdes, mas a fábrica
ainda não deve tomar decisões por saldo até o inventário físico do Dia D.

## Correções realizadas

| Severidade | Falha | Correção |
|---|---|---|
| P1 | `inspecao_total.html` ainda apontava para `prod-kuryos`, o banco legado | Toda a configuração passou para `erpkuryos`; teste impede regressão |
| P1 | Gatilhos sem `.env.erpkuryos` voltavam silenciosamente ao banco legado | Fallback de `RTDB_INSTANCE` alterado para `erpkuryos-default-rtdb` |
| P1 | E-mails de OP, pesagem, diretoria e faturamento abriam o site antigo | Links alterados para `pcp-kuryos.vercel.app` |
| P1 | Cancelar RNC com cache frio abortava a transação antes de ler o servidor | Callback preserva o valor e distingue registro inexistente após a transação |
| P1 | Alerta de liberação usava `z-index` máximo e cobria título/ação do modal no celular | Aviso ficou abaixo dos modais; fluxo 375×667 validado |
| P2 | Qualidade tentava ler `usuarios/`, permitido apenas para ADM/RH | Datalist usa `usuarios_publico/`, com nome e papel mínimos |
| P2 | Relatório de Expedição tinha fixture desatualizada e mascarava a dependência `chaveNome` | Teste carrega `utils.js` real e aguarda o resultado assíncrono |
| P2 | `backlog.json` estava diferente do gerado por `MELHORIAS_FUTURAS.md` | Backlog regenerado e teste de sincronismo aprovado |
| P2 | Home spray não tinha a decisão consolidada na taxonomia | `home_spray`, aromatizador e difusor de ambiente agora mapeiam para `HOM` |
| P2 | Central de Ajuda não mostrava o caminho completo nem os handoffs | Criadas 18 etapas, 14 setores, busca, filtros e dependências operacionais |
| P2 | Planejamento usava o mínimo temporal, não o ritmo efetivo | ETA pelo ritmo real; atraso empurra e adiantamento puxa toda a fila; zona fixa não bloqueia; 15 min |

As atualizações compatíveis de dependências (`npm audit fix`, sem `--force`)
eliminaram a vulnerabilidade crítica e todas as altas do backend. Permanecem
11 alertas moderados no backend. No frontend, a atualização automática foi
revertida porque fez seis suítes excederem o tempo de inicialização; continuam
8 alertas altos e 1 moderado nas dependências de produção. Removê-los exige
atualizações potencialmente incompatíveis de Firebase/Zod e deve ser feito em
uma branch própria, com ensaio completo antes de publicar.

## Validação executada

- Auditoria inicial de 129 scripts: 121 passaram; os 8 restantes foram
  classificados, corrigidos/configurados e passaram na repetição individual.
- CRM: 49 arquivos de teste aprovados, 408 testes aprovados e 2 ignorados;
  build Vite de produção concluído e integrado.
- Planejamento: 31 asserções de motor e 22 verificações de interface.
- Central de Ajuda: 93 contratos de conteúdo, UI desktop/390 px, tema, busca,
  filtros e zero overflow.
- Navegação e integração: 39 perfis, 402 verificações de módulos, 14 testes do
  servidor de renderização e 76 callbacks de transação examinados.
- Banco emulado: devolução de cliente (25 asserções) e liberação de P&D.
- Fluxo ponta a ponta: proposta, cadastro, pedido, OP, setup, produção,
  confirmação, Conferência de PA, Qualidade e bloqueio da Expedição.
- Etiquetas: 12 códigos lidos em 8 px/mm e 6 px/mm; tabela fixa: 15 checks.
- JavaScript estático: 162 arquivos de `public/shared` e `functions` analisados,
  sem erro de sintaxe.

## Fechamento das pendências (01/11/2026)

### P1 — antes da virada operacional

1. **Dia D / saldo de abertura — AGUARDA EXECUÇÃO FÍSICA.** O banco operacional parou em 21/09, apenas
   37 de 906 materiais têm saldo e 11 estão negativos; `estoque_lotes` não
   representa a fábrica. Contar fisicamente, endereçar, reconciliar diferenças
   e só então ligar a trava de saldo. Sem isso, MRP, FEFO e disponibilidade
   exibem matemática correta sobre dados incompletos.
2. **Cutover para `erpkuryos` — AGUARDA DECISÃO OPERACIONAL.** O roteiro, gates e
   rollback estão em `PLANO_DIA_D_CUTOVER.md`; faltam horário e responsáveis.
3. **Emissão de OP no servidor — RESOLVIDO (`563ade1`).** A callable valida perfil,
   fórmula/BOM e saldo disponível, numera, cria, empenha e alerta em uma única
   transação. A regra bloqueia criação normal direta pelo cliente. O saldo
   disponível agora desconta empenhos anteriores.
4. **OP sem bloco — RESOLVIDO.** `planejamento.html` e o PCP React mantêm fila
   explícita de OPs sem programação, com ação para programar; concluídas e
   canceladas ficam fora dela.

### P2 — dados, acesso e manutenção

1. **Tenant — RESOLVIDO EM PRODUÇÃO.** `tenant_id=kuryos` foi gravado nos perfis
   ativos de Adlai (duas contas), Diego e Roberta. A conta duplicada de Roberta
   que está `pending` não foi promovida. **Funções ainda aguardam os nomes dos
   responsáveis:** hoje não existe usuário com Financeiro, Controladoria ou RH;
   Roberta já é Qualidade. Papel é a função operacional; tenant define a base.
2. **Dados mestres — AGUARDA DADOS REAIS.** Bancos, títulos, contas ECD,
   capacidades, lead times e lotes mínimos não podem ser inferidos. Donos e
   sequência estão registrados em `PLANO_DIA_D_CUTOVER.md`.
3. **Propostas antigas — FALSO POSITIVO ENCERRADO.** JOHN'S WOOD e “abelinha” já
   têm `PRF-JOHN-0001` e `PRF-TEST-0001`, gerados pelos CGIs e vinculados às
   variações. `crm_propostas/*/skus_gerados` nasceu depois e nenhuma tela o usa.
4. **Dependências — RESOLVIDO (`1d296fe`).** `npm audit` retorna zero no frontend
   e no backend, sem `--force`; CRM mantém 408 testes aprovados (2 ignorados) e
   build aprovado. Backend mantém testes e verificação de sintaxe aprovados.

## Critério do Dia D

O Dia D não é apagar o estoque. É escolher uma data de corte, contar fisicamente
cada material/lote/endereço, comparar com o sistema e lançar ajustes auditáveis
que formem o saldo inicial confiável. Depois da conferência, compras passa a
usar o MRP, a separação indica lotes FEFO e a emissão de OP pode bloquear falta
de saldo. Antes disso, manter a trava desligada é o comportamento seguro.

