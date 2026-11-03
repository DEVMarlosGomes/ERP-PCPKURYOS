// Testes não falam com o servidor do Render (INF-04): a liberação de status do P&D responde ok.
// Quem precisa conferir a chamada usa vi.mocked(liberarEtapaPd).
vi.mock("@/lib/servidor", () => ({
  ORIGEM_FUNCOES: "",
  chamarServidor: vi.fn(async (nome, dados) => {
    if (nome === "registrarAuditoriaCrm") {
      const {memory, databaseModule} = await import("./memoryFirebase");
      const p = databaseModule.push(databaseModule.ref(null, `erp/${dados.tenant_id}/audit_log`));
      memory.write(p.path, {...dados, id: p.key, user_id: memory.auth.currentUser?.uid, created_at: new Date().toISOString()});
    }
    return { ok: true };
  }),
  liberarEtapaPd: vi.fn(async () => ({ ok: true })),
}));
