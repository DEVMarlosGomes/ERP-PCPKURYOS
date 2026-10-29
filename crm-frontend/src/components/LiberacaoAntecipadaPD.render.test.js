import { renderToStaticMarkup } from "react-dom/server";
import LiberacaoAntecipadaPD from "@/components/LiberacaoAntecipadaPD";

vi.mock("@/lib/api", () => ({ default: { post: async () => ({}) } }));

const pedido = { status: "aguardando_diretoria", motivo: "Feira de sexta", solicitada_por_nome: "Paulo P&D", leituras_no_pedido: ["D24h"] };

test("P&D: botão Em Testes; aguardando a diretoria; aprovada com quem, quando e por quê", () => {
  const semPedido = renderToStaticMarkup(<LiberacaoAntecipadaPD req={{ id: "R", status: "IN_TESTS" }} podeEditar />);
  expect(semPedido).toContain('data-testid="pedir-liberacao"');
  const aguardando = renderToStaticMarkup(<LiberacaoAntecipadaPD req={{ id: "R", status: "IN_TESTS", liberacao_antecipada: pedido }} podeEditar />);
  expect(aguardando).toContain("Aguardando aprovação da diretoria");
  // PD-05: pedido logo após a manipulação, sem nenhuma leitura.
  const semLeitura = renderToStaticMarkup(<LiberacaoAntecipadaPD req={{ id: "R", status: "IN_TESTS", liberacao_antecipada: { ...pedido, leituras_no_pedido: [], sem_leitura: true } }} podeEditar />);
  expect(semLeitura).toContain("Pedido por Paulo P&amp;D (sem leitura de estabilidade): Feira de sexta");
  expect(aguardando).not.toContain('data-testid="pedir-liberacao"');
  const aprovada = renderToStaticMarkup(<LiberacaoAntecipadaPD podeEditar req={{ id: "R", status: "WAITING_APPROVAL", liberacao_antecipada: { ...pedido, status: "aprovada",
    decisao: { decisao: "aprovada", decidida_por_nome: "Ana ADM", decidida_em: "2026-10-24T14:30:00.000Z", justificativa: "D24h estável" } } }} />);
  expect(aprovada).toContain("Liberação antecipada aprovada");
  expect(aprovada).toMatch(/Aprovada por Ana ADM em .* — D24h estável/);
  expect(aprovada).not.toContain('data-testid="pedir-liberacao"');
});
