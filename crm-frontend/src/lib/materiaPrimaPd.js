/* PD-02 (reunião 28/10/2026): ingrediente do P&D é só matéria-prima — MPES (fragrância/essência)
 * e MPGR (granel). As rotas de materiais devolviam o cadastro inteiro, com as embalagens
 * (EP/ES/ET), e o P&D via frasco e válvula como ingrediente. O Kickoff precisa das embalagens:
 * o filtro vale só para quem pede (o P&D). Funções puras, sem banco. */

export const TIPOS_MP_PD = ["MPES", "MPGR"];
const TIPOS_EMBALAGEM = ["EP", "ES", "ET"];

const tipoDe = (m) => String(m?.tipo_material || "").trim().toUpperCase();
// Código interno de embalagem no Cadastros: EP-00001, ES-00012, ET-00012.
const CODIGO_EMBALAGEM = /^(EP|ES|ET)[-\s]?\d/i;

/* Material serve de ingrediente? Com tipo do Cadastros, só MPES/MPGR. Item do banco de custos do
 * P&D sem tipo (criado à mão, sem vínculo com o Cadastros) segue valendo, desde que não seja
 * embalagem pela categoria ou pelo código. */
export function ehMateriaPrimaPd(material, tipos = TIPOS_MP_PD) {
  if (!material) return false;
  const tipo = tipoDe(material);
  if (tipo) return tipos.includes(tipo);
  if (String(material.categoria || "").toLowerCase() === "embalagem") return false;
  return !CODIGO_EMBALAGEM.test(String(material.codigo_interno || ""));
}

/* "MPES,MPGR" ou ["MPES","MPGR"] → lista em maiúsculas; vazio → null (sem filtro). */
export function tiposDoFiltro(valor) {
  const lista = (Array.isArray(valor) ? valor : String(valor || "").split(","))
    .map((t) => String(t).trim().toUpperCase()).filter(Boolean);
  return lista.length ? lista : null;
}

export function filtrarMateriaisPd(materiais, tipos = TIPOS_MP_PD) {
  return (materiais || []).filter((m) => ehMateriaPrimaPd(m, tipos));
}

/* Ingrediente JÁ gravado na fórmula que é embalagem (gravado antes do filtro): não some,
 * aparece com aviso. Olha o tipo, se o item tiver, e o código do Cadastros. */
export function ingredienteEhEmbalagem(item) {
  if (!item) return false;
  const tipo = tipoDe(item);
  if (tipo) return TIPOS_EMBALAGEM.includes(tipo);
  return CODIGO_EMBALAGEM.test(String(item.material_code || item.codigo_interno || ""));
}
