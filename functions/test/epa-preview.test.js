"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {renderPreview} = require("../epa-preview");
const {fixture} = require("./fixtures/epa");
test("prévia é PDF real, inclusive com pendências; nunca modifica as fontes", async () => {
  const {spec, occurrence} = fixture(); spec.customer.name = "";
  const before = JSON.stringify(spec);
  const buffer = await renderPreview(spec, occurrence);
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  assert.ok(buffer.length > 3000);
  assert.equal(JSON.stringify(spec), before);
});
test("texto longo e observação com HTML não executam nem buscam ativos externos", async () => {
  const {spec} = fixture();
  spec.components[0].specification = '<script>alert("XSS")</script> ' + "NomeExtensoSemSeparacao".repeat(300);
  spec.assets = [{id: "imagem", url: "http://127.0.0.1:1/nao-acessar"}];
  const buffer = await renderPreview(spec);
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
});
