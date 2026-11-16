# PROMPT — Registro retrospectivo do envase trocado: lote 26302/01 → Rose Absolut + Sunrise Muse

> Para o agente que vai implementar (Claude ou Codex) neste repositório, branch `hostinger-deploy`.
> Antes de começar, leia `AGENT_STATUS.md` e `AGENTS.md`, rode `git status --short` e registre o seu escopo.
> Leia também `AUDITORIA_CONSISTENCIA_PA_20261113.md`, `PLANO_GESTAO_RETRABALHOS.md` e o item
> "Retrabalho com troca de SKU" no topo de `MELHORIAS_FUTURAS.md`. Não refaça o diagnóstico: ele já está lá.

---

## 1. O que aconteceu (fatos já apurados)

- **OP 26302/01** foi emitida em 29/10 para **690 un. de Body Splash Rose Absolut** (PRF-BIOF-0006, pedido
  PED-0001, cliente Bioflora). O granel do **Sunrise** foi envasado nela. A OP fechou com **3.470 un.**
  apontadas e foi confirmada em 04/11 com `confirmadoComDivergencia`, sem RNC. A regra RNC-SP só vale a
  partir de 13/11, então não houve RNC automática.
- O retrabalho físico separou o lote em dois:
  - **Rose Absolut, lote 26302/01: 1.460 un. finais**;
  - **Body Splash Sunrise Muse, lote 26264/14: 1.965 un. finais** (OP confirmada em 12/11, conferida em
    13/11 com 1.965 contadas, RNC-PA-26264-14 de +3 sobre as 1.962 apontadas).
- No sistema, a 26302/01 continua com 3.470 Rose. O palete **GAL-1-3-1** está com 3.470 un. e status
  `LIBERADO_EXPEDICAO`, criado em 13/11 às 16:37 com uma contagem só.
- O mesmo líquido foi apontado duas vezes, e frasco e rótulo foram baixados duas vezes (BOM da 26302/01 e
  BOM da 26264/14).
- **O pedido já seguiu e o produto está para ser despachado.** Essa é a razão da restrição da seção 3.

## 2. Objetivo

Registrar no sistema, de forma rastreável (Anvisa), **cada etapa do que aconteceu**:

1. **RNC** do envase trocado;
2. **retrabalho**: segregação e desenvase/reclassificação das 3.470 un.;
3. **envase de retrabalho**: o Sunrise Muse da 26264/14 e o Rose que permaneceu na 26302/01.

As etapas abrem no setor **Qualidade**, e a **Roberta Ramos** preenche. As quantidades de entrada e saída
de cada etapa precisam **fechar**. O registro é documental: **não muda o estado de nada que já andou**.

## 3. Restrição dura: não alterar o estado

O registro deste caso **não pode escrever, nem disparar escrita, nos nós abaixo**:

| Nó / efeito | Por quê |
|---|---|
| `ops/26302-01` e `ops/26264-14` (status, `produzido*`, confirmação, `materiaisConsumo`) | as OPs estão concluídas e conferidas |
| `pedidos` e `pedidos_comerciais` do PED-0001 (produzido/expedido por item) | o pedido já seguiu |
| `conferencias_pa`, paletes, `estoque_lotes`, `enderecos_estoque`, `estoque/{m}` | a expedição está em curso; o saldo ainda não é confiável (Dia D) |
| cargas e expedição (`confirmarExpedicaoPA` e vizinhas) | idem |
| `estado_linhas`, `retrabalhos_linhas`, `paradas_historico`, `programacao`, `alocacoes_planejamento` | o retrabalho já aconteceu; não pode ocupar linha nem aparecer na fila |
| RNCs existentes (RNC-PA-26264-14 e qualquer outra do lote) | vincular, nunca reescrever |

Consequências práticas:

- **Não crie OP em `ops/`**: nem `26302/01-RT1` via `shared/retrabalho-op.js`, nem outra. Uma OP
  `RETRABALHO` entra na Conferência de PA (`qtdApontadaPA` em `estoque.html`), no Controle de OPs, na
  conciliação (`conciliacao-pedidos.js:166`) e na sequência das linhas.
- **Não use a callable `apontarRetrabalho`** (`functions/retrabalhos.js`): ela ocupa linha e grava
  `paradas_historico`.
- **Não corrija o apontamento da 26302/01** no Histórico de Apontamentos, nem o palete no WMS, dentro desta
  tarefa. Veja a seção 8.
- O registro novo não pode mudar o resultado do motor de consistência (`shared/consistencia-producao.js`),
  do alerta vermelho nem da conciliação do pedido. O teste da seção 7 prova isso.

## 4. Balanço de quantidades (tem que bater)

| Etapa | Entrada | Saída | Lote |
|---|---|---|---|
| Envase original (errado) | granel Sunrise | 3.470 un. rotuladas como Rose | 26302/01 |
| Retrabalho: segregação e desenvase/reclassificação | 3.470 un. | 1.460 Rose permanecem + 1.965 vão para Sunrise Muse + **45 a justificar** | 26302/01 → 26302/01 e 26264/14 |
| Envase de retrabalho: Sunrise Muse | volume da parte reclassificada | 1.965 un. (conferidas) | 26264/14 |
| Resultado final | — | 1.460 Rose + 1.965 Sunrise Muse | — |

**3.470 − 1.460 − 1.965 = 45 un.** sem destino declarado. O sistema **não pode fechar o caso** sem que a
Qualidade classifique essas 45 un.: perda no desenvase, descarte, amostra de retenção, quebra ou erro de
contagem, com quantidade por destino. Não invente o destino. A tela mostra a diferença e bloqueia o
encerramento até a soma fechar em zero.

Validação adicional, só como aviso (não bloqueia):
- a quantidade de Sunrise Muse deve bater com a última contagem da Conferência de PA da 26264/14 (1.965);
- a de Rose deve bater com uma contagem física do GAL-1-3-1, quando existir.

Também é preciso registrar, por etapa, os **materiais** envolvidos: frascos e rótulos Rose consumidos,
recuperados, descartados; rótulos/frascos Sunrise Muse usados no reenvase. Os campos são de quantidade
informada, sem lançamento em estoque (ver 8.3).

**Não presuma o fluxo físico.** O que se sabe é o resultado (1.460 + 1.965). Se houve desenvase,
reenvase em frasco novo, só troca de rótulo, ou qual granel encheu as 1.460 Rose, quem diz é a Roberta,
pelo procedimento que a Qualidade aplicou. Os campos têm que aceitar cada uma dessas possibilidades.

## 5. Modelo a construir

Siga o modelo de **caso × etapas** de `PLANO_GESTAO_RETRABALHOS.md` (itens 1, 2, 3 e 6), sem as partes de
execução em linha.

### 5.1 RNC

- Antes de abrir, procure na base RNC com `opLote` 26302/01 ou 26264/14. Se já existir RNC do envase
  trocado, vincule essa. Não crie duplicata.
- Se não existir, abra pela função existente `abrirRnc` (`public/shared/utils.js`), sem mudar o formato:
  `origem: 'PRODUCAO'`, `opLote: '26302/01'`, `itemCodigo` do SKU Rose, `qtdEnvolvida: 3470`, `cliente`,
  `pedidoNumero: 'PED-0001'`. A classificação fica com a Roberta; sugira `MAIOR` (produto errado na
  embalagem pode chegar ao consumidor).
- Marque a RNC como retrospectiva: `retrospectiva: true`, `registradaEm` (agora) e
  `ocorridaEm` (data do envase, 04/11 ou a que a Qualidade informar).
- A disposição ao encerrar é `RETRABALHO`. Confira no código que encerrar com `RETRABALHO` **não** dispara
  nada sobre lote ou palete. Se disparar, desligue esse efeito para `retrospectiva: true`.
- Vincule a RNC-PA-26264-14 como RNC relacionada, sem reescrevê-la.

### 5.2 Caso de retrabalho retrospectivo

Nó novo e separado (sugestão: `registros_retrabalho/{id}`, id `RT-26302-01-20261104` ou similar). **Não
use `retrabalhos/`**: esse nó é lido pela tela de execução e pela ocupação de linha.

Conteúdo mínimo:

- `rncNumero`, `rncsRelacionadas` (RNC-PA-26264-14), `pedidoNumero`, `cliente`;
- `loteOrigem: '26302/01'`, `skuOrigem` (Rose), `qtdOrigem: 3470`;
- `destinos`: `[{lote: '26302/01', sku: Rose, qtd: 1460}, {lote: '26264/14', sku: Sunrise Muse, qtd: 1965}]`;
- `perdas`: lista `{motivo, qtd, observacao}` (as 45 un.);
- `etapas/{n}`: cada uma com `tipo` (`IDENTIFICACAO_RNC`, `RETRABALHO`, `ENVASE_RETRABALHO`), `recurso`
  (linha/posto/estação, texto), `inicio`, `fim`, `responsaveis`, `procedimento` (texto ou referência da
  instrução), `qtdEntrada`, `qtdSaida`, `qtdPerda`, `materiais` (`{codigo, consumido, recuperado,
  descartado}`), `evidencias` (fotos via `FotosQualidade`, igual às RNCs), `observacao`, `preenchidoPor`,
  `preenchidoEm`;
- `status`: `EM_PREENCHIMENTO` → `AGUARDANDO_DECISAO` → `ENCERRADO`;
- `decisao` (Qualidade): responsável, data, análise e destino final de cada lote;
- `retrospectivo: true`, `semEfeitoOperacional: true`, `historico` (append-only: toda alteração grava
  quem, quando, antes e depois).

Regra de fechamento: `qtdOrigem = Σ destinos.qtd + Σ perdas.qtd`, e cada etapa tem
`qtdEntrada = qtdSaida + qtdPerda`. Sem isso, não sai de `EM_PREENCHIMENTO`.

### 5.3 Quem grava e como

- Toda escrita passa por **callable no servidor** (padrão do repo: `manipulacaoLoteServidor`,
  `amostraMp`). Regra do nó: `.write: false` para o cliente, leitura para quem lê RNC.
- Permissão: ADM e Qualidade gravam e decidem; PCP e Logística só leem. Reconheça a Qualidade por
  `role`, `funcoes.qualidade` **e** `modulos.qualidade`, porque o `PODE_DECIDIR` de `retrabalhos.js` só olha
  `role`, e esse foi o defeito do caso Yasmin (multi-função).
- **Não use transação na raiz.** O banco passa de 16 MB. Use `functions/transacao_raiz.js` ou uma
  transação só no nó do caso, com caminhos planos. Lembre de `if (!atual) return atual;`
  (`run_transacoes_null_test.js`).
- Idempotência por `requestId`, como nas outras callables.

### 5.4 Tela

- Uma seção em `qualidade.html`, "Registros de retrabalho", junto da aba de RNC; ou um card dentro da RNC
  com o link para o caso. Antes de editar `qualidade.html`, confira se outro agente o marcou como ativo.
- A Roberta vê as 3 etapas em ordem, preenche cada uma e vê o **balanço ao vivo**: origem, destinos,
  perdas e diferença (vermelha enquanto ≠ 0).
- Mostre claramente que é um registro **retrospectivo, sem efeito em estoque, OP ou expedição**, para
  ninguém achar que o botão "encerrar" libera ou bloqueia palete.
- O relatório da RNC (o que imprime para a Anvisa/cliente) inclui o caso: etapas, quantidades, materiais,
  evidências e decisão.
- Se a tela for nova, ela entra em `public/shared/navegacao.js` no mesmo commit e `run_navegacao_test.js`
  continua passando. Atenção: `navegacao.js` está reservado pela sessão `chamados-print` do Codex.

## 6. Passo 0: ler a base antes de codar (só leitura)

Leia em produção (`erpkuryos`) e anote no documento de auditoria:

1. `ops` das OPs 26302/01 e 26264/14: `sku`, `qtdPlanejada`, `produzido*`, `materiaisConsumo`, datas,
   confirmação;
2. Conferência de PA das duas OPs (contagens, paletes, status) e o palete GAL-1-3-1;
3. RNCs com `opLote` em qualquer das duas OPs;
4. o item do PED-0001 para Rose e Sunrise (produzido, expedido);
5. o perfil da Roberta: `role`, `funcoes`, `modulos`, `tenant_id`. Sem `qualidade`, ela recebe
   PERMISSION_DENIED; o lembrete de 23/10 sobre o tenant dela continua aberto. Não altere o perfil:
   informe o Marlos.

Se algum número divergir do que está na seção 1, **pare e reporte** antes de construir.

## 7. Testes e aceite

- Motor puro do balanço (`shared/registro-retrabalho.js`, cópia em `functions/` se o servidor usar): fecha
  e não fecha; 45 un. sem destino bloqueiam; etapa com entrada ≠ saída + perda bloqueia; perda negativa
  recusada.
- **Teste de não interferência** com os dados reais do caso: calcule, antes e depois de gravar o caso, a
  conciliação do PED-0001, o resultado de `consistencia-producao.js`, a fila da Conferência de PA, as
  OPs abertas por linha e o saldo/paletes dos dois lotes. O resultado tem que ser **idêntico**. É o teste
  que prova a seção 3.
- Regras no emulador (`--project demo-<nome>` igual ao `projectId` do teste): cliente não grava o nó;
  Qualidade por `funcoes` consegue pela callable; Logística não decide.
- UI no Chrome com a tela real (`run_*_ui_test.js`): Roberta preenche as 3 etapas, vê a diferença de 45,
  declara as perdas, encerra.
- Ensaio com a base real antes de fechar (lição do MRP).

## 8. Fora do escopo: decisões que ficam com o Marlos (registrar, não executar)

1. **GAL-1-3-1 com 3.470 Rose e `LIBERADO_EXPEDICAO`.** O físico final de Rose é 1.460. Se a carga sair
   pelo sistema como está, a NF/romaneio pode levar 3.470. O registro não corrige isso. **Destaque no
   relatório final e na resposta ao Marlos** que a correção do apontamento da 26302/01 e do palete (fluxo
   da seção 6 da auditoria de 13/11) precisa de decisão explícita dele **antes do despacho**.
2. O crédito em dobro no PED-0001 (3.470 Rose + 1.965 Sunrise do mesmo líquido) sai junto com a correção
   do item 1.
3. Estorno de frasco e rótulo baixados em dobro. Fica registrado no caso como quantidade, sem lançamento,
   até o Dia D.
4. A ferramenta genérica de "retrabalho com troca de SKU" (transferir unidades entre OPs/SKUs) continua em
   `MELHORIAS_FUTURAS.md`. Este registro é o primeiro caso dela; cite-o lá.

## 9. Entrega

- Commit só dos seus arquivos (nunca `git add -A`), mensagem descritiva, registro em `AGENT_STATUS.md`.
- Regras publicadas antes da VPS (`--only database --project erpkuryos`), conferidas por releitura.
- Deploy da VPS por `scripts/hostinger/deploy.sh` (push sozinho não atualiza).
- Documento `AUDITORIA_RETRABALHO_26302_01_<data>.md` com a leitura do passo 0, o balanço e o resultado
  do teste de não interferência.
- Atualize `CLAUDE.md` (linha da tabela de módulos ou armadilhas, se houver lição nova) e
  `MELHORIAS_FUTURAS.md`.
- No `manuais.html` da Qualidade, um passo curto: "registrar retrabalho já executado".
