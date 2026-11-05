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
