/* CAD-01 (22/10/2026): monta o índice materiais_chave a partir dos materiais ativos.
 *
 * Uso: node scripts/backfill-materiais-chave.js <materiais.json> <saida-update.json> [--um]
 *   materiais.json = cópia de /materiais (npx firebase-tools database:get /materiais)
 *   saída = update por CAMINHOS PLANOS ("materiais_chave/<chave>": "<material>") para
 *           npx firebase-tools database:update / <saida> --project erpkuryos
 *   --um  = só a primeira chave (rodar em UM registro, conferir, depois o resto).
 * O dono de cada chave tipo+nome é o menor código ativo (shared/duplicidade-material.js:indiceInicial);
 * os demais do mesmo grupo (duplicatas antigas) ficam sem chave e vão para a lista de revisão.
 * Idempotente: rodar de novo gera o mesmo update. Não grava nada sozinho. */
const fs = require('fs');
const path = require('path');
const D = require(path.join(__dirname, '..', 'public', 'shared', 'duplicidade-material.js'));

const [, , entrada, saida, flag] = process.argv;
if (!entrada || !saida) { console.error('uso: node scripts/backfill-materiais-chave.js <materiais.json> <saida.json> [--um]'); process.exit(1); }
const materiais = JSON.parse(fs.readFileSync(entrada, 'utf8')) || {};
const donos = D.indiceInicial(materiais);
const chaves = Object.keys(donos).sort();
const proibido = chaves.filter((k) => /[.#$/[\]\x00-\x1f\x7f]/.test(k));
if (proibido.length) { console.error('chaves com caractere proibido no RTDB:', proibido); process.exit(1); }
const usar = flag === '--um' ? chaves.slice(0, 1) : chaves;
const update = Object.fromEntries(usar.map((k) => [`materiais_chave/${k}`, donos[k]]));
fs.writeFileSync(saida, JSON.stringify(update, null, 2));

const ativos = Object.entries(materiais).filter(([, m]) => m && m.ativo !== false && D.normalizar(m.mpNome));
const semChave = ativos.filter(([k, m]) => donos[D.chaveMaterial(m.tipo, m.mpNome)] !== k);
console.log(`materiais: ${Object.keys(materiais).length} · ativos com nome: ${ativos.length} · chaves: ${chaves.length} · no update: ${usar.length}`);
console.log(`duplicatas antigas sem chave (revisão do Cadastros): ${semChave.length}`);
semChave.forEach(([k, m]) => console.log(`  ${k} ${m.mpNome} → chave de ${donos[D.chaveMaterial(m.tipo, m.mpNome)]}`));
