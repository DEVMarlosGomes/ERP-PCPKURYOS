# Prompt de Engenharia — Módulo Financeiro ERP Kuryos

Nov 10, 2026 · @Marlos

## Como usar

Este documento é um prompt único para o agente de código no VS Code construir o módulo financeiro do ERP Kuryos. Ele consolida os dois vídeos gravados pelo financeiro em 05/11/2026 mostrando o ERP atual (WebMais).

1. Abra o repositório `DEVMarlosGomes/KuryosBeauty` no VS Code.
2. Salve este documento como `docs/prompt-financeiro.md` no repositório (exporte em Markdown).
3. No chat do agente, peça: "Leia docs/prompt-financeiro.md e execute a Fase 0".
4. Aprove o plano da Fase 0 antes de liberar a Fase 1. Avance uma fase por vez.

Tudo a partir de "Papel e contexto" é dirigido ao agente.

> Nota (10/11/2026): executado neste repositório (`PCP-Kuryos-main`, financeiro já existente).
> O anexo com as transcrições dos vídeos não veio junto. A Fase 0 está em
> `docs/financeiro-fase0-lacunas.md`.

## Papel e contexto

Você é um engenheiro full stack sênior trabalhando no ERP Kuryos (repositório KuryosBeauty, produção em kuryoserp.com.br). Sua missão é implementar o módulo financeiro, do banco de dados à interface, com testes.

- **Cliente interno:** o financeiro da Kuryos Beauty Packing Industrial, que hoje opera no ERP WebMais e quer a mesma rotina no ERP Kuryos.
- **Origem dos requisitos:** dois vídeos de tela narrados (12min33s e 3min03s). As transcrições estão no anexo e são a fonte da verdade em caso de dúvida.
- **Em escopo:** nota fiscal de entrada por XML, contas a pagar, contas a receber, caixas e bancos, fluxo de caixa, demonstrativo de fluxo de caixa e relatórios financeiros.
- **Fora de escopo:** DRE por competência e vínculo por lote de produto. Apenas deixe o modelo preparado.
- **Princípio:** o WebMais é referência de comportamento, não de layout. Reproduza a lógica e melhore a usabilidade.

## Regras de trabalho

1. **Explore antes de escrever.** Leia o README, a especificação do ERP (ERP\_Kuryos\_Especificacao\_v3, se estiver no repositório), o schema do banco, as rotas e os módulos de fornecedores, clientes, produtos, estoque e notas fiscais.
2. **Siga a stack e os padrões existentes.** Não troque framework, ORM, biblioteca de UI nem estrutura de pastas. Reutilize componentes, autenticação, permissões e padrão de migrations já adotados.
3. **Não duplique.** Se já existir entidade ou tela equivalente (ex.: fornecedor, nota de entrada), estenda em vez de criar outra.
4. **Planeje e pare.** Na Fase 0, entregue a análise de lacunas e o plano; aguarde aprovação antes de codar.
5. **Entregas pequenas.** Uma fase por vez, em branch própria, com commits atômicos, migrations reversíveis e testes passando.
6. **Dinheiro com precisão.** Use tipo decimal no banco e na aplicação, nunca ponto flutuante. Arredondamento de parcelas: a diferença de centavos vai para a última parcela.
7. **Integridade.** Baixas, estornos e geração de títulos rodam em transação. Nada de exclusão física de movimento financeiro: estorne com lançamento inverso e registre quem e quando.
8. **Datas.** Fuso America/Sao\_Paulo, formato dd/mm/aaaa na interface, valores em R$ com vírgula decimal.
9. **Não invente regra de negócio.** O que não estiver neste documento ou no código vira pergunta na lista de dúvidas; siga com a opção mais conservadora e sinalize.
10. **Ao final de cada fase**, relate: o que foi feito, arquivos alterados, como testar manualmente e pendências.
