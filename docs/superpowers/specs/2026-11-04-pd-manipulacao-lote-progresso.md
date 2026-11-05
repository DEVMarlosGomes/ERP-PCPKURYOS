# Progresso — Manipulação em Lote (worktree `PCP-Kuryos-pdlote`, branch `pd-lote/manipulacao-lote`)

Quem retomar: leia a spec (`…-design.md`), a revisão (`…-revisao-dev.md`) e esta tabela. Sem push, sem regra
publicada, sem deploy. Emulador próprio: `firebase.pdlote-test.json` (9063/4463/4563), `--project demo-pd-lote`.

| Ticket | Estado | Commit | Teste | Próximo passo |
|---|---|---|---|---|
| Spec + revisão | feito | (este commit) | — | LM-01 |
| LM-01 motor | feito | bd385c9 | `crm-frontend/src/lib/manipulacaoLote.test.js` (22) | — |
| Auditoria da spec (A1–A5, M1–M8, B1–B6) | incorporada na spec e no motor | (este commit) | `manipulacaoLote.test.js` (23) | LM-02 rotas (rascunho só), servidor gerar_ordem |
