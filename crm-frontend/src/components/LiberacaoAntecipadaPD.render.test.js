import { renderToStaticMarkup } from "react-dom/server";
import LiberacaoAntecipadaPD from "@/components/LiberacaoAntecipadaPD";

vi.mock("@/lib/api", () => ({ default: { post: async () => ({}) } }));

const pedido = { status: "aguardando_diretoria", motivo: "Feira de sexta", solicitada_por_nome: "Paulo P&D", leituras_no_pedido: ["D24h"] };

test("P&D: botão Em Testes; aguardando a diretoria; aprovada com quem, quando e por quê", () => {
  const semPedido = renderToStaticMarkup(<LiberacaoAntecipadaPD req={{ id: "R", status: "IN_TESTS" }} podeEditar />);
  expect(semPedido).toContain('data-testid="pedir-liberacao"');
  expect(semPedido).toContain('Solicitar envio antecipado');
  expect(semPedido).toContain('Pode enviar com D0, mediante justificativa e aprovação de um administrador.');
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

test('D0: orientação e estado pendente aparecem sem sugerir envio aprovado',async()=>{
  const pronta=renderToStaticMarkup(<LiberacaoAntecipadaPD req={{id:'D0',status:'IN_TESTS'}} podeEditar />);
  const pendente=renderToStaticMarkup(<LiberacaoAntecipadaPD req={{id:'D0',status:'IN_TESTS',liberacao_antecipada:{...pedido,leituras_no_pedido:['D0']}}} podeEditar />);
  expect(pronta).toContain('A estabilidade continua em andamento.');
  expect(pendente).toContain('(D0)');
  expect(pendente).not.toContain('data-testid="pedir-liberacao"');
  if(process.env.PD_D0_PREVIEW==='1') {
    const fs=await import('node:fs');
    const dir=new URL('../../../scratch/d0-preview/',import.meta.url);
    fs.mkdirSync(dir,{recursive:true});
    const css=fs.readFileSync(new URL('../../../public/static/crm/index-C38vesZ-.css',import.meta.url),'utf8');
    fs.writeFileSync(new URL('preview.html',dir),`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>${css}</style><body class="bg-background text-foreground"><main style="max-width:780px;padding:24px;margin:auto"><h1 class="text-xl font-semibold">Envio antecipado — dados fictícios</h1>${pronta}<section class="mt-8">${pendente}</section></main></body></html>`);
  }
});
