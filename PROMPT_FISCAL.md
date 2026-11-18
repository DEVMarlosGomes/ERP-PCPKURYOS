# Prompt — Módulo Fiscal: SPED Fiscal (EFD ICMS/IPI) e SINTEGRA (Kuryos, `erpkuryos`)

> Instrução de construção para um dev sênior full stack ou agente de código. Pode ser colada inteira como
> prompt. Escrita em 17/11/2026, depois da paridade da Controladoria com o WebMais
> (`docs/controladoria-webmais-paridade.md`).
> **Nada aqui foi medido na base real**: a sessão que escreveu não tinha acesso ao banco. A Fase 0 mede.
> Módulos irmãos: `PROMPT_CONTROLADORIA.md` e `PROMPT_FINANCEIRO.md`. Todos os módulos se interligam
> **por leitura**.

---

## 0. Seu papel

Você constrói, testa e publica o **Fiscal** da Kuryos: o livro fiscal digital e os dois arquivos que hoje
saem do WebMais (ERPmais5, menu Controladoria › Contábil):
- **SPED FISCAL**: EFD ICMS/IPI, o TXT validado e transmitido no PVA da Receita;
- **SINTEGRA**: arquivo do Convênio ICMS 57/95;
- os relatórios de conferência (registro de entradas, registro de saídas, apuração de ICMS e de IPI);
- o **relatório de inconsistências**, igual ao do WebMais.

O objetivo é que a Kuryos possa desligar o WebMais **sem que o contador perceba diferença**. O critério de
pronto é o arquivo daqui validar no PVA e bater, registro a registro, com o arquivo que o WebMais gera para
o mesmo mês (§12).

Trabalhe como consultor de implantação fiscal (TOTVS Livros Fiscais / SAP SD-MM + Mastersaf). Quem
assina e transmite é o contador; você entrega o arquivo certo e mostra por que ele está certo.

Leia antes, nesta ordem:
1. `CLAUDE.md`, `AGENTS.md`, `AGENT_STATUS.md` e este prompt;
2. `docs/controladoria-webmais-paridade.md` (prints do WebMais descritos);
3. `PROMPT_FINANCEIRO.md` e a F5 do Financeiro (`lerXmlNfe`, `fin/notas_entrada`, `run_financeiro_nf_xml_test.js`):
   o que já se lê do XML;
4. `shared/kardex.js` (as duas razões do estoque);
5. `PROMPT_CONTROLADORIA.md` §2 e §13 (restrições e lições que valem aqui também).

Registre seu escopo no `AGENT_STATUS.md`.

---

## 1. O que o WebMais faz hoje (dos prints de 17/11/2026)

**SPED FISCAL** (`ct008`):

| Campo da tela | Opções vistas | Para onde vai |
|---|---|---|
| Empresa | 1 - KURYOS BEAUTY PACKING INDUSTRIAL LTDA | |
| Tipo de arquivo | "Importação Sis…" (texto cortado; ver §13 P6) | |
| Finalidade | 0 - Remessa do arquivo original | 0000 COD_FIN (1 = substituto) |
| Tipo de atividade | Industrial ou equiparado a industrial | 0000 IND_ATIV = 0 |
| Período | inicial e final | |
| Gerar informação de inventário | checkbox | Bloco H |
| Gerar registro C170 de notas fiscais com emissão própria | checkbox | exceção 2 do Guia Prático (§6) |

Botões: **Exportar** e **Novo**. Com erro, abre o **RELATÓRIO DE INCONSISTÊNCIAS SPED FISCAL**, com as
colunas GRUPO, IDENTIFICADOR, SEQ e DESCRIÇÃO DO ERRO. Erros reais vistos em nov/2026:
- Contabilista: "CPF do contabilista não informado" e "CRC do contabilista não informado" (registro 0100);
- Nota de entrada: 7 notas (376202, 4614, 366615, 366045, 35200, 4643, 1199) com "Todas as CFOPs dos itens
  devem estar definidas para gerar livro. CFOP 1.101-A : NÃO".

Ou seja, o WebMais exige que cada CFOP de entrada (com sufixo de variante, como "1.101-A") tenha a
marcação "gera livro". Aqui isso vira a **regra fiscal de entrada** (§5.3).

**SINTEGRA** (`ct007`): período, finalidade (Normal), "Gerar informação inventário", "Data saldo" e o botão
**Gerar**.

**Exportação Fiscal - Domínio Sistemas**: período, "Layout configurado: Não configurado" e "Empresa destino:
000". A Kuryos nunca configurou; ver §13 P5.

---

## 2. Obrigatoriedade: o que a lei pede da Kuryos (confirmar com o contador na Fase 0)

- **EFD ICMS/IPI.** Contribuinte de SP fora do Simples Nacional entrega mensalmente. Leiaute por período:
  **020** para 2026 (NT 2025.001, Guia Prático 3.2.x); **021** a partir de janeiro de 2027 (NT 2026.001,
  Guia 3.2.3). O código da versão vai no 0000 e muda por período. Guarde-o numa tabela, não espalhe pelo
  código.
- **SINTEGRA em SP.** Quem é obrigado à EFD está **dispensado** do SINTEGRA desde 2010 (Portaria CAT
  32/1996, art. 1º-A; Respostas à Consulta SEFAZ-SP 26370/2022 e 32803/2025). Optante do Simples só entrega
  se notificado. O WebMais tem a tela, então o SINTEGRA entra (pedido do Marlos), mas **depois** da EFD e
  como derivado do mesmo livro: custa pouco quando o livro existe.
- **GIA-SP / GIA-ST.** Dispensadas para quem entrega a EFD (GIA-ST desde julho/2025, Portaria SRE 6/2025).
  Não construir.
- **Bloco K** (produção e estoque). A escrituração é obrigatória para indústrias das divisões CNAE 10, 19,
  20, 21, 24 e 25 com faturamento anual de pelo menos R$ 300 milhões (Ajuste SINIEF 25/2022). A Kuryos
  (cosméticos, divisão 20) quase certamente está abaixo: K001 com IND_MOV = 1. **Confirmar.**
- **Bloco H** (inventário). É obrigatório: na EFD de fevereiro, com o estoque de 31/12, e quando o fisco
  pedir. O checkbox "Gerar informação de inventário" do WebMais é isto.
- **Reforma tributária.** Em 2026 o C100 e o C190 não mudam por causa de CBS/IBS/IS (Guia Prático, seção
  10). Leia os campos novos do XML, guarde-os e não os misture ao ICMS.
- **CNPJ alfanumérico.** A partir do leiaute de 2026 os campos de CNPJ viram tipo C, e os CNPJs com letras
  começam a ser emitidos. **Não use `soDigitos` em CNPJ** (o Financeiro usa: ver §13 P8). O CNPJ é uma
  string de 14 caracteres `[0-9A-Z]`.

---

## 3. Restrições invioláveis

1. **O documento fiscal é a fonte, não o cadastro.** Os cadastros daqui não têm IE, código IBGE do
   município, NCM nem CST (medido no código em 17/11: clientes e fornecedores têm `cnpj`, `uf`, `cidade` e
   `cep`). Tudo isso vem do **XML** da NF-e e do CT-e. Não peça para digitar o que o XML já traz.
2. **Nenhuma função nova em outro módulo.** Financeiro, Faturamento, Compras, Custos e Controladoria não
   mudam. O Fiscal lê. As únicas exceções são o encanamento de acesso (página em `KURYOS_MODULOS`, regras
   `fis/`) e o que §13 decidir. Se parecer indispensável mudar fora, pare e pergunte.
3. **XML é imutável e guardado.** O XML autorizado é guardado inteiro (a guarda legal é de 5 anos) e
   nunca editado. Correção fiscal é evento (carta de correção, cancelamento) ou nota nova, nunca edição do
   registro. O livro é **derivado** dos XMLs e das regras; mudar uma regra re-deriva o livro, com versão.
4. **Período fiscal fechado não muda.** Use o `ctl/bloqueio_periodo` (módulo FISCAL, já existe) e um
   fechamento próprio do mês fiscal (`fis/fechamentos`). Arquivo transmitido = retrato guardado (hash e
   conteúdo). Retificar = arquivo com COD_FIN = 1, nunca sobrescrever o original.
5. **Arquivo nunca sai pela metade.** Com qualquer inconsistência impeditiva, o arquivo não é gerado e
   abre o relatório de inconsistências. Avisos não impedem.
6. **Centavos inteiros** no motor. Formatação do SPED: vírgula decimal, sem separador de milhar, datas
   `ddmmaaaa`, `|` como delimitador, CRLF no fim de cada linha, ISO-8859-1. Formatação do SINTEGRA:
   posições fixas de 126 caracteres.
7. **Idempotência** pela chave de 44 dígitos: importar o mesmo XML duas vezes não duplica.
8. **Valor ausente nunca vira zero.** Item sem NCM, CST ou CFOP de entrada sem regra é **inconsistência**,
   não zero inventado.
9. **Caminhos planos** em todo `update` no RTDB. **Nunca `git add -A`.**

---

## 4. O que existe hoje e o que falta (medir na Fase 0)

| Precisa | Hoje | Lacuna |
|---|---|---|
| NF-e de entrada (C100/C170/C190, 0150, 0190, 0200) | Financeiro F5 importa o XML e guarda **resumo** em `fin/notas_entrada/{chave}`: emitente, totais, duplicatas e itens só com código, descrição, qtd, un, valor e CFOP | Sem impostos (CST, BC, alíquota, ICMS, ST, IPI), sem NCM, sem IE ou município do emitente, sem o XML bruto. **Não serve para o SPED.** |
| NF-e de saída (emissão própria) | Faturamento registra à mão número, série, valor, data e chave (`faturamento-tela.js`). A NF é emitida **fora** daqui (provavelmente no WebMais) | **Falta o XML de saída.** Sem ele, nada de saída no SPED |
| Cancelamento, CC-e, inutilização | — | Eventos do XML (`procEventoNFe` 110111 cancela, 110110 é CC-e) e XML de inutilização |
| CT-e de frete tomado (D100/D190) | — | Importar o XML do CT-e |
| Energia (C500 / NF3e mod. 66) e água | Despesa no Financeiro (elementos 1600 água e 1601 luz) | Documento fiscal: XML NF3e ou digitação (§13 P4) |
| Inventário (H010) | Estoque físico em `estoque`/`estoque_lotes`/kardex; custo em `custos/` | Quantidade por item fiscal + custo unitário em 31/12 |
| Produção (K200/K230/K235) | OPs, apontamentos, consumo no razão de custos | Só se o Bloco K for exigido (§2) |
| Contabilista (0100) | — | Cadastro: nome, CPF, CRC, CNPJ do escritório, endereço, e-mail |
| Estabelecimento (0000/0005) | CNPJ 00.767.554/0001-19, Lagoa Tai Grande 1130, Vl Carmozina, São Paulo/SP (do cabeçalho do WebMais) | IE, CNAE, código IBGE 3550308 e perfil (A/B/C, normalmente A em SP) |

---

## 5. Modelo de dados (nós novos, todos em `fis/`)

```
fis/estabelecimento            {cnpj, ie, im, nome, fantasia, endereco{...}, codMun, uf, cnae, perfil:'A',
                                 indAtiv:0, regime, contabilista{nome,cpf,crc,cnpj,cep,end,num,fone,email,codMun}}
fis/documentos/{chave}         documento fiscal normalizado (NF-e 55, NFC-e 65 se houver, CT-e 57, NF3e 66)
                                 {modelo, serie, numero, chave, emissao, entradaSaida (data E/S), indOper 0|1,
                                  indEmit 0 própria | 1 terceiros, participante{cnpj|cpf, ie, nome, codMun, uf, pais},
                                  situacao (COD_SIT 00 regular, 02 cancelado, 05 inutilizado, 06 complementar, 08 regime especial),
                                  totais{vProd,vFrete,vSeg,vDesc,vOutro,vBC,vICMS,vBCST,vST,vIPI,vPIS,vCOFINS,vNF, ibs,cbs,is},
                                  itens[{n, cProd, xProd, ncm, cest, cfop, un, qtd, vUnit, vProd, vDesc, vFrete,
                                         icms{orig,cst|csosn,modBC,vBC,pICMS,vICMS,pRedBC,vBCST,pST,vST},
                                         ipi{cst,cEnq,vBC,pIPI,vIPI}, pis{cst,...}, cofins{cst,...}, ibsCbs{...}}],
                                  eventos{...}, importadoEm, importadoPor, origem:'UPLOAD'|'FIN_F5'|'DFE', hashXml}
fis_xml/{chave}                XML bruto (gzip+base64). Raiz SEPARADA, lida só pelo servidor: a tela nunca escuta
                                 isto (tamanho). Medir se cabe no RTDB ou se vai para disco da VPS (§13 P7).
fis/regras_entrada/{id}        regra de escrituração da entrada: (CFOP do fornecedor [+ CST] [+ NCM] [+ fornecedor])
                                 → {cfopEntrada, geraLivro:true|false, creditaICMS, creditaIPI, tipoItem, finalidade,
                                    codItemInterno?}. É o "CFOP 1.101-A gera livro" do WebMais.
fis/itens/{codigo}             0200 do item: {descr, codBarra, un, tipoItem (00 revenda, 01 MP, 02 embalagem,
                                 03 em processo, 04 acabado, 05 subproduto, 06 intermediário, 07 uso e consumo,
                                 08 ativo, 09 serviço, 10 outros insumos, 99 outras), ncm, exIpi, codGen, cest,
                                 aliqIcms, vinculo{material|produto|sku}} + 0220 conversões de unidade
fis/de_para_itens/{cnpjForn}/{cProd}  item do fornecedor → item interno (0200) + fator de conversão
fis/apuracao/{AAAA-MM}         E110/E520 calculados + ajustes E111/E113/E115/E116 informados (códigos da tabela 5.1.1 SP)
fis/fechamentos/{AAAA-MM}      status, quem e quando
fis/arquivos/{AAAA-MM}/{id}    {tipo:'EFD'|'SINTEGRA', codFin, versaoLeiaute, geradoEm, geradoPor, hash,
                                 qtdLinhas, totaisPorRegistro, transmitidoEm?, recibo?} + conteúdo em fis_arquivos/{id}
fis/inventarios/{AAAA-MM-DD}   retrato do H010 (item, un, qtd, vUnit, vItem, indProp 0|1|2, participante?, conta contábil)
```

Regras (`database.rules.json`): leitura para o módulo `fiscal` e a diretoria; escrita **só pelo
servidor** (callables) em `fis/documentos`, `fis_xml`, `fis/apuracao`, `fis/arquivos` e `fis/fechamentos`;
escrita pela tela, com validação, em `fis/estabelecimento`, `fis/regras_entrada`, `fis/itens` e
`fis/de_para_itens`. Teste no emulador (`run_*_rules_test.js`), como os outros módulos.

---

## 6. Motor (funções puras: `public/shared/fiscal.js` + cópia byte a byte em `functions/`)

1. **`lerNfeCompleta(xml)`**: parser completo da NF-e 4.00. Todos os grupos `ICMSxx`/`ICMSSNxxx`, IPI,
   PIS/COFINS, ST, FCP, DIFAL, os campos de IBS/CBS, eventos e protocolo (cStat 100/150 autorizado;
   101/151/135 cancelamento). Reaproveite as funções de tag do `financeiro.js` copiando, não importando
   (restrição 2). Teste com XML de verdade (§9).
2. **`lerCte(xml)`**: CT-e 4.00 → D100 (tomador = Kuryos: indOper 0; emitente = transportadora), D190 por
   CST/CFOP/alíquota.
3. **`escriturarEntrada(doc, regras, itens, dePara)`** → `{ok, linhas, inconsistencias}`:
   - CFOP do fornecedor → CFOP de entrada pela regra. Sem regra: inconsistência "CFOP x sem regra (gera
     livro?)", o mesmo erro do WebMais;
   - item → 0200 pelo de-para;
   - créditos conforme a regra (uso e consumo e ativo: sem crédito de ICMS no C170 de uso e consumo; CIAP
     é fase posterior).
4. **`escriturarSaida(doc, itens)`**: emissão própria. C100 + C190. C170 só quando a opção "Gerar C170 de
   emissão própria" estiver marcada **e** o Guia permitir (exceção 2: NF-e própria leva C100 e C190, e
   C170 só junto de registros como C176/C180).
5. **`livro(mes)`**: registro de entradas e de saídas por CFOP × CST × alíquota (C190) e a conferência
   Σ C190 = C100 por documento.
6. **`apurarIcms(livro, ajustes)`** → E110 (débitos, créditos, saldo credor anterior, a recolher, saldo
   credor a transportar, E116 obrigações). **`apurarIpi`** → E520/E530 (período mensal). ST/DIFAL
   (E200/E300) só se houver operação: medir.
7. **`gerarEfd(mes, opcoes)`** → `{ok, texto, inconsistencias, totaisPorRegistro}`. Blocos na ordem
   0, B, C, D, E, G, H, K, 1, 9:
   - 0000 com versão do leiaute por período, 0001, 0002 (industrial), 0005, 0100 (contabilista), 0150
     (participantes usados), 0190 (unidades usadas), 0200 (itens usados) e 0220, 0400 (naturezas usadas),
     0450 (informações complementares), 0990;
   - B001 IND_MOV = 1 (o Bloco B é do DF);
   - C001, C100, C170, C190, C195/C197 (se houver ajuste por documento), C500/C590 (energia), C990;
   - D001, D100, D190, D990;
   - E001, E100, E110, E111, E116, E500, E510, E520, E990;
   - G001 IND_MOV = 1 até existir CIAP;
   - H001, H005, H010 quando "gerar inventário" (e obrigatoriamente na EFD de fevereiro), H990;
   - K001 IND_MOV = 1 (ou K010 + K100 + K200… se o Bloco K for exigido), K990;
   - 1001, 1010 (indicadores S/N, todos obrigatórios), 1990;
   - 9001, 9900 (um por tipo de registro, inclusive o próprio 9900), 9990, 9999.

   Os registros 0150/0190/0200/0400 listam **só o que foi usado** no período (o PVA rejeita sobra e falta).
8. **`gerarSintegra(mes, opcoes)`**: Convênio 57/95, registros de 126 posições:
   - 10 e 11 (estabelecimento e contato);
   - 50 (por documento × CFOP × alíquota);
   - 51 (IPI);
   - 53 (ST);
   - 54 (itens, com 991/992 de frete/despesas);
   - 74 (inventário, quando marcado, com a "data saldo");
   - 75 (itens usados);
   - 90 (totalizador).

   Finalidade: 1 normal, 2 retificação total, 3 aditiva, 5 desfazimento. Sai do **mesmo livro** que a EFD:
   nenhuma regra fiscal própria.
9. **`inconsistencias(mes)`**, com as mesmas colunas do WebMais (Grupo, Identificador, Seq, Descrição):
   - contabilista sem CPF ou CRC;
   - estabelecimento sem IE, CNAE ou IBGE;
   - CFOP de entrada sem regra;
   - item sem NCM ou tipo;
   - participante sem código de município;
   - documento sem XML;
   - nota do Financeiro (`fin/notas_entrada`) ou do Faturamento sem documento fiscal correspondente, e o
     contrário;
   - Σ itens ≠ total;
   - chave inválida (DV);
   - CNPJ/CPF inválido (DV, aceitando o alfanumérico);
   - período bloqueado;
   - mês sem inventário em fevereiro.

   Separe **impeditivo** de **aviso**.

---

## 7. Fases (cada uma publicada e útil sozinha)

| Fase | Entrega | Pronto quando |
|---|---|---|
| **F0 — Medir e decidir** | Ler a base real (somente leitura): quantas NF-e de entrada e saída por mês, CT-e, energia; amostra de XMLs reais; regime tributário; respostas de §13 com o Gustavo e o contador; o arquivo SPED que o WebMais gerou para um mês fechado (ex.: out/2026) | §13 respondido por escrito no `AGENT_STATUS.md`; amostras guardadas como fixture anonimizada |
| **F1 — Documentos fiscais** | Página `fiscal.html`, aba Documentos: upload de vários XML/ZIP (NF-e entrada e saída, CT-e, eventos), parser completo, `fis/documentos` + `fis_xml`, lista por mês com situação e filtros, detalhe com impostos por item | 1 mês real importado; Σ vNF por mês = conferência com o WebMais |
| **F2 — Regras e itens** | Abas Regras de entrada (CFOP × CST × NCM × fornecedor → CFOP de entrada, gera livro, crédito, tipo do item), Itens fiscais (0200/0220) e De-para do fornecedor, com **sugestão automática** (5101→1101, 5102→1102, 6101→2101, 5124→1124, 5902→1902… e tipo do item pelo cadastro de materiais e produtos) e aplicação em lote | Nenhuma nota do mês de teste sem regra |
| **F3 — Livros e apuração** | Registro de entradas, registro de saídas, apuração ICMS (E110) e IPI (E520), ajustes E111/E116 informados, CSV e impressão. Fechamento do mês fiscal | Débitos, créditos e saldo do mês de teste iguais aos da apuração do contador ou do WebMais |
| **F4 — SPED Fiscal** | Tela igual à do WebMais (§1) + relatório de inconsistências + arquivo TXT + histórico de arquivos gerados (hash, totais por registro, retificador) | Arquivo do mês de teste **validado no PVA sem erro**; diff registro a registro contra o arquivo do WebMais explicado linha por linha |
| **F5 — Inventário (Bloco H)** | Retrato do estoque em 31/12 (ou data escolhida): quantidade (kardex) × custo unitário (`custos/`), IND_PROP (próprio, em poder de terceiros, de terceiros em poder da Kuryos: ver §13 P3) | H010 de 31/12/2026 conferido pelo contador antes da EFD de fev/2027 |
| **F6 — SINTEGRA** | Tela igual à do WebMais (§1), arquivo de 126 posições, inconsistências | Arquivo do mês de teste aceito pelo validador SINTEGRA |
| **F7 — Exportação fiscal Domínio** (obrigatória: o escritório vai usar o Domínio) | ZIP dos XMLs do período (entradas, saídas, CT-e, eventos) + TXT da EFD + livro em CSV, ou o leiaute de importação de notas que o escritório indicar (§13 P5) | O escritório importa um mês real no Domínio sem retrabalho e confirma por escrito |
| **F8 (depois)** | Distribuição DF-e (baixar automaticamente as NF-e contra o CNPJ, certificado A1), Bloco K, CIAP (Bloco G), manifestação do destinatário | Cada um com seu "pronto" |

---

## 8. Tela (`fiscal.html`, módulo `fiscal` em `KURYOS_MODULOS`)

Abas:
- Documentos;
- Regras de entrada;
- Itens fiscais;
- Livros;
- Apuração;
- SPED Fiscal;
- SINTEGRA;
- Inventário;
- Estabelecimento e contabilista.

Siga o padrão visual de `controladoria.html` e `financeiro.html` (`gestao-financeira.css`, `.aba`,
`.card`, `.tw`, diálogos, `toast`). Celular de 390 px sem rolagem horizontal da página. Vocabulário do
contador ("gera livro", "CFOP de entrada", "apuração"), não de programador.

Na aba SPED Fiscal, os mesmos campos do WebMais, na mesma ordem (§1), e os botões Exportar e Novo. Ao
exportar com inconsistência, abre o relatório com as mesmas colunas. Sem inconsistência, baixa
`SPED_EFD_{CNPJ}_{AAAAMM}.txt` e grava o retrato em `fis/arquivos`.

---

## 9. Testes (sem eles não está pronto)

- `run_fiscal_test.js`: motor.
  - Parser contra **XMLs reais anonimizados**, um de cada: venda interna 5101, venda interestadual 6101,
    devolução, remessa e retorno de industrialização (5124/5902/1901 se existirem), compra de MP 1101,
    uso e consumo 1556, ativo 1551, CT-e, NF cancelada, CC-e e Simples Nacional (CSOSN).
  - Escrituração com regra, sem regra e com de-para.
  - Exceção 2 do C170.
  - Apuração.
  - Totalizadores 9900.
  - Formato (pipe, CRLF, decimal, datas, ISO-8859-1).
  - SINTEGRA com posições exatas (126 caracteres por linha, totalizador 90).
- `run_fiscal_servidor_test.js`: callables contra banco simulado.
  - Importação idempotente.
  - Período bloqueado (`ctl/bloqueio_periodo` FISCAL).
  - Arquivo transmitido não se sobrescreve.
  - Retificador.
- `run_fiscal_rules_test.js`: emulador. Tela não escreve em `fis/documentos`, `fis_xml` nem `fis/arquivos`.
- `run_fiscal_ui_test.js`: Playwright no Chrome, no molde de `run_controladoria_gerencial_ui_test.js`.
- **Ensaio com a base real** (somente leitura) e **validação no PVA** do mês de teste: o passo que conta.
  Os testes sintéticos passarem não prova nada (lição do Custos, `PROMPT_CONTROLADORIA.md` §13).

---

## 10. Segurança e dado sensível

- XML tem valores, clientes e preços: leitura para o módulo `fiscal` e a diretoria (ADM ou módulo
  `custos`), como a Controladoria.
- Certificado digital (F8): **nunca no RTDB nem no repositório**. Só na VPS, em arquivo com permissão
  restrita e senha em variável de ambiente.
- Toda gravação via callable com `exigir…` do perfil, como `exigirControladoria`.

---

## 11. Arquitetura

- Motor puro em `public/shared/fiscal.js` (UMD, como `controladoria.js`) + cópia byte a byte em `functions/`.
- Servidor em `functions/fiscal_servidor.js` (`preparar…` puros que devolvem `updates`) + callables em
  `functions/index.js` (`fisImportarXml`, `fisSalvarRegra`, `fisAplicarRegrasEmLote`, `fisApurar`,
  `fisGerarEfd`, `fisGerarSintegra`, `fisFecharMes`, `fisReabrirMes`, `fisRegistrarTransmissao`).
- Geração do arquivo **no servidor**: lê `fis_xml`, guarda o retrato e devolve o texto. A tela baixa.
- Deploy: as callables são registradas pelos `exports` (o adaptador da VPS lê sozinho). Regras pela CLI com
  backup antes, como sempre (`CLAUDE.md`).

---

## 12. Critérios de aceite (todos)

1. Um mês real fechado (sugestão: out/2026) gerado aqui **valida no PVA 6.x sem erro**.
2. **Diff contra o arquivo do WebMais** do mesmo mês: mesma quantidade de C100 por COD_SIT; mesmo Σ VL_DOC,
   VL_ICMS e VL_IPI por bloco; mesmo E110. Toda diferença explicada por escrito (erro de lá, erro daqui ou
   critério).
3. Relatório de inconsistências pega os casos do WebMais (contabilista, CFOP sem "gera livro") **antes** de
   gerar.
4. Importar o mesmo ZIP duas vezes não muda nada.
5. Mês fechado não muda. Arquivo transmitido não se sobrescreve. Retificar gera COD_FIN = 1 com novo retrato.
6. SINTEGRA do mesmo mês aceito pelo validador.
7. Celular 390 px sem rolagem horizontal; nenhum `NaN`, `undefined` ou zero inventado na tela.
8. `AGENT_STATUS.md`, `CLAUDE.md` (tabela de módulos), manual (`manuais.html` / `manual_*.html`) e
   `MELHORIAS_FUTURAS.md` atualizados.

---

## 13. Decisões do Marlos (17/11/2026) e perguntas que restam

**Decididas:**
- **P1. Regime tributário: decisão posterior.** Construa o **regime como parâmetro**
  (`fis/estabelecimento/regime`: `NORMAL` | `SIMPLES`), sem bifurcar o código.
  - O caminho principal é o regime normal: EFD obrigatória, apuração E110 e E520, CST de ICMS.
  - No Simples, a EFD deixa de ser obrigatória em SP e o SINTEGRA só vale se a SEFAZ notificar.
    O parser já lê CSOSN, e o livro e o SINTEGRA continuam saindo.
  - Nenhuma tela pode assumir um dos dois.
- **P2. Emissão de NF-e: em decisão, nada nesta etapa.** O KuryosERP **só recebe** o XML de saída, por
  upload de XML/ZIP exportado do emissor atual (WebMais). Nenhuma linha de emissão, certificado de
  emissão ou comunicação com a SEFAZ para autorizar nota.
- **P3. Industrialização por encomenda: sim.** Clientes mandam produtos e insumos para a Kuryos
  industrializar. Ver §15: muda as regras de entrada, a saída, o inventário (H010 IND_PROP = 2) e o
  SINTEGRA (74, código de posse 3).
- **P5. O escritório vai usar o Domínio.** A F7 (exportação fiscal Domínio) é **obrigatória**, não
  opcional. O Domínio importa XML de NF-e/CT-e e o próprio TXT da EFD. Confirme com o escritório o que
  ele prefere receber: ZIP de XMLs + TXT da EFD, ou o leiaute de importação de notas do Domínio. A
  exportação **contábil** Domínio já existe na Controladoria (`exportarDominio`) e o escritório também
  precisa validar o leiaute dela.

**Ainda abertas (não chute):**
- **P4. Energia e água**: chegam como NF3e (XML modelo 66) ou conta em papel? Há crédito de ICMS de energia
  na produção?
- **P6. "Tipo de arquivo: Importação Sis…"** no SPED do WebMais: quais são as opções? (Abrir o seletor no
  WebMais e fotografar.)
- **P7. Onde guardar o XML bruto**: RTDB em raiz separada (`fis_xml`) ou disco da VPS com backup? Medir o
  volume na F0 (nº de notas × tamanho médio).
- **P8. CNPJ alfanumérico.** O Financeiro usa `soDigitos` no CNPJ. A correção está no
  `PROMPT_CONTROLADORIA_FINANCEIRO_FISCAL.md`, trilha B0. **Aqui** já nasce certo.
- **P9. Empresas 002 CONNEXXA e 003 NEXT21** (estão no WebMais): entram? Cada CNPJ e IE é um arquivo próprio.
- **P10. Unificar o upload de XML de entrada** com o Financeiro F5. Proposta no prompt mestre, trilha B:
  o Fiscal guarda o XML e o Financeiro passa a ler `fis/documentos`.
- **P11. Tributação do 5124** (industrialização para outra empresa): ICMS e IPI sobre o valor agregado
  ou ISS? Depende do produto e do destino. É decisão do contador, guardada como regra de saída.

## 14. Fora de escopo

- **Emissão de NF-e/NFC-e/CT-e** (autorização na SEFAZ, DANFE, contingência): em decisão; nada nesta etapa (P2).
- Transmissão do SPED: quem assina e transmite é o contador, no PVA. Aqui só se registra o recibo.
- EFD-Contribuições (PIS/COFINS), ECD, ECF, EFD-Reinf, DCTFWeb e apuração de IBS/CBS: outros arquivos e
  outro projeto. Os dados de PIS/COFINS e IBS/CBS ficam guardados no documento para quando vier.
- Cálculo de imposto na venda (formação de preço): é do Comercial/Custos.

---

## 15. Industrialização por encomenda (decisão de 17/11: a Kuryos faz)

**O que já existe.**
- O estoque já separa o material do cliente: `shared/propriedade-estoque.js`. A propriedade vem do PC de
  remessa; `estoque/{material}/porCliente/{clienteKey}/saldoAtual` guarda o saldo de cada cliente.
- O Custos já trata esse material como custo zero (`PROCEDENCIA.CLIENTE`).
- O Fiscal **lê** isso. Não recria propriedade.

**CFOPs a cobrir** (SP → SP com 5/1, interestadual com 6/2):

| Operação | Quem emite | CFOP na nota | Escrituração na Kuryos |
|---|---|---|---|
| Cliente remete insumo/embalagem para industrializar | cliente | 5901 / 6901 | entrada **1901 / 2901**. Não gera crédito nem custo; vira estoque de terceiro (IND_PROP 2) |
| Fornecedor do cliente entrega direto na Kuryos, por conta e ordem do cliente | fornecedor | 5924 / 6924 (e a nota simbólica do cliente) | entrada **1924 / 2924**. Estoque de terceiro do cliente |
| Kuryos devolve o material do cliente aplicado no produto | Kuryos | **5902 / 6902** | saída simbólica. **Não é receita** |
| Kuryos cobra o que agregou (material próprio + serviço) | Kuryos | **5124 / 6124** (ou 5125 / 6125 quando o insumo não transitou pelo cliente) | **é a receita**. Tributação conforme P11 |
| Kuryos devolve material do cliente não aplicado | Kuryos | **5903 / 6903** | saída simbólica. Baixa o estoque de terceiro |

**Regras:**
1. **Regra de entrada** (§5): 1901/1924 nascem com `geraLivro: true`, `creditaICMS: false`,
   `creditaIPI: false` e `propriedade: 'CLIENTE'`. A sugestão automática (F2) já propõe isso para 5901/6901
   e 5924/6924 do fornecedor.
2. **Saída.** Numa NF com itens 5902 e 5124, o **valor da operação para receita** é só o dos itens
   5124/5125, mais o IPI/ICMS deles. O 5902 entra no livro (C190 próprio) mas não é faturamento.
   `livro()` expõe `receitaPorCfop` para a Controladoria ler (trilha A do prompt mestre).
3. **Inventário (H010).** O item de cliente sai com **IND_PROP = 2** e COD_PART do cliente (CNPJ pelo
   cadastro do cliente → 0150), quantidade de `porCliente`, valor = o valor da nota de remessa (custo
   para a Kuryos é zero, mas o H010 pede o valor do item: use o da NF de entrada 1901, média ponderada
   por cliente × item). Item próprio em poder de terceiro: IND_PROP = 1.
4. **SINTEGRA 74:** código de posse 1 (próprio em seu poder), 2 (próprio em poder de terceiro) e 3 (de
   terceiro em seu poder), com o CNPJ e a IE do dono.
5. **Bloco K, se vier a ser exigido:** K200 com IND_EST 2 para o estoque de terceiros. A produção por
   encomenda vai para K230/K235, com o insumo de terceiro identificado.
6. **Conferência nova no relatório de inconsistências:**
   - saldo físico de terceiro (`porCliente`) × Σ entradas 1901/1924 − Σ saídas 5902/5903 do cliente,
     por item;
   - divergência é aviso, com o cliente e o item.
7. **Teste com XML real** de cada CFOP da tabela (§9). Se algum não existir na base, registre "não
   medido", não invente.

## 16. Estado da implementação

Nada construído. Prompt escrito em 17/11/2026 e atualizado no mesmo dia com as decisões do Marlos (§13). Prompt mestre que junta as quatro frentes: `PROMPT_CONTROLADORIA_FINANCEIRO_FISCAL.md`. Base:
- os prints do WebMais (§1);
- o código do repositório em `hostinger-deploy` `3da5ad9` + `controladoria/paridade-webmais` `9eefc72`;
- as fontes de §2: Portal SPED (Guia Prático EFD ICMS/IPI 3.2.x, NT 2025.001 leiaute 020 e NT 2026.001
  leiaute 021); SEFAZ-SP (Portaria CAT 32/1996 art. 1º-A; RC 26370/2022, 31333/2025 e 32803/2025;
  Portaria SRE 6/2025); Ajuste SINIEF 25/2022 (Bloco K); Convênio ICMS 57/95 e Manual de Orientação
  (SINTEGRA, confaz.fazenda.gov.br).

Baixe o Guia Prático e o Manual do Convênio vigentes no início da F4/F6 e **trabalhe pelo documento
oficial, não pela memória**.
