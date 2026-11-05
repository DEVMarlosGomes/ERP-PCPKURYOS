# Correções industriais — backlog verificável

03/11/2026. **Plano incremental, não lista de itens todos corrigidos.** Sem publicação autorizada nesta tarefa.

| Prioridade / item | Estado real | Dependência e próximo passo | Aceite / risco |
|---|---|---|---|
| P0 AUD-EPA-03: consumo adulterável | Reproduzido, não corrigido | Extrair motor de dimensionamento confiável; catalogar massa/volume/perdas/substituições | Payload menor ou código trocado recusado; não romper ajustes legítimos; ensaio isolado antes de mudança |
| P0 AUD-EPA-02: prontidão/portão de execução | Reproduzido, não corrigido | Separar OP rascunho de executável, fontes aprovadas, EPA final, reserva elegível | API e regras negam contorno; PDF falho nunca libera; compatibilidade de OP histórica |
| P0 AUD-EPA-04: aprovação/autoridade por ação | Política Qualidade + Engenharia confirmada; parcial em reducer local | Integrar política v1; servidor carrega perfil/tenant; regras fecham escrita direta | Negativas por perfil/inativo/tenant/autoaprovação; validação transacional de papéis |
| P1 EPA: adaptadores de fontes | Contrato local pronto; integração ausente | Projeto/cliente/amostra/fórmula/Kickoff/BOM/SKU por ID+revisão; não nome | Mudança na origem não mistura revisões; dados reais só leitura ou cópia sanitizada |
| P1 EPA: normalização industrial | Inicial, incompleta | Diferenciar fórmula por variante, processo regulatório, NCM/CEST, gravação rica, limites e prazo aprovado | Validações no servidor; nenhum código/densidade/validade inventado |
| P1 EPA: persistência/versionamento | Reducer testado; banco não implementado | Transações, IDs determinísticos, histórico/revisões e política versionada | Duas sessões e retry produzem uma decisão lógica; sem sobrescrever documento emitido |
| P1 AUD-EPA-01: exportação/artefatos | Prévia PDF local; download existente pendente | Endpoint autenticado, bucket privado, hash e recuperação | Bytes/PDF corretos e privados; falha registra pendência; reimpressão idêntica |
| P1 EPA: assets/etiqueta master | Metadados validados; bytes/símbolo ausentes | Ativos preservados/versionados, símbolo real e dimensionamento impressão | Decodificar GTIN correto por variante, zeros iniciais; sem URL mutável ou código fictício |
| P1 EPA: acesso pelo Kickoff e OP | Não implementado | API/rotas/persistência antes da UI | Preparar, conferir pendências, submeter, aprovar, emitir, baixar, histórico, revisar/cancelar segundo papel |
| P1 AUD-EPA-05: divergências da referência | Identificadas; nenhum dado real corrigido | Responsável resolve master F/H e semântica “Variações” | Fonte aprovada/documentada; dados do modelo nunca defaults globais |
| P1 Dia D | Operação física; não executado | Contagem material/lote/endereço, reconciliação auditável e decisão da operação | Só ligar trava após saldo confiável; não apagar estoque |
| P1 Cutover | Não revalidado nesta auditoria | Janela, impedir escrita no antigo, delta/totais e aceite | Plano operacional real; não iniciar migração como efeito de EPA |
| P1 Auditoria dos demais módulos | 65 itens iniciais não verificados | Decompor todo anexo; rastrear UI→API/regras→banco→consumidores | Não reutilizar “teste verde” como prova de todo pedido |
| P2 Interface e layout | Prévia PDF inspecionada; UI ausente | Skill pertinente, design system existente, fontes reais | 390px/notebook, claro/escuro, nomes longos, navegação/foco; console sem erros |
| P2 Documentação operacional final | Manual do incremento local escrito | Fluxo integrado/decisões fechadas | Manual de emissão/revisão/cancelamento real sem confundir demonstração com produção |

## Sequência segura

1. Fechar o inventário das regras de cálculo e o consumo autoritativo (AUD-EPA-03), mantendo provas reproduzíveis.
2. Integrar política confirmada Qualidade + Engenharia; adaptar e revalidar fontes; persistir especificação/revisões de modo fechado por padrão.
3. Separar ocorrência/OP rascunho; gerar artefato final privado e recuperável; coordenar reserva/portão de execução.
4. Integrar a UI; eliminar o PDF genérico; testar autorização direta, retry, concorrência, falhas e invalidação.
5. Completar a matriz de todos os anexos e testar impactos nos demais setores; encerrar apenas com evidências e riscos residuais explícitos.

Migração futura: dry-run, relatório de vínculos/órfãos, backup, precondições de revisão, idempotência e reversão por caminhos planos. Não converter automaticamente EPA antiga do P&D em documento industrial emitido; não ligar chave de estoque e não escrever em produção neste escopo.
