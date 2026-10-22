# Auditoria AUD-01 — Pacote 21/10/2026

Item AUD-01 do `PROMPT_ENGENHARIA_PACOTE_20261021.md`. Data: 22/10/2026. **Nenhuma
linha de código de produção foi alterada nesta auditoria.** Medições feitas só com
leitura, pela CLI do Firebase, no banco `erpkuryos`. Cópias no scratchpad da sessão;
nada gravado em produção.

O status de cada item com `arquivo:linha` está na Parte A (mapa A.4 e seções de cada
item) e na Parte B do prompt. Este relatório traz o que faltava: o fluxo desenhado, as
listas campo a campo e as **medições na base**.

Caminhos de código: `crm-frontend/src/...` (fonte React do CRM, neste repo desde o
INF-01) e `public/...` (PCP).

---

## 1. Fluxo atual

Diagrama na seção 2 do `RFC_001_PROJETO_KICKOFF_PARALELO.md` (amostra → Kickoff →
aprovações → cotação → orçamento → CGI → SKU → pedido → OP), com os pontos de código.

## 2. Ingrediente × MP nova × material do Cadastros (AMO-04)

| Dado | Linha de ingrediente (P&D) | MP nova (P&D → fila) | Material (Cadastros) |
|---|---|---|---|
| Nome | `ingredient_name` | `mp_nova.nome` → `nome` | `mpNome` |
| Tipo | — | `mp_nova.tipo` (MPGR/MPES) → `tipo` | `tipo` (MPGR, MPES, EP, ES, ET, MU…) |
| INCI | `inci` | → `inci` | `inci` (MPGR em `fInci-mat`, MPES em `fInciFrag-mat`; mesmo campo gravado) |
| Função | `function` | **não vai** | `funcaoFormula` (só MPGR) |
| Fornecedor | `fornecedor` (texto) | → `fornecedor` (texto) | `fornecedores/{key}/{nomeComercial, codigoFornecedor, custoReferencia}` (mapa por fornecedor homologado) |
| Preço R$/kg | `price_per_kg` | **não vai** | `fornecedores/{key}/custoReferencia` |
| Preço US$/kg | `price_usd`, `price_currency` | **não vai** | `custoTargetUsd` (só MPES) |
| Fase | `phase` | — | — (é da fórmula, não do material) |
| % | `percentage` | — | — (é da fórmula) |
| Vínculo ao cadastro | `catalog_id`, `material_key`, `material_codigo` | — | chave `materiais/{key}`, `mpCodigo` |
| Densidade, cor, aparência | — | — | `densidade`, `cor`, `aparencia` (MPGR) |
| Casa de fragrância | — | — | `casaFragrancia` (MPES) |

Origens: `PDDetail.js:1973`, `2105`; `lib/filaCadastroMp.js:15–22`;
`public/cadastros.html:400–423`, `2645–2652`, `2700–2736`.

**Conflitos:**
1. função e preços se perdem na ida para o Cadastros;
2. fornecedor é texto no P&D e mapa de homologados no Cadastros;
3. US$ só existe no Cadastros para MPES;
4. fase e % não são do material e não devem ir para o esquema dele.

## 3. Opções dos componentes do Kickoff (KO-04)

Não há texto livre com barras dentro dos campos. **As opções estão nos rótulos** das 21
linhas padrão (`KickoffCompositionQuestionnaire.js:8–34`):

- **Bloco 2 (primária):**
  - Frasco / pote / bisnaga;
  - Airless / roll-on / ampola;
  - Tampa (rosca / flip-top / pressão);
  - Válvula pump / bomba dosadora;
  - Válvula spray / atomizador;
  - Válvula aerossol + atuador;
  - Gatilho / trigger;
  - Batoque / redutor / orifício;
  - Lacre de indução / disco de vedação;
  - Aplicador (pincel / espátula / esponja).
- **Bloco 3 (secundária):**
  - Rótulo (frontal / contra);
  - Cartucho;
  - Bula / folheto;
  - Selo / lacre de segurança;
  - Celofane / shrink;
  - Berço / suporte interno.
- **Bloco 4 (terciária):**
  - Display / expositor de PDV;
  - Caixa de embarque (master);
  - Divisória / separador / colmeia;
  - Cantoneira;
  - Especificação de paletização.

**Achado que reduz o KO-04:** o Cadastros **já tem atributos por tipo de embalagem**
(`cadastros.html:2077–2110` e formulários `426+`):
- EP (primária): formato, gargalo/rosca, material/resina, cor, textura (lisa, estriada,
  fosca, brilhante, outra), fixação (rosca, recrave, easy lock, outra), volume nominal,
  volume interno, altura, diâmetro, peso;
- ES/ET (secundária/terciária): material, cor, comprimento, largura, altura, peso.

O catálogo `config/tipos_componente` deve **reutilizar esses mesmos campos**, com uma
fonte só: o que o Kickoff especifica é o que o Cadastros cadastra e o que Compras cota.

## 4. Etiquetas de retrabalho (PCP-01)

Não encontradas: nem no PCP, nem no backend antigo, nem no ERP atual (detalhe na
seção A.10b do prompt). **Adiado para a Onda 6, aguardando instruções.**

## 5. Usuários sem `tenant_id` (INF-03, correção pela operação)

Leitura de `usuarios/` em 22/10: **17 perfis.** A regra de `erp/kuryos/*` libera ADM ou
`tenant_id = kuryos`. ADMs passam sem tenant.

| Situação | Perfis |
|---|---|
| Com tenant | Yasmim Fantini (pcp), ana paula (pd), Gustavo Callegaro (admin, 1 dos 2 perfis), Marlos Gomes (pending) |
| ADM sem tenant (passam pela regra) | vicenzo callegaro, Gustavo Callegaro (2º perfil), Administrador Kuryos, Lucca De Camillis Lestingi |
| **Operam o fluxo e estão sem tenant** | **Adlai Alberto Santos Junior** (pcp, 2 perfis), **Diego Costa** (pcp, faz Compras), **Roberta Ramos** (qualidade: aprova o CQ do Kickoff) |
| Sem tenant, fora do fluxo do CRM | Robert Briz (production), rotulagem |
| Pendentes (sem acesso) | Roberta Ramos (2º perfil), Bruna Araujo, Rodolfo Lima de Sousa |

**Passo a passo para a operação**, para cada nome em negrito: Usuários → Funções do
usuário → marcar a função (PCP ou Qualidade) → Salvar. O cálculo grava
`tenant_id = kuryos` quando a função é admin, pcp, comercial, pd ou qualidade
(`public/usuarios.html:788`). Não precisa de código.

**Achado:** há perfis duplicados (Adlai ×2, Gustavo ×2, Roberta ×2). Vale a operação
conferir qual é o login em uso e desativar o outro.

## 6. Medições na base

### 6.1 Prontidão para a trava da OP (PCP-02)

| Medida | Valor |
|---|---|
| Produtos ativos | **330** (de 387) |
| Ativos com fórmula cadastrada (`formulas/{SKU}__vN`) | 141 |
| Ativos com fórmula **aprovada** | 4 |
| Ativos com **Fórmula + BOM + Especificação aprovadas** | **1** (PRF-BIOF-0002) |
| Status das fórmulas (199) | 183 RASCUNHO · 10 sem status · 6 APROVADA |
| Status dos BOMs (248) | 24 RASCUNHO · 220 sem status · 4 APROVADA |
| Status das especificações (215) | 23 RASCUNHO · 188 sem status · 4 APROVADA |
| Produtos nascidos no CRM (`origemCrm`) | 2 (PRF-JOHN-0001, PRF-TEST-0001) |

**Conclusão:** a trava dura de "100%" aplicada ao legado pararia 329 dos 330 produtos.
Confirma a virada em duas etapas do PCP-02:
1. trava dura só para SKU com `origemCrm`;
2. legado com aviso, até a Qualidade e o Cadastros aprovarem as três peças por produto.

Antes de virar a etapa 2, esse passivo de aprovação é um trabalho de operação.

### 6.2 Materiais duplicados (CAD-01)

939 materiais, 696 ativos (EP 192, ES 326, ET 67, MPES 211, MPGR 141, MU 2).

**Nome normalizado** (sem acento, caixa e pontuação) **repetido entre ativos: 9 grupos,
20 materiais.**

| Nome | Códigos |
|---|---|
| VALVULA SPRAY R 24 410 BODY SPLASH 120ML | EP-00002, EP-00034 |
| FRASCO PET GRAVADO R 24 410 300ML | EP-00089, EP-00090 |
| FRASCO BODY SPLASH C RECRAVE R 24 410 200ML | EP-00132, EP-00133 |
| BISNAGA 35X150 100G BRANCO | EP-00170, EP-00171, EP-00172, EP-00173 |
| TAMPA SOBRETAMPA HIDRA SANGEL 200ML | ES-00010, ES-00014 |
| ROTULO BODY SPLASH LEAO DO DESERTO BOURBON 200ML | ES-00147, ES-00148 |
| ROTULO BODY MIST TESOURO DO OASIS 250ML | ES-00188, ES-00195 |
| ROTULO BODY MIST NEVOA ENCANTADA 250ML | ES-00194, ES-00196 |
| GLICERINA | MPGR-00008, MPGR-00077 |

Alguns podem ser itens diferentes com o mesmo nome (cor ou fornecedor só na
especificação). A decisão de fundir ou renomear é do Cadastros, item a item; o sistema
não funde sozinho.

**O INCI não serve como chave única.** 180 ativos têm INCI e 10 INCIs se repetem de
forma legítima:
- **PARFUM** em 90 fragrâncias;
- **ALCOHOL** em 3 álcoois diferentes;
- nome comercial × químico (Cetiol CC = Carbonato de dicaprilila; Cetiol V = Oleato de
  decila);
- corantes do mesmo CI em tons diferentes.

**Consequência para o CAD-01:**
- o índice de unicidade usa **tipo + nome normalizado**;
- INCI (exceto PARFUM) e código do fornecedor entram só como **sugestão de candidato**;
- no backfill do índice, os 9 grupos acima ficam apontando para o primeiro código e vão
  para a lista de revisão do Cadastros.

### 6.3 Kickoffs (KO-03, KO-05, ARQ-01)

| Medida | Valor |
|---|---|
| Kickoffs | 11 (8 em preenchimento, 3 aprovados); todos na v1 |
| Com questionário de composição | 10 |
| Sim/não dos blocos 1 e 5 (30 respostas) | **16 vazias**, 3 "não", 11 "sim" |
| "Aplicável?" dos componentes (194 linhas) | **168 vazias**, 4 "não", 22 "sim" |
| Kickoffs com BOM | 3 (25 linhas) |

**KO-03:** o banco **guarda vazio** quando ninguém respondeu. O três-estados é
recuperável dos dados; quem confunde vazio com "Não" é só a tela (`normalizeBinary`).
Migração: vazio = não respondido (pendência); "nao" gravado = respondido.

**KO-05:** o "Fornecido por" livre tem: `ok` ×11, `KURYOS` ×5 e **nomes de fornecedor
no lugar** (`PLASTSUL`, `VALVSPRAY` ×2, `GRAFICA X`, `GRÁFICA X`, `SALUTE`). Regra de
migração:
- KURYOS → `kuryos`;
- nome de fornecedor → `kuryos` + fornecedor preenchido com o nome (para Compras
  conferir);
- `ok` → vazio (pendência visível).

### 6.4 Paralelismo e variações (ARQ-01, V2)

- 36 amostras; 11 projetos com variação aprovada.
- 4 projetos com mais de uma variação aprovada (3, 2, 9 e 6 variações).
- **Nenhum com aprovações em datas diferentes.**

Ressalva: as datas são 14 e 15/10, a reconciliação em lote da Fase 1, e não a data
real em que o cliente aprovou. Isso, por si só, mostra a necessidade do COM-02 (data e
hora reais da aprovação). Não há evidência de aprovação escalonada: **a V2 (Kickoff por
SKU) fica fora.**

### 6.5 Projetos e CGI (KO-09, Onda 6)

- 33 projetos: 6 em amostra solicitada, 8 em amostra enviada, 7 em Kickoff, 2 em
  negociação, 4 pedido aprovado, 6 arquivados.
- **6 dos 14 clientes têm mais de um projeto.**
- 4 CGIs (2 assinados, 2 gerados) de 3 clientes; 1 cliente já tem 2.

O CGI por cliente atingiria hoje 6 clientes.

### 6.6 Câmbio (COM-01)

- **Propostas com `cambio_congelado`: 2** (de 5). Na migração, viram 2 registros
  `envio_legado` no histórico dos clientes.
- **Fórmulas do P&D:** as 176 têm `cotacao_usd = 6`, o padrão antigo, e **nenhuma usa a
  opção "fixa"** (a origem é calculada na leitura). Tirar o congelamento do P&D não muda
  o custo de nenhuma fórmula existente.

## 7. Achados fora do escopo

- **Produção do site:** `pcp-kuryos.vercel.app`, publicado pela Vercel a cada push no
  `main`. O `erpkuryos.web.app` serve o ERP antigo. O CLAUDE.md mandava publicar com
  `firebase deploy --project prod-kuryos` (setembro); corrigido em 22/10.
- **Perfis duplicados de usuário** (seção 5).
- **189 dos 330 produtos ativos não têm fórmula no cadastro** (seção 6.1). Trabalho de
  Cadastros, anterior a qualquer trava.
