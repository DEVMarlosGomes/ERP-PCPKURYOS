import { Plus, RotateCcw, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Fragment, createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import CatalogoComponentesDialog from "@/components/CatalogoComponentesDialog";
import ResponsavelTecnicoField from "@/components/ResponsavelTecnicoField";
import { opcoesDeCategoria } from "@/lib/categoriasProduto";
import { normalizarLinhaComponente, pendenciasQuestionario, simNao } from "@/lib/kickoffPendencias";
import { CATALOGO_PADRAO, OUTRO, TIPO_OUTRO, escolherTipo, especificacaoDasCaracteristicas, tiposDaLinha, valorAtributo } from "@/lib/tiposComponente";

// KO-11 (reunião 28/10/2026, D-05): "tudo que vai no frasco fica no frasco; tampa e válvula juntas".
// Mesmos ids de linha (dados antigos abrem iguais, sem migração); só a ordem e o agrupamento mudam.
const BLOCO2_COMPONENTS = [
  ["frasco_pote_bisnaga", "Frasco / pote / bisnaga"],
  ["airless_rollon_ampola", "Airless / roll-on / ampola"],
  ["batoque_redutor_orificio", "Batoque / redutor / orificio"],
  ["lacre_inducao_disco", "Lacre de inducao / disco de vedacao"],
  ["aplicador", "Aplicador (pincel / espatula / esponja)"],
  ["tampa", "Tampa (rosca / flip-top / pressao)"],
  ["valvula_pump", "Valvula pump / bomba dosadora"],
  ["valvula_spray", "Valvula spray / atomizador"],
  ["valvula_aerossol_atuador", "Valvula aerossol + atuador"],
  ["gatilho_trigger", "Gatilho / trigger"],
];

export const GRUPOS_BLOCO2 = [
  { titulo: "Frasco", ids: ["frasco_pote_bisnaga", "airless_rollon_ampola", "batoque_redutor_orificio", "lacre_inducao_disco", "aplicador"] },
  { titulo: "Tampa e válvula", ids: ["tampa", "valvula_pump", "valvula_spray", "valvula_aerossol_atuador", "gatilho_trigger"] },
];

/* Ordem de exibição por grupo, sem mexer na ordem gravada: [{ grupo, indice }]. Linha que não é de
 * nenhum grupo (acrescentada à mão) fica em "Outros componentes", no fim, na ordem em que entrou. */
export function linhasPorGrupo(lista, grupos) {
  if (!grupos?.length) return (lista || []).map((_, indice) => ({ grupo: null, indice }));
  const grupoDe = new Map(grupos.flatMap((g, gi) => g.ids.map((id) => [id, gi])));
  const posNoGrupo = new Map(grupos.flatMap((g) => g.ids.map((id, i) => [id, i])));
  return (lista || []).map((row, indice) => ({ row, indice, gi: grupoDe.has(row?.id) ? grupoDe.get(row.id) : grupos.length }))
    .sort((a, b) => a.gi - b.gi || (a.gi < grupos.length ? posNoGrupo.get(a.row.id) - posNoGrupo.get(b.row.id) : a.indice - b.indice))
    .map(({ gi, indice }) => ({ grupo: gi < grupos.length ? grupos[gi].titulo : "Outros componentes", indice }));
}

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
      variacao_outra_categoria: "",
      variacao_outra_categoria_qual: "",
      unidades_por_display: "",
      displays_ou_unidades_por_caixa_master: "",
      registro_notificacao_anvisa: "",
      detentor_registro: "",
      responsavel_tecnico: "",
      responsavel_tecnico_id: "",
      modelo_servico: "",
      servicos_selecionados: [],
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
    bloco0: { ...base.bloco0, ...(data.bloco0 || {}), variacao_outra_categoria: normalizeBinary(data.bloco0?.variacao_outra_categoria) },
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

// KO-02: selo "veio de …" no campo preenchido da origem; mudar o valor pede o motivo (o servidor exige).
const OrigemCtx = createContext(null);

function OrigemInfo({ o }) {
  const ctx = useContext(OrigemCtx);
  if (!ctx || !o) return null;
  const [bloco, campo] = o.split(".");
  const info = ctx.q.origem?.[bloco]?.[campo];
  if (!info) return null;
  if (info.sobrescrito) {
    return <p className="mt-1 text-[10px] text-muted-foreground" data-testid="origem-sobrescrita">Alterado (veio de {info.fonte}): {info.motivo}</p>;
  }
  const mudou = ctx.original && JSON.stringify(ctx.original?.[bloco]?.[campo] ?? "") !== JSON.stringify(ctx.q?.[bloco]?.[campo] ?? "");
  return (
    <div className="mt-1 space-y-1">
      <span className="inline-flex rounded-full border border-sky-300/70 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300" data-testid="selo-origem">
        veio de {info.fonte}
      </span>
      {mudou && (
        <Input className="h-8 border-amber-400 text-xs dark:border-amber-600" placeholder={`Motivo para alterar o que veio de ${info.fonte} *`}
          value={ctx.q.motivos_sobrescrita?.[o] || ""} onChange={(ev) => ctx.setMotivo(o, ev.target.value)} data-testid="motivo-sobrescrita" />
      )}
    </div>
  );
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

function Field({ label, value, onChange, type = "text", className = "", o }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} />
      <OrigemInfo o={o} />
    </div>
  );
}

function TextField({ label, value, onChange, className = "", rows = 3, o }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Textarea rows={rows} value={value || ""} onChange={(event) => onChange(event.target.value)} />
      <OrigemInfo o={o} />
    </div>
  );
}

// KO-03: Sim / Não sem nenhum marcado até alguém responder (borda âmbar = pendente).
function YesNoToggle({ label, value, onChange, compact = false, o }) {
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
      <OrigemInfo o={o} />
    </div>
  );
}

function ChoiceGroup({ label, value, onChange, options, o }) {
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
      <OrigemInfo o={o} />
    </div>
  );
}

function CheckboxGroup({ label, values = [], onChange, options, o }) {
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
      <OrigemInfo o={o} />
    </div>
  );
}

// KO-04: um atributo do tipo — menu com "Outro", texto ou número com unidade.
function AtributoCampo({ def, linha, onChange }) {
  const valor = linha.atributos?.[def.chave] ?? "";
  const set = (campo, v) => onChange({ [campo]: { ...(linha[campo] || {}), [def.chave]: v } });
  const vazio = def.obrigatorio !== false && !valorAtributo(linha, def);
  const borda = vazio ? "border-amber-400 dark:border-amber-600" : "";
  const rotulo = <Label className="text-[11px]">{def.nome}{def.obrigatorio !== false ? " *" : ""}</Label>;
  if (def.tipo === "enum" && (def.opcoes || []).length) {
    return (
      <div className="space-y-1">
        {rotulo}
        <select className={`h-8 w-full rounded-md border bg-background px-2 text-xs ${borda}`} value={valor} onChange={(ev) => set("atributos", ev.target.value)}>
          <option value="">Selecione…</option>
          {def.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value={OUTRO}>Outro…</option>
        </select>
        {valor === OUTRO && <Input className="h-8 text-xs" placeholder="Qual?" value={linha.atributos_outro?.[def.chave] || ""} onChange={(ev) => set("atributos_outro", ev.target.value)} />}
      </div>
    );
  }
  if (def.tipo === "numero_unidade") {
    const unidades = def.unidades || [];
    const un = linha.atributos_unidade?.[def.chave] || unidades[0] || "";
    return (
      <div className="space-y-1">
        {rotulo}
        <div className="flex gap-1">
          <Input type="number" min="0" step="any" className={`h-8 text-xs ${borda}`} value={valor}
            onChange={(ev) => onChange({ atributos: { ...(linha.atributos || {}), [def.chave]: ev.target.value }, atributos_unidade: { ...(linha.atributos_unidade || {}), [def.chave]: un } })} />
          {unidades.length > 1 ? (
            <select className="h-8 rounded-md border bg-background px-1 text-xs" value={un} onChange={(ev) => set("atributos_unidade", ev.target.value)}>
              {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          ) : <span className="self-center text-xs text-muted-foreground">{un}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {rotulo}
      <Input className={`h-8 text-xs ${borda}`} value={valor} onChange={(ev) => set("atributos", ev.target.value)} />
    </div>
  );
}

// KO-04: características do tipo escolhido + "Especificação das características" montada, com complemento.
function CaracteristicasDaLinha({ linha, catalogo, onChange }) {
  const tp = catalogo.find((c) => c.codigo === linha.tipo_componente);
  // Tipo que saiu do catálogo: os atributos gravados na linha continuam editáveis como texto.
  const defs = tp ? tp.atributos : (linha.atributos_def || []).map((d) => ({ ...d, tipo: d.tipo === "enum" ? "texto" : d.tipo }));
  const espec = especificacaoDasCaracteristicas(linha);
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3" data-testid="caracteristicas-componente">
      {defs.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {defs.map((def) => <AtributoCampo key={def.chave} def={def} linha={linha} onChange={onChange} />)}
        </div>
      )}
      <div className="grid gap-2 lg:grid-cols-[1fr_320px]">
        <div>
          <Label className="text-[11px]">Especificação das características</Label>
          <p className="min-h-8 rounded-md border bg-background px-2 py-1.5 text-xs" data-testid="especificacao-caracteristicas">{espec || "—"}</p>
        </div>
        <div>
          <Label className="text-[11px]">Complemento</Label>
          <Input className="h-8 text-xs" placeholder="O que o menu não cobre" value={linha.especificacao_complemento || ""}
            onChange={(ev) => onChange({ especificacao_complemento: ev.target.value })} />
        </div>
      </div>
    </div>
  );
}

// KO-05: tipo de material do Cadastros por bloco (primária EP, secundária ES, terciária ET).
const TIPO_DO_BLOCO = { bloco2: "EP", bloco3: "ES", bloco4: "ET" };
const rotuloMaterial = (m) => `${m.codigo_interno} — ${m.nome}`;

function ComponentTable({ title, value, onChange, defaults, hasArt = false, bloco, materiais = [], catalogo = [], grupos = null }) {
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
  const mudarTipo = (index, codigo) => {
    const row = list[index] || {};
    if (codigo === TIPO_OUTRO) updateFields(index, escolherTipo(row, TIPO_OUTRO));
    else updateFields(index, escolherTipo(row, catalogo.find((c) => c.codigo === codigo) || null));
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
            {linhasPorGrupo(list, grupos).map(({ grupo, indice: index }, pos, ordem) => {
              const row = list[index];
              const cabecalho = grupo && (pos === 0 || ordem[pos - 1].grupo !== grupo);
              // KO-03: Aplicável? Não ou Definido? Não = linha resolvida; o resto só vale com os dois em Sim.
              const aplicavel = normalizeBinary(row.aplicavel) === "sim";
              const precisa = aplicavel && normalizeBinary(row.definido) === "sim";
              const tipos = tiposDaLinha(catalogo, bloco, row.id);
              const mostraCaracteristicas = precisa && !row.material_codigo && row.tipo_componente;
              return (
              <Fragment key={row.id || index}>
              {cabecalho && (
                <tr className="bg-muted/40" data-testid="grupo-componentes">
                  <th colSpan={hasArt ? 10 : 8} scope="colgroup" className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{grupo}</th>
                </tr>
              )}
              <tr className={normalizeBinary(row.aplicavel) === "nao" ? "opacity-60" : ""}>
                <td className="px-2 py-2 space-y-1">
                  <Input value={row.componente || ""} onChange={(event) => updateRow(index, "componente", event.target.value)} />
                  {aplicavel && !row.material_codigo && (
                    <select value={row.tipo_componente || ""} onChange={(event) => mudarTipo(index, event.target.value)} data-testid="tipo-componente"
                      className={`h-8 w-full rounded-md border bg-background px-2 text-xs ${precisa && !row.tipo_componente && !row.especificacao_fornecedor_codigo && !row.item_novo ? "border-amber-400 dark:border-amber-600" : ""}`}>
                      <option value="">Tipo…</option>
                      {tipos.map((tp) => <option key={tp.codigo} value={tp.codigo}>{tp.nome}</option>)}
                      <option value={TIPO_OUTRO}>Outro…</option>
                    </select>
                  )}
                  {aplicavel && row.tipo_componente === TIPO_OUTRO && (
                    <Input className="h-8 text-xs" placeholder="Qual tipo? Descreva" value={row.tipo_componente_outro || ""}
                      onChange={(event) => updateRow(index, "tipo_componente_outro", event.target.value)} />
                  )}
                </td>
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
              {mostraCaracteristicas && (
                <tr className="bg-muted/10">
                  <td colSpan={hasArt ? 10 : 8} className="px-2 pb-3 pt-0">
                    <CaracteristicasDaLinha linha={row} catalogo={catalogo} onChange={(fields) => updateFields(index, fields)} />
                  </td>
                </tr>
              )}
              </Fragment>
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

const LINHAS_DO_NIVEL = { primaria: BLOCO2_COMPONENTS, secundaria: BLOCO3_COMPONENTS, terciaria: BLOCO4_COMPONENTS };

export default function KickoffCompositionQuestionnaire({ value, onChange, onSave, saving, admin = false, original = null }) {
  const q = mergeQuestionnaire(value);
  const pend = pendenciasQuestionario(q).status;
  const [materiais, setMateriais] = useState([]);
  const [servicos, setServicos] = useState(null);
  const [catalogo, setCatalogo] = useState(CATALOGO_PADRAO);
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  // CRM-01: categoria do Bloco 0 = Cadastros › Categorias de produto (a mesma do CRM e do SKU).
  const [categorias, setCategorias] = useState([]);
  const carregarCatalogo = () => api.get("/config/tipos-componente")
    .then(({ data }) => { if (Array.isArray(data) && data.length) setCatalogo(data); }).catch(() => {});
  useEffect(() => {
    api.get("/cadastros/materiais").then(({ data }) => setMateriais(Array.isArray(data) ? data : [])).catch(() => setMateriais([]));
    carregarCatalogo();
    api.get("/cadastros/servicos").then(({ data }) => setServicos(Array.isArray(data) ? data : [])).catch(() => setServicos([]));
    api.get("/crm/constants").then(({ data }) => setCategorias(data?.categorias_produto || []))
      .catch((error) => console.error("Kickoff: categorias do Cadastros indisponíveis", error));
  }, []);
  const update = (section, field, nextValue) => {
    onChange({ ...q, [section]: { ...(q[section] || {}), [field]: nextValue } });
  };
  const origemCtx = { q, original, setMotivo: (o, v) => onChange({ ...q, motivos_sobrescrita: { ...(q.motivos_sobrescrita || {}), [o]: v } }) };

  return (
    <OrigemCtx.Provider value={origemCtx}>
    <div className="space-y-4" data-testid="kickoff-composition-questionnaire">
      {admin && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setCatalogoAberto(true)}>
            <Settings2 className="h-3.5 w-3.5" />Catálogo de componentes
          </Button>
          <CatalogoComponentesDialog open={catalogoAberto} onOpenChange={setCatalogoAberto} linhas={LINHAS_DO_NIVEL} onSalvo={carregarCatalogo} />
        </div>
      )}
      <Section title="Bloco 0 - Identificacao e comercial" pendencias={pend.bloco0.pendencias}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field o="bloco0.cliente" label="Cliente" value={q.bloco0.cliente} onChange={(v) => update("bloco0", "cliente", v)} />
          <Field o="bloco0.nome_produto" label="Nome do produto" value={q.bloco0.nome_produto} onChange={(v) => update("bloco0", "nome_produto", v)} />
          <ChoiceGroup o="bloco0.categoria" label="Categoria" value={q.bloco0.categoria} onChange={(v) => update("bloco0", "categoria", v)} options={opcoesDeCategoria(categorias, q.bloco0.categoria)
            .map((o) => ({ value: o.value, label: o.antigo ? o.label : `${o.curto} (${o.value})` }))} />
          <ChoiceGroup o="bloco0.forma_fisica" label="Forma fisica" value={q.bloco0.forma_fisica} onChange={(v) => update("bloco0", "forma_fisica", v)} options={[
            { value: "liquido", label: "Liquido" },
            { value: "creme_gel", label: "Creme / gel" },
            { value: "po", label: "Po" },
            { value: "aerossol", label: "Aerossol" },
            { value: "bastao", label: "Bastao" },
            { value: "outro", label: "Outro" },
          ]} />
          {q.bloco0.forma_fisica === "outro" && <Field o="bloco0.forma_fisica_outro" label="Qual forma física?" value={q.bloco0.forma_fisica_outro} onChange={(v) => update("bloco0", "forma_fisica_outro", v)} />}
          <Field o="bloco0.volume_gramatura" label="Volume / gramatura" value={q.bloco0.volume_gramatura} onChange={(v) => update("bloco0", "volume_gramatura", v)} />
          <Field o="bloco0.numero_skus_variacoes" label="No de SKUs / variacoes" value={q.bloco0.numero_skus_variacoes} onChange={(v) => update("bloco0", "numero_skus_variacoes", v)} />
          <CheckboxGroup o="bloco0.varia_entre_skus" label="O que varia entre SKUs" values={q.bloco0.varia_entre_skus} onChange={(v) => update("bloco0", "varia_entre_skus", v)} options={[
            { value: "cor", label: "Cor" },
            { value: "fragrancia", label: "Fragrancia" },
            { value: "versao", label: "Versao" },
            { value: "volume", label: "Volume" },
            { value: "outro", label: "Outro" },
          ]} />
          <Field o="bloco0.varia_entre_skus_outro" label="Outro tipo de variacao" value={q.bloco0.varia_entre_skus_outro} onChange={(v) => update("bloco0", "varia_entre_skus_outro", v)} />
          <YesNoToggle o="bloco0.variacao_outra_categoria" label="Alguma variação é de outra categoria?" value={q.bloco0.variacao_outra_categoria} onChange={(v) => update("bloco0", "variacao_outra_categoria", v)} />
          {normalizeBinary(q.bloco0.variacao_outra_categoria) === "sim" && <Field o="bloco0.variacao_outra_categoria_qual" label="Qual categoria?" value={q.bloco0.variacao_outra_categoria_qual} onChange={(v) => update("bloco0", "variacao_outra_categoria_qual", v)} />}
          <Field o="bloco0.unidades_por_display" label="Unidades por display" value={q.bloco0.unidades_por_display} onChange={(v) => update("bloco0", "unidades_por_display", v)} />
          <Field o="bloco0.displays_ou_unidades_por_caixa_master" label="Displays (ou unidades) por caixa master" value={q.bloco0.displays_ou_unidades_por_caixa_master} onChange={(v) => update("bloco0", "displays_ou_unidades_por_caixa_master", v)} />
          <ChoiceGroup o="bloco0.registro_notificacao_anvisa" label="Registro / notificacao ANVISA" value={q.bloco0.registro_notificacao_anvisa} onChange={(v) => update("bloco0", "registro_notificacao_anvisa", v)} options={[
            { value: "existe", label: "Existe" },
            { value: "a_providenciar", label: "A providenciar" },
          ]} />
          <Field o="bloco0.detentor_registro" label="Detentor do registro" value={q.bloco0.detentor_registro} onChange={(v) => update("bloco0", "detentor_registro", v)} />
          <ResponsavelTecnicoField nome={q.bloco0.responsavel_tecnico} id={q.bloco0.responsavel_tecnico_id}
            onChange={(campos) => onChange({ ...q, bloco0: { ...q.bloco0, ...campos } })} />
        </div>
        <ChoiceGroup o="bloco0.modelo_servico" label="Classificacao do projeto (modelo de servico)" value={q.bloco0.modelo_servico} onChange={(v) => update("bloco0", "modelo_servico", v)} options={[
          { value: "industrializacao_pura", label: "Industrializacao pura" },
          { value: "industrializacao_com_desenvolvimento", label: "Industrializacao com desenvolvimento" },
          { value: "full_service_marca_propria", label: "Full service / marca propria" },
        ]} />
        {/* KO-08: os serviços marcados aqui são os que a cotação cobra. */}
        {servicos === null ? null : servicos.length ? (
          <CheckboxGroup o="bloco0.servicos_selecionados" label="Serviços contratados (entram na cotação)" values={q.bloco0.servicos_selecionados}
            onChange={(v) => update("bloco0", "servicos_selecionados", v)}
            options={servicos.map((sv) => ({ value: sv.id, label: sv.codigo ? `${sv.codigo} · ${sv.nome}` : sv.nome }))} />
        ) : <p className="text-xs text-muted-foreground">Serviços contratados: a tabela de serviços está vazia (PCP › Cadastros › Serviços).</p>}
      </Section>

      <Section title="Bloco 1 - Formulacao" pendencias={pend.bloco1.pendencias}>
        <div className="grid gap-4 md:grid-cols-2">
          <ChoiceGroup o="bloco1.formula" label="Formula" value={q.bloco1.formula} onChange={(v) => update("bloco1", "formula", v)} options={[
            { value: "do_cliente", label: "Do cliente" },
            { value: "desenvolvida_kuryos", label: "Desenvolvida pela Kuryos" },
          ]} />
          <CheckboxGroup o="bloco1.cliente_fornece" label="O cliente fornece" values={q.bloco1.cliente_fornece} onChange={(v) => update("bloco1", "cliente_fornece", v)} options={[
            { value: "formula_documento", label: "Formula (documento)" },
            { value: "bulk_pronto", label: "Bulk pronto" },
            { value: "mps", label: "MPs" },
            { value: "nada", label: "Nada (Kuryos compra tudo)" },
          ]} />
          <YesNoToggle o="bloco1.tem_cor" label="Tem Cor?" value={q.bloco1.tem_cor} onChange={(v) => update("bloco1", "tem_cor", v)} />
          <YesNoToggle o="bloco1.tem_brilho_mica_glitter" label="Tem Brilho/mica/glitter?" value={q.bloco1.tem_brilho_mica_glitter} onChange={(v) => update("bloco1", "tem_brilho_mica_glitter", v)} />
          {normalizeBinary(q.bloco1.tem_cor) === "sim" && <Field o="bloco1.cor_descricao" label="Qual cor (descrição / código)? *" value={q.bloco1.cor_descricao} onChange={(v) => update("bloco1", "cor_descricao", v)} />}
          {normalizeBinary(q.bloco1.tem_brilho_mica_glitter) === "sim" && <Field o="bloco1.brilho_descricao" label="Qual brilho / mica / glitter? *" value={q.bloco1.brilho_descricao} onChange={(v) => update("bloco1", "brilho_descricao", v)} />}
          <Field o="bloco1.viscosidade" label="Qual a viscosidade?" value={q.bloco1.viscosidade} onChange={(v) => update("bloco1", "viscosidade", v)} />
          <Field o="bloco1.densidade" label="Qual a densidade?" value={q.bloco1.densidade} onChange={(v) => update("bloco1", "densidade", v)} />
          <Field o="bloco1.fragrancia_essencia" className="md:col-span-2" label="Fragrancia / essencia definida ou aprovada - casa de fragrancia e codigos" value={q.bloco1.fragrancia_essencia} onChange={(v) => update("bloco1", "fragrancia_essencia", v)} />
          <ChoiceGroup o="bloco1.compra_fragrancia_por" label="Compra da fragrancia por" value={q.bloco1.compra_fragrancia_por} onChange={(v) => update("bloco1", "compra_fragrancia_por", v)} options={[{ value: "cliente", label: "Cliente" }, { value: "kuryos", label: "Kuryos" }]} />
          <TextField o="bloco1.observacoes_formulacao" className="md:col-span-2" label="Observacoes de formulacao" value={q.bloco1.observacoes_formulacao} onChange={(v) => update("bloco1", "observacoes_formulacao", v)} />
        </div>
      </Section>

      <Section title="Bloco 2 - Embalagem primaria e sistema de fechamento" pendencias={pend.bloco2.pendencias}>
        <ComponentTable title="Componentes" bloco="bloco2" materiais={materiais} catalogo={catalogo} value={q.bloco2} defaults={BLOCO2_COMPONENTS} grupos={GRUPOS_BLOCO2} onChange={(v) => update("bloco2", "componentes", v.componentes)} />
      </Section>

      <Section title="Bloco 3 - Embalagem secundaria e comunicacao" pendencias={pend.bloco3.pendencias}>
        <ComponentTable title="Componentes graficos" bloco="bloco3" materiais={materiais} catalogo={catalogo} value={q.bloco3} defaults={BLOCO3_COMPONENTS} hasArt onChange={(v) => update("bloco3", "componentes", v.componentes)} />
      </Section>

      <Section title="Bloco 4 - Embalagem terciaria e logistica" pendencias={pend.bloco4.pendencias}>
        <ComponentTable title="Componentes logisticos" bloco="bloco4" materiais={materiais} catalogo={catalogo} value={q.bloco4} defaults={BLOCO4_COMPONENTS} onChange={(v) => update("bloco4", "componentes", v.componentes)} />
      </Section>

      <Section title="Bloco 5 - Qualidade de recebimento" pendencias={pend.bloco5.pendencias}>
        <TextField o="bloco5.especificacoes_cq_componentes" label="Especificacoes de CQ por componente (texto / anexos)" value={q.bloco5.especificacoes_cq_componentes} onChange={(v) => update("bloco5", "especificacoes_cq_componentes", v)} rows={4} />
        <TextField o="bloco5.testes_aprovacoes_obrigatorios" label="Testes / aprovacoes obrigatorios antes da producao" value={q.bloco5.testes_aprovacoes_obrigatorios} onChange={(v) => update("bloco5", "testes_aprovacoes_obrigatorios", v)} rows={4} />
        <YesNoToggle o="bloco5.amostra_referencia_fornecida_cliente" label="Amostra de referencia fornecida pelo cliente" value={q.bloco5.amostra_referencia_fornecida_cliente} onChange={(v) => update("bloco5", "amostra_referencia_fornecida_cliente", v)} />
        {normalizeBinary(q.bloco5.amostra_referencia_fornecida_cliente) === "sim" && <TextField o="bloco5.amostra_referencia_descricao" label="Descreva a amostra de referência (o que é, quem guarda) *" value={q.bloco5.amostra_referencia_descricao} onChange={(v) => update("bloco5", "amostra_referencia_descricao", v)} rows={2} />}
      </Section>

      <Section title="Fechamento" pendencias={pend.fechamento.pendencias}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field o="fechamento.data_prevista_inicio_producao" type="date" label="Data prevista de inicio de producao" value={q.fechamento.data_prevista_inicio_producao} onChange={(v) => update("fechamento", "data_prevista_inicio_producao", v)} />
          <Field o="fechamento.volume_primeiro_lote" label="Volume do primeiro lote" value={q.fechamento.volume_primeiro_lote} onChange={(v) => update("fechamento", "volume_primeiro_lote", v)} />
          <Field o="fechamento.responsavel_kuryos" label="Responsavel Kuryos" value={q.fechamento.responsavel_kuryos} onChange={(v) => update("fechamento", "responsavel_kuryos", v)} />
          <Field o="fechamento.responsavel_cliente" label="Responsavel Cliente" value={q.fechamento.responsavel_cliente} onChange={(v) => update("fechamento", "responsavel_cliente", v)} />
          <Field o="fechamento.data_preenchimento" type="date" label="Data do preenchimento" value={q.fechamento.data_preenchimento} onChange={(v) => update("fechamento", "data_preenchimento", v)} />
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-1 rounded-md border bg-background/95 p-3 backdrop-blur flex justify-end">
        <Button disabled={saving} onClick={onSave}>Salvar questionario</Button>
      </div>
    </div>
    </OrigemCtx.Provider>
  );
}
