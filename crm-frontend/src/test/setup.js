// Testes não falam com o servidor do Render (INF-04): a liberação de status do P&D responde ok.
// Quem precisa conferir a chamada usa vi.mocked(liberarEtapaPd).
vi.mock("@/lib/servidor", () => ({
  ORIGEM_FUNCOES: "",
  chamarServidor: vi.fn(async () => ({ ok: true })),
  liberarEtapaPd: vi.fn(async () => ({ ok: true })),
}));
