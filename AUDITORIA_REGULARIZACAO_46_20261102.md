# Auditoria da regularizacao das 46 referencias importadas

Data da execucao: 02/11/2026

Projeto de destino: `erpkuryos`

Execucao: `reconcile-f3a6238cce852802`

Estado: **APLICADO E VERIFICADO**

## Escopo e fonte

A fonte de negocio foi o export integral do sistema oficial `prod-kuryos`,
clonado em 01/11/2026 depois do corte solicitado de 30/10/2026. O arquivo
usado foi `prod-kuryos-default-rtdb-export (1).json`, SHA-256
`E29F53144DB5D7BF6F643A47C83C445A6C6EF054B6614791C094C4B3D718971D`.

A fotografia do `erpkuryos` antes da mudanca tem SHA-256
`AF41F3E33C34A6D17B7A92332A916F59EDA44B715649B7ED6F36BA53ACDF01FB`.
O navegador automatizado nao estava disponivel nesta sessao; por isso a
evidencia foi obtida do export integral autorizado e das leituras autenticadas
do banco, sem depender de transcricao visual da tela.

## Diagnostico

As 46 revisoes nao representavam 46 produtos ausentes. O importador tratava
qualquer `codProduto`/`sku` que nao fosse chave direta de `produtos` como
orfao. Isso produziu tres classes de falso positivo:

1. SKUs historicos que ja eram aliases oficiais ou tinham equivalencia
   univoca no sistema oficial;
2. especificacoes com `tipoItem=MATERIAL`, cujo codigo existe em `materiais`;
3. placeholders `-` em OPs concluidas, com produto identificavel pela
   descricao oficial unica.

Tambem havia duas cadeias de rename nao achatadas, apesar do contrato da tela
de Cadastros exigir um salto unico: `BSP-SEUN-0001` e
`PRF-FEBELLABEAUTY-0001` ainda apontavam para SKUs intermediarios.

## Decisoes aplicadas

| Referencia original | Destino oficial | Revisoes | Evidencia principal |
|---|---:|---:|---|
| `AGBE-SEUN-0001` | `PEL-SEUN-0002` | 3 | `sku_historico` e `skusAnteriores` oficiais |
| `AGUA-DE-BELEZA-100ML` | `PEL-SEUN-0002` | 1 | alias oficial |
| `AGU-SEUN-0001` | `PEL-SEUN-0002` | 1 | pedido AGUA DE BELEZA 100ML + alias oficial equivalente |
| `BSP-SEUN-0001` | `BSPL-SEUN-0002` | 8 | cadeia oficial de dois renames, achatada |
| `PRF-FEBELLABEAUTY-0001` | `PRF-FEBELLABEAUTY-0010` | 3 | cadeia oficial via `FBBS0005`, achatada |
| `bbpf0004` | `BBPF0004` | 1 | mesma chave sem diferenca de caixa + PERFUME CAPILAR ZAHRA |
| `IMEDIATT LISS PASSO 1` | `IMEDIATT-LISS-PASSO-1` | 1 | descricao oficial exata normalizada |
| `IMEDIATT LISS PASSO 2` | `IMEDIATT-LISS-PASSO-2` | 1 | descricao oficial exata normalizada |
| `-` em OPs de IMEDIATT LISS PASSO 2 | `IMEDIATT-LISS-PASSO-2` | 11 | descricao oficial unica; sem criar alias global `-` |
| `SRM-SEUN-0002` | `FIRMADOR-200ML` | 1 | descricao exata no pedido e no cadastro oficial |
| `DPHSBS02` | `DPHNBS02` | 1 | familia DAPOP HONEY + especificacao aprovada em 30/10 |
| `FEBS0003` | `FBBS0003` | 1 | sequencia FEBELLA + BODY SPLASH AMBER BLOOM 200ML |
| `FEBS0004` | `FBBS0004` | 1 | expedicao oficial + BODY SPLASH OUD NIGHT 200ML |
| `FEBS0005` | `PRF-FEBELLABEAUTY-0010` | 1 | expedicao liga a `FBBS0005`; rename terminal oficial |
| `MRARBS010` | `MRARBS10` | 1 | codigo com zero legado + BODY SPLASH AMBAR REAL 200ML |
| `MPES-00087`, `MPES-00089`, `MPES-00142`, `MPGR-00008`, `MPGR-00011`, `MPGR-00014`, `MPGR-00039`, `MPGR-00049`, `MPGR-00066`, `MPGR-00127` | os proprios materiais | 10 | `tipoItem=MATERIAL` e cadastro oficial existente |

Total: **46 de 46** com decisao comprovada; **zero** item inventado.

## Estrategia de gravacao

- Os 46 registros historicos em `ops`, `pedidos`, `formulas`, `bom` e
  `especificacoes` foram preservados integralmente.
- Cada pendencia recebeu status `RESOLVIDA`, destino canonico, valor original,
  metodo e evidencia do corte oficial.
- Doze aliases novos/corrigidos foram gravados em `sku_historico` e nos
  `skusAnteriores` dos produtos terminais. Dois aliases ja estavam corretos e
  nao geraram escrita.
- O valor `-` nao foi cadastrado como alias, pois e um placeholder generico.
- A aplicacao usou `database:update` multipath com `--project erpkuryos`,
  `--disable-triggers`, precondicoes contra fotografia ao vivo e dois lotes.

O plano continha 346 campos: 322 de trilha das pendencias, 12 aliases e 12
marcacoes em `skusAnteriores`. O backup e o checkpoint estao em
`scratch/reconciliacao-46/reconcile-f3a6238cce852802/`.

## Verificacao posterior

Leitura autenticada depois da aplicacao:

- referencias importadas: 46;
- abertas: **0**;
- resolvidas: **46**;
- resolvidas com evidencia `prod-kuryos`: **46**;
- aliases apontando para produto inexistente: **0**;
- destinos de pendencia inexistentes: **0**;
- registros historicos comparados antes/depois: 46;
- registros historicos alterados: **0**;
- segunda execucao: 0 pendencias abertas e 0 campos planejados.

A proveniencia foi registrada em
`importacoes_dados/reconcile-f3a6238cce852802` com status `APPLIED`, 346
campos e tool version `reference-reconciliation-1.0.0`.

## Correcoes preventivas no codigo

1. O importador agora reconhece chaves de `sku_historico` como referencias
   validas de produto.
2. Especificacoes `tipoItem=MATERIAL` sao validadas em `materiais`, nao em
   `produtos`.
3. A baixa automatica da barra de pendencias aplica as mesmas duas regras.
4. A reconciliacao e fail-closed: qualquer codigo sem evidencia interrompe o
   plano inteiro antes da escrita.

Validacao automatizada: 23 testes aprovados, incluindo idempotencia,
concorrencia, rollback, alias historico, especificacao de material, placeholder
seguro e recusa de referencia sem evidencia.
