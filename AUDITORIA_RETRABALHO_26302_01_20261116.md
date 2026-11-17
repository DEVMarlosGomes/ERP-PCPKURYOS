# Auditoria — Registro do retrabalho 26302/01 → Rose Absolut + Sunrise Muse (16/11/2026)

Prompt: `PROMPT_RNC_RETRABALHO_26302_01.md`. Leitura de produção (`erpkuryos`) feita em 16/11 por volta das 14h30,
**somente leitura**, pelo Firebase CLI. Nenhum dado de produção foi alterado.

## 1. Passo 0 — o que a base diz

| Ponto | Base | Confere com o prompt? |
|---|---|---|
| OP 26302/01 (PRF-BIOF-0006 Rose Absolut) | planejado 690; envase 3.470 (Linha 2, 30/10–03/11); rotulagem confirmada 1.489 (`produzidoRotulagem` 3.489); confirmada em 04/11 com `confirmadoComDivergencia` (503%) | sim |
| Conferência PA 26302/01 | 13/11 16:37, **uma contagem** de 3.470, motivo `RECONTAGEM_CONFERE_OP`, status CONFERIDO | sim |
| Palete `pa_26302-01_p1` (GAL-1-3-1) | saldo 3.470, `LIBERADO_EXPEDICAO`, laudo CK7 da Roberta em 13/11 16:47 | sim |
| OP 26264/14 (PRF-BIOF-0004 Sunrise Muse) | planejado 2.750; envase 1.962 apontado (Linha 1, 10–11/11); rotulagem 2.750; confirmada em 12/11 | sim |
| Conferência PA 26264/14 | três contagens de 1.965; RNC-PA-26264-14 (+3), EM_ANALISE | sim |
| Pedido PED-0001 | Rose: produzido 8.024 de 5.500 (Concluído); Sunrise: 4.758 de 5.500 (Produção Parcial) | sim |
| RNC do envase trocado | **já existe: RNC-2026-011**, aberta em 10/11 e encerrada em 12/11 pela Roberta, classe MAIOR, disposição RETRABALHO, cerca de 3.000 un. | achado novo |
| Perfil da Roberta | perfil ativo `qualidade`, `funcoes.qualidade`, `tenant_id kuryos`; há um segundo perfil antigo pendente e desativado | lembrete de 23/10 resolvido |

### Achados novos

1. **A RNC-2026-011 é a RNC deste caso.** Pela regra do prompt, o registro a **vincula**, sem criar outra e sem
   reescrevê-la. Ela tem um erro de digitação no lote: "26266/14 E 26302/01" (o certo é 26264/14). O registro guarda o
   lote correto e mostra o texto da RNC tal como está. A correção da RNC fica com a Roberta.
2. **O que a RNC diz do fluxo físico:** segregação por análise sensorial. O que foi identificado como Rose ficou no
   frasco Rose (26302/01). O que foi identificado como Sunrise Muse foi desenvasado e reenvasado no frasco certo (OP
   26264/14). Houve perda de válvulas e troca das etiquetas das caixas de embarque.
3. **Granel × unidades: a conta do Rose não fecha com o granel do sistema.**
   - A 26302/01 manipulou **130,1 kg** de Rose. A 184,8 g por unidade, isso dá cerca de **704 un.**
   - A 26264/14 manipulou **526,1 kg** de Sunrise Muse, cerca de **2.805 un.**
   - Juntos dão cerca de 3.509 un., compatíveis com as 3.470 envasadas.
   - Mas **1.460 Rose pediriam cerca de 270 kg de granel Rose**. Pelo sistema existiam 130 kg.

   Ou houve outro granel Rose (não registrado na OP), ou parte das unidades classificadas como Rose na análise
   sensorial tem Sunrise. **É ponto para a Roberta confirmar antes do despacho.** O registro tem o campo "granel de
   origem" por lote para isso.
4. **Rotulagem não bate com envase nas duas OPs:**
   - 26302/01: 1.489 rótulos Rose confirmados para 3.470 envasadas.
   - 26264/14: 2.750 frascos Sunrise rotulados para 1.965 envasadas (785 frascos rotulados sem destino declarado).

   São quantidades para a etapa de materiais do registro.

## 2. Balanço do caso

3.470 (origem) − 1.460 (Rose) − 1.965 (Sunrise Muse) = **45 un. sem destino**. O registro só fecha quando a
Qualidade declarar o destino dessas 45 (perda no desenvase, descarte, retenção, quebra, erro de contagem ou outro).

## 3. O que foi construído

- `public/shared/registro-retrabalho.js` é o motor puro: perfil, balanço, pendências e ações CRIAR / SALVAR / ENVIAR /
  REABRIR / ENCERRAR. Uma cópia byte a byte fica em `functions/registro_retrabalho_motor.js`.
- `functions/registro_retrabalho.js` define a callable `registroRetrabalho`, exportada em `functions/index.js`.
  - Ela **só lê** `ops/`, `nao_conformidades/`, `conferencias_pa/` e `usuarios/`.
  - Ela **só grava** `registros_retrabalho/{id}` e `registros_retrabalho_pedidos/{uid}/{requestId}`.
  - A transação é no nó do registro; tem idempotência por requestId e histórico só de inclusão, com antes e depois.
- Regra do banco (`database.rules.json`):
  - `registros_retrabalho` é lido por Qualidade (role, função ou módulo), ADM, PCP e Logística, e ninguém grava pelo
    navegador;
  - `registros_retrabalho_pedidos` fica fechado.
- `qualidade.html` ganhou a aba **♻️ Registros de retrabalho** (`shared/registro-retrabalho-tela.js`):
  - abertura do registro (RNC, lote de origem, lotes de destino, RNCs relacionadas);
  - as 3 etapas, com recurso, datas, responsáveis, procedimento, entrada, saída, perda, materiais e fotos;
  - perdas declaradas e balanço ao vivo;
  - enviar, devolver e encerrar com análise, e impressão com a RNC.

  O aviso fixo diz que salvar, enviar ou encerrar **não** libera nem bloqueia nada.

## 4. Testes

| Teste | Resultado |
|---|---|
| `run_registro_retrabalho_test.js` (motor + serviço real sobre a base real do caso + não interferência) | 11 grupos OK |
| `run_registro_retrabalho_emulator_test.js` (regras no emulador, `demo-registro-retrabalho`) | 4 passos OK |
| `run_registro_retrabalho_ui_test.js` (Chrome, tela real) | 8 cenários OK |
| Regressão: filtro da Qualidade, fotos da Qualidade, alerta de consistência, consistência | OK |

O teste de não interferência compara antes e depois do fluxo completo (criar, salvar, enviar, encerrar):
- a conciliação do PED-0001;
- o motor de consistência;
- todos os nós operacionais.

Os três ficam idênticos, e todo caminho gravado começa por `registros_retrabalho`. Foi conferido que o teste
**falha** quando o serviço grava em `ops/`.

## 5. Pendências que ficam com o Marlos (decisão, não código)

1. **GAL-1-3-1 com 3.470 Rose `LIBERADO_EXPEDICAO`.** O físico final é 1.460. Se a carga sair pelo sistema como
   está, o romaneio/NF pode levar 3.470. Corrigir o apontamento da 26302/01 e o palete (seção 6 da auditoria de 13/11)
   precisa de decisão **antes do despacho**. O registro não faz isso.
2. **Crédito em dobro no PED-0001** (Rose 8.024 de 5.500). Sai junto com o item 1.
3. **Granel Rose** (achado 3): confirmar com a Roberta antes de despachar as 1.460 Rose.
4. **Estorno de frasco, válvula e rótulo baixados em dobro.** Fica registrado no caso como quantidade, sem
   lançamento, até o Dia D.
5. **Abrir o registro RR-26302-01-1 em produção.** Depende do deploy da VPS (callable) e da publicação das regras.
   Depois disso, a Roberta abre o registro pela própria aba em um minuto: RNC-2026-011, origem 26302/01, destinos
   26302/01 (1.460) e 26264/14 (1.965), relacionada RNC-PA-26264-14.

## 6. Segunda entrega (17/11/2026): vínculo, relatório completo e acabamento

**Vínculo RNC ↔ registro, só leitura.** O elo é o `rncNumero` gravado no registro, e a RNC não é alterada.
- Na lista de RNCs aparece o selo "♻️ retrabalho".
- No detalhe da RNC aparece o bloco "Registros de retrabalho vinculados" (situação, lote de origem → destinos +
  perdas, balanço), com "Abrir registro".
- No registro há o botão "⚠️ Ver RNC".

Nenhum caminho novo grava em `nao_conformidades`, `estoque_lotes`, `estoque`, `conferencias_pa`, `ops` ou `pedidos`.
O PA pronto para expedir e o estoque físico não mudam. O teste de tela confere que esses nós ficam idênticos depois do
fluxo inteiro.

**Relatório da RNC completo.** O botão "🖨 Relatório da RNC (FOR-QUA-0001)" (e "Relatório da RNC + anexo" no
registro) emite a RNC seguida do **anexo de cada registro vinculado**, montado por `shared/registro-retrabalho-doc.js`
no mesmo A4 e com as mesmas classes de `laudo-cq.css`. O anexo traz:
- identificação;
- balanço (apontado, conferido e unidades finais por lote, perdas, diferença);
- as 3 etapas com recurso, datas, responsáveis, procedimento, quantidades, conferência entrada = saída + perda e
  materiais;
- decisão da Qualidade, histórico com os campos alterados e assinaturas (elaborado e aprovado);
- anexo fotográfico (fotos da RNC e das etapas; PDF listado pelo nome).

Registro não encerrado sai com a faixa **DOCUMENTO PROVISÓRIO**. Balanço aberto sai com a faixa **BALANÇO NÃO
FECHADO**. Campo vazio sai em branco. O PDF foi gerado e conferido visualmente: 4 folhas para o caso 26302/01.

**Acabamento:**
- Encerrar e Devolver em janela própria, com resumo do balanço e campos obrigatórios (antes eram caixas `prompt`).
- Validação inline ao abrir o registro, Esc fecha as janelas.
- Busca, filtro de situação (padrão "Em aberto") e 4 indicadores.
- Remover linha de perda e de material.
- Aviso de alterações não salvas (ao trocar de registro, ir para a RNC ou fechar a página).
- O relatório exige que o registro esteja salvo e mostra aviso de só leitura para PCP e Logística.

**Testes:**
- `run_registro_retrabalho_doc_test` (4 grupos, novo);
- `run_registro_retrabalho_ui_test` (12 cenários: validação, Esc, remover linha, devolver, encerrar, indicadores e
  filtros, relatório, vínculo na RNC, não interferência, PCP só leitura, celular);
- `run_registro_retrabalho_test` (11).

Regressão da Qualidade: filtros, fotos, alerta de consistência e devolução de cliente.
