#!/usr/bin/env node
/* Prints P3 da manipulação em lote: painel, editor da matriz, ordem e lote manipulado, em 1440 e 390 px,
 * claro e escuro, com dados fictícios (crm-frontend/vitrine-lote.html + vite.vitrine.config.mjs).
 * Falha se houver erro de console/página ou rolagem horizontal da página.
 *   NODE_PATH=<onde está o playwright> node scripts/prints-pd-lote.mjs                    */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONT = path.join(RAIZ, "crm-frontend");
const SAIDA = path.join(RAIZ, "scripts", "artifacts", "pd-lote");
const doFront = createRequire(path.join(FRONT, "package.json"));
const { createServer } = await import(pathToFileURL(doFront.resolve("vite")).href);
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");

const CENAS = { dialogo: '[data-testid="matriz-lote"]', "dialogo-vazio": '[data-testid="matriz-lote"]', "dialogo-gramas": '[data-testid="matriz-lote"]', painel: '[data-testid="painel-amostras-projeto"]', editor: '[data-testid="matriz-lote"]', adicionar: '[data-testid="linha-novo-ingrediente"]',
  "adicionar-sugestoes": '[data-testid="linha-novo-ingrediente"]', ordem: '[data-testid="pesagem-lote"]', manipulado: '[data-testid="acoes-lote"]' };
const TELAS = [[1920, 960], [1440, 1000], [390, 844]];
// Em produção o crm-app.html carrega estas folhas além do bundle, o auth_check.js injeta as do sistema
// (kuryos-apple-system põe caixa alta em todo <th>) e dois scripts globais: lista-suspensa.js (redesenha
// todo <select>) e tabela-fixa.js (prende o cabeçalho e limita a altura do contêiner que rola na horizontal).
// Sem eles a vitrine não mostra o que o usuário vê (05/11/2026: matriz espremida e em caixa alta só em produção).
// Na ordem da página: as duas do crm-app.html depois do bundle, e as do auth_check.js no fim do <head>
// (o @import do kuryos-repo-visual não resolve num <style> inline, por isso o kuryos-ui-components entra antes dele).
const COMPARTILHADO = path.join(RAIZ, "public", "shared");
const CSS_PRODUCAO = ["theme.css", "crm-pd-responsive.css", "crm-pd-master-integration.css", "kuryos-apple-system.css", "kuryos-enterprise-shell.css",
  "kuryos-ui-components.css", "kuryos-repo-visual.css", "kuryos-erp-ref.css"]
  .map((f) => readFileSync(path.join(COMPARTILHADO, f), "utf8").replace(/^@import[^;]*;/gm, ""));
const JS_PRODUCAO = ["lista-suspensa.js", "tabela-fixa.js"].map((f) => readFileSync(path.join(COMPARTILHADO, f), "utf8"));
mkdirSync(SAIDA, { recursive: true });
process.chdir(FRONT); // o Tailwind/PostCSS acham a config pelo diretório atual
// Porta livre (a 5179 da config pode estar com uma vitrine aberta à mão).
const server = await createServer({ configFile: path.join(FRONT, "vite.vitrine.config.mjs"), root: FRONT, logLevel: "error", server: { port: 0, strictPort: false } });
await server.listen();
const BASE = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const problemas = [];
try {
  // PRINTS_CENAS=dialogo,editor tira só essas (iteração rápida); sem ela, todas.
  const so = (process.env.PRINTS_CENAS || "").split(",").filter(Boolean);
  for (const [cena, seletor] of Object.entries(CENAS).filter(([c]) => !so.length || so.includes(c))) {
    for (const [w, h] of TELAS) {
      for (const tema of ["claro", "escuro"]) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const erros = [];
        page.on("pageerror", (e) => erros.push(e.message));
        // "Failed to load resource" sai com a URL pelo evento de resposta; o favicon da vitrine não existe.
        page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) erros.push(m.text()); });
        page.on("response", (r) => { if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) erros.push(`${r.status()} ${r.url()}`); });
        const url = /^dialogo-(vazio|gramas)$/.test(cena) ? "dialogo&vazio=1" : cena.replace("-sugestoes", "");
        await page.goto(`${BASE}/vitrine-lote.html?cena=${url}${tema === "escuro" ? "&tema=dark" : ""}`);
        for (const css of CSS_PRODUCAO) await page.addStyleTag({ content: css });
        await page.evaluate(() => document.body.classList.add("has-sidebar"));
        for (const js of JS_PRODUCAO) await page.addScriptTag({ content: js });
        // A primeira página compila as dependências do Vite a frio (passa de 30 s com a máquina ocupada).
        await page.waitForSelector(seletor, { timeout: 120000 });
        if (cena === "adicionar-sugestoes") { // como fica em uso: digitando e com as sugestões do banco abertas
          await page.fill('[data-testid="ingrediente-lote"]', "gli");
          await page.waitForSelector('[data-testid="sugestoes-ingrediente-lote"]', { timeout: 10000 });
        }
        if (cena === "dialogo-gramas") { // 100 % sem gramas no pedido: o clique pergunta, e a conclusão grava as gramas antes da ordem
          await page.click('[data-testid="btn-gerar-ordem"]');
          await page.waitForSelector('[data-testid="gramas-lote"]', { timeout: 10000 });
          await page.fill("#g-todas", "50");
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(SAIDA, `${cena}-${w}-${tema}-pergunta.png`) });
          await page.click('[data-testid="btn-gramas-concluir"]');
          await page.waitForFunction(() => (window.__vitrineEscritas || []).some((e) => /gerar-ordem$/.test(e.url)), null, { timeout: 10000 });
          const esc = await page.evaluate(() => window.__vitrineEscritas);
          const put = esc.find((e) => e.metodo === "put");
          const gramas = Object.values(put?.body?.quantidades || {}).map((q) => q.quantidade_g);
          if (esc.findIndex((e) => e.metodo === "put") > esc.findIndex((e) => /gerar-ordem$/.test(e.url)) || gramas.length < 2 || gramas.some((g) => g !== 50)) {
            problemas.push(`${cena} ${w} ${tema}: a conclusão não gravou 50 g em cada amostra antes de gerar a ordem (${JSON.stringify(esc.map((e) => e.url))})`);
          }
        }
        await page.waitForTimeout(500); // o tabela-fixa reage ao DOM com 120 ms de atraso
        const transborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        const arquivo = path.join(SAIDA, `${cena}-${w}-${tema}.png`);
        await page.screenshot({ path: arquivo, fullPage: true });
        if (cena.startsWith("dialogo")) { // o workspace rola por dentro: um segundo print já na composição da amostra
          await page.locator('[data-testid="matriz-lote"]').scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
          await page.screenshot({ path: arquivo.replace(/\.png$/, "-composicao.png") });
        }
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
