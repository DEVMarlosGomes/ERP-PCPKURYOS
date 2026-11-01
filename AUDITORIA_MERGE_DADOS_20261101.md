# Auditoria da união de dados reais — 01/11/2026

## Resultado executivo

A rotina de união conservadora foi implementada e executada **somente em simulação**. Nenhuma escrita foi feita no Firebase. A fonte principal foi comparada com uma fotografia autorizada e somente leitura do `erpkuryos` obtida em 01/11/2026.

Execução principal: `merge-aafb10ee8a418f0a`.

| Resultado | Registros/campos |
| --- | ---: |
| Registros novos | 2.304 |
| Registros existentes a complementar | 684 |
| Registros idênticos | 4.968 |
| Registros com conflito preservado | 1.056 |
| Registros rejeitados por referência | 46 |
| Campos novos planejados | 264.952 |
| Campos conflitantes não planejados | 2.973 |
| Campos idênticos | 234.006 |

O plano detalhado está em `scratch/firebase-merge/merge-aafb10ee8a418f0a/plan.json`, fora do Git por conter dados industriais. Ele tem 137 MB porque cada folha possui pré-condição e hash próprios para retomada e reversão seletivas.

## Fontes reais encontradas

1. `C:\Users\Marlos\Downloads\prod-kuryos-default-rtdb-export (1).json`: fonte principal, 25.276.514 bytes, 76 raízes, SHA-256 `a1f9552b7b9367a0bf1bd623f61d6b354153cd4ea00aeeb968799884c2c36b56`.
2. Firebase atual `erpkuryos`: fotografia somente leitura obtida pela CLI, SHA-256 `d8dc780eaf330551eb8d131b90d58d471be012528d5dfb94a061336ccefd29d6`.
3. `C:\Users\Marlos\Downloads\prod-kuryos-default-rtdb-export.json`: export anterior de 06/10. A simulação separada (`merge-700597d4496c5ac3`) encontrou **zero campo novo**, 6.768 registros idênticos, três conflitos e 34 referências antigas inválidas; ele não complementa o banco atual.

As três planilhas `EXEMPLO ...xlsx` são exemplos/modelos e não foram tratadas como dados reais. Os ZIPs encontrados são cópias de código e relatórios antigos, sem uma base fabril adicional. Arquivos de conta de serviço foram identificados apenas como credenciais, nunca abertos ou usados como fonte. Não foram encontrados CSVs, bancos SQLite ou planilhas operacionais de inventário/cadastros.

Limitação fundamental: o export revela o que existia no Firebase de origem, não o que nunca foi cadastrado. Ainda faltam a contagem física do Dia D e fontes oficiais de bancos/títulos, contas ECD, capacidade de SKU, lead time e lote mínimo.

## Mapeamento e identidade

| Entidade | Origem → destino | Identidade e vínculos | Regra aplicada |
| --- | --- | --- | --- |
| Clientes e fornecedores | raiz homônima | chave Firebase; códigos apenas como atributos | nunca unir por nome |
| Materiais | `materiais/{id}` | chave, `mpCodigo`/`materialCodigo`; fornecedor preservado | completar somente folhas ausentes |
| Produtos | `produtos/{id}` | chave e `sku` | preservar zeros à esquerda e relação com cliente |
| Fórmulas, especificações e BOM | raízes homônimas | chave da versão + `codProduto` existente | versões não são colapsadas; referência inválida bloqueia o registro |
| Estoque | `estoque/{material}` | material existente | posição não é somada nem convertida em movimento |
| Lotes e movimentos | `estoque_lotes`, `lotes_internos`, `movimentos_estoque` | chaves originais | histórico aditivo; nenhuma baixa ou reserva é recalculada |
| OPs e programação | `ops/{op}`, `programacao/{id}` | chave da OP e `sku` existente | sem renumeração; conflitos ficam fora do plano |
| Pedidos comercial/PCP/compra | raízes homônimas | chave original e vínculos internos | sem regenerar pedido, e-mail ou cotação |
| Demais módulos | mesma raiz e chave | chave Firebase original | merge conservador por folha |

`false`, zero, strings com zeros à esquerda e números decimais são valores presentes. `null` da fonte é rejeitado porque, no Realtime Database, poderia excluir dados.

## Proteções implementadas

- simulação é o modo padrão;
- nunca há `set` na raiz nem substituição automática de registro existente;
- plano por campo com valor/hash anterior e posterior;
- conflitos são relatados e nunca escolhidos silenciosamente;
- 46 registros bloqueados: 24 por `codProduto` inexistente e 22 por `sku` inexistente;
- `config`, usuários/permissões, índices públicos, filas de e-mail, notificações e marcas de deduplicação são excluídos;
- lotes com no máximo 400 caminhos/4 MB, checkpoint e retomada;
- backup apenas dos caminhos afetados;
- leitura nova e verificação das pré-condições antes da aplicação;
- reversão apenas quando o valor ainda é exatamente o aplicado;
- aplicação exige `runId` exato e confirmação explícita;
- a CLI usa `database:update --disable-triggers`, confirmado na versão 15.34.1;
- proveniência em `importacoes_dados/{runId}`;
- artefatos com dados reais ficam em `scratch/`, ignorado pelo Git.

Há gatilhos em `agendamentos_expedicao`, `turnosEncerrados`, `ops` e `pedidos_comerciais`. O plano principal toca 323, 124, 47.752 e 128 campos nessas raízes. Mesmo com `--disable-triggers`, a execução deve ocorrer em janela de corte, pois a CLI não fornece transação CAS multipath entre centenas de lotes.

## Qualidade por entidades críticas

| Entidade | Novos | Complementados | Idênticos | Conflitantes | Rejeitados |
| --- | ---: | ---: | ---: | ---: | ---: |
| Materiais | 71 | 37 | 496 | 408 | 0 |
| Produtos | 20 | 11 | 324 | 50 | 0 |
| Fórmulas | 41 | 0 | 104 | 83 | 3 |
| Especificações | 69 | 37 | 135 | 17 | 18 |
| BOM | 51 | 17 | 155 | 46 | 3 |
| Estoque | 218 | 0 | 18 | 80 | 0 |
| Lotes de estoque | 130 | 0 | 0 | 24 | 0 |
| Movimentos de estoque | 279 | 56 | 16 | 0 | 0 |
| OPs | 101 | 2 | 1.169 | 199 | 19 |
| Pedidos PCP | 22 | 94 | 180 | 97 | 3 |
| Pedidos comerciais | 0 | 0 | 72 | 6 | 0 |
| Pedidos de compra | 64 | 0 | 9 | 7 | 0 |

Os 2.973 conflitos precisam de decisão por campo antes de qualquer sobreposição; a implementação não os aplica. Os 46 rejeitados exigem corrigir/restaurar o produto referenciado ou declarar formalmente que são históricos órfãos.

## Testes

`node --test run_firebase_merge_test.js`: **12/12 aprovados**.

Coberturas: registro novo, idêntico, complemento com `0`/`false`, conflito, referência inválida, segunda execução, retomada, concorrência, reversão seletiva, exclusão de efeitos operacionais, divergência estrutural e `null`. Na repetição em memória sobre os dados reais, a primeira execução planejou 264.952 inclusões e a segunda **zero**, mantendo somente conflitos e rejeições para revisão.

## Comandos reais

Simular contra uma fotografia nova (nenhuma escrita):

```powershell
node scripts/firebase-merge/cli.js simulate --source "C:\Users\Marlos\Downloads\prod-kuryos-default-rtdb-export (1).json" --project erpkuryos --out-dir scratch\firebase-merge
```

Aplicar, somente depois da revisão, janela de corte e aprovação explícita:

```powershell
node scripts/firebase-merge/cli.js apply --plan "scratch\firebase-merge\<runId>\plan.json" --project erpkuryos --confirm-run <runId> --triggers-disabled-ack
```

Reverter apenas os caminhos que aquela execução ainda controla:

```powershell
node scripts/firebase-merge/cli.js revert --plan "scratch\firebase-merge\<runId>\plan.json" --project erpkuryos --confirm-run <runId>
```

**Nenhum dos dois últimos comandos foi executado.** O plano deve ser regenerado imediatamente antes da janela aprovada.

## Decisões e arquivos ainda necessários

1. planilha do inventário físico por material, lote, endereço, titularidade, unidade e quantidade;
2. decisão sobre os 2.973 conflitos;
3. decisão sobre as 46 referências órfãs;
4. horário de corte, responsáveis e confirmação de bloqueio do sistema antigo;
5. fontes oficiais de bancos/títulos, contas ECD, capacidade de SKU e lead time/lote mínimo;
6. política de retenção dos históricos que aparecem apenas no export de origem.

Sem esses insumos, a rotina e a simulação estão concluídas, mas a união operacional não deve ser declarada concluída.
