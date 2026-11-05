# Spec — P&D: Manipulação em Lote de Amostras do mesmo projeto

> Data: 04/11/2026 · Branch `pd-lote/manipulacao-lote` (base `hostinger-deploy`, D-13) · Fonte:
> `PROMPT_PD_MANIPULACAO_EM_LOTE.md` (P1 aprovado com ajustes D-01, D-02, D-03, D-05, D-12, D-13).
> Autor: Engenheiro de Sistemas (Dev Sênior). Revisão própria em `…-revisao-dev.md`; auditoria da spec em
> `AUDITORIA_PD_MANIPULACAO_LOTE.md` (0 Crítico, 5 Altos — todos incorporados, §12). Progresso: `…-progresso.md`.

## 1. Pedido e resultado esperado

"Quando um projeto tiver várias amostras, uma caixinha para produzir em lote. As selecionadas aparecem na
manipulação, clonáveis umas das outras, com edição de fragrâncias e outros ingredientes."

Na aba **Overview** da solicitação P&D, o painel **Amostras deste projeto** lista as variações do projeto com
checkbox e o motivo de quem não pode entrar. Com 2 a 20 marcadas, **Manipular em lote** abre a matriz
(amostras nas colunas, ingredientes nas linhas, 100 % ao vivo por coluna). **Salvar** grava só o rascunho no nó
do lote (um `update()`). **Gerar ordem** (servidor) cria, numa gravação, uma versão nova **já travada** de
`pd_formulas` por amostra a partir do rascunho, assina cada versão e grava a ordem do lote (pré-mistura opcional
por fase + adições por amostra) montada **dos itens dessas versões**. Pesagem, correção, conferência e registro
da manipulação passam pelo servidor. Depois, cada amostra segue o próprio caminho; as ações em lote usam a rota
real de status, uma amostra por vez.

## 2. Decisões aplicadas (P1 + auditoria)

| ID | Aplicação nesta entrega |
|---|---|
| D-01 | Mesmo projeto e tenant; solicitação `OPEN`/`IN_PROGRESS` (etapa ausente não entra — B4); variação sem decisão do cliente, não cancelada e **não enviada aguardando retorno** (`status` enviada/em avaliação/aguardando retorno — A4); fora de outro lote aberto (`rascunho`/`ordem_gerada`). **Mínimo 2, máximo 20.** O servidor reconfere tudo ao gerar a ordem. |
| D-02 | Três níveis por célula diferente da matriz: (1) fragrância livre; (2) comum exige motivo (≥ 5); (3) **crítico** (`materiais/{key}/criticoPd === true`) exige motivo **e** aprovação de outra pessoa com qualificação no perfil (ADM ou módulo `aprovar_critico_pd`, só o ADM atribui — A2); a amostra fica `fora_da_base`. **Crítico vence fragrância.** Fragrância = material MPES no cadastro ou função "fragrância" no item da fórmula de origem; nome/INCI só sugerem na tela (A1). Rota e servidor recalculam crítico/fragrância das fontes (`classificarIngredientes`), nunca do rascunho. Sem material marcado, o nível 3 não dispara (manual registra). `pd_sample_batches` segue com AMO-02 (intocado). |
| D-03 | Versão nova de `pd_formulas` por amostra, criada **no gerar ordem pelo servidor**, já `locked`, com `origem_lote`, fases copiadas e `current_version` atualizado nessa hora (A4). O rascunho nunca vira vigente. Mudar depois: cancelar o lote (motivo) e abrir outro → versão nova. MP nova: a versão do lote acrescenta a origem na mesma solicitação (servidor, Admin SDK — M6); a versão anterior **mantém** a dela (nunca cancela). |
| D-04 | Padrão (a): fórmula vigente da amostra selecionada mais recente que fecha 100 %. (b) base vigente do projeto só aparece se existir. (c) amostra aprovada: fora (§11). |
| D-05 | Pré-mistura desligada por padrão, só por fase **com nome**; ingrediente sem fase é sempre pesado por amostra. Comum = presente em todas as amostras ativas com o mesmo % (4 casas). Excesso `perda_pct` (padrão = `indice_perdas` da matriz) **arredondado para cima** por linha (B1). Mínimo pesável 0,05 g com aviso de pré-diluição (B2 em `MELHORIAS_FUTURAS.md`). |
| D-06 | Quantidade alvo em **gramas** por amostra (padrão: `quantidade_por_variacao` da amostra se a unidade é g). ml/un só com densidade (g/mL). Sem gramas a ordem não é gerada. 0,01 g por linha; pesagem comum = soma dos arredondados. |
| D-07 | Ações em lote (Em Testes, pedir liberação, estabilidade) **só com lote `manipulado`** e membro ativo (M5), pela rota real (`PUT /pd/requests/{id}/status`, `POST …/liberacao-antecipada`), **uma amostra por vez**; falhas listadas. `liberarEtapaPd` também recusa Em Testes de membro cujo lote ainda não foi manipulado e reconfere a assinatura da versão (A5). |
| D-08 | Antes da ordem: tirar/cancelar livre (cancelar com motivo ≥ 5). Depois: motivo ≥ 10; nada é apagado. Lote `manipulado` não cancela; aceita **ocorrência** (evento, só inclusão — B6). |
| D-09 | (a) painel na Overview. (b) kanban: fora (conflito com o Codex em `PDPage.js`). |
| D-10 | Cria/edita/registra: ADM e P&D (`role`/`funcoes` `pd`, `lider_pd`, `formulador`, `engenharia_produto`, ou `modulos.pd`). PCP e comercial só leem. |
| D-11 | Pesagem por linha: teórico, real, desvio, lote da MP (ou `nao_informado`, marcado), quem pesou; desvio acima de max(0,01 g; 1 %) exige motivo (M4); correção é **novo registro** que aponta o anterior (estorno), nunca sobrescreve. Conferência por segundo usuário ligada por padrão (`config/pdLote/conferenciaSegundoUsuario`; ausente = ligada; só o ADM grava `false` — B5). |
| D-12 | Lote em `erp/{tenant}/pd_manipulacao_lotes/{loteId}`, coleção nomeada; o `$collection` passa a excluí-la. Escrita **granular por filho** (A3). Ordem, versões, pesagens, manipulação e aprovações críticas: só o servidor (callable `manipulacaoLoteServidor`). |
| D-13 | Base `hostinger-deploy`. Sem push, sem regra publicada, sem deploy. |

## 3. Modelo de dados

`erp/{tenant}/pd_manipulacao_lotes/{loteId}`:

```
id, tenant_id, codigo "LM-2026-031-1", projeto_id, projeto_numero, projeto_nome,
status: "rascunho" | "ordem_gerada" | "manipulado" | "cancelado",
revisao (int, +1 a cada gravação — regra do banco), criado_em/por/por_nome, atualizado_em/por/por_nome,
matriz: { tipo: "amostra" | "base_projeto" | "vazia", ref_id, request_id?, versao, codigo, celulas{ingKey: %} },
membros: { "{reqId}": { request_id, development_id, sample_id, variacao_id, codigo_amostra,
           quantidade_g, unidade_pedido, quantidade_pedido, densidade?, formula_id_antes, versao_antes,
           assinatura_antes, fora_da_base, diferencas[], status_membro: "ativo" | "removido",
           removido_motivo?, removido_por?, removido_por_nome?, removido_em?,
           — servidor — formula_id_lote, versao_lote } },
ingredientes: { "{ingKey}": { nome, codigo, catalog_id, master_material_id, inci, fase, funcao,
                ehFragrancia, critico (recalculados), price_per_kg, price_usd?, price_currency?, unit, fornecedor, mp_nova? } },
celulas:  { "{reqId}": { "{ingKey}": percentual } },   motivos: { "{reqId}": { "{ingKey}": { texto, nivel, valor, por, por_nome, em } } },
pre_mistura: { "{fase}": true }, perda_pct, minimo_pesavel_g,
eventos:  { "{id}": { tipo, por, por_nome, em, detalhe, mudancas[]? } },     // só inclusão (regra)
cancelamento?: { motivo, por, por_nome, em },                                 // grava uma vez
— só servidor —
aprovacoes_criticas: { "{reqId}": { "{ingKey}": { valor, por, por_nome, em } } },
ordem:  { gerada_em, gerada_por, gerada_por_nome, assinaturas{reqId: sha256}, versoes{reqId: {formula_id, versao}},
          fases[], pre_misturas{…}, adicoes{reqId: linhas[]}, linhas_pesagem{linhaId: {tipo, fase, ingKey, request_id?, nome, teorico_g}},
          avisos[], total_teorico_g, conferencia_segundo_usuario },
pesagens: { "{linhaId}": { teorico_g, atual: "r1", registros: { "r1": { real_g, desvio_g, motivo_desvio?, lote_mp, lote_mp_informado,
            pesou, pesou_nome, em, corrige?, motivo_correcao?, conferiu?, conferiu_nome?, conferido_em? } } } },
manipulacao: { em, por, por_nome, observacao, entregue{reqId: g}, retencao{reqId: {g, local, prazo}},
               descarte{g, motivo}, perda_declarada_g, conciliacao{pesado_g, destinos_g, residuo_g, tolerancia_g, perda_max_g, ok} }
```

Chave do ingrediente gerada (`i01`…), par material+fase único. Versão do lote (servidor): `pd_formulas/{fid}` com
`origem_lote {lote_id, codigo, matriz}`, `parent_formula_id = formula_id_antes`, `locked: true`,
`locked_motivo: "ordem_lote"`; itens `{fid}_{ingKey}`. Campos novos fora do lote: `materiais/{key}/criticoPd`;
`usuarios/{uid}/modulos/aprovar_critico_pd`; `crm_samples/{s}/variacoes/{idx}/lote_manipulacao {lote_id, codigo,
formula_id, versao, fora_da_base, diferencas[], composicao[{chave, nome, pct}]}` (servidor, na ordem — M8);
`…/aprovacao_cliente/formula_aprovada {id, versao}` (COM-02 grava a versão que o cliente viu — A4);
`pd_stability_studies/{id}/lote_manipulacao_id|lote_codigo`; `pd_requests/{r}/cancelado_motivo` (LM-05).

## 4. Motor puro — `crm-frontend/src/lib/manipulacaoLote.js`

`motivoInelegivel`, `validarSelecao`, `matrizPadrao`, `montarMatriz`, `clonar`, `classificarIngredientes`,
`nivelDaMudanca` (crítico > fragrância > comum), `diferencas`, `pendencias`, `fechamentoPorMembro`,
`quantidadeEmGramas`, `ordemIndividual`, `ordemDoLote`, `textoCanonicoItens`/`assinaturaItens` (material|nome|fase|%),
`conciliacaoMassa` (teto da perda declarada — M3), `desvioPesagem`, `composicaoValida`/`oQueVaria` (material+fase,
versão aprovada — M8), `planoSalvarLote` (só rascunho). Cópia CJS em `functions/manipulacao_lote.js` com
contrato Vitest (`manipulacaoLote.contrato.test.js`); o servidor assina a ordem com SHA-256 do mesmo texto canônico.

## 5. Rotas (adaptador, `lib/manipulacaoLoteRotas.js` ligado em `firebaseApi.js`)

| Rota | O quê | Leituras |
|---|---|---|
| `GET /pd/projetos/{proj}/amostras-elegiveis` | painel: elegibilidade e motivo, lotes do projeto, matriz padrão | 7 coleções |
| `POST /pd/manipulacao-lotes` | cria rascunho (`codigo` reservado por transação), matriz inicial, `assinatura_antes`; `revisao 1` | 9 |
| `GET /pd/manipulacao-lotes/{id}` | lote + estado de cada membro + conferência ligada? | 4 |
| `PUT /pd/manipulacao-lotes/{id}` | salvar o rascunho (§6) com a `revisao` lida | 6 |
| `POST …/{id}/gerar-ordem` · `pesagens` · `corrigir-pesagem` · `conferir` · `registrar-manipulacao` · `aprovar-critico` | `manipulacaoLoteServidor` | servidor |
| `POST …/{id}/acoes` `{acao: em_testes | liberacao | estabilidade}` | D-07, lote `manipulado` | por membro (rota real) |
| `POST …/{id}/membros/{req}/remover` · `…/cancelar` · `…/ocorrencia` | D-08 / B6 | 1–2 |
| `POST …/{id}/base-projeto` | LM-12 | 2 + reserva |
| `GET|PUT /pd/manipulacao-lotes-config` | conferência (ADM) | 1 |

## 6. Salvar o rascunho (um `update()`)

1. Carga única: lote, `pd_requests`, `pd_formulas`, `pd_formula_items`, `crm_samples`, `materiais`.
2. Conferências: `revisao` = gravada (senão 409); status `rascunho`; cada membro ativo ainda elegível; a vigente
   de cada membro ainda é `formula_id_antes` com a mesma `assinatura_antes` (senão 409 "a fórmula mudou fora do lote");
   crítico/fragrância recalculados (`classificarIngredientes`); formato da MP nova.
3. Plano puro: `ingredientes`, `celulas`, `motivos` (carimbo só quando texto/valor mudam), `pre_mistura`, `perda_pct`,
   `minimo_pesavel_g`, `membros/{r}/quantidade_g|densidade|fora_da_base|diferencas`, `revisao+1`, `atualizado_*`,
   evento com o de→para de cada célula (B3), e `OPEN → IN_PROGRESS` + histórico. A regra recusa o `update` inteiro se
   a `revisao` não for a gravada + 1.
4. Depois: `pdSyncRequestStatus` de quem saiu de Aberto, **um por vez**; resumo à callable `registrarAuditoriaCrm`.
5. Mesmo conteúdo (duplo clique) → `{ sem_mudanca: true }` sem gravar nada; conteúdo novo com `revisao` velha → 409.

## 7. Servidor — callable `manipulacaoLoteServidor({ tenant, loteId, acao, … })`

Uma callable (27 → 28 em `run_render_functions_test.js`), módulo `functions/manipulacao_lote.js`. Perfil ativo +
tenant + papel D-10 conferidos pelo uid; erros de negócio → `HttpsError` com a mensagem.

- `gerar_ordem {revisao}`: lê lote, solicitações, desenvolvimentos, fórmulas, itens, fases, `crm_samples`,
  `materiais`, `config/cambio`, solicitações de MP nova; confere status `rascunho`, ≥ 2 ativos, elegibilidade
  (incl. decisão do cliente e "aguardando retorno"), `formula_id_antes` ainda vigente e intacta, gramas por membro,
  níveis pelas fontes, motivos e aprovações críticas válidas, 100 % por membro. Reserva cada versão por transação
  (`max(contador, maior gravada)+1`). Reclama a `revisao` por transação (`r → r+1`; mudou → 409). Grava num
  `update()`: versões travadas + itens (custo pela mesma fórmula do `pdItemCosts`) + fases + `current_version` +
  ordem montada **dos itens** + assinaturas SHA-256 + `membros/{r}/formula_id_lote|versao_lote` + `lote_manipulacao`
  na variação (composição) + origens de MP nova + `status ordem_gerada` + evento.
- `registrar_pesagens {linhas}` / `corrigir_pesagem {linhaId, real_g, lote_mp, motivo}` / `conferir_pesagem {linhas}`:
  só linhas da ordem; desvio fora da tolerância exige motivo; correção = registro novo; conferente ≠ quem pesou.
- `registrar_manipulacao {…}`: todas as linhas com registro atual (e conferido, se ligado); assinatura SHA-256 de
  cada versão recalculada = gravada; pesado = Σ `real_g` atual; perda ≤ teto; conciliação na tolerância → `manipulado`.
- `aprovar_critico {requestId, ingKey}`: ADM ou `modulos.aprovar_critico_pd` (perfil, pelo uid); ≠ autor do motivo;
  grava o valor atual (mudar a célula invalida); `revisao+1`.
- `liberarEtapaPd` (existente) ganha: membro ativo de lote `ordem_gerada` não vai a Em Testes; membro de lote com
  ordem tem a assinatura da versão reconferida.

## 8. Regras do banco (A3)

- `erp/$tenant/$collection/.write` ganha `&& $collection != 'pd_manipulacao_lotes'`.
- `pd_manipulacao_lotes/$lote/.write`: só **criação** (`!data.exists()`), papel D-10, tenant, `newData` com
  `status rascunho`, `revisao 1` e sem `ordem/pesagens/manipulacao/aprovacoes_criticas/cancelamento`.
- `.write` granular, cada um com papel + tenant + `revisao` nova = gravada + 1 (no próprio `.write`, que roda
  também em exclusão): `revisao`, `atualizado_*`; `ingredientes`, `celulas`, `motivos`, `pre_mistura`, `perda_pct`,
  `minimo_pesavel_g` só com status gravado `rascunho`; `membros/$req` só em rascunho e sem apagar o membro;
  depois da ordem só `status_membro ativo → removido` com `removido_motivo` ≥ 10 e `removido_*` gravados uma vez;
  `status` só `→ cancelado` (de rascunho/ordem_gerada) com `cancelamento/motivo`; `cancelamento` grava uma vez;
  `eventos/$ev` só inclusão (`!data.exists() && newData.exists()`, `por == auth.uid`). `ordem`, `pesagens`,
  `manipulacao`, `aprovacoes_criticas`, `matriz`, `codigo`, `projeto_id`: sem `.write` (Admin SDK).
- `materiais/$material/.validate`: `criticoPd` só muda pelo ADM (comparação de primitivo, cobre remoção).
- `config/pdLote/conferenciaSegundoUsuario`: booleano; só o ADM muda (apagar volta ao padrão ligado).
- Testes no emulador (`firebase.pdlote-test.json`, 9063, `demo-pd-lote`): criação; segunda gravação com a mesma
  revisão negada; caminho profundo (`celulas/r/i`) sem subir a revisão negado; apagar evento, membro (depois da
  ordem) e cancelamento negados; `production`, `comercial`, `pcp` e outro tenant negados; exclusão do lote negada;
  cliente gravando `ordem/pesagens/manipulacao/aprovacoes_criticas` negado; célula depois da ordem negada;
  `criticoPd` por PCP negado; mais o adaptador real contra o emulador.

## 9. Exclusão (LM-05, M7)

- `DELETE /pd/requests/{id}`: membro de lote `ordem_gerada`/`manipulado` → **não apaga**: `CANCELLED` com
  `cancelado_motivo` e histórico. Membro só de rascunho: marcado `removido` (motivo) e a cascata física segue.
- `deleteSampleCascade`/`deleteCard`: amostra ou projeto com variação em lote `ordem_gerada`/`manipulado` → **409**
  (arquive em vez de excluir); lotes em rascunho do projeto/amostra são cancelados (motivo) antes da cascata. O
  `.catch(() => null)` sai: falha na cascata vira erro visível e a amostra não é apagada.
- `PUT/DELETE /pd/formula-phases/{id}` recusam versão `locked`; `DELETE /pd/catalog/{id}` não mexe em item de versão
  `locked` (A5).

## 10. Tela

- `PDDetail.js` só ganha o painel na Overview e o import.
- `components/ManipulacaoLote/PainelAmostrasProjeto.js`: checkbox, motivo, lotes do projeto, **Manipular em lote**.
- `components/ManipulacaoLote/EditorLote.js` (tela cheia): matriz com coluna de ingrediente fixa, fragrância
  destacada (sugestão por nome em cinza), célula ≠ matriz marcada (nível 2 âmbar, 3 vermelho), rodapé 100 % por
  coluna, Clonar matriz para todas, Clonar coluna → coluna, Aplicar ingrediente a todas, Adicionar ingrediente
  (MPES/MPGR do `/pd/catalog`), motivo inline, quantidade/densidade, pré-mistura por fase, excesso; < 640 px uma
  amostra por vez.
- `components/ManipulacaoLote/OrdemLote.js`: ordem para imprimir (`lib/ordemLoteHtml.js`), pesagem/correção/
  conferência, Registrar manipulação, ações em lote com relatório, ocorrência, Tornar a matriz a nova base.

## 11. Fora desta entrega (vai para `MELHORIAS_FUTURAS.md`)

LM-09 kanban (conflito com o Codex); matriz (c) de amostra aprovada; MP nova criada dentro do editor do lote;
estoque do laboratório; rótulo/laudo/INCI da amostra "fora da base" (os dados ficam gravados); pré-diluição como
linha da ordem (B2); `locked` na regra com coleções nomeadas `pd_formulas/items/phases` e fechar a escrita de
`erp/$tenant` (A5.3 + risco residual: decisão do Marlos); transição em lote no servidor; assinatura conferida
também na geração de ficha/BOM/SKU no cliente (hoje: `liberarEtapaPd` + rotas que recusam `locked`).

## 12. Auditoria da spec — como foi incorporada

| Achado | Onde ficou |
|---|---|
| A1 crítico/fragrância de fonte confiável; crítico vence | D-02; motor `classificarIngredientes`/`nivelDaMudanca`; rota e servidor recalculam; testes de forja |
| A2 aprovador por qualificação no perfil | D-02; módulo `aprovar_critico_pd` (`identidade_acesso.js`, `auth_check.js`); servidor confere pelo uid |
| A3 escrita granular; exclusão negada | §8 + testes de negação no emulador |
| A4 vigente só na ordem; aguardando retorno fora; versão aprovada | D-01, D-03, §6, §7; COM-02 grava `formula_aprovada` |
| A5 rotas recusam `locked`; assinatura em `liberarEtapaPd` | §7, §9; residual §11 |
| M1 ordem dos itens · M2 assinatura por material + SHA-256 · M3 teto da perda · M4 tolerância e estorno · M5 ações só manipulado · M6 fila pelo servidor · M7 exclusão 409 · M8 composição na ordem | §3, §4, §7, §9, D-07, D-11 |
| B1 excesso para cima · B3 de→para · B4 etapa ausente · B5 config ausente = ligada · B6 ocorrência | D-05, §6, D-01, D-11, D-08 |
| B2 pré-diluição | §11 (adiado) |

## 13. Auditoria final (LM-15, 05/11/2026) — o que mudou no desenho

O auditor confirmou no emulador que o controle de crítico se contornava. Correções (teste de regressão:
`run_manipulacao_lote_auditoria_test.js`, um cenário por ataque):

- **Crítico também contra a fórmula anterior da amostra** (`diferencasDoLote`, `origem`): clonar a matriz que muda o
  conservante de uma amostra pede motivo e aprovação, mesmo igual à matriz. Continua valendo a diferença contra a matriz
  (união — mais estrito que o D-02 original). `fora_da_base` segue sendo só "difere da matriz".
- **Nada de crítico decidido pelo que o cliente grava:** no `gerar_ordem` o servidor recalcula a matriz da fonte (fórmula de
  uma amostra do lote ou base do projeto) por material + fase e recusa se o lote divergir; ingrediente sem material do
  Cadastros/catálogo e fora das fórmulas de origem é recusado; linha de origem sumida do lote é recusada; crítico é
  reconhecido também pelo nome do material marcado. A aprovação grava `chave` (material + fase) e `master_material_id`;
  trocar o material invalida.
- **Autor do motivo = quem grava** (regra `motivos/$r/$k/por`); motivo sem autor não serve para crítico. Na criação,
  `criado_por` e o autor de cada evento também são quem grava.
- **Membro conferido contra a solicitação, a variação e o projeto** (o desenvolvimento é da solicitação; a variação é dela;
  a amostra é do projeto do lote).
- **Célula só de ingrediente do lote, de 0 a 100 %**; o 100 % é conferido de novo sobre os itens da versão montada.
- **Lote preso em `gerando_ordem`** (servidor caiu no meio): depois de 2 min a tela oferece "Gerar ordem de novo" e
  "Cancelar lote" (a regra passa a aceitar o cancelamento nesse estado).
- **Módulo "Aprovar crítico P&D"** existe de fato (`KURYOS_MODULOS` e `MODULOS_VALIDOS`); só o ADM marca.
- **§9 revisto:** a trava de fases vale só para versão criada pela ordem de um lote (`origem_lote`) e cobre também criar
  e reordenar; versões que só foram a Em Testes continuam com o Modo de Preparo editável, como antes.
- O servidor relê o banco depois de travar o lote. Residuais registrados em `MELHORIAS_FUTURAS.md`.

## 14. Adicionar ingrediente igual à aba Manipulação (05/11/2026, pedido do Marlos)

O "Adicionar ingrediente" do lote passou a ser a mesma linha da aba Manipulação (Fase, Ingrediente com as sugestões
do banco, INCI, Fornecedor com o preço de cada um, %Fórmula, Preço R$/Kg, Preço US$/Kg, MP nova com o chip MPGR/MPES
e a oferta de vincular quando o nome já existe) mais **Aplicar em** (o % vai para todas ou para uma amostra). A
biblioteca de MPs saiu de `pages/PDDetail.js` para `lib/bibliotecaMpPd.js` (e o chip para
`components/pd/ChipTipoMpNova.js`), usada pelos dois. Sai do §11 a "MP nova criada dentro do editor do lote": ao salvar,
MP nova com nome já cadastrado dá 409 com o vínculo; usada em alguma amostra, entra na fila do Cadastros com a origem
`lote_{id}__{ingrediente}`; na ordem, o servidor aceita o ingrediente pela MP nova e soma a versão à mesma solicitação.


## 15. Sem comentário e conclusão num clique (05/11/2026, decisão do Marlos)

> *"Ao preencher as amostras em lote, após a conclusão do preenchimento elas devem ir diretamente para a manipulação,
> criando suas V1, V2, V3… E não é necessário comentar as alterações."*

Motivo do pedido: no lote real `LM-2026-041-2` (3 amostras sem fórmula, matriz vazia) cada ingrediente contava como
"mudança" contra uma matriz de 0 % e pedia um motivo de 5 letras por amostra; o botão "Gerar ordem" ficava cinza sem
dizer por quê e as amostras ficavam com "Nenhuma fórmula criada".

- **D-02 revogada quanto ao motivo.** `pendencias()` não gera mais o tipo `motivo`. O nó `motivos/{r}/{k}` continua com o
  mesmo nome (regra do banco inalterada: `por == auth.uid` ou igual ao anterior), mas virou **carimbo automático** de
  quem alterou: `planoSalvarLote` grava `{ texto: "", nivel, valor, por, por_nome, em }` para toda célula que difere da
  matriz ou da fórmula anterior, e só troca o autor quando o **valor** muda.
- **D-1 (crítico).** Só sobra a pendência de crítico que muda a fórmula **anterior da própria amostra**
  (`mudancasCriticasDaOrigem`): exige "Aprovar" de ADM/módulo `aprovar_critico_pd` que não seja o autor do carimbo.
  Amostra sem fórmula anterior (primeira formulação) não pede aprovação; o crítico aparece só com o selo. A diferença de
  crítico contra a matriz, numa amostra que mantém o próprio valor anterior, deixou de pedir aprovação (não muda a fórmula
  dela). O servidor (`aplicarAprovacao`) recusa aprovar sem fórmula anterior e sem carimbo salvo.
- **Botão único "Concluir e enviar para a manipulação"** (substitui "Gerar ordem"): salva o que está na tela e chama
  `gerar_ordem` com a revisão gravada; o servidor cria a próxima versão travada de cada amostra (V1 se não tinha, V(n+1)
  se tinha, por `sequences/pd_formula_version_{dev}`) e a ordem. Ao lado, "Para concluir, falta: …" lista gramas, 100 % e
  críticos; as gramas valem do que está na tela.
- **Matriz vazia:** colunas de amostra sem fórmula anterior não são marcadas como "diferença".
- **Aba Manipulação e Custo P&D** da amostra mostram em que lote aberto ela está (`GET /pd/requests/{id}/lote-aberto`,
  lê só `pd_manipulacao_lotes`).
- **Auditoria do diff (05/11):** o carimbo não estava preso à célula — com escrita direta, quem mudou um crítico podia
  manter o autor de outra pessoa (ou reescrever o valor do carimbo) e aprovar a própria mudança; trocar o material com o
  mesmo número também preservava o autor. Corrigido: o carimbo leva `valor` **e** `chave` (material+fase) e só preserva o
  autor com os dois iguais; motor e servidor exigem carimbo do valor e material atuais; **regra nova** em
  `motivos/$r/$k` (autor anterior só com mesmo `valor` e `chave`). Teste de emulador K cobre o ataque. Concluir para se o
  salvamento devolver pendência; a tela não promete o número da versão (o servidor reserva o maior + 1).
- Testes: CRM 486 (motor, rota, render — caso de matriz vazia incluso). Emulador (`run_manipulacao_lote_servidor_test.js`,
  `run_manipulacao_lote_auditoria_test.js`) revisados por leitura; rodar no computador antes do deploy.
