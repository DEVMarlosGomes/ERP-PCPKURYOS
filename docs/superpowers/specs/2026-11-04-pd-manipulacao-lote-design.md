# Spec — P&D: Manipulação em Lote de Amostras do mesmo projeto

> Data: 04/11/2026 · Branch `pd-lote/manipulacao-lote` (base `hostinger-deploy`, D-13) · Fonte:
> `PROMPT_PD_MANIPULACAO_EM_LOTE.md` (P1 aprovado com ajustes D-01, D-02, D-03, D-05, D-12, D-13).
> Autor: Engenheiro de Sistemas (Dev Sênior). Revisão própria em `2026-11-04-pd-manipulacao-lote-revisao-dev.md`.
> Progresso por ticket: `2026-11-04-pd-manipulacao-lote-progresso.md`.

## 1. Pedido e resultado esperado

"Quando um projeto tiver várias amostras, uma caixinha para produzir em lote. As selecionadas aparecem na
manipulação, clonáveis umas das outras, com edição de fragrâncias e outros ingredientes."

Na aba **Overview** da solicitação P&D, o painel **Amostras deste projeto** lista as variações do projeto com
checkbox e o motivo de quem não pode entrar. Com 2 a 20 marcadas, **Manipular em lote** abre a matriz
(amostras nas colunas, ingredientes nas linhas, 100 % ao vivo por coluna). Salvar grava, num único `update()`,
uma versão nova de fórmula por amostra. **Gerar ordem** (servidor) trava as versões e grava a ordem do lote
(pré-mistura opcional por fase + adições por amostra). Pesagem, conferência e registro da manipulação passam
pelo servidor. Depois, cada amostra segue o próprio caminho; as ações em lote usam a rota real de status, uma
amostra por vez.

## 2. Decisões aplicadas (P1)

| ID | Aplicação nesta entrega |
|---|---|
| D-01 | Mesmo projeto e tenant; solicitação `OPEN`/`IN_PROGRESS`; variação sem decisão do cliente (`resultado_cliente`/`status` ≠ aprovada, reprovada, cancelada); fora de outro lote aberto (`rascunho`/`ordem_gerada`); versão vigente não travada por ordem de outro lote. **Mínimo 2, máximo 20.** |
| D-02 | Três níveis por célula diferente da matriz: (1) fragrância livre; (2) comum exige motivo (≥ 5 caracteres); (3) **crítico** (`materiais/{key}/criticoPd === true`) exige motivo **e** aprovação de segundo usuário (ADM ou RT cadastrado), e a amostra fica `fora_da_base`. Sem material marcado, o nível 3 não dispara (manual registra). O lote antigo `pd_sample_batches` segue com AMO-02 (intocado). |
| D-03 | Versão nova de `pd_formulas` por amostra, com `origem_lote` e fases copiadas. Enquanto o lote é rascunho, a versão do lote é rascunho e os itens dela são **substituídos** a cada salvamento (ids determinísticos). Gerar ordem trava (`locked`) e assina cada versão. Mudar depois: cancelar o lote (motivo) e abrir outro → versão nova. MP nova da versão anterior **mantém** a solicitação; a versão do lote acrescenta a origem dela (nunca cancela). |
| D-04 | Padrão (a): fórmula vigente da amostra selecionada mais recente que fecha 100 %. (b) base vigente do projeto só aparece se existir. (c) amostra aprovada do mesmo projeto: fora (ver §11). |
| D-05 | Pré-mistura desligada por padrão, só por fase **com nome**; ingrediente sem fase é sempre pesado por amostra. Comum = presente em todas as amostras ativas com o mesmo % (4 casas). Excesso `perda_pct` (padrão = `indice_perdas` da matriz). Mínimo pesável padrão 0,05 g, com aviso e sugestão de pré-diluição a 10 %. |
| D-06 | Quantidade alvo em **gramas** por amostra (padrão: `quantidade_por_variacao` da amostra se a unidade é g). ml/un só com densidade (g/mL). Sem gramas a ordem não é gerada. 0,01 g por linha; pesagem comum = soma dos arredondados. |
| D-07 | Ações em lote (Em Testes, pedir liberação à diretoria) chamam a rota real `PUT /pd/requests/{id}/status` / `POST …/liberacao-antecipada`, **uma amostra por vez**; falhas listadas com motivo. Estabilidade: um estudo por amostra, mesma data de início, num único `update()`. |
| D-08 | Antes da ordem: tirar/cancelar livre. Depois: motivo ≥ 10 caracteres; nada é apagado; amostra mantém a versão do lote. Lote `manipulado` não cancela. |
| D-09 | (a) painel na Overview. (b) kanban: fora (conflito com o Codex em `PDPage.js`). |
| D-10 | Cria/edita/registra: ADM e P&D (`role`/`funcoes` `pd`, `lider_pd`, `formulador`, `engenharia_produto`, ou `modulos.pd`). PCP e comercial só leem — mais restrito que o `$collection` atual, de propósito. |
| D-11 | Pesagem por linha: teórico, real, lote da MP (ou `nao_informado`, marcado na ordem), quem pesou. Conferência por segundo usuário ligada por padrão (`config/pdLote/conferenciaSegundoUsuario`, só o ADM grava `false`). |
| D-12 | Lote em `erp/{tenant}/pd_manipulacao_lotes/{loteId}`, coleção nomeada com regra própria; o `$collection` passa a excluí-la explicitamente. Ordem, pesagens, manipulação e aprovações críticas: só o servidor (callable `manipulacaoLoteServidor`). |
| D-13 | Base `hostinger-deploy`. Sem push, sem regra publicada, sem deploy. |

## 3. Modelo de dados

`erp/{tenant}/pd_manipulacao_lotes/{loteId}` (id gerado pelo adaptador):

```
id, tenant_id, codigo "LM-2026-031-1", projeto_id, projeto_numero, projeto_nome,
status: "rascunho" | "ordem_gerada" | "manipulado" | "cancelado",
revisao (int, +1 a cada gravação — regra do banco), criado_em/por/por_nome, atualizado_em/por,
matriz: { tipo: "amostra" | "base_projeto", ref_id, request_id?, versao, codigo? },
membros: { "{reqId}": { request_id, development_id, sample_id, variacao_id, variacao_idx, codigo_amostra,
           quantidade_g, unidade_pedido, quantidade_pedido, densidade?, formula_id_antes, versao_antes,
           formula_id_lote, versao_lote, assinatura_lote, fora_da_base, diferencas[],
           status_membro: "ativo" | "removido", removido_motivo?, removido_por?, removido_em? } },
ingredientes: { "{ingKey}": { nome, codigo, catalog_id, master_material_id, inci, fase, funcao,
                ehFragrancia, critico, price_per_kg, price_usd?, price_currency?, unit, mp_nova? } },
celulas:  { "{reqId}": { "{ingKey}": percentual } },          // a matriz (ausente = 0)
motivos:  { "{reqId}": { "{ingKey}": { texto, nivel, por, por_nome, em, valor } } },
pre_mistura: { "{fase}": true }, perda_pct, minimo_pesavel_g,
eventos:  { "{pushId}": { tipo, por, por_nome, em, detalhe } },   // só inclusão (regra)
cancelamento?: { motivo, por, por_nome, em },
— só servidor —
aprovacoes_criticas: { "{reqId}": { "{ingKey}": { valor, por, por_nome, em } } },
ordem:      { gerada_em, gerada_por, gerada_por_nome, revisao, assinaturas{reqId: hash}, versoes{reqId: {formula_id, versao}},
              fases[], pre_misturas{fase: {linhas[], porcoes{reqId: g}, total_base_g, total_pesado_g, excesso_pct}},
              adicoes{reqId: linhas[]}, linhas_pesagem{linhaId: {tipo, fase, ingKey, reqId?, nome, teorico_g}},
              avisos[], total_teorico_g, conferencia_segundo_usuario },
pesagens:   { "{linhaId}": { teorico_g, real_g, lote_mp, lote_mp_informado, pesou, pesou_nome, em,
              conferiu?, conferiu_nome?, conferido_em? } },
manipulacao: { em, por, por_nome, observacao, entregue{reqId: g}, retencao{reqId: {g, local, prazo}},
               descarte{g, motivo}, perda_declarada_g, conciliacao{pesado_g, destinos_g, residuo_g, tolerancia_g, ok} }
```

Chave do ingrediente (`ingKey`) é gerada (`i01`, `i02`…), segura para o RTDB; o par material+fase é único (o mesmo
material em duas fases são duas linhas). Versão do lote: `pd_formulas/{fid}` com `origem_lote {lote_id, codigo,
matriz{tipo, ref_id, versao}, criado_em}`, `parent_formula_id = formula_id_antes`, `status DRAFT`; itens com id
`{fid}_{ingKey}` (determinístico → re-salvar substitui, não duplica). Campos novos fora do lote: `materiais/{key}/criticoPd`
(true ou ausente), `crm_samples/{s}/variacoes/{idx}/lote_manipulacao {lote_id, codigo, diferencas[], fora_da_base}`,
`pd_stability_studies/{id}/lote_manipulacao_id|lote_codigo`, `pd_requests/{r}/cancelado_motivo` (LM-05).

## 4. Motor puro — `crm-frontend/src/lib/manipulacaoLote.js`

Sem banco; datas e ids entram por parâmetro. Funções:

- `elegibilidade({ amostras, requests, developments, formulas, lotes, requestAtual })` → por variação `{ elegivel, motivo }` (D-01).
- `matrizPadrao(candidatas)` → D-04 (mais recente que fecha 100 %).
- `montarMatriz({ matriz: {itens}, membros: {reqId: itensAtuais|null} })` → `{ ingredientes, celulas }` (amostra sem fórmula recebe a matriz; com fórmula, a dela).
- `clonar(estado, { de, para[], ingKey? })` → matriz/coluna inteira ou um ingrediente.
- `diferencas(estado, colunaMatriz)` → por membro, células ≠ matriz com nível 1/2/3 (`nivelDaMudanca`).
- `pendenciasDeMotivo(estado, matrizCol, motivos, aprovacoes)` → motivo ausente/curto; crítico sem aprovação válida (valor aprovado ≠ atual invalida).
- `fechamentoPorMembro(estado)` → `fechamentoFormula` por coluna.
- `quantidadeEmGramas(membro)` → D-06.
- `ordemDoLote(estado, { preMistura, perdaPct, minimoPesavelG })` → pré-misturas, adições, linhas de pesagem, avisos, `reconciliacao` (D-05/D-06).
- `assinaturaItens(itens)` → hash estável (nome|fase|% com 4 casas, ordenado).
- `conciliacaoMassa({ pesado, entregue, retencao, descarte, perdaDeclarada, n })` → tolerância max(0,05 g × n; 0,5 %).
- `oQueVaria(membrosAprovados)` → nomes de ingredientes que diferem entre aprovadas (Kickoff).
- `planoSalvarLote(...)` → caminhos planos do `update()` (§6).

Cópia CJS mínima em `functions/manipulacao_lote.js` (`ordemDoLote`, `assinaturaItens`, `conciliacaoMassa`,
`pendenciasDeMotivo`, `fechamento`) para o servidor; contrato Vitest compara as duas em casos de 2, 5 e 20 amostras.

## 5. Rotas (adaptador `firebaseApi.js`)

| Rota | O quê | Leituras |
|---|---|---|
| `GET /pd/projetos/{proj}/amostras-elegiveis` | painel: variações do projeto, elegibilidade, motivo, lotes do projeto, matriz padrão | 6 coleções |
| `POST /pd/manipulacao-lotes` | cria rascunho (`codigo` por `nextSequence`), matriz inicial; `revisao 1` | 8 + sequência |
| `GET /pd/manipulacao-lotes/{id}` | lote + estado atual dos membros | 4 |
| `PUT /pd/manipulacao-lotes/{id}` | salvar (§6) com `revisao` esperada | 9 + fila |
| `POST …/{id}/gerar-ordem` · `…/pesagens` · `…/conferir` · `…/registrar-manipulacao` · `…/aprovar-critico` | delegam a `manipulacaoLoteServidor` | servidor |
| `POST …/{id}/acoes` `{acao: em_testes | liberacao | estabilidade}` | D-07 | por membro (rota real) |
| `POST …/{id}/membros/{req}/remover` · `POST …/{id}/cancelar` | D-08 (status/motivo, revisao+1) | 1 |
| `POST …/{id}/base-projeto` | LM-12: próxima versão de `pd_formulacoes_base` com os não-fragrância da coluna | 2 + sequência |
| `PUT /pd/manipulacao-lotes-config` | ADM liga/desliga a conferência (D-11) | 1 |

Respostas de erro no padrão `apiError`: 409 lote mudou/versão editada fora, 422 regra de negócio (100 %, motivo,
quantidade), 403 papel.

## 6. Salvar o lote (um `update()`)

1. Carga única: lote, `pd_requests`, `pd_developments`, `pd_formulas`, `pd_formula_items`, `pd_formula_phases`,
   `crm_samples`, `materiais` (marca crítico), `pd_formulacoes_base` (do projeto). Nenhuma leitura por membro.
2. Conferências: `revisao` esperada = gravada (senão 409); status `rascunho`; cada membro ativo ainda elegível;
   versão do lote não travada, ainda a vigente do desenvolvimento e com a mesma assinatura gravada no último
   salvamento (senão 409 "editada fora do lote" — concorrência com a aba Manipulação); `validarMpNova` e
   `exigirMpNovaInedita` só para MP nova que ainda não existia no lote; motivo nível 2/3 presente.
3. Números de versão: `runTransaction` em `erp/{t}/sequences/pd_formula_versao_{dev}` com
   `max(contador, maior versão lida) + 1` — reserva, nunca max+1 solto.
4. Plano puro (caminhos planos): fórmula nova (só no 1º salvamento do membro), fases copiadas, itens (set/null),
   `current_version`, `OPEN → IN_PROGRESS` + histórico, `lote_manipulacao` na variação (por índice lido), nó do lote
   (`ingredientes`, `celulas`, `motivos`, `pre_mistura`, `perda_pct`, `membros/{r}/…`, `revisao+1`, `atualizado_*`,
   `eventos/{id}`). A regra do banco recusa o `update` inteiro se a `revisao` não for a gravada + 1.
5. Depois do `update`: fila de MP nova (`planoDaFila`: registrar itens novos com MP nova, retirar itens que saíram
   da versão do lote; nunca retirar a versão anterior) num segundo `update` com aviso em falha — a regra de
   `solicitacoes_cadastro_material` é de outro domínio de acesso e não pode derrubar o salvamento (mesmo
   contrato de `sincronizarFilaMpNova`); `pdSyncRequestStatus` para quem passou a Em Desenvolvimento, **um por vez**;
   `registrarAuditoriaCrm` (callable) com o resumo. `audit_log` não pode ir no mesmo `update`: desde 03/11 o
   cliente não grava `audit_log` (`$collection != 'audit_log'`) — o histórico do próprio lote (`eventos`, só
   inclusão) vai no mesmo `update`.
6. Repetir com o mesmo conteúdo (duplo clique, reenvio): assinatura do rascunho igual à gravada → devolve
   `{ sem_mudanca: true }` sem gravar nada (nem versão, nem `revisao`). Duplo clique com conteúdo novo: o segundo
   chega com a `revisao` antiga → 409 (adaptador) e, numa corrida real, a regra recusa o `update`.

## 7. Servidor — callable `manipulacaoLoteServidor({ tenant?, loteId, acao, … })`

Uma callable (contagem 27 → 28 em `run_render_functions_test.js`), módulo `functions/manipulacao_lote.js`:
perfil ativo + tenant + papel D-10 conferidos no servidor; erros de negócio → `HttpsError` com a mensagem.

- `gerar_ordem {revisao}`: lote `rascunho`, `revisao` igual; reclama a revisão por transação
  (`revisao → revisao+1`; outra gravação no meio dá `aborted`/409); lê as versões do lote e os itens do banco;
  100 % por membro (mesmo `fechamento-formula.js` do `liberarEtapaPd`); motivos e aprovações críticas válidos;
  gramas por membro; calcula a ordem com o motor; grava num `update()` a ordem, `status ordem_gerada`,
  `locked/locked_at/locked_by/locked_motivo: "ordem_lote"` em cada versão e evento.
- `registrar_pesagens {linhas: {linhaId: {real_g, lote_mp}}}`: só linhas da ordem, só uma vez (gravação única).
- `conferir_pesagem {linhas[]}`: conferente ≠ quem pesou; só uma vez.
- `registrar_manipulacao {em, observacao, entregue, retencao, descarte, perda_declarada_g}`: todas as linhas
  pesadas (e conferidas se ligado); assinatura de cada versão recomputada = gravada (senão "versão mudou depois da
  ordem"); conciliação de massa dentro da tolerância; `status manipulado`.
- `aprovar_critico {requestId, ingKey}`: ADM ou RT (e-mail de responsável técnico ativo, vínculo Kuryos);
  aprovador ≠ autor do motivo; grava `{valor}` atual — mudar a célula invalida a aprovação.

## 8. Regras do banco

- `erp/$tenant/$collection/.write` ganha `&& $collection != 'pd_manipulacao_lotes'` (defesa explícita).
- `erp/$tenant/pd_manipulacao_lotes/$lote`: `.write` = perfil ativo + sessão + (ADM ou tenant) + papel D-10 +
  `newData.exists()` (cancelar é status, nunca exclusão). `.validate`: `id == $lote`, `revisao` = gravada + 1
  (ou 1 na criação), `projeto_id`/`codigo` imutáveis, `ordem/pesagens/manipulacao/aprovacoes_criticas` não somem;
  `status`: igual, criação em `rascunho`, ou `cancelado` com `cancelamento/motivo` (≥ 5; ≥ 10 depois da ordem) e
  nunca a partir de `manipulado`; `ingredientes/celulas/motivos/pre_mistura/perda_pct/minimo_pesavel_g/matriz` só
  com status gravado `rascunho`; `membros/$req`: livre em rascunho; depois só `status_membro: removido` com motivo
  ≥ 10; `eventos/$ev`: só inclusão, `por == auth.uid`; `ordem/pesagens/manipulacao/aprovacoes_criticas`:
  `.validate false` (só o Admin SDK).
- `materiais/$material/.validate`: `criticoPd` só muda pelo ADM (comparação de primitivo, cobre remoção).
- `config/pdLote/conferenciaSegundoUsuario`: booleano; só o ADM muda (remoção volta ao padrão seguro, ligado).

Testes no emulador (`firebase.pdlote-test.json`, porta 9063, `--project demo-pd-lote`): P&D cria/salva; mesma
revisão duas vezes → a segunda negada; `production`, `comercial` e `pcp` do mesmo tenant negados; outro tenant
negado; exclusão negada; cliente gravando `ordem`/`pesagens`/`manipulacao`/aprovação negado; célula depois da
ordem negada; remover membro sem motivo depois da ordem negado; `criticoPd` por PCP negado; evento reescrito negado.
Mais um teste integrado do adaptador real contra o emulador (padrão `firebaseApi.kanban-emulator.test.js`).

## 9. Exclusão (LM-05)

- `pdDeleteRequestCascade`: solicitação membro de lote com versão criada (`formula_id_lote`) ou lote
  `ordem_gerada/manipulado` **não é apagada**: vira `CANCELLED` com `cancelado_motivo`, histórico, e o membro é
  marcado `removido` (motivo) nos lotes abertos. Sem histórico de lote: cascata física de hoje (membro de rascunho
  sem versão marcado `removido`).
- `deleteSampleCascade`: o `.catch(() => null)` sai; falha da cascata vira erro 409/500 visível e a amostra não é apagada.
- `deleteCard` (projeto/cliente): antes de apagar, os lotes do projeto `rascunho/ordem_gerada` viram `cancelado`
  (motivo "projeto excluído"); `manipulado` ganha evento. Nada do lote é apagado.

## 10. Tela

- `PDDetail.js` só ganha o painel na Overview e o import (mudança mínima).
- `components/ManipulacaoLote/PainelAmostrasProjeto.js`: lista com checkbox, motivo de inelegibilidade, lotes do
  projeto, botão **Manipular em lote** (≥ 2).
- `components/ManipulacaoLote/EditorLote.js` (diálogo em tela cheia): matriz com coluna de ingrediente fixa,
  fragrância destacada, célula diferente da matriz marcada (nível 2 âmbar, 3 vermelho), rodapé 100 % por coluna
  (verde/vermelho com quanto falta), Clonar matriz para todas, Clonar coluna → coluna, Aplicar ingrediente a todas,
  Adicionar ingrediente (MPES/MPGR do `/pd/catalog`), motivo inline, quantidade (g/densidade), pré-mistura por fase,
  excesso; em < 640 px uma amostra por vez com seletor.
- `components/ManipulacaoLote/OrdemLote.js`: ordem (imprimir HTML de `lib/ordemLoteHtml.js`), pesagens, conferência,
  Registrar manipulação, ações em lote com relatório, Tornar a matriz a nova base.

## 11. Fora desta entrega (vai para `MELHORIAS_FUTURAS.md`)

LM-09 kanban com seleção (conflito com o Codex em `PDPage.js`); matriz (c) de amostra aprovada; MP nova criada
dentro do editor do lote (cria-se na aba Manipulação de uma amostra e clona-se); estoque do laboratório; rótulo da
amostra e laudo/INCI da amostra "fora da base" (os dados — código LM, versão, `fora_da_base` — ficam gravados para
as telas existentes lerem); fechar a escrita de `erp/$tenant` (risco residual, decisão do Marlos); transição em
lote no servidor (hoje: rota real, um por vez).
