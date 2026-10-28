# Auditoria do módulo Custos e Resultado — 28/10/2026

**Referência: `PLANO_CUSTOS_RESULTADO.md`**, o plano que o módulo implementa (Fases 0–6). As regras
herdadas do `PROMPT_CUSTOS_ERP.md` estão conferidas na seção 4.

Cada ponto foi conferido no código, nos testes, contra a base real de `erpkuryos` (só leitura) e no
navegador contra os emuladores. Fizemos duas passadas:
- a primeira em 27/10;
- a segunda em 28/10, seção por seção do plano. Ela achou mais 5 defeitos, todos corrigidos e testados
  antes deste relatório.

## 1. O que existe

| Peça | Arquivo | Papel |
|---|---|---|
| Motor de padrão | `public/shared/custos.js` (cópia byte a byte em `functions/`) | preço com origem e histórico, densidade pela especificação, versão em uso, ritmo conservador, turno e horas úteis, taxas da competência, ficha padrão, LP padrão e do orçamento, LPD, cobertura, BOM aprovada por SKU |
| Motor de realizado | `public/shared/custos-realizado.js` (idem) | custo real da OP, variações, procedência do custo, consolidação OP → pedido → cliente → mês, lançamentos do razão |
| Motor de pontos | `public/shared/resultado-pontos.js` (idem) | tabela de pontos, meta pelo mix, descontos (inclusive a conferência de consumo), placar, semana e mês, bônus, simulação |
| Servidor (Render) | `functions/custos_resultado.js` + `functions/index.js` | custo no lote no recebimento, razão append-only, placar a cada 5 min (com o turno do dia), tabela congelada no 1º do mês, fechamento |
| Tela da diretoria | `public/custos.html` + `public/shared/custos-tela.js` | 7 abas: Painel, LP por SKU, Realizado, Pendências, Preços, Resultado e bônus, Parâmetros |
| TV | `public/placar.html` | pontos × meta, semana, mês, dias batidos, contagem do turno; sem R$, sem produto, sem nome |
| Acesso | `auth_check.js` (módulos `custos` e `placar`, papel `tv`), `login.html`, `usuarios.html`, `database.rules.json` | diretoria = ADM ou módulo Custos. **Regras publicadas em 28/10** |

## 2. Conformidade com o `PLANO_CUSTOS_RESULTADO.md`, seção por seção

### §1 O que muda em relação a 20/10

| # | Item | Situação |
|---|---|---|
| 1 | Realizado só depois da virada | ok: as telas dizem "última OP desta base: 21/09" |
| 2 | Três colunas: orçamento × padrão × realizado | ok: ficha do SKU com as três leituras |
| 3 | Origem do custo PAGO › COTADO › ESTIMADO P&D | ok; o MANUAL entra entre COTADO e P&D |
| 4 | Material do cliente marcado sozinho para SKU do CRM | ok: Kickoff "fornecido por" e `custoFonte: CLIENTE` no recebimento; o legado é marcado na aba Pendências |
| 5 | Operação por horas-padrão; ociosidade no custo fixo | ok: teste "duração de OP não entra" |
| 6 | Tabela de pontos congelada por mês | ok: o servidor congela no 1º dia; trocar exige motivo e guarda a anterior |
| 7 | Placar no servidor, só totais | ok: e2e confirma que a TV não lê a tabela por SKU e que o placar não tem R$ |

### §5 Definições

| Item | Situação |
|---|---|
| LP = preço líquido − variáveis; fixo fora do LP | ok |
| SEM CUSTO nunca vira zero; fora do placar e da meta | ok |
| Confiança do custo: origem por componente e % do SKU | ok: `composicaoProcedencia` e `pagoCotadoPct` na ficha |
| LPD padrão: ritmo do SKU, depois grupo parecido, depois mediana da linha; sempre o menor | ok: 212 SKUs pelo cadastro, 113 pelo histórico (menor), 7 por grupo e 44 pela mediana |
| Custo por unidade: granel, embalagem, perdas, operação, impostos | ok no padrão. No realizado, **impostos pelo % do parâmetro**: a NF registrada no faturamento não traz imposto destacado (ver §5) |

### §6 Consolidação

| Item | Situação |
|---|---|
| OP → Pedido × SKU → Pedido → Cliente → Mês | ok |
| Unidades, receita, custo nas leituras, LP, variações | ok. **Corrigido em 28/10:** variação que nenhuma OP do grupo mediu aparecia como R$ 0; agora é "—" |
| Quanto do custo é PAGO, COTADO ou ESTIMADO em cada nível | **faltava; implementado em 28/10** (coluna "Origem do material") |

### §7 Pontos, meta e bônus

| Item | Situação |
|---|---|
| Pontos = LP padrão × fator; tabela congelada; contados sobre o realizado | ok |
| Meta = programa do dia no ritmo de referência, sem perda, × % alvo | ok, pelo mix rodado em cada linha |
| SKU sem custo fora da meta e da contagem; cobertura ao lado | ok |
| Dia → semana → mês por soma | ok |
| Bônus em faixas com teto | ok |
| Descontos: perdas e retrabalho ligados; lote reprovado e divergência PA desligados (propostos) | ok |
| Portões: reclamação −50% no mês; acidente zera a semana | ok; RH registra só acidente (regra testada) |
| First article e assepsia não descontam; paradas não descontam | ok |
| **Conferência de consumo: perda escondida desconta em dobro** | **faltava; implementada em 28/10, desligada por padrão** (ver §5, defeito 11) |
| Cobertura mínima para pontuar (§11, em aberto) | ok: parâmetro `coberturaMinimaPct` opcional |

### §8 Visibilidade

| Item | Situação |
|---|---|
| R$ e LP só a diretoria | ok: regras `custos/` e `resultado/` testadas (42 verificações) e **publicadas em 28/10** |
| TV com login próprio, só totais | ok: papel `tv` nas cinco pontas |
| TV: pontos × meta, semana, mês, dias batidos | ok |
| **TV: contagem do turno** | **faltava; implementada em 28/10** ("faltam 2h15 de turno (até 17:00)") |

### §9 Fases

Há código pronto para todas as fases (0–6). As fases 2 a 5 só ganham número quando a fábrica apontar
no `erpkuryos`. A fase 6 depende de RH e contador (PLR).

## 3. Armadilhas do CLAUDE.md

| Armadilha | Situação |
|---|---|
| `update` com objeto aninhado apaga campos | toda gravação da tela é por caminho plano; o e2e confere |
| Testar a unidade não basta | e2e da ligação tela → banco → servidor → TV; recebimento testado pelo callable real |
| Papel novo em cinco pontas | `tv` em módulos, menu, `login.html`, `usuarios.html` e regras |
| Escrita em nó novo × papel da tela | regras testadas com ADM, módulo Custos, PCP, RH, TV e produção |
| Emulador sem `--project demo-…` | regras testadas com `demo-custos` |
| Capacidade pelo valor conservador | ritmo = menor entre o cadastro e a mediana histórica |
| Buscar pelo nome, não pelo dado | **custou caro de novo** (defeito 10): o motor lia um tipo de movimento que a base não tem |

## 4. Regras herdadas do `PROMPT_CUSTOS_ERP.md` (§8)

| # | Critério | Situação |
|---|---|---|
| 1 | Base sem preço: nenhum NaN, Infinity ou negativo | ok: 376 SKUs, 0 inválidos |
| 2 | Amostra do P&D sem custo por item não conclui | ok (já existia, `liberarEtapaPd`) |
| 3 | Atualização de custo preserva histórico e mede o desvio do P&D | ok |
| 4 | Ficha incompleta mostra partes e o que falta | ok |
| 5 | Unidade incompatível ≠ sem preço | ok |
| 6 e 7 | Sem densidade, o kg calcula e a unidade não; −1 nunca gera número | ok |
| 8 | Ocupação por horas-padrão | ok |
| 9 | Competência passada reproduzível | ok: fichas e taxas congeladas com a versão do motor |
| 10 | Nenhuma tela lê salário individual | ok |
| 11 e 12 | Suíte vazio/parcial/completo; motor contra a base real | ok |

## 5. Defeitos achados (todos corrigidos, com teste)

Primeira passada (27/10):

1. O motor antigo trocava "sem cadastro" por "sem preço" na fórmula.
2. Lançamento de R$ 0,00 no razão para OP sem perda.
3. ADM sem leitura da raiz `resultado/` (`permission_denied` na tela).
4. Devolução parcial ao fornecedor não estornava o razão.
5. Lote nascido de separação perdia o custo (agora herda do irmão de mesmo lote interno).
6. SKU com caractere proibido no RTDB não achava os próprios pontos.
7. O razão marcaria OP sem custo como lançada, e ela nunca seria relançada.
8. TV ilegível (o tema global pintava o número de escuro no painel escuro).
9. "Grupo parecido" casava produtos sem categoria.

Segunda passada (28/10, contra o plano):

10. **O realizado nunca achava consumo.**
    - O apontamento grava a saída em duas razões (`shared/kardex.js`): `consumo_producao` (ou
      `consumo_manipulacao`) no saldo do item e `consumo` na baixa FEFO do lote.
    - O motor lia só `consumo`, que na base não existe porque `estoque_lotes` está vazio.
    - Agora a quantidade vem da razão do item e o custo, da baixa do lote, sem contar duas vezes.
    - Na base real: de 0 para **36 OPs e 219 linhas de consumo**, 0 inválidos.
11. **A conferência de consumo do §7 não existia, e o dado para ela também não.**
    - O envase baixa a embalagem **pela ficha** (BOM × apontado, `form.html:baixarEstoqueConsumo`).
      Conferir contra essa baixa daria sempre "nada escondido", um falso "conferido".
    - A conferência foi implementada contra o **material entregue à linha**: a separação por OP
      (`ops/{op}/separacaoConcluida.itens`) menos a sobra devolvida.
    - Ela fica **desligada por padrão**: nenhuma OP da base usa separação e não há registro de devolução
      de sobra. Sem a devolução, material que voltou ao estoque contaria como perda escondida e puniria
      a linha.
    - Pelo mesmo motivo, a variação de consumo do realizado passa a ser "não medida" quando a baixa foi
      pela ficha, em vez de um zero que parece medição.
12. **Variação não medida somava R$ 0 na consolidação.** Agora é null ("—" na tela e "não medido" no
    total).
13. **Procedência do custo por nível (§6) não existia.** Agora existe, no motor e na tela.
14. **Contagem do turno na TV (§8) não existia.** O servidor grava o turno do dia em
    `resultado/placar/hoje.turno` (a TV não lê `config/`), e a TV conta o que falta.

## 6. Números da base real (`erpkuryos`, 26–28/10)

- 376 SKUs. LP completo em **0** hoje: só 12 materiais têm preço (10 PAGO de PC e 2 ESTIMADO P&D com
  de-para confirmado).
- Densidade: 15 no cadastro + **163 pela especificação**.
- BOM aprovada: 3 SKUs. 1.289 OPs concluídas; 2 delas de SKU com BOM aprovada; 0 com separação por OP.
- Consumo apontado: 36 OPs com consumo de envase (pela ficha); 0 pesagens de granel.
- De-para P&D → cadastro: 170 ingredientes com preço; 25 casam por nome exato.
- Orçamento aprovado PRF-JOHN-0001 vendido pelo custo dos insumos: **LP do orçamento negativo**.
- Última OP da base: 21/09.

## 7. Pendências que não são de código

| Pendência | Dono | Onde |
|---|---|---|
| ~~Publicar as regras `custos/` e `resultado/`~~ | — | **publicadas em 28/10**, com backup das anteriores; a diferença era só o acréscimo |
| % de impostos (padrão e por cliente) | Financeiro / contador | Custos › Parâmetros |
| Folha da produção e custos fixos do mês | diretoria | Custos › Parâmetros |
| Preços: os 66–101 primeiros da fila fecham de metade a dois terços do volume | Compras | Custos › Pendências |
| Confirmar o de-para do P&D | P&D / Compras | Custos › Pendências |
| Fator, % alvo, faixas e base do bônus | diretoria, pela simulação | Custos › Resultado |
| Forma legal do bônus (PLR, Lei 10.101/2000) | RH + contador | fora do sistema |
| Usuário da TV (papel `tv`) | ADM | Usuários |
| Separação por OP + devolução de sobra, para ligar a conferência de consumo | operação (e uma tela de devolução, em `MELHORIAS_FUTURAS.md`) | — |
| Virada da fábrica para o `erpkuryos` | operação | sem ela, realizado e placar não andam |

## 8. Verificação

- Motores:
  - `run_custos_test.js`: 113 asserções;
  - `run_custos_v2_test.js`: 121;
  - `run_resultado_pontos_test.js`: 112.
- Servidor: `run_custos_servidor_test.js`, 16 casos (o placar agora confere o turno do dia).
- Regras:
  - `run_custos_resultado_rules_test.js`: 42 verificações, emulador `demo-custos`.
  - No ar em 28/10, idênticas ao repositório; acesso anônimo a `custos/` e `resultado/placar` recebe 401.
- Contrato do Render: `run_render_functions_test.js`, 14/14.
- E2E (emuladores + Chrome, base real semeada, inclusive `movimentos_estoque`): **40 verificações,
  0 falhas**. Cobre:
  - as 7 abas e a ficha;
  - a origem do material no Realizado;
  - a conferência de consumo em Parâmetros;
  - gravações por caminho plano;
  - a simulação;
  - largura de 375 px;
  - PCP barrado;
  - TV com número e sem R$.
- Ensaios contra a base real: `ensaio_consumo.js` e `ensaio_realizado.js` (scratchpad).

## 9. Próximos módulos

- Financeiro: `PROMPT_FINANCEIRO.md`.
- Controladoria: `PROMPT_CONTROLADORIA.md`.

Os dois são independentes e não exigem função nova em outro módulo.
