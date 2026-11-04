# Revisão do Dev Sênior — Manipulação em Lote (spec de 04/11/2026)

Conferida contra o código da branch `pd-lote/manipulacao-lote` (base `hostinger-deploy`, `360d43d`).
Severidade: **Bloqueante** (volta ao Tech Lead) · **Importante** (resolvido na spec) · **Sugestão**.

## Achados

| # | Sev. | Achado (com evidência) | Resolução na spec |
|---|---|---|---|
| R-01 | Importante | O §6 do prompt manda o `audit_log` no **mesmo** `update` do salvamento, mas desde 03/11 o cliente não grava `audit_log` (`database.rules.json`, `$collection != 'audit_log'`; `firebaseApi.js:auditCard` usa a callable `registrarAuditoriaCrm`). Um `update` com esse caminho seria recusado inteiro. | `eventos` do lote (só inclusão, `por == auth.uid`) vão no mesmo `update`; o resumo vai depois à callable. §6.5. |
| R-02 | Importante | `solicitacoes_cadastro_material` aceita escrita de `role` `admin/pcp/pd/comercial` e `modulos.*`, mas **não** de `lider_pd`, `formulador`, `engenharia_produto` nem `funcoes.pd` (`database.rules.json:594`). Pôr a fila no mesmo `update` faria o salvamento de uma formuladora falhar por causa da fila. | Fila num segundo `update`, com aviso (mesmo contrato de `sincronizarFilaMpNova`). §6.5. |
| R-03 | Importante | O prompt pede o nó na raiz; D-12 manda para `erp/$tenant/pd_manipulacao_lotes`. Funciona porque `erp/$tenant/.write` é `false` desde 03/11 e a escrita vem de `$collection`; uma coleção nomeada não herda a regra do curinga. Defesa extra: excluir o nome no `$collection` (como já se faz com `pd_liberacoes_status`). | §8, com teste de negação para `comercial`/`pcp`, que passam no `$collection`. |
| R-04 | Importante | Versão nova hoje é `max(version)+1` lido (`firebaseApi.js` ~2276, ~2410, ~2455): dois salvamentos simultâneos dão a mesma versão. | Reserva por `runTransaction` com `max(contador, maior lida)+1`; o resto do P&D segue com max+1 (risco residual fora do pacote). §6.3. |
| R-05 | Importante | `.validate` não roda em exclusão: `materiais/$m/criticoPd` com `.validate` próprio não impede um PCP de **apagar** a marca, e o Cadastros grava o material inteiro (`cadastros.html:2840`, `updates['materiais/'+key] = data`), o que apagaria a marca a cada edição de PCP. | Regra no `$material` (pai) comparando o primitivo; o Cadastros passa a preservar `criticoPd` e só o ADM vê a caixa habilitada. §8. |
| R-06 | Importante | `pdSyncRequestStatus` regrava `variacoes` inteiro (`firebaseApi.js` ~603). Gravar `lote_manipulacao` com `patch` de N variações irmãs em paralelo perderia gravações. | Caminho plano por índice (`crm_samples/{s}/variacoes/{idx}/lote_manipulacao`) no mesmo `update`; sync de status um por vez. §3, §6. |
| R-07 | Importante | Concorrência com a aba Manipulação: a versão do lote é rascunho e editável pelas rotas existentes enquanto o lote está aberto. | Assinatura da versão gravada no membro; salvar compara e devolve 409 nomeando a amostra; gerar ordem trava. §6.2. |
| R-08 | Importante | Duplo clique em "Gerar ordem": duas chamadas ao servidor. | Transação na `revisao` (só uma reclama); a segunda recebe "o lote mudou". §7. |
| R-09 | Importante | D-05 fórmula `mᵢ = Qᵢ·Σcⱼ/100` arredondada difere da soma das linhas arredondadas em até n×0,005 g e quebra "ordem = soma das individuais (0,01 g)" e pode dar Σmᵢ > pesado com excesso 0. | `mᵢ = Σⱼ round(Qᵢ·cⱼ/100)` (igual à ordem individual por construção); pesado = `round(Σᵢ gᵢⱼ × (1+p))` ≥ Σᵢ gᵢⱼ. §2 D-05/D-06. |
| R-10 | Importante | `deleteSampleCascade` engole erro (`.catch(() => null)`, `firebaseApi.js:1201`) e `deleteCard` não passa pelo P&D. | LM-05 §9. |
| R-11 | Sugestão | Ações em lote pela rota real custam ~15 leituras por amostra (`all()` dentro de `PUT …/status`, `pdSyncRequestStatus`, `parearEtapasPelaAmostra`) → ~300 com 20 amostras. Função de servidor em lote seria G (reproduzir travar fórmula, `pd_samples`, D48h, histórico, sync, pareamento). | Mantida a rota real, um por vez (paridade garantida, ação rara). Registrado em `MELHORIAS_FUTURAS.md`. |
| R-12 | Sugestão | `integratedMaterials` lê 5 coleções (inclui `pedidos_compra`). O salvamento não precisa: preço/código vêm do item clonado ou do catálogo escolhido na tela. | Salvamento lê só `materiais` (marca crítico). §6.1. |
| R-13 | Sugestão | Conferência de 100 % no **salvamento**: recusar impediria salvar trabalho parcial. | Salvar aceita rascunho fora de 100 % (tela vermelha, retorno lista pendências); gerar ordem, Em Testes e `liberarEtapaPd` recusam. |

Nenhum Bloqueante.

## Respostas às perguntas do §3.2

- **Modelo de dados:** versão nova por amostra (D-03) — sem ela, teste, aprovação, ficha, BOM e SKU por amostra
  quebrariam (`PUT …/status` trava a vigente por desenvolvimento). Reaproveitar uma fórmula só seria possível com
  N desenvolvimentos apontando para um registro — nada no P&D lê assim.
- **Atomicidade:** um `update(ref(db), {...})` com caminhos planos (§6.4); fila e sync fora, por R-02/R-06.
- **Desempenho:** painel 6 leituras, salvamento 9 + fila (uma por nome de MP nova), sem `all()`/`related()` por membro.
  Medido no teste de rota com contador de `get`.
- **Concorrência:** `revisao` validada pela regra (prova no emulador); versão editada fora → 409 (R-07).
- **Idempotência:** mesmo conteúdo não grava; ids determinísticos dos itens; gravação única no servidor.

## Tickets — risco, tamanho e prova

| Ticket | Tam. | Risco | Teste que prova |
|---|---|---|---|
| LM-01 motor | M | matemática da ordem e arredondamento | `lib/manipulacaoLote.test.js` (20 amostras, 40 ingredientes, 4 casas, só em uma, sem fragrância, quantidades diferentes) |
| LM-02/03 rotas + versões | G | efeitos encadeados de criar fórmula/item | `lib/firebaseApi.manipulacaoLote.test.js` (memória, contador de leituras) |
| LM-04 regra | M | semântica de `.write`/`.validate` no RTDB | `run_pd_manipulacao_lote_rules_test.js` (emulador 9063) + teste integrado do adaptador |
| LM-05 cascata | M | apagar histórico | casos em `firebaseApi.manipulacaoLote.test.js` |
| servidor | M | transação e gravação única | `functions/test/manipulacao_lote.test.js` (`node --test`) + emulador |
| LM-06/07/08 tela | G | tela grande; conflito com o Codex | `run_pd_manipulacao_lote_ui_test.js` (Playwright, Firebase simulado), prints 1440/390 claro/escuro |
| LM-10/11 integrações | M | perder variação irmã no CRM 3 | teste com duas variações da mesma amostra |
| LM-12 base | P | alterar a vigente | rota: cria v+1, vigente intacta, igual reaproveita |
| LM-13 ensaio | M | sem fotografia da base | `scripts/ensaio-pd-lote.mjs` no emulador: 18 × 14, cronometrado 5 × 25 |
| LM-14 manual | P | — | `run_manuais_workflow_test.js` |
