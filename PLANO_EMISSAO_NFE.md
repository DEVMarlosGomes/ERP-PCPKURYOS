# Emissão de NF-e pelo sistema — complexidade e plano

12/11/2026 · Pedido do Marlos: emitir NF-e daqui, com configuração completa (CEP, SEFAZ, Receita e
demais órgãos), no padrão de faturamento do Bling. Este documento é a análise para decidir o caminho.
Ainda não é a especificação técnica: ela vem depois das decisões da §12.

---

## 0. Resposta curta

- **Complexidade: alta, mas o trabalho difícil está nas regras fiscais e nos dados, não na conexão com a
  SEFAZ.** A conexão (assinar o XML com o certificado, transmitir, contingência, DANFE, eventos) existe
  pronta como serviço por R$ 95 a R$ 550/mês. Construir essa parte do zero custaria meses e manutenção
  eterna. A reforma tributária vai mudar o layout da nota várias vezes em 2026–2027.
- **Recomendação: caminho A.**
  - **Compramos** a comunicação com a SEFAZ: um provedor de API de NF-e (Focus NFe, Nuvem Fiscal ou NFE.io).
  - **Construímos aqui** o cadastro fiscal, o motor de regras no modelo do Bling (natureza de operação +
    regras + exceções), a tela de emissão a partir do Faturamento de cargas e as ligações com o
    Financeiro, o Estoque e a industrialização por encomenda.
  - Essa última ligação é o que o Bling não faz por nós: o sistema já sabe quanto material de cada
    cliente cada OP consumiu.
- **Prazo estimado:** de 10 a 14 semanas até emitir em produção, em 6 fases.
  - A primeira fase depende do contador e de preencher dados, não de código.
  - A entrada de notas de fornecedor (download do XML pela SEFAZ) é uma fase opcional depois: mais 2 a 3 semanas.
- **O que mais pesa hoje são os dados:**
  - **Produtos:** nenhum dos 408 produtos ativos tem NCM.
  - **Clientes:** nenhum dos 61 clientes ativos tem Inscrição Estadual, CEP ou endereço estruturado.
  - **Transportadoras:** não há nenhuma cadastrada.
  - Sem isso, nenhuma nota sai, em sistema nenhum.

---

## 1. Onde estamos (medido em 12/11/2026)

**Fluxo atual:**
1. Carga montada na Expedição.
2. "Solicitar faturamento": o servidor manda e-mail ao Financeiro.
3. O Financeiro emite a NF **em outro sistema**.
4. Alguém **redigita** número, série, valor e chave em Faturamento de cargas (`shared/faturamento-tela.js`,
   callable `faturamentoCargaPA`). O `statusFiscal` da expedição só distingue "NF externa informada" de
   "pendente"; não há autorização da SEFAZ. Essa redigitação está registrada como GAP-11 em
   `FLUXOS_DO_SISTEMA.md`.

**Dados para a nota (produção, lidos em 12/11):**

| Cadastro | Tem | Falta para a NF-e |
|---|---|---|
| Clientes ativos (61) | CNPJ em 53, cidade/UF em 52, endereço em texto livre em 27 | IE e indicador de IE, CEP, logradouro/número/bairro separados, código IBGE do município, e-mail para XML. **Zero** clientes completos |
| Produtos ativos (408) | EAN-13 válido em 52, peso da caixa em 172, unidade, cliente | **NCM em 0**, CEST, origem da mercadoria, unidade tributável, enquadramento de IPI |
| Transportadoras | Nenhuma | CNPJ, IE, endereço, placa/UF quando houver |
| Pedidos / cargas | Itens, quantidades, preço unitário, lote e validade por palete, peso | Tipo de operação (natureza), frete (modalidade), volumes |

**Clientes por UF:** SP 39, RJ 4, PR 3, RS 2, SC 2, PE 1, PA 1 e sem UF 9. Há operação interestadual: CFOP
6.xxx, alíquota interestadual e, para cosméticos, possível substituição tributária conforme o estado de destino.

**Decisões anteriores que este plano revisa:** `PLANO_CUSTOS.md` (14/09) e `PROMPT_FINANCEIRO.md` (28/10)
dizem "emissão de NF-e: não construir". O caminho A mantém o espírito dessa decisão, porque a parte
legal e técnica pesada é comprada. Mas passa a construir aqui a emissão e as regras, o que **precisa do
seu aval explícito** (§12).

---

## 2. O que "emitir NF-e" envolve

| Peça | O que é | Quem faz no caminho A | Complexidade |
|---|---|---|---|
| Certificado digital A1 (e-CNPJ) | Assina cada nota. A3 (token/cartão) não serve para emissão em nuvem | Kuryos compra; sobe no provedor | Baixa |
| Assinatura XML, transmissão, contingência, consulta | Assinar, enviar à SEFAZ autorizadora da UF, tratar fila/contingência (SVC/EPEC), consultar recibo | **Provedor** | Muito alta se feita aqui |
| Layout e validação (schema) | O XML segue o leiaute oficial e as Notas Técnicas; a reforma tributária acrescentou o grupo IBS/CBS (NT 2025.002) | **Provedor** (mantém o layout) + nós (preencher os campos) | Alta e móvel |
| DANFE | O PDF que acompanha a carga | **Provedor** (gera) | Baixa |
| Eventos | Cancelamento (prazo curto), Carta de Correção, inutilização de numeração | Provedor transmite; **nós** damos tela e regra | Média |
| Cadastro fiscal | Emitente, clientes (CEP, CNPJ, IE), produtos (NCM, CEST, origem), transportadoras | **Nós** | Média (código) + alta (dados) |
| Motor de regras (natureza de operação) | Decide CFOP, CST/CSOSN, alíquotas, ST, IPI, PIS/COFINS, IBS/CBS, texto legal | **Nós** + **contador** define a matriz | **Alta**: é onde mora o risco fiscal |
| Ligações internas | Carga → NF; NF → título a receber; industrialização (retorno do material do cliente) | **Nós** | Média |
| Guarda do XML | XML autorizado guardado por no mínimo 5 anos | Nós (Storage + backup) e provedor | Baixa |
| Apuração, SPED, Bloco K | Escrituração e obrigações acessórias | **Contador** (fora do escopo) | — |

---

## 3. Três caminhos

| | **A. Provedor de API + regras aqui** (recomendado) | B. Direto na SEFAZ | C. Bling como motor, tela aqui |
|---|---|---|---|
| Como | Nosso servidor monta a nota com as nossas regras e manda ao provedor, que assina, transmite e devolve XML/DANFE | Nosso servidor assina e conversa por SOAP com a SEFAZ de cada UF (biblioteca livre, ex.: sped-nfe em PHP num container da VPS) | Clientes, produtos e regras ficam no Bling; nosso sistema cria a nota no Bling pela API v3 e manda emitir |
| Esforço | 10–14 semanas | 6–9 meses + manutenção permanente | 3–5 semanas |
| Custo mensal | R$ 95–550 (provedor, conforme volume) | ~R$ 0 (só infraestrutura) | Plano do Bling com API e NF-e (confirmar preço) |
| Risco | Médio: regra errada é nossa, layout é do provedor | **Alto**: qualquer Nota Técnica nova (houve 213 regras de rejeição novas só para IBS/CBS) pode parar o faturamento | Baixo no fiscal; alto de **dependência** e cadastro duplicado nos dois sistemas |
| Configuração "densa" | Sim, construída aqui no modelo do Bling | Sim | Fica no Bling, fora daqui |
| Industrialização por encomenda (material do cliente) | Calculada com o consumo real das OPs | Idem | Manual no Bling |
| Reaproveita no Kuryos ERP | Sim (motor puro, como os outros) | Sim, mas pesado | Não |

**Por que A:**
- **O que contra B:** a emissão é infraestrutura comprável. O valor está nas regras e nas ligações com
  o que só este sistema sabe.
- **O que contra C:** "emitir aqui pelo sistema" com a configuração fiscal morando no Bling dá duas
  fontes da verdade (cliente e produto cadastrados duas vezes). Também deixa de fora a parte que mais
  diferencia a Kuryos: a industrialização por encomenda.

**C é a alternativa honesta se o objetivo for emitir em semanas e não em meses.** Se a NF já sai hoje do
Bling, vale ponderar (§12, pergunta 1).

---

## 4. O que copiar do Bling (engenharia reversa funcional)

Mapeado da central de ajuda e da documentação pública do Bling: o modelo de funcionamento, não código
nem tabelas (são proprietários e não fazem falta). O modelo do Bling é o mesmo padrão de Tiny, Omie e
dos ERPs de mercado: **a natureza de operação decide os impostos**.

| No Bling | Como fica aqui | Fase |
|---|---|---|
| Dados da empresa: CNPJ, IE, IM, CNAE, regime (CRT), certificado, série e próximo número, ambiente homologação/produção | Tela **Fiscal › Emitente** (só ADM/fiscal); o certificado vai direto ao provedor e nunca fica no nosso banco | 1 |
| Contatos: CNPJ busca na Receita e preenche; CEP preenche endereço; IE e "contribuinte / isento / não contribuinte" | Cadastros › Clientes ganha bloco **Dados fiscais**: CNPJ consulta e preenche razão social e situação (bloqueia baixada/inapta); CEP preenche logradouro, bairro, município e código IBGE; IE com consulta quando a UF permitir | 1 |
| Produto: NCM, CEST, origem, GTIN e GTIN tributável, unidades, pesos | Cadastros › Produtos ganha bloco **Fiscal**; NCM validado na tabela oficial; **preenchimento em lote por categoria** (os cosméticos caem em poucos NCMs) com revisão do contador | 1 |
| Naturezas de operação com regras por imposto (ICMS, IPI, PIS, COFINS, IBS/CBS) e CFOP dentro/fora do estado | **Fiscal › Naturezas de operação**: Venda, Industrialização por encomenda, Retorno de insumo, Amostra grátis, Bonificação, Devolução, Remessa… | 2 |
| Exceções por UF, NCM, produto ou tipo de destinatário; benefício fiscal por item | Regras com prioridade (produto > NCM > UF > padrão), mostrando qual regra decidiu cada imposto | 2 |
| Informações complementares automáticas (texto de lei, suspensão, ME/EPP) | Texto por natureza, com variáveis (nº da NF de remessa, lote…) | 2 |
| Pedido de venda → gerar NF-e; emissão em lote | **Faturamento de cargas → "Gerar NF-e"** (substitui o "Registrar NF" digitado); NF avulsa para o que não é carga | 3 |
| Validar antes de enviar; status (autorizada, rejeitada com motivo, denegada, cancelada) | Pré-validação local (campos e cálculo) + retorno da SEFAZ traduzido para o que fazer | 3 |
| DANFE e XML por e-mail ao cliente | E-mail automático ao contato fiscal do cliente | 3 |
| Cancelar, Carta de Correção, inutilizar numeração, NF de devolução e complementar | Ações na nota, com quem pode fazer cada uma (módulo `fiscal`) | 3 |
| Contas a receber geradas das parcelas da nota | Duplicatas da NF viram títulos no **Financeiro** (que hoje espera NF para sair da previsão) | 4 |
| Lançar estoque pela nota | **Não**: a saída física já acontece na Expedição; a NF só se liga a ela (evita baixa dupla) | 4 |
| Envio mensal dos XMLs ao contador | Exportação mensal (ZIP de XMLs + relatório) | 4 |
| Importar XML de compra; manifestação do destinatário | Notas de fornecedor baixadas da SEFAZ alimentam o **Recebimento** (resolve "a entrada nunca aconteceu" do estoque) | 6 (opcional) |

---

## 5. Particularidades da Kuryos

O que torna o caso mais difícil do que "uma loja no Bling", com o tratamento a confirmar com o contador:

1. **Industrialização por encomenda.** Quando o cliente manda material (frasco, rótulo, MP), a volta do produto
   pronto costuma sair em **duas partes**:
   - o retorno do material do cliente (CFOP 5.902/6.902, normalmente com ICMS e IPI suspensos);
   - a cobrança da industrialização (5.124/6.124: serviço + material próprio da Kuryos).
   - Material não usado volta como 5.903.

   **O sistema já sabe o que é de cada cliente** (`estoque/{m}/porCliente`, desde 15/09) e quanto cada OP
   consumiu: o 5.902 pode sair calculado do consumo real, não digitado. Para o valor sair automático, a
   nota de remessa do cliente precisa entrar no sistema com valor (Fase 6, ou digitação no recebimento).
2. **IPI de cosméticos** (capítulo 33 da TIPI) e **substituição tributária** de perfumaria/cosméticos
   (exige CEST), que muda por UF de destino. Com clientes em 7 UFs, a matriz precisa de exceções por estado.
3. **Reforma tributária.**
   - **Regime normal:** os campos de IBS/CBS são obrigatórios por lei em 2026 (Ato Conjunto RFB/CGIBS nº
     4/2026). A rejeição automática da SEFAZ (1115) foi adiada; as fontes divergem sobre a data, então é
     preciso confirmar na época.
   - **Simples Nacional:** passa a destacar em 2027.
   - O motor nasce com IBS/CBS (CST e cClassTrib por regra).
4. **CNPJ alfanumérico.** CNPJs novos podem ter letras a partir de 2026. O cadastro hoje só aceita 14 dígitos.
5. **GTIN do cliente.**
   - **O problema:** a SEFAZ confere o EAN no Cadastro Centralizado de GTIN (GS1). No private label, o EAN
     é da marca, e EAN não registrado ou com NCM incoerente gera rejeição.
   - **Hoje:** só 52 dos 408 produtos têm EAN válido.
   - **Na nota, o produto sem EAN sai como "SEM GTIN".**
6. **Lote e validade na nota.** O layout tem o grupo de rastreabilidade (lote, fabricação, validade). O
   sistema já sabe isso por palete, então sai preenchido.
7. **Amostras enviadas a clientes** (P&D) e **bonificações** têm natureza própria (5.911/6.911 e 5.910). Hoje
   não sabemos se saem com nota.

---

## 6. Ligações externas

| Órgão / fonte | Para quê | Como | Custo |
|---|---|---|---|
| SEFAZ (UF da Kuryos e ambiente nacional) | Autorizar nota e eventos, contingência, status do serviço | Pelo provedor | Incluso no provedor |
| SEFAZ — cadastro de contribuintes (CCC) | Conferir IE e situação do cliente | Pelo provedor quando oferecer, ou consulta com o certificado; nem toda UF responde, então há validação do dígito da IE como reserva | Incluso ou baixo |
| Receita Federal — CNPJ | Razão social, situação cadastral, endereço | BrasilAPI / dados abertos (grátis, atualização mensal); Serpro (oficial, pago por consulta) só se precisar | Grátis |
| Correios / CEP | Endereço + código IBGE do município (obrigatório na NF-e) | ViaCEP ou BrasilAPI | Grátis |
| Tabelas oficiais | NCM, CEST, CFOP, municípios IBGE | Tabelas públicas importadas e versionadas no sistema | Grátis |
| GS1 / CCG | Conferir o GTIN da marca | A SEFAZ confere na emissão; rejeição traduzida na tela | — |
| Contador | Matriz fiscal, validação dos primeiros lotes, XMLs mensais | Revisão na Fase 0 e exportação mensal | — |

---

## 7. Fases

| Fase | Entrega | Pronto quando | Duração |
|---|---|---|---|
| **0. Decisões e dados** | Respostas da §12; matriz fiscal com o contador (cada operação → CFOP e tributação); certificado A1; conta no provedor com homologação; **série nova** para não colidir com a numeração do emissor atual | Contador assinou a matriz; provedor responde em homologação | 1–2 sem. (operação) |
| **1. Cadastro fiscal** | Emitente; clientes com CEP/CNPJ/IE; produtos com NCM/CEST/origem (lote por categoria); transportadoras; módulo `fiscal` nas 5 pontas (acesso, menu, login, usuários, regras do banco) | Os clientes e produtos que faturam no mês estão completos e validados | 2 sem. + preenchimento |
| **2. Motor fiscal** | Naturezas, regras e exceções, cálculo (ICMS, ST, IPI, PIS/COFINS, IBS/CBS), texto legal; funções puras testadas, recalculadas no servidor | **Ensaio:** reproduz os impostos de 30–50 notas reais já emitidas pelo emissor atual, item a item | 2–3 sem. |
| **3. Emissão** | "Gerar NF-e" no Faturamento de cargas e NF avulsa; validação; envio pela callable (idempotente, como Amostras de MP); status; DANFE/XML guardados; e-mail; cancelar, CC-e, inutilizar | Ciclo completo em **homologação** da SEFAZ, inclusive rejeições e cancelamento | 2–3 sem. |
| **4. Ligações** | Títulos no Financeiro; expedição com NF autorizada; industrialização por encomenda (5.124 + 5.902); exportação ao contador | Uma carga real vira NF + título + saída, sem redigitação | 2 sem. |
| **5. Produção assistida** | Emissão real com série própria, em paralelo ao emissor atual; contador confere as primeiras notas | 2–4 semanas sem divergência; então o emissor antigo é desligado | 2 sem. |
| 6. Entrada (opcional) | Manifestação do destinatário + download dos XMLs de fornecedores e de remessas de clientes → Recebimento | Nota de compra entra no estoque sem digitação | 2–3 sem. |

---

## 8. Arquitetura (resumo para a especificação)

- **Quem grava:** só o servidor, pela callable `notaFiscal` (ações VALIDAR, EMITIR, CONSULTAR, CANCELAR, CCE,
  INUTILIZAR).
  - Relê perfil e dados do banco e recalcula os impostos; não confia no navegador.
  - Idempotente por `requestId`, com reserva por transação no nó do pedido (padrão das Amostras de MP),
    nunca na raiz.
- **Segredos:** o token do provedor fica nas variáveis da VPS e o certificado no provedor; nenhum dos dois
  no RTDB.
- **Retorno da SEFAZ:**
  - por webhook do provedor para um endpoint da VPS, com consulta periódica de reserva;
  - nota "em processamento" nunca é reenviada às cegas.
- **Dados:**
  - `fiscal/config`;
  - `fiscal/naturezas/{k}`;
  - `fiscal/notas/{id}`, com status, número, série, chave, protocolo, caminhos do XML/DANFE e `eventos/`;
  - numeração por série em contador próprio, com buraco de número tratado por inutilização;
  - XML e PDF no Storage, `fiscal/{ano}/{mês}/{chave}`, incluídos no backup.
- **Motor:** `shared/motor-fiscal.js` puro (UMD), com cópia conferida em `functions/`, como
  `propriedade-estoque.js`.
- **Testes:**
  - unitários do motor;
  - **ensaio contra XMLs reais** (lição do MRP: dado real acha o que asserção sintética não acha);
  - emulador de regras;
  - tela no Chrome;
  - homologação da SEFAZ antes de produção.

---

## 9. Custos (pesquisados em 12/11/2026 em fontes secundárias; confirmar na página oficial ao contratar)

| Item | Valor |
|---|---|
| Focus NFe | Solo R$ 94,90/mês com 100 notas, R$ 0,11 por nota extra; planos maiores até R$ 548 (4.000 notas) |
| NFE.io | R$ 190 (250 notas), R$ 265 (500), R$ 375 (1.000) por mês |
| Nuvem Fiscal | Plano gratuito de 1.000 "eventos" por mês (evento não é igual a nota autorizada); planos pagos acima |
| Certificado A1 (e-CNPJ) | Compra anual; renovar antes de vencer (o sistema avisa com 30 dias) |
| CEP, CNPJ, tabelas | Grátis |

O volume mensal de notas (§12) decide o plano. A Fase 0 inclui uma prova de conceito de 1 a 2 dias com os
dois provedores finalistas em homologação, antes de assinar.

---

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Regra fiscal errada (imposto a menor ou a maior, autuação) | Matriz assinada pelo contador; ensaio contra notas reais; produção assistida com conferência; tela mostra qual regra decidiu cada imposto |
| Dados incompletos travam o faturamento | Pré-validação diz exatamente o que falta e onde cadastrar; fila "pronto para faturar" por cliente/produto |
| Numeração colidindo com o emissor atual | Série própria durante a transição |
| Layout muda (reforma tributária) | Layout é do provedor; regras IBS/CBS configuráveis, sem código |
| SEFAZ fora do ar no dia da carga | Contingência do provedor; a carga não espera a tela |
| Certificado vence | Aviso com 30 dias de antecedência |
| Duas saídas de estoque (Expedição + NF) | A NF não mexe em saldo; só se liga à saída já feita |

---

## 11. Fora do escopo

Apuração de impostos, SPED Fiscal / EFD Contribuições / Bloco K (contador), NFC-e (venda a consumidor no
balcão), NFS-e, MDF-e (manifesto de transporte, se a Kuryos transportar com frota própria entre estados),
boleto e conciliação bancária.

---

## 12. Decisões que preciso de você

1. **Hoje a NF sai de qual sistema, e quem emite?** Se for o Bling, o caminho C passa a ser uma opção real
   de curto prazo.
2. **Regime tributário da Kuryos** (Simples, Lucro Presumido ou Real) e **UF da fábrica.** Mudam
   CST/CSOSN, IPI e o calendário de IBS/CBS.
3. **Quais operações existem de fato:**
   - venda de produto pronto;
   - industrialização por encomenda com material do cliente;
   - amostra grátis;
   - bonificação;
   - devolução;
   - remessa para terceiros.
4. **O contador pode montar e assinar a matriz fiscal na Fase 0?** Sem isso, nenhum caminho é seguro.
5. **Volume:** quantas notas por mês, em média e no pico?
6. **Caminho A aprovado,** revisando a decisão "não construir emissão" de 14/09 e 28/10? Orçamento de até
   ~R$ 550/mês para o provedor?

---

## Fontes

- Bling — natureza de operação e emissão: [7 passos para emitir NF-e](https://blog.bling.com.br/7-passos-para-emitir-nf-e-atraves-do-bling/), [Emitir uma NF-e (ajuda)](https://ajuda.bling.com.br/hc/pt-br/articles/360035829513-Emitir-uma-Nota-Fiscal-Eletr%C3%B4nica-NFe), [Reforma tributária no Bling (ajuda)](https://ajuda.bling.com.br/hc/pt-br/articles/35705278410775), [Changelog da API v3](https://developer.bling.com.br/changelogs)
- Provedores e preços: [Como escolher uma API de NF-e em 2026](https://www.brasilnfe.com.br/como-escolher-api-nfe/), [Comparativo técnico e preços (Notaas)](https://www.notaas.com.br/blog/post/comparativo-5-apis-para-emissao-de-nfe-nfse-e-nfce-2025), [API fiscal: como escolher (Emitfy)](https://emitfy.com/solucoes/melhor-api-fiscal)
- Reforma tributária na NF-e: [Rejeição 1115 adiada (Contábeis)](https://www.contabeis.com.br/noticias/79337/nf-e-rejeicao-1115-de-ibs-e-cbs-adiada-mas-obrigacao-permanece), [IBS/CBS na NF-e em 2026 (Taxcel)](https://taxcel.com.br/ibs-cbs-nota-fiscal-2026-obrigatorio-rejeicao), [NT 2025.002 (TecnoSpeed)](https://blog.tecnospeed.com.br/nota-tecnica-reforma-tributaria-nfe-nfce/), [213 regras de rejeição (TaxUp)](https://taxup.com.br/estudo-rejeicao-nfe-ibs-cbs/)
- Industrialização por encomenda: [Remessa e retorno (NetCPA)](https://netcpa.com.br/colunas/icms-industrializacao-remessa-e-retorno/2574), [CFOP e escrituração (NetCPA)](https://netcpa.com.br/colunas/icms-industrializacao-cfop-e-escrituracao/6826)
- Cadastro de contribuintes: [SEFAZ — Cadastro Centralizado de Contribuinte](https://infosimples.com/consultas/sefaz-cadastro-centralizado/)
