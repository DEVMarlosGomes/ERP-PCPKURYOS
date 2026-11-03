"use strict";
const PDFDocument = require("pdfkit");
const {snapshot, validate} = require("./epa");

// Somente prévia. Não há opção de remover a marca nem de liberar uma OP.
function renderPreview(spec, occurrence = null) {
  const safe = snapshot(spec, occurrence), check = validate(spec, occurrence);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({size: "A4", margin: 42, bufferPages: true,
      info: {Title: "EPA — RASCUNHO — NÃO LIBERA PRODUÇÃO", Author: "Kuryos — prévia local"}});
    const chunks = []; doc.on("data", chunk => chunks.push(chunk)); doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const width = 511;
    const header = () => {
      doc.fillColor("#172e45").font("Helvetica-Bold").fontSize(16).text("KURYOS | EPA", 42, 38);
      doc.fontSize(9).text("RASCUNHO — NÃO LIBERA PRODUÇÃO", 42, 62);
      doc.fillColor("#444444").font("Helvetica").fontSize(8).text("Prévia local | " + safe.templateVersion + " | Revisões conforme fontes", 42, 78);
      doc.y = 102;
    };
    header();
    function space(height) { if (doc.y + height > 768) { doc.addPage(); header(); } }
    function paragraph(value, bold = false) {
      const content = String(value ?? "Não informado");
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10);
      // Divide textos extensos em linhas antes de paginar para não cortar blocos.
      const words = content.match(/.{1,82}(?:\s|$)|.{1,82}/g) || [content];
      const height = words.reduce((sum, line) => sum + doc.heightOfString(line.trim(), {width, lineGap: 2}), 4);
      if (height < 600) space(height);
      for (const line of words) { space(18); doc.text(line.trim(), 42, doc.y, {width, lineGap: 2}); }
      doc.y += 4;
    }
    function title(value) { space(100); doc.y += 10; paragraph(value, true); }
    paragraph(safe.product.name, true);
    paragraph("Cliente: " + safe.customer.name + " | Marca: " + safe.customer.brand);
    paragraph("CNPJ/identificação: " + safe.customer.taxId);
    paragraph("Categoria: " + safe.product.category + " | Forma: " + safe.product.physicalForm);
    paragraph("Conteúdo: " + safe.product.amount + " " + safe.product.unit + " | NCM: " + safe.product.ncm);
    paragraph("OP: " + (safe.occurrence?.opId || "Não vinculada") + " | Pedido: " + (safe.occurrence?.orderId || "Não vinculado"));
    title("1. Grade de variantes");
    safe.variants.forEach(v => {
      space(115);
      paragraph(v.sku + " — " + v.name, true);
      paragraph("Fórmula: " + v.formulaId + " / " + v.formulaRevision + " | Unidades/master: " + v.unitsPerMaster);
      paragraph("GTIN unitário: " + v.gtin + " | GTIN master: " + v.masterGtin);
      const line = safe.occurrence?.variants.find(line => line.sku === v.sku);
      paragraph(line ? "Lote: " + line.lot + " | Fabricação: " + line.manufacturedAt + " | Validade: " + line.expiresAt : "Lote/validade/quantidade ainda não definidos para esta produção.");
      if (line) paragraph("Quantidade: " + line.quantity + " " + line.unit + " | Peso master: " + line.masterWeightKg + " kg");
      paragraph("Regularização: " + (v.regulatory?.applicable === false ? "Não aplicável — " + v.regulatory.justification : v.regulatory?.value || "Pendente"));
    });
    title("2. Componentes e aplicabilidade");
    safe.components.forEach(c => {
      paragraph(c.materialCode + " — " + c.description, true);
      paragraph(c.specification);
      paragraph("Revisão: " + c.revision + " | Fornecido por: " + c.owner + " | Consumo: " + c.quantity + " " + c.unit);
      paragraph("Variantes: " + (c.skus || []).join(", "));
    });
    paragraph("Imagens: esta prévia não incorpora ativos externos. A emissão final depende de ativos aprovados, versionados e preservados.");
    title("3. Enchimento e gravação");
    paragraph("Declarado: " + safe.fill.declared + " " + safe.fill.unit + " | Máximo: " + safe.fill.maximum + " " + safe.fill.unit);
    paragraph(safe.marking.applicable === false ? "Gravação não aplicável: " + safe.marking.justification : safe.marking.value || "Gravação pendente");
    title("4. Controle e pendências");
    paragraph("SEM APROVAÇÃO / SEM EMISSÃO FINAL. Este arquivo não é etiqueta master; não contém símbolo de código de barras para impressão industrial.", true);
    if (!check.pending.length) paragraph("Campos do contrato local preenchidos. Isso não comprova estoque, autorização, política de aprovação nem liberação industrial.");
    check.pending.forEach(p => paragraph(p.codigo + " | " + p.campo + " | " + p.responsavel + ": " + p.mensagem));
    Object.entries(safe.sources).forEach(([type, source]) => paragraph(type + ": " + source.id + " / " + source.revision));
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(8).fillColor("#444444").text("RASCUNHO — NÃO LIBERA PRODUÇÃO | Página " + (i + 1) + " de " + range.count, 42, 782, {width, lineBreak: false});
    }
    doc.end();
  });
}
module.exports = {renderPreview};
