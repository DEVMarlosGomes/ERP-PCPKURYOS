import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const replacements = [
  ["AIzaSyAKfI4MTbydlskdg5lMuvESfLIBhlPwQdw", "AIzaSyBvASzcbKyv3uW7NBzDFDyLsKls3An3UUs"],
  ["1:323674581733:web:e283a491c0c2bd6025420c", "1:272752392739:web:047a6c4aa60145d77f4f96"],
  ["323674581733", "272752392739"],
  ["prod-kuryos", "erpkuryos"],
];

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

let changed = 0;
for (const path of await files(publicDir)) {
  if (![".html", ".js"].includes(extname(path))) continue;
  const original = await readFile(path, "utf8");
  let next = original;
  for (const [from, to] of replacements) next = next.split(from).join(to);
  if (next === original) continue;
  await writeFile(path, next, "utf8");
  changed += 1;
}

console.log(`${changed} arquivos do frontend apontados para o Firebase erpkuryos.`);
