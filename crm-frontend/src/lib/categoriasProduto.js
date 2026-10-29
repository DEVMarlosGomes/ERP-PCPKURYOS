/* CRM-01 (29/10/2026): "Categorias de interesse puxar as cadastradas no Cadastros".
 * Fonte única = Cadastros › Categorias de produto (config/categoriasProduto), a mesma lista do
 * modal "Novo Produto". O CRM grava o CÓDIGO (PRF, CAB…), que é o que o SKU usa; dado antigo
 * em texto livre ("perfume", "body_splash", "capilar") continua legível e se traduz pela tabela
 * abaixo — a mesma que a geração de SKU já usava (firebaseCommercial: resolveCategoria). */
import { normalizeName } from "./crmRules.js";

// Texto livre antigo do CRM/Kickoff → código do Cadastros. A ordem importa (primeira que casa
// vence): maquiagem e barba antes de pele; protetor, desodorante e sabonete antes de "facial"/
// "creme"; "tônico" só é cabelo quando capilar. Vocabulário conferido contra a base em 29/10/2026.
export const CATEGORIA_LEGADA = [
  [/maquiagem|batom|gloss|base_liquida|primer|blush|delineador|cilios|iluminador|fixador|bb_cream|cc_cream|sombra/, "MAQ"],
  [/barba|barbear/, "BAR"],
  [/bronzeador/, "BRZ"],
  [/protetor_solar|solar/, "SOL"],
  [/desodorante|antitranspirante|antiperspirante/, "DES"],
  [/sabonete|gel_de_banho|gel_banho|higiene|antisseptico/, "HIG"],
  [/shampoo|condicionador|capilar|cabelo|finalizador/, "CAB"],
  [/perfum|body_splash|colonia|extrato|fragr|eau_de|edp|edt/, "PRF"],
  [/infantil|bebe|baby/, "INF"],
  [/hidratante|corporal|facial|serum|creme|pele|skin|esfoliante|clareador|antiacne|vitamina_c|contorno_olhos|redutor|tonico|manteiga|locao/, "PEL"],
];

function lista(raw) {
  return (Array.isArray(raw) ? raw : Object.values(raw || {})).filter((c) => c && c.codigo);
}

// Ativas, na ordem do Cadastros (por nome), com o rótulo do modal "Novo Produto".
export function categoriasAtivas(raw) {
  return lista(raw)
    .filter((c) => c.ativo !== false)
    .map((c) => ({ codigo: String(c.codigo), nome: String(c.nome || c.codigo), exemplos: String(c.exemplos || "") }))
    .sort((a, b) => normalizeName(a.nome).localeCompare(normalizeName(b.nome)));
}

export function rotuloCategoria(c) {
  return `${c.nome} (${c.codigo})${c.exemplos ? ` — ${c.exemplos}` : ""}`;
}

function slugLegivel(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// Código do Cadastros para um valor gravado (código, nome ou texto antigo). null = não resolve.
export function codigoDaCategoria(value, categorias) {
  if (!value) return null;
  const ativas = categorias || [];
  const n = normalizeName(value);
  const direta = ativas.find((c) => normalizeName(c.codigo) === n || normalizeName(c.nome) === n);
  if (direta) return direta.codigo;
  const key = n.replace(/\s+/g, "_");
  const legado = CATEGORIA_LEGADA.find(([pattern]) => pattern.test(key));
  return legado && ativas.some((c) => c.codigo === legado[1]) ? legado[1] : null;
}

// Nome para exibir um valor gravado: código → "PERFUMARIA"; texto antigo → "Perfume".
export function nomeDaCategoria(value, categorias) {
  if (!value) return "";
  const c = (categorias || []).find((x) => x.codigo === value);
  return c ? c.nome : slugLegivel(value);
}

// Opções do seletor: as ativas + o que já estiver gravado e não for código ativo, marcado
// "(antigo)" para não sumir da tela (o usuário troca pelo código quando editar).
export function opcoesDeCategoria(categorias, valoresAtuais = []) {
  const ativas = categorias || [];
  const opcoes = ativas.map((c) => ({ value: c.codigo, label: rotuloCategoria(c), curto: c.nome, antigo: false }));
  const vistos = new Set(opcoes.map((o) => o.value));
  for (const v of [valoresAtuais].flat().filter(Boolean)) {
    if (vistos.has(v)) continue;
    vistos.add(v);
    opcoes.push({ value: v, label: `(antigo) ${slugLegivel(v)}`, curto: slugLegivel(v), antigo: true });
  }
  return opcoes;
}

// Migração do dado antigo (CRM-01): texto livre → código, em CAMINHOS PLANOS (um campo por
// caminho; nunca objeto aninhado, que apaga irmãos no RTDB). O que a tabela não resolve fica
// como está e vai para naoResolvidos, para decisão humana. Não grava nada: devolve o plano.
export function planoMigracaoCategorias({ projetos = {}, clientes = {}, amostras = {} }, categorias, tenant = "kuryos") {
  const updates = {};
  const naoResolvidos = [];
  const codigos = new Set((categorias || []).map((c) => c.codigo));
  const traduz = (valor, caminho) => {
    if (!valor || codigos.has(valor)) return valor;
    const codigo = codigoDaCategoria(valor, categorias);
    if (!codigo) naoResolvidos.push({ caminho, valor });
    return codigo || valor;
  };
  const campo = (no, itens, nome) => {
    for (const [id, item] of Object.entries(itens || {})) {
      const caminho = `erp/${tenant}/${no}/${id}/${nome}`;
      const atual = item?.[nome];
      if (!atual || typeof atual !== "string") continue;
      const novo = traduz(atual, caminho);
      if (novo !== atual) updates[caminho] = novo;
    }
  };
  campo("crm_projects", projetos, "categoria");
  campo("crm_samples", amostras, "categoria");
  for (const [id, cliente] of Object.entries(clientes || {})) {
    const atual = cliente?.categoria_interesse;
    if (!Array.isArray(atual) || !atual.length) continue;
    const caminho = `erp/${tenant}/crm_clients/${id}/categoria_interesse`;
    const novo = [...new Set(atual.map((v) => traduz(v, caminho)))];
    if (novo.length !== atual.length || novo.some((v, i) => v !== atual[i])) updates[caminho] = novo;
  }
  return { updates, naoResolvidos };
}
