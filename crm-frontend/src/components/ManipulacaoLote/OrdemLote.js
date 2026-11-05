/* Ordem do lote (LM-08, spec 2026-11-04 §10): imprimir, pesar (desvio com motivo), corrigir (registro
 * novo), conferir (outra pessoa), registrar a manipulação com a conciliação de massa e, depois, as ações em
 * lote (Em Testes, estabilidade, liberação antecipada), ocorrência e "Tornar a matriz a nova base". */
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { formatApiError } from "@/lib/formatError";
import { ordemLoteHtml } from "@/lib/ordemLoteHtml";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, Printer, Scale, XCircle } from "lucide-react";
import { MIN_MOTIVO, MIN_MOTIVO_DEPOIS_DA_ORDEM, conciliacaoMassa, desvioPesagem, fmtG } from "@/lib/manipulacaoLote";
import { MotivoDialog } from "./EditorLote";

const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quando = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const ativosDe = (lote) => Object.keys(lote.membros || {}).filter((r) => lote.membros[r]?.status_membro !== "removido");

function imprimir(lote) {
  const w = window.open("", "_blank");
  if (!w) { toast.error("O navegador bloqueou a janela de impressão — libere pop-ups para este site."); return; }
  w.document.write(ordemLoteHtml(lote));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export default function OrdemLote({ detalhe, user, recarregar }) {
  const { lote, eu } = detalhe;
  const pode = Boolean(detalhe.pode_editar);
  const o = lote.ordem || {};
  const ativos = useMemo(() => ativosDe(lote), [lote]);
  const cod = (r) => lote.membros[r]?.codigo_amostra || r;
  const linhas = useMemo(() => Object.entries(o.linhas_pesagem || {})
    .filter(([, l]) => !l.request_id || lote.membros[l.request_id])
    .sort(([, a], [, b]) => (a.tipo === b.tipo ? 0 : a.tipo === "pre_mistura" ? -1 : 1) || String(a.codigo_amostra || "").localeCompare(String(b.codigo_amostra || "")) || String(a.fase).localeCompare(String(b.fase))), [o.linhas_pesagem, lote.membros]);
  const atual = (id) => { const p = lote.pesagens?.[id]; return p?.atual ? p.registros?.[p.atual] : null; };
  const conferencia = o.conferencia_segundo_usuario !== false;
  const [entrada, setEntrada] = useState({});
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [ocupado, setOcupado] = useState("");
  const [dialogo, setDialogo] = useState(null);
  const [relatorio, setRelatorio] = useState(null);
  const [manip, setManip] = useState(() => ({
    entregue: Object.fromEntries(ativos.map((r) => [r, lote.membros[r].quantidade_g ?? ""])), retencao: {}, descarte_g: "", descarte_motivo: "", perda: "", observacao: "",
  }));
  const [base, setBase] = useState(lote.matriz?.request_id || ativos[0] || "");
  useEffect(() => { setEntrada({}); setMarcadas(new Set()); }, [lote]);

  const executar = async (rotulo, fn) => {
    setOcupado(rotulo);
    try { await fn(); } catch (e) { toast.error(formatApiError(e)); } finally { setOcupado(""); }
  };
  const exigida = (l) => !l.request_id || ativos.includes(l.request_id);
  const faltamPesar = linhas.filter(([id, l]) => exigida(l) && !atual(id));
  const faltamConferir = conferencia ? linhas.filter(([id, l]) => exigida(l) && atual(id) && !atual(id).conferiu) : [];
  const pesadoG = linhas.filter(([, l]) => exigida(l)).reduce((s, [id]) => s + Math.round(num(atual(id)?.real_g) * 100), 0) / 100;
  const prontaParaRegistrar = lote.status === "ordem_gerada" && !faltamPesar.length && !faltamConferir.length;
  const conc = conciliacaoMassa({ pesadoG, entregue: Object.fromEntries(Object.entries(manip.entregue).map(([r, g]) => [r, num(g)])),
    retencao: Object.fromEntries(Object.entries(manip.retencao).map(([r, g]) => [r, { g: num(g) }])), descarteG: num(manip.descarte_g), perdaDeclaradaG: num(manip.perda),
    n: ativos.length, perdaPct: lote.perda_pct });

  const registrarPesagens = () => executar("pesar", async () => {
    const enviar = Object.fromEntries(Object.entries(entrada).filter(([id, x]) => num(x?.real_g) > 0 && !atual(id))
      .map(([id, x]) => [id, { real_g: num(x.real_g), lote_mp: x.lote_mp || "", motivo_desvio: x.motivo_desvio || "" }]));
    if (!Object.keys(enviar).length) { toast.info("Preencha o peso real de alguma linha."); return; }
    await api.post(`/pd/manipulacao-lotes/${lote.id}/pesagens`, { linhas: enviar });
    toast.success(`${Object.keys(enviar).length} linha(s) pesada(s).`);
    await recarregar();
  });
  const conferir = () => executar("conferir", async () => {
    await api.post(`/pd/manipulacao-lotes/${lote.id}/conferir`, { linhas: [...marcadas] });
    toast.success(`${marcadas.size} linha(s) conferida(s).`);
    await recarregar();
  });
  const registrarManipulacao = () => executar("registrar", async () => {
    const corpo = {
      entregue: Object.fromEntries(Object.entries(manip.entregue).map(([r, g]) => [r, num(g)])),
      retencao: Object.fromEntries(Object.entries(manip.retencao).filter(([, g]) => num(g) > 0).map(([r, g]) => [r, { g: num(g), local: "laboratório" }])),
      descarte: num(manip.descarte_g) > 0 ? { g: num(manip.descarte_g), motivo: manip.descarte_motivo } : undefined,
      perda_declarada_g: num(manip.perda), observacao: manip.observacao,
    };
    await api.post(`/pd/manipulacao-lotes/${lote.id}/registrar-manipulacao`, corpo);
    toast.success("Manipulação registrada — o lote está manipulado.");
    await recarregar();
  });
  const acao = (tipo, extra = {}) => executar(tipo, async () => {
    const { data } = await api.post(`/pd/manipulacao-lotes/${lote.id}/acoes`, { acao: tipo, ...extra });
    setRelatorio({ tipo, resultados: data.resultados || [] });
    const falhas = (data.resultados || []).filter((x) => !x.ok).length;
    if (falhas) toast.warning(`${falhas} amostra(s) não passaram — veja o relatório.`); else toast.success("Feito para todas as amostras.");
    await recarregar();
  });

  return (
    <div className="space-y-5" data-testid="ordem-lote">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => imprimir(lote)} disabled={!lote.ordem}><Printer className="mr-1 h-4 w-4" />Imprimir ordem</Button>
        {lote.status === "ordem_gerada" && <Button variant="ghost" className="text-red-700" disabled={!pode} onClick={() => setDialogo({ tipo: "cancelar" })}>Cancelar lote</Button>}
        {lote.status === "manipulado" && <Button variant="outline" disabled={!pode} onClick={() => setDialogo({ tipo: "ocorrencia" })}>Registrar ocorrência</Button>}
        <span className="text-xs text-muted-foreground">
          {o.n_amostras} amostra(s) · {fmtG(o.total_teorico_g || 0)} g · conferência por segundo usuário {conferencia ? "ligada" : "desligada"}
        </span>
      </div>
      {lote.status === "cancelado" && <p className="text-sm text-red-700">Cancelado em {quando(lote.cancelamento?.em)} por {lote.cancelamento?.por_nome}: {lote.cancelamento?.motivo}</p>}
      {(o.avisos || []).length > 0 && <ul className="list-disc rounded border border-amber-300 bg-amber-50 p-2 pl-6 text-xs text-amber-900">{o.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}

      <section className="space-y-2">
        <h4 className="flex items-center gap-1 text-sm font-semibold"><Scale className="h-4 w-4" />Pesagem</h4>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm" data-testid="pesagem-lote">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2">Linha</th><th>Ingrediente</th><th className="text-right">Teórico (g)</th><th>Real (g)</th><th>Lote da MP</th><th>Desvio</th><th>Registro</th><th>Conferir</th>
            </tr></thead>
            <tbody>
              {linhas.map(([id, l]) => {
                const reg = atual(id);
                const x = entrada[id] || {};
                const d = num(x.real_g) > 0 ? desvioPesagem(l.teorico_g, num(x.real_g)) : null;
                const fora = !exigida(l);
                return (
                  <tr key={id} className={`border-b last:border-0 ${fora ? "opacity-50" : ""}`}>
                    <td className="p-2 text-xs">{l.tipo === "pre_mistura" ? `Pré-mistura ${l.fase}` : `${l.codigo_amostra || cod(l.request_id)}${l.fase ? ` · ${l.fase}` : ""}`}</td>
                    <td>{l.nome}</td>
                    <td className="text-right">{fmtG(l.teorico_g)}</td>
                    <td>{reg ? <b>{fmtG(reg.real_g)}</b> : (
                      <Input className="h-8 w-24" inputMode="decimal" aria-label={`Real ${l.nome} ${l.codigo_amostra || ""}`} disabled={!pode || lote.status !== "ordem_gerada" || fora}
                        value={x.real_g || ""} onChange={(e) => setEntrada((s) => ({ ...s, [id]: { ...s[id], real_g: e.target.value } }))} data-testid={`real-${id}`} />)}</td>
                    <td>{reg ? (reg.lote_mp_informado ? reg.lote_mp : <span className="text-xs text-amber-700">não informado</span>) : (
                      <Input className="h-8 w-28" aria-label={`Lote MP ${l.nome}`} disabled={!pode || lote.status !== "ordem_gerada" || fora} value={x.lote_mp || ""}
                        onChange={(e) => setEntrada((s) => ({ ...s, [id]: { ...s[id], lote_mp: e.target.value } }))} />)}</td>
                    <td className="text-xs">
                      {reg ? `${reg.desvio_g > 0 ? "+" : ""}${fmtG(reg.desvio_g)} g${reg.motivo_desvio ? ` — ${reg.motivo_desvio}` : ""}` : d ? (
                        <span className={d.dentro ? "text-green-700" : "text-red-700"}>{d.desvio_g > 0 ? "+" : ""}{fmtG(d.desvio_g)} g (tol. {fmtG(d.tolerancia_g)})
                          {!d.dentro && <Input className="mt-1 h-7 w-44" placeholder={`Motivo (mín. ${MIN_MOTIVO})`} value={x.motivo_desvio || ""}
                            onChange={(e) => setEntrada((s) => ({ ...s, [id]: { ...s[id], motivo_desvio: e.target.value } }))} />}</span>) : ""}
                    </td>
                    <td className="text-xs">{reg ? (
                      <span>{reg.pesou_nome}{reg.corrige ? " (corrigido)" : ""}{reg.conferiu_nome ? <span className="block text-green-700"><CheckCircle2 className="mr-1 inline h-3 w-3" />conferido por {reg.conferiu_nome}</span> : null}
                        {pode && lote.status === "ordem_gerada" && <button type="button" className="ml-1 underline" onClick={() => setDialogo({ tipo: "corrigir", id, l })}>Corrigir</button>}</span>
                    ) : fora ? "amostra retirada" : "—"}</td>
                    <td>{reg && !reg.conferiu && conferencia && (
                      <input type="checkbox" aria-label={`Conferir ${l.nome}`} disabled={!pode || reg.pesou === eu || lote.status !== "ordem_gerada"}
                        title={reg.pesou === eu ? "Você pesou esta linha: a conferência é de outra pessoa." : ""}
                        checked={marcadas.has(id)} onChange={() => setMarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {lote.status === "ordem_gerada" && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={registrarPesagens} disabled={!pode || Boolean(ocupado)} data-testid="btn-registrar-pesagens">{ocupado === "pesar" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Registrar pesagens</Button>
            {conferencia && <Button variant="secondary" onClick={conferir} disabled={!pode || !marcadas.size || Boolean(ocupado)} data-testid="btn-conferir">Conferir selecionadas ({marcadas.size})</Button>}
            <span className="self-center text-xs text-muted-foreground">Faltam pesar {faltamPesar.length}{conferencia ? ` · conferir ${faltamConferir.length}` : ""}</span>
          </div>
        )}
      </section>

      {lote.status === "ordem_gerada" && (
        <section className="space-y-2 rounded-md border p-3" data-testid="registrar-manipulacao">
          <h4 className="text-sm font-semibold">Registrar manipulação</h4>
          <p className="text-xs text-muted-foreground">Pesado: {fmtG(pesadoG)} g. Informe o que foi entregue a cada amostra; retenção, descarte e perda fecham a conta.</p>
          <div className="flex flex-wrap gap-3 text-sm">
            {ativos.map((r) => (
              <div key={r} className="space-y-1">
                <Label className="text-xs">{cod(r)} entregue (g)</Label>
                <Input className="h-8 w-28" inputMode="decimal" value={manip.entregue[r] ?? ""} onChange={(e) => setManip((m) => ({ ...m, entregue: { ...m.entregue, [r]: e.target.value } }))} />
                <Input className="h-8 w-28" inputMode="decimal" placeholder="retenção (g)" value={manip.retencao[r] ?? ""} onChange={(e) => setManip((m) => ({ ...m, retencao: { ...m.retencao, [r]: e.target.value } }))} />
              </div>
            ))}
            <div className="space-y-1"><Label className="text-xs">Perda declarada (g)</Label>
              <Input className="h-8 w-28" inputMode="decimal" value={manip.perda} onChange={(e) => setManip((m) => ({ ...m, perda: e.target.value }))} />
              <span className="block text-xs text-muted-foreground">teto {fmtG(conc.perda_max_g)} g</span></div>
            <div className="space-y-1"><Label className="text-xs">Descarte (g)</Label>
              <Input className="h-8 w-28" inputMode="decimal" value={manip.descarte_g} onChange={(e) => setManip((m) => ({ ...m, descarte_g: e.target.value }))} />
              {num(manip.descarte_g) > 0 && <Input className="h-8 w-44" placeholder="motivo do descarte" value={manip.descarte_motivo} onChange={(e) => setManip((m) => ({ ...m, descarte_motivo: e.target.value }))} />}</div>
            <div className="min-w-[220px] flex-1 space-y-1"><Label className="text-xs">Observação</Label>
              <Input className="h-8" value={manip.observacao} onChange={(e) => setManip((m) => ({ ...m, observacao: e.target.value }))} /></div>
          </div>
          <p className={`text-sm ${conc.ok ? "text-green-700" : "text-red-700"}`} data-testid="conciliacao">
            {conc.ok ? <CheckCircle2 className="mr-1 inline h-4 w-4" /> : <XCircle className="mr-1 inline h-4 w-4" />}
            Destinos {fmtG(conc.destinos_g)} g · diferença {fmtG(conc.residuo_g)} g (tolerância {fmtG(conc.tolerancia_g)} g){!conc.perda_ok ? " · perda acima do teto" : ""}
          </p>
          <Button onClick={registrarManipulacao} disabled={!pode || !prontaParaRegistrar || !conc.ok || Boolean(ocupado)} data-testid="btn-registrar-manipulacao"
            title={!prontaParaRegistrar ? "Pese (e confira) todas as linhas antes." : ""}>Registrar manipulação</Button>
        </section>
      )}

      {lote.status === "manipulado" && (
        <section className="space-y-2 rounded-md border p-3" data-testid="acoes-lote">
          <h4 className="text-sm font-semibold">Ações em lote</h4>
          <p className="text-xs text-muted-foreground">Manipulado em {quando(lote.manipulacao?.em)} por {lote.manipulacao?.por_nome}. Cada amostra passa pela rota de sempre, uma por vez; quem não passar aparece no relatório.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => acao("em_testes")} disabled={!pode || Boolean(ocupado)} data-testid="btn-em-testes">Levar todas a Em Testes</Button>
            <Button variant="secondary" onClick={() => acao("estabilidade")} disabled={!pode || Boolean(ocupado)}>Iniciar estabilidade (mesma data)</Button>
            <Button variant="outline" onClick={() => setDialogo({ tipo: "liberacao" })} disabled={!pode || Boolean(ocupado)}>Pedir liberação antecipada</Button>
          </div>
          {relatorio && (
            <table className="mt-2 text-sm" data-testid="relatorio-acoes"><tbody>
              {relatorio.resultados.map((x) => (
                <tr key={x.request_id}><td className="pr-3 font-medium">{x.codigo}</td>
                  <td className={x.ok ? "text-green-700" : "text-red-700"}>{x.ok ? "ok" : "falhou"}</td><td className="pl-3 text-xs">{x.mensagem}</td></tr>
              ))}
            </tbody></table>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <select className="h-9 rounded-md border px-2 text-sm" value={base} onChange={(e) => setBase(e.target.value)} aria-label="Amostra que vira a base do projeto">
              {ativos.map((r) => <option key={r} value={r}>{cod(r)}</option>)}
            </select>
            <Button variant="outline" disabled={!pode || Boolean(ocupado)} onClick={() => executar("base", async () => {
              const { data } = await api.post(`/pd/manipulacao-lotes/${lote.id}/base-projeto`, { request_id: base, revisao: lote.revisao });
              toast.success(data.acao === "reusar" ? `A base vigente do projeto já é igual (v${data.base?.versao}).` : `Base do projeto v${data.base?.versao} criada (a anterior não muda).`);
              await recarregar();
            })}>Tornar a nova base do projeto</Button>
          </div>
        </section>
      )}

      {detalhe.custos && (
        <section className="space-y-1" data-testid="custos-lote">
          <h4 className="text-sm font-semibold">Custo P&D (versões do lote)</h4>
          <table className="text-sm"><tbody>
            {Object.entries(detalhe.custos.por_amostra).map(([r, c]) => (
              <tr key={r}><td className="pr-4">{cod(r)}</td><td className="pr-4 text-right">{brl(c.brl_kg)}/kg</td><td className="text-right">{brl(c.brl_amostra)} na amostra</td></tr>
            ))}
            <tr className="border-t font-medium"><td className="pr-4">Lote</td><td /><td className="text-right">{brl(detalhe.custos.total_brl)}</td></tr>
          </tbody></table>
          <p className="text-xs text-muted-foreground">Preço de cada matéria-prima como estava na geração da ordem (dólar do dia para as cotadas em US$).</p>
        </section>
      )}

      <section className="space-y-1" data-testid="historico-lote">
        <h4 className="text-sm font-semibold">Histórico do lote</h4>
        <ul className="space-y-1 text-xs">
          {Object.values(lote.eventos || {}).sort((a, b) => String(b.em).localeCompare(String(a.em))).map((e, i) => (
            <li key={`${e.em}-${i}`}><Badge variant="outline" className="mr-1">{e.tipo}</Badge>{quando(e.em)} · {e.por_nome || e.por}{e.detalhe ? ` — ${e.detalhe}` : ""}</li>
          ))}
        </ul>
      </section>

      {dialogo?.tipo === "corrigir" && (
        <CorrigirDialog linha={dialogo.l} onFechar={() => setDialogo(null)} onConfirmar={(real_g, motivo, lote_mp) => executar("corrigir", async () => {
          await api.post(`/pd/manipulacao-lotes/${lote.id}/corrigir-pesagem`, { linhaId: dialogo.id, real_g, motivo, lote_mp, motivo_desvio: motivo });
          setDialogo(null);
          toast.success("Correção registrada (o registro anterior fica no histórico).");
          await recarregar();
        })} />
      )}
      {dialogo?.tipo === "cancelar" && (
        <MotivoDialog titulo={`Cancelar o lote ${lote.codigo}`} descricao="Com a ordem gerada, as versões travadas ficam como histórico." minimo={MIN_MOTIVO_DEPOIS_DA_ORDEM}
          onFechar={() => setDialogo(null)} onConfirmar={(motivo) => executar("cancelar", async () => {
            await api.post(`/pd/manipulacao-lotes/${lote.id}/cancelar`, { motivo, revisao: lote.revisao });
            setDialogo(null);
            await recarregar();
          })} />
      )}
      {dialogo?.tipo === "ocorrencia" && (
        <MotivoDialog titulo="Registrar ocorrência" rotulo="O que aconteceu" minimo={MIN_MOTIVO_DEPOIS_DA_ORDEM} onFechar={() => setDialogo(null)}
          onConfirmar={(texto) => executar("ocorrencia", async () => {
            await api.post(`/pd/manipulacao-lotes/${lote.id}/ocorrencia`, { texto, revisao: lote.revisao });
            setDialogo(null);
            await recarregar();
          })} />
      )}
      {dialogo?.tipo === "liberacao" && (
        <MotivoDialog titulo="Pedir liberação antecipada para todas" rotulo="Justificativa para a diretoria" minimo={MIN_MOTIVO_DEPOIS_DA_ORDEM}
          onFechar={() => setDialogo(null)} onConfirmar={async (motivo) => { setDialogo(null); await acao("liberacao", { motivo }); }} />
      )}
    </div>
  );
}

function CorrigirDialog({ linha, onConfirmar, onFechar }) {
  const [real, setReal] = useState("");
  const [loteMp, setLoteMp] = useState("");
  return (
    <MotivoDialog titulo={`Corrigir ${linha.nome}`} descricao={`Teórico ${fmtG(linha.teorico_g)} g. A correção vira um registro novo.`} minimo={MIN_MOTIVO_DEPOIS_DA_ORDEM}
      rotulo="Motivo da correção" onFechar={onFechar} onConfirmar={(motivo) => onConfirmar(num(real), motivo, loteMp)}
      extra={(
        <div className="flex gap-2">
          <div><Label htmlFor="real-corr">Peso real (g)</Label><Input id="real-corr" inputMode="decimal" value={real} onChange={(e) => setReal(e.target.value)} /></div>
          <div><Label htmlFor="lote-corr">Lote da MP</Label><Input id="lote-corr" value={loteMp} onChange={(e) => setLoteMp(e.target.value)} /></div>
        </div>
      )} />
  );
}
