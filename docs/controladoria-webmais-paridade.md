# Controladoria × WebMais (ERPmais5) — paridade

Data: 17/11/2026. Pedido do Marlos: "precisamos ter as mesmas funções no KURYOSERP".
Fonte: 13 prints do menu **Controladoria › Contábil** do WebMais (empresa 001 KURYOS BEAUTY PACKING,
usuário Gustavo Callegaro) e o PDF de **Índices Gerenciais - Rel. Comercial**. Sem acesso ao navegador
nesta sessão: o que não aparece nos prints não foi explorado. O Financeiro × WebMais já tinha mapa
próprio (`docs/financeiro-fase0-lacunas.md` §8–9).

## Mapa

| WebMais (Controladoria › Contábil) | Aqui | Situação |
|---|---|---|
| Bloqueio/Liberação de Período (empresa; N.F. Entrada, N.F. Saída, Movto Estoque, Financ., Prod., Contábil, Fiscal) | Controladoria › **Bloqueio de período** (`ControladoriaGerencial.validarBloqueio`/`periodoLiberado`, callable `ctlSalvarBloqueio`) | **novo**. Trava ligada no Financeiro (todas as baixas, estornos, títulos manuais, movimentos, liquidação) e no ajuste manual da Controladoria. Os outros cinco movimentos ficam registrados e a tela diz que a trava ainda não está ligada neles |
| DRE - Demonst. Resultado Econômico (Realizado, Mensal, Extrato, Tipo de custo Médio, C.C. analítico, Centro de custo, Mostrar zerado, Empresa) | Controladoria › **DRE por elemento** (`dreGerencial`) + a DRE de competência que já existia | **novo** (layout). Grupo › centro › elemento, periodicidade mensal a anual, filtro de centro, mostrar zerado, CSV |
| Exportação Contábil - Domínio Sistemas | Controladoria › Fechamento › **Exportação contábil — Domínio** (`exportarDominio`) | **novo**. Layout configurável (empresa destino, histórico, código reduzido por conta). Sem layout ou com conta sem código: relatório de inconsistências, nada sai pela metade |
| Exportação Fiscal - Domínio Sistemas | — | fora: fiscal (ver abaixo) |
| Índices Gerenciais - Rel. Comercial | Controladoria › **Índices gerenciais** (`calcularIndices`/`validarIndices`, callable `ctlLancarIndices`) | **novo**. Retrato por Ano/Mês com data e usuário do lançamento, como no WebMais |
| Rel. de Gasto por Elemento de Custo | Financeiro › Relatórios › Gastos por centro de custo e elemento (`relGastosCentroCusto`, agrupar ELEMENTO) | já existia (12/11) |
| SINTEGRA | — | fora: fiscal |
| SPED FISCAL (EFD ICMS/IPI) | — | fora: fiscal |
| Relatório de inconsistências contábeis | Diálogo da exportação Domínio, mesmas colunas (Seq, Grupo, Identificador, Descrição) | **novo** |

## Decisões (minhas, marcadas como tal)

- **DRE por elemento.** Mesmos lançamentos da DRE de competência, outra arrumação. O teste confere que o
  resultado do período é igual nas duas. Grupos:
  1. receita bruta;
  2. deduções;
  3. receita líquida;
  4. custo variável (CPV + perdas);
  5. lucro bruto;
  6. despesas variáveis (despesas comerciais e incobráveis);
  7. margem de contribuição;
  8. custos fixos de produção (folha, MOD aplicada, CIF);
  9. despesas fixas / SG&A (administrativo, PLR);
  10. resultado antes do financeiro;
  11. resultado financeiro;
  12. resultado gerencial.

  Por isso a margem de contribuição desta aba já desconta as despesas comerciais (como no WebMais); na aba
  DRE elas vêm depois da margem. Nível 3 é o **elemento** do Financeiro quando o lançamento tem um
  (título manual classificado); senão, a conta gerencial. Sinal como no WebMais: receita +, custo e
  despesa −.
- **Elemento na partida.** O título manual agora leva `elemento` na partida da despesa. O hash do
  documento não muda, então nada é re-derivado; os documentos novos já nascem com ele.
- **Índices.** Média dos N meses (padrão 12) que terminam na competência, pelo razão:
  - despesa fixa = DESP_ADM + PLR;
  - produção = folha + MOD + CIF;
  - estocagem = o que está no centro LOGISTICA;
  - financeira fixa = tarifa/IOF (movimentos);
  - financeira variável = juros/multa (baixas);
  - % perda de matéria-prima = perdas ÷ saída de materiais do razão de custos.

  Divisão por zero vira "não medido". Comissão, ICMS da filial MT, frete, frete filial, Simples, kg
  faturado e "Cpl./R$" são **informados** (a base não tem). O servidor recalcula, não confia na tela.
- **Bloqueio.** Mesma semântica do WebMais: a janela é a **liberada**. Só o ADM altera, com justificativa;
  cada versão vai para `ctl/bloqueio_periodo_historico`. Sem configuração, nada muda. O fechamento do mês
  continua valendo por cima.
- **Domínio.** Leiaute "lançamentos em texto ;" (um par débito/crédito por linha; documento com várias
  partidas é decomposto sem perder centavo). **Conferir com o escritório** antes do primeiro envio — no
  WebMais o layout também aparece "Não configurado".
- **Regras do banco:** nenhuma mudança. `ctl/bloqueio_periodo*` e `ctl/indices*` não têm `.write` (só o
  servidor grava); o layout do Domínio mora em `ctl/parametros/dominio`, que a Controladoria já edita.

## Perguntas em aberto (para o Gustavo/Marlos)

1. **Empresas 002 CONNEXXA e 003 NEXT21.** O WebMais tem três empresas e a DRE soma "01, 02, 03". Aqui é um CNPJ
   só (decisão de 12/11). Elas entram no KuryosERP?
2. **SINTEGRA, SPED Fiscal e Exportação Fiscal Domínio.** O prompt da Controladoria deixou o fiscal com o
   contador. Para gerar aqui faltam: NF-e de entrada e saída com CFOP por item, cadastro do contabilista
   (CPF/CRC — as duas primeiras inconsistências do SPED no WebMais) e o "gerar livro" por CFOP. Gerar aqui ou
   continuar no WebMais/contador?
3. **"Média faturamento Cpl./R$"** dos índices: o que é "Cpl."? Se for o complemento fora da NF
   (`percentualNF` 50), dá para calcular.
4. **Trava nos outros movimentos** (N.F. Entrada, N.F. Saída, Estoque, Produção, Fiscal): ligar exige mexer em
   Recebimento, Faturamento, WMS e apontamento, o que o prompt manda perguntar antes.
5. **DRE "Orçado"** (Informação: Realizado/Orçado) e **"Contabiliza O.P por Emissão"/"Tipo de custo
   Médio"**: aqui o orçado já está em Orçamento × real; o custo é o do razão de Custos (não há médio/
   reposição). Precisa da opção na DRE?

## Testes

- `run_controladoria_gerencial_test.js` (70): bloqueio, DRE (bate com a DRE existente), índices, Domínio,
  callables e a trava no Financeiro e no ajuste.
- `run_controladoria_gerencial_ui_test.js` (13, Chrome): abas novas, CSV, lançamento de índices, bloqueio,
  inconsistências e arquivo do Domínio, celular 390 px sem rolagem.
- Regressão verde: `run_controladoria_test.js` (59), `run_gestao_servidor_test.js`, `run_financeiro*_test.js`
  (13 suítes, incluindo as 1.497 asserções dos relatórios WebMais).
- **Não rodado aqui:** emulador de regras (`run_gestao_rules_test.js`) — as regras não mudaram — e o ensaio
  contra a base real.
