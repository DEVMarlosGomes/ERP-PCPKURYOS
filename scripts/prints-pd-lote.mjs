#!/usr/bin/env node
/* Prints P3 da manipulação em lote: painel, editor da matriz, ordem e lote manipulado, em 1440 e 390 px,
 * claro e escuro, com dados fictícios (crm-frontend/vitrine-lote.html + vite.vitrine.config.mjs).
 * Falha se houver erro de console/página ou rolagem horizontal da página.
 *   NODE_PATH=<onde está o playwright> node scripts/prints-pd-lote.mjs                    */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONT = path.join(RAIZ, "crm-frontend");
const SAIDA = path.join(RAIZ, "scripts", "artifacts", "pd-lote");
const doFront = createRequire(path.join(FRONT, "package.json"));
const { createServer } = await import(pathToFileURL(doFront.resolve("vite")).href);
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");

const CENAS = { painel: '[data-testid="painel-amostras-projeto"]', editor: '[data-testid="matriz-lote"]', adicionar: '[data-testid="linha-novo-ingrediente"]',
  "adicionar-sugestoes": '[data-testid="linha-novo-ingrediente"]', ordem: '[data-testid="pesagem-lote"]', manipulado: '[data-testid="acoes-lote"]' };
const TELAS = [[1440, 1000], [390, 844]];
mkdirSync(SAIDA, { recursive: true });
process.chdir(FRONT); // o Tailwind/PostCSS acham a config pelo diretório atual
const server = await createServer({ configFile: path.join(FRONT, "vite.vitrine.config.mjs"), root: FRONT, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const problemas = [];
try {
  for (const [cena, seletor] of Object.entries(CENAS)) {
    for (const [w, h] of TELAS) {
      for (const tema of ["claro", "escuro"]) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const erros = [];
        page.on("pageerror", (e) => erros.push(e.message));
        // "Failed to load resource" sai com a URL pelo evento de resposta; o favicon da vitrine não existe.
        page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) erros.push(m.text()); });
        page.on("response", (r) => { if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) erros.push(`${r.status()} ${r.url()}`); });
        await page.goto(`http://127.0.0.1:5179/vitrine-lote.html?cena=${cena.replace("-sugestoes", "")}${tema === "escuro" ? "&tema=dark" : ""}`);
        await page.waitForSelector(seletor, { timeout: 30000 });
        if (cena === "adicionar-sugestoes") { // como fica em uso: digitando e com as sugestões do banco abertas
          await page.fill('[data-testid="ingrediente-lote"]', "gli");
          await page.waitForSelector('[data-testid="sugestoes-ingrediente-lote"]', { timeout: 10000 });
        }
        await page.waitForTimeout(300);
        const transborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        const arquivo = path.join(SAIDA, `${cena}-${w}-${tema}.png`);
        await page.screenshot({ path: arquivo, fullPage: true });
        if (erros.length) problemas.push(`${cena} ${w} ${tema}: ${erros.join(" | ")}`);
        if (transborda) problemas.push(`${cena} ${w} ${tema}: a página rola na horizontal`);
        console.log(`  ${erros.length || transborda ? "!!" : "ok"}  ${path.relative(RAIZ, arquivo)}`);
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (problemas.length) { console.error(problemas.join("\n")); process.exit(1); }
console.log(`prints-pd-lote: ${Object.keys(CENAS).length * TELAS.length * 2} prints sem erro nem rolagem horizontal`);
