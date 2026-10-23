/* Catálogo de tipos de componente do Kickoff (KO-04, PROMPT_ENGENHARIA_PACOTE_20261021.md).
 *
 * Antes: as opções viviam nos rótulos das 21 linhas padrão ("Frasco / pote / bisnaga",
 * "Tampa (rosca / flip-top / pressao)") e a especificação era texto livre — Compras e Engenharia
 * voltavam a perguntar. Agora cada linha oferece um menu de tipos e cada tipo tem os seus
 * atributos (menu com "Outro", texto ou número com unidade). Os valores escolhidos montam a
 * "Especificação das características", com complemento editável.
 *
 * O padrão fica aqui; `config/tipos_componente/{codigo}` sobrescreve ou acrescenta tipos sem
 * deploy (ADM edita na tela do Kickoff). A linha do questionário guarda `atributos_def` (chave,
 * nome, obrigatório) do tipo escolhido: pendência, BOM e cotação leem a linha sem o catálogo, e
 * mudar o catálogo depois não muda o que já foi especificado.
 * Funções puras: nada aqui lê ou grava no banco. */

export const OUTRO = "Outro";
export const TIPO_OUTRO = "OUTRO";
export const NIVEIS = ["primaria", "secundaria", "terciaria"];
export const NIVEL_DO_BLOCO = { bloco2: "primaria", bloco3: "secundaria", bloco4: "terciaria" };
export const TIPOS_DE_ATRIBUTO = ["enum", "texto", "numero_unidade"];

const e = (chave, nome, opcoes, extra = {}) => ({ chave, nome, tipo: "enum", opcoes, obrigatorio: true, inclui_outro: true, ...extra });
const t = (chave, nome, extra = {}) => ({ chave, nome, tipo: "texto", opcoes: [], obrigatorio: true, inclui_outro: false, ...extra });
const n = (chave, nome, unidades, extra = {}) => ({ chave, nome, tipo: "numero_unidade", opcoes: [], unidades, obrigatorio: true, inclui_outro: false, ...extra });

// Listas tiradas do Cadastros › Materiais (EP/ES/ET) para os dois falarem a mesma língua.
const PLASTICOS = ["PET", "PEAD", "PEBD", "PP", "PS", "PETG", "PVC", "Acrílico"];
const ROSCAS = ["18/410", "20/410", "24/410", "24/415", "28/410", "28/400", "FEA 15", "Crimp 20"];
const ROSCAS_POTE = ["38/400", "53/400", "58/400", "63/400", "70/400", "89/400"];
const ACABAMENTO = ["Brilhante", "Fosco", "Jateado", "Metalizado", "Transparente"];
const DECORACAO = ["Sem decoração", "Silk", "Hot stamping", "Rótulo", "Sleeve"];
const capacidade = n("capacidade", "Capacidade", ["mL", "g"]);
const cor = t("cor", "Cor");
const tubo = n("tubo_pescador", "Tubo pescador", ["mm"], { obrigatorio: false });

const tipo = (codigo, nome, nivel_embalagem, linha, atributos) => ({ codigo, nome, nivel_embalagem, linha, ativo: true, atributos });

export const CATALOGO_PADRAO = [
  // Bloco 2 — primária
  tipo("FRASCO", "Frasco", "primaria", "frasco_pote_bisnaga", [
    e("formato", "Formato", ["Cilíndrico", "Oval", "Quadrado", "Retangular", "Boston round"]), capacidade,
    e("material", "Material", [...PLASTICOS, "Vidro", "Alumínio"]), cor, e("rosca", "Rosca / gargalo", ROSCAS),
    e("acabamento", "Acabamento", ACABAMENTO), e("decoracao", "Decoração", DECORACAO)]),
  tipo("POTE", "Pote", "primaria", "frasco_pote_bisnaga", [
    e("formato", "Formato", ["Redondo", "Quadrado", "Facetado", "Parede dupla"]), capacidade,
    e("material", "Material", [...PLASTICOS, "Vidro"]), cor, e("rosca", "Rosca", ROSCAS_POTE),
    e("tipo_tampa", "Tipo de tampa", ["Rosca", "Pressão", "Flip-top"]), t("material_cor_tampa", "Material e cor da tampa"),
    e("batoque_selo", "Batoque / selo", ["Sem", "Batoque", "Selo de indução", "Disco de vedação"]),
    e("acabamento", "Acabamento", ACABAMENTO), e("decoracao", "Decoração", DECORACAO)]),
  tipo("BISNAGA", "Bisnaga", "primaria", "frasco_pote_bisnaga", [
    n("diametro", "Diâmetro", ["mm"]), capacidade,
    e("material", "Material", ["PEBD", "PEAD", "Coextrudada com barreira (EVOH)", "Laminada (ABL/PBL)", "Alumínio"]), cor,
    e("tipo_tampa", "Tipo de tampa", ["Flip-top", "Rosca", "Disc-top", "Cânula"]),
    e("acabamento", "Acabamento", ACABAMENTO), e("decoracao", "Decoração", ["Offset", "Silk", "Hot stamping", "Rótulo"])]),
  tipo("AIRLESS", "Airless", "primaria", "airless_rollon_ampola", [
    capacidade, e("material", "Material", ["PP", "PETG", "Acrílico", "Vidro"]), cor,
    n("dosagem", "Dosagem por acionamento", ["mL"]), e("acabamento", "Acabamento", ACABAMENTO)]),
  tipo("ROLL_ON", "Roll-on", "primaria", "airless_rollon_ampola", [
    capacidade, e("material", "Material do frasco", ["Vidro", "PP", "PET"]), e("esfera", "Esfera", ["Vidro", "PP", "Aço inox"]), cor]),
  tipo("AMPOLA", "Ampola", "primaria", "airless_rollon_ampola", [
    capacidade, e("material", "Material", ["Vidro âmbar", "Vidro incolor", "Plástico"]),
    e("fechamento", "Fechamento", ["Quebra (OPC)", "Conta-gotas", "Rosca"])]),
  tipo("TAMPA", "Tampa", "primaria", "tampa", [
    e("tipo", "Tipo", ["Rosca", "Flip-top", "Pressão", "Disc-top", "Sobretampa"]), e("rosca", "Rosca", [...ROSCAS, ...ROSCAS_POTE]),
    e("material", "Material", ["PP", "PE", "ABS", "Metalizada"]), cor, e("acabamento", "Acabamento", ACABAMENTO),
    e("lacre", "Lacre", ["Sem lacre", "Lacre de segurança", "Com batoque"])]),
  tipo("VALVULA_PUMP", "Válvula pump / bomba dosadora", "primaria", "valvula_pump", [
    e("rosca", "Rosca", ROSCAS), n("dosagem", "Dosagem", ["mL"]), tubo,
    e("trava", "Trava", ["Lock-up (rosca)", "Clip", "Sem trava"]), e("material_corpo", "Material do corpo", ["PP", "PE", "Metal"]), cor,
    e("acabamento", "Acabamento", ACABAMENTO)]),
  tipo("VALVULA_SPRAY", "Válvula spray / atomizador", "primaria", "valvula_spray", [
    e("rosca", "Rosca", ROSCAS), e("tipo", "Tipo de jato", ["Bruma (mist)", "Atomizador fino", "Jato"]),
    n("dosagem", "Dosagem", ["mL"]), tubo, cor, e("acabamento", "Acabamento", ACABAMENTO),
    e("sobretampa", "Sobretampa", ["Com sobretampa", "Sem sobretampa"])]),
  tipo("VALVULA_AEROSSOL", "Válvula aerossol + atuador", "primaria", "valvula_aerossol_atuador", [
    e("tipo_valvula", "Válvula", ["Contínua", "Dosadora", "Bag-on-valve"]), e("atuador", "Atuador", ["Spray", "Espuma", "Gel"]),
    n("diametro_lata", "Diâmetro da lata", ["mm"]), t("propelente", "Propelente"), cor]),
  tipo("GATILHO", "Gatilho / trigger", "primaria", "gatilho_trigger", [
    e("rosca", "Rosca", ["28/400", "28/410"]), e("tipo", "Tipo", ["Spray / jato regulável", "Espuma", "Mini trigger"]), tubo, cor]),
  tipo("BATOQUE", "Batoque / redutor / orifício", "primaria", "batoque_redutor_orificio", [
    e("tipo", "Tipo", ["Batoque", "Redutor de vazão", "Orifício gotejador"]), n("diametro", "Diâmetro do gargalo", ["mm"]),
    e("material", "Material", ["PE", "PEBD"]), cor]),
  tipo("LACRE_INDUCAO", "Lacre de indução / disco de vedação", "primaria", "lacre_inducao_disco", [
    e("tipo", "Tipo", ["Indução", "Pressão (PS)", "Disco de vedação"]), n("diametro", "Diâmetro", ["mm"]),
    e("material", "Material", ["Alumínio/PET", "Papelão/PE", "Espuma PE"]), e("impressao", "Impressão", ["Sem impressão", "Padrão", "Logo do cliente"])]),
  tipo("APLICADOR", "Aplicador", "primaria", "aplicador", [
    e("tipo", "Tipo", ["Pincel", "Espátula", "Esponja", "Ponteira", "Cânula"]), t("material", "Material"), cor]),
  // Bloco 3 — secundária
  tipo("ROTULO", "Rótulo", "secundaria", "rotulo", [
    e("posicao", "Posição", ["Frontal", "Contra", "Frontal + contra", "Envolvente"]),
    e("material", "Material", ["BOPP branco", "BOPP transparente", "BOPP metalizado", "Couché", "Vinil"]),
    n("largura", "Largura", ["mm"]), n("altura", "Altura", ["mm"]), e("impressao", "Impressão", ["Flexo", "Digital", "Offset"]),
    e("acabamento", "Acabamento", ["Brilho", "Fosco", "Verniz localizado", "Hot stamping", "Relevo"]),
    e("aplicacao", "Aplicação", ["Automática", "Manual"])]),
  tipo("CARTUCHO", "Cartucho", "secundaria", "cartucho", [
    e("material", "Material", ["Duplex", "Triplex", "Cartão SBS", "Kraft"]), n("gramatura", "Gramatura", ["g/m²"]),
    e("formato", "Formato", ["Reto", "Fundo automático", "Gaveta", "Tampa e fundo"]), t("dimensoes", "Dimensões (C × L × A mm)"),
    e("impressao", "Impressão", ["Offset 4 cores", "Pantone", "4 cores + Pantone", "Sem impressão"]),
    e("acabamento", "Acabamento", ["Laminação brilho", "Laminação fosca", "Verniz UV", "Hot stamping", "Relevo", "Janela"])]),
  tipo("BULA", "Bula / folheto", "secundaria", "bula_folheto", [
    t("tamanho", "Tamanho aberto (mm)"), e("papel", "Papel", ["Sulfite", "Couché", "Bíblia"]),
    n("dobras", "Dobras", ["dobras"]), e("impressao", "Impressão", ["1 cor", "2 cores", "4 cores"])]),
  tipo("SELO_SEGURANCA", "Selo / lacre de segurança", "secundaria", "selo_lacre_seguranca", [
    e("tipo", "Tipo", ["Selo adesivo", "Lacre plástico", "Holográfico"]), t("dimensoes", "Dimensões (mm)"),
    e("impressao", "Impressão", ["Sem impressão", "Padrão", "Logo do cliente"])]),
  tipo("SHRINK", "Celofane / shrink", "secundaria", "celofane_shrink", [
    e("tipo", "Tipo", ["Shrink total", "Banda de lacre", "Celofane"]), e("material", "Material", ["PVC", "PETG", "PP"]),
    n("espessura", "Espessura", ["µm"])]),
  tipo("BERCO", "Berço / suporte interno", "secundaria", "berco_suporte_interno", [
    e("material", "Material", ["Cartão", "Papelão", "PET termoformado", "EVA"]), t("formato", "Formato"),
    n("cavidades", "Cavidades", ["un"])]),
  // Bloco 4 — terciária
  tipo("DISPLAY", "Display / expositor de PDV", "terciaria", "display_expositor_pdv", [
    e("tipo", "Tipo", ["Display de balcão", "Display de chão", "Bandeja"]),
    e("material", "Material", ["Papelão microondulado", "Cartão", "Acrílico"]), t("dimensoes", "Dimensões (C × L × A mm)"),
    e("impressao", "Impressão", ["Sem impressão", "1 cor", "4 cores"])]),
  tipo("CAIXA_MASTER", "Caixa de embarque (master)", "terciaria", "caixa_master", [
    e("material", "Material", ["Papelão onda simples", "Papelão onda dupla", "Kraft"]), t("dimensoes", "Dimensões (C × L × A mm)"),
    e("impressao", "Identificação", ["Sem impressão", "Impressão 1 cor", "Etiqueta"]), t("resistencia", "Resistência (ECT/coluna)", { obrigatorio: false })]),
  tipo("DIVISORIA", "Divisória / colmeia", "terciaria", "divisoria_colmeia", [
    e("material", "Material", ["Papelão", "Cartão", "Plástico"]), n("celulas", "Células", ["un"])]),
  tipo("CANTONEIRA", "Cantoneira", "terciaria", "cantoneira", [
    e("material", "Material", ["Papelão", "Plástico"]), n("comprimento", "Comprimento", ["mm"])]),
  tipo("PALETIZACAO", "Paletização", "terciaria", "paletizacao", [
    e("palete", "Palete", ["PBR 1,00 × 1,20", "Europeu 0,80 × 1,20", "Descartável (one-way)"]),
    n("caixas_por_camada", "Caixas por camada", ["cx"]), n("camadas", "Camadas", ["camadas"]),
    e("filme", "Filme", ["Stretch manual", "Stretch automático", "Shrink"]), n("altura_maxima", "Altura máxima", ["mm"], { obrigatorio: false })]),
];

const VAZIO = (v) => v === undefined || v === null || String(v).trim() === "";

/* Catálogo vigente = padrão + config/tipos_componente (o do banco vence pelo código; `ativo: false`
 * esconde). Entrada inválida do banco é ignorada, nunca derruba a tela. */
export function mesclarCatalogo(padrao = CATALOGO_PADRAO, doBanco = {}) {
  const porCodigo = new Map(padrao.map((tp) => [tp.codigo, tp]));
  for (const [codigo, tp] of Object.entries(doBanco || {})) {
    if (!tp || typeof tp !== "object") continue;
    porCodigo.set(codigo, { ...tp, codigo, atributos: Array.isArray(tp.atributos) ? tp.atributos : Object.values(tp.atributos || {}) });
  }
  return [...porCodigo.values()].filter((tp) => tp.ativo !== false && NIVEIS.includes(tp.nivel_embalagem));
}

// Tipos da linha padrão; linha acrescentada à mão (ou linha sem tipo próprio) vê todos os tipos do nível.
export function tiposDaLinha(catalogo, bloco, linhaId) {
  const doNivel = (catalogo || []).filter((tp) => tp.nivel_embalagem === NIVEL_DO_BLOCO[bloco]);
  const daLinha = doNivel.filter((tp) => tp.linha === linhaId);
  return daLinha.length ? daLinha : doNivel;
}

/* Escolher o tipo: guarda o código, o nome e a definição dos atributos (sem as opções) e mantém
 * os valores de atributos que o tipo novo também tem. */
export function escolherTipo(linha, tp, textoOutro = "") {
  if (!tp) return { tipo_componente: "", tipo_componente_nome: "", tipo_componente_outro: "", atributos_def: [], atributos: {}, atributos_outro: {}, atributos_unidade: {} };
  if (tp === TIPO_OUTRO) {
    return { tipo_componente: TIPO_OUTRO, tipo_componente_nome: OUTRO, tipo_componente_outro: textoOutro || linha?.tipo_componente_outro || "",
      atributos_def: [], atributos: {}, atributos_outro: {}, atributos_unidade: {} };
  }
  const chaves = new Set(tp.atributos.map((a) => a.chave));
  const manter = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => chaves.has(k)));
  return {
    tipo_componente: tp.codigo, tipo_componente_nome: tp.nome, tipo_componente_outro: "",
    atributos_def: tp.atributos.map((a) => ({ chave: a.chave, nome: a.nome, tipo: a.tipo, obrigatorio: a.obrigatorio !== false })),
    atributos: manter(linha?.atributos), atributos_outro: manter(linha?.atributos_outro), atributos_unidade: manter(linha?.atributos_unidade),
  };
}

// Valor do atributo como texto: "Outro" vira o que foi escrito; número leva a unidade.
export function valorAtributo(linha, def) {
  const v = linha?.atributos?.[def.chave];
  if (VAZIO(v)) return "";
  if (v === OUTRO) return String(linha?.atributos_outro?.[def.chave] || "").trim();
  if (def.tipo === "numero_unidade") {
    const un = linha?.atributos_unidade?.[def.chave];
    return `${String(v).trim()}${un ? ` ${un}` : ""}`;
  }
  return String(v).trim();
}

export function atributosPendentes(linha) {
  return (linha?.atributos_def || []).filter((def) => def.obrigatorio && VAZIO(valorAtributo(linha, def)));
}

/* "Especificação das características": tipo + atributos preenchidos, na ordem do catálogo, mais o
 * complemento escrito à mão. Linha sem tipo devolve só o complemento. */
export function especificacaoDasCaracteristicas(linha) {
  const r = linha || {};
  const nomeTipo = r.tipo_componente === TIPO_OUTRO ? String(r.tipo_componente_outro || "").trim() : r.tipo_componente_nome || "";
  const partes = (r.atributos_def || []).map((def) => [def.nome, valorAtributo(r, def)]).filter(([, v]) => v).map(([nome, v]) => `${nome}: ${v}`);
  return [nomeTipo, ...partes, String(r.especificacao_complemento || "").trim()].filter(Boolean).join(" · ");
}

/* Validação do tipo gravado pelo ADM em config/tipos_componente/{codigo}. */
export function validarTipoComponente(entrada) {
  const erros = [];
  const codigo = String(entrada?.codigo || "").trim().toUpperCase();
  if (!/^[A-Z0-9_]{2,40}$/.test(codigo)) erros.push("Código: 2 a 40 letras, números ou _.");
  if (VAZIO(entrada?.nome)) erros.push("Informe o nome do tipo.");
  if (!NIVEIS.includes(entrada?.nivel_embalagem)) erros.push("Nível: primária, secundária ou terciária.");
  const vistas = new Set();
  const atributos = (entrada?.atributos || []).map((a, i) => {
    const nome = String(a?.nome || "").trim();
    const chave = String(a?.chave || nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!nome) erros.push(`Atributo ${i + 1}: informe o nome.`);
    if (chave && vistas.has(chave)) erros.push(`Atributo "${nome}" repetido.`);
    vistas.add(chave);
    if (!TIPOS_DE_ATRIBUTO.includes(a?.tipo)) erros.push(`Atributo "${nome}": tipo inválido.`);
    const opcoes = [...new Set((a?.opcoes || []).map((o) => String(o).trim()).filter((o) => o && o !== OUTRO))];
    if (a?.tipo === "enum" && !opcoes.length) erros.push(`Atributo "${nome}": menu sem opções.`);
    const unidades = [...new Set((a?.unidades || []).map((u) => String(u).trim()).filter(Boolean))];
    if (a?.tipo === "numero_unidade" && !unidades.length) erros.push(`Atributo "${nome}": informe ao menos uma unidade.`);
    return { chave, nome, tipo: a?.tipo, opcoes: a?.tipo === "enum" ? opcoes : [], ...(a?.tipo === "numero_unidade" ? { unidades } : {}),
      obrigatorio: a?.obrigatorio !== false, inclui_outro: a?.tipo === "enum" };
  });
  if (!atributos.length) erros.push("Inclua ao menos um atributo.");
  return { ok: !erros.length, erros,
    tipo: { codigo, nome: String(entrada?.nome || "").trim(), nivel_embalagem: entrada?.nivel_embalagem, linha: String(entrada?.linha || "").trim(),
      ativo: entrada?.ativo !== false, atributos } };
}
