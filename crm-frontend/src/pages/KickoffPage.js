import { useCallback, useEffect, useMemo, useState } from "react";
import { hasAnyRole } from "@/lib/crmRules";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { formatApiError } from "@/lib/formatError";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Archive, CheckCircle2, Download, FileText, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { hasRole } from "@/components/RoleGuard";
import KickoffCompositionQuestionnaire, { questionnaireFromKickoff } from "@/components/KickoffCompositionQuestionnaire";
import { ROTULO_ESTADO } from "@/lib/kickoffBlocos";

const STATUS_TONE = {
  em_preenchimento: "secondary",
  aguardando_aprovacao: "default",
  aprovado: "outline",
  em_revisao: "secondary",
  substituida: "destructive",
  arquivado: "destructive",
};

const STATUS_LABEL = {
  em_preenchimento: "Em preenchimento",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  em_revisao: "Em revisão",
  substituida: "Substituída",
  arquivado: "Arquivado",
};

const STEP_LABEL = { pendente: "Pendente", concluida: "Aprovada", reprovada: "Reprovada" };

const APPROVAL_ROLES = {
  lider_pd: ["admin", "lider_pd"],
  cq: ["admin", "qa", "qualidade"],
  eng_produto: ["admin", "engenharia_produto"],
  comercial: ["admin", "vendedor", "sales_ops", "sucesso_cliente"], // KO-07: o adaptador confere o responsável do cliente
  direcao: ["admin"],
};

// RFC-001: nome do bloco e quem valida (D-1).
const NOME_BLOCO = { bloco0: "Bloco 0 · Identificação", bloco1: "Bloco 1 · Formulação", bloco2: "Bloco 2 · Primária", bloco3: "Bloco 3 · Secundária",
  bloco4: "Bloco 4 · Terciária", bloco5: "Bloco 5 · Qualidade", fechamento: "Fechamento" };
const NOME_DONO = { comercial: "Comercial", lider_pd: "Líder P&D", eng_produto: "Engenharia", cq: "CQ" };
const COR_ESTADO = {
  nao_iniciado: "bg-muted text-muted-foreground", em_preenchimento: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  pronto: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300", validado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  congelado: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function StatusGrid({ status, estados, podeValidar, onValidar, validando }) {
  const entries = Object.entries(status || {});
  if (!entries.length) return null;
  return (
    <div className="grid gap-2 md:grid-cols-4" data-testid="kickoff-blocos">
      {entries.map(([key, info]) => {
        const e = estados?.[key];
        return (
          <div key={key} className="rounded-md border bg-muted/30 px-3 py-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">{NOME_BLOCO[key] || key}</p>
              {info.completo ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}
            </div>
            {e && (
              <div className="flex flex-wrap items-center gap-1">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${COR_ESTADO[e.estado] || ""}`}>{ROTULO_ESTADO[e.estado] || e.estado}</span>
                {e.aguardando === "pd" && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">aguardando P&D</span>}
                <span className="text-[10px] text-muted-foreground">valida: {NOME_DONO[e.dono] || e.dono}</span>
              </div>
            )}
            {e?.estado === "validado" && e.validado_por_nome && <p className="text-[10px] text-muted-foreground">por {e.validado_por_nome}</p>}
            {e?.invalidado_em && <p className="text-[10px] text-amber-700">alterado depois de validado — validar de novo</p>}
            {!info.completo && (
              <p className="truncate text-xs text-muted-foreground" title={(info.pendencias || []).map((p) => p.rotulo).join(" · ")}>
                {(info.campos_pendentes || []).length} pendente(s)
              </p>
            )}
            {e?.estado === "pronto" && !e.aguardando && podeValidar?.(e.dono) && (
              <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={validando === key} onClick={() => onValidar(key)}>Validar</Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function KickoffPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [kickoff, setKickoff] = useState(null);
  const [questionario, setQuestionario] = useState(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [activeTab, setActiveTab] = useState("questionario");

  const loadKickoff = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/kickoff/${id}`);
      setKickoff(data);
      setQuestionario(questionnaireFromKickoff(data));
    } catch (error) {
      toast.error(formatApiError(error));
      navigate("/kickoffs");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadKickoff();
  }, [loadKickoff]);

  const currentApproval = kickoff?.aprovacao_pendente || null;
  const canApproveCurrent = useMemo(() => {
    if (!currentApproval || !user?.role) return false;
    return (APPROVAL_ROLES[currentApproval.etapa] || []).includes(user.role) || user.role === "admin";
  }, [currentApproval, user]);

  // RFC-001: validar um bloco pronto antes da etapa (o adaptador confere papel e responsável).
  const [validandoBloco, setValidandoBloco] = useState(null);
  const podeValidar = useCallback((dono) => user?.role === "admin" || (APPROVAL_ROLES[dono] || []).includes(user?.role), [user]);
  const validarBloco = async (bloco) => {
    setValidandoBloco(bloco);
    try {
      const { data } = await api.post(`/kickoff/${id}/blocos/${bloco}/validar`);
      setKickoff(data);
      toast.success("Bloco validado.");
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setValidandoBloco(null);
    }
  };

  const saveQuestionario = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/kickoff/${id}/questionario-composicao`, { questionario });
      toast.success("Questionario salvo.");
      setKickoff(data);
      setQuestionario(questionnaireFromKickoff(data));
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const submitApproval = async (decisao) => {
    if (!currentApproval) return;
    if (decisao === "reprovado" && !approvalReason.trim()) {
      toast.error("Informe a justificativa da reprovacao.");
      return;
    }
    setDecisionLoading(true);
    try {
      await api.post(`/kickoff/${id}/aprovacao`, {
        etapa: currentApproval.etapa,
        decisao,
        justificativa: decisao === "reprovado" ? approvalReason : undefined,
        observacoes: approvalNotes || undefined,
      });
      setApprovalNotes("");
      setApprovalReason("");
      toast.success(decisao === "aprovado" ? "Aprovacao registrada." : "Reprovacao registrada.");
      await loadKickoff();
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setDecisionLoading(false);
    }
  };

  const exportBom = async () => {
    try {
      const response = await api.post(`/kickoff/${id}/bom/export`, { formato: "csv" }, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bom_${kickoff?.numero_kickoff || id}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(formatApiError(error));
    }
  };

  const archiveKickoff = async () => {
    const motivo = window.prompt("Motivo do arquivamento do Kickoff") || "";
    if (!motivo.trim()) return;
    try {
      const { data } = await api.delete(`/kickoff/${id}`, { data: { motivo } });
      toast.success("Kickoff arquivado.");
      setKickoff(data);
      setQuestionario(questionnaireFromKickoff(data));
    } catch (error) {
      toast.error(formatApiError(error));
    }
  };

  const restoreKickoff = async () => {
    try {
      const { data } = await api.post(`/kickoff/${id}/restore`);
      toast.success("Kickoff restaurado.");
      setKickoff(data);
      setQuestionario(questionnaireFromKickoff(data));
    } catch (error) {
      toast.error(formatApiError(error));
    }
  };

  if (loading || !kickoff || !questionario) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando kickoff...</div>;
  }

  const block1 = kickoff.bloco1 || {};
  const canManage = hasRole(user, ["admin", "sales_ops", "vendedor"]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6" data-testid="kickoff-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-heading font-semibold tracking-tight">{kickoff.titulo || kickoff.numero_kickoff}</h1>
            <Badge variant={STATUS_TONE[kickoff.status] || "secondary"}>{STATUS_LABEL[kickoff.status] || kickoff.status}</Badge>
            <Badge variant="outline">{kickoff.versao}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {questionario.bloco0?.cliente || block1.cliente || "-"} · {questionario.bloco0?.nome_produto || block1.projeto_vinculado || "-"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => navigate("/kickoffs")}>Voltar</Button>
          <Button variant="outline" onClick={exportBom}>
            <Download className="h-4 w-4 mr-2" />
            Exportar BOM
          </Button>
          {kickoff.status === "arquivado" ? (
            canManage && (
              <Button variant="outline" onClick={restoreKickoff} className="gap-1.5">
                <RotateCcw className="h-4 w-4" />
                Restaurar
              </Button>
            )
          ) : (
            canManage && (
              <Button variant="outline" onClick={archiveKickoff} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
                <Archive className="h-4 w-4" />
                Arquivar
              </Button>
            )
          )}
          {kickoff.status === "aprovado" && hasRole(user, ["admin", "sales_ops", "vendedor", "compras"]) && (
            <Button onClick={() => navigate("/contratos")} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
              <FileText className="h-4 w-4" />
              Gerar Contrato
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium">Questionario de Composicao de Projeto</p>
              <p className="text-xs text-muted-foreground">Briefing de industrializacao - preenchimento conjunto Kuryos + Cliente.</p>
            </div>
            <p className="text-sm font-medium">{kickoff.progress?.percentual || 0}%</p>
          </div>
          <Progress value={kickoff.progress?.percentual || 0} />
          <StatusGrid status={kickoff.blocos_status} estados={kickoff.blocos_estado} podeValidar={podeValidar} onValidar={validarBloco} validando={validandoBloco} />
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="questionario">Questionario</TabsTrigger>
          <TabsTrigger value="bom">BOM</TabsTrigger>
          <TabsTrigger value="aprovacao">Aprovacao</TabsTrigger>
        </TabsList>

        <TabsContent value="questionario">
          <KickoffCompositionQuestionnaire
            value={questionario}
            onChange={setQuestionario}
            onSave={saveQuestionario}
            saving={saving || kickoff.status === "arquivado"}
          />
        </TabsContent>

        <TabsContent value="bom">
          {/* BOM-01 (23/10/2026): dois documentos — ficha de manipulação (P&D) e BOM de embalagens por nível. */}
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-medium">BOM de embalagens</h2>
                    <p className="text-sm text-muted-foreground">Uma linha por componente aplicável do questionário, com a quantidade do Kickoff. Terciária arredonda para cima.</p>
                  </div>
                  <Button variant="outline" onClick={loadKickoff}>Atualizar</Button>
                </div>
                {["primaria", "secundaria", "terciaria", ""].map((nivel) => {
                  const linhas = (kickoff.bom || []).filter((l) => (l.nivel || "") === nivel);
                  if (!linhas.length) return null;
                  return (
                    <div key={nivel || "outros"} className="mb-4 overflow-x-auto">
                      <h3 className="mb-1 text-sm font-semibold">{{ primaria: "Primária", secundaria: "Secundária", terciaria: "Terciária", "": "Outros" }[nivel]}</h3>
                      <table className="w-full min-w-[900px] text-sm" data-testid={`bom-${nivel || "outros"}`}>
                        <thead>
                          <tr className="border-b text-left">
                            <th className="py-2 pr-3">Código</th>
                            <th className="py-2 pr-3">Item</th>
                            <th className="py-2 pr-3">Especificação</th>
                            <th className="py-2 pr-3">Fornecido por</th>
                            <th className="py-2 pr-3">Fornecedor</th>
                            <th className="py-2 pr-3">{nivel === "terciaria" ? "Unid./emb." : "Qtd/un"}</th>
                            <th className="py-2 pr-3">Qtd pedido</th>
                            <th className="py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linhas.map((line) => (
                            <tr key={line.id} className="border-b last:border-b-0">
                              <td className="py-2 pr-3 font-mono text-xs">{line.codigo_interno}</td>
                              <td className="py-2 pr-3">{line.descricao}{line.definido === false && <Badge variant="secondary" className="ml-1">a definir</Badge>}{line.item_novo && <Badge variant="secondary" className="ml-1">item novo</Badge>}</td>
                              <td className="py-2 pr-3 text-muted-foreground">{line.especificacao || "-"}</td>
                              <td className="py-2 pr-3">{line.fornecido_por === "cliente" ? "Cliente" : line.fornecido_por === "kuryos" ? "Kuryos" : "-"}</td>
                              <td className="py-2 pr-3">{line?.fornecedor_principal?.nome || "-"}</td>
                              <td className="py-2 pr-3">{nivel === "terciaria" ? (line.unidades_por_embalagem ?? "-") : (line.quantidade_por_unidade ?? "-")}</td>
                              <td className="py-2 pr-3">{line.quantidade_total_pedido ?? "-"}</td>
                              <td className="py-2">
                                <Badge variant={line.status_homologacao === "homologado" ? "outline" : "secondary"}>{line.status_homologacao}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                {(kickoff.bom || []).length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum componente aplicável no questionário ainda.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h2 className="font-medium">Ficha de manipulação</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  Matérias-primas da fórmula do P&D{kickoff.bloco1?.formula_vinculada ? ` (${kickoff.bloco1.formula_vinculada})` : ""}. Documento separado do BOM de embalagens.
                </p>
                {(kickoff.ficha_manipulacao?.itens || []).length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-sm" data-testid="ficha-manipulacao">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3">Código</th>
                          <th className="py-2 pr-3">MP</th>
                          <th className="py-2 pr-3">Qtd/un</th>
                          <th className="py-2 pr-3">Qtd pedido</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kickoff.ficha_manipulacao.itens.map((line) => (
                          <tr key={line.id} className="border-b last:border-b-0">
                            <td className="py-2 pr-3 font-mono text-xs">{line.codigo_interno}</td>
                            <td className="py-2 pr-3">{line.descricao}</td>
                            <td className="py-2 pr-3">{line.quantidade_por_unidade} {line.unidade}</td>
                            <td className="py-2 pr-3">{line.quantidade_total_pedido} {line.unidade}</td>
                            <td className="py-2"><Badge variant={line.status_homologacao === "homologado" ? "outline" : "secondary"}>{line.status_homologacao}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-4 text-sm text-muted-foreground">{kickoff.formula_id ? "Fórmula sem ingredientes." : "Aguardando o P&D registrar a fórmula."}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="aprovacao">
          <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
            <Card>
              <CardContent className="p-5 space-y-4">
                <h2 className="font-medium">Timeline de aprovacao</h2>
                {(kickoff.aprovacoes || []).map((step) => (
                  <div key={step.etapa} className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {step.status === "concluida" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : step.status === "reprovada" ? <XCircle className="h-5 w-5 text-red-600" /> : <div className="h-5 w-5 rounded-full border" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{step.label}</p>
                      <p className="text-xs text-muted-foreground">{STEP_LABEL[step.status] || step.status}{step.decidido_por_nome ? ` · ${step.decidido_por_nome}` : ""}{step.decidido_em ? ` · ${formatDate(step.decidido_em)}` : ""}</p>
                      {(step.requisitos_dispensados || []).length > 0 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Dispensado pelo administrador: {step.requisitos_dispensados.join("; ")}</p>}
                      {step.justificativa && <p className="mt-1 text-xs text-red-600">{step.justificativa}</p>}
                      {step.observacoes && <p className="mt-1 text-xs text-muted-foreground">{step.observacoes}</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-4">
                <h2 className="font-medium">Decisao atual</h2>
                {kickoff.locks?.aprovacao && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {kickoff.locks.aprovacao}
                  </div>
                )}
                {currentApproval ? (
                  <>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Etapa pendente</p>
                      <p className="font-medium">{currentApproval.label}</p>
                    </div>
                    <div>
                      <Label>Observacoes</Label>
                      <Textarea value={approvalNotes} onChange={(event) => setApprovalNotes(event.target.value)} />
                    </div>
                    <div>
                      <Label>Justificativa da reprovacao</Label>
                      <Input value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <Button disabled={decisionLoading || !canApproveCurrent || !!kickoff.locks?.aprovacao} onClick={() => submitApproval("aprovado")} className="flex-1">
                        Aprovar
                      </Button>
                      <Button disabled={decisionLoading || !canApproveCurrent || !!kickoff.locks?.aprovacao} variant="destructive" onClick={() => submitApproval("reprovado")} className="flex-1">
                        Reprovar
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma aprovacao pendente.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
