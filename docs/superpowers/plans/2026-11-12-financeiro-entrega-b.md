# Financeiro Entrega B — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adiantamento a fornecedor e de cliente (com compensação), renegociação e cancelamento em lote no Financeiro, refletidos nos bancos, nos relatórios e no razão da Controladoria.

**Architecture:** Registros novos em `fin/` gravados só pelo servidor (callables na `filaFinanceiro`); títulos mexidos só por abatimento (desfazer = abatimento negativo) ou baixa (compensação, `conta: null`). Motor puro valida e monta; a Controladoria deriva os lançamentos dos registros e estorna sozinha o que deixa de valer.

**Tech Stack:** JS UMD (motor em `public/shared/`, cópia byte a byte em `functions/`), Firebase RTDB, Cloud Functions callables, Playwright/Chrome para a tela, emulador para regras.

**Spec:** `docs/superpowers/specs/2026-11-12-financeiro-entrega-b-design.md`

## Global Constraints

- Centavos inteiros em todo valor; nunca float acumulado.
- Título e baixa nunca se editam nem se apagam; desfazer = abatimento negativo + status no registro.
- Update sempre por caminhos planos (CLAUDE.md).
- `public/shared/financeiro.js` ≡ `functions/financeiro.js` e `public/shared/controladoria.js` ≡ `functions/controladoria.js` (byte a byte; testes conferem).
- Chave da tela `^[A-Za-z0-9_-]{6,80}$`; ids: `AD_{chave}`, `CP_{chave}`, `RN_{chave}` (+ título `RNG_{chave}`, abatimentos `RN_{chave}_{tid}`), `CN_{chave}` (+ abatimentos `CN_{chave}_{tid}`); estornos/desfazer com sufixo `_estorno` / `_desf_{tid}`.
- Mês fechado na Controladoria recusa toda operação com data nele.
- Contas novas: `ADIANT_FORNECEDORES` 1.1.4 ATIVO, `ADIANT_CLIENTES` 2.1.6 PASSIVO, `PERDAS_CLIENTES` 5.1.4 DESPESA grupoDre `DESPESAS_COMERCIAIS`.
- Natureza de fluxo/DFC do adiantamento: `ADIANTAMENTOS`, atividade padrão OPERACIONAL.
- Justificativa do cancelamento ≥ 10 caracteres; motivo de renegociação/desfazer/estorno ≥ 5.

## Review Focus

- Renegociar título parcialmente pago: o novo nasce do **saldo**, não do valor original; original fica RENEGOCIADO (teste na Task 2).
- Compensar mais que o saldo do adiantamento ou do título, ou entre parceiros com o mesmo nome e CNPJ diferente: recusado (Task 1).
- Desfazer duas vezes, ou desfazer renegociação com o título novo já pago: recusado sem gravar (Task 2/3).
- Estornar a compensação libera o saldo do adiantamento de novo (Task 1).
- Título em lote AGUARDANDO não é renegociado/cancelado; aprovar um lote cujo título foi cancelado depois falha com mensagem clara (Task 2).

---

### Task 1: Motor — adiantamento e compensação

**Files:**
- Modify: `public/shared/financeiro.js` (copiar para `functions/financeiro.js`)
- Test: `run_financeiro_entrega_b_test.js` (novo)

**Interfaces:**
- Produces:
  - `saldosAdiantamentos(fin) -> {[adId]: {id, tipo, parceiro, conta, data, valorCentavos, compensadoCentavos, saldoCentavos, estornado}}` (só registros `tipoRegistro: 'ADIANTAMENTO'`).
  - `chaveParceiro(parceiro) -> string` ('D'+CNPJ dígitos ≥ 11, senão 'N'+nome maiúsculo).
  - `validarAdiantamento(d, fin) -> {ok, motivo?, registro?}`; d: `{tipo, parceiro, cnpj?, parceiroKey?, conta, data, valorCentavos, documento?, historico?}`; registro com `tipoRegistro: 'ADIANTAMENTO'`.
  - `validarEstornoAdiantamento(fin, id) -> {ok, motivo?, registro?}` (registro = cópia com `tipoRegistro: 'ESTORNO', estorna: id`).
  - `validarCompensacao(sit, adiant, d) -> {ok, motivo?, registro?}`; registro de baixa `{tipo:'BAIXA', forma:'ADIANTAMENTO', adiantamento, titulo, tituloTipo, data, valorCentavos, jurosCentavos:0, multaCentavos:0, descontoCentavos:0, variacaoCambialCentavos:0, liquidoCentavos, conta:null, natureza, origemTitulo}`.
  - `efeitosAdiantamento(a) -> {[conta]: centavos}` (PAGAR −, RECEBER +, ESTORNO inverte).
  - Bancos: `saldosBancarios`, `extratoConta` (linha tipo `ADIANTAMENTO`/`ESTORNO_ADIANTAMENTO`, histórico "Adiantamento a/de {parceiro}"), `fluxosRealizados` (natureza `ADIANTAMENTOS`, lado do original), `caixaNegativo` (aceita registro de adiantamento) incluem `fin/adiantamentos`.
  - `ATIVIDADE_PADRAO.ADIANTAMENTOS = 'OPERACIONAL'`.

- [ ] **Step 1: Teste falhando** — `run_financeiro_entrega_b_test.js` com fixture (conta itau 1000,00; título P1 a pagar 300,00 a "Química SA" CNPJ 01234567000190; R1 a receber 500,00 "Marca Bela"); asserções:
  - adiantamento PAGAR 200,00 → `saldosBancarios(fin).itau.saldoCentavos === 80000`; extrato tem linha "Adiantamento a Química SA" −20000; `dfc` do mês fecha (`diferencaCentavos === 0`) e tem linha `ADIANTAMENTOS`.
  - compensação 150,00 em P1 → P1 saldo 15000; `saldosAdiantamentos` saldo 5000; banco inalterado (80000).
  - compensação 60,00 (> saldo 50,00) recusada; parceiro com CNPJ diferente recusado; tipo diferente recusado; valor > saldo do título recusado; título bloqueado recusado.
  - estorno da compensação (registro `ESTORNO` da baixa via `validarEstorno`) → saldo do adiantamento volta a 20000.
  - `validarEstornoAdiantamento` recusa com compensação ativa; aceita sem; após estorno, banco volta a 100000.
  - adiantamento em conta CAIXA maior que o saldo → recusado por `caixaNegativo`.
  - base vazia: `saldosAdiantamentos({})` = `{}`.
- [ ] **Step 2:** `node run_financeiro_entrega_b_test.js` → falha (função inexistente).
- [ ] **Step 3:** Implementar no motor; `cp public/shared/financeiro.js functions/financeiro.js`.
- [ ] **Step 4:** teste passa; rodar `run_financeiro_test.js`, `run_financeiro_bancos_test.js`, `run_financeiro_dfc_test.js` (sem regressão).
- [ ] **Step 5:** commit `feat(financeiro): adiantamento e compensação no motor`.

### Task 2: Motor — renegociação, cancelamento e status

**Files:** `public/shared/financeiro.js` (+ cópia), `run_financeiro_entrega_b_test.js`

**Interfaces:**
- Produces:
  - `situacao` devolve status `RENEGOCIADO` / `CANCELADO` quando saldo ≤ 0 e o abatimento líquido de motivo `RENEGOCIACAO*` / `CANCELAMENTO*` é > 0; `ROT_SIT` ganha os dois.
  - `montarRenegociacao(fin, d, chave) -> {ok, motivo?, registro, titulo, abatimentos: {[id]: reg}}`; d: `{titulos: [ids], data, condicao?, vencimento?, acrescimoCentavos?, descontoCentavos?, motivo}`. Título novo `RNG_{chave}` (origem `{tipo:'RENEGOCIACAO', ref:'fin/renegociacoes/RN_{chave}', titulos}`), natureza do maior saldo, `porNatureza` rateado pelos saldos (usa `porNatureza` do original quando houver), `centroCusto` do maior saldo, `baseVencimento: data`, `documento: 'Reneg. ' + docs`.
  - `montarDesfazerRenegociacao(fin, rnId, d) -> {ok, motivo?, abatimentos, status}`.
  - `montarCancelamento(fin, d, chave) -> {ok, motivo?, registro, abatimentos}`; d: `{titulos, data, motivo: 'ENGANO'|'INCOBRAVEL', justificativa}`.
  - `montarDesfazerCancelamento(fin, cnId, d) -> {ok, motivo?, abatimentos, status}`.
  - `emLoteAguardando(fin) -> {[tituloId]: loteId}`.
  - `podeCancelar(sit, motivo) -> {ok, motivo?}` (usada também pela tela).

- [ ] **Step 1: Testes falhando**, mesmas fixtures + P2 (a pagar 100,00 Química, origem RECEBIMENTO), RNF (a receber 400,00 origem NF_SAIDA):
  - renegociar P1 (com baixa de 100,00) + P3 (manual 50,00, mesmo CNPJ), acréscimo 10,00, condição `30/60`, data D → título novo valor 26000 (200+50+10), 2 parcelas, P1 e P3 status `RENEGOCIADO`, saldo 0.
  - recusas: tipos diferentes; parceiro diferente; título sem saldo; título em lote AGUARDANDO; título repetido; sem condição e sem vencimento; desconto ≥ saldo.
  - desfazer: P1 saldo volta a 20000, P3 5000, RNG saldo 0 e status ABATIDO; desfazer de novo recusado; desfazer com baixa no RNG recusado.
  - cancelar R1 INCOBRAVEL → status CANCELADO; cancelar P2 (RECEBIMENTO) recusado; INCOBRAVEL em a pagar recusado; ENGANO em RNF (NF_SAIDA) recusado; justificativa curta recusada; desfazer → R1 saldo 50000.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** implementar; copiar para `functions/`.
- [ ] **Step 4:** passa; bateria do Financeiro sem regressão (status novos não mudam fixtures antigas).
- [ ] **Step 5:** commit `feat(financeiro): renegociação e cancelamento no motor`.

### Task 3: Servidor e callables

**Files:**
- Modify: `functions/financeiro_servidor.js`, `functions/index.js` (perto de `exports.finMovimentar`)
- Test: `run_financeiro_entrega_b_servidor_test.js` (novo)

**Interfaces:**
- Consumes: Task 1–2.
- Produces (`(base, dados, quem, agora) -> {updates, id?, repetido?}`, `falhar()` nas recusas): `prepararAdiantamento` (ação CRIAR), `prepararEstornoAdiantamento` (`{adiantamento, motivo, data}`), `prepararCompensacao` (`{chave, adiantamento, titulo, valorCentavos, data}`), `prepararRenegociacao` (`{chave, ...}`), `prepararDesfazerRenegociacao` (`{renegociacao, motivo}`), `prepararCancelamento`, `prepararDesfazerCancelamento`. Callables `finAdiantamento {acao: CRIAR|ESTORNAR}`, `finCompensarAdiantamento`, `finRenegociar {acao: CRIAR|DESFAZER}`, `finCancelarTitulos {acao: CRIAR|DESFAZER}` com `exigirFinanceiro` + `filaFinanceiro`.

- [ ] **Step 1: Teste falhando:** cada preparar gera só caminhos planos `fin/...`; chave repetida → `repetido: true` e updates vazios; mês fechado (ctl/fechamentos) recusa; chave inválida recusa; renegociação grava registro + título + abatimentos no mesmo update; `prepararDecisaoLote` com título cancelado depois falha "passa do saldo".
- [ ] **Step 2:** falha. **Step 3:** implementar + exportar + ligar callables. **Step 4:** passa; `run_gestao_servidor_test.js`, `run_financeiro_fila_test.js` sem regressão; `node -e "require('./functions/index.js')"` não é necessário (exige credencial) — conferir com `node --check functions/index.js`.
- [ ] **Step 5:** commit `feat(financeiro): callables de adiantamento, renegociação e cancelamento`.

### Task 4: Controladoria

**Files:** `public/shared/controladoria.js` (+ cópia `functions/`), `run_financeiro_entrega_b_controladoria_test.js` (novo)

**Interfaces:**
- Produces: contas novas no `PLANO_PADRAO`; `passivoDoTitulo(t, titulos?)` recursivo para origem RENEGOCIACAO; `partidasDaBaixa(x, t, titulos?)` trata `forma: 'ADIANTAMENTO'`; documentos `ADT_{id}` (adiantamento e estorno), `RNG_{rnId}` (só ATIVA), `CAN_{cnId}_{tid}` (só ATIVO) conforme a tabela do spec §5; partidas de mesma conta no mesmo documento se compensam; `reconciliacao` ganha linhas `ADIANT_FORNECEDORES` e `ADIANT_CLIENTES` (financeiro = Σ saldo de adiantamentos por tipo até o fim do mês).

- [ ] **Step 1: Teste falhando** (fixture com tudo da Task 2 + adiantamento + compensação): todo documento balanceado; aplicar `derivar` → balancete; reconciliação diferença 0 em FORNECEDORES, CLIENTES, BANCOS, ADIANT_*; marcar renegociação DESFEITA e cancelamento DESFEITO → `derivar` de novo estorna (`estornados ≥ 2`) e reconciliação continua 0; INCOBRAVEL aparece em DESPESAS_COMERCIAIS da DRE; ENGANO de título manual a receber zera a receita dele.
- [ ] **Step 2–4:** falha → implementar → passa; `run_controladoria_test.js` sem regressão.
- [ ] **Step 5:** commit `feat(controladoria): adiantamentos, renegociação e cancelamento no razão`.

### Task 5: Relatórios

**Files:** `public/shared/financeiro-relatorios.js`, `run_financeiro_relatorios_webmais_test.js`

**Interfaces:**
- Produces: `relAdiantamentos(fin, {tipo, parceiro}) ` (colunas data, documento, parceiro, conta, valor, compensado, saldo); `relEmAberto` coluna `adiantamento` (valor, semTotal — não entra na soma do aberto); `relGastosCentroCusto` opção `semAdiantamentos`; títulos com origem RENEGOCIACAO fora das bases por emissão (gastos, ranking, despesas); `relRealizadoPrevisto` ignora status RENEGOCIADO/CANCELADO.
- [ ] **Step 1:** asserções: gasto por emissão com renegociação = soma dos originais (sem o novo); por pagamento, a baixa do RNG conta; em aberto mostra adiantamento disponível 5000 para Química; relAdiantamentos total saldo = Σ saldosAdiantamentos; CSV fecha.
- [ ] **Step 2–4:** falha → implementar → passa (1.082 antigas continuam).
- [ ] **Step 5:** commit `feat(financeiro): relatórios com adiantamento e renegociação`.

### Task 6: Tela

**Files:** `public/shared/financeiro-tela.js`, `run_financeiro_entrega_b_ui_test.js` (novo, harness do `run_financeiro_relatorios_webmais_ui_test.js` simulando as 4 callables com `FS.preparar*`)

- [ ] **Step 1:** teste Chrome: lançar adiantamento (A pagar › "+ Adiantamento"), card "Adiantamentos em aberto" mostra saldo; detalhe do título › "Compensar com adiantamento" baixa; selecionar 2 títulos › "Renegociar selecionados" com prévia das parcelas → título novo na lista e originais "Renegociado"; detalhe › "Desfazer"; A receber › selecionar › "Cancelar selecionados" (incobrável) → "Cancelado"; desfazer; sem erro de JS.
- [ ] **Step 2–4:** falha → implementar → passa; rodar as 6 telas antigas do Financeiro.
- [ ] **Step 5:** commit `feat(financeiro): tela de adiantamento, renegociação e cancelamento`.

### Task 7: Regras, ensaio, documentação e publicação

**Files:** `run_gestao_rules_test.js`, `docs/financeiro-fase0-lacunas.md`, `MELHORIAS_FUTURAS.md`, `AGENT_STATUS.md`, `CLAUDE.md`

- [ ] **Step 1:** regras: cliente (fin e adm) não grava `fin/adiantamentos/X`, `fin/renegociacoes/X`, `fin/cancelamentos/X`; rodar no emulador `demo-gestao` (51 + 3).
- [ ] **Step 2:** ensaio no retrato da base (`scratch/correcao-codigos-materiais-20261111/banco-completo-1615.json`): motor + controladoria `documentosEsperados` sem número inválido e balanceados.
- [ ] **Step 3:** bateria completa (Financeiro, Controladoria, relatórios, telas, navegação, coerência).
- [ ] **Step 4:** docs (lacunas §8 marca Entrega B feita; MELHORIAS tira a Entrega B; AGENT_STATUS concluído com pendências: deploy da VPS; regras não mudam).
- [ ] **Step 5:** commit + `git push origin hostinger-deploy`.
