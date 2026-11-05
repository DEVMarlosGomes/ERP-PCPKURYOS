/* "Adicionar ingrediente" do lote com a mesma linha da aba Manipulação (pedido do Marlos, 05/11): Fase,
 * Ingrediente com as sugestões do banco, INCI, Fornecedor (com o preço de cada um), %Fórmula, Preço R$/Kg,
 * Preço US$/Kg e MP nova. A biblioteca é a mesma (lib/bibliotecaMpPd). No lote, o % vai para as amostras
 * escolhidas em "Aplicar em" (padrão: todas); depois cada coluna se ajusta na matriz. */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldHint } from "@/components/ui/FieldHint";
import ChipTipoMpNova from "@/components/pd/ChipTipoMpNova";
import { ITEM_VAZIO, findSupplierByName, tipoMpNovaDoForm, toFiniteNumber, usePdMaterialLibrary } from "@/lib/bibliotecaMpPd";
import { COTACAO_USD_PADRAO, camposDePreco, precoBrlKg, precoUsd } from "@/lib/pdAmostra";
import { nomeFase } from "@/lib/fichaTecnica";
import { normalizarNomeMp } from "@/lib/filaCadastroMp";
import { chaveMaterialFase } from "@/lib/manipulacaoLote";

const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const RANK = ["text-green-700 bg-green-50 border-green-200 hover:bg-green-100", "text-yellow-700 bg-yellow-50 border-yellow-200 hover:bg-yellow-100",
  "text-orange-600 bg-orange-50 border-orange-200 hover:bg-orange-100"];
const corDoRank = (i) => RANK[i] || "text-red-600 bg-red-50 border-red-200 hover:bg-red-100";

/* Ingrediente do lote a partir da linha (o material mestre, o código e o tipo vêm do catálogo integrado). */
export function ingredienteDaLinha(item, catalogo = []) {
  const cat = item.catalog_id ? (catalogo || []).find((c) => c.id === item.catalog_id) || null : null;
  const usd = precoUsd(item);
  return {
    nome: String(item.ingredient_name || "").trim(), codigo: cat?.codigo_interno || "", catalog_id: item.catalog_id || "",
    master_material_id: cat?.master_material_id || (cat ? cat.id : "") || "", inci: String(item.inci || "").trim(), fase: nomeFase(item.phase),
    funcao: item.function || "", price_per_kg: Number(precoBrlKg(item, COTACAO_USD_PADRAO).toFixed(4)), price_usd: usd, price_currency: usd !== null ? "USD" : "BRL",
    unit: cat?.unidade || null, fornecedor: item.fornecedor || "", tipo_material: cat?.tipo_material || "",
    mp_nova: item.mp_nova_on ? { nome: String(item.ingredient_name || "").trim(), tipo: tipoMpNovaDoForm(item) } : null,
  };
}

/* A linha em si (sem o diálogo), para o lote e para os testes de tela. */
export function LinhaNovoIngrediente({ ingredientes, ativos, codigoDe, onAdicionar, idPrefixo = "lote" }) {
  const { catalog, ingredientOptions, getSuppliersForIngredient } = usePdMaterialLibrary();
  const [novo, setNovo] = useState(ITEM_VAZIO);
  const [pendente, setPendente] = useState(null);
  const [sugestoes, setSugestoes] = useState(false);
  const [alvo, setAlvo] = useState("todas");
  const filtradas = novo.ingredient_name
    ? ingredientOptions.filter((item) => [item.nome, item.inci, item.codigo_interno].some((v) => v && v.toLowerCase().includes(novo.ingredient_name.toLowerCase())))
    : ingredientOptions;
  const fornecedores = useMemo(() => getSuppliersForIngredient(novo.ingredient_name), [getSuppliersForIngredient, novo.ingredient_name]);
  const mpNovaJaCadastrada = useMemo(() => {
    const a = normalizarNomeMp(novo.ingredient_name);
    if (!novo.mp_nova_on || !a) return null;
    return ingredientOptions.find((o) => o.codigo_interno && normalizarNomeMp(o.nome) === a) || null;
  }, [novo.mp_nova_on, novo.ingredient_name, ingredientOptions]);

  const escolher = (cat) => {
    const fs = (cat.fornecedores || []).slice().sort((a, b) => (a.preco_rs_kg ?? Number.MAX_SAFE_INTEGER) - (b.preco_rs_kg ?? Number.MAX_SAFE_INTEGER));
    if (fs.length) {
      setNovo((p) => ({ ...p, ingredient_name: cat.nome, catalog_id: cat.catalog_id || "", inci: cat.inci || p.inci || "", mp_nova_on: false, ...camposDePreco(fs[0]?.preco_rs_kg, fs[0]?.moeda), fornecedor: "" }));
      setPendente({ ...cat, fornecedores: fs });
    } else {
      setNovo((p) => ({ ...p, ingredient_name: cat.nome, ...camposDePreco(cat.preco_rs_kg, "BRL"), fornecedor: cat.fornecedor || "", catalog_id: cat.catalog_id || "",
        inci: cat.inci || "", mp_nova_on: false, mp_nova_nome: "", mp_nova_tipo: "" }));
      setPendente(null);
    }
    setSugestoes(false);
  };
  const digitarFornecedor = (valor) => {
    const achado = findSupplierByName(fornecedores, valor);
    setNovo((p) => ({ ...p, fornecedor: valor, ...(achado && achado.preco_rs_kg !== null ? camposDePreco(achado.preco_rs_kg, achado.moeda) : {}) }));
  };
  const adicionar = () => {
    if (!novo.ingredient_name.trim()) return toast.error("Preencha o ingrediente.");
    if (!novo.catalog_id && !novo.mp_nova_on) return toast.error("Escolha uma MP cadastrada na lista ou marque \"MP nova (ainda não cadastrada)\".");
    const ing = ingredienteDaLinha(novo, catalog);
    if (Object.values(ingredientes || {}).some((x) => chaveMaterialFase(x) === chaveMaterialFase(ing))) return toast.error(`${ing.nome} já está no lote nesta fase.`);
    const pct = num(novo.percentage);
    if (pct < 0 || pct > 100) return toast.error("O % fica entre 0 e 100.");
    onAdicionar(ing, pct, alvo === "todas" ? ativos : [alvo]);
    setNovo(ITEM_VAZIO);
    setPendente(null);
    setSugestoes(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-end p-3 bg-muted/30 rounded-lg border border-dashed relative" data-testid="linha-novo-ingrediente">
        <div className="w-14">
          <Label className="text-[11px] text-muted-foreground">Fase</Label>
          <Input value={novo.phase} onChange={(e) => setNovo((p) => ({ ...p, phase: e.target.value }))} placeholder="A" className="h-8 text-sm text-center" list={`${idPrefixo}-fases`} />
          <datalist id={`${idPrefixo}-fases`}>{["A", "B", "C", "D", "E"].map((x) => <option key={x} value={x} />)}</datalist>
        </div>
        <div className="flex-1 min-w-[12rem] relative">
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
            Ingrediente
            {novo.catalog_id && <Badge className="text-[9px] h-3.5 px-1 bg-green-500/20 text-green-700 border-green-300">do banco</Badge>}
          </Label>
          <Input value={novo.ingredient_name}
            onChange={(e) => { setNovo((p) => ({ ...p, ingredient_name: e.target.value, catalog_id: "", fornecedor: "" })); setPendente(null); setSugestoes(true); }}
            onFocus={() => setSugestoes(true)} onBlur={() => setTimeout(() => setSugestoes(false), 200)}
            placeholder={ingredientOptions.length > 0 ? "Digite ou escolha uma MP cadastrada..." : "Nome do ingrediente"} className="h-8 text-sm" data-testid="ingrediente-lote" />
          {sugestoes && filtradas.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-full sm:w-[min(40rem,calc(100vw-2rem))] bg-popover border rounded-md shadow-lg z-50 max-h-80 overflow-y-auto" data-testid="sugestoes-ingrediente-lote">
              {filtradas.slice(0, 15).map((cat) => {
                const temFornecedores = (cat.fornecedores || []).length > 0;
                const precos = (cat.fornecedores || []).map((f) => toFiniteNumber(f.preco_rs_kg)).filter((x) => x !== null);
                const bruto = precos.length > 0 ? Math.min(...precos) : toFiniteNumber(cat.preco_rs_kg);
                const precoMin = bruto > 0 ? bruto : null; // preço zero no cadastro é falta de preço
                return (
                  <button key={cat.option_key} type="button" onMouseDown={(e) => { e.preventDefault(); escolher(cat); }}
                    className="w-full text-left px-3 py-2 hover:bg-muted border-b last:border-0 flex items-start justify-between gap-3" title={cat.nome}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium whitespace-normal break-words leading-snug">{cat.nome}</div>
                      <div className="text-[11px] text-muted-foreground whitespace-normal break-words">
                        {cat.inci && <>INCI: {cat.inci}</>}
                        {cat.codigo_interno && <> · {cat.codigo_interno}</>}
                        {temFornecedores ? <> · {cat.fornecedores.length} fornecedor(es)</> : cat.fornecedor ? <> · {cat.fornecedor}</> : null}
                        {cat.categoria && <> · {cat.categoria}</>}
                      </div>
                    </div>
                    <span className="text-xs font-mono font-semibold shrink-0 text-green-700">
                      {precoMin !== null ? <>{temFornecedores ? "a partir de " : ""}R$ {precoMin.toFixed(2)}/{cat.unidade || "kg"}</> : "sem preço"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {pendente && (
            <div className="mt-1 border rounded-md bg-popover shadow-md p-2 z-40">
              <div className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Selecionar fornecedor — {pendente.nome}</div>
              <div className="space-y-1">
                {pendente.fornecedores.map((sup, idx) => (
                  <button key={idx} type="button" className={`w-full text-left px-2 py-1.5 rounded border text-xs flex items-center justify-between gap-2 transition-colors ${corDoRank(idx)}`}
                    onClick={() => {
                      setNovo((p) => (sup.moeda === "USD" ? { ...p, fornecedor: sup.nome, price_per_kg: "", price_usd: String(sup.preco_rs_kg || 0) }
                        : { ...p, fornecedor: sup.nome, price_per_kg: String(sup.preco_rs_kg || 0), price_usd: "" }));
                      setPendente(null);
                    }}>
                    <span className="font-medium">{sup.nome}{sup.codigo && <span className="text-[10px] ml-1 opacity-70">· {sup.codigo}</span>}</span>
                    <span className="font-mono font-semibold shrink-0">{sup.moeda === "USD" ? "US$" : "R$"} {(sup.preco_rs_kg || 0).toFixed(2)}/{pendente.unidade || "kg"}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground underline" onClick={() => setPendente(null)}>← inserir preço manualmente</button>
            </div>
          )}
        </div>
        <div className="w-40">
          <Label className="text-[11px] text-muted-foreground">INCI</Label>
          <Input value={novo.inci} onChange={(e) => setNovo((p) => ({ ...p, inci: e.target.value }))} placeholder="Nome INCI" className="h-8 text-sm" />
        </div>
        <div className="w-28">
          <Label className="text-[11px] text-muted-foreground">Fornecedor</Label>
          <Input value={novo.fornecedor} onChange={(e) => digitarFornecedor(e.target.value)} placeholder="Fornecedor" className="h-8 text-sm"
            list={fornecedores.length > 0 ? `${idPrefixo}-fornecedores` : undefined} />
          {fornecedores.length > 0 && (
            <datalist id={`${idPrefixo}-fornecedores`}>
              {fornecedores.map((f) => <option key={`${f.id}-${f.razao_social}`} value={f.razao_social}>{f.nome_fantasia ? `${f.razao_social} (${f.nome_fantasia})` : f.razao_social}</option>)}
            </datalist>
          )}
        </div>
        <div className="w-20">
          <Label className="text-[11px] text-muted-foreground"><FieldHint hint="Percentual em massa deste ingrediente na amostra. No lote, entra nas amostras de &quot;Aplicar em&quot;; depois cada coluna se ajusta na matriz.">%Fórmula</FieldHint></Label>
          <Input type="number" step="0.001" value={novo.percentage} onChange={(e) => setNovo((p) => ({ ...p, percentage: e.target.value }))} placeholder="0.000" className="h-8 text-sm font-mono" data-testid="pct-ingrediente-lote" />
        </div>
        <div className="w-28">
          <Label className="text-[11px] text-muted-foreground">Preço R$/Kg</Label>
          {precoUsd(novo) !== null ? (
            <div className="h-8 px-2 text-sm font-mono leading-8 rounded border bg-muted/40 text-muted-foreground" title={`Estimado pela cotação US$ ${COTACAO_USD_PADRAO.toFixed(2)}; na ordem vale o dólar do dia`}>
              {precoBrlKg(novo, COTACAO_USD_PADRAO).toFixed(2)}
            </div>
          ) : (
            <Input type="number" step="0.01" value={novo.price_per_kg} onChange={(e) => setNovo((p) => ({ ...p, price_per_kg: e.target.value }))} placeholder="0.00" className="h-8 text-sm font-mono" />
          )}
        </div>
        <div className="w-28">
          <Label className="text-[11px] text-muted-foreground text-yellow-700">Preço US$/Kg</Label>
          <Input type="number" step="0.01" value={novo.price_usd} onChange={(e) => setNovo((p) => ({ ...p, price_usd: e.target.value }))} placeholder="opcional" className="h-8 text-sm font-mono border-yellow-300" />
        </div>
        <div className="w-40">
          <Label className="text-[11px] text-muted-foreground">Aplicar em</Label>
          <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" value={alvo} onChange={(e) => setAlvo(e.target.value)} aria-label="Aplicar o % em">
            <option value="todas">Todas as amostras</option>
            {(ativos || []).map((r) => <option key={r} value={r}>{codigoDe ? codigoDe(r) : r}</option>)}
          </select>
        </div>
        <Button size="sm" className="h-8 gap-1" onClick={adicionar} data-testid="btn-adicionar-ingrediente-lote"><Plus className="h-3 w-3" /> Adicionar</Button>
        <div className="basis-full flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground">
            <input type="checkbox" checked={novo.mp_nova_on} onChange={(e) => setNovo((p) => ({ ...p, mp_nova_on: e.target.checked, catalog_id: e.target.checked ? "" : p.catalog_id }))} />
            MP nova (ainda não cadastrada)
          </label>
          {novo.mp_nova_on && (
            <>
              <ChipTipoMpNova tipo={tipoMpNovaDoForm(novo)} onTrocar={() => setNovo((p) => ({ ...p, mp_nova_tipo: tipoMpNovaDoForm(p) === "MPES" ? "MPGR" : "MPES" }))} />
              <span className="text-[10px] text-muted-foreground">
                Ao salvar o lote, vai para a fila do Cadastros como “{novo.ingredient_name.trim() || "nome do ingrediente"}” (amostra em desenvolvimento).
              </span>
              {mpNovaJaCadastrada && (
                <button type="button" onClick={() => escolher(mpNovaJaCadastrada)} data-testid="vincular-mp-existente-lote"
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                  Já existe {mpNovaJaCadastrada.codigo_interno} — vincular
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NovoIngredienteLote({ ingredientes, ativos, codigoDe, onAdicionar, onFechar }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-[min(96vw,1200px)]">
        <DialogHeader>
          <DialogTitle>Adicionar ingrediente ao lote</DialogTitle>
          <DialogDescription>Os mesmos campos da aba Manipulação. O % entra nas amostras de "Aplicar em"; o resto fica 0 % e se ajusta na matriz.</DialogDescription>
        </DialogHeader>
        <LinhaNovoIngrediente ingredientes={ingredientes} ativos={ativos} codigoDe={codigoDe} onAdicionar={onAdicionar} />
      </DialogContent>
    </Dialog>
  );
}
