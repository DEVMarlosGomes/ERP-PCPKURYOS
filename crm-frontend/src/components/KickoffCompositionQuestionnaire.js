import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { normalizarLinhaComponente, pendenciasQuestionario, simNao } from "@/lib/kickoffPendencias";

const BLOCO2_COMPONENTS = [
  ["frasco_pote_bisnaga", "Frasco / pote / bisnaga"],
  ["airless_rollon_ampola", "Airless / roll-on / ampola"],
  ["tampa", "Tampa (rosca / flip-top / pressao)"],
  ["valvula_pump", "Valvula pump / bomba dosadora"],
  ["valvula_spray", "Valvula spray / atomizador"],
  ["valvula_aerossol_atuador", "Valvula aerossol + atuador"],
  ["gatilho_trigger", "Gatilho / trigger"],
  ["batoque_redutor_orificio", "Batoque / redutor / orificio"],
  ["lacre_inducao_disco", "Lacre de inducao / disco de vedacao"],
  ["aplicador", "Aplicador (pincel / espatula / esponja)"],
];

const BLOCO3_COMPONENTS = [
  ["rotulo", "Rotulo (frontal / contra)"],
  ["cartucho", "Cartucho"],
  ["bula_folheto", "Bula / folheto"],
  ["selo_lacre_seguranca", "Selo / lacre de seguranca"],
  ["celofane_shrink", "Celofane / shrink"],
  ["berco_suporte_interno", "Berco / suporte interno"],
];

const BLOCO4_COMPONENTS = [
  ["display_expositor_pdv", "Display / expositor de PDV"],
  ["caixa_master", "Caixa de embarque (master)"],
  ["divisoria_colmeia", "Divisoria / separador / colmeia"],
  ["cantoneira", "Cantoneira"],
  ["paletizacao", "Especificacao de paletizacao"],
];

function rows(seed, hasArt = false, terciaria = false) {
  return seed.map(([id, componente]) => ({
    id,
    componente,
    aplicavel: "",
    definido: "",
    fornecido_por: "",
    ...(terciaria ? { unidades_por_embalagem: "" } : { qtd_por_unidade: 1 }),
    ...(hasArt ? { arte_cria_aprova: "", arte_aprovada: "" } : { especificacao_fornecedor_codigo: "" }),
    observacoes: "",
  }));
}

// KO-03 (23/10/2026): três estados — "" (não respondida) · "sim" · "nao". Antes o vazio virava
// "nao" ao abrir e era gravado como resposta.
const normalizeBinary = simNao;

function normalizeComponentRows(items, hasArt = false) {
  return (items || []).map(normalizarLinhaComponente).map((item) => ({
    ...item,
    aplicavel: normalizeBinary(item.aplicavel),
    definido: normalizeBinary(item.definido),
    ...(hasArt ? { arte_aprovada: normalizeBinary(item.arte_aprovada) } : {}),
  }));
}

export function emptyKickoffQuestionnaire() {
  return {
    schema_version: "questionario_composicao_projeto_2",
    bloco0: {
      cliente: "",
      nome_produto: "",
      categoria: "",
      categoria_outro: "",
      forma_fisica: "",
      forma_fisica_outro: "",
      volume_gramatura: "",
      numero_skus_variacoes: "",
      varia_entre_skus: [],
      varia_entre_skus_outro: "",
      unidades_por_display: "",
      displays_ou_unidades_por_caixa_master: "",
      registro_notificacao_anvisa: "",
      detentor_registro: "",
      responsavel_tecnico: "",
      modelo_servico: "",
    },
    bloco1: {
      formula: "",
      cliente_fornece: [],
      tem_cor: "",
      cor_descricao: "",
      tem_brilho_mica_glitter: "",
      brilho_descricao: "",
      viscosidade: "",
      densidade: "",
      fragrancia_essencia: "",
      compra_fragrancia_por: "",
      observacoes_formulacao: "",
    },
    bloco2: { componentes: rows(BLOCO2_COMPONENTS) },
    bloco3: { componentes: rows(BLOCO3_COMPONENTS, true) },
    bloco4: { componentes: rows(BLOCO4_COMPONENTS, false, true) },
    bloco5: {
      especificacoes_cq_componentes: "",
      especificacoes_cq_anexos: [],
      testes_aprovacoes_obrigatorios: "",
      amostra_referencia_fornecida_cliente: "",
      amostra_referencia_descricao: "",
    },
    fechamento: {
      data_prevista_inicio_producao: "",
      volume_primeiro_lote: "",
      responsavel_kuryos: "",
      responsavel_cliente: "",
      data_preenchimento: "",
    },
    autopopulated_from: [],
  };
}

function mergeQuestionnaire(value) {
  const base = emptyKickoffQuestionnaire();
  const data = value || {};
  return {
    ...base,
    ...data,
    bloco0: { ...base.bloco0, ...(data.bloco0 || {}) },
    bloco1: {
      ...base.bloco1,
      ...(data.bloco1 || {}),
      tem_cor: normalizeBinary(data.bloco1?.tem_cor),
      tem_brilho_mica_glitter: normalizeBinary(data.bloco1?.tem_brilho_mica_glitter),
    },
    bloco2: { componentes: normalizeComponentRows(data.bloco2?.componentes?.length ? data.bloco2.componentes : base.bloco2.componentes) },
    bloco3: { componentes: normalizeComponentRows(data.bloco3?.componentes?.length ? data.bloco3.componentes : base.bloco3.componentes, true) },
    bloco4: { componentes: normalizeComponentRows(data.bloco4?.componentes?.length ? data.bloco4.componentes : base.bloco4.componentes) },
    bloco5: {
      ...base.bloco5,
      ...(data.bloco5 || {}),
      amostra_referencia_fornecida_cliente: normalizeBinary(data.bloco5?.amostra_referencia_fornecida_cliente),
    },
    fechamento: { ...base.fechamento, ...(data.fechamento || {}) },
  };
}

export function questionnaireFromKickoff(kickoff) {
  if (kickoff?.questionario_composicao) return mergeQuestionnaire(kickoff.questionario_composicao);
  const block1 = kickoff?.bloco1 || {};
  const block2 = kickoff?.bloco2 || {};
  const block3 = kickoff?.bloco3 || {};
  const block4 = kickoff?.bloco4 || {};
  const q = emptyKickoffQuestionnaire();
  q.bloco0.cliente = block1.cliente || "";
  q.bloco0.nome_produto = block3.nome_comercial_cliente || block3.nome_tecnico_produto || block1.projeto_vinculado || "";
  q.bloco0.categoria = block3.categoria_anvisa || block1.categoria_anvisa_herdada || "";
  q.bloco0.forma_fisica = block3.forma_apresentacao || "";
  q.bloco0.volume_gramatura = [block3.volume_peso_liquido_valor, block3.volume_peso_liquido_unidade].filter(Boolean).join(" ");
  q.bloco0.displays_ou_unidades_por_caixa_master = block2.quantidade_por_caixa || block4.caixa_master_unidades || "";
  q.bloco0.detentor_registro = block1.cliente || "";
  q.bloco0.responsavel_tecnico = block3.responsavel_liberacao_lote || "";
  q.bloco1.fragrancia_essencia = block3.odor || "";
  q.bloco1.tem_cor = block3.cor_descricao || "";
  q.bloco5.especificacoes_cq_componentes = block3.plano_amostragem || "";
  q.bloco5.testes_aprovacoes_obrigatorios = (block3.analises_obrigatorias_por_lote || []).join("\n");
  q.fechamento.data_prevista_inicio_producao = block2.data_entrega_contratada || "";
  q.fechamento.volume_primeiro_lote = block2.volume_primeiro_pedido || "";
  q.fechamento.responsavel_kuryos = block1.responsavel_comercial || "";
  q.fechamento.data_preenchimento = block1.data_abertura ? String(block1.data_abertura).slice(0, 10) : "";
  return q;
}

function Section({ title, pendencias, children }) {
  const lista = pendencias || [];
  return (
    <section className="rounded-md border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {pendencias && (lista.length
          ? <span className="text-xs font-medium text-amber-700 dark:text-amber-400" data-testid="pendencias-bloco">{lista.length} pendente(s)</span>
          : <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">completo</span>)}
      </div>
      {lista.length > 0 && (
        <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Falta: {lista.map((p) => p.rotulo).join(" · ")}
        </p>
      )}
      {children}
    </section>
  );
}

function Field({ label, value, onChange, type = "text", className = "" }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function TextField({ label, value, onChange, className = "", rows = 3 }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Textarea rows={rows} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

// KO-03: Sim / Não sem nenhum marcado até alguém responder (borda âmbar = pendente).
function YesNoToggle({ label, value, onChange, compact = false }) {
  const v = normalizeBinary(value);
  const botao = (opcao, rotulo, cor) => (
    <button type="button" aria-pressed={v === opcao}
      className={`px-3 py-1 text-xs font-bold transition-colors ${v === opcao ? cor : "text-muted-foreground hover:bg-accent"}`}
      onClick={() => onChange(v === opcao ? "" : opcao)}>{rotulo}</button>
  );
  return (
    <div className={compact ? "flex items-center" : "space-y-2"}>
      {label && <Label>{label}</Label>}
      <div className={`inline-flex overflow-hidden rounded-full border ${v ? "border-border" : "border-amber-400 dark:border-amber-600"}`}
        role="group" aria-label={label || "Sim ou não"} data-estado={v || "sem_resposta"}>
        {botao("sim", "SIM", "bg-emerald-500 text-white")}
        {botao("nao", "NÃO", "bg-red-500 text-white")}
      </div>
    </div>
  );
}

function ChoiceGroup({ label, value, onChange, options }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rounded-md border px-3 py-1.5 text-sm ${value === option.value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
            onClick={() => onChange(value === option.value ? "" : option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CheckboxGroup({ label, values = [], onChange, options }) {
  const current = Array.isArray(values) ? values : [];
  const toggle = (value) => {
    onChange(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rounded-md border px-3 py-1.5 text-sm ${current.includes(option.value) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// KO-05: tipo de material do Cadastros por bloco (primária EP, secundária ES, terciária ET).
const TIPO_DO_BLOCO = { bloco2: "EP", bloco3: "ES", bloco4: "ET" };
const rotuloMaterial = (m) => `${m.codigo_interno} — ${m.nome}`;

function ComponentTable({ title, value, onChange, defaults, hasArt = false, bloco, materiais = [] }) {
  const list = value?.componentes || [];
  const terciaria = bloco === "bloco4";
  const campoQtd = terciaria ? "unidades_por_embalagem" : "qtd_por_unidade";
  const opcoes = useMemo(() => materiais.filter((m) => String(m.tipo_material || "").toUpperCase() === TIPO_DO_BLOCO[bloco]), [materiais, bloco]);
  const porRotulo = useMemo(() => new Map(opcoes.map((m) => [rotuloMaterial(m), m])), [opcoes]);
  const updateRow = (index, field, nextValue) => {
    const next = list.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: nextValue } : row);
    onChange({ componentes: next });
  };
  const updateFields = (index, fields) => onChange({ componentes: list.map((row, i) => (i === index ? { ...row, ...fields } : row)) });
  // Escolher um item do Cadastros preenche código, especificação e fornecedor homologado; texto livre vira especificação.
  const escolherItem = (index, texto) => {
    const m = porRotulo.get(texto);
    if (m) {
      const forn = (m.fornecedores || [])[0] || {};
      updateFields(index, { material_codigo: m.codigo_interno, material_nome: m.nome, especificacao_fornecedor_codigo: m.especificacoes_tecnicas || m.nome,
        fornecedor_nome: forn.fornecedor_nome || "", codigo_fornecedor: forn.codigo_fornecedor || "", item_novo: false });
    } else {
      updateFields(index, { material_codigo: "", material_nome: "", especificacao_fornecedor_codigo: texto });
    }
  };
  const removeRow = (index) => onChange({ componentes: list.filter((_, rowIndex) => rowIndex !== index) });
  const clearRow = (index) => {
    const original = list[index] || {};
    const blank = {
      id: original.id,
      componente: original.componente,
      aplicavel: "",
      definido: "",
      fornecido_por: "",
      ...(terciaria ? { unidades_por_embalagem: "" } : { qtd_por_unidade: 1 }),
      ...(hasArt ? { arte_cria_aprova: "", arte_aprovada: "" } : { especificacao_fornecedor_codigo: "" }),
      observacoes: "",
    };
    const next = list.map((row, rowIndex) => rowIndex === index ? blank : row);
    onChange({ componentes: next });
  };
  const addRow = () => {
    const id = `custom_${Date.now()}`;
    onChange({ componentes: [...list, { id, componente: "", aplicavel: "", definido: "", fornecido_por: "", ...(terciaria ? { unidades_por_embalagem: "" } : { qtd_por_unidade: 1 }), ...(hasArt ? { arte_cria_aprova: "", arte_aprovada: "" } : { especificacao_fornecedor_codigo: "" }), observacoes: "" }] });
  };
  const restoreDefaults = () => onChange({ componentes: rows(defaults, hasArt, terciaria) });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={restoreDefaults} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Componente
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Componente</th>
              <th className="px-2 py-2 text-left font-medium">Aplicavel?</th>
              <th className="px-2 py-2 text-left font-medium">Definido?</th>
              <th className="px-2 py-2 text-left font-medium">Fornecido por</th>
              <th className="px-2 py-2 text-left font-medium min-w-[260px]">Item (Cadastros) / especificação</th>
              <th className="px-2 py-2 text-left font-medium">{terciaria ? "Unid. por embalagem" : "Qtd por unidade"}</th>
              {hasArt && <th className="px-2 py-2 text-left font-medium">Arte: cria / aprova</th>}
              {hasArt && <th className="px-2 py-2 text-left font-medium">Arte aprovada?</th>}
              <th className="px-2 py-2 text-left font-medium">Obs.</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.map((row, index) => {
              // KO-03: Aplicável? Não ou Definido? Não = linha resolvida; o resto só vale com os dois em Sim.
              const aplicavel = normalizeBinary(row.aplicavel) === "sim";
              const precisa = aplicavel && normalizeBinary(row.definido) === "sim";
              return (
              <tr key={row.id || index} className={normalizeBinary(row.aplicavel) === "nao" ? "opacity-60" : ""}>
                <td className="px-2 py-2"><Input value={row.componente || ""} onChange={(event) => updateRow(index, "componente", event.target.value)} /></td>
                <td className="px-2 py-2"><YesNoToggle compact value={row.aplicavel} onChange={(next) => updateRow(index, "aplicavel", next)} /></td>
                <td className="px-2 py-2">{aplicavel ? <YesNoToggle compact value={row.definido} onChange={(next) => updateRow(index, "definido", next)} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="px-2 py-2">
                  <select disabled={!precisa} value={row.fornecido_por || ""} onChange={(event) => updateRow(index, "fornecido_por", event.target.value)}
                    className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-50" data-testid="fornecido-por">
                    <option value="">Selecione…</option>
                    <option value="kuryos">Kuryos</option>
                    <option value="cliente">Cliente</option>
                  </select>
                </td>
                <td className="px-2 py-2 space-y-1">
                  {row.item_novo ? (
                    <Input disabled={!precisa} value={row.item_novo_descricao || ""} placeholder="Descreva o item novo com o máximo de detalhe (vai para o Cadastros)"
                      onChange={(event) => updateRow(index, "item_novo_descricao", event.target.value)} />
                  ) : (
                    <>
                      <Input disabled={!precisa} list={`materiais-${bloco}`} placeholder="Buscar no Cadastros ou escrever a especificação"
                        value={row.material_codigo ? `${row.material_codigo} — ${row.material_nome || ""}` : row.especificacao_fornecedor_codigo || ""}
                        onChange={(event) => escolherItem(index, event.target.value)} />
                      {row.material_codigo && (
                        <p className="text-[11px] text-muted-foreground">{[row.especificacao_fornecedor_codigo, row.fornecedor_nome && `fornecedor ${row.fornecedor_nome}`, row.codigo_fornecedor && `cód. ${row.codigo_fornecedor}`].filter(Boolean).join(" · ")}</p>
                      )}
                    </>
                  )}
                  {precisa && (
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <input type="checkbox" checked={Boolean(row.item_novo)} onChange={(event) => updateFields(index, { item_novo: event.target.checked, ...(event.target.checked ? { material_codigo: "", material_nome: "" } : {}) })} />
                      Item novo (não cadastrado)
                    </label>
                  )}
                </td>
                <td className="px-2 py-2">
                  <Input disabled={!precisa} type="number" min="0" step="any" className="w-24" value={row[campoQtd] ?? ""}
                    placeholder={terciaria ? "ex.: 48" : "1"} onChange={(event) => updateRow(index, campoQtd, event.target.value)} />
                </td>
                {hasArt && (
                  <td className="px-2 py-2">
                    <Input disabled={!precisa} value={row.arte_cria_aprova || ""} onChange={(event) => updateRow(index, "arte_cria_aprova", event.target.value)} />
                  </td>
                )}
                {hasArt && <td className="px-2 py-2">{precisa ? <YesNoToggle compact value={row.arte_aprovada} onChange={(next) => updateRow(index, "arte_aprovada", next)} /> : <span className="text-xs text-muted-foreground">—</span>}</td>}
                <td className="px-2 py-2"><Input value={row.observacoes || ""} onChange={(event) => updateRow(index, "observacoes", event.target.value)} /></td>
                <td className="px-2 py-2">
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => clearRow(index)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeRow(index)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id={`materiais-${bloco}`}>
          {opcoes.map((m) => <option key={m.codigo_interno} value={rotuloMaterial(m)} />)}
        </datalist>
      </div>
    </div>
  );
}

export default function KickoffCompositionQuestionnaire({ value, onChange, onSave, saving }) {
  const q = mergeQuestionnaire(value);
  const pend = pendenciasQuestionario(q).status;
  const [materiais, setMateriais] = useState([]);
  useEffect(() => {
    api.get("/cadastros/materiais").then(({ data }) => setMateriais(Array.isArray(data) ? data : [])).catch(() => setMateriais([]));
  }, []);
  const update = (section, field, nextValue) => {
    onChange({ ...q, [section]: { ...(q[section] || {}), [field]: nextValue } });
  };

  return (
    <div className="space-y-4" data-testid="kickoff-composition-questionnaire">
      <Section title="Bloco 0 - Identificacao e comercial" pendencias={pend.bloco0.pendencias}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Cliente" value={q.bloco0.cliente} onChange={(v) => update("bloco0", "cliente", v)} />
          <Field label="Nome do produto" value={q.bloco0.nome_produto} onChange={(v) => update("bloco0", "nome_produto", v)} />
          <ChoiceGroup label="Categoria" value={q.bloco0.categoria} onChange={(v) => update("bloco0", "categoria", v)} options={[
            { value: "perfumaria", label: "Perfumaria" },
            { value: "capilar", label: "Capilar" },
            { value: "skin_care", label: "Skin care" },
            { value: "maquiagem", label: "Maquiagem" },
            { value: "home_care", label: "Home care" },
            { value: "outro", label: "Outro" },
          ]} />
          <ChoiceGroup label="Forma fisica" value={q.bloco0.forma_fisica} onChange={(v) => update("bloco0", "forma_fisica", v)} options={[
            { value: "liquido", label: "Liquido" },
            { value: "creme_gel", label: "Creme / gel" },
            { value: "po", label: "Po" },
            { value: "aerossol", label: "Aerossol" },
            { value: "bastao", label: "Bastao" },
            { value: "outro", label: "Outro" },
          ]} />
          <Field label="Volume / gramatura" value={q.bloco0.volume_gramatura} onChange={(v) => update("bloco0", "volume_gramatura", v)} />
          <Field label="No de SKUs / variacoes" value={q.bloco0.numero_skus_variacoes} onChange={(v) => update("bloco0", "numero_skus_variacoes", v)} />
          <CheckboxGroup label="O que varia entre SKUs" values={q.bloco0.varia_entre_skus} onChange={(v) => update("bloco0", "varia_entre_skus", v)} options={[
            { value: "cor", label: "Cor" },
            { value: "fragrancia", label: "Fragrancia" },
            { value: "versao", label: "Versao" },
            { value: "volume", label: "Volume" },
            { value: "outro", label: "Outro" },
          ]} />
          <Field label="Outro tipo de variacao" value={q.bloco0.varia_entre_skus_outro} onChange={(v) => update("bloco0", "varia_entre_skus_outro", v)} />
          <Field label="Unidades por display" value={q.bloco0.unidades_por_display} onChange={(v) => update("bloco0", "unidades_por_display", v)} />
          <Field label="Displays (ou unidades) por caixa master" value={q.bloco0.displays_ou_unidades_por_caixa_master} onChange={(v) => update("bloco0", "displays_ou_unidades_por_caixa_master", v)} />
          <ChoiceGroup label="Registro / notificacao ANVISA" value={q.bloco0.registro_notificacao_anvisa} onChange={(v) => update("bloco0", "registro_notificacao_anvisa", v)} options={[
            { value: "existe", label: "Existe" },
            { value: "a_providenciar", label: "A providenciar" },
          ]} />
          <Field label="Detentor do registro" value={q.bloco0.detentor_registro} onChange={(v) => update("bloco0", "detentor_registro", v)} />
          <Field label="Responsavel Tecnico (RT)" value={q.bloco0.responsavel_tecnico} onChange={(v) => update("bloco0", "responsavel_tecnico", v)} />
        </div>
        <ChoiceGroup label="Classificacao do projeto (modelo de servico)" value={q.bloco0.modelo_servico} onChange={(v) => update("bloco0", "modelo_servico", v)} options={[
          { value: "industrializacao_pura", label: "Industrializacao pura" },
          { value: "industrializacao_com_desenvolvimento", label: "Industrializacao com desenvolvimento" },
          { value: "full_service_marca_propria", label: "Full service / marca propria" },
        ]} />
      </Section>

      <Section title="Bloco 1 - Formulacao" pendencias={pend.bloco1.pendencias}>
        <div className="grid gap-4 md:grid-cols-2">
          <ChoiceGroup label="Formula" value={q.bloco1.formula} onChange={(v) => update("bloco1", "formula", v)} options={[
            { value: "do_cliente", label: "Do cliente" },
            { value: "desenvolvida_kuryos", label: "Desenvolvida pela Kuryos" },
          ]} />
          <CheckboxGroup label="O cliente fornece" values={q.bloco1.cliente_fornece} onChange={(v) => update("bloco1", "cliente_fornece", v)} options={[
            { value: "formula_documento", label: "Formula (documento)" },
            { value: "bulk_pronto", label: "Bulk pronto" },
            { value: "mps", label: "MPs" },
            { value: "nada", label: "Nada (Kuryos compra tudo)" },
          ]} />
          <YesNoToggle label="Tem Cor?" value={q.bloco1.tem_cor} onChange={(v) => update("bloco1", "tem_cor", v)} />
          <YesNoToggle label="Tem Brilho/mica/glitter?" value={q.bloco1.tem_brilho_mica_glitter} onChange={(v) => update("bloco1", "tem_brilho_mica_glitter", v)} />
          {normalizeBinary(q.bloco1.tem_cor) === "sim" && <Field label="Qual cor (descrição / código)? *" value={q.bloco1.cor_descricao} onChange={(v) => update("bloco1", "cor_descricao", v)} />}
          {normalizeBinary(q.bloco1.tem_brilho_mica_glitter) === "sim" && <Field label="Qual brilho / mica / glitter? *" value={q.bloco1.brilho_descricao} onChange={(v) => update("bloco1", "brilho_descricao", v)} />}
          <Field label="Qual a viscosidade?" value={q.bloco1.viscosidade} onChange={(v) => update("bloco1", "viscosidade", v)} />
          <Field label="Qual a densidade?" value={q.bloco1.densidade} onChange={(v) => update("bloco1", "densidade", v)} />
          <Field className="md:col-span-2" label="Fragrancia / essencia definida ou aprovada - casa de fragrancia e codigos" value={q.bloco1.fragrancia_essencia} onChange={(v) => update("bloco1", "fragrancia_essencia", v)} />
          <ChoiceGroup label="Compra da fragrancia por" value={q.bloco1.compra_fragrancia_por} onChange={(v) => update("bloco1", "compra_fragrancia_por", v)} options={[{ value: "cliente", label: "Cliente" }, { value: "kuryos", label: "Kuryos" }]} />
          <TextField className="md:col-span-2" label="Observacoes de formulacao" value={q.bloco1.observacoes_formulacao} onChange={(v) => update("bloco1", "observacoes_formulacao", v)} />
        </div>
      </Section>

      <Section title="Bloco 2 - Embalagem primaria e sistema de fechamento" pendencias={pend.bloco2.pendencias}>
        <ComponentTable title="Componentes" bloco="bloco2" materiais={materiais} value={q.bloco2} defaults={BLOCO2_COMPONENTS} onChange={(v) => update("bloco2", "componentes", v.componentes)} />
      </Section>

      <Section title="Bloco 3 - Embalagem secundaria e comunicacao" pendencias={pend.bloco3.pendencias}>
        <ComponentTable title="Componentes graficos" bloco="bloco3" materiais={materiais} value={q.bloco3} defaults={BLOCO3_COMPONENTS} hasArt onChange={(v) => update("bloco3", "componentes", v.componentes)} />
      </Section>

      <Section title="Bloco 4 - Embalagem terciaria e logistica" pendencias={pend.bloco4.pendencias}>
        <ComponentTable title="Componentes logisticos" bloco="bloco4" materiais={materiais} value={q.bloco4} defaults={BLOCO4_COMPONENTS} onChange={(v) => update("bloco4", "componentes", v.componentes)} />
      </Section>

      <Section title="Bloco 5 - Qualidade de recebimento" pendencias={pend.bloco5.pendencias}>
        <TextField label="Especificacoes de CQ por componente (texto / anexos)" value={q.bloco5.especificacoes_cq_componentes} onChange={(v) => update("bloco5", "especificacoes_cq_componentes", v)} rows={4} />
        <TextField label="Testes / aprovacoes obrigatorios antes da producao" value={q.bloco5.testes_aprovacoes_obrigatorios} onChange={(v) => update("bloco5", "testes_aprovacoes_obrigatorios", v)} rows={4} />
        <YesNoToggle label="Amostra de referencia fornecida pelo cliente" value={q.bloco5.amostra_referencia_fornecida_cliente} onChange={(v) => update("bloco5", "amostra_referencia_fornecida_cliente", v)} />
        {normalizeBinary(q.bloco5.amostra_referencia_fornecida_cliente) === "sim" && <TextField label="Descreva a amostra de referência (o que é, quem guarda) *" value={q.bloco5.amostra_referencia_descricao} onChange={(v) => update("bloco5", "amostra_referencia_descricao", v)} rows={2} />}
      </Section>

      <Section title="Fechamento" pendencias={pend.fechamento.pendencias}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field type="date" label="Data prevista de inicio de producao" value={q.fechamento.data_prevista_inicio_producao} onChange={(v) => update("fechamento", "data_prevista_inicio_producao", v)} />
          <Field label="Volume do primeiro lote" value={q.fechamento.volume_primeiro_lote} onChange={(v) => update("fechamento", "volume_primeiro_lote", v)} />
          <Field label="Responsavel Kuryos" value={q.fechamento.responsavel_kuryos} onChange={(v) => update("fechamento", "responsavel_kuryos", v)} />
          <Field label="Responsavel Cliente" value={q.fechamento.responsavel_cliente} onChange={(v) => update("fechamento", "responsavel_cliente", v)} />
          <Field type="date" label="Data do preenchimento" value={q.fechamento.data_preenchimento} onChange={(v) => update("fechamento", "data_preenchimento", v)} />
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-1 rounded-md border bg-background/95 p-3 backdrop-blur flex justify-end">
        <Button disabled={saving} onClick={onSave}>Salvar questionario</Button>
      </div>
    </div>
  );
}
