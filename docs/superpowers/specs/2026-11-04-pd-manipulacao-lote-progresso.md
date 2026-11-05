# Progresso — Manipulação em Lote (worktree `PCP-Kuryos-pdlote`, branch `pd-lote/manipulacao-lote`)

Quem retomar: leia a spec (`…-design.md`), a revisão (`…-revisao-dev.md`) e esta tabela. Sem push, sem regra
publicada, sem deploy. Emulador próprio: `firebase.pdlote-test.json` (9063/4463/4563), `--project demo-pd-lote`.

| Ticket | Estado | Commit | Teste | Próximo passo |
|---|---|---|---|---|
| Spec + revisão | feito | (este commit) | — | LM-01 |
| LM-01 motor | feito | bd385c9 | `crm-frontend/src/lib/manipulacaoLote.test.js` (22) | — |
| Auditoria da spec (A1–A5, M1–M8, B1–B6) | incorporada na spec e no motor | (este commit) | `manipulacaoLote.test.js` (23) | LM-02 rotas (rascunho só), servidor gerar_ordem |
| LM-02 rotas + LM-05 exclusão (cliente) | feito | (este commit) | `firebaseApi.manipulacaoLote.test.js` (22); suíte CRM 471 | LM-03 servidor `manipulacaoLoteServidor` (gerar_ordem, pesagens, manipulação, crítico) |
| LM-03 servidor `manipulacaoLoteServidor` + trava no `liberarEtapaPd` | feito | (este commit) | `run_manipulacao_lote_servidor_test.js` (emulador, 10 passos); contrato CJS; render 28 callables; liberar_etapa_pd OK | LM-04 regras + emulador |
| LM-04 regras + LM-06/07/08 tela + `criticoPd` no Cadastros | feito | (este commit) | `run_pd_lote_rules_test.js` (10 passos); `firebaseApi.lote-emulator.test.js` (adaptador+regras+callables reais, ponta a ponta); render 4; `run_critico_pd_cadastro_ui_test.js`; suíte CRM 474 | build do CRM, LM-13 ensaio, LM-14 manual, integração com a auditoria |
| LM-11 integrações | feito | 8776b52 | Kickoff (composição travada), `formula_aprovada`, custo do lote | — |
| Build do CRM integrado | feito | 57e37ca | `vite build` + `integrar-crm-build.mjs`, base = versão publicada 25bb2bb (sem o redesign cancelado) | — |
| LM-13 ensaio com dados reais em cópia | feito | (este commit) | `firebaseApi.lote-ensaio.test.js` (só roda com `ENSAIO_FOTO`) | LM-14 manual |

### LM-13 — ensaio (05/11/2026)

Fotografia de leitura (`database:get`, só os nós do P&D/CRM, `materiais`, fila de MP nova e câmbio) exportada para
o scratchpad da sessão (fora do repositório), carregada no emulador `demo-pd-lote` com usuários fictícios e
**apagada às 01:54 de 05/11/2026**, junto com os `database-debug.log` do emulador. Nada de dado real entrou no Git.

Projeto real com mais amostras (Manteiga Corporal): **18 amostras, todas elegíveis, 12 ingredientes**. Fluxo pelo
adaptador real + regras reais + callables reais: criar → salvar (nenhuma precisou da matriz, nenhuma diferença fora
da fragrância) → gerar ordem → pesar e conferir (outra pessoa) → registrar → Em Testes em lote → liberação antecipada
em lote → ADM aprova 3 → Aguardando Aprovação → cliente aprova as 3 no CRM 3.

- Ordem do lote = soma das 216 linhas das ordens individuais (tolerância 0,01 g por linha).
- Massa: 900 g pesados = 900 g destinados (tolerância 4,5 g; teto da perda 18 g).
- 18/18 em Em Testes, nenhuma variação perdida nas amostras do projeto; a aprovação do cliente guardou a versão do
  lote (`formula_aprovada`) e o Kickoff leu "fragrância" como o que varia.
- Tempo (emulador, automático): ~23 s do painel à aprovação; salvar 3 s; gerar ordem 1 s; Em Testes das 18 em 10 s.
- **Achado:** a pré-mistura não se aplicou — os itens reais não têm fase (D-05: só fase com nome). Sem fase, cada
  ingrediente é pesado por amostra: 216 pesagens para 18 amostras. Nomear as fases nas fórmulas é o que traz o ganho.
- Não feito aqui: o roteiro cronometrado por uma pessoa (5 amostras × 25 ingredientes em < 5 min, em vídeo) — é na
  tela, com quem vai usar.
| LM-14 manual, Central de Ajuda, MELHORIAS, AGENT_STATUS | feito | (este commit) | `run_manuais_workflow_test.js` (93), `run_manuais_workflow_ui_test.js` | LM-15 auditoria final + prints |
| LM-15 auditoria final + correções | feito | (este commit) | `run_manipulacao_lote_auditoria_test.js` (10: ataques A–I recusados), servidor 10, regras 10, ponta a ponta, CRM 481, ensaio real de novo | publicar (regras + VPS) |

### LM-15 — auditoria final (05/11/2026)

Auditor independente achou 2 Altos (crítico decidido com dados que o cliente grava; crítico comparado só com a
matriz) e Médios (autor do motivo forjável, membro não conferido, lote preso em `gerando_ordem`, módulo de aprovação
inexistente, trava de fases larga demais, célula fantasma). Todos corrigidos — desenho em §13 da spec; cada ataque
virou um passo de `run_manipulacao_lote_auditoria_test.js`. Residuais aceitos em `MELHORIAS_FUTURAS.md`.
Ensaio com a fotografia da base refeito com o servidor corrigido (mesmo resultado: 18 amostras, 216 linhas, massa
conciliada, 18/18 Em Testes, 3 aprovadas no CRM 3); **fotografia apagada às 08:12 de 05/11/2026** com os logs do emulador.
