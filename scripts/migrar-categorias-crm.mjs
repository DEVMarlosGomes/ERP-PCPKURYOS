#!/usr/bin/env node
/* CRM-01 (29/10/2026): plano de migração das categorias antigas do CRM (texto livre) para o
 * código do Cadastros. NÃO grava no Firebase: lê exportações JSON e escreve o update em
 * caminhos planos, para aplicar com a CLI depois do backup e de UM registro conferido:
 *
 *   firebase database:get /config/categoriasProduto --project erpkuryos > cats.json
 *   firebase database:get /erp/kuryos/crm_projects  --project erpkuryos > projetos.json
 *   firebase database:get /erp/kuryos/crm_clients   --project erpkuryos > clientes.json
 *   firebase database:get /erp/kuryos/crm_samples   --project erpkuryos > amostras.json
 *   node scripts/migrar-categorias-crm.mjs cats.json projetos.json clientes.json amostras.json > plano.json
 *   firebase database:update / plano.updates.json --project erpkuryos   (caminhos planos)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { categoriasAtivas, planoMigracaoCategorias } from "../crm-frontend/src/lib/categoriasProduto.js";

const [cats, projetos, clientes, amostras] = process.argv.slice(2);
if (!cats || !projetos || !clientes || !amostras) {
  console.error("uso: node scripts/migrar-categorias-crm.mjs cats.json projetos.json clientes.json amostras.json");
  process.exit(2);
}
const ler = (f) => JSON.parse(readFileSync(f, "utf8") || "null") || {};
const plano = planoMigracaoCategorias(
  { projetos: ler(projetos), clientes: ler(clientes), amostras: ler(amostras) },
  categoriasAtivas(ler(cats)),
);
writeFileSync(1, JSON.stringify(plano, null, 2) + "\n");
console.error(`${Object.keys(plano.updates).length} caminhos a atualizar; ${plano.naoResolvidos.length} valores sem categoria (decisão humana).`);
