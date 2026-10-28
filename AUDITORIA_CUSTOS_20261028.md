# Auditoria do módulo Custos e Resultado — 28/10/2026

Escopo: tudo o que foi construído em 26–27/10 a partir de `PLANO_CUSTOS_RESULTADO.md` (Fases 0–6)
com as regras de `PROMPT_CUSTOS_ERP.md`. Cada ponto foi conferido no código, nos testes, contra a
base real de `erpkuryos` (só leitura) e no navegador contra os emuladores. Onde a auditoria achou
defeito, ele foi corrigido e ganhou teste antes deste relatório.

## 1. O que existe

| Peça | Arquivo | Papel |
|---|---|---|
| Motor de padrão | `public/shared/custos.js` (cópia byte a byte em `functions/`) | preço com origem e histórico, densidade pela especificação, versão em uso, ritmo conservador, horas úteis, taxas da competência, ficha padrão, LP padrão e do orçamento, LPD, cobertura |
| Motor de realizado | `public/shared/custos-realizado.js` (idem) | custo real da OP, variações, consolidação OP → pedido → cliente → mês, lançamentos do razão |
| Motor de pontos | `public/shared/resultado-pontos.js` (idem) | tabela de pontos, meta pelo mix, descontos, placar, semana/mês, bônus, simulação |
| Servidor (Render) | `functions/custos_resultado.js` + `functions/index.js` | custo no lote no recebimento, razão append-only, placar a cada 5 min, tabela congelada no 1º do mês, fechamento, recálculo |
| Tela da diretoria | `public/custos.html` + `public/shared/custos-tela.js` | 7 abas: Painel, LP por SKU, Realizado, Pendências, Preços, Resultado e bônus, Parâmetros |
| TV | `public/placar.html` | pontos × meta, sem R$, sem produto, sem nome |
| Acesso | `auth_check.js` (módulos `custos` e `placar`, papel `tv`), `login.html`, `usuarios.html`, `database.rules.json` (`custos/`, `resultado/`) | diretoria = ADM ou módulo Custos |

## 2. Critérios de aceite do `PROMPT_CUSTOS_ERP.md` (§8)

| # | Critério | Situação | Evidência |
|---|---|---|---|
| 1 | Base sem preço: nenhuma ficha com total, nada NaN/Infinity/negativo | **ok** | `run_custos_v2_test.js` (estado vazio); ensaio na base real: 376 SKUs, 0 inválidos |
| 2 | Amostra do P&D sem custo por item não conclui | **ok, já existia** | trava dos 100% no servidor (`liberarEtapaPd`) e preço por item obrigatório na fórmula do P&D |
| 3 | Compras atualizando custo estimado preserva histórico e mede o desvio | **ok** | `resolverPrecos`: histórico inteiro por material + `desvioEstimativaPd`; aba Preços mostra o erro médio do P&D |
| 4 | Ficha incompleta mostra partes, total indisponível e o que falta | **ok** | ficha com partes, pendências com ação de um clique |
| 5 | Unidade não conversível = *incompatível*, distinto de *sem preço* | **ok** | pendência `UNIDADE` separada de `PRECO_MATERIAL` |
| 6 | Sem densidade: custo do kg calcula; por unidade não, com motivo | **ok** | teste dedicado; na base, a densidade vem da especificação em 163 SKUs |
| 7 | Densidade −1 ou ausente nunca gera número | **ok** | teste dedicado |
| 8 | Ocupação por horas-padrão; duração da OP fora de qualquer conta | **ok** | teste "duração de OP não entra"; operação real pelas horas apontadas |
| 9 | Ficha de competência passada reproduzível | **ok** | `custos/fichas/{competência}` + `custos/taxas/{competência}` congeladas com a versão do motor |
| 10 | Nenhuma tela lê salário individual | **ok** | só o total da folha em `custos/operacao/{mês}`; `rh_colaboradores` não é lido |
| 11 | Suíte cobre vazio, parcial e completo | **ok** | 113 + 116 + 89 asserções + 16 casos de servidor |
| 12 | Motor contra a base real sem número inválido | **ok** | ensaios no scratchpad e e2e com a base real semeada no emulador |

## 3. Decisões do `PLANO_CUSTOS_RESULTADO.md` (§10, "novas, para aprovar")

| # | Decisão | Implementado |
|---|---|---|
| 1 | Origem PAGO › COTADO › ESTIMADO P&D; SEM CUSTO nunca vira zero | sim; o MANUAL entra entre COTADO e P&D; o único zero aceito é o carimbado `CLIENTE` |
| 2 | Três leituras do LP | sim: orçamento (SKU do CRM), padrão e realizado lado a lado na ficha |
| 3 | Operação por horas-padrão; ociosidade fora do LP | sim: hora direta ÷ hora **disponível** no LP; hora plena ÷ horas-padrão no custo pleno; ociosidade como linha do custo fixo |
| 4 | Tabela de pontos congelada por mês | sim: servidor congela no 1º dia; substituir exige motivo e guarda a anterior |
| 5 | SKU sem custo fora do placar e da meta, com cobertura | sim: a fatia de horas do SKU sem pontos não vira meta; cobertura no placar |
| 6 | Placar no servidor; TV só lê totais | sim: e2e confirma que a TV não lê a tabela por SKU e que o placar não tem R$ |
| 7 | Fases 0 e 1 agora; 2 a 5 depois da virada | código de todas as fases pronto; 2–5 só ganham número quando a fábrica apontar no `erpkuryos` |

## 4. Armadilhas do CLAUDE.md

| Armadilha | Situação |
|---|---|
| `update` com objeto aninhado apaga campos | toda gravação da tela é por caminho plano; e2e confere que preço manual e parâmetros não apagam vizinhos |
| Testar a unidade não basta | e2e da ligação: tela → banco → servidor → TV; recebimento testado pelo callable real |
| Papel novo em cinco pontas | `tv` em `pageAccessRules` (módulos), menu, `login.html`, `usuarios.html` e regras |
| Escrita em nó novo × papel da tela | regras de `custos/` e `resultado/` testadas no emulador (42 verificações) com ADM, módulo Custos, PCP, RH, TV e produção |
| `.transaction()` no null | o módulo não usa transação |
| Emulador sem `--project demo-…` | teste de regras roda com `demo-custos` |
| Capacidade pelo valor conservador | ritmo = menor entre o cadastro e a mediana histórica das OPs |

## 5. Defeitos achados na auditoria (todos corrigidos, com teste)

1. **Motor antigo trocava "sem cadastro" por "sem preço"** na fórmula: o motivo genérico da conversão escondia o material órfão (Regra 3). Achado no ensaio com a base real.
2. **Lançamento de R$ 0,00 no razão** para OP sem perda apontada. Zero não é fato econômico; não lança mais.
3. **ADM sem leitura da raiz `resultado/`**: a tela escuta o nó inteiro e levava `permission_denied`. Achado pelo e2e.
4. **Devolução parcial ao fornecedor não estornava o razão** (o cancelamento estornava). Agora estorna só a parte devolvida.
5. **Lote nascido de separação/transferência perdia o custo**: a separação copia dono e lote interno, não o custo. O motor herda o custo do lote irmão de mesmo lote interno, sem mexer no módulo de estoque.
6. **SKU com caractere proibido no RTDB** não acharia os próprios pontos na tabela congelada (chave sanitizada). O motor procura nas duas formas.
7. **Razão marcaria OP sem custo como lançada**: com a base sem preço, as OPs de setembro seriam gravadas vazias e nunca relançadas. Agora o razão só registra OP com custo completo; as demais esperam.
8. **TV ilegível**: o tema global pintava os números grandes de escuro no painel escuro. Cores do placar fixadas acima do tema.
9. **"Grupo parecido" casava produtos sem categoria** entre si no ritmo. Grupo exige subcategoria e volume.

## 6. Números da base real (`erpkuryos`, 26/10)

- 376 SKUs; LP completo em **0** hoje: só 12 materiais têm preço (10 PAGO de PC, 2 ESTIMADO P&D com de-para confirmado).
- Densidade: 15 no cadastro + **163 pela especificação**.
- Ritmo: 212 do cadastro, **113 pelo histórico** (menor que o cadastro), 7 por grupo, 44 pela mediana da planta.
- De-para P&D → cadastro: 170 ingredientes com preço; 25 casam por nome exato. O resto precisa de confirmação na aba Pendências.
- Orçamento aprovado PRF-JOHN-0001: vendido a R$ 9,228 = custo dos insumos, sem serviço → **LP do orçamento negativo**.
- Última OP da base: 21/09. Realizado e placar param aí até a virada.

## 7. Pendências que não são de código

| Pendência | Dono | Onde |
|---|---|---|
| Publicar as regras `custos/` e `resultado/` em `erpkuryos` | usuário (a CLI pede autorização) | `npx firebase-tools deploy --only database --project erpkuryos` |
| % de impostos (padrão e por cliente) | Financeiro / contador | Custos › Parâmetros |
| Folha da produção e custos fixos do mês | diretoria | Custos › Parâmetros |
| Preços: os 66–101 primeiros da fila fecham metade a dois terços do volume | Compras | Custos › Pendências |
| Confirmar o de-para do P&D | P&D / Compras | Custos › Pendências |
| Fator, % alvo, faixas e base do bônus | diretoria, pela simulação | Custos › Resultado |
| Forma legal do bônus (PLR, Lei 10.101/2000) | RH + contador | fora do sistema |
| Usuário da TV (papel `tv`) | ADM | Usuários |
| Virada da fábrica para o `erpkuryos` | operação | sem ela, realizado e placar não andam |

## 8. Verificação

- Motores: `run_custos_test.js` (113), `run_custos_v2_test.js` (116), `run_resultado_pontos_test.js` (89).
- Servidor: `run_custos_servidor_test.js` (16 casos, recebimento/cancelamento/devolução pelos callables reais e a rodada agendada ponta a ponta).
- Regras: `run_custos_resultado_rules_test.js` (42, emulador `demo-custos`); `run_pacote_20261022_rules_test.js` segue passando.
- Contrato do Render: `run_render_functions_test.js` atualizado para 26 funções.
- E2E (scratchpad, emuladores + Chrome, base real semeada): 38 verificações, 0 falhas — ADM nas 7 abas e na ficha, gravações por caminho plano, simulação, portão, 375 px, PCP barrado (menu, página e console), TV com número e sem R$.
- Suíte inteira do repo: as 57 falhas restantes são de ambiente (pacote `playwright` ausente nos testes de tela, ou exigem emulador na porta 9023) e falham igual no `HEAD` anterior.
