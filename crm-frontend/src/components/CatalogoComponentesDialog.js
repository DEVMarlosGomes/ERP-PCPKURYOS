import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { formatApiError } from "@/lib/formatError";

/* KO-04: o ADM mantém os tipos de componente e os atributos sem deploy (config/tipos_componente).
 * Opções e unidades separadas por ";". "Outro" entra sozinho em todo menu. */

const NIVEL = { primaria: "Primária (Bloco 2)", secundaria: "Secundária (Bloco 3)", terciaria: "Terciária (Bloco 4)" };
const TIPO = { enum: "Menu", texto: "Texto", numero_unidade: "Número + unidade" };
const lista = (txt) => String(txt || "").split(";").map((x) => x.trim()).filter(Boolean);
const novoTipo = () => ({ codigo: "", nome: "", nivel_embalagem: "primaria", linha: "", ativo: true,
  atributos: [{ nome: "", tipo: "enum", opcoes: [], obrigatorio: true }], novo: true });

export default function CatalogoComponentesDialog({ open, onOpenChange, linhas, onSalvo }) {
  const [catalogo, setCatalogo] = useState([]);
  const [atual, setAtual] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => api.get("/config/tipos-componente").then(({ data }) => setCatalogo(Array.isArray(data) ? data : [])).catch(() => setCatalogo([]));
  useEffect(() => { if (open) carregar(); }, [open]);

  const editar = (tp) => setAtual(tp ? { ...tp, atributos: (tp.atributos || []).map((a) => ({ ...a })) } : novoTipo());
  const mudar = (campo, v) => setAtual((x) => ({ ...x, [campo]: v }));
  const mudarAtributo = (i, campo, v) => setAtual((x) => ({ ...x, atributos: x.atributos.map((a, j) => (j === i ? { ...a, [campo]: v } : a)) }));

  const salvar = async () => {
    const codigo = String(atual.codigo || "").trim().toUpperCase();
    if (!codigo) { toast.error("Informe o código do tipo (ex.: POTE)."); return; }
    setSalvando(true);
    try {
      const { novo, ...corpo } = atual;
      const atributos = corpo.atributos.map(({ texto_lista, ...a }) => (texto_lista === undefined ? a
        : { ...a, [a.tipo === "enum" ? "opcoes" : "unidades"]: lista(texto_lista) }));
      await api.put(`/config/tipos-componente/${encodeURIComponent(codigo)}`, { ...corpo, atributos, codigo });
      toast.success(`Tipo ${codigo} salvo. Já aparece no Kickoff.`);
      await carregar();
      setAtual(null);
      onSalvo?.();
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Catálogo de componentes</DialogTitle>
          <DialogDescription>Tipos que aparecem no menu de cada componente do Kickoff e as características pedidas para cada um.</DialogDescription>
        </DialogHeader>

        {!atual ? (
          <div className="space-y-3">
            {Object.entries(NIVEL).map(([nivel, rotulo]) => (
              <div key={nivel}>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{rotulo}</p>
                <div className="flex flex-wrap gap-2">
                  {catalogo.filter((tp) => tp.nivel_embalagem === nivel).map((tp) => (
                    <button key={tp.codigo} type="button" onClick={() => editar(tp)}
                      className="rounded-md border px-2.5 py-1 text-sm hover:bg-accent">{tp.nome} <span className="text-xs text-muted-foreground">· {tp.atributos?.length || 0}</span></button>
                  ))}
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => editar(null)}><Plus className="h-3.5 w-3.5" />Novo tipo</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div><Label>Código</Label><Input value={atual.codigo} disabled={!atual.novo} placeholder="POTE" onChange={(ev) => mudar("codigo", ev.target.value.toUpperCase())} /></div>
              <div className="md:col-span-2"><Label>Nome</Label><Input value={atual.nome} onChange={(ev) => mudar("nome", ev.target.value)} /></div>
              <div><Label>Nível</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={atual.nivel_embalagem} onChange={(ev) => mudar("nivel_embalagem", ev.target.value)}>
                  {Object.entries(NIVEL).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </div>
              <div className="md:col-span-3"><Label>Aparece na linha</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={atual.linha || ""} onChange={(ev) => mudar("linha", ev.target.value)}>
                  <option value="">Só em componente acrescentado à mão</option>
                  {(linhas[atual.nivel_embalagem] || []).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                </select>
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={atual.ativo !== false} onChange={(ev) => mudar("ativo", ev.target.checked)} />Ativo</label>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60"><tr>
                  <th className="px-2 py-2 text-left font-medium">Característica</th>
                  <th className="px-2 py-2 text-left font-medium">Campo</th>
                  <th className="px-2 py-2 text-left font-medium">Opções / unidades (separe com ;)</th>
                  <th className="px-2 py-2 text-left font-medium">Obrigatória</th>
                  <th className="px-2 py-2" />
                </tr></thead>
                <tbody className="divide-y">
                  {atual.atributos.map((a, i) => (
                    <tr key={i}>
                      <td className="px-2 py-2"><Input value={a.nome} onChange={(ev) => mudarAtributo(i, "nome", ev.target.value)} /></td>
                      <td className="px-2 py-2">
                        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={a.tipo} onChange={(ev) => mudarAtributo(i, "tipo", ev.target.value)}>
                          {Object.entries(TIPO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        {a.tipo === "texto" ? <span className="text-xs text-muted-foreground">texto livre</span> : (
                          <Input placeholder={a.tipo === "enum" ? "Redondo; Quadrado; Facetado" : "mL; g"}
                            value={a.texto_lista ?? ((a.tipo === "enum" ? a.opcoes : a.unidades) || []).join("; ")}
                            onChange={(ev) => mudarAtributo(i, "texto_lista", ev.target.value)} />
                        )}
                      </td>
                      <td className="px-2 py-2 text-center"><input type="checkbox" checked={a.obrigatorio !== false} onChange={(ev) => mudarAtributo(i, "obrigatorio", ev.target.checked)} /></td>
                      <td className="px-2 py-2">
                        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0"
                          onClick={() => setAtual((x) => ({ ...x, atributos: x.atributos.filter((_, j) => j !== i) }))}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1.5"
              onClick={() => setAtual((x) => ({ ...x, atributos: [...x.atributos, { nome: "", tipo: "enum", opcoes: [], obrigatorio: true }] }))}>
              <Plus className="h-3.5 w-3.5" />Característica
            </Button>
            <p className="text-xs text-muted-foreground">Mudar o catálogo não altera componentes já especificados: o Kickoff guarda as características escolhidas.</p>
          </div>
        )}

        <DialogFooter>
          {atual ? (
            <>
              <Button type="button" variant="outline" onClick={() => setAtual(null)}>Voltar</Button>
              <Button type="button" disabled={salvando} onClick={salvar}>Salvar tipo</Button>
            </>
          ) : <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
