# Ajuste de saldos da Bioflora ao físico final (16–17/11/2026)

Pedido do Gustavo (16/11, 19:21): "essas são as quantidades da Bioflora, os lotes estão informados
ali — como conseguimos ajustar?". A tabela da esquerda da planilha dele é o **físico oficial** depois
do retrabalho do envase trocado (decisão do Marlos: "pode usar a planilha como o físico oficial e
corrigir apontamento e paletes por ela").

Executado por Claude em 17/11/2026 (~04:30 UTC), projeto `erpkuryos`, com o roteiro do CLAUDE.md:
backup → simulação → **um** palete → conferência → o resto → releitura. Script:
`scripts/ajuste-bioflora-20261116.js` (rodado uma vez; registro do que foi feito).

## 1. O que mudou

Paletes (`estoque_lotes`), 6 un/cx. Lotes com dois paletes e uma linha só na planilha: a diferença foi
para o palete que já tinha a caixa parcial ou o maior (anotado).

| Palete | Lote | Antes | Depois | Δ un |
|---|---|---|---|---|
| PA-26264-06-P1 | 26264/06 Infinity Rouge | 423 cx + 4 = 2.542 | 430 cx + 4 = 2.584 | +42 |
| PA-26264-07-P2 | 26264/07 Infinity Rouge | 336 cx + 5 = 2.021 | 339 cx + 5 = 2.039 | +18 (P1 fica com 144 cx; lote = 483 cx + 5) |
| PA-26264-15-P1 | 26264/15 Lume Blue | 472 cx + 2 = 2.834 | 474 cx = 2.844 | +10 |
| PA-26264-21-P1 | 26264/21 Lumina | 480 cx = 2.880 | 483 cx = 2.898 | +18 |
| PA-26302-01-P1 (GAL-1-3-1) | 26302/01 Rose Absolut | 578 cx + 2 = 3.470 | 243 cx + 2 = 1.460 | −2.010 |
| PA-26264-17-P2 | 26264/17 Rose Absolut | 375 cx = 2.250 | 376 cx = 2.256 | +6 (P1 fica com 384 cx; lote = 760 cx) |
| PA-26315-02-P1 | 26315/02 Sea Saphire | 512 cx = 3.072 | 485 cx = 2.910 | −162 |

Os lotes 26264/16, 26264/10, 26315/03, 26264/14 e 26264/13 já batiam (0).

Apontamento da 26302/01 (o caso do envase trocado):
- registro `registros/2026-10-30/-P5DELvireea04fjuoCc` (Linha 2): 2.358 → **348** (o outro, 1.112, fica);
- `ops/26302-01/produzidoLinha` e `produzido`: 3.470 → **1.460**;
- `pedidos/PED-0001__PRF-BIOF-0006/produzido`: 8.024 → **6.014** (sai o crédito em dobro do Rose).
As 2.010 un eram Sunrise Muse envasadas como Rose e reenvasadas na OP 26264/14 (RNC-2026-011,
RR-26302-01-1). A rotulagem da 26302/01 (3.489) **não** foi mexida: não entra no pedido e é consumo
real de rótulo (vai para a etapa de materiais do registro de retrabalho).

Conferência de PA (`conferencias_pa/{op}`) dos 7 lotes ajustados: a planilha é uma recontagem física
mais nova. `qtdPaletizada` = físico e `conciliacao/diferenca` = físico − apontado. O valor anterior
fica em `recontagens/aj_bioflora_20261116` e a observação recebe o sufixo da recontagem.

Sem isso o motor de consistência abriria **6 RNCs automáticas novas** (saldo descasado de 6 a 162 un):
a simulação pegou isso antes de gravar. Com a recontagem, nenhuma.

Rastro em cada registro (nada foi apagado):
- palete: `ajustesSaldo/aj_bioflora_20261116` {antes, depois, motivo, por, em};
- `movimentos_estoque/{item}/aj_bioflora_20261116_{palete}` (tipo `ajuste`);
- OP: `ajustesProducao/aj_bioflora_20261116`;
- registro: `ajusteProducao` e observação;
- conferência: `recontagens/aj_bioflora_20261116`.

## 2. Conferência depois (releitura da base)

- Os 12 lotes da planilha: palete = conferência = planilha, diferença 0.
- Nenhum palete da Bioflora estava em carga ativa: as cargas anteriores estavam canceladas.
- Motor de consistência sobre a base inteira: só a RNC-CS-26282-03, que já existia (Flor Daura, outro
  cliente).

## 3. Como desfazer

O backup completo dos nós tocados (`estoque_lotes`, `ops`, `pedidos`, `conferencias_pa`, `registros`,
`agendamentos_expedicao`), lido imediatamente antes, ficou na máquina do Marlos, na pasta da sessão do
Claude (`scratchpad/bioflora/backup_*`). Para desfazer, regrave os campos `antes` de cada registro
listado acima, com caminhos planos. Os valores também estão em `ajustesSaldo`, `ajustesProducao` e
`recontagens`. **Nunca** use update com objeto aninhado.

## 4. O que fica com a operação

1. **RNC-PA-26315-02** (Sea Saphire, +162): o físico agora é igual ao apontado (2.910). A Qualidade
   pode encerrar a RNC com essa conclusão.
2. **Granel do Rose** (achado 3 da `AUDITORIA_RETRABALHO_26302_01_20261116.md`): 1.460 Rose pediriam
   cerca de 270 kg de granel Rose; o sistema registra 130 kg. A Roberta precisa confirmar antes do
   despacho.
3. **45 un sem destino** no balanço do retrabalho (3.470 − 1.460 − 1.965): a Qualidade declara no registro
   RR-26302-01-1.
4. **26264/07 e 26264/17**: a diferença foi para um dos dois paletes (P2). Se o físico estiver
   distribuído de outro jeito, ajuste com Montar carga › 🔀 Remontar. O total do lote não muda.
5. Montar as cargas por rota: Montar carga › **Planejar a carga por rota** (PF/GVT 418 cx por produto,
   Sunrise 395). Pela planilha, sobram na 3ª rota: Infinity 77, Lume Blue 249, Lumina 120, Rose 167,
   Sea Saphire 123 e Sunrise 3.
