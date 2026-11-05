# Auditoria — P&D: Manipulação em Lote

- **Auditor de Desenvolvimento de ERP**: independente e só leitura; nenhum código foi editado.
- **Data:** 04/11/2026.
- **Alvo:** spec `docs/superpowers/specs/2026-11-04-pd-manipulacao-lote-design.md` e revisão do Dev (`…-revisao-dev.md`), commit `4becc04`; motor LM-01 (`crm-frontend/src/lib/manipulacaoLote.js`, commit `bd385c9`) conferido contra a spec.
- **Referências:** `PROMPT_PD_MANIPULACAO_EM_LOTE.md` (checklist §3.3) e brief com o P1 aprovado.
- **Severidade:** Crítico / Alto / Médio / Baixo. Crítico ou Alto aberto impede o portão.

## Auditoria da spec

### Veredito

**Nenhum Crítico; 5 Altos.** Os A1, A3 e A4 mexem no que está sendo construído agora (motor, regra LM-04 e salvamento LM-02/03) e devem ser resolvidos na spec antes de avançar. Para os A2 e A5 a correção mínima é pequena (P).

### Achados

| ID | Sev. | Onde | Cenário | Correção mínima |
|---|---|---|---|---|
| A1 | **Alto** | spec §3:52-53, §7:146-148; motor `manipulacaoLote.js:51-58`, `:112-113` | O nível da mudança (D-02) depende de `ehFragrancia` e `critico` gravados pela tela no nó do lote, e a fragrância tem precedência sobre o crítico. A heurística `/fragr\|parfum\|perfum\|essenc\|aroma/i` em nome/INCI/função classifica, por exemplo, "Óleo essencial de melaleuca" como fragrância. Resultado: um ingrediente crítico com limite, ou uma fragrância com alergênico marcada `criticoPd`, muda sem motivo e sem segundo usuário. O servidor (§7) só confere "aprovações válidas" sobre a classificação que recebe. | No servidor (`gerar_ordem`, `aprovar_critico`), derivar `critico` de `materiais/{master_material_id}/criticoPd` lido na hora, e a fragrância do cadastro do material (função/MPES), nunca do nó do lote. Em `nivelDaMudanca`, crítico vence fragrância. Testes: fragrância marcada crítica; ingrediente renomeado com "Aroma"; `critico:false` forjado no rascunho. |
| A2 | **Alto** | spec §7:156-157 ("RT = e-mail de responsável técnico ativo") | O cadastro `erp/$tenant/responsaveis_tecnicos` é alimentado pelo Kickoff (`firebaseCommercial.js:2297-2302`, comercial e papéis do Kickoff) e fica sob o curinga `$collection` (`database.rules.json:726`), gravável por cerca de 11 papéis. Ele também mistura RT de cliente. Quem tem esse acesso passa a "aprovar" mudança crítica de outra pessoa, e a segregação do nível 3 vira formalidade. | A qualificação de aprovador sai de dado que só o ADM grava: função ou módulo no perfil (`usuarios/{uid}/funcoes|modulos`, via `gerenciarUsuario`), conferida no servidor pelo **uid**, não por e-mail. |
| A3 | **Alto** | spec §8:162-169 e testes §8:173-176 | `.write` amplo no `$lote` e "só inclusão" não se sustentam no RTDB: `.validate` não roda em exclusão, e `val()` não compara subárvores. Um usuário P&D consegue apagar `eventos/{id}`, `membros/{req}` depois da ordem, `cancelamento` e `motivos/*`, bastando subir a `revisao`. A lista "não somem" cobre só `ordem/pesagens/manipulacao/aprovacoes_criticas`, e o teste previsto prova "evento reescrito", não "evento apagado". | `$lote/.write` só para criação (`!data.exists()`). Escrita **granular por filho**: `eventos/$ev` com `!data.exists() && newData.exists()`; `celulas/ingredientes/motivos/matriz/pre_mistura/perda_pct` com `status == 'rascunho'`; `membros/$req` com `newData.exists()` e, depois da ordem, só `removido` + motivo; `cancelamento` com `!data.exists()`. Manter a `revisao` no `.validate` do `$lote`. Testes no emulador: apagar evento, membro (pós-ordem) e cancelamento; gravar caminho profundo (`celulas/r/i`) sem subir a revisão, o que também prova que o `.validate` do ancestral roda. |
| A4 | **Alto** | spec §6:126-127 (`current_version` no 1º salvamento); D-01 §2:25; COM-02 `firebaseApi.js:1632-1645` | O rascunho troca a versão vigente antes de existir amostra física, e D-01 aceita variação já **enviada e aguardando retorno**. Cenário: v3 enviada ao cliente; a química salva o rascunho e v4 vira vigente; o cliente aprova o que recebeu (v3). Ficha, BOM e SKU saem da vigente v4, que o cliente nunca viu. O registro de aprovação não guarda a versão. Com até 20 amostras de uma vez, o lote torna isso sistemático. | (1) `current_version` muda só no `gerar_ordem` (servidor); até lá o membro guarda `formula_id_lote`. (2) D-01 exclui variação enviada aguardando retorno, ou pede confirmação explícita. (3) `gerar_ordem` reconfere no servidor a ausência de decisão do cliente. (4) Recomendado: COM-02 grava `formula_id/versao` da amostra enviada. |
| A5 | **Alto** | `firebaseApi.js:2515-2516` (`PUT/DELETE /pd/formula-phases`), `:2770-2774` (`DELETE /pd/catalog` zera `catalog_id` em todos os itens); `database.rules.json` (sem nenhuma conferência de `locked`) | "Versão gravada nunca muda" (checklist 2) não vale nem pelas rotas do próprio app: a fase de uma versão travada pelo lote pode ser renomeada ou apagada pela aba Manipulação. Depois do `manipulado`, nada reconfere. A pré-mistura é por fase. | (1) As duas rotas recusam versão `locked` (P). (2) A assinatura da ordem é reconferida no servidor em `liberarEtapaPd` (membro de lote) e na geração de ficha/BOM/SKU. (3) Risco residual para decisão do Marlos: `locked` na regra, com coleções nomeadas `pd_formulas/pd_formula_items/pd_formula_phases`. |
| M1 | Médio | spec §7:146-150; motor `ordemDoLote` (`:222`) recebe `ingredientes/celulas` | Se o servidor montar a ordem com as `celulas` do nó (gravadas pelo cliente) e não com os itens da versão, uma célula alterada depois do salvamento faz a ordem pesar uma composição diferente da versão travada, enquanto a assinatura continua batendo com a versão. | Ordem montada a partir de `pd_formula_items` das versões; `celulas ≠ itens` devolve 409. |
| M2 | Médio | motor `assinaturaItens` (`:312-315`) | A assinatura usa `nome\|fase\|%`. Trocar o material (outro código ou fornecedor com o mesmo nome) não a altera, e a troca não é detectada. | Incluir `master_material_id\|catalog_id\|material_code`. No servidor, preferir SHA-256 (`node:crypto`), já que cyrb53 tem 53 bits e não é criptográfico. |
| M3 | Médio | motor `conciliacaoMassa` (`:320-326`); spec §7:153-155 | A conciliação sempre fecha, porque `perdaDeclaradaG` é livre: basta declarar o resíduo como perda. | Limitar a perda declarada (ex.: ≤ `perda_pct` × pesado) e exigir motivo e 2º usuário acima disso; `pesadoG` = soma de `real_g`. |
| M4 | Médio | spec §7:151-152 ("só uma vez") | Pesagem sem tolerância real×teórico por linha e sem correção. Um erro de digitação obriga a cancelar o lote. | Tolerância por linha (ex.: ±1 % ou resolução da balança) com desvio e motivo; correção como novo registro (estorno), nunca sobrescrita. |
| M5 | Médio | spec §5:108, D-07 §2:31 | As ações em lote não exigem status. É possível mandar para Em Testes uma amostra nunca manipulada: `liberarEtapaPd` confere 100 %, não a manipulação. | `em_testes/liberacao/estabilidade` só com lote `manipulado` e membro ativo. |
| M6 | Médio | spec §6:130-133; `database.rules.json:592-594` (Dev R-02); `lib/filaCadastroMp.js:112-121` | A fila de MP nova falha **sempre** para formulador, líder P&D e engenharia de produto, e a spec só avisa. Sem a origem da versão do lote, `retirarOrigem` cancela a solicitação quando a versão antiga sai, e a amostra clonada fica com MP nova sem cadastro (BOM/SKU com placeholder). | Incluir as funções do P&D na regra da fila, ou registrar a fila pela callable; persistir `fila_pendente` no membro, com reenvio. |
| M7 | Médio | spec §9:181-187 | A cascata preserva `pd_requests` como CANCELLED, mas `deleteSampleCascade`/`deleteCard` continuam apagando `crm_samples` (com `lote_manipulacao`). Os `membros.sample_id/variacao_id` do lote ficam órfãos (checklist 7). | Recusar (409) ou arquivar amostra que tenha variação com versão de lote ou ordem. Residual: exclusão direta de `pd_requests/pd_formulas` pela regra. |
| M8 | Médio | motor `:473-476` (composição gravada no salvamento); `oQueVaria` `:328-338` | A `composicao` do Kickoff sai do rascunho e envelhece se a amostra ganhar versão nova depois do teste; a comparação é só por nome. | Gravar no `gerar_ordem` (versão travada). O Kickoff usa só `composicao` cujo `formula_id` é a versão aprovada, e compara por material+fase. |
| B1 | Baixo | motor `:257` | `max(base, round(base×(1+p)))`: uma linha pequena (base×p < 0,005 g) fica sem excesso enquanto as outras recebem, e cada porção leva até p % a menos desse ingrediente (ex.: conservante). | Excesso proporcional, ou tirar da pré-mistura (com aviso) a linha cujo excesso arredonda a zero. |
| B2 | Baixo | D-05 (pré-diluição 10 %) | A diluição sugerida cria um intermediário sem lote, pesagem nem responsável. | Bloquear abaixo do mínimo, ou modelar a diluição como linha da ordem. |
| B3 | Baixo | spec §2:27, §3:73-74 | O rascunho substitui os itens a cada salvamento, e os valores intermediários se perdem; o motivo guarda só o último `valor`. | O `eventos` de cada salvamento leva de→para por célula. |
| B4 | Baixo | motor `motivoInelegivel` (`:72`) | `status` ausente vira OPEN. "Versão vigente travada por ordem de outro lote" (D-01) não é conferida no motor. | Conferir no LM-02; tratar status ausente como inelegível. |
| B5 | Baixo | spec §2:35, §8:171 | `config/pdLote/conferenciaSegundoUsuario` é global (raiz `config/`, que o PCP grava), não por tenant. | Servidor trata ausente como ligado; o `.validate` cobre também `set` de `config/pdLote` inteiro. |
| B6 | Baixo | spec §2:32 | Lote `manipulado` não cancela e não há como registrar ocorrência ou desvio depois. | Evento "ocorrência" (só inclusão). |

### Verificado e correto

**Autorização (D-12):**
- `erp/$tenant/.write` é `false` (`database.rules.json:723-725`).
- `$collection` (`:726`) já exclui `audit_log` e `pd_liberacoes_status`.
- No RTDB, o curinga `$x` não alcança um irmão nomeado: a coleção nomeada substitui mesmo o curinga, e a exclusão explícita no `$collection` é só defesa extra.
- `.read` do tenant exige `tenant_id`.
- `crm_samples` e `pd_requests` aceitam os papéis do P&D, então o `update` único não cai na armadilha do R-02.
- `funcoes` é mapa (`child('pd')`), utilizável na regra.

**Trava 100 %:** `pd_requests/$req/status/.validate` continua exigindo `pd_liberacoes_status` para IN_TESTS e WAITING_APPROVAL. As ações usam a rota real, uma amostra por vez, e nada do lote atalha `liberarEtapaPd`.

**Pré-mistura (R-09):** o motor trabalha em centigramas inteiros. A porção é a soma das linhas individuais arredondadas (igual à ordem individual por construção), e o pesado é ≥ base (`:255-262`). Só entram fase com nome, mesmo % em 4 casas e pelo menos 2 membros.

**Decisões do Dev conferidas:**
- `audit_log` fora do `update`, com `eventos` no próprio nó (R-01).
- Versão reservada por transação (R-04).
- Assinatura contra a aba Manipulação (R-07).
- Transação na `revisao` (R-08).
- `variacoes/{idx}` resolvido por `variacao_id` na hora (`:471`).
- Máximo de 20 membros; motivo com mínimo de 5 e 10 caracteres.
- Aprovação invalidada quando o valor muda e exigindo outra pessoa (`:181-184`).
- Tolerância de max(0,05 g × n; 0,5 %).

**Motor LM-01:** `npx vitest run src/lib/manipulacaoLote.test.js` dá 22/22.

**Residual (Baixo):** `pdSyncRequestStatus` regrava `variacoes` inteiro. Uma sincronização concorrente de outra pessoa pode apagar `lote_manipulacao` gravado no meio.

### Não verificado

- As regras no emulador, porque ainda não foram escritas e as portas 9023/9063 estão ocupadas. Em especial, falta provar que o `.validate` do ancestral roda em escrita de caminho profundo (teste do A3).
- As rotas LM-02 em diante e o servidor, que ainda não existem.
- O ensaio com dados reais: a base foi apagada e a Fase 0 foi medida pelo Tech Lead.
- Manual e Central de Ajuda (LM-14).
