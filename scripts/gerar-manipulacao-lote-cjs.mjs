#!/usr/bin/env node
/* Gera functions/manipulacao_lote_motor.js (CommonJS) a partir de crm-frontend/src/lib/manipulacaoLote.js.
 *
 * O servidor (functions/manipulacao_lote.js) aplica ao gerar a ordem as MESMAS regras puras do editor
 * do lote (elegibilidade, classificação, pendências, ordem, assinatura, conciliação). Em vez de uma
 * cópia mantida à mão, a cópia é a saída deste script; o contrato
 * (crm-frontend/src/lib/manipulacaoLote.contrato.test.js) falha se ela não for.
 *   node scripts/gerar-manipulacao-lote-cjs.mjs                                              */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FONTE = new URL("../crm-frontend/src/lib/manipulacaoLote.js", import.meta.url);
export const DESTINO = new URL("../functions/manipulacao_lote_motor.js", import.meta.url);

const CABECALHO = `/* GERADO por scripts/gerar-manipulacao-lote-cjs.mjs a partir de crm-frontend/src/lib/manipulacaoLote.js.
 * NÃO EDITE: mude o motor do CRM e rode o script (o contrato no Vitest cai se divergir). */
`;

export function gerarCjs(fonte) {
  const nomes = [];
  let corpo = String(fonte).replace(/\r\n/g, "\n")
    .replace(/^import \{ fechamentoFormula \} from "\.\/fechamentoFormula";$/m, 'const { fechamentoFormula } = require("./fechamento-formula");');
  if (/^import /m.test(corpo)) throw new Error("O motor ganhou um import novo: ensine o gerador a traduzi-lo para require().");
  corpo = corpo.replace(/^export (async function|function|const) ([A-Za-z0-9_$]+)/gm, (_, tipo, nome) => { nomes.push(nome); return `${tipo} ${nome}`; });
  if (/^export /m.test(corpo)) throw new Error("O motor tem um export em formato que o gerador não traduz.");
  return `${CABECALHO}"use strict";\n${corpo.trimEnd()}\n\nmodule.exports = { ${nomes.join(", ")} };\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(DESTINO, gerarCjs(readFileSync(FONTE, "utf8")));
  console.log(`gerado ${fileURLToPath(DESTINO)}`);
}
