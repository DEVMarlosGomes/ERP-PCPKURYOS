# Dia D e cutover para `erpkuryos`

Este plano fecha a parte operacional que não pode ser fabricada pelo software. O sistema já tem inventário cego, ajuste auditável, endereçamento e trava de saldo; a execução depende da contagem física e de um horário de corte aprovado pela Kuryos.

## Responsáveis a preencher antes de iniciar

| Decisão | Responsável | Valor |
|---|---|---|
| Data e hora de corte | Direção/PCP | **Pendente** |
| Coordenação da contagem | Logística | **Pendente** |
| Aprovação das divergências | Controladoria | **Pendente** |
| Liberação final | Direção | **Pendente** |
| Responsável por bloquear o sistema antigo | TI/fornecedor legado | **Pendente** |

Sem esses cinco nomes/valores o cutover não começa.

## Sequência obrigatória

1. **Preparar:** cadastrar/identificar todos os endereços físicos e dividir a fábrica em áreas de contagem.
2. **Cortar:** no horário aprovado, bloquear novos lançamentos no sistema antigo e registrar o último número/data de cada documento operacional.
3. **Migrar o delta:** trazer somente movimentos posteriores a 21/09, sem sobrescrever CRM/P&D ou registros já criados no `erpkuryos`.
4. **Contar:** em **Estoque / WMS → Inventário Rotativo**, fazer a contagem cega de cada material, lote e endereço. Material encontrado fora do sistema deve ser incluído com lote, validade, dono e endereço; saldo zero também deve ser confirmado.
5. **Conciliar:** divergências exigem causa e ajuste auditável. Não apagar o estoque e não substituir o banco inteiro.
6. **Conferir totais:** comparar por material, lote, dono e endereço; nenhum material negativo e nenhum lote físico sem endereço.
7. **Liberar:** somente após assinatura de Logística + Controladoria + Direção, ligar `config/emitirOp/bloquearSemSaldo` em Ajustes / Config.
8. **Abrir operação:** liberar usuários no `erpkuryos` e manter o sistema antigo somente para consulta.

## Gates de aceite

- [ ] Horário de corte e responsáveis preenchidos acima.
- [ ] Sistema antigo bloqueado para novos lançamentos.
- [ ] Delta desde 21/09 migrado e totalizado.
- [ ] 100% dos materiais físicos contados, inclusive saldo zero.
- [ ] 100% dos lotes com dono, validade quando aplicável e endereço.
- [ ] Zero saldos negativos sem conciliação aprovada.
- [ ] Compras/MRP conferido em amostra dos materiais prioritários.
- [ ] Separação/FEFO conferida em amostra de lotes reais.
- [ ] Emissão de OP testada com falta e com saldo suficiente.
- [ ] Três aprovadores assinaram a liberação.

## Rollback

Se a conferência falhar, a trava continua desligada e os usuários não são liberados. Corrigem-se os ajustes no `erpkuryos`; o sistema antigo não volta a receber lançamentos sem uma decisão formal, pois isso criaria um segundo delta.

## Dados mestres que podem ser preenchidos em paralelo

- Financeiro: bancos e títulos de abertura, fornecidos pelo responsável financeiro.
- Controladoria: contas referenciais ECD, fornecidas pelo contador.
- PCP: capacidade real por SKU.
- Compras: lead time e lote mínimo dos materiais prioritários.

Esses valores não têm padrão seguro. Campo vazio deve permanecer como pendência explícita; nunca usar zero ou estimativa inventada para encerrar o checklist.
