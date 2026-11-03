# EPA industrial — especificação incremental local

03/11/2026. **Código do incremento publicado na VPS em `43c63ad`, por autorização posterior do Marlos. Fluxo operacional não integrado; não habilita execução de OP.** O núcleo é um contrato normalizado para adaptação das fontes reais, não um cadastro paralelo pronto para uso.

## Reaproveitamento e limites

O ERP já possui `erp/{tenant}/pd_document_versions`, documentos vivos FT/EPA e tarefas de aprovação. Sua EPA atual conserva fórmula detalhada no snapshot (`firebaseApi.js:3311`) e não é uma ocorrência de produção. O contrato comercial usa a expressão “Especificação de Produto Acabado” (`firebaseCommercial.js:2473`); essa é a nomenclatura encontrada, não uma expansão inferida do PDF.

Os novos módulos não estão importados em `functions/index.js`, não têm endpoint, coleção nova nem regra publicada. Nenhum dado é carregado automaticamente do banco neste incremento. **Não conectar ao navegador recebendo `approved`, papéis, política ou snapshots do cliente como verdade.**

## Campos e fontes

| Campo normalizado | Fonte existente / caminho a adaptar | Revisão e responsável | Exibição |
|---|---|---|---|
| `sources.projeto`, produto | `erp/{tenant}/crm_projects/{id}` | ID + revisão explícita; Comercial | Identificação, sem preço |
| `sources.cliente`, `customer` | cliente relacionado ao projeto; cadastro mestre não se resolve só pelo nome | ID + revisão; Comercial | Razão social/CNPJ/marca; sem contatos pessoais |
| `sources.amostra` | amostra aprovada relacionada ao projeto / P&D | ID + revisão aprovada; Comercial/P&D | Referência, não estabilidade presumida |
| `sources.formula`, referência por variante | `erp/{tenant}/pd_formulas` e `formulas/{sku}__vN` | Adaptador deve reconciliar as duas fontes; P&D | Somente referência da fórmula |
| `sources.kickoff`, `fill`, `marking` | `erp/{tenant}/kickoffs/{id}/questionario_composicao` | Revisão aprovada e vigente; donos dos blocos | Conteúdo declarado/máximo, unidade, gravação |
| `sources.bom`, `components` | BOM do Kickoff + `bom/{sku}__vN` | Revisão e material validado; Engenharia/Cadastros | Quantidade, unidade, titular e aplicabilidade explícita |
| `variants` | produtos gerados pelo orçamento e vínculo à amostra | SKU interno, fórmula/GTIN/master correspondentes; Cadastros | Oito ou mais variantes sem copiar referência entre linhas |
| `assets` | arte aprovada/anexos; armazenamento final ainda não provisionado | ID + versão + SHA-256 + variantes; Engenharia/Qualidade | Prévia atual **não incorpora imagens** |
| `occurrence` | `ops/{id}` rascunho + pedido real | ID OP/pedido/cliente; PCP | Lote, fabricação, validade, quantidade, peso de caixa |
| `regulatory`, NCM/CEST | fontes regulatórias/fiscais aprovadas | Responsável confirma aplicabilidade; não inferir códigos | Processo por variante / justificativa de não aplicação |

Os caminhos legados equivalentes ainda precisam de resolução autoritativa. O módulo **não** considera estes caminhos adaptados só porque foram listados aqui. Modelo inicial suporta uma referência de fórmula compartilhada; famílias com fórmulas diferentes exigem adaptador/modelo ampliados antes da emissão final.

## Implementado localmente

- `functions/epa.js`: pendências estruturadas, validação de aplicabilidade, referências/revisões, fórmula, componentes, MPES, GTIN EAN-13/master GTIN-14, datas/quantidades/master e separação de campos documentais.
- Fórmula: mesmo limiar estrito da emissão existente, `abs(total − 100) < 0,0005` ponto percentual; total precisa ser número finito. Não é ajuste automático nem q.s.p.
- `functions/epa-revisions.js`: reducer puro para `RASCUNHO → EM_VALIDACAO → APROVADA`; alteração das fontes/política aborta; revisão cria novo registro e descarta aprovações. Não persiste por si só e não promete concorrência no banco.
- Marlos confirmou em 03/11/2026 a combinação **Qualidade + Engenharia de Produto**. A política local versionada é `functions/epa-policy.js` (v1), com ambos os papéis obrigatórios, sem ordem imposta entre eles. O reducer mantém identidades ativas e segregação do elaborador; não há dispensa automática do ADM. Política confirmada não equivale a integração ou publicação concluída.
- `functions/epa-preview.js`: PDF real, paginado, sempre marcado como rascunho. Texto é desenhado como texto; não interpreta HTML, não busca URLs e não copia assinaturas do modelo.

`ready=true` significa somente que o contrato normalizado passou nas verificações implementadas. Não atesta autenticidade das origens, legalidade fiscal, aprovação regulatória, estabilidade, estoque elegível, capacidade de produzir, imagens preservadas, assinatura ou reserva. Jamais usar esse booleano como autorização industrial.

## Ainda obrigatório antes de integração

1. Usar a política v1 confirmada (Qualidade + Engenharia de Produto) no futuro serviço autoritativo; integrar as permissões de cada ação sem aceitar política enviada pelo cliente.
2. Adaptar dados reais com resolução por IDs, sem correspondência apenas por nome; verificar status nas fontes e períodos de vigência.
3. Persistir especificações/revisões imutáveis por transação, com perfil/tenant ativo conferidos dentro do portão; bloquear gravação direta no RTDB. Nenhuma regra nova existe neste incremento.
4. Criar OP rascunho sem reserva/execução; emitir snapshot por OP + revisão técnica, idempotente, com estado recuperável de artefato.
5. Gerar PDF final/ativos versionados em armazenamento privado, guardar hash/localização e impedir liberação se geração ou armazenamento falhar. Reimpressão retorna exatamente os bytes emitidos.
6. Coordenar portão de execução com estoque por lote/dono, quarentena/vencimento, conversões explícitas e reserva concorrente. Não alterar chave Dia D.
7. Implementar cancelamento, impactos/revisão, barcode decodificável, telas integradas no Kickoff/OP, testes de API/regras/E2E e layout móvel.

## Conflitos e decisões

| Fonte e conflito | Interpretação deste incremento | Situação |
|---|---|---|
| Texto de 21/10: câmbio sem congelamento; plano antigo: enviado congelado | Preço/câmbio atuais separados do documento aprovado imutável; não reescrever emitidos | Não muda cálculo comercial neste incremento |
| 15/10 MP só após aprovação × reunião 28/10 fila imediata | Solicitação provisória não é material validado para produção | Validador local recusa provisório |
| Amostra sempre 1000 g × revisão aprovada 60 + base 1000 | Separar volume real/base/unidade; sem densidade presumida | Sem alterar amostras existentes |
| Sem aprovação do químico × CQ obrigatório | Não dispensa Qualidade, cliente nem liberação da EPA | Marlos confirmou Qualidade + Engenharia para EPA |
| Antecipação à diretoria sem leitura | Não equivale a estabilidade ou prontidão industrial | Não aprova fonte automaticamente |
| Estoque bloqueante × Dia D | Manter configuração atual; nunca habilitar pela geração de PDF | Produção intacta |
| Ficha no BOM × fora do PDF | Referência visível; composição detalhada em documento separado | Snapshot local separa composição |
| Operacional/equipamentos × documento exportado | Interno; não exportar equipamentos por omissão | Prévia não os inclui |
| Histórico de 2 agentes/Figma/skills | Contexto histórico, não mandato de instalar/delegar/publicar | Não executado como instrução nova |
| Planejamento histórico snap 5 × pedido atual 15 min/sem zona fixa | Pedido atual prevalece; sem edição no planejamento | Nenhuma alteração nesta área |
| MR178 arquivo A–G × grade A–H e master final F/H | Registrar divergência; não alterar documento real por inferência | Fixture DEMO A–H, sem nomes/dados reais |

## Manual do incremento

Executar `node --test functions/test/epa*.test.js functions/test/emissao_op.test.js`.
Gerar a demonstração: `node scripts/epa-demo.js` → `scratch/epa-demo/epa-demonstracao.pdf`.
O arquivo contém dados deliberadamente fictícios e **não serve como etiqueta ou autorização de produção**. Não copiar códigos de demonstração para Cadastros.

A operação real continua sem a nova tela. Preparação, aprovação, emissão, revisão, reimpressão e cancelamento reais só poderão ser instruídos após os portões acima serem implementados e validados; não usar o reducer manualmente contra o banco.
