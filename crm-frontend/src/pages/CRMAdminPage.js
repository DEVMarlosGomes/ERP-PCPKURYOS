import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { formatApiError } from "@/lib/formatError";
import { CLIENT_STAGES, PROJECT_STAGES, SAMPLE_STAGES, stageLabel } from "@/lib/crmRules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { History, Pencil, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";

/* Painel do administrador para corrigir e remover cards do funil comercial.
 * Toda edição exige motivo e vai para o histórico do card e para audit_log;
 * exclusão de card com dependentes só acontece em cascata confirmada. */

const KINDS = {
  client: { label: "Clientes (CRM1)", stages: CLIENT_STAGES, title: (r) => r.nome_empresa || r.nome || r.id, sub: (r) => r.cnpj || r.contato_principal?.email || "" },
  project: { label: "Projetos (CRM2)", stages: PROJECT_STAGES, title: (r) => r.nome_projeto || r.id, sub: (r) => r.cliente_nome || "" },
  sample: { label: "Amostras (CRM3)", stages: SAMPLE_STAGES, title: (r) => r.nome_produto || r.nome_amostra || r.id, sub: (r) => [r.numero_amostra, r.projeto_nome].filter(Boolean).join(" · ") },
};

const EDITABLE = {
  client: [["nome_empresa", "Empresa"], ["cnpj", "CNPJ"], ["responsavel_comercial", "Responsável comercial"], ["segmento", "Segmento"], ["temperatura_lead", "Temperatura"]],
  project: [["nome_projeto", "Projeto"], ["categoria", "Categoria"], ["responsavel_comercial", "Responsável comercial"], ["posicionamento", "Posicionamento"], ["volume_estimado_pedido", "Volume estimado do pedido"]],
  sample: [["nome_produto", "Produto"], ["categoria", "Categoria"], ["briefing_base", "Briefing"]],
};

function errorText(error) {
  return formatApiError(error) || "Não foi possível concluir.";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function CRMAdminPage() {
  const [kind, setKind] = useState("client");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [draft, setDraft] = useState({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/crm/admin/cards/${kind}`);
      setRecords(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(errorText(error));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = [...records].sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
    if (!term) return list;
    return list.filter((r) => [KINDS[kind].title(r), KINDS[kind].sub(r), r.stage, r.id].join(" ").toLowerCase().includes(term));
  }, [records, query, kind]);

  async function openRecord(record) {
    setSelected(record);
    setDraft({ stage: record.stage, ...Object.fromEntries(EDITABLE[kind].map(([field]) => [field, record[field] ?? ""])) });
    setReason("");
    setDetail(null);
    try {
      const { data } = await api.get(`/crm/admin/cards/${kind}/${record.id}`);
      setDetail(data);
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  async function save() {
    if (!selected) return;
    const changes = Object.fromEntries(Object.entries(draft).filter(([field, value]) => String(value ?? "") !== String(selected[field] ?? "")));
    if (!Object.keys(changes).length) { toast.message("Nada foi alterado."); return; }
    if (reason.trim().length < 10) { toast.error("Informe o motivo da edição (mínimo 10 caracteres)."); return; }
    setSaving(true);
    try {
      await api.put(`/crm/admin/cards/${kind}/${selected.id}`, { ...changes, justificativa: reason.trim() });
      toast.success("Card atualizado e registrado no histórico.");
      setSelected(null);
      load();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(record, cascade) {
    try {
      const { data } = await api.delete(`/crm/admin/cards/${kind}/${record.id}${cascade ? "?cascade=1" : ""}`);
      toast.success(cascade && (data.deleted_projects || data.deleted_samples)
        ? `Removido com ${data.deleted_projects} projeto(s) e ${data.deleted_samples} amostra(s).`
        : "Card removido.");
      setConfirmDelete(null);
      setSelected(null);
      load();
    } catch (error) {
      if (error?.response?.status === 409 && !cascade) {
        setConfirmDelete({ record, cascade: true, message: errorText(error) });
        return;
      }
      toast.error(errorText(error));
    }
  }

  const history = selected?.historico_movimentacoes || [];

  return (
    <div className="dashboard-shell-wide space-y-5" data-testid="crm-admin-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="dashboard-eyebrow">Comercial · Administração</p>
          <h1 className="dashboard-title">Gerenciar cards do funil</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Corrija ou remova clientes, projetos e amostras. Toda alteração pede motivo e fica no histórico do card e na auditoria.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="dashboard-tabs" role="tablist" aria-label="Tipo de card">
          {Object.entries(KINDS).map(([key, cfg]) => (
            <button key={key} type="button" role="tab" aria-selected={kind === key} data-active={kind === key} className="dashboard-tab" onClick={() => { setKind(key); setQuery(""); }}>
              {cfg.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, código, etapa…" className="pl-9" aria-label="Buscar cards" />
        </div>
      </div>

      <section className="dashboard-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Card</th>
                <th className="px-4 py-3 font-semibold">Etapa</th>
                <th className="px-4 py-3 font-semibold">Atualizado</th>
                <th className="px-4 py-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Carregando…</td></tr>}
              {!loading && !filtered.length && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">{query ? "Nenhum card corresponde à busca." : "Nenhum card cadastrado neste quadro."}</td></tr>
              )}
              {!loading && filtered.map((record) => (
                <tr key={record.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="font-medium">{KINDS[kind].title(record)}</div>
                    <div className="text-xs text-muted-foreground">{KINDS[kind].sub(record)}</div>
                  </td>
                  <td className="px-4 py-3"><Badge variant="secondary">{stageLabel(record.stage)}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(record.updated_at || record.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openRecord(record)}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                      <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmDelete({ record, cascade: false })}><Trash2 className="h-3.5 w-3.5" /> Excluir</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{KINDS[kind].title(selected)}</SheetTitle>
                <SheetDescription>Edição administrativa — o motivo fica registrado.</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label>Etapa</Label>
                  <Select value={draft.stage || ""} onValueChange={(value) => setDraft((d) => ({ ...d, stage: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KINDS[kind].stages.map((stage) => <SelectItem key={stage} value={stage}>{stageLabel(stage)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {EDITABLE[kind].map(([field, label]) => (
                  <div key={field} className="space-y-1.5">
                    <Label htmlFor={`adm-${field}`}>{label}</Label>
                    <Input id={`adm-${field}`} value={draft[field] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))} />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <Label htmlFor="adm-reason">Motivo da edição</Label>
                  <Textarea id="adm-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: cliente cadastrado com CNPJ errado" />
                  <p className="text-xs text-muted-foreground">Obrigatório, mínimo de 10 caracteres.</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
                  <Button onClick={save} disabled={saving} className="gap-2"><ShieldCheck className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar alteração"}</Button>
                </div>

                <section className="space-y-2 border-t pt-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Histórico do card</h3>
                  {!history.length && <p className="text-sm text-muted-foreground">Sem movimentações registradas.</p>}
                  <ol className="space-y-2">
                    {[...history].reverse().map((h, index) => (
                      <li key={`${h.data}-${index}`} className="rounded-lg border p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{h.de_label || stageLabel(h.de)} → {h.para_label || stageLabel(h.para)}</span>
                          {h.is_regression && <Badge variant="outline">Retorno</Badge>}
                          {h.administrativo && <Badge variant="outline">Administrativo</Badge>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{h.usuario || "—"} · {formatDate(h.data)}</div>
                        {h.justificativa && <p className="mt-1.5 text-sm">“{h.justificativa}”</p>}
                      </li>
                    ))}
                  </ol>
                  {detail && (
                    <p className="text-xs text-muted-foreground">
                      Vínculos: {detail.dependents?.projects?.length || 0} projeto(s), {detail.dependents?.samples?.length || 0} amostra(s) · {detail.audit?.length || 0} registro(s) de auditoria.
                    </p>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDelete?.cascade ? "Excluir com tudo o que está vinculado?" : "Excluir este card?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.cascade
                ? `${confirmDelete.message} Projetos, amostras e cards de P&D vinculados também serão removidos.`
                : `“${confirmDelete ? KINDS[kind].title(confirmDelete.record) : ""}” será removido. A exclusão fica registrada na auditoria.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); remove(confirmDelete.record, confirmDelete.cascade); }}>
              {confirmDelete?.cascade ? "Excluir em cascata" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
