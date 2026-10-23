import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { formatApiError } from "@/lib/formatError";
import { VINCULOS, responsavelPeloNome, rotuloResponsavel } from "@/lib/responsaveisTecnicos";

/* KO-06: RT do Kickoff escolhido de um cadastro; "+ cadastrar" aqui mesmo, sem recarregar.
 * Grava o nome (o que o resto do sistema lê) e o id. RT antigo em texto aparece como está. */
const VAZIO = { nome: "", cargo: "", registro_profissional: "", email: "", telefone: "", vinculo: "kuryos" };

export default function ResponsavelTecnicoField({ nome, id, onChange }) {
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const carregar = () => api.get("/crm/responsaveis-tecnicos").then(({ data }) => { const l = Array.isArray(data) ? data : []; setLista(l); return l; }).catch(() => []);
  useEffect(() => { carregar(); }, []);

  const atual = lista.find((r) => r.id === id) || responsavelPeloNome(lista, nome);
  const textoAntigo = !atual && String(nome || "").trim();
  const escolher = (valor) => {
    const r = lista.find((x) => x.id === valor);
    onChange(r ? { responsavel_tecnico: r.nome, responsavel_tecnico_id: r.id } : { responsavel_tecnico: valor === "__antigo__" ? nome : "", responsavel_tecnico_id: "" });
  };
  const salvar = async () => {
    setSalvando(true);
    try {
      const { data } = await api.post("/crm/responsaveis-tecnicos", novo);
      await carregar();
      onChange({ responsavel_tecnico: data.nome, responsavel_tecnico_id: data.id });
      toast.success(`${data.nome} cadastrado.`);
      setAberto(false);
      setNovo(VAZIO);
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setSalvando(false);
    }
  };
  const campo = (chave, rotulo, extra = {}) => (
    <div><Label>{rotulo}</Label><Input value={novo[chave]} onChange={(ev) => setNovo((x) => ({ ...x, [chave]: ev.target.value }))} {...extra} /></div>
  );

  return (
    <div>
      <Label>Responsavel Tecnico (RT)</Label>
      <div className="flex gap-2">
        <select className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" data-testid="responsavel-tecnico"
          value={atual?.id || (textoAntigo ? "__antigo__" : "")} onChange={(ev) => escolher(ev.target.value)}>
          <option value="">Selecione…</option>
          {textoAntigo && <option value="__antigo__">{textoAntigo} (texto antigo — cadastre para escolher)</option>}
          {lista.map((r) => <option key={r.id} value={r.id}>{rotuloResponsavel(r)}</option>)}
        </select>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={() => { setNovo({ ...VAZIO, nome: textoAntigo || "" }); setAberto(true); }}>
          <Plus className="h-3.5 w-3.5" />Cadastrar
        </Button>
      </div>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo responsável técnico</DialogTitle>
            <DialogDescription>Fica disponível em todos os Kickoffs.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">{campo("nome", "Nome completo *")}</div>
            {campo("cargo", "Cargo")}
            {campo("registro_profissional", "Registro (CRQ / CRF)", { placeholder: "CRQ 04123456" })}
            {campo("email", "E-mail", { type: "email" })}
            {campo("telefone", "Telefone")}
            <div className="sm:col-span-2">
              <Label>Vínculo *</Label>
              <div className="mt-1 flex gap-2">
                {Object.entries(VINCULOS).map(([v, r]) => (
                  <button key={v} type="button" onClick={() => setNovo((x) => ({ ...x, vinculo: v }))}
                    className={`rounded-md border px-3 py-1.5 text-sm ${novo.vinculo === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{r}</button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button type="button" disabled={salvando} onClick={salvar}>Cadastrar e escolher</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
