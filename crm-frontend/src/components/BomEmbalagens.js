import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { NIVEIS_BOM, arvoreDoBom, fornecedorDaLinha, quantidadeDaLinha, rotuloDoTipo } from "@/lib/bomArvore";

/* BOM-03 (reunião 28/10/2026): BOM de embalagens em Tabela ou Árvore (vista explodida, D-06).
 * O texto quebra em vez de forçar rolagem; no celular cada linha vira um cartão. */
const fmt = (v) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 }));
const fornecidoPor = (l) => (l.fornecido_por === "cliente" ? "Cliente" : l.fornecido_por === "kuryos" ? "Kuryos" : "—");

function Selos({ line }) {
  return (
    <>
      {line.definido === false && <Badge variant="secondary" className="ml-1">a definir</Badge>}
      {line.item_novo && <Badge variant="secondary" className="ml-1">item novo</Badge>}
    </>
  );
}

export default function BomEmbalagens({ bom = [], produto = "", sku = "" }) {
  const [vista, setVista] = useState("tabela");
  const linhas = (bom || []).filter((l) => l && l.tipo !== "mp_formula");
  const arvore = arvoreDoBom(linhas, { produto, sku });
  if (!linhas.length) return <p className="py-6 text-center text-sm text-muted-foreground">Nenhum componente aplicável no questionário ainda.</p>;
  const botao = (v, rotulo) => (
    <button type="button" aria-pressed={vista === v} onClick={() => setVista(v)} data-testid={`bom-vista-${v}`}
      className={`px-4 py-1.5 text-sm font-medium ${vista === v ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{rotulo}</button>
  );
  return (
    <div className="space-y-4" data-testid="bom-embalagens">
      <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="Vista do BOM">{botao("tabela", "Tabela")}{botao("arvore", "Árvore")}</div>
      {vista === "arvore" ? (
        <div className="space-y-2" data-testid="bom-arvore">
          <div className="flex items-start gap-2">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0"><p className="break-words font-medium">{arvore.produto || "Produto"}</p>{arvore.resumo && <p className="break-words text-xs text-muted-foreground">{arvore.resumo}</p>}</div>
          </div>
          {arvore.niveis.map((n) => (
            <div key={n.nivel || "outros"} className="space-y-2 pl-4 sm:pl-7">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                <div><p className="font-medium">{n.titulo}</p><p className="text-xs text-muted-foreground">{n.itens.length} componente(s)</p></div>
              </div>
              {n.itens.map((it) => (
                <div key={it.id} className="flex items-start gap-2 pl-4 sm:pl-7" data-testid="bom-arvore-item">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
                  <div className="min-w-0">
                    <p className="break-words text-sm">{it.titulo}</p>
                    {it.especificacao && <p className="break-words text-xs text-muted-foreground">{it.especificacao}</p>}
                    <p className="break-words text-xs text-muted-foreground">{it.detalhe}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : NIVEIS_BOM.map(([nivel, titulo]) => {
        const doNivel = linhas.filter((l) => (l.nivel || "") === nivel);
        if (!doNivel.length) return null;
        const terc = nivel === "terciaria";
        return (
          <div key={nivel || "outros"} className="space-y-2">
            <h3 className="text-sm font-semibold">{titulo}</h3>
            {/* Desktop: tabela que quebra o texto (sem largura mínima forçada). */}
            <table className="hidden w-full table-fixed text-sm sm:table" data-testid={`bom-${nivel || "outros"}`}>
              <thead>
                <tr className="border-b text-left">
                  <th className="w-28 py-2 pr-3">Código</th><th className="py-2 pr-3">Item</th><th className="py-2 pr-3">Especificação</th>
                  <th className="w-24 py-2 pr-3">Fornecido por</th><th className="w-28 py-2 pr-3">Fornecedor</th>
                  <th className="w-20 py-2 pr-3 text-right">{terc ? "Unid./emb." : "Qtd/un"}</th><th className="w-20 py-2 pr-3 text-right">Qtd lote</th><th className="w-24 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {doNivel.map((line) => (
                  <tr key={line.id} className="border-b align-top last:border-b-0">
                    <td className="break-all py-2 pr-3 font-mono text-xs">{line.codigo_interno}</td>
                    <td className="break-words py-2 pr-3">{line.descricao}<Selos line={line} /></td>
                    <td className="break-words py-2 pr-3 text-muted-foreground">{line.especificacao || "-"}</td>
                    <td className="py-2 pr-3">{fornecidoPor(line)}</td>
                    <td className="break-words py-2 pr-3">{line?.fornecedor_principal?.nome || "-"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(terc ? line.unidades_por_embalagem : line.quantidade_por_unidade)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(line.quantidade_total_pedido)}</td>
                    <td className="py-2"><Badge variant={line.status_homologacao === "homologado" ? "outline" : "secondary"}>{line.status_homologacao}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Celular: cada linha vira um cartão. */}
            <div className="space-y-2 sm:hidden" data-testid={`bom-cartoes-${nivel || "outros"}`}>
              {doNivel.map((line) => (
                <div key={line.id} className="rounded-md border p-3">
                  <p className="break-words text-sm font-medium">{line.descricao}<Selos line={line} /></p>
                  <p className="break-words text-xs text-muted-foreground">{titulo} · {rotuloDoTipo(line)}{line.especificacao && line.especificacao !== line.descricao ? ` · ${line.especificacao}` : ""}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-muted-foreground">Qtd</p><p className="tabular-nums">{quantidadeDaLinha(line)}</p></div>
                    <div><p className="text-muted-foreground">Total</p><p className="tabular-nums">{fmt(line.quantidade_total_pedido)}</p></div>
                    <div className="min-w-0"><p className="text-muted-foreground">Fornecedor</p><p className="break-words">{fornecedorDaLinha(line)}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
