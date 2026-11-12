# Amostras de MP no Cadastros — design

Data: 11/11/2026 · Origem: proposta "aba Amostras P&D no Cadastro" + decisões do Marlos no mesmo dia.

## 1. Objetivo e critério de sucesso

O P&D pede amostras de matéria-prima a fornecedores e elas chegam sem aviso. A logística é cobrada por
volumes que não esperava, e ninguém sabe o que já foi pedido, de quem e a que custo.

Sucesso:
- a logística abre uma lista do que vai chegar, por data, e dá baixa quando chega;
- a amostra recebida aparece para o P&D homologar ou reprovar;
- dá para ver o histórico de todas as amostras (filtrar por status, tipo, fornecedor, motivo, período)
  antes de pedir de novo.

Fora do escopo: estoque (a amostra não vira saldo nem lote), custo padrão do material, tela completa de
homologação (etapa seguinte), e-mail de aviso.

## 2. Decisões (11/11)

| Ponto | Decisão |
|---|---|
| Onde fica | Aba **Amostras de MP** dentro de `cadastros.html` |
| Fornecedor | Escolhido do cadastro de Fornecedores; se não existir, o P&D cria na aba Fornecedores e ele aparece na hora na lista da amostra |
| Quantidade | Sim: quantidade + unidade (g ou kg), para a logística conferir |
| Homologação | Só homologar ou reprovar com parecer (obrigatório ao reprovar) |
| Motivos | Homologar novo fornecedor · Reposição · Amostra para cliente · Desenvolvimento interno |
| Gravação | Só pelo servidor (callable `amostraMp`); o navegador só lê |
| Especificação v3 do ERP | Não disponível; seguimos o padrão deste repositório |

Nome "Amostras de MP" (e não "Amostras") porque no P&D "amostra" já é o produto feito para o cliente.

## 3. Quem faz o quê

| Ação | Quem | Status antes → depois |
|---|---|---|
| Criar | P&D | — → `SOLICITADA` |
| Editar | P&D | `SOLICITADA` (fornecedor e MP só mudam aqui) |
| Cancelar (motivo obrigatório) | P&D | `SOLICITADA` → `CANCELADA` |
| Dar baixa (data, forma de entrega) | Logística | `SOLICITADA` → `RECEBIDA` |
| Homologar (parecer opcional) | P&D | `RECEBIDA` → `HOMOLOGADA` |
| Reprovar (parecer obrigatório) | P&D | `RECEBIDA` → `REPROVADA` |

- **P&D** = papel `pd` ou módulo `pd`. **Logística** = papel `logistica` ou módulo `logistica`. O **ADM** pode
  tudo. PCP e quem tem o módulo `cadastros` só leem.
- Depois de `RECEBIDA` só se gravam parecer e status; fornecedor, MP, custos e quantidade ficam travados.
- "Cancelar" não estava na proposta: entra para a solicitação errada não ficar eternamente "atrasada".
  Nada se apaga.
- **Atrasada** = `SOLICITADA` com previsão de chegada antes de hoje (Brasília). É calculada na tela, não gravada.

## 4. Acesso à aba

Hoje os papéis `pd` e `logistica` não abrem `cadastros.html`. Entra o módulo **`amostras_mp`**
(`auth_check.js`, página `cadastros.html`), no padrão dos papéis `pd`, `logistica` e `pcp`; o ADM pode marcar
para outras pessoas em Usuários.

Na página, as abas aparecem conforme o módulo:
- com `cadastros`: todas, como hoje, mais Amostras de MP;
- só com `amostras_mp` e P&D: **Amostras de MP** e **Fornecedores** (para criar fornecedor);
- só com `amostras_mp` e Logística: **Amostras de MP**.

Menu (`shared/navegacao.js`): link "Amostras de MP" (`cadastros.html?tab=amostras`) para quem tem o módulo,
nos blocos do P&D e da Logística; `run_navegacao_test.js` atualizado.

**Fornecedor novo pelo P&D:** a regra de `fornecedores/$f` passa a aceitar do P&D só a **criação** (`!data.exists()`);
editar fornecedor existente continua com Cadastros/Compras/PCP/ADM. O mesmo vale para a entrada "Cadastro
criado" em `historico_fornecedores`. Na tela, o P&D sem `cadastros` vê a aba Fornecedores só com
"+ Novo Fornecedor" (sem editar/excluir). No formulário da amostra, o link "Fornecedor não está na lista?
Cadastrar" abre esse mesmo modal; ao salvar, o fornecedor aparece na lista (ela escuta `fornecedores`).

## 5. Dados

`amostras_mp/{id}` (id = push gerado no servidor):

```
codigo            "AM-0001" (contador config/contadores/amostrasMp, transação no próprio nó)
tipo              "NOVA" | "CADASTRADA"
material          { codigo, nome }            (CADASTRADA: do cadastro, nome conferido no servidor)
materialNovo      { nome, descricao }         (NOVA: texto livre)
fornecedor        { key, nome }               (key de fornecedores/, nome conferido no servidor)
custoKg           número ≥ 0 (R$/kg)
custoAmostra      número ≥ 0 (R$)
quantidade        { valor > 0, unidade: "g" | "kg" }
motivo            "HOMOLOGAR_FORNECEDOR" | "REPOSICAO" | "AMOSTRA_CLIENTE" | "DESENVOLVIMENTO"
previsaoChegada   "AAAA-MM-DD"
observacoes       texto ≤ 1000
status            SOLICITADA | RECEBIDA | HOMOLOGADA | REPROVADA | CANCELADA
solicitante       { uid, nome, em }
recebimento       { data "AAAA-MM-DD", forma: CORREIO | TRANSPORTADORA | MOTOBOY, por { uid, nome }, em }
parecer           { decisao, texto, por { uid, nome }, em }
cancelamento      { motivo, por, em }
historico/{push}  { acao, de, para, por { uid, nome }, em, campos? }   (toda ação, inclusive edição)
atualizadoEm
```

Regras: `.read` para P&D, Logística, `cadastros`, PCP e ADM; `.write: false` (só o Admin SDK grava).

## 6. Servidor

`functions/amostras_mp.js` (≤ 350 linhas), padrão de `functions/cobrancas.js`:
- funções puras: `validarCriacao`, `validarEdicao`, `transicao(acao, statusAtual)`, `podeFazer(acao, usuario)`;
- `criarServico({db}).executar(uid, {acao, id, dados, requestId})`: relê o perfil do banco (não confia no
  navegador), confere papel e transição, grava em `transaction` **só no nó** `amostras_mp/{id}` (nunca na
  raiz), anexa o histórico, idempotente por `requestId`;
- `index.js`: `exports.amostraMp = onCall(...)`; contagem de callables em `run_render_functions_test.js` sobe para 35.

Erros devolvidos com código e mensagem em português (`permission-denied`, `invalid-argument`,
`failed-precondition` para transição inválida, ex.: "Esta amostra já foi recebida").

## 7. Tela (aba Amostras de MP)

Lógica pura em `public/shared/amostras-mp.js` (filtros, ordenação, atraso, rótulos, quais botões cada um vê);
a aba fica em bloco próprio de `cadastros.html`, chamando a callable pelo mesmo cliente das outras.

- **Lista**: filtros status, tipo, fornecedor, motivo e período (data da solicitação); colunas código, MP,
  fornecedor, motivo, quantidade, previsão (vermelho quando atrasada), status. Clique abre o detalhe com o
  histórico.
- **Nova solicitação / Editar** (P&D): tipo primeiro; NOVA mostra nome + descrição; CADASTRADA mostra a busca
  de material (mesmo autocomplete do BOM). Fornecedor com busca + link para cadastrar.
- **A receber** (Logística; P&D também vê): `SOLICITADA`, ordenada por previsão, atrasadas no topo; botão
  **Dar baixa** pede data (padrão hoje) e forma de entrega.
- **Aguardando homologação** (P&D): `RECEBIDA`; botões **Homologar** e **Reprovar** (parecer obrigatório).
- **Atalho após homologar MP nova**: botão **Cadastrar MP**. Quem tem `cadastros` abre o "Novo material" já
  preenchido (nome, descrição, fornecedor na lista de homologados como Homologado, custo de referência =
  custo/kg). Quem não tem cria a tarefa na fila existente `solicitacoes_cadastro_material` (mesma chave por
  nome de `filaCadastroMp`), com fornecedor e custo, e a tela avisa que foi para o Cadastros. Nada é
  cadastrado sozinho.
- **Após homologar MP já cadastrada com motivo "Homologar novo fornecedor"**: link para abrir o material em
  Cadastros (quem tem `cadastros`) e marcar o fornecedor como Homologado. Não muda sozinho.

## 8. Testes

- `run_amostras_mp_test.js`: regras puras (cada transição válida e inválida, cada papel, travas pós-recebida,
  parecer na reprovação, atraso no fuso de Brasília, filtros) e o serviço com banco simulado (idempotência,
  histórico, perfil inativo recusado).
- `run_amostras_mp_emulator_test.js` + `firebase.amostras-test.json` (`--project demo-amostras`): navegador
  não grava `amostras_mp`; P&D cria fornecedor mas não edita existente; logística/P&D leem.
- `run_amostras_mp_ui_test.js` (Chrome, harness de Cadastros): P&D cria e vê só as abas certas; logística dá
  baixa; P&D homologa; atrasada destacada; atalho Cadastrar MP pré-preenchido.
- Regressão: `run_navegacao_test.js` (perfis), `run_render_functions_test.js` (35 callables), bateria de Cadastros.

## 9. Entrega e riscos

- Ordem de publicação: **regras primeiro**, depois deploy da VPS (callable + tela).
- Manual de Cadastros (seção nova) e manual da Logística (uma linha); `MELHORIAS_FUTURAS.md` com a tela
  completa de homologação e o uso do custo/kg no custo padrão.
- Risco: abrir `cadastros.html` a papéis novos. Mitigação: abas escondidas por módulo **e** regras do banco
  já negando escrita fora do que cada um pode (testado no emulador).
