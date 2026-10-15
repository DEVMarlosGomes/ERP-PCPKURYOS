# Plano — Ajustes no fluxo P&D → CRM → Cadastros

Aprovado pelo usuário em 15/10/2026. Código do P&D/CRM no fonte React do ERP
(`KURYOS/ERPKuryosBeauty-master/frontend/src`, branch `claude/crm-fluxo-erp-master`,
sem commit no GitHub do ERP), compilado para `public/static/crm` por
`scripts/integrar-crm-build.mjs`. Cadastros no PCP (`public/cadastros.html`); câmbio no
servidor do Render (`functions/render-server.js`).

## Fluxo

- Hoje: Amostra → Cotação → Orçamento aprovado → Kickoff → CGI → SKU → Pedido.
- Novo: Amostra aprovada pelo cliente → **Kickoff** (técnico + BOM) → **Cotação montada do BOM
  do Kickoff** → Orçamento aprovado → CGI → SKU → Pedido.

## Fase 1 — Ajustes rápidos (publicada em 15/10/2026)

Motores em `lib/pdAmostra.js` e `lib/pdCards.js` (fonte do ERP), testes em
`pdAmostra.test.js`, `pdCards.test.js` e `firebaseApi.pd.test.js`. Medido na base antes:
10 variações aprovadas pelo cliente e 1 com retrabalho seguiam "Aguardando Aprovação" no P&D;
3 solicitações sem card; 5 cards sem solicitação.

1. **Volume da amostra:** nasce em **60** com menu de unidade (mL, g, L, kg); base de cálculo
   **1000** na unidade escolhida. Quantidades mostradas na amostra e na base de 1000.
2. **R$ e US$ em colunas próprias** na manipulação (sem o "= R$" embaixo do US$).
3. **Sai a aprovação/reprovação do químico no P&D.** Banco de fórmulas e Kickoff passam a
   exigir só a aprovação do cliente. **As aprovações de Qualidade do Kickoff continuam.**
4. **Contato do cliente:** saem a lista "Decisores" e a pergunta "Tem Anvisa?"; cada contato
   ganha a caixa **"É decisor"**; o funil exige ao menos um contato decisor.
5. **V1 automática** na aba Amostras ao finalizar a manipulação.
6. **Cards do P&D com o status real** (hoje o espelho em lote fica para trás).

## Fase 2 — Funil e numeração (publicada em 15/10/2026)

Decisões de implementação: projetos que já estavam em Cotação/Orçamento/Negociação
seguem o caminho antigo (Kickoff abre no pedido aprovado); quem está em Amostra Enviada
passa pelo Kickoff. A revisão do Kickoff mantém o número (`KO-2026-031`) e muda a versão
(`v2`). Registrar o retorno do cliente numa amostra do P&D não é travado.

1. **Amostra enviada trava o P&D** (manipulação/fórmula/amostra somente leitura) até o retorno
   do cliente. Retrabalho destrava e abre a próxima versão (V1 preservada); aprovada segue
   para o Kickoff.
2. **Numeração por projeto:** projeto `2026-031`; amostras `2026-031-A1`, `A2`; variações
   `2026-031-A1-a`; Kickoff `KO-2026-031` (revisão `KO-2026-031-v2`). Projetos atuais recebem
   número; amostras antigas mantêm o número que já têm.
3. **Kickoff antes da cotação**, editável depois de aprovado **com justificativa obrigatória**
   (nova versão, anterior no histórico, log de quem/o quê/por quê). CRM2 ganha a etapa
   Kickoff entre "Amostra aprovada" e "Cotação".

## Fase 3 — Manipulação no modelo das fichas (alimenta a 2.2 da Ficha Técnica)

Modelo do usuário (fichas Scentec, abaixo): tabela **Ordem/Fase · Ingrediente · INCI ·
Fornecedor · %** e um bloco **PROCEDIMENTO** em texto corrido.

1. Fase (A, B, C, D…) por ingrediente; INCI e fornecedor visíveis (campos já existem em
   `pd_formula_items`, vazios).
2. Procedimento como lista numerada de passos (cada passo pode indicar fase e temperatura);
   gera a seção **2.2 · Modo de Preparo** da ficha técnica.
3. **MP nova não cadastrada:** nome por extenso + tipo **MPGR** ou **MPES**. Só segue para o
   Cadastros após aprovação do cliente. Em retrabalho com troca de MP, a antiga fica no
   histórico (log) com amostra, versão e data.
4. Ficha técnica nasce populada com tudo que veio antes (identificação, composição, fases,
   procedimento, características, testes).

### Referência 1 — MOCHI BLUR

| Fase | Ingrediente | INCI | Fornecedor | % |
|---|---|---|---|---|
| A | Água Demineralizada | Aqua | — | 78,1 |
| A | EDTA dissódico | Dissodium EDTA | Breentag | 0,05 |
| A | Dipropilenoglicol | Dypropileneglicol | Volp | 2,00 |
| A | Glicerina | Glycerin | Baretz | 2,00 |
| A | Viscopure | Glucomannan (and) Xanthan Gum | Solabia | 0,35 |
| B | Myritol 331 | Coco-Caprylate/Caprate | Basf | 8,00 |
| B | Óleo de Jojoba (0295) | Simmondsia Chinensis (Jojoba) Seed Oil | Loop Hope | 2,00 |
| B | Óleo de Rosa mosqueta (LH0263) | Rosa Canina Seed Oil | Loop Hope | 1,50 |
| B | Álcool Ceto estearílico | Cetearyl Alcohol | Polycomercio | 3,00 |
| B | Estearato de Glycerila | Glyceryl Stearate | Polycomercio | 2,00 |
| B | Fragrância (SCE965233 Mouchi Blur II) | Parfum | Scentec | 1,00 |

Procedimento: Pesar e misturar separadamente os componentes da FASE A e da FASE B. Aquecer
ambas as fases até 70 °C, mantendo-as nessa temperatura até a completa fusão e
homogeneização dos componentes. Em seguida, adicionar lentamente a FASE B sobre a FASE A, sob
agitação constante, mantendo a mistura até a formação de uma emulsão homogênea. Resfriar sob
agitação até a temperatura ambiente e, se aplicável, adicionar os componentes da fase de
resfriamento.

### Referência 2 — MANTEIGA DE BANHO

| Fase | Ingrediente | INCI | Fornecedor | % |
|---|---|---|---|---|
| A | Cetiol LC | Coco-Caprylate/Caprate | Basf | 10,00 |
| A | Miristato de Isopropila | Isopropil Miristate | Basf | 10,00 |
| A | Óleo de Jojoba (0295) | Simmondsia Chinensis (Jojoba) Seed Oil | Loop Hope | 13,00 |
| A | Óleo de Semente de Uva (LH0256) | Vitis Vinifera (Grape) Seed Oil | Loop Hope | 4,45 |
| B | Manteiga de Quinoa (LH0348) | Shea Butter Butyrospermum Chenopodium Quinoa Extract | Loop Hope | 40,50 |
| C | B.H.T | Butylated Hydroxytoluene | Polycomercio | 0,05 |
| C | Plantapom AF | MIPA-Laureth Sulfate (and) Laureth-3 (and) Laureth-7 Citrate | Basf | 5,00 |
| C | Amida 90 | Cocamide DEA | Breentag | 3,50 |
| D | Eumulgin | Ceteareth-20 | Breentag | 5,00 |
| D | Álcool ceto estearílico | Cetearyl Alcohol | Breentag | 3,50 |
| D | Fragrância (SCE963092 SHOWER BUTTER I) | Parfum | Scentec | 4,00 |

Procedimento: Pesar adequadamente as matérias-primas na ordem descrita. Aquecer a Fase A a
75 °C e homogeneizar. Após completa diluição, aquecer Fase B a 65 °C e adicionar a Fase B
sobre a Fase A sob agitação contínua. Em seguida, adicionar a Fase C e D a 50 °C e
homogeneizar até completa uniformidade. Por fim, envasar em frasco de sua preferência.

## Fase 4 — Cadastro do que nasce no P&D (PCP › Cadastros)

- Cliente aprovou → cada MP nova vira tarefa na fila do time de cadastro (origem, projeto,
  amostra, tipo).
- **MPES:** dois SKUs de entrada obrigatórios — o de **aprovação** (amostra do fornecedor) e o
  **final** (lote de compra); a validação só fecha com o segundo; o primeiro fica no histórico.
- **Demais tipos:** caixa "Adicionar versão final do SKU de entrada" (opcional).
- **SKU interno** gerado no cadastro e **nunca alterado** pelas trocas do SKU de entrada
  (`codigoFornecedor` vira lista versionada aprovação → final).

## Fase 5 — Dólar ao vivo + spread

Render busca o dólar comercial (API gratuita) a cada 15 min e grava em `config/cambio`; o ADM
define o spread (%). Toda tela com preço em US$ lê esse valor. Cotação **rascunho** acompanha o
dólar; cotação **enviada** congela o câmbio usado.

## Fase 6 — Estabilidade em sequência

Características padrão (aspecto, cor, odor, pH, densidade) acima da grade D24/D48/D7…; só o
próximo checkpoint fica liberado, preenchido **completo**; o seguinte destrava quando o anterior
está completo **e** o prazo passou (a tela mostra "libera em X h").

## Fase 7 — Cotação por insumo e por serviço

- Itens vêm do BOM do Kickoff (MPs, embalagens, derivados), com preço unitário convertido pelo
  dólar quando em US$.
- **Cadastros › Serviços** (carga inicial com 10): manipulação de granel (kg), envase líquido,
  envase creme/pasta, rosqueamento/tampa, rotulagem, celofane/shrink, encartuchamento,
  montagem de kit/display, codificação de lote/validade, embalagem em caixa master. Cada um:
  unidade de cobrança (un/milheiro/kg/lote), preço R$, setup por lote, mínimo por pedido,
  **desconto da etapa (%)**, vigência com histórico.
- **Desconto por etapa (pedido de 15/10):** cada serviço tem o seu desconto padrão na tabela;
  na cotação cada etapa mostra preço cheio, desconto e preço final, editável linha a linha.
- **Preço sugerido**, nunca inventado: custo-hora da linha ÷ produtividade (un/h, pelo
  `prodHoraRef` conservador) × (1 + margem). O comercial decide o preço final.
- Serviço **sem preço bloqueia o envio** da cotação ("SEM PREÇO", nunca zero).
- Carga inicial pelos valores das últimas propostas enviadas.

## Ordem

1 → 2 → 3 → 5 → 6 → 4 → 7. Cada fase: testes (Vitest + harness do fluxo), ensaio contra a base
real, navegador como ADM e como comercial/P&D, commit + push.
