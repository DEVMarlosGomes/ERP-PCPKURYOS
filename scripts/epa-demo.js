"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const {renderPreview} = require("../functions/epa-preview");
const {fixture} = require("../functions/test/fixtures/epa");
async function main() {
  const output = path.resolve(__dirname, "../scratch/epa-demo/epa-demonstracao.pdf");
  const {spec, occurrence} = fixture();
  const pdf = await renderPreview(spec, occurrence);
  await fs.mkdir(path.dirname(output), {recursive: true});
  await fs.writeFile(output, pdf);
  console.log("Prévia sintética, NÃO libera produção: " + output);
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
