import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import api from "@/lib/api";
import { CANAIS_APROVACAO, validarAprovacaoCliente } from "@/lib/aprovacaoCliente";
import { formatApiError } from "@/lib/formatError";

// "AAAA-MM-DDTHH:mm" no fuso do navegador (valor do input datetime-local).
const agoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const vazio = () => ({ contato_id: "", quem_nome: "", quem_cargo: "", canal: "", canal_outro: "", aprovado_em: agoraLocal(), observacao: "" });

/* COM-02: quem aprovou do lado do cliente, por qual canal, em que data e hora. Um componente
 * só para amostra (CRM2/CRM3) e orçamento. `origem` = { tipo: "projeto" | "amostra", id }
 * busca os contatos do cliente; `onConfirm(aprovacao_cliente)` grava (o adaptador confere de novo). */
export default function AprovacaoClienteModal({ open, onOpenChange, titulo, descricao, origem, rotuloConfirmar = "Registrar", onConfirm }) {
  const [form, setForm] = useState(vazio);
  const [contatos, setContatos] = useState([]);
  const [erros, setErros] = useState([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(vazio());
    setErros([]);
    if (!origem?.id) { setContatos([]); return; }
    api.get(`/crm/contatos-aprovacao/${origem.tipo}/${origem.id}`)
      .then(({ data }) => setContatos(data?.contatos || []))
      .catch(() => setContatos([]));
  }, [open, origem?.tipo, origem?.id]);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const escolherContato = (id) => {
    const c = contatos.find((x) => x.id === id);
    setForm((f) => ({ ...f, contato_id: id, quem_nome: c ? c.nome : f.quem_nome, quem_cargo: c ? c.cargo : f.quem_cargo }));
  };

  const confirmar = async () => {
    const dados = { ...form, aprovado_em: form.aprovado_em ? new Date(form.aprovado_em).toISOString() : "" };
    const v = validarAprovacaoCliente(dados);
    if (!v.ok) { setErros(v.erros); return; }
    setSalvando(true);
    try {
      await onConfirm(dados);
      onOpenChange(false);
    } catch (err) {
      setErros([formatApiError(err) || "Não foi possível registrar."]);
    } finally { setSalvando(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !salvando && onOpenChange(o)}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg" data-testid="modal-aprovacao-cliente">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" />{titulo || "Registro do retorno do cliente"}</DialogTitle>
          <DialogDescription>{descricao || "Quem decidiu do lado do cliente, por qual canal e quando. Fica na linha do tempo do projeto."}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {contatos.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Contato do cliente</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.contato_id} onChange={(e) => escolherContato(e.target.value)}>
                <option value="">Outra pessoa (digitar)</option>
                {contatos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` — ${c.cargo}` : ""}{c.decisor ? " · decisor" : ""}</option>)}
              </select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Quem aprovou <span className="text-red-500">*</span></Label>
              <Input value={form.quem_nome} onChange={(e) => set("quem_nome", e.target.value)} placeholder="Nome" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cargo</Label>
              <Input value={form.quem_cargo} onChange={(e) => set("quem_cargo", e.target.value)} placeholder="Opcional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Canal <span className="text-red-500">*</span></Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.canal} onChange={(e) => set("canal", e.target.value)} data-testid="aprovacao-canal">
                <option value="">Selecione…</option>
                {CANAIS_APROVACAO.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data e horário <span className="text-red-500">*</span></Label>
              <Input type="datetime-local" max={agoraLocal()} value={form.aprovado_em} onChange={(e) => set("aprovado_em", e.target.value)} />
            </div>
          </div>
          {form.canal === "outro" && (
            <div className="space-y-1">
              <Label className="text-xs">Qual canal? <span className="text-red-500">*</span></Label>
              <Input value={form.canal_outro} onChange={(e) => set("canal_outro", e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Observação</Label>
            <Textarea rows={2} value={form.observacao} onChange={(e) => set("observacao", e.target.value)} placeholder="Opcional (ex.: aprovou por áudio no grupo do projeto)" />
          </div>
          {erros.length > 0 && (
            <ul className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {erros.map((e) => <li key={e}>• {e}</li>)}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={salvando} className="gap-1.5" data-testid="aprovacao-confirmar">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}{rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
