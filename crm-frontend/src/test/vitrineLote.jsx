// Vitrine da manipulação em lote para os prints (P3): ?cena=painel|editor|ordem|manipulado&tema=dark.
// Dados fictícios (src/test/vitrineLoteApi.js entra no lugar de @/lib/api só na config da vitrine).
import { createRoot } from "react-dom/client";
import "@/index.css";
// A vitrine precisa carregar a camada global que também envolve o CRM em produção.
// Ela define, entre outros contratos, a altura-base dos cabeçalhos de tabela.
import "../../../public/shared/kuryos-ui-components.css";
import PainelAmostrasProjeto, { LoteDialog } from "@/components/ManipulacaoLote/PainelAmostrasProjeto";
import EditorLote from "@/components/ManipulacaoLote/EditorLote";
import OrdemLote from "@/components/ManipulacaoLote/OrdemLote";
import { LinhaNovoIngrediente } from "@/components/ManipulacaoLote/NovoIngredienteLote";
import { montarLote } from "@/test/vitrineLoteApi";

const q = new URLSearchParams(window.location.search);
if (q.get("tema") === "dark") document.documentElement.classList.add("dark");
const cena = q.get("cena") || "painel";
const user = { role: "pd", nome: "Química (fictícia)" };
const nada = async () => null;
const custos = { por_amostra: { R1: { brl_kg: 38.42, brl_amostra: 1.92 }, R2: { brl_kg: 41.1, brl_amostra: 2.06 }, R3: { brl_kg: 36.9, brl_amostra: 1.85 }, R4: { brl_kg: 44.3, brl_amostra: 2.22 } }, total_brl: 8.05 };

function Cena() {
  // Como em produção: o lote abre no diálogo (portal no body), com o CSS do crm-app.html (o script injeta).
  if (cena === "dialogo") return <LoteDialog loteId="LV" user={user} onClose={() => {}} />;
  if (cena === "painel") return <PainelAmostrasProjeto projetoId="P1" requestId="R1" user={user} />;
  if (cena === "editor") return <EditorLote detalhe={{ lote: montarLote("rascunho"), estado: {}, eu: "pd", pode_editar: true }} user={user} recarregar={nada} />;
  // 05/11: caso do LM-2026-041-2 — amostras sem fórmula, matriz vazia; ?gramas=1 já com as quantidades.
  if (cena === "editor-vazio") {
    const lote = montarLote("rascunho");
    lote.matriz = { tipo: "vazia", ref_id: null, codigo: "", celulas: {} };
    lote.motivos = {};
    if (q.get("amostras") === "3") {
      delete lote.membros.R4;
      delete lote.celulas.R4;
    }
    for (const m of Object.values(lote.membros)) { m.versao_antes = null; if (q.get("gramas") !== "1") m.quantidade_g = undefined; }
    return <EditorLote detalhe={{ lote, estado: {}, eu: "pd", pode_editar: true }} user={user} recarregar={nada} />;
  }
  if (cena === "adicionar") {
    const lote = montarLote("rascunho");
    return <LinhaNovoIngrediente ingredientes={lote.ingredientes} ativos={Object.keys(lote.membros)} codigoDe={(r) => lote.membros[r].codigo_amostra} onAdicionar={() => {}} />;
  }
  if (cena === "ordem") return <OrdemLote detalhe={{ lote: montarLote("ordem_gerada"), eu: "pd", pode_editar: true }} user={user} recarregar={nada} />;
  return <OrdemLote detalhe={{ lote: montarLote("manipulado"), eu: "pd", pode_editar: true, custos }} user={user} recarregar={nada} />;
}

createRoot(document.getElementById("root")).render(
  <div className="min-h-screen bg-background p-3 text-foreground sm:p-6" data-cena={cena}>
    <h1 className="mb-3 text-lg font-semibold">Manipulação em lote — {cena}</h1>
    <Cena />
  </div>,
);
